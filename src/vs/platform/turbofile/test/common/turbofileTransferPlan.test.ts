/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITurboFileTransferEndpoint } from '../../common/turbofile.js';
import { resolveTransferPlan } from '../../common/turbofileTransferPlan.js';

suite('TurboFileTransferPlan', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	const local: ITurboFileTransferEndpoint = {
		kind: 'local',
		path: 'D:\\Work\\test'
	};

	const ssh = (preferredProtocol: ITurboFileTransferEndpoint['preferredProtocol'] = 'auto-fast', supportsRsync = true, supportsTar = true): ITurboFileTransferEndpoint => ({
		kind: 'ssh',
		path: '/home/th/Work/fankun/test',
		preferredProtocol,
		supportsRsync,
		supportsTar
	});

	test('falls back from scp to sftp for local to ssh single file auto-fast', () => {
		const plan = resolveTransferPlan({
			source: { ...local, path: 'D:\\Work\\test\\GanLaJiao_tongliao.zip' },
			target: ssh(),
			sourceType: 'file',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'scp', route: 'local' },
			{ protocol: 'sftp', route: 'local' }
		]);
	});

	test('uses sftp before relay for ssh to ssh single file auto-fast', () => {
		const plan = resolveTransferPlan({
			source: ssh(),
			target: ssh(),
			sourceType: 'file',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'scp', route: 'direct' },
			{ protocol: 'sftp', route: 'direct' },
			{ protocol: 'scp', route: 'relay' },
			{ protocol: 'sftp', route: 'relay' }
		]);
	});

	test('falls back from local to ssh directory tar to sftp', () => {
		const plan = resolveTransferPlan({
			source: { ...local, path: 'D:\\Work\\test\\1024x40' },
			target: ssh(),
			sourceType: 'directory',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'tar', route: 'local' },
			{ protocol: 'sftp', route: 'local' }
		]);
	});

	test('falls back from ssh to local directory tar to sftp', () => {
		const plan = resolveTransferPlan({
			source: ssh(),
			target: { ...local, path: 'D:\\Work\\test\\1024x40' },
			sourceType: 'directory',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'tar', route: 'local' },
			{ protocol: 'sftp', route: 'local' }
		]);
	});

	test('keeps sftp fallback when tar is selected explicitly', () => {
		const localPlan = resolveTransferPlan({
			source: { ...local, path: 'D:\\Work\\test\\1024x40' },
			target: ssh('tar'),
			sourceType: 'directory',
			itemCount: 1
		});
		const sshPlan = resolveTransferPlan({
			source: ssh('tar'),
			target: ssh('tar'),
			sourceType: 'directory',
			itemCount: 1
		});

		assert.deepStrictEqual({
			local: localPlan.attempts.map(({ protocol, route }) => ({ protocol, route })),
			ssh: sshPlan.attempts.map(({ protocol, route }) => ({ protocol, route }))
		}, {
			local: [
				{ protocol: 'tar', route: 'local' },
				{ protocol: 'sftp', route: 'local' }
			],
			ssh: [
				{ protocol: 'tar', route: 'direct' },
				{ protocol: 'tar', route: 'relay' },
				{ protocol: 'sftp', route: 'direct' },
				{ protocol: 'sftp', route: 'relay' }
			]
		});
	});

	test('keeps the explicit rsync fast path and falls back to scp then sftp', () => {
		const plan = resolveTransferPlan({
			source: { ...local, path: 'D:\\Work\\test\\1024x40' },
			target: ssh('rsync'),
			sourceType: 'directory',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'rsync', route: 'local' },
			{ protocol: 'scp', route: 'local' },
			{ protocol: 'sftp', route: 'local' }
		]);
	});

	test('keeps sftp as the final safety fallback for explicit scp', () => {
		const localPlan = resolveTransferPlan({
			source: { ...local, path: 'D:\\Work\\test\\file.bin' },
			target: ssh('scp'),
			sourceType: 'file'
		});
		const sshPlan = resolveTransferPlan({
			source: ssh('scp'),
			target: ssh('scp'),
			sourceType: 'file'
		});

		assert.deepStrictEqual(localPlan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'scp', route: 'local' },
			{ protocol: 'sftp', route: 'local' }
		]);
		assert.deepStrictEqual(sshPlan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'scp', route: 'direct' },
			{ protocol: 'scp', route: 'relay' },
			{ protocol: 'sftp', route: 'direct' },
			{ protocol: 'sftp', route: 'relay' }
		]);
	});

	test('keeps explicit ssh to ssh rsync attempts even when capability cache is missing support', () => {
		const plan = resolveTransferPlan({
			source: ssh('rsync', false),
			target: ssh('rsync', false),
			sourceType: 'directory',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'rsync', route: 'direct' },
			{ protocol: 'rsync', route: 'relay' },
			{ protocol: 'sftp', route: 'direct' },
			{ protocol: 'sftp', route: 'relay' }
		]);
	});

	test('uses tar first for local to ssh multi-file auto-fast', () => {
		const plan = resolveTransferPlan({
			source: { ...local, path: 'D:\\Work\\test' },
			target: ssh(),
			sourceType: 'file',
			itemCount: 3
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'tar', route: 'local' },
			{ protocol: 'sftp', route: 'local' }
		]);
	});

	test('negotiates mismatched ssh protocols to the more conservative concrete protocol', () => {
		const plan = resolveTransferPlan({
			source: ssh('rsync'),
			target: ssh('scp'),
			sourceType: 'file',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'scp', route: 'direct' },
			{ protocol: 'scp', route: 'relay' },
			{ protocol: 'sftp', route: 'direct' },
			{ protocol: 'sftp', route: 'relay' }
		]);
	});

	test('uses tar first for ssh to ssh directory and falls back to sftp on both routes', () => {
		const plan = resolveTransferPlan({
			source: ssh(),
			target: ssh(),
			sourceType: 'directory',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'tar', route: 'direct' },
			{ protocol: 'tar', route: 'relay' },
			{ protocol: 'sftp', route: 'direct' },
			{ protocol: 'sftp', route: 'relay' }
		]);
	});

	test('keeps tar and sftp fallback on the requested direct route', () => {
		const plan = resolveTransferPlan({
			source: ssh(),
			target: ssh(),
			sourceType: 'directory',
			itemCount: 1,
			strategyHint: 'direct'
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'tar', route: 'direct' },
			{ protocol: 'sftp', route: 'direct' }
		]);
	});

	test('keeps tar and sftp fallback on the requested relay route', () => {
		const plan = resolveTransferPlan({
			source: ssh(),
			target: ssh(),
			sourceType: 'directory',
			itemCount: 2,
			strategyHint: 'relay'
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'tar', route: 'relay' },
			{ protocol: 'sftp', route: 'relay' }
		]);
	});

	test('honors relay strategy hint before direct route cache or optimistic direct', () => {
		const plan = resolveTransferPlan({
			source: ssh('scp'),
			target: ssh('scp'),
			sourceType: 'file',
			itemCount: 1,
			strategyHint: 'relay'
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'scp', route: 'relay' },
			{ protocol: 'sftp', route: 'relay' }
		]);
	});

	test('isolates a concrete batch attempt from nested protocol fallbacks', () => {
		const plan = resolveTransferPlan({
			source: ssh(),
			target: ssh(),
			sourceType: 'file',
			itemCount: 8,
			strategyHint: 'direct',
			attemptProtocol: 'sftp'
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'sftp', route: 'direct' }
		]);
	});
});
