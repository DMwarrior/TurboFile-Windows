/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFileTransferDisplayPhase = 'prepare' | 'transfer' | 'relay-download' | 'relay-upload' | 'rsync-direct' | 'complete';
export type TurboFileTransferDisplayStatus = 'waiting' | 'running' | 'success' | 'error' | 'canceled';

export const TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS = 300;
export const TURBOFILE_RSYNC_PROGRESS_RENDER_INTERVAL_MS = TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS;
export const TURBOFILE_RSYNC_STARTUP_TICK_INTERVAL_MS = TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS;

export function isTurboFileRsyncStrategy(strategy: string | undefined): boolean {
	return strategy?.startsWith('rsync') ?? false;
}

export function shouldStartTransferTiming(options: {
	readonly phase: TurboFileTransferDisplayPhase;
	readonly strategy: string | undefined;
	readonly transferredBytes: number;
	readonly speedBytesPerSecond: number | undefined;
}): boolean {
	const isDataPhase = options.phase !== 'prepare' && options.phase !== 'complete';
	if (!isDataPhase) {
		return false;
	}
	if (!isTurboFileRsyncStrategy(options.strategy)) {
		return true;
	}
	return options.transferredBytes > 0 || (options.speedBytesPerSecond !== undefined && options.speedBytesPerSecond > 0);
}

export function getVisibleTransferStartedAt(options: {
	readonly status: TurboFileTransferDisplayStatus;
	readonly strategy: string | undefined;
	readonly startedAt: number | undefined;
	readonly transferStartedAt: number | undefined;
}): number | undefined {
	if (options.transferStartedAt !== undefined) {
		return options.transferStartedAt;
	}
	if (options.status === 'running' && isTurboFileRsyncStrategy(options.strategy)) {
		return options.startedAt;
	}
	return undefined;
}

export function chooseDisplayTransferSpeed(options: {
	readonly strategy: string | undefined;
	readonly eventSpeedBytesPerSecond: number | undefined;
	readonly sampledSpeedBytesPerSecond: number;
}): number {
	const sampledSpeed = Number.isFinite(options.sampledSpeedBytesPerSecond) && options.sampledSpeedBytesPerSecond > 0
		? options.sampledSpeedBytesPerSecond
		: 0;
	if (isTurboFileRsyncStrategy(options.strategy)) {
		return sampledSpeed;
	}
	return options.eventSpeedBytesPerSecond !== undefined
		&& Number.isFinite(options.eventSpeedBytesPerSecond)
		&& options.eventSpeedBytesPerSecond >= 0
		? options.eventSpeedBytesPerSecond
		: sampledSpeed;
}
