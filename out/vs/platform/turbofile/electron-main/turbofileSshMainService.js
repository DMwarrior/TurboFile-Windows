/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createReadStream, createWriteStream, existsSync, promises as fsp } from 'fs';
import { basename, dirname, join } from 'node:path';
import { networkInterfaces, platform, tmpdir, userInfo } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { connect as connectTcp } from 'node:net';
import { deflateSync } from 'node:zlib';
import { app, BrowserWindow, clipboard, nativeImage, protocol } from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { resolveTerminalEncoding } from '../../../base/node/terminalEncoding.js';
import { buildTurboFileRemoteExtractCommand, isTurboFileTarFamilyArchivePath } from '../common/turbofileArchiveExtract.js';
import { runTurboFileBatchTransferFlow, runTurboFileConcurrentBatchAttempt } from '../common/turbofileBatchTransferFlow.js';
import { createLocalBatchTarPlans, createRemoteBatchTarSourcePlan, createTarNullListBuffer, isTurboFileBatchCommandSafe, requiresLocalTarSafeRootAlias } from '../common/turbofileBatchTarPlan.js';
import { TurboFileKeyedGeneration } from '../common/turbofileKeyedGeneration.js';
import { readTurboFileImageDimensions } from '../common/turbofileImageMetadata.js';
import { parseTurboFileImageMetadataFrames } from '../common/turbofileImageMetadataBatch.js';
import { TurboFileOperationCanceledError, TurboFileOperationQueue } from '../common/turbofileOperationQueue.js';
import { classifyTurboFileDirectSshVerification, orderTurboFileDirectSshRoutes, runTurboFileDirectRouteFlow, TurboFileDirectDataError, TurboFileDirectUnavailableError } from '../common/turbofileDirectRoute.js';
import { createTurboFileRsyncMappedGroups, createTurboFileRsyncSourceGroups } from '../common/turbofileRsyncBatchPlan.js';
import { getRemoteDirectoryReadRetryDelay, REMOTE_DIRECTORY_READ_MAX_ATTEMPTS, shouldRetryRemoteDirectoryRead } from '../common/turbofileRemoteDirectoryRetry.js';
import { createPosixNativeBatchTransferPlan } from '../common/turbofileRemoteNativeBatchPlan.js';
import { buildPosixHeartbeatFunction } from '../common/turbofilePosixHeartbeat.js';
import { buildPosixStatEntriesCommand as buildRemotePosixStatEntriesCommand } from '../common/turbofileRemoteStat.js';
import { withTurboFileTimeout } from '../common/turbofileTimeout.js';
import { parseDirectTarProgressBytes } from '../common/turbofileTarProgress.js';
import { resolveTransferPlan } from '../common/turbofileTransferPlan.js';
import { createTurboFileKeepBothName, createTurboFileTrashItemId, getTurboFileTrashDeviceIdentity, isTurboFileProtectedTrashSource, isTurboFileTrashMetadata, sortTurboFileTrashItems } from '../common/turbofileTrash.js';
import { createWindowsDragFakeDirectoryName, createWindowsShellAssociationChangedScript, isValidWindowsDragToken, normalizeWindowsCopyHookDestination, TURBOFILE_WINDOWS_DRAG_ACTIVE_DIR, TURBOFILE_WINDOWS_DRAG_APP_DIR, TURBOFILE_WINDOWS_DRAG_ROOT_DIR, TURBOFILE_WINDOWS_DRAG_TARGETS_DIR } from '../common/turbofileWindowsDrag.js';
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
const IMAGE_METADATA_HEADER_BYTES = 64 * 1024;
const IMAGE_METADATA_LOCAL_CONCURRENCY = 16;
const IMAGE_METADATA_REMOTE_CONCURRENCY = 3;
const IMAGE_METADATA_PATHS_PER_CHUNK = 96;
const IMAGE_METADATA_COMMAND_MAX_CHARS = 7000;
const SMALL_IMAGE_DIM_LIMIT = 100;
const WINDOWS_DRAG_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const RAW_BMP_FAST_PATH_BYTES = 2 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_VERSION = 1;
const IMAGE_THUMBNAIL_CACHE_MAX_BYTES = 512 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const TURBOFILE_IMAGE_RESOURCE_SCHEME = 'turbofile-image';
const IMAGE_RESOURCE_TTL_MS = 10 * 60 * 1000;
const IMAGE_RESOURCE_CLEANUP_INTERVAL_MS = 60 * 1000;
const WINDOWS_DRAG_TARGET_SETTLE_MS = 2000;
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
const DIRECT_SSH_READY_MARKER = '__TURBOFILE_DIRECT_READY__';
const DIRECT_TRANSFER_STALL_TIMEOUT_MS = 10 * 1000;
const DIRECT_TAR_STALL_TIMEOUT_MS = 30 * 60 * 1000;
const DIRECT_RSYNC_STALL_TIMEOUT_MS = 10 * 60 * 1000;
const DIRECT_TRANSFER_STALL_CHECK_INTERVAL_MS = 1000;
const REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS = 30 * 1000;
const LOCAL_RSYNC_STALL_TIMEOUT_MS = 10 * 60 * 1000;
const TRANSFER_PROGRESS_EVENT_INTERVAL_MS = 500;
const LOCAL_WINDOWS_REVERSE_RSYNC_MIN_SPLIT_ENTRIES = 6;
const TURBOFILE_REVERSE_RSYNC_WORKERS = 4;
// Keep the established high-throughput ceiling. Stability is enforced by the device scheduler,
// bounded manifests, channel timeouts, and per-chunk retries rather than throttling the data path.
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
class TurboFileRemoteCommandExitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TurboFileRemoteCommandExitError';
    }
}
function getFileOperationDeviceKey(device) {
    if (device.kind === 'local') {
        return 'local';
    }
    const connection = device.connection;
    if (connection) {
        return `ssh:${connection.username.trim()}@${connection.host.trim().toLowerCase()}:${connection.port || 22}`;
    }
    return `ssh:${device.label?.trim().toLowerCase() || 'unknown'}`;
}
function getFileOperationDeviceKeys(...devices) {
    return [...new Set(devices.map(getFileOperationDeviceKey))];
}
function getTransferOperationAccess(source, target, operation) {
    const sourceKey = getFileOperationDeviceKey(source);
    const targetKey = getFileOperationDeviceKey(target);
    return operation === 'move'
        ? { read: [], write: [sourceKey, targetKey] }
        : { read: [sourceKey], write: [targetKey] };
}
export class TurboFileSshMainService {
    static { this.imageProtocolRegistered = false; }
    constructor() {
        this.terminalSessionSequence = 1;
        this.terminalSessions = new Map();
        this.transferProgressEmitters = new Map();
        this.transferProgressSnapshots = new Map();
        this.transferDataStartTimes = new Map();
        this.transferFirstPositiveProgressTimes = new Map();
        this.transferGrowthMonitoredProgressIds = new Set();
        this.rsyncTimingStates = new Map();
        this.transferCancellationRequests = new Set();
        this.transferCancelHandlers = new Map();
        this.fileOperationQueue = new TurboFileOperationQueue();
        this.directorySftpSessions = new Map();
        this.directorySftpSessionGenerations = new TurboFileKeyedGeneration();
        this.directorySftpIdleTimers = new Map();
        this.remoteDirectoryListingCache = new Map();
        this.remoteDirectoryListingGenerations = new TurboFileKeyedGeneration();
        this.remoteImageToolCache = new Map();
        this.remoteImageToolPending = new Map();
        this.directSshRouteCache = new Map();
        this.remoteRsyncSshBinaryCache = new Map();
        this.trashRootsByDeviceIdentity = new Map();
        this.imageResourceDescriptors = new Map();
        this.activeWindowsDragSessions = new Set();
        this.completedInternalWindowsDrags = new Set();
        // Caps concurrent SSH image reads. The image grid renders cards as <img src="turbofile-image://">,
        // and Chromium fetches every visible card at once — dozens of simultaneous `client.exec` calls on
        // one SSH connection blow past the server's MaxSessions limit and every command fails with
        // "Unable to exec". A small global limit keeps thumbnail generation under that ceiling (leaving
        // channels free for directory/SFTP work) while still loading several images in parallel.
        this.imageReadActiveCount = 0;
        this.imageReadWaiters = [];
        this.ensureTurboFileImageProtocolRegistered();
        // A freshly-registered CopyHook handler is not picked up by the already-running Explorer
        // until Explorer reloads (WinSCP documents the same: its dragext needs a logoff/restart to
        // load). Prepare the handler eagerly at startup so the very first drag-to-Windows works,
        // instead of failing once and only working after a manual retry.
        if (platform() === 'win32') {
            void this.ensureWindowsDragCopyHookRegistered().catch(() => undefined);
        }
    }
    onDynamicSshTerminalData(sessionId) {
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
    onDynamicSshTerminalExit(sessionId) {
        return this.terminalSessions.get(sessionId)?.exitEmitter.event ?? Event.None;
    }
    onDynamicTransferProgress(progressId) {
        if (!progressId) {
            return Event.None;
        }
        return this.getTransferProgressEmitter(progressId).event;
    }
    async cancelTransfer(progressId) {
        if (!progressId) {
            return { ok: false, message: 'Transfer progress id is required.' };
        }
        this.transferCancellationRequests.add(progressId);
        this.fileOperationQueue.cancel(progressId);
        const handlers = this.transferCancelHandlers.get(progressId);
        if (handlers) {
            for (const handler of [...handlers]) {
                try {
                    handler();
                }
                catch {
                    // Cancellation is best-effort across local streams and SSH/SFTP channels.
                }
            }
        }
        return { ok: true, message: 'Transfer cancellation requested.' };
    }
    async testConnection(options) {
        const configResult = await this.createConnectConfig(options);
        if (!configResult.ok) {
            return configResult;
        }
        return this.doTestConnection(configResult.config);
    }
    async detectCapabilities(options) {
        const configResult = await this.createConnectConfig(options);
        if (!configResult.ok) {
            return { ok: false, message: configResult.message };
        }
        let client;
        try {
            client = await this.connect(configResult.config);
            const hasCommand = async (command) => {
                try {
                    await this.execRemote(client, `command -v ${command} >/dev/null 2>&1`);
                    return true;
                }
                catch {
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
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error)
            };
        }
        finally {
            client?.end();
        }
    }
    async installTransferDependencies(options, packages) {
        const requestedPackages = normalizeTransferDependencies(packages);
        if (!requestedPackages.length) {
            return { ok: true, message: 'No dependencies requested.', installedPackages: [], missingPackages: [] };
        }
        const configResult = await this.createConnectConfig(options);
        if (!configResult.ok) {
            return { ok: false, message: configResult.message, installedPackages: [], missingPackages: requestedPackages };
        }
        let installError;
        let client;
        try {
            client = await this.connect(configResult.config);
            await this.execRemote(client, buildTransferDependencyInstallCommand(requestedPackages, options));
        }
        catch (error) {
            installError = error instanceof Error ? error : new Error(String(error));
        }
        finally {
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
    async listRemoteDirectory(options, path, refresh = false) {
        return this.listRemoteDirectoryCore(options, path, refresh, false);
    }
    async listRemoteDirectoryNames(options, path, refresh = false) {
        return this.listRemoteDirectoryCore(options, path, refresh, true);
    }
    async listRemoteDirectoryCore(options, path, refresh, namesOnly) {
        const cacheKey = this.getRemoteDirectoryListingCacheKey(options, path);
        if (!refresh) {
            // A full (size+date) cached listing satisfies a names-only request too, but not vice versa:
            // only reuse a cached entry that has real attributes when the caller asked names-only.
            const cached = this.getRemoteDirectoryListingCache(cacheKey);
            if (cached && (namesOnly || this.remoteListingHasAttributes(cached))) {
                return cached;
            }
        }
        const listingGeneration = this.remoteDirectoryListingGenerations.next(cacheKey);
        const configResult = await this.createConnectConfig(options);
        if (!configResult.ok) {
            throw new Error(configResult.message);
        }
        let lastError;
        for (let attempt = 0; attempt < REMOTE_DIRECTORY_READ_MAX_ATTEMPTS; attempt++) {
            let session;
            try {
                session = await this.getDirectorySftpSession(options, configResult.config);
                const listing = await this.readRemoteDirectoryWithFallback(session.sftp, session.client, options, path, namesOnly);
                this.touchDirectorySftpSession(session.key, session.generation);
                return this.createRemoteDirectoryListingResult(cacheKey, listingGeneration, namesOnly, listing);
            }
            catch (error) {
                lastError = error;
                if (this.remoteDirectoryListingGenerations.isCurrent(cacheKey, listingGeneration)) {
                    this.remoteDirectoryListingCache.delete(cacheKey);
                }
                if (session) {
                    this.disposeDirectorySftpSession(session.key, session.generation);
                }
                const retryDelayMs = getRemoteDirectoryReadRetryDelay(attempt);
                if (!shouldRetryRemoteDirectoryRead(error) || retryDelayMs === undefined) {
                    throw error;
                }
                await delay(retryDelayMs);
            }
        }
        throw lastError;
    }
    createRemoteDirectoryListingResult(requestedCacheKey, listingGeneration, namesOnly, listing) {
        const result = {
            path: listing.path,
            entries: listing.entries
                .filter(entry => entry.filename !== '.' && entry.filename !== '..')
                .map(entry => this.toRemoteEntry(listing.path, entry))
                .sort(compareFileEntries)
        };
        // Only cache full listings: a names-only listing has zeroed size/date and must not shadow a
        // later full listing (it is cheap to recompute and gets enriched lazily on the client side).
        if (!namesOnly && this.remoteDirectoryListingGenerations.isCurrent(requestedCacheKey, listingGeneration)) {
            this.setRemoteDirectoryListingCache(requestedCacheKey, result);
        }
        return result;
    }
    remoteListingHasAttributes(listing) {
        // A names-only listing zeroes every size and modified time; a real listing almost always has at
        // least one non-zero. Treat an all-zero listing as attribute-less so a names-only result that
        // somehow reached the cache never satisfies a request that needs sizes.
        return listing.entries.some(entry => entry.size > 0 || entry.modified > 0);
    }
    async statRemoteEntries(options, directoryPath, names) {
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
            this.touchDirectorySftpSession(session.key, session.generation);
            const stats = parseRemoteStatEntries(output.toString('utf8'));
            return stats.length ? stats : await this.statRemoteEntriesWithSftpFallback(session.sftp, directoryPath, uniqueNames);
        }
        catch {
            return this.statRemoteEntriesWithSftpFallback(session.sftp, directoryPath, uniqueNames);
        }
    }
    async statRemoteEntriesWithSftpFallback(sftp, directoryPath, names) {
        const stats = await mapLimit(names, SFTP_DIRECTORY_ENTRY_CONCURRENCY, async (name) => {
            try {
                const stat = await this.remoteStat(sftp, joinRemotePath(directoryPath, name));
                return {
                    name,
                    size: stat.size,
                    modified: stat.mtime * 1000
                };
            }
            catch {
                return undefined;
            }
        });
        return stats.filter((stat) => !!stat);
    }
    async listLocalDirectory(path, _refresh = false) {
        const dirents = await fsp.readdir(path, { withFileTypes: true });
        const visibleNames = await getWindowsExplorerVisibleLocalNames(path);
        const entries = (await mapLimit(dirents.filter(dirent => !visibleNames || visibleNames.has(dirent.name)), LOCAL_DIRECTORY_STAT_CONCURRENCY, async (dirent) => {
            try {
                const fullPath = join(path, dirent.name);
                const stat = await fsp.lstat(fullPath);
                const type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symlink' : 'unknown';
                return {
                    name: dirent.name,
                    path: fullPath,
                    type,
                    size: stat.size,
                    modified: stat.mtimeMs
                };
            }
            catch {
                return undefined;
            }
        })).filter((entry) => !!entry);
        return {
            path,
            entries: entries.sort(compareFileEntries)
        };
    }
    async listLocalDirectoryNames(path, _refresh = false) {
        const dirents = await fsp.readdir(path, { withFileTypes: true });
        const visibleNames = await getWindowsExplorerVisibleLocalNames(path);
        const entries = dirents
            .filter(dirent => !visibleNames || visibleNames.has(dirent.name))
            .map(dirent => {
            const type = dirent.isDirectory() ? 'directory' : dirent.isFile() ? 'file' : dirent.isSymbolicLink() ? 'symlink' : 'unknown';
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
    async statLocalEntries(directoryPath, names) {
        const uniqueNames = Array.from(new Set(names.filter(name => !!name)));
        const stats = await mapLimit(uniqueNames, LOCAL_DIRECTORY_STAT_CONCURRENCY, async (name) => {
            try {
                const stat = await fsp.lstat(join(directoryPath, name));
                return {
                    name,
                    size: stat.size,
                    modified: stat.mtimeMs
                };
            }
            catch {
                return undefined;
            }
        });
        return stats.filter((stat) => !!stat);
    }
    async normalizeLocalWindowsPaths(paths) {
        return normalizeWindowsTransferPaths(paths, resolveLocalWindowsRealPath);
    }
    async transferFile(request) {
        const strategy = getTransferStrategy(request.source, request.target);
        const queuedAt = Date.now();
        if (request.progressId) {
            this.transferCancellationRequests.delete(request.progressId);
        }
        try {
            return await this.fileOperationQueue.runWithAccess(getTransferOperationAccess(request.source, request.target, 'copy'), () => this.transferFileCore(request), {
                id: request.progressId,
                onQueued: () => this.fireTransferProgress(request, 0, Math.max(0, request.expectedBytes ?? 0), 'prepare', 'Waiting for device operation queue.', true, {
                    currentName: getTransferName(request.source.path)
                })
            });
        }
        catch (error) {
            const canceled = error instanceof TurboFileOperationCanceledError || this.isTransferCanceled(request.progressId);
            if (request.progressId) {
                this.transferCancellationRequests.delete(request.progressId);
                this.transferCancelHandlers.delete(request.progressId);
            }
            this.scheduleTransferProgressCleanup(request.progressId);
            return {
                ok: false,
                strategy,
                bytes: 0,
                message: canceled ? TRANSFER_CANCELED_MESSAGE : error instanceof Error ? error.message : String(error),
                canceled,
                durationMs: Date.now() - queuedAt
            };
        }
    }
    async transferFileCore(request, preserveDirectErrors = false) {
        const strategy = getTransferStrategy(request.source, request.target);
        const startedAt = Date.now();
        try {
            this.throwIfTransferCanceled(request.progressId);
            if (request.source.kind === 'local' && request.target.kind === 'local') {
                const expectedBytes = Math.max(0, request.expectedBytes ?? 0);
                this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing local copy.', true);
                const needsSourceStat = !request.sourceType || (request.sourceType === 'file' && expectedBytes <= 0);
                const sourceStat = needsSourceStat ? await fsp.stat(request.source.path) : undefined;
                const sourceType = request.sourceType ?? (sourceStat?.isDirectory() ? 'directory' : 'file');
                const totalBytes = sourceType === 'directory' ? 0 : Math.max(expectedBytes, sourceStat?.size ?? 0);
                this.fireTransferProgress(request, 0, totalBytes, 'transfer', 'Copying locally.', true);
                let transferredBytes = 0;
                const onDelta = (delta) => {
                    this.throwIfTransferCanceled(request.progressId);
                    transferredBytes += delta;
                    const progressBytes = totalBytes > 0 ? Math.min(transferredBytes, totalBytes) : transferredBytes;
                    this.fireTransferProgress(request, progressBytes, totalBytes, 'transfer', 'Copying locally.');
                };
                await this.copyLocalPath(request.source.path, request.target.path, onDelta, request.progressId);
                this.throwIfTransferCanceled(request.progressId);
                const bytes = Math.max(totalBytes, transferredBytes);
                this.fireTransferProgress(request, bytes, totalBytes, 'complete', 'Local copy completed.', true);
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
                    }
                    if (request.target.preferredProtocol !== 'sftp') {
                        const commandOrder = getDirectoryLocalCommandTransferProtocolOrder(request.target.preferredProtocol);
                        const commandResult = await this.tryLocalToSshCommandTransfer(request, bytes, startedAt, commandOrder, false);
                        if (commandResult?.ok) {
                            this.clearRemoteDirectoryListingCache(request.target);
                            return commandResult;
                        }
                    }
                }
                else {
                    const commandResult = await this.tryLocalToSshCommandTransfer(request, bytes, startedAt);
                    if (commandResult?.ok) {
                        this.clearRemoteDirectoryListingCache(request.target);
                        return commandResult;
                    }
                }
                this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing SFTP upload.', true, { strategy: 'sftp-upload' });
                let transferredBytes = 0;
                const onDelta = (delta) => {
                    this.throwIfTransferCanceled(request.progressId);
                    transferredBytes += delta;
                    this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Uploading over SFTP.', false, { strategy: 'sftp-upload' });
                };
                const onTotal = (totalBytes) => {
                    bytes = Math.max(bytes, totalBytes);
                    this.fireTransferProgress(request, Math.min(transferredBytes, bytes), bytes, 'transfer', 'Uploading over SFTP.', true, { strategy: 'sftp-upload' });
                };
                if (stat.isDirectory()) {
                    this.fireTransferProgress(request, 0, bytes, 'transfer', 'Scanning and uploading directory over SFTP.', true, { strategy: 'sftp-upload' });
                    await this.uploadDirectoryConcurrent(request.target, request.source.path, request.target.path, onTotal, onDelta, request.progressId);
                }
                else {
                    await this.withSftp(request.target, async (sftp) => {
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
                const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown');
                bytes = sourceType === 'directory'
                    ? Math.max(0, request.expectedBytes ?? 0)
                    : Math.max(0, request.expectedBytes ?? 0);
                if (sourceType === 'directory') {
                    if (shouldPreferTarForMultiItemTransfer(request.source.preferredProtocol)) {
                        const tarResult = await this.trySshToLocalTarTransfer(request, bytes, startedAt);
                        if (tarResult?.ok) {
                            return tarResult;
                        }
                    }
                    if (request.source.preferredProtocol !== 'sftp') {
                        const commandOrder = getDirectoryLocalCommandTransferProtocolOrder(request.source.preferredProtocol);
                        const commandResult = await this.trySshToLocalCommandTransfer(request, bytes, startedAt, commandOrder);
                        if (commandResult?.ok) {
                            return commandResult;
                        }
                    }
                }
                else {
                    if (bytes <= 0) {
                        bytes = await this.withSftp(request.source, async (sftp) => (await this.remoteStat(sftp, request.source.path)).size, request.progressId).catch(() => bytes);
                    }
                    const commandResult = await this.trySshToLocalCommandTransfer(request, bytes, startedAt);
                    if (commandResult?.ok) {
                        return commandResult;
                    }
                }
                let transferredBytes = 0;
                const onDelta = (delta) => {
                    this.throwIfTransferCanceled(request.progressId);
                    transferredBytes += delta;
                    this.fireTransferProgress(request, transferredBytes, bytes, 'transfer', 'Downloading over SFTP.', false, { strategy: 'sftp-download' });
                };
                const onTotal = (totalBytes) => {
                    bytes = Math.max(bytes, totalBytes);
                    this.fireTransferProgress(request, Math.min(transferredBytes, bytes), bytes, 'transfer', 'Downloading over SFTP.', true, { strategy: 'sftp-download' });
                };
                if (sourceType === 'directory') {
                    this.fireTransferProgress(request, 0, bytes, 'transfer', 'Scanning and downloading directory over SFTP.', true, { strategy: 'sftp-download' });
                    await this.downloadDirectoryConcurrent(request.source, request.source.path, request.target.path, onTotal, onDelta, request.progressId);
                }
                else {
                    await this.withSftp(request.source, async (sftp) => {
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
                return await this.transferBetweenSshDevices(request, startedAt, preserveDirectErrors);
            }
            throw new Error('Unsupported transfer endpoint combination.');
        }
        catch (error) {
            if (preserveDirectErrors && (error instanceof TurboFileDirectUnavailableError || error instanceof TurboFileDirectDataError)) {
                throw error;
            }
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
        }
        finally {
            if (request.progressId) {
                this.transferCancellationRequests.delete(request.progressId);
                this.transferCancelHandlers.delete(request.progressId);
            }
            this.scheduleTransferProgressCleanup(request.progressId);
        }
    }
    async transferBetweenSshDevices(request, startedAt, preserveDirectErrors = false) {
        if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh') {
            throw new Error('SSH-to-SSH transfer requires SSH endpoints.');
        }
        const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown');
        const effectiveRequest = { ...request, sourceType };
        const plan = resolveTransferPlan({
            source: effectiveRequest.source,
            target: effectiveRequest.target,
            sourceType,
            itemCount: 1,
            strategyHint: effectiveRequest.strategyHint
        });
        const failedStrategy = transferAttemptToStrategy(plan.attempts[0]);
        const failures = [];
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
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                if (preserveDirectErrors && attempt.route === 'direct' && (error instanceof TurboFileDirectUnavailableError || error instanceof TurboFileDirectDataError)) {
                    throw error;
                }
                const nextAttempt = plan.attempts[index + 1];
                const directFallback = attempt.route === 'direct' && nextAttempt?.route === 'relay' ? getDirectFallbackProgress(error) : undefined;
                const failure = `${attempt.protocol} ${attempt.route}: ${formatTransferError(error)}`;
                failures.push(failure);
                if (nextAttempt) {
                    this.fireTransferProgress(request, 0, 0, nextAttempt.route === 'relay' ? 'relay-upload' : 'transfer', directFallback ? directFallback.detail : `${failure}; falling back to ${nextAttempt.protocol} ${nextAttempt.route}.`, true, {
                        strategy: transferAttemptToStrategy(nextAttempt),
                        route: nextAttempt.route === 'relay' ? 'relay' : undefined,
                        ...(directFallback ? { directFallbackReason: directFallback.directFallbackReason } : {})
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
    async trySshToSshTransferAttempt(attempt, request, startedAt) {
        if (attempt.route === 'direct') {
            return this.trySshToSshDirectTransfer(attempt.protocol, request, startedAt);
        }
        if (attempt.route === 'relay') {
            return this.trySshToSshRelayTransfer(attempt.protocol, request, startedAt);
        }
        return undefined;
    }
    async trySshToSshDirectTransfer(protocol, request, startedAt) {
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
    async trySshToSshRelayTransfer(protocol, request, startedAt) {
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
    async tryLocalToSshReverseParallelRsyncUpload(request, bytes, startedAt) {
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
                const handleProgressOutput = (chunk) => {
                    progress.handleOutput(chunk);
                    lastActivityAt = progress.getActivityTime() ?? lastActivityAt;
                };
                const sshBinary = await this.resolveRemoteRsyncSshBinary(client, request.target.connection);
                const sshTransport = buildOptimizedRsyncSshCommand(sourceConnection.port || 22, !!sourceConnection.password, sshBinary);
                const command = buildLocalWindowsReverseParallelRsyncCommand(sourceConnection, sshTransport);
                const input = buildLocalWindowsReverseParallelRsyncInput(items, [remoteTargetDirectory]);
                this.throwIfTransferCanceled(request.progressId);
                await this.execRemote(client, command, {
                    input,
                    onStdout: handleProgressOutput,
                    onStderr: handleProgressOutput,
                    inactivityTimeoutMs: DIRECT_RSYNC_STALL_TIMEOUT_MS,
                    inactivityMessage: `Parallel rsync target pull produced no transfer progress for ${DIRECT_RSYNC_STALL_TIMEOUT_MS} ms.`,
                    getActivityTime: () => progress.getActivityTime() ?? lastActivityAt,
                    progressId: request.progressId
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
            }
            finally {
                unregisterCancel();
                client.end();
            }
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            return undefined;
        }
    }
    async createLocalWindowsReverseRsyncItems(localDirectory, remoteTargetDirectory) {
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
    async readLocalRsyncSplitEntries(localDirectory) {
        const entries = await fsp.readdir(localDirectory, { withFileTypes: true });
        if (entries.some(entry => !entry.isDirectory() && !entry.isFile() && !entry.isSymbolicLink())) {
            // Keep special/unknown entries on the unsplit rsync path. A split manifest must never
            // silently omit an entry that rsync itself could have preserved.
            return [];
        }
        return entries
            .map(entry => ({ name: entry.name, directory: entry.isDirectory() }))
            .sort((a, b) => FILE_ENTRY_NAME_COLLATOR.compare(a.name, b.name));
    }
    async tryLocalToSshReverseParallelRsyncBatchUpload(request, batchItems, operation, bytes, startedAt) {
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
            const cleanupTargets = new Set();
            const rsyncItems = [];
            const itemTypes = await mapLimit(batchItems, LOCAL_DIRECTORY_STAT_CONCURRENCY, async (item) => {
                if (item.sourceType === 'file' || item.sourceType === 'directory') {
                    return item.sourceType;
                }
                const stat = await fsp.stat(item.sourcePath).catch(() => undefined);
                return stat?.isDirectory() ? 'directory' : stat?.isFile() ? 'file' : undefined;
            });
            if (itemTypes.some(type => !type)) {
                return undefined;
            }
            let hasDirectory = false;
            for (const [index, item] of batchItems.entries()) {
                const sourceType = itemTypes[index];
                const targetPath = joinRemotePath(remoteTargetDirectory, item.targetName);
                cleanupTargets.add(targetPath);
                if (sourceType === 'directory') {
                    hasDirectory = true;
                    const splitItems = await this.createLocalWindowsReverseRsyncItems(item.sourcePath, targetPath);
                    if (splitItems.length) {
                        rsyncItems.push(...splitItems);
                    }
                    else {
                        rsyncItems.push({
                            name: item.displayName ?? item.targetName,
                            directory: true,
                            sourcePath: trimTrailingRemoteSlash(toRsyncLocalPath(item.sourcePath)),
                            targetPath
                        });
                    }
                }
                else if (sourceType === 'file') {
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
                const handleProgressOutput = (chunk) => {
                    progress.handleOutput(chunk);
                    lastActivityAt = progress.getActivityTime() ?? lastActivityAt;
                };
                const sshBinary = await this.resolveRemoteRsyncSshBinary(client, request.targetDirectory.connection);
                const sshTransport = buildOptimizedRsyncSshCommand(sourceConnection.port || 22, !!sourceConnection.password, sshBinary);
                const command = buildLocalWindowsReverseParallelRsyncCommand(sourceConnection, sshTransport);
                const input = buildLocalWindowsReverseParallelRsyncInput(rsyncItems, [...cleanupTargets]);
                this.throwIfTransferCanceled(request.progressId);
                await this.execRemote(client, command, {
                    input,
                    onStdout: handleProgressOutput,
                    onStderr: handleProgressOutput,
                    inactivityTimeoutMs: DIRECT_RSYNC_STALL_TIMEOUT_MS,
                    inactivityMessage: `Parallel rsync target pull produced no transfer progress for ${DIRECT_RSYNC_STALL_TIMEOUT_MS} ms.`,
                    getActivityTime: () => progress.getActivityTime() ?? lastActivityAt,
                    progressId: request.progressId
                });
                this.throwIfTransferCanceled(request.progressId);
                const cleanupFailures = operation === 'move' ? await this.deleteBatchSources(request.source, batchItems, request.progressId) : [];
                const resultBytes = progress.getLastBytes() || bytes;
                this.fireTransferProgress(request, resultBytes, 0, 'complete', 'Parallel rsync target pull completed.', true, {
                    strategy: 'rsync-direct-parallel',
                    route: 'target-pull',
                    completedItems: batchItems.length,
                    totalItems: batchItems.length
                });
                this.clearRemoteDirectoryListingCache(request.targetDirectory);
                return this.createBatchTransferResult(cleanupFailures.length === 0, 'rsync-direct-parallel', resultBytes, cleanupFailures.length ? `Parallel rsync completed, but source cleanup failed for ${cleanupFailures.length} item(s).` : 'Parallel rsync completed.', batchItems.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
            }
            finally {
                unregisterCancel();
                client.end();
            }
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            return undefined;
        }
    }
    async resolveLocalWindowsRsyncSourceConnection() {
        this.localWindowsRsyncSourceConnectionPromise ??= this.doResolveLocalWindowsRsyncSourceConnection();
        return this.localWindowsRsyncSourceConnectionPromise;
    }
    async doResolveLocalWindowsRsyncSourceConnection() {
        const localAddresses = getLocalIpv4Addresses();
        if (!localAddresses.size) {
            return undefined;
        }
        for (const configPath of getLocalWindowsRsyncConfigPaths()) {
            try {
                const raw = JSON.parse(await fsp.readFile(configPath, 'utf8'));
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
            }
            catch {
                // Optional compatibility config; absence simply means this fast route is unavailable.
            }
        }
        return undefined;
    }
    async tryLocalToSshCommandTransfer(request, bytes, startedAt, protocolOrder, verifyUploadSize = true) {
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
            }
            catch (error) {
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
    async trySshToLocalCommandTransfer(request, bytes, startedAt, protocolOrder) {
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
            }
            catch (error) {
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
    async verifySshUploadSize(target, expectedBytes, label) {
        if (target.kind !== 'ssh' || expectedBytes <= 0) {
            return;
        }
        const actualBytes = await this.getRemotePathContentSizeByCommand(target);
        if (actualBytes === expectedBytes) {
            return;
        }
        await this.deletePathCore(target, true).catch(() => undefined);
        throw new Error(`${label} size mismatch: expected ${expectedBytes}, got ${actualBytes}.`);
    }
    async tryLocalToSshTarTransfer(request, expectedBytes, startedAt) {
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
            const bytes = Math.max(0, expectedBytes);
            this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing tar upload.', true, { strategy: 'tar-upload' });
            let archiveBytes = 0;
            const onArchiveDelta = (delta) => {
                this.throwIfTransferCanceled(request.progressId);
                archiveBytes += Math.max(0, delta);
                this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, 'transfer', 'Tar upload in progress.', false, { strategy: 'tar-upload' });
            };
            this.markTransferDataStarted(request.progressId);
            await this.runLocalDirectoryTarUpload(request.source.path, request.target, request.progressId, onArchiveDelta);
            this.throwIfTransferCanceled(request.progressId);
            const resultBytes = Math.max(bytes, archiveBytes);
            this.fireTransferProgress(request, resultBytes, bytes, 'complete', 'Tar upload completed.', true, { strategy: 'tar-upload' });
            return this.createTransferResult(true, 'tar-upload', resultBytes, 'Tar upload completed.', startedAt, request.progressId);
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            this.clearTransferDataTiming(request.progressId);
            return undefined;
        }
    }
    async trySshToLocalTarTransfer(request, expectedBytes, startedAt) {
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
            const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown');
            if (sourceType !== 'directory') {
                return undefined;
            }
            const bytes = Math.max(0, expectedBytes);
            this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing tar download.', true, { strategy: 'tar-download' });
            await fsp.rm(request.target.path, { recursive: true, force: true }).catch(() => undefined);
            await ensureLocalDirectory(request.target.path);
            let archiveBytes = 0;
            const onArchiveDelta = (delta) => {
                this.throwIfTransferCanceled(request.progressId);
                archiveBytes += Math.max(0, delta);
                this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, 'transfer', 'Tar download in progress.', false, { strategy: 'tar-download' });
            };
            this.markTransferDataStarted(request.progressId);
            await this.runRemoteDirectoryTarDownload(request.source, request.target.path, request.progressId, onArchiveDelta);
            this.throwIfTransferCanceled(request.progressId);
            const resultBytes = Math.max(bytes, archiveBytes);
            this.fireTransferProgress(request, resultBytes, bytes, 'complete', 'Tar download completed.', true, { strategy: 'tar-download' });
            return this.createTransferResult(true, 'tar-download', resultBytes, 'Tar download completed.', startedAt, request.progressId);
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            this.clearTransferDataTiming(request.progressId);
            return undefined;
        }
    }
    async runLocalDirectoryTarUpload(localDirectory, target, progressId, onArchiveDelta) {
        if (target.kind !== 'ssh' || !target.connection) {
            throw new Error('Missing SSH target.');
        }
        const localTarRoot = await this.createLocalTarRootAliasIfNeeded(localDirectory);
        try {
            try {
                await this.runParallelLocalDirectoryTarUpload(localTarRoot.path, target.connection, buildPrepareTarExtractToExactDirectoryCommand(target.path), buildTarExtractStreamToDirectoryCommand(target.path), progressId, onArchiveDelta);
                return;
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                // Parallel raw tar|ssh has no remote zstd dependency and is the stable default fast path.
            }
            try {
                await this.runParallelLocalDirectoryTarZstdUpload(localTarRoot.path, target.connection, buildPrepareTarZstdExtractToExactDirectoryCommand(target.path), buildTarZstdExtractToDirectoryCommand(target.path), progressId, onArchiveDelta);
                return;
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                // Parallel tar+zstd+ssh is the measured fast path. If unavailable, try single native tar|ssh.
            }
            try {
                await this.runNativeLocalTarUpload(['-cf', '-', '-C', localTarRoot.path, '.'], target.connection, buildTarExtractToExactDirectoryCommand(target.path), progressId, onArchiveDelta);
                return;
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                throw new Error(`Native tar upload failed: ${formatTransferError(error)}`);
            }
        }
        finally {
            await localTarRoot.dispose();
        }
    }
    async runRemoteDirectoryTarDownload(source, localDirectory, progressId, onArchiveDelta) {
        if (source.kind !== 'ssh' || !source.connection) {
            throw new Error('Missing SSH source.');
        }
        try {
            await this.runNativeLocalTarDownload(source.connection, buildTarCreateFromDirectoryCommand(source.path), ['-xf', '-', '-C', localDirectory], progressId, onArchiveDelta);
            return;
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            // Native ssh|tar is the fast path. If it is unavailable, fall back to the ssh2 stream path.
        }
        const configResult = await this.createConnectConfig(source.connection);
        if (!configResult.ok) {
            throw new Error(configResult.message);
        }
        let client;
        let tarProcess;
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
            await pipeline(sourceStream.stream, createProgressPassThrough(onArchiveDelta), tarProcess.stdin);
            await sourceStream.close;
            await tarClose;
        }
        finally {
            unregisterCancel();
            client?.end();
        }
    }
    async createLocalTarRootAliasIfNeeded(localRoot, force = false) {
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
        }
        catch (error) {
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
    async runNativeLocalTarUpload(tarArgs, connection, remoteCommand, progressId, onArchiveDelta) {
        const tool = await resolveLocalSshTool();
        await withNativeOpenSshArgs(connection, tool, remoteCommand, async (sshArgs, env) => {
            let tarProcess;
            let sshProcess;
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
            }
            finally {
                unregisterCancel();
            }
        });
    }
    async runNativeLocalTarDownload(connection, remoteCommand, tarArgs, progressId, onArchiveDelta, remoteInput) {
        const tool = await resolveLocalSshTool();
        await withNativeOpenSshArgs(connection, tool, remoteCommand, async (sshArgs, env) => {
            let sshProcess;
            let tarProcess;
            const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
                if (sshProcess) {
                    killLocalProcessTree(sshProcess);
                }
                if (tarProcess) {
                    killLocalProcessTree(tarProcess);
                }
            });
            try {
                sshProcess = spawn(tool.executable, sshArgs, { windowsHide: true, stdio: [remoteInput ? 'pipe' : 'ignore', 'pipe', 'pipe'], env });
                tarProcess = spawn('tar.exe', [...await this.getLocalTarCharsetArgs(), ...tarArgs], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
                tarProcess.stdout?.resume();
                if (!sshProcess.stdout || !tarProcess.stdin) {
                    throw new Error('Native tar download did not provide required pipes.');
                }
                const sshClose = waitForLocalProcessClose(sshProcess, 'native tar download create');
                const tarClose = waitForLocalProcessClose(tarProcess, 'native tar download extract');
                const archivePipeline = pipeline(sshProcess.stdout, createProgressPassThrough(onArchiveDelta), tarProcess.stdin);
                const inputWrite = remoteInput ? (() => {
                    if (!sshProcess.stdin) {
                        throw new Error('Native tar download did not provide stdin for the remote path list.');
                    }
                    return writeInputToWritableStream(sshProcess.stdin, remoteInput, 'native tar download path list');
                })() : Promise.resolve();
                await Promise.all([archivePipeline, inputWrite, sshClose, tarClose]);
            }
            finally {
                unregisterCancel();
            }
        });
    }
    async runParallelLocalDirectoryTarUpload(localDirectory, connection, prepareRemoteCommand, extractRemoteCommand, progressId, onArchiveDelta) {
        // Kick off the remote rm+mkdir over its own ssh connection *concurrently* with the local
        // tree walk, so its handshake and (potentially large) remote cleanup latency overlaps the
        // collection instead of adding a serial ~1s round trip before any byte is sent.
        const sshTool = await resolveLocalSshTool();
        const preparePromise = this.runNativeSshCommand(connection, sshTool, prepareRemoteCommand, progressId);
        let entries;
        try {
            entries = await this.collectLocalTarRelativeEntries(localDirectory);
        }
        catch (error) {
            await preparePromise.catch(() => undefined);
            throw error;
        }
        if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
            await preparePromise.catch(() => undefined);
            throw new Error('Not enough entries for parallel tar upload.');
        }
        await this.runParallelLocalTarUpload(localDirectory, entries, connection, undefined, extractRemoteCommand, progressId, onArchiveDelta, preparePromise);
    }
    async runParallelLocalDirectoryTarZstdUpload(localDirectory, connection, prepareRemoteCommand, extractRemoteCommand, progressId, onArchiveDelta) {
        const sshTool = await resolveLocalSshTool();
        const preparePromise = this.runNativeSshCommand(connection, sshTool, prepareRemoteCommand, progressId);
        let entries;
        try {
            entries = await this.collectLocalTarRelativeEntries(localDirectory);
        }
        catch (error) {
            await preparePromise.catch(() => undefined);
            throw error;
        }
        if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
            await preparePromise.catch(() => undefined);
            throw new Error('Not enough entries for parallel tar+zstd upload.');
        }
        await this.runParallelLocalTarZstdUpload(localDirectory, entries, connection, undefined, extractRemoteCommand, progressId, onArchiveDelta, preparePromise);
    }
    async runParallelLocalBatchTarUpload(plan, connection, targetDirectory, progressId, onArchiveDelta) {
        // Prepare the remote target concurrently with the local tree walk so its ssh round trip
        // overlaps the collection rather than adding a serial delay before the first byte.
        const preparePromise = this.prepareRemoteBatchTarTarget(connection, targetDirectory, plan.targetNames, progressId, false);
        let entries;
        try {
            entries = plan.fileNames && plan.directoryNames && plan.unknownNames
                ? await this.collectLocalTarRelativeEntries(plan.parentPath, plan.unknownNames, plan.directoryNames, plan.fileNames)
                : plan.containsDirectories
                    ? await this.collectLocalTarRelativeEntries(plan.parentPath, plan.names)
                    : plan.names.map(normalizeTarListPath);
        }
        catch (error) {
            await preparePromise.catch(() => undefined);
            throw error;
        }
        if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
            await preparePromise.catch(() => undefined);
            throw new Error('Not enough entries for parallel batch tar upload.');
        }
        await this.runParallelLocalTarUpload(plan.parentPath, entries, connection, undefined, buildTarExtractStreamToDirectoryCommand(targetDirectory), progressId, onArchiveDelta, preparePromise);
    }
    async runParallelLocalBatchTarZstdUpload(plan, connection, targetDirectory, progressId, onArchiveDelta) {
        const preparePromise = this.prepareRemoteBatchTarTarget(connection, targetDirectory, plan.targetNames, progressId, true);
        let entries;
        try {
            entries = plan.fileNames && plan.directoryNames && plan.unknownNames
                ? await this.collectLocalTarRelativeEntries(plan.parentPath, plan.unknownNames, plan.directoryNames, plan.fileNames)
                : plan.containsDirectories
                    ? await this.collectLocalTarRelativeEntries(plan.parentPath, plan.names)
                    : plan.names.map(normalizeTarListPath);
        }
        catch (error) {
            await preparePromise.catch(() => undefined);
            throw error;
        }
        if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
            await preparePromise.catch(() => undefined);
            throw new Error('Not enough entries for parallel batch tar+zstd upload.');
        }
        await this.runParallelLocalTarZstdUpload(plan.parentPath, entries, connection, undefined, buildTarZstdExtractToDirectoryCommand(targetDirectory), progressId, onArchiveDelta, preparePromise);
    }
    async runParallelLocalTarUpload(localRoot, entries, connection, prepareRemoteCommand, extractRemoteCommand, progressId, onArchiveDelta, preparePromise) {
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
        }
        finally {
            await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
        }
    }
    async runParallelLocalTarZstdUpload(localRoot, entries, connection, prepareRemoteCommand, extractRemoteCommand, progressId, onArchiveDelta, preparePromise) {
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
        }
        finally {
            await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
        }
    }
    /**
     * Ensures the remote destination prep (rm+mkdir) is complete before chunk extraction starts.
     * Callers either pass a `preparePromise` already running concurrently with the local tree walk,
     * or a `prepareRemoteCommand` string to run here (the batch path prepares its target earlier).
     */
    async awaitTarPrepare(connection, sshTool, prepareRemoteCommand, preparePromise, progressId) {
        if (preparePromise) {
            await preparePromise;
            return;
        }
        if (prepareRemoteCommand) {
            await this.runNativeSshCommand(connection, sshTool, prepareRemoteCommand, progressId);
        }
    }
    async collectLocalTarRelativeEntries(localRoot, unknownNames, knownDirectoryNames = [], knownFileNames = []) {
        const entries = [];
        const directoryQueue = knownDirectoryNames.map(normalizeTarListPath);
        const inspectDirectory = async (relativeDir) => {
            const fullDir = relativeDir ? join(localRoot, ...relativeDir.split('/')) : localRoot;
            const children = await fsp.readdir(fullDir, { withFileTypes: true });
            if (!children.length && relativeDir) {
                entries.push(relativeDir);
                return [];
            }
            const subDirectories = [];
            for (const child of children) {
                const childRelativePath = normalizeTarListPath(relativeDir ? `${relativeDir}/${child.name}` : child.name);
                if (child.isDirectory()) {
                    subDirectories.push(childRelativePath);
                }
                else {
                    // Tar can preserve symlinks, FIFOs and device nodes. Treat every non-directory
                    // Dirent as a leaf so a fast pre-walk can never silently drop a selected source. Unix
                    // sockets are the exception: tar formats cannot preserve them, so fail before a move can
                    // ever clean the source tree.
                    if (child.isSocket()) {
                        throw new Error(`Cannot archive Unix socket: ${childRelativePath}`);
                    }
                    if (!child.isFile() && !child.isSymbolicLink() && !child.isBlockDevice() && !child.isCharacterDevice() && !child.isFIFO()) {
                        const stat = await fsp.lstat(join(fullDir, child.name));
                        if (stat.isSocket()) {
                            throw new Error(`Cannot archive Unix socket: ${childRelativePath}`);
                        }
                    }
                    entries.push(childRelativePath);
                }
            }
            return subDirectories;
        };
        entries.push(...knownFileNames.map(normalizeTarListPath));
        const hasExplicitRoots = unknownNames !== undefined || knownDirectoryNames.length > 0 || knownFileNames.length > 0;
        if (unknownNames?.length) {
            const unknownEntries = await mapLimit(unknownNames, LOCAL_DIRECTORY_STAT_CONCURRENCY, async (name) => {
                const relativePath = normalizeTarListPath(name);
                const stat = await fsp.lstat(join(localRoot, ...relativePath.split('/')));
                if (stat.isSocket()) {
                    throw new Error(`Cannot archive Unix socket: ${relativePath}`);
                }
                return { relativePath, directory: stat.isDirectory() };
            });
            for (const entry of unknownEntries) {
                if (entry.directory) {
                    directoryQueue.push(entry.relativePath);
                }
                else {
                    entries.push(entry.relativePath);
                }
            }
        }
        else if (!hasExplicitRoots) {
            directoryQueue.push('');
        }
        await new Promise((resolve, reject) => {
            let nextIndex = 0;
            let active = 0;
            let settled = false;
            const pump = () => {
                if (settled) {
                    return;
                }
                while (active < LOCAL_DIRECTORY_STAT_CONCURRENCY && nextIndex < directoryQueue.length) {
                    const relativeDir = directoryQueue[nextIndex++];
                    active++;
                    void inspectDirectory(relativeDir).then(subDirectories => {
                        directoryQueue.push(...subDirectories);
                    }, error => {
                        if (!settled) {
                            settled = true;
                            reject(error);
                        }
                    }).finally(() => {
                        active--;
                        pump();
                    });
                }
                if (active === 0 && nextIndex >= directoryQueue.length) {
                    settled = true;
                    resolve();
                }
            };
            pump();
        });
        return entries.sort((a, b) => FILE_ENTRY_NAME_COLLATOR.compare(a, b));
    }
    /**
     * The bundled Windows `tar.exe` (libarchive bsdtar) reads `-T` list files using the process
     * ANSI code page, not UTF-8. Writing the list as UTF-8 makes non-ASCII names (e.g. Chinese)
     * unreadable and aborts the transfer ("Couldn't visit directory: No such file or directory").
     * Resolve the system code page once so list files are encoded the way bsdtar expects; falls
     * back to UTF-8 on non-Windows or when detection fails.
     */
    async getLocalTarListEncoding() {
        if (!this.localTarListEncodingPromise) {
            this.localTarListEncodingPromise = (async () => {
                if (platform() !== 'win32') {
                    return 'utf8';
                }
                try {
                    const encoding = await resolveTerminalEncoding();
                    const iconv = await import('@vscode/iconv-lite-umd');
                    return iconv.default.encodingExists(encoding) ? encoding : 'utf8';
                }
                catch {
                    return 'utf8';
                }
            })();
        }
        return this.localTarListEncodingPromise;
    }
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
    getLocalTarCharsetArgs() {
        if (!this.localTarCharsetArgsPromise) {
            this.localTarCharsetArgsPromise = (async () => {
                if (platform() !== 'win32') {
                    return [];
                }
                try {
                    const version = await new Promise((resolve, reject) => {
                        execFile('tar.exe', ['--version'], { windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout));
                    });
                    return /bsdtar|libarchive/i.test(version) ? ['--options', 'hdrcharset=UTF-8'] : [];
                }
                catch {
                    return [];
                }
            })();
        }
        return this.localTarCharsetArgsPromise;
    }
    async createLocalTarListBuffer(entries) {
        const encoding = await this.getLocalTarListEncoding();
        if (encoding === 'utf8') {
            return createTarNullListBuffer(entries);
        }
        const iconv = await import('@vscode/iconv-lite-umd');
        return Buffer.from(iconv.default.encode(`${entries.join('\0')}\0`, encoding));
    }
    async writeLocalTarChunkLists(tempRoot, entries) {
        const chunkCount = Math.min(LOCAL_PARALLEL_TAR_CHUNK_COUNT, entries.length);
        const chunks = Array.from({ length: chunkCount }, () => []);
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
    async writeLocalTarListFile(tempRoot, names) {
        const listPath = join(tempRoot, 'items.lst');
        await fsp.writeFile(listPath, await this.createLocalTarListBuffer(names.map(name => normalizeTarListPath(name))));
        return listPath;
    }
    async runNativeSshCommand(connection, tool, remoteCommand, progressId) {
        await withNativeOpenSshArgs(connection, tool, remoteCommand, async (sshArgs, env) => {
            await this.runCancelableLocalCommand(tool.executable, sshArgs, { env }, progressId);
        });
    }
    async runNativeSshCommandWithInput(connection, tool, remoteCommand, input, progressId) {
        await withNativeOpenSshArgs(connection, tool, remoteCommand, async (sshArgs, env) => {
            let sshProcess;
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
                await Promise.all([
                    writeInputToWritableStream(sshProcess.stdin, input, 'native ssh command input'),
                    sshClose
                ]);
            }
            finally {
                unregisterCancel();
            }
        });
    }
    async prepareRemoteBatchTarTarget(connection, targetDirectory, targetNames, progressId, requireZstd) {
        const sshTool = await resolveLocalSshTool();
        const command = buildPrepareTarExtractToDirectoryFromListCommand(targetDirectory, requireZstd);
        const targetPaths = targetNames.map(name => joinRemotePath(targetDirectory, name));
        await this.runNativeSshCommandWithInput(connection, sshTool, command, createTarNullListBuffer(targetPaths), progressId);
    }
    async runNativeLocalTarUploadChunk(localRoot, chunk, connection, sshTool, remoteCommand, progressId, onArchiveDelta) {
        await withNativeOpenSshArgs(connection, sshTool, remoteCommand, async (sshArgs, sshEnv) => {
            let tarProcess;
            let sshProcess;
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
            }
            finally {
                unregisterCancel();
            }
        });
    }
    async runNativeLocalTarUploadChunkWithRetry(localRoot, chunk, connection, sshTool, remoteCommand, progressId, onArchiveDelta) {
        let lastError;
        for (let attempt = 0; attempt <= LOCAL_PARALLEL_TAR_CHUNK_RETRIES; attempt++) {
            if (attempt > 0) {
                await delay(150 * attempt);
            }
            try {
                await this.runNativeLocalTarUploadChunk(localRoot, chunk, connection, sshTool, remoteCommand, progressId, onArchiveDelta);
                return;
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                lastError = error;
            }
        }
        throw new Error(`Parallel tar chunk failed after retries: ${formatTransferError(lastError)}`);
    }
    async runNativeLocalTarZstdUploadChunk(localRoot, chunk, connection, sshTool, zstdTool, remoteCommand, progressId, onArchiveDelta) {
        await withNativeOpenSshArgs(connection, sshTool, remoteCommand, async (sshArgs, sshEnv) => {
            let tarProcess;
            let zstdProcess;
            let sshProcess;
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
            }
            finally {
                unregisterCancel();
            }
        });
    }
    async runLocalScpUpload(request, bytes, onProgress) {
        if (request.target.kind !== 'ssh' || !request.target.connection) {
            throw new Error('Missing SSH target.');
        }
        const localStat = await fsp.stat(request.source.path);
        const recursive = localStat.isDirectory();
        const initialRemoteSize = await this.withDirectorySftp(request.target, async (sftp) => {
            this.throwIfTransferCanceled(request.progressId);
            if (recursive) {
                await this.withDirectorySshClient(request.target, client => this.execRemote(client, `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}`)).catch(async () => {
                    await this.ensureRemoteDirectory(sftp, request.target.path);
                });
            }
            else {
                await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
                await this.unlinkRemote(sftp, request.target.path).catch(() => undefined);
            }
            return 0;
        });
        if (canUseNativeOpenSshScpCommand(request.target.connection)) {
            try {
                await this.uploadPathWithNativeOpenSshScp(request.target.connection, request.source.path, request.target.path, recursive, initialRemoteSize, bytes, onProgress, request.progressId);
                return;
            }
            catch (error) {
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
    async runLocalScpDownload(request, bytes, onProgress) {
        if (request.source.kind !== 'ssh' || !request.source.connection) {
            throw new Error('Missing SSH source.');
        }
        await ensureLocalParentDirectory(request.target.path);
        const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown');
        const recursive = sourceType === 'directory';
        if (canUseNativeOpenSshScpCommand(request.source.connection)) {
            await fsp.rm(request.target.path, { recursive, force: true }).catch(() => undefined);
            if (recursive) {
                await ensureLocalDirectory(request.target.path);
            }
            const initialLocalSize = 0;
            try {
                await this.downloadPathWithNativeOpenSshScp(request.source.connection, request.source.path, request.target.path, recursive, initialLocalSize, bytes, onProgress, request.progressId);
                return;
            }
            catch (error) {
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
    async uploadPathWithNativeOpenSshScp(connection, localPath, remotePath, recursive, initialRemoteSize, expectedBytes, onProgress, progressId) {
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
        }
        finally {
            stopGrowthTiming();
        }
    }
    async downloadPathWithNativeOpenSshScp(connection, remotePath, localPath, recursive, initialLocalSize, expectedBytes, onProgress, progressId) {
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
        }
        finally {
            stopGrowthTiming();
        }
    }
    async uploadFileWithScpProtocol(connection, localPath, remotePath, expectedBytes, onProgress, progressId) {
        const configResult = await this.createConnectConfig(connection);
        if (!configResult.ok) {
            throw new Error(configResult.message);
        }
        let client;
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
            }
            finally {
                stopGrowthTiming();
            }
            await writeScpData(stream, Buffer.from([0]));
            await readScpResponse(reader, 'complete upload');
            stream.end();
            await closePromise;
        }
        finally {
            client?.end();
        }
    }
    async downloadFileWithScpProtocol(connection, remotePath, localPath, expectedBytes, onProgress, progressId) {
        const configResult = await this.createConnectConfig(connection);
        if (!configResult.ok) {
            throw new Error(configResult.message);
        }
        let client;
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
            }
            finally {
                stopGrowthTiming();
            }
            await readScpResponse(reader, 'complete download');
            await writeScpData(stream, Buffer.from([0]));
            stream.end();
            await closePromise;
        }
        finally {
            client?.end();
        }
    }
    openScpExec(client, command) {
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
    async runLocalRsyncUpload(request, expectedBytes, onProgressOutput) {
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
    async runLocalRsyncDownload(request, expectedBytes, onProgressOutput) {
        if (request.source.kind !== 'ssh' || !request.source.connection) {
            throw new Error('Missing SSH source.');
        }
        void expectedBytes;
        const connection = request.source.connection;
        const tool = await resolveLocalRsyncTool();
        const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown');
        const sourceIsDirectory = sourceType === 'directory';
        if (sourceIsDirectory) {
            await ensureLocalDirectory(request.target.path);
        }
        else {
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
    async transferBatch(request) {
        const startedAt = Date.now();
        const strategy = getTransferStrategy(request.source, request.targetDirectory);
        const items = request.items.filter(item => !!item.sourcePath && !!item.targetName);
        const operation = request.operation === 'move' ? 'move' : 'copy';
        if (request.progressId) {
            this.transferCancellationRequests.delete(request.progressId);
        }
        try {
            return await this.fileOperationQueue.runWithAccess(getTransferOperationAccess(request.source, request.targetDirectory, operation), () => this.transferBatchCore(request), {
                id: request.progressId,
                onQueued: () => this.fireTransferProgress(request, 0, Math.max(0, request.expectedBytes ?? 0), 'prepare', 'Waiting for device operation queue.', true, {
                    completedItems: 0,
                    totalItems: items.length,
                    currentName: items[0]?.displayName ?? items[0]?.targetName
                })
            });
        }
        catch (error) {
            const canceled = error instanceof TurboFileOperationCanceledError || this.isTransferCanceled(request.progressId);
            if (request.progressId) {
                this.transferCancellationRequests.delete(request.progressId);
                this.transferCancelHandlers.delete(request.progressId);
            }
            this.scheduleTransferProgressCleanup(request.progressId);
            return this.createBatchTransferResult(false, strategy, 0, canceled ? TRANSFER_CANCELED_MESSAGE : error instanceof Error ? error.message : String(error), 0, items.length, canceled || !items.length ? [] : [{
                    name: items[0].displayName ?? items[0].targetName,
                    path: items[0].sourcePath,
                    message: error instanceof Error ? error.message : String(error)
                }], startedAt, request.progressId, canceled);
        }
    }
    async transferBatchCore(request) {
        const startedAt = Date.now();
        const strategy = getTransferStrategy(request.source, request.targetDirectory);
        const items = request.items.filter(item => !!item.sourcePath && !!item.targetName);
        const operation = request.operation === 'move' ? 'move' : 'copy';
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
            const shouldFallbackFromTar = shouldPreferTarForBatchTransfer(request);
            let tarBatch;
            try {
                tarBatch = await this.tryBatchTarTransfer(request, items, 'copy', expectedBytes, startedAt);
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                if (!shouldFallbackFromTar) {
                    throw error;
                }
            }
            this.throwIfTransferCanceled(request.progressId);
            if (tarBatch && (tarBatch.ok || tarBatch.completed === items.length)) {
                if (operation === 'move') {
                    const cleanupFailures = await this.deleteBatchSources(request.source, items, request.progressId);
                    if (cleanupFailures.length) {
                        return this.createBatchTransferResult(false, tarBatch.strategy, tarBatch.bytes, `Batch transfer completed, but source cleanup failed for ${cleanupFailures.length} item(s).`, items.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
                    }
                }
                return tarBatch;
            }
            if (shouldFallbackFromTar) {
                const sftpRequest = forceBatchTransferProtocol(request, 'sftp');
                this.fireTransferProgress(sftpRequest, 0, expectedBytes, 'prepare', 'Tar transfer unavailable; preparing SFTP fallback.', true, {
                    strategy: getTransferStrategy(sftpRequest.source, sftpRequest.targetDirectory),
                    completedItems: 0,
                    totalItems: items.length,
                    currentName: items[0]?.displayName ?? items[0]?.targetName
                });
                const fallback = await this.runConcurrentBatchTransfer(sftpRequest, items, operation, expectedBytes, startedAt, true);
                this.clearRemoteDirectoryListingCache(request.targetDirectory);
                return fallback;
            }
            const localRsyncBatch = await this.tryLocalBatchRsyncTransfer(request, items, operation, expectedBytes, startedAt);
            this.throwIfTransferCanceled(request.progressId);
            if (localRsyncBatch && (localRsyncBatch.ok || localRsyncBatch.completed === items.length)) {
                return localRsyncBatch;
            }
            const fallback = await this.runConcurrentBatchTransfer(request, items, operation, expectedBytes, startedAt, false);
            this.clearRemoteDirectoryListingCache(request.targetDirectory);
            return fallback;
        }
        catch (error) {
            const canceled = error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId);
            return this.createBatchTransferResult(false, strategy, 0, canceled ? TRANSFER_CANCELED_MESSAGE : error instanceof Error ? error.message : String(error), 0, items.length, canceled ? [] : [{
                    name: items[0].displayName ?? items[0].targetName,
                    path: items[0].sourcePath,
                    message: error instanceof Error ? error.message : String(error)
                }], startedAt, request.progressId, canceled);
        }
        finally {
            if (request.progressId) {
                this.transferCancellationRequests.delete(request.progressId);
                this.transferCancelHandlers.delete(request.progressId);
            }
            this.scheduleTransferProgressCleanup(request.progressId);
        }
    }
    getBatchExpectedBytes(request, items) {
        const explicit = Math.max(0, request.expectedBytes ?? 0);
        if (explicit > 0) {
            return explicit;
        }
        return items.reduce((sum, item) => sum + Math.max(0, item.expectedBytes ?? 0), 0);
    }
    getInitialBatchTransferAttempt(request, items) {
        const sourceType = items.some(item => item.sourceType === 'directory') ? 'directory' : items[0]?.sourceType;
        return resolveTransferPlan({
            source: request.source,
            target: request.targetDirectory,
            sourceType,
            itemCount: items.length,
            strategyHint: request.strategyHint
        }).attempts[0];
    }
    async runSshToSshBatchTransferPlan(request, items, operation, expectedBytes, startedAt) {
        const sourceType = items.some(item => item.sourceType === 'directory') ? 'directory' : items[0]?.sourceType;
        const plan = resolveTransferPlan({
            source: request.source,
            target: request.targetDirectory,
            sourceType,
            itemCount: items.length,
            strategyHint: request.strategyHint
        });
        const failures = [];
        const result = await runTurboFileBatchTransferFlow({
            attempts: plan.attempts,
            operation,
            totalItems: items.length,
            runAttempt: async (attempt) => {
                this.throwIfTransferCanceled(request.progressId);
                this.fireTransferProgress(request, 0, attempt.protocol === 'rsync' ? 0 : expectedBytes, attempt.route === 'relay' ? 'relay-upload' : 'transfer', `Starting batch ${attempt.protocol} ${attempt.route} transfer.`, true, {
                    strategy: transferAttemptToStrategy(attempt),
                    route: attempt.route === 'relay' ? 'relay' : undefined,
                    completedItems: 0,
                    totalItems: items.length,
                    currentName: items[0]?.displayName ?? items[0]?.targetName
                });
                const attemptResult = await this.runSshToSshBatchTransferAttempt(request, items, expectedBytes, startedAt, attempt);
                this.throwIfTransferCanceled(request.progressId);
                return attemptResult;
            },
            cleanupSources: () => this.deleteBatchSources(request.source, items, request.progressId),
            createCleanupFailureResult: (successfulResult, cleanupFailures) => this.createBatchTransferResult(false, successfulResult.strategy, successfulResult.bytes, `Batch transfer completed, but source cleanup failed for ${cleanupFailures.length} item(s).`, items.length, cleanupFailures.length, [...cleanupFailures], startedAt, request.progressId),
            onIncompleteResult: incompleteResult => failures.push(...incompleteResult.failures),
            onAttemptError: (error, attempt, nextAttempt) => {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                failures.push({
                    name: items[0]?.displayName ?? items[0]?.targetName ?? 'batch',
                    path: items[0]?.sourcePath ?? request.source.path,
                    message: `${attempt.protocol} ${attempt.route}: ${formatTransferError(error)}`
                });
                if (nextAttempt) {
                    const directFallback = attempt.route === 'direct' && nextAttempt.route === 'relay' ? getDirectFallbackProgress(error) : undefined;
                    this.fireTransferProgress(request, 0, nextAttempt.protocol === 'rsync' ? 0 : expectedBytes, nextAttempt.route === 'relay' ? 'relay-upload' : 'transfer', directFallback ? directFallback.detail : `Falling back to batch ${nextAttempt.protocol} ${nextAttempt.route}.`, true, {
                        strategy: transferAttemptToStrategy(nextAttempt),
                        route: nextAttempt.route === 'relay' ? 'relay' : undefined,
                        ...(directFallback ? { directFallbackReason: directFallback.directFallbackReason } : {}),
                        completedItems: 0,
                        totalItems: items.length,
                        currentName: items[0]?.displayName ?? items[0]?.targetName
                    });
                }
            }
        });
        if (result) {
            return result;
        }
        return this.createBatchTransferResult(false, transferAttemptToStrategy(plan.attempts[0]), 0, failures[0]?.message ?? 'Batch transfer unavailable.', 0, items.length, failures.length ? failures : items.map(item => ({
            name: item.displayName ?? item.targetName,
            path: item.sourcePath,
            message: 'No transfer attempt was available.'
        })), startedAt, request.progressId);
    }
    async runSshToSshBatchTransferAttempt(request, items, expectedBytes, startedAt, attempt) {
        if (attempt.protocol === 'rsync') {
            return attempt.route === 'direct'
                ? await this.tryDirectBatchRsyncTransfer(request, items, expectedBytes, startedAt, true)
                : attempt.route === 'relay'
                    ? await this.tryTunneledBatchRsyncRelayTransfer(request, items, expectedBytes, startedAt, true)
                    : undefined;
        }
        if (attempt.protocol === 'tar') {
            return this.tryBatchTarTransfer({
                ...request,
                strategyHint: attempt.route === 'relay' ? 'relay' : 'direct'
            }, items, 'copy', expectedBytes, startedAt, true);
        }
        const attemptRequest = attempt.protocol === 'sftp' ? forceBatchTransferProtocol(request, 'sftp') : request;
        return this.runConcurrentBatchTransfer({
            ...attemptRequest,
            strategyHint: attempt.route === 'relay' ? 'relay' : 'direct'
        }, items, 'copy', expectedBytes, startedAt, false);
    }
    async runLocalNativeBatchTransfer(request, items, operation, expectedBytes, startedAt) {
        const totalBytes = Math.max(0, expectedBytes);
        this.fireTransferProgress(request, 0, totalBytes, 'transfer', operation === 'move' ? 'Moving locally.' : 'Copying locally.', true, {
            completedItems: 0,
            totalItems: items.length,
            currentName: items[0]?.displayName ?? items[0]?.targetName
        });
        const sources = items.map(item => item.sourcePath);
        let transferredBytes = 0;
        if (operation === 'copy') {
            await ensureLocalDirectory(request.targetDirectory.path);
            for (const [index, item] of items.entries()) {
                this.throwIfTransferCanceled(request.progressId);
                const currentName = item.displayName ?? item.targetName;
                const progressBytes = totalBytes > 0 ? Math.min(transferredBytes, totalBytes) : transferredBytes;
                this.fireTransferProgress(request, progressBytes, totalBytes, 'transfer', 'Copying locally.', index === 0, {
                    completedItems: index,
                    totalItems: items.length,
                    currentName
                });
                await this.copyLocalPath(item.sourcePath, this.joinBatchTargetPath(request.targetDirectory, item.targetName), delta => {
                    this.throwIfTransferCanceled(request.progressId);
                    transferredBytes += delta;
                    const progressBytes = totalBytes > 0 ? Math.min(transferredBytes, totalBytes) : transferredBytes;
                    this.fireTransferProgress(request, progressBytes, totalBytes, 'transfer', 'Copying locally.', false, {
                        completedItems: index,
                        totalItems: items.length,
                        currentName
                    });
                }, request.progressId);
                const completedBytes = totalBytes > 0 ? Math.min(transferredBytes, totalBytes) : transferredBytes;
                this.fireTransferProgress(request, completedBytes, totalBytes, 'transfer', 'Copying locally.', false, {
                    completedItems: index + 1,
                    totalItems: items.length,
                    currentName
                });
            }
        }
        else if (platform() === 'win32' || looksLikeWindowsPath(request.targetDirectory.path) || sources.some(looksLikeWindowsPath)) {
            await ensureLocalParentDirectory(this.joinBatchTargetPath(request.targetDirectory, items[0].targetName));
            const mappings = items.map(item => ({
                sourcePath: item.sourcePath,
                targetPath: this.joinBatchTargetPath(request.targetDirectory, item.targetName),
                sourceType: item.sourceType ?? 'unknown'
            }));
            this.markTransferDataStarted(request.progressId);
            await this.runCancelableLocalCommand('powershell.exe', [
                '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShellCommand(buildWindowsMappedBatchFromInputScript(operation))
            ], {
                input: Buffer.from(JSON.stringify(mappings), 'utf8'),
                inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS,
                inactivityMessage: 'Local Windows batch move produced no progress.'
            }, request.progressId);
        }
        else {
            await ensureLocalParentDirectory(this.joinBatchTargetPath(request.targetDirectory, items[0].targetName));
            await ensureLocalDirectory(request.targetDirectory.path);
            const plan = createPosixNativeBatchTransferPlan(items, request.targetDirectory.path, operation);
            this.markTransferDataStarted(request.progressId);
            await this.runCancelableLocalCommand('sh', ['-c', plan.command], {
                input: plan.input,
                inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS,
                inactivityMessage: 'Local POSIX batch move produced no progress.'
            }, request.progressId);
        }
        this.throwIfTransferCanceled(request.progressId);
        const resultBytes = operation === 'copy' ? transferredBytes : totalBytes;
        this.fireTransferProgress(request, resultBytes, totalBytes, 'complete', 'Batch local transfer completed.', true, {
            completedItems: items.length,
            totalItems: items.length
        });
        return this.createBatchTransferResult(true, operation === 'move' ? 'local-copy' : 'local-copy', resultBytes, 'Batch local transfer completed.', items.length, 0, [], startedAt, request.progressId);
    }
    async runSameRemoteNativeBatchTransfer(request, items, operation, expectedBytes, startedAt) {
        this.fireTransferProgress(request, 0, expectedBytes, 'transfer', operation === 'move' ? 'Moving on remote host.' : 'Copying on remote host.', true, {
            completedItems: 0,
            totalItems: items.length,
            currentName: items[0]?.displayName ?? items[0]?.targetName
        });
        const sources = items.map(item => item.sourcePath);
        this.markTransferDataStarted(request.progressId);
        if (looksLikeWindowsPath(request.targetDirectory.path) || sources.some(looksLikeWindowsPath)) {
            const input = Buffer.from(JSON.stringify(items.map(item => ({
                sourcePath: item.sourcePath,
                targetPath: this.joinBatchTargetPath(request.targetDirectory, item.targetName),
                sourceType: item.sourceType ?? 'unknown'
            }))), 'utf8');
            await this.withSshClient(request.source, client => this.execRemoteWithInput(client, buildWindowsMappedBatchFromInputCommand(operation), input, {
                progressId: request.progressId
            }));
        }
        else {
            const plan = createPosixNativeBatchTransferPlan(items, request.targetDirectory.path, operation);
            await this.withSshClient(request.source, client => this.execRemoteWithInput(client, plan.command, plan.input, { progressId: request.progressId }));
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
    async tryLocalBatchRsyncTransfer(request, items, operation, expectedBytes, startedAt) {
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
        const connection = isUpload ? request.targetDirectory.connection : request.source.connection;
        try {
            const tool = await resolveLocalRsyncTool();
            const initialTotalBytes = Math.max(0, expectedBytes);
            let transferredBytes = 0;
            // Fire 'transfer' (not 'prepare') right away: rsync starts immediately and may stay quiet
            // while scanning its file list, and the last phase label should not read as "preparing".
            this.fireTransferProgress(request, 0, initialTotalBytes, 'transfer', isUpload ? 'Starting batch rsync upload.' : 'Starting batch rsync download.', true, {
                strategy: isUpload ? 'rsync-upload' : 'rsync-download',
                completedItems: 0,
                totalItems: items.length,
                currentName: items[0]?.displayName ?? items[0]?.targetName
            });
            // Explicit paths are always supplied as a NUL-delimited list. Grouping by source parent
            // preserves the historical flattened-basename behavior without exposing argv limits.
            const sourceGroups = createTurboFileRsyncSourceGroups(items.map(item => item.sourcePath), isUpload && platform() === 'win32' ? 'windows' : 'posix');
            if (!isUpload) {
                await ensureLocalDirectory(request.targetDirectory.path);
            }
            await withLocalRsyncSshEnvironment(connection, tool, async (env, identityPath) => {
                for (const group of sourceGroups) {
                    this.throwIfTransferCanceled(request.progressId);
                    const progress = this.createRsyncProgressReporter(request, initialTotalBytes, 'transfer', isUpload ? 'Batch rsync upload in progress.' : 'Batch rsync download in progress.', {
                        strategy: isUpload ? 'rsync-upload' : 'rsync-download',
                        completedItems: 0,
                        totalItems: items.length
                    }, undefined, transferredBytes);
                    const sourceBase = isUpload
                        ? ensureTrailingRemoteSlash(toRsyncLocalPath(group.sourceBase, tool.pathFlavor))
                        : formatRsyncRemoteSpec(connection, ensureTrailingRemoteSlash(group.sourceBase));
                    const target = isUpload
                        ? formatRsyncRemoteSpec(connection, ensureTrailingRemoteSlash(request.targetDirectory.path))
                        : toRsyncLocalPath(request.targetDirectory.path, tool.pathFlavor);
                    const args = [
                        ...buildLocalRsyncOptionArgs(true),
                        '--files-from=-',
                        '--from0',
                        '-r',
                        ...(isUpload ? [buildRsyncPathWithMkdirOption(request.targetDirectory.path)] : []),
                        '-e',
                        buildLocalRsyncSshTransport(connection, tool.sshExecutable, identityPath),
                        sourceBase,
                        target
                    ];
                    await this.runCancelableLocalCommand(tool.executable, args, {
                        env,
                        input: createTarNullListBuffer(group.relativePaths),
                        onStdout: progress.handleOutput,
                        onStderr: progress.handleOutput,
                        inactivityTimeoutMs: LOCAL_RSYNC_STALL_TIMEOUT_MS,
                        inactivityMessage: `Batch rsync ${isUpload ? 'upload' : 'download'} produced no output for ${LOCAL_RSYNC_STALL_TIMEOUT_MS} ms.`
                    }, request.progressId);
                    transferredBytes = progress.getLastBytes();
                }
            });
            const cleanupFailures = operation === 'move' ? await this.deleteBatchSources(request.source, items, request.progressId) : [];
            const bytes = transferredBytes || expectedBytes;
            this.fireTransferProgress(request, bytes, 0, 'complete', isUpload ? 'Batch rsync upload completed.' : 'Batch rsync download completed.', true, {
                strategy: isUpload ? 'rsync-upload' : 'rsync-download',
                completedItems: items.length,
                totalItems: items.length
            });
            this.clearRemoteDirectoryListingCache(isUpload ? request.targetDirectory : request.source);
            return this.createBatchTransferResult(cleanupFailures.length === 0, isUpload ? 'rsync-upload' : 'rsync-download', bytes, cleanupFailures.length ? `Batch rsync completed, but source cleanup failed for ${cleanupFailures.length} item(s).` : 'Batch rsync completed.', items.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            return undefined;
        }
    }
    async tryDirectBatchRsyncTransfer(request, items, expectedBytes, startedAt, allowAutoFast = false) {
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
        return this.runVerifiedDirectRouteAttempt(request.source, request.targetDirectory, request.progressId, 'rsync-direct', route => this.tryDirectBatchRsyncTransferRoute(request, items, expectedBytes, startedAt, route));
    }
    async tryDirectBatchRsyncTransferRoute(request, items, expectedBytes, startedAt, route) {
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
        const markActivity = () => {
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
            const listOptions = ['--files-from=-', '--from0', '-r'].join(' ');
            const rsyncPathOption = route === 'source-push' ? ` ${buildRsyncPathWithMkdirShellOption(request.targetDirectory.path)}` : '';
            const targetSpec = route === 'source-push'
                ? `${remoteUserHost}:${ensureTrailingRemoteSlash(request.targetDirectory.path)}`
                : ensureTrailingRemoteSlash(request.targetDirectory.path);
            const sourceGroups = createTurboFileRsyncSourceGroups(items.map(item => item.sourcePath), 'posix');
            let transferredBytes = 0;
            for (const group of sourceGroups) {
                const sourceSpec = route === 'source-push'
                    ? ensureTrailingRemoteSlash(group.sourceBase)
                    : `${remoteUserHost}:${ensureTrailingRemoteSlash(group.sourceBase)}`;
                const rsyncCommandCore = `${sshpassPrefix}rsync ${rsyncOptions} ${listOptions}${rsyncPathOption} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(sourceSpec)} ${quotePosixShellArg(targetSpec)}`;
                const rsyncCommand = route === 'source-push' ? rsyncCommandCore : `mkdir -p ${quotePosixShellArg(request.targetDirectory.path)} && ${rsyncCommandCore}`;
                const progress = this.createRsyncProgressReporter(request, 0, 'rsync-direct', 'Batch direct rsync transfer in progress.', {
                    strategy: 'rsync-direct',
                    route,
                    completedItems: 0,
                    totalItems: items.length
                }, markActivity, transferredBytes);
                this.throwIfTransferCanceled(request.progressId);
                markActivity();
                await this.execRemote(client, rsyncCommand, {
                    input: createTarNullListBuffer(group.relativePaths),
                    onStdout: progress.handleOutput,
                    onStderr: progress.handleOutput,
                    inactivityTimeoutMs: DIRECT_RSYNC_STALL_TIMEOUT_MS,
                    inactivityMessage: `Batch direct rsync ${route} produced no transfer progress for ${DIRECT_RSYNC_STALL_TIMEOUT_MS} ms.`,
                    getActivityTime: () => lastActivityAt,
                    progressId: request.progressId
                });
                transferredBytes = progress.getLastBytes();
            }
            this.throwIfTransferCanceled(request.progressId);
            const bytes = transferredBytes || expectedBytes;
            this.fireTransferProgress(request, bytes, 0, 'complete', 'Batch direct rsync completed.', true, {
                strategy: 'rsync-direct',
                route,
                completedItems: items.length,
                totalItems: items.length
            });
            this.clearRemoteDirectoryListingCache(request.targetDirectory);
            return this.createBatchTransferResult(true, 'rsync-direct', bytes, 'Batch direct rsync completed.', items.length, 0, [], startedAt, request.progressId);
        }
        catch (error) {
            if (this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            throw error;
        }
        finally {
            unregisterCancel();
            client.end();
        }
    }
    async tryTunneledBatchRsyncRelayTransfer(request, items, expectedBytes, startedAt, allowAutoFast = false) {
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
        const forwardedSockets = new Set();
        let forwardedPort;
        const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
            for (const socket of forwardedSockets) {
                socket.destroy();
            }
            client.end();
        });
        client.on('tcp connection', (_details, accept, reject) => {
            if (this.isTransferCanceled(request.progressId)) {
                reject();
                return;
            }
            const channel = accept();
            const socket = connectTcp(request.targetDirectory.connection.port || 22, request.targetDirectory.connection.host);
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
            const listOptions = ['--files-from=-', '--from0', '-r'].join(' ');
            const targetSpec = `${targetUserHost}:${ensureTrailingRemoteSlash(request.targetDirectory.path)}`;
            const sourceGroups = createTurboFileRsyncSourceGroups(items.map(item => item.sourcePath), 'posix');
            let transferredBytes = 0;
            for (const group of sourceGroups) {
                const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} ${listOptions} ${buildRsyncPathWithMkdirShellOption(request.targetDirectory.path)} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(ensureTrailingRemoteSlash(group.sourceBase))} ${quotePosixShellArg(targetSpec)}`;
                const progress = this.createRsyncProgressReporter(request, 0, 'relay-upload', 'Batch rsync relay transfer in progress.', {
                    strategy: 'rsync-relay',
                    completedItems: 0,
                    totalItems: items.length
                }, undefined, transferredBytes);
                await this.execRemote(client, rsyncCommand, {
                    input: createTarNullListBuffer(group.relativePaths),
                    onStdout: progress.handleOutput,
                    onStderr: progress.handleOutput,
                    inactivityTimeoutMs: DIRECT_RSYNC_STALL_TIMEOUT_MS,
                    inactivityMessage: `Batch rsync relay produced no transfer progress for ${DIRECT_RSYNC_STALL_TIMEOUT_MS} ms.`,
                    getActivityTime: progress.getActivityTime,
                    progressId: request.progressId
                });
                transferredBytes = progress.getLastBytes();
            }
            this.throwIfTransferCanceled(request.progressId);
            const bytes = transferredBytes || expectedBytes;
            this.fireTransferProgress(request, bytes, 0, 'complete', 'Batch rsync relay completed.', true, {
                strategy: 'rsync-relay',
                completedItems: items.length,
                totalItems: items.length
            });
            this.clearRemoteDirectoryListingCache(request.targetDirectory);
            return this.createBatchTransferResult(true, 'rsync-relay', bytes, 'Batch rsync relay completed.', items.length, 0, [], startedAt, request.progressId);
        }
        catch {
            if (this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            return undefined;
        }
        finally {
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
    async tryBatchTarTransfer(request, items, operation, expectedBytes, startedAt, forceProtocol = false) {
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
            let bytes = Math.max(0, expectedBytes);
            this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing batch tar upload.', true, { strategy: 'tar-upload', completedItems: 0, totalItems: items.length });
            let archiveBytes = 0;
            const onArchiveDelta = (delta) => {
                this.throwIfTransferCanceled(request.progressId);
                archiveBytes += Math.max(0, delta);
                this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, 'transfer', 'Batch tar upload in progress.', false, { strategy: 'tar-upload', completedItems: 0, totalItems: items.length });
            };
            this.markTransferDataStarted(request.progressId);
            await this.runLocalBatchTarUploads(plans, request.targetDirectory, request.progressId, onArchiveDelta);
            const resultBytes = Math.max(bytes, archiveBytes);
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
            this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing batch tar download.', true, { strategy: 'tar-download', completedItems: 0, totalItems: items.length });
            await this.prepareLocalBatchTarTarget(request.targetDirectory.path, plan.targetNames);
            let archiveBytes = 0;
            const onArchiveDelta = (delta) => {
                this.throwIfTransferCanceled(request.progressId);
                archiveBytes += Math.max(0, delta);
                this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, 'transfer', 'Batch tar download in progress.', false, { strategy: 'tar-download', completedItems: 0, totalItems: items.length });
            };
            this.markTransferDataStarted(request.progressId);
            await this.runRemoteBatchTarDownload(request.source, plan, request.targetDirectory.path, request.progressId, onArchiveDelta);
            const resultBytes = Math.max(bytes, archiveBytes);
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
            const bytes = Math.max(0, expectedBytes);
            let directFailure;
            if (request.strategyHint !== 'relay') {
                try {
                    const directResult = await this.tryDirectBatchTarTransfer(request, items, plan, bytes, startedAt);
                    if (directResult) {
                        return directResult;
                    }
                }
                catch (error) {
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
            return this.tryRelayBatchTarTransfer(request, items, plan, bytes, startedAt);
        }
        return undefined;
    }
    createRemoteBatchTarPlan(items) {
        if (!items.length) {
            return undefined;
        }
        const parentPath = getRemoteParentPath(items[0].sourcePath);
        const names = [];
        const targetNames = [];
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
    async prepareLocalBatchTarTarget(targetDirectory, targetNames) {
        await ensureLocalDirectory(targetDirectory);
        await mapLimit(targetNames, BATCH_TRANSFER_WORKERS, targetName => fsp.rm(join(targetDirectory, targetName), { recursive: true, force: true }).catch(() => undefined));
    }
    async cleanupBatchSourcesAfterTar(request, items, operation) {
        if (operation !== 'move') {
            return;
        }
        const cleanupFailures = await this.deleteBatchSources(request.source, items, request.progressId);
        if (cleanupFailures.length) {
            throw new Error(`Batch transfer completed, but source cleanup failed for ${cleanupFailures.length} item(s).`);
        }
    }
    async runLocalBatchTarUploads(plans, targetDirectory, progressId, onArchiveDelta) {
        for (const plan of plans) {
            this.throwIfTransferCanceled(progressId);
            await this.runLocalBatchTarUpload(plan, targetDirectory, progressId, onArchiveDelta);
        }
    }
    async runLocalBatchTarUpload(plan, targetDirectory, progressId, onArchiveDelta) {
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
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                // Parallel raw tar|ssh is the stable default for local multi-file/folder uploads.
            }
            try {
                await this.runParallelLocalBatchTarZstdUpload(tarPlan, targetDirectory.connection, targetDirectory.path, progressId, onArchiveDelta);
                return;
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                // Parallel tar+zstd+ssh is the measured fast path. If unavailable, try single native tar|ssh.
            }
            try {
                await this.prepareRemoteBatchTarTarget(targetDirectory.connection, targetDirectory.path, tarPlan.targetNames, progressId, false);
                await this.runNativeLocalBatchTarUploadFromList(tarPlan, targetDirectory.connection, buildTarExtractStreamToDirectoryCommand(targetDirectory.path), progressId, onArchiveDelta);
                return;
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                    throw new TurboFileTransferCanceledError();
                }
                throw new Error(`Native batch tar upload failed: ${formatTransferError(error)}`);
            }
        }
        finally {
            await localTarRoot.dispose();
        }
    }
    async runNativeLocalBatchTarUploadFromList(plan, connection, remoteCommand, progressId, onArchiveDelta) {
        const tempRoot = join(tmpdir(), `turbofile-batch-tar-${randomUUID()}`);
        await fsp.mkdir(tempRoot, { recursive: true });
        try {
            const listPath = await this.writeLocalTarListFile(tempRoot, plan.names);
            await this.runNativeLocalTarUpload(['-cf', '-', '-C', plan.parentPath, '--null', '-T', listPath], connection, remoteCommand, progressId, onArchiveDelta);
        }
        finally {
            await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
        }
    }
    async runRemoteBatchTarDownload(source, plan, targetDirectory, progressId, onArchiveDelta) {
        if (source.kind !== 'ssh' || !source.connection) {
            throw new Error('Missing SSH source.');
        }
        const sourcePlan = createRemoteBatchTarSourcePlan(plan.parentPath, plan.names);
        try {
            await this.runNativeLocalTarDownload(source.connection, sourcePlan.command, ['-xf', '-', '-C', targetDirectory], progressId, onArchiveDelta, sourcePlan.input);
            return;
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            // Native ssh|tar is preferred for speed; ssh2 remains the compatibility fallback.
        }
        const configResult = await this.createConnectConfig(source.connection);
        if (!configResult.ok) {
            throw new Error(configResult.message);
        }
        let client;
        let tarProcess;
        const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
            tarProcess?.kill();
            client?.end();
        });
        try {
            client = await this.connect(configResult.config);
            const sourceStream = await this.openRemoteCommandStream(client, sourcePlan.command, 'batch tar download create');
            tarProcess = spawn('tar.exe', [...await this.getLocalTarCharsetArgs(), '-xf', '-', '-C', targetDirectory], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
            if (!tarProcess.stdin || !tarProcess.stdout) {
                throw new Error('Local batch tar download did not provide pipes.');
            }
            tarProcess.stdout.resume();
            const tarClose = waitForLocalProcessClose(tarProcess, 'local batch tar download');
            const archivePipeline = pipeline(sourceStream.stream, createProgressPassThrough(onArchiveDelta), tarProcess.stdin);
            const inputWrite = sourcePlan.input
                ? writeInputToWritableStream(sourceStream.stream, sourcePlan.input, 'batch tar download path list')
                : Promise.resolve();
            await Promise.all([archivePipeline, inputWrite, sourceStream.close, tarClose]);
        }
        finally {
            unregisterCancel();
            client?.end();
        }
    }
    async tryDirectBatchTarTransfer(request, items, plan, expectedBytes, startedAt) {
        if (request.source.kind !== 'ssh' || request.targetDirectory.kind !== 'ssh' || !request.source.connection || !request.targetDirectory.connection) {
            return undefined;
        }
        return this.runVerifiedDirectRouteAttempt(request.source, request.targetDirectory, request.progressId, 'tar-direct', route => this.tryDirectBatchTarTransferRoute(request, items, plan, expectedBytes, startedAt, route));
    }
    async tryDirectBatchTarTransferRoute(request, items, plan, expectedBytes, startedAt, route) {
        const executorEndpoint = route === 'source-push' ? request.source : request.targetDirectory;
        const remoteEndpoint = route === 'source-push' ? request.targetDirectory : request.source;
        if (!executorEndpoint.connection || !remoteEndpoint.connection || !request.targetDirectory.connection) {
            throw new Error('Direct batch tar route is missing SSH connection details.');
        }
        const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
        if (!executorConfigResult.ok) {
            throw new Error(executorConfigResult.message);
        }
        const client = await this.connectDirectSsh(executorConfigResult.config);
        let credential;
        let lastActivityAt = Date.now();
        try {
            credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection, request.progressId);
            const remote = remoteEndpoint.connection;
            const remoteUserHost = `${remote.username}@${remote.host}`;
            const sshpassPrefix = buildSshpassPrefix(remote.password);
            const sshCommand = buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath);
            const sourcePlan = createRemoteBatchTarSourcePlan(plan.parentPath, plan.names);
            const inlineCommand = route === 'source-push'
                ? buildTarItemsSourcePushCommand(plan.parentPath, plan.names, request.targetDirectory.path, plan.targetNames, remoteUserHost, sshCommand, sshpassPrefix)
                : buildTarItemsTargetPullCommand(plan.parentPath, plan.names, request.targetDirectory.path, plan.targetNames, remoteUserHost, sshCommand, sshpassPrefix);
            let command = inlineCommand;
            if (!isTurboFileBatchCommandSafe(inlineCommand)) {
                await this.prepareRemoteBatchTarTarget(request.targetDirectory.connection, request.targetDirectory.path, plan.targetNames, request.progressId, false);
                command = route === 'source-push'
                    ? buildPreparedTarItemsSourcePushCommand(sourcePlan.command, request.targetDirectory.path, remoteUserHost, sshCommand, sshpassPrefix)
                    : buildPreparedTarItemsTargetPullCommand(sourcePlan.command, request.targetDirectory.path, remoteUserHost, sshCommand, sshpassPrefix);
            }
            const tarProgress = this.createDirectTarProgressReporter(request, expectedBytes, 'Batch direct tar transfer in progress.', {
                strategy: 'tar-direct', route, completedItems: 0, totalItems: items.length
            }, () => lastActivityAt = Date.now());
            const reportTarProgress = tarProgress.reportTarProgress;
            this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing batch direct tar transfer.', true, { strategy: 'tar-direct', route, completedItems: 0, totalItems: items.length });
            this.markTransferDataStarted(request.progressId);
            await this.execRemote(client, command, {
                input: sourcePlan.input,
                onStderr: reportTarProgress,
                inactivityTimeoutMs: DIRECT_TAR_STALL_TIMEOUT_MS,
                inactivityMessage: `Direct batch tar ${route} produced no stream progress for ${DIRECT_TAR_STALL_TIMEOUT_MS} ms.`,
                getActivityTime: () => lastActivityAt,
                progressId: request.progressId
            });
            this.throwIfTransferCanceled(request.progressId);
            const bytes = Math.max(expectedBytes, tarProgress.getTransferredBytes());
            this.fireTransferProgress(request, bytes, expectedBytes, 'complete', 'Batch direct tar completed.', true, { strategy: 'tar-direct', route, completedItems: items.length, totalItems: items.length });
            return this.createBatchTransferResult(true, 'tar-direct', bytes, 'Batch direct tar completed.', items.length, 0, [], startedAt, request.progressId);
        }
        finally {
            if (credential?.cleanupCommand) {
                await this.execRemote(client, credential.cleanupCommand, { timeoutMs: 2000 }).catch(() => undefined);
            }
            client.end();
        }
    }
    async tryRelayBatchTarTransfer(request, items, plan, expectedBytes, startedAt) {
        if (request.source.kind !== 'ssh' || request.targetDirectory.kind !== 'ssh' || !request.source.connection || !request.targetDirectory.connection) {
            return undefined;
        }
        const sourceConfigResult = await this.createConnectConfig(request.source.connection);
        const targetConfigResult = await this.createConnectConfig(request.targetDirectory.connection);
        if (!sourceConfigResult.ok || !targetConfigResult.ok) {
            return undefined;
        }
        let sourceClient;
        let targetClient;
        let transferredBytes = 0;
        const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
            sourceClient?.end();
            targetClient?.end();
        });
        try {
            sourceClient = await this.connect(sourceConfigResult.config);
            targetClient = await this.connect(targetConfigResult.config);
            this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing batch tar relay.', true, { strategy: 'tar-relay', route: 'relay', completedItems: 0, totalItems: items.length });
            const sourcePlan = createRemoteBatchTarSourcePlan(plan.parentPath, plan.names);
            let targetCommand = buildTarExtractToDirectoryCommand(request.targetDirectory.path, plan.targetNames);
            if (!isTurboFileBatchCommandSafe(targetCommand)) {
                await this.execRemoteWithInput(targetClient, buildPrepareTarExtractToDirectoryFromListCommand(request.targetDirectory.path, false), createTarNullListBuffer(plan.targetNames.map(name => joinRemotePath(request.targetDirectory.path, name))), {
                    inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS,
                    inactivityMessage: 'Batch tar target preparation produced no progress.',
                    progressId: request.progressId
                });
                targetCommand = buildTarExtractStreamToDirectoryCommand(request.targetDirectory.path);
            }
            const onArchiveDelta = (delta) => {
                transferredBytes += Math.max(0, delta);
                this.fireTransferProgress(request, expectedBytes > 0 ? Math.min(transferredBytes, expectedBytes) : transferredBytes, expectedBytes, 'relay-upload', 'Batch tar relay in progress.', false, { strategy: 'tar-relay', route: 'relay', completedItems: 0, totalItems: items.length });
            };
            this.markTransferDataStarted(request.progressId);
            const sourceStream = await this.openRemoteCommandStream(sourceClient, sourcePlan.command, 'batch tar relay create');
            const targetStream = await this.openRemoteCommandStream(targetClient, targetCommand, 'batch tar relay extract', true);
            const archivePipeline = pipeline(sourceStream.stream, createProgressPassThrough(onArchiveDelta), targetStream.stream);
            const inputWrite = sourcePlan.input
                ? writeInputToWritableStream(sourceStream.stream, sourcePlan.input, 'batch tar relay path list')
                : Promise.resolve();
            await Promise.all([archivePipeline, inputWrite, sourceStream.close, targetStream.close]);
            this.throwIfTransferCanceled(request.progressId);
            const bytes = Math.max(expectedBytes, transferredBytes);
            this.fireTransferProgress(request, bytes, expectedBytes, 'complete', 'Batch tar relay completed.', true, { strategy: 'tar-relay', route: 'relay', completedItems: items.length, totalItems: items.length });
            return this.createBatchTransferResult(true, 'tar-relay', bytes, 'Batch tar relay completed.', items.length, 0, [], startedAt, request.progressId);
        }
        finally {
            unregisterCancel();
            sourceClient?.end();
            targetClient?.end();
        }
    }
    async runConcurrentBatchTransfer(request, items, operation, expectedBytes, startedAt, disableRsync) {
        const transferredByItem = new Array(items.length).fill(0);
        const totalByItem = items.map(item => Math.max(0, item.expectedBytes ?? 0));
        let aggregateTransferredBytes = 0;
        let aggregateTotalBytes = totalByItem.reduce((sum, value) => sum + value, 0);
        const successfulItems = [];
        const failures = [];
        const successfulStrategies = new Set();
        const childProgressIds = new Set();
        let completedItems = 0;
        let completedBytes = 0;
        const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
            for (const childProgressId of [...childProgressIds]) {
                void this.cancelTransfer(childProgressId);
            }
        });
        const workerLimit = items.some(item => item.sourceType === 'directory') ? BATCH_TRANSFER_DIRECTORY_WORKERS : BATCH_TRANSFER_WORKERS;
        const preserveDirectErrors = request.strategyHint === 'direct' && request.source.kind === 'ssh' && request.targetDirectory.kind === 'ssh';
        const fallbackStrategy = request.strategyHint === 'relay'
            ? transferAttemptToDirectionalStrategy(request.source, request.targetDirectory, this.getInitialBatchTransferAttempt(request, items))
            : getTransferStrategy(request.source, request.targetDirectory);
        try {
            const chosenStrategy = await runTurboFileConcurrentBatchAttempt({
                fallbackStrategy,
                run: async (controller) => {
                    await mapLimit(items, workerLimit, async (item, index) => {
                        this.throwIfTransferCanceled(request.progressId);
                        const childProgressId = `${request.progressId ?? 'turbofile-batch'}-${index}-${randomUUID()}`;
                        childProgressIds.add(childProgressId);
                        const childSource = disableRsync ? { ...request.source, path: item.sourcePath, supportsRsync: false } : { ...request.source, path: item.sourcePath };
                        const childTarget = disableRsync ? { ...request.targetDirectory, path: this.joinBatchTargetPath(request.targetDirectory, item.targetName), supportsRsync: false } : { ...request.targetDirectory, path: this.joinBatchTargetPath(request.targetDirectory, item.targetName) };
                        const disposable = this.onDynamicTransferProgress(childProgressId)(event => {
                            const nextTransferredBytes = Math.max(0, event.transferredBytes);
                            aggregateTransferredBytes += nextTransferredBytes - transferredByItem[index];
                            transferredByItem[index] = nextTransferredBytes;
                            const nextTotalBytes = Math.max(totalByItem[index], event.totalBytes);
                            aggregateTotalBytes += nextTotalBytes - totalByItem[index];
                            totalByItem[index] = nextTotalBytes;
                            this.fireBatchAggregateProgress(request, aggregateTransferredBytes, Math.max(expectedBytes, aggregateTotalBytes), event.phase, event.detail ?? 'Batch transfer in progress.', completedItems, items.length, item.displayName ?? item.targetName, false, event.strategy);
                        });
                        try {
                            const result = await this.transferFileCore({
                                source: childSource,
                                target: childTarget,
                                sourceType: item.sourceType,
                                expectedBytes: item.expectedBytes,
                                progressId: childProgressId,
                                strategyHint: disableRsync && request.source.kind === 'ssh' && request.targetDirectory.kind === 'ssh' ? 'direct' : request.strategyHint
                            }, preserveDirectErrors);
                            controller.recordResult(result);
                            if (result.ok) {
                                successfulStrategies.add(result.strategy);
                                successfulItems.push(item);
                                completedBytes += result.bytes;
                                const nextTransferredBytes = Math.max(transferredByItem[index], result.bytes);
                                aggregateTransferredBytes += nextTransferredBytes - transferredByItem[index];
                                transferredByItem[index] = nextTransferredBytes;
                                const nextTotalBytes = Math.max(totalByItem[index], result.bytes);
                                aggregateTotalBytes += nextTotalBytes - totalByItem[index];
                                totalByItem[index] = nextTotalBytes;
                            }
                            else if (result.canceled) {
                                throw new TurboFileTransferCanceledError();
                            }
                            else {
                                failures.push({ name: item.displayName ?? item.targetName, path: item.sourcePath, message: result.message });
                            }
                        }
                        catch (error) {
                            if (!preserveDirectErrors || !controller.captureDirectError(error)) {
                                throw error;
                            }
                        }
                        finally {
                            completedItems++;
                            childProgressIds.delete(childProgressId);
                            disposable.dispose();
                            this.fireBatchAggregateProgress(request, aggregateTransferredBytes, Math.max(expectedBytes, aggregateTotalBytes), 'transfer', 'Batch transfer in progress.', completedItems, items.length, item.displayName ?? item.targetName, false);
                        }
                    });
                }
            });
            if (operation === 'move' && successfulItems.length) {
                const cleanupFailures = await this.deleteBatchSources(request.source, successfulItems, request.progressId);
                failures.push(...cleanupFailures);
            }
            const bytes = Math.max(completedBytes, aggregateTransferredBytes, expectedBytes > 0 && failures.length === 0 ? expectedBytes : 0);
            this.fireTransferProgress(request, bytes, Math.max(bytes, expectedBytes), 'complete', 'Batch transfer completed.', true, {
                strategy: chosenStrategy,
                completedItems: successfulItems.length,
                totalItems: items.length
            });
            const failed = failures.length;
            return this.createBatchTransferResult(failed === 0, chosenStrategy, bytes, failed === 0 ? 'Batch transfer completed.' : `Batch transfer completed with ${failed} failure(s).`, successfulItems.length, failed, failures, startedAt, request.progressId);
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                return this.createBatchTransferResult(false, [...successfulStrategies][0] ?? fallbackStrategy, Math.max(completedBytes, aggregateTransferredBytes), TRANSFER_CANCELED_MESSAGE, successfulItems.length, failures.length, failures, startedAt, request.progressId, true);
            }
            throw error;
        }
        finally {
            unregisterCancel();
        }
    }
    fireBatchAggregateProgress(request, transferredBytes, totalBytes, phase, detail, completedItems, totalItems, currentName, force = false, strategy) {
        this.fireTransferProgress(request, transferredBytes, totalBytes, phase, detail, force, {
            strategy,
            completedItems,
            totalItems,
            currentName
        });
    }
    async deleteBatchSources(source, items, progressId) {
        const failures = [];
        if (source.kind === 'local') {
            await mapLimit(items, BATCH_TRANSFER_WORKERS, async (item) => {
                try {
                    await fsp.rm(item.sourcePath, { recursive: true, force: true });
                }
                catch (error) {
                    failures.push({ name: item.displayName ?? item.targetName, path: item.sourcePath, message: error instanceof Error ? error.message : String(error) });
                }
            });
            return failures;
        }
        try {
            const paths = items.map(item => item.sourcePath);
            if (paths.some(looksLikeWindowsPath)) {
                const input = Buffer.from(JSON.stringify(paths), 'utf8');
                await this.withSshClient(source, client => this.execRemoteWithInput(client, buildWindowsDeleteManyFromInputCommand(true), input, {
                    progressId
                }));
            }
            else {
                await this.withSshClient(source, client => this.execRemoteWithInput(client, buildPosixDeleteManyFromInputCommand(true), createTarNullListBuffer(paths), {
                    inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS,
                    inactivityMessage: 'Remote POSIX batch cleanup produced no progress.',
                    progressId
                }));
            }
        }
        catch (error) {
            for (const item of items) {
                failures.push({ name: item.displayName ?? item.targetName, path: item.sourcePath, message: error instanceof Error ? error.message : String(error) });
            }
        }
        return failures;
    }
    joinBatchTargetPath(targetDirectory, targetName) {
        return joinRemotePath(targetDirectory.path, targetName);
    }
    createBatchTransferResult(ok, strategy, bytes, message, completed, failed, failures, startedAt, progressId, canceled = false) {
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
    async createDirectory(endpoint) {
        return this.fileOperationQueue.run(getFileOperationDeviceKeys(endpoint), () => this.createDirectoryCore(endpoint));
    }
    async createDirectoryCore(endpoint) {
        try {
            if (endpoint.kind === 'local') {
                await fsp.mkdir(endpoint.path, { recursive: true });
            }
            else {
                // Reuse the already-open directory session instead of withSftp, which opens a fresh SSH
                // connection every call — that handshake is the bulk of "new folder is slow", especially
                // on a high-latency remote host.
                await this.withDirectorySftp(endpoint, sftp => this.ensureRemoteDirectory(sftp, endpoint.path));
            }
            this.clearRemoteDirectoryListingCache(endpoint);
            return { ok: true, message: 'Directory created.' };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    async movePathsToTrash(request) {
        const deviceKeys = [
            getFileOperationDeviceKey(request.device),
            ...request.sources.map(source => getFileOperationDeviceKey(source.endpoint))
        ];
        return this.fileOperationQueue.run(deviceKeys, () => this.movePathsToTrashCore(request));
    }
    async movePathsToTrashCore(request) {
        const deviceIdentity = getTurboFileTrashDeviceIdentity(this.withLocalTrashIdentity(request.device));
        const results = [];
        const validSources = [];
        for (const source of request.sources) {
            try {
                if (source.endpoint.kind !== request.device.kind) {
                    throw new Error('Recycle-bin source does not belong to the selected device.');
                }
                if (getFileOperationDeviceKey(source.endpoint) !== getFileOperationDeviceKey(request.device)) {
                    throw new Error('Recycle-bin source belongs to a different device connection.');
                }
                if (isTurboFileProtectedTrashSource(source.endpoint.path, looksLikeWindowsPath(source.endpoint.path))) {
                    throw new Error('Refusing to move a filesystem root or recycle-bin path to the recycle bin.');
                }
                validSources.push(source);
            }
            catch (error) {
                results.push({ path: source.endpoint.path, ok: false, message: error instanceof Error ? error.message : String(error) });
            }
        }
        if (request.device.kind === 'ssh' && validSources.length) {
            results.push(...await this.moveRemotePathsToTrash(validSources, deviceIdentity));
        }
        else {
            const workerLimit = validSources.some(source => source.type === 'directory') ? BATCH_TRANSFER_DIRECTORY_WORKERS : BATCH_TRANSFER_WORKERS;
            const localResults = await mapLimit(validSources, workerLimit, async (source) => {
                try {
                    const item = await this.moveLocalPathToTrash(source, deviceIdentity);
                    this.clearRemoteDirectoryListingCache(source.endpoint);
                    return { id: item.id, path: source.endpoint.path, ok: true, message: 'Moved to recycle bin.' };
                }
                catch (error) {
                    return { path: source.endpoint.path, ok: false, message: error instanceof Error ? error.message : String(error) };
                }
            });
            results.push(...localResults);
        }
        return this.createTrashOperationResult(results, 'Moved to recycle bin.');
    }
    async listTrashItems(device) {
        try {
            const normalizedDevice = this.withLocalTrashIdentity(device);
            const items = normalizedDevice.kind === 'local'
                ? await this.listLocalTrashItems(normalizedDevice)
                : await this.listRemoteTrashItems(normalizedDevice);
            return {
                ok: true,
                message: 'Recycle bin loaded.',
                items: sortTurboFileTrashItems(items),
                inaccessibleVolumes: []
            };
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
                items: [],
                inaccessibleVolumes: []
            };
        }
    }
    async restoreTrashItems(request) {
        return this.fileOperationQueue.run([getFileOperationDeviceKey(request.device)], () => this.restoreTrashItemsCore(request));
    }
    async restoreTrashItemsCore(request) {
        const device = this.withLocalTrashIdentity(request.device);
        const expectedIdentity = getTurboFileTrashDeviceIdentity(device);
        const results = [];
        for (const item of request.items) {
            try {
                if (item.deviceIdentity !== expectedIdentity) {
                    throw new Error('Recycle-bin item belongs to a different device.');
                }
                const result = device.kind === 'local'
                    ? await this.restoreLocalTrashItem(item, request.conflictPolicy)
                    : await this.restoreRemoteTrashItem(device, item, request.conflictPolicy);
                results.push(result);
            }
            catch (error) {
                results.push({ id: item.id, path: item.originalPath, ok: false, message: error instanceof Error ? error.message : String(error) });
            }
        }
        return this.createTrashOperationResult(results, 'Recycle-bin items restored.');
    }
    async permanentlyDeleteTrashItems(request) {
        return this.fileOperationQueue.run([getFileOperationDeviceKey(request.device)], () => this.permanentlyDeleteTrashItemsCore(request));
    }
    async permanentlyDeleteTrashItemsCore(request) {
        const device = this.withLocalTrashIdentity(request.device);
        const expectedIdentity = getTurboFileTrashDeviceIdentity(device);
        const validItems = request.items.filter(item => item.deviceIdentity === expectedIdentity && this.isSafeTrashItem(item));
        if (!validItems.length) {
            return this.createTrashOperationResult(request.items.map(item => ({
                id: item.id,
                path: item.originalPath,
                ok: false,
                message: 'Recycle-bin item is invalid or belongs to a different device.'
            })), 'No recycle-bin items were deleted.');
        }
        const results = await this.deleteTrashItemsNative(device, validItems);
        return this.createTrashOperationResult(results, 'Recycle-bin items permanently deleted.');
    }
    async emptyTrash(device) {
        return this.fileOperationQueue.run([getFileOperationDeviceKey(device)], () => this.emptyTrashCore(device));
    }
    async emptyTrashCore(device) {
        return this.emptyTrashNative(this.withLocalTrashIdentity(device));
    }
    async getTrashState(device) {
        try {
            const hasItems = await this.hasTrashItemsNative(this.withLocalTrashIdentity(device));
            return { ok: true, message: hasItems ? 'Recycle bin contains items.' : 'Recycle bin is empty.', hasItems, itemCount: hasItems ? 1 : 0 };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error), hasItems: false, itemCount: 0 };
        }
    }
    withLocalTrashIdentity(device) {
        if (device.kind !== 'local' || device.localUserIdentity) {
            return device;
        }
        const info = userInfo();
        const domain = process.env.USERDOMAIN?.trim();
        return {
            ...device,
            localUserIdentity: domain ? `${domain}\\${info.username}` : info.username
        };
    }
    createTrashOperationResult(results, successMessage) {
        const completed = results.filter(result => result.ok).length;
        const failed = results.length - completed;
        return {
            ok: failed === 0,
            message: failed === 0 ? successMessage : `${completed} succeeded, ${failed} failed.`,
            completed,
            failed,
            results
        };
    }
    async moveLocalPathToTrash(source, deviceIdentity) {
        const { trashRoot, volumeId } = this.resolveLocalTrashRoot(source.endpoint.path, deviceIdentity);
        const filesDirectory = join(trashRoot, 'files');
        const infoDirectory = join(trashRoot, 'info');
        const id = createTurboFileTrashItemId();
        const payloadPath = join(filesDirectory, id);
        const pendingPath = join(infoDirectory, `${id}.pending.json`);
        const metadataPath = join(infoDirectory, `${id}.json`);
        const item = {
            id,
            originalName: basename(source.endpoint.path),
            originalPath: source.endpoint.path,
            deletedAt: Date.now(),
            type: source.type,
            knownSize: source.type === 'file' ? source.knownSize : undefined,
            volumeId,
            trashRoot,
            payloadPath,
            deviceIdentity
        };
        await fsp.mkdir(filesDirectory, { recursive: true });
        await fsp.mkdir(infoDirectory, { recursive: true });
        await fsp.writeFile(pendingPath, JSON.stringify(item), { encoding: 'utf8', flag: 'wx' });
        try {
            await fsp.rename(source.endpoint.path, payloadPath);
            await fsp.rename(pendingPath, metadataPath);
        }
        catch (error) {
            const sourceStillExists = await this.localPathExists(source.endpoint.path);
            const payloadExists = await this.localPathExists(payloadPath);
            if (sourceStillExists && !payloadExists) {
                await fsp.rm(pendingPath, { force: true }).catch(() => undefined);
            }
            throw error;
        }
        this.rememberTrashRoot(deviceIdentity, trashRoot);
        return item;
    }
    async listLocalTrashItems(device) {
        const deviceIdentity = getTurboFileTrashDeviceIdentity(device);
        const roots = await this.getLocalTrashRoots(deviceIdentity);
        const itemsByRoot = await mapLimit([...roots], BATCH_TRANSFER_DIRECTORY_WORKERS, async (trashRoot) => {
            const infoDirectory = join(trashRoot, 'info');
            let entries;
            try {
                entries = await fsp.readdir(infoDirectory);
            }
            catch {
                return [];
            }
            const values = await mapLimit(entries, BATCH_TRANSFER_WORKERS, async (entry) => {
                if (!entry.endsWith('.json')) {
                    return undefined;
                }
                const metadataPath = join(infoDirectory, entry);
                try {
                    const parsed = JSON.parse(await fsp.readFile(metadataPath, 'utf8'));
                    if (!isTurboFileTrashMetadata(parsed) || parsed.deviceIdentity !== deviceIdentity) {
                        return undefined;
                    }
                    if (entry.endsWith('.pending.json')) {
                        await this.recoverLocalPendingTrashItem(parsed, metadataPath);
                    }
                    if (await this.localPathExists(parsed.payloadPath)) {
                        return parsed;
                    }
                }
                catch {
                    // Corrupt metadata remains on disk for diagnosis and is not exposed as restorable data.
                }
                return undefined;
            });
            return values.filter((item) => !!item);
        });
        return itemsByRoot.flat();
    }
    async recoverLocalPendingTrashItem(item, pendingPath) {
        const sourceExists = await this.localPathExists(item.originalPath);
        const payloadExists = await this.localPathExists(item.payloadPath);
        if (payloadExists && !sourceExists) {
            await fsp.rename(pendingPath, join(item.trashRoot, 'info', `${item.id}.json`));
        }
        else if (sourceExists && !payloadExists) {
            await fsp.rm(pendingPath, { force: true });
        }
    }
    async restoreLocalTrashItem(item, conflictPolicy) {
        let targetPath = item.originalPath;
        if (await this.localPathExists(targetPath)) {
            if (conflictPolicy === 'cancel') {
                return { id: item.id, path: item.originalPath, ok: false, conflict: true, message: 'An item with the same name already exists.' };
            }
            targetPath = await this.findLocalKeepBothPath(targetPath);
        }
        await fsp.mkdir(dirname(targetPath), { recursive: true });
        await fsp.rename(item.payloadPath, targetPath);
        await fsp.rm(join(item.trashRoot, 'info', `${item.id}.json`), { force: true });
        return { id: item.id, path: item.originalPath, restoredPath: targetPath, ok: true, message: 'Restored.' };
    }
    async findLocalKeepBothPath(originalPath) {
        const parent = dirname(originalPath);
        const name = basename(originalPath);
        for (let ordinal = 1; ordinal < 10000; ordinal++) {
            const candidate = join(parent, createTurboFileKeepBothName(name, ordinal));
            if (!await this.localPathExists(candidate)) {
                return candidate;
            }
        }
        throw new Error('Unable to create a unique restore name.');
    }
    resolveLocalTrashRoot(sourcePath, deviceIdentity) {
        const uncMatch = /^(\\\\[^\\]+\\[^\\]+)(?:\\|$)/.exec(sourcePath);
        if (uncMatch) {
            const volumeId = uncMatch[1].toLowerCase();
            const userKey = createHash('sha256').update(deviceIdentity).digest('hex').slice(0, 12);
            return { trashRoot: `${uncMatch[1]}\\.turbofile-trash-${userKey}\\turbofile`, volumeId };
        }
        const match = /^([A-Za-z]):[\\/]/.exec(sourcePath);
        if (!match) {
            throw new Error('Local recycle-bin deletion requires an absolute Windows path.');
        }
        const drive = match[1].toUpperCase();
        const volumeId = drive;
        const localAppDataDrive = /^([A-Za-z]):[\\/]/.exec(process.env.LOCALAPPDATA ?? '')?.[1]?.toUpperCase();
        if (drive === localAppDataDrive && process.env.LOCALAPPDATA) {
            return { trashRoot: join(process.env.LOCALAPPDATA, 'TurboFile', 'RecycleBin', volumeId), volumeId };
        }
        const userKey = createHash('sha256').update(deviceIdentity).digest('hex').slice(0, 12);
        return { trashRoot: `${drive}:\\.turbofile-trash-${userKey}\\turbofile`, volumeId };
    }
    async getLocalTrashRoots(deviceIdentity) {
        const roots = new Set(this.trashRootsByDeviceIdentity.get(deviceIdentity));
        const localAppDataDrive = /^([A-Za-z]):[\\/]/.exec(process.env.LOCALAPPDATA ?? '')?.[1]?.toUpperCase();
        await Promise.all(Array.from({ length: 26 }, async (_, index) => {
            const code = 65 + index;
            const drive = String.fromCharCode(code);
            const { trashRoot } = this.resolveLocalTrashRoot(`${drive}:\\`, deviceIdentity);
            if (drive === localAppDataDrive || await this.localPathExists(dirname(trashRoot))) {
                roots.add(trashRoot);
            }
        }));
        return roots;
    }
    localPathExists(path) {
        return fsp.stat(path).then(() => true, () => false);
    }
    async moveRemotePathsToTrash(sources, deviceIdentity) {
        const first = sources[0];
        const results = [];
        const preparedItems = [];
        const rootsByParent = new Map();
        const windowsPath = looksLikeWindowsPath(first.endpoint.path);
        if (!windowsPath) {
            const probePaths = Array.from(new Set(sources.map(source => source.type === 'directory' ? source.endpoint.path : getRemoteParentPath(source.endpoint.path))));
            if (probePaths.length > 1) {
                const batchRoots = await this.resolveRemoteTrashRoots(first.endpoint, probePaths).catch(() => new Map());
                for (const [probePath, root] of batchRoots) {
                    rootsByParent.set(probePath, root);
                }
            }
        }
        for (const source of sources) {
            try {
                const parentKey = source.type === 'directory' ? source.endpoint.path : getRemoteParentPath(source.endpoint.path);
                let root = rootsByParent.get(parentKey);
                if (!root) {
                    root = await this.resolveRemoteTrashRoot(source.endpoint, deviceIdentity);
                    rootsByParent.set(parentKey, root);
                }
                const filesDirectory = joinRemotePath(root.trashRoot, 'files');
                const infoDirectory = joinRemotePath(root.trashRoot, 'info');
                const id = createTurboFileTrashItemId();
                const item = {
                    id,
                    originalName: getTransferName(source.endpoint.path),
                    originalPath: source.endpoint.path,
                    deletedAt: Date.now(),
                    type: source.type,
                    knownSize: source.type === 'file' ? source.knownSize : undefined,
                    volumeId: root.volumeId,
                    trashRoot: root.trashRoot,
                    payloadPath: joinRemotePath(filesDirectory, id),
                    deviceIdentity
                };
                preparedItems.push({
                    source,
                    item,
                    pendingPath: joinRemotePath(infoDirectory, `${id}.pending.json`),
                    metadataPath: joinRemotePath(infoDirectory, `${id}.json`)
                });
            }
            catch (error) {
                results.push({ path: source.endpoint.path, ok: false, message: error instanceof Error ? error.message : String(error) });
            }
        }
        if (!preparedItems.length) {
            return results;
        }
        let moveResults;
        try {
            const command = windowsPath ? buildWindowsTrashMoveBatchCommand() : buildPosixTrashMoveBatchCommand();
            const input = windowsPath
                ? Buffer.from(JSON.stringify(preparedItems.map(prepared => ({
                    id: prepared.item.id,
                    sourcePath: prepared.source.endpoint.path,
                    payloadPath: prepared.item.payloadPath,
                    pendingPath: prepared.pendingPath,
                    metadataPath: prepared.metadataPath,
                    metadata: JSON.stringify(prepared.item)
                }))), 'utf8')
                : Buffer.from(`${preparedItems.flatMap(prepared => [
                    prepared.item.id, prepared.source.endpoint.path, prepared.item.payloadPath, prepared.pendingPath, prepared.metadataPath, JSON.stringify(prepared.item)
                ]).join('\0')}\0`, 'utf8');
            const output = await this.withSshClient(first.endpoint, client => this.execRemoteWithInput(client, command, input, windowsPath
                ? {}
                : { inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS, inactivityMessage: 'Recycle-bin batch move produced no progress.' }));
            moveResults = parseRemoteTrashMoveResults(output, windowsPath);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            moveResults = preparedItems.map(prepared => ({ id: prepared.item.id, ok: false, message }));
        }
        const moveResultById = new Map(moveResults.map(result => [result.id, result]));
        for (const prepared of preparedItems) {
            const moveResult = moveResultById.get(prepared.item.id) ?? { id: prepared.item.id, ok: false, message: 'Remote move returned no result.' };
            if (!moveResult.ok) {
                results.push({ id: prepared.item.id, path: prepared.source.endpoint.path, ok: false, message: moveResult.message ?? 'Remote move failed.' });
                continue;
            }
            this.rememberTrashRoot(deviceIdentity, prepared.item.trashRoot);
            this.clearRemoteDirectoryListingCache(prepared.source.endpoint);
            results.push({ id: prepared.item.id, path: prepared.source.endpoint.path, ok: true, message: 'Moved to recycle bin.' });
        }
        return results;
    }
    async listRemoteTrashItems(device) {
        const connection = device.connection;
        if (!connection) {
            throw new Error('SSH recycle-bin operations require a connection.');
        }
        const deviceIdentity = getTurboFileTrashDeviceIdentity(device);
        const endpoint = { kind: 'ssh', path: device.windows ? 'C:\\' : '/', connection, label: device.label };
        const rememberedRoots = [...(this.trashRootsByDeviceIdentity.get(deviceIdentity) ?? [])];
        const windowsPath = !!device.windows;
        const command = windowsPath
            ? buildWindowsTrashListCommand(deviceIdentity, rememberedRoots)
            : buildPosixTrashListCommand(rememberedRoots);
        const output = await this.withDirectorySshClient(endpoint, client => this.execRemoteBytes(client, command, {
            inactivityTimeoutMs: REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS,
            inactivityMessage: 'Recycle-bin metadata listing produced no output.'
        }));
        const records = parseRemoteTrashMetadataRecords(output, windowsPath);
        const items = [];
        const pending = [];
        const seenIds = new Set();
        for (const record of records) {
            try {
                const parsed = JSON.parse(record.metadata);
                if (!isTurboFileTrashMetadata(parsed) || parsed.deviceIdentity !== deviceIdentity || !this.isSafeTrashItem(parsed)) {
                    continue;
                }
                const isPending = record.metadataPath.endsWith('.pending.json');
                const expectedMetadataPath = joinRemotePath(joinRemotePath(parsed.trashRoot, 'info'), `${parsed.id}${isPending ? '.pending' : ''}.json`);
                if (!trashPathsEqual(record.metadataPath, expectedMetadataPath, windowsPath) || seenIds.has(parsed.id)) {
                    continue;
                }
                this.rememberTrashRoot(deviceIdentity, parsed.trashRoot);
                seenIds.add(parsed.id);
                if (isPending) {
                    pending.push({ item: parsed, metadataPath: record.metadataPath });
                }
                else {
                    items.push(parsed);
                }
            }
            catch {
                // Keep corrupt remote metadata untouched for diagnosis.
            }
        }
        if (pending.length) {
            const recoveredIds = await this.recoverRemotePendingTrashItemsNative(endpoint, pending, windowsPath);
            for (const value of pending) {
                if (recoveredIds.has(value.item.id)) {
                    items.push(value.item);
                }
            }
        }
        return items;
    }
    async recoverRemotePendingTrashItemsNative(endpoint, pending, windowsPath) {
        const command = windowsPath ? buildWindowsTrashPendingRecoveryCommand() : buildPosixTrashPendingRecoveryCommand();
        const input = windowsPath
            ? Buffer.from(JSON.stringify(pending.map(value => ({ id: value.item.id, sourcePath: value.item.originalPath, payloadPath: value.item.payloadPath, pendingPath: value.metadataPath, metadataPath: joinRemotePath(joinRemotePath(value.item.trashRoot, 'info'), `${value.item.id}.json`) }))), 'utf8')
            : Buffer.from(`${pending.flatMap(value => [value.item.id, value.item.originalPath, value.item.payloadPath, value.metadataPath, joinRemotePath(joinRemotePath(value.item.trashRoot, 'info'), `${value.item.id}.json`)]).join('\0')}\0`, 'utf8');
        const output = await this.withDirectorySshClient(endpoint, client => this.execRemoteWithInput(client, command, input, { timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS }));
        return new Set(parseRemoteTrashMoveResults(output, windowsPath).filter(result => result.ok).map(result => result.id));
    }
    async restoreRemoteTrashItem(device, item, conflictPolicy) {
        const connection = device.connection;
        if (!connection) {
            throw new Error('SSH recycle-bin operations require a connection.');
        }
        const endpoint = { kind: 'ssh', path: item.payloadPath, connection, label: device.label };
        let targetPath = item.originalPath;
        await this.withDirectorySftp(endpoint, async (sftp) => {
            if (await this.remotePathExists(sftp, targetPath)) {
                if (conflictPolicy === 'cancel') {
                    return;
                }
                targetPath = await this.findRemoteKeepBothPath(sftp, targetPath);
            }
            await this.ensureRemoteDirectory(sftp, getRemoteParentPath(targetPath));
        });
        if (targetPath === item.originalPath) {
            const conflict = await this.withDirectorySftp(endpoint, sftp => this.remotePathExists(sftp, targetPath));
            if (conflict) {
                return { id: item.id, path: item.originalPath, ok: false, conflict: true, message: 'An item with the same name already exists.' };
            }
        }
        await this.moveRemotePathNative(endpoint, targetPath);
        await this.withDirectorySftp(endpoint, sftp => this.unlinkRemote(sftp, joinRemotePath(joinRemotePath(item.trashRoot, 'info'), `${item.id}.json`)));
        return { id: item.id, path: item.originalPath, restoredPath: targetPath, ok: true, message: 'Restored.' };
    }
    async findRemoteKeepBothPath(sftp, originalPath) {
        const parent = getRemoteParentPath(originalPath);
        const name = getTransferName(originalPath);
        for (let ordinal = 1; ordinal < 10000; ordinal++) {
            const candidate = joinRemotePath(parent, createTurboFileKeepBothName(name, ordinal));
            if (!await this.remotePathExists(sftp, candidate)) {
                return candidate;
            }
        }
        throw new Error('Unable to create a unique restore name.');
    }
    async resolveRemoteTrashRoots(endpoint, probePaths) {
        const input = createTarNullListBuffer(probePaths);
        const output = await this.withSshClient(endpoint, client => this.execRemoteWithInput(client, buildPosixTrashRootBatchCommand(), input, {
            inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS,
            inactivityMessage: 'Recycle-bin filesystem detection produced no progress.'
        }));
        const fields = output.toString('utf8').split('\0');
        const roots = new Map();
        for (let index = 0; index + 2 < fields.length; index += 3) {
            const probePath = fields[index];
            const volumeId = fields[index + 1];
            const trashRoot = fields[index + 2];
            if (probePath && volumeId && trashRoot) {
                roots.set(probePath, { trashRoot, volumeId });
            }
        }
        return roots;
    }
    async resolveRemoteTrashRoot(endpoint, deviceIdentity) {
        if (looksLikeWindowsPath(endpoint.path)) {
            const uncMatch = /^(\\\\[^\\]+\\[^\\]+)(?:\\|$)/.exec(endpoint.path);
            if (uncMatch) {
                const userKey = createHash('sha256').update(deviceIdentity).digest('hex').slice(0, 12);
                return {
                    trashRoot: `${uncMatch[1]}\\.turbofile-trash-${userKey}\\turbofile`,
                    volumeId: uncMatch[1].toLowerCase()
                };
            }
            const drive = endpoint.path.slice(0, 1).toUpperCase();
            const userKey = createHash('sha256').update(deviceIdentity).digest('hex').slice(0, 12);
            return { trashRoot: `${drive}:\\.turbofile-trash-${userKey}\\turbofile`, volumeId: drive };
        }
        const details = await this.withSshClient(endpoint, async (client) => {
            const command = [
                'set -eu',
                `p=${quotePosixShellArg(endpoint.path)}`,
                'mount_point="$(findmnt -T "$p" -n -o TARGET 2>/dev/null || df -P "$p" | awk \'NR==2 { print $6 }\')"',
                'home_point="$(findmnt -T "$HOME" -n -o TARGET 2>/dev/null || df -P "$HOME" | awk \'NR==2 { print $6 }\')"',
                'printf "%s\\n%s\\n%s\\n%s\\n" "$mount_point" "$home_point" "$(id -u)" "$HOME"'
            ].join('; ');
            return (await this.execRemoteBytes(client, command)).toString('utf8').split(/\r?\n/);
        });
        const mountPoint = details[0]?.trim();
        const homeMountPoint = details[1]?.trim();
        const uid = details[2]?.trim();
        const homePath = details[3]?.trim();
        if (!mountPoint || !uid || (mountPoint === homeMountPoint && !homePath)) {
            throw new Error('Unable to resolve the source filesystem for the recycle bin.');
        }
        const trashRoot = mountPoint === homeMountPoint
            ? joinRemotePath(joinRemotePath(homePath, '.local/share/Trash'), 'turbofile')
            : joinRemotePath(joinRemotePath(mountPoint, `.Trash-${uid}`), 'turbofile');
        return { trashRoot, volumeId: mountPoint };
    }
    rememberTrashRoot(deviceIdentity, trashRoot) {
        let roots = this.trashRootsByDeviceIdentity.get(deviceIdentity);
        if (!roots) {
            roots = new Set();
            this.trashRootsByDeviceIdentity.set(deviceIdentity, roots);
        }
        roots.add(trashRoot);
    }
    isSafeTrashItem(item) {
        if (!item.id || !item.trashRoot || !item.payloadPath) {
            return false;
        }
        const windowsPath = looksLikeWindowsPath(item.trashRoot);
        const expectedPayloadPath = joinRemotePath(joinRemotePath(item.trashRoot, 'files'), item.id);
        return trashPathsEqual(item.payloadPath, expectedPayloadPath, windowsPath);
    }
    async deleteTrashItemsNative(device, items) {
        if (device.kind === 'local') {
            const workerLimit = items.some(item => item.type === 'directory') ? BATCH_TRANSFER_DIRECTORY_WORKERS : BATCH_TRANSFER_WORKERS;
            return mapLimit(items, workerLimit, async (item) => {
                try {
                    await fsp.rm(item.payloadPath, { recursive: true, force: true });
                    await fsp.rm(join(item.trashRoot, 'info', `${item.id}.json`), { force: true });
                    return { id: item.id, path: item.originalPath, ok: true, message: 'Permanently deleted.' };
                }
                catch (error) {
                    return { id: item.id, path: item.originalPath, ok: false, message: error instanceof Error ? error.message : String(error) };
                }
            });
        }
        if (!device.connection) {
            return items.map(item => ({ id: item.id, path: item.originalPath, ok: false, message: 'SSH recycle-bin operations require a connection.' }));
        }
        const windowsPath = !!device.windows || looksLikeWindowsPath(items[0].payloadPath);
        const endpoint = { kind: 'ssh', path: items[0].payloadPath, connection: device.connection, label: device.label };
        try {
            const command = windowsPath ? buildWindowsTrashDeleteBatchCommand() : buildPosixTrashDeleteBatchCommand();
            const input = windowsPath
                ? Buffer.from(JSON.stringify(items.map(item => ({ id: item.id, payloadPath: item.payloadPath, metadataPath: joinRemotePath(joinRemotePath(item.trashRoot, 'info'), `${item.id}.json`) }))), 'utf8')
                : Buffer.from(`${items.flatMap(item => [item.id, item.payloadPath, joinRemotePath(joinRemotePath(item.trashRoot, 'info'), `${item.id}.json`)]).join('\0')}\0`, 'utf8');
            const output = await this.withDirectorySshClient(endpoint, client => this.execRemoteWithInput(client, command, input, windowsPath
                ? {}
                : { inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS, inactivityMessage: 'Recycle-bin deletion produced no progress.' }));
            const remoteResults = new Map(parseRemoteTrashMoveResults(output, windowsPath).map(result => [result.id, result]));
            return items.map(item => {
                const result = remoteResults.get(item.id);
                return {
                    id: item.id,
                    path: item.originalPath,
                    ok: result?.ok === true,
                    message: result?.ok ? 'Permanently deleted.' : result?.message ?? 'Remote delete returned no result.'
                };
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return items.map(item => ({ id: item.id, path: item.originalPath, ok: false, message }));
        }
    }
    async emptyTrashNative(device) {
        if (device.kind === 'local') {
            try {
                const deviceIdentity = getTurboFileTrashDeviceIdentity(device);
                const roots = await this.getLocalTrashRoots(deviceIdentity);
                const counts = await Promise.all([...roots].map(async (trashRoot) => {
                    const infoDirectory = join(trashRoot, 'info');
                    const count = await fsp.readdir(infoDirectory).then(entries => entries.filter(entry => entry.endsWith('.json')).length, () => 0);
                    await Promise.all([
                        fsp.rm(join(trashRoot, 'files'), { recursive: true, force: true }),
                        fsp.rm(infoDirectory, { recursive: true, force: true })
                    ]);
                    return count;
                }));
                const completed = counts.reduce((total, count) => total + count, 0);
                return { ok: true, message: completed ? 'Recycle bin emptied.' : 'Recycle bin is empty.', completed, failed: 0, results: [] };
            }
            catch (error) {
                return { ok: false, message: error instanceof Error ? error.message : String(error), completed: 0, failed: 1, results: [] };
            }
        }
        if (!device.connection) {
            return { ok: false, message: 'SSH recycle-bin operations require a connection.', completed: 0, failed: 1, results: [] };
        }
        const deviceIdentity = getTurboFileTrashDeviceIdentity(device);
        const rememberedRoots = [...(this.trashRootsByDeviceIdentity.get(deviceIdentity) ?? [])];
        const windowsPath = !!device.windows;
        const endpoint = { kind: 'ssh', path: windowsPath ? 'C:\\' : '/', connection: device.connection, label: device.label };
        try {
            const command = windowsPath
                ? buildWindowsTrashEmptyCommand(deviceIdentity, rememberedRoots)
                : buildPosixTrashEmptyCommand(rememberedRoots);
            const output = await this.withDirectorySshClient(endpoint, client => this.execRemoteBytes(client, command, windowsPath
                ? {}
                : { inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS, inactivityMessage: 'Remote recycle-bin emptying produced no progress.' }));
            const completed = parseSizeCommandOutput(output.toString());
            return { ok: true, message: completed ? 'Recycle bin emptied.' : 'Recycle bin is empty.', completed, failed: 0, results: [] };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error), completed: 0, failed: 1, results: [] };
        }
    }
    async hasTrashItemsNative(device) {
        const deviceIdentity = getTurboFileTrashDeviceIdentity(device);
        if (device.kind === 'local') {
            const roots = await this.getLocalTrashRoots(deviceIdentity);
            const states = await Promise.all([...roots].map(trashRoot => fsp.readdir(join(trashRoot, 'info')).then(entries => entries.some(entry => entry.endsWith('.json')), () => false)));
            return states.some(Boolean);
        }
        if (!device.connection) {
            throw new Error('SSH recycle-bin operations require a connection.');
        }
        const rememberedRoots = [...(this.trashRootsByDeviceIdentity.get(deviceIdentity) ?? [])];
        const windowsPath = !!device.windows;
        const endpoint = { kind: 'ssh', path: windowsPath ? 'C:\\' : '/', connection: device.connection, label: device.label };
        const command = windowsPath
            ? buildWindowsTrashHasItemsCommand(deviceIdentity, rememberedRoots)
            : buildPosixTrashHasItemsCommand(rememberedRoots);
        const output = await this.withDirectorySshClient(endpoint, client => this.execRemoteBytes(client, command, { timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS }));
        return output.toString('utf8').trim() === '1';
    }
    async remotePathExists(sftp, path) {
        try {
            await this.remoteStat(sftp, path);
            return true;
        }
        catch {
            return false;
        }
    }
    async deletePath(endpoint, recursive = true) {
        return this.fileOperationQueue.run([getFileOperationDeviceKey(endpoint)], () => this.deletePathCore(endpoint, recursive));
    }
    async deletePathCore(endpoint, recursive = true) {
        try {
            if (endpoint.kind === 'local') {
                await fsp.rm(endpoint.path, { recursive, force: true });
            }
            else {
                try {
                    await this.deleteRemotePathNative(endpoint, recursive);
                }
                catch (error) {
                    if (error instanceof Error && error.message === 'Refusing to delete a filesystem root.') {
                        throw error;
                    }
                    await this.withSftp(endpoint, async (sftp) => {
                        const stats = await this.remoteStat(sftp, endpoint.path);
                        if (stats.isDirectory()) {
                            await this.deleteRemoteDirectory(sftp, endpoint.path);
                        }
                        else {
                            await this.unlinkRemote(sftp, endpoint.path);
                        }
                    });
                }
            }
            this.clearRemoteDirectoryListingCache(endpoint);
            return { ok: true, message: 'Path deleted.' };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    async deletePaths(endpoints, recursive = true) {
        return this.fileOperationQueue.run(getFileOperationDeviceKeys(...endpoints), () => this.deletePathsCore(endpoints, recursive));
    }
    async deletePathsCore(endpoints, recursive = true) {
        const targets = endpoints.filter(endpoint => !!endpoint.path);
        if (!targets.length) {
            return { ok: true, message: 'Nothing to delete.' };
        }
        if (targets.length === 1) {
            return this.deletePathCore(targets[0], recursive);
        }
        try {
            const first = targets[0];
            if (first.kind === 'local') {
                const workerLimit = recursive ? BATCH_TRANSFER_DIRECTORY_WORKERS : BATCH_TRANSFER_WORKERS;
                await mapLimit(targets, workerLimit, endpoint => fsp.rm(endpoint.path, { recursive, force: true }));
                for (const endpoint of targets) {
                    this.clearRemoteDirectoryListingCache(endpoint);
                }
                return { ok: true, message: 'Paths deleted.' };
            }
            for (const endpoint of targets) {
                this.assertSafeDeletePath(endpoint.path);
            }
            if (looksLikeWindowsPath(first.path)) {
                const input = Buffer.from(JSON.stringify(targets.map(endpoint => endpoint.path)), 'utf8');
                await this.withSshClient(first, client => this.execRemoteWithInput(client, buildWindowsDeleteManyFromInputCommand(recursive), input));
            }
            else {
                // POSIX remote: feed the NUL-delimited paths to `xargs -0 rm` in a single round trip;
                // xargs batches the actual rm invocations server-side so this scales to any selection
                // size without ever hitting the shell's argument-length limit.
                const input = createTarNullListBuffer(targets.map(endpoint => endpoint.path));
                await this.withSshClient(first, client => this.execRemoteWithInput(client, buildPosixDeleteManyFromInputCommand(recursive), input, {
                    inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS,
                    inactivityMessage: 'Remote POSIX batch delete produced no progress.'
                }));
            }
            this.clearRemoteDirectoryListingCache(first);
            return { ok: true, message: 'Paths deleted.' };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    async deleteRemotePathNative(endpoint, recursive) {
        this.assertSafeDeletePath(endpoint.path);
        const command = looksLikeWindowsPath(endpoint.path)
            ? buildWindowsDeleteCommand(endpoint.path, recursive)
            : buildPosixDeleteCommand(endpoint.path, recursive);
        await this.withSshClient(endpoint, client => this.execRemote(client, command));
    }
    assertSafeDeletePath(path) {
        const trimmed = path.trim();
        const normalized = trimmed.replace(/[\\/]+$/, '');
        if (!trimmed || trimmed === '/' || trimmed === '\\' || normalized === '' || /^[A-Za-z]:$/.test(normalized)) {
            throw new Error('Refusing to delete a filesystem root.');
        }
    }
    async renamePath(endpoint, targetPath) {
        return this.fileOperationQueue.run(getFileOperationDeviceKeys(endpoint), () => this.renamePathCore(endpoint, targetPath));
    }
    async renamePathCore(endpoint, targetPath) {
        try {
            if (endpoint.kind === 'local') {
                await this.moveLocalPathNative(endpoint.path, targetPath);
            }
            else {
                await this.moveRemotePathNative(endpoint, targetPath);
            }
            this.clearRemoteDirectoryListingCache(endpoint);
            this.clearRemoteDirectoryListingCache(endpoint, targetPath);
            return { ok: true, message: 'Path renamed.' };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    async movePathsIntoDirectory(sources, targetDirectory) {
        return this.fileOperationQueue.run(getFileOperationDeviceKeys(...sources), () => this.movePathsIntoDirectoryCore(sources, targetDirectory));
    }
    async movePathsIntoDirectoryCore(sources, targetDirectory) {
        const targets = sources.filter(endpoint => !!endpoint.path);
        if (!targets.length) {
            return { ok: true, message: 'Nothing to move.' };
        }
        const first = targets[0];
        const windowsPath = looksLikeWindowsPath(targetDirectory) || looksLikeWindowsPath(first.path);
        try {
            if (first.kind === 'local') {
                await mapLimit(targets, BATCH_TRANSFER_WORKERS, endpoint => this.moveLocalPathNative(endpoint.path, joinRemotePath(targetDirectory, getTransferName(endpoint.path))));
            }
            else if (windowsPath) {
                // Windows remote: move each into the directory. Rare path, kept simple for correctness.
                for (const endpoint of targets) {
                    await this.moveRemotePathNative(endpoint, joinRemotePath(targetDirectory, getTransferName(endpoint.path)));
                }
            }
            else {
                // POSIX remote: a single round trip moves the whole selection. The NUL-delimited sources
                // are fed to `xargs -0`, which runs `mv -- <files> <dir>` server-side (batching as needed
                // to stay under the argument-length limit), so a 1000-file move is one near-instant rename
                // instead of 1000 separate SSH round trips. `mv` drops each file into <dir> under its own
                // name, so no per-file target path needs computing.
                const command = buildPosixMoveManyIntoDirectoryFromInputCommand(targetDirectory);
                const input = createTarNullListBuffer(targets.map(endpoint => endpoint.path));
                await this.withSshClient(first, client => this.execRemoteWithInput(client, command, input, {
                    inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS,
                    inactivityMessage: 'Remote POSIX batch move produced no progress.'
                }));
            }
            this.clearRemoteDirectoryListingCache(first);
            this.clearRemoteDirectoryListingCache(first, targetDirectory);
            return { ok: true, message: 'Paths moved.' };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    async calculatePathSize(endpoint) {
        try {
            const size = endpoint.kind === 'local'
                ? await getLocalPathSizeByCommand(endpoint.path)
                : await this.getRemotePathSizeByCommand(endpoint);
            const humanSize = await this.getPathHumanSize(endpoint, size);
            return { ok: true, message: 'Path size calculated.', size, humanSize };
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
                size: 0
            };
        }
    }
    async readWindowsClipboardFiles() {
        try {
            const paths = await readWindowsClipboardFilePaths();
            return {
                ok: paths.length > 0,
                message: paths.length > 0 ? 'Windows clipboard files loaded.' : 'No Windows files in clipboard.',
                paths,
                operation: readWindowsClipboardOperation()
            };
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
                paths: [],
                operation: 'copy'
            };
        }
    }
    async startWindowsFileDrag(request) {
        if (platform() !== 'win32') {
            return { ok: false, message: 'Windows file drag is only supported on Windows.' };
        }
        if (!isValidWindowsDragToken(request.sessionId)) {
            return { ok: false, message: 'Invalid Windows drag session.' };
        }
        if (this.activeWindowsDragSessions.has(request.sessionId)) {
            return { ok: false, message: 'Windows drag session is already active.' };
        }
        this.activeWindowsDragSessions.add(request.sessionId);
        try {
            const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed() && !candidate.webContents.isDestroyed());
            if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
                return { ok: false, message: 'No TurboFile window is available for Windows drag.' };
            }
            const operation = request.operation ?? 'copy';
            if (request.source.kind !== 'local' && request.source.kind !== 'ssh') {
                return { ok: false, message: 'Unsupported Windows drag source.' };
            }
            const useDirectLocalDrag = request.source.kind === 'local' && operation === 'copy';
            if (!useDirectLocalDrag) {
                return this.startCapturedWindowsFileDrag(request, window);
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
            }
            catch (error) {
                return {
                    ok: false,
                    message: error instanceof Error ? error.message : String(error)
                };
            }
        }
        finally {
            this.completedInternalWindowsDrags.delete(request.sessionId);
            this.activeWindowsDragSessions.delete(request.sessionId);
        }
    }
    async completeWindowsFileDrag(sessionId) {
        if (this.activeWindowsDragSessions.has(sessionId)) {
            this.completedInternalWindowsDrags.add(sessionId);
        }
    }
    async startCapturedWindowsFileDrag(request, window) {
        if (request.source.kind === 'ssh' && !request.source.connection) {
            return {
                ok: false,
                message: 'Missing SSH source connection for Windows drag.'
            };
        }
        if (!request.items.length) {
            return { ok: false, message: 'No SSH files are available to drag.' };
        }
        const token = request.sessionId;
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
            const targetDirectory = await this.waitForWindowsDragCopyHookTarget(paths.targetFile, fakeDirectoryName, token);
            if (!targetDirectory) {
                return { ok: true, message: 'Windows drag completed inside TurboFile.', internal: true };
            }
            return { ok: true, message: 'Windows drop target captured.', targetDirectory };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                message,
                canceled: message.includes('timed out')
            };
        }
        finally {
            await fsp.rm(paths.activeRoot, { recursive: true, force: true }).catch(() => undefined);
            await fsp.rm(paths.targetFile, { force: true }).catch(() => undefined);
        }
    }
    getWindowsDragCopyHookPaths(token, fakeDirectoryName) {
        const root = this.getWindowsDragCopyHookRoot();
        const activeRoot = join(root, TURBOFILE_WINDOWS_DRAG_ACTIVE_DIR, token);
        return {
            activeRoot,
            fakeDirectory: join(activeRoot, fakeDirectoryName),
            targetFile: join(root, TURBOFILE_WINDOWS_DRAG_TARGETS_DIR, `${token}.target`)
        };
    }
    getWindowsDragCopyHookRoot() {
        const localAppData = process.env.LOCALAPPDATA;
        if (!localAppData) {
            throw new Error('LOCALAPPDATA is required for SSH drag to Windows.');
        }
        return join(localAppData, TURBOFILE_WINDOWS_DRAG_APP_DIR, TURBOFILE_WINDOWS_DRAG_ROOT_DIR);
    }
    async waitForWindowsDragCopyHookTarget(targetFile, fakeDirectoryName, sessionId, timeoutMs = WINDOWS_DRAG_TARGET_SETTLE_MS) {
        const deadline = Date.now() + timeoutMs;
        const desktopFallbackDirs = this.getWindowsDragDesktopFallbackDirs();
        while (Date.now() < deadline) {
            if (this.completedInternalWindowsDrags.has(sessionId)) {
                return undefined;
            }
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
            }
            catch (error) {
                if (error.code !== 'ENOENT') {
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
                }
                catch {
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
    async getLocalDesktopPath() {
        try {
            const desktop = app.getPath('desktop');
            if (desktop) {
                return desktop;
            }
        }
        catch {
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
    getWindowsDragDesktopFallbackDirs() {
        const dirs = [];
        const add = (dir) => {
            if (dir && !dirs.some(existing => existing.toLowerCase() === dir.toLowerCase())) {
                dirs.push(dir);
            }
        };
        try {
            add(app.getPath('desktop'));
        }
        catch {
            // Electron could not resolve the desktop; fall back to the profile path below.
        }
        if (process.env.USERPROFILE) {
            add(join(process.env.USERPROFILE, 'Desktop'));
        }
        return dirs;
    }
    async ensureWindowsDragCopyHookRegistered() {
        if (!this.windowsDragCopyHookRegistrationPromise) {
            this.windowsDragCopyHookRegistrationPromise = this.registerWindowsDragCopyHook().catch(error => {
                this.windowsDragCopyHookRegistrationPromise = undefined;
                throw error;
            });
        }
        await this.windowsDragCopyHookRegistrationPromise;
    }
    async registerWindowsDragCopyHook() {
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
    async ensureWindowsExplorerLoadedDragCopyHook(dllPath) {
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
    async getWindowsDragCopyHookDllSignature(dllPath) {
        const stat = await fsp.stat(dllPath).catch(() => undefined);
        return stat ? `${dllPath}|${stat.size}|${Math.round(stat.mtimeMs)}` : dllPath;
    }
    async restartWindowsExplorer() {
        // Stop every Explorer shell instance and relaunch one so the new shell process reads the
        // freshly-registered CopyHook handler. Best-effort: never let a shell hiccup fail a transfer.
        await runLocalPowerShellScript('Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }').catch(() => undefined);
        await delay(1200);
    }
    resolveWindowsDragCopyHookDllPath() {
        const resourcesPath = process.resourcesPath;
        const candidates = [
            join(process.cwd(), 'resources', 'turbofile', 'drag-ext', 'x64', 'TurboFileDragExt.dll'),
            join(app.getAppPath(), 'resources', 'turbofile', 'drag-ext', 'x64', 'TurboFileDragExt.dll'),
            resourcesPath ? join(resourcesPath, 'app', 'resources', 'turbofile', 'drag-ext', 'x64', 'TurboFileDragExt.dll') : undefined,
            resourcesPath ? join(resourcesPath, 'resources', 'turbofile', 'drag-ext', 'x64', 'TurboFileDragExt.dll') : undefined
        ].filter((candidate) => !!candidate);
        const found = candidates.find(candidate => existsSync(candidate));
        if (!found) {
            throw new Error(`TurboFile Windows drag extension DLL was not found. Run scripts\\build-turbofile-drag-ext.ps1. Checked: ${candidates.join(', ')}`);
        }
        return found;
    }
    async readFile(endpoint, options = {}) {
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
        }
        catch (error) {
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
    async readImage(endpoint, options = {}) {
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
        }
        catch (error) {
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
    async readImageBatch(endpoint, paths, maxWidth = 0) {
        const targets = [...new Set(paths.filter(path => !!path))];
        if (!targets.length) {
            return [];
        }
        if (endpoint.kind !== 'ssh' || !endpoint.connection) {
            return Promise.all(targets.map(async (path) => {
                try {
                    const stat = await fsp.stat(path);
                    if (stat.size > IMAGE_BATCH_MAX_FILE_BYTES) {
                        return { path, ok: false, oversized: true };
                    }
                    const buffer = await fsp.readFile(path);
                    return { path, ok: true, content: buffer.toString('base64'), mime: getMimeType(path) };
                }
                catch (error) {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return targets.map(path => ({ path, ok: false, message, transient: true }));
        }
        finally {
            this.releaseImageReadSlot();
        }
    }
    async readImageMetadataBatch(endpoint, paths) {
        const targets = [...new Set(paths.filter(path => !!path))];
        if (!targets.length) {
            return [];
        }
        if (endpoint.kind !== 'ssh' || !endpoint.connection) {
            const entries = await mapLimit(targets, IMAGE_METADATA_LOCAL_CONCURRENCY, async (path) => {
                try {
                    const stat = await fsp.stat(path);
                    const headerLength = Math.min(stat.size, IMAGE_METADATA_HEADER_BYTES);
                    const bytes = Buffer.alloc(headerLength);
                    let bytesRead = 0;
                    if (headerLength > 0) {
                        const handle = await fsp.open(path, 'r');
                        try {
                            while (bytesRead < headerLength) {
                                const chunk = await handle.read(bytes, bytesRead, headerLength - bytesRead, bytesRead);
                                if (chunk.bytesRead <= 0) {
                                    break;
                                }
                                bytesRead += chunk.bytesRead;
                            }
                        }
                        finally {
                            await handle.close();
                        }
                    }
                    const parsed = readTurboFileImageDimensions(path, bytes.subarray(0, bytesRead));
                    return { path, size: stat.size, modified: stat.mtimeMs, ...(parsed ? { width: parsed.width, height: parsed.height } : {}) };
                }
                catch {
                    return undefined;
                }
            });
            return entries.filter((entry) => !!entry);
        }
        const chunks = chunkImageMetadataPaths(targets);
        return this.withDirectorySshClient(endpoint, async (client) => {
            const chunkEntries = await mapLimit(chunks, IMAGE_METADATA_REMOTE_CONCURRENCY, async (chunk) => {
                let lastError;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        if (looksLikeWindowsPath(chunk[0])) {
                            const output = await this.execRemoteBytes(client, buildWindowsReadImageMetadataBatchCommand(chunk, IMAGE_METADATA_HEADER_BYTES), { timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS });
                            return parseWindowsImageMetadataBatchOutput(output);
                        }
                        const output = await this.execRemoteBytes(client, buildPosixReadImageMetadataBatchCommand(chunk, IMAGE_METADATA_HEADER_BYTES), {
                            inactivityTimeoutMs: REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS,
                            inactivityMessage: 'Image metadata batch read produced no output.',
                            timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS
                        });
                        return parseTurboFileImageMetadataFrames(output);
                    }
                    catch (error) {
                        lastError = error;
                    }
                }
                throw lastError instanceof Error ? lastError : new Error('Image metadata batch read failed.');
            });
            return chunkEntries.flat();
        });
    }
    async createImageResource(endpoint, options = {}) {
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
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
                mime: getMimeType(endpoint.path)
            };
        }
    }
    async releaseImageResource(url) {
        const token = this.getImageResourceToken(url);
        if (token) {
            this.imageResourceDescriptors.delete(token);
        }
    }
    ensureTurboFileImageProtocolRegistered() {
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
    async handleTurboFileImageProtocolRequest(request) {
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
            const body = result.buffer.buffer.slice(result.buffer.byteOffset, result.buffer.byteOffset + result.buffer.byteLength);
            return new Response(body, {
                status: 200,
                headers: {
                    'Content-Type': result.mime || getMimeType(descriptor.endpoint.path),
                    'Cache-Control': 'no-store'
                }
            });
        }
        catch (error) {
            return new Response(error instanceof Error ? error.message : String(error), { status: 500 });
        }
    }
    getImageResourceToken(url) {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== `${TURBOFILE_IMAGE_RESOURCE_SCHEME}:`) {
                return undefined;
            }
            const token = parsed.hostname || parsed.pathname.replace(/^\/+/, '').split('/')[0];
            return token ? decodeURIComponent(token) : undefined;
        }
        catch {
            return undefined;
        }
    }
    ensureImageResourceCleanupTimer() {
        if (this.imageResourceCleanupTimer) {
            return;
        }
        this.imageResourceCleanupTimer = setInterval(() => this.trimExpiredImageResources(Date.now()), IMAGE_RESOURCE_CLEANUP_INTERVAL_MS);
        this.imageResourceCleanupTimer.unref?.();
    }
    trimExpiredImageResources(now) {
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
    async writeClipboardImage(content, mime, encoding = 'base64') {
        try {
            const buffer = Buffer.from(content, encoding);
            const image = nativeImage.createFromBuffer(buffer);
            if (image.isEmpty()) {
                return { ok: false, message: `无法解析图片数据：${mime || 'unknown'}` };
            }
            clipboard.writeImage(image);
            return { ok: true, message: 'Image copied to clipboard.' };
        }
        catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error)
            };
        }
    }
    async writeFile(endpoint, content, encoding = 'utf8') {
        return this.fileOperationQueue.run(getFileOperationDeviceKeys(endpoint), () => this.writeFileCore(endpoint, content, encoding));
    }
    async writeFileCore(endpoint, content, encoding) {
        const buffer = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
        try {
            if (endpoint.kind === 'local') {
                await fsp.mkdir(dirname(endpoint.path), { recursive: true });
                await fsp.writeFile(endpoint.path, buffer);
            }
            else {
                const tempRoot = join(tmpdir(), `turbofile-write-${randomUUID()}`);
                const tempPath = join(tempRoot, basename(endpoint.path) || 'content');
                try {
                    await fsp.mkdir(tempRoot, { recursive: true });
                    await fsp.writeFile(tempPath, buffer);
                    // Reuse the open directory session rather than opening a fresh SSH connection per call,
                    // so creating/saving a file on a high-latency remote host is not gated on a handshake.
                    await this.withDirectorySftp(endpoint, async (sftp) => {
                        await this.ensureRemoteDirectory(sftp, getRemoteParentPath(endpoint.path));
                        await this.fastPut(sftp, tempPath, endpoint.path, this.createSftpTransferOptions());
                    });
                }
                finally {
                    await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
                }
            }
            this.clearRemoteDirectoryListingCache(endpoint);
            return { ok: true, message: 'File saved.' };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    async compressPath(endpoint, targetPath) {
        return this.fileOperationQueue.run(getFileOperationDeviceKeys(endpoint), () => this.compressPathCore(endpoint, targetPath));
    }
    async compressPathCore(endpoint, targetPath) {
        try {
            const archivePath = targetPath ?? getDefaultArchivePath(endpoint.path, endpoint.kind === 'local' ? 'zip' : 'tar.gz');
            if (endpoint.kind === 'local') {
                await runLocalCommand('tar.exe', [...await this.getLocalTarCharsetArgs(), '-a', '-cf', archivePath, '-C', dirname(endpoint.path), basename(endpoint.path)]);
            }
            else {
                await this.withSshClient(endpoint, client => this.execRemote(client, `mkdir -p ${quotePosixShellArg(getRemoteParentPath(archivePath))} && tar -czf ${quotePosixShellArg(archivePath)} -C ${quotePosixShellArg(getRemoteParentPath(endpoint.path))} ${quotePosixShellArg(getTransferName(endpoint.path))}`));
            }
            this.clearRemoteDirectoryListingCache(endpoint, archivePath);
            return { ok: true, message: `Archive created: ${archivePath}` };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    async extractPath(endpoint, targetDirectory) {
        return this.fileOperationQueue.run(getFileOperationDeviceKeys(endpoint), () => this.extractPathCore(endpoint, targetDirectory));
    }
    async extractPathCore(endpoint, targetDirectory) {
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
            }
            else {
                const quotedArchive = quotePosixShellArg(endpoint.path);
                const outputSetup = `out=${quotePosixShellArg(outputDirectory)}; if [ -e "$out" ] && [ ! -d "$out" ]; then out="$out"_extracted; fi; mkdir -p "$out"`;
                const command = `${outputSetup} && ${buildTurboFileRemoteExtractCommand(endpoint.path, quotedArchive)}`;
                await this.withSshClient(endpoint, client => this.execRemote(client, command));
            }
            this.clearRemoteDirectoryListingCache(endpoint, outputDirectory);
            return { ok: true, message: `Archive extracted: ${outputDirectory}` };
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
    async createSshTerminal(options, cwd, cols, rows) {
        const configResult = await this.createConnectConfig(options);
        if (!configResult.ok) {
            throw new Error(configResult.message);
        }
        // Use a dedicated connection per terminal instead of reusing the directory-browsing client.
        // Sharing coupled the terminal's lifetime to the directory session's idle timer, so an
        // unrelated idle eviction could close the client mid-task and kill the terminal. A dedicated
        // connection lives until the user closes the terminal (or a real network failure).
        const client = await this.connect(configResult.config);
        let stream;
        try {
            stream = await this.openShell(client, cols, rows);
            const sessionId = randomUUID();
            const session = {
                client,
                stream,
                dataEmitter: new Emitter(),
                exitEmitter: new Emitter(),
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
                            }
                            else {
                                session.dataBuffer.push(remaining);
                            }
                        }
                    }
                    return;
                }
                if (session.hasDataListener) {
                    session.dataEmitter.fire(chunk);
                }
                else {
                    session.dataBuffer.push(chunk);
                }
            });
            stream.on('error', error => {
                const chunk = `\r\n极速传 SSH terminal error: ${error.message}\r\n`;
                if (session.hasDataListener) {
                    session.dataEmitter.fire(chunk);
                }
                else {
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
        }
        catch (error) {
            stream?.end();
            client.end();
            throw error;
        }
    }
    async writeSshTerminal(sessionId, data) {
        const session = this.terminalSessions.get(sessionId);
        if (!session || session.closed) {
            return;
        }
        session.stream.write(data);
    }
    async resizeSshTerminal(sessionId, cols, rows) {
        const session = this.terminalSessions.get(sessionId);
        if (!session || session.closed) {
            return;
        }
        session.stream.setWindow?.(rows, cols, 0, 0);
    }
    async shutdownSshTerminal(sessionId) {
        this.cleanupSshTerminalSession(sessionId, undefined);
    }
    async trySameRemoteCopy(request, startedAt) {
        if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
            return undefined;
        }
        if (!isSameSshConnection(request.source.connection, request.target.connection)) {
            return undefined;
        }
        this.throwIfTransferCanceled(request.progressId);
        const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown');
        const expectedBytes = sourceType === 'directory' ? 0 : Math.max(0, request.expectedBytes ?? 0);
        let bytes = expectedBytes;
        if (sourceType === 'file' && bytes <= 0) {
            bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => expectedBytes);
        }
        this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing remote copy.', true);
        const isWindowsCopy = looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path);
        const reportsNativeProgress = sourceType === 'directory' && !isWindowsCopy;
        const command = isWindowsCopy
            ? buildWindowsCopyCommand(request.source.path, request.target.path)
            : buildPosixCopyCommand(request.source.path, request.target.path, reportsNativeProgress);
        this.fireTransferProgress(request, 0, bytes, 'transfer', 'Remote copy in progress.', true);
        const observedBytes = await this.execRemoteCopyWithProgress(request, command, bytes, sourceType, reportsNativeProgress);
        this.throwIfTransferCanceled(request.progressId);
        return this.createTransferResult(true, 'remote-copy', bytes > 0 ? bytes : observedBytes, 'Remote copy completed.', startedAt, request.progressId);
    }
    async tryDirectTarTransfer(request, startedAt, forceProtocol = false) {
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
        const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown');
        if (sourceType !== 'directory') {
            return undefined;
        }
        const bytes = Math.max(0, request.expectedBytes ?? 0);
        return this.runVerifiedDirectRouteAttempt(request.source, request.target, request.progressId, 'tar-direct', route => this.tryDirectTarTransferRoute(request, startedAt, bytes, route));
    }
    async tryDirectTarTransferRoute(request, startedAt, expectedBytes, route) {
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
        let credential;
        let lastActivityAt = Date.now();
        const markActivity = () => {
            lastActivityAt = Date.now();
        };
        try {
            this.throwIfTransferCanceled(request.progressId);
            credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection, request.progressId);
            const remote = remoteEndpoint.connection;
            const remoteUserHost = `${remote.username}@${remote.host}`;
            const sshpassPrefix = buildSshpassPrefix(remote.password);
            const sshCommand = buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath);
            const command = route === 'source-push'
                ? buildTarSourcePushCommand(request.source.path, request.target.path, remoteUserHost, sshCommand, sshpassPrefix)
                : buildTarTargetPullCommand(request.source.path, request.target.path, remoteUserHost, sshCommand, sshpassPrefix);
            const tarProgress = this.createDirectTarProgressReporter(request, expectedBytes, 'Direct tar transfer in progress.', { strategy: 'tar-direct', route }, markActivity);
            const reportTarProgress = tarProgress.reportTarProgress;
            this.fireTransferProgress(request, 0, expectedBytes, 'prepare', 'Preparing direct tar transfer.', true, { strategy: 'tar-direct', route });
            this.markTransferDataStarted(request.progressId);
            await this.execRemote(client, command, {
                onStderr: reportTarProgress,
                inactivityTimeoutMs: DIRECT_TAR_STALL_TIMEOUT_MS,
                inactivityMessage: `Direct tar ${route} produced no stream progress for ${DIRECT_TAR_STALL_TIMEOUT_MS} ms.`,
                getActivityTime: () => lastActivityAt,
                progressId: request.progressId
            });
            this.throwIfTransferCanceled(request.progressId);
            if (expectedBytes > 0) {
                const targetSize = await this.getRemotePathContentSizeByCommand(request.target, request.progressId).catch(() => expectedBytes);
                this.throwIfTransferCanceled(request.progressId);
                if (targetSize !== expectedBytes) {
                    throw new Error(`Direct tar size mismatch: expected ${expectedBytes}, got ${targetSize}.`);
                }
            }
            const bytes = Math.max(expectedBytes, tarProgress.getTransferredBytes());
            this.fireTransferProgress(request, bytes, expectedBytes, 'complete', 'Direct tar completed.', true, { strategy: 'tar-direct', route });
            return this.createTransferResult(true, 'tar-direct', bytes, 'Direct tar completed.', startedAt, request.progressId);
        }
        catch (error) {
            if (this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            throw error;
        }
        finally {
            if (credential?.cleanupCommand) {
                await this.execRemote(client, credential.cleanupCommand, { timeoutMs: 2000 }).catch(() => undefined);
            }
            client.end();
        }
    }
    async tryDirectRsyncTransfer(request, startedAt, allowAutoFast = false) {
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
        return this.runVerifiedDirectRouteAttempt(request.source, request.target, request.progressId, 'rsync-direct', route => this.tryDirectRsyncTransferRoute(request, startedAt, route));
    }
    async tryDirectRsyncTransferRoute(request, startedAt, route) {
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
        const markActivity = () => {
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
            const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown');
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
                inactivityTimeoutMs: DIRECT_RSYNC_STALL_TIMEOUT_MS,
                inactivityMessage: `Direct rsync ${route} produced no transfer progress for ${DIRECT_RSYNC_STALL_TIMEOUT_MS} ms.`,
                getActivityTime: () => lastActivityAt,
                progressId: request.progressId
            });
            this.throwIfTransferCanceled(request.progressId);
            bytes = progress.getLastBytes() || Math.max(0, request.expectedBytes ?? 0);
            return this.createTransferResult(true, 'rsync-direct', bytes, 'Direct rsync completed.', startedAt, request.progressId);
        }
        catch (error) {
            if (this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            throw error;
        }
        finally {
            unregisterCancel();
            client.end();
        }
    }
    /**
     * Returns both direct routes, putting the most recently successful route first.
     */
    async resolveDirectSshRoutes(source, target, progressId) {
        if (source.kind !== 'ssh' || target.kind !== 'ssh' || !source.connection || !target.connection) {
            return [];
        }
        this.throwIfTransferCanceled(progressId);
        const preferred = this.directSshRouteCache.get(getDirectSshRouteCacheKey(source.connection, target.connection));
        return orderTurboFileDirectSshRoutes(preferred);
    }
    async runVerifiedDirectRouteAttempt(source, target, progressId, directStrategy, run) {
        const routes = await this.resolveDirectSshRoutes(source, target, progressId);
        const result = await runTurboFileDirectRouteFlow({
            routes,
            run: async (route, retry) => {
                this.throwIfTransferCanceled(progressId);
                if (retry) {
                    this.fireTransferProgress({ progressId }, 0, 0, 'prepare', '直连重试', true, { strategy: directStrategy, route });
                }
                this.throwIfTransferCanceled(progressId);
                try {
                    return await run(route, retry);
                }
                catch (error) {
                    if (error instanceof TurboFileTransferCanceledError) {
                        throw error;
                    }
                    this.throwIfTransferCanceled(progressId);
                    throw error;
                }
            },
            verify: async (route) => {
                this.throwIfTransferCanceled(progressId);
                try {
                    return await this.verifyDirectSshRoute(source, target, route, progressId);
                }
                catch (error) {
                    if (error instanceof TurboFileTransferCanceledError) {
                        throw error;
                    }
                    this.throwIfTransferCanceled(progressId);
                    throw error;
                }
            },
            isCancellationError: error => error instanceof TurboFileTransferCanceledError
        });
        this.throwIfTransferCanceled(progressId);
        if (source.kind === 'ssh' && target.kind === 'ssh' && source.connection && target.connection) {
            this.directSshRouteCache.set(getDirectSshRouteCacheKey(source.connection, target.connection), result.route);
        }
        return result.value;
    }
    async verifyDirectSshRoute(source, target, route, progressId) {
        this.throwIfTransferCanceled(progressId);
        const executorEndpoint = route === 'source-push' ? source : target;
        const remoteEndpoint = route === 'source-push' ? target : source;
        if (!executorEndpoint.connection || !remoteEndpoint.connection) {
            return 'indeterminate';
        }
        let executorConfig;
        try {
            const configResult = await this.createConnectConfig(executorEndpoint.connection);
            if (!configResult.ok) {
                this.throwIfTransferCanceled(progressId);
                return 'indeterminate';
            }
            executorConfig = configResult.config;
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError) {
                throw error;
            }
            this.throwIfTransferCanceled(progressId);
            return 'indeterminate';
        }
        let client;
        try {
            client = await this.connectDirectSsh(executorConfig, progressId);
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError) {
                throw error;
            }
            this.throwIfTransferCanceled(progressId);
            return 'indeterminate';
        }
        let credential;
        try {
            this.throwIfTransferCanceled(progressId);
            try {
                credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection, progressId, true);
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError) {
                    throw error;
                }
                this.throwIfTransferCanceled(progressId);
                return 'indeterminate';
            }
            const remote = remoteEndpoint.connection;
            const remoteUserHost = `${remote.username}@${remote.host}`;
            const sshpassPrefix = buildSshpassPrefix(remote.password);
            const sshCommand = buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath);
            const markerCommand = `printf %s ${quotePosixShellArg(DIRECT_SSH_READY_MARKER)}`;
            const command = `${sshpassPrefix}${sshCommand} ${quotePosixShellArg(remoteUserHost)} ${quotePosixShellArg(markerCommand)}`;
            try {
                const output = await this.execRemoteBytes(client, command, { timeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS, progressId });
                this.throwIfTransferCanceled(progressId);
                return classifyTurboFileDirectSshVerification(output.toString('utf8') === DIRECT_SSH_READY_MARKER, false);
            }
            catch (error) {
                if (error instanceof TurboFileTransferCanceledError) {
                    throw error;
                }
                this.throwIfTransferCanceled(progressId);
                return classifyTurboFileDirectSshVerification(false, error instanceof TurboFileRemoteCommandExitError);
            }
        }
        finally {
            if (credential?.cleanupCommand) {
                await this.execRemote(client, credential.cleanupCommand, { timeoutMs: 2000 }).catch(() => undefined);
            }
            client.end();
        }
    }
    async resolveRemoteRsyncSshBinary(client, connection) {
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
        }
        catch {
            this.remoteRsyncSshBinaryCache.set(cacheKey, 'ssh');
            return 'ssh';
        }
    }
    async tryDirectScpTransfer(request, startedAt, forceProtocol = false) {
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
        const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown');
        if (sourceType !== 'file' && sourceType !== 'directory') {
            return undefined;
        }
        const sourceIsDirectory = sourceType === 'directory';
        let bytes = Math.max(0, request.expectedBytes ?? 0);
        if (!sourceIsDirectory && bytes <= 0) {
            bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
        }
        if (!sourceIsDirectory && bytes <= 0) {
            return undefined;
        }
        return this.runVerifiedDirectRouteAttempt(request.source, request.target, request.progressId, 'scp-direct', route => this.tryDirectScpTransferRoute(request, startedAt, sourceIsDirectory, bytes, route));
    }
    async tryDirectScpTransferRoute(request, startedAt, sourceIsDirectory, bytes, route) {
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
        let credential;
        let stopGrowthTiming = () => undefined;
        let transferredBytes = 0;
        try {
            this.throwIfTransferCanceled(request.progressId);
            credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection, request.progressId);
            const remote = remoteEndpoint.connection;
            const remoteUserHost = `${remote.username}@${remote.host}`;
            const sshpassPrefix = buildSshpassPrefix(remote.password);
            const targetParentPath = getRemoteParentPath(request.target.path);
            const mkdirCommand = route === 'source-push'
                ? `${sshpassPrefix}${buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath)} ${quotePosixShellArg(remoteUserHost)} ${quotePosixShellArg(sourceIsDirectory ? `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}` : `mkdir -p -- ${quotePosixShellArg(targetParentPath)} && rm -f -- ${quotePosixShellArg(request.target.path)}`)}`
                : sourceIsDirectory ? `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}` : `mkdir -p -- ${quotePosixShellArg(targetParentPath)} && rm -f -- ${quotePosixShellArg(request.target.path)}`;
            const sourcePath = sourceIsDirectory ? getRemoteDirectoryContentsPath(request.source.path) : request.source.path;
            const targetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
            const sourceArg = route === 'source-push' ? sourcePath : `${remoteUserHost}:${sourcePath}`;
            const targetArg = route === 'source-push' ? `${remoteUserHost}:${targetPath}` : targetPath;
            const scpCommand = `${sshpassPrefix}${buildDirectScpCommand(remote.port || 22, !!remote.password, credential.identityPath, sourceIsDirectory)} ${quotePosixShellArg(sourceArg)} ${quotePosixShellArg(targetArg)}`;
            this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing direct SCP transfer.', true, { strategy: 'scp-direct', route });
            await this.execRemote(client, mkdirCommand, { timeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS, progressId: request.progressId });
            this.throwIfTransferCanceled(request.progressId);
            stopGrowthTiming = sourceIsDirectory
                ? this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, bytes, currentBytes => {
                    transferredBytes = Math.max(transferredBytes, currentBytes);
                    this.fireTransferProgress(request, currentBytes, bytes, 'transfer', 'Direct SCP transfer in progress.', false, { strategy: 'scp-direct', route });
                })
                : this.beginRemoteFileGrowthTiming(request.progressId, request.target.connection, request.target.path, 0, bytes, currentBytes => {
                    transferredBytes = Math.max(transferredBytes, currentBytes);
                    this.fireTransferProgress(request, currentBytes, bytes, 'transfer', 'Direct SCP transfer in progress.', false, { strategy: 'scp-direct', route });
                });
            this.markTransferDataStarted(request.progressId);
            await this.execRemote(client, scpCommand, {
                progressId: request.progressId
            });
            this.throwIfTransferCanceled(request.progressId);
            if (!sourceIsDirectory) {
                const targetSize = await this.withDirectorySftp(request.target, async (sftp) => (await this.remoteStat(sftp, request.target.path)).size).catch(() => this.getRemotePathSizeByCommand(request.target, request.progressId));
                this.throwIfTransferCanceled(request.progressId);
                if (targetSize !== bytes) {
                    await this.withDirectorySftp(request.target, sftp => this.unlinkRemote(sftp, request.target.path)).catch(() => undefined);
                    throw new Error(`Direct SCP size mismatch: expected ${bytes}, got ${targetSize}.`);
                }
            }
            const resultBytes = Math.max(bytes, transferredBytes);
            this.fireTransferProgress(request, resultBytes, bytes, 'transfer', 'Direct SCP transfer completed.', true, { strategy: 'scp-direct', route });
            return this.createTransferResult(true, 'scp-direct', resultBytes, 'Direct SCP completed.', startedAt, request.progressId);
        }
        catch (error) {
            if (this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            throw error;
        }
        finally {
            stopGrowthTiming();
            if (credential?.cleanupCommand) {
                await this.execRemote(client, credential.cleanupCommand, { timeoutMs: 2000 }).catch(() => undefined);
            }
            client.end();
        }
    }
    async prepareRemoteScpCredential(client, remoteConnection, progressId, strictPrivateKeyRead = false) {
        if (remoteConnection.password) {
            return {};
        }
        const privateKey = remoteConnection.privateKey ?? (strictPrivateKeyRead
            ? await this.readPrivateKey(remoteConnection.privateKeyPath)
            : await this.readPrivateKey(remoteConnection.privateKeyPath).catch(() => undefined));
        this.throwIfTransferCanceled(progressId);
        if (!privateKey) {
            return {};
        }
        const identityPath = `/tmp/turbofile-scp-${randomUUID()}.key`;
        const marker = `__TURBOFILE_SCP_KEY_${randomUUID().replace(/-/g, '')}__`;
        const normalizedKey = privateKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n?$/, '\n');
        const setupCommand = `umask 077; cat > ${quotePosixShellArg(identityPath)} <<'${marker}'\n${normalizedKey}${marker}\nchmod 600 ${quotePosixShellArg(identityPath)}`;
        const cleanupCommand = `rm -f ${quotePosixShellArg(identityPath)}`;
        try {
            await this.execRemote(client, setupCommand, { progressId });
        }
        catch (error) {
            await this.execRemote(client, cleanupCommand, { timeoutMs: 2000 }).catch(() => undefined);
            throw error;
        }
        return {
            identityPath,
            cleanupCommand
        };
    }
    async tryDirectSftpTransfer(request, startedAt, forceProtocol = false) {
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
        return this.runVerifiedDirectRouteAttempt(request.source, request.target, request.progressId, 'sftp-direct', route => this.tryDirectSftpTransferRoute(request, startedAt, route));
    }
    async tryDirectSftpTransferRoute(request, startedAt, route) {
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
        let stopGrowthTiming = () => undefined;
        let transferredBytes = 0;
        try {
            this.throwIfTransferCanceled(request.progressId);
            const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown');
            if (sourceType !== 'file' && sourceType !== 'directory') {
                throw new Error(`Unsupported direct SFTP source type: ${sourceType}.`);
            }
            const expectedBytes = Math.max(0, request.expectedBytes ?? 0);
            let bytes = expectedBytes;
            if (sourceType === 'file' && bytes === 0) {
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
            stopGrowthTiming = sourceType === 'directory'
                ? this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, bytes, currentBytes => {
                    transferredBytes = Math.max(transferredBytes, currentBytes);
                    this.fireTransferProgress(request, currentBytes, bytes, 'transfer', 'Direct SFTP transfer in progress.', false, { strategy: 'sftp-direct', route });
                })
                : this.beginRemoteFileGrowthTiming(request.progressId, request.target.connection, request.target.path, 0, bytes, currentBytes => {
                    transferredBytes = Math.max(transferredBytes, currentBytes);
                    this.fireTransferProgress(request, currentBytes, bytes, 'transfer', 'Direct SFTP transfer in progress.', false, { strategy: 'sftp-direct', route });
                });
            this.markTransferDataStarted(request.progressId);
            await this.execRemote(client, transferCommand);
            this.throwIfTransferCanceled(request.progressId);
            if (sourceType === 'file' && bytes > 0) {
                const targetSize = await this.getRemotePathSizeByCommand(request.target).catch(() => bytes);
                if (targetSize !== bytes) {
                    throw new Error(`Direct SFTP size mismatch: expected ${bytes}, got ${targetSize}.`);
                }
            }
            const resultBytes = Math.max(bytes, transferredBytes);
            this.fireTransferProgress(request, resultBytes, bytes, 'transfer', 'Direct SFTP transfer completed.', true, { strategy: 'sftp-direct', route });
            return this.createTransferResult(true, 'sftp-direct', resultBytes, 'Direct SFTP completed.', startedAt, request.progressId);
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            throw error;
        }
        finally {
            stopGrowthTiming();
            unregisterCancel();
            client.end();
        }
    }
    async tryTunneledRsyncRelayTransfer(request, startedAt, allowAutoFast = false) {
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
        const forwardedSockets = new Set();
        let forwardedPort;
        const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
            for (const socket of forwardedSockets) {
                socket.destroy();
            }
            client.end();
        });
        const onForwardedConnection = (_details, accept, reject) => {
            if (this.isTransferCanceled(request.progressId)) {
                reject();
                return;
            }
            const channel = accept();
            const socket = connectTcp(request.target.connection.port || 22, request.target.connection.host);
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
            const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown');
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
                inactivityTimeoutMs: DIRECT_RSYNC_STALL_TIMEOUT_MS,
                inactivityMessage: `Rsync relay produced no transfer progress for ${DIRECT_RSYNC_STALL_TIMEOUT_MS} ms.`,
                getActivityTime: progress.getActivityTime,
                progressId: request.progressId
            });
            this.throwIfTransferCanceled(request.progressId);
            bytes = progress.getLastBytes() || Math.max(0, request.expectedBytes ?? 0);
            return this.createTransferResult(true, 'rsync-relay', bytes, 'Rsync relay completed.', startedAt, request.progressId);
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            throw new Error(`Rsync relay failed: ${formatTransferError(error)}`);
        }
        finally {
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
    async canUseLocalRsync(client) {
        try {
            await this.execRemote(client, 'command -v rsync >/dev/null 2>&1 && command -v sshpass >/dev/null 2>&1');
            return true;
        }
        catch {
            return false;
        }
    }
    async canUseTargetRsyncThroughRelay(client, targetUserHost, forwardedPort, sshpassPrefix) {
        try {
            await this.execRemote(client, `${sshpassPrefix}${buildCompatibleSshCommand(forwardedPort, true)} ${quotePosixShellArg(targetUserHost)} ${quotePosixShellArg('command -v rsync >/dev/null 2>&1')}`);
            return true;
        }
        catch {
            return false;
        }
    }
    async tryTarRelayTransfer(request, startedAt, forceProtocol = false) {
        if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
            return undefined;
        }
        if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== 'tar') {
            return undefined;
        }
        if (request.strategyHint === 'direct' || request.source.supportsTar === false || request.target.supportsTar === false || looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
            return undefined;
        }
        const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown');
        if (sourceType !== 'directory') {
            return undefined;
        }
        const bytes = Math.max(0, request.expectedBytes ?? 0);
        const sourceConfigResult = await this.createConnectConfig(request.source.connection);
        const targetConfigResult = await this.createConnectConfig(request.target.connection);
        if (!sourceConfigResult.ok || !targetConfigResult.ok) {
            return undefined;
        }
        let sourceClient;
        let targetClient;
        let transferredBytes = 0;
        const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
            sourceClient?.end();
            targetClient?.end();
        });
        try {
            sourceClient = await this.connect(sourceConfigResult.config);
            targetClient = await this.connect(targetConfigResult.config);
            this.fireTransferProgress(request, 0, bytes, 'prepare', 'Preparing tar relay.', true, { strategy: 'tar-relay', route: 'relay' });
            const onArchiveDelta = (delta) => {
                transferredBytes += Math.max(0, delta);
                this.fireTransferProgress(request, bytes > 0 ? Math.min(transferredBytes, bytes) : transferredBytes, bytes, 'relay-upload', 'Tar relay transfer in progress.', false, { strategy: 'tar-relay', route: 'relay' });
            };
            this.markTransferDataStarted(request.progressId);
            const sourceStream = await this.openRemoteCommandStream(sourceClient, buildTarCreateFromDirectoryCommand(request.source.path), 'tar relay create');
            const targetStream = await this.openRemoteCommandStream(targetClient, buildTarExtractToExactDirectoryCommand(request.target.path), 'tar relay extract', true);
            await pipeline(sourceStream.stream, createProgressPassThrough(onArchiveDelta), targetStream.stream);
            await sourceStream.close;
            await targetStream.close;
            this.throwIfTransferCanceled(request.progressId);
            if (bytes > 0) {
                const targetSize = await this.getRemotePathContentSizeByCommand(request.target).catch(() => bytes);
                if (targetSize !== bytes) {
                    throw new Error(`Tar relay size mismatch: expected ${bytes}, got ${targetSize}.`);
                }
            }
            const resultBytes = Math.max(bytes, transferredBytes);
            this.fireTransferProgress(request, resultBytes, bytes, 'complete', 'Tar relay completed.', true, { strategy: 'tar-relay', route: 'relay' });
            this.clearRemoteDirectoryListingCache(request.target);
            return this.createTransferResult(true, 'tar-relay', resultBytes, 'Tar relay completed.', startedAt, request.progressId);
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                throw new TurboFileTransferCanceledError();
            }
            throw new Error(`Tar relay failed: ${formatTransferError(error)}`);
        }
        finally {
            unregisterCancel();
            sourceClient?.end();
            targetClient?.end();
        }
    }
    async tryStreamRelayTransfer(request, startedAt, forceProtocol = false) {
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
        let sourceClient;
        let targetClient;
        let sourceSftp;
        let targetSftp;
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
            }
            finally {
                unregisterCancel();
            }
            this.throwIfTransferCanceled(request.progressId);
            const targetStat = await this.remoteStat(targetSftp, request.target.path).catch(() => undefined);
            if (!targetStat || targetStat.size !== bytes) {
                await this.unlinkRemote(targetSftp, request.target.path).catch(() => undefined);
                throw new Error(`SFTP relay size mismatch: expected ${bytes}, got ${targetStat?.size ?? 0}.`);
            }
            return this.createTransferResult(true, 'sftp-relay', bytes, 'SFTP parallel relay completed.', startedAt, request.progressId);
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
                throw error;
            }
            return undefined;
        }
        finally {
            sourceSftp?.end();
            targetSftp?.end();
            sourceClient?.end();
            targetClient?.end();
        }
    }
    async tryScpRelayTransfer(request, startedAt, forceProtocol = false) {
        if (request.source.kind !== 'ssh' || request.target.kind !== 'ssh' || !request.source.connection || !request.target.connection) {
            return undefined;
        }
        const transferMode = getSshToSshTransferProtocol(request.source);
        if (!forceProtocol && transferMode !== 'scp' && transferMode !== 'auto-fast') {
            return undefined;
        }
        const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => 'unknown');
        if (sourceType !== 'file' && sourceType !== 'directory') {
            throw new Error(`Unsupported SCP relay source type: ${sourceType}.`);
        }
        const sourceIsDirectory = sourceType === 'directory';
        let bytes = Math.max(0, request.expectedBytes ?? 0);
        if (!sourceIsDirectory && bytes <= 0) {
            bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
        }
        if (!sourceIsDirectory && bytes <= 0) {
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
                const progressBytes = relayTotalBytes > 0 ? Math.min(downloadedBytes, relayTotalBytes) : downloadedBytes;
                this.fireTransferProgress(request, progressBytes, relayTotalBytes, 'relay-download', 'Downloading to relay cache over SCP.', false, { strategy: 'scp-relay' });
            });
            this.throwIfTransferCanceled(request.progressId);
            this.fireTransferProgress(request, bytes > 0 ? bytes : downloadedBytes, relayTotalBytes, 'relay-download', 'SCP relay download completed.', true, { strategy: 'scp-relay' });
            let uploadedBytes = 0;
            await this.runLocalScpUpload({
                ...request,
                source: { kind: 'local', path: relayPath },
                expectedBytes: bytes
            }, bytes, transferredBytes => {
                uploadedBytes = Math.max(uploadedBytes, transferredBytes);
                const progressBytes = relayTotalBytes > 0 ? Math.min(bytes + uploadedBytes, relayTotalBytes) : downloadedBytes + uploadedBytes;
                this.fireTransferProgress(request, progressBytes, relayTotalBytes, 'relay-upload', 'Uploading from relay cache over SCP.', false, { strategy: 'scp-relay' });
            });
            this.throwIfTransferCanceled(request.progressId);
            if (!sourceIsDirectory) {
                const targetSize = await this.getRemotePathSizeByCommand(request.target).catch(() => 0);
                if (targetSize !== bytes) {
                    throw new Error(`SCP relay size mismatch: expected ${bytes}, got ${targetSize}.`);
                }
            }
            const resultBytes = bytes > 0 ? bytes : Math.max(downloadedBytes, uploadedBytes);
            this.fireTransferProgress(request, relayTotalBytes > 0 ? relayTotalBytes : downloadedBytes + uploadedBytes, relayTotalBytes, 'relay-upload', 'SCP relay completed.', true, { strategy: 'scp-relay' });
            return this.createTransferResult(true, 'scp-relay', resultBytes, 'SCP relay completed.', startedAt, request.progressId);
        }
        finally {
            await fsp.rm(relayRoot, { recursive: true, force: true }).catch(() => undefined);
        }
    }
    async runSftpRelayTransfer(request, startedAt, forceProtocol = false) {
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
            const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => 'unknown');
            let bytes = sourceType === 'directory' ? 0 : Math.max(0, request.expectedBytes ?? 0);
            if (sourceType === 'file' && bytes <= 0) {
                bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
            }
            let downloadedBytes = 0;
            await this.withSftp(request.source, async (sftp) => {
                this.throwIfTransferCanceled(request.progressId);
                const relayTotalBytes = bytes * 2;
                this.fireTransferProgress(request, 0, relayTotalBytes, 'prepare', 'Preparing SFTP relay.', true, { strategy: 'sftp-relay' });
                const onDownloadDelta = (delta) => {
                    this.throwIfTransferCanceled(request.progressId);
                    downloadedBytes += delta;
                    this.fireTransferProgress(request, downloadedBytes, relayTotalBytes, 'relay-download', 'Downloading to relay cache.', false, { strategy: 'sftp-relay' });
                };
                if (sourceType === 'directory') {
                    await this.downloadDirectory(sftp, request.source.path, relayPath, onDownloadDelta, request.progressId);
                }
                else {
                    await this.fastGetWithFallback(sftp, request.source.path, relayPath, bytes, onDownloadDelta, request.progressId);
                }
            }, request.progressId);
            let uploadedBytes = 0;
            await this.withSftp(request.target, async (sftp) => {
                this.throwIfTransferCanceled(request.progressId);
                const relayStat = await fsp.stat(relayPath);
                const relayTotalBytes = bytes * 2;
                const onUploadDelta = (delta) => {
                    this.throwIfTransferCanceled(request.progressId);
                    uploadedBytes += delta;
                    const progressBytes = relayTotalBytes > 0 ? bytes + uploadedBytes : downloadedBytes + uploadedBytes;
                    this.fireTransferProgress(request, progressBytes, relayTotalBytes, 'relay-upload', 'Uploading from relay cache.', false, { strategy: 'sftp-relay' });
                };
                if (relayStat.isDirectory()) {
                    await this.uploadDirectory(sftp, relayPath, request.target.path, onUploadDelta, request.progressId);
                }
                else {
                    await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
                    await this.fastPutWithFallback(sftp, relayPath, request.target.path, bytes, onUploadDelta, request.progressId);
                }
            }, request.progressId);
            this.throwIfTransferCanceled(request.progressId);
            const relayTotalBytes = bytes * 2;
            const resultBytes = bytes > 0 ? bytes : Math.max(downloadedBytes, uploadedBytes);
            this.fireTransferProgress(request, relayTotalBytes > 0 ? relayTotalBytes : downloadedBytes + uploadedBytes, relayTotalBytes, 'complete', 'SFTP relay completed.', true, { strategy: 'sftp-relay' });
            this.clearRemoteDirectoryListingCache(request.target);
            return this.createTransferResult(true, 'sftp-relay', resultBytes, 'SFTP relay completed.', startedAt, request.progressId);
        }
        finally {
            await fsp.rm(relayRoot, { recursive: true, force: true }).catch(() => undefined);
        }
    }
    async createConnectConfig(options) {
        const nativeRequire = await this.getNativeRequire();
        nativeRequire('ssh2');
        if (!options.host || !options.username) {
            return { ok: false, message: 'Host and username are required.' };
        }
        const config = {
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
        let privateKey;
        try {
            privateKey = options.privateKey ?? await this.readPrivateKey(options.privateKeyPath);
        }
        catch (error) {
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
    async readPrivateKey(privateKeyPath) {
        if (!privateKeyPath) {
            return undefined;
        }
        return fsp.readFile(privateKeyPath, 'utf8');
    }
    async doTestConnection(config) {
        try {
            const client = await this.connect(config);
            client.end();
            return { ok: true, message: 'SSH connection succeeded.' };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { ok: false, message };
        }
    }
    async connect(config, progressId) {
        this.throwIfTransferCanceled(progressId);
        const nativeRequire = await this.getNativeRequire();
        const ssh2Module = nativeRequire('ssh2');
        const client = new ssh2Module.Client();
        return new Promise((resolve, reject) => {
            let settled = false;
            let unregisterCancel = () => undefined;
            const settle = (callback) => {
                if (settled) {
                    return;
                }
                settled = true;
                unregisterCancel();
                callback();
            };
            const cancel = () => settle(() => {
                client.end();
                reject(new TurboFileTransferCanceledError());
            });
            client
                .on('ready', () => settle(() => resolve(client)))
                .on('error', error => settle(() => reject(error)))
                .on('close', () => {
                if (!settled) {
                    settle(() => reject(new Error('SSH connection closed before authentication completed.')));
                }
            });
            unregisterCancel = this.registerTransferCancelHandler(progressId, cancel);
            if (this.isTransferCanceled(progressId)) {
                cancel();
                return;
            }
            try {
                client.connect(config);
            }
            catch (error) {
                settle(() => reject(error));
            }
        });
    }
    connectDirectSsh(config, progressId) {
        const readyTimeout = typeof config.readyTimeout === 'number'
            ? Math.min(config.readyTimeout, DIRECT_SSH_CONNECT_TIMEOUT_MS)
            : DIRECT_SSH_CONNECT_TIMEOUT_MS;
        return this.connect({ ...config, readyTimeout }, progressId);
    }
    async getDirectorySftpSession(options, config) {
        const key = this.getDirectorySftpSessionKey(options);
        while (true) {
            const existing = this.directorySftpSessions.get(key);
            if (existing) {
                let session;
                try {
                    session = await existing;
                }
                catch (error) {
                    if (this.directorySftpSessions.get(key) !== existing) {
                        continue;
                    }
                    throw error;
                }
                if (this.directorySftpSessions.get(key) !== existing || !this.directorySftpSessionGenerations.isCurrent(key, session.generation)) {
                    continue;
                }
                if (!session.closed) {
                    this.touchDirectorySftpSession(key, session.generation);
                    return session;
                }
                if (this.directorySftpSessionGenerations.clearIfCurrent(key, session.generation)) {
                    this.directorySftpSessions.delete(key);
                    this.clearDirectorySftpIdleTimer(key);
                }
                continue;
            }
            const generation = this.directorySftpSessionGenerations.next(key);
            let sessionPromise;
            sessionPromise = this.createDirectorySftpSession(key, generation, config).catch(error => {
                if (this.directorySftpSessions.get(key) === sessionPromise && this.directorySftpSessionGenerations.clearIfCurrent(key, generation)) {
                    this.directorySftpSessions.delete(key);
                    this.clearDirectorySftpIdleTimer(key);
                }
                throw error;
            });
            this.directorySftpSessions.set(key, sessionPromise);
            const session = await sessionPromise;
            if (session.closed || this.directorySftpSessions.get(key) !== sessionPromise || !this.directorySftpSessionGenerations.isCurrent(key, generation)) {
                continue;
            }
            this.touchDirectorySftpSession(key, session.generation);
            return session;
        }
    }
    async getReusableDirectorySftpSession(options) {
        const key = this.getDirectorySftpSessionKey(options);
        while (true) {
            const existing = this.directorySftpSessions.get(key);
            if (!existing) {
                return undefined;
            }
            try {
                const session = await existing;
                if (this.directorySftpSessions.get(key) !== existing || !this.directorySftpSessionGenerations.isCurrent(key, session.generation)) {
                    continue;
                }
                if (session.closed) {
                    this.directorySftpSessionGenerations.clearIfCurrent(key, session.generation);
                    this.directorySftpSessions.delete(key);
                    this.clearDirectorySftpIdleTimer(key);
                    return undefined;
                }
                // Keep the shared SSH client alive while the interactive terminal owns a shell channel.
                this.clearDirectorySftpIdleTimer(key);
                return session;
            }
            catch {
                if (this.directorySftpSessions.get(key) !== existing) {
                    continue;
                }
                return undefined;
            }
        }
    }
    async createDirectorySftpSession(key, generation, config) {
        const client = await this.connect(config);
        let sftp;
        try {
            sftp = await this.openSftp(client);
        }
        catch (error) {
            client.end();
            throw error;
        }
        const session = { key, generation, client, sftp, closed: false };
        const markClosed = () => {
            if (session.closed) {
                return;
            }
            session.closed = true;
            if (this.directorySftpSessionGenerations.clearIfCurrent(key, generation)) {
                this.directorySftpSessions.delete(key);
                this.clearDirectorySftpIdleTimer(key);
            }
        };
        client.on('close', markClosed);
        client.on('error', markClosed);
        return session;
    }
    touchDirectorySftpSession(key, generation) {
        if (!this.directorySftpSessionGenerations.isCurrent(key, generation)) {
            return;
        }
        this.clearDirectorySftpIdleTimer(key);
        const timer = setTimeout(() => this.disposeDirectorySftpSession(key, generation), REMOTE_DIRECTORY_SFTP_IDLE_MS);
        this.directorySftpIdleTimers.set(key, timer);
    }
    disposeDirectorySftpSession(key, generation) {
        if (!this.directorySftpSessionGenerations.clearIfCurrent(key, generation)) {
            return;
        }
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
            }
            catch {
                // Ignore cleanup errors from already closed SFTP sessions.
            }
            try {
                session.client.end();
            }
            catch {
                // Ignore cleanup errors from already closed SSH clients.
            }
        }, () => undefined);
    }
    clearDirectorySftpIdleTimer(key) {
        const timer = this.directorySftpIdleTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.directorySftpIdleTimers.delete(key);
        }
    }
    getDirectorySftpSessionKey(options) {
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
    getRemoteDirectoryListingCacheKey(options, path) {
        return `${this.getDirectorySftpSessionKey(options)}:${path.replace(/\\/g, '/')}`;
    }
    getRemoteDirectoryListingCache(cacheKey) {
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
    setRemoteDirectoryListingCache(cacheKey, listing) {
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
    clearRemoteDirectoryListingCache(endpoint, extraPath) {
        if (endpoint.kind !== 'ssh' || !endpoint.connection) {
            return;
        }
        const paths = new Set();
        const path = extraPath ?? endpoint.path;
        paths.add(path);
        paths.add(getRemoteParentPath(path));
        for (const candidate of paths) {
            const cacheKey = this.getRemoteDirectoryListingCacheKey(endpoint.connection, candidate);
            this.remoteDirectoryListingGenerations.next(cacheKey);
            this.remoteDirectoryListingCache.delete(cacheKey);
        }
    }
    openSftp(client) {
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
    forwardIn(client, bindAddr, bindPort) {
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
    unforwardIn(client, bindAddr, bindPort) {
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
    openRemoteFile(sftp, remotePath, flags) {
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
    readRemoteFileChunk(sftp, handle, buffer, length, position) {
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
    writeRemoteFileChunk(sftp, handle, buffer, length, position) {
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
    closeRemoteFile(sftp, handle) {
        return new Promise(resolve => {
            sftp.close(handle, () => resolve());
        });
    }
    async relayRemoteFileInParallel(sourceSftp, targetSftp, sourcePath, targetPath, bytes, onDelta, progressId) {
        if (bytes <= 0) {
            const targetHandle = await this.openRemoteFile(targetSftp, targetPath, 'w');
            await this.closeRemoteFile(targetSftp, targetHandle);
            return;
        }
        const sourceHandle = await this.openRemoteFile(sourceSftp, sourcePath, 'r');
        let targetHandle;
        try {
            targetHandle = await this.openRemoteFile(targetSftp, targetPath, 'w');
            const chunks = Math.ceil(bytes / SFTP_RELAY_CHUNK_SIZE);
            await mapLimit(Array.from({ length: chunks }, (_, index) => index), SFTP_RELAY_CONCURRENCY, async (index) => {
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
                await this.writeRemoteFileChunk(targetSftp, targetHandle, buffer, bytesReadTotal, position);
                onDelta?.(bytesReadTotal);
            });
        }
        finally {
            if (targetHandle) {
                await this.closeRemoteFile(targetSftp, targetHandle).catch(() => undefined);
            }
            await this.closeRemoteFile(sourceSftp, sourceHandle).catch(() => undefined);
        }
    }
    openShell(client, cols, rows) {
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
    cleanupSshTerminalSession(sessionId, exitCode) {
        const session = this.terminalSessions.get(sessionId);
        if (!session || session.closed) {
            return;
        }
        session.closed = true;
        this.terminalSessions.delete(sessionId);
        try {
            session.stream.end();
        }
        catch {
            // Ignore cleanup errors from already closed SSH channels.
        }
        try {
            session.client.end();
        }
        catch {
            // Ignore cleanup errors from already closed SSH clients.
        }
        session.exitEmitter.fire(exitCode);
        session.dataEmitter.dispose();
        session.exitEmitter.dispose();
    }
    async withSftp(endpoint, task, progressId) {
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
            }
            finally {
                unregisterSftpCancel();
                sftp.end();
            }
        }
        finally {
            unregisterClientCancel();
            client.end();
        }
    }
    async withDirectorySftp(endpoint, task) {
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
            this.touchDirectorySftpSession(session.key, session.generation);
            return result;
        }
        catch (error) {
            this.disposeDirectorySftpSession(session.key, session.generation);
            throw error;
        }
    }
    async withDirectorySshClient(endpoint, task) {
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
            this.touchDirectorySftpSession(session.key, session.generation);
            return result;
        }
        catch (error) {
            this.disposeDirectorySftpSession(session.key, session.generation);
            throw error;
        }
    }
    async withSshClient(endpoint, task) {
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
        }
        finally {
            client.end();
        }
    }
    async copyLocalPath(sourcePath, targetPath, onDelta, progressId) {
        this.throwIfTransferCanceled(progressId);
        const stat = await fsp.stat(sourcePath);
        if (stat.isDirectory()) {
            if (platform() === 'win32' || looksLikeWindowsPath(sourcePath) || looksLikeWindowsPath(targetPath)) {
                await this.copyLocalDirectoryNativeWithProgress(sourcePath, targetPath, onDelta, progressId);
                return;
            }
            await ensureLocalDirectory(targetPath);
            const children = await fsp.readdir(sourcePath, { withFileTypes: true });
            await mapLimit(children, LOCAL_COPY_DIRECTORY_CONCURRENCY, async (child) => {
                this.throwIfTransferCanceled(progressId);
                await this.copyLocalPath(join(sourcePath, child.name), join(targetPath, child.name), onDelta, progressId);
            });
            return;
        }
        await ensureLocalParentDirectory(targetPath);
        await this.copyLocalFileWithProgress(sourcePath, targetPath, onDelta, progressId);
    }
    async copyLocalDirectoryNativeWithProgress(sourcePath, targetPath, onDelta, progressId) {
        await ensureLocalDirectory(targetPath);
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
        let previousBytes = await getLocalPathSize(targetPath).catch(() => 0);
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
        }
        finally {
            await copy;
        }
        const finalBytes = await getLocalPathSize(targetPath).catch(() => previousBytes);
        if (finalBytes > previousBytes) {
            onDelta?.(finalBytes - previousBytes);
        }
        this.throwIfTransferCanceled(progressId);
    }
    async moveLocalPathNative(sourcePath, targetPath) {
        if (platform() === 'win32' || looksLikeWindowsPath(sourcePath) || looksLikeWindowsPath(targetPath)) {
            await ensureLocalParentDirectory(targetPath);
            await runLocalPowerShellScript(buildLocalWindowsMoveScript(sourcePath, targetPath));
            return;
        }
        await ensureLocalParentDirectory(targetPath);
        await runLocalCommand('mv', ['-f', sourcePath, targetPath]);
    }
    async moveRemotePathNative(endpoint, targetPath) {
        const command = looksLikeWindowsPath(endpoint.path) || looksLikeWindowsPath(targetPath)
            ? buildWindowsMoveCommand(endpoint.path, targetPath)
            : `mkdir -p ${quotePosixShellArg(getRemoteParentPath(targetPath))} && mv -f ${quotePosixShellArg(endpoint.path)} ${quotePosixShellArg(targetPath)}`;
        await this.withSshClient(endpoint, client => this.execRemote(client, command));
    }
    async execRemoteCopyWithProgress(request, command, bytes, sourceType, reportsNativeProgress = false) {
        let completed = false;
        let nativeProgressBuffer = '';
        let lastCopiedBytes = 0;
        const handleNativeProgress = (chunk) => {
            nativeProgressBuffer = `${nativeProgressBuffer}${chunk}`.slice(-4096);
            const copiedBytes = parseRemoteCopyProgressBytes(nativeProgressBuffer);
            if (copiedBytes <= lastCopiedBytes) {
                return;
            }
            lastCopiedBytes = copiedBytes;
            this.fireTransferProgress(request, bytes > 0 ? Math.min(copiedBytes, bytes) : copiedBytes, bytes, 'transfer', 'Remote copy in progress.');
        };
        const copy = this.withDirectorySshClient(request.source, client => this.execRemote(client, command, {
            progressId: request.progressId,
            onStderr: handleNativeProgress
        }))
            .finally(() => {
            completed = true;
        });
        if (reportsNativeProgress) {
            await copy;
            return lastCopiedBytes;
        }
        if (bytes <= 0) {
            await copy;
            return 0;
        }
        const startedAt = Date.now();
        const estimateDirectoryProgress = sourceType === 'directory';
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
        }
        finally {
            await copy;
        }
        return lastCopiedBytes;
    }
    async copyLocalFileWithProgress(sourcePath, targetPath, onDelta, progressId) {
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
            }
            catch (error) {
                source.destroy(error instanceof Error ? error : new TurboFileTransferCanceledError());
                target.destroy(error instanceof Error ? error : new TurboFileTransferCanceledError());
                return;
            }
            if (typeof chunk === 'string') {
                onDelta?.(Buffer.byteLength(chunk));
            }
            else {
                onDelta?.(chunk.byteLength);
            }
        });
        try {
            this.throwIfTransferCanceled(progressId);
            await pipeline(source, target);
            this.throwIfTransferCanceled(progressId);
        }
        finally {
            unregisterCancel();
        }
    }
    createSftpTransferOptions(onDelta, progressId, bytes = 0, adaptive = true) {
        const useLargeOptions = adaptive && bytes >= SFTP_LARGE_FILE_THRESHOLD;
        const options = {
            concurrency: adaptive ? (useLargeOptions ? SFTP_LARGE_TRANSFER_CONCURRENCY : SFTP_TRANSFER_CONCURRENCY) : SFTP_COMPAT_TRANSFER_CONCURRENCY,
            chunkSize: adaptive ? (useLargeOptions ? SFTP_LARGE_TRANSFER_CHUNK_SIZE : SFTP_TRANSFER_CHUNK_SIZE) : SFTP_COMPAT_TRANSFER_CHUNK_SIZE
        };
        if (!onDelta) {
            return options;
        }
        let lastTransferred = 0;
        options.step = (totalTransferred, chunk) => {
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
    createTransferResult(ok, strategy, bytes, message, startedAt, progressId) {
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
    createDirectTarProgressReporter(request, expectedBytes, detail, extra, onActivity) {
        let stderrBuffer = '';
        let transferredBytes = 0;
        return {
            reportTarProgress: chunk => {
                stderrBuffer = `${stderrBuffer}${chunk}`.slice(-8192);
                const parsedBytes = parseDirectTarProgressBytes(stderrBuffer);
                if (parsedBytes === undefined || parsedBytes <= transferredBytes) {
                    return;
                }
                transferredBytes = parsedBytes;
                onActivity?.();
                const visibleBytes = expectedBytes > 0 ? Math.min(transferredBytes, expectedBytes) : transferredBytes;
                this.fireTransferProgress(request, visibleBytes, expectedBytes, 'transfer', detail, false, extra);
            },
            getTransferredBytes: () => transferredBytes
        };
    }
    markTransferDataStarted(progressId) {
        if (!progressId || this.transferDataStartTimes.has(progressId)) {
            return;
        }
        this.transferDataStartTimes.set(progressId, Date.now());
    }
    clearTransferDataTiming(progressId) {
        if (!progressId) {
            return;
        }
        this.transferDataStartTimes.delete(progressId);
        this.transferFirstPositiveProgressTimes.delete(progressId);
        this.transferGrowthMonitoredProgressIds.delete(progressId);
        this.rsyncTimingStates.delete(progressId);
    }
    getRsyncTimingState(request) {
        const progressId = request.progressId;
        if (!progressId) {
            return undefined;
        }
        const existing = this.rsyncTimingStates.get(progressId);
        if (existing) {
            return existing;
        }
        const now = Date.now();
        const state = {
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
    markRsyncTiming(request, state, stage, extra = {}) {
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
    createRsyncProgressReporter(request, totalBytes, phase, detail, extra = {}, onAcceptedProgress, transferredByteOffset = 0) {
        // `knownTotalBytes` is the denominator the UI shows. rsync's --info=progress2 only emits a
        // transferred count once data starts flowing, which on a large tree can be 10s+ after the
        // process starts; publishing a concurrently-computed total here keeps the display showing the
        // size (and a real percentage) from the first second instead of a blank "preparing" state.
        let knownTotalBytes = Math.max(0, totalBytes);
        let lastBytes = Math.max(0, transferredByteOffset);
        let rsyncProgressBuffer = '';
        let lastActivityAt;
        let accepted = false;
        let lastToCheck;
        let lastTotalChecks;
        let lastTransferIndex;
        let lastSpeedBytesPerSecond;
        const reportProgress = (transferredBytes, force = false, toCheck, totalChecks, transferIndex, _percent, speedBytesPerSecond) => {
            if (!accepted) {
                accepted = true;
                onAcceptedProgress?.();
            }
            const normalizedTransferred = Math.max(0, transferredByteOffset + transferredBytes);
            const hasMetricChange = (toCheck !== undefined && toCheck !== lastToCheck)
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
                reportProgress(snapshot.bytes ?? Math.max(0, lastBytes - transferredByteOffset), false, snapshot.toCheck, snapshot.totalChecks, snapshot.transferIndex, snapshot.percent, snapshot.speedBytesPerSecond);
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
    createParallelRsyncProgressReporter(request, totalBytes, phase, detail, extra = {}, onAcceptedProgress) {
        let knownTotalBytes = Math.max(0, totalBytes);
        const transferredByIndex = new Map();
        const speedByIndex = new Map();
        let aggregateTransferredBytes = 0;
        let aggregateSpeedBytesPerSecond = 0;
        let outputBuffer = '';
        let lastBytes = 0;
        let lastSpeedBytesPerSecond = 0;
        let lastActivityAt;
        let accepted = false;
        const report = (force = false) => {
            if (!accepted) {
                accepted = true;
                onAcceptedProgress?.();
            }
            const transferredBytes = aggregateTransferredBytes;
            const speedBytesPerSecond = aggregateSpeedBytesPerSecond;
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
        const parseLine = (line) => {
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
                const previousBytes = transferredByIndex.get(index) ?? 0;
                const nextBytes = Math.max(previousBytes, snapshot.bytes);
                if (nextBytes > previousBytes) {
                    transferredByIndex.set(index, nextBytes);
                    aggregateTransferredBytes += nextBytes - previousBytes;
                }
            }
            if (snapshot.speedBytesPerSecond !== undefined) {
                const previousSpeed = speedByIndex.get(index) ?? 0;
                if (snapshot.percent !== undefined && snapshot.percent >= 100) {
                    speedByIndex.delete(index);
                    aggregateSpeedBytesPerSecond -= previousSpeed;
                }
                else {
                    speedByIndex.set(index, snapshot.speedBytesPerSecond);
                    aggregateSpeedBytesPerSecond += snapshot.speedBytesPerSecond - previousSpeed;
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
                const previousBytes = transferredByIndex.get(0) ?? 0;
                const nextBytes = Math.max(previousBytes, transferredBytes);
                if (nextBytes > previousBytes) {
                    transferredByIndex.set(0, nextBytes);
                    aggregateTransferredBytes += nextBytes - previousBytes;
                }
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
    beginTransferGrowthTiming(progressId, probeSize, baselineSize = 0, expectedBytes = 0, onProgress, pollIntervalMs = TRANSFER_PROGRESS_EVENT_INTERVAL_MS, initialDelayMs = 0) {
        if (!progressId) {
            return () => undefined;
        }
        let stopped = false;
        this.transferGrowthMonitoredProgressIds.add(progressId);
        const poll = async () => {
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
                }
                catch {
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
    normalizeGrowthProgressBytes(currentSize, baselineSize, expectedBytes) {
        const normalizedSize = Math.max(0, currentSize);
        const normalizedBaseline = Math.max(0, baselineSize);
        const transferredBytes = Math.max(0, normalizedSize - normalizedBaseline);
        const normalizedExpected = Math.max(0, expectedBytes);
        return normalizedExpected > 0 ? Math.min(transferredBytes, normalizedExpected) : transferredBytes;
    }
    getTransferDurationMs(progressId, fallbackStartedAt) {
        const startedAt = progressId
            ? this.transferDataStartTimes.get(progressId) ?? this.transferFirstPositiveProgressTimes.get(progressId) ?? fallbackStartedAt
            : fallbackStartedAt;
        return Math.max(1, Date.now() - startedAt);
    }
    beginRemoteFileGrowthTiming(progressId, connection, path, baselineSize = 0, expectedBytes = 0, onProgress, pollIntervalMs = TRANSFER_PROGRESS_EVENT_INTERVAL_MS, initialDelayMs = 0) {
        let monitorClient;
        let monitorSftp;
        let reusableDirectorySession;
        let stopped = false;
        const stopGrowthTiming = this.beginTransferGrowthTiming(progressId, async () => {
            if (stopped) {
                return 0;
            }
            if (!monitorSftp) {
                const candidateDirectorySession = await this.getReusableDirectorySftpSession(connection);
                if (candidateDirectorySession && !candidateDirectorySession.closed) {
                    reusableDirectorySession = candidateDirectorySession;
                    monitorSftp = candidateDirectorySession.sftp;
                }
                else {
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
            if (reusableDirectorySession) {
                this.touchDirectorySftpSession(reusableDirectorySession.key, reusableDirectorySession.generation);
            }
            else {
                monitorSftp?.end();
                monitorClient?.end();
            }
            monitorSftp = undefined;
            monitorClient = undefined;
            reusableDirectorySession = undefined;
        };
    }
    beginRemotePathGrowthTiming(progressId, endpoint, baselineSize = 0, expectedBytes = 0, onProgress, pollIntervalMs = TRANSFER_PROGRESS_EVENT_INTERVAL_MS, initialDelayMs = 0) {
        return this.beginTransferGrowthTiming(progressId, () => this.getRemotePathSizeByCommand(endpoint), baselineSize, expectedBytes, onProgress, pollIntervalMs, initialDelayMs);
    }
    isTransferCanceled(progressId) {
        return !!progressId && this.transferCancellationRequests.has(progressId);
    }
    throwIfTransferCanceled(progressId) {
        if (this.isTransferCanceled(progressId)) {
            throw new TurboFileTransferCanceledError();
        }
    }
    registerTransferCancelHandler(progressId, handler) {
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
    runCancelableLocalCommand(command, args, options = {}, progressId) {
        this.throwIfTransferCanceled(progressId);
        return new Promise((resolve, reject) => {
            let settled = false;
            let stderrTail = '';
            let unregisterCancel = () => undefined;
            let inactivityTimer;
            let lastActivityAt = Date.now();
            const finish = (callback) => {
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
            const child = spawn(command, args, { windowsHide: true, env: options.env, stdio: [options.input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
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
            child.stdin?.on('error', error => {
                if (settled) {
                    return;
                }
                killLocalProcessTree(child);
                finish(() => {
                    if (this.isTransferCanceled(progressId)) {
                        reject(new TurboFileTransferCanceledError());
                    }
                    else {
                        reject(new Error(formatLocalCommandError(stderrTail, error.message)));
                    }
                });
            });
            if (options.inactivityTimeoutMs && options.inactivityTimeoutMs > 0) {
                inactivityTimer = setInterval(() => {
                    if (settled || Date.now() - lastActivityAt <= options.inactivityTimeoutMs) {
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
                    }
                    else {
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
            if (options.input) {
                child.stdin?.end(Buffer.from(options.input));
            }
        });
    }
    fireTransferProgress(request, transferredBytes, totalBytes, phase, detail, force = false, extra = {}) {
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
    getTransferProgressEmitter(progressId) {
        let emitter = this.transferProgressEmitters.get(progressId);
        if (!emitter) {
            emitter = new Emitter();
            this.transferProgressEmitters.set(progressId, emitter);
        }
        return emitter;
    }
    scheduleTransferProgressCleanup(progressId) {
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
    async readLocalFileBuffer(path, maxBytes) {
        const stat = await fsp.stat(path);
        if (stat.isDirectory()) {
            throw new Error('Cannot preview a directory.');
        }
        if (stat.size > maxBytes) {
            throw new Error(`File is too large to preview (${formatBytes(stat.size)}).`);
        }
        return fsp.readFile(path);
    }
    async readRemoteFileBuffer(endpoint, maxBytes) {
        let tempRoot;
        try {
            return await this.withDirectorySftp(endpoint, async (sftp) => {
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
        }
        finally {
            if (tempRoot) {
                await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
            }
        }
    }
    async readRemoteFileBufferDirect(sftp, remotePath, size) {
        if (size <= 0) {
            return Buffer.alloc(0);
        }
        if (sftp.createReadStream) {
            try {
                return await this.readRemoteFileBufferStream(sftp, remotePath, size);
            }
            catch {
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
        }
        finally {
            await this.closeRemoteFile(sftp, handle);
        }
    }
    readRemoteFileBufferStream(sftp, remotePath, size) {
        return new Promise((resolve, reject) => {
            const stream = sftp.createReadStream?.(remotePath, {
                highWaterMark: REMOTE_DIRECT_READ_CHUNK_BYTES
            });
            if (!stream) {
                reject(new Error('SFTP read stream is unavailable.'));
                return;
            }
            const chunks = [];
            let total = 0;
            let settled = false;
            const finish = (callback) => {
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
                    stream.destroy?.();
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
    async acquireImageReadSlot() {
        if (this.imageReadActiveCount < SSH_IMAGE_READ_MAX_CONCURRENCY) {
            this.imageReadActiveCount++;
            return;
        }
        await new Promise(resolve => this.imageReadWaiters.push(resolve));
    }
    releaseImageReadSlot() {
        const next = this.imageReadWaiters.shift();
        if (next) {
            // Hand the slot directly to the next waiter; active count stays the same.
            next();
            return;
        }
        this.imageReadActiveCount = Math.max(0, this.imageReadActiveCount - 1);
    }
    async readImageBuffer(endpoint, options) {
        // Only SSH reads contend for connection channels; local reads run unthrottled.
        if (endpoint.kind !== 'ssh') {
            return this.readImageBufferInner(endpoint, options);
        }
        await this.acquireImageReadSlot();
        try {
            return await this.readImageBufferInner(endpoint, options);
        }
        finally {
            this.releaseImageReadSlot();
        }
    }
    async readImageBufferInner(endpoint, options) {
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
    async readOriginalImageBuffer(endpoint, sourceMaxBytes) {
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
    async readScaledImageBuffer(endpoint, sourceMaxBytes, targetWidth, targetHeight, quality, format, interpolation, sourceFingerprint) {
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
        }
        catch (error) {
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
    getImageSourceFingerprintFromOptions(options) {
        const size = Number(options.sourceSize);
        const modified = Number(options.sourceModified);
        if (!Number.isFinite(size) || size < 0 || !Number.isFinite(modified) || modified <= 0) {
            return undefined;
        }
        return { size, modified };
    }
    async getImageSourceFingerprint(endpoint) {
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
        return this.withDirectorySftp(endpoint, async (sftp) => {
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
    getImageThumbnailCacheKey(endpoint, sourceFingerprint, width, height, quality, format, interpolation) {
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
    async readCachedImageThumbnail(cacheKey) {
        const paths = this.getImageThumbnailCachePaths(cacheKey);
        try {
            const [metadataContent, buffer] = await Promise.all([
                fsp.readFile(paths.metadataPath, 'utf8'),
                fsp.readFile(paths.dataPath)
            ]);
            const metadata = JSON.parse(metadataContent);
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
        }
        catch {
            return undefined;
        }
    }
    async writeCachedImageThumbnail(cacheKey, result) {
        if (!result.buffer.byteLength || result.buffer.byteLength > IMAGE_THUMBNAIL_CACHE_MAX_ENTRY_BYTES) {
            return;
        }
        const paths = this.getImageThumbnailCachePaths(cacheKey);
        const metadata = {
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
        }
        catch {
            // Thumbnail cache is purely an acceleration layer; failed writes must never block image loading.
        }
    }
    getImageThumbnailCachePaths(cacheKey) {
        const bucket = cacheKey.slice(0, 2) || '00';
        const root = this.getImageThumbnailCacheRoot();
        return {
            dataPath: join(root, bucket, `${cacheKey}.bin`),
            metadataPath: join(root, bucket, `${cacheKey}.json`)
        };
    }
    getImageThumbnailCacheRoot() {
        try {
            return join(app.getPath('userData'), 'turbofile-image-cache', `v${IMAGE_THUMBNAIL_CACHE_VERSION}`);
        }
        catch {
            return join(tmpdir(), 'turbofile-image-cache', `v${IMAGE_THUMBNAIL_CACHE_VERSION}`);
        }
    }
    scheduleTrimImageThumbnailCache() {
        if (this.imageThumbnailCacheTrimPromise) {
            return;
        }
        this.imageThumbnailCacheTrimPromise = this.trimImageThumbnailCache()
            .finally(() => {
            this.imageThumbnailCacheTrimPromise = undefined;
        });
    }
    async trimImageThumbnailCache() {
        const root = this.getImageThumbnailCacheRoot();
        const entries = [];
        const visit = async (directory) => {
            let children;
            try {
                children = await fsp.readdir(directory, { withFileTypes: true });
            }
            catch {
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
    async tryReadRemoteThumbnailViaImageMagick(endpoint, width, height, quality, format, interpolation) {
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
        const effectiveFormat = format === 'png' ? 'png' : 'jpeg';
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
        }
        catch (error) {
            // A single corrupt/unsupported image should not disable thumbnail acceleration for
            // the entire SSH device; keep the tool cache intact and fall back for this image only.
            return undefined;
        }
    }
    async getRemoteImageTool(endpoint) {
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
        }
        finally {
            if (this.remoteImageToolPending.get(cacheKey) === probe) {
                this.remoteImageToolPending.delete(cacheKey);
            }
        }
    }
    async resolveRemoteImageTool(endpoint, cacheKey, checkedAt) {
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
        }
        catch {
            this.remoteImageToolCache.set(cacheKey, { checkedAt, tool: undefined });
            return undefined;
        }
    }
    getRemoteImageToolCacheKey(options) {
        return JSON.stringify({
            host: options.host,
            port: options.port || 22,
            username: options.username
        });
    }
    openRemoteCommandStream(client, command, context, drainStdout = false) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const channelTimeout = setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(new Error(`${context} timed out while waiting for an SSH exec channel.`));
            }, REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS);
            const closeLateStream = (stream) => {
                try {
                    if (stream.close) {
                        stream.close();
                    }
                }
                catch {
                    // Best-effort cleanup only.
                }
                try {
                    if (stream.destroy) {
                        stream.destroy();
                    }
                }
                catch {
                    // Best-effort cleanup only.
                }
            };
            try {
                client.exec(command, (error, stream) => {
                    if (settled) {
                        if (stream) {
                            closeLateStream(stream);
                        }
                        return;
                    }
                    settled = true;
                    clearTimeout(channelTimeout);
                    if (error) {
                        reject(error);
                        return;
                    }
                    let stderr = '';
                    let closeSettled = false;
                    const close = new Promise((closeResolve, closeReject) => {
                        const finish = (callback) => {
                            if (closeSettled) {
                                return;
                            }
                            closeSettled = true;
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
            }
            catch (error) {
                if (!settled) {
                    settled = true;
                    clearTimeout(channelTimeout);
                    reject(error);
                }
            }
        });
    }
    transformImageBuffer(buffer, path, targetWidth, targetHeight, quality, format) {
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
    resizeNativeImage(image, sourceSize, targetWidth, targetHeight) {
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
    execRemote(client, command, options = {}) {
        this.throwIfTransferCanceled(options.progressId);
        return new Promise((resolve, reject) => {
            let settled = false;
            let totalTimeout;
            let channelTimeout;
            let inactivityTimer;
            let streamRef;
            let unregisterCancel;
            let lastStreamActivityAt = Date.now();
            const finish = (callback) => {
                if (settled) {
                    return;
                }
                settled = true;
                unregisterCancel?.();
                if (totalTimeout) {
                    clearTimeout(totalTimeout);
                    totalTimeout = undefined;
                }
                if (channelTimeout) {
                    clearTimeout(channelTimeout);
                    channelTimeout = undefined;
                }
                if (inactivityTimer) {
                    clearInterval(inactivityTimer);
                    inactivityTimer = undefined;
                }
                callback();
            };
            const closeStream = () => {
                try {
                    streamRef?.close?.();
                }
                catch {
                    // Best-effort cleanup only.
                }
                try {
                    streamRef?.destroy?.();
                }
                catch {
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
            if (options.timeoutMs && options.timeoutMs > 0) {
                totalTimeout = setTimeout(() => {
                    closeStream();
                    finish(() => reject(new Error(`Remote command timed out after ${options.timeoutMs} ms.`)));
                }, options.timeoutMs);
            }
            channelTimeout = setTimeout(() => {
                closeStream();
                finish(() => reject(new Error(`Remote command channel did not open within ${REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS} ms.`)));
            }, Math.min(REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS, options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS));
            client.exec(command, (error, stream) => {
                if (error) {
                    finish(() => reject(error));
                    return;
                }
                if (settled) {
                    try {
                        stream.close?.();
                    }
                    catch { /* Best-effort late-channel cleanup. */ }
                    try {
                        stream.destroy?.();
                    }
                    catch { /* Best-effort late-channel cleanup. */ }
                    return;
                }
                if (channelTimeout) {
                    clearTimeout(channelTimeout);
                    channelTimeout = undefined;
                }
                streamRef = stream;
                let stderr = '';
                if (options.inactivityTimeoutMs && options.inactivityTimeoutMs > 0) {
                    inactivityTimer = setInterval(() => {
                        const externalActivityAt = options.getActivityTime?.() ?? 0;
                        const lastActivityAt = Math.max(lastStreamActivityAt, externalActivityAt);
                        if (Date.now() - lastActivityAt <= options.inactivityTimeoutMs) {
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
                stream.on('error', error => {
                    closeStream();
                    finish(() => reject(this.isTransferCanceled(options.progressId) ? new TurboFileTransferCanceledError() : error));
                });
                stream.on('close', code => {
                    if (code === 0) {
                        finish(() => resolve());
                        return;
                    }
                    finish(() => reject(new Error(stderr.trim() || `Remote command failed with exit code ${code ?? 'unknown'}.`)));
                });
                if (options.input) {
                    stream.end(Buffer.from(options.input));
                }
            });
        });
    }
    execRemoteBytes(client, command, options = {}) {
        this.throwIfTransferCanceled(options.progressId);
        return new Promise((resolve, reject) => {
            let settled = false;
            let totalTimeout;
            let channelTimeout;
            let inactivityTimer;
            let activeStream;
            let unregisterCancel;
            const clearTimers = () => {
                if (totalTimeout) {
                    clearTimeout(totalTimeout);
                    totalTimeout = undefined;
                }
                if (inactivityTimer) {
                    clearTimeout(inactivityTimer);
                    inactivityTimer = undefined;
                }
                if (channelTimeout) {
                    clearTimeout(channelTimeout);
                    channelTimeout = undefined;
                }
            };
            const finish = (callback) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimers();
                unregisterCancel?.();
                callback();
            };
            const abort = (message) => {
                const stream = activeStream;
                try {
                    stream?.close?.();
                }
                catch {
                    // Best-effort: older ssh2 channel typings may not expose close.
                }
                try {
                    stream?.destroy?.();
                }
                catch {
                    // Best-effort cleanup only.
                }
                finish(() => reject(new Error(message)));
            };
            if (options.progressId) {
                unregisterCancel = this.registerTransferCancelHandler(options.progressId, () => {
                    const stream = activeStream;
                    try {
                        stream?.close?.();
                    }
                    catch { /* Best-effort cleanup only. */ }
                    try {
                        stream?.destroy?.();
                    }
                    catch { /* Best-effort cleanup only. */ }
                    finish(() => reject(new TurboFileTransferCanceledError()));
                });
            }
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
            channelTimeout = setTimeout(() => abort(`Remote command channel did not open within ${REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS} ms.`), Math.min(REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS, options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS));
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
                    }
                    catch {
                        // Best-effort cleanup only.
                    }
                    try {
                        stream.destroy?.();
                    }
                    catch {
                        // Best-effort cleanup only.
                    }
                    return;
                }
                if (channelTimeout) {
                    clearTimeout(channelTimeout);
                    channelTimeout = undefined;
                }
                activeStream = stream;
                const chunks = [];
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
                stream.on('error', error => abort(this.isTransferCanceled(options.progressId) ? TRANSFER_CANCELED_MESSAGE : error.message));
                stream.on('close', code => {
                    if (code === 0) {
                        finish(() => resolve(Buffer.concat(chunks)));
                        return;
                    }
                    finish(() => reject(new TurboFileRemoteCommandExitError(stderr.trim() || `Remote command failed with exit code ${code ?? 'unknown'}.`)));
                });
            });
        });
    }
    /**
     * Runs a remote command, writing `input` to its stdin in one shot. Used to feed a NUL-delimited
     * path list to `xargs -0 rm` so deleting any number of files is a single SSH round trip — xargs
     * batches the removals server-side, so it never hits the shell argument-length limit.
     */
    execRemoteWithInput(client, command, input, options = {}) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let totalTimeout;
            let channelTimeout;
            let inactivityTimeout;
            let activeStream;
            let unregisterCancel;
            const finish = (callback) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (totalTimeout) {
                    clearTimeout(totalTimeout);
                    totalTimeout = undefined;
                }
                if (channelTimeout) {
                    clearTimeout(channelTimeout);
                    channelTimeout = undefined;
                }
                if (inactivityTimeout) {
                    clearTimeout(inactivityTimeout);
                    inactivityTimeout = undefined;
                }
                unregisterCancel?.();
                callback();
            };
            const closeStream = () => {
                try {
                    activeStream?.close?.();
                }
                catch { /* Best-effort cleanup only. */ }
                try {
                    activeStream?.destroy?.();
                }
                catch { /* Best-effort cleanup only. */ }
            };
            if (options.progressId) {
                unregisterCancel = this.registerTransferCancelHandler(options.progressId, () => {
                    closeStream();
                    finish(() => reject(new TurboFileTransferCanceledError()));
                });
            }
            if (options.timeoutMs && options.timeoutMs > 0) {
                totalTimeout = setTimeout(() => {
                    closeStream();
                    finish(() => reject(new Error(`Remote command timed out after ${options.timeoutMs} ms.`)));
                }, options.timeoutMs);
            }
            channelTimeout = setTimeout(() => {
                closeStream();
                finish(() => reject(new Error(`Remote command channel did not open within ${REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS} ms.`)));
            }, Math.min(REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS, options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS));
            client.exec(command, (error, stream) => {
                if (error) {
                    finish(() => reject(error));
                    return;
                }
                if (settled) {
                    try {
                        stream.close?.();
                    }
                    catch { /* Best-effort late-channel cleanup. */ }
                    try {
                        stream.destroy?.();
                    }
                    catch { /* Best-effort late-channel cleanup. */ }
                    return;
                }
                if (channelTimeout) {
                    clearTimeout(channelTimeout);
                    channelTimeout = undefined;
                }
                activeStream = stream;
                const chunks = [];
                let stderr = '';
                const armInactivityTimeout = () => {
                    if (!options.inactivityTimeoutMs || options.inactivityTimeoutMs <= 0 || settled) {
                        return;
                    }
                    if (inactivityTimeout) {
                        clearTimeout(inactivityTimeout);
                    }
                    inactivityTimeout = setTimeout(() => {
                        try {
                            stream.close?.();
                        }
                        catch {
                            // Best-effort cleanup only.
                        }
                        finish(() => reject(new Error(options.inactivityMessage ?? `Remote command produced no output for ${options.inactivityTimeoutMs} ms.`)));
                    }, options.inactivityTimeoutMs);
                };
                armInactivityTimeout();
                stream.on('data', data => {
                    armInactivityTimeout();
                    chunks.push(typeof data === 'string' ? Buffer.from(data) : data);
                });
                stream.stderr.on('data', data => {
                    armInactivityTimeout();
                    stderr += data.toString();
                });
                stream.on('error', error => {
                    closeStream();
                    finish(() => reject(this.isTransferCanceled(options.progressId) ? new TurboFileTransferCanceledError() : error));
                });
                stream.on('close', code => {
                    if (code === 0) {
                        finish(() => resolve(Buffer.concat(chunks)));
                        return;
                    }
                    finish(() => reject(new Error(stderr.trim() || `Remote command failed with exit code ${code ?? 'unknown'}.`)));
                });
                stream.end(Buffer.from(input));
            });
        });
    }
    parseRsyncProgressSnapshot(chunk) {
        let parsed;
        const progressPattern = /(?:^|[\r\n])\s*([0-9][0-9., ]*)\s+([0-9]{1,3})%/g;
        const speedPattern = /([0-9]+(?:[.,][0-9]+)?)\s*([kmgtpe]?)(?:i?B|bytes?)\/s/gi;
        const toCheckPattern = /(?:to-(?:check|chk)|ir-chk)=(\d+)\/(\d+)/g;
        const transferIndexPattern = /xfr#(\d+)/g;
        let hasParsedMetric = false;
        let match;
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
        let speedMatch;
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
        let toCheckMatch;
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
        let transferIndexMatch;
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
    async readRemoteDirectoryWithFallback(sftp, client, options, remotePath, namesOnly = false) {
        try {
            return { path: remotePath, entries: await this.readRemoteDirectoryFast(client, sftp, remotePath, namesOnly) };
        }
        catch (firstError) {
            for (const fallbackPath of getRemoteDirectoryFallbackPaths(options, remotePath)) {
                try {
                    return { path: fallbackPath, entries: await this.readRemoteDirectoryFast(client, sftp, fallbackPath, namesOnly) };
                }
                catch {
                    // Try the next SFTP-visible spelling for devices with chrooted home paths.
                }
            }
            throw firstError;
        }
    }
    async readRemoteDirectoryFastCommand(client, remotePath, namesOnly = false) {
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
    async readRemoteDirectoryFast(client, sftp, remotePath, namesOnly = false) {
        try {
            return await this.readRemoteDirectoryFastCommand(client, remotePath, namesOnly);
        }
        catch {
            return this.readRemoteDirectory(sftp, remotePath);
        }
    }
    parseFastRemoteDirectoryEntries(output, namesOnly = false) {
        const text = output.toString('utf8');
        if (!text) {
            return [];
        }
        const parts = text.split('\0');
        const entries = [];
        const stride = namesOnly ? 2 : 4;
        for (let index = 0; index + stride - 1 < parts.length; index += stride) {
            const filename = parts[index];
            if (!filename || filename === '.' || filename === '..') {
                continue;
            }
            const kind = parts[index + 1];
            const size = namesOnly ? 0 : Number(parts[index + 2]);
            const modifiedSeconds = namesOnly ? 0 : Number(parts[index + 3]);
            const type = kind === 'd' ? 'directory' : kind === 'f' ? 'file' : kind === 'l' ? 'symlink' : 'unknown';
            entries.push({
                filename,
                longname: type === 'directory' ? 'd' : type === 'symlink' ? 'l' : '-',
                attrs: createFastDirectoryEntryStats(type, Number.isFinite(size) ? size : 0, Number.isFinite(modifiedSeconds) ? Math.floor(modifiedSeconds) : 0)
            });
        }
        return entries;
    }
    readRemoteDirectory(sftp, remotePath) {
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
    async getRemotePathSize(sftp, remotePath, progressId) {
        this.throwIfTransferCanceled(progressId);
        const stats = await this.remoteStat(sftp, remotePath);
        this.throwIfTransferCanceled(progressId);
        if (!stats.isDirectory()) {
            return stats.size;
        }
        let total = 0;
        const entries = await this.readRemoteDirectory(sftp, remotePath);
        this.throwIfTransferCanceled(progressId);
        for (const entry of entries) {
            this.throwIfTransferCanceled(progressId);
            if (entry.filename === '.' || entry.filename === '..') {
                continue;
            }
            if (entry.attrs.isDirectory() || entry.attrs.isFile()) {
                total += await this.getRemotePathSize(sftp, joinRemotePath(remotePath, entry.filename), progressId);
                this.throwIfTransferCanceled(progressId);
            }
        }
        return total;
    }
    async getRemotePathSizeByCommand(endpoint, progressId) {
        this.throwIfTransferCanceled(progressId);
        if (endpoint.kind !== 'ssh') {
            return getLocalPathSize(endpoint.path);
        }
        try {
            if (looksLikeWindowsPath(endpoint.path)) {
                return await this.withDirectorySshClient(endpoint, async (client) => {
                    const output = await this.execRemoteBytes(client, buildWindowsSizeCommand(endpoint.path), { progressId });
                    this.throwIfTransferCanceled(progressId);
                    return parseSizeCommandOutput(output.toString());
                });
            }
            return await this.withDirectorySshClient(endpoint, async (client) => {
                const output = await this.execRemoteBytes(client, buildPosixSizeCommand(endpoint.path), { progressId });
                this.throwIfTransferCanceled(progressId);
                return parseSizeCommandOutput(output.toString());
            });
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError) {
                throw error;
            }
            this.throwIfTransferCanceled(progressId);
            return this.withDirectorySftp(endpoint, sftp => this.getRemotePathSize(sftp, endpoint.path, progressId));
        }
    }
    async getRemotePathContentSizeByCommand(endpoint, progressId) {
        this.throwIfTransferCanceled(progressId);
        if (endpoint.kind !== 'ssh' || looksLikeWindowsPath(endpoint.path)) {
            return this.getRemotePathSizeByCommand(endpoint, progressId);
        }
        try {
            return await this.withDirectorySshClient(endpoint, async (client) => {
                const output = await this.execRemoteBytes(client, buildPosixContentSizeCommand(endpoint.path), { progressId });
                this.throwIfTransferCanceled(progressId);
                return parseSizeCommandOutput(output.toString());
            });
        }
        catch (error) {
            if (error instanceof TurboFileTransferCanceledError) {
                throw error;
            }
            this.throwIfTransferCanceled(progressId);
            return this.withDirectorySftp(endpoint, sftp => this.getRemotePathSize(sftp, endpoint.path, progressId));
        }
    }
    async getPathHumanSize(endpoint, size) {
        if (endpoint.kind === 'ssh' && !looksLikeWindowsPath(endpoint.path)) {
            try {
                return await this.withDirectorySshClient(endpoint, async (client) => {
                    const output = await this.execRemoteBytes(client, buildPosixHumanSizeCommand(endpoint.path));
                    const humanSize = output.toString().trim().split(/\r?\n/)[0]?.trim();
                    if (!humanSize) {
                        throw new Error('Empty human size output.');
                    }
                    return humanSize;
                });
            }
            catch {
                // Keep the exact byte count usable even when the display-only du command is unavailable.
            }
        }
        return formatHumanSize(size);
    }
    remoteStat(sftp, remotePath) {
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
    mkdirRemote(sftp, remotePath) {
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
    rmdirRemote(sftp, remotePath) {
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
    unlinkRemote(sftp, remotePath) {
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
    fastGet(sftp, remotePath, localPath, options) {
        return new Promise((resolve, reject) => {
            const callback = (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            };
            if (options) {
                sftp.fastGet(remotePath, localPath, options, callback);
            }
            else {
                sftp.fastGet(remotePath, localPath, callback);
            }
        });
    }
    fastPut(sftp, localPath, remotePath, options) {
        return new Promise((resolve, reject) => {
            const callback = (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            };
            if (options) {
                sftp.fastPut(localPath, remotePath, options, callback);
            }
            else {
                sftp.fastPut(localPath, remotePath, callback);
            }
        });
    }
    async fastGetWithFallback(sftp, remotePath, localPath, bytes, onDelta, progressId) {
        await this.fastTransferWithFallback(bytes, onDelta, progressId, report => this.fastGet(sftp, remotePath, localPath, this.createSftpTransferOptions(report, progressId, bytes, true)), report => this.fastGet(sftp, remotePath, localPath, this.createSftpTransferOptions(report, progressId, bytes, false)));
    }
    async fastPutWithFallback(sftp, localPath, remotePath, bytes, onDelta, progressId) {
        await this.fastTransferWithFallback(bytes, onDelta, progressId, report => this.fastPut(sftp, localPath, remotePath, this.createSftpTransferOptions(report, progressId, bytes, true)), report => this.fastPut(sftp, localPath, remotePath, this.createSftpTransferOptions(report, progressId, bytes, false)));
    }
    async fastTransferWithFallback(bytes, onDelta, progressId, primary, fallback) {
        const useLargeOptions = bytes >= SFTP_LARGE_FILE_THRESHOLD;
        let reportedBytes = 0;
        const createAttemptReporter = () => {
            let attemptBytes = 0;
            return (delta) => {
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
        }
        catch (error) {
            if (!useLargeOptions || error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
                throw error;
            }
            await fallback(createAttemptReporter());
        }
    }
    async ensureRemoteDirectory(sftp, remotePath) {
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
            let stats;
            try {
                stats = await this.remoteStat(sftp, current);
            }
            catch {
                await this.mkdirRemote(sftp, current);
                stats = await this.remoteStat(sftp, current).catch(() => undefined);
            }
            if (stats && !stats.isDirectory()) {
                throw new Error(`Remote path is not a directory: ${current}`);
            }
        }
    }
    async uploadDirectoryConcurrent(endpoint, localPath, remotePath, onTotal, onDelta, progressId) {
        this.throwIfTransferCanceled(progressId);
        const plan = await this.collectLocalDirectoryTransferPlan(localPath, remotePath, progressId);
        onTotal?.(plan.totalBytes);
        await this.withSftpPool(endpoint, this.getDirectorySftpConnectionCount(plan.files.length, plan.totalBytes), progressId, async (sftps) => {
            this.throwIfTransferCanceled(progressId);
            await this.ensureRemoteDirectoriesForUpload(endpoint, sftps[0], plan.directories);
            await this.runSftpWorkers(sftps, plan.files, progressId, async (sftp, file) => {
                this.throwIfTransferCanceled(progressId);
                await this.fastPutWithFallback(sftp, file.localPath, file.remotePath, file.size, onDelta, progressId);
            });
        });
    }
    async downloadDirectoryConcurrent(endpoint, remotePath, localPath, onTotal, onDelta, progressId) {
        this.throwIfTransferCanceled(progressId);
        const plan = await this.withSftp(endpoint, sftp => this.collectRemoteDirectoryTransferPlan(sftp, remotePath, localPath, progressId), progressId);
        onTotal?.(plan.totalBytes);
        await mapLimit(plan.directories, LOCAL_DIRECTORY_STAT_CONCURRENCY, directory => fsp.mkdir(directory, { recursive: true }));
        await this.withSftpPool(endpoint, this.getDirectorySftpConnectionCount(plan.files.length, plan.totalBytes), progressId, async (sftps) => {
            await this.runSftpWorkers(sftps, plan.files, progressId, async (sftp, file) => {
                this.throwIfTransferCanceled(progressId);
                await fsp.mkdir(dirname(file.localPath), { recursive: true });
                await this.fastGetWithFallback(sftp, file.remotePath, file.localPath, file.size, onDelta, progressId);
            });
        });
    }
    getDirectorySftpConnectionCount(fileCount, totalBytes) {
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
    async collectLocalDirectoryTransferPlan(localPath, remotePath, progressId) {
        const directories = [];
        const files = [];
        let totalBytes = 0;
        const walk = async (currentLocalPath, currentRemotePath) => {
            this.throwIfTransferCanceled(progressId);
            directories.push(currentRemotePath);
            const entries = await fsp.readdir(currentLocalPath, { withFileTypes: true });
            await mapLimit(entries, SFTP_DIRECTORY_DISCOVERY_CONCURRENCY, async (entry) => {
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
    async collectRemoteDirectoryTransferPlan(sftp, remotePath, localPath, progressId) {
        const directories = [];
        const files = [];
        let totalBytes = 0;
        const walk = async (currentRemotePath, currentLocalPath) => {
            this.throwIfTransferCanceled(progressId);
            directories.push(currentLocalPath);
            const entries = await this.readRemoteDirectory(sftp, currentRemotePath);
            await mapLimit(entries, SFTP_DIRECTORY_DISCOVERY_CONCURRENCY, async (entry) => {
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
    async ensureRemoteDirectoriesForUpload(endpoint, fallbackSftp, directories) {
        const uniqueDirectories = [...new Set(directories)].filter(directory => !!directory && directory !== '.' && directory !== '/');
        if (!uniqueDirectories.length) {
            return;
        }
        if (endpoint.kind === 'ssh' && !uniqueDirectories.some(looksLikeWindowsPath)) {
            try {
                await this.withSshClient(endpoint, async (client) => {
                    for (let index = 0; index < uniqueDirectories.length; index += SFTP_DIRECTORY_MKDIR_BATCH_SIZE) {
                        const chunk = uniqueDirectories.slice(index, index + SFTP_DIRECTORY_MKDIR_BATCH_SIZE);
                        await this.execRemote(client, `mkdir -p -- ${chunk.map(directory => quotePosixShellArg(directory)).join(' ')}`);
                    }
                });
                return;
            }
            catch {
                // Some devices expose SFTP but not a POSIX shell; fall back to SFTP mkdir.
            }
        }
        await mapLimit(uniqueDirectories, SFTP_DIRECTORY_ENTRY_CONCURRENCY, directory => this.ensureRemoteDirectory(fallbackSftp, directory));
    }
    async withSftpPool(endpoint, requestedConnections, progressId, task) {
        if (!endpoint.connection) {
            throw new Error('SSH endpoint is missing connection options.');
        }
        const configResult = await this.createConnectConfig(endpoint.connection);
        if (!configResult.ok) {
            throw new Error(configResult.message);
        }
        const desiredConnections = Math.max(1, Math.min(requestedConnections, SFTP_DIRECTORY_TRANSFER_CONNECTIONS));
        const clients = [];
        const sftps = [];
        const closeAll = () => {
            for (const sftp of sftps) {
                try {
                    sftp.end();
                }
                catch {
                    // Best-effort cleanup.
                }
            }
            for (const client of clients) {
                try {
                    client.end();
                }
                catch {
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
                }
                catch (error) {
                    if (!sftps.length) {
                        throw error;
                    }
                    break;
                }
            }
            return await task(sftps);
        }
        finally {
            unregisterCancel();
            closeAll();
        }
    }
    async runSftpWorkers(sftps, items, progressId, worker) {
        let nextIndex = 0;
        await Promise.all(sftps.map(async (sftp) => {
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
    async uploadDirectory(sftp, localPath, remotePath, onDelta, progressId) {
        this.throwIfTransferCanceled(progressId);
        await this.ensureRemoteDirectory(sftp, remotePath);
        const entries = await fsp.readdir(localPath, { withFileTypes: true });
        await mapLimit(entries, SFTP_DIRECTORY_ENTRY_CONCURRENCY, async (entry) => {
            this.throwIfTransferCanceled(progressId);
            const localChild = join(localPath, entry.name);
            const remoteChild = joinRemotePath(remotePath, entry.name);
            if (entry.isDirectory()) {
                await this.uploadDirectory(sftp, localChild, remoteChild, onDelta, progressId);
            }
            else if (entry.isFile()) {
                await this.fastPut(sftp, localChild, remoteChild, this.createSftpTransferOptions(onDelta, progressId));
            }
        });
    }
    async downloadDirectory(sftp, remotePath, localPath, onDelta, progressId) {
        this.throwIfTransferCanceled(progressId);
        await fsp.mkdir(localPath, { recursive: true });
        const entries = await this.readRemoteDirectory(sftp, remotePath);
        await mapLimit(entries, SFTP_DIRECTORY_ENTRY_CONCURRENCY, async (entry) => {
            this.throwIfTransferCanceled(progressId);
            if (entry.filename === '.' || entry.filename === '..') {
                return;
            }
            const remoteChild = joinRemotePath(remotePath, entry.filename);
            const localChild = join(localPath, entry.filename);
            if (entry.attrs.isDirectory()) {
                await this.downloadDirectory(sftp, remoteChild, localChild, onDelta, progressId);
            }
            else if (entry.attrs.isFile() || entry.attrs.isSymbolicLink()) {
                await fsp.mkdir(dirname(localChild), { recursive: true });
                await this.fastGet(sftp, remoteChild, localChild, this.createSftpTransferOptions(onDelta, progressId));
            }
        });
    }
    async deleteRemoteDirectory(sftp, remotePath) {
        const entries = await this.readRemoteDirectory(sftp, remotePath);
        for (const entry of entries) {
            if (entry.filename === '.' || entry.filename === '..') {
                continue;
            }
            const childPath = joinRemotePath(remotePath, entry.filename);
            if (entry.attrs.isDirectory()) {
                await this.deleteRemoteDirectory(sftp, childPath);
            }
            else {
                await this.unlinkRemote(sftp, childPath);
            }
        }
        await this.rmdirRemote(sftp, remotePath);
    }
    toRemoteEntry(parentPath, entry) {
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
    async getNativeRequire() {
        if (!this.nativeRequire) {
            const nodeModule = await import('node:module');
            this.nativeRequire = nodeModule.createRequire(import.meta.url);
        }
        return this.nativeRequire;
    }
}
async function readWindowsClipboardFilePaths() {
    const paths = [];
    const acceptPath = (path) => {
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
async function readWindowsClipboardDropListPaths() {
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
function parseWindowsClipboardBuffer(buffer, encoding) {
    if (!buffer.byteLength) {
        return [];
    }
    return buffer.toString(encoding).replace(/\0+$/g, '').split('\0').filter(Boolean);
}
function readWindowsClipboardOperation() {
    const dropEffect = clipboard.readBuffer('Preferred DropEffect');
    if (dropEffect.byteLength >= 4 && (dropEffect.readUInt32LE(0) & 2) === 2) {
        return 'move';
    }
    return 'copy';
}
function isWindowsClipboardPath(path) {
    return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}
function resolveLocalWindowsRealPath(path) {
    const realpath = fsp.realpath;
    return realpath.native ? realpath.native(path) : fsp.realpath(path);
}
// Match WinSCP's SCP path: run remote "scp -t/-f" and speak the SCP wire protocol over the SSH channel.
class ScpProtocolReader {
    constructor(stream) {
        this.chunks = [];
        this.waiters = [];
        this.closed = false;
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
    async readByte() {
        const buffer = await this.readBytes(1);
        return buffer[0];
    }
    async readLine() {
        const parts = [];
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
    async readBytes(byteLength) {
        const parts = [];
        let remaining = byteLength;
        while (remaining > 0) {
            await this.waitForData();
            const chunk = this.takeFromFirstChunk(Math.min(remaining, this.chunks[0].byteLength));
            parts.push(chunk);
            remaining -= chunk.byteLength;
        }
        return Buffer.concat(parts, byteLength);
    }
    async waitForData() {
        if (this.streamError) {
            throw this.streamError;
        }
        if (this.chunks.length) {
            return;
        }
        if (this.closed) {
            throw new Error('SCP stream closed unexpectedly.');
        }
        await new Promise(resolve => this.waiters.push(resolve));
        if (this.streamError) {
            throw this.streamError;
        }
        if (!this.chunks.length && this.closed) {
            throw new Error('SCP stream closed unexpectedly.');
        }
    }
    takeFromFirstChunk(byteLength) {
        const chunk = this.chunks[0];
        if (byteLength >= chunk.byteLength) {
            this.chunks.shift();
            return chunk;
        }
        const head = chunk.subarray(0, byteLength);
        this.chunks[0] = chunk.subarray(byteLength);
        return head;
    }
    flushWaiters() {
        const waiters = this.waiters.splice(0);
        for (const waiter of waiters) {
            waiter();
        }
    }
}
async function readScpResponse(reader, context) {
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
async function readScpFileHeader(reader, stream) {
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
async function readScpFilePayload(reader, localPath, byteLength, onProgress) {
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
    }
    catch (error) {
        output.destroy();
        throw error;
    }
}
function writeScpData(stream, data) {
    return new Promise((resolve, reject) => {
        try {
            if (stream.write(data)) {
                resolve();
                return;
            }
            const cleanup = () => {
                stream.off('drain', onDrain);
                stream.off('error', onError);
            };
            const onDrain = () => {
                cleanup();
                resolve();
            };
            const onError = (error) => {
                cleanup();
                reject(error);
            };
            stream.once('drain', onDrain);
            stream.once('error', onError);
        }
        catch (error) {
            reject(error);
        }
    });
}
function writeLocalStream(stream, data) {
    return new Promise((resolve, reject) => {
        if (stream.write(data)) {
            resolve();
            return;
        }
        const cleanup = () => {
            stream.off('drain', onDrain);
            stream.off('error', onError);
        };
        const onDrain = () => {
            cleanup();
            resolve();
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        stream.once('drain', onDrain);
        stream.once('error', onError);
    });
}
function endLocalStream(stream) {
    return new Promise((resolve, reject) => {
        stream.once('error', reject);
        stream.end(resolve);
    });
}
function waitForScpClose(stream) {
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
function formatScpMode(mode) {
    return (mode & 0o777).toString(8).padStart(4, '0');
}
function sanitizeScpFileName(name) {
    return name.replace(/[\r\n]/g, '_') || 'payload';
}
function getTransferStrategy(source, target) {
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
function transferAttemptToStrategy(attempt) {
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
function transferAttemptToDirectionalStrategy(source, target, attempt) {
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
function getSshToSshTransferProtocol(source) {
    return source.preferredProtocol ?? 'auto-fast';
}
function formatTransferStrategyName(strategy) {
    return strategy.replace(/-/g, ' ');
}
function getDirectFallbackProgress(error) {
    if (error instanceof TurboFileDirectUnavailableError) {
        return { detail: '直连不可用，正在中转。', directFallbackReason: 'unavailable' };
    }
    if (error instanceof TurboFileDirectDataError) {
        return { detail: '直连传输失败，正在中转。', directFallbackReason: 'data-failure' };
    }
    return undefined;
}
function formatTransferError(error) {
    return error instanceof Error ? error.message : String(error);
}
function canBatchRsyncPreserveTargetNames(items) {
    return items.every(item => item.targetName === getTransferName(item.sourcePath));
}
function getLocalCommandTransferProtocolOrder(preferredProtocol, connection) {
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
function getDirectoryLocalCommandTransferProtocolOrder(preferredProtocol) {
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
function shouldPreferTarForMultiItemTransfer(preferredProtocol) {
    return preferredProtocol === undefined || preferredProtocol === 'auto-fast' || preferredProtocol === 'tar';
}
function shouldPreferTarForBatchTransfer(request) {
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
function forceBatchTransferProtocol(request, preferredProtocol) {
    return {
        ...request,
        source: request.source.kind === 'ssh' ? { ...request.source, preferredProtocol } : request.source,
        targetDirectory: request.targetDirectory.kind === 'ssh' ? { ...request.targetDirectory, preferredProtocol } : request.targetDirectory
    };
}
function canUseNativeOpenSshScpCommand(connection) {
    if (!connection) {
        return false;
    }
    return !!connection.password || !!connection.privateKeyPath || !!connection.privateKey || !connection.passphrase;
}
async function withNativeOpenSshArgs(connection, tool, remoteCommand, task) {
    let tempPrivateKeyPath;
    let tempPasswordPath;
    let tempAskPassPath;
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
    let env = tool.env;
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
    }
    else {
        args.push('-o', 'BatchMode=yes');
    }
    if (connection.port && connection.port !== 22) {
        args.push('-p', String(connection.port));
    }
    if (connection.privateKeyPath) {
        args.push('-i', toOpenSshLocalPath(connection.privateKeyPath));
    }
    else if (connection.privateKey) {
        tempPrivateKeyPath = join(tmpdir(), `turbofile-native-ssh-${randomUUID()}.key`);
        await fsp.writeFile(tempPrivateKeyPath, connection.privateKey, { mode: 0o600 });
        args.push('-i', toOpenSshLocalPath(tempPrivateKeyPath));
    }
    args.push(`${connection.username}@${connection.host}`, remoteCommand);
    try {
        return await task(args, env);
    }
    finally {
        await Promise.all([
            tempPrivateKeyPath ? fsp.rm(tempPrivateKeyPath, { force: true }).catch(() => undefined) : undefined,
            tempPasswordPath ? fsp.rm(tempPasswordPath, { force: true }).catch(() => undefined) : undefined,
            tempAskPassPath ? fsp.rm(tempAskPassPath, { force: true }).catch(() => undefined) : undefined
        ]);
    }
}
async function withNativeOpenSshScpBaseArgs(connection, task, legacyProtocol = false) {
    let tempPrivateKeyPath;
    let tempPasswordPath;
    let tempAskPassPath;
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
    let env;
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
    }
    else {
        args.push('-o', 'BatchMode=yes');
    }
    if (connection.port && connection.port !== 22) {
        args.push('-P', String(connection.port));
    }
    if (connection.privateKeyPath) {
        args.push('-i', toOpenSshLocalPath(connection.privateKeyPath));
    }
    else if (connection.privateKey) {
        tempPrivateKeyPath = join(tmpdir(), `turbofile-native-scp-${randomUUID()}.key`);
        await fsp.writeFile(tempPrivateKeyPath, connection.privateKey, { mode: 0o600 });
        args.push('-i', toOpenSshLocalPath(tempPrivateKeyPath));
    }
    try {
        return await task(args, env);
    }
    finally {
        await Promise.all([
            tempPrivateKeyPath ? fsp.rm(tempPrivateKeyPath, { force: true }).catch(() => undefined) : undefined,
            tempPasswordPath ? fsp.rm(tempPasswordPath, { force: true }).catch(() => undefined) : undefined,
            tempAskPassPath ? fsp.rm(tempAskPassPath, { force: true }).catch(() => undefined) : undefined
        ]);
    }
}
function formatNativeScpRemoteSpec(connection, remotePath) {
    return `${connection.username}@${connection.host}:${remotePath}`;
}
function getNativeScpLocalDirectoryContentsPath(localPath) {
    const trimmed = localPath.replace(/[\\/]+$/g, '');
    const separator = trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/';
    return `${trimmed}${separator}.`;
}
function getRemoteDirectoryContentsPath(remotePath) {
    return `${ensureTrailingRemoteSlash(trimTrailingRemoteSlash(remotePath))}.`;
}
function isRecoverableLocalCommandTransferError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /not recognized|ENOENT|No such file|could not create directory|Permission denied|Connection|timed out|failed|lost connection|rsync error|size mismatch/i.test(message);
}
let localSshToolPromise;
let localZstdToolPromise;
let localRsyncToolPromise;
function resolveLocalSshTool() {
    localSshToolPromise ??= doResolveLocalSshTool();
    return localSshToolPromise;
}
async function doResolveLocalSshTool() {
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
function createLocalSshTool(executable) {
    const executableDirectory = /[\\/]/.test(executable) ? dirname(executable) : undefined;
    const env = createLocalToolEnvironment(executableDirectory);
    return { executable, env };
}
function resolveLocalZstdTool() {
    localZstdToolPromise ??= doResolveLocalZstdTool();
    return localZstdToolPromise;
}
async function doResolveLocalZstdTool() {
    if (platform() !== 'win32') {
        return createLocalZstdTool('zstd');
    }
    const whereOutput = await runLocalCommandBuffer('where.exe', ['zstd.exe'], 1024 * 1024);
    const executable = whereOutput.toString().split(/\r?\n/).map(line => line.trim()).find(line => !!line) ?? 'zstd.exe';
    return createLocalZstdTool(executable);
}
function createLocalZstdTool(executable) {
    const executableDirectory = /[\\/]/.test(executable) ? dirname(executable) : undefined;
    const env = createLocalToolEnvironment(executableDirectory);
    return { executable, env };
}
function resolveLocalRsyncTool() {
    localRsyncToolPromise ??= doResolveLocalRsyncTool();
    return localRsyncToolPromise;
}
async function doResolveLocalRsyncTool() {
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
async function createLocalRsyncTool(executable, pathFlavor) {
    const executableDirectory = /[\\/]/.test(executable) ? dirname(executable) : undefined;
    const sshCandidate = executableDirectory ? join(executableDirectory, 'ssh.exe') : undefined;
    const sshExecutable = sshCandidate && await localPathExists(sshCandidate) ? sshCandidate : undefined;
    const env = createLocalToolEnvironment(executableDirectory);
    if (executableDirectory) {
        env.CWRSYNCHOME ??= executableDirectory;
    }
    return { executable, sshExecutable, pathFlavor, env };
}
function createLocalToolEnvironment(executableDirectory) {
    const env = { ...process.env };
    if (executableDirectory) {
        const pathDelimiter = platform() === 'win32' ? ';' : ':';
        env.PATH = [executableDirectory, env.PATH].filter((value) => !!value).join(pathDelimiter);
    }
    if (platform() === 'win32' && env.USERPROFILE) {
        env.HOME = env.USERPROFILE;
    }
    env.LC_ALL ??= 'C';
    env.LANG ??= 'C';
    return env;
}
function getBundledLocalRsyncCandidates() {
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
    ].filter((value) => !!value);
    return [...new Set(roots.map(root => join(root, relativePath)))];
}
function getBundledLocalSshCandidates() {
    return getBundledLocalRsyncCandidates().map(candidate => join(dirname(candidate), 'ssh.exe'));
}
function safeGetElectronAppPath() {
    try {
        return app.getAppPath();
    }
    catch {
        return process.cwd();
    }
}
async function localPathExists(path) {
    try {
        await fsp.access(path);
        return true;
    }
    catch {
        return false;
    }
}
async function withLocalRsyncSshEnvironment(connection, tool, task) {
    const askPassSecret = connection.password ?? connection.passphrase;
    let tempPrivateKeyPath;
    let tempPasswordPath;
    let tempAskPassPath;
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
        }
        else {
            await fsp.writeFile(tempAskPassPath, `#!/bin/sh\ncat ${quotePosixShellArg(tempPasswordPath)}\n`, { mode: 0o700 });
        }
        await fsp.chmod(tempAskPassPath, 0o700).catch(() => undefined);
        return await task({
            ...tool.env,
            SSH_ASKPASS: isWindowsHost ? tempAskPassPath : toRsyncLocalPath(tempAskPassPath, tool.pathFlavor),
            SSH_ASKPASS_REQUIRE: 'force',
            DISPLAY: 'turbofile'
        }, tempPrivateKeyPath);
    }
    finally {
        await Promise.all([
            tempPrivateKeyPath ? fsp.rm(tempPrivateKeyPath, { force: true }).catch(() => undefined) : undefined,
            tempPasswordPath ? fsp.rm(tempPasswordPath, { force: true }).catch(() => undefined) : undefined,
            tempAskPassPath ? fsp.rm(tempAskPassPath, { force: true }).catch(() => undefined) : undefined
        ]);
    }
}
function buildLocalRsyncSshTransport(connection, sshExecutable, identityPathOverride) {
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
    }
    else {
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
function formatLocalRsyncCommand(command) {
    return /[\\/]/.test(command) ? quoteLocalShellArg(toRsyncLocalPath(command)) : command;
}
function formatRsyncRemoteSpec(connection, remotePath) {
    return `${connection.username}@${connection.host}:${remotePath}`;
}
function toRsyncLocalPath(path, flavor = 'cygwin') {
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
function toOpenSshLocalPath(path) {
    return path.replace(/\\/g, '/');
}
function normalizeTarListPath(path) {
    return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}
function quoteLocalShellArg(value) {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}
function getDirectSshRouteCacheKey(source, target) {
    return `${getSshConnectionRouteKey(source)}=>${getSshConnectionRouteKey(target)}`;
}
function getSshConnectionRouteKey(connection) {
    const auth = connection.password ? 'password' : connection.privateKeyPath || connection.privateKey ? 'privateKey' : 'agent';
    return `${connection.username}@${connection.host}:${connection.port || 22}:${auth}`;
}
function getFileTypeFromStats(stats) {
    return stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : stats.isSymbolicLink() ? 'symlink' : 'unknown';
}
function joinRemotePath(parentPath, name) {
    if (!parentPath || parentPath === '/') {
        return `/${name}`;
    }
    const separator = parentPath.includes('\\') && !parentPath.includes('/') ? '\\' : '/';
    return parentPath.endsWith('/') || parentPath.endsWith('\\') ? `${parentPath}${name}` : `${parentPath}${separator}${name}`;
}
function getRemoteParentPath(path) {
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
function buildShellBootstrapCommand(cwd) {
    const commands = [
        'stty echo',
        'printf "\\033[H\\033[2J\\033[3J"',
        cwd ? `cd ${quotePosixShellArg(cwd)} 2>/dev/null || true` : undefined,
        `printf "\\n${SSH_TERMINAL_READY_MARKER}\\n"`
    ].filter((command) => !!command);
    return `${commands.join('; ')}\n`;
}
function ensureTrailingRemoteSlash(path) {
    return path.endsWith('/') || path.endsWith('\\') ? path : `${path}/`;
}
function trimTrailingRemoteSlash(path) {
    const trimmed = path.replace(/[\\/]+$/g, '');
    return trimmed || '/';
}
function getRemoteDirectoryFallbackPaths(options, path) {
    const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
    const username = options.username;
    const candidates = [];
    const add = (candidate) => {
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
async function mapLimit(items, limit, mapper) {
    const results = new Array(items.length);
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
function getTransferName(path) {
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    if (slash >= 0) {
        return path.substring(slash + 1);
    }
    return basename(path);
}
function quotePosixShellArg(value) {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}
function normalizeTransferDependencies(packages) {
    const allowed = new Set(['rsync', 'sshpass']);
    const normalized = [];
    for (const pkg of packages) {
        if (allowed.has(pkg) && !normalized.includes(pkg)) {
            normalized.push(pkg);
        }
    }
    return normalized;
}
function getMissingTransferDependencies(packages, capabilities) {
    return packages.filter(pkg => pkg === 'rsync' ? !capabilities.rsync : !capabilities.sshpass);
}
function buildTransferDependencyInstallCommand(packages, options) {
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
function buildTarCreateFromDirectoryCommand(path) {
    return `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(path)} .`;
}
function buildTarCreateFromItemsCommand(parentPath, names) {
    const itemArgs = names.map(name => quotePosixShellArg(name)).join(' ');
    return `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(parentPath)} -- ${itemArgs}`;
}
function buildTarExtractToExactDirectoryCommand(path) {
    const target = quotePosixShellArg(path);
    return `command -v tar >/dev/null 2>&1 && rm -rf -- ${target} && mkdir -p -- ${target} && tar -xf - -C ${target}`;
}
function buildPrepareTarExtractToExactDirectoryCommand(path) {
    const target = quotePosixShellArg(path);
    return `command -v tar >/dev/null 2>&1 && rm -rf -- ${target} && mkdir -p -- ${target}`;
}
function buildTarExtractStreamToDirectoryCommand(path) {
    const target = quotePosixShellArg(path);
    return `command -v tar >/dev/null 2>&1 && tar -xf - -C ${target}`;
}
function buildPrepareTarZstdExtractToExactDirectoryCommand(path) {
    const target = quotePosixShellArg(path);
    return `command -v tar >/dev/null 2>&1 && command -v zstd >/dev/null 2>&1 && rm -rf -- ${target} && mkdir -p -- ${target}`;
}
function buildTarZstdExtractToDirectoryCommand(path) {
    const target = quotePosixShellArg(path);
    return `command -v tar >/dev/null 2>&1 && command -v zstd >/dev/null 2>&1 && zstd -d -c | tar -xf - -C ${target}`;
}
function buildTarExtractToDirectoryCommand(targetDirectory, targetNames) {
    const target = quotePosixShellArg(targetDirectory);
    const cleanupTargets = targetNames.map(name => quotePosixShellArg(joinRemotePath(targetDirectory, name))).join(' ');
    const cleanup = cleanupTargets ? `rm -rf -- ${cleanupTargets} && ` : '';
    return `command -v tar >/dev/null 2>&1 && mkdir -p -- ${target} && ${cleanup}tar -xf - -C ${target}`;
}
function buildPrepareTarExtractToDirectoryFromListCommand(targetDirectory, requireZstd) {
    const target = quotePosixShellArg(targetDirectory);
    const commands = [
        'set -e',
        'command -v tar >/dev/null 2>&1',
        requireZstd ? 'command -v zstd >/dev/null 2>&1' : undefined,
        `mkdir -p -- ${target}`,
        'LC_ALL=C xargs -0 -r rm -rf --'
    ].filter((command) => !!command);
    return `bash -lc ${quotePosixShellArg(commands.join('; '))}`;
}
function buildTarSourcePushCommand(sourcePath, targetPath, targetUserHost, sshCommand, sshpassPrefix) {
    const prepareTarget = `rm -rf -- ${quotePosixShellArg(targetPath)} && mkdir -p -- ${quotePosixShellArg(targetPath)} && command -v tar >/dev/null 2>&1`;
    const extractTarget = `tar -xf - -C ${quotePosixShellArg(targetPath)}`;
    const remoteShell = `${sshpassPrefix}${sshCommand} ${quotePosixShellArg(targetUserHost)}`;
    return buildPipefailBashCommand(`command -v tar >/dev/null 2>&1 && ${buildDirectTarProgressPrerequisiteCommand()} && ${remoteShell} ${quotePosixShellArg(prepareTarget)} && tar -cf - -C ${quotePosixShellArg(sourcePath)} . | ${buildDirectTarProgressPipeCommand()} | ${remoteShell} ${quotePosixShellArg(extractTarget)}`);
}
function buildTarItemsSourcePushCommand(parentPath, names, targetDirectory, targetNames, targetUserHost, sshCommand, sshpassPrefix) {
    const target = quotePosixShellArg(targetDirectory);
    const cleanupTargets = targetNames.map(name => quotePosixShellArg(joinRemotePath(targetDirectory, name))).join(' ');
    const cleanup = cleanupTargets ? `rm -rf -- ${cleanupTargets} && ` : '';
    const prepareTarget = `command -v tar >/dev/null 2>&1 && mkdir -p -- ${target} && ${cleanup}true`;
    const extractTarget = `tar -xf - -C ${target}`;
    const remoteShell = `${sshpassPrefix}${sshCommand} ${quotePosixShellArg(targetUserHost)}`;
    return buildPipefailBashCommand(`${buildDirectTarProgressPrerequisiteCommand()} && ${remoteShell} ${quotePosixShellArg(prepareTarget)} && ${buildTarCreateFromItemsCommand(parentPath, names)} | ${buildDirectTarProgressPipeCommand()} | ${remoteShell} ${quotePosixShellArg(extractTarget)}`);
}
function buildPreparedTarItemsSourcePushCommand(sourceCommand, targetDirectory, targetUserHost, sshCommand, sshpassPrefix) {
    const remoteShell = `${sshpassPrefix}${sshCommand} ${quotePosixShellArg(targetUserHost)}`;
    const extractTarget = `command -v tar >/dev/null 2>&1 && tar -xf - -C ${quotePosixShellArg(targetDirectory)}`;
    return buildPipefailBashCommand(`${buildDirectTarProgressPrerequisiteCommand()} && ${sourceCommand} | ${buildDirectTarProgressPipeCommand()} | ${remoteShell} ${quotePosixShellArg(extractTarget)}`);
}
function buildTarTargetPullCommand(sourcePath, targetPath, sourceUserHost, sshCommand, sshpassPrefix) {
    const createSource = `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(sourcePath)} .`;
    return buildPipefailBashCommand(`command -v tar >/dev/null 2>&1 && ${buildDirectTarProgressPrerequisiteCommand()} && rm -rf -- ${quotePosixShellArg(targetPath)} && mkdir -p -- ${quotePosixShellArg(targetPath)} && ${sshpassPrefix}${sshCommand} ${quotePosixShellArg(sourceUserHost)} ${quotePosixShellArg(createSource)} | ${buildDirectTarProgressPipeCommand()} | tar -xf - -C ${quotePosixShellArg(targetPath)}`);
}
function buildTarItemsTargetPullCommand(parentPath, names, targetDirectory, targetNames, sourceUserHost, sshCommand, sshpassPrefix) {
    const target = quotePosixShellArg(targetDirectory);
    const cleanupTargets = targetNames.map(name => quotePosixShellArg(joinRemotePath(targetDirectory, name))).join(' ');
    const cleanup = cleanupTargets ? `rm -rf -- ${cleanupTargets} && ` : '';
    const createSource = buildTarCreateFromItemsCommand(parentPath, names);
    return buildPipefailBashCommand(`command -v tar >/dev/null 2>&1 && ${buildDirectTarProgressPrerequisiteCommand()} && mkdir -p -- ${target} && ${cleanup}${sshpassPrefix}${sshCommand} ${quotePosixShellArg(sourceUserHost)} ${quotePosixShellArg(createSource)} | ${buildDirectTarProgressPipeCommand()} | tar -xf - -C ${target}`);
}
function buildPreparedTarItemsTargetPullCommand(sourceCommand, targetDirectory, sourceUserHost, sshCommand, sshpassPrefix) {
    const target = quotePosixShellArg(targetDirectory);
    return buildPipefailBashCommand(`command -v tar >/dev/null 2>&1 && ${buildDirectTarProgressPrerequisiteCommand()} && ${sshpassPrefix}${sshCommand} ${quotePosixShellArg(sourceUserHost)} ${quotePosixShellArg(sourceCommand)} | ${buildDirectTarProgressPipeCommand()} | tar -xf - -C ${target}`);
}
function buildPipefailBashCommand(command) {
    return `bash -lc ${quotePosixShellArg(`set -o pipefail\n${command}`)}`;
}
function buildDirectTarProgressPipeCommand() {
    return 'LC_ALL=C dd bs=4M status=progress';
}
function buildDirectTarProgressPrerequisiteCommand() {
    return 'command -v dd >/dev/null 2>&1 && dd if=/dev/null of=/dev/null status=progress 2>/dev/null';
}
function writeInputToWritableStream(stream, input, context) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback) => {
            if (settled) {
                return;
            }
            settled = true;
            callback();
        };
        // Keep this listener attached after the write callback as a defensive sink for a late EPIPE.
        // A closed SSH/process stdin must become a normal rejected operation, never an uncaught main-
        // process exception dialog.
        stream.on('error', error => finish(() => reject(new Error(`${context}: ${error.message}`))));
        try {
            stream.end(Buffer.from(input), () => finish(resolve));
        }
        catch (error) {
            finish(() => reject(error instanceof Error ? error : new Error(String(error))));
        }
    });
}
function waitForLocalProcessClose(child, context) {
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
function createProgressPassThrough(onDelta) {
    const stream = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });
    if (onDelta) {
        stream.on('data', chunk => {
            onDelta(Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(String(chunk)));
        });
    }
    return stream;
}
function runLocalCommand(command, args, options = {}) {
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
function killLocalProcessTree(child) {
    if (child.pid && platform() === 'win32') {
        execFile('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => undefined);
        return;
    }
    child.kill('SIGTERM');
}
function runLocalCommandBuffer(command, args, maxBuffer = 10 * 1024 * 1024) {
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
function formatLocalCommandError(stderr, fallback) {
    const message = (stderr ?? '').trim();
    if (!message) {
        return fallback;
    }
    if (message.startsWith('#< CLIXML') && message.includes('System.Management.Automation.PSCustomObject')) {
        return fallback;
    }
    return message;
}
function runLocalPowerShellScript(script) {
    return runLocalCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShellCommand(script)]);
}
function runLocalPowerShellStaScriptBuffer(script, maxBuffer = 10 * 1024 * 1024) {
    return runLocalCommandBuffer('powershell.exe', ['-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShellCommand(script)], maxBuffer);
}
function createWindowsDragIcon() {
    const icon = nativeImage.createFromDataURL(WINDOWS_DRAG_ICON_DATA_URL);
    return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}
async function getWindowsExplorerVisibleLocalNames(path) {
    if (platform() !== 'win32') {
        return undefined;
    }
    try {
        const stdout = await runLocalCommandBuffer('cmd.exe', ['/d', '/u', '/c', 'dir', '/b', '/a:-h-s', path], 64 * 1024 * 1024);
        return new Set(stdout.toString('utf16le').replace(/^\uFEFF/, '').split(/\r?\n/).filter(name => !!name));
    }
    catch {
        return undefined;
    }
}
function runLocalRobocopyCommand(args) {
    return runLocalRobocopyCommandBuffer(args).then(() => undefined);
}
function runLocalRobocopyCommandBuffer(args) {
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
async function ensureLocalParentDirectory(path) {
    const parent = dirname(path);
    await ensureLocalDirectory(parent);
}
async function ensureLocalDirectory(path) {
    if (!path || isLocalFilesystemRoot(path)) {
        return;
    }
    await fsp.mkdir(path, { recursive: true });
}
function isLocalFilesystemRoot(path) {
    const normalized = path.replace(/[\\/]+$/, '');
    return !normalized || normalized === '/' || normalized === '\\' || /^[A-Za-z]:$/.test(normalized) || /^\\\\[^\\]+\\[^\\]+$/.test(normalized);
}
function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
function isSameSshConnection(left, right) {
    return left.host === right.host
        && (left.port || 22) === (right.port || 22)
        && left.username === right.username;
}
function buildOptimizedRsyncSshCommand(port, hasPassword = false, sshBinary = 'ssh') {
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
    }
    else {
        parts.push('-o BatchMode=yes');
    }
    if (port && port !== 22) {
        parts.push(`-p ${port}`);
    }
    return parts.join(' ');
}
function buildOptimizedSftpCommand(port, hasPassword = false) {
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
    }
    else {
        parts.push('-o BatchMode=yes');
    }
    if (port && port !== 22) {
        parts.push(`-P ${port}`);
    }
    return parts.join(' ');
}
function shouldPreferLegacyScpMode(connection) {
    return !!connection.port && connection.port !== 22;
}
function buildDirectScpCommand(port, hasPassword = false, identityPath, recursive = false) {
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
    }
    else {
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
function buildDirectScpSshCommand(port, hasPassword = false, identityPath) {
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
    }
    else {
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
function buildCompatibleSshCommand(port, hasPassword = false) {
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
    }
    else {
        parts.push('-o BatchMode=yes');
    }
    if (port && port !== 22) {
        parts.push(`-p ${port}`);
    }
    return parts.join(' ');
}
function buildSshpassPrefix(password) {
    return password ? `sshpass -p ${quotePosixShellArg(password)} ` : '';
}
function quoteSftpBatchPath(value) {
    return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}
function quotePowerShellLiteral(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
function encodePowerShellCommand(script) {
    return Buffer.from(script, 'utf16le').toString('base64');
}
function buildPowerShellCommand(script) {
    return `powershell -NoProfile -NonInteractive -EncodedCommand ${encodePowerShellCommand(script)}`;
}
function withPowerShellDefaults(script) {
    return `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; ${script}`;
}
function buildLocalWindowsMoveScript(sourcePath, targetPath) {
    const source = quotePowerShellLiteral(sourcePath);
    const target = quotePowerShellLiteral(targetPath);
    return withPowerShellDefaults(`$src=${source}; $dst=${target}; Move-Item -LiteralPath $src -Destination $dst -Force`);
}
function buildWindowsMappedBatchFromInputScript(operation) {
    return withPowerShellDefaults([
        '$items=[Console]::In.ReadToEnd() | ConvertFrom-Json',
        '$completed=0',
        'foreach ($item in $items) {',
        '  $src=[string]$item.sourcePath',
        '  $dst=[string]$item.targetPath',
        ...(operation === 'copy' ? ['  if ([System.IO.File]::Exists($dst) -or [System.IO.Directory]::Exists($dst)) { throw "Target already exists: $dst" }'] : []),
        '  $parent=[System.IO.Path]::GetDirectoryName($dst)',
        '  if ($parent -and -not [System.IO.Directory]::Exists($parent)) { [System.IO.Directory]::CreateDirectory($parent) | Out-Null }',
        ...(operation === 'move'
            ? [
                '  if ([string]$item.sourceType -eq "directory") { [System.IO.Directory]::Move($src, $dst) }',
                '  elseif ([string]$item.sourceType -eq "file") { [System.IO.File]::Move($src, $dst) }',
                '  elseif ([System.IO.Directory]::Exists($src)) { [System.IO.Directory]::Move($src, $dst) }',
                '  else { [System.IO.File]::Move($src, $dst) }'
            ]
            : [
                '  if ([System.IO.Directory]::Exists($src)) { Copy-Item -LiteralPath $src -Destination $dst -Recurse }',
                '  else { [System.IO.File]::Copy($src, $dst, $false) }'
            ]),
        '  $completed++',
        '  if (($completed % 64) -eq 0) { [Console]::Out.WriteLine($completed) }',
        '}',
        '[Console]::Out.WriteLine($completed)'
    ].join('\n'));
}
function buildWindowsCopyCommand(sourcePath, targetPath) {
    const source = quotePowerShellLiteral(sourcePath);
    const target = quotePowerShellLiteral(targetPath);
    return buildPowerShellCommand(withPowerShellDefaults(`$src=${source}; $dst=${target}; $parent=[System.IO.Path]::GetDirectoryName($dst); if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }; Copy-Item -LiteralPath $src -Destination $dst -Force -Recurse`));
}
function buildWindowsMoveCommand(sourcePath, targetPath) {
    const source = quotePowerShellLiteral(sourcePath);
    const target = quotePowerShellLiteral(targetPath);
    return buildPowerShellCommand(withPowerShellDefaults(`$src=${source}; $dst=${target}; $parent=[System.IO.Path]::GetDirectoryName($dst); if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }; Move-Item -LiteralPath $src -Destination $dst -Force`));
}
function buildPosixCopyCommand(sourcePath, targetPath, reportProgress = false) {
    const source = quotePosixShellArg(sourcePath);
    const target = quotePosixShellArg(targetPath);
    const parent = quotePosixShellArg(getRemoteParentPath(targetPath));
    if (reportProgress) {
        const progressCopy = [
            'tf_copy_pid=',
            'tf_cleanup() { if [ -n "$tf_copy_pid" ]; then kill "$tf_copy_pid" 2>/dev/null || true; wait "$tf_copy_pid" 2>/dev/null || true; fi; }',
            "trap 'tf_cleanup; exit 130' HUP INT TERM",
            'tf_run_copy() {',
            '  "$@" &',
            '  tf_copy_pid=$!',
            '  tf_copy_last=0',
            '  while [ -r "/proc/$tf_copy_pid/stat" ]; do',
            "    tf_copy_state=$(awk '{ print $3 }' \"/proc/$tf_copy_pid/stat\" 2>/dev/null || true)",
            "    tf_copy_bytes=$(awk '$1 == \"rchar:\" { r=$2 } $1 == \"wchar:\" { w=$2 } $1 == \"read_bytes:\" { rb=$2 } $1 == \"write_bytes:\" { wb=$2 } END { m=r; if (w>m) m=w; if (rb>m) m=rb; if (wb>m) m=wb; print m+0 }' \"/proc/$tf_copy_pid/io\" 2>/dev/null || true)",
            '    case "$tf_copy_bytes" in \'\'|*[!0-9]*) tf_copy_bytes=0 ;; esac',
            '    if [ "$tf_copy_bytes" -gt "$tf_copy_last" ]; then tf_copy_last=$tf_copy_bytes; printf \'TURBOFILE_COPY_BYTES=%s\\n\' "$tf_copy_bytes" >&2; fi',
            '    [ "$tf_copy_state" = Z ] && break',
            '    sleep 0.5',
            '  done',
            '  wait "$tf_copy_pid"',
            '  tf_copy_status=$?',
            '  tf_copy_pid=',
            '  return "$tf_copy_status"',
            '}',
            `tf_run_copy cp -a --reflink=auto --sparse=always ${source} ${target} || tf_run_copy cp -a ${source} ${target}`
        ].join('\n');
        return `mkdir -p ${parent} && (${progressCopy})`;
    }
    return `mkdir -p ${parent} && (cp -a --reflink=auto --sparse=always ${source} ${target} 2>/dev/null || cp -a ${source} ${target})`;
}
function parseRemoteCopyProgressBytes(output) {
    let bytes = 0;
    for (const match of output.matchAll(/(?:^|\r?\n)TURBOFILE_COPY_BYTES=(\d+)/g)) {
        const value = Number(match[1]);
        if (Number.isFinite(value)) {
            bytes = Math.max(bytes, value);
        }
    }
    return bytes;
}
function buildWindowsMappedBatchFromInputCommand(operation) {
    return buildPowerShellCommand(buildWindowsMappedBatchFromInputScript(operation));
}
function buildLocalWindowsReverseParallelRsyncCommand(sourceConnection, sshTransport) {
    const rsyncOptions = [...buildLocalRsyncOptionArgs(true), '--iconv=UTF-8,UTF-8'].join(' ');
    const sshpassPrefix = buildSshpassPrefix(sourceConnection.password);
    const sourceUserHost = `${sourceConnection.username}@${sourceConnection.host}`;
    const script = [
        'set -o pipefail',
        'set -e',
        'command -v rsync >/dev/null 2>&1',
        'command -v sshpass >/dev/null 2>&1',
        'work=$(mktemp -d) || exit 1',
        'manifest="$work/manifest"',
        'direct_manifest="$work/direct"',
        'trap \'rm -rf -- "$work"\' EXIT HUP INT TERM',
        'cat > "$manifest"',
        'cleanup_count=0',
        'saw_end=0',
        'while IFS= read -r -d \'\' kind && IFS= read -r -d \'\' group_id && IFS= read -r -d \'\' source_path && IFS= read -r -d \'\' target_path && IFS= read -r -d \'\' value && IFS= read -r -d \'\' item_index; do',
        '  if [ "$kind" = Z ]; then saw_end=1; break; fi',
        '  if [ "$kind" = C ]; then rm -rf -- "$target_path" || exit 1; cleanup_count=$((cleanup_count + 1)); if [ $((cleanup_count % 64)) -eq 0 ]; then printf "." >&2; fi; continue; fi',
        '  if [ "$kind" = G ]; then list="$work/group-$group_id.list"; meta="$work/group-$group_id.meta"; if [ ! -e "$meta" ]; then printf "%s\\0%s\\0%s\\0" "$source_path" "$target_path" "$item_index" > "$meta"; fi; printf "%s\\0" "$value" >> "$list"; continue; fi',
        '  if [ "$kind" = D ]; then printf "%s\\0%s\\0%s\\0%s\\0" "$source_path" "$target_path" "$value" "$item_index" >> "$direct_manifest"; fi',
        'done < "$manifest"',
        '[ "$saw_end" -eq 1 ] || exit 1',
        'run_group() {',
        '  source_path=$1; target_path=$2; list_path=$3; item_index=$4',
        '  source_path=${source_path%/}/; destination=${target_path%/}/',
        `  source_spec=${quotePosixShellArg(`${sourceUserHost}:`)}$source_path`,
        `  mkdir -p -- "$target_path" && ${sshpassPrefix}rsync ${rsyncOptions} --files-from="$list_path" --from0 -r -e ${quotePosixShellArg(sshTransport)} "$source_spec" "$destination" 2>&1 | tr '\\r' '\\n' | awk -v tag="__TURBOFILE_RSYNC_${'$'}{item_index}__ " ${quotePosixShellArg('$0 ~ /%/ { now=systime(); if (now != last || $0 ~ /100%/) { print tag $0; fflush(); last=now } }')}`,
        '}',
        'run_direct() {',
        '  source_path=$1; target_path=$2; directory=$3; item_index=$4',
        '  staging_path=',
        '  if [ "$directory" = 1 ]; then source_path=${source_path%/}/; destination=${target_path%/}/; mkdir_path=${target_path%/}; else mkdir_path=$(dirname -- "$target_path"); mkdir -p -- "$mkdir_path" || return 1; staging_path=$(mktemp -d -- "$mkdir_path/.turbofile-rsync.XXXXXX") || return 1; destination=${staging_path%/}/; fi',
        `  source_spec=${quotePosixShellArg(`${sourceUserHost}:`)}$source_path`,
        `  if mkdir -p -- "$mkdir_path" && ${sshpassPrefix}rsync ${rsyncOptions} -e ${quotePosixShellArg(sshTransport)} "$source_spec" "$destination" 2>&1 | tr '\\r' '\\n' | awk -v tag="__TURBOFILE_RSYNC_${'$'}{item_index}__ " ${quotePosixShellArg('$0 ~ /%/ { now=systime(); if (now != last || $0 ~ /100%/) { print tag $0; fflush(); last=now } }')}; then status=0; if [ "$directory" != 1 ]; then source_name=${'$'}{source_path##*/}; staged_source="$staging_path/$source_name"; mv -n -- "$staged_source" "$target_path" || status=$?; if [ "$status" -eq 0 ] && { [ -e "$staged_source" ] || [ -L "$staged_source" ]; }; then status=74; fi; fi; else status=$?; fi`,
        '  if [ -n "$staging_path" ]; then rm -rf -- "$staging_path"; fi',
        '  return "$status"',
        '}',
        'pids=()',
        'failed=0',
        'track_pid() { pids+=("$1"); if [ "${#pids[@]}" -ge ' + TURBOFILE_REVERSE_RSYNC_WORKERS + ' ]; then if ! wait "${pids[0]}"; then failed=1; fi; pids=("${pids[@]:1}"); fi; }',
        'shopt -s nullglob',
        'for meta in "$work"/group-*.meta; do exec 3< "$meta"; IFS= read -r -d \'\' source_path <&3; IFS= read -r -d \'\' target_path <&3; IFS= read -r -d \'\' item_index <&3; exec 3<&-; list_path=${meta%.meta}.list; run_group "$source_path" "$target_path" "$list_path" "$item_index" & track_pid "$!"; done',
        'if [ -f "$direct_manifest" ]; then while IFS= read -r -d \'\' source_path && IFS= read -r -d \'\' target_path && IFS= read -r -d \'\' directory && IFS= read -r -d \'\' item_index; do run_direct "$source_path" "$target_path" "$directory" "$item_index" & track_pid "$!"; done < "$direct_manifest"; fi',
        'for pid in "${pids[@]}"; do if ! wait "$pid"; then failed=1; fi; done',
        'if [ "$failed" -ne 0 ]; then exit 1; fi'
    ];
    return `bash -lc ${quotePosixShellArg(script.join('\n'))}`;
}
function buildLocalWindowsReverseParallelRsyncInput(items, cleanupTargets) {
    const records = [];
    for (const cleanupTarget of new Set(cleanupTargets.map(target => trimTrailingRemoteSlash(target)).filter(target => target && target !== '/'))) {
        records.push('C', '', '', cleanupTarget, '', '');
    }
    const mappings = items.map(item => ({ sourcePath: item.sourcePath, targetPath: item.targetPath }));
    const plan = createTurboFileRsyncMappedGroups(mappings);
    for (const [groupIndex, group] of plan.groups.entries()) {
        for (const relativePath of group.relativePaths) {
            records.push('G', String(groupIndex), group.sourceBase, group.targetBase, relativePath, String(items.length + groupIndex));
        }
    }
    const directMetadata = new Map();
    for (const [index, item] of items.entries()) {
        const key = `${item.sourcePath}\0${item.targetPath}`;
        const values = directMetadata.get(key) ?? [];
        values.push({ directory: item.directory, index });
        directMetadata.set(key, values);
    }
    for (const item of plan.direct) {
        const metadata = directMetadata.get(`${item.sourcePath}\0${item.targetPath}`)?.shift();
        records.push('D', '', item.sourcePath, item.targetPath, metadata?.directory ? '1' : '0', String(metadata?.index ?? 0));
    }
    records.push('Z', '', '', '', '', '');
    return createTarNullListBuffer(records);
}
function getLocalWindowsRsyncConfigPaths() {
    const candidates = [
        process.env.TURBOFILE_LOCAL_WINDOWS_CONFIG,
        process.env.TURBOFILE_WEB_CONFIG,
        join(process.cwd(), '..', 'TurboFile-web', 'data', 'config.json'),
        join(app.getAppPath(), '..', 'TurboFile-web', 'data', 'config.json')
    ].filter((value) => !!value);
    return Array.from(new Set(candidates));
}
function getLocalIpv4Addresses() {
    const addresses = new Set();
    for (const entries of Object.values(networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family === 'IPv4' && !entry.internal) {
                addresses.add(entry.address);
            }
        }
    }
    return addresses;
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
function readStringProperty(source, key) {
    const value = source[key];
    return typeof value === 'string' && value ? value : undefined;
}
function readNumberProperty(source, key) {
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
function buildRsyncOptions(includeProgress) {
    return buildLocalRsyncOptionArgs(includeProgress).join(' ');
}
function parseRsyncSpeedBytesPerSecond(value, unit) {
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
function buildLocalRsyncOptionArgs(includeProgress) {
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
function buildRsyncPathWithMkdirOption(remoteDirectory) {
    return `--rsync-path=mkdir -p ${quotePosixShellArg(remoteDirectory)} && rsync`;
}
function buildRsyncPathWithMkdirShellOption(remoteDirectory) {
    return `--rsync-path=${quotePosixShellArg(`mkdir -p ${quotePosixShellArg(remoteDirectory)} && rsync`)}`;
}
function buildWindowsDeleteCommand(path, recursive) {
    const literalPath = path.replace(/'/g, "''");
    const recurseFlag = recursive ? ' -Recurse' : '';
    return `powershell -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $path='${literalPath}'; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force${recurseFlag} }"`;
}
function trashPathsEqual(left, right, windowsPath) {
    const normalize = (value) => {
        const normalized = windowsPath ? value.replace(/\//g, '\\') : value.replace(/\\/g, '/');
        const withoutTrailingSeparators = normalized.replace(windowsPath ? /\\+$/ : /\/+$/, '');
        return windowsPath ? withoutTrailingSeparators.toLowerCase() : withoutTrailingSeparators;
    };
    return normalize(left) === normalize(right);
}
function buildPosixTrashRootInvocations(functionName, rememberedRoots) {
    const remembered = rememberedRoots.map(root => `${functionName} ${quotePosixShellArg(root)}`).join('; ');
    return [
        remembered,
        `${functionName} "$HOME/.local/share/Trash/turbofile"`,
        'uid="$(id -u)"',
        `(findmnt -rn -o TARGET 2>/dev/null || df -P | awk 'NR>1 {print $6}') | while IFS= read -r mount_point; do [ -n "$mount_point" ] && ${functionName} "$mount_point/.Trash-$uid/turbofile"; done`
    ].filter(Boolean).join('; ');
}
function buildPosixTrashListCommand(rememberedRoots) {
    const pythonScript = [
        'import os',
        'import sys',
        'roots = sys.stdin.buffer.read().split(b"\\0")',
        'seen_roots = set()',
        'output = sys.stdout.buffer',
        'emitted = 0',
        'for root in roots:',
        '    if not root or root in seen_roots:',
        '        continue',
        '    seen_roots.add(root)',
        '    info = os.path.join(root, b"info")',
        '    try:',
        '        entries = os.scandir(info)',
        '    except OSError:',
        '        continue',
        '    with entries:',
        '        for entry in entries:',
        '            try:',
        '                if not entry.name.endswith(b".json") or not entry.is_file(follow_symlinks=False):',
        '                    continue',
        '                with open(entry.path, "rb") as metadata_file:',
        '                    metadata = metadata_file.read()',
        '                output.write(entry.path + b"\\0" + metadata + b"\\0")',
        '                emitted += 1',
        '                if emitted % 64 == 0:',
        '                    output.flush()',
        '            except OSError:',
        '                continue',
        'output.flush()'
    ].join('\n');
    const emitRootPath = 'emit_trash_root_path() { [ -n "$1" ] && printf "%s\\0" "$1"; }';
    const rootInput = buildPosixTrashRootInvocations('emit_trash_root_path', rememberedRoots);
    const emitRoot = 'emit_trash_root() { info="$1/info"; [ -d "$info" ] || return 0; find "$info" -maxdepth 1 -type f -name "*.json" -exec sh -c \'for metadata do printf "%s\\0" "$metadata"; cat -- "$metadata" || true; printf "\\0"; done\' sh {} +; }';
    return `${emitRootPath}; ${emitRoot}; if command -v python3 >/dev/null 2>&1; then { ${rootInput}; } | python3 -c ${quotePosixShellArg(pythonScript)}; else ${buildPosixTrashRootInvocations('emit_trash_root', rememberedRoots)}; fi`;
}
function buildWindowsTrashListCommand(deviceIdentity, rememberedRoots) {
    const userKey = createHash('sha256').update(deviceIdentity).digest('hex').slice(0, 12);
    const remembered = rememberedRoots.map(quotePowerShellLiteral).join(',');
    const script = withPowerShellDefaults([
        '$roots=[System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)',
        `foreach ($root in @(${remembered})) { if ($root) { [void]$roots.Add([string]$root) } }`,
        `Get-PSDrive -PSProvider FileSystem | ForEach-Object { [void]$roots.Add(([string]$_.Root).TrimEnd('\\') + '\\.turbofile-trash-${userKey}\\turbofile') }`,
        '$records=[System.Collections.Generic.List[object]]::new()',
        'foreach ($root in $roots) {',
        '  $info=Join-Path $root "info"',
        '  if (-not [System.IO.Directory]::Exists($info)) { continue }',
        '  foreach ($metadata in [System.IO.Directory]::EnumerateFiles($info, "*.json", [System.IO.SearchOption]::TopDirectoryOnly)) {',
        '    try { $records.Add([pscustomobject]@{ metadataPath=$metadata; metadata=[System.IO.File]::ReadAllText($metadata) }) } catch { }',
        '  }',
        '}',
        '[Console]::Out.Write((ConvertTo-Json -InputObject ([object[]]$records.ToArray()) -Compress -Depth 10))'
    ].join('; '));
    return buildPowerShellCommand(script);
}
function parseRemoteTrashMetadataRecords(output, windowsPath) {
    if (windowsPath) {
        const text = output.toString('utf8').trim();
        if (!text) {
            return [];
        }
        const parsed = JSON.parse(text);
        const values = Array.isArray(parsed) ? parsed : [parsed];
        return values
            .filter(value => value && typeof value.metadataPath === 'string' && typeof value.metadata === 'string')
            .map(value => ({ metadataPath: value.metadataPath, metadata: value.metadata }));
    }
    const frames = output.toString('utf8').split('\0');
    const records = [];
    for (let index = 0; index + 1 < frames.length; index += 2) {
        if (frames[index]) {
            records.push({ metadataPath: frames[index], metadata: frames[index + 1] });
        }
    }
    return records;
}
function buildPosixTrashPendingRecoveryCommand() {
    return 'LC_ALL=C xargs -0 -r -n 5 sh -c \'id=$1; src=$2; payload=$3; pending=$4; metadata=$5; if { [ -e "$payload" ] || [ -L "$payload" ]; } && ! { [ -e "$src" ] || [ -L "$src" ]; }; then if mv -- "$pending" "$metadata"; then printf "%s\\t1\\t\\n" "$id"; else printf "%s\\t0\\trecovery failed\\n" "$id"; fi; elif { [ -e "$src" ] || [ -L "$src" ]; } && ! { [ -e "$payload" ] || [ -L "$payload" ]; }; then rm -f -- "$pending"; printf "%s\\t0\\tdiscarded\\n" "$id"; else printf "%s\\t0\\tunresolved\\n" "$id"; fi\' _';
}
function buildWindowsTrashPendingRecoveryCommand() {
    const script = withPowerShellDefaults([
        '$items=[Console]::In.ReadToEnd() | ConvertFrom-Json',
        '$results=[System.Collections.Generic.List[object]]::new()',
        'foreach ($item in $items) {',
        '  try {',
        '    $sourceExists=[System.IO.File]::Exists([string]$item.sourcePath) -or [System.IO.Directory]::Exists([string]$item.sourcePath)',
        '    $payloadExists=[System.IO.File]::Exists([string]$item.payloadPath) -or [System.IO.Directory]::Exists([string]$item.payloadPath)',
        '    if ($payloadExists -and -not $sourceExists) { [System.IO.File]::Move([string]$item.pendingPath, [string]$item.metadataPath); [void]$results.Add([pscustomobject]@{ id=[string]$item.id; ok=$true; message="" }) }',
        '    elseif ($sourceExists -and -not $payloadExists) { [System.IO.File]::Delete([string]$item.pendingPath); [void]$results.Add([pscustomobject]@{ id=[string]$item.id; ok=$false; message="discarded" }) }',
        '    else { [void]$results.Add([pscustomobject]@{ id=[string]$item.id; ok=$false; message="unresolved" }) }',
        '  } catch { [void]$results.Add([pscustomobject]@{ id=[string]$item.id; ok=$false; message=$_.Exception.Message }) }',
        '}',
        '$results | ConvertTo-Json -Compress'
    ].join('; '));
    return buildPowerShellCommand(script);
}
function buildPosixTrashDeleteBatchCommand() {
    const script = [
        buildPosixHeartbeatFunction(),
        'ids=(); payloads=(); metadatas=()',
        "while IFS= read -r -d '' id && IFS= read -r -d '' payload && IFS= read -r -d '' metadata; do ids+=(\"$id\"); payloads+=(\"$payload\"); metadatas+=(\"$metadata\"); done",
        'delete_all() {',
        '  local total=${#ids[@]} start end index status args',
        '  for ((start=0; start<total; start+=64)); do',
        '    end=$((start + 64)); if [ "$end" -gt "$total" ]; then end=$total; fi',
        '    args=(); for ((index=start; index<end; index++)); do args+=("${payloads[index]}" "${metadatas[index]}"); done',
        '    status=1; if rm -rf -- "${args[@]}"; then status=0; fi',
        '    for ((index=start; index<end; index++)); do if [ "$status" -eq 0 ]; then printf "%s\\t1\\t\\n" "${ids[index]}"; else printf "%s\\t0\\tdelete failed\\n" "${ids[index]}"; fi; done',
        '  done',
        '}',
        'run_with_heartbeat delete_all'
    ].join('\n');
    return `bash -lc ${quotePosixShellArg(script)}`;
}
function buildWindowsTrashDeleteBatchCommand() {
    const script = withPowerShellDefaults([
        '$items=[Console]::In.ReadToEnd() | ConvertFrom-Json',
        '$results=[System.Collections.Generic.List[object]]::new()',
        '$completed=0',
        'foreach ($item in $items) {',
        '  try {',
        '    $payload=[string]$item.payloadPath',
        '    if ([System.IO.Directory]::Exists($payload)) { [System.IO.Directory]::Delete($payload, $true) } elseif ([System.IO.File]::Exists($payload)) { [System.IO.File]::Delete($payload) }',
        '    if ([System.IO.File]::Exists([string]$item.metadataPath)) { [System.IO.File]::Delete([string]$item.metadataPath) }',
        '    [void]$results.Add([pscustomobject]@{ id=[string]$item.id; ok=$true; message="" })',
        '  } catch { [void]$results.Add([pscustomobject]@{ id=[string]$item.id; ok=$false; message=$_.Exception.Message }) }',
        '  $completed++',
        '  if (($completed % 64) -eq 0) { [Console]::Error.WriteLine([string]$completed) }',
        '}',
        '[Console]::Error.WriteLine([string]$completed)',
        '$results | ConvertTo-Json -Compress'
    ].join('\n'));
    return buildPowerShellCommand(script);
}
function buildPosixTrashHasItemsCommand(rememberedRoots) {
    const hasRoot = 'find_trash_item() { info="$1/info"; [ -d "$info" ] || return 0; find "$info" -maxdepth 1 -type f -name "*.json" -print -quit 2>/dev/null; }';
    const invocations = buildPosixTrashRootInvocations('find_trash_item', rememberedRoots);
    return `${hasRoot}; if [ -n "$({ ${invocations}; } | head -n 1)" ]; then printf 1; else printf 0; fi`;
}
function buildWindowsTrashHasItemsCommand(deviceIdentity, rememberedRoots) {
    const userKey = createHash('sha256').update(deviceIdentity).digest('hex').slice(0, 12);
    const remembered = rememberedRoots.map(quotePowerShellLiteral).join(',');
    const script = withPowerShellDefaults([
        '$roots=[System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)',
        `foreach ($root in @(${remembered})) { if ($root) { [void]$roots.Add([string]$root) } }`,
        `Get-PSDrive -PSProvider FileSystem | ForEach-Object { [void]$roots.Add(([string]$_.Root).TrimEnd('\\') + '\\.turbofile-trash-${userKey}\\turbofile') }`,
        '$found=$false',
        'foreach ($root in $roots) {',
        '  $info=Join-Path $root "info"',
        '  if (-not [System.IO.Directory]::Exists($info)) { continue }',
        '  $enumerator=[System.IO.Directory]::EnumerateFiles($info, "*.json", [System.IO.SearchOption]::TopDirectoryOnly).GetEnumerator()',
        '  try { if ($enumerator.MoveNext()) { $found=$true; break } } finally { $enumerator.Dispose() }',
        '}',
        '[Console]::Out.Write($(if ($found) { "1" } else { "0" }))'
    ].join('; '));
    return buildPowerShellCommand(script);
}
function buildPosixTrashEmptyCommand(rememberedRoots) {
    const heartbeat = buildPosixHeartbeatFunction();
    const emptyRoot = 'empty_trash_root() { root=$1; info="$root/info"; count=0; if [ -d "$info" ]; then count=$(find "$info" -maxdepth 1 -type f -name "*.json" -printf "." 2>/dev/null | wc -c); fi; run_with_heartbeat rm -rf -- "$root/files" "$root/info"; total=$((total + count)); }';
    const remembered = rememberedRoots.map(root => `empty_trash_root ${quotePosixShellArg(root)}`).join('; ');
    const script = [
        'set -e',
        'set -o pipefail',
        heartbeat,
        'total=0',
        emptyRoot,
        remembered,
        'empty_trash_root "$HOME/.local/share/Trash/turbofile"',
        'uid="$(id -u)"',
        'while IFS= read -r mount_point; do if [ -n "$mount_point" ]; then empty_trash_root "$mount_point/.Trash-$uid/turbofile"; fi; done < <(findmnt -rn -o TARGET 2>/dev/null || df -P | awk \'NR>1 {print $6}\')',
        'printf "%s\\n" "$total"'
    ].filter(Boolean).join('\n');
    return `bash -lc ${quotePosixShellArg(script)}`;
}
function buildWindowsTrashEmptyCommand(deviceIdentity, rememberedRoots) {
    const userKey = createHash('sha256').update(deviceIdentity).digest('hex').slice(0, 12);
    const remembered = rememberedRoots.map(quotePowerShellLiteral).join(',');
    const script = withPowerShellDefaults([
        '$roots=[System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)',
        `foreach ($root in @(${remembered})) { if ($root) { [void]$roots.Add([string]$root) } }`,
        `Get-PSDrive -PSProvider FileSystem | ForEach-Object { [void]$roots.Add(([string]$_.Root).TrimEnd('\\') + '\\.turbofile-trash-${userKey}\\turbofile') }`,
        '$count=0',
        'foreach ($root in $roots) {',
        '  $info=Join-Path $root "info"',
        '  if ([System.IO.Directory]::Exists($info)) { $count += @([System.IO.Directory]::EnumerateFiles($info, "*.json", [System.IO.SearchOption]::TopDirectoryOnly)).Count }',
        '  $files=Join-Path $root "files"',
        '  if ([System.IO.Directory]::Exists($files)) { [System.IO.Directory]::Delete($files, $true) }',
        '  if ([System.IO.Directory]::Exists($info)) { [System.IO.Directory]::Delete($info, $true) }',
        '}',
        '[Console]::Out.Write([string]$count)'
    ].join('; '));
    return buildPowerShellCommand(script);
}
function buildPosixTrashRootBatchCommand() {
    const script = [
        'home_point="$(findmnt -T "$HOME" -n -o TARGET 2>/dev/null || df -P "$HOME" | awk \'NR==2 { print $6 }\')"',
        'uid="$(id -u)"',
        "while IFS= read -r -d '' probe; do",
        'mount_point="$(findmnt -T "$probe" -n -o TARGET 2>/dev/null || df -P "$probe" | awk \'NR==2 { print $6 }\')"',
        'if [ -z "$mount_point" ]; then continue; fi',
        'if [ "$mount_point" = "$home_point" ]; then trash_root="$HOME/.local/share/Trash/turbofile"; else trash_root="$mount_point/.Trash-$uid/turbofile"; fi',
        'printf "%s\\0%s\\0%s\\0" "$probe" "$mount_point" "$trash_root"',
        'done'
    ].join('\n');
    return `bash -lc ${quotePosixShellArg(script)}`;
}
function buildPosixTrashMoveBatchCommand() {
    const pythonRenameProbe = 'import ctypes; libc = ctypes.CDLL(None); raise SystemExit(0 if hasattr(libc, "renameat2") else 1)';
    const pythonScript = [
        'import ctypes',
        'import os',
        'import sys',
        'AT_FDCWD = -100',
        'RENAME_NOREPLACE = 1',
        'libc = ctypes.CDLL(None, use_errno=True)',
        'renameat2 = libc.renameat2',
        'renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]',
        'renameat2.restype = ctypes.c_int',
        'def rename_noreplace(src, dst):',
        '    ctypes.set_errno(0)',
        '    if renameat2(AT_FDCWD, src, AT_FDCWD, dst, RENAME_NOREPLACE) != 0:',
        '        error_number = ctypes.get_errno()',
        '        raise OSError(error_number, os.strerror(error_number), os.fsdecode(src))',
        'fields = sys.stdin.buffer.read().split(b"\\0")',
        'if fields and not fields[-1]:',
        '    fields.pop()',
        'if len(fields) % 6 != 0:',
        '    raise SystemExit("Invalid recycle-bin batch input.")',
        'created_directories = set()',
        'output = sys.stdout.buffer',
        'for offset in range(0, len(fields), 6):',
        '    item_id, src, dst, pending, final, metadata = fields[offset:offset + 6]',
        '    pending_created = False',
        '    try:',
        '        for directory in (os.path.dirname(dst), os.path.dirname(pending)):',
        '            if directory not in created_directories:',
        '                os.makedirs(directory, exist_ok=True)',
        '                created_directories.add(directory)',
        '        if any(os.path.lexists(path) for path in (dst, pending, final)):',
        '            raise FileExistsError("Recycle-bin target already exists.")',
        '        descriptor = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)',
        '        pending_created = True',
        '        try:',
        '            view = memoryview(metadata)',
        '            while view:',
        '                written = os.write(descriptor, view)',
        '                if written <= 0:',
        '                    raise OSError("Unable to write recycle-bin metadata.")',
        '                view = view[written:]',
        '        finally:',
        '            os.close(descriptor)',
        '        rename_noreplace(src, dst)',
        '        rename_noreplace(pending, final)',
        '        output.write(item_id + b"\\t1\\t\\n")',
        '    except Exception as error:',
        '        if pending_created and os.path.lexists(src):',
        '            try:',
        '                os.unlink(pending)',
        '            except (FileNotFoundError, OSError):',
        '                pass',
        '        message = str(error).encode("utf-8", "replace").replace(b"\\t", b" ").replace(b"\\r", b" ").replace(b"\\n", b" ")',
        '        output.write(item_id + b"\\t0\\t" + message + b"\\n")',
        '    if (offset // 6 + 1) % 64 == 0:',
        '        output.flush()',
        'output.flush()'
    ].join('\n');
    const script = [
        buildPosixHeartbeatFunction(),
        'path_exists() { [ -e "$1" ] || [ -L "$1" ]; }',
        'process_trash_moves() {',
        "while IFS= read -r -d '' id && IFS= read -r -d '' src && IFS= read -r -d '' dst && IFS= read -r -d '' pending && IFS= read -r -d '' final && IFS= read -r -d '' metadata; do",
        'dst_parent=${dst%/*}',
        'info_parent=${pending%/*}',
        'pending_created=0',
        'if path_exists "$dst" || path_exists "$pending" || path_exists "$final"; then',
        'printf "%s\\t0\\tmove failed\\n" "$id"',
        'continue',
        'fi',
        'if ! { [ -d "$dst_parent" ] || mkdir -p -- "$dst_parent"; } || ! { [ -d "$info_parent" ] || mkdir -p -- "$info_parent"; }; then',
        'printf "%s\\t0\\tmove failed\\n" "$id"',
        'continue',
        'fi',
        'if ! (umask 077; set -C; printf "%s" "$metadata" > "$pending"); then',
        'printf "%s\\t0\\tmove failed\\n" "$id"',
        'continue',
        'fi',
        'pending_created=1',
        'if mv -n -- "$src" "$dst" && ! path_exists "$src" && mv -n -- "$pending" "$final" && ! path_exists "$pending"; then',
        'printf "%s\\t1\\t\\n" "$id"',
        'else',
        'if [ "$pending_created" -eq 1 ] && path_exists "$src"; then rm -f -- "$pending"; fi',
        'printf "%s\\t0\\tmove failed\\n" "$id"',
        'fi',
        'done',
        '}',
        `if command -v python3 >/dev/null 2>&1 && python3 -c ${quotePosixShellArg(pythonRenameProbe)}; then run_with_heartbeat python3 -c ${quotePosixShellArg(pythonScript)}; else run_with_heartbeat process_trash_moves; fi`
    ].join('\n');
    return `bash -lc ${quotePosixShellArg(script)}`;
}
function buildWindowsTrashMoveBatchCommand() {
    const script = withPowerShellDefaults([
        '$items=[Console]::In.ReadToEnd() | ConvertFrom-Json',
        '$results=[System.Collections.Generic.List[object]]::new()',
        '$completed=0',
        '$pathExists={ param([string]$path) try { [void][System.IO.File]::GetAttributes($path); return $true } catch { $errorValue=$_.Exception; while ($errorValue.InnerException) { $errorValue=$errorValue.InnerException }; if ($errorValue -is [System.IO.FileNotFoundException] -or $errorValue -is [System.IO.DirectoryNotFoundException]) { return $false }; throw } }',
        'foreach ($item in $items) {',
        '  $pendingCreated=$false',
        '  try {',
        '    $parent=[System.IO.Path]::GetDirectoryName([string]$item.payloadPath)',
        '    $infoParent=[System.IO.Path]::GetDirectoryName([string]$item.pendingPath)',
        '    if ($parent -and -not [System.IO.Directory]::Exists($parent)) { [System.IO.Directory]::CreateDirectory($parent) | Out-Null }',
        '    if ($infoParent -and -not [System.IO.Directory]::Exists($infoParent)) { [System.IO.Directory]::CreateDirectory($infoParent) | Out-Null }',
        '    if (& $pathExists ([string]$item.metadataPath)) { throw [System.IO.IOException]::new("Recycle-bin metadata target already exists.") }',
        '    $metadataBytes=[System.Text.UTF8Encoding]::new($false).GetBytes([string]$item.metadata)',
        '    $metadataStream=[System.IO.File]::Open([string]$item.pendingPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)',
        '    $pendingCreated=$true',
        '    try { $metadataStream.Write($metadataBytes, 0, $metadataBytes.Length) } finally { $metadataStream.Dispose() }',
        '    if ([System.IO.Directory]::Exists([string]$item.sourcePath)) { [System.IO.Directory]::Move([string]$item.sourcePath, [string]$item.payloadPath) }',
        '    else { [System.IO.File]::Move([string]$item.sourcePath, [string]$item.payloadPath) }',
        '    [System.IO.File]::Move([string]$item.pendingPath, [string]$item.metadataPath)',
        '    [void]$results.Add([pscustomobject]@{ id=[string]$item.id; ok=$true; message="" })',
        '  } catch {',
        '    $moveError=$_.Exception.Message',
        '    $sourcePath=[string]$item.sourcePath; $payloadPath=[string]$item.payloadPath',
        '    $sourceExists=$false; $payloadExists=$false',
        '    try { $sourceExists=& $pathExists $sourcePath } catch {}',
        '    try { $payloadExists=& $pathExists $payloadPath } catch {}',
        '    if ($pendingCreated -and -not $sourceExists -and $payloadExists) {',
        '      try {',
        '        $payloadAttributes=[System.IO.File]::GetAttributes($payloadPath)',
        '        if (($payloadAttributes -band [System.IO.FileAttributes]::Directory) -ne 0) { [System.IO.Directory]::Move($payloadPath, $sourcePath) } else { [System.IO.File]::Move($payloadPath, $sourcePath) }',
        '        $sourceExists=$true; $payloadExists=$false',
        '      } catch {}',
        '    }',
        '    if ($pendingCreated -and $sourceExists -and -not $payloadExists) { try { [System.IO.File]::Delete([string]$item.pendingPath) } catch {} }',
        '    [void]$results.Add([pscustomobject]@{ id=[string]$item.id; ok=$false; message=$moveError })',
        '  }',
        '  $completed++',
        '  if (($completed % 64) -eq 0) { [Console]::Error.WriteLine([string]$completed) }',
        '}',
        '[Console]::Error.WriteLine([string]$completed)',
        '$results | ConvertTo-Json -Compress'
    ].join('\n'));
    return buildPowerShellCommand(script);
}
function parseRemoteTrashMoveResults(output, windowsPath) {
    const text = output.toString('utf8').trim();
    if (!text) {
        return [];
    }
    if (windowsPath) {
        const parsed = JSON.parse(text);
        const values = Array.isArray(parsed) ? parsed : [parsed];
        return values
            .filter(value => value && typeof value.id === 'string' && typeof value.ok === 'boolean')
            .map(value => ({ id: value.id, ok: value.ok, message: typeof value.message === 'string' ? value.message : undefined }));
    }
    return text.split(/\r?\n/)
        .map(line => line.split('\t'))
        .filter(parts => parts.length >= 2 && !!parts[0])
        .map(parts => ({ id: parts[0], ok: parts[1] === '1', message: parts[2] || undefined }));
}
function buildWindowsDeleteManyFromInputCommand(recursive) {
    const script = withPowerShellDefaults([
        '$paths=[Console]::In.ReadToEnd() | ConvertFrom-Json',
        '$completed=0',
        'foreach ($path in $paths) {',
        '  $value=[string]$path',
        '  if ([System.IO.Directory]::Exists($value)) {',
        recursive
            ? '    [System.IO.Directory]::Delete($value, $true)'
            : '    [System.IO.Directory]::Delete($value)',
        '  } elseif ([System.IO.File]::Exists($value)) {',
        '    [System.IO.File]::Delete($value)',
        '  }',
        '  $completed++',
        '  if (($completed % 64) -eq 0) { [Console]::Out.WriteLine([string]$completed) }',
        '}',
        '[Console]::Out.WriteLine([string]$completed)'
    ].join('\n'));
    return buildPowerShellCommand(script);
}
function buildPosixDeleteManyFromInputCommand(recursive) {
    const removeFlag = recursive ? '-rf' : '-f';
    const script = `${buildPosixHeartbeatFunction()}; status=0; run_with_heartbeat rm ${removeFlag} -- "$@" || status=$?; [ "$status" -eq 0 ] && printf "." >&2; exit "$status"`;
    return `LC_ALL=C xargs -0 -r -n 128 bash -c ${quotePosixShellArg(script)} _`;
}
function buildPosixMoveManyIntoDirectoryFromInputCommand(targetDirectory) {
    const target = quotePosixShellArg(targetDirectory);
    const script = `${buildPosixHeartbeatFunction()}; status=0; run_with_heartbeat mv -n -- "$@" "$0" || status=$?; if [ "$status" -eq 0 ]; then for source in "$@"; do if [ -e "$source" ] || [ -L "$source" ]; then status=74; break; fi; done; fi; [ "$status" -eq 0 ] && printf "." >&2; exit "$status"`;
    return `mkdir -p -- ${target} && LC_ALL=C xargs -0 -r -n 128 bash -c ${quotePosixShellArg(script)} ${target}`;
}
function buildWindowsSizeCommand(path) {
    const target = quotePowerShellLiteral(path);
    return buildPowerShellCommand(withPowerShellDefaults(`$path=${target}; if (Test-Path -LiteralPath $path -PathType Container) { $dest=Join-Path ([System.IO.Path]::GetTempPath()) 'turbofile-size-probe'; $output=& robocopy $path $dest /L /E /BYTES /R:0 /W:0 /NFL /NDL /NJH /NP /NC /NS /XJ 2>&1; if ($LASTEXITCODE -gt 7) { throw (($output | Out-String).Trim()) }; $match=[regex]::Match(($output | Out-String), '(?im)^\\s*Bytes\\s*:\\s*([0-9][0-9,\\.]*)'); if (-not $match.Success) { throw 'Unable to parse robocopy size output.' }; [Int64]($match.Groups[1].Value -replace '[^0-9]', '') } elseif (Test-Path -LiteralPath $path -PathType Leaf) { [Int64](Get-Item -LiteralPath $path).Length } else { throw 'Path not found' }`));
}
function buildPosixSizeCommand(path) {
    const quotedPath = quotePosixShellArg(path);
    return `p=${quotedPath}; if [ -d "$p" ]; then size=''; if command -v du >/dev/null 2>&1; then size=$(du -sb -- "$p" 2>/dev/null | awk 'NR==1 {print $1; exit}'); if [ -z "$size" ]; then size=$(du -sk -- "$p" 2>/dev/null | awk 'NR==1 {printf "%.0f\\n", $1 * 1024; exit}'); fi; fi; if [ -z "$size" ]; then size=$(find "$p" -type f -printf '%s\\n' 2>/dev/null | awk '{s += $1} END {printf "%.0f\\n", s + 0}'); fi; printf '%s\\n' "$size"; elif [ -f "$p" ] || [ -L "$p" ]; then stat -c '%s' -- "$p"; else echo 'Path not found' >&2; exit 2; fi`;
}
function buildPosixContentSizeCommand(path) {
    const quotedPath = quotePosixShellArg(path);
    return `p=${quotedPath}; if [ -d "$p" ]; then find "$p" -type f -printf '%s\\n' 2>/dev/null | awk '{s += $1} END {printf "%.0f\\n", s + 0}'; elif [ -f "$p" ] || [ -L "$p" ]; then stat -c '%s' -- "$p"; else echo 'Path not found' >&2; exit 2; fi`;
}
function buildPosixHumanSizeCommand(path) {
    const quotedPath = quotePosixShellArg(path);
    return `du -sh -- ${quotedPath} 2>/dev/null | awk 'NR==1 {print $1; exit}'`;
}
function buildPosixFastDirectoryListCommand(path) {
    const quotedPath = quotePosixShellArg(path);
    return `LC_ALL=C find ${quotedPath} -mindepth 1 -maxdepth 1 -printf '%f\\0%y\\0%s\\0%T@\\0'`;
}
// Names + type only. `%y` is resolved from the directory entry's d_type on common filesystems, so
// this avoids a stat() per file and returns instantly even for directories with hundreds of
// thousands of entries. Size and modified time are filled in lazily for visible rows afterwards.
function buildPosixNamesAndTypesListCommand(path) {
    const quotedPath = quotePosixShellArg(path);
    return `LC_ALL=C find ${quotedPath} -mindepth 1 -maxdepth 1 -printf '%f\\0%y\\0'`;
}
// Size + modified time for specific entries in one round trip. Names are passed relative to the
// directory (via `cd`) so `%n` echoes them back exactly, letting the caller map results by name.
function buildPosixStatEntriesCommand(directoryPath, names) {
    return buildRemotePosixStatEntriesCommand(directoryPath, names);
}
function parseRemoteStatEntries(text) {
    if (!text) {
        return [];
    }
    const parts = text.split('\0');
    const stats = [];
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
function parseSizeCommandOutput(output) {
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
function chunkImageMetadataPaths(paths) {
    const chunks = [];
    let current = [];
    let currentChars = 0;
    for (const path of paths) {
        const pathChars = Math.max(quotePosixShellArg(path).length, quotePowerShellLiteral(path).length) + 2;
        if (current.length && (current.length >= IMAGE_METADATA_PATHS_PER_CHUNK || currentChars + pathChars > IMAGE_METADATA_COMMAND_MAX_CHARS)) {
            chunks.push(current);
            current = [];
            currentChars = 0;
        }
        current.push(path);
        currentChars += pathChars;
    }
    if (current.length) {
        chunks.push(current);
    }
    return chunks;
}
function buildPosixReadImageMetadataBatchCommand(paths, headerBytes) {
    const list = paths.map(quotePosixShellArg).join(' ');
    return [
        `if command -v vipsheader >/dev/null 2>&1; then T=vips; elif command -v magick >/dev/null 2>&1; then T=magick; elif command -v identify >/dev/null 2>&1; then T=identify; elif command -v convert >/dev/null 2>&1; then T=convert; else T=; fi`,
        `tmp=$(mktemp 2>/dev/null) || exit 1`,
        `: > "$tmp" || exit 1`,
        `trap 'rm -f "$tmp"' 0 1 2 15`,
        `for f in ${list}; do`,
        `[ -f "$f" ] || continue`,
        `sz=$(stat -c %s -- "$f" 2>/dev/null) || continue`,
        `mt=$(stat -c %Y -- "$f" 2>/dev/null) || continue`,
        `w=; h=`,
        `case "$T" in vips) w=$(vipsheader -f width "$f" 2>/dev/null); h=$(vipsheader -f height "$f" 2>/dev/null);; magick) d=$(magick identify -ping -format '%w %h' "$f[0]" 2>/dev/null | head -n 1); set -- $d; w=$1; h=$2;; identify) d=$(identify -ping -format '%w %h' "$f[0]" 2>/dev/null | head -n 1); set -- $d; w=$1; h=$2;; convert) d=$(convert -ping "$f[0]" -format '%w %h' info: 2>/dev/null | head -n 1); set -- $d; w=$1; h=$2;; esac`,
        `case "$w:$h" in *[!0-9:]*|:*|*:) w=; h=;; esac`,
        `if [ -n "$w" ] && [ "$w" -gt 0 ] && [ "$h" -gt 0 ]; then n=0; else w=0; h=0; if head -c ${headerBytes} -- "$f" > "$tmp" 2>/dev/null; then n=$(wc -c < "$tmp" | tr -d ' \\t\\n'); else : > "$tmp"; n=0; fi; fi`,
        `printf '%s\\0%s\\0%s\\0%s\\0%s\\0%s\\0' "$f" "$sz" "$mt" "$w" "$h" "$n"`,
        `[ "$n" -eq 0 ] || cat "$tmp"`,
        `done`,
        `rm -f "$tmp"`,
        `trap - 0 1 2 15`,
        `:`
    ].join('\n');
}
function buildWindowsReadImageMetadataBatchCommand(paths, headerBytes) {
    const list = paths.map(quotePowerShellLiteral).join(',');
    return buildPowerShellCommand(withPowerShellDefaults(`$paths=@(${list}); $result=@(); foreach ($path in $paths) { try { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }; $item=Get-Item -LiteralPath $path; [int]$length=[Math]::Min([long]$item.Length,${headerBytes}); $buffer=New-Object byte[] $length; $stream=[System.IO.File]::OpenRead($path); try { $total=0; while ($total -lt $length) { $read=$stream.Read($buffer,$total,$length-$total); if ($read -le 0) { break }; $total+=$read }; if ($total -lt $length) { $partial=New-Object byte[] $total; [Array]::Copy($buffer,$partial,$total); $buffer=$partial } } finally { $stream.Dispose() }; $result+=[pscustomobject]@{ path=$path; size=[long]$item.Length; modified=[DateTimeOffset]::new($item.LastWriteTimeUtc).ToUnixTimeMilliseconds(); header=[Convert]::ToBase64String($buffer) } } catch { continue } }; @($result) | ConvertTo-Json -Compress`));
}
function parseWindowsImageMetadataBatchOutput(output) {
    const text = output.toString('utf8').replace(/^\uFEFF/, '').trim();
    if (!text) {
        return [];
    }
    const parsed = JSON.parse(text);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    const result = [];
    for (const value of values) {
        if (!value || typeof value !== 'object') {
            continue;
        }
        const candidate = value;
        if (typeof candidate.path !== 'string' || typeof candidate.size !== 'number' || typeof candidate.modified !== 'number') {
            continue;
        }
        const header = typeof candidate.header === 'string' ? Buffer.from(candidate.header, 'base64') : Buffer.alloc(0);
        const dimensions = readTurboFileImageDimensions(candidate.path, header);
        result.push({ path: candidate.path, size: candidate.size, modified: candidate.modified, ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}) });
    }
    return result;
}
function buildPosixReadImagesBatchCommand(paths, maxBytes, maxWidth) {
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
    const lines = [];
    // Always probe for an image tool: it downscales large originals AND is the only way to render TIFF.
    // Probing is just a couple of `command -v` calls, so it stays cheap even on weak boards.
    lines.push(`if command -v vipsthumbnail >/dev/null 2>&1; then T=vips`);
    lines.push(`elif command -v magick >/dev/null 2>&1; then T=magick`);
    lines.push(`elif command -v convert >/dev/null 2>&1; then T=convert`);
    lines.push(`else T=; fi`);
    lines.push(`emit(){ originalWidth=\${3:-0}; originalHeight=\${4:-0}; if [ "$2" -le ${maxBytes} ]; then printf '%s\\n%s\\n%s\\n%s\\n' "$1" "$2" "$originalWidth" "$originalHeight"; cat "$1"; else printf '%s\\n-1\\n0\\n0\\n' "$1"; fi; }`);
    // Read dimensions only for sources that are about to be transformed. This stays inside the same
    // SSH command and avoids the directory-wide metadata pre-scan that previously delayed the grid.
    lines.push(`dimensions(){ originalWidth=0; originalHeight=0; case "$T" in vips) originalWidth=$(vipsheader -f width "$1" 2>/dev/null); originalHeight=$(vipsheader -f height "$1" 2>/dev/null);; magick) d=$(magick identify -ping -format '%w %h' "$1[0]" 2>/dev/null | head -n 1); set -- $d; originalWidth=$1; originalHeight=$2;; convert) d=$(identify -ping -format '%w %h' "$1[0]" 2>/dev/null | head -n 1); [ -n "$d" ] || d=$(convert -ping "$1[0]" -format '%w %h' info: 2>/dev/null | head -n 1); set -- $d; originalWidth=$1; originalHeight=$2;; esac; case "$originalWidth:$originalHeight" in *[!0-9:]*|:*|*:) originalWidth=0; originalHeight=0;; esac; [ "$originalWidth" -gt 0 ] 2>/dev/null && [ "$originalHeight" -gt 0 ] 2>/dev/null; }`);
    // Transcode $1 to JPEG file $2. $3>0 downscales to that width; $3=0 keeps the native resolution.
    // `[0]` takes the first page of a multi-page TIFF for ImageMagick; vips reads page 0 by default.
    lines.push(`mkjpg(){ if [ "$3" -gt 0 ]; then case "$T" in vips) vipsthumbnail "$1" --size "$3x" -o "$2[Q=82,strip]" >/dev/null 2>&1;; magick|convert) "$T" "$1[0]" -resize "$3x" -strip -quality 82 jpg:"$2" >/dev/null 2>&1;; *) return 1;; esac; else case "$T" in vips) vipsthumbnail "$1" --size 30000x30000 -o "$2[Q=88,strip]" >/dev/null 2>&1;; magick|convert) "$T" "$1[0]" -strip -quality 88 jpg:"$2" >/dev/null 2>&1;; *) return 1;; esac; fi }`);
    // Emit a transcoded JPEG (length-framed); returns non-zero without emitting if transcoding fails.
    lines.push(`tojpg(){ o=$(mktemp 2>/dev/null) || o=/tmp/tfthumb.$$; oj="$o.jpg"; if dimensions "$1" && mkjpg "$1" "$oj" "$3" && [ -s "$oj" ]; then tz=$(wc -c < "$oj" 2>/dev/null | tr -d ' \\t\\n'); if [ -n "$tz" ] && [ "$tz" -le ${maxBytes} ]; then printf '%s\\n%s\\n%s\\n%s\\n' "$1" "$tz" "$originalWidth" "$originalHeight"; cat "$oj"; rm -f "$o" "$oj" 2>/dev/null; return 0; fi; fi; rm -f "$o" "$oj" 2>/dev/null; return 1; }`);
    lines.push(`for f in ${list}; do`);
    lines.push(`[ -f "$f" ] || continue`);
    lines.push(`sz=$(wc -c < "$f" 2>/dev/null | tr -d ' \\t\\n'); [ -n "$sz" ] || continue`);
    // TIFF can never stream raw (browsers can't decode it): always transcode, or report -1 if no tool.
    lines.push(`case $(printf '%s' "$f" | tr 'A-Z' 'a-z') in *.tif|*.tiff) if [ -n "$T" ] && tojpg "$f" "$sz" ${tiffWidth}; then :; else printf '%s\\n-1\\n0\\n0\\n' "$f"; fi; continue;; esac`);
    if (forceRaw) {
        lines.push(`emit "$f" "$sz"`);
    }
    else {
        lines.push(`if [ "$sz" -le ${rawPassthrough} ] || [ -z "$T" ]; then emit "$f" "$sz"; continue; fi`);
        lines.push(`if tojpg "$f" "$sz" ${width}; then :; else emit "$f" "$sz"; fi`);
    }
    lines.push(`done`);
    lines.push(`:`);
    return lines.join('\n');
}
function parseImageBatchOutput(buffer) {
    const entries = [];
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
        const originalWidthEnd = buffer.indexOf(0x0a, position);
        if (originalWidthEnd < 0) {
            break;
        }
        const originalWidth = parseInt(buffer.toString('utf8', position, originalWidthEnd), 10);
        position = originalWidthEnd + 1;
        const originalHeightEnd = buffer.indexOf(0x0a, position);
        if (originalHeightEnd < 0) {
            break;
        }
        const originalHeight = parseInt(buffer.toString('utf8', position, originalHeightEnd), 10);
        position = originalHeightEnd + 1;
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
        entries.push({
            path,
            ok: true,
            content: bytes.toString('base64'),
            mime,
            ...(Number.isFinite(originalWidth) && originalWidth > 0 && Number.isFinite(originalHeight) && originalHeight > 0 ? { originalWidth, originalHeight } : {})
        });
    }
    return entries;
}
function buildPosixDeleteCommand(path, recursive) {
    const quotedPath = quotePosixShellArg(path);
    const removeCommand = recursive ? `rm -rf -- ${quotedPath}` : `rm -f -- ${quotedPath}`;
    return `if [ -e ${quotedPath} ] || [ -L ${quotedPath} ]; then ${removeCommand}; fi`;
}
function getMimeType(path) {
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
function clampPositiveInt(value) {
    if (!Number.isFinite(value) || !value || value < 0) {
        return 0;
    }
    return Math.max(0, Math.round(value));
}
function clampQuality(value) {
    if (!Number.isFinite(value) || !value) {
        return 82;
    }
    return Math.min(95, Math.max(1, Math.round(value)));
}
function shouldKeepOriginalImageSize(size, targetWidth, targetHeight) {
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
function buildImageGeometry(width, height) {
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
function looksLikeWindowsPath(path) {
    return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(path);
}
function getImageSize(buffer) {
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
    }
    catch {
        return undefined;
    }
}
function getBmpImageSize(buffer) {
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
    }
    catch {
        return undefined;
    }
}
function tryCreateBmpPngVariant(buffer, targetWidth, targetHeight) {
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
function getResizedImageSize(sourceWidth, sourceHeight, targetWidth, targetHeight) {
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
function decodeBmpPixels(buffer) {
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
function encodeBmpPixelsToPng(image, outputWidth, outputHeight) {
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
function encodePngRgb(width, height, rawRgbRows) {
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
function createPngChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    typeBuffer.copy(chunk, 4);
    data.copy(chunk, 8);
    const crc = pngCrc32(Buffer.concat([typeBuffer, data]));
    chunk.writeUInt32BE(crc, 8 + data.length);
    return chunk;
}
let pngCrcTable;
function pngCrc32(buffer) {
    const table = getPngCrcTable();
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function getPngCrcTable() {
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
function assertImageBuffer(buffer, mime) {
    if (!buffer.byteLength) {
        throw new Error('Remote thumbnail command returned empty output.');
    }
    if (isProbablyImageBuffer(buffer, mime)) {
        return;
    }
    throw new Error('Remote thumbnail command did not return a decodable image.');
}
function isProbablyImageBuffer(buffer, mime) {
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
function getDefaultArchivePath(path, extension) {
    return `${path}.${extension}`;
}
function getDefaultExtractDirectory(path) {
    const name = getTransferName(stripArchiveExtension(path)) || 'archive';
    return joinRemotePath(getRemoteParentPath(path), name);
}
function stripArchiveExtension(path) {
    const lower = path.toLowerCase();
    for (const extension of ['.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.tar.zst', '.tzst', '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz']) {
        if (lower.endsWith(extension)) {
            return path.substring(0, path.length - extension.length);
        }
    }
    return path;
}
function formatBytes(size) {
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
function formatHumanSize(size) {
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
async function getAvailableLocalDirectory(path) {
    let candidate = path;
    for (let index = 0; index < 100; index++) {
        try {
            const stat = await fsp.stat(candidate);
            if (stat.isDirectory()) {
                return candidate;
            }
            candidate = `${path}_extracted${index ? index : ''}`;
        }
        catch {
            return candidate;
        }
    }
    return `${path}_extracted`;
}
async function getLocalPathSize(path) {
    const stat = await fsp.stat(path);
    if (!stat.isDirectory()) {
        return stat.size;
    }
    const entries = await fsp.readdir(path, { withFileTypes: true });
    const sizes = await mapLimit(entries, LOCAL_DIRECTORY_STAT_CONCURRENCY, async (entry) => {
        const childPath = join(path, entry.name);
        if (entry.isDirectory() || entry.isFile()) {
            return getLocalPathSize(childPath);
        }
        return 0;
    });
    return sizes.reduce((total, size) => total + size, 0);
}
async function getLocalPathSizeByCommand(path) {
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
    }
    catch {
        return getLocalPathSize(path);
    }
}
function buildWindowsDirectorySizeRobocopyArgs(sourcePath, destinationPath) {
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
function parseWindowsRobocopySizeOutput(output) {
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
function compareFileEntries(a, b) {
    if (a.type === 'directory' && b.type !== 'directory') {
        return -1;
    }
    if (a.type !== 'directory' && b.type === 'directory') {
        return 1;
    }
    return FILE_ENTRY_NAME_COLLATOR.compare(a.name, b.name);
}
function createFastDirectoryEntryStats(type, size, mtime) {
    return {
        size,
        mtime,
        isDirectory: () => type === 'directory',
        isFile: () => type === 'file',
        isSymbolicLink: () => type === 'symlink'
    };
}
