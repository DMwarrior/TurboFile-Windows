/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITurboFileBatchTransferFailure, ITurboFileBatchTransferResult, ITurboFileTransferAttempt, ITurboFileTransferResult } from './turbofile.js';
import { TurboFileDirectDataError, TurboFileDirectUnavailableError } from './turbofileDirectRoute.js';
import { classifyTurboFileTransferFailure, shouldContinueTurboFileTransferPlan } from './turbofileTransferFailure.js';

export interface ITurboFileBatchTransferFlowOptions {
	readonly attempts: readonly ITurboFileTransferAttempt[];
	readonly operation: 'copy' | 'move';
	readonly totalItems: number;
	readonly runAttempt: (attempt: ITurboFileTransferAttempt, index: number) => Promise<ITurboFileBatchTransferResult | undefined>;
	readonly cleanupSources: () => Promise<readonly ITurboFileBatchTransferFailure[]>;
	readonly createCleanupFailureResult: (result: ITurboFileBatchTransferResult, failures: readonly ITurboFileBatchTransferFailure[]) => ITurboFileBatchTransferResult;
	readonly onIncompleteResult: (result: ITurboFileBatchTransferResult) => void;
	readonly onAttemptError: (error: Error, attempt: ITurboFileTransferAttempt, nextAttempt: ITurboFileTransferAttempt | undefined) => void;
	readonly shouldContinueAfterError?: (error: Error, attempt: ITurboFileTransferAttempt) => boolean;
}

export interface ITurboFileConcurrentBatchAttemptController {
	recordResult(result: ITurboFileTransferResult): void;
	captureDirectError(error: unknown): boolean;
}

export interface ITurboFileConcurrentBatchAttemptOptions {
	readonly fallbackStrategy: ITurboFileBatchTransferResult['strategy'];
	readonly run: (controller: ITurboFileConcurrentBatchAttemptController) => Promise<void>;
}

export async function runTurboFileBatchTransferFlow(options: ITurboFileBatchTransferFlowOptions): Promise<ITurboFileBatchTransferResult | undefined> {
	for (const [index, attempt] of options.attempts.entries()) {
		let result: ITurboFileBatchTransferResult | undefined;
		try {
			result = await options.runAttempt(attempt, index);
		} catch (error) {
			const typedError = error instanceof Error ? error : new Error(String(error));
			const shouldContinue = options.shouldContinueAfterError?.(typedError, attempt)
				?? shouldContinueTurboFileTransferPlan(classifyTurboFileTransferFailure(typedError));
			options.onAttemptError(typedError, attempt, shouldContinue ? options.attempts[index + 1] : undefined);
			if (!shouldContinue) {
				throw typedError;
			}
			continue;
		}
		if (!result) {
			continue;
		}
		if (!result.ok && result.completed !== options.totalItems) {
			options.onIncompleteResult(result);
			if (!shouldContinueAfterIncompleteResult(result)) {
				return result;
			}
			continue;
		}
		if (!result.ok || options.operation === 'copy') {
			return result;
		}
		const cleanupFailures = await options.cleanupSources();
		return cleanupFailures.length ? options.createCleanupFailureResult(result, cleanupFailures) : result;
	}
	return undefined;
}

function shouldContinueAfterIncompleteResult(result: ITurboFileBatchTransferResult): boolean {
	const messages = result.failures.length ? result.failures.map(failure => failure.message) : [result.message];
	return messages.every(message => shouldContinueTurboFileTransferPlan(classifyTurboFileTransferFailure(new Error(message))));
}

export async function runTurboFileConcurrentBatchAttempt(options: ITurboFileConcurrentBatchAttemptOptions): Promise<ITurboFileBatchTransferResult['strategy']> {
	let strategy: ITurboFileBatchTransferResult['strategy'] | undefined;
	let unavailableError: TurboFileDirectUnavailableError | undefined;
	let dataError: TurboFileDirectDataError | undefined;
	await options.run({
		recordResult: result => {
			if (result.ok) {
				strategy ??= result.strategy;
			}
		},
		captureDirectError: error => {
			if (error instanceof TurboFileDirectDataError) {
				if (!dataError || shouldPreferDirectDataError(error, dataError)) {
					dataError = error;
				}
				return true;
			}
			if (error instanceof TurboFileDirectUnavailableError) {
				unavailableError ??= error;
				return true;
			}
			return false;
		}
	});
	if (dataError) {
		throw dataError;
	}
	if (unavailableError) {
		throw unavailableError;
	}
	return strategy ?? options.fallbackStrategy;
}

function shouldPreferDirectDataError(candidate: TurboFileDirectDataError, current: TurboFileDirectDataError): boolean {
	const candidateFailure = classifyTurboFileTransferFailure(candidate);
	const currentFailure = classifyTurboFileTransferFailure(current);
	return !candidateFailure.retryable && currentFailure.retryable;
}
