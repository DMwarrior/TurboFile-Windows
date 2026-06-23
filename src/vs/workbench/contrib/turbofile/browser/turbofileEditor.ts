/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/turbofile.css';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { $, clearNode, Dimension, getWindow, IDomPosition } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITurboFileFileEntry, ITurboFileImageBatchEntry, ITurboFileImageResourceOptions, ITurboFileReadImageOptions, ITurboFileRemoteCapabilities, ITurboFileSshConnectionOptions, ITurboFileSshService, ITurboFileTransferAttempt, ITurboFileTransferEndpoint, ITurboFileTransferProgressEvent, ITurboFileTransferResult, ITurboFileWindowsDragItem, TurboFileFileType, TurboFileTransferDependency } from '../../../../platform/turbofile/common/turbofile.js';
import { resolveTransferPlan } from '../../../../platform/turbofile/common/turbofileTransferPlan.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { createFileSystemProviderError, FileChangeType, FileKind, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileChange, IFileDeleteOptions, IFileOverwriteOptions, IFileService, IFileSystemProviderWithFileReadWriteCapability, IFileWriteOptions, IStat, IWatchOptions } from '../../../../platform/files/common/files.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
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
import { IUpdateService } from '../../../../platform/update/common/update.js';
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
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { TurboFileAuthType, TurboFileDevice, TurboFileDeviceCapabilities, TurboFileDevicePlatform, TurboFileTransferProtocol, defaultTurboFileTransferProtocol } from '../common/turbofileTypes.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { TurboFileEditorInput } from '../common/turbofileEditorInput.js';
import { TurboFileDeviceDraft, TurboFileDeviceStore } from './turbofileDeviceStore.js';
import { turboFileWorkbenchBridge, TurboFileWorkbenchCommand, TurboFileWorkbenchPage } from './turbofileWorkbenchBridge.js';
import { TurboFileDirectoryInflightTracker, TurboFileDirectoryLoadPurpose } from '../common/turbofileDirectoryInflight.js';
import { getTurboFileDirectoryMoveRefreshPaths, getTurboFileRowDragEffectAllowed, shouldHandleTurboFilePaneDropAtPage } from '../common/turbofileDragDrop.js';
import { getTurboFileImageGridCardSize, getTurboFileImageGridEffectiveColumns, ITurboFileImageGridCardSize } from '../common/turbofileImageGridSizing.js';
import { createTurboFileImageGridResourceOptions, createTurboFileImagePreviewResourceOptions } from '../common/turbofileImageResource.js';
import { getTurboFileTitlebarUpdateActionKind, TurboFileTitlebarUpdateActionKind } from '../common/turbofileTitlebar.js';
import { chooseDisplayTransferSpeed, getVisibleTransferStartedAt, isTurboFileRsyncStrategy, shouldStartTransferTiming, TURBOFILE_RSYNC_PROGRESS_RENDER_INTERVAL_MS, TURBOFILE_RSYNC_STARTUP_TICK_INTERVAL_MS, TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS } from '../common/turbofileTransferDisplay.js';

interface TurboFileFileItem {
	readonly name: string;
	// size/modified are mutable so a names-only (instant) remote listing can be enriched in place once
	// the lazily-fetched size + modified time for the visible rows arrives.
	size: string;
	rawSize: number;
	modified: string;
	rawModified: number;
	readonly type: TurboFileFileType;
	readonly directory?: boolean;
	readonly parent?: boolean;
	readonly path?: string;
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
}

interface TurboFileRefreshPaneOptions {
	readonly force?: boolean;
	readonly silent?: boolean;
	readonly path?: string;
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

interface TurboFileImageGridImage {
	readonly item: TurboFileFileItem;
	thumbnailContent: string;
	thumbnailUrl?: string;
	thumbnailMime: string;
	thumbnailLoading: boolean;
	thumbnailError?: string;
	previewContent: string;
	previewUrl?: string;
	previewMime: string;
	previewLoading: boolean;
	previewError?: string;
	previewImage?: HTMLImageElement;
	previewImageKey?: string;
	previewImageLoading?: Promise<HTMLImageElement>;
	previewImageLoadingKey?: string;
	width?: number;
	height?: number;
}

type TurboFileImageGridColumns = number;
type TurboFileImageGridSortKey = 'name' | 'date' | 'type' | 'size' | 'dimensions';
type TurboFileImagePreviewSamplingMode = 'smooth' | 'lossless';

interface TurboFileImageGridState {
	readonly side: 'left' | 'right';
	readonly path: string;
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

interface TurboFileFileListRange {
	readonly startIndex: number;
	readonly endIndex: number;
	readonly topSpacerHeight: number;
	readonly bottomSpacerHeight: number;
}

interface TurboFileImageGridThumbnailRequest {
	readonly state: TurboFileImageGridState;
	readonly index: number;
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
	totalBytes?: number;
	strategy?: string;
	error?: string;
	progress: number;
	progressId?: string;
	cancelRequested?: boolean;
	retryTransfer?: TurboFileTaskRetryTransfer;
	transferItems?: TurboFileTaskTransferItem[];
	activeTransferItemIndex?: number;
	speedBytesPerSecond?: number;
	remainingMs?: number;
	speedSamples?: number[];
	lastSampleAt?: number;
	lastSampleBytes?: number;
	lastProgressRenderAt?: number;
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
const PANE_DIRECTORY_CACHE_TTL_MS = 120000;
const PANE_DIRECTORY_CACHE_MAX_ENTRIES = 256;
const PANE_DIRECTORY_PREFETCH_LIMIT = 12;
const PANE_DIRECTORY_VISIBLE_PREFETCH_LIMIT = 8;
const PANE_DEVICE_SNAPSHOT_TTL_MS = 300000;
const PANE_FAST_DOUBLE_CLICK_MS = 300;
const TRANSFER_PROGRESS_RENDER_INTERVAL_MS = TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS;
const RSYNC_PROGRESS_RENDER_INTERVAL_MS = TURBOFILE_RSYNC_PROGRESS_RENDER_INTERVAL_MS;
const TRANSFER_SPEED_SAMPLE_MIN_INTERVAL_MS = 350;
const TRANSFER_SPEED_SAMPLE_MAX_COUNT = 8;
const TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY = 'turbofile.browser.fontSize';
const TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY = 'turbofile.browser.fontFamily';
const TURBOFILE_UI_FONT_SIZE_STORAGE_KEY = 'turbofile.ui.fontSize';
const TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY = 'turbofile.ui.fontFamily';
const TURBOFILE_LOCAL_WINDOWS_DEFAULT_PATH_STORAGE_KEY = 'turbofile.localWindows.defaultPath';
const TURBOFILE_LOCAL_WINDOWS_TRANSFER_PROTOCOL_STORAGE_KEY = 'turbofile.localWindows.preferredTransferProtocol';
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
const IMAGE_GRID_THUMBNAIL_SCALE_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const IMAGE_GRID_SORT_OPTIONS: readonly { readonly key: TurboFileImageGridSortKey; readonly label: string }[] = [
	{ key: 'name', label: '名称' },
	{ key: 'date', label: '修改日期' },
	{ key: 'type', label: '类型' },
	{ key: 'size', label: '大小' },
	{ key: 'dimensions', label: '尺寸' }
];
const IMAGE_GRID_SORT_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const IMAGE_GRID_COLUMN_MIN = 4;
const IMAGE_GRID_NEIGHBOR_LOAD_COUNT = 2;
const IMAGE_GRID_OVERSCAN_ROWS = 1;
const IMAGE_GRID_CARD_GAP = 16;
const IMAGE_GRID_CARD_VERTICAL_CHROME = 58;
const IMAGE_GRID_CARD_INLINE_CHROME = 16;
const IMAGE_GRID_THUMB_MIN = 96;
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
// Max images pulled in a single batched SSH read. Caps the one-shot buffer/IPC payload while still
// covering a typical visible page in one round trip.
const IMAGE_GRID_BATCH_REQUEST_LIMIT = 48;
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
	private imageGridState: TurboFileImageGridState | undefined;
	private imageGridSortKey: TurboFileImageGridSortKey = 'name';
	private imageGridSortDescending = false;
	private syncPreviewState: TurboFileSyncPreviewState | undefined;
	private dialogState: TurboFileDialogState | undefined;
	private imageGridObserver: IntersectionObserver | undefined;
	private liveTransferTicker: number | undefined;
	private imageGridScrollRenderTimer: ReturnType<typeof setTimeout> | undefined;
	private imageGridScrollRaf = 0;
	private readonly imageGridThumbnailQueue: TurboFileImageGridThumbnailRequest[] = [];
	private readonly imageGridThumbnailQueued = new Set<string>();
	private imageGridThumbnailLoadingCount = 0;
	private imageGridRenderedRange: { startIndex: number; endIndex: number; columns: number; total: number } | undefined;
	private imageGridLayoutMetrics: TurboFileImageGridLayoutMetrics | undefined;
	// Memoized scroll-body width. Measuring body.clientWidth forces a synchronous layout; reading it
	// once per card during a slice rebuild caused dozens of forced reflows per scroll frame, which
	// both janked scrolling and made the grid's scrollHeight momentarily collapse (the browser then
	// clamped scrollTop, producing the post-scroll "jump/jitter"). The body width only changes on
	// window/pane resize, so cache it and invalidate on layout() and full image-page renders.
	private imageGridBodyWidthCache: number | undefined;
	private imageGridPreviewRequestSeq = 0;
	private imageGridPreviewPrefetchTimer: ReturnType<typeof setTimeout> | undefined;
	private readonly imageGridLoadedThumbnailIndexes = new Set<number>();
	private readonly imageGridLoadedPreviewIndexes = new Set<number>();
	private imageGridCtrlWheelDeltaRemainder = 0;
	private imagePreviewAnalysis: TurboFileImagePreviewAnalysis | undefined;
	private imagePreviewRender: TurboFileImagePreviewRender | undefined;
	private imagePreviewRenderSeq = 0;
	private imagePreviewResizeObserver: ResizeObserver | undefined;
	private readonly imageReadCache = new Map<string, TurboFileCachedImageReadResult>();
	private readonly fileListScrollRaf: Record<'left' | 'right', number> = { left: 0, right: 0 };
	private readonly fileListRestoreRaf: Record<'left' | 'right', number> = { left: 0, right: 0 };
	private readonly fileListRenderedRange: Record<'left' | 'right', { startIndex: number; endIndex: number; total: number } | undefined> = { left: undefined, right: undefined };
	// Lazy size/date enrichment of names-only remote listings: serialize per side and remember if more
	// rows scrolled into view while a batch was in flight so they get picked up right after.
	private readonly remoteEnrichInFlight: Record<'left' | 'right', boolean> = { left: false, right: false };
	private readonly remoteEnrichAgain: Record<'left' | 'right', boolean> = { left: false, right: false };
	private readonly paneDirectoryCache = new Map<string, TurboFileDirectoryCacheEntry>();
	private readonly paneDirectoryInflight = new TurboFileDirectoryInflightTracker<TurboFileDirectoryCacheEntry>();
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
	private terminalPanelVisibilityInProgress = false;
	private terminalPanelVisibilityChangeDepth = 0;
	private terminalPanelVisibilityResetHandle: number | undefined;
	private pendingAppearanceMode: 'light' | 'dark' | undefined;
	private appearanceTransitionTimer: number | undefined;
	private externalDropTargetSide: 'left' | 'right' | undefined;
	private currentFileDragSide: 'left' | 'right' | undefined;
	private hasStartedNativeWindowsDrag = false;
	private maximizedPane: 'left' | 'right' | undefined;
	private internalTransferClipboard: TurboFileInternalTransferClipboard | undefined;
	private inlineRename: TurboFileInlineRenameState | undefined;
	private readonly windowsClipboardPasteInFlight = new Set<string>();
	private availableWindowsDriveRoots: string[] = [];
	private statusMessage = '极速传已启动：双栏浏览、设备管理、传输、预览和终端入口已接入。';
	private taskSequence = 1;
	private readonly tasks: TurboFileTask[] = [];
	private editorGroupContainer: HTMLElement | undefined;
	private currentInput: TurboFileEditorInput | undefined;
	private isEditorVisible = false;
	private aboutDialogElement: HTMLElement | undefined;
	private remoteDocumentLabelFormatterRegistered = false;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchThemeService private readonly workbenchThemeService: IWorkbenchThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ITurboFileSshService private readonly sshService: ITurboFileSshService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextViewService private readonly contextViewService: IContextViewService,
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
				viewportHeight: 0
			},
			right: {
				deviceId: LOCAL_WINDOWS_DEVICE_ID,
				path: localWindowsDefaultPath,
				items: [],
				loading: false,
				selectedPaths: new Set(),
				scrollTop: 0,
				viewportHeight: 0
			}
		};
	}

	protected createEditor(parent: HTMLElement): void {
		this.editorGroupContainer = parent.closest('.editor-group-container') as HTMLElement | undefined;
		this.editorGroupContainer?.classList.add('turbofile-main-editor-group');
		this.container = $('.turbofile-workbench');
		parent.appendChild(this.container);
		this.deviceStore = this.instantiationService.createInstance(TurboFileDeviceStore);
		this.devices = this.deviceStore.loadDevices();
		void this.ensureDefaultSshDevices();
		void this.ensureTurboFileChrome();
		this.ensureRemoteFileSystemProvider();
		this._register(turboFileWorkbenchBridge.onDidRunCommand(command => this.handleWorkbenchCommand(command)));
		this._register(this.terminalService.onDidDisposeInstance(instance => this.clearTerminalBindingForInstance(instance.instanceId)));
		this._register(this.layoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.PANEL_PART && !event.visible && !this.terminalRevealInProgress && !this.terminalPanelVisibilityInProgress) {
				this.rememberTerminalPanelHiddenForCurrentPage();
				this.restoreTaskbarAfterTerminal();
			}
		}));
		this._register(this.workbenchThemeService.onDidColorThemeChange(() => {
			this.applyTurboFileThemeState();
			this.ensureTitlebarChrome();
			if (this.activePage === 'themes') {
				this.render();
			}
		}));
		this._register(this.updateService.onStateChange(() => this.ensureTitlebarAppMenu()));
		void this.syncNativeEditorDisplaySettings();
		void this.loadColorThemes();
		void this.refreshWindowsDriveRoots();
		this.ensureTitlebarChrome();
		this.ensurePaneDeviceSelection({ preferFirstSshOnRight: true });
		this.render();
		void this.refreshPane('left');
		void this.refreshPane('right');
		void this.prefetchDefaultDeviceDirectories();
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
		this.ensurePaneDeviceSelection({ preferFirstSshOnRight: result.added > 0 });
		this.statusMessage = result.removed
			? `已清理内置 SSH 设备 ${result.removed} 台。`
			: `已加载默认 SSH 设备：新增 ${result.added} 台，更新 ${result.updated} 台。`;
		this.render();
		void this.refreshPane('left');
		void this.refreshPane('right');
		void this.prefetchDefaultDeviceDirectories();
	}

	override async setInput(input: TurboFileEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.currentInput = input;
		input.setCancelRunningTasksForClose(() => this.cancelRunningTasksForClose());
		this.updateInputRunningTaskCount();
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested) {
			void this.syncActiveTerminalForCurrentPage();
			this.notifyActivePageChanged();
			this.render();
		}
	}

	override layout(_dimension: Dimension, _position?: IDomPosition): void {
		// CSS grid owns the fast-transfer two-pane layout.
		// The image-grid body width is derived from the viewport, so drop its cache on resize.
		this.invalidateImageGridBodyWidthCache();
		this.imageGridLayoutMetrics = undefined;
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		this.isEditorVisible = visible;
		document.body.classList.toggle('turbofile-main-editor-visible', visible);
		this.updateTransferTabsVisibility();
		if (visible) {
			void this.syncActiveTerminalForCurrentPage();
			this.applyTurboFileThemeState();
			this.ensureTitlebarChrome();
		}
	}

	override focus(): void {
		this.container?.focus();
	}

	override dispose(): void {
		document.body.classList.remove('turbofile-main-editor-visible');
		document.body.classList.remove('turbofile-transfer-tabs-visible');
		document.body.classList.remove('turbofile-editor-theme-light', 'turbofile-editor-theme-dark', 'turbofile-theme-switching');
		if (this.appearanceTransitionTimer !== undefined) {
			getWindow(this.container).clearTimeout(this.appearanceTransitionTimer);
			this.appearanceTransitionTimer = undefined;
		}
		if (this.terminalPanelVisibilityResetHandle !== undefined) {
			getWindow(this.container).clearTimeout(this.terminalPanelVisibilityResetHandle);
			this.terminalPanelVisibilityResetHandle = undefined;
		}
		this.editorGroupContainer?.classList.remove('turbofile-main-editor-group');
		this.closeAboutDialog();
		this.removeTitlebarAppMenu();
		this.removeTitlebarThemeToggle();
		this.clearLiveTransferTicker();
		this.clearFileListScrollRaf('left');
		this.clearFileListScrollRaf('right');
		this.clearFileListRestoreRaf('left');
		this.clearFileListRestoreRaf('right');
		this.releaseImageGridStateImages(this.imageGridState);
		this.disposeImageGridObserver();
		this.clearImageGridScrollTimer();
		this.clearImageGridScrollRaf();
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		this.clearImageGridLoadedImageIndexes();
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.imageGridRenderedRange = undefined;
		super.dispose();
	}

	private render(): void {
		if (!this.container) {
			return;
		}
		if (this.shouldDeferRenderForOpenDeviceSelect()) {
			this.pendingRenderAfterDeviceSelectClose = true;
			return;
		}

		this.pendingRenderAfterDeviceSelectClose = false;
		this.renderDisposables.clear();
		clearNode(this.container);
		this.ensurePaneDeviceSelection();
		this.applyBrowserAppearanceSettings();
		this.applyTurboFileThemeState();
		void this.renderLegacyImageGridOverlay;

		const shell = $('.turbofile-editor-shell');
		const content = $('.turbofile-editor-content');
		content.appendChild(this.renderActivePage());
		shell.appendChild(content);
		this.container.appendChild(shell);
		this.registerWorkbenchKeyboardShortcuts();
		this.ensureTitlebarChrome();

		if (this.imageGridState?.previewVisible) {
			this.container.appendChild(this.renderImagePreviewOverlay());
		}
		if (this.syncPreviewState) {
			this.container.appendChild(this.renderSyncPreviewOverlay());
		}
		if (this.isTaskLogVisible) {
			this.container.appendChild(this.renderTaskLogOverlay());
		}
		if (this.isDeviceFormVisible) {
			this.container.appendChild(this.renderDeviceForm());
		}
		if (this.dialogState) {
			this.container.appendChild(this.renderDialogOverlay());
		}
		this.bindImageGridObserver();
	}

	private renderActivePage(): HTMLElement {
		if (this.activePage === 'devices') {
			return this.renderDevicesPage();
		}
		if (this.activePage === 'settings') {
			return this.renderSettingsPage();
		}
		if (this.activePage === 'themes') {
			return this.renderThemesPage();
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

	private handleWorkbenchKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented) {
			return;
		}

		if (this.handleImageGridKeyboardShortcut(event)) {
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

	private handleImageGridKeyboardShortcut(event: KeyboardEvent): boolean {
		const state = this.imageGridState;
		if (this.activePage !== 'images' || !state || this.dialogState || this.isDeviceFormVisible || this.isTaskLogVisible) {
			return false;
		}

		const target = event.target;
		if (!this.isKeyboardEventFromTurboFileSurface(target) || this.isEditableKeyboardTarget(target)) {
			return false;
		}

		const targetElement = target instanceof HTMLElement ? target : undefined;
		if (targetElement?.closest('.turbofile-dialog, .turbofile-device-form, .turbofile-image-page-sort.is-open, .turbofile-image-page-scale.is-open')) {
			return false;
		}

		if ((event.key === 'Delete' || event.code === 'Delete') && !event.ctrlKey && !event.metaKey && !event.altKey) {
			event.preventDefault();
			void this.deleteSelectedImageGridItems();
			return true;
		}

		if (!state.previewVisible && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			this.selectAllImageGridItems();
			return true;
		}

		return false;
	}

	private getDeleteKeyboardTargetSide(event: KeyboardEvent): 'left' | 'right' | undefined {
		if (this.activePage !== 'transfer' || this.dialogState || this.imageGridState?.previewVisible || this.isDeviceFormVisible || this.isTaskLogVisible) {
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
		if (!this.container) {
			return false;
		}

		if (target instanceof Node && this.container.contains(target)) {
			return true;
		}

		const ownerDocument = this.container.ownerDocument;
		return target === ownerDocument.body || target === ownerDocument.documentElement;
	}

	private getPaneSideFromElement(element: HTMLElement | undefined): 'left' | 'right' | undefined {
		const side = element?.closest<HTMLElement>('.turbofile-pane[data-turbofile-side]')?.dataset.turbofileSide;
		return side === 'left' || side === 'right' ? side : undefined;
	}

	private setActiveFilePaneSide(side: 'left' | 'right'): void {
		this.activeFilePaneSide = side;
	}

	/**
	 * Resets the drag-state flags after an internal pane drag finishes (drop or dragend) or after
	 * we've handed control over to the Windows native drag pipeline. Safe to call multiple times.
	 */
	private clearCurrentFileDragState(): void {
		this.currentFileDragSide = undefined;
		this.hasStartedNativeWindowsDrag = false;
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
		getWindow(this.container).setTimeout(action, 0);
	}

	private clearInternalDropTargetHighlight(): void {
		for (const row of this.container?.querySelectorAll<HTMLElement>('.turbofile-file-row.is-internal-drop-target') ?? []) {
			row.classList.remove('is-internal-drop-target');
		}
	}

	/**
	 * dragstart handler for a file-list row. Marks the drag as TurboFile-originated (so internal
	 * drop handlers can detect it via the side data) and remembers the source side so a later
	 * dragleave from the window can hand off to the Windows native drag pipeline. Same-pane folder
	 * row drops move items, while pane-to-pane and external drops keep the existing copy behavior.
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
		this.currentFileDragSide = side;
		this.hasStartedNativeWindowsDrag = false;

		event.dataTransfer.effectAllowed = getTurboFileRowDragEffectAllowed();
		event.dataTransfer.setData('application/x-turbofile-side', side);
		event.dataTransfer.setData('application/x-turbofile-operation', 'copy');

		const items = this.getSelectedTransferItems(side);
		const labels = items.length ? items.map(i => i.name) : [item.name];
		event.dataTransfer.setData('text/plain', labels.join('\n'));

		// Keep the browser drag alive for pane-to-pane drops. If the pointer leaves the window,
		// dragleave/drag will hand local Windows files to the native drag pipeline.
		this.tryStartImmediateLocalWindowsDrag(side, event);
	}

	private tryStartImmediateLocalWindowsDrag(side: 'left' | 'right', event: DragEvent): void {
		if (!event.altKey) {
			return;
		}
		const device = this.getPaneDevice(side);
		if (device?.id !== LOCAL_WINDOWS_DEVICE_ID) {
			return;
		}

		const dragItems: ITurboFileWindowsDragItem[] = this.getSelectedTransferItems(side)
			.filter((candidate): candidate is TurboFileFileItem & { path: string } => !!candidate.path && !candidate.parent)
			.map(candidate => ({
				sourcePath: candidate.path,
				name: candidate.name,
				type: candidate.type,
				size: candidate.directory ? undefined : candidate.rawSize
			}));
		if (!dragItems.length) {
			return;
		}

		event.preventDefault();
		this.hasStartedNativeWindowsDrag = true;
		void this.sshService.startWindowsFileDrag({
			source: {
				kind: 'local',
				path: this.paneStates[side].path,
				label: device.name
			},
			items: dragItems
		}).then(result => {
			if (!result.ok) {
				this.statusMessage = `拖出到 Windows 失败：${result.message}`;
				this.render();
			}
		}).catch(error => {
			const message = error instanceof Error ? error.message : String(error);
			this.statusMessage = `拖出到 Windows 失败：${message}`;
			this.render();
		});
	}

	/**
	 * Called when the user drags a TurboFile file-row out of the window. Local files are handed to
	 * Windows directly; remote files first capture Explorer/Desktop's real drop directory through
	 * the native CopyHook helper, then use the normal transfer pipeline to download there.
	 */
	private async startWindowsFileDragFromPane(side: 'left' | 'right'): Promise<void> {
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}

		if (device.id !== LOCAL_WINDOWS_DEVICE_ID) {
			try {
				const sourceItems = this.getSelectedTransferItems(side)
					.filter((candidate): candidate is TurboFileFileItem & { path: string } => !!candidate.path && !candidate.parent);
				const dragItems: ITurboFileWindowsDragItem[] = sourceItems
					.map(candidate => ({
						sourcePath: candidate.path,
						name: candidate.name,
						type: candidate.type,
						size: candidate.directory ? undefined : candidate.rawSize
					}));
				if (!dragItems.length) {
					return;
				}
				this.statusMessage = '拖到 Windows 后将开始下载...';
				this.render();
				const result = await this.sshService.startWindowsFileDrag({
					source: await this.toTransferEndpoint(device, this.paneStates[side].path),
					items: dragItems
				});
				if (!result.ok) {
					this.statusMessage = result.canceled ? '已取消拖到 Windows。' : `拖到 Windows 失败：${result.message}`;
					this.render();
					return;
				}
				if (!result.targetDirectory) {
					this.statusMessage = '拖到 Windows 失败：没有捕获到目标目录。';
					this.render();
					return;
				}
				await this.transferItemsToWindowsDirectory(side, device, sourceItems, result.targetDirectory, Date.now());
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.statusMessage = `拖到 Windows 失败：${message}`;
				this.render();
			}
			return;
		}

		// Defensive fallback for a local drag that didn't start natively at dragstart: start the
		// native drag now with the real Windows paths (no staging, no transfer task).
		try {
			const dragItems: ITurboFileWindowsDragItem[] = this.getSelectedTransferItems(side)
				.filter((candidate): candidate is TurboFileFileItem & { path: string } => !!candidate.path && !candidate.parent)
				.map(candidate => ({
					sourcePath: candidate.path,
					name: candidate.name,
					type: candidate.type,
					size: candidate.directory ? undefined : candidate.rawSize
				}));
			if (!dragItems.length) {
				return;
			}
			const result = await this.sshService.startWindowsFileDrag({
				source: { kind: 'local', path: this.paneStates[side].path, label: device.name },
				items: dragItems
			});
			if (!result.ok) {
				this.statusMessage = `拖出到 Windows 失败：${result.message}`;
				this.render();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.statusMessage = `拖出到 Windows 失败：${message}`;
			this.render();
		}
	}

	private maybeStartWindowsFileDragFromPointer(side: 'left' | 'right', event: DragEvent): void {
		if (this.currentFileDragSide !== side || this.hasStartedNativeWindowsDrag) {
			return;
		}

		if (event.clientX === 0 && event.clientY === 0 && event.screenX === 0 && event.screenY === 0) {
			return;
		}

		const ownerWindow = getWindow(this.container);
		const outsideWindow = event.clientX <= 0
			|| event.clientY <= 0
			|| event.clientX >= ownerWindow.innerWidth - 1
			|| event.clientY >= ownerWindow.innerHeight - 1;
		if (!outsideWindow) {
			return;
		}

		this.hasStartedNativeWindowsDrag = true;
		void this.startWindowsFileDragFromPane(side);
	}

	private renderTransferPage(): HTMLElement {
		const page = $('.turbofile-transfer-page');
		this.registerTransferPageDragAndDrop(page);
		const hasLiveTransfer = this.tasks.some(task => task.kind === 'transfer' && task.status === 'running');
		if (hasLiveTransfer) {
			page.classList.add('has-live-transfer');
		}
		const taskbarHidden = this.isTaskbarHiddenForTerminal();
		if (taskbarHidden) {
			page.classList.add('is-terminal-focused');
		}
		if (this.maximizedPane) {
			page.classList.add('is-pane-maximized');
			page.dataset.maximizedPane = this.maximizedPane;
		}
		const main = $('.turbofile-main');
		main.appendChild(this.renderPane('left'));
		main.appendChild(this.renderPane('right'));
		page.appendChild(main);
		if (!taskbarHidden) {
			page.appendChild(this.renderTaskbar());
		}
		return page;
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

		const targetSide = this.getTransferDropTargetSide(event);
		const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.currentFileDragSide;
		if (!shouldHandleTurboFilePaneDropAtPage(sourceSide, targetSide)) {
			this.setExternalDropTargetSide(undefined);
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
		this.setExternalDropTargetSide(this.hasExternalDropData(event) ? targetSide : undefined);
	}

	private handleTransferPageDrop(event: DragEvent): void {
		if (!this.isTransferPageFileDrag(event)) {
			return;
		}

		const initiatedAt = Date.now();
		const targetSide = this.getTransferDropTargetSide(event);
		const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.currentFileDragSide;
		if (!shouldHandleTurboFilePaneDropAtPage(sourceSide, targetSide)) {
			this.setExternalDropTargetSide(undefined);
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.setExternalDropTargetSide(undefined);
		if (sourceSide) {
			if (sourceSide !== targetSide) {
				void this.transferSelected(sourceSide, targetSide, initiatedAt);
			}
			this.clearCurrentFileDragState();
			return;
		}

		const externalPaths = this.extractExternalDropPaths(event);
		if (externalPaths.length) {
			void this.transferExternalPaths(targetSide, externalPaths, 'copy', initiatedAt);
		}
		this.clearCurrentFileDragState();
	}

	private handleTransferPageDragLeave(event: DragEvent): void {
		const relatedTarget = event.relatedTarget;
		if (relatedTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
			return;
		}

		this.setExternalDropTargetSide(undefined);
		if (this.currentFileDragSide && !this.hasStartedNativeWindowsDrag) {
			this.hasStartedNativeWindowsDrag = true;
			void this.startWindowsFileDragFromPane(this.currentFileDragSide);
		}
	}

	private isTransferPageFileDrag(event: DragEvent): boolean {
		return !!this.getTurboFileDragSourceSide(event) || this.hasExternalDropData(event);
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
		const page = $('.turbofile-full-page');
		page.appendChild(this.renderPageHeader(Codicon.server, '设备管理', '管理已保存的 SSH 设备，可在这里编辑、删除和测试连接。', [
			this.createPageButton(Codicon.refresh, '刷新设备', () => {
				this.devices = this.deviceStore?.loadDevices() ?? [];
				this.ensurePaneDeviceSelection();
				this.statusMessage = `设备列表已刷新：${this.devices.length} 台 SSH 设备。`;
				this.render();
			}),
			this.createPageButton(Codicon.add, '添加 SSH 设备', () => this.showAddDeviceForm())
		]));

		const grid = $('.turbofile-device-page-grid');
		for (const device of this.getAllDevices()) {
			grid.appendChild(this.renderDevicePageCard(device));
		}
		page.appendChild(grid);
		return page;
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
		if (updateActionKind !== 'hidden') {
			menu.appendChild(this.createTitlebarUpdateButton(updateActionKind));
		}
		menu.appendChild(this.createTitlebarMenuButton('设置', button => this.showTitlebarMenu(button, '设置', [])));
		menu.appendChild(this.createTitlebarMenuButton('视图', button => this.showTitlebarMenu(button, '视图', [])));
		menu.appendChild(this.createTitlebarMenuButton('帮助', button => this.showTitlebarMenu(button, '帮助', [
			toAction({ id: 'turbofile.help.about', label: '关于极速传', enabled: true, run: () => this.showAboutDialog() })
		])));
		return menu;
	}

	private createTitlebarUpdateButton(kind: TurboFileTitlebarUpdateActionKind): HTMLButtonElement {
		const button = $('button.turbofile-titlebar-update-button') as HTMLButtonElement;
		button.type = 'button';
		const title = kind === 'download' ? '下载更新' : kind === 'install' ? '安装更新' : '重启以更新';
		button.title = title;
		button.setAttribute('aria-label', title);
		button.appendChild(renderIcon(Codicon.cloudDownload));
		button.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			void this.runTitlebarUpdateAction(kind);
		});
		return button;
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

	private renderAppearanceFontSettingsCard(): HTMLElement {
		const card = $('.turbofile-appearance-card.turbofile-appearance-font-card');
		const header = $('.turbofile-appearance-card-header');
		const copy = $('.turbofile-appearance-card-copy');
		const title = $('h2');
		title.textContent = '字体';
		const description = $('p');
		description.textContent = '调整极速传界面和文件浏览区的显示字体。';
		copy.appendChild(title);
		copy.appendChild(description);
		header.appendChild(copy);
		card.appendChild(header);

		const rows = $('.turbofile-appearance-font-summary');
		rows.appendChild(this.renderEditorFontSizeSetting());
		rows.appendChild(this.renderUiFontSizeSetting());
		rows.appendChild(this.renderUiFontFamilySetting());
		rows.appendChild(this.renderBrowserFontSizeSetting());
		rows.appendChild(this.renderBrowserFontFamilySetting());
		card.appendChild(rows);
		return card;
	}

	private renderEditorFontSizeSetting(): HTMLElement {
		return this.renderFontSizeSetting('文档字体大小', '调整当前打开文档的字号，修改后立即生效。', 'editor.fontSize', this.getEditorFontSize(), 8, 40, value => this.updateEditorFontSize(value));
	}

	private renderUiFontSizeSetting(): HTMLElement {
		return this.renderFontSizeSetting('UI 字号', '统一调整极速传界面的字体大小，不影响 VS Code 原生文档编辑器。', 'turbofile-ui-font-size', this.getUiFontSize(), 11, 24, value => this.updateUiFontSize(value));
	}

	private renderBrowserFontSizeSetting(): HTMLElement {
		return this.renderFontSizeSetting('文件浏览区字体大小', '只控制左右文件浏览区域，修改后立即生效。', 'turbofile-browser-font-size', this.getBrowserFontSize(), 11, 20, value => this.updateBrowserFontSize(value));
	}

	private renderUiFontFamilySetting(): HTMLElement {
		return this.renderFontFamilySetting('UI 字体', '选择极速传界面使用的字体。', 'turbofile-ui-font-family', this.getUiFontFamily(), TURBOFILE_UI_FONT_FAMILIES, value => this.updateUiFontFamily(value));
	}

	private renderBrowserFontFamilySetting(): HTMLElement {
		return this.renderFontFamilySetting('文件浏览区字体', '选择文件名、大小和时间的显示字体。', 'turbofile-browser-font-family', this.getBrowserFontFamily(), TURBOFILE_BROWSER_FONT_FAMILIES, value => this.updateBrowserFontFamily(value));
	}

	private renderFontSizeSetting(labelText: string, descriptionText: string, id: string, currentFontSize: number, min: number, max: number, update: (value: number) => void): HTMLElement {
		const row = $('.turbofile-editor-setting-row.turbofile-appearance-wide-setting');
		const copy = $('.turbofile-editor-setting-copy');
		const label = $('label') as HTMLLabelElement;
		label.textContent = labelText;
		label.htmlFor = id;
		const description = $('span');
		description.textContent = descriptionText;
		copy.appendChild(label);
		copy.appendChild(description);

		const controls = $('.turbofile-editor-setting-controls');
		const input = $('input.turbofile-editor-font-size-input') as HTMLInputElement;
		input.id = id;
		input.type = 'number';
		input.min = String(min);
		input.max = String(max);
		input.step = '1';
		input.value = String(currentFontSize);
		input.addEventListener('change', () => update(input.valueAsNumber));
		input.addEventListener('keydown', event => {
			if (event.key === 'Enter') {
				event.preventDefault();
				update(input.valueAsNumber);
			}
		});
		controls.appendChild(input);

		row.appendChild(copy);
		row.appendChild(controls);
		return row;
	}

	private renderFontFamilySetting(labelText: string, descriptionText: string, id: string, currentFontFamily: string, options: readonly (readonly [string, string])[], update: (value: string) => void): HTMLElement {
		const row = $('.turbofile-editor-setting-row.turbofile-appearance-wide-setting');
		const copy = $('.turbofile-editor-setting-copy');
		const label = $('label') as HTMLLabelElement;
		label.textContent = labelText;
		label.htmlFor = id;
		const description = $('span');
		description.textContent = descriptionText;
		copy.appendChild(label);
		copy.appendChild(description);

		const controls = $('.turbofile-editor-setting-controls');
		const select = $('select.turbofile-browser-select') as HTMLSelectElement;
		select.id = id;
		for (const [value, optionLabel] of options) {
			const option = $('option') as HTMLOptionElement;
			option.value = value;
			option.textContent = optionLabel;
			option.selected = value === currentFontFamily;
			select.appendChild(option);
		}
		select.addEventListener('change', () => update(select.value));
		controls.appendChild(select);

		row.appendChild(copy);
		row.appendChild(controls);
		return row;
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

	private renderThemesPage(): HTMLElement {
		const page = $('.turbofile-full-page.turbofile-appearance-page');
		const shell = $('.turbofile-appearance-shell');
		const title = $('h1.turbofile-appearance-title');
		title.textContent = '外观';
		shell.appendChild(title);
		shell.appendChild(this.renderAppearanceFontSettingsCard());
		page.appendChild(shell);
		return page;
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
			if (this.activePage === 'themes') {
				this.render();
			}
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
		const page = $('.turbofile-full-page');
		const stats = this.getTaskStats();
		page.appendChild(this.renderPageHeader(Codicon.history, '任务日志', '查看传输、删除、压缩、解压、终端和同步任务的执行记录。', [
			this.createPageButton(Codicon.trash, '清空已完成', () => this.clearFinishedTasks()),
			this.createPageButton(Codicon.remoteExplorer, '返回传输页', () => this.setActivePage('transfer'), true)
		]));

		const summary = $('.turbofile-task-summary-grid');
		summary.appendChild(this.renderSummaryCard('运行中', String(stats.running), Codicon.sync));
		summary.appendChild(this.renderSummaryCard('成功', String(stats.success), Codicon.pass));
		summary.appendChild(this.renderSummaryCard('失败', String(stats.error), Codicon.error));
		summary.appendChild(this.renderSummaryCard('取消', String(stats.canceled), Codicon.circleSlash));
		page.appendChild(summary);

		const list = $('.turbofile-task-log-list.is-page-list');
		if (!this.tasks.length) {
			const empty = $('.turbofile-task-log-empty');
			empty.textContent = '暂无任务记录';
			list.appendChild(empty);
		} else {
			for (const task of this.tasks) {
				list.appendChild(this.renderTaskRow(task));
			}
		}
		page.appendChild(list);
		return page;
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

	private renderSummaryCard(label: string, value: string, icon: ThemeIcon): HTMLElement {
		const card = $('.turbofile-page-card.turbofile-summary-card');
		const top = $('.turbofile-summary-card-top');
		top.append(label);
		top.appendChild(renderIcon(icon));
		const number = $('strong');
		number.textContent = value;
		card.appendChild(top);
		card.appendChild(number);
		return card;
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
		if (page !== 'images' && this.activePage === 'images') {
			this.releaseImageGridStateImages(this.imageGridState);
			this.imageGridState = undefined;
			this.disposeImageGridObserver();
			this.clearImageGridScrollTimer();
			this.clearImageGridScrollRaf();
			this.clearImageGridThumbnailQueue();
			this.clearImageGridPreviewPrefetchTimer();
			this.clearImageGridLoadedImageIndexes();
			this.imagePreviewAnalysis = undefined;
			this.clearImagePreviewRender();
			this.imageGridRenderedRange = undefined;
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
		document.body.classList.toggle('turbofile-transfer-tabs-visible', this.isEditorVisible && this.activePage === 'transfer');
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
			this.devices = this.deviceStore.loadDevices();
			this.ensurePaneDeviceSelection();
			this.statusMessage = `设备列表已刷新：${this.devices.length} 台 SSH 设备。`;
			this.render();
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
			void this.refreshPane(targetSide);
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
		const browserTitle = side === 'left' ? '左侧文件浏览' : '右侧文件浏览';

		const header = $('.turbofile-pane-header');
		header.appendChild(this.renderDeviceSelect(side, device));

		const browserHeader = $('.turbofile-browser-header');
		const toolbar = $('.turbofile-browser-toolbar');
		const toolbarTitle = $('.turbofile-browser-toolbar-title');
		toolbarTitle.appendChild(renderTurboFileIcon(side === 'left' ? 'files' : 'folder-check', side === 'left' ? 'info' : 'success'));
		toolbarTitle.append(browserTitle);
		const itemCount = $('.turbofile-browser-item-count');
		this.updatePaneItemCountElement(side, itemCount);
		toolbarTitle.appendChild(itemCount);
		toolbar.appendChild(toolbarTitle);
		const toolbarAccent: TurboFileIconColor = side === 'left' ? 'primary' : 'success';
		const gridAccent: TurboFileIconColor = side === 'left' ? 'info' : 'success';
		this.appendToolbarButton(toolbar, Codicon.refresh, '刷新', () => this.refreshPane(side, { force: true }), 'arrow-clockwise', toolbarAccent);
		this.appendToolbarButton(toolbar, Codicon.search, '搜索', () => this.searchInPane(side), 'search', toolbarAccent);
		this.appendToolbarButton(toolbar, Codicon.trash, '删除选中项', () => this.deleteSelected(side), 'trash', 'danger');
		this.appendToolbarButton(toolbar, Codicon.copy, '复制当前路径', () => { void this.copyPanePath(side); }, 'files', 'secondary');
		this.appendToolbarButton(toolbar, Codicon.fileMedia, '展开图片', () => this.openImageGrid(side), 'grid-3x3-gap', gridAccent);
		this.appendToolbarButton(toolbar, Codicon.terminal, '打开终端', () => this.openTerminal(side), 'terminal', toolbarAccent);
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
				const key = event.key.toLowerCase();
				if (key === 'a') {
					event.preventDefault();
					this.setActiveFilePaneSide(side);
					this.selectAllPaneItems(side);
					return;
				}
				if (key === 'c' || key === 'x') {
					event.preventDefault();
					this.setActiveFilePaneSide(side);
					this.copySelectedToInternalClipboard(side, key === 'x' ? 'move' : 'copy');
					return;
				}
			}
		});
		list.addEventListener('paste', event => {
			event.preventDefault();
			void this.pasteIntoPane(side);
		});
		list.addEventListener('dragover', event => {
			const sourceSide = event.dataTransfer?.getData('application/x-turbofile-side') as 'left' | 'right' | '';
			if (sourceSide && sourceSide !== side) {
				event.preventDefault();
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = 'copy';
				}
				this.setExternalDropTargetSide(undefined);
				return;
			}

			if (this.hasExternalDropData(event)) {
				event.preventDefault();
				if (event.dataTransfer) {
					event.dataTransfer.dropEffect = 'copy';
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
			event.preventDefault();
			this.setExternalDropTargetSide(undefined);
			const sourceSide = event.dataTransfer?.getData('application/x-turbofile-side') as 'left' | 'right' | '';
			if (sourceSide && sourceSide !== side) {
				this.deferAfterDrag(() => void this.transferSelected(sourceSide, side, initiatedAt));
				return;
			}

			// Read the external paths synchronously (the dataTransfer is only valid inside the handler),
			// then defer the transfer so the drag image is cleared before the list re-renders.
			const externalPaths = this.extractExternalDropPaths(event);
			if (externalPaths.length) {
				this.deferAfterDrag(() => void this.transferExternalPaths(side, externalPaths, 'copy', initiatedAt));
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
		button.setAttribute('aria-haspopup', 'listbox');
		button.setAttribute('aria-expanded', String(isOpen));
		button.setAttribute('aria-label', `${this.getSideLabel(side)}设备选择`);
		button.appendChild(this.renderDeviceSelectIcon(currentDevice));
		button.appendChild($('span.turbofile-device-select-label', undefined, currentDevice ? this.getDeviceDisplayLabel(currentDevice) : 'Windows'));
		button.appendChild(renderIcon(Codicon.chevronDown));

		menu.setAttribute('role', 'listbox');
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
		const cached = this.getCachedPaneDirectory(device, path);
		state.path = path;
		state.error = undefined;
		state.loading = true;
		this.resetPaneScroll(side);
		this.clearPaneSelection(side);
		if (cached) {
			this.applyPaneDirectoryEntry(side, device, cached);
			this.render();
			return;
		}

		state.items = [];
		this.render();
		try {
			const listing = await this.loadPaneDirectory(device, path, false);
			if (this.paneRequestSeq[side] !== requestId || this.paneStates[side].path !== path) {
				return;
			}
			this.applyPaneDirectoryEntry(side, device, listing);
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
			}
		}
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
		if (state.loading && state.items.length === 0) {
			this.fileListRenderedRange[side] = undefined;
			const row = $('.turbofile-file-row');
			const name = $('.turbofile-file-name');
			name.textContent = '正在加载目录...';
			row.appendChild(name);
			row.appendChild($('.turbofile-file-meta'));
			row.appendChild($('.turbofile-file-meta'));
			list.appendChild(row);
			return;
		}

		const range = this.getFileListRange(state);
		this.renderFileListSlice(side, list, range);
		list.scrollTop = state.scrollTop;
		this.restoreRenderedFileListScroll(side, list);
		this.scheduleEnrichVisibleRemoteRows(side);
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
			if (!item.path || item.parent || !item.directory) {
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

		const viewportHeight = state.viewportHeight > 0 ? state.viewportHeight : FILE_LIST_DEFAULT_VIEWPORT_HEIGHT;
		const firstVisibleRow = Math.max(0, Math.floor(state.scrollTop / FILE_LIST_ROW_HEIGHT));
		const startIndex = Math.max(0, firstVisibleRow - FILE_LIST_OVERSCAN_ROWS);
		const visibleRows = Math.ceil(viewportHeight / FILE_LIST_ROW_HEIGHT) + FILE_LIST_OVERSCAN_ROWS * 2;
		const endIndex = Math.min(total, startIndex + visibleRows);
		return {
			startIndex,
			endIndex,
			topSpacerHeight: startIndex * FILE_LIST_ROW_HEIGHT,
			bottomSpacerHeight: Math.max(0, (total - endIndex) * FILE_LIST_ROW_HEIGHT)
		};
	}

	private clampFileListScrollTop(side: 'left' | 'right'): void {
		const state = this.paneStates[side];
		const viewportHeight = state.viewportHeight > 0 ? state.viewportHeight : FILE_LIST_DEFAULT_VIEWPORT_HEIGHT;
		const totalHeight = this.getVisibleFileItems(state).length * FILE_LIST_ROW_HEIGHT;
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
		this.scheduleEnrichVisibleRemoteRows(side);
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
	 * Kicks off lazy size/date enrichment for the rows currently in view after a names-only remote
	 * listing. Serialized per side; if more rows scroll in while a batch is running, it re-runs once.
	 */
	private scheduleEnrichVisibleRemoteRows(side: 'left' | 'right'): void {
		const device = this.getPaneDevice(side);
		if (!device || device.id === LOCAL_WINDOWS_DEVICE_ID) {
			return;
		}
		if (!this.paneStates[side].items.some(item => item.attrsPending)) {
			return;
		}
		if (this.remoteEnrichInFlight[side]) {
			this.remoteEnrichAgain[side] = true;
			return;
		}
		void this.enrichVisibleRemoteRows(side);
	}

	private async enrichVisibleRemoteRows(side: 'left' | 'right'): Promise<void> {
		const device = this.getPaneDevice(side);
		if (!device || device.id === LOCAL_WINDOWS_DEVICE_ID) {
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

		this.remoteEnrichInFlight[side] = true;
		try {
			const options = await this.getSshConnectionOptions(device);
			const stats = await this.sshService.statRemoteEntries(options, path, pending.map(item => item.name));
			if (this.paneStates[side].path !== path || this.getPaneDevice(side)?.id !== device.id) {
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
				// Update only the visible rows in place — never this.render(). A full render rebuilds the
				// scroll-container element, which mid-drag destroys the element the browser is tracking and
				// drops the scrollbar drag (the thumb jumps back and you must re-grab). Re-rendering just
				// the slice on the existing list element keeps scrollTop/scrollHeight and the drag intact.
				this.rerenderFileListSliceInPlace(side);
			}
		} catch {
			// Enrichment is best-effort; rows keep their blank size/date if it fails.
		} finally {
			this.remoteEnrichInFlight[side] = false;
			if (this.remoteEnrichAgain[side]) {
				this.remoteEnrichAgain[side] = false;
				this.scheduleEnrichVisibleRemoteRows(side);
			}
		}
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
			row.addEventListener('drag', event => {
				this.maybeStartWindowsFileDragFromPointer(side, event);
			});
			row.addEventListener('dragend', () => {
				this.clearCurrentFileDragState();
			});
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
		if ((item.directory || item.parent) && item.path) {
			row.addEventListener('pointerenter', () => this.prefetchPaneDirectory(side, item.path));
			row.addEventListener('pointerdown', event => {
				this.prefetchPaneDirectory(side, item.path);
				this.maybeOpenPaneDirectoryOnFastDoubleClick(side, item, event, renaming);
			});
			// Drop a same-pane selection onto a folder row (or the ".." row) to move those items
			// into that directory, like Windows Explorer / TurboFile-web.
			const dropTargetPath = item.path;
			row.addEventListener('dragover', event => {
				if (this.currentFileDragSide !== side || !this.canMoveSelectionIntoDirectory(side, item, dropTargetPath)) {
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
				if (this.currentFileDragSide !== side || !this.canMoveSelectionIntoDirectory(side, item, dropTargetPath)) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				row.classList.remove('is-internal-drop-target');
				const targetLabel = item.parent ? '上一级目录' : item.name;
				this.clearCurrentFileDragState();
				this.deferAfterDrag(() => void this.moveSelectedItemsIntoDirectory(side, dropTargetPath, targetLabel));
			});
		}
		row.addEventListener('dblclick', () => {
			if (renaming) {
				return;
			}
			if ((item.directory || item.parent) && this.consumeSuppressedNativeDirectoryDoubleClick(side, item.path)) {
				return;
			}
			if (item.directory || item.parent) {
				void this.openItem(side, item);
			} else {
				void this.previewSelected(side, item);
			}
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
		}

		const size = $('.turbofile-file-meta');
		size.textContent = item.size;

		const modified = $('.turbofile-file-meta');
		modified.textContent = item.modified;

		row.appendChild(name);
		row.appendChild(size);
		row.appendChild(modified);
		return row;
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

		const inputBox = new InputBox(inputHost, this.contextViewService, {
			ariaLabel: '输入文件名。按 Enter 确认或 Escape 取消。',
			inputBoxStyles: defaultInputBoxStyles,
			validationOptions: {
				validation: value => {
					const message = this.validateRenameName(side, item, value);
					return message ? { content: message, type: MessageType.ERROR } : null;
				}
			}
		});

		const disposables = new DisposableStore();
		disposables.add(inputBox);
		this.renderDisposables.add(disposables);

		let currentSelectionState: 'prefix' | 'all' | 'suffix' = 'prefix';
		let finished = false;
		const selectByState = () => {
			const value = inputBox.value;
			const dotIndex = value.lastIndexOf('.');
			if (item.directory || dotIndex <= 0) {
				inputBox.select({ start: 0, end: value.length });
				return;
			}
			if (currentSelectionState === 'prefix') {
				inputBox.select({ start: 0, end: dotIndex });
			} else if (currentSelectionState === 'all') {
				inputBox.select({ start: 0, end: value.length });
			} else {
				inputBox.select({ start: dotIndex + 1, end: value.length });
			}
		};

		const finish = (success: boolean) => {
			if (finished) {
				return;
			}
			finished = true;
			const nextName = inputBox.value;
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

		inputBox.value = item.name;
		inputBox.validate();

		disposables.add(inputBox.onDidChange(value => {
			const targetName = value || ' ';
			const targetPath = item.path ? joinPanePath(this.paneStates[side].path, targetName, this.isWindowsDevice(this.getPaneDevice(side) ?? this.localWindowsDevice)) : undefined;
			const nextIcon = this.renderFileBrowserIcon({ ...item, name: targetName, path: targetPath });
			icon.replaceWith(nextIcon);
			icon = nextIcon;
			inputBox.validate();
		}));

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
				if (!inputBox.validate()) {
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
		inputBox.inputElement.addEventListener('keydown', handleKeydown);
		disposables.add({ dispose: () => inputBox.inputElement.removeEventListener('keydown', handleKeydown) });

		const stopClipboardEventPropagation = (event: ClipboardEvent) => event.stopPropagation();
		for (const eventType of ['copy', 'cut', 'paste'] as const) {
			inputBox.inputElement.addEventListener(eventType, stopClipboardEventPropagation);
			disposables.add({ dispose: () => inputBox.inputElement.removeEventListener(eventType, stopClipboardEventPropagation) });
		}

		const handleBlur = () => {
			const window = getWindow(inputBox.inputElement);
			window.setTimeout(() => {
				if (finished || window.document.activeElement === inputBox.inputElement) {
					return;
				}
				finish(inputBox.isInputValid());
			}, 0);
		};
		inputBox.inputElement.addEventListener('blur', handleBlur);
		disposables.add({ dispose: () => inputBox.inputElement.removeEventListener('blur', handleBlur) });

		const window = getWindow(inputHost);
		const frame = window.requestAnimationFrame(() => {
			if (!finished && this.isInlineRenameTarget(side, item)) {
				inputBox.focus();
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
		const liveSummary = runningTransfers.length ? this.getLiveTransferAggregate(runningTransfers) : undefined;
		const livePercent = liveSummary && liveSummary.totalBytes > 0
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
			const isRsyncTransferRunning = runningTransfers.some(task => task.strategy?.startsWith('rsync'));
			const transferSizeText = liveSummary.totalBytes > 0
				? `${formatSize(liveSummary.transferredBytes)} / ${formatSize(liveSummary.totalBytes)}`
				: liveSummary.transferredBytes > 0 || isRsyncTransferRunning ? formatSize(liveSummary.transferredBytes) : '准备传输';
			const showElapsedTime = liveSummary.remainingMs === undefined || liveSummary.remainingMs <= 0 || !Number.isFinite(liveSummary.remainingMs);
			const timeText = showElapsedTime ? this.formatElapsed(liveSummary.startedAt) : this.formatRemaining(liveSummary.remainingMs);
			const timeTitle = showElapsedTime ? '已耗时' : '剩余时间';
			right.appendChild(this.renderStatusbarItem(Codicon.arrowSwap, this.formatSpeed(liveSummary.speedBytesPerSecond), '当前速度'));
			right.appendChild(this.renderStatusbarItem(Codicon.clock, timeText, timeTitle));
			right.appendChild(this.renderStatusbarItem(Codicon.archive, transferSizeText, '已传输'));
			const protocol = runningTransfers.length === 1 ? this.getTransferProtocolLabel(runningTransfers[0].strategy) : undefined;
			if (protocol) {
				right.appendChild(this.renderStatusbarItem(Codicon.terminal, protocol, '传输模式'));
			}
			const cancel = this.createIconButton(Codicon.close, '取消运行中的传输', 'turbofile-statusbar-cancel');
			this.renderDisposables.add(cancel);
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
		if (!this.container || this.isTaskbarHiddenForTerminal() || this.activePage !== 'transfer') {
			return;
		}
		const current = this.container.querySelector<HTMLElement>('.turbofile-taskbar');
		if (!current) {
			return;
		}
		current.replaceWith(this.renderTaskbar());
	}

	/**
	 * The bottom taskbar must never render over a visible terminal panel (they share the window
	 * bottom). Besides the explicit `taskbarHiddenForTerminal` flag, do a live check: if this page has
	 * a bound terminal and the panel part is currently visible, keep the taskbar hidden — this guards
	 * against task operations (rename/delete/transfer) that reset the flag while the terminal is open.
	 */
	private isTaskbarHiddenForTerminal(): boolean {
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
		const label = $('span');
		label.textContent = text;
		item.appendChild(label);
		return item;
	}

	private getLiveTransferStatusTitle(tasks: TurboFileTask[]): string {
		const items = tasks.flatMap(task => this.getLiveTransferItems(task).map(item => ({ task, item })));
		const active = items.find(({ item }) => item.status === 'running') ?? items.find(({ item }) => item.status === 'waiting') ?? items[0];
		if (!active) {
			return tasks.length > 1 ? `正在传输 ${tasks.length} 个任务` : tasks[0].label;
		}
		return items.length > 1 ? `正在传输：${active.item.name} · ${items.length} 项` : `正在传输：${active.item.name}`;
	}

	private getLiveTransferItems(task: TurboFileTask): TurboFileTaskTransferItem[] {
		return task.transferItems?.length ? task.transferItems : [this.createFallbackTransferItem(task)];
	}

	private createFallbackTransferItem(task: TurboFileTask): TurboFileTaskTransferItem {
		const totalBytes = task.totalBytes ?? task.bytes ?? 0;
		const transferredBytes = task.transferredBytes ?? 0;
		return {
			name: task.label.replace(/^复制\s+/, ''),
			type: 'file',
			displaySize: totalBytes > 0 ? formatSize(totalBytes) : '',
			rawSize: totalBytes,
			status: task.status === 'running' ? 'running' : task.status,
			progress: task.progress,
			transferredBytes,
			totalBytes,
			speedBytesPerSecond: task.speedBytesPerSecond ?? 0,
			remainingMs: task.remainingMs,
			strategy: task.strategy,
			speedSamples: task.speedSamples ?? []
		};
	}

	private getLiveTransferAggregate(tasks: TurboFileTask[]): { transferredBytes: number; totalBytes: number; speedBytesPerSecond: number; remainingMs?: number; startedAt?: number } {
		let transferredBytes = 0;
		let totalBytes = 0;
		let speedBytesPerSecond = 0;
		let startedAt: number | undefined;
		const addStartedAt = (candidate: number | undefined): void => {
			if (candidate === undefined) {
				return;
			}
			startedAt = startedAt === undefined ? candidate : Math.min(startedAt, candidate);
		};
		for (const task of tasks) {
			const taskDataStartedAt = task.transferStartedAt;
			const taskVisibleStartedAt = getVisibleTransferStartedAt({
				status: task.status,
				strategy: task.strategy,
				startedAt: task.startedAt,
				transferStartedAt: task.transferStartedAt
			});
			if ((task.transferItems?.length ?? 0) > 1 && task.activeTransferItemIndex === undefined && task.totalBytes !== undefined) {
				transferredBytes += task.transferredBytes ?? 0;
				// task.totalBytes is already 0 while an rsync total is unknown and the real size once the
				// main process resolves it, so no rsync-specific zeroing is needed here anymore.
				totalBytes += task.totalBytes ?? 0;
				speedBytesPerSecond += task.status === 'running' ? task.speedBytesPerSecond ?? 0 : 0;
				addStartedAt(taskVisibleStartedAt);
				continue;
			}
			const items = this.getLiveTransferItems(task);
			for (const item of items) {
				transferredBytes += item.transferredBytes;
				totalBytes += this.getLiveTransferItemTotal(item, task);
				speedBytesPerSecond += item.status === 'running' ? item.speedBytesPerSecond : 0;
				addStartedAt(getVisibleTransferStartedAt({
					status: item.status,
					strategy: item.strategy ?? task.strategy,
					startedAt: item.startedAt ?? task.startedAt,
					transferStartedAt: item.transferStartedAt ?? taskDataStartedAt
				}));
			}
		}
		const remainingBytes = Math.max(0, totalBytes - transferredBytes);
		const remainingMs = totalBytes > 0 && transferredBytes < totalBytes && speedBytesPerSecond > 0
			? (remainingBytes / speedBytesPerSecond) * 1000
			: undefined;
		return {
			transferredBytes,
			totalBytes,
			speedBytesPerSecond,
			remainingMs,
			startedAt
		};
	}

	private getLiveTransferItemTotal(item: TurboFileTaskTransferItem, task?: TurboFileTask): number {
		const strategy = item.strategy ?? task?.strategy;
		if ((task?.status === 'running' || item.status === 'running') && this.isRsyncStrategy(strategy)) {
			// Show the concurrently-computed rsync total when known, but don't fall back to the listing
			// rawSize (which can disagree with rsync's own transferred count and make the bar jumpy).
			return Math.max(item.totalBytes, 0);
		}
		return Math.max(item.totalBytes, item.rawSize, item.transferredBytes, 0);
	}

	private isRsyncStrategy(strategy: string | undefined): boolean {
		return isTurboFileRsyncStrategy(strategy);
	}

	private formatSpeed(bytesPerSecond: number | undefined): string {
		return bytesPerSecond && bytesPerSecond > 0 ? `${formatTransferRate(bytesPerSecond)}/s` : '--';
	}

	private formatRemaining(milliseconds: number | undefined): string {
		return milliseconds !== undefined && Number.isFinite(milliseconds) && milliseconds >= 0 ? formatDuration(milliseconds) : '--';
	}

	private formatElapsed(startedAt: number | undefined): string {
		if (startedAt === undefined) {
			return '--';
		}
		return formatDuration(Math.max(0, Date.now() - startedAt));
	}

	private async cancelRunningTransfers(tasks: readonly TurboFileTask[]): Promise<void> {
		for (const task of tasks) {
			await this.cancelTask(task);
		}
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

		const list = $('.turbofile-task-log-list');
		if (!this.tasks.length) {
			const empty = $('.turbofile-task-log-empty');
			empty.textContent = '暂无任务记录';
			list.appendChild(empty);
		} else {
			for (const task of this.tasks) {
				list.appendChild(this.renderTaskRow(task));
			}
		}

		panel.appendChild(header);
		panel.appendChild(list);
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
		row.classList.add(`is-${task.status}`);

		const name = $('.turbofile-task-row-name');
		name.appendChild(renderIcon(this.getTaskIcon(task)));
		name.append(task.label);

		const detail = $('.turbofile-task-row-detail');
		detail.textContent = task.detail;

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
		this.render();

		if (!task.progressId) {
			return;
		}

		const result = await this.sshService.cancelTransfer(task.progressId);
		if (!result.ok && task.status === 'running') {
			this.finishTask(task, 'error', `取消任务失败：${result.message}`, { error: result.message });
		}
	}

	private async retryTask(task: TurboFileTask): Promise<void> {
		const retry = task.retryTransfer;
		if (!retry || (task.status !== 'error' && task.status !== 'canceled')) {
			return;
		}

		const sourceDevice = retry.sourceDeviceId ? this.getDeviceById(retry.sourceDeviceId) : this.getPaneDevice(retry.sourceSide);
		const targetDevice = this.getPaneDevice(retry.targetSide);
		const nextTask = this.beginTask('transfer', `重试 ${retry.sourceItem.name}`, `${sourceDevice?.name ?? retry.sourceSide} -> ${targetDevice?.name ?? retry.targetSide}`);
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
		// During rsync startup the process can be quiet while ssh connects and rsync builds its
		// file list. Tick only for that startup window; once data progress arrives, progress events
		// drive rendering so the status bar does not jump on two different clocks.
		const needsStartupTicker = this.tasks.some(task => this.needsLiveTransferStartupTicker(task));
		if (needsStartupTicker && this.liveTransferTicker === undefined && this.container) {
			this.liveTransferTicker = getWindow(this.container).setInterval(() => {
				if (!this.tasks.some(task => this.needsLiveTransferStartupTicker(task))) {
					this.clearLiveTransferTicker();
					return;
				}
				this.render();
			}, TURBOFILE_RSYNC_STARTUP_TICK_INTERVAL_MS);
		} else if (!needsStartupTicker) {
			this.clearLiveTransferTicker();
		}
	}

	private needsLiveTransferStartupTicker(task: TurboFileTask): boolean {
		if (task.kind !== 'transfer' || task.status !== 'running') {
			return false;
		}
		if (task.transferStartedAt !== undefined) {
			return false;
		}
		return this.getLiveTransferItems(task).some(item => item.status === 'running'
			&& item.transferStartedAt === undefined
			&& this.isRsyncStrategy(item.strategy ?? task.strategy));
	}

	private clearLiveTransferTicker(): void {
		if (this.liveTransferTicker !== undefined && this.container) {
			getWindow(this.container).clearInterval(this.liveTransferTicker);
		}
		this.liveTransferTicker = undefined;
	}

	private beginTask(kind: TurboFileTaskKind, label: string, detail: string): TurboFileTask {
		const task: TurboFileTask = {
			id: this.taskSequence++,
			kind,
			label,
			detail,
			status: 'running',
			startedAt: Date.now(),
			progress: 35
		};
		this.tasks.unshift(task);
		if (this.tasks.length > 16) {
			this.tasks.splice(16);
		}
		this.statusMessage = detail;
		this.updateInputRunningTaskCount();
		this.updateLiveTransferTicker();
		this.render();
		return task;
	}

	private updateTask(task: TurboFileTask, detail: string, progress = task.progress): void {
		task.detail = detail;
		task.progress = progress;
		this.statusMessage = detail;
		this.render();
	}

	private updateTransferProgress(task: TurboFileTask, event: ITurboFileTransferProgressEvent): void {
		const activeItem = task.activeTransferItemIndex !== undefined ? task.transferItems?.[task.activeTransferItemIndex] : undefined;
		const strategy = this.getTransferStrategyFromProgress(event) ?? task.strategy;
		const isRsyncProgress = strategy?.startsWith('rsync') ?? false;
		const knownTotalBytes = activeItem ? activeItem.totalBytes : task.totalBytes ?? 0;
		// rsync used to be forced to an unknown (0) total because it had no reliable size up front.
		// The main process now computes the byte total concurrently and ships it in event.totalBytes,
		// so honor it for every strategy; rsync only falls back to 0 when no total is known yet.
		const totalBytes = event.totalBytes > 0 ? event.totalBytes : (isRsyncProgress ? 0 : knownTotalBytes);
		const transferredBytes = Math.min(event.transferredBytes, totalBytes > 0 ? totalBytes : event.transferredBytes);
		const progress = totalBytes > 0
			? Math.max(0, Math.min(100, Math.round((transferredBytes / totalBytes) * 100)))
			: event.phase === 'complete' ? 100 : Math.max(8, task.progress);
		let detail = this.formatTransferProgressDetail(event, transferredBytes, totalBytes);
		if (event.totalItems && event.totalItems > 1) {
			const completedItems = Math.max(0, Math.min(event.completedItems ?? 0, event.totalItems));
			const currentName = event.currentName ? `：${event.currentName}` : '';
			detail = `${detail} · ${completedItems}/${event.totalItems}${currentName}`;
		}
		const now = Date.now();
		const speedTarget = activeItem ?? task;
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
			activeItem.status = event.phase === 'complete' ? 'success' : 'running';
			activeItem.transferredBytes = transferredBytes;
			activeItem.totalBytes = totalBytes;
			activeItem.progress = event.phase === 'complete' ? 100 : progress;
			activeItem.speedBytesPerSecond = speed;
			activeItem.remainingMs = speed > 0 && totalBytes > 0 && totalBytes > transferredBytes ? ((totalBytes - transferredBytes) / speed) * 1000 : undefined;
			activeItem.strategy = strategy;
			if (event.phase === 'complete') {
				activeItem.endedAt = now;
			}
		}
		const aggregate = this.getLiveTransferAggregate([task]);
		task.transferredBytes = activeItem ? aggregate.transferredBytes : transferredBytes;
		task.totalBytes = activeItem ? aggregate.totalBytes : totalBytes;
		task.speedBytesPerSecond = activeItem ? aggregate.speedBytesPerSecond : speed;
		task.remainingMs = aggregate.remainingMs;
		task.strategy = strategy;
		task.progress = activeItem && aggregate.totalBytes > 0
			? Math.max(0, Math.min(100, Math.round((aggregate.transferredBytes / aggregate.totalBytes) * 100)))
			: event.phase === 'complete' ? 100 : progress;
		task.detail = detail;
		this.statusMessage = detail;
		this.updateLiveTransferTicker();

		const renderIntervalMs = strategy?.startsWith('rsync') ? RSYNC_PROGRESS_RENDER_INTERVAL_MS : TRANSFER_PROGRESS_RENDER_INTERVAL_MS;
		if (event.phase === 'complete' || (totalBytes > 0 && transferredBytes >= totalBytes) || now - (task.lastProgressRenderAt ?? 0) > renderIntervalMs) {
			task.lastProgressRenderAt = now;
			if (this.activePage === 'transfer' && !this.isTaskLogVisible) {
				this.refreshTaskbar();
			} else {
				this.render();
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
		if (elapsed < TRANSFER_SPEED_SAMPLE_MIN_INTERVAL_MS) {
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

	private formatTransferProgressDetail(event: ITurboFileTransferProgressEvent, transferredBytes: number, totalBytes: number): string {
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
		if (totalBytes > 0) {
			return `${phaseLabel}：${formatSize(transferredBytes)} / ${formatSize(totalBytes)}${extra}`;
		}
		if (transferredBytes > 0) {
			return `${phaseLabel}：${formatSize(transferredBytes)}${extra}`;
		}
		return extra ? `${phaseLabel} (${extraParts.join('; ')})` : phaseLabel;
	}

	private finishTask(task: TurboFileTask, status: Exclude<TurboFileTaskStatus, 'running'>, detail: string, options: { bytes?: number; strategy?: string; error?: string; durationMs?: number; averageBytesPerSecond?: number } = {}): void {
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
		task.progress = status === 'canceled' ? Math.max(task.progress, 0) : 100;
		task.bytes = options.bytes;
		task.averageBytesPerSecond = options.averageBytesPerSecond
			?? (options.bytes !== undefined && task.durationMs !== undefined && task.durationMs > 0 ? Math.round(options.bytes / (task.durationMs / 1000)) : task.averageBytesPerSecond);
		if (options.bytes !== undefined) {
			task.transferredBytes = options.bytes;
			task.totalBytes = options.bytes;
		}
		task.strategy = options.strategy;
		task.error = options.error;
		if (task.transferItems?.length) {
			for (const item of task.transferItems) {
				if (status === 'success' && item.status !== 'success') {
					item.status = 'success';
					item.progress = 100;
					item.transferredBytes = this.getLiveTransferItemTotal(item);
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
		this.render();
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
		const timingStartedAt = task.transferStartedAt ?? task.startedAt;
		const elapsedMs = task.durationMs ?? ((task.endedAt ?? Date.now()) - timingStartedAt);
		const duration = formatDuration(elapsedMs);
		const parts = [duration];
		if (task.status === 'running' && task.totalBytes !== undefined && task.transferredBytes !== undefined) {
			if (task.totalBytes > 0) {
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
			card.addEventListener('pointerdown', event => this.selectImageGridItemWithPointer(index, event));
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

	private renderImageGridPage(): HTMLElement {
		const state = this.imageGridState;
		const page = $('.turbofile-image-page');
		if (!state) {
			return page;
		}
		// The scroll body is recreated on every full render; drop the cached width so this pass
		// re-measures (and so a post-attach measurement below picks up the real body width).
		this.invalidateImageGridBodyWidthCache();
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
			button.addEventListener('click', () => this.setImageGridColumns(option));
			columns.appendChild(button);
		}
		headerLeft.appendChild(columns);
		header.appendChild(headerLeft);

		const actions = $('.turbofile-image-page-actions');
		const deleteButton = $('button.turbofile-image-page-action.is-delete.is-danger') as HTMLButtonElement;
		const selectedCount = this.getImageGridDeleteTargets(state).length;
		deleteButton.type = 'button';
		deleteButton.title = selectedCount ? '\u5220\u9664\u9009\u4e2d\u56fe\u7247' : '\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u56fe\u7247';
		deleteButton.disabled = selectedCount === 0;
		deleteButton.setAttribute('aria-label', '\u5220\u9664\u9009\u4e2d\u56fe\u7247');
		deleteButton.appendChild(renderIcon(Codicon.trash));
		deleteButton.addEventListener('click', () => { void this.deleteSelectedImageGridItems(); });
		actions.appendChild(deleteButton);
		actions.appendChild(this.renderImageGridSortControl(state));
		actions.appendChild(this.renderImageGridScaleControl(state));
		const closeIcon = $('button.turbofile-image-page-action.is-close') as HTMLButtonElement;
		closeIcon.type = 'button';
		closeIcon.title = '关闭';
		closeIcon.setAttribute('aria-label', '关闭图片网格');
		closeIcon.appendChild(renderIcon(Codicon.close));
		closeIcon.addEventListener('click', () => this.closeImageGridPage());
		actions.appendChild(closeIcon);
		const close = this.createButton('关闭', 'turbofile-secondary-button');
		close.element.addEventListener('click', () => this.closeImageGridPage());
		actions.appendChild(close.element);
		header.appendChild(actions);
		page.appendChild(header);

		const body = $('.turbofile-image-page-body');
		body.scrollTop = state.scrollTop;
		body.addEventListener('scroll', () => this.handleImageGridScroll(body), { passive: true });
		page.addEventListener('wheel', event => this.handleImageGridWheel(event, body), { passive: false, capture: true });
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
			// Now that the body is in the document, drop the render-time (container-based) width
			// estimate so subsequent scroll passes measure the real attached body exactly once.
			this.invalidateImageGridBodyWidthCache();
			if (scrollTop > 0) {
				body.scrollTop = scrollTop;
			}
		});
		return page;
	}

	private renderImageGridScaleControl(state: TurboFileImageGridState): HTMLElement {
		const select = $('.turbofile-image-page-scale');
		const button = $('button.turbofile-image-page-scale-button') as HTMLButtonElement;
		const menu = $('.turbofile-image-page-scale-menu');
		button.type = 'button';
		button.title = '图片放大倍率';
		button.setAttribute('aria-haspopup', 'listbox');
		button.setAttribute('aria-expanded', 'false');
		button.setAttribute('aria-label', '图片放大倍率');
		button.appendChild(renderIcon(Codicon.zoomIn));
		button.appendChild($('span.turbofile-image-page-scale-label', undefined, this.getImageGridScaleLabel(state.thumbnailScale)));
		button.appendChild(renderIcon(Codicon.chevronDown));

		menu.setAttribute('role', 'listbox');
		menu.setAttribute('aria-label', '图片放大倍率');
		for (const scale of IMAGE_GRID_THUMBNAIL_SCALE_OPTIONS) {
			const isActive = state.thumbnailScale === scale;
			const item = $('button.turbofile-image-page-scale-option') as HTMLButtonElement;
			item.type = 'button';
			item.dataset.scale = String(scale);
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', isActive ? 'true' : 'false');
			if (isActive) {
				item.classList.add('is-active');
			}
			const check = $('span.turbofile-image-page-scale-check');
			if (isActive) {
				check.appendChild(renderIcon(Codicon.check));
			}
			item.appendChild(check);
			item.appendChild($('span.turbofile-image-page-scale-option-label', undefined, this.getImageGridScaleLabel(scale)));
			item.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				select.classList.remove('is-open');
				button.setAttribute('aria-expanded', 'false');
				this.setImageGridThumbnailScale(scale);
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
				const active = menu.querySelector<HTMLElement>('.turbofile-image-page-scale-option.is-active') ?? menu.querySelector<HTMLElement>('.turbofile-image-page-scale-option');
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
		this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener('click', handleWindowClick) });
		this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener('keydown', handleWindowKeydown) });

		select.appendChild(button);
		select.appendChild(menu);
		return select;
	}

	private renderImageGridSortControl(state: TurboFileImageGridState): HTMLElement {
		const select = $('.turbofile-image-page-sort');
		const button = $('button.turbofile-image-page-sort-button') as HTMLButtonElement;
		const menu = $('.turbofile-image-page-sort-menu');
		button.type = 'button';
		button.title = '排序方式';
		button.setAttribute('aria-haspopup', 'listbox');
		button.setAttribute('aria-expanded', 'false');
		button.setAttribute('aria-label', '排序方式');
		button.appendChild(renderIcon(Codicon.listOrdered));
		button.appendChild($('span.turbofile-image-page-sort-label', undefined, this.getImageGridSortLabel(state)));
		button.appendChild(renderIcon(state.sortDescending ? Codicon.arrowDown : Codicon.arrowUp));
		button.appendChild(renderIcon(Codicon.chevronDown));

		menu.setAttribute('role', 'listbox');
		menu.setAttribute('aria-label', '图片排序方式');
		for (const option of IMAGE_GRID_SORT_OPTIONS) {
			const isActive = state.sortKey === option.key;
			const item = $('button.turbofile-image-page-sort-option') as HTMLButtonElement;
			item.type = 'button';
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', isActive ? 'true' : 'false');
			if (isActive) {
				item.classList.add('is-active');
			}
			const check = $('span.turbofile-image-page-sort-check');
			if (isActive) {
				check.appendChild(renderIcon(Codicon.check));
			}
			item.appendChild(check);
			item.appendChild($('span.turbofile-image-page-sort-option-label', undefined, option.label));
			if (isActive) {
				item.appendChild(renderIcon(state.sortDescending ? Codicon.arrowDown : Codicon.arrowUp));
			}
			item.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				select.classList.remove('is-open');
				button.setAttribute('aria-expanded', 'false');
				this.setImageGridSort(option.key);
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
		this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener('click', handleWindowClick) });
		this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener('keydown', handleWindowKeydown) });

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
		this.imageGridRenderedRange = {
			startIndex: range.startIndex,
			endIndex: range.endIndex,
			columns: this.getImageGridEffectiveColumns(state),
			total: state.images.length
		};
		const indexes: number[] = [];
		for (let index = range.startIndex; index < range.endIndex; index++) {
			indexes.push(index);
		}
		this.queueImageGridThumbnailLoads(state, indexes, true);
	}

	private renderImageGridCard(state: TurboFileImageGridState, image: TurboFileImageGridImage, index: number): HTMLElement {
		const card = $('div.turbofile-image-page-card') as HTMLElement;
		const cardSize = this.getImageGridCardSize(state, image);
		card.tabIndex = 0;
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
		card.appendChild(preview);

		const name = $('.turbofile-image-page-card-name');
		name.textContent = image.item.name;
		name.addEventListener('dblclick', event => event.stopPropagation());
		card.appendChild(name);

		card.addEventListener('pointerdown', event => this.selectImageGridItemWithPointer(index, event));
		card.addEventListener('contextmenu', event => this.selectImageGridItemWithContextMenu(index, event));
		card.addEventListener('dblclick', event => {
			event.preventDefault();
			this.openImageGridPreview(index);
		});
		card.addEventListener('keydown', event => {
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

	private getImageGridCardSize(state: TurboFileImageGridState, image: TurboFileImageGridImage): ITurboFileImageGridCardSize {
		return getTurboFileImageGridCardSize({ width: image.width, height: image.height }, state.thumbnailScale, this.getImageGridBaseCardWidth(state), this.getImageGridBasePreviewHeight(state), IMAGE_GRID_CARD_VERTICAL_CHROME, IMAGE_GRID_CARD_INLINE_CHROME);
	}

	private applyImageGridCardPreviewSize(preview: HTMLElement, size: ITurboFileImageGridCardSize): void {
		preview.style.width = `${Math.max(1, size.cardWidth - IMAGE_GRID_CARD_INLINE_CHROME)}px`;
		preview.style.height = `${Math.max(1, size.rowHeight - IMAGE_GRID_CARD_VERTICAL_CHROME)}px`;
	}

	private applyImageGridCardImageSize(image: HTMLImageElement, size: ITurboFileImageGridCardSize): void {
		image.style.width = `${size.imageWidth}px`;
		image.style.height = `${size.imageHeight}px`;
	}

	private appendImageGridCardChrome(preview: HTMLElement, image: TurboFileImageGridImage, index: number): void {
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
		return image.width && image.height ? `${image.width}×${image.height}` : '';
	}

	private renderImagePreviewOverlay(): HTMLElement {
		const state = this.imageGridState;
		const overlay = $('.turbofile-image-preview-overlay');
		if (!state?.previewVisible) {
			return overlay;
		}

		overlay.tabIndex = -1;
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', 'Image preview');
		overlay.addEventListener('wheel', event => this.handleImagePreviewWheel(event));
		overlay.addEventListener('click', event => {
			if (event.target === overlay) {
				this.closeImageGridPreview();
			}
		});
		overlay.addEventListener('keydown', event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				this.closeImageGridPreview();
			} else if (event.key === 'ArrowLeft') {
				event.preventDefault();
				this.moveImageGridPreview(-1);
			} else if (event.key === 'ArrowRight') {
				event.preventDefault();
				this.moveImageGridPreview(1);
			}
		});

		const dismiss = $('button.turbofile-image-preview-dismiss') as HTMLButtonElement;
		dismiss.type = 'button';
		dismiss.setAttribute('aria-label', '关闭预览');
		dismiss.addEventListener('click', () => this.closeImageGridPreview());
		overlay.appendChild(dismiss);

		const stage = $('.turbofile-image-preview-stage');
		this.renderImagePreviewStageContent(stage, state);
		overlay.appendChild(stage);

		const toolbar = $('.turbofile-image-preview-toolbar');
		const pixelInspector = this.renderImagePreviewTopAction(Codicon.symbolColor, 'RGB 像素检查', () => this.toggleImagePreviewPixelInspector(), state.pixelInspectorVisible);
		pixelInspector.dataset.turbofilePreviewToggle = 'pixel-inspector';
		toolbar.appendChild(pixelInspector);
		const losslessSampling = this.renderImagePreviewTopAction(Codicon.symbolRuler, '无损像素缩放', () => this.toggleImagePreviewSamplingMode(), state.previewSamplingMode === 'lossless');
		losslessSampling.dataset.turbofilePreviewToggle = 'lossless-sampling';
		toolbar.appendChild(losslessSampling);
		const histogram = this.renderImagePreviewTopAction(Codicon.graphLine, '直方图', () => this.toggleImagePreviewHistogram(), state.histogramVisible);
		histogram.dataset.turbofilePreviewToggle = 'histogram';
		toolbar.appendChild(histogram);
		toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.download, '下载图片', () => { void this.downloadImageGridPreview(); }));
		toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.trash, '删除图片', () => { void this.deleteImageGridPreview(); }));
		toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.close, '关闭', () => this.closeImageGridPreview()));
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
		previous.addEventListener('click', () => this.moveImageGridPreview(-1));
		navigation.appendChild(previous);

		const next = $('button.turbofile-image-preview-nav-button') as HTMLButtonElement;
		next.type = 'button';
		next.appendChild(renderIcon(Codicon.chevronRight));
		next.addEventListener('click', () => this.moveImageGridPreview(1));
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

		const zoomOut = this.renderImagePreviewTopAction(Codicon.zoomOut, '缩小', () => this.zoomImagePreviewByOculanteStep(-IMAGE_PREVIEW_BUTTON_ZOOM_DELTA));
		zoomOut.classList.add('is-transient');
		zoomOut.disabled = state.previewZoom <= IMAGE_PREVIEW_ZOOM_MIN;
		controls.appendChild(zoomOut);

		const value = $('button.turbofile-image-preview-zoom-value') as HTMLButtonElement;
		value.type = 'button';
		value.disabled = true;
		value.textContent = this.getImagePreviewZoomLabel(state);
		controls.appendChild(value);

		const zoomIn = this.renderImagePreviewTopAction(Codicon.zoomIn, '放大', () => this.zoomImagePreviewByOculanteStep(IMAGE_PREVIEW_BUTTON_ZOOM_DELTA));
		zoomIn.classList.add('is-transient');
		zoomIn.disabled = state.previewZoom >= IMAGE_PREVIEW_ZOOM_MAX;
		controls.appendChild(zoomIn);

		const reset = this.renderImagePreviewTopAction(Codicon.screenNormal, '适应窗口', () => this.resetImagePreviewView());
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
			this.toggleImagePreviewHistogram();
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
		dimensions.textContent = image.width && image.height ? `${image.width} × ${image.height}` : image.previewLoading ? 'Loading original' : 'Original image';
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
		button.addEventListener('click', () => this.moveImageGridPreview(delta));
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
			figure.addEventListener('pointerdown', event => this.handleImagePreviewPointerDown(event));
			figure.addEventListener('contextmenu', event => this.showPreviewImageContextMenu(event));
			if (state.pixelInspectorVisible) {
				this.attachImagePreviewPixelInspector(stage, figure, selected, previewSrc);
			}
			stage.appendChild(figure);
			this.renderImagePreviewCanvas();
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
			this.observeImagePreviewCanvas(canvas);
			this.queueImagePreviewCanvasRender();
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
		this.observeImagePreviewCanvas(canvas);
		this.queueImagePreviewCanvasRender();
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
			image.width = render.width;
			image.height = render.height;
			this.renderImagePreviewCanvas();
		};
		loader.onerror = () => {
			if (this.imagePreviewRender === render) {
				render.ready = false;
				this.renderImagePreviewCanvas();
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
			if (this.imageGridState !== state || image.previewImageLoadingKey !== key || !this.shouldKeepImageGridPreview(state, index)) {
				return false;
			}
			image.previewImage = loader;
			image.previewImageKey = key;
			image.width = Math.max(1, loader.naturalWidth || image.width || 1);
			image.height = Math.max(1, loader.naturalHeight || image.height || 1);
			return true;
		} catch (error) {
			if (this.imageGridState === state && this.shouldKeepImageGridPreview(state, index)) {
				image.previewError = error instanceof Error ? error.message : String(error);
			}
			return false;
		} finally {
			if (image.previewImageLoadingKey === key) {
				image.previewImageLoading = undefined;
				image.previewImageLoadingKey = undefined;
			}
		}
	}

	private loadImagePreviewElement(loader: HTMLImageElement, src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
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
		});
	}

	private observeImagePreviewCanvas(canvas: HTMLCanvasElement): void {
		this.imagePreviewResizeObserver?.disconnect();
		if (typeof ResizeObserver === 'undefined') {
			return;
		}
		this.imagePreviewResizeObserver = new ResizeObserver(() => this.renderImagePreviewCanvas());
		this.imagePreviewResizeObserver.observe(canvas);
	}

	private queueImagePreviewCanvasRender(): void {
		const canvas = this.imagePreviewRender?.canvas;
		const ownerWindow = canvas ? getWindow(canvas) : getWindow(this.container ?? document.body);
		ownerWindow.requestAnimationFrame(() => this.renderImagePreviewCanvas());
	}

	private renderImagePreviewCanvas(): void {
		const state = this.imageGridState;
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
		const shouldSmooth = state.previewSamplingMode === 'smooth' || state.previewZoom < 1;
		render.context.imageSmoothingEnabled = shouldSmooth;
		render.context.imageSmoothingQuality = shouldSmooth ? 'high' : 'low';
		const drawX = Math.trunc(state.previewPanX);
		const drawY = Math.trunc(state.previewPanY);
		const drawWidth = render.width * state.previewZoom;
		const drawHeight = render.height * state.previewZoom;
		render.context.drawImage(render.image, drawX, drawY, drawWidth, drawHeight);
		this.updateImagePreviewZoomValue(state);
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

	private handleImagePreviewWheel(event: WheelEvent): void {
		event.preventDefault();
		event.stopPropagation();
		const state = this.imageGridState;
		const render = this.imagePreviewRender;
		if (!state?.previewVisible || !render?.ready) {
			return;
		}
		const wheelDelta = Math.max(-IMAGE_PREVIEW_WHEEL_DELTA_LIMIT, Math.min(IMAGE_PREVIEW_WHEEL_DELTA_LIMIT, -event.deltaY / IMAGE_PREVIEW_WHEEL_DIVISOR));
		const scaleDelta = wheelDelta * state.previewZoom * IMAGE_PREVIEW_ZOOM_RATIO;
		this.setImageGridPreviewZoom(state.previewZoom + scaleDelta);
	}

	private handleImagePreviewPointerDown(event: PointerEvent): void {
		if (event.button !== 0) {
			return;
		}
		const state = this.imageGridState;
		const render = this.imagePreviewRender;
		if (!state?.previewVisible || !render?.ready) {
			return;
		}

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
			this.renderImagePreviewCanvas();
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
		if (!this.imageGridState?.pixelInspectorVisible || figure?.dataset.turbofilePixelInspectorAttached !== 'true' || !figure.classList.contains('is-pixel-inspector')) {
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
		const scale = Math.max(IMAGE_PREVIEW_ZOOM_MIN, this.imageGridState?.previewZoom ?? 1);
		const drawX = Math.trunc(this.imageGridState?.previewPanX ?? 0);
		const drawY = Math.trunc(this.imageGridState?.previewPanY ?? 0);
		const imageX = (event.clientX - canvasRect.left - drawX) / scale;
		const imageY = (event.clientY - canvasRect.top - drawY) / scale;
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

	private updateImagePreviewHistogramCanvas(): void {
		const canvas = this.container?.querySelector<HTMLCanvasElement>('.turbofile-image-preview-histogram-canvas');
		if (canvas) {
			const state = this.imageGridState;
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

	private updateImagePreviewOverlay(): void {
		const state = this.imageGridState;
		if (!state?.previewVisible || !this.container) {
			return;
		}
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
			this.updateImagePreviewHistogramCanvas();
		}
		this.updateImagePreviewSideButtons(state);
	}

	private updateImagePreviewSideButtons(state: TurboFileImageGridState): void {
		const overlay = this.container?.querySelector<HTMLElement>('.turbofile-image-preview-overlay');
		if (!overlay || this.imageGridState !== state || !state.previewVisible) {
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
			this.updateImagePreviewHistogramCanvas();
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

	private appendToolbarButton(parent: HTMLElement, icon: ThemeIcon, title: string, handler?: () => void, turboIcon?: TurboFileBootstrapIcon, iconColor?: TurboFileIconColor): void {
		const button = document.createElement('button');
		button.className = 'turbofile-toolbar-button';
		button.title = title;
		button.appendChild(turboIcon ? renderTurboFileIcon(turboIcon, iconColor) : renderIcon(icon));
		if (handler) {
			button.addEventListener('click', handler);
		}
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

	private showDialogConfirm(title: string, message: string, detail?: string, danger = false): Promise<boolean> {
		return new Promise(resolve => {
			this.dialogState = {
				kind: 'confirm',
				title,
				message,
				detail,
				danger,
				confirmLabel: danger ? '删除' : '确定',
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

	private showDialogInfo(title: string, message: string, detail?: string): void {
		this.dialogState = {
			kind: 'info',
			title,
			message,
			detail,
			confirmLabel: '知道了',
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

		return [
			this.menuAction('turbofile.newFolder', '新建文件夹', Codicon.newFolder, () => this.createFolder(side)),
			this.menuAction('turbofile.newFile', '新建文件', Codicon.newFile, () => this.createFile(side)),
			this.menuAction('turbofile.rename', '重命名', Codicon.edit, () => this.renameSelected(side), canOperate),
			this.menuAction('turbofile.copyPath', '复制路径', Codicon.copy, () => this.copySelectedPath(side), canOperate),
			this.menuAction('turbofile.calculateSize', '计算大小', Codicon.symbolNumeric, () => this.calculateSelectedSize(side), canOperate),
			this.menuAction('turbofile.extract', '解压', Codicon.unarchive, () => this.extractSelected(side), canExtract),
			this.menuAction('turbofile.compress', '压缩', Codicon.archive, () => this.compressSelected(side), canOperate),
			this.menuAction('turbofile.delete', '删除', Codicon.trash, () => this.deleteSelected(side), canOperate)
		];
	}

	private getPaneContextActions(side: 'left' | 'right'): IAction[] {
		return [
			this.menuAction('turbofile.newFolder', '新建文件夹', Codicon.newFolder, () => this.createFolder(side)),
			this.menuAction('turbofile.newFile', '新建文件', Codicon.newFile, () => this.createFile(side))
		];
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
			const listing = await this.loadPaneDirectory(device, targetPath, !!options.force);

			if (this.paneRequestSeq[side] !== requestId || this.paneStates[side].path !== targetPath) {
				return;
			}

			state.path = listing.path;
			state.items = listing.items;
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

	private async loadPaneDirectory(device: TurboFileDevice, path: string, force: boolean, purpose: TurboFileDirectoryLoadPurpose = 'foreground'): Promise<TurboFileDirectoryCacheEntry> {
		const cacheKey = this.getPaneDirectoryCacheKey(device, path);
		const now = Date.now();
		if (!force) {
			const cached = this.paneDirectoryCache.get(cacheKey);
			if (cached && cached.expiresAt > now) {
				return cached;
			}
			const inflight = this.paneDirectoryInflight.getReusable(cacheKey, purpose);
			if (inflight) {
				return inflight;
			}
		} else {
			this.paneDirectoryCache.delete(cacheKey);
			this.paneDirectoryInflight.delete(cacheKey);
		}

		const promise = (async (): Promise<TurboFileDirectoryCacheEntry> => {
			const isRemote = device.id !== LOCAL_WINDOWS_DEVICE_ID;
			// Remote directories load names + type only (one round trip, no per-file stat) so even a
			// directory with hundreds of thousands of files appears instantly; the size and modified
			// time are filled in lazily for the visible rows by enrichVisibleRemoteRows().
			const listing = isRemote
				? await this.sshService.listRemoteDirectoryNames(await this.getSshConnectionOptions(device), path, force)
				: await this.sshService.listLocalDirectory(path, force);
			this.setDeviceRuntimeStatus(device, 'online');
			const items = this.toFileItems(device, listing.path, listing.entries);
			if (isRemote) {
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
			this.paneDirectoryCache.set(this.getPaneDirectoryCacheKey(device, listing.path), entry);
			if (listing.path === path) {
				this.paneDirectoryCache.set(cacheKey, entry);
			}
			this.trimPaneDirectoryCache();
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
		state.items = listing.items;
		state.error = undefined;
		state.loading = false;
		this.setDeviceRuntimeStatus(device, 'online');
		this.clearPaneSelection(side);
		this.rememberPaneDevicePath(side, device, listing.path);
		this.rememberPaneDeviceSnapshot(side);
		this.prefetchNeighborDirectories(device, listing.path, listing.items);
		this.statusMessage = `${device.name} 已加载 ${state.items.filter(item => !item.parent).length} 项。`;
	}

	private prefetchPaneDirectory(side: 'left' | 'right', path: string | undefined): void {
		if (!path) {
			return;
		}
		const device = this.getPaneDevice(side);
		if (!device || this.getCachedPaneDirectory(device, path)) {
			return;
		}
		const cacheKey = this.getPaneDirectoryCacheKey(device, path);
		if (this.paneDirectoryInflight.has(cacheKey)) {
			return;
		}
		void this.loadPaneDirectory(device, path, false, 'prefetch').catch(() => undefined);
	}

	private prefetchNeighborDirectories(device: TurboFileDevice, currentPath: string, items: TurboFileFileItem[]): void {
		const candidates = [
			getPaneParentPath(currentPath, this.isWindowsDevice(device)),
			...items.filter(item => item.directory && !item.parent && item.path).slice(0, PANE_DIRECTORY_PREFETCH_LIMIT).map(item => item.path)
		].filter((path): path is string => !!path);
		for (const path of candidates) {
			const cacheKey = this.getPaneDirectoryCacheKey(device, path);
			const cached = this.paneDirectoryCache.get(cacheKey);
			if ((cached && cached.expiresAt > Date.now()) || this.paneDirectoryInflight.has(cacheKey)) {
				continue;
			}
			void this.loadPaneDirectory(device, path, false, 'prefetch').catch(() => undefined);
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

	private getVisiblePaneSidesForDeviceDirectories(device: TurboFileDevice, paths: readonly string[]): ('left' | 'right')[] {
		const windowsPath = this.isWindowsDevice(device);
		return (['left', 'right'] as const).filter(side => {
			const paneDevice = this.getPaneDevice(side);
			if (!paneDevice || !this.isSameDeviceForNativeOperation(device, paneDevice)) {
				return false;
			}
			return paths.some(path => this.pathsEqualForDevice(this.paneStates[side].path, path, windowsPath));
		});
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

		if (item.directory || item.parent) {
			await this.navigatePaneDirectory(side, item.path);
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

		this.updateTask(task, `正在计算目录大小：${sourceItem.name}`, Math.max(10, task.progress));
		const result = await this.sshService.calculatePathSize(await this.toTransferEndpoint(device, sourceItem.path));
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
		}
	}

	private getPaneFileListElement(side: 'left' | 'right'): HTMLElement | undefined {
		return this.container?.querySelector<HTMLElement>(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`) ?? undefined;
	}

	private hasExternalDropData(event: DragEvent): boolean {
		const dataTransfer = event.dataTransfer;
		if (!dataTransfer) {
			return false;
		}

		const types = Array.from(dataTransfer.types || []);
		return !!dataTransfer.getData(CodeDataTransfers.FILES)
			|| !!dataTransfer.getData(DataTransfers.RESOURCES)
			|| types.includes(DataTransfers.FILES)
			|| dataTransfer.files.length > 0;
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

		const sourceItems = (await Promise.all(sourcePaths.map(path => this.resolveExternalTransferItem(path)))).filter((item): item is TurboFileFileItem => !!item);
		if (!sourceItems.length) {
			this.statusMessage = '未识别到可传输的 Windows 文件或文件夹。';
			this.render();
			return false;
		}

		if (sourceItems.length > 1) {
			const transferred = await this.transferItemsBatch(targetSide, targetSide, this.localWindowsDevice, targetDevice, sourceItems, operation, initiatedAt);
			if (operation === 'move') {
				await this.refreshLocalPanesForWindowsPaths(sourceItems.map(item => item.path!).filter(Boolean));
			}
			return transferred;
		}

		const batch = sourceItems.length > 1;
		const actionLabel = operation === 'move' ? '剪切粘贴' : '本地复制';
		const label = batch ? `${actionLabel} ${sourceItems.length} 项` : `${actionLabel} ${sourceItems[0].name}`;
		const task = this.beginTask('transfer', label, `Windows -> ${targetDevice.name}`);
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
				targetPath: joinPanePath(this.paneStates[targetSide].path, sourceItems[0].name, this.isWindowsDevice(targetDevice)),
				sourceDeviceId: LOCAL_WINDOWS_DEVICE_ID
			};
		}

		if (operation === 'move' && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
			return this.moveExternalWindowsItemsNatively(targetSide, task, sourceItems);
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
			this.updateTask(task, batch ? `正在传输 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在传输：${sourceItem.name}`, progress);
			const result = await this.transferItem(targetSide, targetSide, sourceItem, {
				refreshTarget: false,
				task,
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
				return false;
			} else {
				failed++;
				transferItem.status = 'error';
				transferItem.error = result.message;
				transferItem.endedAt = Date.now();
				failures.push(`${sourceItem.name}: ${result.message}`);
			}
		}

		this.updateTask(task, `正在刷新目标目录：${targetDevice.name}`, 92);
		await this.refreshPane(targetSide, { force: true });
		const strategy = [...strategies].join(', ') || undefined;
		if (failed > 0) {
			this.finishTask(task, 'error', batch ? `本地 Windows 传输完成 ${completed} 项，失败 ${failed} 项。` : `传输失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			return false;
		}

		if (operation === 'move') {
			const cleanupFailures = await this.deleteExternalSourceItems(task, sourceItems);
			await this.refreshLocalPanesForWindowsPaths(sourceItems.map(item => item.path!).filter(Boolean));
			if (cleanupFailures.length) {
				this.finishTask(task, 'error', `目标已复制，但删除本地来源失败 ${cleanupFailures.length} 项。`, { bytes: totalBytes, strategy, error: cleanupFailures[0] });
				return false;
			}
		}

		const successMessage = batch
			? `${operation === 'move' ? '本地剪切传输' : '本地复制传输'}完成：${completed} 项，${formatSize(totalBytes)}。`
			: `${operation === 'move' ? '剪切传输' : '复制传输'}完成：${sourceItems[0].name}，策略 ${strategy ?? 'unknown'}，${formatSize(totalBytes)}。`;
		this.finishTask(task, 'success', successMessage, { bytes: totalBytes, strategy });
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

	private copySelectedToInternalClipboard(sourceSide: 'left' | 'right', operation: 'copy' | 'move'): void {
		const sourceDevice = this.getPaneDevice(sourceSide);
		const items = this.getSelectedTransferItems(sourceSide);
		if (!sourceDevice || !items.length) {
			this.statusMessage = operation === 'move' ? '请先选择要剪切的文件或目录。' : '请先选择要复制的文件或目录。';
			this.render();
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
		this.render();
	}

	private async pasteIntoPane(targetSide: 'left' | 'right'): Promise<void> {
		if (this.internalTransferClipboard?.items.length) {
			await this.pasteInternalTransferClipboard(targetSide);
			return;
		}
		await this.pasteWindowsClipboardFiles(targetSide);
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
		const sourceItems = clipboard.items.map(item => ({ ...item }));
		if (sourceItems.length > 1) {
			const transferred = await this.transferItemsBatch(clipboard.sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, clipboard.operation);
			if (transferred && clipboard.operation === 'move') {
				this.internalTransferClipboard = undefined;
			}
			return transferred;
		}
		const batch = sourceItems.length > 1;
		const actionLabel = clipboard.operation === 'move' ? '剪切粘贴' : '复制粘贴';
		const task = this.beginTask('transfer', batch ? `${actionLabel} ${sourceItems.length} 项` : `${actionLabel} ${sourceItems[0].name}`, `${sourceDevice.name} -> ${targetDevice.name}`);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
		task.speedSamples = [];

		if (clipboard.operation === 'move' && this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
			const moved = await this.moveInternalItemsNatively(task, sourceDevice, clipboard.sourceSide, targetSide, sourceItems);
			if (moved) {
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
			const targetPath = joinPanePath(this.paneStates[targetSide].path, sourceItem.name, this.isWindowsDevice(targetDevice));
			if (this.isSameTransferTarget(sourceDevice, sourceItem.path, targetDevice, targetPath)) {
				failed++;
				transferItem.status = 'error';
				transferItem.error = '来源和目标路径相同，已跳过。';
				transferItem.endedAt = Date.now();
				failures.push(`${sourceItem.name}: 来源和目标路径相同`);
				continue;
			}

			this.updateTask(task, batch ? `正在粘贴 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在粘贴：${sourceItem.name}`, progress);
			const result = await this.transferItem(clipboard.sourceSide, targetSide, sourceItem, {
				refreshTarget: false,
				task,
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
				return false;
			} else {
				failed++;
				transferItem.status = 'error';
				transferItem.error = result.message;
				transferItem.endedAt = Date.now();
				failures.push(`${sourceItem.name}: ${result.message}`);
			}
		}

		this.updateTask(task, `正在刷新目录：${sourceDevice.name} / ${targetDevice.name}`, 92);
		await Promise.all([
			this.refreshPane(clipboard.sourceSide, { force: true }),
			this.refreshPane(targetSide, { force: true })
		]);

		const strategy = [...strategies].join(', ') || undefined;
		if (failed > 0) {
			this.finishTask(task, 'error', batch ? `内部粘贴完成 ${completed} 项，失败 ${failed} 项。` : `内部粘贴失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			return false;
		}

		if (clipboard.operation === 'move') {
			const cleanupFailures = await this.deleteInternalClipboardSources(task, sourceDevice, clipboard.sourceSide, sourceItems);
			if (cleanupFailures.length) {
				this.finishTask(task, 'error', `目标已复制，但删除来源失败 ${cleanupFailures.length} 项。`, { bytes: totalBytes, strategy, error: cleanupFailures[0] });
				return false;
			}
			this.internalTransferClipboard = undefined;
		}

		const successMessage = batch
			? `${clipboard.operation === 'move' ? '剪切粘贴' : '复制粘贴'}完成：${completed} 项，${formatSize(totalBytes)}。`
			: `${clipboard.operation === 'move' ? '剪切粘贴' : '复制粘贴'}完成：${sourceItems[0].name}，策略 ${strategy ?? 'unknown'}，${formatSize(totalBytes)}。`;
		this.finishTask(task, 'success', successMessage, { bytes: totalBytes, strategy });
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
	private getDirectoryMoveTargets(side: 'left' | 'right', targetDir: string): TurboFileFileItem[] {
		const device = this.getPaneDevice(side);
		if (!device || !targetDir) {
			return [];
		}
		const windowsPath = this.isWindowsDevice(device);
		return this.getSelectedTransferItems(side).filter(item => {
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

	private canMoveSelectionIntoDirectory(side: 'left' | 'right', targetItem: TurboFileFileItem, targetDir: string): boolean {
		if (!targetItem.directory && !targetItem.parent) {
			return false;
		}
		return this.getDirectoryMoveTargets(side, targetDir).length > 0;
	}

	/**
	 * Moves the current same-pane selection into `targetDir` using a native same-device rename, the
	 * same primitive used by cut/paste. Powers dragging rows onto a folder or the ".." row.
	 */
	private async moveSelectedItemsIntoDirectory(side: 'left' | 'right', targetDir: string, targetLabel: string): Promise<void> {
		const device = this.getPaneDevice(side);
		if (!device) {
			return;
		}
		const sourceItems = this.getDirectoryMoveTargets(side, targetDir);
		if (!sourceItems.length) {
			return;
		}

		const refreshPaths = getTurboFileDirectoryMoveRefreshPaths(this.paneStates[side].path, targetDir);
		const windowsPath = this.isWindowsDevice(device);
		const batch = sourceItems.length > 1;
		const strategy = windowsPath ? 'local-move' : 'remote-move';
		const task = this.beginTask('transfer', batch ? `移动 ${sourceItems.length} 项到 ${targetLabel}` : `移动 ${sourceItems[0].name} 到 ${targetLabel}`, device.name);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
		task.speedSamples = [];
		this.invalidatePaneDirectoryCaches(device, refreshPaths);
		this.removePaneItems(side, sourceItems);

		const failures: string[] = [];
		let completed = 0;
		let totalBytes = 0;
		for (const [index, sourceItem] of sourceItems.entries()) {
			const transferItem = task.transferItems[index];
			task.activeTransferItemIndex = index;
			transferItem.status = 'running';
			transferItem.startedAt = Date.now();
			transferItem.progress = 0;
			transferItem.strategy = strategy;
			const itemBytes = Math.max(sourceItem.rawSize, transferItem.totalBytes, 0);
			const targetPath = joinPanePath(targetDir, sourceItem.name, windowsPath);
			this.updateTask(task, batch ? `正在移动 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在移动：${sourceItem.name}`, Math.min(88, 12 + Math.round((index / sourceItems.length) * 70)));
			const result = await this.sshService.renamePath(await this.toTransferEndpoint(device, sourceItem.path!), targetPath);
			if (result.ok) {
				completed++;
				totalBytes += itemBytes;
				transferItem.status = 'success';
				transferItem.progress = 100;
				transferItem.transferredBytes = itemBytes;
				transferItem.totalBytes = Math.max(itemBytes, transferItem.totalBytes);
				transferItem.endedAt = Date.now();
				this.invalidatePaneDirectoryCaches(device, refreshPaths);
			} else {
				transferItem.status = 'error';
				transferItem.error = result.message;
				transferItem.endedAt = Date.now();
				failures.push(`${sourceItem.name}: ${result.message}`);
			}
		}

		this.updateTask(task, `正在刷新目录：${device.name}`, 92);
		this.invalidatePaneDirectoryCaches(device, refreshPaths);
		const visibleRefreshSides = this.getVisiblePaneSidesForDeviceDirectories(device, refreshPaths);
		await Promise.all([
			...visibleRefreshSides.map(side => this.refreshPane(side, { force: true })),
			this.loadPaneDirectory(device, targetDir, true, 'prefetch').catch(() => undefined)
		]);
		if (failures.length) {
			this.finishTask(task, 'error', batch ? `移动完成 ${completed} 项，失败 ${failures.length} 项。` : `移动失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			return;
		}
		this.finishTask(task, 'success', batch ? `移动完成：${completed} 项 → ${targetLabel}` : `移动完成：${sourceItems[0].name} → ${targetLabel}`, { bytes: totalBytes, strategy });
	}

	private async moveInternalItemsNatively(task: TurboFileTask, device: TurboFileDevice, sourceSide: 'left' | 'right', targetSide: 'left' | 'right', sourceItems: readonly TurboFileFileItem[]): Promise<boolean> {
		const batch = sourceItems.length > 1;
		const failures: string[] = [];
		const strategy = this.isWindowsDevice(device) ? 'local-move' : 'remote-move';
		let completed = 0;
		let totalBytes = 0;

		this.removePaneItems(sourceSide, sourceItems.filter(item => !!item.path));
		for (const [index, sourceItem] of sourceItems.entries()) {
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
			const targetPath = joinPanePath(this.paneStates[targetSide].path, sourceItem.name, this.isWindowsDevice(device));
			if (this.isSameTransferTarget(device, sourceItem.path, device, targetPath)) {
				if (transferItem) {
					transferItem.status = 'error';
					transferItem.error = '源路径和目标路径相同，已跳过。';
					transferItem.endedAt = Date.now();
				}
				failures.push(`${sourceItem.name}: 源路径和目标路径相同`);
				continue;
			}

			this.updateTask(task, batch ? `正在移动 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在移动：${sourceItem.name}`, Math.min(88, 12 + Math.round((index / sourceItems.length) * 70)));
			const result = await this.sshService.renamePath(await this.toTransferEndpoint(device, sourceItem.path), targetPath);
			if (result.ok) {
				completed++;
				totalBytes += itemBytes;
				if (transferItem) {
					transferItem.status = 'success';
					transferItem.progress = 100;
					transferItem.transferredBytes = itemBytes;
					transferItem.totalBytes = Math.max(itemBytes, transferItem.totalBytes);
					transferItem.strategy = strategy;
					transferItem.endedAt = Date.now();
				}
			} else {
				if (transferItem) {
					transferItem.status = 'error';
					transferItem.error = result.message;
					transferItem.endedAt = Date.now();
				}
				failures.push(`${sourceItem.name}: ${result.message}`);
			}
		}

		this.updateTask(task, `正在刷新目录：${device.name}`, 92);
		await Promise.all([...new Set([sourceSide, targetSide])].map(side => this.refreshPane(side, { force: true })));
		if (failures.length) {
			this.finishTask(task, 'error', batch ? `同设备移动完成 ${completed} 项，失败 ${failures.length} 项。` : `同设备移动失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			return false;
		}

		this.finishTask(task, 'success', batch ? `同设备移动完成：${completed} 项。` : `同设备移动完成：${sourceItems[0].name}`, { bytes: totalBytes, strategy });
		return true;
	}

	private async moveExternalWindowsItemsNatively(targetSide: 'left' | 'right', task: TurboFileTask, sourceItems: readonly TurboFileFileItem[]): Promise<boolean> {
		const batch = sourceItems.length > 1;
		const failures: string[] = [];
		const strategy = 'local-move';
		let completed = 0;
		let totalBytes = 0;

		for (const [index, sourceItem] of sourceItems.entries()) {
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
			const targetPath = joinPanePath(this.paneStates[targetSide].path, sourceItem.name, true);
			if (this.isSameTransferTarget(this.localWindowsDevice, sourceItem.path, this.localWindowsDevice, targetPath)) {
				if (transferItem) {
					transferItem.status = 'error';
					transferItem.error = '源路径和目标路径相同，已跳过。';
					transferItem.endedAt = Date.now();
				}
				failures.push(`${sourceItem.name}: 源路径和目标路径相同`);
				continue;
			}

			this.updateTask(task, batch ? `正在本机移动 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在本机移动：${sourceItem.name}`, Math.min(88, 12 + Math.round((index / sourceItems.length) * 70)));
			const result = await this.sshService.renamePath(await this.toTransferEndpoint(this.localWindowsDevice, sourceItem.path), targetPath);
			if (result.ok) {
				completed++;
				totalBytes += itemBytes;
				if (transferItem) {
					transferItem.status = 'success';
					transferItem.progress = 100;
					transferItem.transferredBytes = itemBytes;
					transferItem.totalBytes = Math.max(itemBytes, transferItem.totalBytes);
					transferItem.strategy = strategy;
					transferItem.endedAt = Date.now();
				}
			} else {
				if (transferItem) {
					transferItem.status = 'error';
					transferItem.error = result.message;
					transferItem.endedAt = Date.now();
				}
				failures.push(`${sourceItem.name}: ${result.message}`);
			}
		}

		this.updateTask(task, '正在刷新本机目录', 92);
		await Promise.all([
			this.refreshPane(targetSide, { force: true }),
			this.refreshLocalPanesForWindowsPaths(sourceItems.map(item => item.path!).filter(Boolean))
		]);
		if (failures.length) {
			this.finishTask(task, 'error', batch ? `本机移动完成 ${completed} 项，失败 ${failures.length} 项。` : `本机移动失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			return false;
		}

		this.finishTask(task, 'success', batch ? `本机移动完成：${completed} 项。` : `本机移动完成：${sourceItems[0].name}`, { bytes: totalBytes, strategy });
		return true;
	}

	private async deleteInternalClipboardSources(task: TurboFileTask, sourceDevice: TurboFileDevice, sourceSide: 'left' | 'right', sourceItems: readonly TurboFileFileItem[]): Promise<string[]> {
		const failures: string[] = [];
		const batch = sourceItems.length > 1;
		this.removePaneItems(sourceSide, sourceItems.filter(item => !!item.path));
		for (const [index, item] of sourceItems.entries()) {
			if (!item.path) {
				continue;
			}
			this.updateTask(task, batch ? `正在删除来源 ${index + 1}/${sourceItems.length}：${item.name}` : `正在删除来源：${item.name}`, Math.min(98, 92 + Math.round(((index + 1) / sourceItems.length) * 6)));
			const result = await this.sshService.deletePath(await this.toTransferEndpoint(sourceDevice, item.path), true);
			if (!result.ok) {
				failures.push(`${item.name}: ${result.message}`);
			}
		}
		await this.refreshPane(sourceSide, { force: true });
		return failures;
	}

	private async deleteExternalSourceItems(task: TurboFileTask, sourceItems: readonly TurboFileFileItem[]): Promise<string[]> {
		const failures: string[] = [];
		for (const [index, item] of sourceItems.entries()) {
			if (!item.path) {
				continue;
			}

			this.updateTask(task, `正在删除本地来源 ${index + 1}/${sourceItems.length}：${item.name}`, Math.min(98, 92 + Math.round(((index + 1) / sourceItems.length) * 6)));
			const result = await this.sshService.deletePath(await this.toTransferEndpoint(this.localWindowsDevice, item.path), true);
			if (!result.ok) {
				failures.push(`${item.name}: ${result.message}`);
			}
		}
		return failures;
	}

	private async refreshLocalPanesForWindowsPaths(paths: readonly string[]): Promise<void> {
		const parentPaths = paths
			.map(path => getPaneParentPath(path, true))
			.filter((path): path is string => !!path);
		if (!parentPaths.length) {
			return;
		}

		const refreshes: Promise<void>[] = [];
		for (const side of ['left', 'right'] as const) {
			const device = this.getPaneDevice(side);
			if (device?.id !== LOCAL_WINDOWS_DEVICE_ID) {
				continue;
			}

			if (parentPaths.some(parentPath => isSameWindowsPath(parentPath, this.paneStates[side].path))) {
				refreshes.push(this.refreshPane(side, { force: true }));
			}
		}

		await Promise.all(refreshes);
	}

	private async resolveExternalTransferItem(path: string): Promise<TurboFileFileItem | undefined> {
		const name = getPathBasename(path);
		if (!name) {
			return undefined;
		}

		const parentPath = getPaneParentPath(path, true);
		if (parentPath) {
			try {
				const listing = await this.sshService.listLocalDirectory(parentPath);
				const entry = listing.entries.find(candidate => isSameWindowsPath(candidate.path, path));
				if (entry) {
					return this.toFileItem(entry);
				}
			} catch {
				// Fall back to a best-effort item when the parent listing is unavailable.
			}
		}

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

	private async transferItemsToWindowsDirectory(sourceSide: 'left' | 'right', sourceDevice: TurboFileDevice, sourceItems: readonly TurboFileFileItem[], targetDirectory: string, initiatedAt?: number): Promise<boolean> {
		this.taskbarHiddenForTerminal = false;
		const items = sourceItems.filter((item): item is TurboFileFileItem & { path: string } => !!item.path && !item.parent);
		if (!items.length) {
			this.statusMessage = '没有可拖到 Windows 的文件。';
			this.render();
			return false;
		}

		const targetDevice = this.localWindowsDevice;
		if (items.length === 1) {
			const sourceItem = items[0];
			const task = this.beginTask('transfer', `拖出 ${sourceItem.name}`, `${sourceDevice.name} -> Windows`);
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
				this.finishTask(task, 'success', `拖出完成：${sourceItem.name}，${formatSize(result.bytes)}。`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
				return true;
			}
			transferItem.status = result.canceled ? 'canceled' : 'error';
			transferItem.error = result.canceled ? undefined : result.message;
			transferItem.endedAt = Date.now();
			this.finishTask(task, result.canceled ? 'canceled' : 'error', result.canceled ? `已取消拖出：${sourceItem.name}` : `拖出失败：${result.message}`, { bytes: result.bytes, strategy: result.strategy, error: result.canceled ? undefined : result.message, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
			return false;
		}

		const task = this.beginTask('transfer', `拖出 ${items.length} 项`, `${sourceDevice.name} -> Windows`);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = items.map(item => this.createTransferTaskItem(item));
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
			const expectedBytes = items.reduce((sum, item) => sum + (item.directory ? 0 : Math.max(0, item.rawSize)), 0);
			const plannedStrategy = this.getPlannedBatchTransferStrategy(sourceDevice, targetDevice, items);
			task.strategy = plannedStrategy;
			for (const transferItem of task.transferItems) {
				transferItem.strategy = plannedStrategy;
			}
			this.updateTask(task, `正在拖出到 Windows 0/${items.length}`, 8);
			const result = await this.sshService.transferBatch({
				source: sourceEndpoint,
				targetDirectory: targetDirectoryEndpoint,
				items: items.map(item => ({
					sourcePath: item.path,
					targetName: item.name,
					displayName: item.name,
					sourceType: item.type,
					expectedBytes: item.directory ? 0 : Math.max(0, item.rawSize)
				})),
				operation: 'copy',
				progressId,
				expectedBytes,
				strategyHint: 'auto',
				clientStartedAt: initiatedAt ?? task.startedAt
			});

			const failedPaths = new Set(result.failures.map(failure => failure.path));
			for (const [index, item] of items.entries()) {
				const transferItem = task.transferItems[index];
				if (!transferItem) {
					continue;
				}
				transferItem.strategy = result.strategy ?? transferItem.strategy;
				transferItem.endedAt = Date.now();
				if (result.canceled) {
					transferItem.status = 'canceled';
				} else if (failedPaths.has(item.path)) {
					transferItem.status = 'error';
					transferItem.error = result.failures.find(failure => failure.path === item.path)?.message;
				} else {
					transferItem.status = 'success';
					transferItem.progress = 100;
					transferItem.transferredBytes = Math.max(transferItem.transferredBytes, transferItem.totalBytes, item.rawSize, 0);
				}
			}

			if (result.canceled) {
				this.finishTask(task, 'canceled', `已取消拖出到 Windows：${items.length} 项`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
				return false;
			}
			if (!result.ok) {
				this.finishTask(task, 'error', `拖出到 Windows 完成 ${result.completed} 项，失败 ${result.failed} 项。`, { bytes: result.bytes, strategy: result.strategy, error: result.failures[0]?.message, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
				return false;
			}
			this.finishTask(task, 'success', `拖出到 Windows 完成：${result.completed} 项，${formatSize(result.bytes)}。`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `拖出到 Windows 失败：${message}`, { error: message });
			return false;
		} finally {
			progressDisposable.dispose();
		}
	}

	private async transferSelected(sourceSide: 'left' | 'right', targetSide: 'left' | 'right', initiatedAt?: number): Promise<boolean> {
		this.taskbarHiddenForTerminal = false;
		const sourceDevice = this.getPaneDevice(sourceSide);
		const targetDevice = this.getPaneDevice(targetSide);
		const sourceItems = this.getSelectedTransferItems(sourceSide);

		if (!sourceDevice || !targetDevice || !sourceItems.length) {
			this.statusMessage = '请先在来源面板选择一个或多个文件/目录。';
			this.render();
			return false;
		}

		if (sourceItems.length > 1) {
			return this.transferItemsBatch(sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, 'copy', initiatedAt);
		}

		const batch = sourceItems.length > 1;
		const label = batch ? `复制 ${sourceItems.length} 项` : `复制 ${sourceItems[0].name}`;
		const task = this.beginTask('transfer', label, `${sourceDevice.name} -> ${targetDevice.name}`);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
		task.speedSamples = [];
		this.primeTransferTaskStrategy(task, sourceDevice, targetDevice, sourceItems);
		if (!batch) {
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
			this.updateTask(task, batch ? `正在传输 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在传输：${sourceItem.name}`, progress);
			const result = await this.transferItem(sourceSide, targetSide, sourceItem, { refreshTarget: false, task, initiatedAt });
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
				return false;
			} else {
				failed++;
				transferItem.status = 'error';
				transferItem.error = result.message;
				transferItem.endedAt = Date.now();
				failures.push(`${sourceItem.name}: ${result.message}`);
			}
		}

		this.updateTask(task, `正在刷新目录：${sourceDevice.name} / ${targetDevice.name}`, 92);
		await Promise.all([
			this.refreshPane(sourceSide, { force: true }),
			this.refreshPane(targetSide, { force: true })
		]);
		const strategy = [...strategies].join(', ') || undefined;
		if (failed > 0) {
			this.finishTask(task, 'error', batch ? `批量传输完成 ${completed} 项，失败 ${failed} 项。` : `传输失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
			return false;
		}

		const successMessage = batch
			? `批量传输完成：${completed} 项，${formatSize(totalBytes)}。`
			: `传输完成：${sourceItems[0].name}，策略 ${strategy ?? 'unknown'}，${formatSize(totalBytes)}。`;
		this.finishTask(task, 'success', successMessage, { bytes: totalBytes, strategy });
		return true;
	}

	private async transferItem(sourceSide: 'left' | 'right', targetSide: 'left' | 'right', sourceItem: TurboFileFileItem, options: { refreshTarget: boolean; task?: TurboFileTask; targetPath?: string; sourceDeviceOverride?: TurboFileDevice; targetDeviceOverride?: TurboFileDevice; initiatedAt?: number }): Promise<TurboFileTransferExecutionResult> {
		const targetState = this.paneStates[targetSide];
		const sourceDevice = options.sourceDeviceOverride ?? this.getPaneDevice(sourceSide);
		const targetDevice = options.targetDeviceOverride ?? this.getPaneDevice(targetSide);
		if (!sourceDevice || !targetDevice || !sourceItem.path || sourceItem.parent) {
			return { ok: false, message: '来源或目标无效。', bytes: 0 };
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
			const sourceEndpoint = await this.toTransferEndpoint(sourceDevice, sourceItem.path);
			const targetEndpoint = await this.toTransferEndpoint(targetDevice, targetPath);
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
				this.updateTask(options.task, `正在传输：${sourceItem.name} -> ${targetDevice.name}`, Math.max(35, options.task.progress));
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

	private async transferItemsBatch(sourceSide: 'left' | 'right', targetSide: 'left' | 'right', sourceDevice: TurboFileDevice, targetDevice: TurboFileDevice, sourceItems: readonly TurboFileFileItem[], operation: 'copy' | 'move', initiatedAt?: number): Promise<boolean> {
		const items = sourceItems.filter(item => !!item.path && !item.parent);
		if (!items.length) {
			return false;
		}

		const actionLabel = operation === 'move' ? '剪切传输' : '批量传输';
		const task = this.beginTask('transfer', `${actionLabel} ${items.length} 项`, `${sourceDevice.name} -> ${targetDevice.name}`);
		task.progress = 0;
		task.cancelRequested = false;
		task.transferItems = items.map(item => this.createTransferTaskItem(item));
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
			const sourceEndpoint = await this.toTransferEndpoint(sourceDevice, items[0].path!);
			const targetDirectoryEndpoint = await this.toTransferEndpoint(targetDevice, this.paneStates[targetSide].path);
			const expectedBytes = items.reduce((sum, item) => sum + (item.directory ? 0 : Math.max(0, item.rawSize)), 0);
			const plannedStrategy = this.getPlannedBatchTransferStrategy(sourceDevice, targetDevice, items);
			const initialStrategy = this.shouldDeferSshToSshStrategy(sourceDevice, targetDevice) ? undefined : plannedStrategy;
			task.strategy = initialStrategy;
			for (const transferItem of task.transferItems) {
				transferItem.strategy = initialStrategy;
			}
			this.updateTask(task, `正在批量传输 0/${items.length}`, 8);
			const result = await this.sshService.transferBatch({
				source: sourceEndpoint,
				targetDirectory: targetDirectoryEndpoint,
				items: items.map(item => ({
					sourcePath: item.path!,
					targetName: item.name,
					displayName: item.name,
					sourceType: item.type,
					expectedBytes: item.directory ? 0 : Math.max(0, item.rawSize)
				})),
				operation,
				progressId,
				expectedBytes,
				strategyHint: 'auto',
				clientStartedAt: initiatedAt ?? task.startedAt
			});

			const failedPaths = new Set(result.failures.map(failure => failure.path));
			for (const [index, item] of items.entries()) {
				const transferItem = task.transferItems[index];
				if (!transferItem) {
					continue;
				}
				transferItem.strategy = result.strategy ?? transferItem.strategy;
				transferItem.endedAt = Date.now();
				if (result.canceled) {
					transferItem.status = 'canceled';
				} else if (failedPaths.has(item.path!)) {
					transferItem.status = 'error';
					transferItem.error = result.failures.find(failure => failure.path === item.path)?.message;
				} else {
					transferItem.status = 'success';
					transferItem.progress = 100;
					transferItem.transferredBytes = Math.max(transferItem.transferredBytes, transferItem.totalBytes, item.rawSize, 0);
				}
			}

			this.updateTask(task, `正在刷新目录：${sourceDevice.name} / ${targetDevice.name}`, 92);
			await Promise.all([
				this.refreshPane(sourceSide, { force: true }),
				this.refreshPane(targetSide, { force: true })
			]);

			if (result.canceled) {
				this.finishTask(task, 'canceled', `已取消批量传输：${items.length} 项`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
				return false;
			}
			if (!result.ok) {
				this.finishTask(task, 'error', `批量传输完成 ${result.completed} 项，失败 ${result.failed} 项。`, { bytes: result.bytes, strategy: result.strategy, error: result.failures[0]?.message, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
				return false;
			}
			this.finishTask(task, 'success', `${operation === 'move' ? '剪切传输' : '批量传输'}完成：${result.completed} 项，${formatSize(result.bytes)}。`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `批量传输失败：${message}`, { error: message });
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
		const parents = state.items.filter(existing => existing.parent);
		const entries = state.items.filter(existing => !existing.parent);
		entries.push(item);
		entries.sort((a, b) => {
			if (!!a.directory !== !!b.directory) {
				return a.directory ? -1 : 1;
			}
			return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
		});
		state.items = [...parents, ...entries];
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
		const items = this.getSelectedTransferItems(side);
		const device = this.getPaneDevice(side);
		if (!items.length || !device) {
			this.statusMessage = '请先选择要删除的文件或目录。';
			this.render();
			return;
		}

		const batch = items.length > 1;
		if (!await this.showDialogConfirm('删除确认', batch ? `确定删除选中的 ${items.length} 项吗？` : `确定删除 ${items[0].name} 吗？`, undefined, true)) {
			return;
		}

		this.removePaneItems(side, items);
		const task = this.beginTask('delete', batch ? `删除 ${items.length} 项` : `删除 ${items[0].name}`, device.name);
		try {
			this.updateTask(task, batch ? `正在删除 ${items.length} 项…` : `正在删除：${items[0].name}`, 40);
			// Delete the whole selection in one batch round trip instead of one request per item, so
			// removing a large multi-selection is near-instant rather than N sequential SSH calls.
			const endpoints = await Promise.all(items.filter(item => !!item.path).map(item => this.toTransferEndpoint(device, item.path!)));
			const result = await this.sshService.deletePaths(endpoints, true);
			this.updateTask(task, `正在刷新目录：${device.name}`, 90);
			await this.refreshPane(side, { force: true });
			if (!result.ok) {
				this.finishTask(task, 'error', `删除失败：${result.message}`, { error: result.message });
				return;
			}
			this.finishTask(task, 'success', batch ? `已删除：${items.length} 项` : `已删除：${items[0].name}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `删除失败：${message}`, { error: message });
			await this.refreshPane(side, { force: true });
		}
	}

	private removePaneItems(side: 'left' | 'right', items: TurboFileFileItem[]): void {
		if (this.removePaneItemsFromState(side, items)) {
			this.render();
		}
	}

	private removePaneItemsFromState(side: 'left' | 'right', items: TurboFileFileItem[]): boolean {
		const paths = new Set(items.map(item => item.path).filter((path): path is string => !!path));
		if (!paths.size) {
			return false;
		}
		const state = this.paneStates[side];
		state.items = state.items.filter(item => !item.path || !paths.has(item.path));
		this.clearPaneSelection(side);
		this.fileListRenderedRange[side] = undefined;
		const device = this.getPaneDevice(side);
		if (device) {
			this.paneDirectoryCache.delete(this.getPaneDirectoryCacheKey(device, state.path));
		}
		return true;
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

	private openImageGrid(side: 'left' | 'right', selectedPath?: string, previewVisible: boolean = false, previewOrigin: 'file-list' | 'grid' = 'grid'): void {
		const state = this.paneStates[side];
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		this.clearImageGridLoadedImageIndexes();
		this.clearImageGridLayoutMetrics();
		this.imageGridRenderedRange = undefined;
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
					previewLoading: false,
				};
			});

		if (!images.length) {
			this.statusMessage = '当前目录没有可展开浏览的图片。';
			this.render();
			return;
		}

		sortImageGridImages(images, this.imageGridSortKey, this.imageGridSortDescending);
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
		this.imageGridState = {
			side,
			path: state.path,
			images,
			selectedIndex,
			selectedIndexes,
			selectionAnchorIndex: selectedIndex,
			columns: 12,
			thumbnailScale: 1,
			sortKey: this.imageGridSortKey,
			sortDescending: this.imageGridSortDescending,
			previewVisible,
			previewOrigin,
			previewZoom: 1,
			previewPanX: 0,
			previewPanY: 0,
			previewFitPending: true,
			previewSamplingMode: 'smooth',
			pixelInspectorVisible: false,
			histogramVisible: false,
			histogramX: 104,
			histogramY: 72,
			fileListScrollTop: state.scrollTop,
			scrollTop: 0,
			viewportHeight: this.getImageGridDefaultViewportHeight()
		};
		this.imageGridCtrlWheelDeltaRemainder = 0;
		this.activePage = 'images';
		this.updateTransferTabsVisibility();
		this.notifyActivePageChanged();
		this.statusMessage = `已展开 ${this.getSideLabel(side)} 图片：${images.length} 张。`;
		this.render();
		if (previewVisible && this.imageGridState) {
			this.imageGridPreviewRequestSeq++;
			void this.ensureImageGridPreviewLoaded(this.imageGridState, selectedIndex, this.imageGridPreviewRequestSeq);
			this.scheduleImageGridPreviewNeighborsLoaded(this.imageGridState, selectedIndex);
		}
	}

	private closeImageGridPage(): void {
		const state = this.imageGridState;
		this.imageGridCtrlWheelDeltaRemainder = 0;
		this.disposeImageGridObserver();
		this.clearImageGridScrollTimer();
		this.clearImageGridScrollRaf();
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		this.clearImageGridLayoutMetrics(state);
		this.releaseImageGridStateImages(state);
		this.clearImageGridLoadedImageIndexes();
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.imageGridRenderedRange = undefined;
		this.imageGridState = undefined;
		if (state) {
			this.restoreFileListScrollAfterImageGrid(state.side, state.fileListScrollTop);
		}
		this.activePage = 'transfer';
		this.updateTransferTabsVisibility();
		this.notifyActivePageChanged();
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

		this.updateImageGridSelection();
		this.updateImageGridSelectionStatus(state);
		this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(index, state.images.length));
	}

	private selectImageGridItemWithPointer(index: number, event: PointerEvent): void {
		if (event.button !== 0) {
			return;
		}
		const target = event.currentTarget;
		if (target instanceof HTMLElement) {
			target.focus({ preventScroll: true });
		}
		this.selectImageGridItem(index, event);
	}

	private selectImageGridItemWithContextMenu(index: number, event: MouseEvent): void {
		event.preventDefault();
		const state = this.imageGridState;
		if (!state || index < 0 || index >= state.images.length) {
			return;
		}
		if (!event.ctrlKey && !event.metaKey && !event.shiftKey && state.selectedIndexes.has(index)) {
			state.selectedIndex = index;
			state.selectionAnchorIndex = index;
			this.updateImageGridSelection();
			this.updateImageGridSelectionStatus(state);
			return;
		}
		this.selectImageGridItem(index, event);
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

	private selectAllImageGridItems(): void {
		const state = this.imageGridState;
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
		this.updateImageGridSelection();
		this.updateImageGridSelectionStatus(state);
	}

	private moveImageGridPreview(delta: number): void {
		const state = this.imageGridState;
		if (!state?.images.length) {
			return;
		}
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
		this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(nextIndex, state.images.length));
		this.commitImageGridPreviewIndexIfReady(state, nextIndex, requestSeq);
	}

	private commitImageGridPreviewIndexIfReady(state: TurboFileImageGridState, index: number, requestSeq: number): boolean {
		if (this.imageGridState !== state || !state.previewVisible || state.previewPendingIndex !== index || state.previewPendingRequestSeq !== requestSeq) {
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
		state.previewSamplingMode = 'smooth';
		state.previewPendingIndex = undefined;
		state.previewPendingRequestSeq = undefined;
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
		this.updateImagePreviewOverlay();
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
		state.previewSamplingMode = 'smooth';
		state.previewPendingIndex = undefined;
		state.previewPendingRequestSeq = undefined;
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.imageGridPreviewRequestSeq++;
		this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
		this.render();
		void this.ensureImageGridPreviewLoaded(state, index, this.imageGridPreviewRequestSeq);
		this.scheduleImageGridPreviewNeighborsLoaded(state, index);
		this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(index, state.images.length));
	}

	private closeImageGridPreview(): void {
		const state = this.imageGridState;
		if (!state) {
			return;
		}
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
		state.previewSamplingMode = 'smooth';
		state.previewPendingIndex = undefined;
		state.previewPendingRequestSeq = undefined;
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
		this.render();
	}

	private toggleImagePreviewPixelInspector(): void {
		const state = this.imageGridState;
		if (!state?.previewVisible) {
			return;
		}
		state.pixelInspectorVisible = !state.pixelInspectorVisible;
		this.updateImagePreviewToggleButton('pixel-inspector', state.pixelInspectorVisible);
		this.updateImagePreviewPixelInspectorInPlace(state);
	}

	private toggleImagePreviewHistogram(): void {
		const state = this.imageGridState;
		if (!state?.previewVisible) {
			return;
		}
		state.histogramVisible = !state.histogramVisible;
		this.updateImagePreviewToggleButton('histogram', state.histogramVisible);
		this.updateImagePreviewHistogramInPlace(state);
	}

	private toggleImagePreviewSamplingMode(): void {
		const state = this.imageGridState;
		if (!state?.previewVisible) {
			return;
		}
		state.previewSamplingMode = state.previewSamplingMode === 'lossless' ? 'smooth' : 'lossless';
		this.updateImagePreviewToggleButton('lossless-sampling', state.previewSamplingMode === 'lossless');
		this.renderImagePreviewCanvas();
	}

	private zoomImagePreviewByOculanteStep(step: number): void {
		const state = this.imageGridState;
		const render = this.imagePreviewRender;
		if (!state?.previewVisible || !render?.ready) {
			return;
		}
		const rect = render.canvas.getBoundingClientRect();
		const anchor = {
			x: rect.width / 2,
			y: rect.height / 2
		};
		this.setImageGridPreviewZoom(state.previewZoom + step * state.previewZoom * IMAGE_PREVIEW_ZOOM_RATIO, anchor);
	}

	private setImageGridPreviewZoom(zoom: number, anchor?: { x: number; y: number }): void {
		const state = this.imageGridState;
		const render = this.imagePreviewRender;
		if (!state?.previewVisible || !render?.ready) {
			return;
		}
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
		this.renderImagePreviewCanvas();
	}

	private resetImagePreviewView(): void {
		const state = this.imageGridState;
		if (!state?.previewVisible) {
			return;
		}
		state.previewFitPending = true;
		this.renderImagePreviewCanvas();
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

	private async downloadImageGridPreview(): Promise<void> {
		const state = this.imageGridState;
		const image = state?.images[state.selectedIndex];
		const device = state ? this.getPaneDevice(state.side) : undefined;
		if (!image?.item.path || !device) {
			return;
		}
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
		const gridState = this.imageGridState;
		if (gridState?.previewVisible) {
			const image = gridState.images[gridState.selectedIndex];
			return !!image && !!this.getImagePreviewSource(image);
		}
		return false;
	}

	private async copyPreviewImageToClipboard(): Promise<void> {
		try {
			const gridState = this.imageGridState;
			if (gridState?.previewVisible) {
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

	private async deleteSelectedImageGridItems(): Promise<void> {
		const state = this.imageGridState;
		const device = state ? this.getPaneDevice(state.side) : undefined;
		if (!state || !device) {
			return;
		}

		const targets = this.getImageGridDeleteTargets(state).filter(({ image }) => !!image.item.path);
		if (!targets.length) {
			this.statusMessage = '\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u56fe\u7247\u3002';
			this.render();
			return;
		}

		const batch = targets.length > 1;
		const confirmMessage = batch ? `\u786e\u5b9a\u5220\u9664\u9009\u4e2d\u7684 ${targets.length} \u5f20\u56fe\u7247\u5417\uff1f` : `\u5220\u9664 ${targets[0].image.item.name}\uff1f`;
		if (!await this.showDialogConfirm('\u5220\u9664\u56fe\u7247', confirmMessage, undefined, true)) {
			return;
		}

		const firstDeletedIndex = targets[0].index;
		const keepPreviewVisible = state.previewVisible;
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
		state.previewSamplingMode = 'smooth';
		state.previewVisible = keepPreviewVisible && state.images.length > 0;
		this.imageGridPreviewRequestSeq++;
		this.imageGridRenderedRange = undefined;
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		this.clearImageGridLoadedImageIndexes();
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.removePaneItemsFromState(state.side, items);

		const task = this.beginTask('delete', batch ? `\u5220\u9664 ${targets.length} \u5f20\u56fe\u7247` : `\u5220\u9664 ${items[0].name}`, device.name);
		this.render();
		if (state.previewVisible) {
			void this.ensureImageGridPreviewLoaded(state, state.selectedIndex, this.imageGridPreviewRequestSeq);
			this.scheduleImageGridPreviewNeighborsLoaded(state, state.selectedIndex);
			this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(state.selectedIndex, state.images.length));
		}

		try {
			this.updateTask(task, batch ? `正在删除 ${items.length} 张图片…` : `正在删除：${items[0].name}`, 40);
			// One batch round trip for the whole selection instead of one request per image.
			const endpoints = await Promise.all(items.filter(item => !!item.path).map(item => this.toTransferEndpoint(device, item.path!)));
			const result = await this.sshService.deletePaths(endpoints, true);
			this.updateTask(task, `正在刷新目录：${device.name}`, 90);
			await this.refreshPane(state.side, { force: true });
			if (!result.ok) {
				this.finishTask(task, 'error', `删除失败：${result.message}`, { error: result.message });
				return;
			}
			this.finishTask(task, 'success', batch ? `已删除：${items.length} 张图片` : `已删除：${items[0].name}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `\u5220\u9664\u5931\u8d25\uff1a${message}`, { error: message });
			await this.refreshPane(state.side, { force: true });
		}
	}

	private async deleteImageGridPreview(): Promise<void> {
		const imageGridState = this.imageGridState;
		if (imageGridState) {
			await this.deleteSelectedImageGridItems();
			return;
		}

		const state = this.imageGridState;
		const image = state?.images[state.selectedIndex];
		const device = state ? this.getPaneDevice(state.side) : undefined;
		if (!state || !image?.item.path || !device) {
			return;
		}
		if (!await this.showDialogConfirm('删除图片', `删除 ${image.item.name}？`, undefined, true)) {
			return;
		}

		const deleteIndex = state.selectedIndex;
		this.releaseImageGridImage(image);
		state.images.splice(deleteIndex, 1);
		this.clearImageGridLayoutMetrics(state);
		state.selectedIndex = Math.max(0, Math.min(deleteIndex, state.images.length - 1));
		state.previewZoom = 1;
		state.previewPanX = 0;
		state.previewPanY = 0;
		state.previewFitPending = true;
		state.previewSamplingMode = 'smooth';
		state.previewVisible = state.images.length > 0;
		this.imageGridPreviewRequestSeq++;
		this.imageGridRenderedRange = undefined;
		this.clearImageGridThumbnailQueue();
		this.clearImageGridPreviewPrefetchTimer();
		this.clearImageGridLoadedImageIndexes();
		this.imagePreviewAnalysis = undefined;
		this.clearImagePreviewRender();
		this.removePaneItemsFromState(state.side, [image.item]);

		const task = this.beginTask('delete', `Delete ${image.item.name}`, device.name);
		this.render();
		if (state.previewVisible) {
			void this.ensureImageGridPreviewLoaded(state, state.selectedIndex, this.imageGridPreviewRequestSeq);
			this.scheduleImageGridPreviewNeighborsLoaded(state, state.selectedIndex);
			this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(state.selectedIndex, state.images.length));
		}

		try {
			const result = await this.sshService.deletePath(await this.toTransferEndpoint(device, image.item.path), true);
			if (result.ok) {
				this.finishTask(task, 'success', `Deleted: ${image.item.name}`);
			} else {
				this.finishTask(task, 'error', `Delete failed: ${result.message}`, { error: result.message });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.finishTask(task, 'error', `Delete failed: ${message}`, { error: message });
		} finally {
			await this.refreshPane(state.side, { force: true });
		}
	}

	private setImageGridColumns(columns: TurboFileImageGridColumns): void {
		if (!this.imageGridState) {
			return;
		}
		const nextColumns = this.normalizeImageGridColumns(columns);
		if (this.imageGridState.columns === nextColumns) {
			return;
		}
		this.imageGridState.columns = nextColumns;
		this.imageGridRenderedRange = undefined;
		this.clearImageGridThumbnailQueue();
		this.render();
	}

	private setImageGridThumbnailScale(scale: number): void {
		if (!this.imageGridState) {
			return;
		}
		const nextScale = this.normalizeImageGridThumbnailScale(scale);
		if (this.imageGridState.thumbnailScale === nextScale) {
			return;
		}
		this.imageGridState.thumbnailScale = nextScale;
		this.clearImageGridLayoutMetrics(this.imageGridState);
		this.imageGridRenderedRange = undefined;
		this.clearImageGridThumbnailQueue();
		this.clearImageGridLoadedImageIndexes();
		for (const image of this.imageGridState.images) {
			this.releaseImageBlobUrl(image.thumbnailUrl);
			image.thumbnailUrl = undefined;
			image.thumbnailContent = '';
			image.thumbnailLoading = false;
			image.thumbnailError = undefined;
		}
		this.render();
	}

	private normalizeImageGridThumbnailScale(scale: number): number {
		const rounded = Math.round(scale);
		return IMAGE_GRID_THUMBNAIL_SCALE_OPTIONS.includes(rounded as typeof IMAGE_GRID_THUMBNAIL_SCALE_OPTIONS[number]) ? rounded : 1;
	}

	private getImageGridScaleLabel(scale: number): string {
		const normalized = this.normalizeImageGridThumbnailScale(scale);
		return normalized === 1 ? '1x' : `${normalized}x`;
	}

	private normalizeImageGridStateColumns(state: TurboFileImageGridState): void {
		const nextColumns = this.normalizeImageGridColumns(state.columns);
		if (state.columns !== nextColumns) {
			state.columns = nextColumns;
			this.imageGridRenderedRange = undefined;
		}
	}

	private setImageGridSort(key: TurboFileImageGridSortKey): void {
		const state = this.imageGridState;
		if (!state) {
			return;
		}
		// Match Windows Explorer: clicking the active field flips the direction, picking a
		// different field switches to it in ascending order.
		const nextDescending = state.sortKey === key ? !state.sortDescending : false;
		state.sortKey = key;
		state.sortDescending = nextDescending;
		this.imageGridSortKey = key;
		this.imageGridSortDescending = nextDescending;

		const selectedPath = state.images[state.selectedIndex]?.item.path;
		const selectedPaths = new Set(this.getImageGridSelectedImages(state)
			.map(({ image }) => image.item.path)
			.filter((path): path is string => !!path));
		const anchorPath = state.selectionAnchorIndex !== undefined ? state.images[state.selectionAnchorIndex]?.item.path : undefined;
		sortImageGridImages(state.images, key, nextDescending);
		state.selectedIndexes.clear();
		for (const [index, image] of state.images.entries()) {
			if (image.item.path && selectedPaths.has(image.item.path)) {
				state.selectedIndexes.add(index);
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
		this.imageGridRenderedRange = undefined;
		this.clearImageGridThumbnailQueue();
		this.clearImageGridLoadedImageIndexes();
		this.render();
	}

	private getImageGridSortLabel(state: TurboFileImageGridState): string {
		return IMAGE_GRID_SORT_OPTIONS.find(option => option.key === state.sortKey)?.label ?? '名称';
	}

	private getImagePreviewCaption(state: TurboFileImageGridState): string {
		const image = state.images[state.selectedIndex];
		if (!image) {
			return '';
		}
		const sizeText = image.width && image.height ? `原图 ${image.width}x${image.height}` : image.previewLoading ? '正在加载原图' : '原图';
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

	private scheduleImageGridThumbnailsLoaded(indexes: number[]): void {
		const state = this.imageGridState;
		if (!state || !indexes.length || !this.container) {
			return;
		}
		const ownerWindow = getWindow(this.container);
		ownerWindow.requestAnimationFrame(() => {
			ownerWindow.setTimeout(() => {
				if (this.imageGridState === state && this.activePage === 'images') {
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
			if (this.imageGridState !== state || this.activePage !== 'images') {
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

	private async ensureImageGridThumbnailsLoaded(indexes: number[]): Promise<void> {
		const state = this.imageGridState;
		if (!state) {
			return;
		}
		this.queueImageGridThumbnailLoads(state, indexes, true);
	}

	private queueImageGridThumbnailLoads(state: TurboFileImageGridState, indexes: number[], priority: boolean): void {
		if (this.imageGridState !== state || this.activePage !== 'images') {
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
			requests.push({ state, index, key });
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
		const pending: { index: number; image: TurboFileImageGridImage; path: string }[] = [];
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
			pending.push({ index, image, path: image.item.path });
		}
		if (!pending.length) {
			return;
		}

		const chunkSize = IMAGE_GRID_BATCH_REQUEST_LIMIT;
		for (let offset = 0; offset < pending.length; offset += chunkSize) {
			const chunk = pending.slice(offset, offset + chunkSize);
			if (this.imageGridState !== state) {
				for (const target of chunk) {
					target.image.thumbnailLoading = false;
				}
				return;
			}
			let entries: ITurboFileImageBatchEntry[] = [];
			try {
				const endpoint = await this.toTransferEndpoint(device, state.path ?? '/');
				entries = await this.sshService.readImageBatch(endpoint, chunk.map(target => target.path));
			} catch {
				entries = [];
			}
			if (this.imageGridState !== state) {
				for (const target of chunk) {
					target.image.thumbnailLoading = false;
				}
				return;
			}
			const byPath = new Map(entries.map(entry => [entry.path, entry]));
			for (const target of chunk) {
				target.image.thumbnailLoading = false;
				const entry = byPath.get(target.path);
				if (entry?.ok && entry.content) {
					if (!this.isImageGridIndexNearViewport(state, target.index)) {
						continue;
					}
					this.releaseImageBlobUrl(target.image.thumbnailUrl);
					target.image.thumbnailContent = '';
					target.image.thumbnailUrl = this.createBlobUrlFromBase64(entry.content, entry.mime ?? getMimeType(target.image.item.name));
					target.image.thumbnailMime = entry.mime ?? getMimeType(target.image.item.name);
					target.image.thumbnailError = undefined;
					this.imageGridLoadedThumbnailIndexes.add(target.index);
					this.updateImageGridCard(target.index);
				} else if (entry?.oversized) {
					// Big originals stream individually (and may be server-downscaled) so the batch buffer
					// stays small; this is rare for thumbnail-sized datasets.
					void this.applySshThumbnailViaProtocol(state, device, target.index);
				} else {
					target.image.thumbnailError = entry?.message ?? '加载失败';
					this.updateImageGridCard(target.index);
				}
			}
		}
	}

	private createBlobUrlFromBase64(content: string, mime: string): string | undefined {
		try {
			const bytes = decodeBase64(content).buffer;
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
		if (!image?.item.path || this.imageGridState !== state) {
			return;
		}
		const requestWidth = this.getImageGridThumbnailRequestWidth(state);
		const result = await this.createImageGridResourceUrl(device, image.item.path, createTurboFileImageGridResourceOptions(requestWidth, image.item.rawSize, image.item.rawModified));
		if (this.imageGridState !== state || !this.isImageGridIndexNearViewport(state, index)) {
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
			this.imageGridLoadedThumbnailIndexes.add(index);
		}
		this.updateImageGridCard(index);
	}

	private processImageGridThumbnailQueue(): void {
		const state = this.imageGridState;
		if (!state || this.activePage !== 'images') {
			return;
		}

		const limit = this.getImageGridThumbnailParallelLimit(state);
		const available = Math.max(0, limit - this.imageGridThumbnailLoadingCount);
		for (let started = 0; started < available && this.imageGridThumbnailQueue.length;) {
			const request = this.imageGridThumbnailQueue.shift();
			if (!request) {
				return;
			}
			this.imageGridThumbnailQueued.delete(request.key);
			if (request.state !== state || !this.shouldLoadImageGridThumbnail(request.state, request.index)) {
				continue;
			}
			const image = state.images[request.index];
			if (!image) {
				continue;
			}
			image.thumbnailLoading = true;
			this.imageGridThumbnailLoadingCount++;
			started++;
			void this.runImageGridThumbnailRequest(request);
		}
	}

	private async runImageGridThumbnailRequest(request: TurboFileImageGridThumbnailRequest): Promise<void> {
		try {
			await this.loadImageGridThumbnail(request.state, request.index);
		} finally {
			this.imageGridThumbnailLoadingCount = Math.max(0, this.imageGridThumbnailLoadingCount - 1);
			this.processImageGridThumbnailQueue();
		}
	}

	private shouldLoadImageGridThumbnail(state: TurboFileImageGridState, index: number): boolean {
		if (this.imageGridState !== state || this.activePage !== 'images' || !this.isImageGridIndexNearViewport(state, index)) {
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
		if (!image?.item.path || !device || this.imageGridState !== state || !this.isImageGridIndexNearViewport(state, index)) {
			return;
		}

		try {
			const requestWidth = this.getImageGridThumbnailRequestWidth(state);
			if (this.isRemoteSshImageDevice(device)) {
				const result = await this.createImageGridResourceUrl(device, image.item.path, createTurboFileImageGridResourceOptions(requestWidth, image.item.rawSize, image.item.rawModified));
				if (this.imageGridState !== state || !this.isImageGridIndexNearViewport(state, index)) {
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
					this.imageGridLoadedThumbnailIndexes.add(index);
				}
				this.updateImageGridCard(index);
				return;
			}

			const shouldReadOriginalFirst = this.shouldUseOriginalImageGridCardSource(image.width, image.height);
			let result = shouldReadOriginalFirst
				? await this.readImageGridImage(device, image.item.path, {
					encoding: 'base64',
					forceOriginal: true,
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
			if (this.imageGridState !== state || !this.isImageGridIndexNearViewport(state, index)) {
				return;
			}
			const resolvedWidth = result.width ?? image.width;
			const resolvedHeight = result.height ?? image.height;
			if (!shouldReadOriginalFirst && result.ok && this.shouldUseOriginalImageGridCardSource(resolvedWidth, resolvedHeight)) {
				const originalResult = await this.readImageGridImage(device, image.item.path, {
					encoding: 'base64',
					forceOriginal: true,
					sourceSize: image.item.rawSize,
					sourceModified: image.item.rawModified
				});
				if (this.imageGridState !== state || !this.isImageGridIndexNearViewport(state, index)) {
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
			if (result.ok) {
				this.imageGridLoadedThumbnailIndexes.add(index);
			}
			this.updateImageGridCard(index);
		} catch (error) {
			if (this.imageGridState === state) {
				image.thumbnailError = error instanceof Error ? error.message : String(error);
				this.updateImageGridCard(index);
			}
		} finally {
			if (this.imageGridState === state) {
				image.thumbnailLoading = false;
			}
		}
	}

	private async ensureImageGridPreviewLoaded(state: TurboFileImageGridState, index: number, requestSeq?: number, silent: boolean = false): Promise<void> {
		const image = state.images[index];
		const device = this.getPaneDevice(state.side);
		if (!image?.item.path || !device || this.imageGridState !== state) {
			return;
		}
		if (this.getImagePreviewSource(image)) {
			await this.ensureImagePreviewElementLoaded(state, index);
			this.finishImageGridPreviewLoad(state, index, requestSeq, silent);
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
			this.updateImagePreviewOverlay();
		}
		try {
			if (this.isRemoteSshImageDevice(device)) {
				const result = await this.createImageGridResourceUrl(device, image.item.path, createTurboFileImagePreviewResourceOptions(this.isWindowsDevice(device), request, image.item.rawSize, image.item.rawModified));
				if (this.imageGridState !== state || !this.shouldKeepImageGridPreview(state, index)) {
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
					this.imageGridLoadedPreviewIndexes.add(index);
					await this.ensureImagePreviewElementLoaded(state, index);
				}
				return;
			}

			const result = await this.readImageGridImage(device, image.item.path, {
				encoding: 'base64',
				width: request.width,
				height: request.height,
				quality: request.quality,
				format: 'jpeg',
				interpolation: 'lanczos',
				maxBytes: 128 * 1024 * 1024,
				sourceSize: image.item.rawSize,
				sourceModified: image.item.rawModified
			});
			if (this.imageGridState !== state || !this.shouldKeepImageGridPreview(state, index)) {
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
			if (result.ok) {
				this.imageGridLoadedPreviewIndexes.add(index);
				await this.ensureImagePreviewElementLoaded(state, index);
			}
		} catch (error) {
			if (this.imageGridState === state) {
				image.previewError = error instanceof Error ? error.message : String(error);
			}
		} finally {
			if (this.imageGridState === state) {
				image.previewLoading = false;
				this.finishImageGridPreviewLoad(state, index, requestSeq, silent);
			}
		}
	}

	private finishImageGridPreviewLoad(state: TurboFileImageGridState, index: number, requestSeq?: number, silent: boolean = false): void {
		if (this.imageGridState !== state) {
			return;
		}
		if (state.previewPendingIndex === index && state.previewPendingRequestSeq !== undefined && this.commitImageGridPreviewIndexIfReady(state, index, state.previewPendingRequestSeq)) {
			this.scheduleImageGridPreviewNeighborsLoaded(state, index);
			return;
		}
		if (!silent && state.selectedIndex === index && (!requestSeq || requestSeq === this.imageGridPreviewRequestSeq)) {
			this.updateImagePreviewOverlay();
			this.scheduleImageGridPreviewNeighborsLoaded(state, index);
		}
	}

	private bindImageGridObserver(): void {
		if (this.activePage !== 'images' || !this.imageGridState || !this.container) {
			this.disposeImageGridObserver();
			return;
		}

		const body = this.container.querySelector('.turbofile-image-page-body') as HTMLElement | null;
		if (!body || !('IntersectionObserver' in getWindow(this.container))) {
			return;
		}

		this.disposeImageGridObserver();
		this.imageGridObserver = new IntersectionObserver(entries => {
			const state = this.imageGridState;
			if (!state) {
				return;
			}
			const visibleIndexes: number[] = [];
			for (const entry of entries) {
				if (!entry.isIntersecting) {
					continue;
				}
				const value = Number((entry.target as HTMLElement).dataset.imageIndex);
				if (Number.isFinite(value)) {
					visibleIndexes.push(value);
					this.imageGridObserver?.unobserve(entry.target);
				}
			}
			if (visibleIndexes.length) {
				void this.ensureImageGridThumbnailsLoaded(visibleIndexes);
			}
		}, {
			root: body,
			rootMargin: '320px',
			threshold: 0.01
		});

		const visibleIndexes: number[] = [];
		for (const card of Array.from(this.container.querySelectorAll('.turbofile-image-page-card[data-image-index]'))) {
			this.imageGridObserver.observe(card);
			const value = Number((card as HTMLElement).dataset.imageIndex);
			if (Number.isFinite(value)) {
				visibleIndexes.push(value);
			}
		}
		if (visibleIndexes.length) {
			this.scheduleImageGridThumbnailsLoaded(visibleIndexes);
		}
	}

	private disposeImageGridObserver(): void {
		if (!this.imageGridObserver) {
			return;
		}
		this.imageGridObserver.disconnect();
		this.imageGridObserver = undefined;
	}

	private updateImageGridCard(index: number): void {
		if (!this.container || this.activePage !== 'images') {
			return;
		}
		const card = this.container.querySelector(`.turbofile-image-page-card[data-image-index="${index}"]`) as HTMLElement | null;
		const state = this.imageGridState;
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
		return getTurboFileImageGridEffectiveColumns(base, this.getImageGridBodyWidth(), this.getImageGridMaxCardWidth(state), IMAGE_GRID_CARD_GAP);
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

	private getImageGridMaxImageWidth(state: TurboFileImageGridState): number {
		return this.getImageGridLayoutMetrics(state).maxImageWidth;
	}

	private getImageGridBaseCardWidth(state: TurboFileImageGridState): number {
		const columns = Math.max(1, state.columns);
		const width = this.getImageGridBodyWidth();
		const available = width - (IMAGE_GRID_CARD_GAP * Math.max(0, columns - 1));
		return Math.max(IMAGE_GRID_THUMB_MIN, available / columns);
	}

	private getImageGridBasePreviewHeight(state: TurboFileImageGridState): number {
		return this.getImageGridBaseCardWidth(state) * 150 / 220;
	}

	private getImageGridLayoutMetrics(state: TurboFileImageGridState): TurboFileImageGridLayoutMetrics {
		const baseCardWidth = this.getImageGridBaseCardWidth(state);
		if (this.imageGridLayoutMetrics?.state === state && this.imageGridLayoutMetrics.scale === state.thumbnailScale && this.imageGridLayoutMetrics.baseCardWidth === baseCardWidth) {
			return this.imageGridLayoutMetrics;
		}
		let cardWidth = baseCardWidth;
		let imageWidth = IMAGE_GRID_THUMB_MIN;
		let rowHeight = this.getImageGridBasePreviewHeight(state) + IMAGE_GRID_CARD_VERTICAL_CHROME;
		for (const image of state.images) {
			const size = this.getImageGridCardSize(state, image);
			cardWidth = Math.max(cardWidth, size.cardWidth);
			imageWidth = Math.max(imageWidth, size.imageWidth);
			rowHeight = Math.max(rowHeight, size.rowHeight);
		}
		this.imageGridLayoutMetrics = {
			state,
			scale: state.thumbnailScale,
			baseCardWidth,
			maxCardWidth: Math.max(1, Math.round(cardWidth)),
			maxImageWidth: Math.max(1, Math.round(imageWidth)),
			rowHeight: Math.max(150, Math.round(rowHeight))
		};
		return this.imageGridLayoutMetrics;
	}

	private clearImageGridLayoutMetrics(state?: TurboFileImageGridState): void {
		if (!state || this.imageGridLayoutMetrics?.state === state) {
			this.imageGridLayoutMetrics = undefined;
		}
	}

	private getImageGridBodyWidth(): number {
		if (this.imageGridBodyWidthCache !== undefined) {
			return this.imageGridBodyWidthCache;
		}
		const body = this.container?.querySelector<HTMLElement>('.turbofile-image-page-body');
		const measured = body?.clientWidth ?? 0;
		const width = measured > 0
			? Math.max(320, measured - 28)
			: Math.max(320, (this.container?.clientWidth ?? 1440) - 28);
		this.imageGridBodyWidthCache = width;
		return width;
	}

	private invalidateImageGridBodyWidthCache(): void {
		this.imageGridBodyWidthCache = undefined;
	}

	private getImageGridThumbnailRequestWidth(state: TurboFileImageGridState): number {
		const ownerWindow = this.container?.ownerDocument.defaultView;
		const dpr = Math.min(IMAGE_DPR_CAP, ownerWindow?.devicePixelRatio || 1);
		const scaled = Math.round(this.getImageGridMaxImageWidth(state) * dpr);
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

	private handleImageGridScroll(body: HTMLElement): void {
		const state = this.imageGridState;
		if (!state) {
			return;
		}
		state.scrollTop = body.scrollTop;
		state.viewportHeight = body.clientHeight || state.viewportHeight;
		this.trimImageGridThumbnailQueue(state);
		if (this.imageGridScrollRaf || !this.container) {
			return;
		}
		this.imageGridScrollRaf = getWindow(this.container).requestAnimationFrame(() => {
			this.imageGridScrollRaf = 0;
			if (this.activePage !== 'images' || this.imageGridState !== state) {
				return;
			}
			const range = this.getImageGridVirtualRange(state);
			const rendered = this.imageGridRenderedRange;
			if (rendered && rendered.startIndex === range.startIndex && rendered.endIndex === range.endIndex && rendered.columns === this.getImageGridEffectiveColumns(state) && rendered.total === state.images.length) {
				return;
			}
			this.clearImageGridScrollTimer();
			this.updateImageGridVirtualSlice(state, range);
		});
	}

	private handleImageGridWheel(event: WheelEvent, body: HTMLElement): void {
		const state = this.imageGridState;
		if (!state || !event.ctrlKey || event.altKey || event.metaKey) {
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
			this.setImageGridColumns(state.columns - 1);
		}
		while (this.imageGridCtrlWheelDeltaRemainder >= IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD) {
			this.imageGridCtrlWheelDeltaRemainder -= IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD;
			this.setImageGridColumns(state.columns + 1);
		}
	}

	private normalizeImageGridColumns(columns: number): TurboFileImageGridColumns {
		const rounded = Math.round(columns);
		return clampNumber(rounded, IMAGE_GRID_COLUMN_MIN, this.getImageGridMaxColumns());
	}

	private getImageGridMaxColumns(): TurboFileImageGridColumns {
		const width = this.getImageGridBodyWidth();
		return Math.max(IMAGE_GRID_COLUMN_MIN, Math.floor((width + IMAGE_GRID_CARD_GAP) / (IMAGE_GRID_THUMB_MIN + IMAGE_GRID_CARD_GAP)));
	}

	private updateImageGridVirtualSlice(state: TurboFileImageGridState, range: TurboFileImageGridRange): void {
		if (!this.container || this.imageGridState !== state || this.activePage !== 'images') {
			return;
		}
		const grid = this.container.querySelector<HTMLElement>('.turbofile-image-page-grid');
		if (!grid) {
			return;
		}
		// The body-width cache means renderImageGridSlice no longer forces a layout mid-refill, so the
		// browser should not collapse scrollHeight and clamp scrollTop. As a safety net, capture the
		// live scroll position before the rebuild and only restore it if the rebuild actually drove
		// scrollTop backwards (a collapse). Using the live pre-render value — not the stale state —
		// ensures we never yank against ongoing inertial scrolling, which is what caused the jitter.
		const body = this.container.querySelector<HTMLElement>('.turbofile-image-page-body');
		const scrollTopBeforeRender = body ? body.scrollTop : state.scrollTop;
		this.renderImageGridSlice(grid, state, range);
		if (body && body.scrollTop < scrollTopBeforeRender) {
			body.scrollTop = scrollTopBeforeRender;
			state.scrollTop = scrollTopBeforeRender;
		}
	}

	private clearImageGridScrollTimer(): void {
		if (!this.imageGridScrollRenderTimer) {
			return;
		}
		clearTimeout(this.imageGridScrollRenderTimer);
		this.imageGridScrollRenderTimer = undefined;
	}

	private clearImageGridScrollRaf(): void {
		if (!this.imageGridScrollRaf || !this.container) {
			this.imageGridScrollRaf = 0;
			return;
		}
		getWindow(this.container).cancelAnimationFrame(this.imageGridScrollRaf);
		this.imageGridScrollRaf = 0;
	}

	private clearImageGridPreviewPrefetchTimer(): void {
		if (!this.imageGridPreviewPrefetchTimer) {
			return;
		}
		clearTimeout(this.imageGridPreviewPrefetchTimer);
		this.imageGridPreviewPrefetchTimer = undefined;
	}

	private getImageGridVisibleIndexes(state: TurboFileImageGridState): number[] {
		const rendered = this.imageGridRenderedRange;
		const range = this.imageGridState === state && rendered && rendered.columns === this.getImageGridEffectiveColumns(state) && rendered.total === state.images.length
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

	private clearImageGridLoadedImageIndexes(): void {
		this.imageGridLoadedThumbnailIndexes.clear();
		this.imageGridLoadedPreviewIndexes.clear();
	}

	private isImageGridIndexNearViewport(state: TurboFileImageGridState, index: number): boolean {
		const rendered = this.imageGridRenderedRange;
		if (this.imageGridState === state && rendered && rendered.columns === this.getImageGridEffectiveColumns(state) && rendered.total === state.images.length) {
			return index >= rendered.startIndex && index < rendered.endIndex;
		}
		const range = this.getImageGridVirtualRange(state);
		return index >= range.startIndex && index < range.endIndex;
	}

	private releaseImageGridImagesOutsideRange(state: TurboFileImageGridState, range: TurboFileImageGridRange): void {
		const keepRowWidth = this.getImageGridEffectiveColumns(state);
		const keepThumbnailStart = Math.max(0, range.startIndex - keepRowWidth);
		const keepThumbnailEnd = Math.min(state.images.length, range.endIndex + keepRowWidth);
		for (const index of Array.from(this.imageGridLoadedThumbnailIndexes)) {
			const image = state.images[index];
			if (!image) {
				this.imageGridLoadedThumbnailIndexes.delete(index);
				continue;
			}
			const keepThumbnail = index >= keepThumbnailStart && index < keepThumbnailEnd;
			if (!keepThumbnail && (image.thumbnailUrl || image.thumbnailContent || image.thumbnailError)) {
				this.releaseImageBlobUrl(image.thumbnailUrl);
				image.thumbnailUrl = undefined;
				image.thumbnailContent = '';
				image.thumbnailError = undefined;
				this.imageGridLoadedThumbnailIndexes.delete(index);
			}
		}

		for (const index of Array.from(this.imageGridLoadedPreviewIndexes)) {
			const image = state.images[index];
			if (!image) {
				this.imageGridLoadedPreviewIndexes.delete(index);
				continue;
			}
			const keepPreview = this.shouldKeepImageGridPreview(state, index);
			if (!keepPreview && (image.previewUrl || image.previewContent || image.previewError)) {
				this.releaseImageBlobUrl(image.previewUrl);
				image.previewUrl = undefined;
				image.previewContent = '';
				image.previewError = undefined;
				image.previewImage = undefined;
				image.previewImageKey = undefined;
				image.previewImageLoading = undefined;
				image.previewImageLoadingKey = undefined;
				this.imageGridLoadedPreviewIndexes.delete(index);
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
		image.previewUrl = undefined;
		image.previewContent = '';
		image.previewLoading = false;
		image.previewError = undefined;
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
		if (this.imageGridState !== state || !state.previewVisible) {
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
		if (this.imageGridState !== state) {
			return;
		}
		const image = state.images[index];
		if (!image) {
			return;
		}
		image.thumbnailUrl = undefined;
		image.thumbnailContent = '';
		image.thumbnailError = '缩略图解码失败';
		this.updateImageGridCard(index);
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

	private updateImageGridSelection(): void {
		const state = this.imageGridState;
		if (!this.container || !state) {
			return;
		}

		const selectedIndexes = new Set(this.getImageGridSelectedIndexes(state));
		for (const card of Array.from(this.container.querySelectorAll<HTMLElement>('.turbofile-image-page-card[data-image-index]'))) {
			const index = Number(card.dataset.imageIndex);
			const selected = Number.isFinite(index) && selectedIndexes.has(index);
			card.classList.toggle('is-selected', selected);
			card.classList.toggle('is-focused', Number.isFinite(index) && state.selectedIndex === index);
			card.setAttribute('aria-selected', selected ? 'true' : 'false');
		}

		const deleteButton = this.container.querySelector<HTMLButtonElement>('.turbofile-image-page-action.is-delete');
		if (deleteButton) {
			const deleteTargetCount = this.getImageGridDeleteTargets(state).length;
			deleteButton.disabled = deleteTargetCount === 0;
			deleteButton.title = deleteTargetCount ? '\u5220\u9664\u9009\u4e2d\u56fe\u7247' : '\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u56fe\u7247';
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

	/**
	 * Keeps transfer pages on the left and opened documents on the right: returns the tab index
	 * immediately after the last TurboFile transfer page in the current group, so a document never
	 * gets inserted between two transfer pages. Returns undefined to fall back to the default slot.
	 */
	private getDocumentEditorTargetIndex(): number | undefined {
		const editors = this.group?.editors;
		if (!editors || editors.length === 0) {
			return undefined;
		}
		let index = 0;
		for (let i = 0; i < editors.length; i++) {
			if (editors[i] instanceof TurboFileEditorInput) {
				index = i + 1;
			}
		}
		return index;
	}

	private async openNativeDocument(side: 'left' | 'right', item: TurboFileFileItem, device: TurboFileDevice): Promise<void> {
		if (!item.path) {
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
			const pane = await this.editorService.openEditor(fileEditor, {
				pinned: true,
				revealIfOpened: true,
				override: DEFAULT_EDITOR_ASSOCIATION.id,
				index: this.getDocumentEditorTargetIndex()
			});
			// The `index` above is only a hint and is unreliable when the document opens into a group
			// other than the transfer page's (e.g. focus was in an already-open document). Enforce the
			// invariant afterwards: a document tab must never sit to the left of a transfer page.
			this.ensureDocumentTabRightOfTransfer(pane?.group, pane?.input);
		} catch (error) {
			reportOpenError(error);
		}
	}

	/**
	 * Guarantees the "transfer pages on the left, documents on the right" tab order: if the opened
	 * document ended up to the left of any TurboFile transfer page in its group, move it to the end.
	 */
	private ensureDocumentTabRightOfTransfer(group: IEditorGroup | undefined, input: EditorInput | undefined): void {
		if (!group || !input) {
			return;
		}
		const editors = group.editors;
		const currentIndex = editors.indexOf(input);
		if (currentIndex < 0) {
			return;
		}
		const hasTransferToRight = editors.slice(currentIndex + 1).some(editor => editor instanceof TurboFileEditorInput);
		if (hasTransferToRight) {
			group.moveEditor(input, group, { index: editors.length - 1 });
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
			const result = await this.sshService.compressPath(await this.toTransferEndpoint(device, item.path));
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
			const result = await this.sshService.extractPath(await this.toTransferEndpoint(device, item.path));
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
			const result = await this.sshService.calculatePathSize(await this.toTransferEndpoint(device, item.path));
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
			state.scrollTop = Math.max(0, (index - 4) * FILE_LIST_ROW_HEIGHT);
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

	private rememberTerminalPanelHiddenForCurrentPage(): void {
		if (!this.isEditorVisible) {
			return;
		}
		const pageInstanceId = this.currentInput?.instanceId;
		if (!pageInstanceId || this.getBoundTerminalsForPage(pageInstanceId).length === 0) {
			return;
		}
		turboFileTerminalPanelHiddenByPageId.add(pageInstanceId);
	}

	private beginTerminalPanelVisibilityChange(): void {
		if (this.terminalPanelVisibilityResetHandle !== undefined) {
			getWindow(this.container).clearTimeout(this.terminalPanelVisibilityResetHandle);
			this.terminalPanelVisibilityResetHandle = undefined;
		}
		this.terminalPanelVisibilityChangeDepth++;
		this.terminalPanelVisibilityInProgress = true;
	}

	private endTerminalPanelVisibilityChange(): void {
		this.terminalPanelVisibilityChangeDepth = Math.max(0, this.terminalPanelVisibilityChangeDepth - 1);
		if (this.terminalPanelVisibilityChangeDepth > 0) {
			return;
		}
		this.terminalPanelVisibilityResetHandle = getWindow(this.container).setTimeout(() => {
			this.terminalPanelVisibilityResetHandle = undefined;
			if (this.terminalPanelVisibilityChangeDepth === 0) {
				this.terminalPanelVisibilityInProgress = false;
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
		const recursivePlan = await this.tryBuildRecursiveSyncPlan(task);
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
		counter.count++;
		if (counter.count > SYNC_RECURSIVE_SCAN_LIMIT) {
			throw new Error(`递归同步扫描超过 ${SYNC_RECURSIVE_SCAN_LIMIT} 项，请进入更小的目录后再同步。`);
		}
		if (task && counter.count % 25 === 0) {
			this.updateTask(task, `正在扫描${this.getSideLabel(side)}：${relativeRoot || '.'}`, 8);
		}

		const items = await this.listPaneDirectory(side, rootPath);
		const entries: TurboFileSyncTreeEntry[] = [];
		for (const item of items) {
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

	private async toTransferEndpoint(device: TurboFileDevice, path: string): Promise<ITurboFileTransferEndpoint> {
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
			connection: await this.getSshConnectionOptions(device),
			label: device.name,
			supportsRsync: device.capabilities.rsync,
			supportsTar: device.capabilities.tar ?? device.capabilities.archive,
			preferredProtocol: device.preferredTransferProtocol
		};
	}

	private async getSshConnectionOptions(device: TurboFileDevice): Promise<ITurboFileSshConnectionOptions> {
		return {
			host: device.host,
			port: device.port,
			username: device.username,
			password: await this.deviceStore?.getPassword(device.id),
			privateKey: await this.deviceStore?.getPrivateKey(device.id),
			privateKeyPath: device.privateKeyPath,
			passphrase: await this.deviceStore?.getPassphrase(device.id)
		};
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
		const showDotNames = this.isWindowsDevice(device);
		return [...parent, ...entries.filter(entry => showDotNames || !isHiddenFileName(entry.name)).map(entry => this.toFileItem(entry))];
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
		return [this.localWindowsDevice, ...this.devices];
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
		return this.environmentService.userHome.fsPath || LOCAL_WINDOWS_FALLBACK_PATH;
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
		const desktopPath = joinPanePath(this.getLocalWindowsDefaultPath(), 'Desktop', true);
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
		const desktopPath = joinPanePath(this.getLocalWindowsDefaultPath(), 'Desktop', true);
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
		const homePath = this.getLocalWindowsDefaultPath();
		const desktopPath = joinPanePath(homePath, 'Desktop', true);
		const actions: IAction[] = [
			this.menuAction(`turbofile.windowsLocation.${side}.desktop`, '桌面', this.getWindowsLocationMenuIconClass(desktopPath), () => this.openWindowsLocalPath(side, desktopPath, '桌面'), true, isSameWindowsPath(state.path, desktopPath)),
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
		return this.getAllDevices().find(device => device.id === state.deviceId);
	}

	private getDeviceById(deviceId: string): TurboFileDevice | undefined {
		return this.getAllDevices().find(device => device.id === deviceId);
	}

	private renderFileBrowserIcon(item: TurboFileFileItem): Element {
		if (item.parent) {
			return renderTurboFileIcon('arrow-up-circle', 'primary');
		}
		if (item.directory) {
			return renderTurboFileIcon('folder-fill', 'warning');
		}

		const icon = $('span.turbofile-file-theme-icon.monaco-icon-label') as HTMLSpanElement;
		const resource = item.path ? URI.file(item.path) : undefined;
		icon.classList.add(...getIconClasses(this.modelService, this.languageService, resource, FileKind.FILE));
		icon.setAttribute('aria-hidden', 'true');
		return icon;
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
		if (side === 'right') {
			this.hasAppliedInitialRightPaneDefault = true;
		}
		if (state.deviceId === device.id) {
			state.error = undefined;
			this.clearPaneSelection(side);
			this.render();
			void this.refreshPane(side, { path: state.path || this.getDefaultPaneDevicePath(device), force: true, silent: true });
			return;
		}
		this.rememberPaneDeviceSnapshot(side);
		++this.paneRequestSeq[side];
		state.deviceId = device.id;
		const targetPath = this.getInitialPaneDevicePath(side, device);
		const snapshot = this.getPaneDeviceSnapshot(side, device);
		const cached = this.getCachedPaneDirectory(device, targetPath);
		state.path = targetPath;
		state.items = snapshot?.path === targetPath ? snapshot.items : cached?.items ?? [];
		state.error = undefined;
		this.resetPaneScroll(side);
		if (snapshot?.path === targetPath) {
			state.scrollTop = snapshot.scrollTop;
		}
		this.clearPaneSelection(side);
		this.statusMessage = `已在${this.getSideLabel(side)}打开设备：${device.name}`;
		this.render();
		if (cached) {
			this.applyPaneDirectoryEntry(side, device, cached);
			this.render();
			return;
		}
		void this.refreshPane(side, { path: targetPath, silent: true });
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
			this.appendSelectField(form, 'authType', '认证方式', [
				['password', '密码'],
				['privateKey', '私钥']
			], editingDevice?.authType ?? 'password');
			this.appendProtocolField(form, editingDevice);
			this.appendInputField(form, 'password', '密码', isEditing ? '留空保持原密码' : '', 'password', true);
			this.appendInputField(form, 'privateKeyPath', '私钥路径', 'C:\\Users\\User\\.ssh\\id_rsa', 'text', true, editingDevice?.privateKeyPath);
			this.appendInputField(form, 'passphrase', '私钥口令', isEditing ? '留空保持原私钥口令' : '', 'password', true);
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
		window.setTimeout(() => {
			const firstInput = form.querySelector<HTMLInputElement>('input[name="name"]');
			firstInput?.focus({ preventScroll: true });
			firstInput?.select();
		}, 0);
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
	return /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(name);
}

function getFileExtensionLower(name: string): string {
	const dotIndex = name.lastIndexOf('.');
	return dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
}

function compareImageGridImagesBy(a: TurboFileImageGridImage, b: TurboFileImageGridImage, key: TurboFileImageGridSortKey): number {
	switch (key) {
		case 'size':
			return (a.item.rawSize || 0) - (b.item.rawSize || 0);
		case 'date':
			return (a.item.rawModified || 0) - (b.item.rawModified || 0);
		case 'type':
			return IMAGE_GRID_SORT_COLLATOR.compare(getFileExtensionLower(a.item.name), getFileExtensionLower(b.item.name));
		case 'dimensions':
			return ((a.width || 0) * (a.height || 0)) - ((b.width || 0) * (b.height || 0));
		case 'name':
		default:
			return IMAGE_GRID_SORT_COLLATOR.compare(a.item.name, b.item.name);
	}
}

function sortImageGridImages(images: TurboFileImageGridImage[], key: TurboFileImageGridSortKey, descending: boolean): void {
	images.sort((a, b) => {
		let comparison = compareImageGridImagesBy(a, b, key);
		if (comparison === 0 && key !== 'name') {
			comparison = IMAGE_GRID_SORT_COLLATOR.compare(a.item.name, b.item.name);
		}
		return descending ? -comparison : comparison;
	});
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
