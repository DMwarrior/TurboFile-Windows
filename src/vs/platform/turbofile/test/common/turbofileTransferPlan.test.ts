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

	test('uses frozen scp fast path for local to ssh single file auto-fast', () => {
		const plan = resolveTransferPlan({
			source: { ...local, path: 'D:\\Work\\test\\GanLaJiao_tongliao.zip' },
			target: ssh(),
			sourceType: 'file',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'scp', route: 'local' }
		]);
	});

	test('starts local to ssh directory auto-fast with tar and no pre-scan fallback decision in UI', () => {
		const plan = resolveTransferPlan({
			source: { ...local, path: 'D:\\Work\\test\\1024x40' },
			target: ssh(),
			sourceType: 'directory',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'tar', route: 'local' }
		]);
	});

	test('does not cross protocol fallback for explicit rsync', () => {
		const plan = resolveTransferPlan({
			source: { ...local, path: 'D:\\Work\\test\\1024x40' },
			target: ssh('rsync'),
			sourceType: 'directory',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'rsync', route: 'local' }
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
			{ protocol: 'rsync', route: 'relay' }
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
			{ protocol: 'tar', route: 'local' }
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
			{ protocol: 'scp', route: 'relay' }
		]);
	});

	test('uses tar first for ssh to ssh directory auto-fast and keeps rsync as an explicit option only', () => {
		const plan = resolveTransferPlan({
			source: ssh(),
			target: ssh(),
			sourceType: 'directory',
			itemCount: 1
		});

		assert.deepStrictEqual(plan.attempts.map(({ protocol, route }) => ({ protocol, route })), [
			{ protocol: 'tar', route: 'direct' },
			{ protocol: 'tar', route: 'relay' }
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
			{ protocol: 'scp', route: 'relay' }
		]);
	});
});
