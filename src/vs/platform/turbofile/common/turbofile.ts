/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

export const ITurboFileSshService = createDecorator<ITurboFileSshService>('turboFileSshService');

export interface ITurboFileSshService {
	readonly _serviceBrand: undefined;
	onDynamicSshTerminalData(sessionId: string): Event<string>;
	onDynamicSshTerminalExit(sessionId: string): Event<number | undefined>;
	onDynamicTransferProgress(progressId: string): Event<ITurboFileTransferProgressEvent>;
	testConnection(options: ITurboFileSshConnectionOptions): Promise<ITurboFileSshConnectionResult>;
	detectCapabilities(options: ITurboFileSshConnectionOptions): Promise<ITurboFileRemoteCapabilitiesResult>;
	installTransferDependencies(options: ITurboFileSshConnectionOptions, packages: readonly TurboFileTransferDependency[]): Promise<ITurboFileDependencyInstallResult>;
	listRemoteDirectory(options: ITurboFileSshConnectionOptions, path: string, refresh?: boolean): Promise<ITurboFileDirectoryListing>;
	listLocalDirectory(path: string, refresh?: boolean): Promise<ITurboFileDirectoryListing>;
	transferFile(request: ITurboFileTransferRequest): Promise<ITurboFileTransferResult>;
	transferBatch(request: ITurboFileBatchTransferRequest): Promise<ITurboFileBatchTransferResult>;
	cancelTransfer(progressId: string): Promise<ITurboFileFileOperationResult>;
	createDirectory(endpoint: ITurboFileTransferEndpoint): Promise<ITurboFileFileOperationResult>;
	deletePath(endpoint: ITurboFileTransferEndpoint, recursive?: boolean): Promise<ITurboFileFileOperationResult>;
	renamePath(endpoint: ITurboFileTransferEndpoint, targetPath: string): Promise<ITurboFileFileOperationResult>;
	calculatePathSize(endpoint: ITurboFileTransferEndpoint): Promise<ITurboFilePathSizeResult>;
	readWindowsClipboardFiles(): Promise<ITurboFileWindowsClipboardFilesResult>;
	startWindowsFileDrag(request: ITurboFileStartWindowsDragRequest): Promise<ITurboFileStartWindowsDragResult>;
	readFile(endpoint: ITurboFileTransferEndpoint, options?: ITurboFileReadFileOptions): Promise<ITurboFileReadFileResult>;
	readImage(endpoint: ITurboFileTransferEndpoint, options?: ITurboFileReadImageOptions): Promise<ITurboFileReadFileResult>;
	createImageResource(endpoint: ITurboFileTransferEndpoint, options?: ITurboFileImageResourceOptions): Promise<ITurboFileImageResourceResult>;
	releaseImageResource(url: string): Promise<void>;
	writeClipboardImage(content: string, mime: string, encoding?: TurboFileContentEncoding): Promise<ITurboFileFileOperationResult>;
	writeFile(endpoint: ITurboFileTransferEndpoint, content: string, encoding?: TurboFileContentEncoding): Promise<ITurboFileFileOperationResult>;
	compressPath(endpoint: ITurboFileTransferEndpoint, targetPath?: string): Promise<ITurboFileFileOperationResult>;
	extractPath(endpoint: ITurboFileTransferEndpoint, targetDirectory?: string): Promise<ITurboFileFileOperationResult>;
	createSshTerminal(options: ITurboFileSshConnectionOptions, cwd: string, cols: number, rows: number): Promise<ITurboFileSshTerminalSession>;
	writeSshTerminal(sessionId: string, data: string): Promise<void>;
	resizeSshTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
	shutdownSshTerminal(sessionId: string): Promise<void>;
}

export interface ITurboFileSshConnectionOptions {
	readonly host: string;
	readonly port: number;
	readonly username: string;
	readonly password?: string;
	readonly privateKey?: string;
	readonly privateKeyPath?: string;
	readonly passphrase?: string;
	readonly timeout?: number;
}

export interface ITurboFileSshConnectionResult {
	readonly ok: boolean;
	readonly message: string;
}

export interface ITurboFileSshTerminalSession {
	readonly sessionId: string;
	readonly cwd: string;
	readonly pid: number;
}

export type TurboFileFileType = 'file' | 'directory' | 'symlink' | 'unknown';

export interface ITurboFileFileEntry {
	readonly name: string;
	readonly path: string;
	readonly type: TurboFileFileType;
	readonly size: number;
	readonly modified: number;
	readonly permissions?: string;
}

export interface ITurboFileDirectoryListing {
	readonly path: string;
	readonly entries: ITurboFileFileEntry[];
}

export type TurboFileEndpointKind = 'local' | 'ssh';
export type TurboFileTransferProtocol = 'auto-fast' | 'sftp' | 'scp' | 'rsync' | 'tar';
export type TurboFileTransferDependency = 'rsync' | 'sshpass';
export type TurboFileTransferAttemptProtocol = Exclude<TurboFileTransferProtocol, 'auto-fast'>;
export type TurboFileTransferAttemptRoute = 'local' | 'direct' | 'relay';

export interface ITurboFileRemoteCapabilities {
	readonly ssh: boolean;
	readonly sftp: boolean;
	readonly scp: boolean;
	readonly rsync: boolean;
	readonly sshpass: boolean;
	readonly tar: boolean;
	readonly shell: boolean;
	readonly archive: boolean;
}

export interface ITurboFileRemoteCapabilitiesResult extends ITurboFileFileOperationResult {
	readonly capabilities?: ITurboFileRemoteCapabilities;
}

export interface ITurboFileDependencyInstallResult extends ITurboFileFileOperationResult {
	readonly installedPackages: readonly TurboFileTransferDependency[];
	readonly missingPackages: readonly TurboFileTransferDependency[];
	readonly capabilities?: ITurboFileRemoteCapabilities;
}

export interface ITurboFileTransferEndpoint {
	readonly kind: TurboFileEndpointKind;
	readonly path: string;
	readonly connection?: ITurboFileSshConnectionOptions;
	readonly label?: string;
	readonly supportsRsync?: boolean;
	readonly supportsTar?: boolean;
	readonly preferredProtocol?: TurboFileTransferProtocol;
}

export interface ITurboFileTransferRequest {
	readonly source: ITurboFileTransferEndpoint;
	readonly target: ITurboFileTransferEndpoint;
	readonly sourceType?: TurboFileFileType;
	readonly overwrite?: boolean;
	readonly progressId?: string;
	readonly expectedBytes?: number;
	readonly strategyHint?: 'auto' | 'direct' | 'relay';
	readonly clientStartedAt?: number;
}

export interface ITurboFileBatchTransferItem {
	readonly sourcePath: string;
	readonly targetName: string;
	readonly displayName?: string;
	readonly sourceType?: TurboFileFileType;
	readonly expectedBytes?: number;
}

export interface ITurboFileBatchTransferRequest {
	readonly source: ITurboFileTransferEndpoint;
	readonly targetDirectory: ITurboFileTransferEndpoint;
	readonly items: ITurboFileBatchTransferItem[];
	readonly operation?: 'copy' | 'move';
	readonly progressId?: string;
	readonly expectedBytes?: number;
	readonly strategyHint?: 'auto' | 'direct' | 'relay';
	readonly clientStartedAt?: number;
}

export interface ITurboFileTransferAttempt {
	readonly protocol: TurboFileTransferAttemptProtocol;
	readonly route: TurboFileTransferAttemptRoute;
	readonly reason: string;
}

export interface ITurboFileTransferPlan {
	readonly attempts: readonly ITurboFileTransferAttempt[];
}

export interface ITurboFileWindowsDragItem {
	readonly sourcePath: string;
	readonly name: string;
	readonly type: TurboFileFileType;
	readonly size?: number;
}

export interface ITurboFileStartWindowsDragRequest {
	readonly source: ITurboFileTransferEndpoint;
	readonly items: readonly ITurboFileWindowsDragItem[];
	readonly progressId?: string;
}

export interface ITurboFileStartWindowsDragResult extends ITurboFileFileOperationResult {
	readonly targetDirectory?: string;
	readonly canceled?: boolean;
}

export interface ITurboFileTransferResult {
	readonly ok: boolean;
	readonly strategy: 'local-copy' | 'remote-copy' | 'sftp-upload' | 'sftp-download' | 'scp-upload' | 'scp-download' | 'rsync-upload' | 'rsync-download' | 'tar-upload' | 'tar-download' | 'scp-direct' | 'scp-relay' | 'tar-direct' | 'tar-relay' | 'sftp-direct' | 'sftp-relay' | 'rsync-direct' | 'rsync-direct-parallel' | 'rsync-relay';
	readonly bytes: number;
	readonly message: string;
	readonly canceled?: boolean;
	readonly durationMs?: number;
	readonly averageBytesPerSecond?: number;
}

export interface ITurboFileBatchTransferFailure {
	readonly name: string;
	readonly path: string;
	readonly message: string;
}

export interface ITurboFileBatchTransferResult {
	readonly ok: boolean;
	readonly strategy: ITurboFileTransferResult['strategy'];
	readonly bytes: number;
	readonly message: string;
	readonly completed: number;
	readonly failed: number;
	readonly failures: ITurboFileBatchTransferFailure[];
	readonly canceled?: boolean;
	readonly durationMs?: number;
	readonly averageBytesPerSecond?: number;
}

export interface ITurboFileTransferProgressEvent {
	readonly progressId: string;
	readonly transferredBytes: number;
	readonly totalBytes: number;
	readonly phase: 'prepare' | 'transfer' | 'relay-download' | 'relay-upload' | 'rsync-direct' | 'complete';
	readonly detail?: string;
	readonly strategy?: ITurboFileTransferResult['strategy'];
	readonly route?: 'source-push' | 'target-pull' | 'relay';
	readonly completedItems?: number;
	readonly totalItems?: number;
	readonly currentName?: string;
	readonly toCheck?: number;
	readonly totalChecks?: number;
	readonly transferIndex?: number;
	readonly speedBytesPerSecond?: number;
}

export interface ITurboFileFileOperationResult {
	readonly ok: boolean;
	readonly message: string;
}

export interface ITurboFilePathSizeResult extends ITurboFileFileOperationResult {
	readonly size: number;
	readonly humanSize?: string;
}

export interface ITurboFileWindowsClipboardFilesResult extends ITurboFileFileOperationResult {
	readonly paths: string[];
	readonly operation: 'copy' | 'move';
}

export type TurboFileContentEncoding = 'utf8' | 'base64';

export interface ITurboFileReadFileOptions {
	readonly encoding?: TurboFileContentEncoding;
	readonly maxBytes?: number;
}

export interface ITurboFileReadImageOptions extends ITurboFileReadFileOptions {
	readonly width?: number;
	readonly height?: number;
	readonly quality?: number;
	readonly format?: 'jpeg' | 'png' | 'webp';
	readonly interpolation?: 'area' | 'lanczos';
	readonly forceOriginal?: boolean;
	readonly sourceSize?: number;
	readonly sourceModified?: number;
}

export interface ITurboFileImageResourceOptions extends Omit<ITurboFileReadImageOptions, 'encoding'> {
}

export interface ITurboFileImageResourceResult {
	readonly ok: boolean;
	readonly message: string;
	readonly url?: string;
	readonly mime?: string;
}

export interface ITurboFileReadFileResult {
	readonly ok: boolean;
	readonly message: string;
	readonly content: string;
	readonly encoding: TurboFileContentEncoding;
	readonly mime: string;
	readonly size: number;
	readonly width?: number;
	readonly height?: number;
	readonly originalWidth?: number;
	readonly originalHeight?: number;
}
