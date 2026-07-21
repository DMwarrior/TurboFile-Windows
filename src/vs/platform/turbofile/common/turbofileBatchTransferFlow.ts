/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITurboFileBatchTransferFailure, ITurboFileBatchTransferResult, ITurboFileTransferAttempt, ITurboFileTransferResult } from './turbofile.js';
import { TurboFileDirectDataError, TurboFileDirectUnavailableError } from './turbofileDirectRoute.js';

export interface ITurboFileBatchTransferFlowOptions {
	readonly attempts: readonly ITurboFileTransferAttempt[];
	readonly operation: 'copy' | 'move';
	readonly totalItems: number;
	readonly runAttempt: (attempt: ITurboFileTransferAttempt, index: number) => Promise<ITurboFileBatchTransferResult | undefined>;
	readonly cleanupSources: () => Promise<readonly ITurboFileBatchTransferFailure[]>;
	readonly createCleanupFailureResult: (result: ITurboFileBatchTransferResult, failures: readonly ITurboFileBatchTransferFailure[]) => ITurboFileBatchTransferResult;
	readonly onIncompleteResult: (result: ITurboFileBatchTransferResult) => void;
	readonly onAttemptError: (error: Error, attempt: ITurboFileTransferAttempt, nextAttempt: ITurboFileTransferAttempt | undefined) => void;
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
			options.onAttemptError(error, attempt, options.attempts[index + 1]);
			continue;
		}
		if (!result) {
			continue;
		}
		if (!result.ok && result.completed !== options.totalItems) {
			options.onIncompleteResult(result);
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
				dataError ??= error;
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
