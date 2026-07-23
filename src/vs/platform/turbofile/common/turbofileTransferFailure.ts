/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITurboFileTransferProgressEvent, ITurboFileTransferResult, TurboFileTransferAttemptProtocol } from './turbofile.js';
import { TurboFileDirectDataError, TurboFileDirectUnavailableError } from './turbofileDirectRoute.js';

export type TurboFileTransferFailureCategory = 'canceled' | 'authentication' | 'permission' | 'conflict' | 'no-space' | 'protocol-unavailable' | 'direct-unavailable' | 'network-transient' | 'integrity' | 'unknown';
export type TurboFileTransferProgressState = 'queued' | 'preparing' | 'transferring' | 'fallback' | 'completed' | 'failed' | 'canceled';
export type TurboFileTransferProtocolName = 'native' | TurboFileTransferAttemptProtocol;

export interface ITurboFileTransferFailure {
	readonly category: TurboFileTransferFailureCategory;
	readonly retryable: boolean;
	readonly reduceConcurrency: boolean;
}

export function classifyTurboFileTransferFailure(error: unknown): ITurboFileTransferFailure {
	if (error instanceof TurboFileDirectUnavailableError || getErrorName(error) === 'TurboFileDirectUnavailableError') {
		return failure('direct-unavailable', true, false);
	}
	if (error instanceof TurboFileDirectDataError && error.transferCause !== undefined) {
		const causeFailure = classifyTurboFileTransferFailure(error.transferCause);
		if (!causeFailure.retryable) {
			return causeFailure;
		}
	}
	if (error instanceof TurboFileDirectDataError || getErrorName(error) === 'TurboFileDirectDataError') {
		return failure('integrity', true, true);
	}

	const message = getErrorMessage(error).toLowerCase();
	const name = getErrorName(error).toLowerCase();
	if (name.includes('canceled') || name.includes('cancelled') || /\b(cancel(?:ed|led)?|aborted)\b|取消/.test(message)) {
		return failure('canceled', false, false);
	}
	if (/authentication|auth fail|all configured authentication methods failed|invalid credential|login incorrect/.test(message)) {
		return failure('authentication', false, false);
	}
	if (/permission denied|eacces|operation not permitted|access is denied|拒绝访问|权限不足/.test(message)) {
		return failure('permission', false, false);
	}
	if (/already exists|eexist|target directory already exists|file exists|同名|冲突/.test(message)) {
		return failure('conflict', false, false);
	}
	if (/enospc|no space left|disk quota|not enough space|空间不足/.test(message)) {
		return failure('no-space', false, false);
	}
	if (/command not found|not recognized as an internal|unsupported protocol|protocol unavailable|subsystem request failed|sftp unavailable|scp unavailable/.test(message)) {
		return failure('protocol-unavailable', true, false);
	}
	if (/checksum|size mismatch|integrity|unexpected end|truncated|incomplete transfer/.test(message)) {
		return failure('integrity', true, true);
	}
	if (/etimedout|econnreset|econnrefused|ehostunreach|enetunreach|timed? out|timeout|connection (?:closed|lost|reset)|socket hang up|handshake/.test(message)) {
		return failure('network-transient', true, true);
	}
	return failure('unknown', true, false);
}

export function shouldContinueTurboFileTransferPlan(failure: ITurboFileTransferFailure): boolean {
	return failure.retryable;
}

export function getTurboFileTransferProtocolName(strategy: ITurboFileTransferResult['strategy'] | undefined): TurboFileTransferProtocolName | undefined {
	if (!strategy) {
		return undefined;
	}
	if (strategy === 'local-copy' || strategy === 'remote-copy') {
		return 'native';
	}
	if (strategy.startsWith('scp-')) {
		return 'scp';
	}
	if (strategy.startsWith('sftp-')) {
		return 'sftp';
	}
	if (strategy.startsWith('tar-')) {
		return 'tar';
	}
	return strategy.startsWith('rsync-') ? 'rsync' : undefined;
}

export function getTurboFileTransferProgressState(phase: ITurboFileTransferProgressEvent['phase'], fallback = false): TurboFileTransferProgressState {
	if (fallback) {
		return 'fallback';
	}
	switch (phase) {
		case 'prepare':
			return 'preparing';
		case 'complete':
			return 'completed';
		default:
			return 'transferring';
	}
}

function failure(category: TurboFileTransferFailureCategory, retryable: boolean, reduceConcurrency: boolean): ITurboFileTransferFailure {
	return { category, retryable, reduceConcurrency };
}

function getErrorName(error: unknown): string {
	return error instanceof Error ? error.name : '';
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? '');
}
