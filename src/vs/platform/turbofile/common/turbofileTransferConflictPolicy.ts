/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITurboFileTransferEndpoint, ITurboFileTransferPlan, TurboFileFileType } from './turbofile.js';

interface ITurboFileTransferConflictPolicyOptions {
	readonly source: ITurboFileTransferEndpoint;
	readonly target: ITurboFileTransferEndpoint;
	readonly sourceType: TurboFileFileType | undefined;
	readonly operation: 'copy' | 'move';
	readonly plan: ITurboFileTransferPlan;
}

export function shouldRejectDirectoryTargetConflict(options: ITurboFileTransferConflictPolicyOptions): boolean {
	if (options.sourceType !== 'directory' || isRsyncOnlyTransferPlan(options.plan)) {
		return false;
	}
	if (options.operation === 'copy' && isSameNativeDevice(options.source, options.target)) {
		return false;
	}
	return true;
}

function isRsyncOnlyTransferPlan(plan: ITurboFileTransferPlan): boolean {
	return plan.attempts.length > 0 && plan.attempts.every(attempt => attempt.protocol === 'rsync');
}

function isSameNativeDevice(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint): boolean {
	if (source.kind === 'local' && target.kind === 'local') {
		return true;
	}
	if (source.kind !== 'ssh' || target.kind !== 'ssh' || !source.connection || !target.connection) {
		return false;
	}
	return source.connection.host === target.connection.host
		&& (source.connection.port || 22) === (target.connection.port || 22)
		&& source.connection.username === target.connection.username;
}
