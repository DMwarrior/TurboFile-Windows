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
	listRemoteDirectory(options: ITurboFileSshConnectionOptions, path: string, refresh?: boolean): Promise<ITurboFileDirectoryListing>;
	listLocalDirectory(path: string, refresh?: boolean): Promise<ITurboFileDirectoryListing>;
	transferFile(request: ITurboFileTransferRequest): Promise<ITurboFileTransferResult>;
	cancelTransfer(progressId: string): Promise<ITurboFileFileOperationResult>;
	createDirectory(endpoint: ITurboFileTransferEndpoint): Promise<ITurboFileFileOperationResult>;
	deletePath(endpoint: ITurboFileTransferEndpoint, recursive?: boolean): Promise<ITurboFileFileOperationResult>;
	renamePath(endpoint: ITurboFileTransferEndpoint, targetPath: string): Promise<ITurboFileFileOperationResult>;
	readFile(endpoint: ITurboFileTransferEndpoint, options?: ITurboFileReadFileOptions): Promise<ITurboFileReadFileResult>;
	readImage(endpoint: ITurboFileTransferEndpoint, options?: ITurboFileReadImageOptions): Promise<ITurboFileReadFileResult>;
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

export interface ITurboFileTransferEndpoint {
	readonly kind: TurboFileEndpointKind;
	readonly path: string;
	readonly connection?: ITurboFileSshConnectionOptions;
	readonly label?: string;
}

export interface ITurboFileTransferRequest {
	readonly source: ITurboFileTransferEndpoint;
	readonly target: ITurboFileTransferEndpoint;
	readonly sourceType?: TurboFileFileType;
	readonly overwrite?: boolean;
	readonly progressId?: string;
	readonly strategyHint?: 'auto' | 'direct' | 'relay';
}

export interface ITurboFileTransferResult {
	readonly ok: boolean;
	readonly strategy: 'local-copy' | 'remote-copy' | 'sftp-upload' | 'sftp-download' | 'sftp-relay' | 'rsync-direct';
	readonly bytes: number;
	readonly message: string;
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
}

export interface ITurboFileFileOperationResult {
	readonly ok: boolean;
	readonly message: string;
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
}
