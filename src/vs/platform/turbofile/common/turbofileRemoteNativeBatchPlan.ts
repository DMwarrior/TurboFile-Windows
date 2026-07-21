/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITurboFileBatchTransferItem } from './turbofile.js';
import { buildPosixHeartbeatFunction } from './turbofilePosixHeartbeat.js';

export interface ITurboFilePosixNativeBatchTransferPlan {
	readonly command: string;
	readonly input: Uint8Array;
}

export function createPosixNativeBatchTransferPlan(items: readonly ITurboFileBatchTransferItem[], targetDirectory: string, operation: 'copy' | 'move'): ITurboFilePosixNativeBatchTransferPlan {
	const validItems = items.filter(item => !!item.sourcePath && !!item.targetName);
	const targetNames = validItems.map(item => item.targetName);
	if (new Set(targetNames).size !== targetNames.length) {
		throw new Error('Duplicate target names are not allowed in a native batch transfer.');
	}
	if ([targetDirectory, ...validItems.flatMap(item => [item.sourcePath, item.targetName])].some(value => value.includes('\0'))) {
		throw new Error('Native batch transfer paths cannot contain NUL characters.');
	}
	const target = quotePosixShellArg(targetDirectory);
	const entries = validItems.flatMap(item => [item.sourcePath, item.targetName, item.sourceType ?? 'unknown']);
	const script = [
		'set -e',
		'target=$1',
		'operation=$2',
		'mkdir -p -- "$target"',
		'sources=()',
		'names=()',
		'types=()',
		'basename_batch=1',
		"while IFS= read -r -d '' source && IFS= read -r -d '' name && IFS= read -r -d '' type; do",
		'  trimmed=${source%/}; base=${trimmed##*/}; if [ "$base" != "$name" ]; then basename_batch=0; fi',
		'  sources+=("$source"); names+=("$name"); types+=("$type")',
		'done',
		'if [ "$basename_batch" -eq 0 ]; then for name in "${names[@]}"; do dst="$target/$name"; if [ -e "$dst" ] || [ -L "$dst" ]; then printf \'%s\\n\' "Target already exists: $dst" >&2; exit 73; fi; done; fi',
		'chunk_size=128',
		'copy_args=(-a -n)',
		"if cp --help 2>/dev/null | grep -q -- '--reflink'; then copy_args+=(--reflink=auto --sparse=always); fi",
		buildPosixHeartbeatFunction(),
		'copy_all() {',
		'  local total=${#sources[@]} start index dst',
		'  if [ "$basename_batch" -eq 1 ]; then',
		'    for ((start=0; start<total; start+=chunk_size)); do cp "${copy_args[@]}" -- "${sources[@]:start:chunk_size}" "$target/"; printf "." >&2; done',
		'  else',
		'    for ((index=0; index<total; index++)); do dst="$target/${names[index]}"; cp "${copy_args[@]}" -- "${sources[index]}" "$dst"; if [ ! -e "$dst" ] && [ ! -L "$dst" ]; then return 74; fi; if [ $(((index + 1) % 64)) -eq 0 ]; then printf "." >&2; fi; done',
		'  fi',
		'}',
		'move_all() {',
		'  local total=${#sources[@]} start index source dst',
		'  if [ "$basename_batch" -eq 1 ]; then',
		'    for ((start=0; start<total; start+=chunk_size)); do mv -n -- "${sources[@]:start:chunk_size}" "$target/"; for source in "${sources[@]:start:chunk_size}"; do if [ -e "$source" ] || [ -L "$source" ]; then return 74; fi; done; printf "." >&2; done',
		'  else',
		'    for ((index=0; index<total; index++)); do source=${sources[index]}; dst="$target/${names[index]}"; mv -n -- "$source" "$dst"; if ! { [ ! -e "$source" ] && [ ! -L "$source" ]; }; then return 74; fi; if [ $(((index + 1) % 64)) -eq 0 ]; then printf "." >&2; fi; done',
		'  fi',
		'}',
		'if [ "$operation" = move ]; then run_with_heartbeat move_all; else run_with_heartbeat copy_all; fi'
	].join('\n');
	return {
		command: `bash -lc ${quotePosixShellArg(script)} _ ${target} ${quotePosixShellArg(operation)}`,
		input: createNullDelimitedBuffer(entries)
	};
}

function createNullDelimitedBuffer(entries: readonly string[]): Uint8Array {
	return new TextEncoder().encode(entries.length ? `${entries.join('\0')}\0` : '');
}

function quotePosixShellArg(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}
