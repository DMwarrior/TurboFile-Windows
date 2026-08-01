/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITurboFileTransferAttempt, ITurboFileTransferEndpoint, ITurboFileTransferPlan, TurboFileFileType, TurboFileTransferAttemptProtocol, TurboFileTransferAttemptRoute, TurboFileTransferProtocol } from './turbofile.js';

interface IResolveTransferPlanOptions {
	readonly source: ITurboFileTransferEndpoint;
	readonly target: ITurboFileTransferEndpoint;
	readonly sourceType?: TurboFileFileType;
	readonly itemCount?: number;
	readonly strategyHint?: 'auto' | 'direct' | 'relay';
	readonly attemptProtocol?: TurboFileTransferAttemptProtocol;
}

type TransferShape = 'single-file' | 'multi-or-directory';

export function resolveTransferPlan(options: IResolveTransferPlanOptions): ITurboFileTransferPlan {
	const shape = getTransferShape(options.sourceType, options.itemCount);
	const attempts = createTransferAttempts(options, shape);
	const protocolAttempts = options.attemptProtocol ? attempts.filter(attempt => attempt.protocol === options.attemptProtocol) : attempts;
	return {
		attempts: dedupeAttempts(applyStrategyHint(protocolAttempts, options.strategyHint))
	};
}

function getTransferShape(sourceType: TurboFileFileType | undefined, itemCount = 1): TransferShape {
	return itemCount > 1 || sourceType === 'directory' ? 'multi-or-directory' : 'single-file';
}

function createTransferAttempts(options: IResolveTransferPlanOptions, shape: TransferShape): ITurboFileTransferAttempt[] {
	const { source, target } = options;
	if (source.kind === 'local' && target.kind === 'local') {
		return [attempt('scp', 'local', 'Local endpoints use native local copy.')];
	}
	if (source.kind === 'ssh' && target.kind === 'ssh' && isSameSshEndpoint(source, target)) {
		return [attempt('scp', 'local', 'Same SSH endpoint uses native remote copy.')];
	}
	if (source.kind === 'local' && target.kind === 'ssh') {
		return createLocalSshAttempts(getLocalSshProtocol(target), shape, 'upload');
	}
	if (source.kind === 'ssh' && target.kind === 'local') {
		return createLocalSshAttempts(getLocalSshProtocol(source), shape, 'download');
	}
	if (source.kind === 'ssh' && target.kind === 'ssh') {
		return createSshSshAttempts(source, target, shape);
	}
	return [];
}

function createLocalSshAttempts(protocol: TurboFileTransferProtocol, shape: TransferShape, direction: 'upload' | 'download'): ITurboFileTransferAttempt[] {
	const reasonPrefix = direction === 'upload' ? 'Local to SSH' : 'SSH to local';
	switch (protocol) {
		case 'sftp':
			return [attempt('sftp', 'local', `${reasonPrefix}: explicit SFTP.`)];
		case 'scp':
			return [
				attempt('scp', 'local', `${reasonPrefix}: explicit SCP.`),
				attempt('sftp', 'local', `${reasonPrefix}: explicit SCP falls back to SFTP.`)
			];
		case 'rsync':
			return [
				attempt('rsync', 'local', `${reasonPrefix}: explicit rsync.`),
				attempt('scp', 'local', `${reasonPrefix}: explicit rsync falls back to SCP.`),
				attempt('sftp', 'local', `${reasonPrefix}: explicit rsync falls back to SFTP.`)
			];
		case 'tar':
			return shape === 'multi-or-directory'
				? [
					attempt('tar', 'local', `${reasonPrefix}: explicit tar.`),
					attempt('sftp', 'local', `${reasonPrefix}: explicit tar falls back to SFTP.`)
				]
				: [
					attempt('scp', 'local', `${reasonPrefix}: tar does not apply to a single file; use frozen SCP fast path.`),
					attempt('sftp', 'local', `${reasonPrefix}: single-file SCP falls back to SFTP.`)
				];
		case 'auto-fast':
		default:
			return shape === 'single-file'
				? [
					attempt('scp', 'local', `${reasonPrefix}: auto-fast single file starts with SCP.`),
					attempt('sftp', 'local', `${reasonPrefix}: SCP failure falls back to SFTP.`)
				]
				: [
					attempt('tar', 'local', `${reasonPrefix}: auto-fast multi item or directory uses tar.`),
					attempt('sftp', 'local', `${reasonPrefix}: tar failure falls back to SFTP.`)
				];
	}
}

function createSshSshAttempts(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint, shape: TransferShape): ITurboFileTransferAttempt[] {
	const protocol = negotiateSshSshProtocol(source.preferredProtocol, target.preferredProtocol);
	if (protocol !== 'auto-fast') {
		return createExplicitSshSshAttempts(protocol, source, target);
	}
	if (shape === 'single-file') {
		return [
			attempt('scp', 'direct', 'SSH to SSH auto-fast single file starts with direct SCP.'),
			attempt('sftp', 'direct', 'SSH to SSH direct SCP failure falls back to direct SFTP.'),
			attempt('sftp', 'relay', 'SSH to SSH direct transports unavailable; reuse warm SFTP relay sessions.'),
			attempt('scp', 'relay', 'SSH to SSH warm SFTP relay failure falls back to SCP relay.')
		];
	}
	return [
		attempt('tar', 'direct', 'SSH to SSH auto-fast multi item or directory starts with direct tar.'),
		attempt('tar', 'relay', 'SSH to SSH auto-fast falls back to tar relay.'),
		attempt('sftp', 'direct', 'SSH to SSH tar failure falls back to direct SFTP.'),
		attempt('sftp', 'relay', 'SSH to SSH direct SFTP falls back to SFTP relay.')
	];
}

function createExplicitSshSshAttempts(protocol: TurboFileTransferAttemptProtocol, source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint): ITurboFileTransferAttempt[] {
	void source;
	void target;
	const attempts = [
		attempt(protocol, 'direct', `SSH to SSH explicit ${protocol} starts with optimistic direct.`),
		attempt(protocol, 'relay', `SSH to SSH explicit ${protocol} falls back to same-protocol relay.`)
	];
	if (protocol !== 'sftp') {
		attempts.push(
			attempt('sftp', 'direct', `SSH to SSH explicit ${protocol} failure falls back to direct SFTP.`),
			attempt('sftp', 'relay', `SSH to SSH explicit ${protocol} failure falls back to SFTP relay.`)
		);
	}
	return attempts;
}

function negotiateSshSshProtocol(sourceProtocol: TurboFileTransferProtocol | undefined, targetProtocol: TurboFileTransferProtocol | undefined): TurboFileTransferProtocol {
	const source = sourceProtocol ?? 'auto-fast';
	const target = targetProtocol ?? 'auto-fast';
	if (source === target) {
		return source;
	}
	if (source === 'sftp' || target === 'sftp') {
		return 'sftp';
	}
	if (source === 'auto-fast') {
		return target;
	}
	if (target === 'auto-fast') {
		return source;
	}
	return getMoreConservativeProtocol(source, target);
}

function getMoreConservativeProtocol(left: TurboFileTransferAttemptProtocol, right: TurboFileTransferAttemptProtocol): TurboFileTransferAttemptProtocol {
	const rank = (protocol: TurboFileTransferAttemptProtocol): number => {
		switch (protocol) {
			case 'sftp':
				return 4;
			case 'scp':
				return 3;
			case 'tar':
				return 2;
			case 'rsync':
				return 1;
		}
	};
	return rank(left) >= rank(right) ? left : right;
}

function applyStrategyHint(attempts: readonly ITurboFileTransferAttempt[], strategyHint: 'auto' | 'direct' | 'relay' | undefined): readonly ITurboFileTransferAttempt[] {
	if (strategyHint !== 'direct' && strategyHint !== 'relay') {
		return attempts;
	}
	return attempts.filter(attempt => attempt.route === 'local' || attempt.route === strategyHint);
}

function dedupeAttempts(attempts: readonly ITurboFileTransferAttempt[]): ITurboFileTransferAttempt[] {
	const seen = new Set<string>();
	const result: ITurboFileTransferAttempt[] = [];
	for (const attempt of attempts) {
		const key = `${attempt.protocol}:${attempt.route}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(attempt);
	}
	return result;
}

function attempt(protocol: TurboFileTransferAttemptProtocol, route: TurboFileTransferAttemptRoute, reason: string): ITurboFileTransferAttempt {
	return { protocol, route, reason };
}

function getLocalSshProtocol(sshEndpoint: ITurboFileTransferEndpoint): TurboFileTransferProtocol {
	return sshEndpoint.preferredProtocol ?? 'auto-fast';
}

function isSameSshEndpoint(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint): boolean {
	return !!source.connection
		&& !!target.connection
		&& source.connection.host === target.connection.host
		&& source.connection.port === target.connection.port
		&& source.connection.username === target.connection.username;
}
