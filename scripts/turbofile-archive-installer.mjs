/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Keep every published installer in the standard local archive, independently of staging folders. */
export async function archiveTurboFileInstaller(installerPath, sha256) {
	const directory = fileURLToPath(new URL('../.build/win32-x64/', import.meta.url));
	await mkdir(directory, { recursive: true });
	const target = resolve(directory, basename(installerPath));
	if (resolve(installerPath).toLowerCase() !== target.toLowerCase()) {
		await copyFile(installerPath, target);
	}
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(target)) {
		hash.update(chunk);
	}
	if (hash.digest('hex') !== sha256) {
		throw new Error(`Archived installer checksum mismatch: ${target}`);
	}
	await writeFile(`${target}.sha256`, `${sha256}  ${basename(target)}\n`, 'utf8');
	return target;
}
