/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getTurboFileImportedDeviceIdentity, parseTurboFileWinScpIni } from '../../common/turbofileWinScpImport.js';

function savedPassword(value: string, binding: string, version: 'legacy' | 'standard' | 'extended' = 'standard'): string {
	const payload = Buffer.from(version === 'legacy' ? value : binding + value, 'utf8');
	const header = version === 'legacy' ? [payload.length] : version === 'extended' ? [255, 2, payload.length >> 8, payload.length & 255] : [255, 0, payload.length];
	// Synthetic WinSCP-format fixture, with three arbitrary padding bytes before the UTF-8 payload.
	return Buffer.from([...header, 3, 17, 91, 255, ...payload].map(byte => (255 - byte) ^ 163)).toString('hex').toUpperCase();
}

function importPassword(encoded: string, additional = '') {
	return parseTurboFileWinScpIni(`[Sessions\\Server]\nHostName=example.test\nUserName=ubuntu\nPassword=${encoded}\n${additional}`).sites[0];
}

suite('TurboFile WinSCP import', () => {
	test('reads Chinese folders, nonstandard ports, escaped directories and keys without retaining secrets', () => {
		const result = parseTurboFileWinScpIni(`\uFEFF; WinSCP export\r
[Configuration\\Security]
UseMasterPassword=1
[Sessions\\%EF%BB%BF%E7%94%9F%E4%BA%A7/server]
HostName=example.test
PortNumber=5206
UserName=ubuntu
RemoteDirectory=%EF%BB%BF/data/%E5%9B%BE%E7%89%87
PublicKeyFile=C:%5Ckeys%5Cid.ppk
Password=DO_NOT_IMPORT
PasswordPlain=DO_NOT_IMPORT
Passphrase=DO_NOT_IMPORT
Shell=DO_NOT_EXECUTE
`, false);
		assert.deepStrictEqual(result, { sites: [{ name: '生产/server', host: 'example.test', port: 5206, username: 'ubuntu', defaultPath: '/data/图片', authType: 'privateKey', privateKeyPath: 'C:\\keys\\id.ppk', preferredTransferProtocol: 'auto-fast', platform: 'unknown' }], skipped: [] });
	});

	test('inherits site defaults regardless of section order and respects explicit overrides', () => {
		const result = parseTurboFileWinScpIni(`[Sessions\\Server]
HostName=192.0.2.1
FSProtocol=0
[Sessions\\Default%20Settings]
UserName=root
PortNumber=2222
RemoteDirectory=/data
FSProtocol=2
[Sessions\\Second]
HostName=192.0.2.2
PortNumber=22
RemoteDirectory=
`);
		assert.deepStrictEqual(result.sites.map(site => [site.name, site.port, site.username, site.defaultPath, site.preferredTransferProtocol]), [['Server', 2222, 'root', '/data', 'scp'], ['Second', 22, 'root', '/', 'sftp']]);
	});

	test('skips FTP, proxy, tunnel, missing login, invalid ports and relative directories explicitly', () => {
		const result = parseTurboFileWinScpIni(`[Sessions\\Default Settings]
HostName=example.test
UserName=root
[Sessions\\FTP]
FSProtocol=5
[Sessions\\Proxy]
ProxyMethod=SOCKS5
[Sessions\\Tunnel]
Tunnel=on
[Sessions\\BadPort]
PortNumber=22junk
[Sessions\\BadPortRange]
PortNumber=65536
[Sessions\\NoUser]
UserName=
[Sessions\\Relative]
RemoteDirectory=~/work
[Sessions\\Valid]
FSProtocol=2
`);
		assert.deepStrictEqual({ names: result.sites.map(site => site.name), skipped: result.skipped }, { names: ['Valid'], skipped: [
			{ name: 'FTP', reason: 'protocol' }, { name: 'Proxy', reason: 'proxy' }, { name: 'Tunnel', reason: 'proxy' },
			{ name: 'BadPort', reason: 'invalid' }, { name: 'BadPortRange', reason: 'invalid' }, { name: 'NoUser', reason: 'invalid' }, { name: 'Relative', reason: 'invalid' }
		] });
	});

	test('handles duplicate INI sections and embedded equals signs without treating a URL as a host', () => {
		const result = parseTurboFileWinScpIni(`[Sessions\\Server]
HostName=example.test
UserName=ubuntu
[Sessions\\Server]
RemoteDirectory=/data/a=b
[Other]
HostName=ignored.test
`);
		assert.deepStrictEqual(result.sites.map(site => [site.name, site.defaultPath]), [['Server', '/data/a=b']]);
	});

	test('compares login and directory rather than display name, preserving distinct users and directories', () => {
		const base = { host: 'SERVER.test', port: 22, username: 'ubuntu', defaultPath: '/data/' };
		const identity = getTurboFileImportedDeviceIdentity(base);
		assert.deepStrictEqual([
			getTurboFileImportedDeviceIdentity({ ...base, host: 'server.test', defaultPath: '/data' }) === identity,
			getTurboFileImportedDeviceIdentity({ ...base, username: 'root' }) === identity,
			getTurboFileImportedDeviceIdentity({ ...base, defaultPath: '/other' }) === identity
		], [true, false, false]);
	});

	test('does not find sites in unrelated files or a default-only export', () => {
		assert.deepStrictEqual([parseTurboFileWinScpIni('not an export'), parseTurboFileWinScpIni('[Sessions\\Default Settings]\nUserName=root')], [{ sites: [], skipped: [] }, { sites: [], skipped: [] }]);
	});

	test('migrates legacy, standard UTF-8 and extended-length credentials', () => {
		for (const version of ['legacy', 'standard', 'extended'] as const) {
			const password = version === 'extended' ? '测试'.repeat(60) + ' !%=' : ' example 密码 !%=';
			const site = importPassword(savedPassword(password, 'ubuntuexample.test', version));
			assert.strictEqual(site.password, password);
			assert.strictEqual(site.credentialIssue, undefined);
		}
	});

	test('preserves plain password whitespace and migrates a private-key passphrase with its own binding', () => {
		const passphrase = 'example key passphrase';
		const site = importPassword('', `PasswordPlain=  example 密码  \nPublicKeyFile=C:%5Ckeys%5Cid.ppk\nPassphrase=${savedPassword(passphrase, 'C:\\keys\\id.ppk')}`);
		assert.deepStrictEqual({ password: site.password, passphrase: site.passphrase, authType: site.authType }, { password: '  example 密码  ', passphrase, authType: 'privateKey' });
	});

	test('does not inherit another login password from Default Settings', () => {
		const result = parseTurboFileWinScpIni('[Sessions\\Default Settings]\nPasswordPlain=example-secret\nUserName=ubuntu\n[Sessions\\Server]\nHostName=example.test');
		assert.strictEqual(result.sites[0].password, undefined);
	});

	test('reports protected, unknown, malformed, truncated and mismatched credentials without exposing ciphertext', () => {
		const valid = savedPassword('example secret', 'ubuntuexample.test');
		const fixtures = ['A35D001122', 'A35F001122', 'ABC', 'not-hex', valid.slice(0, 18), savedPassword('example secret', 'rootother.test')];
		assert.deepStrictEqual(fixtures.map(value => {
			const site = importPassword(value);
			return [site.password, site.credentialIssue, Object.values(site).includes(value)];
		}), [[undefined, 'protected', false], ...fixtures.slice(1).map(() => [undefined, 'invalid', false])]);
	});
});
