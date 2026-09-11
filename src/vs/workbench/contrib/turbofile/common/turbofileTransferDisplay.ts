/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFileTransferDisplayPhase = 'prepare' | 'transfer' | 'relay-download' | 'relay-upload' | 'rsync-direct' | 'complete';
export type TurboFileTransferDisplayStatus = 'waiting' | 'running' | 'success' | 'error' | 'canceled';

export const TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS = 300;
export const TURBOFILE_RSYNC_PROGRESS_RENDER_INTERVAL_MS = TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS;
/**
 * Refresh cadence for the transfer UI when the backend is temporarily quiet.
 *
 * This is deliberately a browser-only heartbeat. It does not poll the remote
 * endpoint or participate in transfer scheduling, so it cannot affect transfer
 * throughput.
 */
export const TURBOFILE_TRANSFER_LIVE_TICK_INTERVAL_MS = 1000;

/** A shared sample for event renders and heartbeats, with no timer or I/O of its own. */
export class TurboFileTransferTimeDisplay {
	private sampledAt: number | undefined;
	private startedAt: number | undefined;
	private snapshot: { milliseconds: number | undefined; remaining: boolean } | undefined;

	read(startedAt: number | undefined, remainingMs: number | undefined, now: number): { milliseconds: number | undefined; remaining: boolean } {
		if (this.sampledAt === undefined || this.startedAt !== startedAt) {
			this.sampledAt = now;
			this.startedAt = startedAt;
			this.snapshot = undefined;
		} else if (now - this.sampledAt >= TURBOFILE_TRANSFER_LIVE_TICK_INTERVAL_MS) {
			// Retain the clock phase even when a callback is late: 12.1 -> 13.1, not 13.0 -> 13.1.
			this.sampledAt += Math.floor((now - this.sampledAt) / TURBOFILE_TRANSFER_LIVE_TICK_INTERVAL_MS) * TURBOFILE_TRANSFER_LIVE_TICK_INTERVAL_MS;
			this.snapshot = undefined;
		}
		if (!this.snapshot) {
			const remaining = remainingMs !== undefined && Number.isFinite(remainingMs) && remainingMs > 0;
			this.snapshot = {
				remaining,
				milliseconds: remaining ? remainingMs : startedAt === undefined ? undefined : Math.max(0, this.sampledAt - startedAt)
			};
		}
		return this.snapshot;
	}

	reset(): void {
		this.sampledAt = undefined;
		this.startedAt = undefined;
		this.snapshot = undefined;
	}
}

export interface ITurboFileTransferSizeItem {
	readonly directory?: boolean;
	readonly rawSize: number;
}

export interface ITurboFileTransferSizePolicy {
	readonly trackTotalBytes: boolean;
	readonly totalBytes?: number;
}

export function createTurboFileTransferSizePolicy(items: readonly ITurboFileTransferSizeItem[]): ITurboFileTransferSizePolicy {
	if (items.length !== 1 || items[0].directory) {
		return { trackTotalBytes: false };
	}
	return { trackTotalBytes: true, totalBytes: Math.max(0, items[0].rawSize) };
}

export function resolveTurboFileVisibleTotalBytes(options: {
	readonly trackTotalBytes: boolean;
	readonly listedTotalBytes?: number;
	readonly reportedTotalBytes?: number;
}): number | undefined {
	if (!options.trackTotalBytes) {
		return undefined;
	}
	return Math.max(0, options.listedTotalBytes ?? 0, options.reportedTotalBytes ?? 0);
}

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
