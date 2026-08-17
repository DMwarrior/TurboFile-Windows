/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';

const INSTALLER_PATTERN = /^TurboFileSetup-win32-x64-(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.exe$/i;
const repository = process.env.TURBOFILE_UPDATE_REPOSITORY ?? 'DMwarrior/TurboFile-Windows';
const installerPath = resolve(process.argv[2] ?? process.env.TURBOFILE_UPDATE_INSTALLER ?? '');
const notesPath = process.argv[3] ? resolve(process.argv[3]) : process.env.TURBOFILE_UPDATE_NOTES ? resolve(process.env.TURBOFILE_UPDATE_NOTES) : undefined;

if (!process.argv[2] && !process.env.TURBOFILE_UPDATE_INSTALLER) {
	throw new Error('Usage: npm run turbofile:publish-update -- <installer.exe> [release-notes.md]');
}
if (!existsSync(installerPath)) {
	throw new Error(`Installer not found: ${installerPath}`);
}

const installerName = basename(installerPath);
const installerMatch = INSTALLER_PATTERN.exec(installerName);
const version = installerMatch?.groups?.version;
if (!version) {
	throw new Error(`Installer name must match TurboFileSetup-win32-x64-<version>.exe: ${installerName}`);
}

const repositoryInfo = JSON.parse(runGh(['repo', 'view', repository, '--json', 'nameWithOwner,visibility'], true));
if (repositoryInfo.visibility !== 'PUBLIC') {
	throw new Error(`Update repository must be public so installed clients can access it: ${repository}`);
}

const tag = `v${version}`;
const sha256 = await sha256File(installerPath);
const releaseNotes = notesPath && existsSync(notesPath)
	? readFileSync(notesPath, 'utf8')
	: `极速传 ${version} Windows x64 正式版本。\n\n安装包：${installerName}\n\nSHA-256：${sha256}`;
const publishedAt = new Date().toISOString();
const releaseDirectory = mkdtempSync(resolve(tmpdir(), 'turbofile-update-'));

try {
	const checksumPath = resolve(releaseDirectory, `${installerName}.sha256`);
	const manifestPath = resolve(releaseDirectory, 'update.json');
	const proxyManifestPath = resolve(releaseDirectory, 'update-proxy.json');
	const releaseNotesPath = resolve(releaseDirectory, 'release-notes.md');
	const updaterNotesPath = resolve(releaseDirectory, 'updater-notes.md');
	writeFileSync(checksumPath, `${sha256}  ${installerName}\n`, 'utf8');
	writeFileSync(releaseNotesPath, releaseNotes, 'utf8');
	writeFileSync(updaterNotesPath, 'Static update metadata consumed by installed TurboFile clients.\n', 'utf8');

	ensureRelease(tag, `极速传 ${version}`, releaseNotesPath, true);
	runGh(['release', 'upload', tag, installerPath, checksumPath, '--repo', repository, '--clobber']);

	const downloadUrl = `https://github.com/${repository}/releases/download/${tag}/${installerName}`;
	const manifest = {
		version,
		name: `极速传 ${version}`,
		notes: releaseNotes,
		pub_date: publishedAt,
		platforms: {
			'windows-x64': {
				url: downloadUrl,
				sha256,
			},
		},
	};
	const proxyPrefix = process.env.TURBOFILE_UPDATE_PROXY_PREFIX ?? '';
	const proxyManifest = structuredClone(manifest);
	if (proxyPrefix) {
		proxyManifest.platforms['windows-x64'].url = `${proxyPrefix}${downloadUrl}`;
	}

	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
	writeFileSync(proxyManifestPath, `${JSON.stringify(proxyManifest, null, 2)}\n`, 'utf8');

	ensureRelease('updater', 'TurboFile update manifest', updaterNotesPath, false);
	runGh(['release', 'upload', 'updater', manifestPath, proxyManifestPath, '--repo', repository, '--clobber']);
	runGh(['release', 'edit', tag, '--repo', repository, '--latest']);

	console.log(`Published TurboFile ${version} to https://github.com/${repository}/releases/tag/${tag}`);
	console.log(`Installer: ${installerName}`);
	console.log(`SHA256: ${sha256}`);
	console.log(`Manifest: https://github.com/${repository}/releases/download/updater/update.json`);
} finally {
	rmSync(releaseDirectory, { recursive: true, force: true });
}

function ensureRelease(tagName, title, notesFile, latest) {
	if (releaseExists(tagName)) {
		runGh(['release', 'edit', tagName, '--repo', repository, '--title', title, '--notes-file', notesFile, ...(latest ? ['--latest'] : [])]);
		return;
	}

	runGh(['release', 'create', tagName, '--repo', repository, '--title', title, '--notes-file', notesFile, ...(latest ? ['--latest'] : ['--latest=false'])]);
}

function releaseExists(tagName) {
	try {
		runGh(['release', 'view', tagName, '--repo', repository, '--json', 'tagName'], true);
		return true;
	} catch {
		return false;
	}
}

function runGh(args, capture = false) {
	return execFileSync('gh', args, {
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
	});
}

async function sha256File(filePath) {
	const hash = createHash('sha256');
	await new Promise((resolvePromise, rejectPromise) => {
		createReadStream(filePath)
			.on('error', rejectPromise)
			.on('data', chunk => hash.update(chunk))
			.on('end', resolvePromise);
	});
	return hash.digest('hex');
}
