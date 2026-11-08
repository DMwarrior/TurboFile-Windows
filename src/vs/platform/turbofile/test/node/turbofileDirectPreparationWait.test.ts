/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as ts from 'typescript';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ITurboFileTransferAttempt, ITurboFileTransferEndpoint } from '../../common/turbofile.js';
import { withTurboFileTimeout } from '../../common/turbofileTimeout.js';

interface IHarness {
	readonly routes: Set<string>;
	readonly unavailable: Set<string>;
	readonly pending: Map<string, DeferredPromise<void>>;
	readonly transferCancelHandlers: Map<string, Set<() => void>>;
	readonly transferCancellationRequests: Set<string>;
	probeCalls: number;
	resolveOrPrepareDirectAttempts(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint, attempts: readonly ITurboFileTransferAttempt[], inherited?: undefined, progressId?: string): Promise<{ attempt: ITurboFileTransferAttempt }[]>;
}

/** Run the actual resolver, protocol filters and cancellation wait with controlled SSH proofs. */
function createHarness(): IHarness {
	const file = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['resolveOrPrepareDirectAttempts', 'resolvePreparedDirectAttempts', 'resolvePreparedDirectScpRoute', 'waitForTransferSession', 'registerTransferCancelHandler', 'throwIfTransferCanceled', 'isTransferCanceled']);
	const functions = new Set(['getPreparedDirectRouteProtocol', 'isPreparedDirectRouteProtocolSupported', 'looksLikeWindowsPath']);
	const methods: string[] = [];
	const declarations: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && names.has(node.name.getText(source))) {
			methods.push(node.getText(source));
		} else if (ts.isFunctionDeclaration(node) && node.name && functions.has(node.name.text)) {
			declarations.push(node.getText(source));
		} else if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'DIRECT_SCP_PROBE_BACKGROUND_TIMEOUT_MS') {
			declarations.push(`const ${node.getText(source)};`);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.strictEqual(methods.length, names.size);
	assert.strictEqual(declarations.length, functions.size + 1);
	const code = ts.transpileModule(`
		${declarations.join('\n')}
		class TurboFileTransferCanceledError extends Error {}
		class Harness {
			routes = new Set(); unavailable = new Set(); pending = new Map(); probeCalls = 0;
			transferCancelHandlers = new Map(); transferCancellationRequests = new Set(); recentlyCanceledTransfers = new Map();
			getCachedDirectScpProbeRouteSnapshot(source, target, protocol) { return this.routes.has(protocol) ? { route: 'source-push', generation: 1 } : undefined; }
			getCachedDirectScpProbeUnavailable(source, target, protocol) { return this.unavailable.has(protocol); }
			getOrStartDirectScpProbePair(source, target, protocol) {
				let pending = this.pending.get(protocol);
				if (!pending) { this.probeCalls++; pending = new DeferredPromise(); this.pending.set(protocol, pending); }
				return pending.p;
			}
			${methods.join('\n')}
		}
	`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IHarness = new Function('DeferredPromise', 'withTurboFileTimeout', `${code}; return Harness;`)(DeferredPromise, withTurboFileTimeout);
	return new Harness();
}

const source: ITurboFileTransferEndpoint = { kind: 'ssh', path: '/source', connection: { host: 'source', port: 22, username: 'user' } };
const target: ITurboFileTransferEndpoint = { kind: 'ssh', path: '/target', connection: { host: 'target', port: 22, username: 'user' } };
const attempts: ITurboFileTransferAttempt[] = [{ protocol: 'scp', route: 'direct', reason: 'test' }, { protocol: 'sftp', route: 'direct', reason: 'test' }];

suite('TurboFileDirectPreparationWait', () => {
	let clock: sinon.SinonFakeTimers;
	setup(() => { clock = sinon.useFakeTimers(); });
	teardown(() => clock.restore());

	test('cold authentication taking longer than 800ms still selects direct for the first transfer', async () => {
		const service = createHarness();
		let finished = false;
		const result = service.resolveOrPrepareDirectAttempts(source, target, attempts).then(value => { finished = true; return value; });
		await clock.tickAsync(1200);
		assert.strictEqual(finished, false, 'An unfinished proof is not a relay decision');
		service.routes.add('sftp');
		service.pending.get('sftp')!.complete();
		assert.deepStrictEqual((await result).map(value => value.attempt.protocol), ['sftp']);
		assert.strictEqual(clock.now, 1200, 'A proven fallback protocol must not wait for another hanging protocol');
		assert.strictEqual(clock.countTimers(), 0);
		service.pending.get('scp')!.complete();
	});

	test('cached direct and confirmed relay decisions do not start or wait for probes', async () => {
		const service = createHarness();
		service.routes.add('scp');
		assert.strictEqual((await service.resolveOrPrepareDirectAttempts(source, target, attempts)).length, 1);
		service.routes.clear();
		service.unavailable.add('scp');
		service.unavailable.add('sftp');
		assert.deepStrictEqual(await service.resolveOrPrepareDirectAttempts(source, target, attempts), []);
		assert.strictEqual(service.probeCalls, 0);
		assert.strictEqual(clock.countTimers(), 0);
	});

	test('conclusive failures return immediately, while an indeterminate hanging proof has a 5s bound', async () => {
		const service = createHarness();
		const result = service.resolveOrPrepareDirectAttempts(source, target, attempts);
		for (const [protocol, pending] of service.pending) {
			service.unavailable.add(protocol);
			pending.complete();
		}
		assert.deepStrictEqual(await result, []);
		assert.strictEqual(clock.now, 0);
		assert.strictEqual(clock.countTimers(), 0);
		const hanging = createHarness();
		let finished = false;
		const deadline = hanging.resolveOrPrepareDirectAttempts(source, target, attempts).then(value => { finished = true; return value; });
		await clock.tickAsync(4999);
		assert.strictEqual(finished, false);
		await clock.tickAsync(1);
		assert.deepStrictEqual(await deadline, []);
		assert.strictEqual(clock.countTimers(), 0);
		hanging.routes.add('sftp');
		hanging.pending.get('sftp')!.complete();
		assert.strictEqual((await hanging.resolveOrPrepareDirectAttempts(source, target, attempts)).length, 1, 'A late proof still benefits the next transfer');
		hanging.pending.get('scp')!.complete();
	});

	test('canceling one waiter immediately releases it without canceling the shared proof or other waiter', async () => {
		const service = createHarness();
		const first = service.resolveOrPrepareDirectAttempts(source, target, attempts, undefined, 'first');
		const rejected = assert.rejects(first);
		const second = service.resolveOrPrepareDirectAttempts(source, target, attempts, undefined, 'second');
		await clock.tickAsync(300);
		service.transferCancellationRequests.add('first');
		for (const cancel of service.transferCancelHandlers.get('first') ?? []) { cancel(); }
		await rejected;
		assert.strictEqual(service.transferCancelHandlers.has('first'), false);
		assert.strictEqual(service.pending.get('sftp')!.isSettled, false);
		assert.strictEqual(service.probeCalls, 2, 'Two foreground requests share one probe per protocol');
		await clock.tickAsync(900);
		service.routes.add('sftp');
		service.pending.get('sftp')!.complete();
		assert.strictEqual((await second).length, 1);
		assert.strictEqual(service.transferCancelHandlers.size, 0);
		assert.strictEqual(clock.countTimers(), 0);
		service.pending.get('scp')!.complete();
	});
});
