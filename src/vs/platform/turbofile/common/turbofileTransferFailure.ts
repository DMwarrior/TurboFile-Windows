/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITurboFileTransferProgressEvent, ITurboFileTransferResult, TurboFileTransferAttemptProtocol } from './turbofile.js';
import { TurboFileDirectDataError, TurboFileDirectUnavailableError } from './turbofileDirectRoute.js';

export type TurboFileTransferFailureCategory = 'canceled' | 'authentication' | 'permission' | 'conflict' | 'no-space' | 'path-unavailable' | 'source-changed' | 'protocol-unavailable' | 'direct-unavailable' | 'network-transient' | 'integrity' | 'unknown';
export type TurboFileTransferProgressState = 'queued' | 'preparing' | 'transferring' | 'fallback' | 'completed' | 'failed' | 'canceled';
export type TurboFileTransferProtocolName = 'native' | TurboFileTransferAttemptProtocol;

export interface ITurboFileTransferFailure {
	readonly category: TurboFileTransferFailureCategory;
	readonly retryable: boolean;
	readonly reduceConcurrency: boolean;
}

/** Returns the underlying SSH or filesystem diagnostic without serializing route metadata. */
export function getTurboFileTransferErrorMessage(error: unknown): string {
	let current = error;
	const visited = new Set<unknown>();
	while (!visited.has(current)) {
		visited.add(current);
		const name = getErrorName(current);
		if (name !== 'TurboFileDirectDataError' && name !== 'TurboFileDirectUnavailableError') {
			break;
		}
		const cause = getErrorProperty(current, 'transferCause');
		if (cause === undefined) {
			break;
		}
		current = cause;
	}
	return getErrorMessage(current);
}

export function classifyTurboFileTransferFailure(error: unknown): ITurboFileTransferFailure {
	if (getErrorName(error) === 'TurboFileRemoteCancellationError') {
		return failure('unknown', false, false);
	}
	if (error instanceof TurboFileDirectUnavailableError || getErrorName(error) === 'TurboFileDirectUnavailableError') {
		return failure('direct-unavailable', true, false);
	}
	if (error instanceof TurboFileDirectDataError && error.transferCause !== undefined) {
		return classifyTurboFileTransferFailure(error.transferCause);
	}
	if (error instanceof TurboFileDirectDataError || getErrorName(error) === 'TurboFileDirectDataError') {
		return failure('integrity', true, true);
	}

	const message = getErrorMessage(error).toLowerCase();
	const name = getErrorName(error).toLowerCase();
	if (name.includes('canceled') || name.includes('cancelled') || /\b(cancel(?:ed|led)?|aborted)\b|取消/.test(message)) {
		return failure('canceled', false, false);
	}
	if (/turbofile_scp_commit_failed/.test(message)) {
		return failure('integrity', false, false);
	}
	if (/authentication|auth fail|all configured authentication methods failed|invalid credential|login incorrect|permission denied \([^)]*(?:publickey|password|keyboard-interactive)[^)]*\)/.test(message)) {
		return failure('authentication', false, false);
	}
	if (/permission denied|eacces|erofs|read-only file system|operation not permitted|access is denied|拒绝访问|权限不足|权限不够|不允许的操作/.test(message)) {
		return failure('permission', false, false);
	}
	if (/already exists|are the same file|eexist|enotdir|eisdir|target directory already exists|file exists|not a directory|is a directory|是一个目录|不是(?:一个)?目录|同名|冲突/.test(message)) {
		return failure('conflict', false, false);
	}
	if (/enospc|no space left|disk quota|not enough space|空间不足/.test(message)) {
		return failure('no-space', false, false);
	}
	// A missing native executable can use another transport; a missing source file cannot.
	// Keep the message check for errors that were formatted or transported without Node metadata.
	const syscall = getErrorProperty(error, 'syscall');
	if ((getErrorProperty(error, 'code') === 'ENOENT' && typeof syscall === 'string' && /^spawn(?:sync)?\s/i.test(syscall))
		|| /(?:^|:\s*)spawn(?:sync)?\s.+\senoent$/.test(message)) {
		return failure('protocol-unavailable', true, false);
	}
	if (/command not found|not recognized as an internal|unsupported protocol|protocol unavailable|subsystem request failed|sftp unavailable|scp unavailable|(?:scp|sftp|tar|rsync|dd|bash|zstd|sshpass|ssh): (?:not found|no such file or directory)/.test(message)) {
		return failure('protocol-unavailable', true, false);
	}
	if (/enoent|no such file or directory|path not found|cannot stat|cannot open.*no such|file removed before we read it|找不到.*(?:文件|目录)|路径不存在|文件在我们读入之前被删除了/.test(message)) {
		return failure('path-unavailable', false, false);
	}
	if (/file changed as we read it|source (?:file )?changed during|源文件.*(?:改变|变化)|在我们读入文件时文件发生了变化/.test(message)) {
		return failure('source-changed', false, false);
	}
	if (/checksum|size mismatch|integrity|unexpected end|truncated|incomplete transfer/.test(message)) {
		return failure('integrity', true, true);
	}
	if (/etimedout|econnreset|econnrefused|ehostunreach|enetunreach|epipe|broken pipe|timed? out|timeout|connection (?:closed|lost|reset)|socket hang up|handshake/.test(message)) {
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
	const name = getErrorProperty(error, 'name');
	return typeof name === 'string' ? name : '';
}

function getErrorMessage(error: unknown): string {
	const message = getErrorProperty(error, 'message');
	return typeof message === 'string' ? message : String(error ?? '');
}

function getErrorProperty(error: unknown, property: 'name' | 'message' | 'transferCause' | 'code' | 'syscall'): unknown {
	return typeof error === 'object' && error !== null ? Reflect.get(error, property) : undefined;
}
