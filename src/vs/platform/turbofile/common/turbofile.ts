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
	/**
	 * Lists a remote directory returning only names + type, skipping the per-file stat for size and
	 * modified time. This loads huge directories instantly (one round trip, no stat); the missing
	 * size/modified are filled in afterwards for visible rows via {@link statRemoteEntries}.
	 */
	listRemoteDirectoryNames(options: ITurboFileSshConnectionOptions, path: string, refresh?: boolean): Promise<ITurboFileDirectoryListing>;
	/**
	 * Fetches size + modified time for specific entries of a remote directory in a single round trip.
	 * Used to lazily enrich the rows currently visible after a names-only listing.
	 */
	statRemoteEntries(options: ITurboFileSshConnectionOptions, directoryPath: string, names: readonly string[]): Promise<ITurboFileEntryStat[]>;
	listLocalDirectory(path: string, refresh?: boolean): Promise<ITurboFileDirectoryListing>;
	listLocalDirectoryNames(path: string, refresh?: boolean): Promise<ITurboFileDirectoryListing>;
	statLocalEntries(directoryPath: string, names: readonly string[]): Promise<ITurboFileEntryStat[]>;
	normalizeLocalWindowsPaths(paths: readonly string[]): Promise<string[]>;
	/**
	 * Resolves the real local Desktop directory, honoring a Desktop relocated to another drive
	 * (e.g. D:\Desktop) instead of assuming the profile's `%USERPROFILE%\Desktop`. Returns an empty
	 * string if it cannot be determined.
	 */
	getLocalDesktopPath(): Promise<string>;
	transferFile(request: ITurboFileTransferRequest): Promise<ITurboFileTransferResult>;
	transferBatch(request: ITurboFileBatchTransferRequest): Promise<ITurboFileBatchTransferResult>;
	cancelTransfer(progressId: string): Promise<ITurboFileFileOperationResult>;
	createDirectory(endpoint: ITurboFileTransferEndpoint): Promise<ITurboFileFileOperationResult>;
	movePathsToTrash(request: ITurboFileMoveToTrashRequest): Promise<ITurboFileTrashOperationResult>;
	listTrashItems(device: ITurboFileTrashDevice): Promise<ITurboFileTrashListing>;
	restoreTrashItems(request: ITurboFileRestoreTrashRequest): Promise<ITurboFileTrashOperationResult>;
	permanentlyDeleteTrashItems(request: ITurboFileTrashItemsRequest): Promise<ITurboFileTrashOperationResult>;
	emptyTrash(device: ITurboFileTrashDevice): Promise<ITurboFileTrashOperationResult>;
	getTrashState(device: ITurboFileTrashDevice): Promise<ITurboFileTrashState>;
	deletePath(endpoint: ITurboFileTransferEndpoint, recursive?: boolean): Promise<ITurboFileFileOperationResult>;
	/**
	 * Deletes many paths in as few round trips as possible (POSIX remote: a single `xargs -0 rm`).
	 * All endpoints must target the same device/connection.
	 */
	deletePaths(endpoints: readonly ITurboFileTransferEndpoint[], recursive?: boolean, useSudo?: boolean): Promise<ITurboFileFileOperationResult>;
	renamePath(endpoint: ITurboFileTransferEndpoint, targetPath: string): Promise<ITurboFileFileOperationResult>;
	/**
	 * Moves many paths into a single target directory in as few round trips as possible (POSIX remote:
	 * one `xargs -0 mv` — a metadata-only rename, no data copied). All sources must be on the same
	 * device as the target directory.
	 */
	movePathsIntoDirectory(sources: readonly ITurboFileTransferEndpoint[], targetDirectory: string): Promise<ITurboFileFileOperationResult>;
	calculatePathSize(endpoint: ITurboFileTransferEndpoint): Promise<ITurboFilePathSizeResult>;
	readWindowsClipboardFiles(): Promise<ITurboFileWindowsClipboardFilesResult>;
	startWindowsFileDrag(request: ITurboFileStartWindowsDragRequest): Promise<ITurboFileStartWindowsDragResult>;
	completeWindowsFileDrag(sessionId: string): Promise<void>;
	readFile(endpoint: ITurboFileTransferEndpoint, options?: ITurboFileReadFileOptions): Promise<ITurboFileReadFileResult>;
	readImage(endpoint: ITurboFileTransferEndpoint, options?: ITurboFileReadImageOptions): Promise<ITurboFileReadFileResult>;
	/**
	 * Reads the raw bytes of many files belonging to the same device in a single round trip (SSH: one
	 * `cat` stream, no per-file processing). Used to load a whole visible page of image-grid
	 * thumbnails at once instead of one fetch per card. The endpoint provides the connection; `paths`
	 * are absolute remote paths. Files larger than the batch limit come back with `oversized: true` so
	 * the caller can fall back to the per-image path.
	 */
	readImageBatch(endpoint: ITurboFileTransferEndpoint, paths: readonly string[], maxWidth?: number): Promise<ITurboFileImageBatchEntry[]>;
	/** Reads file stat and original image dimensions in bounded batches for stable grid sorting. */
	readImageMetadataBatch(endpoint: ITurboFileTransferEndpoint, paths: readonly string[]): Promise<ITurboFileImageMetadataEntry[]>;
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

export interface ITurboFileEntryStat {
	readonly name: string;
	readonly size: number;
	readonly modified: number;
}

export interface ITurboFileImageBatchEntry {
	readonly path: string;
	readonly ok: boolean;
	/** Base64-encoded raw file bytes when `ok`. */
	readonly content?: string;
	readonly mime?: string;
	/** Original source dimensions when the returned bytes were transformed into a thumbnail. */
	readonly originalWidth?: number;
	readonly originalHeight?: number;
	/** True when the file exceeded the batch size limit; the caller should load it individually. */
	readonly oversized?: boolean;
	readonly message?: string;
	/** True when the batch transport failed transiently; callers should retry instead of caching a file error. */
	readonly transient?: boolean;
}

export type TurboFileEndpointKind = 'local' | 'ssh';
export type TurboFileTransferProtocol = 'auto-fast' | 'sftp' | 'scp' | 'rsync' | 'tar';
export type TurboFileTransferDependency = 'rsync' | 'sshpass';
export type TurboFileTransferAttemptProtocol = Exclude<TurboFileTransferProtocol, 'auto-fast'>;
export type TurboFileTransferAttemptRoute = 'local' | 'direct' | 'relay';
export type TurboFileTransferProgressState = 'queued' | 'preparing' | 'transferring' | 'fallback' | 'completed' | 'failed' | 'canceled';

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

export interface ITurboFileTrashDevice {
	readonly kind: TurboFileEndpointKind;
	readonly connection?: ITurboFileSshConnectionOptions;
	readonly label?: string;
	readonly localUserIdentity?: string;
	readonly windows?: boolean;
}

export interface ITurboFileTrashSource {
	readonly endpoint: ITurboFileTransferEndpoint;
	readonly type: TurboFileFileType;
	readonly knownSize?: number;
}

export interface ITurboFileMoveToTrashRequest {
	readonly device: ITurboFileTrashDevice;
	readonly sources: readonly ITurboFileTrashSource[];
}

export interface ITurboFileTrashItemsRequest {
	readonly device: ITurboFileTrashDevice;
	readonly items: readonly ITurboFileTrashItem[];
}

export interface ITurboFileRestoreTrashRequest extends ITurboFileTrashItemsRequest {
	readonly conflictPolicy: 'cancel' | 'keepBoth';
}

export interface ITurboFileTrashItem {
	readonly id: string;
	readonly originalName: string;
	readonly originalPath: string;
	readonly deletedAt: number;
	readonly type: TurboFileFileType;
	readonly knownSize?: number;
	readonly volumeId: string;
	readonly trashRoot: string;
	readonly payloadPath: string;
	readonly deviceIdentity: string;
	readonly damaged?: boolean;
	readonly damageMessage?: string;
}

export interface ITurboFileTrashItemResult {
	readonly id?: string;
	readonly path: string;
	readonly ok: boolean;
	readonly message: string;
	readonly conflict?: boolean;
	readonly restoredPath?: string;
}

export interface ITurboFileTrashOperationResult extends ITurboFileFileOperationResult {
	readonly completed: number;
	readonly failed: number;
	readonly results: readonly ITurboFileTrashItemResult[];
}

export interface ITurboFileTrashListing extends ITurboFileFileOperationResult {
	readonly items: readonly ITurboFileTrashItem[];
	readonly inaccessibleVolumes: readonly string[];
}

export interface ITurboFileTrashState extends ITurboFileFileOperationResult {
	readonly hasItems: boolean;
	readonly itemCount: number;
}

export interface ITurboFileTransferRequest {
	readonly source: ITurboFileTransferEndpoint;
	readonly target: ITurboFileTransferEndpoint;
	readonly sourceType?: TurboFileFileType;
	readonly overwrite?: boolean;
	readonly progressId?: string;
	readonly expectedBytes?: number;
	readonly strategyHint?: 'auto' | 'direct' | 'relay';
	/** Restricts one planner attempt; used by the batch coordinator to avoid nested fallback. */
	readonly attemptProtocol?: TurboFileTransferAttemptProtocol;
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
	/** Restricts child transfers to the protocol selected by the outer batch plan. */
	readonly attemptProtocol?: TurboFileTransferAttemptProtocol;
	/** Immutable device-capacity snapshot shared by the queue claim and batch workers. */
	readonly schedulerConcurrency?: number;
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
	readonly sessionId: string;
	readonly source: ITurboFileTransferEndpoint;
	readonly items: readonly ITurboFileWindowsDragItem[];
	readonly operation?: 'copy' | 'move';
	readonly progressId?: string;
}

export interface ITurboFileImageMetadataEntry {
	readonly path: string;
	readonly size: number;
	readonly modified: number;
	readonly width?: number;
	readonly height?: number;
}

export interface ITurboFileStartWindowsDragResult extends ITurboFileFileOperationResult {
	readonly targetDirectory?: string;
	readonly canceled?: boolean;
	readonly internal?: boolean;
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
	readonly state?: TurboFileTransferProgressState;
	readonly protocol?: 'native' | TurboFileTransferAttemptProtocol;
	readonly detail?: string;
	readonly strategy?: ITurboFileTransferResult['strategy'];
	readonly route?: 'source-push' | 'target-pull' | 'relay';
	readonly directFallbackReason?: 'unavailable' | 'data-failure';
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
