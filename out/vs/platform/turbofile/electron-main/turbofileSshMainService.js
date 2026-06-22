import { appendFileSync, createReadStream, createWriteStream, existsSync, promises as fsp } from "fs";
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
import { createLocalBatchTarPlans, createTarNullListBuffer } from "../common/turbofileBatchTarPlan.js";
import { withTurboFileTimeout } from "../common/turbofileTimeout.js";
import { resolveTransferPlan } from "../common/turbofileTransferPlan.js";
import { createWindowsDragFakeDirectoryName, createWindowsShellAssociationChangedScript, normalizeWindowsCopyHookDestination, TURBOFILE_WINDOWS_DRAG_ACTIVE_DIR, TURBOFILE_WINDOWS_DRAG_APP_DIR, TURBOFILE_WINDOWS_DRAG_ROOT_DIR, TURBOFILE_WINDOWS_DRAG_TARGETS_DIR } from "../common/turbofileWindowsDrag.js";
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
const DIRECT_SSH_ROUTE_FAILURE_COOLDOWN_MS = 10 * 60 * 1e3;
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
      this.remoteDirectoryListingCache.delete(cacheKey);
      this.disposeDirectorySftpSession(session.key);
      throw error;
    }
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
      return parseRemoteStatEntries(output.toString("utf8"));
    } catch {
      return [];
    }
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
    try {
      await this.runParallelLocalDirectoryTarUpload(localDirectory, target.connection, buildPrepareTarExtractToExactDirectoryCommand(target.path), buildTarExtractStreamToDirectoryCommand(target.path), progressId, onArchiveDelta);
      return;
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
        throw new TurboFileTransferCanceledError();
      }
    }
    try {
      await this.runParallelLocalDirectoryTarZstdUpload(localDirectory, target.connection, buildPrepareTarZstdExtractToExactDirectoryCommand(target.path), buildTarZstdExtractToDirectoryCommand(target.path), progressId, onArchiveDelta);
      return;
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
        throw new TurboFileTransferCanceledError();
      }
    }
    try {
      await this.runNativeLocalTarUpload(["-cf", "-", "-C", localDirectory, "."], target.connection, buildTarExtractToExactDirectoryCommand(target.path), progressId, onArchiveDelta);
      return;
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      throw new Error(`Native tar upload failed: ${formatTransferError(error)}`);
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
    const command = looksLikeWindowsPath(request.targetDirectory.path) || sources.some(looksLikeWindowsPath) ? buildWindowsBatchCommand(sources, request.targetDirectory.path, operation) : buildPosixBatchCommand(sources, request.targetDirectory.path, operation);
    this.markTransferDataStarted(request.progressId);
    await this.withSshClient(request.source, (client) => this.execRemote(client, command));
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
    try {
      await this.runParallelLocalBatchTarUpload(plan, targetDirectory.connection, targetDirectory.path, progressId, onArchiveDelta);
      return;
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
        throw new TurboFileTransferCanceledError();
      }
    }
    try {
      await this.runParallelLocalBatchTarZstdUpload(plan, targetDirectory.connection, targetDirectory.path, progressId, onArchiveDelta);
      return;
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
        throw new TurboFileTransferCanceledError();
      }
    }
    try {
      await this.prepareRemoteBatchTarTarget(targetDirectory.connection, targetDirectory.path, plan.targetNames, progressId, false);
      await this.runNativeLocalBatchTarUploadFromList(plan, targetDirectory.connection, buildTarExtractStreamToDirectoryCommand(targetDirectory.path), progressId, onArchiveDelta);
      return;
    } catch (error) {
      if (error instanceof TurboFileTransferCanceledError || this.isTransferCanceled(progressId)) {
        throw new TurboFileTransferCanceledError();
      }
      throw new Error(`Native batch tar upload failed: ${formatTransferError(error)}`);
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
      await this.execRemote(client, command, { inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS });
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
        await this.withSftp(endpoint, (sftp) => this.ensureRemoteDirectory(sftp, endpoint.path));
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
          await this.withSftp(endpoint, async (sftp) => {
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
        await runLocalCommand("tar.exe", [...await this.getLocalTarCharsetArgs(), "-xf", endpoint.path, "-C", outputDirectory]);
      } else {
        const outputSetup = `out=${quotePosixShellArg(outputDirectory)}; if [ -e "$out" ] && [ ! -d "$out" ]; then out="$out"_extracted; fi; mkdir -p "$out"`;
        const command = isZipPath(endpoint.path) ? `${outputSetup} && unzip -o ${quotePosixShellArg(endpoint.path)} -d "$out"` : `${outputSetup} && tar -xf ${quotePosixShellArg(endpoint.path)} -C "$out"`;
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
        getActivityTime: () => lastActivityAt
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
    this.directSshRouteFailureCooldowns.set(getDirectSshRouteFailureKey(cacheKey, route), Date.now() + DIRECT_SSH_ROUTE_FAILURE_COOLDOWN_MS);
  }
  clearDirectSshRouteFailure(source, target, route) {
    if (source.kind !== "ssh" || target.kind !== "ssh" || !source.connection || !target.connection) {
      return;
    }
    const cacheKey = getDirectSshRouteCacheKey(source.connection, target.connection);
    this.directSshRouteFailureCooldowns.delete(getDirectSshRouteFailureKey(cacheKey, route));
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
    logImageDebug(`original path=${endpoint.path} bytes=${buffer.byteLength} decoded=${size ? `${size.width}x${size.height}` : "NONE"} mime=${getMimeType(endpoint.path)}`);
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
    logImageDebug(`scaled path=${endpoint.path} fpSize=${sourceFingerprint?.size ?? "n/a"} target=${targetWidth}x${targetHeight} fmt=${format} tryRemote=${shouldTryRemoteTransform}`);
    if (shouldTryRemoteTransform) {
      const thumbnail = await this.tryReadRemoteThumbnailViaImageMagick(endpoint, targetWidth, targetHeight, quality, format, interpolation);
      if (thumbnail) {
        return thumbnail;
      }
    }
    logImageDebug(`scaled-fallback-download path=${endpoint.path} maxBytes=${sourceMaxBytes}`);
    const sourceBuffer = endpoint.kind === "local" ? await this.readLocalFileBuffer(endpoint.path, sourceMaxBytes) : await this.readRemoteFileBuffer(endpoint, sourceMaxBytes);
    const sourceSize = getImageSize(sourceBuffer);
    const sourceMime = getMimeType(endpoint.path);
    logImageDebug(`scaled-fallback-decoded path=${endpoint.path} bytes=${sourceBuffer.byteLength} decoded=${sourceSize ? `${sourceSize.width}x${sourceSize.height}` : "NONE"} mime=${sourceMime}`);
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
      logImageDebug(`scaled-local-transform-ok path=${endpoint.path} outBytes=${transformed.buffer.byteLength} outMime=${transformed.mime}`);
      return transformed;
    } catch (error) {
      logImageDebug(`scaled-local-transform-FAIL path=${endpoint.path} err=${error instanceof Error ? error.message : String(error)} -> returning RAW ${sourceMime} bytes=${sourceBuffer.byteLength}`);
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
    const source = quotePosixShellArg(endpoint.path);
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
      logImageDebug(`remote-thumb path=${endpoint.path} tool=${tool} geom=${geometry} bytes=${buffer.byteLength} decoded=${size ? `${size.width}x${size.height}` : "NONE"}`);
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
      logImageDebug(`remote-thumb-FAIL path=${endpoint.path} tool=${tool} geom=${geometry} err=${error instanceof Error ? error.message : String(error)}`);
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
      let lastStreamActivityAt = Date.now();
      const finish = (callback) => {
        if (settled) {
          return;
        }
        settled = true;
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
      client.exec(command, (error, stream) => {
        if (error) {
          finish(() => reject(error));
          return;
        }
        activeStream = stream;
        const chunks = [];
        let stderr = "";
        if (options.timeoutMs && options.timeoutMs > 0) {
          totalTimeout = setTimeout(() => abort(`Remote command timed out after ${options.timeoutMs} ms.`), options.timeoutMs);
        }
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
  const seen = /* @__PURE__ */ new Set();
  const acceptPath = (path) => {
    const candidate = path.trim().replace(/^"|"$/g, "").replace(/^file:\/\/\/?/i, "");
    if (!isWindowsClipboardPath(candidate)) {
      return;
    }
    const key = candidate.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
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
  return paths;
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
function buildPosixBatchCommand(sourcePaths, targetDirectory, operation) {
  const target = quotePosixShellArg(targetDirectory);
  const sources = sourcePaths.map((path) => quotePosixShellArg(path)).join(" ");
  if (operation === "move") {
    return `mkdir -p ${target} && mv -f ${sources} ${target}`;
  }
  return `mkdir -p ${target} && (cp -a --reflink=auto --sparse=always ${sources} ${target} 2>/dev/null || cp -a ${sources} ${target})`;
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
  const args = names.map((name) => quotePosixShellArg(`./${normalizeTarListPath(name)}`)).join(" ");
  return `cd ${quotePosixShellArg(directoryPath)} && LC_ALL=C stat --printf='%n\\0%s\\0%Y\\0' -- ${args}`;
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
function logImageDebug(message) {
  try {
    appendFileSync(join(tmpdir(), "turbofile-image-debug.log"), `${(/* @__PURE__ */ new Date()).toISOString()} ${message}
`);
  } catch {
  }
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
  for (const extension of [".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz", ".zip", ".tar"]) {
    if (lower.endsWith(extension)) {
      return path.substring(0, path.length - extension.length);
    }
  }
  return path;
}
function isZipPath(path) {
  return path.toLowerCase().endsWith(".zip");
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVyYm9maWxlXFxlbGVjdHJvbi1tYWluXFx0dXJib2ZpbGVTc2hNYWluU2VydmljZS50cyJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZ0JBQWdCLGtCQUFrQixtQkFBbUIsWUFBWSxZQUFZLFdBQVc7QUFDakcsU0FBUyxVQUFVLFNBQVMsWUFBWTtBQUN4QyxTQUFTLG1CQUFtQixVQUFVLGNBQWM7QUFDcEQsU0FBUyxZQUFZLGtCQUFrQjtBQUN2QyxTQUFTLFVBQVUsYUFBZ0M7QUFDbkQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXLGtCQUEwQjtBQUM5QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLEtBQUssZUFBZSxXQUFXLGFBQWEsZ0JBQWdCO0FBQ3JFLFNBQVMsU0FBUyxhQUFhO0FBRS9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9DQUFvQyw0Q0FBNEMscUNBQXFDLG1DQUFtQyxnQ0FBZ0MsaUNBQWlDLDBDQUEwQztBQUU1USxNQUFNLHFCQUFxQixLQUFLLE9BQU87QUFDdkMsTUFBTSw2QkFBNkIsTUFBTSxPQUFPO0FBQ2hELE1BQU0saUNBQWlDLElBQUksS0FBSztBQUdoRCxNQUFNLG9DQUFvQztBQU8xQyxNQUFNLGlDQUFpQztBQUN2QyxNQUFNLG1DQUFtQztBQUd6QyxNQUFNLDhDQUE4QztBQUNwRCxNQUFNLHVDQUF1QztBQUM3QyxNQUFNLCtCQUErQixJQUFJLE9BQU87QUFDaEQsTUFBTSxpQ0FBaUMsTUFBTTtBQUM3QyxNQUFNLHdCQUF3QjtBQUM5QixNQUFNLDZCQUE2QjtBQUNuQyxNQUFNLDBCQUEwQixJQUFJLE9BQU87QUFDM0MsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSxrQ0FB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
