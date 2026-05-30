/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConnectConfig } from 'ssh2';
import { createReadStream, createWriteStream, promises as fsp } from 'fs';
import { basename, dirname, join } from 'node:path';
import { platform, tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { connect as connectTcp, Socket } from 'node:net';
import { deflateSync } from 'node:zlib';
import { app, clipboard, nativeImage } from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { ITurboFileBatchTransferFailure, ITurboFileBatchTransferItem, ITurboFileBatchTransferRequest, ITurboFileBatchTransferResult, ITurboFileDependencyInstallResult, ITurboFileDirectoryListing, ITurboFileFileEntry, ITurboFileFileOperationResult, ITurboFilePathSizeResult, ITurboFileReadFileOptions, ITurboFileReadFileResult, ITurboFileReadImageOptions, ITurboFileRemoteCapabilities, ITurboFileRemoteCapabilitiesResult, ITurboFileSshConnectionOptions, ITurboFileSshConnectionResult, ITurboFileSshService, ITurboFileSshTerminalSession, ITurboFileTransferEndpoint, ITurboFileTransferProgressEvent, ITurboFileTransferRequest, ITurboFileTransferResult, ITurboFileWindowsClipboardFilesResult, TurboFileContentEncoding, TurboFileFileType, TurboFileTransferDependency, TurboFileTransferProtocol } from '../common/turbofile.js';

const DEFAULT_READ_LIMIT = 10 * 1024 * 1024;
const DEFAULT_IMAGE_SOURCE_LIMIT = 128 * 1024 * 1024;
const REMOTE_IMAGE_TOOL_CACHE_TTL_MS = 5 * 60 * 1000;
const REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS = 4000;
const REMOTE_DIRECT_READ_MAX_BYTES = 2 * 1024 * 1024;
const REMOTE_DIRECT_READ_CHUNK_BYTES = 256 * 1024;
const SMALL_IMAGE_DIM_LIMIT = 100;
const RAW_BMP_FAST_PATH_BYTES = 2 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_VERSION = 1;
const IMAGE_THUMBNAIL_CACHE_MAX_BYTES = 512 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const TRANSFER_CANCELED_MESSAGE = 'Transfer canceled.';
const REMOTE_DIRECTORY_SFTP_IDLE_MS = 5 * 60 * 1000;
const REMOTE_DIRECTORY_LISTING_CACHE_TTL_MS = 30 * 1000;
const REMOTE_DIRECTORY_LISTING_CACHE_MAX_ENTRIES = 256;
const SFTP_TRANSFER_CONCURRENCY = 64;
const SFTP_TRANSFER_CHUNK_SIZE = 255 * 1024;
const SFTP_LARGE_FILE_THRESHOLD = 512 * 1024 * 1024;
const SFTP_LARGE_TRANSFER_CONCURRENCY = 64;
const SFTP_LARGE_TRANSFER_CHUNK_SIZE = 255 * 1024;
const SFTP_COMPAT_TRANSFER_CONCURRENCY = 32;
const SFTP_COMPAT_TRANSFER_CHUNK_SIZE = 32 * 1024;
const SFTP_RELAY_CHUNK_SIZE = 512 * 1024;
const SFTP_RELAY_CONCURRENCY = 64;
const SFTP_DIRECTORY_ENTRY_CONCURRENCY = 16;
const SFTP_DIRECTORY_DISCOVERY_CONCURRENCY = 64;
const SFTP_DIRECTORY_TRANSFER_CONNECTIONS = 16;
const SFTP_DIRECTORY_MKDIR_BATCH_SIZE = 256;
const LOCAL_DIRECTORY_STAT_CONCURRENCY = 64;
const LOCAL_COPY_DIRECTORY_CONCURRENCY = 16;
const LOCAL_COPY_FILE_HIGH_WATER_MARK = 1024 * 1024;
const RSYNC_DIRECTORY_PARALLEL_WORKERS = 4;
const BATCH_TRANSFER_WORKERS = 16;
const BATCH_TRANSFER_DIRECTORY_WORKERS = 4;
const REMOTE_NATIVE_DIRECTORY_COPY_PROGRESS_BYTES_PER_SECOND = 470 * 1024 * 1024;
const RSYNC_RELAY_BIND_HOST = '127.0.0.1';
const SSH_TERMINAL_READY_MARKER = '__TURBOFILE_TERMINAL_READY__';
const DIRECT_RSYNC_ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DIRECT_RSYNC_ROUTE_UNAVAILABLE_CACHE_TTL_MS = 10 * 60 * 1000;
const TRANSFER_PROGRESS_EVENT_INTERVAL_MS = 500;
const FILE_ENTRY_NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

class TurboFileTransferCanceledError extends Error {
	constructor() {
		super(TRANSFER_CANCELED_MESSAGE);
		this.name = 'TurboFileTransferCanceledError';
	}
}

interface ISSHClient {
	on(event: 'ready', listener: () => void): ISSHClient;
	on(event: 'error', listener: (err: Error) => void): ISSHClient;
	on(event: 'close', listener: () => void): ISSHClient;
	on(event: 'tcp connection', listener: (details: ISSHForwardedTcpDetails, accept: () => NodeJS.ReadWriteStream, reject: () => void) => void): ISSHClient;
	connect(config: ConnectConfig): void;
	sftp(callback: (err: Error | undefined, sftp: ISFTPWrapper) => void): void;
	exec(command: string, callback: (err: Error | undefined, stream: ISSHExecStream) => void): void;
	shell(window: ISSHShellWindow, callback: (err: Error | undefined, stream: ISSHShellStream) => void): void;
	forwardIn(bindAddr: string, bindPort: number, callback: (err: Error | undefined, port: number) => void): void;
	unforwardIn(bindAddr: string, bindPort: number, callback: (err: Error | undefined) => void): void;
	end(): void;
}

interface ISSHForwardedTcpDetails {
	readonly destIP: string;
	readonly destPort: number;
	readonly srcIP: string;
	readonly srcPort: number;
}

interface ISSHExecStream {
	on(event: 'close', listener: (code: number | null, signal: string | null) => void): ISSHExecStream;
	on(event: 'data', listener: (data: Buffer | string) => void): ISSHExecStream;
	on(event: 'error', listener: (err: Error) => void): ISSHExecStream;
	once(event: 'drain', listener: () => void): ISSHExecStream;
	once(event: 'error', listener: (err: Error) => void): ISSHExecStream;
	off(event: 'drain', listener: () => void): ISSHExecStream;
	off(event: 'error', listener: (err: Error) => void): ISSHExecStream;
	write(data: Buffer | string): boolean;
	end(data?: Buffer | string): void;
	close?(): void;
	destroy?(): void;
	stderr: {
		on(event: 'data', listener: (data: Buffer | string) => void): void;
	};
}

interface ISSHShellWindow {
	readonly term?: string;
	readonly cols?: number;
	readonly rows?: number;
	readonly width?: number;
	readonly height?: number;
	readonly modes?: Record<string, number>;
}

interface ISSHShellStream {
	on(event: 'data', listener: (data: Buffer | string) => void): ISSHShellStream;
	on(event: 'close', listener: (code: number | null | undefined, signal: string | null | undefined) => void): ISSHShellStream;
	on(event: 'error', listener: (err: Error) => void): ISSHShellStream;
	write(data: string): void;
	end(): void;
	setWindow?(rows: number, cols: number, height: number, width: number): void;
}

interface ISFTPWrapper {
	readdir(path: string, callback: (err: Error | undefined, list: ISFTPFileEntry[]) => void): void;
	stat(path: string, callback: (err: Error | undefined, stats: ISFTPStats) => void): void;
	mkdir(path: string, callback: (err: Error | undefined) => void): void;
	rmdir(path: string, callback: (err: Error | undefined) => void): void;
	unlink(path: string, callback: (err: Error | undefined) => void): void;
	rename(oldPath: string, newPath: string, callback: (err: Error | undefined) => void): void;
	fastGet(remotePath: string, localPath: string, options: ISFTPTransferOptions, callback: (err: Error | undefined) => void): void;
	fastGet(remotePath: string, localPath: string, callback: (err: Error | undefined) => void): void;
	fastPut(localPath: string, remotePath: string, options: ISFTPTransferOptions, callback: (err: Error | undefined) => void): void;
	fastPut(localPath: string, remotePath: string, callback: (err: Error | undefined) => void): void;
	open(path: string, flags: string, callback: (err: Error | undefined, handle: Buffer) => void): void;
	read(handle: Buffer, buffer: Buffer, offset: number, length: number, position: number, callback: (err: Error | undefined, bytesRead: number, buffer: Buffer, position: number) => void): void;
	write(handle: Buffer, buffer: Buffer, offset: number, length: number, position: number, callback: (err: Error | undefined) => void): void;
	close(handle: Buffer, callback: (err: Error | undefined) => void): void;
	end(): void;
}

interface ISFTPTransferOptions {
	readonly step?: (totalTransferred: number, chunk: number, total: number) => void;
	readonly concurrency?: number;
	readonly chunkSize?: number;
}

interface ISFTPStats {
	readonly size: number;
	readonly mtime: number;
	isDirectory(): boolean;
	isFile(): boolean;
	isSymbolicLink(): boolean;
}

interface ISFTPFileEntry {
	readonly filename: string;
	readonly longname: string;
	readonly attrs: ISFTPStats;
}

interface ITurboFileSshTerminalMainSession {
	client: ISSHClient;
	stream: ISSHShellStream;
	dataEmitter: Emitter<string>;
	exitEmitter: Emitter<number | undefined>;
	dataBuffer: string[];
	bootstrapBuffer: string;
	bootstrapping: boolean;
	hasDataListener: boolean;
	closed: boolean;
	sharedDirectorySessionKey?: string;
}

interface IRemoteDirectorySftpSession {
	key: string;
	client: ISSHClient;
	sftp: ISFTPWrapper;
	closed: boolean;
}

interface IRemoteDirectoryReadResult {
	readonly path: string;
	readonly entries: ISFTPFileEntry[];
}

interface ILocalDirectoryTransferFile {
	readonly localPath: string;
	readonly remotePath: string;
	readonly size: number;
}

interface ILocalDirectoryTransferPlan {
	readonly directories: string[];
	readonly files: ILocalDirectoryTransferFile[];
	readonly totalBytes: number;
}

interface IRemoteDirectoryTransferFile {
	readonly remotePath: string;
	readonly localPath: string;
	readonly size: number;
}

interface IRemoteDirectoryTransferPlan {
	readonly directories: string[];
	readonly files: IRemoteDirectoryTransferFile[];
	readonly totalBytes: number;
}

interface ITransferProgressSnapshot {
	lastAt: number;
	lastBytes: number;
}

interface IRemoteExecOptions {
	readonly onStdout?: (chunk: string) => void;
	readonly onStderr?: (chunk: string) => void;
	readonly timeoutMs?: number;
}

interface IImageSize {
	readonly width: number;
	readonly height: number;
}

interface IImageBufferResult {
	readonly buffer: Buffer;
	readonly mime: string;
	readonly width?: number;
	readonly height?: number;
}

interface IImageSourceFingerprint {
	readonly size: number;
	readonly modified: number;
}

interface IImageThumbnailCacheMetadata {
	readonly version: number;
	readonly mime: string;
	readonly size: number;
	readonly width?: number;
	readonly height?: number;
	readonly createdAt: number;
}

type TurboFileDirectRsyncRouteMode = 'source-push' | 'target-pull' | 'unavailable';

interface IDirectRsyncRouteCacheEntry {
	readonly mode: TurboFileDirectRsyncRouteMode;
	readonly checkedAt: number;
}

export class TurboFileSshMainService implements ITurboFileSshService {
	declare readonly _serviceBrand: undefined;

	private nativeRequire: NodeRequire | undefined;
	private terminalSessionSequence = 1;
	private readonly terminalSessions = new Map<string, ITurboFileSshTerminalMainSession>();
	private readonly transferProgressEmitters = new Map<string, Emitter<ITurboFileTransferProgressEvent>>();
	private readonly transferProgressSnapshots = new Map<string, ITransferProgressSnapshot>();
	private readonly transferDataStartTimes = new Map<string, number>();
	private readonly transferCancellationRequests = new Set<string>();
	private readonly transferCancelHandlers = new Map<string, Set<() => void>>();
	private readonly directorySftpSessions = new Map<string, Promise<IRemoteDirectorySftpSession>>();
	private readonly directorySftpIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly remoteDirectoryListingCache = new Map<string, { expiresAt: number; listing: ITurboFileDirectoryListing }>();
	private readonly remoteImageToolCache = new Map<string, { checkedAt: number; tool: 'magick' | 'convert' | undefined }>();
	private readonly remoteImageToolPending = new Map<string, Promise<'magick' | 'convert' | undefined>>();
	private readonly directRsyncRouteCache = new Map<string, IDirectRsyncRouteCacheEntry>();
	private readonly directRsyncRoutePending = new Map<string, Promise<TurboFileDirectRsyncRouteMode>>();
	private readonly remoteRsyncSshBinaryCache = new Map<string, string>();
	private imageThumbnailCacheTrimPromise: Promise<void> | undefined;

	onDynamicSshTerminalData(sessionId: string): Event<string> {
		const session = this.terminalSessions.get(sessionId);
		if (!session) {
			return Event.None;
		}

		return (listener, thisArgs, disposables) => {
			session.hasDataListener = true;
			const disposable = session.dataEmitter.event(listener, thisArgs, disposables);
			const buffered = session.dataBuffer.splice(0);
			for (const chunk of buffered) {
				listener.call(thisArgs, chunk);
			}
			return disposable;
		};
	}

	onDynamicSshTerminalExit(sessionId: string): Event<number | undefined> {
		return this.terminalSessions.get(sessionId)?.exitEmitter.event ?? Event.None;
	}

	onDynamicTransferProgress(progressId: string): Event<ITurboFileTransferProgressEvent> {
		if (!progressId) {
			return Event.None;
		}
		return this.getTransferProgressEmitter(progressId).event;
	}

	async cancelTransfer(progressId: string): Promise<ITurboFileFileOperationResult> {
		if (!progressId) {
			return { ok: false, message: 'Transfer progress id is required.' };
		}

		this.transferCancellationRequests.add(progressId);
		const handlers = this.transferCancelHandlers.get(progressId);
		if (handlers) {
			for (const handler of [...handlers]) {
				try {
					handler();
				} catch {
					// Cancellation is best-effort across local streams and SSH/SFTP channels.
				}
			}
		}
		return { ok: true, message: 'Transfer cancellation requested.' };
	}

	async testConnection(options: ITurboFileSshConnectionOptions): Promise<ITurboFileSshConnectionResult> {
		const configResult = await this.createConnectConfig(options);
		if (!configResult.ok) {
			return configResult;
		}

		return this.doTestConnection(configResult.config);
	}

	async detectCapabilities(options: ITurboFileSshConnectionOptions): Promise<ITurboFileRemoteCapabilitiesResult> {
		const configResult = await this.createConnectConfig(options);
		if (!configResult.ok) {
			return { ok: false, message: configResult.message };
		}

		let client: ISSHClient | undefined;
		try {
			client = await this.connect(configResult.config);
			const hasCommand = async (command: string): Promise<boolean> => {
				try {
					await this.execRemote(client!, `command -v ${command} >/dev/null 2>&1`);
					return true;
				} catch {
					return false;
				}
			};
			const sftp = await this.openSftp(client).then(handle => {
				handle.end();
				return true;
			}).catch(() => false);
			const [scp, rsync, sshpass, tar, zip, unzip] = await Promise.all([
				hasCommand('scp'),
				hasCommand('rsync'),
				hasCommand('sshpass'),
				hasCommand('tar'),
				hasCommand('zip'),
				hasCommand('unzip')
			]);
			return {
				ok: true,
				message: 'Capabilities detected.',
				capabilities: {
					ssh: true,
					sftp,
					scp,
					rsync,
					sshpass,
					shell: true,
					archive: tar || zip || unzip
				}
			};
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : String(error)
			};
		} finally {
			client?.end();
		}
	}

	async installTransferDependencies(options: ITurboFileSshConnectionOptions, packages: readonly TurboFileTransferDependency[]): Promise<ITurboFileDependencyInstallResult> {
		const requestedPackages = normalizeTransferDependencies(packages);
		if (!requestedPackages.length) {
			return { ok: true, message: 'No dependencies requested.', installedPackages: [], missingPackages: [] };
		}

		const configResult = await this.createConnectConfig(options);
		if (!configResult.ok) {
			return { ok: false, message: configResult.message, installedPackages: [], missingPackages: requestedPackages };
		}

		let installError: Error | undefined;
		let client: ISSHClient | undefined;
		try {
			client = await this.connect(configResult.config);
			await this.execRemote(client, buildTransferDependencyInstallCommand(requestedPackages, options));
		} catch (error) {
			installError = error instanceof Error ? error : new Error(String(error));
		} finally {
			client?.end();
		}

		const capabilityResult = await this.detectCapabilities(options);
		const capabilities = capabilityResult.capabilities;
		const missingPackages = capabilities ? getMissingTransferDependencies(requestedPackages, capabilities) : requestedPackages;
		const installedPackages = requestedPackages.filter(pkg => !missingPackages.includes(pkg));
		const ok = capabilityResult.ok && missingPackages.length === 0;
		const missingMessage = missingPackages.length ? `缺少 ${missingPackages.join('、')}` : '依赖已安装';
		return {
			ok,
			message: ok ? 'rsync/sshpass 安装并检测成功。' : `${installError ? `${installError.message}；` : ''}${missingMessage}`,
			installedPackages,
			missingPackages,
			capabilities
		};
	}

	async listRemoteDirectory(options: ITurboFileSshConnectionOptions, path: string, refresh = false): Promise<ITurboFileDirectoryListing> {
		const cacheKey = this.getRemoteDirectoryListingCacheKey(options, path);
		if (!refresh) {
			const cached = this.getRemoteDirectoryListingCache(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const configResult = await this.createConnectConfig(options);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		const session = await this.getDirectorySftpSession(options, configResult.config);
		try {
			const listing = await this.readRemoteDirectoryWithFallback(session.sftp, session.client, options, path);
			this.touchDirectorySftpSession(session.key);
			const result = {
				path: listing.path,
				entries: listing.entries
					.filter(entry => entry.filename !== '.' && entry.filename !== '..')
					.map(entry => this.toRemoteEntry(listing.path, entry))
					.sort(compareFileEntries)
			};
			this.setRemoteDirectoryListingCache(cacheKey, result);
			if (listing.path !== path) {
				this.setRemoteDirectoryListingCache(this.getRemoteDirectoryListingCacheKey(options, listing.path), result);
			}
			return result;
		} catch (error) {
			this.remoteDirectoryListingCache.delete(cacheKey);
			this.disposeDirectorySftpSession(session.key);
			throw error;
		}
	}

	async listLocalDirectory(path: string, _refresh = false): Promise<ITurboFileDirectoryListing> {
		const dirents = await fsp.readdir(path, { withFileTypes: true });
		const visibleNames = await getWindowsExplorerVisibleLocalNames(path);
		const entries = (await mapLimit(dirents.filter(dirent => !visibleNames || visibleNames.has(dirent.name)), LOCAL_DIRECTORY_STAT_CONCURRENCY, async dirent => {
			try {
				const fullPath = join(path, dirent.name);
				const stat = await fsp.lstat(fullPath);
				const type: TurboFileFileType = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symlink' : 'unknown';
				return {
					name: dirent.name,
					path: fullPath,
					type,
					size: stat.size,
					modified: stat.mtimeMs
				};
			} catch {
				return undefined;
			}
		})).filter((entry): entry is ITurboFileFileEntry => !!entry);

		return {
			path,
			entries: entries.sort(compareFileEntries)
		};
	}

	async transferFile(request: ITurboFileTransferRequest): Promise<ITurboFileTransferResult> {
		const strategy = getTransferStrategy(request.source, request.target);
		const startedAt = Date.now();
		if (request.progressId) {
			this.transferCancellationRequests.delete(request.progressId);
		}
		try {
			this.throwIfTransferCanceled(request.progressId);
			if (request.source.kind === 'local' && request.target.kind === 'local') {
				this.fireTransferProgress(request, 0, Math.max(0, request.expectedBytes ?? 0), 'prepare', 'Preparing local copy.', true);
				const totalBytes = await getLocalPathTransferSize(request.source.path, request.expectedBytes);
				this.fireTransferProgress(request, 0, totalBytes, 'transfer', 'Copying locally.', true);
				let transferredBytes = 0;
				const onDelta = (delta: number): void => {
					this.throwIfTransferCanceled(request.progressId);
					transferredBytes += delta;
					this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, 'transfer', 'Copying locally.');
				};
				this.markTransferDataStarted(request.progressId);
				await this.copyLocalPath(request.source.path, request.target.path, onDelta, request.progressId);
				this.throwIfTransferCanceled(request.progressId);
				const bytes = Math.max(totalBytes, transferredBytes);
				this.fireTransferProgress(request, bytes, bytes, 'complete', 'Local copy completed.', true);
				return this.createTransferResult(true, strategy, bytes, 'Local copy completed.', startedAt, request.progressId);
			}

			if (request.source.kind === 'local' && request.target.kind === 'ssh') {
				this.throwIfTransferCanceled(request.progressId);
				const stat = await fsp.stat(request.source.path);
				let bytes = stat.isDirectory() ? Math.max(0, request.expectedBytes ?? 0) : stat.size;
				if (!stat.isDirectory()) {
					const commandResult = await this.tryLocalToSshCommandTransfer(request, bytes, startedAt);
					if (commandResult?.ok) {
						this.clearRemoteDirectoryListingCache(request.target);
						return commandResult;
					}
				}
				this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing SFTP upload.', true);
				let transferredBytes = 0;
				const onDelta = (delta: number): void => {
					this.throwIfTransferCanceled(request.progressId);
					transferredBytes += delta;
					this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Uploading over SFTP.');
				};
				const onTotal = (totalBytes: number): void => {
					bytes = Math.max(bytes, totalBytes);
					this.fireTransferProgress(request, Math.min(transferredBytes, bytes), bytes, 'transfer', 'Uploading over SFTP.', true);
				};
				if (stat.isDirectory()) {
					this.fireTransferProgress(request, 0, bytes, 'transfer', 'Scanning and uploading directory over SFTP.', true);
					this.markTransferDataStarted(request.progressId);
					await this.uploadDirectoryConcurrent(request.target, request.source.path, request.target.path, onTotal, onDelta, request.progressId);
				} else {
					await this.withSftp(request.target, async sftp => {
						this.throwIfTransferCanceled(request.progressId);
						await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
						this.markTransferDataStarted(request.progressId);
						await this.fastPutWithFallback(sftp, request.source.path, request.target.path, bytes, onDelta, request.progressId);
					}, request.progressId);
				}
				this.throwIfTransferCanceled(request.progressId);
				this.fireTransferProgress(request, bytes, bytes, 'complete', 'SFTP upload completed.', true);
				this.clearRemoteDirectoryListingCache(request.target);
				return this.createTransferResult(true, 'sftp-upload', bytes, 'SFTP upload completed.', startedAt, request.progressId);
			}

			if (request.source.kind === 'ssh' && request.target.kind === 'local') {
				this.throwIfTransferCanceled(request.progressId);
				await ensureLocalParentDirectory(request.target.path);
				let bytes = 0;
				const sourceType = request.sourceType ?? await this.withSftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown' as TurboFileFileType);
				bytes = sourceType === 'directory'
					? Math.max(0, request.expectedBytes ?? 0)
					: Math.max(0, request.expectedBytes ?? 0);
				if (sourceType !== 'directory') {
					if (bytes <= 0) {
						bytes = await this.withSftp(request.source, async sftp => (await this.remoteStat(sftp, request.source.path)).size, request.progressId).catch(() => bytes);
					}
					const commandResult = await this.trySshToLocalCommandTransfer(request, bytes, startedAt);
					if (commandResult?.ok) {
						return commandResult;
					}
				}
				let transferredBytes = 0;
				const onDelta = (delta: number): void => {
					this.throwIfTransferCanceled(request.progressId);
					transferredBytes += delta;
					this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Downloading over SFTP.');
				};
				const onTotal = (totalBytes: number): void => {
					bytes = Math.max(bytes, totalBytes);
					this.fireTransferProgress(request, Math.min(transferredBytes, bytes), bytes, 'transfer', 'Downloading over SFTP.', true);
				};
				if (sourceType === 'directory') {
					this.fireTransferProgress(request, 0, bytes, 'transfer', 'Scanning and downloading directory over SFTP.', true);
					this.markTransferDataStarted(request.progressId);
					await this.downloadDirectoryConcurrent(request.source, request.source.path, request.target.path, onTotal, onDelta, request.progressId);
				} else {
					await this.withSftp(request.source, async sftp => {
						this.throwIfTransferCanceled(request.progressId);
						if (bytes <= 0) {
							bytes = (await this.remoteStat(sftp, request.source.path)).size;
						}
						this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing SFTP download.', true);
						this.markTransferDataStarted(request.progressId);
						await this.fastGetWithFallback(sftp, request.source.path, request.target.path, bytes, onDelta, request.progressId);
					}, request.progressId);
				}
				this.throwIfTransferCanceled(request.progressId);
				this.fireTransferProgress(request, bytes, bytes, 'complete', 'SFTP download completed.', true);
				return this.createTransferResult(true, 'sftp-download', bytes, 'SFTP download completed.', startedAt, request.progressId);
			}

			if (request.strategyHint !== 'relay') {
				const sameRemoteResult = await this.trySameRemoteCopy(request, startedAt);
				this.throwIfTransferCanceled(request.progressId);
				if (sameRemoteResult?.ok) {
					this.fireTransferProgress(request, sameRemoteResult.bytes, sameRemoteResult.bytes, 'complete', 'Remote copy completed.', true);
					this.clearRemoteDirectoryListingCache(request.target);
					return sameRemoteResult;
				}
			}

			if (request.strategyHint !== 'relay') {
				const directResult = await this.tryDirectRsyncTransfer(request, startedAt);
				this.throwIfTransferCanceled(request.progressId);
				if (directResult?.ok) {
					this.fireTransferProgress(request, directResult.bytes, directResult.bytes, 'complete', 'Direct rsync completed.', true);
					this.clearRemoteDirectoryListingCache(request.target);
					return directResult;
				}
			}

			if (request.strategyHint !== 'relay') {
				const directSftpResult = await this.tryDirectSftpTransfer(request, startedAt);
				this.throwIfTransferCanceled(request.progressId);
				if (directSftpResult?.ok) {
					this.fireTransferProgress(request, directSftpResult.bytes, directSftpResult.bytes, 'complete', 'Direct SFTP completed.', true);
					this.clearRemoteDirectoryListingCache(request.target);
					return directSftpResult;
				}
			}

			const tunneledRsyncResult = await this.tryTunneledRsyncRelayTransfer(request, startedAt);
			this.throwIfTransferCanceled(request.progressId);
			if (tunneledRsyncResult?.ok) {
				this.fireTransferProgress(request, tunneledRsyncResult.bytes, tunneledRsyncResult.bytes, 'complete', 'Rsync relay completed.', true);
				this.clearRemoteDirectoryListingCache(request.target);
				return tunneledRsyncResult;
			}

			const streamRelayResult = await this.tryStreamRelayTransfer(request, startedAt);
			this.throwIfTransferCanceled(request.progressId);
			if (streamRelayResult?.ok) {
				this.fireTransferProgress(request, streamRelayResult.bytes * 2, streamRelayResult.bytes * 2, 'complete', 'SFTP parallel relay completed.', true);
				this.clearRemoteDirectoryListingCache(request.target);
				return streamRelayResult;
			}

			const relayRoot = join(tmpdir(), `turbofile-${randomUUID()}`);
			const relayPath = join(relayRoot, getTransferName(request.source.path) || 'payload');
			try {
				this.throwIfTransferCanceled(request.progressId);
				await fsp.mkdir(relayRoot, { recursive: true });
				let bytes = 0;
				const sourceType = request.sourceType ?? await this.withSftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown' as TurboFileFileType);
				bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
				await this.withSftp(request.source, async sftp => {
					this.throwIfTransferCanceled(request.progressId);
					const relayTotalBytes = bytes * 2;
					this.fireTransferProgress(request, 0, relayTotalBytes, 'prepare', 'Preparing SFTP relay.', true);
					let downloadedBytes = 0;
					const onDownloadDelta = (delta: number): void => {
						this.throwIfTransferCanceled(request.progressId);
						downloadedBytes += delta;
						this.fireTransferProgress(request, downloadedBytes, relayTotalBytes, 'relay-download', 'Downloading to relay cache.');
					};
					if (sourceType === 'directory') {
						this.markTransferDataStarted(request.progressId);
						await this.downloadDirectory(sftp, request.source.path, relayPath, onDownloadDelta, request.progressId);
					} else {
						this.markTransferDataStarted(request.progressId);
						await this.fastGetWithFallback(sftp, request.source.path, relayPath, bytes, onDownloadDelta, request.progressId);
					}
				}, request.progressId);
				await this.withSftp(request.target, async sftp => {
					this.throwIfTransferCanceled(request.progressId);
					const relayStat = await fsp.stat(relayPath);
					const relayTotalBytes = bytes * 2;
					let uploadedBytes = 0;
					const onUploadDelta = (delta: number): void => {
						this.throwIfTransferCanceled(request.progressId);
						uploadedBytes += delta;
						this.fireTransferProgress(request, bytes + uploadedBytes, relayTotalBytes, 'relay-upload', 'Uploading from relay cache.');
					};
					if (relayStat.isDirectory()) {
						await this.uploadDirectory(sftp, relayPath, request.target.path, onUploadDelta, request.progressId);
					} else {
						await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
						await this.fastPutWithFallback(sftp, relayPath, request.target.path, bytes, onUploadDelta, request.progressId);
					}
				}, request.progressId);
				this.throwIfTransferCanceled(request.progressId);
				this.fireTransferProgress(request, bytes * 2, bytes * 2, 'complete', 'SFTP relay completed.', true);
				this.clearRemoteDirectoryListingCache(request.target);
				return this.createTransferResult(true, strategy, bytes, 'SFTP relay completed.', startedAt, request.progressId);
			} finally {
				await fsp.rm(relayRoot, { recursive: true, force: true }).catch(() => undefined);
			}
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				return {
					ok: false,
					strategy,
					bytes: 0,
					message: TRANSFER_CANCELED_MESSAGE,
					canceled: true,
					durationMs: Date.now() - startedAt
				};
			}
			return {
				ok: false,
				strategy,
				bytes: 0,
				message: error instanceof Error ? error.message : String(error),
				durationMs: Date.now() - startedAt
			};
		} finally {
			if (request.progressId) {
				this.transferCancellationRequests.delete(request.progressId);
				this.transferCancelHandlers.delete(request.progressId);
			}
			this.scheduleTransferProgressCleanup(request.progressId);
		}
	}

	private async tryLocalToSshCommandTransfer(request: ITurboFileTransferRequest, bytes: number, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'local' || request.target.kind !== 'ssh' || !request.target.connection) {
			return undefined;
		}

		for (const protocol of getLocalCommandTransferProtocolOrder(request.target.preferredProtocol, request.target.connection)) {
			this.throwIfTransferCanceled(request.progressId);
			try {
				if (protocol === 'rsync') {
					this.fireTransferProgress(request, 0, bytes, 'transfer', 'Uploading over local rsync.', true);
					this.markTransferDataStarted(request.progressId);
					await this.runLocalRsyncUpload(request);
					this.fireTransferProgress(request, bytes, bytes, 'complete', 'Local rsync upload completed.', true);
					return this.createTransferResult(true, 'rsync-upload', bytes, 'Local rsync upload completed.', startedAt, request.progressId);
				}
				this.fireTransferProgress(request, 0, bytes, 'transfer', 'Uploading over local SCP.', true);
				await this.runLocalScpUpload(request, bytes, delta => {
					this.fireTransferProgress(request, delta, bytes, 'transfer', 'Uploading over local SCP.');
				});
				this.fireTransferProgress(request, bytes, bytes, 'complete', 'Local SCP upload completed.', true);
				return this.createTransferResult(true, 'scp-upload', bytes, 'Local SCP upload completed.', startedAt, request.progressId);
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				if (!isRecoverableLocalCommandTransferError(error)) {
					return undefined;
				}
			}
		}
		return undefined;
	}

	private async trySshToLocalCommandTransfer(request: ITurboFileTransferRequest, bytes: number, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'local' || !request.source.connection) {
			return undefined;
		}

		for (const protocol of getLocalCommandTransferProtocolOrder(request.source.preferredProtocol, request.source.connection)) {
			this.throwIfTransferCanceled(request.progressId);
			try {
				if (protocol === 'rsync') {
					this.fireTransferProgress(request, 0, bytes, 'transfer', 'Downloading over local rsync.', true);
					this.markTransferDataStarted(request.progressId);
					await this.runLocalRsyncDownload(request);
					this.fireTransferProgress(request, bytes, bytes, 'complete', 'Local rsync download completed.', true);
					return this.createTransferResult(true, 'rsync-download', bytes, 'Local rsync download completed.', startedAt, request.progressId);
				}
				this.fireTransferProgress(request, 0, bytes, 'transfer', 'Downloading over local SCP.', true);
				await this.runLocalScpDownload(request, bytes, delta => {
					this.fireTransferProgress(request, delta, bytes, 'transfer', 'Downloading over local SCP.');
				});
				this.fireTransferProgress(request, bytes, bytes, 'complete', 'Local SCP download completed.', true);
				return this.createTransferResult(true, 'scp-download', bytes, 'Local SCP download completed.', startedAt, request.progressId);
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				if (!isRecoverableLocalCommandTransferError(error)) {
					return undefined;
				}
			}
		}
		return undefined;
	}

	private async runLocalScpUpload(request: ITurboFileTransferRequest, bytes: number, onProgress?: (transferredBytes: number) => void): Promise<void> {
		if (request.target.kind !== 'ssh' || !request.target.connection) {
			throw new Error('Missing SSH target.');
		}
		await this.withSftp(request.target, async sftp => this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path)), request.progressId);
		await this.uploadFileWithScpProtocol(request.target.connection, request.source.path, request.target.path, bytes, onProgress, request.progressId);
	}

	private async runLocalScpDownload(request: ITurboFileTransferRequest, bytes: number, onProgress?: (transferredBytes: number) => void): Promise<void> {
		if (request.source.kind !== 'ssh' || !request.source.connection) {
			throw new Error('Missing SSH source.');
		}
		await ensureLocalParentDirectory(request.target.path);
		await this.downloadFileWithScpProtocol(request.source.connection, request.source.path, request.target.path, bytes, onProgress, request.progressId);
	}

	private async uploadFileWithScpProtocol(connection: ITurboFileSshConnectionOptions, localPath: string, remotePath: string, expectedBytes: number, onProgress?: (transferredBytes: number) => void, progressId?: string): Promise<void> {
		const configResult = await this.createConnectConfig(connection);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		let client: ISSHClient | undefined;
		try {
			client = await this.connect(configResult.config);
			const stream = await this.openScpExec(client, `scp -t ${quotePosixShellArg(remotePath)}`);
			const reader = new ScpProtocolReader(stream);
			const closePromise = waitForScpClose(stream);
			const stat = await fsp.stat(localPath);
			const totalBytes = stat.size || expectedBytes;
			let transferredBytes = 0;

			await readScpResponse(reader, 'start upload');
			await writeScpData(stream, `C${formatScpMode(stat.mode)} ${totalBytes} ${sanitizeScpFileName(getTransferName(remotePath) || basename(localPath))}\n`);
			await readScpResponse(reader, 'upload header');

			this.markTransferDataStarted(progressId);
			for await (const chunk of createReadStream(localPath, { highWaterMark: 1024 * 1024 })) {
				this.throwIfTransferCanceled(progressId);
				const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
				await writeScpData(stream, buffer);
				transferredBytes += buffer.byteLength;
				onProgress?.(Math.min(transferredBytes, totalBytes));
			}

			await writeScpData(stream, Buffer.from([0]));
			await readScpResponse(reader, 'complete upload');
			stream.end();
			await closePromise;
		} finally {
			client?.end();
		}
	}

	private async downloadFileWithScpProtocol(connection: ITurboFileSshConnectionOptions, remotePath: string, localPath: string, expectedBytes: number, onProgress?: (transferredBytes: number) => void, progressId?: string): Promise<void> {
		const configResult = await this.createConnectConfig(connection);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		let client: ISSHClient | undefined;
		try {
			client = await this.connect(configResult.config);
			const stream = await this.openScpExec(client, `scp -f ${quotePosixShellArg(remotePath)}`);
			const reader = new ScpProtocolReader(stream);
			const closePromise = waitForScpClose(stream);

			await writeScpData(stream, Buffer.from([0]));
			const header = await readScpFileHeader(reader, stream);
			const totalBytes = header.size || expectedBytes;
			await ensureLocalParentDirectory(localPath);
			await writeScpData(stream, Buffer.from([0]));
			this.markTransferDataStarted(progressId);
			await readScpFilePayload(reader, localPath, totalBytes, transferredBytes => {
				this.throwIfTransferCanceled(progressId);
				onProgress?.(transferredBytes);
			});
			await readScpResponse(reader, 'complete download');
			await writeScpData(stream, Buffer.from([0]));
			stream.end();
			await closePromise;
		} finally {
			client?.end();
		}
	}

	private openScpExec(client: ISSHClient, command: string): Promise<ISSHExecStream> {
		return new Promise((resolve, reject) => {
			client.exec(command, (error, stream) => {
				if (error) {
					reject(error);
					return;
				}

				let stderr = '';
				stream.stderr.on('data', data => {
					stderr += data.toString();
				});
				stream.on('error', reject);
				stream.on('close', code => {
					if (code !== 0 && stderr.trim()) {
						reject(new Error(stderr.trim()));
					}
				});
				resolve(stream);
			});
		});
	}

	private async runLocalRsyncUpload(request: ITurboFileTransferRequest): Promise<void> {
		if (request.target.kind !== 'ssh' || !request.target.connection) {
			throw new Error('Missing SSH target.');
		}
		await this.withSftp(request.target, async sftp => this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path)), request.progressId);
		await runLocalCommand('rsync.exe', [
			'-a',
			'--whole-file',
			'-e',
			buildLocalRsyncSshTransport(request.target.connection),
			toRsyncLocalPath(request.source.path),
			formatRsyncRemoteSpec(request.target.connection, request.target.path)
		]);
	}

	private async runLocalRsyncDownload(request: ITurboFileTransferRequest): Promise<void> {
		if (request.source.kind !== 'ssh' || !request.source.connection) {
			throw new Error('Missing SSH source.');
		}
		await ensureLocalParentDirectory(request.target.path);
		await runLocalCommand('rsync.exe', [
			'-a',
			'--whole-file',
			'-e',
			buildLocalRsyncSshTransport(request.source.connection),
			formatRsyncRemoteSpec(request.source.connection, request.source.path),
			toRsyncLocalPath(request.target.path)
		]);
	}

	async transferBatch(request: ITurboFileBatchTransferRequest): Promise<ITurboFileBatchTransferResult> {
		const startedAt = Date.now();
		const strategy = getTransferStrategy(request.source, request.targetDirectory);
		const items = request.items.filter(item => !!item.sourcePath && !!item.targetName);
		const operation = request.operation === 'move' ? 'move' : 'copy';
		if (request.progressId) {
			this.transferCancellationRequests.delete(request.progressId);
		}
		if (!items.length) {
			return this.createBatchTransferResult(false, strategy, 0, 'No transfer items.', 0, 0, [], startedAt, request.progressId);
		}

		const expectedBytes = this.getBatchExpectedBytes(request, items);
		try {
			this.throwIfTransferCanceled(request.progressId);
			this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing batch transfer.', true, {
				completedItems: 0,
				totalItems: items.length,
				currentName: items[0].displayName ?? items[0].targetName
			});

			const sameLocal = request.source.kind === 'local' && request.targetDirectory.kind === 'local';
			const sameRemote = request.source.kind === 'ssh'
				&& request.targetDirectory.kind === 'ssh'
				&& !!request.source.connection
				&& !!request.targetDirectory.connection
				&& isSameSshConnection(request.source.connection, request.targetDirectory.connection);

			if (sameLocal) {
				return await this.runLocalNativeBatchTransfer(request, items, operation, expectedBytes, startedAt);
			}
			if (sameRemote) {
				return await this.runSameRemoteNativeBatchTransfer(request, items, operation, expectedBytes, startedAt);
			}

			if (request.strategyHint !== 'relay') {
				const directRsync = await this.tryDirectBatchRsyncTransfer(request, items, expectedBytes, startedAt);
				this.throwIfTransferCanceled(request.progressId);
				if (directRsync?.ok) {
					if (operation === 'move') {
						const cleanupFailures = await this.deleteBatchSources(request.source, items);
						if (cleanupFailures.length) {
							return this.createBatchTransferResult(false, directRsync.strategy, directRsync.bytes, `Batch transfer completed, but source cleanup failed for ${cleanupFailures.length} item(s).`, items.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
						}
					}
					return directRsync;
				}
			}

			if (request.strategyHint !== 'direct') {
				const relayRsync = await this.tryTunneledBatchRsyncRelayTransfer(request, items, expectedBytes, startedAt);
				this.throwIfTransferCanceled(request.progressId);
				if (relayRsync?.ok) {
					if (operation === 'move') {
						const cleanupFailures = await this.deleteBatchSources(request.source, items);
						if (cleanupFailures.length) {
							return this.createBatchTransferResult(false, relayRsync.strategy, relayRsync.bytes, `Batch transfer completed, but source cleanup failed for ${cleanupFailures.length} item(s).`, items.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
						}
					}
					return relayRsync;
				}
			}

			const fallback = await this.runConcurrentBatchTransfer(request, items, operation, expectedBytes, startedAt, request.source.kind === 'ssh' && request.targetDirectory.kind === 'ssh');
			this.clearRemoteDirectoryListingCache(request.targetDirectory);
			return fallback;
		} catch (error) {
			const canceled = error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId);
			return this.createBatchTransferResult(false, strategy, 0, canceled ? TRANSFER_CANCELED_MESSAGE : error instanceof Error ? error.message : String(error), 0, items.length, canceled ? [] : [{
				name: items[0].displayName ?? items[0].targetName,
				path: items[0].sourcePath,
				message: error instanceof Error ? error.message : String(error)
			}], startedAt, request.progressId, canceled);
		} finally {
			if (request.progressId) {
				this.transferCancellationRequests.delete(request.progressId);
				this.transferCancelHandlers.delete(request.progressId);
			}
			this.scheduleTransferProgressCleanup(request.progressId);
		}
	}

	private getBatchExpectedBytes(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[]): number {
		const explicit = Math.max(0, request.expectedBytes ?? 0);
		if (explicit > 0) {
			return explicit;
		}
		return items.reduce((sum, item) => sum + Math.max(0, item.expectedBytes ?? 0), 0);
	}

	private async runLocalNativeBatchTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move', expectedBytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult> {
		const totalBytes = operation === 'copy' ? await this.getLocalBatchTransferSize(items, expectedBytes) : expectedBytes;
		this.fireTransferProgress(request, 0, totalBytes, 'transfer', operation === 'move' ? 'Moving locally.' : 'Copying locally.', true, {
			completedItems: 0,
			totalItems: items.length,
			currentName: items[0]?.displayName ?? items[0]?.targetName
		});
		const sources = items.map(item => item.sourcePath);
		if (operation === 'copy') {
			await ensureLocalDirectory(request.targetDirectory.path);
			let transferredBytes = 0;
			this.markTransferDataStarted(request.progressId);
			for (const [index, item] of items.entries()) {
				this.throwIfTransferCanceled(request.progressId);
				const currentName = item.displayName ?? item.targetName;
				this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, 'transfer', 'Copying locally.', true, {
					completedItems: index,
					totalItems: items.length,
					currentName
				});
				await this.copyLocalPath(item.sourcePath, this.joinBatchTargetPath(request.targetDirectory, item.targetName), delta => {
					this.throwIfTransferCanceled(request.progressId);
					transferredBytes += delta;
					this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, 'transfer', 'Copying locally.', false, {
						completedItems: index,
						totalItems: items.length,
						currentName
					});
				}, request.progressId);
				this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, 'transfer', 'Copying locally.', true, {
					completedItems: index + 1,
					totalItems: items.length,
					currentName
				});
			}
		} else if (platform() === 'win32' || looksLikeWindowsPath(request.targetDirectory.path) || sources.some(looksLikeWindowsPath)) {
			await ensureLocalParentDirectory(this.joinBatchTargetPath(request.targetDirectory, items[0].targetName));
			this.markTransferDataStarted(request.progressId);
			await runLocalPowerShellScript(buildLocalWindowsBatchScript(sources, request.targetDirectory.path, operation));
		} else {
			await ensureLocalParentDirectory(this.joinBatchTargetPath(request.targetDirectory, items[0].targetName));
			await ensureLocalDirectory(request.targetDirectory.path);
			this.markTransferDataStarted(request.progressId);
			await runLocalCommand('mv', ['-f', ...sources, request.targetDirectory.path]);
		}
		this.throwIfTransferCanceled(request.progressId);
		this.fireTransferProgress(request, totalBytes, totalBytes, 'complete', 'Batch local transfer completed.', true, {
			completedItems: items.length,
			totalItems: items.length
		});
		return this.createBatchTransferResult(true, operation === 'move' ? 'local-copy' : 'local-copy', totalBytes, 'Batch local transfer completed.', items.length, 0, [], startedAt, request.progressId);
	}

	private async getLocalBatchTransferSize(items: readonly ITurboFileBatchTransferItem[], expectedBytes: number): Promise<number> {
		if (expectedBytes > 0) {
			return expectedBytes;
		}
		const sizes = await mapLimit(items, BATCH_TRANSFER_DIRECTORY_WORKERS, item => getLocalPathTransferSize(item.sourcePath, item.expectedBytes));
		return sizes.reduce((total, size) => total + size, 0);
	}

	private async runSameRemoteNativeBatchTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move', expectedBytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult> {
		this.fireTransferProgress(request, 0, expectedBytes, 'transfer', operation === 'move' ? 'Moving on remote host.' : 'Copying on remote host.', true, {
			completedItems: 0,
			totalItems: items.length,
			currentName: items[0]?.displayName ?? items[0]?.targetName
		});
		const sources = items.map(item => item.sourcePath);
		const command = looksLikeWindowsPath(request.targetDirectory.path) || sources.some(looksLikeWindowsPath)
			? buildWindowsBatchCommand(sources, request.targetDirectory.path, operation)
			: buildPosixBatchCommand(sources, request.targetDirectory.path, operation);
		this.markTransferDataStarted(request.progressId);
		await this.withSshClient(request.source, client => this.execRemote(client, command));
		this.throwIfTransferCanceled(request.progressId);
		this.fireTransferProgress(request, expectedBytes, expectedBytes, 'complete', 'Batch remote native transfer completed.', true, {
			completedItems: items.length,
			totalItems: items.length
		});
		this.clearRemoteDirectoryListingCache(request.source);
		this.clearRemoteDirectoryListingCache(request.targetDirectory);
		return this.createBatchTransferResult(true, 'remote-copy', expectedBytes, 'Batch remote native transfer completed.', items.length, 0, [], startedAt, request.progressId);
	}

	private async tryDirectBatchRsyncTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], expectedBytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.targetDirectory.kind !== 'ssh' || !request.source.connection || !request.targetDirectory.connection) {
			return undefined;
		}
		if (request.source.supportsRsync !== true || request.targetDirectory.supportsRsync !== true) {
			return undefined;
		}
		if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.targetDirectory.path) || items.some(item => looksLikeWindowsPath(item.sourcePath))) {
			return undefined;
		}

		const route = await this.resolveDirectRsyncRoute(request.source, request.targetDirectory, request.progressId);
		if (route === 'unavailable') {
			return undefined;
		}

		const executorEndpoint = route === 'source-push' ? request.source : request.targetDirectory;
		const remoteEndpoint = route === 'source-push' ? request.targetDirectory : request.source;
		if (!executorEndpoint.connection || !remoteEndpoint.connection) {
			return undefined;
		}
		const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
		if (!executorConfigResult.ok) {
			return undefined;
		}
		const client = await this.connect(executorConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		try {
			this.throwIfTransferCanceled(request.progressId);
			const remote = remoteEndpoint.connection;
			const remoteUserHost = `${remote.username}@${remote.host}`;
			const sshBinary = await this.resolveRemoteRsyncSshBinary(client, executorEndpoint.connection);
			const sshTransport = buildOptimizedRsyncSshCommand(remote.port || 22, !!remote.password, sshBinary);
			const sshpassPrefix = buildSshpassPrefix(remote.password);
			this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing batch direct rsync transfer.', true, {
				completedItems: 0,
				totalItems: items.length,
				currentName: items[0]?.displayName ?? items[0]?.targetName
			});
			const mkdirCommand = route === 'source-push'
				? `${sshpassPrefix}${sshTransport} ${quotePosixShellArg(remoteUserHost)} ${quotePosixShellArg(`mkdir -p ${quotePosixShellArg(request.targetDirectory.path)}`)}`
				: `mkdir -p ${quotePosixShellArg(request.targetDirectory.path)}`;
			const rsyncOptions = buildRsyncOptions(true);
			const sourceArgs = route === 'source-push'
				? items.map(item => quotePosixShellArg(item.sourcePath)).join(' ')
				: items.map(item => quotePosixShellArg(`${remoteUserHost}:${item.sourcePath}`)).join(' ');
			const targetSpec = route === 'source-push'
				? `${remoteUserHost}:${ensureTrailingRemoteSlash(request.targetDirectory.path)}`
				: ensureTrailingRemoteSlash(request.targetDirectory.path);
			const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} -e ${quotePosixShellArg(sshTransport)} ${sourceArgs} ${quotePosixShellArg(targetSpec)}`;
			let lastRsyncBytes = 0;
			let rsyncProgressBuffer = '';
			const handleRsyncOutput = (chunk: string): void => {
				rsyncProgressBuffer = `${rsyncProgressBuffer}${chunk}`.slice(-2048);
				const transferredBytes = this.parseRsyncProgressBytes(rsyncProgressBuffer);
				if (transferredBytes === undefined || transferredBytes < lastRsyncBytes) {
					return;
				}
				lastRsyncBytes = transferredBytes;
				const totalBytes = expectedBytes > 0 ? expectedBytes : transferredBytes;
				this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, 'rsync-direct', 'Batch direct rsync transfer in progress.', false, {
					completedItems: 0,
					totalItems: items.length
				});
			};
			await this.execRemote(client, mkdirCommand);
			this.throwIfTransferCanceled(request.progressId);
			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, rsyncCommand, { onStdout: handleRsyncOutput, onStderr: handleRsyncOutput });
			this.throwIfTransferCanceled(request.progressId);
			const bytes = expectedBytes > 0 ? expectedBytes : lastRsyncBytes;
			this.fireTransferProgress(request, bytes, bytes, 'complete', 'Batch direct rsync completed.', true, {
				completedItems: items.length,
				totalItems: items.length
			});
			this.clearRemoteDirectoryListingCache(request.targetDirectory);
			return this.createBatchTransferResult(true, 'rsync-direct', bytes, 'Batch direct rsync completed.', items.length, 0, [], startedAt, request.progressId);
		} catch {
			if (this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			this.clearDirectRsyncRouteCache(request.source, request.targetDirectory);
			return undefined;
		} finally {
			unregisterCancel();
			client.end();
		}
	}

	private async tryTunneledBatchRsyncRelayTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], expectedBytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.targetDirectory.kind !== 'ssh' || !request.source.connection || !request.targetDirectory.connection) {
			return undefined;
		}
		if (request.source.supportsRsync !== true || request.targetDirectory.supportsRsync !== true || !request.targetDirectory.connection.password) {
			return undefined;
		}
		if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.targetDirectory.path) || items.some(item => looksLikeWindowsPath(item.sourcePath))) {
			return undefined;
		}

		const sourceConfigResult = await this.createConnectConfig(request.source.connection);
		if (!sourceConfigResult.ok) {
			return undefined;
		}

		const client = await this.connect(sourceConfigResult.config);
		const forwardedSockets = new Set<Socket>();
		let forwardedPort: number | undefined;
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
			for (const socket of forwardedSockets) {
				socket.destroy();
			}
			client.end();
		});
		client.on('tcp connection', (_details: ISSHForwardedTcpDetails, accept: () => NodeJS.ReadWriteStream, reject: () => void): void => {
			if (this.isTransferCanceled(request.progressId)) {
				reject();
				return;
			}
			const channel = accept() as NodeJS.ReadWriteStream & { destroy(error?: Error): void };
			const socket = connectTcp(request.targetDirectory.connection!.port || 22, request.targetDirectory.connection!.host);
			forwardedSockets.add(socket);
			socket.on('close', () => forwardedSockets.delete(socket));
			socket.on('error', () => channel.destroy());
			channel.on('error', () => socket.destroy());
			channel.on('close', () => socket.destroy());
			socket.pipe(channel);
			channel.pipe(socket);
		});

		try {
			this.throwIfTransferCanceled(request.progressId);
			if (!await this.canUseLocalRsync(client)) {
				return undefined;
			}
			forwardedPort = await this.forwardIn(client, RSYNC_RELAY_BIND_HOST, 0);
			const target = request.targetDirectory.connection;
			const targetUserHost = `${target.username}@${RSYNC_RELAY_BIND_HOST}`;
			const sshBinary = await this.resolveRemoteRsyncSshBinary(client, request.source.connection);
			const sshTransport = buildOptimizedRsyncSshCommand(forwardedPort, true, sshBinary);
			const sshpassPrefix = buildSshpassPrefix(target.password);
			if (!await this.canUseTargetRsyncThroughRelay(client, targetUserHost, forwardedPort, sshpassPrefix)) {
				return undefined;
			}
			this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing batch rsync relay transfer.', true, {
				completedItems: 0,
				totalItems: items.length,
				currentName: items[0]?.displayName ?? items[0]?.targetName
			});
			const mkdirCommand = `${sshpassPrefix}${buildCompatibleSshCommand(forwardedPort, true)} ${quotePosixShellArg(targetUserHost)} ${quotePosixShellArg(`mkdir -p ${quotePosixShellArg(request.targetDirectory.path)}`)}`;
			const rsyncOptions = buildRsyncOptions(true);
			const sourceArgs = items.map(item => quotePosixShellArg(item.sourcePath)).join(' ');
			const targetSpec = `${targetUserHost}:${ensureTrailingRemoteSlash(request.targetDirectory.path)}`;
			const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} -e ${quotePosixShellArg(sshTransport)} ${sourceArgs} ${quotePosixShellArg(targetSpec)}`;
			let lastRsyncBytes = 0;
			let rsyncProgressBuffer = '';
			const handleRsyncOutput = (chunk: string): void => {
				rsyncProgressBuffer = `${rsyncProgressBuffer}${chunk}`.slice(-2048);
				const transferredBytes = this.parseRsyncProgressBytes(rsyncProgressBuffer);
				if (transferredBytes === undefined || transferredBytes < lastRsyncBytes) {
					return;
				}
				lastRsyncBytes = transferredBytes;
				const totalBytes = expectedBytes > 0 ? expectedBytes : transferredBytes;
				this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, 'relay-upload', 'Batch rsync relay transfer in progress.', false, {
					completedItems: 0,
					totalItems: items.length
				});
			};
			await this.execRemote(client, mkdirCommand);
			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, rsyncCommand, { onStdout: handleRsyncOutput, onStderr: handleRsyncOutput });
			this.throwIfTransferCanceled(request.progressId);
			const bytes = expectedBytes > 0 ? expectedBytes : lastRsyncBytes;
			this.fireTransferProgress(request, bytes, bytes, 'complete', 'Batch rsync relay completed.', true, {
				completedItems: items.length,
				totalItems: items.length
			});
			this.clearRemoteDirectoryListingCache(request.targetDirectory);
			return this.createBatchTransferResult(true, 'rsync-relay', bytes, 'Batch rsync relay completed.', items.length, 0, [], startedAt, request.progressId);
		} catch {
			if (this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			return undefined;
		} finally {
			unregisterCancel();
			if (forwardedPort !== undefined) {
				await this.unforwardIn(client, RSYNC_RELAY_BIND_HOST, forwardedPort).catch(() => undefined);
			}
			for (const socket of forwardedSockets) {
				socket.destroy();
			}
			client.end();
		}
	}

	private async runConcurrentBatchTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move', expectedBytes: number, startedAt: number, disableRsync: boolean): Promise<ITurboFileBatchTransferResult> {
		const transferredByItem = new Array<number>(items.length).fill(0);
		const totalByItem = items.map(item => Math.max(0, item.expectedBytes ?? 0));
		const successfulItems: ITurboFileBatchTransferItem[] = [];
		const failures: ITurboFileBatchTransferFailure[] = [];
		const strategies = new Set<ITurboFileTransferResult['strategy']>();
		const childProgressIds = new Set<string>();
		let completedItems = 0;
		let completedBytes = 0;
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
			for (const childProgressId of [...childProgressIds]) {
				void this.cancelTransfer(childProgressId);
			}
		});
		const workerLimit = items.some(item => item.sourceType === 'directory') ? BATCH_TRANSFER_DIRECTORY_WORKERS : BATCH_TRANSFER_WORKERS;

		try {
			this.markTransferDataStarted(request.progressId);
			await mapLimit(items, workerLimit, async (item, index) => {
				this.throwIfTransferCanceled(request.progressId);
				const childProgressId = `${request.progressId ?? 'turbofile-batch'}-${index}-${randomUUID()}`;
				childProgressIds.add(childProgressId);
				const childSource = disableRsync ? { ...request.source, path: item.sourcePath, supportsRsync: false } : { ...request.source, path: item.sourcePath };
				const childTarget = disableRsync ? { ...request.targetDirectory, path: this.joinBatchTargetPath(request.targetDirectory, item.targetName), supportsRsync: false } : { ...request.targetDirectory, path: this.joinBatchTargetPath(request.targetDirectory, item.targetName) };
				const disposable = this.onDynamicTransferProgress(childProgressId)(event => {
					transferredByItem[index] = event.transferredBytes;
					totalByItem[index] = Math.max(totalByItem[index], event.totalBytes);
					this.fireBatchAggregateProgress(request, transferredByItem, totalByItem, event.phase, event.detail ?? 'Batch transfer in progress.', completedItems, items.length, item.displayName ?? item.targetName);
				});
				try {
					const result = await this.transferFile({
						source: childSource,
						target: childTarget,
						sourceType: item.sourceType,
						expectedBytes: item.expectedBytes,
						progressId: childProgressId,
						strategyHint: disableRsync && request.source.kind === 'ssh' && request.targetDirectory.kind === 'ssh' ? 'direct' : request.strategyHint
					});
					if (result.ok) {
						successfulItems.push(item);
						strategies.add(result.strategy);
						completedBytes += result.bytes;
						transferredByItem[index] = Math.max(transferredByItem[index], result.bytes);
						totalByItem[index] = Math.max(totalByItem[index], result.bytes);
					} else if (result.canceled) {
						throw new TurboFileTransferCanceledError();
					} else {
						failures.push({ name: item.displayName ?? item.targetName, path: item.sourcePath, message: result.message });
					}
				} finally {
					completedItems++;
					childProgressIds.delete(childProgressId);
					disposable.dispose();
					this.fireBatchAggregateProgress(request, transferredByItem, totalByItem, 'transfer', 'Batch transfer in progress.', completedItems, items.length, item.displayName ?? item.targetName, true);
				}
			});

			if (operation === 'move' && successfulItems.length) {
				const cleanupFailures = await this.deleteBatchSources(request.source, successfulItems);
				failures.push(...cleanupFailures);
			}
			const bytes = Math.max(completedBytes, transferredByItem.reduce((sum, value) => sum + value, 0), expectedBytes > 0 && failures.length === 0 ? expectedBytes : 0);
			this.fireTransferProgress(request, bytes, Math.max(bytes, expectedBytes), 'complete', 'Batch transfer completed.', true, {
				completedItems: successfulItems.length,
				totalItems: items.length
			});
			const failed = failures.length;
			return this.createBatchTransferResult(failed === 0, [...strategies][0] ?? getTransferStrategy(request.source, request.targetDirectory), bytes, failed === 0 ? 'Batch transfer completed.' : `Batch transfer completed with ${failed} failure(s).`, successfulItems.length, failed, failures, startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				return this.createBatchTransferResult(false, [...strategies][0] ?? getTransferStrategy(request.source, request.targetDirectory), completedBytes, TRANSFER_CANCELED_MESSAGE, successfulItems.length, failures.length, failures, startedAt, request.progressId, true);
			}
			throw error;
		} finally {
			unregisterCancel();
		}
	}

	private fireBatchAggregateProgress(request: ITurboFileBatchTransferRequest, transferredByItem: readonly number[], totalByItem: readonly number[], phase: ITurboFileTransferProgressEvent['phase'], detail: string, completedItems: number, totalItems: number, currentName?: string, force = false): void {
		const transferredBytes = transferredByItem.reduce((sum, value) => sum + Math.max(0, value), 0);
		const totalBytes = Math.max(this.getBatchExpectedBytes(request, request.items), totalByItem.reduce((sum, value) => sum + Math.max(0, value), 0));
		this.fireTransferProgress(request, transferredBytes, totalBytes, phase, detail, force, {
			completedItems,
			totalItems,
			currentName
		});
	}

	private async deleteBatchSources(source: ITurboFileTransferEndpoint, items: readonly ITurboFileBatchTransferItem[]): Promise<ITurboFileBatchTransferFailure[]> {
		const failures: ITurboFileBatchTransferFailure[] = [];
		if (source.kind === 'local') {
			await mapLimit(items, BATCH_TRANSFER_WORKERS, async item => {
				try {
					await fsp.rm(item.sourcePath, { recursive: true, force: true });
				} catch (error) {
					failures.push({ name: item.displayName ?? item.targetName, path: item.sourcePath, message: error instanceof Error ? error.message : String(error) });
				}
			});
			return failures;
		}
		try {
			const paths = items.map(item => item.sourcePath);
			const command = paths.some(looksLikeWindowsPath)
				? buildWindowsBatchDeleteCommand(paths)
				: `rm -rf -- ${paths.map(path => quotePosixShellArg(path)).join(' ')}`;
			await this.withSshClient(source, client => this.execRemote(client, command));
		} catch (error) {
			for (const item of items) {
				failures.push({ name: item.displayName ?? item.targetName, path: item.sourcePath, message: error instanceof Error ? error.message : String(error) });
			}
		}
		return failures;
	}

	private joinBatchTargetPath(targetDirectory: ITurboFileTransferEndpoint, targetName: string): string {
		return joinRemotePath(targetDirectory.path, targetName);
	}

	private createBatchTransferResult(ok: boolean, strategy: ITurboFileTransferResult['strategy'], bytes: number, message: string, completed: number, failed: number, failures: ITurboFileBatchTransferFailure[], startedAt: number, progressId?: string, canceled = false): ITurboFileBatchTransferResult {
		const durationMs = this.getTransferDurationMs(progressId, startedAt);
		return {
			ok,
			strategy,
			bytes,
			message,
			completed,
			failed,
			failures,
			canceled,
			durationMs,
			averageBytesPerSecond: Math.round(bytes / (durationMs / 1000))
		};
	}

	async createDirectory(endpoint: ITurboFileTransferEndpoint): Promise<ITurboFileFileOperationResult> {
		try {
			if (endpoint.kind === 'local') {
				await fsp.mkdir(endpoint.path, { recursive: true });
			} else {
				await this.withSftp(endpoint, sftp => this.ensureRemoteDirectory(sftp, endpoint.path));
			}
			this.clearRemoteDirectoryListingCache(endpoint);
			return { ok: true, message: 'Directory created.' };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async deletePath(endpoint: ITurboFileTransferEndpoint, recursive = true): Promise<ITurboFileFileOperationResult> {
		try {
			if (endpoint.kind === 'local') {
				await fsp.rm(endpoint.path, { recursive, force: true });
			} else {
				try {
					await this.deleteRemotePathNative(endpoint, recursive);
				} catch (error) {
					if (error instanceof Error && error.message === 'Refusing to delete a filesystem root.') {
						throw error;
					}
					await this.withSftp(endpoint, async sftp => {
						const stats = await this.remoteStat(sftp, endpoint.path);
						if (stats.isDirectory()) {
							await this.deleteRemoteDirectory(sftp, endpoint.path);
						} else {
							await this.unlinkRemote(sftp, endpoint.path);
						}
					});
				}
			}
			this.clearRemoteDirectoryListingCache(endpoint);
			return { ok: true, message: 'Path deleted.' };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	private async deleteRemotePathNative(endpoint: ITurboFileTransferEndpoint, recursive: boolean): Promise<void> {
		this.assertSafeDeletePath(endpoint.path);
		const command = looksLikeWindowsPath(endpoint.path)
			? buildWindowsDeleteCommand(endpoint.path, recursive)
			: buildPosixDeleteCommand(endpoint.path, recursive);
		await this.withSshClient(endpoint, client => this.execRemote(client, command));
	}

	private assertSafeDeletePath(path: string): void {
		const trimmed = path.trim();
		const normalized = trimmed.replace(/[\\/]+$/, '');
		if (!trimmed || trimmed === '/' || trimmed === '\\' || normalized === '' || /^[A-Za-z]:$/.test(normalized)) {
			throw new Error('Refusing to delete a filesystem root.');
		}
	}

	async renamePath(endpoint: ITurboFileTransferEndpoint, targetPath: string): Promise<ITurboFileFileOperationResult> {
		try {
			if (endpoint.kind === 'local') {
				await this.moveLocalPathNative(endpoint.path, targetPath);
			} else {
				await this.moveRemotePathNative(endpoint, targetPath);
			}
			this.clearRemoteDirectoryListingCache(endpoint);
			this.clearRemoteDirectoryListingCache(endpoint, targetPath);
			return { ok: true, message: 'Path renamed.' };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async calculatePathSize(endpoint: ITurboFileTransferEndpoint): Promise<ITurboFilePathSizeResult> {
		try {
			const size = endpoint.kind === 'local'
				? await getLocalPathSize(endpoint.path)
				: await this.getRemotePathSizeByCommand(endpoint);
			const humanSize = await this.getPathHumanSize(endpoint, size);
			return { ok: true, message: 'Path size calculated.', size, humanSize };
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : String(error),
				size: 0
			};
		}
	}

	async readWindowsClipboardFiles(): Promise<ITurboFileWindowsClipboardFilesResult> {
		try {
			const paths = readWindowsClipboardFilePaths();
			return {
				ok: paths.length > 0,
				message: paths.length > 0 ? 'Windows clipboard files loaded.' : 'No Windows files in clipboard.',
				paths,
				operation: readWindowsClipboardOperation()
			};
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : String(error),
				paths: [],
				operation: 'copy'
			};
		}
	}

	async readFile(endpoint: ITurboFileTransferEndpoint, options: ITurboFileReadFileOptions = {}): Promise<ITurboFileReadFileResult> {
		const encoding = options.encoding ?? 'utf8';
		const maxBytes = options.maxBytes ?? DEFAULT_READ_LIMIT;
		const mime = getMimeType(endpoint.path);
		try {
			const buffer = endpoint.kind === 'local'
				? await this.readLocalFileBuffer(endpoint.path, maxBytes)
				: await this.readRemoteFileBuffer(endpoint, maxBytes);
			const imageSize = mime.startsWith('image/') ? getImageSize(buffer) : undefined;
			return {
				ok: true,
				message: 'File loaded.',
				content: encoding === 'base64' ? buffer.toString('base64') : buffer.toString('utf8'),
				encoding,
				mime,
				size: buffer.byteLength,
				width: imageSize?.width,
				height: imageSize?.height
			};
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : String(error),
				content: '',
				encoding,
				mime,
				size: 0
			};
		}
	}

	async readImage(endpoint: ITurboFileTransferEndpoint, options: ITurboFileReadImageOptions = {}): Promise<ITurboFileReadFileResult> {
		const encoding = options.encoding ?? 'base64';
		try {
			const result = await this.readImageBuffer(endpoint, options);
			return {
				ok: true,
				message: 'Image loaded.',
				content: encoding === 'base64' ? result.buffer.toString('base64') : result.buffer.toString('utf8'),
				encoding,
				mime: result.mime,
				size: result.buffer.byteLength,
				width: result.width,
				height: result.height
			};
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : String(error),
				content: '',
				encoding,
				mime: getMimeType(endpoint.path),
				size: 0
			};
		}
	}

	async writeClipboardImage(content: string, mime: string, encoding: TurboFileContentEncoding = 'base64'): Promise<ITurboFileFileOperationResult> {
		try {
			const buffer = Buffer.from(content, encoding);
			const image = nativeImage.createFromBuffer(buffer);
			if (image.isEmpty()) {
				return { ok: false, message: `无法解析图片数据：${mime || 'unknown'}` };
			}
			clipboard.writeImage(image);
			return { ok: true, message: 'Image copied to clipboard.' };
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : String(error)
			};
		}
	}

	async writeFile(endpoint: ITurboFileTransferEndpoint, content: string, encoding: TurboFileContentEncoding = 'utf8'): Promise<ITurboFileFileOperationResult> {
		const buffer = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
		try {
			if (endpoint.kind === 'local') {
				await fsp.mkdir(dirname(endpoint.path), { recursive: true });
				await fsp.writeFile(endpoint.path, buffer);
			} else {
				const tempRoot = join(tmpdir(), `turbofile-write-${randomUUID()}`);
				const tempPath = join(tempRoot, basename(endpoint.path) || 'content');
				try {
					await fsp.mkdir(tempRoot, { recursive: true });
					await fsp.writeFile(tempPath, buffer);
					await this.withSftp(endpoint, async sftp => {
						await this.ensureRemoteDirectory(sftp, getRemoteParentPath(endpoint.path));
						await this.fastPut(sftp, tempPath, endpoint.path, this.createSftpTransferOptions());
					});
				} finally {
					await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
				}
			}
			this.clearRemoteDirectoryListingCache(endpoint);
			return { ok: true, message: 'File saved.' };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async compressPath(endpoint: ITurboFileTransferEndpoint, targetPath?: string): Promise<ITurboFileFileOperationResult> {
		try {
			const archivePath = targetPath ?? getDefaultArchivePath(endpoint.path, endpoint.kind === 'local' ? 'zip' : 'tar.gz');
			if (endpoint.kind === 'local') {
				await runLocalCommand('tar.exe', ['-a', '-cf', archivePath, '-C', dirname(endpoint.path), basename(endpoint.path)]);
			} else {
				await this.withSshClient(endpoint, client => this.execRemote(client, `mkdir -p ${quotePosixShellArg(getRemoteParentPath(archivePath))} && tar -czf ${quotePosixShellArg(archivePath)} -C ${quotePosixShellArg(getRemoteParentPath(endpoint.path))} ${quotePosixShellArg(getTransferName(endpoint.path))}`));
			}
			this.clearRemoteDirectoryListingCache(endpoint, archivePath);
			return { ok: true, message: `Archive created: ${archivePath}` };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async extractPath(endpoint: ITurboFileTransferEndpoint, targetDirectory?: string): Promise<ITurboFileFileOperationResult> {
		try {
			let outputDirectory = targetDirectory ?? getDefaultExtractDirectory(endpoint.path);
			if (endpoint.kind === 'local') {
				outputDirectory = await getAvailableLocalDirectory(outputDirectory);
				await fsp.mkdir(outputDirectory, { recursive: true });
				await runLocalCommand('tar.exe', ['-xf', endpoint.path, '-C', outputDirectory]);
			} else {
				const outputSetup = `out=${quotePosixShellArg(outputDirectory)}; if [ -e "$out" ] && [ ! -d "$out" ]; then out="$out"_extracted; fi; mkdir -p "$out"`;
				const command = isZipPath(endpoint.path)
					? `${outputSetup} && unzip -o ${quotePosixShellArg(endpoint.path)} -d "$out"`
					: `${outputSetup} && tar -xf ${quotePosixShellArg(endpoint.path)} -C "$out"`;
				await this.withSshClient(endpoint, client => this.execRemote(client, command));
			}
			this.clearRemoteDirectoryListingCache(endpoint, outputDirectory);
			return { ok: true, message: `Archive extracted: ${outputDirectory}` };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async createSshTerminal(options: ITurboFileSshConnectionOptions, cwd: string, cols: number, rows: number): Promise<ITurboFileSshTerminalSession> {
		const configResult = await this.createConnectConfig(options);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		const reusableDirectorySession = await this.getReusableDirectorySftpSession(options);
		const client = reusableDirectorySession?.client ?? await this.connect(configResult.config);
		let stream: ISSHShellStream | undefined;
		try {
			stream = await this.openShell(client, cols, rows);
			const sessionId = randomUUID();
			const session: ITurboFileSshTerminalMainSession = {
				client,
				stream,
				dataEmitter: new Emitter<string>(),
				exitEmitter: new Emitter<number | undefined>(),
				dataBuffer: [],
				bootstrapBuffer: '',
				bootstrapping: true,
				hasDataListener: false,
				closed: false,
				sharedDirectorySessionKey: reusableDirectorySession?.key
			};
			this.terminalSessions.set(sessionId, session);

			stream.on('data', data => {
				const chunk = data.toString();
				if (session.bootstrapping) {
					session.bootstrapBuffer += chunk;
					const markerIndex = session.bootstrapBuffer.indexOf(SSH_TERMINAL_READY_MARKER);
					if (markerIndex >= 0) {
						const remaining = session.bootstrapBuffer.slice(markerIndex + SSH_TERMINAL_READY_MARKER.length).replace(/^\r?\n/, '');
						session.bootstrapBuffer = '';
						session.bootstrapping = false;
						if (remaining) {
							if (session.hasDataListener) {
								session.dataEmitter.fire(remaining);
							} else {
								session.dataBuffer.push(remaining);
							}
						}
					}
					return;
				}
				if (session.hasDataListener) {
					session.dataEmitter.fire(chunk);
				} else {
					session.dataBuffer.push(chunk);
				}
			});
			stream.on('error', error => {
				const chunk = `\r\n极速传 SSH terminal error: ${error.message}\r\n`;
				if (session.hasDataListener) {
					session.dataEmitter.fire(chunk);
				} else {
					session.dataBuffer.push(chunk);
				}
			});
			stream.on('close', code => this.cleanupSshTerminalSession(sessionId, code ?? undefined));
			client.on('close', () => this.cleanupSshTerminalSession(sessionId, undefined));

			stream.write(buildShellBootstrapCommand(cwd));

			return {
				sessionId,
				cwd,
				pid: this.terminalSessionSequence++
			};
		} catch (error) {
			stream?.end();
			if (!reusableDirectorySession) {
				client.end();
			} else {
				this.touchDirectorySftpSession(reusableDirectorySession.key);
			}
			throw error;
		}
	}

	async writeSshTerminal(sessionId: string, data: string): Promise<void> {
		const session = this.terminalSessions.get(sessionId);
		if (!session || session.closed) {
			return;
		}
		session.stream.write(data);
	}

	async resizeSshTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
		const session = this.terminalSessions.get(sessionId);
		if (!session || session.closed) {
			return;
		}
		session.stream.setWindow?.(rows, cols, 0, 0);
	}

	async shutdownSshTerminal(sessionId: string): Promise<void> {
		this.cleanupSshTerminalSession(sessionId, undefined);
	}

	private async trySameRemoteCopy(request: ITurboFileTransferRequest, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (!isSameSshConnection(request.source.connection, request.target.connection)) {
			return undefined;
		}

		this.throwIfTransferCanceled(request.progressId);
		const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown' as TurboFileFileType);
		const expectedBytes = Math.max(0, request.expectedBytes ?? 0);
		let bytes = expectedBytes;
		if (sourceType === 'directory') {
			bytes = bytes > 64 * 1024 ? bytes : await this.getRemotePathSizeByCommand(request.source).catch(() => expectedBytes);
		} else if (bytes <= 0) {
			bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => expectedBytes);
		}
		this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing remote copy.', true);

		const command = looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)
			? buildWindowsCopyCommand(request.source.path, request.target.path)
			: buildPosixCopyCommand(request.source.path, request.target.path);

		this.fireTransferProgress(request, 0, bytes, 'transfer', 'Remote copy in progress.', true);
		this.markTransferDataStarted(request.progressId);
		await this.execRemoteCopyWithProgress(request, command, bytes, sourceType);
		this.throwIfTransferCanceled(request.progressId);
		if (bytes === 0 && expectedBytes === 0) {
			bytes = await this.getRemotePathSizeByCommand(request.target).catch(() => 0);
		}
		return this.createTransferResult(true, 'remote-copy', bytes, 'Remote copy completed.', startedAt, request.progressId);
	}

	private async tryDirectRsyncTransfer(request: ITurboFileTransferRequest, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (request.strategyHint === 'relay') {
			return undefined;
		}
		if (request.source.supportsRsync !== true || request.target.supportsRsync !== true) {
			return undefined;
		}
		if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}
		this.throwIfTransferCanceled(request.progressId);

		const route = await this.resolveDirectRsyncRoute(request.source, request.target, request.progressId);
		if (route === 'unavailable') {
			return undefined;
		}

		const executorEndpoint = route === 'source-push' ? request.source : request.target;
		const remoteEndpoint = route === 'source-push' ? request.target : request.source;
		if (!executorEndpoint.connection || !remoteEndpoint.connection) {
			return undefined;
		}
		const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
		if (!executorConfigResult.ok) {
			return undefined;
		}

		const client = await this.connect(executorConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		try {
			this.throwIfTransferCanceled(request.progressId);
			const remote = remoteEndpoint.connection;
			const remoteUserHost = `${remote.username}@${remote.host}`;
			const sshBinary = await this.resolveRemoteRsyncSshBinary(client, executorEndpoint.connection);
			const sshTransport = buildOptimizedRsyncSshCommand(remote.port || 22, !!remote.password, sshBinary);
			const sshpassPrefix = buildSshpassPrefix(remote.password);

			const sourceType = request.sourceType ?? await this.withSftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown' as TurboFileFileType);
			const sourceIsDirectory = sourceType === 'directory';
			let bytes = sourceIsDirectory ? Math.max(0, request.expectedBytes ?? 0) : 0;
			if (!sourceIsDirectory) {
				try {
					bytes = await this.getRemotePathSizeByCommand(request.source);
				} catch {
					if (this.isTransferCanceled(request.progressId)) {
						throw new TurboFileTransferCanceledError();
					}
					bytes = 0;
				}
			}

			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing direct rsync transfer.', true);

			const remoteTargetPath = sourceIsDirectory ? request.target.path : getRemoteParentPath(request.target.path);
			const mkdirCommand = route === 'source-push'
				? `${sshpassPrefix}${sshTransport} ${quotePosixShellArg(remoteUserHost)} ${quotePosixShellArg(`mkdir -p ${quotePosixShellArg(remoteTargetPath)}`)}`
				: `mkdir -p ${quotePosixShellArg(remoteTargetPath)}`;
			if (sourceIsDirectory && route === 'source-push') {
				const parallelResult = await this.tryDirectParallelRsyncDirectoryTransfer(request, startedAt, remoteUserHost, sshTransport, sshpassPrefix, mkdirCommand);
				if (parallelResult?.ok) {
					return parallelResult;
				}
			}
			const rsyncOptions = buildRsyncOptions(true);
			const rsyncSourcePath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.source.path) : request.source.path;
			const rsyncTargetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
			const rsyncSourceArg = route === 'source-push' ? rsyncSourcePath : `${remoteUserHost}:${rsyncSourcePath}`;
			const rsyncTargetArg = route === 'source-push' ? `${remoteUserHost}:${rsyncTargetPath}` : rsyncTargetPath;
			const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(rsyncSourceArg)} ${quotePosixShellArg(rsyncTargetArg)}`;
			let lastRsyncBytes = 0;
			let rsyncProgressBuffer = '';
			const handleRsyncOutput = (chunk: string): void => {
				rsyncProgressBuffer = `${rsyncProgressBuffer}${chunk}`.slice(-2048);
				const transferredBytes = this.parseRsyncProgressBytes(rsyncProgressBuffer);
				if (transferredBytes === undefined || transferredBytes < lastRsyncBytes) {
					return;
				}
				lastRsyncBytes = transferredBytes;
				const totalBytes = bytes > 0 ? bytes : transferredBytes;
				this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, 'rsync-direct', 'Direct rsync transfer in progress.');
			};

			this.throwIfTransferCanceled(request.progressId);
			await this.execRemote(client, mkdirCommand);
			this.throwIfTransferCanceled(request.progressId);
			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, rsyncCommand, { onStdout: handleRsyncOutput, onStderr: handleRsyncOutput });
			this.throwIfTransferCanceled(request.progressId);

			if (bytes === 0 && lastRsyncBytes > 0) {
				bytes = lastRsyncBytes;
			}

			return this.createTransferResult(true, 'rsync-direct', bytes, 'Direct rsync completed.', startedAt, request.progressId);
		} catch {
			if (this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			this.clearDirectRsyncRouteCache(request.source, request.target);
			return undefined;
		} finally {
			unregisterCancel();
			client.end();
		}
	}

	private async canExecutorUseDirectRsyncTransfer(client: ISSHClient, remoteConnection: ITurboFileSshConnectionOptions, remoteUserHost: string, sshTransport: string, sshpassPrefix: string): Promise<boolean> {
		const checks = [
			'command -v rsync >/dev/null 2>&1'
		];
		if (remoteConnection.password) {
			checks.push('command -v sshpass >/dev/null 2>&1');
		}
		checks.push(`${sshpassPrefix}${sshTransport} ${quotePosixShellArg(remoteUserHost)} ${quotePosixShellArg('command -v rsync >/dev/null 2>&1')}`);

		try {
			await this.execRemote(client, checks.join(' && '));
			return true;
		} catch {
			return false;
		}
	}

	private async resolveDirectRsyncRoute(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint, progressId: string | undefined): Promise<TurboFileDirectRsyncRouteMode> {
		if (source.kind !== 'ssh' || target.kind !== 'ssh' || !source.connection || !target.connection) {
			return 'unavailable';
		}

		const cacheKey = getDirectRsyncRouteCacheKey(source.connection, target.connection);
		const cached = this.directRsyncRouteCache.get(cacheKey);
		const now = Date.now();
		const cacheTtl = cached?.mode === 'unavailable' ? DIRECT_RSYNC_ROUTE_UNAVAILABLE_CACHE_TTL_MS : DIRECT_RSYNC_ROUTE_CACHE_TTL_MS;
		if (cached && now - cached.checkedAt < cacheTtl) {
			return cached.mode;
		}

		const pending = this.directRsyncRoutePending.get(cacheKey);
		if (pending) {
			return pending;
		}

		const probe = this.probeDirectRsyncRoute(source, target, progressId).then(mode => {
			this.directRsyncRouteCache.set(cacheKey, { mode, checkedAt: Date.now() });
			return mode;
		}).finally(() => {
			this.directRsyncRoutePending.delete(cacheKey);
		});
		this.directRsyncRoutePending.set(cacheKey, probe);
		return probe;
	}

	private async probeDirectRsyncRoute(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint, progressId: string | undefined): Promise<TurboFileDirectRsyncRouteMode> {
		this.throwIfTransferCanceled(progressId);
		if (await this.canDirectRsyncExecutorReach(source, target, progressId)) {
			return 'source-push';
		}
		this.throwIfTransferCanceled(progressId);
		if (await this.canDirectRsyncExecutorReach(target, source, progressId)) {
			return 'target-pull';
		}
		return 'unavailable';
	}

	private async canDirectRsyncExecutorReach(executor: ITurboFileTransferEndpoint, remote: ITurboFileTransferEndpoint, progressId: string | undefined): Promise<boolean> {
		if (executor.kind !== 'ssh' || remote.kind !== 'ssh' || !executor.connection || !remote.connection) {
			return false;
		}

		const executorConfigResult = await this.createConnectConfig(executor.connection);
		if (!executorConfigResult.ok) {
			return false;
		}

		const remoteUserHost = `${remote.connection.username}@${remote.connection.host}`;
		const client = await this.connect(executorConfigResult.config).catch(() => undefined);
		if (!client) {
			return false;
		}
		try {
			this.throwIfTransferCanceled(progressId);
			const sshBinary = await this.resolveRemoteRsyncSshBinary(client, executor.connection);
			const sshTransport = buildOptimizedRsyncSshCommand(remote.connection.port || 22, !!remote.connection.password, sshBinary);
			const sshpassPrefix = buildSshpassPrefix(remote.connection.password);
			return await this.canExecutorUseDirectRsyncTransfer(client, remote.connection, remoteUserHost, sshTransport, sshpassPrefix);
		} finally {
			client.end();
		}
	}

	private async resolveRemoteRsyncSshBinary(client: ISSHClient, connection: ITurboFileSshConnectionOptions): Promise<string> {
		const cacheKey = getSshConnectionRouteKey(connection);
		const cached = this.remoteRsyncSshBinaryCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		try {
			const output = await this.execRemoteBytes(client, [
				'if [ -x /usr/bin/ssh.original ]; then printf %s /usr/bin/ssh.original;',
				'elif [ -x /usr/bin/ssh.bak ]; then printf %s /usr/bin/ssh.bak;',
				'else command -v ssh || printf %s ssh; fi'
			].join(' '), { timeoutMs: 2000 });
			const binary = output.toString('utf8').trim().split(/\r?\n/)[0];
			const normalized = binary && /^[A-Za-z0-9_./-]+$/.test(binary) ? binary : 'ssh';
			this.remoteRsyncSshBinaryCache.set(cacheKey, normalized);
			return normalized;
		} catch {
			this.remoteRsyncSshBinaryCache.set(cacheKey, 'ssh');
			return 'ssh';
		}
	}

	private clearDirectRsyncRouteCache(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint): void {
		if (source.kind !== 'ssh' || target.kind !== 'ssh' || !source.connection || !target.connection) {
			return;
		}
		this.directRsyncRouteCache.delete(getDirectRsyncRouteCacheKey(source.connection, target.connection));
	}

	private async tryDirectSftpTransfer(request: ITurboFileTransferRequest, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (request.strategyHint === 'relay') {
			return undefined;
		}
		if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}
		this.throwIfTransferCanceled(request.progressId);

		const sourceConfigResult = await this.createConnectConfig(request.source.connection);
		if (!sourceConfigResult.ok) {
			return undefined;
		}

		const target = request.target.connection;
		const targetUserHost = `${target.username}@${target.host}`;
		const sshpassPrefix = buildSshpassPrefix(target.password);
		const sftpCommand = `${sshpassPrefix}${buildOptimizedSftpCommand(target.port || 22, !!target.password)} ${quotePosixShellArg(targetUserHost)}`;
		const sshTransport = buildCompatibleSshCommand(target.port || 22, !!target.password);
		const client = await this.connect(sourceConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		try {
			this.throwIfTransferCanceled(request.progressId);
			const canUseDirectSftp = await this.canUseDirectSftpTransfer(request, client, sftpCommand);
			if (!canUseDirectSftp) {
				return undefined;
			}

			const sourceType = request.sourceType ?? await this.withSftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown' as TurboFileFileType);
			const expectedBytes = Math.max(0, request.expectedBytes ?? 0);
			let bytes = expectedBytes;
			if (bytes === 0) {
				bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => expectedBytes);
			}

			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing direct SFTP transfer.', true);
			const targetParentPath = getRemoteParentPath(request.target.path);
			const mkdirCommand = `${sshpassPrefix}${sshTransport} ${quotePosixShellArg(targetUserHost)} ${quotePosixShellArg(`mkdir -p ${quotePosixShellArg(targetParentPath)}`)}`;
			const batch = `${sourceType === 'directory' ? 'put -pr' : 'put -p'} ${quoteSftpBatchPath(request.source.path)} ${quoteSftpBatchPath(request.target.path)}\n`;
			const putCommand = `printf %s ${quotePosixShellArg(batch)} | ${sftpCommand}`;

			this.throwIfTransferCanceled(request.progressId);
			await this.execRemote(client, mkdirCommand);
			this.throwIfTransferCanceled(request.progressId);
			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, putCommand);
			this.throwIfTransferCanceled(request.progressId);

			this.fireTransferProgress(request, bytes, bytes, 'transfer', 'Direct SFTP transfer completed.', true);
			return this.createTransferResult(true, 'sftp-direct', bytes, 'Direct SFTP completed.', startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			return undefined;
		} finally {
			unregisterCancel();
			client.end();
		}
	}

	private async canUseDirectSftpTransfer(request: ITurboFileTransferRequest, client: ISSHClient, sftpCommand: string): Promise<boolean> {
		if (!request.target.connection) {
			return false;
		}

		const checks = [
			'command -v sftp >/dev/null 2>&1'
		];
		if (request.target.connection.password) {
			checks.push('command -v sshpass >/dev/null 2>&1');
		}
		checks.push(`printf %s ${quotePosixShellArg('pwd\n')} | ${sftpCommand} >/dev/null`);

		try {
			await this.execRemote(client, checks.join(' && '));
			return true;
		} catch {
			return false;
		}
	}

	private async tryDirectParallelRsyncDirectoryTransfer(request: ITurboFileTransferRequest, startedAt: number, targetUserHost: string, sshTransport: string, sshpassPrefix: string, mkdirCommand: string): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh') {
			return undefined;
		}

		const rsyncOptions = [
			'-a',
			'--inplace',
			'--whole-file',
			'--no-compress',
			'--numeric-ids',
			'--timeout=600',
			'-s',
			'--no-perms',
			'--no-owner',
			'--no-group',
			'--omit-dir-times'
		].join(' ');
		const targetSpec = `${targetUserHost}:${trimTrailingRemoteSlash(request.target.path)}`;
		const workerScript = [
			'item="$1"',
			'base=$(basename "$item")',
			`target=${quotePosixShellArg(targetSpec)}`,
			`if [ -d "$item" ]; then ${sshpassPrefix}rsync ${rsyncOptions} -e ${quotePosixShellArg(sshTransport)} "$item/" "$target/$base/"; else ${sshpassPrefix}rsync ${rsyncOptions} -e ${quotePosixShellArg(sshTransport)} "$item" "$target/"; fi`
		].join('; ');
		const parallelCommand = [
			'set -e',
			mkdirCommand,
			`find ${quotePosixShellArg(request.source.path)} -mindepth 1 -maxdepth 1 -print0 | xargs -0 -r -n 1 -P ${RSYNC_DIRECTORY_PARALLEL_WORKERS} sh -c ${quotePosixShellArg(workerScript)} sh`
		].join('; ');

		const sourceConfigResult = await this.createConnectConfig(request.source.connection!);
		if (!sourceConfigResult.ok) {
			return undefined;
		}

		const client = await this.connect(sourceConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		try {
			this.throwIfTransferCanceled(request.progressId);
			const expectedBytes = Math.max(0, request.expectedBytes ?? 0);
			this.fireTransferProgress(request, 0, expectedBytes, 'rsync-direct', 'Parallel rsync directory transfer in progress.', true);
			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, parallelCommand);
			this.throwIfTransferCanceled(request.progressId);
			const bytes = await this.getRemotePathSizeByCommand(request.target).catch(() => expectedBytes);
			const totalBytes = bytes > 0 ? bytes : expectedBytes;
			this.fireTransferProgress(request, totalBytes, totalBytes, 'rsync-direct', 'Parallel rsync directory transfer completed.', true);
			return this.createTransferResult(true, 'rsync-direct-parallel', totalBytes, 'Parallel rsync directory completed.', startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			return undefined;
		} finally {
			unregisterCancel();
			client.end();
		}
	}

	private async tryTunneledRsyncRelayTransfer(request: ITurboFileTransferRequest, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (request.source.supportsRsync !== true || request.target.supportsRsync !== true || request.strategyHint === 'direct') {
			return undefined;
		}
		if (!request.target.connection.password || looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}

		const sourceConfigResult = await this.createConnectConfig(request.source.connection);
		if (!sourceConfigResult.ok) {
			return undefined;
		}

		const client = await this.connect(sourceConfigResult.config);
		const forwardedSockets = new Set<Socket>();
		let forwardedPort: number | undefined;
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
			for (const socket of forwardedSockets) {
				socket.destroy();
			}
			client.end();
		});
		const onForwardedConnection = (_details: ISSHForwardedTcpDetails, accept: () => NodeJS.ReadWriteStream, reject: () => void): void => {
			if (this.isTransferCanceled(request.progressId)) {
				reject();
				return;
			}
			const channel = accept() as NodeJS.ReadWriteStream & { destroy(error?: Error): void };
			const socket = connectTcp(request.target.connection!.port || 22, request.target.connection!.host);
			forwardedSockets.add(socket);
			socket.on('close', () => forwardedSockets.delete(socket));
			socket.on('error', () => channel.destroy());
			channel.on('error', () => socket.destroy());
			channel.on('close', () => socket.destroy());
			socket.pipe(channel);
			channel.pipe(socket);
		};
		client.on('tcp connection', onForwardedConnection);

		try {
			this.throwIfTransferCanceled(request.progressId);
			const canUseLocalRsync = await this.canUseLocalRsync(client);
			if (!canUseLocalRsync) {
				return undefined;
			}

			forwardedPort = await this.forwardIn(client, RSYNC_RELAY_BIND_HOST, 0);
			const target = request.target.connection;
			const targetUserHost = `${target.username}@${RSYNC_RELAY_BIND_HOST}`;
			const sshBinary = await this.resolveRemoteRsyncSshBinary(client, request.source.connection);
			const sshTransport = buildOptimizedRsyncSshCommand(forwardedPort, true, sshBinary);
			const sshpassPrefix = buildSshpassPrefix(target.password);
			const sourceType = request.sourceType ?? await this.withSftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown' as TurboFileFileType);
			const sourceIsDirectory = sourceType === 'directory';
			let bytes = Math.max(0, request.expectedBytes ?? 0);
			if (!sourceIsDirectory || bytes === 0) {
				bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => bytes);
			}

			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing rsync relay transfer.', true);
			const remoteTargetPath = sourceIsDirectory ? request.target.path : getRemoteParentPath(request.target.path);
			const mkdirCommand = `${sshpassPrefix}${buildCompatibleSshCommand(forwardedPort, true)} ${quotePosixShellArg(targetUserHost)} ${quotePosixShellArg(`mkdir -p ${quotePosixShellArg(remoteTargetPath)}`)}`;
			const canUseTargetRsync = await this.canUseTargetRsyncThroughRelay(client, targetUserHost, forwardedPort, sshpassPrefix);
			if (!canUseTargetRsync) {
				return undefined;
			}
			await this.execRemote(client, mkdirCommand);

			const rsyncOptions = [
				'-a',
				'--inplace',
				'--whole-file',
				'--no-compress',
				'--numeric-ids',
				'--timeout=600',
				'-s',
				'--no-perms',
				'--no-owner',
				'--no-group',
				'--omit-dir-times',
				'--info=progress2'
			].join(' ');
			const rsyncSourcePath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.source.path) : request.source.path;
			const rsyncTargetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
			const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(rsyncSourcePath)} ${quotePosixShellArg(`${targetUserHost}:${rsyncTargetPath}`)}`;
			let lastRsyncBytes = 0;
			let rsyncProgressBuffer = '';
			const handleRsyncOutput = (chunk: string): void => {
				rsyncProgressBuffer = `${rsyncProgressBuffer}${chunk}`.slice(-2048);
				const transferredBytes = this.parseRsyncProgressBytes(rsyncProgressBuffer);
				if (transferredBytes === undefined || transferredBytes < lastRsyncBytes) {
					return;
				}
				lastRsyncBytes = transferredBytes;
				const totalBytes = bytes > 0 ? bytes : transferredBytes;
				this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, 'relay-upload', 'Rsync relay transfer in progress.');
			};

			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, rsyncCommand, { onStdout: handleRsyncOutput, onStderr: handleRsyncOutput });
			this.throwIfTransferCanceled(request.progressId);
			if (bytes === 0 && lastRsyncBytes > 0) {
				bytes = lastRsyncBytes;
			}
			return this.createTransferResult(true, 'rsync-relay', bytes, 'Rsync relay completed.', startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			return undefined;
		} finally {
			unregisterCancel();
			if (forwardedPort !== undefined) {
				await this.unforwardIn(client, RSYNC_RELAY_BIND_HOST, forwardedPort).catch(() => undefined);
			}
			for (const socket of forwardedSockets) {
				socket.destroy();
			}
			client.end();
		}
	}

	private async canUseLocalRsync(client: ISSHClient): Promise<boolean> {
		try {
			await this.execRemote(client, 'command -v rsync >/dev/null 2>&1 && command -v sshpass >/dev/null 2>&1');
			return true;
		} catch {
			return false;
		}
	}

	private async canUseTargetRsyncThroughRelay(client: ISSHClient, targetUserHost: string, forwardedPort: number, sshpassPrefix: string): Promise<boolean> {
		try {
			await this.execRemote(client, `${sshpassPrefix}${buildCompatibleSshCommand(forwardedPort, true)} ${quotePosixShellArg(targetUserHost)} ${quotePosixShellArg('command -v rsync >/dev/null 2>&1')}`);
			return true;
		} catch {
			return false;
		}
	}

	private async tryStreamRelayTransfer(request: ITurboFileTransferRequest, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}

		const sourceConfigResult = await this.createConnectConfig(request.source.connection);
		const targetConfigResult = await this.createConnectConfig(request.target.connection);
		if (!sourceConfigResult.ok || !targetConfigResult.ok) {
			return undefined;
		}

		let sourceClient: ISSHClient | undefined;
		let targetClient: ISSHClient | undefined;
		let sourceSftp: ISFTPWrapper | undefined;
		let targetSftp: ISFTPWrapper | undefined;
		try {
			sourceClient = await this.connect(sourceConfigResult.config);
			targetClient = await this.connect(targetConfigResult.config);
			sourceSftp = await this.openSftp(sourceClient);
			targetSftp = await this.openSftp(targetClient);
			this.throwIfTransferCanceled(request.progressId);

			const sourceType = request.sourceType ?? getFileTypeFromStats(await this.remoteStat(sourceSftp, request.source.path));
			if (sourceType === 'directory') {
				return undefined;
			}

			const sourceStat = await this.remoteStat(sourceSftp, request.source.path);
			const bytes = sourceStat.size;
			const totalBytes = bytes * 2;
			this.fireTransferProgress(request, 0, totalBytes, 'prepare', 'Preparing SFTP parallel relay.', true);
			await this.ensureRemoteDirectory(targetSftp, getRemoteParentPath(request.target.path));
			const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
				sourceSftp?.end();
				targetSftp?.end();
				sourceClient?.end();
				targetClient?.end();
			});
			let streamedBytes = 0;
			try {
				this.markTransferDataStarted(request.progressId);
				await this.relayRemoteFileInParallel(sourceSftp, targetSftp, request.source.path, request.target.path, bytes, delta => {
					streamedBytes += delta;
					this.fireTransferProgress(request, Math.min(streamedBytes * 2, totalBytes), totalBytes, 'relay-upload', 'Parallel SFTP relay in progress.');
				}, request.progressId);
			} finally {
				unregisterCancel();
			}
			this.throwIfTransferCanceled(request.progressId);
			return this.createTransferResult(true, 'sftp-relay', bytes, 'SFTP parallel relay completed.', startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw error;
			}
			return undefined;
		} finally {
			sourceSftp?.end();
			targetSftp?.end();
			sourceClient?.end();
			targetClient?.end();
		}
	}

	private async createConnectConfig(options: ITurboFileSshConnectionOptions): Promise<{ ok: true; config: ConnectConfig } | { ok: false; message: string }> {
		const nativeRequire = await this.getNativeRequire();
		nativeRequire('ssh2');
		if (!options.host || !options.username) {
			return { ok: false, message: 'Host and username are required.' };
		}

		const config: ConnectConfig = {
			host: options.host,
			port: options.port || 22,
			username: options.username,
			readyTimeout: options.timeout ?? 10000,
			tryKeyboard: false
		};

		if (options.password !== undefined) {
			config.password = options.password;
		}

		let privateKey: string | undefined;
		try {
			privateKey = options.privateKey ?? await this.readPrivateKey(options.privateKeyPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { ok: false, message };
		}

		if (privateKey) {
			config.privateKey = privateKey;
		}

		if (options.passphrase) {
			config.passphrase = options.passphrase;
		}

		return { ok: true, config };
	}

	private async readPrivateKey(privateKeyPath: string | undefined): Promise<string | undefined> {
		if (!privateKeyPath) {
			return undefined;
		}

		return fsp.readFile(privateKeyPath, 'utf8');
	}

	private async doTestConnection(config: ConnectConfig): Promise<ITurboFileSshConnectionResult> {
		try {
			const client = await this.connect(config);
			client.end();
			return { ok: true, message: 'SSH connection succeeded.' };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { ok: false, message };
		}
	}

	private async connect(config: ConnectConfig): Promise<ISSHClient> {
		const nativeRequire = await this.getNativeRequire();
		const ssh2Module = nativeRequire('ssh2') as { Client: new () => ISSHClient };
		const client = new ssh2Module.Client();

		return new Promise<ISSHClient>((resolve, reject) => {
			let settled = false;

			const settle = (callback: () => void): void => {
				if (settled) {
					return;
				}
				settled = true;
				callback();
			};

			client
				.on('ready', () => settle(() => resolve(client)))
				.on('error', error => settle(() => reject(error)))
				.on('close', () => {
					if (!settled) {
						settle(() => reject(new Error('SSH connection closed before authentication completed.')));
					}
				});

			try {
				client.connect(config);
			} catch (error) {
				settle(() => reject(error));
			}
		});
	}

	private async getDirectorySftpSession(options: ITurboFileSshConnectionOptions, config: ConnectConfig): Promise<IRemoteDirectorySftpSession> {
		const key = this.getDirectorySftpSessionKey(options);
		const existing = this.directorySftpSessions.get(key);
		if (existing) {
			const session = await existing;
			if (!session.closed) {
				this.touchDirectorySftpSession(key);
				return session;
			}
			this.directorySftpSessions.delete(key);
		}

		const sessionPromise = this.createDirectorySftpSession(key, config).catch(error => {
			this.directorySftpSessions.delete(key);
			this.clearDirectorySftpIdleTimer(key);
			throw error;
		});
		this.directorySftpSessions.set(key, sessionPromise);
		const session = await sessionPromise;
		this.touchDirectorySftpSession(key);
		return session;
	}

	private async getReusableDirectorySftpSession(options: ITurboFileSshConnectionOptions): Promise<IRemoteDirectorySftpSession | undefined> {
		const key = this.getDirectorySftpSessionKey(options);
		const existing = this.directorySftpSessions.get(key);
		if (!existing) {
			return undefined;
		}

		try {
			const session = await existing;
			if (session.closed) {
				this.directorySftpSessions.delete(key);
				return undefined;
			}

			// Keep the shared SSH client alive while the interactive terminal owns a shell channel.
			this.clearDirectorySftpIdleTimer(key);
			return session;
		} catch {
			this.directorySftpSessions.delete(key);
			return undefined;
		}
	}

	private async createDirectorySftpSession(key: string, config: ConnectConfig): Promise<IRemoteDirectorySftpSession> {
		const client = await this.connect(config);
		let sftp: ISFTPWrapper | undefined;
		try {
			sftp = await this.openSftp(client);
		} catch (error) {
			client.end();
			throw error;
		}

		const session: IRemoteDirectorySftpSession = { key, client, sftp, closed: false };
		const markClosed = (): void => {
			if (session.closed) {
				return;
			}
			session.closed = true;
			this.directorySftpSessions.delete(key);
			this.clearDirectorySftpIdleTimer(key);
		};
		client.on('close', markClosed);
		client.on('error', markClosed);
		return session;
	}

	private touchDirectorySftpSession(key: string): void {
		this.clearDirectorySftpIdleTimer(key);
		const timer = setTimeout(() => this.disposeDirectorySftpSession(key), REMOTE_DIRECTORY_SFTP_IDLE_MS);
		this.directorySftpIdleTimers.set(key, timer);
	}

	private disposeDirectorySftpSession(key: string): void {
		const sessionPromise = this.directorySftpSessions.get(key);
		this.directorySftpSessions.delete(key);
		this.clearDirectorySftpIdleTimer(key);
		if (!sessionPromise) {
			return;
		}
		void sessionPromise.then(session => {
			if (session.closed) {
				return;
			}
			session.closed = true;
			try {
				session.sftp.end();
			} catch {
				// Ignore cleanup errors from already closed SFTP sessions.
			}
			try {
				session.client.end();
			} catch {
				// Ignore cleanup errors from already closed SSH clients.
			}
		}, () => undefined);
	}

	private clearDirectorySftpIdleTimer(key: string): void {
		const timer = this.directorySftpIdleTimers.get(key);
		if (timer) {
			clearTimeout(timer);
			this.directorySftpIdleTimers.delete(key);
		}
	}

	private getDirectorySftpSessionKey(options: ITurboFileSshConnectionOptions): string {
		return JSON.stringify({
			host: options.host,
			port: options.port || 22,
			username: options.username,
			password: options.password ?? '',
			privateKeyPath: options.privateKeyPath ?? '',
			privateKey: options.privateKey ?? '',
			passphrase: options.passphrase ?? ''
		});
	}

	private getRemoteDirectoryListingCacheKey(options: ITurboFileSshConnectionOptions, path: string): string {
		return `${this.getDirectorySftpSessionKey(options)}:${path.replace(/\\/g, '/')}`;
	}

	private getRemoteDirectoryListingCache(cacheKey: string): ITurboFileDirectoryListing | undefined {
		const cached = this.remoteDirectoryListingCache.get(cacheKey);
		if (!cached) {
			return undefined;
		}
		if (Date.now() >= cached.expiresAt) {
			this.remoteDirectoryListingCache.delete(cacheKey);
			return undefined;
		}
		return cached.listing;
	}

	private setRemoteDirectoryListingCache(cacheKey: string, listing: ITurboFileDirectoryListing): void {
		this.remoteDirectoryListingCache.set(cacheKey, {
			expiresAt: Date.now() + REMOTE_DIRECTORY_LISTING_CACHE_TTL_MS,
			listing
		});
		if (this.remoteDirectoryListingCache.size <= REMOTE_DIRECTORY_LISTING_CACHE_MAX_ENTRIES) {
			return;
		}
		const overflow = this.remoteDirectoryListingCache.size - REMOTE_DIRECTORY_LISTING_CACHE_MAX_ENTRIES;
		for (const key of [...this.remoteDirectoryListingCache.keys()].slice(0, overflow)) {
			this.remoteDirectoryListingCache.delete(key);
		}
	}

	private clearRemoteDirectoryListingCache(endpoint: ITurboFileTransferEndpoint, extraPath?: string): void {
		if (endpoint.kind !== 'ssh' || !endpoint.connection) {
			return;
		}
		const paths = new Set<string>();
		const path = extraPath ?? endpoint.path;
		paths.add(path);
		paths.add(getRemoteParentPath(path));
		for (const candidate of paths) {
			this.remoteDirectoryListingCache.delete(this.getRemoteDirectoryListingCacheKey(endpoint.connection, candidate));
		}
	}

	private openSftp(client: ISSHClient): Promise<ISFTPWrapper> {
		return new Promise((resolve, reject) => {
			client.sftp((error, sftp) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(sftp);
			});
		});
	}

	private forwardIn(client: ISSHClient, bindAddr: string, bindPort: number): Promise<number> {
		return new Promise((resolve, reject) => {
			client.forwardIn(bindAddr, bindPort, (error, port) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	}

	private unforwardIn(client: ISSHClient, bindAddr: string, bindPort: number): Promise<void> {
		return new Promise((resolve, reject) => {
			client.unforwardIn(bindAddr, bindPort, error => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}

	private openRemoteFile(sftp: ISFTPWrapper, remotePath: string, flags: string): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			sftp.open(remotePath, flags, (error, handle) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(handle);
			});
		});
	}

	private readRemoteFileChunk(sftp: ISFTPWrapper, handle: Buffer, buffer: Buffer, length: number, position: number): Promise<number> {
		return new Promise((resolve, reject) => {
			sftp.read(handle, buffer, 0, length, position, (error, bytesRead) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(bytesRead);
			});
		});
	}

	private writeRemoteFileChunk(sftp: ISFTPWrapper, handle: Buffer, buffer: Buffer, length: number, position: number): Promise<void> {
		return new Promise((resolve, reject) => {
			sftp.write(handle, buffer, 0, length, position, error => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}

	private closeRemoteFile(sftp: ISFTPWrapper, handle: Buffer): Promise<void> {
		return new Promise(resolve => {
			sftp.close(handle, () => resolve());
		});
	}

	private async relayRemoteFileInParallel(
		sourceSftp: ISFTPWrapper,
		targetSftp: ISFTPWrapper,
		sourcePath: string,
		targetPath: string,
		bytes: number,
		onDelta?: (delta: number) => void,
		progressId?: string
	): Promise<void> {
		if (bytes <= 0) {
			const targetHandle = await this.openRemoteFile(targetSftp, targetPath, 'w');
			await this.closeRemoteFile(targetSftp, targetHandle);
			return;
		}

		const sourceHandle = await this.openRemoteFile(sourceSftp, sourcePath, 'r');
		let targetHandle: Buffer | undefined;
		try {
			targetHandle = await this.openRemoteFile(targetSftp, targetPath, 'w');
			const chunks = Math.ceil(bytes / SFTP_RELAY_CHUNK_SIZE);
			await mapLimit(Array.from({ length: chunks }, (_, index) => index), SFTP_RELAY_CONCURRENCY, async index => {
				this.throwIfTransferCanceled(progressId);
				const position = index * SFTP_RELAY_CHUNK_SIZE;
				const length = Math.min(SFTP_RELAY_CHUNK_SIZE, bytes - position);
				const buffer = Buffer.allocUnsafe(length);
				const bytesRead = await this.readRemoteFileChunk(sourceSftp, sourceHandle, buffer, length, position);
				this.throwIfTransferCanceled(progressId);
				if (bytesRead <= 0) {
					return;
				}
				await this.writeRemoteFileChunk(targetSftp, targetHandle!, buffer, bytesRead, position);
				onDelta?.(bytesRead);
			});
		} finally {
			if (targetHandle) {
				await this.closeRemoteFile(targetSftp, targetHandle).catch(() => undefined);
			}
			await this.closeRemoteFile(sourceSftp, sourceHandle).catch(() => undefined);
		}
	}

	private openShell(client: ISSHClient, cols: number, rows: number): Promise<ISSHShellStream> {
		return new Promise((resolve, reject) => {
			client.shell({
				term: 'xterm-256color',
				cols: Math.max(1, cols || 80),
				rows: Math.max(1, rows || 24),
				width: 0,
				height: 0,
				modes: {
					ECHO: 0
				}
			}, (error, stream) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stream);
			});
		});
	}

	private cleanupSshTerminalSession(sessionId: string, exitCode: number | undefined): void {
		const session = this.terminalSessions.get(sessionId);
		if (!session || session.closed) {
			return;
		}

		session.closed = true;
		this.terminalSessions.delete(sessionId);
		try {
			session.stream.end();
		} catch {
			// Ignore cleanup errors from already closed SSH channels.
		}
		if (session.sharedDirectorySessionKey) {
			this.touchDirectorySftpSession(session.sharedDirectorySessionKey);
		} else {
			try {
				session.client.end();
			} catch {
				// Ignore cleanup errors from already closed SSH clients.
			}
		}
		session.exitEmitter.fire(exitCode);
		session.dataEmitter.dispose();
		session.exitEmitter.dispose();
	}

	private async withSftp<T>(endpoint: ITurboFileTransferEndpoint, task: (sftp: ISFTPWrapper) => Promise<T>, progressId?: string): Promise<T> {
		if (!endpoint.connection) {
			throw new Error('SSH endpoint is missing connection options.');
		}
		this.throwIfTransferCanceled(progressId);

		const configResult = await this.createConnectConfig(endpoint.connection);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		const client = await this.connect(configResult.config);
		const unregisterClientCancel = this.registerTransferCancelHandler(progressId, () => client.end());
		try {
			this.throwIfTransferCanceled(progressId);
			const sftp = await this.openSftp(client);
			const unregisterSftpCancel = this.registerTransferCancelHandler(progressId, () => sftp.end());
			try {
				this.throwIfTransferCanceled(progressId);
				return await task(sftp);
			} finally {
				unregisterSftpCancel();
				sftp.end();
			}
		} finally {
			unregisterClientCancel();
			client.end();
		}
	}

	private async withDirectorySftp<T>(endpoint: ITurboFileTransferEndpoint, task: (sftp: ISFTPWrapper) => Promise<T>): Promise<T> {
		if (!endpoint.connection) {
			throw new Error('SSH endpoint is missing connection options.');
		}

		const configResult = await this.createConnectConfig(endpoint.connection);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		const session = await this.getDirectorySftpSession(endpoint.connection, configResult.config);
		try {
			const result = await task(session.sftp);
			this.touchDirectorySftpSession(session.key);
			return result;
		} catch (error) {
			this.disposeDirectorySftpSession(session.key);
			throw error;
		}
	}

	private async withDirectorySshClient<T>(endpoint: ITurboFileTransferEndpoint, task: (client: ISSHClient) => Promise<T>): Promise<T> {
		if (!endpoint.connection) {
			throw new Error('SSH endpoint is missing connection options.');
		}

		const configResult = await this.createConnectConfig(endpoint.connection);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		const session = await this.getDirectorySftpSession(endpoint.connection, configResult.config);
		try {
			const result = await task(session.client);
			this.touchDirectorySftpSession(session.key);
			return result;
		} catch (error) {
			this.disposeDirectorySftpSession(session.key);
			throw error;
		}
	}

	private async withSshClient<T>(endpoint: ITurboFileTransferEndpoint, task: (client: ISSHClient) => Promise<T>): Promise<T> {
		if (!endpoint.connection) {
			throw new Error('SSH endpoint is missing connection options.');
		}

		const configResult = await this.createConnectConfig(endpoint.connection);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		const client = await this.connect(configResult.config);
		try {
			return await task(client);
		} finally {
			client.end();
		}
	}

	private async copyLocalPath(sourcePath: string, targetPath: string, onDelta?: (delta: number) => void, progressId?: string): Promise<void> {
		this.throwIfTransferCanceled(progressId);
		const stat = await fsp.stat(sourcePath);
		if (stat.isDirectory()) {
			if (platform() === 'win32' || looksLikeWindowsPath(sourcePath) || looksLikeWindowsPath(targetPath)) {
				await this.copyLocalDirectoryNativeWithProgress(sourcePath, targetPath, onDelta, progressId);
				return;
			}
			await ensureLocalDirectory(targetPath);
			const children = await fsp.readdir(sourcePath, { withFileTypes: true });
			await mapLimit(children, LOCAL_COPY_DIRECTORY_CONCURRENCY, async child => {
				this.throwIfTransferCanceled(progressId);
				await this.copyLocalPath(join(sourcePath, child.name), join(targetPath, child.name), onDelta, progressId);
			});
			return;
		}

		await ensureLocalParentDirectory(targetPath);
		await this.copyLocalFileWithProgress(sourcePath, targetPath, onDelta, progressId);
	}

	private async copyLocalDirectoryNativeWithProgress(sourcePath: string, targetPath: string, onDelta?: (delta: number) => void, progressId?: string): Promise<void> {
		await ensureLocalDirectory(targetPath);
		let previousBytes = await getLocalPathSize(targetPath).catch(() => 0);
		let completed = false;
		const copy = runLocalRobocopyCommand([
			sourcePath,
			targetPath,
			'/E',
			'/MT:32',
			'/R:0',
			'/W:0',
			'/NFL',
			'/NDL',
			'/NJH',
			'/NJS',
			'/NP',
			'/NC',
			'/NS'
		]).finally(() => {
			completed = true;
		});

		try {
			while (!completed) {
				await delay(500);
				this.throwIfTransferCanceled(progressId);
				const currentBytes = await getLocalPathSize(targetPath).catch(() => previousBytes);
				if (currentBytes > previousBytes) {
					onDelta?.(currentBytes - previousBytes);
					previousBytes = currentBytes;
				}
			}
		} finally {
			await copy;
		}

		const finalBytes = await getLocalPathSize(targetPath).catch(() => previousBytes);
		if (finalBytes > previousBytes) {
			onDelta?.(finalBytes - previousBytes);
		}
		this.throwIfTransferCanceled(progressId);
	}

	private async moveLocalPathNative(sourcePath: string, targetPath: string): Promise<void> {
		if (platform() === 'win32' || looksLikeWindowsPath(sourcePath) || looksLikeWindowsPath(targetPath)) {
			await ensureLocalParentDirectory(targetPath);
			await runLocalPowerShellScript(buildLocalWindowsMoveScript(sourcePath, targetPath));
			return;
		}
		await ensureLocalParentDirectory(targetPath);
		await runLocalCommand('mv', ['-f', sourcePath, targetPath]);
	}

	private async moveRemotePathNative(endpoint: ITurboFileTransferEndpoint, targetPath: string): Promise<void> {
		const command = looksLikeWindowsPath(endpoint.path) || looksLikeWindowsPath(targetPath)
			? buildWindowsMoveCommand(endpoint.path, targetPath)
			: `mkdir -p ${quotePosixShellArg(getRemoteParentPath(targetPath))} && mv -f ${quotePosixShellArg(endpoint.path)} ${quotePosixShellArg(targetPath)}`;
		await this.withSshClient(endpoint, client => this.execRemote(client, command));
	}

	private async execRemoteCopyWithProgress(request: ITurboFileTransferRequest, command: string, bytes: number, sourceType: TurboFileFileType): Promise<void> {
		let completed = false;
		const copy = this.withDirectorySshClient(request.source, client => this.execRemote(client, command))
			.finally(() => {
				completed = true;
			});

		if (bytes <= 0) {
			await copy;
			return;
		}

		const startedAt = Date.now();
		const estimateDirectoryProgress = sourceType === 'directory';
		let lastCopiedBytes = 0;
		try {
			while (!completed) {
				await delay(500);
				if (completed) {
					break;
				}
				this.throwIfTransferCanceled(request.progressId);
				if (estimateDirectoryProgress) {
					const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
					const estimatedBytes = Math.min(bytes * 0.95, elapsedSeconds * REMOTE_NATIVE_DIRECTORY_COPY_PROGRESS_BYTES_PER_SECOND);
					const copiedBytes = Math.max(0, Math.floor(estimatedBytes));
					if (copiedBytes > lastCopiedBytes) {
						lastCopiedBytes = copiedBytes;
						this.fireTransferProgress(request, copiedBytes, bytes, 'transfer', 'Remote copy in progress.');
					}
					continue;
				}
				const copiedBytes = await this.getRemotePathSizeByCommand(request.target).catch(() => 0);
				if (copiedBytes > 0 && copiedBytes !== lastCopiedBytes) {
					lastCopiedBytes = copiedBytes;
					this.fireTransferProgress(request, Math.min(copiedBytes, bytes), bytes, 'transfer', 'Remote copy in progress.');
				}
			}
		} finally {
			await copy;
		}
	}

	private async copyLocalFileWithProgress(sourcePath: string, targetPath: string, onDelta?: (delta: number) => void, progressId?: string): Promise<void> {
		const source = createReadStream(sourcePath, { highWaterMark: LOCAL_COPY_FILE_HIGH_WATER_MARK });
		const target = createWriteStream(targetPath, { highWaterMark: LOCAL_COPY_FILE_HIGH_WATER_MARK });
		const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
			const error = new TurboFileTransferCanceledError();
			source.destroy(error);
			target.destroy(error);
		});
		source.on('data', chunk => {
			try {
				this.throwIfTransferCanceled(progressId);
			} catch (error) {
				source.destroy(error instanceof Error ? error : new TurboFileTransferCanceledError());
				target.destroy(error instanceof Error ? error : new TurboFileTransferCanceledError());
				return;
			}
			if (typeof chunk === 'string') {
				onDelta?.(Buffer.byteLength(chunk));
			} else {
				onDelta?.(chunk.byteLength);
			}
		});
		try {
			this.throwIfTransferCanceled(progressId);
			await pipeline(source, target);
			this.throwIfTransferCanceled(progressId);
		} finally {
			unregisterCancel();
		}
	}

	private createSftpTransferOptions(onDelta?: (delta: number) => void, progressId?: string, bytes = 0, adaptive = true): ISFTPTransferOptions {
		const useLargeOptions = adaptive && bytes >= SFTP_LARGE_FILE_THRESHOLD;
		const options: { step?: (totalTransferred: number, chunk: number, total: number) => void; concurrency: number; chunkSize: number } = {
			concurrency: adaptive ? (useLargeOptions ? SFTP_LARGE_TRANSFER_CONCURRENCY : SFTP_TRANSFER_CONCURRENCY) : SFTP_COMPAT_TRANSFER_CONCURRENCY,
			chunkSize: adaptive ? (useLargeOptions ? SFTP_LARGE_TRANSFER_CHUNK_SIZE : SFTP_TRANSFER_CHUNK_SIZE) : SFTP_COMPAT_TRANSFER_CHUNK_SIZE
		};
		if (!onDelta) {
			return options;
		}
		let lastTransferred = 0;
		options.step = (totalTransferred: number, chunk: number) => {
			this.throwIfTransferCanceled(progressId);
			const nextTransferred = Number.isFinite(totalTransferred) ? totalTransferred : lastTransferred + Math.max(0, chunk || 0);
			const delta = Math.max(0, nextTransferred - lastTransferred);
			lastTransferred = nextTransferred;
			if (delta > 0) {
				onDelta(delta);
			}
		};
		return options;
	}

	private createTransferResult(ok: true, strategy: ITurboFileTransferResult['strategy'], bytes: number, message: string, startedAt: number, progressId?: string): ITurboFileTransferResult {
		const durationMs = this.getTransferDurationMs(progressId, startedAt);
		return {
			ok,
			strategy,
			bytes,
			message,
			durationMs,
			averageBytesPerSecond: Math.round(bytes / (durationMs / 1000))
		};
	}

	private markTransferDataStarted(progressId: string | undefined): void {
		if (!progressId || this.transferDataStartTimes.has(progressId)) {
			return;
		}
		this.transferDataStartTimes.set(progressId, Date.now());
	}

	private getTransferDurationMs(progressId: string | undefined, fallbackStartedAt: number): number {
		const startedAt = progressId ? this.transferDataStartTimes.get(progressId) ?? fallbackStartedAt : fallbackStartedAt;
		return Math.max(1, Date.now() - startedAt);
	}

	private isTransferCanceled(progressId: string | undefined): boolean {
		return !!progressId && this.transferCancellationRequests.has(progressId);
	}

	private throwIfTransferCanceled(progressId: string | undefined): void {
		if (this.isTransferCanceled(progressId)) {
			throw new TurboFileTransferCanceledError();
		}
	}

	private registerTransferCancelHandler(progressId: string | undefined, handler: () => void): () => void {
		if (!progressId) {
			return () => undefined;
		}

		let handlers = this.transferCancelHandlers.get(progressId);
		if (!handlers) {
			handlers = new Set();
			this.transferCancelHandlers.set(progressId, handlers);
		}
		handlers.add(handler);
		return () => {
			const currentHandlers = this.transferCancelHandlers.get(progressId);
			if (!currentHandlers) {
				return;
			}
			currentHandlers.delete(handler);
			if (!currentHandlers.size) {
				this.transferCancelHandlers.delete(progressId);
			}
		};
	}

	private fireTransferProgress(request: { readonly progressId?: string }, transferredBytes: number, totalBytes: number, phase: ITurboFileTransferProgressEvent['phase'], detail: string, force = false, extra: Partial<Omit<ITurboFileTransferProgressEvent, 'progressId' | 'transferredBytes' | 'totalBytes' | 'phase' | 'detail'>> = {}): void {
		const progressId = request.progressId;
		if (!progressId) {
			return;
		}

		const now = Date.now();
		const previous = this.transferProgressSnapshots.get(progressId);
		const normalizedTransferred = Math.max(0, transferredBytes);
		const normalizedTotal = Math.max(0, totalBytes);
		if (!force && previous && now - previous.lastAt < TRANSFER_PROGRESS_EVENT_INTERVAL_MS && normalizedTransferred < normalizedTotal) {
			return;
		}

		this.transferProgressSnapshots.set(progressId, { lastAt: now, lastBytes: normalizedTransferred });
		if (phase !== 'prepare' && phase !== 'complete' && normalizedTransferred > 0) {
			this.markTransferDataStarted(progressId);
		}
		this.getTransferProgressEmitter(progressId).fire({
			progressId,
			transferredBytes: normalizedTransferred,
			totalBytes: normalizedTotal,
			phase,
			detail,
			...extra
		});
	}

	private getTransferProgressEmitter(progressId: string): Emitter<ITurboFileTransferProgressEvent> {
		let emitter = this.transferProgressEmitters.get(progressId);
		if (!emitter) {
			emitter = new Emitter<ITurboFileTransferProgressEvent>();
			this.transferProgressEmitters.set(progressId, emitter);
		}
		return emitter;
	}

	private scheduleTransferProgressCleanup(progressId: string | undefined): void {
		if (!progressId) {
			return;
		}

		setTimeout(() => {
			this.transferProgressSnapshots.delete(progressId);
			this.transferDataStartTimes.delete(progressId);
			const emitter = this.transferProgressEmitters.get(progressId);
			if (emitter) {
				this.transferProgressEmitters.delete(progressId);
				emitter.dispose();
			}
		}, 30000);
	}

	private async readLocalFileBuffer(path: string, maxBytes: number): Promise<Buffer> {
		const stat = await fsp.stat(path);
		if (stat.isDirectory()) {
			throw new Error('Cannot preview a directory.');
		}
		if (stat.size > maxBytes) {
			throw new Error(`File is too large to preview (${formatBytes(stat.size)}).`);
		}
		return fsp.readFile(path);
	}

	private async readRemoteFileBuffer(endpoint: ITurboFileTransferEndpoint, maxBytes: number): Promise<Buffer> {
		let tempRoot: string | undefined;
		try {
			return await this.withDirectorySftp(endpoint, async sftp => {
				const stat = await this.remoteStat(sftp, endpoint.path);
				if (stat.isDirectory()) {
					throw new Error('Cannot preview a directory.');
				}
				if (stat.size > maxBytes) {
					throw new Error(`File is too large to preview (${formatBytes(stat.size)}).`);
				}
				if (stat.size <= REMOTE_DIRECT_READ_MAX_BYTES) {
					return this.readRemoteFileBufferDirect(sftp, endpoint.path, stat.size);
				}

				tempRoot = join(tmpdir(), `turbofile-read-${randomUUID()}`);
				const tempPath = join(tempRoot, basename(endpoint.path) || 'content');
				await fsp.mkdir(tempRoot, { recursive: true });
				await this.fastGet(sftp, endpoint.path, tempPath);
				return await fsp.readFile(tempPath);
			});
		} finally {
			if (tempRoot) {
				await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
			}
		}
	}

	private async readRemoteFileBufferDirect(sftp: ISFTPWrapper, remotePath: string, size: number): Promise<Buffer> {
		if (size <= 0) {
			return Buffer.alloc(0);
		}

		const handle = await this.openRemoteFile(sftp, remotePath, 'r');
		try {
			const buffer = Buffer.alloc(size);
			let position = 0;
			while (position < size) {
				const length = Math.min(REMOTE_DIRECT_READ_CHUNK_BYTES, size - position);
				const bytesRead = await this.readRemoteFileChunk(sftp, handle, buffer.subarray(position, position + length), length, position);
				if (bytesRead <= 0) {
					break;
				}
				position += bytesRead;
			}
			return position === size ? buffer : buffer.subarray(0, position);
		} finally {
			await this.closeRemoteFile(sftp, handle);
		}
	}

	private async readImageBuffer(endpoint: ITurboFileTransferEndpoint, options: ITurboFileReadImageOptions): Promise<IImageBufferResult> {
		const targetWidth = clampPositiveInt(options.width);
		const targetHeight = clampPositiveInt(options.height);
		const quality = clampQuality(options.quality);
		const format = options.format === 'png' ? 'png' : options.format === 'webp' ? 'webp' : 'jpeg';
		const interpolation = options.interpolation === 'lanczos' ? 'lanczos' : 'area';
		const forceOriginal = Boolean(options.forceOriginal || (!targetWidth && !targetHeight));
		const sourceMaxBytes = Math.max(options.maxBytes ?? DEFAULT_READ_LIMIT, DEFAULT_IMAGE_SOURCE_LIMIT);

		if (forceOriginal) {
			return this.readOriginalImageBuffer(endpoint, sourceMaxBytes);
		}

		const sourceFingerprint = this.getImageSourceFingerprintFromOptions(options)
			?? await this.getImageSourceFingerprint(endpoint).catch(() => undefined);
		const thumbnailCacheKey = sourceFingerprint
			? this.getImageThumbnailCacheKey(endpoint, sourceFingerprint, targetWidth, targetHeight, quality, format, interpolation)
			: undefined;
		if (thumbnailCacheKey) {
			const cached = await this.readCachedImageThumbnail(thumbnailCacheKey);
			if (cached) {
				return cached;
			}
		}

		const result = await this.readScaledImageBuffer(endpoint, sourceMaxBytes, targetWidth, targetHeight, quality, format, interpolation, sourceFingerprint);
		if (thumbnailCacheKey) {
			void this.writeCachedImageThumbnail(thumbnailCacheKey, result);
		}
		return result;
	}

	private async readOriginalImageBuffer(endpoint: ITurboFileTransferEndpoint, sourceMaxBytes: number): Promise<IImageBufferResult> {
		const buffer = endpoint.kind === 'local'
			? await this.readLocalFileBuffer(endpoint.path, sourceMaxBytes)
			: await this.readRemoteFileBuffer(endpoint, sourceMaxBytes);
		if (getMimeType(endpoint.path) === 'image/bmp') {
			const bmp = tryCreateBmpPngVariant(buffer, 0, 0);
			if (bmp) {
				return bmp;
			}
		}
		const size = getImageSize(buffer);
		return {
			buffer,
			mime: getMimeType(endpoint.path),
			width: size?.width,
			height: size?.height
		};
	}

	private async readScaledImageBuffer(endpoint: ITurboFileTransferEndpoint, sourceMaxBytes: number, targetWidth: number, targetHeight: number, quality: number, format: 'jpeg' | 'png' | 'webp', interpolation: 'area' | 'lanczos', sourceFingerprint: IImageSourceFingerprint | undefined): Promise<IImageBufferResult> {
		const shouldTryRemoteTransform = endpoint.kind === 'ssh'
			&& !looksLikeWindowsPath(endpoint.path)
			&& (!sourceFingerprint || sourceFingerprint.size > REMOTE_DIRECT_READ_MAX_BYTES);
		if (shouldTryRemoteTransform) {
			const thumbnail = await this.tryReadRemoteThumbnailViaImageMagick(endpoint, targetWidth, targetHeight, quality, format, interpolation);
			if (thumbnail) {
				return thumbnail;
			}
		}

		const sourceBuffer = endpoint.kind === 'local'
			? await this.readLocalFileBuffer(endpoint.path, sourceMaxBytes)
			: await this.readRemoteFileBuffer(endpoint, sourceMaxBytes);
		const sourceSize = getImageSize(sourceBuffer);
		const sourceMime = getMimeType(endpoint.path);
		if (sourceMime === 'image/bmp') {
			const bmp = tryCreateBmpPngVariant(sourceBuffer, targetWidth, targetHeight);
			if (bmp) {
				return bmp;
			}
		}
		if (sourceMime === 'image/bmp' && sourceBuffer.byteLength <= RAW_BMP_FAST_PATH_BYTES && shouldKeepOriginalImageSize(sourceSize, targetWidth, targetHeight)) {
			return {
				buffer: sourceBuffer,
				mime: sourceMime,
				width: sourceSize?.width,
				height: sourceSize?.height
			};
		}
		if (sourceSize && sourceSize.width > 0 && sourceSize.height > 0 && sourceSize.width < SMALL_IMAGE_DIM_LIMIT && sourceSize.height < SMALL_IMAGE_DIM_LIMIT) {
			return {
				buffer: sourceBuffer,
				mime: sourceMime,
				width: sourceSize.width,
				height: sourceSize.height
			};
		}
		try {
			return this.transformImageBuffer(sourceBuffer, endpoint.path, targetWidth, targetHeight, quality, format);
		} catch (error) {
			if (sourceMime.startsWith('image/')) {
				return {
					buffer: sourceBuffer,
					mime: sourceMime,
					width: sourceSize?.width,
					height: sourceSize?.height
				};
			}
			throw error;
		}
	}

	private getImageSourceFingerprintFromOptions(options: ITurboFileReadImageOptions): IImageSourceFingerprint | undefined {
		const size = Number(options.sourceSize);
		const modified = Number(options.sourceModified);
		if (!Number.isFinite(size) || size < 0 || !Number.isFinite(modified) || modified <= 0) {
			return undefined;
		}
		return { size, modified };
	}

	private async getImageSourceFingerprint(endpoint: ITurboFileTransferEndpoint): Promise<IImageSourceFingerprint | undefined> {
		if (endpoint.kind === 'local') {
			const stat = await fsp.stat(endpoint.path);
			if (!stat.isFile()) {
				return undefined;
			}
			return {
				size: stat.size,
				modified: Math.round(stat.mtimeMs)
			};
		}

		return this.withDirectorySftp(endpoint, async sftp => {
			const stat = await this.remoteStat(sftp, endpoint.path);
			if (!stat.isFile()) {
				return undefined;
			}
			return {
				size: stat.size,
				modified: stat.mtime * 1000
			};
		});
	}

	private getImageThumbnailCacheKey(endpoint: ITurboFileTransferEndpoint, sourceFingerprint: IImageSourceFingerprint, width: number, height: number, quality: number, format: 'jpeg' | 'png' | 'webp', interpolation: 'area' | 'lanczos'): string {
		const endpointKey = endpoint.kind === 'local'
			? { kind: endpoint.kind, path: endpoint.path }
			: {
				kind: endpoint.kind,
				host: endpoint.connection?.host ?? '',
				port: endpoint.connection?.port || 22,
				username: endpoint.connection?.username ?? '',
				path: endpoint.path
			};
		return createHash('sha256').update(JSON.stringify({
			version: IMAGE_THUMBNAIL_CACHE_VERSION,
			endpoint: endpointKey,
			source: sourceFingerprint,
			width,
			height,
			quality,
			format,
			interpolation
		})).digest('hex');
	}

	private async readCachedImageThumbnail(cacheKey: string): Promise<IImageBufferResult | undefined> {
		const paths = this.getImageThumbnailCachePaths(cacheKey);
		try {
			const [metadataContent, buffer] = await Promise.all([
				fsp.readFile(paths.metadataPath, 'utf8'),
				fsp.readFile(paths.dataPath)
			]);
			const metadata = JSON.parse(metadataContent) as Partial<IImageThumbnailCacheMetadata>;
			if (metadata.version !== IMAGE_THUMBNAIL_CACHE_VERSION || metadata.size !== buffer.byteLength || typeof metadata.mime !== 'string') {
				return undefined;
			}
			const now = new Date();
			void fsp.utimes(paths.dataPath, now, now).catch(() => undefined);
			return {
				buffer,
				mime: metadata.mime,
				width: typeof metadata.width === 'number' ? metadata.width : undefined,
				height: typeof metadata.height === 'number' ? metadata.height : undefined
			};
		} catch {
			return undefined;
		}
	}

	private async writeCachedImageThumbnail(cacheKey: string, result: IImageBufferResult): Promise<void> {
		if (!result.buffer.byteLength || result.buffer.byteLength > IMAGE_THUMBNAIL_CACHE_MAX_ENTRY_BYTES) {
			return;
		}

		const paths = this.getImageThumbnailCachePaths(cacheKey);
		const metadata: IImageThumbnailCacheMetadata = {
			version: IMAGE_THUMBNAIL_CACHE_VERSION,
			mime: result.mime,
			size: result.buffer.byteLength,
			width: result.width,
			height: result.height,
			createdAt: Date.now()
		};
		try {
			await fsp.mkdir(dirname(paths.dataPath), { recursive: true });
			await Promise.all([
				fsp.writeFile(paths.dataPath, result.buffer),
				fsp.writeFile(paths.metadataPath, JSON.stringify(metadata))
			]);
			this.scheduleTrimImageThumbnailCache();
		} catch {
			// Thumbnail cache is purely an acceleration layer; failed writes must never block image loading.
		}
	}

	private getImageThumbnailCachePaths(cacheKey: string): { readonly dataPath: string; readonly metadataPath: string } {
		const bucket = cacheKey.slice(0, 2) || '00';
		const root = this.getImageThumbnailCacheRoot();
		return {
			dataPath: join(root, bucket, `${cacheKey}.bin`),
			metadataPath: join(root, bucket, `${cacheKey}.json`)
		};
	}

	private getImageThumbnailCacheRoot(): string {
		try {
			return join(app.getPath('userData'), 'turbofile-image-cache', `v${IMAGE_THUMBNAIL_CACHE_VERSION}`);
		} catch {
			return join(tmpdir(), 'turbofile-image-cache', `v${IMAGE_THUMBNAIL_CACHE_VERSION}`);
		}
	}

	private scheduleTrimImageThumbnailCache(): void {
		if (this.imageThumbnailCacheTrimPromise) {
			return;
		}
		this.imageThumbnailCacheTrimPromise = this.trimImageThumbnailCache()
			.finally(() => {
				this.imageThumbnailCacheTrimPromise = undefined;
			});
	}

	private async trimImageThumbnailCache(): Promise<void> {
		const root = this.getImageThumbnailCacheRoot();
		const entries: Array<{ readonly dataPath: string; readonly metadataPath: string; readonly size: number; readonly mtimeMs: number }> = [];
		const visit = async (directory: string): Promise<void> => {
			let children: Array<{ readonly name: string; isDirectory(): boolean; isFile(): boolean }>;
			try {
				children = await fsp.readdir(directory, { withFileTypes: true });
			} catch {
				return;
			}
			for (const child of children) {
				const childPath = join(directory, child.name);
				if (child.isDirectory()) {
					await visit(childPath);
					continue;
				}
				if (!child.isFile() || !child.name.endsWith('.bin')) {
					continue;
				}
				const stat = await fsp.stat(childPath).catch(() => undefined);
				if (!stat) {
					continue;
				}
				entries.push({
					dataPath: childPath,
					metadataPath: join(directory, `${child.name.slice(0, -4)}.json`),
					size: stat.size,
					mtimeMs: stat.mtimeMs
				});
			}
		};

		await visit(root);
		let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
		if (totalBytes <= IMAGE_THUMBNAIL_CACHE_MAX_BYTES) {
			return;
		}

		entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
		for (const entry of entries) {
			if (totalBytes <= IMAGE_THUMBNAIL_CACHE_MAX_BYTES) {
				break;
			}
			await Promise.all([
				fsp.rm(entry.dataPath, { force: true }).catch(() => undefined),
				fsp.rm(entry.metadataPath, { force: true }).catch(() => undefined)
			]);
			totalBytes -= entry.size;
		}
	}

	private async tryReadRemoteThumbnailViaImageMagick(endpoint: ITurboFileTransferEndpoint, width: number, height: number, quality: number, format: 'jpeg' | 'png' | 'webp', interpolation: 'area' | 'lanczos'): Promise<IImageBufferResult | undefined> {
		if (!endpoint.connection || (!width && !height)) {
			return undefined;
		}

		const tool = await this.getRemoteImageTool(endpoint);
		if (!tool) {
			return undefined;
		}

		const geometry = buildImageGeometry(width, height);
		if (!geometry) {
			return undefined;
		}

		const source = quotePosixShellArg(endpoint.path);
		const thumbnail = ` -thumbnail ${quotePosixShellArg(geometry)}`;
		const filter = interpolation === 'lanczos' ? ' -filter Lanczos' : '';
		const qualityOption = format === 'png' ? '' : ` -quality ${quality}`;
		const outputFormat = format === 'webp' ? 'webp:-' : format === 'png' ? 'png:-' : 'jpg:-';
		const mime = format === 'webp' ? 'image/webp' : format === 'png' ? 'image/png' : 'image/jpeg';
		const command = `${tool} ${source}${thumbnail}${filter} -strip${qualityOption} ${outputFormat}`;

		try {
			const buffer = await this.withDirectorySshClient(endpoint, client => this.execRemoteBytes(client, command, { timeoutMs: REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS }));
			assertImageBuffer(buffer, mime);
			const size = getImageSize(buffer);
			return {
				buffer,
				mime,
				width: size?.width,
				height: size?.height
			};
		} catch (error) {
			if (format === 'webp') {
				try {
					const jpegCommand = `${tool} ${source}${thumbnail}${filter} -strip${qualityOption} jpg:-`;
					const buffer = await this.withDirectorySshClient(endpoint, client => this.execRemoteBytes(client, jpegCommand, { timeoutMs: REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS }));
					assertImageBuffer(buffer, 'image/jpeg');
					const size = getImageSize(buffer);
					return {
						buffer,
						mime: 'image/jpeg',
						width: size?.width,
						height: size?.height
					};
				} catch {
					// Fall through to clearing the tool cache below.
				}
			}
			const cacheKey = this.getRemoteImageToolCacheKey(endpoint.connection);
			this.remoteImageToolCache.set(cacheKey, { checkedAt: Date.now(), tool: undefined });
			return undefined;
		}
	}

	private async getRemoteImageTool(endpoint: ITurboFileTransferEndpoint): Promise<'magick' | 'convert' | undefined> {
		if (!endpoint.connection) {
			return undefined;
		}

		const cacheKey = this.getRemoteImageToolCacheKey(endpoint.connection);
		const cached = this.remoteImageToolCache.get(cacheKey);
		const now = Date.now();
		if (cached && (now - cached.checkedAt) < REMOTE_IMAGE_TOOL_CACHE_TTL_MS) {
			return cached.tool;
		}
		const pending = this.remoteImageToolPending.get(cacheKey);
		if (pending) {
			return pending;
		}

		const probe = this.resolveRemoteImageTool(endpoint, cacheKey, now);
		this.remoteImageToolPending.set(cacheKey, probe);
		try {
			return await probe;
		} finally {
			if (this.remoteImageToolPending.get(cacheKey) === probe) {
				this.remoteImageToolPending.delete(cacheKey);
			}
		}
	}

	private async resolveRemoteImageTool(endpoint: ITurboFileTransferEndpoint, cacheKey: string, checkedAt: number): Promise<'magick' | 'convert' | undefined> {
		let output = '';
		try {
			await this.withDirectorySshClient(endpoint, client => this.execRemote(client, `command -v magick >/dev/null 2>&1 && printf magick || (command -v convert >/dev/null 2>&1 && printf convert)`, {
				onStdout: chunk => {
					output += chunk;
				}
			}));
			const normalized = output.trim() === 'convert' ? 'convert' : output.trim() === 'magick' ? 'magick' : undefined;
			this.remoteImageToolCache.set(cacheKey, { checkedAt, tool: normalized });
			return normalized;
		} catch {
			this.remoteImageToolCache.set(cacheKey, { checkedAt, tool: undefined });
			return undefined;
		}
	}

	private getRemoteImageToolCacheKey(options: ITurboFileSshConnectionOptions): string {
		return JSON.stringify({
			host: options.host,
			port: options.port || 22,
			username: options.username
		});
	}

	private transformImageBuffer(buffer: Buffer, path: string, targetWidth: number, targetHeight: number, quality: number, format: 'jpeg' | 'png' | 'webp'): IImageBufferResult {
		const image = nativeImage.createFromBuffer(buffer);
		if (image.isEmpty()) {
			throw new Error('Unsupported image format.');
		}

		const sourceSize = image.getSize();
		if (!sourceSize.width || !sourceSize.height) {
			throw new Error('Unable to read image dimensions.');
		}

		const resized = this.resizeNativeImage(image, sourceSize, targetWidth, targetHeight);
		const outputFormat = format === 'png' ? 'png' : 'jpeg';
		const output = outputFormat === 'png'
			? resized.toPNG()
			: resized.toJPEG(quality);
		const outputSize = resized.getSize();
		return {
			buffer: output,
			mime: outputFormat === 'png' ? 'image/png' : 'image/jpeg',
			width: outputSize.width,
			height: outputSize.height
		};
	}

	private resizeNativeImage(image: Electron.NativeImage, sourceSize: Electron.Size, targetWidth: number, targetHeight: number): Electron.NativeImage {
		let width = targetWidth;
		let height = targetHeight;
		if (!width && !height) {
			return image;
		}
		if (!width) {
			width = Math.max(1, Math.round(sourceSize.width * (height / sourceSize.height)));
		}
		if (!height) {
			height = Math.max(1, Math.round(sourceSize.height * (width / sourceSize.width)));
		}

		const ratio = Math.min(width / sourceSize.width, height / sourceSize.height, 1);
		if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
			return image;
		}

		return image.resize({
			width: Math.max(1, Math.round(sourceSize.width * ratio)),
			height: Math.max(1, Math.round(sourceSize.height * ratio)),
			quality: 'best'
		});
	}

	private execRemote(client: ISSHClient, command: string, options: IRemoteExecOptions = {}): Promise<void> {
		return new Promise((resolve, reject) => {
			client.exec(command, (error, stream) => {
				if (error) {
					reject(error);
					return;
				}

				let stderr = '';
				stream.on('data', data => {
					// Drain stdout so remote commands can finish reliably.
					options.onStdout?.(data.toString());
				});
				stream.stderr.on('data', data => {
					const chunk = data.toString();
					stderr += chunk;
					options.onStderr?.(chunk);
				});
				stream.on('close', code => {
					if (code === 0) {
						resolve();
						return;
					}
					reject(new Error(stderr.trim() || `Remote command failed with exit code ${code ?? 'unknown'}.`));
				});
			});
		});
	}

	private execRemoteBytes(client: ISSHClient, command: string, options: IRemoteExecOptions = {}): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			let settled = false;
			let timeout: ReturnType<typeof setTimeout> | undefined;
			const finish = (callback: () => void) => {
				if (settled) {
					return;
				}
				settled = true;
				if (timeout) {
					clearTimeout(timeout);
					timeout = undefined;
				}
				callback();
			};
			client.exec(command, (error, stream) => {
				if (error) {
					finish(() => reject(error));
					return;
				}

				const chunks: Buffer[] = [];
				let stderr = '';
				if (options.timeoutMs && options.timeoutMs > 0) {
					timeout = setTimeout(() => {
						try {
							stream.close?.();
						} catch {
							// Best-effort: older ssh2 channel typings may not expose close.
						}
						try {
							stream.destroy?.();
						} catch {
							// Best-effort cleanup only.
						}
						finish(() => reject(new Error(`Remote command timed out after ${options.timeoutMs} ms.`)));
					}, options.timeoutMs);
				}
				stream.on('data', data => {
					chunks.push(typeof data === 'string' ? Buffer.from(data) : data);
				});
				stream.stderr.on('data', data => {
					stderr += data.toString();
				});
				stream.on('close', code => {
					if (code === 0) {
						finish(() => resolve(Buffer.concat(chunks)));
						return;
					}
					finish(() => reject(new Error(stderr.trim() || `Remote command failed with exit code ${code ?? 'unknown'}.`)));
				});
			});
		});
	}

	private parseRsyncProgressBytes(chunk: string): number | undefined {
		let parsed: number | undefined;
		const progressPattern = /(?:^|[\r\n])\s*([0-9][0-9,]*)\s+[0-9]{1,3}%/g;
		let match: RegExpExecArray | null;
		while ((match = progressPattern.exec(chunk)) !== null) {
			const bytes = Number(match[1].replace(/,/g, ''));
			if (Number.isFinite(bytes)) {
				parsed = bytes;
			}
		}
		return parsed;
	}

	private async readRemoteDirectoryWithFallback(sftp: ISFTPWrapper, client: ISSHClient, options: ITurboFileSshConnectionOptions, remotePath: string): Promise<IRemoteDirectoryReadResult> {
		try {
			return { path: remotePath, entries: await this.readRemoteDirectoryFast(client, sftp, remotePath) };
		} catch (firstError) {
			for (const fallbackPath of getRemoteDirectoryFallbackPaths(options, remotePath)) {
				try {
					return { path: fallbackPath, entries: await this.readRemoteDirectoryFast(client, sftp, fallbackPath) };
				} catch {
					// Try the next SFTP-visible spelling for devices with chrooted home paths.
				}
			}
			throw firstError;
		}
	}

	private async readRemoteDirectoryFast(client: ISSHClient, sftp: ISFTPWrapper, remotePath: string): Promise<ISFTPFileEntry[]> {
		try {
			return this.parseFastRemoteDirectoryEntries(await this.execRemoteBytes(client, buildPosixFastDirectoryListCommand(remotePath), { timeoutMs: 8000 }));
		} catch {
			return this.readRemoteDirectory(sftp, remotePath);
		}
	}

	private parseFastRemoteDirectoryEntries(output: Buffer): ISFTPFileEntry[] {
		const text = output.toString('utf8');
		if (!text) {
			return [];
		}

		const parts = text.split('\0');
		const entries: ISFTPFileEntry[] = [];
		for (let index = 0; index + 3 < parts.length; index += 4) {
			const filename = parts[index];
			if (!filename || filename === '.' || filename === '..') {
				continue;
			}
			const kind = parts[index + 1];
			const size = Number(parts[index + 2]);
			const modifiedSeconds = Number(parts[index + 3]);
			const type: TurboFileFileType = kind === 'd' ? 'directory' : kind === 'f' ? 'file' : kind === 'l' ? 'symlink' : 'unknown';
			entries.push({
				filename,
				longname: type === 'directory' ? 'd' : type === 'symlink' ? 'l' : '-',
				attrs: createFastDirectoryEntryStats(type, Number.isFinite(size) ? size : 0, Number.isFinite(modifiedSeconds) ? Math.floor(modifiedSeconds) : 0)
			});
		}
		return entries;
	}

	private readRemoteDirectory(sftp: ISFTPWrapper, remotePath: string): Promise<ISFTPFileEntry[]> {
		return new Promise((resolve, reject) => {
			sftp.readdir(remotePath, (error, list) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(list);
			});
		});
	}

	private async getRemotePathSize(sftp: ISFTPWrapper, remotePath: string): Promise<number> {
		const stats = await this.remoteStat(sftp, remotePath);
		if (!stats.isDirectory()) {
			return stats.size;
		}

		let total = 0;
		const entries = await this.readRemoteDirectory(sftp, remotePath);
		for (const entry of entries) {
			if (entry.filename === '.' || entry.filename === '..') {
				continue;
			}
			if (entry.attrs.isDirectory() || entry.attrs.isFile()) {
				total += await this.getRemotePathSize(sftp, joinRemotePath(remotePath, entry.filename));
			}
		}
		return total;
	}

	private async getRemotePathSizeByCommand(endpoint: ITurboFileTransferEndpoint): Promise<number> {
		if (endpoint.kind !== 'ssh') {
			return getLocalPathSize(endpoint.path);
		}

		try {
			if (looksLikeWindowsPath(endpoint.path)) {
				return await this.withDirectorySshClient(endpoint, async client => {
					const output = await this.execRemoteBytes(client, buildWindowsSizeCommand(endpoint.path));
					return parseSizeCommandOutput(output.toString());
				});
			}

			return await this.withDirectorySshClient(endpoint, async client => {
				const output = await this.execRemoteBytes(client, buildPosixSizeCommand(endpoint.path));
				return parseSizeCommandOutput(output.toString());
			});
		} catch {
			return this.withDirectorySftp(endpoint, sftp => this.getRemotePathSize(sftp, endpoint.path));
		}
	}

	private async getPathHumanSize(endpoint: ITurboFileTransferEndpoint, size: number): Promise<string> {
		if (endpoint.kind === 'ssh' && !looksLikeWindowsPath(endpoint.path)) {
			try {
				return await this.withDirectorySshClient(endpoint, async client => {
					const output = await this.execRemoteBytes(client, buildPosixHumanSizeCommand(endpoint.path));
					const humanSize = output.toString().trim().split(/\r?\n/)[0]?.trim();
					if (!humanSize) {
						throw new Error('Empty human size output.');
					}
					return humanSize;
				});
			} catch {
				// Keep the exact byte count usable even when the display-only du command is unavailable.
			}
		}

		return formatHumanSize(size);
	}

	private remoteStat(sftp: ISFTPWrapper, remotePath: string): Promise<ISFTPStats> {
		return new Promise((resolve, reject) => {
			sftp.stat(remotePath, (error, stats) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stats);
			});
		});
	}

	private mkdirRemote(sftp: ISFTPWrapper, remotePath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			sftp.mkdir(remotePath, error => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}

	private rmdirRemote(sftp: ISFTPWrapper, remotePath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			sftp.rmdir(remotePath, error => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}

	private unlinkRemote(sftp: ISFTPWrapper, remotePath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			sftp.unlink(remotePath, error => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}

	private fastGet(sftp: ISFTPWrapper, remotePath: string, localPath: string, options?: ISFTPTransferOptions): Promise<void> {
		return new Promise((resolve, reject) => {
			const callback = (error: Error | undefined): void => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			};
			if (options) {
				sftp.fastGet(remotePath, localPath, options, callback);
			} else {
				sftp.fastGet(remotePath, localPath, callback);
			}
		});
	}

	private fastPut(sftp: ISFTPWrapper, localPath: string, remotePath: string, options?: ISFTPTransferOptions): Promise<void> {
		return new Promise((resolve, reject) => {
			const callback = (error: Error | undefined): void => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			};
			if (options) {
				sftp.fastPut(localPath, remotePath, options, callback);
			} else {
				sftp.fastPut(localPath, remotePath, callback);
			}
		});
	}

	private async fastGetWithFallback(sftp: ISFTPWrapper, remotePath: string, localPath: string, bytes: number, onDelta?: (delta: number) => void, progressId?: string): Promise<void> {
		await this.fastTransferWithFallback(
			bytes,
			onDelta,
			progressId,
			report => this.fastGet(sftp, remotePath, localPath, this.createSftpTransferOptions(report, progressId, bytes, true)),
			report => this.fastGet(sftp, remotePath, localPath, this.createSftpTransferOptions(report, progressId, bytes, false))
		);
	}

	private async fastPutWithFallback(sftp: ISFTPWrapper, localPath: string, remotePath: string, bytes: number, onDelta?: (delta: number) => void, progressId?: string): Promise<void> {
		await this.fastTransferWithFallback(
			bytes,
			onDelta,
			progressId,
			report => this.fastPut(sftp, localPath, remotePath, this.createSftpTransferOptions(report, progressId, bytes, true)),
			report => this.fastPut(sftp, localPath, remotePath, this.createSftpTransferOptions(report, progressId, bytes, false))
		);
	}

	private async fastTransferWithFallback(bytes: number, onDelta: ((delta: number) => void) | undefined, progressId: string | undefined, primary: (report: (delta: number) => void) => Promise<void>, fallback: (report: (delta: number) => void) => Promise<void>): Promise<void> {
		const useLargeOptions = bytes >= SFTP_LARGE_FILE_THRESHOLD;
		let reportedBytes = 0;
		const createAttemptReporter = (): ((delta: number) => void) => {
			let attemptBytes = 0;
			return (delta: number): void => {
				attemptBytes += delta;
				if (attemptBytes > reportedBytes) {
					const nextDelta = attemptBytes - reportedBytes;
					reportedBytes = attemptBytes;
					onDelta?.(nextDelta);
				}
			};
		};

		try {
			await primary(createAttemptReporter());
		} catch (error) {
			if (!useLargeOptions || error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
				throw error;
			}
			await fallback(createAttemptReporter());
		}
	}

	private async ensureRemoteDirectory(sftp: ISFTPWrapper, remotePath: string): Promise<void> {
		const normalized = remotePath.replace(/\\/g, '/');
		if (!normalized || normalized === '/' || normalized === '.') {
			return;
		}

		const drive = /^[A-Za-z]:/.exec(normalized)?.[0];
		const isAbsolute = normalized.startsWith('/');
		let current = isAbsolute ? '/' : drive ?? '';
		const rest = drive ? normalized.substring(drive.length).replace(/^\/+/, '') : normalized.replace(/^\/+/, '');
		for (const segment of rest.split('/').filter(Boolean)) {
			current = current ? joinRemotePath(current, segment) : segment;
			let stats: ISFTPStats | undefined;
			try {
				stats = await this.remoteStat(sftp, current);
			} catch {
				await this.mkdirRemote(sftp, current);
				stats = await this.remoteStat(sftp, current).catch(() => undefined);
			}
			if (stats && !stats.isDirectory()) {
				throw new Error(`Remote path is not a directory: ${current}`);
			}
		}
	}

	private async uploadDirectoryConcurrent(endpoint: ITurboFileTransferEndpoint, localPath: string, remotePath: string, onTotal?: (totalBytes: number) => void, onDelta?: (delta: number) => void, progressId?: string): Promise<void> {
		this.throwIfTransferCanceled(progressId);
		const plan = await this.collectLocalDirectoryTransferPlan(localPath, remotePath, progressId);
		onTotal?.(plan.totalBytes);
		await this.withSftpPool(endpoint, this.getDirectorySftpConnectionCount(plan.files.length, plan.totalBytes), progressId, async sftps => {
			this.throwIfTransferCanceled(progressId);
			await this.ensureRemoteDirectoriesForUpload(endpoint, sftps[0], plan.directories);
			await this.runSftpWorkers(sftps, plan.files, progressId, async (sftp, file) => {
				this.throwIfTransferCanceled(progressId);
				await this.fastPutWithFallback(sftp, file.localPath, file.remotePath, file.size, onDelta, progressId);
			});
		});
	}

	private async downloadDirectoryConcurrent(endpoint: ITurboFileTransferEndpoint, remotePath: string, localPath: string, onTotal?: (totalBytes: number) => void, onDelta?: (delta: number) => void, progressId?: string): Promise<void> {
		this.throwIfTransferCanceled(progressId);
		const plan = await this.withSftp(endpoint, sftp => this.collectRemoteDirectoryTransferPlan(sftp, remotePath, localPath, progressId), progressId);
		onTotal?.(plan.totalBytes);
		await mapLimit(plan.directories, LOCAL_DIRECTORY_STAT_CONCURRENCY, directory => fsp.mkdir(directory, { recursive: true }));
		await this.withSftpPool(endpoint, this.getDirectorySftpConnectionCount(plan.files.length, plan.totalBytes), progressId, async sftps => {
			await this.runSftpWorkers(sftps, plan.files, progressId, async (sftp, file) => {
				this.throwIfTransferCanceled(progressId);
				await fsp.mkdir(dirname(file.localPath), { recursive: true });
				await this.fastGetWithFallback(sftp, file.remotePath, file.localPath, file.size, onDelta, progressId);
			});
		});
	}

	private getDirectorySftpConnectionCount(fileCount: number, totalBytes: number): number {
		if (fileCount <= 1) {
			return 1;
		}
		if (fileCount < 16 && totalBytes < SFTP_LARGE_FILE_THRESHOLD) {
			return Math.min(4, fileCount);
		}
		if (fileCount >= 256 || totalBytes >= SFTP_LARGE_FILE_THRESHOLD) {
			return Math.min(SFTP_DIRECTORY_TRANSFER_CONNECTIONS, fileCount);
		}
		return Math.min(8, fileCount);
	}

	private async collectLocalDirectoryTransferPlan(localPath: string, remotePath: string, progressId?: string): Promise<ILocalDirectoryTransferPlan> {
		const directories: string[] = [];
		const files: ILocalDirectoryTransferFile[] = [];
		let totalBytes = 0;

		const walk = async (currentLocalPath: string, currentRemotePath: string): Promise<void> => {
			this.throwIfTransferCanceled(progressId);
			directories.push(currentRemotePath);
			const entries = await fsp.readdir(currentLocalPath, { withFileTypes: true });
			await mapLimit(entries, SFTP_DIRECTORY_DISCOVERY_CONCURRENCY, async entry => {
				this.throwIfTransferCanceled(progressId);
				const childLocalPath = join(currentLocalPath, entry.name);
				const childRemotePath = joinRemotePath(currentRemotePath, entry.name);
				if (entry.isDirectory()) {
					await walk(childLocalPath, childRemotePath);
					return;
				}
				if (!entry.isFile()) {
					return;
				}
				const stat = await fsp.stat(childLocalPath);
				totalBytes += stat.size;
				files.push({
					localPath: childLocalPath,
					remotePath: childRemotePath,
					size: stat.size
				});
			});
		};

		await walk(localPath, remotePath);
		return { directories, files, totalBytes };
	}

	private async collectRemoteDirectoryTransferPlan(sftp: ISFTPWrapper, remotePath: string, localPath: string, progressId?: string): Promise<IRemoteDirectoryTransferPlan> {
		const directories: string[] = [];
		const files: IRemoteDirectoryTransferFile[] = [];
		let totalBytes = 0;

		const walk = async (currentRemotePath: string, currentLocalPath: string): Promise<void> => {
			this.throwIfTransferCanceled(progressId);
			directories.push(currentLocalPath);
			const entries = await this.readRemoteDirectory(sftp, currentRemotePath);
			await mapLimit(entries, SFTP_DIRECTORY_DISCOVERY_CONCURRENCY, async entry => {
				this.throwIfTransferCanceled(progressId);
				if (entry.filename === '.' || entry.filename === '..') {
					return;
				}
				const childRemotePath = joinRemotePath(currentRemotePath, entry.filename);
				const childLocalPath = join(currentLocalPath, entry.filename);
				if (entry.attrs.isDirectory()) {
					await walk(childRemotePath, childLocalPath);
					return;
				}
				if (!entry.attrs.isFile() && !entry.attrs.isSymbolicLink()) {
					return;
				}
				totalBytes += entry.attrs.size;
				files.push({
					remotePath: childRemotePath,
					localPath: childLocalPath,
					size: entry.attrs.size
				});
			});
		};

		await walk(remotePath, localPath);
		return { directories, files, totalBytes };
	}

	private async ensureRemoteDirectoriesForUpload(endpoint: ITurboFileTransferEndpoint, fallbackSftp: ISFTPWrapper, directories: readonly string[]): Promise<void> {
		const uniqueDirectories = [...new Set(directories)].filter(directory => !!directory && directory !== '.' && directory !== '/');
		if (!uniqueDirectories.length) {
			return;
		}
		if (endpoint.kind === 'ssh' && !uniqueDirectories.some(looksLikeWindowsPath)) {
			try {
				await this.withSshClient(endpoint, async client => {
					for (let index = 0; index < uniqueDirectories.length; index += SFTP_DIRECTORY_MKDIR_BATCH_SIZE) {
						const chunk = uniqueDirectories.slice(index, index + SFTP_DIRECTORY_MKDIR_BATCH_SIZE);
						await this.execRemote(client, `mkdir -p -- ${chunk.map(directory => quotePosixShellArg(directory)).join(' ')}`);
					}
				});
				return;
			} catch {
				// Some devices expose SFTP but not a POSIX shell; fall back to SFTP mkdir.
			}
		}
		await mapLimit(uniqueDirectories, SFTP_DIRECTORY_ENTRY_CONCURRENCY, directory => this.ensureRemoteDirectory(fallbackSftp, directory));
	}

	private async withSftpPool<T>(endpoint: ITurboFileTransferEndpoint, requestedConnections: number, progressId: string | undefined, task: (sftps: ISFTPWrapper[]) => Promise<T>): Promise<T> {
		if (!endpoint.connection) {
			throw new Error('SSH endpoint is missing connection options.');
		}

		const configResult = await this.createConnectConfig(endpoint.connection);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		const desiredConnections = Math.max(1, Math.min(requestedConnections, SFTP_DIRECTORY_TRANSFER_CONNECTIONS));
		const clients: ISSHClient[] = [];
		const sftps: ISFTPWrapper[] = [];
		const closeAll = (): void => {
			for (const sftp of sftps) {
				try {
					sftp.end();
				} catch {
					// Best-effort cleanup.
				}
			}
			for (const client of clients) {
				try {
					client.end();
				} catch {
					// Best-effort cleanup.
				}
			}
		};
		const unregisterCancel = this.registerTransferCancelHandler(progressId, closeAll);
		try {
			for (let index = 0; index < desiredConnections; index++) {
				this.throwIfTransferCanceled(progressId);
				try {
					const client = await this.connect(configResult.config);
					const sftp = await this.openSftp(client);
					clients.push(client);
					sftps.push(sftp);
				} catch (error) {
					if (!sftps.length) {
						throw error;
					}
					break;
				}
			}
			return await task(sftps);
		} finally {
			unregisterCancel();
			closeAll();
		}
	}

	private async runSftpWorkers<T>(sftps: readonly ISFTPWrapper[], items: readonly T[], progressId: string | undefined, worker: (sftp: ISFTPWrapper, item: T, index: number) => Promise<void>): Promise<void> {
		let nextIndex = 0;
		await Promise.all(sftps.map(async sftp => {
			while (true) {
				this.throwIfTransferCanceled(progressId);
				const index = nextIndex;
				if (index >= items.length) {
					return;
				}
				nextIndex = index + 1;
				await worker(sftp, items[index], index);
			}
		}));
	}

	private async uploadDirectory(sftp: ISFTPWrapper, localPath: string, remotePath: string, onDelta?: (delta: number) => void, progressId?: string): Promise<void> {
		this.throwIfTransferCanceled(progressId);
		await this.ensureRemoteDirectory(sftp, remotePath);
		const entries = await fsp.readdir(localPath, { withFileTypes: true });
		await mapLimit(entries, SFTP_DIRECTORY_ENTRY_CONCURRENCY, async entry => {
			this.throwIfTransferCanceled(progressId);
			const localChild = join(localPath, entry.name);
			const remoteChild = joinRemotePath(remotePath, entry.name);
			if (entry.isDirectory()) {
				await this.uploadDirectory(sftp, localChild, remoteChild, onDelta, progressId);
			} else if (entry.isFile()) {
				await this.fastPut(sftp, localChild, remoteChild, this.createSftpTransferOptions(onDelta, progressId));
			}
		});
	}

	private async downloadDirectory(sftp: ISFTPWrapper, remotePath: string, localPath: string, onDelta?: (delta: number) => void, progressId?: string): Promise<void> {
		this.throwIfTransferCanceled(progressId);
		await fsp.mkdir(localPath, { recursive: true });
		const entries = await this.readRemoteDirectory(sftp, remotePath);
		await mapLimit(entries, SFTP_DIRECTORY_ENTRY_CONCURRENCY, async entry => {
			this.throwIfTransferCanceled(progressId);
			if (entry.filename === '.' || entry.filename === '..') {
				return;
			}
			const remoteChild = joinRemotePath(remotePath, entry.filename);
			const localChild = join(localPath, entry.filename);
			if (entry.attrs.isDirectory()) {
				await this.downloadDirectory(sftp, remoteChild, localChild, onDelta, progressId);
			} else if (entry.attrs.isFile() || entry.attrs.isSymbolicLink()) {
				await fsp.mkdir(dirname(localChild), { recursive: true });
				await this.fastGet(sftp, remoteChild, localChild, this.createSftpTransferOptions(onDelta, progressId));
			}
		});
	}

	private async deleteRemoteDirectory(sftp: ISFTPWrapper, remotePath: string): Promise<void> {
		const entries = await this.readRemoteDirectory(sftp, remotePath);
		for (const entry of entries) {
			if (entry.filename === '.' || entry.filename === '..') {
				continue;
			}
			const childPath = joinRemotePath(remotePath, entry.filename);
			if (entry.attrs.isDirectory()) {
				await this.deleteRemoteDirectory(sftp, childPath);
			} else {
				await this.unlinkRemote(sftp, childPath);
			}
		}
		await this.rmdirRemote(sftp, remotePath);
	}

	private toRemoteEntry(parentPath: string, entry: ISFTPFileEntry): ITurboFileFileEntry {
		const type = getFileTypeFromStats(entry.attrs);
		return {
			name: entry.filename,
			path: joinRemotePath(parentPath, entry.filename),
			type,
			size: entry.attrs.size,
			modified: entry.attrs.mtime * 1000,
			permissions: entry.longname.split(/\s+/)[0]
		};
	}

	private async getNativeRequire(): Promise<NodeRequire> {
		if (!this.nativeRequire) {
			const nodeModule = await import('node:module');
			this.nativeRequire = nodeModule.createRequire(import.meta.url);
		}
		return this.nativeRequire;
	}
}

function readWindowsClipboardFilePaths(): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();
	const acceptPath = (path: string): void => {
		const candidate = path.trim().replace(/^"|"$/g, '').replace(/^file:\/\/\/?/i, '');
		if (!isWindowsClipboardPath(candidate)) {
			return;
		}

		const key = candidate.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		paths.push(candidate);
	};

	for (const path of parseWindowsClipboardBuffer(clipboard.readBuffer('FileNameW'), 'utf16le')) {
		acceptPath(path);
	}
	for (const path of parseWindowsClipboardBuffer(clipboard.readBuffer('FileName'), 'utf8')) {
		acceptPath(path);
	}
	for (const path of clipboard.readText('clipboard').split(/\r?\n/)) {
		acceptPath(path);
	}

	return paths;
}

function parseWindowsClipboardBuffer(buffer: Buffer, encoding: BufferEncoding): string[] {
	if (!buffer.byteLength) {
		return [];
	}

	return buffer.toString(encoding).replace(/\0+$/g, '').split('\0').filter(Boolean);
}

function readWindowsClipboardOperation(): 'copy' | 'move' {
	const dropEffect = clipboard.readBuffer('Preferred DropEffect');
	if (dropEffect.byteLength >= 4 && (dropEffect.readUInt32LE(0) & 2) === 2) {
		return 'move';
	}
	return 'copy';
}

function isWindowsClipboardPath(path: string): boolean {
	return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}

// Match WinSCP's SCP path: run remote "scp -t/-f" and speak the SCP wire protocol over the SSH channel.
class ScpProtocolReader {
	private readonly chunks: Buffer[] = [];
	private readonly waiters: Array<() => void> = [];
	private closed = false;
	private streamError: Error | undefined;

	constructor(stream: ISSHExecStream) {
		stream.on('data', data => {
			this.chunks.push(typeof data === 'string' ? Buffer.from(data) : data);
			this.flushWaiters();
		});
		stream.on('error', error => {
			this.streamError = error;
			this.flushWaiters();
		});
		stream.on('close', () => {
			this.closed = true;
			this.flushWaiters();
		});
	}

	async readByte(): Promise<number> {
		const buffer = await this.readBytes(1);
		return buffer[0];
	}

	async readLine(): Promise<string> {
		const parts: Buffer[] = [];
		for (;;) {
			await this.waitForData();
			const chunk = this.chunks[0];
			const newlineIndex = chunk.indexOf(10);
			if (newlineIndex >= 0) {
				parts.push(this.takeFromFirstChunk(newlineIndex + 1));
				return Buffer.concat(parts).toString('utf8').replace(/\n$/, '').replace(/\r$/, '');
			}
			parts.push(this.takeFromFirstChunk(chunk.byteLength));
		}
	}

	async readBytes(byteLength: number): Promise<Buffer> {
		const parts: Buffer[] = [];
		let remaining = byteLength;
		while (remaining > 0) {
			await this.waitForData();
			const chunk = this.takeFromFirstChunk(Math.min(remaining, this.chunks[0].byteLength));
			parts.push(chunk);
			remaining -= chunk.byteLength;
		}
		return Buffer.concat(parts, byteLength);
	}

	private async waitForData(): Promise<void> {
		if (this.streamError) {
			throw this.streamError;
		}
		if (this.chunks.length) {
			return;
		}
		if (this.closed) {
			throw new Error('SCP stream closed unexpectedly.');
		}
		await new Promise<void>(resolve => this.waiters.push(resolve));
		if (this.streamError) {
			throw this.streamError;
		}
		if (!this.chunks.length && this.closed) {
			throw new Error('SCP stream closed unexpectedly.');
		}
	}

	private takeFromFirstChunk(byteLength: number): Buffer {
		const chunk = this.chunks[0];
		if (byteLength >= chunk.byteLength) {
			this.chunks.shift();
			return chunk;
		}
		const head = chunk.subarray(0, byteLength);
		this.chunks[0] = chunk.subarray(byteLength);
		return head;
	}

	private flushWaiters(): void {
		const waiters = this.waiters.splice(0);
		for (const waiter of waiters) {
			waiter();
		}
	}
}

async function readScpResponse(reader: ScpProtocolReader, context: string): Promise<void> {
	const code = await reader.readByte();
	if (code === 0) {
		return;
	}
	const message = (await reader.readLine()).trim();
	if (code === 1 || code === 2) {
		throw new Error(message || `SCP failed during ${context}.`);
	}
	throw new Error(`Unexpected SCP response ${code} during ${context}${message ? `: ${message}` : ''}.`);
}

async function readScpFileHeader(reader: ScpProtocolReader, stream: ISSHExecStream): Promise<{ size: number; name: string }> {
	for (;;) {
		const marker = await reader.readByte();
		if (marker === 1 || marker === 2) {
			const message = (await reader.readLine()).trim();
			throw new Error(message || 'SCP download failed.');
		}
		const line = await reader.readLine();
		if (marker === 84 /* T */) {
			await writeScpData(stream, Buffer.from([0]));
			continue;
		}
		if (marker !== 67 /* C */) {
			throw new Error(`Unexpected SCP file header: ${String.fromCharCode(marker)}${line}`);
		}
		const match = line.match(/^[0-7]{4}\s+(\d+)\s+(.+)$/);
		if (!match) {
			throw new Error(`Invalid SCP file header: C${line}`);
		}
		const size = Number(match[1]);
		if (!Number.isFinite(size) || size < 0) {
			throw new Error(`Invalid SCP file size: ${match[1]}`);
		}
		return { size, name: match[2] };
	}
}

async function readScpFilePayload(reader: ScpProtocolReader, localPath: string, byteLength: number, onProgress?: (transferredBytes: number) => void): Promise<void> {
	const output = createWriteStream(localPath);
	let transferredBytes = 0;
	try {
		while (transferredBytes < byteLength) {
			const chunk = await reader.readBytes(Math.min(1024 * 1024, byteLength - transferredBytes));
			await writeLocalStream(output, chunk);
			transferredBytes += chunk.byteLength;
			onProgress?.(transferredBytes);
		}
		await endLocalStream(output);
	} catch (error) {
		output.destroy();
		throw error;
	}
}

function writeScpData(stream: ISSHExecStream, data: Buffer | string): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			if (stream.write(data)) {
				resolve();
				return;
			}
			const cleanup = (): void => {
				stream.off('drain', onDrain);
				stream.off('error', onError);
			};
			const onDrain = (): void => {
				cleanup();
				resolve();
			};
			const onError = (error: Error): void => {
				cleanup();
				reject(error);
			};
			stream.once('drain', onDrain);
			stream.once('error', onError);
		} catch (error) {
			reject(error);
		}
	});
}

function writeLocalStream(stream: ReturnType<typeof createWriteStream>, data: Buffer): Promise<void> {
	return new Promise((resolve, reject) => {
		if (stream.write(data)) {
			resolve();
			return;
		}
		const cleanup = (): void => {
			stream.off('drain', onDrain);
			stream.off('error', onError);
		};
		const onDrain = (): void => {
			cleanup();
			resolve();
		};
		const onError = (error: Error): void => {
			cleanup();
			reject(error);
		};
		stream.once('drain', onDrain);
		stream.once('error', onError);
	});
}

function endLocalStream(stream: ReturnType<typeof createWriteStream>): Promise<void> {
	return new Promise((resolve, reject) => {
		stream.once('error', reject);
		stream.end(resolve);
	});
}

function waitForScpClose(stream: ISSHExecStream): Promise<void> {
	return new Promise((resolve, reject) => {
		stream.on('close', code => {
			if (code === 0 || code === null) {
				resolve();
				return;
			}
			reject(new Error(`SCP command failed with exit code ${code}.`));
		});
		stream.on('error', reject);
	});
}

function formatScpMode(mode: number): string {
	return (mode & 0o777).toString(8).padStart(4, '0');
}

function sanitizeScpFileName(name: string): string {
	return name.replace(/[\r\n]/g, '_') || 'payload';
}

function getTransferStrategy(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint): ITurboFileTransferResult['strategy'] {
	if (source.kind === 'local' && target.kind === 'local') {
		return 'local-copy';
	}
	if (source.kind === 'local') {
		if (target.preferredProtocol === 'rsync' && canUseLocalRsyncCommand(target.connection)) {
			return 'rsync-upload';
		}
		if (target.preferredProtocol !== 'sftp') {
			return 'scp-upload';
		}
		return 'sftp-upload';
	}
	if (target.kind === 'local') {
		if (source.preferredProtocol === 'rsync' && canUseLocalRsyncCommand(source.connection)) {
			return 'rsync-download';
		}
		if (source.preferredProtocol !== 'sftp') {
			return 'scp-download';
		}
		return 'sftp-download';
	}
	if (source.connection && target.connection && isSameSshConnection(source.connection, target.connection)) {
		return 'remote-copy';
	}
	if (source.supportsRsync === true && target.supportsRsync === true) {
		return 'rsync-direct';
	}
	return 'sftp-direct';
}

function getLocalCommandTransferProtocolOrder(preferredProtocol: TurboFileTransferProtocol | undefined, connection: ITurboFileSshConnectionOptions | undefined): Array<'scp' | 'rsync'> {
	if (preferredProtocol === 'rsync') {
		return canUseLocalRsyncCommand(connection) ? ['rsync', 'scp'] : ['scp'];
	}
	if (preferredProtocol === 'scp') {
		return ['scp'];
	}
	return preferredProtocol === 'sftp' ? [] : ['scp'];
}

function canUseLocalRsyncCommand(connection: ITurboFileSshConnectionOptions | undefined): boolean {
	if (!connection) {
		return false;
	}
	return !!connection.privateKeyPath && !connection.password;
}

function isRecoverableLocalCommandTransferError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /not recognized|ENOENT|No such file|could not create directory|Permission denied|Connection|timed out|failed|lost connection|rsync error/i.test(message);
}

function buildLocalRsyncSshTransport(connection: ITurboFileSshConnectionOptions): string {
	const parts = [
		'ssh',
		'-T',
		'-o BatchMode=yes',
		'-o StrictHostKeyChecking=accept-new',
		'-o Compression=no',
		'-o LogLevel=ERROR'
	];
	if (connection.privateKeyPath) {
		parts.push(`-i ${quoteLocalShellArg(toOpenSshLocalPath(connection.privateKeyPath))}`);
	}
	if (connection.port && connection.port !== 22) {
		parts.push(`-p ${connection.port}`);
	}
	return parts.join(' ');
}

function formatRsyncRemoteSpec(connection: ITurboFileSshConnectionOptions, remotePath: string): string {
	return `${connection.username}@${connection.host}:${remotePath}`;
}

function toRsyncLocalPath(path: string): string {
	const normalized = path.replace(/\\/g, '/');
	const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
	if (driveMatch) {
		return `/cygdrive/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
	}
	return normalized;
}

function toOpenSshLocalPath(path: string): string {
	return path.replace(/\\/g, '/');
}

function quoteLocalShellArg(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

function getDirectRsyncRouteCacheKey(source: ITurboFileSshConnectionOptions, target: ITurboFileSshConnectionOptions): string {
	return `${getSshConnectionRouteKey(source)}=>${getSshConnectionRouteKey(target)}`;
}

function getSshConnectionRouteKey(connection: ITurboFileSshConnectionOptions): string {
	const auth = connection.password ? 'password' : connection.privateKeyPath || connection.privateKey ? 'privateKey' : 'agent';
	return `${connection.username}@${connection.host}:${connection.port || 22}:${auth}`;
}

function getFileTypeFromStats(stats: ISFTPStats): TurboFileFileType {
	return stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : stats.isSymbolicLink() ? 'symlink' : 'unknown';
}

function joinRemotePath(parentPath: string, name: string): string {
	if (!parentPath || parentPath === '/') {
		return `/${name}`;
	}
	const separator = parentPath.includes('\\') && !parentPath.includes('/') ? '\\' : '/';
	return parentPath.endsWith('/') || parentPath.endsWith('\\') ? `${parentPath}${name}` : `${parentPath}${separator}${name}`;
}

function getRemoteParentPath(path: string): string {
	const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
	if (!normalized || normalized === '/') {
		return '/';
	}
	const index = normalized.lastIndexOf('/');
	if (index < 0) {
		return '.';
	}
	if (index === 0) {
		return '/';
	}
	return normalized.substring(0, index);
}

function buildShellBootstrapCommand(cwd: string): string {
	const commands = [
		'stty echo',
		'printf "\\033[H\\033[2J\\033[3J"',
		cwd ? `cd ${quotePosixShellArg(cwd)} 2>/dev/null || true` : undefined,
		`printf "\\n${SSH_TERMINAL_READY_MARKER}\\n"`
	].filter((command): command is string => !!command);

	return `${commands.join('; ')}\n`;
}

function ensureTrailingRemoteSlash(path: string): string {
	return path.endsWith('/') || path.endsWith('\\') ? path : `${path}/`;
}

function trimTrailingRemoteSlash(path: string): string {
	const trimmed = path.replace(/[\\/]+$/g, '');
	return trimmed || '/';
}

function getRemoteDirectoryFallbackPaths(options: ITurboFileSshConnectionOptions, path: string): string[] {
	const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
	const username = options.username;
	const candidates: string[] = [];
	const add = (candidate: string): void => {
		const value = candidate.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
		if (value !== normalized && !candidates.includes(value)) {
			candidates.push(value);
		}
	};

	for (const prefix of [`/var/services/homes/${username}`, `/volume1/homes/${username}`]) {
		if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
			const suffix = normalized.substring(prefix.length);
			add(`/home${suffix}`);
			add(`/homes/${username}${suffix}`);
		}
	}

	add('.');
	add('/home');
	add(`/homes/${username}`);
	add('/');
	return candidates;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workerCount = Math.max(1, Math.min(limit, items.length));
	await Promise.all(Array.from({ length: workerCount }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex++;
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	}));
	return results;
}

function getTransferName(path: string): string {
	const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
	if (slash >= 0) {
		return path.substring(slash + 1);
	}
	return basename(path);
}

function quotePosixShellArg(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

function normalizeTransferDependencies(packages: readonly TurboFileTransferDependency[]): TurboFileTransferDependency[] {
	const allowed = new Set<TurboFileTransferDependency>(['rsync', 'sshpass']);
	const normalized: TurboFileTransferDependency[] = [];
	for (const pkg of packages) {
		if (allowed.has(pkg) && !normalized.includes(pkg)) {
			normalized.push(pkg);
		}
	}
	return normalized;
}

function getMissingTransferDependencies(packages: readonly TurboFileTransferDependency[], capabilities: ITurboFileRemoteCapabilities): TurboFileTransferDependency[] {
	return packages.filter(pkg => pkg === 'rsync' ? !capabilities.rsync : !capabilities.sshpass);
}

function buildTransferDependencyInstallCommand(packages: readonly TurboFileTransferDependency[], options: ITurboFileSshConnectionOptions): string {
	const packageArgs = packages.map(pkg => quotePosixShellArg(pkg)).join(' ');
	const installScript = [
		'set -e',
		`packages="${packages.join(' ')}"`,
		'if command -v apt-get >/dev/null 2>&1; then export DEBIAN_FRONTEND=noninteractive; apt-get update && apt-get install -y "$@"',
		'elif command -v dnf >/dev/null 2>&1; then dnf install -y "$@"',
		'elif command -v yum >/dev/null 2>&1; then yum install -y "$@"',
		'elif command -v pacman >/dev/null 2>&1; then pacman -Sy --noconfirm "$@"',
		'elif command -v zypper >/dev/null 2>&1; then zypper --non-interactive install "$@"',
		'elif command -v apk >/dev/null 2>&1; then apk add --no-cache "$@"',
		'else echo "未找到支持的包管理器，请手动安装 rsync 和 sshpass。" >&2; exit 42',
		'fi'
	].join('; ');
	const installViaRoot = `sh -c ${quotePosixShellArg(installScript)} sh ${packageArgs}`;
	const installViaPasswordSudo = options.password
		? ` || (printf %s ${quotePosixShellArg(`${options.password}\n`)} | sudo -S -p '' sh -c ${quotePosixShellArg(installScript)} sh ${packageArgs})`
		: '';
	// Prefer root or passwordless sudo; password sudo is only attempted when the SSH password is available.
	return [
		'if [ "$(id -u)" -eq 0 ]; then',
		installViaRoot,
		'; elif command -v sudo >/dev/null 2>&1; then',
		`(sudo -n sh -c ${quotePosixShellArg(installScript)} sh ${packageArgs})${installViaPasswordSudo}`,
		'; else echo "当前用户不是 root，且远端没有 sudo，无法自动安装。" >&2; exit 43; fi'
	].join(' ');
}

function runLocalCommand(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(command, args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, _stdout, stderr) => {
			if (error) {
				reject(new Error(formatLocalCommandError(stderr, error.message)));
				return;
			}
			resolve();
		});
	});
}

function runLocalCommandBuffer(command: string, args: string[], maxBuffer = 10 * 1024 * 1024): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		execFile(command, args, { windowsHide: true, maxBuffer, encoding: 'buffer' }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(formatLocalCommandError(stderr?.toString(), error.message)));
				return;
			}
			resolve(stdout);
		});
	});
}

function formatLocalCommandError(stderr: string | undefined, fallback: string): string {
	const message = (stderr ?? '').trim();
	if (!message) {
		return fallback;
	}
	if (message.startsWith('#< CLIXML') && message.includes('System.Management.Automation.PSCustomObject')) {
		return fallback;
	}
	return message;
}

function runLocalPowerShellScript(script: string): Promise<void> {
	return runLocalCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShellCommand(script)]);
}

async function getWindowsExplorerVisibleLocalNames(path: string): Promise<Set<string> | undefined> {
	if (platform() !== 'win32') {
		return undefined;
	}

	try {
		const stdout = await runLocalCommandBuffer('cmd.exe', ['/d', '/u', '/c', 'dir', '/b', '/a:-h-s', path], 64 * 1024 * 1024);
		return new Set(stdout.toString('utf16le').replace(/^\uFEFF/, '').split(/\r?\n/).filter(name => !!name));
	} catch {
		return undefined;
	}
}

function runLocalRobocopyCommand(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile('robocopy.exe', args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (error, _stdout, stderr) => {
			if (!error) {
				resolve();
				return;
			}

			const exitCode = typeof error.code === 'number' ? error.code : Number.NaN;
			if (Number.isFinite(exitCode) && exitCode <= 7) {
				resolve();
				return;
			}
			reject(new Error(formatLocalCommandError(stderr, error.message)));
		});
	});
}

async function ensureLocalParentDirectory(path: string): Promise<void> {
	const parent = dirname(path);
	await ensureLocalDirectory(parent);
}

async function ensureLocalDirectory(path: string): Promise<void> {
	if (!path || isLocalFilesystemRoot(path)) {
		return;
	}
	await fsp.mkdir(path, { recursive: true });
}

function isLocalFilesystemRoot(path: string): boolean {
	const normalized = path.replace(/[\\/]+$/, '');
	return !normalized || normalized === '/' || normalized === '\\' || /^[A-Za-z]:$/.test(normalized) || /^\\\\[^\\]+\\[^\\]+$/.test(normalized);
}

function delay(milliseconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isSameSshConnection(left: ITurboFileSshConnectionOptions, right: ITurboFileSshConnectionOptions): boolean {
	return left.host === right.host
		&& (left.port || 22) === (right.port || 22)
		&& left.username === right.username;
}

function buildOptimizedRsyncSshCommand(port: number, hasPassword = false, sshBinary = 'ssh'): string {
	const parts = [
		sshBinary,
		'-T',
		'-o Compression=no',
		'-o Ciphers=aes128-ctr',
		'-o ConnectTimeout=5',
		'-o ConnectionAttempts=1',
		'-o NumberOfPasswordPrompts=1',
		'-o ServerAliveInterval=15',
		'-o ServerAliveCountMax=2',
		'-o StrictHostKeyChecking=no',
		'-o UserKnownHostsFile=/dev/null',
		'-o LogLevel=ERROR',
		'-o MACs=umac-64@openssh.com',
		'-o ControlMaster=auto',
		'-o ControlPersist=300',
		'-o ControlPath=/tmp/turbofile-ssh-%r@%h:%p'
	];
	parts.push(hasPassword ? '-o PreferredAuthentications=password,keyboard-interactive,publickey' : '-o BatchMode=yes');
	if (port && port !== 22) {
		parts.push(`-p ${port}`);
	}
	return parts.join(' ');
}

function buildOptimizedSftpCommand(port: number, hasPassword = false): string {
	const parts = [
		'sftp',
		'-q',
		'-b -',
		'-o Compression=no',
		'-o ConnectTimeout=5',
		'-o ConnectionAttempts=1',
		'-o NumberOfPasswordPrompts=1',
		'-o ServerAliveInterval=15',
		'-o ServerAliveCountMax=2',
		'-o StrictHostKeyChecking=no',
		'-o UserKnownHostsFile=/dev/null',
		'-o LogLevel=ERROR'
	];
	parts.push(hasPassword ? '-o PreferredAuthentications=password,keyboard-interactive,publickey' : '-o BatchMode=yes');
	if (port && port !== 22) {
		parts.push(`-P ${port}`);
	}
	return parts.join(' ');
}

function buildCompatibleSshCommand(port: number, hasPassword = false): string {
	const parts = [
		'ssh',
		'-o Compression=no',
		'-o ConnectTimeout=5',
		'-o ConnectionAttempts=1',
		'-o NumberOfPasswordPrompts=1',
		'-o ServerAliveInterval=15',
		'-o ServerAliveCountMax=2',
		'-o StrictHostKeyChecking=no',
		'-o UserKnownHostsFile=/dev/null',
		'-o LogLevel=ERROR'
	];
	parts.push(hasPassword ? '-o PreferredAuthentications=password,keyboard-interactive,publickey' : '-o BatchMode=yes');
	if (port && port !== 22) {
		parts.push(`-p ${port}`);
	}
	return parts.join(' ');
}

function buildSshpassPrefix(password: string | undefined): string {
	return password ? `sshpass -p ${quotePosixShellArg(password)} ` : '';
}

function quoteSftpBatchPath(value: string): string {
	return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

function quotePowerShellLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function encodePowerShellCommand(script: string): string {
	return Buffer.from(script, 'utf16le').toString('base64');
}

function buildPowerShellCommand(script: string): string {
	return `powershell -NoProfile -NonInteractive -EncodedCommand ${encodePowerShellCommand(script)}`;
}

function withPowerShellDefaults(script: string): string {
	return `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; ${script}`;
}

function buildLocalWindowsMoveScript(sourcePath: string, targetPath: string): string {
	const source = quotePowerShellLiteral(sourcePath);
	const target = quotePowerShellLiteral(targetPath);
	return withPowerShellDefaults(`$src=${source}; $dst=${target}; Move-Item -LiteralPath $src -Destination $dst -Force`);
}

function buildLocalWindowsBatchScript(sourcePaths: readonly string[], targetDirectory: string, operation: 'copy' | 'move'): string {
	const sources = sourcePaths.map(path => quotePowerShellLiteral(path)).join(',');
	const target = quotePowerShellLiteral(targetDirectory);
	const command = operation === 'move' ? 'Move-Item' : 'Copy-Item';
	const recurse = operation === 'copy' ? ' -Recurse' : '';
	return withPowerShellDefaults(`$srcs=@(${sources}); $dst=${target}; if (-not (Test-Path -LiteralPath $dst)) { New-Item -ItemType Directory -Force -Path $dst | Out-Null }; foreach ($src in $srcs) { ${command} -LiteralPath $src -Destination $dst -Force${recurse} }`);
}

function buildWindowsCopyCommand(sourcePath: string, targetPath: string): string {
	const source = quotePowerShellLiteral(sourcePath);
	const target = quotePowerShellLiteral(targetPath);
	return buildPowerShellCommand(withPowerShellDefaults(`$src=${source}; $dst=${target}; $parent=[System.IO.Path]::GetDirectoryName($dst); if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }; Copy-Item -LiteralPath $src -Destination $dst -Force -Recurse`));
}

function buildWindowsMoveCommand(sourcePath: string, targetPath: string): string {
	const source = quotePowerShellLiteral(sourcePath);
	const target = quotePowerShellLiteral(targetPath);
	return buildPowerShellCommand(withPowerShellDefaults(`$src=${source}; $dst=${target}; $parent=[System.IO.Path]::GetDirectoryName($dst); if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }; Move-Item -LiteralPath $src -Destination $dst -Force`));
}

function buildPosixCopyCommand(sourcePath: string, targetPath: string): string {
	const source = quotePosixShellArg(sourcePath);
	const target = quotePosixShellArg(targetPath);
	const parent = quotePosixShellArg(getRemoteParentPath(targetPath));
	return `mkdir -p ${parent} && (cp -a --reflink=auto --sparse=always ${source} ${target} 2>/dev/null || cp -a ${source} ${target})`;
}

function buildWindowsBatchCommand(sourcePaths: readonly string[], targetDirectory: string, operation: 'copy' | 'move'): string {
	const sources = sourcePaths.map(path => quotePowerShellLiteral(path)).join(',');
	const target = quotePowerShellLiteral(targetDirectory);
	const command = operation === 'move' ? 'Move-Item' : 'Copy-Item';
	const recurse = operation === 'copy' ? ' -Recurse' : '';
	return buildPowerShellCommand(withPowerShellDefaults(`$srcs=@(${sources}); $dst=${target}; if (-not (Test-Path -LiteralPath $dst)) { New-Item -ItemType Directory -Force -Path $dst | Out-Null }; foreach ($src in $srcs) { ${command} -LiteralPath $src -Destination $dst -Force${recurse} }`));
}

function buildPosixBatchCommand(sourcePaths: readonly string[], targetDirectory: string, operation: 'copy' | 'move'): string {
	const target = quotePosixShellArg(targetDirectory);
	const sources = sourcePaths.map(path => quotePosixShellArg(path)).join(' ');
	if (operation === 'move') {
		return `mkdir -p ${target} && mv -f ${sources} ${target}`;
	}
	return `mkdir -p ${target} && (cp -a --reflink=auto --sparse=always ${sources} ${target} 2>/dev/null || cp -a ${sources} ${target})`;
}

function buildWindowsBatchDeleteCommand(sourcePaths: readonly string[]): string {
	const sources = sourcePaths.map(path => quotePowerShellLiteral(path)).join(',');
	return buildPowerShellCommand(withPowerShellDefaults(`$srcs=@(${sources}); foreach ($src in $srcs) { if (Test-Path -LiteralPath $src) { Remove-Item -LiteralPath $src -Force -Recurse } }`));
}

function buildRsyncOptions(includeProgress: boolean): string {
	const options = [
		'-a',
		'--inplace',
		'--whole-file',
		'--no-compress',
		'--numeric-ids',
		'--timeout=600',
		'-s',
		'--no-perms',
		'--no-owner',
		'--no-group',
		'--omit-dir-times'
	];
	if (includeProgress) {
		options.push('--info=progress2');
	}
	return options.join(' ');
}

function buildWindowsDeleteCommand(path: string, recursive: boolean): string {
	const literalPath = path.replace(/'/g, "''");
	const recurseFlag = recursive ? ' -Recurse' : '';
	return `powershell -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $path='${literalPath}'; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force${recurseFlag} }"`;
}

function buildWindowsSizeCommand(path: string): string {
	const literalPath = path.replace(/'/g, "''");
	return `powershell -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $path='${literalPath}'; if (Test-Path -LiteralPath $path -PathType Container) { $sum=(Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum; if ($null -eq $sum) { [Int64]0 } else { [Int64]$sum } } elseif (Test-Path -LiteralPath $path -PathType Leaf) { [Int64](Get-Item -LiteralPath $path).Length } else { throw 'Path not found' }"`;
}

function buildPosixSizeCommand(path: string): string {
	const quotedPath = quotePosixShellArg(path);
	return `p=${quotedPath}; if [ -d "$p" ]; then size=''; if command -v du >/dev/null 2>&1; then size=$(du -sb -- "$p" 2>/dev/null | awk 'NR==1 {print $1; exit}'); if [ -z "$size" ]; then size=$(du -sk -- "$p" 2>/dev/null | awk 'NR==1 {printf "%.0f\\n", $1 * 1024; exit}'); fi; fi; if [ -z "$size" ]; then size=$(find "$p" -type f -printf '%s\\n' 2>/dev/null | awk '{s += $1} END {printf "%.0f\\n", s + 0}'); fi; printf '%s\\n' "$size"; elif [ -f "$p" ] || [ -L "$p" ]; then stat -c '%s' -- "$p"; else echo 'Path not found' >&2; exit 2; fi`;
}

function buildPosixHumanSizeCommand(path: string): string {
	const quotedPath = quotePosixShellArg(path);
	return `du -sh -- ${quotedPath} 2>/dev/null | awk 'NR==1 {print $1; exit}'`;
}

function buildPosixFastDirectoryListCommand(path: string): string {
	const quotedPath = quotePosixShellArg(path);
	return `LC_ALL=C find ${quotedPath} -mindepth 1 -maxdepth 1 -printf '%f\\0%y\\0%s\\0%T@\\0'`;
}

function parseSizeCommandOutput(output: string): number {
	const match = output.trim().match(/\d+/);
	if (!match) {
		throw new Error(`Unable to parse path size: ${output.trim() || 'empty output'}`);
	}
	const size = Number(match[0]);
	if (!Number.isFinite(size)) {
		throw new Error(`Invalid path size: ${match[0]}`);
	}
	return size;
}

function buildPosixDeleteCommand(path: string, recursive: boolean): string {
	const quotedPath = quotePosixShellArg(path);
	const removeCommand = recursive ? `rm -rf -- ${quotedPath}` : `rm -f -- ${quotedPath}`;
	return `if [ -e ${quotedPath} ] || [ -L ${quotedPath} ]; then ${removeCommand}; fi`;
}

function getMimeType(path: string): string {
	const lower = path.toLowerCase();
	if (lower.endsWith('.png')) {
		return 'image/png';
	}
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
		return 'image/jpeg';
	}
	if (lower.endsWith('.gif')) {
		return 'image/gif';
	}
	if (lower.endsWith('.webp')) {
		return 'image/webp';
	}
	if (lower.endsWith('.bmp')) {
		return 'image/bmp';
	}
	if (lower.endsWith('.svg')) {
		return 'image/svg+xml';
	}
	if (lower.endsWith('.json')) {
		return 'application/json';
	}
	if (lower.endsWith('.html') || lower.endsWith('.htm')) {
		return 'text/html';
	}
	if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.log') || lower.endsWith('.csv') || lower.endsWith('.xml') || lower.endsWith('.yaml') || lower.endsWith('.yml')) {
		return 'text/plain';
	}
	return 'application/octet-stream';
}

function clampPositiveInt(value: number | undefined): number {
	if (!Number.isFinite(value) || !value || value < 0) {
		return 0;
	}
	return Math.max(0, Math.round(value));
}

function clampQuality(value: number | undefined): number {
	if (!Number.isFinite(value) || !value) {
		return 82;
	}
	return Math.min(95, Math.max(1, Math.round(value)));
}

function shouldKeepOriginalImageSize(size: IImageSize | undefined, targetWidth: number, targetHeight: number): boolean {
	if (!targetWidth && !targetHeight) {
		return true;
	}
	if (!size?.width || !size.height) {
		return false;
	}
	const widthRatio = targetWidth ? targetWidth / size.width : 1;
	const heightRatio = targetHeight ? targetHeight / size.height : 1;
	const ratio = Math.min(widthRatio, heightRatio, 1);
	return Number.isFinite(ratio) && ratio >= 1;
}

function buildImageGeometry(width: number, height: number): string {
	if (width > 0 && height > 0) {
		return `${width}x${height}>`;
	}
	if (width > 0) {
		return `${width}x${width}>`;
	}
	if (height > 0) {
		return `${height}x${height}>`;
	}
	return '';
}

function looksLikeWindowsPath(path: string): boolean {
	return /^[A-Za-z]:[\\/]/.test(path);
}

function getImageSize(buffer: Buffer): IImageSize | undefined {
	const bmpSize = getBmpImageSize(buffer);
	if (bmpSize) {
		return bmpSize;
	}
	try {
		const image = nativeImage.createFromBuffer(buffer);
		if (image.isEmpty()) {
			return undefined;
		}
		const size = image.getSize();
		if (!size.width || !size.height) {
			return undefined;
		}
		return {
			width: size.width,
			height: size.height
		};
	} catch {
		return undefined;
	}
}

function getBmpImageSize(buffer: Buffer): IImageSize | undefined {
	if (buffer.length < 30 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
		return undefined;
	}
	const headerSize = buffer.readUInt32LE(14);
	if (headerSize < 12) {
		return undefined;
	}
	try {
		if (headerSize === 12) {
			const width = buffer.readUInt16LE(18);
			const height = buffer.readUInt16LE(20);
			return width && height ? { width, height } : undefined;
		}
		if (buffer.length < 26) {
			return undefined;
		}
		const width = Math.abs(buffer.readInt32LE(18));
		const height = Math.abs(buffer.readInt32LE(22));
		return width && height ? { width, height } : undefined;
	} catch {
		return undefined;
	}
}

function tryCreateBmpPngVariant(buffer: Buffer, targetWidth: number, targetHeight: number): IImageBufferResult | undefined {
	const decoded = decodeBmpPixels(buffer);
	if (!decoded) {
		return undefined;
	}

	const outputSize = getResizedImageSize(decoded.width, decoded.height, targetWidth, targetHeight);
	const png = encodeBmpPixelsToPng(decoded, outputSize.width, outputSize.height);
	return {
		buffer: png,
		mime: 'image/png',
		width: outputSize.width,
		height: outputSize.height
	};
}

function getResizedImageSize(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): IImageSize {
	if (!targetWidth && !targetHeight) {
		return { width: sourceWidth, height: sourceHeight };
	}

	let width = targetWidth;
	let height = targetHeight;
	if (!width) {
		width = Math.max(1, Math.round(sourceWidth * (height / sourceHeight)));
	}
	if (!height) {
		height = Math.max(1, Math.round(sourceHeight * (width / sourceWidth)));
	}

	const ratio = Math.min(width / sourceWidth, height / sourceHeight, 1);
	if (!Number.isFinite(ratio) || ratio <= 0) {
		return { width: sourceWidth, height: sourceHeight };
	}
	return {
		width: Math.max(1, Math.round(sourceWidth * ratio)),
		height: Math.max(1, Math.round(sourceHeight * ratio))
	};
}

interface IBmpDecodedImage {
	readonly buffer: Buffer;
	readonly pixelOffset: number;
	readonly width: number;
	readonly height: number;
	readonly bytesPerPixel: number;
	readonly rowStride: number;
	readonly topDown: boolean;
}

function decodeBmpPixels(buffer: Buffer): IBmpDecodedImage | undefined {
	if (buffer.length < 54 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
		return undefined;
	}

	const pixelOffset = buffer.readUInt32LE(10);
	const headerSize = buffer.readUInt32LE(14);
	if (headerSize < 40 || pixelOffset >= buffer.length) {
		return undefined;
	}

	const rawWidth = buffer.readInt32LE(18);
	const rawHeight = buffer.readInt32LE(22);
	const planes = buffer.readUInt16LE(26);
	const bitsPerPixel = buffer.readUInt16LE(28);
	const compression = buffer.readUInt32LE(30);
	if (planes !== 1 || compression !== 0 || (bitsPerPixel !== 24 && bitsPerPixel !== 32)) {
		return undefined;
	}

	const width = Math.abs(rawWidth);
	const height = Math.abs(rawHeight);
	if (!width || !height) {
		return undefined;
	}

	const bytesPerPixel = bitsPerPixel / 8;
	const rowStride = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
	if (pixelOffset + rowStride * height > buffer.length) {
		return undefined;
	}

	return {
		buffer,
		pixelOffset,
		width,
		height,
		bytesPerPixel,
		rowStride,
		topDown: rawHeight < 0
	};
}

function encodeBmpPixelsToPng(image: IBmpDecodedImage, outputWidth: number, outputHeight: number): Buffer {
	const bytesPerRow = outputWidth * 3;
	const raw = Buffer.alloc((bytesPerRow + 1) * outputHeight);
	for (let y = 0; y < outputHeight; y++) {
		const rowStart = y * (bytesPerRow + 1);
		raw[rowStart] = 0;
		const sourceY = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / outputHeight));
		const bmpY = image.topDown ? sourceY : image.height - 1 - sourceY;
		const bmpRowStart = image.pixelOffset + bmpY * image.rowStride;
		for (let x = 0; x < outputWidth; x++) {
			const sourceX = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / outputWidth));
			const bmpPixel = bmpRowStart + sourceX * image.bytesPerPixel;
			const outputPixel = rowStart + 1 + x * 3;
			raw[outputPixel] = image.buffer[bmpPixel + 2];
			raw[outputPixel + 1] = image.buffer[bmpPixel + 1];
			raw[outputPixel + 2] = image.buffer[bmpPixel];
		}
	}

	return encodePngRgb(outputWidth, outputHeight, raw);
}

function encodePngRgb(width: number, height: number, rawRgbRows: Buffer): Buffer {
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;
	return Buffer.concat([
		signature,
		createPngChunk('IHDR', ihdr),
		createPngChunk('IDAT', deflateSync(rawRgbRows, { level: 1 })),
		createPngChunk('IEND', Buffer.alloc(0))
	]);
}

function createPngChunk(type: string, data: Buffer): Buffer {
	const typeBuffer = Buffer.from(type, 'ascii');
	const chunk = Buffer.alloc(12 + data.length);
	chunk.writeUInt32BE(data.length, 0);
	typeBuffer.copy(chunk, 4);
	data.copy(chunk, 8);
	const crc = pngCrc32(Buffer.concat([typeBuffer, data]));
	chunk.writeUInt32BE(crc, 8 + data.length);
	return chunk;
}

let pngCrcTable: Uint32Array | undefined;

function pngCrc32(buffer: Buffer): number {
	const table = getPngCrcTable();
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function getPngCrcTable(): Uint32Array {
	if (pngCrcTable) {
		return pngCrcTable;
	}
	const table = new Uint32Array(256);
	for (let index = 0; index < table.length; index++) {
		let value = index;
		for (let bit = 0; bit < 8; bit++) {
			value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value >>> 0;
	}
	pngCrcTable = table;
	return table;
}

function assertImageBuffer(buffer: Buffer, mime: string): void {
	if (!buffer.byteLength) {
		throw new Error('Remote thumbnail command returned empty output.');
	}
	if (isProbablyImageBuffer(buffer, mime)) {
		return;
	}
	throw new Error('Remote thumbnail command did not return a decodable image.');
}

function isProbablyImageBuffer(buffer: Buffer, mime: string): boolean {
	if (mime === 'image/jpeg') {
		return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
	}
	if (mime === 'image/png') {
		return buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;
	}
	if (mime === 'image/webp') {
		return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
	}
	if (mime === 'image/gif') {
		return buffer.length >= 6 && (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a');
	}
	return !!getImageSize(buffer);
}

function getDefaultArchivePath(path: string, extension: 'zip' | 'tar.gz'): string {
	return `${path}.${extension}`;
}

function getDefaultExtractDirectory(path: string): string {
	const name = getTransferName(stripArchiveExtension(path)) || 'archive';
	return joinRemotePath(getRemoteParentPath(path), name);
}

function stripArchiveExtension(path: string): string {
	const lower = path.toLowerCase();
	for (const extension of ['.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.zip', '.tar']) {
		if (lower.endsWith(extension)) {
			return path.substring(0, path.length - extension.length);
		}
	}
	return path;
}

function isZipPath(path: string): boolean {
	return path.toLowerCase().endsWith('.zip');
}

function formatBytes(size: number): string {
	if (size < 1024) {
		return `${size} B`;
	}
	const kb = size / 1024;
	if (kb < 1024) {
		return `${kb.toFixed(1)} KB`;
	}
	const mb = kb / 1024;
	if (mb < 1024) {
		return `${mb.toFixed(1)} MB`;
	}
	return `${(mb / 1024).toFixed(1)} GB`;
}

function formatHumanSize(size: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	let value = Number(size);
	if (!Number.isFinite(value)) {
		return `${size} bytes`;
	}
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	return `${value.toFixed(2)} ${units[unitIndex]}`;
}

async function getAvailableLocalDirectory(path: string): Promise<string> {
	let candidate = path;
	for (let index = 0; index < 100; index++) {
		try {
			const stat = await fsp.stat(candidate);
			if (stat.isDirectory()) {
				return candidate;
			}
			candidate = `${path}_extracted${index ? index : ''}`;
		} catch {
			return candidate;
		}
	}
	return `${path}_extracted`;
}

async function getLocalPathSize(path: string): Promise<number> {
	const stat = await fsp.stat(path);
	if (!stat.isDirectory()) {
		return stat.size;
	}

	const entries = await fsp.readdir(path, { withFileTypes: true });
	const sizes = await mapLimit(entries, LOCAL_DIRECTORY_STAT_CONCURRENCY, async entry => {
		const childPath = join(path, entry.name);
		if (entry.isDirectory() || entry.isFile()) {
			return getLocalPathSize(childPath);
		}
		return 0;
	});
	return sizes.reduce((total, size) => total + size, 0);
}

async function getLocalPathTransferSize(path: string, expectedBytes?: number): Promise<number> {
	if (expectedBytes && expectedBytes > 0) {
		return expectedBytes;
	}
	return getLocalPathSize(path);
}

function compareFileEntries(a: ITurboFileFileEntry, b: ITurboFileFileEntry): number {
	if (a.type === 'directory' && b.type !== 'directory') {
		return -1;
	}
	if (a.type !== 'directory' && b.type === 'directory') {
		return 1;
	}
	return FILE_ENTRY_NAME_COLLATOR.compare(a.name, b.name);
}

function createFastDirectoryEntryStats(type: TurboFileFileType, size: number, mtime: number): ISFTPStats {
	return {
		size,
		mtime,
		isDirectory: () => type === 'directory',
		isFile: () => type === 'file',
		isSymbolicLink: () => type === 'symlink'
	};
}
