import { createReadStream, createWriteStream, existsSync, promises as fsp } from "fs";
import { basename, dirname, join } from "node:path";
import { networkInterfaces, platform, tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { connect as connectTcp } from "node:net";
import { deflateSync } from "node:zlib";
import { app, BrowserWindow, clipboard, nativeImage } from "electron";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { getTurboFileImageSizeFromHeader } from "../common/turbofileImageSize.js";
import { resolveTerminalEncoding } from "../../../base/node/terminalEncoding.js";
import { createLocalBatchTarPlans, createTarNullListBuffer } from "../common/turbofileBatchTarPlan.js";
import { withTurboFileTimeout } from "../common/turbofileTimeout.js";
import { resolveTransferPlan } from "../common/turbofileTransferPlan.js";
import { createWindowsDragFakeDirectoryName, createWindowsShellAssociationChangedScript, normalizeWindowsCopyHookDestination, TURBOFILE_WINDOWS_DRAG_ACTIVE_DIR, TURBOFILE_WINDOWS_DRAG_APP_DIR, TURBOFILE_WINDOWS_DRAG_ROOT_DIR, TURBOFILE_WINDOWS_DRAG_TARGETS_DIR } from "../common/turbofileWindowsDrag.js";
const DEFAULT_READ_LIMIT = 10 * 1024 * 1024;
const DEFAULT_IMAGE_SOURCE_LIMIT = 128 * 1024 * 1024;
const REMOTE_IMAGE_TOOL_CACHE_TTL_MS = 5 * 60 * 1e3;
const REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS = 6e4;
const REMOTE_DIRECTORY_READ_TIMEOUT_MS = 8e3;
const REMOTE_DIRECT_READ_MAX_BYTES = 2 * 1024 * 1024;
const REMOTE_DIRECT_READ_CHUNK_BYTES = 256 * 1024;
const SMALL_IMAGE_DIM_LIMIT = 100;
const WINDOWS_DRAG_ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const RAW_BMP_FAST_PATH_BYTES = 2 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_VERSION = 2;
const IMAGE_THUMBNAIL_CACHE_MAX_BYTES = 512 * 1024 * 1024;
const IMAGE_THUMBNAIL_CACHE_MAX_ENTRY_BYTES = 16 * 1024 * 1024;
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
    if (platform() === "win32") {
      void this.ensureWindowsDragCopyHookRegistered().catch(() => void 0);
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
  async trySshToSshDirectTransfer(protocol, request, startedAt) {
    switch (protocol) {
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
  async trySshToSshRelayTransfer(protocol, request, startedAt) {
    switch (protocol) {
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
    for (const protocol of protocolOrder ?? getLocalCommandTransferProtocolOrder(request.target.preferredProtocol, request.target.connection)) {
      this.throwIfTransferCanceled(request.progressId);
      try {
        if (protocol === "rsync") {
          this.fireTransferProgress(request, 0, 0, "transfer", "Uploading over local rsync.", true, { strategy: "rsync-upload" });
          const progress = this.createRsyncProgressReporter(request, 0, "transfer", "Uploading over local rsync.", { strategy: "rsync-upload" });
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
    for (const protocol of protocolOrder ?? getLocalCommandTransferProtocolOrder(request.source.preferredProtocol, request.source.connection)) {
      this.throwIfTransferCanceled(request.progressId);
      try {
        if (protocol === "rsync") {
          this.fireTransferProgress(request, 0, 0, "transfer", "Downloading over local rsync.", true, { strategy: "rsync-download" });
          const progress = this.createRsyncProgressReporter(request, 0, "transfer", "Downloading over local rsync.", { strategy: "rsync-download" });
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
      if (sizePromise) {
        bytes = Math.max(bytes, await sizePromise);
      }
      const targetSize = await this.getRemotePathContentSizeByCommand(request.target).catch(() => bytes);
      if (bytes > 0 && targetSize !== bytes) {
        throw new Error(`Tar upload size mismatch: expected ${bytes}, got ${targetSize}.`);
      }
      const resultBytes = bytes > 0 ? bytes : targetSize;
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
      const targetSize = await getLocalPathSize(request.target.path).catch(() => bytes);
      if (bytes > 0 && targetSize !== bytes) {
        throw new Error(`Tar download size mismatch: expected ${bytes}, got ${targetSize}.`);
      }
      const resultBytes = bytes > 0 ? bytes : targetSize;
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
      tarProcess = spawn("tar.exe", ["-xf", "-", "-C", localDirectory], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
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
        tarProcess = spawn("tar.exe", tarArgs, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
        tarProcess = spawn("tar.exe", tarArgs, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
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
        tarProcess = spawn("tar.exe", ["-cf", "-", "-C", localRoot, "--null", "-T", chunk.listPath], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
        tarProcess = spawn("tar.exe", ["-cf", "-", "-C", localRoot, "--null", "-T", chunk.listPath], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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
    const protocol = isUpload ? request.targetDirectory.preferredProtocol : request.source.preferredProtocol;
    if (protocol !== "rsync") {
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
      const progress = this.createRsyncProgressReporter(request, 0, "transfer", isUpload ? "Batch rsync upload in progress." : "Batch rsync download in progress.", {
        strategy: isUpload ? "rsync-upload" : "rsync-download",
        completedItems: 0,
        totalItems: items.length
      });
      this.fireTransferProgress(request, 0, 0, "transfer", isUpload ? "Starting batch rsync upload." : "Starting batch rsync download.", true, {
        strategy: isUpload ? "rsync-upload" : "rsync-download",
        completedItems: 0,
        totalItems: items.length,
        currentName: items[0]?.displayName ?? items[0]?.targetName
      });
      if (isUpload) {
        const sourceArgs = items.map((item) => toRsyncLocalPath(item.sourcePath, tool.pathFlavor));
        await withLocalRsyncSshEnvironment(connection, tool, (env, identityPath) => {
          return this.runCancelableLocalCommand(tool.executable, [
            ...buildLocalRsyncOptionArgs(true),
            buildRsyncPathWithMkdirOption(request.targetDirectory.path),
            "-e",
            buildLocalRsyncSshTransport(connection, tool.sshExecutable, identityPath),
            ...sourceArgs,
            formatRsyncRemoteSpec(connection, ensureTrailingRemoteSlash(request.targetDirectory.path))
          ], {
            env,
            onStdout: progress.handleOutput,
            onStderr: progress.handleOutput,
            inactivityTimeoutMs: LOCAL_RSYNC_STALL_TIMEOUT_MS,
            inactivityMessage: `Batch rsync upload produced no output for ${LOCAL_RSYNC_STALL_TIMEOUT_MS} ms.`
          }, request.progressId);
        });
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
    const protocol = getSshToSshTransferProtocol(request.source);
    if (protocol !== "rsync" && !(allowAutoFast && protocol === "auto-fast")) {
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
    const protocol = getSshToSshTransferProtocol(request.source);
    if (protocol !== "rsync" && !(allowAutoFast && protocol === "auto-fast")) {
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
      tarProcess = spawn("tar.exe", ["-xf", "-", "-C", targetDirectory], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
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
      await delay(WINDOWS_DRAG_COPY_HOOK_POLL_MS);
    }
    throw new Error("Windows drop target capture timed out.");
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
    const [result] = await this.readImageResult(endpoint, options, false);
    return result;
  }
  async readImageWithBuffer(endpoint, options = {}) {
    return this.readImageResult(endpoint, options, true);
  }
  async readImageResult(endpoint, options, preferBuffer) {
    const encoding = options.encoding ?? "base64";
    try {
      const result = await this.readImageBuffer(endpoint, options);
      const buffer = preferBuffer ? VSBuffer.wrap(result.buffer) : void 0;
      return [{
        ok: true,
        message: "Image loaded.",
        content: preferBuffer ? "" : encoding === "base64" ? result.buffer.toString("base64") : result.buffer.toString("utf8"),
        encoding,
        mime: result.mime,
        size: result.buffer.byteLength,
        width: result.width,
        height: result.height,
        originalWidth: result.originalWidth,
        originalHeight: result.originalHeight
      }, buffer];
    } catch (error) {
      return [{
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        content: "",
        encoding,
        mime: getMimeType(endpoint.path),
        size: 0
      }, void 0];
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
        await runLocalCommand("tar.exe", ["-a", "-cf", archivePath, "-C", dirname(endpoint.path), basename(endpoint.path)]);
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
        await runLocalCommand("tar.exe", ["-xf", endpoint.path, "-C", outputDirectory]);
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
    const protocol = getSshToSshTransferProtocol(request.source);
    if (protocol !== "rsync" && !(allowAutoFast && protocol === "auto-fast")) {
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
    const protocol = getSshToSshTransferProtocol(request.source);
    if (protocol !== "rsync" && !(allowAutoFast && protocol === "auto-fast")) {
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
    void totalBytes;
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
      this.fireTransferProgress(request, normalizedTransferred, 0, phase, detail, force, {
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
      getActivityTime: () => lastActivityAt
    };
  }
  createParallelRsyncProgressReporter(request, totalBytes, phase, detail, extra = {}, onAcceptedProgress) {
    void totalBytes;
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
      this.fireTransferProgress(request, transferredBytes, 0, phase, detail, force, {
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
      getActivityTime: () => lastActivityAt
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
  async readImageBuffer(endpoint, options) {
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
      const [thumbnail, headerSize] = await Promise.all([
        this.tryReadRemoteThumbnailViaImageMagick(endpoint, targetWidth, targetHeight, quality, format, interpolation),
        this.tryReadImageHeaderSize(endpoint)
      ]);
      if (thumbnail) {
        return {
          ...thumbnail,
          originalWidth: headerSize?.width ?? thumbnail.originalWidth,
          originalHeight: headerSize?.height ?? thumbnail.originalHeight
        };
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
      return this.transformImageBuffer(sourceBuffer, endpoint.path, targetWidth, targetHeight, quality, format);
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
  async tryReadImageHeaderSize(endpoint) {
    try {
      const header = endpoint.kind === "local" ? await this.readLocalFileHeaderBuffer(endpoint.path, 128 * 1024) : await this.readRemoteFileHeaderBuffer(endpoint, 128 * 1024);
      return getTurboFileImageSizeFromHeader(header);
    } catch {
      return void 0;
    }
  }
  async readLocalFileHeaderBuffer(path, maxBytes) {
    const handle = await fsp.open(path, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) {
        return Buffer.alloc(0);
      }
      const length = Math.min(Math.max(0, maxBytes), stat.size);
      const buffer = Buffer.alloc(length);
      const result = await handle.read(buffer, 0, length, 0);
      return result.bytesRead === length ? buffer : buffer.subarray(0, result.bytesRead);
    } finally {
      await handle.close();
    }
  }
  async readRemoteFileHeaderBuffer(endpoint, maxBytes) {
    return this.withDirectorySftp(endpoint, async (sftp) => {
      const stat = await this.remoteStat(sftp, endpoint.path);
      if (stat.isDirectory()) {
        return Buffer.alloc(0);
      }
      const length = Math.min(Math.max(0, maxBytes), stat.size);
      if (length <= 0) {
        return Buffer.alloc(0);
      }
      const handle = await this.openRemoteFile(sftp, endpoint.path, "r");
      try {
        const buffer = Buffer.alloc(length);
        const bytesRead = await this.readRemoteFileChunk(sftp, handle, buffer, length, 0);
        return bytesRead === length ? buffer : buffer.subarray(0, Math.max(0, bytesRead));
      } finally {
        await this.closeRemoteFile(sftp, handle);
      }
    });
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
    const source = quotePosixShellArg(endpoint.path);
    const thumbnail = ` -thumbnail ${quotePosixShellArg(geometry)}`;
    const filter = interpolation === "lanczos" ? " -filter Lanczos" : "";
    const qualityOption = format === "png" ? "" : ` -quality ${quality}`;
    const outputFormat = format === "webp" ? "webp:-" : format === "png" ? "png:-" : "jpg:-";
    const mime = format === "webp" ? "image/webp" : format === "png" ? "image/png" : "image/jpeg";
    const command = `${tool} ${source}${thumbnail}${filter} -strip${qualityOption} ${outputFormat}`;
    try {
      const buffer = await this.withDirectorySshClient(endpoint, (client) => this.execRemoteBytes(client, command, { timeoutMs: REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS }));
      assertImageBuffer(buffer, mime);
      const size = getImageSize(buffer);
      return {
        buffer,
        mime,
        width: size?.width,
        height: size?.height
      };
    } catch (error) {
      if (format === "webp") {
        try {
          const jpegCommand = `${tool} ${source}${thumbnail}${filter} -strip${qualityOption} jpg:-`;
          const buffer = await this.withDirectorySshClient(endpoint, (client) => this.execRemoteBytes(client, jpegCommand, { timeoutMs: REMOTE_IMAGE_THUMBNAIL_TIMEOUT_MS }));
          assertImageBuffer(buffer, "image/jpeg");
          const size = getImageSize(buffer);
          return {
            buffer,
            mime: "image/jpeg",
            width: size?.width,
            height: size?.height
          };
        } catch {
        }
      }
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
            try {
              stream.destroy?.();
            } catch {
            }
            finish(() => reject(new Error(`Remote command timed out after ${options.timeoutMs} ms.`)));
          }, options.timeoutMs);
        }
        stream.on("data", (data) => {
          chunks.push(typeof data === "string" ? Buffer.from(data) : data);
        });
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
      return this.parseFastRemoteDirectoryEntries(await this.execRemoteBytes(client, buildPosixFastDirectoryListCommand(remotePath), { timeoutMs: REMOTE_DIRECTORY_READ_TIMEOUT_MS }));
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
  const headerSize = getTurboFileImageSizeFromHeader(buffer);
  if (headerSize) {
    return headerSize;
  }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVyYm9maWxlXFxlbGVjdHJvbi1tYWluXFx0dXJib2ZpbGVTc2hNYWluU2VydmljZS50cyJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsa0JBQWtCLG1CQUFtQixZQUFZLFlBQVksV0FBVztBQUNqRixTQUFTLFVBQVUsU0FBUyxZQUFZO0FBQ3hDLFNBQVMsbUJBQW1CLFVBQVUsY0FBYztBQUNwRCxTQUFTLFlBQVksa0JBQWtCO0FBQ3ZDLFNBQVMsVUFBVSxhQUFnQztBQUNuRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVcsa0JBQTBCO0FBQzlDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsS0FBSyxlQUFlLFdBQVcsbUJBQW1CO0FBQzNELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxhQUFhO0FBRS9CLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9DQUFvQyw0Q0FBNEMscUNBQXFDLG1DQUFtQyxnQ0FBZ0MsaUNBQWlDLDBDQUEwQztBQUU1USxNQUFNLHFCQUFxQixLQUFLLE9BQU87QUFDdkMsTUFBTSw2QkFBNkIsTUFBTSxPQUFPO0FBQ2hELE1BQU0saUNBQWlDLElBQUksS0FBSztBQUloRCxNQUFNLG9DQUFvQztBQUMxQyxNQUFNLG1DQUFtQztBQUN6QyxNQUFNLCtCQUErQixJQUFJLE9BQU87QUFDaEQsTUFBTSxpQ0FBaUMsTUFBTTtBQUM3QyxNQUFNLHdCQUF3QjtBQUM5QixNQUFNLDZCQUE2QjtBQUNuQyxNQUFNLDBCQUEwQixJQUFJLE9BQU87QUFDM0MsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSxrQ0FBa0MsTUFBTSxPQUFPO0FBQ3JELE1BQU0sd0NBQXdD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RSxLQUFLLEVBQUUsTUFBTSxLQUFLLEVBQUUsQ0FBQyxLQUFLO0FBQy9FLFFBQU0sU0FBUyxXQUFXLFFBQVEsVUFBVSxFQUFFO0FBQzlDLE1BQUksQ0FBQyxRQUFRO0FBQ1osVUFBTSxJQUFJLE1BQU0saUNBQWlDLEtBQUssS0FBSyxDQUFDLEVBQUU7QUFBQSxFQUMvRDtBQUVBLFFBQU0sT0FBTyxPQUFPLE1BQU07QUFDMUIsTUFBSSxDQUFDLE9BQU8sU0FBUyxJQUFJLEdBQUc7QUFDM0IsVUFBTSxJQUFJLE1BQU0sMEJBQTBCLE1BQU0sRUFBRTtBQUFBLEVBQ25EO0FBRUEsU0FBTztBQUNSO0FBRUEsU0FBUyxtQkFBbUIsR0FBd0IsR0FBZ0M7QUFDbkYsTUFBSSxFQUFFLFNBQVMsZUFBZSxFQUFFLFNBQVMsYUFBYTtBQUNyRCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksRUFBRSxTQUFTLGVBQWUsRUFBRSxTQUFTLGFBQWE7QUFDckQsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLHlCQUF5QixRQUFRLEVBQUUsTUFBTSxFQUFFLElBQUk7QUFDdkQ7QUFFQSxTQUFTLDhCQUE4QixNQUF5QixNQUFjLE9BQTJCO0FBQ3hHLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQTtBQUFBLElBQ0EsYUFBYSxNQUFNLFNBQVM7QUFBQSxJQUM1QixRQUFRLE1BQU0sU0FBUztBQUFBLElBQ3ZCLGdCQUFnQixNQUFNLFNBQVM7QUFBQSxFQUNoQztBQUNEOyIsCiAgIm5hbWVzIjogWyJzZXNzaW9uIiwgInRhcmdldEhhbmRsZSIsICJjb3BpZWRCeXRlcyIsICJ3aWR0aCIsICJoZWlnaHQiXQp9Cg==
