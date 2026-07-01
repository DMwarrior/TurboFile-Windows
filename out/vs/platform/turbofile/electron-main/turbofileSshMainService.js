import { createReadStream, createWriteStream, existsSync, promises as fsp } from "fs";
import { basename, dirname, join } from "node:path";
import { networkInterfaces, platform, tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { connect as connectTcp } from "node:net";
import { deflateSync } from "node:zlib";
import { app, BrowserWindow, clipboard, nativeImage, protocol } from "electron";
import { Emitter, Event } from "../../../base/common/event.js";
import { resolveTerminalEncoding } from "../../../base/node/terminalEncoding.js";
import { buildTurboFileRemoteExtractCommand, isTurboFileTarFamilyArchivePath } from "../common/turbofileArchiveExtract.js";
import { createLocalBatchTarPlans, createTarNullListBuffer, requiresLocalTarSafeRootAlias } from "../common/turbofileBatchTarPlan.js";
import { shouldRetryRemoteDirectoryRead } from "../common/turbofileRemoteDirectoryRetry.js";
import { createPosixNativeBatchTransferPlan } from "../common/turbofileRemoteNativeBatchPlan.js";
import { buildPosixStatEntriesCommand as buildRemotePosixStatEntriesCommand } from "../common/turbofileRemoteStat.js";
import { withTurboFileTimeout } from "../common/turbofileTimeout.js";
import { resolveTransferPlan } from "../common/turbofileTransferPlan.js";
import { createWindowsDragFakeDirectoryName, createWindowsShellAssociationChangedScript, normalizeWindowsCopyHookDestination, TURBOFILE_WINDOWS_DRAG_ACTIVE_DIR, TURBOFILE_WINDOWS_DRAG_APP_DIR, TURBOFILE_WINDOWS_DRAG_ROOT_DIR, TURBOFILE_WINDOWS_DRAG_TARGETS_DIR } from "../common/turbofileWindowsDrag.js";
import { normalizeWindowsTransferPaths } from "../common/turbofileWindowsPath.js";
const DEFAULT_READ_LIMIT = 10 * 1024 * 1024;
const DEFAULT_IMAGE_SOURCE_LIMIT = 128 * 1024 * 1024;
const REMOTE_IMAGE_TOOL_CACHE_TTL_MS = 5 * 60 * 1e3;
const REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS = 25e3;
const SSH_IMAGE_READ_MAX_CONCURRENCY = 6;
const REMOTE_DIRECTORY_READ_TIMEOUT_MS = 8e3;
const REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS = 12e3;
const REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS = 12e4;
const REMOTE_DIRECT_READ_MAX_BYTES = 2 * 1024 * 1024;
const REMOTE_DIRECT_READ_CHUNK_BYTES = 256 * 1024;
const IMAGE_BATCH_MAX_FILE_BYTES = 24 * 1024 * 1024;
const SMALL_IMAGE_DIM_LIMIT = 100;
const WINDOWS_DRAG_ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const RAW_BMP_FAST_PATH_BYTES = 2 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_VERSION = 1;
const IMAGE_THUMBNAIL_CACHE_MAX_BYTES = 512 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const TURBOFILE_IMAGE_RESOURCE_SCHEME = "turbofile-image";
const IMAGE_RESOURCE_TTL_MS = 10 * 60 * 1e3;
const IMAGE_RESOURCE_CLEANUP_INTERVAL_MS = 60 * 1e3;
const WINDOWS_DRAG_COPY_HOOK_TIMEOUT_MS = 45e3;
const WINDOWS_DRAG_COPY_HOOK_POLL_MS = 50;
const TURBOFILE_WINDOWS_DRAG_COPY_HOOK_CLSID = "{D650A1FA-43C6-4B8F-8C83-80B028353F64}";
const TRANSFER_CANCELED_MESSAGE = "Transfer canceled.";
const REMOTE_DIRECTORY_SFTP_IDLE_MS = 5 * 60 * 1e3;
const REMOTE_DIRECTORY_LISTING_CACHE_TTL_MS = 30 * 1e3;
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
const RSYNC_RELAY_BIND_HOST = "127.0.0.1";
const SSH_TERMINAL_READY_MARKER = "__TURBOFILE_TERMINAL_READY__";
const DIRECT_SSH_CONNECT_TIMEOUT_MS = 5 * 1e3;
const DIRECT_SSH_ROUTE_FAILURE_COOLDOWN_MS = 3 * 60 * 1e3;
const DIRECT_SSH_ROUTE_FAILURE_THRESHOLD = 2;
const DIRECT_SSH_ROUTE_CACHE_TTL_MS = 10 * 60 * 1e3;
const DIRECT_TRANSFER_STALL_TIMEOUT_MS = 10 * 1e3;
const DIRECT_TRANSFER_STALL_CHECK_INTERVAL_MS = 1e3;
const LOCAL_RSYNC_STALL_TIMEOUT_MS = 10 * 60 * 1e3;
const TRANSFER_PROGRESS_EVENT_INTERVAL_MS = 500;
const LOCAL_WINDOWS_REVERSE_RSYNC_MIN_SPLIT_ENTRIES = 6;
const LOCAL_PARALLEL_TAR_CHUNK_COUNT = 12;
const LOCAL_PARALLEL_TAR_MIN_ENTRIES = 8;
const LOCAL_PARALLEL_TAR_CHUNK_RETRIES = 2;
const LOCAL_TAR_ZSTD_LEVEL = 3;
const FILE_ENTRY_NAME_COLLATOR = new Intl.Collator(void 0, { numeric: true, sensitivity: "base" });
class TurboFileTransferCanceledError extends Error {
  constructor() {
    super(TRANSFER_CANCELED_MESSAGE);
    this.name = "TurboFileTransferCanceledError";
  }
}
class TurboFileSshMainService {
  constructor() {
    this.terminalSessionSequence = 1;
    this.terminalSessions = /* @__PURE__ */ new Map();
    this.transferProgressEmitters = /* @__PURE__ */ new Map();
    this.transferProgressSnapshots = /* @__PURE__ */ new Map();
    this.transferDataStartTimes = /* @__PURE__ */ new Map();
    this.transferFirstPositiveProgressTimes = /* @__PURE__ */ new Map();
    this.transferGrowthMonitoredProgressIds = /* @__PURE__ */ new Set();
    this.rsyncTimingStates = /* @__PURE__ */ new Map();
    this.transferCancellationRequests = /* @__PURE__ */ new Set();
    this.transferCancelHandlers = /* @__PURE__ */ new Map();
    this.directorySftpSessions = /* @__PURE__ */ new Map();
    this.directorySftpIdleTimers = /* @__PURE__ */ new Map();
    this.remoteDirectoryListingCache = /* @__PURE__ */ new Map();
    this.remoteImageToolCache = /* @__PURE__ */ new Map();
    this.remoteImageToolPending = /* @__PURE__ */ new Map();
    this.directSshRouteCache = /* @__PURE__ */ new Map();
    this.directSshRouteFailureCooldowns = /* @__PURE__ */ new Map();
    this.directSshRouteFailureCounts = /* @__PURE__ */ new Map();
    this.remoteRsyncSshBinaryCache = /* @__PURE__ */ new Map();
    this.imageResourceDescriptors = /* @__PURE__ */ new Map();
    // Caps concurrent SSH image reads. The image grid renders cards as <img src="turbofile-image://">,
    // and Chromium fetches every visible card at once — dozens of simultaneous `client.exec` calls on
    // one SSH connection blow past the server's MaxSessions limit and every command fails with
    // "Unable to exec". A small global limit keeps thumbnail generation under that ceiling (leaving
    // channels free for directory/SFTP work) while still loading several images in parallel.
    this.imageReadActiveCount = 0;
    this.imageReadWaiters = [];
    this.ensureTurboFileImageProtocolRegistered();
    if (platform() === "win32") {
      void this.ensureWindowsDragCopyHookRegistered().catch(() => void 0);
    }
  }
  static {
    this.imageProtocolRegistered = false;
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
      return { ok: false, message: "Transfer progress id is required." };
    }
    this.transferCancellationRequests.add(progressId);
    const handlers = this.transferCancelHandlers.get(progressId);
    if (handlers) {
      for (const handler of [...handlers]) {
        try {
          handler();
        } catch {
        }
      }
    }
    return { ok: true, message: "Transfer cancellation requested." };
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
        } catch {
          return false;
        }
      };
      const sftp = await this.openSftp(client).then((handle) => {
        handle.end();
        return true;
      }).catch(() => false);
      const [scp, rsync, sshpass, tar, zip, unzip] = await Promise.all([
        hasCommand("scp"),
        hasCommand("rsync"),
        hasCommand("sshpass"),
        hasCommand("tar"),
        hasCommand("zip"),
        hasCommand("unzip")
      ]);
      return {
        ok: true,
        message: "Capabilities detected.",
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
  async installTransferDependencies(options, packages) {
    const requestedPackages = normalizeTransferDependencies(packages);
    if (!requestedPackages.length) {
      return { ok: true, message: "No dependencies requested.", installedPackages: [], missingPackages: [] };
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
    } catch (error) {
      installError = error instanceof Error ? error : new Error(String(error));
    } finally {
      client?.end();
    }
    const capabilityResult = await this.detectCapabilities(options);
    const capabilities = capabilityResult.capabilities;
    const missingPackages = capabilities ? getMissingTransferDependencies(requestedPackages, capabilities) : requestedPackages;
    const installedPackages = requestedPackages.filter((pkg) => !missingPackages.includes(pkg));
    const ok = capabilityResult.ok && missingPackages.length === 0;
    const missingMessage = missingPackages.length ? `\u7F3A\u5C11 ${missingPackages.join("\u3001")}` : "\u4F9D\u8D56\u5DF2\u5B89\u88C5";
    return {
      ok,
      message: ok ? "rsync/sshpass \u5B89\u88C5\u5E76\u68C0\u6D4B\u6210\u529F\u3002" : `${installError ? `${installError.message}\uFF1B` : ""}${missingMessage}`,
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
      const cached = this.getRemoteDirectoryListingCache(cacheKey);
      if (cached && (namesOnly || this.remoteListingHasAttributes(cached))) {
        return cached;
      }
    }
    const configResult = await this.createConnectConfig(options);
    if (!configResult.ok) {
      throw new Error(configResult.message);
    }
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      const session = await this.getDirectorySftpSession(options, configResult.config);
      try {
        const listing = await this.readRemoteDirectoryWithFallback(session.sftp, session.client, options, path, namesOnly);
        this.touchDirectorySftpSession(session.key);
        const result = {
          path: listing.path,
          entries: listing.entries.filter((entry) => entry.filename !== "." && entry.filename !== "..").map((entry) => this.toRemoteEntry(listing.path, entry)).sort(compareFileEntries)
        };
        if (!namesOnly) {
          this.setRemoteDirectoryListingCache(this.getRemoteDirectoryListingCacheKey(options, listing.path), result);
          if (listing.path === path) {
            this.setRemoteDirectoryListingCache(cacheKey, result);
          }
        }
        return result;
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
  remoteListingHasAttributes(listing) {
    return listing.entries.some((entry) => entry.size > 0 || entry.modified > 0);
  }
  async statRemoteEntries(options, directoryPath, names) {
    const uniqueNames = [...new Set(names.filter((name) => !!name && name !== "." && name !== ".."))];
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
      const stats = parseRemoteStatEntries(output.toString("utf8"));
      return stats.length ? stats : await this.statRemoteEntriesWithSftpFallback(session.sftp, directoryPath, uniqueNames);
    } catch {
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
          modified: stat.mtime * 1e3
        };
      } catch {
        return void 0;
      }
    });
    return stats.filter((stat) => !!stat);
  }
  async listLocalDirectory(path, _refresh = false) {
    const dirents = await fsp.readdir(path, { withFileTypes: true });
    const visibleNames = await getWindowsExplorerVisibleLocalNames(path);
    const entries = (await mapLimit(dirents.filter((dirent) => !visibleNames || visibleNames.has(dirent.name)), LOCAL_DIRECTORY_STAT_CONCURRENCY, async (dirent) => {
      try {
        const fullPath = join(path, dirent.name);
        const stat = await fsp.lstat(fullPath);
        const type = stat.isDirectory() ? "directory" : stat.isFile() ? "file" : stat.isSymbolicLink() ? "symlink" : "unknown";
        return {
          name: dirent.name,
          path: fullPath,
          type,
          size: stat.size,
          modified: stat.mtimeMs
        };
      } catch {
        return void 0;
      }
    })).filter((entry) => !!entry);
    return {
      path,
      entries: entries.sort(compareFileEntries)
    };
  }
  async normalizeLocalWindowsPaths(paths) {
    return normalizeWindowsTransferPaths(paths, resolveLocalWindowsRealPath);
  }
  async transferFile(request) {
    const strategy = getTransferStrategy(request.source, request.target);
    const startedAt = Date.now();
    if (request.progressId) {
      this.transferCancellationRequests.delete(request.progressId);
    }
    try {
      this.throwIfTransferCanceled(request.progressId);
      if (request.source.kind === "local" && request.target.kind === "local") {
        this.fireTransferProgress(request, 0, Math.max(0, request.expectedBytes ?? 0), "prepare", "Preparing local copy.", true);
        const totalBytes = await getLocalPathTransferSize(request.source.path, request.expectedBytes);
        this.fireTransferProgress(request, 0, totalBytes, "transfer", "Copying locally.", true);
        let transferredBytes = 0;
        const onDelta = (delta) => {
          this.throwIfTransferCanceled(request.progressId);
          transferredBytes += delta;
          this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, "transfer", "Copying locally.");
        };
        await this.copyLocalPath(request.source.path, request.target.path, onDelta, request.progressId);
        this.throwIfTransferCanceled(request.progressId);
        const bytes = Math.max(totalBytes, transferredBytes);
        this.fireTransferProgress(request, bytes, bytes, "complete", "Local copy completed.", true);
        return this.createTransferResult(true, strategy, bytes, "Local copy completed.", startedAt, request.progressId);
      }
      if (request.source.kind === "local" && request.target.kind === "ssh") {
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
            throw new Error("Tar upload unavailable for directory transfer.");
          }
          if (request.target.preferredProtocol !== "sftp") {
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
        this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing SFTP upload.", true, { strategy: "sftp-upload" });
        let transferredBytes = 0;
        const onDelta = (delta) => {
          this.throwIfTransferCanceled(request.progressId);
          transferredBytes += delta;
          this.fireTransferProgress(request, transferredBytes, bytes, "transfer", "Uploading over SFTP.", false, { strategy: "sftp-upload" });
        };
        const onTotal = (totalBytes) => {
          bytes = Math.max(bytes, totalBytes);
          this.fireTransferProgress(request, Math.min(transferredBytes, bytes), bytes, "transfer", "Uploading over SFTP.", true, { strategy: "sftp-upload" });
        };
        if (stat.isDirectory()) {
          this.fireTransferProgress(request, 0, bytes, "transfer", "Scanning and uploading directory over SFTP.", true, { strategy: "sftp-upload" });
          await this.uploadDirectoryConcurrent(request.target, request.source.path, request.target.path, onTotal, onDelta, request.progressId);
        } else {
          await this.withSftp(request.target, async (sftp) => {
            this.throwIfTransferCanceled(request.progressId);
            await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
            await this.fastPutWithFallback(sftp, request.source.path, request.target.path, bytes, onDelta, request.progressId);
          }, request.progressId);
        }
        this.throwIfTransferCanceled(request.progressId);
        await this.verifySshUploadSize(request.target, stat.isDirectory() ? 0 : bytes, "SFTP upload");
        this.fireTransferProgress(request, bytes, bytes, "complete", "SFTP upload completed.", true, { strategy: "sftp-upload" });
        this.clearRemoteDirectoryListingCache(request.target);
        return this.createTransferResult(true, "sftp-upload", bytes, "SFTP upload completed.", startedAt, request.progressId);
      }
      if (request.source.kind === "ssh" && request.target.kind === "local") {
        this.throwIfTransferCanceled(request.progressId);
        await ensureLocalParentDirectory(request.target.path);
        let bytes = 0;
        const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => "unknown");
        bytes = sourceType === "directory" ? Math.max(0, request.expectedBytes ?? 0) : Math.max(0, request.expectedBytes ?? 0);
        if (sourceType === "directory") {
          if (shouldPreferTarForMultiItemTransfer(request.source.preferredProtocol)) {
            const tarResult = await this.trySshToLocalTarTransfer(request, bytes, startedAt);
            if (tarResult?.ok) {
              return tarResult;
            }
            throw new Error("Tar download unavailable for directory transfer.");
          }
          if (request.source.preferredProtocol !== "sftp") {
            const commandOrder = getDirectoryLocalCommandTransferProtocolOrder(request.source.preferredProtocol);
            const commandResult = await this.trySshToLocalCommandTransfer(request, bytes, startedAt, commandOrder);
            if (commandResult?.ok) {
              return commandResult;
            }
          }
        } else {
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
          this.fireTransferProgress(request, transferredBytes, bytes, "transfer", "Downloading over SFTP.", false, { strategy: "sftp-download" });
        };
        const onTotal = (totalBytes) => {
          bytes = Math.max(bytes, totalBytes);
          this.fireTransferProgress(request, Math.min(transferredBytes, bytes), bytes, "transfer", "Downloading over SFTP.", true, { strategy: "sftp-download" });
        };
        if (sourceType === "directory") {
          this.fireTransferProgress(request, 0, bytes, "transfer", "Scanning and downloading directory over SFTP.", true, { strategy: "sftp-download" });
          await this.downloadDirectoryConcurrent(request.source, request.source.path, request.target.path, onTotal, onDelta, request.progressId);
        } else {
          await this.withSftp(request.source, async (sftp) => {
            this.throwIfTransferCanceled(request.progressId);
            if (bytes <= 0) {
              bytes = (await this.remoteStat(sftp, request.source.path)).size;
            }
            this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing SFTP download.", true, { strategy: "sftp-download" });
            await this.fastGetWithFallback(sftp, request.source.path, request.target.path, bytes, onDelta, request.progressId);
          }, request.progressId);
        }
        this.throwIfTransferCanceled(request.progressId);
        this.fireTransferProgress(request, bytes, bytes, "complete", "SFTP download completed.", true, { strategy: "sftp-download" });
        return this.createTransferResult(true, "sftp-download", bytes, "SFTP download completed.", startedAt, request.progressId);
      }
      if (request.source.kind === "ssh" && request.target.kind === "ssh") {
        return await this.transferBetweenSshDevices(request, startedAt);
      }
      throw new Error("Unsupported transfer endpoint combination.");
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
  async transferBetweenSshDevices(request, startedAt) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh") {
      throw new Error("SSH-to-SSH transfer requires SSH endpoints.");
    }
    const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => "unknown");
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
    if (request.strategyHint !== "relay") {
      const sameRemoteResult = await this.trySameRemoteCopy(effectiveRequest, startedAt);
      this.throwIfTransferCanceled(request.progressId);
      if (sameRemoteResult?.ok) {
        this.fireTransferProgress(request, sameRemoteResult.bytes, sameRemoteResult.bytes, "complete", "Remote copy completed.", true, { strategy: sameRemoteResult.strategy });
        this.clearRemoteDirectoryListingCache(request.target);
        return sameRemoteResult;
      }
    }
    for (const [index, attempt] of plan.attempts.entries()) {
      try {
        this.fireTransferProgress(request, 0, attempt.protocol === "rsync" ? 0 : Math.max(0, request.expectedBytes ?? 0), attempt.route === "relay" ? "relay-upload" : "transfer", `Starting ${attempt.protocol} ${attempt.route} transfer.`, true, {
          strategy: transferAttemptToStrategy(attempt),
          route: attempt.route === "relay" ? "relay" : void 0
        });
        const directResult = await this.trySshToSshTransferAttempt(attempt, effectiveRequest, startedAt);
        this.throwIfTransferCanceled(request.progressId);
        if (directResult?.ok) {
          this.fireTransferProgress(request, directResult.bytes, directResult.bytes, "complete", `${formatTransferStrategyName(directResult.strategy)} completed.`, true, { strategy: directResult.strategy });
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
          this.fireTransferProgress(request, 0, 0, nextAttempt.route === "relay" ? "relay-upload" : "transfer", `${failure}; falling back to ${nextAttempt.protocol} ${nextAttempt.route}.`, true, {
            strategy: transferAttemptToStrategy(nextAttempt),
            route: nextAttempt.route === "relay" ? "relay" : void 0
          });
        }
      }
    }
    return {
      ok: false,
      strategy: failedStrategy,
      bytes: 0,
      message: `Transfer unavailable${failures.length ? `: ${failures.join("; ")}` : "."}`,
      durationMs: Date.now() - startedAt
    };
  }
  async trySshToSshTransferAttempt(attempt, request, startedAt) {
    if (attempt.route === "direct") {
      return this.trySshToSshDirectTransfer(attempt.protocol, request, startedAt);
    }
    if (attempt.route === "relay") {
      return this.trySshToSshRelayTransfer(attempt.protocol, request, startedAt);
    }
    return void 0;
  }
  async trySshToSshDirectTransfer(protocol2, request, startedAt) {
    switch (protocol2) {
      case "rsync":
        return this.tryDirectRsyncTransfer(request, startedAt, true);
      case "tar":
        return this.tryDirectTarTransfer(request, startedAt, true);
      case "sftp":
        return this.tryDirectSftpTransfer(request, startedAt, true);
      case "scp":
      default:
        return this.tryDirectScpTransfer(request, startedAt, true);
    }
  }
  async trySshToSshRelayTransfer(protocol2, request, startedAt) {
    switch (protocol2) {
      case "rsync":
        return this.tryTunneledRsyncRelayTransfer(request, startedAt, true);
      case "tar":
        return this.tryTarRelayTransfer(request, startedAt, true);
      case "sftp":
        return await this.tryStreamRelayTransfer(request, startedAt, true) ?? await this.runSftpRelayTransfer(request, startedAt, true);
      case "scp":
      default:
        return this.tryScpRelayTransfer(request, startedAt, true);
    }
  }
  async tryLocalToSshReverseParallelRsyncUpload(request, bytes, startedAt) {
    if (platform() !== "win32" || request.source.kind !== "local" || request.target.kind !== "ssh" || !request.target.connection) {
      return void 0;
    }
    if (request.target.supportsRsync !== true || looksLikeWindowsPath(request.target.path)) {
      return void 0;
    }
    try {
      const sourceStat = await fsp.stat(request.source.path);
      if (!sourceStat.isDirectory()) {
        return void 0;
      }
      const sourceConnection = await this.resolveLocalWindowsRsyncSourceConnection();
      if (!sourceConnection) {
        return void 0;
      }
      const remoteTargetDirectory = trimTrailingRemoteSlash(request.target.path);
      if (!remoteTargetDirectory || remoteTargetDirectory === "/") {
        return void 0;
      }
      const items = await this.createLocalWindowsReverseRsyncItems(request.source.path, remoteTargetDirectory);
      if (items.length < 2) {
        return void 0;
      }
      this.fireTransferProgress(request, 0, 0, "transfer", "Starting parallel rsync target pull.", true, {
        strategy: "rsync-direct-parallel",
        route: "target-pull",
        completedItems: 0,
        totalItems: items.length,
        currentName: items[0].name
      });
      const targetConfigResult = await this.createConnectConfig(request.target.connection);
      if (!targetConfigResult.ok) {
        return void 0;
      }
      const client = await this.connect(targetConfigResult.config);
      const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
      let lastActivityAt = Date.now();
      try {
        const progress = this.createParallelRsyncProgressReporter(request, 0, "rsync-direct", "Parallel rsync target pull in progress.", {
          strategy: "rsync-direct-parallel",
          route: "target-pull",
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
        this.fireTransferProgress(request, resultBytes, 0, "complete", "Parallel rsync target pull completed.", true, {
          strategy: "rsync-direct-parallel",
          route: "target-pull",
          completedItems: items.length,
          totalItems: items.length
        });
        return this.createTransferResult(true, "rsync-direct-parallel", resultBytes, "Parallel rsync target pull completed.", startedAt, request.progressId);
      } finally {
        unregisterCancel();
        client.end();
      }
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      return void 0;
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
        return childEntries.map((entry) => {
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
    return rootEntries.map((entry) => ({
      name: entry.name,
      directory: entry.directory,
      sourcePath: joinRemotePath(rootSourcePath, entry.name),
      targetPath: joinRemotePath(remoteTargetDirectory, entry.name)
    }));
  }
  async readLocalRsyncSplitEntries(localDirectory) {
    const entries = await fsp.readdir(localDirectory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() || entry.isFile()).map((entry) => ({ name: entry.name, directory: entry.isDirectory() })).sort((a, b) => FILE_ENTRY_NAME_COLLATOR.compare(a.name, b.name));
  }
  async tryLocalToSshReverseParallelRsyncBatchUpload(request, batchItems, operation, bytes, startedAt) {
    if (platform() !== "win32" || request.source.kind !== "local" || request.targetDirectory.kind !== "ssh" || !request.targetDirectory.connection) {
      return void 0;
    }
    if (request.targetDirectory.supportsRsync !== true || looksLikeWindowsPath(request.targetDirectory.path)) {
      return void 0;
    }
    if (request.targetDirectory.preferredProtocol !== "rsync") {
      return void 0;
    }
    if (!canBatchRsyncPreserveTargetNames(batchItems)) {
      return void 0;
    }
    try {
      const sourceConnection = await this.resolveLocalWindowsRsyncSourceConnection();
      if (!sourceConnection) {
        return void 0;
      }
      const remoteTargetDirectory = trimTrailingRemoteSlash(request.targetDirectory.path);
      if (!remoteTargetDirectory || remoteTargetDirectory === "/") {
        return void 0;
      }
      const cleanupTargets = /* @__PURE__ */ new Set();
      const rsyncItems = [];
      let hasDirectory = false;
      for (const item of batchItems) {
        const stat = await fsp.stat(item.sourcePath).catch(() => void 0);
        if (!stat) {
          return void 0;
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
      if (!rsyncItems.length || !hasDirectory && batchItems.length <= 1) {
        return void 0;
      }
      this.fireTransferProgress(request, 0, 0, "transfer", "Starting parallel rsync target pull.", true, {
        strategy: "rsync-direct-parallel",
        route: "target-pull",
        completedItems: 0,
        totalItems: batchItems.length,
        currentName: batchItems[0].displayName ?? batchItems[0].targetName
      });
      const targetConfigResult = await this.createConnectConfig(request.targetDirectory.connection);
      if (!targetConfigResult.ok) {
        return void 0;
      }
      const client = await this.connect(targetConfigResult.config);
      const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
      let lastActivityAt = Date.now();
      try {
        const progress = this.createParallelRsyncProgressReporter(request, 0, "rsync-direct", "Parallel rsync target pull in progress.", {
          strategy: "rsync-direct-parallel",
          route: "target-pull",
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
        const cleanupFailures = operation === "move" ? await this.deleteBatchSources(request.source, batchItems) : [];
        const resultBytes = progress.getLastBytes() || bytes;
        this.fireTransferProgress(request, resultBytes, 0, "complete", "Parallel rsync target pull completed.", true, {
          strategy: "rsync-direct-parallel",
          route: "target-pull",
          completedItems: batchItems.length,
          totalItems: batchItems.length
        });
        this.clearRemoteDirectoryListingCache(request.targetDirectory);
        return this.createBatchTransferResult(cleanupFailures.length === 0, "rsync-direct-parallel", resultBytes, cleanupFailures.length ? `Parallel rsync completed, but source cleanup failed for ${cleanupFailures.length} item(s).` : "Parallel rsync completed.", batchItems.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
      } finally {
        unregisterCancel();
        client.end();
      }
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      return void 0;
    }
  }
  async resolveLocalWindowsRsyncSourceConnection() {
    this.localWindowsRsyncSourceConnectionPromise ??= this.doResolveLocalWindowsRsyncSourceConnection();
    return this.localWindowsRsyncSourceConnectionPromise;
  }
  async doResolveLocalWindowsRsyncSourceConnection() {
    const localAddresses = getLocalIpv4Addresses();
    if (!localAddresses.size) {
      return void 0;
    }
    for (const configPath of getLocalWindowsRsyncConfigPaths()) {
      try {
        const raw = JSON.parse(await fsp.readFile(configPath, "utf8"));
        const config = asRecord(raw);
        const servers = asRecord(config?.servers);
        if (!servers) {
          continue;
        }
        for (const [id, value] of Object.entries(servers)) {
          const server = asRecord(value);
          if (!server || readStringProperty(server, "os_type") !== "windows") {
            continue;
          }
          const host = readStringProperty(server, "host") || id;
          if (!localAddresses.has(host)) {
            continue;
          }
          const username = readStringProperty(server, "user");
          const password = readStringProperty(server, "password");
          if (!username || !password) {
            continue;
          }
          return {
            host,
            port: readNumberProperty(server, "port") || 22,
            username,
            password
          };
        }
      } catch {
      }
    }
    return void 0;
  }
  async tryLocalToSshCommandTransfer(request, bytes, startedAt, protocolOrder, verifyUploadSize = true) {
    if (request.source.kind !== "local" || request.target.kind !== "ssh" || !request.target.connection) {
      return void 0;
    }
    for (const protocol2 of protocolOrder ?? getLocalCommandTransferProtocolOrder(request.target.preferredProtocol, request.target.connection)) {
      this.throwIfTransferCanceled(request.progressId);
      try {
        if (protocol2 === "rsync") {
          const initialTotalBytes = Math.max(0, bytes);
          this.fireTransferProgress(request, 0, initialTotalBytes, "transfer", "Uploading over local rsync.", true, { strategy: "rsync-upload" });
          const progress = this.createRsyncProgressReporter(request, initialTotalBytes, "transfer", "Uploading over local rsync.", { strategy: "rsync-upload" });
          if (initialTotalBytes <= 0) {
            void getLocalPathSize(request.source.path).then((total) => progress.setTotalBytes(total)).catch(() => void 0);
          }
          await this.runLocalRsyncUpload(request, bytes, progress.handleOutput);
          const resultBytes = progress.getLastBytes() || bytes;
          await this.verifySshUploadSize(request.target, 0, "Local rsync upload");
          this.fireTransferProgress(request, resultBytes, 0, "complete", "Local rsync upload completed.", true, { strategy: "rsync-upload" });
          return this.createTransferResult(true, "rsync-upload", resultBytes, "Local rsync upload completed.", startedAt, request.progressId);
        }
        this.fireTransferProgress(request, 0, bytes, "transfer", "Uploading over local SCP.", true, { strategy: "scp-upload" });
        await this.runLocalScpUpload(request, bytes, (transferredBytes) => {
          this.fireTransferProgress(request, transferredBytes, bytes, "transfer", "Uploading over local SCP.", false, { strategy: "scp-upload" });
        });
        await this.verifySshUploadSize(request.target, verifyUploadSize ? bytes : 0, "Local SCP upload");
        this.fireTransferProgress(request, bytes, bytes, "complete", "Local SCP upload completed.", true, { strategy: "scp-upload" });
        return this.createTransferResult(true, "scp-upload", bytes, "Local SCP upload completed.", startedAt, request.progressId);
      } catch (error) {
        if (this.isTransferCanceled(request.progressId)) {
          throw new TurboFileTransferCanceledError();
        }
        if (!isRecoverableLocalCommandTransferError(error)) {
          return void 0;
        }
        this.clearTransferDataTiming(request.progressId);
      }
    }
    return void 0;
  }
  async trySshToLocalCommandTransfer(request, bytes, startedAt, protocolOrder) {
    if (request.source.kind !== "ssh" || request.target.kind !== "local" || !request.source.connection) {
      return void 0;
    }
    for (const protocol2 of protocolOrder ?? getLocalCommandTransferProtocolOrder(request.source.preferredProtocol, request.source.connection)) {
      this.throwIfTransferCanceled(request.progressId);
      try {
        if (protocol2 === "rsync") {
          const initialTotalBytes = Math.max(0, bytes);
          this.fireTransferProgress(request, 0, initialTotalBytes, "transfer", "Downloading over local rsync.", true, { strategy: "rsync-download" });
          const progress = this.createRsyncProgressReporter(request, initialTotalBytes, "transfer", "Downloading over local rsync.", { strategy: "rsync-download" });
          if (initialTotalBytes <= 0) {
            void this.getRemotePathContentSizeByCommand(request.source).then((total) => progress.setTotalBytes(total)).catch(() => void 0);
          }
          await this.runLocalRsyncDownload(request, bytes, progress.handleOutput);
          const resultBytes = progress.getLastBytes() || bytes;
          this.fireTransferProgress(request, resultBytes, 0, "complete", "Local rsync download completed.", true, { strategy: "rsync-download" });
          return this.createTransferResult(true, "rsync-download", resultBytes, "Local rsync download completed.", startedAt, request.progressId);
        }
        this.fireTransferProgress(request, 0, bytes, "transfer", "Downloading over local SCP.", true, { strategy: "scp-download" });
        await this.runLocalScpDownload(request, bytes, (delta) => {
          this.fireTransferProgress(request, delta, bytes, "transfer", "Downloading over local SCP.", false, { strategy: "scp-download" });
        });
        this.fireTransferProgress(request, bytes, bytes, "complete", "Local SCP download completed.", true, { strategy: "scp-download" });
        return this.createTransferResult(true, "scp-download", bytes, "Local SCP download completed.", startedAt, request.progressId);
      } catch (error) {
        if (this.isTransferCanceled(request.progressId)) {
          throw new TurboFileTransferCanceledError();
        }
        if (!isRecoverableLocalCommandTransferError(error)) {
          return void 0;
        }
        this.clearTransferDataTiming(request.progressId);
      }
    }
    return void 0;
  }
  async verifySshUploadSize(target, expectedBytes, label) {
    if (target.kind !== "ssh" || expectedBytes <= 0) {
      return;
    }
    const actualBytes = await this.getRemotePathContentSizeByCommand(target);
    if (actualBytes === expectedBytes) {
      return;
    }
    await this.deletePath(target, true).catch(() => void 0);
    throw new Error(`${label} size mismatch: expected ${expectedBytes}, got ${actualBytes}.`);
  }
  async tryLocalToSshTarTransfer(request, expectedBytes, startedAt) {
    if (request.source.kind !== "local" || request.target.kind !== "ssh" || !request.target.connection) {
      return void 0;
    }
    if (!shouldPreferTarForMultiItemTransfer(request.target.preferredProtocol)) {
      return void 0;
    }
    if (request.target.supportsTar === false || looksLikeWindowsPath(request.target.path)) {
      return void 0;
    }
    try {
      const stat = await fsp.stat(request.source.path);
      if (!stat.isDirectory()) {
        return void 0;
      }
      let bytes = Math.max(0, expectedBytes);
      const sizePromise = bytes <= 0 ? getLocalPathSize(request.source.path).catch(() => 0) : void 0;
      this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing tar upload.", true, { strategy: "tar-upload" });
      let archiveBytes = 0;
      const onArchiveDelta = (delta) => {
        this.throwIfTransferCanceled(request.progressId);
        archiveBytes += Math.max(0, delta);
        this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, "transfer", "Tar upload in progress.", false, { strategy: "tar-upload" });
      };
      if (sizePromise) {
        void sizePromise.then((total) => {
          if (total > bytes) {
            bytes = total;
            this.fireTransferProgress(request, Math.min(archiveBytes, bytes), bytes, "transfer", "Tar upload in progress.", true, { strategy: "tar-upload" });
          }
        });
      }
      this.markTransferDataStarted(request.progressId);
      await this.runLocalDirectoryTarUpload(request.source.path, request.target, request.progressId, onArchiveDelta);
      this.throwIfTransferCanceled(request.progressId);
      const resultBytes = bytes > 0 ? bytes : archiveBytes > 0 ? archiveBytes : await this.getRemotePathContentSizeByCommand(request.target).catch(() => 0);
      this.fireTransferProgress(request, resultBytes, resultBytes, "complete", "Tar upload completed.", true, { strategy: "tar-upload" });
      return this.createTransferResult(true, "tar-upload", resultBytes, "Tar upload completed.", startedAt, request.progressId);
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      this.clearTransferDataTiming(request.progressId);
      return void 0;
    }
  }
  async trySshToLocalTarTransfer(request, expectedBytes, startedAt) {
    if (request.source.kind !== "ssh" || request.target.kind !== "local" || !request.source.connection) {
      return void 0;
    }
    if (!shouldPreferTarForMultiItemTransfer(request.source.preferredProtocol)) {
      return void 0;
    }
    if (request.source.supportsTar === false || looksLikeWindowsPath(request.source.path)) {
      return void 0;
    }
    try {
      const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => "unknown");
      if (sourceType !== "directory") {
        return void 0;
      }
      let bytes = Math.max(0, expectedBytes);
      const sizePromise = bytes <= 0 ? this.getRemotePathContentSizeByCommand(request.source).catch(() => 0) : void 0;
      this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing tar download.", true, { strategy: "tar-download" });
      await fsp.rm(request.target.path, { recursive: true, force: true }).catch(() => void 0);
      await ensureLocalDirectory(request.target.path);
      let archiveBytes = 0;
      const onArchiveDelta = (delta) => {
        this.throwIfTransferCanceled(request.progressId);
        archiveBytes += Math.max(0, delta);
        this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, "transfer", "Tar download in progress.", false, { strategy: "tar-download" });
      };
      if (sizePromise) {
        void sizePromise.then((total) => {
          if (total > bytes) {
            bytes = total;
            this.fireTransferProgress(request, Math.min(archiveBytes, bytes), bytes, "transfer", "Tar download in progress.", true, { strategy: "tar-download" });
          }
        });
      }
      this.markTransferDataStarted(request.progressId);
      await this.runRemoteDirectoryTarDownload(request.source, request.target.path, request.progressId, onArchiveDelta);
      this.throwIfTransferCanceled(request.progressId);
      if (sizePromise) {
        bytes = Math.max(bytes, await sizePromise);
      }
      const resultBytes = bytes > 0 ? bytes : await getLocalPathSize(request.target.path).catch(() => 0);
      this.fireTransferProgress(request, resultBytes, resultBytes, "complete", "Tar download completed.", true, { strategy: "tar-download" });
      return this.createTransferResult(true, "tar-download", resultBytes, "Tar download completed.", startedAt, request.progressId);
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      this.clearTransferDataTiming(request.progressId);
      return void 0;
    }
  }
  async runLocalDirectoryTarUpload(localDirectory, target, progressId, onArchiveDelta) {
    if (target.kind !== "ssh" || !target.connection) {
      throw new Error("Missing SSH target.");
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
      }
      try {
        await this.runParallelLocalDirectoryTarZstdUpload(localTarRoot.path, target.connection, buildPrepareTarZstdExtractToExactDirectoryCommand(target.path), buildTarZstdExtractToDirectoryCommand(target.path), progressId, onArchiveDelta);
        return;
      } catch (error) {
        if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
          throw new TurboFileTransferCanceledError();
        }
      }
      try {
        await this.runNativeLocalTarUpload(["-cf", "-", "-C", localTarRoot.path, "."], target.connection, buildTarExtractToExactDirectoryCommand(target.path), progressId, onArchiveDelta);
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
  async runRemoteDirectoryTarDownload(source, localDirectory, progressId, onArchiveDelta) {
    if (source.kind !== "ssh" || !source.connection) {
      throw new Error("Missing SSH source.");
    }
    try {
      await this.runNativeLocalTarDownload(source.connection, buildTarCreateFromDirectoryCommand(source.path), ["-xf", "-", "-C", localDirectory], progressId, onArchiveDelta);
      return;
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
        throw new TurboFileTransferCanceledError();
      }
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
      const sourceStream = await this.openRemoteCommandStream(client, buildTarCreateFromDirectoryCommand(source.path), "tar download create");
      tarProcess = spawn("tar.exe", [...await this.getLocalTarCharsetArgs(), "-xf", "-", "-C", localDirectory], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      if (!tarProcess.stdin || !tarProcess.stdout) {
        throw new Error("Local tar download did not provide pipes.");
      }
      tarProcess.stdout.resume();
      const tarClose = waitForLocalProcessClose(tarProcess, "local tar download");
      await pipeline(sourceStream.stream, createProgressPassThrough(onArchiveDelta), tarProcess.stdin);
      await sourceStream.close;
      await tarClose;
    } finally {
      unregisterCancel();
      client?.end();
    }
  }
  async createLocalTarRootAliasIfNeeded(localRoot, force = false) {
    if (platform() !== "win32" || !(force || requiresLocalTarSafeRootAlias(localRoot))) {
      return {
        path: localRoot,
        dispose: async () => void 0
      };
    }
    const tempRoot = join(tmpdir(), `turbofile-tar-root-${randomUUID()}`);
    const aliasPath = join(tempRoot, "root");
    try {
      await fsp.mkdir(tempRoot, { recursive: true });
      await fsp.symlink(localRoot, aliasPath, "junction");
    } catch (error) {
      await fsp.rmdir(aliasPath).catch(() => void 0);
      await fsp.rmdir(tempRoot).catch(() => void 0);
      throw error;
    }
    return {
      path: aliasPath,
      dispose: async () => {
        await fsp.rmdir(aliasPath).catch(() => void 0);
        await fsp.rmdir(tempRoot).catch(() => void 0);
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
        tarProcess = spawn("tar.exe", [...await this.getLocalTarCharsetArgs(), ...tarArgs], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        sshProcess = spawn(tool.executable, sshArgs, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env });
        sshProcess.stdout?.resume();
        if (!tarProcess.stdout || !sshProcess.stdin) {
          throw new Error("Native tar upload did not provide required pipes.");
        }
        const tarClose = waitForLocalProcessClose(tarProcess, "native tar upload create");
        const sshClose = waitForLocalProcessClose(sshProcess, "native tar upload extract");
        await pipeline(tarProcess.stdout, createProgressPassThrough(onArchiveDelta), sshProcess.stdin);
        await tarClose;
        await sshClose;
      } finally {
        unregisterCancel();
      }
    });
  }
  async runNativeLocalTarDownload(connection, remoteCommand, tarArgs, progressId, onArchiveDelta) {
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
        sshProcess = spawn(tool.executable, sshArgs, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env });
        tarProcess = spawn("tar.exe", [...await this.getLocalTarCharsetArgs(), ...tarArgs], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        tarProcess.stdout?.resume();
        if (!sshProcess.stdout || !tarProcess.stdin) {
          throw new Error("Native tar download did not provide required pipes.");
        }
        const sshClose = waitForLocalProcessClose(sshProcess, "native tar download create");
        const tarClose = waitForLocalProcessClose(tarProcess, "native tar download extract");
        await pipeline(sshProcess.stdout, createProgressPassThrough(onArchiveDelta), tarProcess.stdin);
        await sshClose;
        await tarClose;
      } finally {
        unregisterCancel();
      }
    });
  }
  async runParallelLocalDirectoryTarUpload(localDirectory, connection, prepareRemoteCommand, extractRemoteCommand, progressId, onArchiveDelta) {
    const sshTool = await resolveLocalSshTool();
    const preparePromise = this.runNativeSshCommand(connection, sshTool, prepareRemoteCommand, progressId);
    let entries;
    try {
      entries = await this.collectLocalTarRelativeEntries(localDirectory);
    } catch (error) {
      await preparePromise.catch(() => void 0);
      throw error;
    }
    if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
      await preparePromise.catch(() => void 0);
      throw new Error("Not enough entries for parallel tar upload.");
    }
    await this.runParallelLocalTarUpload(localDirectory, entries, connection, void 0, extractRemoteCommand, progressId, onArchiveDelta, preparePromise);
  }
  async runParallelLocalDirectoryTarZstdUpload(localDirectory, connection, prepareRemoteCommand, extractRemoteCommand, progressId, onArchiveDelta) {
    const sshTool = await resolveLocalSshTool();
    const preparePromise = this.runNativeSshCommand(connection, sshTool, prepareRemoteCommand, progressId);
    let entries;
    try {
      entries = await this.collectLocalTarRelativeEntries(localDirectory);
    } catch (error) {
      await preparePromise.catch(() => void 0);
      throw error;
    }
    if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
      await preparePromise.catch(() => void 0);
      throw new Error("Not enough entries for parallel tar+zstd upload.");
    }
    await this.runParallelLocalTarZstdUpload(localDirectory, entries, connection, void 0, extractRemoteCommand, progressId, onArchiveDelta, preparePromise);
  }
  async runParallelLocalBatchTarUpload(plan, connection, targetDirectory, progressId, onArchiveDelta) {
    const preparePromise = this.prepareRemoteBatchTarTarget(connection, targetDirectory, plan.targetNames, progressId, false);
    let entries;
    try {
      entries = await this.collectLocalTarRelativeEntries(plan.parentPath, plan.names);
    } catch (error) {
      await preparePromise.catch(() => void 0);
      throw error;
    }
    if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
      await preparePromise.catch(() => void 0);
      throw new Error("Not enough entries for parallel batch tar upload.");
    }
    await this.runParallelLocalTarUpload(
      plan.parentPath,
      entries,
      connection,
      void 0,
      buildTarExtractStreamToDirectoryCommand(targetDirectory),
      progressId,
      onArchiveDelta,
      preparePromise
    );
  }
  async runParallelLocalBatchTarZstdUpload(plan, connection, targetDirectory, progressId, onArchiveDelta) {
    const preparePromise = this.prepareRemoteBatchTarTarget(connection, targetDirectory, plan.targetNames, progressId, true);
    let entries;
    try {
      entries = await this.collectLocalTarRelativeEntries(plan.parentPath, plan.names);
    } catch (error) {
      await preparePromise.catch(() => void 0);
      throw error;
    }
    if (entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES) {
      await preparePromise.catch(() => void 0);
      throw new Error("Not enough entries for parallel batch tar+zstd upload.");
    }
    await this.runParallelLocalTarZstdUpload(
      plan.parentPath,
      entries,
      connection,
      void 0,
      buildTarZstdExtractToDirectoryCommand(targetDirectory),
      progressId,
      onArchiveDelta,
      preparePromise
    );
  }
  async runParallelLocalTarUpload(localRoot, entries, connection, prepareRemoteCommand, extractRemoteCommand, progressId, onArchiveDelta, preparePromise) {
    const sshTool = await resolveLocalSshTool();
    const tempRoot = join(tmpdir(), `turbofile-tar-${randomUUID()}`);
    await fsp.mkdir(tempRoot, { recursive: true });
    try {
      const chunks = await this.writeLocalTarChunkLists(tempRoot, entries);
      if (chunks.length < 2) {
        throw new Error("Parallel tar upload needs at least two chunks.");
      }
      await this.awaitTarPrepare(connection, sshTool, prepareRemoteCommand, preparePromise, progressId);
      await mapLimit(chunks, chunks.length, (chunk) => this.runNativeLocalTarUploadChunkWithRetry(localRoot, chunk, connection, sshTool, extractRemoteCommand, progressId, onArchiveDelta));
    } finally {
      await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => void 0);
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
        throw new Error("Parallel tar upload needs at least two chunks.");
      }
      await this.awaitTarPrepare(connection, sshTool, prepareRemoteCommand, preparePromise, progressId);
      await mapLimit(chunks, chunks.length, (chunk) => this.runNativeLocalTarZstdUploadChunk(localRoot, chunk, connection, sshTool, zstdTool, extractRemoteCommand, progressId, onArchiveDelta));
    } finally {
      await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => void 0);
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
  async collectLocalTarRelativeEntries(localRoot, names) {
    const entries = [];
    const walkDirectory = async (relativeDir) => {
      const fullDir = relativeDir ? join(localRoot, ...relativeDir.split("/")) : localRoot;
      const children = await fsp.readdir(fullDir, { withFileTypes: true });
      if (!children.length && relativeDir) {
        entries.push(relativeDir);
        return;
      }
      const subDirectories = [];
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
      await mapLimit(names, LOCAL_DIRECTORY_STAT_CONCURRENCY, async (name) => {
        const relativePath = normalizeTarListPath(name);
        const stat = await fsp.lstat(join(localRoot, ...relativePath.split("/")));
        if (stat.isDirectory()) {
          await walkDirectory(relativePath);
        } else if (stat.isFile() || stat.isSymbolicLink()) {
          entries.push(relativePath);
        }
      });
    } else {
      await walkDirectory("");
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
  async buildLocalRsyncFastListFile(items) {
    if (platform() !== "win32" || !items.length) {
      return void 0;
    }
    const sourceBase = dirname(items[0].sourcePath);
    if (!sourceBase || sourceBase === items[0].sourcePath) {
      return void 0;
    }
    for (const item of items) {
      if (dirname(item.sourcePath) !== sourceBase) {
        return void 0;
      }
    }
    let entries;
    try {
      entries = await this.collectLocalTarRelativeEntries(sourceBase, items.map((item) => basename(item.sourcePath)));
    } catch {
      return void 0;
    }
    if (!entries.length) {
      return void 0;
    }
    const listPath = join(tmpdir(), `turbofile-rsync-list-${randomUUID()}`);
    try {
      await fsp.writeFile(listPath, createTarNullListBuffer(entries));
    } catch {
      await fsp.rm(listPath, { force: true }).catch(() => void 0);
      return void 0;
    }
    return { listPath, sourceBase };
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
        if (platform() !== "win32") {
          return "utf8";
        }
        try {
          const encoding = await resolveTerminalEncoding();
          const iconv = await import("@vscode/iconv-lite-umd");
          return iconv.default.encodingExists(encoding) ? encoding : "utf8";
        } catch {
          return "utf8";
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
        if (platform() !== "win32") {
          return [];
        }
        try {
          const version = await new Promise((resolve, reject) => {
            execFile("tar.exe", ["--version"], { windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout));
          });
          return /bsdtar|libarchive/i.test(version) ? ["--options", "hdrcharset=UTF-8"] : [];
        } catch {
          return [];
        }
      })();
    }
    return this.localTarCharsetArgsPromise;
  }
  async createLocalTarListBuffer(entries) {
    const encoding = await this.getLocalTarListEncoding();
    if (encoding === "utf8") {
      return createTarNullListBuffer(entries);
    }
    const iconv = await import("@vscode/iconv-lite-umd");
    return Buffer.from(iconv.default.encode(`${entries.join("\0")}\0`, encoding));
  }
  async writeLocalTarChunkLists(tempRoot, entries) {
    const chunkCount = Math.min(LOCAL_PARALLEL_TAR_CHUNK_COUNT, entries.length);
    const chunks = Array.from({ length: chunkCount }, () => []);
    for (const [index, entry] of entries.entries()) {
      chunks[index % chunkCount].push(entry);
    }
    return Promise.all(chunks.filter((chunk) => chunk.length > 0).map(async (chunk, index) => {
      const listPath = join(tempRoot, `chunk-${String(index).padStart(2, "0")}.lst`);
      await fsp.writeFile(listPath, await this.createLocalTarListBuffer(chunk));
      return { listPath, entryCount: chunk.length };
    }));
  }
  async writeLocalTarListFile(tempRoot, names) {
    const listPath = join(tempRoot, "items.lst");
    await fsp.writeFile(listPath, await this.createLocalTarListBuffer(names.map((name) => normalizeTarListPath(name))));
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
        sshProcess = spawn(tool.executable, sshArgs, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env });
        sshProcess.stdout?.resume();
        if (!sshProcess.stdin) {
          throw new Error("Native ssh command did not provide stdin.");
        }
        const sshClose = waitForLocalProcessClose(sshProcess, "native ssh command");
        sshProcess.stdin.end(input);
        await sshClose;
      } finally {
        unregisterCancel();
      }
    });
  }
  async prepareRemoteBatchTarTarget(connection, targetDirectory, targetNames, progressId, requireZstd) {
    const sshTool = await resolveLocalSshTool();
    const command = buildPrepareTarExtractToDirectoryFromListCommand(targetDirectory, requireZstd);
    await this.runNativeSshCommandWithInput(connection, sshTool, command, createTarNullListBuffer(targetNames), progressId);
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
        tarProcess = spawn("tar.exe", [...await this.getLocalTarCharsetArgs(), "-cf", "-", "-C", localRoot, "--null", "-T", chunk.listPath], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        sshProcess = spawn(sshTool.executable, sshArgs, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: sshEnv });
        sshProcess.stdout?.resume();
        if (!tarProcess.stdout || !sshProcess.stdin) {
          throw new Error("Parallel tar upload did not provide required pipes.");
        }
        const tarClose = waitForLocalProcessClose(tarProcess, "parallel tar upload create");
        const sshClose = waitForLocalProcessClose(sshProcess, "parallel tar upload extract");
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
  async runNativeLocalTarUploadChunkWithRetry(localRoot, chunk, connection, sshTool, remoteCommand, progressId, onArchiveDelta) {
    let lastError;
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
        tarProcess = spawn("tar.exe", [...await this.getLocalTarCharsetArgs(), "-cf", "-", "-C", localRoot, "--null", "-T", chunk.listPath], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        zstdProcess = spawn(zstdTool.executable, [`-${LOCAL_TAR_ZSTD_LEVEL}`, "-T1", "-c"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: zstdTool.env });
        sshProcess = spawn(sshTool.executable, sshArgs, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: sshEnv });
        sshProcess.stdout?.resume();
        if (!tarProcess.stdout || !zstdProcess.stdin || !zstdProcess.stdout || !sshProcess.stdin) {
          throw new Error("Parallel tar upload did not provide required pipes.");
        }
        const tarClose = waitForLocalProcessClose(tarProcess, "parallel tar upload create");
        const zstdClose = waitForLocalProcessClose(zstdProcess, "parallel tar upload compress");
        const sshClose = waitForLocalProcessClose(sshProcess, "parallel tar upload extract");
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
  async runLocalScpUpload(request, bytes, onProgress) {
    if (request.target.kind !== "ssh" || !request.target.connection) {
      throw new Error("Missing SSH target.");
    }
    const localStat = await fsp.stat(request.source.path);
    const recursive = localStat.isDirectory();
    const initialRemoteSize = await this.withDirectorySftp(request.target, async (sftp) => {
      this.throwIfTransferCanceled(request.progressId);
      if (recursive) {
        await this.withDirectorySshClient(request.target, (client) => this.execRemote(client, `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}`)).catch(async () => {
          await this.ensureRemoteDirectory(sftp, request.target.path);
        });
      } else {
        await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
        await this.unlinkRemote(sftp, request.target.path).catch(() => void 0);
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
      throw new Error("Native OpenSSH scp.exe is required for directory SCP upload.");
    }
    await this.uploadFileWithScpProtocol(request.target.connection, request.source.path, request.target.path, bytes, onProgress, request.progressId);
  }
  async runLocalScpDownload(request, bytes, onProgress) {
    if (request.source.kind !== "ssh" || !request.source.connection) {
      throw new Error("Missing SSH source.");
    }
    await ensureLocalParentDirectory(request.target.path);
    const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => "unknown");
    const recursive = sourceType === "directory";
    if (canUseNativeOpenSshScpCommand(request.source.connection)) {
      await fsp.rm(request.target.path, { recursive, force: true }).catch(() => void 0);
      if (recursive) {
        await ensureLocalDirectory(request.target.path);
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
      throw new Error("Native OpenSSH scp.exe is required for directory SCP download.");
    }
    await this.downloadFileWithScpProtocol(request.source.connection, request.source.path, request.target.path, bytes, onProgress, request.progressId);
  }
  async uploadPathWithNativeOpenSshScp(connection, localPath, remotePath, recursive, initialRemoteSize, expectedBytes, onProgress, progressId) {
    const stopGrowthTiming = recursive ? () => void 0 : this.beginRemoteFileGrowthTiming(progressId, connection, remotePath, initialRemoteSize, expectedBytes, onProgress);
    try {
      if (recursive) {
        this.markTransferDataStarted(progressId);
      }
      const sourceArg = recursive ? getNativeScpLocalDirectoryContentsPath(localPath) : localPath;
      const targetArg = recursive ? ensureTrailingRemoteSlash(remotePath) : remotePath;
      await withNativeOpenSshScpBaseArgs(connection, (args, env) => this.runCancelableLocalCommand("scp.exe", [
        ...args,
        ...recursive ? ["-r"] : [],
        sourceArg,
        formatNativeScpRemoteSpec(connection, targetArg)
      ], { env }, progressId), shouldPreferLegacyScpMode(connection));
    } finally {
      stopGrowthTiming();
    }
  }
  async downloadPathWithNativeOpenSshScp(connection, remotePath, localPath, recursive, initialLocalSize, expectedBytes, onProgress, progressId) {
    const stopGrowthTiming = recursive ? () => void 0 : this.beginTransferGrowthTiming(progressId, () => fsp.stat(localPath).then((stat) => stat.size).catch(() => 0), initialLocalSize, expectedBytes, onProgress);
    try {
      if (recursive) {
        this.markTransferDataStarted(progressId);
      }
      const sourceArg = recursive ? getRemoteDirectoryContentsPath(remotePath) : remotePath;
      await withNativeOpenSshScpBaseArgs(connection, (args, env) => this.runCancelableLocalCommand("scp.exe", [
        ...args,
        ...recursive ? ["-r"] : [],
        formatNativeScpRemoteSpec(connection, sourceArg),
        localPath
      ], { env }, progressId), shouldPreferLegacyScpMode(connection));
    } finally {
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
      await readScpResponse(reader, "start upload");
      await writeScpData(stream, `C${formatScpMode(stat.mode)} ${totalBytes} ${sanitizeScpFileName(getTransferName(remotePath) || basename(localPath))}
`);
      await readScpResponse(reader, "upload header");
      const stopGrowthTiming = this.beginRemoteFileGrowthTiming(progressId, connection, remotePath);
      try {
        for await (const chunk of createReadStream(localPath, { highWaterMark: 1024 * 1024 })) {
          this.throwIfTransferCanceled(progressId);
          const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          await writeScpData(stream, buffer);
          transferredBytes += buffer.byteLength;
          onProgress?.(Math.min(transferredBytes, totalBytes));
        }
      } finally {
        stopGrowthTiming();
      }
      await writeScpData(stream, Buffer.from([0]));
      await readScpResponse(reader, "complete upload");
      stream.end();
      await closePromise;
    } finally {
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
        const stat = await fsp.stat(localPath).catch(() => void 0);
        return stat?.size ?? 0;
      });
      try {
        await readScpFilePayload(reader, localPath, totalBytes, (transferredBytes) => {
          this.throwIfTransferCanceled(progressId);
          onProgress?.(transferredBytes);
        });
      } finally {
        stopGrowthTiming();
      }
      await readScpResponse(reader, "complete download");
      await writeScpData(stream, Buffer.from([0]));
      stream.end();
      await closePromise;
    } finally {
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
        let stderr = "";
        stream.stderr.on("data", (data) => {
          stderr += data.toString();
        });
        stream.on("error", reject);
        stream.on("close", (code) => {
          if (code !== 0 && stderr.trim()) {
            reject(new Error(stderr.trim()));
          }
        });
        resolve(stream);
      });
    });
  }
  async runLocalRsyncUpload(request, expectedBytes, onProgressOutput) {
    if (request.target.kind !== "ssh" || !request.target.connection) {
      throw new Error("Missing SSH target.");
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
        "-e",
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
    if (request.source.kind !== "ssh" || !request.source.connection) {
      throw new Error("Missing SSH source.");
    }
    void expectedBytes;
    const connection = request.source.connection;
    const tool = await resolveLocalRsyncTool();
    const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => "unknown");
    const sourceIsDirectory = sourceType === "directory";
    if (sourceIsDirectory) {
      await ensureLocalDirectory(request.target.path);
    } else {
      await ensureLocalParentDirectory(request.target.path);
    }
    await withLocalRsyncSshEnvironment(connection, tool, (env, identityPath) => {
      return this.runCancelableLocalCommand(tool.executable, [
        ...buildLocalRsyncOptionArgs(true),
        "-e",
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
    const items = request.items.filter((item) => !!item.sourcePath && !!item.targetName);
    const operation = request.operation === "move" ? "move" : "copy";
    if (request.progressId) {
      this.transferCancellationRequests.delete(request.progressId);
    }
    if (!items.length) {
      return this.createBatchTransferResult(false, strategy, 0, "No transfer items.", 0, 0, [], startedAt, request.progressId);
    }
    const expectedBytes = this.getBatchExpectedBytes(request, items);
    const initialAttempt = this.getInitialBatchTransferAttempt(request, items);
    const initialStrategy = transferAttemptToDirectionalStrategy(request.source, request.targetDirectory, initialAttempt);
    const initialIsRsync = initialAttempt?.protocol === "rsync";
    try {
      this.throwIfTransferCanceled(request.progressId);
      this.fireTransferProgress(request, 0, initialIsRsync ? 0 : expectedBytes, initialIsRsync ? "transfer" : "prepare", initialIsRsync ? "Starting batch rsync transfer." : "Preparing batch transfer.", true, {
        ...initialIsRsync ? { strategy: initialStrategy } : {},
        completedItems: 0,
        totalItems: items.length,
        currentName: items[0].displayName ?? items[0].targetName
      });
      const sameLocal = request.source.kind === "local" && request.targetDirectory.kind === "local";
      const sameRemote = request.source.kind === "ssh" && request.targetDirectory.kind === "ssh" && !!request.source.connection && !!request.targetDirectory.connection && isSameSshConnection(request.source.connection, request.targetDirectory.connection);
      if (sameLocal) {
        return await this.runLocalNativeBatchTransfer(request, items, operation, expectedBytes, startedAt);
      }
      if (sameRemote) {
        return await this.runSameRemoteNativeBatchTransfer(request, items, operation, expectedBytes, startedAt);
      }
      if (request.source.kind === "ssh" && request.targetDirectory.kind === "ssh") {
        return await this.runSshToSshBatchTransferPlan(request, items, operation, expectedBytes, startedAt);
      }
      const tarBatch = await this.tryBatchTarTransfer(request, items, operation, expectedBytes, startedAt);
      this.throwIfTransferCanceled(request.progressId);
      if (tarBatch?.ok) {
        return tarBatch;
      }
      if (shouldUseTarOnlyForBatchTransfer(request)) {
        throw new Error("Tar transfer unavailable for batch transfer.");
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
  getBatchExpectedBytes(request, items) {
    const explicit = Math.max(0, request.expectedBytes ?? 0);
    if (explicit > 0) {
      return explicit;
    }
    return items.reduce((sum, item) => sum + Math.max(0, item.expectedBytes ?? 0), 0);
  }
  getInitialBatchTransferAttempt(request, items) {
    const sourceType = items.some((item) => item.sourceType === "directory") ? "directory" : items[0]?.sourceType;
    return resolveTransferPlan({
      source: request.source,
      target: request.targetDirectory,
      sourceType,
      itemCount: items.length,
      strategyHint: request.strategyHint
    }).attempts[0];
  }
  async runSshToSshBatchTransferPlan(request, items, operation, expectedBytes, startedAt) {
    const sourceType = items.some((item) => item.sourceType === "directory") ? "directory" : items[0]?.sourceType;
    const plan = resolveTransferPlan({
      source: request.source,
      target: request.targetDirectory,
      sourceType,
      itemCount: items.length,
      strategyHint: request.strategyHint
    });
    const failures = [];
    for (const [index, attempt] of plan.attempts.entries()) {
      this.throwIfTransferCanceled(request.progressId);
      try {
        this.fireTransferProgress(request, 0, attempt.protocol === "rsync" ? 0 : expectedBytes, attempt.route === "relay" ? "relay-upload" : "transfer", `Starting batch ${attempt.protocol} ${attempt.route} transfer.`, true, {
          strategy: transferAttemptToStrategy(attempt),
          route: attempt.route === "relay" ? "relay" : void 0,
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
          name: items[0]?.displayName ?? items[0]?.targetName ?? "batch",
          path: items[0]?.sourcePath ?? request.source.path,
          message: `${attempt.protocol} ${attempt.route}: ${formatTransferError(error)}`
        });
        const nextAttempt = plan.attempts[index + 1];
        if (nextAttempt) {
          this.fireTransferProgress(request, 0, nextAttempt.protocol === "rsync" ? 0 : expectedBytes, nextAttempt.route === "relay" ? "relay-upload" : "transfer", `Falling back to batch ${nextAttempt.protocol} ${nextAttempt.route}.`, true, {
            strategy: transferAttemptToStrategy(nextAttempt),
            route: nextAttempt.route === "relay" ? "relay" : void 0,
            completedItems: 0,
            totalItems: items.length,
            currentName: items[0]?.displayName ?? items[0]?.targetName
          });
        }
      }
    }
    return this.createBatchTransferResult(false, transferAttemptToStrategy(plan.attempts[0]), 0, failures[0]?.message ?? "Batch transfer unavailable.", 0, items.length, failures.length ? failures : items.map((item) => ({
      name: item.displayName ?? item.targetName,
      path: item.sourcePath,
      message: "No transfer attempt was available."
    })), startedAt, request.progressId);
  }
  async runSshToSshBatchTransferAttempt(request, items, operation, expectedBytes, startedAt, attempt) {
    if (attempt.protocol === "rsync") {
      const result = attempt.route === "direct" ? await this.tryDirectBatchRsyncTransfer(request, items, expectedBytes, startedAt, true) : attempt.route === "relay" ? await this.tryTunneledBatchRsyncRelayTransfer(request, items, expectedBytes, startedAt, true) : void 0;
      if (result?.ok && operation === "move") {
        const cleanupFailures = await this.deleteBatchSources(request.source, items);
        if (cleanupFailures.length) {
          return this.createBatchTransferResult(false, result.strategy, result.bytes, `Batch transfer completed, but source cleanup failed for ${cleanupFailures.length} item(s).`, items.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
        }
      }
      return result;
    }
    if (attempt.protocol === "tar") {
      return this.tryBatchTarTransfer({
        ...request,
        strategyHint: attempt.route === "relay" ? "relay" : "direct"
      }, items, operation, expectedBytes, startedAt, true);
    }
    return this.runConcurrentBatchTransfer({
      ...request,
      strategyHint: attempt.route === "relay" ? "relay" : "direct"
    }, items, operation, expectedBytes, startedAt, false);
  }
  async runLocalNativeBatchTransfer(request, items, operation, expectedBytes, startedAt) {
    const totalBytes = operation === "copy" ? await this.getLocalBatchTransferSize(items, expectedBytes) : expectedBytes;
    this.fireTransferProgress(request, 0, totalBytes, "transfer", operation === "move" ? "Moving locally." : "Copying locally.", true, {
      completedItems: 0,
      totalItems: items.length,
      currentName: items[0]?.displayName ?? items[0]?.targetName
    });
    const sources = items.map((item) => item.sourcePath);
    if (operation === "copy") {
      await ensureLocalDirectory(request.targetDirectory.path);
      let transferredBytes = 0;
      for (const [index, item] of items.entries()) {
        this.throwIfTransferCanceled(request.progressId);
        const currentName = item.displayName ?? item.targetName;
        this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, "transfer", "Copying locally.", true, {
          completedItems: index,
          totalItems: items.length,
          currentName
        });
        await this.copyLocalPath(item.sourcePath, this.joinBatchTargetPath(request.targetDirectory, item.targetName), (delta) => {
          this.throwIfTransferCanceled(request.progressId);
          transferredBytes += delta;
          this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, "transfer", "Copying locally.", false, {
            completedItems: index,
            totalItems: items.length,
            currentName
          });
        }, request.progressId);
        this.fireTransferProgress(request, Math.min(transferredBytes, totalBytes), totalBytes, "transfer", "Copying locally.", true, {
          completedItems: index + 1,
          totalItems: items.length,
          currentName
        });
      }
    } else if (platform() === "win32" || looksLikeWindowsPath(request.targetDirectory.path) || sources.some(looksLikeWindowsPath)) {
      await ensureLocalParentDirectory(this.joinBatchTargetPath(request.targetDirectory, items[0].targetName));
      this.markTransferDataStarted(request.progressId);
      await runLocalPowerShellScript(buildLocalWindowsBatchScript(sources, request.targetDirectory.path, operation));
    } else {
      await ensureLocalParentDirectory(this.joinBatchTargetPath(request.targetDirectory, items[0].targetName));
      await ensureLocalDirectory(request.targetDirectory.path);
      this.markTransferDataStarted(request.progressId);
      await runLocalCommand("mv", ["-f", ...sources, request.targetDirectory.path]);
    }
    this.throwIfTransferCanceled(request.progressId);
    this.fireTransferProgress(request, totalBytes, totalBytes, "complete", "Batch local transfer completed.", true, {
      completedItems: items.length,
      totalItems: items.length
    });
    return this.createBatchTransferResult(true, operation === "move" ? "local-copy" : "local-copy", totalBytes, "Batch local transfer completed.", items.length, 0, [], startedAt, request.progressId);
  }
  async getLocalBatchTransferSize(items, expectedBytes) {
    if (expectedBytes > 0) {
      return expectedBytes;
    }
    const sizes = await mapLimit(items, BATCH_TRANSFER_DIRECTORY_WORKERS, (item) => getLocalPathTransferSize(item.sourcePath, item.expectedBytes));
    return sizes.reduce((total, size) => total + size, 0);
  }
  async runSameRemoteNativeBatchTransfer(request, items, operation, expectedBytes, startedAt) {
    this.fireTransferProgress(request, 0, expectedBytes, "transfer", operation === "move" ? "Moving on remote host." : "Copying on remote host.", true, {
      completedItems: 0,
      totalItems: items.length,
      currentName: items[0]?.displayName ?? items[0]?.targetName
    });
    const sources = items.map((item) => item.sourcePath);
    this.markTransferDataStarted(request.progressId);
    if (looksLikeWindowsPath(request.targetDirectory.path) || sources.some(looksLikeWindowsPath)) {
      await this.withSshClient(request.source, (client) => this.execRemote(client, buildWindowsBatchCommand(sources, request.targetDirectory.path, operation)));
    } else {
      const plan = createPosixNativeBatchTransferPlan(items, request.targetDirectory.path, operation);
      await this.withSshClient(request.source, (client) => this.execRemoteWithInput(client, plan.command, plan.input));
    }
    this.throwIfTransferCanceled(request.progressId);
    this.fireTransferProgress(request, expectedBytes, expectedBytes, "complete", "Batch remote native transfer completed.", true, {
      completedItems: items.length,
      totalItems: items.length
    });
    this.clearRemoteDirectoryListingCache(request.source);
    this.clearRemoteDirectoryListingCache(request.targetDirectory);
    return this.createBatchTransferResult(true, "remote-copy", expectedBytes, "Batch remote native transfer completed.", items.length, 0, [], startedAt, request.progressId);
  }
  async tryLocalBatchRsyncTransfer(request, items, operation, expectedBytes, startedAt) {
    const isUpload = request.source.kind === "local" && request.targetDirectory.kind === "ssh" && !!request.targetDirectory.connection;
    const isDownload = request.source.kind === "ssh" && request.targetDirectory.kind === "local" && !!request.source.connection;
    if (!isUpload && !isDownload) {
      return void 0;
    }
    if (items.length <= 1 && items.every((item) => item.sourceType !== "directory")) {
      return void 0;
    }
    const protocol2 = isUpload ? request.targetDirectory.preferredProtocol : request.source.preferredProtocol;
    if (protocol2 !== "rsync") {
      return void 0;
    }
    if (isUpload && looksLikeWindowsPath(request.targetDirectory.path)) {
      return void 0;
    }
    if (isDownload && (looksLikeWindowsPath(request.source.path) || items.some((item) => looksLikeWindowsPath(item.sourcePath)))) {
      return void 0;
    }
    if (!canBatchRsyncPreserveTargetNames(items)) {
      return void 0;
    }
    const connection = isUpload ? request.targetDirectory.connection : request.source.connection;
    try {
      const tool = await resolveLocalRsyncTool();
      const initialTotalBytes = Math.max(0, expectedBytes);
      const progress = this.createRsyncProgressReporter(request, initialTotalBytes, "transfer", isUpload ? "Batch rsync upload in progress." : "Batch rsync download in progress.", {
        strategy: isUpload ? "rsync-upload" : "rsync-download",
        completedItems: 0,
        totalItems: items.length
      });
      if (initialTotalBytes <= 0) {
        const sizePromise = isUpload ? this.getLocalBatchTarBytes(items) : this.getRemoteBatchSourceContentSize(request.source, items);
        void sizePromise.then((total) => progress.setTotalBytes(total)).catch(() => void 0);
      }
      this.fireTransferProgress(request, 0, initialTotalBytes, "transfer", isUpload ? "Starting batch rsync upload." : "Starting batch rsync download.", true, {
        strategy: isUpload ? "rsync-upload" : "rsync-download",
        completedItems: 0,
        totalItems: items.length,
        currentName: items[0]?.displayName ?? items[0]?.targetName
      });
      if (isUpload) {
        const fastList = await this.buildLocalRsyncFastListFile(items);
        try {
          await withLocalRsyncSshEnvironment(connection, tool, (env, identityPath) => {
            const args = [
              ...buildLocalRsyncOptionArgs(true),
              buildRsyncPathWithMkdirOption(request.targetDirectory.path),
              "-e",
              buildLocalRsyncSshTransport(connection, tool.sshExecutable, identityPath)
            ];
            if (fastList) {
              args.push(
                `--files-from=${toRsyncLocalPath(fastList.listPath, tool.pathFlavor)}`,
                "--from0",
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
            await fsp.rm(fastList.listPath, { force: true }).catch(() => void 0);
          }
        }
      } else {
        await ensureLocalDirectory(request.targetDirectory.path);
        const sourceArgs = items.map((item) => formatRsyncRemoteSpec(connection, item.sourcePath));
        await withLocalRsyncSshEnvironment(connection, tool, (env, identityPath) => {
          return this.runCancelableLocalCommand(tool.executable, [
            ...buildLocalRsyncOptionArgs(true),
            "-e",
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
      const cleanupFailures = operation === "move" ? await this.deleteBatchSources(request.source, items) : [];
      const bytes = progress.getLastBytes() || expectedBytes;
      this.fireTransferProgress(request, bytes, 0, "complete", isUpload ? "Batch rsync upload completed." : "Batch rsync download completed.", true, {
        strategy: isUpload ? "rsync-upload" : "rsync-download",
        completedItems: items.length,
        totalItems: items.length
      });
      this.clearRemoteDirectoryListingCache(isUpload ? request.targetDirectory : request.source);
      return this.createBatchTransferResult(cleanupFailures.length === 0, isUpload ? "rsync-upload" : "rsync-download", bytes, cleanupFailures.length ? `Batch rsync completed, but source cleanup failed for ${cleanupFailures.length} item(s).` : "Batch rsync completed.", items.length, cleanupFailures.length, cleanupFailures, startedAt, request.progressId);
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      return void 0;
    }
  }
  async tryDirectBatchRsyncTransfer(request, items, expectedBytes, startedAt, allowAutoFast = false) {
    if (request.source.kind !== "ssh" || request.targetDirectory.kind !== "ssh" || !request.source.connection || !request.targetDirectory.connection) {
      return void 0;
    }
    const protocol2 = getSshToSshTransferProtocol(request.source);
    if (protocol2 !== "rsync" && !(allowAutoFast && protocol2 === "auto-fast")) {
      return void 0;
    }
    if (request.source.supportsRsync !== true || request.targetDirectory.supportsRsync !== true) {
      return void 0;
    }
    if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.targetDirectory.path) || items.some((item) => looksLikeWindowsPath(item.sourcePath))) {
      return void 0;
    }
    if (!canBatchRsyncPreserveTargetNames(items)) {
      return void 0;
    }
    const routes = await this.resolveDirectSshRoutes(request.source, request.targetDirectory, request.progressId);
    if (!routes.length) {
      return void 0;
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
    return void 0;
  }
  async tryDirectBatchRsyncTransferRoute(request, items, expectedBytes, startedAt, route) {
    const executorEndpoint = route === "source-push" ? request.source : request.targetDirectory;
    const remoteEndpoint = route === "source-push" ? request.targetDirectory : request.source;
    if (!executorEndpoint.connection || !remoteEndpoint.connection) {
      throw new Error("Batch direct rsync route is missing SSH connection details.");
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
      this.fireTransferProgress(request, 0, 0, "transfer", "Starting batch rsync direct transfer.", true, {
        strategy: "rsync-direct",
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
      const rsyncPathOption = route === "source-push" ? ` ${buildRsyncPathWithMkdirShellOption(request.targetDirectory.path)}` : "";
      const sourceArgs = route === "source-push" ? items.map((item) => quotePosixShellArg(item.sourcePath)).join(" ") : items.map((item) => quotePosixShellArg(`${remoteUserHost}:${item.sourcePath}`)).join(" ");
      const targetSpec = route === "source-push" ? `${remoteUserHost}:${ensureTrailingRemoteSlash(request.targetDirectory.path)}` : ensureTrailingRemoteSlash(request.targetDirectory.path);
      const rsyncCommandCore = `${sshpassPrefix}rsync ${rsyncOptions}${rsyncPathOption} -e ${quotePosixShellArg(sshTransport)} ${sourceArgs} ${quotePosixShellArg(targetSpec)}`;
      const rsyncCommand = route === "source-push" ? rsyncCommandCore : `mkdir -p ${quotePosixShellArg(request.targetDirectory.path)} && ${rsyncCommandCore}`;
      const progress = this.createRsyncProgressReporter(request, 0, "rsync-direct", "Batch direct rsync transfer in progress.", {
        strategy: "rsync-direct",
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
      this.fireTransferProgress(request, bytes, 0, "complete", "Batch direct rsync completed.", true, {
        strategy: "rsync-direct",
        route,
        completedItems: items.length,
        totalItems: items.length
      });
      this.clearRemoteDirectoryListingCache(request.targetDirectory);
      return this.createBatchTransferResult(true, "rsync-direct", bytes, "Batch direct rsync completed.", items.length, 0, [], startedAt, request.progressId);
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
  async tryTunneledBatchRsyncRelayTransfer(request, items, expectedBytes, startedAt, allowAutoFast = false) {
    if (request.source.kind !== "ssh" || request.targetDirectory.kind !== "ssh" || !request.source.connection || !request.targetDirectory.connection) {
      return void 0;
    }
    const protocol2 = getSshToSshTransferProtocol(request.source);
    if (protocol2 !== "rsync" && !(allowAutoFast && protocol2 === "auto-fast")) {
      return void 0;
    }
    if (request.source.supportsRsync !== true || request.targetDirectory.supportsRsync !== true || !request.targetDirectory.connection.password) {
      return void 0;
    }
    if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.targetDirectory.path) || items.some((item) => looksLikeWindowsPath(item.sourcePath))) {
      return void 0;
    }
    if (!canBatchRsyncPreserveTargetNames(items)) {
      return void 0;
    }
    const sourceConfigResult = await this.createConnectConfig(request.source.connection);
    if (!sourceConfigResult.ok) {
      return void 0;
    }
    const client = await this.connect(sourceConfigResult.config);
    const forwardedSockets = /* @__PURE__ */ new Set();
    let forwardedPort;
    const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
      for (const socket of forwardedSockets) {
        socket.destroy();
      }
      client.end();
    });
    client.on("tcp connection", (_details, accept, reject) => {
      if (this.isTransferCanceled(request.progressId)) {
        reject();
        return;
      }
      const channel = accept();
      const socket = connectTcp(request.targetDirectory.connection.port || 22, request.targetDirectory.connection.host);
      forwardedSockets.add(socket);
      socket.on("close", () => forwardedSockets.delete(socket));
      socket.on("error", () => channel.destroy());
      channel.on("error", () => socket.destroy());
      channel.on("close", () => socket.destroy());
      socket.pipe(channel);
      channel.pipe(socket);
    });
    try {
      this.throwIfTransferCanceled(request.progressId);
      this.fireTransferProgress(request, 0, 0, "transfer", "Starting batch rsync relay transfer.", true, {
        strategy: "rsync-relay",
        completedItems: 0,
        totalItems: items.length,
        currentName: items[0]?.displayName ?? items[0]?.targetName
      });
      if (!await this.canUseLocalRsync(client)) {
        return void 0;
      }
      forwardedPort = await this.forwardIn(client, RSYNC_RELAY_BIND_HOST, 0);
      const target = request.targetDirectory.connection;
      const targetUserHost = `${target.username}@${RSYNC_RELAY_BIND_HOST}`;
      const sshBinary = await this.resolveRemoteRsyncSshBinary(client, request.source.connection);
      const sshTransport = buildOptimizedRsyncSshCommand(forwardedPort, true, sshBinary);
      const sshpassPrefix = buildSshpassPrefix(target.password);
      if (!await this.canUseTargetRsyncThroughRelay(client, targetUserHost, forwardedPort, sshpassPrefix)) {
        return void 0;
      }
      const rsyncOptions = buildRsyncOptions(true);
      const sourceArgs = items.map((item) => quotePosixShellArg(item.sourcePath)).join(" ");
      const targetSpec = `${targetUserHost}:${ensureTrailingRemoteSlash(request.targetDirectory.path)}`;
      const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} ${buildRsyncPathWithMkdirShellOption(request.targetDirectory.path)} -e ${quotePosixShellArg(sshTransport)} ${sourceArgs} ${quotePosixShellArg(targetSpec)}`;
      const progress = this.createRsyncProgressReporter(request, 0, "relay-upload", "Batch rsync relay transfer in progress.", {
        strategy: "rsync-relay",
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
      this.fireTransferProgress(request, bytes, 0, "complete", "Batch rsync relay completed.", true, {
        strategy: "rsync-relay",
        completedItems: items.length,
        totalItems: items.length
      });
      this.clearRemoteDirectoryListingCache(request.targetDirectory);
      return this.createBatchTransferResult(true, "rsync-relay", bytes, "Batch rsync relay completed.", items.length, 0, [], startedAt, request.progressId);
    } catch {
      if (this.isTransferCanceled(request.progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      return void 0;
    } finally {
      unregisterCancel();
      if (forwardedPort !== void 0) {
        await this.unforwardIn(client, RSYNC_RELAY_BIND_HOST, forwardedPort).catch(() => void 0);
      }
      for (const socket of forwardedSockets) {
        socket.destroy();
      }
      client.end();
    }
  }
  async tryBatchTarTransfer(request, items, operation, expectedBytes, startedAt, forceProtocol = false) {
    if (request.source.kind === "local" && request.targetDirectory.kind === "ssh") {
      if (!forceProtocol && !shouldPreferTarForMultiItemTransfer(request.targetDirectory.preferredProtocol)) {
        return void 0;
      }
      if (request.targetDirectory.supportsTar === false || looksLikeWindowsPath(request.targetDirectory.path)) {
        return void 0;
      }
      const plans = createLocalBatchTarPlans(items);
      if (!plans?.length) {
        return void 0;
      }
      const targetNames = collectBatchTarTargetNames(plans);
      let bytes = Math.max(0, expectedBytes);
      const sizePromise = bytes <= 0 ? this.getLocalBatchTarBytes(items).catch(() => 0) : void 0;
      this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing batch tar upload.", true, { strategy: "tar-upload", completedItems: 0, totalItems: items.length });
      let archiveBytes = 0;
      const onArchiveDelta = (delta) => {
        this.throwIfTransferCanceled(request.progressId);
        archiveBytes += Math.max(0, delta);
        this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, "transfer", "Batch tar upload in progress.", false, { strategy: "tar-upload", completedItems: 0, totalItems: items.length });
      };
      if (sizePromise) {
        void sizePromise.then((total) => {
          if (total > bytes) {
            bytes = total;
            this.fireTransferProgress(request, Math.min(archiveBytes, bytes), bytes, "transfer", "Batch tar upload in progress.", true, { strategy: "tar-upload", completedItems: 0, totalItems: items.length });
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
      this.fireTransferProgress(request, resultBytes, resultBytes, "complete", "Batch tar upload completed.", true, { strategy: "tar-upload", completedItems: items.length, totalItems: items.length });
      return this.createBatchTransferResult(true, "tar-upload", resultBytes, "Batch tar upload completed.", items.length, 0, [], startedAt, request.progressId);
    }
    if (request.source.kind === "ssh" && request.targetDirectory.kind === "local") {
      if (!forceProtocol && !shouldPreferTarForMultiItemTransfer(request.source.preferredProtocol)) {
        return void 0;
      }
      if (request.source.supportsTar === false || looksLikeWindowsPath(request.source.path)) {
        return void 0;
      }
      const plan = this.createRemoteBatchTarPlan(items);
      if (!plan) {
        return void 0;
      }
      let bytes = Math.max(0, expectedBytes);
      const sizePromise = bytes <= 0 ? this.getRemoteBatchSourceContentSize(request.source, items).catch(() => 0) : void 0;
      this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing batch tar download.", true, { strategy: "tar-download", completedItems: 0, totalItems: items.length });
      await this.prepareLocalBatchTarTarget(request.targetDirectory.path, plan.targetNames);
      let archiveBytes = 0;
      const onArchiveDelta = (delta) => {
        this.throwIfTransferCanceled(request.progressId);
        archiveBytes += Math.max(0, delta);
        this.fireTransferProgress(request, bytes > 0 ? Math.min(archiveBytes, bytes) : archiveBytes, bytes, "transfer", "Batch tar download in progress.", false, { strategy: "tar-download", completedItems: 0, totalItems: items.length });
      };
      if (sizePromise) {
        void sizePromise.then((total) => {
          if (total > bytes) {
            bytes = total;
            this.fireTransferProgress(request, Math.min(archiveBytes, bytes), bytes, "transfer", "Batch tar download in progress.", true, { strategy: "tar-download", completedItems: 0, totalItems: items.length });
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
      this.fireTransferProgress(request, resultBytes, resultBytes, "complete", "Batch tar download completed.", true, { strategy: "tar-download", completedItems: items.length, totalItems: items.length });
      return this.createBatchTransferResult(true, "tar-download", resultBytes, "Batch tar download completed.", items.length, 0, [], startedAt, request.progressId);
    }
    if (request.source.kind === "ssh" && request.targetDirectory.kind === "ssh") {
      if (!forceProtocol && !shouldPreferTarForMultiItemTransfer(getSshToSshTransferProtocol(request.source))) {
        return void 0;
      }
      if (request.source.supportsTar === false || request.targetDirectory.supportsTar === false || looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.targetDirectory.path)) {
        return void 0;
      }
      const plan = this.createRemoteBatchTarPlan(items);
      if (!plan) {
        return void 0;
      }
      const bytes = expectedBytes > 0 ? expectedBytes : await this.getRemoteBatchSourceContentSize(request.source, items);
      let directFailure;
      if (request.strategyHint !== "relay") {
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
      if (request.strategyHint === "direct") {
        if (directFailure) {
          throw directFailure;
        }
        return void 0;
      }
      return this.tryRelayBatchTarTransfer(request, items, plan, operation, bytes, startedAt);
    }
    return void 0;
  }
  createRemoteBatchTarPlan(items) {
    if (!items.length) {
      return void 0;
    }
    const parentPath = getRemoteParentPath(items[0].sourcePath);
    const names = [];
    const targetNames = [];
    for (const item of items) {
      const name = getTransferName(item.sourcePath);
      if (!name || getRemoteParentPath(item.sourcePath) !== parentPath || item.targetName !== name) {
        return void 0;
      }
      names.push(name);
      targetNames.push(item.targetName);
    }
    return { parentPath, names, targetNames };
  }
  async getLocalBatchTarBytes(items) {
    let total = 0;
    for (const item of items) {
      total += await getLocalPathSize(item.sourcePath).catch(() => Math.max(0, item.expectedBytes ?? 0));
    }
    return total;
  }
  async getRemoteBatchSourceContentSize(source, items) {
    let total = 0;
    for (const item of items) {
      total += await this.getRemotePathContentSizeByCommand({ ...source, path: item.sourcePath }).catch(() => Math.max(0, item.expectedBytes ?? 0));
    }
    return total;
  }
  async getRemoteBatchTargetContentSize(targetDirectory, targetNames) {
    let total = 0;
    for (const targetName of targetNames) {
      total += await this.getRemotePathContentSizeByCommand({ ...targetDirectory, path: joinRemotePath(targetDirectory.path, targetName) }).catch(() => 0);
    }
    return total;
  }
  beginRemoteBatchTargetGrowthTiming(progressId, targetDirectory, targetNames, baselineSize = 0, expectedBytes = 0, onProgress, pollIntervalMs = TRANSFER_PROGRESS_EVENT_INTERVAL_MS, initialDelayMs = 0) {
    return this.beginTransferGrowthTiming(progressId, () => this.getRemoteBatchTargetContentSize(targetDirectory, targetNames), baselineSize, expectedBytes, onProgress, pollIntervalMs, initialDelayMs);
  }
  async prepareLocalBatchTarTarget(targetDirectory, targetNames) {
    await ensureLocalDirectory(targetDirectory);
    await Promise.all(targetNames.map((targetName) => fsp.rm(join(targetDirectory, targetName), { recursive: true, force: true }).catch(() => void 0)));
  }
  async cleanupBatchSourcesAfterTar(request, items, operation) {
    if (operation !== "move") {
      return;
    }
    const cleanupFailures = await this.deleteBatchSources(request.source, items);
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
    if (targetDirectory.kind !== "ssh" || !targetDirectory.connection) {
      throw new Error("Missing SSH target.");
    }
    const localTarRoot = await this.createLocalTarRootAliasIfNeeded(plan.parentPath, plan.requiresSafeParentPath === true);
    const tarPlan = localTarRoot.path === plan.parentPath ? plan : { ...plan, parentPath: localTarRoot.path };
    try {
      try {
        await this.runParallelLocalBatchTarUpload(tarPlan, targetDirectory.connection, targetDirectory.path, progressId, onArchiveDelta);
        return;
      } catch (error) {
        if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
          throw new TurboFileTransferCanceledError();
        }
      }
      try {
        await this.runParallelLocalBatchTarZstdUpload(tarPlan, targetDirectory.connection, targetDirectory.path, progressId, onArchiveDelta);
        return;
      } catch (error) {
        if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
          throw new TurboFileTransferCanceledError();
        }
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
  async runNativeLocalBatchTarUploadFromList(plan, connection, remoteCommand, progressId, onArchiveDelta) {
    const tempRoot = join(tmpdir(), `turbofile-batch-tar-${randomUUID()}`);
    await fsp.mkdir(tempRoot, { recursive: true });
    try {
      const listPath = await this.writeLocalTarListFile(tempRoot, plan.names);
      await this.runNativeLocalTarUpload(["-cf", "-", "-C", plan.parentPath, "--null", "-T", listPath], connection, remoteCommand, progressId, onArchiveDelta);
    } finally {
      await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => void 0);
    }
  }
  async runRemoteBatchTarDownload(source, plan, targetDirectory, progressId, onArchiveDelta) {
    if (source.kind !== "ssh" || !source.connection) {
      throw new Error("Missing SSH source.");
    }
    try {
      await this.runNativeLocalTarDownload(source.connection, buildTarCreateFromItemsCommand(plan.parentPath, plan.names), ["-xf", "-", "-C", targetDirectory], progressId, onArchiveDelta);
      return;
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
        throw new TurboFileTransferCanceledError();
      }
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
      const sourceStream = await this.openRemoteCommandStream(client, buildTarCreateFromItemsCommand(plan.parentPath, plan.names), "batch tar download create");
      tarProcess = spawn("tar.exe", [...await this.getLocalTarCharsetArgs(), "-xf", "-", "-C", targetDirectory], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      if (!tarProcess.stdin || !tarProcess.stdout) {
        throw new Error("Local batch tar download did not provide pipes.");
      }
      tarProcess.stdout.resume();
      const tarClose = waitForLocalProcessClose(tarProcess, "local batch tar download");
      await pipeline(sourceStream.stream, createProgressPassThrough(onArchiveDelta), tarProcess.stdin);
      await sourceStream.close;
      await tarClose;
    } finally {
      unregisterCancel();
      client?.end();
    }
  }
  async tryDirectBatchTarTransfer(request, items, plan, operation, expectedBytes, startedAt) {
    if (request.source.kind !== "ssh" || request.targetDirectory.kind !== "ssh" || !request.source.connection || !request.targetDirectory.connection) {
      return void 0;
    }
    const routes = await this.resolveDirectSshRoutes(request.source, request.targetDirectory, request.progressId);
    if (!routes.length) {
      return void 0;
    }
    const failures = [];
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
    throw new Error(`Direct batch tar failed: ${failures.join("; ")}`);
  }
  async tryDirectBatchTarTransferRoute(request, items, plan, operation, expectedBytes, startedAt, route) {
    const executorEndpoint = route === "source-push" ? request.source : request.targetDirectory;
    const remoteEndpoint = route === "source-push" ? request.targetDirectory : request.source;
    if (!executorEndpoint.connection || !remoteEndpoint.connection) {
      throw new Error("Direct batch tar route is missing SSH connection details.");
    }
    const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
    if (!executorConfigResult.ok) {
      throw new Error(executorConfigResult.message);
    }
    const client = await this.connectDirectSsh(executorConfigResult.config);
    const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
    let credential;
    let stopGrowthTiming = () => void 0;
    try {
      credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection);
      const remote = remoteEndpoint.connection;
      const remoteUserHost = `${remote.username}@${remote.host}`;
      const sshpassPrefix = buildSshpassPrefix(remote.password);
      const sshCommand = buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath);
      const command = route === "source-push" ? buildTarItemsSourcePushCommand(plan.parentPath, plan.names, request.targetDirectory.path, plan.targetNames, remoteUserHost, sshCommand, sshpassPrefix) : buildTarItemsTargetPullCommand(plan.parentPath, plan.names, request.targetDirectory.path, plan.targetNames, remoteUserHost, sshCommand, sshpassPrefix);
      this.fireTransferProgress(request, 0, expectedBytes, "prepare", "Preparing batch direct tar transfer.", true, { strategy: "tar-direct", route, completedItems: 0, totalItems: items.length });
      stopGrowthTiming = this.beginRemoteBatchTargetGrowthTiming(request.progressId, request.targetDirectory, plan.targetNames, 0, expectedBytes, (transferredBytes) => {
        this.fireTransferProgress(request, transferredBytes, expectedBytes, "transfer", "Batch direct tar transfer in progress.", false, { strategy: "tar-direct", route, completedItems: 0, totalItems: items.length });
      });
      this.markTransferDataStarted(request.progressId);
      await this.execRemote(client, command, { inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS, progressId: request.progressId });
      this.throwIfTransferCanceled(request.progressId);
      const bytes = expectedBytes > 0 ? expectedBytes : await this.getRemoteBatchTargetContentSize(request.targetDirectory, plan.targetNames).catch(() => 0);
      await this.cleanupBatchSourcesAfterTar(request, items, operation);
      this.fireTransferProgress(request, bytes, bytes, "complete", "Batch direct tar completed.", true, { strategy: "tar-direct", route, completedItems: items.length, totalItems: items.length });
      return this.createBatchTransferResult(true, "tar-direct", bytes, "Batch direct tar completed.", items.length, 0, [], startedAt, request.progressId);
    } finally {
      stopGrowthTiming();
      if (credential?.cleanupCommand) {
        await this.execRemote(client, credential.cleanupCommand).catch(() => void 0);
      }
      unregisterCancel();
      client.end();
    }
  }
  async tryRelayBatchTarTransfer(request, items, plan, operation, expectedBytes, startedAt) {
    if (request.source.kind !== "ssh" || request.targetDirectory.kind !== "ssh" || !request.source.connection || !request.targetDirectory.connection) {
      return void 0;
    }
    const sourceConfigResult = await this.createConnectConfig(request.source.connection);
    const targetConfigResult = await this.createConnectConfig(request.targetDirectory.connection);
    if (!sourceConfigResult.ok || !targetConfigResult.ok) {
      return void 0;
    }
    let sourceClient;
    let targetClient;
    let stopGrowthTiming = () => void 0;
    const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
      sourceClient?.end();
      targetClient?.end();
    });
    try {
      sourceClient = await this.connect(sourceConfigResult.config);
      targetClient = await this.connect(targetConfigResult.config);
      this.fireTransferProgress(request, 0, expectedBytes, "prepare", "Preparing batch tar relay.", true, { strategy: "tar-relay", route: "relay", completedItems: 0, totalItems: items.length });
      stopGrowthTiming = this.beginRemoteBatchTargetGrowthTiming(request.progressId, request.targetDirectory, plan.targetNames, 0, expectedBytes, (transferredBytes) => {
        this.fireTransferProgress(request, transferredBytes, expectedBytes, "relay-upload", "Batch tar relay in progress.", false, { strategy: "tar-relay", route: "relay", completedItems: 0, totalItems: items.length });
      });
      this.markTransferDataStarted(request.progressId);
      const sourceStream = await this.openRemoteCommandStream(sourceClient, buildTarCreateFromItemsCommand(plan.parentPath, plan.names), "batch tar relay create");
      const targetStream = await this.openRemoteCommandStream(targetClient, buildTarExtractToDirectoryCommand(request.targetDirectory.path, plan.targetNames), "batch tar relay extract", true);
      await pipeline(sourceStream.stream, targetStream.stream);
      await sourceStream.close;
      await targetStream.close;
      this.throwIfTransferCanceled(request.progressId);
      const bytes = expectedBytes > 0 ? expectedBytes : await this.getRemoteBatchTargetContentSize(request.targetDirectory, plan.targetNames).catch(() => 0);
      await this.cleanupBatchSourcesAfterTar(request, items, operation);
      this.fireTransferProgress(request, bytes, bytes, "complete", "Batch tar relay completed.", true, { strategy: "tar-relay", route: "relay", completedItems: items.length, totalItems: items.length });
      return this.createBatchTransferResult(true, "tar-relay", bytes, "Batch tar relay completed.", items.length, 0, [], startedAt, request.progressId);
    } finally {
      stopGrowthTiming();
      unregisterCancel();
      sourceClient?.end();
      targetClient?.end();
    }
  }
  async runConcurrentBatchTransfer(request, items, operation, expectedBytes, startedAt, disableRsync) {
    const transferredByItem = new Array(items.length).fill(0);
    const totalByItem = items.map((item) => Math.max(0, item.expectedBytes ?? 0));
    const successfulItems = [];
    const failures = [];
    const strategies = /* @__PURE__ */ new Set();
    const childProgressIds = /* @__PURE__ */ new Set();
    let completedItems = 0;
    let completedBytes = 0;
    const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
      for (const childProgressId of [...childProgressIds]) {
        void this.cancelTransfer(childProgressId);
      }
    });
    const workerLimit = items.some((item) => item.sourceType === "directory") ? BATCH_TRANSFER_DIRECTORY_WORKERS : BATCH_TRANSFER_WORKERS;
    try {
      await mapLimit(items, workerLimit, async (item, index) => {
        this.throwIfTransferCanceled(request.progressId);
        const childProgressId = `${request.progressId ?? "turbofile-batch"}-${index}-${randomUUID()}`;
        childProgressIds.add(childProgressId);
        const childSource = disableRsync ? { ...request.source, path: item.sourcePath, supportsRsync: false } : { ...request.source, path: item.sourcePath };
        const childTarget = disableRsync ? { ...request.targetDirectory, path: this.joinBatchTargetPath(request.targetDirectory, item.targetName), supportsRsync: false } : { ...request.targetDirectory, path: this.joinBatchTargetPath(request.targetDirectory, item.targetName) };
        const disposable = this.onDynamicTransferProgress(childProgressId)((event) => {
          transferredByItem[index] = event.transferredBytes;
          totalByItem[index] = Math.max(totalByItem[index], event.totalBytes);
          this.fireBatchAggregateProgress(request, transferredByItem, totalByItem, event.phase, event.detail ?? "Batch transfer in progress.", completedItems, items.length, item.displayName ?? item.targetName, false, event.strategy);
        });
        try {
          const result = await this.transferFile({
            source: childSource,
            target: childTarget,
            sourceType: item.sourceType,
            expectedBytes: item.expectedBytes,
            progressId: childProgressId,
            strategyHint: disableRsync && request.source.kind === "ssh" && request.targetDirectory.kind === "ssh" ? "direct" : request.strategyHint
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
          this.fireBatchAggregateProgress(request, transferredByItem, totalByItem, "transfer", "Batch transfer in progress.", completedItems, items.length, item.displayName ?? item.targetName, true);
        }
      });
      if (operation === "move" && successfulItems.length) {
        const cleanupFailures = await this.deleteBatchSources(request.source, successfulItems);
        failures.push(...cleanupFailures);
      }
      const bytes = Math.max(completedBytes, transferredByItem.reduce((sum, value) => sum + value, 0), expectedBytes > 0 && failures.length === 0 ? expectedBytes : 0);
      this.fireTransferProgress(request, bytes, Math.max(bytes, expectedBytes), "complete", "Batch transfer completed.", true, {
        completedItems: successfulItems.length,
        totalItems: items.length
      });
      const failed = failures.length;
      return this.createBatchTransferResult(failed === 0, [...strategies][0] ?? getTransferStrategy(request.source, request.targetDirectory), bytes, failed === 0 ? "Batch transfer completed." : `Batch transfer completed with ${failed} failure(s).`, successfulItems.length, failed, failures, startedAt, request.progressId);
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
        return this.createBatchTransferResult(false, [...strategies][0] ?? getTransferStrategy(request.source, request.targetDirectory), completedBytes, TRANSFER_CANCELED_MESSAGE, successfulItems.length, failures.length, failures, startedAt, request.progressId, true);
      }
      throw error;
    } finally {
      unregisterCancel();
    }
  }
  fireBatchAggregateProgress(request, transferredByItem, totalByItem, phase, detail, completedItems, totalItems, currentName, force = false, strategy) {
    const transferredBytes = transferredByItem.reduce((sum, value) => sum + Math.max(0, value), 0);
    const totalBytes = Math.max(this.getBatchExpectedBytes(request, request.items), totalByItem.reduce((sum, value) => sum + Math.max(0, value), 0));
    this.fireTransferProgress(request, transferredBytes, totalBytes, phase, detail, force, {
      strategy,
      completedItems,
      totalItems,
      currentName
    });
  }
  async deleteBatchSources(source, items) {
    const failures = [];
    if (source.kind === "local") {
      await mapLimit(items, BATCH_TRANSFER_WORKERS, async (item) => {
        try {
          await fsp.rm(item.sourcePath, { recursive: true, force: true });
        } catch (error) {
          failures.push({ name: item.displayName ?? item.targetName, path: item.sourcePath, message: error instanceof Error ? error.message : String(error) });
        }
      });
      return failures;
    }
    try {
      const paths = items.map((item) => item.sourcePath);
      const command = paths.some(looksLikeWindowsPath) ? buildWindowsBatchDeleteCommand(paths) : `rm -rf -- ${paths.map((path) => quotePosixShellArg(path)).join(" ")}`;
      await this.withSshClient(source, (client) => this.execRemote(client, command));
    } catch (error) {
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
      averageBytesPerSecond: Math.round(bytes / (durationMs / 1e3))
    };
  }
  async createDirectory(endpoint) {
    try {
      if (endpoint.kind === "local") {
        await fsp.mkdir(endpoint.path, { recursive: true });
      } else {
        await this.withDirectorySftp(endpoint, (sftp) => this.ensureRemoteDirectory(sftp, endpoint.path));
      }
      this.clearRemoteDirectoryListingCache(endpoint);
      return { ok: true, message: "Directory created." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async deletePath(endpoint, recursive = true) {
    try {
      if (endpoint.kind === "local") {
        await fsp.rm(endpoint.path, { recursive, force: true });
      } else {
        try {
          await this.deleteRemotePathNative(endpoint, recursive);
        } catch (error) {
          if (error instanceof Error && error.message === "Refusing to delete a filesystem root.") {
            throw error;
          }
          await this.withSftp(endpoint, async (sftp) => {
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
      return { ok: true, message: "Path deleted." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async deletePaths(endpoints, recursive = true) {
    const targets = endpoints.filter((endpoint) => !!endpoint.path);
    if (!targets.length) {
      return { ok: true, message: "Nothing to delete." };
    }
    if (targets.length === 1) {
      return this.deletePath(targets[0], recursive);
    }
    try {
      const first = targets[0];
      if (first.kind === "local") {
        await Promise.all(targets.map((endpoint) => fsp.rm(endpoint.path, { recursive, force: true })));
        for (const endpoint of targets) {
          this.clearRemoteDirectoryListingCache(endpoint);
        }
        return { ok: true, message: "Paths deleted." };
      }
      for (const endpoint of targets) {
        this.assertSafeDeletePath(endpoint.path);
      }
      if (looksLikeWindowsPath(first.path)) {
        await this.withSshClient(first, (client) => this.execRemote(client, buildWindowsDeleteManyCommand(targets.map((endpoint) => endpoint.path), recursive)));
      } else {
        const input = Buffer.from(`${targets.map((endpoint) => endpoint.path).join("\0")}\0`, "utf8");
        const removeFlag = recursive ? "-rf" : "-f";
        await this.withSshClient(first, (client) => this.execRemoteWithInput(client, `LC_ALL=C xargs -0 -r rm ${removeFlag} --`, input, { timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS }));
      }
      this.clearRemoteDirectoryListingCache(first);
      return { ok: true, message: "Paths deleted." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async deleteRemotePathNative(endpoint, recursive) {
    this.assertSafeDeletePath(endpoint.path);
    const command = looksLikeWindowsPath(endpoint.path) ? buildWindowsDeleteCommand(endpoint.path, recursive) : buildPosixDeleteCommand(endpoint.path, recursive);
    await this.withSshClient(endpoint, (client) => this.execRemote(client, command));
  }
  assertSafeDeletePath(path) {
    const trimmed = path.trim();
    const normalized = trimmed.replace(/[\\/]+$/, "");
    if (!trimmed || trimmed === "/" || trimmed === "\\" || normalized === "" || /^[A-Za-z]:$/.test(normalized)) {
      throw new Error("Refusing to delete a filesystem root.");
    }
  }
  async renamePath(endpoint, targetPath) {
    try {
      if (endpoint.kind === "local") {
        await this.moveLocalPathNative(endpoint.path, targetPath);
      } else {
        await this.moveRemotePathNative(endpoint, targetPath);
      }
      this.clearRemoteDirectoryListingCache(endpoint);
      this.clearRemoteDirectoryListingCache(endpoint, targetPath);
      return { ok: true, message: "Path renamed." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async movePathsIntoDirectory(sources, targetDirectory) {
    const targets = sources.filter((endpoint) => !!endpoint.path);
    if (!targets.length) {
      return { ok: true, message: "Nothing to move." };
    }
    const first = targets[0];
    const windowsPath = looksLikeWindowsPath(targetDirectory) || looksLikeWindowsPath(first.path);
    try {
      if (first.kind === "local") {
        await Promise.all(targets.map((endpoint) => this.moveLocalPathNative(endpoint.path, joinRemotePath(targetDirectory, getTransferName(endpoint.path)))));
      } else if (windowsPath) {
        for (const endpoint of targets) {
          await this.moveRemotePathNative(endpoint, joinRemotePath(targetDirectory, getTransferName(endpoint.path)));
        }
      } else {
        const dir = quotePosixShellArg(targetDirectory);
        const command = `mkdir -p -- ${dir} && LC_ALL=C xargs -0 -r sh -c 'mv -f -- "$@" "$0"' ${dir}`;
        const input = Buffer.from(`${targets.map((endpoint) => endpoint.path).join("\0")}\0`, "utf8");
        await this.withSshClient(first, (client) => this.execRemoteWithInput(client, command, input, { timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS }));
      }
      this.clearRemoteDirectoryListingCache(first);
      this.clearRemoteDirectoryListingCache(first, targetDirectory);
      return { ok: true, message: "Paths moved." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async calculatePathSize(endpoint) {
    try {
      const size = endpoint.kind === "local" ? await getLocalPathSizeByCommand(endpoint.path) : await this.getRemotePathSizeByCommand(endpoint);
      const humanSize = await this.getPathHumanSize(endpoint, size);
      return { ok: true, message: "Path size calculated.", size, humanSize };
    } catch (error) {
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
        message: paths.length > 0 ? "Windows clipboard files loaded." : "No Windows files in clipboard.",
        paths,
        operation: readWindowsClipboardOperation()
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        paths: [],
        operation: "copy"
      };
    }
  }
  async startWindowsFileDrag(request) {
    if (platform() !== "win32") {
      return { ok: false, message: "Windows file drag is only supported on Windows." };
    }
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed() && !candidate.webContents.isDestroyed());
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
      return { ok: false, message: "No TurboFile window is available for Windows drag." };
    }
    if (request.source.kind === "ssh") {
      return this.startRemoteWindowsFileDrag(request, window);
    }
    if (request.source.kind !== "local") {
      return { ok: false, message: "Unsupported Windows drag source." };
    }
    const files = request.items.map((item) => item.sourcePath).filter((path) => isWindowsClipboardPath(path));
    if (!files.length) {
      return { ok: false, message: "No local Windows files are available to drag." };
    }
    try {
      window.webContents.startDrag({
        file: files[0],
        files,
        icon: createWindowsDragIcon()
      });
      return { ok: true, message: "Windows file drag started." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  async startRemoteWindowsFileDrag(request, window) {
    if (!request.source.connection) {
      return { ok: false, message: "Missing SSH source connection for Windows drag." };
    }
    if (!request.items.length) {
      return { ok: false, message: "No SSH files are available to drag." };
    }
    const token = randomUUID();
    const fakeDirectoryName = createWindowsDragFakeDirectoryName(token);
    const paths = this.getWindowsDragCopyHookPaths(token, fakeDirectoryName);
    try {
      await this.ensureWindowsDragCopyHookRegistered();
      await fsp.rm(paths.activeRoot, { recursive: true, force: true }).catch(() => void 0);
      await fsp.rm(paths.targetFile, { force: true }).catch(() => void 0);
      await fsp.mkdir(paths.fakeDirectory, { recursive: true });
      await fsp.mkdir(dirname(paths.targetFile), { recursive: true });
      window.webContents.startDrag({
        file: paths.fakeDirectory,
        files: [paths.fakeDirectory],
        icon: createWindowsDragIcon()
      });
      const targetDirectory = await this.waitForWindowsDragCopyHookTarget(paths.targetFile, fakeDirectoryName);
      return { ok: true, message: "Windows drop target captured.", targetDirectory };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        message,
        canceled: message.includes("timed out")
      };
    } finally {
      await fsp.rm(paths.activeRoot, { recursive: true, force: true }).catch(() => void 0);
      await fsp.rm(paths.targetFile, { force: true }).catch(() => void 0);
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
      throw new Error("LOCALAPPDATA is required for SSH drag to Windows.");
    }
    return join(localAppData, TURBOFILE_WINDOWS_DRAG_APP_DIR, TURBOFILE_WINDOWS_DRAG_ROOT_DIR);
  }
  async waitForWindowsDragCopyHookTarget(targetFile, fakeDirectoryName) {
    const deadline = Date.now() + WINDOWS_DRAG_COPY_HOOK_TIMEOUT_MS;
    const desktopFallbackDirs = this.getWindowsDragDesktopFallbackDirs();
    while (Date.now() < deadline) {
      try {
        const raw = await fsp.readFile(targetFile, "utf8");
        const captured = raw.replace(/^\uFEFF/, "");
        if (captured) {
          const targetDirectory = normalizeWindowsCopyHookDestination(captured, fakeDirectoryName);
          if (!isWindowsClipboardPath(targetDirectory)) {
            throw new Error(`Captured Windows drop target is invalid: ${targetDirectory}`);
          }
          return targetDirectory;
        }
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
      for (const desktopDir of desktopFallbackDirs) {
        const landedFolder = join(desktopDir, fakeDirectoryName);
        try {
          if ((await fsp.stat(landedFolder)).isDirectory()) {
            await fsp.rm(landedFolder, { recursive: true, force: true }).catch(() => void 0);
            return desktopDir;
          }
        } catch {
        }
      }
      await delay(WINDOWS_DRAG_COPY_HOOK_POLL_MS);
    }
    throw new Error("Windows drop target capture timed out.");
  }
  /**
   * Resolves the real Desktop directory for the "桌面" quick-nav shortcut. `app.getPath('desktop')`
   * follows a Desktop relocated to another drive (e.g. D:\Desktop), so clicking 桌面 lands on the
   * folder the OS actually uses — which is also where Explorer drops dragged files.
   */
  async getLocalDesktopPath() {
    try {
      const desktop = app.getPath("desktop");
      if (desktop) {
        return desktop;
      }
    } catch {
    }
    if (process.env.USERPROFILE) {
      return join(process.env.USERPROFILE, "Desktop");
    }
    return "";
  }
  /**
   * Candidate Desktop directories used to recover a drop the Directory CopyHook never saw (see
   * {@link waitForWindowsDragCopyHookTarget}). `app.getPath('desktop')` honors a relocated Desktop
   * (e.g. moved to D:\), and the raw profile Desktop is added as a defensive secondary.
   */
  getWindowsDragDesktopFallbackDirs() {
    const dirs = [];
    const add = (dir) => {
      if (dir && !dirs.some((existing) => existing.toLowerCase() === dir.toLowerCase())) {
        dirs.push(dir);
      }
    };
    try {
      add(app.getPath("desktop"));
    } catch {
    }
    if (process.env.USERPROFILE) {
      add(join(process.env.USERPROFILE, "Desktop"));
    }
    return dirs;
  }
  async ensureWindowsDragCopyHookRegistered() {
    if (!this.windowsDragCopyHookRegistrationPromise) {
      this.windowsDragCopyHookRegistrationPromise = this.registerWindowsDragCopyHook().catch((error) => {
        this.windowsDragCopyHookRegistrationPromise = void 0;
        throw error;
      });
    }
    await this.windowsDragCopyHookRegistrationPromise;
  }
  async registerWindowsDragCopyHook() {
    const dllPath = this.resolveWindowsDragCopyHookDllPath();
    const clsidKey = `HKCU\\Software\\Classes\\CLSID\\${TURBOFILE_WINDOWS_DRAG_COPY_HOOK_CLSID}`;
    const inprocKey = `${clsidKey}\\InprocServer32`;
    const handlerKey = "HKCU\\Software\\Classes\\Directory\\shellex\\CopyHookHandlers\\TurboFileCopyHook";
    await runLocalCommand("reg.exe", ["add", clsidKey, "/ve", "/d", "TurboFile Windows Drag CopyHook", "/f"]);
    await runLocalCommand("reg.exe", ["add", inprocKey, "/ve", "/d", dllPath, "/f"]);
    await runLocalCommand("reg.exe", ["add", inprocKey, "/v", "ThreadingModel", "/t", "REG_SZ", "/d", "Apartment", "/f"]);
    await runLocalCommand("reg.exe", ["add", handlerKey, "/ve", "/d", TURBOFILE_WINDOWS_DRAG_COPY_HOOK_CLSID, "/f"]);
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
    const markerPath = join(this.getWindowsDragCopyHookRoot(), "explorer-loaded.signature");
    const stored = await fsp.readFile(markerPath, "utf8").then((value) => value.trim()).catch(() => "");
    if (stored === signature) {
      return;
    }
    await this.restartWindowsExplorer();
    await fsp.mkdir(dirname(markerPath), { recursive: true }).catch(() => void 0);
    await fsp.writeFile(markerPath, signature).catch(() => void 0);
  }
  async getWindowsDragCopyHookDllSignature(dllPath) {
    const stat = await fsp.stat(dllPath).catch(() => void 0);
    return stat ? `${dllPath}|${stat.size}|${Math.round(stat.mtimeMs)}` : dllPath;
  }
  async restartWindowsExplorer() {
    await runLocalPowerShellScript("Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }").catch(() => void 0);
    await delay(1200);
  }
  resolveWindowsDragCopyHookDllPath() {
    const resourcesPath = process.resourcesPath;
    const candidates = [
      join(process.cwd(), "resources", "turbofile", "drag-ext", "x64", "TurboFileDragExt.dll"),
      join(app.getAppPath(), "resources", "turbofile", "drag-ext", "x64", "TurboFileDragExt.dll"),
      resourcesPath ? join(resourcesPath, "app", "resources", "turbofile", "drag-ext", "x64", "TurboFileDragExt.dll") : void 0,
      resourcesPath ? join(resourcesPath, "resources", "turbofile", "drag-ext", "x64", "TurboFileDragExt.dll") : void 0
    ].filter((candidate) => !!candidate);
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      throw new Error(`TurboFile Windows drag extension DLL was not found. Run scripts\\build-turbofile-drag-ext.ps1. Checked: ${candidates.join(", ")}`);
    }
    return found;
  }
  async readFile(endpoint, options = {}) {
    const encoding = options.encoding ?? "utf8";
    const maxBytes = options.maxBytes ?? DEFAULT_READ_LIMIT;
    const mime = getMimeType(endpoint.path);
    try {
      const buffer = endpoint.kind === "local" ? await this.readLocalFileBuffer(endpoint.path, maxBytes) : await this.readRemoteFileBuffer(endpoint, maxBytes);
      const imageSize = mime.startsWith("image/") ? getImageSize(buffer) : void 0;
      return {
        ok: true,
        message: "File loaded.",
        content: encoding === "base64" ? buffer.toString("base64") : buffer.toString("utf8"),
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
        content: "",
        encoding,
        mime,
        size: 0
      };
    }
  }
  async readImage(endpoint, options = {}) {
    const encoding = options.encoding ?? "base64";
    try {
      const result = await this.readImageBuffer(endpoint, options);
      return {
        ok: true,
        message: "Image loaded.",
        content: encoding === "base64" ? result.buffer.toString("base64") : result.buffer.toString("utf8"),
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
        content: "",
        encoding,
        mime: getMimeType(endpoint.path),
        size: 0
      };
    }
  }
  async readImageBatch(endpoint, paths, maxWidth = 0) {
    const targets = [...new Set(paths.filter((path) => !!path))];
    if (!targets.length) {
      return [];
    }
    if (endpoint.kind !== "ssh" || !endpoint.connection) {
      return Promise.all(targets.map(async (path) => {
        try {
          const stat = await fsp.stat(path);
          if (stat.size > IMAGE_BATCH_MAX_FILE_BYTES) {
            return { path, ok: false, oversized: true };
          }
          const buffer = await fsp.readFile(path);
          return { path, ok: true, content: buffer.toString("base64"), mime: getMimeType(path) };
        } catch (error) {
          return { path, ok: false, message: error instanceof Error ? error.message : String(error) };
        }
      }));
    }
    if (looksLikeWindowsPath(targets[0])) {
      return targets.map((path) => ({ path, ok: false, oversized: true }));
    }
    await this.acquireImageReadSlot();
    try {
      const command = buildPosixReadImagesBatchCommand(targets, IMAGE_BATCH_MAX_FILE_BYTES, maxWidth);
      const output = await this.withDirectorySshClient(endpoint, (client) => this.execRemoteBytes(client, command, {
        inactivityTimeoutMs: REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS,
        inactivityMessage: "Image batch read produced no output.",
        timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS
      }));
      return parseImageBatchOutput(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return targets.map((path) => ({ path, ok: false, message, transient: true }));
    } finally {
      this.releaseImageReadSlot();
    }
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
        message: "Image resource created.",
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
    protocol.handle(TURBOFILE_IMAGE_RESOURCE_SCHEME, (request) => {
      const service = TurboFileSshMainService.imageProtocolService;
      if (!service) {
        return new Response("TurboFile image service is unavailable.", { status: 503 });
      }
      return service.handleTurboFileImageProtocolRequest(request);
    });
    TurboFileSshMainService.imageProtocolRegistered = true;
  }
  async handleTurboFileImageProtocolRequest(request) {
    try {
      const token = this.getImageResourceToken(request.url);
      if (!token) {
        return new Response("Invalid TurboFile image resource.", { status: 400 });
      }
      const descriptor = this.imageResourceDescriptors.get(token);
      if (!descriptor) {
        return new Response("TurboFile image resource was not found.", { status: 404 });
      }
      const now = Date.now();
      if (descriptor.expiresAt <= now) {
        this.imageResourceDescriptors.delete(token);
        return new Response("TurboFile image resource expired.", { status: 410 });
      }
      descriptor.expiresAt = now + IMAGE_RESOURCE_TTL_MS;
      const result = await this.readImageBuffer(descriptor.endpoint, descriptor.options);
      const body = result.buffer.buffer.slice(result.buffer.byteOffset, result.buffer.byteOffset + result.buffer.byteLength);
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": result.mime || getMimeType(descriptor.endpoint.path),
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), { status: 500 });
    }
  }
  getImageResourceToken(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== `${TURBOFILE_IMAGE_RESOURCE_SCHEME}:`) {
        return void 0;
      }
      const token = parsed.hostname || parsed.pathname.replace(/^\/+/, "").split("/")[0];
      return token ? decodeURIComponent(token) : void 0;
    } catch {
      return void 0;
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
      this.imageResourceCleanupTimer = void 0;
    }
  }
  async writeClipboardImage(content, mime, encoding = "base64") {
    try {
      const buffer = Buffer.from(content, encoding);
      const image = nativeImage.createFromBuffer(buffer);
      if (image.isEmpty()) {
        return { ok: false, message: `\u65E0\u6CD5\u89E3\u6790\u56FE\u7247\u6570\u636E\uFF1A${mime || "unknown"}` };
      }
      clipboard.writeImage(image);
      return { ok: true, message: "Image copied to clipboard." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  async writeFile(endpoint, content, encoding = "utf8") {
    const buffer = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
    try {
      if (endpoint.kind === "local") {
        await fsp.mkdir(dirname(endpoint.path), { recursive: true });
        await fsp.writeFile(endpoint.path, buffer);
      } else {
        const tempRoot = join(tmpdir(), `turbofile-write-${randomUUID()}`);
        const tempPath = join(tempRoot, basename(endpoint.path) || "content");
        try {
          await fsp.mkdir(tempRoot, { recursive: true });
          await fsp.writeFile(tempPath, buffer);
          await this.withDirectorySftp(endpoint, async (sftp) => {
            await this.ensureRemoteDirectory(sftp, getRemoteParentPath(endpoint.path));
            await this.fastPut(sftp, tempPath, endpoint.path, this.createSftpTransferOptions());
          });
        } finally {
          await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => void 0);
        }
      }
      this.clearRemoteDirectoryListingCache(endpoint);
      return { ok: true, message: "File saved." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async compressPath(endpoint, targetPath) {
    try {
      const archivePath = targetPath ?? getDefaultArchivePath(endpoint.path, endpoint.kind === "local" ? "zip" : "tar.gz");
      if (endpoint.kind === "local") {
        await runLocalCommand("tar.exe", [...await this.getLocalTarCharsetArgs(), "-a", "-cf", archivePath, "-C", dirname(endpoint.path), basename(endpoint.path)]);
      } else {
        await this.withSshClient(endpoint, (client) => this.execRemote(client, `mkdir -p ${quotePosixShellArg(getRemoteParentPath(archivePath))} && tar -czf ${quotePosixShellArg(archivePath)} -C ${quotePosixShellArg(getRemoteParentPath(endpoint.path))} ${quotePosixShellArg(getTransferName(endpoint.path))}`));
      }
      this.clearRemoteDirectoryListingCache(endpoint, archivePath);
      return { ok: true, message: `Archive created: ${archivePath}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async extractPath(endpoint, targetDirectory) {
    try {
      let outputDirectory = targetDirectory ?? getDefaultExtractDirectory(endpoint.path);
      if (endpoint.kind === "local") {
        outputDirectory = await getAvailableLocalDirectory(outputDirectory);
        await fsp.mkdir(outputDirectory, { recursive: true });
        const charsetArgs = isTurboFileTarFamilyArchivePath(endpoint.path) ? await this.getLocalTarCharsetArgs() : [];
        await runLocalCommand("tar.exe", [...charsetArgs, "-xf", endpoint.path, "-C", outputDirectory]);
      } else {
        const quotedArchive = quotePosixShellArg(endpoint.path);
        const outputSetup = `out=${quotePosixShellArg(outputDirectory)}; if [ -e "$out" ] && [ ! -d "$out" ]; then out="$out"_extracted; fi; mkdir -p "$out"`;
        const command = `${outputSetup} && ${buildTurboFileRemoteExtractCommand(endpoint.path, quotedArchive)}`;
        await this.withSshClient(endpoint, (client) => this.execRemote(client, command));
      }
      this.clearRemoteDirectoryListingCache(endpoint, outputDirectory);
      return { ok: true, message: `Archive extracted: ${outputDirectory}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
  async createSshTerminal(options, cwd, cols, rows) {
    const configResult = await this.createConnectConfig(options);
    if (!configResult.ok) {
      throw new Error(configResult.message);
    }
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
        bootstrapBuffer: "",
        bootstrapping: true,
        hasDataListener: false,
        closed: false
      };
      this.terminalSessions.set(sessionId, session);
      stream.on("data", (data) => {
        const chunk = data.toString();
        if (session.bootstrapping) {
          session.bootstrapBuffer += chunk;
          const markerIndex = session.bootstrapBuffer.indexOf(SSH_TERMINAL_READY_MARKER);
          if (markerIndex >= 0) {
            const remaining = session.bootstrapBuffer.slice(markerIndex + SSH_TERMINAL_READY_MARKER.length).replace(/^\r?\n/, "");
            session.bootstrapBuffer = "";
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
      stream.on("error", (error) => {
        const chunk = `\r
\u6781\u901F\u4F20 SSH terminal error: ${error.message}\r
`;
        if (session.hasDataListener) {
          session.dataEmitter.fire(chunk);
        } else {
          session.dataBuffer.push(chunk);
        }
      });
      stream.on("close", (code) => this.cleanupSshTerminalSession(sessionId, code ?? void 0));
      client.on("close", () => this.cleanupSshTerminalSession(sessionId, void 0));
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
    this.cleanupSshTerminalSession(sessionId, void 0);
  }
  async trySameRemoteCopy(request, startedAt) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    if (!isSameSshConnection(request.source.connection, request.target.connection)) {
      return void 0;
    }
    this.throwIfTransferCanceled(request.progressId);
    const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => "unknown");
    const expectedBytes = Math.max(0, request.expectedBytes ?? 0);
    let bytes = expectedBytes;
    if (sourceType === "directory") {
      bytes = bytes > 64 * 1024 ? bytes : await this.getRemotePathSizeByCommand(request.source).catch(() => expectedBytes);
    } else if (bytes <= 0) {
      bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => expectedBytes);
    }
    this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing remote copy.", true);
    const command = looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path) ? buildWindowsCopyCommand(request.source.path, request.target.path) : buildPosixCopyCommand(request.source.path, request.target.path);
    this.fireTransferProgress(request, 0, bytes, "transfer", "Remote copy in progress.", true);
    await this.execRemoteCopyWithProgress(request, command, bytes, sourceType);
    this.throwIfTransferCanceled(request.progressId);
    if (bytes === 0 && expectedBytes === 0) {
      bytes = await this.getRemotePathSizeByCommand(request.target).catch(() => 0);
    }
    return this.createTransferResult(true, "remote-copy", bytes, "Remote copy completed.", startedAt, request.progressId);
  }
  async tryDirectTarTransfer(request, startedAt, forceProtocol = false) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    if (request.strategyHint === "relay") {
      return void 0;
    }
    if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== "tar") {
      return void 0;
    }
    if (request.source.supportsTar === false || request.target.supportsTar === false || looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
      return void 0;
    }
    const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => "unknown");
    if (sourceType !== "directory") {
      return void 0;
    }
    let bytes = Math.max(0, request.expectedBytes ?? 0);
    if (bytes <= 0) {
      bytes = await this.getRemotePathContentSizeByCommand(request.source).catch(() => 0);
    }
    const routes = await this.resolveDirectSshRoutes(request.source, request.target, request.progressId);
    if (!routes.length) {
      return void 0;
    }
    const failures = [];
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
    throw new Error(`Direct tar failed: ${failures.join("; ")}`);
  }
  async tryDirectTarTransferRoute(request, startedAt, expectedBytes, route) {
    const executorEndpoint = route === "source-push" ? request.source : request.target;
    const remoteEndpoint = route === "source-push" ? request.target : request.source;
    if (!executorEndpoint.connection || !remoteEndpoint.connection) {
      throw new Error("Direct tar route is missing SSH connection details.");
    }
    const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
    if (!executorConfigResult.ok) {
      throw new Error(executorConfigResult.message);
    }
    const client = await this.connectDirectSsh(executorConfigResult.config);
    const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
    let credential;
    let stopGrowthTiming = () => void 0;
    let lastActivityAt = Date.now();
    const markActivity = () => {
      lastActivityAt = Date.now();
    };
    try {
      this.throwIfTransferCanceled(request.progressId);
      credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection);
      const remote = remoteEndpoint.connection;
      const remoteUserHost = `${remote.username}@${remote.host}`;
      const sshpassPrefix = buildSshpassPrefix(remote.password);
      const sshCommand = buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath);
      const command = route === "source-push" ? buildTarSourcePushCommand(request.source.path, request.target.path, remoteUserHost, sshCommand, sshpassPrefix) : buildTarTargetPullCommand(request.source.path, request.target.path, remoteUserHost, sshCommand, sshpassPrefix);
      this.fireTransferProgress(request, 0, expectedBytes, "prepare", "Preparing direct tar transfer.", true, { strategy: "tar-direct", route });
      stopGrowthTiming = this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, expectedBytes, (transferredBytes) => {
        markActivity();
        this.fireTransferProgress(request, transferredBytes, expectedBytes, "transfer", "Direct tar transfer in progress.", false, { strategy: "tar-direct", route });
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
      this.fireTransferProgress(request, bytes, bytes, "complete", "Direct tar completed.", true, { strategy: "tar-direct", route });
      return this.createTransferResult(true, "tar-direct", bytes, "Direct tar completed.", startedAt, request.progressId);
    } catch (error) {
      if (this.isTransferCanceled(request.progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      throw error;
    } finally {
      stopGrowthTiming();
      if (credential?.cleanupCommand) {
        await this.execRemote(client, credential.cleanupCommand).catch(() => void 0);
      }
      unregisterCancel();
      client.end();
    }
  }
  async tryDirectRsyncTransfer(request, startedAt, allowAutoFast = false) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    if (request.strategyHint === "relay") {
      return void 0;
    }
    const protocol2 = getSshToSshTransferProtocol(request.source);
    if (protocol2 !== "rsync" && !(allowAutoFast && protocol2 === "auto-fast")) {
      return void 0;
    }
    if (request.source.supportsRsync !== true || request.target.supportsRsync !== true) {
      return void 0;
    }
    if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
      return void 0;
    }
    this.throwIfTransferCanceled(request.progressId);
    const routes = await this.resolveDirectSshRoutes(request.source, request.target, request.progressId);
    if (!routes.length) {
      return void 0;
    }
    const failures = [];
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
    throw new Error(`Direct rsync failed: ${failures.join("; ")}`);
  }
  async tryDirectRsyncTransferRoute(request, startedAt, route) {
    const executorEndpoint = route === "source-push" ? request.source : request.target;
    const remoteEndpoint = route === "source-push" ? request.target : request.source;
    if (!executorEndpoint.connection || !remoteEndpoint.connection) {
      throw new Error("Direct rsync route is missing SSH connection details.");
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
      this.fireTransferProgress(request, 0, 0, "transfer", "Starting direct rsync transfer.", true, { strategy: "rsync-direct", route });
      const remote = remoteEndpoint.connection;
      const remoteUserHost = `${remote.username}@${remote.host}`;
      const sshBinary = await this.resolveRemoteRsyncSshBinary(client, executorEndpoint.connection);
      const sshTransport = buildOptimizedRsyncSshCommand(remote.port || 22, !!remote.password, sshBinary);
      const sshpassPrefix = buildSshpassPrefix(remote.password);
      const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => "unknown");
      const sourceIsDirectory = sourceType === "directory";
      let bytes = 0;
      const remoteTargetPath = sourceIsDirectory ? request.target.path : getRemoteParentPath(request.target.path);
      const rsyncOptions = buildRsyncOptions(true);
      const rsyncPathOption = route === "source-push" ? ` ${buildRsyncPathWithMkdirShellOption(remoteTargetPath)}` : "";
      const rsyncSourcePath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.source.path) : request.source.path;
      const rsyncTargetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
      const rsyncSourceArg = route === "source-push" ? rsyncSourcePath : `${remoteUserHost}:${rsyncSourcePath}`;
      const rsyncTargetArg = route === "source-push" ? `${remoteUserHost}:${rsyncTargetPath}` : rsyncTargetPath;
      const rsyncCommandCore = `${sshpassPrefix}rsync ${rsyncOptions}${rsyncPathOption} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(rsyncSourceArg)} ${quotePosixShellArg(rsyncTargetArg)}`;
      const rsyncCommand = route === "source-push" ? rsyncCommandCore : `mkdir -p ${quotePosixShellArg(remoteTargetPath)} && ${rsyncCommandCore}`;
      const progress = this.createRsyncProgressReporter(request, 0, "rsync-direct", "Direct rsync transfer in progress.", { strategy: "rsync-direct", route }, markActivity);
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
      return this.createTransferResult(true, "rsync-direct", bytes, "Direct rsync completed.", startedAt, request.progressId);
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
  async resolveDirectSshRoutes(source, target, progressId) {
    if (source.kind !== "ssh" || target.kind !== "ssh" || !source.connection || !target.connection) {
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
    const optimisticRoutes = ["source-push", "target-pull"];
    this.directSshRouteCache.set(cacheKey, {
      routes: optimisticRoutes,
      expiresAt: now + DIRECT_SSH_ROUTE_CACHE_TTL_MS
    });
    return this.filterDirectSshRoutesByCooldown(cacheKey, optimisticRoutes);
  }
  filterDirectSshRoutesByCooldown(cacheKey, routes) {
    const now = Date.now();
    return routes.filter((route) => (this.directSshRouteFailureCooldowns.get(getDirectSshRouteFailureKey(cacheKey, route)) ?? 0) <= now);
  }
  markDirectSshRouteFailure(source, target, route) {
    if (source.kind !== "ssh" || target.kind !== "ssh" || !source.connection || !target.connection) {
      return;
    }
    const cacheKey = getDirectSshRouteCacheKey(source.connection, target.connection);
    const failureKey = getDirectSshRouteFailureKey(cacheKey, route);
    const count = (this.directSshRouteFailureCounts.get(failureKey) ?? 0) + 1;
    this.directSshRouteFailureCounts.set(failureKey, count);
    if (count >= DIRECT_SSH_ROUTE_FAILURE_THRESHOLD) {
      this.directSshRouteFailureCooldowns.set(failureKey, Date.now() + DIRECT_SSH_ROUTE_FAILURE_COOLDOWN_MS);
    }
  }
  clearDirectSshRouteFailure(source, target, route) {
    if (source.kind !== "ssh" || target.kind !== "ssh" || !source.connection || !target.connection) {
      return;
    }
    const cacheKey = getDirectSshRouteCacheKey(source.connection, target.connection);
    const failureKey = getDirectSshRouteFailureKey(cacheKey, route);
    this.directSshRouteFailureCounts.delete(failureKey);
    this.directSshRouteFailureCooldowns.delete(failureKey);
    this.directSshRouteCache.set(cacheKey, {
      routes: [route],
      expiresAt: Date.now() + DIRECT_SSH_ROUTE_CACHE_TTL_MS
    });
  }
  async resolveRemoteRsyncSshBinary(client, connection) {
    const cacheKey = getSshConnectionRouteKey(connection);
    const cached = this.remoteRsyncSshBinaryCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    try {
      const output = await this.execRemoteBytes(client, [
        "if [ -x /usr/bin/ssh.original ]; then printf %s /usr/bin/ssh.original;",
        "elif [ -x /usr/bin/ssh.bak ]; then printf %s /usr/bin/ssh.bak;",
        "else command -v ssh || printf %s ssh; fi"
      ].join(" "), { timeoutMs: 2e3 });
      const binary = output.toString("utf8").trim().split(/\r?\n/)[0];
      const normalized = binary && /^[A-Za-z0-9_./-]+$/.test(binary) ? binary : "ssh";
      this.remoteRsyncSshBinaryCache.set(cacheKey, normalized);
      return normalized;
    } catch {
      this.remoteRsyncSshBinaryCache.set(cacheKey, "ssh");
      return "ssh";
    }
  }
  clearDirectSshRouteCache(source, target) {
    if (source.kind !== "ssh" || target.kind !== "ssh" || !source.connection || !target.connection) {
      return;
    }
    this.directSshRouteCache.delete(getDirectSshRouteCacheKey(source.connection, target.connection));
  }
  async tryDirectScpTransfer(request, startedAt, forceProtocol = false) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    if (request.strategyHint === "relay") {
      return void 0;
    }
    const transferMode = getSshToSshTransferProtocol(request.source);
    if (!forceProtocol && transferMode !== "scp" && transferMode !== "auto-fast") {
      return void 0;
    }
    if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
      return void 0;
    }
    this.throwIfTransferCanceled(request.progressId);
    const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => "unknown");
    if (sourceType !== "file" && sourceType !== "directory") {
      return void 0;
    }
    const sourceIsDirectory = sourceType === "directory";
    const bytes = Math.max(0, request.expectedBytes ?? 0) || await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
    if (bytes <= 0) {
      return void 0;
    }
    const routes = await this.resolveDirectSshRoutes(request.source, request.target, request.progressId);
    if (!routes.length) {
      return void 0;
    }
    const failures = [];
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
    throw new Error(`Direct SCP failed: ${failures.join("; ")}`);
  }
  async tryDirectScpTransferRoute(request, startedAt, sourceIsDirectory, bytes, route) {
    const executorEndpoint = route === "source-push" ? request.source : request.target;
    const remoteEndpoint = route === "source-push" ? request.target : request.source;
    if (!executorEndpoint.connection || !remoteEndpoint.connection) {
      throw new Error("Direct SCP route is missing SSH connection details.");
    }
    const executorConfigResult = await this.createConnectConfig(executorEndpoint.connection);
    if (!executorConfigResult.ok) {
      throw new Error(executorConfigResult.message);
    }
    const client = await this.connectDirectSsh(executorConfigResult.config);
    const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => client.end());
    let credential;
    let stopGrowthTiming = () => void 0;
    let lastActivityAt = Date.now();
    const markActivity = () => {
      lastActivityAt = Date.now();
    };
    try {
      this.throwIfTransferCanceled(request.progressId);
      credential = await this.prepareRemoteScpCredential(client, remoteEndpoint.connection);
      const remote = remoteEndpoint.connection;
      const remoteUserHost = `${remote.username}@${remote.host}`;
      const sshpassPrefix = buildSshpassPrefix(remote.password);
      const targetParentPath = getRemoteParentPath(request.target.path);
      const mkdirCommand = route === "source-push" ? `${sshpassPrefix}${buildDirectScpSshCommand(remote.port || 22, !!remote.password, credential.identityPath)} ${quotePosixShellArg(remoteUserHost)} ${quotePosixShellArg(sourceIsDirectory ? `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}` : `mkdir -p -- ${quotePosixShellArg(targetParentPath)} && rm -f -- ${quotePosixShellArg(request.target.path)}`)}` : sourceIsDirectory ? `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}` : `mkdir -p -- ${quotePosixShellArg(targetParentPath)} && rm -f -- ${quotePosixShellArg(request.target.path)}`;
      const sourcePath = sourceIsDirectory ? getRemoteDirectoryContentsPath(request.source.path) : request.source.path;
      const targetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
      const sourceArg = route === "source-push" ? sourcePath : `${remoteUserHost}:${sourcePath}`;
      const targetArg = route === "source-push" ? `${remoteUserHost}:${targetPath}` : targetPath;
      const scpCommand = `${sshpassPrefix}${buildDirectScpCommand(remote.port || 22, !!remote.password, credential.identityPath, sourceIsDirectory)} ${quotePosixShellArg(sourceArg)} ${quotePosixShellArg(targetArg)}`;
      this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing direct SCP transfer.", true, { strategy: "scp-direct", route });
      await this.execRemote(client, mkdirCommand, { timeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS });
      this.throwIfTransferCanceled(request.progressId);
      markActivity();
      stopGrowthTiming = sourceIsDirectory ? this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, bytes, (transferredBytes) => {
        markActivity();
        this.fireTransferProgress(request, transferredBytes, bytes, "transfer", "Direct SCP transfer in progress.", false, { strategy: "scp-direct", route });
      }) : this.beginRemoteFileGrowthTiming(request.progressId, request.target.connection, request.target.path, 0, bytes, (transferredBytes) => {
        markActivity();
        this.fireTransferProgress(request, transferredBytes, bytes, "transfer", "Direct SCP transfer in progress.", false, { strategy: "scp-direct", route });
      });
      this.markTransferDataStarted(request.progressId);
      await this.execRemote(client, scpCommand, {
        inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
        inactivityMessage: `Direct SCP ${route} produced no target growth for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
        getActivityTime: () => lastActivityAt
      });
      this.throwIfTransferCanceled(request.progressId);
      const targetSize = sourceIsDirectory ? await this.getRemotePathSizeByCommand(request.target).catch(() => 0) : await this.withDirectorySftp(request.target, async (sftp) => (await this.remoteStat(sftp, request.target.path)).size).catch(() => 0);
      if (targetSize !== bytes) {
        await this.withDirectorySftp(request.target, (sftp) => sourceIsDirectory ? this.rmdirRemote(sftp, request.target.path) : this.unlinkRemote(sftp, request.target.path)).catch(() => void 0);
        throw new Error(`Direct SCP size mismatch: expected ${bytes}, got ${targetSize}.`);
      }
      this.fireTransferProgress(request, bytes, bytes, "transfer", "Direct SCP transfer completed.", true, { strategy: "scp-direct", route });
      return this.createTransferResult(true, "scp-direct", bytes, "Direct SCP completed.", startedAt, request.progressId);
    } catch (error) {
      if (this.isTransferCanceled(request.progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      throw error;
    } finally {
      stopGrowthTiming();
      if (credential?.cleanupCommand) {
        await this.execRemote(client, credential.cleanupCommand).catch(() => void 0);
      }
      unregisterCancel();
      client.end();
    }
  }
  async prepareRemoteScpCredential(client, remoteConnection) {
    if (remoteConnection.password) {
      return {};
    }
    const privateKey = remoteConnection.privateKey ?? await this.readPrivateKey(remoteConnection.privateKeyPath).catch(() => void 0);
    if (!privateKey) {
      return {};
    }
    const identityPath = `/tmp/turbofile-scp-${randomUUID()}.key`;
    const marker = `__TURBOFILE_SCP_KEY_${randomUUID().replace(/-/g, "")}__`;
    const normalizedKey = privateKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n?$/, "\n");
    const setupCommand = `umask 077; cat > ${quotePosixShellArg(identityPath)} <<'${marker}'
${normalizedKey}${marker}
chmod 600 ${quotePosixShellArg(identityPath)}`;
    await this.execRemote(client, setupCommand);
    return {
      identityPath,
      cleanupCommand: `rm -f ${quotePosixShellArg(identityPath)}`
    };
  }
  async tryDirectSftpTransfer(request, startedAt, forceProtocol = false) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    if (request.strategyHint === "relay") {
      return void 0;
    }
    if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== "sftp") {
      return void 0;
    }
    if (looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
      return void 0;
    }
    this.throwIfTransferCanceled(request.progressId);
    const routes = await this.resolveDirectSshRoutes(request.source, request.target, request.progressId);
    if (!routes.length) {
      return void 0;
    }
    const failures = [];
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
    throw new Error(`Direct SFTP failed: ${failures.join("; ")}`);
  }
  async tryDirectSftpTransferRoute(request, startedAt, route) {
    const executorEndpoint = route === "source-push" ? request.source : request.target;
    const remoteEndpoint = route === "source-push" ? request.target : request.source;
    if (!executorEndpoint.connection || !remoteEndpoint.connection) {
      throw new Error("Direct SFTP route is missing SSH connection details.");
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
    let stopGrowthTiming = () => void 0;
    let lastActivityAt = Date.now();
    const markActivity = () => {
      lastActivityAt = Date.now();
    };
    try {
      this.throwIfTransferCanceled(request.progressId);
      const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => "unknown");
      if (sourceType !== "file" && sourceType !== "directory") {
        throw new Error(`Unsupported direct SFTP source type: ${sourceType}.`);
      }
      const expectedBytes = Math.max(0, request.expectedBytes ?? 0);
      let bytes = expectedBytes;
      if (bytes === 0) {
        bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => expectedBytes);
      }
      this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing direct SFTP transfer.", true, { strategy: "sftp-direct", route });
      const targetParentPath = getRemoteParentPath(request.target.path);
      const sourceIsDirectory = sourceType === "directory";
      const mkdirCommand = route === "source-push" ? `${sshpassPrefix}${sshTransport} ${quotePosixShellArg(remoteUserHost)} ${quotePosixShellArg(sourceIsDirectory ? `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}` : `mkdir -p -- ${quotePosixShellArg(targetParentPath)}`)}` : sourceIsDirectory ? `rm -rf -- ${quotePosixShellArg(request.target.path)} && mkdir -p -- ${quotePosixShellArg(request.target.path)}` : `mkdir -p -- ${quotePosixShellArg(targetParentPath)}`;
      const batchVerb = sourceIsDirectory ? route === "source-push" ? "put -pr" : "get -pr" : route === "source-push" ? "put -p" : "get -p";
      const batchSourcePath = sourceIsDirectory ? getRemoteDirectoryContentsPath(request.source.path) : request.source.path;
      const batchTargetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
      const batch = `${batchVerb} ${quoteSftpBatchPath(batchSourcePath)} ${quoteSftpBatchPath(batchTargetPath)}
`;
      const transferCommand = `printf %s ${quotePosixShellArg(batch)} | ${sftpCommand}`;
      this.throwIfTransferCanceled(request.progressId);
      await this.execRemote(client, mkdirCommand, { timeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS });
      this.throwIfTransferCanceled(request.progressId);
      markActivity();
      stopGrowthTiming = sourceType === "directory" ? this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, bytes, (transferredBytes) => {
        markActivity();
        this.fireTransferProgress(request, transferredBytes, bytes, "transfer", "Direct SFTP transfer in progress.", false, { strategy: "sftp-direct", route });
      }) : this.beginRemoteFileGrowthTiming(request.progressId, request.target.connection, request.target.path, 0, bytes, (transferredBytes) => {
        markActivity();
        this.fireTransferProgress(request, transferredBytes, bytes, "transfer", "Direct SFTP transfer in progress.", false, { strategy: "sftp-direct", route });
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
      this.fireTransferProgress(request, bytes, bytes, "transfer", "Direct SFTP transfer completed.", true, { strategy: "sftp-direct", route });
      return this.createTransferResult(true, "sftp-direct", bytes, "Direct SFTP completed.", startedAt, request.progressId);
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
  async tryTunneledRsyncRelayTransfer(request, startedAt, allowAutoFast = false) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    const protocol2 = getSshToSshTransferProtocol(request.source);
    if (protocol2 !== "rsync" && !(allowAutoFast && protocol2 === "auto-fast")) {
      return void 0;
    }
    if (request.source.supportsRsync !== true || request.target.supportsRsync !== true || request.strategyHint === "direct") {
      return void 0;
    }
    if (!request.target.connection.password || looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
      return void 0;
    }
    const sourceConfigResult = await this.createConnectConfig(request.source.connection);
    if (!sourceConfigResult.ok) {
      return void 0;
    }
    const client = await this.connect(sourceConfigResult.config);
    const forwardedSockets = /* @__PURE__ */ new Set();
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
      socket.on("close", () => forwardedSockets.delete(socket));
      socket.on("error", () => channel.destroy());
      channel.on("error", () => socket.destroy());
      channel.on("close", () => socket.destroy());
      socket.pipe(channel);
      channel.pipe(socket);
    };
    client.on("tcp connection", onForwardedConnection);
    try {
      this.throwIfTransferCanceled(request.progressId);
      this.fireTransferProgress(request, 0, 0, "transfer", "Starting rsync relay transfer.", true, { strategy: "rsync-relay" });
      const canUseLocalRsync = await this.canUseLocalRsync(client);
      if (!canUseLocalRsync) {
        return void 0;
      }
      forwardedPort = await this.forwardIn(client, RSYNC_RELAY_BIND_HOST, 0);
      const target = request.target.connection;
      const targetUserHost = `${target.username}@${RSYNC_RELAY_BIND_HOST}`;
      const sshBinary = await this.resolveRemoteRsyncSshBinary(client, request.source.connection);
      const sshTransport = buildOptimizedRsyncSshCommand(forwardedPort, true, sshBinary);
      const sshpassPrefix = buildSshpassPrefix(target.password);
      const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => "unknown");
      const sourceIsDirectory = sourceType === "directory";
      let bytes = 0;
      const remoteTargetPath = sourceIsDirectory ? request.target.path : getRemoteParentPath(request.target.path);
      const canUseTargetRsync = await this.canUseTargetRsyncThroughRelay(client, targetUserHost, forwardedPort, sshpassPrefix);
      if (!canUseTargetRsync) {
        return void 0;
      }
      const rsyncOptions = buildRsyncOptions(true);
      const rsyncSourcePath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.source.path) : request.source.path;
      const rsyncTargetPath = sourceIsDirectory ? ensureTrailingRemoteSlash(request.target.path) : request.target.path;
      const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} ${buildRsyncPathWithMkdirShellOption(remoteTargetPath)} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(rsyncSourcePath)} ${quotePosixShellArg(`${targetUserHost}:${rsyncTargetPath}`)}`;
      const progress = this.createRsyncProgressReporter(request, 0, "relay-upload", "Rsync relay transfer in progress.", { strategy: "rsync-relay" });
      await this.execRemote(client, rsyncCommand, {
        onStdout: progress.handleOutput,
        onStderr: progress.handleOutput,
        inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS,
        inactivityMessage: `Rsync relay produced no transfer progress for ${DIRECT_TRANSFER_STALL_TIMEOUT_MS} ms.`,
        getActivityTime: progress.getActivityTime
      });
      this.throwIfTransferCanceled(request.progressId);
      bytes = progress.getLastBytes() || Math.max(0, request.expectedBytes ?? 0);
      return this.createTransferResult(true, "rsync-relay", bytes, "Rsync relay completed.", startedAt, request.progressId);
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      throw new Error(`Rsync relay failed: ${formatTransferError(error)}`);
    } finally {
      unregisterCancel();
      if (forwardedPort !== void 0) {
        await this.unforwardIn(client, RSYNC_RELAY_BIND_HOST, forwardedPort).catch(() => void 0);
      }
      for (const socket of forwardedSockets) {
        socket.destroy();
      }
      client.end();
    }
  }
  async canUseLocalRsync(client) {
    try {
      await this.execRemote(client, "command -v rsync >/dev/null 2>&1 && command -v sshpass >/dev/null 2>&1");
      return true;
    } catch {
      return false;
    }
  }
  async canUseTargetRsyncThroughRelay(client, targetUserHost, forwardedPort, sshpassPrefix) {
    try {
      await this.execRemote(client, `${sshpassPrefix}${buildCompatibleSshCommand(forwardedPort, true)} ${quotePosixShellArg(targetUserHost)} ${quotePosixShellArg("command -v rsync >/dev/null 2>&1")}`);
      return true;
    } catch {
      return false;
    }
  }
  async tryTarRelayTransfer(request, startedAt, forceProtocol = false) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== "tar") {
      return void 0;
    }
    if (request.strategyHint === "direct" || request.source.supportsTar === false || request.target.supportsTar === false || looksLikeWindowsPath(request.source.path) || looksLikeWindowsPath(request.target.path)) {
      return void 0;
    }
    const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => "unknown");
    if (sourceType !== "directory") {
      return void 0;
    }
    let bytes = Math.max(0, request.expectedBytes ?? 0);
    if (bytes <= 0) {
      bytes = await this.getRemotePathContentSizeByCommand(request.source).catch(() => 0);
    }
    const sourceConfigResult = await this.createConnectConfig(request.source.connection);
    const targetConfigResult = await this.createConnectConfig(request.target.connection);
    if (!sourceConfigResult.ok || !targetConfigResult.ok) {
      return void 0;
    }
    let sourceClient;
    let targetClient;
    let stopGrowthTiming = () => void 0;
    const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
      sourceClient?.end();
      targetClient?.end();
    });
    try {
      sourceClient = await this.connect(sourceConfigResult.config);
      targetClient = await this.connect(targetConfigResult.config);
      this.fireTransferProgress(request, 0, bytes, "prepare", "Preparing tar relay.", true, { strategy: "tar-relay", route: "relay" });
      stopGrowthTiming = this.beginRemotePathGrowthTiming(request.progressId, request.target, 0, bytes, (transferredBytes) => {
        this.fireTransferProgress(request, transferredBytes, bytes, "relay-upload", "Tar relay transfer in progress.", false, { strategy: "tar-relay", route: "relay" });
      });
      this.markTransferDataStarted(request.progressId);
      const sourceStream = await this.openRemoteCommandStream(sourceClient, buildTarCreateFromDirectoryCommand(request.source.path), "tar relay create");
      const targetStream = await this.openRemoteCommandStream(targetClient, buildTarExtractToExactDirectoryCommand(request.target.path), "tar relay extract", true);
      await pipeline(sourceStream.stream, targetStream.stream);
      await sourceStream.close;
      await targetStream.close;
      this.throwIfTransferCanceled(request.progressId);
      const targetSize = await this.getRemotePathContentSizeByCommand(request.target).catch(() => bytes);
      if (bytes > 0 && targetSize !== bytes) {
        throw new Error(`Tar relay size mismatch: expected ${bytes}, got ${targetSize}.`);
      }
      const resultBytes = bytes > 0 ? bytes : targetSize;
      this.fireTransferProgress(request, resultBytes, resultBytes, "complete", "Tar relay completed.", true, { strategy: "tar-relay", route: "relay" });
      this.clearRemoteDirectoryListingCache(request.target);
      return this.createTransferResult(true, "tar-relay", resultBytes, "Tar relay completed.", startedAt, request.progressId);
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
  async tryStreamRelayTransfer(request, startedAt, forceProtocol = false) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== "sftp") {
      return void 0;
    }
    const sourceConfigResult = await this.createConnectConfig(request.source.connection);
    const targetConfigResult = await this.createConnectConfig(request.target.connection);
    if (!sourceConfigResult.ok || !targetConfigResult.ok) {
      return void 0;
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
      if (sourceType === "directory") {
        return void 0;
      }
      const sourceStat = await this.remoteStat(sourceSftp, request.source.path);
      const bytes = sourceStat.size;
      const totalBytes = bytes * 2;
      this.fireTransferProgress(request, 0, totalBytes, "prepare", "Preparing SFTP parallel relay.", true, { strategy: "sftp-relay" });
      await this.ensureRemoteDirectory(targetSftp, getRemoteParentPath(request.target.path));
      const unregisterCancel = this.registerTransferCancelHandler(request.progressId, () => {
        sourceSftp?.end();
        targetSftp?.end();
        sourceClient?.end();
        targetClient?.end();
      });
      let streamedBytes = 0;
      try {
        await this.relayRemoteFileInParallel(sourceSftp, targetSftp, request.source.path, request.target.path, bytes, (delta) => {
          streamedBytes += delta;
          this.fireTransferProgress(request, Math.min(streamedBytes * 2, totalBytes), totalBytes, "relay-upload", "Parallel SFTP relay in progress.", false, { strategy: "sftp-relay" });
        }, request.progressId);
      } finally {
        unregisterCancel();
      }
      this.throwIfTransferCanceled(request.progressId);
      const targetStat = await this.remoteStat(targetSftp, request.target.path).catch(() => void 0);
      if (!targetStat || targetStat.size !== bytes) {
        await this.unlinkRemote(targetSftp, request.target.path).catch(() => void 0);
        throw new Error(`SFTP relay size mismatch: expected ${bytes}, got ${targetStat?.size ?? 0}.`);
      }
      return this.createTransferResult(true, "sftp-relay", bytes, "SFTP parallel relay completed.", startedAt, request.progressId);
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(request.progressId)) {
        throw error;
      }
      return void 0;
    } finally {
      sourceSftp?.end();
      targetSftp?.end();
      sourceClient?.end();
      targetClient?.end();
    }
  }
  async tryScpRelayTransfer(request, startedAt, forceProtocol = false) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    const transferMode = getSshToSshTransferProtocol(request.source);
    if (!forceProtocol && transferMode !== "scp" && transferMode !== "auto-fast") {
      return void 0;
    }
    const sourceType = request.sourceType ?? await this.withDirectorySftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path))).catch(() => "unknown");
    if (sourceType !== "file" && sourceType !== "directory") {
      throw new Error(`Unsupported SCP relay source type: ${sourceType}.`);
    }
    const bytes = Math.max(0, request.expectedBytes ?? 0) || await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
    if (bytes <= 0) {
      return void 0;
    }
    const relayRoot = join(tmpdir(), `turbofile-scp-relay-${randomUUID()}`);
    const relayPath = join(relayRoot, getTransferName(request.source.path) || "payload");
    const relayTotalBytes = bytes * 2;
    try {
      await fsp.mkdir(relayRoot, { recursive: true });
      this.fireTransferProgress(request, 0, relayTotalBytes, "prepare", "Preparing SCP relay.", true, { strategy: "scp-relay" });
      let downloadedBytes = 0;
      await this.runLocalScpDownload({
        ...request,
        target: { kind: "local", path: relayPath },
        expectedBytes: bytes
      }, bytes, (transferredBytes) => {
        downloadedBytes = Math.max(downloadedBytes, transferredBytes);
        this.fireTransferProgress(request, Math.min(downloadedBytes, relayTotalBytes), relayTotalBytes, "relay-download", "Downloading to relay cache over SCP.", false, { strategy: "scp-relay" });
      });
      this.throwIfTransferCanceled(request.progressId);
      this.fireTransferProgress(request, bytes, relayTotalBytes, "relay-download", "SCP relay download completed.", true, { strategy: "scp-relay" });
      let uploadedBytes = 0;
      await this.runLocalScpUpload({
        ...request,
        source: { kind: "local", path: relayPath },
        expectedBytes: bytes
      }, bytes, (transferredBytes) => {
        uploadedBytes = Math.max(uploadedBytes, transferredBytes);
        this.fireTransferProgress(request, Math.min(bytes + uploadedBytes, relayTotalBytes), relayTotalBytes, "relay-upload", "Uploading from relay cache over SCP.", false, { strategy: "scp-relay" });
      });
      this.throwIfTransferCanceled(request.progressId);
      const targetSize = await this.getRemotePathSizeByCommand(request.target).catch(() => 0);
      if (targetSize !== bytes) {
        throw new Error(`SCP relay size mismatch: expected ${bytes}, got ${targetSize}.`);
      }
      this.fireTransferProgress(request, relayTotalBytes, relayTotalBytes, "relay-upload", "SCP relay completed.", true, { strategy: "scp-relay" });
      return this.createTransferResult(true, "scp-relay", bytes, "SCP relay completed.", startedAt, request.progressId);
    } finally {
      await fsp.rm(relayRoot, { recursive: true, force: true }).catch(() => void 0);
    }
  }
  async runSftpRelayTransfer(request, startedAt, forceProtocol = false) {
    if (request.source.kind !== "ssh" || request.target.kind !== "ssh" || !request.source.connection || !request.target.connection) {
      return void 0;
    }
    if (!forceProtocol && getSshToSshTransferProtocol(request.source) !== "sftp") {
      return void 0;
    }
    const relayRoot = join(tmpdir(), `turbofile-${randomUUID()}`);
    const relayPath = join(relayRoot, getTransferName(request.source.path) || "payload");
    try {
      this.throwIfTransferCanceled(request.progressId);
      await fsp.mkdir(relayRoot, { recursive: true });
      let bytes = 0;
      const sourceType = request.sourceType ?? await this.withSftp(request.source, async (sftp) => getFileTypeFromStats(await this.remoteStat(sftp, request.source.path)), request.progressId).catch(() => "unknown");
      bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
      await this.withSftp(request.source, async (sftp) => {
        this.throwIfTransferCanceled(request.progressId);
        const relayTotalBytes = bytes * 2;
        this.fireTransferProgress(request, 0, relayTotalBytes, "prepare", "Preparing SFTP relay.", true, { strategy: "sftp-relay" });
        let downloadedBytes = 0;
        const onDownloadDelta = (delta) => {
          this.throwIfTransferCanceled(request.progressId);
          downloadedBytes += delta;
          this.fireTransferProgress(request, downloadedBytes, relayTotalBytes, "relay-download", "Downloading to relay cache.", false, { strategy: "sftp-relay" });
        };
        if (sourceType === "directory") {
          await this.downloadDirectory(sftp, request.source.path, relayPath, onDownloadDelta, request.progressId);
        } else {
          await this.fastGetWithFallback(sftp, request.source.path, relayPath, bytes, onDownloadDelta, request.progressId);
        }
      }, request.progressId);
      await this.withSftp(request.target, async (sftp) => {
        this.throwIfTransferCanceled(request.progressId);
        const relayStat = await fsp.stat(relayPath);
        const relayTotalBytes = bytes * 2;
        let uploadedBytes = 0;
        const onUploadDelta = (delta) => {
          this.throwIfTransferCanceled(request.progressId);
          uploadedBytes += delta;
          this.fireTransferProgress(request, bytes + uploadedBytes, relayTotalBytes, "relay-upload", "Uploading from relay cache.", false, { strategy: "sftp-relay" });
        };
        if (relayStat.isDirectory()) {
          await this.uploadDirectory(sftp, relayPath, request.target.path, onUploadDelta, request.progressId);
        } else {
          await this.ensureRemoteDirectory(sftp, getRemoteParentPath(request.target.path));
          await this.fastPutWithFallback(sftp, relayPath, request.target.path, bytes, onUploadDelta, request.progressId);
        }
      }, request.progressId);
      this.throwIfTransferCanceled(request.progressId);
      this.fireTransferProgress(request, bytes * 2, bytes * 2, "complete", "SFTP relay completed.", true, { strategy: "sftp-relay" });
      this.clearRemoteDirectoryListingCache(request.target);
      return this.createTransferResult(true, "sftp-relay", bytes, "SFTP relay completed.", startedAt, request.progressId);
    } finally {
      await fsp.rm(relayRoot, { recursive: true, force: true }).catch(() => void 0);
    }
  }
  async createConnectConfig(options) {
    const nativeRequire = await this.getNativeRequire();
    nativeRequire("ssh2");
    if (!options.host || !options.username) {
      return { ok: false, message: "Host and username are required." };
    }
    const config = {
      host: options.host,
      port: options.port || 22,
      username: options.username,
      readyTimeout: options.timeout ?? 1e4,
      tryKeyboard: false,
      // Keep idle connections alive so long-running terminal tasks (and slow transfers) are not
      // dropped by NAT/firewall/server idle timeouts. ~15s pings, tolerate ~3min of unanswered
      // pings before treating the link as dead.
      keepaliveInterval: 15e3,
      keepaliveCountMax: 12
    };
    if (options.password !== void 0) {
      config.password = options.password;
    }
    let privateKey;
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
  async readPrivateKey(privateKeyPath) {
    if (!privateKeyPath) {
      return void 0;
    }
    return fsp.readFile(privateKeyPath, "utf8");
  }
  async doTestConnection(config) {
    try {
      const client = await this.connect(config);
      client.end();
      return { ok: true, message: "SSH connection succeeded." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message };
    }
  }
  async connect(config) {
    const nativeRequire = await this.getNativeRequire();
    const ssh2Module = nativeRequire("ssh2");
    const client = new ssh2Module.Client();
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (callback) => {
        if (settled) {
          return;
        }
        settled = true;
        callback();
      };
      client.on("ready", () => settle(() => resolve(client))).on("error", (error) => settle(() => reject(error))).on("close", () => {
        if (!settled) {
          settle(() => reject(new Error("SSH connection closed before authentication completed.")));
        }
      });
      try {
        client.connect(config);
      } catch (error) {
        settle(() => reject(error));
      }
    });
  }
  connectDirectSsh(config) {
    const readyTimeout = typeof config.readyTimeout === "number" ? Math.min(config.readyTimeout, DIRECT_SSH_CONNECT_TIMEOUT_MS) : DIRECT_SSH_CONNECT_TIMEOUT_MS;
    return this.connect({ ...config, readyTimeout });
  }
  async getDirectorySftpSession(options, config) {
    const key = this.getDirectorySftpSessionKey(options);
    const existing = this.directorySftpSessions.get(key);
    if (existing) {
      const session2 = await existing;
      if (!session2.closed) {
        this.touchDirectorySftpSession(key);
        return session2;
      }
      this.directorySftpSessions.delete(key);
    }
    const sessionPromise = this.createDirectorySftpSession(key, config).catch((error) => {
      this.directorySftpSessions.delete(key);
      this.clearDirectorySftpIdleTimer(key);
      throw error;
    });
    this.directorySftpSessions.set(key, sessionPromise);
    const session = await sessionPromise;
    this.touchDirectorySftpSession(key);
    return session;
  }
  async getReusableDirectorySftpSession(options) {
    const key = this.getDirectorySftpSessionKey(options);
    const existing = this.directorySftpSessions.get(key);
    if (!existing) {
      return void 0;
    }
    try {
      const session = await existing;
      if (session.closed) {
        this.directorySftpSessions.delete(key);
        return void 0;
      }
      this.clearDirectorySftpIdleTimer(key);
      return session;
    } catch {
      this.directorySftpSessions.delete(key);
      return void 0;
    }
  }
  async createDirectorySftpSession(key, config) {
    const client = await this.connect(config);
    let sftp;
    try {
      sftp = await this.openSftp(client);
    } catch (error) {
      client.end();
      throw error;
    }
    const session = { key, client, sftp, closed: false };
    const markClosed = () => {
      if (session.closed) {
        return;
      }
      session.closed = true;
      this.directorySftpSessions.delete(key);
      this.clearDirectorySftpIdleTimer(key);
    };
    client.on("close", markClosed);
    client.on("error", markClosed);
    return session;
  }
  touchDirectorySftpSession(key) {
    this.clearDirectorySftpIdleTimer(key);
    const timer = setTimeout(() => this.disposeDirectorySftpSession(key), REMOTE_DIRECTORY_SFTP_IDLE_MS);
    this.directorySftpIdleTimers.set(key, timer);
  }
  disposeDirectorySftpSession(key) {
    const sessionPromise = this.directorySftpSessions.get(key);
    this.directorySftpSessions.delete(key);
    this.clearDirectorySftpIdleTimer(key);
    if (!sessionPromise) {
      return;
    }
    void sessionPromise.then((session) => {
      if (session.closed) {
        return;
      }
      session.closed = true;
      try {
        session.sftp.end();
      } catch {
      }
      try {
        session.client.end();
      } catch {
      }
    }, () => void 0);
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
      password: options.password ?? "",
      privateKeyPath: options.privateKeyPath ?? "",
      privateKey: options.privateKey ?? "",
      passphrase: options.passphrase ?? ""
    });
  }
  getRemoteDirectoryListingCacheKey(options, path) {
    return `${this.getDirectorySftpSessionKey(options)}:${path.replace(/\\/g, "/")}`;
  }
  getRemoteDirectoryListingCache(cacheKey) {
    const cached = this.remoteDirectoryListingCache.get(cacheKey);
    if (!cached) {
      return void 0;
    }
    if (Date.now() >= cached.expiresAt) {
      this.remoteDirectoryListingCache.delete(cacheKey);
      return void 0;
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
    if (endpoint.kind !== "ssh" || !endpoint.connection) {
      return;
    }
    const paths = /* @__PURE__ */ new Set();
    const path = extraPath ?? endpoint.path;
    paths.add(path);
    paths.add(getRemoteParentPath(path));
    for (const candidate of paths) {
      this.remoteDirectoryListingCache.delete(this.getRemoteDirectoryListingCacheKey(endpoint.connection, candidate));
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
      client.unforwardIn(bindAddr, bindPort, (error) => {
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
      sftp.write(handle, buffer, 0, length, position, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
  closeRemoteFile(sftp, handle) {
    return new Promise((resolve) => {
      sftp.close(handle, () => resolve());
    });
  }
  async relayRemoteFileInParallel(sourceSftp, targetSftp, sourcePath, targetPath, bytes, onDelta, progressId) {
    if (bytes <= 0) {
      const targetHandle2 = await this.openRemoteFile(targetSftp, targetPath, "w");
      await this.closeRemoteFile(targetSftp, targetHandle2);
      return;
    }
    const sourceHandle = await this.openRemoteFile(sourceSftp, sourcePath, "r");
    let targetHandle;
    try {
      targetHandle = await this.openRemoteFile(targetSftp, targetPath, "w");
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
    } finally {
      if (targetHandle) {
        await this.closeRemoteFile(targetSftp, targetHandle).catch(() => void 0);
      }
      await this.closeRemoteFile(sourceSftp, sourceHandle).catch(() => void 0);
    }
  }
  openShell(client, cols, rows) {
    return new Promise((resolve, reject) => {
      client.shell({
        term: "xterm-256color",
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
    } catch {
    }
    try {
      session.client.end();
    } catch {
    }
    session.exitEmitter.fire(exitCode);
    session.dataEmitter.dispose();
    session.exitEmitter.dispose();
  }
  async withSftp(endpoint, task, progressId) {
    if (!endpoint.connection) {
      throw new Error("SSH endpoint is missing connection options.");
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
  async withDirectorySftp(endpoint, task) {
    if (!endpoint.connection) {
      throw new Error("SSH endpoint is missing connection options.");
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
  async withDirectorySshClient(endpoint, task) {
    if (!endpoint.connection) {
      throw new Error("SSH endpoint is missing connection options.");
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
  async withSshClient(endpoint, task) {
    if (!endpoint.connection) {
      throw new Error("SSH endpoint is missing connection options.");
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
  async copyLocalPath(sourcePath, targetPath, onDelta, progressId) {
    this.throwIfTransferCanceled(progressId);
    const stat = await fsp.stat(sourcePath);
    if (stat.isDirectory()) {
      if (platform() === "win32" || looksLikeWindowsPath(sourcePath) || looksLikeWindowsPath(targetPath)) {
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
    let previousBytes = await getLocalPathSize(targetPath).catch(() => 0);
    let completed = false;
    const copy = runLocalRobocopyCommand([
      sourcePath,
      targetPath,
      "/E",
      "/MT:32",
      "/R:0",
      "/W:0",
      "/NFL",
      "/NDL",
      "/NJH",
      "/NJS",
      "/NP",
      "/NC",
      "/NS"
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
  async moveLocalPathNative(sourcePath, targetPath) {
    if (platform() === "win32" || looksLikeWindowsPath(sourcePath) || looksLikeWindowsPath(targetPath)) {
      await ensureLocalParentDirectory(targetPath);
      await runLocalPowerShellScript(buildLocalWindowsMoveScript(sourcePath, targetPath));
      return;
    }
    await ensureLocalParentDirectory(targetPath);
    await runLocalCommand("mv", ["-f", sourcePath, targetPath]);
  }
  async moveRemotePathNative(endpoint, targetPath) {
    const command = looksLikeWindowsPath(endpoint.path) || looksLikeWindowsPath(targetPath) ? buildWindowsMoveCommand(endpoint.path, targetPath) : `mkdir -p ${quotePosixShellArg(getRemoteParentPath(targetPath))} && mv -f ${quotePosixShellArg(endpoint.path)} ${quotePosixShellArg(targetPath)}`;
    await this.withSshClient(endpoint, (client) => this.execRemote(client, command));
  }
  async execRemoteCopyWithProgress(request, command, bytes, sourceType) {
    let completed = false;
    const copy = this.withDirectorySshClient(request.source, (client) => this.execRemote(client, command)).finally(() => {
      completed = true;
    });
    if (bytes <= 0) {
      await copy;
      return;
    }
    const startedAt = Date.now();
    const estimateDirectoryProgress = sourceType === "directory";
    let lastCopiedBytes = 0;
    try {
      while (!completed) {
        await delay(500);
        if (completed) {
          break;
        }
        this.throwIfTransferCanceled(request.progressId);
        if (estimateDirectoryProgress) {
          const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1e3);
          const estimatedBytes = Math.min(bytes * 0.95, elapsedSeconds * REMOTE_NATIVE_DIRECTORY_COPY_PROGRESS_BYTES_PER_SECOND);
          const copiedBytes2 = Math.max(0, Math.floor(estimatedBytes));
          if (copiedBytes2 > lastCopiedBytes) {
            lastCopiedBytes = copiedBytes2;
            this.fireTransferProgress(request, copiedBytes2, bytes, "transfer", "Remote copy in progress.");
          }
          continue;
        }
        const copiedBytes = await this.getRemotePathSizeByCommand(request.target).catch(() => 0);
        if (copiedBytes > 0 && copiedBytes !== lastCopiedBytes) {
          lastCopiedBytes = copiedBytes;
          this.fireTransferProgress(request, Math.min(copiedBytes, bytes), bytes, "transfer", "Remote copy in progress.");
        }
      }
    } finally {
      await copy;
    }
  }
  async copyLocalFileWithProgress(sourcePath, targetPath, onDelta, progressId) {
    const source = createReadStream(sourcePath, { highWaterMark: LOCAL_COPY_FILE_HIGH_WATER_MARK });
    const target = createWriteStream(targetPath, { highWaterMark: LOCAL_COPY_FILE_HIGH_WATER_MARK });
    const unregisterCancel = this.registerTransferCancelHandler(progressId, () => {
      const error = new TurboFileTransferCanceledError();
      source.destroy(error);
      target.destroy(error);
    });
    source.on("data", (chunk) => {
      try {
        this.throwIfTransferCanceled(progressId);
      } catch (error) {
        source.destroy(error instanceof Error ? error : new TurboFileTransferCanceledError());
        target.destroy(error instanceof Error ? error : new TurboFileTransferCanceledError());
        return;
      }
      if (typeof chunk === "string") {
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
  createSftpTransferOptions(onDelta, progressId, bytes = 0, adaptive = true) {
    const useLargeOptions = adaptive && bytes >= SFTP_LARGE_FILE_THRESHOLD;
    const options = {
      concurrency: adaptive ? useLargeOptions ? SFTP_LARGE_TRANSFER_CONCURRENCY : SFTP_TRANSFER_CONCURRENCY : SFTP_COMPAT_TRANSFER_CONCURRENCY,
      chunkSize: adaptive ? useLargeOptions ? SFTP_LARGE_TRANSFER_CHUNK_SIZE : SFTP_TRANSFER_CHUNK_SIZE : SFTP_COMPAT_TRANSFER_CHUNK_SIZE
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
      averageBytesPerSecond: Math.round(bytes / (durationMs / 1e3))
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
      return void 0;
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
      sinceClientMs: state.clientStartedAt !== void 0 ? now - state.clientStartedAt : void 0,
      sinceServiceMs: now - state.serviceStartedAt,
      sincePreviousMs: now - state.lastMarkAt,
      ...extra
    };
    state.lastMarkAt = now;
    const logPath = join(app.getPath("userData"), "logs", "turbofile-rsync-timing.log");
    void fsp.mkdir(dirname(logPath), { recursive: true }).then(() => fsp.appendFile(logPath, `${JSON.stringify(payload)}
`, "utf8")).catch(() => void 0);
  }
  createRsyncProgressReporter(request, totalBytes, phase, detail, extra = {}, onAcceptedProgress) {
    let knownTotalBytes = Math.max(0, totalBytes);
    let lastBytes = 0;
    let rsyncProgressBuffer = "";
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
      const normalizedTransferred = Math.max(0, transferredBytes);
      const hasMetricChange = toCheck !== void 0 && toCheck !== lastToCheck || totalChecks !== void 0 && totalChecks !== lastTotalChecks || transferIndex !== void 0 && transferIndex !== lastTransferIndex;
      const hasSpeedChange = speedBytesPerSecond !== void 0 && speedBytesPerSecond !== lastSpeedBytesPerSecond;
      if (!force && normalizedTransferred <= lastBytes && !hasMetricChange && !hasSpeedChange) {
        return;
      }
      lastBytes = normalizedTransferred;
      if (toCheck !== void 0) {
        lastToCheck = toCheck;
      }
      if (totalChecks !== void 0) {
        lastTotalChecks = totalChecks;
      }
      if (transferIndex !== void 0) {
        lastTransferIndex = transferIndex;
      }
      if (speedBytesPerSecond !== void 0) {
        lastSpeedBytesPerSecond = speedBytesPerSecond;
      }
      lastActivityAt = Date.now();
      const emittedTotal = knownTotalBytes > 0 ? Math.max(knownTotalBytes, normalizedTransferred) : 0;
      this.fireTransferProgress(request, normalizedTransferred, emittedTotal, phase, detail, force, {
        ...extra,
        ...toCheck !== void 0 ? { toCheck } : {},
        ...totalChecks !== void 0 ? { totalChecks } : {},
        ...transferIndex !== void 0 ? { transferIndex } : {},
        ...speedBytesPerSecond !== void 0 ? { speedBytesPerSecond } : {}
      });
    };
    return {
      handleOutput: (chunk) => {
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
      setTotalBytes: (total) => {
        const normalizedTotal = Math.max(0, total);
        if (normalizedTotal <= knownTotalBytes) {
          return;
        }
        knownTotalBytes = normalizedTotal;
        reportProgress(lastBytes, true);
      }
    };
  }
  createParallelRsyncProgressReporter(request, totalBytes, phase, detail, extra = {}, onAcceptedProgress) {
    let knownTotalBytes = Math.max(0, totalBytes);
    const transferredByIndex = /* @__PURE__ */ new Map();
    const speedByIndex = /* @__PURE__ */ new Map();
    let outputBuffer = "";
    let lastBytes = 0;
    let lastSpeedBytesPerSecond = 0;
    let lastActivityAt;
    let accepted = false;
    const report = (force = false) => {
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
        ...speedBytesPerSecond > 0 || previousSpeedBytesPerSecond > 0 ? { speedBytesPerSecond } : {}
      });
    };
    const parseLine = (line) => {
      const tagged = line.match(/^__TURBOFILE_RSYNC_(\d+)__\s*(.*)$/);
      const index = tagged ? Number(tagged[1]) : 0;
      const content = tagged ? tagged[2] : line;
      if (!Number.isFinite(index)) {
        return;
      }
      const snapshot = this.parseRsyncProgressSnapshot(`
${content}`);
      if (!snapshot) {
        if (!accepted) {
          accepted = true;
          lastActivityAt = Date.now();
          onAcceptedProgress?.();
        }
        return;
      }
      if (snapshot.bytes !== void 0) {
        transferredByIndex.set(index, Math.max(transferredByIndex.get(index) ?? 0, snapshot.bytes));
      }
      if (snapshot.speedBytesPerSecond !== void 0) {
        if (snapshot.percent !== void 0 && snapshot.percent >= 100) {
          speedByIndex.delete(index);
        } else {
          speedByIndex.set(index, snapshot.speedBytesPerSecond);
        }
      }
      report(false);
    };
    return {
      handleOutput: (chunk) => {
        outputBuffer = `${outputBuffer}${chunk}`.slice(-8192);
        const lines = outputBuffer.split(/\r?\n/);
        outputBuffer = lines.pop() ?? "";
        for (const line of lines) {
          parseLine(line);
        }
      },
      reportProgress: (transferredBytes) => {
        transferredByIndex.set(0, Math.max(transferredByIndex.get(0) ?? 0, transferredBytes));
        report(true);
      },
      getLastBytes: () => lastBytes,
      getActivityTime: () => lastActivityAt,
      setTotalBytes: (total) => {
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
      return () => void 0;
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
        } catch {
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
    const startedAt = progressId ? this.transferDataStartTimes.get(progressId) ?? this.transferFirstPositiveProgressTimes.get(progressId) ?? fallbackStartedAt : fallbackStartedAt;
    return Math.max(1, Date.now() - startedAt);
  }
  beginRemoteFileGrowthTiming(progressId, connection, path, baselineSize = 0, expectedBytes = 0, onProgress, pollIntervalMs = TRANSFER_PROGRESS_EVENT_INTERVAL_MS, initialDelayMs = 0) {
    let monitorClient;
    let monitorSftp;
    let reusableDirectorySessionKey;
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
      const stat = monitorSftp ? await this.remoteStat(monitorSftp, path).catch(() => void 0) : void 0;
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
      monitorSftp = void 0;
      monitorClient = void 0;
      reusableDirectorySessionKey = void 0;
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
      return () => void 0;
    }
    let handlers = this.transferCancelHandlers.get(progressId);
    if (!handlers) {
      handlers = /* @__PURE__ */ new Set();
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
      let stderrTail = "";
      let unregisterCancel = () => void 0;
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
      const child = spawn(command, args, { windowsHide: true, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout?.on("data", (data) => {
        lastActivityAt = Date.now();
        options.onStdout?.(data.toString());
      });
      child.stderr?.on("data", (data) => {
        lastActivityAt = Date.now();
        const chunk = data.toString();
        stderrTail = `${stderrTail}${chunk}`.slice(-64 * 1024);
        options.onStderr?.(chunk);
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
      child.on("error", (error) => {
        finish(() => {
          if (this.isTransferCanceled(progressId)) {
            reject(new TurboFileTransferCanceledError());
          } else {
            reject(new Error(formatLocalCommandError(stderrTail, error.message)));
          }
        });
      });
      child.on("close", (code) => {
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
      child.once("spawn", () => {
        if (!settled && this.isTransferCanceled(progressId)) {
          killLocalProcessTree(child);
        }
      });
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
    const isDataProgress = phase !== "prepare" && phase !== "complete";
    const strategy = typeof extra.strategy === "string" ? extra.strategy : void 0;
    const isRsyncProgress = strategy?.startsWith("rsync") ?? false;
    const speedBytesPerSecond = typeof extra.speedBytesPerSecond === "number" && Number.isFinite(extra.speedBytesPerSecond) ? Math.max(0, extra.speedBytesPerSecond) : 0;
    const hasPositiveTransferProgress = normalizedTransferred > 0 || speedBytesPerSecond > 0;
    const shouldStartDataTiming = isDataProgress && (!isRsyncProgress || hasPositiveTransferProgress);
    const rsyncTimingState = isRsyncProgress ? this.getRsyncTimingState(request) : void 0;
    if (rsyncTimingState && !rsyncTimingState.firstProgressEventSeen) {
      rsyncTimingState.firstProgressEventSeen = true;
      this.markRsyncTiming(request, rsyncTimingState, "first-progress-event", {
        strategy,
        phase,
        detail,
        transferredBytes: normalizedTransferred,
        totalBytes: normalizedTotal
      });
    }
    if (rsyncTimingState && isDataProgress && !rsyncTimingState.visibleTransferEventSeen) {
      rsyncTimingState.visibleTransferEventSeen = true;
      this.markRsyncTiming(request, rsyncTimingState, "visible-transfer-event", {
        strategy,
        phase,
        detail,
        transferredBytes: normalizedTransferred,
        totalBytes: normalizedTotal
      });
    }
    if (rsyncTimingState && hasPositiveTransferProgress && !rsyncTimingState.firstPositiveBytesSeen) {
      rsyncTimingState.firstPositiveBytesSeen = true;
      this.markRsyncTiming(request, rsyncTimingState, "first-positive-bytes", {
        strategy,
        phase,
        detail,
        transferredBytes: normalizedTransferred,
        totalBytes: normalizedTotal,
        speedBytesPerSecond
      });
    }
    if (rsyncTimingState && phase === "complete") {
      this.markRsyncTiming(request, rsyncTimingState, "complete", {
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
    }, 3e4);
  }
  async readLocalFileBuffer(path, maxBytes) {
    const stat = await fsp.stat(path);
    if (stat.isDirectory()) {
      throw new Error("Cannot preview a directory.");
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
          throw new Error("Cannot preview a directory.");
        }
        if (stat.size > maxBytes) {
          throw new Error(`File is too large to preview (${formatBytes(stat.size)}).`);
        }
        if (stat.size <= REMOTE_DIRECT_READ_MAX_BYTES) {
          return this.readRemoteFileBufferDirect(sftp, endpoint.path, stat.size);
        }
        tempRoot = join(tmpdir(), `turbofile-read-${randomUUID()}`);
        const tempPath = join(tempRoot, basename(endpoint.path) || "content");
        await fsp.mkdir(tempRoot, { recursive: true });
        await this.fastGet(sftp, endpoint.path, tempPath);
        return await fsp.readFile(tempPath);
      });
    } finally {
      if (tempRoot) {
        await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => void 0);
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
      } catch {
      }
    }
    const handle = await this.openRemoteFile(sftp, remotePath, "r");
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
  readRemoteFileBufferStream(sftp, remotePath, size) {
    return new Promise((resolve, reject) => {
      const stream = sftp.createReadStream?.(remotePath, {
        highWaterMark: REMOTE_DIRECT_READ_CHUNK_BYTES
      });
      if (!stream) {
        reject(new Error("SFTP read stream is unavailable."));
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
      stream.on("data", (chunk) => {
        const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
        total += buffer.byteLength;
        if (total > size) {
          stream.destroy?.();
          finish(() => reject(new Error("Remote file stream exceeded expected size.")));
          return;
        }
        chunks.push(buffer);
      });
      stream.on("error", (error) => finish(() => reject(error)));
      stream.on("end", () => finish(() => resolve(Buffer.concat(chunks, total))));
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
    await new Promise((resolve) => this.imageReadWaiters.push(resolve));
  }
  releaseImageReadSlot() {
    const next = this.imageReadWaiters.shift();
    if (next) {
      next();
      return;
    }
    this.imageReadActiveCount = Math.max(0, this.imageReadActiveCount - 1);
  }
  async readImageBuffer(endpoint, options) {
    if (endpoint.kind !== "ssh") {
      return this.readImageBufferInner(endpoint, options);
    }
    await this.acquireImageReadSlot();
    try {
      return await this.readImageBufferInner(endpoint, options);
    } finally {
      this.releaseImageReadSlot();
    }
  }
  async readImageBufferInner(endpoint, options) {
    const targetWidth = clampPositiveInt(options.width);
    const targetHeight = clampPositiveInt(options.height);
    const quality = clampQuality(options.quality);
    const format = options.format === "png" ? "png" : options.format === "webp" ? "webp" : "jpeg";
    const interpolation = options.interpolation === "lanczos" ? "lanczos" : "area";
    const forceOriginal = Boolean(options.forceOriginal || !targetWidth && !targetHeight);
    const sourceMaxBytes = Math.max(options.maxBytes ?? DEFAULT_READ_LIMIT, DEFAULT_IMAGE_SOURCE_LIMIT);
    if (forceOriginal) {
      return this.readOriginalImageBuffer(endpoint, sourceMaxBytes);
    }
    const sourceFingerprint = this.getImageSourceFingerprintFromOptions(options) ?? await this.getImageSourceFingerprint(endpoint).catch(() => void 0);
    const thumbnailCacheKey = sourceFingerprint ? this.getImageThumbnailCacheKey(endpoint, sourceFingerprint, targetWidth, targetHeight, quality, format, interpolation) : void 0;
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
    const buffer = endpoint.kind === "local" ? await this.readLocalFileBuffer(endpoint.path, sourceMaxBytes) : await this.readRemoteFileBuffer(endpoint, sourceMaxBytes);
    if (getMimeType(endpoint.path) === "image/bmp") {
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
    const shouldTryRemoteTransform = endpoint.kind === "ssh" && !looksLikeWindowsPath(endpoint.path) && (!sourceFingerprint || sourceFingerprint.size > REMOTE_DIRECT_READ_MAX_BYTES);
    if (shouldTryRemoteTransform) {
      const thumbnail = await this.tryReadRemoteThumbnailViaImageMagick(endpoint, targetWidth, targetHeight, quality, format, interpolation);
      if (thumbnail) {
        return thumbnail;
      }
    }
    const sourceBuffer = endpoint.kind === "local" ? await this.readLocalFileBuffer(endpoint.path, sourceMaxBytes) : await this.readRemoteFileBuffer(endpoint, sourceMaxBytes);
    const sourceSize = getImageSize(sourceBuffer);
    const sourceMime = getMimeType(endpoint.path);
    if (sourceMime === "image/bmp") {
      const bmp = tryCreateBmpPngVariant(sourceBuffer, targetWidth, targetHeight);
      if (bmp) {
        return bmp;
      }
    }
    if (sourceMime === "image/bmp" && sourceBuffer.byteLength <= RAW_BMP_FAST_PATH_BYTES && shouldKeepOriginalImageSize(sourceSize, targetWidth, targetHeight)) {
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
      if (sourceMime.startsWith("image/")) {
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
      return void 0;
    }
    return { size, modified };
  }
  async getImageSourceFingerprint(endpoint) {
    if (endpoint.kind === "local") {
      const stat = await fsp.stat(endpoint.path);
      if (!stat.isFile()) {
        return void 0;
      }
      return {
        size: stat.size,
        modified: Math.round(stat.mtimeMs)
      };
    }
    return this.withDirectorySftp(endpoint, async (sftp) => {
      const stat = await this.remoteStat(sftp, endpoint.path);
      if (!stat.isFile()) {
        return void 0;
      }
      return {
        size: stat.size,
        modified: stat.mtime * 1e3
      };
    });
  }
  getImageThumbnailCacheKey(endpoint, sourceFingerprint, width, height, quality, format, interpolation) {
    const endpointKey = endpoint.kind === "local" ? { kind: endpoint.kind, path: endpoint.path } : {
      kind: endpoint.kind,
      host: endpoint.connection?.host ?? "",
      port: endpoint.connection?.port || 22,
      username: endpoint.connection?.username ?? "",
      path: endpoint.path
    };
    return createHash("sha256").update(JSON.stringify({
      version: IMAGE_THUMBNAIL_CACHE_VERSION,
      endpoint: endpointKey,
      source: sourceFingerprint,
      width,
      height,
      quality,
      format,
      interpolation
    })).digest("hex");
  }
  async readCachedImageThumbnail(cacheKey) {
    const paths = this.getImageThumbnailCachePaths(cacheKey);
    try {
      const [metadataContent, buffer] = await Promise.all([
        fsp.readFile(paths.metadataPath, "utf8"),
        fsp.readFile(paths.dataPath)
      ]);
      const metadata = JSON.parse(metadataContent);
      if (metadata.version !== IMAGE_THUMBNAIL_CACHE_VERSION || metadata.size !== buffer.byteLength || typeof metadata.mime !== "string") {
        return void 0;
      }
      const now = /* @__PURE__ */ new Date();
      void fsp.utimes(paths.dataPath, now, now).catch(() => void 0);
      return {
        buffer,
        mime: metadata.mime,
        width: typeof metadata.width === "number" ? metadata.width : void 0,
        height: typeof metadata.height === "number" ? metadata.height : void 0,
        originalWidth: typeof metadata.originalWidth === "number" ? metadata.originalWidth : void 0,
        originalHeight: typeof metadata.originalHeight === "number" ? metadata.originalHeight : void 0
      };
    } catch {
      return void 0;
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
    } catch {
    }
  }
  getImageThumbnailCachePaths(cacheKey) {
    const bucket = cacheKey.slice(0, 2) || "00";
    const root = this.getImageThumbnailCacheRoot();
    return {
      dataPath: join(root, bucket, `${cacheKey}.bin`),
      metadataPath: join(root, bucket, `${cacheKey}.json`)
    };
  }
  getImageThumbnailCacheRoot() {
    try {
      return join(app.getPath("userData"), "turbofile-image-cache", `v${IMAGE_THUMBNAIL_CACHE_VERSION}`);
    } catch {
      return join(tmpdir(), "turbofile-image-cache", `v${IMAGE_THUMBNAIL_CACHE_VERSION}`);
    }
  }
  scheduleTrimImageThumbnailCache() {
    if (this.imageThumbnailCacheTrimPromise) {
      return;
    }
    this.imageThumbnailCacheTrimPromise = this.trimImageThumbnailCache().finally(() => {
      this.imageThumbnailCacheTrimPromise = void 0;
    });
  }
  async trimImageThumbnailCache() {
    const root = this.getImageThumbnailCacheRoot();
    const entries = [];
    const visit = async (directory) => {
      let children;
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
        if (!child.isFile() || !child.name.endsWith(".bin")) {
          continue;
        }
        const stat = await fsp.stat(childPath).catch(() => void 0);
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
        fsp.rm(entry.dataPath, { force: true }).catch(() => void 0),
        fsp.rm(entry.metadataPath, { force: true }).catch(() => void 0)
      ]);
      totalBytes -= entry.size;
    }
  }
  async tryReadRemoteThumbnailViaImageMagick(endpoint, width, height, quality, format, interpolation) {
    if (!endpoint.connection || !width && !height) {
      return void 0;
    }
    const tool = await this.getRemoteImageTool(endpoint);
    if (!tool) {
      return void 0;
    }
    const geometry = buildImageGeometry(width, height);
    if (!geometry) {
      return void 0;
    }
    const effectiveFormat = format === "png" ? "png" : "jpeg";
    const lowerPath = endpoint.path.toLowerCase();
    const frame = lowerPath.endsWith(".tif") || lowerPath.endsWith(".tiff") ? "[0]" : "";
    const source = `${quotePosixShellArg(endpoint.path)}${frame}`;
    const thumbnail = ` -thumbnail ${quotePosixShellArg(geometry)}`;
    const filter = interpolation === "lanczos" ? " -filter Lanczos" : "";
    const qualityOption = effectiveFormat === "png" ? "" : ` -quality ${quality}`;
    const outputFormat = effectiveFormat === "png" ? "png:-" : "jpg:-";
    const mime = effectiveFormat === "png" ? "image/png" : "image/jpeg";
    const command = `${tool} ${source}${thumbnail}${filter} -strip${qualityOption} ${outputFormat}`;
    try {
      const buffer = await this.withDirectorySshClient(endpoint, (client) => this.execRemoteBytes(client, command, { timeoutMs: REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS }));
      assertImageBuffer(buffer, mime);
      const size = getImageSize(buffer);
      if (!size) {
        throw new Error("Remote thumbnail produced an undecodable image.");
      }
      return {
        buffer,
        mime,
        width: size.width,
        height: size.height
      };
    } catch (error) {
      return void 0;
    }
  }
  async getRemoteImageTool(endpoint) {
    if (!endpoint.connection) {
      return void 0;
    }
    const cacheKey = this.getRemoteImageToolCacheKey(endpoint.connection);
    const cached = this.remoteImageToolCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.checkedAt < REMOTE_IMAGE_TOOL_CACHE_TTL_MS) {
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
  async resolveRemoteImageTool(endpoint, cacheKey, checkedAt) {
    let output = "";
    try {
      await this.withDirectorySshClient(endpoint, (client) => this.execRemote(client, `command -v magick >/dev/null 2>&1 && printf magick || (command -v convert >/dev/null 2>&1 && printf convert)`, {
        onStdout: (chunk) => {
          output += chunk;
        }
      }));
      const normalized = output.trim() === "convert" ? "convert" : output.trim() === "magick" ? "magick" : void 0;
      this.remoteImageToolCache.set(cacheKey, { checkedAt, tool: normalized });
      return normalized;
    } catch {
      this.remoteImageToolCache.set(cacheKey, { checkedAt, tool: void 0 });
      return void 0;
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
      client.exec(command, (error, stream) => {
        if (error) {
          reject(error);
          return;
        }
        let stderr = "";
        let settled = false;
        const close = new Promise((closeResolve, closeReject) => {
          const finish = (callback) => {
            if (settled) {
              return;
            }
            settled = true;
            callback();
          };
          stream.stderr.on("data", (data) => {
            stderr += data.toString();
          });
          if (drainStdout) {
            stream.on("data", () => void 0);
          }
          stream.on("error", (err) => finish(() => closeReject(err)));
          stream.on("close", (code) => {
            if (code === 0) {
              finish(() => closeResolve());
              return;
            }
            finish(() => closeReject(new Error(stderr.trim() || `${context} failed with exit code ${code ?? "unknown"}.`)));
          });
        });
        close.catch(() => void 0);
        resolve({ stream, close });
      });
    });
  }
  transformImageBuffer(buffer, path, targetWidth, targetHeight, quality, format) {
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) {
      throw new Error("Unsupported image format.");
    }
    const sourceSize = image.getSize();
    if (!sourceSize.width || !sourceSize.height) {
      throw new Error("Unable to read image dimensions.");
    }
    const resized = this.resizeNativeImage(image, sourceSize, targetWidth, targetHeight);
    const outputFormat = format === "png" ? "png" : "jpeg";
    const output = outputFormat === "png" ? resized.toPNG() : resized.toJPEG(quality);
    const outputSize = resized.getSize();
    return {
      buffer: output,
      mime: outputFormat === "png" ? "image/png" : "image/jpeg",
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
      quality: "best"
    });
  }
  execRemote(client, command, options = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout;
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
        if (timeout) {
          clearTimeout(timeout);
          timeout = void 0;
        }
        if (inactivityTimer) {
          clearInterval(inactivityTimer);
          inactivityTimer = void 0;
        }
        callback();
      };
      const closeStream = () => {
        try {
          streamRef?.close?.();
        } catch {
        }
        try {
          streamRef?.destroy?.();
        } catch {
        }
      };
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
        streamRef = stream;
        let stderr = "";
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
            if (Date.now() - lastActivityAt <= options.inactivityTimeoutMs) {
              return;
            }
            closeStream();
            finish(() => reject(new Error(options.inactivityMessage ?? `Remote command produced no progress for ${options.inactivityTimeoutMs} ms.`)));
          }, DIRECT_TRANSFER_STALL_CHECK_INTERVAL_MS);
        }
        stream.on("data", (data) => {
          lastStreamActivityAt = Date.now();
          options.onStdout?.(data.toString());
        });
        stream.stderr.on("data", (data) => {
          lastStreamActivityAt = Date.now();
          const chunk = data.toString();
          stderr += chunk;
          options.onStderr?.(chunk);
        });
        stream.on("close", (code) => {
          if (code === 0) {
            finish(() => resolve());
            return;
          }
          finish(() => reject(new Error(stderr.trim() || `Remote command failed with exit code ${code ?? "unknown"}.`)));
        });
      });
    });
  }
  execRemoteBytes(client, command, options = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let totalTimeout;
      let inactivityTimer;
      let activeStream;
      const clearTimers = () => {
        if (totalTimeout) {
          clearTimeout(totalTimeout);
          totalTimeout = void 0;
        }
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = void 0;
        }
      };
      const finish = (callback) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimers();
        callback();
      };
      const abort = (message) => {
        const stream = activeStream;
        try {
          stream?.close?.();
        } catch {
        }
        try {
          stream?.destroy?.();
        } catch {
        }
        finish(() => reject(new Error(message)));
      };
      const armInactivity = () => {
        if (!options.inactivityTimeoutMs || options.inactivityTimeoutMs <= 0) {
          return;
        }
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
        }
        inactivityTimer = setTimeout(() => abort(options.inactivityMessage ?? `Remote command produced no output for ${options.inactivityTimeoutMs} ms.`), options.inactivityTimeoutMs);
      };
      if (options.timeoutMs && options.timeoutMs > 0) {
        totalTimeout = setTimeout(() => abort(`Remote command timed out after ${options.timeoutMs} ms.`), options.timeoutMs);
      }
      armInactivity();
      client.exec(command, (error, stream) => {
        if (error) {
          finish(() => reject(error));
          return;
        }
        if (settled) {
          try {
            stream.close?.();
          } catch {
          }
          try {
            stream.destroy?.();
          } catch {
          }
          return;
        }
        activeStream = stream;
        const chunks = [];
        let stderr = "";
        armInactivity();
        stream.on("data", (data) => {
          armInactivity();
          chunks.push(typeof data === "string" ? Buffer.from(data) : data);
        });
        stream.stderr.on("data", (data) => {
          armInactivity();
          stderr += data.toString();
        });
        stream.on("close", (code) => {
          if (code === 0) {
            finish(() => resolve(Buffer.concat(chunks)));
            return;
          }
          finish(() => reject(new Error(stderr.trim() || `Remote command failed with exit code ${code ?? "unknown"}.`)));
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
      let timeout;
      const finish = (callback) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout) {
          clearTimeout(timeout);
          timeout = void 0;
        }
        callback();
      };
      client.exec(command, (error, stream) => {
        if (error) {
          finish(() => reject(error));
          return;
        }
        const chunks = [];
        let stderr = "";
        if (options.timeoutMs && options.timeoutMs > 0) {
          timeout = setTimeout(() => {
            try {
              stream.close?.();
            } catch {
            }
            finish(() => reject(new Error(`Remote command timed out after ${options.timeoutMs} ms.`)));
          }, options.timeoutMs);
        }
        stream.on("data", (data) => chunks.push(typeof data === "string" ? Buffer.from(data) : data));
        stream.stderr.on("data", (data) => {
          stderr += data.toString();
        });
        stream.on("close", (code) => {
          if (code === 0) {
            finish(() => resolve(Buffer.concat(chunks)));
            return;
          }
          finish(() => reject(new Error(stderr.trim() || `Remote command failed with exit code ${code ?? "unknown"}.`)));
        });
        stream.end(input);
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
      const bytes = Number(match[1].replace(/[^0-9]/g, ""));
      const percent = Number(match[2]);
      if (Number.isFinite(bytes)) {
        hasParsedMetric = true;
        parsed = {
          bytes,
          ...Number.isFinite(percent) ? { percent } : {}
        };
      }
    }
    let speedMatch;
    while ((speedMatch = speedPattern.exec(chunk)) !== null) {
      const speedBytesPerSecond = parseRsyncSpeedBytesPerSecond(speedMatch[1], speedMatch[2]);
      if (speedBytesPerSecond !== void 0) {
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
    return hasParsedMetric ? parsed : void 0;
  }
  async readRemoteDirectoryWithFallback(sftp, client, options, remotePath, namesOnly = false) {
    try {
      return { path: remotePath, entries: await this.readRemoteDirectoryFast(client, sftp, remotePath, namesOnly) };
    } catch (firstError) {
      for (const fallbackPath of getRemoteDirectoryFallbackPaths(options, remotePath)) {
        try {
          return { path: fallbackPath, entries: await this.readRemoteDirectoryFast(client, sftp, fallbackPath, namesOnly) };
        } catch {
        }
      }
      throw firstError;
    }
  }
  async readRemoteDirectoryFast(client, sftp, remotePath, namesOnly = false) {
    try {
      const command = namesOnly ? buildPosixNamesAndTypesListCommand(remotePath) : buildPosixFastDirectoryListCommand(remotePath);
      return this.parseFastRemoteDirectoryEntries(await this.execRemoteBytes(client, command, {
        inactivityTimeoutMs: REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS,
        inactivityMessage: `Remote directory read produced no output for ${REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS} ms: ${remotePath}`,
        timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS
      }), namesOnly);
    } catch {
      return this.readRemoteDirectory(sftp, remotePath);
    }
  }
  parseFastRemoteDirectoryEntries(output, namesOnly = false) {
    const text = output.toString("utf8");
    if (!text) {
      return [];
    }
    const parts = text.split("\0");
    const entries = [];
    const stride = namesOnly ? 2 : 4;
    for (let index = 0; index + stride - 1 < parts.length; index += stride) {
      const filename = parts[index];
      if (!filename || filename === "." || filename === "..") {
        continue;
      }
      const kind = parts[index + 1];
      const size = namesOnly ? 0 : Number(parts[index + 2]);
      const modifiedSeconds = namesOnly ? 0 : Number(parts[index + 3]);
      const type = kind === "d" ? "directory" : kind === "f" ? "file" : kind === "l" ? "symlink" : "unknown";
      entries.push({
        filename,
        longname: type === "directory" ? "d" : type === "symlink" ? "l" : "-",
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
  async getRemotePathSize(sftp, remotePath) {
    const stats = await this.remoteStat(sftp, remotePath);
    if (!stats.isDirectory()) {
      return stats.size;
    }
    let total = 0;
    const entries = await this.readRemoteDirectory(sftp, remotePath);
    for (const entry of entries) {
      if (entry.filename === "." || entry.filename === "..") {
        continue;
      }
      if (entry.attrs.isDirectory() || entry.attrs.isFile()) {
        total += await this.getRemotePathSize(sftp, joinRemotePath(remotePath, entry.filename));
      }
    }
    return total;
  }
  async getRemotePathSizeByCommand(endpoint) {
    if (endpoint.kind !== "ssh") {
      return getLocalPathSize(endpoint.path);
    }
    try {
      if (looksLikeWindowsPath(endpoint.path)) {
        return await this.withDirectorySshClient(endpoint, async (client) => {
          const output = await this.execRemoteBytes(client, buildWindowsSizeCommand(endpoint.path));
          return parseSizeCommandOutput(output.toString());
        });
      }
      return await this.withDirectorySshClient(endpoint, async (client) => {
        const output = await this.execRemoteBytes(client, buildPosixSizeCommand(endpoint.path));
        return parseSizeCommandOutput(output.toString());
      });
    } catch {
      return this.withDirectorySftp(endpoint, (sftp) => this.getRemotePathSize(sftp, endpoint.path));
    }
  }
  async getRemotePathContentSizeByCommand(endpoint) {
    if (endpoint.kind !== "ssh" || looksLikeWindowsPath(endpoint.path)) {
      return this.getRemotePathSizeByCommand(endpoint);
    }
    try {
      return await this.withDirectorySshClient(endpoint, async (client) => {
        const output = await this.execRemoteBytes(client, buildPosixContentSizeCommand(endpoint.path));
        return parseSizeCommandOutput(output.toString());
      });
    } catch {
      return this.withDirectorySftp(endpoint, (sftp) => this.getRemotePathSize(sftp, endpoint.path));
    }
  }
  async getPathHumanSize(endpoint, size) {
    if (endpoint.kind === "ssh" && !looksLikeWindowsPath(endpoint.path)) {
      try {
        return await this.withDirectorySshClient(endpoint, async (client) => {
          const output = await this.execRemoteBytes(client, buildPosixHumanSizeCommand(endpoint.path));
          const humanSize = output.toString().trim().split(/\r?\n/)[0]?.trim();
          if (!humanSize) {
            throw new Error("Empty human size output.");
          }
          return humanSize;
        });
      } catch {
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
      sftp.mkdir(remotePath, (error) => {
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
      sftp.rmdir(remotePath, (error) => {
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
      sftp.unlink(remotePath, (error) => {
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
      } else {
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
      } else {
        sftp.fastPut(localPath, remotePath, callback);
      }
    });
  }
  async fastGetWithFallback(sftp, remotePath, localPath, bytes, onDelta, progressId) {
    await this.fastTransferWithFallback(
      bytes,
      onDelta,
      progressId,
      (report) => this.fastGet(sftp, remotePath, localPath, this.createSftpTransferOptions(report, progressId, bytes, true)),
      (report) => this.fastGet(sftp, remotePath, localPath, this.createSftpTransferOptions(report, progressId, bytes, false))
    );
  }
  async fastPutWithFallback(sftp, localPath, remotePath, bytes, onDelta, progressId) {
    await this.fastTransferWithFallback(
      bytes,
      onDelta,
      progressId,
      (report) => this.fastPut(sftp, localPath, remotePath, this.createSftpTransferOptions(report, progressId, bytes, true)),
      (report) => this.fastPut(sftp, localPath, remotePath, this.createSftpTransferOptions(report, progressId, bytes, false))
    );
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
    } catch (error) {
      if (!useLargeOptions || error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
        throw error;
      }
      await fallback(createAttemptReporter());
    }
  }
  async ensureRemoteDirectory(sftp, remotePath) {
    const normalized = remotePath.replace(/\\/g, "/");
    if (!normalized || normalized === "/" || normalized === ".") {
      return;
    }
    const drive = /^[A-Za-z]:/.exec(normalized)?.[0];
    const isAbsolute = normalized.startsWith("/");
    let current = isAbsolute ? "/" : drive ?? "";
    const rest = drive ? normalized.substring(drive.length).replace(/^\/+/, "") : normalized.replace(/^\/+/, "");
    for (const segment of rest.split("/").filter(Boolean)) {
      current = current ? joinRemotePath(current, segment) : segment;
      let stats;
      try {
        stats = await this.remoteStat(sftp, current);
      } catch {
        await this.mkdirRemote(sftp, current);
        stats = await this.remoteStat(sftp, current).catch(() => void 0);
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
    const plan = await this.withSftp(endpoint, (sftp) => this.collectRemoteDirectoryTransferPlan(sftp, remotePath, localPath, progressId), progressId);
    onTotal?.(plan.totalBytes);
    await mapLimit(plan.directories, LOCAL_DIRECTORY_STAT_CONCURRENCY, (directory) => fsp.mkdir(directory, { recursive: true }));
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
        if (entry.filename === "." || entry.filename === "..") {
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
    const uniqueDirectories = [...new Set(directories)].filter((directory) => !!directory && directory !== "." && directory !== "/");
    if (!uniqueDirectories.length) {
      return;
    }
    if (endpoint.kind === "ssh" && !uniqueDirectories.some(looksLikeWindowsPath)) {
      try {
        await this.withSshClient(endpoint, async (client) => {
          for (let index = 0; index < uniqueDirectories.length; index += SFTP_DIRECTORY_MKDIR_BATCH_SIZE) {
            const chunk = uniqueDirectories.slice(index, index + SFTP_DIRECTORY_MKDIR_BATCH_SIZE);
            await this.execRemote(client, `mkdir -p -- ${chunk.map((directory) => quotePosixShellArg(directory)).join(" ")}`);
          }
        });
        return;
      } catch {
      }
    }
    await mapLimit(uniqueDirectories, SFTP_DIRECTORY_ENTRY_CONCURRENCY, (directory) => this.ensureRemoteDirectory(fallbackSftp, directory));
  }
  async withSftpPool(endpoint, requestedConnections, progressId, task) {
    if (!endpoint.connection) {
      throw new Error("SSH endpoint is missing connection options.");
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
        } catch {
        }
      }
      for (const client of clients) {
        try {
          client.end();
        } catch {
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
      } else if (entry.isFile()) {
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
      if (entry.filename === "." || entry.filename === "..") {
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
  async deleteRemoteDirectory(sftp, remotePath) {
    const entries = await this.readRemoteDirectory(sftp, remotePath);
    for (const entry of entries) {
      if (entry.filename === "." || entry.filename === "..") {
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
  toRemoteEntry(parentPath, entry) {
    const type = getFileTypeFromStats(entry.attrs);
    return {
      name: entry.filename,
      path: joinRemotePath(parentPath, entry.filename),
      type,
      size: entry.attrs.size,
      modified: entry.attrs.mtime * 1e3,
      permissions: entry.longname.split(/\s+/)[0]
    };
  }
  async getNativeRequire() {
    if (!this.nativeRequire) {
      const nodeModule = await import("node:module");
      this.nativeRequire = nodeModule.createRequire(import.meta.url);
    }
    return this.nativeRequire;
  }
}
async function readWindowsClipboardFilePaths() {
  const paths = [];
  const acceptPath = (path) => {
    const candidate = path.trim().replace(/^"|"$/g, "").replace(/^file:\/\/\/?/i, "");
    if (!isWindowsClipboardPath(candidate)) {
      return;
    }
    paths.push(candidate);
  };
  for (const path of await readWindowsClipboardDropListPaths().catch(() => [])) {
    acceptPath(path);
  }
  for (const path of parseWindowsClipboardBuffer(clipboard.readBuffer("FileNameW"), "utf16le")) {
    acceptPath(path);
  }
  for (const path of parseWindowsClipboardBuffer(clipboard.readBuffer("FileName"), "utf8")) {
    acceptPath(path);
  }
  for (const path of clipboard.readText("clipboard").split(/\r?\n/)) {
    acceptPath(path);
  }
  return normalizeWindowsTransferPaths(paths, resolveLocalWindowsRealPath);
}
async function readWindowsClipboardDropListPaths() {
  if (platform() !== "win32") {
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
  return stdout.toString("utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => Buffer.from(line, "base64").toString("utf8"));
}
function parseWindowsClipboardBuffer(buffer, encoding) {
  if (!buffer.byteLength) {
    return [];
  }
  return buffer.toString(encoding).replace(/\0+$/g, "").split("\0").filter(Boolean);
}
function readWindowsClipboardOperation() {
  const dropEffect = clipboard.readBuffer("Preferred DropEffect");
  if (dropEffect.byteLength >= 4 && (dropEffect.readUInt32LE(0) & 2) === 2) {
    return "move";
  }
  return "copy";
}
function isWindowsClipboardPath(path) {
  return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}
function resolveLocalWindowsRealPath(path) {
  const realpath = fsp.realpath;
  return realpath.native ? realpath.native(path) : fsp.realpath(path);
}
class ScpProtocolReader {
  constructor(stream) {
    this.chunks = [];
    this.waiters = [];
    this.closed = false;
    stream.on("data", (data) => {
      this.chunks.push(typeof data === "string" ? Buffer.from(data) : data);
      this.flushWaiters();
    });
    stream.on("error", (error) => {
      this.streamError = error;
      this.flushWaiters();
    });
    stream.on("close", () => {
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
    for (; ; ) {
      await this.waitForData();
      const chunk = this.chunks[0];
      const newlineIndex = chunk.indexOf(10);
      if (newlineIndex >= 0) {
        parts.push(this.takeFromFirstChunk(newlineIndex + 1));
        return Buffer.concat(parts).toString("utf8").replace(/\n$/, "").replace(/\r$/, "");
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
      throw new Error("SCP stream closed unexpectedly.");
    }
    await new Promise((resolve) => this.waiters.push(resolve));
    if (this.streamError) {
      throw this.streamError;
    }
    if (!this.chunks.length && this.closed) {
      throw new Error("SCP stream closed unexpectedly.");
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
  throw new Error(`Unexpected SCP response ${code} during ${context}${message ? `: ${message}` : ""}.`);
}
async function readScpFileHeader(reader, stream) {
  for (; ; ) {
    const marker = await reader.readByte();
    if (marker === 1 || marker === 2) {
      const message = (await reader.readLine()).trim();
      throw new Error(message || "SCP download failed.");
    }
    const line = await reader.readLine();
    if (marker === 84) {
      await writeScpData(stream, Buffer.from([0]));
      continue;
    }
    if (marker !== 67) {
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
  } catch (error) {
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
        stream.off("drain", onDrain);
        stream.off("error", onError);
      };
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      stream.once("drain", onDrain);
      stream.once("error", onError);
    } catch (error) {
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
      stream.off("drain", onDrain);
      stream.off("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    stream.once("drain", onDrain);
    stream.once("error", onError);
  });
}
function endLocalStream(stream) {
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });
}
function waitForScpClose(stream) {
  return new Promise((resolve, reject) => {
    stream.on("close", (code) => {
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(new Error(`SCP command failed with exit code ${code}.`));
    });
    stream.on("error", reject);
  });
}
function formatScpMode(mode) {
  return (mode & 511).toString(8).padStart(4, "0");
}
function sanitizeScpFileName(name) {
  return name.replace(/[\r\n]/g, "_") || "payload";
}
function getTransferStrategy(source, target) {
  if (source.kind === "local" && target.kind === "local") {
    return "local-copy";
  }
  if (source.kind === "local") {
    if (target.preferredProtocol === "tar") {
      return "tar-upload";
    }
    if (target.preferredProtocol !== "sftp") {
      return "scp-upload";
    }
    return "sftp-upload";
  }
  if (target.kind === "local") {
    if (source.preferredProtocol === "tar") {
      return "tar-download";
    }
    if (source.preferredProtocol !== "sftp") {
      return "scp-download";
    }
    return "sftp-download";
  }
  if (source.connection && target.connection && isSameSshConnection(source.connection, target.connection)) {
    return "remote-copy";
  }
  return transferAttemptToStrategy(resolveTransferPlan({ source, target, itemCount: 1 }).attempts[0]);
}
function transferAttemptToStrategy(attempt) {
  if (!attempt) {
    return "scp-direct";
  }
  if (attempt.route === "direct") {
    switch (attempt.protocol) {
      case "rsync":
        return "rsync-direct";
      case "tar":
        return "tar-direct";
      case "sftp":
        return "sftp-direct";
      case "scp":
        return "scp-direct";
    }
  }
  if (attempt.route === "relay") {
    switch (attempt.protocol) {
      case "rsync":
        return "rsync-relay";
      case "tar":
        return "tar-relay";
      case "sftp":
        return "sftp-relay";
      case "scp":
        return "scp-relay";
    }
  }
  switch (attempt.protocol) {
    case "rsync":
      return "rsync-upload";
    case "tar":
      return "tar-upload";
    case "sftp":
      return "sftp-upload";
    case "scp":
      return "scp-upload";
  }
}
function transferAttemptToDirectionalStrategy(source, target, attempt) {
  if (!attempt || attempt.route !== "local" || target.kind !== "local") {
    return transferAttemptToStrategy(attempt);
  }
  switch (attempt.protocol) {
    case "rsync":
      return "rsync-download";
    case "tar":
      return "tar-download";
    case "sftp":
      return "sftp-download";
    case "scp":
      return source.kind === "ssh" ? "scp-download" : "scp-upload";
  }
}
function getSshToSshTransferProtocol(source) {
  return source.preferredProtocol ?? "auto-fast";
}
function formatTransferStrategyName(strategy) {
  return strategy.replace(/-/g, " ");
}
function formatTransferError(error) {
  return error instanceof Error ? error.message : String(error);
}
function canBatchRsyncPreserveTargetNames(items) {
  return items.every((item) => item.targetName === getTransferName(item.sourcePath));
}
function getLocalCommandTransferProtocolOrder(preferredProtocol, connection) {
  if (preferredProtocol === "auto-fast" || preferredProtocol === void 0) {
    return ["scp"];
  }
  if (preferredProtocol === "rsync") {
    return ["scp"];
  }
  if (preferredProtocol === "scp") {
    return ["scp"];
  }
  return preferredProtocol === "sftp" ? [] : ["scp"];
}
function getDirectoryLocalCommandTransferProtocolOrder(preferredProtocol) {
  if (preferredProtocol === "rsync") {
    return ["rsync", "scp"];
  }
  if (preferredProtocol === "scp") {
    return ["scp"];
  }
  if (preferredProtocol === "sftp") {
    return [];
  }
  return [];
}
function shouldPreferTarForMultiItemTransfer(preferredProtocol) {
  return preferredProtocol === void 0 || preferredProtocol === "auto-fast" || preferredProtocol === "tar";
}
function shouldUseTarOnlyForBatchTransfer(request) {
  if (request.source.kind === "local" && request.targetDirectory.kind === "ssh") {
    return shouldPreferTarForMultiItemTransfer(request.targetDirectory.preferredProtocol);
  }
  if (request.source.kind === "ssh" && request.targetDirectory.kind === "local") {
    return shouldPreferTarForMultiItemTransfer(request.source.preferredProtocol);
  }
  if (request.source.kind === "ssh" && request.targetDirectory.kind === "ssh") {
    return shouldPreferTarForMultiItemTransfer(getSshToSshTransferProtocol(request.source));
  }
  return false;
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
    "-T",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "Compression=no",
    "-o",
    "IPQoS=throughput",
    "-o",
    "RekeyLimit=16G",
    "-o",
    "ConnectTimeout=5",
    "-o",
    "ConnectionAttempts=1",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=2",
    "-o",
    "LogLevel=ERROR"
  ];
  let env = tool.env;
  const askPassSecret = connection.password ?? connection.passphrase;
  if (askPassSecret) {
    tempPasswordPath = join(tmpdir(), `turbofile-native-ssh-${randomUUID()}.secret`);
    tempAskPassPath = join(tmpdir(), `turbofile-native-ssh-${randomUUID()}.cmd`);
    await fsp.writeFile(tempPasswordPath, askPassSecret, { mode: 384 });
    await fsp.writeFile(tempAskPassPath, `@echo off\r
type "${tempPasswordPath.replace(/"/g, '""')}"\r
`, { mode: 448 });
    env = {
      ...tool.env,
      SSH_ASKPASS: tempAskPassPath,
      SSH_ASKPASS_REQUIRE: "force",
      DISPLAY: "turbofile"
    };
    args.push("-o", "NumberOfPasswordPrompts=1");
    args.push("-o", "PreferredAuthentications=password,keyboard-interactive,publickey");
  } else {
    args.push("-o", "BatchMode=yes");
  }
  if (connection.port && connection.port !== 22) {
    args.push("-p", String(connection.port));
  }
  if (connection.privateKeyPath) {
    args.push("-i", toOpenSshLocalPath(connection.privateKeyPath));
  } else if (connection.privateKey) {
    tempPrivateKeyPath = join(tmpdir(), `turbofile-native-ssh-${randomUUID()}.key`);
    await fsp.writeFile(tempPrivateKeyPath, connection.privateKey, { mode: 384 });
    args.push("-i", toOpenSshLocalPath(tempPrivateKeyPath));
  }
  args.push(`${connection.username}@${connection.host}`, remoteCommand);
  try {
    return await task(args, env);
  } finally {
    await Promise.all([
      tempPrivateKeyPath ? fsp.rm(tempPrivateKeyPath, { force: true }).catch(() => void 0) : void 0,
      tempPasswordPath ? fsp.rm(tempPasswordPath, { force: true }).catch(() => void 0) : void 0,
      tempAskPassPath ? fsp.rm(tempAskPassPath, { force: true }).catch(() => void 0) : void 0
    ]);
  }
}
async function withNativeOpenSshScpBaseArgs(connection, task, legacyProtocol = false) {
  let tempPrivateKeyPath;
  let tempPasswordPath;
  let tempAskPassPath;
  const args = [
    ...legacyProtocol ? ["-O"] : [],
    "-q",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "Compression=no",
    "-o",
    "IPQoS=throughput",
    "-o",
    "RekeyLimit=16G",
    "-o",
    "LogLevel=ERROR"
  ];
  let env;
  const askPassSecret = connection.password ?? connection.passphrase;
  if (askPassSecret) {
    tempPasswordPath = join(tmpdir(), `turbofile-native-scp-${randomUUID()}.secret`);
    tempAskPassPath = join(tmpdir(), `turbofile-native-scp-${randomUUID()}.cmd`);
    await fsp.writeFile(tempPasswordPath, askPassSecret, { mode: 384 });
    await fsp.writeFile(tempAskPassPath, `@echo off\r
type "${tempPasswordPath.replace(/"/g, '""')}"\r
`, { mode: 448 });
    env = {
      ...process.env,
      SSH_ASKPASS: tempAskPassPath,
      SSH_ASKPASS_REQUIRE: "force",
      DISPLAY: "turbofile"
    };
    args.push("-o", "NumberOfPasswordPrompts=1");
  } else {
    args.push("-o", "BatchMode=yes");
  }
  if (connection.port && connection.port !== 22) {
    args.push("-P", String(connection.port));
  }
  if (connection.privateKeyPath) {
    args.push("-i", toOpenSshLocalPath(connection.privateKeyPath));
  } else if (connection.privateKey) {
    tempPrivateKeyPath = join(tmpdir(), `turbofile-native-scp-${randomUUID()}.key`);
    await fsp.writeFile(tempPrivateKeyPath, connection.privateKey, { mode: 384 });
    args.push("-i", toOpenSshLocalPath(tempPrivateKeyPath));
  }
  try {
    return await task(args, env);
  } finally {
    await Promise.all([
      tempPrivateKeyPath ? fsp.rm(tempPrivateKeyPath, { force: true }).catch(() => void 0) : void 0,
      tempPasswordPath ? fsp.rm(tempPasswordPath, { force: true }).catch(() => void 0) : void 0,
      tempAskPassPath ? fsp.rm(tempAskPassPath, { force: true }).catch(() => void 0) : void 0
    ]);
  }
}
function formatNativeScpRemoteSpec(connection, remotePath) {
  return `${connection.username}@${connection.host}:${remotePath}`;
}
function getNativeScpLocalDirectoryContentsPath(localPath) {
  const trimmed = localPath.replace(/[\\/]+$/g, "");
  const separator = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";
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
  if (platform() !== "win32") {
    return createLocalSshTool("ssh");
  }
  for (const candidate of getBundledLocalSshCandidates()) {
    if (await localPathExists(candidate)) {
      return createLocalSshTool(candidate);
    }
  }
  return createLocalSshTool("ssh.exe");
}
function createLocalSshTool(executable) {
  const executableDirectory = /[\\/]/.test(executable) ? dirname(executable) : void 0;
  const env = createLocalToolEnvironment(executableDirectory);
  return { executable, env };
}
function resolveLocalZstdTool() {
  localZstdToolPromise ??= doResolveLocalZstdTool();
  return localZstdToolPromise;
}
async function doResolveLocalZstdTool() {
  if (platform() !== "win32") {
    return createLocalZstdTool("zstd");
  }
  const whereOutput = await runLocalCommandBuffer("where.exe", ["zstd.exe"], 1024 * 1024);
  const executable = whereOutput.toString().split(/\r?\n/).map((line) => line.trim()).find((line) => !!line) ?? "zstd.exe";
  return createLocalZstdTool(executable);
}
function createLocalZstdTool(executable) {
  const executableDirectory = /[\\/]/.test(executable) ? dirname(executable) : void 0;
  const env = createLocalToolEnvironment(executableDirectory);
  return { executable, env };
}
function resolveLocalRsyncTool() {
  localRsyncToolPromise ??= doResolveLocalRsyncTool();
  return localRsyncToolPromise;
}
async function doResolveLocalRsyncTool() {
  if (platform() !== "win32") {
    return createLocalRsyncTool("rsync", "posix");
  }
  for (const candidate of getBundledLocalRsyncCandidates()) {
    if (await localPathExists(candidate)) {
      return createLocalRsyncTool(candidate, "cygwin");
    }
  }
  throw new Error("No such file: bundled TurboFile rsync.exe was not found.");
}
async function createLocalRsyncTool(executable, pathFlavor) {
  const executableDirectory = /[\\/]/.test(executable) ? dirname(executable) : void 0;
  const sshCandidate = executableDirectory ? join(executableDirectory, "ssh.exe") : void 0;
  const sshExecutable = sshCandidate && await localPathExists(sshCandidate) ? sshCandidate : void 0;
  const env = createLocalToolEnvironment(executableDirectory);
  if (executableDirectory) {
    env.CWRSYNCHOME ??= executableDirectory;
  }
  return { executable, sshExecutable, pathFlavor, env };
}
function createLocalToolEnvironment(executableDirectory) {
  const env = { ...process.env };
  if (executableDirectory) {
    const pathDelimiter = platform() === "win32" ? ";" : ":";
    env.PATH = [executableDirectory, env.PATH].filter((value) => !!value).join(pathDelimiter);
  }
  if (platform() === "win32" && env.USERPROFILE) {
    env.HOME = env.USERPROFILE;
  }
  env.LC_ALL ??= "C";
  env.LANG ??= "C";
  return env;
}
function getBundledLocalRsyncCandidates() {
  const relativePath = join("resources", "turbofile", "rsync", "win32", "rsync.exe");
  const appPath = safeGetElectronAppPath();
  const cwd = process.cwd();
  const roots = [
    appPath,
    join(appPath, "out"),
    dirname(appPath),
    process.resourcesPath,
    process.resourcesPath ? join(process.resourcesPath, "app") : void 0,
    cwd,
    join(cwd, "out"),
    dirname(cwd)
  ].filter((value) => !!value);
  return [...new Set(roots.map((root) => join(root, relativePath)))];
}
function getBundledLocalSshCandidates() {
  return getBundledLocalRsyncCandidates().map((candidate) => join(dirname(candidate), "ssh.exe"));
}
function safeGetElectronAppPath() {
  try {
    return app.getAppPath();
  } catch {
    return process.cwd();
  }
}
async function localPathExists(path) {
  try {
    await fsp.access(path);
    return true;
  } catch {
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
      await fsp.writeFile(tempPrivateKeyPath, connection.privateKey.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n?$/, "\n"), { mode: 384 });
      await fsp.chmod(tempPrivateKeyPath, 384).catch(() => void 0);
    }
    if (!askPassSecret) {
      return await task(tool.env, tempPrivateKeyPath);
    }
    const isWindowsHost = platform() === "win32";
    tempPasswordPath = join(tmpdir(), `turbofile-rsync-${randomUUID()}.secret`);
    tempAskPassPath = join(tmpdir(), `turbofile-rsync-${randomUUID()}${isWindowsHost ? ".cmd" : ".sh"}`);
    await fsp.writeFile(tempPasswordPath, askPassSecret, { mode: 384 });
    if (isWindowsHost) {
      await fsp.writeFile(tempAskPassPath, `@echo off\r
type "${tempPasswordPath.replace(/"/g, '""')}"\r
`, { mode: 448 });
    } else {
      await fsp.writeFile(tempAskPassPath, `#!/bin/sh
cat ${quotePosixShellArg(tempPasswordPath)}
`, { mode: 448 });
    }
    await fsp.chmod(tempAskPassPath, 448).catch(() => void 0);
    return await task({
      ...tool.env,
      SSH_ASKPASS: isWindowsHost ? tempAskPassPath : toRsyncLocalPath(tempAskPassPath, tool.pathFlavor),
      SSH_ASKPASS_REQUIRE: "force",
      DISPLAY: "turbofile"
    }, tempPrivateKeyPath);
  } finally {
    await Promise.all([
      tempPrivateKeyPath ? fsp.rm(tempPrivateKeyPath, { force: true }).catch(() => void 0) : void 0,
      tempPasswordPath ? fsp.rm(tempPasswordPath, { force: true }).catch(() => void 0) : void 0,
      tempAskPassPath ? fsp.rm(tempAskPassPath, { force: true }).catch(() => void 0) : void 0
    ]);
  }
}
function buildLocalRsyncSshTransport(connection, sshExecutable, identityPathOverride) {
  const hasAskPassSecret = !!(connection.password ?? connection.passphrase);
  const parts = [
    formatLocalRsyncCommand(sshExecutable ?? "ssh"),
    "-T",
    "-F /dev/null",
    "-o StrictHostKeyChecking=accept-new",
    "-o UserKnownHostsFile=/dev/null",
    "-o Compression=no",
    "-o LogLevel=ERROR",
    "-o ConnectTimeout=8",
    "-o ConnectionAttempts=1",
    "-o ServerAliveInterval=15",
    "-o ServerAliveCountMax=2"
  ];
  if (hasAskPassSecret) {
    parts.push("-o BatchMode=no");
    parts.push("-o NumberOfPasswordPrompts=1");
    parts.push("-o PreferredAuthentications=password,keyboard-interactive,publickey");
  } else {
    parts.push("-o BatchMode=yes");
  }
  const identityPath = identityPathOverride ?? connection.privateKeyPath;
  if (identityPath) {
    const formattedIdentityPath = sshExecutable ? toRsyncLocalPath(identityPath) : toOpenSshLocalPath(identityPath);
    parts.push(`-i ${quoteLocalShellArg(formattedIdentityPath)}`);
  }
  if (connection.port && connection.port !== 22) {
    parts.push(`-p ${connection.port}`);
  }
  return parts.join(" ");
}
function formatLocalRsyncCommand(command) {
  return /[\\/]/.test(command) ? quoteLocalShellArg(toRsyncLocalPath(command)) : command;
}
function formatRsyncRemoteSpec(connection, remotePath) {
  return `${connection.username}@${connection.host}:${remotePath}`;
}
function toRsyncLocalPath(path, flavor = "cygwin") {
  const normalized = path.replace(/\\/g, "/");
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (driveMatch) {
    if (flavor === "posix") {
      return normalized;
    }
    const drive = driveMatch[1].toLowerCase();
    return `/cygdrive/${drive}/${driveMatch[2]}`;
  }
  return normalized;
}
function toOpenSshLocalPath(path) {
  return path.replace(/\\/g, "/");
}
function normalizeTarListPath(path) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
function quoteLocalShellArg(value) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
function getDirectSshRouteCacheKey(source, target) {
  return `${getSshConnectionRouteKey(source)}=>${getSshConnectionRouteKey(target)}`;
}
function getDirectSshRouteFailureKey(cacheKey, route) {
  return `${cacheKey}:${route}`;
}
function getSshConnectionRouteKey(connection) {
  const auth = connection.password ? "password" : connection.privateKeyPath || connection.privateKey ? "privateKey" : "agent";
  return `${connection.username}@${connection.host}:${connection.port || 22}:${auth}`;
}
function getFileTypeFromStats(stats) {
  return stats.isDirectory() ? "directory" : stats.isFile() ? "file" : stats.isSymbolicLink() ? "symlink" : "unknown";
}
function joinRemotePath(parentPath, name) {
  if (!parentPath || parentPath === "/") {
    return `/${name}`;
  }
  const separator = parentPath.includes("\\") && !parentPath.includes("/") ? "\\" : "/";
  return parentPath.endsWith("/") || parentPath.endsWith("\\") ? `${parentPath}${name}` : `${parentPath}${separator}${name}`;
}
function getRemoteParentPath(path) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized || normalized === "/") {
    return "/";
  }
  const index = normalized.lastIndexOf("/");
  if (index < 0) {
    return ".";
  }
  if (index === 0) {
    return "/";
  }
  return normalized.substring(0, index);
}
function buildShellBootstrapCommand(cwd) {
  const commands = [
    "stty echo",
    'printf "\\033[H\\033[2J\\033[3J"',
    cwd ? `cd ${quotePosixShellArg(cwd)} 2>/dev/null || true` : void 0,
    `printf "\\n${SSH_TERMINAL_READY_MARKER}\\n"`
  ].filter((command) => !!command);
  return `${commands.join("; ")}
`;
}
function ensureTrailingRemoteSlash(path) {
  return path.endsWith("/") || path.endsWith("\\") ? path : `${path}/`;
}
function trimTrailingRemoteSlash(path) {
  const trimmed = path.replace(/[\\/]+$/g, "");
  return trimmed || "/";
}
function getRemoteDirectoryFallbackPaths(options, path) {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  const username = options.username;
  const candidates = [];
  const add = (candidate) => {
    const value = candidate.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
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
function collectBatchTarTargetNames(plans) {
  const targetNames = [];
  for (const plan of plans) {
    targetNames.push(...plan.targetNames);
  }
  return targetNames;
}
function getTransferName(path) {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (slash >= 0) {
    return path.substring(slash + 1);
  }
  return basename(path);
}
function quotePosixShellArg(value) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
function normalizeTransferDependencies(packages) {
  const allowed = /* @__PURE__ */ new Set(["rsync", "sshpass"]);
  const normalized = [];
  for (const pkg of packages) {
    if (allowed.has(pkg) && !normalized.includes(pkg)) {
      normalized.push(pkg);
    }
  }
  return normalized;
}
function getMissingTransferDependencies(packages, capabilities) {
  return packages.filter((pkg) => pkg === "rsync" ? !capabilities.rsync : !capabilities.sshpass);
}
function buildTransferDependencyInstallCommand(packages, options) {
  const packageArgs = packages.map((pkg) => quotePosixShellArg(pkg)).join(" ");
  const installScript = [
    "set -e",
    `packages="${packages.join(" ")}"`,
    'if command -v apt-get >/dev/null 2>&1; then export DEBIAN_FRONTEND=noninteractive; apt-get update && apt-get install -y "$@"',
    'elif command -v dnf >/dev/null 2>&1; then dnf install -y "$@"',
    'elif command -v yum >/dev/null 2>&1; then yum install -y "$@"',
    'elif command -v pacman >/dev/null 2>&1; then pacman -Sy --noconfirm "$@"',
    'elif command -v zypper >/dev/null 2>&1; then zypper --non-interactive install "$@"',
    'elif command -v apk >/dev/null 2>&1; then apk add --no-cache "$@"',
    'else echo "\u672A\u627E\u5230\u652F\u6301\u7684\u5305\u7BA1\u7406\u5668\uFF0C\u8BF7\u624B\u52A8\u5B89\u88C5 rsync \u548C sshpass\u3002" >&2; exit 42',
    "fi"
  ].join("; ");
  const installViaRoot = `sh -c ${quotePosixShellArg(installScript)} sh ${packageArgs}`;
  const installViaPasswordSudo = options.password ? ` || (printf %s ${quotePosixShellArg(`${options.password}
`)} | sudo -S -p '' sh -c ${quotePosixShellArg(installScript)} sh ${packageArgs})` : "";
  return [
    'if [ "$(id -u)" -eq 0 ]; then',
    installViaRoot,
    "; elif command -v sudo >/dev/null 2>&1; then",
    `(sudo -n sh -c ${quotePosixShellArg(installScript)} sh ${packageArgs})${installViaPasswordSudo}`,
    '; else echo "\u5F53\u524D\u7528\u6237\u4E0D\u662F root\uFF0C\u4E14\u8FDC\u7AEF\u6CA1\u6709 sudo\uFF0C\u65E0\u6CD5\u81EA\u52A8\u5B89\u88C5\u3002" >&2; exit 43; fi'
  ].join(" ");
}
function buildTarCreateFromDirectoryCommand(path) {
  return `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(path)} .`;
}
function buildTarCreateFromItemsCommand(parentPath, names) {
  const itemArgs = names.map((name) => quotePosixShellArg(name)).join(" ");
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
  const cleanupTargets = targetNames.map((name) => quotePosixShellArg(joinRemotePath(targetDirectory, name))).join(" ");
  const cleanup = cleanupTargets ? `rm -rf -- ${cleanupTargets} && ` : "";
  return `command -v tar >/dev/null 2>&1 && mkdir -p -- ${target} && ${cleanup}tar -xf - -C ${target}`;
}
function buildPrepareTarExtractToDirectoryFromListCommand(targetDirectory, requireZstd) {
  const target = quotePosixShellArg(targetDirectory);
  const commands = [
    "set -e",
    "command -v tar >/dev/null 2>&1",
    requireZstd ? "command -v zstd >/dev/null 2>&1" : void 0,
    `target=${target}`,
    'mkdir -p -- "$target"',
    `while IFS= read -r -d '' name; do if [ -n "$name" ]; then rm -rf -- "$target/$name"; fi; done`
  ].filter((command) => !!command);
  return `bash -lc ${quotePosixShellArg(commands.join("; "))}`;
}
function buildTarSourcePushCommand(sourcePath, targetPath, targetUserHost, sshCommand, sshpassPrefix) {
  const prepareTarget = `rm -rf -- ${quotePosixShellArg(targetPath)} && mkdir -p -- ${quotePosixShellArg(targetPath)} && command -v tar >/dev/null 2>&1`;
  const extractTarget = `tar -xf - -C ${quotePosixShellArg(targetPath)}`;
  const remoteShell = `${sshpassPrefix}${sshCommand} ${quotePosixShellArg(targetUserHost)}`;
  return `command -v tar >/dev/null 2>&1 && ${remoteShell} ${quotePosixShellArg(prepareTarget)} && tar -cf - -C ${quotePosixShellArg(sourcePath)} . | ${remoteShell} ${quotePosixShellArg(extractTarget)}`;
}
function buildTarItemsSourcePushCommand(parentPath, names, targetDirectory, targetNames, targetUserHost, sshCommand, sshpassPrefix) {
  const target = quotePosixShellArg(targetDirectory);
  const cleanupTargets = targetNames.map((name) => quotePosixShellArg(joinRemotePath(targetDirectory, name))).join(" ");
  const cleanup = cleanupTargets ? `rm -rf -- ${cleanupTargets} && ` : "";
  const prepareTarget = `command -v tar >/dev/null 2>&1 && mkdir -p -- ${target} && ${cleanup}true`;
  const extractTarget = `tar -xf - -C ${target}`;
  const remoteShell = `${sshpassPrefix}${sshCommand} ${quotePosixShellArg(targetUserHost)}`;
  return `${remoteShell} ${quotePosixShellArg(prepareTarget)} && ${buildTarCreateFromItemsCommand(parentPath, names)} | ${remoteShell} ${quotePosixShellArg(extractTarget)}`;
}
function buildTarTargetPullCommand(sourcePath, targetPath, sourceUserHost, sshCommand, sshpassPrefix) {
  const createSource = `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(sourcePath)} .`;
  return `command -v tar >/dev/null 2>&1 && rm -rf -- ${quotePosixShellArg(targetPath)} && mkdir -p -- ${quotePosixShellArg(targetPath)} && ${sshpassPrefix}${sshCommand} ${quotePosixShellArg(sourceUserHost)} ${quotePosixShellArg(createSource)} | tar -xf - -C ${quotePosixShellArg(targetPath)}`;
}
function buildTarItemsTargetPullCommand(parentPath, names, targetDirectory, targetNames, sourceUserHost, sshCommand, sshpassPrefix) {
  const target = quotePosixShellArg(targetDirectory);
  const cleanupTargets = targetNames.map((name) => quotePosixShellArg(joinRemotePath(targetDirectory, name))).join(" ");
  const cleanup = cleanupTargets ? `rm -rf -- ${cleanupTargets} && ` : "";
  const createSource = buildTarCreateFromItemsCommand(parentPath, names);
  return `command -v tar >/dev/null 2>&1 && mkdir -p -- ${target} && ${cleanup}${sshpassPrefix}${sshCommand} ${quotePosixShellArg(sourceUserHost)} ${quotePosixShellArg(createSource)} | tar -xf - -C ${target}`;
}
function waitForLocalProcessClose(child, context) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${context} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}
function createProgressPassThrough(onDelta) {
  const stream = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });
  if (onDelta) {
    stream.on("data", (chunk) => {
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
  if (child.pid && platform() === "win32") {
    execFile("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true }, () => void 0);
    return;
  }
  child.kill("SIGTERM");
}
function runLocalCommandBuffer(command, args, maxBuffer = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, maxBuffer, encoding: "buffer" }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(formatLocalCommandError(stderr?.toString(), error.message)));
        return;
      }
      resolve(stdout);
    });
  });
}
function formatLocalCommandError(stderr, fallback) {
  const message = (stderr ?? "").trim();
  if (!message) {
    return fallback;
  }
  if (message.startsWith("#< CLIXML") && message.includes("System.Management.Automation.PSCustomObject")) {
    return fallback;
  }
  return message;
}
function runLocalPowerShellScript(script) {
  return runLocalCommand("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShellCommand(script)]);
}
function runLocalPowerShellStaScriptBuffer(script, maxBuffer = 10 * 1024 * 1024) {
  return runLocalCommandBuffer("powershell.exe", ["-NoProfile", "-STA", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShellCommand(script)], maxBuffer);
}
function createWindowsDragIcon() {
  const icon = nativeImage.createFromDataURL(WINDOWS_DRAG_ICON_DATA_URL);
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}
async function getWindowsExplorerVisibleLocalNames(path) {
  if (platform() !== "win32") {
    return void 0;
  }
  try {
    const stdout = await runLocalCommandBuffer("cmd.exe", ["/d", "/u", "/c", "dir", "/b", "/a:-h-s", path], 64 * 1024 * 1024);
    return new Set(stdout.toString("utf16le").replace(/^\uFEFF/, "").split(/\r?\n/).filter((name) => !!name));
  } catch {
    return void 0;
  }
}
function runLocalRobocopyCommand(args) {
  return runLocalRobocopyCommandBuffer(args).then(() => void 0);
}
function runLocalRobocopyCommandBuffer(args) {
  return new Promise((resolve, reject) => {
    execFile("robocopy.exe", args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) {
        resolve(stdout);
        return;
      }
      const exitCode = typeof error.code === "number" ? error.code : Number.NaN;
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
  const normalized = path.replace(/[\\/]+$/, "");
  return !normalized || normalized === "/" || normalized === "\\" || /^[A-Za-z]:$/.test(normalized) || /^\\\\[^\\]+\\[^\\]+$/.test(normalized);
}
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function isSameSshConnection(left, right) {
  return left.host === right.host && (left.port || 22) === (right.port || 22) && left.username === right.username;
}
function buildOptimizedRsyncSshCommand(port, hasPassword = false, sshBinary = "ssh") {
  const parts = [
    sshBinary,
    "-T",
    "-o Compression=no",
    "-o Ciphers=aes128-ctr",
    "-o ConnectTimeout=5",
    "-o ConnectionAttempts=1",
    "-o NumberOfPasswordPrompts=1",
    "-o ServerAliveInterval=15",
    "-o ServerAliveCountMax=2",
    "-o StrictHostKeyChecking=no",
    "-o UserKnownHostsFile=/dev/null",
    "-o LogLevel=ERROR",
    "-o MACs=umac-64@openssh.com",
    "-o ControlMaster=auto",
    "-o ControlPersist=300",
    "-o ControlPath=/tmp/turbofile-ssh-%r@%h:%p"
  ];
  if (hasPassword) {
    parts.push("-o BatchMode=no");
    parts.push("-o PreferredAuthentications=password,keyboard-interactive,publickey");
  } else {
    parts.push("-o BatchMode=yes");
  }
  if (port && port !== 22) {
    parts.push(`-p ${port}`);
  }
  return parts.join(" ");
}
function buildOptimizedSftpCommand(port, hasPassword = false) {
  const parts = [
    "sftp",
    "-q",
    "-b -",
    "-o Compression=no",
    "-o ConnectTimeout=5",
    "-o ConnectionAttempts=1",
    "-o NumberOfPasswordPrompts=1",
    "-o ServerAliveInterval=15",
    "-o ServerAliveCountMax=2",
    "-o StrictHostKeyChecking=no",
    "-o UserKnownHostsFile=/dev/null",
    "-o LogLevel=ERROR"
  ];
  if (hasPassword) {
    parts.push("-o BatchMode=no");
    parts.push("-o PreferredAuthentications=password,keyboard-interactive,publickey");
  } else {
    parts.push("-o BatchMode=yes");
  }
  if (port && port !== 22) {
    parts.push(`-P ${port}`);
  }
  return parts.join(" ");
}
function shouldPreferLegacyScpMode(connection) {
  return !!connection.port && connection.port !== 22;
}
function buildDirectScpCommand(port, hasPassword = false, identityPath, recursive = false) {
  const parts = [
    "scp",
    "-q",
    "-o Compression=no",
    "-o IPQoS=throughput",
    "-o RekeyLimit=16G",
    "-o ConnectTimeout=5",
    "-o ConnectionAttempts=1",
    "-o NumberOfPasswordPrompts=1",
    "-o ServerAliveInterval=15",
    "-o ServerAliveCountMax=2",
    "-o StrictHostKeyChecking=no",
    "-o UserKnownHostsFile=/dev/null",
    "-o LogLevel=ERROR"
  ];
  if (hasPassword) {
    parts.push("-o BatchMode=no");
    parts.push("-o PreferredAuthentications=password,keyboard-interactive,publickey");
  } else {
    parts.push("-o BatchMode=yes");
  }
  if (identityPath) {
    parts.push(`-i ${quotePosixShellArg(identityPath)}`);
  }
  if (recursive) {
    parts.push("-r");
  }
  if (port && port !== 22) {
    parts.push(`-P ${port}`);
  }
  return parts.join(" ");
}
function buildDirectScpSshCommand(port, hasPassword = false, identityPath) {
  const parts = [
    "ssh",
    "-o Compression=no",
    "-o IPQoS=throughput",
    "-o RekeyLimit=16G",
    "-o ConnectTimeout=5",
    "-o ConnectionAttempts=1",
    "-o NumberOfPasswordPrompts=1",
    "-o ServerAliveInterval=15",
    "-o ServerAliveCountMax=2",
    "-o StrictHostKeyChecking=no",
    "-o UserKnownHostsFile=/dev/null",
    "-o LogLevel=ERROR"
  ];
  if (hasPassword) {
    parts.push("-o BatchMode=no");
    parts.push("-o PreferredAuthentications=password,keyboard-interactive,publickey");
  } else {
    parts.push("-o BatchMode=yes");
  }
  if (identityPath) {
    parts.push(`-i ${quotePosixShellArg(identityPath)}`);
  }
  if (port && port !== 22) {
    parts.push(`-p ${port}`);
  }
  return parts.join(" ");
}
function buildCompatibleSshCommand(port, hasPassword = false) {
  const parts = [
    "ssh",
    "-o Compression=no",
    "-o ConnectTimeout=5",
    "-o ConnectionAttempts=1",
    "-o NumberOfPasswordPrompts=1",
    "-o ServerAliveInterval=15",
    "-o ServerAliveCountMax=2",
    "-o StrictHostKeyChecking=no",
    "-o UserKnownHostsFile=/dev/null",
    "-o LogLevel=ERROR"
  ];
  if (hasPassword) {
    parts.push("-o BatchMode=no");
    parts.push("-o PreferredAuthentications=password,keyboard-interactive,publickey");
  } else {
    parts.push("-o BatchMode=yes");
  }
  if (port && port !== 22) {
    parts.push(`-p ${port}`);
  }
  return parts.join(" ");
}
function buildSshpassPrefix(password) {
  return password ? `sshpass -p ${quotePosixShellArg(password)} ` : "";
}
function quoteSftpBatchPath(value) {
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}
function quotePowerShellLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}
function encodePowerShellCommand(script) {
  return Buffer.from(script, "utf16le").toString("base64");
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
function buildLocalWindowsBatchScript(sourcePaths, targetDirectory, operation) {
  const sources = sourcePaths.map((path) => quotePowerShellLiteral(path)).join(",");
  const target = quotePowerShellLiteral(targetDirectory);
  const command = operation === "move" ? "Move-Item" : "Copy-Item";
  const recurse = operation === "copy" ? " -Recurse" : "";
  return withPowerShellDefaults(`$srcs=@(${sources}); $dst=${target}; if (-not (Test-Path -LiteralPath $dst)) { New-Item -ItemType Directory -Force -Path $dst | Out-Null }; foreach ($src in $srcs) { ${command} -LiteralPath $src -Destination $dst -Force${recurse} }`);
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
function buildPosixCopyCommand(sourcePath, targetPath) {
  const source = quotePosixShellArg(sourcePath);
  const target = quotePosixShellArg(targetPath);
  const parent = quotePosixShellArg(getRemoteParentPath(targetPath));
  return `mkdir -p ${parent} && (cp -a --reflink=auto --sparse=always ${source} ${target} 2>/dev/null || cp -a ${source} ${target})`;
}
function buildWindowsBatchCommand(sourcePaths, targetDirectory, operation) {
  const sources = sourcePaths.map((path) => quotePowerShellLiteral(path)).join(",");
  const target = quotePowerShellLiteral(targetDirectory);
  const command = operation === "move" ? "Move-Item" : "Copy-Item";
  const recurse = operation === "copy" ? " -Recurse" : "";
  return buildPowerShellCommand(withPowerShellDefaults(`$srcs=@(${sources}); $dst=${target}; if (-not (Test-Path -LiteralPath $dst)) { New-Item -ItemType Directory -Force -Path $dst | Out-Null }; foreach ($src in $srcs) { ${command} -LiteralPath $src -Destination $dst -Force${recurse} }`));
}
function buildWindowsBatchDeleteCommand(sourcePaths) {
  const sources = sourcePaths.map((path) => quotePowerShellLiteral(path)).join(",");
  return buildPowerShellCommand(withPowerShellDefaults(`$srcs=@(${sources}); foreach ($src in $srcs) { if (Test-Path -LiteralPath $src) { Remove-Item -LiteralPath $src -Force -Recurse } }`));
}
function buildLocalWindowsReverseParallelRsyncCommand(sourceConnection, items, sshTransport, cleanupTargets) {
  const rsyncOptions = [...buildLocalRsyncOptionArgs(true), "--iconv=UTF-8,UTF-8"].join(" ");
  const sshpassPrefix = buildSshpassPrefix(sourceConnection.password);
  const sourceUserHost = `${sourceConnection.username}@${sourceConnection.host}`;
  const commands = items.map((item, index) => {
    const sourcePath = item.directory ? ensureTrailingRemoteSlash(item.sourcePath) : item.sourcePath;
    const targetPath = item.directory ? ensureTrailingRemoteSlash(item.targetPath) : ensureTrailingRemoteSlash(getRemoteParentPath(item.targetPath));
    const mkdirPath = item.directory ? item.targetPath : getRemoteParentPath(item.targetPath);
    const sourceSpec = `${sourceUserHost}:${sourcePath}`;
    const rsyncCommand = `${sshpassPrefix}rsync ${rsyncOptions} -e ${quotePosixShellArg(sshTransport)} ${quotePosixShellArg(sourceSpec)} ${quotePosixShellArg(targetPath)}`;
    const progressTag = quotePosixShellArg(`__TURBOFILE_RSYNC_${index}__ `);
    const progressFilter = `tr '\\r' '\\n' | awk -v tag=${progressTag} ${quotePosixShellArg("$0 ~ /%/ { now=systime(); if (now != last || $0 ~ /100%/) { print tag $0; fflush(); last=now } }")}`;
    return `(mkdir -p -- ${quotePosixShellArg(mkdirPath)} && ${rsyncCommand} 2>&1 | ${progressFilter}) & pids="$pids $!"`;
  });
  const cleanupTargetArgs = Array.from(new Set(cleanupTargets.map((target) => trimTrailingRemoteSlash(target)).filter((target) => target && target !== "/"))).map((target) => quotePosixShellArg(target)).join(" ");
  const script = [
    "set -o pipefail",
    "command -v rsync >/dev/null 2>&1",
    "command -v sshpass >/dev/null 2>&1",
    cleanupTargetArgs ? `rm -rf -- ${cleanupTargetArgs}` : void 0,
    'pids=""',
    ...commands,
    "failed=0",
    'for pid in $pids; do if ! wait "$pid"; then failed=1; fi; done',
    'if [ "$failed" -ne 0 ]; then exit 1; fi'
  ].filter((command) => !!command);
  return `bash -lc ${quotePosixShellArg(script.join("; "))}`;
}
function getLocalWindowsRsyncConfigPaths() {
  const candidates = [
    process.env.TURBOFILE_LOCAL_WINDOWS_CONFIG,
    process.env.TURBOFILE_WEB_CONFIG,
    join(process.cwd(), "..", "TurboFile-web", "data", "config.json"),
    join(app.getAppPath(), "..", "TurboFile-web", "data", "config.json")
  ].filter((value) => !!value);
  return Array.from(new Set(candidates));
}
function getLocalIpv4Addresses() {
  const addresses = /* @__PURE__ */ new Set();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.add(entry.address);
      }
    }
  }
  return addresses;
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function readStringProperty(source, key) {
  const value = source[key];
  return typeof value === "string" && value ? value : void 0;
}
function readNumberProperty(source, key) {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  return void 0;
}
function buildRsyncOptions(includeProgress) {
  return buildLocalRsyncOptionArgs(includeProgress).join(" ");
}
function parseRsyncSpeedBytesPerSecond(value, unit) {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return void 0;
  }
  const normalizedUnit = unit.toUpperCase();
  const multiplier = normalizedUnit === "P" ? 1024 ** 5 : normalizedUnit === "T" ? 1024 ** 4 : normalizedUnit === "G" ? 1024 ** 3 : normalizedUnit === "M" ? 1024 ** 2 : normalizedUnit === "K" ? 1024 : 1;
  return Math.max(0, Math.round(parsed * multiplier));
}
function buildLocalRsyncOptionArgs(includeProgress) {
  const options = [
    "-a",
    "--inplace",
    "--whole-file",
    "--no-compress",
    "--numeric-ids",
    "--timeout=600",
    "-s",
    "--no-perms",
    "--no-owner",
    "--no-group",
    "--omit-dir-times"
  ];
  if (includeProgress) {
    options.push("--info=progress2", "--outbuf=N");
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
  const recurseFlag = recursive ? " -Recurse" : "";
  return `powershell -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $path='${literalPath}'; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force${recurseFlag} }"`;
}
function buildWindowsDeleteManyCommand(paths, recursive) {
  const list = paths.map((path) => `'${path.replace(/'/g, "''")}'`).join(",");
  const recurseFlag = recursive ? " -Recurse" : "";
  return `powershell -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; foreach ($p in @(${list})) { if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force${recurseFlag} } }"`;
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
function buildPosixNamesAndTypesListCommand(path) {
  const quotedPath = quotePosixShellArg(path);
  return `LC_ALL=C find ${quotedPath} -mindepth 1 -maxdepth 1 -printf '%f\\0%y\\0'`;
}
function buildPosixStatEntriesCommand(directoryPath, names) {
  return buildRemotePosixStatEntriesCommand(directoryPath, names);
}
function parseRemoteStatEntries(text) {
  if (!text) {
    return [];
  }
  const parts = text.split("\0");
  const stats = [];
  for (let index = 0; index + 2 < parts.length; index += 3) {
    const rawName = parts[index];
    if (!rawName) {
      continue;
    }
    const name = rawName.replace(/^\.\//, "").replace(/\r?\n$/, "");
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
      modified: Number.isFinite(modifiedSeconds) ? Math.floor(modifiedSeconds) * 1e3 : 0
    });
  }
  return stats;
}
function parseSizeCommandOutput(output) {
  const match = output.trim().match(/\d+/);
  if (!match) {
    throw new Error(`Unable to parse path size: ${output.trim() || "empty output"}`);
  }
  const size = Number(match[0]);
  if (!Number.isFinite(size)) {
    throw new Error(`Invalid path size: ${match[0]}`);
  }
  return size;
}
function buildPosixReadImagesBatchCommand(paths, maxBytes, maxWidth) {
  const list = paths.map((path) => quotePosixShellArg(path)).join(" ");
  const forceRaw = !maxWidth || maxWidth <= 0;
  const width = Math.max(96, Math.floor(maxWidth) || 480);
  const rawPassthrough = 768 * 1024;
  const tiffWidth = forceRaw ? 0 : width;
  const lines = [];
  lines.push(`if command -v vipsthumbnail >/dev/null 2>&1; then T=vips`);
  lines.push(`elif command -v magick >/dev/null 2>&1; then T=magick`);
  lines.push(`elif command -v convert >/dev/null 2>&1; then T=convert`);
  lines.push(`else T=; fi`);
  lines.push(`emit(){ if [ "$2" -le ${maxBytes} ]; then printf '%s\\n%s\\n' "$1" "$2"; cat "$1"; else printf '%s\\n-1\\n' "$1"; fi; }`);
  lines.push(`mkjpg(){ if [ "$3" -gt 0 ]; then case "$T" in vips) vipsthumbnail "$1" --size "$3x" -o "$2[Q=82,strip]" >/dev/null 2>&1;; magick|convert) "$T" "$1[0]" -resize "$3x" -strip -quality 82 jpg:"$2" >/dev/null 2>&1;; *) return 1;; esac; else case "$T" in vips) vipsthumbnail "$1" --size 30000x30000 -o "$2[Q=88,strip]" >/dev/null 2>&1;; magick|convert) "$T" "$1[0]" -strip -quality 88 jpg:"$2" >/dev/null 2>&1;; *) return 1;; esac; fi }`);
  lines.push(`tojpg(){ o=$(mktemp 2>/dev/null) || o=/tmp/tfthumb.$$; oj="$o.jpg"; if mkjpg "$1" "$oj" "$3" && [ -s "$oj" ]; then tz=$(wc -c < "$oj" 2>/dev/null | tr -d ' \\t\\n'); if [ -n "$tz" ] && [ "$tz" -le ${maxBytes} ]; then printf '%s\\n%s\\n' "$1" "$tz"; cat "$oj"; rm -f "$o" "$oj" 2>/dev/null; return 0; fi; fi; rm -f "$o" "$oj" 2>/dev/null; return 1; }`);
  lines.push(`for f in ${list}; do`);
  lines.push(`[ -f "$f" ] || continue`);
  lines.push(`sz=$(wc -c < "$f" 2>/dev/null | tr -d ' \\t\\n'); [ -n "$sz" ] || continue`);
  lines.push(`case $(printf '%s' "$f" | tr 'A-Z' 'a-z') in *.tif|*.tiff) if [ -n "$T" ] && tojpg "$f" "$sz" ${tiffWidth}; then :; else printf '%s\\n-1\\n' "$f"; fi; continue;; esac`);
  if (forceRaw) {
    lines.push(`emit "$f" "$sz"`);
  } else {
    lines.push(`if [ "$sz" -le ${rawPassthrough} ] || [ -z "$T" ]; then emit "$f" "$sz"; continue; fi`);
    lines.push(`if tojpg "$f" "$sz" ${width}; then :; else emit "$f" "$sz"; fi`);
  }
  lines.push(`done`);
  lines.push(`:`);
  return lines.join("\n");
}
function parseImageBatchOutput(buffer) {
  const entries = [];
  let position = 0;
  while (position < buffer.length) {
    const pathEnd = buffer.indexOf(10, position);
    if (pathEnd < 0) {
      break;
    }
    const path = buffer.toString("utf8", position, pathEnd);
    position = pathEnd + 1;
    const sizeEnd = buffer.indexOf(10, position);
    if (sizeEnd < 0) {
      break;
    }
    const size = parseInt(buffer.toString("utf8", position, sizeEnd), 10);
    position = sizeEnd + 1;
    if (!path) {
      break;
    }
    if (!Number.isFinite(size) || size < 0) {
      entries.push({ path, ok: false, oversized: true });
      continue;
    }
    if (position + size > buffer.length) {
      entries.push({ path, ok: false, message: "Truncated image batch stream.", transient: true });
      break;
    }
    const bytes = buffer.subarray(position, position + size);
    position += size;
    const lowerPath = path.toLowerCase();
    const mime = lowerPath.endsWith(".tif") || lowerPath.endsWith(".tiff") ? "image/jpeg" : getMimeType(path);
    entries.push({ path, ok: true, content: bytes.toString("base64"), mime });
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
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".bmp")) {
    return "image/bmp";
  }
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) {
    return "image/tiff";
  }
  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "text/html";
  }
  if (lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".log") || lower.endsWith(".csv") || lower.endsWith(".xml") || lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    return "text/plain";
  }
  return "application/octet-stream";
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
  return "";
}
function looksLikeWindowsPath(path) {
  return /^[A-Za-z]:[\\/]/.test(path);
}
function getImageSize(buffer) {
  const bmpSize = getBmpImageSize(buffer);
  if (bmpSize) {
    return bmpSize;
  }
  try {
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) {
      return void 0;
    }
    const size = image.getSize();
    if (!size.width || !size.height) {
      return void 0;
    }
    return {
      width: size.width,
      height: size.height
    };
  } catch {
    return void 0;
  }
}
function getBmpImageSize(buffer) {
  if (buffer.length < 30 || buffer[0] !== 66 || buffer[1] !== 77) {
    return void 0;
  }
  const headerSize = buffer.readUInt32LE(14);
  if (headerSize < 12) {
    return void 0;
  }
  try {
    if (headerSize === 12) {
      const width2 = buffer.readUInt16LE(18);
      const height2 = buffer.readUInt16LE(20);
      return width2 && height2 ? { width: width2, height: height2 } : void 0;
    }
    if (buffer.length < 26) {
      return void 0;
    }
    const width = Math.abs(buffer.readInt32LE(18));
    const height = Math.abs(buffer.readInt32LE(22));
    return width && height ? { width, height } : void 0;
  } catch {
    return void 0;
  }
}
function tryCreateBmpPngVariant(buffer, targetWidth, targetHeight) {
  const decoded = decodeBmpPixels(buffer);
  if (!decoded) {
    return void 0;
  }
  const outputSize = getResizedImageSize(decoded.width, decoded.height, targetWidth, targetHeight);
  const png = encodeBmpPixelsToPng(decoded, outputSize.width, outputSize.height);
  return {
    buffer: png,
    mime: "image/png",
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
  if (buffer.length < 54 || buffer[0] !== 66 || buffer[1] !== 77) {
    return void 0;
  }
  const pixelOffset = buffer.readUInt32LE(10);
  const headerSize = buffer.readUInt32LE(14);
  if (headerSize < 40 || pixelOffset >= buffer.length) {
    return void 0;
  }
  const rawWidth = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const planes = buffer.readUInt16LE(26);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  if (planes !== 1 || compression !== 0 || bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    return void 0;
  }
  const width = Math.abs(rawWidth);
  const height = Math.abs(rawHeight);
  if (!width || !height) {
    return void 0;
  }
  const bytesPerPixel = bitsPerPixel / 8;
  const rowStride = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  if (pixelOffset + rowStride * height > buffer.length) {
    return void 0;
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
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
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
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", deflateSync(rawRgbRows, { level: 1 })),
    createPngChunk("IEND", Buffer.alloc(0))
  ]);
}
function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
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
  let crc = 4294967295;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 255] ^ crc >>> 8;
  }
  return (crc ^ 4294967295) >>> 0;
}
function getPngCrcTable() {
  if (pngCrcTable) {
    return pngCrcTable;
  }
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 3988292384 ^ value >>> 1 : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  pngCrcTable = table;
  return table;
}
function assertImageBuffer(buffer, mime) {
  if (!buffer.byteLength) {
    throw new Error("Remote thumbnail command returned empty output.");
  }
  if (isProbablyImageBuffer(buffer, mime)) {
    return;
  }
  throw new Error("Remote thumbnail command did not return a decodable image.");
}
function isProbablyImageBuffer(buffer, mime) {
  if (mime === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  }
  if (mime === "image/png") {
    return buffer.length >= 8 && buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71 && buffer[4] === 13 && buffer[5] === 10 && buffer[6] === 26 && buffer[7] === 10;
  }
  if (mime === "image/webp") {
    return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  if (mime === "image/gif") {
    return buffer.length >= 6 && (buffer.toString("ascii", 0, 6) === "GIF87a" || buffer.toString("ascii", 0, 6) === "GIF89a");
  }
  return !!getImageSize(buffer);
}
function getDefaultArchivePath(path, extension) {
  return `${path}.${extension}`;
}
function getDefaultExtractDirectory(path) {
  const name = getTransferName(stripArchiveExtension(path)) || "archive";
  return joinRemotePath(getRemoteParentPath(path), name);
}
function stripArchiveExtension(path) {
  const lower = path.toLowerCase();
  for (const extension of [".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz", ".tar.zst", ".tzst", ".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"]) {
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
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
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
      candidate = `${path}_extracted${index ? index : ""}`;
    } catch {
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
  if (platform() !== "win32") {
    return getLocalPathSize(path);
  }
  try {
    const output = await runLocalRobocopyCommandBuffer(buildWindowsDirectorySizeRobocopyArgs(path, join(tmpdir(), "turbofile-size-probe")));
    return parseWindowsRobocopySizeOutput(output);
  } catch {
    return getLocalPathSize(path);
  }
}
async function getLocalBatchTargetSize(targetDirectory, targetNames) {
  let total = 0;
  for (const targetName of targetNames) {
    total += await getLocalPathSize(join(targetDirectory, targetName)).catch(() => 0);
  }
  return total;
}
async function getLocalPathTransferSize(path, expectedBytes) {
  if (expectedBytes && expectedBytes > 0) {
    return expectedBytes;
  }
  return getLocalPathSize(path);
}
function buildWindowsDirectorySizeRobocopyArgs(sourcePath, destinationPath) {
  return [
    sourcePath,
    destinationPath,
    "/L",
    "/E",
    "/BYTES",
    "/R:0",
    "/W:0",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NP",
    "/NC",
    "/NS",
    "/XJ"
  ];
}
function parseWindowsRobocopySizeOutput(output) {
  const line = output.split(/\r?\n/).find((candidate) => /^\s*Bytes\s*:/i.test(candidate));
  if (!line) {
    throw new Error(`Unable to parse robocopy size output: ${output.trim() || "empty output"}`);
  }
  const firstToken = line.slice(line.indexOf(":") + 1).trim().split(/\s+/)[0] ?? "";
  const digits = firstToken.replace(/[^\d]/g, "");
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
  if (a.type === "directory" && b.type !== "directory") {
    return -1;
  }
  if (a.type !== "directory" && b.type === "directory") {
    return 1;
  }
  return FILE_ENTRY_NAME_COLLATOR.compare(a.name, b.name);
}
function createFastDirectoryEntryStats(type, size, mtime) {
  return {
    size,
    mtime,
    isDirectory: () => type === "directory",
    isFile: () => type === "file",
    isSymbolicLink: () => type === "symlink"
  };
}
export {
  TurboFileSshMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVyYm9maWxlXFxlbGVjdHJvbi1tYWluXFx0dXJib2ZpbGVTc2hNYWluU2VydmljZS50cyJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsa0JBQWtCLG1CQUFtQixZQUFZLFlBQVksV0FBVztBQUNqRixTQUFTLFVBQVUsU0FBUyxZQUFZO0FBQ3hDLFNBQVMsbUJBQW1CLFVBQVUsY0FBYztBQUNwRCxTQUFTLFlBQVksa0JBQWtCO0FBQ3ZDLFNBQVMsVUFBVSxhQUFnQztBQUNuRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVcsa0JBQTBCO0FBQzlDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsS0FBSyxlQUFlLFdBQVcsYUFBYSxnQkFBZ0I7QUFDckUsU0FBUyxTQUFTLGFBQWE7QUFFL0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQ0FBb0MsdUNBQXVDO0FBQ3BGLFNBQVMsMEJBQTBCLHlCQUF5QixxQ0FBcUM7QUFDakcsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyxnQ0FBZ0MsMENBQTBDO0FBQ25GLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0NBQW9DLDRDQUE0QyxxQ0FBcUMsbUNBQW1DLGdDQUFnQyxpQ0FBaUMsMENBQTBDO0FBQzVRLFNBQVMscUNBQXFDO0FBRTlDLE1BQU0scUJBQXFCLEtBQUssT0FBTztBQUN2QyxNQUFNLDZCQUE2QixNQUFNLE9BQU87QUFDaEQsTUFBTSxpQ0FBaUMsSUFBSSxLQUFLO0FBR2hELE1BQU0sb0NBQW9DO0FBTzFDLE1BQU0saUNBQWlDO0FBQ3ZDLE1BQU0sbUNBQW1DO0FBR3pDLE1BQU0sOENBQThDO0FBQ3BELE1BQU0sdUNBQXVDO0FBQzdDLE1BQU0sK0JBQStCLElBQUksT0FBTztBQUNoRCxNQUFNLGlDQUFp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O0FBRUEsUUFBTSxhQUFhLEtBQUssTUFBTSxLQUFLLFFBQVEsR0FBRyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsTUFBTSxLQUFLLEVBQUUsQ0FBQyxLQUFLO0FBQy9FLFFBQU0sU0FBUyxXQUFXLFFBQVEsVUFBVSxFQUFFO0FBQzlDLE1BQUksQ0FBQyxRQUFRO0FBQ1osVUFBTSxJQUFJLE1BQU0saUNBQWlDLEtBQUssS0FBSyxDQUFDLEVBQUU7QUFBQSxFQUMvRDtBQUVBLFFBQU0sT0FBTyxPQUFPLE1BQU07QUFDMUIsTUFBSSxDQUFDLE9BQU8sU0FBUyxJQUFJLEdBQUc7QUFDM0IsVUFBTSxJQUFJLE1BQU0sMEJBQTBCLE1BQU0sRUFBRTtBQUFBLEVBQ25EO0FBRUEsU0FBTztBQUNSO0FBRUEsU0FBUyxtQkFBbUIsR0FBd0IsR0FBZ0M7QUFDbkYsTUFBSSxFQUFFLFNBQVMsZUFBZSxFQUFFLFNBQVMsYUFBYTtBQUNyRCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksRUFBRSxTQUFTLGVBQWUsRUFBRSxTQUFTLGFBQWE7QUFDckQsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLHlCQUF5QixRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUk7QUFDdkQ7QUFFQSxTQUFTLDhCQUE4QixNQUF5QixNQUFjLE9BQTJCO0FBQ3hHLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQTtBQUFBLElBQ0EsYUFBYSxNQUFNLFNBQVM7QUFBQSxJQUM1QixRQUFRLE1BQU0sU0FBUztBQUFBLElBQ3ZCLGdCQUFnQixNQUFNLFNBQVM7QUFBQSxFQUNoQztBQUNEOyIsCiAgIm5hbWVzIjogWyJwcm90b2NvbCIsICJzZXNzaW9uIiwgInRhcmdldEhhbmRsZSIsICJjb3BpZWRCeXRlcyIsICJ3aWR0aCIsICJoZWlnaHQiXQp9Cg==
