/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function isTurboFileTarFamilyArchivePath(path: string): boolean {
	const lower = path.toLowerCase();
	return ['.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.tar.zst', '.tzst'].some(extension => lower.endsWith(extension));
}

export function buildTurboFileRemoteExtractCommand(path: string, quotedArchive: string): string {
	const bsdtar = `bsdtar -xf ${quotedArchive} -C "$out"`;
	const tar = `tar -xf ${quotedArchive} -C "$out"`;
	if (isRarPath(path)) {
		return `if command -v unrar >/dev/null 2>&1; then unrar x -o+ ${quotedArchive} "$out"/; elif command -v unar >/dev/null 2>&1; then unar -force-overwrite -output-directory "$out" ${quotedArchive}; elif command -v 7z >/dev/null 2>&1; then 7z x -y -o"$out" ${quotedArchive}; elif command -v bsdtar >/dev/null 2>&1; then ${bsdtar}; else echo 'No rar extractor (need unrar/unar/7z/bsdtar).' >&2; exit 2; fi`;
	}
	if (is7zPath(path)) {
		return `if command -v 7z >/dev/null 2>&1; then 7z x -y -o"$out" ${quotedArchive}; elif command -v 7za >/dev/null 2>&1; then 7za x -y -o"$out" ${quotedArchive}; elif command -v bsdtar >/dev/null 2>&1; then ${bsdtar}; else echo 'No 7z extractor (need 7z/7za/bsdtar).' >&2; exit 2; fi`;
	}
	if (isZipPath(path)) {
		return buildRemoteZipExtractCommand(quotedArchive, bsdtar, tar);
	}
	return `if command -v tar >/dev/null 2>&1; then ${tar}; elif command -v bsdtar >/dev/null 2>&1; then ${bsdtar}; else echo 'No tar extractor available.' >&2; exit 2; fi`;
}

function buildRemoteZipExtractCommand(quotedArchive: string, bsdtar: string, tar: string): string {
	const pythonScript = [
		'import os, sys, zipfile',
		'archive, out = sys.argv[1], sys.argv[2]',
		'os.makedirs(out, exist_ok=True)',
		'try:',
		'    zf = zipfile.ZipFile(archive, metadata_encoding="gbk")',
		'except TypeError:',
		'    zf = zipfile.ZipFile(archive)',
		'with zf:',
		'    zf.extractall(out)'
	].join('\n');
	const pythonExtract = `python3 -c ${quotePosixShellArg(pythonScript)} ${quotedArchive} "$out"`;
	return [
		`if command -v unzip >/dev/null 2>&1 && unzip -O GBK -o ${quotedArchive} -d "$out"; then :`,
		`elif command -v python3 >/dev/null 2>&1 && ${pythonExtract}; then :`,
		`elif command -v bsdtar >/dev/null 2>&1; then ${bsdtar}`,
		`elif command -v unzip >/dev/null 2>&1; then unzip -o ${quotedArchive} -d "$out"`,
		`else ${tar}; fi`
	].join(' ');
}

function isZipPath(path: string): boolean {
	return path.toLowerCase().endsWith('.zip');
}

function isRarPath(path: string): boolean {
	return path.toLowerCase().endsWith('.rar');
}

function is7zPath(path: string): boolean {
	return path.toLowerCase().endsWith('.7z');
}

function quotePosixShellArg(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
