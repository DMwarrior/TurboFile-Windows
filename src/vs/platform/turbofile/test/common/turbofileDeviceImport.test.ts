/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parseTurboFileSshConfig, tokenizeTurboFileSshConfigLine } from '../../common/turbofileDeviceImport.js';

suite('TurboFile OpenSSH device import', () => {
	const context = { home: 'C:\\Users\\example', username: 'local-user' };

	test('reads multiple aliases, case insensitive options, equals signs, quoted keys and IPv6', () => {
		const result = parseTurboFileSshConfig('Host build staging\n HostName=192.0.2.10\n User ubuntu\n Port 2222\n IdentityFile "C:\\Keys\\my key"\nHost ipv6\n HostName 2001:db8::1\n User root', context);
		assert.deepStrictEqual(result.sites.map(site => [site.name, site.host, site.username, site.port, site.privateKeyPath]), [
			['build', '192.0.2.10', 'ubuntu', 2222, 'C:\\Keys\\my key'], ['staging', '192.0.2.10', 'ubuntu', 2222, 'C:\\Keys\\my key'], ['ipv6', '2001:db8::1', 'root', 22, undefined]
		]);
	});

	test('applies first-obtained options and wildcard defaults with negative patterns', () => {
		const result = parseTurboFileSshConfig('User global-user\nHost *.internal !skip.internal\n Port 2200\nHost node.internal skip.internal\n User ignored-user\nHost *\n Port 22', context);
		assert.deepStrictEqual(result.sites.map(site => [site.name, site.username, site.port]), [['node.internal', 'global-user', 2200], ['skip.internal', 'global-user', 22]]);
	});

	test('does not create devices for wildcard-only rules or excluded host names', () => {
		const result = parseTurboFileSshConfig('Host * !excluded\n User root\nHost !negative *.example\n Port 22', context);
		assert.deepStrictEqual(result.sites, []);
	});

	test('expands home, login and hostname tokens in key paths without invoking a shell', () => {
		const site = parseTurboFileSshConfig('Host demo\n HostName example.test\n User ubuntu\n IdentityFile ~/.ssh/%h-%r', context).sites[0];
		assert.strictEqual(site.privateKeyPath, 'C:\\Users\\example\\.ssh\\example.test-ubuntu');
	});

	test('reports proxy and conditional authentication instead of silently dropping required settings', () => {
		const proxy = parseTurboFileSshConfig('Host jump-target\n User root\n ProxyJump gateway', context);
		const conditional = parseTurboFileSshConfig('Host guarded\n User root\nMatch exec "do-not-run"\n User admin', context);
		assert.deepStrictEqual([proxy.skipped, conditional.skipped], [[{ name: 'jump-target', reason: 'proxy' }], [{ name: 'guarded', reason: 'conditional' }]]);
	});

	test('respects enclosing Host conditions when flattening Include files', () => {
		const result = parseTurboFileSshConfig('Host parent\n User root\nTurboFileIncludeStart true\nHost inaccessible\n HostName wrong.test\nTurboFileIncludeEnd true\nHost independent\n HostName real.test', context);
		assert.deepStrictEqual(result.sites.map(site => site.name), ['parent', 'independent']);
	});

	test('tokenizes comments and Windows paths without evaluating shell syntax', () => {
		assert.deepStrictEqual([
			tokenizeTurboFileSshConfigLine('IdentityFile "C:\\Keys\\a # b" # comment'),
			tokenizeTurboFileSshConfigLine('HostName=example.test'),
			tokenizeTurboFileSshConfigLine('LocalCommand "$(do-not-run)"'),
			tokenizeTurboFileSshConfigLine('IdentityFile "unterminated')
		], [['IdentityFile', 'C:\\Keys\\a # b'], ['HostName', 'example.test'], ['LocalCommand', '$(do-not-run)'], []]);
	});
});
