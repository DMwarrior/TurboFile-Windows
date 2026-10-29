/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { discoverTurboFileSavedSshDevices, ITurboFileRegistrySshData } from '../../node/turbofileSavedSsh.js';

suite('TurboFile saved SSH discovery', () => {
	let home: string;
	setup(async () => {
		await fs.mkdir(path.resolve('.build'), { recursive: true });
		home = await fs.mkdtemp(path.resolve('.build', 'saved-ssh-fixture-'));
		await fs.mkdir(path.join(home, '.ssh', 'conf.d'), { recursive: true });
	});
	teardown(async () => {
		assert.strictEqual(path.dirname(path.resolve(home)), path.resolve('.build'));
		assert.ok(path.basename(home).startsWith('saved-ssh-fixture-'));
		await fs.rm(home, { recursive: true, force: true });
	});

	test('discovers included aliases and default key paths without importing key contents or known_hosts', async () => {
		await fs.writeFile(path.join(home, '.ssh', 'config'), 'Include conf.d/*.conf\nHost local\n HostName local.example\n User ubuntu\n');
		await fs.writeFile(path.join(home, '.ssh', 'conf.d', 'a.conf'), 'Host imported\n HostName included.example\n User root\n');
		await fs.writeFile(path.join(home, '.ssh', 'id_ed25519'), 'DO_NOT_READ_KEY_CONTENTS');
		await fs.writeFile(path.join(home, '.ssh', 'known_hosts'), 'not-a-saved-device.example ssh-rsa example');
		const result = await discoverTurboFileSavedSshDevices({ home, username: 'local', windows: false, env: {} });
		assert.deepStrictEqual(result.sites.map(site => [site.name, site.host, site.source, site.privateKeyPath]), [
			['imported', 'included.example', 'OpenSSH', path.join(home, '.ssh', 'id_ed25519')], ['local', 'local.example', 'OpenSSH', path.join(home, '.ssh', 'id_ed25519')]
		]);
		assert.ok(!JSON.stringify(result).includes('DO_NOT_READ_KEY_CONTENTS'));
	});

	test('combines WinSCP, PuTTY, KiTTY and an INI file, retaining registry default settings', async () => {
		const ini = path.join(home, 'WinSCP.ini');
		await fs.writeFile(ini, '[Sessions\\INI]\nHostName=ini.example\nUserName=ubuntu\n');
		const result = await discoverTurboFileSavedSshDevices({ home, username: 'local', windows: true, env: {}, readRegistry: async (): Promise<ITurboFileRegistrySshData> => ({
			sessions: [
				{ source: 'WinSCP', name: 'Default%20Settings', values: { UserName: 'root', PortNumber: '2222' } },
				{ source: 'WinSCP', name: 'Registered', values: { HostName: 'registry.example', PasswordPlain: 'example secret' } },
				{ source: 'PuTTY', name: 'Putty%20SSH', values: { HostName: 'putty.example', UserName: 'ubuntu', Protocol: 'ssh' } },
				{ source: 'KiTTY', name: 'Kitty', values: { HostName: 'kitty.example', UserName: 'ubuntu', Protocol: 'ssh' } },
				{ source: 'PuTTY', name: 'Telnet', values: { HostName: 'telnet.example', UserName: 'ubuntu', Protocol: 'telnet' } }
			], iniPaths: [ini]
		}) });
		assert.deepStrictEqual(result.sites.map(site => [site.name, site.host, site.port, site.username, site.password]), [
			['Registered', 'registry.example', 2222, 'root', 'example secret'], ['Putty SSH', 'putty.example', 22, 'ubuntu', undefined], ['Kitty', 'kitty.example', 22, 'ubuntu', undefined], ['INI', 'ini.example', 22, 'ubuntu', undefined]
		]);
	});

	test('registry failure does not discard valid OpenSSH aliases', async () => {
		await fs.writeFile(path.join(home, '.ssh', 'config'), 'Host demo\n User root\n');
		const result = await discoverTurboFileSavedSshDevices({ home, windows: true, env: {}, readRegistry: async () => { throw new Error('Unavailable'); } });
		assert.deepStrictEqual([result.sites.map(site => site.name), result.warnings.length], [['demo'], 1]);
	});

	test('Include cycles are bounded and never run Match exec or LocalCommand', async () => {
		await fs.writeFile(path.join(home, '.ssh', 'config'), 'Include config\nHost do-not-import\nLocalCommand do-not-run');
		const result = await discoverTurboFileSavedSshDevices({ home, windows: false, env: {} });
		assert.deepStrictEqual([result.sites.length, result.warnings.length], [0, 1]);
	});

	test('returns an empty result for a profile with no saved devices', async () => {
		const result = await discoverTurboFileSavedSshDevices({ home, windows: false, env: {} });
		assert.deepStrictEqual(result, { sites: [], skipped: [], warnings: [] });
	});
});
