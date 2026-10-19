/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Observes only the owned mv process: metadata renames produce no invented data throughput. */
export function buildPosixMoveProgressFunction(): string {
	return [
		'tf_run_move() {',
		'  if [ ! -r /proc/self/io ] || ! command -v awk >/dev/null 2>&1; then "$@"; return $?; fi',
		'  tf_move_pid=; tf_move_monitor=; tf_move_owner=$$',
		'  tf_stop_move_monitor() { if [ -n "$tf_move_monitor" ]; then kill "$tf_move_monitor" 2>/dev/null || :; wait "$tf_move_monitor" 2>/dev/null || :; tf_move_monitor=; fi; }',
		'  tf_cancel_move() { trap "" HUP INT TERM; if [ -n "$tf_move_pid" ]; then kill "$tf_move_pid" 2>/dev/null || :; fi; tf_stop_move_monitor; exit 143; }',
		'  trap tf_cancel_move HUP INT TERM',
		'  "$@" & tf_move_pid=$!',
		'  (',
		'    tf_move_sleep=; tf_move_last=0; tf_move_ticks=0',
		'    tf_stop_move_observer() { trap "" HUP INT TERM; if [ -n "$tf_move_sleep" ]; then kill "$tf_move_sleep" 2>/dev/null || :; wait "$tf_move_sleep" 2>/dev/null || :; fi; exit 0; }',
		'    trap tf_stop_move_observer HUP INT TERM',
		'    while kill -0 "$tf_move_pid" 2>/dev/null; do',
		'      if ! kill -0 "$tf_move_owner" 2>/dev/null || { [ -n "${tf_move_supervisor:-}" ] && ! kill -0 "$tf_move_supervisor" 2>/dev/null; }; then kill "$tf_move_pid" 2>/dev/null || :; break; fi',
		'      tf_move_bytes=$(awk \'$1 == "wchar:" {printf "%.0f\\n", $2 + 0; exit}\' "/proc/$tf_move_pid/io" 2>/dev/null) || break',
		'      case "$tf_move_bytes" in ""|*[!0-9]*) break ;; esac',
		'      if [ "$tf_move_bytes" -gt "$tf_move_last" ]; then printf \'\\nTURBOFILE_MOVE_DELTA=%s\\n\' "$((tf_move_bytes - tf_move_last))" >&2; tf_move_last=$tf_move_bytes; fi',
		'      tf_move_ticks=$((tf_move_ticks + 1)); if [ "$tf_move_ticks" -ge 60 ]; then printf "." >&2; tf_move_ticks=0; fi',
		'      sleep 0.5 </dev/null >/dev/null 2>&1 & tf_move_sleep=$!; wait "$tf_move_sleep" 2>/dev/null || :; tf_move_sleep=',
		'    done',
		'  ) </dev/null >/dev/null & tf_move_monitor=$!',
		'  tf_move_status=0; wait "$tf_move_pid" || tf_move_status=$?; tf_move_pid=',
		'  tf_stop_move_monitor; trap - HUP INT TERM; return "$tf_move_status"',
		'}'
	].join('\n');
}

/** Retains partial SSH records and ignores late callbacks after the command settles. */
export class TurboFileMoveProgressParser {
	private pending = '';
	private disposed = false;

	constructor(private readonly onDelta: (delta: number) => void) { }

	accept(chunk: string): void {
		if (this.disposed) {
			return;
		}
		this.pending += chunk;
		const recordEnd = this.pending.lastIndexOf('\n');
		if (recordEnd >= 0) {
			const records = this.pending.slice(0, recordEnd + 1);
			this.pending = this.pending.slice(recordEnd + 1);
			for (const record of records.split('\n')) {
				if (/^\.*\r?$/.test(record)) {
					continue;
				}
				if (/^TURBOFILE_PROCESS_GROUP_[a-zA-Z0-9-]+=(?:\d+:\d+|unavailable)\r?$/.test(record)) {
					continue;
				}
				const match = /^TURBOFILE_MOVE_DELTA=(\d+)\r?$/.exec(record);
				if (!match) {
					// wchar also includes stderr writes. Normal mv is silent; stop observing after a
					// diagnostic so failed metadata operations cannot turn error text into a data rate.
					this.dispose();
					return;
				}
				const delta = Number(match[1]);
				if (Number.isSafeInteger(delta) && delta > 0) {
					this.onDelta(delta);
				}
			}
		}
		if (this.pending.length > 4096) {
			this.dispose();
		}
	}

	dispose(): void {
		this.disposed = true;
		this.pending = '';
	}
}
