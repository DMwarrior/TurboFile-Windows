/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const repoSlug = process.env.GITHUB_REPOSITORY ?? 'DMwarrior/TurboFile-Windows';
const [owner, repo] = repoSlug.split('/');
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const apiBase = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const updaterTag = process.env.TURBOFILE_UPDATER_TAG ?? 'updater';
const proxyPrefix = process.env.TURBOFILE_UPDATE_PROXY_PREFIX ?? '';
const assetPattern = new RegExp(process.env.TURBOFILE_UPDATE_ASSET_PATTERN ?? '^TurboFileSetup-win32-x64-(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)\\.exe$', 'i');

if (!owner || !repo) {
	throw new Error(`Invalid GITHUB_REPOSITORY value: ${repoSlug}`);
}
if (!token) {
	throw new Error('Missing GITHUB_TOKEN or GH_TOKEN');
}

const VERSION_PATTERN = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

const sourceRelease = await findLatestInstallerRelease();
const installerAsset = findInstallerAsset(sourceRelease);
if (!installerAsset?.browser_download_url) {
	throw new Error(`No Windows x64 installer asset found in release ${sourceRelease.tag_name}`);
}

const version = normalizeVersion(sourceRelease.tag_name) ?? normalizeVersion(sourceRelease.name) ?? normalizeVersion(installerAsset.name);
if (!version) {
	throw new Error(`Could not resolve version from release ${sourceRelease.tag_name}`);
}

const sha256 = await resolveSha256(installerAsset);
const manifest = createManifest(sourceRelease, installerAsset, version, sha256);
const proxyManifest = proxyPrefix ? createProxiedManifest(manifest, proxyPrefix) : manifest;
const updaterRelease = await getOrCreateUpdaterRelease();

await replaceReleaseAsset(updaterRelease, 'update.json', manifest);
await replaceReleaseAsset(updaterRelease, 'update-proxy.json', proxyManifest);

console.log(`Published TurboFile update manifest for ${version}`);
console.log(`Installer: ${installerAsset.name}`);
console.log(`URL: ${installerAsset.browser_download_url}`);
if (sha256) {
	console.log(`SHA256: ${sha256}`);
}

async function findLatestInstallerRelease() {
	const releases = await github(`/repos/${owner}/${repo}/releases?per_page=100`);
	const candidates = releases
		.filter(release => !release.draft && release.tag_name !== updaterTag && findInstallerAsset(release))
		.map(release => ({
			release,
			version: normalizeVersion(release.tag_name) ?? normalizeVersion(release.name) ?? normalizeVersion(findInstallerAsset(release)?.name),
		}))
		.filter(candidate => candidate.version)
		.sort((left, right) => compareVersions(right.version, left.version));

	if (!candidates.length) {
		throw new Error('No published release with a Windows x64 installer was found');
	}

	return candidates[0].release;
}

function findInstallerAsset(release) {
	return release.assets?.find(asset => assetPattern.test(asset.name ?? ''));
}

function createManifest(release, asset, version, sha256) {
	const platform = {
		url: asset.browser_download_url,
	};
	if (sha256) {
		platform.sha256 = sha256;
	}

	return {
		version,
		name: release.name || `TurboFile Windows ${version}`,
		notes: release.body || '',
		pub_date: release.published_at || release.created_at || new Date().toISOString(),
		platforms: {
			'windows-x64': platform,
		},
	};
}

function createProxiedManifest(manifest, prefix) {
	const result = JSON.parse(JSON.stringify(manifest));
	for (const platform of Object.values(result.platforms ?? {})) {
		if (platform.url && !platform.url.startsWith(prefix)) {
			platform.url = `${prefix}${platform.url}`;
		}
	}

	return result;
}

async function resolveSha256(asset) {
	if (process.env.TURBOFILE_UPDATE_SHA256) {
		return process.env.TURBOFILE_UPDATE_SHA256.toUpperCase();
	}

	if (process.env.TURBOFILE_UPDATE_LOCAL_FILE) {
		return (await sha256File(process.env.TURBOFILE_UPDATE_LOCAL_FILE)).toUpperCase();
	}

	if (typeof asset.digest === 'string' && asset.digest.toLowerCase().startsWith('sha256:')) {
		return asset.digest.slice('sha256:'.length).toUpperCase();
	}

	return undefined;
}

async function sha256File(filePath) {
	const hash = createHash('sha256');
	await new Promise((resolve, reject) => {
		createReadStream(filePath)
			.on('error', reject)
			.on('data', chunk => hash.update(chunk))
			.on('end', resolve);
	});
	return hash.digest('hex');
}

async function getOrCreateUpdaterRelease() {
	const existing = await github(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(updaterTag)}`, { allow404: true });
	if (existing) {
		return existing;
	}

	return github(`/repos/${owner}/${repo}/releases`, {
		method: 'POST',
		body: {
			tag_name: updaterTag,
			name: 'TurboFile update manifest',
			body: 'Static update metadata consumed by TurboFile.',
			draft: false,
			prerelease: false,
		},
	});
}

async function replaceReleaseAsset(release, name, data) {
	const existing = release.assets?.find(asset => asset.name === name);
	if (existing) {
		await github(`/repos/${owner}/${repo}/releases/assets/${existing.id}`, { method: 'DELETE' });
	}

	const uploadBaseUrl = release.upload_url.replace(/\{.*$/, '');
	const uploadUrl = `${uploadBaseUrl}?name=${encodeURIComponent(name)}`;
	const body = `${JSON.stringify(data, null, 2)}\n`;
	const response = await fetch(uploadUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'Content-Type': 'application/json',
			'Content-Length': String(Buffer.byteLength(body)),
		},
		body,
	});

	if (!response.ok) {
		throw new Error(`GitHub upload failed for ${name}: ${response.status} ${await response.text()}`);
	}
}

async function github(path, options = {}) {
	const response = await fetch(`${apiBase}${path}`, {
		method: options.method ?? 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
			...(options.headers ?? {}),
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
	});

	if (options.allow404 && response.status === 404) {
		return undefined;
	}

	if (!response.ok) {
		throw new Error(`GitHub request failed: ${response.status} ${await response.text()}`);
	}

	if (response.status === 204) {
		return undefined;
	}

	return response.json();
}

function normalizeVersion(value) {
	if (!value) {
		return undefined;
	}

	const match = VERSION_PATTERN.exec(value);
	return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}${match[4] ? `-${match[4]}` : ''}` : undefined;
}

function compareVersions(left, right) {
	const parsedLeft = parseVersion(left);
	const parsedRight = parseVersion(right);
	for (const key of ['major', 'minor', 'patch']) {
		const diff = parsedLeft[key] - parsedRight[key];
		if (diff !== 0) {
			return diff;
		}
	}

	if (!parsedLeft.prerelease && !parsedRight.prerelease) {
		return 0;
	}
	if (!parsedLeft.prerelease) {
		return 1;
	}
	if (!parsedRight.prerelease) {
		return -1;
	}

	return parsedLeft.prerelease.localeCompare(parsedRight.prerelease);
}

function parseVersion(version) {
	const match = VERSION_PATTERN.exec(version);
	if (!match) {
		throw new Error(`Invalid version: ${version}`);
	}

	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4],
	};
}
