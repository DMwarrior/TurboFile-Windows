/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as http from 'http';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IRawRequestFunction, lookupKerberosAuthorization, nodeRequest } from '../../node/requestService.js';
import { isWindows } from '../../../../base/common/platform.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';

suite('Request Service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function withDownloadServer(run: (url: string, closed: Promise<void>) => Promise<void>): Promise<void> {
		const closed = new DeferredPromise<void>();
		const chunk = Buffer.alloc(64 * 1024, 1);
		const server = http.createServer((_request, response) => {
			response.writeHead(200);
			let blocked = false;
			response.on('drain', () => { blocked = false; });
			const timer = setInterval(() => { if (!blocked) { blocked = !response.write(chunk); } }, 2);
			response.once('close', () => { clearInterval(timer); closed.complete(); });
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		try {
			await run(`http://127.0.0.1:${address.port}/download`, closed.p);
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	}

	test('streaming download cancellation closes the HTTP response after headers', async () => {
		await withDownloadServer(async (url, closed) => {
			const source = store.add(new CancellationTokenSource());
			const context = await nodeRequest({ url, streamResponse: true, callSite: 'requestService.test.streamCancellation' }, source.token);
			const first = new DeferredPromise<void>();
			const failure = new DeferredPromise<Error>();
			context.stream.on('error', error => failure.complete(error));
			context.stream.on('data', () => first.complete());
			await first.p;
			source.cancel();
			await closed;
			assert.ok(await failure.p instanceof CancellationError);
		});
	});

	test('destroying a streaming download aborts its HTTP connection', async () => {
		await withDownloadServer(async (url, closed) => {
			const context = await nodeRequest({ url, streamResponse: true, callSite: 'requestService.test.streamDestroy' }, CancellationToken.None);
			context.stream.destroy();
			await closed;
		});
	});

	test('streaming download retains cancellation errors until the consumer subscribes', async () => {
		await withDownloadServer(async (url, closed) => {
			const source = store.add(new CancellationTokenSource());
			const context = await nodeRequest({ url, streamResponse: true, callSite: 'requestService.test.streamEarlyCancellation' }, source.token);
			source.cancel();
			await timeout(0);
			const failure = new DeferredPromise<Error>();
			context.stream.on('error', error => failure.complete(error));
			await closed;
			assert.ok(await failure.p instanceof CancellationError);
		});
	});

	test('streaming download pause reaches the HTTP response and bounds its buffer', async () => {
		await withDownloadServer(async (url, closed) => {
			let response: http.IncomingMessage | undefined;
			const rawRequest: IRawRequestFunction = (options, callback) => http.request(options, incoming => { response = incoming; callback?.(incoming); });
			const context = await nodeRequest({ url, streamResponse: true, getRawRequest: () => rawRequest, callSite: 'requestService.test.streamPause' }, CancellationToken.None);
			const paused = new DeferredPromise<void>();
			const resumed = new DeferredPromise<void>();
			let chunks = 0;
			context.stream.on('error', () => { });
			context.stream.on('data', () => {
				if (++chunks === 1) { context.stream.pause(); paused.complete(); }
				else { resumed.complete(); }
			});
			await paused.p;
			await timeout(100);
			assert.deepStrictEqual({ chunks, paused: response?.isPaused(), bounded: (response?.readableLength ?? Infinity) <= 128 * 1024 }, { chunks: 1, paused: true, bounded: true });
			context.stream.resume();
			await resumed.p;
			context.stream.destroy();
			await closed;
		});
	});

	// Kerberos module fails to load on local macOS and Linux CI.
	(isWindows ? test : test.skip)('Kerberos lookup', async () => {
		try {
			const logService = store.add(new NullLogService());
			const response = await lookupKerberosAuthorization('http://localhost:9999', undefined, logService, 'requestService.test.ts');
			assert.ok(response);
		} catch (err) {
			assert.ok(
				err?.message?.includes('No authority could be contacted for authentication')
				|| err?.message?.includes('No Kerberos credentials available')
				|| err?.message?.includes('No credentials are available in the security package')
				|| err?.message?.includes('no credential for')
				, `Unexpected error: ${err}`);
		}
	});

	test('Request cancellation during retry backoff', async () => {
		const cts = store.add(new CancellationTokenSource());
		const startTime = Date.now();
		setTimeout(() => cts.cancel(), 50);

		try {
			await nodeRequest({ url: 'http://localhost:9999/nonexistent', callSite: 'requestService.test.cancellation' }, cts.token);
			assert.fail('Request should have been cancelled');
		} catch (err) {
			const elapsed = Date.now() - startTime;
			assert.ok(err instanceof CancellationError, 'Error should be CancellationError');
			assert.ok(elapsed < 200, `Request should be cancelled quickly, but took ${elapsed}ms`);
		}
	});

	test('should retry GET requests on transient errors', async () => {
		let attemptCount = 0;
		const mockRawRequest = (_opts: any, callback: Function) => {
			attemptCount++;
			const currentAttempt = attemptCount;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error' && currentAttempt < 3) {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => {
					if (currentAttempt >= 3) {
						// Succeed on third attempt by calling the response callback
						setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => { }, pipe: () => ({ on: () => { } }) }), 0);
					}
				},
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'GET',
				getRawRequest: () => mockRawRequest as IRawRequestFunction,
				callSite: 'requestService.test.retryGET'
			}, CancellationToken.None);
		} catch (err) {
			// Expected to eventually succeed or fail after retries
		}

		assert.ok(attemptCount > 1, 'GET request should have been retried');
	});

	test('should NOT retry POST requests', async () => {
		let attemptCount = 0;
		const mockRawRequest = () => {
			attemptCount++;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error') {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => { },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'POST',
				getRawRequest: () => mockRawRequest,
				callSite: 'requestService.test.noRetryPOST'
			}, CancellationToken.None);
			assert.fail('Should have thrown an error');
		} catch (err) {
			assert.ok(err instanceof Error);
		}

		assert.strictEqual(attemptCount, 1, 'POST request should not have been retried');
	});

	test('should retry HEAD requests on transient errors', async () => {
		let attemptCount = 0;
		const mockRawRequest = (_opts: any, callback: Function) => {
			attemptCount++;
			const currentAttempt = attemptCount;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error' && currentAttempt < 3) {
						const err = new Error('Host unreachable') as NodeJS.ErrnoException;
						err.code = 'EHOSTUNREACH';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => {
					if (currentAttempt >= 3) {
						setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => { }, pipe: () => ({ on: () => { } }) }), 0);
					}
				},
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'HEAD',
				getRawRequest: () => mockRawRequest as IRawRequestFunction,
				callSite: 'requestService.test.retryHEAD'
			}, CancellationToken.None);
		} catch (err) {
			// Expected to eventually succeed or fail after retries
		}

		assert.ok(attemptCount > 1, 'HEAD request should have been retried');
	});

	test('should retry OPTIONS requests on transient errors', async () => {
		let attemptCount = 0;
		const mockRawRequest = (_opts: any, callback: Function) => {
			attemptCount++;
			const currentAttempt = attemptCount;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error' && currentAttempt < 3) {
						const err = new Error('Network unreachable') as NodeJS.ErrnoException;
						err.code = 'ENETUNREACH';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => {
					if (currentAttempt >= 3) {
						setTimeout(() => callback({ statusCode: 200, headers: {}, on: () => { }, pipe: () => ({ on: () => { } }) }), 0);
					}
				},
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'OPTIONS',
				getRawRequest: () => mockRawRequest as IRawRequestFunction,
				callSite: 'requestService.test.retryOPTIONS'
			}, CancellationToken.None);
		} catch (err) {
			// Expected to eventually succeed or fail after retries
		}

		assert.ok(attemptCount > 1, 'OPTIONS request should have been retried');
	});

	test('should NOT retry DELETE requests', async () => {
		let attemptCount = 0;
		const mockRawRequest = () => {
			attemptCount++;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error') {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => { },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'DELETE',
				getRawRequest: () => mockRawRequest,
				callSite: 'requestService.test.noRetryDELETE'
			}, CancellationToken.None);
			assert.fail('Should have thrown an error');
		} catch (err) {
			assert.ok(err instanceof Error);
		}

		assert.strictEqual(attemptCount, 1, 'DELETE request should not have been retried');
	});

	test('should NOT retry PUT requests', async () => {
		let attemptCount = 0;
		const mockRawRequest = () => {
			attemptCount++;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error') {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => { },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'PUT',
				getRawRequest: () => mockRawRequest,
				callSite: 'requestService.test.noRetryPUT'
			}, CancellationToken.None);
			assert.fail('Should have thrown an error');
		} catch (err) {
			assert.ok(err instanceof Error);
		}

		assert.strictEqual(attemptCount, 1, 'PUT request should not have been retried');
	});

	test('should NOT retry PATCH requests', async () => {
		let attemptCount = 0;
		const mockRawRequest = () => {
			attemptCount++;
			const mockReq: any = {
				on: (event: string, handler: Function) => {
					if (event === 'error') {
						const err = new Error('Connection refused') as NodeJS.ErrnoException;
						err.code = 'ECONNREFUSED';
						setTimeout(() => handler(err), 0);
					}
				},
				end: () => { },
				abort: () => { },
				setTimeout: () => { }
			};
			return mockReq;
		};

		try {
			await nodeRequest({
				url: 'http://example.com',
				type: 'PATCH',
				getRawRequest: () => mockRawRequest,
				callSite: 'requestService.test.noRetryPATCH'
			}, CancellationToken.None);
			assert.fail('Should have thrown an error');
		} catch (err) {
			assert.ok(err instanceof Error);
		}

		assert.strictEqual(attemptCount, 1, 'PATCH request should not have been retried');
	});
});
