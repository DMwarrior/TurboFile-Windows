/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITurboFileProgressMotion {
	readonly startedAt: number;
	readonly duration: number;
	readonly fractions: readonly number[];
}

/** Smooth only confirmed bytes. The browser plays the bounded curve without a JS frame loop. */
export class TurboFileProgressMotion {
	private target: number | undefined;
	private sampledAt = 0;
	private cadence = 500;
	private motion: ITurboFileProgressMotion | undefined;

	reset(fraction: number | undefined, now: number): void {
		this.target = fraction;
		this.sampledAt = now;
		this.cadence = 500;
		this.motion = undefined;
	}

	read(now: number): number | undefined {
		if (!this.motion) {
			return this.target;
		}
		const { startedAt, duration, fractions } = this.motion;
		const position = Math.min(1, Math.max(0, (now - startedAt) / duration)) * (fractions.length - 1);
		const index = Math.floor(position);
		return fractions[index] + ((fractions[index + 1] ?? fractions[index]) - fractions[index]) * (position - index);
	}

	update(fraction: number, now: number): ITurboFileProgressMotion | undefined {
		if (this.target === undefined || fraction < this.target || now < this.sampledAt) {
			this.reset(fraction, now);
			return undefined;
		}
		if (fraction === this.target) {
			// Repaints with identical counters must not restart or shorten an animation.
			return this.motion;
		}
		const from = this.read(now)!;
		let velocity = 0;
		if (this.motion && now < this.motion.startedAt + this.motion.duration) {
			const { startedAt, duration, fractions } = this.motion;
			const step = duration / (fractions.length - 1);
			const index = Math.max(0, Math.floor((now - startedAt) / step));
			velocity = (fractions[index + 1] - fractions[index]) / step;
		}
		this.cadence = Math.min(2000, Math.max(500, now - this.sampledAt, this.cadence * 0.75));
		this.sampledAt = now;
		this.target = fraction;
		// Critically damped following preserves velocity across updates instead of
		// restarting an ease-out curve. The tail bridges late samples; the velocity
		// bound prevents overshooting confirmed bytes even after a sudden slowdown.
		const gap = fraction - from;
		const slope = gap / this.cadence - Math.min(velocity, gap / this.cadence);
		const duration = this.cadence * 10;
		const fractions = Array.from({ length: 65 }, (_, index) => {
			const elapsed = duration * index / 64;
			return fraction - (gap + slope * elapsed) * Math.exp(-elapsed / this.cadence);
		});
		fractions[0] = from;
		fractions[64] = fraction;
		this.motion = { startedAt: now, duration, fractions };
		return this.motion;
	}
}
