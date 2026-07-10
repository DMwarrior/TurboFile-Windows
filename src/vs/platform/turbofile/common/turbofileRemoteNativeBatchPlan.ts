/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITurboFileBatchTransferItem } from './turbofile.js';

export interface ITurboFilePosixNativeBatchTransferPlan {
	readonly command: string;
	readonly input: Buffer;
}

export function createPosixNativeBatchTransferPlan(items: readonly ITurboFileBatchTransferItem[], targetDirectory: string, operation: 'copy' | 'move'): ITurboFilePosixNativeBatchTransferPlan {
	const entries = items
		.filter(item => !!item.sourcePath && !!item.targetName)
		.flatMap(item => [item.sourcePath, item.targetName, item.sourceType ?? 'unknown']);
	const target = quotePosixShellArg(targetDirectory);
	const script = operation === 'move'
		? 'target=$0; src=$1; name=$2; dst="$target/$name"; mv -f -- "$src" "$dst"'
		: 'target=$0; src=$1; name=$2; type=$3; dst="$target/$name"; if [ "$type" = directory ]; then if [ -e "$dst" ] && [ ! -d "$dst" ]; then printf \'%s\\n\' "Target directory conflicts with a file: $dst" >&2; exit 73; fi; mkdir -p -- "$dst"; cp -a --reflink=auto --sparse=always -- "$src"/. "$dst"/ 2>/dev/null || cp -a -- "$src"/. "$dst"/; else cp -a --reflink=auto --sparse=always -- "$src" "$dst" 2>/dev/null || cp -a -- "$src" "$dst"; fi';
	return {
		command: `mkdir -p -- ${target} && LC_ALL=C xargs -0 -r -n 3 sh -c ${quotePosixShellArg(script)} ${target}`,
		input: createNullDelimitedBuffer(entries)
	};
}

function createNullDelimitedBuffer(entries: readonly string[]): Buffer {
	return Buffer.from(entries.length ? `${entries.join('\0')}\0` : '', 'utf8');
}

function quotePosixShellArg(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}
