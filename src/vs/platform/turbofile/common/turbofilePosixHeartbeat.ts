/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns a Bash 4.0-compatible helper that forwards command output while reporting a dot on
 * stderr every 30 seconds. The command status travels through a coprocess pipe, so both fast
 * success and fast failure wake immediately without a background sleep holding the SSH channel.
 */
export function buildPosixHeartbeatFunction(): string {
	return 'run_with_heartbeat() { exec 8<&0 9>&1; coproc TURBOFILE_HEARTBEAT_COMMAND { set +e; "$@" <&8 >&9; command_status=$?; printf "%s\\n" "$command_status"; exit "$command_status"; }; command_pid=$TURBOFILE_HEARTBEAT_COMMAND_PID; status_fd=${TURBOFILE_HEARTBEAT_COMMAND[0]}; exec 8<&- 9>&-; is_command_running() { while IFS= read -r running_pid; do if [ "$running_pid" = "$command_pid" ]; then return 0; fi; done < <(jobs -pr); return 1; }; while true; do command_status=; if IFS= read -r -t 30 command_status <&"$status_fd"; then wait "$command_pid" 2>/dev/null || true; eval "exec ${status_fd}<&-"; return "$command_status"; fi; if is_command_running; then printf "." >&2; continue; fi; command_status=0; wait "$command_pid" || command_status=$?; eval "exec ${status_fd}<&-"; return "$command_status"; done; }';
}
