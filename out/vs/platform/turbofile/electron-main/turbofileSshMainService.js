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
        entries: listing.entries.filter((entry) => entry.filename !== "." && entry.filename !== "..").map((entry) => this.toRemoteEntry(listing.path, entry)).sort(compareFileEntries)
      };
      this.setRemoteDirectoryListingCache(this.getRemoteDirectoryListingCacheKey(options, listing.path), result);
      if (listing.path === path) {
        this.setRemoteDirectoryListingCache(cacheKey, result);
      }
      return result;
    } catch (error) {
      this.remoteDirectoryListingCache.delete(cacheKey);
      this.disposeDirectorySftpSession(session.key);
      throw error;
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
  async readRemoteDirectoryWithFallback(sftp, client, options, remotePath) {
    try {
      return { path: remotePath, entries: await this.readRemoteDirectoryFast(client, sftp, remotePath) };
    } catch (firstError) {
      for (const fallbackPath of getRemoteDirectoryFallbackPaths(options, remotePath)) {
        try {
          return { path: fallbackPath, entries: await this.readRemoteDirectoryFast(client, sftp, fallbackPath) };
        } catch {
        }
      }
      throw firstError;
    }
  }
  async readRemoteDirectoryFast(client, sftp, remotePath) {
    try {
      return this.parseFastRemoteDirectoryEntries(await this.execRemoteBytes(client, buildPosixFastDirectoryListCommand(remotePath), {
        inactivityTimeoutMs: REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS,
        inactivityMessage: `Remote directory read produced no output for ${REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS} ms: ${remotePath}`,
        timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS
      }));
    } catch {
      return this.readRemoteDirectory(sftp, remotePath);
    }
  }
  parseFastRemoteDirectoryEntries(output) {
    const text = output.toString("utf8");
    if (!text) {
      return [];
    }
    const parts = text.split("\0");
    const entries = [];
    for (let index = 0; index + 3 < parts.length; index += 4) {
      const filename = parts[index];
      if (!filename || filename === "." || filename === "..") {
        continue;
      }
      const kind = parts[index + 1];
      const size = Number(parts[index + 2]);
      const modifiedSeconds = Number(parts[index + 3]);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVyYm9maWxlXFxlbGVjdHJvbi1tYWluXFx0dXJib2ZpbGVTc2hNYWluU2VydmljZS50cyJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZ0JBQWdCLGtCQUFrQixtQkFBbUIsWUFBWSxZQUFZLFdBQVc7QUFDakcsU0FBUyxVQUFVLFNBQVMsWUFBWTtBQUN4QyxTQUFTLG1CQUFtQixVQUFVLGNBQWM7QUFDcEQsU0FBUyxZQUFZLGtCQUFrQjtBQUN2QyxTQUFTLFVBQVUsYUFBZ0M7QUFDbkQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXLGtCQUEwQjtBQUM5QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLEtBQUssZUFBZSxXQUFXLGFBQWEsZ0JBQWdCO0FBQ3JFLFNBQVMsU0FBUyxhQUFhO0FBRS9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9DQUFvQyw0Q0FBNEMscUNBQXFDLG1DQUFtQyxnQ0FBZ0MsaUNBQWlDLDBDQUEwQztBQUU1USxNQUFNLHFCQUFxQixLQUFLLE9BQU87QUFDdkMsTUFBTSw2QkFBNkIsTUFBTSxPQUFPO0FBQ2hELE1BQU0saUNBQWlDLElBQUksS0FBSztBQUdoRCxNQUFNLG9DQUFvQztBQU8xQyxNQUFNLGlDQUFpQztBQUN2QyxNQUFNLG1DQUFtQztBQUd6QyxNQUFNLDhDQUE4QztBQUNwRCxNQUFNLHVDQUF1QztBQUM3QyxNQUFNLCtCQUErQixJQUFJLE9BQU87QUFDaEQsTUFBTSxpQ0FBaUMsTUFBTTtBQUM3QyxNQUFNLHdCQUF3QjtBQUM5QixNQUFNLDZCQUE2QjtBQUNuQyxNQUFNLDBCQUEwQixJQUFJLE9BQU87QUFDM0MsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSxrQ0FB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QkFBZ0IsR0FBRztBQUN2QyxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8saUJBQWlCLElBQUk7QUFDN0I7QUFFQSxTQUFTLHNDQUFzQyxZQUFvQixpQkFBbUM7QUFDckcsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUywrQkFBK0IsUUFBd0I7QUFDL0QsUUFBTSxPQUFPLE9BQU8sTUFBTSxPQUFPLEVBQUUsS0FBSyxlQUFhLGlCQUFpQixLQUFLLFNBQVMsQ0FBQztBQUNyRixNQUFJLENBQUMsTUFBTTtBQUNWLFVBQU0sSUFBSSxNQUFNLHlDQUF5QyxPQUFPLEtBQUssS0FBSyxjQUFjLEVBQUU7QUFBQSxFQUMzRjtBQUVBLFFBQU0sYUFBYSxLQUFLLE1BQU0sS0FBSyxRQUFRLEdBQUcsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sS0FBSyxFQUFFLENBQUMsS0FBSztBQUMvRSxRQUFNLFNBQVMsV0FBVyxRQUFRLFVBQVUsRUFBRTtBQUM5QyxNQUFJLENBQUMsUUFBUTtBQUNaLFVBQU0sSUFBSSxNQUFNLGlDQUFpQyxLQUFLLEtBQUssQ0FBQyxFQUFFO0FBQUEsRUFDL0Q7QUFFQSxRQUFNLE9BQU8sT0FBTyxNQUFNO0FBQzFCLE1BQUksQ0FBQyxPQUFPLFNBQVMsSUFBSSxHQUFHO0FBQzNCLFVBQU0sSUFBSSxNQUFNLDBCQUEwQixNQUFNLEVBQUU7QUFBQSxFQUNuRDtBQUVBLFNBQU87QUFDUjtBQUVBLFNBQVMsbUJBQW1CLEdBQXdCLEdBQWdDO0FBQ25GLE1BQUksRUFBRSxTQUFTLGVBQWUsRUFBRSxTQUFTLGFBQWE7QUFDckQsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLEVBQUUsU0FBUyxlQUFlLEVBQUUsU0FBUyxhQUFhO0FBQ3JELFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyx5QkFBeUIsUUFBUSxFQUFFLE1BQU0sRUFBRSxJQUFJO0FBQ3ZEO0FBRUEsU0FBUyw4QkFBOEIsTUFBeUIsTUFBYyxPQUEyQjtBQUN4RyxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0E7QUFBQSxJQUNBLGFBQWEsTUFBTSxTQUFTO0FBQUEsSUFDNUIsUUFBUSxNQUFNLFNBQVM7QUFBQSxJQUN2QixnQkFBZ0IsTUFBTSxTQUFTO0FBQUEsRUFDaEM7QUFDRDsiLAogICJuYW1lcyI6IFsicHJvdG9jb2wiLCAic2Vzc2lvbiIsICJ0YXJnZXRIYW5kbGUiLCAiY29waWVkQnl0ZXMiLCAid2lkdGgiLCAiaGVpZ2h0Il0KfQo=
