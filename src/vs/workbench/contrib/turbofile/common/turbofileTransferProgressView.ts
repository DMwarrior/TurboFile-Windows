/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS, TurboFileTransferDisplayStatus } from './turbofileTransferDisplay.js';

export const TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT = 120;
export const TURBOFILE_TRANSFER_SPEED_HISTORY_WINDOW_MS = TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT * TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS;

export interface ITurboFileTransferSpeedPoint {
	readonly elapsedMs: number;
	readonly speedBytesPerSecond: number;
}

/** Bounded UI history. Sampling only reads existing metrics and never schedules work or performs I/O. */
export class TurboFileTransferSpeedHistory {
	private readonly points: (ITurboFileTransferSpeedPoint | undefined)[] = new Array(TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT);
	private key: string | undefined;
	private head = 0;
	private length = 0;
	private lastElapsedMs: number | undefined;
	private lastBucket: number | undefined;
	private snapshot: readonly ITurboFileTransferSpeedPoint[] | undefined;

	/** Include the transfer identity and stage in key so unrelated routes never share a curve. */
	sample(key: string, elapsedMs: number, speedBytesPerSecond: number): boolean {
		if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
			return false;
		}
		if (this.key !== key || (this.lastElapsedMs !== undefined && elapsedMs < this.lastElapsedMs)) {
			this.reset();
			this.key = key;
		}
		this.lastElapsedMs = elapsedMs;
		const bucket = Math.floor(elapsedMs / TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS);
		if (bucket === this.lastBucket) {
			return false;
		}
		this.lastBucket = bucket;
		while (this.length > 0 && this.points[this.head]!.elapsedMs <= elapsedMs - TURBOFILE_TRANSFER_SPEED_HISTORY_WINDOW_MS) {
			this.points[this.head] = undefined;
			this.head = (this.head + 1) % TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT;
			this.length--;
		}
		if (this.length === TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT) {
			this.head = (this.head + 1) % TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT;
			this.length--;
		}
		this.points[(this.head + this.length) % TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT] = {
			elapsedMs,
			speedBytesPerSecond: nonNegativeFinite(speedBytesPerSecond)
		};
		this.length++;
		this.snapshot = undefined;
		return true;
	}

	/** Materialize once per accepted sample, only when a visible graph asks for the history. */
	read(): readonly ITurboFileTransferSpeedPoint[] {
		if (!this.snapshot) {
			const points: ITurboFileTransferSpeedPoint[] = [];
			for (let index = 0; index < this.length; index++) {
				points.push(this.points[(this.head + index) % TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT]!);
			}
			this.snapshot = points;
		}
		return this.snapshot;
	}

	reset(): void {
		this.points.fill(undefined);
		this.key = undefined;
		this.head = 0;
		this.length = 0;
		this.lastElapsedMs = undefined;
		this.lastBucket = undefined;
		this.snapshot = undefined;
	}
}

export interface ITurboFileTransferProgressViewInput {
	readonly status: TurboFileTransferDisplayStatus;
	readonly transferredBytes: number;
	/** Only supply a reliable total measured in the same units as transferredBytes. */
	readonly totalBytes?: number;
	readonly elapsedMs: number;
	readonly speedBytesPerSecond: number;
}

export interface ITurboFileTransferProgressView {
	readonly status: TurboFileTransferDisplayStatus | 'finishing';
	readonly transferredBytes: number;
	readonly totalBytes: number | undefined;
	readonly elapsedMs: number;
	readonly speedBytesPerSecond: number;
	readonly fraction: number | undefined;
	readonly percentage: number | undefined;
	readonly remainingMs: number | undefined;
}

/** Format only trustworthy measurements: no inferred directory totals or synthetic completion. */
export function getTurboFileTransferProgressView(input: ITurboFileTransferProgressViewInput): ITurboFileTransferProgressView {
	const transferredBytes = nonNegativeFinite(input.transferredBytes);
	const speedBytesPerSecond = nonNegativeFinite(input.speedBytesPerSecond);
	const totalBytes = input.totalBytes !== undefined && Number.isFinite(input.totalBytes) && input.totalBytes >= 0 ? input.totalBytes : undefined;
	const confirmed = input.status === 'success';
	const finishing = input.status === 'running' && totalBytes !== undefined && transferredBytes >= totalBytes;
	const fraction = totalBytes === undefined ? undefined : confirmed ? 1 : totalBytes === 0 ? 0 : Math.min(0.99, transferredBytes / totalBytes);
	const remainingMs = input.status === 'running' && totalBytes !== undefined && totalBytes > transferredBytes && speedBytesPerSecond > 0
		? (totalBytes - transferredBytes) / speedBytesPerSecond * 1000
		: undefined;
	return {
		status: finishing ? 'finishing' : input.status,
		transferredBytes,
		totalBytes,
		elapsedMs: nonNegativeFinite(input.elapsedMs),
		speedBytesPerSecond,
		fraction,
		percentage: fraction === undefined ? undefined : Math.floor(fraction * 100),
		remainingMs: remainingMs !== undefined && Number.isFinite(remainingMs) ? remainingMs : undefined
	};
}

function nonNegativeFinite(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0;
}
