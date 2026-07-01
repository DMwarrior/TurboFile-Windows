/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUpdate, UpdateType } from './update.js';

export interface ITurboFileGitHubAsset {
	readonly name?: string;
	readonly browser_download_url?: string;
}

export interface ITurboFileGitHubRelease {
	readonly tag_name?: string;
	readonly name?: string;
	readonly draft?: boolean;
	readonly prerelease?: boolean;
	readonly html_url?: string;
	readonly assets?: readonly ITurboFileGitHubAsset[];
}

export interface ITurboFileUpdateResolveOptions {
	readonly arch?: string;
	readonly assetNamePattern?: string;
	readonly allowPrerelease?: boolean;
}

export interface ITurboFileAutoInstallOptions {
	readonly turboFileGitHubUpdatesEnabled: boolean;
	readonly updateType: UpdateType;
	readonly productTarget?: string;
}

export interface ITurboFileUserSetupAdminDisablementOptions {
	readonly isAdmin: boolean;
	readonly productTarget?: string;
	readonly turboFileGitHubUpdatesEnabled: boolean;
}

export interface ITurboFileUpdateManifestPlatform {
	readonly url?: string;
	readonly sha256?: string;
	readonly sha256hash?: string;
	readonly signature?: string;
}

export interface ITurboFileUpdateManifest {
	readonly version?: string;
	readonly name?: string;
	readonly notes?: string;
	readonly pub_date?: string;
	readonly platforms?: Record<string, ITurboFileUpdateManifestPlatform>;
}

interface IParsedVersion {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	readonly prerelease: readonly string[];
}

const VERSION_PATTERN = /(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>[0-9A-Za-z.-]+))?/;

export function normalizeTurboFileVersion(version: string | undefined): string | undefined {
	if (!version) {
		return undefined;
	}

	const match = VERSION_PATTERN.exec(version);
	if (!match?.groups) {
		return undefined;
	}

	const major = Number(match.groups.major);
	const minor = Number(match.groups.minor);
	const patch = Number(match.groups.patch);
	if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
		return undefined;
	}

	const prerelease = match.groups.prerelease ? `-${match.groups.prerelease}` : '';
	return `${major}.${minor}.${patch}${prerelease}`;
}

export function compareTurboFileVersions(left: string, right: string): number {
	const parsedLeft = parseTurboFileVersion(left);
	const parsedRight = parseTurboFileVersion(right);

	if (!parsedLeft || !parsedRight) {
		return left.localeCompare(right);
	}

	for (const key of ['major', 'minor', 'patch'] as const) {
		const diff = parsedLeft[key] - parsedRight[key];
		if (diff !== 0) {
			return diff;
		}
	}

	if (parsedLeft.prerelease.length === 0 && parsedRight.prerelease.length === 0) {
		return 0;
	}

	if (parsedLeft.prerelease.length === 0) {
		return 1;
	}

	if (parsedRight.prerelease.length === 0) {
		return -1;
	}

	const length = Math.max(parsedLeft.prerelease.length, parsedRight.prerelease.length);
	for (let i = 0; i < length; i++) {
		const leftPart = parsedLeft.prerelease[i];
		const rightPart = parsedRight.prerelease[i];
		if (leftPart === undefined) {
			return -1;
		}
		if (rightPart === undefined) {
			return 1;
		}

		const diff = comparePrereleaseIdentifier(leftPart, rightPart);
		if (diff !== 0) {
			return diff;
		}
	}

	return 0;
}

export function resolveTurboFileUpdateFromGitHubRelease(release: ITurboFileGitHubRelease, currentVersion: string, options: ITurboFileUpdateResolveOptions = {}): IUpdate | undefined {
	if (release.draft || (release.prerelease && !options.allowPrerelease)) {
		return undefined;
	}

	const version = normalizeTurboFileVersion(release.tag_name) ?? normalizeTurboFileVersion(release.name);
	const normalizedCurrentVersion = normalizeTurboFileVersion(currentVersion);
	if (!version || !normalizedCurrentVersion || compareTurboFileVersions(version, normalizedCurrentVersion) <= 0) {
		return undefined;
	}

	const asset = pickInstallerAsset(release.assets ?? [], options);
	if (!asset?.browser_download_url) {
		return undefined;
	}

	return {
		version,
		productVersion: version,
		url: asset.browser_download_url,
	};
}

export function resolveTurboFileUpdateFromManifest(manifest: ITurboFileUpdateManifest, currentVersion: string, options: ITurboFileUpdateResolveOptions = {}): IUpdate | undefined {
	const version = normalizeTurboFileVersion(manifest.version) ?? normalizeTurboFileVersion(manifest.name);
	const normalizedCurrentVersion = normalizeTurboFileVersion(currentVersion);
	if (!version || !normalizedCurrentVersion || compareTurboFileVersions(version, normalizedCurrentVersion) <= 0) {
		return undefined;
	}

	const platform = pickManifestPlatform(manifest.platforms, options.arch);
	if (!platform?.url) {
		return undefined;
	}

	const update: IUpdate = {
		version,
		productVersion: version,
		url: platform.url,
	};
	const sha256hash = normalizeTurboFileSha256Hash(platform.sha256hash ?? platform.sha256);
	if (sha256hash) {
		update.sha256hash = sha256hash;
	}

	return update;
}

function normalizeTurboFileSha256Hash(hash: string | undefined): string | undefined {
	const normalized = hash?.trim();
	if (!normalized) {
		return undefined;
	}

	return /^[a-fA-F0-9]{64}$/.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function shouldAutoInstallTurboFileSetupUpdate(options: ITurboFileAutoInstallOptions): boolean {
	return options.turboFileGitHubUpdatesEnabled
		&& options.updateType === UpdateType.Setup
		&& options.productTarget === 'user';
}

export function shouldDisableWindowsUserSetupUpdatesAsAdmin(options: ITurboFileUserSetupAdminDisablementOptions): boolean {
	return options.isAdmin
		&& options.productTarget === 'user'
		&& !options.turboFileGitHubUpdatesEnabled;
}

function parseTurboFileVersion(version: string): IParsedVersion | undefined {
	const normalized = normalizeTurboFileVersion(version);
	if (!normalized) {
		return undefined;
	}

	const match = VERSION_PATTERN.exec(normalized);
	if (!match?.groups) {
		return undefined;
	}

	return {
		major: Number(match.groups.major),
		minor: Number(match.groups.minor),
		patch: Number(match.groups.patch),
		prerelease: match.groups.prerelease ? match.groups.prerelease.split('.') : [],
	};
}

function comparePrereleaseIdentifier(left: string, right: string): number {
	const leftNumber = /^\d+$/.test(left) ? Number(left) : undefined;
	const rightNumber = /^\d+$/.test(right) ? Number(right) : undefined;

	if (leftNumber !== undefined && rightNumber !== undefined) {
		return leftNumber - rightNumber;
	}

	if (leftNumber !== undefined) {
		return -1;
	}

	if (rightNumber !== undefined) {
		return 1;
	}

	return left.localeCompare(right);
}

function pickInstallerAsset(assets: readonly ITurboFileGitHubAsset[], options: ITurboFileUpdateResolveOptions): ITurboFileGitHubAsset | undefined {
	const pattern = createAssetPattern(options.assetNamePattern);
	const arch = options.arch?.toLowerCase();

	return assets
		.filter(asset => !!asset.browser_download_url && !!asset.name && isInstallerAsset(asset.name, pattern))
		.sort((left, right) => scoreAsset(right.name!, arch) - scoreAsset(left.name!, arch))[0];
}

function createAssetPattern(pattern: string | undefined): RegExp | undefined {
	if (!pattern) {
		return undefined;
	}

	try {
		return new RegExp(pattern, 'i');
	} catch {
		return undefined;
	}
}

function isInstallerAsset(name: string, pattern: RegExp | undefined): boolean {
	if (!/\.exe$/i.test(name)) {
		return false;
	}

	return pattern ? pattern.test(name) : true;
}

function pickManifestPlatform(platforms: Record<string, ITurboFileUpdateManifestPlatform> | undefined, arch: string | undefined): ITurboFileUpdateManifestPlatform | undefined {
	if (!platforms) {
		return undefined;
	}

	const keys = getManifestPlatformKeys(arch);
	for (const key of keys) {
		const platform = platforms[key];
		if (platform?.url) {
			return platform;
		}
	}

	return undefined;
}

function getManifestPlatformKeys(arch: string | undefined): readonly string[] {
	switch (arch?.toLowerCase()) {
		case 'arm64':
			return ['windows-arm64', 'windows-aarch64', 'win32-arm64'];
		case 'ia32':
		case 'x86':
			return ['windows-x86', 'windows-ia32', 'windows-i686', 'win32-ia32'];
		case 'x64':
		default:
			return ['windows-x64', 'windows-x86_64', 'win32-x64', 'win64'];
	}
}

function scoreAsset(name: string, arch: string | undefined): number {
	const lowerName = name.toLowerCase();
	let score = 0;

	if (lowerName.includes('setup')) {
		score += 100;
	}
	if (lowerName.includes('user')) {
		score += 20;
	}
	if (lowerName.includes('win32') || lowerName.includes('windows')) {
		score += 10;
	}
	if (arch && lowerName.includes(arch)) {
		score += 5;
	}

	return score;
}
