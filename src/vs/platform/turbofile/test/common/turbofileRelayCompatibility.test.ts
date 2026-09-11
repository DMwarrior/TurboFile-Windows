/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileRelayCompatibility', () => {
	const service = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts'), 'utf8');
	const method = (name: string, nextName: string): string => {
		const start = service.indexOf(name);
		const end = service.indexOf(nextName, start);
		assert.ok(start >= 0 && end > start);
		return service.slice(start, end);
	};

	test('copies named SCP directories to an exact absent target without disabling filename validation', () => {
		const scp = method('private async tryDirectScpTransferRoute', 'private async prepareDirectTargetWithWarmSession');
		const command = method('function buildDirectScpCommand', 'function wrapRemoteCredentialCommand');
		assert.deepStrictEqual({
			noDotSource: !scp.includes('getRemoteDirectoryContentsPath(request.source.path)'),
			noNestedTarget: !scp.includes('buildPortablePosixMkdir(request.target.path)'),
			createsParent: scp.includes('buildPortablePosixMkdir(targetParentPath)'),
			noTrailingTargetSlash: !scp.includes('ensureTrailingRemoteSlash(request.target.path)'),
			keepsFilenameValidation: !command.includes("parts.push('-T')") && !command.includes("'scp -T'"),
			keepsRecursiveScp: command.includes("parts.push('-r')")
		}, { noDotSource: true, noNestedTarget: true, createsParent: true, noTrailingTargetSlash: true, keepsFilenameValidation: true, keepsRecursiveScp: true });
	});

	test('single and batch rsync relay share key-aware SSH commands and bounded credential cleanup', () => {
		const routes = [
			method('private async tryTunneledBatchRsyncRelayTransfer', 'private async tryBatchTarTransfer'),
			method('private async tryTunneledRsyncRelayTransfer', 'private async canUseLocalRsync')
		];
		assert.deepStrictEqual(routes.map(route => ({
			noPasswordGate: !/\bif \(!request\.(?:target|targetDirectory)\.connection\.password|\|\| !request\.(?:target|targetDirectory)\.connection\.password/.test(route),
			strictCredentialRead: route.includes('prepareRemoteScpCredential(client, target, request.progressId, undefined, true)'),
			keyAwareTransport: route.includes('buildOptimizedRsyncSshCommand(forwardedPort, !!target.password, sshBinary, credential.identityPath)'),
			probeUsesSameTransport: route.includes('canUseTargetRsyncThroughRelay(client, targetUserHost, sshTransport, sshpassPrefix, credential, request.progressId)'),
			commandProtectsCredential: route.includes('wrapRemoteCredentialCommand(rsyncCommand, credential.cleanupCommand, credential.activePath'),
			finallyRemovesCredential: route.indexOf('this.execRemote(client, credential.cleanupCommand, { timeoutMs: 2000 })') > route.lastIndexOf('finally {'),
			keepsForwarding: route.includes('socket.pipe(channel)') && route.includes('channel.pipe(socket)')
		})), routes.map(() => ({ noPasswordGate: true, strictCredentialRead: true, keyAwareTransport: true, probeUsesSameTransport: true, commandProtectsCredential: true, finallyRemovesCredential: true, keepsForwarding: true })));
	});

	test('key relay does not require sshpass and probe retains its credential for the data command', () => {
		const capability = method('private async canUseLocalRsync', 'private async canUseTargetRsyncThroughRelay');
		const probe = method('private async canUseTargetRsyncThroughRelay', 'private async tryTarRelayTransfer');
		assert.deepStrictEqual({
			passwordOnlyDependency: capability.includes("hasPassword ? ' && command -v sshpass >/dev/null 2>&1' : ''"),
			probeRetainsCredential: probe.includes('credential.cleanupCommand, credential.activePath, true'),
			probeCancelable: probe.includes('{ progressId }'),
			noHardcodedPasswordTransport: !probe.includes('buildCompatibleSshCommand(forwardedPort, true)')
		}, { passwordOnlyDependency: true, probeRetainsCredential: true, probeCancelable: true, noHardcodedPasswordTransport: true });
	});

	test('unknown SCP directory totals are finalized from content size after copying', () => {
		const scp = method('private async tryDirectScpTransferRoute', 'private async prepareDirectTargetWithWarmSession');
		assert.deepStrictEqual({
			resolvesAfterCopy: scp.indexOf('await this.getRemotePathContentSizeByCommand(request.target, request.progressId)') > scp.indexOf('await this.execRemote(client, scpCommand,'),
			noLastSampleAsFinal: !scp.includes('const resultBytes = Math.max(bytes, transferredBytes)'),
			keepsKnownTotalFast: scp.includes('sourceIsDirectory && bytes <= 0')
		}, { resolvesAfterCopy: true, noLastSampleAsFinal: true, keepsKnownTotalFast: true });
	});
});
