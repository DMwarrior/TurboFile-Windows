/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';

const INSTALLER_PATTERN = /^TurboFileSetup-win32-x64-(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.exe$/i;
const PART_BYTES = 90 * 1024 * 1024;
const token = process.env.GITEE_TOKEN;
const owner = process.env.GITEE_OWNER ?? 'fkwarrior';
const repo = process.env.GITEE_REPO ?? 'TurboFile-Windows';
const apiBase = process.env.GITEE_API_URL ?? 'https://gitee.com/api/v5';
const githubRepository = process.env.TURBOFILE_UPDATE_REPOSITORY ?? 'DMwarrior/TurboFile-Windows';
const installerPath = resolve(process.argv[2] ?? process.env.TURBOFILE_UPDATE_INSTALLER ?? '');
const notesPath = process.argv[3] ? resolve(process.argv[3]) : process.env.TURBOFILE_UPDATE_NOTES ? resolve(process.env.TURBOFILE_UPDATE_NOTES) : undefined;
const publicPresentationFiles = [
	'LICENSE.txt',
	'ThirdPartyNotices.txt',
	'docs/assets/performance-comparison-cn.svg',
	'docs/assets/performance-comparison-en.svg',
	'docs/assets/screenshots/device-manager.png',
	'docs/assets/screenshots/dual-image-grid.png',
	'docs/assets/screenshots/integrated-terminal.png',
	'docs/assets/screenshots/remote-image-grid.png',
	'docs/assets/screenshots/transfer-speed-114mbps.png',
	'docs/assets/screenshots/turbofile-home.png',
];

if (!token) {
	throw new Error('Missing GITEE_TOKEN');
}
if (!process.argv[2] && !process.env.TURBOFILE_UPDATE_INSTALLER) {
	throw new Error('Usage: npm run turbofile:publish-update:gitee -- <installer.exe> [release-notes.md]');
}
if (!existsSync(installerPath)) {
	throw new Error(`Installer not found: ${installerPath}`);
}

const installerName = basename(installerPath);
const version = INSTALLER_PATTERN.exec(installerName)?.groups?.version;
if (!version) {
	throw new Error(`Installer name must match TurboFileSetup-win32-x64-<version>.exe: ${installerName}`);
}

const repository = await ensurePublicRepository();
if (repository.private || repository.public === false) {
	throw new Error(`Gitee update repository must be public: ${owner}/${repo}`);
}
await ensureMainBranch(repository);
await syncPublicRepositoryPresentation();

const tag = `v${version}`;
const fullSha256 = await sha256File(installerPath);
const releaseNotes = notesPath && existsSync(notesPath)
	? readFileSync(notesPath, 'utf8')
	: `极速传 ${version} Windows x64 正式版本。\n\n安装包：${installerName}\n\nSHA-256：${fullSha256}`;
const tempDirectory = mkdtempSync(resolve(tmpdir(), 'turbofile-gitee-update-'));

try {
	const partPaths = await splitInstaller(installerPath, tempDirectory, installerName);
	const release = await getOrCreateRelease(tag, `极速传 ${version}`, releaseNotes);
	const uploadedParts = [];
	for (const [index, partPath] of partPaths.entries()) {
		const partName = basename(partPath);
		const partSha256 = await sha256File(partPath);
		const partSize = statSync(partPath).size;
		await deleteReleaseAttachment(release, partName);
		const attachment = await uploadReleaseAttachment(release.id, partPath, partName);
		const url = attachment.browser_download_url ?? attachment.download_url ?? attachment.url;
		if (!url) {
			throw new Error(`Gitee did not return a download URL for part ${index + 1}`);
		}
		uploadedParts.push({ url: new URL(url, 'https://gitee.com').href, size: partSize, sha256: partSha256 });
	}

	for (const [index, part] of uploadedParts.entries()) {
		await verifyAnonymousDownload(part, index + 1);
	}

	const checksumName = `${installerName}.sha256`;
	const checksumPath = resolve(tempDirectory, checksumName);
	writeFileSync(checksumPath, `${fullSha256}  ${installerName}\n${uploadedParts.map((part, index) => `${part.sha256}  ${basename(partPaths[index])}`).join('\n')}\n`, 'utf8');
	await deleteReleaseAttachment(release, checksumName);
	await uploadReleaseAttachment(release.id, checksumPath, checksumName);

	const transitionName = `安装极速传-${version}-国内源.ps1`;
	const transitionPath = resolve(tempDirectory, transitionName);
	writeFileSync(transitionPath, createTransitionScript(installerName, fullSha256, uploadedParts), 'utf8');
	await deleteReleaseAttachment(release, transitionName);
	await uploadReleaseAttachment(release.id, transitionPath, transitionName);

	const manifest = {
		version,
		name: `极速传 ${version}`,
		notes: releaseNotes,
		pub_date: new Date().toISOString(),
		platforms: {
			'windows-x64': {
				url: `https://github.com/${githubRepository}/releases/download/${tag}/${installerName}`,
				sha256: fullSha256,
				parts: uploadedParts,
			}
		}
	};

	// This is intentionally the final mutation: clients never observe a manifest until every part is
	// anonymously downloadable and all integrity metadata has been produced.
	await putRepositoryFile('updater/update.json', `${JSON.stringify(manifest, null, 2)}\n`, `发布极速传 ${version} 更新清单`);

	console.log(`Published TurboFile ${version} multipart update to https://gitee.com/${owner}/${repo}/releases/tag/${tag}`);
	console.log(`Parts: ${uploadedParts.length} (maximum ${PART_BYTES} bytes each)`);
	console.log(`SHA256: ${fullSha256}`);
	console.log(`Manifest: https://gitee.com/${owner}/${repo}/raw/main/updater/update.json`);
} finally {
	rmSync(tempDirectory, { recursive: true, force: true });
}

async function splitInstaller(sourcePath, outputDirectory, sourceName) {
	const source = await open(sourcePath, 'r');
	const result = [];
	try {
		let position = 0;
		for (let index = 1; ; index++) {
			const partPath = resolve(outputDirectory, `${sourceName}.part${String(index).padStart(3, '0')}`);
			const target = await open(partPath, 'w');
			let written = 0;
			try {
				const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
				while (written < PART_BYTES) {
					const length = Math.min(buffer.byteLength, PART_BYTES - written);
					const { bytesRead } = await source.read(buffer, 0, length, position);
					if (!bytesRead) {
						break;
					}
					await target.write(buffer, 0, bytesRead, written);
					position += bytesRead;
					written += bytesRead;
				}
			} finally {
				await target.close();
			}
			if (!written) {
				rmSync(partPath, { force: true });
				break;
			}
			result.push(partPath);
			if (written < PART_BYTES) {
				break;
			}
		}
	} finally {
		await source.close();
	}
	return result;
}

async function ensurePublicRepository() {
	const existing = await gitee(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { allow404: true });
	if (existing) {
		return existing;
	}
	return gitee('/user/repos', {
		method: 'POST',
		body: {
			name: repo,
			description: '极速传（TurboFile）— 面向 Windows、SSH、NAS 与边缘设备的高速双栏文件工作台。此公开仓库仅用于产品展示和软件更新。',
			private: false,
			auto_init: true,
			default_branch: 'main',
			has_issues: true,
			has_wiki: false,
		}
	});
}

async function ensureMainBranch(repository) {
	const encodedOwner = encodeURIComponent(owner);
	const encodedRepo = encodeURIComponent(repo);
	const mainBranch = await gitee(`/repos/${encodedOwner}/${encodedRepo}/branches/main`, { allow404: true });
	if (!mainBranch) {
		const sourceBranch = repository.default_branch ?? 'master';
		await gitee(`/repos/${encodedOwner}/${encodedRepo}/branches`, {
			method: 'POST',
			body: { branch_name: 'main', refs: sourceBranch }
		});
	}

	if (repository.default_branch !== 'main') {
		await gitee(`/repos/${encodedOwner}/${encodedRepo}`, {
			method: 'PATCH',
			body: { name: repo, default_branch: 'main', private: false }
		});
	}
}

async function syncPublicRepositoryPresentation() {
	const readmes = [
		['README.md', createPublicReadme(readFileSync(resolve('README.md'), 'utf8'), false)],
		['README_CN.md', createPublicReadme(readFileSync(resolve('README_CN.md'), 'utf8'), true)],
	];
	for (const [filePath, content] of readmes) {
		await putRepositoryFile(filePath, content, `更新极速传 ${version} 产品介绍`);
	}
	for (const filePath of publicPresentationFiles) {
		const absolutePath = resolve(filePath);
		if (!existsSync(absolutePath)) {
			throw new Error(`Public presentation file not found: ${absolutePath}`);
		}
		await putRepositoryFile(filePath.replace(/\\/g, '/'), readFileSync(absolutePath), `更新极速传 ${version} 产品展示资源`);
	}
}

function createPublicReadme(source, chinese) {
	const releasesUrl = `https://gitee.com/${owner}/${repo}/releases`;
	const issuesUrl = `https://gitee.com/${owner}/${repo}/issues`;
	let result = source
		.replaceAll('https://github.com/DMwarrior/TurboFile-Windows/releases/latest', releasesUrl)
		.replace(/https:\/\/github\.com\/DMwarrior\/TurboFile-Windows\/releases\/download\/v[^/]+\/TurboFileSetup-win32-x64-[^)]+\.exe/g, releasesUrl)
		.replaceAll('https://github.com/DMwarrior/TurboFile-Windows/issues', issuesUrl)
		.replace(/<a href="https:\/\/gitee\.com\/[^\"]+\/releases"><img alt="[^"]+" src="https:\/\/img\.shields\.io\/github\/v\/release\/DMwarrior\/TurboFile-Windows\?[^\"]+"><\/a>/g,
			`<a href="${releasesUrl}"><img alt="${chinese ? '最新版本' : 'Latest release'}" src="https://img.shields.io/badge/version-${version}-2563eb?style=flat-square"></a>`)
		.replace(/TurboFileSetup-win32-x64-\d+\.\d+\.\d+\.exe/g, `TurboFileSetup-win32-x64-${version}.exe`)
		.replace(/v\d+\.\d+\.\d+/g, `v${version}`);
	result = result.replace(chinese
		? /\n## 从源码运行[\s\S]*?(?=\n## 项目状态)/
		: /\n## Build from source[\s\S]*?(?=\n## Project status)/, '');
	return `${result.trim()}\n`;
}

async function getOrCreateRelease(tagName, name, body) {
	const existing = await gitee(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(tagName)}`, { allow404: true });
	if (existing) {
		return gitee(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${existing.id}`, {
			method: 'PATCH',
			body: { name, body, prerelease: false }
		});
	}
	return gitee(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`, {
		method: 'POST',
		body: { tag_name: tagName, name, body, prerelease: false, target_commitish: 'main' }
	});
}

async function deleteReleaseAttachment(release, name) {
	const releaseWithAttachments = Array.isArray(release.attach_files)
		? release
		: await gitee(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${release.id}`);
	const attachment = releaseWithAttachments.attach_files?.find(file => file.name === name);
	if (!attachment) {
		return;
	}
	await gitee(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${release.id}/attach_files/${attachment.id}`, { method: 'DELETE' });
}

async function verifyAnonymousDownload(part, partNumber) {
	const response = await fetch(part.url, { redirect: 'follow' });
	if (!response.ok || !response.body) {
		throw new Error(`Gitee part ${partNumber} is not anonymously downloadable: HTTP ${response.status}`);
	}

	const hash = createHash('sha256');
	let size = 0;
	for await (const chunk of response.body) {
		const buffer = Buffer.from(chunk);
		size += buffer.byteLength;
		hash.update(buffer);
	}
	if (size !== part.size) {
		throw new Error(`Gitee part ${partNumber} anonymous size mismatch: expected ${part.size}, got ${size}`);
	}
	const actualSha256 = hash.digest('hex');
	if (actualSha256 !== part.sha256) {
		throw new Error(`Gitee part ${partNumber} anonymous SHA-256 mismatch: expected ${part.sha256}, got ${actualSha256}`);
	}
	console.log(`Verified anonymous Gitee part ${partNumber}: ${size} bytes`);
}

async function uploadReleaseAttachment(releaseId, filePath, name) {
	const form = new FormData();
	form.append('access_token', token);
	form.append('file', new Blob([readFileSync(filePath)]), name);
	return gitee(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/${releaseId}/attach_files`, { method: 'POST', form });
}

async function putRepositoryFile(filePath, content, message) {
	const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
	const existing = await gitee(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=main`, { allow404: true });
	try {
		await gitee(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`, {
			method: existing ? 'PUT' : 'POST',
			body: {
				content: (Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')).toString('base64'),
				message,
				branch: 'main',
				...(existing?.sha ? { sha: existing.sha } : {})
			}
		});
	} catch (error) {
		throw new Error(`Failed to ${existing ? 'update' : 'create'} ${filePath} on Gitee (sha: ${existing?.sha ? 'present' : 'missing'}): ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function gitee(path, options = {}) {
	const url = new URL(`${apiBase}${path}`);
	if (!options.form) {
		url.searchParams.set('access_token', token);
	}
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
		body: options.form ?? (options.body ? JSON.stringify({ access_token: token, ...options.body }) : undefined),
	});
	if (options.allow404 && response.status === 404) {
		return undefined;
	}
	if (!response.ok) {
		throw new Error(`Gitee request failed: ${response.status} ${await response.text()}`);
	}
	if (response.status === 204) {
		return undefined;
	}
	const result = await response.json();
	// Gitee's content and release lookup endpoints currently return HTTP 200 with an empty
	// object for some missing resources instead of HTTP 404. Treat that response exactly like
	// a not-found result when the caller opted into allow404, otherwise an update request is
	// attempted without the required SHA or release id.
	if (options.allow404 && result && typeof result === 'object' && (Array.isArray(result) ? result.length === 0 : Object.keys(result).length === 0)) {
		return undefined;
	}
	return result;
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

function createTransitionScript(targetName, targetSha256, parts) {
	const urls = parts.map(part => `'${part.url.replace(/'/g, "''")}'`).join(', ');
	const hashes = parts.map(part => `'${part.sha256}'`).join(', ');
	return `$ErrorActionPreference = 'Stop'\n$urls = @(${urls})\n$hashes = @(${hashes})\n$root = Join-Path $env:TEMP 'TurboFile-${version}'\nNew-Item -ItemType Directory -Force -Path $root | Out-Null\n$parts = @()\nfor ($index = 0; $index -lt $urls.Count; $index++) {\n  $part = Join-Path $root ('part{0:D3}' -f ($index + 1))\n  Invoke-WebRequest -UseBasicParsing -Uri $urls[$index] -OutFile $part\n  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $part).Hash.ToLowerInvariant() -ne $hashes[$index]) { throw \"分片校验失败：$($index + 1)\" }\n  $parts += $part\n}\n$installer = Join-Path $root '${targetName.replace(/'/g, "''")}'\n$output = [System.IO.File]::Create($installer)\ntry { foreach ($part in $parts) { $input = [System.IO.File]::OpenRead($part); try { $input.CopyTo($output) } finally { $input.Dispose() } } } finally { $output.Dispose() }\nif ((Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant() -ne '${targetSha256}') { throw '完整安装包校验失败。' }\nStart-Process -FilePath $installer\n`;
}
