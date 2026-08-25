/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, spawn } from 'child_process';
import { app } from 'electron';
import { createReadStream, createWriteStream, existsSync, unlinkSync } from 'fs';
import { mkdir, readFile, unlink } from 'fs/promises';
import { release, tmpdir } from 'os';
import { Delayer, ProcessTimeRunOnceScheduler, timeout } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { memoize } from '../../../base/common/decorators.js';
import { hash } from '../../../base/common/hash.js';
import * as path from '../../../base/common/path.js';
import { basename } from '../../../base/common/path.js';
import { INodeProcess } from '../../../base/common/platform.js';
import { transform } from '../../../base/common/stream.js';
import { URI } from '../../../base/common/uri.js';
import { checksum } from '../../../base/node/crypto.js';
import { pipeline } from 'node:stream/promises';
import * as pfs from '../../../base/node/pfs.js';
import { killTree } from '../../../base/node/processes.js';
import { getWindowsRelease } from '../../../base/node/windowsVersion.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IFileService } from '../../files/common/files.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ITurboFileGitHubRelease, ITurboFileUpdateManifest, resolveTurboFileUpdateFromGitHubRelease, resolveTurboFileUpdateFromManifest, shouldAutoInstallTurboFileSetupUpdate as shouldAutoInstallTurboFileSetupUpdatePolicy, shouldDisableWindowsUserSetupUpdatesAsAdmin } from '../common/turbofileUpdate.js';
import { AvailableForDownload, DisablementReason, IUpdate, State, StateType, UpdateType } from '../common/update.js';
import { AbstractUpdateService, createUpdateURL, getUpdateRequestHeaders, IUpdateURLOptions, UpdateErrorClassification } from './abstractUpdateService.js';

interface ITurboFileUpdateCheckResult {
	readonly checked: boolean;
	readonly update?: IUpdate;
}

interface IAvailableUpdate {
	packagePath: string;
	updateFilePath?: string;
	/** File path used to signal the Inno Setup installer to cancel */
	cancelFilePath?: string;
	/** The Inno Setup process that is applying the update in the background */
	updateProcess?: ChildProcess;
}

let _updateType: UpdateType | undefined = undefined;
function getUpdateType(): UpdateType {
	if (typeof _updateType === 'undefined') {
		_updateType = existsSync(path.join(path.dirname(process.execPath), 'unins000.exe'))
			? UpdateType.Setup
			: UpdateType.Archive;
	}

	return _updateType;
}

export class Win32UpdateService extends AbstractUpdateService implements IRelaunchHandler {

	private availableUpdate: IAvailableUpdate | undefined;
	private updateCancellationTokenSource: CancellationTokenSource | undefined;

	@memoize
	get cachePath(): Promise<string> {
		const result = path.join(tmpdir(), `vscode-${this.productService.quality}-${this.productService.target}-${process.arch}`);
		return mkdir(result, { recursive: true }).then(() => result);
	}

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IProductService productService: IProductService,
		@IApplicationStorageMainService applicationStorageMainService: IApplicationStorageMainService,
		@IMeteredConnectionService meteredConnectionService: IMeteredConnectionService,
	) {
		super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService, telemetryService, applicationStorageMainService, meteredConnectionService, true);

		lifecycleMainService.setRelaunchHandler(this);
	}

	handleRelaunch(options?: IRelaunchOptions): boolean {
		if (options?.addArgs || options?.removeArgs) {
			return false; // we cannot apply an update and restart with different args
		}

		if (this.state.type !== StateType.Ready || !this.availableUpdate) {
			return false; // we only handle the relaunch when we have a pending update
		}

		this.logService.trace('update#handleRelaunch(): running raw#quitAndInstall()');
		this.doQuitAndInstall();

		return true;
	}

	protected override async initialize(): Promise<void> {
		if (this.productService.win32VersionedUpdate) {
			const cachePath = await this.cachePath;
			app.setPath('appUpdate', cachePath);
			await this.unlink(path.join(cachePath, 'session-ending.flag'));
		}

		// Send telemetry
		type WindowsUpdateInitEvent = {
			osRelease: string;
			osNodeRelease: string;
		};
		type WindowsUpdateInitClassification = {
			osRelease: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Windows OS release version from registry.' };
			osNodeRelease: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Windows OS release version from os.release().' };
			owner: 'dmitriv';
			comment: 'Tracks Windows OS release information during update initialization.';
		};
		const osRelease = await getWindowsRelease();
		const osNodeRelease = release();
		this.telemetryService.publicLog2<WindowsUpdateInitEvent, WindowsUpdateInitClassification>('windowsUpdateInit', { osRelease, osNodeRelease });

		const isAdmin = await this.nativeHostMainService.isAdmin(undefined);
		if (shouldDisableWindowsUserSetupUpdatesAsAdmin({
			isAdmin,
			productTarget: this.productService.target,
			turboFileGitHubUpdatesEnabled: this.isTurboFileGitHubUpdatesEnabled(),
		})) {
			this.setState(State.Disabled(DisablementReason.RunningAsAdmin));
			this.logService.info('update#ctor - updates are disabled due to running as Admin in user setup');
			return;
		}
		if (isAdmin && this.productService.target === 'user' && this.isTurboFileGitHubUpdatesEnabled()) {
			this.logService.info('update#ctor - TurboFile GitHub user setup updates remain enabled while running as Admin');
		}

		await super.initialize();
	}

	protected override async postInitialize(): Promise<void> {
		if (!this.productService.win32VersionedUpdate) {
			return;
		}
		// Check for pending update from previous session
		// This can happen if the app is quit right after the update has been
		// downloaded and before the update has been applied.
		const exePath = app.getPath('exe');
		const exeDir = path.dirname(exePath);
		const updatingVersionPath = path.join(exeDir, 'updating_version');
		if (await pfs.Promises.exists(updatingVersionPath)) {
			try {
				const updatingVersion = (await readFile(updatingVersionPath, 'utf8')).trim();
				this.logService.info(`update#doCheckForUpdates - application was updating to version ${updatingVersion}`);
				const updatePackagePath = await this.getUpdatePackagePath(updatingVersion);
				if (await pfs.Promises.exists(updatePackagePath)) {
					await this._applySpecificUpdate(updatePackagePath, updatingVersion);
					this.logService.info(`update#doCheckForUpdates - successfully applied update to version ${updatingVersion}`);
				}
			} catch (e) {
				this.logService.error(`update#doCheckForUpdates - could not read ${updatingVersionPath}`, e);
			} finally {
				// updatingVersionPath will be deleted by inno setup.
			}
		} else {
			const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
			// GC for background updates in system setup happens via inno_setup since it requires
			// elevated permissions.
			if (fastUpdatesEnabled && this.productService.target === 'user' && this.productService.commit) {
				const versionedResourcesFolder = this.productService.commit.substring(0, 10);
				const innoUpdater = path.join(exeDir, versionedResourcesFolder, 'tools', 'inno_updater.exe');
				const exeName = basename(exePath);
				const siblingExeName = this.productService.win32SiblingExeBasename ? `${this.productService.win32SiblingExeBasename}.exe` : '';
				await new Promise<void>(resolve => {
					const child = spawn(innoUpdater, ['--gc', exePath, versionedResourcesFolder, exeName, siblingExeName], {
						stdio: ['ignore', 'ignore', 'ignore'],
						windowsHide: true,
						timeout: 2 * 60 * 1000
					});
					child.once('exit', () => resolve());
				});
			}
		}
	}

	private isTurboFileGitHubUpdatesEnabled(): boolean {
		const config = this.productService.turbofileUpdates;
		return !!config && (
			(!!config.owner && !!config.repo) ||
			!!config.manifestUrl ||
			!!config.manifestUrls?.length
		);
	}

	private getTurboFileUpdateManifestUrls(): readonly string[] {
		const config = this.productService.turbofileUpdates;
		if (!config) {
			return [];
		}

		const urls = new Set<string>();
		for (const url of config.manifestUrls ?? []) {
			if (url) {
				urls.add(url);
			}
		}
		if (config.manifestUrl) {
			urls.add(config.manifestUrl);
		}
		if (config.owner && config.repo) {
			const releaseUrl = `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/releases/download/updater`;
			urls.add(`${releaseUrl}/update-proxy.json`);
			urls.add(`${releaseUrl}/update.json`);
		}

		return Array.from(urls);
	}

	private buildTurboFileGitHubReleaseUrl(): string | undefined {
		const config = this.productService.turbofileUpdates;
		if (!config?.owner || !config.repo) {
			return undefined;
		}

		return config.latestReleaseUrl ?? `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/releases/latest`;
	}

	private getTurboFileGitHubRequestHeaders(): Record<string, string> {
		return {
			...(getUpdateRequestHeaders(this.productService.version) ?? {}),
			Accept: 'application/vnd.github+json',
		};
	}

	private getTurboFileManifestRequestHeaders(): Record<string, string> {
		return {
			...(getUpdateRequestHeaders(this.productService.version) ?? {}),
			Accept: 'application/json',
		};
	}

	protected buildUpdateFeedUrl(quality: string, commit: string, options?: IUpdateURLOptions): string | undefined {
		const turboFileReleaseUrl = this.buildTurboFileGitHubReleaseUrl();
		if (turboFileReleaseUrl) {
			return turboFileReleaseUrl;
		}

		let platform = `win32-${process.arch}`;

		if (getUpdateType() === UpdateType.Archive) {
			platform += '-archive';
		} else if (this.productService.target === 'user') {
			platform += '-user';
		}

		return createUpdateURL(this.productService.updateUrl!, platform, quality, commit, options);
	}

	protected doCheckForUpdates(explicit: boolean, pendingCommit?: string): void {
		if (!this.quality) {
			return;
		}

		if (this.isTurboFileGitHubUpdatesEnabled()) {
			this.doCheckForTurboFileGitHubUpdates(explicit, pendingCommit);
			return;
		}

		const internalOrg = this.getInternalOrg();
		const background = !explicit && !internalOrg;
		const url = this.buildUpdateFeedUrl(this.quality, pendingCommit ?? this.productService.commit!, { background, internalOrg });

		// Only set CheckingForUpdates if we're not already in Overwriting state
		if (this.state.type !== StateType.Overwriting) {
			this.setState(State.CheckingForUpdates(explicit));
		}

		const headers = getUpdateRequestHeaders(this.productService.version);
		this.requestService.request({ url, headers, callSite: 'updateService.win32.checkForUpdates' }, CancellationToken.None)
			.then<IUpdate | null>(asJson)
			.then(update => {
				const updateType = getUpdateType();

				if (!update || !update.url || !update.version || !update.productVersion) {
					// If we were checking for an overwrite update and found nothing newer,
					// restore the Ready state with the pending update
					if (this.state.type === StateType.Overwriting) {
						this._overwrite = false;
						this.setState(State.Ready(this.state.update, this.state.explicit, false));
					} else {
						this.setState(State.Idle(updateType, undefined, explicit || undefined));
					}
					return Promise.resolve(null);
				}

				if (updateType === UpdateType.Archive) {
					this.setState(State.AvailableForDownload(update));
					return Promise.resolve(null);
				}

				// When connection is metered and this is not an explicit check,
				// show update is available but don't start downloading
				if (!explicit && this.meteredConnectionService.isConnectionMetered) {
					this.logService.info('update#doCheckForUpdates - update available but skipping download because connection is metered');
					this.setState(State.AvailableForDownload(update));
					return Promise.resolve(null);
				}

				const startTime = Date.now();
				this.setState(State.Downloading(update, explicit, this._overwrite, 0, undefined, startTime));

				return this.cleanup(update.version).then(() => {
					return this.getUpdatePackagePath(update.version).then(updatePackagePath => {
						return pfs.Promises.exists(updatePackagePath).then(exists => {
							if (exists) {
								return Promise.resolve(updatePackagePath);
							}

							const downloadPath = `${updatePackagePath}.tmp`;

							return this.requestService.request({ url: update.url, callSite: 'updateService.win32.downloadUpdate' }, CancellationToken.None)
								.then(context => {
									// Get total size from Content-Length header
									const contentLengthHeader = context.res.headers['content-length'];
									const contentLength = typeof contentLengthHeader === 'string' ? contentLengthHeader : undefined;
									const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;

									// Track downloaded bytes and update state periodically using Delayer
									let downloadedBytes = 0;
									const progressDelayer = new Delayer<void>(500);
									const progressStream = transform<VSBuffer, VSBuffer>(
										context.stream,
										{
											data: data => {
												downloadedBytes += data.byteLength;
												progressDelayer.trigger(() => {
													this.setState(State.Downloading(update, explicit, this._overwrite, downloadedBytes, totalBytes, startTime));
												});
												return data;
											}
										},
										chunks => VSBuffer.concat(chunks)
									);

									return this.fileService.writeFile(URI.file(downloadPath), progressStream)
										.finally(() => progressDelayer.dispose());
								})
								.then(update.sha256hash ? () => checksum(downloadPath, update.sha256hash) : () => undefined)
								.then(() => pfs.Promises.rename(downloadPath, updatePackagePath, false /* no retry */))
								.then(() => updatePackagePath);
						});
					}).then(packagePath => {
						this.availableUpdate = { packagePath };
						this.saveUpdateMetadata(update);
						this.setState(State.Downloaded(update, explicit, this._overwrite));

						const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
						if (fastUpdatesEnabled && this.productService.target === 'user') {
							this.doApplyUpdate();
						} else {
							this.setState(State.Ready(update, explicit, this._overwrite));
						}
					});
				});
			})
			.then(undefined, err => {
				this.telemetryService.publicLog2<{ messageHash: string }, UpdateErrorClassification>('update:error', { messageHash: String(hash(String(err))) });
				this.logService.error(err);

				// only show message when explicitly checking for updates
				const message: string | undefined = explicit ? (err.message || err) : undefined;

				// If we were checking for an overwrite update and it failed,
				// restore the Ready state with the pending update
				if (this.state.type === StateType.Overwriting) {
					this._overwrite = false;
					this.setState(State.Ready(this.state.update, this.state.explicit, false));
				} else {
					this.setState(State.Idle(getUpdateType(), message));
				}
			});
	}

	private doCheckForTurboFileGitHubUpdates(explicit: boolean, pendingVersion?: string): void {
		if (this.state.type !== StateType.Overwriting) {
			this.setState(State.CheckingForUpdates(explicit));
		}

		this.resolveTurboFileUpdate(pendingVersion ?? this.productService.version, CancellationToken.None)
			.then(update => {
				if (!update) {
					if (this.state.type === StateType.Overwriting) {
						this._overwrite = false;
						this.setState(State.Ready(this.state.update, this.state.explicit, false));
					} else {
						this.setState(State.Idle(getUpdateType(), undefined, explicit || undefined));
					}
					return;
				}

				this.setState(State.AvailableForDownload(update, true));
			})
			.then(undefined, err => {
				this.telemetryService.publicLog2<{ messageHash: string }, UpdateErrorClassification>('update:error', { messageHash: String(hash(String(err))) });
				this.logService.error(err);

				const message: string | undefined = explicit ? (err.message || err) : undefined;

				if (this.state.type === StateType.Overwriting) {
					this._overwrite = false;
					this.setState(State.Ready(this.state.update, this.state.explicit, false));
				} else {
					this.setState(State.Idle(getUpdateType(), message));
				}
			});
	}

	private async resolveTurboFileUpdate(currentVersion: string, token: CancellationToken): Promise<IUpdate | undefined> {
		const manifestResult = await this.resolveTurboFileUpdateFromManifestUrls(currentVersion, token);
		if (manifestResult.checked) {
			return manifestResult.update;
		}

		// A readable first-party manifest is authoritative, including when it reports that no newer
		// version exists. GitHub is contacted only when every configured manifest source is unreachable
		// or invalid, so users on a Gitee-capable network do not depend on GitHub for routine checks.
		try {
			const releaseUpdate = await this.resolveTurboFileUpdateFromGitHubReleaseUrl(currentVersion, token);
			if (releaseUpdate) {
				return releaseUpdate;
			}
		} catch (error) {
			this.logService.warn('update#resolveTurboFileUpdate(): GitHub release fallback failed');
			this.logService.warn(error);
		}

		return manifestResult.checked ? manifestResult.update : undefined;
	}

	private async resolveTurboFileUpdateFromManifestUrls(currentVersion: string, token: CancellationToken): Promise<ITurboFileUpdateCheckResult> {
		const urls = this.getTurboFileUpdateManifestUrls();
		if (!urls.length) {
			return { checked: false };
		}

		const config = this.productService.turbofileUpdates;
		for (const url of urls) {
			try {
				const context = await this.requestService.request({ url, headers: this.getTurboFileManifestRequestHeaders(), callSite: 'updateService.win32.checkTurboFileManifestUpdates' }, token);
				if (context.res.statusCode === 404) {
					continue;
				}
				if (context.res.statusCode && context.res.statusCode >= 400) {
					throw new Error(`TurboFile update manifest returned HTTP ${context.res.statusCode}`);
				}

				const manifest = await asJson<ITurboFileUpdateManifest>(context);
				if (!manifest) {
					continue;
				}
				return {
					checked: true,
					update: resolveTurboFileUpdateFromManifest(manifest, currentVersion, {
						allowPrerelease: config?.allowPrerelease,
						assetNamePattern: config?.assetNamePattern,
						arch: process.arch,
					}),
				};
			} catch (error) {
				this.logService.warn(`update#resolveTurboFileUpdateFromManifestUrls(): failed to read ${url}`);
				this.logService.warn(error);
			}
		}

		return { checked: false };
	}

	private async resolveTurboFileUpdateFromGitHubReleaseUrl(currentVersion: string, token: CancellationToken): Promise<IUpdate | undefined> {
		const url = this.buildTurboFileGitHubReleaseUrl();
		const config = this.productService.turbofileUpdates;
		if (!url || !config) {
			return undefined;
		}

		const context = await this.requestService.request({ url, headers: this.getTurboFileGitHubRequestHeaders(), callSite: 'updateService.win32.checkTurboFileGitHubUpdates' }, token);
		const release = context.res.statusCode === 404 ? null : await asJson<ITurboFileGitHubRelease>(context);
		return release ? resolveTurboFileUpdateFromGitHubRelease(release, currentVersion, {
			allowPrerelease: config.allowPrerelease,
			assetNamePattern: config.assetNamePattern,
			arch: process.arch,
		}) : undefined;
	}

	protected override async doDownloadUpdate(state: AvailableForDownload): Promise<void> {
		if (this.isTurboFileGitHubUpdatesEnabled() && (state.update.url || state.update.parts?.length)) {
			try {
				await this.downloadAndPrepareUpdate(state.update, true);
			} catch (err) {
				this.telemetryService.publicLog2<{ messageHash: string }, UpdateErrorClassification>('update:error', { messageHash: String(hash(String(err))) });
				this.logService.error('update#doDownloadUpdate(): failed to download TurboFile update');
				this.logService.error(err);
				const message = err instanceof Error ? err.message : String(err);
				this.setState(State.Idle(getUpdateType(), message));
			}
			return;
		}

		if (state.update.url) {
			this.nativeHostMainService.openExternal(undefined, state.update.url);
		}
		this.setState(State.Idle(getUpdateType()));
	}

	private async downloadAndPrepareUpdate(update: IUpdate, explicit: boolean): Promise<void> {
		if (!update.url && !update.parts?.length) {
			throw new Error('Missing update download URL');
		}

		const startTime = Date.now();
		this.setState(State.Downloading(update, explicit, this._overwrite, 0, undefined, startTime));

		await this.cleanup(update.version);
		const updatePackagePath = await this.getUpdatePackagePath(update.version);
		const packagePath = await pfs.Promises.exists(updatePackagePath)
			? updatePackagePath
			: await this.downloadUpdatePackage(update, updatePackagePath, explicit, startTime);

		this.availableUpdate = { packagePath };
		await this.saveUpdateMetadata(update);
		this.setState(State.Downloaded(update, explicit, this._overwrite));

		if (this.shouldAutoInstallTurboFileSetupUpdate()) {
			this.setState(State.Ready(update, explicit, this._overwrite));
			void this.quitAndInstall();
			return;
		}

		const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
		if (fastUpdatesEnabled && this.productService.target === 'user') {
			void this.doApplyUpdate();
		} else {
			this.setState(State.Ready(update, explicit, this._overwrite));
		}
	}

	private shouldAutoInstallTurboFileSetupUpdate(): boolean {
		return shouldAutoInstallTurboFileSetupUpdatePolicy({
			turboFileGitHubUpdatesEnabled: this.isTurboFileGitHubUpdatesEnabled(),
			updateType: getUpdateType(),
			productTarget: this.productService.target,
		});
	}

	private async downloadUpdatePackage(update: IUpdate, updatePackagePath: string, explicit: boolean, startTime: number): Promise<string> {
		if (update.parts?.length) {
			try {
				return await this.downloadUpdateParts(update, updatePackagePath, explicit, startTime);
			} catch (error) {
				this.logService.warn('update#downloadUpdatePackage(): Gitee multipart download failed; falling back to the complete package.', error);
				await this.unlink(`${updatePackagePath}.tmp`);
				if (!update.url) {
					throw error;
				}
			}
		}
		return this.downloadSingleUpdatePackage(update, updatePackagePath, explicit, startTime);
	}

	private async downloadSingleUpdatePackage(update: IUpdate, updatePackagePath: string, explicit: boolean, startTime: number): Promise<string> {
		if (!update.url) {
			throw new Error('Missing complete update download URL');
		}

		const downloadPath = `${updatePackagePath}.tmp`;
		const context = await this.requestService.request({ url: update.url, callSite: 'updateService.win32.downloadTurboFileGitHubUpdate' }, CancellationToken.None);
		if (context.res.statusCode && context.res.statusCode >= 400) {
			throw new Error(`Complete update download returned HTTP ${context.res.statusCode}.`);
		}

		const contentLengthHeader = context.res.headers['content-length'];
		const contentLength = typeof contentLengthHeader === 'string' ? contentLengthHeader : undefined;
		const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;

		let downloadedBytes = 0;
		const progressDelayer = new Delayer<void>(500);
		const progressStream = transform<VSBuffer, VSBuffer>(
			context.stream,
			{
				data: data => {
					downloadedBytes += data.byteLength;
					progressDelayer.trigger(() => {
						this.setState(State.Downloading(update, explicit, this._overwrite, downloadedBytes, totalBytes, startTime));
					});
					return data;
				}
			},
			chunks => VSBuffer.concat(chunks)
		);

		await this.fileService.writeFile(URI.file(downloadPath), progressStream)
			.finally(() => progressDelayer.dispose());

		if (update.sha256hash) {
			await checksum(downloadPath, update.sha256hash);
		}

		await pfs.Promises.rename(downloadPath, updatePackagePath, false /* no retry */);
		return updatePackagePath;
	}

	private async downloadUpdateParts(update: IUpdate, updatePackagePath: string, explicit: boolean, startTime: number): Promise<string> {
		const parts = update.parts;
		if (!parts?.length) {
			throw new Error('Missing multipart update download URLs');
		}
		const downloadPath = `${updatePackagePath}.tmp`;
		const partPaths = parts.map((_, index) => `${downloadPath}.part-${String(index + 1).padStart(3, '0')}`);
		const totalBytes = parts.every(part => typeof part.size === 'number')
			? parts.reduce((total, part) => total + (part.size ?? 0), 0)
			: undefined;
		let completedBytes = 0;

		try {
			for (const [index, part] of parts.entries()) {
				const context = await this.requestService.request({ url: part.url, callSite: 'updateService.win32.downloadTurboFileGiteeUpdatePart' }, CancellationToken.None);
				if (context.res.statusCode && context.res.statusCode >= 400) {
					throw new Error(`Update part ${index + 1} returned HTTP ${context.res.statusCode}.`);
				}
				const declaredSize = (part.size ?? Number(context.res.headers['content-length'] ?? 0)) || undefined;
				let partBytes = 0;
				const progressDelayer = new Delayer<void>(500);
				const progressStream = transform<VSBuffer, VSBuffer>(
					context.stream,
					{
						data: data => {
							partBytes += data.byteLength;
							progressDelayer.trigger(() => {
								this.setState(State.Downloading(update, explicit, this._overwrite, completedBytes + partBytes, totalBytes ?? (completedBytes + (declaredSize ?? 0)), startTime));
							});
							return data;
						}
					},
					chunks => VSBuffer.concat(chunks)
				);
				await this.fileService.writeFile(URI.file(partPaths[index]), progressStream).finally(() => progressDelayer.dispose());
				if (part.size !== undefined && partBytes !== part.size) {
					throw new Error(`Update part ${index + 1} size mismatch (expected ${part.size}, actual ${partBytes}).`);
				}
				if (part.sha256hash) {
					await checksum(partPaths[index], part.sha256hash);
				}
				completedBytes += partBytes;
				this.setState(State.Downloading(update, explicit, this._overwrite, completedBytes, totalBytes, startTime));
			}

			for (const [index, partPath] of partPaths.entries()) {
				await pipeline(createReadStream(partPath), createWriteStream(downloadPath, { flags: index === 0 ? 'w' : 'a' }));
			}
			if (update.sha256hash) {
				await checksum(downloadPath, update.sha256hash);
			}
			await pfs.Promises.rename(downloadPath, updatePackagePath, false /* no retry */);
			return updatePackagePath;
		} finally {
			await Promise.all(partPaths.map(partPath => this.unlink(partPath)));
		}
	}

	private async getUpdatePackagePath(version: string): Promise<string> {
		const cachePath = await this.cachePath;
		return path.join(cachePath, `CodeSetup-${this.productService.quality}-${version}.exe`);
	}

	private async cleanup(exceptVersion: string | null = null): Promise<void> {
		const filter = exceptVersion ? (one: string) => !(new RegExp(`${this.productService.quality}-${exceptVersion}\\.exe$`).test(one)) : () => true;

		const cachePath = await this.cachePath;
		const versions = await pfs.Promises.readdir(cachePath);

		const promises = versions.filter(filter).map(one => this.unlink(path.join(cachePath, one)));
		await Promise.all(promises);
	}

	protected override async doApplyUpdate(): Promise<void> {
		if (this.state.type !== StateType.Downloaded) {
			return Promise.resolve(undefined);
		}

		if (!this.availableUpdate) {
			return Promise.resolve(undefined);
		}

		const update = this.state.update;
		const explicit = this.state.explicit;
		this.setState(State.Updating(update, explicit));

		const cachePath = await this.cachePath;
		const sessionEndFlagPath = path.join(cachePath, 'session-ending.flag');
		const cancelFilePath = path.join(cachePath, `cancel.flag`);
		await this.unlink(cancelFilePath);

		const progressFilePath = path.join(cachePath, `update-progress`);
		await this.unlink(progressFilePath);

		this.availableUpdate.updateFilePath = path.join(cachePath, `CodeSetup-${this.productService.quality}-${update.version}.flag`);
		this.availableUpdate.cancelFilePath = cancelFilePath;

		await pfs.Promises.writeFile(this.availableUpdate.updateFilePath, 'flag');
		const child = spawn(this.availableUpdate.packagePath,
			[
				'/verysilent',
				'/log',
				`/update="${this.availableUpdate.updateFilePath}"`,
				`/progress="${progressFilePath}"`,
				`/sessionend="${sessionEndFlagPath}"`,
				`/cancel="${cancelFilePath}"`,
				'/nocloseapplications',
				'/mergetasks=runcode,!desktopicon,!quicklaunchicon'
			],
			{
				detached: true,
				stdio: ['ignore', 'ignore', 'ignore'],
				windowsVerbatimArguments: true,
				env: { ...process.env, __COMPAT_LAYER: 'RunAsInvoker' }
			}
		);

		// Track the process so we can cancel it if needed
		this.availableUpdate.updateProcess = child;

		child.once('exit', () => {
			this.availableUpdate = undefined;
			this.setState(State.Idle(getUpdateType()));
		});

		// The InnoSetup installer creates the -ready mutex using the host app's
		// mutex name ({#AppMutex}). When running as the embedded app, use
		// win32SetupMutexName (the host's mutex) to find the correct signal.
		const setupMutexName = (process as INodeProcess).isEmbeddedApp
			? this.productService.win32SetupMutexName
			: this.productService.win32MutexName;
		const readyMutexName = `${setupMutexName}-ready`;
		const mutex = await import('@vscode/windows-mutex');

		this.updateCancellationTokenSource?.dispose(true);
		const cts = this.updateCancellationTokenSource = new CancellationTokenSource();
		const token = cts.token;

		const poll = async () => {
			while (this.state.type === StateType.Updating && !token.isCancellationRequested) {
				if (mutex.isActive(readyMutexName)) {
					this.setState(State.Ready(update, explicit, this._overwrite));
					return;
				}

				try {
					const progressContent = await readFile(progressFilePath, 'utf8');
					if (!token.isCancellationRequested) {
						const [currentStr, maxStr] = progressContent.split(',');
						const currentProgress = parseInt(currentStr, 10);
						const maxProgress = parseInt(maxStr, 10);
						if (!isNaN(currentProgress) && !isNaN(maxProgress) && this.state.type === StateType.Updating) {
							if (this.state.currentProgress !== currentProgress || this.state.maxProgress !== maxProgress) {
								this.setState(State.Updating(update, explicit, currentProgress, maxProgress));
							}
						}
					}
				} catch {
					// Progress file may not exist yet or be locked, ignore
				}

				await timeout(500);
			}
		};

		const cancelTimeout = new ProcessTimeRunOnceScheduler(() => {
			this.logService.warn('update#doApplyUpdate: polling timed out waiting for update to be ready');
			this.setState(State.Idle(getUpdateType(), 'Update did not complete within expected time'));
		}, 60 * 60 * 1000);

		// Poll for progress and ready mutex for 1 hour.
		cancelTimeout.schedule();
		poll().finally(() => {
			cancelTimeout.dispose();
			if (this.updateCancellationTokenSource === cts) {
				this.updateCancellationTokenSource = undefined;
			}
			cts.dispose();
		});
	}

	protected override async cancelPendingUpdate(): Promise<void> {
		if (!this.availableUpdate) {
			return;
		}

		// Cancel the polling loop
		this.updateCancellationTokenSource?.dispose(true);
		this.updateCancellationTokenSource = undefined;

		this.logService.trace('update#cancelPendingUpdate: cancelling pending update');
		const { updateProcess, updateFilePath, cancelFilePath } = this.availableUpdate;

		if (updateProcess && updateProcess.exitCode === null) {
			// Remove all listeners to prevent the exit handler from changing state
			updateProcess.removeAllListeners();
			const exitPromise = new Promise<boolean>(resolve => updateProcess.once('exit', () => resolve(true)));

			// Write the cancel file to signal Inno Setup to exit gracefully
			if (cancelFilePath) {
				try {
					await pfs.Promises.writeFile(cancelFilePath, 'cancel');
				} catch (err) {
					this.logService.warn('update#cancelPendingUpdate: failed to write cancel file', err);
				}
			}

			// Wait for the process to exit gracefully, then force-kill if needed
			const pid = updateProcess.pid;
			const exited = await Promise.race([exitPromise, timeout(30 * 1000).then(() => false)]);
			if (pid && !exited) {
				this.logService.trace('update#cancelPendingUpdate: process did not exit gracefully, killing process tree');
				await killTree(pid, true);
			}
		}

		// Clean up the flag file
		await this.unlink(updateFilePath);

		// Clean up the cancel file
		await this.unlink(cancelFilePath);

		this.availableUpdate = undefined;
	}

	protected override doQuitAndInstall(): void {
		if ((this.state.type !== StateType.Ready && this.state.type !== StateType.Restarting) || !this.availableUpdate) {
			return;
		}

		this.logService.trace('update#quitAndInstall(): running raw#quitAndInstall()');

		if (this.availableUpdate.updateFilePath) {
			try {
				unlinkSync(this.availableUpdate.updateFilePath);
			} catch {
				// ignore
			}
		} else {
			spawn(this.availableUpdate.packagePath, ['/silent', '/log', '/mergetasks=runcode,!desktopicon,!quicklaunchicon'], {
				detached: true,
				stdio: ['ignore', 'ignore', 'ignore'],
				env: { ...process.env, __COMPAT_LAYER: 'RunAsInvoker' }
			});
		}
	}

	private async saveUpdateMetadata(update: IUpdate): Promise<void> {
		try {
			const cachePath = await this.cachePath;
			const metadataPath = path.join(cachePath, 'update-metadata.json');
			await pfs.Promises.writeFile(metadataPath, JSON.stringify(update));
		} catch (e) {
			this.logService.error('update#saveUpdateMetadata: failed to save', e);
		}
	}

	private async loadUpdateMetadata(): Promise<IUpdate | undefined> {
		try {
			const cachePath = await this.cachePath;
			const metadataPath = path.join(cachePath, 'update-metadata.json');
			if (await pfs.Promises.exists(metadataPath)) {
				const content = await readFile(metadataPath, 'utf8');
				return JSON.parse(content);
			}
		} catch (e) {
			this.logService.error('update#loadUpdateMetadata: failed to load', e);
		}
		return undefined;
	}

	protected override getUpdateType(): UpdateType {
		return getUpdateType();
	}

	override async isLatestVersion(commit?: string, token: CancellationToken = CancellationToken.None): Promise<boolean | undefined> {
		if (!this.isTurboFileGitHubUpdatesEnabled()) {
			return super.isLatestVersion(commit, token);
		}

		try {
			const update = await this.resolveTurboFileUpdate(commit ?? this.productService.version, token);
			return !update;
		} catch (error) {
			this.logService.error('update#isLatestVersion(): failed to check TurboFile update');
			this.logService.error(error);
			return undefined;
		}
	}

	override async _applySpecificUpdate(packagePath: string, commit?: string): Promise<void> {
		if (this.state.type !== StateType.Idle) {
			return;
		}

		const fastUpdatesEnabled = this.configurationService.getValue('update.enableWindowsBackgroundUpdates');
		const update: IUpdate = await this.loadUpdateMetadata() ?? { version: commit ?? 'unknown', productVersion: 'unknown' };

		this.setState(State.Downloading(update, true, false));
		this.availableUpdate = { packagePath };
		this.setState(State.Downloaded(update, true, false));

		if (this.shouldAutoInstallTurboFileSetupUpdate()) {
			this.setState(State.Ready(update, true, false));
			void this.quitAndInstall();
			return;
		}

		if (fastUpdatesEnabled && this.productService.target === 'user') {
			void this.doApplyUpdate();
		} else {
			this.setState(State.Ready(update, true, false));
		}
	}

	private async unlink(path: string | undefined): Promise<void> {
		if (path) {
			try {
				await unlink(path);
			} catch (err) {
				const error = err as NodeJS.ErrnoException;
				if (error && error.code === 'ENOENT') {
					return;
				} else {
					this.logService.warn(`update#unlink: failed to unlink ${basename(path)}`, err);
				}
			}
		}
	}
}
