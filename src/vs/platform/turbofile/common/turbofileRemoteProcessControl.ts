/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class TurboFileRemoteCancellationError extends Error {
	constructor() {
		super('Could not confirm that the remote operation stopped. Check the remote source and destination before retrying.');
		this.name = 'TurboFileRemoteCancellationError';
	}
}

interface IOwnedProcessGroup {
	readonly pid: string;
	readonly startTime: string;
}

/** Identifies an independently owned SSH command session without adding a normal-path round trip. */
export class TurboFileRemoteProcessControl {
	private pending = '';
	private group: IOwnedProcessGroup | undefined;
	private completed = false;
	private resolveReady!: () => void;
	private readonly ready = new Promise<void>(resolve => this.resolveReady = resolve);
	private cancelPromise: Promise<void> | undefined;

	constructor(private readonly nonce: string) {
		if (!/^[a-zA-Z0-9-]+$/.test(nonce)) {
			throw new Error('Invalid remote process control nonce.');
		}
	}

	wrap(command: string): string {
		// After removing comm, stat fields 3/4/20 are pgrp/session/starttime. The shell's own
		// PID must lead both the group and session; otherwise a negative-PGID kill is unsafe.
		const probe = `awk -v pid="$$" 'BEGIN {found=0} {s=$0; sub(/^.*\\) /,"",s); split(s,a," "); if (pid>1 && a[3]==pid && a[4]==pid && a[20] ~ /^[0-9]+$/) {printf "\\nTURBOFILE_PROCESS_GROUP_${this.nonce}=%s:%s\\n",pid,a[20]; found=1}} END {if (!found) printf "\\nTURBOFILE_PROCESS_GROUP_${this.nonce}=unavailable\\n"}' "/proc/$$/stat" >&2 2>/dev/null`;
		return `set +m; if [ -r "/proc/$$/stat" ] && command -v awk >/dev/null 2>&1; then ${probe}; else printf '\\nTURBOFILE_PROCESS_GROUP_${this.nonce}=unavailable\\n' >&2; fi; ${command}`;
	}

	accept(chunk: string): void {
		if (this.completed) {
			return;
		}
		this.pending += chunk;
		const end = this.pending.lastIndexOf('\n');
		if (end >= 0) {
			const records = this.pending.slice(0, end + 1).split('\n');
			this.pending = this.pending.slice(end + 1);
			const prefix = `TURBOFILE_PROCESS_GROUP_${this.nonce}=`;
			for (const record of records) {
				if (!record.startsWith(prefix)) {
					continue;
				}
				const match = /^(\d+):(\d+)\r?$/.exec(record.slice(prefix.length));
				if (match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) > 1) {
					this.group = { pid: match[1], startTime: match[2] };
				}
				this.resolveReady();
			}
		}
		if (this.pending.length > 4096) {
			this.pending = '';
		}
	}

	complete(): void {
		this.completed = true;
		this.pending = '';
		this.resolveReady();
	}

	filterStderr(output: string): string {
		const prefix = `TURBOFILE_PROCESS_GROUP_${this.nonce}=`;
		return output.split('\n').filter(line => !line.startsWith(prefix)).join('\n');
	}

	get cancellation(): Promise<void> | undefined {
		return this.cancelPromise;
	}

	cancel(run: (command: string) => Promise<void>): Promise<void> {
		if (!this.cancelPromise) {
			const attempt = this.cancelOwnedGroup(run);
			this.cancelPromise = attempt;
			void attempt.catch(() => {
				if (this.cancelPromise === attempt) {
					this.cancelPromise = undefined;
				}
			});
		}
		return this.cancelPromise;
	}

	private async cancelOwnedGroup(run: (command: string) => Promise<void>): Promise<void> {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([this.ready, new Promise<void>(resolve => timeout = setTimeout(resolve, 1500))]);
			if (this.completed) {
				return;
			}
			if (!this.group) {
				throw new TurboFileRemoteCancellationError();
			}
			await run(buildOwnedGroupCancellationCommand(this.group));
		} catch {
			throw new TurboFileRemoteCancellationError();
		} finally {
			clearTimeout(timeout);
		}
	}
}

function buildOwnedGroupCancellationCommand(group: IOwnedProcessGroup): string {
	const { pid, startTime } = group;
	// Check all ownership fields immediately before killing the whole group. A two-phase
	// TERM/KILL sequence could lose the leader's starttime guard while descendants still run.
	const matches = `awk -v pid='${pid}' -v start='${startTime}' '{s=$0; sub(/^.*\\) /,"",s); split(s,a," "); if (a[3]==pid && a[4]==pid && ("x" a[20])==("x" start)) found=1} END {exit !found}' '/proc/${pid}/stat' 2>/dev/null`;
	return [
		`tf_group_matches() { ${matches}; }`,
		`tf_group_alive() { kill -0 -${pid} 2>/dev/null; }`,
		`if ! tf_group_matches; then if tf_group_alive; then exit 76; else exit 0; fi; fi`,
		`kill -KILL -${pid} 2>/dev/null || exit 76`,
		'tf_wait=0; while tf_group_alive && [ "$tf_wait" -lt 40 ]; do sleep 0.05; tf_wait=$((tf_wait + 1)); done',
		'if tf_group_alive; then exit 76; fi'
	].join('; ');
}
