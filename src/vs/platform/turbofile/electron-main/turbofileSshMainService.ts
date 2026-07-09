/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConnectConfig } from 'ssh2';
import { createReadStream, createWriteStream, existsSync, promises as fsp } from 'fs';
import { basename, dirname, join } from 'node:path';
import { networkInterfaces, platform, tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { connect as connectTcp, Socket } from 'node:net';
import { deflateSync } from 'node:zlib';
import { app, BrowserWindow, clipboard, nativeImage, protocol } from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { ITurboFileBatchTransferFailure, ITurboFileBatchTransferItem, ITurboFileBatchTransferRequest, ITurboFileBatchTransferResult, ITurboFileDependencyInstallResult, ITurboFileDirectoryListing, ITurboFileEntryStat, ITurboFileFileEntry, ITurboFileFileOperationResult, ITurboFileImageBatchEntry, ITurboFileImageResourceOptions, ITurboFileImageResourceResult, ITurboFilePathSizeResult, ITurboFileReadFileOptions, ITurboFileReadFileResult, ITurboFileReadImageOptions, ITurboFileRemoteCapabilities, ITurboFileRemoteCapabilitiesResult, ITurboFileSshConnectionOptions, ITurboFileSshConnectionResult, ITurboFileSshService, ITurboFileSshTerminalSession, ITurboFileStartWindowsDragRequest, ITurboFileStartWindowsDragResult, ITurboFileTransferAttempt, ITurboFileTransferEndpoint, ITurboFileTransferProgressEvent, ITurboFileTransferRequest, ITurboFileTransferResult, ITurboFileWindowsClipboardFilesResult, TurboFileContentEncoding, TurboFileFileType, TurboFileTransferAttemptProtocol, TurboFileTransferDependency, TurboFileTransferProtocol } from '../common/turbofile.js';
import { resolveTerminalEncoding } from '../../../base/node/terminalEncoding.js';
import { buildTurboFileRemoteExtractCommand, isTurboFileTarFamilyArchivePath } from '../common/turbofileArchiveExtract.js';
import { createLocalBatchTarPlans, createTarNullListBuffer, requiresLocalTarSafeRootAlias } from '../common/turbofileBatchTarPlan.js';
import { shouldRetryRemoteDirectoryRead } from '../common/turbofileRemoteDirectoryRetry.js';
import { createPosixNativeBatchTransferPlan } from '../common/turbofileRemoteNativeBatchPlan.js';
import { buildPosixStatEntriesCommand as buildRemotePosixStatEntriesCommand } from '../common/turbofileRemoteStat.js';
import { withTurboFileTimeout } from '../common/turbofileTimeout.js';
import { resolveTransferPlan } from '../common/turbofileTransferPlan.js';
import { createWindowsDragFakeDirectoryName, createWindowsShellAssociationChangedScript, normalizeWindowsCopyHookDestination, TURBOFILE_WINDOWS_DRAG_ACTIVE_DIR, TURBOFILE_WINDOWS_DRAG_APP_DIR, TURBOFILE_WINDOWS_DRAG_ROOT_DIR, TURBOFILE_WINDOWS_DRAG_TARGETS_DIR } from '../common/turbofileWindowsDrag.js';
import { normalizeWindowsTransferPaths } from '../common/turbofileWindowsPath.js';

const DEFAULT_READ_LIMIT = 10 * 1024 * 1024;
const DEFAULT_IMAGE_SOURCE_LIMIT = 128 * 1024 * 1024;
const REMOTE_IMAGE_TOOL_CACHE_TTL_MS = 5 * 60 * 1000;
// Large source images can need 10-20s for ImageMagick to decode and downscale over SSH; a short
// budget aborts them before any bytes flow. The common case still returns in well under a second.
const REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS = 25000;
// Max concurrent SSH image reads (remote thumbnail transforms + downloads). The image grid renders
// cards as <img src="turbofile-image://">, and Chromium fetches every visible card at once. Dozens
// of simultaneous `client.exec` calls on one SSH connection blow past the server's MaxSessions
// limit and every command fails with "Unable to exec", so the whole grid stays on generic icons.
// A small global cap keeps thumbnail generation under that ceiling (leaving channels free for
// directory/SFTP work) while still loading several images in parallel.
const SSH_IMAGE_READ_MAX_CONCURRENCY = 6;
const REMOTE_DIRECTORY_READ_TIMEOUT_MS = 8000;
// Fast `find`-based listing is bounded by silence (no output) rather than total duration so large
// directories that legitimately take many seconds to enumerate still load instead of being killed.
const REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS = 12000;
const REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS = 120000;
const REMOTE_DIRECT_READ_MAX_BYTES = 2 * 1024 * 1024;
const REMOTE_DIRECT_READ_CHUNK_BYTES = 256 * 1024;
// Per-file cap for the one-shot image batch read. Files above this stream their bytes individually
// (and may be server-downscaled) so a single huge image cannot blow up the batched buffer.
const IMAGE_BATCH_MAX_FILE_BYTES = 24 * 1024 * 1024;
const SMALL_IMAGE_DIM_LIMIT = 100;
const WINDOWS_DRAG_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const RAW_BMP_FAST_PATH_BYTES = 2 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_VERSION = 1;
const IMAGE_THUMBNAIL_CACHE_MAX_BYTES = 512 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const TURBOFILE_IMAGE_RESOURCE_SCHEME = 'turbofile-image';
const IMAGE_RESOURCE_TTL_MS = 10 * 60 * 1000;
const IMAGE_RESOURCE_CLEANUP_INTERVAL_MS = 60 * 1000;
const WINDOWS_DRAG_COPY_HOOK_TIMEOUT_MS = 45000;
const WINDOWS_DRAG_COPY_HOOK_POLL_MS = 50;
const TURBOFILE_WINDOWS_DRAG_COPY_HOOK_CLSID = '{D650A1FA-43C6-4B8F-8C83-80B028353F64}';
const TRANSFER_CANCELED_MESSAGE = 'Transfer canceled.';
const REMOTE_DIRECTORY_SFTP_IDLE_MS = 5 * 60 * 1000;
const REMOTE_DIRECTORY_LISTING_CACHE_TTL_MS = 30 * 1000;
const REMOTE_DIRECTORY_LISTING_CACHE_MAX_ENTRIES = 256;
const SFTP_TRANSFER_CONCURRENCY = 32;
const SFTP_TRANSFER_CHUNK_SIZE = 256 * 1024;
const SFTP_LARGE_FILE_THRESHOLD = 512 * 1024 * 1024;
const SFTP_LARGE_TRANSFER_CONCURRENCY = 32;
const SFTP_LARGE_TRANSFER_CHUNK_SIZE = 256 * 1024;
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
const BATCH_TRANSFER_WORKERS = 16;
const BATCH_TRANSFER_DIRECTORY_WORKERS = 4;
const REMOTE_NATIVE_DIRECTORY_COPY_PROGRESS_BYTES_PER_SECOND = 470 * 1024 * 1024;
const RSYNC_RELAY_BIND_HOST = '127.0.0.1';
const SSH_TERMINAL_READY_MARKER = '__TURBOFILE_TERMINAL_READY__';
const DIRECT_SSH_CONNECT_TIMEOUT_MS = 5 * 1000;
const DIRECT_SSH_ROUTE_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const DIRECT_SSH_ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const DIRECT_TRANSFER_STALL_TIMEOUT_MS = 10 * 1000;
const DIRECT_TRANSFER_STALL_CHECK_INTERVAL_MS = 1000;
const LOCAL_RSYNC_STALL_TIMEOUT_MS = 10 * 60 * 1000;
const TRANSFER_PROGRESS_EVENT_INTERVAL_MS = 500;
const LOCAL_WINDOWS_REVERSE_RSYNC_MIN_SPLIT_ENTRIES = 6;
const LOCAL_PARALLEL_TAR_CHUNK_COUNT = 12;
const LOCAL_PARALLEL_TAR_MIN_ENTRIES = 8;
const LOCAL_PARALLEL_TAR_CHUNK_RETRIES = 2;
const LOCAL_TAR_ZSTD_LEVEL = 3;
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
	createReadStream?(path: string, options?: { readonly highWaterMark?: number }): NodeJS.ReadableStream;
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

interface ITarBatchPlan {
	readonly parentPath: string;
	readonly names: readonly string[];
	readonly targetNames: readonly string[];
	readonly requiresSafeParentPath?: boolean;
}

interface ITransferProgressSnapshot {
	lastAt: number;
	lastBytes: number;
}

interface IRsyncTimingState {
	clientStartedAt?: number;
	serviceStartedAt: number;
	lastMarkAt: number;
	firstProgressEventSeen: boolean;
	visibleTransferEventSeen: boolean;
	firstPositiveBytesSeen: boolean;
}

interface IRemoteExecOptions {
	readonly onStdout?: (chunk: string) => void;
	readonly onStderr?: (chunk: string) => void;
	readonly timeoutMs?: number;
	readonly inactivityTimeoutMs?: number;
	readonly inactivityMessage?: string;
	readonly getActivityTime?: () => number | undefined;
	/**
	 * When set, cancelling this transfer forcibly closes the exec channel. Closing the channel makes
	 * the remote sshd send SIGHUP to the command, so a direct SSH→SSH `tar | ssh …` pipeline is truly
	 * killed on the servers instead of being orphaned and left running after the user cancels.
	 */
	readonly progressId?: string;
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
	readonly originalWidth?: number;
	readonly originalHeight?: number;
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
	readonly originalWidth?: number;
	readonly originalHeight?: number;
	readonly createdAt: number;
}

type TurboFileDirectSshRoute = 'source-push' | 'target-pull';

interface IRemoteScpCredential {
	readonly identityPath?: string;
	readonly cleanupCommand?: string;
}

interface ILocalRsyncTool {
	readonly executable: string;
	readonly sshExecutable?: string;
	readonly pathFlavor: 'cygwin' | 'posix';
	readonly env: NodeJS.ProcessEnv;
}

interface IRsyncProgressSnapshot {
	readonly bytes?: number;
	readonly percent?: number;
	readonly speedBytesPerSecond?: number;
	readonly toCheck?: number;
	readonly totalChecks?: number;
	readonly transferIndex?: number;
}

type ITransferProgressEventExtra = Partial<Omit<ITurboFileTransferProgressEvent, 'progressId' | 'transferredBytes' | 'totalBytes' | 'phase' | 'detail'>>;

interface IRsyncProgressReporter {
	readonly handleOutput: (chunk: string) => void;
	readonly reportProgress: (transferredBytes: number, force?: boolean, toCheck?: number, totalChecks?: number, transferIndex?: number, percent?: number, speedBytesPerSecond?: number) => void;
	readonly getLastBytes: () => number;
	readonly getActivityTime: () => number | undefined;
	/**
	 * Publish the known byte total so the UI shows a size (and a real percentage) while rsync is
	 * still building its file list and has not emitted any transferred bytes yet. The total is
	 * computed concurrently on the Node side, mirroring how the tar path fills its denominator.
	 */
	readonly setTotalBytes: (totalBytes: number) => void;
}

interface ILocalSshTool {
	readonly executable: string;
	readonly env: NodeJS.ProcessEnv;
}

interface ILocalZstdTool {
	readonly executable: string;
	readonly env: NodeJS.ProcessEnv;
}

interface ILocalWindowsReverseRsyncItem {
	readonly sourcePath: string;
	readonly targetPath: string;
	readonly directory: boolean;
	readonly name: string;
}

interface ILocalTarChunk {
	readonly listPath: string;
	readonly entryCount: number;
}

interface ITurboFileImageResourceDescriptor {
	readonly endpoint: ITurboFileTransferEndpoint;
	readonly options: ITurboFileImageResourceOptions;
	readonly createdAt: number;
	expiresAt: number;
}

export class TurboFileSshMainService implements ITurboFileSshService {
	declare readonly _serviceBrand: undefined;

	private static imageProtocolRegistered = false;
	private static imageProtocolService: TurboFileSshMainService | undefined;

	private nativeRequire: NodeRequire | undefined;
	private terminalSessionSequence = 1;
	private readonly terminalSessions = new Map<string, ITurboFileSshTerminalMainSession>();
	private readonly transferProgressEmitters = new Map<string, Emitter<ITurboFileTransferProgressEvent>>();
	private readonly transferProgressSnapshots = new Map<string, ITransferProgressSnapshot>();
	private readonly transferDataStartTimes = new Map<string, number>();
	private readonly transferFirstPositiveProgressTimes = new Map<string, number>();
	private readonly transferGrowthMonitoredProgressIds = new Set<string>();
	private readonly rsyncTimingStates = new Map<string, IRsyncTimingState>();
	private readonly transferCancellationRequests = new Set<string>();
	private readonly transferCancelHandlers = new Map<string, Set<() => void>>();
	private readonly directorySftpSessions = new Map<string, Promise<IRemoteDirectorySftpSession>>();
	private readonly directorySftpIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly remoteDirectoryListingCache = new Map<string, { expiresAt: number; listing: ITurboFileDirectoryListing }>();
	private readonly remoteImageToolCache = new Map<string, { checkedAt: number; tool: 'magick' | 'convert' | undefined }>();
	private readonly remoteImageToolPending = new Map<string, Promise<'magick' | 'convert' | undefined>>();
	private readonly directSshRouteCache = new Map<string, { readonly routes: readonly TurboFileDirectSshRoute[]; readonly expiresAt: number }>();
	private readonly directSshRouteFailureCooldowns = new Map<string, number>();
	private readonly remoteRsyncSshBinaryCache = new Map<string, string>();
	private localWindowsRsyncSourceConnectionPromise: Promise<ITurboFileSshConnectionOptions | undefined> | undefined;
	private imageThumbnailCacheTrimPromise: Promise<void> | undefined;
	private readonly imageResourceDescriptors = new Map<string, ITurboFileImageResourceDescriptor>();
	private imageResourceCleanupTimer: ReturnType<typeof setInterval> | undefined;
	private windowsDragCopyHookRegistrationPromise: Promise<void> | undefined;
	// Caps concurrent SSH image reads. The image grid renders cards as <img src="turbofile-image://">,
	// and Chromium fetches every visible card at once — dozens of simultaneous `client.exec` calls on
	// one SSH connection blow past the server's MaxSessions limit and every command fails with
	// "Unable to exec". A small global limit keeps thumbnail generation under that ceiling (leaving
	// channels free for directory/SFTP work) while still loading several images in parallel.
	private imageReadActiveCount = 0;
	private readonly imageReadWaiters: Array<() => void> = [];

	constructor() {
		this.ensureTurboFileImageProtocolRegistered();
		// A freshly-registered CopyHook handler is not picked up by the already-running Explorer
		// until Explorer reloads (WinSCP documents the same: its dragext needs a logoff/restart to
		// load). Prepare the handler eagerly at startup so the very first drag-to-Windows works,
		// instead of failing once and only working after a manual retry.
		if (platform() === 'win32') {
			void this.ensureWindowsDragCopyHookRegistered().catch(() => undefined);
		}
	}

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
					tar,
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
		return this.listRemoteDirectoryCore(options, path, refresh, false);
	}

	async listRemoteDirectoryNames(options: ITurboFileSshConnectionOptions, path: string, refresh = false): Promise<ITurboFileDirectoryListing> {
		return this.listRemoteDirectoryCore(options, path, refresh, true);
	}

	private async listRemoteDirectoryCore(options: ITurboFileSshConnectionOptions, path: string, refresh: boolean, namesOnly: boolean): Promise<ITurboFileDirectoryListing> {
		const cacheKey = this.getRemoteDirectoryListingCacheKey(options, path);
		if (!refresh) {
			// A full (size+date) cached listing satisfies a names-only request too, but not vice versa:
			// only reuse a cached entry that has real attributes when the caller asked names-only.
			const cached = this.getRemoteDirectoryListingCache(cacheKey);
			if (cached && (namesOnly || this.remoteListingHasAttributes(cached))) {
				return cached;
			}
		}

		const configResult = await this.createConnectConfig(options);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		let lastError: unknown;
		for (let attempt = 0; attempt < 2; attempt++) {
			const session = await this.getDirectorySftpSession(options, configResult.config);
			try {
				const listing = await this.readRemoteDirectoryWithFallback(session.sftp, session.client, options, path, namesOnly);
				this.touchDirectorySftpSession(session.key);
				return this.createRemoteDirectoryListingResult(options, path, cacheKey, namesOnly, listing);
			} catch (error) {
				lastError = error;
				this.remoteDirectoryListingCache.delete(cacheKey);
				this.disposeDirectorySftpSession(session.key);
				if (attempt === 0 && shouldRetryRemoteDirectoryRead(error)) {
					continue;
				}
				throw error;
			}
		}
		throw lastError;
	}

	private createRemoteDirectoryListingResult(options: ITurboFileSshConnectionOptions, requestedPath: string, requestedCacheKey: string, namesOnly: boolean, listing: IRemoteDirectoryReadResult): ITurboFileDirectoryListing {
		const result: ITurboFileDirectoryListing = {
			path: listing.path,
			entries: listing.entries
				.filter(entry => entry.filename !== '.' && entry.filename !== '..')
				.map(entry => this.toRemoteEntry(listing.path, entry))
				.sort(compareFileEntries)
		};
		// Only cache full listings: a names-only listing has zeroed size/date and must not shadow a
		// later full listing (it is cheap to recompute and gets enriched lazily on the client side).
		if (!namesOnly) {
			this.setRemoteDirectoryListingCache(this.getRemoteDirectoryListingCacheKey(options, listing.path), result);
			if (listing.path === requestedPath) {
				this.setRemoteDirectoryListingCache(requestedCacheKey, result);
			}
		}
		return result;
	}

	private remoteListingHasAttributes(listing: ITurboFileDirectoryListing): boolean {
		// A names-only listing zeroes every size and modified time; a real listing almost always has at
		// least one non-zero. Treat an all-zero listing as attribute-less so a names-only result that
		// somehow reached the cache never satisfies a request that needs sizes.
		return listing.entries.some(entry => entry.size > 0 || entry.modified > 0);
	}

	async statRemoteEntries(options: ITurboFileSshConnectionOptions, directoryPath: string, names: readonly string[]): Promise<ITurboFileEntryStat[]> {
		const uniqueNames = [...new Set(names.filter(name => !!name && name !== '.' && name !== '..'))];
		if (!uniqueNames.length) {
			return [];
		}
		if (looksLikeWindowsPath(directoryPath)) {
			return [];
		}

		const configResult = await this.createConnectConfig(options);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		const session = await this.getDirectorySftpSession(options, configResult.config);
		try {
			const output = await this.execRemoteBytes(session.client, buildPosixStatEntriesCommand(directoryPath, uniqueNames), {
				inactivityTimeoutMs: REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS,
				timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS
			});
			this.touchDirectorySftpSession(session.key);
			const stats = parseRemoteStatEntries(output.toString('utf8'));
			return stats.length ? stats : await this.statRemoteEntriesWithSftpFallback(session.sftp, directoryPath, uniqueNames);
		} catch {
			return this.statRemoteEntriesWithSftpFallback(session.sftp, directoryPath, uniqueNames);
		}
	}

	private async statRemoteEntriesWithSftpFallback(sftp: ISFTPWrapper, directoryPath: string, names: readonly string[]): Promise<ITurboFileEntryStat[]> {
		const stats = await mapLimit(names, SFTP_DIRECTORY_ENTRY_CONCURRENCY, async name => {
			try {
				const stat = await this.remoteStat(sftp, joinRemotePath(directoryPath, name));
				return {
					name,
					size: stat.size,
					modified: stat.mtime * 1000
				};
			} catch {
				return undefined;
			}
		});
		return stats.filter((stat): stat is ITurboFileEntryStat => !!stat);
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

	async listLocalDirectoryNames(path: string, _refresh = false): Promise<ITurboFileDirectoryListing> {
		const dirents = await fsp.readdir(path, { withFileTypes: true });
		const visibleNames = await getWindowsExplorerVisibleLocalNames(path);
		const entries = dirents
			.filter(dirent => !visibleNames || visibleNames.has(dirent.name))
			.map(dirent => {
				const type: TurboFileFileType = dirent.isDirectory() ? 'directory' : dirent.isFile() ? 'file' : dirent.isSymbolicLink() ? 'symlink' : 'unknown';
				return {
					name: dirent.name,
					path: join(path, dirent.name),
					type,
					size: 0,
					modified: 0
				};
			});

		return {
			path,
			entries: entries.sort(compareFileEntries)
		};
	}

	async statLocalEntries(directoryPath: string, names: readonly string[]): Promise<ITurboFileEntryStat[]> {
		const uniqueNames = Array.from(new Set(names.filter(name => !!name)));
		const stats = await mapLimit(uniqueNames, LOCAL_DIRECTORY_STAT_CONCURRENCY, async name => {
			try {
				const stat = await fsp.lstat(join(directoryPath, name));
				return {
					name,
					size: stat.size,
					modified: stat.mtimeMs
				};
			} catch {
				return undefined;
			}
		});
		return stats.filter((stat): stat is ITurboFileEntryStat => !!stat);
	}

	async normalizeLocalWindowsPaths(paths: readonly string[]): Promise<string[]> {
		return normalizeWindowsTransferPaths(paths, resolveLocalWindowsRealPath);
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
				if (stat.isDirectory()) {
					if (shouldPreferTarForMultiItemTransfer(request.target.preferredProtocol)) {
						const tarResult = await this.tryLocalToSshTarTransfer(request, bytes, startedAt);
						if (tarResult?.ok) {
							this.clearRemoteDirectoryListingCache(request.target);
							return tarResult;
						}
						throw new Error('Tar upload unavailable for directory transfer.');
					}
					if (request.target.preferredProtocol !== 'sftp') {
						const commandOrder = getDirectoryLocalCommandTransferProtocolOrder(request.target.preferredProtocol);
						const commandResult = await this.tryLocalToSshCommandTransfer(request, bytes, startedAt, commandOrder, false);
						if (commandResult?.ok) {
							this.clearRemoteDirectoryListingCache(request.target);
							return commandResult;
						}
					}
				} else {
					const commandResult = await this.tryLocalToSshCommandTransfer(request, bytes, startedAt);
					if (commandResult?.ok) {
						this.clearRemoteDirectoryListingCache(request.target);
						return commandResult;
					}
				}
				this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing SFTP upload.', true, { strategy: 'sftp-upload' });
				let transferredBytes = 0;
				const onDelta = (delta: number): void => {
					this.throwIfTransferCanceled(request.progressId);
					transferredBytes += delta;
					this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Uploading over SFTP.', false, { strategy: 'sftp-upload' });
				};
				const onTotal = (totalBytes: number): void => {
					bytes = Math.max(bytes, totalBytes);
					this.fireTransferProgress(request, Math.min(transferredBytes, bytes), bytes, 'transfer', 'Uploading over SFTP.', true, { strategy: 'sftp-upload' });
				};
				if (stat.isDirectory()) {
					this.fireTransferProgress(request, 0, bytes, 'transfer', 'Scanning and uploading directory over SFTP.', true, { strategy: 'sftp-upload' });
					await this.uploadDirectoryConcurrent(request.target, request.source.path, request.target.path, onTotal, onDelta, request.progressId);
				} else {
					await this.withSftp(request.target, async sftp => {
						this.throwIfTransferCanceled(request.progressId);
						await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
						await this.fastPutWithFallback(sftp, request.source.path, request.target.path, bytes, onDelta, request.progressId);
					}, request.progressId);
				}
				this.throwIfTransferCanceled(request.progressId);
				await this.verifySshUploadSize(request.target, stat.isDirectory() ? 0 : bytes, 'SFTP upload');
				this.fireTransferProgress(request, bytes, bytes, 'complete', 'SFTP upload completed.', true, { strategy: 'sftp-upload' });
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
				if (sourceType === 'directory') {
					if (shouldPreferTarForMultiItemTransfer(request.source.preferredProtocol)) {
						const tarResult = await this.trySshToLocalTarTransfer(request, bytes, startedAt);
						if (tarResult?.ok) {
							return tarResult;
						}
						throw new Error('Tar download unavailable for directory transfer.');
					}
					if (request.source.preferredProtocol !== 'sftp') {
						const commandOrder = getDirectoryLocalCommandTransferProtocolOrder(request.source.preferredProtocol);
						const commandResult = await this.trySshToLocalCommandTransfer(request, bytes, startedAt, commandOrder);
						if (commandResult?.ok) {
							return commandResult;
						}
					}
				} else {
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
					this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Downloading over SFTP.', false, { strategy: 'sftp-download' });
				};
				const onTotal = (totalBytes: number): void => {
					bytes = Math.max(bytes, totalBytes);
					this.fireTransferProgress(request, Math.min(transferredBytes, bytes), bytes, 'transfer', 'Downloading over SFTP.', true, { strategy: 'sftp-download' });
				};
				if (sourceType === 'directory') {
					this.fireTransferProgress(request, 0, bytes, 'transfer', 'Scanning and downloading directory over SFTP.', true, { strategy: 'sftp-download' });
					await this.downloadDirectoryConcurrent(request.source, request.source.path, request.target.path, onTotal, onDelta, request.progressId);
				} else {
					await this.withSftp(request.source, async sftp => {
						this.throwIfTransferCanceled(request.progressId);
						if (bytes <= 0) {
							bytes = (await this.remoteStat(sftp, request.source.path)).size;
						}
						this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing SFTP download.', true, { strategy: 'sftp-download' });
						await this.fastGetWithFallback(sftp, request.source.path, request.target.path, bytes, onDelta, request.progressId);
					}, request.progressId);
				}
				this.throwIfTransferCanceled(request.progressId);
				this.fireTransferProgress(request, bytes, bytes, 'complete', 'SFTP download completed.', true, { strategy: 'sftp-download' });
				return this.createTransferResult(true, 'sftp-download', bytes, 'SFTP download completed.', startedAt, request.progressId);
			}

			if (request.source.kind === 'ssh' && request.target.kind === 'ssh') {
				return await this.transferBetweenSshDevices(request, startedAt);
			}

			throw new Error('Unsupported transfer endpoint combination.');
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

	private async transferBetweenSshDevices(request: ITurboFileTransferRequest, startedAt: number): Promise<ITurboFileTransferResult> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh') {
			throw new Error('SSH-to-SSH transfer requires SSH endpoints.');
		}

		const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown' as TurboFileFileType);
		const effectiveRequest: ITurboFileTransferRequest = { ...request, sourceType };
		const plan = resolveTransferPlan({
			source: effectiveRequest.source,
			target: effectiveRequest.target,
			sourceType,
			itemCount: 1,
			strategyHint: effectiveRequest.strategyHint
		});
		const failedStrategy = transferAttemptToStrategy(plan.attempts[0]);
		const failures: string[] = [];

		if (request.strategyHint !== 'relay') {
			const sameRemoteResult = await this.trySameRemoteCopy(effectiveRequest, startedAt);
			this.throwIfTransferCanceled(request.progressId);
			if (sameRemoteResult?.ok) {
				this.fireTransferProgress(request, sameRemoteResult.bytes, sameRemoteResult.bytes, 'complete', 'Remote copy completed.', true, { strategy: sameRemoteResult.strategy });
				this.clearRemoteDirectoryListingCache(request.target);
				return sameRemoteResult;
			}
		}

		for (const [index, attempt] of plan.attempts.entries()) {
			try {
				this.fireTransferProgress(request, 0, attempt.protocol === 'rsync' ? 0 : Math.max(0, request.expectedBytes ?? 0), attempt.route === 'relay' ? 'relay-upload' : 'transfer', `Starting ${attempt.protocol} ${attempt.route} transfer.`, true, {
					strategy: transferAttemptToStrategy(attempt),
					route: attempt.route === 'relay' ? 'relay' : undefined
				});
				const directResult = await this.trySshToSshTransferAttempt(attempt, effectiveRequest, startedAt);
				this.throwIfTransferCanceled(request.progressId);
				if (directResult?.ok) {
					this.fireTransferProgress(request, directResult.bytes, directResult.bytes, 'complete', `${formatTransferStrategyName(directResult.strategy)} completed.`, true, { strategy: directResult.strategy });
					this.clearRemoteDirectoryListingCache(request.target);
					return directResult;
				}
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				const failure = `${attempt.protocol} ${attempt.route}: ${formatTransferError(error)}`;
				failures.push(failure);
				const nextAttempt = plan.attempts[index + 1];
				if (nextAttempt) {
					this.fireTransferProgress(request, 0, 0, nextAttempt.route === 'relay' ? 'relay-upload' : 'transfer', `${failure}; falling back to ${nextAttempt.protocol} ${nextAttempt.route}.`, true, {
						strategy: transferAttemptToStrategy(nextAttempt),
						route: nextAttempt.route === 'relay' ? 'relay' : undefined
					});
				}
			}
		}

		return {
			ok: false,
			strategy: failedStrategy,
			bytes: 0,
			message: `Transfer unavailable${failures.length ? `: ${failures.join('; ')}` : '.'}`,
			durationMs: Date.now() - startedAt
		};
	}

	private async trySshToSshTransferAttempt(attempt: ITurboFileTransferAttempt, request: ITurboFileTransferRequest, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (attempt.route === 'direct') {
			return this.trySshToSshDirectTransfer(attempt.protocol, request, startedAt);
		}
		if (attempt.route === 'relay') {
			return this.trySshToSshRelayTransfer(attempt.protocol, request, startedAt);
		}
		return undefined;
	}

	private async trySshToSshDirectTransfer(protocol: TurboFileTransferAttemptProtocol, request: ITurboFileTransferRequest, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		switch (protocol) {
			case 'rsync':
				return this.tryDirectRsyncTransfer(request, startedAt, true);
			case 'tar':
				return this.tryDirectTarTransfer(request, startedAt, true);
			case 'sftp':
				return this.tryDirectSftpTransfer(request, startedAt, true);
			case 'scp':
			default:
				return this.tryDirectScpTransfer(request, startedAt, true);
		}
	}

	private async trySshToSshRelayTransfer(protocol: TurboFileTransferAttemptProtocol, request: ITurboFileTransferRequest, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		switch (protocol) {
			case 'rsync':
				return this.tryTunneledRsyncRelayTransfer(request, startedAt, true);
			case 'tar':
				return this.tryTarRelayTransfer(request, startedAt, true);
			case 'sftp':
				return await this.tryStreamRelayTransfer(request, startedAt, true) ?? await this.runSftpRelayTransfer(request, startedAt, true);
			case 'scp':
			default:
				return this.tryScpRelayTransfer(request, startedAt, true);
		}
	}

	async tryLocalToSshReverseParallelRsyncUpload(request: ITurboFileTransferRequest, bytes: number, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (platform() !== 'win32' || request.source.kind !== 'local' || request.target.kind !== 'ssh' || !request.target.connection) {
			return undefined;
		}
		if (request.target.supportsRsync !== true || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}

		try {
			const sourceStat = await fsp.stat(request.source.path);
			if (!sourceStat.isDirectory()) {
				return undefined;
			}

			const sourceConnection = await this.resolveLocalWindowsRsyncSourceConnection();
			if (!sourceConnection) {
				return undefined;
			}

			const remoteTargetDirectory = trimTrailingRemoteSlash(request.target.path);
			if (!remoteTargetDirectory || remoteTargetDirectory === '/') {
				return undefined;
			}

			const items = await this.createLocalWindowsReverseRsyncItems(request.source.path, remoteTargetDirectory);
			if (items.length < 2) {
				return undefined;
			}

			this.fireTransferProgress(request, 0, 0, 'transfer', 'Starting parallel rsync target pull.', true, {
				strategy: 'rsync-direct-parallel',
				route: 'target-pull',
				completedItems: 0,
				totalItems: items.length,
				currentName: items[0].name
			});

			const targetConfigResult = await this.createConnectConfig(request.target.connection);
			if (!targetConfigResult.ok) {
				return undefined;
			}

			const client = await this.connect(targetConfigResult.config);
			const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
			let lastActivityAt = Date.now();
			try {
				const progress = this.createParallelRsyncProgressReporter(request, 0, 'rsync-direct', 'Parallel rsync target pull in progress.', {
					strategy: 'rsync-direct-parallel',
					route: 'target-pull',
					completedItems: 0,
					totalItems: items.length
				}, () => {
					lastActivityAt = Date.now();
				});
				const handleProgressOutput = (chunk: string): void => {
					progress.handleOutput(chunk);
					lastActivityAt = progress.getActivityTime() ?? lastActivityAt;
				};

				const sshBinary = await this.resolveRemoteRsyncSshBinary(client, request.target.connection);
				const sshTransport = buildOptimizedRsyncSshCommand(sourceConnection.port || 22, !!sourceConnection.password, sshBinary);
				const command = buildLocalWindowsReverseParallelRsyncCommand(sourceConnection, items, sshTransport, [remoteTargetDirectory]);
				this.throwIfTransferCanceled(request.progressId);
				await this.execRemote(client, command, {
					onStdout: handleProgressOutput,
					onStderr: handleProgressOutput,
					inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
					inactivityMessage: `Parallel rsync target pull produced no transfer progress for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
					getActivityTime: () => progress.getActivityTime() ?? lastActivityAt
				});
				this.throwIfTransferCanceled(request.progressId);

				const resultBytes = progress.getLastBytes() || bytes;
				this.fireTransferProgress(request, resultBytes, 0, 'complete', 'Parallel rsync target pull completed.', true, {
					strategy: 'rsync-direct-parallel',
					route: 'target-pull',
					completedItems: items.length,
					totalItems: items.length
				});
				return this.createTransferResult(true, 'rsync-direct-parallel', resultBytes, 'Parallel rsync target pull completed.', startedAt, request.progressId);
			} finally {
				unregisterCancel();
				client.end();
			}
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			return undefined;
		}
	}

	private async createLocalWindowsReverseRsyncItems(localDirectory: string, remoteTargetDirectory: string): Promise<ILocalWindowsReverseRsyncItem[]> {
		const rootSourcePath = trimTrailingRemoteSlash(toRsyncLocalPath(localDirectory));
		const rootEntries = await this.readLocalRsyncSplitEntries(localDirectory);
		if (!rootEntries.length) {
			return [];
		}

		if (rootEntries.length === 1 && rootEntries[0].directory) {
			const childLocalDirectory = join(localDirectory, rootEntries[0].name);
			const childEntries = await this.readLocalRsyncSplitEntries(childLocalDirectory).catch(() => []);
			if (childEntries.length >= LOCAL_WINDOWS_REVERSE_RSYNC_MIN_SPLIT_ENTRIES) {
				return childEntries.map(entry => {
					const relativePath = `${rootEntries[0].name}/${entry.name}`;
					return {
						name: relativePath,
						directory: entry.directory,
						sourcePath: joinRemotePath(rootSourcePath, relativePath),
						targetPath: joinRemotePath(remoteTargetDirectory, relativePath)
					};
				});
			}
		}

		if (rootEntries.length < LOCAL_WINDOWS_REVERSE_RSYNC_MIN_SPLIT_ENTRIES) {
			return [{
				name: getTransferName(localDirectory),
				directory: true,
				sourcePath: rootSourcePath,
				targetPath: remoteTargetDirectory
			}];
		}

		return rootEntries.map(entry => ({
			name: entry.name,
			directory: entry.directory,
			sourcePath: joinRemotePath(rootSourcePath, entry.name),
			targetPath: joinRemotePath(remoteTargetDirectory, entry.name)
		}));
	}

	private async readLocalRsyncSplitEntries(localDirectory: string): Promise<Array<{ readonly name: string; readonly directory: boolean }>> {
		const entries = await fsp.readdir(localDirectory, { withFileTypes: true });
		return entries
			.filter(entry => entry.isDirectory() || entry.isFile())
			.map(entry => ({ name: entry.name, directory: entry.isDirectory() }))
			.sort((a, b) => FILE_ENTRY_NAME_COLLATOR.compare(a.name, b.name));
	}

	async tryLocalToSshReverseParallelRsyncBatchUpload(request: ITurboFileBatchTransferRequest, batchItems: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move', bytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult | undefined> {
		if (platform() !== 'win32' || request.source.kind !== 'local' || request.targetDirectory.kind !== 'ssh' || !request.targetDirectory.connection) {
			return undefined;
		}
		if (request.targetDirectory.supportsRsync !== true || looksLikeWindowsPath(request.targetDirectory.path)) {
			return undefined;
		}
		if (request.targetDirectory.preferredProtocol !== 'rsync') {
			return undefined;
		}
		if (!canBatchRsyncPreserveTargetNames(batchItems)) {
			return undefined;
		}

		try {
			const sourceConnection = await this.resolveLocalWindowsRsyncSourceConnection();
			if (!sourceConnection) {
				return undefined;
			}

			const remoteTargetDirectory = trimTrailingRemoteSlash(request.targetDirectory.path);
			if (!remoteTargetDirectory || remoteTargetDirectory === '/') {
				return undefined;
			}

			const cleanupTargets = new Set<string>();
			const rsyncItems: ILocalWindowsReverseRsyncItem[] = [];
			let hasDirectory = false;
			for (const item of batchItems) {
				const stat = await fsp.stat(item.sourcePath).catch(() => undefined);
				if (!stat) {
					return undefined;
				}
				const targetPath = joinRemotePath(remoteTargetDirectory, item.targetName);
				cleanupTargets.add(targetPath);
				if (stat.isDirectory()) {
					hasDirectory = true;
					const splitItems = await this.createLocalWindowsReverseRsyncItems(item.sourcePath, targetPath);
					if (splitItems.length) {
						rsyncItems.push(...splitItems);
					} else {
						rsyncItems.push({
							name: item.displayName ?? item.targetName,
							directory: true,
							sourcePath: trimTrailingRemoteSlash(toRsyncLocalPath(item.sourcePath)),
							targetPath
						});
					}
				} else if (stat.isFile()) {
					rsyncItems.push({
						name: item.displayName ?? item.targetName,
						directory: false,
						sourcePath: trimTrailingRemoteSlash(toRsyncLocalPath(item.sourcePath)),
						targetPath
					});
				}
			}
			if (!rsyncItems.length || (!hasDirectory && batchItems.length <= 1)) {
				return undefined;
			}

			this.fireTransferProgress(request, 0, 0, 'transfer', 'Starting parallel rsync target pull.', true, {
				strategy: 'rsync-direct-parallel',
				route: 'target-pull',
				completedItems: 0,
				totalItems: batchItems.length,
				currentName: batchItems[0].displayName ?? batchItems[0].targetName
			});

			const targetConfigResult = await this.createConnectConfig(request.targetDirectory.connection);
			if (!targetConfigResult.ok) {
				return undefined;
			}

			const client = await this.connect(targetConfigResult.config);
			const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
			let lastActivityAt = Date.now();
			try {
				const progress = this.createParallelRsyncProgressReporter(request, 0, 'rsync-direct', 'Parallel rsync target pull in progress.', {
					strategy: 'rsync-direct-parallel',
					route: 'target-pull',
					completedItems: 0,
					totalItems: batchItems.length
				}, () => {
					lastActivityAt = Date.now();
				});
				const handleProgressOutput = (chunk: string): void => {
					progress.handleOutput(chunk);
					lastActivityAt = progress.getActivityTime() ?? lastActivityAt;
				};

				const sshBinary = await this.resolveRemoteRsyncSshBinary(client, request.targetDirectory.connection);
				const sshTransport = buildOptimizedRsyncSshCommand(sourceConnection.port || 22, !!sourceConnection.password, sshBinary);
				const command = buildLocalWindowsReverseParallelRsyncCommand(sourceConnection, rsyncItems, sshTransport, [...cleanupTargets]);
				this.throwIfTransferCanceled(request.progressId);
				await this.execRemote(client, command, {
					onStdout: handleProgressOutput,
					onStderr: handleProgressOutput,
					inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
					inactivityMessage: `Parallel rsync target pull produced no transfer progress for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
					getActivityTime: () => progress.getActivityTime() ?? lastActivityAt
				});
				this.throwIfTransferCanceled(request.progressId);

				const cleanupFailures = operation === 'move' ? await this.deleteBatchSources(request.source, batchItems) : [];
				const resultBytes = progress.getLastBytes() || bytes;
				this.fireTransferProgress(request, resultBytes, 0, 'complete', 'Parallel rsync target pull completed.', true, {
					strategy: 'rsync-direct-parallel',
					route: 'target-pull',
					completedItems: batchItems.length,
					totalItems: batchItems.length
				});
				this.clearRemoteDirectoryListingCache(request.targetDirectory);
				return this.createBatchTransferResult(cleanupFailures.length === 0, 'rsync-direct-parallel', resultBytes, cleanupFailures.length ? `Parallel rsync completed, but source cleanup failed for ${cleanupFailures.length} item(s).` : 'Parallel rsync completed.', batchItems.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
			} finally {
				unregisterCancel();
				client.end();
			}
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			return undefined;
		}
	}

	private async resolveLocalWindowsRsyncSourceConnection(): Promise<ITurboFileSshConnectionOptions | undefined> {
		this.localWindowsRsyncSourceConnectionPromise ??= this.doResolveLocalWindowsRsyncSourceConnection();
		return this.localWindowsRsyncSourceConnectionPromise;
	}

	private async doResolveLocalWindowsRsyncSourceConnection(): Promise<ITurboFileSshConnectionOptions | undefined> {
		const localAddresses = getLocalIpv4Addresses();
		if (!localAddresses.size) {
			return undefined;
		}

		for (const configPath of getLocalWindowsRsyncConfigPaths()) {
			try {
				const raw = JSON.parse(await fsp.readFile(configPath, 'utf8')) as unknown;
				const config = asRecord(raw);
				const servers = asRecord(config?.servers);
				if (!servers) {
					continue;
				}
				for (const [id, value] of Object.entries(servers)) {
					const server = asRecord(value);
					if (!server || readStringProperty(server, 'os_type') !== 'windows') {
						continue;
					}
					const host = readStringProperty(server, 'host') || id;
					if (!localAddresses.has(host)) {
						continue;
					}
					const username = readStringProperty(server, 'user');
					const password = readStringProperty(server, 'password');
					if (!username || !password) {
						continue;
					}
					return {
						host,
						port: readNumberProperty(server, 'port') || 22,
						username,
						password
					};
				}
			} catch {
				// Optional compatibility config; absence simply means this fast route is unavailable.
			}
		}

		return undefined;
	}

	private async tryLocalToSshCommandTransfer(request: ITurboFileTransferRequest, bytes: number, startedAt: number, protocolOrder?: Array<'scp' | 'rsync'>, verifyUploadSize = true): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'local' || request.target.kind !== 'ssh' || !request.target.connection) {
			return undefined;
		}

		for (const protocol of protocolOrder ?? getLocalCommandTransferProtocolOrder(request.target.preferredProtocol, request.target.connection)) {
			this.throwIfTransferCanceled(request.progressId);
			try {
				if (protocol === 'rsync') {
					const initialTotalBytes = Math.max(0, bytes);
					this.fireTransferProgress(request, 0, initialTotalBytes, 'transfer', 'Uploading over local rsync.', true, { strategy: 'rsync-upload' });
					const progress = this.createRsyncProgressReporter(request, initialTotalBytes, 'transfer', 'Uploading over local rsync.', { strategy: 'rsync-upload' });
					// Show the size from the first second by computing it concurrently with rsync's scan.
					if (initialTotalBytes <= 0) {
						void getLocalPathSize(request.source.path).then(total => progress.setTotalBytes(total)).catch(() => undefined);
					}
					await this.runLocalRsyncUpload(request, bytes, progress.handleOutput);
					const resultBytes = progress.getLastBytes() || bytes;
					await this.verifySshUploadSize(request.target, 0, 'Local rsync upload');
					this.fireTransferProgress(request, resultBytes, 0, 'complete', 'Local rsync upload completed.', true, { strategy: 'rsync-upload' });
					return this.createTransferResult(true, 'rsync-upload', resultBytes, 'Local rsync upload completed.', startedAt, request.progressId);
				}
				this.fireTransferProgress(request, 0, bytes, 'transfer', 'Uploading over local SCP.', true, { strategy: 'scp-upload' });
				await this.runLocalScpUpload(request, bytes, transferredBytes => {
					this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Uploading over local SCP.', false, { strategy: 'scp-upload' });
				});
				await this.verifySshUploadSize(request.target, verifyUploadSize ? bytes : 0, 'Local SCP upload');
				this.fireTransferProgress(request, bytes, bytes, 'complete', 'Local SCP upload completed.', true, { strategy: 'scp-upload' });
				return this.createTransferResult(true, 'scp-upload', bytes, 'Local SCP upload completed.', startedAt, request.progressId);
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				if (!isRecoverableLocalCommandTransferError(error)) {
					return undefined;
				}
				this.clearTransferDataTiming(request.progressId);
			}
		}
		return undefined;
	}

	private async trySshToLocalCommandTransfer(request: ITurboFileTransferRequest, bytes: number, startedAt: number, protocolOrder?: Array<'scp' | 'rsync'>): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'local' || !request.source.connection) {
			return undefined;
		}

		for (const protocol of protocolOrder ?? getLocalCommandTransferProtocolOrder(request.source.preferredProtocol, request.source.connection)) {
			this.throwIfTransferCanceled(request.progressId);
			try {
				if (protocol === 'rsync') {
					const initialTotalBytes = Math.max(0, bytes);
					this.fireTransferProgress(request, 0, initialTotalBytes, 'transfer', 'Downloading over local rsync.', true, { strategy: 'rsync-download' });
					const progress = this.createRsyncProgressReporter(request, initialTotalBytes, 'transfer', 'Downloading over local rsync.', { strategy: 'rsync-download' });
					// Show the size from the first second by computing it concurrently with rsync's scan.
					if (initialTotalBytes <= 0) {
						void this.getRemotePathContentSizeByCommand(request.source).then(total => progress.setTotalBytes(total)).catch(() => undefined);
					}
					await this.runLocalRsyncDownload(request, bytes, progress.handleOutput);
					const resultBytes = progress.getLastBytes() || bytes;
					this.fireTransferProgress(request, resultBytes, 0, 'complete', 'Local rsync download completed.', true, { strategy: 'rsync-download' });
					return this.createTransferResult(true, 'rsync-download', resultBytes, 'Local rsync download completed.', startedAt, request.progressId);
				}
				this.fireTransferProgress(request, 0, bytes, 'transfer', 'Downloading over local SCP.', true, { strategy: 'scp-download' });
				await this.runLocalScpDownload(request, bytes, delta => {
					this.fireTransferProgress(request, delta, bytes, 'transfer', 'Downloading over local SCP.', false, { strategy: 'scp-download' });
				});
				this.fireTransferProgress(request, bytes, bytes, 'complete', 'Local SCP download completed.', true, { strategy: 'scp-download' });
				return this.createTransferResult(true, 'scp-download', bytes, 'Local SCP download completed.', startedAt, request.progressId);
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				if (!isRecoverableLocalCommandTransferError(error)) {
					return undefined;
				}
				this.clearTransferDataTiming(request.progressId);
			}
		}
		return undefined;
	}

	private async verifySshUploadSize(target: ITurboFileTransferEndpoint, expectedBytes: number, label: string): Promise<void> {
		if (target.kind !== 'ssh' || expectedBytes <= 0) {
			return;
		}
		const actualBytes = await this.getRemotePathContentSizeByCommand(target);
		if (actualBytes === expectedBytes) {
			return;
		}
		await this.deletePath(target, true).catch(() => undefined);
		throw new Error(`${label} size mismatch: expected ${expectedBytes}, got ${actualBytes}.`);
	}

	private async tryLocalToSshTarTransfer(request: ITurboFileTransferRequest, expectedBytes: number, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'local' || request.target.kind !== 'ssh' || !request.target.connection) {
			return undefined;
		}
		if (!shouldPreferTarForMultiItemTransfer(request.target.preferredProtocol)) {
			return undefined;
		}
		if (request.target.supportsTar === false || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}

		try {
			const stat = await fsp.stat(request.source.path);
			if (!stat.isDirectory()) {
				return undefined;
			}
			let bytes = Math.max(0, expectedBytes);
			// Compute the byte total concurrently with the remote prep + transfer instead of blocking
			// the start on a full directory scan. The progress denominator fills in as soon as the
			// scan resolves (well before the first byte flows), so the display stays scp-like.
			const sizePromise = bytes <= 0 ? getLocalPathSize(request.source.path).catch(() => 0) : undefined;

			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing tar upload.', true, { strategy: 'tar-upload' });
			let archiveBytes = 0;
			const onArchiveDelta = (delta: number): void => {
				this.throwIfTransferCanceled(request.progressId);
				archiveBytes += Math.max(0, delta);
				this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, 'transfer', 'Tar upload in progress.', false, { strategy: 'tar-upload' });
			};
			if (sizePromise) {
				void sizePromise.then(total => {
					if (total > bytes) {
						bytes = total;
						this.fireTransferProgress(request, Math.min(archiveBytes, bytes), bytes, 'transfer', 'Tar upload in progress.', true, { strategy: 'tar-upload' });
					}
				});
			}
			this.markTransferDataStarted(request.progressId);
			await this.runLocalDirectoryTarUpload(request.source.path, request.target, request.progressId, onArchiveDelta);
			this.throwIfTransferCanceled(request.progressId);
			// Do NOT block completion on the size computation. The tar pipe already fails loudly
			// (non-zero exit on either side) on a truncated archive, so the streamed archive byte count
			// is an accurate completion size. Awaiting the local-size walk here (only needed for the live
			// denominator) can add seconds on a cold cache while it contends with tar's own reads, which
			// showed up as the bar sitting at 100% before the task finally ended. We only fall back to a
			// remote size scan when neither the known total nor the streamed bytes are available.
			const resultBytes = bytes > 0 ? bytes : (archiveBytes > 0 ? archiveBytes : await this.getRemotePathContentSizeByCommand(request.target).catch(() => 0));
			this.fireTransferProgress(request, resultBytes, resultBytes, 'complete', 'Tar upload completed.', true, { strategy: 'tar-upload' });
			return this.createTransferResult(true, 'tar-upload', resultBytes, 'Tar upload completed.', startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			this.clearTransferDataTiming(request.progressId);
			return undefined;
		}
	}

	private async trySshToLocalTarTransfer(request: ITurboFileTransferRequest, expectedBytes: number, startedAt: number): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'local' || !request.source.connection) {
			return undefined;
		}
		if (!shouldPreferTarForMultiItemTransfer(request.source.preferredProtocol)) {
			return undefined;
		}
		if (request.source.supportsTar === false || looksLikeWindowsPath(request.source.path)) {
			return undefined;
		}

		try {
			const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown' as TurboFileFileType);
			if (sourceType !== 'directory') {
				return undefined;
			}
			let bytes = Math.max(0, expectedBytes);
			// Run the remote `du` concurrently with the local target prep + transfer rather than
			// blocking the start on it (a remote scan of many files on a loaded host can take
			// seconds). The denominator fills in as soon as it resolves, keeping the scp-like display.
			const sizePromise = bytes <= 0 ? this.getRemotePathContentSizeByCommand(request.source).catch(() => 0) : undefined;

			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing tar download.', true, { strategy: 'tar-download' });
			await ensureLocalDirectoryTransferTargetAvailable(request.target.path);
			let archiveBytes = 0;
			const onArchiveDelta = (delta: number): void => {
				this.throwIfTransferCanceled(request.progressId);
				archiveBytes += Math.max(0, delta);
				this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, 'transfer', 'Tar download in progress.', false, { strategy: 'tar-download' });
			};
			if (sizePromise) {
				void sizePromise.then(total => {
					if (total > bytes) {
						bytes = total;
						this.fireTransferProgress(request, Math.min(archiveBytes, bytes), bytes, 'transfer', 'Tar download in progress.', true, { strategy: 'tar-download' });
					}
				});
			}
			this.markTransferDataStarted(request.progressId);
			await this.runRemoteDirectoryTarDownload(request.source, request.target.path, request.progressId, onArchiveDelta);
			this.throwIfTransferCanceled(request.progressId);
			if (sizePromise) {
				bytes = Math.max(bytes, await sizePromise);
			}
			// See the upload path: the tar pipe already errors out on a truncated archive, so when the
			// byte total is known we skip the post-transfer local rescan. `getLocalPathSize` recursively
			// stats every extracted file, which on a cold NTFS metadata cache takes tens of seconds for a
			// 30k-file tree — the "finished but still spinning" delay on the first transfer. Only scan
			// when the total is unknown so the completion size is still populated.
			const resultBytes = bytes > 0 ? bytes : await getLocalPathSize(request.target.path).catch(() => 0);
			this.fireTransferProgress(request, resultBytes, resultBytes, 'complete', 'Tar download completed.', true, { strategy: 'tar-download' });
			return this.createTransferResult(true, 'tar-download', resultBytes, 'Tar download completed.', startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			this.clearTransferDataTiming(request.progressId);
			return undefined;
		}
	}

	private async runLocalDirectoryTarUpload(localDirectory: string, target: ITurboFileTransferEndpoint, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		if (target.kind !== 'ssh' || !target.connection) {
			throw new Error('Missing SSH target.');
		}
		const localTarRoot = await this.createLocalTarRootAliasIfNeeded(localDirectory);
		try {
			try {
				await this.runParallelLocalDirectoryTarUpload(localTarRoot.path, target.connection, buildPrepareTarExtractToExactDirectoryCommand(target.path), buildTarExtractStreamToDirectoryCommand(target.path), progressId, onArchiveDelta);
				return;
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				// Parallel raw tar|ssh has no remote zstd dependency and is the stable default fast path.
			}
			try {
				await this.runParallelLocalDirectoryTarZstdUpload(localTarRoot.path, target.connection, buildPrepareTarZstdExtractToExactDirectoryCommand(target.path), buildTarZstdExtractToDirectoryCommand(target.path), progressId, onArchiveDelta);
				return;
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				// Parallel tar+zstd+ssh is the measured fast path. If unavailable, try single native tar|ssh.
			}
			try {
				await this.runNativeLocalTarUpload(['-cf', '-', '-C', localTarRoot.path, '.'], target.connection, buildTarExtractToExactDirectoryCommand(target.path), progressId, onArchiveDelta);
				return;
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				throw new Error(`Native tar upload failed: ${formatTransferError(error)}`);
			}
		} finally {
			await localTarRoot.dispose();
		}
	}

	private async runRemoteDirectoryTarDownload(source: ITurboFileTransferEndpoint, localDirectory: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		if (source.kind !== 'ssh' || !source.connection) {
			throw new Error('Missing SSH source.');
		}
		try {
			await this.runNativeLocalTarDownload(source.connection, buildTarCreateFromDirectoryCommand(source.path), ['-xf', '-', '-C', localDirectory], progressId, onArchiveDelta);
			return;
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			// Native ssh|tar is the fast path. If it is unavailable, fall back to the ssh2 stream path.
		}
		const configResult = await this.createConnectConfig(source.connection);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}

		let client: ISSHClient | undefined;
		let tarProcess: ReturnType<typeof spawn> | undefined;
		const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
			tarProcess?.kill();
			client?.end();
		});
		try {
			client = await this.connect(configResult.config);
			const sourceStream = await this.openRemoteCommandStream(client, buildTarCreateFromDirectoryCommand(source.path), 'tar download create');
			tarProcess = spawn('tar.exe', [...await this.getLocalTarCharsetArgs(), '-xf', '-', '-C', localDirectory], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
			if (!tarProcess.stdin || !tarProcess.stdout) {
				throw new Error('Local tar download did not provide pipes.');
			}
			tarProcess.stdout.resume();
			const tarClose = waitForLocalProcessClose(tarProcess, 'local tar download');
			await pipeline(sourceStream.stream as unknown as NodeJS.ReadableStream, createProgressPassThrough(onArchiveDelta), tarProcess.stdin);
			await sourceStream.close;
			await tarClose;
		} finally {
			unregisterCancel();
			client?.end();
		}
	}

	private async createLocalTarRootAliasIfNeeded(localRoot: string, force = false): Promise<{ readonly path: string; readonly dispose: () => Promise<void> }> {
		if (platform() !== 'win32' || !(force || requiresLocalTarSafeRootAlias(localRoot))) {
			return {
				path: localRoot,
				dispose: async () => undefined
			};
		}

		const tempRoot = join(tmpdir(), `turbofile-tar-root-${randomUUID()}`);
		const aliasPath = join(tempRoot, 'root');
		try {
			await fsp.mkdir(tempRoot, { recursive: true });
			await fsp.symlink(localRoot, aliasPath, 'junction');
		} catch (error) {
			await fsp.rmdir(aliasPath).catch(() => undefined);
			await fsp.rmdir(tempRoot).catch(() => undefined);
			throw error;
		}

		return {
			path: aliasPath,
			dispose: async () => {
				await fsp.rmdir(aliasPath).catch(() => undefined);
				await fsp.rmdir(tempRoot).catch(() => undefined);
			}
		};
	}

	private async runNativeLocalTarUpload(tarArgs: string[], connection: ITurboFileSshConnectionOptions, remoteCommand: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		const tool = await resolveLocalSshTool();
		await withNativeOpenSshArgs(connection, tool, remoteCommand, async (sshArgs, env) => {
			let tarProcess: ReturnType<typeof spawn> | undefined;
			let sshProcess: ReturnType<typeof spawn> | undefined;
			const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
				if (tarProcess) {
					killLocalProcessTree(tarProcess);
				}
				if (sshProcess) {
					killLocalProcessTree(sshProcess);
				}
			});
			try {
				tarProcess = spawn('tar.exe', [...await this.getLocalTarCharsetArgs(), ...tarArgs], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
				sshProcess = spawn(tool.executable, sshArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env });
				sshProcess.stdout?.resume();
				if (!tarProcess.stdout || !sshProcess.stdin) {
					throw new Error('Native tar upload did not provide required pipes.');
				}
				const tarClose = waitForLocalProcessClose(tarProcess, 'native tar upload create');
				const sshClose = waitForLocalProcessClose(sshProcess, 'native tar upload extract');
				await pipeline(tarProcess.stdout, createProgressPassThrough(onArchiveDelta), sshProcess.stdin);
				await tarClose;
				await sshClose;
			} finally {
				unregisterCancel();
			}
		});
	}

	private async runNativeLocalTarDownload(connection: ITurboFileSshConnectionOptions, remoteCommand: string, tarArgs: string[], progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		const tool = await resolveLocalSshTool();
		await withNativeOpenSshArgs(connection, tool, remoteCommand, async (sshArgs, env) => {
			let sshProcess: ReturnType<typeof spawn> | undefined;
			let tarProcess: ReturnType<typeof spawn> | undefined;
			const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
				if (sshProcess) {
					killLocalProcessTree(sshProcess);
				}
				if (tarProcess) {
					killLocalProcessTree(tarProcess);
				}
			});
			try {
				sshProcess = spawn(tool.executable, sshArgs, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
				tarProcess = spawn('tar.exe', [...await this.getLocalTarCharsetArgs(), ...tarArgs], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
				tarProcess.stdout?.resume();
				if (!sshProcess.stdout || !tarProcess.stdin) {
					throw new Error('Native tar download did not provide required pipes.');
				}
				const sshClose = waitForLocalProcessClose(sshProcess, 'native tar download create');
				const tarClose = waitForLocalProcessClose(tarProcess, 'native tar download extract');
				await pipeline(sshProcess.stdout, createProgressPassThrough(onArchiveDelta), tarProcess.stdin);
				await sshClose;
				await tarClose;
			} finally {
				unregisterCancel();
			}
		});
	}

	private async runParallelLocalDirectoryTarUpload(localDirectory: string, connection: ITurboFileSshConnectionOptions, prepareRemoteCommand: string, extractRemoteCommand: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		// Kick off the remote target preparation over its own ssh connection *concurrently* with the
		// local tree walk, so its handshake overlaps the collection instead of adding a serial ~1s
		// round trip before any byte is sent.
		const sshTool = await resolveLocalSshTool();
		const preparePromise = this.runNativeSshCommand(connection, sshTool, prepareRemoteCommand, progressId);
		let entries: readonly string[];
		try {
			entries = await this.collectLocalTarRelativeEntries(localDirectory);
		} catch (error) {
			await preparePromise.catch(() => undefined);
			throw error;
		}
		if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
			await preparePromise.catch(() => undefined);
			throw new Error('Not enough entries for parallel tar upload.');
		}
		await this.runParallelLocalTarUpload(localDirectory, entries, connection, undefined, extractRemoteCommand, progressId, onArchiveDelta, preparePromise);
	}

	private async runParallelLocalDirectoryTarZstdUpload(localDirectory: string, connection: ITurboFileSshConnectionOptions, prepareRemoteCommand: string, extractRemoteCommand: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		const sshTool = await resolveLocalSshTool();
		const preparePromise = this.runNativeSshCommand(connection, sshTool, prepareRemoteCommand, progressId);
		let entries: readonly string[];
		try {
			entries = await this.collectLocalTarRelativeEntries(localDirectory);
		} catch (error) {
			await preparePromise.catch(() => undefined);
			throw error;
		}
		if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
			await preparePromise.catch(() => undefined);
			throw new Error('Not enough entries for parallel tar+zstd upload.');
		}
		await this.runParallelLocalTarZstdUpload(localDirectory, entries, connection, undefined, extractRemoteCommand, progressId, onArchiveDelta, preparePromise);
	}

	private async runParallelLocalBatchTarUpload(plan: ITarBatchPlan, connection: ITurboFileSshConnectionOptions, targetDirectory: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		// Prepare the remote target concurrently with the local tree walk so its ssh round trip
		// overlaps the collection rather than adding a serial delay before the first byte.
		const preparePromise = this.prepareRemoteBatchTarTarget(connection, targetDirectory, plan.targetNames, progressId, false);
		let entries: readonly string[];
		try {
			entries = await this.collectLocalTarRelativeEntries(plan.parentPath, plan.names);
		} catch (error) {
			await preparePromise.catch(() => undefined);
			throw error;
		}
		if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
			await preparePromise.catch(() => undefined);
			throw new Error('Not enough entries for parallel batch tar upload.');
		}
		await this.runParallelLocalTarUpload(
			plan.parentPath,
			entries,
			connection,
			undefined,
			buildTarExtractStreamToDirectoryCommand(targetDirectory),
			progressId,
			onArchiveDelta,
			preparePromise
		);
	}

	private async runParallelLocalBatchTarZstdUpload(plan: ITarBatchPlan, connection: ITurboFileSshConnectionOptions, targetDirectory: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		const preparePromise = this.prepareRemoteBatchTarTarget(connection, targetDirectory, plan.targetNames, progressId, true);
		let entries: readonly string[];
		try {
			entries = await this.collectLocalTarRelativeEntries(plan.parentPath, plan.names);
		} catch (error) {
			await preparePromise.catch(() => undefined);
			throw error;
		}
		if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
			await preparePromise.catch(() => undefined);
			throw new Error('Not enough entries for parallel batch tar+zstd upload.');
		}
		await this.runParallelLocalTarZstdUpload(
			plan.parentPath,
			entries,
			connection,
			undefined,
			buildTarZstdExtractToDirectoryCommand(targetDirectory),
			progressId,
			onArchiveDelta,
			preparePromise
		);
	}

	private async runParallelLocalTarUpload(localRoot: string, entries: readonly string[], connection: ITurboFileSshConnectionOptions, prepareRemoteCommand: string | undefined, extractRemoteCommand: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void, preparePromise?: Promise<void>): Promise<void> {
		const sshTool = await resolveLocalSshTool();
		const tempRoot = join(tmpdir(), `turbofile-tar-${randomUUID()}`);
		await fsp.mkdir(tempRoot, { recursive: true });
		try {
			const chunks = await this.writeLocalTarChunkLists(tempRoot, entries);
			if (chunks.length < 2) {
				throw new Error('Parallel tar upload needs at least two chunks.');
			}
			await this.awaitTarPrepare(connection, sshTool, prepareRemoteCommand, preparePromise, progressId);
			await mapLimit(chunks, chunks.length, chunk => this.runNativeLocalTarUploadChunkWithRetry(localRoot, chunk, connection, sshTool, extractRemoteCommand, progressId, onArchiveDelta));
		} finally {
			await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	private async runParallelLocalTarZstdUpload(localRoot: string, entries: readonly string[], connection: ITurboFileSshConnectionOptions, prepareRemoteCommand: string | undefined, extractRemoteCommand: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void, preparePromise?: Promise<void>): Promise<void> {
		const sshTool = await resolveLocalSshTool();
		const zstdTool = await resolveLocalZstdTool();
		const tempRoot = join(tmpdir(), `turbofile-tar-zstd-${randomUUID()}`);
		await fsp.mkdir(tempRoot, { recursive: true });
		try {
			const chunks = await this.writeLocalTarChunkLists(tempRoot, entries);
			if (chunks.length < 2) {
				throw new Error('Parallel tar upload needs at least two chunks.');
			}
			await this.awaitTarPrepare(connection, sshTool, prepareRemoteCommand, preparePromise, progressId);
			await mapLimit(chunks, chunks.length, chunk => this.runNativeLocalTarZstdUploadChunk(localRoot, chunk, connection, sshTool, zstdTool, extractRemoteCommand, progressId, onArchiveDelta));
		} finally {
			await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	/**
	 * Ensures the remote destination prep (rm+mkdir) is complete before chunk extraction starts.
	 * Callers either pass a `preparePromise` already running concurrently with the local tree walk,
	 * or a `prepareRemoteCommand` string to run here (the batch path prepares its target earlier).
	 */
	private async awaitTarPrepare(connection: ITurboFileSshConnectionOptions, sshTool: ILocalSshTool, prepareRemoteCommand: string | undefined, preparePromise: Promise<void> | undefined, progressId: string | undefined): Promise<void> {
		if (preparePromise) {
			await preparePromise;
			return;
		}
		if (prepareRemoteCommand) {
			await this.runNativeSshCommand(connection, sshTool, prepareRemoteCommand, progressId);
		}
	}

	private async collectLocalTarRelativeEntries(localRoot: string, names?: readonly string[]): Promise<string[]> {
		// Walk concurrently and trust the Dirent type from readdir instead of an extra lstat per
		// entry: the parent readdir already tells us file/dir/symlink, so a 30k-file tree no longer
		// pays 30k serial lstat round trips before the transfer can start.
		const entries: string[] = [];
		const walkDirectory = async (relativeDir: string): Promise<void> => {
			const fullDir = relativeDir ? join(localRoot, ...relativeDir.split('/')) : localRoot;
			const children = await fsp.readdir(fullDir, { withFileTypes: true });
			if (!children.length && relativeDir) {
				entries.push(relativeDir);
				return;
			}
			const subDirectories: string[] = [];
			for (const child of children) {
				const childRelativePath = normalizeTarListPath(relativeDir ? `${relativeDir}/${child.name}` : child.name);
				if (child.isDirectory()) {
					subDirectories.push(childRelativePath);
				} else if (child.isFile() || child.isSymbolicLink()) {
					entries.push(childRelativePath);
				}
			}
			await mapLimit(subDirectories, LOCAL_DIRECTORY_STAT_CONCURRENCY, walkDirectory);
		};

		if (names?.length) {
			await mapLimit(names, LOCAL_DIRECTORY_STAT_CONCURRENCY, async name => {
				const relativePath = normalizeTarListPath(name);
				const stat = await fsp.lstat(join(localRoot, ...relativePath.split('/')));
				if (stat.isDirectory()) {
					await walkDirectory(relativePath);
				} else if (stat.isFile() || stat.isSymbolicLink()) {
					entries.push(relativePath);
				}
			});
		} else {
			await walkDirectory('');
		}
		return entries.sort((a, b) => FILE_ENTRY_NAME_COLLATOR.compare(a, b));
	}

	/**
	 * Pre-walk the local source tree on the Node side and write a null-separated file list so the
	 * bundled cygwin `rsync.exe` can skip its own recursive scan via `--files-from`. cygwin's
	 * per-entry `stat()` is ~10-50× slower than Node's `readdir(... withFileTypes)`, so a directory
	 * of 30k tiny files (the `1024x40` test set) keeps rsync silent for 20+ seconds before the
	 * first byte is sent. Building the list ourselves drops that to well under a second.
	 *
	 * Only runs on Windows (where cygwin's stat is the bottleneck) and only when every item shares
	 * the same parent directory so a single rsync invocation with one source root suffices.
	 * Returns `undefined` to indicate the caller should fall back to the per-item-argument form.
	 */
	private async buildLocalRsyncFastListFile(items: readonly ITurboFileBatchTransferItem[]): Promise<{ readonly listPath: string; readonly sourceBase: string } | undefined> {
		if (platform() !== 'win32' || !items.length) {
			return undefined;
		}
		const sourceBase = dirname(items[0].sourcePath);
		if (!sourceBase || sourceBase === items[0].sourcePath) {
			return undefined;
		}
		for (const item of items) {
			if (dirname(item.sourcePath) !== sourceBase) {
				return undefined;
			}
		}
		let entries: readonly string[];
		try {
			entries = await this.collectLocalTarRelativeEntries(sourceBase, items.map(item => basename(item.sourcePath)));
		} catch {
			return undefined;
		}
		if (!entries.length) {
			return undefined;
		}
		const listPath = join(tmpdir(), `turbofile-rsync-list-${randomUUID()}`);
		try {
			await fsp.writeFile(listPath, createTarNullListBuffer(entries));
		} catch {
			await fsp.rm(listPath, { force: true }).catch(() => undefined);
			return undefined;
		}
		return { listPath, sourceBase };
	}

	private localTarListEncodingPromise: Promise<string> | undefined;

	/**
	 * The bundled Windows `tar.exe` (libarchive bsdtar) reads `-T` list files using the process
	 * ANSI code page, not UTF-8. Writing the list as UTF-8 makes non-ASCII names (e.g. Chinese)
	 * unreadable and aborts the transfer ("Couldn't visit directory: No such file or directory").
	 * Resolve the system code page once so list files are encoded the way bsdtar expects; falls
	 * back to UTF-8 on non-Windows or when detection fails.
	 */
	private async getLocalTarListEncoding(): Promise<string> {
		if (!this.localTarListEncodingPromise) {
			this.localTarListEncodingPromise = (async () => {
				if (platform() !== 'win32') {
					return 'utf8';
				}
				try {
					const encoding = await resolveTerminalEncoding();
					const iconv = await import('@vscode/iconv-lite-umd');
					return iconv.default.encodingExists(encoding) ? encoding : 'utf8';
				} catch {
					return 'utf8';
				}
			})();
		}
		return this.localTarListEncodingPromise;
	}

	private localTarCharsetArgsPromise: Promise<string[]> | undefined;

	/**
	 * Windows `tar.exe` is libarchive `bsdtar`, which interprets archive member names in the process
	 * ANSI code page (e.g. GBK) unless told otherwise. The peer on a transfer is a UTF-8 Linux host
	 * (GNU tar), so without this option non-ASCII names (e.g. Chinese) garble in both directions:
	 * on extract bsdtar reads the remote's raw UTF-8 bytes as GBK, and on create it would emit GBK.
	 * `--options hdrcharset=UTF-8` makes bsdtar read/write archive names as UTF-8 so both ends agree.
	 * The flag is only valid for bsdtar (GNU tar rejects --options and is already UTF-8 native), and
	 * only matters on Windows, so it is emitted just for a detected bsdtar. SSH↔SSH transfers never
	 * touch local tar, which is why they were never affected.
	 */
	private getLocalTarCharsetArgs(): Promise<string[]> {
		if (!this.localTarCharsetArgsPromise) {
			this.localTarCharsetArgsPromise = (async () => {
				if (platform() !== 'win32') {
					return [];
				}
				try {
					const version = await new Promise<string>((resolve, reject) => {
						execFile('tar.exe', ['--version'], { windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout));
					});
					return /bsdtar|libarchive/i.test(version) ? ['--options', 'hdrcharset=UTF-8'] : [];
				} catch {
					return [];
				}
			})();
		}
		return this.localTarCharsetArgsPromise;
	}

	private async createLocalTarListBuffer(entries: readonly string[]): Promise<Buffer> {
		const encoding = await this.getLocalTarListEncoding();
		if (encoding === 'utf8') {
			return createTarNullListBuffer(entries);
		}
		const iconv = await import('@vscode/iconv-lite-umd');
		return Buffer.from(iconv.default.encode(`${entries.join('\0')}\0`, encoding));
	}

	private async writeLocalTarChunkLists(tempRoot: string, entries: readonly string[]): Promise<ILocalTarChunk[]> {
		const chunkCount = Math.min(LOCAL_PARALLEL_TAR_CHUNK_COUNT, entries.length);
		const chunks = Array.from({ length: chunkCount }, () => [] as string[]);
		for (const [index, entry] of entries.entries()) {
			chunks[index % chunkCount].push(entry);
		}
		return Promise.all(chunks
			.filter(chunk => chunk.length > 0)
			.map(async (chunk, index) => {
				const listPath = join(tempRoot, `chunk-${String(index).padStart(2, '0')}.lst`);
				await fsp.writeFile(listPath, await this.createLocalTarListBuffer(chunk));
				return { listPath, entryCount: chunk.length };
			}));
	}

	private async writeLocalTarListFile(tempRoot: string, names: readonly string[]): Promise<string> {
		const listPath = join(tempRoot, 'items.lst');
		await fsp.writeFile(listPath, await this.createLocalTarListBuffer(names.map(name => normalizeTarListPath(name))));
		return listPath;
	}

	private async runNativeSshCommand(connection: ITurboFileSshConnectionOptions, tool: ILocalSshTool, remoteCommand: string, progressId: string | undefined): Promise<void> {
		await withNativeOpenSshArgs(connection, tool, remoteCommand, async (sshArgs, env) => {
			await this.runCancelableLocalCommand(tool.executable, sshArgs, { env }, progressId);
		});
	}

	private async runNativeSshCommandWithInput(connection: ITurboFileSshConnectionOptions, tool: ILocalSshTool, remoteCommand: string, input: Buffer, progressId: string | undefined): Promise<void> {
		await withNativeOpenSshArgs(connection, tool, remoteCommand, async (sshArgs, env) => {
			let sshProcess: ReturnType<typeof spawn> | undefined;
			const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
				if (sshProcess) {
					killLocalProcessTree(sshProcess);
				}
			});
			try {
				sshProcess = spawn(tool.executable, sshArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env });
				sshProcess.stdout?.resume();
				if (!sshProcess.stdin) {
					throw new Error('Native ssh command did not provide stdin.');
				}
				const sshClose = waitForLocalProcessClose(sshProcess, 'native ssh command');
				sshProcess.stdin.end(input);
				await sshClose;
			} finally {
				unregisterCancel();
			}
		});
	}

	private async prepareRemoteBatchTarTarget(connection: ITurboFileSshConnectionOptions, targetDirectory: string, targetNames: readonly string[], progressId: string | undefined, requireZstd: boolean): Promise<void> {
		const sshTool = await resolveLocalSshTool();
		const command = buildPrepareTarExtractToDirectoryFromListCommand(targetDirectory, requireZstd);
		await this.runNativeSshCommandWithInput(connection, sshTool, command, createTarNullListBuffer(targetNames), progressId);
	}

	private async runNativeLocalTarUploadChunk(localRoot: string, chunk: ILocalTarChunk, connection: ITurboFileSshConnectionOptions, sshTool: ILocalSshTool, remoteCommand: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		await withNativeOpenSshArgs(connection, sshTool, remoteCommand, async (sshArgs, sshEnv) => {
			let tarProcess: ReturnType<typeof spawn> | undefined;
			let sshProcess: ReturnType<typeof spawn> | undefined;
			const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
				if (tarProcess) {
					killLocalProcessTree(tarProcess);
				}
				if (sshProcess) {
					killLocalProcessTree(sshProcess);
				}
			});
			try {
				tarProcess = spawn('tar.exe', [...await this.getLocalTarCharsetArgs(), '-cf', '-', '-C', localRoot, '--null', '-T', chunk.listPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
				sshProcess = spawn(sshTool.executable, sshArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: sshEnv });
				sshProcess.stdout?.resume();
				if (!tarProcess.stdout || !sshProcess.stdin) {
					throw new Error('Parallel tar upload did not provide required pipes.');
				}
				const tarClose = waitForLocalProcessClose(tarProcess, 'parallel tar upload create');
				const sshClose = waitForLocalProcessClose(sshProcess, 'parallel tar upload extract');
				await Promise.all([
					pipeline(tarProcess.stdout, createProgressPassThrough(onArchiveDelta), sshProcess.stdin),
					tarClose,
					sshClose
				]);
			} finally {
				unregisterCancel();
			}
		});
	}

	private async runNativeLocalTarUploadChunkWithRetry(localRoot: string, chunk: ILocalTarChunk, connection: ITurboFileSshConnectionOptions, sshTool: ILocalSshTool, remoteCommand: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		let lastError: unknown;
		for (let attempt = 0; attempt <= LOCAL_PARALLEL_TAR_CHUNK_RETRIES; attempt++) {
			if (attempt > 0) {
				await delay(150 * attempt);
			}
			try {
				await this.runNativeLocalTarUploadChunk(localRoot, chunk, connection, sshTool, remoteCommand, progressId, onArchiveDelta);
				return;
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				lastError = error;
			}
		}
		throw new Error(`Parallel tar chunk failed after retries: ${formatTransferError(lastError)}`);
	}

	private async runNativeLocalTarZstdUploadChunk(localRoot: string, chunk: ILocalTarChunk, connection: ITurboFileSshConnectionOptions, sshTool: ILocalSshTool, zstdTool: ILocalZstdTool, remoteCommand: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		await withNativeOpenSshArgs(connection, sshTool, remoteCommand, async (sshArgs, sshEnv) => {
			let tarProcess: ReturnType<typeof spawn> | undefined;
			let zstdProcess: ReturnType<typeof spawn> | undefined;
			let sshProcess: ReturnType<typeof spawn> | undefined;
			const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
				if (tarProcess) {
					killLocalProcessTree(tarProcess);
				}
				if (zstdProcess) {
					killLocalProcessTree(zstdProcess);
				}
				if (sshProcess) {
					killLocalProcessTree(sshProcess);
				}
			});
			try {
				tarProcess = spawn('tar.exe', [...await this.getLocalTarCharsetArgs(), '-cf', '-', '-C', localRoot, '--null', '-T', chunk.listPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
				zstdProcess = spawn(zstdTool.executable, [`-${LOCAL_TAR_ZSTD_LEVEL}`, '-T1', '-c'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: zstdTool.env });
				sshProcess = spawn(sshTool.executable, sshArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: sshEnv });
				sshProcess.stdout?.resume();
				if (!tarProcess.stdout || !zstdProcess.stdin || !zstdProcess.stdout || !sshProcess.stdin) {
					throw new Error('Parallel tar upload did not provide required pipes.');
				}
				const tarClose = waitForLocalProcessClose(tarProcess, 'parallel tar upload create');
				const zstdClose = waitForLocalProcessClose(zstdProcess, 'parallel tar upload compress');
				const sshClose = waitForLocalProcessClose(sshProcess, 'parallel tar upload extract');
				await Promise.all([
					pipeline(tarProcess.stdout, createProgressPassThrough(onArchiveDelta), zstdProcess.stdin),
					pipeline(zstdProcess.stdout, sshProcess.stdin),
					tarClose,
					zstdClose,
					sshClose
				]);
			} finally {
				unregisterCancel();
			}
		});
	}

	private async runLocalScpUpload(request: ITurboFileTransferRequest, bytes: number, onProgress?: (transferredBytes: number) => void): Promise<void> {
		if (request.target.kind !== 'ssh' || !request.target.connection) {
			throw new Error('Missing SSH target.');
		}
		const localStat = await fsp.stat(request.source.path);
		const recursive = localStat.isDirectory();
		const initialRemoteSize = await this.withDirectorySftp(request.target, async sftp => {
			this.throwIfTransferCanceled(request.progressId);
			if (recursive) {
				await this.withDirectorySshClient(request.target, client => this.execRemote(client, buildPrepareDirectoryTransferTargetCommand(request.target.path)));
			} else {
				await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
				await this.unlinkRemote(sftp, request.target.path).catch(() => undefined);
			}
			return 0;
		});
		if (canUseNativeOpenSshScpCommand(request.target.connection)) {
			try {
				await this.uploadPathWithNativeOpenSshScp(request.target.connection, request.source.path, request.target.path, recursive, initialRemoteSize, bytes, onProgress, request.progressId);
				return;
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw error;
				}
				this.clearTransferDataTiming(request.progressId);
			}
		}
		if (recursive) {
			throw new Error('Native OpenSSH scp.exe is required for directory SCP upload.');
		}
		await this.uploadFileWithScpProtocol(request.target.connection, request.source.path, request.target.path, bytes, onProgress, request.progressId);
	}

	private async runLocalScpDownload(request: ITurboFileTransferRequest, bytes: number, onProgress?: (transferredBytes: number) => void): Promise<void> {
		if (request.source.kind !== 'ssh' || !request.source.connection) {
			throw new Error('Missing SSH source.');
		}
		await ensureLocalParentDirectory(request.target.path);
		const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown' as TurboFileFileType);
		const recursive = sourceType === 'directory';
		if (canUseNativeOpenSshScpCommand(request.source.connection)) {
			if (recursive) {
				await ensureLocalDirectoryTransferTargetAvailable(request.target.path);
			} else {
				await fsp.rm(request.target.path, { force: true }).catch(() => undefined);
			}
			const initialLocalSize = 0;
			try {
				await this.downloadPathWithNativeOpenSshScp(request.source.connection, request.source.path, request.target.path, recursive, initialLocalSize, bytes, onProgress, request.progressId);
				return;
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw error;
				}
				this.clearTransferDataTiming(request.progressId);
			}
		}
		if (recursive) {
			throw new Error('Native OpenSSH scp.exe is required for directory SCP download.');
		}
		await this.downloadFileWithScpProtocol(request.source.connection, request.source.path, request.target.path, bytes, onProgress, request.progressId);
	}

	private async uploadPathWithNativeOpenSshScp(connection: ITurboFileSshConnectionOptions, localPath: string, remotePath: string, recursive: boolean, initialRemoteSize: number, expectedBytes: number, onProgress: ((transferredBytes: number) => void) | undefined, progressId?: string): Promise<void> {
		const stopGrowthTiming = recursive
			? () => undefined
			: this.beginRemoteFileGrowthTiming(progressId, connection, remotePath, initialRemoteSize, expectedBytes, onProgress);
		try {
			if (recursive) {
				this.markTransferDataStarted(progressId);
			}
			const sourceArg = recursive ? getNativeScpLocalDirectoryContentsPath(localPath) : localPath;
			const targetArg = recursive ? ensureTrailingRemoteSlash(remotePath) : remotePath;
			await withNativeOpenSshScpBaseArgs(connection, (args, env) => this.runCancelableLocalCommand('scp.exe', [
				...args,
				...(recursive ? ['-r'] : []),
				sourceArg,
				formatNativeScpRemoteSpec(connection, targetArg)
			], { env }, progressId), shouldPreferLegacyScpMode(connection));
		} finally {
			stopGrowthTiming();
		}
	}

	private async downloadPathWithNativeOpenSshScp(connection: ITurboFileSshConnectionOptions, remotePath: string, localPath: string, recursive: boolean, initialLocalSize: number, expectedBytes: number, onProgress: ((transferredBytes: number) => void) | undefined, progressId?: string): Promise<void> {
		const stopGrowthTiming = recursive
			? () => undefined
			: this.beginTransferGrowthTiming(progressId, () => fsp.stat(localPath).then(stat => stat.size).catch(() => 0), initialLocalSize, expectedBytes, onProgress);
		try {
			if (recursive) {
				this.markTransferDataStarted(progressId);
			}
			const sourceArg = recursive ? getRemoteDirectoryContentsPath(remotePath) : remotePath;
			await withNativeOpenSshScpBaseArgs(connection, (args, env) => this.runCancelableLocalCommand('scp.exe', [
				...args,
				...(recursive ? ['-r'] : []),
				formatNativeScpRemoteSpec(connection, sourceArg),
				localPath
			], { env }, progressId), shouldPreferLegacyScpMode(connection));
		} finally {
			stopGrowthTiming();
		}
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

			const stopGrowthTiming = this.beginRemoteFileGrowthTiming(progressId, connection, remotePath);
			try {
				for await (const chunk of createReadStream(localPath, { highWaterMark: 1024 * 1024 })) {
					this.throwIfTransferCanceled(progressId);
					const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
					await writeScpData(stream, buffer);
					transferredBytes += buffer.byteLength;
					onProgress?.(Math.min(transferredBytes, totalBytes));
				}
			} finally {
				stopGrowthTiming();
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
			const stopGrowthTiming = this.beginTransferGrowthTiming(progressId, async () => {
				const stat = await fsp.stat(localPath).catch(() => undefined);
				return stat?.size ?? 0;
			});
			try {
				await readScpFilePayload(reader, localPath, totalBytes, transferredBytes => {
					this.throwIfTransferCanceled(progressId);
					onProgress?.(transferredBytes);
				});
			} finally {
				stopGrowthTiming();
			}
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

	private async runLocalRsyncUpload(request: ITurboFileTransferRequest, expectedBytes: number, onProgressOutput?: (chunk: string) => void): Promise<void> {
		if (request.target.kind !== 'ssh' || !request.target.connection) {
			throw new Error('Missing SSH target.');
		}
		void expectedBytes;
		const connection = request.target.connection;
		const tool = await resolveLocalRsyncTool();
		const sourceIsDirectory = (await fsp.stat(request.source.path)).isDirectory();
		const mkdirTargetPath = sourceIsDirectory ? request.target.path : getRemoteParentPath(request.target.path);
		const sourcePath = toRsyncLocalPath(request.source.path, tool.pathFlavor);
		await withLocalRsyncSshEnvironment(connection, tool, (env, identityPath) => {
			return this.runCancelableLocalCommand(tool.executable, [
				...buildLocalRsyncOptionArgs(true),
				buildRsyncPathWithMkdirOption(mkdirTargetPath),
				'-e',
				buildLocalRsyncSshTransport(connection, tool.sshExecutable, identityPath),
				sourceIsDirectory ? ensureTrailingRemoteSlash(sourcePath) : sourcePath,
				formatRsyncRemoteSpec(connection, request.target.path)
			], {
				env,
				onStdout: onProgressOutput,
				onStderr: onProgressOutput,
				inactivityTimeoutMs: LOCAL_RSYNC_STALL_TIMEOUT_MS,
				inactivityMessage: `Local rsync upload produced no output for ${LOCAL_RSYNC_STALL_TIMEOUT_MS} ms.`
			}, request.progressId);
		});
	}

	private async runLocalRsyncDownload(request: ITurboFileTransferRequest, expectedBytes: number, onProgressOutput?: (chunk: string) => void): Promise<void> {
		if (request.source.kind !== 'ssh' || !request.source.connection) {
			throw new Error('Missing SSH source.');
		}
		void expectedBytes;
		const connection = request.source.connection;
		const tool = await resolveLocalRsyncTool();
		const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown' as TurboFileFileType);
		const sourceIsDirectory = sourceType === 'directory';
		if (sourceIsDirectory) {
			await ensureLocalDirectory(request.target.path);
		} else {
			await ensureLocalParentDirectory(request.target.path);
		}
		await withLocalRsyncSshEnvironment(connection, tool, (env, identityPath) => {
			return this.runCancelableLocalCommand(tool.executable, [
				...buildLocalRsyncOptionArgs(true),
				'-e',
				buildLocalRsyncSshTransport(connection, tool.sshExecutable, identityPath),
				formatRsyncRemoteSpec(connection, sourceIsDirectory ? ensureTrailingRemoteSlash(request.source.path) : request.source.path),
				toRsyncLocalPath(request.target.path, tool.pathFlavor)
			], {
				env,
				onStdout: onProgressOutput,
				onStderr: onProgressOutput,
				inactivityTimeoutMs: LOCAL_RSYNC_STALL_TIMEOUT_MS,
				inactivityMessage: `Local rsync download produced no output for ${LOCAL_RSYNC_STALL_TIMEOUT_MS} ms.`
			}, request.progressId);
		});
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
		const initialAttempt = this.getInitialBatchTransferAttempt(request, items);
		const initialStrategy = transferAttemptToDirectionalStrategy(request.source, request.targetDirectory, initialAttempt);
		const initialIsRsync = initialAttempt?.protocol === 'rsync';
		try {
			this.throwIfTransferCanceled(request.progressId);
			this.fireTransferProgress(request, 0, initialIsRsync ? 0 : expectedBytes, initialIsRsync ? 'transfer' : 'prepare', initialIsRsync ? 'Starting batch rsync transfer.' : 'Preparing batch transfer.', true, {
				...(initialIsRsync ? { strategy: initialStrategy } : {}),
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

			if (request.source.kind === 'ssh' && request.targetDirectory.kind === 'ssh') {
				return await this.runSshToSshBatchTransferPlan(request, items, operation, expectedBytes, startedAt);
			}

			const tarBatch = await this.tryBatchTarTransfer(request, items, operation, expectedBytes, startedAt);
			this.throwIfTransferCanceled(request.progressId);
			if (tarBatch?.ok) {
				return tarBatch;
			}
			if (shouldUseTarOnlyForBatchTransfer(request)) {
				throw new Error('Tar transfer unavailable for batch transfer.');
			}

			const localRsyncBatch = await this.tryLocalBatchRsyncTransfer(request, items, operation, expectedBytes, startedAt);
			this.throwIfTransferCanceled(request.progressId);
			if (localRsyncBatch?.ok) {
				return localRsyncBatch;
			}

			const fallback = await this.runConcurrentBatchTransfer(request, items, operation, expectedBytes, startedAt, false);
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

	private getInitialBatchTransferAttempt(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[]): ITurboFileTransferAttempt | undefined {
		const sourceType: TurboFileFileType | undefined = items.some(item => item.sourceType === 'directory') ? 'directory' : items[0]?.sourceType;
		return resolveTransferPlan({
			source: request.source,
			target: request.targetDirectory,
			sourceType,
			itemCount: items.length,
			strategyHint: request.strategyHint
		}).attempts[0];
	}

	private async runSshToSshBatchTransferPlan(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move', expectedBytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult> {
		const sourceType = items.some(item => item.sourceType === 'directory') ? 'directory' : items[0]?.sourceType;
		const plan = resolveTransferPlan({
			source: request.source,
			target: request.targetDirectory,
			sourceType,
			itemCount: items.length,
			strategyHint: request.strategyHint
		});
		const failures: ITurboFileBatchTransferFailure[] = [];
		for (const [index, attempt] of plan.attempts.entries()) {
			this.throwIfTransferCanceled(request.progressId);
			try {
				this.fireTransferProgress(request, 0, attempt.protocol === 'rsync' ? 0 : expectedBytes, attempt.route === 'relay' ? 'relay-upload' : 'transfer', `Starting batch ${attempt.protocol} ${attempt.route} transfer.`, true, {
					strategy: transferAttemptToStrategy(attempt),
					route: attempt.route === 'relay' ? 'relay' : undefined,
					completedItems: 0,
					totalItems: items.length,
					currentName: items[0]?.displayName ?? items[0]?.targetName
				});
				const result = await this.runSshToSshBatchTransferAttempt(request, items, operation, expectedBytes, startedAt, attempt);
				this.throwIfTransferCanceled(request.progressId);
				if (result?.ok) {
					return result;
				}
				if (result) {
					failures.push(...result.failures);
				}
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				failures.push({
					name: items[0]?.displayName ?? items[0]?.targetName ?? 'batch',
					path: items[0]?.sourcePath ?? request.source.path,
					message: `${attempt.protocol} ${attempt.route}: ${formatTransferError(error)}`
				});
				const nextAttempt = plan.attempts[index + 1];
				if (nextAttempt) {
					this.fireTransferProgress(request, 0, nextAttempt.protocol === 'rsync' ? 0 : expectedBytes, nextAttempt.route === 'relay' ? 'relay-upload' : 'transfer', `Falling back to batch ${nextAttempt.protocol} ${nextAttempt.route}.`, true, {
						strategy: transferAttemptToStrategy(nextAttempt),
						route: nextAttempt.route === 'relay' ? 'relay' : undefined,
						completedItems: 0,
						totalItems: items.length,
						currentName: items[0]?.displayName ?? items[0]?.targetName
					});
				}
			}
		}
		return this.createBatchTransferResult(false, transferAttemptToStrategy(plan.attempts[0]), 0, failures[0]?.message ?? 'Batch transfer unavailable.', 0, items.length, failures.length ? failures : items.map(item => ({
			name: item.displayName ?? item.targetName,
			path: item.sourcePath,
			message: 'No transfer attempt was available.'
		})), startedAt, request.progressId);
	}

	private async runSshToSshBatchTransferAttempt(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move', expectedBytes: number, startedAt: number, attempt: ITurboFileTransferAttempt): Promise<ITurboFileBatchTransferResult | undefined> {
		if (attempt.protocol === 'rsync') {
			const result = attempt.route === 'direct'
				? await this.tryDirectBatchRsyncTransfer(request, items, expectedBytes, startedAt, true)
				: attempt.route === 'relay'
					? await this.tryTunneledBatchRsyncRelayTransfer(request, items, expectedBytes, startedAt, true)
					: undefined;
			if (result?.ok && operation === 'move') {
				const cleanupFailures = await this.deleteBatchSources(request.source, items);
				if (cleanupFailures.length) {
					return this.createBatchTransferResult(false, result.strategy, result.bytes, `Batch transfer completed, but source cleanup failed for ${cleanupFailures.length} item(s).`, items.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
				}
			}
			return result;
		}
		if (attempt.protocol === 'tar') {
			return this.tryBatchTarTransfer({
				...request,
				strategyHint: attempt.route === 'relay' ? 'relay' : 'direct'
			}, items, operation, expectedBytes, startedAt, true);
		}
		return this.runConcurrentBatchTransfer({
			...request,
			strategyHint: attempt.route === 'relay' ? 'relay' : 'direct'
		}, items, operation, expectedBytes, startedAt, false);
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
		this.markTransferDataStarted(request.progressId);
		if (looksLikeWindowsPath(request.targetDirectory.path) || sources.some(looksLikeWindowsPath)) {
			await this.withSshClient(request.source, client => this.execRemote(client, buildWindowsBatchCommand(sources, request.targetDirectory.path, operation)));
		} else {
			const plan = createPosixNativeBatchTransferPlan(items, request.targetDirectory.path, operation);
			await this.withSshClient(request.source, client => this.execRemoteWithInput(client, plan.command, plan.input));
		}
		this.throwIfTransferCanceled(request.progressId);
		this.fireTransferProgress(request, expectedBytes, expectedBytes, 'complete', 'Batch remote native transfer completed.', true, {
			completedItems: items.length,
			totalItems: items.length
		});
		this.clearRemoteDirectoryListingCache(request.source);
		this.clearRemoteDirectoryListingCache(request.targetDirectory);
		return this.createBatchTransferResult(true, 'remote-copy', expectedBytes, 'Batch remote native transfer completed.', items.length, 0, [], startedAt, request.progressId);
	}

	private async tryLocalBatchRsyncTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move', expectedBytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult | undefined> {
		const isUpload = request.source.kind === 'local' && request.targetDirectory.kind === 'ssh' && !!request.targetDirectory.connection;
		const isDownload = request.source.kind === 'ssh' && request.targetDirectory.kind === 'local' && !!request.source.connection;
		if (!isUpload && !isDownload) {
			return undefined;
		}
		if (items.length <= 1 && items.every(item => item.sourceType !== 'directory')) {
			return undefined;
		}
		const protocol = isUpload ? request.targetDirectory.preferredProtocol : request.source.preferredProtocol;
		if (protocol !== 'rsync') {
			return undefined;
		}
		if (isUpload && looksLikeWindowsPath(request.targetDirectory.path)) {
			return undefined;
		}
		if (isDownload && (looksLikeWindowsPath(request.source.path) || items.some(item => looksLikeWindowsPath(item.sourcePath)))) {
			return undefined;
		}
		if (!canBatchRsyncPreserveTargetNames(items)) {
			return undefined;
		}

		const connection = isUpload ? request.targetDirectory.connection! : request.source.connection!;
		try {
			const tool = await resolveLocalRsyncTool();
			const initialTotalBytes = Math.max(0, expectedBytes);
			const progress = this.createRsyncProgressReporter(request, initialTotalBytes, 'transfer', isUpload ? 'Batch rsync upload in progress.' : 'Batch rsync download in progress.', {
				strategy: isUpload ? 'rsync-upload' : 'rsync-download',
				completedItems: 0,
				totalItems: items.length
			});

			// Mirror the tar path's early phase: compute the byte total concurrently (a Node-side walk
			// is ~50× faster than rsync's cygwin file-list scan) and publish it the moment it resolves.
			// This makes the size and a real percentage appear within ~1s, so the transfer no longer
			// looks stuck at "preparing / 0 B" during rsync's own (unavoidable) file-list build. The
			// actual bytes are still moved by rsync — only the denominator is borrowed from tar's trick.
			if (initialTotalBytes <= 0) {
				const sizePromise = isUpload
					? this.getLocalBatchTarBytes(items)
					: this.getRemoteBatchSourceContentSize(request.source, items);
				void sizePromise.then(total => progress.setTotalBytes(total)).catch(() => undefined);
			}

			// Fire 'transfer' (not 'prepare') right away: rsync starts immediately and may stay quiet
			// while scanning its file list, and the last phase label should not read as "preparing".
			this.fireTransferProgress(request, 0, initialTotalBytes, 'transfer', isUpload ? 'Starting batch rsync upload.' : 'Starting batch rsync download.', true, {
				strategy: isUpload ? 'rsync-upload' : 'rsync-download',
				completedItems: 0,
				totalItems: items.length,
				currentName: items[0]?.displayName ?? items[0]?.targetName
			});
			// Progress is driven by rsync's own --info=progress2 transferred byte count.
			if (isUpload) {
				// Walk the source on the Node side so rsync skips its slow cygwin scan and starts
				// transferring within ~1s instead of stalling on "preparing" for 20+s on large trees.
				const fastList = await this.buildLocalRsyncFastListFile(items);
				try {
					await withLocalRsyncSshEnvironment(connection, tool, (env, identityPath) => {
						const args: string[] = [
							...buildLocalRsyncOptionArgs(true),
							buildRsyncPathWithMkdirOption(request.targetDirectory.path),
							'-e',
							buildLocalRsyncSshTransport(connection, tool.sshExecutable, identityPath)
						];
						if (fastList) {
							args.push(
								`--files-from=${toRsyncLocalPath(fastList.listPath, tool.pathFlavor)}`,
								'--from0',
								`${toRsyncLocalPath(fastList.sourceBase, tool.pathFlavor)}/`
							);
						} else {
							for (const item of items) {
								args.push(toRsyncLocalPath(item.sourcePath, tool.pathFlavor));
							}
						}
						args.push(formatRsyncRemoteSpec(connection, ensureTrailingRemoteSlash(request.targetDirectory.path)));
						return this.runCancelableLocalCommand(tool.executable, args, {
							env,
							onStdout: progress.handleOutput,
							onStderr: progress.handleOutput,
							inactivityTimeoutMs: LOCAL_RSYNC_STALL_TIMEOUT_MS,
							inactivityMessage: `Batch rsync upload produced no output for ${LOCAL_RSYNC_STALL_TIMEOUT_MS} ms.`
						}, request.progressId);
					});
				} finally {
					if (fastList) {
						await fsp.rm(fastList.listPath, { force: true }).catch(() => undefined);
					}
				}
			} else {
				await ensureLocalDirectory(request.targetDirectory.path);
				const sourceArgs = items.map(item => formatRsyncRemoteSpec(connection, item.sourcePath));
				await withLocalRsyncSshEnvironment(connection, tool, (env, identityPath) => {
					return this.runCancelableLocalCommand(tool.executable, [
						...buildLocalRsyncOptionArgs(true),
						'-e',
						buildLocalRsyncSshTransport(connection, tool.sshExecutable, identityPath),
						...sourceArgs,
						toRsyncLocalPath(request.targetDirectory.path, tool.pathFlavor)
					], {
						env,
						onStdout: progress.handleOutput,
						onStderr: progress.handleOutput,
						inactivityTimeoutMs: LOCAL_RSYNC_STALL_TIMEOUT_MS,
						inactivityMessage: `Batch rsync download produced no output for ${LOCAL_RSYNC_STALL_TIMEOUT_MS} ms.`
					}, request.progressId);
				});
			}

			const cleanupFailures = operation === 'move' ? await this.deleteBatchSources(request.source, items) : [];
			const bytes = progress.getLastBytes() || expectedBytes;
			this.fireTransferProgress(request, bytes, 0, 'complete', isUpload ? 'Batch rsync upload completed.' : 'Batch rsync download completed.', true, {
				strategy: isUpload ? 'rsync-upload' : 'rsync-download',
				completedItems: items.length,
				totalItems: items.length
			});
			this.clearRemoteDirectoryListingCache(isUpload ? request.targetDirectory : request.source);
			return this.createBatchTransferResult(cleanupFailures.length === 0, isUpload ? 'rsync-upload' : 'rsync-download', bytes, cleanupFailures.length ? `Batch rsync completed, but source cleanup failed for ${cleanupFailures.length} item(s).` : 'Batch rsync completed.', items.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			return undefined;
		}
	}

	private async tryDirectBatchRsyncTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], expectedBytes: number, startedAt: number, allowAutoFast = false): Promise<ITurboFileBatchTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.targetDirectory.kind !== 'ssh' || !request.source.connection || !request.targetDirectory.connection) {
			return undefined;
		}
		const protocol = getSshToSshTransferProtocol(request.source);
		if (protocol !== 'rsync' && !(allowAutoFast && protocol === 'auto-fast')) {
			return undefined;
		}
		if (request.source.supportsRsync !== true || request.targetDirectory.supportsRsync !== true) {
			return undefined;
		}
		if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.targetDirectory.path) || items.some(item => looksLikeWindowsPath(item.sourcePath))) {
			return undefined;
		}
		if (!canBatchRsyncPreserveTargetNames(items)) {
			return undefined;
		}

		const routes = await this.resolveDirectSshRoutes(request.source, request.targetDirectory, request.progressId);
		if (!routes.length) {
			return undefined;
		}

		for (const route of routes) {
			try {
				const result = await this.tryDirectBatchRsyncTransferRoute(request, items, expectedBytes, startedAt, route);
				this.clearDirectSshRouteFailure(request.source, request.targetDirectory, route);
				return result;
			} catch {
				if (this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				this.markDirectSshRouteFailure(request.source, request.targetDirectory, route);
			}
		}

		this.clearDirectSshRouteCache(request.source, request.targetDirectory);
		return undefined;
	}

	private async tryDirectBatchRsyncTransferRoute(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], expectedBytes: number, startedAt: number, route: TurboFileDirectSshRoute): Promise<ITurboFileBatchTransferResult> {
		const executorEndpoint = route === 'source-push' ? request.source : request.targetDirectory;
		const remoteEndpoint = route === 'source-push' ? request.targetDirectory : request.source;
		if (!executorEndpoint.connection || !remoteEndpoint.connection) {
			throw new Error('Batch direct rsync route is missing SSH connection details.');
		}
		const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
		if (!executorConfigResult.ok) {
			throw new Error(executorConfigResult.message);
		}
		const client = await this.connectDirectSsh(executorConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		let lastActivityAt = Date.now();
		const markActivity = (): void => {
			lastActivityAt = Date.now();
		};
		try {
			this.throwIfTransferCanceled(request.progressId);
			this.fireTransferProgress(request, 0, 0, 'transfer', 'Starting batch rsync direct transfer.', true, {
				strategy: 'rsync-direct',
				route,
				completedItems: 0,
				totalItems: items.length,
				currentName: items[0]?.displayName ?? items[0]?.targetName
			});
			const remote = remoteEndpoint.connection;
			const remoteUserHost = `${remote.username}@${remote.host}`;
			const sshBinary = await this.resolveRemoteRsyncSshBinary(client, executorEndpoint.connection);
			const sshTransport = buildOptimizedRsyncSshCommand(remote.port || 22, !!remote.password, sshBinary);
			const sshpassPrefix = buildSshpassPrefix(remote.password);
			const rsyncOptions = buildRsyncOptions(true);
			const rsyncPathOption = route === 'source-push' ? ` ${buildRsyncPathWithMkdirShellOption(request.targetDirectory.path)}` : '';
			const sourceArgs = route === 'source-push'
				? items.map(item => quotePosixShellArg(item.sourcePath)).join(' ')
				: items.map(item => quotePosixShellArg(`${remoteUserHost}:${item.sourcePath}`)).join(' ');
			const targetSpec = route === 'source-push'
				? `${remoteUserHost}:${ensureTrailingRemoteSlash(request.targetDirectory.path)}`
				: ensureTrailingRemoteSlash(request.targetDirectory.path);
			const rsyncCommandCore = `${sshpassPrefix}rsync ${rsyncOptions}${rsyncPathOption} -e ${quotePosixShellArg(sshTransport)} ${sourceArgs} ${quotePosixShellArg(targetSpec)}`;
			const rsyncCommand = route === 'source-push' ? rsyncCommandCore : `mkdir -p ${quotePosixShellArg(request.targetDirectory.path)} && ${rsyncCommandCore}`;
			const progress = this.createRsyncProgressReporter(request, 0, 'rsync-direct', 'Batch direct rsync transfer in progress.', {
				strategy: 'rsync-direct',
				route,
				completedItems: 0,
				totalItems: items.length
			}, markActivity);
			this.throwIfTransferCanceled(request.progressId);
			markActivity();
			await this.execRemote(client, rsyncCommand, {
				onStdout: progress.handleOutput,
				onStderr: progress.handleOutput,
				inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
				inactivityMessage: `Batch direct rsync ${route} produced no transfer progress for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
				getActivityTime: () => lastActivityAt
			});
			this.throwIfTransferCanceled(request.progressId);
			const bytes = progress.getLastBytes() || expectedBytes;
			this.fireTransferProgress(request, bytes, 0, 'complete', 'Batch direct rsync completed.', true, {
				strategy: 'rsync-direct',
				route,
				completedItems: items.length,
				totalItems: items.length
			});
			this.clearRemoteDirectoryListingCache(request.targetDirectory);
			return this.createBatchTransferResult(true, 'rsync-direct', bytes, 'Batch direct rsync completed.', items.length, 0, [], startedAt, request.progressId);
		} catch (error) {
			if (this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			throw error;
		} finally {
			unregisterCancel();
			client.end();
		}
	}

	private async tryTunneledBatchRsyncRelayTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], expectedBytes: number, startedAt: number, allowAutoFast = false): Promise<ITurboFileBatchTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.targetDirectory.kind !== 'ssh' || !request.source.connection || !request.targetDirectory.connection) {
			return undefined;
		}
		const protocol = getSshToSshTransferProtocol(request.source);
		if (protocol !== 'rsync' && !(allowAutoFast && protocol === 'auto-fast')) {
			return undefined;
		}
		if (request.source.supportsRsync !== true || request.targetDirectory.supportsRsync !== true || !request.targetDirectory.connection.password) {
			return undefined;
		}
		if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.targetDirectory.path) || items.some(item => looksLikeWindowsPath(item.sourcePath))) {
			return undefined;
		}
		if (!canBatchRsyncPreserveTargetNames(items)) {
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
			this.fireTransferProgress(request, 0, 0, 'transfer', 'Starting batch rsync relay transfer.', true, {
				strategy: 'rsync-relay',
				completedItems: 0,
				totalItems: items.length,
				currentName: items[0]?.displayName ?? items[0]?.targetName
			});
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
			const rsyncOptions = buildRsyncOptions(true);
			const sourceArgs = items.map(item => quotePosixShellArg(item.sourcePath)).join(' ');
			const targetSpec = `${targetUserHost}:${ensureTrailingRemoteSlash(request.targetDirectory.path)}`;
			const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} ${buildRsyncPathWithMkdirShellOption(request.targetDirectory.path)} -e ${quotePosixShellArg(sshTransport)} ${sourceArgs} ${quotePosixShellArg(targetSpec)}`;
			const progress = this.createRsyncProgressReporter(request, 0, 'relay-upload', 'Batch rsync relay transfer in progress.', {
				strategy: 'rsync-relay',
				completedItems: 0,
				totalItems: items.length
			});
			await this.execRemote(client, rsyncCommand, {
				onStdout: progress.handleOutput,
				onStderr: progress.handleOutput,
				inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
				inactivityMessage: `Batch rsync relay produced no transfer progress for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
				getActivityTime: progress.getActivityTime
			});
			this.throwIfTransferCanceled(request.progressId);
			const bytes = progress.getLastBytes() || expectedBytes;
			this.fireTransferProgress(request, bytes, 0, 'complete', 'Batch rsync relay completed.', true, {
				strategy: 'rsync-relay',
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

	private async tryBatchTarTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move', expectedBytes: number, startedAt: number, forceProtocol = false): Promise<ITurboFileBatchTransferResult | undefined> {
		if (request.source.kind === 'local' && request.targetDirectory.kind === 'ssh') {
			if (!forceProtocol && !shouldPreferTarForMultiItemTransfer(request.targetDirectory.preferredProtocol)) {
				return undefined;
			}
			if (request.targetDirectory.supportsTar === false || looksLikeWindowsPath(request.targetDirectory.path)) {
				return undefined;
			}
			const plans = createLocalBatchTarPlans(items);
			if (!plans?.length) {
				return undefined;
			}
			const targetNames = collectBatchTarTargetNames(plans);
			let bytes = Math.max(0, expectedBytes);
			const sizePromise = bytes <= 0 ? this.getLocalBatchTarBytes(items).catch(() => 0) : undefined;
			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing batch tar upload.', true, { strategy: 'tar-upload', completedItems: 0, totalItems: items.length });
			let archiveBytes = 0;
			const onArchiveDelta = (delta: number): void => {
				this.throwIfTransferCanceled(request.progressId);
				archiveBytes += Math.max(0, delta);
				this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, 'transfer', 'Batch tar upload in progress.', false, { strategy: 'tar-upload', completedItems: 0, totalItems: items.length });
			};
			if (sizePromise) {
				void sizePromise.then(total => {
					if (total > bytes) {
						bytes = total;
						this.fireTransferProgress(request, Math.min(archiveBytes, bytes), bytes, 'transfer', 'Batch tar upload in progress.', true, { strategy: 'tar-upload', completedItems: 0, totalItems: items.length });
					}
				});
			}
			this.markTransferDataStarted(request.progressId);
			await this.runLocalBatchTarUploads(plans, request.targetDirectory, request.progressId, onArchiveDelta);
			if (sizePromise) {
				bytes = Math.max(bytes, await sizePromise);
			}
			const resultBytes = bytes > 0 ? bytes : await this.getRemoteBatchTargetContentSize(request.targetDirectory, targetNames).catch(() => 0);
			await this.cleanupBatchSourcesAfterTar(request, items, operation);
			this.fireTransferProgress(request, resultBytes, resultBytes, 'complete', 'Batch tar upload completed.', true, { strategy: 'tar-upload', completedItems: items.length, totalItems: items.length });
			return this.createBatchTransferResult(true, 'tar-upload', resultBytes, 'Batch tar upload completed.', items.length, 0, [], startedAt, request.progressId);
		}

		if (request.source.kind === 'ssh' && request.targetDirectory.kind === 'local') {
			if (!forceProtocol && !shouldPreferTarForMultiItemTransfer(request.source.preferredProtocol)) {
				return undefined;
			}
			if (request.source.supportsTar === false || looksLikeWindowsPath(request.source.path)) {
				return undefined;
			}
			const plan = this.createRemoteBatchTarPlan(items);
			if (!plan) {
				return undefined;
			}
			let bytes = Math.max(0, expectedBytes);
			const sizePromise = bytes <= 0 ? this.getRemoteBatchSourceContentSize(request.source, items).catch(() => 0) : undefined;
			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing batch tar download.', true, { strategy: 'tar-download', completedItems: 0, totalItems: items.length });
			await this.prepareLocalBatchTarTarget(request.targetDirectory.path, plan.targetNames);
			let archiveBytes = 0;
			const onArchiveDelta = (delta: number): void => {
				this.throwIfTransferCanceled(request.progressId);
				archiveBytes += Math.max(0, delta);
				this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, 'transfer', 'Batch tar download in progress.', false, { strategy: 'tar-download', completedItems: 0, totalItems: items.length });
			};
			if (sizePromise) {
				void sizePromise.then(total => {
					if (total > bytes) {
						bytes = total;
						this.fireTransferProgress(request, Math.min(archiveBytes, bytes), bytes, 'transfer', 'Batch tar download in progress.', true, { strategy: 'tar-download', completedItems: 0, totalItems: items.length });
					}
				});
			}
			this.markTransferDataStarted(request.progressId);
			await this.runRemoteBatchTarDownload(request.source, plan, request.targetDirectory.path, request.progressId, onArchiveDelta);
			if (sizePromise) {
				bytes = Math.max(bytes, await sizePromise);
			}
			const resultBytes = bytes > 0 ? bytes : await getLocalBatchTargetSize(request.targetDirectory.path, plan.targetNames).catch(() => 0);
			await this.cleanupBatchSourcesAfterTar(request, items, operation);
			this.fireTransferProgress(request, resultBytes, resultBytes, 'complete', 'Batch tar download completed.', true, { strategy: 'tar-download', completedItems: items.length, totalItems: items.length });
			return this.createBatchTransferResult(true, 'tar-download', resultBytes, 'Batch tar download completed.', items.length, 0, [], startedAt, request.progressId);
		}

		if (request.source.kind === 'ssh' && request.targetDirectory.kind === 'ssh') {
			if (!forceProtocol && !shouldPreferTarForMultiItemTransfer(getSshToSshTransferProtocol(request.source))) {
				return undefined;
			}
			if (request.source.supportsTar === false || request.targetDirectory.supportsTar === false || looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.targetDirectory.path)) {
				return undefined;
			}
			const plan = this.createRemoteBatchTarPlan(items);
			if (!plan) {
				return undefined;
			}
			const bytes = expectedBytes > 0 ? expectedBytes : await this.getRemoteBatchSourceContentSize(request.source, items);
			let directFailure: unknown;
			if (request.strategyHint !== 'relay') {
				try {
					const directResult = await this.tryDirectBatchTarTransfer(request, items, plan, operation, bytes, startedAt);
					if (directResult?.ok) {
						return directResult;
					}
				} catch (error) {
					if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
						throw new TurboFileTransferCanceledError();
					}
					directFailure = error;
				}
			}
			if (request.strategyHint === 'direct') {
				if (directFailure) {
					throw directFailure;
				}
				return undefined;
			}
			return this.tryRelayBatchTarTransfer(request, items, plan, operation, bytes, startedAt);
		}

		return undefined;
	}

	private createRemoteBatchTarPlan(items: readonly ITurboFileBatchTransferItem[]): ITarBatchPlan | undefined {
		if (!items.length) {
			return undefined;
		}
		const parentPath = getRemoteParentPath(items[0].sourcePath);
		const names: string[] = [];
		const targetNames: string[] = [];
		for (const item of items) {
			const name = getTransferName(item.sourcePath);
			if (!name || getRemoteParentPath(item.sourcePath) !== parentPath || item.targetName !== name) {
				return undefined;
			}
			names.push(name);
			targetNames.push(item.targetName);
		}
		return { parentPath, names, targetNames };
	}

	private async getLocalBatchTarBytes(items: readonly ITurboFileBatchTransferItem[]): Promise<number> {
		let total = 0;
		for (const item of items) {
			total += await getLocalPathSize(item.sourcePath).catch(() => Math.max(0, item.expectedBytes ?? 0));
		}
		return total;
	}

	private async getRemoteBatchSourceContentSize(source: ITurboFileTransferEndpoint, items: readonly ITurboFileBatchTransferItem[]): Promise<number> {
		let total = 0;
		for (const item of items) {
			total += await this.getRemotePathContentSizeByCommand({ ...source, path: item.sourcePath }).catch(() => Math.max(0, item.expectedBytes ?? 0));
		}
		return total;
	}

	private async getRemoteBatchTargetContentSize(targetDirectory: ITurboFileTransferEndpoint, targetNames: readonly string[]): Promise<number> {
		let total = 0;
		for (const targetName of targetNames) {
			total += await this.getRemotePathContentSizeByCommand({ ...targetDirectory, path: joinRemotePath(targetDirectory.path, targetName) }).catch(() => 0);
		}
		return total;
	}

	private beginRemoteBatchTargetGrowthTiming(progressId: string | undefined, targetDirectory: ITurboFileTransferEndpoint, targetNames: readonly string[], baselineSize = 0, expectedBytes = 0, onProgress?: (transferredBytes: number) => void, pollIntervalMs = TRANSFER_PROGRESS_EVENT_INTERVAL_MS, initialDelayMs = 0): () => void {
		return this.beginTransferGrowthTiming(progressId, () => this.getRemoteBatchTargetContentSize(targetDirectory, targetNames), baselineSize, expectedBytes, onProgress, pollIntervalMs, initialDelayMs);
	}

	private async prepareLocalBatchTarTarget(targetDirectory: string, targetNames: readonly string[]): Promise<void> {
		await ensureLocalDirectory(targetDirectory);
		for (const targetName of targetNames) {
			await throwIfLocalTargetDirectoryExists(join(targetDirectory, targetName));
		}
	}

	private async cleanupBatchSourcesAfterTar(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move'): Promise<void> {
		if (operation !== 'move') {
			return;
		}
		const cleanupFailures = await this.deleteBatchSources(request.source, items);
		if (cleanupFailures.length) {
			throw new Error(`Batch transfer completed, but source cleanup failed for ${cleanupFailures.length} item(s).`);
		}
	}

	private async runLocalBatchTarUploads(plans: readonly ITarBatchPlan[], targetDirectory: ITurboFileTransferEndpoint, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		for (const plan of plans) {
			this.throwIfTransferCanceled(progressId);
			await this.runLocalBatchTarUpload(plan, targetDirectory, progressId, onArchiveDelta);
		}
	}

	private async runLocalBatchTarUpload(plan: ITarBatchPlan, targetDirectory: ITurboFileTransferEndpoint, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		if (targetDirectory.kind !== 'ssh' || !targetDirectory.connection) {
			throw new Error('Missing SSH target.');
		}
		const localTarRoot = await this.createLocalTarRootAliasIfNeeded(plan.parentPath, plan.requiresSafeParentPath === true);
		const tarPlan = localTarRoot.path === plan.parentPath
			? plan
			: { ...plan, parentPath: localTarRoot.path };
		try {
			try {
				await this.runParallelLocalBatchTarUpload(tarPlan, targetDirectory.connection, targetDirectory.path, progressId, onArchiveDelta);
				return;
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				// Parallel raw tar|ssh is the stable default for local multi-file/folder uploads.
			}
			try {
				await this.runParallelLocalBatchTarZstdUpload(tarPlan, targetDirectory.connection, targetDirectory.path, progressId, onArchiveDelta);
				return;
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				// Parallel tar+zstd+ssh is the measured fast path. If unavailable, try single native tar|ssh.
			}
			try {
				await this.prepareRemoteBatchTarTarget(targetDirectory.connection, targetDirectory.path, tarPlan.targetNames, progressId, false);
				await this.runNativeLocalBatchTarUploadFromList(tarPlan, targetDirectory.connection, buildTarExtractStreamToDirectoryCommand(targetDirectory.path), progressId, onArchiveDelta);
				return;
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				throw new Error(`Native batch tar upload failed: ${formatTransferError(error)}`);
			}
		} finally {
			await localTarRoot.dispose();
		}
	}

	private async runNativeLocalBatchTarUploadFromList(plan: ITarBatchPlan, connection: ITurboFileSshConnectionOptions, remoteCommand: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		const tempRoot = join(tmpdir(), `turbofile-batch-tar-${randomUUID()}`);
		await fsp.mkdir(tempRoot, { recursive: true });
		try {
			const listPath = await this.writeLocalTarListFile(tempRoot, plan.names);
			await this.runNativeLocalTarUpload(['-cf', '-', '-C', plan.parentPath, '--null', '-T', listPath], connection, remoteCommand, progressId, onArchiveDelta);
		} finally {
			await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	private async runRemoteBatchTarDownload(source: ITurboFileTransferEndpoint, plan: ITarBatchPlan, targetDirectory: string, progressId: string | undefined, onArchiveDelta?: (delta: number) => void): Promise<void> {
		if (source.kind !== 'ssh' || !source.connection) {
			throw new Error('Missing SSH source.');
		}
		try {
			await this.runNativeLocalTarDownload(source.connection, buildTarCreateFromItemsCommand(plan.parentPath, plan.names), ['-xf', '-', '-C', targetDirectory], progressId, onArchiveDelta);
			return;
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			// Native ssh|tar is preferred for speed; ssh2 remains the compatibility fallback.
		}
		const configResult = await this.createConnectConfig(source.connection);
		if (!configResult.ok) {
			throw new Error(configResult.message);
		}
		let client: ISSHClient | undefined;
		let tarProcess: ReturnType<typeof spawn> | undefined;
		const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
			tarProcess?.kill();
			client?.end();
		});
		try {
			client = await this.connect(configResult.config);
			const sourceStream = await this.openRemoteCommandStream(client, buildTarCreateFromItemsCommand(plan.parentPath, plan.names), 'batch tar download create');
			tarProcess = spawn('tar.exe', [...await this.getLocalTarCharsetArgs(), '-xf', '-', '-C', targetDirectory], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
			if (!tarProcess.stdin || !tarProcess.stdout) {
				throw new Error('Local batch tar download did not provide pipes.');
			}
			tarProcess.stdout.resume();
			const tarClose = waitForLocalProcessClose(tarProcess, 'local batch tar download');
			await pipeline(sourceStream.stream as unknown as NodeJS.ReadableStream, createProgressPassThrough(onArchiveDelta), tarProcess.stdin);
			await sourceStream.close;
			await tarClose;
		} finally {
			unregisterCancel();
			client?.end();
		}
	}

	private async tryDirectBatchTarTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], plan: ITarBatchPlan, operation: 'copy' | 'move', expectedBytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.targetDirectory.kind !== 'ssh' || !request.source.connection || !request.targetDirectory.connection) {
			return undefined;
		}
		const routes = await this.resolveDirectSshRoutes(request.source, request.targetDirectory, request.progressId);
		if (!routes.length) {
			return undefined;
		}

		const failures: string[] = [];
		for (const route of routes) {
			try {
				const result = await this.tryDirectBatchTarTransferRoute(request, items, plan, operation, expectedBytes, startedAt, route);
				this.clearDirectSshRouteFailure(request.source, request.targetDirectory, route);
				return result;
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				this.markDirectSshRouteFailure(request.source, request.targetDirectory, route);
				failures.push(`${route}: ${formatTransferError(error)}`);
			}
		}

		this.clearDirectSshRouteCache(request.source, request.targetDirectory);
		throw new Error(`Direct batch tar failed: ${failures.join('; ')}`);
	}

	private async tryDirectBatchTarTransferRoute(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], plan: ITarBatchPlan, operation: 'copy' | 'move', expectedBytes: number, startedAt: number, route: TurboFileDirectSshRoute): Promise<ITurboFileBatchTransferResult> {
		const executorEndpoint = route === 'source-push' ? request.source : request.targetDirectory;
		const remoteEndpoint = route === 'source-push' ? request.targetDirectory : request.source;
		if (!executorEndpoint.connection || !remoteEndpoint.connection) {
			throw new Error('Direct batch tar route is missing SSH connection details.');
		}
		const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
		if (!executorConfigResult.ok) {
			throw new Error(executorConfigResult.message);
		}

		const client = await this.connectDirectSsh(executorConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		let credential: IRemoteScpCredential | undefined;
		let stopGrowthTiming: () => void = () => undefined;
		let lastActivityAt = Date.now();
		try {
			credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection);
			const remote = remoteEndpoint.connection;
			const remoteUserHost = `${remote.username}@${remote.host}`;
			const sshpassPrefix = buildSshpassPrefix(remote.password);
			const sshCommand = buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath);
			const command = route === 'source-push'
				? buildTarItemsSourcePushCommand(plan.parentPath, plan.names, request.targetDirectory.path, plan.targetNames, remoteUserHost, sshCommand, sshpassPrefix)
				: buildTarItemsTargetPullCommand(plan.parentPath, plan.names, request.targetDirectory.path, plan.targetNames, remoteUserHost, sshCommand, sshpassPrefix);
			this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing batch direct tar transfer.', true, { strategy: 'tar-direct', route, completedItems: 0, totalItems: items.length });
			stopGrowthTiming = this.beginRemoteBatchTargetGrowthTiming(request.progressId, request.targetDirectory, plan.targetNames, 0, expectedBytes, transferredBytes => {
				lastActivityAt = Date.now();
				this.fireTransferProgress(request, transferredBytes, expectedBytes, 'transfer', 'Batch direct tar transfer in progress.', false, { strategy: 'tar-direct', route, completedItems: 0, totalItems: items.length });
			});
			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, command, {
				inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
				inactivityMessage: `Direct batch tar ${route} produced no target growth for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
				getActivityTime: () => lastActivityAt,
				progressId: request.progressId
			});
			this.throwIfTransferCanceled(request.progressId);
			const bytes = expectedBytes > 0 ? expectedBytes : await this.getRemoteBatchTargetContentSize(request.targetDirectory, plan.targetNames).catch(() => 0);
			await this.cleanupBatchSourcesAfterTar(request, items, operation);
			this.fireTransferProgress(request, bytes, bytes, 'complete', 'Batch direct tar completed.', true, { strategy: 'tar-direct', route, completedItems: items.length, totalItems: items.length });
			return this.createBatchTransferResult(true, 'tar-direct', bytes, 'Batch direct tar completed.', items.length, 0, [], startedAt, request.progressId);
		} finally {
			stopGrowthTiming();
			if (credential?.cleanupCommand) {
				await this.execRemote(client, credential.cleanupCommand).catch(() => undefined);
			}
			unregisterCancel();
			client.end();
		}
	}

	private async tryRelayBatchTarTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], plan: ITarBatchPlan, operation: 'copy' | 'move', expectedBytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.targetDirectory.kind !== 'ssh' || !request.source.connection || !request.targetDirectory.connection) {
			return undefined;
		}
		const sourceConfigResult = await this.createConnectConfig(request.source.connection);
		const targetConfigResult = await this.createConnectConfig(request.targetDirectory.connection);
		if (!sourceConfigResult.ok || !targetConfigResult.ok) {
			return undefined;
		}

		let sourceClient: ISSHClient | undefined;
		let targetClient: ISSHClient | undefined;
		let stopGrowthTiming: () => void = () => undefined;
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
			sourceClient?.end();
			targetClient?.end();
		});
		try {
			sourceClient = await this.connect(sourceConfigResult.config);
			targetClient = await this.connect(targetConfigResult.config);
			this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing batch tar relay.', true, { strategy: 'tar-relay', route: 'relay', completedItems: 0, totalItems: items.length });
			stopGrowthTiming = this.beginRemoteBatchTargetGrowthTiming(request.progressId, request.targetDirectory, plan.targetNames, 0, expectedBytes, transferredBytes => {
				this.fireTransferProgress(request, transferredBytes, expectedBytes, 'relay-upload', 'Batch tar relay in progress.', false, { strategy: 'tar-relay', route: 'relay', completedItems: 0, totalItems: items.length });
			});
			this.markTransferDataStarted(request.progressId);
			const sourceStream = await this.openRemoteCommandStream(sourceClient, buildTarCreateFromItemsCommand(plan.parentPath, plan.names), 'batch tar relay create');
			const targetStream = await this.openRemoteCommandStream(targetClient, buildTarExtractToDirectoryCommand(request.targetDirectory.path, plan.targetNames), 'batch tar relay extract', true);
			await pipeline(sourceStream.stream as unknown as NodeJS.ReadableStream, targetStream.stream as unknown as NodeJS.WritableStream);
			await sourceStream.close;
			await targetStream.close;
			this.throwIfTransferCanceled(request.progressId);
			const bytes = expectedBytes > 0 ? expectedBytes : await this.getRemoteBatchTargetContentSize(request.targetDirectory, plan.targetNames).catch(() => 0);
			await this.cleanupBatchSourcesAfterTar(request, items, operation);
			this.fireTransferProgress(request, bytes, bytes, 'complete', 'Batch tar relay completed.', true, { strategy: 'tar-relay', route: 'relay', completedItems: items.length, totalItems: items.length });
			return this.createBatchTransferResult(true, 'tar-relay', bytes, 'Batch tar relay completed.', items.length, 0, [], startedAt, request.progressId);
		} finally {
			stopGrowthTiming();
			unregisterCancel();
			sourceClient?.end();
			targetClient?.end();
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
			await mapLimit(items, workerLimit, async (item, index) => {
				this.throwIfTransferCanceled(request.progressId);
				const childProgressId = `${request.progressId ?? 'turbofile-batch'}-${index}-${randomUUID()}`;
				childProgressIds.add(childProgressId);
				const childSource = disableRsync ? { ...request.source, path: item.sourcePath, supportsRsync: false } : { ...request.source, path: item.sourcePath };
				const childTarget = disableRsync ? { ...request.targetDirectory, path: this.joinBatchTargetPath(request.targetDirectory, item.targetName), supportsRsync: false } : { ...request.targetDirectory, path: this.joinBatchTargetPath(request.targetDirectory, item.targetName) };
				const disposable = this.onDynamicTransferProgress(childProgressId)(event => {
					transferredByItem[index] = event.transferredBytes;
					totalByItem[index] = Math.max(totalByItem[index], event.totalBytes);
					this.fireBatchAggregateProgress(request, transferredByItem, totalByItem, event.phase, event.detail ?? 'Batch transfer in progress.', completedItems, items.length, item.displayName ?? item.targetName, false, event.strategy);
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

	private fireBatchAggregateProgress(request: ITurboFileBatchTransferRequest, transferredByItem: readonly number[], totalByItem: readonly number[], phase: ITurboFileTransferProgressEvent['phase'], detail: string, completedItems: number, totalItems: number, currentName?: string, force = false, strategy?: ITurboFileTransferResult['strategy']): void {
		const transferredBytes = transferredByItem.reduce((sum, value) => sum + Math.max(0, value), 0);
		const totalBytes = Math.max(this.getBatchExpectedBytes(request, request.items), totalByItem.reduce((sum, value) => sum + Math.max(0, value), 0));
		this.fireTransferProgress(request, transferredBytes, totalBytes, phase, detail, force, {
			strategy,
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
				// Reuse the already-open directory session instead of withSftp, which opens a fresh SSH
				// connection every call — that handshake is the bulk of "new folder is slow", especially
				// on a high-latency remote host.
				await this.withDirectorySftp(endpoint, sftp => this.ensureRemoteDirectory(sftp, endpoint.path));
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

	async deletePaths(endpoints: readonly ITurboFileTransferEndpoint[], recursive = true): Promise<ITurboFileFileOperationResult> {
		const targets = endpoints.filter(endpoint => !!endpoint.path);
		if (!targets.length) {
			return { ok: true, message: 'Nothing to delete.' };
		}
		if (targets.length === 1) {
			return this.deletePath(targets[0], recursive);
		}

		try {
			const first = targets[0];
			if (first.kind === 'local') {
				// Local removals run in parallel; the OS handles each independently.
				await Promise.all(targets.map(endpoint => fsp.rm(endpoint.path, { recursive, force: true })));
				for (const endpoint of targets) {
					this.clearRemoteDirectoryListingCache(endpoint);
				}
				return { ok: true, message: 'Paths deleted.' };
			}

			for (const endpoint of targets) {
				this.assertSafeDeletePath(endpoint.path);
			}

			if (looksLikeWindowsPath(first.path)) {
				// Windows remote: one PowerShell call removes the whole list.
				await this.withSshClient(first, client => this.execRemote(client, buildWindowsDeleteManyCommand(targets.map(endpoint => endpoint.path), recursive)));
			} else {
				// POSIX remote: feed the NUL-delimited paths to `xargs -0 rm` in a single round trip;
				// xargs batches the actual rm invocations server-side so this scales to any selection
				// size without ever hitting the shell's argument-length limit.
				const input = Buffer.from(`${targets.map(endpoint => endpoint.path).join('\0')}\0`, 'utf8');
				const removeFlag = recursive ? '-rf' : '-f';
				await this.withSshClient(first, client => this.execRemoteWithInput(client, `LC_ALL=C xargs -0 -r rm ${removeFlag} --`, input, { timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS }));
			}
			this.clearRemoteDirectoryListingCache(first);
			return { ok: true, message: 'Paths deleted.' };
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

	async movePathsIntoDirectory(sources: readonly ITurboFileTransferEndpoint[], targetDirectory: string): Promise<ITurboFileFileOperationResult> {
		const targets = sources.filter(endpoint => !!endpoint.path);
		if (!targets.length) {
			return { ok: true, message: 'Nothing to move.' };
		}
		const first = targets[0];
		const windowsPath = looksLikeWindowsPath(targetDirectory) || looksLikeWindowsPath(first.path);

		try {
			if (first.kind === 'local') {
				// Local moves are metadata-only and have no network cost; run them in parallel.
				await Promise.all(targets.map(endpoint => this.moveLocalPathNative(endpoint.path, joinRemotePath(targetDirectory, getTransferName(endpoint.path)))));
			} else if (windowsPath) {
				// Windows remote: move each into the directory. Rare path, kept simple for correctness.
				for (const endpoint of targets) {
					await this.moveRemotePathNative(endpoint, joinRemotePath(targetDirectory, getTransferName(endpoint.path)));
				}
			} else {
				// POSIX remote: a single round trip moves the whole selection. The NUL-delimited sources
				// are fed to `xargs -0`, which runs `mv -- <files> <dir>` server-side (batching as needed
				// to stay under the argument-length limit), so a 1000-file move is one near-instant rename
				// instead of 1000 separate SSH round trips. `mv` drops each file into <dir> under its own
				// name, so no per-file target path needs computing.
				const dir = quotePosixShellArg(targetDirectory);
				const command = `mkdir -p -- ${dir} && LC_ALL=C xargs -0 -r sh -c 'mv -f -- "$@" "$0"' ${dir}`;
				const input = Buffer.from(`${targets.map(endpoint => endpoint.path).join('\0')}\0`, 'utf8');
				await this.withSshClient(first, client => this.execRemoteWithInput(client, command, input, { timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS }));
			}
			this.clearRemoteDirectoryListingCache(first);
			this.clearRemoteDirectoryListingCache(first, targetDirectory);
			return { ok: true, message: 'Paths moved.' };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async calculatePathSize(endpoint: ITurboFileTransferEndpoint): Promise<ITurboFilePathSizeResult> {
		try {
			const size = endpoint.kind === 'local'
				? await getLocalPathSizeByCommand(endpoint.path)
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
			const paths = await readWindowsClipboardFilePaths();
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

	async startWindowsFileDrag(request: ITurboFileStartWindowsDragRequest): Promise<ITurboFileStartWindowsDragResult> {
		if (platform() !== 'win32') {
			return { ok: false, message: 'Windows file drag is only supported on Windows.' };
		}

		const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed() && !candidate.webContents.isDestroyed());
		if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
			return { ok: false, message: 'No TurboFile window is available for Windows drag.' };
		}

		if (request.source.kind === 'ssh') {
			return this.startRemoteWindowsFileDrag(request, window);
		}

		if (request.source.kind !== 'local') {
			return { ok: false, message: 'Unsupported Windows drag source.' };
		}

		const files = request.items
			.map(item => item.sourcePath)
			.filter(path => isWindowsClipboardPath(path));
		if (!files.length) {
			return { ok: false, message: 'No local Windows files are available to drag.' };
		}

		try {
			window.webContents.startDrag({
				file: files[0],
				files,
				icon: createWindowsDragIcon()
			});
			return { ok: true, message: 'Windows file drag started.' };
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : String(error)
			};
		}
	}

	private async startRemoteWindowsFileDrag(request: ITurboFileStartWindowsDragRequest, window: BrowserWindow): Promise<ITurboFileStartWindowsDragResult> {
		if (!request.source.connection) {
			return { ok: false, message: 'Missing SSH source connection for Windows drag.' };
		}
		if (!request.items.length) {
			return { ok: false, message: 'No SSH files are available to drag.' };
		}

		const token = randomUUID();
		const fakeDirectoryName = createWindowsDragFakeDirectoryName(token);
		const paths = this.getWindowsDragCopyHookPaths(token, fakeDirectoryName);
		try {
			await this.ensureWindowsDragCopyHookRegistered();
			await fsp.rm(paths.activeRoot, { recursive: true, force: true }).catch(() => undefined);
			await fsp.rm(paths.targetFile, { force: true }).catch(() => undefined);
			await fsp.mkdir(paths.fakeDirectory, { recursive: true });
			await fsp.mkdir(dirname(paths.targetFile), { recursive: true });
			window.webContents.startDrag({
				file: paths.fakeDirectory,
				files: [paths.fakeDirectory],
				icon: createWindowsDragIcon()
			});

			const targetDirectory = await this.waitForWindowsDragCopyHookTarget(paths.targetFile, fakeDirectoryName);
			return { ok: true, message: 'Windows drop target captured.', targetDirectory };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				ok: false,
				message,
				canceled: message.includes('timed out')
			};
		} finally {
			await fsp.rm(paths.activeRoot, { recursive: true, force: true }).catch(() => undefined);
			await fsp.rm(paths.targetFile, { force: true }).catch(() => undefined);
		}
	}

	private getWindowsDragCopyHookPaths(token: string, fakeDirectoryName: string): { readonly activeRoot: string; readonly fakeDirectory: string; readonly targetFile: string } {
		const root = this.getWindowsDragCopyHookRoot();
		const activeRoot = join(root, TURBOFILE_WINDOWS_DRAG_ACTIVE_DIR, token);
		return {
			activeRoot,
			fakeDirectory: join(activeRoot, fakeDirectoryName),
			targetFile: join(root, TURBOFILE_WINDOWS_DRAG_TARGETS_DIR, `${token}.target`)
		};
	}

	private getWindowsDragCopyHookRoot(): string {
		const localAppData = process.env.LOCALAPPDATA;
		if (!localAppData) {
			throw new Error('LOCALAPPDATA is required for SSH drag to Windows.');
		}
		return join(localAppData, TURBOFILE_WINDOWS_DRAG_APP_DIR, TURBOFILE_WINDOWS_DRAG_ROOT_DIR);
	}

	private async waitForWindowsDragCopyHookTarget(targetFile: string, fakeDirectoryName: string): Promise<string> {
		const deadline = Date.now() + WINDOWS_DRAG_COPY_HOOK_TIMEOUT_MS;
		const desktopFallbackDirs = this.getWindowsDragDesktopFallbackDirs();
		while (Date.now() < deadline) {
			// 1) The CopyHook captured the destination. This covers drops onto ordinary directories and
			//    open Explorer windows (the hook is registered for the file-system Directory class).
			try {
				const raw = await fsp.readFile(targetFile, 'utf8');
				const captured = raw.replace(/^\uFEFF/, '');
				if (captured) {
					const targetDirectory = normalizeWindowsCopyHookDestination(captured, fakeDirectoryName);
					if (!isWindowsClipboardPath(targetDirectory)) {
						throw new Error(`Captured Windows drop target is invalid: ${targetDirectory}`);
					}
					return targetDirectory;
				}
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
					throw error;
				}
			}

			// 2) Fallback for drops onto the live Desktop. The desktop background is a special shell
			//    folder, so its drop is handled by the desktop's own drop target and never consults the
			//    Directory CopyHook (confirmed via the hook log: ordinary folders on any drive fire the
			//    hook, the relocated D:\Desktop drop does not). In that case Explorer physically copies
			//    the empty fake folder onto the desktop, so detect it there and use the desktop \u2014 resolved
			//    through Electron so it follows a relocated (e.g. D:\Desktop) shell folder \u2014 as the target.
			for (const desktopDir of desktopFallbackDirs) {
				const landedFolder = join(desktopDir, fakeDirectoryName);
				try {
					if ((await fsp.stat(landedFolder)).isDirectory()) {
						await fsp.rm(landedFolder, { recursive: true, force: true }).catch(() => undefined);
						return desktopDir;
					}
				} catch {
					// The fake folder has not landed in this candidate yet; keep polling.
				}
			}
			await delay(WINDOWS_DRAG_COPY_HOOK_POLL_MS);
		}

		throw new Error('Windows drop target capture timed out.');
	}

	/**
	 * Resolves the real Desktop directory for the "桌面" quick-nav shortcut. `app.getPath('desktop')`
	 * follows a Desktop relocated to another drive (e.g. D:\Desktop), so clicking 桌面 lands on the
	 * folder the OS actually uses — which is also where Explorer drops dragged files.
	 */
	async getLocalDesktopPath(): Promise<string> {
		try {
			const desktop = app.getPath('desktop');
			if (desktop) {
				return desktop;
			}
		} catch {
			// Electron could not resolve the desktop; fall back to the profile path below.
		}
		if (process.env.USERPROFILE) {
			return join(process.env.USERPROFILE, 'Desktop');
		}
		return '';
	}

	/**
	 * Candidate Desktop directories used to recover a drop the Directory CopyHook never saw (see
	 * {@link waitForWindowsDragCopyHookTarget}). `app.getPath('desktop')` honors a relocated Desktop
	 * (e.g. moved to D:\), and the raw profile Desktop is added as a defensive secondary.
	 */
	private getWindowsDragDesktopFallbackDirs(): string[] {
		const dirs: string[] = [];
		const add = (dir: string | undefined): void => {
			if (dir && !dirs.some(existing => existing.toLowerCase() === dir.toLowerCase())) {
				dirs.push(dir);
			}
		};
		try {
			add(app.getPath('desktop'));
		} catch {
			// Electron could not resolve the desktop; fall back to the profile path below.
		}
		if (process.env.USERPROFILE) {
			add(join(process.env.USERPROFILE, 'Desktop'));
		}
		return dirs;
	}

	private async ensureWindowsDragCopyHookRegistered(): Promise<void> {
		if (!this.windowsDragCopyHookRegistrationPromise) {
			this.windowsDragCopyHookRegistrationPromise = this.registerWindowsDragCopyHook().catch(error => {
				this.windowsDragCopyHookRegistrationPromise = undefined;
				throw error;
			});
		}
		await this.windowsDragCopyHookRegistrationPromise;
	}

	private async registerWindowsDragCopyHook(): Promise<void> {
		const dllPath = this.resolveWindowsDragCopyHookDllPath();
		const clsidKey = `HKCU\\Software\\Classes\\CLSID\\${TURBOFILE_WINDOWS_DRAG_COPY_HOOK_CLSID}`;
		const inprocKey = `${clsidKey}\\InprocServer32`;
		const handlerKey = 'HKCU\\Software\\Classes\\Directory\\shellex\\CopyHookHandlers\\TurboFileCopyHook';
		await runLocalCommand('reg.exe', ['add', clsidKey, '/ve', '/d', 'TurboFile Windows Drag CopyHook', '/f']);
		await runLocalCommand('reg.exe', ['add', inprocKey, '/ve', '/d', dllPath, '/f']);
		await runLocalCommand('reg.exe', ['add', inprocKey, '/v', 'ThreadingModel', '/t', 'REG_SZ', '/d', 'Apartment', '/f']);
		await runLocalCommand('reg.exe', ['add', handlerKey, '/ve', '/d', TURBOFILE_WINDOWS_DRAG_COPY_HOOK_CLSID, '/f']);
		await runLocalPowerShellScript(createWindowsShellAssociationChangedScript());
		await this.ensureWindowsExplorerLoadedDragCopyHook(dllPath);
	}

	/**
	 * The running Explorer caches its CopyHook handler list, so a newly-registered handler is
	 * ignored until Explorer reloads. We restart Explorer exactly once per DLL build (tracked by a
	 * signature marker), so the handler becomes active without forcing the user to log off/restart.
	 * Subsequent OS sessions load it on demand automatically because the registration is persistent.
	 */
	private async ensureWindowsExplorerLoadedDragCopyHook(dllPath: string): Promise<void> {
		const signature = await this.getWindowsDragCopyHookDllSignature(dllPath);
		const markerPath = join(this.getWindowsDragCopyHookRoot(), 'explorer-loaded.signature');
		const stored = await fsp.readFile(markerPath, 'utf8').then(value => value.trim()).catch(() => '');
		if (stored === signature) {
			return;
		}
		await this.restartWindowsExplorer();
		await fsp.mkdir(dirname(markerPath), { recursive: true }).catch(() => undefined);
		await fsp.writeFile(markerPath, signature).catch(() => undefined);
	}

	private async getWindowsDragCopyHookDllSignature(dllPath: string): Promise<string> {
		const stat = await fsp.stat(dllPath).catch(() => undefined);
		return stat ? `${dllPath}|${stat.size}|${Math.round(stat.mtimeMs)}` : dllPath;
	}

	private async restartWindowsExplorer(): Promise<void> {
		// Stop every Explorer shell instance and relaunch one so the new shell process reads the
		// freshly-registered CopyHook handler. Best-effort: never let a shell hiccup fail a transfer.
		await runLocalPowerShellScript('Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }').catch(() => undefined);
		await delay(1200);
	}

	private resolveWindowsDragCopyHookDllPath(): string {
		const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
		const candidates = [
			join(process.cwd(), 'resources', 'turbofile', 'drag-ext', 'x64', 'TurboFileDragExt.dll'),
			join(app.getAppPath(), 'resources', 'turbofile', 'drag-ext', 'x64', 'TurboFileDragExt.dll'),
			resourcesPath ? join(resourcesPath, 'app', 'resources', 'turbofile', 'drag-ext', 'x64', 'TurboFileDragExt.dll') : undefined,
			resourcesPath ? join(resourcesPath, 'resources', 'turbofile', 'drag-ext', 'x64', 'TurboFileDragExt.dll') : undefined
		].filter((candidate): candidate is string => !!candidate);
		const found = candidates.find(candidate => existsSync(candidate));
		if (!found) {
			throw new Error(`TurboFile Windows drag extension DLL was not found. Run scripts\\build-turbofile-drag-ext.ps1. Checked: ${candidates.join(', ')}`);
		}
		return found;
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
				height: imageSize?.height,
				originalWidth: imageSize?.width,
				originalHeight: imageSize?.height
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
				height: result.height,
				originalWidth: result.originalWidth,
				originalHeight: result.originalHeight
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

	async readImageBatch(endpoint: ITurboFileTransferEndpoint, paths: readonly string[], maxWidth = 0): Promise<ITurboFileImageBatchEntry[]> {
		const targets = [...new Set(paths.filter(path => !!path))];
		if (!targets.length) {
			return [];
		}

		if (endpoint.kind !== 'ssh' || !endpoint.connection) {
			return Promise.all(targets.map(async path => {
				try {
					const stat = await fsp.stat(path);
					if (stat.size > IMAGE_BATCH_MAX_FILE_BYTES) {
						return { path, ok: false, oversized: true };
					}
					const buffer = await fsp.readFile(path);
					return { path, ok: true, content: buffer.toString('base64'), mime: getMimeType(path) };
				} catch (error) {
					return { path, ok: false, message: error instanceof Error ? error.message : String(error) };
				}
			}));
		}

		// The batch command is POSIX shell; a Windows SSH host can't run it. Report oversized so the
		// caller transparently falls back to the per-image resource path that handles Windows remotes.
		if (looksLikeWindowsPath(targets[0])) {
			return targets.map(path => ({ path, ok: false, oversized: true }));
		}

		// One SSH round trip streams the whole page back, length-framed. Small originals stream raw
		// (instant, zero processing — works on any weak board). Larger originals are downscaled to a
		// small JPEG by a remote tool when one is available (vipsthumbnail preferred, then ImageMagick),
		// so the transfer shrinks by ~10-50x and big images load nearly as fast as small ones; boards
		// with no image tool simply stream the original bytes. The client does no re-encoding.
		await this.acquireImageReadSlot();
		try {
			const command = buildPosixReadImagesBatchCommand(targets, IMAGE_BATCH_MAX_FILE_BYTES, maxWidth);
			const output = await this.withDirectorySshClient(endpoint, client => this.execRemoteBytes(client, command, {
				inactivityTimeoutMs: REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS,
				inactivityMessage: 'Image batch read produced no output.',
				timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS
			}));
			return parseImageBatchOutput(output);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return targets.map(path => ({ path, ok: false, message, transient: true }));
		} finally {
			this.releaseImageReadSlot();
		}
	}

	async createImageResource(endpoint: ITurboFileTransferEndpoint, options: ITurboFileImageResourceOptions = {}): Promise<ITurboFileImageResourceResult> {
		try {
			const now = Date.now();
			this.trimExpiredImageResources(now);
			this.ensureImageResourceCleanupTimer();

			const token = randomUUID();
			this.imageResourceDescriptors.set(token, {
				endpoint,
				options: { ...options },
				createdAt: now,
				expiresAt: now + IMAGE_RESOURCE_TTL_MS
			});

			return {
				ok: true,
				message: 'Image resource created.',
				url: `${TURBOFILE_IMAGE_RESOURCE_SCHEME}://${token}`,
				mime: getMimeType(endpoint.path)
			};
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : String(error),
				mime: getMimeType(endpoint.path)
			};
		}
	}

	async releaseImageResource(url: string): Promise<void> {
		const token = this.getImageResourceToken(url);
		if (token) {
			this.imageResourceDescriptors.delete(token);
		}
	}

	private ensureTurboFileImageProtocolRegistered(): void {
		TurboFileSshMainService.imageProtocolService = this;
		if (TurboFileSshMainService.imageProtocolRegistered) {
			return;
		}

		protocol.handle(TURBOFILE_IMAGE_RESOURCE_SCHEME, request => {
			const service = TurboFileSshMainService.imageProtocolService;
			if (!service) {
				return new Response('TurboFile image service is unavailable.', { status: 503 });
			}
			return service.handleTurboFileImageProtocolRequest(request);
		});
		TurboFileSshMainService.imageProtocolRegistered = true;
	}

	private async handleTurboFileImageProtocolRequest(request: GlobalRequest): Promise<GlobalResponse> {
		try {
			const token = this.getImageResourceToken(request.url);
			if (!token) {
				return new Response('Invalid TurboFile image resource.', { status: 400 });
			}

			const descriptor = this.imageResourceDescriptors.get(token);
			if (!descriptor) {
				return new Response('TurboFile image resource was not found.', { status: 404 });
			}

			const now = Date.now();
			if (descriptor.expiresAt <= now) {
				this.imageResourceDescriptors.delete(token);
				return new Response('TurboFile image resource expired.', { status: 410 });
			}

			descriptor.expiresAt = now + IMAGE_RESOURCE_TTL_MS;
			const result = await this.readImageBuffer(descriptor.endpoint, descriptor.options);
			const body = result.buffer.buffer.slice(result.buffer.byteOffset, result.buffer.byteOffset + result.buffer.byteLength) as ArrayBuffer;
			return new Response(body, {
				status: 200,
				headers: {
					'Content-Type': result.mime || getMimeType(descriptor.endpoint.path),
					'Cache-Control': 'no-store'
				}
			});
		} catch (error) {
			return new Response(error instanceof Error ? error.message : String(error), { status: 500 });
		}
	}

	private getImageResourceToken(url: string): string | undefined {
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== `${TURBOFILE_IMAGE_RESOURCE_SCHEME}:`) {
				return undefined;
			}
			const token = parsed.hostname || parsed.pathname.replace(/^\/+/, '').split('/')[0];
			return token ? decodeURIComponent(token) : undefined;
		} catch {
			return undefined;
		}
	}

	private ensureImageResourceCleanupTimer(): void {
		if (this.imageResourceCleanupTimer) {
			return;
		}
		this.imageResourceCleanupTimer = setInterval(() => this.trimExpiredImageResources(Date.now()), IMAGE_RESOURCE_CLEANUP_INTERVAL_MS);
		(this.imageResourceCleanupTimer as unknown as { unref?: () => void }).unref?.();
	}

	private trimExpiredImageResources(now: number): void {
		for (const [token, descriptor] of this.imageResourceDescriptors) {
			if (descriptor.expiresAt <= now) {
				this.imageResourceDescriptors.delete(token);
			}
		}
		if (this.imageResourceDescriptors.size === 0 && this.imageResourceCleanupTimer) {
			clearInterval(this.imageResourceCleanupTimer);
			this.imageResourceCleanupTimer = undefined;
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
					// Reuse the open directory session rather than opening a fresh SSH connection per call,
					// so creating/saving a file on a high-latency remote host is not gated on a handshake.
					await this.withDirectorySftp(endpoint, async sftp => {
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
				await runLocalCommand('tar.exe', [...await this.getLocalTarCharsetArgs(), '-a', '-cf', archivePath, '-C', dirname(endpoint.path), basename(endpoint.path)]);
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
				// bsdtar (Windows tar.exe / libarchive) extracts tar*, zip, 7z and rar. Force UTF-8 only
				// for tar-family archives; zip/rar/7z carry their own encoding (zip UTF-8 flag, otherwise
				// the creator's code page) and libarchive must auto-detect it to avoid garbling names.
				const charsetArgs = isTurboFileTarFamilyArchivePath(endpoint.path) ? await this.getLocalTarCharsetArgs() : [];
				await runLocalCommand('tar.exe', [...charsetArgs, '-xf', endpoint.path, '-C', outputDirectory]);
			} else {
				const quotedArchive = quotePosixShellArg(endpoint.path);
				const outputSetup = `out=${quotePosixShellArg(outputDirectory)}; if [ -e "$out" ] && [ ! -d "$out" ]; then out="$out"_extracted; fi; mkdir -p "$out"`;
				const command = `${outputSetup} && ${buildTurboFileRemoteExtractCommand(endpoint.path, quotedArchive)}`;
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

		// Use a dedicated connection per terminal instead of reusing the directory-browsing client.
		// Sharing coupled the terminal's lifetime to the directory session's idle timer, so an
		// unrelated idle eviction could close the client mid-task and kill the terminal. A dedicated
		// connection lives until the user closes the terminal (or a real network failure).
		const client = await this.connect(configResult.config);
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
				closed: false
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
			client.end();
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
		await this.execRemoteCopyWithProgress(request, command, bytes, sourceType);
		this.throwIfTransferCanceled(request.progressId);
		if (bytes === 0 && expectedBytes === 0) {
			bytes = await this.getRemotePathSizeByCommand(request.target).catch(() => 0);
		}
		return this.createTransferResult(true, 'remote-copy', bytes, 'Remote copy completed.', startedAt, request.progressId);
	}

	private async tryDirectTarTransfer(request: ITurboFileTransferRequest, startedAt: number, forceProtocol = false): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (request.strategyHint === 'relay') {
			return undefined;
		}
		if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== 'tar') {
			return undefined;
		}
		if (request.source.supportsTar === false || request.target.supportsTar === false || looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}

		const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown' as TurboFileFileType);
		if (sourceType !== 'directory') {
			return undefined;
		}

		let bytes = Math.max(0, request.expectedBytes ?? 0);
		if (bytes <= 0) {
			bytes = await this.getRemotePathContentSizeByCommand(request.source).catch(() => 0);
		}

		const routes = await this.resolveDirectSshRoutes(request.source, request.target, request.progressId);
		if (!routes.length) {
			return undefined;
		}

		const failures: string[] = [];
		for (const route of routes) {
			try {
				const result = await this.tryDirectTarTransferRoute(request, startedAt, bytes, route);
				this.clearDirectSshRouteFailure(request.source, request.target, route);
				return result;
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				this.markDirectSshRouteFailure(request.source, request.target, route);
				failures.push(`${route}: ${formatTransferError(error)}`);
			}
		}

		this.clearDirectSshRouteCache(request.source, request.target);
		throw new Error(`Direct tar failed: ${failures.join('; ')}`);
	}

	private async tryDirectTarTransferRoute(request: ITurboFileTransferRequest, startedAt: number, expectedBytes: number, route: TurboFileDirectSshRoute): Promise<ITurboFileTransferResult> {
		const executorEndpoint = route === 'source-push' ? request.source : request.target;
		const remoteEndpoint = route === 'source-push' ? request.target : request.source;
		if (!executorEndpoint.connection || !remoteEndpoint.connection) {
			throw new Error('Direct tar route is missing SSH connection details.');
		}

		const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
		if (!executorConfigResult.ok) {
			throw new Error(executorConfigResult.message);
		}

		const client = await this.connectDirectSsh(executorConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		let credential: IRemoteScpCredential | undefined;
		let stopGrowthTiming: () => void = () => undefined;
		let lastActivityAt = Date.now();
		const markActivity = (): void => {
			lastActivityAt = Date.now();
		};
		try {
			this.throwIfTransferCanceled(request.progressId);
			credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection);
			const remote = remoteEndpoint.connection;
			const remoteUserHost = `${remote.username}@${remote.host}`;
			const sshpassPrefix = buildSshpassPrefix(remote.password);
			const sshCommand = buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath);
			const command = route === 'source-push'
				? buildTarSourcePushCommand(request.source.path, request.target.path, remoteUserHost, sshCommand, sshpassPrefix)
				: buildTarTargetPullCommand(request.source.path, request.target.path, remoteUserHost, sshCommand, sshpassPrefix);

			this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing direct tar transfer.', true, { strategy: 'tar-direct', route });
			stopGrowthTiming = this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, expectedBytes, transferredBytes => {
				markActivity();
				this.fireTransferProgress(request, transferredBytes, expectedBytes, 'transfer', 'Direct tar transfer in progress.', false, { strategy: 'tar-direct', route });
			});
			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, command, {
				inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
				inactivityMessage: `Direct tar ${route} produced no target growth for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
				getActivityTime: () => lastActivityAt,
				progressId: request.progressId
			});
			this.throwIfTransferCanceled(request.progressId);
			const targetSize = await this.getRemotePathContentSizeByCommand(request.target).catch(() => expectedBytes);
			if (expectedBytes > 0 && targetSize !== expectedBytes) {
				throw new Error(`Direct tar size mismatch: expected ${expectedBytes}, got ${targetSize}.`);
			}
			const bytes = expectedBytes > 0 ? expectedBytes : targetSize;
			this.fireTransferProgress(request, bytes, bytes, 'complete', 'Direct tar completed.', true, { strategy: 'tar-direct', route });
			return this.createTransferResult(true, 'tar-direct', bytes, 'Direct tar completed.', startedAt, request.progressId);
		} catch (error) {
			if (this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			throw error;
		} finally {
			stopGrowthTiming();
			if (credential?.cleanupCommand) {
				await this.execRemote(client, credential.cleanupCommand).catch(() => undefined);
			}
			unregisterCancel();
			client.end();
		}
	}

	private async tryDirectRsyncTransfer(request: ITurboFileTransferRequest, startedAt: number, allowAutoFast = false): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (request.strategyHint === 'relay') {
			return undefined;
		}
		const protocol = getSshToSshTransferProtocol(request.source);
		if (protocol !== 'rsync' && !(allowAutoFast && protocol === 'auto-fast')) {
			return undefined;
		}
		if (request.source.supportsRsync !== true || request.target.supportsRsync !== true) {
			return undefined;
		}
		if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}
		this.throwIfTransferCanceled(request.progressId);

		const routes = await this.resolveDirectSshRoutes(request.source, request.target, request.progressId);
		if (!routes.length) {
			return undefined;
		}

		const failures: string[] = [];
		for (const route of routes) {
			try {
				const result = await this.tryDirectRsyncTransferRoute(request, startedAt, route);
				this.clearDirectSshRouteFailure(request.source, request.target, route);
				return result;
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				this.markDirectSshRouteFailure(request.source, request.target, route);
				failures.push(`${route}: ${formatTransferError(error)}`);
			}
		}

		this.clearDirectSshRouteCache(request.source, request.target);
		throw new Error(`Direct rsync failed: ${failures.join('; ')}`);
	}

	private async tryDirectRsyncTransferRoute(request: ITurboFileTransferRequest, startedAt: number, route: TurboFileDirectSshRoute): Promise<ITurboFileTransferResult> {
		const executorEndpoint = route === 'source-push' ? request.source : request.target;
		const remoteEndpoint = route === 'source-push' ? request.target : request.source;
		if (!executorEndpoint.connection || !remoteEndpoint.connection) {
			throw new Error('Direct rsync route is missing SSH connection details.');
		}
		const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
		if (!executorConfigResult.ok) {
			throw new Error(executorConfigResult.message);
		}

		const client = await this.connectDirectSsh(executorConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		let lastActivityAt = Date.now();
		const markActivity = (): void => {
			lastActivityAt = Date.now();
		};
		try {
			this.throwIfTransferCanceled(request.progressId);
			this.fireTransferProgress(request, 0, 0, 'transfer', 'Starting direct rsync transfer.', true, { strategy: 'rsync-direct', route });
			const remote = remoteEndpoint.connection;
			const remoteUserHost = `${remote.username}@${remote.host}`;
			const sshBinary = await this.resolveRemoteRsyncSshBinary(client, executorEndpoint.connection);
			const sshTransport = buildOptimizedRsyncSshCommand(remote.port || 22, !!remote.password, sshBinary);
			const sshpassPrefix = buildSshpassPrefix(remote.password);

			const sourceType = request.sourceType ?? await this.withSftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown' as TurboFileFileType);
			const sourceIsDirectory = sourceType === 'directory';
			let bytes = 0;

			const remoteTargetPath = sourceIsDirectory ? request.target.path : getRemoteParentPath(request.target.path);
			const rsyncOptions = buildRsyncOptions(true);
			const rsyncPathOption = route === 'source-push' ? ` ${buildRsyncPathWithMkdirShellOption(remoteTargetPath)}` : '';
			const rsyncSourcePath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.source.path) : request.source.path;
			const rsyncTargetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
			const rsyncSourceArg = route === 'source-push' ? rsyncSourcePath : `${remoteUserHost}:${rsyncSourcePath}`;
			const rsyncTargetArg = route === 'source-push' ? `${remoteUserHost}:${rsyncTargetPath}` : rsyncTargetPath;
			const rsyncCommandCore = `${sshpassPrefix}rsync ${rsyncOptions}${rsyncPathOption} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(rsyncSourceArg)} ${quotePosixShellArg(rsyncTargetArg)}`;
			const rsyncCommand = route === 'source-push' ? rsyncCommandCore : `mkdir -p ${quotePosixShellArg(remoteTargetPath)} && ${rsyncCommandCore}`;
			const progress = this.createRsyncProgressReporter(request, 0, 'rsync-direct', 'Direct rsync transfer in progress.', { strategy: 'rsync-direct', route }, markActivity);

			this.throwIfTransferCanceled(request.progressId);
			markActivity();
			await this.execRemote(client, rsyncCommand, {
				onStdout: progress.handleOutput,
				onStderr: progress.handleOutput,
				inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
				inactivityMessage: `Direct rsync ${route} produced no transfer progress for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
				getActivityTime: () => lastActivityAt
			});
			this.throwIfTransferCanceled(request.progressId);

			bytes = progress.getLastBytes() || Math.max(0, request.expectedBytes ?? 0);

			return this.createTransferResult(true, 'rsync-direct', bytes, 'Direct rsync completed.', startedAt, request.progressId);
		} catch (error) {
			if (this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			throw error;
		} finally {
			unregisterCancel();
			client.end();
		}
	}

	/**
	 * Unified direct-route detection for all SSH-to-SSH transfers (scp/sftp/rsync).
	 *
	 * Returns every currently viable direction in deterministic order:
	 * - `source-push`: source can reach target's SSH login and should push the payload.
	 * - `target-pull`: target can reach source's SSH login and should pull the payload.
	 *
	 * Both directions are probed in parallel and capped under ~1s. Transfer failures put only the
	 * failing direction into a short cooldown, so one bad route cannot keep every 62 -> * transfer
	 * stuck at 0 bytes; the next direct candidate or same-protocol relay can take over.
	 */
	private async resolveDirectSshRoutes(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint, progressId: string | undefined): Promise<readonly TurboFileDirectSshRoute[]> {
		if (source.kind !== 'ssh' || target.kind !== 'ssh' || !source.connection || !target.connection) {
			return [];
		}

		const cacheKey = getDirectSshRouteCacheKey(source.connection, target.connection);
		const now = Date.now();
		const cached = this.directSshRouteCache.get(cacheKey);
		if (cached && cached.expiresAt > now) {
			const routes = this.filterDirectSshRoutesByCooldown(cacheKey, cached.routes);
			if (routes.length > 0) {
				return routes;
			}
		}
		this.throwIfTransferCanceled(progressId);
		const optimisticRoutes: readonly TurboFileDirectSshRoute[] = ['source-push', 'target-pull'];
		this.directSshRouteCache.set(cacheKey, {
			routes: optimisticRoutes,
			expiresAt: now + DIRECT_SSH_ROUTE_CACHE_TTL_MS
		});
		return this.filterDirectSshRoutesByCooldown(cacheKey, optimisticRoutes);
	}

	private filterDirectSshRoutesByCooldown(cacheKey: string, routes: readonly TurboFileDirectSshRoute[]): readonly TurboFileDirectSshRoute[] {
		const now = Date.now();
		return routes.filter(route => (this.directSshRouteFailureCooldowns.get(getDirectSshRouteFailureKey(cacheKey, route)) ?? 0) <= now);
	}

	private markDirectSshRouteFailure(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint, route: TurboFileDirectSshRoute): void {
		if (source.kind !== 'ssh' || target.kind !== 'ssh' || !source.connection || !target.connection) {
			return;
		}
		const cacheKey = getDirectSshRouteCacheKey(source.connection, target.connection);
		this.directSshRouteFailureCooldowns.set(getDirectSshRouteFailureKey(cacheKey, route), Date.now() + DIRECT_SSH_ROUTE_FAILURE_COOLDOWN_MS);
	}

	private clearDirectSshRouteFailure(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint, route: TurboFileDirectSshRoute): void {
		if (source.kind !== 'ssh' || target.kind !== 'ssh' || !source.connection || !target.connection) {
			return;
		}
		const cacheKey = getDirectSshRouteCacheKey(source.connection, target.connection);
		this.directSshRouteFailureCooldowns.delete(getDirectSshRouteFailureKey(cacheKey, route));
		this.directSshRouteCache.set(cacheKey, {
			routes: [route],
			expiresAt: Date.now() + DIRECT_SSH_ROUTE_CACHE_TTL_MS
		});
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

	private clearDirectSshRouteCache(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint): void {
		if (source.kind !== 'ssh' || target.kind !== 'ssh' || !source.connection || !target.connection) {
			return;
		}
		this.directSshRouteCache.delete(getDirectSshRouteCacheKey(source.connection, target.connection));
	}

	private async tryDirectScpTransfer(request: ITurboFileTransferRequest, startedAt: number, forceProtocol = false): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (request.strategyHint === 'relay') {
			return undefined;
		}
		const transferMode = getSshToSshTransferProtocol(request.source);
		if (!forceProtocol && transferMode !== 'scp' && transferMode !== 'auto-fast') {
			return undefined;
		}
		if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}
		this.throwIfTransferCanceled(request.progressId);

		const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown' as TurboFileFileType);
		if (sourceType !== 'file' && sourceType !== 'directory') {
			return undefined;
		}
		const sourceIsDirectory = sourceType === 'directory';

		const bytes = Math.max(0, request.expectedBytes ?? 0) || await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
		if (bytes <= 0) {
			return undefined;
		}

		const routes = await this.resolveDirectSshRoutes(request.source, request.target, request.progressId);
		if (!routes.length) {
			return undefined;
		}

		const failures: string[] = [];
		for (const route of routes) {
			try {
				const result = await this.tryDirectScpTransferRoute(request, startedAt, sourceIsDirectory, bytes, route);
				this.clearDirectSshRouteFailure(request.source, request.target, route);
				return result;
			} catch (error) {
				if (this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				this.markDirectSshRouteFailure(request.source, request.target, route);
				failures.push(`${route}: ${formatTransferError(error)}`);
			}
		}

		this.clearDirectSshRouteCache(request.source, request.target);
		throw new Error(`Direct SCP failed: ${failures.join('; ')}`);
	}

	private async tryDirectScpTransferRoute(request: ITurboFileTransferRequest, startedAt: number, sourceIsDirectory: boolean, bytes: number, route: TurboFileDirectSshRoute): Promise<ITurboFileTransferResult> {
		const executorEndpoint = route === 'source-push' ? request.source : request.target;
		const remoteEndpoint = route === 'source-push' ? request.target : request.source;
		if (!executorEndpoint.connection || !remoteEndpoint.connection) {
			throw new Error('Direct SCP route is missing SSH connection details.');
		}

		const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
		if (!executorConfigResult.ok) {
			throw new Error(executorConfigResult.message);
		}

		const client = await this.connectDirectSsh(executorConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		let credential: IRemoteScpCredential | undefined;
		let stopGrowthTiming: () => void = () => undefined;
		let lastActivityAt = Date.now();
		const markActivity = (): void => {
			lastActivityAt = Date.now();
		};
		try {
			this.throwIfTransferCanceled(request.progressId);
			credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection);
			const remote = remoteEndpoint.connection;
			const remoteUserHost = `${remote.username}@${remote.host}`;
			const sshpassPrefix = buildSshpassPrefix(remote.password);
			const targetParentPath = getRemoteParentPath(request.target.path);
			const prepareDirectoryTargetCommand = buildPrepareDirectoryTransferTargetCommand(request.target.path);
			const prepareFileTargetCommand = `mkdir -p -- ${quotePosixShellArg(targetParentPath)} && rm -f -- ${quotePosixShellArg(request.target.path)}`;
			const mkdirCommand = route === 'source-push'
				? `${sshpassPrefix}${buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath)} ${quotePosixShellArg(remoteUserHost)} ${quotePosixShellArg(sourceIsDirectory ? prepareDirectoryTargetCommand : prepareFileTargetCommand)}`
				: sourceIsDirectory ? prepareDirectoryTargetCommand : prepareFileTargetCommand;
			const sourcePath = sourceIsDirectory ? getRemoteDirectoryContentsPath(request.source.path) : request.source.path;
			const targetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
			const sourceArg = route === 'source-push' ? sourcePath : `${remoteUserHost}:${sourcePath}`;
			const targetArg = route === 'source-push' ? `${remoteUserHost}:${targetPath}` : targetPath;
			const scpCommand = `${sshpassPrefix}${buildDirectScpCommand(remote.port || 22, !!remote.password, credential.identityPath, sourceIsDirectory)} ${quotePosixShellArg(sourceArg)} ${quotePosixShellArg(targetArg)}`;

			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing direct SCP transfer.', true, { strategy: 'scp-direct', route });
			await this.execRemote(client, mkdirCommand, { timeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS });
			this.throwIfTransferCanceled(request.progressId);
			markActivity();
			stopGrowthTiming = sourceIsDirectory
				? this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, bytes, transferredBytes => {
					markActivity();
					this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Direct SCP transfer in progress.', false, { strategy: 'scp-direct', route });
				})
				: this.beginRemoteFileGrowthTiming(request.progressId, request.target.connection!, request.target.path, 0, bytes, transferredBytes => {
					markActivity();
					this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Direct SCP transfer in progress.', false, { strategy: 'scp-direct', route });
				});
			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, scpCommand, {
				inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
				inactivityMessage: `Direct SCP ${route} produced no target growth for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
				getActivityTime: () => lastActivityAt
			});
			this.throwIfTransferCanceled(request.progressId);
			const targetSize = sourceIsDirectory
				? await this.getRemotePathSizeByCommand(request.target).catch(() => 0)
				: await this.withDirectorySftp(request.target, async sftp => (await this.remoteStat(sftp, request.target.path)).size).catch(() => 0);
			if (targetSize !== bytes) {
				await this.withDirectorySftp(request.target, sftp => sourceIsDirectory ? this.rmdirRemote(sftp, request.target.path) : this.unlinkRemote(sftp, request.target.path)).catch(() => undefined);
				throw new Error(`Direct SCP size mismatch: expected ${bytes}, got ${targetSize}.`);
			}
			this.fireTransferProgress(request, bytes, bytes, 'transfer', 'Direct SCP transfer completed.', true, { strategy: 'scp-direct', route });
			return this.createTransferResult(true, 'scp-direct', bytes, 'Direct SCP completed.', startedAt, request.progressId);
		} catch (error) {
			if (this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			throw error;
		} finally {
			stopGrowthTiming();
			if (credential?.cleanupCommand) {
				await this.execRemote(client, credential.cleanupCommand).catch(() => undefined);
			}
			unregisterCancel();
			client.end();
		}
	}

	private async prepareRemoteScpCredential(client: ISSHClient, remoteConnection: ITurboFileSshConnectionOptions): Promise<IRemoteScpCredential> {
		if (remoteConnection.password) {
			return {};
		}
		const privateKey = remoteConnection.privateKey ?? await this.readPrivateKey(remoteConnection.privateKeyPath).catch(() => undefined);
		if (!privateKey) {
			return {};
		}

		const identityPath = `/tmp/turbofile-scp-${randomUUID()}.key`;
		const marker = `__TURBOFILE_SCP_KEY_${randomUUID().replace(/-/g, '')}__`;
		const normalizedKey = privateKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n?$/, '\n');
		const setupCommand = `umask 077; cat > ${quotePosixShellArg(identityPath)} <<'${marker}'\n${normalizedKey}${marker}\nchmod 600 ${quotePosixShellArg(identityPath)}`;
		await this.execRemote(client, setupCommand);
		return {
			identityPath,
			cleanupCommand: `rm -f ${quotePosixShellArg(identityPath)}`
		};
	}

	private async tryDirectSftpTransfer(request: ITurboFileTransferRequest, startedAt: number, forceProtocol = false): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (request.strategyHint === 'relay') {
			return undefined;
		}
		if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== 'sftp') {
			return undefined;
		}
		if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}
		this.throwIfTransferCanceled(request.progressId);

		const routes = await this.resolveDirectSshRoutes(request.source, request.target, request.progressId);
		if (!routes.length) {
			return undefined;
		}

		const failures: string[] = [];
		for (const route of routes) {
			try {
				const result = await this.tryDirectSftpTransferRoute(request, startedAt, route);
				this.clearDirectSshRouteFailure(request.source, request.target, route);
				return result;
			} catch (error) {
				if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
					throw new TurboFileTransferCanceledError();
				}
				this.markDirectSshRouteFailure(request.source, request.target, route);
				failures.push(`${route}: ${formatTransferError(error)}`);
			}
		}

		this.clearDirectSshRouteCache(request.source, request.target);
		throw new Error(`Direct SFTP failed: ${failures.join('; ')}`);
	}

	private async tryDirectSftpTransferRoute(request: ITurboFileTransferRequest, startedAt: number, route: TurboFileDirectSshRoute): Promise<ITurboFileTransferResult> {
		const executorEndpoint = route === 'source-push' ? request.source : request.target;
		const remoteEndpoint = route === 'source-push' ? request.target : request.source;
		if (!executorEndpoint.connection || !remoteEndpoint.connection) {
			throw new Error('Direct SFTP route is missing SSH connection details.');
		}

		const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
		if (!executorConfigResult.ok) {
			throw new Error(executorConfigResult.message);
		}

		const remote = remoteEndpoint.connection;
		const remoteUserHost = `${remote.username}@${remote.host}`;
		const sshpassPrefix = buildSshpassPrefix(remote.password);
		const sftpCommand = `${sshpassPrefix}${buildOptimizedSftpCommand(remote.port || 22, !!remote.password)} ${quotePosixShellArg(remoteUserHost)}`;
		const sshTransport = buildCompatibleSshCommand(remote.port || 22, !!remote.password);
		const client = await this.connectDirectSsh(executorConfigResult.config);
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
		let stopGrowthTiming: () => void = () => undefined;
		let lastActivityAt = Date.now();
		const markActivity = (): void => {
			lastActivityAt = Date.now();
		};
		try {
			this.throwIfTransferCanceled(request.progressId);
			const sourceType = request.sourceType ?? await this.withSftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown' as TurboFileFileType);
			if (sourceType !== 'file' && sourceType !== 'directory') {
				throw new Error(`Unsupported direct SFTP source type: ${sourceType}.`);
			}
			const expectedBytes = Math.max(0, request.expectedBytes ?? 0);
			let bytes = expectedBytes;
			if (bytes === 0) {
				bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => expectedBytes);
			}

			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing direct SFTP transfer.', true, { strategy: 'sftp-direct', route });
			const targetParentPath = getRemoteParentPath(request.target.path);
			const sourceIsDirectory = sourceType === 'directory';
			const mkdirCommand = route === 'source-push'
				? `${sshpassPrefix}${sshTransport} ${quotePosixShellArg(remoteUserHost)} ${quotePosixShellArg(sourceIsDirectory ? `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}` : `mkdir -p -- ${quotePosixShellArg(targetParentPath)}`)}`
				: sourceIsDirectory ? `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}` : `mkdir -p -- ${quotePosixShellArg(targetParentPath)}`;
			const batchVerb = sourceIsDirectory
				? route === 'source-push' ? 'put -pr' : 'get -pr'
				: route === 'source-push' ? 'put -p' : 'get -p';
			const batchSourcePath = sourceIsDirectory ? getRemoteDirectoryContentsPath(request.source.path) : request.source.path;
			const batchTargetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
			const batch = `${batchVerb} ${quoteSftpBatchPath(batchSourcePath)} ${quoteSftpBatchPath(batchTargetPath)}\n`;
			const transferCommand = `printf %s ${quotePosixShellArg(batch)} | ${sftpCommand}`;

			this.throwIfTransferCanceled(request.progressId);
			await this.execRemote(client, mkdirCommand, { timeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS });
			this.throwIfTransferCanceled(request.progressId);
			markActivity();
			stopGrowthTiming = sourceType === 'directory'
				? this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, bytes, transferredBytes => {
					markActivity();
					this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Direct SFTP transfer in progress.', false, { strategy: 'sftp-direct', route });
				})
				: this.beginRemoteFileGrowthTiming(request.progressId, request.target.connection!, request.target.path, 0, bytes, transferredBytes => {
					markActivity();
					this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Direct SFTP transfer in progress.', false, { strategy: 'sftp-direct', route });
				});
			this.markTransferDataStarted(request.progressId);
			await this.execRemote(client, transferCommand, {
				inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
				inactivityMessage: `Direct SFTP ${route} produced no target growth for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
				getActivityTime: () => lastActivityAt
			});
			this.throwIfTransferCanceled(request.progressId);
			const targetSize = await this.getRemotePathSizeByCommand(request.target).catch(() => bytes);
			if (bytes > 0 && targetSize !== bytes) {
				throw new Error(`Direct SFTP size mismatch: expected ${bytes}, got ${targetSize}.`);
			}

			this.fireTransferProgress(request, bytes, bytes, 'transfer', 'Direct SFTP transfer completed.', true, { strategy: 'sftp-direct', route });
			return this.createTransferResult(true, 'sftp-direct', bytes, 'Direct SFTP completed.', startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			throw error;
		} finally {
			stopGrowthTiming();
			unregisterCancel();
			client.end();
		}
	}

	private async tryTunneledRsyncRelayTransfer(request: ITurboFileTransferRequest, startedAt: number, allowAutoFast = false): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		const protocol = getSshToSshTransferProtocol(request.source);
		if (protocol !== 'rsync' && !(allowAutoFast && protocol === 'auto-fast')) {
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
			this.fireTransferProgress(request, 0, 0, 'transfer', 'Starting rsync relay transfer.', true, { strategy: 'rsync-relay' });
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
			let bytes = 0;

			const remoteTargetPath = sourceIsDirectory ? request.target.path : getRemoteParentPath(request.target.path);
			const canUseTargetRsync = await this.canUseTargetRsyncThroughRelay(client, targetUserHost, forwardedPort, sshpassPrefix);
			if (!canUseTargetRsync) {
				return undefined;
			}

			const rsyncOptions = buildRsyncOptions(true);
			const rsyncSourcePath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.source.path) : request.source.path;
			const rsyncTargetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
			const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} ${buildRsyncPathWithMkdirShellOption(remoteTargetPath)} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(rsyncSourcePath)} ${quotePosixShellArg(`${targetUserHost}:${rsyncTargetPath}`)}`;
			const progress = this.createRsyncProgressReporter(request, 0, 'relay-upload', 'Rsync relay transfer in progress.', { strategy: 'rsync-relay' });

			await this.execRemote(client, rsyncCommand, {
				onStdout: progress.handleOutput,
				onStderr: progress.handleOutput,
				inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
				inactivityMessage: `Rsync relay produced no transfer progress for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
				getActivityTime: progress.getActivityTime
			});
			this.throwIfTransferCanceled(request.progressId);
			bytes = progress.getLastBytes() || Math.max(0, request.expectedBytes ?? 0);
			return this.createTransferResult(true, 'rsync-relay', bytes, 'Rsync relay completed.', startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			throw new Error(`Rsync relay failed: ${formatTransferError(error)}`);
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

	private async tryTarRelayTransfer(request: ITurboFileTransferRequest, startedAt: number, forceProtocol = false): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== 'tar') {
			return undefined;
		}
		if (request.strategyHint === 'direct' || request.source.supportsTar === false || request.target.supportsTar === false || looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
			return undefined;
		}

		const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown' as TurboFileFileType);
		if (sourceType !== 'directory') {
			return undefined;
		}

		let bytes = Math.max(0, request.expectedBytes ?? 0);
		if (bytes <= 0) {
			bytes = await this.getRemotePathContentSizeByCommand(request.source).catch(() => 0);
		}

		const sourceConfigResult = await this.createConnectConfig(request.source.connection);
		const targetConfigResult = await this.createConnectConfig(request.target.connection);
		if (!sourceConfigResult.ok || !targetConfigResult.ok) {
			return undefined;
		}

		let sourceClient: ISSHClient | undefined;
		let targetClient: ISSHClient | undefined;
		let stopGrowthTiming: () => void = () => undefined;
		const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
			sourceClient?.end();
			targetClient?.end();
		});
		try {
			sourceClient = await this.connect(sourceConfigResult.config);
			targetClient = await this.connect(targetConfigResult.config);
			this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing tar relay.', true, { strategy: 'tar-relay', route: 'relay' });
			stopGrowthTiming = this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, bytes, transferredBytes => {
				this.fireTransferProgress(request, transferredBytes, bytes, 'relay-upload', 'Tar relay transfer in progress.', false, { strategy: 'tar-relay', route: 'relay' });
			});
			this.markTransferDataStarted(request.progressId);
			const sourceStream = await this.openRemoteCommandStream(sourceClient, buildTarCreateFromDirectoryCommand(request.source.path), 'tar relay create');
			const targetStream = await this.openRemoteCommandStream(targetClient, buildTarExtractToExactDirectoryCommand(request.target.path), 'tar relay extract', true);
			await pipeline(sourceStream.stream as unknown as NodeJS.ReadableStream, targetStream.stream as unknown as NodeJS.WritableStream);
			await sourceStream.close;
			await targetStream.close;
			this.throwIfTransferCanceled(request.progressId);
			const targetSize = await this.getRemotePathContentSizeByCommand(request.target).catch(() => bytes);
			if (bytes > 0 && targetSize !== bytes) {
				throw new Error(`Tar relay size mismatch: expected ${bytes}, got ${targetSize}.`);
			}
			const resultBytes = bytes > 0 ? bytes : targetSize;
			this.fireTransferProgress(request, resultBytes, resultBytes, 'complete', 'Tar relay completed.', true, { strategy: 'tar-relay', route: 'relay' });
			this.clearRemoteDirectoryListingCache(request.target);
			return this.createTransferResult(true, 'tar-relay', resultBytes, 'Tar relay completed.', startedAt, request.progressId);
		} catch (error) {
			if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
				throw new TurboFileTransferCanceledError();
			}
			throw new Error(`Tar relay failed: ${formatTransferError(error)}`);
		} finally {
			stopGrowthTiming();
			unregisterCancel();
			sourceClient?.end();
			targetClient?.end();
		}
	}

	private async tryStreamRelayTransfer(request: ITurboFileTransferRequest, startedAt: number, forceProtocol = false): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== 'sftp') {
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
			this.fireTransferProgress(request, 0, totalBytes, 'prepare', 'Preparing SFTP parallel relay.', true, { strategy: 'sftp-relay' });
			await this.ensureRemoteDirectory(targetSftp, getRemoteParentPath(request.target.path));
			const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
				sourceSftp?.end();
				targetSftp?.end();
				sourceClient?.end();
				targetClient?.end();
			});
			let streamedBytes = 0;
			try {
				await this.relayRemoteFileInParallel(sourceSftp, targetSftp, request.source.path, request.target.path, bytes, delta => {
					streamedBytes += delta;
					this.fireTransferProgress(request, Math.min(streamedBytes * 2, totalBytes), totalBytes, 'relay-upload', 'Parallel SFTP relay in progress.', false, { strategy: 'sftp-relay' });
				}, request.progressId);
			} finally {
				unregisterCancel();
			}
			this.throwIfTransferCanceled(request.progressId);
			const targetStat = await this.remoteStat(targetSftp, request.target.path).catch(() => undefined);
			if (!targetStat || targetStat.size !== bytes) {
				await this.unlinkRemote(targetSftp, request.target.path).catch(() => undefined);
				throw new Error(`SFTP relay size mismatch: expected ${bytes}, got ${targetStat?.size ?? 0}.`);
			}
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

	private async tryScpRelayTransfer(request: ITurboFileTransferRequest, startedAt: number, forceProtocol = false): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		const transferMode = getSshToSshTransferProtocol(request.source);
		if (!forceProtocol && transferMode !== 'scp' && transferMode !== 'auto-fast') {
			return undefined;
		}
		const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async sftp => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown' as TurboFileFileType);
		if (sourceType !== 'file' && sourceType !== 'directory') {
			throw new Error(`Unsupported SCP relay source type: ${sourceType}.`);
		}

		const bytes = Math.max(0, request.expectedBytes ?? 0) || await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
		if (bytes <= 0) {
			return undefined;
		}

		const relayRoot = join(tmpdir(), `turbofile-scp-relay-${randomUUID()}`);
		const relayPath = join(relayRoot, getTransferName(request.source.path) || 'payload');
		const relayTotalBytes = bytes * 2;
		try {
			await fsp.mkdir(relayRoot, { recursive: true });
			this.fireTransferProgress(request, 0, relayTotalBytes, 'prepare', 'Preparing SCP relay.', true, { strategy: 'scp-relay' });
			let downloadedBytes = 0;
			await this.runLocalScpDownload({
				...request,
				target: { kind: 'local', path: relayPath },
				expectedBytes: bytes
			}, bytes, transferredBytes => {
				downloadedBytes = Math.max(downloadedBytes, transferredBytes);
				this.fireTransferProgress(request, Math.min(downloadedBytes, relayTotalBytes), relayTotalBytes, 'relay-download', 'Downloading to relay cache over SCP.', false, { strategy: 'scp-relay' });
			});
			this.throwIfTransferCanceled(request.progressId);
			this.fireTransferProgress(request, bytes, relayTotalBytes, 'relay-download', 'SCP relay download completed.', true, { strategy: 'scp-relay' });

			let uploadedBytes = 0;
			await this.runLocalScpUpload({
				...request,
				source: { kind: 'local', path: relayPath },
				expectedBytes: bytes
			}, bytes, transferredBytes => {
				uploadedBytes = Math.max(uploadedBytes, transferredBytes);
				this.fireTransferProgress(request, Math.min(bytes + uploadedBytes, relayTotalBytes), relayTotalBytes, 'relay-upload', 'Uploading from relay cache over SCP.', false, { strategy: 'scp-relay' });
			});
			this.throwIfTransferCanceled(request.progressId);
			const targetSize = await this.getRemotePathSizeByCommand(request.target).catch(() => 0);
			if (targetSize !== bytes) {
				throw new Error(`SCP relay size mismatch: expected ${bytes}, got ${targetSize}.`);
			}
			this.fireTransferProgress(request, relayTotalBytes, relayTotalBytes, 'relay-upload', 'SCP relay completed.', true, { strategy: 'scp-relay' });
			return this.createTransferResult(true, 'scp-relay', bytes, 'SCP relay completed.', startedAt, request.progressId);
		} finally {
			await fsp.rm(relayRoot, { recursive: true, force: true }).catch(() => undefined);
		}
	}

	private async runSftpRelayTransfer(request: ITurboFileTransferRequest, startedAt: number, forceProtocol = false): Promise<ITurboFileTransferResult | undefined> {
		if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
			return undefined;
		}
		if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== 'sftp') {
			return undefined;
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
				this.fireTransferProgress(request, 0, relayTotalBytes, 'prepare', 'Preparing SFTP relay.', true, { strategy: 'sftp-relay' });
				let downloadedBytes = 0;
				const onDownloadDelta = (delta: number): void => {
					this.throwIfTransferCanceled(request.progressId);
					downloadedBytes += delta;
					this.fireTransferProgress(request, downloadedBytes, relayTotalBytes, 'relay-download', 'Downloading to relay cache.', false, { strategy: 'sftp-relay' });
				};
				if (sourceType === 'directory') {
					await this.downloadDirectory(sftp, request.source.path, relayPath, onDownloadDelta, request.progressId);
				} else {
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
					this.fireTransferProgress(request, bytes + uploadedBytes, relayTotalBytes, 'relay-upload', 'Uploading from relay cache.', false, { strategy: 'sftp-relay' });
				};
				if (relayStat.isDirectory()) {
					await this.uploadDirectory(sftp, relayPath, request.target.path, onUploadDelta, request.progressId);
				} else {
					await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
					await this.fastPutWithFallback(sftp, relayPath, request.target.path, bytes, onUploadDelta, request.progressId);
				}
			}, request.progressId);
			this.throwIfTransferCanceled(request.progressId);
			this.fireTransferProgress(request, bytes * 2, bytes * 2, 'complete', 'SFTP relay completed.', true, { strategy: 'sftp-relay' });
			this.clearRemoteDirectoryListingCache(request.target);
			return this.createTransferResult(true, 'sftp-relay', bytes, 'SFTP relay completed.', startedAt, request.progressId);
		} finally {
			await fsp.rm(relayRoot, { recursive: true, force: true }).catch(() => undefined);
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
			tryKeyboard: false,
			// Keep idle connections alive so long-running terminal tasks (and slow transfers) are not
			// dropped by NAT/firewall/server idle timeouts. ~15s pings, tolerate ~3min of unanswered
			// pings before treating the link as dead.
			keepaliveInterval: 15000,
			keepaliveCountMax: 12
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

	private connectDirectSsh(config: ConnectConfig): Promise<ISSHClient> {
		const readyTimeout = typeof config.readyTimeout === 'number'
			? Math.min(config.readyTimeout, DIRECT_SSH_CONNECT_TIMEOUT_MS)
			: DIRECT_SSH_CONNECT_TIMEOUT_MS;
		return this.connect({ ...config, readyTimeout });
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
				let bytesReadTotal = 0;
				while (bytesReadTotal < length) {
					const bytesRead = await this.readRemoteFileChunk(sourceSftp, sourceHandle, buffer.subarray(bytesReadTotal), length - bytesReadTotal, position + bytesReadTotal);
					this.throwIfTransferCanceled(progressId);
					if (bytesRead <= 0) {
						throw new Error(`Unexpected EOF while relaying ${sourcePath} at ${position + bytesReadTotal}.`);
					}
					bytesReadTotal += bytesRead;
				}
				await this.writeRemoteFileChunk(targetSftp, targetHandle!, buffer, bytesReadTotal, position);
				onDelta?.(bytesReadTotal);
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
		try {
			session.client.end();
		} catch {
			// Ignore cleanup errors from already closed SSH clients.
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

	private clearTransferDataTiming(progressId: string | undefined): void {
		if (!progressId) {
			return;
		}
		this.transferDataStartTimes.delete(progressId);
		this.transferFirstPositiveProgressTimes.delete(progressId);
		this.transferGrowthMonitoredProgressIds.delete(progressId);
		this.rsyncTimingStates.delete(progressId);
	}

	private getRsyncTimingState(request: { readonly progressId?: string; readonly clientStartedAt?: number }): IRsyncTimingState | undefined {
		const progressId = request.progressId;
		if (!progressId) {
			return undefined;
		}
		const existing = this.rsyncTimingStates.get(progressId);
		if (existing) {
			return existing;
		}
		const now = Date.now();
		const state: IRsyncTimingState = {
			clientStartedAt: request.clientStartedAt,
			serviceStartedAt: now,
			lastMarkAt: request.clientStartedAt ?? now,
			firstProgressEventSeen: false,
			visibleTransferEventSeen: false,
			firstPositiveBytesSeen: false
		};
		this.rsyncTimingStates.set(progressId, state);
		return state;
	}

	private markRsyncTiming(request: { readonly progressId?: string; readonly clientStartedAt?: number }, state: IRsyncTimingState, stage: string, extra: Record<string, unknown> = {}): void {
		const progressId = request.progressId;
		if (!progressId) {
			return;
		}
		const now = Date.now();
		const payload = {
			time: new Date(now).toISOString(),
			progressId,
			stage,
			sinceClientMs: state.clientStartedAt !== undefined ? now - state.clientStartedAt : undefined,
			sinceServiceMs: now - state.serviceStartedAt,
			sincePreviousMs: now - state.lastMarkAt,
			...extra
		};
		state.lastMarkAt = now;
		const logPath = join(app.getPath('userData'), 'logs', 'turbofile-rsync-timing.log');
		void fsp.mkdir(dirname(logPath), { recursive: true })
			.then(() => fsp.appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf8'))
			.catch(() => undefined);
	}

	private createRsyncProgressReporter(request: { readonly progressId?: string; readonly clientStartedAt?: number }, totalBytes: number, phase: ITurboFileTransferProgressEvent['phase'], detail: string, extra: ITransferProgressEventExtra = {}, onAcceptedProgress?: () => void): IRsyncProgressReporter {
		// `knownTotalBytes` is the denominator the UI shows. rsync's --info=progress2 only emits a
		// transferred count once data starts flowing, which on a large tree can be 10s+ after the
		// process starts; publishing a concurrently-computed total here keeps the display showing the
		// size (and a real percentage) from the first second instead of a blank "preparing" state.
		let knownTotalBytes = Math.max(0, totalBytes);
		let lastBytes = 0;
		let rsyncProgressBuffer = '';
		let lastActivityAt: number | undefined;
		let accepted = false;
		let lastToCheck: number | undefined;
		let lastTotalChecks: number | undefined;
		let lastTransferIndex: number | undefined;
		let lastSpeedBytesPerSecond: number | undefined;
		const reportProgress = (transferredBytes: number, force = false, toCheck?: number, totalChecks?: number, transferIndex?: number, _percent?: number, speedBytesPerSecond?: number): void => {
			if (!accepted) {
				accepted = true;
				onAcceptedProgress?.();
			}
			const normalizedTransferred = Math.max(0, transferredBytes);
			const hasMetricChange =
				(toCheck !== undefined && toCheck !== lastToCheck)
				|| (totalChecks !== undefined && totalChecks !== lastTotalChecks)
				|| (transferIndex !== undefined && transferIndex !== lastTransferIndex);
			const hasSpeedChange = speedBytesPerSecond !== undefined && speedBytesPerSecond !== lastSpeedBytesPerSecond;
			if (!force && normalizedTransferred <= lastBytes && !hasMetricChange && !hasSpeedChange) {
				return;
			}
			lastBytes = normalizedTransferred;
			if (toCheck !== undefined) {
				lastToCheck = toCheck;
			}
			if (totalChecks !== undefined) {
				lastTotalChecks = totalChecks;
			}
			if (transferIndex !== undefined) {
				lastTransferIndex = transferIndex;
			}
			if (speedBytesPerSecond !== undefined) {
				lastSpeedBytesPerSecond = speedBytesPerSecond;
			}
			lastActivityAt = Date.now();
			// Never let an estimated total round down below what rsync has already moved, otherwise the
			// progress bar would jump backwards when the transferred count overtakes the estimate.
			const emittedTotal = knownTotalBytes > 0 ? Math.max(knownTotalBytes, normalizedTransferred) : 0;
			this.fireTransferProgress(request, normalizedTransferred, emittedTotal, phase, detail, force, {
				...extra,
				...(toCheck !== undefined ? { toCheck } : {}),
				...(totalChecks !== undefined ? { totalChecks } : {}),
				...(transferIndex !== undefined ? { transferIndex } : {}),
				...(speedBytesPerSecond !== undefined ? { speedBytesPerSecond } : {})
			});
		};
		return {
			handleOutput: chunk => {
				rsyncProgressBuffer = `${rsyncProgressBuffer}${chunk}`.slice(-2048);
				const snapshot = this.parseRsyncProgressSnapshot(rsyncProgressBuffer);
				if (!snapshot) {
					if (!accepted && onAcceptedProgress) {
						accepted = true;
						onAcceptedProgress();
					}
					return;
				}
				reportProgress(snapshot.bytes ?? lastBytes, false, snapshot.toCheck, snapshot.totalChecks, snapshot.transferIndex, snapshot.percent, snapshot.speedBytesPerSecond);
			},
			reportProgress,
			getLastBytes: () => lastBytes,
			getActivityTime: () => lastActivityAt,
			setTotalBytes: total => {
				const normalizedTotal = Math.max(0, total);
				if (normalizedTotal <= knownTotalBytes) {
					return;
				}
				knownTotalBytes = normalizedTotal;
				// Force one event so the size appears immediately, even before rsync moves a byte.
				reportProgress(lastBytes, true);
			}
		};
	}

	private createParallelRsyncProgressReporter(request: { readonly progressId?: string; readonly clientStartedAt?: number }, totalBytes: number, phase: ITurboFileTransferProgressEvent['phase'], detail: string, extra: ITransferProgressEventExtra = {}, onAcceptedProgress?: () => void): IRsyncProgressReporter {
		let knownTotalBytes = Math.max(0, totalBytes);
		const transferredByIndex = new Map<number, number>();
		const speedByIndex = new Map<number, number>();
		let outputBuffer = '';
		let lastBytes = 0;
		let lastSpeedBytesPerSecond = 0;
		let lastActivityAt: number | undefined;
		let accepted = false;
		const report = (force = false): void => {
			if (!accepted) {
				accepted = true;
				onAcceptedProgress?.();
			}
			const transferredBytes = Array.from(transferredByIndex.values()).reduce((sum, value) => sum + value, 0);
			const speedBytesPerSecond = Array.from(speedByIndex.values()).reduce((sum, value) => sum + value, 0);
			const previousSpeedBytesPerSecond = lastSpeedBytesPerSecond;
			if (!force && transferredBytes <= lastBytes && speedBytesPerSecond === lastSpeedBytesPerSecond) {
				return;
			}
			lastBytes = transferredBytes;
			lastSpeedBytesPerSecond = speedBytesPerSecond;
			lastActivityAt = Date.now();
			const emittedTotal = knownTotalBytes > 0 ? Math.max(knownTotalBytes, transferredBytes) : 0;
			this.fireTransferProgress(request, transferredBytes, emittedTotal, phase, detail, force, {
				...extra,
				...(speedBytesPerSecond > 0 || previousSpeedBytesPerSecond > 0 ? { speedBytesPerSecond } : {})
			});
		};
		const parseLine = (line: string): void => {
			const tagged = line.match(/^__TURBOFILE_RSYNC_(\d+)__\s*(.*)$/);
			const index = tagged ? Number(tagged[1]) : 0;
			const content = tagged ? tagged[2] : line;
			if (!Number.isFinite(index)) {
				return;
			}
			const snapshot = this.parseRsyncProgressSnapshot(`\n${content}`);
			if (!snapshot) {
				if (!accepted) {
					accepted = true;
					lastActivityAt = Date.now();
					onAcceptedProgress?.();
				}
				return;
			}
			if (snapshot.bytes !== undefined) {
				transferredByIndex.set(index, Math.max(transferredByIndex.get(index) ?? 0, snapshot.bytes));
			}
			if (snapshot.speedBytesPerSecond !== undefined) {
				if (snapshot.percent !== undefined && snapshot.percent >= 100) {
					speedByIndex.delete(index);
				} else {
					speedByIndex.set(index, snapshot.speedBytesPerSecond);
				}
			}
			report(false);
		};
		return {
			handleOutput: chunk => {
				outputBuffer = `${outputBuffer}${chunk}`.slice(-8192);
				const lines = outputBuffer.split(/\r?\n/);
				outputBuffer = lines.pop() ?? '';
				for (const line of lines) {
					parseLine(line);
				}
			},
			reportProgress: transferredBytes => {
				transferredByIndex.set(0, Math.max(transferredByIndex.get(0) ?? 0, transferredBytes));
				report(true);
			},
			getLastBytes: () => lastBytes,
			getActivityTime: () => lastActivityAt,
			setTotalBytes: total => {
				const normalizedTotal = Math.max(0, total);
				if (normalizedTotal <= knownTotalBytes) {
					return;
				}
				knownTotalBytes = normalizedTotal;
				report(true);
			}
		};
	}

	private beginTransferGrowthTiming(progressId: string | undefined, probeSize: () => Promise<number>, baselineSize = 0, expectedBytes = 0, onProgress?: (transferredBytes: number) => void, pollIntervalMs = TRANSFER_PROGRESS_EVENT_INTERVAL_MS, initialDelayMs = 0): () => void {
		if (!progressId) {
			return () => undefined;
		}

		let stopped = false;
		this.transferGrowthMonitoredProgressIds.add(progressId);
		const poll = async (): Promise<void> => {
			if (initialDelayMs > 0) {
				await delay(initialDelayMs);
			}
			if (stopped) {
				return;
			}
			while (!stopped) {
				try {
					const size = await probeSize();
					const transferredBytes = this.normalizeGrowthProgressBytes(size, baselineSize, expectedBytes);
					if (transferredBytes > 0) {
						this.markTransferDataStarted(progressId);
						onProgress?.(transferredBytes);
						if (!onProgress) {
							break;
						}
					}
				} catch {
					// Growth timing is best-effort; normal progress remains the fallback.
				}
				await delay(onProgress ? pollIntervalMs : 100);
			}
		};
		void poll();
		return () => {
			stopped = true;
			this.transferGrowthMonitoredProgressIds.delete(progressId);
		};
	}

	private normalizeGrowthProgressBytes(currentSize: number, baselineSize: number, expectedBytes: number): number {
		const normalizedSize = Math.max(0, currentSize);
		const normalizedBaseline = Math.max(0, baselineSize);
		const transferredBytes = Math.max(0, normalizedSize - normalizedBaseline);
		const normalizedExpected = Math.max(0, expectedBytes);
		return normalizedExpected > 0 ? Math.min(transferredBytes, normalizedExpected) : transferredBytes;
	}

	private getTransferDurationMs(progressId: string | undefined, fallbackStartedAt: number): number {
		const startedAt = progressId
			? this.transferDataStartTimes.get(progressId) ?? this.transferFirstPositiveProgressTimes.get(progressId) ?? fallbackStartedAt
			: fallbackStartedAt;
		return Math.max(1, Date.now() - startedAt);
	}

	private beginRemoteFileGrowthTiming(progressId: string | undefined, connection: ITurboFileSshConnectionOptions, path: string, baselineSize = 0, expectedBytes = 0, onProgress?: (transferredBytes: number) => void, pollIntervalMs = TRANSFER_PROGRESS_EVENT_INTERVAL_MS, initialDelayMs = 0): () => void {
		let monitorClient: ISSHClient | undefined;
		let monitorSftp: ISFTPWrapper | undefined;
		let reusableDirectorySessionKey: string | undefined;
		let stopped = false;
		const stopGrowthTiming = this.beginTransferGrowthTiming(progressId, async () => {
			if (stopped) {
				return 0;
			}
			if (!monitorSftp) {
				const reusableDirectorySession = await this.getReusableDirectorySftpSession(connection);
				if (reusableDirectorySession && !reusableDirectorySession.closed) {
					reusableDirectorySessionKey = reusableDirectorySession.key;
					monitorSftp = reusableDirectorySession.sftp;
				} else {
					const configResult = await this.createConnectConfig(connection);
					if (!configResult.ok) {
						return 0;
					}
					monitorClient = await this.connect(configResult.config);
					monitorSftp = await this.openSftp(monitorClient);
				}
			}
			const stat = monitorSftp ? await this.remoteStat(monitorSftp, path).catch(() => undefined) : undefined;
			return stat?.size ?? 0;
		}, baselineSize, expectedBytes, onProgress, pollIntervalMs, initialDelayMs);
		return () => {
			stopped = true;
			stopGrowthTiming();
			if (reusableDirectorySessionKey) {
				this.touchDirectorySftpSession(reusableDirectorySessionKey);
			} else {
				monitorSftp?.end();
				monitorClient?.end();
			}
			monitorSftp = undefined;
			monitorClient = undefined;
			reusableDirectorySessionKey = undefined;
		};
	}

	private beginRemotePathGrowthTiming(progressId: string | undefined, endpoint: ITurboFileTransferEndpoint, baselineSize = 0, expectedBytes = 0, onProgress?: (transferredBytes: number) => void, pollIntervalMs = TRANSFER_PROGRESS_EVENT_INTERVAL_MS, initialDelayMs = 0): () => void {
		return this.beginTransferGrowthTiming(progressId, () => this.getRemotePathSizeByCommand(endpoint), baselineSize, expectedBytes, onProgress, pollIntervalMs, initialDelayMs);
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

	private runCancelableLocalCommand(command: string, args: string[], options: { readonly env?: NodeJS.ProcessEnv; readonly onStdout?: (chunk: string) => void; readonly onStderr?: (chunk: string) => void; readonly inactivityTimeoutMs?: number; readonly inactivityMessage?: string } = {}, progressId?: string): Promise<void> {
		this.throwIfTransferCanceled(progressId);
		return new Promise((resolve, reject) => {
			let settled = false;
			let stderrTail = '';
			let unregisterCancel: () => void = () => undefined;
			let inactivityTimer: ReturnType<typeof setInterval> | undefined;
			let lastActivityAt = Date.now();
			const finish = (callback: () => void): void => {
				if (settled) {
					return;
				}
				settled = true;
				if (inactivityTimer) {
					clearInterval(inactivityTimer);
				}
				unregisterCancel();
				callback();
			};
			const child = spawn(command, args, { windowsHide: true, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
			child.stdout?.on('data', data => {
				lastActivityAt = Date.now();
				options.onStdout?.(data.toString());
			});
			child.stderr?.on('data', data => {
				lastActivityAt = Date.now();
				const chunk = data.toString();
				stderrTail = `${stderrTail}${chunk}`.slice(-64 * 1024);
				options.onStderr?.(chunk);
			});
			if (options.inactivityTimeoutMs && options.inactivityTimeoutMs > 0) {
				inactivityTimer = setInterval(() => {
					if (settled || Date.now() - lastActivityAt <= options.inactivityTimeoutMs!) {
						return;
					}
					killLocalProcessTree(child);
					finish(() => reject(new Error(options.inactivityMessage ?? `Local command timed out after ${options.inactivityTimeoutMs} ms without output.`)));
				}, DIRECT_TRANSFER_STALL_CHECK_INTERVAL_MS);
			}
			child.on('error', error => {
				finish(() => {
					if (this.isTransferCanceled(progressId)) {
						reject(new TurboFileTransferCanceledError());
					} else {
						reject(new Error(formatLocalCommandError(stderrTail, error.message)));
					}
				});
			});
			child.on('close', code => {
				finish(() => {
					if (code && code !== 0) {
						if (this.isTransferCanceled(progressId)) {
							reject(new TurboFileTransferCanceledError());
							return;
						}
						reject(new Error(formatLocalCommandError(stderrTail, `Local command failed with exit code ${code}.`)));
						return;
					}
					if (this.isTransferCanceled(progressId)) {
						reject(new TurboFileTransferCanceledError());
						return;
					}
					resolve();
				});
			});
			unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
				if (this.isTransferCanceled(progressId)) {
					killLocalProcessTree(child);
					return;
				}
			});
			child.once('spawn', () => {
				if (!settled && this.isTransferCanceled(progressId)) {
					killLocalProcessTree(child);
				}
			});
		});
	}

	private fireTransferProgress(request: { readonly progressId?: string; readonly clientStartedAt?: number }, transferredBytes: number, totalBytes: number, phase: ITurboFileTransferProgressEvent['phase'], detail: string, force = false, extra: Partial<Omit<ITurboFileTransferProgressEvent, 'progressId' | 'transferredBytes' | 'totalBytes' | 'phase' | 'detail'>> = {}): void {
		const progressId = request.progressId;
		if (!progressId) {
			return;
		}

		const now = Date.now();
		const previous = this.transferProgressSnapshots.get(progressId);
		const normalizedTransferred = Math.max(0, transferredBytes);
		const normalizedTotal = Math.max(0, totalBytes);
		const isDataProgress = phase !== 'prepare' && phase !== 'complete';
		const strategy = typeof extra.strategy === 'string' ? extra.strategy : undefined;
		const isRsyncProgress = strategy?.startsWith('rsync') ?? false;
		const speedBytesPerSecond = typeof extra.speedBytesPerSecond === 'number' && Number.isFinite(extra.speedBytesPerSecond)
			? Math.max(0, extra.speedBytesPerSecond)
			: 0;
		const hasPositiveTransferProgress = normalizedTransferred > 0 || speedBytesPerSecond > 0;
		const shouldStartDataTiming = isDataProgress && (!isRsyncProgress || hasPositiveTransferProgress);
		const rsyncTimingState = isRsyncProgress ? this.getRsyncTimingState(request) : undefined;
		if (rsyncTimingState && !rsyncTimingState.firstProgressEventSeen) {
			rsyncTimingState.firstProgressEventSeen = true;
			this.markRsyncTiming(request, rsyncTimingState, 'first-progress-event', {
				strategy,
				phase,
				detail,
				transferredBytes: normalizedTransferred,
				totalBytes: normalizedTotal
			});
		}
		if (rsyncTimingState && isDataProgress && !rsyncTimingState.visibleTransferEventSeen) {
			rsyncTimingState.visibleTransferEventSeen = true;
			this.markRsyncTiming(request, rsyncTimingState, 'visible-transfer-event', {
				strategy,
				phase,
				detail,
				transferredBytes: normalizedTransferred,
				totalBytes: normalizedTotal
			});
		}
		if (rsyncTimingState && hasPositiveTransferProgress && !rsyncTimingState.firstPositiveBytesSeen) {
			rsyncTimingState.firstPositiveBytesSeen = true;
			this.markRsyncTiming(request, rsyncTimingState, 'first-positive-bytes', {
				strategy,
				phase,
				detail,
				transferredBytes: normalizedTransferred,
				totalBytes: normalizedTotal,
				speedBytesPerSecond
			});
		}
		if (rsyncTimingState && phase === 'complete') {
			this.markRsyncTiming(request, rsyncTimingState, 'complete', {
				strategy,
				phase,
				detail,
				transferredBytes: normalizedTransferred,
				totalBytes: normalizedTotal,
				speedBytesPerSecond
			});
			this.rsyncTimingStates.delete(progressId);
		}
		const wasTransferStarted = this.transferDataStartTimes.has(progressId);
		if (shouldStartDataTiming && !wasTransferStarted) {
			this.transferDataStartTimes.set(progressId, now);
		}
		if (normalizedTransferred > 0 && !this.transferFirstPositiveProgressTimes.has(progressId)) {
			this.transferFirstPositiveProgressTimes.set(progressId, now);
		}
		const isGrowthMonitored = this.transferGrowthMonitoredProgressIds.has(progressId);
		const isFirstDataProgress = shouldStartDataTiming && hasPositiveTransferProgress && !isGrowthMonitored && !wasTransferStarted;
		if (isFirstDataProgress) {
			this.markTransferDataStarted(progressId);
		}
		// Throttle in-progress events to one per interval. The completion event (transferred reaches a
		// known total) always goes through immediately. NOTE: when the total is unknown (0) every
		// rsync stdout line would otherwise bypass the throttle (transferred is never < 0), flooding
		// the renderer with thousands of IPC events and starving the main-process event loop, which
		// slows the transfer itself — so an unknown total must still be throttled.
		const isCompletionEvent = normalizedTotal > 0 && normalizedTransferred >= normalizedTotal;
		if (!force && !isFirstDataProgress && !isCompletionEvent && previous && now - previous.lastAt < TRANSFER_PROGRESS_EVENT_INTERVAL_MS) {
			return;
		}

		this.transferProgressSnapshots.set(progressId, { lastAt: now, lastBytes: normalizedTransferred });
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
			this.transferFirstPositiveProgressTimes.delete(progressId);
			this.transferGrowthMonitoredProgressIds.delete(progressId);
			this.rsyncTimingStates.delete(progressId);
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
		if (sftp.createReadStream) {
			try {
				return await this.readRemoteFileBufferStream(sftp, remotePath, size);
			} catch {
				// Some embedded SFTP servers advertise streams but fail at runtime; keep the older
				// positioned-read path as a compatibility fallback.
			}
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

	private readRemoteFileBufferStream(sftp: ISFTPWrapper, remotePath: string, size: number): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const stream = sftp.createReadStream?.(remotePath, {
				highWaterMark: REMOTE_DIRECT_READ_CHUNK_BYTES
			});
			if (!stream) {
				reject(new Error('SFTP read stream is unavailable.'));
				return;
			}

			const chunks: Buffer[] = [];
			let total = 0;
			let settled = false;
			const finish = (callback: () => void): void => {
				if (settled) {
					return;
				}
				settled = true;
				callback();
			};
			stream.on('data', chunk => {
				const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
				total += buffer.byteLength;
				if (total > size) {
					(stream as unknown as { destroy?: () => void }).destroy?.();
					finish(() => reject(new Error('Remote file stream exceeded expected size.')));
					return;
				}
				chunks.push(buffer);
			});
			stream.on('error', error => finish(() => reject(error)));
			stream.on('end', () => finish(() => resolve(Buffer.concat(chunks, total))));
		});
	}

	/**
	 * Acquires a slot from the SSH image-read concurrency limiter, awaiting a free slot when the cap
	 * is reached. Hand-off on release keeps the active count exact. Prevents the grid's burst of
	 * parallel <img> fetches from exhausting the SSH connection's channels ("Unable to exec").
	 */
	private async acquireImageReadSlot(): Promise<void> {
		if (this.imageReadActiveCount < SSH_IMAGE_READ_MAX_CONCURRENCY) {
			this.imageReadActiveCount++;
			return;
		}
		await new Promise<void>(resolve => this.imageReadWaiters.push(resolve));
	}

	private releaseImageReadSlot(): void {
		const next = this.imageReadWaiters.shift();
		if (next) {
			// Hand the slot directly to the next waiter; active count stays the same.
			next();
			return;
		}
		this.imageReadActiveCount = Math.max(0, this.imageReadActiveCount - 1);
	}

	private async readImageBuffer(endpoint: ITurboFileTransferEndpoint, options: ITurboFileReadImageOptions): Promise<IImageBufferResult> {
		// Only SSH reads contend for connection channels; local reads run unthrottled.
		if (endpoint.kind !== 'ssh') {
			return this.readImageBufferInner(endpoint, options);
		}
		await this.acquireImageReadSlot();
		try {
			return await this.readImageBufferInner(endpoint, options);
		} finally {
			this.releaseImageReadSlot();
		}
	}

	private async readImageBufferInner(endpoint: ITurboFileTransferEndpoint, options: ITurboFileReadImageOptions): Promise<IImageBufferResult> {
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
			height: size?.height,
			originalWidth: size?.width,
			originalHeight: size?.height
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
				height: sourceSize?.height,
				originalWidth: sourceSize?.width,
				originalHeight: sourceSize?.height
			};
		}
		if (sourceSize && sourceSize.width > 0 && sourceSize.height > 0 && sourceSize.width < SMALL_IMAGE_DIM_LIMIT && sourceSize.height < SMALL_IMAGE_DIM_LIMIT) {
			return {
				buffer: sourceBuffer,
				mime: sourceMime,
				width: sourceSize.width,
				height: sourceSize.height,
				originalWidth: sourceSize.width,
				originalHeight: sourceSize.height
			};
		}
		try {
			const transformed = this.transformImageBuffer(sourceBuffer, endpoint.path, targetWidth, targetHeight, quality, format);
			return transformed;
		} catch (error) {
			if (sourceMime.startsWith('image/')) {
				return {
					buffer: sourceBuffer,
					mime: sourceMime,
					width: sourceSize?.width,
					height: sourceSize?.height,
					originalWidth: sourceSize?.width,
					originalHeight: sourceSize?.height
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
				height: typeof metadata.height === 'number' ? metadata.height : undefined,
				originalWidth: typeof metadata.originalWidth === 'number' ? metadata.originalWidth : undefined,
				originalHeight: typeof metadata.originalHeight === 'number' ? metadata.originalHeight : undefined
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
			originalWidth: result.originalWidth,
			originalHeight: result.originalHeight,
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

		// Always emit JPEG (or PNG when explicitly requested) from the remote transform, never WebP.
		// Some servers' ImageMagick WebP delegate produced byte streams that passed a shallow magic
		// check but that this build's Chromium <img> decoder rejected ("Failed to load image") for
		// certain sources (e.g. super-resolution PNGs), while small images that take the local
		// nativeImage path (JPEG/PNG output) always rendered. JPEG decodes universally and is
		// verifiable via nativeImage, so it removes that whole failure class.
		const effectiveFormat: 'jpeg' | 'png' = format === 'png' ? 'png' : 'jpeg';
		// `[0]` selects the first page of a multi-page TIFF; without it ImageMagick would stream every
		// page and produce an undecodable multi-frame JPEG.
		const lowerPath = endpoint.path.toLowerCase();
		const frame = lowerPath.endsWith('.tif') || lowerPath.endsWith('.tiff') ? '[0]' : '';
		const source = `${quotePosixShellArg(endpoint.path)}${frame}`;
		const thumbnail = ` -thumbnail ${quotePosixShellArg(geometry)}`;
		const filter = interpolation === 'lanczos' ? ' -filter Lanczos' : '';
		const qualityOption = effectiveFormat === 'png' ? '' : ` -quality ${quality}`;
		const outputFormat = effectiveFormat === 'png' ? 'png:-' : 'jpg:-';
		const mime = effectiveFormat === 'png' ? 'image/png' : 'image/jpeg';
		const command = `${tool} ${source}${thumbnail}${filter} -strip${qualityOption} ${outputFormat}`;

		try {
			const buffer = await this.withDirectorySshClient(endpoint, client => this.execRemoteBytes(client, command, { timeoutMs: REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS }));
			assertImageBuffer(buffer, mime);
			const size = getImageSize(buffer);
			if (!size) {
				// The header looked valid but nativeImage (same decoder family as the renderer's <img>)
				// could not actually decode the bytes — truncated output, a timeout cutting the stream
				// short, or an incompatible encoder. Reject so the caller falls back to the local
				// download + transform path, which is guaranteed renderable, instead of handing the
				// renderer an <img> source it cannot decode.
				throw new Error('Remote thumbnail produced an undecodable image.');
			}
			return {
				buffer,
				mime,
				width: size.width,
				height: size.height
			};
		} catch (error) {
			// A single corrupt/unsupported image should not disable thumbnail acceleration for
			// the entire SSH device; keep the tool cache intact and fall back for this image only.
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

	private openRemoteCommandStream(client: ISSHClient, command: string, context: string, drainStdout = false): Promise<{ readonly stream: ISSHExecStream; readonly close: Promise<void> }> {
		return new Promise((resolve, reject) => {
			client.exec(command, (error, stream) => {
				if (error) {
					reject(error);
					return;
				}

				let stderr = '';
				let settled = false;
				const close = new Promise<void>((closeResolve, closeReject) => {
					const finish = (callback: () => void): void => {
						if (settled) {
							return;
						}
						settled = true;
						callback();
					};
					stream.stderr.on('data', data => {
						stderr += data.toString();
					});
					if (drainStdout) {
						stream.on('data', () => undefined);
					}
					stream.on('error', err => finish(() => closeReject(err)));
					stream.on('close', code => {
						if (code === 0) {
							finish(() => closeResolve());
							return;
						}
						finish(() => closeReject(new Error(stderr.trim() || `${context} failed with exit code ${code ?? 'unknown'}.`)));
					});
				});
				close.catch(() => undefined);
				resolve({ stream, close });
			});
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
			height: outputSize.height,
			originalWidth: sourceSize.width,
			originalHeight: sourceSize.height
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
			let settled = false;
			let timeout: ReturnType<typeof setTimeout> | undefined;
			let inactivityTimer: ReturnType<typeof setInterval> | undefined;
			let streamRef: (NodeJS.ReadWriteStream & { close?: () => void; destroy?: (error?: Error) => void }) | undefined;
			let unregisterCancel: (() => void) | undefined;
			let lastStreamActivityAt = Date.now();
			const finish = (callback: () => void): void => {
				if (settled) {
					return;
				}
				settled = true;
				unregisterCancel?.();
				if (timeout) {
					clearTimeout(timeout);
					timeout = undefined;
				}
				if (inactivityTimer) {
					clearInterval(inactivityTimer);
					inactivityTimer = undefined;
				}
				callback();
			};
			const closeStream = (): void => {
				try {
					streamRef?.close?.();
				} catch {
					// Best-effort cleanup only.
				}
				try {
					streamRef?.destroy?.();
				} catch {
					// Best-effort cleanup only.
				}
			};
			// Cancelling the owning transfer forcibly closes this exec channel so the remote command is
			// actually terminated (SIGHUP) rather than orphaned. Registered before exec so a cancel that
			// arrives during the channel grant still settles the promise.
			if (options.progressId) {
				unregisterCancel = this.registerTransferCancelHandler(options.progressId, () => {
					closeStream();
					finish(() => reject(new TurboFileTransferCanceledError()));
				});
			}
			client.exec(command, (error, stream) => {
				if (error) {
					finish(() => reject(error));
					return;
				}

				streamRef = stream as unknown as NodeJS.ReadWriteStream & { close?: () => void; destroy?: (error?: Error) => void };
				let stderr = '';
				if (options.timeoutMs && options.timeoutMs > 0) {
					timeout = setTimeout(() => {
						closeStream();
						finish(() => reject(new Error(`Remote command timed out after ${options.timeoutMs} ms.`)));
					}, options.timeoutMs);
				}
				if (options.inactivityTimeoutMs && options.inactivityTimeoutMs > 0) {
					inactivityTimer = setInterval(() => {
						const externalActivityAt = options.getActivityTime?.() ?? 0;
						const lastActivityAt = Math.max(lastStreamActivityAt, externalActivityAt);
						if (Date.now() - lastActivityAt <= options.inactivityTimeoutMs!) {
							return;
						}
						closeStream();
						finish(() => reject(new Error(options.inactivityMessage ?? `Remote command produced no progress for ${options.inactivityTimeoutMs} ms.`)));
					}, DIRECT_TRANSFER_STALL_CHECK_INTERVAL_MS);
				}
				stream.on('data', data => {
					// Drain stdout so remote commands can finish reliably.
					lastStreamActivityAt = Date.now();
					options.onStdout?.(data.toString());
				});
				stream.stderr.on('data', data => {
					lastStreamActivityAt = Date.now();
					const chunk = data.toString();
					stderr += chunk;
					options.onStderr?.(chunk);
				});
				stream.on('close', code => {
					if (code === 0) {
						finish(() => resolve());
						return;
					}
					finish(() => reject(new Error(stderr.trim() || `Remote command failed with exit code ${code ?? 'unknown'}.`)));
				});
			});
		});
	}

	private execRemoteBytes(client: ISSHClient, command: string, options: IRemoteExecOptions = {}): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			let settled = false;
			let totalTimeout: ReturnType<typeof setTimeout> | undefined;
			let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
			let activeStream: ISSHExecStream | undefined;
			const clearTimers = () => {
				if (totalTimeout) {
					clearTimeout(totalTimeout);
					totalTimeout = undefined;
				}
				if (inactivityTimer) {
					clearTimeout(inactivityTimer);
					inactivityTimer = undefined;
				}
			};
			const finish = (callback: () => void) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimers();
				callback();
			};
			const abort = (message: string) => {
				const stream = activeStream;
				try {
					stream?.close?.();
				} catch {
					// Best-effort: older ssh2 channel typings may not expose close.
				}
				try {
					stream?.destroy?.();
				} catch {
					// Best-effort cleanup only.
				}
				finish(() => reject(new Error(message)));
			};
			// An inactivity timeout (reset on every chunk) keeps a long but actively-streaming command
			// alive — a `find` listing a directory of tens of thousands of files streams output the whole
			// time and must not be killed by a fixed total-duration cap, which previously forced a fall
			// back to the much slower per-batch SFTP readdir and ultimately a "read timed out" failure.
			const armInactivity = () => {
				if (!options.inactivityTimeoutMs || options.inactivityTimeoutMs <= 0) {
					return;
				}
				if (inactivityTimer) {
					clearTimeout(inactivityTimer);
				}
				inactivityTimer = setTimeout(() => abort(options.inactivityMessage ?? `Remote command produced no output for ${options.inactivityTimeoutMs} ms.`), options.inactivityTimeoutMs);
			};
			// Arm the timeouts BEFORE calling exec so a stalled channel grant can never hang forever.
			// When the connection's MaxSessions pool is momentarily exhausted, ssh2 may not invoke the
			// exec callback at all — with the timers armed only inside that callback (as before) the
			// promise never settled, which left directory listings stuck waiting until the
			// window was reopened. Arming here bounds the whole operation, including the channel wait.
			if (options.timeoutMs && options.timeoutMs > 0) {
				totalTimeout = setTimeout(() => abort(`Remote command timed out after ${options.timeoutMs} ms.`), options.timeoutMs);
			}
			armInactivity();
			client.exec(command, (error, stream) => {
				if (error) {
					finish(() => reject(error));
					return;
				}
				// If a timeout already aborted this operation, immediately release the channel that was
				// granted late instead of leaking it — a leaked channel would make MaxSessions exhaustion
				// (the very cause of the stall) progressively worse.
				if (settled) {
					try {
						stream.close?.();
					} catch {
						// Best-effort cleanup only.
					}
					try {
						stream.destroy?.();
					} catch {
						// Best-effort cleanup only.
					}
					return;
				}
				activeStream = stream;

				const chunks: Buffer[] = [];
				let stderr = '';
				// Reset the inactivity clock now that the channel is live and output can begin streaming.
				armInactivity();
				stream.on('data', data => {
					armInactivity();
					chunks.push(typeof data === 'string' ? Buffer.from(data) : data);
				});
				stream.stderr.on('data', data => {
					armInactivity();
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

	/**
	 * Runs a remote command, writing `input` to its stdin in one shot. Used to feed a NUL-delimited
	 * path list to `xargs -0 rm` so deleting any number of files is a single SSH round trip — xargs
	 * batches the removals server-side, so it never hits the shell argument-length limit.
	 */
	private execRemoteWithInput(client: ISSHClient, command: string, input: Buffer, options: IRemoteExecOptions = {}): Promise<Buffer> {
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
							// Best-effort cleanup only.
						}
						finish(() => reject(new Error(`Remote command timed out after ${options.timeoutMs} ms.`)));
					}, options.timeoutMs);
				}
				stream.on('data', data => chunks.push(typeof data === 'string' ? Buffer.from(data) : data));
				stream.stderr.on('data', data => { stderr += data.toString(); });
				stream.on('close', code => {
					if (code === 0) {
						finish(() => resolve(Buffer.concat(chunks)));
						return;
					}
					finish(() => reject(new Error(stderr.trim() || `Remote command failed with exit code ${code ?? 'unknown'}.`)));
				});
				stream.end(input);
			});
		});
	}

	private parseRsyncProgressSnapshot(chunk: string): IRsyncProgressSnapshot | undefined {
		let parsed: IRsyncProgressSnapshot | undefined;
		const progressPattern = /(?:^|[\r\n])\s*([0-9][0-9., ]*)\s+([0-9]{1,3})%/g;
		const speedPattern = /([0-9]+(?:[.,][0-9]+)?)\s*([kmgtpe]?)(?:i?B|bytes?)\/s/gi;
		const toCheckPattern = /(?:to-(?:check|chk)|ir-chk)=(\d+)\/(\d+)/g;
		const transferIndexPattern = /xfr#(\d+)/g;
		let hasParsedMetric = false;
		let match: RegExpExecArray | null;
		while ((match = progressPattern.exec(chunk)) !== null) {
			const bytes = Number(match[1].replace(/[^0-9]/g, ''));
			const percent = Number(match[2]);
			if (Number.isFinite(bytes)) {
				hasParsedMetric = true;
				parsed = {
					bytes,
					...(Number.isFinite(percent) ? { percent } : {})
				};
			}
		}
		let speedMatch: RegExpExecArray | null;
		while ((speedMatch = speedPattern.exec(chunk)) !== null) {
			const speedBytesPerSecond = parseRsyncSpeedBytesPerSecond(speedMatch[1], speedMatch[2]);
			if (speedBytesPerSecond !== undefined) {
				hasParsedMetric = true;
				parsed = parsed ?? {};
				parsed = {
					...parsed,
					speedBytesPerSecond
				};
			}
		}
		let toCheckMatch: RegExpExecArray | null;
		while ((toCheckMatch = toCheckPattern.exec(chunk)) !== null) {
			const toCheck = Number(toCheckMatch[1]);
			const totalChecks = Number(toCheckMatch[2]);
			if (Number.isFinite(toCheck) && Number.isFinite(totalChecks)) {
				hasParsedMetric = true;
				parsed = parsed ?? { bytes: 0 };
				parsed = {
					...parsed,
					toCheck,
					totalChecks
				};
			}
		}
		let transferIndexMatch: RegExpExecArray | null;
		while ((transferIndexMatch = transferIndexPattern.exec(chunk)) !== null) {
			const transferIndex = Number(transferIndexMatch[1]);
			if (Number.isFinite(transferIndex)) {
				hasParsedMetric = true;
				parsed = parsed ?? { bytes: 0 };
				parsed = {
					...parsed,
					transferIndex
				};
			}
		}
		return hasParsedMetric ? parsed : undefined;
	}

	private async readRemoteDirectoryWithFallback(sftp: ISFTPWrapper, client: ISSHClient, options: ITurboFileSshConnectionOptions, remotePath: string, namesOnly = false): Promise<IRemoteDirectoryReadResult> {
		try {
			return { path: remotePath, entries: await this.readRemoteDirectoryFast(client, sftp, remotePath, namesOnly) };
		} catch (firstError) {
			for (const fallbackPath of getRemoteDirectoryFallbackPaths(options, remotePath)) {
				try {
					return { path: fallbackPath, entries: await this.readRemoteDirectoryFast(client, sftp, fallbackPath, namesOnly) };
				} catch {
					// Try the next SFTP-visible spelling for devices with chrooted home paths.
				}
			}
			throw firstError;
		}
	}

	private async readRemoteDirectoryFastCommand(client: ISSHClient, remotePath: string, namesOnly = false): Promise<ISFTPFileEntry[]> {
		// Bound by inactivity, not total duration: a `find` over a directory with tens of thousands
		// of entries streams output for many seconds and must be allowed to finish. Only callers decide
		// whether to fall back to slow SFTP readdir.
		const command = namesOnly ? buildPosixNamesAndTypesListCommand(remotePath) : buildPosixFastDirectoryListCommand(remotePath);
		return this.parseFastRemoteDirectoryEntries(await this.execRemoteBytes(client, command, {
			inactivityTimeoutMs: REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS,
			inactivityMessage: `Remote directory read produced no output for ${REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS} ms: ${remotePath}`,
			timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS
		}), namesOnly);
	}

	private async readRemoteDirectoryFast(client: ISSHClient, sftp: ISFTPWrapper, remotePath: string, namesOnly = false): Promise<ISFTPFileEntry[]> {
		try {
			return await this.readRemoteDirectoryFastCommand(client, remotePath, namesOnly);
		} catch {
			return this.readRemoteDirectory(sftp, remotePath);
		}
	}

	private parseFastRemoteDirectoryEntries(output: Buffer, namesOnly = false): ISFTPFileEntry[] {
		const text = output.toString('utf8');
		if (!text) {
			return [];
		}

		const parts = text.split('\0');
		const entries: ISFTPFileEntry[] = [];
		const stride = namesOnly ? 2 : 4;
		for (let index = 0; index + stride - 1 < parts.length; index += stride) {
			const filename = parts[index];
			if (!filename || filename === '.' || filename === '..') {
				continue;
			}
			const kind = parts[index + 1];
			const size = namesOnly ? 0 : Number(parts[index + 2]);
			const modifiedSeconds = namesOnly ? 0 : Number(parts[index + 3]);
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
		return withTurboFileTimeout(new Promise((resolve, reject) => {
			sftp.readdir(remotePath, (error, list) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(list);
			});
		}), REMOTE_DIRECTORY_READ_TIMEOUT_MS, `Remote directory read timed out after ${REMOTE_DIRECTORY_READ_TIMEOUT_MS} ms: ${remotePath}`);
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

	private async getRemotePathContentSizeByCommand(endpoint: ITurboFileTransferEndpoint): Promise<number> {
		if (endpoint.kind !== 'ssh' || looksLikeWindowsPath(endpoint.path)) {
			return this.getRemotePathSizeByCommand(endpoint);
		}
		try {
			return await this.withDirectorySshClient(endpoint, async client => {
				const output = await this.execRemoteBytes(client, buildPosixContentSizeCommand(endpoint.path));
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

async function readWindowsClipboardFilePaths(): Promise<string[]> {
	const paths: string[] = [];
	const acceptPath = (path: string): void => {
		const candidate = path.trim().replace(/^"|"$/g, '').replace(/^file:\/\/\/?/i, '');
		if (!isWindowsClipboardPath(candidate)) {
			return;
		}

		paths.push(candidate);
	};

	for (const path of await readWindowsClipboardDropListPaths().catch(() => [])) {
		acceptPath(path);
	}
	for (const path of parseWindowsClipboardBuffer(clipboard.readBuffer('FileNameW'), 'utf16le')) {
		acceptPath(path);
	}
	for (const path of parseWindowsClipboardBuffer(clipboard.readBuffer('FileName'), 'utf8')) {
		acceptPath(path);
	}
	for (const path of clipboard.readText('clipboard').split(/\r?\n/)) {
		acceptPath(path);
	}

	return normalizeWindowsTransferPaths(paths, resolveLocalWindowsRealPath);
}

async function readWindowsClipboardDropListPaths(): Promise<string[]> {
	if (platform() !== 'win32') {
		return [];
	}

	const script = withPowerShellDefaults(`
Add-Type -AssemblyName System.Windows.Forms
$items = [System.Windows.Forms.Clipboard]::GetFileDropList()
foreach ($item in $items) {
	if ([string]::IsNullOrWhiteSpace($item)) { continue }
	[Console]::Out.WriteLine([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($item)))
}
`);
	const stdout = await runLocalPowerShellStaScriptBuffer(script, 16 * 1024 * 1024);
	return stdout
		.toString('utf8')
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean)
		.map(line => Buffer.from(line, 'base64').toString('utf8'));
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

function resolveLocalWindowsRealPath(path: string): Promise<string> {
	const realpath = fsp.realpath as typeof fsp.realpath & { native?: (path: string) => Promise<string> };
	return realpath.native ? realpath.native(path) : fsp.realpath(path);
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
		if (target.preferredProtocol === 'tar') {
			return 'tar-upload';
		}
		if (target.preferredProtocol !== 'sftp') {
			return 'scp-upload';
		}
		return 'sftp-upload';
	}
	if (target.kind === 'local') {
		if (source.preferredProtocol === 'tar') {
			return 'tar-download';
		}
		if (source.preferredProtocol !== 'sftp') {
			return 'scp-download';
		}
		return 'sftp-download';
	}
	if (source.connection && target.connection && isSameSshConnection(source.connection, target.connection)) {
		return 'remote-copy';
	}
	return transferAttemptToStrategy(resolveTransferPlan({ source, target, itemCount: 1 }).attempts[0]);
}

function transferAttemptToStrategy(attempt: ITurboFileTransferAttempt | undefined): ITurboFileTransferResult['strategy'] {
	if (!attempt) {
		return 'scp-direct';
	}
	if (attempt.route === 'direct') {
		switch (attempt.protocol) {
			case 'rsync':
				return 'rsync-direct';
			case 'tar':
				return 'tar-direct';
			case 'sftp':
				return 'sftp-direct';
			case 'scp':
				return 'scp-direct';
		}
	}
	if (attempt.route === 'relay') {
		switch (attempt.protocol) {
			case 'rsync':
				return 'rsync-relay';
			case 'tar':
				return 'tar-relay';
			case 'sftp':
				return 'sftp-relay';
			case 'scp':
				return 'scp-relay';
		}
	}
	switch (attempt.protocol) {
		case 'rsync':
			return 'rsync-upload';
		case 'tar':
			return 'tar-upload';
		case 'sftp':
			return 'sftp-upload';
		case 'scp':
			return 'scp-upload';
	}
}

function transferAttemptToDirectionalStrategy(source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint, attempt: ITurboFileTransferAttempt | undefined): ITurboFileTransferResult['strategy'] {
	if (!attempt || attempt.route !== 'local' || target.kind !== 'local') {
		return transferAttemptToStrategy(attempt);
	}
	switch (attempt.protocol) {
		case 'rsync':
			return 'rsync-download';
		case 'tar':
			return 'tar-download';
		case 'sftp':
			return 'sftp-download';
		case 'scp':
			return source.kind === 'ssh' ? 'scp-download' : 'scp-upload';
	}
}

function getSshToSshTransferProtocol(source: ITurboFileTransferEndpoint): TurboFileTransferProtocol {
	return source.preferredProtocol ?? 'auto-fast';
}

function formatTransferStrategyName(strategy: ITurboFileTransferResult['strategy']): string {
	return strategy.replace(/-/g, ' ');
}

function formatTransferError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function canBatchRsyncPreserveTargetNames(items: readonly ITurboFileBatchTransferItem[]): boolean {
	return items.every(item => item.targetName === getTransferName(item.sourcePath));
}

function getLocalCommandTransferProtocolOrder(preferredProtocol: TurboFileTransferProtocol | undefined, connection: ITurboFileSshConnectionOptions | undefined): Array<'scp' | 'rsync'> {
	if (preferredProtocol === 'auto-fast' || preferredProtocol === undefined) {
		return ['scp'];
	}
	if (preferredProtocol === 'rsync') {
		return ['scp'];
	}
	if (preferredProtocol === 'scp') {
		return ['scp'];
	}
	return preferredProtocol === 'sftp' ? [] : ['scp'];
}

function getDirectoryLocalCommandTransferProtocolOrder(preferredProtocol: TurboFileTransferProtocol | undefined): Array<'scp' | 'rsync'> {
	if (preferredProtocol === 'rsync') {
		return ['rsync', 'scp'];
	}
	if (preferredProtocol === 'scp') {
		return ['scp'];
	}
	if (preferredProtocol === 'sftp') {
		return [];
	}
	return [];
}

function shouldPreferTarForMultiItemTransfer(preferredProtocol: TurboFileTransferProtocol | undefined): boolean {
	return preferredProtocol === undefined || preferredProtocol === 'auto-fast' || preferredProtocol === 'tar';
}

function shouldUseTarOnlyForBatchTransfer(request: ITurboFileBatchTransferRequest): boolean {
	if (request.source.kind === 'local' && request.targetDirectory.kind === 'ssh') {
		return shouldPreferTarForMultiItemTransfer(request.targetDirectory.preferredProtocol);
	}
	if (request.source.kind === 'ssh' && request.targetDirectory.kind === 'local') {
		return shouldPreferTarForMultiItemTransfer(request.source.preferredProtocol);
	}
	if (request.source.kind === 'ssh' && request.targetDirectory.kind === 'ssh') {
		return shouldPreferTarForMultiItemTransfer(getSshToSshTransferProtocol(request.source));
	}
	return false;
}

function canUseNativeOpenSshScpCommand(connection: ITurboFileSshConnectionOptions | undefined): boolean {
	if (!connection) {
		return false;
	}
	return !!connection.password || !!connection.privateKeyPath || !!connection.privateKey || !connection.passphrase;
}

async function withNativeOpenSshArgs<T>(connection: ITurboFileSshConnectionOptions, tool: ILocalSshTool, remoteCommand: string, task: (args: string[], env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
	let tempPrivateKeyPath: string | undefined;
	let tempPasswordPath: string | undefined;
	let tempAskPassPath: string | undefined;
	const args = [
		'-T',
		'-o', 'StrictHostKeyChecking=accept-new',
		'-o', 'UserKnownHostsFile=/dev/null',
		'-o', 'Compression=no',
		'-o', 'IPQoS=throughput',
		'-o', 'RekeyLimit=16G',
		'-o', 'ConnectTimeout=5',
		'-o', 'ConnectionAttempts=1',
		'-o', 'ServerAliveInterval=15',
		'-o', 'ServerAliveCountMax=2',
		'-o', 'LogLevel=ERROR'
	];
	let env: NodeJS.ProcessEnv = tool.env;
	const askPassSecret = connection.password ?? connection.passphrase;
	if (askPassSecret) {
		tempPasswordPath = join(tmpdir(), `turbofile-native-ssh-${randomUUID()}.secret`);
		tempAskPassPath = join(tmpdir(), `turbofile-native-ssh-${randomUUID()}.cmd`);
		await fsp.writeFile(tempPasswordPath, askPassSecret, { mode: 0o600 });
		await fsp.writeFile(tempAskPassPath, `@echo off\r\ntype "${tempPasswordPath.replace(/"/g, '""')}"\r\n`, { mode: 0o700 });
		env = {
			...tool.env,
			SSH_ASKPASS: tempAskPassPath,
			SSH_ASKPASS_REQUIRE: 'force',
			DISPLAY: 'turbofile'
		};
		args.push('-o', 'NumberOfPasswordPrompts=1');
		args.push('-o', 'PreferredAuthentications=password,keyboard-interactive,publickey');
	} else {
		args.push('-o', 'BatchMode=yes');
	}
	if (connection.port && connection.port !== 22) {
		args.push('-p', String(connection.port));
	}
	if (connection.privateKeyPath) {
		args.push('-i', toOpenSshLocalPath(connection.privateKeyPath));
	} else if (connection.privateKey) {
		tempPrivateKeyPath = join(tmpdir(), `turbofile-native-ssh-${randomUUID()}.key`);
		await fsp.writeFile(tempPrivateKeyPath, connection.privateKey, { mode: 0o600 });
		args.push('-i', toOpenSshLocalPath(tempPrivateKeyPath));
	}
	args.push(`${connection.username}@${connection.host}`, remoteCommand);

	try {
		return await task(args, env);
	} finally {
		await Promise.all([
			tempPrivateKeyPath ? fsp.rm(tempPrivateKeyPath, { force: true }).catch(() => undefined) : undefined,
			tempPasswordPath ? fsp.rm(tempPasswordPath, { force: true }).catch(() => undefined) : undefined,
			tempAskPassPath ? fsp.rm(tempAskPassPath, { force: true }).catch(() => undefined) : undefined
		]);
	}
}

async function withNativeOpenSshScpBaseArgs<T>(connection: ITurboFileSshConnectionOptions, task: (args: string[], env?: NodeJS.ProcessEnv) => Promise<T>, legacyProtocol = false): Promise<T> {
	let tempPrivateKeyPath: string | undefined;
	let tempPasswordPath: string | undefined;
	let tempAskPassPath: string | undefined;
	// Use scp's default (SFTP-based) protocol — measured ~12% faster and more consistent for a
	// single large file than the legacy rcp protocol (`-O`), which is also unsupported on older
	// scp.exe builds. RekeyLimit=16G avoids mid-transfer key renegotiation stalls on large files.
	// NAS-style non-standard SCP ports use legacy scp because their SFTP subsystem can reject
	// shell-valid absolute paths even though the SCP wire protocol accepts them.
	const args = [
		...(legacyProtocol ? ['-O'] : []),
		'-q',
		'-o', 'StrictHostKeyChecking=accept-new',
		'-o', 'UserKnownHostsFile=/dev/null',
		'-o', 'Compression=no',
		'-o', 'IPQoS=throughput',
		'-o', 'RekeyLimit=16G',
		'-o', 'LogLevel=ERROR'
	];
	let env: NodeJS.ProcessEnv | undefined;
	const askPassSecret = connection.password ?? connection.passphrase;
	if (askPassSecret) {
		tempPasswordPath = join(tmpdir(), `turbofile-native-scp-${randomUUID()}.secret`);
		tempAskPassPath = join(tmpdir(), `turbofile-native-scp-${randomUUID()}.cmd`);
		await fsp.writeFile(tempPasswordPath, askPassSecret, { mode: 0o600 });
		await fsp.writeFile(tempAskPassPath, `@echo off\r\ntype "${tempPasswordPath.replace(/"/g, '""')}"\r\n`, { mode: 0o700 });
		env = {
			...process.env,
			SSH_ASKPASS: tempAskPassPath,
			SSH_ASKPASS_REQUIRE: 'force',
			DISPLAY: 'turbofile'
		};
		args.push('-o', 'NumberOfPasswordPrompts=1');
	} else {
		args.push('-o', 'BatchMode=yes');
	}
	if (connection.port && connection.port !== 22) {
		args.push('-P', String(connection.port));
	}
	if (connection.privateKeyPath) {
		args.push('-i', toOpenSshLocalPath(connection.privateKeyPath));
	} else if (connection.privateKey) {
		tempPrivateKeyPath = join(tmpdir(), `turbofile-native-scp-${randomUUID()}.key`);
		await fsp.writeFile(tempPrivateKeyPath, connection.privateKey, { mode: 0o600 });
		args.push('-i', toOpenSshLocalPath(tempPrivateKeyPath));
	}

	try {
		return await task(args, env);
	} finally {
		await Promise.all([
			tempPrivateKeyPath ? fsp.rm(tempPrivateKeyPath, { force: true }).catch(() => undefined) : undefined,
			tempPasswordPath ? fsp.rm(tempPasswordPath, { force: true }).catch(() => undefined) : undefined,
			tempAskPassPath ? fsp.rm(tempAskPassPath, { force: true }).catch(() => undefined) : undefined
		]);
	}
}

function formatNativeScpRemoteSpec(connection: ITurboFileSshConnectionOptions, remotePath: string): string {
	return `${connection.username}@${connection.host}:${remotePath}`;
}

function getNativeScpLocalDirectoryContentsPath(localPath: string): string {
	const trimmed = localPath.replace(/[\\/]+$/g, '');
	const separator = trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/';
	return `${trimmed}${separator}.`;
}

function getRemoteDirectoryContentsPath(remotePath: string): string {
	return `${ensureTrailingRemoteSlash(trimTrailingRemoteSlash(remotePath))}.`;
}

function isRecoverableLocalCommandTransferError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /not recognized|ENOENT|No such file|could not create directory|Permission denied|Connection|timed out|failed|lost connection|rsync error|size mismatch/i.test(message);
}

let localSshToolPromise: Promise<ILocalSshTool> | undefined;
let localZstdToolPromise: Promise<ILocalZstdTool> | undefined;
let localRsyncToolPromise: Promise<ILocalRsyncTool> | undefined;

function resolveLocalSshTool(): Promise<ILocalSshTool> {
	localSshToolPromise ??= doResolveLocalSshTool();
	return localSshToolPromise;
}

async function doResolveLocalSshTool(): Promise<ILocalSshTool> {
	if (platform() !== 'win32') {
		return createLocalSshTool('ssh');
	}
	for (const candidate of getBundledLocalSshCandidates()) {
		if (await localPathExists(candidate)) {
			return createLocalSshTool(candidate);
		}
	}
	return createLocalSshTool('ssh.exe');
}

function createLocalSshTool(executable: string): ILocalSshTool {
	const executableDirectory = /[\\/]/.test(executable) ? dirname(executable) : undefined;
	const env = createLocalToolEnvironment(executableDirectory);
	return { executable, env };
}

function resolveLocalZstdTool(): Promise<ILocalZstdTool> {
	localZstdToolPromise ??= doResolveLocalZstdTool();
	return localZstdToolPromise;
}

async function doResolveLocalZstdTool(): Promise<ILocalZstdTool> {
	if (platform() !== 'win32') {
		return createLocalZstdTool('zstd');
	}
	const whereOutput = await runLocalCommandBuffer('where.exe', ['zstd.exe'], 1024 * 1024);
	const executable = whereOutput.toString().split(/\r?\n/).map(line => line.trim()).find(line => !!line) ?? 'zstd.exe';
	return createLocalZstdTool(executable);
}

function createLocalZstdTool(executable: string): ILocalZstdTool {
	const executableDirectory = /[\\/]/.test(executable) ? dirname(executable) : undefined;
	const env = createLocalToolEnvironment(executableDirectory);
	return { executable, env };
}

function resolveLocalRsyncTool(): Promise<ILocalRsyncTool> {
	localRsyncToolPromise ??= doResolveLocalRsyncTool();
	return localRsyncToolPromise;
}

async function doResolveLocalRsyncTool(): Promise<ILocalRsyncTool> {
	if (platform() !== 'win32') {
		return createLocalRsyncTool('rsync', 'posix');
	}
	for (const candidate of getBundledLocalRsyncCandidates()) {
		if (await localPathExists(candidate)) {
			return createLocalRsyncTool(candidate, 'cygwin');
		}
	}
	throw new Error('No such file: bundled TurboFile rsync.exe was not found.');
}

async function createLocalRsyncTool(executable: string, pathFlavor: ILocalRsyncTool['pathFlavor']): Promise<ILocalRsyncTool> {
	const executableDirectory = /[\\/]/.test(executable) ? dirname(executable) : undefined;
	const sshCandidate = executableDirectory ? join(executableDirectory, 'ssh.exe') : undefined;
	const sshExecutable = sshCandidate && await localPathExists(sshCandidate) ? sshCandidate : undefined;
	const env = createLocalToolEnvironment(executableDirectory);
	if (executableDirectory) {
		env.CWRSYNCHOME ??= executableDirectory;
	}
	return { executable, sshExecutable, pathFlavor, env };
}

function createLocalToolEnvironment(executableDirectory: string | undefined): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env };
	if (executableDirectory) {
		const pathDelimiter = platform() === 'win32' ? ';' : ':';
		env.PATH = [executableDirectory, env.PATH].filter((value): value is string => !!value).join(pathDelimiter);
	}
	if (platform() === 'win32' && env.USERPROFILE) {
		env.HOME = env.USERPROFILE;
	}
	env.LC_ALL ??= 'C';
	env.LANG ??= 'C';
	return env;
}

function getBundledLocalRsyncCandidates(): string[] {
	const relativePath = join('resources', 'turbofile', 'rsync', 'win32', 'rsync.exe');
	const appPath = safeGetElectronAppPath();
	const cwd = process.cwd();
	const roots = [
		appPath,
		join(appPath, 'out'),
		dirname(appPath),
		process.resourcesPath,
		process.resourcesPath ? join(process.resourcesPath, 'app') : undefined,
		cwd,
		join(cwd, 'out'),
		dirname(cwd)
	].filter((value): value is string => !!value);
	return [...new Set(roots.map(root => join(root, relativePath)))];
}

function getBundledLocalSshCandidates(): string[] {
	return getBundledLocalRsyncCandidates().map(candidate => join(dirname(candidate), 'ssh.exe'));
}

function safeGetElectronAppPath(): string {
	try {
		return app.getAppPath();
	} catch {
		return process.cwd();
	}
}

async function localPathExists(path: string): Promise<boolean> {
	try {
		await fsp.access(path);
		return true;
	} catch {
		return false;
	}
}

async function withLocalRsyncSshEnvironment<T>(connection: ITurboFileSshConnectionOptions, tool: ILocalRsyncTool, task: (env: NodeJS.ProcessEnv, identityPath?: string) => Promise<T>): Promise<T> {
	const askPassSecret = connection.password ?? connection.passphrase;
	let tempPrivateKeyPath: string | undefined;
	let tempPasswordPath: string | undefined;
	let tempAskPassPath: string | undefined;
	try {
		if (connection.privateKey && !connection.privateKeyPath) {
			tempPrivateKeyPath = join(tmpdir(), `turbofile-rsync-${randomUUID()}.key`);
			await fsp.writeFile(tempPrivateKeyPath, connection.privateKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n?$/, '\n'), { mode: 0o600 });
			await fsp.chmod(tempPrivateKeyPath, 0o600).catch(() => undefined);
		}

		if (!askPassSecret) {
			return await task(tool.env, tempPrivateKeyPath);
		}

		const isWindowsHost = platform() === 'win32';
		tempPasswordPath = join(tmpdir(), `turbofile-rsync-${randomUUID()}.secret`);
		tempAskPassPath = join(tmpdir(), `turbofile-rsync-${randomUUID()}${isWindowsHost ? '.cmd' : '.sh'}`);
		await fsp.writeFile(tempPasswordPath, askPassSecret, { mode: 0o600 });
		if (isWindowsHost) {
			// Keep SSH_ASKPASS as a native Windows path. The bundled rsync still needs cygwin-style
			// file paths, but MSYS2 ssh.exe can exec a .cmd askpass only when it receives C:\... here.
			await fsp.writeFile(tempAskPassPath, `@echo off\r\ntype "${tempPasswordPath.replace(/"/g, '""')}"\r\n`, { mode: 0o700 });
		} else {
			await fsp.writeFile(tempAskPassPath, `#!/bin/sh\ncat ${quotePosixShellArg(tempPasswordPath)}\n`, { mode: 0o700 });
		}
		await fsp.chmod(tempAskPassPath, 0o700).catch(() => undefined);
		return await task({
			...tool.env,
			SSH_ASKPASS: isWindowsHost ? tempAskPassPath : toRsyncLocalPath(tempAskPassPath, tool.pathFlavor),
			SSH_ASKPASS_REQUIRE: 'force',
			DISPLAY: 'turbofile'
		}, tempPrivateKeyPath);
	} finally {
		await Promise.all([
			tempPrivateKeyPath ? fsp.rm(tempPrivateKeyPath, { force: true }).catch(() => undefined) : undefined,
			tempPasswordPath ? fsp.rm(tempPasswordPath, { force: true }).catch(() => undefined) : undefined,
			tempAskPassPath ? fsp.rm(tempAskPassPath, { force: true }).catch(() => undefined) : undefined
		]);
	}
}

function buildLocalRsyncSshTransport(connection: ITurboFileSshConnectionOptions, sshExecutable?: string, identityPathOverride?: string): string {
	const hasAskPassSecret = !!(connection.password ?? connection.passphrase);
	const parts = [
		formatLocalRsyncCommand(sshExecutable ?? 'ssh'),
		'-T',
		'-F /dev/null',
		'-o StrictHostKeyChecking=accept-new',
		'-o UserKnownHostsFile=/dev/null',
		'-o Compression=no',
		'-o LogLevel=ERROR',
		'-o ConnectTimeout=8',
		'-o ConnectionAttempts=1',
		'-o ServerAliveInterval=15',
		'-o ServerAliveCountMax=2'
	];
	if (hasAskPassSecret) {
		parts.push('-o BatchMode=no');
		parts.push('-o NumberOfPasswordPrompts=1');
		parts.push('-o PreferredAuthentications=password,keyboard-interactive,publickey');
	} else {
		parts.push('-o BatchMode=yes');
	}
	const identityPath = identityPathOverride ?? connection.privateKeyPath;
	if (identityPath) {
		const formattedIdentityPath = sshExecutable ? toRsyncLocalPath(identityPath) : toOpenSshLocalPath(identityPath);
		parts.push(`-i ${quoteLocalShellArg(formattedIdentityPath)}`);
	}
	if (connection.port && connection.port !== 22) {
		parts.push(`-p ${connection.port}`);
	}
	return parts.join(' ');
}

function formatLocalRsyncCommand(command: string): string {
	return /[\\/]/.test(command) ? quoteLocalShellArg(toRsyncLocalPath(command)) : command;
}

function formatRsyncRemoteSpec(connection: ITurboFileSshConnectionOptions, remotePath: string): string {
	return `${connection.username}@${connection.host}:${remotePath}`;
}

function toRsyncLocalPath(path: string, flavor: ILocalRsyncTool['pathFlavor'] = 'cygwin'): string {
	const normalized = path.replace(/\\/g, '/');
	const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
	if (driveMatch) {
		if (flavor === 'posix') {
			return normalized;
		}
		const drive = driveMatch[1].toLowerCase();
		return `/cygdrive/${drive}/${driveMatch[2]}`;
	}
	return normalized;
}

function toOpenSshLocalPath(path: string): string {
	return path.replace(/\\/g, '/');
}

function normalizeTarListPath(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function quoteLocalShellArg(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

function getDirectSshRouteCacheKey(source: ITurboFileSshConnectionOptions, target: ITurboFileSshConnectionOptions): string {
	return `${getSshConnectionRouteKey(source)}=>${getSshConnectionRouteKey(target)}`;
}

function getDirectSshRouteFailureKey(cacheKey: string, route: TurboFileDirectSshRoute): string {
	return `${cacheKey}:${route}`;
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

function collectBatchTarTargetNames(plans: readonly ITarBatchPlan[]): string[] {
	const targetNames: string[] = [];
	for (const plan of plans) {
		targetNames.push(...plan.targetNames);
	}
	return targetNames;
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

function buildTarCreateFromDirectoryCommand(path: string): string {
	return `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(path)} .`;
}

function buildTarCreateFromItemsCommand(parentPath: string, names: readonly string[]): string {
	const itemArgs = names.map(name => quotePosixShellArg(name)).join(' ');
	return `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(parentPath)} -- ${itemArgs}`;
}

function buildRejectExistingDirectoryTransferTargetCommand(path: string): string {
	const target = quotePosixShellArg(path);
	const message = quotePosixShellArg(`Target directory already exists: ${path}`);
	return `if [ -e ${target} ]; then printf '%s\\n' ${message} >&2; exit 73; fi`;
}

function buildPrepareDirectoryTransferTargetCommand(path: string): string {
	const target = quotePosixShellArg(path);
	return `${buildRejectExistingDirectoryTransferTargetCommand(path)} && mkdir -p -- ${target}`;
}

function buildRejectExistingTargetDirectoriesCommand(targetDirectory: string, targetNames: readonly string[]): string {
	return targetNames
		.map(name => {
			const path = joinRemotePath(targetDirectory, name);
			const target = quotePosixShellArg(path);
			const message = quotePosixShellArg(`Target directory already exists: ${path}`);
			return `if [ -d ${target} ]; then printf '%s\\n' ${message} >&2; exit 73; fi`;
		})
		.join(' && ');
}

function buildTarExtractToExactDirectoryCommand(path: string): string {
	const target = quotePosixShellArg(path);
	return `command -v tar >/dev/null 2>&1 && ${buildPrepareDirectoryTransferTargetCommand(path)} && tar -xf - -C ${target}`;
}

function buildPrepareTarExtractToExactDirectoryCommand(path: string): string {
	return `command -v tar >/dev/null 2>&1 && ${buildPrepareDirectoryTransferTargetCommand(path)}`;
}

function buildTarExtractStreamToDirectoryCommand(path: string): string {
	const target = quotePosixShellArg(path);
	return `command -v tar >/dev/null 2>&1 && tar -xf - -C ${target}`;
}

function buildPrepareTarZstdExtractToExactDirectoryCommand(path: string): string {
	return `command -v tar >/dev/null 2>&1 && command -v zstd >/dev/null 2>&1 && ${buildPrepareDirectoryTransferTargetCommand(path)}`;
}

function buildTarZstdExtractToDirectoryCommand(path: string): string {
	const target = quotePosixShellArg(path);
	return `command -v tar >/dev/null 2>&1 && command -v zstd >/dev/null 2>&1 && zstd -d -c | tar -xf - -C ${target}`;
}

function buildTarExtractToDirectoryCommand(targetDirectory: string, targetNames: readonly string[]): string {
	const target = quotePosixShellArg(targetDirectory);
	const conflictCheck = buildRejectExistingTargetDirectoriesCommand(targetDirectory, targetNames);
	return `command -v tar >/dev/null 2>&1 && mkdir -p -- ${target} && ${conflictCheck ? `${conflictCheck} && ` : ''}tar -xf - -C ${target}`;
}

function buildPrepareTarExtractToDirectoryFromListCommand(targetDirectory: string, requireZstd: boolean): string {
	const target = quotePosixShellArg(targetDirectory);
	const commands = [
		'set -e',
		'command -v tar >/dev/null 2>&1',
		requireZstd ? 'command -v zstd >/dev/null 2>&1' : undefined,
		`target=${target}`,
		'mkdir -p -- "$target"',
		'while IFS= read -r -d \'\' name; do if [ -n "$name" ] && [ -d "$target/$name" ]; then printf \'%s\\n\' "Target directory already exists: $target/$name" >&2; exit 73; fi; done'
	].filter((command): command is string => !!command);
	return `bash -lc ${quotePosixShellArg(commands.join('; '))}`;
}

function buildTarSourcePushCommand(sourcePath: string, targetPath: string, targetUserHost: string, sshCommand: string, sshpassPrefix: string): string {
	const prepareTarget = `command -v tar >/dev/null 2>&1 && ${buildPrepareDirectoryTransferTargetCommand(targetPath)}`;
	const extractTarget = `tar -xf - -C ${quotePosixShellArg(targetPath)}`;
	const remoteShell = `${sshpassPrefix}${sshCommand} ${quotePosixShellArg(targetUserHost)}`;
	return `command -v tar >/dev/null 2>&1 && ${remoteShell} ${quotePosixShellArg(prepareTarget)} && tar -cf - -C ${quotePosixShellArg(sourcePath)} . | ${remoteShell} ${quotePosixShellArg(extractTarget)}`;
}

function buildTarItemsSourcePushCommand(parentPath: string, names: readonly string[], targetDirectory: string, targetNames: readonly string[], targetUserHost: string, sshCommand: string, sshpassPrefix: string): string {
	const target = quotePosixShellArg(targetDirectory);
	const conflictCheck = buildRejectExistingTargetDirectoriesCommand(targetDirectory, targetNames);
	const prepareTarget = `command -v tar >/dev/null 2>&1 && mkdir -p -- ${target} && ${conflictCheck ? `${conflictCheck} && ` : ''}true`;
	const extractTarget = `tar -xf - -C ${target}`;
	const remoteShell = `${sshpassPrefix}${sshCommand} ${quotePosixShellArg(targetUserHost)}`;
	return `${remoteShell} ${quotePosixShellArg(prepareTarget)} && ${buildTarCreateFromItemsCommand(parentPath, names)} | ${remoteShell} ${quotePosixShellArg(extractTarget)}`;
}

function buildTarTargetPullCommand(sourcePath: string, targetPath: string, sourceUserHost: string, sshCommand: string, sshpassPrefix: string): string {
	const createSource = `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(sourcePath)} .`;
	return `command -v tar >/dev/null 2>&1 && ${buildPrepareDirectoryTransferTargetCommand(targetPath)} && ${sshpassPrefix}${sshCommand} ${quotePosixShellArg(sourceUserHost)} ${quotePosixShellArg(createSource)} | tar -xf - -C ${quotePosixShellArg(targetPath)}`;
}

function buildTarItemsTargetPullCommand(parentPath: string, names: readonly string[], targetDirectory: string, targetNames: readonly string[], sourceUserHost: string, sshCommand: string, sshpassPrefix: string): string {
	const target = quotePosixShellArg(targetDirectory);
	const conflictCheck = buildRejectExistingTargetDirectoriesCommand(targetDirectory, targetNames);
	const createSource = buildTarCreateFromItemsCommand(parentPath, names);
	return `command -v tar >/dev/null 2>&1 && mkdir -p -- ${target} && ${conflictCheck ? `${conflictCheck} && ` : ''}${sshpassPrefix}${sshCommand} ${quotePosixShellArg(sourceUserHost)} ${quotePosixShellArg(createSource)} | tar -xf - -C ${target}`;
}

function waitForLocalProcessClose(child: ReturnType<typeof spawn>, context: string): Promise<void> {
	return new Promise((resolve, reject) => {
		let stderr = '';
		child.stderr?.on('data', data => {
			stderr += data.toString();
		});
		child.on('error', reject);
		child.on('close', code => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(stderr.trim() || `${context} failed with exit code ${code ?? 'unknown'}.`));
		});
	});
}

function createProgressPassThrough(onDelta?: (delta: number) => void): PassThrough {
	const stream = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });
	if (onDelta) {
		stream.on('data', chunk => {
			onDelta(Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(String(chunk)));
		});
	}
	return stream;
}

function runLocalCommand(command: string, args: string[], options: { readonly env?: NodeJS.ProcessEnv } = {}): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(command, args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024, env: options.env }, (error, _stdout, stderr) => {
			if (error) {
				reject(new Error(formatLocalCommandError(stderr, error.message)));
				return;
			}
			resolve();
		});
	});
}

function killLocalProcessTree(child: ChildProcess): void {
	if (child.pid && platform() === 'win32') {
		execFile('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => undefined);
		return;
	}
	child.kill('SIGTERM');
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

function runLocalPowerShellStaScriptBuffer(script: string, maxBuffer = 10 * 1024 * 1024): Promise<Buffer> {
	return runLocalCommandBuffer('powershell.exe', ['-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShellCommand(script)], maxBuffer);
}

function createWindowsDragIcon(): Electron.NativeImage {
	const icon = nativeImage.createFromDataURL(WINDOWS_DRAG_ICON_DATA_URL);
	return icon.isEmpty() ? nativeImage.createEmpty() : icon;
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
	return runLocalRobocopyCommandBuffer(args).then(() => undefined);
}

function runLocalRobocopyCommandBuffer(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile('robocopy.exe', args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
			if (!error) {
				resolve(stdout);
				return;
			}

			const exitCode = typeof error.code === 'number' ? error.code : Number.NaN;
			if (Number.isFinite(exitCode) && exitCode <= 7) {
				resolve(stdout);
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

async function ensureLocalDirectoryTransferTargetAvailable(path: string): Promise<void> {
	await throwIfLocalPathExists(path);
	await ensureLocalDirectory(path);
}

async function throwIfLocalPathExists(path: string): Promise<void> {
	const stat = await fsp.stat(path).catch(error => {
		if (isFileNotFoundError(error)) {
			return undefined;
		}
		throw error;
	});
	if (stat) {
		throw new Error(`Target directory already exists: ${path}`);
	}
}

async function throwIfLocalTargetDirectoryExists(path: string): Promise<void> {
	const stat = await fsp.stat(path).catch(error => {
		if (isFileNotFoundError(error)) {
			return undefined;
		}
		throw error;
	});
	if (stat?.isDirectory()) {
		throw new Error(`Target directory already exists: ${path}`);
	}
}

function isFileNotFoundError(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
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
	if (hasPassword) {
		parts.push('-o BatchMode=no');
		parts.push('-o PreferredAuthentications=password,keyboard-interactive,publickey');
	} else {
		parts.push('-o BatchMode=yes');
	}
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
	if (hasPassword) {
		parts.push('-o BatchMode=no');
		parts.push('-o PreferredAuthentications=password,keyboard-interactive,publickey');
	} else {
		parts.push('-o BatchMode=yes');
	}
	if (port && port !== 22) {
		parts.push(`-P ${port}`);
	}
	return parts.join(' ');
}

function shouldPreferLegacyScpMode(connection: ITurboFileSshConnectionOptions): boolean {
	return !!connection.port && connection.port !== 22;
}

function buildDirectScpCommand(port: number, hasPassword = false, identityPath?: string, recursive = false): string {
	const parts = [
		'scp',
		'-q',
		'-o Compression=no',
		'-o IPQoS=throughput',
		'-o RekeyLimit=16G',
		'-o ConnectTimeout=5',
		'-o ConnectionAttempts=1',
		'-o NumberOfPasswordPrompts=1',
		'-o ServerAliveInterval=15',
		'-o ServerAliveCountMax=2',
		'-o StrictHostKeyChecking=no',
		'-o UserKnownHostsFile=/dev/null',
		'-o LogLevel=ERROR'
	];
	if (hasPassword) {
		parts.push('-o BatchMode=no');
		parts.push('-o PreferredAuthentications=password,keyboard-interactive,publickey');
	} else {
		parts.push('-o BatchMode=yes');
	}
	if (identityPath) {
		parts.push(`-i ${quotePosixShellArg(identityPath)}`);
	}
	if (recursive) {
		parts.push('-r');
	}
	if (port && port !== 22) {
		parts.push(`-P ${port}`);
	}
	return parts.join(' ');
}

function buildDirectScpSshCommand(port: number, hasPassword = false, identityPath?: string): string {
	const parts = [
		'ssh',
		'-o Compression=no',
		'-o IPQoS=throughput',
		'-o RekeyLimit=16G',
		'-o ConnectTimeout=5',
		'-o ConnectionAttempts=1',
		'-o NumberOfPasswordPrompts=1',
		'-o ServerAliveInterval=15',
		'-o ServerAliveCountMax=2',
		'-o StrictHostKeyChecking=no',
		'-o UserKnownHostsFile=/dev/null',
		'-o LogLevel=ERROR'
	];
	if (hasPassword) {
		parts.push('-o BatchMode=no');
		parts.push('-o PreferredAuthentications=password,keyboard-interactive,publickey');
	} else {
		parts.push('-o BatchMode=yes');
	}
	if (identityPath) {
		parts.push(`-i ${quotePosixShellArg(identityPath)}`);
	}
	if (port && port !== 22) {
		parts.push(`-p ${port}`);
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
	if (hasPassword) {
		parts.push('-o BatchMode=no');
		parts.push('-o PreferredAuthentications=password,keyboard-interactive,publickey');
	} else {
		parts.push('-o BatchMode=yes');
	}
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

function buildWindowsBatchDeleteCommand(sourcePaths: readonly string[]): string {
	const sources = sourcePaths.map(path => quotePowerShellLiteral(path)).join(',');
	return buildPowerShellCommand(withPowerShellDefaults(`$srcs=@(${sources}); foreach ($src in $srcs) { if (Test-Path -LiteralPath $src) { Remove-Item -LiteralPath $src -Force -Recurse } }`));
}

function buildLocalWindowsReverseParallelRsyncCommand(sourceConnection: ITurboFileSshConnectionOptions, items: readonly ILocalWindowsReverseRsyncItem[], sshTransport: string, cleanupTargets: readonly string[]): string {
	const rsyncOptions = [...buildLocalRsyncOptionArgs(true), '--iconv=UTF-8,UTF-8'].join(' ');
	const sshpassPrefix = buildSshpassPrefix(sourceConnection.password);
	const sourceUserHost = `${sourceConnection.username}@${sourceConnection.host}`;
	const commands = items.map((item, index) => {
		const sourcePath = item.directory ? ensureTrailingRemoteSlash(item.sourcePath) : item.sourcePath;
		const targetPath = item.directory ? ensureTrailingRemoteSlash(item.targetPath) : ensureTrailingRemoteSlash(getRemoteParentPath(item.targetPath));
		const mkdirPath = item.directory ? item.targetPath : getRemoteParentPath(item.targetPath);
		const sourceSpec = `${sourceUserHost}:${sourcePath}`;
		const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(sourceSpec)} ${quotePosixShellArg(targetPath)}`;
		const progressTag = quotePosixShellArg(`__TURBOFILE_RSYNC_${index}__ `);
		const progressFilter = `tr '\\r' '\\n' | awk -v tag=${progressTag} ${quotePosixShellArg('$0 ~ /%/ { now=systime(); if (now != last || $0 ~ /100%/) { print tag $0; fflush(); last=now } }')}`;
		return `(mkdir -p -- ${quotePosixShellArg(mkdirPath)} && ${rsyncCommand} 2>&1 | ${progressFilter}) & pids="$pids $!"`;
	});
	const cleanupTargetArgs = Array.from(new Set(cleanupTargets.map(target => trimTrailingRemoteSlash(target)).filter(target => target && target !== '/'))).map(target => quotePosixShellArg(target)).join(' ');
	const script = [
		'set -o pipefail',
		'command -v rsync >/dev/null 2>&1',
		'command -v sshpass >/dev/null 2>&1',
		cleanupTargetArgs ? `rm -rf -- ${cleanupTargetArgs}` : undefined,
		'pids=""',
		...commands,
		'failed=0',
		'for pid in $pids; do if ! wait "$pid"; then failed=1; fi; done',
		'if [ "$failed" -ne 0 ]; then exit 1; fi'
	].filter((command): command is string => !!command);
	return `bash -lc ${quotePosixShellArg(script.join('; '))}`;
}

function getLocalWindowsRsyncConfigPaths(): string[] {
	const candidates = [
		process.env.TURBOFILE_LOCAL_WINDOWS_CONFIG,
		process.env.TURBOFILE_WEB_CONFIG,
		join(process.cwd(), '..', 'TurboFile-web', 'data', 'config.json'),
		join(app.getAppPath(), '..', 'TurboFile-web', 'data', 'config.json')
	].filter((value): value is string => !!value);
	return Array.from(new Set(candidates));
}

function getLocalIpv4Addresses(): Set<string> {
	const addresses = new Set<string>();
	for (const entries of Object.values(networkInterfaces())) {
		for (const entry of entries ?? []) {
			if (entry.family === 'IPv4' && !entry.internal) {
				addresses.add(entry.address);
			}
		}
	}
	return addresses;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readStringProperty(source: Record<string, unknown>, key: string): string | undefined {
	const value = source[key];
	return typeof value === 'string' && value ? value : undefined;
}

function readNumberProperty(source: Record<string, unknown>, key: string): number | undefined {
	const value = source[key];
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function buildRsyncOptions(includeProgress: boolean): string {
	return buildLocalRsyncOptionArgs(includeProgress).join(' ');
}

function parseRsyncSpeedBytesPerSecond(value: string, unit: string): number | undefined {
	const parsed = Number(value.replace(',', '.'));
	if (!Number.isFinite(parsed) || parsed < 0) {
		return undefined;
	}
	const normalizedUnit = unit.toUpperCase();
	const multiplier = normalizedUnit === 'P'
		? 1024 ** 5
		: normalizedUnit === 'T'
			? 1024 ** 4
			: normalizedUnit === 'G'
				? 1024 ** 3
				: normalizedUnit === 'M'
					? 1024 ** 2
					: normalizedUnit === 'K'
						? 1024
						: 1;
	return Math.max(0, Math.round(parsed * multiplier));
}

function buildLocalRsyncOptionArgs(includeProgress: boolean): string[] {
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
		options.push('--info=progress2', '--outbuf=N');
	}
	return options;
}

function buildRsyncPathWithMkdirOption(remoteDirectory: string): string {
	return `--rsync-path=mkdir -p ${quotePosixShellArg(remoteDirectory)} && rsync`;
}

function buildRsyncPathWithMkdirShellOption(remoteDirectory: string): string {
	return `--rsync-path=${quotePosixShellArg(`mkdir -p ${quotePosixShellArg(remoteDirectory)} && rsync`)}`;
}

function buildWindowsDeleteCommand(path: string, recursive: boolean): string {
	const literalPath = path.replace(/'/g, "''");
	const recurseFlag = recursive ? ' -Recurse' : '';
	return `powershell -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $path='${literalPath}'; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force${recurseFlag} }"`;
}

function buildWindowsDeleteManyCommand(paths: readonly string[], recursive: boolean): string {
	const list = paths.map(path => `'${path.replace(/'/g, "''")}'`).join(',');
	const recurseFlag = recursive ? ' -Recurse' : '';
	return `powershell -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; foreach ($p in @(${list})) { if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force${recurseFlag} } }"`;
}

function buildWindowsSizeCommand(path: string): string {
	const target = quotePowerShellLiteral(path);
	return buildPowerShellCommand(withPowerShellDefaults(`$path=${target}; if (Test-Path -LiteralPath $path -PathType Container) { $dest=Join-Path ([System.IO.Path]::GetTempPath()) 'turbofile-size-probe'; $output=& robocopy $path $dest /L /E /BYTES /R:0 /W:0 /NFL /NDL /NJH /NP /NC /NS /XJ 2>&1; if ($LASTEXITCODE -gt 7) { throw (($output | Out-String).Trim()) }; $match=[regex]::Match(($output | Out-String), '(?im)^\\s*Bytes\\s*:\\s*([0-9][0-9,\\.]*)'); if (-not $match.Success) { throw 'Unable to parse robocopy size output.' }; [Int64]($match.Groups[1].Value -replace '[^0-9]', '') } elseif (Test-Path -LiteralPath $path -PathType Leaf) { [Int64](Get-Item -LiteralPath $path).Length } else { throw 'Path not found' }`));
}

function buildPosixSizeCommand(path: string): string {
	const quotedPath = quotePosixShellArg(path);
	return `p=${quotedPath}; if [ -d "$p" ]; then size=''; if command -v du >/dev/null 2>&1; then size=$(du -sb -- "$p" 2>/dev/null | awk 'NR==1 {print $1; exit}'); if [ -z "$size" ]; then size=$(du -sk -- "$p" 2>/dev/null | awk 'NR==1 {printf "%.0f\\n", $1 * 1024; exit}'); fi; fi; if [ -z "$size" ]; then size=$(find "$p" -type f -printf '%s\\n' 2>/dev/null | awk '{s += $1} END {printf "%.0f\\n", s + 0}'); fi; printf '%s\\n' "$size"; elif [ -f "$p" ] || [ -L "$p" ]; then stat -c '%s' -- "$p"; else echo 'Path not found' >&2; exit 2; fi`;
}

function buildPosixContentSizeCommand(path: string): string {
	const quotedPath = quotePosixShellArg(path);
	return `p=${quotedPath}; if [ -d "$p" ]; then find "$p" -type f -printf '%s\\n' 2>/dev/null | awk '{s += $1} END {printf "%.0f\\n", s + 0}'; elif [ -f "$p" ] || [ -L "$p" ]; then stat -c '%s' -- "$p"; else echo 'Path not found' >&2; exit 2; fi`;
}

function buildPosixHumanSizeCommand(path: string): string {
	const quotedPath = quotePosixShellArg(path);
	return `du -sh -- ${quotedPath} 2>/dev/null | awk 'NR==1 {print $1; exit}'`;
}

function buildPosixFastDirectoryListCommand(path: string): string {
	const quotedPath = quotePosixShellArg(path);
	return `LC_ALL=C find ${quotedPath} -mindepth 1 -maxdepth 1 -printf '%f\\0%y\\0%s\\0%T@\\0'`;
}

// Names + type only. `%y` is resolved from the directory entry's d_type on common filesystems, so
// this avoids a stat() per file and returns instantly even for directories with hundreds of
// thousands of entries. Size and modified time are filled in lazily for visible rows afterwards.
function buildPosixNamesAndTypesListCommand(path: string): string {
	const quotedPath = quotePosixShellArg(path);
	return `LC_ALL=C find ${quotedPath} -mindepth 1 -maxdepth 1 -printf '%f\\0%y\\0'`;
}

// Size + modified time for specific entries in one round trip. Names are passed relative to the
// directory (via `cd`) so `%n` echoes them back exactly, letting the caller map results by name.
function buildPosixStatEntriesCommand(directoryPath: string, names: readonly string[]): string {
	return buildRemotePosixStatEntriesCommand(directoryPath, names);
}

function parseRemoteStatEntries(text: string): ITurboFileEntryStat[] {
	if (!text) {
		return [];
	}
	const parts = text.split('\0');
	const stats: ITurboFileEntryStat[] = [];
	for (let index = 0; index + 2 < parts.length; index += 3) {
		const rawName = parts[index];
		if (!rawName) {
			continue;
		}
		// `stat` echoes the argument exactly, i.e. with the leading "./" we passed; strip it back off.
		const name = rawName.replace(/^\.\//, '').replace(/\r?\n$/, '');
		if (!name) {
			continue;
		}
		const size = Number(parts[index + 1]);
		const modifiedSeconds = Number(parts[index + 2]);
		stats.push({
			name,
			size: Number.isFinite(size) ? size : 0,
			// `%Y` is epoch seconds; the rest of the app (see toRemoteEntry) carries modified time in
			// milliseconds and formatDate expects ms, so convert here — otherwise every row renders 1970.
			modified: Number.isFinite(modifiedSeconds) ? Math.floor(modifiedSeconds) * 1000 : 0
		});
	}
	return stats;
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

// Streams each file as "<path>\n<size>\n<bytes>" in one round trip. Small originals (<= the raw
// passthrough size) stream as-is. Larger ones are downscaled to a small JPEG by a remote tool when
// present (vipsthumbnail — very fast and light on ARM boards — else ImageMagick magick/convert); this
// shrinks the transfer dramatically so big images load almost as fast as small ones. With no tool,
// files within `maxBytes` stream raw and larger ones report size -1 (caller falls back per-image).
// All of this is pure shell + an optional resize; nothing depends on the client.
function buildPosixReadImagesBatchCommand(paths: readonly string[], maxBytes: number, maxWidth: number): string {
	const list = paths.map(path => quotePosixShellArg(path)).join(' ');
	// maxWidth <= 0 means "raw original, no downscale" (used by the single-image preview). Otherwise we
	// downscale large originals to a thumbnail when a remote tool exists. Everything is pure shell +
	// `cat` (and an optional resize), so it works on minimal busybox shells and never depends on SFTP —
	// boards/NAS where SFTP is flaky or no image tool exists still stream the raw bytes for the client
	// to decode. A trailing `:` guarantees a zero exit so a single unreadable file never fails the batch.
	const forceRaw = !maxWidth || maxWidth <= 0;
	const width = Math.max(96, Math.floor(maxWidth) || 480);
	const rawPassthrough = 768 * 1024;
	// TIFF has no in-browser decoder, so it must be transcoded to JPEG by a remote tool regardless of
	// size: full resolution for the single-image preview (forceRaw), the thumbnail width otherwise.
	const tiffWidth = forceRaw ? 0 : width;
	const lines: string[] = [];
	// Always probe for an image tool: it downscales large originals AND is the only way to render TIFF.
	// Probing is just a couple of `command -v` calls, so it stays cheap even on weak boards.
	lines.push(`if command -v vipsthumbnail >/dev/null 2>&1; then T=vips`);
	lines.push(`elif command -v magick >/dev/null 2>&1; then T=magick`);
	lines.push(`elif command -v convert >/dev/null 2>&1; then T=convert`);
	lines.push(`else T=; fi`);
	lines.push(`emit(){ if [ "$2" -le ${maxBytes} ]; then printf '%s\\n%s\\n' "$1" "$2"; cat "$1"; else printf '%s\\n-1\\n' "$1"; fi; }`);
	// Transcode $1 to JPEG file $2. $3>0 downscales to that width; $3=0 keeps the native resolution.
	// `[0]` takes the first page of a multi-page TIFF for ImageMagick; vips reads page 0 by default.
	lines.push(`mkjpg(){ if [ "$3" -gt 0 ]; then case "$T" in vips) vipsthumbnail "$1" --size "$3x" -o "$2[Q=82,strip]" >/dev/null 2>&1;; magick|convert) "$T" "$1[0]" -resize "$3x" -strip -quality 82 jpg:"$2" >/dev/null 2>&1;; *) return 1;; esac; else case "$T" in vips) vipsthumbnail "$1" --size 30000x30000 -o "$2[Q=88,strip]" >/dev/null 2>&1;; magick|convert) "$T" "$1[0]" -strip -quality 88 jpg:"$2" >/dev/null 2>&1;; *) return 1;; esac; fi }`);
	// Emit a transcoded JPEG (length-framed); returns non-zero without emitting if transcoding fails.
	lines.push(`tojpg(){ o=$(mktemp 2>/dev/null) || o=/tmp/tfthumb.$$; oj="$o.jpg"; if mkjpg "$1" "$oj" "$3" && [ -s "$oj" ]; then tz=$(wc -c < "$oj" 2>/dev/null | tr -d ' \\t\\n'); if [ -n "$tz" ] && [ "$tz" -le ${maxBytes} ]; then printf '%s\\n%s\\n' "$1" "$tz"; cat "$oj"; rm -f "$o" "$oj" 2>/dev/null; return 0; fi; fi; rm -f "$o" "$oj" 2>/dev/null; return 1; }`);
	lines.push(`for f in ${list}; do`);
	lines.push(`[ -f "$f" ] || continue`);
	lines.push(`sz=$(wc -c < "$f" 2>/dev/null | tr -d ' \\t\\n'); [ -n "$sz" ] || continue`);
	// TIFF can never stream raw (browsers can't decode it): always transcode, or report -1 if no tool.
	lines.push(`case $(printf '%s' "$f" | tr 'A-Z' 'a-z') in *.tif|*.tiff) if [ -n "$T" ] && tojpg "$f" "$sz" ${tiffWidth}; then :; else printf '%s\\n-1\\n' "$f"; fi; continue;; esac`);
	if (forceRaw) {
		lines.push(`emit "$f" "$sz"`);
	} else {
		lines.push(`if [ "$sz" -le ${rawPassthrough} ] || [ -z "$T" ]; then emit "$f" "$sz"; continue; fi`);
		lines.push(`if tojpg "$f" "$sz" ${width}; then :; else emit "$f" "$sz"; fi`);
	}
	lines.push(`done`);
	lines.push(`:`);
	return lines.join('\n');
}

function parseImageBatchOutput(buffer: Buffer): ITurboFileImageBatchEntry[] {
	const entries: ITurboFileImageBatchEntry[] = [];
	let position = 0;
	while (position < buffer.length) {
		const pathEnd = buffer.indexOf(0x0a, position);
		if (pathEnd < 0) {
			break;
		}
		const path = buffer.toString('utf8', position, pathEnd);
		position = pathEnd + 1;
		const sizeEnd = buffer.indexOf(0x0a, position);
		if (sizeEnd < 0) {
			break;
		}
		const size = parseInt(buffer.toString('utf8', position, sizeEnd), 10);
		position = sizeEnd + 1;
		if (!path) {
			break;
		}
		if (!Number.isFinite(size) || size < 0) {
			entries.push({ path, ok: false, oversized: true });
			continue;
		}
		if (position + size > buffer.length) {
			entries.push({ path, ok: false, message: 'Truncated image batch stream.', transient: true });
			break;
		}
		const bytes = buffer.subarray(position, position + size);
		position += size;
		// TIFF is always returned transcoded to JPEG (browsers can't decode TIFF), so tag the bytes as
		// JPEG rather than by the source extension.
		const lowerPath = path.toLowerCase();
		const mime = lowerPath.endsWith('.tif') || lowerPath.endsWith('.tiff') ? 'image/jpeg' : getMimeType(path);
		entries.push({ path, ok: true, content: bytes.toString('base64'), mime });
	}
	return entries;
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
	if (lower.endsWith('.tif') || lower.endsWith('.tiff')) {
		return 'image/tiff';
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
		height: outputSize.height,
		originalWidth: decoded.width,
		originalHeight: decoded.height
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
	for (const extension of ['.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.tar.zst', '.tzst', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']) {
		if (lower.endsWith(extension)) {
			return path.substring(0, path.length - extension.length);
		}
	}
	return path;
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

async function getLocalPathSizeByCommand(path: string): Promise<number> {
	const stat = await fsp.stat(path);
	if (!stat.isDirectory()) {
		return stat.size;
	}

	if (platform() !== 'win32') {
		return getLocalPathSize(path);
	}

	try {
		const output = await runLocalRobocopyCommandBuffer(buildWindowsDirectorySizeRobocopyArgs(path, join(tmpdir(), 'turbofile-size-probe')));
		return parseWindowsRobocopySizeOutput(output);
	} catch {
		return getLocalPathSize(path);
	}
}

async function getLocalBatchTargetSize(targetDirectory: string, targetNames: readonly string[]): Promise<number> {
	let total = 0;
	for (const targetName of targetNames) {
		total += await getLocalPathSize(join(targetDirectory, targetName)).catch(() => 0);
	}
	return total;
}

async function getLocalPathTransferSize(path: string, expectedBytes?: number): Promise<number> {
	if (expectedBytes && expectedBytes > 0) {
		return expectedBytes;
	}
	return getLocalPathSize(path);
}

function buildWindowsDirectorySizeRobocopyArgs(sourcePath: string, destinationPath: string): string[] {
	return [
		sourcePath,
		destinationPath,
		'/L',
		'/E',
		'/BYTES',
		'/R:0',
		'/W:0',
		'/NFL',
		'/NDL',
		'/NJH',
		'/NP',
		'/NC',
		'/NS',
		'/XJ'
	];
}

function parseWindowsRobocopySizeOutput(output: string): number {
	const line = output.split(/\r?\n/).find(candidate => /^\s*Bytes\s*:/i.test(candidate));
	if (!line) {
		throw new Error(`Unable to parse robocopy size output: ${output.trim() || 'empty output'}`);
	}

	const firstToken = line.slice(line.indexOf(':') + 1).trim().split(/\s+/)[0] ?? '';
	const digits = firstToken.replace(/[^\d]/g, '');
	if (!digits) {
		throw new Error(`Invalid robocopy size output: ${line.trim()}`);
	}

	const size = Number(digits);
	if (!Number.isFinite(size)) {
		throw new Error(`Invalid robocopy size: ${digits}`);
	}

	return size;
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
