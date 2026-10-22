/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/turbofile.css';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { $, clearNode, Dimension, getWindow, IDomPosition } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { joinPath } from '../../../../base/common/resources.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { localize } from '../../../../nls.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITurboFileFileEntry, ITurboFileImageBatchEntry, ITurboFileImageResourceOptions, ITurboFileReadImageOptions, ITurboFileRemoteCapabilities, ITurboFileSshConnectionOptions, ITurboFileSshService, ITurboFileTransferAttempt, ITurboFileTransferEndpoint, ITurboFileTransferProgressEvent, ITurboFileTransferResult, ITurboFileTrashDevice, ITurboFileTrashItem, ITurboFileTrashOperationResult, ITurboFileWindowsDragItem, TurboFileFileType, TurboFileTransferDependency } from '../../../../platform/turbofile/common/turbofile.js';
import { ITurboFileJournalService } from '../../../../platform/turbofile/common/turbofileJournal.js';
import { withTurboFileTimeout } from '../../../../platform/turbofile/common/turbofileTimeout.js';
import { resolveTransferPlan } from '../../../../platform/turbofile/common/turbofileTransferPlan.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { createFileSystemProviderError, FileChangeType, FileKind, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileDeleteOptions, IFileOverwriteOptions, IFileService, IFileSystemProviderWithFileReadWriteCapability, IFileWriteOptions, IStat, IWatchOptions } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CodeDataTransfers, getPathForFile } from '../../../../platform/dnd/browser/dnd.js';
import { IProcessPropertyMap, ITerminalChildProcess, ITerminalLaunchError, ITerminalLaunchResult, ProcessPropertyType, TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUpdateService, StateType } from '../../../../platform/update/common/update.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { DEFAULT_EDITOR_ASSOCIATION, IEditorOpenContext, IUntypedFileEditorInput } from '../../../common/editor.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITextEditorService } from '../../../services/textfile/common/textEditorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ICreateTerminalOptions, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { BasePty } from '../../terminal/common/basePty.js';
import { ITerminalProfileService } from '../../terminal/common/terminal.js';
import { ColorThemeData } from '../../../services/themes/common/colorThemeData.js';
import { COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS, IWorkbenchColorTheme, IWorkbenchThemeService, ThemeSettings, ThemeSettingDefaults } from '../../../services/themes/common/workbenchThemeService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { TurboFileAuthType, TurboFileDevice, TurboFileDeviceCapabilities, TurboFileDevicePlatform, TurboFileTransferProtocol, defaultTurboFileTransferProtocol } from '../common/turbofileTypes.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { TurboFileEditorInput } from '../common/turbofileEditorInput.js';
import { TurboFileDeviceDraft, TurboFileDeviceStore } from './turbofileDeviceStore.js';
import { TurboFileJournalView } from './turbofileJournalView.js';
import { applyTurboFileDocumentTabAffinity, ensureTurboFileTransferTabsLeft, getTurboFileDocumentTargetIndex } from './turbofileDocumentTabAffinity.js';
import { getTurboFileRecycleBinIcon } from './turbofileRecycleBinIcons.js';
import { turboFileWorkbenchBridge, TurboFileWorkbenchCommand, TurboFileWorkbenchPage } from './turbofileWorkbenchBridge.js';
import { TurboFileDirectoryInflightTracker, TurboFileDirectoryLoadPurpose } from '../common/turbofileDirectoryInflight.js';
import { TurboFileDirectoryPrefetchQueue } from '../common/turbofileDirectoryPrefetchQueue.js';
import { createTurboFileCopyNames } from '../common/turbofileCopyName.js';
import { getTurboFileDropEffect, getTurboFileRowDragEffectAllowed, resolveTurboFileDragOperation, shouldHandleTurboFilePaneDropAtPage, TurboFileDragOperation } from '../common/turbofileDragDrop.js';
import { createTurboFileNativeDragSession, dropTurboFileNativeDragSessionInternally, settleTurboFileNativeDragSession, shouldHandoffTurboFileDragToWindows, startTurboFileNativeDragSession, TurboFileNativeDragSession, TurboFileNativeDragTarget } from '../common/turbofileNativeDragSession.js';
import { applyTurboFileOptimisticTransfer, createTurboFilePostTransferRefreshPlan, createTurboFileTransferProgressSemanticKey } from '../common/turbofileTransferRefresh.js';
import { getTurboFileImageGridPasteTargetSide } from '../common/turbofileImageGridClipboard.js';
import { formatTurboFileImageDimensions } from '../common/turbofileImageDimensions.js';
import { sortTurboFileImageGridItems, TurboFileImageGridSizeSortBasis, TurboFileImageGridSortKey } from '../common/turbofileImageGridSort.js';
import { getTurboFileImageGridBaseCardWidth, getTurboFileImageGridCardSize, getTurboFileImageGridEffectiveColumns, ITurboFileImageGridCardSize } from '../common/turbofileImageGridSizing.js';
import { createTurboFileImagePreviewReadOptions } from '../common/turbofileImagePreview.js';
import { createTurboFileImageGridResourceOptions, createTurboFileImagePreviewResourceOptions } from '../common/turbofileImageResource.js';
import { isTurboFileListingReadyForSort, sortTurboFileItems, turboFileSortNeedsAttributes, TurboFileSortDirection, TurboFileSortKey } from '../common/turbofileFileSort.js';
import { getTurboFileTitlebarUpdateActionKind, TurboFileTitlebarUpdateActionKind } from '../common/turbofileTitlebar.js';
import { aggregateTurboFileTransferProgress, chooseDisplayTransferSpeed, createTurboFileTransferSizePolicy, isTurboFileTransferProgressQuiet, resolveTurboFileVisibleTotalBytes, shouldStartTransferTiming, trimTurboFileTaskHistory, TurboFileTransferMetricsDisplay, TURBOFILE_TRANSFER_LIVE_TICK_INTERVAL_MS } from '../common/turbofileTransferDisplay.js';
import { shouldRetargetWindowsDesktopPane } from '../common/turbofileWindowsLocation.js';
import { enterTurboFileTrashDirectory, enterTurboFileTrashView, isTurboFileTrashBrowsePathAllowed, isTurboFileTrashRootView, leaveTurboFileTrashDirectory, leaveTurboFileTrashView, mapTurboFileTrashItemsToRows, TurboFileTrashPaneMode } from '../common/turbofileTrashView.js';

interface TurboFileFileItem {
	readonly name: string;
	// size/modified are mutable so a names-only (instant) listing can be enriched in place once the
	// lazily-fetched size + modified time for the visible rows arrives.
	size: string;
	rawSize: number;
	modified: string;
	rawModified: number;
	readonly type: TurboFileFileType;
	readonly directory?: boolean;
	readonly parent?: boolean;
	readonly path?: string;
	readonly trashItem?: ITurboFileTrashItem;
	/** True when this row came from a names-only listing and still needs its size/date filled in. */
	attrsPending?: boolean;
}

interface TurboFilePaneState {
	deviceId: string;
	path: string;
	items: TurboFileFileItem[];
	loading: boolean;
	error?: string;
	selectedPath?: string;
	selectedPaths: Set<string>;
	selectionAnchorPath?: string;
	scrollTop: number;
	viewportHeight: number;
	sortKey: TurboFileSortKey;
	sortDirection: TurboFileSortDirection;
	trashMode: TurboFileTrashPaneMode;
	trashItems: ITurboFileTrashItem[];
	trashHasItems: boolean;
	trashStateKnown: boolean;
}

interface TurboFileRefreshPaneOptions {
	readonly force?: boolean;
	readonly silent?: boolean;
	readonly path?: string;
}

interface TurboFilePaneMutationContext {
	readonly deviceId: string;
	readonly path: string;
	readonly windowsPath: boolean;
	readonly trashRoot: boolean;
	readonly trashBrowseItemId?: string;
}

interface TurboFileDirectoryCacheEntry {
	readonly expiresAt: number;
	readonly path: string;
	readonly items: TurboFileFileItem[];
}

interface TurboFilePaneDeviceSnapshot {
	readonly path: string;
	readonly items: TurboFileFileItem[];
	readonly scrollTop: number;
	readonly expiresAt: number;
}

interface TurboFilePaneDoubleClickState {
	lastPath?: string;
	lastAt: number;
	suppressNativePath?: string;
}

const turboFileTerminalPageByTerminalId = new Map<number, string>();
const turboFileLastActiveTerminalByPageId = new Map<string, number>();
const turboFileTerminalPanelHiddenByPageId = new Set<string>();
const turboFileEditorGroupReferenceCounts = new WeakMap<HTMLElement, number>();
const turboFileVisibleEditors = new WeakMap<HTMLElement, Set<TurboFileEditor>>();
let turboFileTerminalPanelVisibilityInProgress = false;
let turboFileTerminalPanelVisibilityChangeDepth = 0;
let turboFileTerminalPanelVisibilityResetHandle: number | undefined;

function isTurboFileTerminalPanelVisibilityInProgress(): boolean {
	return turboFileTerminalPanelVisibilityInProgress;
}

interface TurboFilePaneSelectionSide {
	readonly deviceId: string;
	readonly path: string;
	readonly sortKey: TurboFileSortKey;
	readonly sortDirection: TurboFileSortDirection;
}

interface TurboFilePaneSelectionSnapshot {
	readonly left: TurboFilePaneSelectionSide;
	readonly right: TurboFilePaneSelectionSide;
}

// Per-page (editor input) left/right device + path + sort selection. Held at module scope so it
// survives an editor PANE instance being disposed and reused for another page - which is exactly
// what merging two editor groups does. Without this, a merged page would render with the receiving
// group's previous page selection (e.g. its server), instead of its own.
const turboFilePaneSelectionByPageId = new Map<string, TurboFilePaneSelectionSnapshot>();

interface TurboFileImageGridImage {
	readonly item: TurboFileFileItem;
	thumbnailContent: string;
	thumbnailUrl?: string;
	thumbnailMime: string;
	thumbnailLoading: boolean;
	thumbnailError?: string;
	thumbnailDecodeFailures?: number;
	previewContent: string;
	previewUrl?: string;
	previewMime: string;
	previewLoading: boolean;
	previewError?: string;
	previewDecodeFailures?: number;
	previewImage?: HTMLImageElement;
	previewImageKey?: string;
	previewImageLoading?: Promise<HTMLImageElement>;
	previewImageLoadingKey?: string;
	width?: number;
	height?: number;
	originalWidth?: number;
	originalHeight?: number;
}

type TurboFileImageGridColumns = number;
type TurboFileImagePreviewSamplingMode = 'smooth' | 'lossless';
type TurboFileImageGridDisplayMode = 'page' | 'pane';
type TurboFileTransferConflictPolicy = 'ask' | 'overwrite' | 'skip' | 'keepBoth';

interface TurboFileImageGridState {
	readonly side: 'left' | 'right';
	readonly path: string;
	readonly displayMode: TurboFileImageGridDisplayMode;
	readonly trashContext?: {
		readonly browseItem?: ITurboFileTrashItem;
		readonly windowsPath: boolean;
	};
	readonly images: TurboFileImageGridImage[];
	selectedIndex: number;
	selectedIndexes: Set<number>;
	selectionAnchorIndex?: number;
	columns: TurboFileImageGridColumns;
	thumbnailScale: number;
	sortKey: TurboFileImageGridSortKey;
	sortDescending: boolean;
	previewVisible: boolean;
	previewOrigin: 'file-list' | 'grid';
	previewZoom: number;
	previewPanX: number;
	previewPanY: number;
	previewFitPending: boolean;
	previewPendingIndex?: number;
	previewPendingRequestSeq?: number;
	previewSamplingMode: TurboFileImagePreviewSamplingMode;
	pixelInspectorVisible: boolean;
	histogramVisible: boolean;
	histogramX: number;
	histogramY: number;
	fileListScrollTop: number;
	scrollTop: number;
	viewportHeight: number;
	thumbnailLoadToken: number;
	renderedRange?: { startIndex: number; endIndex: number; columns: number; total: number };
	layoutMetrics?: TurboFileImageGridLayoutMetrics;
	bodyWidthCache?: number;
	retainedPaneRoot?: HTMLElement;
	paneDomDisposables?: DisposableStore;
	readonly loadedThumbnailIndexes: Set<number>;
	readonly loadedPreviewIndexes: Set<number>;
	scrollRaf: number;
	dimensionMetadataLoading: boolean;
	dimensionMetadataLoaded: boolean;
	dimensionMetadataGeneration: number;
}

interface TurboFileImageReadResult {
	readonly ok: boolean;
	readonly message: string;
	readonly content: string;
	readonly mime: string;
	readonly size: number;
	readonly width?: number;
	readonly height?: number;
	readonly originalWidth?: number;
	readonly originalHeight?: number;
	readonly buffer?: VSBuffer;
}

interface TurboFileCachedImageReadResult {
	readonly content: string;
	readonly mime: string;
	readonly size: number;
	readonly width?: number;
	readonly height?: number;
	readonly originalWidth?: number;
	readonly originalHeight?: number;
}

interface TurboFileImageGridRange {
	readonly startIndex: number;
	readonly endIndex: number;
	readonly topSpacerHeight: number;
	readonly bottomSpacerHeight: number;
}

interface TurboFileImageGridLayoutMetrics {
	readonly state: TurboFileImageGridState;
	readonly scale: number;
	readonly baseCardWidth: number;
	readonly showNames: boolean;
	readonly maxCardWidth: number;
	readonly maxImageWidth: number;
	readonly rowHeight: number;
}

interface TurboFileImagePreviewAnalysis {
	readonly key: string;
	readonly canvas: HTMLCanvasElement;
	readonly context: CanvasRenderingContext2D;
	width: number;
	height: number;
	ready: boolean;
}

interface TurboFileImagePreviewRender {
	readonly key: string;
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	image?: HTMLImageElement;
	width: number;
	height: number;
	ready: boolean;
	requestSeq: number;
}

interface TurboFileImagePreviewDrawRects {
	readonly sourceX: number;
	readonly sourceY: number;
	readonly sourceWidth: number;
	readonly sourceHeight: number;
	readonly destX: number;
	readonly destY: number;
	readonly destWidth: number;
	readonly destHeight: number;
}

interface TurboFileFileListRange {
	readonly startIndex: number;
	readonly endIndex: number;
	readonly topSpacerHeight: number;
	readonly bottomSpacerHeight: number;
}

interface TurboFileImageGridThumbnailRequest {
	readonly state: TurboFileImageGridState;
	readonly index: number;
	readonly image: TurboFileImageGridImage;
	readonly key: string;
}

interface TurboFileSyncPreviewState {
	readonly plan: TurboFileSyncPlanItem[];
	readonly selectedIndexes: Set<number>;
	readonly reversedIndexes: Set<number>;
	readonly resolve: (plan: TurboFileSyncPlanItem[] | undefined) => void;
}

interface TurboFileDialogState {
	readonly kind: 'confirm' | 'prompt' | 'info';
	readonly title: string;
	readonly message: string;
	readonly detail?: string;
	readonly confirmLabel: string;
	readonly cancelLabel?: string;
	readonly defaultValue?: string;
	readonly danger?: boolean;
	readonly resolve: (value: boolean | string | undefined) => void;
}

type TurboFileTaskKind = 'transfer' | 'delete' | 'rename' | 'mkdir' | 'create-file' | 'size' | 'compress' | 'extract' | 'save' | 'ssh-test' | 'terminal' | 'sync';
type TurboFileTaskStatus = 'running' | 'success' | 'error' | 'canceled';
type TurboFileTransferItemStatus = 'waiting' | 'running' | 'success' | 'error' | 'canceled';
type TurboFileTransferStrategy = ITurboFileTransferResult['strategy'];

interface TurboFileProtocolCheckResult {
	readonly status: 'success' | 'error';
	readonly message: string;
	readonly capabilities?: ITurboFileRemoteCapabilities;
	readonly missingDependencies?: readonly TurboFileTransferDependency[];
}

interface TurboFileTaskRetryTransfer {
	readonly sourceSide: 'left' | 'right';
	readonly targetSide: 'left' | 'right';
	readonly sourceItem: TurboFileFileItem;
	readonly targetPath?: string;
	readonly sourceDeviceId?: string;
}

interface TurboFileInternalTransferClipboard {
	readonly operation: 'copy' | 'move';
	readonly sourceSide: 'left' | 'right';
	readonly sourceDevice: TurboFileDevice;
	readonly sourcePath: string;
	readonly items: TurboFileFileItem[];
	readonly createdAt: number;
}

interface TurboFileInlineRenameState {
	readonly side: 'left' | 'right';
	readonly path: string;
	readonly originalName: string;
	readonly directory: boolean;
}

interface TurboFileOptimisticRenameSnapshot {
	readonly panePath: string;
	readonly index: number;
	readonly originalItem: TurboFileFileItem;
	readonly renamedPath: string;
	readonly selectedPath?: string;
	readonly selectedPaths: string[];
	readonly selectionAnchorPath?: string;
}

interface TurboFileTaskTransferItem {
	lastProgressAt?: number;
	readonly name: string;
	readonly type: TurboFileFileType;
	displaySize: string;
	rawSize: number;
	status: TurboFileTransferItemStatus;
	transferStartedAt?: number;
	progress: number;
	transferredBytes: number;
	totalBytes: number;
	speedBytesPerSecond: number;
	remainingMs?: number;
	strategy?: string;
	error?: string;
	startedAt?: number;
	endedAt?: number;
	progressId?: string;
	speedSamples: number[];
	lastSampleAt?: number;
	lastSampleBytes?: number;
}

interface TurboFileTask {
	lastProgressAt?: number;
	id: number;
	kind: TurboFileTaskKind;
	label: string;
	detail: string;
	status: TurboFileTaskStatus;
	startedAt: number;
	transferStartedAt?: number;
	endedAt?: number;
	durationMs?: number;
	bytes?: number;
	averageBytesPerSecond?: number;
	transferredBytes?: number;
	trackTotalBytes: boolean;
	totalBytes?: number;
	strategy?: string;
	error?: string;
	progress: number;
	progressId?: string;
	cancelRequested?: boolean;
	retryTransfer?: TurboFileTaskRetryTransfer;
	transferItems?: TurboFileTaskTransferItem[];
	activeTransferItemIndex?: number;
	currentTransferName?: string;
	speedBytesPerSecond?: number;
	remainingMs?: number;
	speedSamples?: number[];
	lastSampleAt?: number;
	lastSampleBytes?: number;
	metricsDisplay?: TurboFileTransferMetricsDisplay;
	lastProgressSemanticKey?: string;
	transferFallbacks?: Array<{ readonly previousStrategy: string | undefined; readonly nextStrategy: string | undefined; readonly reason: string }>;
}

interface TurboFileTransferExecutionResult {
	readonly ok: boolean;
	readonly message: string;
	readonly bytes: number;
	readonly strategy?: string;
	readonly durationMs?: number;
	readonly averageBytesPerSecond?: number;
	readonly canceled?: boolean;
}

interface TurboFileTransferLocation {
	readonly side: 'left' | 'right';
	readonly device: TurboFileDevice;
	readonly directoryPath: string;
}

interface TurboFileTransferContext {
	readonly source: TurboFileTransferLocation;
	readonly target: TurboFileTransferLocation;
}

type TurboFileDeviceRuntimeStatus = 'unknown' | 'testing' | 'online' | 'offline';

interface TurboFileSyncPlanDirection {
	readonly sourceSide: 'left' | 'right';
	readonly targetSide: 'left' | 'right';
	readonly item: TurboFileFileItem;
	readonly targetPath?: string;
}

interface TurboFileSyncPlanItem extends TurboFileSyncPlanDirection {
	readonly reason: 'missing' | 'newer' | 'size';
	readonly relativePath: string;
	readonly recursive?: boolean;
	readonly reverse?: TurboFileSyncPlanDirection;
}

interface TurboFileSyncTreeEntry {
	readonly relativePath: string;
	readonly item: TurboFileFileItem;
}

const LOCAL_WINDOWS_DEVICE_ID = 'local-windows';
const LOCAL_WINDOWS_FALLBACK_PATH = 'C:\\';
const SYNC_RECURSIVE_SCAN_LIMIT = 5000;
const TURBOFILE_REMOTE_DOCUMENT_SCHEME = 'turbofile-remote';
const FILE_LIST_ROW_HEIGHT = 30;
const FILE_LIST_OVERSCAN_ROWS = 24;
const FILE_LIST_DEFAULT_VIEWPORT_HEIGHT = 720;
// Lazy size/date enrichment of remote rows is best-effort over SSH; a single stat round trip can fail
// transiently (connection contention, a momentary hiccup) and leave the visible rows blank. Retry a
// few times with backoff so size/date reliably appear instead of staying empty until the user scrolls.
const REMOTE_ENRICH_RETRY_BASE_MS = 350;
const REMOTE_ENRICH_MAX_RETRIES = 6;
const PANE_DIRECTORY_CACHE_TTL_MS = 120000;
const PANE_DIRECTORY_CACHE_MAX_ENTRIES = 256;
const PANE_DIRECTORY_PREFETCH_LIMIT = 12;
// Directory name listings are cheap (a single `find -printf` round trip), so a few can run in
// parallel even on weak SSH boards. Draining the neighbour-prefetch backlog faster makes the
// directory the user is about to open far more likely to be cached by double-click time.
const PANE_DIRECTORY_PREFETCH_CONCURRENCY = 3;
const EXTERNAL_PATH_PARENT_LIST_CONCURRENCY = 4;
const PANE_DIRECTORY_VISIBLE_PREFETCH_LIMIT = 8;
const PANE_DEVICE_SNAPSHOT_TTL_MS = 300000;
const PANE_FAST_DOUBLE_CLICK_MS = 300;
const PREPARED_TRANSFER_PAIR_REFRESH_MS = 60 * 1000;
const PREPARED_TRANSFER_PAIR_RETRY_DELAYS_MS = [1000, 2000, 5000, 15000, 60000] as const;
// Keep the consistency scan out of the next user-initiated transfer's startup window. The target
// row is already patched synchronously, so waiting for one full idle second has no visible cost.
const POST_TRANSFER_RECONCILE_DELAY_MS = 1000;
const TRANSFER_SPEED_SAMPLE_MIN_INTERVAL_MS = TURBOFILE_TRANSFER_LIVE_TICK_INTERVAL_MS;
const TRANSFER_SPEED_SAMPLE_MAX_COUNT = 8;
const TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY = 'turbofile.browser.fontSize';
const TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY = 'turbofile.browser.fontFamily';
const TURBOFILE_DEVICE_ORDER_DRAG_TYPE = 'application/x-turbofile-device-order';
const TURBOFILE_UI_FONT_SIZE_STORAGE_KEY = 'turbofile.ui.fontSize';
const TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY = 'turbofile.ui.fontFamily';
const TURBOFILE_LOCAL_WINDOWS_DEFAULT_PATH_STORAGE_KEY = 'turbofile.localWindows.defaultPath';
const TURBOFILE_LOCAL_WINDOWS_TRANSFER_PROTOCOL_STORAGE_KEY = 'turbofile.localWindows.preferredTransferProtocol';
const TURBOFILE_CONFIRM_BEFORE_DELETE_STORAGE_KEY = 'turbofile.delete.confirmBeforeDelete';
const TURBOFILE_IMAGE_GRID_QUALITY_STORAGE_KEY = 'turbofile.imageGrid.quality';
const TURBOFILE_IMAGE_GRID_SHOW_NAMES_STORAGE_KEY = 'turbofile.imageGrid.showNames';
const TURBOFILE_IMAGE_GRID_SHOW_HOVER_INFO_STORAGE_KEY = 'turbofile.imageGrid.showHoverInfo';
const TURBOFILE_IMAGE_GRID_SIZE_SORT_BASIS_STORAGE_KEY = 'turbofile.imageGrid.sizeSortBasis';
const TURBOFILE_TRANSFER_CONFLICT_POLICY_STORAGE_KEY = 'turbofile.transfer.conflictPolicy';
const TURBOFILE_SHOW_HIDDEN_FILES_STORAGE_KEY = 'turbofile.view.showHiddenFiles';
const TURBOFILE_SHOW_FILE_SIZE_STORAGE_KEY = 'turbofile.view.showFileSize';
const TURBOFILE_SHOW_FILE_MODIFIED_STORAGE_KEY = 'turbofile.view.showFileModified';
const TURBOFILE_SHOW_FILE_TYPE_STORAGE_KEY = 'turbofile.view.showFileType';
const TURBOFILE_SHOW_TASKBAR_STORAGE_KEY = 'turbofile.view.showTaskbar';
const TURBOFILE_SYNC_PANE_NAVIGATION_STORAGE_KEY = 'turbofile.view.syncPaneNavigation';
const TURBOFILE_PANE_SPLIT_RATIO_STORAGE_KEY = 'turbofile.view.paneSplitRatio';
const TURBOFILE_PANE_SPLIT_DEFAULT_RATIO = 0.5;
const TURBOFILE_PANE_SPLIT_MIN_SIZE = 240;
const TURBOFILE_PANE_SPLIT_DIVIDER_SIZE = 7;
const TURBOFILE_IMAGE_GRID_ORIGINAL_MAX_BYTES = 128 * 1024 * 1024;
const TURBOFILE_UI_DEFAULT_FONT_SIZE = 14;
const TURBOFILE_DEFAULT_FONT_FAMILY = '"Archivo", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif';
const TURBOFILE_UI_DEFAULT_FONT_FAMILY = TURBOFILE_DEFAULT_FONT_FAMILY;
const TURBOFILE_BROWSER_DEFAULT_FONT_SIZE = 14;
const TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY = TURBOFILE_DEFAULT_FONT_FAMILY;
const TURBOFILE_UI_FONT_FAMILIES = [
	[TURBOFILE_DEFAULT_FONT_FAMILY, 'Archivo / Microsoft YaHei'],
	['"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif', 'Microsoft YaHei UI'],
	['"Microsoft YaHei", "Microsoft YaHei UI", "Segoe UI", sans-serif', '微软雅黑'],
	['"Cascadia Code", Consolas, "Microsoft YaHei UI", monospace', 'Cascadia Code'],
	['Consolas, "Microsoft YaHei UI", "Microsoft YaHei", monospace', 'Consolas'],
	['Arial, "Microsoft YaHei UI", "Microsoft YaHei", sans-serif', 'Arial']
] as const;
const TURBOFILE_BROWSER_FONT_FAMILIES = TURBOFILE_UI_FONT_FAMILIES;
type TurboFileBootstrapIcon = 'archive' | 'arrow-clockwise' | 'arrow-up-circle' | 'clock' | 'cloud-upload-fill' | 'eye' | 'file-earmark' | 'file-earmark-zip' | 'files' | 'folder-check' | 'folder-fill' | 'folder-plus' | 'geo-alt-fill' | 'grid-3x3-gap' | 'hdd-network-fill' | 'lightning-charge-fill' | 'pencil-square' | 'scissors' | 'search' | 'terminal' | 'trash';
type TurboFileIconColor = 'primary' | 'success' | 'warning' | 'info' | 'danger' | 'secondary';
type TurboFileAppearanceIcon = 'moon' | 'sun' | 'system';
interface TurboFileIconPath {
	readonly d: string;
	readonly fillRule?: 'evenodd';
}
const PANE_SORT_OPTIONS: readonly { readonly key: TurboFileSortKey; readonly label: string }[] = [
	{ key: 'name', label: '名称' },
	{ key: 'modified', label: '修改日期' },
	{ key: 'type', label: '类型' },
	{ key: 'size', label: '大小' }
];
const PANE_SORT_DIRECTION_OPTIONS: readonly { readonly direction: TurboFileSortDirection; readonly label: string }[] = [
	{ direction: 'ascending', label: '递增' },
	{ direction: 'descending', label: '递减' }
];
const IMAGE_GRID_SORT_OPTIONS: readonly { readonly key: TurboFileImageGridSortKey; readonly label: string }[] = [
	{ key: 'name', label: '名称' },
	{ key: 'date', label: '修改日期' },
	{ key: 'type', label: '类型' },
	{ key: 'size', label: '大小' }
];
const IMAGE_GRID_SORT_DIRECTION_OPTIONS: readonly { readonly descending: boolean; readonly label: string }[] = [
	{ descending: false, label: '\u9012\u589e' },
	{ descending: true, label: '\u9012\u51cf' }
];
const IMAGE_GRID_COLUMN_MIN = 4;
// Default number of columns when the image grid opens (clamped down only when the body is too narrow
// to fit that many thumbnails) and the hard upper bound when zooming columns in.
const IMAGE_GRID_COLUMN_DEFAULT = 14;
const IMAGE_GRID_COLUMN_MAX = 32;
const IMAGE_GRID_NEIGHBOR_LOAD_COUNT = 2;
const IMAGE_GRID_OVERSCAN_ROWS = 1;
const IMAGE_GRID_CARD_GAP = 10;
const IMAGE_GRID_CARD_VERTICAL_CHROME = 58;
const IMAGE_GRID_CARD_VERTICAL_CHROME_WITHOUT_NAME = 18;
const IMAGE_GRID_CARD_INLINE_CHROME = 16;
const IMAGE_GRID_THUMB_MIN = 96;
// The legacy opening density keeps the 96px floor. Extra Ctrl+wheel zoom-out levels may gradually
// reduce that floor so a full-width surface can reach the new 32-column limit without changing the
// default appearance.
const IMAGE_GRID_THUMB_MIN_AT_MAX_COLUMNS = 48;
const IMAGE_GRID_THUMB_MAX = 640;
const IMAGE_GRID_THUMB_STEP = 64;
const IMAGE_GRID_ORIGINAL_CARD_DIMENSION_THRESHOLD = 100;
const IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD = 32;
const IMAGE_PREVIEW_ZOOM_MIN = 0.01;
const IMAGE_PREVIEW_ZOOM_MAX = 40;
const IMAGE_PREVIEW_BUTTON_ZOOM_DELTA = 3.5;
const IMAGE_PREVIEW_WHEEL_DIVISOR = 10;
const IMAGE_PREVIEW_WHEEL_DELTA_LIMIT = 5;
const IMAGE_PREVIEW_ZOOM_RATIO = 0.1;
const IMAGE_GRID_THUMB_QUALITY = 72;
const IMAGE_GRID_LOCAL_PARALLEL_LIMIT = 16;
const IMAGE_GRID_REMOTE_PARALLEL_LIMIT = 8;
const IMAGE_GRID_REMOTE_WINDOWS_PARALLEL_LIMIT = 6;
// The visible page is split into small chunks that are fetched in parallel (each chunk is one SSH
// exec). Running several at once lets the remote device downscale multiple images on different cores
// simultaneously instead of one sequential queue — the main reason large-image pages were slow.
// Concurrency stays under the SSH MaxSessions ceiling so channels are never exhausted.
const IMAGE_GRID_BATCH_CHUNK_COUNT = 8;
const IMAGE_GRID_BATCH_CONCURRENCY = 5;
// If a batched thumbnail comes back larger than this, the remote did not downscale it (no image tool;
// it streamed the raw original), so the client downscales it before showing — keeps tool-less boards
// (e.g. uncompressed .bmp) fast and low-memory. Smaller payloads render via a native <img> directly.
const IMAGE_GRID_CLIENT_DOWNSCALE_BYTES = 320 * 1024;
// Preview reads the true original (cat, no SFTP/tool) up to this size; larger originals are decoded
// to a display-sized JPEG remotely instead, so a huge file never spikes client memory or fails to
// decode in the <img>.
const IMAGE_PREVIEW_RAW_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_PREVIEW_ELEMENT_LOAD_TIMEOUT_MS = 8000;
const IMAGE_GRID_TRANSIENT_RETRY_DELAY_MS = 650;
const IMAGE_GRID_DECODE_RETRY_LIMIT = 2;
// Wait this long after the last scroll movement before loading the visible page, so a fast drag/jump
// through many pages doesn't fire (and then have to abandon) a load for every page it passes.
const IMAGE_GRID_VISIBLE_LOAD_DEBOUNCE_MS = 110;
const IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT = 2;
const IMAGE_GRID_PREVIEW_PREFETCH_DELAY_MS = 80;
const IMAGE_DPR_CAP = 2;
const IMAGE_PREVIEW_MIN_DIM = 320;
const IMAGE_PREVIEW_MAX_DIM = 2200;
const IMAGE_PREVIEW_QUALITY = 82;
const IMAGE_PREVIEW_DIM_STEP = 128;
const IMAGE_READ_CACHE_MAX_ENTRIES = 512;
const IMAGE_READ_CACHE_MAX_BYTES = 8 * 1024 * 1024;
const TURBOFILE_APPEARANCE_DARK_THEME_LABEL = '2017 Dark (Visual Studio - C/C++)';
const TURBOFILE_APPEARANCE_LIGHT_THEME_LABEL = 'TurboFile Light';
const TURBOFILE_LIGHT_THEME_ID = ThemeSettingDefaults.COLOR_THEME_LIGHT;
const TURBOFILE_LIGHT_THEME_CLASS_ID = 'vs turbofile-light-2026';
const TURBOFILE_LIGHT_THEME_COLORS = {
	'focusBorder': '#042AFF',
	'foreground': '#111111',
	'descriptionForeground': '#6B7280',
	'disabledForeground': '#9E9E9E',
	'errorForeground': '#ef4444',
	'selection.background': '#DDE6FF',
	'icon.foreground': '#6B7280',
	'activityBar.background': '#ffffff',
	'activityBar.foreground': '#111111',
	'activityBar.inactiveForeground': '#6B7280',
	'activityBar.activeBorder': '#042AFF',
	'activityBar.activeBackground': '#F3F3F3',
	'activityBar.border': '#E5E7EB',
	'activityBarBadge.background': '#042AFF',
	'activityBarBadge.foreground': '#ffffff',
	'sideBar.background': '#ffffff',
	'sideBar.foreground': '#111111',
	'sideBar.border': '#E5E7EB',
	'sideBarTitle.foreground': '#111111',
	'sideBarSectionHeader.background': '#F3F3F3',
	'sideBarSectionHeader.foreground': '#111111',
	'sideBarSectionHeader.border': '#E5E7EB',
	'editor.background': '#ffffff',
	'editor.foreground': '#111111',
	'editorLineNumber.foreground': '#9E9E9E',
	'editorLineNumber.activeForeground': '#042AFF',
	'editorCursor.foreground': '#111111',
	'editor.selectionBackground': '#DDE6FF',
	'editor.inactiveSelectionBackground': '#EDF2FF',
	'editorIndentGuide.background1': '#E5E7EB',
	'editorIndentGuide.activeBackground1': '#9E9E9E',
	'editor.findMatchBackground': '#E1FF25',
	'editor.findMatchHighlightBackground': '#E1FF2580',
	'editorGroupHeader.tabsBackground': '#F3F3F3',
	'editorGroupHeader.tabsBorder': '#E5E7EB',
	'editorGroup.border': '#E5E7EB',
	'tab.activeBackground': '#ffffff',
	'tab.activeForeground': '#111111',
	'tab.activeBorder': '#042AFF',
	'tab.inactiveBackground': '#F3F3F3',
	'tab.inactiveForeground': '#6B7280',
	'tab.border': '#E5E7EB',
	'panel.background': '#ffffff',
	'panel.border': '#E5E7EB',
	'panelTitle.activeForeground': '#111111',
	'panelTitle.inactiveForeground': '#6B7280',
	'statusBar.background': '#111F68',
	'statusBar.foreground': '#ffffff',
	'statusBar.border': '#0B164B',
	'statusBar.noFolderBackground': '#111F68',
	'titleBar.activeBackground': '#ffffff',
	'titleBar.activeForeground': '#111111',
	'titleBar.inactiveBackground': '#ffffff',
	'titleBar.inactiveForeground': '#6B7280',
	'titleBar.border': '#E5E7EB',
	'list.activeSelectionBackground': '#EDF2FF',
	'list.activeSelectionForeground': '#111111',
	'list.inactiveSelectionBackground': '#F3F3F3',
	'list.inactiveSelectionForeground': '#111111',
	'list.hoverBackground': '#F3F3F3',
	'list.focusBackground': '#EDF2FF',
	'list.focusOutline': '#042AFF',
	'list.highlightForeground': '#042AFF',
	'input.background': '#ffffff',
	'input.foreground': '#111111',
	'input.border': '#E5E7EB',
	'input.placeholderForeground': '#9E9E9E',
	'dropdown.background': '#ffffff',
	'dropdown.foreground': '#111111',
	'dropdown.border': '#E5E7EB',
	'inputOption.activeBackground': '#EDF2FF',
	'inputOption.activeBorder': '#042AFF',
	'inputOption.activeForeground': '#042AFF',
	'button.background': '#042AFF',
	'button.foreground': '#ffffff',
	'button.hoverBackground': '#111F68',
	'button.secondaryBackground': '#ffffff',
	'button.secondaryForeground': '#111111',
	'button.secondaryHoverBackground': '#F3F3F3',
	'badge.background': '#EDF2FF',
	'badge.foreground': '#042AFF',
	'progressBar.background': '#22C55E',
	'breadcrumb.background': '#ffffff',
	'breadcrumb.foreground': '#6B7280',
	'breadcrumb.focusForeground': '#042AFF',
	'breadcrumb.activeSelectionForeground': '#042AFF',
	'scrollbar.shadow': '#00000000',
	'scrollbarSlider.background': '#D1D5DB80',
	'scrollbarSlider.hoverBackground': '#9E9E9E80',
	'scrollbarSlider.activeBackground': '#6B728080',
	'menu.background': '#ffffff',
	'menu.foreground': '#111111',
	'menu.selectionBackground': '#EDF2FF',
	'menu.selectionForeground': '#111111',
	'menu.border': '#E5E7EB',
	'quickInput.background': '#ffffff',
	'quickInput.foreground': '#111111',
	'quickInputList.focusBackground': '#EDF2FF',
	'editorWidget.background': '#ffffff',
	'editorWidget.foreground': '#111111',
	'editorWidget.border': '#E5E7EB',
	'widget.shadow': '#111F6814',
	'textLink.foreground': '#042AFF',
	'textLink.activeForeground': '#111111',
	'toolbar.hoverBackground': '#F3F3F3',
	'toolbar.activeBackground': '#EDF2FF',
	'notifications.background': '#ffffff',
	'notifications.foreground': '#111111',
	'notifications.border': '#E5E7EB',
	'terminal.background': '#ffffff',
	'terminal.foreground': '#111111',
	'gitDecoration.addedResourceForeground': '#22C55E',
	'gitDecoration.modifiedResourceForeground': '#042AFF',
	'gitDecoration.deletedResourceForeground': '#FF64DA',
	'editorGutter.addedBackground': '#22C55E',
	'editorGutter.modifiedBackground': '#042AFF',
	'editorGutter.deletedBackground': '#FF64DA',
	'testing.iconPassed': '#22C55E',
	'testing.iconFailed': '#ef4444',
	'testing.iconQueued': '#042AFF',
	'charts.blue': '#042AFF',
	'charts.green': '#22C55E',
	'charts.yellow': '#E1FF25',
	'charts.purple': '#FF64DA'
} as const;

export class TurboFileEditor extends EditorPane {
	static readonly ID: string = TurboFileEditorInput.EDITOR_ID;

	private readonly renderDisposables = this._register(new DisposableStore());
	private container: HTMLElement | undefined;
	private deviceStore: TurboFileDeviceStore | undefined;
	private devices: TurboFileDevice[] = [];
	private deviceOrderDragId: string | undefined;
	private deviceOrderDragCard: HTMLElement | undefined;
	private deviceOrderDropTarget: HTMLElement | undefined;
	private deviceOrderDragHorizontal = true;
	private pendingRenderAfterDeviceOrderDrag = false;
	private pendingDeviceOrderDrop: { readonly sourceId: string; readonly targetId: string; readonly position: 'before' | 'after' } | undefined;
	private deviceOrderWriteInProgress = false;
	private readonly deviceOrderDropScheduler = this._register(new RunOnceScheduler(() => this.completeDeviceOrderDrop(), 0));
	private imageGridState: TurboFileImageGridState | undefined;
	private readonly paneImageGridStates: Record<'left' | 'right', TurboFileImageGridState | undefined> = { left: undefined, right: undefined };
	private imageGridSortKey: TurboFileImageGridSortKey = 'name';
	private imageGridSortDescending = true;
	private readonly defaultImagePreviewSamplingMode: TurboFileImagePreviewSamplingMode = 'smooth';
	private syncPreviewState: TurboFileSyncPreviewState | undefined;
	private dialogState: TurboFileDialogState | undefined;
	private imageGridObserver: IntersectionObserver | undefined;
	private liveTransferTicker: number | undefined;
	private readonly transferMetricsDisplay = new TurboFileTransferMetricsDisplay();
	private imageGridScrollRenderTimer: ReturnType<typeof setTimeout> | undefined;
	// Thumbnails load only after scrolling settles, and only for the page in view; bumping the token
	// invalidates any batch still loading a page the user has scrolled away from (fast jumps).
	private readonly imageGridVisibleLoadTimers = new Map<TurboFileImageGridState, ReturnType<typeof setTimeout>>();
	private readonly imageGridThumbnailQueue: TurboFileImageGridThumbnailRequest[] = [];
	private readonly imageGridThumbnailQueued = new Set<string>();
	private imageGridThumbnailLoadingCount = 0;
	// Memoized scroll-body width. Measuring body.clientWidth forces a synchronous layout; reading it
	// once per card during a slice rebuild caused dozens of forced reflows per scroll frame, which
	// both janked scrolling and made the grid's scrollHeight momentarily collapse (the browser then
	// clamped scrollTop, producing the post-scroll "jump/jitter"). The body width only changes on
	// window/pane resize, so cache it and invalidate on layout() and full image-page renders.
	private imageGridPreviewRequestSeq = 0;
	private imageGridPreviewPrefetchTimer: ReturnType<typeof setTimeout> | undefined;
	private imageGridCtrlWheelDeltaRemainder = 0;
	private imagePreviewAnalysis: TurboFileImagePreviewAnalysis | undefined;
	private imagePreviewRender: TurboFileImagePreviewRender | undefined;
	private imagePreviewRenderSeq = 0;
	private imagePreviewResizeObserver: ResizeObserver | undefined;
	private readonly imageReadCache = new Map<string, TurboFileCachedImageReadResult>();
	private readonly fileListScrollRaf: Record<'left' | 'right', number> = { left: 0, right: 0 };
	private readonly fileListRestoreRaf: Record<'left' | 'right', number> = { left: 0, right: 0 };
	private readonly fileListRenderedRange: Record<'left' | 'right', { startIndex: number; endIndex: number; total: number } | undefined> = { left: undefined, right: undefined };
	// Lazy size/date enrichment of names-only listings: serialize per side and remember if more
	// rows scrolled into view while a batch was in flight so they get picked up right after.
	private readonly attrsEnrichInFlight: Record<'left' | 'right', boolean> = { left: false, right: false };
	private readonly attrsEnrichAgain: Record<'left' | 'right', boolean> = { left: false, right: false };
	private readonly attrsEnrichRetryHandle: Record<'left' | 'right', number | undefined> = { left: undefined, right: undefined };
	private readonly attrsEnrichRetryState: Record<'left' | 'right', { path: string; count: number } | undefined> = { left: undefined, right: undefined };
	private readonly paneDirectoryCache = new Map<string, TurboFileDirectoryCacheEntry>();
	private readonly paneDirectoryInflight = new TurboFileDirectoryInflightTracker<TurboFileDirectoryCacheEntry>();
	private readonly paneDirectoryPrefetchQueue = new TurboFileDirectoryPrefetchQueue(PANE_DIRECTORY_PREFETCH_CONCURRENCY);
	private readonly paneDeviceSnapshots = new Map<string, TurboFilePaneDeviceSnapshot>();
	private activePage: TurboFileWorkbenchPage = 'transfer';
	private activeFilePaneSide: 'left' | 'right' = 'left';
	private isTaskLogVisible = false;
	private localWindowsDevice: TurboFileDevice;
	private readonly paneStates: Record<'left' | 'right', TurboFilePaneState>;
	private readonly paneRequestSeq: Record<'left' | 'right', number> = { left: 0, right: 0 };
	private readonly paneDoubleClickState: Record<'left' | 'right', TurboFilePaneDoubleClickState> = {
		left: { lastAt: 0 },
		right: { lastAt: 0 }
	};
	private isDeviceFormVisible = false;
	private hasAppliedInitialRightPaneDefault = false;
	private editingDeviceId: string | undefined;
	private deviceFormMessage = '';
	private openDeviceSelectSide: 'left' | 'right' | undefined;
	private pendingRenderAfterDeviceSelectClose = false;
	private readonly deviceConnectionMessages = new Map<string, { status: 'testing' | 'success' | 'error'; message: string }>();
	private readonly deviceRuntimeStatuses = new Map<string, TurboFileDeviceRuntimeStatus>();
	private availableColorThemes: IWorkbenchColorTheme[] = [];
	private isLoadingColorThemes = false;
	private hasLoadedColorThemes = false;
	private remoteFileSystemProvider: TurboFileRemoteFileSystemProvider | undefined;
	private taskbarHiddenForTerminal = false;
	private terminalRevealInProgress = false;
	private pendingAppearanceMode: 'light' | 'dark' | undefined;
	private appearanceTransitionTimer: number | undefined;
	private externalDropTargetSide: 'left' | 'right' | undefined;
	private nativeDragSession: TurboFileNativeDragSession<TurboFileFileItem> | undefined;
	private maximizedPane: 'left' | 'right' | undefined;
	private paneSplitRatio = TURBOFILE_PANE_SPLIT_DEFAULT_RATIO;
	private paneSplitReflowRaf = 0;
	private paneSplitReflowShouldLoad = false;
	private internalTransferClipboard: TurboFileInternalTransferClipboard | undefined;
	private inlineRename: TurboFileInlineRenameState | undefined;
	private readonly windowsClipboardPasteInFlight = new Set<string>();
	private availableWindowsDriveRoots: string[] = [];
	private resolvedWindowsDesktopPath: string | undefined;
	private statusMessage = '极速传已启动：双栏浏览、设备管理、传输、预览和终端入口已接入。';
	private taskSequence = 1;
	private readonly tasks: TurboFileTask[] = [];
	private editorGroupContainer: HTMLElement | undefined;
	private hasEditorGroupClassReference = false;
	private currentInput: TurboFileEditorInput | undefined;
	private isEditorVisible = false;
	private aboutDialogElement: HTMLElement | undefined;
	private remoteDocumentLabelFormatterRegistered = false;
	private preparingTransferPairKey: string | undefined;
	private preparedTransferPairKey: string | undefined;
	private readonly preparedTransferConnections = new Map<string, Promise<ITurboFileSshConnectionOptions>>();
	private preparedTransferPairGeneration = 0;
	private preparedTransferPairRetryCount = 0;
	private readonly preparedTransferPairScheduler = this._register(new RunOnceScheduler(() => {
		if (this.isEditorVisible) {
			this.prewarmCurrentTransferPair(true);
		}
	}, PREPARED_TRANSFER_PAIR_REFRESH_MS));
	private readonly postTransferReconcileContexts = new Map<'left' | 'right', TurboFileTransferLocation>();
	private readonly postTransferReconcileGeneration: Record<'left' | 'right', number> = { left: 0, right: 0 };
	private readonly postTransferReconcileScheduler = this._register(new RunOnceScheduler(() => {
		const contexts = Array.from(this.postTransferReconcileContexts.entries());
		this.postTransferReconcileContexts.clear();
		for (const [side, context] of contexts) {
			const generation = this.postTransferReconcileGeneration[side];
			void this.reconcilePaneAfterTransfer(side, context, generation);
		}
	}, POST_TRANSFER_RECONCILE_DELAY_MS));

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchThemeService private readonly workbenchThemeService: IWorkbenchThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IPathService private readonly pathService: IPathService,
		@ITurboFileSshService private readonly sshService: ITurboFileSshService,
		@ITurboFileJournalService private readonly journalService: ITurboFileJournalService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IFileService private readonly fileService: IFileService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextEditorService private readonly textEditorService: ITextEditorService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@ITerminalGroupService private readonly terminalGroupService: ITerminalGroupService,
		@ITerminalProfileService private readonly terminalProfileService: ITerminalProfileService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IProductService private readonly productService: IProductService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super((new.target as typeof TurboFileEditor).ID, group, telemetryService, workbenchThemeService, storageService);

		this.paneSplitRatio = this.readPaneSplitRatio();
		this.localWindowsDevice = this.createLocalWindowsDevice();
		const localWindowsDefaultPath = this.getLocalWindowsDeviceDefaultPath();
		this.paneStates = {
			left: {
				deviceId: LOCAL_WINDOWS_DEVICE_ID,
				path: localWindowsDefaultPath,
				items: [],
				loading: false,
				selectedPaths: new Set(),
				scrollTop: 0,
				viewportHeight: 0,
				sortKey: 'name',
				sortDirection: 'descending',
				trashMode: leaveTurboFileTrashView(),
				trashItems: [],
				trashHasItems: false,
				trashStateKnown: false
			},
			right: {
				deviceId: LOCAL_WINDOWS_DEVICE_ID,
				path: localWindowsDefaultPath,
				items: [],
				loading: false,
				selectedPaths: new Set(),
				scrollTop: 0,
				viewportHeight: 0,
				sortKey: 'name',
				sortDirection: 'descending',
				trashMode: leaveTurboFileTrashView(),
				trashItems: [],
				trashHasItems: false,
				trashStateKnown: false
			}
		};
	}

	protected createEditor(parent: HTMLElement): void {
		this.editorGroupContainer = parent.closest('.editor-group-container') as HTMLElement | undefined;
		this.acquireEditorGroupClassReference();
		this.container = $('.turbofile-workbench');
		parent.appendChild(this.container);
		this.deviceStore = this._register(this.instantiationService.createInstance(TurboFileDeviceStore));
		this._register(this.deviceStore.onDidChangeDeviceSecret(() => {
			this.invalidatePreparedTransferPair();
			if (this.isEditorVisible) {
				this.preparedTransferPairScheduler.schedule(0);
			}
		}));
		this._register(this.deviceStore.onDidChangeDeviceOrder(() => {
			this.devices = this.deviceStore?.loadDevices() ?? [];
			if (this.isEditorVisible && !this.deviceOrderWriteInProgress) {
				this.render();
			}
		}));
		this.devices = this.deviceStore.loadDevices();
		void this.ensureDefaultSshDevices().catch(error => this.handleDefaultSshDevicesError(error));
		void this.ensureTurboFileChrome();
		this.ensureRemoteFileSystemProvider();
		this._register(turboFileWorkbenchBridge.onDidRunCommand(command => this.handleWorkbenchCommand(command)));
		this._register(this.terminalService.onDidDisposeInstance(instance => this.clearTerminalBindingForInstance(instance.instanceId)));
		this._register(this.layoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.PANEL_PART && !event.visible && !this.terminalRevealInProgress && !isTurboFileTerminalPanelVisibilityInProgress()) {
				this.rememberTerminalPanelHiddenForCurrentPage();
				this.restoreTaskbarAfterTerminal();
			}
		}));
		this._register(this.workbenchThemeService.onDidColorThemeChange(() => {
			this.applyTurboFileThemeState();
			this.ensureTitlebarChrome();
		}));
		this._register(this.updateService.onStateChange(() => this.ensureTitlebarAppMenu()));
		void this.syncNativeEditorDisplaySettings();
		void this.loadColorThemes();
		void this.refreshWindowsDriveRoots();
		void this.refreshWindowsDesktopPath();
		this.ensureTitlebarChrome();
		this.ensurePaneDeviceSelection({ preferFirstSshOnRight: true });
		this.render();
		this.prewarmCurrentTransferPair();
		void Promise.all([this.refreshPane('left'), this.refreshPane('right')]).finally(() => this.prewarmCurrentTransferPair());
		void this.prefetchDefaultDeviceDirectories();
	}

	private acquireEditorGroupClassReference(): void {
		if (!this.editorGroupContainer || this.hasEditorGroupClassReference) {
			return;
		}

		const referenceCount = turboFileEditorGroupReferenceCounts.get(this.editorGroupContainer) ?? 0;
		turboFileEditorGroupReferenceCounts.set(this.editorGroupContainer, referenceCount + 1);
		this.editorGroupContainer.classList.add('turbofile-main-editor-group');
		this.hasEditorGroupClassReference = true;
	}

	private releaseEditorGroupClassReference(): void {
		if (!this.editorGroupContainer || !this.hasEditorGroupClassReference) {
			return;
		}

		const referenceCount = turboFileEditorGroupReferenceCounts.get(this.editorGroupContainer) ?? 0;
		if (referenceCount <= 1) {
			turboFileEditorGroupReferenceCounts.delete(this.editorGroupContainer);
			this.editorGroupContainer.classList.remove('turbofile-main-editor-group');
		} else {
			turboFileEditorGroupReferenceCounts.set(this.editorGroupContainer, referenceCount - 1);
		}
		this.hasEditorGroupClassReference = false;
	}

	private async ensureTurboFileChrome(): Promise<void> {
		// Keep native editor chrome controlled by layout state instead of permanently mutating user settings.
	}

	private async ensureDefaultSshDevices(): Promise<void> {
		if (!this.deviceStore) {
			return;
		}

		const result = await this.deviceStore.ensureDefaultDevices();
		if (!result.added && !result.updated && !result.removed) {
			return;
		}

		this.devices = this.deviceStore.loadDevices();
		this.invalidatePreparedTransferPair();
		this.ensurePaneDeviceSelection({ preferFirstSshOnRight: result.added > 0 });
		this.statusMessage = result.removed
			? `已清理内置 SSH 设备 ${result.removed} 台。`
			: `已加载默认 SSH 设备：新增 ${result.added} 台，更新 ${result.updated} 台。`;
		this.render();
		this.prewarmCurrentTransferPair();
		void Promise.all([this.refreshPane('left'), this.refreshPane('right')]).finally(() => this.prewarmCurrentTransferPair());
		void this.prefetchDefaultDeviceDirectories();
	}

	private handleDefaultSshDevicesError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		this.statusMessage = `Default SSH devices failed to load: ${message}`;
		this.render();
	}

	private async refreshDevicesFromStore(): Promise<void> {
		try {
			await this.ensureDefaultSshDevices();
		} catch (error) {
			this.handleDefaultSshDevicesError(error);
			return;
		}
		this.devices = this.deviceStore?.loadDevices() ?? [];
		this.invalidatePreparedTransferPair();
		this.ensurePaneDeviceSelection();
		this.statusMessage = `Device list refreshed: ${this.devices.length} SSH devices.`;
		this.render();
		this.prewarmCurrentTransferPair(true);
	}

	override async setInput(input: TurboFileEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		const previousInput = this.currentInput;
		const isPageSwitch = !!previousInput && previousInput.instanceId !== input.instanceId;
		if (isPageSwitch) {
			this.clearCurrentFileDragState();
			// Save the page we are leaving before its selection is overwritten, then give the incoming
			// page its own selection back. This is what makes a page keep its server/path/sort after a
			// group merge or tab switch instead of showing the previous page's.
			this.capturePaneSelectionForCurrentPage();
		}
		this.currentInput = input;
		if (isPageSwitch) {
			if (!this.restorePaneSelectionForPage(input.instanceId)) {
				this.resetPaneSelectionToDefault();
			}
			this.refreshBothPanesAfterPageRestore();
		}
		// Record the incoming page's current selection so even an untouched page can be restored later.
		this.capturePaneSelectionForCurrentPage();
		input.setCancelRunningTasksForClose(() => this.cancelRunningTasksForClose());
		input.setCleanupForClose(() => this.disposeBoundTerminalsForPage(input.instanceId));
		this.updateInputRunningTaskCount();
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested) {
			void this.syncActiveTerminalForCurrentPage();
			this.notifyActivePageChanged();
			this.render();
		}
	}

	private refreshBothPanesAfterPageRestore(): void {
		// A reused editor pane can switch to a completely different pair of devices. Invalidate the
		// renderer-side preparation state before any transfer can observe the restored selection, then
		// start the new pair proof immediately while the directory refreshes continue in parallel.
		this.invalidatePreparedTransferPair();
		this.prewarmCurrentTransferPair(true);
		for (const side of ['left', 'right'] as const) {
			const state = this.paneStates[side];
			++this.paneRequestSeq[side];
			state.items = [];
			state.error = undefined;
			this.resetPaneScroll(side);
			this.clearPaneSelection(side);
			void this.refreshPane(side, { force: false, silent: true });
		}
	}

	override layout(_dimension: Dimension, _position?: IDomPosition): void {
		// CSS grid owns the fast-transfer two-pane layout.
		// The image-grid body width is derived from the viewport, so drop its cache on resize.
		this.invalidateAllImageGridLayoutCaches();
		this.schedulePaneSplitImageGridReflow();
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		this.isEditorVisible = visible;
		this.syncGlobalEditorVisibility();
		if (visible) {
			void this.syncActiveTerminalForCurrentPage();
			this.applyTurboFileThemeState();
			this.ensureTitlebarChrome();
			this.prewarmCurrentTransferPair(true);
		} else {
			this.preparedTransferPairScheduler.cancel();
			this.finishDeviceOrderDrag();
		}
	}

	override focus(): void {
		this.container?.focus();
	}

	override dispose(): void {
		this.isEditorVisible = false;
		this.finishDeviceOrderDrag();
		const hasVisibleTurboFileEditor = this.syncGlobalEditorVisibility();
		if (!hasVisibleTurboFileEditor) {
			document.body.classList.remove('turbofile-editor-theme-light', 'turbofile-editor-theme-dark', 'turbofile-theme-switching');
		}
		if (this.appearanceTransitionTimer !== undefined) {
			getWindow(this.container).clearTimeout(this.appearanceTransitionTimer);
			this.appearanceTransitionTimer = undefined;
		}
		this.releaseEditorGroupClassReference();
		this.closeAboutDialog();
		this.removeTitlebarAppMenu();
		this.removeTitlebarThemeToggle();
		this.clearLiveTransferTicker();
		this.clearFileListScrollRaf('left');
		this.clearFileListScrollRaf('right');
		this.clearFileListRestoreRaf('left');
		this.clearFileListRestoreRaf('right');
		this.clearPaneSplitReflowRaf();
		for (const side of ['left', 'right'] as const) {
			if (this.attrsEnrichRetryHandle[side] !== undefined) {
				getWindow(this.container).clearTimeout(this.attrsEnrichRetryHandle[side]);
				this.attrsEnrichRetryHandle[side] = undefined;
			}
		}
		this.releaseAllImageGridStates();
		this.disposeImageGridObserver();
		this.clearImageGridScrollTimer();
		this.clearImageGridScrollRaf();
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		super.dispose();
	}

	private render(): void {
		if (!this.container) {
			return;
		}
		if (this.deviceOrderDragId) {
			if (this.activePage === 'devices') {
				// Keep the native drag's source attached while background device status updates arrive.
				this.pendingRenderAfterDeviceOrderDrag = true;
				return;
			}
			this.finishDeviceOrderDrag();
		}
		if (this.shouldDeferRenderForOpenDeviceSelect()) {
			this.pendingRenderAfterDeviceSelectClose = true;
			return;
		}

		this.pendingRenderAfterDeviceSelectClose = false;
		const retainedDeviceFormOverlay = this.isDeviceFormVisible
			? this.container.querySelector<HTMLElement>(':scope > .turbofile-device-overlay') ?? undefined
			: undefined;
		this.clearPaneSplitReflowRaf();
		this.renderDisposables.clear();
		this.clearContainerForRender(retainedDeviceFormOverlay);
		this.ensurePaneDeviceSelection();
		this.applyBrowserAppearanceSettings();
		this.applyTurboFileThemeState();
		void this.renderLegacyImageGridOverlay;

		const shell = $('.turbofile-editor-shell');
		const content = $('.turbofile-editor-content');
		content.appendChild(this.renderActivePage());
		shell.appendChild(content);
		if (retainedDeviceFormOverlay) {
			this.container.insertBefore(shell, retainedDeviceFormOverlay);
		} else {
			this.container.appendChild(shell);
		}
		this.registerWorkbenchKeyboardShortcuts();
		this.registerWindowFileDropInterceptor();
		this.ensureTitlebarChrome();

		const previewState = this.getActiveImageGridPreviewState();
		if (previewState) {
			this.setActiveImageGridState(previewState);
			this.container.appendChild(this.renderImagePreviewOverlay(previewState));
		}
		if (this.syncPreviewState) {
			this.container.appendChild(this.renderSyncPreviewOverlay());
		}
		if (this.isTaskLogVisible) {
			this.container.appendChild(this.renderTaskLogOverlay());
		}
		if (this.isDeviceFormVisible && !retainedDeviceFormOverlay) {
			this.container.appendChild(this.renderDeviceForm());
		}
		if (this.dialogState) {
			this.container.appendChild(this.renderDialogOverlay());
		}
		this.bindImageGridObserver();
	}

	private clearContainerForRender(retainedChild?: HTMLElement): void {
		if (!this.container) {
			return;
		}
		for (const child of Array.from(this.container.children)) {
			if (child !== retainedChild) {
				child.remove();
			}
		}
	}

	private renderActivePage(): HTMLElement {
		if (this.activePage === 'devices') {
			return this.renderDevicesPage();
		}
		if (this.activePage === 'settings') {
			return this.renderSettingsPage();
		}
		if (this.activePage === 'tasks') {
			return this.renderTasksPage();
		}
		if (this.activePage === 'images') {
			return this.renderImageGridPage();
		}
		return this.renderTransferPage();
	}

	private registerWorkbenchKeyboardShortcuts(): void {
		if (!this.container) {
			return;
		}

		const handleKeydown = (event: KeyboardEvent) => this.handleWorkbenchKeydown(event);
		this.container.addEventListener('keydown', handleKeydown);
		const ownerWindow = getWindow(this.container);
		ownerWindow.addEventListener('keydown', handleKeydown, true);
		this.renderDisposables.add({ dispose: () => this.container?.removeEventListener('keydown', handleKeydown) });
		this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener('keydown', handleKeydown, true) });
	}

	/**
	 * Intercept EXTERNAL (OS) file drags at the window in the capture phase — i.e. before the VS Code
	 * workbench's own editor drop target, which would otherwise open the dropped file as an editor
	 * instead of transferring it. We only take over external file drops; internal pane-to-pane drags
	 * keep flowing to the existing pane/list handlers. This guarantees dropping (or pasting) a local
	 * file/folder onto the app always transfers and never opens the file.
	 */
	private registerWindowFileDropInterceptor(): void {
		if (!this.container) {
			return;
		}
		const ownerWindow = getWindow(this.container);
		const onDragEnter = (event: DragEvent) => this.handleTurboFileDragEnterCapture(event);
		const onDragOver = (event: DragEvent) => this.handleWindowFileDragOver(event);
		const onDrop = (event: DragEvent) => this.handleWindowFileDrop(event);
		this.container.addEventListener('dragenter', onDragEnter, true);
		ownerWindow.addEventListener('dragover', onDragOver, true);
		ownerWindow.addEventListener('drop', onDrop, true);
		this.renderDisposables.add({ dispose: () => this.container?.removeEventListener('dragenter', onDragEnter, true) });
		this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener('dragover', onDragOver, true) });
		this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener('drop', onDrop, true) });
	}

	/**
	 * Keep TurboFile drags inside TurboFile before VS Code's editor drop target sees dragenter.
	 * Chromium can otherwise expose an image element as a native `Files` drag for the first event,
	 * causing the workbench to cover both panes with its editor-drop overlay and steal the drop.
	 * Only dragenter is intercepted here: dragover/drop must continue to the concrete pane target.
	 */
	private handleTurboFileDragEnterCapture(event: DragEvent): void {
		const sourceSide = this.nativeDragSession?.sourceSide ?? this.getTurboFileDragSourceSide(event);
		if (sourceSide) {
			this.consumeTurboFileDropEvent(event);
			if (event.dataTransfer) {
				const operation = this.nativeDragSession?.operation ?? this.getDragOperationFromEvent(event, sourceSide);
				event.dataTransfer.dropEffect = getTurboFileDropEffect(operation);
			}
			return;
		}

		// Prevent the workbench editor overlay from flashing before the existing external-file
		// dragover/drop interceptor routes the OS drop into the correct TurboFile pane.
		if (this.shouldInterceptExternalFileDrop(event)) {
			this.handleWindowFileDragOver(event);
		}
	}

	private shouldInterceptExternalFileDrop(event: DragEvent): boolean {
		return this.isEditorVisible
			&& (this.activePage === 'transfer' || this.activePage === 'images')
			&& !this.dialogState && !this.isDeviceFormVisible && !this.isTaskLogVisible
			&& !this.nativeDragSession
			&& !this.getTurboFileDragSourceSide(event)
			&& this.hasExternalDropData(event);
	}

	private handleWindowFileDragOver(event: DragEvent): void {
		if (!this.shouldInterceptExternalFileDrop(event)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const targetSide = this.activePage === 'images'
			? (this.imageGridState?.side ?? this.activeFilePaneSide)
			: this.getExternalDropSideFromEvent(event);
		const operation = this.getDragOperationFromEvent(event, targetSide);
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = getTurboFileDropEffect(operation);
		}
		if (this.activePage === 'transfer') {
			this.setExternalDropTargetSide(targetSide);
		}
	}

	private handleWindowFileDrop(event: DragEvent): void {
		if (!this.shouldInterceptExternalFileDrop(event)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const initiatedAt = Date.now();
		const side = this.activePage === 'images'
			? (this.imageGridState?.side ?? this.activeFilePaneSide)
			: this.getExternalDropSideFromEvent(event);
		const operation = this.getDragOperationFromEvent(event, side);
		this.setExternalDropTargetSide(undefined);
		const externalPaths = this.extractExternalDropPaths(event);
		this.clearCurrentFileDragState();
		if (externalPaths.length) {
			this.deferAfterDrag(() => void this.transferExternalPaths(side, externalPaths, operation, initiatedAt));
		}
	}

	/**
	 * Resolve which pane an external drop lands on. Prefer the pane under the drag target; fall back to
	 * the pointer X position relative to the pane rectangles so a drop on a gap/header still routes to
	 * the pane the user is clearly over (rather than defaulting to a stale "active" side).
	 */
	private getExternalDropSideFromEvent(event: DragEvent): 'left' | 'right' {
		const bySide = this.getPaneSideFromElement(event.target instanceof HTMLElement ? event.target : undefined);
		if (bySide) {
			this.activeFilePaneSide = bySide;
			return bySide;
		}
		const x = event.clientX;
		const rightPane = this.container?.querySelector<HTMLElement>('.turbofile-pane[data-turbofile-side="right"]');
		if (rightPane) {
			const rect = rightPane.getBoundingClientRect();
			if (rect.width > 0 && x >= rect.left) {
				this.activeFilePaneSide = 'right';
				return 'right';
			}
		}
		const leftPane = this.container?.querySelector<HTMLElement>('.turbofile-pane[data-turbofile-side="left"]');
		if (leftPane) {
			const rect = leftPane.getBoundingClientRect();
			if (rect.width > 0 && x <= rect.right) {
				this.activeFilePaneSide = 'left';
				return 'left';
			}
		}
		return this.activeFilePaneSide;
	}

	private handleWorkbenchKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || !this.isKeyboardEventFromTurboFileSurface(event.target)) {
			return;
		}

		if (this.handleImageGridKeyboardShortcut(event)) {
			return;
		}

		if (this.handlePaneKeyboardShortcut(event)) {
			return;
		}

		if ((event.key !== 'Delete' && event.code !== 'Delete') || event.ctrlKey || event.metaKey || event.altKey) {
			return;
		}

		const side = this.getDeleteKeyboardTargetSide(event);
		if (!side) {
			return;
		}

		event.preventDefault();
		void this.deleteSelected(side);
	}

	private handlePaneKeyboardShortcut(event: KeyboardEvent): boolean {
		if (this.activePage !== 'transfer' || this.dialogState || this.getActiveImageGridPreviewState()?.previewVisible || this.isDeviceFormVisible || this.isTaskLogVisible) {
			return false;
		}
		if (!(event.ctrlKey || event.metaKey) || event.altKey) {
			return false;
		}

		const key = this.getClipboardShortcutKey(event);
		if (key !== 'a' && key !== 'c' && key !== 'x' && key !== 'v') {
			return false;
		}

		const target = event.target;
		if (!this.isKeyboardEventFromTurboFileSurface(target) || this.isEditableKeyboardTarget(target)) {
			return false;
		}

		const targetElement = target instanceof HTMLElement ? target : undefined;
		if (targetElement?.closest('.turbofile-inline-rename, .turbofile-dialog, .turbofile-device-form, .turbofile-device-select.is-open, .turbofile-image-page')) {
			return false;
		}

		const side = this.getPaneSideFromElement(targetElement) ?? this.activeFilePaneSide;
		if (!side) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();
		this.setActiveFilePaneSide(side);

		if (key === 'a') {
			this.selectAllPaneItems(side);
			return true;
		}
		if (key === 'c' || key === 'x') {
			this.copySelectedToInternalClipboard(side, key === 'x' ? 'move' : 'copy', false);
			return true;
		}

		void this.pasteIntoPane(side);
		return true;
	}

	private handleImageGridKeyboardShortcut(event: KeyboardEvent): boolean {
		const targetElement = event.target instanceof HTMLElement ? event.target : undefined;
		const targetSide = this.getPaneSideFromElement(targetElement);
		const focusedPaneState = targetSide && targetElement?.closest('.turbofile-pane-image-grid')
			? this.paneImageGridStates[targetSide]
			: undefined;
		const state = this.getActiveImageGridPreviewState() ?? focusedPaneState ?? this.imageGridState;
		if (!state || !this.isImageGridSurfaceActive(state) || this.dialogState || this.isDeviceFormVisible || this.isTaskLogVisible) {
			return false;
		}

		// While the single-image preview is open, Left/Right always step between images. Handle it here
		// in the capture-phase workbench handler — not only on the overlay's own keydown — so it works
		// no matter which element holds focus (the overlay easily loses focus to a button, the canvas, or
		// the file list behind it, which is why the arrows previously appeared to do nothing).
		if (state.previewVisible && !this.isEditableKeyboardTarget(event.target) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
			event.preventDefault();
			event.stopPropagation();
			this.moveImageGridPreview(event.key === 'ArrowLeft' ? -1 : 1, state);
			return true;
		}

		const target = event.target;
		if (!this.isKeyboardEventFromTurboFileSurface(target) || this.isEditableKeyboardTarget(target)) {
			return false;
		}

		if (state.displayMode === 'pane' && !state.previewVisible && !targetElement?.closest('.turbofile-pane-image-grid')) {
			return false;
		}
		if (targetElement?.closest('.turbofile-dialog, .turbofile-device-form, .turbofile-image-page-sort.is-open')) {
			return false;
		}

		if ((event.key === 'Delete' || event.code === 'Delete') && !event.ctrlKey && !event.metaKey && !event.altKey) {
			event.preventDefault();
			void this.deleteSelectedImageGridItems(state);
			return true;
		}

		if (!state.previewVisible && (event.ctrlKey || event.metaKey) && !event.altKey) {
			const key = this.getClipboardShortcutKey(event);
			if (key === 'a') {
				event.preventDefault();
				this.selectAllImageGridItems(state);
				return true;
			}
			if (key === 'c' || key === 'x') {
				event.preventDefault();
				this.copyImageGridSelectionToInternalClipboard(state, key === 'x' ? 'move' : 'copy');
				return true;
			}
			if (key === 'v') {
				event.preventDefault();
				void this.pasteIntoPane(getTurboFileImageGridPasteTargetSide(state.side, this.internalTransferClipboard?.sourceSide));
				return true;
			}
		}

		return false;
	}

	private isImageGridSurfaceActive(state: TurboFileImageGridState): boolean {
		if (state.displayMode === 'page') {
			return this.activePage === 'images' && this.imageGridState === state;
		}
		return this.activePage === 'transfer' && this.paneImageGridStates[state.side] === state;
	}

	private setActiveImageGridState(state: TurboFileImageGridState): void {
		this.imageGridState = state;
		this.setActiveFilePaneSide(state.side);
	}

	private getActiveImageGridPreviewState(): TurboFileImageGridState | undefined {
		const activeState = this.imageGridState;
		if (activeState?.previewVisible && this.isImageGridSurfaceActive(activeState)) {
			return activeState;
		}
		for (const state of Object.values(this.paneImageGridStates)) {
			if (state?.previewVisible && this.isImageGridSurfaceActive(state)) {
				return state;
			}
		}
		return undefined;
	}

	private getVisibleImageGridStates(): TurboFileImageGridState[] {
		const states: TurboFileImageGridState[] = [];
		if (this.activePage === 'images' && this.imageGridState?.displayMode === 'page') {
			states.push(this.imageGridState);
		}
		if (this.activePage === 'transfer') {
			for (const state of Object.values(this.paneImageGridStates)) {
				if (state) {
					states.push(state);
				}
			}
		}
		return states;
	}

	private releaseImageGridState(state: TurboFileImageGridState | undefined): void {
		if (!state) {
			return;
		}
		state.paneDomDisposables?.dispose();
		state.paneDomDisposables = undefined;
		state.retainedPaneRoot = undefined;
		this.releaseImageGridStateImages(state);
		this.clearImageGridVisibleLoadTimer(state);
		this.clearImageGridStateScrollRaf(state);
		this.clearImageGridLoadedImageIndexes(state);
		this.clearImageGridLayoutMetrics(state);
		state.renderedRange = undefined;
		state.bodyWidthCache = undefined;
		if (this.imageGridState === state) {
			this.imageGridState = undefined;
		}
		if (state.displayMode === 'pane' && this.paneImageGridStates[state.side] === state) {
			this.paneImageGridStates[state.side] = undefined;
		}
		state.dimensionMetadataGeneration++;
	}

	private releaseAllImageGridStates(): void {
		const seen = new Set<TurboFileImageGridState>();
		for (const state of [this.imageGridState, ...Object.values(this.paneImageGridStates)]) {
			if (state && !seen.has(state)) {
				seen.add(state);
				this.releaseImageGridState(state);
			}
		}
		this.imageGridState = undefined;
		this.paneImageGridStates.left = undefined;
		this.paneImageGridStates.right = undefined;
	}

	private getDeleteKeyboardTargetSide(event: KeyboardEvent): 'left' | 'right' | undefined {
		if (this.activePage !== 'transfer' || this.dialogState || this.getActiveImageGridPreviewState()?.previewVisible || this.isDeviceFormVisible || this.isTaskLogVisible) {
			return undefined;
		}

		const target = event.target;
		if (!this.isKeyboardEventFromTurboFileSurface(target)) {
			return undefined;
		}
		if (this.isEditableKeyboardTarget(target)) {
			return undefined;
		}

		const targetElement = target instanceof HTMLElement ? target : undefined;
		if (targetElement?.closest('.turbofile-inline-rename, .turbofile-dialog, .turbofile-device-form, .turbofile-device-select.is-open')) {
			return undefined;
		}

		const targetSide = this.getPaneSideFromElement(targetElement);
		if (targetSide) {
			this.activeFilePaneSide = targetSide;
			return targetSide;
		}

		const leftSelected = this.getSelectedTransferItems('left').length > 0;
		const rightSelected = this.getSelectedTransferItems('right').length > 0;
		if (leftSelected && rightSelected) {
			return this.activeFilePaneSide;
		}
		if (leftSelected) {
			return 'left';
		}
		if (rightSelected) {
			return 'right';
		}
		return undefined;
	}

	private isKeyboardEventFromTurboFileSurface(target: EventTarget | null): boolean {
		if (!this.container || !this.isEditorVisible) {
			return false;
		}

		if (target instanceof Node && this.container.contains(target)) {
			return true;
		}

		const ownerDocument = this.container.ownerDocument;
		// A render removes the focused list and leaves focus on the document. Only the active editor
		// may use its remembered side in that case; hidden tabs and other groups keep their listeners.
		return (target === ownerDocument.body || target === ownerDocument.documentElement)
			&& !!this.currentInput && this.editorService.activeEditor === this.currentInput;
	}

	private getPaneSideFromElement(element: HTMLElement | undefined): 'left' | 'right' | undefined {
		const side = element?.closest<HTMLElement>('.turbofile-pane[data-turbofile-side]')?.dataset.turbofileSide;
		return side === 'left' || side === 'right' ? side : undefined;
	}

	private setActiveFilePaneSide(side: 'left' | 'right'): void {
		this.activeFilePaneSide = side;
	}

	private getClipboardShortcutKey(event: KeyboardEvent): string {
		const key = event.key.toLowerCase();
		// IMEs can report Process/Unidentified while the physical shortcut key remains available.
		if ((key === 'process' || key === 'unidentified' || key === '') && /^Key[ACXV]$/.test(event.code)) {
			return event.code.slice(3).toLowerCase();
		}
		return key;
	}

	/** Clears the current native drag session and every transient target highlight. */
	private clearCurrentFileDragState(): void {
		this.nativeDragSession = undefined;
		this.setExternalDropTargetSide(undefined);
		this.clearInternalDropTargetHighlight();
	}

	/**
	 * Defers work triggered by a drop until after the current drop event returns. Re-rendering the
	 * file list synchronously inside the drop handler removes the dragged source row before the
	 * browser has finished tearing down the drag, which can leave the drag image (the lingering
	 * "shadow") floating on screen. Running on the next timer tick lets that teardown complete first.
	 */
	private deferAfterDrag(action: () => void): void {
		const ownerWindow = getWindow(this.container);
		ownerWindow.setTimeout(action, 0);
	}

	private clearInternalDropTargetHighlight(): void {
		for (const row of this.container?.querySelectorAll<HTMLElement>('.turbofile-file-row.is-internal-drop-target') ?? []) {
			row.classList.remove('is-internal-drop-target');
		}
	}

	private invalidateRetainedPaneImageGrid(state: TurboFileImageGridState): void {
		if (state.displayMode !== 'pane') {
			return;
		}
		state.paneDomDisposables?.dispose();
		state.paneDomDisposables = undefined;
		state.retainedPaneRoot = undefined;
	}

	private recordNativeInternalDrop(target: TurboFileNativeDragTarget): boolean {
		const session = this.nativeDragSession;
		if (!session || session.state !== 'dragging') {
			return false;
		}

		const dropped = dropTurboFileNativeDragSessionInternally(session, target);
		if (dropped === session) {
			return false;
		}
		const completed = settleTurboFileNativeDragSession(dropped, 'completed');
		this.nativeDragSession = completed;
		this.clearCurrentFileDragState();
		this.deferAfterDrag(() => this.executeNativeInternalDrop(completed));
		return true;
	}

	private executeNativeInternalDrop(session: TurboFileNativeDragSession<TurboFileFileItem>): void {
		const target = session.internalTarget;
		if (!target) {
			return;
		}
		if (target.kind === 'directory') {
			void this.moveSelectedItemsIntoDirectory(target.side, target.path, target.label, session.items);
			return;
		}
		if (session.sourceSide !== target.side) {
			void this.transferSelected(session.sourceSide, target.side, target.initiatedAt, session.operation, session.items);
		}
	}

	private beginFileDragSession(side: 'left' | 'right', event: DragEvent, allowWindowsHandoff: boolean = true): void {
		if (!event.dataTransfer || this.nativeDragSession) {
			return;
		}

		const items = this.getSelectedTransferItems(side)
			.filter(item => !!item.path && !item.parent)
			.map(item => ({ ...item }));
		if (!items.length) {
			return;
		}

		const operation = this.getCurrentDragOperation(side);
		const session = startTurboFileNativeDragSession(createTurboFileNativeDragSession(generateUuid(), side, operation, items, allowWindowsHandoff));
		this.nativeDragSession = session;
	}

	private handoffFileDragSessionToWindows(): void {
		const session = this.nativeDragSession;
		if (!session || session.state !== 'dragging' || !session.allowWindowsHandoff) {
			return;
		}

		// End TurboFile's internal ownership before starting the Windows OLE drag. This does not
		// re-render either pane, so Chromium can tear down its drag image without leaving a shadow.
		this.clearCurrentFileDragState();
		void this.runNativeFileDrag(session);
	}

	private maybeHandoffFileDragSessionToWindows(event: DragEvent): void {
		if (!this.nativeDragSession?.allowWindowsHandoff) {
			return;
		}

		const ownerWindow = getWindow(this.container);
		if (shouldHandoffTurboFileDragToWindows(event, { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight })) {
			this.handoffFileDragSessionToWindows();
		}
	}

	private async runNativeFileDrag(session: TurboFileNativeDragSession<TurboFileFileItem>): Promise<void> {
		const device = this.getPaneDevice(session.sourceSide);
		if (!device) {
			return;
		}

		const dragItems: ITurboFileWindowsDragItem[] = session.items
			.filter((item): item is TurboFileFileItem & { path: string } => !!item.path && !item.parent)
			.map(item => ({
				sourcePath: item.path,
				name: item.name,
				type: item.type,
				size: item.directory ? undefined : item.rawSize
			}));
		if (!dragItems.length) {
			return;
		}

		try {
			const result = await this.sshService.startWindowsFileDrag({
				sessionId: session.id,
				source: await this.toTransferEndpoint(device, this.paneStates[session.sourceSide].path),
				items: dragItems,
				operation: session.operation
			});
			if (result.ok && result.targetDirectory) {
				this.deferAfterDrag(() => void this.transferItemsToWindowsDirectory(session.sourceSide, device, session.items, result.targetDirectory!, Date.now(), session.operation));
				return;
			}
			if (!result.ok && !result.canceled) {
				this.statusMessage = `拖到 Windows 失败：${result.message}`;
				this.render();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.statusMessage = `拖到 Windows 失败：${message}`;
			this.render();
		}
	}

	/**
	 * Starts one frozen drag session for a file-list row. Same-pane folder row drops move items,
	 * while pane-to-pane and external drops keep the snapshotted copy/cut behavior.
	 *
	 * Selection rule: if the dragged row is part of the current multi-selection, drag the whole
	 * selection; otherwise drag just that single row (without disturbing the previous selection
	 * in a way that would surprise the user — we keep the row's behavior consistent with single
	 * left-click).
	 */
	private beginFileRowDrag(side: 'left' | 'right', item: TurboFileFileItem, event: DragEvent): void {
		if (!event.dataTransfer || !item.path || item.parent) {
			return;
		}

		const state = this.paneStates[side];
		if (!state.selectedPaths.has(item.path)) {
			state.selectedPaths.clear();
			state.selectedPaths.add(item.path);
			this.updateRenderedSelection(side);
		}

		this.setActiveFilePaneSide(side);
		const operation = this.getCurrentDragOperation(side);

		event.dataTransfer.effectAllowed = getTurboFileRowDragEffectAllowed();
		event.dataTransfer.setData('application/x-turbofile-side', side);
		event.dataTransfer.setData('application/x-turbofile-operation', operation);

		const items = this.getSelectedTransferItems(side);
		const labels = items.length ? items.map(i => i.name) : [item.name];
		event.dataTransfer.setData('text/plain', labels.join('\n'));
		this.beginFileDragSession(side, event);
	}

	private renderTransferPage(): HTMLElement {
		const page = $('.turbofile-transfer-page');
		this.registerTransferPageDragAndDrop(page);
		const hasLiveTransfer = this.tasks.some(task => task.kind === 'transfer' && task.status === 'running');
		if (hasLiveTransfer) {
			page.classList.add('has-live-transfer');
		}
		const terminalPanelVisible = this.isTerminalPanelVisibleForCurrentPage();
		if (terminalPanelVisible) {
			page.classList.add('is-terminal-focused');
		}
		if (this.maximizedPane) {
			page.classList.add('is-pane-maximized');
			page.dataset.maximizedPane = this.maximizedPane;
		}
		const main = $('.turbofile-main');
		const leftPane = this.renderPane('left');
		const rightPane = this.renderPane('right');
		const hasPaneImageGrid = leftPane.classList.contains('turbofile-pane-image-grid') || rightPane.classList.contains('turbofile-pane-image-grid');
		main.classList.toggle('has-pane-image-grid', hasPaneImageGrid);
		main.appendChild(leftPane);
		if (hasPaneImageGrid && !this.maximizedPane) {
			main.appendChild(this.renderPaneSplitDivider(main));
		}
		main.appendChild(rightPane);
		page.appendChild(main);
		if (this.shouldShowTaskbar()) {
			page.appendChild(this.renderTaskbar());
		}
		return page;
	}

	private readPaneSplitRatio(): number {
		const stored = Number(this.storageService.get(
			TURBOFILE_PANE_SPLIT_RATIO_STORAGE_KEY,
			StorageScope.PROFILE,
			String(TURBOFILE_PANE_SPLIT_DEFAULT_RATIO)
		));
		return clampNumber(stored, 0.1, 0.9);
	}

	private storePaneSplitRatio(): void {
		this.storageService.store(
			TURBOFILE_PANE_SPLIT_RATIO_STORAGE_KEY,
			this.paneSplitRatio.toFixed(6),
			StorageScope.PROFILE,
			StorageTarget.USER
		);
	}

	private renderPaneSplitDivider(main: HTMLElement): HTMLElement {
		const divider = $('.turbofile-pane-split-divider');
		divider.tabIndex = 0;
		divider.setAttribute('role', 'separator');
		divider.setAttribute('aria-orientation', 'vertical');
		divider.setAttribute('aria-label', localize('turbofile.resizePanes', "调整左右面板宽度"));
		divider.title = localize('turbofile.resizePanesHint', "拖动调整左右面板宽度，双击恢复等宽");
		this.applyPaneSplitRatio(main, divider, this.paneSplitRatio);

		const ownerWindow = getWindow(main);
		let activePointerId: number | undefined;
		let mainLeft = 0;
		let usableWidth = 0;

		const finishResize = (event?: PointerEvent): void => {
			if (activePointerId === undefined || (event && event.pointerId !== activePointerId)) {
				return;
			}
			if (divider.hasPointerCapture(activePointerId)) {
				divider.releasePointerCapture(activePointerId);
			}
			activePointerId = undefined;
			main.classList.remove('is-resizing-panes');
			divider.classList.remove('is-dragging');
			this.storePaneSplitRatio();
			this.schedulePaneSplitImageGridReflow(true);
		};

		const handlePointerDown = (event: PointerEvent): void => {
			if (!event.isPrimary || event.button !== 0) {
				return;
			}
			const bounds = main.getBoundingClientRect();
			usableWidth = Math.max(1, bounds.width - TURBOFILE_PANE_SPLIT_DIVIDER_SIZE);
			mainLeft = bounds.left;
			activePointerId = event.pointerId;
			divider.setPointerCapture(event.pointerId);
			main.classList.add('is-resizing-panes');
			divider.classList.add('is-dragging');
			event.preventDefault();
		};

		const handlePointerMove = (event: PointerEvent): void => {
			if (activePointerId === undefined || event.pointerId !== activePointerId) {
				return;
			}
			const leftWidth = event.clientX - mainLeft;
			const ratio = this.clampPaneSplitRatio(leftWidth / usableWidth, usableWidth);
			this.paneSplitRatio = ratio;
			this.applyPaneSplitRatio(main, divider, ratio);
			this.schedulePaneSplitImageGridReflow(false);
			event.preventDefault();
		};

		const handleDoubleClick = (event: MouseEvent): void => {
			this.paneSplitRatio = TURBOFILE_PANE_SPLIT_DEFAULT_RATIO;
			this.applyPaneSplitRatio(main, divider, this.paneSplitRatio);
			this.storePaneSplitRatio();
			this.schedulePaneSplitImageGridReflow(true);
			event.preventDefault();
		};

		const handleKeyDown = (event: KeyboardEvent): void => {
			const usable = Math.max(1, main.clientWidth - TURBOFILE_PANE_SPLIT_DIVIDER_SIZE);
			const step = event.shiftKey ? 0.1 : 0.025;
			let nextRatio: number | undefined;
			switch (event.key) {
				case 'ArrowLeft': nextRatio = this.paneSplitRatio - step; break;
				case 'ArrowRight': nextRatio = this.paneSplitRatio + step; break;
				case 'Home': nextRatio = 0; break;
				case 'End': nextRatio = 1; break;
				case 'Enter': nextRatio = TURBOFILE_PANE_SPLIT_DEFAULT_RATIO; break;
			}
			if (nextRatio === undefined) {
				return;
			}
			this.paneSplitRatio = this.clampPaneSplitRatio(nextRatio, usable);
			this.applyPaneSplitRatio(main, divider, this.paneSplitRatio);
			this.storePaneSplitRatio();
			this.schedulePaneSplitImageGridReflow(true);
			event.preventDefault();
			event.stopPropagation();
		};

		divider.addEventListener('pointerdown', handlePointerDown);
		divider.addEventListener('dblclick', handleDoubleClick);
		divider.addEventListener('keydown', handleKeyDown);
		ownerWindow.addEventListener('pointermove', handlePointerMove, { passive: false });
		ownerWindow.addEventListener('pointerup', finishResize);
		ownerWindow.addEventListener('pointercancel', finishResize);
		this.renderDisposables.add({
			dispose: () => {
				if (activePointerId !== undefined && divider.hasPointerCapture(activePointerId)) {
					divider.releasePointerCapture(activePointerId);
				}
				main.classList.remove('is-resizing-panes');
				divider.removeEventListener('pointerdown', handlePointerDown);
				divider.removeEventListener('dblclick', handleDoubleClick);
				divider.removeEventListener('keydown', handleKeyDown);
				ownerWindow.removeEventListener('pointermove', handlePointerMove);
				ownerWindow.removeEventListener('pointerup', finishResize);
				ownerWindow.removeEventListener('pointercancel', finishResize);
			}
		});
		return divider;
	}

	private clampPaneSplitRatio(ratio: number, usableWidth: number): number {
		const minimumRatio = Math.min(0.45, TURBOFILE_PANE_SPLIT_MIN_SIZE / Math.max(1, usableWidth));
		return clampNumber(ratio, minimumRatio, 1 - minimumRatio);
	}

	private applyPaneSplitRatio(main: HTMLElement, divider: HTMLElement, ratio: number): void {
		const percentage = ratio * 100;
		const dividerOffset = TURBOFILE_PANE_SPLIT_DIVIDER_SIZE * ratio;
		main.style.setProperty('--turbofile-pane-left-width', `calc(${percentage.toFixed(4)}% - ${dividerOffset.toFixed(3)}px)`);
		divider.setAttribute('aria-valuemin', '0');
		divider.setAttribute('aria-valuemax', '100');
		divider.setAttribute('aria-valuenow', String(Math.round(percentage)));
		divider.setAttribute('aria-valuetext', localize('turbofile.leftPaneWidthPercent', "左侧面板 {0}%", Math.round(percentage)));
	}

	private schedulePaneSplitImageGridReflow(loadVisibleImages = true): void {
		this.paneSplitReflowShouldLoad ||= loadVisibleImages;
		if (!this.container || this.paneSplitReflowRaf) {
			return;
		}
		this.paneSplitReflowRaf = getWindow(this.container).requestAnimationFrame(() => {
			this.paneSplitReflowRaf = 0;
			const shouldLoad = this.paneSplitReflowShouldLoad;
			this.paneSplitReflowShouldLoad = false;
			for (const state of Object.values(this.paneImageGridStates)) {
				if (!state || state.displayMode !== 'pane') {
					continue;
				}
				const body = this.getImageGridBodyElement(state);
				if (body?.isConnected) {
					this.reflowAttachedImageGridBody(body, state, body.scrollTop, shouldLoad);
				}
			}
		});
	}

	private clearPaneSplitReflowRaf(): void {
		if (this.paneSplitReflowRaf && this.container) {
			getWindow(this.container).cancelAnimationFrame(this.paneSplitReflowRaf);
		}
		this.paneSplitReflowRaf = 0;
		this.paneSplitReflowShouldLoad = false;
	}

	private registerTransferPageDragAndDrop(page: HTMLElement): void {
		const handleDragEnter = (event: DragEvent) => this.handleTransferPageDragOver(event);
		const handleDragOver = (event: DragEvent) => this.handleTransferPageDragOver(event);
		const handleDrop = (event: DragEvent) => this.handleTransferPageDrop(event);
		const handleDragLeave = (event: DragEvent) => this.handleTransferPageDragLeave(event);
		page.addEventListener('dragenter', handleDragEnter, true);
		page.addEventListener('dragover', handleDragOver, true);
		page.addEventListener('drop', handleDrop, true);
		page.addEventListener('dragleave', handleDragLeave, true);
		this.renderDisposables.add({
			dispose: () => {
				page.removeEventListener('dragenter', handleDragEnter, true);
				page.removeEventListener('dragover', handleDragOver, true);
				page.removeEventListener('drop', handleDrop, true);
				page.removeEventListener('dragleave', handleDragLeave, true);
			}
		});
	}

	private handleTransferPageDragOver(event: DragEvent): void {
		if (!this.isTransferPageFileDrag(event)) {
			return;
		}
		if (this.shouldLetConcreteDropTargetHandle(event)) {
			return;
		}

		const targetSide = this.getTransferDropTargetSide(event);
		const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.nativeDragSession?.sourceSide;
		if (!shouldHandleTurboFilePaneDropAtPage(sourceSide, targetSide)) {
			this.setExternalDropTargetSide(undefined);
			return;
		}
		this.consumeTurboFileDropEvent(event);
		const operation = this.getDragOperationFromEvent(event, sourceSide ?? targetSide);
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = getTurboFileDropEffect(operation);
		}
		this.setExternalDropTargetSide(this.hasExternalDropData(event) ? targetSide : undefined);
	}

	private handleTransferPageDrop(event: DragEvent): void {
		if (!this.isTransferPageFileDrag(event)) {
			return;
		}
		if (this.shouldLetConcreteDropTargetHandle(event)) {
			return;
		}

		const initiatedAt = Date.now();
		const targetSide = this.getTransferDropTargetSide(event);
		const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.nativeDragSession?.sourceSide;
		const operation = this.getDragOperationFromEvent(event, sourceSide ?? targetSide);
		if (!shouldHandleTurboFilePaneDropAtPage(sourceSide, targetSide)) {
			this.setExternalDropTargetSide(undefined);
			return;
		}
		this.consumeTurboFileDropEvent(event);
		this.setExternalDropTargetSide(undefined);
		if (this.nativeDragSession && sourceSide) {
			if (sourceSide !== targetSide) {
				this.recordNativeInternalDrop({ kind: 'pane', side: targetSide, initiatedAt });
			}
			return;
		}

		const externalPaths = this.extractExternalDropPaths(event);
		this.clearCurrentFileDragState();
		if (externalPaths.length) {
			this.deferAfterDrag(() => void this.transferExternalPaths(targetSide, externalPaths, operation, initiatedAt));
		}
	}

	private consumeTurboFileDropEvent(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
	}

	private shouldLetConcreteDropTargetHandle(event: DragEvent): boolean {
		const target = event.target instanceof HTMLElement ? event.target : undefined;
		return !!target?.closest('.turbofile-file-list, .turbofile-image-page-body');
	}

	private handleTransferPageDragLeave(event: DragEvent): void {
		if (!this.nativeDragSession?.allowWindowsHandoff) {
			return;
		}
		const relatedTarget = event.relatedTarget;
		if (relatedTarget instanceof Node && this.container?.ownerDocument.contains(relatedTarget)) {
			return;
		}

		// Chromium commonly reports every coordinate as zero after a drag leaves the Electron window.
		// That sample is ambiguous for ordinary `drag` events, but a page `dragleave` whose related
		// target is outside the owner document confirms the exit. Preserve the boundary classifier for
		// non-zero samples so a transient null relatedTarget inside the page cannot steal internal drops.
		const hasChromiumZeroExitSample = event.clientX === 0
			&& event.clientY === 0
			&& event.screenX === 0
			&& event.screenY === 0;
		const ownerWindow = getWindow(this.container);
		if (!hasChromiumZeroExitSample && !shouldHandoffTurboFileDragToWindows(event, { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight })) {
			return;
		}

		this.setExternalDropTargetSide(undefined);
		this.handoffFileDragSessionToWindows();
	}

	private isTransferPageFileDrag(event: DragEvent): boolean {
		return !!this.nativeDragSession || !!this.getTurboFileDragSourceSide(event) || this.hasExternalDropData(event);
	}

	private getTransferDropTargetSide(event: DragEvent): 'left' | 'right' {
		const target = event.target instanceof HTMLElement ? event.target : undefined;
		const targetSide = this.getPaneSideFromElement(target);
		if (targetSide) {
			this.activeFilePaneSide = targetSide;
			return targetSide;
		}
		return this.activeFilePaneSide;
	}

	private getTurboFileDragSourceSide(event: DragEvent): 'left' | 'right' | undefined {
		const sourceSide = event.dataTransfer?.getData('application/x-turbofile-side');
		return sourceSide === 'left' || sourceSide === 'right' ? sourceSide : undefined;
	}

	private renderDevicesPage(): HTMLElement {
		const page = $('.turbofile-full-page.turbofile-devices-page');
		page.appendChild(this.renderPageHeader(Codicon.server, '设备管理', localize('turbofile.devicesPageDescription', "拖动卡片调整设备顺序，可编辑、删除和测试连接。"), [
			this.createPageButton(Codicon.refresh, '刷新设备', () => void this.refreshDevicesFromStore()),
			this.createPageButton(Codicon.add, '添加 SSH 设备', () => this.showAddDeviceForm())
		]));

		const grid = $('.turbofile-device-page-grid');
		for (const device of this.getAllDevices()) {
			grid.appendChild(this.renderDevicePageCard(device));
		}
		this.registerDeviceOrderDragInterceptor(grid);
		page.appendChild(grid);
		return page;
	}

	private beginDeviceOrderDrag(card: HTMLElement, device: TurboFileDevice, event: DragEvent): void {
		if (!event.dataTransfer || this.activePage !== 'devices') {
			event.preventDefault();
			return;
		}
		this.deviceOrderDragId = device.id;
		this.deviceOrderDragCard = card;
		const first = card.parentElement?.children[0];
		const second = card.parentElement?.children[1];
		this.deviceOrderDragHorizontal = !!first && !!second && Math.abs(first.getBoundingClientRect().top - second.getBoundingClientRect().top) < 2;
		card.classList.add('is-device-order-dragging');
		event.dataTransfer.clearData();
		event.dataTransfer.setData(TURBOFILE_DEVICE_ORDER_DRAG_TYPE, device.id);
		event.dataTransfer.effectAllowed = 'move';
		event.stopPropagation();
	}

	private registerDeviceOrderDragInterceptor(grid: HTMLElement): void {
		const ownerWindow = getWindow(grid);
		const handle = (event: DragEvent): void => this.handleDeviceOrderDragEvent(event, grid);
		const end = (): void => this.finishDeviceOrderDrag();
		for (const type of ['dragenter', 'dragover', 'drop'] as const) {
			ownerWindow.addEventListener(type, handle, true);
			this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener(type, handle, true) });
		}
		ownerWindow.addEventListener('dragend', end, true);
		this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener('dragend', end, true) });
	}

	private handleDeviceOrderDragEvent(event: DragEvent, grid: HTMLElement): void {
		if (!this.isEditorVisible || this.activePage !== 'devices' || this.isDeviceFormVisible || this.dialogState || this.isTaskLogVisible
			|| !event.dataTransfer?.types.includes(TURBOFILE_DEVICE_ORDER_DRAG_TYPE)) {
			return;
		}
		const element = event.target instanceof Element ? event.target : undefined;
		if (!element || !this.container?.contains(element)) {
			this.clearDeviceOrderDropTarget();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'move';
		const card = element.closest<HTMLElement>('[data-device-order-id]');
		if (!card || !grid.contains(card) || card.dataset.deviceOrderId === this.deviceOrderDragId) {
			this.clearDeviceOrderDropTarget();
			if (event.type === 'drop') {
				this.finishDeviceOrderDrag();
			}
			return;
		}
		const rect = card.getBoundingClientRect();
		const position = this.deviceOrderDragHorizontal
			? event.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
			: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
		if (event.type !== 'drop') {
			if (this.deviceOrderDropTarget !== card) {
				this.clearDeviceOrderDropTarget();
				this.deviceOrderDropTarget = card;
			}
			card.classList.toggle('is-device-order-before', position === 'before');
			card.classList.toggle('is-device-order-after', position === 'after');
			card.classList.toggle('is-device-order-vertical', !this.deviceOrderDragHorizontal);
			return;
		}
		const sourceId = this.deviceOrderDragId ?? event.dataTransfer.getData(TURBOFILE_DEVICE_ORDER_DRAG_TYPE);
		const targetId = card.dataset.deviceOrderId;
		this.finishDeviceOrderDrag();
		if (sourceId && targetId && sourceId !== targetId) {
			// Delay persistence/rendering until the native drop returns, preserving its source DOM.
			this.pendingDeviceOrderDrop = { sourceId, targetId, position };
			this.deviceOrderDropScheduler.schedule(0);
		}
	}

	private clearDeviceOrderDropTarget(): void {
		this.deviceOrderDropTarget?.classList.remove('is-device-order-before', 'is-device-order-after', 'is-device-order-vertical');
		this.deviceOrderDropTarget = undefined;
	}

	private finishDeviceOrderDrag(): void {
		this.deviceOrderDragCard?.classList.remove('is-device-order-dragging');
		this.deviceOrderDragCard = undefined;
		this.deviceOrderDragId = undefined;
		this.clearDeviceOrderDropTarget();
		if (this.pendingRenderAfterDeviceOrderDrag) {
			this.deviceOrderDropScheduler.schedule(0);
		}
	}

	private completeDeviceOrderDrop(): void {
		const drop = this.pendingDeviceOrderDrop;
		const shouldRender = this.pendingRenderAfterDeviceOrderDrag;
		this.pendingDeviceOrderDrop = undefined;
		this.pendingRenderAfterDeviceOrderDrag = false;
		let changed = false;
		let saveFailed = false;
		if (drop && this.deviceStore) {
			this.deviceOrderWriteInProgress = true;
			try {
				changed = this.deviceStore.reorderDevice(drop.sourceId, drop.targetId, drop.position);
				if (changed) {
					this.devices = this.deviceStore.loadDevices();
					this.statusMessage = localize('turbofile.deviceOrderSaved', "设备顺序已保存。");
				}
			} catch (error) {
				saveFailed = true;
				this.statusMessage = localize('turbofile.deviceOrderSaveFailed', "保存设备顺序失败：{0}", error instanceof Error ? error.message : String(error));
				getWindow(this.container).alert(this.statusMessage);
			} finally {
				this.deviceOrderWriteInProgress = false;
			}
		}
		if (this.isEditorVisible && (changed || shouldRender || saveFailed)) {
			this.render();
		}
	}

	private ensureTitlebarChrome(): void {
		this.ensureTitlebarAppMenu();
		this.ensureTitlebarThemeToggle();
	}

	private ensureTitlebarAppMenu(retry = 0): void {
		if (!document.body.classList.contains('turbofile-shell')) {
			return;
		}
		this.removeTitlebarAppMenu();
		const titlebarLeft = document.querySelector<HTMLElement>('.monaco-workbench .part.titlebar .titlebar-container > .titlebar-left');
		if (!titlebarLeft) {
			if (retry < 10) {
				setTimeout(() => this.ensureTitlebarAppMenu(retry + 1), 100);
			}
			return;
		}

		const menu = this.createTitlebarAppMenu();
		const appIcon = titlebarLeft.querySelector<HTMLElement>('.window-appicon');
		const nativeMenubar = titlebarLeft.querySelector<HTMLElement>('.menubar');
		if (nativeMenubar) {
			titlebarLeft.insertBefore(menu, nativeMenubar);
		} else if (appIcon?.nextSibling) {
			titlebarLeft.insertBefore(menu, appIcon.nextSibling);
		} else {
			titlebarLeft.appendChild(menu);
		}
	}

	private removeTitlebarAppMenu(): void {
		for (const menu of Array.from(document.querySelectorAll('.turbofile-titlebar-menu'))) {
			menu.remove();
		}
	}

	private createTitlebarAppMenu(): HTMLElement {
		const menu = $('.turbofile-titlebar-menu');
		const updateActionKind = getTurboFileTitlebarUpdateActionKind(this.updateService.state);
		menu.appendChild(this.createTitlebarMenuButton('设置', button => this.showTitlebarMenu(button, '设置', this.getTitlebarSettingsActions())));
		menu.appendChild(this.createTitlebarMenuButton('视图', button => this.showTitlebarMenu(button, '视图', this.getTitlebarViewActions())));
		menu.appendChild(this.createTitlebarMenuButton('帮助', button => this.showTitlebarMenu(button, '帮助', this.getTitlebarHelpActions())));
		if (updateActionKind !== 'hidden') {
			menu.appendChild(this.createTitlebarUpdateButton(updateActionKind));
		}
		return menu;
	}

	private getTitlebarSettingsActions(): IAction[] {
		const confirmBeforeDelete = this.shouldConfirmBeforeDelete();
		const originalImages = this.shouldUseOriginalImageGridImages();
		const showImageGridNames = this.shouldShowImageGridNames();
		const imageGridSizeSortBasis = this.getImageGridSizeSortBasis();
		const conflictPolicy = this.getTransferConflictPolicy();
		return [
			toAction({
				id: 'turbofile.settings.confirmBeforeDelete',
				label: localize('turbofile.confirmBeforeDeleteSetting', "删除前显示确认"),
				checked: confirmBeforeDelete,
				run: () => this.setConfirmBeforeDelete(!confirmBeforeDelete)
			}),
			new SubmenuAction('turbofile.settings.imageGridQuality', localize('turbofile.imageGridQualitySetting', "图片网格画质"), [
				this.createCheckedAction('turbofile.settings.imageGridQuality.thumbnail', localize('turbofile.imageGridThumbnailFirst', "缩略图优先"), !originalImages, () => this.setUseOriginalImageGridImages(false)),
				this.createCheckedAction('turbofile.settings.imageGridQuality.original', localize('turbofile.imageGridOriginalFirst', "原图优先"), originalImages, () => this.setUseOriginalImageGridImages(true))
			]),
			this.createCheckedAction('turbofile.settings.showImageGridNames', localize('turbofile.showImageGridNames', "图片网格显示图片名称"), showImageGridNames, () => this.setShowImageGridNames(!showImageGridNames)),
			new SubmenuAction('turbofile.settings.imageGridSizeSortBasis', localize('turbofile.imageGridSizeSortBasis', "图片网格大小排序依据"), [
				this.createCheckedAction('turbofile.settings.imageGridSizeSortBasis.file', localize('turbofile.imageGridFileSize', "文件大小"), imageGridSizeSortBasis === 'file', () => this.setImageGridSizeSortBasis('file')),
				this.createCheckedAction('turbofile.settings.imageGridSizeSortBasis.dimensions', localize('turbofile.imageGridPixelDimensions', "图片尺寸"), imageGridSizeSortBasis === 'dimensions', () => this.setImageGridSizeSortBasis('dimensions'))
			]),
			new SubmenuAction('turbofile.settings.conflictPolicy', localize('turbofile.transferConflictPolicy', "同名文件处理"), [
				this.createCheckedAction('turbofile.settings.conflictPolicy.ask', localize('turbofile.conflictAsk', "询问"), conflictPolicy === 'ask', () => this.setTransferConflictPolicy('ask')),
				this.createCheckedAction('turbofile.settings.conflictPolicy.overwrite', localize('turbofile.conflictOverwrite', "覆盖"), conflictPolicy === 'overwrite', () => this.setTransferConflictPolicy('overwrite')),
				this.createCheckedAction('turbofile.settings.conflictPolicy.skip', localize('turbofile.conflictSkip', "跳过"), conflictPolicy === 'skip', () => this.setTransferConflictPolicy('skip')),
				this.createCheckedAction('turbofile.settings.conflictPolicy.keepBoth', localize('turbofile.conflictKeepBoth', "保留两份"), conflictPolicy === 'keepBoth', () => this.setTransferConflictPolicy('keepBoth'))
			]),
			new Separator(),
			this.createCheckedAction('turbofile.settings.automaticUpdates', localize('turbofile.automaticUpdates', "自动检查更新"), this.shouldAutomaticallyCheckForUpdates(), () => { void this.toggleAutomaticUpdateChecks(); }),
			this.createCheckedAction('turbofile.settings.showHiddenFiles', localize('turbofile.showHiddenFiles', "显示隐藏文件"), this.shouldShowHiddenFiles(), () => this.toggleShowHiddenFiles())
		];
	}

	private getTitlebarViewActions(): IAction[] {
		const side = this.activeFilePaneSide;
		const paneGridVisible = !!this.paneImageGridStates[side];
		const terminalVisible = this.isTerminalPanelVisibleForCurrentPage();
		return [
			this.createCheckedAction('turbofile.view.showHiddenFiles', localize('turbofile.showHiddenFiles', "显示隐藏文件"), this.shouldShowHiddenFiles(), () => this.toggleShowHiddenFiles()),
			this.createCheckedAction('turbofile.view.showFileSize', localize('turbofile.showFileSize', "显示文件大小"), this.shouldShowFileSize(), () => this.toggleFileListMetadata(TURBOFILE_SHOW_FILE_SIZE_STORAGE_KEY, this.shouldShowFileSize())),
			this.createCheckedAction('turbofile.view.showModified', localize('turbofile.showModified', "显示修改时间"), this.shouldShowFileModified(), () => this.toggleFileListMetadata(TURBOFILE_SHOW_FILE_MODIFIED_STORAGE_KEY, this.shouldShowFileModified())),
			this.createCheckedAction('turbofile.view.showFileType', localize('turbofile.showFileType', "显示文件类型"), this.shouldShowFileType(), () => this.toggleFileListMetadata(TURBOFILE_SHOW_FILE_TYPE_STORAGE_KEY, this.shouldShowFileType())),
			this.createCheckedAction('turbofile.view.showImageGridHoverInfo', localize('turbofile.showImageGridHoverInfo', "图片网格显示尺寸和序号"), this.shouldShowImageGridHoverInfo(), () => this.setShowImageGridHoverInfo(!this.shouldShowImageGridHoverInfo())),
			new Separator(),
			new SubmenuAction('turbofile.view.displayMode', localize('turbofile.displayMode', "显示方式"), [
				this.createCheckedAction('turbofile.view.list', localize('turbofile.listView', "列表视图"), !paneGridVisible, () => this.showPaneListView(side)),
				this.createCheckedAction('turbofile.view.imageGrid', localize('turbofile.imageGridView', "图片网格"), paneGridVisible, () => this.showPaneImageGrid(side))
			]),
			this.createCheckedAction('turbofile.view.showTaskbar', localize('turbofile.showTaskbar', "显示任务栏"), this.shouldShowTaskbar(), () => this.toggleTaskbar()),
			this.createCheckedAction('turbofile.view.showTerminal', localize('turbofile.showTerminal', "显示终端"), terminalVisible, () => this.toggleTerminalPanel()),
			this.createCheckedAction('turbofile.view.syncPaneNavigation', localize('turbofile.syncPaneNavigation', "左右面板同步导航"), this.shouldSyncPaneNavigation(), () => this.toggleSyncPaneNavigation()),
			new Separator(),
			toAction({ id: 'turbofile.view.maximizeLeft', label: localize('turbofile.maximizeLeftPane', "最大化左侧面板"), enabled: true, run: () => this.setMaximizedPane('left') }),
			toAction({ id: 'turbofile.view.maximizeRight', label: localize('turbofile.maximizeRightPane', "最大化右侧面板"), enabled: true, run: () => this.setMaximizedPane('right') }),
			toAction({ id: 'turbofile.view.restorePanes', label: localize('turbofile.restoreBothPanes', "恢复双面板"), enabled: !!this.maximizedPane, run: () => this.setMaximizedPane(undefined) }),
			new Separator(),
			toAction({ id: 'turbofile.view.zoomOut', label: localize('turbofile.zoomOutInterface', "缩小界面"), enabled: this.getUiFontSize() > 11, run: () => this.updateUiFontSize(this.getUiFontSize() - 1) }),
			toAction({ id: 'turbofile.view.zoomIn', label: localize('turbofile.zoomInInterface', "放大界面"), enabled: this.getUiFontSize() < 24, run: () => this.updateUiFontSize(this.getUiFontSize() + 1) }),
			new SubmenuAction('turbofile.view.font', localize('turbofile.font', "字体"), [
				this.createFontSizeMenu('turbofile.view.editorFontSize', localize('turbofile.editorFontSize', "文档字号"), this.getEditorFontSize(), 8, 40, value => this.updateEditorFontSize(value)),
				this.createFontSizeMenu('turbofile.view.uiFontSize', localize('turbofile.uiFontSize', "UI 字号"), this.getUiFontSize(), 11, 24, value => this.updateUiFontSize(value)),
				new SubmenuAction('turbofile.view.uiFontFamily', localize('turbofile.uiFontFamily', "UI 字体"), TURBOFILE_UI_FONT_FAMILIES.map(([value, label], index) =>
					this.createCheckedAction(`turbofile.view.uiFontFamily.${index}`, label, this.getUiFontFamily() === value, () => this.updateUiFontFamily(value))
				)),
				this.createFontSizeMenu('turbofile.view.fileListFontSize', localize('turbofile.fileListFontSize', "文件浏览区字号"), this.getBrowserFontSize(), 11, 20, value => this.updateBrowserFontSize(value)),
				new SubmenuAction('turbofile.view.fileListFontFamily', localize('turbofile.fileListFontFamily', "文件浏览区字体"), TURBOFILE_BROWSER_FONT_FAMILIES.map(([value, label], index) =>
					this.createCheckedAction(`turbofile.view.fileListFontFamily.${index}`, label, this.getBrowserFontFamily() === value, () => this.updateBrowserFontFamily(value))
				))
			]),
			new SubmenuAction('turbofile.view.theme', localize('turbofile.theme', "主题"), this.getThemeMenuActions()),
			new Separator(),
			toAction({ id: 'turbofile.view.refresh', label: localize('turbofile.refreshCurrentPane', "刷新当前面板"), enabled: true, run: () => this.refreshPane(side, { force: true }) })
		];
	}

	private createFontSizeMenu(id: string, label: string, currentSize: number, min: number, max: number, update: (value: number) => void): SubmenuAction {
		const sizes = [...new Set([min, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, max, currentSize])]
			.filter(value => value >= min && value <= max).sort((a, b) => a - b);
		return new SubmenuAction(id, label, [
			...sizes.map(value => this.createCheckedAction(`${id}.${value}`, `${value}px`, currentSize === value, () => update(value))),
			new Separator(),
			toAction({
				id: `${id}.custom`, label: localize('turbofile.customFontSize', "自定义…"), run: async () => {
					const value = await this.quickInputService.input({
						title: label,
						value: String(currentSize),
						prompt: localize('turbofile.fontSizeRange', "输入 {0} 到 {1} 之间的整数", min, max),
						validateInput: async input => {
							const size = Number(input);
							return Number.isInteger(size) && size >= min && size <= max
								? undefined : localize('turbofile.invalidFontSize', "字号必须是 {0} 到 {1} 之间的整数。", min, max);
						}
					});
					if (value !== undefined) {
						update(Number(value));
					}
				}
			})
		]);
	}

	private getTitlebarHelpActions(): IAction[] {
		return [
			toAction({ id: 'turbofile.help.guide', label: localize('turbofile.userGuide', "使用说明"), enabled: true, run: () => this.showUserGuide() }),
			toAction({ id: 'turbofile.help.shortcuts', label: localize('turbofile.shortcuts', "快捷键说明"), enabled: true, run: () => this.showKeyboardShortcutGuide() }),
			toAction({ id: 'turbofile.help.protocols', label: localize('turbofile.protocolGuide', "传输协议说明"), enabled: true, run: () => this.showTransferProtocolGuide() }),
			new Separator(),
			toAction({ id: 'turbofile.help.checkUpdates', label: localize('turbofile.checkForUpdates', "检查更新"), enabled: true, run: () => this.updateService.checkForUpdates(true) }),
			toAction({ id: 'turbofile.help.releaseNotes', label: localize('turbofile.releaseNotes', "更新日志"), enabled: true, run: () => this.showReleaseNotes() }),
			new Separator(),
			toAction({ id: 'turbofile.help.about', label: localize('turbofile.about', "关于极速传"), enabled: true, run: () => this.showAboutDialog() }),
			toAction({ id: 'turbofile.help.licenses', label: localize('turbofile.openSourceLicenses', "开源许可证"), enabled: true, run: () => { void this.openThirdPartyNotices(); } })
		];
	}

	private createCheckedAction(id: string, label: string, checked: boolean, run: () => void | Promise<void>): IAction {
		return toAction({ id, label, checked, enabled: true, run });
	}

	private shouldConfirmBeforeDelete(): boolean {
		return this.storageService.getBoolean(TURBOFILE_CONFIRM_BEFORE_DELETE_STORAGE_KEY, StorageScope.PROFILE, true);
	}

	private setConfirmBeforeDelete(enabled: boolean): void {
		this.storageService.store(TURBOFILE_CONFIRM_BEFORE_DELETE_STORAGE_KEY, enabled, StorageScope.PROFILE, StorageTarget.USER);
	}

	private shouldUseOriginalImageGridImages(): boolean {
		return this.storageService.get(TURBOFILE_IMAGE_GRID_QUALITY_STORAGE_KEY, StorageScope.PROFILE, 'thumbnail') === 'original';
	}

	private setUseOriginalImageGridImages(enabled: boolean): void {
		this.storageService.store(TURBOFILE_IMAGE_GRID_QUALITY_STORAGE_KEY, enabled ? 'original' : 'thumbnail', StorageScope.PROFILE, StorageTarget.USER);
		this.reloadVisibleImageGridThumbnails();
	}

	private shouldShowImageGridNames(): boolean {
		return this.storageService.getBoolean(TURBOFILE_IMAGE_GRID_SHOW_NAMES_STORAGE_KEY, StorageScope.PROFILE, true);
	}

	private setShowImageGridNames(enabled: boolean): void {
		this.storageService.store(TURBOFILE_IMAGE_GRID_SHOW_NAMES_STORAGE_KEY, enabled, StorageScope.PROFILE, StorageTarget.USER);
		for (const state of this.getVisibleImageGridStates()) {
			state.renderedRange = undefined;
			this.clearImageGridLayoutMetrics(state);
			this.invalidateRetainedPaneImageGrid(state);
		}
		this.render();
	}

	private shouldShowImageGridHoverInfo(): boolean {
		return this.storageService.getBoolean(TURBOFILE_IMAGE_GRID_SHOW_HOVER_INFO_STORAGE_KEY, StorageScope.PROFILE, true);
	}

	private setShowImageGridHoverInfo(enabled: boolean): void {
		this.storageService.store(TURBOFILE_IMAGE_GRID_SHOW_HOVER_INFO_STORAGE_KEY, enabled, StorageScope.PROFILE, StorageTarget.USER);
		for (const state of this.getVisibleImageGridStates()) {
			state.renderedRange = undefined;
			this.invalidateRetainedPaneImageGrid(state);
		}
		this.render();
	}

	private getImageGridSizeSortBasis(): TurboFileImageGridSizeSortBasis {
		return this.storageService.get(TURBOFILE_IMAGE_GRID_SIZE_SORT_BASIS_STORAGE_KEY, StorageScope.PROFILE, 'file') === 'dimensions' ? 'dimensions' : 'file';
	}

	private setImageGridSizeSortBasis(basis: TurboFileImageGridSizeSortBasis): void {
		this.storageService.store(TURBOFILE_IMAGE_GRID_SIZE_SORT_BASIS_STORAGE_KEY, basis, StorageScope.PROFILE, StorageTarget.USER);
		for (const state of this.getVisibleImageGridStates()) {
			if (state.sortKey === 'size') {
				this.resortImageGridState(state);
				this.updateImageGridAfterSort(state);
			}
			if (basis === 'dimensions') {
				void this.ensureImageGridDimensionMetadata(state);
			}
		}
	}

	private reloadVisibleImageGridThumbnails(): void {
		this.clearImageGridThumbnailQueue();
		for (const state of this.getVisibleImageGridStates()) {
			state.thumbnailLoadToken++;
			state.loadedThumbnailIndexes.clear();
			for (const image of state.images) {
				this.releaseImageBlobUrl(image.thumbnailUrl);
				image.thumbnailUrl = undefined;
				image.thumbnailContent = '';
				image.thumbnailLoading = false;
				image.thumbnailError = undefined;
			}
		}
		this.render();
		for (const state of this.getVisibleImageGridStates()) {
			this.scheduleImageGridVisibleLoad(state);
		}
	}

	private getTransferConflictPolicy(): TurboFileTransferConflictPolicy {
		const value = this.storageService.get(TURBOFILE_TRANSFER_CONFLICT_POLICY_STORAGE_KEY, StorageScope.PROFILE, 'ask');
		return value === 'overwrite' || value === 'skip' || value === 'keepBoth' ? value : 'ask';
	}

	private setTransferConflictPolicy(policy: TurboFileTransferConflictPolicy): void {
		this.storageService.store(TURBOFILE_TRANSFER_CONFLICT_POLICY_STORAGE_KEY, policy, StorageScope.PROFILE, StorageTarget.USER);
	}

	private shouldAutomaticallyCheckForUpdates(): boolean {
		const mode = this.configurationService.getValue<'none' | 'manual' | 'start' | 'default'>('update.mode');
		return mode !== 'none' && mode !== 'manual';
	}

	private async toggleAutomaticUpdateChecks(): Promise<void> {
		await this.configurationService.updateValue('update.mode', this.shouldAutomaticallyCheckForUpdates() ? 'manual' : 'default', ConfigurationTarget.USER);
	}

	private shouldShowHiddenFiles(): boolean {
		return this.storageService.getBoolean(TURBOFILE_SHOW_HIDDEN_FILES_STORAGE_KEY, StorageScope.PROFILE, false);
	}

	private toggleShowHiddenFiles(): void {
		this.storageService.store(TURBOFILE_SHOW_HIDDEN_FILES_STORAGE_KEY, !this.shouldShowHiddenFiles(), StorageScope.PROFILE, StorageTarget.USER);
		this.paneDirectoryCache.clear();
		void Promise.all((['left', 'right'] as const).map(side => this.refreshPane(side, { force: true, silent: true })));
	}

	private shouldShowFileSize(): boolean {
		return this.storageService.getBoolean(TURBOFILE_SHOW_FILE_SIZE_STORAGE_KEY, StorageScope.PROFILE, true);
	}

	private shouldShowFileModified(): boolean {
		return this.storageService.getBoolean(TURBOFILE_SHOW_FILE_MODIFIED_STORAGE_KEY, StorageScope.PROFILE, true);
	}

	private shouldShowFileType(): boolean {
		return this.storageService.getBoolean(TURBOFILE_SHOW_FILE_TYPE_STORAGE_KEY, StorageScope.PROFILE, false);
	}

	private toggleFileListMetadata(key: string, currentValue: boolean): void {
		this.storageService.store(key, !currentValue, StorageScope.PROFILE, StorageTarget.USER);
		this.fileListRenderedRange.left = undefined;
		this.fileListRenderedRange.right = undefined;
		this.render();
	}

	private shouldShowTaskbar(): boolean {
		return this.storageService.getBoolean(TURBOFILE_SHOW_TASKBAR_STORAGE_KEY, StorageScope.PROFILE, true);
	}

	private toggleTaskbar(): void {
		this.storageService.store(TURBOFILE_SHOW_TASKBAR_STORAGE_KEY, !this.shouldShowTaskbar(), StorageScope.PROFILE, StorageTarget.USER);
		this.render();
	}

	private shouldSyncPaneNavigation(): boolean {
		return this.storageService.getBoolean(TURBOFILE_SYNC_PANE_NAVIGATION_STORAGE_KEY, StorageScope.PROFILE, false);
	}

	private toggleSyncPaneNavigation(): void {
		this.storageService.store(TURBOFILE_SYNC_PANE_NAVIGATION_STORAGE_KEY, !this.shouldSyncPaneNavigation(), StorageScope.PROFILE, StorageTarget.USER);
	}

	private showPaneListView(side: 'left' | 'right'): void {
		const state = this.paneImageGridStates[side];
		if (state) {
			this.closeImageGridPage(state);
		}
	}

	private showPaneImageGrid(side: 'left' | 'right'): void {
		if (!this.paneImageGridStates[side]) {
			this.openImageGrid(side, undefined, false, 'grid', 'pane');
		}
	}

	private toggleTerminalPanel(): void {
		if (this.isTerminalPanelVisibleForCurrentPage()) {
			this.rememberTerminalPanelHiddenForCurrentPage();
			this.terminalGroupService.hidePanel();
			this.restoreTaskbarAfterTerminal();
			return;
		}
		const pageInstanceId = this.currentInput?.instanceId;
		if (pageInstanceId && this.getBoundTerminalsForPage(pageInstanceId).length > 0) {
			turboFileTerminalPanelHiddenByPageId.delete(pageInstanceId);
			void this.revealBoundTerminalsForPage(pageInstanceId, undefined, true);
			return;
		}
		void this.openTerminal(this.activeFilePaneSide);
	}

	private setMaximizedPane(side: 'left' | 'right' | undefined): void {
		if (this.maximizedPane === side) {
			return;
		}
		this.maximizedPane = side;
		this.fileListRenderedRange.left = undefined;
		this.fileListRenderedRange.right = undefined;
		this.render();
	}

	private getThemeMenuActions(): IAction[] {
		const mode = this.getAppearanceMode();
		return [
			this.createCheckedAction('turbofile.view.theme.system', localize('turbofile.themeSystem', "跟随系统"), mode === 'system', () => this.applyAppearanceMode('system')),
			this.createCheckedAction('turbofile.view.theme.light', localize('turbofile.themeLight', "浅色"), mode === 'light', () => this.applyAppearanceMode('light')),
			this.createCheckedAction('turbofile.view.theme.dark', localize('turbofile.themeDark', "深色"), mode === 'dark', () => this.applyAppearanceMode('dark'))
		];
	}

	private showUserGuide(): void {
		this.showDialogInfo(localize('turbofile.userGuide', "使用说明"), localize('turbofile.userGuideMessage', "左右面板分别选择设备和目录，选择文件后可通过拖放、复制粘贴或工具栏执行传输。图片可以使用图片网格浏览，任务进度显示在底部任务栏。"));
	}

	private showKeyboardShortcutGuide(): void {
		this.showDialogInfo(localize('turbofile.shortcuts', "快捷键说明"), localize('turbofile.shortcutGuideMessage', "Ctrl+C 复制，Ctrl+X 剪切，Ctrl+V 粘贴，Delete 删除，Shift+Delete 永久删除，F2 重命名，Ctrl+A 全选，Enter 打开。"));
	}

	private showTransferProtocolGuide(): void {
		this.showDialogInfo(localize('turbofile.protocolGuide', "传输协议说明"), localize('turbofile.protocolGuideMessage', "自动模式会根据设备能力选择 SCP、SFTP、Tar 或 Rsync。直连设备优先直接传输；无法直连时自动使用中转，传输协议和路由判断彼此独立。"));
	}

	private showReleaseNotes(): void {
		this.showDialogInfo(localize('turbofile.releaseNotes', "更新日志"), localize('turbofile.releaseNotesMessage', "当前版本：{0}\n\n可在新版本安装包随附的更新说明中查看完整变更。", this.productService.version));
	}

	private async openThirdPartyNotices(): Promise<void> {
		const resource = joinPath(FileAccess.asFileUri(''), '..', 'ThirdPartyNotices.txt');
		const editorInput: IUntypedFileEditorInput = { resource, forceFile: true };
		const fileEditor = await this.textEditorService.resolveTextEditor(editorInput);
		await this.editorService.openEditor(fileEditor, { pinned: true, revealIfOpened: true });
	}

	private createTitlebarUpdateButton(kind: TurboFileTitlebarUpdateActionKind): HTMLButtonElement {
		const button = $('button.turbofile-titlebar-update-button') as HTMLButtonElement;
		button.type = 'button';
		button.classList.add(`turbofile-titlebar-update-button-${kind}`);
		const title = this.getTitlebarUpdateTitle(kind);
		button.title = title;
		button.setAttribute('aria-label', title);
		button.disabled = !this.canRunTitlebarUpdateAction(kind);
		const label = this.getTitlebarUpdateLabel(kind);
		button.appendChild($('span.turbofile-titlebar-update-label', undefined, label));
		button.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			if (this.canRunTitlebarUpdateAction(kind)) {
				void this.runTitlebarUpdateAction(kind);
			}
		});
		return button;
	}

	private getTitlebarUpdateTitle(kind: TurboFileTitlebarUpdateActionKind): string {
		switch (kind) {
			case 'checking':
				return 'Checking for updates';
			case 'download':
				return 'Download update';
			case 'downloading':
				return 'Downloading update';
			case 'install':
				return 'Install update';
			case 'installing':
				return 'Installing update';
			case 'restart':
				return 'Restart to update';
			default:
				return 'Update';
		}
	}

	private getTitlebarUpdateLabel(kind: TurboFileTitlebarUpdateActionKind): string {
		const version = this.getTitlebarUpdateVersionLabel();
		switch (kind) {
			case 'checking':
				return '检查';
			case 'downloading':
				return version ? `更新 ${version} ${this.getTitlebarDownloadProgressLabel()}` : `更新 ${this.getTitlebarDownloadProgressLabel()}`;
			case 'installing':
				return version ? `更新 ${version} ${this.getTitlebarInstallProgressLabel()}` : `更新 ${this.getTitlebarInstallProgressLabel()}`;
			default:
				return version ? `更新 ${version}` : '更新';
		}
	}

	private getTitlebarUpdateVersionLabel(): string {
		const state = this.updateService.state;
		const update = (state as { readonly update?: { readonly productVersion?: string; readonly version?: string } }).update;
		switch (state.type) {
			case StateType.AvailableForDownload:
			case StateType.Downloading:
			case StateType.Downloaded:
			case StateType.Updating:
			case StateType.Ready:
				return update?.productVersion ?? update?.version ?? '';
			default:
				return '';
		}
	}

	private getTitlebarDownloadProgressLabel(): string {
		const state = this.updateService.state;
		if (state.type === StateType.Downloading && typeof state.downloadedBytes === 'number' && typeof state.totalBytes === 'number' && state.totalBytes > 0) {
			return `${Math.max(0, Math.min(100, Math.floor((state.downloadedBytes / state.totalBytes) * 100)))}%`;
		}

		return '...';
	}

	private getTitlebarInstallProgressLabel(): string {
		const state = this.updateService.state;
		if (state.type === StateType.Updating && typeof state.currentProgress === 'number' && typeof state.maxProgress === 'number' && state.maxProgress > 0) {
			return `${Math.max(0, Math.min(100, Math.floor((state.currentProgress / state.maxProgress) * 100)))}%`;
		}

		return '...';
	}

	private canRunTitlebarUpdateAction(kind: TurboFileTitlebarUpdateActionKind): boolean {
		return kind === 'download' || kind === 'install' || kind === 'restart';
	}

	private createTitlebarMenuButton(label: string, onClick: (button: HTMLElement) => void): HTMLButtonElement {
		const button = $('button.turbofile-titlebar-menu-button') as HTMLButtonElement;
		button.type = 'button';
		button.textContent = label;
		button.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			onClick(button);
		});
		return button;
	}

	private showTitlebarMenu(anchor: HTMLElement, title: string, actions: IAction[]): void {
		const fallbackAction = toAction({ id: `turbofile.titlebar.${title}.empty`, label: '暂无内容', enabled: false, run: () => { } });
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions.length ? actions : [fallbackAction]
		});
	}

	private async runTitlebarUpdateAction(kind: TurboFileTitlebarUpdateActionKind): Promise<void> {
		if (kind === 'download') {
			await this.updateService.downloadUpdate(true);
		} else if (kind === 'install') {
			await this.updateService.applyUpdate();
		} else if (kind === 'restart') {
			await this.updateService.quitAndInstall();
		}
	}

	private ensureTitlebarThemeToggle(retry = 0): void {
		if (!document.body.classList.contains('turbofile-shell')) {
			return;
		}
		this.removeTitlebarThemeToggle();
		const titlebarRight = document.querySelector<HTMLElement>('.monaco-workbench .part.titlebar .titlebar-container > .titlebar-right');
		const controls = titlebarRight?.querySelector<HTMLElement>('.window-controls-container');
		if (!titlebarRight || !controls) {
			if (retry < 10) {
				setTimeout(() => this.ensureTitlebarThemeToggle(retry + 1), 100);
			}
			return;
		}

		titlebarRight.insertBefore(this.createThemeToggleButton(), controls);
	}

	private removeTitlebarThemeToggle(): void {
		for (const button of Array.from(document.querySelectorAll('.turbofile-theme-toggle'))) {
			button.remove();
		}
	}

	private createThemeToggleButton(): HTMLButtonElement {
		const effectiveMode = this.getEffectiveAppearanceMode(this.getAppearanceMode());
		const targetMode = effectiveMode === 'light' ? 'dark' : 'light';
		const button = $('button.turbofile-theme-toggle') as HTMLButtonElement;
		button.type = 'button';
		button.title = effectiveMode === 'light' ? '切换到深色模式' : '切换到浅色模式';
		button.setAttribute('aria-label', button.title);
		button.appendChild(renderTurboFileAppearanceIcon(effectiveMode === 'light' ? 'moon' : 'sun'));
		button.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			void this.applyAppearanceMode(targetMode);
		});
		return button;
	}

	private showAboutDialog(): void {
		this.closeAboutDialog();
		const overlay = $('.turbofile-about-overlay');
		overlay.setAttribute('role', 'presentation');
		const dialog = $('.turbofile-about-dialog');
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-labelledby', 'turbofile-about-title');

		const header = $('.turbofile-about-header');
		const headerTitle = $('div#turbofile-about-title.turbofile-about-header-title');
		headerTitle.textContent = '关于极速传';
		const close = $('button.turbofile-about-close') as HTMLButtonElement;
		close.type = 'button';
		close.title = '关闭';
		close.setAttribute('aria-label', '关闭');
		close.appendChild(renderIcon(Codicon.close));
		close.addEventListener('click', () => this.closeAboutDialog());
		header.append(headerTitle, close);

		const content = $('.turbofile-about-content');
		const icon = $('.turbofile-about-app-icon');
		icon.appendChild(renderTurboFileIcon('lightning-charge-fill'));
		const name = $('div.turbofile-about-name');
		name.textContent = this.productService.nameShort || '极速传';
		const version = $('div.turbofile-about-version');
		version.textContent = `版本 ${this.productService.version}`;
		const copyright = $('div.turbofile-about-copyright');
		copyright.textContent = '© 极速传';
		content.append(icon, name, version, copyright);

		const footer = $('.turbofile-about-footer');
		const ok = $('button.turbofile-about-ok') as HTMLButtonElement;
		ok.type = 'button';
		ok.textContent = '确定';
		ok.addEventListener('click', () => this.closeAboutDialog());
		footer.appendChild(ok);

		dialog.append(header, content, footer);
		overlay.appendChild(dialog);
		overlay.addEventListener('click', event => {
			if (event.target === overlay) {
				this.closeAboutDialog();
			}
		});
		overlay.addEventListener('keydown', event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				this.closeAboutDialog();
			}
		});
		this.aboutDialogElement = overlay;
		document.body.appendChild(overlay);
		getWindow(overlay).requestAnimationFrame(() => ok.focus({ preventScroll: true }));
	}

	private closeAboutDialog(): void {
		this.aboutDialogElement?.remove();
		this.aboutDialogElement = undefined;
	}

	private renderDevicePageCard(device: TurboFileDevice): HTMLElement {
		const card = $('.turbofile-page-card.turbofile-device-page-card');
		card.dataset.deviceOrderId = device.id;
		card.draggable = true;
		card.title = localize('turbofile.dragDeviceToReorder', "拖动卡片调整设备顺序");
		let startedOnAction = false;
		card.addEventListener('pointerdown', event => {
			startedOnAction = event.target instanceof Element && !!event.target.closest('button, a, input, select, textarea');
		});
		card.addEventListener('dragstart', event => {
			if (startedOnAction) {
				event.preventDefault();
				return;
			}
			this.beginDeviceOrderDrag(card, device, event);
		});
		card.classList.add(`is-tone-${this.getDeviceCardTone(device)}`);
		const title = $('.turbofile-page-card-title');
		title.appendChild(this.renderDevicePageIcon(device));
		const titleText = $('span');
		titleText.textContent = device.name;
		title.appendChild(titleText);
		const status = $('span.turbofile-device-card-status');
		const runtimeStatus = this.getDeviceRuntimeStatus(device);
		status.classList.add(`is-${runtimeStatus}`);
		status.textContent = this.getDeviceRuntimeStatusLabel(runtimeStatus);
		title.appendChild(status);
		card.appendChild(title);

		const meta = $('.turbofile-device-page-meta');
		meta.appendChild(this.renderInfoLine('地址', device.id === LOCAL_WINDOWS_DEVICE_ID ? device.host : `${device.host}:${device.port || 22}`));
		meta.appendChild(this.renderInfoLine('用户', device.username || '本机'));
		meta.appendChild(this.renderInfoLine('默认目录', device.defaultPath || (device.id === LOCAL_WINDOWS_DEVICE_ID ? this.getLocalWindowsDefaultPath() : '/')));
		meta.appendChild(this.renderInfoLine('传输模式', this.getDeviceTransferProtocolLabel(device)));
		card.appendChild(meta);

		const actions = $('.turbofile-page-card-actions');
		actions.appendChild(this.createPageButton(Codicon.send, '连接', () => { void this.testDeviceConnection(device); }));
		actions.appendChild(this.createPageButton(Codicon.edit, '编辑', () => this.showEditDeviceForm(device)));
		if (device.id !== LOCAL_WINDOWS_DEVICE_ID) {
			actions.appendChild(this.createPageButton(Codicon.trash, '删除', () => { void this.deleteDeviceFromPage(device); }));
		}
		card.appendChild(actions);
		const result = this.deviceConnectionMessages.get(device.id);
		if (result) {
			const message = $('.turbofile-device-test-result');
			message.classList.add(`is-${result.status}`);
			message.textContent = result.message;
			card.appendChild(message);
		}
		return card;
	}

	private getDeviceRuntimeStatus(device: TurboFileDevice): TurboFileDeviceRuntimeStatus {
		if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
			return 'online';
		}
		return this.deviceRuntimeStatuses.get(device.id) ?? 'unknown';
	}

	private setDeviceRuntimeStatus(device: TurboFileDevice | string, status: TurboFileDeviceRuntimeStatus): void {
		const deviceId = typeof device === 'string' ? device : device.id;
		this.deviceRuntimeStatuses.set(deviceId, deviceId === LOCAL_WINDOWS_DEVICE_ID ? 'online' : status);
	}

	private getDeviceRuntimeStatusLabel(status: TurboFileDeviceRuntimeStatus): string {
		switch (status) {
			case 'online':
				return '在线';
			default:
				return '离线';
		}
	}

	private getDeviceCardTone(device: TurboFileDevice): number {
		const seed = `${device.host}:${device.port || 22}:${device.name}`;
		let hash = 0;
		for (let i = 0; i < seed.length; i++) {
			hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
		}
		return Math.abs(hash) % 6;
	}

	private getDeviceTransferProtocolLabel(device: TurboFileDevice): string {
		switch (device.preferredTransferProtocol) {
			case 'auto-fast':
			case 'tar':
				return device.capabilities.tar ? '智能极速（固定策略）' : '智能极速（tar 未检测到）';
			case 'rsync':
				return device.capabilities.rsync ? 'rsync 增量（可用）' : 'rsync 增量（未通过检测）';
			case 'scp':
				return device.capabilities.scp ? 'SCP 文件（可用）' : 'SCP 文件（未通过检测）';
			case 'sftp':
			default:
				return 'SFTP 稳定模式';
		}
	}

	private renderSettingsPage(): HTMLElement {
		return this.renderTransferPage();

		/*
		const page = $('.turbofile-full-page');
		page.appendChild(this.renderPageHeader(Codicon.settingsGear, '系统设置', '管理 极速传 的本地行为、字体和快捷操作。'));

		const actionsSection = $('.turbofile-settings-section');
		const actionsTitle = $('.turbofile-section-title');
		actionsTitle.appendChild(renderIcon(Codicon.tools));
		actionsTitle.append('快捷操作');
		actionsSection.appendChild(actionsTitle);
		const quickActions = $('.turbofile-settings-actions');
		quickActions.appendChild(this.createPageButton(Codicon.plug, '测试当前 SSH 设备', () => { void this.testCurrentSshConnection(); }));
		quickActions.appendChild(this.createPageButton(Codicon.terminal, '打开左侧终端', () => { void this.openTerminal('left'); }));
		quickActions.appendChild(this.createPageButton(Codicon.terminal, '打开右侧终端', () => { void this.openTerminal('right'); }));
		quickActions.appendChild(this.createPageButton(Codicon.sync, '同步文件夹', () => { void this.syncSelectedDirectories(); }, true));
		actionsSection.appendChild(quickActions);
		page.appendChild(actionsSection);
		return page;
		*/
	}

	private getUiFontSize(): number {
		const stored = Number(this.storageService.get(TURBOFILE_UI_FONT_SIZE_STORAGE_KEY, StorageScope.PROFILE, String(TURBOFILE_UI_DEFAULT_FONT_SIZE)));
		return this.normalizeUiFontSize(stored, TURBOFILE_UI_DEFAULT_FONT_SIZE);
	}

	private getEditorFontSize(): number {
		const value = this.configurationService.getValue<number>('editor.fontSize');
		return this.normalizeEditorFontSize(typeof value === 'number' ? value : TURBOFILE_UI_DEFAULT_FONT_SIZE, TURBOFILE_UI_DEFAULT_FONT_SIZE);
	}

	private normalizeUiFontSize(value: number, fallback: number): number {
		if (!Number.isFinite(value)) {
			return fallback;
		}
		return Math.min(24, Math.max(11, Math.round(value)));
	}

	private normalizeEditorFontSize(value: number, fallback: number): number {
		if (!Number.isFinite(value)) {
			return fallback;
		}
		return Math.min(40, Math.max(8, Math.round(value)));
	}

	private updateUiFontSize(value: number): void {
		const fontSize = this.normalizeUiFontSize(value, this.getUiFontSize());
		this.storageService.store(TURBOFILE_UI_FONT_SIZE_STORAGE_KEY, String(fontSize), StorageScope.PROFILE, StorageTarget.USER);
		this.statusMessage = `UI 字号已设置为 ${fontSize}px。`;
		this.render();
	}

	private updateEditorFontSize(value: number): void {
		const fontSize = this.normalizeEditorFontSize(value, this.getEditorFontSize());
		void this.configurationService.updateValue('editor.fontSize', fontSize, ConfigurationTarget.USER);
		this.statusMessage = `文档字体大小已设置为 ${fontSize}px。`;
		this.render();
	}

	private getUiFontFamily(): string {
		const stored = this.storageService.get(TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY, StorageScope.PROFILE, TURBOFILE_UI_DEFAULT_FONT_FAMILY);
		return TURBOFILE_UI_FONT_FAMILIES.some(([value]) => value === stored) ? stored : TURBOFILE_UI_DEFAULT_FONT_FAMILY;
	}

	private updateUiFontFamily(value: string): void {
		const fontFamily = TURBOFILE_UI_FONT_FAMILIES.some(([option]) => option === value) ? value : TURBOFILE_UI_DEFAULT_FONT_FAMILY;
		this.storageService.store(TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY, fontFamily, StorageScope.PROFILE, StorageTarget.USER);
		this.statusMessage = 'UI 字体已更新。';
		this.render();
	}

	private getBrowserFontSize(): number {
		const stored = Number(this.storageService.get(TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY, StorageScope.PROFILE, String(TURBOFILE_BROWSER_DEFAULT_FONT_SIZE)));
		return this.normalizeBrowserFontSize(stored, TURBOFILE_BROWSER_DEFAULT_FONT_SIZE);
	}

	private normalizeBrowserFontSize(value: number, fallback: number): number {
		if (!Number.isFinite(value)) {
			return fallback;
		}
		return Math.min(20, Math.max(11, Math.round(value)));
	}

	private updateBrowserFontSize(value: number): void {
		const fontSize = this.normalizeBrowserFontSize(value, this.getBrowserFontSize());
		this.storageService.store(TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY, String(fontSize), StorageScope.PROFILE, StorageTarget.USER);
		this.statusMessage = `文件浏览区字体大小已设置为 ${fontSize}px。`;
		this.render();
	}

	private getBrowserFontFamily(): string {
		const stored = this.storageService.get(TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY, StorageScope.PROFILE, TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY);
		return TURBOFILE_BROWSER_FONT_FAMILIES.some(([value]) => value === stored) ? stored : TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY;
	}

	private updateBrowserFontFamily(value: string): void {
		const fontFamily = TURBOFILE_BROWSER_FONT_FAMILIES.some(([option]) => option === value) ? value : TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY;
		this.storageService.store(TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY, fontFamily, StorageScope.PROFILE, StorageTarget.USER);
		this.statusMessage = '文件浏览区字体已更新。';
		this.render();
	}


	private applyBrowserAppearanceSettings(): void {
		if (!this.container) {
			return;
		}
		this.container.style.setProperty('--turbofile-ui-font-size', `${this.getUiFontSize()}px`);
		this.container.style.setProperty('--turbofile-ui-font-family', this.getUiFontFamily());
		this.container.style.setProperty('--turbofile-browser-font-size', `${this.getBrowserFontSize()}px`);
		this.container.style.setProperty('--turbofile-browser-font-family', this.getBrowserFontFamily());
		this.container.style.removeProperty('--turbofile-appearance-contrast-filter');
		this.container.classList.remove('is-appearance-pointer', 'is-appearance-translucent-sidebar');
		document.body.classList.remove('turbofile-appearance-pointer', 'turbofile-appearance-translucent');
		this.container.style.removeProperty('--turbofile-browser-font-color');
	}

	private applyTurboFileThemeState(): void {
		if (!this.container) {
			return;
		}

		const effectiveMode = this.pendingAppearanceMode ?? this.getEffectiveAppearanceMode(this.getAppearanceMode());
		this.applyTurboFileThemeClasses(effectiveMode);
	}

	private applyTurboFileThemeClasses(mode: 'light' | 'dark'): void {
		this.container?.classList.toggle('is-turbofile-light', mode === 'light');
		this.container?.classList.toggle('is-turbofile-dark', mode === 'dark');
		document.body.classList.toggle('turbofile-editor-theme-light', mode === 'light');
		document.body.classList.toggle('turbofile-editor-theme-dark', mode === 'dark');
	}

	private beginAppearanceTransition(mode: 'light' | 'dark'): void {
		if (this.appearanceTransitionTimer !== undefined) {
			getWindow(this.container).clearTimeout(this.appearanceTransitionTimer);
			this.appearanceTransitionTimer = undefined;
		}
		this.pendingAppearanceMode = mode;
		document.body.classList.add('turbofile-theme-switching');
		this.container?.classList.add('is-theme-switching');
		this.applyTurboFileThemeClasses(mode);
		this.ensureTitlebarThemeToggle();
	}

	private endAppearanceTransition(): void {
		if (!this.container) {
			this.pendingAppearanceMode = undefined;
			document.body.classList.remove('turbofile-theme-switching');
			return;
		}

		const targetWindow = getWindow(this.container);
		if (this.appearanceTransitionTimer !== undefined) {
			targetWindow.clearTimeout(this.appearanceTransitionTimer);
		}
		this.appearanceTransitionTimer = targetWindow.setTimeout(() => {
			this.appearanceTransitionTimer = undefined;
			this.pendingAppearanceMode = undefined;
			document.body.classList.remove('turbofile-theme-switching');
			this.container?.classList.remove('is-theme-switching');
			this.applyTurboFileThemeState();
			this.ensureTitlebarThemeToggle();
		}, 180);
	}

	private getAppearanceMode(): 'light' | 'dark' | 'system' {
		if (this.configurationService.getValue<boolean>(ThemeSettings.DETECT_COLOR_SCHEME)) {
			return 'system';
		}
		return this.getEffectiveAppearanceMode();
	}

	private getEffectiveAppearanceMode(mode?: 'light' | 'dark' | 'system'): 'light' | 'dark' {
		if (mode === 'system') {
			const preferred = this.workbenchThemeService.getPreferredColorScheme();
			if (preferred === ColorScheme.LIGHT || preferred === ColorScheme.HIGH_CONTRAST_LIGHT) {
				return 'light';
			}
		}
		if (!mode || mode === 'system') {
			const currentType = this.workbenchThemeService.getColorTheme().type;
			return currentType === ColorScheme.LIGHT || currentType === ColorScheme.HIGH_CONTRAST_LIGHT ? 'light' : 'dark';
		}
		return mode;
	}

	private getAppearanceTheme(mode: 'light' | 'dark'): IWorkbenchColorTheme {
		const label = mode === 'dark' ? TURBOFILE_APPEARANCE_DARK_THEME_LABEL : TURBOFILE_APPEARANCE_LIGHT_THEME_LABEL;
		const settingsId = mode === 'dark' ? ThemeSettingDefaults.COLOR_THEME_DARK : ThemeSettingDefaults.COLOR_THEME_LIGHT;
		const themeId = mode === 'light' ? TURBOFILE_LIGHT_THEME_CLASS_ID : 'vs-dark turbofile-2017-dark-cpp';
		const realTheme = this.availableColorThemes.find(theme => theme.settingsId === settingsId)
			?? this.availableColorThemes.find(theme => theme.label === label || theme.id === themeId);
		if (realTheme) {
			return realTheme;
		}
		const builtinTheme = this.getBuiltinColorThemes().find(theme => theme.label === label || theme.id === themeId || theme.settingsId === settingsId);
		return builtinTheme
			?? this.createBuiltinColorTheme(mode === 'dark' ? 'vs-dark turbofile-2017-dark-cpp' : TURBOFILE_LIGHT_THEME_CLASS_ID, label, settingsId, mode === 'dark' ? COLOR_THEME_DARK_INITIAL_COLORS : TURBOFILE_LIGHT_THEME_COLORS);
	}


	private async applyAppearanceMode(mode: 'light' | 'dark' | 'system'): Promise<void> {
		await this.loadColorThemes(true);
		const darkTheme = this.getAppearanceTheme('dark');
		const lightTheme = this.getAppearanceTheme('light');
		const preferred = this.workbenchThemeService.getPreferredColorScheme();
		const targetMode = mode === 'system'
			? preferred === ColorScheme.LIGHT || preferred === ColorScheme.HIGH_CONTRAST_LIGHT ? 'light' : 'dark'
			: mode;
		this.beginAppearanceTransition(targetMode);
		try {
			if (mode === 'system') {
				await this.configurationService.updateValue(ThemeSettings.PREFERRED_DARK_THEME, darkTheme.settingsId, ConfigurationTarget.USER);
				await this.configurationService.updateValue(ThemeSettings.PREFERRED_LIGHT_THEME, lightTheme.settingsId, ConfigurationTarget.USER);
				await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, true, ConfigurationTarget.USER);
				await this.setColorThemeBySettingsId(preferred === ColorScheme.LIGHT ? lightTheme : darkTheme);
				this.statusMessage = '已设置为跟随系统主题。';
			} else {
				await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, false, ConfigurationTarget.USER);
				await this.applyColorTheme(mode === 'light' ? lightTheme : darkTheme);
				this.endAppearanceTransition();
				return;
			}
			this.endAppearanceTransition();
			this.render();
		} catch (error) {
			this.pendingAppearanceMode = undefined;
			document.body.classList.remove('turbofile-theme-switching');
			this.container?.classList.remove('is-theme-switching');
			const message = error instanceof Error ? error.message : String(error);
			this.statusMessage = `切换外观失败：${message}`;
			this.render();
		}
	}

	private async applyColorTheme(theme: IWorkbenchColorTheme): Promise<void> {
		try {
			await this.setColorThemeBySettingsId(theme);
			this.statusMessage = `已切换主题：${this.getThemeLabel(theme)}`;
			this.render();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.statusMessage = `切换主题失败：${message}`;
			this.render();
		}
	}

	/**
	 * Applies a theme by its settingsId string so the workbench theme service resolves the *real*
	 * registered theme (which lazily loads its TextMate tokenColors). Passing the in-memory
	 * placeholder object instead would apply a theme without tokenColors and flatten document syntax
	 * highlighting to a single color. Falls back to the object only if the id cannot be resolved.
	 */
	private async setColorThemeBySettingsId(theme: IWorkbenchColorTheme): Promise<void> {
		if (theme.settingsId) {
			const applied = await this.workbenchThemeService.setColorTheme(theme.settingsId, 'auto');
			if (applied) {
				return;
			}
		}
		await this.workbenchThemeService.setColorTheme(theme, 'auto');
	}

	private async loadColorThemes(force = false): Promise<void> {
		if (this.isLoadingColorThemes || (!force && this.hasLoadedColorThemes)) {
			return;
		}
		this.isLoadingColorThemes = true;
		try {
			const themes = await this.workbenchThemeService.getColorThemes();
			const colorThemes = themes.slice();
			for (const builtinTheme of this.getBuiltinColorThemes()) {
				this.appendColorThemeIfMissing(colorThemes, builtinTheme);
			}
			this.availableColorThemes = colorThemes.slice().sort((a, b) => {
				const typeDelta = this.getThemeTypeOrder(a.type) - this.getThemeTypeOrder(b.type);
				if (typeDelta !== 0) {
					return typeDelta;
				}
				return a.label.localeCompare(b.label, 'zh-Hans');
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.statusMessage = `加载主题失败：${message}`;
		} finally {
			this.isLoadingColorThemes = false;
			this.hasLoadedColorThemes = true;
		}
	}

	private async syncNativeEditorDisplaySettings(): Promise<void> {
		const settingsHome = this.environmentService.parentAppUserRoamingDataHome;
		if (!settingsHome) {
			return;
		}

		const settingsUri = joinPath(settingsHome, 'settings.json');
		try {
			const settingsText = (await this.fileService.readFile(settingsUri)).value.toString();
			const settings = JSON.parse(settingsText) as Record<string, unknown>;
			const updates: Promise<void>[] = [];
			const applyIfUnset = (key: string, value: unknown): void => {
				const inspect = this.configurationService.inspect(key);
				if (inspect.userValue !== undefined || inspect.userLocalValue !== undefined || inspect.userRemoteValue !== undefined || inspect.workspaceValue !== undefined || inspect.workspaceFolderValue !== undefined || inspect.memoryValue !== undefined) {
					return;
				}
				updates.push(this.configurationService.updateValue(key, value, ConfigurationTarget.MEMORY));
			};

			const editorFontSize = settings['editor.fontSize'];
			if (typeof editorFontSize === 'number' && Number.isFinite(editorFontSize)) {
				applyIfUnset('editor.fontSize', editorFontSize);
			}

			const editorFontFamily = settings['editor.fontFamily'];
			if (typeof editorFontFamily === 'string' && editorFontFamily.length) {
				applyIfUnset('editor.fontFamily', editorFontFamily);
			}

			const editorLineHeight = settings['editor.lineHeight'];
			if (typeof editorLineHeight === 'number' && Number.isFinite(editorLineHeight)) {
				applyIfUnset('editor.lineHeight', editorLineHeight);
			}

			const editorFontLigatures = settings['editor.fontLigatures'];
			if (typeof editorFontLigatures === 'boolean' || typeof editorFontLigatures === 'string') {
				applyIfUnset('editor.fontLigatures', editorFontLigatures);
			}

			const tokenColorCustomizations = settings['editor.tokenColorCustomizations'];
			if (tokenColorCustomizations && typeof tokenColorCustomizations === 'object') {
				applyIfUnset('editor.tokenColorCustomizations', tokenColorCustomizations as object);
			}

			const semanticTokenColorCustomizations = settings['editor.semanticTokenColorCustomizations'];
			if (semanticTokenColorCustomizations && typeof semanticTokenColorCustomizations === 'object') {
				applyIfUnset('editor.semanticTokenColorCustomizations', semanticTokenColorCustomizations as object);
			}

			const semanticHighlighting = settings['editor.semanticHighlighting.enabled'];
			if (typeof semanticHighlighting === 'boolean' || typeof semanticHighlighting === 'string') {
				applyIfUnset('editor.semanticHighlighting.enabled', semanticHighlighting);
			}

			await Promise.all(updates);
		} catch {
			// If the host VS Code settings file is unavailable, keep the current editor configuration.
		}
	}

	private getBuiltinColorThemes(): IWorkbenchColorTheme[] {
		return [
			this.createBuiltinColorTheme('vs-dark turbofile-dark-2026', '深色 2026', 'Dark 2026', COLOR_THEME_DARK_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs-dark turbofile-dark-plus', 'Dark+', 'Dark+', COLOR_THEME_DARK_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs-dark turbofile-dark-modern', 'Dark Modern', 'Dark Modern', COLOR_THEME_DARK_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs-dark turbofile-vs-dark', 'Dark (Visual Studio)', 'Visual Studio Dark', COLOR_THEME_DARK_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs-dark turbofile-cpp-dark', 'Dark (Visual Studio - C/C++)', 'Visual Studio Dark - C++', COLOR_THEME_DARK_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs-dark turbofile-2017-dark-cpp', TURBOFILE_APPEARANCE_DARK_THEME_LABEL, ThemeSettingDefaults.COLOR_THEME_DARK, COLOR_THEME_DARK_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs turbofile-light-plus', 'Light+', 'Light+', COLOR_THEME_LIGHT_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs turbofile-light-modern', 'Light Modern', 'Light Modern', COLOR_THEME_LIGHT_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs turbofile-vs-light', 'Light (Visual Studio)', 'Visual Studio Light', COLOR_THEME_LIGHT_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs turbofile-cpp-light', 'Light (Visual Studio - C/C++)', 'Visual Studio Light - C++', COLOR_THEME_LIGHT_INITIAL_COLORS),
			this.createBuiltinColorTheme('vs turbofile-2017-light-cpp', '2017 Light (Visual Studio - C/C++)', 'Visual Studio 2017 Light - C++', COLOR_THEME_LIGHT_INITIAL_COLORS),
			this.createTurboFileLightColorTheme(),
			this.createBuiltinColorTheme('hc-black', '高对比深色', ThemeSettingDefaults.COLOR_THEME_HC_DARK, {
				'activityBar.background': '#000000',
				'activityBar.activeBorder': '#f38518',
				'activityBar.foreground': '#ffffff',
				'sideBar.background': '#000000',
				'sideBar.border': '#6fc3df',
				'editor.background': '#000000',
				'editor.foreground': '#ffffff',
				'panel.background': '#000000',
				'focusBorder': '#f38518',
				'button.background': '#0f4a85',
				'button.foreground': '#ffffff'
			}),
			this.createBuiltinColorTheme('hc-light', '高对比浅色', ThemeSettingDefaults.COLOR_THEME_HC_LIGHT, {
				'activityBar.background': '#ffffff',
				'activityBar.activeBorder': '#0f4a85',
				'activityBar.foreground': '#000000',
				'sideBar.background': '#ffffff',
				'sideBar.border': '#0f4a85',
				'editor.background': '#ffffff',
				'editor.foreground': '#000000',
				'panel.background': '#ffffff',
				'focusBorder': '#0f4a85',
				'button.background': '#0f4a85',
				'button.foreground': '#ffffff'
			})
		];
	}

	private appendColorThemeIfMissing(themes: IWorkbenchColorTheme[], theme: IWorkbenchColorTheme): void {
		if (!themes.some(candidate => candidate.id === theme.id || candidate.settingsId === theme.settingsId || candidate.label === theme.label)) {
			themes.push(theme);
		}
	}

	private createTurboFileLightColorTheme(): IWorkbenchColorTheme {
		return this.createBuiltinColorTheme(TURBOFILE_LIGHT_THEME_CLASS_ID, TURBOFILE_APPEARANCE_LIGHT_THEME_LABEL, TURBOFILE_LIGHT_THEME_ID, TURBOFILE_LIGHT_THEME_COLORS);
	}

	private createBuiltinColorTheme(id: string, label: string, settingsId: string, colors: { readonly [id: string]: string }): IWorkbenchColorTheme {
		const theme = ColorThemeData.createUnloadedTheme(id, colors as { [id: string]: string });
		theme.label = label;
		theme.settingsId = settingsId;
		theme.isLoaded = true;
		return theme;
	}

	private getThemeLabel(theme: IWorkbenchColorTheme): string {
		return theme.label || theme.settingsId || this.getThemeTypeLabel(theme.type);
	}

	private getThemeTypeLabel(type: ColorScheme): string {
		switch (type) {
			case ColorScheme.LIGHT:
				return '浅色';
			case ColorScheme.HIGH_CONTRAST_DARK:
				return '高对比深色';
			case ColorScheme.HIGH_CONTRAST_LIGHT:
				return '高对比浅色';
			default:
				return '深色';
		}
	}

	private getThemeTypeOrder(type: ColorScheme): number {
		switch (type) {
			case ColorScheme.DARK:
				return 0;
			case ColorScheme.LIGHT:
				return 1;
			case ColorScheme.HIGH_CONTRAST_DARK:
				return 2;
			case ColorScheme.HIGH_CONTRAST_LIGHT:
				return 3;
		}
	}

	private renderTasksPage(): HTMLElement {
		return this.createJournalView(false);
	}

	private createJournalView(compact: boolean): HTMLElement {
		const view = this.renderDisposables.add(new TurboFileJournalView(this.journalService, {
			compact,
			back: () => this.setActivePage('transfer')
		}));
		return view.element;
	}

	private renderPageHeader(icon: ThemeIcon, title: string, subtitle: string, actions: HTMLElement[] = []): HTMLElement {
		const header = $('.turbofile-page-header');
		const copy = $('.turbofile-page-header-copy');
		const heading = $('h2');
		heading.appendChild(renderIcon(icon));
		heading.append(title);
		const detail = $('p');
		detail.textContent = subtitle;
		copy.appendChild(heading);
		copy.appendChild(detail);
		header.appendChild(copy);
		if (actions.length) {
			const actionBar = $('.turbofile-page-header-actions');
			for (const action of actions) {
				actionBar.appendChild(action);
			}
			header.appendChild(actionBar);
		}
		return header;
	}

	private renderInfoLine(label: string, value: string): HTMLElement {
		const line = $('.turbofile-info-line');
		const key = $('span');
		key.textContent = label;
		const content = $('strong');
		content.textContent = value;
		line.appendChild(key);
		line.appendChild(content);
		return line;
	}

	private createPageButton(icon: ThemeIcon, label: string, handler: () => void, primary = false): HTMLButtonElement {
		const button = $('button.turbofile-page-button') as HTMLButtonElement;
		button.type = 'button';
		if (primary) {
			button.classList.add('is-primary');
		}
		button.appendChild(renderIcon(icon));
		button.append(label);
		button.addEventListener('click', handler);
		return button;
	}

	private showAddDeviceForm(): void {
		this.closeDeviceSelect(undefined, false);
		this.activePage = 'devices';
		this.updateTransferTabsVisibility();
		this.notifyActivePageChanged();
		this.isDeviceFormVisible = true;
		this.editingDeviceId = undefined;
		this.deviceFormMessage = '';
		this.statusMessage = '请填写 SSH 设备信息，保存后会出现在设备下拉列表中。';
		this.render();
	}


	private showEditDeviceForm(device: TurboFileDevice): void {
		this.closeDeviceSelect(undefined, false);
		this.activePage = 'devices';
		this.updateTransferTabsVisibility();
		this.notifyActivePageChanged();
		this.isDeviceFormVisible = true;
		this.editingDeviceId = device.id;
		this.deviceFormMessage = `正在编辑设备：${device.name}`;
		this.statusMessage = this.deviceFormMessage;
		this.render();
	}

	private setActivePage(page: TurboFileWorkbenchPage): void {
		if (page !== this.activePage) {
			this.closeDeviceSelect(undefined, false);
		}
		if (page !== 'images' && page !== 'transfer' && (this.imageGridState || this.paneImageGridStates.left || this.paneImageGridStates.right)) {
			this.releaseAllImageGridStates();
			this.disposeImageGridObserver();
			this.clearImageGridScrollTimer();
			this.clearImageGridScrollRaf();
			this.clearImageGridThumbnailQueue();
			this.clearImageGridPreviewPrefetchTimer();
			this.imagePreviewAnalysis = undefined;
			this.clearImagePreviewRender();
		}
		this.activePage = page;
		if (page !== 'transfer') {
			this.taskbarHiddenForTerminal = false;
		}
		this.isTaskLogVisible = false;
		this.isDeviceFormVisible = false;
		this.editingDeviceId = undefined;
		this.updateTransferTabsVisibility();
		this.notifyActivePageChanged();
		this.render();
	}

	private updateTransferTabsVisibility(): void {
		this.syncGlobalEditorVisibility();
	}

	private syncGlobalEditorVisibility(): boolean {
		const body = document.body;
		let visibleEditors = turboFileVisibleEditors.get(body);
		if (this.isEditorVisible) {
			if (!visibleEditors) {
				visibleEditors = new Set<TurboFileEditor>();
				turboFileVisibleEditors.set(body, visibleEditors);
			}
			visibleEditors.add(this);
		} else {
			visibleEditors?.delete(this);
		}

		const hasVisibleEditor = (visibleEditors?.size ?? 0) > 0;
		body.classList.toggle('turbofile-main-editor-visible', hasVisibleEditor);
		body.classList.toggle('turbofile-transfer-tabs-visible', !!visibleEditors && Array.from(visibleEditors).some(editor => editor.activePage === 'transfer'));
		if (!hasVisibleEditor) {
			turboFileVisibleEditors.delete(body);
		}
		return hasVisibleEditor;
	}

	private notifyActivePageChanged(): void {
		if (!this.currentInput) {
			return;
		}
		turboFileWorkbenchBridge.reportActivePage(this.currentInput.instanceId, this.activePage);
	}


	private async deleteDeviceFromPage(device: TurboFileDevice): Promise<void> {
		if (!this.deviceStore || device.id === LOCAL_WINDOWS_DEVICE_ID) {
			return;
		}
		const confirmed = getWindow(this.container).confirm(`确定删除设备“${device.name}”吗？`);
		if (!confirmed) {
			return;
		}
		const affectedSides = (['left', 'right'] as const).filter(side => this.paneStates[side].deviceId === device.id);
		await this.deviceStore.deleteDevice(device.id);
		this.invalidatePreparedTransferPair();
		this.deviceConnectionMessages.delete(device.id);
		this.deviceRuntimeStatuses.delete(device.id);
		this.devices = this.deviceStore.loadDevices();
		this.ensurePaneDeviceSelection();
		for (const side of affectedSides) {
			const state = this.paneStates[side];
			state.items = [];
			state.loading = false;
			state.error = undefined;
			state.selectedPath = undefined;
			state.selectedPaths.clear();
			state.selectionAnchorPath = undefined;
		}
		this.statusMessage = `已删除设备：${device.name}`;
		this.render();
		for (const side of affectedSides) {
			void this.refreshPane(side);
		}
		this.prewarmCurrentTransferPair(true);
	}

	async testDeviceConnection(device: TurboFileDevice): Promise<void> {
		if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
			this.statusMessage = '本机 Windows 设备不需要 SSH 测试。';
			this.render();
			return;
		}
		this.deviceConnectionMessages.set(device.id, { status: 'testing', message: '正在测试 SSH 连接...' });
		this.setDeviceRuntimeStatus(device, 'testing');
		this.render();
		const task = this.beginTask('ssh-test', `测试 ${device.name}`, `${device.username}@${device.host}:${device.port || 22}`);
		const result = await this.sshService.testConnection(await this.getSshConnectionOptions(device));
		if (result.ok) {
			this.finishTask(task, 'success', `SSH 连接成功：${device.name}`);
			this.deviceConnectionMessages.set(device.id, { status: 'success', message: `SSH 连接成功：${device.name}` });
			this.setDeviceRuntimeStatus(device, 'online');
			this.statusMessage = `SSH 连接成功：${device.name}`;
		} else {
			this.finishTask(task, 'error', `SSH 连接失败：${result.message}`, { error: result.message });
			this.deviceConnectionMessages.set(device.id, { status: 'error', message: `SSH 连接失败：${result.message}` });
			this.setDeviceRuntimeStatus(device, 'offline');
			this.statusMessage = `SSH 连接失败：${result.message}`;
		}
		this.render();
	}

	private async detectAndStoreDeviceCapabilities(device: TurboFileDevice): Promise<TurboFileProtocolCheckResult | undefined> {
		if (!this.deviceStore || device.id === LOCAL_WINDOWS_DEVICE_ID || device.preferredTransferProtocol === 'sftp') {
			return undefined;
		}

		const result = await this.sshService.detectCapabilities(await this.getSshConnectionOptions(device));
		if (!result.ok || !result.capabilities) {
			return { status: 'error', message: `设备能力检测失败，将按 SFTP 兜底：${result.message}` };
		}

		const capabilities = this.toDeviceCapabilities(result.capabilities);
		this.deviceStore.updateDeviceCapabilities(device.id, capabilities);
		return this.getProtocolCheckResult(this.normalizeTransferProtocol(device.preferredTransferProtocol ?? defaultTurboFileTransferProtocol), result.capabilities);
	}

	private async detectDraftProtocolCapabilities(draft: TurboFileDeviceDraft, editingDevice: TurboFileDevice | undefined): Promise<TurboFileProtocolCheckResult | undefined> {
		if (draft.preferredTransferProtocol === 'sftp') {
			return { status: 'success', message: 'SFTP 稳定模式，无需额外检测。', missingDependencies: [] };
		}

		const result = await this.sshService.detectCapabilities(await this.getSshConnectionOptionsFromDraft(draft, editingDevice));
		if (!result.ok || !result.capabilities) {
			return { status: 'error', message: `设备能力检测失败：${result.message}`, missingDependencies: [] };
		}

		return this.getProtocolCheckResult(this.normalizeTransferProtocol(draft.preferredTransferProtocol ?? defaultTurboFileTransferProtocol), result.capabilities);
	}

	private getProtocolCheckResult(protocol: TurboFileTransferProtocol, capabilities: ITurboFileRemoteCapabilities): TurboFileProtocolCheckResult | undefined {
		if (protocol === 'auto-fast') {
			if (capabilities.tar && capabilities.scp) {
				return { status: 'success', message: '智能极速可用：单文件固定使用 SCP，多文件和文件夹固定使用 tar。', capabilities, missingDependencies: [] };
			}
			if (capabilities.scp) {
				return { status: 'error', message: '智能极速需要 tar 支持：单文件可用 SCP，多文件和文件夹需要 tar。', capabilities, missingDependencies: [] };
			}
			return { status: 'error', message: '未检测到可用传输能力，请检查 SSH/SFTP/SCP。', capabilities, missingDependencies: [] };
		}
		if (protocol === 'rsync') {
			const missingDependencies = this.getMissingProtocolDependencies(protocol, capabilities);
			if (capabilities.rsync) {
				const message = capabilities.sshpass
					? 'rsync 可用，sshpass 可用。重复同步会使用 rsync 增量模式。'
					: 'rsync 可用。本地与 SSH 互传可直接使用；SSH 设备互传密码路线建议安装 sshpass。';
				return { status: 'success', message, capabilities, missingDependencies };
			}
			return { status: 'error', message: `缺少 ${missingDependencies.join('、')}，rsync 增量不可用。`, capabilities, missingDependencies };
		}
		if (protocol === 'tar') {
			return this.getProtocolCheckResult('auto-fast', capabilities);
		}
		if (protocol === 'scp') {
			return capabilities.scp
				? { status: 'success', message: 'SCP 可用，兼容模式可使用。', capabilities, missingDependencies: [] }
				: { status: 'error', message: 'SCP 不可用，将按 SFTP 兜底。', capabilities, missingDependencies: [] };
		}
		return undefined;
	}

	private getMissingProtocolDependencies(protocol: TurboFileTransferProtocol, capabilities: ITurboFileRemoteCapabilities): TurboFileTransferDependency[] {
		if (protocol !== 'rsync') {
			return [];
		}
		const missing: TurboFileTransferDependency[] = [];
		if (!capabilities.rsync) {
			missing.push('rsync');
		}
		if (!capabilities.sshpass) {
			missing.push('sshpass');
		}
		return missing;
	}

	private toDeviceCapabilities(capabilities: ITurboFileRemoteCapabilities): TurboFileDeviceCapabilities {
		return {
			ssh: capabilities.ssh,
			sftp: capabilities.sftp,
			scp: capabilities.scp,
			rsync: capabilities.rsync,
			tar: capabilities.tar ?? capabilities.archive,
			shell: capabilities.shell,
			archive: capabilities.archive
		};
	}

	private handleWorkbenchCommand(command: TurboFileWorkbenchCommand): void {
		if (!this.deviceStore) {
			return;
		}
		if (command.targetInstanceId && command.targetInstanceId !== this.currentInput?.instanceId) {
			return;
		}

		if (command.type === 'showPage') {
			this.setActivePage(command.page);
			return;
		}

		if (command.type === 'addDevice') {
			this.showAddDeviceForm();
			return;
		}

		if (command.type === 'refreshDevices') {
			void this.refreshDevicesFromStore();
			return;
		}

		if (command.type === 'selectDevice') {
			const device = this.getAllDevices().find(candidate => candidate.id === command.deviceId);
			if (!device) {
				this.statusMessage = '未找到要打开的设备。';
				this.render();
				return;
			}
			const targetSide = this.paneStates.right.deviceId === device.id ? 'left' : 'right';
			if (targetSide === 'right') {
				this.hasAppliedInitialRightPaneDefault = true;
			}
			const state = this.paneStates[targetSide];
			state.deviceId = device.id;
			state.path = this.getDefaultPaneDevicePath(device);
			state.items = [];
			state.error = undefined;
			this.resetPaneScroll(targetSide);
			this.clearPaneSelection(targetSide);
			this.statusMessage = `已在${this.getSideLabel(targetSide)}打开设备：${device.name}`;
			this.render();
			this.prewarmCurrentTransferPair();
			void this.refreshPane(targetSide).finally(() => this.prewarmCurrentTransferPair());
			return;
		}

		if (command.type === 'showSettings') {
			this.setActivePage('transfer');
			return;
		}

		if (command.type === 'showTaskLog') {
			this.setActivePage('tasks');
			return;
		}

		if (command.type === 'clearTasks') {
			this.clearFinishedTasks();
			return;
		}

		if (command.type === 'testConnection') {
			void this.testCurrentSshConnection();
			return;
		}

		if (command.type === 'sync') {
			void this.syncSelectedDirectories();
			return;
		}

		if (command.type === 'openTerminal') {
			void this.openTerminal(command.side);
		}
	}

	private renderPane(side: 'left' | 'right'): HTMLElement {
		const state = this.paneStates[side];
		const device = this.getPaneDevice(side);
		const pane = $('.turbofile-pane');
		pane.dataset.turbofileSide = side;
		pane.classList.toggle('is-maximized', this.maximizedPane === side);
		pane.classList.toggle('is-hidden-by-maximize', !!this.maximizedPane && this.maximizedPane !== side);
		pane.addEventListener('pointerdown', () => this.setActiveFilePaneSide(side));
		pane.addEventListener('focusin', () => this.setActiveFilePaneSide(side));
		const paneImageGridState = this.activePage === 'transfer' ? this.paneImageGridStates[side] : undefined;
		if (paneImageGridState) {
			pane.classList.add('turbofile-pane-image-grid');
			pane.appendChild(this.renderImageGridPage(paneImageGridState));
			return pane;
		}
		const browserTitle = state.trashMode.active
			? state.trashMode.browseItem
				? localize('turbofile.recycleBinDirectoryTitle', "{0} - 回收站 - {1}", device ? this.getDeviceDisplayLabel(device) : localize('turbofile.unknownDevice', "未知设备"), state.trashMode.browseItem.originalName)
				: localize('turbofile.recycleBinTitle', "{0} - 回收站", device ? this.getDeviceDisplayLabel(device) : localize('turbofile.unknownDevice', "未知设备"))
			: side === 'left' ? '左侧文件浏览' : '右侧文件浏览';

		const header = $('.turbofile-pane-header');
		header.appendChild(this.renderDeviceSelect(side, device));

		const browserHeader = $('.turbofile-browser-header');
		const toolbar = $('.turbofile-browser-toolbar');
		const toolbarTitle = $('.turbofile-browser-toolbar-title');
		toolbarTitle.appendChild(state.trashMode.active ? renderIcon(Codicon.trash) : renderTurboFileIcon(side === 'left' ? 'files' : 'folder-check', side === 'left' ? 'info' : 'success'));
		toolbarTitle.append(browserTitle);
		const itemCount = $('.turbofile-browser-item-count');
		this.updatePaneItemCountElement(side, itemCount);
		toolbarTitle.appendChild(itemCount);
		toolbar.appendChild(toolbarTitle);
		const toolbarAccent: TurboFileIconColor = side === 'left' ? 'primary' : 'success';
		const gridAccent: TurboFileIconColor = side === 'left' ? 'info' : 'success';
		this.appendPaneSortButton(toolbar, side, toolbarAccent);
		this.appendDragOperationButton(toolbar, side);
		this.appendToolbarButton(toolbar, Codicon.refresh, '刷新', () => this.refreshPane(side, { force: true }), 'arrow-clockwise', toolbarAccent);
		this.appendToolbarButton(toolbar, Codicon.search, '搜索', () => this.searchInPane(side), 'search', toolbarAccent);
		if (!state.trashMode.active) {
			this.appendToolbarButton(toolbar, Codicon.trash, '删除选中项', () => this.deleteSelected(side), 'trash', 'danger');
			this.appendRecycleBinButton(toolbar, side);
		}
		this.appendToolbarButton(toolbar, Codicon.copy, '复制当前路径', () => { void this.copyPanePath(side); }, 'files', 'secondary');
		this.appendToolbarButton(toolbar, Codicon.fileMedia, '展开图片', () => this.openImageGrid(side), 'grid-3x3-gap', gridAccent);
		this.appendToolbarButton(toolbar, side === 'left' ? Codicon.layoutSidebarLeft : Codicon.layoutSidebarRight, '在当前侧展开图片', () => this.openImageGrid(side, undefined, false, 'grid', 'pane'));
		this.appendToolbarButton(toolbar, Codicon.terminal, '打开终端', () => this.openTerminal(side), 'terminal', toolbarAccent);
		if (state.trashMode.active) {
			this.appendToolbarButton(toolbar, Codicon.arrowLeft, state.trashMode.browseItem ? localize('turbofile.recycleBinBackToRoot', "返回回收站") : localize('turbofile.recycleBinBack', "返回"), () => state.trashMode.browseItem ? this.leaveTrashDirectory(side) : this.leaveTrashView(side));
			if (isTurboFileTrashRootView(state.trashMode)) {
				this.appendToolbarButton(toolbar, Codicon.discard, localize('turbofile.recycleBinRestoreSelected', "还原选中项"), () => { void this.restoreSelectedTrashItems(side); });
			}
			this.appendToolbarButton(toolbar, Codicon.clearAll, localize('turbofile.recycleBinEmpty', "清空回收站"), () => { void this.emptyTrash(side); });
		}
		this.appendToolbarButton(
			toolbar,
			this.maximizedPane === side ? Codicon.screenNormal : Codicon.screenFull,
			this.maximizedPane === side ? '恢复双栏' : '单栏显示',
			() => this.togglePaneMaximized(side)
		);

		const pathbar = this.renderPanePathbar(side, device, state, toolbarAccent);
		const selectedCount = this.getSelectedTransferItems(side).length;
		if (selectedCount > 1) {
			const selectionCount = $('.turbofile-selection-count');
			selectionCount.textContent = `已选 ${selectedCount} 项`;
			pathbar.appendChild(selectionCount);
		}

		browserHeader.appendChild(toolbar);
		browserHeader.appendChild(pathbar);

		const list = $('.turbofile-file-list');
		list.classList.toggle('is-external-drop-target', this.externalDropTargetSide === side);
		list.classList.add('show-file-icons');
		list.tabIndex = 0;
		list.addEventListener('pointerdown', event => {
			this.setActiveFilePaneSide(side);
			if ((event.target as HTMLElement | null)?.closest('.turbofile-inline-rename')) {
				return;
			}
			list.focus({ preventScroll: true });
		});
		list.addEventListener('click', event => {
			const target = event.target as HTMLElement | null;
			if (!target?.closest('.turbofile-file-row') && this.paneStates[side].selectedPaths.size) {
				this.clearPaneSelection(side);
				this.updateRenderedSelection(side);
			}
		});
		list.addEventListener('keydown', event => {
			if (event.key === 'F2') {
				event.preventDefault();
				this.setActiveFilePaneSide(side);
				void this.renameSelected(side);
				return;
			}
			if (event.key === 'Delete') {
				event.preventDefault();
				this.setActiveFilePaneSide(side);
				void this.deleteSelected(side);
				return;
			}
			if ((event.ctrlKey || event.metaKey) && !event.altKey) {
				if (this.isEditableKeyboardTarget(event.target)) {
					return;
				}
				const key = this.getClipboardShortcutKey(event);
				if (key === 'a') {
					event.preventDefault();
					this.setActiveFilePaneSide(side);
					this.selectAllPaneItems(side);
					return;
				}
				if (key === 'c' || key === 'x') {
					event.preventDefault();
					this.setActiveFilePaneSide(side);
					this.copySelectedToInternalClipboard(side, key === 'x' ? 'move' : 'copy', false);
					return;
				}
			}
		});
		list.addEventListener('paste', event => {
			if (this.isEditableKeyboardTarget(event.target)) {
				return;
			}
			event.preventDefault();
			void this.pasteIntoPane(side);
		});
		list.addEventListener('dragover', event => {
			const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.nativeDragSession?.sourceSide;
			if (sourceSide && sourceSide !== side) {
				this.consumeTurboFileDropEvent(event);
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = getTurboFileDropEffect(this.getDragOperationFromEvent(event, sourceSide));
				}
				this.setExternalDropTargetSide(undefined);
				return;
			}

			if (this.hasExternalDropData(event)) {
				this.consumeTurboFileDropEvent(event);
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = getTurboFileDropEffect(this.getDragOperationFromEvent(event, side));
				}
				this.setExternalDropTargetSide(side);
				return;
			}

			this.setExternalDropTargetSide(undefined);
		});
		list.addEventListener('dragleave', event => {
			const relatedTarget = event.relatedTarget;
			if (relatedTarget instanceof Node && list.contains(relatedTarget)) {
				return;
			}
			this.setExternalDropTargetSide(undefined);
		});
		list.addEventListener('drop', event => {
			const initiatedAt = Date.now();
			this.consumeTurboFileDropEvent(event);
			this.setExternalDropTargetSide(undefined);
			const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.nativeDragSession?.sourceSide;
			const operation = this.getDragOperationFromEvent(event, sourceSide || side);
			if (this.nativeDragSession && sourceSide) {
				if (sourceSide !== side) {
					this.recordNativeInternalDrop({ kind: 'pane', side, initiatedAt });
				}
				return;
			}

			// Read the external paths synchronously (the dataTransfer is only valid inside the handler),
			// then defer the transfer so the drag image is cleared before the list re-renders.
			const externalPaths = this.extractExternalDropPaths(event);
			this.clearCurrentFileDragState();
			if (externalPaths.length) {
				this.deferAfterDrag(() => void this.transferExternalPaths(side, externalPaths, operation, initiatedAt));
			}
		});
		list.addEventListener('contextmenu', event => this.showPaneContextMenu(side, event));
		list.addEventListener('scroll', () => this.handleFileListScroll(side, list));

		this.renderFileList(side, list);

		pane.appendChild(header);
		pane.appendChild(browserHeader);
		pane.appendChild(list);
		return pane;
	}

	private renderDeviceSelect(side: 'left' | 'right', currentDevice: TurboFileDevice | undefined): HTMLElement {
		const select = $('.turbofile-device-select');
		const button = $('button.turbofile-device-select-button') as HTMLButtonElement;
		const menu = $('.turbofile-device-select-menu');
		const devices = this.getAllDevices();
		const isOpen = this.openDeviceSelectSide === side;
		select.dataset.turbofileSide = side;
		select.classList.toggle('is-open', isOpen);
		button.type = 'button';
		button.title = '选择设备';
		button.setAttribute('aria-haspopup', 'menu');
		button.setAttribute('aria-expanded', String(isOpen));
		button.setAttribute('aria-label', `${this.getSideLabel(side)}设备选择`);
		button.appendChild(this.renderDeviceSelectIcon(currentDevice));
		button.appendChild($('span.turbofile-device-select-label', undefined, currentDevice ? this.getDeviceDisplayLabel(currentDevice) : 'Windows'));
		button.appendChild(renderIcon(Codicon.chevronDown));

		menu.setAttribute('role', 'menu');
		menu.setAttribute('aria-label', `${this.getSideLabel(side)}设备列表`);
		for (const device of devices) {
			const option = $('button.turbofile-device-select-option') as HTMLButtonElement;
			option.type = 'button';
			option.setAttribute('role', 'option');
			option.setAttribute('aria-selected', device.id === currentDevice?.id ? 'true' : 'false');
			option.dataset.deviceId = device.id;
			if (device.id === currentDevice?.id) {
				option.classList.add('is-selected');
			}
			option.appendChild(this.renderDeviceSelectIcon(device));
			option.appendChild($('span.turbofile-device-select-label', undefined, this.getDeviceDisplayLabel(device)));
			option.addEventListener('pointerenter', () => this.prefetchPaneDeviceDefaultDirectory(side, device));
			option.addEventListener('focus', () => this.prefetchPaneDeviceDefaultDirectory(side, device));
			option.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				this.closeDeviceSelect(side, false);
				this.setPaneDevice(side, device);
			});
			menu.appendChild(option);
		}

		const toggleMenu = (event: MouseEvent | KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const nextOpen = this.openDeviceSelectSide !== side || !select.classList.contains('is-open');
			this.closeDeviceSelect(undefined, false);
			this.openDeviceSelectSide = nextOpen ? side : undefined;
			select.classList.toggle('is-open', nextOpen);
			button.setAttribute('aria-expanded', String(nextOpen));
			if (nextOpen) {
				this.pendingRenderAfterDeviceSelectClose = false;
				const selected = menu.querySelector<HTMLElement>('.turbofile-device-select-option.is-selected') ?? menu.querySelector<HTMLElement>('.turbofile-device-select-option');
				selected?.focus();
			} else {
				this.flushPendingRenderAfterDeviceSelectClose();
			}
		};

		button.addEventListener('click', toggleMenu);
		button.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
				toggleMenu(event);
			}
		});
		select.addEventListener('keydown', event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				this.closeDeviceSelect(side);
				button.focus();
			}
		});
		const window = getWindow(select);
		const handleWindowClick = (event: MouseEvent) => {
			if (!select.contains(event.target as Node | null)) {
				this.closeDeviceSelect(side);
			}
		};
		const handleWindowKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && select.classList.contains('is-open')) {
				event.preventDefault();
				this.closeDeviceSelect(side);
				button.focus();
			}
		};
		window.addEventListener('click', handleWindowClick);
		window.addEventListener('keydown', handleWindowKeydown);
		this.renderDisposables.add({ dispose: () => window.removeEventListener('click', handleWindowClick) });
		this.renderDisposables.add({ dispose: () => window.removeEventListener('keydown', handleWindowKeydown) });

		select.appendChild(button);
		select.appendChild(menu);
		return select;
	}

	private shouldDeferRenderForOpenDeviceSelect(): boolean {
		if (this.activePage !== 'transfer' || !this.openDeviceSelectSide || !this.container) {
			return false;
		}
		return !!this.container.querySelector(`.turbofile-device-select[data-turbofile-side="${this.openDeviceSelectSide}"].is-open`);
	}

	private closeDeviceSelect(side?: 'left' | 'right', flushPendingRender = true): void {
		if (side && this.openDeviceSelectSide !== side) {
			return;
		}
		this.openDeviceSelectSide = undefined;
		for (const opened of Array.from(this.container?.querySelectorAll('.turbofile-device-select.is-open') ?? [])) {
			opened.classList.remove('is-open');
			opened.querySelector('.turbofile-device-select-button')?.setAttribute('aria-expanded', 'false');
		}
		if (flushPendingRender) {
			this.flushPendingRenderAfterDeviceSelectClose();
		}
	}

	private flushPendingRenderAfterDeviceSelectClose(): void {
		if (!this.pendingRenderAfterDeviceSelectClose) {
			return;
		}
		this.pendingRenderAfterDeviceSelectClose = false;
		this.render();
	}
	private renderPanePathbar(side: 'left' | 'right', device: TurboFileDevice | undefined, state: TurboFilePaneState, toolbarAccent: TurboFileIconColor): HTMLElement {
		const pathbar = $('.turbofile-pathbar');
		pathbar.classList.add(`turbofile-pathbar-${toolbarAccent}`);
		if (state.trashMode.active) {
			pathbar.classList.add('turbofile-trash-pathbar');
			pathbar.appendChild(renderIcon(Codicon.trash));
			const label = $('span.turbofile-path-display');
			label.textContent = state.trashMode.browseItem
				? localize('turbofile.recycleBinBrowsePath', "回收站 / {0}{1}", state.trashMode.browseItem.originalName, this.getTrashBrowseRelativePath(state.trashMode))
				: localize('turbofile.recycleBinPath', "{0} 回收站", device ? this.getDeviceDisplayLabel(device) : localize('turbofile.unknownDevice', "未知设备"));
			label.title = label.textContent;
			pathbar.appendChild(label);
			return pathbar;
		}
		pathbar.appendChild(renderTurboFileIcon('geo-alt-fill', toolbarAccent));
		if (device?.id === LOCAL_WINDOWS_DEVICE_ID) {
			const locationButton = $('button.turbofile-location-menu-button') as HTMLButtonElement;
			locationButton.type = 'button';
			locationButton.title = '快速切换 Windows 位置';
			locationButton.setAttribute('aria-haspopup', 'menu');
			locationButton.setAttribute('aria-label', `${this.getSideLabel(side)}快速切换 Windows 位置`);
			locationButton.appendChild(this.renderWindowsLocationIcon(state.path));
			const locationLabel = $('span.turbofile-location-menu-button-label');
			locationLabel.textContent = this.getWindowsLocationLabel(state.path);
			locationButton.appendChild(locationLabel);
			locationButton.appendChild(renderIcon(Codicon.chevronDown));
			locationButton.addEventListener('click', event => this.showWindowsLocationMenu(side, event));
			locationButton.addEventListener('keydown', event => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					this.showWindowsLocationMenu(side, event);
				}
			});
			pathbar.appendChild(locationButton);
		}

		const display = $('span.turbofile-path-display') as HTMLSpanElement;
		display.tabIndex = 0;
		display.title = state.error ? state.error : this.formatPanePathForDisplay(state.path, !!device && this.isWindowsDevice(device));
		this.renderPathDisplayContent(display, side, device, state);
		display.addEventListener('click', event => this.maybeStartPathInlineEdit(event, side, display));
		display.addEventListener('dblclick', event => {
			event.preventDefault();
			this.startPathInlineEdit(side, display);
		});
		display.addEventListener('keydown', event => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.startPathInlineEdit(side, display);
			}
		});
		pathbar.appendChild(display);
		return pathbar;
	}

	private renderWindowsLocationIcon(path: string): HTMLElement {
		const icon = $('span.turbofile-location-icon');
		icon.classList.add(this.getWindowsLocationIconClass(path));
		icon.setAttribute('aria-hidden', 'true');
		return icon;
	}

	private renderPathDisplayContent(display: HTMLElement, side: 'left' | 'right', device: TurboFileDevice | undefined, state: TurboFilePaneState): void {
		clearNode(display);
		if (state.error) {
			display.classList.add('is-error');
			display.textContent = state.error;
			return;
		}

		display.classList.remove('is-error');
		const windowsPath = !!device && this.isWindowsDevice(device);
		const segments = this.getPathSegments(state.path, windowsPath);
		if (!segments.length) {
			const root = $('button.turbofile-path-segment') as HTMLButtonElement;
			root.type = 'button';
			root.textContent = windowsPath ? this.formatPanePathForDisplay(state.path, true) : '根目录';
			root.addEventListener('click', event => {
				event.stopPropagation();
				void this.openPanePath(side, state.path);
			});
			display.appendChild(root);
			return;
		}

		segments.forEach((segment, index) => {
			if (index > 0) {
				const separator = $('span.turbofile-path-separator');
				separator.textContent = windowsPath ? '\\' : '/';
				display.appendChild(separator);
			}
			const button = $('button.turbofile-path-segment') as HTMLButtonElement;
			button.type = 'button';
			button.textContent = segment.label;
			button.title = this.formatPanePathForDisplay(segment.path, windowsPath);
			button.addEventListener('click', event => {
				event.stopPropagation();
				void this.openPanePath(side, segment.path);
			});
			display.appendChild(button);
		});
	}

	private getPathSegments(path: string, windowsPath: boolean): Array<{ label: string; path: string }> {
		if (!path) {
			return [];
		}

		if (!windowsPath) {
			const parts = path.split('/').filter(Boolean);
			const segments: Array<{ label: string; path: string }> = [{ label: '根目录', path: '/' }];
			let current = '';
			for (const part of parts) {
				current = `${current}/${part}`;
				segments.push({ label: part, path: current });
			}
			return segments;
		}

		const normalized = this.formatPanePathForDisplay(path, true);
		const match = /^([A-Za-z]:)(?:\\(.*))?$/.exec(normalized);
		if (!match) {
			return [{ label: normalized, path: normalized }];
		}

		const segments: Array<{ label: string; path: string }> = [{ label: match[1], path: `${match[1]}\\` }];
		const rest = match[2] ?? '';
		let current = `${match[1]}\\`;
		for (const part of rest.split('\\').filter(Boolean)) {
			current = current.endsWith('\\') ? `${current}${part}` : `${current}\\${part}`;
			segments.push({ label: part, path: current });
		}
		return segments;
	}

	private maybeStartPathInlineEdit(event: MouseEvent, side: 'left' | 'right', display: HTMLElement): void {
		const target = event.target as HTMLElement | null;
		if (target?.closest('.turbofile-path-segment, .turbofile-path-separator')) {
			return;
		}
		this.startPathInlineEdit(side, display);
	}

	private startPathInlineEdit(side: 'left' | 'right', display: HTMLElement): void {
		const device = this.getPaneDevice(side);
		const windowsPath = !!device && this.isWindowsDevice(device);
		const currentPath = this.formatPanePathForDisplay(this.paneStates[side].path, windowsPath);
		clearNode(display);
		display.classList.add('is-editing');
		const input = $('input.turbofile-path-inline-editor') as HTMLInputElement;
		input.type = 'text';
		input.value = currentPath;
		input.spellcheck = false;
		display.appendChild(input);
		let committed = false;
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter') {
				event.preventDefault();
				committed = true;
				void this.commitPathInlineEdit(side, input.value);
			} else if (event.key === 'Escape') {
				event.preventDefault();
				committed = true;
				this.render();
			}
		});
		input.addEventListener('blur', () => {
			if (!committed && display.isConnected) {
				this.render();
			}
		});
		getWindow(display).setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}

	private async commitPathInlineEdit(side: 'left' | 'right', rawPath: string): Promise<void> {
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}
		const path = this.normalizePaneInputPath(rawPath, this.isWindowsDevice(device));
		if (!path) {
			this.render();
			return;
		}
		await this.openPanePath(side, path);
	}

	private async openPanePath(side: 'left' | 'right', path: string): Promise<void> {
		await this.refreshPane(side, { path, force: true });
	}

	private async navigatePaneDirectory(side: 'left' | 'right', path: string): Promise<void> {
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}

		const state = this.paneStates[side];
		const requestId = ++this.paneRequestSeq[side];
		const needsAttributes = this.paneSortNeedsAttributes(side);
		const cached = this.getCachedPaneDirectory(device, path);
		state.path = path;
		state.error = undefined;
		state.loading = true;
		this.resetPaneScroll(side);
		this.clearPaneSelection(side);
		// Only take the instant cached path when the cached listing can satisfy the current sort. A
		// names-only listing cannot be shown stably under a size/modified sort.
		if (cached && this.paneDirectoryEntrySatisfiesSort(side, cached)) {
			this.applyPaneDirectoryEntry(side, device, cached);
			state.loading = false;
			this.render();
			this.syncPaneNavigationFrom(side, path);
			return;
		}

		state.items = [];
		try {
			const listing = await this.loadPaneDirectory(device, path, false, 'foreground', needsAttributes);
			if (this.paneRequestSeq[side] !== requestId || this.paneStates[side].path !== path) {
				return;
			}
			this.applyPaneDirectoryEntry(side, device, listing);
			this.syncPaneNavigationFrom(side, path);
		} catch (error) {
			if (this.paneRequestSeq[side] === requestId) {
				const message = error instanceof Error ? error.message : String(error);
				state.error = message;
				this.setDeviceRuntimeStatus(device, 'offline');
				this.statusMessage = `${device.name} 目录刷新失败：${message}`;
			}
		} finally {
			if (this.paneRequestSeq[side] === requestId) {
				state.loading = false;
				this.render();
				if (!state.trashStateKnown) {
					void this.refreshTrashState(side);
				}
			}
		}
	}

	private syncPaneNavigationFrom(side: 'left' | 'right', path: string): void {
		if (!this.shouldSyncPaneNavigation()) {
			return;
		}
		const otherSide = this.getOppositeSide(side);
		const sourceDevice = this.getPaneDevice(side);
		const targetDevice = this.getPaneDevice(otherSide);
		if (!sourceDevice || !targetDevice || this.isWindowsDevice(sourceDevice) !== this.isWindowsDevice(targetDevice) || this.paneStates[otherSide].path === path) {
			return;
		}
		void this.refreshPane(otherSide, { path, force: false, silent: true });
	}

	private renderFileList(side: 'left' | 'right', list: HTMLElement): void {
		const state = this.paneStates[side];
		state.viewportHeight = list.clientHeight || state.viewportHeight || FILE_LIST_DEFAULT_VIEWPORT_HEIGHT;
		this.clampFileListScrollTop(side);
		if (state.error) {
			this.fileListRenderedRange[side] = undefined;
			list.appendChild(this.renderFileRow(side, { name: state.error, size: '', rawSize: 0, modified: '', rawModified: 0, type: 'unknown' }, false));
			return;
		}
		const range = this.getFileListRange(state);
		this.renderFileListSlice(side, list, range);
		list.scrollTop = state.scrollTop;
		this.restoreRenderedFileListScroll(side, list);
		this.scheduleEnrichVisibleRows(side);
	}

	private renderFileListSlice(side: 'left' | 'right', list: HTMLElement, range: TurboFileFileListRange): void {
		const state = this.paneStates[side];
		clearNode(list);
		const visibleItems = this.getVisibleFileItems(state);

		if (range.topSpacerHeight > 0) {
			const topSpacer = $('.turbofile-file-list-spacer');
			topSpacer.style.height = `${range.topSpacerHeight}px`;
			list.appendChild(topSpacer);
		}

		for (const item of visibleItems.slice(range.startIndex, range.endIndex)) {
			list.appendChild(this.renderFileRow(side, item, this.isItemSelected(side, item)));
		}

		if (range.bottomSpacerHeight > 0) {
			const bottomSpacer = $('.turbofile-file-list-spacer');
			bottomSpacer.style.height = `${range.bottomSpacerHeight}px`;
			list.appendChild(bottomSpacer);
		}

		this.fileListRenderedRange[side] = {
			startIndex: range.startIndex,
			endIndex: range.endIndex,
			total: visibleItems.length
		};
		this.prefetchRenderedDirectoryRows(side, visibleItems, range);
	}

	private prefetchRenderedDirectoryRows(side: 'left' | 'right', items: TurboFileFileItem[], range: TurboFileFileListRange): void {
		let prefetched = 0;
		for (const item of items.slice(range.startIndex, range.endIndex + PANE_DIRECTORY_VISIBLE_PREFETCH_LIMIT)) {
			if (!item.path || item.parent || !item.directory || !this.isTrashBrowseNavigationAllowed(side, item.path)) {
				continue;
			}
			this.prefetchPaneDirectory(side, item.path);
			if (++prefetched >= PANE_DIRECTORY_VISIBLE_PREFETCH_LIMIT) {
				return;
			}
		}
	}

	private getFileListRange(state: TurboFilePaneState): TurboFileFileListRange {
		const total = this.getVisibleFileItems(state).length;
		if (!total) {
			return { startIndex: 0, endIndex: 0, topSpacerHeight: 0, bottomSpacerHeight: 0 };
		}

		const rowHeight = this.getFileListRowHeight(state);
		const viewportHeight = state.viewportHeight > 0 ? state.viewportHeight : FILE_LIST_DEFAULT_VIEWPORT_HEIGHT;
		const firstVisibleRow = Math.max(0, Math.floor(state.scrollTop / rowHeight));
		const startIndex = Math.max(0, firstVisibleRow - FILE_LIST_OVERSCAN_ROWS);
		const visibleRows = Math.ceil(viewportHeight / rowHeight) + FILE_LIST_OVERSCAN_ROWS * 2;
		const endIndex = Math.min(total, startIndex + visibleRows);
		return {
			startIndex,
			endIndex,
			topSpacerHeight: startIndex * rowHeight,
			bottomSpacerHeight: Math.max(0, (total - endIndex) * rowHeight)
		};
	}

	private getFileListRowHeight(_state: TurboFilePaneState): number {
		return FILE_LIST_ROW_HEIGHT;
	}

	private clampFileListScrollTop(side: 'left' | 'right'): void {
		const state = this.paneStates[side];
		const viewportHeight = state.viewportHeight > 0 ? state.viewportHeight : FILE_LIST_DEFAULT_VIEWPORT_HEIGHT;
		const totalHeight = this.getVisibleFileItems(state).length * this.getFileListRowHeight(state);
		const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
		const nextScrollTop = Math.max(0, Math.min(state.scrollTop, maxScrollTop));
		if (nextScrollTop === state.scrollTop) {
			return;
		}
		state.scrollTop = nextScrollTop;
		this.fileListRenderedRange[side] = undefined;
	}

	private getVisibleFileItems(state: TurboFilePaneState): TurboFileFileItem[] {
		return state.items;
	}

	private sortPaneItems(side: 'left' | 'right', items: readonly TurboFileFileItem[]): TurboFileFileItem[] {
		const state = this.paneStates[side];
		return sortTurboFileItems(items, state.sortKey, state.sortDirection);
	}

	/**
	 * Sorting by size or modified time needs the per-file attributes a fast names-only listing
	 * does not carry. When the active sort needs them we must load the full listing up front so the
	 * directory opens already in the correct, stable order — otherwise the names-only listing renders
	 * in name order first and then visibly re-sorts as {@link enrichVisibleRows} fills in sizes.
	 */
	private paneSortNeedsAttributes(side: 'left' | 'right'): boolean {
		return turboFileSortNeedsAttributes(this.paneStates[side].sortKey);
	}

	private cachedListingHasAttributes(entry: TurboFileDirectoryCacheEntry): boolean {
		return isTurboFileListingReadyForSort(entry.items, 'modified');
	}

	private paneListingSatisfiesSort(side: 'left' | 'right', items: readonly TurboFileFileItem[]): boolean {
		return isTurboFileListingReadyForSort(items, this.paneStates[side].sortKey);
	}

	private paneDirectoryEntrySatisfiesSort(side: 'left' | 'right', entry: TurboFileDirectoryCacheEntry): boolean {
		return this.paneListingSatisfiesSort(side, entry.items);
	}

	private resortPaneItems(side: 'left' | 'right'): void {
		const state = this.paneStates[side];
		state.items = this.sortPaneItems(side, state.items);
		this.fileListRenderedRange[side] = undefined;
		this.rememberPaneDeviceSnapshot(side);
		this.render();
	}

	private getPaneSortLabel(key: TurboFileSortKey): string {
		return PANE_SORT_OPTIONS.find(option => option.key === key)?.label ?? '名称';
	}

	private getPaneSortDirectionLabel(direction: TurboFileSortDirection): string {
		return PANE_SORT_DIRECTION_OPTIONS.find(option => option.direction === direction)?.label ?? '递增';
	}

	private handleFileListScroll(side: 'left' | 'right', list: HTMLElement): void {
		const state = this.paneStates[side];
		state.scrollTop = list.scrollTop;
		state.viewportHeight = list.clientHeight || state.viewportHeight;
		if (this.fileListScrollRaf[side] || !this.container) {
			return;
		}

		this.fileListScrollRaf[side] = getWindow(this.container).requestAnimationFrame(() => {
			this.fileListScrollRaf[side] = 0;
			const currentList = this.container?.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`);
			if (!currentList || currentList !== list || state.error) {
				return;
			}
			this.updateFileListVirtualSlice(side, currentList);
		});
	}

	private updateFileListVirtualSlice(side: 'left' | 'right', list: HTMLElement): void {
		const state = this.paneStates[side];
		const range = this.getFileListRange(state);
		const rendered = this.fileListRenderedRange[side];
		if (rendered && rendered.startIndex === range.startIndex && rendered.endIndex === range.endIndex && rendered.total === this.getVisibleFileItems(state).length) {
			return;
		}

		const scrollTop = list.scrollTop;
		this.renderFileListSlice(side, list, range);
		list.scrollTop = scrollTop;
		this.scheduleEnrichVisibleRows(side);
	}

	/**
	 * Re-renders just the visible slice on the existing file-list element (preserving the scroll
	 * container and its scrollTop), so an in-place data update — e.g. lazily filled size/date — never
	 * goes through the heavy full render that would interrupt an active scrollbar drag.
	 */
	private rerenderFileListSliceInPlace(side: 'left' | 'right'): void {
		if (this.activePage !== 'transfer' || this.isTaskLogVisible) {
			return;
		}
		const list = this.container?.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`);
		if (!list) {
			return;
		}
		const state = this.paneStates[side];
		if (state.loading || state.error) {
			return;
		}
		const scrollTop = list.scrollTop;
		this.renderFileListSlice(side, list, this.getFileListRange(state));
		list.scrollTop = scrollTop;
	}

	/**
	 * Kicks off lazy size/date enrichment for the rows currently in view after a names-only listing.
	 * Serialized per side; if more rows scroll in while a batch is running, it re-runs once.
	 */
	private scheduleEnrichVisibleRows(side: 'left' | 'right'): void {
		if (this.paneSortNeedsAttributes(side)) {
			return;
		}
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}
		if (!this.paneStates[side].items.some(item => item.attrsPending)) {
			return;
		}
		if (this.attrsEnrichInFlight[side]) {
			this.attrsEnrichAgain[side] = true;
			return;
		}
		void this.enrichVisibleRows(side);
	}

	private async enrichVisibleRows(side: 'left' | 'right'): Promise<void> {
		if (this.paneSortNeedsAttributes(side)) {
			return;
		}
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}
		const state = this.paneStates[side];
		const path = state.path;
		const range = this.getFileListRange(state);
		const pending = this.getVisibleFileItems(state)
			.slice(range.startIndex, range.endIndex)
			.filter(item => item.attrsPending && !!item.path && !item.parent);
		if (!pending.length) {
			return;
		}

		this.attrsEnrichInFlight[side] = true;
		try {
			const names = pending.map(item => item.name);
			const stats = device.id === LOCAL_WINDOWS_DEVICE_ID
				? await this.sshService.statLocalEntries(path, names)
				: await this.sshService.statRemoteEntries(await this.getSshConnectionOptions(device), path, names);
			if (this.paneStates[side].path !== path || this.getPaneDevice(side)?.id !== device.id || this.paneSortNeedsAttributes(side)) {
				return;
			}
			const byName = new Map(stats.map(stat => [stat.name, stat]));
			let changed = false;
			for (const item of pending) {
				const stat = byName.get(item.name);
				if (!stat) {
					continue;
				}
				item.rawSize = stat.size;
				item.size = item.directory ? '' : formatSize(stat.size);
				item.rawModified = stat.modified;
				item.modified = stat.modified > 0 ? formatDate(stat.modified) : '';
				item.attrsPending = false;
				changed = true;
			}
			if (changed) {
				// Progress was made: give the directory a fresh retry budget for any rows still pending.
				this.attrsEnrichRetryState[side] = undefined;
				// Update only the visible rows in place — never this.render(). A full render rebuilds the
				// scroll-container element, which mid-drag destroys the element the browser is tracking and
				// drops the scrollbar drag (the thumb jumps back and you must re-grab). Re-rendering just
				// the slice on the existing list element keeps scrollTop/scrollHeight and the drag intact.
				this.rerenderFileListSliceInPlace(side);
			}
		} catch {
			// Enrichment is best-effort; a transient failure is retried below instead of leaving the rows blank.
		} finally {
			this.attrsEnrichInFlight[side] = false;
			if (this.attrsEnrichAgain[side]) {
				this.attrsEnrichAgain[side] = false;
				this.scheduleEnrichVisibleRows(side);
			} else {
				// If any visible row is still missing size/date (a failed or partial stat), retry with
				// backoff so the columns reliably fill in rather than staying blank.
				this.scheduleEnrichRetryIfNeeded(side, path);
			}
		}
	}

	private scheduleEnrichRetryIfNeeded(side: 'left' | 'right', path: string): void {
		const state = this.paneStates[side];
		const device = this.getPaneDevice(side);
		if (state.path !== path || !device) {
			this.attrsEnrichRetryState[side] = undefined;
			return;
		}
		const range = this.getFileListRange(state);
		const stillPending = this.getVisibleFileItems(state)
			.slice(range.startIndex, range.endIndex)
			.some(item => item.attrsPending && !!item.path && !item.parent);
		if (!stillPending) {
			this.attrsEnrichRetryState[side] = undefined;
			return;
		}
		const current = this.attrsEnrichRetryState[side];
		const count = current && current.path === path ? current.count : 0;
		if (count >= REMOTE_ENRICH_MAX_RETRIES) {
			// Give up after a few attempts: the remote likely cannot stat these entries at all.
			return;
		}
		this.attrsEnrichRetryState[side] = { path, count: count + 1 };
		const delay = REMOTE_ENRICH_RETRY_BASE_MS * Math.pow(2, Math.min(count, 4));
		const targetWindow = getWindow(this.container);
		if (this.attrsEnrichRetryHandle[side] !== undefined) {
			targetWindow.clearTimeout(this.attrsEnrichRetryHandle[side]);
		}
		this.attrsEnrichRetryHandle[side] = targetWindow.setTimeout(() => {
			this.attrsEnrichRetryHandle[side] = undefined;
			if (this.paneStates[side].path === path) {
				this.scheduleEnrichVisibleRows(side);
			}
		}, delay);
	}

	private resetPaneScroll(side: 'left' | 'right'): void {
		const state = this.paneStates[side];
		state.scrollTop = 0;
		state.viewportHeight = 0;
		this.fileListRenderedRange[side] = undefined;
		this.clearFileListScrollRaf(side);
		this.clearFileListRestoreRaf(side);
	}

	private clearFileListScrollRaf(side: 'left' | 'right'): void {
		if (!this.fileListScrollRaf[side] || !this.container) {
			this.fileListScrollRaf[side] = 0;
			return;
		}
		getWindow(this.container).cancelAnimationFrame(this.fileListScrollRaf[side]);
		this.fileListScrollRaf[side] = 0;
	}

	private restoreRenderedFileListScroll(side: 'left' | 'right', list: HTMLElement): void {
		if (!this.container) {
			return;
		}
		this.clearFileListRestoreRaf(side);
		this.fileListRestoreRaf[side] = getWindow(this.container).requestAnimationFrame(() => {
			this.fileListRestoreRaf[side] = 0;
			const currentList = this.container?.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`);
			if (!currentList || currentList !== list || !list.isConnected) {
				return;
			}

			const state = this.paneStates[side];
			state.viewportHeight = list.clientHeight || state.viewportHeight || FILE_LIST_DEFAULT_VIEWPORT_HEIGHT;
			this.clampFileListScrollTop(side);
			if (list.scrollTop !== state.scrollTop) {
				list.scrollTop = state.scrollTop;
			}

			state.scrollTop = list.scrollTop;
			const range = this.getFileListRange(state);
			const rendered = this.fileListRenderedRange[side];
			if (!rendered || rendered.startIndex !== range.startIndex || rendered.endIndex !== range.endIndex || rendered.total !== this.getVisibleFileItems(state).length) {
				this.renderFileListSlice(side, list, range);
				list.scrollTop = state.scrollTop;
			}
		});
	}

	private clearFileListRestoreRaf(side: 'left' | 'right'): void {
		if (!this.fileListRestoreRaf[side] || !this.container) {
			this.fileListRestoreRaf[side] = 0;
			return;
		}
		getWindow(this.container).cancelAnimationFrame(this.fileListRestoreRaf[side]);
		this.fileListRestoreRaf[side] = 0;
	}

	private renderFileRow(side: 'left' | 'right', item: TurboFileFileItem, selected: boolean): HTMLElement {
		const row = $('.turbofile-file-row');
		const renaming = this.isInlineRenameTarget(side, item);
		if (item.path) {
			row.dataset.turbofilePath = item.path;
		}
		if (selected || renaming) {
			row.classList.add('is-selected');
		}
		if (renaming) {
			row.classList.add('is-renaming');
		}
		row.classList.add('is-clickable');
		if (item.path && !item.parent && !renaming) {
			row.draggable = true;
			row.addEventListener('dragstart', event => {
				this.beginFileRowDrag(side, item, event);
			});
			row.addEventListener('drag', event => this.maybeHandoffFileDragSessionToWindows(event));
			row.addEventListener('dragend', () => this.clearCurrentFileDragState());
		}
		row.addEventListener('click', event => {
			this.setActiveFilePaneSide(side);
			if (renaming && (event.target as HTMLElement | null)?.closest('.turbofile-inline-rename')) {
				return;
			}
			if (event.detail > 1) {
				return;
			}
			this.container?.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`)?.focus({ preventScroll: true });
			this.selectItem(side, item, event, false);
			this.updateRenderedSelection(side);
		});
		if ((item.directory || item.parent) && item.path && this.isTrashBrowseNavigationAllowed(side, item.path)) {
			row.addEventListener('pointerenter', () => this.prefetchPaneDirectory(side, item.path, 'hover'));
			row.addEventListener('pointerdown', event => {
				this.prefetchPaneDirectory(side, item.path, 'commit');
				this.maybeOpenPaneDirectoryOnFastDoubleClick(side, item, event, renaming);
			});
			// Drop a same-pane selection onto a folder row (or the ".." row) to move those items
			// into that directory, like Windows Explorer / TurboFile-web.
			const dropTargetPath = item.path;
			row.addEventListener('dragover', event => {
				const session = this.nativeDragSession;
				if (session?.sourceSide !== side || !this.canMoveSelectionIntoDirectory(side, item, dropTargetPath, session.items)) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = 'move';
				}
				row.classList.add('is-internal-drop-target');
			});
			row.addEventListener('dragleave', event => {
				const relatedTarget = event.relatedTarget;
				if (relatedTarget instanceof Node && row.contains(relatedTarget)) {
					return;
				}
				row.classList.remove('is-internal-drop-target');
			});
			row.addEventListener('drop', event => {
				const session = this.nativeDragSession;
				if (session?.sourceSide !== side || !this.canMoveSelectionIntoDirectory(side, item, dropTargetPath, session.items)) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				row.classList.remove('is-internal-drop-target');
				const targetLabel = item.parent ? '上一级目录' : item.name;
				this.recordNativeInternalDrop({ kind: 'directory', side, path: dropTargetPath, label: targetLabel, initiatedAt: Date.now() });
			});
		}
		row.addEventListener('dblclick', () => {
			if (renaming) {
				return;
			}
			if ((item.directory || item.parent) && this.consumeSuppressedNativeDirectoryDoubleClick(side, item.path)) {
				return;
			}
			void this.openItem(side, item);
		});
		row.addEventListener('contextmenu', event => {
			this.setActiveFilePaneSide(side);
			this.showFileContextMenu(side, item, event);
		});

		const name = $('.turbofile-file-name');
		if (renaming) {
			name.classList.add('is-renaming');
			this.renderInlineRenameInput(side, item, name);
		} else {
			name.appendChild(this.renderFileBrowserIcon(item));
			name.append(item.name);
			name.title = item.name;
		}

		const metadataColumns: string[] = [];
		row.appendChild(name);
		if (this.shouldShowFileSize()) {
			const size = $('.turbofile-file-meta');
			size.textContent = item.size;
			row.appendChild(size);
			metadataColumns.push('92px');
		}
		if (this.shouldShowFileModified()) {
			const modified = $('.turbofile-file-meta');
			modified.textContent = item.modified;
			row.appendChild(modified);
			metadataColumns.push('136px');
		}
		if (this.shouldShowFileType()) {
			const type = $('.turbofile-file-meta');
			type.textContent = this.getFileTypeDisplayLabel(item);
			row.appendChild(type);
			metadataColumns.push('92px');
		}
		row.style.gridTemplateColumns = ['minmax(120px, 1fr)', ...metadataColumns].join(' ');
		return row;
	}

	private getFileTypeDisplayLabel(item: TurboFileFileItem): string {
		if (item.parent || item.directory || item.type === 'directory') {
			return localize('turbofile.directoryType', "文件夹");
		}
		const extension = /\.([^./\\]+)$/.exec(item.name)?.[1];
		return extension ? extension.toUpperCase() : localize('turbofile.fileType', "文件");
	}

	private maybeOpenPaneDirectoryOnFastDoubleClick(side: 'left' | 'right', item: TurboFileFileItem, event: PointerEvent, renaming: boolean): void {
		if (renaming || event.button !== 0 || !item.path || (!item.directory && !item.parent)) {
			return;
		}

		const state = this.paneDoubleClickState[side];
		const now = Date.now();
		const isDoubleClick = state.lastPath === item.path && now - state.lastAt <= PANE_FAST_DOUBLE_CLICK_MS;
		state.lastPath = item.path;
		state.lastAt = now;
		if (!isDoubleClick) {
			return;
		}

		state.suppressNativePath = item.path;
		void this.openItem(side, item);
	}

	private consumeSuppressedNativeDirectoryDoubleClick(side: 'left' | 'right', path: string | undefined): boolean {
		if (!path) {
			return false;
		}
		const state = this.paneDoubleClickState[side];
		if (state.suppressNativePath !== path) {
			return false;
		}
		state.suppressNativePath = undefined;
		return true;
	}

	private renderInlineRenameInput(side: 'left' | 'right', item: TurboFileFileItem, container: HTMLElement): void {
		let icon = this.renderFileBrowserIcon(item);
		container.appendChild(icon);

		const inputHost = $('span.turbofile-inline-rename');
		container.appendChild(inputHost);

		const editor = $('.turbofile-inline-rename-editor');
		editor.contentEditable = 'plaintext-only';
		editor.spellcheck = false;
		editor.setAttribute('role', 'textbox');
		editor.setAttribute('aria-label', '输入文件名。按 Enter 确认或 Escape 取消。');
		editor.textContent = item.name;
		inputHost.appendChild(editor);

		const disposables = new DisposableStore();
		this.renderDisposables.add(disposables);

		let currentSelectionState: 'prefix' | 'all' | 'suffix' = 'prefix';
		let finished = false;
		const getValue = () => (editor.textContent ?? '').replace(/[\r\n]/g, '');
		const setValue = (value: string) => {
			editor.textContent = value;
		};
		const ensureSingleTextNode = (): Text => {
			const value = getValue();
			if (editor.childNodes.length !== 1 || editor.firstChild?.nodeType !== Node.TEXT_NODE) {
				editor.textContent = value;
			}
			if (!editor.firstChild) {
				editor.appendChild(editor.ownerDocument.createTextNode(''));
			}
			return editor.firstChild as Text;
		};
		const selectRange = (start: number, end: number) => {
			const textNode = ensureSingleTextNode();
			const length = textNode.data.length;
			const range = editor.ownerDocument.createRange();
			range.setStart(textNode, Math.max(0, Math.min(start, length)));
			range.setEnd(textNode, Math.max(0, Math.min(end, length)));
			const selection = editor.ownerDocument.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
		};
		const updateValidationState = (): string | undefined => {
			const message = this.validateRenameName(side, item, getValue());
			editor.classList.toggle('is-invalid', !!message);
			editor.toggleAttribute('aria-invalid', !!message);
			editor.title = message ?? '';
			return message;
		};
		const updatePreviewState = () => {
			const value = getValue();
			if (editor.textContent !== value) {
				setValue(value);
				selectRange(value.length, value.length);
			}
			const targetName = value || ' ';
			const targetPath = item.path ? joinPanePath(this.paneStates[side].path, targetName, this.isWindowsDevice(this.getPaneDevice(side) ?? this.localWindowsDevice)) : undefined;
			const nextIcon = this.renderFileBrowserIcon({ ...item, name: targetName, path: targetPath });
			icon.replaceWith(nextIcon);
			icon = nextIcon;
			updateValidationState();
		};
		const selectByState = () => {
			editor.focus();
			const value = getValue();
			const dotIndex = value.lastIndexOf('.');
			if (item.directory || dotIndex <= 0) {
				selectRange(0, value.length);
				return;
			}
			if (currentSelectionState === 'prefix') {
				selectRange(0, dotIndex);
			} else if (currentSelectionState === 'all') {
				selectRange(0, value.length);
			} else {
				selectRange(dotIndex + 1, value.length);
			}
		};

		const finish = (success: boolean) => {
			if (finished) {
				return;
			}
			finished = true;
			const nextName = getValue();
			disposables.dispose();
			if (!this.isInlineRenameTarget(side, item)) {
				return;
			}
			this.inlineRename = undefined;
			this.render();
			if (success && nextName.trim() && nextName !== item.name && !this.validateRenameName(side, item, nextName)) {
				void this.performRename(side, item, nextName);
			}
		};

		updateValidationState();

		const handleInput = () => updatePreviewState();
		editor.addEventListener('input', handleInput);
		disposables.add({ dispose: () => editor.removeEventListener('input', handleInput) });

		const handleKeydown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && !event.altKey) {
				const key = event.key.toLowerCase();
				if (key === 'a' || key === 'c' || key === 'v' || key === 'x' || key === 'y' || key === 'z') {
					event.stopPropagation();
					return;
				}
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				event.stopPropagation();
				if (!updateValidationState()) {
					finish(true);
				}
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				finish(false);
				return;
			}
			if (event.key === 'F2') {
				event.preventDefault();
				event.stopPropagation();
				if (currentSelectionState === 'prefix') {
					currentSelectionState = 'all';
				} else if (currentSelectionState === 'all') {
					currentSelectionState = 'suffix';
				} else {
					currentSelectionState = 'prefix';
				}
				selectByState();
			}
		};
		editor.addEventListener('keydown', handleKeydown);
		disposables.add({ dispose: () => editor.removeEventListener('keydown', handleKeydown) });

		const handleBeforeInput = (event: InputEvent) => {
			if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
				event.preventDefault();
			}
		};
		editor.addEventListener('beforeinput', handleBeforeInput);
		disposables.add({ dispose: () => editor.removeEventListener('beforeinput', handleBeforeInput) });

		const stopClipboardEventPropagation = (event: ClipboardEvent) => {
			event.stopPropagation();
			if (event.type === 'paste') {
				const text = event.clipboardData?.getData('text/plain')?.replace(/[\r\n]/g, '') ?? '';
				if (text) {
					event.preventDefault();
					editor.ownerDocument.execCommand('insertText', false, text);
					updatePreviewState();
				}
			}
		};
		for (const eventType of ['copy', 'cut', 'paste'] as const) {
			editor.addEventListener(eventType, stopClipboardEventPropagation);
			disposables.add({ dispose: () => editor.removeEventListener(eventType, stopClipboardEventPropagation) });
		}

		const handleBlur = () => {
			const window = getWindow(editor);
			window.setTimeout(() => {
				if (finished || window.document.activeElement === editor) {
					return;
				}
				finish(!updateValidationState());
			}, 0);
		};
		editor.addEventListener('blur', handleBlur);
		disposables.add({ dispose: () => editor.removeEventListener('blur', handleBlur) });

		const window = getWindow(inputHost);
		const frame = window.requestAnimationFrame(() => {
			if (!finished && this.isInlineRenameTarget(side, item)) {
				editor.focus();
				currentSelectionState = 'prefix';
				selectByState();
			}
		});
		disposables.add({ dispose: () => window.cancelAnimationFrame(frame) });
	}

	private renderTaskbar(): HTMLElement {
		const taskbar = $('.turbofile-taskbar');
		const runningTransfers = this.tasks.filter(task => task.kind === 'transfer' && task.status === 'running');
		const runningTasks = this.tasks.filter(task => task.status === 'running');
		const latest = this.tasks[0];
		const stats = this.getTaskStats();
		if (runningTransfers.length) {
			taskbar.classList.add('has-live-transfer');
		}

		taskbar.tabIndex = 0;
		taskbar.setAttribute('role', 'button');
		taskbar.title = '打开任务日志';
		taskbar.setAttribute('aria-label', '打开任务日志');
		taskbar.addEventListener('click', () => this.setActivePage('tasks'));
		taskbar.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				this.setActivePage('tasks');
			}
		});

		const progress = $('.turbofile-statusbar-progress');
		const progressValue = $('.turbofile-statusbar-progress-value');
		const liveSummary = runningTransfers.length ? this.getLiveTransferDisplay(runningTransfers) : undefined;
		const livePercent = liveSummary && liveSummary.totalBytes !== undefined && liveSummary.totalBytes > 0
			? Math.max(0, Math.min(100, (liveSummary.transferredBytes / liveSummary.totalBytes) * 100))
			: runningTasks.length ? Math.max(...runningTasks.map(task => task.progress)) : 0;
		progressValue.style.width = runningTasks.length ? `${livePercent.toFixed(1)}%` : '0%';
		progress.classList.toggle('is-running', runningTasks.length > 0);
		progress.appendChild(progressValue);
		taskbar.appendChild(progress);

		const content = $('.turbofile-statusbar-content');
		const left = $('.turbofile-statusbar-section.is-left');
		left.appendChild(this.renderStatusbarItem(Codicon.history, `运行 ${stats.running} · 成功 ${stats.success} · 失败 ${stats.error} · 取消 ${stats.canceled}`));

		const message = $('.turbofile-statusbar-message');
		const title = $('.turbofile-statusbar-message-title');
		const meta = $('.turbofile-task-meta.turbofile-statusbar-message-detail');
		if (runningTransfers.length) {
			title.textContent = this.getLiveTransferStatusTitle(runningTransfers);
			meta.textContent = '';
		} else if (latest) {
			title.textContent = this.formatTaskLine(latest);
			meta.textContent = '';
		} else {
			title.textContent = this.statusMessage;
			meta.textContent = '暂无传输任务，最近日志会显示在这里。';
		}
		message.appendChild(title);
		if (meta.textContent) {
			message.appendChild(meta);
		}

		const right = $('.turbofile-statusbar-section.is-right');
		if (runningTransfers.length && liveSummary) {
			const transferSizeText = liveSummary.totalBytes !== undefined
				? `${formatSize(liveSummary.transferredBytes)} / ${formatSize(liveSummary.totalBytes)}`
				: formatSize(liveSummary.transferredBytes);
			const time = this.getTransferTimeDisplay(liveSummary);
			right.appendChild(this.renderStatusbarItem(Codicon.arrowSwap, this.formatSpeed(liveSummary.speedBytesPerSecond), '当前速度'));
			right.appendChild(this.renderStatusbarItem(Codicon.clock, time.text, time.title));
			right.appendChild(this.renderStatusbarItem(Codicon.archive, transferSizeText, '已传输'));
			const protocol = runningTransfers.length === 1 ? this.getTransferProtocolLabel(runningTransfers[0].strategy) : undefined;
			if (protocol) {
				right.appendChild(this.renderStatusbarItem(Codicon.terminal, protocol, this.getTransferProtocolTooltip(runningTransfers[0])));
			}
			const cancel = this.createIconButton(Codicon.close, '取消运行中的传输', 'turbofile-statusbar-cancel');
			cancel.element.disabled = runningTransfers.every(task => task.cancelRequested);
			cancel.element.addEventListener('click', event => {
				event.stopPropagation();
				void this.cancelRunningTransfers(runningTransfers);
			});
			right.appendChild(cancel.element);
		} else if (latest) {
			right.appendChild(this.renderStatusbarItem(this.getTaskIcon(latest), latest.status === 'running' ? '进行中' : latest.status === 'success' ? '完成' : latest.status === 'canceled' ? '已取消' : '失败'));
		} else {
			right.appendChild(this.renderStatusbarItem(Codicon.info, '任务日志'));
		}

		content.appendChild(left);
		content.appendChild(message);
		content.appendChild(right);
		taskbar.appendChild(content);
		return taskbar;
	}

	private refreshTaskbar(): void {
		if (!this.container || this.activePage !== 'transfer' || !this.shouldShowTaskbar()) {
			return;
		}
		const current = this.container.querySelector<HTMLElement>('.turbofile-taskbar');
		if (!current) {
			const transferPage = this.container.querySelector<HTMLElement>('.turbofile-transfer-page');
			transferPage?.appendChild(this.renderTaskbar());
			return;
		}
		current.replaceWith(this.renderTaskbar());
	}

	private refreshTaskbarMetrics(): void {
		if (!this.container || this.activePage !== 'transfer' || !this.shouldShowTaskbar()) {
			return;
		}
		const runningTransfers = this.tasks.filter(task => task.kind === 'transfer' && task.status === 'running');
		const runningTasks = this.tasks.filter(task => task.status === 'running');
		const taskbar = this.container.querySelector<HTMLElement>('.turbofile-taskbar');
		if (!taskbar || !runningTransfers.length) {
			return;
		}
		const summary = this.getLiveTransferDisplay(runningTransfers);
		const progressValue = taskbar.querySelector<HTMLElement>('.turbofile-statusbar-progress-value');
		if (progressValue) {
			const percent = summary.totalBytes !== undefined && summary.totalBytes > 0
				? Math.max(0, Math.min(100, (summary.transferredBytes / summary.totalBytes) * 100))
				: runningTasks.length ? Math.max(...runningTasks.map(task => task.progress)) : 0;
			progressValue.style.width = `${percent.toFixed(1)}%`;
		}
		const title = taskbar.querySelector<HTMLElement>('.turbofile-statusbar-message-title');
		if (title) {
			title.textContent = this.getLiveTransferStatusTitle(runningTransfers);
		}
		const rightValues = taskbar.querySelectorAll<HTMLElement>('.turbofile-statusbar-section.is-right .turbofile-statusbar-item-value');
		if (rightValues[0]) {
			rightValues[0].textContent = this.formatSpeed(summary.speedBytesPerSecond);
		}
		if (rightValues[1]) {
			const time = this.getTransferTimeDisplay(summary);
			if (rightValues[1].textContent !== time.text) {
				rightValues[1].textContent = time.text;
			}
			rightValues[1].parentElement?.setAttribute('title', time.title);
		}
		if (rightValues[2]) {
			rightValues[2].textContent = summary.totalBytes !== undefined
				? `${formatSize(summary.transferredBytes)} / ${formatSize(summary.totalBytes)}`
				: formatSize(summary.transferredBytes);
		}
	}

	private refreshTaskLogMetrics(): void {
		if (!this.container || (this.activePage !== 'tasks' && !this.isTaskLogVisible)) {
			return;
		}
		const tasksById = new Map(this.tasks.map(task => [String(task.id), task]));
		for (const row of this.container.querySelectorAll<HTMLElement>('.turbofile-task-row[data-task-id]')) {
			const task = tasksById.get(row.dataset.taskId ?? '');
			if (task) {
				const metrics = row.querySelector<HTMLElement>('.turbofile-task-row-metrics');
				if (metrics) {
					metrics.textContent = this.getTaskMetrics(task);
				}
			}
		}
	}

	/** Keep terminal visibility available for transfer-page terminal layout and focus state. */
	private isTerminalPanelVisibleForCurrentPage(): boolean {
		if (this.taskbarHiddenForTerminal) {
			return true;
		}
		const pageInstanceId = this.currentInput?.instanceId;
		if (!pageInstanceId || !this.container) {
			return false;
		}
		if (this.getBoundTerminalsForPage(pageInstanceId).length === 0) {
			return false;
		}
		return this.layoutService.isVisible(Parts.PANEL_PART, getWindow(this.container));
	}

	private renderStatusbarItem(icon: ThemeIcon, text: string, title?: string): HTMLElement {
		const item = $('.turbofile-statusbar-item');
		if (title) {
			item.title = title;
		}
		item.appendChild(renderIcon(icon));
		const label = $('span.turbofile-statusbar-item-value');
		label.textContent = text;
		item.appendChild(label);
		return item;
	}

	private getLiveTransferStatusTitle(tasks: TurboFileTask[]): string {
		const quiet = tasks.some(task => isTurboFileTransferProgressQuiet(task.lastProgressAt ?? task.startedAt, Date.now()));
		const prefix = quiet ? localize('turbofile.awaitingProgress', "等待进度反馈（任务未结束）") : '正在传输';
		let itemCount = 0;
		let firstName: string | undefined;
		let runningName: string | undefined;
		let waitingName: string | undefined;
		for (const task of tasks) {
			const taskItems = task.transferItems;
			const taskItemCount = taskItems?.length ?? 0;
			itemCount += taskItemCount || 1;
			const activeItem = taskItemCount > 0
				? taskItems?.[task.activeTransferItemIndex ?? 0]
				: undefined;
			const fallbackName = activeItem?.name ?? task.label.replace(/^复制\s+/, '');
			const name = task.activeTransferItemIndex !== undefined ? fallbackName : task.currentTransferName ?? fallbackName;
			const status = activeItem?.status ?? task.status;
			firstName ??= name;
			if (status === 'running') {
				runningName ??= name;
			} else if (status === 'waiting') {
				waitingName ??= name;
			}
		}
		const activeName = runningName ?? waitingName ?? firstName;
		if (!activeName) {
			return tasks.length > 1 ? `正在传输 ${tasks.length} 个任务` : tasks[0]?.label ?? '正在传输';
		}
		return itemCount > 1 ? `${prefix}：${activeName} · ${itemCount} 项` : `${prefix}：${activeName}`;
	}

	private getLiveTransferAggregate(tasks: TurboFileTask[]): { transferredBytes: number; totalBytes?: number; speedBytesPerSecond: number; remainingMs?: number; startedAt?: number } {
		return aggregateTurboFileTransferProgress(tasks, Date.now());
	}

	private getLiveTransferDisplay(tasks: TurboFileTask[]) {
		return this.transferMetricsDisplay.read(tasks.map(task => task.id).join(','), this.getLiveTransferAggregate(tasks), Date.now());
	}

	private getLiveTransferItemTotal(item: TurboFileTaskTransferItem, task: TurboFileTask): number | undefined {
		return resolveTurboFileVisibleTotalBytes({
			trackTotalBytes: task.trackTotalBytes,
			listedTotalBytes: item.totalBytes ?? (task.trackTotalBytes ? item.rawSize : undefined),
			reportedTotalBytes: item.totalBytes
		});
	}

	private formatSpeed(bytesPerSecond: number | undefined): string {
		return `${formatTransferRate(Math.max(0, bytesPerSecond ?? 0))}/s`;
	}

	private getTransferTimeDisplay(summary: { time: { milliseconds: number | undefined; remaining: boolean } }): { text: string; title: string } {
		const time = summary.time;
		return {
			text: time.milliseconds === undefined ? '--' : formatDuration(time.milliseconds),
			title: time.remaining ? localize('turbofile.remainingTime', "剩余时间") : localize('turbofile.elapsedTime', "已耗时")
		};
	}

	private async cancelRunningTransfers(tasks: readonly TurboFileTask[]): Promise<void> {
		await Promise.allSettled(tasks.map(task => this.cancelTask(task)));
	}

	private getRunningTaskCount(): number {
		return this.tasks.filter(task => task.status === 'running').length;
	}

	private updateInputRunningTaskCount(): void {
		this.currentInput?.setRunningTaskCount(this.getRunningTaskCount());
	}

	private async cancelRunningTasksForClose(): Promise<void> {
		const runningTasks = this.tasks.filter(task => task.status === 'running');
		await this.cancelRunningTransfers(runningTasks);
		const failedCancellations = runningTasks.filter(task => task.status === 'running' && !task.cancelRequested);
		if (failedCancellations.length) {
			this.updateInputRunningTaskCount();
			throw new Error(failedCancellations.map(task => localize('turbofile.closeTaskCancellationError', "{0}: {1}", task.label, task.error ?? task.detail)).join('\n'));
		}
		for (const task of runningTasks) {
			if (task.status === 'running') {
				this.finishTask(task, 'canceled', `已取消任务：${task.label}`);
			}
		}
		this.updateInputRunningTaskCount();
	}

	private renderTaskLogOverlay(): HTMLElement {
		const overlay = $('.turbofile-task-log-overlay');
		const panel = $('.turbofile-task-log-panel');
		const header = $('.turbofile-task-log-header');
		const title = $('h2');
		title.textContent = '任务日志';
		const close = this.createIconButton(Codicon.close, '关闭任务日志', 'turbofile-toolbar-button');
		this.renderDisposables.add(close);
		close.element.addEventListener('click', () => {
			this.isTaskLogVisible = false;
			this.render();
		});
		header.appendChild(title);
		header.appendChild(close.element);

		panel.appendChild(header);
		panel.appendChild(this.createJournalView(true));
		overlay.appendChild(panel);
		overlay.addEventListener('click', event => {
			if (event.target === overlay) {
				this.isTaskLogVisible = false;
				this.render();
			}
		});
		return overlay;
	}

	private clearFinishedTasks(): void {
		for (let i = this.tasks.length - 1; i >= 0; i--) {
			if (this.tasks[i].status !== 'running') {
				this.tasks.splice(i, 1);
			}
		}
		this.statusMessage = '已清空完成的任务。';
		this.render();
	}

	private renderTaskRow(task: TurboFileTask): HTMLElement {
		const row = $('.turbofile-task-row');
		row.dataset.taskId = String(task.id);
		row.classList.add(`is-${task.status}`);

		const name = $('.turbofile-task-row-name');
		name.appendChild(renderIcon(this.getTaskIcon(task)));
		name.append(task.label);

		const detail = $('.turbofile-task-row-detail');
		const fallbackDetail = this.getTransferFallbackDetail(task);
		detail.textContent = fallbackDetail ? `${task.detail}\n${fallbackDetail}` : task.detail;
		detail.title = detail.textContent;

		const metrics = $('.turbofile-task-row-metrics');
		metrics.textContent = this.getTaskMetrics(task);

		const actions = $('.turbofile-task-row-actions');
		if (task.status === 'running' && task.progressId) {
			const cancel = this.createIconButton(Codicon.debugStop, '取消任务', 'turbofile-task-row-button');
			this.renderDisposables.add(cancel);
			cancel.element.disabled = !!task.cancelRequested;
			cancel.element.addEventListener('click', event => {
				event.stopPropagation();
				void this.cancelTask(task);
			});
			actions.appendChild(cancel.element);
		} else if ((task.status === 'error' || task.status === 'canceled') && task.retryTransfer) {
			const retry = this.createIconButton(Codicon.redo, '重试任务', 'turbofile-task-row-button');
			this.renderDisposables.add(retry);
			retry.element.addEventListener('click', event => {
				event.stopPropagation();
				void this.retryTask(task);
			});
			actions.appendChild(retry.element);
		}

		row.appendChild(name);
		row.appendChild(detail);
		row.appendChild(metrics);
		row.appendChild(actions);
		return row;
	}

	private async cancelTask(task: TurboFileTask): Promise<void> {
		if (task.status !== 'running' || task.cancelRequested) {
			return;
		}

		task.cancelRequested = true;
		task.detail = '正在取消任务...';
		this.statusMessage = task.detail;
		if (task.kind === 'sync' && this.syncPreviewState) {
			const preview = this.syncPreviewState;
			this.syncPreviewState = undefined;
			preview.resolve(undefined);
		}
		this.render();

		if (!task.progressId) {
			return;
		}

		try {
			const result = await this.sshService.cancelTransfer(task.progressId);
			if (!result.ok) {
				throw new Error(result.message);
			}
			if (task.status === 'running') {
				this.finishTask(task, 'canceled', `已取消任务：${task.label}`);
				this.prewarmCurrentTransferPair(true);
			}
		} catch (error) {
			if (task.status === 'running') {
				const message = error instanceof Error ? error.message : String(error);
				task.cancelRequested = false;
				task.error = message;
				task.detail = localize('turbofile.cancelTaskFailed', "取消任务失败：{0}", message);
				this.statusMessage = task.detail;
				this.render();
			}
		}
	}

	private async retryTask(task: TurboFileTask): Promise<void> {
		const retry = task.retryTransfer;
		if (!retry || (task.status !== 'error' && task.status !== 'canceled')) {
			return;
		}

		const sourceDevice = retry.sourceDeviceId ? this.getDeviceById(retry.sourceDeviceId) : this.getPaneDevice(retry.sourceSide);
		const targetDevice = this.getPaneDevice(retry.targetSide);
		const nextTask = this.beginTask('transfer', `重试 ${retry.sourceItem.name}`, `${sourceDevice?.name ?? retry.sourceSide} -> ${targetDevice?.name ?? retry.targetSide}`, false);
		nextTask.retryTransfer = retry;
		const result = await this.transferItem(retry.sourceSide, retry.targetSide, retry.sourceItem, {
			refreshTarget: true,
			task: nextTask,
			targetPath: retry.targetPath,
			sourceDeviceOverride: sourceDevice
		});
		if (result.ok) {
			this.finishTask(nextTask, 'success', `重试完成：${retry.sourceItem.name}`, { bytes: result.bytes, strategy: result.strategy });
			return;
		}
		if (result.canceled) {
			this.finishTask(nextTask, 'canceled', `已取消重试：${retry.sourceItem.name}`);
			return;
		}
		this.finishTask(nextTask, 'error', `重试失败：${result.message}`, { error: result.message });
	}

	private updateLiveTransferTicker(): void {
		// Progress events are intentionally throttled and some protocols can be quiet while data is
		// still moving. Keep a browser-only heartbeat for every running transfer so elapsed time and
		// the status bar never become stale. The heartbeat only renders existing in-memory state; it
		// never polls a device or changes transfer scheduling.
		const needsLiveTicker = this.tasks.some(task => this.needsLiveTransferTicker(task));
		if (needsLiveTicker && this.liveTransferTicker === undefined && this.container) {
			this.liveTransferTicker = getWindow(this.container).setInterval(() => {
				if (!this.tasks.some(task => this.needsLiveTransferTicker(task))) {
					this.clearLiveTransferTicker();
					return;
				}
				this.transferMetricsDisplay.advance();
				for (const task of this.tasks) {
					if (this.needsLiveTransferTicker(task)) {
						task.metricsDisplay?.advance();
					}
				}
				if (this.activePage === 'transfer' && !this.isTaskLogVisible) {
					this.refreshTaskbarMetrics();
				} else if (this.activePage === 'tasks' || this.isTaskLogVisible) {
					this.refreshTaskLogMetrics();
				}
			}, TURBOFILE_TRANSFER_LIVE_TICK_INTERVAL_MS);
		} else if (!needsLiveTicker) {
			this.clearLiveTransferTicker();
		}
	}

	private needsLiveTransferTicker(task: TurboFileTask): boolean {
		return task.kind === 'transfer' && task.status === 'running';
	}

	private clearLiveTransferTicker(): void {
		if (this.liveTransferTicker !== undefined && this.container) {
			getWindow(this.container).clearInterval(this.liveTransferTicker);
		}
		this.liveTransferTicker = undefined;
		this.transferMetricsDisplay.reset();
	}

	private beginTask(kind: TurboFileTaskKind, label: string, detail: string, shouldRender: boolean = true): TurboFileTask {
		const id = this.taskSequence++;
		const task: TurboFileTask = {
			id,
			kind,
			label,
			detail,
			status: 'running',
			startedAt: Date.now(),
			trackTotalBytes: false,
			transferItems: [],
			progress: 35,
			progressId: this.isTaskCancellable(kind) ? `turbofile-task-${id}-${Date.now()}` : undefined
		};
		this.tasks.unshift(task);
		if (kind === 'transfer') {
			// A new transfer owns the foreground SSH budget. Invalidate any consistency read that was
			// already in flight so its stale listing can never overwrite this transfer's optimistic rows.
			this.postTransferReconcileGeneration.left++;
			this.postTransferReconcileGeneration.right++;
			if (this.postTransferReconcileContexts.size) {
				this.postTransferReconcileScheduler.schedule(POST_TRANSFER_RECONCILE_DELAY_MS);
			}
		}
		trimTurboFileTaskHistory(this.tasks, 16);
		this.statusMessage = detail;
		this.updateInputRunningTaskCount();
		this.updateLiveTransferTicker();
		if (shouldRender) {
			this.render();
		} else {
			this.refreshTaskbar();
		}
		return task;
	}

	private isTaskCancellable(kind: TurboFileTaskKind): boolean {
		return kind === 'transfer' || kind === 'delete' || kind === 'size' || kind === 'compress' || kind === 'extract' || kind === 'sync';
	}

	private updateTask(task: TurboFileTask, detail: string, progress = task.progress, shouldRender: boolean = true): void {
		task.detail = detail;
		task.progress = progress;
		this.statusMessage = detail;
		if (shouldRender) {
			this.render();
		} else {
			this.refreshTaskbar();
		}
	}

	private updateTransferProgress(task: TurboFileTask, event: ITurboFileTransferProgressEvent): void {
		if (task.status !== 'running' || task.progressId !== event.progressId) {
			return;
		}
		const activeItem = task.activeTransferItemIndex !== undefined ? task.transferItems?.[task.activeTransferItemIndex] : undefined;
		const previousVisibleTransferredBytes = activeItem?.transferredBytes ?? task.transferredBytes ?? 0;
		if (event.currentName) {
			task.currentTransferName = event.currentName;
		}
		const strategy = this.getTransferStrategyFromProgress(event) ?? task.strategy;
		if (event.state === 'fallback') {
			const reason = event.detail || localize('turbofile.transferFallbackNoDetail', "当前协议不可用，正在尝试其他传输协议。");
			const fallbacks = task.transferFallbacks ??= [];
			const previousFallback = fallbacks[fallbacks.length - 1];
			if (!previousFallback || previousFallback.nextStrategy !== strategy || previousFallback.reason !== reason) {
				fallbacks.push({ previousStrategy: activeItem?.strategy ?? task.strategy, nextStrategy: strategy, reason });
			}
		}
		const semanticKey = createTurboFileTransferProgressSemanticKey({
			phase: event.phase,
			state: event.state,
			protocol: event.protocol,
			strategy,
			route: event.route,
			directFallbackReason: event.directFallbackReason,
			currentName: event.currentName ?? task.currentTransferName,
			completedItems: event.completedItems,
			totalItems: event.totalItems
		});
		const semanticChanged = task.lastProgressSemanticKey !== semanticKey;
		task.lastProgressSemanticKey = semanticKey;
		const isRsyncProgress = strategy?.startsWith('rsync') ?? false;
		const isFailed = event.state === 'failed';
		const isCanceled = event.state === 'canceled';
		const isCompleted = event.state ? event.state === 'completed' : event.phase === 'complete';
		const isTerminal = isCompleted || isFailed || isCanceled;
		const totalBytes = resolveTurboFileVisibleTotalBytes({
			trackTotalBytes: task.trackTotalBytes,
			listedTotalBytes: activeItem?.totalBytes ?? task.totalBytes,
			reportedTotalBytes: event.totalBytes
		});
		const transferredBytes = Math.min(event.transferredBytes, totalBytes !== undefined && totalBytes > 0 ? totalBytes : event.transferredBytes);
		const isFirstPositiveBytes = transferredBytes > 0 && previousVisibleTransferredBytes <= 0;
		const progress = totalBytes !== undefined && totalBytes > 0
			? Math.max(0, Math.min(100, Math.round((transferredBytes / totalBytes) * 100)))
			: isCompleted ? 100 : Math.max(8, task.progress);
		let detail = this.formatTransferProgressDetail(event, transferredBytes, totalBytes);
		if (event.totalItems && event.totalItems > 1) {
			const completedItems = Math.max(0, Math.min(event.completedItems ?? 0, event.totalItems));
			const currentName = event.currentName ? `：${event.currentName}` : '';
			detail = `${detail} · ${completedItems}/${event.totalItems}${currentName}`;
		}
		const now = Date.now();
		const speedTarget = activeItem ?? task;
		const wasQuiet = isTurboFileTransferProgressQuiet(speedTarget.lastProgressAt ?? task.startedAt, now);
		// Repeated size probes are not new data. They must not keep an obsolete speed alive.
		if (speedTarget.lastProgressAt === undefined || transferredBytes !== previousVisibleTransferredBytes || semanticChanged) {
			task.lastProgressAt = now;
			speedTarget.lastProgressAt = now;
		}
		const resetRsyncSpeedSample = isRsyncProgress
			&& transferredBytes > 0
			&& task.transferStartedAt === undefined
			&& (speedTarget.lastSampleBytes ?? 0) <= 0;
		const sampledSpeed = resetRsyncSpeedSample
			? this.resetTransferSpeedSample(speedTarget, transferredBytes, now)
			: this.calculateTransferSpeed(speedTarget, transferredBytes, now);
		const eventSpeed = event.speedBytesPerSecond !== undefined && event.speedBytesPerSecond >= 0 && Number.isFinite(event.speedBytesPerSecond)
			? event.speedBytesPerSecond
			: undefined;
		const speed = chooseDisplayTransferSpeed({
			strategy,
			eventSpeedBytesPerSecond: eventSpeed,
			sampledSpeedBytesPerSecond: sampledSpeed
		});
		const shouldStartTransferTimingValue = shouldStartTransferTiming({
			phase: event.phase,
			strategy,
			transferredBytes,
			speedBytesPerSecond: eventSpeed ?? speed
		});
		if (shouldStartTransferTimingValue && task.transferStartedAt === undefined) {
			task.transferStartedAt = now;
		}
		if (activeItem) {
			activeItem.startedAt ??= task.startedAt;
			if (shouldStartTransferTimingValue && activeItem.transferStartedAt === undefined) {
				activeItem.transferStartedAt = now;
			}
			activeItem.status = isCompleted ? 'success' : isFailed ? 'error' : isCanceled ? 'canceled' : 'running';
			activeItem.transferredBytes = transferredBytes;
			activeItem.totalBytes = totalBytes ?? activeItem.totalBytes;
			activeItem.progress = isCompleted ? 100 : progress;
			activeItem.speedBytesPerSecond = speed;
			activeItem.remainingMs = speed > 0 && totalBytes !== undefined && totalBytes > 0 && totalBytes > transferredBytes ? ((totalBytes - transferredBytes) / speed) * 1000 : undefined;
			activeItem.strategy = strategy;
			if (isFailed) {
				activeItem.error = event.detail;
			}
			if (isTerminal) {
				activeItem.endedAt = now;
			}
		}
		if (!activeItem) {
			task.transferredBytes = transferredBytes;
			task.totalBytes = totalBytes;
			task.speedBytesPerSecond = speed;
		}
		const aggregate = this.getLiveTransferAggregate([task]);
		task.transferredBytes = activeItem ? aggregate.transferredBytes : transferredBytes;
		task.totalBytes = activeItem ? aggregate.totalBytes : totalBytes;
		task.speedBytesPerSecond = activeItem ? aggregate.speedBytesPerSecond : speed;
		task.remainingMs = aggregate.remainingMs;
		task.strategy = strategy;
		task.progress = activeItem && aggregate.totalBytes !== undefined && aggregate.totalBytes > 0
			? Math.max(0, Math.min(100, Math.round((aggregate.transferredBytes / aggregate.totalBytes) * 100)))
			: isCompleted ? 100 : progress;
		task.detail = detail;
		this.statusMessage = detail;
		this.updateLiveTransferTicker();

		// Steady byte/speed/time changes are painted together by the single 500 ms ticker.
		// Only first data, recovery and terminal boundaries may bypass that cadence.
		if (isFirstPositiveBytes || isTerminal || (wasQuiet && transferredBytes !== previousVisibleTransferredBytes)) {
			this.transferMetricsDisplay.advance();
			task.metricsDisplay?.advance();
		}
		if (semanticChanged || isFirstPositiveBytes || isTerminal || (wasQuiet && transferredBytes !== previousVisibleTransferredBytes)) {
			if (this.activePage === 'transfer' && !this.isTaskLogVisible) {
				if (semanticChanged || isTerminal) {
					this.refreshTaskbar();
				} else {
					this.refreshTaskbarMetrics();
				}
			} else if (semanticChanged || isTerminal) {
				this.refreshVisibleTaskLogEntry(task);
			} else {
				this.refreshTaskLogMetrics();
			}
		}
	}

	private calculateTransferSpeed(target: Pick<TurboFileTask, 'lastSampleAt' | 'lastSampleBytes' | 'speedBytesPerSecond' | 'speedSamples'> | TurboFileTaskTransferItem, transferredBytes: number, now: number): number {
		const previousAt = target.lastSampleAt;
		const previousBytes = target.lastSampleBytes;
		const previousSpeed = target.speedBytesPerSecond ?? 0;
		if (previousAt === undefined || previousBytes === undefined || now <= previousAt || transferredBytes < previousBytes) {
			target.lastSampleAt = now;
			target.lastSampleBytes = transferredBytes;
			return previousSpeed;
		}
		const elapsed = now - previousAt;
		if (elapsed < TRANSFER_SPEED_SAMPLE_MIN_INTERVAL_MS && !(previousSpeed <= 0 && transferredBytes > previousBytes)) {
			return previousSpeed;
		}
		target.lastSampleAt = now;
		target.lastSampleBytes = transferredBytes;
		const rawSpeed = elapsed > 0 ? ((transferredBytes - previousBytes) / elapsed) * 1000 : 0;
		this.appendTransferSpeedSample(target.speedSamples ??= [], rawSpeed);
		return this.getSmoothedTransferSpeed(target.speedSamples, previousSpeed);
	}

	private resetTransferSpeedSample(target: Pick<TurboFileTask, 'lastSampleAt' | 'lastSampleBytes' | 'speedBytesPerSecond'> | TurboFileTaskTransferItem, transferredBytes: number, now: number): number {
		target.lastSampleAt = now;
		target.lastSampleBytes = transferredBytes;
		return target.speedBytesPerSecond ?? 0;
	}

	private appendTransferSpeedSample(samples: number[], speed: number): void {
		if (!Number.isFinite(speed) || speed <= 0) {
			return;
		}
		samples.push(speed);
		if (samples.length > TRANSFER_SPEED_SAMPLE_MAX_COUNT) {
			samples.splice(0, samples.length - TRANSFER_SPEED_SAMPLE_MAX_COUNT);
		}
	}

	private getSmoothedTransferSpeed(samples: readonly number[], previousSpeed: number): number {
		const validSamples = samples.filter(speed => Number.isFinite(speed) && speed > 0);
		if (!validSamples.length) {
			return previousSpeed;
		}
		const sorted = [...validSamples].sort((a, b) => a - b);
		const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
		const average = trimmed.reduce((sum, speed) => sum + speed, 0) / trimmed.length;
		return previousSpeed > 0 ? previousSpeed * 0.65 + average * 0.35 : average;
	}

	private getTransferStrategyFromProgress(event: ITurboFileTransferProgressEvent): TurboFileTransferStrategy | undefined {
		if (event.strategy) {
			return event.strategy;
		}
		const detail = event.detail?.toLowerCase() ?? '';
		if (event.phase === 'rsync-direct') {
			return detail.includes('parallel') ? 'rsync-direct-parallel' : 'rsync-direct';
		}
		if (event.phase === 'relay-download' || event.phase === 'relay-upload') {
			if (detail.includes('rsync relay')) {
				return 'rsync-relay';
			}
			return 'sftp-relay';
		}
		if (detail.includes('rsync relay')) {
			return 'rsync-relay';
		}
		if (detail.includes('direct sftp')) {
			return 'sftp-direct';
		}
		if (detail.includes('direct scp')) {
			return 'scp-direct';
		}
		if (detail.includes('scp upload')) {
			return 'scp-upload';
		}
		if (detail.includes('scp download')) {
			return 'scp-download';
		}
		if (detail.includes('sftp upload')) {
			return 'sftp-upload';
		}
		if (detail.includes('sftp download')) {
			return 'sftp-download';
		}
		if (detail.includes('sftp relay')) {
			return 'sftp-relay';
		}
		if (detail.includes('direct rsync')) {
			return 'rsync-direct';
		}
		if (detail.includes('direct tar')) {
			return 'tar-direct';
		}
		if (detail.includes('tar relay')) {
			return 'tar-relay';
		}
		if (detail.includes('tar upload')) {
			return 'tar-upload';
		}
		if (detail.includes('tar download')) {
			return 'tar-download';
		}
		if (detail.includes('remote copy')) {
			return 'remote-copy';
		}
		if (detail.includes('local copy')) {
			return 'local-copy';
		}
		return undefined;
	}

	private getTransferProtocolLabel(strategy: string | undefined): string | undefined {
		switch (strategy) {
			case 'tar-direct':
				return 'tar 直连';
			case 'tar-relay':
				return 'tar 中转';
			case 'tar-upload':
				return 'tar 上传';
			case 'tar-download':
				return 'tar 下载';
			case 'rsync-direct':
			case 'rsync-direct-parallel':
				return 'rsync 直连';
			case 'sftp-direct':
				return 'sftp 直连';
			case 'scp-direct':
				return 'scp 直连';
			case 'scp-relay':
				return 'scp 中转';
			case 'sftp-upload':
				return 'sftp 上传';
			case 'sftp-download':
				return 'sftp 下载';
			case 'scp-upload':
				return 'scp 上传';
			case 'scp-download':
				return 'scp 下载';
			case 'rsync-upload':
				return 'rsync 上传';
			case 'rsync-download':
				return 'rsync 下载';
			case 'rsync-relay':
				return 'rsync 中转';
			case 'sftp-relay':
				return 'sftp 中转';
			case 'remote-copy':
				return '同机复制';
			case 'local-copy':
				return '本地复制';
			case 'remote-move':
				return '同机移动';
			case 'local-move':
				return '本机移动';
			default:
				return strategy;
		}
	}

	/** Keep real protocol fallback causes available after subsequent progress or task completion. */
	private getTransferFallbackDetail(task: TurboFileTask): string | undefined {
		return task.transferFallbacks?.map(fallback => {
			const previous = this.getTransferProtocolLabel(fallback.previousStrategy);
			const next = this.getTransferProtocolLabel(fallback.nextStrategy);
			return previous && next && previous !== next
				? localize('turbofile.transferFallbackTransition', "{0} → {1}：{2}", previous, next, fallback.reason)
				: localize('turbofile.transferFallbackReason', "协议回退：{0}", fallback.reason);
		}).join('\n') || undefined;
	}

	private getTransferProtocolTooltip(task: TurboFileTask): string {
		const fallbackDetail = this.getTransferFallbackDetail(task);
		const label = localize('turbofile.transferProtocolTooltip', "传输模式");
		return fallbackDetail ? `${label}\n${fallbackDetail}` : label;
	}

	private getPlannedTransferStrategy(sourceDevice: TurboFileDevice, targetDevice: TurboFileDevice, sourceItem: TurboFileFileItem): TurboFileTransferStrategy {
		if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
			return 'local-copy';
		}
		if (this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
			return 'remote-copy';
		}
		const sourceEndpoint = this.toPlanningEndpoint(sourceDevice, sourceItem.path ?? '');
		const targetEndpoint = this.toPlanningEndpoint(targetDevice, '');
		const plan = resolveTransferPlan({
			source: sourceEndpoint,
			target: targetEndpoint,
			sourceType: sourceItem.type,
			itemCount: 1
		});
		return this.transferAttemptToPlannedStrategy(plan.attempts[0], sourceEndpoint, targetEndpoint);
	}

	private getPlannedBatchTransferStrategy(sourceDevice: TurboFileDevice, targetDevice: TurboFileDevice, sourceItems: readonly TurboFileFileItem[]): TurboFileTransferStrategy {
		if (!sourceItems.length) {
			return 'scp-direct';
		}
		if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
			return 'local-copy';
		}
		if (this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
			return 'remote-copy';
		}
		const sourceEndpoint = this.toPlanningEndpoint(sourceDevice, sourceItems[0].path ?? '');
		const targetEndpoint = this.toPlanningEndpoint(targetDevice, '');
		const plan = resolveTransferPlan({
			source: sourceEndpoint,
			target: targetEndpoint,
			sourceType: sourceItems.some(item => item.directory) ? 'directory' : sourceItems[0].type,
			itemCount: sourceItems.length
		});
		return this.transferAttemptToPlannedStrategy(plan.attempts[0], sourceEndpoint, targetEndpoint);
	}

	private primeTransferTaskStrategy(task: TurboFileTask, sourceDevice: TurboFileDevice, targetDevice: TurboFileDevice, sourceItems: readonly TurboFileFileItem[]): void {
		const sizePolicy = createTurboFileTransferSizePolicy(sourceItems);
		task.trackTotalBytes = sizePolicy.trackTotalBytes;
		task.totalBytes = sizePolicy.totalBytes;
		const plannedStrategy = sourceItems.length > 1
			? this.getPlannedBatchTransferStrategy(sourceDevice, targetDevice, sourceItems)
			: this.getPlannedTransferStrategy(sourceDevice, targetDevice, sourceItems[0]);
		const initialStrategy = this.shouldDeferSshToSshStrategy(sourceDevice, targetDevice) ? undefined : plannedStrategy;
		task.strategy = initialStrategy;
		for (const transferItem of task.transferItems ?? []) {
			transferItem.strategy = initialStrategy;
		}
		this.updateLiveTransferTicker();
		if (this.activePage === 'transfer' && !this.isTaskLogVisible) {
			this.refreshTaskbar();
		} else {
			this.render();
		}
	}

	private toPlanningEndpoint(device: TurboFileDevice, path: string): ITurboFileTransferEndpoint {
		if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
			return { kind: 'local', path };
		}
		return {
			kind: 'ssh',
			path,
			label: device.name,
			supportsRsync: device.capabilities.rsync,
			supportsTar: device.capabilities.tar,
			preferredProtocol: device.preferredTransferProtocol
		};
	}

	private transferAttemptToPlannedStrategy(attempt: ITurboFileTransferAttempt | undefined, source: ITurboFileTransferEndpoint, target: ITurboFileTransferEndpoint): TurboFileTransferStrategy {
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
		if (source.kind === 'local' && target.kind === 'ssh') {
			return `${attempt.protocol}-upload` as TurboFileTransferStrategy;
		}
		if (source.kind === 'ssh' && target.kind === 'local') {
			return `${attempt.protocol}-download` as TurboFileTransferStrategy;
		}
		return 'local-copy';
	}

	private shouldDeferSshToSshStrategy(sourceDevice: TurboFileDevice, targetDevice: TurboFileDevice): boolean {
		return sourceDevice.id !== LOCAL_WINDOWS_DEVICE_ID
			&& targetDevice.id !== LOCAL_WINDOWS_DEVICE_ID
			&& !this.isSameDeviceForNativeOperation(sourceDevice, targetDevice);
	}

	private formatTransferProgressDetail(event: ITurboFileTransferProgressEvent, transferredBytes: number, totalBytes: number | undefined): string {
		if (event.state === 'fallback') {
			return localize('turbofile.transferFallbackReason', "协议回退：{0}", event.detail || localize('turbofile.transferFallbackNoDetail', "当前协议不可用，正在尝试其他传输协议。"));
		}
		const phase = event.phase;
		const phaseLabel = phase === 'relay-download'
			? '中转下载'
			: phase === 'relay-upload'
				? '中转上传'
				: phase === 'rsync-direct'
					? '直连传输'
					: phase === 'prepare'
						? '准备传输'
						: phase === 'complete'
							? '传输完成'
							: '正在传输';
		const extraParts: string[] = [];
		if (event.toCheck !== undefined && event.totalChecks !== undefined) {
			extraParts.push(`to-check ${event.toCheck}/${event.totalChecks}`);
		}
		if (event.transferIndex !== undefined) {
			extraParts.push(`xfr#${event.transferIndex}`);
		}
		const extra = extraParts.length > 0 ? ` (${extraParts.join('; ')})` : '';
		if (totalBytes !== undefined) {
			return `${phaseLabel}：${formatSize(transferredBytes)} / ${formatSize(totalBytes)}${extra}`;
		}
		if (transferredBytes > 0) {
			return `${phaseLabel}：${formatSize(transferredBytes)}${extra}`;
		}
		return extra ? `${phaseLabel} (${extraParts.join('; ')})` : phaseLabel;
	}

	private finishTask(task: TurboFileTask, status: Exclude<TurboFileTaskStatus, 'running'>, detail: string, options: { bytes?: number; strategy?: string; error?: string; durationMs?: number; averageBytesPerSecond?: number } = {}, shouldRender: boolean = true): void {
		if (task.status === 'canceled' && task.cancelRequested && status !== 'canceled') {
			return;
		}
		task.status = status;
		task.detail = detail;
		task.endedAt = Date.now();
		if (task.kind === 'transfer') {
			const timingStartedAt = task.transferStartedAt ?? task.startedAt;
			const elapsedMs = Math.max(1, task.endedAt - timingStartedAt);
			task.durationMs = Math.max(task.durationMs ?? 0, options.durationMs ?? 0, elapsedMs);
		} else {
			task.durationMs = options.durationMs ?? task.durationMs;
		}
		task.progress = status === 'success' ? 100 : Math.max(task.progress, 0);
		task.bytes = options.bytes;
		task.averageBytesPerSecond = options.averageBytesPerSecond
			?? (options.bytes !== undefined && task.durationMs !== undefined && task.durationMs > 0 ? Math.round(options.bytes / (task.durationMs / 1000)) : task.averageBytesPerSecond);
		if (options.bytes !== undefined) {
			task.transferredBytes = options.bytes;
			if (task.trackTotalBytes) {
				task.totalBytes = Math.max(task.totalBytes ?? 0, options.bytes);
			}
		}
		task.strategy = options.strategy;
		task.error = options.error;
		if (task.transferItems?.length) {
			for (const item of task.transferItems) {
				if (status === 'success' && item.status !== 'success') {
					item.status = 'success';
					item.progress = 100;
					if (task.trackTotalBytes) {
						item.transferredBytes = this.getLiveTransferItemTotal(item, task) ?? item.transferredBytes;
					}
					item.endedAt = task.endedAt;
				} else if (status === 'canceled' && (item.status === 'waiting' || item.status === 'running')) {
					item.status = 'canceled';
					item.endedAt = task.endedAt;
				} else if (status === 'error' && item.status === 'running') {
					item.status = 'error';
					item.error = options.error;
					item.endedAt = task.endedAt;
				}
			}
		}
		this.statusMessage = detail;
		this.updateInputRunningTaskCount();
		this.updateLiveTransferTicker();
		if (shouldRender) {
			this.render();
		} else {
			this.refreshTaskbar();
			this.refreshVisibleTaskLogEntry(task);
		}
	}

	private refreshVisibleTaskLogEntry(task: TurboFileTask): void {
		if (!this.container || (this.activePage !== 'tasks' && !this.isTaskLogVisible)) {
			return;
		}

		const taskSelector = `.turbofile-task-row[data-task-id="${task.id}"]`;
		for (const list of this.container.querySelectorAll<HTMLElement>('.turbofile-task-log-list')) {
			const current = list.querySelector<HTMLElement>(taskSelector);
			if (current) {
				current.replaceWith(this.renderTaskRow(task));
			} else {
				list.querySelector<HTMLElement>('.turbofile-task-log-empty')?.remove();
				list.prepend(this.renderTaskRow(task));
			}
		}

		if (this.activePage !== 'tasks') {
			return;
		}
		const stats = this.getTaskStats();
		const summaryValues = [stats.running, stats.success, stats.error, stats.canceled];
		const summaryNumbers = this.container.querySelectorAll<HTMLElement>('.turbofile-task-summary-grid .turbofile-summary-card strong');
		summaryNumbers.forEach((number, index) => {
			const value = summaryValues[index];
			if (value !== undefined) {
				number.textContent = String(value);
			}
		});
	}

	private getTaskStats(): { running: number; success: number; error: number; canceled: number } {
		const stats = { running: 0, success: 0, error: 0, canceled: 0 };
		for (const task of this.tasks) {
			stats[task.status]++;
		}
		return stats;
	}

	private formatTaskLine(task: TurboFileTask): string {
		const status = task.status === 'running' ? '进行中' : task.status === 'success' ? '完成' : task.status === 'canceled' ? '已取消' : '失败';
		const metrics = this.getTaskMetrics(task);
		return `${status}：${task.label}${metrics ? ` · ${metrics}` : ''}`;
	}

	private getTaskMetrics(task: TurboFileTask): string {
		if (task.kind === 'transfer' && task.status === 'running') {
			const summary = (task.metricsDisplay ??= new TurboFileTransferMetricsDisplay()).read(String(task.id), this.getLiveTransferAggregate([task]), Date.now());
			return [this.getTransferTimeDisplay(summary).text, formatSize(summary.transferredBytes), this.formatSpeed(summary.speedBytesPerSecond), task.strategy].filter(Boolean).join(' · ');
		}
		const timingStartedAt = task.transferStartedAt ?? task.startedAt;
		const elapsedMs = task.durationMs ?? ((task.endedAt ?? Date.now()) - timingStartedAt);
		const duration = formatDuration(elapsedMs);
		const parts = [duration];
		if (task.status === 'running' && task.transferredBytes !== undefined) {
			if (isTurboFileTransferProgressQuiet(task.lastProgressAt ?? task.startedAt, Date.now())) {
				parts.push(localize('turbofile.awaitingProgress', "等待进度反馈（任务未结束）"));
			}
			if (task.totalBytes !== undefined) {
				parts.push(`${formatSize(task.transferredBytes)} / ${formatSize(task.totalBytes)}`);
			} else if (task.transferredBytes > 0) {
				parts.push(formatSize(task.transferredBytes));
			}
			const runningThroughput = formatThroughput(task.transferredBytes, Date.now() - timingStartedAt);
			if (runningThroughput) {
				parts.push(runningThroughput);
			}
		}
		if (task.bytes !== undefined) {
			parts.push(formatSize(task.bytes));
			if (task.averageBytesPerSecond && task.averageBytesPerSecond > 0) {
				parts.push(`${formatTransferRate(task.averageBytesPerSecond)}/s`);
			} else {
				const throughput = formatThroughput(task.bytes, elapsedMs);
				if (throughput) {
					parts.push(throughput);
				}
			}
		}
		if (task.strategy) {
			parts.push(task.strategy);
		}
		if (task.error) {
			parts.push(task.error);
		}
		return parts.join(' · ');
	}

	private getTaskIcon(task: TurboFileTask): ThemeIcon {
		if (task.status === 'running') {
			return Codicon.loading;
		}
		if (task.status === 'error') {
			return Codicon.error;
		}
		if (task.status === 'canceled') {
			return Codicon.circleSlash;
		}
		return Codicon.check;
	}

	private renderLegacyImageGridOverlay(): HTMLElement {
		const state = this.imageGridState;
		const overlay = $('.turbofile-image-grid-overlay');
		overlay.addEventListener('click', event => {
			if (event.target === overlay) {
				this.closeImageGridPage();
			}
		});
		const panel = $('.turbofile-image-grid-panel');
		if (!state) {
			return overlay;
		}
		const selected = state.images[state.selectedIndex];

		const header = $('.turbofile-image-grid-header');
		const title = $('.turbofile-image-grid-title');
		title.appendChild(renderIcon(Codicon.fileMedia));
		title.append(`图片浏览 · ${this.getSideLabel(state.side)} · ${state.images.length} 张`);
		header.appendChild(title);

		const actions = $('.turbofile-image-grid-actions');
		const previous = this.createIconButton(Codicon.chevronLeft, '上一张', 'turbofile-toolbar-button');
		previous.element.addEventListener('click', () => this.moveImageGridPreview(-1));
		actions.appendChild(previous.element);
		const next = this.createIconButton(Codicon.chevronRight, '下一张', 'turbofile-toolbar-button');
		next.element.addEventListener('click', () => this.moveImageGridPreview(1));
		actions.appendChild(next.element);
		const open = this.createButton('打开', 'turbofile-secondary-button');
		open.element.disabled = !selected?.item.path;
		open.element.addEventListener('click', () => {
			if (selected?.item.path) {
				this.closeImageGridPage();
				void this.previewSelected(state.side, selected.item);
			}
		});
		actions.appendChild(open.element);
		const close = this.createIconButton(Codicon.close, '关闭', 'turbofile-toolbar-button');
		close.element.addEventListener('click', () => this.closeImageGridPage());
		actions.appendChild(close.element);
		header.appendChild(actions);
		panel.appendChild(header);

		const preview = $('.turbofile-image-grid-preview');
		if (selected?.thumbnailContent) {
			const image = document.createElement('img');
			image.className = 'turbofile-image-grid-preview-image';
			image.src = `data:${selected.thumbnailMime};base64,${selected.thumbnailContent}`;
			image.alt = selected.item.name;
			preview.appendChild(image);
		} else {
			const placeholder = $('.turbofile-image-grid-placeholder');
			placeholder.appendChild(renderIcon(Codicon.fileMedia));
			placeholder.append(selected?.thumbnailError ?? (selected?.thumbnailLoading ? '正在加载图片...' : '准备加载图片'));
			preview.appendChild(placeholder);
		}
		const caption = $('.turbofile-image-grid-caption');
		caption.textContent = selected ? `${state.selectedIndex + 1} / ${state.images.length} · ${selected.item.name}` : '';
		preview.appendChild(caption);
		panel.appendChild(preview);

		const strip = $('.turbofile-image-grid-strip');
		for (let index = 0; index < state.images.length; index++) {
			const image = state.images[index];
			const card = $('button.turbofile-image-grid-card') as HTMLButtonElement;
			card.type = 'button';
			card.title = image.item.name;
			if (index === state.selectedIndex) {
				card.classList.add('is-selected');
			}
			card.addEventListener('pointerdown', event => this.selectImageGridItemWithPointer(state, index, event));
			card.addEventListener('contextmenu', event => this.selectImageGridItemWithContextMenu(index, event));
			if (image.thumbnailContent) {
				const thumb = document.createElement('img');
				thumb.loading = 'lazy';
				thumb.src = `data:${image.thumbnailMime};base64,${image.thumbnailContent}`;
				thumb.alt = image.item.name;
				card.appendChild(thumb);
			} else {
				const placeholder = $('.turbofile-image-grid-card-placeholder');
				placeholder.appendChild(renderIcon(Codicon.fileMedia));
				const name = $('span');
				name.textContent = image.thumbnailLoading ? '加载中' : image.item.name;
				placeholder.appendChild(name);
				card.appendChild(placeholder);
			}
			strip.appendChild(card);
		}
		panel.appendChild(strip);
		overlay.appendChild(panel);
		return overlay;
	}

	private renderImageGridPage(state: TurboFileImageGridState | undefined = this.imageGridState): HTMLElement {
		if (!state) {
			return $('.turbofile-image-page');
		}
		if (state.displayMode === 'pane' && state.retainedPaneRoot) {
			const retainedRoot = state.retainedPaneRoot;
			const retainedBody = retainedRoot.querySelector<HTMLElement>('.turbofile-image-page-body');
			if (retainedBody) {
				const scrollTop = state.scrollTop;
				getWindow(retainedBody).requestAnimationFrame(() => {
					if (retainedBody.isConnected) {
						this.reflowAttachedImageGridBody(retainedBody, state, scrollTop);
					}
				});
			}
			return retainedRoot;
		}
		const page = $('.turbofile-image-page');
		if (state.displayMode === 'pane') {
			state.paneDomDisposables?.dispose();
			state.paneDomDisposables = new DisposableStore();
		}
		page.classList.toggle('is-pane-mode', state.displayMode === 'pane');
		page.dataset.turbofileSide = state.side;
		page.addEventListener('pointerdown', () => this.setActiveImageGridState(state));
		page.addEventListener('focusin', () => this.setActiveImageGridState(state));
		// The scroll body is recreated on every full render; drop the cached width so this pass
		// re-measures (and so a post-attach measurement below picks up the real body width).
		this.invalidateImageGridBodyWidthCache(state);
		this.normalizeImageGridStateColumns(state);
		const range = this.getImageGridVirtualRange(state);

		const header = $('.turbofile-image-page-header');
		const headerLeft = $('.turbofile-image-page-header-left');
		const title = $('.turbofile-image-page-title');
		title.appendChild(renderIcon(Codicon.fileMedia));
		title.append('图片网格');
		headerLeft.appendChild(title);

		const columns = $('.turbofile-image-page-columns');
		const label = $('span.turbofile-image-page-columns-label');
		label.textContent = '列数';
		columns.appendChild(label);
		for (const option of [] as TurboFileImageGridColumns[]) {
			const button = $('button.turbofile-image-page-columns-button') as HTMLButtonElement;
			button.type = 'button';
			button.textContent = String(option);
			if (state.columns === option) {
				button.classList.add('is-active');
			}
			button.addEventListener('click', () => {
				this.setActiveImageGridState(state);
				this.setImageGridColumns(state, option);
			});
			columns.appendChild(button);
		}
		headerLeft.appendChild(columns);
		header.appendChild(headerLeft);

		const actions = $('.turbofile-image-page-actions');
		if (state.trashContext) {
			const restoreButton = $('button.turbofile-image-page-action.is-restore') as HTMLButtonElement;
			const restoreCount = this.getImageGridDeleteTargets(state).length;
			restoreButton.type = 'button';
			restoreButton.title = restoreCount ? '还原选中图片' : '请先选择要还原的图片';
			restoreButton.disabled = restoreCount === 0;
			restoreButton.setAttribute('aria-label', '还原选中图片');
			restoreButton.appendChild(renderIcon(Codicon.discard));
			restoreButton.addEventListener('click', () => {
				this.setActiveImageGridState(state);
				void this.restoreSelectedImageGridItems(state);
			});
			actions.appendChild(restoreButton);
		}
		const deleteButton = $('button.turbofile-image-page-action.is-delete.is-danger') as HTMLButtonElement;
		const selectedCount = this.getImageGridDeleteTargets(state).length;
		deleteButton.type = 'button';
		deleteButton.title = selectedCount ? '\u5220\u9664\u9009\u4e2d\u56fe\u7247' : '\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u56fe\u7247';
		deleteButton.disabled = selectedCount === 0;
		deleteButton.setAttribute('aria-label', '\u5220\u9664\u9009\u4e2d\u56fe\u7247');
		deleteButton.appendChild(renderIcon(Codicon.trash));
		deleteButton.addEventListener('click', () => {
			this.setActiveImageGridState(state);
			void this.deleteSelectedImageGridItems(state);
		});
		actions.appendChild(deleteButton);
		const imageCount = $('span.turbofile-image-page-count');
		imageCount.textContent = `${this.getImageGridSelectedIndexes(state).length} / ${state.images.length}`;
		imageCount.title = '已选图片 / 图片总数';
		imageCount.setAttribute('aria-label', '已选图片 / 图片总数');
		actions.appendChild(imageCount);
		actions.appendChild(this.renderImageGridSortControl(state));
		const closeIcon = $('button.turbofile-image-page-action.is-close') as HTMLButtonElement;
		closeIcon.type = 'button';
		closeIcon.title = '关闭';
		closeIcon.setAttribute('aria-label', '关闭图片网格');
		closeIcon.appendChild(renderIcon(Codicon.close));
		closeIcon.addEventListener('click', () => this.closeImageGridPage(state));
		actions.appendChild(closeIcon);
		const close = this.createButton('关闭', 'turbofile-secondary-button');
		close.element.addEventListener('click', () => this.closeImageGridPage(state));
		actions.appendChild(close.element);
		header.appendChild(actions);
		page.appendChild(header);

		const body = $('.turbofile-image-page-body');
		body.tabIndex = 0;
		body.scrollTop = state.scrollTop;
		body.addEventListener('pointerdown', event => {
			this.setActiveImageGridState(state);
			const target = event.target instanceof HTMLElement ? event.target : undefined;
			if (!target?.closest('.turbofile-image-page-card, button, .turbofile-image-page-sort')) {
				body.focus({ preventScroll: true });
			}
		});
		body.addEventListener('focusin', () => this.setActiveImageGridState(state));
		body.addEventListener('paste', event => {
			if (this.isEditableKeyboardTarget(event.target)) {
				return;
			}
			this.setActiveImageGridState(state);
			event.preventDefault();
			void this.pasteIntoPane(getTurboFileImageGridPasteTargetSide(state.side, this.internalTransferClipboard?.sourceSide));
		});
		this.registerImageGridDropTarget(body, state);
		body.addEventListener('scroll', () => this.handleImageGridScroll(body, state), { passive: true });
		page.addEventListener('wheel', event => this.handleImageGridWheel(event, body, state), { passive: false, capture: true });
		const grid = $('.turbofile-image-page-grid');
		grid.setAttribute('role', 'listbox');
		grid.setAttribute('aria-multiselectable', 'true');
		grid.style.setProperty('--turbofile-image-grid-columns', String(this.getImageGridEffectiveColumns(state)));
		grid.style.setProperty('--turbofile-image-grid-scale', String(state.thumbnailScale));
		this.renderImageGridSlice(grid, state, range);
		body.appendChild(grid);
		page.appendChild(body);
		const scrollTop = state.scrollTop;
		getWindow(body).requestAnimationFrame(() => {
			if (!body.isConnected) {
				return;
			}
			this.reflowAttachedImageGridBody(body, state, scrollTop);
		});
		if (state.displayMode === 'pane') {
			state.retainedPaneRoot = page;
		}
		return page;
	}

	private reflowAttachedImageGridBody(body: HTMLElement, state: TurboFileImageGridState, scrollTop: number, loadVisibleImages = true): void {
		// Pane grids are measured before they are attached to the DOM during render. Re-measure once
		// attached so the virtual slice uses the actual left/right panel width instead of the window width.
		this.invalidateImageGridBodyWidthCache(state);
		this.clearImageGridLayoutMetrics(state);
		state.viewportHeight = body.clientHeight || state.viewportHeight;
		state.scrollTop = Math.max(0, scrollTop);
		this.normalizeImageGridStateColumns(state);
		const range = this.getImageGridVirtualRange(state);
		const rendered = state.renderedRange;
		const columns = this.getImageGridEffectiveColumns(state);
		if (!rendered || rendered.startIndex !== range.startIndex || rendered.endIndex !== range.endIndex || rendered.columns !== columns || rendered.total !== state.images.length) {
			this.updateImageGridVirtualSlice(state, range);
		}
		if (scrollTop > 0) {
			body.scrollTop = scrollTop;
		} else if (body.scrollLeft) {
			body.scrollLeft = 0;
		}
		if (loadVisibleImages) {
			this.scheduleImageGridVisibleLoad(state);
		}
	}

	private updateImageGridAfterLocalMutation(state: TurboFileImageGridState): void {
		const body = this.getImageGridBodyElement(state);
		const scrollTop = body?.scrollTop ?? state.scrollTop;
		state.scrollTop = Math.max(0, scrollTop);
		if (body) {
			state.viewportHeight = body.clientHeight || state.viewportHeight;
		}
		this.invalidateImageGridBodyWidthCache(state);
		this.clearImageGridLayoutMetrics(state);
		state.renderedRange = undefined;
		this.normalizeImageGridStateColumns(state);
		this.updateImageGridVirtualSlice(state, this.getImageGridVirtualRange(state));
		if (body) {
			body.scrollTop = Math.min(scrollTop, body.scrollHeight);
			state.scrollTop = body.scrollTop;
		}
		this.updateImageGridSelection(state);
		this.updateImageGridSelectionStatus(state);
		if (state.previewVisible) {
			this.updateImagePreviewOverlay(state);
		}
		this.refreshTaskbar();
	}

	private renderImageGridSortControl(state: TurboFileImageGridState): HTMLElement {
		const select = $('.turbofile-image-page-sort');
		const button = $('button.turbofile-image-page-sort-button') as HTMLButtonElement;
		const menu = $('.turbofile-image-page-sort-menu');
		button.type = 'button';
		button.title = '排序方式';
		button.setAttribute('aria-haspopup', 'menu');
		button.setAttribute('aria-expanded', 'false');
		button.setAttribute('aria-label', '排序方式');
		button.appendChild(renderIcon(Codicon.listOrdered));
		button.appendChild($('span.turbofile-image-page-sort-label', undefined, this.getImageGridSortLabel(state)));
		const directionIcon = renderIcon(state.sortDescending ? Codicon.arrowDown : Codicon.arrowUp);
		directionIcon.classList.add('turbofile-image-page-sort-direction-icon');
		button.appendChild(directionIcon);
		button.appendChild(renderIcon(Codicon.chevronDown));

		menu.setAttribute('role', 'menu');
		menu.setAttribute('aria-label', '图片排序方式');
		for (const option of IMAGE_GRID_SORT_OPTIONS) {
			const isActive = state.sortKey === option.key;
			const item = $('button.turbofile-image-page-sort-option') as HTMLButtonElement;
			item.type = 'button';
			item.dataset.turbofileImageSortKey = option.key;
			item.setAttribute('role', 'menuitemradio');
			item.setAttribute('aria-checked', isActive ? 'true' : 'false');
			if (isActive) {
				item.classList.add('is-active');
			}
			const check = $('span.turbofile-image-page-sort-check');
			if (isActive) {
				check.appendChild(renderIcon(Codicon.check));
			}
			item.appendChild(check);
			item.appendChild($('span.turbofile-image-page-sort-option-label', undefined, option.label));
			item.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				select.classList.remove('is-open');
				button.setAttribute('aria-expanded', 'false');
				this.setActiveImageGridState(state);
				this.setImageGridSortKey(state, option.key);
			});
			menu.appendChild(item);
		}

		const divider = $('.turbofile-image-page-sort-divider');
		divider.setAttribute('role', 'separator');
		menu.appendChild(divider);

		for (const option of IMAGE_GRID_SORT_DIRECTION_OPTIONS) {
			const isActive = state.sortDescending === option.descending;
			const item = $('button.turbofile-image-page-sort-option') as HTMLButtonElement;
			item.type = 'button';
			item.dataset.turbofileImageSortDescending = String(option.descending);
			item.setAttribute('role', 'menuitemradio');
			item.setAttribute('aria-checked', isActive ? 'true' : 'false');
			if (isActive) {
				item.classList.add('is-active');
			}
			const check = $('span.turbofile-image-page-sort-check');
			if (isActive) {
				check.appendChild(renderIcon(Codicon.check));
			}
			item.appendChild(check);
			item.appendChild($('span.turbofile-image-page-sort-option-label', undefined, option.label));
			item.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				select.classList.remove('is-open');
				button.setAttribute('aria-expanded', 'false');
				this.setActiveImageGridState(state);
				this.setImageGridSortDirection(state, option.descending);
			});
			menu.appendChild(item);
		}

		const closeMenu = () => {
			select.classList.remove('is-open');
			button.setAttribute('aria-expanded', 'false');
		};
		const toggleMenu = (event: MouseEvent | KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const nextOpen = !select.classList.contains('is-open');
			select.classList.toggle('is-open', nextOpen);
			button.setAttribute('aria-expanded', String(nextOpen));
			if (nextOpen) {
				const active = menu.querySelector<HTMLElement>('.turbofile-image-page-sort-option.is-active') ?? menu.querySelector<HTMLElement>('.turbofile-image-page-sort-option');
				active?.focus();
			}
		};
		button.addEventListener('click', toggleMenu);
		button.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
				toggleMenu(event);
			}
		});
		const ownerWindow = getWindow(select);
		const handleWindowClick = (event: MouseEvent) => {
			if (!select.contains(event.target as Node | null)) {
				closeMenu();
			}
		};
		const handleWindowKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && select.classList.contains('is-open')) {
				event.preventDefault();
				closeMenu();
				button.focus();
			}
		};
		ownerWindow.addEventListener('click', handleWindowClick);
		ownerWindow.addEventListener('keydown', handleWindowKeydown);
		const disposables = state.paneDomDisposables ?? this.renderDisposables;
		disposables.add({ dispose: () => ownerWindow.removeEventListener('click', handleWindowClick) });
		disposables.add({ dispose: () => ownerWindow.removeEventListener('keydown', handleWindowKeydown) });

		select.appendChild(button);
		select.appendChild(menu);
		return select;
	}

	private renderImageGridSlice(grid: HTMLElement, state: TurboFileImageGridState, range: TurboFileImageGridRange): void {
		clearNode(grid);
		grid.style.setProperty('--turbofile-image-grid-columns', String(this.getImageGridEffectiveColumns(state)));
		grid.style.setProperty('--turbofile-image-grid-scale', String(state.thumbnailScale));
		this.releaseImageGridImagesOutsideRange(state, range);

		if (range.topSpacerHeight > 0) {
			const topSpacer = $('.turbofile-image-page-spacer');
			topSpacer.style.height = `${range.topSpacerHeight}px`;
			grid.appendChild(topSpacer);
		}

		for (let index = range.startIndex; index < range.endIndex; index++) {
			grid.appendChild(this.renderImageGridCard(state, state.images[index], index));
		}

		if (range.bottomSpacerHeight > 0) {
			const bottomSpacer = $('.turbofile-image-page-spacer');
			bottomSpacer.style.height = `${range.bottomSpacerHeight}px`;
			grid.appendChild(bottomSpacer);
		}
		state.renderedRange = {
			startIndex: range.startIndex,
			endIndex: range.endIndex,
			columns: this.getImageGridEffectiveColumns(state),
			total: state.images.length
		};
		this.scheduleImageGridVisibleLoad(state);
	}

	/**
	 * Loads thumbnails for only the page currently in view, after scrolling settles. A fast drag or a
	 * big jump renders many slices in quick succession; debouncing here means we load just the page the
	 * user lands on (the previous in-flight batch is invalidated via the load token), so the landing
	 * page fills in fast instead of waiting behind loads for pages that were merely scrolled past.
	 */
	private scheduleImageGridVisibleLoad(state: TurboFileImageGridState): void {
		this.clearImageGridVisibleLoadTimer(state);
		const timer = setTimeout(() => {
			this.imageGridVisibleLoadTimers.delete(state);
			if (!this.isImageGridSurfaceActive(state)) {
				return;
			}
			state.thumbnailLoadToken++;
			const range = this.getImageGridVirtualRange(state);
			const indexes: number[] = [];
			for (let index = range.startIndex; index < range.endIndex; index++) {
				indexes.push(index);
			}
			if (indexes.length) {
				this.queueImageGridThumbnailLoads(state, indexes, true);
			}
		}, IMAGE_GRID_VISIBLE_LOAD_DEBOUNCE_MS);
		this.imageGridVisibleLoadTimers.set(state, timer);
	}

	private renderImageGridCard(state: TurboFileImageGridState, image: TurboFileImageGridImage, index: number): HTMLElement {
		const card = $('div.turbofile-image-page-card') as HTMLElement;
		const cardSize = this.getImageGridCardSize(state, image);
		card.tabIndex = 0;
		card.draggable = true;
		card.setAttribute('role', 'option');
		card.title = image.item.name;
		card.dataset.imageIndex = String(index);
		const isSelected = state.selectedIndexes.has(index);
		if (isSelected) {
			card.classList.add('is-selected');
		}
		if (state.selectedIndex === index) {
			card.classList.add('is-focused');
		}
		card.setAttribute('aria-selected', isSelected ? 'true' : 'false');

		const preview = $('.turbofile-image-page-card-preview');
		this.applyImageGridCardPreviewSize(preview, cardSize);
		const thumbnailSrc = image.thumbnailUrl || (image.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : '');
		if (thumbnailSrc) {
			const thumb = document.createElement('img');
			thumb.draggable = false;
			thumb.loading = 'eager';
			thumb.decoding = 'async';
			this.applyImageGridCardImageSize(thumb, cardSize);
			thumb.addEventListener('load', () => {
				image.width = Math.max(1, thumb.naturalWidth || image.width || 1);
				image.height = Math.max(1, thumb.naturalHeight || image.height || 1);
				const currentIndex = state.images.indexOf(image);
				if (currentIndex >= 0) {
					this.updateImageGridCard(state, currentIndex);
				}
			});
			thumb.addEventListener('error', () => this.handleImageGridThumbnailError(state, index));
			thumb.src = thumbnailSrc;
			thumb.alt = image.item.name;
			preview.appendChild(thumb);
		} else {
			const placeholder = $('.turbofile-image-page-card-placeholder');
			placeholder.appendChild(renderIcon(Codicon.fileMedia));
			preview.appendChild(placeholder);
		}
		this.appendImageGridCardChrome(preview, image, index);
		card.appendChild(preview);

		if (this.shouldShowImageGridNames()) {
			const name = $('.turbofile-image-page-card-name');
			name.textContent = image.item.name;
			name.addEventListener('dblclick', event => event.stopPropagation());
			card.appendChild(name);
		}

		card.addEventListener('pointerdown', event => {
			this.setActiveImageGridState(state);
			this.selectImageGridItemWithPointer(state, index, event);
		});
		card.addEventListener('click', event => this.completeImageGridItemPointerSelection(state, index, event));
		card.addEventListener('dragstart', event => this.beginImageGridCardDrag(state, index, event));
		card.addEventListener('drag', event => this.maybeHandoffFileDragSessionToWindows(event));
		card.addEventListener('dragend', () => this.clearCurrentFileDragState());
		card.addEventListener('contextmenu', event => {
			this.setActiveImageGridState(state);
			this.selectImageGridItemWithContextMenu(index, event);
		});
		card.addEventListener('dblclick', event => {
			event.preventDefault();
			this.setActiveImageGridState(state);
			this.openImageGridPreview(index);
		});
		card.addEventListener('keydown', event => {
			this.setActiveImageGridState(state);
			if (event.key === 'Enter') {
				event.preventDefault();
				this.openImageGridPreview(index);
			} else if (event.key === ' ' || event.key === 'Spacebar') {
				event.preventDefault();
				this.selectImageGridItem(index, event);
			}
		});
		return card;
	}

	private beginImageGridCardDrag(state: TurboFileImageGridState, index: number, event: DragEvent): void {
		if (!event.dataTransfer || !this.isImageGridSurfaceActive(state) || index < 0 || index >= state.images.length) {
			return;
		}
		this.setActiveImageGridState(state);
		const image = state.images[index];
		if (!image?.item.path || image.item.parent) {
			return;
		}

		if (!state.selectedIndexes.has(index)) {
			this.setSingleImageGridSelection(state, index);
			this.updateImageGridSelection(state);
			this.updateImageGridSelectionStatus(state);
		}

		this.syncImageGridSelectionToPane(state);
		this.setActiveFilePaneSide(state.side);
		const operation = this.getCurrentDragOperation(state.side);

		event.dataTransfer.effectAllowed = getTurboFileRowDragEffectAllowed();
		event.dataTransfer.setData('application/x-turbofile-side', state.side);
		event.dataTransfer.setData('application/x-turbofile-operation', operation);
		event.dataTransfer.setData('text/plain', this.getImageGridTransferItems(state).map(item => item.name).join('\n'));
		// Image-grid drags are an in-app pane operation. Chromium's physical-mouse coordinates are
		// unreliable on mixed-DPI/multi-monitor Windows setups, so never promote this drag to OLE.
		this.beginFileDragSession(state.side, event, false);
	}

	private copyImageGridSelectionToInternalClipboard(state: TurboFileImageGridState, operation: 'copy' | 'move'): void {
		if (!this.isImageGridSurfaceActive(state)) {
			return;
		}
		this.setActiveImageGridState(state);
		this.syncImageGridSelectionToPane(state);
		this.copySelectedToInternalClipboard(state.side, operation, false);
	}

	private syncImageGridSelectionToPane(state: TurboFileImageGridState): void {
		const paneState = this.paneStates[state.side];
		const selectedItems = this.getImageGridTransferItems(state);
		paneState.selectedPaths.clear();
		for (const item of selectedItems) {
			if (item.path) {
				paneState.selectedPaths.add(item.path);
			}
		}
		const focusedPath = state.images[state.selectedIndex]?.item.path ?? selectedItems[0]?.path;
		paneState.selectedPath = focusedPath;
		const anchorPath = state.selectionAnchorIndex !== undefined ? state.images[state.selectionAnchorIndex]?.item.path : undefined;
		paneState.selectionAnchorPath = anchorPath ?? focusedPath;
	}

	private getImageGridTransferItems(state: TurboFileImageGridState): TurboFileFileItem[] {
		const selected = this.getImageGridSelectedImages(state)
			.map(({ image }) => image.item)
			.filter(item => !!item.path && !item.parent);
		if (selected.length) {
			return selected;
		}
		const focused = state.images[state.selectedIndex]?.item;
		return focused?.path && !focused.parent ? [focused] : [];
	}

	private registerImageGridDropTarget(body: HTMLElement, state: TurboFileImageGridState): void {
		body.classList.toggle('is-external-drop-target', this.externalDropTargetSide === state.side);
		body.addEventListener('dragover', event => {
			const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.nativeDragSession?.sourceSide;
			if (sourceSide && sourceSide !== state.side) {
				this.consumeTurboFileDropEvent(event);
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = getTurboFileDropEffect(this.getDragOperationFromEvent(event, sourceSide));
				}
				this.setExternalDropTargetSide(undefined);
				return;
			}
			if (this.hasExternalDropData(event)) {
				this.consumeTurboFileDropEvent(event);
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = getTurboFileDropEffect(this.getDragOperationFromEvent(event, state.side));
				}
				this.setExternalDropTargetSide(state.side);
				return;
			}
			this.setExternalDropTargetSide(undefined);
		});
		body.addEventListener('dragleave', event => {
			const relatedTarget = event.relatedTarget;
			if (relatedTarget instanceof Node && body.contains(relatedTarget)) {
				return;
			}
			this.setExternalDropTargetSide(undefined);
		});
		body.addEventListener('drop', event => {
			const initiatedAt = Date.now();
			this.consumeTurboFileDropEvent(event);
			this.setExternalDropTargetSide(undefined);
			const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.nativeDragSession?.sourceSide;
			const operation = this.getDragOperationFromEvent(event, sourceSide || state.side);
			if (this.nativeDragSession && sourceSide) {
				if (sourceSide !== state.side) {
					this.recordNativeInternalDrop({ kind: 'pane', side: state.side, initiatedAt });
				}
				return;
			}
			const externalPaths = this.extractExternalDropPaths(event);
			this.clearCurrentFileDragState();
			if (externalPaths.length) {
				this.deferAfterDrag(() => {
					void this.transferExternalPaths(state.side, externalPaths, operation, initiatedAt);
					this.clearCurrentFileDragState();
				});
			}
		});
	}

	private getOppositeSide(side: 'left' | 'right'): 'left' | 'right' {
		return side === 'left' ? 'right' : 'left';
	}

	private getImageGridCardSize(state: TurboFileImageGridState, image: TurboFileImageGridImage): ITurboFileImageGridCardSize {
		return getTurboFileImageGridCardSize({ width: image.width, height: image.height }, state.thumbnailScale, this.getImageGridBaseCardWidth(state), this.getImageGridBasePreviewHeight(state), this.getImageGridCardVerticalChrome(), IMAGE_GRID_CARD_INLINE_CHROME);
	}

	private applyImageGridCardPreviewSize(preview: HTMLElement, size: ITurboFileImageGridCardSize): void {
		preview.style.width = `${Math.max(1, size.cardWidth - IMAGE_GRID_CARD_INLINE_CHROME)}px`;
		preview.style.height = `${Math.max(1, size.rowHeight - this.getImageGridCardVerticalChrome())}px`;
	}

	private getImageGridCardVerticalChrome(): number {
		return this.shouldShowImageGridNames() ? IMAGE_GRID_CARD_VERTICAL_CHROME : IMAGE_GRID_CARD_VERTICAL_CHROME_WITHOUT_NAME;
	}

	private applyImageGridCardImageSize(image: HTMLImageElement, size: ITurboFileImageGridCardSize): void {
		// Fill the preview box (object-fit: cover handles the crop); the box itself is already sized to
		// the card's aspect-clamped dimensions, so we don't pin the image to its raw pixel size — that is
		// what turned extreme-aspect images into slivers.
		void size;
		image.style.width = '100%';
		image.style.height = '100%';
	}

	private appendImageGridCardChrome(preview: HTMLElement, image: TurboFileImageGridImage, index: number): void {
		if (!this.shouldShowImageGridHoverInfo()) {
			return;
		}
		const info = $('.turbofile-image-page-card-info');

		const indexLabel = $('span.turbofile-image-page-card-index');
		indexLabel.textContent = String(index + 1);
		info.appendChild(indexLabel);

		const dimensions = $('span.turbofile-image-page-card-dimensions');
		const dimensionsLabel = this.getImageGridCardDimensionsLabel(image);
		dimensions.textContent = dimensionsLabel;
		if (!dimensionsLabel) {
			dimensions.classList.add('is-empty');
		}
		info.appendChild(dimensions);
		preview.appendChild(info);
	}

	private getImageGridCardDimensionsLabel(image: TurboFileImageGridImage): string {
		return formatTurboFileImageDimensions(image, '×');
	}

	private renderImagePreviewOverlay(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): HTMLElement {
		const overlay = $('.turbofile-image-preview-overlay');
		if (!state?.previewVisible) {
			return overlay;
		}

		this.setActiveImageGridState(state);
		overlay.tabIndex = -1;
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', 'Image preview');
		overlay.addEventListener('wheel', event => this.handleImagePreviewWheel(event, state));
		overlay.addEventListener('click', event => {
			if (event.target === overlay) {
				this.closeImageGridPreview(state);
			}
		});
		overlay.addEventListener('keydown', event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				this.closeImageGridPreview(state);
			} else if (event.key === 'ArrowLeft') {
				event.preventDefault();
				this.moveImageGridPreview(-1, state);
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				this.moveImageGridPreview(1, state);
			}
		});

		const dismiss = $('button.turbofile-image-preview-dismiss') as HTMLButtonElement;
		dismiss.type = 'button';
		dismiss.setAttribute('aria-label', '关闭预览');
		dismiss.addEventListener('click', () => this.closeImageGridPreview(state));
		overlay.appendChild(dismiss);

		const stage = $('.turbofile-image-preview-stage');
		this.renderImagePreviewStageContent(stage, state);
		overlay.appendChild(stage);

		const toolbar = $('.turbofile-image-preview-toolbar');
		const pixelInspector = this.renderImagePreviewTopAction(Codicon.symbolColor, 'RGB 像素检查', () => this.toggleImagePreviewPixelInspector(state), state.pixelInspectorVisible);
		pixelInspector.dataset.turbofilePreviewToggle = 'pixel-inspector';
		toolbar.appendChild(pixelInspector);
		const losslessSampling = this.renderImagePreviewTopAction(Codicon.symbolRuler, '无损像素缩放', () => this.toggleImagePreviewSamplingMode(state), state.previewSamplingMode === 'lossless');
		losslessSampling.dataset.turbofilePreviewToggle = 'lossless-sampling';
		toolbar.appendChild(losslessSampling);
		const histogram = this.renderImagePreviewTopAction(Codicon.graphLine, '直方图', () => this.toggleImagePreviewHistogram(state), state.histogramVisible);
		histogram.dataset.turbofilePreviewToggle = 'histogram';
		toolbar.appendChild(histogram);
		toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.download, '下载图片', () => { void this.downloadImageGridPreview(state); }));
		toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.trash, '删除图片', () => { void this.deleteImageGridPreview(state); }));
		toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.close, '关闭', () => this.closeImageGridPreview(state)));
		overlay.appendChild(toolbar);

		if (state.histogramVisible) {
			overlay.appendChild(this.renderImagePreviewHistogramPanel(state));
		}

		overlay.appendChild(this.renderImagePreviewSideButton(state, -1));
		overlay.appendChild(this.renderImagePreviewSideButton(state, 1));

		const footer = $('.turbofile-image-preview-footer');
		footer.appendChild(this.renderImagePreviewZoomControls(state));
		footer.appendChild(this.renderImagePreviewInfoStrip(state));
		overlay.appendChild(footer);

		const navigation = $('.turbofile-image-preview-navigation');
		const previous = $('button.turbofile-image-preview-nav-button') as HTMLButtonElement;
		previous.type = 'button';
		previous.appendChild(renderIcon(Codicon.chevronLeft));
		previous.addEventListener('click', () => this.moveImageGridPreview(-1, state));
		navigation.appendChild(previous);

		const next = $('button.turbofile-image-preview-nav-button') as HTMLButtonElement;
		next.type = 'button';
		next.appendChild(renderIcon(Codicon.chevronRight));
		next.addEventListener('click', () => this.moveImageGridPreview(1, state));
		navigation.appendChild(next);
		overlay.appendChild(navigation);
		getWindow(overlay).requestAnimationFrame(() => {
			if (overlay.isConnected) {
				overlay.focus({ preventScroll: true });
			}
		});
		return overlay;
	}

	private renderImagePreviewTopAction(icon: ThemeIcon, label: string, handler: () => void, active = false): HTMLButtonElement {
		const button = $('button.turbofile-image-preview-action') as HTMLButtonElement;
		button.type = 'button';
		button.title = label;
		button.setAttribute('aria-label', label);
		if (active) {
			button.classList.add('is-active');
			button.setAttribute('aria-pressed', 'true');
		}
		button.appendChild(renderIcon(icon));
		button.addEventListener('click', event => {
			event.stopPropagation();
			handler();
		});
		return button;
	}

	private renderImagePreviewZoomControls(state: TurboFileImageGridState): HTMLElement {
		const controls = $('.turbofile-image-preview-zoom-controls');
		controls.setAttribute('role', 'group');
		controls.setAttribute('aria-label', 'Zoom controls');

		const zoomOut = this.renderImagePreviewTopAction(Codicon.zoomOut, '缩小', () => this.zoomImagePreviewByOculanteStep(-IMAGE_PREVIEW_BUTTON_ZOOM_DELTA, state));
		zoomOut.classList.add('is-transient');
		zoomOut.disabled = state.previewZoom <= IMAGE_PREVIEW_ZOOM_MIN;
		controls.appendChild(zoomOut);

		const value = $('button.turbofile-image-preview-zoom-value') as HTMLButtonElement;
		value.type = 'button';
		value.disabled = true;
		value.textContent = this.getImagePreviewZoomLabel(state);
		controls.appendChild(value);

		const zoomIn = this.renderImagePreviewTopAction(Codicon.zoomIn, '放大', () => this.zoomImagePreviewByOculanteStep(IMAGE_PREVIEW_BUTTON_ZOOM_DELTA, state));
		zoomIn.classList.add('is-transient');
		zoomIn.disabled = state.previewZoom >= IMAGE_PREVIEW_ZOOM_MAX;
		controls.appendChild(zoomIn);

		const reset = this.renderImagePreviewTopAction(Codicon.screenNormal, '适应窗口', () => this.resetImagePreviewView(state));
		reset.classList.add('is-reset');
		reset.disabled = state.previewFitPending;
		controls.appendChild(reset);
		return controls;
	}

	private renderImagePreviewInfoStrip(state: TurboFileImageGridState): HTMLElement {
		const info = $('.turbofile-image-preview-caption.turbofile-image-preview-info-strip');
		this.renderImagePreviewInfoStripContent(info, state);
		return info;
	}

	private renderImagePreviewHistogramPanel(state: TurboFileImageGridState): HTMLElement {
		const panel = $('.turbofile-image-preview-histogram');
		panel.style.left = `${state.histogramX}px`;
		panel.style.top = `${state.histogramY}px`;

		const header = $('.turbofile-image-preview-histogram-header');
		header.append('Histogram');
		const close = $('button.turbofile-image-preview-histogram-close') as HTMLButtonElement;
		close.type = 'button';
		close.title = '关闭直方图';
		close.setAttribute('aria-label', '关闭直方图');
		close.appendChild(renderIcon(Codicon.close));
		close.addEventListener('click', event => {
			event.stopPropagation();
			this.toggleImagePreviewHistogram(state);
		});
		header.appendChild(close);
		this.attachImagePreviewHistogramDrag(panel, state);
		panel.appendChild(header);

		const canvas = document.createElement('canvas');
		canvas.className = 'turbofile-image-preview-histogram-canvas';
		canvas.width = 260;
		canvas.height = 130;
		panel.appendChild(canvas);

		const selected = state.images[state.selectedIndex];
		const src = this.getImagePreviewSource(selected);
		const analysis = selected && src ? this.prepareImagePreviewAnalysis(selected, src) : undefined;
		this.drawImagePreviewHistogram(canvas, analysis);
		return panel;
	}

	private renderImagePreviewInfoStripContent(info: HTMLElement, state: TurboFileImageGridState): void {
		clearNode(info);
		info.setAttribute('aria-label', this.getImagePreviewCaption(state));
		const image = state.images[state.selectedIndex];
		if (!image) {
			return;
		}

		const index = $('span.turbofile-image-preview-info-index');
		index.textContent = `${state.selectedIndex + 1} / ${state.images.length}`;
		info.appendChild(index);

		const name = $('span.turbofile-image-preview-info-name');
		name.textContent = image.item.name;
		info.appendChild(name);

		const dimensions = $('span.turbofile-image-preview-info-dimensions');
		dimensions.textContent = formatTurboFileImageDimensions(image) || (image.previewLoading ? 'Loading original' : 'Original image');
		info.appendChild(dimensions);
	}

	private renderImagePreviewSideButton(state: TurboFileImageGridState, delta: -1 | 1): HTMLElement {
		const button = $('button.turbofile-image-preview-side') as HTMLButtonElement;
		button.type = 'button';
		button.classList.add(delta < 0 ? 'is-left' : 'is-right');
		const targetIndex = state.selectedIndex + delta;
		const image = state.images[targetIndex];
		button.disabled = !image;
		if (image) {
			const src = this.getImagePreviewThumbnailSource(image);
			if (src) {
				const thumb = document.createElement('img');
				thumb.src = src;
				thumb.alt = image.item.name;
				button.appendChild(thumb);
			}
		}
		const icon = $('span.turbofile-image-preview-side-icon');
		icon.appendChild(renderIcon(delta < 0 ? Codicon.chevronLeft : Codicon.chevronRight));
		button.appendChild(icon);
		button.addEventListener('click', () => this.moveImageGridPreview(delta, state));
		return button;
	}

	private renderImagePreviewStageContent(stage: HTMLElement, state: TurboFileImageGridState): void {
		clearNode(stage);
		const selected = state.images[state.selectedIndex];
		const previewSrc = this.getImagePreviewSource(selected);
		if (selected && previewSrc && this.isImagePreviewDecoded(selected, previewSrc)) {
			const figure = $('.turbofile-image-preview-figure');
			figure.setAttribute('role', 'img');
			figure.setAttribute('aria-label', selected.item.name);
			if (state.pixelInspectorVisible) {
				figure.classList.add('is-pixel-inspector');
			}
			this.appendImagePreviewCanvas(figure, selected, previewSrc, state);
			figure.addEventListener('pointerdown', event => this.handleImagePreviewPointerDown(event, state));
			figure.addEventListener('contextmenu', event => this.showPreviewImageContextMenu(event));
			if (state.pixelInspectorVisible) {
				this.attachImagePreviewPixelInspector(stage, figure, selected, previewSrc);
			}
			stage.appendChild(figure);
			this.renderImagePreviewCanvas(state);
			return;
		}
		// While the full-resolution original is still loading/decoding, show the grid thumbnail (already
		// in memory) immediately so the preview feels instant — the sharp original swaps in on a later
		// re-render once decoded. This mirrors how the web gallery shows a thumbnail then sharpens.
		const interimSrc = selected && !selected.previewError ? this.getImagePreviewThumbnailSource(selected) : '';
		if (selected && interimSrc) {
			const figure = $('.turbofile-image-preview-figure.is-preview-interim');
			figure.setAttribute('role', 'img');
			figure.setAttribute('aria-label', selected.item.name);
			const interim = document.createElement('img');
			interim.className = 'turbofile-image-preview-interim';
			interim.src = interimSrc;
			interim.alt = selected.item.name;
			interim.draggable = false;
			figure.appendChild(interim);
			stage.appendChild(figure);
			return;
		}

		const placeholder = $('.turbofile-image-preview-placeholder');
		placeholder.appendChild(renderIcon(Codicon.fileMedia));
		placeholder.append(selected?.previewError ?? (selected?.previewLoading || previewSrc ? 'Loading image...' : 'Preparing image...'));
		stage.appendChild(placeholder);
	}

	private getImagePreviewSource(image: TurboFileImageGridImage | undefined): string {
		return this.getImagePreviewFullSource(image);
	}

	private getImagePreviewFullSource(image: TurboFileImageGridImage | undefined): string {
		return image?.previewUrl
			|| (image?.previewContent ? `data:${image.previewMime};base64,${image.previewContent}` : '');
	}

	private getImagePreviewThumbnailSource(image: TurboFileImageGridImage | undefined): string {
		return image?.thumbnailUrl
			|| (image?.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : '')
			|| this.getImagePreviewFullSource(image);
	}

	private getImagePreviewKey(image: TurboFileImageGridImage, src: string): string {
		return `${image.item.path ?? image.item.name}|${src}`;
	}

	private isImagePreviewDecoded(image: TurboFileImageGridImage, src: string): boolean {
		return !!image.previewImage && image.previewImageKey === this.getImagePreviewKey(image, src);
	}

	private appendImagePreviewCanvas(figure: HTMLElement, image: TurboFileImageGridImage, src: string, state: TurboFileImageGridState): void {
		const ownerDocument = figure.ownerDocument;
		const canvas = ownerDocument.createElement('canvas');
		canvas.className = 'turbofile-image-preview-canvas';
		canvas.setAttribute('aria-label', image.item.name);
		figure.appendChild(canvas);
		this.prepareImagePreviewRender(image, src, canvas, state);
	}

	private prepareImagePreviewRender(image: TurboFileImageGridImage, src: string, canvas: HTMLCanvasElement, state: TurboFileImageGridState): TurboFileImagePreviewRender | undefined {
		const context = canvas.getContext('2d');
		if (!context) {
			return undefined;
		}

		const key = this.getImagePreviewKey(image, src);
		const current = this.imagePreviewRender;
		if (current?.key === key) {
			current.canvas = canvas;
			current.context = context;
			this.observeImagePreviewCanvas(canvas, state);
			this.queueImagePreviewCanvasRender(state);
			return current;
		}

		const decodedImage = image.previewImageKey === key ? image.previewImage : undefined;
		state.previewFitPending = true;
		const render: TurboFileImagePreviewRender = {
			key,
			canvas,
			context,
			image: decodedImage,
			width: Math.max(1, decodedImage?.naturalWidth || image.width || 1),
			height: Math.max(1, decodedImage?.naturalHeight || image.height || 1),
			ready: !!decodedImage,
			requestSeq: ++this.imagePreviewRenderSeq
		};
		this.imagePreviewRender = render;
		this.observeImagePreviewCanvas(canvas, state);
		this.queueImagePreviewCanvasRender(state);
		if (decodedImage) {
			return render;
		}

		const loader = new Image();
		loader.decoding = 'async';
		loader.onload = () => {
			if (this.imagePreviewRender !== render || render.requestSeq !== this.imagePreviewRenderSeq) {
				return;
			}
			render.image = loader;
			render.width = Math.max(1, loader.naturalWidth || image.width || 1);
			render.height = Math.max(1, loader.naturalHeight || image.height || 1);
			render.ready = true;
			image.previewImage = loader;
			image.previewImageKey = key;
			image.previewDecodeFailures = 0;
			image.width = render.width;
			image.height = render.height;
			this.renderImagePreviewCanvas(state);
		};
		loader.onerror = () => {
			if (this.imagePreviewRender === render) {
				render.ready = false;
				this.renderImagePreviewCanvas(state);
			}
		};
		loader.src = src;
		return render;
	}

	private async ensureImagePreviewElementLoaded(state: TurboFileImageGridState, index: number): Promise<boolean> {
		const image = state.images[index];
		const src = this.getImagePreviewSource(image);
		if (!image || !src) {
			return false;
		}

		const key = this.getImagePreviewKey(image, src);
		if (this.isImagePreviewDecoded(image, src)) {
			return true;
		}

		if (!image.previewImageLoading || image.previewImageLoadingKey !== key) {
			const loader = new Image();
			loader.decoding = 'async';
			image.previewImageLoadingKey = key;
			image.previewImageLoading = this.loadImagePreviewElement(loader, src);
		}

		const loading = image.previewImageLoading;
		if (!loading) {
			return false;
		}

		try {
			const loader = await loading;
			const currentIndex = state.images.indexOf(image);
			if (!this.isImageGridSurfaceActive(state) || currentIndex < 0 || image.previewImageLoadingKey !== key || !this.shouldKeepImageGridPreview(state, currentIndex)) {
				return false;
			}
			image.previewImage = loader;
			image.previewImageKey = key;
			image.previewDecodeFailures = 0;
			image.width = Math.max(1, loader.naturalWidth || image.width || 1);
			image.height = Math.max(1, loader.naturalHeight || image.height || 1);
			return true;
		} catch (error) {
			const currentIndex = state.images.indexOf(image);
			if (this.isImageGridSurfaceActive(state) && currentIndex >= 0 && this.shouldKeepImageGridPreview(state, currentIndex)) {
				if (!this.retryImageGridPreviewAfterDecodeFailure(state, currentIndex, image)) {
					image.previewError = error instanceof Error ? error.message : String(error);
				}
			}
			return false;
		} finally {
			this.clearImagePreviewElementLoadingState(image, key);
		}
	}

	private retryImageGridPreviewAfterDecodeFailure(state: TurboFileImageGridState, index: number, image: TurboFileImageGridImage): boolean {
		const hadPreviewSource = !!(image.previewUrl || image.previewContent);
		if (!hadPreviewSource) {
			return false;
		}
		image.previewDecodeFailures = (image.previewDecodeFailures ?? 0) + 1;
		if (image.previewDecodeFailures > IMAGE_GRID_DECODE_RETRY_LIMIT) {
			return false;
		}

		this.releaseImageBlobUrl(image.previewUrl);
		image.previewUrl = undefined;
		image.previewContent = '';
		image.previewError = undefined;
		image.previewLoading = false;
		image.previewImage = undefined;
		image.previewImageKey = undefined;
		image.previewImageLoading = undefined;
		image.previewImageLoadingKey = undefined;
		state.loadedPreviewIndexes.delete(index);
		this.updateImagePreviewOverlay(state);
		setTimeout(() => {
			const currentIndex = state.images.indexOf(image);
			if (this.isImageGridSurfaceActive(state) && currentIndex >= 0 && this.shouldKeepImageGridPreview(state, currentIndex)) {
				void this.ensureImageGridPreviewLoaded(state, currentIndex, this.imageGridPreviewRequestSeq);
			}
		}, IMAGE_GRID_TRANSIENT_RETRY_DELAY_MS);
		return true;
	}

	private loadImagePreviewElement(loader: HTMLImageElement, src: string): Promise<HTMLImageElement> {
		return this.withImagePreviewElementLoadTimeout(loader, src);
	}

	private withImagePreviewElementLoadTimeout(loader: HTMLImageElement, src: string): Promise<HTMLImageElement> {
		return withTurboFileTimeout(new Promise<HTMLImageElement>((resolve, reject) => {
			let retries = 0;
			loader.onload = async () => {
				try {
					await loader.decode?.();
				} catch {
					// Some formats resolve onload but reject decode; the loaded element can still be drawn.
				}
				resolve(loader);
			};
			loader.onerror = () => {
				if (retries < 1) {
					retries++;
					setTimeout(() => {
						loader.src = src;
					}, 180);
					return;
				}
				reject(new Error('Failed to load image'));
			};
			loader.src = src;
		}), IMAGE_PREVIEW_ELEMENT_LOAD_TIMEOUT_MS, 'Image preview load timed out').catch(error => {
			loader.onload = null;
			loader.onerror = null;
			loader.src = '';
			throw error;
		});
	}

	private clearImagePreviewElementLoadingState(image: TurboFileImageGridImage, key: string): void {
		if (image.previewImageLoadingKey !== key) {
			return;
		}
		image.previewImageLoading = undefined;
		image.previewImageLoadingKey = undefined;
	}

	private observeImagePreviewCanvas(canvas: HTMLCanvasElement, state: TurboFileImageGridState = this.getActiveImageGridPreviewState() ?? this.imageGridState!): void {
		this.imagePreviewResizeObserver?.disconnect();
		if (typeof ResizeObserver === 'undefined') {
			return;
		}
		this.imagePreviewResizeObserver = new ResizeObserver(() => this.renderImagePreviewCanvas(state));
		this.imagePreviewResizeObserver.observe(canvas);
	}

	private queueImagePreviewCanvasRender(state: TurboFileImageGridState = this.getActiveImageGridPreviewState() ?? this.imageGridState!): void {
		const canvas = this.imagePreviewRender?.canvas;
		const ownerWindow = canvas ? getWindow(canvas) : getWindow(this.container ?? document.body);
		ownerWindow.requestAnimationFrame(() => this.renderImagePreviewCanvas(state));
	}

	private renderImagePreviewCanvas(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		const render = this.imagePreviewRender;
		if (!state?.previewVisible || !render) {
			return;
		}

		const rect = render.canvas.getBoundingClientRect();
		const cssWidth = Math.max(1, rect.width);
		const cssHeight = Math.max(1, rect.height);
		const ownerWindow = getWindow(render.canvas);
		const dpr = Math.max(1, ownerWindow.devicePixelRatio || 1);
		const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
		const backingHeight = Math.max(1, Math.round(cssHeight * dpr));
		if (render.canvas.width !== backingWidth || render.canvas.height !== backingHeight) {
			render.canvas.width = backingWidth;
			render.canvas.height = backingHeight;
		}

		render.context.setTransform(dpr, 0, 0, dpr, 0, 0);
		render.context.clearRect(0, 0, cssWidth, cssHeight);
		if (!render.ready || !render.image) {
			this.updateImagePreviewZoomValue(state);
			return;
		}

		if (state.previewFitPending) {
			this.resetImagePreviewViewToFit(state, render, cssWidth, cssHeight);
		}

		this.limitImagePreviewOffset(state, render, cssWidth, cssHeight);
		const shouldSmooth = state.previewSamplingMode === 'smooth';
		render.context.imageSmoothingEnabled = shouldSmooth;
		render.context.imageSmoothingQuality = 'low';
		const draw = this.getImagePreviewDrawRects(state, render, cssWidth, cssHeight);
		if (draw) {
			render.context.drawImage(render.image, draw.sourceX, draw.sourceY, draw.sourceWidth, draw.sourceHeight, draw.destX, draw.destY, draw.destWidth, draw.destHeight);
		}
		this.updateImagePreviewZoomValue(state);
	}

	private getImagePreviewDrawRects(state: TurboFileImageGridState, render: TurboFileImagePreviewRender, viewportWidth: number, viewportHeight: number): TurboFileImagePreviewDrawRects | undefined {
		const scale = Math.max(IMAGE_PREVIEW_ZOOM_MIN, state.previewZoom);
		const scaledWidth = render.width * scale;
		const scaledHeight = render.height * scale;
		const imageLeft = state.previewPanX;
		const imageTop = state.previewPanY;
		const imageRight = imageLeft + scaledWidth;
		const imageBottom = imageTop + scaledHeight;
		const destX = Math.max(0, imageLeft);
		const destY = Math.max(0, imageTop);
		const destRight = Math.min(viewportWidth, imageRight);
		const destBottom = Math.min(viewportHeight, imageBottom);
		const destWidth = destRight - destX;
		const destHeight = destBottom - destY;
		if (destWidth <= 0 || destHeight <= 0) {
			return undefined;
		}

		return {
			sourceX: (destX - imageLeft) / scale,
			sourceY: (destY - imageTop) / scale,
			sourceWidth: destWidth / scale,
			sourceHeight: destHeight / scale,
			destX,
			destY,
			destWidth,
			destHeight
		};
	}

	private resetImagePreviewViewToFit(state: TurboFileImageGridState, render: TurboFileImagePreviewRender, viewportWidth: number, viewportHeight: number): void {
		const fitScale = Math.min(viewportWidth / render.width, viewportHeight / render.height);
		const scale = Math.min(Math.max(IMAGE_PREVIEW_ZOOM_MIN, fitScale), 1);
		state.previewZoom = scale;
		state.previewPanX = (viewportWidth - render.width * scale) / 2;
		state.previewPanY = (viewportHeight - render.height * scale) / 2;
		state.previewFitPending = false;
	}

	private limitImagePreviewOffset(state: TurboFileImageGridState, render: TurboFileImagePreviewRender, viewportWidth?: number, viewportHeight?: number): void {
		const rect = render.canvas.getBoundingClientRect();
		const width = Math.max(1, viewportWidth ?? rect.width);
		const height = Math.max(1, viewportHeight ?? rect.height);
		const scaledWidth = render.width * state.previewZoom;
		const scaledHeight = render.height * state.previewZoom;
		state.previewPanX = scaledWidth <= width
			? (width - scaledWidth) / 2
			: Math.min(0, Math.max(width - scaledWidth, state.previewPanX));
		state.previewPanY = scaledHeight <= height
			? (height - scaledHeight) / 2
			: Math.min(0, Math.max(height - scaledHeight, state.previewPanY));
	}

	private handleImagePreviewWheel(event: WheelEvent, state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		event.preventDefault();
		event.stopPropagation();
		const render = this.imagePreviewRender;
		if (!state?.previewVisible || !render?.ready) {
			return;
		}
		this.setActiveImageGridState(state);
		const wheelDelta = Math.max(-IMAGE_PREVIEW_WHEEL_DELTA_LIMIT, Math.min(IMAGE_PREVIEW_WHEEL_DELTA_LIMIT, -event.deltaY / IMAGE_PREVIEW_WHEEL_DIVISOR));
		const scaleDelta = wheelDelta * state.previewZoom * IMAGE_PREVIEW_ZOOM_RATIO;
		this.setImageGridPreviewZoom(state.previewZoom + scaleDelta, undefined, state);
	}

	private handleImagePreviewPointerDown(event: PointerEvent, state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		if (event.button !== 0) {
			return;
		}
		const render = this.imagePreviewRender;
		if (!state?.previewVisible || !render?.ready) {
			return;
		}
		this.setActiveImageGridState(state);

		event.preventDefault();
		event.stopPropagation();
		const figure = event.currentTarget as HTMLElement;
		figure.setPointerCapture(event.pointerId);
		const startX = event.clientX;
		const startY = event.clientY;
		const initialPanX = state.previewPanX;
		const initialPanY = state.previewPanY;
		const move = (moveEvent: PointerEvent) => {
			state.previewPanX = initialPanX + moveEvent.clientX - startX;
			state.previewPanY = initialPanY + moveEvent.clientY - startY;
			state.previewFitPending = false;
			this.limitImagePreviewOffset(state, render);
			this.renderImagePreviewCanvas(state);
		};
		const end = (endEvent: PointerEvent) => {
			figure.removeEventListener('pointermove', move);
			figure.removeEventListener('pointerup', end);
			figure.removeEventListener('pointercancel', end);
			if (figure.hasPointerCapture(endEvent.pointerId)) {
				figure.releasePointerCapture(endEvent.pointerId);
			}
		};
		figure.addEventListener('pointermove', move);
		figure.addEventListener('pointerup', end);
		figure.addEventListener('pointercancel', end);
	}

	private attachImagePreviewPixelInspector(stage: HTMLElement, figure: HTMLElement, image: TurboFileImageGridImage, src: string): void {
		if (figure.dataset.turbofilePixelInspectorAttached === 'true') {
			return;
		}
		const tooltip = $('.turbofile-image-preview-pixel-tooltip');
		tooltip.textContent = 'Loading RGB...';
		stage.appendChild(tooltip);
		figure.dataset.turbofilePixelInspectorAttached = 'true';
		this.prepareImagePreviewAnalysis(image, src);
		figure.addEventListener('mousemove', event => {
			if (figure.dataset.turbofilePixelInspectorAttached !== 'true') {
				tooltip.classList.remove('is-visible');
				return;
			}
			this.updateImagePreviewPixelTooltip(event, stage, tooltip, image, src);
		});
		figure.addEventListener('mouseleave', () => {
			tooltip.classList.remove('is-visible');
		});
	}

	private updateImagePreviewPixelTooltip(event: MouseEvent, stage: HTMLElement, tooltip: HTMLElement, image: TurboFileImageGridImage, src: string): void {
		const figure = event.currentTarget as HTMLElement | null;
		const state = this.getActiveImageGridPreviewState();
		if (!state?.pixelInspectorVisible || figure?.dataset.turbofilePixelInspectorAttached !== 'true' || !figure.classList.contains('is-pixel-inspector')) {
			tooltip.classList.remove('is-visible');
			return;
		}
		const render = this.imagePreviewRender;
		const analysis = this.prepareImagePreviewAnalysis(image, src);
		if (!render || !analysis) {
			return;
		}

		const canvasRect = render.canvas.getBoundingClientRect();
		const stageRect = stage.getBoundingClientRect();
		const draw = this.getImagePreviewDrawRects(state, render, canvasRect.width, canvasRect.height);
		if (!draw) {
			tooltip.classList.remove('is-visible');
			return;
		}
		const imageX = draw.sourceX + (event.clientX - canvasRect.left - draw.destX) * (draw.sourceWidth / draw.destWidth);
		const imageY = draw.sourceY + (event.clientY - canvasRect.top - draw.destY) * (draw.sourceHeight / draw.destHeight);
		const x = Math.max(0, Math.min(Math.max(0, analysis.width - 1), Math.floor(imageX)));
		const y = Math.max(0, Math.min(Math.max(0, analysis.height - 1), Math.floor(imageY)));
		tooltip.style.left = `${event.clientX - stageRect.left + 12}px`;
		tooltip.style.top = `${event.clientY - stageRect.top + 12}px`;
		tooltip.classList.add('is-visible');
		if (!analysis.ready) {
			tooltip.textContent = `X: ${x}, Y: ${y}\nLoading RGB...`;
			return;
		}

		const pixel = analysis.context.getImageData(x, y, 1, 1).data;
		const r = pixel[0];
		const g = pixel[1];
		const b = pixel[2];
		tooltip.textContent = `X: ${x}, Y: ${y}\nRGB (${r}, ${g}, ${b})\nHSV (${this.toHsvColor(r, g, b)})`;
	}

	private toHsvColor(r: number, g: number, b: number): string {
		const red = r / 255;
		const green = g / 255;
		const blue = b / 255;
		const max = Math.max(red, green, blue);
		const min = Math.min(red, green, blue);
		const delta = max - min;
		let hue = 0;
		if (delta !== 0) {
			if (max === red) {
				hue = ((green - blue) / delta) % 6;
			} else if (max === green) {
				hue = (blue - red) / delta + 2;
			} else {
				hue = (red - green) / delta + 4;
			}
			hue *= 60;
			if (hue < 0) {
				hue += 360;
			}
		}

		const saturation = max === 0 ? 0 : (delta / max) * 100;
		const value = max * 100;
		return `${Math.round(hue)}°, ${Math.round(saturation)}%, ${Math.round(value)}%`;
	}

	private prepareImagePreviewAnalysis(image: TurboFileImageGridImage, src: string): TurboFileImagePreviewAnalysis | undefined {
		const ownerDocument = this.container?.ownerDocument ?? document;
		const key = this.getImagePreviewKey(image, src);
		if (this.imagePreviewAnalysis?.key === key) {
			return this.imagePreviewAnalysis;
		}

		const canvas = ownerDocument.createElement('canvas');
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) {
			return undefined;
		}
		const analysis: TurboFileImagePreviewAnalysis = {
			key,
			canvas,
			context,
			width: Math.max(1, image.width ?? 1),
			height: Math.max(1, image.height ?? 1),
			ready: false
		};
		this.imagePreviewAnalysis = analysis;

		const loader = new Image();
		loader.decoding = 'async';
		loader.onload = () => {
			if (this.imagePreviewAnalysis !== analysis) {
				return;
			}
			analysis.width = Math.max(1, loader.naturalWidth || image.width || 1);
			analysis.height = Math.max(1, loader.naturalHeight || image.height || 1);
			canvas.width = analysis.width;
			canvas.height = analysis.height;
			try {
				context.clearRect(0, 0, analysis.width, analysis.height);
				context.drawImage(loader, 0, 0, analysis.width, analysis.height);
				analysis.ready = true;
			} catch {
				analysis.ready = false;
			}
			this.updateImagePreviewHistogramCanvas();
		};
		loader.src = src;
		return analysis;
	}

	private drawImagePreviewHistogram(canvas: HTMLCanvasElement, analysis: TurboFileImagePreviewAnalysis | undefined): void {
		const context = canvas.getContext('2d');
		if (!context) {
			return;
		}
		const width = canvas.width;
		const height = canvas.height;
		context.clearRect(0, 0, width, height);
		context.fillStyle = '#808080';
		context.fillRect(0, 0, width, height);
		context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
		for (let x = 0; x <= 5; x++) {
			const lineX = Math.round((x / 5) * width) + 0.5;
			context.beginPath();
			context.moveTo(lineX, 0);
			context.lineTo(lineX, height);
			context.stroke();
		}
		if (!analysis?.ready) {
			context.fillStyle = '#ffffff';
			context.font = '12px Archivo, Segoe UI, sans-serif';
			context.fillText('Loading histogram...', 12, 24);
			return;
		}

		const data = analysis.context.getImageData(0, 0, analysis.width, analysis.height).data;
		const red = new Uint32Array(256);
		const green = new Uint32Array(256);
		const blue = new Uint32Array(256);
		for (let offset = 0; offset < data.length; offset += 4) {
			red[data[offset]]++;
			green[data[offset + 1]]++;
			blue[data[offset + 2]]++;
		}
		const max = Math.max(1, ...Array.from(red), ...Array.from(green), ...Array.from(blue));
		this.drawImagePreviewHistogramChannel(context, red, max, width, height, 'rgba(255, 0, 32, 0.86)');
		this.drawImagePreviewHistogramChannel(context, green, max, width, height, 'rgba(0, 235, 74, 0.76)');
		this.drawImagePreviewHistogramChannel(context, blue, max, width, height, 'rgba(0, 46, 255, 0.82)');
	}

	private drawImagePreviewHistogramChannel(context: CanvasRenderingContext2D, bins: Uint32Array, max: number, width: number, height: number, color: string): void {
		context.beginPath();
		context.moveTo(0, height);
		for (let index = 0; index < bins.length; index++) {
			const x = (index / (bins.length - 1)) * width;
			const y = height - (bins[index] / max) * (height - 6);
			context.lineTo(x, y);
		}
		context.lineTo(width, height);
		context.closePath();
		context.fillStyle = color;
		context.fill();
	}

	private updateImagePreviewHistogramCanvas(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		const canvas = this.container?.querySelector<HTMLCanvasElement>('.turbofile-image-preview-histogram-canvas');
		if (canvas) {
			const selected = state?.images[state.selectedIndex];
			const src = this.getImagePreviewSource(selected);
			const analysis = selected && src ? this.prepareImagePreviewAnalysis(selected, src) : undefined;
			this.drawImagePreviewHistogram(canvas, analysis);
		}
	}

	private attachImagePreviewHistogramDrag(panel: HTMLElement, state: TurboFileImageGridState): void {
		panel.addEventListener('pointerdown', event => {
			if ((event.target as HTMLElement).closest('button')) {
				return;
			}
			event.preventDefault();
			const ownerWindow = getWindow(panel);
			const startX = event.clientX;
			const startY = event.clientY;
			const initialX = state.histogramX;
			const initialY = state.histogramY;
			panel.setPointerCapture(event.pointerId);
			const move = (moveEvent: PointerEvent) => {
				state.histogramX = Math.max(8, initialX + moveEvent.clientX - startX);
				state.histogramY = Math.max(8, initialY + moveEvent.clientY - startY);
				panel.style.left = `${state.histogramX}px`;
				panel.style.top = `${state.histogramY}px`;
			};
			const up = (upEvent: PointerEvent) => {
				ownerWindow.removeEventListener('pointermove', move);
				ownerWindow.removeEventListener('pointerup', up);
				ownerWindow.removeEventListener('pointercancel', up);
				if (panel.hasPointerCapture(upEvent.pointerId)) {
					panel.releasePointerCapture(upEvent.pointerId);
				}
			};
			ownerWindow.addEventListener('pointermove', move);
			ownerWindow.addEventListener('pointerup', up);
			ownerWindow.addEventListener('pointercancel', up);
		});
	}

	private updateImagePreviewOverlay(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		if (!state?.previewVisible || !this.container) {
			return;
		}
		this.setActiveImageGridState(state);
		const stage = this.container.querySelector<HTMLElement>('.turbofile-image-preview-stage');
		if (stage) {
			this.renderImagePreviewStageContent(stage, state);
		}
		const caption = this.container.querySelector<HTMLElement>('.turbofile-image-preview-caption');
		if (caption) {
			this.renderImagePreviewInfoStripContent(caption, state);
		}
		const zoomValue = this.container.querySelector<HTMLButtonElement>('.turbofile-image-preview-zoom-value');
		if (zoomValue) {
			zoomValue.textContent = this.getImagePreviewZoomLabel(state);
		}
		if (state.histogramVisible) {
			this.updateImagePreviewHistogramCanvas(state);
		}
		this.updateImagePreviewSideButtons(state);
	}

	private updateImagePreviewSideButtons(state: TurboFileImageGridState): void {
		const overlay = this.container?.querySelector<HTMLElement>('.turbofile-image-preview-overlay');
		if (!overlay || this.getActiveImageGridPreviewState() !== state || !state.previewVisible) {
			return;
		}
		for (const button of Array.from(overlay.querySelectorAll('.turbofile-image-preview-side'))) {
			button.remove();
		}
		overlay.appendChild(this.renderImagePreviewSideButton(state, -1));
		overlay.appendChild(this.renderImagePreviewSideButton(state, 1));
	}

	private updateImagePreviewToggleButton(toggle: string, active: boolean): void {
		const button = this.container?.querySelector<HTMLButtonElement>(`.turbofile-image-preview-action[data-turbofile-preview-toggle="${toggle}"]`);
		if (!button) {
			return;
		}
		button.classList.toggle('is-active', active);
		if (active) {
			button.setAttribute('aria-pressed', 'true');
		} else {
			button.removeAttribute('aria-pressed');
		}
	}

	private updateImagePreviewPixelInspectorInPlace(state: TurboFileImageGridState): void {
		const stage = this.container?.querySelector<HTMLElement>('.turbofile-image-preview-stage');
		const figure = stage?.querySelector<HTMLElement>('.turbofile-image-preview-figure');
		if (!stage || !figure) {
			return;
		}

		figure.classList.toggle('is-pixel-inspector', state.pixelInspectorVisible);
		const tooltip = stage.querySelector<HTMLElement>('.turbofile-image-preview-pixel-tooltip');
		if (!state.pixelInspectorVisible) {
			delete figure.dataset.turbofilePixelInspectorAttached;
			tooltip?.remove();
			return;
		}

		const selected = state.images[state.selectedIndex];
		const previewSrc = this.getImagePreviewSource(selected);
		if (selected && previewSrc) {
			this.attachImagePreviewPixelInspector(stage, figure, selected, previewSrc);
		}
	}

	private updateImagePreviewHistogramInPlace(state: TurboFileImageGridState): void {
		const overlay = this.container?.querySelector<HTMLElement>('.turbofile-image-preview-overlay');
		const panel = overlay?.querySelector<HTMLElement>('.turbofile-image-preview-histogram');
		if (!overlay) {
			return;
		}
		if (!state.histogramVisible) {
			panel?.remove();
			return;
		}
		if (panel) {
			this.updateImagePreviewHistogramCanvas(state);
			return;
		}
		overlay.appendChild(this.renderImagePreviewHistogramPanel(state));
	}

	private renderSyncPreviewOverlay(): HTMLElement {
		const state = this.syncPreviewState;
		const overlay = $('.turbofile-sync-overlay');
		const panel = $('.turbofile-sync-panel');
		if (!state) {
			return overlay;
		}

		const totalPlan = state.plan.map((_, index) => this.getSyncPreviewStep(state, index));
		const selectedPlan = this.getSelectedSyncPlan(state);
		const totalStats = this.getSyncPlanStats(totalPlan);
		const selectedStats = this.getSyncPlanStats(selectedPlan);

		const header = $('.turbofile-sync-header');
		const title = $('.turbofile-sync-title');
		title.appendChild(renderIcon(Codicon.sync));
		title.append('同步预览');
		header.appendChild(title);

		const headerActions = $('.turbofile-sync-header-actions');
		const close = this.createIconButton(Codicon.close, '取消同步', 'turbofile-toolbar-button');
		close.element.addEventListener('click', () => this.resolveSyncPreview(undefined));
		headerActions.appendChild(close.element);
		header.appendChild(headerActions);
		panel.appendChild(header);

		const summary = $('.turbofile-sync-summary');
		const mode = state.plan.some(step => step.recursive) ? '选中目录递归差异同步' : '当前列表轻量同步';
		summary.appendChild(this.renderSyncSummaryMetric('模式', mode));
		summary.appendChild(this.renderSyncSummaryMetric('已选择', `${selectedPlan.length} / ${state.plan.length} 项`));
		summary.appendChild(this.renderSyncSummaryMetric('大小', formatSize(selectedStats.bytes)));
		summary.appendChild(this.renderSyncSummaryMetric('新增', `${selectedStats.missing} / ${totalStats.missing}`));
		summary.appendChild(this.renderSyncSummaryMetric('较新', `${selectedStats.newer} / ${totalStats.newer}`));
		summary.appendChild(this.renderSyncSummaryMetric('大小不同', `${selectedStats.size} / ${totalStats.size}`));
		summary.appendChild(this.renderSyncSummaryMetric('方向', `${selectedStats.leftToRight} 左->右 / ${selectedStats.rightToLeft} 右->左`));
		panel.appendChild(summary);

		const toolbar = $('.turbofile-sync-toolbar');
		const hint = $('.turbofile-sync-hint');
		hint.textContent = '冲突项可逐条切换方向，也可以用规则按钮批量决定方向。';
		toolbar.appendChild(hint);

		const directionActions = $('.turbofile-sync-direction-actions');
		const hasReversibleItems = state.plan.some(step => !!step.reverse);
		const autoDirection = this.createButton('自动方向', 'turbofile-secondary-button');
		autoDirection.element.disabled = !hasReversibleItems || state.reversedIndexes.size === 0;
		autoDirection.element.addEventListener('click', () => this.setSyncConflictDirection(state, 'auto'));
		directionActions.appendChild(autoDirection.element);

		const leftToRight = this.createButton('冲突左->右', 'turbofile-secondary-button');
		leftToRight.element.disabled = !hasReversibleItems;
		leftToRight.element.addEventListener('click', () => this.setSyncConflictDirection(state, 'left-to-right'));
		directionActions.appendChild(leftToRight.element);

		const rightToLeft = this.createButton('冲突右->左', 'turbofile-secondary-button');
		rightToLeft.element.disabled = !hasReversibleItems;
		rightToLeft.element.addEventListener('click', () => this.setSyncConflictDirection(state, 'right-to-left'));
		directionActions.appendChild(rightToLeft.element);
		toolbar.appendChild(directionActions);

		const selectAll = this.createButton('全选', 'turbofile-secondary-button');
		selectAll.element.addEventListener('click', () => {
			state.selectedIndexes.clear();
			for (let index = 0; index < state.plan.length; index++) {
				state.selectedIndexes.add(index);
			}
			this.render();
		});
		toolbar.appendChild(selectAll.element);

		const clearAll = this.createButton('清空', 'turbofile-secondary-button');
		clearAll.element.addEventListener('click', () => {
			state.selectedIndexes.clear();
			this.render();
		});
		toolbar.appendChild(clearAll.element);

		const start = this.createButton(`开始同步 ${selectedPlan.length} 项`, 'turbofile-primary-button');
		start.element.disabled = selectedPlan.length === 0;
		start.element.addEventListener('click', () => this.resolveSyncPreview(selectedPlan));
		toolbar.appendChild(start.element);
		panel.appendChild(toolbar);

		const list = $('.turbofile-sync-list');
		for (const [index] of state.plan.entries()) {
			list.appendChild(this.renderSyncPreviewRow(state, this.getSyncPreviewStep(state, index), index));
		}
		panel.appendChild(list);

		overlay.appendChild(panel);
		return overlay;
	}

	private renderSyncSummaryMetric(label: string, value: string): HTMLElement {
		const metric = $('.turbofile-sync-summary-metric');
		const labelElement = $('span');
		labelElement.textContent = label;
		const valueElement = $('strong');
		valueElement.textContent = value;
		metric.appendChild(labelElement);
		metric.appendChild(valueElement);
		return metric;
	}

	private renderSyncPreviewRow(state: TurboFileSyncPreviewState, step: TurboFileSyncPlanItem, index: number): HTMLElement {
		const originalStep = state.plan[index];
		const row = $('.turbofile-sync-row');
		const checked = state.selectedIndexes.has(index);
		if (!checked) {
			row.classList.add('is-skipped');
		}
		if (state.reversedIndexes.has(index)) {
			row.classList.add('is-reversed');
		}

		const setChecked = (value: boolean): void => {
			if (value) {
				state.selectedIndexes.add(index);
			} else {
				state.selectedIndexes.delete(index);
			}
			this.render();
		};
		row.addEventListener('click', event => {
			const target = event.target;
			if (target instanceof HTMLInputElement || (target instanceof HTMLElement && target.closest('button'))) {
				return;
			}
			setChecked(!state.selectedIndexes.has(index));
		});

		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = checked;
		checkbox.className = 'turbofile-sync-checkbox';
		checkbox.addEventListener('change', event => {
			event.stopPropagation();
			setChecked(checkbox.checked);
		});
		row.appendChild(checkbox);

		const direction = document.createElement('button');
		direction.type = 'button';
		direction.className = 'turbofile-sync-direction';
		direction.disabled = !originalStep.reverse;
		direction.title = originalStep.reverse ? '切换同步方向' : '缺失项无法切换方向';
		if (state.reversedIndexes.has(index)) {
			direction.classList.add('is-reversed');
		}
		if (originalStep.reverse) {
			direction.appendChild(renderIcon(Codicon.arrowSwap));
		}
		direction.append(this.getSyncDirectionLabel(step));
		direction.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			if (!originalStep.reverse) {
				return;
			}
			if (state.reversedIndexes.has(index)) {
				state.reversedIndexes.delete(index);
			} else {
				state.reversedIndexes.add(index);
			}
			this.render();
		});
		row.appendChild(direction);

		const reason = $('.turbofile-sync-reason');
		reason.textContent = this.getSyncReasonLabel(step.reason);
		reason.classList.add(`is-${step.reason}`);
		row.appendChild(reason);

		const path = $('.turbofile-sync-path');
		path.title = step.relativePath;
		path.textContent = step.relativePath;
		row.appendChild(path);

		const meta = $('.turbofile-sync-meta');
		const size = step.item.directory ? '目录' : formatSize(step.item.rawSize);
		meta.textContent = `${size} · ${step.item.modified || '未知时间'}`;
		row.appendChild(meta);
		return row;
	}

	private getSelectedSyncPlan(state: TurboFileSyncPreviewState): TurboFileSyncPlanItem[] {
		const selectedPlan: TurboFileSyncPlanItem[] = [];
		for (const [index] of state.plan.entries()) {
			if (state.selectedIndexes.has(index)) {
				selectedPlan.push(this.getSyncPreviewStep(state, index));
			}
		}
		return selectedPlan;
	}

	private getSyncPreviewStep(state: TurboFileSyncPreviewState, index: number): TurboFileSyncPlanItem {
		const step = state.plan[index];
		if (state.reversedIndexes.has(index) && step.reverse) {
			return {
				...step,
				sourceSide: step.reverse.sourceSide,
				targetSide: step.reverse.targetSide,
				item: step.reverse.item,
				targetPath: step.reverse.targetPath
			};
		}
		return step;
	}

	private setSyncConflictDirection(state: TurboFileSyncPreviewState, direction: 'auto' | 'left-to-right' | 'right-to-left'): void {
		if (direction === 'auto') {
			state.reversedIndexes.clear();
			this.render();
			return;
		}

		for (const [index, step] of state.plan.entries()) {
			if (!step.reverse) {
				continue;
			}
			if (this.matchesSyncDirection(step, direction)) {
				state.reversedIndexes.delete(index);
			} else if (this.matchesSyncDirection(step.reverse, direction)) {
				state.reversedIndexes.add(index);
			}
		}
		this.render();
	}

	private matchesSyncDirection(step: TurboFileSyncPlanDirection, direction: 'left-to-right' | 'right-to-left'): boolean {
		return direction === 'left-to-right'
			? step.sourceSide === 'left' && step.targetSide === 'right'
			: step.sourceSide === 'right' && step.targetSide === 'left';
	}

	private getSyncPlanStats(plan: TurboFileSyncPlanItem[]): { missing: number; newer: number; size: number; bytes: number; leftToRight: number; rightToLeft: number } {
		let missing = 0;
		let newer = 0;
		let size = 0;
		let bytes = 0;
		let leftToRight = 0;
		let rightToLeft = 0;
		for (const step of plan) {
			if (step.reason === 'missing') {
				missing++;
			} else if (step.reason === 'newer') {
				newer++;
			} else {
				size++;
			}
			bytes += step.item.directory ? 0 : step.item.rawSize;
			if (step.sourceSide === 'left' && step.targetSide === 'right') {
				leftToRight++;
			} else if (step.sourceSide === 'right' && step.targetSide === 'left') {
				rightToLeft++;
			}
		}
		return { missing, newer, size, bytes, leftToRight, rightToLeft };
	}

	private resolveSyncPreview(plan: TurboFileSyncPlanItem[] | undefined): void {
		const state = this.syncPreviewState;
		this.syncPreviewState = undefined;
		state?.resolve(plan);
		this.render();
	}

	private togglePaneMaximized(side: 'left' | 'right'): void {
		this.maximizedPane = this.maximizedPane === side ? undefined : side;
		this.fileListRenderedRange.left = undefined;
		this.fileListRenderedRange.right = undefined;
		this.render();
	}

	private appendPaneSortButton(parent: HTMLElement, side: 'left' | 'right', iconColor?: TurboFileIconColor): void {
		const state = this.paneStates[side];
		const button = document.createElement('button');
		button.className = 'turbofile-toolbar-button turbofile-sort-button';
		button.title = `排序：${this.getPaneSortLabel(state.sortKey)}，${this.getPaneSortDirectionLabel(state.sortDirection)}`;
		button.setAttribute('aria-label', button.title);
		button.appendChild(renderTurboFileSortIcon(iconColor));
		button.addEventListener('click', event => this.showPaneSortMenu(side, event));
		parent.appendChild(button);
	}

	private getCurrentDragOperation(side: 'left' | 'right'): TurboFileDragOperation {
		return this.currentInput?.getDragOperation(side) ?? 'copy';
	}

	private getDragOperationFromEvent(event: DragEvent, fallbackSide: 'left' | 'right'): TurboFileDragOperation {
		const fallback = this.nativeDragSession?.operation ?? this.getCurrentDragOperation(fallbackSide);
		return resolveTurboFileDragOperation(event.dataTransfer?.getData('application/x-turbofile-operation'), fallback);
	}

	private appendDragOperationButton(parent: HTMLElement, side: 'left' | 'right'): void {
		const operation = this.getCurrentDragOperation(side);
		const isMove = operation === 'move';
		const label = isMove
			? localize('turbofile.dragMode.move.label', '剪切')
			: localize('turbofile.dragMode.copy.label', '复制');
		const button = $('button.turbofile-toolbar-button.turbofile-drag-operation-button') as HTMLButtonElement;
		button.classList.add(isMove ? 'is-move' : 'is-copy');
		button.title = label;
		button.setAttribute('aria-label', label);
		button.appendChild($('span.turbofile-drag-operation-icon', undefined, label));
		button.addEventListener('click', () => {
			this.currentInput?.toggleDragOperation(side);
			this.render();
		});
		parent.appendChild(button);
	}

	private appendToolbarButton(parent: HTMLElement, icon: ThemeIcon, title: string, handler?: () => void, turboIcon?: TurboFileBootstrapIcon, iconColor?: TurboFileIconColor): void {
		const button = document.createElement('button');
		button.className = 'turbofile-toolbar-button';
		button.title = title;
		button.setAttribute('aria-label', title);
		button.appendChild(turboIcon ? renderTurboFileIcon(turboIcon, iconColor) : renderIcon(icon));
		if (handler) {
			button.addEventListener('click', handler);
		}
		parent.appendChild(button);
	}

	private appendRecycleBinButton(parent: HTMLElement, side: 'left' | 'right'): void {
		const state = this.paneStates[side];
		const button = document.createElement('button');
		button.className = 'turbofile-toolbar-button turbofile-recycle-bin-button';
		button.title = localize('turbofile.openRecycleBin', "打开当前设备回收站");
		button.setAttribute('aria-label', button.title);
		const icon = document.createElement('img');
		icon.className = 'turbofile-recycle-bin-icon';
		icon.src = getTurboFileRecycleBinIcon(state.trashHasItems);
		icon.alt = '';
		icon.draggable = false;
		button.appendChild(icon);
		button.addEventListener('click', () => { void this.toggleTrashView(side); });
		parent.appendChild(button);
	}

	private createButton(label: string, className: string): { element: HTMLButtonElement; dispose(): void } {
		const element = document.createElement('button');
		element.className = className;
		element.textContent = label;
		return {
			element,
			dispose: () => element.remove()
		};
	}

	private createIconButton(icon: ThemeIcon, title: string, className: string): { element: HTMLButtonElement; dispose(): void } {
		const element = document.createElement('button');
		element.className = className;
		element.title = title;
		element.appendChild(renderIcon(icon));
		return {
			element,
			dispose: () => element.remove()
		};
	}

	private renderDialogOverlay(): HTMLElement {
		const state = this.dialogState;
		const overlay = $('.turbofile-dialog-overlay');
		if (!state) {
			return overlay;
		}

		const panel = $('.turbofile-dialog-panel');
		if (state.danger) {
			panel.classList.add('is-danger');
		}
		const header = $('.turbofile-dialog-header');
		const icon = $('.turbofile-dialog-icon');
		icon.appendChild(renderIcon(state.danger ? Codicon.trash : state.kind === 'prompt' ? Codicon.edit : Codicon.info));
		header.appendChild(icon);
		const copy = $('.turbofile-dialog-copy');
		const title = $('h3');
		title.textContent = state.title;
		const message = $('p');
		message.textContent = state.message;
		copy.appendChild(title);
		copy.appendChild(message);
		if (state.detail) {
			const detail = $('div.turbofile-dialog-detail');
			detail.textContent = state.detail;
			copy.appendChild(detail);
		}
		header.appendChild(copy);
		panel.appendChild(header);

		let input: HTMLInputElement | undefined;
		if (state.kind === 'prompt') {
			input = $('input.turbofile-dialog-input') as HTMLInputElement;
			input.value = state.defaultValue ?? '';
			input.addEventListener('keydown', event => {
				if (event.key === 'Enter') {
					event.preventDefault();
					this.resolveDialog(input?.value);
				} else if (event.key === 'Escape') {
					event.preventDefault();
					this.resolveDialog(undefined);
				}
			});
			panel.appendChild(input);
			getWindow(input).requestAnimationFrame(() => input?.focus());
		}

		const actions = $('.turbofile-dialog-actions');
		if (state.cancelLabel) {
			const cancel = $('button.turbofile-dialog-button.turbofile-dialog-button-secondary') as HTMLButtonElement;
			cancel.type = 'button';
			cancel.textContent = state.cancelLabel;
			cancel.addEventListener('click', () => this.resolveDialog(undefined));
			actions.appendChild(cancel);
		}
		const confirm = $('button.turbofile-dialog-button.turbofile-dialog-button-primary') as HTMLButtonElement;
		confirm.type = 'button';
		confirm.textContent = state.confirmLabel;
		confirm.classList.toggle('is-danger', !!state.danger);
		confirm.addEventListener('click', () => this.resolveDialog(state.kind === 'prompt' ? input?.value : true));
		actions.appendChild(confirm);
		panel.appendChild(actions);
		overlay.appendChild(panel);
		overlay.addEventListener('click', event => {
			if (event.target === overlay) {
				this.resolveDialog(undefined);
			}
		});
		return overlay;
	}

	private showDialogConfirm(title: string, message: string, detail?: string, danger = false, confirmLabel?: string): Promise<boolean> {
		return new Promise(resolve => {
			this.dialogState = {
				kind: 'confirm',
				title,
				message,
				detail,
				danger,
				confirmLabel: confirmLabel ?? (danger ? '删除' : '确定'),
				cancelLabel: '取消',
				resolve: value => resolve(value === true)
			};
			this.render();
		});
	}

	private showDialogPrompt(title: string, message: string, defaultValue = ''): Promise<string | undefined> {
		return new Promise(resolve => {
			this.dialogState = {
				kind: 'prompt',
				title,
				message,
				defaultValue,
				confirmLabel: '确定',
				cancelLabel: '取消',
				resolve: value => resolve(typeof value === 'string' ? value : undefined)
			};
			this.render();
		});
	}

	private showDialogInfo(title: string, message: string, detail?: string, confirmLabel = '知道了'): void {
		this.dialogState = {
			kind: 'info',
			title,
			message,
			detail,
			confirmLabel,
			resolve: () => undefined
		};
		this.render();
	}

	private resolveDialog(value: boolean | string | undefined): void {
		const state = this.dialogState;
		if (!state) {
			return;
		}
		this.dialogState = undefined;
		state.resolve(value);
		this.render();
	}

	private showFileContextMenu(side: 'left' | 'right', item: TurboFileFileItem, event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.setActiveFilePaneSide(side);
		const anchor = new StandardMouseEvent(getWindow(event), event);
		if (item.path) {
			const state = this.paneStates[side];
			if (item.parent || !state.selectedPaths.has(item.path)) {
				this.selectItem(side, item, undefined, false);
				this.statusMessage = item.parent ? '已选择上级目录入口。' : `已选择 ${item.name}。可右键新建、重命名、复制路径、计算大小、解压、压缩或删除。`;
				this.render();
			}
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getFileContextActions(side, item),
			getActionsContext: () => item,
			skipTelemetry: true
		});
	}

	private showPaneContextMenu(side: 'left' | 'right', event: MouseEvent): void {
		event.preventDefault();
		this.setActiveFilePaneSide(side);
		const anchor = new StandardMouseEvent(getWindow(event), event);
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getPaneContextActions(side),
			skipTelemetry: true
		});
	}

	private showPaneSortMenu(side: 'left' | 'right', event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.setActiveFilePaneSide(side);
		const anchor = new StandardMouseEvent(getWindow(event), event);
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getPaneSortActions(side),
			getActionViewItem: (action, options) => action.id.startsWith(`turbofile.sort.${side}.`)
				? new ActionViewItem(null, action, { ...options, icon: true, label: true })
				: undefined,
			skipTelemetry: true
		});
	}

	private showPreviewImageContextMenu(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const anchor = new StandardMouseEvent(getWindow(event), event);
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [
				this.menuAction('turbofile.copyPreviewImage', '复制', Codicon.copy, () => { void this.copyPreviewImageToClipboard(); }, this.canCopyPreviewImage())
			],
			skipTelemetry: true
		});
	}

	private getFileContextActions(side: 'left' | 'right', item: TurboFileFileItem): IAction[] {
		const canOperate = !!item.path && !item.parent;
		const canExtract = canOperate && !item.directory && isArchiveFile(item.name);
		if (item.parent) {
			return this.getPaneContextActions(side);
		}

		const actions: IAction[] = [
			this.menuAction('turbofile.newFolder', '新建文件夹', Codicon.newFolder, () => this.createFolder(side)),
			this.menuAction('turbofile.newFile', '新建文件', Codicon.newFile, () => this.createFile(side)),
			this.menuAction('turbofile.copy', localize('turbofile.copyFiles', "复制"), Codicon.copy, () => this.copySelectedToInternalClipboard(side, 'copy'), canOperate),
			this.menuAction('turbofile.cut', localize('turbofile.cutFiles', "剪切"), Codicon.arrowRight, () => this.copySelectedToInternalClipboard(side, 'move'), canOperate),
			this.menuAction('turbofile.paste', localize('turbofile.pasteFiles', "粘贴"), Codicon.clippy, () => this.pasteIntoPane(side), !this.paneStates[side].trashMode.active),
			this.menuAction('turbofile.rename', '重命名', Codicon.edit, () => this.renameSelected(side), canOperate),
			this.menuAction('turbofile.copyPath', '复制路径', Codicon.copy, () => this.copySelectedPath(side), canOperate),
			this.menuAction('turbofile.calculateSize', '计算大小', Codicon.symbolNumeric, () => this.calculateSelectedSize(side), canOperate)
		];
		if (isTurboFileTrashRootView(this.paneStates[side].trashMode) && item.trashItem) {
			actions.push(this.menuAction('turbofile.trash.restore', localize('turbofile.recycleBinRestore', "还原"), Codicon.discard, () => { void this.restoreSelectedTrashItems(side); }, canOperate));
		}
		actions.push(
			this.menuAction('turbofile.extract', '解压', Codicon.unarchive, () => this.extractSelected(side), canExtract),
			this.menuAction('turbofile.compress', '压缩', Codicon.archive, () => this.compressSelected(side), canOperate),
			this.menuAction('turbofile.delete', '删除', Codicon.trash, () => this.deleteSelected(side), canOperate),
			this.menuAction('turbofile.deletePermanently', localize('turbofile.deletePermanently', "永久删除"), Codicon.trash, () => { void this.permanentlyDeleteSelected(side); }, canOperate)
		);
		return actions;
	}

	private confirmDelete(title: string, message: string, detail?: string, danger = false, confirmLabel?: string): Promise<boolean> {
		if (!this.shouldConfirmBeforeDelete()) {
			return Promise.resolve(true);
		}
		return this.showDialogConfirm(title, message, detail, danger, confirmLabel);
	}

	private getPaneContextActions(side: 'left' | 'right'): IAction[] {
		const actions: IAction[] = [
			this.menuAction('turbofile.newFolder', '新建文件夹', Codicon.newFolder, () => this.createFolder(side)),
			this.menuAction('turbofile.newFile', '新建文件', Codicon.newFile, () => this.createFile(side)),
			this.menuAction('turbofile.paste', localize('turbofile.pasteFiles', "粘贴"), Codicon.clippy, () => this.pasteIntoPane(side), !this.paneStates[side].trashMode.active)
		];
		if (this.paneStates[side].trashMode.active) {
			actions.push(
				this.menuAction('turbofile.trash.back', this.paneStates[side].trashMode.browseItem ? localize('turbofile.recycleBinBackToRoot', "返回回收站") : localize('turbofile.recycleBinBack', "返回"), Codicon.arrowLeft, () => this.paneStates[side].trashMode.browseItem ? this.leaveTrashDirectory(side) : this.leaveTrashView(side)),
				this.menuAction('turbofile.trash.empty', localize('turbofile.recycleBinEmpty', "清空回收站"), Codicon.clearAll, () => { void this.emptyTrash(side); })
			);
		}
		return actions;
	}

	private getPaneSortActions(side: 'left' | 'right'): IAction[] {
		const state = this.paneStates[side];
		return [
			...PANE_SORT_OPTIONS.map(option => this.menuAction(
				`turbofile.sort.${side}.key.${option.key}`,
				option.label,
				'turbofile-sort-action',
				() => this.setPaneSortKey(side, option.key),
				true,
				state.sortKey === option.key
			)),
			new Separator(),
			...PANE_SORT_DIRECTION_OPTIONS.map(option => this.menuAction(
				`turbofile.sort.${side}.direction.${option.direction}`,
				option.label,
				'turbofile-sort-action',
				() => this.setPaneSortDirection(side, option.direction),
				true,
				state.sortDirection === option.direction
			))
		];
	}

	private setPaneSortKey(side: 'left' | 'right', key: TurboFileSortKey): void {
		const state = this.paneStates[side];
		if (state.sortKey === key) {
			return;
		}
		state.sortKey = key;
		this.applyPaneSortChange(side);
	}

	private applyPaneSortChange(side: 'left' | 'right'): void {
		const state = this.paneStates[side];
		// Switching to a size/modified sort on a names-only listing needs the full attributes to
		// sort stably: reload the directory so it comes back already sorted, instead of re-sorting blank
		// rows and then jumping as enrichVisibleRows() fills them in.
		if (this.paneSortNeedsAttributes(side) && state.items.some(item => item.attrsPending)) {
			void this.refreshPane(side, { silent: true });
			return;
		}
		this.resortPaneItems(side);
	}

	private setPaneSortDirection(side: 'left' | 'right', direction: TurboFileSortDirection): void {
		const state = this.paneStates[side];
		if (state.sortDirection === direction) {
			return;
		}
		state.sortDirection = direction;
		this.applyPaneSortChange(side);
	}

	private menuAction(id: string, label: string, icon: ThemeIcon | string, run: () => unknown, enabled = true, checked?: boolean): IAction {
		return toAction({
			id,
			label,
			enabled,
			checked,
			class: typeof icon === 'string' ? icon : ThemeIcon.asClassName(icon),
			run
		});
	}

	private getSideLabel(side: 'left' | 'right'): string {
		return side === 'left' ? '左侧' : '右侧';
	}

	async testCurrentSshConnection(): Promise<void> {
		const target = this.getPaneDevice('right')?.id !== LOCAL_WINDOWS_DEVICE_ID ? this.getPaneDevice('right') : this.devices[0];
		if (!target || target.id === LOCAL_WINDOWS_DEVICE_ID || !this.deviceStore) {
			this.statusMessage = '请先添加或切换到一个 SSH 设备。';
			this.render();
			return;
		}

		const task = this.beginTask('ssh-test', `测试 SSH ${target.name}`, `${target.host}:${target.port || 22}`);
		try {
			const result = await this.sshService.testConnection(await this.getSshConnectionOptions(target));
			if (result.ok) {
				this.finishTask(task, 'success', `SSH 连接成功：${target.name}`);
			} else {
				this.finishTask(task, 'error', `SSH 连接失败：${result.message}`, { error: result.message });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `SSH 连接失败：${message}`, { error: message });
		}
	}

	private async refreshPane(side: 'left' | 'right', options: TurboFileRefreshPaneOptions = {}): Promise<void> {
		const device = this.getPaneDevice(side);
		const state = this.paneStates[side];
		if (!device || !this.deviceStore) {
			return;
		}
		if (state.trashMode.active) {
			await this.refreshTrashPane(side);
			return;
		}

		const targetPath = options.path ?? state.path;
		const requestId = ++this.paneRequestSeq[side];
		const pathChanged = targetPath !== state.path;
		if (pathChanged) {
			this.resetPaneScroll(side);
		}

		state.path = targetPath;
		state.loading = true;
		state.error = undefined;
		if (pathChanged) {
			state.items = [];
			this.clearPaneSelection(side);
		}
		if (!options.silent) {
			this.render();
		}

		try {
			const listing = await this.loadPaneDirectory(device, targetPath, !!options.force, 'foreground', this.paneSortNeedsAttributes(side));

			if (this.paneRequestSeq[side] !== requestId || this.paneStates[side].path !== targetPath) {
				return;
			}

			state.path = listing.path;
			state.items = this.sortPaneItems(side, listing.items);
			state.error = undefined;
			this.setDeviceRuntimeStatus(device, 'online');
			this.rememberPaneDevicePath(side, device, listing.path);
			this.prefetchNeighborDirectories(device, listing.path, listing.items);
			this.clearPaneSelection(side);
			this.statusMessage = `${device.name} 已加载 ${state.items.filter(item => !item.parent).length} 项。`;
			this.rememberPaneDeviceSnapshot(side);
		} catch (error) {
			if (this.paneRequestSeq[side] === requestId) {
				if (await this.recoverMissingPanePath(side, device, targetPath, error, options)) {
					return;
				}
				const message = error instanceof Error ? error.message : String(error);
				state.error = message;
				this.setDeviceRuntimeStatus(device, 'offline');
				this.statusMessage = `${device.name} 目录刷新失败：${message}`;
			}
		} finally {
			if (this.paneRequestSeq[side] === requestId) {
				state.loading = false;
				this.render();
			}
		}
	}

	private async loadPaneDirectory(device: TurboFileDevice, path: string, force: boolean, purpose: TurboFileDirectoryLoadPurpose = 'foreground', needsAttributes = false): Promise<TurboFileDirectoryCacheEntry> {
		const cacheKey = this.getPaneDirectoryCacheKey(device, path);
		const isRemote = device.id !== LOCAL_WINDOWS_DEVICE_ID;
		const loadsAttributes = needsAttributes || (isRemote && purpose === 'foreground');
		const now = Date.now();
		if (!force) {
			const cached = this.paneDirectoryCache.get(cacheKey);
			// A names-only cached listing cannot satisfy a size/modified sort; fall through to a full load.
			if (cached && cached.expiresAt > now && (!loadsAttributes || this.cachedListingHasAttributes(cached))) {
				return cached;
			}
			// An in-flight names-only load likewise cannot be reused when attributes are required.
			if (!loadsAttributes) {
				const inflight = this.paneDirectoryInflight.getReusable(cacheKey, purpose);
				if (inflight) {
					return inflight;
				}
			}
		} else {
			this.paneDirectoryCache.delete(cacheKey);
			this.paneDirectoryInflight.delete(cacheKey);
		}

		let promise!: Promise<TurboFileDirectoryCacheEntry>;
		promise = (async (): Promise<TurboFileDirectoryCacheEntry> => {
			// Foreground remote navigation fetches name, type, size, and modified time in one `find`
			// round trip so the first visible frame is already in its final order. Bounded background
			// neighbor prefetch stays names-only to avoid occupying SSH sessions with speculative work.
			// sort — which genuinely needs those attributes to order correctly — loads the full listing.
			const listing = isRemote
				? (loadsAttributes
					? await this.sshService.listRemoteDirectory(await this.getSshConnectionOptions(device), path, force)
					: await this.sshService.listRemoteDirectoryNames(await this.getSshConnectionOptions(device), path, force))
				: (loadsAttributes
					? await this.sshService.listLocalDirectory(path, force)
					: await this.sshService.listLocalDirectoryNames(path, force));
			this.setDeviceRuntimeStatus(device, 'online');
			const items = this.toFileItems(device, listing.path, listing.entries);
			if (!loadsAttributes) {
				for (const item of items) {
					// A names-only listing carries no modified time (sentinel 0); blank those rows and
					// flag them for lazy enrichment. Rows that already have a real time (e.g. served from
					// a cached full listing) are left intact so their size/date stay visible immediately.
					if (!item.parent && item.rawModified === 0) {
						item.attrsPending = true;
						item.size = '';
						item.modified = '';
					}
				}
			}
			const entry = {
				expiresAt: Date.now() + PANE_DIRECTORY_CACHE_TTL_MS,
				path: listing.path,
				items
			};
			if (this.paneDirectoryInflight.isCurrent(cacheKey, promise)) {
				this.paneDirectoryCache.set(cacheKey, entry);
				this.trimPaneDirectoryCache();
			}
			return entry;
		})();
		this.paneDirectoryInflight.set(cacheKey, purpose, promise);
		return await promise;
	}

	private async recoverMissingPanePath(side: 'left' | 'right', device: TurboFileDevice, missingPath: string, error: unknown, options: TurboFileRefreshPaneOptions): Promise<boolean> {
		if (!this.isMissingPanePathError(error)) {
			return false;
		}

		const fallbackPaths = this.getMissingPanePathFallbacks(device, missingPath);
		this.forgetMissingPanePath(device, missingPath);
		if (!fallbackPaths.length) {
			return false;
		}

		const state = this.paneStates[side];
		state.error = undefined;
		state.items = [];
		this.clearPaneSelection(side);
		this.statusMessage = `${device.name} 鍘熺洰褰曞凡涓嶅瓨鍦紝宸茶嚜鍔ㄥ洖閫€鍒?${fallbackPaths[0]}`;
		await this.refreshPane(side, { ...options, path: fallbackPaths[0], force: true });
		return true;
	}

	private async prefetchDefaultDeviceDirectories(): Promise<void> {
		const devices = this.getAllDevices();
		for (const device of devices) {
			await this.prefetchPaneDeviceDefaultDirectory('left', device);
		}
	}

	private async prefetchPaneDeviceDefaultDirectory(side: 'left' | 'right', device: TurboFileDevice): Promise<void> {
		const path = this.getRememberedPaneDevicePath(side, device) ?? this.getRememberedPaneDevicePath(side === 'left' ? 'right' : 'left', device) ?? this.getDefaultPaneDevicePath(device);
		if (!path || this.getCachedPaneDirectory(device, path)) {
			return;
		}
		const cacheKey = this.getPaneDirectoryCacheKey(device, path);
		if (this.paneDirectoryInflight.has(cacheKey)) {
			return;
		}
		try {
			await this.loadPaneDirectory(device, path, false, 'prefetch');
		} catch {
			// Background warmup must never slow down the visible UI.
		}
	}

	private getCachedPaneDirectory(device: TurboFileDevice, path: string): TurboFileDirectoryCacheEntry | undefined {
		const cacheKey = this.getPaneDirectoryCacheKey(device, path);
		const cached = this.paneDirectoryCache.get(cacheKey);
		if (!cached) {
			return undefined;
		}
		if (cached.expiresAt <= Date.now()) {
			this.paneDirectoryCache.delete(cacheKey);
			return undefined;
		}
		return cached;
	}

	private applyPaneDirectoryEntry(side: 'left' | 'right', device: TurboFileDevice, listing: TurboFileDirectoryCacheEntry): void {
		const state = this.paneStates[side];
		state.path = listing.path;
		state.items = this.sortPaneItems(side, listing.items);
		state.error = undefined;
		state.loading = false;
		this.setDeviceRuntimeStatus(device, 'online');
		this.clearPaneSelection(side);
		this.rememberPaneDevicePath(side, device, listing.path);
		this.rememberPaneDeviceSnapshot(side);
		this.prefetchNeighborDirectories(device, listing.path, listing.items);
		this.statusMessage = `${device.name} 已加载 ${state.items.filter(item => !item.parent).length} 项。`;
	}

	private prefetchPaneDirectory(side: 'left' | 'right', path: string | undefined, intent: 'idle' | 'hover' | 'commit' = 'idle'): void {
		if (!path) {
			return;
		}
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}
		if (intent === 'commit') {
			// The user is clicking this directory: start loading it right away, bypassing the serial
			// prefetch queue, so the data is in flight before the double-click fires.
			this.prefetchPaneDirectoryNow(device, path, this.paneSortNeedsAttributes(side));
			return;
		}
		if (intent === 'hover' && this.paneSortNeedsAttributes(side)) {
			this.prefetchPaneDirectoryNow(device, path, true);
			return;
		}
		this.enqueuePaneDirectoryPrefetch(device, path, intent === 'hover');
	}

	private prefetchPaneDirectoryNow(device: TurboFileDevice, path: string, needsAttributes = false): void {
		const cached = this.getCachedPaneDirectory(device, path);
		if (cached && (!needsAttributes || this.cachedListingHasAttributes(cached))) {
			return;
		}
		const cacheKey = this.getPaneDirectoryCacheKey(device, path);
		if (!needsAttributes && this.paneDirectoryInflight.has(cacheKey)) {
			return;
		}
		void this.loadPaneDirectory(device, path, false, 'prefetch', needsAttributes).catch(() => undefined);
	}

	private prefetchNeighborDirectories(device: TurboFileDevice, currentPath: string, items: TurboFileFileItem[]): void {
		const candidates = [
			getPaneParentPath(currentPath, this.isWindowsDevice(device)),
			...items.filter(item => item.directory && !item.parent && item.path).slice(0, PANE_DIRECTORY_PREFETCH_LIMIT).map(item => item.path)
		].filter((path): path is string => !!path);
		for (const path of candidates) {
			this.enqueuePaneDirectoryPrefetch(device, path);
		}
	}

	private enqueuePaneDirectoryPrefetch(device: TurboFileDevice, path: string, prioritize = false, needsAttributes = false): void {
		const cached = this.getCachedPaneDirectory(device, path);
		if (cached && (!needsAttributes || this.cachedListingHasAttributes(cached))) {
			return;
		}
		const cacheKey = this.getPaneDirectoryCacheKey(device, path);
		if (!needsAttributes && this.paneDirectoryInflight.has(cacheKey)) {
			return;
		}
		this.paneDirectoryPrefetchQueue.enqueue(cacheKey, async () => {
			const queuedCached = this.getCachedPaneDirectory(device, path);
			if ((queuedCached && (!needsAttributes || this.cachedListingHasAttributes(queuedCached))) || (!needsAttributes && this.paneDirectoryInflight.has(cacheKey))) {
				return;
			}
			await this.loadPaneDirectory(device, path, false, 'prefetch', needsAttributes).catch(() => undefined);
		});
		if (prioritize) {
			// The mouse is hovering this directory: move it ahead of queued neighbour prefetches so
			// it is the next one loaded.
			this.paneDirectoryPrefetchQueue.prioritize(cacheKey);
		}
	}

	private getPaneDirectoryCacheKey(device: TurboFileDevice, path: string): string {
		return `${device.id}|${device.host}|${device.port || 0}|${device.username}|${device.authType ?? ''}|${path}`;
	}

	private invalidatePaneDirectoryCaches(device: TurboFileDevice, paths: readonly string[]): void {
		const keys = new Set(paths.map(path => this.getPaneDirectoryCacheKey(device, path)));
		for (const key of keys) {
			this.paneDirectoryCache.delete(key);
			this.paneDirectoryInflight.delete(key);
		}
	}

	private isMissingPanePathError(error: unknown): boolean {
		const message = error instanceof Error ? error.message : String(error);
		return /no such file|no such file or directory|file not found|path not found|enoent/i.test(message);
	}

	private getMissingPanePathFallbacks(device: TurboFileDevice, missingPath: string): string[] {
		const windowsPath = this.isWindowsDevice(device);
		const fallbackPaths: string[] = [];
		const addFallback = (path: string | undefined) => {
			if (!path) {
				return;
			}
			const exists = windowsPath
				? fallbackPaths.some(candidate => isSameWindowsPath(candidate, path))
				: fallbackPaths.includes(path);
			if (!exists) {
				fallbackPaths.push(path);
			}
		};

		let currentPath = missingPath;
		for (let depth = 0; depth < 16; depth++) {
			const parentPath = getPaneParentPath(currentPath, windowsPath);
			if (!parentPath) {
				break;
			}
			addFallback(parentPath);
			currentPath = parentPath;
		}

		addFallback(this.getDefaultPaneDevicePath(device));
		if (!windowsPath) {
			addFallback('/');
		}
		return fallbackPaths;
	}

	private forgetMissingPanePath(device: TurboFileDevice, missingPath: string): void {
		for (const side of ['left', 'right'] as const) {
			const rememberedPath = this.getRememberedPaneDevicePath(side, device);
			if (this.isPanePathMatch(device, rememberedPath, missingPath)) {
				this.storageService.remove(this.getPaneDevicePathStorageKey(side, device), StorageScope.PROFILE);
			}

			const snapshotKey = this.getPaneDeviceMemoryKey(side, device);
			const snapshot = this.paneDeviceSnapshots.get(snapshotKey);
			if (snapshot && this.isPanePathMatch(device, snapshot.path, missingPath)) {
				this.paneDeviceSnapshots.delete(snapshotKey);
			}
		}

		const cacheKey = this.getPaneDirectoryCacheKey(device, missingPath);
		this.paneDirectoryCache.delete(cacheKey);
		this.paneDirectoryInflight.delete(cacheKey);
	}

	private isPanePathMatch(device: TurboFileDevice, left: string | undefined, right: string | undefined): boolean {
		if (!left || !right) {
			return false;
		}
		return this.isWindowsDevice(device) ? isSameWindowsPath(left, right) : left === right;
	}

	private clearPaneDirectoryCachesForDevice(deviceId: string): void {
		for (const key of Array.from(this.paneDirectoryCache.keys())) {
			if (key.startsWith(`${deviceId}|`)) {
				this.paneDirectoryCache.delete(key);
			}
		}
		for (const key of Array.from(this.paneDirectoryInflight.keys())) {
			if (key.startsWith(`${deviceId}|`)) {
				this.paneDirectoryInflight.delete(key);
			}
		}
		for (const key of Array.from(this.paneDeviceSnapshots.keys())) {
			if (key.endsWith(`|${deviceId}`)) {
				this.paneDeviceSnapshots.delete(key);
			}
		}
	}

	private trimPaneDirectoryCache(): void {
		while (this.paneDirectoryCache.size > PANE_DIRECTORY_CACHE_MAX_ENTRIES) {
			const firstKey = this.paneDirectoryCache.keys().next().value;
			if (!firstKey) {
				return;
			}
			this.paneDirectoryCache.delete(firstKey);
		}
	}

	private selectItem(side: 'left' | 'right', item: TurboFileFileItem, event?: MouseEvent, shouldRender = true): void {
		if (!item.path) {
			return;
		}

		const state = this.paneStates[side];
		const isToggle = !!event && (event.ctrlKey || event.metaKey);
		const isRange = !!event?.shiftKey && !!state.selectionAnchorPath && !item.parent;

		if (isRange) {
			const anchorIndex = state.items.findIndex(candidate => candidate.path === state.selectionAnchorPath);
			const itemIndex = state.items.findIndex(candidate => candidate.path === item.path);
			if (anchorIndex >= 0 && itemIndex >= 0) {
				state.selectedPaths.clear();
				const start = Math.min(anchorIndex, itemIndex);
				const end = Math.max(anchorIndex, itemIndex);
				for (let index = start; index <= end; index++) {
					const candidate = state.items[index];
					if (candidate.path && !candidate.parent) {
						state.selectedPaths.add(candidate.path);
					}
				}
				state.selectedPath = item.path;
			} else {
				this.setSingleSelection(side, item);
			}
		} else if (isToggle && !item.parent) {
			if (state.selectedPaths.has(item.path)) {
				state.selectedPaths.delete(item.path);
				if (state.selectedPath === item.path) {
					state.selectedPath = this.getLastSelectedPath(side);
				}
			} else {
				state.selectedPaths.add(item.path);
				state.selectedPath = item.path;
			}
			state.selectionAnchorPath = item.path;
			if (!state.selectedPaths.size) {
				state.selectedPath = undefined;
			}
		} else {
			this.setSingleSelection(side, item);
		}

		const selectedItems = this.getSelectedTransferItems(side);
		if (selectedItems.length > 1) {
			this.statusMessage = `${this.getSideLabel(side)}已选择 ${selectedItems.length} 项。可批量复制、剪切或删除。`;
		} else if (!item.parent) {
			this.statusMessage = `${this.getSideLabel(side)}已选择：${item.name}`;
		}
		if (shouldRender) {
			this.render();
		}
	}

	private selectAllPaneItems(side: 'left' | 'right'): void {
		this.setActiveFilePaneSide(side);
		const state = this.paneStates[side];
		const selectablePaths = state.items
			.filter(item => !!item.path && !item.parent)
			.map(item => item.path!);

		state.selectedPaths.clear();
		for (const path of selectablePaths) {
			state.selectedPaths.add(path);
		}

		const focusedPath = state.selectedPath && state.selectedPaths.has(state.selectedPath)
			? state.selectedPath
			: selectablePaths[0];
		state.selectedPath = focusedPath;
		state.selectionAnchorPath = focusedPath;
		this.statusMessage = selectablePaths.length
			? `${this.getSideLabel(side)}已全选 ${selectablePaths.length} 项。`
			: `${this.getSideLabel(side)}当前目录暂无可选项目。`;
		this.render();
	}

	private isEditableKeyboardTarget(target: EventTarget | null): boolean {
		const element = target instanceof HTMLElement ? target : undefined;
		if (!element) {
			return false;
		}
		return element.isContentEditable || !!element.closest('input, textarea, select, [contenteditable="true"]');
	}

	private updateRenderedSelection(side: 'left' | 'right'): void {
		const pane = this.container?.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${side}"]`);
		if (!pane) {
			return;
		}

		const state = this.paneStates[side];
		for (const row of pane.querySelectorAll<HTMLElement>('.turbofile-file-row')) {
			const path = row.dataset.turbofilePath;
			row.classList.toggle('is-selected', !!path && state.selectedPaths.has(path));
		}
		const count = pane.querySelector<HTMLElement>('.turbofile-browser-item-count');
		if (count) {
			this.updatePaneItemCountElement(side, count);
		}
		this.updatePaneSelectionBadge(side, pane);

		const meta = this.container?.querySelector<HTMLElement>('.turbofile-task-meta');
		if (meta && !this.tasks[0]) {
			meta.textContent = this.statusMessage;
		}
		this.refreshTaskbar();
	}

	private updatePaneSelectionBadge(side: 'left' | 'right', pane: HTMLElement): void {
		const pathbar = pane.querySelector<HTMLElement>('.turbofile-pathbar');
		if (!pathbar) {
			return;
		}

		const selectedCount = this.getSelectedTransferItems(side).length;
		let selectionCount = pathbar.querySelector<HTMLElement>('.turbofile-selection-count');
		if (selectedCount <= 1) {
			selectionCount?.remove();
			return;
		}

		if (!selectionCount) {
			selectionCount = $('.turbofile-selection-count');
			pathbar.appendChild(selectionCount);
		}
		selectionCount.textContent = `已选 ${selectedCount} 项`;
	}

	private updatePaneItemCountElement(side: 'left' | 'right', element: HTMLElement): void {
		const selected = this.getPaneSelectedItemCount(side);
		const total = this.getPaneItemCount(side);
		element.textContent = `${selected} / ${total}`;
		element.title = `已选择 ${selected} / 共 ${total} 项`;
	}

	private getPaneSelectedItemCount(side: 'left' | 'right'): number {
		return Math.min(this.paneStates[side].selectedPaths.size, this.getPaneItemCount(side));
	}

	private getPaneItemCount(side: 'left' | 'right'): number {
		const items = this.paneStates[side].items;
		return Math.max(0, items.length - (items[0]?.parent ? 1 : 0));
	}

	private async openItem(side: 'left' | 'right', item: TurboFileFileItem): Promise<void> {
		if (!item.path) {
			return;
		}
		if (isTurboFileTrashRootView(this.paneStates[side].trashMode)) {
			await this.openTrashItem(side, item);
			return;
		}

		if (item.directory || item.parent) {
			if (this.paneStates[side].trashMode.browseItem) {
				await this.navigateTrashBrowseDirectory(side, item.path);
			} else {
				await this.navigatePaneDirectory(side, item.path);
			}
			return;
		}

		await this.previewSelected(side, item);
	}

	private createTransferTaskItem(item: TurboFileFileItem): TurboFileTaskTransferItem {
		const knownSize = item.directory ? 0 : Math.max(0, item.rawSize);
		const displaySize = item.directory && knownSize === 0 ? '' : item.size;
		return {
			name: item.name,
			type: item.type,
			displaySize,
			rawSize: knownSize,
			status: 'waiting',
			progress: 0,
			transferredBytes: 0,
			totalBytes: knownSize,
			speedBytesPerSecond: 0,
			speedSamples: []
		};
	}

	private async ensureTransferItemSize(device: TurboFileDevice, sourceItem: TurboFileFileItem, transferItem: TurboFileTaskTransferItem, task: TurboFileTask, options: { skipDirectorySize?: boolean } = {}): Promise<void> {
		if (!sourceItem.path || sourceItem.parent) {
			return;
		}

		if (!sourceItem.directory) {
			const size = Math.max(0, sourceItem.rawSize);
			transferItem.rawSize = size;
			transferItem.totalBytes = Math.max(transferItem.totalBytes, size);
			transferItem.displaySize = formatSize(size);
			return;
		}

		if (transferItem.rawSize > 0) {
			transferItem.displaySize = formatSize(transferItem.rawSize);
			transferItem.totalBytes = Math.max(transferItem.totalBytes, transferItem.rawSize);
			return;
		}

		if (options.skipDirectorySize) {
			transferItem.displaySize = '';
			transferItem.totalBytes = Math.max(transferItem.totalBytes, 0);
			return;
		}

		this.updateTask(task, `正在计算目录大小：${sourceItem.name}`, Math.max(10, task.progress), false);
		const result = await this.sshService.calculatePathSize(await this.toTransferEndpoint(device, sourceItem.path), { progressId: task.progressId });
		if (!result.ok) {
			transferItem.displaySize = '';
			return;
		}

		const size = Math.max(0, result.size);
		transferItem.rawSize = size;
		transferItem.totalBytes = Math.max(transferItem.totalBytes, size);
		transferItem.displaySize = size > 0 ? formatSize(size) : '';
	}

	private setExternalDropTargetSide(side: 'left' | 'right' | undefined): void {
		if (this.externalDropTargetSide === side) {
			return;
		}

		this.externalDropTargetSide = side;
		for (const candidate of ['left', 'right'] as const) {
			this.getPaneFileListElement(candidate)?.classList.toggle('is-external-drop-target', side === candidate);
			this.getPaneImageGridBodyElement(candidate)?.classList.toggle('is-external-drop-target', side === candidate);
		}
	}

	private getPaneFileListElement(side: 'left' | 'right'): HTMLElement | undefined {
		return this.container?.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`) ?? undefined;
	}

	private getPaneImageGridBodyElement(side: 'left' | 'right'): HTMLElement | undefined {
		return this.container?.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-image-page-body`) ?? undefined;
	}

	private getImageGridRootElement(state: TurboFileImageGridState): HTMLElement | undefined {
		if (!this.container) {
			return undefined;
		}
		if (state.displayMode === 'pane') {
			return this.container.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${state.side}"] .turbofile-image-page`) ?? undefined;
		}
		return this.container.querySelector<HTMLElement>('.turbofile-editor-content > .turbofile-image-page') ?? this.container.querySelector<HTMLElement>('.turbofile-image-page:not(.is-pane-mode)') ?? undefined;
	}

	private getImageGridBodyElement(state: TurboFileImageGridState): HTMLElement | undefined {
		return this.getImageGridRootElement(state)?.querySelector<HTMLElement>('.turbofile-image-page-body') ?? undefined;
	}

	private hasExternalDropData(event: DragEvent): boolean {
		const dataTransfer = event.dataTransfer;
		if (!dataTransfer) {
			return false;
		}

		// During `dragover` the browser withholds getData() and an empty files list for security, so the
		// only reliable signals that an OS file/folder is being dragged are the type list and the item
		// kinds. Check both (case-insensitively) plus the on-drop signals, so an external drag is
		// detected the whole time and never falls through to the workbench's open-file behaviour.
		const types = Array.from(dataTransfer.types || []);
		if (types.some(type => type === DataTransfers.FILES || type.toLowerCase() === 'files')) {
			return true;
		}
		if (dataTransfer.items && Array.from(dataTransfer.items).some(item => item.kind === 'file')) {
			return true;
		}
		if (dataTransfer.files && dataTransfer.files.length > 0) {
			return true;
		}
		return !!dataTransfer.getData(CodeDataTransfers.FILES) || !!dataTransfer.getData(DataTransfers.RESOURCES);
	}

	private extractExternalDropPaths(event: DragEvent): string[] {
		const dataTransfer = event.dataTransfer;
		if (!dataTransfer) {
			return [];
		}

		const paths: string[] = [];
		const seen = new Set<string>();
		const acceptPath = (candidate: string | undefined): void => {
			if (!candidate || !isSupportedWindowsDropPath(candidate)) {
				return;
			}

			const key = getWindowsPathKey(candidate);
			if (seen.has(key)) {
				return;
			}

			seen.add(key);
			paths.push(candidate);
		};

		const rawCodeFiles = dataTransfer.getData(CodeDataTransfers.FILES);
		if (rawCodeFiles) {
			try {
				const codeFiles = JSON.parse(rawCodeFiles) as string[];
				for (const codeFile of codeFiles) {
					acceptPath(codeFile);
				}
			} catch {
				// Ignore malformed drop data and continue with the next source.
			}
		}

		const rawResources = dataTransfer.getData(DataTransfers.RESOURCES);
		if (rawResources) {
			try {
				const resources = JSON.parse(rawResources) as string[];
				for (const resource of resources) {
					const uri = URI.parse(resource);
					if (uri.scheme === 'file') {
						acceptPath(uri.fsPath);
					}
				}
			} catch {
				// Ignore malformed resource payloads and continue with native files.
			}
		}

		for (const file of Array.from(dataTransfer.files)) {
			acceptPath(getPathForFile(file));
		}

		return paths;
	}

	private async transferExternalPaths(targetSide: 'left' | 'right', sourcePaths: readonly string[], operation: 'copy' | 'move' = 'copy', initiatedAt?: number): Promise<boolean> {
		this.taskbarHiddenForTerminal = false;
		const targetDevice = this.getPaneDevice(targetSide);
		if (!targetDevice) {
			this.statusMessage = '当前目标面板未选择设备，无法接收本地 Windows 文件。';
			this.render();
			return false;
		}
		const targetDirectoryPath = this.paneStates[targetSide].path;

		const normalizedSourcePaths = await this.sshService.normalizeLocalWindowsPaths(sourcePaths);
		let sourceItems = await this.resolveExternalTransferItems(normalizedSourcePaths);
		if (!sourceItems.length) {
			this.statusMessage = '未识别到可传输的 Windows 文件或文件夹。';
			this.render();
			return false;
		}
		const resolvedSourceItems = await this.resolveTransferConflictItems(sourceItems, targetSide);
		if (!resolvedSourceItems?.length) {
			return false;
		}
		sourceItems = resolvedSourceItems;
		const sourceDirectoryPath = getPaneParentPath(sourceItems[0].path!, true) ?? sourceItems[0].path!;
		const transferContext = this.createTransferContext(targetSide, targetSide, this.localWindowsDevice, targetDevice, sourceDirectoryPath, targetDirectoryPath);

		if (sourceItems.length > 1) {
			const transferred = await this.transferItemsBatch(targetSide, targetSide, this.localWindowsDevice, targetDevice, sourceItems, operation, initiatedAt, transferContext);
			if (transferred && operation === 'move') {
				this.applyOptimisticLocalSourceRemoval(sourceItems);
			}
			return transferred;
		}

		const batch = sourceItems.length > 1;
		const actionLabel = operation === 'move' ? '剪切粘贴' : '本地复制';
		const label = batch ? `${actionLabel} ${sourceItems.length} 项` : `${actionLabel} ${sourceItems[0].name}`;
		const task = this.beginTask('transfer', label, `Windows -> ${targetDevice.name}`, false);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
		task.speedSamples = [];
		this.primeTransferTaskStrategy(task, this.localWindowsDevice, targetDevice, sourceItems);
		if (!batch) {
			task.retryTransfer = {
				sourceSide: targetSide,
				targetSide,
				sourceItem: { ...sourceItems[0] },
				targetPath: joinPanePath(transferContext.target.directoryPath, sourceItems[0].name, this.isWindowsDevice(targetDevice)),
				sourceDeviceId: LOCAL_WINDOWS_DEVICE_ID
			};
		}

		if (operation === 'move' && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
			return this.moveExternalWindowsItemsNatively(task, sourceItems, transferContext);
		}

		let completed = 0;
		let failed = 0;
		let totalBytes = 0;
		const strategies = new Set<string>();
		const failures: string[] = [];

		for (const [index, sourceItem] of sourceItems.entries()) {
			if (task.cancelRequested) {
				for (const pending of task.transferItems.slice(index)) {
					pending.status = 'canceled';
					pending.endedAt = Date.now();
				}
				this.finishTask(task, 'canceled', batch ? `已取消外部拖入传输：${sourceItem.name}` : `已取消传输：${sourceItem.name}`, { bytes: totalBytes });
				this.schedulePostTransferReconcile(operation, transferContext);
				return false;
			}

			const progress = Math.min(88, 12 + Math.round((index / sourceItems.length) * 70));
			const transferItem = task.transferItems[index];
			task.activeTransferItemIndex = index;
			transferItem.status = 'running';
			transferItem.startedAt = Date.now();
			transferItem.progress = 0;
			transferItem.error = undefined;
			transferItem.speedBytesPerSecond = 0;
			transferItem.lastSampleAt = undefined;
			transferItem.lastSampleBytes = undefined;
			transferItem.speedSamples = [];
			await this.ensureTransferItemSize(this.localWindowsDevice, sourceItem, transferItem, task, {
				skipDirectorySize: !!sourceItem.directory
			});
			this.updateTask(task, batch ? `正在传输 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在传输：${sourceItem.name}`, progress, false);
			const result = await this.transferItem(targetSide, targetSide, sourceItem, {
				refreshTarget: false,
				task,
				targetPath: joinPanePath(transferContext.target.directoryPath, sourceItem.name, this.isWindowsDevice(targetDevice)),
				sourceDeviceOverride: this.localWindowsDevice,
				targetDeviceOverride: targetDevice,
				initiatedAt
			});
			if (result.ok) {
				completed++;
				totalBytes += result.bytes;
				transferItem.status = 'success';
				transferItem.progress = 100;
				transferItem.transferredBytes = result.bytes;
				transferItem.totalBytes = Math.max(result.bytes, transferItem.totalBytes);
				transferItem.strategy = result.strategy ?? transferItem.strategy;
				transferItem.endedAt = Date.now();
				if (result.strategy) {
					strategies.add(result.strategy);
				}
			} else if (result.canceled) {
				transferItem.status = 'canceled';
				transferItem.endedAt = Date.now();
				for (const pending of task.transferItems.slice(index + 1)) {
					pending.status = 'canceled';
					pending.endedAt = Date.now();
				}
				this.finishTask(task, 'canceled', batch ? `已取消外部拖入传输：${sourceItem.name}` : `已取消传输：${sourceItem.name}`, { bytes: totalBytes });
				this.schedulePostTransferReconcile(operation, transferContext);
				return false;
			} else {
				failed++;
				transferItem.status = 'error';
				transferItem.error = result.message;
				transferItem.endedAt = Date.now();
				failures.push(`${sourceItem.name}: ${result.message}`);
			}
		}

		const strategy = [...strategies].join(', ') || undefined;
		if (failed > 0) {
			this.finishTask(task, 'error', batch ? `本地 Windows 传输完成 ${completed} 项，失败 ${failed} 项。` : `传输失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			this.schedulePostTransferReconcile(operation, transferContext);
			return false;
		}

		if (operation === 'move') {
			const cleanupFailures = await this.deleteExternalSourceItems(task, sourceItems);
			if (cleanupFailures.length) {
				this.finishTask(task, 'error', `目标已复制，但删除本地来源失败 ${cleanupFailures.length} 项。`, { bytes: totalBytes, strategy, error: cleanupFailures[0] });
				this.schedulePostTransferReconcile('move', transferContext);
				return false;
			}
			this.applyOptimisticLocalSourceRemoval(sourceItems);
		}

		const successMessage = batch
			? `${operation === 'move' ? '本地剪切传输' : '本地复制传输'}完成：${completed} 项，${formatSize(totalBytes)}。`
			: `${operation === 'move' ? '剪切传输' : '复制传输'}完成：${sourceItems[0].name}，策略 ${strategy ?? 'unknown'}，${formatSize(totalBytes)}。`;
		this.schedulePostTransferReconcile(operation, transferContext);
		this.applyOptimisticTransferResult('copy', transferContext, sourceItems);
		this.finishTask(task, 'success', successMessage, { bytes: totalBytes, strategy }, false);
		return true;
	}

	private async pasteWindowsClipboardFiles(targetSide: 'left' | 'right'): Promise<void> {
		const clipboardFiles = await this.sshService.readWindowsClipboardFiles();
		if (!clipboardFiles.ok || !clipboardFiles.paths.length) {
			this.statusMessage = '剪贴板里没有可粘贴的本地 Windows 文件或文件夹。';
			this.render();
			return;
		}

		const pasteKey = this.getWindowsClipboardPasteKey(targetSide, clipboardFiles.paths, clipboardFiles.operation);
		if (this.windowsClipboardPasteInFlight.has(pasteKey)) {
			return;
		}

		this.windowsClipboardPasteInFlight.add(pasteKey);
		try {
			await this.transferExternalPaths(targetSide, clipboardFiles.paths, clipboardFiles.operation);
		} finally {
			this.windowsClipboardPasteInFlight.delete(pasteKey);
		}
	}

	private getWindowsClipboardPasteKey(targetSide: 'left' | 'right', paths: readonly string[], operation: 'copy' | 'move'): string {
		const targetPath = this.paneStates[targetSide].path.toLowerCase();
		const sourcePaths = paths
			.map(path => path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase())
			.sort()
			.join('\n');
		return `${targetSide}:${targetPath}:${operation}:${sourcePaths}`;
	}

	private copySelectedToInternalClipboard(sourceSide: 'left' | 'right', operation: 'copy' | 'move', shouldRender: boolean = true): void {
		const sourceDevice = this.getPaneDevice(sourceSide);
		const items = this.getSelectedTransferItems(sourceSide);
		if (!sourceDevice || !items.length) {
			this.statusMessage = operation === 'move' ? '请先选择要剪切的文件或目录。' : '请先选择要复制的文件或目录。';
			if (shouldRender) {
				this.render();
			} else {
				this.refreshTaskbar();
			}
			return;
		}

		this.internalTransferClipboard = {
			operation,
			sourceSide,
			sourceDevice: { ...sourceDevice },
			sourcePath: this.paneStates[sourceSide].path,
			items: items.map(item => ({ ...item })),
			createdAt: Date.now()
		};
		const action = operation === 'move' ? '剪切' : '复制';
		this.statusMessage = `已${action} ${items.length} 项，可在目标文件浏览区按 Ctrl+V 粘贴。`;
		if (shouldRender) {
			this.render();
		} else {
			this.refreshTaskbar();
		}
	}

	private async pasteIntoPane(targetSide: 'left' | 'right'): Promise<void> {
		if (this.internalTransferClipboard?.items.length) {
			await this.pasteInternalTransferClipboard(targetSide);
			return;
		}
		await this.pasteWindowsClipboardFiles(targetSide);
	}

	private createSameDirectoryCopyItems(clipboard: TurboFileInternalTransferClipboard, targetSide: 'left' | 'right', targetDevice: TurboFileDevice): TurboFileFileItem[] {
		const sourceItems = clipboard.items.map(item => ({ ...item }));
		const targetState = this.paneStates[targetSide];
		const windowsPath = this.isWindowsDevice(targetDevice);
		if (clipboard.operation !== 'copy'
			|| !this.isSameDeviceForNativeOperation(clipboard.sourceDevice, targetDevice)
			|| !this.pathsEqualForDevice(clipboard.sourcePath, targetState.path, windowsPath)) {
			return sourceItems;
		}

		const targetNames = createTurboFileCopyNames(
			sourceItems.map(item => ({ name: item.name, directory: !!item.directory })),
			targetState.items.filter(item => !item.parent).map(item => item.name),
			!windowsPath
		);
		return sourceItems.map((item, index) => ({ ...item, name: targetNames[index] }));
	}

	private async resolveTransferConflictItems(sourceItems: readonly TurboFileFileItem[], targetSide: 'left' | 'right'): Promise<TurboFileFileItem[] | undefined> {
		const targetDevice = this.getPaneDevice(targetSide);
		if (!targetDevice) {
			return undefined;
		}
		const caseSensitive = !this.isWindowsDevice(targetDevice);
		const normalizeName = (name: string) => caseSensitive ? name : name.toLowerCase();
		const existingNames = this.paneStates[targetSide].items.filter(item => !item.parent).map(item => item.name);
		const existingKeys = new Set(existingNames.map(normalizeName));
		const conflicting = sourceItems.filter(item => existingKeys.has(normalizeName(item.name)));
		if (!conflicting.length) {
			return sourceItems.map(item => ({ ...item }));
		}

		let policy = this.getTransferConflictPolicy();
		if (policy === 'ask') {
			const picks: Array<IQuickPickItem & { policy?: Exclude<TurboFileTransferConflictPolicy, 'ask'> }> = [
				{ label: localize('turbofile.conflictOverwrite', "覆盖"), description: localize('turbofile.conflictOverwriteDescription', "替换目标中的同名项目"), policy: 'overwrite' },
				{ label: localize('turbofile.conflictSkip', "跳过"), description: localize('turbofile.conflictSkipDescription', "不传输同名项目"), policy: 'skip' },
				{ label: localize('turbofile.conflictKeepBoth', "保留两份"), description: localize('turbofile.conflictKeepBothDescription', "自动生成不重复的新名称"), policy: 'keepBoth' }
			];
			const picked = await this.quickInputService.pick(picks, {
				title: localize('turbofile.sameNameConflict', "发现同名文件"),
				placeHolder: localize('turbofile.sameNameConflictCount', "{0} 个项目与目标目录重名", conflicting.length)
			});
			if (!picked?.policy) {
				return undefined;
			}
			policy = picked.policy;
		}

		if (policy === 'skip') {
			const remaining = sourceItems.filter(item => !existingKeys.has(normalizeName(item.name))).map(item => ({ ...item }));
			if (!remaining.length) {
				this.statusMessage = localize('turbofile.allConflictsSkipped', "所有同名项目均已跳过。");
				this.render();
			}
			return remaining;
		}
		if (policy === 'keepBoth') {
			const names = createTurboFileCopyNames(sourceItems.map(item => ({ name: item.name, directory: !!item.directory })), existingNames, caseSensitive);
			return sourceItems.map((item, index) => ({ ...item, name: names[index] }));
		}
		return sourceItems.map(item => ({ ...item }));
	}

	private async pasteInternalTransferClipboard(targetSide: 'left' | 'right'): Promise<boolean> {
		const clipboard = this.internalTransferClipboard;
		const targetDevice = this.getPaneDevice(targetSide);
		if (!clipboard?.items.length || !targetDevice) {
			this.statusMessage = '当前没有可粘贴的内部文件，或目标面板未选择设备。';
			this.render();
			return false;
		}

		const sourceDevice = clipboard.sourceDevice;
		// Conflict prompts can outlive navigation in either pane. Freeze the destination before
		// awaiting them, just as the clipboard already freezes the source device and directory.
		const transferContext = this.createTransferContext(
			clipboard.sourceSide,
			targetSide,
			sourceDevice,
			targetDevice,
			clipboard.sourcePath,
			this.paneStates[targetSide].path
		);
		let sourceItems = this.createSameDirectoryCopyItems(clipboard, targetSide, targetDevice);
		const resolvedSourceItems = await this.resolveTransferConflictItems(sourceItems, targetSide);
		if (!resolvedSourceItems?.length) {
			return false;
		}
		sourceItems = resolvedSourceItems;
		if (sourceItems.length > 1) {
			const transferred = await this.transferItemsBatch(clipboard.sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, clipboard.operation, undefined, transferContext);
			if (transferred && clipboard.operation === 'move' && this.internalTransferClipboard === clipboard) {
				this.internalTransferClipboard = undefined;
			}
			return transferred;
		}
		const batch = sourceItems.length > 1;
		const actionLabel = clipboard.operation === 'move' ? '剪切粘贴' : '复制粘贴';
		const task = this.beginTask('transfer', batch ? `${actionLabel} ${sourceItems.length} 项` : `${actionLabel} ${sourceItems[0].name}`, `${sourceDevice.name} -> ${targetDevice.name}`, false);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
		task.speedSamples = [];
		this.primeTransferTaskStrategy(task, sourceDevice, targetDevice, sourceItems);

		if (clipboard.operation === 'move' && this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
			const moved = await this.moveInternalItemsNatively(task, sourceDevice, sourceItems, transferContext);
			if (moved && this.internalTransferClipboard === clipboard) {
				this.internalTransferClipboard = undefined;
			}
			return moved;
		}

		let completed = 0;
		let failed = 0;
		let totalBytes = 0;
		const strategies = new Set<string>();
		const failures: string[] = [];

		for (const [index, sourceItem] of sourceItems.entries()) {
			if (task.cancelRequested) {
				for (const pending of task.transferItems.slice(index)) {
					pending.status = 'canceled';
					pending.endedAt = Date.now();
				}
				this.finishTask(task, 'canceled', batch ? `已取消内部粘贴：${sourceItem.name}` : `已取消粘贴：${sourceItem.name}`, { bytes: totalBytes });
				this.schedulePostTransferReconcile(clipboard.operation, transferContext);
				return false;
			}

			const transferItem = task.transferItems[index];
			task.activeTransferItemIndex = index;
			transferItem.status = 'running';
			transferItem.startedAt = Date.now();
			transferItem.progress = 0;
			transferItem.error = undefined;
			transferItem.speedBytesPerSecond = 0;
			transferItem.lastSampleAt = undefined;
			transferItem.lastSampleBytes = undefined;
			transferItem.speedSamples = [];
			const progress = Math.min(88, 12 + Math.round((index / sourceItems.length) * 70));
			await this.ensureTransferItemSize(sourceDevice, sourceItem, transferItem, task, {
				skipDirectorySize: !!sourceItem.directory
			});
			const targetPath = joinPanePath(transferContext.target.directoryPath, sourceItem.name, this.isWindowsDevice(targetDevice));
			if (this.isSameTransferTarget(sourceDevice, sourceItem.path, targetDevice, targetPath)) {
				failed++;
				transferItem.status = 'error';
				transferItem.error = '来源和目标路径相同，已跳过。';
				transferItem.endedAt = Date.now();
				failures.push(`${sourceItem.name}: 来源和目标路径相同`);
				continue;
			}

			this.updateTask(task, batch ? `正在粘贴 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在粘贴：${sourceItem.name}`, progress, false);
			const result = await this.transferItem(clipboard.sourceSide, targetSide, sourceItem, {
				refreshTarget: false,
				task,
				targetPath,
				sourceDeviceOverride: sourceDevice,
				targetDeviceOverride: targetDevice
			});
			if (result.ok) {
				completed++;
				totalBytes += result.bytes;
				transferItem.status = 'success';
				transferItem.progress = 100;
				transferItem.transferredBytes = result.bytes;
				transferItem.totalBytes = Math.max(result.bytes, transferItem.totalBytes);
				transferItem.strategy = result.strategy ?? transferItem.strategy;
				transferItem.endedAt = Date.now();
				if (result.strategy) {
					strategies.add(result.strategy);
				}
			} else if (result.canceled) {
				transferItem.status = 'canceled';
				transferItem.endedAt = Date.now();
				for (const pending of task.transferItems.slice(index + 1)) {
					pending.status = 'canceled';
					pending.endedAt = Date.now();
				}
				this.finishTask(task, 'canceled', batch ? `已取消内部粘贴：${sourceItem.name}` : `已取消粘贴：${sourceItem.name}`, { bytes: totalBytes });
				this.schedulePostTransferReconcile(clipboard.operation, transferContext);
				return false;
			} else {
				failed++;
				transferItem.status = 'error';
				transferItem.error = result.message;
				transferItem.endedAt = Date.now();
				failures.push(`${sourceItem.name}: ${result.message}`);
			}
		}

		const strategy = [...strategies].join(', ') || undefined;
		if (failed > 0) {
			this.finishTask(task, 'error', batch ? `内部粘贴完成 ${completed} 项，失败 ${failed} 项。` : `内部粘贴失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			this.schedulePostTransferReconcile('copy', transferContext);
			return false;
		}

		if (clipboard.operation === 'move') {
			const cleanupFailures = await this.deleteInternalClipboardSources(task, sourceDevice, sourceItems);
			if (cleanupFailures.length) {
				this.finishTask(task, 'error', `目标已复制，但删除来源失败 ${cleanupFailures.length} 项。`, { bytes: totalBytes, strategy, error: cleanupFailures[0] });
				this.schedulePostTransferReconcile('move', transferContext);
				return false;
			}
			if (this.internalTransferClipboard === clipboard) {
				this.internalTransferClipboard = undefined;
			}
		}

		const successMessage = batch
			? `${clipboard.operation === 'move' ? '剪切粘贴' : '复制粘贴'}完成：${completed} 项，${formatSize(totalBytes)}。`
			: `${clipboard.operation === 'move' ? '剪切粘贴' : '复制粘贴'}完成：${sourceItems[0].name}，策略 ${strategy ?? 'unknown'}，${formatSize(totalBytes)}。`;
		this.schedulePostTransferReconcile(clipboard.operation, transferContext);
		this.applyOptimisticTransferResult(clipboard.operation, transferContext, sourceItems);
		this.finishTask(task, 'success', successMessage, { bytes: totalBytes, strategy }, false);
		return true;
	}

	private isSameTransferTarget(sourceDevice: TurboFileDevice, sourcePath: string | undefined, targetDevice: TurboFileDevice, targetPath: string): boolean {
		if (!sourcePath || !this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
			return false;
		}
		if (this.isWindowsDevice(sourceDevice)) {
			return isSameWindowsPath(sourcePath, targetPath);
		}
		return trimTrailingSlash(sourcePath) === trimTrailingSlash(targetPath);
	}

	private isSameDeviceForNativeOperation(sourceDevice: TurboFileDevice, targetDevice: TurboFileDevice): boolean {
		if (sourceDevice.id === targetDevice.id) {
			return true;
		}
		if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID || targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
			return false;
		}
		return sourceDevice.host === targetDevice.host
			&& (sourceDevice.port || 22) === (targetDevice.port || 22)
			&& sourceDevice.username === targetDevice.username;
	}

	private pathsEqualForDevice(left: string, right: string, windowsPath: boolean): boolean {
		return windowsPath ? isSameWindowsPath(left, right) : trimTrailingSlash(left) === trimTrailingSlash(right);
	}

	/**
	 * True when `candidate` is `ancestor` itself or nested below it. Used to forbid moving a folder
	 * into itself or one of its own descendants.
	 */
	private isPathInsideOrEqual(candidate: string, ancestor: string, windowsPath: boolean): boolean {
		if (windowsPath) {
			const c = candidate.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
			const a = ancestor.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
			return c === a || c.startsWith(`${a}\\`);
		}
		const c = trimTrailingSlash(candidate);
		const a = trimTrailingSlash(ancestor);
		return c === a || c.startsWith(`${a}/`);
	}

	/**
	 * The subset of the current selection on `side` that can actually be moved into `targetDir`:
	 * skips items already living in that directory (no-op) and folders that would be moved into
	 * themselves or a descendant.
	 */
	private getDirectoryMoveTargets(side: 'left' | 'right', targetDir: string, sourceItemsOverride: readonly TurboFileFileItem[] | undefined = undefined): TurboFileFileItem[] {
		const device = this.getPaneDevice(side);
		if (!device || !targetDir) {
			return [];
		}
		const windowsPath = this.isWindowsDevice(device);
		return (sourceItemsOverride ?? this.getSelectedTransferItems(side)).filter(item => {
			if (!item.path || item.parent) {
				return false;
			}
			const itemParent = getPaneParentPath(item.path, windowsPath);
			if (itemParent && this.pathsEqualForDevice(itemParent, targetDir, windowsPath)) {
				return false;
			}
			if (item.directory && this.isPathInsideOrEqual(targetDir, item.path, windowsPath)) {
				return false;
			}
			return true;
		});
	}

	private canMoveSelectionIntoDirectory(side: 'left' | 'right', targetItem: TurboFileFileItem, targetDir: string, sourceItemsOverride: readonly TurboFileFileItem[] | undefined = undefined): boolean {
		if (!targetItem.directory && !targetItem.parent) {
			return false;
		}
		return this.getDirectoryMoveTargets(side, targetDir, sourceItemsOverride).length > 0;
	}

	/**
	 * Moves the current same-pane selection into `targetDir` using a native same-device rename, the
	 * same primitive used by cut/paste. Powers dragging rows onto a folder or the ".." row.
	 */
	private async moveSelectedItemsIntoDirectory(side: 'left' | 'right', targetDir: string, targetLabel: string, sourceItemsOverride: readonly TurboFileFileItem[] | undefined = undefined): Promise<void> {
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}
		const sourceItems = this.getDirectoryMoveTargets(side, targetDir, sourceItemsOverride);
		if (!sourceItems.length) {
			return;
		}

		const sourceDirectoryPath = this.paneStates[side].path;
		const windowsPath = this.isWindowsDevice(device);
		const batch = sourceItems.length > 1;
		const strategy = windowsPath ? 'local-move' : 'remote-move';
		const transferContext = this.createTransferContext(side, side, device, device, sourceDirectoryPath, targetDir);
		const task = this.beginTask('transfer', batch ? `移动 ${sourceItems.length} 项到 ${targetLabel}` : `移动 ${sourceItems[0].name} 到 ${targetLabel}`, device.name, false);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
		task.speedSamples = [];
		for (const [index, transferItem] of task.transferItems.entries()) {
			task.activeTransferItemIndex = index;
			transferItem.status = 'running';
			transferItem.startedAt = Date.now();
			transferItem.progress = 0;
			transferItem.strategy = strategy;
		}
		this.updateTask(task, batch ? `正在移动 ${sourceItems.length} 项到 ${targetLabel}` : `正在移动：${sourceItems[0].name}`, 45, false);
		// A same-device move is a metadata-only rename: hand the whole selection to one batched
		// movePathsIntoDirectory (POSIX remote: a single `xargs -0 mv` round trip) instead of issuing one
		// renamePath round trip per item, which made dragging many files feel like a slow per-file copy.
		let result: Awaited<ReturnType<ITurboFileSshService['movePathsIntoDirectory']>>;
		const progressId = task.progressId!;
		const progress = this.sshService.onDynamicTransferProgress(progressId)(event => this.updateTransferProgress(task, event));
		try {
			const connection = device.id === LOCAL_WINDOWS_DEVICE_ID ? undefined : await this.getSshConnectionOptions(device);
			const endpoints = await Promise.all(sourceItems.map(item => this.toTransferEndpoint(device, item.path!, connection)));
			if (task.cancelRequested || task.status !== 'running') {
				return;
			}
			result = await this.sshService.movePathsIntoDirectory(endpoints, transferContext.target.directoryPath, { progressId });
			if (result.canceled || task.cancelRequested) {
				this.finishTask(task, 'canceled', localize('turbofile.moveCanceled', "移动已取消。"));
				this.schedulePostTransferReconcile('move', transferContext);
				return;
			}
		} catch (error) {
			if (task.cancelRequested) {
				this.finishTask(task, 'canceled', localize('turbofile.moveCanceled', "移动已取消。"));
				this.schedulePostTransferReconcile('move', transferContext);
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			for (const transferItem of task.transferItems) {
				transferItem.status = 'error';
				transferItem.error = message;
				transferItem.endedAt = Date.now();
			}
			this.finishTask(task, 'error', `移动失败：${message}`, { strategy, error: message });
			this.schedulePostTransferReconcile('move', transferContext);
			return;
		} finally {
			progress.dispose();
		}

		let totalBytes = 0;
		for (const [index, sourceItem] of sourceItems.entries()) {
			const transferItem = task.transferItems[index];
			const itemBytes = Math.max(sourceItem.rawSize, transferItem.totalBytes, 0);
			if (result.ok) {
				totalBytes += itemBytes;
				transferItem.status = 'success';
				transferItem.progress = 100;
				transferItem.transferredBytes = itemBytes;
				transferItem.totalBytes = Math.max(itemBytes, transferItem.totalBytes);
				transferItem.endedAt = Date.now();
			} else {
				transferItem.status = 'error';
				transferItem.error = result.message;
				transferItem.endedAt = Date.now();
			}
		}
		if (!result.ok) {
			this.finishTask(task, 'error', batch ? `移动 ${sourceItems.length} 项失败：${result.message}` : `移动失败：${result.message}`, { bytes: totalBytes, strategy, error: result.message });
			this.schedulePostTransferReconcile('move', transferContext);
			return;
		}
		const trashMetadataFailures = await this.removeMovedTrashMetadata(device, sourceItems);
		if (trashMetadataFailures.length) {
			this.finishTask(task, 'error', `移动完成，但清理回收站记录失败 ${trashMetadataFailures.length} 项。`, { bytes: totalBytes, strategy, error: trashMetadataFailures[0] });
			await this.refreshTrashPane(side);
			return;
		}

		this.schedulePostTransferReconcile('move', transferContext);
		this.applyOptimisticTransferResult('move', transferContext, sourceItems);
		this.finishTask(task, 'success', batch ? `移动完成：${sourceItems.length} 项 → ${targetLabel}` : `移动完成：${sourceItems[0].name} → ${targetLabel}`, { bytes: totalBytes, strategy }, false);
	}

	/** Retain native rename's overwrite semantics while exposing cancellation and progress. */
	private async renameTransferItem(task: TurboFileTask, device: TurboFileDevice, sourcePath: string, targetPath: string): Promise<Awaited<ReturnType<ITurboFileSshService['renamePath']>>> {
		if (task.cancelRequested || task.status !== 'running') {
			return { ok: false, canceled: true, message: localize('turbofile.moveCanceled', "移动已取消。") };
		}
		const progressId = `turbofile-move-${task.id}-${Date.now()}`;
		task.progressId = progressId;
		const progress = this.sshService.onDynamicTransferProgress(progressId)(event => this.updateTransferProgress(task, event));
		try {
			const source = await this.toTransferEndpoint(device, sourcePath);
			if (task.cancelRequested || task.status !== 'running') {
				return { ok: false, canceled: true, message: localize('turbofile.moveCanceled', "移动已取消。") };
			}
			return await this.sshService.renamePath(source, targetPath, { progressId });
		} finally {
			progress.dispose();
		}
	}

	private async moveInternalItemsNatively(task: TurboFileTask, device: TurboFileDevice, sourceItems: readonly TurboFileFileItem[], transferContext: TurboFileTransferContext): Promise<boolean> {
		const batch = sourceItems.length > 1;
		const failures: string[] = [];
		const successfulItems: TurboFileFileItem[] = [];
		const strategy = this.isWindowsDevice(device) ? 'local-move' : 'remote-move';
		let completed = 0;
		let totalBytes = 0;

		for (const [index, sourceItem] of sourceItems.entries()) {
			if (task.cancelRequested || task.status !== 'running') {
				this.schedulePostTransferReconcile('move', transferContext);
				return false;
			}
			const transferItem = task.transferItems?.[index];
			task.activeTransferItemIndex = index;
			if (transferItem) {
				transferItem.status = 'running';
				transferItem.startedAt = Date.now();
				transferItem.progress = 0;
				transferItem.error = undefined;
				transferItem.speedBytesPerSecond = 0;
				transferItem.lastSampleAt = undefined;
				transferItem.lastSampleBytes = undefined;
				transferItem.speedSamples = [];
				transferItem.strategy = strategy;
			}

			if (!sourceItem.path) {
				if (transferItem) {
					transferItem.status = 'error';
					transferItem.error = 'path missing';
					transferItem.endedAt = Date.now();
				}
				failures.push(`${sourceItem.name}: path missing`);
				continue;
			}

			const itemBytes = Math.max(sourceItem.rawSize, transferItem?.totalBytes ?? 0, 0);
			const targetPath = joinPanePath(transferContext.target.directoryPath, sourceItem.name, this.isWindowsDevice(device));
			if (this.isSameTransferTarget(device, sourceItem.path, device, targetPath)) {
				if (transferItem) {
					transferItem.status = 'error';
					transferItem.error = '源路径和目标路径相同，已跳过。';
					transferItem.endedAt = Date.now();
				}
				failures.push(`${sourceItem.name}: 源路径和目标路径相同`);
				continue;
			}

			this.updateTask(task, batch ? `正在移动 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在移动：${sourceItem.name}`, Math.min(88, 12 + Math.round((index / sourceItems.length) * 70)), false);
			try {
				const result = await this.renameTransferItem(task, device, sourceItem.path, targetPath);
				if (result.canceled || task.cancelRequested) {
					this.finishTask(task, 'canceled', localize('turbofile.moveCanceled', "移动已取消。"), { bytes: totalBytes });
					this.schedulePostTransferReconcile('move', transferContext);
					return false;
				}
				if (!result.ok) {
					if (transferItem) {
						transferItem.status = 'error';
						transferItem.error = result.message;
						transferItem.endedAt = Date.now();
					}
					failures.push(`${sourceItem.name}: ${result.message}`);
					continue;
				}

				completed++;
				totalBytes += itemBytes;
				successfulItems.push(sourceItem);
				if (transferItem) {
					transferItem.status = 'success';
					transferItem.progress = 100;
					transferItem.transferredBytes = itemBytes;
					transferItem.totalBytes = Math.max(itemBytes, transferItem.totalBytes);
					transferItem.strategy = strategy;
					transferItem.endedAt = Date.now();
				}
			} catch (error) {
				if (task.cancelRequested) {
					this.finishTask(task, 'canceled', localize('turbofile.moveCanceled', "移动已取消。"), { bytes: totalBytes });
					this.schedulePostTransferReconcile('move', transferContext);
					return false;
				}
				const message = error instanceof Error ? error.message : String(error);
				if (transferItem) {
					transferItem.status = 'error';
					transferItem.error = message;
					transferItem.endedAt = Date.now();
				}
				failures.push(`${sourceItem.name}: ${message}`);
			}
		}

		failures.push(...await this.removeMovedTrashMetadata(device, successfulItems));
		if (failures.length) {
			this.finishTask(task, 'error', batch ? `同设备移动完成 ${completed} 项，失败 ${failures.length} 项。` : `同设备移动失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			this.schedulePostTransferReconcile('move', transferContext);
			if (successfulItems.length) {
				this.applyOptimisticTransferResult('move', transferContext, successfulItems);
			}
			return false;
		}

		this.schedulePostTransferReconcile('move', transferContext);
		this.applyOptimisticTransferResult('move', transferContext, successfulItems);
		this.finishTask(task, 'success', batch ? `同设备移动完成：${completed} 项。` : `同设备移动完成：${sourceItems[0].name}`, { bytes: totalBytes, strategy }, false);
		return true;
	}

	private async moveExternalWindowsItemsNatively(task: TurboFileTask, sourceItems: readonly TurboFileFileItem[], transferContext: TurboFileTransferContext): Promise<boolean> {
		const batch = sourceItems.length > 1;
		const failures: string[] = [];
		const successfulItems: TurboFileFileItem[] = [];
		const strategy = 'local-move';
		let completed = 0;
		let totalBytes = 0;

		for (const [index, sourceItem] of sourceItems.entries()) {
			if (task.cancelRequested || task.status !== 'running') {
				this.schedulePostTransferReconcile('move', transferContext);
				return false;
			}
			const transferItem = task.transferItems?.[index];
			task.activeTransferItemIndex = index;
			if (transferItem) {
				transferItem.status = 'running';
				transferItem.startedAt = Date.now();
				transferItem.progress = 0;
				transferItem.error = undefined;
				transferItem.speedBytesPerSecond = 0;
				transferItem.lastSampleAt = undefined;
				transferItem.lastSampleBytes = undefined;
				transferItem.speedSamples = [];
				transferItem.strategy = strategy;
			}

			if (!sourceItem.path) {
				failures.push(`${sourceItem.name}: path missing`);
				continue;
			}

			const itemBytes = Math.max(sourceItem.rawSize, transferItem?.totalBytes ?? 0, 0);
			const targetPath = joinPanePath(transferContext.target.directoryPath, sourceItem.name, true);
			if (this.isSameTransferTarget(this.localWindowsDevice, sourceItem.path, this.localWindowsDevice, targetPath)) {
				if (transferItem) {
					transferItem.status = 'error';
					transferItem.error = '源路径和目标路径相同，已跳过。';
					transferItem.endedAt = Date.now();
				}
				failures.push(`${sourceItem.name}: 源路径和目标路径相同`);
				continue;
			}

			this.updateTask(task, batch ? `正在本机移动 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在本机移动：${sourceItem.name}`, Math.min(88, 12 + Math.round((index / sourceItems.length) * 70)), false);
			try {
				const result = await this.renameTransferItem(task, this.localWindowsDevice, sourceItem.path, targetPath);
				if (result.canceled || task.cancelRequested) {
					this.finishTask(task, 'canceled', localize('turbofile.moveCanceled', "移动已取消。"), { bytes: totalBytes });
					this.schedulePostTransferReconcile('move', transferContext);
					return false;
				}
				if (!result.ok) {
					if (transferItem) {
						transferItem.status = 'error';
						transferItem.error = result.message;
						transferItem.endedAt = Date.now();
					}
					failures.push(`${sourceItem.name}: ${result.message}`);
					continue;
				}

				completed++;
				totalBytes += itemBytes;
				successfulItems.push(sourceItem);
				if (transferItem) {
					transferItem.status = 'success';
					transferItem.progress = 100;
					transferItem.transferredBytes = itemBytes;
					transferItem.totalBytes = Math.max(itemBytes, transferItem.totalBytes);
					transferItem.strategy = strategy;
					transferItem.endedAt = Date.now();
				}
			} catch (error) {
				if (task.cancelRequested) {
					this.finishTask(task, 'canceled', localize('turbofile.moveCanceled', "移动已取消。"), { bytes: totalBytes });
					this.schedulePostTransferReconcile('move', transferContext);
					return false;
				}
				const message = error instanceof Error ? error.message : String(error);
				if (transferItem) {
					transferItem.status = 'error';
					transferItem.error = message;
					transferItem.endedAt = Date.now();
				}
				failures.push(`${sourceItem.name}: ${message}`);
			}
		}

		if (failures.length) {
			this.finishTask(task, 'error', batch ? `本机移动完成 ${completed} 项，失败 ${failures.length} 项。` : `本机移动失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			this.schedulePostTransferReconcile('move', transferContext);
			if (successfulItems.length) {
				this.applyOptimisticTransferResult('move', transferContext, successfulItems);
			}
			return false;
		}

		this.schedulePostTransferReconcile('move', transferContext);
		this.applyOptimisticTransferResult('move', transferContext, successfulItems);
		this.finishTask(task, 'success', batch ? `本机移动完成：${completed} 项。` : `本机移动完成：${sourceItems[0].name}`, { bytes: totalBytes, strategy }, false);
		return true;
	}

	private async deleteInternalClipboardSources(task: TurboFileTask, sourceDevice: TurboFileDevice, sourceItems: readonly TurboFileFileItem[]): Promise<string[]> {
		const failures: string[] = [];
		const trashItems = sourceItems.map(item => item.trashItem).filter((item): item is ITurboFileTrashItem => !!item);
		if (trashItems.length) {
			const result = await this.sshService.permanentlyDeleteTrashItems({
				device: await this.toTrashDevice(sourceDevice),
				items: trashItems,
				progressId: task.progressId
			});
			for (const failure of result.results.filter(result => !result.ok)) {
				failures.push(`${failure.path}: ${failure.message}`);
			}
			for (const side of ['left', 'right'] as const) {
				if (this.paneStates[side].trashMode.active && this.getPaneDevice(side)?.id === sourceDevice.id) {
					await this.refreshTrashPane(side);
				}
			}
		}
		const batch = sourceItems.length > 1;
		for (const [index, item] of sourceItems.entries()) {
			if (!item.path || item.trashItem) {
				continue;
			}
			this.updateTask(task, batch ? `正在删除来源 ${index + 1}/${sourceItems.length}：${item.name}` : `正在删除来源：${item.name}`, Math.min(98, 92 + Math.round(((index + 1) / sourceItems.length) * 6)), false);
			const result = await this.sshService.deletePath(await this.toTransferEndpoint(sourceDevice, item.path), true, { progressId: task.progressId });
			if (!result.ok) {
				failures.push(`${item.name}: ${result.message}`);
			}
		}
		return failures;
	}

	private async removeMovedTrashMetadata(device: TurboFileDevice, items: readonly TurboFileFileItem[]): Promise<string[]> {
		const trashItems = items.map(item => item.trashItem).filter((item): item is ITurboFileTrashItem => !!item);
		if (!trashItems.length) {
			return [];
		}
		const result = await this.sshService.permanentlyDeleteTrashItems({
			device: await this.toTrashDevice(device),
			items: trashItems
		});
		for (const side of ['left', 'right'] as const) {
			if (this.paneStates[side].trashMode.active && this.getPaneDevice(side)?.id === device.id) {
				await this.refreshTrashPane(side);
			}
		}
		return result.results.filter(result => !result.ok).map(result => `${result.path}: ${result.message}`);
	}

	private createTransferContext(
		sourceSide: 'left' | 'right',
		targetSide: 'left' | 'right',
		sourceDevice: TurboFileDevice,
		targetDevice: TurboFileDevice,
		sourceDirectoryPath: string = this.paneStates[sourceSide].path,
		targetDirectoryPath: string = this.paneStates[targetSide].path
	): TurboFileTransferContext {
		const cloneDevice = (device: TurboFileDevice): TurboFileDevice => ({
			...device,
			capabilities: { ...device.capabilities }
		});
		return {
			source: { side: sourceSide, device: cloneDevice(sourceDevice), directoryPath: sourceDirectoryPath },
			target: { side: targetSide, device: cloneDevice(targetDevice), directoryPath: targetDirectoryPath }
		};
	}

	private isSameTransferLocation(left: TurboFileTransferLocation, right: TurboFileTransferLocation): boolean {
		return this.isSameCapturedTransferDevice(left.device, right.device)
			&& this.pathsEqualForDevice(left.directoryPath, right.directoryPath, this.isWindowsDevice(left.device));
	}

	private isSameCapturedTransferDevice(left: TurboFileDevice, right: TurboFileDevice): boolean {
		if (left.id === LOCAL_WINDOWS_DEVICE_ID || right.id === LOCAL_WINDOWS_DEVICE_ID) {
			return left.id === right.id;
		}
		return left.host === right.host
			&& (left.port || 22) === (right.port || 22)
			&& left.username === right.username;
	}

	private isPaneAtTransferLocation(side: 'left' | 'right', location: TurboFileTransferLocation): boolean {
		const paneDevice = this.getPaneDevice(side);
		return !!paneDevice
			&& !this.paneStates[side].trashMode.active
			&& this.isSameCapturedTransferDevice(location.device, paneDevice)
			&& this.pathsEqualForDevice(this.paneStates[side].path, location.directoryPath, this.isWindowsDevice(location.device));
	}

	private getVisibleTransferLocationSides(location: TurboFileTransferLocation): ('left' | 'right')[] {
		return (['left', 'right'] as const).filter(side => this.isPaneAtTransferLocation(side, location));
	}

	private invalidateTransferLocationCaches(location: TurboFileTransferLocation): void {
		const aliasDevices: TurboFileDevice[] = [];
		for (const device of [location.device, this.localWindowsDevice, ...this.devices]) {
			const cacheKey = this.getPaneDirectoryCacheKey(device, location.directoryPath);
			if (aliasDevices.some(candidate => this.getPaneDirectoryCacheKey(candidate, location.directoryPath) === cacheKey)
				|| !this.isSameCapturedTransferDevice(location.device, device)) {
				continue;
			}
			aliasDevices.push(device);
		}

		for (const device of aliasDevices) {
			this.invalidatePaneDirectoryCaches(device, [location.directoryPath]);
			for (const side of ['left', 'right'] as const) {
				const snapshotKey = this.getPaneDeviceMemoryKey(side, device);
				const snapshot = this.paneDeviceSnapshots.get(snapshotKey);
				if (snapshot && this.pathsEqualForDevice(snapshot.path, location.directoryPath, this.isWindowsDevice(device))) {
					this.paneDeviceSnapshots.delete(snapshotKey);
				}
			}
		}
	}

	private invalidateTransferContextCaches(operation: 'copy' | 'move', context: TurboFileTransferContext): void {
		if (operation === 'move') {
			this.invalidateTransferLocationCaches(context.source);
		}
		if (operation !== 'move' || !this.isSameTransferLocation(context.source, context.target)) {
			this.invalidateTransferLocationCaches(context.target);
		}
	}

	private applyOptimisticTransferResult(operation: 'copy' | 'move', context: TurboFileTransferContext, sourceItems: readonly TurboFileFileItem[]): void {
		const transferableItems = sourceItems.filter((item): item is TurboFileFileItem & { readonly path: string } => !!item.path && !item.parent);
		if (!transferableItems.length) {
			return;
		}

		const sourcePathKey = (path: string): string => this.isWindowsDevice(context.source.device) ? getWindowsPathKey(path) : path;
		const targetPathKey = (path: string): string => this.isWindowsDevice(context.target.device) ? getWindowsPathKey(path) : path;
		const mutations = transferableItems.map(item => {
			const targetPath = joinPanePath(context.target.directoryPath, item.name, this.isWindowsDevice(context.target.device));
			return {
				sourceKey: sourcePathKey(item.path),
				targetKey: targetPathKey(targetPath),
				targetItem: { ...item, path: targetPath, parent: false }
			};
		});
		const sameLocation = this.isSameTransferLocation(context.source, context.target);
		const sourceSides = this.getVisibleTransferLocationSides(context.source);
		const targetSides = this.getVisibleTransferLocationSides(context.target);
		const changedSides = new Set<'left' | 'right'>();
		const targetPathBySourceKey = new Map(mutations.map(mutation => [mutation.sourceKey, mutation.targetItem.path!]));
		if (sameLocation) {
			for (const side of createTurboFilePostTransferRefreshPlan(operation, sourceSides, targetSides)) {
				const state = this.paneStates[side];
				const result = applyTurboFileOptimisticTransfer(operation, state.items, state.items, mutations, true, {
					source: sourcePathKey,
					target: targetPathKey
				});
				state.items = this.sortPaneItems(side, result.targetItems);
				if (operation === 'move') {
					this.remapSelectionAfterMove(side, true, sourcePathKey, targetPathBySourceKey);
				}
				changedSides.add(side);
			}
		} else {
			if (operation === 'move') {
				for (const side of sourceSides) {
					const state = this.paneStates[side];
					const result = applyTurboFileOptimisticTransfer('move', state.items, [], mutations, false, {
						source: sourcePathKey,
						target: targetPathKey
					});
					state.items = this.sortPaneItems(side, result.sourceItems);
					this.remapSelectionAfterMove(side, false, sourcePathKey, targetPathBySourceKey);
					changedSides.add(side);
				}
			}
			for (const side of targetSides) {
				const state = this.paneStates[side];
				const result = applyTurboFileOptimisticTransfer('copy', [], state.items, mutations, false, {
					source: sourcePathKey,
					target: targetPathKey
				});
				state.items = this.sortPaneItems(side, result.targetItems);
				changedSides.add(side);
			}
		}
		for (const side of changedSides) {
			this.updatePaneAfterOptimisticMutation(side);
		}
	}

	private remapSelectionAfterMove(sourceSide: 'left' | 'right', samePane: boolean, sourcePathKey: (path: string) => string, targetPathBySourceKey: ReadonlyMap<string, string>): void {
		const state = this.paneStates[sourceSide];
		const mapPath = (path: string | undefined): string | undefined => {
			if (!path) {
				return undefined;
			}
			const targetPath = targetPathBySourceKey.get(sourcePathKey(path));
			if (targetPath) {
				return samePane ? targetPath : undefined;
			}
			return path;
		};
		const selectedPaths = Array.from(state.selectedPaths);
		state.selectedPaths.clear();
		for (const path of selectedPaths) {
			const mappedPath = mapPath(path);
			if (mappedPath) {
				state.selectedPaths.add(mappedPath);
			}
		}
		state.selectedPath = mapPath(state.selectedPath);
		state.selectionAnchorPath = mapPath(state.selectionAnchorPath);
	}

	private updatePaneAfterOptimisticMutation(side: 'left' | 'right'): void {
		const state = this.paneStates[side];
		const device = this.getPaneDevice(side);
		if (device) {
			this.paneDirectoryCache.set(this.getPaneDirectoryCacheKey(device, state.path), {
				expiresAt: Date.now() + PANE_DIRECTORY_CACHE_TTL_MS,
				path: state.path,
				items: state.items
			});
		}
		this.fileListRenderedRange[side] = undefined;
		this.rememberPaneDeviceSnapshot(side);
		this.rerenderFileListSliceInPlace(side);
		const pane = this.container?.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${side}"]`);
		if (pane) {
			const count = pane.querySelector<HTMLElement>('.turbofile-browser-item-count');
			if (count) {
				this.updatePaneItemCountElement(side, count);
			}
			this.updatePaneSelectionBadge(side, pane);
		}
		this.scheduleEnrichVisibleRows(side);
	}

	private schedulePostTransferReconcile(operation: 'copy' | 'move', context: TurboFileTransferContext): void {
		this.invalidateTransferContextCaches(operation, context);
		const sourceSides = this.getVisibleTransferLocationSides(context.source);
		const targetSides = this.getVisibleTransferLocationSides(context.target);
		for (const side of createTurboFilePostTransferRefreshPlan(operation, sourceSides, targetSides)) {
			const location = targetSides.includes(side) ? context.target : context.source;
			this.queuePaneReconcile(side, location);
		}
	}

	private schedulePaneReconcile(sides: readonly ('left' | 'right')[]): void {
		for (const side of sides) {
			const device = this.getPaneDevice(side);
			if (device) {
				this.queuePaneReconcile(side, {
					side,
					device: { ...device, capabilities: { ...device.capabilities } },
					directoryPath: this.paneStates[side].path
				});
			}
		}
	}

	private queuePaneReconcile(side: 'left' | 'right', location: TurboFileTransferLocation): void {
		this.postTransferReconcileContexts.set(side, location);
		this.postTransferReconcileGeneration[side]++;
		this.postTransferReconcileScheduler.schedule(POST_TRANSFER_RECONCILE_DELAY_MS);
	}

	private async reconcilePaneAfterTransfer(side: 'left' | 'right', context: TurboFileTransferLocation, generation: number): Promise<void> {
		const state = this.paneStates[side];
		if (!this.isPaneAtTransferLocation(side, context)) {
			this.invalidateTransferLocationCaches(context);
			return;
		}
		const paneRequestSeq = this.paneRequestSeq[side];
		try {
			const listing = await this.loadPaneDirectory(context.device, context.directoryPath, true, 'prefetch', this.paneSortNeedsAttributes(side));
			if (this.postTransferReconcileGeneration[side] !== generation
				|| this.paneRequestSeq[side] !== paneRequestSeq
				|| !this.isPaneAtTransferLocation(side, context)) {
				return;
			}

			const pathKey = (itemPath: string): string => this.isWindowsDevice(context.device) ? getWindowsPathKey(itemPath) : itemPath;
			const itemsByPath = new Map(listing.items.filter(item => !!item.path).map(item => [pathKey(item.path!), item]));
			const selectedPaths = Array.from(state.selectedPaths);
			state.items = this.sortPaneItems(side, listing.items);
			state.selectedPaths.clear();
			for (const selectedPath of selectedPaths) {
				const item = itemsByPath.get(pathKey(selectedPath));
				if (item?.path && !item.parent) {
					state.selectedPaths.add(item.path);
				}
			}
			state.selectedPath = state.selectedPath ? itemsByPath.get(pathKey(state.selectedPath))?.path : undefined;
			state.selectionAnchorPath = state.selectionAnchorPath ? itemsByPath.get(pathKey(state.selectionAnchorPath))?.path : undefined;
			this.setDeviceRuntimeStatus(context.device, 'online');
			this.rememberPaneDeviceSnapshot(side);
			this.prefetchNeighborDirectories(context.device, listing.path, listing.items);
			this.updatePaneAfterOptimisticMutation(side);
		} catch {
			// The transfer already succeeded and the optimistic pane state is authoritative enough for
			// immediate use. A background consistency refresh must never turn success into an error.
		}
	}

	private async deleteExternalSourceItems(task: TurboFileTask, sourceItems: readonly TurboFileFileItem[]): Promise<string[]> {
		const failures: string[] = [];
		for (const [index, item] of sourceItems.entries()) {
			if (!item.path) {
				continue;
			}

			this.updateTask(task, `正在删除本地来源 ${index + 1}/${sourceItems.length}：${item.name}`, Math.min(98, 92 + Math.round(((index + 1) / sourceItems.length) * 6)), false);
			const result = await this.sshService.deletePath(await this.toTransferEndpoint(this.localWindowsDevice, item.path), true, { progressId: task.progressId });
			if (!result.ok) {
				failures.push(`${item.name}: ${result.message}`);
			}
		}
		return failures;
	}

	private applyOptimisticLocalSourceRemoval(sourceItems: readonly TurboFileFileItem[]): void {
		const sourcePathKeys = new Set(sourceItems.map(item => item.path).filter((path): path is string => !!path).map(getWindowsPathKey));
		const changedSides: Array<'left' | 'right'> = [];
		for (const side of ['left', 'right'] as const) {
			if (this.getPaneDevice(side)?.id !== LOCAL_WINDOWS_DEVICE_ID) {
				continue;
			}
			const state = this.paneStates[side];
			const nextItems = state.items.filter(item => !item.path || !sourcePathKeys.has(getWindowsPathKey(item.path)));
			if (nextItems.length === state.items.length) {
				continue;
			}
			state.items = nextItems;
			for (const selectedPath of Array.from(state.selectedPaths)) {
				if (sourcePathKeys.has(getWindowsPathKey(selectedPath))) {
					state.selectedPaths.delete(selectedPath);
				}
			}
			if (state.selectedPath && sourcePathKeys.has(getWindowsPathKey(state.selectedPath))) {
				state.selectedPath = undefined;
			}
			if (state.selectionAnchorPath && sourcePathKeys.has(getWindowsPathKey(state.selectionAnchorPath))) {
				state.selectionAnchorPath = undefined;
			}
			this.updatePaneAfterOptimisticMutation(side);
			changedSides.push(side);
		}
		this.schedulePaneReconcile(changedSides);
	}

	private async resolveExternalTransferItems(paths: readonly string[]): Promise<TurboFileFileItem[]> {
		interface ExternalPathTarget {
			readonly index: number;
			readonly path: string;
			readonly name: string;
		}
		interface ExternalPathParentGroup {
			readonly parentPath: string;
			readonly targets: ExternalPathTarget[];
		}

		const resolved = new Array<TurboFileFileItem | undefined>(paths.length);
		const groupsByParent = new Map<string, ExternalPathParentGroup>();
		for (const [index, path] of paths.entries()) {
			const name = getPathBasename(path);
			if (!name) {
				continue;
			}
			const parentPath = getPaneParentPath(path, true);
			if (!parentPath) {
				resolved[index] = this.createExternalTransferFallbackItem(path, name);
				continue;
			}
			const parentKey = getWindowsPathKey(parentPath);
			let group = groupsByParent.get(parentKey);
			if (!group) {
				group = { parentPath, targets: [] };
				groupsByParent.set(parentKey, group);
			}
			group.targets.push({ index, path, name });
		}

		const groups = [...groupsByParent.values()];
		let cursor = 0;
		const worker = async (): Promise<void> => {
			while (cursor < groups.length) {
				const group = groups[cursor++];
				try {
					const listing = await this.sshService.listLocalDirectory(group.parentPath);
					const entriesByPath = new Map<string, ITurboFileFileEntry>();
					const entriesByName = new Map<string, ITurboFileFileEntry>();
					for (const entry of listing.entries) {
						entriesByPath.set(getWindowsPathKey(entry.path), entry);
						entriesByName.set(entry.name.toLowerCase(), entry);
					}
					for (const target of group.targets) {
						const entry = entriesByPath.get(getWindowsPathKey(target.path)) ?? entriesByName.get(target.name.toLowerCase());
						if (entry) {
							resolved[target.index] = this.toFileItem(entry);
						}
					}
				} catch {
					// Fall back to best-effort items below when a parent listing is unavailable.
				}
			}
		};
		const workers = Array.from({ length: Math.min(EXTERNAL_PATH_PARENT_LIST_CONCURRENCY, groups.length) }, () => worker());
		await Promise.all(workers);

		return paths.map((path, index) => {
			const name = getPathBasename(path);
			return resolved[index] ?? (name ? this.createExternalTransferFallbackItem(path, name) : undefined);
		}).filter((item): item is TurboFileFileItem => !!item);
	}

	private createExternalTransferFallbackItem(path: string, name: string): TurboFileFileItem {
		return {
			name,
			path,
			size: '',
			rawSize: 0,
			modified: '',
			rawModified: 0,
			type: getWindowsDriveRoot(path) ? 'directory' : 'unknown',
			directory: !!getWindowsDriveRoot(path)
		};
	}

	private async transferItemsToWindowsDirectory(sourceSide: 'left' | 'right', sourceDevice: TurboFileDevice, sourceItems: readonly TurboFileFileItem[], targetDirectory: string, initiatedAt?: number, operation: TurboFileDragOperation = 'copy'): Promise<boolean> {
		this.taskbarHiddenForTerminal = false;
		const items = sourceItems.filter((item): item is TurboFileFileItem & { path: string } => !!item.path && !item.parent);
		if (!items.length) {
			this.statusMessage = '没有可拖到 Windows 的文件。';
			this.render();
			return false;
		}

		const targetDevice = this.localWindowsDevice;
		const transferContext = this.createTransferContext(sourceSide, sourceSide, sourceDevice, targetDevice, this.paneStates[sourceSide].path, targetDirectory);
		if (operation === 'copy' && items.length === 1) {
			const sourceItem = items[0];
			const task = this.beginTask('transfer', `拖出 ${sourceItem.name}`, `${sourceDevice.name} -> Windows`, false);
			task.progress = 0;
			task.cancelRequested = false;
			task.transferItems = [this.createTransferTaskItem(sourceItem)];
			task.speedSamples = [];
			this.primeTransferTaskStrategy(task, sourceDevice, targetDevice, items);
			task.activeTransferItemIndex = 0;
			const transferItem = task.transferItems[0];
			transferItem.status = 'running';
			transferItem.startedAt = Date.now();
			await this.ensureTransferItemSize(sourceDevice, sourceItem, transferItem, task, {
				skipDirectorySize: !!sourceItem.directory
			});
			const result = await this.transferItem(sourceSide, sourceSide, sourceItem, {
				refreshTarget: false,
				task,
				targetPath: joinPanePath(targetDirectory, sourceItem.name, true),
				sourceDeviceOverride: sourceDevice,
				targetDeviceOverride: targetDevice,
				initiatedAt
			});
			if (result.ok) {
				transferItem.status = 'success';
				transferItem.progress = 100;
				transferItem.transferredBytes = result.bytes;
				transferItem.totalBytes = Math.max(result.bytes, transferItem.totalBytes);
				transferItem.strategy = result.strategy ?? transferItem.strategy;
				transferItem.endedAt = Date.now();
				this.schedulePostTransferReconcile('copy', transferContext);
				this.applyOptimisticTransferResult('copy', transferContext, items);
				this.finishTask(task, 'success', `拖出完成：${sourceItem.name}，${formatSize(result.bytes)}。`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond }, false);
				return true;
			}
			transferItem.status = result.canceled ? 'canceled' : 'error';
			transferItem.error = result.canceled ? undefined : result.message;
			transferItem.endedAt = Date.now();
			this.finishTask(task, result.canceled ? 'canceled' : 'error', result.canceled ? `已取消拖出：${sourceItem.name}` : `拖出失败：${result.message}`, { bytes: result.bytes, strategy: result.strategy, error: result.canceled ? undefined : result.message, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
			this.schedulePostTransferReconcile('copy', transferContext);
			return false;
		}

		const task = this.beginTask('transfer', `拖出 ${items.length} 项`, `${sourceDevice.name} -> Windows`, false);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = items.map(item => this.createTransferTaskItem(item));
		task.currentTransferName = items[0]?.name;
		task.speedSamples = [];
		this.primeTransferTaskStrategy(task, sourceDevice, targetDevice, items);
		const progressId = `turbofile-windows-drag-${task.id}-${Date.now()}`;
		task.progressId = progressId;
		for (const transferItem of task.transferItems) {
			transferItem.progressId = progressId;
			transferItem.status = 'running';
			transferItem.startedAt = Date.now();
		}

		const progressDisposable = this.sshService.onDynamicTransferProgress(progressId)(event => this.updateTransferProgress(task, event));
		try {
			const sourceEndpoint = await this.toTransferEndpoint(sourceDevice, items[0].path);
			const targetDirectoryEndpoint: ITurboFileTransferEndpoint = {
				kind: 'local',
				path: targetDirectory,
				label: 'Windows'
			};
			const expectedBytes = task.trackTotalBytes ? Math.max(0, task.totalBytes ?? 0) : 0;
			const plannedStrategy = this.getPlannedBatchTransferStrategy(sourceDevice, targetDevice, items);
			task.strategy = plannedStrategy;
			for (const transferItem of task.transferItems) {
				transferItem.strategy = plannedStrategy;
			}
			this.updateTask(task, `正在拖出到 Windows 0/${items.length}`, 8, false);
			const result = await this.sshService.transferBatch({
				source: sourceEndpoint,
				targetDirectory: targetDirectoryEndpoint,
				items: items.map(item => ({
					sourcePath: item.path,
					targetName: item.name,
					displayName: item.name,
					sourceType: item.type,
					expectedBytes: task.trackTotalBytes ? Math.max(0, item.rawSize) : 0
				})),
				operation,
				progressId,
				expectedBytes,
				strategyHint: 'auto',
				clientStartedAt: initiatedAt ?? task.startedAt
			});

			const failureMessages = new Map<string, string>();
			for (const failure of result.failures) {
				if (!failureMessages.has(failure.path)) {
					failureMessages.set(failure.path, failure.message);
				}
			}
			for (const [index, item] of items.entries()) {
				const transferItem = task.transferItems[index];
				if (!transferItem) {
					continue;
				}
				transferItem.strategy = result.strategy ?? transferItem.strategy;
				transferItem.endedAt = Date.now();
				if (result.canceled) {
					transferItem.status = 'canceled';
				} else if (failureMessages.has(item.path)) {
					transferItem.status = 'error';
					transferItem.error = failureMessages.get(item.path);
				} else {
					transferItem.status = 'success';
					transferItem.progress = 100;
					transferItem.transferredBytes = Math.max(transferItem.transferredBytes, transferItem.totalBytes, item.rawSize, 0);
				}
			}

			if (result.canceled) {
				this.finishTask(task, 'canceled', `已取消拖出到 Windows：${items.length} 项`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
				this.schedulePostTransferReconcile(operation, transferContext);
				return false;
			}
			if (!result.ok) {
				this.finishTask(task, 'error', `拖出到 Windows 完成 ${result.completed} 项，失败 ${result.failed} 项。`, { bytes: result.bytes, strategy: result.strategy, error: result.failures[0]?.message, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
				this.schedulePostTransferReconcile(operation, transferContext);
				return false;
			}
			this.schedulePostTransferReconcile(operation, transferContext);
			this.applyOptimisticTransferResult(operation, transferContext, items);
			this.finishTask(task, 'success', `拖出到 Windows 完成：${result.completed} 项，${formatSize(result.bytes)}。`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond }, false);
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `拖出到 Windows 失败：${message}`, { error: message });
			this.schedulePostTransferReconcile(operation, transferContext);
			return false;
		} finally {
			progressDisposable.dispose();
		}
	}

	private async transferSelected(sourceSide: 'left' | 'right', targetSide: 'left' | 'right', initiatedAt?: number, operation: TurboFileDragOperation = 'copy', sourceItemsOverride: readonly TurboFileFileItem[] | undefined = undefined): Promise<boolean> {
		this.taskbarHiddenForTerminal = false;
		const sourceDevice = this.getPaneDevice(sourceSide);
		const targetDevice = this.getPaneDevice(targetSide);
		let sourceItems = sourceItemsOverride ? [...sourceItemsOverride] : this.getSelectedTransferItems(sourceSide);

		if (!sourceDevice || !targetDevice || !sourceItems.length) {
			this.statusMessage = '请先在来源面板选择一个或多个文件/目录。';
			this.render();
			return false;
		}
		const transferContext = this.createTransferContext(sourceSide, targetSide, sourceDevice, targetDevice);
		const resolvedSourceItems = await this.resolveTransferConflictItems(sourceItems, targetSide);
		if (!resolvedSourceItems?.length) {
			return false;
		}
		sourceItems = resolvedSourceItems;

		if (shouldUseBatchTransfer(operation, sourceItems.length)) {
			return this.transferItemsBatch(sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, operation, initiatedAt, transferContext);
		}

		const batch = sourceItems.length > 1;
		const actionLabel = operation === 'move' ? '剪切' : '复制';
		const label = batch ? `${actionLabel} ${sourceItems.length} 项` : `${actionLabel} ${sourceItems[0].name}`;
		const task = this.beginTask('transfer', label, `${sourceDevice.name} -> ${targetDevice.name}`, false);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
		task.speedSamples = [];
		this.primeTransferTaskStrategy(task, sourceDevice, targetDevice, sourceItems);
		if (!batch && operation === 'copy') {
			task.retryTransfer = { sourceSide, targetSide, sourceItem: { ...sourceItems[0] } };
		}

		let completed = 0;
		let failed = 0;
		let totalBytes = 0;
		const strategies = new Set<string>();
		const failures: string[] = [];

		for (const [index, sourceItem] of sourceItems.entries()) {
			if (task.cancelRequested) {
				for (const pending of task.transferItems.slice(index)) {
					pending.status = 'canceled';
					pending.endedAt = Date.now();
				}
				this.finishTask(task, 'canceled', batch ? `已取消批量传输：${sourceItem.name}` : `已取消传输：${sourceItem.name}`, { bytes: totalBytes });
				this.schedulePostTransferReconcile(operation, transferContext);
				return false;
			}
			const progress = Math.min(88, 12 + Math.round((index / sourceItems.length) * 70));
			const transferItem = task.transferItems[index];
			task.activeTransferItemIndex = index;
			transferItem.status = 'running';
			transferItem.startedAt = Date.now();
			transferItem.progress = 0;
			transferItem.error = undefined;
			transferItem.speedBytesPerSecond = 0;
			transferItem.lastSampleAt = undefined;
			transferItem.lastSampleBytes = undefined;
			transferItem.speedSamples = [];
			await this.ensureTransferItemSize(sourceDevice, sourceItem, transferItem, task, {
				skipDirectorySize: !!sourceItem.directory
			});
			this.updateTask(task, batch ? `正在传输 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在传输：${sourceItem.name}`, progress, false);
			const result = await this.transferItem(sourceSide, targetSide, sourceItem, {
				refreshTarget: false,
				task,
				targetPath: joinPanePath(transferContext.target.directoryPath, sourceItem.name, this.isWindowsDevice(targetDevice)),
				sourceDeviceOverride: sourceDevice,
				targetDeviceOverride: targetDevice,
				initiatedAt
			});
			if (result.ok) {
				completed++;
				totalBytes += result.bytes;
				transferItem.status = 'success';
				transferItem.progress = 100;
				transferItem.transferredBytes = result.bytes;
				transferItem.totalBytes = Math.max(result.bytes, transferItem.totalBytes);
				transferItem.strategy = result.strategy ?? transferItem.strategy;
				transferItem.endedAt = Date.now();
				if (result.strategy) {
					strategies.add(result.strategy);
				}
			} else if (result.canceled) {
				transferItem.status = 'canceled';
				transferItem.endedAt = Date.now();
				for (const pending of task.transferItems.slice(index + 1)) {
					pending.status = 'canceled';
					pending.endedAt = Date.now();
				}
				this.finishTask(task, 'canceled', batch ? `已取消批量传输：${sourceItem.name}` : `已取消传输：${sourceItem.name}`, { bytes: totalBytes });
				this.schedulePostTransferReconcile(operation, transferContext);
				return false;
			} else {
				failed++;
				transferItem.status = 'error';
				transferItem.error = result.message;
				transferItem.endedAt = Date.now();
				failures.push(`${sourceItem.name}: ${result.message}`);
			}
		}

		if (operation === 'move' && failed === 0) {
			const cleanupFailures = await this.deleteInternalClipboardSources(task, sourceDevice, sourceItems);
			if (cleanupFailures.length) {
				this.finishTask(task, 'error', `目标已复制，但删除来源失败 ${cleanupFailures.length} 项。`, { bytes: totalBytes, strategy: [...strategies].join(', ') || undefined, error: cleanupFailures[0] });
				this.schedulePostTransferReconcile('move', transferContext);
				return false;
			}
		}

		const strategy = [...strategies].join(', ') || undefined;
		if (failed > 0) {
			this.finishTask(task, 'error', batch ? `批量传输完成 ${completed} 项，失败 ${failed} 项。` : `传输失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			this.schedulePostTransferReconcile(operation, transferContext);
			return false;
		}

		const successMessage = batch
			? `${operation === 'move' ? '剪切传输' : '批量传输'}完成：${completed} 项，${formatSize(totalBytes)}。`
			: `${operation === 'move' ? '剪切传输' : '传输'}完成：${sourceItems[0].name}，策略 ${strategy ?? 'unknown'}，${formatSize(totalBytes)}。`;
		this.schedulePostTransferReconcile(operation, transferContext);
		this.applyOptimisticTransferResult(operation, transferContext, sourceItems);
		this.finishTask(task, 'success', successMessage, { bytes: totalBytes, strategy }, false);
		return true;
	}

	private async transferItem(sourceSide: 'left' | 'right', targetSide: 'left' | 'right', sourceItem: TurboFileFileItem, options: { refreshTarget: boolean; task?: TurboFileTask; targetPath?: string; sourceDeviceOverride?: TurboFileDevice; targetDeviceOverride?: TurboFileDevice; initiatedAt?: number }): Promise<TurboFileTransferExecutionResult> {
		const targetState = this.paneStates[targetSide];
		const sourceDevice = options.sourceDeviceOverride ?? this.getPaneDevice(sourceSide);
		const targetDevice = options.targetDeviceOverride ?? this.getPaneDevice(targetSide);
		if (!sourceDevice || !targetDevice || !sourceItem.path || sourceItem.parent) {
			return { ok: false, message: '来源或目标无效。', bytes: 0 };
		}
		if (options.task && (options.task.cancelRequested || options.task.status !== 'running')) {
			return { ok: false, canceled: true, message: localize('turbofile.transferCanceledBeforeStart', "传输已取消，未启动文件传输。"), bytes: 0 };
		}

		const targetPath = options.targetPath ?? joinPanePath(targetState.path, sourceItem.name, this.isWindowsDevice(targetDevice));
		const progressId = options.task ? `turbofile-transfer-${options.task.id}-${Date.now()}` : undefined;
		if (options.task) {
			options.task.progressId = progressId;
			const activeItem = options.task.activeTransferItemIndex !== undefined ? options.task.transferItems?.[options.task.activeTransferItemIndex] : undefined;
			if (activeItem) {
				activeItem.progressId = progressId;
			}
		}
		const progressDisposable = progressId && options.task
			? this.sshService.onDynamicTransferProgress(progressId)(event => this.updateTransferProgress(options.task!, event))
			: undefined;
		try {
			const [sourceEndpoint, targetEndpoint] = await Promise.all([
				this.toTransferEndpoint(sourceDevice, sourceItem.path),
				this.toTransferEndpoint(targetDevice, targetPath)
			]);
			if (options.task && (options.task.cancelRequested || options.task.status !== 'running')) {
				return { ok: false, canceled: true, message: localize('turbofile.transferCanceledBeforeStart', "传输已取消，未启动文件传输。"), bytes: 0 };
			}
			const plannedStrategy = this.getPlannedTransferStrategy(sourceDevice, targetDevice, sourceItem);
			const activeItem = options.task?.activeTransferItemIndex !== undefined ? options.task.transferItems?.[options.task.activeTransferItemIndex] : undefined;
			const expectedBytes = sourceItem.directory
				? Math.max(activeItem?.totalBytes ?? 0, activeItem?.rawSize ?? 0, 0)
				: Math.max(activeItem?.totalBytes ?? 0, activeItem?.rawSize ?? 0, sourceItem.rawSize, 0);
			const initialStrategy = this.shouldDeferSshToSshStrategy(sourceDevice, targetDevice) ? undefined : plannedStrategy;
			if (activeItem) {
				activeItem.strategy = initialStrategy;
			}
			if (options.task) {
				options.task.strategy = initialStrategy;
			}
			if (options.task) {
				this.updateTask(options.task, `正在传输：${sourceItem.name} -> ${targetDevice.name}`, Math.max(35, options.task.progress), false);
			}
			const result = await this.sshService.transferFile({
				source: sourceEndpoint,
				target: targetEndpoint,
				sourceType: sourceItem.type,
				overwrite: true,
				progressId,
				expectedBytes,
				clientStartedAt: options.initiatedAt ?? options.task?.startedAt
			});

			if (result.ok) {
				if (options.task && result.durationMs !== undefined) {
					options.task.durationMs = (options.task.durationMs ?? 0) + result.durationMs;
					options.task.averageBytesPerSecond = undefined;
				}
				if (options.refreshTarget) {
					if (options.task) {
						this.updateTask(options.task, `正在刷新目标目录：${targetDevice.name}`, 90);
					}
					await this.refreshPane(targetSide, { force: true });
				}
				return { ok: true, message: result.message, bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond };
			}

			return { ok: false, message: result.message, bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond, canceled: result.canceled };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { ok: false, message, bytes: 0 };
		} finally {
			progressDisposable?.dispose();
		}
	}

	private async transferItemsBatch(sourceSide: 'left' | 'right', targetSide: 'left' | 'right', sourceDevice: TurboFileDevice, targetDevice: TurboFileDevice, sourceItems: readonly TurboFileFileItem[], operation: 'copy' | 'move', initiatedAt?: number, transferContextOverride?: TurboFileTransferContext): Promise<boolean> {
		const items = sourceItems.filter(item => !!item.path && !item.parent);
		if (!items.length) {
			return false;
		}
		const transferContext = transferContextOverride ?? this.createTransferContext(sourceSide, targetSide, sourceDevice, targetDevice);

		const actionLabel = operation === 'move' ? '剪切传输' : '批量传输';
		const task = this.beginTask('transfer', `${actionLabel} ${items.length} 项`, `${sourceDevice.name} -> ${targetDevice.name}`, false);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = items.map(item => this.createTransferTaskItem(item));
		task.currentTransferName = items[0]?.name;
		task.speedSamples = [];
		this.primeTransferTaskStrategy(task, sourceDevice, targetDevice, items);
		const progressId = `turbofile-batch-${task.id}-${Date.now()}`;
		task.progressId = progressId;
		for (const transferItem of task.transferItems) {
			transferItem.progressId = progressId;
			transferItem.status = 'running';
			transferItem.startedAt = Date.now();
		}

		const progressDisposable = this.sshService.onDynamicTransferProgress(progressId)(event => this.updateTransferProgress(task, event));
		try {
			const [sourceEndpoint, targetDirectoryEndpoint] = await Promise.all([
				this.toTransferEndpoint(sourceDevice, items[0].path!),
				this.toTransferEndpoint(targetDevice, transferContext.target.directoryPath)
			]);
			if (task.cancelRequested || task.status !== 'running') {
				if (task.status === 'running') {
					this.finishTask(task, 'canceled', localize('turbofile.batchTransferCanceledBeforeStart', "批量传输已取消，未启动文件传输。"));
				}
				return false;
			}
			const expectedBytes = task.trackTotalBytes ? Math.max(0, task.totalBytes ?? 0) : 0;
			const plannedStrategy = this.getPlannedBatchTransferStrategy(sourceDevice, targetDevice, items);
			const initialStrategy = this.shouldDeferSshToSshStrategy(sourceDevice, targetDevice) ? undefined : plannedStrategy;
			task.strategy = initialStrategy;
			for (const transferItem of task.transferItems) {
				transferItem.strategy = initialStrategy;
			}
			this.updateTask(task, `正在批量传输 0/${items.length}`, 8, false);
			const result = await this.sshService.transferBatch({
				source: sourceEndpoint,
				targetDirectory: targetDirectoryEndpoint,
				items: items.map(item => ({
					sourcePath: item.path!,
					targetName: item.name,
					displayName: item.name,
					sourceType: item.type,
					expectedBytes: task.trackTotalBytes ? Math.max(0, item.rawSize) : 0
				})),
				operation,
				progressId,
				expectedBytes,
				strategyHint: 'auto',
				clientStartedAt: initiatedAt ?? task.startedAt
			});

			const failureMessages = new Map<string, string>();
			for (const failure of result.failures) {
				if (!failureMessages.has(failure.path)) {
					failureMessages.set(failure.path, failure.message);
				}
			}
			for (const [index, item] of items.entries()) {
				const transferItem = task.transferItems[index];
				if (!transferItem) {
					continue;
				}
				transferItem.strategy = result.strategy ?? transferItem.strategy;
				transferItem.endedAt = Date.now();
				if (result.canceled) {
					transferItem.status = 'canceled';
				} else if (failureMessages.has(item.path!)) {
					transferItem.status = 'error';
					transferItem.error = failureMessages.get(item.path!);
				} else {
					transferItem.status = 'success';
					transferItem.progress = 100;
					transferItem.transferredBytes = Math.max(transferItem.transferredBytes, transferItem.totalBytes, item.rawSize, 0);
				}
			}

			if (result.canceled) {
				this.finishTask(task, 'canceled', `已取消批量传输：${items.length} 项`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
				this.schedulePostTransferReconcile(operation, transferContext);
				return false;
			}
			if (!result.ok) {
				this.finishTask(task, 'error', `批量传输完成 ${result.completed} 项，失败 ${result.failed} 项。`, { bytes: result.bytes, strategy: result.strategy, error: result.failures[0]?.message, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
				this.schedulePostTransferReconcile(operation, transferContext);
				return false;
			}
			if (operation === 'move') {
				const trashMetadataFailures = await this.removeMovedTrashMetadata(sourceDevice, items);
				if (trashMetadataFailures.length) {
					this.finishTask(task, 'error', `传输完成，但清理回收站记录失败 ${trashMetadataFailures.length} 项。`, { bytes: result.bytes, strategy: result.strategy, error: trashMetadataFailures[0], durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
					this.schedulePostTransferReconcile(operation, transferContext);
					return false;
				}
			}
			this.schedulePostTransferReconcile(operation, transferContext);
			this.applyOptimisticTransferResult(operation, transferContext, items);
			this.finishTask(task, 'success', `${operation === 'move' ? '剪切传输' : '批量传输'}完成：${result.completed} 项，${formatSize(result.bytes)}。`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond }, false);
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `批量传输失败：${message}`, { error: message });
			this.schedulePostTransferReconcile(operation, transferContext);
			return false;
		} finally {
			progressDisposable.dispose();
		}
	}

	/**
	 * Inserts a just-created item into the pane immediately instead of re-listing the whole directory.
	 * A forced re-list after every "new folder/file" was the slow part — on a large or high-latency
	 * remote directory it could take many seconds or even time out. The server already confirmed the
	 * create, so showing the row optimistically is both instant and accurate.
	 */
	private insertOptimisticPaneItem(side: 'left' | 'right', item: TurboFileFileItem): void {
		const state = this.paneStates[side];
		if (item.path && state.items.some(existing => existing.path === item.path)) {
			return;
		}
		state.items = this.sortPaneItems(side, [...state.items, item]);
		const device = this.getPaneDevice(side);
		if (device) {
			const cacheKey = this.getPaneDirectoryCacheKey(device, state.path);
			const cached = this.paneDirectoryCache.get(cacheKey);
			if (cached) {
				this.paneDirectoryCache.set(cacheKey, { ...cached, items: state.items });
			}
		}
		this.fileListRenderedRange[side] = undefined;
		this.render();
	}

	private async createFolder(side: 'left' | 'right'): Promise<void> {
		const state = this.paneStates[side];
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}

		const name = await this.showDialogPrompt('新建文件夹', '请输入新文件夹名称');
		if (!name?.trim()) {
			return;
		}

		const folderName = name.trim();
		const targetPath = joinPanePath(state.path, folderName, this.isWindowsDevice(device));
		const task = this.beginTask('mkdir', `新建文件夹 ${folderName}`, device.name);
		try {
			const result = await this.sshService.createDirectory(await this.toTransferEndpoint(device, targetPath));
			if (result.ok) {
				this.insertOptimisticPaneItem(side, {
					name: folderName,
					path: targetPath,
					size: '',
					rawSize: 0,
					modified: formatDate(Date.now()),
					rawModified: Date.now(),
					type: 'directory',
					directory: true
				});
				this.finishTask(task, 'success', `已创建文件夹：${folderName}`);
			} else {
				this.finishTask(task, 'error', `新建文件夹失败：${result.message}`, { error: result.message });
				await this.refreshPane(side, { force: true });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `新建文件夹失败：${message}`, { error: message });
		}
	}

	private async createFile(side: 'left' | 'right'): Promise<void> {
		const state = this.paneStates[side];
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}

		const name = await this.showDialogPrompt('新建文件', '请输入新文件名称');
		if (!name?.trim()) {
			return;
		}

		const fileName = name.trim();
		const targetPath = joinPanePath(state.path, fileName, this.isWindowsDevice(device));
		const task = this.beginTask('create-file', `新建文件 ${fileName}`, device.name);
		try {
			const result = await this.sshService.writeFile(await this.toTransferEndpoint(device, targetPath), '', 'utf8');
			if (result.ok) {
				this.insertOptimisticPaneItem(side, {
					name: fileName,
					path: targetPath,
					size: formatSize(0),
					rawSize: 0,
					modified: formatDate(Date.now()),
					rawModified: Date.now(),
					type: 'file'
				});
				this.finishTask(task, 'success', `已创建文件：${fileName}`);
			} else {
				this.finishTask(task, 'error', `新建文件失败：${result.message}`, { error: result.message });
				await this.refreshPane(side, { force: true });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `新建文件失败：${message}`, { error: message });
			await this.refreshPane(side, { force: true });
		}
	}

	private async deleteSelected(side: 'left' | 'right'): Promise<void> {
		const trashMode = this.paneStates[side].trashMode;
		if (isTurboFileTrashRootView(trashMode)) {
			await this.permanentlyDeleteSelectedTrashItems(side);
			return;
		}
		if (trashMode.browseItem) {
			await this.permanentlyDeleteTrashBrowseItems(side);
			return;
		}
		const items = this.getSelectedTransferItems(side);
		const device = this.getPaneDevice(side);
		if (!items.length || !device) {
			this.statusMessage = '请先选择要删除的文件或目录。';
			this.render();
			return;
		}

		const batch = items.length > 1;
		if (!await this.confirmDelete('删除确认', batch ? `确定删除选中的 ${items.length} 项吗？` : `确定删除 ${items[0].name} 吗？`, undefined, true)) {
			return;
		}

		const mutationContext = this.capturePaneMutationContext(side);
		this.removePaneItems(side, items);
		const task = this.beginTask('delete', batch ? `删除 ${items.length} 项` : `删除 ${items[0].name}`, device.name);
		try {
			this.updateTask(task, batch ? `正在删除 ${items.length} 项…` : `正在删除：${items[0].name}`, 40);
			const result = await this.moveUserItemsToTrash(device, items, task.progressId);
			if (result.completed > 0) {
				this.paneStates[side].trashHasItems = true;
			}
			this.updateTask(task, `正在刷新目录：${device.name}`, 90);
			await this.refreshPanesAfterDelete(mutationContext);
			if (!result.ok) {
				this.finishTask(task, 'error', `删除失败：${result.message}`, { error: result.message });
				return;
			}
			this.finishTask(task, 'success', batch ? `已删除：${items.length} 项` : `已删除：${items[0].name}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `删除失败：${message}`, { error: message });
			await this.refreshPanesAfterDelete(mutationContext);
		}
	}

	private async permanentlyDeleteSelected(side: 'left' | 'right'): Promise<boolean> {
		const trashMode = this.paneStates[side].trashMode;
		if (isTurboFileTrashRootView(trashMode)) {
			return this.permanentlyDeleteSelectedTrashItems(side);
		}
		if (trashMode.browseItem) {
			return this.permanentlyDeleteTrashBrowseItems(side);
		}

		const items = this.getSelectedTransferItems(side);
		const device = this.getPaneDevice(side);
		if (!items.length || !device) {
			this.statusMessage = localize('turbofile.selectItemsToDeletePermanently', "请先选择要永久删除的文件或目录。");
			this.render();
			return false;
		}

		if (!await this.confirmDelete(
			localize('turbofile.permanentDeleteTitle', "永久删除"),
			localize('turbofile.permanentDeleteMessage', "永久删除选中的 {0} 个项目吗？此操作无法撤销，且不会进入回收站。", items.length),
			undefined,
			true,
			localize('turbofile.deletePermanently', "永久删除")
		)) {
			return false;
		}

		const mutationContext = this.capturePaneMutationContext(side);
		const task = this.beginTask('delete', localize('turbofile.permanentDeleteTask', "永久删除 {0} 项", items.length), device.name);
		this.removePaneItems(side, items);
		try {
			this.updateTask(task, localize('turbofile.permanentDeletingItems', "正在永久删除 {0} 项…", items.length), 40);
			const connection = device.id === LOCAL_WINDOWS_DEVICE_ID ? undefined : await this.getSshConnectionOptions(device);
			const endpoints = await Promise.all(items.filter(item => !!item.path).map(item => this.toTransferEndpoint(device, item.path!, connection)));
			const result = await this.sshService.deletePaths(endpoints, true, { progressId: task.progressId });
			this.updateTask(task, localize('turbofile.refreshingDirectoryAfterPermanentDelete', "正在刷新目录：{0}", device.name), 90);
			await this.refreshPanesAfterDelete(mutationContext);
			if (!result.ok) {
				this.finishTask(task, 'error', this.formatPermanentDeleteError(result.message), { error: result.message, durationMs: Date.now() - task.startedAt });
				return false;
			}
			this.finishTask(task, 'success', localize('turbofile.permanentDeleteSucceeded', "已永久删除：{0} 项", items.length), { durationMs: Date.now() - task.startedAt });
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', this.formatPermanentDeleteError(message), { error: message, durationMs: Date.now() - task.startedAt });
			await this.refreshPanesAfterDelete(mutationContext);
			return false;
		}
	}

	private formatPermanentDeleteError(message: string): string {
		return localize('turbofile.permanentDeleteFailed', "永久删除失败：{0}", message);
	}

	private removePaneItems(side: 'left' | 'right', items: TurboFileFileItem[]): void {
		const context = this.capturePaneMutationContext(side);
		const sides = context ? this.getPanesShowingMutationContext(context) : [side];
		let changed = false;
		for (const visibleSide of sides) {
			changed = this.removePaneItemsFromState(visibleSide, items) || changed;
		}
		if (changed) {
			this.render();
		}
	}

	private removePaneItemsFromState(side: 'left' | 'right', items: TurboFileFileItem[]): boolean {
		const paths = new Set(items.map(item => item.path).filter((path): path is string => !!path));
		if (!paths.size) {
			return false;
		}
		const state = this.paneStates[side];
		const remainingItems = state.items.filter(item => !item.path || !paths.has(item.path));
		if (remainingItems.length === state.items.length) {
			return false;
		}
		state.items = remainingItems;
		this.clearPaneSelection(side);
		this.fileListRenderedRange[side] = undefined;
		// A directory request that started before this mutation can contain the deleted rows. Make the
		// request stale immediately so it can never overwrite the optimistic state while deletion runs.
		this.paneRequestSeq[side]++;
		state.loading = false;
		this.postTransferReconcileContexts.delete(side);
		this.postTransferReconcileGeneration[side]++;
		const device = this.getPaneDevice(side);
		if (device) {
			const cacheKey = this.getPaneDirectoryCacheKey(device, state.path);
			this.paneDirectoryCache.delete(cacheKey);
			this.paneDirectoryInflight.delete(cacheKey);
		}
		this.rememberPaneDeviceSnapshot(side);
		return true;
	}

	private capturePaneMutationContext(side: 'left' | 'right'): TurboFilePaneMutationContext | undefined {
		const device = this.getPaneDevice(side);
		if (!device) {
			return undefined;
		}
		const state = this.paneStates[side];
		return {
			deviceId: device.id,
			path: state.path,
			windowsPath: this.isWindowsDevice(device),
			trashRoot: isTurboFileTrashRootView(state.trashMode),
			trashBrowseItemId: state.trashMode.browseItem?.id
		};
	}

	private getPanesShowingMutationContext(context: TurboFilePaneMutationContext): ('left' | 'right')[] {
		return (['left', 'right'] as const).filter(side => {
			if (this.getPaneDevice(side)?.id !== context.deviceId) {
				return false;
			}
			const state = this.paneStates[side];
			if (context.trashRoot) {
				return isTurboFileTrashRootView(state.trashMode);
			}
			if (context.trashBrowseItemId) {
				return state.trashMode.browseItem?.id === context.trashBrowseItemId
					&& this.pathsEqualForDevice(state.path, context.path, context.windowsPath);
			}
			return !state.trashMode.active && this.pathsEqualForDevice(state.path, context.path, context.windowsPath);
		});
	}

	private async refreshPanesAfterDelete(context: TurboFilePaneMutationContext | undefined): Promise<void> {
		if (!context) {
			return;
		}
		await Promise.all(this.getPanesShowingMutationContext(context).map(async side => {
			const state = this.paneStates[side];
			if (isTurboFileTrashRootView(state.trashMode)) {
				await this.refreshTrashPane(side);
			} else if (state.trashMode.browseItem) {
				await this.refreshTrashBrowsePane(side, true);
			} else {
				await this.refreshPane(side, { force: true, silent: true });
			}
		}));
	}

	private applyOptimisticRename(side: 'left' | 'right', item: TurboFileFileItem, targetName: string, targetPath: string): TurboFileOptimisticRenameSnapshot | undefined {
		if (!item.path) {
			return undefined;
		}

		const state = this.paneStates[side];
		const index = state.items.findIndex(candidate => candidate.path === item.path);
		if (index < 0) {
			return undefined;
		}

		const snapshot: TurboFileOptimisticRenameSnapshot = {
			panePath: state.path,
			index,
			originalItem: state.items[index],
			renamedPath: targetPath,
			selectedPath: state.selectedPath,
			selectedPaths: Array.from(state.selectedPaths),
			selectionAnchorPath: state.selectionAnchorPath
		};
		const now = Date.now();
		const renamedItem: TurboFileFileItem = {
			...state.items[index],
			name: targetName,
			path: targetPath,
			modified: formatDate(now),
			rawModified: now
		};

		state.items = [...state.items];
		state.items[index] = renamedItem;
		if (state.selectedPath === item.path) {
			state.selectedPath = targetPath;
		}
		if (state.selectionAnchorPath === item.path) {
			state.selectionAnchorPath = targetPath;
		}
		if (state.selectedPaths.delete(item.path)) {
			state.selectedPaths.add(targetPath);
		}
		state.items = this.sortPaneItems(side, state.items);
		this.fileListRenderedRange[side] = undefined;
		const device = this.getPaneDevice(side);
		if (device) {
			this.paneDirectoryCache.delete(this.getPaneDirectoryCacheKey(device, state.path));
		}
		this.statusMessage = `已重命名：${item.name} -> ${targetName}`;
		this.rememberPaneDeviceSnapshot(side);
		this.render();
		return snapshot;
	}

	private revertOptimisticRename(side: 'left' | 'right', snapshot: TurboFileOptimisticRenameSnapshot): void {
		const state = this.paneStates[side];
		if (state.path !== snapshot.panePath) {
			return;
		}

		const renamedIndex = state.items.findIndex(item => item.path === snapshot.renamedPath);
		state.items = [...state.items];
		if (renamedIndex >= 0) {
			state.items[renamedIndex] = snapshot.originalItem;
		} else {
			state.items.splice(Math.min(snapshot.index, state.items.length), 0, snapshot.originalItem);
		}
		state.items = this.sortPaneItems(side, state.items);
		state.selectedPath = snapshot.selectedPath;
		state.selectedPaths = new Set(snapshot.selectedPaths);
		state.selectionAnchorPath = snapshot.selectionAnchorPath;
		this.fileListRenderedRange[side] = undefined;
		this.rememberPaneDeviceSnapshot(side);
		this.render();
	}

	private async renameSelected(side: 'left' | 'right'): Promise<void> {
		const item = this.getSelectedItem(side);
		const device = this.getPaneDevice(side);
		if (!item?.path || !device || item.parent) {
			this.statusMessage = '请先选择要重命名的文件或目录。';
			this.render();
			return;
		}

		this.startInlineRename(side, item);
	}

	private startInlineRename(side: 'left' | 'right', item: TurboFileFileItem): void {
		if (!item.path || item.parent) {
			return;
		}
		this.inlineRename = {
			side,
			path: item.path,
			originalName: item.name,
			directory: !!item.directory
		};
		this.ensureItemInSelection(side, item);
		this.statusMessage = `正在重命名：${item.name}`;
		this.render();
	}

	private isInlineRenameTarget(side: 'left' | 'right', item: TurboFileFileItem): boolean {
		return !!item.path && this.inlineRename?.side === side && this.inlineRename.path === item.path;
	}

	private validateRenameName(side: 'left' | 'right', item: TurboFileFileItem, value: string): string | undefined {
		const device = this.getPaneDevice(side);
		if (!value.trim()) {
			return '名称不能为空。';
		}
		if (value === '.' || value === '..') {
			return '不能使用 . 或 .. 作为名称。';
		}
		if (value.includes('/') || value.includes('\\')) {
			return '名称不能包含路径分隔符。';
		}
		if (device && this.isWindowsDevice(device) && /[<>:"|?*]/.test(value)) {
			return 'Windows 名称不能包含 < > : " | ? *。';
		}
		const caseInsensitive = !device || this.isWindowsDevice(device);
		const nameKey = caseInsensitive ? value.toLocaleLowerCase() : value;
		const duplicate = this.paneStates[side].items.some(candidate => {
			if (!candidate.path || candidate.parent || candidate.path === item.path) {
				return false;
			}
			const candidateKey = caseInsensitive ? candidate.name.toLocaleLowerCase() : candidate.name;
			return candidateKey === nameKey;
		});
		if (duplicate) {
			return '已存在同名文件或目录。';
		}
		return undefined;
	}

	private async performRename(side: 'left' | 'right', item: TurboFileFileItem, nextName: string): Promise<void> {
		const device = this.getPaneDevice(side);
		if (!item.path || !device || item.parent || !nextName.trim() || nextName === item.name) {
			return;
		}
		if (isTurboFileTrashRootView(this.paneStates[side].trashMode) && item.trashItem) {
			const task = this.beginTask('rename', `重命名 ${item.name}`, `${item.name} -> ${nextName}`);
			try {
				const result = await this.sshService.renameTrashItem({
					device: await this.toTrashDevice(device),
					item: item.trashItem,
					name: nextName
				});
				if (result.ok) {
					this.finishTask(task, 'success', `已重命名：${item.name} -> ${nextName}`);
				} else {
					this.finishTask(task, 'error', `重命名失败：${result.message}`, { error: result.message });
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.finishTask(task, 'error', `重命名失败：${message}`, { error: message });
			} finally {
				await this.refreshTrashPane(side);
			}
			return;
		}

		const targetName = nextName;
		const targetPath = joinPanePath(this.paneStates[side].path, targetName, this.isWindowsDevice(device));
		const optimisticRename = this.applyOptimisticRename(side, item, targetName, targetPath);
		const task = this.beginTask('rename', `重命名 ${item.name}`, `${item.name} -> ${targetName}`);
		try {
			const result = await this.sshService.renamePath(await this.toTransferEndpoint(device, item.path), targetPath);
			if (result.ok) {
				this.updateTask(task, `正在刷新目录：${device.name}`, 90);
				this.finishTask(task, 'success', `已重命名：${item.name} -> ${targetName}`);
			} else {
				if (optimisticRename) {
					this.revertOptimisticRename(side, optimisticRename);
				}
				this.finishTask(task, 'error', `重命名失败：${result.message}`, { error: result.message });
			}
		} catch (error) {
			if (optimisticRename) {
				this.revertOptimisticRename(side, optimisticRename);
			}
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `重命名失败：${message}`, { error: message });
		}
	}

	private async previewSelected(side: 'left' | 'right', explicitItem?: TurboFileFileItem): Promise<void> {
		const item = explicitItem ?? this.getSelectedItem(side);
		const device = this.getPaneDevice(side);
		if (!item?.path || !device || item.parent || item.directory) {
			this.statusMessage = '请先选择一个文件进行预览。';
			this.render();
			return;
		}

		if (!isImageFile(item.name)) {
			void this.openNativeDocument(side, item, device);
			return;
		}

		this.openImageGrid(side, item.path, true, 'file-list');
	}

	private openImageGrid(side: 'left' | 'right', selectedPath?: string, previewVisible: boolean = false, previewOrigin: 'file-list' | 'grid' = 'grid', displayMode: TurboFileImageGridDisplayMode = 'page'): void {
		const state = this.paneStates[side];
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		if (displayMode === 'pane') {
			this.releaseImageGridState(this.paneImageGridStates[side]);
		} else if (this.imageGridState?.displayMode === 'page') {
			this.releaseImageGridState(this.imageGridState);
		}
		const images = state.items
			.filter(item => !item.parent && !item.directory && !!item.path && isImageFile(item.name))
			.map(item => {
				return {
					item,
					thumbnailContent: '',
					thumbnailMime: 'image/jpeg',
					thumbnailLoading: false,
					previewContent: '',
					previewMime: getMimeType(item.name),
					previewLoading: false
				};
			});

		if (!images.length) {
			this.statusMessage = '当前目录没有可展开浏览的图片。';
			this.render();
			return;
		}

		sortImageGridImages(images, this.imageGridSortKey, this.imageGridSortDescending, this.getImageGridSizeSortBasis());
		const selectedPanePaths = new Set(state.selectedPaths);
		const selectedIndexCandidate = selectedPath
			? images.findIndex(image => image.item.path === selectedPath)
			: images.findIndex(image => !!image.item.path && selectedPanePaths.has(image.item.path));
		const selectedIndex = Math.max(0, selectedIndexCandidate);
		const selectedIndexes = new Set<number>();
		for (const [index, image] of images.entries()) {
			if (image.item.path && (selectedPanePaths.has(image.item.path) || image.item.path === selectedPath)) {
				selectedIndexes.add(index);
			}
		}
		if (!selectedIndexes.size) {
			selectedIndexes.add(selectedIndex);
		}
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		const nextState: TurboFileImageGridState = {
			side,
			path: state.path,
			displayMode,
			trashContext: state.trashMode.active ? {
				browseItem: state.trashMode.browseItem,
				windowsPath: this.isWindowsDevice(this.getPaneDevice(side)!)
			} : undefined,
			images,
			selectedIndex,
			selectedIndexes,
			selectionAnchorIndex: selectedIndex,
			columns: IMAGE_GRID_COLUMN_DEFAULT,
			thumbnailScale: 1,
			sortKey: this.imageGridSortKey,
			sortDescending: this.imageGridSortDescending,
			previewVisible,
			previewOrigin,
			previewZoom: 1,
			previewPanX: 0,
			previewPanY: 0,
			previewFitPending: true,
			previewSamplingMode: this.defaultImagePreviewSamplingMode,
			pixelInspectorVisible: false,
			histogramVisible: false,
			histogramX: 104,
			histogramY: 72,
			fileListScrollTop: state.scrollTop,
			scrollTop: 0,
			viewportHeight: this.getImageGridDefaultViewportHeight(),
			thumbnailLoadToken: 0,
			loadedThumbnailIndexes: new Set<number>(),
			loadedPreviewIndexes: new Set<number>(),
			scrollRaf: 0,
			dimensionMetadataLoading: false,
			dimensionMetadataLoaded: false,
			dimensionMetadataGeneration: 0
		};
		this.imageGridState = nextState;
		if (displayMode === 'pane') {
			this.paneImageGridStates[side] = nextState;
		}
		this.imageGridCtrlWheelDeltaRemainder = 0;
		if (displayMode === 'page') {
			this.activePage = 'images';
			this.updateTransferTabsVisibility();
			this.notifyActivePageChanged();
		}
		this.statusMessage = `已展开 ${this.getSideLabel(side)} 图片：${images.length} 张。`;
		this.render();
		if (this.getImageGridSizeSortBasis() === 'dimensions') {
			void this.ensureImageGridDimensionMetadata(nextState);
		}
		if (previewVisible) {
			this.imageGridPreviewRequestSeq++;
			void this.ensureImageGridPreviewLoaded(nextState, selectedIndex, this.imageGridPreviewRequestSeq);
			this.scheduleImageGridPreviewNeighborsLoaded(nextState, selectedIndex);
		}
	}

	private closeImageGridPage(state: TurboFileImageGridState | undefined = this.imageGridState): void {
		this.imageGridCtrlWheelDeltaRemainder = 0;
		this.disposeImageGridObserver();
		this.clearImageGridScrollTimer();
		this.clearImageGridScrollRaf();
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		this.releaseImageGridState(state);
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		if (state) {
			this.restoreFileListScrollAfterImageGrid(state.side, state.fileListScrollTop);
		}
		if (!state || state.displayMode === 'page') {
			this.activePage = 'transfer';
			this.updateTransferTabsVisibility();
			this.notifyActivePageChanged();
		}
		this.imageGridState = state ? (this.paneImageGridStates[state.side] ?? this.paneImageGridStates[this.getOppositeSide(state.side)]) : undefined;
		this.render();
	}

	private restoreFileListScrollAfterImageGrid(side: 'left' | 'right', scrollTop: number): void {
		const state = this.paneStates[side];
		state.scrollTop = Math.max(0, scrollTop);
		this.fileListRenderedRange[side] = undefined;
		this.clearFileListScrollRaf(side);
	}

	private selectImageGridItem(index: number, event?: MouseEvent | KeyboardEvent): void {
		const state = this.imageGridState;
		if (!state || index < 0 || index >= state.images.length) {
			return;
		}

		const isToggle = !!event && (event.ctrlKey || event.metaKey);
		const anchorIndex = state.selectionAnchorIndex;
		const isRange = !!event?.shiftKey && anchorIndex !== undefined;
		if (isRange) {
			this.setImageGridRangeSelection(state, anchorIndex, index);
		} else if (isToggle) {
			if (state.selectedIndexes.has(index)) {
				state.selectedIndexes.delete(index);
			} else {
				state.selectedIndexes.add(index);
			}
			state.selectedIndex = index;
			state.selectionAnchorIndex = index;
		} else {
			this.setSingleImageGridSelection(state, index);
		}

		this.updateImageGridSelection(state);
		this.updateImageGridSelectionStatus(state);
		this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(index, state.images.length), state);
	}

	private selectImageGridItemWithPointer(state: TurboFileImageGridState, index: number, event: PointerEvent): void {
		if (event.button !== 0) {
			return;
		}
		const target = event.currentTarget;
		if (target instanceof HTMLElement) {
			target.focus({ preventScroll: true });
		}
		if (!event.ctrlKey && !event.metaKey && !event.shiftKey && state.selectedIndexes.has(index) && state.selectedIndexes.size > 1) {
			// Preserve an existing multi-selection until click. Chromium suppresses click after a drag,
			// so dragging any selected card keeps the complete selection snapshot.
			state.selectedIndex = index;
			return;
		}
		this.selectImageGridItem(index, event);
	}

	private completeImageGridItemPointerSelection(state: TurboFileImageGridState, index: number, event: MouseEvent): void {
		if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || !state.selectedIndexes.has(index) || state.selectedIndexes.size <= 1) {
			return;
		}
		this.selectImageGridItem(index, event);
	}

	private selectImageGridItemWithContextMenu(index: number, event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const state = this.imageGridState;
		if (!state || index < 0 || index >= state.images.length) {
			return;
		}
		if (!event.ctrlKey && !event.metaKey && !event.shiftKey && state.selectedIndexes.has(index)) {
			state.selectedIndex = index;
			state.selectionAnchorIndex = index;
			this.updateImageGridSelection(state);
			this.updateImageGridSelectionStatus(state);
		} else {
			this.selectImageGridItem(index, event);
		}

		const anchor = new StandardMouseEvent(getWindow(event), event);
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [
				this.menuAction('turbofile.imageGrid.delete', localize('turbofile.delete', "删除"), Codicon.trash, () => { void this.deleteSelectedImageGridItems(state); }),
				this.menuAction('turbofile.imageGrid.deletePermanently', localize('turbofile.deletePermanently', "永久删除"), Codicon.trash, () => { void this.permanentlyDeleteSelectedImageGridItems(state); })
			],
			skipTelemetry: true
		});
	}

	private setSingleImageGridSelection(state: TurboFileImageGridState, index: number): void {
		state.selectedIndexes.clear();
		state.selectedIndexes.add(index);
		state.selectedIndex = index;
		state.selectionAnchorIndex = index;
	}

	private setImageGridRangeSelection(state: TurboFileImageGridState, anchorIndex: number, index: number): void {
		state.selectedIndexes.clear();
		const start = Math.max(0, Math.min(anchorIndex, index));
		const end = Math.min(state.images.length - 1, Math.max(anchorIndex, index));
		for (let candidate = start; candidate <= end; candidate++) {
			state.selectedIndexes.add(candidate);
		}
		state.selectedIndex = index;
	}

	private selectAllImageGridItems(state: TurboFileImageGridState | undefined = this.imageGridState): void {
		if (!state || state.previewVisible) {
			return;
		}

		state.selectedIndexes.clear();
		for (let index = 0; index < state.images.length; index++) {
			state.selectedIndexes.add(index);
		}
		if (state.images.length) {
			state.selectedIndex = Math.max(0, Math.min(state.selectedIndex, state.images.length - 1));
			state.selectionAnchorIndex = state.selectedIndex;
		} else {
			state.selectedIndex = 0;
			state.selectionAnchorIndex = undefined;
		}
		this.updateImageGridSelection(state);
		this.updateImageGridSelectionStatus(state);
	}

	private moveImageGridPreview(delta: number, state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		if (!state?.images.length) {
			return;
		}
		this.setActiveImageGridState(state);
		const baseIndex = state.previewPendingIndex ?? state.selectedIndex;
		const nextIndex = (baseIndex + delta + state.images.length) % state.images.length;
		if (nextIndex === state.selectedIndex) {
			this.imageGridPreviewRequestSeq++;
			state.previewPendingIndex = undefined;
			state.previewPendingRequestSeq = undefined;
			this.scheduleImageGridPreviewNeighborsLoaded(state, state.selectedIndex);
			return;
		}
		this.imageGridPreviewRequestSeq++;
		const requestSeq = this.imageGridPreviewRequestSeq;
		state.previewPendingIndex = nextIndex;
		state.previewPendingRequestSeq = requestSeq;
		void this.ensureImageGridPreviewLoaded(state, nextIndex, requestSeq);
		this.scheduleImageGridPreviewNeighborsLoaded(state, nextIndex);
		this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(nextIndex, state.images.length), state);
		this.commitImageGridPreviewIndexIfReady(state, nextIndex, requestSeq);
	}

	private commitImageGridPreviewIndexIfReady(state: TurboFileImageGridState, index: number, requestSeq: number): boolean {
		if (this.getActiveImageGridPreviewState() !== state || !state.previewVisible || state.previewPendingIndex !== index || state.previewPendingRequestSeq !== requestSeq) {
			return false;
		}
		const image = state.images[index];
		const src = this.getImagePreviewSource(image);
		if (!image || (src ? !this.isImagePreviewDecoded(image, src) : !image.previewError)) {
			return false;
		}
		this.setSingleImageGridSelection(state, index);
		state.previewZoom = 1;
		state.previewPanX = 0;
		state.previewPanY = 0;
		state.previewFitPending = true;
		state.previewPendingIndex = undefined;
		state.previewPendingRequestSeq = undefined;
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
		this.updateImagePreviewOverlay(state);
		return true;
	}

	private openImageGridPreview(index: number): void {
		const state = this.imageGridState;
		if (!state || index < 0 || index >= state.images.length) {
			return;
		}
		if (!state.selectedIndexes.has(index)) {
			this.setSingleImageGridSelection(state, index);
		} else {
			state.selectedIndex = index;
			state.selectionAnchorIndex = index;
		}
		state.selectedIndex = index;
		state.previewOrigin = 'grid';
		state.previewVisible = true;
		state.previewZoom = 1;
		state.previewPanX = 0;
		state.previewPanY = 0;
		state.previewFitPending = true;
		state.previewSamplingMode = this.defaultImagePreviewSamplingMode;
		state.previewPendingIndex = undefined;
		state.previewPendingRequestSeq = undefined;
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.imageGridPreviewRequestSeq++;
		this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
		this.render();
		void this.ensureImageGridPreviewLoaded(state, index, this.imageGridPreviewRequestSeq);
		this.scheduleImageGridPreviewNeighborsLoaded(state, index);
		this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(index, state.images.length), state);
	}

	private closeImageGridPreview(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		if (!state) {
			return;
		}
		this.setActiveImageGridState(state);
		if (state.previewOrigin === 'file-list') {
			this.closeImageGridPage();
			return;
		}
		this.imageGridPreviewRequestSeq++;
		this.clearImageGridPreviewPrefetchTimer();
		state.previewVisible = false;
		state.previewZoom = 1;
		state.previewPanX = 0;
		state.previewPanY = 0;
		state.previewFitPending = true;
		state.previewSamplingMode = this.defaultImagePreviewSamplingMode;
		state.previewPendingIndex = undefined;
		state.previewPendingRequestSeq = undefined;
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
		this.render();
	}

	private toggleImagePreviewPixelInspector(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		if (!state?.previewVisible) {
			return;
		}
		this.setActiveImageGridState(state);
		state.pixelInspectorVisible = !state.pixelInspectorVisible;
		this.updateImagePreviewToggleButton('pixel-inspector', state.pixelInspectorVisible);
		this.updateImagePreviewPixelInspectorInPlace(state);
	}

	private toggleImagePreviewHistogram(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		if (!state?.previewVisible) {
			return;
		}
		this.setActiveImageGridState(state);
		state.histogramVisible = !state.histogramVisible;
		this.updateImagePreviewToggleButton('histogram', state.histogramVisible);
		this.updateImagePreviewHistogramInPlace(state);
	}

	private toggleImagePreviewSamplingMode(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		if (!state?.previewVisible) {
			return;
		}
		this.setActiveImageGridState(state);
		state.previewSamplingMode = state.previewSamplingMode === 'lossless' ? 'smooth' : 'lossless';
		this.updateImagePreviewToggleButton('lossless-sampling', state.previewSamplingMode === 'lossless');
		this.renderImagePreviewCanvas(state);
	}

	private zoomImagePreviewByOculanteStep(step: number, state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		const render = this.imagePreviewRender;
		if (!state?.previewVisible || !render?.ready) {
			return;
		}
		this.setActiveImageGridState(state);
		const rect = render.canvas.getBoundingClientRect();
		const anchor = {
			x: rect.width / 2,
			y: rect.height / 2
		};
		this.setImageGridPreviewZoom(state.previewZoom + step * state.previewZoom * IMAGE_PREVIEW_ZOOM_RATIO, anchor, state);
	}

	private setImageGridPreviewZoom(zoom: number, anchor?: { x: number; y: number }, state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		const render = this.imagePreviewRender;
		if (!state?.previewVisible || !render?.ready) {
			return;
		}
		this.setActiveImageGridState(state);
		const oldScale = Math.max(IMAGE_PREVIEW_ZOOM_MIN, state.previewZoom);
		const newScale = Math.min(IMAGE_PREVIEW_ZOOM_MAX, Math.max(IMAGE_PREVIEW_ZOOM_MIN, zoom));
		if (newScale === oldScale) {
			return;
		}
		const rect = render.canvas.getBoundingClientRect();
		const zoomAnchor = anchor ?? { x: rect.width / 2, y: rect.height / 2 };
		const delta = newScale - oldScale;
		state.previewPanX -= ((zoomAnchor.x - state.previewPanX) * delta) / oldScale;
		state.previewPanY -= ((zoomAnchor.y - state.previewPanY) * delta) / oldScale;
		state.previewZoom = newScale;
		state.previewFitPending = false;
		this.limitImagePreviewOffset(state, render);
		this.renderImagePreviewCanvas(state);
	}

	private resetImagePreviewView(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void {
		if (!state?.previewVisible) {
			return;
		}
		this.setActiveImageGridState(state);
		state.previewFitPending = true;
		this.renderImagePreviewCanvas(state);
	}

	private updateImagePreviewZoomValue(state: TurboFileImageGridState): void {
		const controls = this.container?.querySelector<HTMLElement>('.turbofile-image-preview-zoom-controls');
		const zoomValue = controls?.querySelector<HTMLButtonElement>('.turbofile-image-preview-zoom-value');
		if (zoomValue) {
			zoomValue.textContent = this.getImagePreviewZoomLabel(state);
		}
		const transientButtons = controls?.querySelectorAll<HTMLButtonElement>('.turbofile-image-preview-action.is-transient');
		if (transientButtons?.[0]) {
			transientButtons[0].disabled = state.previewZoom <= IMAGE_PREVIEW_ZOOM_MIN;
		}
		if (transientButtons?.[1]) {
			transientButtons[1].disabled = state.previewZoom >= IMAGE_PREVIEW_ZOOM_MAX;
		}
		const resetButton = controls?.querySelector<HTMLButtonElement>('.turbofile-image-preview-action.is-reset');
		if (resetButton) {
			resetButton.disabled = state.previewFitPending;
		}
	}

	private getImagePreviewZoomLabel(state: TurboFileImageGridState): string {
		return `${Math.round(state.previewZoom * 100)}%`;
	}

	private clearImagePreviewRender(): void {
		this.imagePreviewResizeObserver?.disconnect();
		this.imagePreviewResizeObserver = undefined;
		this.imagePreviewRender = undefined;
		this.imagePreviewRenderSeq++;
	}

	private async downloadImageGridPreview(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): Promise<void> {
		const image = state?.images[state.selectedIndex];
		const device = state ? this.getPaneDevice(state.side) : undefined;
		if (!state || !image?.item.path || !device) {
			return;
		}
		this.setActiveImageGridState(state);
		try {
			// Always save the true original bytes — the on-screen preview may be a display-resolution
			// downscale for very large images, but a download must produce the real file.
			const result = await this.sshService.readImage(await this.toTransferEndpoint(device, image.item.path), {
				encoding: 'base64',
				forceOriginal: true,
				maxBytes: 256 * 1024 * 1024,
				sourceSize: image.item.rawSize,
				sourceModified: image.item.rawModified
			});
			if (!result.ok || !result.content) {
				throw new Error(result.message || '无法读取原始图片。');
			}
			const src = `data:${result.mime || getMimeType(image.item.name)};base64,${result.content}`;
			const ownerDocument = this.container?.ownerDocument ?? document;
			const anchor = ownerDocument.createElement('a');
			anchor.href = src;
			anchor.download = image.item.name;
			anchor.rel = 'noopener';
			anchor.style.display = 'none';
			ownerDocument.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.statusMessage = `下载图片失败：${message}`;
			this.render();
		}
	}

	private canCopyPreviewImage(): boolean {
		const gridState = this.getActiveImageGridPreviewState();
		if (gridState?.previewVisible) {
			const image = gridState.images[gridState.selectedIndex];
			return !!image && !!this.getImagePreviewSource(image);
		}
		return false;
	}

	private async copyPreviewImageToClipboard(): Promise<void> {
		try {
			const gridState = this.getActiveImageGridPreviewState();
			if (gridState?.previewVisible) {
				this.setActiveImageGridState(gridState);
				const image = gridState.images[gridState.selectedIndex];
				const device = this.getPaneDevice(gridState.side);
				if (!image?.item.path || !device) {
					return;
				}
				const result = await this.sshService.readImage(await this.toTransferEndpoint(device, image.item.path), {
					encoding: 'base64',
					forceOriginal: true,
					maxBytes: 128 * 1024 * 1024,
					sourceSize: image.item.rawSize,
					sourceModified: image.item.rawModified
				});
				if (!result.ok || !result.content) {
					throw new Error(result.message || '无法读取预览图片。');
				}
				await this.writePreviewImageContentToClipboard(result.content, result.mime, image.item.name);
				return;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.statusMessage = `复制图片失败：${message}`;
			this.showDialogInfo('复制图片失败', message);
		}
	}

	private async writePreviewImageContentToClipboard(content: string, mime: string, name: string): Promise<void> {
		const result = await this.sshService.writeClipboardImage(content, mime, 'base64');
		if (!result.ok) {
			throw new Error(result.message || '复制图片失败。');
		}
		this.statusMessage = `已复制图片：${name}`;
	}

	private getImageGridTrashRelativePath(state: TurboFileImageGridState, path: string): string | undefined {
		const item = state.trashContext?.browseItem;
		if (!item || !isTurboFileTrashBrowsePathAllowed(item.payloadPath, path, state.trashContext!.windowsPath)) {
			return undefined;
		}
		const windowsPath = state.trashContext!.windowsPath;
		const root = windowsPath ? item.payloadPath.replace(/\//g, '\\').replace(/\\+$/, '') : item.payloadPath.replace(/\\/g, '/').replace(/\/+$/, '');
		const candidate = windowsPath ? path.replace(/\//g, '\\') : path.replace(/\\/g, '/');
		const relativePath = candidate.slice(root.length).replace(/^[\\/]+/, '');
		return relativePath || undefined;
	}

	private async restoreSelectedImageGridItems(state: TurboFileImageGridState): Promise<void> {
		const device = this.getPaneDevice(state.side);
		const context = state.trashContext;
		const targets = this.getImageGridDeleteTargets(state).filter(({ image }) => !!image.item.path);
		if (!device || !context || !targets.length) {
			return;
		}

		try {
			const trashDevice = await this.toTrashDevice(device);
			let result: ITurboFileTrashOperationResult;
			if (context.browseItem) {
				const paths = targets.map(({ image }) => ({
					relativePath: this.getImageGridTrashRelativePath(state, image.item.path!) ?? '',
					type: image.item.type
				}));
				result = await this.sshService.restoreTrashPaths({ device: trashDevice, item: context.browseItem, paths, conflictPolicy: 'cancel' });
				const conflicts = result.results.filter(item => item.conflict && item.relativePath).map(item => item.relativePath!);
				if (conflicts.length && await this.confirmImageGridRestoreConflicts(conflicts.length)) {
					const retry = await this.sshService.restoreTrashPaths({
						device: trashDevice,
						item: context.browseItem,
						paths: paths.filter(path => conflicts.includes(path.relativePath)),
						conflictPolicy: 'keepBoth'
					});
					result = this.mergeTrashRestoreResults(result, retry);
				}
			} else {
				const items = targets.map(({ image }) => image.item.trashItem).filter((item): item is ITurboFileTrashItem => !!item);
				result = await this.sshService.restoreTrashItems({ device: trashDevice, items, conflictPolicy: 'cancel' });
				const itemsById = new Map(items.map(item => [item.id, item]));
				const conflicts = result.results.filter(item => item.conflict && item.id).map(item => itemsById.get(item.id!)).filter((item): item is ITurboFileTrashItem => !!item);
				if (conflicts.length && await this.confirmImageGridRestoreConflicts(conflicts.length)) {
					const retry = await this.sshService.restoreTrashItems({ device: trashDevice, items: conflicts, conflictPolicy: 'keepBoth' });
					result = this.mergeTrashRestoreResults(result, retry);
				}
			}

			const successfulImages = new Set<TurboFileImageGridImage>();
			if (context.browseItem) {
				const successfulPaths = new Set(result.results.filter(item => item.ok && item.relativePath).map(item => context.windowsPath ? item.relativePath!.toLocaleLowerCase() : item.relativePath!));
				for (const target of targets) {
					const relativePath = this.getImageGridTrashRelativePath(state, target.image.item.path!);
					if (relativePath && successfulPaths.has(context.windowsPath ? relativePath.toLocaleLowerCase() : relativePath)) {
						successfulImages.add(target.image);
					}
				}
			} else {
				const successfulIds = new Set(result.results.filter(item => item.ok && item.id).map(item => item.id));
				for (const target of targets) {
					if (target.image.item.trashItem && successfulIds.has(target.image.item.trashItem.id)) {
						successfulImages.add(target.image);
					}
				}
			}

			this.removeRestoredImageGridItems(state, successfulImages, new Set(targets.map(target => target.image)));
			this.statusMessage = result.failed
				? localize('turbofile.imageGridRestorePartial', "已还原 {0} 张图片，失败 {1} 张。", result.completed, result.failed)
				: localize('turbofile.imageGridRestoreComplete', "已还原 {0} 张图片。", result.completed);
			const restoredPaths = result.results.filter(item => item.ok).map(item => item.restoredPath ?? item.path);
			if (!state.images.length) {
				this.closeImageGridPage(state);
				if (context.browseItem) {
					// Restoring the final child removes the trash payload directory and its metadata.
					// Leave that now-invalid directory before refreshing so the pane returns to the
					// recycle-bin root instead of surfacing an ENOENT listing error.
					await this.leaveTrashDirectory(state.side);
				} else {
					await this.refreshTrashPane(state.side);
				}
			} else {
				this.updateImageGridAfterLocalMutation(state);
				await this.refreshTrashPane(state.side);
			}
			await this.refreshVisibleRestoredPaths(restoredPaths);
		} catch (error) {
			this.statusMessage = localize('turbofile.imageGridRestoreFailed', "还原图片失败：{0}", error instanceof Error ? error.message : String(error));
			this.updateImageGridSelection(state);
		}
	}

	private async confirmImageGridRestoreConflicts(conflictCount: number): Promise<boolean> {
		return this.showDialogConfirm(
			localize('turbofile.restoreConflictTitle', "还原名称冲突"),
			localize('turbofile.restoreImageConflictMessage', "原位置已有 {0} 张同名图片，是否自动添加序号并保留两者？", conflictCount),
			undefined,
			false,
			localize('turbofile.keepBoth', "保留两者")
		);
	}

	private mergeTrashRestoreResults(first: ITurboFileTrashOperationResult, retry: ITurboFileTrashOperationResult): ITurboFileTrashOperationResult {
		const results = [...first.results.filter(item => !item.conflict), ...retry.results];
		const completed = results.filter(item => item.ok).length;
		return {
			ok: results.every(item => item.ok),
			message: retry.message,
			completed,
			failed: results.length - completed,
			results
		};
	}

	private removeRestoredImageGridItems(state: TurboFileImageGridState, successfulImages: Set<TurboFileImageGridImage>, attemptedImages: Set<TurboFileImageGridImage>): void {
		const firstRemovedIndex = state.images.findIndex(image => successfulImages.has(image));
		const loadedThumbnailImages = new Set(Array.from(state.loadedThumbnailIndexes, index => state.images[index]).filter((image): image is TurboFileImageGridImage => !!image));
		const loadedPreviewImages = new Set(Array.from(state.loadedPreviewIndexes, index => state.images[index]).filter((image): image is TurboFileImageGridImage => !!image));
		const pendingPreviewImage = state.previewPendingIndex === undefined ? undefined : state.images[state.previewPendingIndex];
		state.thumbnailLoadToken++;
		for (let index = state.images.length - 1; index >= 0; index--) {
			const image = state.images[index];
			if (!successfulImages.has(image)) {
				continue;
			}
			this.releaseImageGridImage(image);
			state.images.splice(index, 1);
			this.removePaneItemsFromState(state.side, [image.item]);
		}
		state.selectedIndexes.clear();
		for (const [index, image] of state.images.entries()) {
			if (attemptedImages.has(image)) {
				state.selectedIndexes.add(index);
			}
		}
		if (state.images.length) {
			state.selectedIndex = state.selectedIndexes.values().next().value ?? Math.max(0, Math.min(firstRemovedIndex, state.images.length - 1));
			if (!state.selectedIndexes.size) {
				state.selectedIndexes.add(state.selectedIndex);
			}
			state.selectionAnchorIndex = state.selectedIndex;
		} else {
			state.selectedIndex = 0;
			state.selectionAnchorIndex = undefined;
		}
		state.renderedRange = undefined;
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		state.loadedThumbnailIndexes.clear();
		state.loadedPreviewIndexes.clear();
		for (const [index, image] of state.images.entries()) {
			if (loadedThumbnailImages.has(image)) {
				state.loadedThumbnailIndexes.add(index);
			}
			if (loadedPreviewImages.has(image)) {
				state.loadedPreviewIndexes.add(index);
			}
		}
		const nextPendingPreviewIndex = pendingPreviewImage ? state.images.indexOf(pendingPreviewImage) : -1;
		if (nextPendingPreviewIndex >= 0) {
			state.previewPendingIndex = nextPendingPreviewIndex;
		} else if (state.previewPendingIndex !== undefined) {
			this.imageGridPreviewRequestSeq++;
			state.previewPendingIndex = undefined;
			state.previewPendingRequestSeq = undefined;
		}
	}

	private async deleteSelectedImageGridItems(state: TurboFileImageGridState | undefined = this.imageGridState): Promise<void> {
		const device = state ? this.getPaneDevice(state.side) : undefined;
		if (!state || !device) {
			return;
		}

		const targets = this.getImageGridDeleteTargets(state).filter(({ image }) => !!image.item.path);
		if (!targets.length) {
			this.statusMessage = '\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u56fe\u7247\u3002';
			this.updateImageGridSelection(state);
			return;
		}

		const trashMode = this.paneStates[state.side].trashMode;
		if (trashMode.active) {
			const paneState = this.paneStates[state.side];
			paneState.selectedPaths.clear();
			for (const { image } of targets) {
				paneState.selectedPaths.add(image.item.path!);
			}
			paneState.selectedPath = targets[0].image.item.path;
			paneState.selectionAnchorPath = paneState.selectedPath;
			const acted = isTurboFileTrashRootView(trashMode)
				? await this.permanentlyDeleteSelectedTrashItems(state.side)
				: await this.permanentlyDeleteTrashBrowseItems(state.side);
			if (acted) {
				this.closeImageGridPage(state);
			}
			return;
		}

		const batch = targets.length > 1;
		const confirmMessage = batch ? `确定删除选中的 ${targets.length} 张图片？` : `删除 ${targets[0].image.item.name}？`;
		if (!await this.confirmDelete('删除图片', confirmMessage, undefined, true)) {
			return;
		}

		const mutationContext = this.capturePaneMutationContext(state.side);
		const firstDeletedIndex = targets[0].index;
		const keepPreviewVisible = state.previewVisible;
		const scrollTop = this.getImageGridBodyElement(state)?.scrollTop ?? state.scrollTop;
		const items = targets.map(({ image }) => image.item);
		for (const { index, image } of [...targets].sort((a, b) => b.index - a.index)) {
			this.releaseImageGridImage(image);
			state.images.splice(index, 1);
		}
		state.selectedIndexes.clear();
		if (state.images.length) {
			state.selectedIndex = Math.max(0, Math.min(firstDeletedIndex, state.images.length - 1));
			state.selectedIndexes.add(state.selectedIndex);
			state.selectionAnchorIndex = state.selectedIndex;
		} else {
			state.selectedIndex = 0;
			state.selectionAnchorIndex = undefined;
		}
		state.previewZoom = 1;
		state.previewPanX = 0;
		state.previewPanY = 0;
		state.previewFitPending = true;
		state.previewSamplingMode = this.defaultImagePreviewSamplingMode;
		state.previewVisible = keepPreviewVisible && state.images.length > 0;
		state.scrollTop = scrollTop;
		this.imageGridPreviewRequestSeq++;
		state.renderedRange = undefined;
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		this.clearImageGridLoadedImageIndexes(state);
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.removePaneItemsFromState(state.side, items);

		this.updateImageGridAfterLocalMutation(state);
		const task = this.beginTask('delete', batch ? `\u5220\u9664 ${targets.length} \u5f20\u56fe\u7247` : `\u5220\u9664 ${items[0].name}`, device.name, false);
		if (state.previewVisible) {
			void this.ensureImageGridPreviewLoaded(state, state.selectedIndex, this.imageGridPreviewRequestSeq);
			this.scheduleImageGridPreviewNeighborsLoaded(state, state.selectedIndex);
			this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(state.selectedIndex, state.images.length), state);
		}

		try {
			this.updateTask(task, batch ? `正在删除 ${items.length} 张图片…` : `正在删除：${items[0].name}`, 40, false);
			const result = await this.moveUserItemsToTrash(device, items);
			if (result.completed > 0) {
				this.paneStates[state.side].trashHasItems = true;
			}
			if (!result.ok) {
				this.finishTask(task, 'error', `删除失败：${result.message}`, { error: result.message }, false);
				await this.refreshPanesAfterDelete(mutationContext);
				return;
			}
			this.finishTask(task, 'success', batch ? `已删除：${items.length} 张图片` : `已删除：${items[0].name}`, {}, false);
			await this.refreshPanesAfterDelete(mutationContext);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `\u5220\u9664\u5931\u8d25\uff1a${message}`, { error: message }, false);
			await this.refreshPanesAfterDelete(mutationContext);
		}
	}

	private async permanentlyDeleteSelectedImageGridItems(state: TurboFileImageGridState | undefined = this.imageGridState): Promise<void> {
		if (!state) {
			return;
		}
		const targets = this.getImageGridDeleteTargets(state).filter(({ image }) => !!image.item.path);
		if (!targets.length) {
			this.statusMessage = localize('turbofile.selectImagesToDeletePermanently', "请先选择要永久删除的图片。");
			this.updateImageGridSelection(state);
			return;
		}

		const paneState = this.paneStates[state.side];
		paneState.selectedPaths.clear();
		for (const { image } of targets) {
			paneState.selectedPaths.add(image.item.path!);
		}
		paneState.selectedPath = targets[0].image.item.path;
		paneState.selectionAnchorPath = paneState.selectedPath;
		if (await this.permanentlyDeleteSelected(state.side) && this.imageGridState === state) {
			this.closeImageGridPage(state);
		}
	}

	private async deleteImageGridPreview(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): Promise<void> {
		const imageGridState = state;
		if (imageGridState) {
			await this.deleteSelectedImageGridItems(imageGridState);
			return;
		}

		state = this.imageGridState;
		const image = state?.images[state.selectedIndex];
		const device = state ? this.getPaneDevice(state.side) : undefined;
		if (!state || !image?.item.path || !device) {
			return;
		}
		if (!await this.confirmDelete('删除图片', `删除 ${image.item.name}？`, undefined, true)) {
			return;
		}

		const mutationContext = this.capturePaneMutationContext(state.side);
		const deleteIndex = state.selectedIndex;
		this.releaseImageGridImage(image);
		state.images.splice(deleteIndex, 1);
		this.clearImageGridLayoutMetrics(state);
		state.selectedIndex = Math.max(0, Math.min(deleteIndex, state.images.length - 1));
		state.previewZoom = 1;
		state.previewPanX = 0;
		state.previewPanY = 0;
		state.previewFitPending = true;
		state.previewSamplingMode = this.defaultImagePreviewSamplingMode;
		state.previewVisible = state.images.length > 0;
		this.imageGridPreviewRequestSeq++;
		state.renderedRange = undefined;
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		this.clearImageGridLoadedImageIndexes(state);
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.removePaneItemsFromState(state.side, [image.item]);

		const task = this.beginTask('delete', `Delete ${image.item.name}`, device.name);
		this.render();
		if (state.previewVisible) {
			void this.ensureImageGridPreviewLoaded(state, state.selectedIndex, this.imageGridPreviewRequestSeq);
			this.scheduleImageGridPreviewNeighborsLoaded(state, state.selectedIndex);
			this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(state.selectedIndex, state.images.length), state);
		}

		try {
			const result = await this.moveUserItemsToTrash(device, [image.item]);
			if (result.completed > 0) {
				this.paneStates[state.side].trashHasItems = true;
			}
			if (result.ok) {
				this.finishTask(task, 'success', `Deleted: ${image.item.name}`);
			} else {
				this.finishTask(task, 'error', `Delete failed: ${result.message}`, { error: result.message });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `Delete failed: ${message}`, { error: message });
		} finally {
			await this.refreshPanesAfterDelete(mutationContext);
		}
	}

	private setImageGridColumns(state: TurboFileImageGridState | undefined, columns: TurboFileImageGridColumns): void {
		if (!state) {
			return;
		}
		const nextColumns = this.normalizeImageGridColumns(columns);
		if (state.columns === nextColumns) {
			return;
		}
		state.columns = nextColumns;
		state.renderedRange = undefined;
		this.clearImageGridThumbnailQueue();
		this.invalidateRetainedPaneImageGrid(state);
		this.render();
	}

	private normalizeImageGridStateColumns(state: TurboFileImageGridState): void {
		const nextColumns = this.normalizeImageGridColumns(state.columns);
		if (state.columns !== nextColumns) {
			state.columns = nextColumns;
			state.renderedRange = undefined;
		}
	}

	private setImageGridSortKey(state: TurboFileImageGridState | undefined, key: TurboFileImageGridSortKey): void {
		if (!state) {
			return;
		}
		const nextDescending = state.sortKey === key ? state.sortDescending : true;
		this.applyImageGridSort(state, key, nextDescending);
		if (key === 'size' && this.getImageGridSizeSortBasis() === 'dimensions') {
			void this.ensureImageGridDimensionMetadata(state);
		}
	}

	private async permanentlyDeleteTrashBrowseItems(side: 'left' | 'right'): Promise<boolean> {
		const items = this.getSelectedTransferItems(side);
		const device = this.getPaneDevice(side);
		if (!items.length || !device) {
			this.statusMessage = '请先选择要永久删除的文件或目录。';
			this.render();
			return false;
		}
		if (!await this.confirmDelete(
			localize('turbofile.permanentDeleteTitle', "永久删除"),
			localize('turbofile.permanentDeleteBrowseMessage', "永久删除选中的 {0} 个项目吗？此操作无法撤销。", items.length),
			undefined,
			true,
			localize('turbofile.deletePermanently', "永久删除")
		)) {
			return false;
		}

		const mutationContext = this.capturePaneMutationContext(side);
		const task = this.beginTask('delete', items.length > 1 ? `永久删除 ${items.length} 项` : `永久删除 ${items[0].name}`, device.name);
		this.removePaneItems(side, items);
		try {
			this.updateTask(task, items.length > 1 ? `正在永久删除 ${items.length} 项…` : `正在永久删除：${items[0].name}`, 40);
			const connection = device.id === LOCAL_WINDOWS_DEVICE_ID ? undefined : await this.getSshConnectionOptions(device);
			const endpoints = await Promise.all(items.filter(item => !!item.path).map(item => this.toTransferEndpoint(device, item.path!, connection)));
			const result = await this.sshService.deletePaths(endpoints, true, { progressId: task.progressId });
			this.updateTask(task, `正在刷新回收站目录：${device.name}`, 90);
			await this.refreshPanesAfterDelete(mutationContext);
			if (!result.ok) {
				this.finishTask(task, 'error', `永久删除失败：${result.message}`, { error: result.message, durationMs: Date.now() - task.startedAt });
				return true;
			}
			this.finishTask(task, 'success', items.length > 1 ? `已永久删除：${items.length} 项` : `已永久删除：${items[0].name}`, { durationMs: Date.now() - task.startedAt });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `永久删除失败：${message}`, { error: message, durationMs: Date.now() - task.startedAt });
			await this.refreshPanesAfterDelete(mutationContext);
		}
		return true;
	}

	private setImageGridSortDirection(state: TurboFileImageGridState | undefined, descending: boolean): void {
		if (!state) {
			return;
		}
		this.applyImageGridSort(state, state.sortKey, descending);
	}

	private applyImageGridSort(state: TurboFileImageGridState, key: TurboFileImageGridSortKey, descending: boolean): void {
		state.sortKey = key;
		state.sortDescending = descending;
		this.imageGridSortKey = key;
		this.imageGridSortDescending = descending;
		this.resortImageGridState(state);
		this.clearImageGridThumbnailQueue();
		this.updateImageGridAfterSort(state);
	}

	private resortImageGridState(state: TurboFileImageGridState): void {
		const selectedPath = state.images[state.selectedIndex]?.item.path;
		const selectedPaths = new Set(this.getImageGridSelectedImages(state)
			.map(({ image }) => image.item.path)
			.filter((path): path is string => !!path));
		const anchorPath = state.selectionAnchorIndex !== undefined ? state.images[state.selectionAnchorIndex]?.item.path : undefined;
		const loadedThumbnailImages = new Set(Array.from(state.loadedThumbnailIndexes, index => state.images[index]).filter((image): image is TurboFileImageGridImage => !!image));
		const loadedPreviewImages = new Set(Array.from(state.loadedPreviewIndexes, index => state.images[index]).filter((image): image is TurboFileImageGridImage => !!image));
		state.thumbnailLoadToken++;
		this.clearImageGridPreviewPrefetchTimer();
		if (state.previewPendingIndex !== undefined) {
			this.imageGridPreviewRequestSeq++;
			state.previewPendingIndex = undefined;
			state.previewPendingRequestSeq = undefined;
		}
		sortImageGridImages(state.images, state.sortKey, state.sortDescending, this.getImageGridSizeSortBasis());
		state.selectedIndexes.clear();
		state.loadedThumbnailIndexes.clear();
		state.loadedPreviewIndexes.clear();
		for (const [index, image] of state.images.entries()) {
			if (image.item.path && selectedPaths.has(image.item.path)) {
				state.selectedIndexes.add(index);
			}
			if (loadedThumbnailImages.has(image)) {
				state.loadedThumbnailIndexes.add(index);
			}
			if (loadedPreviewImages.has(image)) {
				state.loadedPreviewIndexes.add(index);
			}
		}
		if (selectedPath) {
			const nextIndex = state.images.findIndex(image => image.item.path === selectedPath);
			if (nextIndex >= 0) {
				state.selectedIndex = nextIndex;
			}
		}
		if (!state.selectedIndexes.size && state.images[state.selectedIndex]) {
			state.selectedIndexes.add(state.selectedIndex);
		}
		const nextAnchorIndex = anchorPath ? state.images.findIndex(image => image.item.path === anchorPath) : -1;
		state.selectionAnchorIndex = nextAnchorIndex >= 0 ? nextAnchorIndex : state.selectedIndex;
		state.renderedRange = undefined;
	}

	private async ensureImageGridDimensionMetadata(state: TurboFileImageGridState): Promise<void> {
		if (state.dimensionMetadataLoading || state.dimensionMetadataLoaded || !this.isImageGridSurfaceActive(state)) {
			return;
		}
		if (state.images.every(image => isKnownImageGridDimensions(image.originalWidth, image.originalHeight))) {
			state.dimensionMetadataLoaded = true;
			return;
		}

		const device = this.getPaneDevice(state.side);
		const paths = state.images
			.filter(image => !isKnownImageGridDimensions(image.originalWidth, image.originalHeight))
			.map(image => image.item.path)
			.filter((path): path is string => !!path);
		if (!device || !paths.length) {
			return;
		}

		state.dimensionMetadataLoading = true;
		const generation = ++state.dimensionMetadataGeneration;
		try {
			const endpoint = await this.toTransferEndpoint(device, state.path);
			const entries = await this.sshService.readImageMetadataBatch(endpoint, paths);
			if (!this.isImageGridSurfaceActive(state) || generation !== state.dimensionMetadataGeneration) {
				return;
			}
			const byPath = new Map(entries.map(entry => [entry.path, entry]));
			for (const image of state.images) {
				const path = image.item.path;
				const entry = path ? byPath.get(path) : undefined;
				if (entry && isKnownImageGridDimensions(entry.width, entry.height)) {
					image.originalWidth = entry.width;
					image.originalHeight = entry.height;
				}
			}
			state.dimensionMetadataLoaded = true;
			if (state.sortKey === 'size' && this.getImageGridSizeSortBasis() === 'dimensions') {
				this.resortImageGridState(state);
				this.clearImageGridThumbnailQueue();
				this.updateImageGridAfterSort(state);
			}
		} catch {
			// Keep the grid interactive and retry on the next size-sort request. Visible thumbnails may
			// still populate dimensions through the normal batch image response in the meantime.
		} finally {
			if (generation === state.dimensionMetadataGeneration) {
				state.dimensionMetadataLoading = false;
			}
		}
	}

	private updateImageGridAfterSort(state: TurboFileImageGridState): void {
		if (!this.isImageGridSurfaceActive(state)) {
			return;
		}
		const root = this.getImageGridRootElement(state);
		const body = root?.querySelector<HTMLElement>('.turbofile-image-page-body');
		const label = root?.querySelector<HTMLElement>('.turbofile-image-page-sort-label');
		const directionIcon = root?.querySelector<HTMLElement>('.turbofile-image-page-sort-direction-icon');
		if (!root || !body || !label || !directionIcon) {
			return;
		}

		label.textContent = this.getImageGridSortLabel(state);
		directionIcon.classList.toggle('codicon-arrow-down', state.sortDescending);
		directionIcon.classList.toggle('codicon-arrow-up', !state.sortDescending);
		for (const option of root.querySelectorAll<HTMLElement>('.turbofile-image-page-sort-option')) {
			const key = option.dataset.turbofileImageSortKey;
			const descending = option.dataset.turbofileImageSortDescending;
			const active = key !== undefined ? key === state.sortKey : descending === String(state.sortDescending);
			option.classList.toggle('is-active', active);
			option.setAttribute('aria-checked', String(active));
			const check = option.querySelector<HTMLElement>('.turbofile-image-page-sort-check');
			if (check) {
				clearNode(check);
				if (active) {
					check.appendChild(renderIcon(Codicon.check));
				}
			}
		}

		const scrollTop = body.scrollTop;
		state.scrollTop = Math.max(0, scrollTop);
		state.viewportHeight = body.clientHeight || state.viewportHeight;
		this.updateImageGridVirtualSlice(state, this.getImageGridVirtualRange(state));
		body.scrollTop = Math.min(scrollTop, body.scrollHeight);
		state.scrollTop = body.scrollTop;
		this.updateImageGridSelectionStatus(state);
		if (state.previewVisible) {
			this.updateImagePreviewOverlay(state);
		}
		this.scheduleImageGridVisibleLoad(state);
	}

	private getImageGridSortLabel(state: TurboFileImageGridState): string {
		return IMAGE_GRID_SORT_OPTIONS.find(option => option.key === state.sortKey)?.label ?? '名称';
	}

	private getImagePreviewCaption(state: TurboFileImageGridState): string {
		const image = state.images[state.selectedIndex];
		if (!image) {
			return '';
		}
		const dimensions = formatTurboFileImageDimensions(image, 'x');
		const sizeText = dimensions ? `原图 ${dimensions}` : image.previewLoading ? '正在加载原图' : '原图';
		return `${image.item.name} (${state.selectedIndex + 1}/${state.images.length}) | ${sizeText}`;
	}

	private getImageGridLoadIndexes(selectedIndex: number, total: number): number[] {
		const indexes = new Set<number>();
		for (let offset = -IMAGE_GRID_NEIGHBOR_LOAD_COUNT; offset <= IMAGE_GRID_NEIGHBOR_LOAD_COUNT; offset++) {
			const index = selectedIndex + offset;
			if (index >= 0 && index < total) {
				indexes.add(index);
			}
		}
		return [...indexes];
	}

	private scheduleImageGridThumbnailsLoaded(indexes: number[], state: TurboFileImageGridState | undefined = this.imageGridState): void {
		if (!state || !indexes.length || !this.container) {
			return;
		}
		const ownerWindow = getWindow(this.container);
		ownerWindow.requestAnimationFrame(() => {
			ownerWindow.setTimeout(() => {
				if (this.isImageGridSurfaceActive(state)) {
					this.queueImageGridThumbnailLoads(state, indexes, true);
				}
			}, 0);
		});
	}

	private scheduleImageGridPreviewNeighborsLoaded(state: TurboFileImageGridState, index: number): void {
		this.clearImageGridPreviewPrefetchTimer();
		if (!this.container || !state.images.length) {
			return;
		}
		this.imageGridPreviewPrefetchTimer = setTimeout(() => {
			this.imageGridPreviewPrefetchTimer = undefined;
			if (!this.isImageGridSurfaceActive(state)) {
				return;
			}
			for (let offset = 1; offset <= IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT; offset++) {
				const previous = (index - offset + state.images.length) % state.images.length;
				const next = (index + offset) % state.images.length;
				void this.ensureImageGridPreviewLoaded(state, previous, undefined, true);
				if (next !== previous) {
					void this.ensureImageGridPreviewLoaded(state, next, undefined, true);
				}
			}
		}, IMAGE_GRID_PREVIEW_PREFETCH_DELAY_MS);
	}

	private queueImageGridThumbnailLoads(state: TurboFileImageGridState, indexes: number[], priority: boolean): void {
		if (!this.isImageGridSurfaceActive(state)) {
			return;
		}

		// SSH grids load the whole visible batch in a single round trip (raw bytes, server does no image
		// processing), so the entire page appears together instead of trickling in one card at a time.
		const device = this.getPaneDevice(state.side);
		if (device && this.isRemoteSshImageDevice(device)) {
			void this.loadImageGridThumbnailsBatch(state, device, indexes);
			return;
		}

		const requests: TurboFileImageGridThumbnailRequest[] = [];
		for (const index of [...new Set(indexes)]) {
			const image = state.images[index];
			if (!image || image.thumbnailUrl || image.thumbnailContent || image.thumbnailLoading || image.thumbnailError) {
				continue;
			}
			const key = this.getImageGridQueueKey(state, index);
			if (this.imageGridThumbnailQueued.has(key)) {
				continue;
			}
			this.imageGridThumbnailQueued.add(key);
			requests.push({ state, index, image, key });
		}

		if (!requests.length) {
			return;
		}

		if (priority) {
			this.imageGridThumbnailQueue.unshift(...requests);
		} else {
			this.imageGridThumbnailQueue.push(...requests);
		}
		this.trimImageGridThumbnailQueue(state);
		this.processImageGridThumbnailQueue();
	}

	/**
	 * Loads all not-yet-loaded visible SSH thumbnails for the given indexes in one batched round trip
	 * (see ITurboFileSshService.readImageBatch). Decoding happens on the client; oversized files fall
	 * back to the per-image path. Nothing is cached — bytes become a blob URL and are released as soon
	 * as the card scrolls away.
	 */
	private async loadImageGridThumbnailsBatch(state: TurboFileImageGridState, device: TurboFileDevice, indexes: number[]): Promise<void> {
		const pending: { index: number; image: TurboFileImageGridImage; path: string; rawSize: number }[] = [];
		for (const index of [...new Set(indexes)]) {
			const image = state.images[index];
			if (!image?.item.path) {
				continue;
			}
			if (image.thumbnailUrl || image.thumbnailContent || image.thumbnailLoading || image.thumbnailError) {
				continue;
			}
			if (!this.isImageGridIndexNearViewport(state, index)) {
				continue;
			}
			image.thumbnailLoading = true;
			pending.push({ index, image, path: image.item.path, rawSize: Math.max(0, image.item.rawSize) });
		}
		if (!pending.length) {
			return;
		}

		const token = state.thumbnailLoadToken;
		const targetWidth = this.getImageGridThumbnailRequestWidth(state);
		const chunks: { index: number; image: TurboFileImageGridImage; path: string; rawSize: number }[][] = [];
		for (let offset = 0; offset < pending.length; offset += IMAGE_GRID_BATCH_CHUNK_COUNT) {
			chunks.push(pending.slice(offset, offset + IMAGE_GRID_BATCH_CHUNK_COUNT));
		}

		// Process chunks in parallel (bounded) so the remote device thumbnails several streams at once.
		// A stale token (user scrolled to a different page) stops the loop so the new page gets priority.
		let cursor = 0;
		const worker = async (): Promise<void> => {
			while (cursor < chunks.length && this.isImageGridSurfaceActive(state) && state.thumbnailLoadToken === token) {
				const chunk = chunks[cursor++];
				await this.loadImageGridThumbnailChunk(state, device, chunk, targetWidth, token);
			}
		};
		const workers = Array.from({ length: Math.min(IMAGE_GRID_BATCH_CONCURRENCY, chunks.length) }, () => worker());
		await Promise.all(workers);
		// Clear the loading flag on anything left unprocessed (grid changed, or this load was superseded).
		for (const chunk of chunks) {
			for (const target of chunk) {
				if (target.image.thumbnailLoading && !target.image.thumbnailUrl) {
					target.image.thumbnailLoading = false;
				}
			}
		}
		// If a newer load superseded this one, some now-visible images we had marked as loading were
		// skipped by that newer load (it saw thumbnailLoading=true) and have just been reset here. Run
		// one more pass for the current page so those never get orphaned as blank placeholders.
		if (this.isImageGridSurfaceActive(state) && state.thumbnailLoadToken !== token) {
			this.scheduleImageGridVisibleLoad(state);
		}
	}

	private async loadImageGridThumbnailChunk(
		state: TurboFileImageGridState,
		device: TurboFileDevice,
		chunk: { index: number; image: TurboFileImageGridImage; path: string; rawSize: number }[],
		targetWidth: number,
		token: number
	): Promise<void> {
		if (!this.isImageGridSurfaceActive(state) || state.thumbnailLoadToken !== token) {
			for (const target of chunk) {
				target.image.thumbnailLoading = false;
			}
			return;
		}
		let entries: ITurboFileImageBatchEntry[] = [];
		try {
			const endpoint = await this.toTransferEndpoint(device, state.path ?? '/');
			entries = await this.sshService.readImageBatch(endpoint, chunk.map(target => target.path), this.shouldUseOriginalImageGridImages() ? 0 : targetWidth);
		} catch {
			this.retryImageGridThumbnailChunkAfterTransientFailure(state, chunk, token);
			return;
		}
		if (!this.isImageGridSurfaceActive(state)) {
			for (const target of chunk) {
				target.image.thumbnailLoading = false;
			}
			return;
		}
		if (entries.some(entry => entry.transient)) {
			this.retryImageGridThumbnailChunkAfterTransientFailure(state, chunk, token);
			return;
		}
		const byPath = new Map(entries.map(entry => [entry.path, entry]));
		for (const target of chunk) {
			this.applyBatchedImageGridThumbnail(state, device, target, byPath.get(target.path));
		}
	}

	private retryImageGridThumbnailChunkAfterTransientFailure(
		state: TurboFileImageGridState,
		chunk: { index: number; image: TurboFileImageGridImage; path: string; rawSize: number }[],
		token: number
	): void {
		if (!this.isImageGridSurfaceActive(state) || state.thumbnailLoadToken !== token) {
			for (const target of chunk) {
				target.image.thumbnailLoading = false;
			}
			return;
		}

		for (const target of chunk) {
			target.image.thumbnailLoading = false;
			target.image.thumbnailError = undefined;
			const currentIndex = state.images.indexOf(target.image);
			if (currentIndex >= 0) {
				this.updateImageGridCard(state, currentIndex);
			}
		}
		this.scheduleImageGridTransientRetry(state);
	}

	private scheduleImageGridTransientRetry(state: TurboFileImageGridState): void {
		setTimeout(() => {
			if (this.isImageGridSurfaceActive(state)) {
				this.scheduleImageGridVisibleLoad(state);
			}
		}, IMAGE_GRID_TRANSIENT_RETRY_DELAY_MS);
	}

	private applyBatchedImageGridThumbnail(
		state: TurboFileImageGridState,
		device: TurboFileDevice,
		target: { index: number; image: TurboFileImageGridImage; path: string; rawSize: number },
		entry: ITurboFileImageBatchEntry | undefined
	): void {
		target.image.thumbnailLoading = false;
		const currentIndex = state.images.indexOf(target.image);
		if (currentIndex < 0) {
			return;
		}
		if (entry?.oversized) {
			// Only happens when the remote has no image tool and the original is huge; load it on its own.
			void this.applySshThumbnailViaProtocol(state, device, currentIndex);
			return;
		}
		if (!entry?.ok || !entry.content) {
			target.image.thumbnailError = entry?.message ?? '加载失败';
			this.updateImageGridCard(state, currentIndex);
			return;
		}
		if (!this.isImageGridSurfaceActive(state) || !this.isImageGridIndexNearViewport(state, currentIndex)) {
			return;
		}
		const mime = entry.mime ?? getMimeType(target.image.item.name);
		const bytes = decodeBase64(entry.content).buffer;
		target.image.originalWidth = entry.originalWidth ?? target.image.originalWidth;
		target.image.originalHeight = entry.originalHeight ?? target.image.originalHeight;
		// If the remote already downscaled (or the original was small) the bytes are tiny — show them via
		// a native <img> directly. If they came back large (a device with no image tool streamed the raw
		// original, e.g. an uncompressed .bmp), downscale on the client so the card holds only a small
		// thumbnail. This keeps both fast paths and full compatibility with tool-less boards.
		void this.assignBatchedThumbnail(state, target, bytes, mime);
	}

	private async assignBatchedThumbnail(
		state: TurboFileImageGridState,
		target: { index: number; image: TurboFileImageGridImage; path: string; rawSize: number },
		bytes: Uint8Array,
		mime: string
	): Promise<void> {
		const url = !this.shouldUseOriginalImageGridImages() && bytes.byteLength > IMAGE_GRID_CLIENT_DOWNSCALE_BYTES
			? (await this.createDownscaledThumbnailUrl(bytes, mime, this.getImageGridThumbnailRequestWidth(state))) ?? this.createBlobUrlFromBytes(bytes, mime)
			: this.createBlobUrlFromBytes(bytes, mime);
		const currentIndex = state.images.indexOf(target.image);
		if (!this.isImageGridSurfaceActive(state) || currentIndex < 0 || !this.isImageGridIndexNearViewport(state, currentIndex)) {
			this.releaseImageBlobUrl(url);
			return;
		}
		this.releaseImageBlobUrl(target.image.thumbnailUrl);
		target.image.thumbnailContent = '';
		target.image.thumbnailUrl = url;
		target.image.thumbnailMime = mime;
		target.image.thumbnailError = url ? undefined : '加载失败';
		if (url) {
			target.image.thumbnailDecodeFailures = 0;
			state.loadedThumbnailIndexes.add(currentIndex);
		}
		this.updateImageGridCard(state, currentIndex);
	}

	private async createDownscaledThumbnailUrl(bytes: Uint8Array, mime: string, targetWidth: number): Promise<string | undefined> {
		const ownerWindow = this.container ? getWindow(this.container) : undefined;
		if (!ownerWindow || typeof ownerWindow.createImageBitmap !== 'function') {
			return undefined;
		}
		const blobBytes = new Uint8Array(bytes.byteLength);
		blobBytes.set(bytes);
		const sourceBlob = new Blob([blobBytes.buffer as ArrayBuffer], { type: mime || 'application/octet-stream' });
		let bitmap: ImageBitmap | undefined;
		try {
			// resizeWidth keeps aspect ratio; the decode + resize run off the main thread.
			bitmap = await ownerWindow.createImageBitmap(sourceBlob, { resizeWidth: Math.max(64, Math.round(targetWidth)), resizeQuality: 'medium' });
			const canvas = ownerWindow.document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const context = canvas.getContext('2d');
			if (!context) {
				return undefined;
			}
			context.drawImage(bitmap, 0, 0);
			return await new Promise<string | undefined>(resolve => {
				canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : undefined), 'image/jpeg', 0.82);
			});
		} catch {
			return undefined;
		} finally {
			bitmap?.close();
		}
	}

	private createBlobUrlFromBytes(bytes: Uint8Array, mime: string): string | undefined {
		try {
			const blobBytes = new Uint8Array(bytes.byteLength);
			blobBytes.set(bytes);
			const blob = new Blob([blobBytes.buffer as ArrayBuffer], { type: mime || 'application/octet-stream' });
			return URL.createObjectURL(blob);
		} catch {
			return undefined;
		}
	}

	private async applySshThumbnailViaProtocol(state: TurboFileImageGridState, device: TurboFileDevice, index: number): Promise<void> {
		const image = state.images[index];
		if (!image?.item.path || !this.isImageGridSurfaceActive(state)) {
			return;
		}
		const requestWidth = this.getImageGridThumbnailRequestWidth(state);
		const result = await this.createImageGridResourceUrl(device, image.item.path, createTurboFileImageGridResourceOptions(requestWidth, image.item.rawSize, image.item.rawModified));
		const currentIndex = state.images.indexOf(image);
		if (!this.isImageGridSurfaceActive(state) || currentIndex < 0 || !this.isImageGridIndexNearViewport(state, currentIndex)) {
			if (result.url) {
				this.releaseImageBlobUrl(result.url);
			}
			return;
		}
		this.releaseImageBlobUrl(image.thumbnailUrl);
		image.thumbnailContent = '';
		image.thumbnailUrl = result.ok ? result.url : undefined;
		image.thumbnailMime = result.mime || getMimeType(image.item.name);
		image.thumbnailError = result.ok ? undefined : result.message;
		if (result.ok) {
			image.thumbnailDecodeFailures = 0;
			state.loadedThumbnailIndexes.add(currentIndex);
		}
		this.updateImageGridCard(state, currentIndex);
	}

	private processImageGridThumbnailQueue(): void {
		if (!this.getVisibleImageGridStates().length) {
			return;
		}

		const activeState = this.imageGridState && this.isImageGridSurfaceActive(this.imageGridState)
			? this.imageGridState
			: this.getVisibleImageGridStates()[0];
		const limit = activeState ? this.getImageGridThumbnailParallelLimit(activeState) : IMAGE_GRID_REMOTE_PARALLEL_LIMIT;
		const available = Math.max(0, limit - this.imageGridThumbnailLoadingCount);
		for (let started = 0; started < available && this.imageGridThumbnailQueue.length;) {
			const request = this.imageGridThumbnailQueue.shift();
			if (!request) {
				return;
			}
			this.imageGridThumbnailQueued.delete(request.key);
			const currentIndex = request.state.images.indexOf(request.image);
			if (currentIndex < 0 || !this.shouldLoadImageGridThumbnail(request.state, currentIndex)) {
				continue;
			}
			request.image.thumbnailLoading = true;
			this.imageGridThumbnailLoadingCount++;
			started++;
			void this.runImageGridThumbnailRequest(request);
		}
	}

	private async runImageGridThumbnailRequest(request: TurboFileImageGridThumbnailRequest): Promise<void> {
		try {
			const currentIndex = request.state.images.indexOf(request.image);
			if (currentIndex >= 0) {
				await this.loadImageGridThumbnail(request.state, currentIndex);
			}
		} finally {
			this.imageGridThumbnailLoadingCount = Math.max(0, this.imageGridThumbnailLoadingCount - 1);
			this.processImageGridThumbnailQueue();
		}
	}

	private shouldLoadImageGridThumbnail(state: TurboFileImageGridState, index: number): boolean {
		if (!this.isImageGridSurfaceActive(state) || !this.isImageGridIndexNearViewport(state, index)) {
			return false;
		}
		const image = state.images[index];
		return !!image && !image.thumbnailUrl && !image.thumbnailContent && !image.thumbnailLoading && !image.thumbnailError;
	}

	private async readImageGridImage(device: TurboFileDevice, path: string, options: ITurboFileReadImageOptions): Promise<TurboFileImageReadResult> {
		const cacheKey = this.getImageReadCacheKey(device, path, options);
		const cached = this.imageReadCache.get(cacheKey);
		if (cached) {
			this.imageReadCache.delete(cacheKey);
			this.imageReadCache.set(cacheKey, cached);
			return {
				ok: true,
				message: 'Image loaded from cache.',
				content: cached.content,
				mime: cached.mime,
				size: cached.size,
				width: cached.width,
				height: cached.height,
				originalWidth: cached.originalWidth,
				originalHeight: cached.originalHeight
			};
		}

		const result = await this.sshService.readImage(await this.toTransferEndpoint(device, path), options);
		if (result.ok && result.content && result.size <= IMAGE_READ_CACHE_MAX_BYTES) {
			this.imageReadCache.set(cacheKey, {
				content: result.content,
				mime: result.mime,
				size: result.size,
				width: result.width,
				height: result.height,
				originalWidth: result.originalWidth,
				originalHeight: result.originalHeight
			});
			this.trimImageReadCache();
		}
		return result;
	}

	private isRemoteSshImageDevice(device: TurboFileDevice): boolean {
		return device.id !== LOCAL_WINDOWS_DEVICE_ID;
	}

	private async createImageGridResourceUrl(device: TurboFileDevice, path: string, options: ITurboFileImageResourceOptions): Promise<{ ok: boolean; message: string; url?: string; mime?: string }> {
		return this.sshService.createImageResource(await this.toTransferEndpoint(device, path), options);
	}

	private getImageReadCacheKey(device: TurboFileDevice, path: string, options: ITurboFileReadImageOptions): string {
		return JSON.stringify({
			device: device.id,
			host: device.host,
			port: device.port || 0,
			path,
			width: options.width || 0,
			height: options.height || 0,
			quality: options.quality || 0,
			format: options.format || '',
			forceOriginal: !!options.forceOriginal,
			sourceSize: options.sourceSize || 0,
			sourceModified: options.sourceModified || 0
		});
	}

	private trimImageReadCache(): void {
		while (this.imageReadCache.size > IMAGE_READ_CACHE_MAX_ENTRIES) {
			const firstKey = this.imageReadCache.keys().next().value;
			if (!firstKey) {
				return;
			}
			this.imageReadCache.delete(firstKey);
		}
	}

	private createImageObjectUrl(result: TurboFileImageReadResult): string | undefined {
		if (!result.ok) {
			return undefined;
		}

		try {
			let bytes: Uint8Array;
			if (result.buffer) {
				bytes = result.buffer.buffer;
			} else if (result.content) {
				bytes = decodeBase64(result.content).buffer;
			} else {
				return undefined;
			}

			const blobBytes = new Uint8Array(bytes.byteLength);
			blobBytes.set(bytes);
			const blob = new Blob([blobBytes.buffer as ArrayBuffer], { type: result.mime || 'application/octet-stream' });
			return URL.createObjectURL(blob);
		} catch {
			return undefined;
		}
	}

	private async loadImageGridThumbnail(state: TurboFileImageGridState, index: number): Promise<void> {
		const image = state.images[index];
		const device = this.getPaneDevice(state.side);
		if (!image?.item.path || !device || !this.isImageGridSurfaceActive(state) || !this.isImageGridIndexNearViewport(state, index)) {
			return;
		}

		try {
			const requestWidth = this.getImageGridThumbnailRequestWidth(state);
			if (this.isRemoteSshImageDevice(device)) {
				const result = await this.createImageGridResourceUrl(device, image.item.path, createTurboFileImageGridResourceOptions(requestWidth, image.item.rawSize, image.item.rawModified));
				const currentIndex = state.images.indexOf(image);
				if (!this.isImageGridSurfaceActive(state) || currentIndex < 0 || !this.isImageGridIndexNearViewport(state, currentIndex)) {
					if (result.url) {
						this.releaseImageBlobUrl(result.url);
					}
					return;
				}
				this.releaseImageBlobUrl(image.thumbnailUrl);
				image.thumbnailContent = '';
				image.thumbnailUrl = result.ok ? result.url : undefined;
				image.thumbnailMime = result.mime || getMimeType(image.item.name);
				image.thumbnailError = result.ok ? undefined : result.message;
				if (result.ok) {
					image.thumbnailDecodeFailures = 0;
					state.loadedThumbnailIndexes.add(currentIndex);
				}
				this.updateImageGridCard(state, currentIndex);
				return;
			}

			const highQuality = this.shouldUseOriginalImageGridImages();
			const shouldReadOriginalFirst = highQuality || this.shouldUseOriginalImageGridCardSource(image.width, image.height);
			let result = shouldReadOriginalFirst
				? await this.readImageGridImage(device, image.item.path, {
					encoding: 'base64',
					forceOriginal: true,
					maxBytes: TURBOFILE_IMAGE_GRID_ORIGINAL_MAX_BYTES,
					sourceSize: image.item.rawSize,
					sourceModified: image.item.rawModified
				})
				: await this.readImageGridImage(device, image.item.path, {
					encoding: 'base64',
					width: requestWidth,
					quality: IMAGE_GRID_THUMB_QUALITY,
					format: 'webp',
					interpolation: 'lanczos',
					sourceSize: image.item.rawSize,
					sourceModified: image.item.rawModified
				});
			if (highQuality && !result.ok) {
				result = await this.readImageGridImage(device, image.item.path, {
					encoding: 'base64',
					width: requestWidth,
					quality: IMAGE_GRID_THUMB_QUALITY,
					format: 'webp',
					interpolation: 'lanczos',
					sourceSize: image.item.rawSize,
					sourceModified: image.item.rawModified
				});
			}
			let currentIndex = state.images.indexOf(image);
			if (!this.isImageGridSurfaceActive(state) || currentIndex < 0 || !this.isImageGridIndexNearViewport(state, currentIndex)) {
				return;
			}
			const resolvedWidth = result.width ?? image.width;
			const resolvedHeight = result.height ?? image.height;
			if (!shouldReadOriginalFirst && result.ok && this.shouldUseOriginalImageGridCardSource(resolvedWidth, resolvedHeight)) {
				const originalResult = await this.readImageGridImage(device, image.item.path, {
					encoding: 'base64',
					forceOriginal: true,
					maxBytes: TURBOFILE_IMAGE_GRID_ORIGINAL_MAX_BYTES,
					sourceSize: image.item.rawSize,
					sourceModified: image.item.rawModified
				});
				currentIndex = state.images.indexOf(image);
				if (!this.isImageGridSurfaceActive(state) || currentIndex < 0 || !this.isImageGridIndexNearViewport(state, currentIndex)) {
					return;
				}
				if (originalResult.ok) {
					result = originalResult;
				}
			}
			this.releaseImageBlobUrl(image.thumbnailUrl);
			const thumbnailUrl = result.ok ? this.createImageObjectUrl(result) : undefined;
			image.thumbnailContent = thumbnailUrl ? '' : result.ok ? result.content : '';
			image.thumbnailUrl = thumbnailUrl;
			image.thumbnailMime = result.mime || getMimeType(image.item.name);
			image.thumbnailError = result.ok ? undefined : result.message;
			image.width = result.width ?? resolvedWidth;
			image.height = result.height ?? resolvedHeight;
			image.originalWidth = result.originalWidth ?? image.originalWidth;
			image.originalHeight = result.originalHeight ?? image.originalHeight;
			currentIndex = state.images.indexOf(image);
			if (currentIndex < 0) {
				return;
			}
			if (result.ok) {
				image.thumbnailDecodeFailures = 0;
				state.loadedThumbnailIndexes.add(currentIndex);
			}
			this.updateImageGridCard(state, currentIndex);
		} catch (error) {
			if (this.isImageGridSurfaceActive(state)) {
				image.thumbnailError = error instanceof Error ? error.message : String(error);
				const currentIndex = state.images.indexOf(image);
				if (currentIndex >= 0) {
					this.updateImageGridCard(state, currentIndex);
				}
			}
		} finally {
			if (this.isImageGridSurfaceActive(state)) {
				image.thumbnailLoading = false;
			}
		}
	}

	private async ensureImageGridPreviewLoaded(state: TurboFileImageGridState, index: number, requestSeq?: number, silent: boolean = false): Promise<void> {
		const image = state.images[index];
		const device = this.getPaneDevice(state.side);
		if (!image?.item.path || !device || !this.isImageGridSurfaceActive(state)) {
			return;
		}
		if (this.getImagePreviewSource(image)) {
			await this.ensureImagePreviewElementLoaded(state, index);
			const currentIndex = state.images.indexOf(image);
			if (currentIndex >= 0) {
				this.finishImageGridPreviewLoad(state, currentIndex, requestSeq, silent);
			}
			return;
		}
		if (image.previewLoading) {
			return;
		}
		if (!this.shouldKeepImageGridPreview(state, index)) {
			return;
		}

		const request = this.getImagePreviewRequestSize();
		image.previewLoading = true;
		if (!silent && state.selectedIndex === index && (!requestSeq || requestSeq === this.imageGridPreviewRequestSeq)) {
			this.updateImagePreviewOverlay(state);
		}
		try {
			// Read the original via the same cat-based batch path the grid uses: it works where SFTP is
			// flaky/restricted (some NAS) and needs no remote image tool, which is exactly where the old
			// resource/protocol preview path was failing. Skip this fast path for very large originals —
			// reading + decoding a huge file raw would spike memory; those use the resource path, which can
			// downscale on the remote.
			const previewRawSize = Math.max(0, image.item.rawSize);
			const canReadOriginalRaw = previewRawSize === 0 || previewRawSize <= IMAGE_PREVIEW_RAW_MAX_BYTES;
			if (this.isRemoteSshImageDevice(device) && canReadOriginalRaw) {
				const endpoint = await this.toTransferEndpoint(device, image.item.path);
				let entries: ITurboFileImageBatchEntry[] = [];
				try {
					entries = await this.sshService.readImageBatch(endpoint, [image.item.path], 0);
				} catch {
					entries = [];
				}
				let currentIndex = state.images.indexOf(image);
				if (!this.isImageGridSurfaceActive(state) || currentIndex < 0 || !this.shouldKeepImageGridPreview(state, currentIndex)) {
					return;
				}
				const entry = entries.find(candidate => candidate.path === image.item.path) ?? entries[0];
				if (entry?.ok && entry.content) {
					const mime = entry.mime ?? getMimeType(image.item.name);
					this.releaseImageBlobUrl(image.previewUrl);
					image.previewContent = '';
					image.previewUrl = this.createBlobUrlFromBytes(decodeBase64(entry.content).buffer, mime);
					image.previewMime = mime;
					image.previewError = image.previewUrl ? undefined : '加载失败';
					if (image.previewUrl) {
						state.loadedPreviewIndexes.add(currentIndex);
						await this.ensureImagePreviewElementLoaded(state, currentIndex);
					}
					return;
				}
				// Oversized/unavailable (or a Windows remote): fall back to the resource path, which can
				// downscale a very large original remotely.
				const result = await this.createImageGridResourceUrl(device, image.item.path, createTurboFileImagePreviewResourceOptions(this.isWindowsDevice(device), request, image.item.rawSize, image.item.rawModified));
				currentIndex = state.images.indexOf(image);
				if (!this.isImageGridSurfaceActive(state) || currentIndex < 0 || !this.shouldKeepImageGridPreview(state, currentIndex)) {
					if (result.url) {
						this.releaseImageBlobUrl(result.url);
					}
					return;
				}
				this.releaseImageBlobUrl(image.previewUrl);
				image.previewContent = '';
				image.previewUrl = result.ok ? result.url : undefined;
				image.previewMime = result.mime || getMimeType(image.item.name);
				image.previewError = result.ok ? undefined : result.message;
				if (result.ok) {
					state.loadedPreviewIndexes.add(currentIndex);
					await this.ensureImagePreviewElementLoaded(state, currentIndex);
				}
				return;
			}

			const result = await this.readImageGridImage(device, image.item.path, createTurboFileImagePreviewReadOptions(image.item.rawSize, image.item.rawModified));
			const currentIndex = state.images.indexOf(image);
			if (!this.isImageGridSurfaceActive(state) || currentIndex < 0 || !this.shouldKeepImageGridPreview(state, currentIndex)) {
				return;
			}
			this.releaseImageBlobUrl(image.previewUrl);
			const previewUrl = result.ok ? this.createImageObjectUrl(result) : undefined;
			image.previewContent = previewUrl ? '' : result.ok ? result.content : '';
			image.previewUrl = previewUrl;
			image.previewMime = result.mime || getMimeType(image.item.name);
			image.previewError = result.ok ? undefined : result.message;
			image.width = result.width ?? image.width;
			image.height = result.height ?? image.height;
			image.originalWidth = result.originalWidth ?? image.originalWidth;
			image.originalHeight = result.originalHeight ?? image.originalHeight;
			if (result.ok) {
				state.loadedPreviewIndexes.add(currentIndex);
				await this.ensureImagePreviewElementLoaded(state, currentIndex);
			}
		} catch (error) {
			if (this.isImageGridSurfaceActive(state)) {
				image.previewError = error instanceof Error ? error.message : String(error);
			}
		} finally {
			if (this.isImageGridSurfaceActive(state)) {
				image.previewLoading = false;
				const currentIndex = state.images.indexOf(image);
				if (currentIndex >= 0) {
					this.finishImageGridPreviewLoad(state, currentIndex, requestSeq, silent);
				}
			}
		}
	}

	private finishImageGridPreviewLoad(state: TurboFileImageGridState, index: number, requestSeq?: number, silent: boolean = false): void {
		if (!this.isImageGridSurfaceActive(state)) {
			return;
		}
		if (state.previewPendingIndex === index && state.previewPendingRequestSeq !== undefined && this.commitImageGridPreviewIndexIfReady(state, index, state.previewPendingRequestSeq)) {
			this.scheduleImageGridPreviewNeighborsLoaded(state, index);
			return;
		}
		if (!silent && state.selectedIndex === index && (!requestSeq || requestSeq === this.imageGridPreviewRequestSeq)) {
			this.updateImagePreviewOverlay(state);
			this.scheduleImageGridPreviewNeighborsLoaded(state, index);
		}
	}

	private bindImageGridObserver(): void {
		const state = this.imageGridState;
		if (!state || !this.isImageGridSurfaceActive(state) || !this.container) {
			this.disposeImageGridObserver();
			return;
		}
		if (state.displayMode === 'pane') {
			this.disposeImageGridObserver();
			for (const paneState of this.getVisibleImageGridStates()) {
				this.scheduleImageGridVisibleLoad(paneState);
			}
			return;
		}

		const root = this.getImageGridRootElement(state);
		const body = root?.querySelector('.turbofile-image-page-body') as HTMLElement | null | undefined;
		if (!body || !('IntersectionObserver' in getWindow(this.container))) {
			return;
		}

		this.disposeImageGridObserver();
		this.imageGridObserver = new IntersectionObserver(entries => {
			if (!this.isImageGridSurfaceActive(state)) {
				return;
			}
			let sawVisible = false;
			for (const entry of entries) {
				if (!entry.isIntersecting) {
					continue;
				}
				const value = Number((entry.target as HTMLElement).dataset.imageIndex);
				if (Number.isFinite(value)) {
					sawVisible = true;
					this.imageGridObserver?.unobserve(entry.target);
				}
			}
			if (sawVisible) {
				// Load only the settled visible page, not every card that flickers past during a fast scroll.
				this.scheduleImageGridVisibleLoad(state);
			}
		}, {
			root: body,
			rootMargin: '320px',
			threshold: 0.01
		});

		let hasCards = false;
		for (const card of Array.from(root?.querySelectorAll('.turbofile-image-page-card[data-image-index]') ?? [])) {
			this.imageGridObserver.observe(card);
			hasCards = true;
		}
		if (hasCards) {
			this.scheduleImageGridVisibleLoad(state);
		}
	}

	private disposeImageGridObserver(): void {
		if (!this.imageGridObserver) {
			return;
		}
		this.imageGridObserver.disconnect();
		this.imageGridObserver = undefined;
	}

	private updateImageGridCard(state: TurboFileImageGridState, index: number): void {
		if (!this.container || !this.isImageGridSurfaceActive(state)) {
			return;
		}
		const root = this.getImageGridRootElement(state);
		const card = root?.querySelector(`.turbofile-image-page-card[data-image-index="${index}"]`) as HTMLElement | null | undefined;
		const image = state?.images[index];
		if (!card || !image) {
			return;
		}

		const preview = card.querySelector<HTMLElement>('.turbofile-image-page-card-preview');
		if (!preview) {
			return;
		}
		clearNode(preview);
		const cardSize = this.getImageGridCardSize(state, image);
		this.applyImageGridCardPreviewSize(preview, cardSize);
		const thumbnailSrc = image.thumbnailUrl || (image.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : '');
		if (thumbnailSrc) {
			const thumb = document.createElement('img');
			thumb.draggable = false;
			thumb.loading = 'eager';
			thumb.decoding = 'async';
			this.applyImageGridCardImageSize(thumb, cardSize);
			thumb.addEventListener('error', () => this.handleImageGridThumbnailError(state, index));
			thumb.src = thumbnailSrc;
			thumb.alt = image.item.name;
			preview.appendChild(thumb);
		} else {
			const placeholder = $('.turbofile-image-page-card-placeholder');
			placeholder.appendChild(renderIcon(Codicon.fileMedia));
			preview.appendChild(placeholder);
		}
		this.appendImageGridCardChrome(preview, image, index);
	}

	private getImageGridDefaultViewportHeight(): number {
		const height = this.container?.clientHeight ?? 0;
		return Math.max(480, height - 44);
	}

	private getImageGridEffectiveColumns(state: TurboFileImageGridState): number {
		const base = Math.max(1, state.columns);
		return getTurboFileImageGridEffectiveColumns(base, this.getImageGridBodyWidth(state), this.getImageGridMaxCardWidth(state), IMAGE_GRID_CARD_GAP);
	}

	private getImageGridVirtualRange(state: TurboFileImageGridState): TurboFileImageGridRange {
		const total = state.images.length;
		if (!total) {
			return { startIndex: 0, endIndex: 0, topSpacerHeight: 0, bottomSpacerHeight: 0 };
		}

		const columns = this.getImageGridEffectiveColumns(state);
		const rowHeight = this.getImageGridRowHeight(state);
		const rowStep = rowHeight + IMAGE_GRID_CARD_GAP;
		const totalRows = Math.ceil(total / columns);
		const viewportHeight = Math.max(1, state.viewportHeight || this.getImageGridDefaultViewportHeight());
		const startRow = Math.max(0, Math.floor(state.scrollTop / rowStep) - IMAGE_GRID_OVERSCAN_ROWS);
		const endRow = Math.min(totalRows, Math.ceil((state.scrollTop + viewportHeight) / rowStep) + IMAGE_GRID_OVERSCAN_ROWS);
		const startIndex = Math.min(total, startRow * columns);
		const endIndex = Math.min(total, Math.max(startIndex, endRow * columns));
		const topSpacerHeight = startRow * rowStep;
		const bottomSpacerHeight = Math.max(0, (totalRows - endRow) * rowStep);
		return { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight };
	}

	private getImageGridRowHeight(state: TurboFileImageGridState): number {
		return this.getImageGridLayoutMetrics(state).rowHeight;
	}

	private getImageGridMaxCardWidth(state: TurboFileImageGridState): number {
		return this.getImageGridLayoutMetrics(state).maxCardWidth;
	}

	private getImageGridBaseCardWidth(state: TurboFileImageGridState): number {
		// `state.columns` is the user's Ctrl+wheel target. At the default 14 columns the legacy 96px
		// minimum is preserved. Only explicit zoom-out beyond the default progressively unlocks smaller
		// cards, reaching the 48px floor at 32 columns. Effective columns still reduce automatically in a
		// narrow pane, so split view never blindly forces all 32 columns into the available width.
		const extraColumnProgress = clampNumber(
			(state.columns - IMAGE_GRID_COLUMN_DEFAULT) / (IMAGE_GRID_COLUMN_MAX - IMAGE_GRID_COLUMN_DEFAULT),
			0,
			1
		);
		const minimumCardWidth = IMAGE_GRID_THUMB_MIN - ((IMAGE_GRID_THUMB_MIN - IMAGE_GRID_THUMB_MIN_AT_MAX_COLUMNS) * extraColumnProgress);
		return Math.max(minimumCardWidth, getTurboFileImageGridBaseCardWidth(state.columns, this.getImageGridBodyWidth(state), IMAGE_GRID_CARD_GAP));
	}

	private getImageGridBasePreviewHeight(state: TurboFileImageGridState): number {
		return this.getImageGridBaseCardWidth(state) * 150 / 220;
	}

	private getImageGridLayoutMetrics(state: TurboFileImageGridState): TurboFileImageGridLayoutMetrics {
		const baseCardWidth = this.getImageGridBaseCardWidth(state);
		const showNames = this.shouldShowImageGridNames();
		if (state.layoutMetrics?.state === state && state.layoutMetrics.scale === state.thumbnailScale && state.layoutMetrics.baseCardWidth === baseCardWidth && state.layoutMetrics.showNames === showNames) {
			return state.layoutMetrics;
		}
		const verticalChrome = this.getImageGridCardVerticalChrome();
		let cardWidth = baseCardWidth;
		let imageWidth = IMAGE_GRID_THUMB_MIN;
		let rowHeight = this.getImageGridBasePreviewHeight(state) + verticalChrome;
		for (const image of state.images) {
			const size = this.getImageGridCardSize(state, image);
			cardWidth = Math.max(cardWidth, size.cardWidth);
			imageWidth = Math.max(imageWidth, size.imageWidth);
			rowHeight = Math.max(rowHeight, size.rowHeight);
		}
		state.layoutMetrics = {
			state,
			scale: state.thumbnailScale,
			baseCardWidth,
			showNames,
			maxCardWidth: Math.max(1, Math.round(cardWidth)),
			maxImageWidth: Math.max(1, Math.round(imageWidth)),
			rowHeight: Math.max(showNames ? 150 : 1, Math.round(rowHeight))
		};
		return state.layoutMetrics;
	}

	private clearImageGridLayoutMetrics(state?: TurboFileImageGridState): void {
		if (state) {
			state.layoutMetrics = undefined;
		}
	}

	private getImageGridBodyWidth(state: TurboFileImageGridState): number {
		if (state.bodyWidthCache !== undefined) {
			return state.bodyWidthCache;
		}
		const body = this.getImageGridBodyElement(state);
		const measured = body?.clientWidth ?? 0;
		const width = measured > 0
			? Math.max(320, measured - 28)
			: Math.max(320, (this.container?.clientWidth ?? 1440) - 28);
		state.bodyWidthCache = width;
		return width;
	}

	private invalidateImageGridBodyWidthCache(state?: TurboFileImageGridState): void {
		if (state) {
			state.bodyWidthCache = undefined;
		}
	}

	private invalidateAllImageGridLayoutCaches(): void {
		for (const state of this.getVisibleImageGridStates()) {
			this.invalidateImageGridBodyWidthCache(state);
			this.clearImageGridLayoutMetrics(state);
			state.renderedRange = undefined;
		}
	}

	private getImageGridThumbnailRequestWidth(state: TurboFileImageGridState): number {
		const ownerWindow = this.container?.ownerDocument.defaultView;
		const dpr = Math.min(IMAGE_DPR_CAP, ownerWindow?.devicePixelRatio || 1);
		const previewBoxWidth = Math.max(1, this.getImageGridMaxCardWidth(state) - IMAGE_GRID_CARD_INLINE_CHROME);
		const scaled = Math.round(previewBoxWidth * dpr);
		return clampNumber(quantizeNumber(scaled, IMAGE_GRID_THUMB_STEP), IMAGE_GRID_THUMB_MIN, IMAGE_GRID_THUMB_MAX);
	}

	private shouldUseOriginalImageGridCardSource(width: number | undefined, height: number | undefined): boolean {
		return !!width && !!height && width <= IMAGE_GRID_ORIGINAL_CARD_DIMENSION_THRESHOLD && height <= IMAGE_GRID_ORIGINAL_CARD_DIMENSION_THRESHOLD;
	}

	private getImagePreviewRequestSize(): { width: number; height: number; quality: number } {
		const ownerWindow = this.container?.ownerDocument.defaultView;
		const dpr = Math.min(IMAGE_DPR_CAP, ownerWindow?.devicePixelRatio || 1);
		const viewportWidth = ownerWindow?.innerWidth || this.container?.clientWidth || 1440;
		const viewportHeight = ownerWindow?.innerHeight || this.container?.clientHeight || 900;
		const widthRaw = clampNumber(Math.round(viewportWidth * 0.98 * dpr), IMAGE_PREVIEW_MIN_DIM, IMAGE_PREVIEW_MAX_DIM);
		const heightRaw = clampNumber(Math.round(viewportHeight * 0.95 * dpr), IMAGE_PREVIEW_MIN_DIM, IMAGE_PREVIEW_MAX_DIM);
		return {
			width: clampNumber(quantizeNumber(widthRaw, IMAGE_PREVIEW_DIM_STEP), IMAGE_PREVIEW_MIN_DIM, IMAGE_PREVIEW_MAX_DIM),
			height: clampNumber(quantizeNumber(heightRaw, IMAGE_PREVIEW_DIM_STEP), IMAGE_PREVIEW_MIN_DIM, IMAGE_PREVIEW_MAX_DIM),
			quality: IMAGE_PREVIEW_QUALITY
		};
	}

	private getImageGridThumbnailParallelLimit(state: TurboFileImageGridState): number {
		const device = this.getPaneDevice(state.side);
		if (!device || device.id === LOCAL_WINDOWS_DEVICE_ID) {
			return IMAGE_GRID_LOCAL_PARALLEL_LIMIT;
		}
		return device.platform === 'windows' ? IMAGE_GRID_REMOTE_WINDOWS_PARALLEL_LIMIT : IMAGE_GRID_REMOTE_PARALLEL_LIMIT;
	}

	private handleImageGridScroll(body: HTMLElement, state: TurboFileImageGridState): void {
		this.setActiveImageGridState(state);
		state.scrollTop = body.scrollTop;
		state.viewportHeight = body.clientHeight || state.viewportHeight;
		this.trimImageGridThumbnailQueue(state);
		if (state.scrollRaf || !this.container) {
			return;
		}
		state.scrollRaf = getWindow(this.container).requestAnimationFrame(() => {
			state.scrollRaf = 0;
			if (!this.isImageGridSurfaceActive(state)) {
				return;
			}
			const range = this.getImageGridVirtualRange(state);
			const rendered = state.renderedRange;
			if (rendered && rendered.startIndex === range.startIndex && rendered.endIndex === range.endIndex && rendered.columns === this.getImageGridEffectiveColumns(state) && rendered.total === state.images.length) {
				return;
			}
			this.clearImageGridScrollTimer();
			this.updateImageGridVirtualSlice(state, range);
		});
	}

	private handleImageGridWheel(event: WheelEvent, body: HTMLElement, state: TurboFileImageGridState): void {
		this.setActiveImageGridState(state);
		if (!event.ctrlKey || event.altKey || event.metaKey) {
			return;
		}
		event.preventDefault();
		const deltaModeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
			? 16
			: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
				? Math.max(body.clientHeight, IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD)
				: 1;
		this.imageGridCtrlWheelDeltaRemainder += event.deltaY * deltaModeScale;
		while (this.imageGridCtrlWheelDeltaRemainder <= -IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD) {
			this.imageGridCtrlWheelDeltaRemainder += IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD;
			this.setImageGridColumns(state, state.columns - 1);
		}
		while (this.imageGridCtrlWheelDeltaRemainder >= IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD) {
			this.imageGridCtrlWheelDeltaRemainder -= IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD;
			this.setImageGridColumns(state, state.columns + 1);
		}
	}

	private normalizeImageGridColumns(columns: number): TurboFileImageGridColumns {
		const rounded = Math.round(columns);
		return clampNumber(rounded, IMAGE_GRID_COLUMN_MIN, IMAGE_GRID_COLUMN_MAX);
	}

	private updateImageGridVirtualSlice(state: TurboFileImageGridState, range: TurboFileImageGridRange): void {
		if (!this.container || !this.isImageGridSurfaceActive(state)) {
			return;
		}
		const root = this.getImageGridRootElement(state);
		const grid = root?.querySelector<HTMLElement>('.turbofile-image-page-grid');
		if (!grid) {
			return;
		}
		// The body-width cache means renderImageGridSlice no longer forces a layout mid-refill, so the
		// browser should not collapse scrollHeight and clamp scrollTop. As a safety net, capture the
		// live scroll position before the rebuild and only restore it if the rebuild actually drove
		// scrollTop backwards (a collapse). Using the live pre-render value — not the stale state —
		// ensures we never yank against ongoing inertial scrolling, which is what caused the jitter.
		const body = root?.querySelector<HTMLElement>('.turbofile-image-page-body');
		const scrollTopBeforeRender = body ? body.scrollTop : state.scrollTop;
		this.renderImageGridSlice(grid, state, range);
		if (body && body.scrollTop < scrollTopBeforeRender) {
			body.scrollTop = scrollTopBeforeRender;
			state.scrollTop = scrollTopBeforeRender;
		}
	}

	private clearImageGridScrollTimer(): void {
		for (const timer of this.imageGridVisibleLoadTimers.values()) {
			clearTimeout(timer);
		}
		this.imageGridVisibleLoadTimers.clear();
		if (!this.imageGridScrollRenderTimer) {
			return;
		}
		clearTimeout(this.imageGridScrollRenderTimer);
		this.imageGridScrollRenderTimer = undefined;
	}

	private clearImageGridVisibleLoadTimer(state: TurboFileImageGridState): void {
		const timer = this.imageGridVisibleLoadTimers.get(state);
		if (!timer) {
			return;
		}
		clearTimeout(timer);
		this.imageGridVisibleLoadTimers.delete(state);
	}

	private clearImageGridScrollRaf(): void {
		const seen = new Set<TurboFileImageGridState>();
		for (const state of [this.imageGridState, ...Object.values(this.paneImageGridStates)]) {
			if (state && !seen.has(state)) {
				seen.add(state);
				this.clearImageGridStateScrollRaf(state);
			}
		}
	}

	private clearImageGridStateScrollRaf(state: TurboFileImageGridState): void {
		if (!state.scrollRaf || !this.container) {
			state.scrollRaf = 0;
			return;
		}
		getWindow(this.container).cancelAnimationFrame(state.scrollRaf);
		state.scrollRaf = 0;
	}

	private clearImageGridPreviewPrefetchTimer(): void {
		if (!this.imageGridPreviewPrefetchTimer) {
			return;
		}
		clearTimeout(this.imageGridPreviewPrefetchTimer);
		this.imageGridPreviewPrefetchTimer = undefined;
	}

	private getImageGridVisibleIndexes(state: TurboFileImageGridState): number[] {
		const rendered = state.renderedRange;
		const range = rendered && rendered.columns === this.getImageGridEffectiveColumns(state) && rendered.total === state.images.length
			? { startIndex: rendered.startIndex, endIndex: rendered.endIndex }
			: this.getImageGridVirtualRange(state);
		const indexes: number[] = [];
		for (let index = range.startIndex; index < range.endIndex; index++) {
			indexes.push(index);
		}
		return indexes;
	}

	private trimImageGridThumbnailQueue(state: TurboFileImageGridState): void {
		if (!this.imageGridThumbnailQueue.length) {
			return;
		}
		const visible = new Set(this.getImageGridVisibleIndexes(state));
		for (let index = this.imageGridThumbnailQueue.length - 1; index >= 0; index--) {
			const request = this.imageGridThumbnailQueue[index];
			if (request.state !== state || !visible.has(request.index)) {
				this.imageGridThumbnailQueued.delete(request.key);
				this.imageGridThumbnailQueue.splice(index, 1);
			}
		}
	}

	private clearImageGridThumbnailQueue(): void {
		this.imageGridThumbnailQueue.length = 0;
		this.imageGridThumbnailQueued.clear();
	}

	private clearImageGridLoadedImageIndexes(state: TurboFileImageGridState): void {
		state.loadedThumbnailIndexes.clear();
		state.loadedPreviewIndexes.clear();
	}

	private isImageGridIndexNearViewport(state: TurboFileImageGridState, index: number): boolean {
		const rendered = state.renderedRange;
		if (rendered && rendered.columns === this.getImageGridEffectiveColumns(state) && rendered.total === state.images.length) {
			return index >= rendered.startIndex && index < rendered.endIndex;
		}
		const range = this.getImageGridVirtualRange(state);
		return index >= range.startIndex && index < range.endIndex;
	}

	private releaseImageGridImagesOutsideRange(state: TurboFileImageGridState, range: TurboFileImageGridRange): void {
		const keepRowWidth = this.getImageGridEffectiveColumns(state);
		const keepThumbnailStart = Math.max(0, range.startIndex - keepRowWidth);
		const keepThumbnailEnd = Math.min(state.images.length, range.endIndex + keepRowWidth);
		for (const index of Array.from(state.loadedThumbnailIndexes)) {
			const image = state.images[index];
			if (!image) {
				state.loadedThumbnailIndexes.delete(index);
				continue;
			}
			const keepThumbnail = index >= keepThumbnailStart && index < keepThumbnailEnd;
			if (!keepThumbnail && (image.thumbnailUrl || image.thumbnailContent || image.thumbnailError)) {
				this.releaseImageBlobUrl(image.thumbnailUrl);
				image.thumbnailUrl = undefined;
				image.thumbnailContent = '';
				image.thumbnailError = undefined;
				image.thumbnailDecodeFailures = undefined;
				state.loadedThumbnailIndexes.delete(index);
			}
		}

		for (const index of Array.from(state.loadedPreviewIndexes)) {
			const image = state.images[index];
			if (!image) {
				state.loadedPreviewIndexes.delete(index);
				continue;
			}
			const keepPreview = this.shouldKeepImageGridPreview(state, index);
			if (!keepPreview && (image.previewUrl || image.previewContent || image.previewError)) {
				this.releaseImageBlobUrl(image.previewUrl);
				image.previewUrl = undefined;
				image.previewContent = '';
				image.previewError = undefined;
				image.previewDecodeFailures = undefined;
				image.previewImage = undefined;
				image.previewImageKey = undefined;
				image.previewImageLoading = undefined;
				image.previewImageLoadingKey = undefined;
				state.loadedPreviewIndexes.delete(index);
			}
		}
	}

	private releaseImageGridImage(image: TurboFileImageGridImage): void {
		this.releaseImageBlobUrl(image.thumbnailUrl);
		this.releaseImageBlobUrl(image.previewUrl);
		image.thumbnailUrl = undefined;
		image.thumbnailContent = '';
		image.thumbnailLoading = false;
		image.thumbnailError = undefined;
		image.thumbnailDecodeFailures = undefined;
		image.previewUrl = undefined;
		image.previewContent = '';
		image.previewLoading = false;
		image.previewError = undefined;
		image.previewDecodeFailures = undefined;
		image.previewImage = undefined;
		image.previewImageKey = undefined;
		image.previewImageLoading = undefined;
		image.previewImageLoadingKey = undefined;
	}

	private releaseImageGridStateImages(state: TurboFileImageGridState | undefined): void {
		if (!state) {
			return;
		}
		for (const image of state.images) {
			this.releaseImageGridImage(image);
		}
	}

	private getImageGridCircularDistance(state: TurboFileImageGridState, index: number, selectedIndex: number): number {
		if (!state.images.length) {
			return Number.MAX_SAFE_INTEGER;
		}
		const distance = Math.abs(index - selectedIndex);
		return Math.min(distance, state.images.length - distance);
	}

	private shouldKeepImageGridPreview(state: TurboFileImageGridState, index: number): boolean {
		if (!this.isImageGridSurfaceActive(state) || !state.previewVisible) {
			return false;
		}
		if (this.getImageGridCircularDistance(state, index, state.selectedIndex) <= IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT) {
			return true;
		}
		return state.previewPendingIndex !== undefined && this.getImageGridCircularDistance(state, index, state.previewPendingIndex) <= IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT;
	}

	private getImageGridQueueKey(state: TurboFileImageGridState, index: number): string {
		return `${state.side}|${state.path}|${index}`;
	}

	private handleImageGridThumbnailError(state: TurboFileImageGridState, index: number): void {
		if (!this.isImageGridSurfaceActive(state)) {
			return;
		}
		const image = state.images[index];
		if (!image) {
			return;
		}
		image.thumbnailDecodeFailures = (image.thumbnailDecodeFailures ?? 0) + 1;
		this.releaseImageBlobUrl(image.thumbnailUrl);
		image.thumbnailUrl = undefined;
		image.thumbnailContent = '';
		image.thumbnailLoading = false;
		state.loadedThumbnailIndexes.delete(index);
		if (image.thumbnailDecodeFailures <= IMAGE_GRID_DECODE_RETRY_LIMIT && this.isImageGridIndexNearViewport(state, index)) {
			image.thumbnailError = undefined;
			this.updateImageGridCard(state, index);
			this.queueImageGridThumbnailLoads(state, [index], true);
			return;
		}
		image.thumbnailError = '缩略图解码失败';
		this.updateImageGridCard(state, index);
	}

	private getImageGridSelectedIndexes(state: TurboFileImageGridState): number[] {
		for (const index of Array.from(state.selectedIndexes)) {
			if (index < 0 || index >= state.images.length) {
				state.selectedIndexes.delete(index);
			}
		}
		return Array.from(state.selectedIndexes).sort((a, b) => a - b);
	}

	private getImageGridSelectedImages(state: TurboFileImageGridState): { index: number; image: TurboFileImageGridImage }[] {
		return this.getImageGridSelectedIndexes(state)
			.map(index => ({ index, image: state.images[index] }))
			.filter((entry): entry is { index: number; image: TurboFileImageGridImage } => !!entry.image);
	}

	private getImageGridDeleteTargets(state: TurboFileImageGridState): { index: number; image: TurboFileImageGridImage }[] {
		const selected = this.getImageGridSelectedImages(state);
		if (selected.length) {
			return selected;
		}

		const image = state.images[state.selectedIndex];
		return image ? [{ index: state.selectedIndex, image }] : [];
	}

	private updateImageGridSelection(state: TurboFileImageGridState | undefined = this.imageGridState): void {
		if (!this.container || !state) {
			return;
		}
		const root = this.getImageGridRootElement(state);
		if (!root) {
			return;
		}

		const selectedIndexes = new Set(this.getImageGridSelectedIndexes(state));
		for (const card of Array.from(root.querySelectorAll<HTMLElement>('.turbofile-image-page-card[data-image-index]'))) {
			const index = Number(card.dataset.imageIndex);
			const selected = Number.isFinite(index) && selectedIndexes.has(index);
			card.classList.toggle('is-selected', selected);
			card.classList.toggle('is-focused', Number.isFinite(index) && state.selectedIndex === index);
			card.setAttribute('aria-selected', selected ? 'true' : 'false');
		}

		const deleteButton = root.querySelector<HTMLButtonElement>('.turbofile-image-page-action.is-delete');
		if (deleteButton) {
			const deleteTargetCount = this.getImageGridDeleteTargets(state).length;
			deleteButton.disabled = deleteTargetCount === 0;
			deleteButton.title = deleteTargetCount ? '\u5220\u9664\u9009\u4e2d\u56fe\u7247' : '\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u56fe\u7247';
		}
		const restoreButton = root.querySelector<HTMLButtonElement>('.turbofile-image-page-action.is-restore');
		if (restoreButton) {
			const restoreTargetCount = this.getImageGridDeleteTargets(state).length;
			restoreButton.disabled = restoreTargetCount === 0;
			restoreButton.title = restoreTargetCount ? '还原选中图片' : '请先选择要还原的图片';
		}
		const imageCount = root.querySelector<HTMLElement>('.turbofile-image-page-count');
		if (imageCount) {
			imageCount.textContent = `${selectedIndexes.size} / ${state.images.length}`;
		}
		const meta = this.container.querySelector<HTMLElement>('.turbofile-task-meta');
		if (meta && !this.tasks[0]) {
			meta.textContent = this.statusMessage;
		}
		this.refreshTaskbar();
	}

	private updateImageGridSelectionStatus(state: TurboFileImageGridState): void {
		const selectedCount = this.getImageGridSelectedIndexes(state).length;
		if (selectedCount > 1) {
			this.statusMessage = `\u5df2\u9009\u62e9 ${selectedCount} \u5f20\u56fe\u7247\uff0c\u53ef\u6309 Delete \u5220\u9664\u3002`;
			return;
		}
		if (selectedCount === 0) {
			this.statusMessage = '\u672a\u9009\u62e9\u56fe\u7247\u3002';
			return;
		}

		const image = state.images[state.selectedIndex];
		this.statusMessage = image ? `\u5df2\u9009\u62e9\u56fe\u7247\uff1a${image.item.name}` : '\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u56fe\u7247\u3002';
	}

	private releaseImageBlobUrl(url: string | undefined): void {
		if (!url) {
			return;
		}
		if (url.startsWith('blob:')) {
			URL.revokeObjectURL(url);
			return;
		}
		if (url.startsWith('turbofile-image:')) {
			void this.sshService.releaseImageResource(url);
		}
	}

	private ensureRemoteFileSystemProvider(): TurboFileRemoteFileSystemProvider {
		if (!this.remoteFileSystemProvider) {
			const existingProvider = this.fileService.getProvider(TURBOFILE_REMOTE_DOCUMENT_SCHEME);
			if (existingProvider instanceof TurboFileRemoteFileSystemProvider) {
				this.remoteFileSystemProvider = existingProvider;
			} else {
				this.remoteFileSystemProvider = this._register(new TurboFileRemoteFileSystemProvider(this.sshService));
				this._register(this.fileService.registerProvider(TURBOFILE_REMOTE_DOCUMENT_SCHEME, this.remoteFileSystemProvider));
			}
		}
		this.ensureRemoteDocumentLabelFormatter();
		return this.remoteFileSystemProvider;
	}

	/**
	 * Without a label formatter, VS Code derives the editor/tab label for our custom remote scheme
	 * from the full URI (authority included), so a document opened from an SSH device shows up as
	 * "<device>: name" instead of just the file name. Registering a formatter that uses only the path
	 * makes the tab show exactly the file name, e.g. "readme.md".
	 */
	private ensureRemoteDocumentLabelFormatter(): void {
		if (this.remoteDocumentLabelFormatterRegistered) {
			return;
		}
		this.remoteDocumentLabelFormatterRegistered = true;
		this._register(this.labelService.registerFormatter({
			scheme: TURBOFILE_REMOTE_DOCUMENT_SCHEME,
			formatting: {
				label: '${path}',
				separator: '/',
				tildify: false,
				normalizeDriveLetter: false
			}
		}));
	}

	private async openNativeDocument(side: 'left' | 'right', item: TurboFileFileItem, device: TurboFileDevice): Promise<void> {
		if (!item.path) {
			return;
		}
		const sourceInput = this.currentInput;
		if (!sourceInput) {
			return;
		}

		if (this.imageGridState) {
			this.closeImageGridPage();
		}
		const reportOpenError = (error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			this.statusMessage = `打开失败：${message}`;
			this.render();
		};

		try {
			const resource = device.id === LOCAL_WINDOWS_DEVICE_ID
				? URI.file(item.path)
				: this.ensureRemoteFileSystemProvider().registerFile(device, this.getSshConnectionOptions(device), item);
			const editorInput: IUntypedFileEditorInput = {
				resource,
				forceFile: true
			};
			const fileEditor = await this.textEditorService.resolveTextEditor(editorInput);
			applyTurboFileDocumentTabAffinity(fileEditor, sourceInput);
			const pane = await this.editorService.openEditor(fileEditor, {
				pinned: true,
				revealIfOpened: true,
				override: DEFAULT_EDITOR_ASSOCIATION.id,
				index: getTurboFileDocumentTargetIndex(this.group?.editors ?? [])
			});
			if (pane?.group) {
				ensureTurboFileTransferTabsLeft(pane.group);
			}
		} catch (error) {
			reportOpenError(error);
		}
	}

	private async moveUserItemsToTrash(device: TurboFileDevice, items: readonly TurboFileFileItem[], progressId?: string): Promise<ITurboFileTrashOperationResult> {
		const connection = device.id === LOCAL_WINDOWS_DEVICE_ID ? undefined : await this.getSshConnectionOptions(device);
		const sources = await Promise.all(items.filter(item => !!item.path).map(async item => ({
			endpoint: await this.toTransferEndpoint(device, item.path!, connection),
			type: item.type,
			knownSize: item.directory || item.attrsPending ? undefined : item.rawSize
		})));
		return this.sshService.movePathsToTrash({
			device: await this.toTrashDevice(device, connection),
			sources,
			progressId
		});
	}

	private async toTrashDevice(device: TurboFileDevice, connection?: ITurboFileSshConnectionOptions): Promise<ITurboFileTrashDevice> {
		if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
			return { kind: 'local', label: device.name };
		}
		return {
			kind: 'ssh',
			connection: connection ?? await this.getSshConnectionOptions(device),
			label: device.name,
			windows: this.isWindowsDevice(device)
		};
	}

	private async toggleTrashView(side: 'left' | 'right'): Promise<void> {
		if (this.paneStates[side].trashMode.active) {
			this.leaveTrashView(side);
			return;
		}
		const state = this.paneStates[side];
		state.trashMode = enterTurboFileTrashView(state.path);
		state.items = [];
		state.error = undefined;
		this.resetPaneScroll(side);
		this.clearPaneSelection(side);
		this.render();
		await this.refreshTrashPane(side);
	}

	private async openTrashItem(side: 'left' | 'right', item: TurboFileFileItem): Promise<void> {
		if (!item.path || !item.trashItem) {
			return;
		}
		if (!item.directory) {
			await this.previewSelected(side, item);
			return;
		}
		const state = this.paneStates[side];
		state.trashMode = enterTurboFileTrashDirectory(state.trashMode, item.trashItem);
		state.path = item.trashItem.payloadPath;
		state.items = [];
		state.error = undefined;
		this.resetPaneScroll(side);
		this.clearPaneSelection(side);
		this.render();
		await this.refreshTrashBrowsePane(side, true);
	}

	private async leaveTrashDirectory(side: 'left' | 'right'): Promise<void> {
		const state = this.paneStates[side];
		if (!state.trashMode.browseItem) {
			return;
		}
		state.path = state.trashMode.returnPath ?? state.path;
		state.trashMode = leaveTurboFileTrashDirectory(state.trashMode);
		state.items = [];
		state.error = undefined;
		this.resetPaneScroll(side);
		this.clearPaneSelection(side);
		this.render();
		await this.refreshTrashPane(side);
	}

	private getTrashBrowseRelativePath(mode: TurboFileTrashPaneMode): string {
		if (!mode.browseItem || !mode.browsePath) {
			return '';
		}
		const windowsPath = mode.browsePath.includes('\\') || /^[a-zA-Z]:/.test(mode.browsePath);
		const root = windowsPath ? mode.browseItem.payloadPath.replace(/\//g, '\\') : mode.browseItem.payloadPath.replace(/\\/g, '/');
		const current = windowsPath ? mode.browsePath.replace(/\//g, '\\') : mode.browsePath.replace(/\\/g, '/');
		const relative = current.slice(root.length).replace(/^[\\/]+/, '').replace(/[\\/]+/g, ' / ');
		return relative ? ` / ${relative}` : '';
	}

	private isTrashBrowseNavigationAllowed(side: 'left' | 'right', path: string): boolean {
		const mode = this.paneStates[side].trashMode;
		const device = this.getPaneDevice(side);
		return !mode.browseItem || !device || isTurboFileTrashBrowsePathAllowed(mode.browseItem.payloadPath, path, this.isWindowsDevice(device));
	}

	private async navigateTrashBrowseDirectory(side: 'left' | 'right', path: string): Promise<void> {
		const state = this.paneStates[side];
		const device = this.getPaneDevice(side);
		const item = state.trashMode.browseItem;
		if (!device || !item) {
			return;
		}
		if (!isTurboFileTrashBrowsePathAllowed(item.payloadPath, path, this.isWindowsDevice(device))) {
			this.leaveTrashDirectory(side);
			return;
		}
		state.trashMode = enterTurboFileTrashDirectory(state.trashMode, item, path);
		state.path = path;
		this.resetPaneScroll(side);
		this.clearPaneSelection(side);
		await this.refreshTrashBrowsePane(side);
	}

	private leaveTrashView(side: 'left' | 'right'): void {
		const state = this.paneStates[side];
		const returnPath = state.trashMode.returnPath ?? state.path;
		state.trashMode = leaveTurboFileTrashView();
		state.trashItems = [];
		state.items = [];
		state.error = undefined;
		this.resetPaneScroll(side);
		this.clearPaneSelection(side);
		this.render();
		void this.refreshPane(side, { path: returnPath, force: true, silent: true });
	}

	private async refreshTrashPane(side: 'left' | 'right'): Promise<void> {
		const state = this.paneStates[side];
		const device = this.getPaneDevice(side);
		if (!state.trashMode.active || !device) {
			return;
		}
		if (state.trashMode.browseItem) {
			await this.refreshTrashBrowsePane(side);
			return;
		}
		const requestId = ++this.paneRequestSeq[side];
		state.loading = true;
		state.error = undefined;
		this.render();
		try {
			const listing = await this.sshService.listTrashItems(await this.toTrashDevice(device));
			if (this.paneRequestSeq[side] !== requestId || !this.paneStates[side].trashMode.active || this.getPaneDevice(side)?.id !== device.id) {
				return;
			}
			if (!listing.ok) {
				throw new Error(listing.message);
			}
			state.trashItems = [...listing.items];
			state.trashHasItems = listing.items.length > 0;
			state.trashStateKnown = true;
			state.items = this.sortPaneItems(side, mapTurboFileTrashItemsToRows(listing.items).map(row => ({
				name: row.name,
				size: row.knownSize === undefined ? '' : formatSize(row.rawSize),
				rawSize: row.rawSize,
				modified: formatDate(row.deletedAt),
				rawModified: row.rawModified,
				type: row.type,
				directory: row.directory,
				path: row.item.payloadPath,
				trashItem: row.item
			})));
			this.clearPaneSelection(side);
		} catch (error) {
			if (this.paneRequestSeq[side] === requestId) {
				state.error = error instanceof Error ? error.message : String(error);
				state.items = [];
			}
		} finally {
			if (this.paneRequestSeq[side] === requestId) {
				state.loading = false;
				this.render();
			}
		}
	}

	private async refreshTrashBrowsePane(side: 'left' | 'right', force: boolean = false): Promise<void> {
		const state = this.paneStates[side];
		const device = this.getPaneDevice(side);
		const browseItem = state.trashMode.browseItem;
		const browsePath = state.trashMode.browsePath ?? browseItem?.payloadPath;
		if (!device || !browseItem || !browsePath) {
			return;
		}
		if (!isTurboFileTrashBrowsePathAllowed(browseItem.payloadPath, browsePath, this.isWindowsDevice(device))) {
			this.leaveTrashDirectory(side);
			return;
		}
		const requestId = ++this.paneRequestSeq[side];
		state.loading = true;
		state.error = undefined;
		this.render();
		try {
			const listing = await this.loadPaneDirectory(device, browsePath, force, 'foreground', this.paneSortNeedsAttributes(side));
			const currentMode = this.paneStates[side].trashMode;
			if (this.paneRequestSeq[side] !== requestId || currentMode.browseItem?.id !== browseItem.id) {
				return;
			}
			if (!isTurboFileTrashBrowsePathAllowed(browseItem.payloadPath, listing.path, this.isWindowsDevice(device))) {
				throw new Error(localize('turbofile.recycleBinPathEscaped', "回收站目录超出允许范围。"));
			}
			state.path = listing.path;
			state.trashMode = enterTurboFileTrashDirectory(currentMode, browseItem, listing.path);
			state.items = this.sortPaneItems(side, listing.items);
			state.error = undefined;
			this.clearPaneSelection(side);
			this.statusMessage = localize('turbofile.recycleBinDirectoryLoaded', "已加载回收站目录：{0}", browseItem.originalName);
		} catch (error) {
			if (this.paneRequestSeq[side] === requestId) {
				state.error = error instanceof Error ? error.message : String(error);
				state.items = [];
			}
		} finally {
			if (this.paneRequestSeq[side] === requestId) {
				state.loading = false;
				this.render();
			}
		}
	}

	private async refreshTrashState(side: 'left' | 'right'): Promise<void> {
		const state = this.paneStates[side];
		const device = this.getPaneDevice(side);
		if (!device || state.trashMode.active) {
			return;
		}
		try {
			const result = await this.sshService.getTrashState(await this.toTrashDevice(device));
			if (this.getPaneDevice(side)?.id !== device.id || this.paneStates[side].trashMode.active) {
				return;
			}
			const changed = state.trashHasItems !== result.hasItems;
			state.trashHasItems = result.hasItems;
			state.trashStateKnown = result.ok;
			if (changed) {
				this.render();
			}
		} catch {
			// The file browser remains usable when recycle-bin state probing is unavailable.
		}
	}

	private getSelectedTrashItems(side: 'left' | 'right'): ITurboFileTrashItem[] {
		return this.getSelectedTransferItems(side)
			.map(item => item.trashItem)
			.filter((item): item is ITurboFileTrashItem => !!item);
	}

	private async restoreSelectedTrashItems(side: 'left' | 'right'): Promise<void> {
		const device = this.getPaneDevice(side);
		const items = this.getSelectedTrashItems(side);
		if (!device || !items.length) {
			return;
		}
		try {
			const trashDevice = await this.toTrashDevice(device);
			let result = await this.sshService.restoreTrashItems({ device: trashDevice, items, conflictPolicy: 'cancel' });
			const itemsById = new Map(items.map(item => [item.id, item]));
			const conflicts = result.results
				.filter(item => item.conflict)
				.map(item => item.id ? itemsById.get(item.id) : undefined)
				.filter((item): item is ITurboFileTrashItem => !!item);
			if (conflicts.length) {
				const keepBoth = await this.showDialogConfirm(
					localize('turbofile.restoreConflictTitle', "还原名称冲突"),
					localize('turbofile.restoreConflictMessage', "原位置已有 {0} 个同名项目，是否自动添加序号并保留两者？", conflicts.length),
					undefined,
					false,
					localize('turbofile.keepBoth', "保留两者")
				);
				if (keepBoth) {
					const retry = await this.sshService.restoreTrashItems({ device: trashDevice, items: conflicts, conflictPolicy: 'keepBoth' });
					result = {
						...result,
						ok: result.results.filter(item => !item.conflict).every(item => item.ok) && retry.ok,
						completed: result.results.filter(item => item.ok).length + retry.completed,
						failed: result.results.filter(item => !item.ok && !item.conflict).length + retry.failed,
						results: [...result.results.filter(item => !item.conflict), ...retry.results]
					};
				}
			}
			this.statusMessage = result.ok
				? localize('turbofile.restoreComplete', "已还原 {0} 个项目。", result.completed)
				: localize('turbofile.restorePartial', "已还原 {0} 个，失败 {1} 个。", result.completed, result.failed);
			await this.refreshTrashPane(side);
			await this.refreshVisibleRestoredDirectories(items);
		} catch (error) {
			this.statusMessage = localize('turbofile.restoreFailed', "还原失败：{0}", error instanceof Error ? error.message : String(error));
			await this.refreshTrashPane(side);
		}
	}

	private async refreshVisibleRestoredDirectories(items: readonly ITurboFileTrashItem[]): Promise<void> {
		return this.refreshVisibleRestoredPaths(items.map(item => item.originalPath));
	}

	private async refreshVisibleRestoredPaths(paths: readonly string[]): Promise<void> {
		for (const side of ['left', 'right'] as const) {
			const state = this.paneStates[side];
			if (state.trashMode.active) {
				continue;
			}
			const device = this.getPaneDevice(side);
			if (!device) {
				continue;
			}
			const windowsPath = this.isWindowsDevice(device);
			if (paths.some(path => this.pathsEqualForDevice(getPaneParentPath(path, windowsPath) ?? path, state.path, windowsPath))) {
				await this.refreshPane(side, { force: true, silent: true });
			}
		}
	}

	private async permanentlyDeleteSelectedTrashItems(side: 'left' | 'right'): Promise<boolean> {
		const device = this.getPaneDevice(side);
		const selectedItems = this.getSelectedTransferItems(side);
		const items = selectedItems.map(item => item.trashItem).filter((item): item is ITurboFileTrashItem => !!item);
		if (!device || !items.length) {
			return false;
		}
		if (!await this.confirmDelete(
			localize('turbofile.permanentDeleteTitle', "永久删除"),
			localize('turbofile.permanentDeleteMessage', "永久删除选中的 {0} 个项目吗？此操作无法撤销。", items.length),
			undefined,
			true,
			localize('turbofile.deletePermanently', "永久删除")
		)) {
			return false;
		}
		const mutationContext = this.capturePaneMutationContext(side);
		this.removePaneItems(side, selectedItems);
		const task = this.beginTask('delete', items.length > 1 ? `永久删除 ${items.length} 项` : `永久删除 ${items[0].originalName}`, device.name);
		try {
			this.updateTask(task, items.length > 1 ? `正在永久删除 ${items.length} 项…` : `正在永久删除：${items[0].originalName}`, 40);
			const result = await this.sshService.permanentlyDeleteTrashItems({ device: await this.toTrashDevice(device), items, progressId: task.progressId });
			this.updateTask(task, `正在刷新回收站：${device.name}`, 90);
			await this.refreshPanesAfterDelete(mutationContext);
			if (result.ok) {
				this.finishTask(task, 'success', localize('turbofile.permanentDeleteComplete', "已永久删除 {0} 个项目。", result.completed), { durationMs: Date.now() - task.startedAt });
			} else {
				const message = localize('turbofile.permanentDeletePartial', "已删除 {0} 个，失败 {1} 个。", result.completed, result.failed);
				this.finishTask(task, 'error', message, { error: result.message, durationMs: Date.now() - task.startedAt });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', localize('turbofile.permanentDeleteFailed', "永久删除失败：{0}", message), { error: message, durationMs: Date.now() - task.startedAt });
			await this.refreshPanesAfterDelete(mutationContext);
		}
		return true;
	}

	private async emptyTrash(side: 'left' | 'right'): Promise<void> {
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}
		if (!await this.confirmDelete(
			localize('turbofile.emptyRecycleBinTitle', "清空回收站"),
			localize('turbofile.emptyRecycleBinMessage', "永久删除当前设备回收站中的所有项目吗？此操作无法撤销。"),
			undefined,
			true,
			localize('turbofile.emptyRecycleBin', "清空回收站")
		)) {
			return;
		}
		const mutationContext = this.capturePaneMutationContext(side);
		this.removePaneItems(side, this.paneStates[side].items.filter(item => !item.parent));
		const task = this.beginTask('delete', '清空回收站', device.name);
		try {
			this.updateTask(task, `正在清空回收站：${device.name}`, 40);
			const result = await this.sshService.emptyTrash(await this.toTrashDevice(device), { progressId: task.progressId });
			this.updateTask(task, `正在刷新回收站：${device.name}`, 90);
			await this.refreshPanesAfterDelete(mutationContext);
			if (result.ok) {
				this.finishTask(task, 'success', localize('turbofile.recycleBinEmptied', "回收站已清空。"), { durationMs: Date.now() - task.startedAt });
			} else {
				const message = localize('turbofile.recycleBinEmptyPartial', "已删除 {0} 个，失败 {1} 个。", result.completed, result.failed);
				this.finishTask(task, 'error', message, { error: result.message, durationMs: Date.now() - task.startedAt });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', localize('turbofile.recycleBinEmptyFailed', "清空回收站失败：{0}", message), { error: message, durationMs: Date.now() - task.startedAt });
			await this.refreshPanesAfterDelete(mutationContext);
		}
	}

	private async compressSelected(side: 'left' | 'right'): Promise<void> {
		const item = this.getSelectedItem(side);
		const device = this.getPaneDevice(side);
		if (!item?.path || !device || item.parent) {
			this.statusMessage = '请先选择要压缩的文件或目录。';
			this.render();
			return;
		}
		if (!await this.showDialogConfirm('压缩确认', `确定压缩 ${item.name} 吗？`, '压缩进度会显示在底部任务区域。')) {
			return;
		}

		const task = this.beginTask('compress', `压缩 ${item.name}`, device.name);
		try {
			const result = await this.sshService.compressPath(await this.toTransferEndpoint(device, item.path), undefined, { progressId: task.progressId });
			this.updateTask(task, `正在刷新目录：${device.name}`, 90);
			if (result.ok) {
				this.finishTask(task, 'success', `压缩完成：${item.name}`);
			} else {
				this.finishTask(task, 'error', `压缩失败：${result.message}`, { error: result.message });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `压缩失败：${message}`, { error: message });
		} finally {
			await this.refreshPane(side, { force: true });
		}
	}

	private async extractSelected(side: 'left' | 'right'): Promise<void> {
		const item = this.getSelectedItem(side);
		const device = this.getPaneDevice(side);
		if (!item?.path || !device || item.parent || item.directory) {
			this.statusMessage = '请先选择要解压的归档文件。';
			this.render();
			return;
		}

		if (!isArchiveFile(item.name)) {
			this.statusMessage = '当前文件不是支持的归档格式。';
			this.render();
			return;
		}
		if (!await this.showDialogConfirm('解压确认', `确定解压 ${item.name} 吗？`, '解压进度会显示在底部任务区域。')) {
			return;
		}

		const task = this.beginTask('extract', `解压 ${item.name}`, device.name);
		try {
			const result = await this.sshService.extractPath(await this.toTransferEndpoint(device, item.path), undefined, { progressId: task.progressId });
			this.updateTask(task, `正在刷新目录：${device.name}`, 90);
			if (result.ok) {
				this.finishTask(task, 'success', `解压完成：${item.name}`);
			} else {
				this.finishTask(task, 'error', `解压失败：${result.message}`, { error: result.message });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `解压失败：${message}`, { error: message });
		} finally {
			await this.refreshPane(side, { force: true });
		}
	}

	private async copyPanePath(side: 'left' | 'right'): Promise<void> {
		const device = this.getPaneDevice(side);
		const windowsPath = !!device && this.isWindowsDevice(device);
		const path = this.formatPanePathForDisplay(this.paneStates[side].path, windowsPath);
		await this.clipboardService.writeText(path);
		this.statusMessage = `已复制当前路径：${path}`;
		this.render();
	}

	private async copySelectedPath(side: 'left' | 'right'): Promise<void> {
		const item = this.getSelectedItem(side);
		const device = this.getPaneDevice(side);
		if (!item?.path || !device || item.parent) {
			this.statusMessage = '请先选择要复制路径的文件或目录。';
			this.render();
			return;
		}

		const path = this.formatPanePathForDisplay(item.path, this.isWindowsDevice(device));
		await this.clipboardService.writeText(path);
		this.statusMessage = `已复制路径：${path}`;
		await this.refreshPane(side, { force: true });
		this.render();
	}

	private async calculateSelectedSize(side: 'left' | 'right'): Promise<void> {
		const item = this.getSelectedItem(side);
		const device = this.getPaneDevice(side);
		if (!item?.path || !device || item.parent) {
			this.statusMessage = '请先选择要计算大小的文件或目录。';
			this.render();
			return;
		}

		const displayPath = this.formatPanePathForDisplay(item.path, this.isWindowsDevice(device));
		const task = this.beginTask('size', `计算大小 ${item.name}`, device.name);
		try {
			const result = await this.sshService.calculatePathSize(await this.toTransferEndpoint(device, item.path), { progressId: task.progressId });
			this.updateTask(task, `正在刷新目录：${device.name}`, 90);
			if (result.ok) {
				const sizeText = result.humanSize ?? formatSize(result.size);
				this.finishTask(task, 'success', `${item.name} 大小：${sizeText}`);
				this.showDialogInfo('计算大小完成', `${item.name} 大小：${sizeText}`, `设备：${device.name}\n路径：${displayPath}`);
			} else {
				this.finishTask(task, 'error', `计算大小失败：${result.message}`, { error: result.message });
				this.showDialogInfo('计算大小失败', result.message, `设备：${device.name}\n路径：${displayPath}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `计算大小失败：${message}`, { error: message });
			this.showDialogInfo('计算大小失败', message, `设备：${device.name}\n路径：${displayPath}`);
		} finally {
			await this.refreshPane(side, { force: true });
		}
	}

	private async searchInPane(side: 'left' | 'right'): Promise<void> {
		const keyword = (await this.quickInputService.input({
			title: '递归查找',
			placeHolder: '输入文件名、目录名或关键字',
			prompt: `搜索${this.getSideLabel(side)}当前已加载目录`
		}))?.trim();
		if (!keyword) {
			return;
		}

		const normalizedKeyword = keyword.toLowerCase();
		const state = this.paneStates[side];
		const matches = state.items.filter(item => !item.parent && item.path && item.name.toLowerCase().includes(normalizedKeyword));
		if (!matches.length) {
			this.statusMessage = `当前目录未找到：${keyword}`;
			this.render();
			return;
		}

		let target = matches[0];
		if (matches.length > 1) {
			const device = this.getPaneDevice(side);
			const windowsPath = !!device && this.isWindowsDevice(device);
			const picks: Array<IQuickPickItem & { item: TurboFileFileItem }> = matches.slice(0, 80).map(item => ({
				label: item.name,
				description: item.directory ? '文件夹' : item.size,
				detail: this.formatPanePathForDisplay(item.path ?? '', windowsPath),
				item
			}));
			const picked = await this.quickInputService.pick(picks, {
				title: '搜索结果',
				placeHolder: `找到 ${matches.length} 项，选择要定位的文件或文件夹`
			});
			if (!picked) {
				return;
			}
			target = picked.item;
		}

		this.revealPaneItem(side, target, `已定位：${target.name}`);
	}

	private revealPaneItem(side: 'left' | 'right', item: TurboFileFileItem, message: string): void {
		if (!item.path) {
			return;
		}
		const state = this.paneStates[side];
		const index = this.getVisibleFileItems(state).findIndex(candidate => candidate.path === item.path);
		if (index >= 0) {
			state.scrollTop = Math.max(0, (index - 4) * this.getFileListRowHeight(state));
			this.fileListRenderedRange[side] = undefined;
		}
		this.setSingleSelection(side, item);
		this.statusMessage = message;
		this.render();
	}

	private async openTerminal(side: 'left' | 'right'): Promise<void> {
		const device = this.getPaneDevice(side);
		const state = this.paneStates[side];
		const pageInstanceId = this.currentInput?.instanceId;
		if (!device) {
			return;
		}
		if (!pageInstanceId) {
			return;
		}

		this.taskbarHiddenForTerminal = true;
		this.terminalRevealInProgress = true;
		this.render();
		const title = this.getTerminalTitle(side, device);
		try {
			turboFileTerminalPanelHiddenByPageId.delete(pageInstanceId);
			if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
				const defaultProfile = this.terminalProfileService.getDefaultProfile();
				const instance = await this.createAndRevealTerminal({
					cwd: state.path,
					location: TerminalLocation.Panel,
					config: defaultProfile ? {
						...defaultProfile,
						profileName: title,
						overrideName: true,
						icon: defaultProfile.icon ?? Codicon.terminal
					} : undefined
				});
				this.bindTerminalToPage(pageInstanceId, instance);
				await this.revealBoundTerminalsForPage(pageInstanceId, instance, true);
				this.statusMessage = `已打开本地终端：${title}`;
				this.render();
				this.refocusTerminalAfterRender(instance);
				return;
			}

			const connection = this.getSshConnectionOptions(device);
			const instance = await this.createAndRevealTerminal({
				location: TerminalLocation.Panel,
				config: {
					name: title,
					icon: Codicon.terminal,
					isFeatureTerminal: false,
					customPtyImplementation: (id, cols, rows) => new TurboFileSshTerminalProcess(id, cols, rows, this.sshService, connection, state.path)
				}
			});
			this.bindTerminalToPage(pageInstanceId, instance);
			await this.revealBoundTerminalsForPage(pageInstanceId, instance, true);
			this.statusMessage = `已打开内置 SSH 终端：${title}`;
			this.render();
			this.refocusTerminalAfterRender(instance);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.restoreTaskbarAfterTerminal();
			this.statusMessage = device.id === LOCAL_WINDOWS_DEVICE_ID
				? `打开本地终端失败：${message}`
				: `打开 SSH 终端失败：${message}`;
			this.render();
		} finally {
			this.terminalRevealInProgress = false;
		}
	}

	private restoreTaskbarAfterTerminal(): void {
		if (!this.taskbarHiddenForTerminal) {
			return;
		}
		this.taskbarHiddenForTerminal = false;
		if (this.activePage === 'transfer') {
			this.render();
		}
	}

	private isCurrentTransferEditorActive(): boolean {
		return this.isEditorVisible
			&& this.activePage === 'transfer'
			&& !!this.currentInput
			&& this.editorService.activeEditor === this.currentInput;
	}

	private rememberTerminalPanelHiddenForCurrentPage(): void {
		if (!this.isCurrentTransferEditorActive()) {
			return;
		}
		// Only treat a panel hide as "the user hid this page's terminal" while the transfer page is
		// actually showing. A hide triggered while on another in-app page (images, tasks, …)
		// must not mark the terminal hidden, otherwise it would appear to vanish when returning to the
		// transfer page even though it is still open and bound.
		const pageInstanceId = this.currentInput?.instanceId;
		if (!pageInstanceId || this.getBoundTerminalsForPage(pageInstanceId).length === 0) {
			return;
		}
		turboFileTerminalPanelHiddenByPageId.add(pageInstanceId);
	}

	private beginTerminalPanelVisibilityChange(): void {
		if (turboFileTerminalPanelVisibilityResetHandle !== undefined) {
			getWindow(this.container).clearTimeout(turboFileTerminalPanelVisibilityResetHandle);
			turboFileTerminalPanelVisibilityResetHandle = undefined;
		}
		turboFileTerminalPanelVisibilityChangeDepth++;
		turboFileTerminalPanelVisibilityInProgress = true;
	}

	private endTerminalPanelVisibilityChange(): void {
		turboFileTerminalPanelVisibilityChangeDepth = Math.max(0, turboFileTerminalPanelVisibilityChangeDepth - 1);
		if (turboFileTerminalPanelVisibilityChangeDepth > 0) {
			return;
		}
		turboFileTerminalPanelVisibilityResetHandle = getWindow(this.container).setTimeout(() => {
			turboFileTerminalPanelVisibilityResetHandle = undefined;
			if (turboFileTerminalPanelVisibilityChangeDepth === 0) {
				turboFileTerminalPanelVisibilityInProgress = false;
			}
		}, 100);
	}

	private bindTerminalToPage(pageInstanceId: string, instance: ITerminalInstance): void {
		this.clearTerminalBindingForInstance(instance.instanceId);
		turboFileTerminalPageByTerminalId.set(instance.instanceId, pageInstanceId);
		turboFileLastActiveTerminalByPageId.set(pageInstanceId, instance.instanceId);
	}

	private getBoundTerminalsForPage(pageInstanceId: string): ITerminalInstance[] {
		const instances: ITerminalInstance[] = [];
		for (const [terminalInstanceId, boundPageInstanceId] of [...turboFileTerminalPageByTerminalId]) {
			if (boundPageInstanceId !== pageInstanceId) {
				continue;
			}
			const instance = this.terminalService.getInstanceFromId(terminalInstanceId);
			if (!instance || instance.isDisposed) {
				this.clearTerminalBindingForInstance(terminalInstanceId);
				continue;
			}
			instances.push(instance);
		}
		return instances;
	}

	private getBoundTerminalsForOtherPages(pageInstanceId: string): ITerminalInstance[] {
		const instances: ITerminalInstance[] = [];
		for (const [terminalInstanceId, boundPageInstanceId] of [...turboFileTerminalPageByTerminalId]) {
			if (boundPageInstanceId === pageInstanceId) {
				continue;
			}
			const instance = this.terminalService.getInstanceFromId(terminalInstanceId);
			if (!instance || instance.isDisposed) {
				this.clearTerminalBindingForInstance(terminalInstanceId);
				continue;
			}
			instances.push(instance);
		}
		return instances;
	}

	private async revealBoundTerminalsForPage(pageInstanceId: string, activeInstance: ITerminalInstance | undefined, focus: boolean): Promise<void> {
		// Guard the ENTIRE reveal, including the background/foreground swaps below. Moving another
		// page's terminals to the background can momentarily hide the panel; that must never be
		// mistaken for the user manually hiding it, otherwise this page would be remembered as
		// "panel hidden" and its terminals would appear to vanish on the next page switch.
		this.beginTerminalPanelVisibilityChange();
		try {
			for (const candidate of this.getBoundTerminalsForOtherPages(pageInstanceId)) {
				this.terminalService.moveToBackground(candidate);
			}

			const pageTerminals = this.getBoundTerminalsForPage(pageInstanceId);
			if (pageTerminals.length === 0) {
				this.restoreTaskbarAfterTerminal();
				this.terminalGroupService.hidePanel();
				return;
			}

			for (const instance of pageTerminals) {
				await this.terminalService.showBackgroundTerminal(instance, true);
			}

			const lastActiveTerminalId = turboFileLastActiveTerminalByPageId.get(pageInstanceId);
			const lastActiveInstance = lastActiveTerminalId !== undefined
				? pageTerminals.find(instance => instance.instanceId === lastActiveTerminalId)
				: undefined;
			activeInstance = activeInstance ?? lastActiveInstance ?? pageTerminals[0];
			turboFileLastActiveTerminalByPageId.set(pageInstanceId, activeInstance.instanceId);
			if (!focus && turboFileTerminalPanelHiddenByPageId.has(pageInstanceId)) {
				this.restoreTaskbarAfterTerminal();
				this.terminalGroupService.hidePanel();
				return;
			}
			this.taskbarHiddenForTerminal = true;
			this.terminalService.setActiveInstance(activeInstance);
			if (focus) {
				await this.terminalService.focusInstance(activeInstance);
				return;
			}
			await this.terminalGroupService.showPanel(false);
		} finally {
			this.endTerminalPanelVisibilityChange();
		}
	}

	private async syncActiveTerminalForCurrentPage(): Promise<void> {
		if (!this.isEditorVisible) {
			return;
		}

		const pageInstanceId = this.currentInput?.instanceId;
		if (!pageInstanceId) {
			return;
		}
		await this.revealBoundTerminalsForPage(pageInstanceId, undefined, false);
	}

	private clearTerminalBindingForInstance(terminalInstanceId: number): void {
		const pageInstanceId = turboFileTerminalPageByTerminalId.get(terminalInstanceId);
		if (!pageInstanceId) {
			return;
		}

		turboFileTerminalPageByTerminalId.delete(terminalInstanceId);
		if (turboFileLastActiveTerminalByPageId.get(pageInstanceId) === terminalInstanceId) {
			const nextTerminal = this.getBoundTerminalsForPage(pageInstanceId)[0];
			if (nextTerminal) {
				turboFileLastActiveTerminalByPageId.set(pageInstanceId, nextTerminal.instanceId);
			} else {
				turboFileLastActiveTerminalByPageId.delete(pageInstanceId);
				turboFileTerminalPanelHiddenByPageId.delete(pageInstanceId);
			}
		}
	}

	private disposeBoundTerminalsForPage(pageInstanceId: string): void {
		const pageTerminals = this.getBoundTerminalsForPage(pageInstanceId);
		turboFileLastActiveTerminalByPageId.delete(pageInstanceId);
		turboFileTerminalPanelHiddenByPageId.delete(pageInstanceId);
		for (const instance of pageTerminals) {
			this.clearTerminalBindingForInstance(instance.instanceId);
			void this.terminalService.safeDisposeTerminal(instance);
		}
		if (this.currentInput?.instanceId === pageInstanceId) {
			this.restoreTaskbarAfterTerminal();
			this.terminalGroupService.hidePanel();
		}
	}

	/**
	 * Re-focus the terminal after the editor re-render that follows opening/revealing it. xterm only
	 * accepts keyboard input once its textarea is focused while attached and laid out; focusing before
	 * the render commits (or having the render move focus) is the usual cause of "the terminal opened
	 * but I can't type until I click it". A post-render animation frame guarantees focus lands last.
	 */
	private refocusTerminalAfterRender(instance: ITerminalInstance): void {
		const targetWindow = getWindow(this.container);
		targetWindow.requestAnimationFrame(() => {
			if (instance.isDisposed || !this.isEditorVisible || this.activePage !== 'transfer') {
				return;
			}
			this.terminalService.setActiveInstance(instance);
			void this.terminalService.focusInstance(instance);
		});
	}

	private async createAndRevealTerminal(options: ICreateTerminalOptions): Promise<ITerminalInstance> {
		const instance = await this.terminalService.createTerminal(options);
		this.terminalService.setActiveInstance(instance);
		await this.terminalService.focusInstance(instance);
		return instance;
	}

	private getTerminalTitle(side: 'left' | 'right', device: TurboFileDevice): string {
		return `极速传 ${this.getSideLabel(side)} ${this.getDeviceDisplayLabel(device)}`;
	}

	private async syncSelectedDirectories(): Promise<void> {
		const leftDevice = this.getPaneDevice('left');
		const rightDevice = this.getPaneDevice('right');
		if (!leftDevice || !rightDevice) {
			this.statusMessage = '请先在左右两侧选择可用设备。';
			this.render();
			return;
		}

		const task = this.beginTask('sync', '同步当前目录', `${leftDevice.name} <-> ${rightDevice.name}`);
		try {
			this.updateTask(task, '正在扫描同步差异...', 8);
			const plan = await this.buildSyncPlan(task);
			this.throwIfTaskCancelRequested(task);
			if (!plan.length) {
				this.finishTask(task, 'success', '两侧同步范围已经一致。');
				return;
			}
			this.updateTask(task, '等待确认同步范围...', 12);
			const confirmedPlan = await this.showSyncPlanPreview(plan);
			if (!confirmedPlan) {
				this.finishTask(task, 'success', '已取消同步。');
				return;
			}
			if (!confirmedPlan.length) {
				this.finishTask(task, 'success', '未选择同步项目。');
				return;
			}

			let completed = 0;
			let failed = 0;
			let totalBytes = 0;
			const strategies = new Set<string>();
			const failures: string[] = [];

			for (const [index, step] of confirmedPlan.entries()) {
				this.throwIfTaskCancelRequested(task);
				const sourceDevice = this.getPaneDevice(step.sourceSide);
				const targetDevice = this.getPaneDevice(step.targetSide);
				const progress = Math.min(88, 10 + Math.round((index / confirmedPlan.length) * 72));
				const displayPath = step.relativePath || step.item.name;
				this.updateTask(task, `同步 ${displayPath}：${sourceDevice?.name ?? step.sourceSide} -> ${targetDevice?.name ?? step.targetSide}`, progress);

				const result = await this.transferItem(step.sourceSide, step.targetSide, step.item, { refreshTarget: false, task, targetPath: step.targetPath });
				if (result.ok) {
					completed++;
					totalBytes += result.bytes;
					if (result.strategy) {
						strategies.add(result.strategy);
					}
				} else if (result.canceled) {
					this.finishTask(task, 'canceled', `已取消同步：${displayPath}`, { bytes: totalBytes });
					return;
				} else {
					failed++;
					failures.push(`${displayPath}: ${result.message}`);
				}
			}

			this.updateTask(task, '正在刷新两侧目录', 92);
			this.throwIfTaskCancelRequested(task);
			await Promise.all([this.refreshPane('left'), this.refreshPane('right')]);

			const strategy = [...strategies].join(', ') || undefined;
			if (failed > 0) {
				this.finishTask(task, 'error', `同步完成 ${completed} 项，失败 ${failed} 项。`, { bytes: totalBytes, strategy, error: failures[0] });
				return;
			}

			this.finishTask(task, 'success', `同步完成：${completed} 项。`, { bytes: totalBytes, strategy });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `同步失败：${message}`, { error: message });
		}
	}

	private showSyncPlanPreview(plan: TurboFileSyncPlanItem[]): Promise<TurboFileSyncPlanItem[] | undefined> {
		return new Promise(resolve => {
			this.syncPreviewState = {
				plan,
				selectedIndexes: new Set(plan.map((_, index) => index)),
				reversedIndexes: new Set(),
				resolve
			};
			this.render();
		});
	}

	private async buildSyncPlan(task?: TurboFileTask): Promise<TurboFileSyncPlanItem[]> {
		this.throwIfTaskCancelRequested(task);
		const recursivePlan = await this.tryBuildRecursiveSyncPlan(task);
		this.throwIfTaskCancelRequested(task);
		return recursivePlan ?? this.buildFlatSyncPlan();
	}

	private async tryBuildRecursiveSyncPlan(task?: TurboFileTask): Promise<TurboFileSyncPlanItem[] | undefined> {
		const roots = this.getRecursiveSyncRoots();
		const leftDevice = this.getPaneDevice('left');
		const rightDevice = this.getPaneDevice('right');
		if (!roots || !leftDevice || !rightDevice || !roots.left.path || !roots.right.path) {
			return undefined;
		}

		if (task) {
			this.updateTask(task, `正在递归扫描：${roots.left.name} / ${roots.right.name}`, 8);
		}
		const [leftEntries, rightEntries] = await Promise.all([
			this.collectSyncTree('left', roots.left.path, '', { count: 0 }, task),
			this.collectSyncTree('right', roots.right.path, '', { count: 0 }, task)
		]);
		const caseInsensitive = this.isWindowsDevice(leftDevice) || this.isWindowsDevice(rightDevice);
		return this.buildSyncPlanFromEntries(leftEntries, rightEntries, roots.left.path, roots.right.path, caseInsensitive, true);
	}

	private getRecursiveSyncRoots(): { left: TurboFileFileItem; right: TurboFileFileItem } | undefined {
		const leftSelected = this.getSelectedDirectory('left');
		const rightSelected = this.getSelectedDirectory('right');
		if (leftSelected && rightSelected) {
			return { left: leftSelected, right: rightSelected };
		}
		if (leftSelected) {
			const rightMatch = this.findPaneDirectoryByName('right', leftSelected.name);
			return rightMatch ? { left: leftSelected, right: rightMatch } : undefined;
		}
		if (rightSelected) {
			const leftMatch = this.findPaneDirectoryByName('left', rightSelected.name);
			return leftMatch ? { left: leftMatch, right: rightSelected } : undefined;
		}
		return undefined;
	}

	private getSelectedDirectory(side: 'left' | 'right'): TurboFileFileItem | undefined {
		const selected = this.getSelectedItem(side);
		return selected?.path && selected.directory && !selected.parent && selected.type !== 'unknown' ? selected : undefined;
	}

	private findPaneDirectoryByName(side: 'left' | 'right', name: string): TurboFileFileItem | undefined {
		const device = this.getPaneDevice(side);
		const caseInsensitive = !!device && this.isWindowsDevice(device);
		const key = caseInsensitive ? name.toLocaleLowerCase() : name;
		return this.paneStates[side].items.find(item => {
			if (!item.path || !item.directory || item.parent || item.type === 'unknown') {
				return false;
			}
			return (caseInsensitive ? item.name.toLocaleLowerCase() : item.name) === key;
		});
	}

	private async collectSyncTree(side: 'left' | 'right', rootPath: string, relativeRoot: string, counter: { count: number }, task?: TurboFileTask): Promise<TurboFileSyncTreeEntry[]> {
		this.throwIfTaskCancelRequested(task);
		counter.count++;
		if (counter.count > SYNC_RECURSIVE_SCAN_LIMIT) {
			throw new Error(`递归同步扫描超过 ${SYNC_RECURSIVE_SCAN_LIMIT} 项，请进入更小的目录后再同步。`);
		}
		if (task && counter.count % 25 === 0) {
			this.updateTask(task, `正在扫描${this.getSideLabel(side)}：${relativeRoot || '.'}`, 8);
		}

		const items = await this.listPaneDirectory(side, rootPath);
		this.throwIfTaskCancelRequested(task);
		const entries: TurboFileSyncTreeEntry[] = [];
		for (const item of items) {
			this.throwIfTaskCancelRequested(task);
			if (!item.path || item.parent || item.type === 'unknown') {
				continue;
			}

			const relativePath = relativeRoot ? `${relativeRoot}/${item.name}` : item.name;
			counter.count++;
			if (counter.count > SYNC_RECURSIVE_SCAN_LIMIT) {
				throw new Error(`递归同步扫描超过 ${SYNC_RECURSIVE_SCAN_LIMIT} 项，请进入更小的目录后再同步。`);
			}

			if (item.directory) {
				const childEntries = await this.collectSyncTree(side, item.path, relativePath, counter, task);
				if (childEntries.length) {
					entries.push(...childEntries);
				} else {
					entries.push({ relativePath, item });
				}
				continue;
			}

			entries.push({ relativePath, item });
		}

		return entries;
	}

	private throwIfTaskCancelRequested(task: TurboFileTask | undefined): void {
		if (task?.cancelRequested) {
			throw new Error('任务已取消。');
		}
	}

	private async listPaneDirectory(side: 'left' | 'right', path: string): Promise<TurboFileFileItem[]> {
		const device = this.getPaneDevice(side);
		if (!device) {
			return [];
		}

		const listing = await this.loadPaneDirectory(device, path, false);
		return listing.items.filter(item => !!item.path && !item.parent && item.type !== 'unknown');
	}

	private buildFlatSyncPlan(): TurboFileSyncPlanItem[] {
		const leftDevice = this.getPaneDevice('left');
		const rightDevice = this.getPaneDevice('right');
		const caseInsensitive = !!leftDevice && !!rightDevice && (this.isWindowsDevice(leftDevice) || this.isWindowsDevice(rightDevice));
		const leftEntries = this.getSyncItems('left').map(item => ({ relativePath: item.name, item }));
		const rightEntries = this.getSyncItems('right').map(item => ({ relativePath: item.name, item }));
		return this.buildSyncPlanFromEntries(leftEntries, rightEntries, this.paneStates.left.path, this.paneStates.right.path, caseInsensitive, false);
	}

	private buildSyncPlanFromEntries(
		leftEntries: TurboFileSyncTreeEntry[],
		rightEntries: TurboFileSyncTreeEntry[],
		leftRootPath: string,
		rightRootPath: string,
		caseInsensitive: boolean,
		recursive: boolean
	): TurboFileSyncPlanItem[] {
		const leftByPath = new Map(leftEntries.map(entry => [this.getSyncPathKey(entry.relativePath, caseInsensitive), entry]));
		const rightByPath = new Map(rightEntries.map(entry => [this.getSyncPathKey(entry.relativePath, caseInsensitive), entry]));
		const plan: TurboFileSyncPlanItem[] = [];

		for (const leftEntry of leftEntries) {
			const rightEntry = rightByPath.get(this.getSyncPathKey(leftEntry.relativePath, caseInsensitive));
			if (!rightEntry) {
				plan.push({
					sourceSide: 'left',
					targetSide: 'right',
					item: leftEntry.item,
					reason: 'missing',
					relativePath: leftEntry.relativePath,
					targetPath: recursive ? this.joinRelativePanePath('right', rightRootPath, leftEntry.relativePath) : undefined,
					recursive
				});
				continue;
			}
			const decision = this.getSyncDecision(leftEntry.item, rightEntry.item);
			if (decision === 'left') {
				const relativePath = leftEntry.relativePath;
				plan.push({
					sourceSide: 'left',
					targetSide: 'right',
					item: leftEntry.item,
					reason: leftEntry.item.rawSize !== rightEntry.item.rawSize ? 'size' : 'newer',
					relativePath,
					targetPath: recursive ? this.joinRelativePanePath('right', rightRootPath, relativePath) : undefined,
					recursive,
					reverse: {
						sourceSide: 'right',
						targetSide: 'left',
						item: rightEntry.item,
						targetPath: recursive ? this.joinRelativePanePath('left', leftRootPath, relativePath) : undefined
					}
				});
			}
		}

		for (const rightEntry of rightEntries) {
			const leftEntry = leftByPath.get(this.getSyncPathKey(rightEntry.relativePath, caseInsensitive));
			if (!leftEntry) {
				plan.push({
					sourceSide: 'right',
					targetSide: 'left',
					item: rightEntry.item,
					reason: 'missing',
					relativePath: rightEntry.relativePath,
					targetPath: recursive ? this.joinRelativePanePath('left', leftRootPath, rightEntry.relativePath) : undefined,
					recursive
				});
				continue;
			}
			const decision = this.getSyncDecision(leftEntry.item, rightEntry.item);
			if (decision === 'right') {
				const relativePath = rightEntry.relativePath;
				plan.push({
					sourceSide: 'right',
					targetSide: 'left',
					item: rightEntry.item,
					reason: rightEntry.item.rawSize !== leftEntry.item.rawSize ? 'size' : 'newer',
					relativePath,
					targetPath: recursive ? this.joinRelativePanePath('left', leftRootPath, relativePath) : undefined,
					recursive,
					reverse: {
						sourceSide: 'left',
						targetSide: 'right',
						item: leftEntry.item,
						targetPath: recursive ? this.joinRelativePanePath('right', rightRootPath, relativePath) : undefined
					}
				});
			}
		}

		return plan;
	}

	private getSyncItems(side: 'left' | 'right'): TurboFileFileItem[] {
		const selected = this.getSelectedItem(side);
		if (selected?.path && !selected.parent && selected.type !== 'unknown') {
			return [selected];
		}
		return this.paneStates[side].items.filter(item => !!item.path && !item.parent && !item.directory && item.type !== 'unknown');
	}

	private getSyncPathKey(relativePath: string, caseInsensitive: boolean): string {
		const normalized = relativePath.replace(/\\/g, '/');
		return caseInsensitive ? normalized.toLocaleLowerCase() : normalized;
	}

	private joinRelativePanePath(side: 'left' | 'right', rootPath: string, relativePath: string): string {
		const device = this.getPaneDevice(side);
		const windowsPath = !!device && this.isWindowsDevice(device);
		return relativePath
			.split('/')
			.filter(segment => !!segment)
			.reduce((currentPath, segment) => joinPanePath(currentPath, segment, windowsPath), rootPath);
	}

	private getSyncDirectionLabel(step: TurboFileSyncPlanItem): string {
		return step.sourceSide === 'left' ? '左 -> 右' : '右 -> 左';
	}

	private getSyncReasonLabel(reason: TurboFileSyncPlanItem['reason']): string {
		if (reason === 'missing') {
			return '新增';
		}
		if (reason === 'newer') {
			return '较新';
		}
		return '大小不同';
	}

	private getSyncDecision(leftItem: TurboFileFileItem, rightItem: TurboFileFileItem): 'left' | 'right' | undefined {
		if (leftItem.directory || rightItem.directory) {
			return;
		}

		const skewMs = 1000;
		if (leftItem.rawModified > rightItem.rawModified + skewMs) {
			return 'left';
		}
		if (rightItem.rawModified > leftItem.rawModified + skewMs) {
			return 'right';
		}
		if (leftItem.rawSize !== rightItem.rawSize) {
			return leftItem.rawModified >= rightItem.rawModified ? 'left' : 'right';
		}
		return undefined;
	}

	private getPreparedTransferPairDeviceKey(device: TurboFileDevice): string {
		const capabilities = device.capabilities;
		return [
			device.id,
			device.host,
			String(device.port),
			device.username,
			device.authType,
			device.privateKeyPath ?? '',
			device.preferredTransferProtocol,
			capabilities.ssh ? '1' : '0',
			capabilities.sftp ? '1' : '0',
			capabilities.scp ? '1' : '0',
			capabilities.rsync ? '1' : '0',
			capabilities.tar ? '1' : '0',
			capabilities.shell ? '1' : '0',
			capabilities.archive ? '1' : '0'
		].join('\0');
	}

	private invalidatePreparedTransferPair(): void {
		this.preparedTransferPairGeneration++;
		this.preparingTransferPairKey = undefined;
		this.preparedTransferPairKey = undefined;
		this.preparedTransferConnections.clear();
		this.preparedTransferPairRetryCount = 0;
		this.preparedTransferPairScheduler.cancel();
	}

	private prewarmCurrentTransferPair(forceRefresh = false): void {
		const sourceDevice = this.getPaneDevice('left');
		const targetDevice = this.getPaneDevice('right');
		if (!sourceDevice || !targetDevice || (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID)) {
			this.invalidatePreparedTransferPair();
			return;
		}
		const pairKey = `${this.getPreparedTransferPairDeviceKey(sourceDevice)}\0${this.getPreparedTransferPairDeviceKey(targetDevice)}`;
		const canceledDifferentPreparation = this.preparingTransferPairKey !== undefined && this.preparingTransferPairKey !== pairKey;
		if (canceledDifferentPreparation) {
			this.preparedTransferPairGeneration++;
			this.preparingTransferPairKey = undefined;
		}
		if (this.preparingTransferPairKey === pairKey || (!forceRefresh && this.preparedTransferPairKey === pairKey)) {
			if (canceledDifferentPreparation && this.isEditorVisible) {
				this.preparedTransferPairScheduler.schedule(PREPARED_TRANSFER_PAIR_REFRESH_MS);
			}
			return;
		}
		this.preparedTransferPairScheduler.cancel();
		if (this.preparingTransferPairKey !== pairKey && this.preparedTransferPairKey !== pairKey) {
			this.preparedTransferPairRetryCount = 0;
		}
		this.preparingTransferPairKey = pairKey;
		const generation = this.preparedTransferPairGeneration;
		void Promise.all([
			this.toTransferEndpoint(sourceDevice, this.paneStates.left.path),
			this.toTransferEndpoint(targetDevice, this.paneStates.right.path)
		]).then(([source, target]) => {
			if (this.preparedTransferPairGeneration !== generation || this.preparingTransferPairKey !== pairKey) {
				return;
			}
			return this.sshService.prepareTransferPair(source, target);
		}).then(() => {
			if (this.preparedTransferPairGeneration === generation && this.preparingTransferPairKey === pairKey) {
				this.preparingTransferPairKey = undefined;
				this.preparedTransferPairKey = pairKey;
				this.preparedTransferPairRetryCount = 0;
				if (this.isEditorVisible) {
					this.preparedTransferPairScheduler.schedule(PREPARED_TRANSFER_PAIR_REFRESH_MS);
				}
			}
		}, () => {
			if (this.preparedTransferPairGeneration === generation && this.preparingTransferPairKey === pairKey) {
				this.preparingTransferPairKey = undefined;
				this.preparedTransferPairKey = undefined;
				const retryIndex = Math.min(this.preparedTransferPairRetryCount, PREPARED_TRANSFER_PAIR_RETRY_DELAYS_MS.length - 1);
				this.preparedTransferPairRetryCount++;
				if (this.isEditorVisible) {
					this.preparedTransferPairScheduler.schedule(PREPARED_TRANSFER_PAIR_RETRY_DELAYS_MS[retryIndex]);
				}
			}
		});
	}

	private async toTransferEndpoint(device: TurboFileDevice, path: string, connection?: ITurboFileSshConnectionOptions): Promise<ITurboFileTransferEndpoint> {
		if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
			return {
				kind: 'local',
				path,
				label: device.name
			};
		}

		return {
			kind: 'ssh',
			path,
			connection: connection ?? await this.getSshConnectionOptions(device),
			label: device.name,
			supportsRsync: device.capabilities.rsync,
			supportsTar: device.capabilities.tar ?? device.capabilities.archive,
			preferredProtocol: device.preferredTransferProtocol
		};
	}

	private async getSshConnectionOptions(device: TurboFileDevice): Promise<ITurboFileSshConnectionOptions> {
		const cacheKey = this.getPreparedTransferPairDeviceKey(device);
		const cached = this.preparedTransferConnections.get(cacheKey);
		if (cached) {
			return cached;
		}
		const connection = Promise.all([
			this.deviceStore?.getPassword(device.id),
			this.deviceStore?.getPrivateKey(device.id),
			this.deviceStore?.getPassphrase(device.id)
		]).then(([password, privateKey, passphrase]) => ({
			host: device.host,
			port: device.port,
			username: device.username,
			password,
			privateKey,
			privateKeyPath: device.privateKeyPath,
			passphrase
		}));
		this.preparedTransferConnections.set(cacheKey, connection);
		try {
			return await connection;
		} catch (error) {
			if (this.preparedTransferConnections.get(cacheKey) === connection) {
				this.preparedTransferConnections.delete(cacheKey);
			}
			throw error;
		}
	}

	private async getSshConnectionOptionsFromDraft(draft: TurboFileDeviceDraft, editingDevice?: TurboFileDevice): Promise<ITurboFileSshConnectionOptions> {
		return {
			host: draft.host,
			port: draft.port || 22,
			username: draft.username,
			password: draft.password ?? (editingDevice ? await this.deviceStore?.getPassword(editingDevice.id) : undefined),
			privateKey: draft.privateKey ?? (editingDevice ? await this.deviceStore?.getPrivateKey(editingDevice.id) : undefined),
			privateKeyPath: draft.privateKeyPath,
			passphrase: draft.passphrase ?? (editingDevice ? await this.deviceStore?.getPassphrase(editingDevice.id) : undefined)
		};
	}

	private clearPaneSelection(side: 'left' | 'right'): void {
		const state = this.paneStates[side];
		state.selectedPath = undefined;
		state.selectedPaths.clear();
		state.selectionAnchorPath = undefined;
	}

	private setSingleSelection(side: 'left' | 'right', item: TurboFileFileItem): void {
		const state = this.paneStates[side];
		state.selectedPath = item.path;
		state.selectedPaths.clear();
		if (item.path && !item.parent) {
			state.selectedPaths.add(item.path);
		}
		state.selectionAnchorPath = item.path;
	}

	private isItemSelected(side: 'left' | 'right', item: TurboFileFileItem): boolean {
		if (!item.path) {
			return false;
		}
		const state = this.paneStates[side];
		return state.selectedPaths.has(item.path) || state.selectedPath === item.path;
	}

	private ensureItemInSelection(side: 'left' | 'right', item: TurboFileFileItem): void {
		if (!item.path || item.parent) {
			return;
		}
		if (!this.paneStates[side].selectedPaths.has(item.path)) {
			this.selectItem(side, item, undefined, false);
			this.render();
		}
	}

	private getSelectedTransferItems(side: 'left' | 'right'): TurboFileFileItem[] {
		const state = this.paneStates[side];
		const selectedItems = state.items.filter(item => !!item.path && !item.parent && state.selectedPaths.has(item.path));
		if (selectedItems.length) {
			return selectedItems;
		}
		const selected = this.getSelectedItem(side);
		return selected?.path && !selected.parent ? [selected] : [];
	}

	private getLastSelectedPath(side: 'left' | 'right'): string | undefined {
		const state = this.paneStates[side];
		for (let index = state.items.length - 1; index >= 0; index--) {
			const item = state.items[index];
			if (item.path && state.selectedPaths.has(item.path)) {
				return item.path;
			}
		}
		return undefined;
	}

	private getSelectedItem(side: 'left' | 'right'): TurboFileFileItem | undefined {
		const state = this.paneStates[side];
		if (state.selectedPath) {
			const focused = state.items.find(item => item.path === state.selectedPath);
			if (focused) {
				return focused;
			}
		}
		return state.items.find(item => !!item.path && state.selectedPaths.has(item.path));
	}

	private toFileItems(device: TurboFileDevice, currentPath: string, entries: ITurboFileFileEntry[]): TurboFileFileItem[] {
		const parentPath = getPaneParentPath(currentPath, this.isWindowsDevice(device));
		const parent: TurboFileFileItem[] = parentPath ? [{
			name: '..',
			path: parentPath,
			size: '',
			rawSize: 0,
			modified: '双击返回上级',
			rawModified: 0,
			type: 'directory',
			directory: true,
			parent: true
		}] : [];
		return [...parent, ...entries.filter(entry => this.shouldShowHiddenFiles() || !isHiddenFileName(entry.name)).map(entry => this.toFileItem(entry))];
	}

	private toFileItem(entry: ITurboFileFileEntry): TurboFileFileItem {
		return {
			name: entry.name,
			path: entry.path,
			size: entry.type === 'directory' ? '' : formatSize(entry.size),
			rawSize: entry.size,
			modified: formatDate(entry.modified),
			rawModified: entry.modified,
			type: entry.type,
			directory: entry.type === 'directory'
		};
	}

	private getAllDevices(): TurboFileDevice[] {
		const devices = [this.localWindowsDevice, ...this.devices];
		return this.deviceStore?.sortDevices(devices) ?? devices;
	}

	private createLocalWindowsDevice(): TurboFileDevice {
		const defaultPath = this.getConfiguredLocalWindowsDefaultPath();
		return {
			id: LOCAL_WINDOWS_DEVICE_ID,
			name: 'Windows',
			host: 'localhost',
			port: 0,
			username: 'local',
			authType: 'password',
			defaultPath,
			platform: 'windows',
			capabilities: {
				ssh: false,
				sftp: false,
				scp: true,
				rsync: true,
				tar: true,
				shell: true,
				archive: true
			},
			preferredTransferProtocol: this.getConfiguredLocalWindowsTransferProtocol()
		};
	}

	private getConfiguredLocalWindowsDefaultPath(): string {
		const savedPath = this.storageService.get(TURBOFILE_LOCAL_WINDOWS_DEFAULT_PATH_STORAGE_KEY, StorageScope.PROFILE);
		return savedPath || this.getLocalWindowsDefaultPath();
	}

	private getLocalWindowsDeviceDefaultPath(): string {
		return this.localWindowsDevice.defaultPath || this.getConfiguredLocalWindowsDefaultPath();
	}

	private getConfiguredLocalWindowsTransferProtocol(): TurboFileTransferProtocol {
		const protocol = this.storageService.get(TURBOFILE_LOCAL_WINDOWS_TRANSFER_PROTOCOL_STORAGE_KEY, StorageScope.PROFILE);
		return protocol === 'auto-fast' || protocol === 'rsync' || protocol === 'sftp' || protocol === 'scp' ? protocol : defaultTurboFileTransferProtocol;
	}

	private saveLocalWindowsDevice(draft: TurboFileDeviceDraft): TurboFileDevice {
		const defaultPath = draft.defaultPath?.trim() || this.getLocalWindowsDefaultPath();
		const preferredTransferProtocol = this.normalizeTransferProtocol(draft.preferredTransferProtocol ?? defaultTurboFileTransferProtocol);
		this.storageService.store(TURBOFILE_LOCAL_WINDOWS_DEFAULT_PATH_STORAGE_KEY, defaultPath, StorageScope.PROFILE, StorageTarget.MACHINE);
		this.storageService.store(TURBOFILE_LOCAL_WINDOWS_TRANSFER_PROTOCOL_STORAGE_KEY, preferredTransferProtocol, StorageScope.PROFILE, StorageTarget.MACHINE);
		this.localWindowsDevice = {
			...this.localWindowsDevice,
			name: draft.name.trim() || 'Windows',
			defaultPath,
			preferredTransferProtocol
		};
		return this.localWindowsDevice;
	}

	private syncLocalWindowsDefaultPath(previousDefaultPath: string, nextDefaultPath: string): boolean {
		if (!nextDefaultPath) {
			return false;
		}

		let refreshed = false;
		for (const key of Array.from(this.paneDirectoryCache.keys())) {
			if (key.startsWith(`${LOCAL_WINDOWS_DEVICE_ID}|`)) {
				this.paneDirectoryCache.delete(key);
			}
		}

		const systemUserPath = this.getLocalWindowsDefaultPath();
		for (const side of ['left', 'right'] as const) {
			const state = this.paneStates[side];
			if (state.deviceId !== LOCAL_WINDOWS_DEVICE_ID) {
				continue;
			}
			const shouldUseNewDefault = !state.path
				|| isSameWindowsPath(state.path, previousDefaultPath)
				|| isSameWindowsPath(state.path, systemUserPath);
			if (!shouldUseNewDefault) {
				continue;
			}

			state.path = nextDefaultPath;
			state.items = [];
			state.error = undefined;
			this.resetPaneScroll(side);
			this.clearPaneSelection(side);
			this.rememberPaneDevicePath(side, this.localWindowsDevice, nextDefaultPath);
			void this.refreshPane(side, { path: nextDefaultPath, force: true, silent: true });
			refreshed = true;
		}
		return refreshed;
	}

	private getLocalWindowsDefaultPath(): string {
		return this.pathService.userHome({ preferLocal: true }).fsPath || LOCAL_WINDOWS_FALLBACK_PATH;
	}

	/**
	 * The real Desktop directory used by the "桌面" shortcut. Defaults to the profile Desktop and is
	 * upgraded to the OS known-folder location once {@link refreshWindowsDesktopPath} resolves it, so
	 * a Desktop relocated to another drive (e.g. D:\Desktop) is navigated to — and dropped into —
	 * correctly.
	 */
	private getWindowsDesktopPath(): string {
		return this.resolvedWindowsDesktopPath || this.getWindowsDesktopFallbackPath();
	}

	private getWindowsDesktopFallbackPath(): string {
		return joinPanePath(this.getLocalWindowsDefaultPath(), 'Desktop', true);
	}

	private async refreshWindowsDesktopPath(): Promise<void> {
		try {
			const previousDesktopPath = this.getWindowsDesktopPath();
			const profileDesktopPath = this.getWindowsDesktopFallbackPath();
			const desktop = (await this.sshService.getLocalDesktopPath())?.trim();
			if (desktop && !isSameWindowsPath(desktop, this.resolvedWindowsDesktopPath ?? '')) {
				this.resolvedWindowsDesktopPath = desktop;
				this.retargetWindowsDesktopPanes(previousDesktopPath, profileDesktopPath, desktop);
				if (this.activePage === 'transfer') {
					this.render();
				}
			}
		} catch {
			// Keep the profile-based Desktop fallback if the real path cannot be resolved.
		}
	}

	private retargetWindowsDesktopPanes(previousDesktopPath: string, profileDesktopPath: string, nextDesktopPath: string): void {
		for (const side of ['left', 'right'] as const) {
			const state = this.paneStates[side];
			if (state.deviceId !== LOCAL_WINDOWS_DEVICE_ID || !shouldRetargetWindowsDesktopPane(state.path, previousDesktopPath, profileDesktopPath)) {
				continue;
			}

			state.path = nextDesktopPath;
			state.items = [];
			state.error = undefined;
			this.resetPaneScroll(side);
			this.clearPaneSelection(side);
			this.rememberPaneDevicePath(side, this.localWindowsDevice, nextDesktopPath);
			void this.refreshPane(side, { path: nextDesktopPath, force: true, silent: true });
		}
	}

	private async refreshWindowsDriveRoots(): Promise<void> {
		const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
		const probes = await Promise.all(letters.map(async letter => {
			const root = `${letter}:\\`;
			try {
				await this.sshService.listLocalDirectory(root);
				return root;
			} catch {
				return undefined;
			}
		}));
		this.availableWindowsDriveRoots = probes.filter((root): root is string => !!root);
		if (!this.availableWindowsDriveRoots.length) {
			this.availableWindowsDriveRoots = [LOCAL_WINDOWS_FALLBACK_PATH];
		}
		if (this.activePage === 'transfer') {
			this.render();
		}
	}

	private getWindowsLocationLabel(path: string): string {
		const desktopPath = this.getWindowsDesktopPath();
		if (isSameWindowsPath(path, desktopPath)) {
			return '桌面';
		}

		const driveRoot = getWindowsDriveRoot(path);
		if (driveRoot) {
			return this.getWindowsDriveLabel(driveRoot);
		}

		return 'Windows';
	}

	private getWindowsDriveLabel(driveRoot: string): string {
		const drive = driveRoot.substring(0, 1).toUpperCase();
		return `${drive}盘`;
	}

	private getWindowsLocationIconClass(path: string): string {
		const desktopPath = this.getWindowsDesktopPath();
		if (isSameWindowsPath(path, desktopPath)) {
			return 'turbofile-location-icon-windows';
		}

		const driveRoot = getWindowsDriveRoot(path);
		if (driveRoot) {
			return 'turbofile-location-icon-windows';
		}

		return 'turbofile-location-icon-drive';
	}

	private getWindowsLocationMenuIconClass(path: string): string {
		return `turbofile-windows-location-action turbofile-location-menu-icon ${this.getWindowsLocationIconClass(path)}`;
	}

	private showWindowsLocationMenu(side: 'left' | 'right', event: MouseEvent | KeyboardEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.setActiveFilePaneSide(side);
		const anchor = event instanceof MouseEvent ? new StandardMouseEvent(getWindow(event), event) : event.currentTarget as HTMLElement;
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getWindowsLocationActions(side),
			getActionViewItem: (action, options) => action.id.startsWith(`turbofile.windowsLocation.${side}.`)
				? new ActionViewItem(null, action, { ...options, icon: true, label: true })
				: undefined,
			skipTelemetry: true
		});
	}

	private getWindowsLocationActions(side: 'left' | 'right'): IAction[] {
		const state = this.paneStates[side];
		const desktopPath = this.getWindowsDesktopPath();
		const actions: IAction[] = [
			this.menuAction(`turbofile.windowsLocation.${side}.desktop`, '桌面', this.getWindowsLocationMenuIconClass(desktopPath), () => void this.openWindowsDesktopPath(side), true, isSameWindowsPath(state.path, desktopPath)),
			new Separator()
		];

		for (const root of this.getWindowsDriveRoots()) {
			const drive = root.substring(0, 1).toUpperCase();
			actions.push(this.menuAction(
				`turbofile.windowsLocation.${side}.drive.${drive}`,
				this.getWindowsDriveLabel(root),
				this.getWindowsLocationMenuIconClass(root),
				() => this.openWindowsLocalPath(side, root, this.getWindowsDriveLabel(root)),
				true,
				isPathOnWindowsDrive(state.path, root)
			));
		}

		return actions;
	}

	private getWindowsDriveRoots(): string[] {
		const roots = new Set<string>();
		for (const root of this.availableWindowsDriveRoots) {
			roots.add(root);
		}
		for (const path of [this.getLocalWindowsDefaultPath(), LOCAL_WINDOWS_FALLBACK_PATH, this.paneStates.left.path, this.paneStates.right.path]) {
			const root = getWindowsDriveRoot(path);
			if (root) {
				roots.add(root);
			}
		}
		return Array.from(roots).sort((left, right) => left.localeCompare(right));
	}

	private async openWindowsDesktopPath(side: 'left' | 'right'): Promise<void> {
		if (!this.resolvedWindowsDesktopPath) {
			await this.refreshWindowsDesktopPath();
		}
		this.openWindowsLocalPath(side, this.getWindowsDesktopPath(), '桌面');
	}

	private openWindowsLocalPath(side: 'left' | 'right', path: string, label: string): void {
		const device = this.getPaneDevice(side);
		if (device?.id !== LOCAL_WINDOWS_DEVICE_ID) {
			return;
		}

		const state = this.paneStates[side];
		state.path = path;
		state.items = [];
		state.error = undefined;
		this.resetPaneScroll(side);
		this.clearPaneSelection(side);
		this.statusMessage = `已在${this.getSideLabel(side)}打开 Windows 位置：${label}`;
		this.render();
		void this.refreshPane(side);
	}

	private getPaneDevice(side: 'left' | 'right'): TurboFileDevice | undefined {
		const state = this.paneStates[side];
		return this.getDeviceById(state.deviceId);
	}

	private getDeviceById(deviceId: string): TurboFileDevice | undefined {
		// Lookups on the thumbnail/progress paths do not need the display order or its storage read.
		return deviceId === LOCAL_WINDOWS_DEVICE_ID ? this.localWindowsDevice : this.devices.find(device => device.id === deviceId);
	}

	private renderFileBrowserIcon(item: TurboFileFileItem): Element {
		if (item.parent) {
			const icon = $('span.turbofile-file-icon-slot.turbofile-file-parent-icon');
			icon.setAttribute('aria-hidden', 'true');
			icon.appendChild(renderTurboFileIcon('arrow-up-circle', 'primary'));
			return icon;
		}
		if (item.directory) {
			const icon = $('span.turbofile-file-icon-slot.turbofile-file-folder-icon');
			icon.setAttribute('aria-hidden', 'true');
			icon.appendChild(renderTurboFileIcon('folder-fill', 'warning'));
			return icon;
		}
		const slot = $('span.turbofile-file-icon-slot.turbofile-file-theme-icon-slot');
		slot.setAttribute('aria-hidden', 'true');
		const icon = $('span.turbofile-file-theme-icon.monaco-icon-label') as HTMLSpanElement;
		const resource = item.path ? URI.file(item.path) : undefined;
		icon.classList.add(...getIconClasses(this.modelService, this.languageService, resource, FileKind.FILE));
		slot.appendChild(icon);
		return slot;
	}

	private getDeviceDisplayLabel(device: TurboFileDevice): string {
		if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
			return 'Windows';
		}
		const host = device.host;
		return `${device.name} (${host})`;
	}

	private renderDeviceSelectIcon(_device: TurboFileDevice | undefined): HTMLElement {
		const icon = $('span.turbofile-device-select-icon');
		icon.setAttribute('aria-hidden', 'true');
		icon.appendChild(renderTurboFileDeviceMonitorIcon());
		return icon;
	}

	private renderDevicePageIcon(device: TurboFileDevice): HTMLElement {
		if (!this.isWindowsDevice(device)) {
			return renderIcon(Codicon.server);
		}
		const icon = $('span.turbofile-device-page-icon');
		icon.setAttribute('aria-hidden', 'true');
		icon.appendChild(renderTurboFileDeviceMonitorIcon());
		return icon;
	}

	private formatPanePathForDisplay(path: string, windowsPath: boolean): string {
		if (!windowsPath) {
			return this.normalizePanePath(path || '/', false);
		}
		return this.normalizePanePath(path || LOCAL_WINDOWS_FALLBACK_PATH, true);
	}

	private normalizePaneInputPath(path: string, windowsPath: boolean): string {
		const trimmed = path.trim();
		if (!trimmed) {
			return '';
		}
		return this.normalizePanePath(trimmed, windowsPath);
	}

	private normalizePanePath(path: string, windowsPath: boolean): string {
		if (windowsPath) {
			return path.replace(/\//g, '\\');
		}

		let normalized = path.replace(/\\/g, '/').trim();
		if (!normalized || normalized === '.' || normalized === './' || normalized === '/.' || normalized === '/./') {
			return '/';
		}
		if (normalized.startsWith('./')) {
			normalized = normalized.substring(1);
		}
		if (!normalized.startsWith('/')) {
			normalized = `/${normalized}`;
		}
		normalized = normalized.replace(/\/+/g, '/').replace(/\/\.(?=\/|$)/g, '');
		if (normalized.length > 1) {
			normalized = normalized.replace(/\/+$/, '');
		}
		return normalized || '/';
	}

	private getDefaultPaneDevicePath(device: TurboFileDevice): string {
		return device.id === LOCAL_WINDOWS_DEVICE_ID
			? this.getLocalWindowsDeviceDefaultPath()
			: this.normalizePanePath(device.defaultPath || '/', false);
	}

	private getPaneDeviceMemoryKey(side: 'left' | 'right', device: TurboFileDevice): string {
		return `${side}|${device.id}`;
	}

	private getPaneDevicePathStorageKey(side: 'left' | 'right', device: TurboFileDevice): string {
		return `turbofile.panePath.${side}.${encodeURIComponent(device.id)}`;
	}

	private rememberPaneDevicePath(side: 'left' | 'right', device: TurboFileDevice, path: string): void {
		if (!path) {
			return;
		}
		const normalizedPath = this.normalizePanePath(path, this.isWindowsDevice(device));
		this.storageService.store(this.getPaneDevicePathStorageKey(side, device), normalizedPath, StorageScope.PROFILE, StorageTarget.USER);
	}

	private getRememberedPaneDevicePath(side: 'left' | 'right', device: TurboFileDevice): string | undefined {
		const path = this.storageService.get(this.getPaneDevicePathStorageKey(side, device), StorageScope.PROFILE);
		return path ? this.normalizePanePath(path, this.isWindowsDevice(device)) : undefined;
	}

	private getInitialPaneDevicePath(side: 'left' | 'right', device: TurboFileDevice): string {
		const rememberedPath = this.getRememberedPaneDevicePath(side, device);
		if (device.id !== LOCAL_WINDOWS_DEVICE_ID) {
			return rememberedPath ?? this.getDefaultPaneDevicePath(device);
		}

		const defaultPath = this.getLocalWindowsDeviceDefaultPath();
		const systemUserPath = this.getLocalWindowsDefaultPath();
		if (rememberedPath && !isSameWindowsPath(rememberedPath, systemUserPath)) {
			return rememberedPath;
		}
		return defaultPath;
	}

	private rememberPaneDeviceSnapshot(side: 'left' | 'right'): void {
		// Keep this page's own device/path/sort selection fresh so a later group merge or tab switch
		// restores it instead of inheriting the receiving pane's previous page.
		this.capturePaneSelectionForCurrentPage();
		const device = this.getPaneDevice(side);
		const state = this.paneStates[side];
		if (!device || !state.path) {
			return;
		}
		this.rememberPaneDevicePath(side, device, state.path);
		if (!state.items.length && state.error) {
			return;
		}
		this.paneDeviceSnapshots.set(this.getPaneDeviceMemoryKey(side, device), {
			path: state.path,
			items: state.items,
			scrollTop: state.scrollTop,
			expiresAt: Date.now() + PANE_DEVICE_SNAPSHOT_TTL_MS
		});
	}

	private getPaneDeviceSnapshot(side: 'left' | 'right', device: TurboFileDevice): TurboFilePaneDeviceSnapshot | undefined {
		const key = this.getPaneDeviceMemoryKey(side, device);
		const snapshot = this.paneDeviceSnapshots.get(key);
		if (!snapshot) {
			return undefined;
		}
		if (snapshot.expiresAt <= Date.now()) {
			this.paneDeviceSnapshots.delete(key);
			return undefined;
		}
		return snapshot;
	}

	private setPaneDevice(side: 'left' | 'right', device: TurboFileDevice): void {
		const state = this.paneStates[side];
		if (state.trashMode.active) {
			state.trashMode = leaveTurboFileTrashView();
			state.trashItems = [];
			state.items = [];
		}
		if (side === 'right') {
			this.hasAppliedInitialRightPaneDefault = true;
		}
		if (state.deviceId === device.id) {
			state.error = undefined;
			this.clearPaneSelection(side);
			this.render();
			this.prewarmCurrentTransferPair();
			void this.refreshPane(side, { path: state.path || this.getDefaultPaneDevicePath(device), force: true, silent: true }).finally(() => this.prewarmCurrentTransferPair());
			return;
		}
		this.rememberPaneDeviceSnapshot(side);
		++this.paneRequestSeq[side];
		state.deviceId = device.id;
		state.trashStateKnown = false;
		state.trashHasItems = false;
		const targetPath = this.getInitialPaneDevicePath(side, device);
		const snapshot = this.getPaneDeviceSnapshot(side, device);
		const cached = this.getCachedPaneDirectory(device, targetPath);
		const readySnapshot = snapshot?.path === targetPath && this.paneListingSatisfiesSort(side, snapshot.items) ? snapshot : undefined;
		const readyCached = cached && this.paneDirectoryEntrySatisfiesSort(side, cached) ? cached : undefined;
		state.path = targetPath;
		state.items = this.sortPaneItems(side, readySnapshot?.items ?? readyCached?.items ?? []);
		state.error = undefined;
		this.resetPaneScroll(side);
		if (readySnapshot) {
			state.scrollTop = readySnapshot.scrollTop;
		}
		this.clearPaneSelection(side);
		this.statusMessage = `已在${this.getSideLabel(side)}打开设备：${device.name}`;
		this.render();
		this.prewarmCurrentTransferPair();
		if (readyCached) {
			this.applyPaneDirectoryEntry(side, device, readyCached);
			this.render();
			this.prewarmCurrentTransferPair();
			return;
		}
		void this.refreshPane(side, { path: targetPath, silent: true }).finally(() => this.prewarmCurrentTransferPair());
	}

	/**
	 * Mirror the current page's left/right device + path + sort selection into the module-level map so
	 * it can be restored if this page is later shown by a different editor pane instance (group merge,
	 * tab switch). Cheap and idempotent; called from the same spots that snapshot pane contents.
	 */
	private capturePaneSelectionForCurrentPage(): void {
		const pageInstanceId = this.currentInput?.instanceId;
		if (!pageInstanceId) {
			return;
		}
		const capture = (side: 'left' | 'right'): TurboFilePaneSelectionSide => {
			const state = this.paneStates[side];
			return { deviceId: state.deviceId, path: state.path, sortKey: state.sortKey, sortDirection: state.sortDirection };
		};
		turboFilePaneSelectionByPageId.set(pageInstanceId, { left: capture('left'), right: capture('right') });
	}

	/**
	 * Restore a page's own pane selection when this editor pane starts showing it. Returns true when a
	 * saved selection was applied; false when the page has none yet (a brand-new page).
	 */
	private restorePaneSelectionForPage(pageInstanceId: string): boolean {
		const snapshot = turboFilePaneSelectionByPageId.get(pageInstanceId);
		if (!snapshot) {
			return false;
		}
		const devices = this.getAllDevices();
		for (const side of ['left', 'right'] as const) {
			const saved = snapshot[side];
			const state = this.paneStates[side];
			state.sortKey = saved.sortKey;
			state.sortDirection = saved.sortDirection;
			if (devices.some(device => device.id === saved.deviceId)) {
				state.deviceId = saved.deviceId;
				state.path = saved.path;
			}
		}
		this.hasAppliedInitialRightPaneDefault = true;
		return true;
	}

	/**
	 * Give a page that has no saved selection a fresh default (local on the left, first SSH device on
	 * the right) rather than letting it inherit the selection of whatever page this reused pane showed
	 * before.
	 */
	private resetPaneSelectionToDefault(): void {
		for (const side of ['left', 'right'] as const) {
			this.paneStates[side].deviceId = LOCAL_WINDOWS_DEVICE_ID;
			this.paneStates[side].path = '';
		}
		this.hasAppliedInitialRightPaneDefault = false;
		this.ensurePaneDeviceSelection({ preferFirstSshOnRight: true });
		for (const side of ['left', 'right'] as const) {
			const device = this.getPaneDevice(side);
			if (device && !this.paneStates[side].path) {
				this.paneStates[side].path = this.getDefaultPaneDevicePath(device);
			}
		}
	}

	private ensurePaneDeviceSelection(options: { preferFirstSshOnRight?: boolean } = {}): void {
		const devices = this.getAllDevices();
		for (const side of ['left', 'right'] as const) {
			const state = this.paneStates[side];
			if (!devices.some(device => device.id === state.deviceId)) {
				state.deviceId = devices[0].id;
				state.path = this.getDefaultPaneDevicePath(devices[0]);
			}
		}

		if (options.preferFirstSshOnRight && !this.hasAppliedInitialRightPaneDefault && this.devices[0] && this.paneStates.right.deviceId === LOCAL_WINDOWS_DEVICE_ID) {
			this.paneStates.right.deviceId = this.devices[0].id;
			this.paneStates.right.path = this.devices[0].defaultPath || '/';
			this.hasAppliedInitialRightPaneDefault = true;
		}
	}

	private isWindowsDevice(device: TurboFileDevice): boolean {
		return device.id === LOCAL_WINDOWS_DEVICE_ID || device.platform === 'windows';
	}

	private normalizeTransferProtocol(value: string): TurboFileTransferProtocol {
		return value === 'auto-fast' || value === 'rsync' || value === 'scp' || value === 'sftp' ? value : defaultTurboFileTransferProtocol;
	}

	private renderDeviceForm(): HTMLElement {
		const overlay = $('.turbofile-device-overlay');
		const form = document.createElement('form');
		form.className = 'turbofile-device-form';
		this.bindDeviceFormEventIsolation(form);
		const editingDevice = this.editingDeviceId ? this.getAllDevices().find(device => device.id === this.editingDeviceId) : undefined;
		const isEditing = !!editingDevice;
		const isEditingLocalWindows = editingDevice?.id === LOCAL_WINDOWS_DEVICE_ID;

		const title = $('.turbofile-device-form-title');
		title.textContent = isEditingLocalWindows ? '编辑本机 Windows' : isEditing ? '编辑 SSH 设备' : '添加 SSH 设备';
		form.appendChild(title);

		if (isEditingLocalWindows) {
			this.appendInputField(form, 'name', '设备名称', 'Windows', 'text', false, editingDevice.name);
			this.appendHiddenInput(form, 'host', editingDevice.host);
			this.appendHiddenInput(form, 'port', String(editingDevice.port || 0));
			this.appendHiddenInput(form, 'username', editingDevice.username || 'local');
			this.appendHiddenInput(form, 'platform', 'windows');
			this.appendHiddenInput(form, 'authType', 'password');
			this.appendProtocolField(form, editingDevice);
			this.appendInputField(form, 'defaultPath', '默认目录', this.getLocalWindowsDefaultPath(), 'text', true, editingDevice.defaultPath || this.getLocalWindowsDefaultPath());
		} else {
			this.appendInputField(form, 'name', '设备名称', 'Linux Server', 'text', false, editingDevice?.name);
			this.appendInputField(form, 'host', 'IP / 主机名', '192.168.10.15', 'text', false, editingDevice?.host);
			this.appendInputField(form, 'port', '端口', '22', 'number', false, String(editingDevice?.port || 22));
			this.appendInputField(form, 'username', '用户名', 'root', 'text', false, editingDevice?.username);
			this.appendSelectField(form, 'platform', '系统类型', [
				['linux', 'Linux'],
				['wsl', 'WSL'],
				['unknown', 'Unknown']
			], editingDevice?.platform ?? 'linux');
			this.appendHiddenInput(form, 'authType', 'password');
			this.appendProtocolField(form, editingDevice);
			this.appendInputField(form, 'password', '密码', isEditing ? '留空保持原密码' : '', 'password', true);
			this.appendInputField(form, 'defaultPath', '默认目录', '/home', 'text', true, editingDevice?.defaultPath);
		}

		const message = $('.turbofile-device-form-message');
		message.textContent = this.deviceFormMessage;
		form.appendChild(message);

		const actions = $('.turbofile-device-form-actions');
		const cancel = this.createButton('取消', 'turbofile-secondary-button');
		const save = this.createButton('保存设备', 'turbofile-primary-button');
		cancel.element.type = 'button';
		save.element.type = 'submit';
		actions.appendChild(cancel.element);
		actions.appendChild(save.element);
		form.appendChild(actions);

		cancel.element.addEventListener('click', () => {
			this.isDeviceFormVisible = false;
			this.editingDeviceId = undefined;
			this.render();
		});

		form.addEventListener('submit', async event => {
			event.preventDefault();
			const draft = this.readDeviceDraft(form, message);
			if (!draft || !this.deviceStore) {
				return;
			}

			message.textContent = draft.preferredTransferProtocol === 'sftp' ? '正在保存设备...' : '正在保存并检测设备能力...';
			try {
				const previousLocalWindowsDefaultPath = isEditingLocalWindows ? this.getLocalWindowsDeviceDefaultPath() : undefined;
				let savedDevice = isEditingLocalWindows ? this.saveLocalWindowsDevice(draft) : editingDevice ? await this.deviceStore.updateDevice(editingDevice.id, draft) : await this.deviceStore.saveDevice(draft);
				this.invalidatePreparedTransferPair();
				const capabilityResult = isEditingLocalWindows ? undefined : await this.detectAndStoreDeviceCapabilities(savedDevice);
				if (!isEditingLocalWindows) {
					savedDevice = this.deviceStore.loadDevices().find(device => device.id === savedDevice.id) ?? savedDevice;
					this.devices = this.deviceStore.loadDevices();
				}
				this.clearPaneDirectoryCachesForDevice(savedDevice.id);
				this.ensurePaneDeviceSelection();
				const refreshedLocalWindowsPanes = isEditingLocalWindows
					? this.syncLocalWindowsDefaultPath(previousLocalWindowsDefaultPath ?? this.getLocalWindowsDefaultPath(), savedDevice.defaultPath || this.getLocalWindowsDeviceDefaultPath())
					: false;
				if (capabilityResult) {
					this.deviceConnectionMessages.set(savedDevice.id, capabilityResult);
					this.setDeviceRuntimeStatus(savedDevice, capabilityResult.status === 'error' ? 'offline' : 'online');
				} else if (isEditingLocalWindows) {
					this.deviceConnectionMessages.set(savedDevice.id, { status: 'success', message: '本机配置已保存，Windows 与服务器互传会按所选协议执行。' });
					this.setDeviceRuntimeStatus(savedDevice, 'online');
				} else if (savedDevice.preferredTransferProtocol === 'sftp') {
					this.deviceConnectionMessages.set(savedDevice.id, { status: 'success', message: 'SFTP 稳定模式，无需额外检测。' });
				}
				this.deviceFormMessage = `${editingDevice ? '已更新' : '已保存'}设备：${savedDevice.name}${capabilityResult ? `，${capabilityResult.message}` : ''}`;
				this.statusMessage = `${this.deviceFormMessage}。可在设备下拉菜单中选择。`;
				this.isDeviceFormVisible = false;
				this.editingDeviceId = undefined;
				this.render();
				this.prewarmCurrentTransferPair(true);
				if (!isEditingLocalWindows || !refreshedLocalWindowsPanes) {
					void this.refreshPane('right');
				}
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				this.deviceFormMessage = `保存失败：${reason}`;
				message.textContent = this.deviceFormMessage;
				this.statusMessage = this.deviceFormMessage;
			}
		});

		overlay.appendChild(form);
		getWindow(form).requestAnimationFrame(() => {
			if (!form.isConnected) {
				return;
			}
			const firstInput = form.querySelector<HTMLInputElement>('input[name="name"]');
			firstInput?.focus({ preventScroll: true });
			firstInput?.select();
		});
		return overlay;
	}

	private bindDeviceFormEventIsolation(form: HTMLFormElement): void {
		const stopPropagation = (event: globalThis.Event) => event.stopPropagation();
		for (const eventName of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'keypress']) {
			form.addEventListener(eventName, stopPropagation);
		}
	}

	private appendInputField(parent: HTMLElement, name: string, label: string, placeholder: string, type = 'text', wide = false, value?: string): void {
		const field = $('.turbofile-device-field');
		if (wide) {
			field.classList.add('is-wide');
		}

		const labelElement = document.createElement('label');
		labelElement.textContent = label;
		labelElement.htmlFor = `turbofile-device-${name}`;

		const input = document.createElement('input');
		input.id = `turbofile-device-${name}`;
		input.name = name;
		input.type = type;
		input.placeholder = placeholder;
		input.value = value ?? (name === 'port' ? '22' : '');
		this.bindDeviceFormControl(input);

		field.appendChild(labelElement);
		field.appendChild(input);
		parent.appendChild(field);
	}

	private appendHiddenInput(parent: HTMLElement, name: string, value: string): void {
		const input = document.createElement('input');
		input.type = 'hidden';
		input.name = name;
		input.value = value;
		parent.appendChild(input);
	}

	private appendProtocolField(parent: HTMLElement, editingDevice?: TurboFileDevice): void {
		const isLocalWindowsDevice = editingDevice?.id === LOCAL_WINDOWS_DEVICE_ID || editingDevice?.platform === 'windows';
		const field = $('.turbofile-device-field.is-wide');
		const labelElement = document.createElement('label');
		labelElement.textContent = '传输模式';
		labelElement.htmlFor = 'turbofile-device-preferredTransferProtocol';

		const row = $('.turbofile-device-protocol-row');
		row.style.display = 'grid';
		row.style.gridTemplateColumns = 'minmax(180px, 1fr) auto auto';
		row.style.gap = '8px';
		row.style.alignItems = 'center';

		const select = document.createElement('select');
		select.id = 'turbofile-device-preferredTransferProtocol';
		select.name = 'preferredTransferProtocol';
		const protocolOptions: [string, string][] = [
			['auto-fast', '智能极速（推荐）'],
			['scp', 'SCP 文件'],
			['sftp', 'SFTP 稳定模式'],
			['rsync', 'rsync 增量']
		];
		for (const [value, text] of protocolOptions) {
			const option = document.createElement('option');
			option.value = value;
			option.textContent = text;
			option.selected = (editingDevice?.preferredTransferProtocol ?? defaultTurboFileTransferProtocol) === value;
			select.appendChild(option);
		}
		this.bindDeviceFormControl(select);

		const detect = this.createButton('检测', 'turbofile-secondary-button').element;
		detect.type = 'button';
		const install = this.createButton('安装 rsync/sshpass', 'turbofile-secondary-button').element;
		install.type = 'button';
		install.style.display = 'none';

		const getLocalWindowsProtocolStatus = (): string => {
			const protocol = this.normalizeTransferProtocol(select.value);
			return protocol === 'rsync'
				? 'Windows 本机已内置 rsync，可直接用于本机与 SSH 设备增量传输，无需单独安装 Cygwin/MSYS2。'
				: '本机模式用于 Windows 与服务器互传，无需 SSH 检测。';
		};

		const status = $('.turbofile-device-protocol-status');
		status.style.gridColumn = '1 / -1';
		status.style.minHeight = '18px';
		status.style.color = 'var(--vscode-descriptionForeground)';
		status.textContent = isLocalWindowsDevice ? getLocalWindowsProtocolStatus() : select.value === 'sftp' ? 'SFTP 稳定模式，无需额外检测。' : '选择后将自动检测设备能力。';

		let lastMissingDependencies: readonly TurboFileTransferDependency[] = [];
		let detectionRun = 0;
		const setStatus = (kind: 'idle' | 'testing' | 'success' | 'error', message: string): void => {
			status.textContent = message;
			status.style.color = kind === 'success'
				? 'var(--vscode-testing-iconPassed)'
				: kind === 'error'
					? 'var(--vscode-testing-iconFailed)'
					: 'var(--vscode-descriptionForeground)';
		};
		const setInstallVisible = (visible: boolean): void => {
			install.style.display = visible ? '' : 'none';
		};
		const runDetection = async (): Promise<void> => {
			const protocol = this.normalizeTransferProtocol(select.value);
			lastMissingDependencies = [];
			setInstallVisible(false);
			if (isLocalWindowsDevice) {
				setStatus('idle', getLocalWindowsProtocolStatus());
				return;
			}
			if (protocol === 'sftp') {
				setStatus('idle', 'SFTP 稳定模式，无需额外检测。');
				return;
			}
			const draft = this.readDeviceDraft(parent as HTMLFormElement, status);
			if (!draft) {
				setInstallVisible(false);
				return;
			}
			const runId = ++detectionRun;
			detect.disabled = true;
			install.disabled = true;
			setStatus('testing', '正在检测设备传输能力...');
			try {
				const result = await this.detectDraftProtocolCapabilities(draft, editingDevice);
				if (runId !== detectionRun) {
					return;
				}
				if (!result) {
					setStatus('idle', 'SFTP 稳定模式，无需额外检测。');
					setInstallVisible(false);
					return;
				}
				lastMissingDependencies = result.missingDependencies ?? [];
				setStatus(result.status, result.message);
				setInstallVisible(protocol === 'rsync' && lastMissingDependencies.length > 0 && !!result.capabilities);
			} catch (error) {
				if (runId !== detectionRun) {
					return;
				}
				const reason = error instanceof Error ? error.message : String(error);
				setStatus('error', `能力检测失败：${reason}`);
				setInstallVisible(false);
			} finally {
				if (runId === detectionRun) {
					detect.disabled = false;
					install.disabled = false;
				}
			}
		};
		detect.addEventListener('click', () => { void runDetection(); });
		select.addEventListener('change', () => { void runDetection(); });
		install.addEventListener('click', async () => {
			const dependencies = lastMissingDependencies.filter((dependency): dependency is TurboFileTransferDependency => dependency === 'rsync' || dependency === 'sshpass');
			if (!dependencies.length) {
				return;
			}
			const confirmed = getWindow(this.container).confirm(`将在远端服务器安装：${dependencies.join('、')}\n\n该操作会修改远端系统包，请确认你信任这台服务器并拥有安装权限。`);
			if (!confirmed) {
				return;
			}
			const draft = this.readDeviceDraft(parent as HTMLFormElement, status);
			if (!draft) {
				return;
			}
			detect.disabled = true;
			install.disabled = true;
			setStatus('testing', '正在远端安装 rsync/sshpass...');
			const result = await this.sshService.installTransferDependencies(await this.getSshConnectionOptionsFromDraft(draft, editingDevice), dependencies);
			if (result.capabilities && editingDevice && this.deviceStore) {
				this.deviceStore.updateDeviceCapabilities(editingDevice.id, this.toDeviceCapabilities(result.capabilities));
				this.devices = this.deviceStore.loadDevices();
				this.invalidatePreparedTransferPair();
				this.prewarmCurrentTransferPair(true);
			}
			if (!result.ok) {
				lastMissingDependencies = result.missingPackages;
				setStatus('error', `安装后仍不可用：${result.message}`);
				setInstallVisible(lastMissingDependencies.length > 0);
			} else {
				setStatus('success', 'rsync/sshpass 安装成功，正在重新检测...');
				await runDetection();
			}
			detect.disabled = false;
			install.disabled = false;
		});

		row.appendChild(select);
		if (!isLocalWindowsDevice) {
			row.appendChild(detect);
			row.appendChild(install);
		}
		row.appendChild(status);
		field.appendChild(labelElement);
		field.appendChild(row);
		parent.appendChild(field);
		if (select.value === 'rsync') {
			window.setTimeout(() => { void runDetection(); }, 0);
		}
	}

	private appendSelectField(parent: HTMLElement, name: string, label: string, options: [string, string][], selectedValue?: string): void {
		const field = $('.turbofile-device-field');
		const labelElement = document.createElement('label');
		labelElement.textContent = label;
		labelElement.htmlFor = `turbofile-device-${name}`;

		const select = document.createElement('select');
		select.id = `turbofile-device-${name}`;
		select.name = name;
		for (const [value, text] of options) {
			const option = document.createElement('option');
			option.value = value;
			option.textContent = text;
			option.selected = selectedValue === value;
			select.appendChild(option);
		}
		this.bindDeviceFormControl(select);

		field.appendChild(labelElement);
		field.appendChild(select);
		parent.appendChild(field);
	}

	private bindDeviceFormControl(control: HTMLInputElement | HTMLSelectElement): void {
		control.addEventListener('pointerdown', event => {
			event.stopPropagation();
			control.focus({ preventScroll: true });
		});
		for (const eventName of ['mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'input', 'change']) {
			control.addEventListener(eventName, event => event.stopPropagation());
		}
	}

	private readDeviceDraft(form: HTMLFormElement, message: HTMLElement): TurboFileDeviceDraft | undefined {
		const formData = new FormData(form);
		const host = String(formData.get('host') || '').trim();
		const username = String(formData.get('username') || '').trim();

		if (!host || !username) {
			message.textContent = '请填写 IP / 主机名和用户名。';
			return undefined;
		}

		return {
			name: String(formData.get('name') || host).trim(),
			host,
			port: Number(formData.get('port')) || 22,
			username,
			authType: String(formData.get('authType') || 'password') as TurboFileAuthType,
			password: String(formData.get('password') || '') || undefined,
			privateKeyPath: String(formData.get('privateKeyPath') || '') || undefined,
			passphrase: String(formData.get('passphrase') || '') || undefined,
			defaultPath: String(formData.get('defaultPath') || '') || undefined,
			platform: String(formData.get('platform') || 'unknown') as TurboFileDevicePlatform,
			preferredTransferProtocol: this.normalizeTransferProtocol(String(formData.get('preferredTransferProtocol') || defaultTurboFileTransferProtocol))
		};
	}
}

interface TurboFileRegisteredRemoteDevice {
	readonly connection: Promise<ITurboFileSshConnectionOptions>;
	readonly label: string;
}

class TurboFileRemoteFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
	readonly onDidChangeCapabilities: Event<void> = Event.None;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	private readonly devices = new Map<string, TurboFileRegisteredRemoteDevice>();
	private readonly stats = new Map<string, IStat>();
	private readonly remotePaths = new Map<string, string>();

	constructor(private readonly sshService: ITurboFileSshService) {
		super();
	}

	registerFile(device: TurboFileDevice, connection: Promise<ITurboFileSshConnectionOptions>, item: TurboFileFileItem): URI {
		const resource = URI.from({
			scheme: TURBOFILE_REMOTE_DOCUMENT_SCHEME,
			authority: device.id,
			path: toRemoteDocumentUriPath(item.path ?? '/')
		});
		this.devices.set(device.id, { connection, label: device.name });
		this.remotePaths.set(resource.toString(), item.path ?? resource.path);
		this.stats.set(resource.toString(), this.toStat(item));
		return resource;
	}

	watch(_resource: URI, _opts: IWatchOptions): IDisposable {
		return Disposable.None;
	}

	async stat(resource: URI): Promise<IStat> {
		const cached = this.stats.get(resource.toString());
		if (cached) {
			return cached;
		}

		const path = this.toRemotePath(resource);
		if (path === '/') {
			return { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 };
		}

		const entry = await this.lookupEntry(resource);
		const stat = this.toEntryStat(entry);
		this.stats.set(resource.toString(), stat);
		return stat;
	}

	async mkdir(resource: URI): Promise<void> {
		const result = await this.sshService.createDirectory(await this.toEndpoint(resource));
		if (!result.ok) {
			throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
		}
		this.stats.set(resource.toString(), { type: FileType.Directory, ctime: Date.now(), mtime: Date.now(), size: 0 });
		this._onDidChangeFile.fire([{ resource, type: FileChangeType.ADDED }]);
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const registeredDevice = this.getRegisteredDevice(resource);
		const listing = await this.sshService.listRemoteDirectory(await registeredDevice.connection, this.toRemotePath(resource));
		return listing.entries.map(entry => {
			const childResource = URI.from({
				scheme: TURBOFILE_REMOTE_DOCUMENT_SCHEME,
				authority: resource.authority,
				path: toRemoteDocumentUriPath(entry.path)
			});
			this.remotePaths.set(childResource.toString(), entry.path);
			this.stats.set(childResource.toString(), this.toEntryStat(entry));
			return [entry.name, toProviderFileType(entry.type)];
		});
	}

	async delete(resource: URI, opts: IFileDeleteOptions): Promise<void> {
		const result = await this.sshService.deletePath(await this.toEndpoint(resource), opts.recursive);
		if (!result.ok) {
			throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
		}
		this.stats.delete(resource.toString());
		this.remotePaths.delete(resource.toString());
		this._onDidChangeFile.fire([{ resource, type: FileChangeType.DELETED }]);
	}

	async rename(from: URI, to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		const result = await this.sshService.renamePath(await this.toEndpoint(from), this.toRemotePath(to));
		if (!result.ok) {
			throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
		}

		const fromKey = from.toString();
		const toKey = to.toString();
		const stat = this.stats.get(fromKey);
		if (stat) {
			this.stats.set(toKey, { ...stat, mtime: Date.now() });
			this.stats.delete(fromKey);
		}
		this.remotePaths.set(toKey, this.toRemotePath(to));
		this.remotePaths.delete(fromKey);
		this._onDidChangeFile.fire([
			{ resource: from, type: FileChangeType.DELETED },
			{ resource: to, type: FileChangeType.ADDED }
		]);
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const result = await this.sshService.readFile(await this.toEndpoint(resource), { encoding: 'base64', maxBytes: 256 * 1024 * 1024 });
		if (!result.ok) {
			throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
		}

		const now = Date.now();
		const previous = this.stats.get(resource.toString());
		this.stats.set(resource.toString(), {
			type: FileType.File,
			ctime: previous?.ctime ?? now,
			mtime: previous?.mtime ?? now,
			size: result.size
		});
		return decodeBase64(result.content).buffer;
	}

	async writeFile(resource: URI, content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		const result = await this.sshService.writeFile(await this.toEndpoint(resource), encodeBase64(VSBuffer.wrap(content)), 'base64');
		if (!result.ok) {
			throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
		}

		const now = Date.now();
		const previous = this.stats.get(resource.toString());
		this.stats.set(resource.toString(), {
			type: FileType.File,
			ctime: previous?.ctime ?? now,
			mtime: now,
			size: content.byteLength
		});
		this._onDidChangeFile.fire([{ resource, type: FileChangeType.UPDATED }]);
	}

	private async lookupEntry(resource: URI): Promise<ITurboFileFileEntry> {
		const registeredDevice = this.getRegisteredDevice(resource);
		const path = this.toRemotePath(resource);
		const parentPath = getPaneParentPath(path, false) ?? '/';
		const listing = await this.sshService.listRemoteDirectory(await registeredDevice.connection, parentPath);
		const name = getPathBasename(path);
		const entry = listing.entries.find(entry => entry.path === path || entry.name === name);
		if (!entry) {
			throw createTurboFileProviderError(`File not found: ${path}`, FileSystemProviderErrorCode.FileNotFound);
		}
		return entry;
	}

	private async toEndpoint(resource: URI): Promise<ITurboFileTransferEndpoint> {
		const registeredDevice = this.getRegisteredDevice(resource);
		return {
			kind: 'ssh',
			path: this.toRemotePath(resource),
			connection: await registeredDevice.connection,
			label: registeredDevice.label
		};
	}

	private getRegisteredDevice(resource: URI): TurboFileRegisteredRemoteDevice {
		const registeredDevice = this.devices.get(resource.authority);
		if (!registeredDevice) {
			throw createTurboFileProviderError(`Remote device is not registered: ${resource.authority}`, FileSystemProviderErrorCode.Unavailable);
		}
		return registeredDevice;
	}

	private toRemotePath(resource: URI): string {
		return this.remotePaths.get(resource.toString()) ?? resource.path;
	}

	private toStat(item: TurboFileFileItem): IStat {
		const mtime = item.rawModified || Date.now();
		return {
			type: toProviderFileType(item.type),
			ctime: mtime,
			mtime,
			size: item.rawSize
		};
	}

	private toEntryStat(entry: ITurboFileFileEntry): IStat {
		return {
			type: toProviderFileType(entry.type),
			ctime: entry.modified,
			mtime: entry.modified,
			size: entry.size
		};
	}
}

class TurboFileSshTerminalProcess extends BasePty implements ITerminalChildProcess {
	private readonly terminalDisposables = this._register(new DisposableStore());
	private readonly pendingInput: string[] = [];
	private sessionId: string | undefined;
	private isShutdown = false;

	constructor(
		id: number,
		cols: number,
		rows: number,
		private readonly sshService: ITurboFileSshService,
		private readonly connection: Promise<ITurboFileSshConnectionOptions> | ITurboFileSshConnectionOptions,
		private readonly cwd: string
	) {
		super(id, false);
		this._lastDimensions.cols = cols;
		this._lastDimensions.rows = rows;
		this._properties.cwd = cwd;
		this._properties.initialCwd = cwd;
		void Promise.resolve(connection).then(resolvedConnection => {
			this._properties.title = `极速传 ${resolvedConnection.username}@${resolvedConnection.host}`;
			this.handleDidChangeProperty({ type: ProcessPropertyType.Title, value: this._properties.title });
		}, () => undefined);
	}

	async start(): Promise<ITerminalLaunchError | ITerminalLaunchResult | undefined> {
		try {
			const connection = await this.connection;
			const session = await this.sshService.createSshTerminal(connection, this.cwd, this._lastDimensions.cols, this._lastDimensions.rows);
			this.sessionId = session.sessionId;
			this._properties.cwd = session.cwd;
			this._properties.initialCwd = session.cwd;

			this.terminalDisposables.add(this.sshService.onDynamicSshTerminalData(session.sessionId)(data => this.handleData(data)));
			this.terminalDisposables.add(this.sshService.onDynamicSshTerminalExit(session.sessionId)(code => {
				this.sessionId = undefined;
				this.terminalDisposables.clear();
				this.handleExit(code);
			}));

			this.handleReady({ pid: session.pid, cwd: session.cwd, windowsPty: undefined });
			for (const data of this.pendingInput.splice(0)) {
				void this.sshService.writeSshTerminal(session.sessionId, data);
			}
			return undefined;
		} catch (error) {
			return { message: error instanceof Error ? error.message : String(error) };
		}
	}

	shutdown(_immediate: boolean): void {
		if (this.isShutdown) {
			return;
		}
		this.isShutdown = true;
		const sessionId = this.sessionId;
		this.sessionId = undefined;
		this.terminalDisposables.clear();
		if (sessionId) {
			void this.sshService.shutdownSshTerminal(sessionId);
		}
		this.handleExit(undefined);
	}

	input(data: string): void {
		if (this.isShutdown) {
			return;
		}
		if (!this.sessionId) {
			this.pendingInput.push(data);
			return;
		}
		void this.sshService.writeSshTerminal(this.sessionId, data);
	}

	sendSignal(signal: string): void {
		if (signal === 'SIGINT') {
			this.input('\x03');
			return;
		}
		if (signal === 'SIGTERM' || signal === 'SIGKILL') {
			this.shutdown(true);
		}
	}

	processBinary(data: string): Promise<void> {
		this.input(data);
		return Promise.resolve();
	}

	resize(cols: number, rows: number): void {
		if (this.isShutdown || (this._lastDimensions.cols === cols && this._lastDimensions.rows === rows)) {
			return;
		}
		this._lastDimensions.cols = cols;
		this._lastDimensions.rows = rows;
		if (this.sessionId) {
			void this.sshService.resizeSshTerminal(this.sessionId, cols, rows);
		}
	}

	clearBuffer(): void {
		// The SSH PTY stream is live-only; VS Code owns the visible scrollback buffer.
	}

	acknowledgeDataEvent(_charCount: number): void {
		// ssh2 channels provide their own backpressure, so no extra browser ack is needed.
	}

	setUnicodeVersion(_version: '6' | '11'): Promise<void> {
		return Promise.resolve();
	}

	override getInitialCwd(): Promise<string> {
		return Promise.resolve(this._properties.initialCwd);
	}

	override getCwd(): Promise<string> {
		return Promise.resolve(this._properties.cwd || this._properties.initialCwd);
	}

	refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]> {
		return Promise.resolve(this._properties[type]);
	}

	updateProperty<T extends ProcessPropertyType>(type: T, value: IProcessPropertyMap[T]): Promise<void> {
		this._properties[type] = value;
		this.handleDidChangeProperty({ type, value });
		return Promise.resolve();
	}
}

function getPaneParentPath(path: string, windowsPath: boolean): string | undefined {
	if (!path) {
		return undefined;
	}

	if (!windowsPath) {
		const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
		if (normalized === '/') {
			return undefined;
		}
		const index = normalized.lastIndexOf('/');
		return index <= 0 ? '/' : normalized.substring(0, index);
	}

	const normalized = path.replace(/[\\/]+$/, '');
	if (/^[A-Za-z]:$/.test(normalized)) {
		return undefined;
	}

	const slash = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
	if (slash <= 2 && /^[A-Za-z]:/.test(normalized)) {
		return `${normalized.substring(0, 2)}\\`;
	}
	if (slash <= 0) {
		return undefined;
	}
	return normalized.substring(0, slash);
}

function getWindowsDriveRoot(path: string): string | undefined {
	const match = /^([A-Za-z]):/.exec(path.replace(/\//g, '\\').trim());
	return match ? `${match[1].toUpperCase()}:\\` : undefined;
}

function isSameWindowsPath(left: string, right: string): boolean {
	return getWindowsPathKey(left) === getWindowsPathKey(right);
}

function isPathOnWindowsDrive(path: string, driveRoot: string): boolean {
	return getWindowsDriveRoot(path) === getWindowsDriveRoot(driveRoot);
}

function getWindowsPathKey(path: string): string {
	return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

function isSupportedWindowsDropPath(path: string): boolean {
	return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}

function joinPanePath(parentPath: string, name: string, windowsPath: boolean): string {
	if (!windowsPath) {
		if (!parentPath || parentPath === '/') {
			return `/${name}`;
		}
		return parentPath.endsWith('/') ? `${parentPath}${name}` : `${parentPath}/${name}`;
	}

	if (!parentPath) {
		return name;
	}
	const separator = parentPath.includes('/') && !parentPath.includes('\\') ? '/' : '\\';
	return parentPath.endsWith('\\') || parentPath.endsWith('/') ? `${parentPath}${name}` : `${parentPath}${separator}${name}`;
}

function toRemoteDocumentUriPath(path: string): string {
	const normalized = path.replace(/\\/g, '/');
	return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function getPathBasename(path: string): string {
	const normalized = path.replace(/[\\/]+$/, '');
	const slash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
	return slash >= 0 ? normalized.substring(slash + 1) : normalized;
}

function toProviderFileType(type: TurboFileFileType): FileType {
	if (type === 'directory') {
		return FileType.Directory;
	}
	if (type === 'file') {
		return FileType.File;
	}
	if (type === 'symlink') {
		return FileType.File | FileType.SymbolicLink;
	}
	return FileType.Unknown;
}

function createTurboFileProviderError(message: string, code: FileSystemProviderErrorCode): Error {
	return createFileSystemProviderError(message, code);
}

function renderTurboFileSortIcon(color?: TurboFileIconColor): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('turbofile-bi-icon');
	if (color) {
		svg.classList.add(`turbofile-text-${color}`);
	}

	const createPath = (d: string): SVGPathElement => {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', d);
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		path.setAttribute('stroke-width', '1.6');
		return path;
	};

	svg.appendChild(createPath('M4 13V3'));
	svg.appendChild(createPath('M1.8 5.2 4 3l2.2 2.2'));
	svg.appendChild(createPath('M12 3v10'));
	svg.appendChild(createPath('M9.8 10.8 12 13l2.2-2.2'));
	return svg;
}

function renderTurboFileIcon(icon: TurboFileBootstrapIcon, color?: TurboFileIconColor): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('turbofile-bi-icon');
	if (color) {
		svg.classList.add(`turbofile-text-${color}`);
	}
	for (const path of getTurboFileIconPaths(icon)) {
		const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		pathElement.setAttribute('d', path.d);
		pathElement.setAttribute('fill', 'currentColor');
		if (path.fillRule) {
			pathElement.setAttribute('fill-rule', path.fillRule);
		}
		svg.appendChild(pathElement);
	}
	return svg;
}

let turboFileDeviceMonitorIconId = 0;

function renderTurboFileDeviceMonitorIcon(): SVGElement {
	const screenId = `turbofileDeviceScreen${++turboFileDeviceMonitorIconId}`;
	const shineId = `turbofileDeviceShine${turboFileDeviceMonitorIconId}`;
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('turbofile-device-monitor-svg');
	const create = (tag: string, attrs: Record<string, string>): SVGElement => {
		const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
		for (const [name, value] of Object.entries(attrs)) {
			element.setAttribute(name, value);
		}
		return element;
	};
	const defs = create('defs', {});
	const screen = create('linearGradient', { id: screenId, x1: '4', y1: '4', x2: '20', y2: '16', gradientUnits: 'userSpaceOnUse' });
	screen.appendChild(create('stop', { 'stop-color': '#5de7ef' }));
	screen.appendChild(create('stop', { offset: '1', 'stop-color': '#2e8cff' }));
	const shine = create('linearGradient', { id: shineId, x1: '6', y1: '5', x2: '18', y2: '13', gradientUnits: 'userSpaceOnUse' });
	shine.appendChild(create('stop', { 'stop-color': '#ffffff', 'stop-opacity': '.42' }));
	shine.appendChild(create('stop', { offset: '1', 'stop-color': '#ffffff', 'stop-opacity': '0' }));
	defs.appendChild(screen);
	defs.appendChild(shine);
	svg.appendChild(defs);
	svg.appendChild(create('rect', { x: '3.4', y: '4.2', width: '17.2', height: '12', rx: '1.4', fill: '#1f2933' }));
	svg.appendChild(create('rect', { x: '4.6', y: '5.3', width: '14.8', height: '9.7', rx: '.7', fill: `url(#${screenId})` }));
	svg.appendChild(create('path', { fill: `url(#${shineId})`, d: 'M5.6 6.1h12.8v3.2c-2.6-.8-5.2-.9-7.8-.3-1.8.4-3.4.3-5-.1V6.1z' }));
	svg.appendChild(create('path', { fill: '#343a40', d: 'M10.6 16.2h2.8v2.1h3.7v1.5H6.9v-1.5h3.7v-2.1z' }));
	svg.appendChild(create('path', { fill: '#8a98a8', d: 'M7.8 20h8.4c.4 0 .7.3.7.7v.2H7.1v-.2c0-.4.3-.7.7-.7z' }));
	svg.appendChild(create('path', { fill: '#ffffff', 'fill-opacity': '.28', d: 'M5.4 5.9h13.2v.8H5.4z' }));
	return svg;
}

function renderTurboFileAppearanceIcon(icon: TurboFileAppearanceIcon): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('turbofile-appearance-icon');

	if (icon === 'sun') {
		for (const d of ['M12 2.75V5.1', 'M12 18.9v2.35', 'M4.64 4.64l1.66 1.66', 'M17.7 17.7l1.66 1.66', 'M2.75 12H5.1', 'M18.9 12h2.35', 'M4.64 19.36l1.66-1.66', 'M17.7 6.3l1.66-1.66']) {
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', d);
			svg.appendChild(path);
		}
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', '12');
		circle.setAttribute('cy', '12');
		circle.setAttribute('r', '4');
		svg.appendChild(circle);
		return svg;
	}

	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	if (icon === 'moon') {
		path.setAttribute('d', 'M20.2 14.4A7.7 7.7 0 0 1 9.6 3.8 8.2 8.2 0 1 0 20.2 14.4Z');
	} else {
		path.setAttribute('d', 'M4 5.5h16v10.5H4zM9 20h6M12 16v4');
	}
	svg.appendChild(path);
	return svg;
}

function getTurboFileIconPaths(icon: TurboFileBootstrapIcon): TurboFileIconPath[] {
	switch (icon) {
		case 'archive':
			return [
				{ d: 'M0 2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1v7.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 1 12.5V5a1 1 0 0 1-1-1V2zm2 3v7.5A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5V5H2zm13-3H1v2h14V2zM5 7.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z' }
			];
		case 'arrow-clockwise':
			return [
				{ d: 'M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z', fillRule: 'evenodd' },
				{ d: 'M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z' }
			];
		case 'arrow-up-circle':
			return [
				{ d: 'M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8zm15 0A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-7.5 3.5a.5.5 0 0 1-1 0V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707V11.5z', fillRule: 'evenodd' }
			];
		case 'clock':
			return [
				{ d: 'M8 3.5a.5.5 0 0 1 .5.5v3.25l2.15 1.29a.5.5 0 0 1-.514.858l-2.4-1.44A.5.5 0 0 1 7.5 7.53V4a.5.5 0 0 1 .5-.5z' },
				{ d: 'M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm0-1A7 7 0 1 1 8 1a7 7 0 0 1 0 14z' }
			];
		case 'cloud-upload-fill':
			return [
				{ d: 'M8 0a5.53 5.53 0 0 0-3.594 1.342c-.766.66-1.321 1.52-1.464 2.383C1.266 4.095 0 5.555 0 7.318 0 9.366 1.708 11 3.781 11H7.5V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707V11h4.188C14.502 11 16 9.57 16 7.773c0-1.636-1.242-2.969-2.834-3.194C12.923 1.999 10.69 0 8 0zm-.5 14.5V11h1v3.5a.5.5 0 0 1-1 0z', fillRule: 'evenodd' }
			];
		case 'eye':
			return [
				{ d: 'M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z' },
				{ d: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z' }
			];
		case 'file-earmark':
			return [
				{ d: 'M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z' }
			];
		case 'file-earmark-zip':
			return [
				{ d: 'M5 7.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v.938l.4 1.599a1 1 0 0 1-.416 1.074l-.93.62a1 1 0 0 1-1.11 0l-.929-.62a1 1 0 0 1-.415-1.074L5 8.438V7.5zm2 0H6v.938a1 1 0 0 1-.03.243l-.4 1.598.93.62.929-.62-.4-1.598A1 1 0 0 1 7 8.438V7.5z' },
				{ d: 'M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1h-2v1h-1v1h1v1h-1v1h1v1H6V5H5V4h1V3H5V2h1V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z' }
			];
		case 'files':
			return [
				{ d: 'M13 0H6a2 2 0 0 0-2 2 2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2 2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm0 13V4a2 2 0 0 0-2-2H5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1zM3 4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z' }
			];
		case 'folder-check':
			return [
				{ d: 'm.5 3 .04.87a1.99 1.99 0 0 0-.342 1.311l.637 7A2 2 0 0 0 2.826 14H9v-1H2.826a1 1 0 0 1-.995-.91l-.637-7A1 1 0 0 1 2.19 4h11.62a1 1 0 0 1 .996 1.09L14.54 8h1.005l.256-2.819A2 2 0 0 0 13.81 3H9.828a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 6.172 1H2.5a2 2 0 0 0-2 2zm5.672-1a1 1 0 0 1 .707.293L7.586 3H2.19c-.24 0-.47.042-.683.12L1.5 2.98a1 1 0 0 1 1-.98h3.672z' },
				{ d: 'M15.854 10.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.707 0l-1.5-1.5a.5.5 0 0 1 .707-.708l1.146 1.147 2.646-2.647a.5.5 0 0 1 .708 0z' }
			];
		case 'folder-fill':
			return [
				{ d: 'M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.825a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3zm-8.322.12C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139z' }
			];
		case 'folder-plus':
			return [
				{ d: 'm.5 3 .04.87a1.99 1.99 0 0 0-.342 1.311l.637 7A2 2 0 0 0 2.826 14H9v-1H2.826a1 1 0 0 1-.995-.91l-.637-7A1 1 0 0 1 2.19 4h11.62a1 1 0 0 1 .996 1.09L14.54 8h1.005l.256-2.819A2 2 0 0 0 13.81 3H9.828a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 6.172 1H2.5a2 2 0 0 0-2 2zm5.672-1a1 1 0 0 1 .707.293L7.586 3H2.19c-.24 0-.47.042-.683.12L1.5 2.98a1 1 0 0 1 1-.98h3.672z' },
				{ d: 'M13.5 10a.5.5 0 0 1 .5.5V12h1.5a.5.5 0 1 1 0 1H14v1.5a.5.5 0 1 1-1 0V13h-1.5a.5.5 0 0 1 0-1H13v-1.5a.5.5 0 0 1 .5-.5z' }
			];
		case 'geo-alt-fill':
			return [
				{ d: 'M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z' }
			];
		case 'grid-3x3-gap':
			return [
				{ d: 'M4 2v2H2V2h2zm1 12v-2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm0-5V7a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm0-5V2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm5 10v-2a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm0-5V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm0-5V2a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zM9 2v2H7V2h2zm5 0v2h-2V2h2zM4 7v2H2V7h2zm5 0v2H7V7h2zm5 0h-2v2h2V7zM4 12v2H2v-2h2zm5 0v2H7v-2h2zm5 0v2h-2v-2h2zM12 1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1h-2zm-1 6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V7zm1 4a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-2z' }
			];
		case 'hdd-network-fill':
			return [
				{ d: 'M2 2a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h5.5v3A1.5 1.5 0 0 0 6 11.5H.5a.5.5 0 0 0 0 1H6A1.5 1.5 0 0 0 7.5 14h1a1.5 1.5 0 0 0 1.5-1.5h5.5a.5.5 0 0 0 0-1H10A1.5 1.5 0 0 0 8.5 10V7H14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2zm.5 3a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z' }
			];
		case 'lightning-charge-fill':
			return [
				{ d: 'M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z' }
			];
		case 'pencil-square':
			return [
				{ d: 'M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z' },
				{ d: 'M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z', fillRule: 'evenodd' }
			];
		case 'scissors':
			return [
				{ d: 'M3.5 3.5c.828 0 1.5.672 1.5 1.5S4.328 6.5 3.5 6.5 2 5.828 2 5s.672-1.5 1.5-1.5zM6 5c0-.813-.39-1.536-.993-1.993L8 0h2L5.993 4.007C5.39 4.464 5 5.187 5 6c0 .383.085.747.238 1.073L0 12.31V14h1.69l5.237-5.238A2.985 2.985 0 0 0 8 9c.813 0 1.536-.39 1.993-.993L14 12.014V10L9.993 5.993A2.985 2.985 0 0 0 10 6c0-.813-.39-1.536-.993-1.993L14 0h-2L7.073 4.927A2.985 2.985 0 0 0 6 5zm6.5 4.5c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5S11 11.828 11 11s.672-1.5 1.5-1.5z' }
			];
		case 'search':
			return [
				{ d: 'M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z' }
			];
		case 'terminal':
			return [
				{ d: 'M6 9a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3A.5.5 0 0 1 6 9zM3.854 4.146a.5.5 0 1 0-.708.708L4.793 6.5 3.146 8.146a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2z' },
				{ d: 'M2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H2zm12 1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12z' }
			];
		case 'trash':
			return [
				{ d: 'M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z' },
				{ d: 'M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z', fillRule: 'evenodd' }
			];
	}
}

function isHiddenFileName(name: string): boolean {
	return !!name && name !== '..' && name.startsWith('.');
}

function isImageFile(name: string): boolean {
	return /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/i.test(name);
}

function sortImageGridImages(images: TurboFileImageGridImage[], key: TurboFileImageGridSortKey, descending: boolean, sizeSortBasis: TurboFileImageGridSizeSortBasis = 'file'): void {
	const sorted = sortTurboFileImageGridItems(images.map(image => ({
		image,
		name: image.item.name,
		modified: image.item.rawModified,
		modifiedKnown: !image.item.attrsPending && Number.isFinite(image.item.rawModified) && image.item.rawModified >= 0,
		rawSize: image.item.rawSize,
		sizeKnown: !image.item.attrsPending && Number.isFinite(image.item.rawSize) && image.item.rawSize >= 0,
		originalWidth: image.originalWidth,
		originalHeight: image.originalHeight,
		dimensionsKnown: isKnownImageGridDimensions(image.originalWidth, image.originalHeight)
	})), key, descending, sizeSortBasis).map(entry => entry.image);
	images.splice(0, images.length, ...sorted);
}

function isKnownImageGridDimensions(width: number | undefined, height: number | undefined): boolean {
	return typeof width === 'number' && Number.isFinite(width) && width > 0
		&& typeof height === 'number' && Number.isFinite(height) && height > 0;
}

function shouldUseBatchTransfer(operation: TurboFileDragOperation, itemCount: number): boolean {
	return operation === 'move' || itemCount > 1;
}

function isArchiveFile(name: string): boolean {
	return /\.(zip|rar|7z|tar|tgz|tar\.gz|tar\.bz2|tbz2|tar\.xz|txz|tar\.zst|tzst|gz|bz2|xz)$/i.test(name);
}

function getMimeType(name: string): string {
	const lower = name.toLowerCase();
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
	if (lower.endsWith('.avif')) {
		return 'image/avif';
	}
	if (lower.endsWith('.ico')) {
		return 'image/x-icon';
	}
	if (lower.endsWith('.bmp')) {
		return 'image/bmp';
	}
	if (lower.endsWith('.svg')) {
		return 'image/svg+xml';
	}
	return 'text/plain';
}

function clampNumber(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return min;
	}
	return Math.min(max, Math.max(min, value));
}

function quantizeNumber(value: number, step: number): number {
	const normalizedStep = Math.max(1, Math.round(step));
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.round(value / normalizedStep) * normalizedStep;
}


function formatSize(size: number): string {
	if (size < 1024) {
		return `${Math.round(size)} B`;
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

function trimTrailingSlash(path: string): string {
	return path.length > 1 ? path.replace(/[\\/]+$/, '') : path;
}

function formatDuration(milliseconds: number): string {
	const seconds = Math.max(0.1, Math.max(0, milliseconds) / 1000);
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds - minutes * 60;
	return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

function formatThroughput(bytes: number, milliseconds: number): string {
	if (bytes <= 0 || milliseconds <= 0) {
		return '';
	}
	return `${formatTransferRate((bytes / milliseconds) * 1000)}/s`;
}

function formatTransferRate(bytesPerSecond: number): string {
	if (bytesPerSecond < 1000) {
		return `${Math.round(bytesPerSecond)} B`;
	}
	const kb = bytesPerSecond / 1000;
	if (kb < 1000) {
		return `${kb.toFixed(1)} KB`;
	}
	const mb = kb / 1000;
	if (mb < 1000) {
		return `${mb.toFixed(1)} MB`;
	}
	return `${(mb / 1000).toFixed(1)} GB`;
}

function formatDate(timestamp: number): string {
	if (!timestamp) {
		return '';
	}
	const date = new Date(timestamp);
	const pad = (value: number) => value.toString().padStart(2, '0');
	return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
