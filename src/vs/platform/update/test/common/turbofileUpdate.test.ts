/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { resolveTurboFileUpdateFromGitHubRelease, resolveTurboFileUpdateFromManifest, shouldAutoInstallTurboFileSetupUpdate, shouldDisableWindowsUserSetupUpdatesAsAdmin } from '../../common/turbofileUpdate.js';
import { UpdateType } from '../../common/update.js';

suite('TurboFile GitHub Updates', () => {
	test('preserves bounded fallback URLs and package size alongside domestic parts', () => {
		const update = resolveTurboFileUpdateFromManifest({ version: '1.173.0', platforms: { 'windows-x64': {
			url: 'https://github.com/backup', size: 100,
			mirrors: ['file:///bad', 'https://api.github.com/asset'],
			parts: [{ url: 'https://gitee.com/domestic', size: 100 }]
		} } }, '1.172.0');
		assert.deepStrictEqual({ size: update?.size, mirrors: update?.mirrors, firstPart: update?.parts?.[0].url }, { size: 100, mirrors: ['https://api.github.com/asset'], firstPart: 'https://gitee.com/domestic' });
	});
	test('resolves newer Windows installer from static manifest', () => {
		const update = resolveTurboFileUpdateFromManifest({
			version: '1.123.0',
			name: 'TurboFile Windows 1.123.0',
			notes: 'Fix updates',
			pub_date: '2026-06-26T00:00:00.000Z',
			platforms: {
				'windows-x64': {
					url: 'https://example.com/TurboFileSetup-win32-x64-1.123.0.exe',
					sha256: 'FA2686F937F3FECB5BD430E33CD1CCF2DF3BCA6997930EB276F4915178279716',
				},
				'windows-arm64': {
					url: 'https://example.com/TurboFileSetup-win32-arm64-1.123.0.exe',
				},
			},
		}, '1.122.0', { arch: 'x64' });

		assert.deepStrictEqual(update, {
			version: '1.123.0',
			productVersion: '1.123.0',
			url: 'https://example.com/TurboFileSetup-win32-x64-1.123.0.exe',
			sha256hash: 'fa2686f937f3fecb5bd430e33cd1ccf2df3bca6997930eb276f4915178279716',
			releaseNotes: 'Fix updates',
		});
	});

	test('ignores stale or platformless static manifest', () => {
		const stale = resolveTurboFileUpdateFromManifest({
			version: '1.122.0',
			platforms: {
				'windows-x64': {
					url: 'https://example.com/TurboFileSetup-win32-x64-1.122.0.exe',
				},
			},
		}, '1.122.0', { arch: 'x64' });

		const missingPlatform = resolveTurboFileUpdateFromManifest({
			version: '1.123.0',
			platforms: {
				'windows-arm64': {
					url: 'https://example.com/TurboFileSetup-win32-arm64-1.123.0.exe',
				},
			},
		}, '1.122.0', { arch: 'x64' });

		assert.deepStrictEqual([stale, missingPlatform], [undefined, undefined]);
	});

	test('resolves Gitee multipart package with a GitHub complete-package fallback', () => {
		const hash = '0123456789abcdef'.repeat(4);
		const update = resolveTurboFileUpdateFromManifest({
			version: '1.168.0',
			platforms: {
				'windows-x64': {
					url: 'https://github.com/example/TurboFileSetup.exe',
					sha256: hash,
					parts: [
						{ url: 'https://gitee.com/example/part001', size: 90 * 1024 * 1024, sha256: hash.toUpperCase() },
						{ url: 'https://gitee.com/example/part002', size: 1024, sha256hash: hash }
					]
				}
			}
		}, '1.167.0', { arch: 'x64' });

		assert.deepStrictEqual(update, {
			version: '1.168.0',
			productVersion: '1.168.0',
			url: 'https://github.com/example/TurboFileSetup.exe',
			sha256hash: hash,
			parts: [
				{ url: 'https://gitee.com/example/part001', size: 90 * 1024 * 1024, sha256hash: hash },
				{ url: 'https://gitee.com/example/part002', size: 1024, sha256hash: hash }
			]
		});
	});

	test('accepts a multipart-only platform', () => {
		const update = resolveTurboFileUpdateFromManifest({
			version: '1.168.0',
			platforms: {
				'windows-x64': { parts: [{ url: 'https://gitee.com/example/part001', size: 42 }] }
			}
		}, '1.167.0', { arch: 'x64' });

		assert.deepStrictEqual(update, {
			version: '1.168.0',
			productVersion: '1.168.0',
			url: undefined,
			parts: [{ url: 'https://gitee.com/example/part001', size: 42, sha256hash: undefined }]
		});
	});

	test('downloads Gitee parts before the GitHub complete-package fallback', () => {
		const service = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/update/electron-main/updateService.win32.ts'), 'utf8');
		const downloadPackage = service.slice(service.indexOf('private async downloadUpdatePackage('), service.indexOf('private async downloadSingleUpdatePackage('));
		const downloadParts = service.slice(service.indexOf('private async downloadUpdateParts('), service.indexOf('private async getUpdatePackagePath('));

		assert.ok(downloadPackage.indexOf('downloadUpdateParts') < downloadPackage.indexOf('downloadSingleUpdatePackage'));
		assert.ok(downloadPackage.includes('falling back to the complete package'));
		assert.ok(downloadParts.includes('sha256: part.sha256hash'));
		assert.ok(downloadParts.includes('size: part.size'));
		assert.ok(downloadParts.includes('await checksum(downloadPath, update.sha256hash)'));
		assert.ok(downloadParts.includes("createWriteStream(downloadPath, { flags: index === 0 ? 'w' : 'a' })"));
	});

	test('resolves newer Windows installer asset', () => {
		const update = resolveTurboFileUpdateFromGitHubRelease({
			tag_name: 'v1.120.0',
			draft: false,
			prerelease: false,
			html_url: 'https://github.com/DMwarrior/TurboFile-Windows/releases/tag/v1.120.0',
			assets: [
				{ name: 'TurboFile-win32-x64.zip', browser_download_url: 'https://example.com/archive.zip' },
				{ name: 'TurboFileSetup-win32-x64-1.120.0.exe', browser_download_url: 'https://example.com/setup.exe' },
			],
		}, '1.119.0', { arch: 'x64' });

		assert.deepStrictEqual(update, {
			version: '1.120.0',
			productVersion: '1.120.0',
			url: 'https://example.com/setup.exe',
		});
	});

	test('ignores current or older release', () => {
		const update = resolveTurboFileUpdateFromGitHubRelease({
			tag_name: 'v1.119.0',
			draft: false,
			prerelease: false,
			html_url: 'https://github.com/DMwarrior/TurboFile-Windows/releases/tag/v1.119.0',
			assets: [
				{ name: 'TurboFileSetup-win32-x64-1.119.0.exe', browser_download_url: 'https://example.com/setup.exe' },
			],
		}, '1.119.0', { arch: 'x64' });

		assert.strictEqual(update, undefined);
	});

	test('ignores draft and prerelease by default', () => {
		const draft = resolveTurboFileUpdateFromGitHubRelease({
			tag_name: 'v1.120.0',
			draft: true,
			prerelease: false,
			html_url: 'https://github.com/DMwarrior/TurboFile-Windows/releases/tag/v1.120.0',
			assets: [
				{ name: 'TurboFileSetup-win32-x64-1.120.0.exe', browser_download_url: 'https://example.com/setup.exe' },
			],
		}, '1.119.0', { arch: 'x64' });

		const prerelease = resolveTurboFileUpdateFromGitHubRelease({
			tag_name: 'v1.120.0-beta.1',
			draft: false,
			prerelease: true,
			html_url: 'https://github.com/DMwarrior/TurboFile-Windows/releases/tag/v1.120.0-beta.1',
			assets: [
				{ name: 'TurboFileSetup-win32-x64-1.120.0-beta.1.exe', browser_download_url: 'https://example.com/setup.exe' },
			],
		}, '1.119.0', { arch: 'x64' });

		assert.deepStrictEqual([draft, prerelease], [undefined, undefined]);
	});

	test('honors custom asset name pattern', () => {
		const update = resolveTurboFileUpdateFromGitHubRelease({
			tag_name: 'release-1.120.0',
			draft: false,
			prerelease: false,
			html_url: 'https://github.com/DMwarrior/TurboFile-Windows/releases/tag/release-1.120.0',
			assets: [
				{ name: 'TurboFilePortable-win32-x64.exe', browser_download_url: 'https://example.com/portable.exe' },
				{ name: 'TurboFileUserSetup-win32-x64.exe', browser_download_url: 'https://example.com/user.exe' },
			],
		}, '1.119.0', {
			arch: 'x64',
			assetNamePattern: 'UserSetup.*\\.exe$',
		});

		assert.deepStrictEqual(update, {
			version: '1.120.0',
			productVersion: '1.120.0',
			url: 'https://example.com/user.exe',
		});
	});

	test('auto-installs TurboFile GitHub user setup updates after download', () => {
		assert.deepStrictEqual([
			shouldAutoInstallTurboFileSetupUpdate({ turboFileGitHubUpdatesEnabled: true, updateType: UpdateType.Setup, productTarget: 'user' }),
			shouldAutoInstallTurboFileSetupUpdate({ turboFileGitHubUpdatesEnabled: false, updateType: UpdateType.Setup, productTarget: 'user' }),
			shouldAutoInstallTurboFileSetupUpdate({ turboFileGitHubUpdatesEnabled: true, updateType: UpdateType.Archive, productTarget: 'user' }),
			shouldAutoInstallTurboFileSetupUpdate({ turboFileGitHubUpdatesEnabled: true, updateType: UpdateType.Setup, productTarget: 'system' }),
		], [true, false, false, false]);
	});

	test('keeps TurboFile GitHub user setup updates enabled when running as administrator', () => {
		assert.deepStrictEqual([
			shouldDisableWindowsUserSetupUpdatesAsAdmin({ isAdmin: true, productTarget: 'user', turboFileGitHubUpdatesEnabled: false }),
			shouldDisableWindowsUserSetupUpdatesAsAdmin({ isAdmin: true, productTarget: 'user', turboFileGitHubUpdatesEnabled: true }),
			shouldDisableWindowsUserSetupUpdatesAsAdmin({ isAdmin: false, productTarget: 'user', turboFileGitHubUpdatesEnabled: true }),
			shouldDisableWindowsUserSetupUpdatesAsAdmin({ isAdmin: true, productTarget: 'system', turboFileGitHubUpdatesEnabled: true }),
		], [true, false, false, false]);
	});
});
