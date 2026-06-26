/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { resolveTurboFileUpdateFromGitHubRelease, resolveTurboFileUpdateFromManifest } from '../../common/turbofileUpdate.js';

suite('TurboFile GitHub Updates', () => {
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
			sha256hash: 'FA2686F937F3FECB5BD430E33CD1CCF2DF3BCA6997930EB276F4915178279716',
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
});
