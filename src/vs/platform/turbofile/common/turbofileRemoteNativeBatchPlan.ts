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
	const sourcePaths = items.map(item => item.sourcePath).filter(path => !!path);
	const target = quotePosixShellArg(targetDirectory);
	const script = operation === 'move'
		? 'target=$0; for src do mv -f -- "$src" "$target/"; done'
		: 'target=$0; for src do cp -a --reflink=auto --sparse=always -- "$src" "$target/" 2>/dev/null || cp -a -- "$src" "$target/"; done';
	return {
		command: `mkdir -p -- ${target} && LC_ALL=C xargs -0 -r sh -c ${quotePosixShellArg(script)} ${target}`,
		input: createNullDelimitedBuffer(sourcePaths)
	};
}

function createNullDelimitedBuffer(entries: readonly string[]): Buffer {
	return Buffer.from(entries.length ? `${entries.join('\0')}\0` : '', 'utf8');
}

function quotePosixShellArg(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}
