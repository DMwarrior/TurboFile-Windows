/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITurboFileTransferEndpoint, ITurboFileTransferPlan } from '../../common/turbofile.js';
import { shouldRejectDirectoryTargetConflict } from '../../common/turbofileTransferConflictPolicy.js';

suite('TurboFileTransferConflictPolicy', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	const local = (path: string): ITurboFileTransferEndpoint => ({ kind: 'local', path });
	const ssh = (host: string, path: string, port = 22, username = 'ubuntu'): ITurboFileTransferEndpoint => ({
		kind: 'ssh',
		path,
		connection: { host, port, username }
	});
	const plan = (protocol: 'scp' | 'tar' | 'rsync'): ITurboFileTransferPlan => ({
		attempts: [{ protocol, route: protocol === 'rsync' ? 'direct' : 'local', reason: 'test' }]
	});

	test('allows same-device copy merges and rejects other non-rsync directory conflicts', () => {
		const localSource = local('D:\\source\\11');
		const localTarget = local('D:\\target\\11');
		const sshSource = ssh('192.168.9.64', '/home/ubuntu/source/11');
		const sameSshTarget = ssh('192.168.9.64', '/home/ubuntu/target/11');
		const otherSshTarget = ssh('192.168.9.62', '/home/th/target/11', 22, 'th');

		assert.deepStrictEqual([
			shouldRejectDirectoryTargetConflict({ source: localSource, target: localTarget, sourceType: 'directory', operation: 'copy', plan: plan('scp') }),
			shouldRejectDirectoryTargetConflict({ source: sshSource, target: sameSshTarget, sourceType: 'directory', operation: 'copy', plan: plan('scp') }),
			shouldRejectDirectoryTargetConflict({ source: sshSource, target: sameSshTarget, sourceType: 'directory', operation: 'move', plan: plan('scp') }),
			shouldRejectDirectoryTargetConflict({ source: sshSource, target: otherSshTarget, sourceType: 'directory', operation: 'copy', plan: plan('tar') }),
			shouldRejectDirectoryTargetConflict({ source: sshSource, target: otherSshTarget, sourceType: 'directory', operation: 'copy', plan: plan('rsync') }),
			shouldRejectDirectoryTargetConflict({ source: sshSource, target: otherSshTarget, sourceType: 'file', operation: 'copy', plan: plan('scp') })
		], [false, false, true, true, false, false]);
	});

	test('requires the complete SSH identity to match for a same-device merge', () => {
		const source = ssh('192.168.9.64', '/source/11', 22, 'ubuntu');

		assert.deepStrictEqual([
			shouldRejectDirectoryTargetConflict({ source, target: ssh('192.168.9.64', '/target/11', 2222, 'ubuntu'), sourceType: 'directory', operation: 'copy', plan: plan('scp') }),
			shouldRejectDirectoryTargetConflict({ source, target: ssh('192.168.9.64', '/target/11', 22, 'other'), sourceType: 'directory', operation: 'copy', plan: plan('scp') })
		], [true, true]);
	});
});
