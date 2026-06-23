var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import "./media/turbofile.css";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import { $, clearNode, getWindow } from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { decodeBase64, encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { joinPath } from "../../../../base/common/resources.js";
import { Separator, toAction } from "../../../../base/common/actions.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITurboFileSshService } from "../../../../platform/turbofile/common/turbofile.js";
import { resolveTransferPlan } from "../../../../platform/turbofile/common/turbofileTransferPlan.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { createFileSystemProviderError, FileChangeType, FileKind, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileService } from "../../../../platform/files/common/files.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { CodeDataTransfers, getPathForFile } from "../../../../platform/dnd/browser/dnd.js";
import { ProcessPropertyType, TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ColorScheme } from "../../../../platform/theme/common/theme.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IUpdateService } from "../../../../platform/update/common/update.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { DEFAULT_EDITOR_ASSOCIATION } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ITextEditorService } from "../../../services/textfile/common/textEditorService.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { ITerminalGroupService, ITerminalService } from "../../terminal/browser/terminal.js";
import { BasePty } from "../../terminal/common/basePty.js";
import { ITerminalProfileService } from "../../terminal/common/terminal.js";
import { ColorThemeData } from "../../../services/themes/common/colorThemeData.js";
import { COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS, IWorkbenchThemeService, ThemeSettings, ThemeSettingDefaults } from "../../../services/themes/common/workbenchThemeService.js";
import { defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { defaultTurboFileTransferProtocol } from "../common/turbofileTypes.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { TurboFileEditorInput } from "../common/turbofileEditorInput.js";
import { TurboFileDeviceStore } from "./turbofileDeviceStore.js";
import { turboFileWorkbenchBridge } from "./turbofileWorkbenchBridge.js";
import { TurboFileDirectoryInflightTracker } from "../common/turbofileDirectoryInflight.js";
import { getTurboFileDirectoryMoveRefreshPaths, getTurboFileRowDragEffectAllowed, shouldHandleTurboFilePaneDropAtPage } from "../common/turbofileDragDrop.js";
import { getTurboFileImageGridCardSize, getTurboFileImageGridEffectiveColumns } from "../common/turbofileImageGridSizing.js";
import { createTurboFileImageGridResourceOptions, createTurboFileImagePreviewResourceOptions } from "../common/turbofileImageResource.js";
import { getTurboFileTitlebarUpdateActionKind } from "../common/turbofileTitlebar.js";
import { chooseDisplayTransferSpeed, getVisibleTransferStartedAt, isTurboFileRsyncStrategy, shouldStartTransferTiming, TURBOFILE_RSYNC_PROGRESS_RENDER_INTERVAL_MS, TURBOFILE_RSYNC_STARTUP_TICK_INTERVAL_MS, TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS } from "../common/turbofileTransferDisplay.js";
const turboFileTerminalPageByTerminalId = /* @__PURE__ */ new Map();
const turboFileLastActiveTerminalByPageId = /* @__PURE__ */ new Map();
const turboFileTerminalPanelHiddenByPageId = /* @__PURE__ */ new Set();
const LOCAL_WINDOWS_DEVICE_ID = "local-windows";
const LOCAL_WINDOWS_FALLBACK_PATH = "C:\\";
const SYNC_RECURSIVE_SCAN_LIMIT = 5e3;
const TURBOFILE_REMOTE_DOCUMENT_SCHEME = "turbofile-remote";
const FILE_LIST_ROW_HEIGHT = 30;
const FILE_LIST_OVERSCAN_ROWS = 24;
const FILE_LIST_DEFAULT_VIEWPORT_HEIGHT = 720;
const PANE_DIRECTORY_CACHE_TTL_MS = 12e4;
const PANE_DIRECTORY_CACHE_MAX_ENTRIES = 256;
const PANE_DIRECTORY_PREFETCH_LIMIT = 12;
const PANE_DIRECTORY_VISIBLE_PREFETCH_LIMIT = 8;
const PANE_DEVICE_SNAPSHOT_TTL_MS = 3e5;
const PANE_FAST_DOUBLE_CLICK_MS = 300;
const TRANSFER_PROGRESS_RENDER_INTERVAL_MS = TURBOFILE_TRANSFER_PROGRESS_RENDER_INTERVAL_MS;
const RSYNC_PROGRESS_RENDER_INTERVAL_MS = TURBOFILE_RSYNC_PROGRESS_RENDER_INTERVAL_MS;
const TRANSFER_SPEED_SAMPLE_MIN_INTERVAL_MS = 350;
const TRANSFER_SPEED_SAMPLE_MAX_COUNT = 8;
const TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY = "turbofile.browser.fontSize";
const TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY = "turbofile.browser.fontFamily";
const TURBOFILE_UI_FONT_SIZE_STORAGE_KEY = "turbofile.ui.fontSize";
const TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY = "turbofile.ui.fontFamily";
const TURBOFILE_LOCAL_WINDOWS_DEFAULT_PATH_STORAGE_KEY = "turbofile.localWindows.defaultPath";
const TURBOFILE_LOCAL_WINDOWS_TRANSFER_PROTOCOL_STORAGE_KEY = "turbofile.localWindows.preferredTransferProtocol";
const TURBOFILE_UI_DEFAULT_FONT_SIZE = 14;
const TURBOFILE_DEFAULT_FONT_FAMILY = '"Archivo", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif';
const TURBOFILE_UI_DEFAULT_FONT_FAMILY = TURBOFILE_DEFAULT_FONT_FAMILY;
const TURBOFILE_BROWSER_DEFAULT_FONT_SIZE = 14;
const TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY = TURBOFILE_DEFAULT_FONT_FAMILY;
const TURBOFILE_UI_FONT_FAMILIES = [
  [TURBOFILE_DEFAULT_FONT_FAMILY, "Archivo / Microsoft YaHei"],
  ['"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif', "Microsoft YaHei UI"],
  ['"Microsoft YaHei", "Microsoft YaHei UI", "Segoe UI", sans-serif', "\u5FAE\u8F6F\u96C5\u9ED1"],
  ['"Cascadia Code", Consolas, "Microsoft YaHei UI", monospace', "Cascadia Code"],
  ['Consolas, "Microsoft YaHei UI", "Microsoft YaHei", monospace', "Consolas"],
  ['Arial, "Microsoft YaHei UI", "Microsoft YaHei", sans-serif', "Arial"]
];
const TURBOFILE_BROWSER_FONT_FAMILIES = TURBOFILE_UI_FONT_FAMILIES;
const IMAGE_GRID_THUMBNAIL_SCALE_OPTIONS = [1, 2, 3, 4, 5, 6];
const IMAGE_GRID_SORT_OPTIONS = [
  { key: "name", label: "\u540D\u79F0" },
  { key: "date", label: "\u4FEE\u6539\u65E5\u671F" },
  { key: "type", label: "\u7C7B\u578B" },
  { key: "size", label: "\u5927\u5C0F" },
  { key: "dimensions", label: "\u5C3A\u5BF8" }
];
const IMAGE_GRID_SORT_COLLATOR = new Intl.Collator(void 0, { numeric: true, sensitivity: "base" });
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
const TURBOFILE_APPEARANCE_DARK_THEME_LABEL = "2017 Dark (Visual Studio - C/C++)";
const TURBOFILE_APPEARANCE_LIGHT_THEME_LABEL = "TurboFile Light";
const TURBOFILE_LIGHT_THEME_ID = ThemeSettingDefaults.COLOR_THEME_LIGHT;
const TURBOFILE_LIGHT_THEME_CLASS_ID = "vs turbofile-light-2026";
const TURBOFILE_LIGHT_THEME_COLORS = {
  "focusBorder": "#042AFF",
  "foreground": "#111111",
  "descriptionForeground": "#6B7280",
  "disabledForeground": "#9E9E9E",
  "errorForeground": "#ef4444",
  "selection.background": "#DDE6FF",
  "icon.foreground": "#6B7280",
  "activityBar.background": "#ffffff",
  "activityBar.foreground": "#111111",
  "activityBar.inactiveForeground": "#6B7280",
  "activityBar.activeBorder": "#042AFF",
  "activityBar.activeBackground": "#F3F3F3",
  "activityBar.border": "#E5E7EB",
  "activityBarBadge.background": "#042AFF",
  "activityBarBadge.foreground": "#ffffff",
  "sideBar.background": "#ffffff",
  "sideBar.foreground": "#111111",
  "sideBar.border": "#E5E7EB",
  "sideBarTitle.foreground": "#111111",
  "sideBarSectionHeader.background": "#F3F3F3",
  "sideBarSectionHeader.foreground": "#111111",
  "sideBarSectionHeader.border": "#E5E7EB",
  "editor.background": "#ffffff",
  "editor.foreground": "#111111",
  "editorLineNumber.foreground": "#9E9E9E",
  "editorLineNumber.activeForeground": "#042AFF",
  "editorCursor.foreground": "#111111",
  "editor.selectionBackground": "#DDE6FF",
  "editor.inactiveSelectionBackground": "#EDF2FF",
  "editorIndentGuide.background1": "#E5E7EB",
  "editorIndentGuide.activeBackground1": "#9E9E9E",
  "editor.findMatchBackground": "#E1FF25",
  "editor.findMatchHighlightBackground": "#E1FF2580",
  "editorGroupHeader.tabsBackground": "#F3F3F3",
  "editorGroupHeader.tabsBorder": "#E5E7EB",
  "editorGroup.border": "#E5E7EB",
  "tab.activeBackground": "#ffffff",
  "tab.activeForeground": "#111111",
  "tab.activeBorder": "#042AFF",
  "tab.inactiveBackground": "#F3F3F3",
  "tab.inactiveForeground": "#6B7280",
  "tab.border": "#E5E7EB",
  "panel.background": "#ffffff",
  "panel.border": "#E5E7EB",
  "panelTitle.activeForeground": "#111111",
  "panelTitle.inactiveForeground": "#6B7280",
  "statusBar.background": "#111F68",
  "statusBar.foreground": "#ffffff",
  "statusBar.border": "#0B164B",
  "statusBar.noFolderBackground": "#111F68",
  "titleBar.activeBackground": "#ffffff",
  "titleBar.activeForeground": "#111111",
  "titleBar.inactiveBackground": "#ffffff",
  "titleBar.inactiveForeground": "#6B7280",
  "titleBar.border": "#E5E7EB",
  "list.activeSelectionBackground": "#EDF2FF",
  "list.activeSelectionForeground": "#111111",
  "list.inactiveSelectionBackground": "#F3F3F3",
  "list.inactiveSelectionForeground": "#111111",
  "list.hoverBackground": "#F3F3F3",
  "list.focusBackground": "#EDF2FF",
  "list.focusOutline": "#042AFF",
  "list.highlightForeground": "#042AFF",
  "input.background": "#ffffff",
  "input.foreground": "#111111",
  "input.border": "#E5E7EB",
  "input.placeholderForeground": "#9E9E9E",
  "dropdown.background": "#ffffff",
  "dropdown.foreground": "#111111",
  "dropdown.border": "#E5E7EB",
  "inputOption.activeBackground": "#EDF2FF",
  "inputOption.activeBorder": "#042AFF",
  "inputOption.activeForeground": "#042AFF",
  "button.background": "#042AFF",
  "button.foreground": "#ffffff",
  "button.hoverBackground": "#111F68",
  "button.secondaryBackground": "#ffffff",
  "button.secondaryForeground": "#111111",
  "button.secondaryHoverBackground": "#F3F3F3",
  "badge.background": "#EDF2FF",
  "badge.foreground": "#042AFF",
  "progressBar.background": "#22C55E",
  "breadcrumb.background": "#ffffff",
  "breadcrumb.foreground": "#6B7280",
  "breadcrumb.focusForeground": "#042AFF",
  "breadcrumb.activeSelectionForeground": "#042AFF",
  "scrollbar.shadow": "#00000000",
  "scrollbarSlider.background": "#D1D5DB80",
  "scrollbarSlider.hoverBackground": "#9E9E9E80",
  "scrollbarSlider.activeBackground": "#6B728080",
  "menu.background": "#ffffff",
  "menu.foreground": "#111111",
  "menu.selectionBackground": "#EDF2FF",
  "menu.selectionForeground": "#111111",
  "menu.border": "#E5E7EB",
  "quickInput.background": "#ffffff",
  "quickInput.foreground": "#111111",
  "quickInputList.focusBackground": "#EDF2FF",
  "editorWidget.background": "#ffffff",
  "editorWidget.foreground": "#111111",
  "editorWidget.border": "#E5E7EB",
  "widget.shadow": "#111F6814",
  "textLink.foreground": "#042AFF",
  "textLink.activeForeground": "#111111",
  "toolbar.hoverBackground": "#F3F3F3",
  "toolbar.activeBackground": "#EDF2FF",
  "notifications.background": "#ffffff",
  "notifications.foreground": "#111111",
  "notifications.border": "#E5E7EB",
  "terminal.background": "#ffffff",
  "terminal.foreground": "#111111",
  "gitDecoration.addedResourceForeground": "#22C55E",
  "gitDecoration.modifiedResourceForeground": "#042AFF",
  "gitDecoration.deletedResourceForeground": "#FF64DA",
  "editorGutter.addedBackground": "#22C55E",
  "editorGutter.modifiedBackground": "#042AFF",
  "editorGutter.deletedBackground": "#FF64DA",
  "testing.iconPassed": "#22C55E",
  "testing.iconFailed": "#ef4444",
  "testing.iconQueued": "#042AFF",
  "charts.blue": "#042AFF",
  "charts.green": "#22C55E",
  "charts.yellow": "#E1FF25",
  "charts.purple": "#FF64DA"
};
let TurboFileEditor = class extends EditorPane {
  constructor(group, telemetryService, workbenchThemeService, storageService, environmentService, sshService, contextMenuService, contextViewService, fileService, modelService, languageService, instantiationService, editorService, textEditorService, terminalService, terminalGroupService, terminalProfileService, quickInputService, clipboardService, configurationService, layoutService, updateService, productService, labelService) {
    super(new.target.ID, group, telemetryService, workbenchThemeService, storageService);
    this.workbenchThemeService = workbenchThemeService;
    this.storageService = storageService;
    this.environmentService = environmentService;
    this.sshService = sshService;
    this.contextMenuService = contextMenuService;
    this.contextViewService = contextViewService;
    this.fileService = fileService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.textEditorService = textEditorService;
    this.terminalService = terminalService;
    this.terminalGroupService = terminalGroupService;
    this.terminalProfileService = terminalProfileService;
    this.quickInputService = quickInputService;
    this.clipboardService = clipboardService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.updateService = updateService;
    this.productService = productService;
    this.labelService = labelService;
    this.renderDisposables = this._register(new DisposableStore());
    this.devices = [];
    this.imageGridSortKey = "name";
    this.imageGridSortDescending = false;
    this.imageGridScrollRaf = 0;
    this.imageGridThumbnailQueue = [];
    this.imageGridThumbnailQueued = /* @__PURE__ */ new Set();
    this.imageGridThumbnailLoadingCount = 0;
    this.imageGridPreviewRequestSeq = 0;
    this.imageGridLoadedThumbnailIndexes = /* @__PURE__ */ new Set();
    this.imageGridLoadedPreviewIndexes = /* @__PURE__ */ new Set();
    this.imageGridCtrlWheelDeltaRemainder = 0;
    this.imagePreviewRenderSeq = 0;
    this.imageReadCache = /* @__PURE__ */ new Map();
    this.fileListScrollRaf = { left: 0, right: 0 };
    this.fileListRestoreRaf = { left: 0, right: 0 };
    this.fileListRenderedRange = { left: void 0, right: void 0 };
    // Lazy size/date enrichment of names-only remote listings: serialize per side and remember if more
    // rows scrolled into view while a batch was in flight so they get picked up right after.
    this.remoteEnrichInFlight = { left: false, right: false };
    this.remoteEnrichAgain = { left: false, right: false };
    this.paneDirectoryCache = /* @__PURE__ */ new Map();
    this.paneDirectoryInflight = new TurboFileDirectoryInflightTracker();
    this.paneDeviceSnapshots = /* @__PURE__ */ new Map();
    this.activePage = "transfer";
    this.activeFilePaneSide = "left";
    this.isTaskLogVisible = false;
    this.paneRequestSeq = { left: 0, right: 0 };
    this.paneDoubleClickState = {
      left: { lastAt: 0 },
      right: { lastAt: 0 }
    };
    this.isDeviceFormVisible = false;
    this.hasAppliedInitialRightPaneDefault = false;
    this.deviceFormMessage = "";
    this.pendingRenderAfterDeviceSelectClose = false;
    this.deviceConnectionMessages = /* @__PURE__ */ new Map();
    this.deviceRuntimeStatuses = /* @__PURE__ */ new Map();
    this.availableColorThemes = [];
    this.isLoadingColorThemes = false;
    this.hasLoadedColorThemes = false;
    this.taskbarHiddenForTerminal = false;
    this.terminalRevealInProgress = false;
    this.terminalPanelVisibilityInProgress = false;
    this.terminalPanelVisibilityChangeDepth = 0;
    this.hasStartedNativeWindowsDrag = false;
    this.windowsClipboardPasteInFlight = /* @__PURE__ */ new Set();
    this.availableWindowsDriveRoots = [];
    this.statusMessage = "\u6781\u901F\u4F20\u5DF2\u542F\u52A8\uFF1A\u53CC\u680F\u6D4F\u89C8\u3001\u8BBE\u5907\u7BA1\u7406\u3001\u4F20\u8F93\u3001\u9884\u89C8\u548C\u7EC8\u7AEF\u5165\u53E3\u5DF2\u63A5\u5165\u3002";
    this.taskSequence = 1;
    this.tasks = [];
    this.isEditorVisible = false;
    this.remoteDocumentLabelFormatterRegistered = false;
    this.localWindowsDevice = this.createLocalWindowsDevice();
    const localWindowsDefaultPath = this.getLocalWindowsDeviceDefaultPath();
    this.paneStates = {
      left: {
        deviceId: LOCAL_WINDOWS_DEVICE_ID,
        path: localWindowsDefaultPath,
        items: [],
        loading: false,
        selectedPaths: /* @__PURE__ */ new Set(),
        scrollTop: 0,
        viewportHeight: 0
      },
      right: {
        deviceId: LOCAL_WINDOWS_DEVICE_ID,
        path: localWindowsDefaultPath,
        items: [],
        loading: false,
        selectedPaths: /* @__PURE__ */ new Set(),
        scrollTop: 0,
        viewportHeight: 0
      }
    };
  }
  static {
    this.ID = TurboFileEditorInput.EDITOR_ID;
  }
  createEditor(parent) {
    this.editorGroupContainer = parent.closest(".editor-group-container");
    this.editorGroupContainer?.classList.add("turbofile-main-editor-group");
    this.container = $(".turbofile-workbench");
    parent.appendChild(this.container);
    this.deviceStore = this.instantiationService.createInstance(TurboFileDeviceStore);
    this.devices = this.deviceStore.loadDevices();
    void this.ensureDefaultSshDevices();
    void this.ensureTurboFileChrome();
    this.ensureRemoteFileSystemProvider();
    this._register(turboFileWorkbenchBridge.onDidRunCommand((command) => this.handleWorkbenchCommand(command)));
    this._register(this.terminalService.onDidDisposeInstance((instance) => this.clearTerminalBindingForInstance(instance.instanceId)));
    this._register(this.layoutService.onDidChangePartVisibility((event) => {
      if (event.partId === Parts.PANEL_PART && !event.visible && !this.terminalRevealInProgress && !this.terminalPanelVisibilityInProgress) {
        this.rememberTerminalPanelHiddenForCurrentPage();
        this.restoreTaskbarAfterTerminal();
      }
    }));
    this._register(this.workbenchThemeService.onDidColorThemeChange(() => {
      this.applyTurboFileThemeState();
      this.ensureTitlebarChrome();
      if (this.activePage === "themes") {
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
    void this.refreshPane("left");
    void this.refreshPane("right");
    void this.prefetchDefaultDeviceDirectories();
  }
  async ensureTurboFileChrome() {
  }
  async ensureDefaultSshDevices() {
    if (!this.deviceStore) {
      return;
    }
    const result = await this.deviceStore.ensureDefaultDevices();
    if (!result.added && !result.updated && !result.removed) {
      return;
    }
    this.devices = this.deviceStore.loadDevices();
    this.ensurePaneDeviceSelection({ preferFirstSshOnRight: result.added > 0 });
    this.statusMessage = result.removed ? `\u5DF2\u6E05\u7406\u5185\u7F6E SSH \u8BBE\u5907 ${result.removed} \u53F0\u3002` : `\u5DF2\u52A0\u8F7D\u9ED8\u8BA4 SSH \u8BBE\u5907\uFF1A\u65B0\u589E ${result.added} \u53F0\uFF0C\u66F4\u65B0 ${result.updated} \u53F0\u3002`;
    this.render();
    void this.refreshPane("left");
    void this.refreshPane("right");
    void this.prefetchDefaultDeviceDirectories();
  }
  async setInput(input, options, context, token) {
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
  layout(_dimension, _position) {
    this.invalidateImageGridBodyWidthCache();
    this.imageGridLayoutMetrics = void 0;
  }
  setVisible(visible) {
    super.setVisible(visible);
    this.isEditorVisible = visible;
    document.body.classList.toggle("turbofile-main-editor-visible", visible);
    this.updateTransferTabsVisibility();
    if (visible) {
      void this.syncActiveTerminalForCurrentPage();
      this.applyTurboFileThemeState();
      this.ensureTitlebarChrome();
    }
  }
  focus() {
    this.container?.focus();
  }
  dispose() {
    document.body.classList.remove("turbofile-main-editor-visible");
    document.body.classList.remove("turbofile-transfer-tabs-visible");
    document.body.classList.remove("turbofile-editor-theme-light", "turbofile-editor-theme-dark", "turbofile-theme-switching");
    if (this.appearanceTransitionTimer !== void 0) {
      getWindow(this.container).clearTimeout(this.appearanceTransitionTimer);
      this.appearanceTransitionTimer = void 0;
    }
    if (this.terminalPanelVisibilityResetHandle !== void 0) {
      getWindow(this.container).clearTimeout(this.terminalPanelVisibilityResetHandle);
      this.terminalPanelVisibilityResetHandle = void 0;
    }
    this.editorGroupContainer?.classList.remove("turbofile-main-editor-group");
    this.closeAboutDialog();
    this.removeTitlebarAppMenu();
    this.removeTitlebarThemeToggle();
    this.clearLiveTransferTicker();
    this.clearFileListScrollRaf("left");
    this.clearFileListScrollRaf("right");
    this.clearFileListRestoreRaf("left");
    this.clearFileListRestoreRaf("right");
    this.releaseImageGridStateImages(this.imageGridState);
    this.disposeImageGridObserver();
    this.clearImageGridScrollTimer();
    this.clearImageGridScrollRaf();
    this.clearImageGridThumbnailQueue();
    this.clearImageGridPreviewPrefetchTimer();
    this.clearImageGridLoadedImageIndexes();
    this.imagePreviewAnalysis = void 0;
    this.clearImagePreviewRender();
    this.imageGridRenderedRange = void 0;
    super.dispose();
  }
  render() {
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
    const shell = $(".turbofile-editor-shell");
    const content = $(".turbofile-editor-content");
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
  renderActivePage() {
    if (this.activePage === "devices") {
      return this.renderDevicesPage();
    }
    if (this.activePage === "settings") {
      return this.renderSettingsPage();
    }
    if (this.activePage === "themes") {
      return this.renderThemesPage();
    }
    if (this.activePage === "tasks") {
      return this.renderTasksPage();
    }
    if (this.activePage === "images") {
      return this.renderImageGridPage();
    }
    return this.renderTransferPage();
  }
  registerWorkbenchKeyboardShortcuts() {
    if (!this.container) {
      return;
    }
    const handleKeydown = (event) => this.handleWorkbenchKeydown(event);
    this.container.addEventListener("keydown", handleKeydown);
    const ownerWindow = getWindow(this.container);
    ownerWindow.addEventListener("keydown", handleKeydown, true);
    this.renderDisposables.add({ dispose: () => this.container?.removeEventListener("keydown", handleKeydown) });
    this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener("keydown", handleKeydown, true) });
  }
  handleWorkbenchKeydown(event) {
    if (event.defaultPrevented) {
      return;
    }
    if (this.handleImageGridKeyboardShortcut(event)) {
      return;
    }
    if (event.key !== "Delete" && event.code !== "Delete" || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const side = this.getDeleteKeyboardTargetSide(event);
    if (!side) {
      return;
    }
    event.preventDefault();
    void this.deleteSelected(side);
  }
  handleImageGridKeyboardShortcut(event) {
    const state = this.imageGridState;
    if (this.activePage !== "images" || !state || this.dialogState || this.isDeviceFormVisible || this.isTaskLogVisible) {
      return false;
    }
    const target = event.target;
    if (!this.isKeyboardEventFromTurboFileSurface(target) || this.isEditableKeyboardTarget(target)) {
      return false;
    }
    const targetElement = target instanceof HTMLElement ? target : void 0;
    if (targetElement?.closest(".turbofile-dialog, .turbofile-device-form, .turbofile-image-page-sort.is-open, .turbofile-image-page-scale.is-open")) {
      return false;
    }
    if ((event.key === "Delete" || event.code === "Delete") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      void this.deleteSelectedImageGridItems();
      return true;
    }
    if (!state.previewVisible && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      this.selectAllImageGridItems();
      return true;
    }
    return false;
  }
  getDeleteKeyboardTargetSide(event) {
    if (this.activePage !== "transfer" || this.dialogState || this.imageGridState?.previewVisible || this.isDeviceFormVisible || this.isTaskLogVisible) {
      return void 0;
    }
    const target = event.target;
    if (!this.isKeyboardEventFromTurboFileSurface(target)) {
      return void 0;
    }
    if (this.isEditableKeyboardTarget(target)) {
      return void 0;
    }
    const targetElement = target instanceof HTMLElement ? target : void 0;
    if (targetElement?.closest(".turbofile-inline-rename, .turbofile-dialog, .turbofile-device-form, .turbofile-device-select.is-open")) {
      return void 0;
    }
    const targetSide = this.getPaneSideFromElement(targetElement);
    if (targetSide) {
      this.activeFilePaneSide = targetSide;
      return targetSide;
    }
    const leftSelected = this.getSelectedTransferItems("left").length > 0;
    const rightSelected = this.getSelectedTransferItems("right").length > 0;
    if (leftSelected && rightSelected) {
      return this.activeFilePaneSide;
    }
    if (leftSelected) {
      return "left";
    }
    if (rightSelected) {
      return "right";
    }
    return void 0;
  }
  isKeyboardEventFromTurboFileSurface(target) {
    if (!this.container) {
      return false;
    }
    if (target instanceof Node && this.container.contains(target)) {
      return true;
    }
    const ownerDocument = this.container.ownerDocument;
    return target === ownerDocument.body || target === ownerDocument.documentElement;
  }
  getPaneSideFromElement(element) {
    const side = element?.closest(".turbofile-pane[data-turbofile-side]")?.dataset.turbofileSide;
    return side === "left" || side === "right" ? side : void 0;
  }
  setActiveFilePaneSide(side) {
    this.activeFilePaneSide = side;
  }
  /**
   * Resets the drag-state flags after an internal pane drag finishes (drop or dragend) or after
   * we've handed control over to the Windows native drag pipeline. Safe to call multiple times.
   */
  clearCurrentFileDragState() {
    this.currentFileDragSide = void 0;
    this.hasStartedNativeWindowsDrag = false;
    this.setExternalDropTargetSide(void 0);
    this.clearInternalDropTargetHighlight();
  }
  /**
   * Defers work triggered by a drop until after the current drop event returns. Re-rendering the
   * file list synchronously inside the drop handler removes the dragged source row before the
   * browser has finished tearing down the drag, which can leave the drag image (the lingering
   * "shadow") floating on screen. Running on the next timer tick lets that teardown complete first.
   */
  deferAfterDrag(action) {
    getWindow(this.container).setTimeout(action, 0);
  }
  clearInternalDropTargetHighlight() {
    for (const row of this.container?.querySelectorAll(".turbofile-file-row.is-internal-drop-target") ?? []) {
      row.classList.remove("is-internal-drop-target");
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
  beginFileRowDrag(side, item, event) {
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
    event.dataTransfer.setData("application/x-turbofile-side", side);
    event.dataTransfer.setData("application/x-turbofile-operation", "copy");
    const items = this.getSelectedTransferItems(side);
    const labels = items.length ? items.map((i) => i.name) : [item.name];
    event.dataTransfer.setData("text/plain", labels.join("\n"));
    this.tryStartImmediateLocalWindowsDrag(side, event);
  }
  tryStartImmediateLocalWindowsDrag(side, event) {
    if (!event.altKey) {
      return;
    }
    const device = this.getPaneDevice(side);
    if (device?.id !== LOCAL_WINDOWS_DEVICE_ID) {
      return;
    }
    const dragItems = this.getSelectedTransferItems(side).filter((candidate) => !!candidate.path && !candidate.parent).map((candidate) => ({
      sourcePath: candidate.path,
      name: candidate.name,
      type: candidate.type,
      size: candidate.directory ? void 0 : candidate.rawSize
    }));
    if (!dragItems.length) {
      return;
    }
    event.preventDefault();
    this.hasStartedNativeWindowsDrag = true;
    void this.sshService.startWindowsFileDrag({
      source: {
        kind: "local",
        path: this.paneStates[side].path,
        label: device.name
      },
      items: dragItems
    }).then((result) => {
      if (!result.ok) {
        this.statusMessage = `\u62D6\u51FA\u5230 Windows \u5931\u8D25\uFF1A${result.message}`;
        this.render();
      }
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u62D6\u51FA\u5230 Windows \u5931\u8D25\uFF1A${message}`;
      this.render();
    });
  }
  /**
   * Called when the user drags a TurboFile file-row out of the window. Local files are handed to
   * Windows directly; remote files first capture Explorer/Desktop's real drop directory through
   * the native CopyHook helper, then use the normal transfer pipeline to download there.
   */
  async startWindowsFileDragFromPane(side) {
    const device = this.getPaneDevice(side);
    if (!device) {
      return;
    }
    if (device.id !== LOCAL_WINDOWS_DEVICE_ID) {
      try {
        const sourceItems = this.getSelectedTransferItems(side).filter((candidate) => !!candidate.path && !candidate.parent);
        const dragItems = sourceItems.map((candidate) => ({
          sourcePath: candidate.path,
          name: candidate.name,
          type: candidate.type,
          size: candidate.directory ? void 0 : candidate.rawSize
        }));
        if (!dragItems.length) {
          return;
        }
        this.statusMessage = "\u62D6\u5230 Windows \u540E\u5C06\u5F00\u59CB\u4E0B\u8F7D...";
        this.render();
        const result = await this.sshService.startWindowsFileDrag({
          source: await this.toTransferEndpoint(device, this.paneStates[side].path),
          items: dragItems
        });
        if (!result.ok) {
          this.statusMessage = result.canceled ? "\u5DF2\u53D6\u6D88\u62D6\u5230 Windows\u3002" : `\u62D6\u5230 Windows \u5931\u8D25\uFF1A${result.message}`;
          this.render();
          return;
        }
        if (!result.targetDirectory) {
          this.statusMessage = "\u62D6\u5230 Windows \u5931\u8D25\uFF1A\u6CA1\u6709\u6355\u83B7\u5230\u76EE\u6807\u76EE\u5F55\u3002";
          this.render();
          return;
        }
        await this.transferItemsToWindowsDirectory(side, device, sourceItems, result.targetDirectory, Date.now());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.statusMessage = `\u62D6\u5230 Windows \u5931\u8D25\uFF1A${message}`;
        this.render();
      }
      return;
    }
    try {
      const dragItems = this.getSelectedTransferItems(side).filter((candidate) => !!candidate.path && !candidate.parent).map((candidate) => ({
        sourcePath: candidate.path,
        name: candidate.name,
        type: candidate.type,
        size: candidate.directory ? void 0 : candidate.rawSize
      }));
      if (!dragItems.length) {
        return;
      }
      const result = await this.sshService.startWindowsFileDrag({
        source: { kind: "local", path: this.paneStates[side].path, label: device.name },
        items: dragItems
      });
      if (!result.ok) {
        this.statusMessage = `\u62D6\u51FA\u5230 Windows \u5931\u8D25\uFF1A${result.message}`;
        this.render();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u62D6\u51FA\u5230 Windows \u5931\u8D25\uFF1A${message}`;
      this.render();
    }
  }
  maybeStartWindowsFileDragFromPointer(side, event) {
    if (this.currentFileDragSide !== side || this.hasStartedNativeWindowsDrag) {
      return;
    }
    if (event.clientX === 0 && event.clientY === 0 && event.screenX === 0 && event.screenY === 0) {
      return;
    }
    const ownerWindow = getWindow(this.container);
    const outsideWindow = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= ownerWindow.innerWidth - 1 || event.clientY >= ownerWindow.innerHeight - 1;
    if (!outsideWindow) {
      return;
    }
    this.hasStartedNativeWindowsDrag = true;
    void this.startWindowsFileDragFromPane(side);
  }
  renderTransferPage() {
    const page = $(".turbofile-transfer-page");
    this.registerTransferPageDragAndDrop(page);
    const hasLiveTransfer = this.tasks.some((task) => task.kind === "transfer" && task.status === "running");
    if (hasLiveTransfer) {
      page.classList.add("has-live-transfer");
    }
    const taskbarHidden = this.isTaskbarHiddenForTerminal();
    if (taskbarHidden) {
      page.classList.add("is-terminal-focused");
    }
    if (this.maximizedPane) {
      page.classList.add("is-pane-maximized");
      page.dataset.maximizedPane = this.maximizedPane;
    }
    const main = $(".turbofile-main");
    main.appendChild(this.renderPane("left"));
    main.appendChild(this.renderPane("right"));
    page.appendChild(main);
    if (!taskbarHidden) {
      page.appendChild(this.renderTaskbar());
    }
    return page;
  }
  registerTransferPageDragAndDrop(page) {
    const handleDragEnter = (event) => this.handleTransferPageDragOver(event);
    const handleDragOver = (event) => this.handleTransferPageDragOver(event);
    const handleDrop = (event) => this.handleTransferPageDrop(event);
    const handleDragLeave = (event) => this.handleTransferPageDragLeave(event);
    page.addEventListener("dragenter", handleDragEnter, true);
    page.addEventListener("dragover", handleDragOver, true);
    page.addEventListener("drop", handleDrop, true);
    page.addEventListener("dragleave", handleDragLeave, true);
    this.renderDisposables.add({
      dispose: () => {
        page.removeEventListener("dragenter", handleDragEnter, true);
        page.removeEventListener("dragover", handleDragOver, true);
        page.removeEventListener("drop", handleDrop, true);
        page.removeEventListener("dragleave", handleDragLeave, true);
      }
    });
  }
  handleTransferPageDragOver(event) {
    if (!this.isTransferPageFileDrag(event)) {
      return;
    }
    const targetSide = this.getTransferDropTargetSide(event);
    const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.currentFileDragSide;
    if (!shouldHandleTurboFilePaneDropAtPage(sourceSide, targetSide)) {
      this.setExternalDropTargetSide(void 0);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    this.setExternalDropTargetSide(this.hasExternalDropData(event) ? targetSide : void 0);
  }
  handleTransferPageDrop(event) {
    if (!this.isTransferPageFileDrag(event)) {
      return;
    }
    const initiatedAt = Date.now();
    const targetSide = this.getTransferDropTargetSide(event);
    const sourceSide = this.getTurboFileDragSourceSide(event) ?? this.currentFileDragSide;
    if (!shouldHandleTurboFilePaneDropAtPage(sourceSide, targetSide)) {
      this.setExternalDropTargetSide(void 0);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.setExternalDropTargetSide(void 0);
    if (sourceSide) {
      if (sourceSide !== targetSide) {
        void this.transferSelected(sourceSide, targetSide, initiatedAt);
      }
      this.clearCurrentFileDragState();
      return;
    }
    const externalPaths = this.extractExternalDropPaths(event);
    if (externalPaths.length) {
      void this.transferExternalPaths(targetSide, externalPaths, "copy", initiatedAt);
    }
    this.clearCurrentFileDragState();
  }
  handleTransferPageDragLeave(event) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    this.setExternalDropTargetSide(void 0);
    if (this.currentFileDragSide && !this.hasStartedNativeWindowsDrag) {
      this.hasStartedNativeWindowsDrag = true;
      void this.startWindowsFileDragFromPane(this.currentFileDragSide);
    }
  }
  isTransferPageFileDrag(event) {
    return !!this.getTurboFileDragSourceSide(event) || this.hasExternalDropData(event);
  }
  getTransferDropTargetSide(event) {
    const target = event.target instanceof HTMLElement ? event.target : void 0;
    const targetSide = this.getPaneSideFromElement(target);
    if (targetSide) {
      this.activeFilePaneSide = targetSide;
      return targetSide;
    }
    return this.activeFilePaneSide;
  }
  getTurboFileDragSourceSide(event) {
    const sourceSide = event.dataTransfer?.getData("application/x-turbofile-side");
    return sourceSide === "left" || sourceSide === "right" ? sourceSide : void 0;
  }
  renderDevicesPage() {
    const page = $(".turbofile-full-page");
    page.appendChild(this.renderPageHeader(Codicon.server, "\u8BBE\u5907\u7BA1\u7406", "\u7BA1\u7406\u5DF2\u4FDD\u5B58\u7684 SSH \u8BBE\u5907\uFF0C\u53EF\u5728\u8FD9\u91CC\u7F16\u8F91\u3001\u5220\u9664\u548C\u6D4B\u8BD5\u8FDE\u63A5\u3002", [
      this.createPageButton(Codicon.refresh, "\u5237\u65B0\u8BBE\u5907", () => {
        this.devices = this.deviceStore?.loadDevices() ?? [];
        this.ensurePaneDeviceSelection();
        this.statusMessage = `\u8BBE\u5907\u5217\u8868\u5DF2\u5237\u65B0\uFF1A${this.devices.length} \u53F0 SSH \u8BBE\u5907\u3002`;
        this.render();
      }),
      this.createPageButton(Codicon.add, "\u6DFB\u52A0 SSH \u8BBE\u5907", () => this.showAddDeviceForm())
    ]));
    const grid = $(".turbofile-device-page-grid");
    for (const device of this.getAllDevices()) {
      grid.appendChild(this.renderDevicePageCard(device));
    }
    page.appendChild(grid);
    return page;
  }
  ensureTitlebarChrome() {
    this.ensureTitlebarAppMenu();
    this.ensureTitlebarThemeToggle();
  }
  ensureTitlebarAppMenu(retry = 0) {
    if (!document.body.classList.contains("turbofile-shell")) {
      return;
    }
    this.removeTitlebarAppMenu();
    const titlebarLeft = document.querySelector(".monaco-workbench .part.titlebar .titlebar-container > .titlebar-left");
    if (!titlebarLeft) {
      if (retry < 10) {
        setTimeout(() => this.ensureTitlebarAppMenu(retry + 1), 100);
      }
      return;
    }
    const menu = this.createTitlebarAppMenu();
    const appIcon = titlebarLeft.querySelector(".window-appicon");
    const nativeMenubar = titlebarLeft.querySelector(".menubar");
    if (nativeMenubar) {
      titlebarLeft.insertBefore(menu, nativeMenubar);
    } else if (appIcon?.nextSibling) {
      titlebarLeft.insertBefore(menu, appIcon.nextSibling);
    } else {
      titlebarLeft.appendChild(menu);
    }
  }
  removeTitlebarAppMenu() {
    for (const menu of Array.from(document.querySelectorAll(".turbofile-titlebar-menu"))) {
      menu.remove();
    }
  }
  createTitlebarAppMenu() {
    const menu = $(".turbofile-titlebar-menu");
    const updateActionKind = getTurboFileTitlebarUpdateActionKind(this.updateService.state);
    if (updateActionKind !== "hidden") {
      menu.appendChild(this.createTitlebarUpdateButton(updateActionKind));
    }
    menu.appendChild(this.createTitlebarMenuButton("\u8BBE\u7F6E", (button) => this.showTitlebarMenu(button, "\u8BBE\u7F6E", [])));
    menu.appendChild(this.createTitlebarMenuButton("\u89C6\u56FE", (button) => this.showTitlebarMenu(button, "\u89C6\u56FE", [])));
    menu.appendChild(this.createTitlebarMenuButton("\u5E2E\u52A9", (button) => this.showTitlebarMenu(button, "\u5E2E\u52A9", [
      toAction({ id: "turbofile.help.about", label: "\u5173\u4E8E\u6781\u901F\u4F20", enabled: true, run: () => this.showAboutDialog() })
    ])));
    return menu;
  }
  createTitlebarUpdateButton(kind) {
    const button = $("button.turbofile-titlebar-update-button");
    button.type = "button";
    const title = kind === "download" ? "\u4E0B\u8F7D\u66F4\u65B0" : kind === "install" ? "\u5B89\u88C5\u66F4\u65B0" : "\u91CD\u542F\u4EE5\u66F4\u65B0";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.appendChild(renderIcon(Codicon.cloudDownload));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.runTitlebarUpdateAction(kind);
    });
    return button;
  }
  createTitlebarMenuButton(label, onClick) {
    const button = $("button.turbofile-titlebar-menu-button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(button);
    });
    return button;
  }
  showTitlebarMenu(anchor, title, actions) {
    const fallbackAction = toAction({ id: `turbofile.titlebar.${title}.empty`, label: "\u6682\u65E0\u5185\u5BB9", enabled: false, run: () => {
    } });
    this.contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      getActions: () => actions.length ? actions : [fallbackAction]
    });
  }
  async runTitlebarUpdateAction(kind) {
    if (kind === "download") {
      await this.updateService.downloadUpdate(true);
    } else if (kind === "install") {
      await this.updateService.applyUpdate();
    } else if (kind === "restart") {
      await this.updateService.quitAndInstall();
    }
  }
  ensureTitlebarThemeToggle(retry = 0) {
    if (!document.body.classList.contains("turbofile-shell")) {
      return;
    }
    this.removeTitlebarThemeToggle();
    const titlebarRight = document.querySelector(".monaco-workbench .part.titlebar .titlebar-container > .titlebar-right");
    const controls = titlebarRight?.querySelector(".window-controls-container");
    if (!titlebarRight || !controls) {
      if (retry < 10) {
        setTimeout(() => this.ensureTitlebarThemeToggle(retry + 1), 100);
      }
      return;
    }
    titlebarRight.insertBefore(this.createThemeToggleButton(), controls);
  }
  removeTitlebarThemeToggle() {
    for (const button of Array.from(document.querySelectorAll(".turbofile-theme-toggle"))) {
      button.remove();
    }
  }
  createThemeToggleButton() {
    const effectiveMode = this.getEffectiveAppearanceMode(this.getAppearanceMode());
    const targetMode = effectiveMode === "light" ? "dark" : "light";
    const button = $("button.turbofile-theme-toggle");
    button.type = "button";
    button.title = effectiveMode === "light" ? "\u5207\u6362\u5230\u6DF1\u8272\u6A21\u5F0F" : "\u5207\u6362\u5230\u6D45\u8272\u6A21\u5F0F";
    button.setAttribute("aria-label", button.title);
    button.appendChild(renderTurboFileAppearanceIcon(effectiveMode === "light" ? "moon" : "sun"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.applyAppearanceMode(targetMode);
    });
    return button;
  }
  showAboutDialog() {
    this.closeAboutDialog();
    const overlay = $(".turbofile-about-overlay");
    overlay.setAttribute("role", "presentation");
    const dialog = $(".turbofile-about-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "turbofile-about-title");
    const header = $(".turbofile-about-header");
    const headerTitle = $("div#turbofile-about-title.turbofile-about-header-title");
    headerTitle.textContent = "\u5173\u4E8E\u6781\u901F\u4F20";
    const close = $("button.turbofile-about-close");
    close.type = "button";
    close.title = "\u5173\u95ED";
    close.setAttribute("aria-label", "\u5173\u95ED");
    close.appendChild(renderIcon(Codicon.close));
    close.addEventListener("click", () => this.closeAboutDialog());
    header.append(headerTitle, close);
    const content = $(".turbofile-about-content");
    const icon = $(".turbofile-about-app-icon");
    icon.appendChild(renderTurboFileIcon("lightning-charge-fill"));
    const name = $("div.turbofile-about-name");
    name.textContent = this.productService.nameShort || "\u6781\u901F\u4F20";
    const version = $("div.turbofile-about-version");
    version.textContent = `\u7248\u672C ${this.productService.version}`;
    const copyright = $("div.turbofile-about-copyright");
    copyright.textContent = "\xA9 \u6781\u901F\u4F20";
    content.append(icon, name, version, copyright);
    const footer = $(".turbofile-about-footer");
    const ok = $("button.turbofile-about-ok");
    ok.type = "button";
    ok.textContent = "\u786E\u5B9A";
    ok.addEventListener("click", () => this.closeAboutDialog());
    footer.appendChild(ok);
    dialog.append(header, content, footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        this.closeAboutDialog();
      }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeAboutDialog();
      }
    });
    this.aboutDialogElement = overlay;
    document.body.appendChild(overlay);
    getWindow(overlay).requestAnimationFrame(() => ok.focus({ preventScroll: true }));
  }
  closeAboutDialog() {
    this.aboutDialogElement?.remove();
    this.aboutDialogElement = void 0;
  }
  renderDevicePageCard(device) {
    const card = $(".turbofile-page-card.turbofile-device-page-card");
    card.classList.add(`is-tone-${this.getDeviceCardTone(device)}`);
    const title = $(".turbofile-page-card-title");
    title.appendChild(this.renderDevicePageIcon(device));
    const titleText = $("span");
    titleText.textContent = device.name;
    title.appendChild(titleText);
    const status = $("span.turbofile-device-card-status");
    const runtimeStatus = this.getDeviceRuntimeStatus(device);
    status.classList.add(`is-${runtimeStatus}`);
    status.textContent = this.getDeviceRuntimeStatusLabel(runtimeStatus);
    title.appendChild(status);
    card.appendChild(title);
    const meta = $(".turbofile-device-page-meta");
    meta.appendChild(this.renderInfoLine("\u5730\u5740", device.id === LOCAL_WINDOWS_DEVICE_ID ? device.host : `${device.host}:${device.port || 22}`));
    meta.appendChild(this.renderInfoLine("\u7528\u6237", device.username || "\u672C\u673A"));
    meta.appendChild(this.renderInfoLine("\u9ED8\u8BA4\u76EE\u5F55", device.defaultPath || (device.id === LOCAL_WINDOWS_DEVICE_ID ? this.getLocalWindowsDefaultPath() : "/")));
    meta.appendChild(this.renderInfoLine("\u4F20\u8F93\u6A21\u5F0F", this.getDeviceTransferProtocolLabel(device)));
    card.appendChild(meta);
    const actions = $(".turbofile-page-card-actions");
    actions.appendChild(this.createPageButton(Codicon.send, "\u8FDE\u63A5", () => {
      void this.testDeviceConnection(device);
    }));
    actions.appendChild(this.createPageButton(Codicon.edit, "\u7F16\u8F91", () => this.showEditDeviceForm(device)));
    if (device.id !== LOCAL_WINDOWS_DEVICE_ID) {
      actions.appendChild(this.createPageButton(Codicon.trash, "\u5220\u9664", () => {
        void this.deleteDeviceFromPage(device);
      }));
    }
    card.appendChild(actions);
    const result = this.deviceConnectionMessages.get(device.id);
    if (result) {
      const message = $(".turbofile-device-test-result");
      message.classList.add(`is-${result.status}`);
      message.textContent = result.message;
      card.appendChild(message);
    }
    return card;
  }
  getDeviceRuntimeStatus(device) {
    if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
      return "online";
    }
    return this.deviceRuntimeStatuses.get(device.id) ?? "unknown";
  }
  setDeviceRuntimeStatus(device, status) {
    const deviceId = typeof device === "string" ? device : device.id;
    this.deviceRuntimeStatuses.set(deviceId, deviceId === LOCAL_WINDOWS_DEVICE_ID ? "online" : status);
  }
  getDeviceRuntimeStatusLabel(status) {
    switch (status) {
      case "online":
        return "\u5728\u7EBF";
      default:
        return "\u79BB\u7EBF";
    }
  }
  getDeviceCardTone(device) {
    const seed = `${device.host}:${device.port || 22}:${device.name}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i) | 0;
    }
    return Math.abs(hash) % 6;
  }
  getDeviceTransferProtocolLabel(device) {
    switch (device.preferredTransferProtocol) {
      case "auto-fast":
      case "tar":
        return device.capabilities.tar ? "\u667A\u80FD\u6781\u901F\uFF08\u56FA\u5B9A\u7B56\u7565\uFF09" : "\u667A\u80FD\u6781\u901F\uFF08tar \u672A\u68C0\u6D4B\u5230\uFF09";
      case "rsync":
        return device.capabilities.rsync ? "rsync \u589E\u91CF\uFF08\u53EF\u7528\uFF09" : "rsync \u589E\u91CF\uFF08\u672A\u901A\u8FC7\u68C0\u6D4B\uFF09";
      case "scp":
        return device.capabilities.scp ? "SCP \u6587\u4EF6\uFF08\u53EF\u7528\uFF09" : "SCP \u6587\u4EF6\uFF08\u672A\u901A\u8FC7\u68C0\u6D4B\uFF09";
      case "sftp":
      default:
        return "SFTP \u7A33\u5B9A\u6A21\u5F0F";
    }
  }
  renderSettingsPage() {
    return this.renderTransferPage();
  }
  renderAppearanceFontSettingsCard() {
    const card = $(".turbofile-appearance-card.turbofile-appearance-font-card");
    const header = $(".turbofile-appearance-card-header");
    const copy = $(".turbofile-appearance-card-copy");
    const title = $("h2");
    title.textContent = "\u5B57\u4F53";
    const description = $("p");
    description.textContent = "\u8C03\u6574\u6781\u901F\u4F20\u754C\u9762\u548C\u6587\u4EF6\u6D4F\u89C8\u533A\u7684\u663E\u793A\u5B57\u4F53\u3002";
    copy.appendChild(title);
    copy.appendChild(description);
    header.appendChild(copy);
    card.appendChild(header);
    const rows = $(".turbofile-appearance-font-summary");
    rows.appendChild(this.renderEditorFontSizeSetting());
    rows.appendChild(this.renderUiFontSizeSetting());
    rows.appendChild(this.renderUiFontFamilySetting());
    rows.appendChild(this.renderBrowserFontSizeSetting());
    rows.appendChild(this.renderBrowserFontFamilySetting());
    card.appendChild(rows);
    return card;
  }
  renderEditorFontSizeSetting() {
    return this.renderFontSizeSetting("\u6587\u6863\u5B57\u4F53\u5927\u5C0F", "\u8C03\u6574\u5F53\u524D\u6253\u5F00\u6587\u6863\u7684\u5B57\u53F7\uFF0C\u4FEE\u6539\u540E\u7ACB\u5373\u751F\u6548\u3002", "editor.fontSize", this.getEditorFontSize(), 8, 40, (value) => this.updateEditorFontSize(value));
  }
  renderUiFontSizeSetting() {
    return this.renderFontSizeSetting("UI \u5B57\u53F7", "\u7EDF\u4E00\u8C03\u6574\u6781\u901F\u4F20\u754C\u9762\u7684\u5B57\u4F53\u5927\u5C0F\uFF0C\u4E0D\u5F71\u54CD VS Code \u539F\u751F\u6587\u6863\u7F16\u8F91\u5668\u3002", "turbofile-ui-font-size", this.getUiFontSize(), 11, 24, (value) => this.updateUiFontSize(value));
  }
  renderBrowserFontSizeSetting() {
    return this.renderFontSizeSetting("\u6587\u4EF6\u6D4F\u89C8\u533A\u5B57\u4F53\u5927\u5C0F", "\u53EA\u63A7\u5236\u5DE6\u53F3\u6587\u4EF6\u6D4F\u89C8\u533A\u57DF\uFF0C\u4FEE\u6539\u540E\u7ACB\u5373\u751F\u6548\u3002", "turbofile-browser-font-size", this.getBrowserFontSize(), 11, 20, (value) => this.updateBrowserFontSize(value));
  }
  renderUiFontFamilySetting() {
    return this.renderFontFamilySetting("UI \u5B57\u4F53", "\u9009\u62E9\u6781\u901F\u4F20\u754C\u9762\u4F7F\u7528\u7684\u5B57\u4F53\u3002", "turbofile-ui-font-family", this.getUiFontFamily(), TURBOFILE_UI_FONT_FAMILIES, (value) => this.updateUiFontFamily(value));
  }
  renderBrowserFontFamilySetting() {
    return this.renderFontFamilySetting("\u6587\u4EF6\u6D4F\u89C8\u533A\u5B57\u4F53", "\u9009\u62E9\u6587\u4EF6\u540D\u3001\u5927\u5C0F\u548C\u65F6\u95F4\u7684\u663E\u793A\u5B57\u4F53\u3002", "turbofile-browser-font-family", this.getBrowserFontFamily(), TURBOFILE_BROWSER_FONT_FAMILIES, (value) => this.updateBrowserFontFamily(value));
  }
  renderFontSizeSetting(labelText, descriptionText, id, currentFontSize, min, max, update) {
    const row = $(".turbofile-editor-setting-row.turbofile-appearance-wide-setting");
    const copy = $(".turbofile-editor-setting-copy");
    const label = $("label");
    label.textContent = labelText;
    label.htmlFor = id;
    const description = $("span");
    description.textContent = descriptionText;
    copy.appendChild(label);
    copy.appendChild(description);
    const controls = $(".turbofile-editor-setting-controls");
    const input = $("input.turbofile-editor-font-size-input");
    input.id = id;
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    input.value = String(currentFontSize);
    input.addEventListener("change", () => update(input.valueAsNumber));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        update(input.valueAsNumber);
      }
    });
    controls.appendChild(input);
    row.appendChild(copy);
    row.appendChild(controls);
    return row;
  }
  renderFontFamilySetting(labelText, descriptionText, id, currentFontFamily, options, update) {
    const row = $(".turbofile-editor-setting-row.turbofile-appearance-wide-setting");
    const copy = $(".turbofile-editor-setting-copy");
    const label = $("label");
    label.textContent = labelText;
    label.htmlFor = id;
    const description = $("span");
    description.textContent = descriptionText;
    copy.appendChild(label);
    copy.appendChild(description);
    const controls = $(".turbofile-editor-setting-controls");
    const select = $("select.turbofile-browser-select");
    select.id = id;
    for (const [value, optionLabel] of options) {
      const option = $("option");
      option.value = value;
      option.textContent = optionLabel;
      option.selected = value === currentFontFamily;
      select.appendChild(option);
    }
    select.addEventListener("change", () => update(select.value));
    controls.appendChild(select);
    row.appendChild(copy);
    row.appendChild(controls);
    return row;
  }
  getUiFontSize() {
    const stored = Number(this.storageService.get(TURBOFILE_UI_FONT_SIZE_STORAGE_KEY, StorageScope.PROFILE, String(TURBOFILE_UI_DEFAULT_FONT_SIZE)));
    return this.normalizeUiFontSize(stored, TURBOFILE_UI_DEFAULT_FONT_SIZE);
  }
  getEditorFontSize() {
    const value = this.configurationService.getValue("editor.fontSize");
    return this.normalizeEditorFontSize(typeof value === "number" ? value : TURBOFILE_UI_DEFAULT_FONT_SIZE, TURBOFILE_UI_DEFAULT_FONT_SIZE);
  }
  normalizeUiFontSize(value, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(24, Math.max(11, Math.round(value)));
  }
  normalizeEditorFontSize(value, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(40, Math.max(8, Math.round(value)));
  }
  updateUiFontSize(value) {
    const fontSize = this.normalizeUiFontSize(value, this.getUiFontSize());
    this.storageService.store(TURBOFILE_UI_FONT_SIZE_STORAGE_KEY, String(fontSize), StorageScope.PROFILE, StorageTarget.USER);
    this.statusMessage = `UI \u5B57\u53F7\u5DF2\u8BBE\u7F6E\u4E3A ${fontSize}px\u3002`;
    this.render();
  }
  updateEditorFontSize(value) {
    const fontSize = this.normalizeEditorFontSize(value, this.getEditorFontSize());
    void this.configurationService.updateValue("editor.fontSize", fontSize, ConfigurationTarget.USER);
    this.statusMessage = `\u6587\u6863\u5B57\u4F53\u5927\u5C0F\u5DF2\u8BBE\u7F6E\u4E3A ${fontSize}px\u3002`;
    this.render();
  }
  getUiFontFamily() {
    const stored = this.storageService.get(TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY, StorageScope.PROFILE, TURBOFILE_UI_DEFAULT_FONT_FAMILY);
    return TURBOFILE_UI_FONT_FAMILIES.some(([value]) => value === stored) ? stored : TURBOFILE_UI_DEFAULT_FONT_FAMILY;
  }
  updateUiFontFamily(value) {
    const fontFamily = TURBOFILE_UI_FONT_FAMILIES.some(([option]) => option === value) ? value : TURBOFILE_UI_DEFAULT_FONT_FAMILY;
    this.storageService.store(TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY, fontFamily, StorageScope.PROFILE, StorageTarget.USER);
    this.statusMessage = "UI \u5B57\u4F53\u5DF2\u66F4\u65B0\u3002";
    this.render();
  }
  getBrowserFontSize() {
    const stored = Number(this.storageService.get(TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY, StorageScope.PROFILE, String(TURBOFILE_BROWSER_DEFAULT_FONT_SIZE)));
    return this.normalizeBrowserFontSize(stored, TURBOFILE_BROWSER_DEFAULT_FONT_SIZE);
  }
  normalizeBrowserFontSize(value, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(20, Math.max(11, Math.round(value)));
  }
  updateBrowserFontSize(value) {
    const fontSize = this.normalizeBrowserFontSize(value, this.getBrowserFontSize());
    this.storageService.store(TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY, String(fontSize), StorageScope.PROFILE, StorageTarget.USER);
    this.statusMessage = `\u6587\u4EF6\u6D4F\u89C8\u533A\u5B57\u4F53\u5927\u5C0F\u5DF2\u8BBE\u7F6E\u4E3A ${fontSize}px\u3002`;
    this.render();
  }
  getBrowserFontFamily() {
    const stored = this.storageService.get(TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY, StorageScope.PROFILE, TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY);
    return TURBOFILE_BROWSER_FONT_FAMILIES.some(([value]) => value === stored) ? stored : TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY;
  }
  updateBrowserFontFamily(value) {
    const fontFamily = TURBOFILE_BROWSER_FONT_FAMILIES.some(([option]) => option === value) ? value : TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY;
    this.storageService.store(TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY, fontFamily, StorageScope.PROFILE, StorageTarget.USER);
    this.statusMessage = "\u6587\u4EF6\u6D4F\u89C8\u533A\u5B57\u4F53\u5DF2\u66F4\u65B0\u3002";
    this.render();
  }
  applyBrowserAppearanceSettings() {
    if (!this.container) {
      return;
    }
    this.container.style.setProperty("--turbofile-ui-font-size", `${this.getUiFontSize()}px`);
    this.container.style.setProperty("--turbofile-ui-font-family", this.getUiFontFamily());
    this.container.style.setProperty("--turbofile-browser-font-size", `${this.getBrowserFontSize()}px`);
    this.container.style.setProperty("--turbofile-browser-font-family", this.getBrowserFontFamily());
    this.container.style.removeProperty("--turbofile-appearance-contrast-filter");
    this.container.classList.remove("is-appearance-pointer", "is-appearance-translucent-sidebar");
    document.body.classList.remove("turbofile-appearance-pointer", "turbofile-appearance-translucent");
    this.container.style.removeProperty("--turbofile-browser-font-color");
  }
  renderThemesPage() {
    const page = $(".turbofile-full-page.turbofile-appearance-page");
    const shell = $(".turbofile-appearance-shell");
    const title = $("h1.turbofile-appearance-title");
    title.textContent = "\u5916\u89C2";
    shell.appendChild(title);
    shell.appendChild(this.renderAppearanceFontSettingsCard());
    page.appendChild(shell);
    return page;
  }
  applyTurboFileThemeState() {
    if (!this.container) {
      return;
    }
    const effectiveMode = this.pendingAppearanceMode ?? this.getEffectiveAppearanceMode(this.getAppearanceMode());
    this.applyTurboFileThemeClasses(effectiveMode);
  }
  applyTurboFileThemeClasses(mode) {
    this.container?.classList.toggle("is-turbofile-light", mode === "light");
    this.container?.classList.toggle("is-turbofile-dark", mode === "dark");
    document.body.classList.toggle("turbofile-editor-theme-light", mode === "light");
    document.body.classList.toggle("turbofile-editor-theme-dark", mode === "dark");
  }
  beginAppearanceTransition(mode) {
    if (this.appearanceTransitionTimer !== void 0) {
      getWindow(this.container).clearTimeout(this.appearanceTransitionTimer);
      this.appearanceTransitionTimer = void 0;
    }
    this.pendingAppearanceMode = mode;
    document.body.classList.add("turbofile-theme-switching");
    this.container?.classList.add("is-theme-switching");
    this.applyTurboFileThemeClasses(mode);
    this.ensureTitlebarThemeToggle();
  }
  endAppearanceTransition() {
    if (!this.container) {
      this.pendingAppearanceMode = void 0;
      document.body.classList.remove("turbofile-theme-switching");
      return;
    }
    const targetWindow = getWindow(this.container);
    if (this.appearanceTransitionTimer !== void 0) {
      targetWindow.clearTimeout(this.appearanceTransitionTimer);
    }
    this.appearanceTransitionTimer = targetWindow.setTimeout(() => {
      this.appearanceTransitionTimer = void 0;
      this.pendingAppearanceMode = void 0;
      document.body.classList.remove("turbofile-theme-switching");
      this.container?.classList.remove("is-theme-switching");
      this.applyTurboFileThemeState();
      this.ensureTitlebarThemeToggle();
    }, 180);
  }
  getAppearanceMode() {
    if (this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
      return "system";
    }
    return this.getEffectiveAppearanceMode();
  }
  getEffectiveAppearanceMode(mode) {
    if (mode === "system") {
      const preferred = this.workbenchThemeService.getPreferredColorScheme();
      if (preferred === ColorScheme.LIGHT || preferred === ColorScheme.HIGH_CONTRAST_LIGHT) {
        return "light";
      }
    }
    if (!mode || mode === "system") {
      const currentType = this.workbenchThemeService.getColorTheme().type;
      return currentType === ColorScheme.LIGHT || currentType === ColorScheme.HIGH_CONTRAST_LIGHT ? "light" : "dark";
    }
    return mode;
  }
  getAppearanceTheme(mode) {
    const label = mode === "dark" ? TURBOFILE_APPEARANCE_DARK_THEME_LABEL : TURBOFILE_APPEARANCE_LIGHT_THEME_LABEL;
    const settingsId = mode === "dark" ? ThemeSettingDefaults.COLOR_THEME_DARK : ThemeSettingDefaults.COLOR_THEME_LIGHT;
    const themeId = mode === "light" ? TURBOFILE_LIGHT_THEME_CLASS_ID : "vs-dark turbofile-2017-dark-cpp";
    const realTheme = this.availableColorThemes.find((theme) => theme.settingsId === settingsId) ?? this.availableColorThemes.find((theme) => theme.label === label || theme.id === themeId);
    if (realTheme) {
      return realTheme;
    }
    const builtinTheme = this.getBuiltinColorThemes().find((theme) => theme.label === label || theme.id === themeId || theme.settingsId === settingsId);
    return builtinTheme ?? this.createBuiltinColorTheme(mode === "dark" ? "vs-dark turbofile-2017-dark-cpp" : TURBOFILE_LIGHT_THEME_CLASS_ID, label, settingsId, mode === "dark" ? COLOR_THEME_DARK_INITIAL_COLORS : TURBOFILE_LIGHT_THEME_COLORS);
  }
  async applyAppearanceMode(mode) {
    await this.loadColorThemes(true);
    const darkTheme = this.getAppearanceTheme("dark");
    const lightTheme = this.getAppearanceTheme("light");
    const preferred = this.workbenchThemeService.getPreferredColorScheme();
    const targetMode = mode === "system" ? preferred === ColorScheme.LIGHT || preferred === ColorScheme.HIGH_CONTRAST_LIGHT ? "light" : "dark" : mode;
    this.beginAppearanceTransition(targetMode);
    try {
      if (mode === "system") {
        await this.configurationService.updateValue(ThemeSettings.PREFERRED_DARK_THEME, darkTheme.settingsId, ConfigurationTarget.USER);
        await this.configurationService.updateValue(ThemeSettings.PREFERRED_LIGHT_THEME, lightTheme.settingsId, ConfigurationTarget.USER);
        await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, true, ConfigurationTarget.USER);
        await this.setColorThemeBySettingsId(preferred === ColorScheme.LIGHT ? lightTheme : darkTheme);
        this.statusMessage = "\u5DF2\u8BBE\u7F6E\u4E3A\u8DDF\u968F\u7CFB\u7EDF\u4E3B\u9898\u3002";
      } else {
        await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, false, ConfigurationTarget.USER);
        await this.applyColorTheme(mode === "light" ? lightTheme : darkTheme);
        this.endAppearanceTransition();
        return;
      }
      this.endAppearanceTransition();
      this.render();
    } catch (error) {
      this.pendingAppearanceMode = void 0;
      document.body.classList.remove("turbofile-theme-switching");
      this.container?.classList.remove("is-theme-switching");
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u5207\u6362\u5916\u89C2\u5931\u8D25\uFF1A${message}`;
      this.render();
    }
  }
  async applyColorTheme(theme) {
    try {
      await this.setColorThemeBySettingsId(theme);
      this.statusMessage = `\u5DF2\u5207\u6362\u4E3B\u9898\uFF1A${this.getThemeLabel(theme)}`;
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u5207\u6362\u4E3B\u9898\u5931\u8D25\uFF1A${message}`;
      this.render();
    }
  }
  /**
   * Applies a theme by its settingsId string so the workbench theme service resolves the *real*
   * registered theme (which lazily loads its TextMate tokenColors). Passing the in-memory
   * placeholder object instead would apply a theme without tokenColors and flatten document syntax
   * highlighting to a single color. Falls back to the object only if the id cannot be resolved.
   */
  async setColorThemeBySettingsId(theme) {
    if (theme.settingsId) {
      const applied = await this.workbenchThemeService.setColorTheme(theme.settingsId, "auto");
      if (applied) {
        return;
      }
    }
    await this.workbenchThemeService.setColorTheme(theme, "auto");
  }
  async loadColorThemes(force = false) {
    if (this.isLoadingColorThemes || !force && this.hasLoadedColorThemes) {
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
        return a.label.localeCompare(b.label, "zh-Hans");
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u52A0\u8F7D\u4E3B\u9898\u5931\u8D25\uFF1A${message}`;
    } finally {
      this.isLoadingColorThemes = false;
      this.hasLoadedColorThemes = true;
      if (this.activePage === "themes") {
        this.render();
      }
    }
  }
  async syncNativeEditorDisplaySettings() {
    const settingsHome = this.environmentService.parentAppUserRoamingDataHome;
    if (!settingsHome) {
      return;
    }
    const settingsUri = joinPath(settingsHome, "settings.json");
    try {
      const settingsText = (await this.fileService.readFile(settingsUri)).value.toString();
      const settings = JSON.parse(settingsText);
      const updates = [];
      const applyIfUnset = (key, value) => {
        const inspect = this.configurationService.inspect(key);
        if (inspect.userValue !== void 0 || inspect.userLocalValue !== void 0 || inspect.userRemoteValue !== void 0 || inspect.workspaceValue !== void 0 || inspect.workspaceFolderValue !== void 0 || inspect.memoryValue !== void 0) {
          return;
        }
        updates.push(this.configurationService.updateValue(key, value, ConfigurationTarget.MEMORY));
      };
      const editorFontSize = settings["editor.fontSize"];
      if (typeof editorFontSize === "number" && Number.isFinite(editorFontSize)) {
        applyIfUnset("editor.fontSize", editorFontSize);
      }
      const editorFontFamily = settings["editor.fontFamily"];
      if (typeof editorFontFamily === "string" && editorFontFamily.length) {
        applyIfUnset("editor.fontFamily", editorFontFamily);
      }
      const editorLineHeight = settings["editor.lineHeight"];
      if (typeof editorLineHeight === "number" && Number.isFinite(editorLineHeight)) {
        applyIfUnset("editor.lineHeight", editorLineHeight);
      }
      const editorFontLigatures = settings["editor.fontLigatures"];
      if (typeof editorFontLigatures === "boolean" || typeof editorFontLigatures === "string") {
        applyIfUnset("editor.fontLigatures", editorFontLigatures);
      }
      const tokenColorCustomizations = settings["editor.tokenColorCustomizations"];
      if (tokenColorCustomizations && typeof tokenColorCustomizations === "object") {
        applyIfUnset("editor.tokenColorCustomizations", tokenColorCustomizations);
      }
      const semanticTokenColorCustomizations = settings["editor.semanticTokenColorCustomizations"];
      if (semanticTokenColorCustomizations && typeof semanticTokenColorCustomizations === "object") {
        applyIfUnset("editor.semanticTokenColorCustomizations", semanticTokenColorCustomizations);
      }
      const semanticHighlighting = settings["editor.semanticHighlighting.enabled"];
      if (typeof semanticHighlighting === "boolean" || typeof semanticHighlighting === "string") {
        applyIfUnset("editor.semanticHighlighting.enabled", semanticHighlighting);
      }
      await Promise.all(updates);
    } catch {
    }
  }
  getBuiltinColorThemes() {
    return [
      this.createBuiltinColorTheme("vs-dark turbofile-dark-2026", "\u6DF1\u8272 2026", "Dark 2026", COLOR_THEME_DARK_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs-dark turbofile-dark-plus", "Dark+", "Dark+", COLOR_THEME_DARK_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs-dark turbofile-dark-modern", "Dark Modern", "Dark Modern", COLOR_THEME_DARK_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs-dark turbofile-vs-dark", "Dark (Visual Studio)", "Visual Studio Dark", COLOR_THEME_DARK_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs-dark turbofile-cpp-dark", "Dark (Visual Studio - C/C++)", "Visual Studio Dark - C++", COLOR_THEME_DARK_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs-dark turbofile-2017-dark-cpp", TURBOFILE_APPEARANCE_DARK_THEME_LABEL, ThemeSettingDefaults.COLOR_THEME_DARK, COLOR_THEME_DARK_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs turbofile-light-plus", "Light+", "Light+", COLOR_THEME_LIGHT_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs turbofile-light-modern", "Light Modern", "Light Modern", COLOR_THEME_LIGHT_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs turbofile-vs-light", "Light (Visual Studio)", "Visual Studio Light", COLOR_THEME_LIGHT_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs turbofile-cpp-light", "Light (Visual Studio - C/C++)", "Visual Studio Light - C++", COLOR_THEME_LIGHT_INITIAL_COLORS),
      this.createBuiltinColorTheme("vs turbofile-2017-light-cpp", "2017 Light (Visual Studio - C/C++)", "Visual Studio 2017 Light - C++", COLOR_THEME_LIGHT_INITIAL_COLORS),
      this.createTurboFileLightColorTheme(),
      this.createBuiltinColorTheme("hc-black", "\u9AD8\u5BF9\u6BD4\u6DF1\u8272", ThemeSettingDefaults.COLOR_THEME_HC_DARK, {
        "activityBar.background": "#000000",
        "activityBar.activeBorder": "#f38518",
        "activityBar.foreground": "#ffffff",
        "sideBar.background": "#000000",
        "sideBar.border": "#6fc3df",
        "editor.background": "#000000",
        "editor.foreground": "#ffffff",
        "panel.background": "#000000",
        "focusBorder": "#f38518",
        "button.background": "#0f4a85",
        "button.foreground": "#ffffff"
      }),
      this.createBuiltinColorTheme("hc-light", "\u9AD8\u5BF9\u6BD4\u6D45\u8272", ThemeSettingDefaults.COLOR_THEME_HC_LIGHT, {
        "activityBar.background": "#ffffff",
        "activityBar.activeBorder": "#0f4a85",
        "activityBar.foreground": "#000000",
        "sideBar.background": "#ffffff",
        "sideBar.border": "#0f4a85",
        "editor.background": "#ffffff",
        "editor.foreground": "#000000",
        "panel.background": "#ffffff",
        "focusBorder": "#0f4a85",
        "button.background": "#0f4a85",
        "button.foreground": "#ffffff"
      })
    ];
  }
  appendColorThemeIfMissing(themes, theme) {
    if (!themes.some((candidate) => candidate.id === theme.id || candidate.settingsId === theme.settingsId || candidate.label === theme.label)) {
      themes.push(theme);
    }
  }
  createTurboFileLightColorTheme() {
    return this.createBuiltinColorTheme(TURBOFILE_LIGHT_THEME_CLASS_ID, TURBOFILE_APPEARANCE_LIGHT_THEME_LABEL, TURBOFILE_LIGHT_THEME_ID, TURBOFILE_LIGHT_THEME_COLORS);
  }
  createBuiltinColorTheme(id, label, settingsId, colors) {
    const theme = ColorThemeData.createUnloadedTheme(id, colors);
    theme.label = label;
    theme.settingsId = settingsId;
    theme.isLoaded = true;
    return theme;
  }
  getThemeLabel(theme) {
    return theme.label || theme.settingsId || this.getThemeTypeLabel(theme.type);
  }
  getThemeTypeLabel(type) {
    switch (type) {
      case ColorScheme.LIGHT:
        return "\u6D45\u8272";
      case ColorScheme.HIGH_CONTRAST_DARK:
        return "\u9AD8\u5BF9\u6BD4\u6DF1\u8272";
      case ColorScheme.HIGH_CONTRAST_LIGHT:
        return "\u9AD8\u5BF9\u6BD4\u6D45\u8272";
      default:
        return "\u6DF1\u8272";
    }
  }
  getThemeTypeOrder(type) {
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
  renderTasksPage() {
    const page = $(".turbofile-full-page");
    const stats = this.getTaskStats();
    page.appendChild(this.renderPageHeader(Codicon.history, "\u4EFB\u52A1\u65E5\u5FD7", "\u67E5\u770B\u4F20\u8F93\u3001\u5220\u9664\u3001\u538B\u7F29\u3001\u89E3\u538B\u3001\u7EC8\u7AEF\u548C\u540C\u6B65\u4EFB\u52A1\u7684\u6267\u884C\u8BB0\u5F55\u3002", [
      this.createPageButton(Codicon.trash, "\u6E05\u7A7A\u5DF2\u5B8C\u6210", () => this.clearFinishedTasks()),
      this.createPageButton(Codicon.remoteExplorer, "\u8FD4\u56DE\u4F20\u8F93\u9875", () => this.setActivePage("transfer"), true)
    ]));
    const summary = $(".turbofile-task-summary-grid");
    summary.appendChild(this.renderSummaryCard("\u8FD0\u884C\u4E2D", String(stats.running), Codicon.sync));
    summary.appendChild(this.renderSummaryCard("\u6210\u529F", String(stats.success), Codicon.pass));
    summary.appendChild(this.renderSummaryCard("\u5931\u8D25", String(stats.error), Codicon.error));
    summary.appendChild(this.renderSummaryCard("\u53D6\u6D88", String(stats.canceled), Codicon.circleSlash));
    page.appendChild(summary);
    const list = $(".turbofile-task-log-list.is-page-list");
    if (!this.tasks.length) {
      const empty = $(".turbofile-task-log-empty");
      empty.textContent = "\u6682\u65E0\u4EFB\u52A1\u8BB0\u5F55";
      list.appendChild(empty);
    } else {
      for (const task of this.tasks) {
        list.appendChild(this.renderTaskRow(task));
      }
    }
    page.appendChild(list);
    return page;
  }
  renderPageHeader(icon, title, subtitle, actions = []) {
    const header = $(".turbofile-page-header");
    const copy = $(".turbofile-page-header-copy");
    const heading = $("h2");
    heading.appendChild(renderIcon(icon));
    heading.append(title);
    const detail = $("p");
    detail.textContent = subtitle;
    copy.appendChild(heading);
    copy.appendChild(detail);
    header.appendChild(copy);
    if (actions.length) {
      const actionBar = $(".turbofile-page-header-actions");
      for (const action of actions) {
        actionBar.appendChild(action);
      }
      header.appendChild(actionBar);
    }
    return header;
  }
  renderSummaryCard(label, value, icon) {
    const card = $(".turbofile-page-card.turbofile-summary-card");
    const top = $(".turbofile-summary-card-top");
    top.append(label);
    top.appendChild(renderIcon(icon));
    const number = $("strong");
    number.textContent = value;
    card.appendChild(top);
    card.appendChild(number);
    return card;
  }
  renderInfoLine(label, value) {
    const line = $(".turbofile-info-line");
    const key = $("span");
    key.textContent = label;
    const content = $("strong");
    content.textContent = value;
    line.appendChild(key);
    line.appendChild(content);
    return line;
  }
  createPageButton(icon, label, handler, primary = false) {
    const button = $("button.turbofile-page-button");
    button.type = "button";
    if (primary) {
      button.classList.add("is-primary");
    }
    button.appendChild(renderIcon(icon));
    button.append(label);
    button.addEventListener("click", handler);
    return button;
  }
  showAddDeviceForm() {
    this.closeDeviceSelect(void 0, false);
    this.activePage = "devices";
    this.updateTransferTabsVisibility();
    this.notifyActivePageChanged();
    this.isDeviceFormVisible = true;
    this.editingDeviceId = void 0;
    this.deviceFormMessage = "";
    this.statusMessage = "\u8BF7\u586B\u5199 SSH \u8BBE\u5907\u4FE1\u606F\uFF0C\u4FDD\u5B58\u540E\u4F1A\u51FA\u73B0\u5728\u8BBE\u5907\u4E0B\u62C9\u5217\u8868\u4E2D\u3002";
    this.render();
  }
  showEditDeviceForm(device) {
    this.closeDeviceSelect(void 0, false);
    this.activePage = "devices";
    this.updateTransferTabsVisibility();
    this.notifyActivePageChanged();
    this.isDeviceFormVisible = true;
    this.editingDeviceId = device.id;
    this.deviceFormMessage = `\u6B63\u5728\u7F16\u8F91\u8BBE\u5907\uFF1A${device.name}`;
    this.statusMessage = this.deviceFormMessage;
    this.render();
  }
  setActivePage(page) {
    if (page !== this.activePage) {
      this.closeDeviceSelect(void 0, false);
    }
    if (page !== "images" && this.activePage === "images") {
      this.releaseImageGridStateImages(this.imageGridState);
      this.imageGridState = void 0;
      this.disposeImageGridObserver();
      this.clearImageGridScrollTimer();
      this.clearImageGridScrollRaf();
      this.clearImageGridThumbnailQueue();
      this.clearImageGridPreviewPrefetchTimer();
      this.clearImageGridLoadedImageIndexes();
      this.imagePreviewAnalysis = void 0;
      this.clearImagePreviewRender();
      this.imageGridRenderedRange = void 0;
    }
    this.activePage = page;
    if (page !== "transfer") {
      this.taskbarHiddenForTerminal = false;
    }
    this.isTaskLogVisible = false;
    this.isDeviceFormVisible = false;
    this.editingDeviceId = void 0;
    this.updateTransferTabsVisibility();
    this.notifyActivePageChanged();
    this.render();
  }
  updateTransferTabsVisibility() {
    document.body.classList.toggle("turbofile-transfer-tabs-visible", this.isEditorVisible && this.activePage === "transfer");
  }
  notifyActivePageChanged() {
    if (!this.currentInput) {
      return;
    }
    turboFileWorkbenchBridge.reportActivePage(this.currentInput.instanceId, this.activePage);
  }
  async deleteDeviceFromPage(device) {
    if (!this.deviceStore || device.id === LOCAL_WINDOWS_DEVICE_ID) {
      return;
    }
    const confirmed = getWindow(this.container).confirm(`\u786E\u5B9A\u5220\u9664\u8BBE\u5907\u201C${device.name}\u201D\u5417\uFF1F`);
    if (!confirmed) {
      return;
    }
    const affectedSides = ["left", "right"].filter((side) => this.paneStates[side].deviceId === device.id);
    await this.deviceStore.deleteDevice(device.id);
    this.deviceConnectionMessages.delete(device.id);
    this.deviceRuntimeStatuses.delete(device.id);
    this.devices = this.deviceStore.loadDevices();
    this.ensurePaneDeviceSelection();
    for (const side of affectedSides) {
      const state = this.paneStates[side];
      state.items = [];
      state.loading = false;
      state.error = void 0;
      state.selectedPath = void 0;
      state.selectedPaths.clear();
      state.selectionAnchorPath = void 0;
    }
    this.statusMessage = `\u5DF2\u5220\u9664\u8BBE\u5907\uFF1A${device.name}`;
    this.render();
    for (const side of affectedSides) {
      void this.refreshPane(side);
    }
  }
  async testDeviceConnection(device) {
    if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
      this.statusMessage = "\u672C\u673A Windows \u8BBE\u5907\u4E0D\u9700\u8981 SSH \u6D4B\u8BD5\u3002";
      this.render();
      return;
    }
    this.deviceConnectionMessages.set(device.id, { status: "testing", message: "\u6B63\u5728\u6D4B\u8BD5 SSH \u8FDE\u63A5..." });
    this.setDeviceRuntimeStatus(device, "testing");
    this.render();
    const task = this.beginTask("ssh-test", `\u6D4B\u8BD5 ${device.name}`, `${device.username}@${device.host}:${device.port || 22}`);
    const result = await this.sshService.testConnection(await this.getSshConnectionOptions(device));
    if (result.ok) {
      this.finishTask(task, "success", `SSH \u8FDE\u63A5\u6210\u529F\uFF1A${device.name}`);
      this.deviceConnectionMessages.set(device.id, { status: "success", message: `SSH \u8FDE\u63A5\u6210\u529F\uFF1A${device.name}` });
      this.setDeviceRuntimeStatus(device, "online");
      this.statusMessage = `SSH \u8FDE\u63A5\u6210\u529F\uFF1A${device.name}`;
    } else {
      this.finishTask(task, "error", `SSH \u8FDE\u63A5\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      this.deviceConnectionMessages.set(device.id, { status: "error", message: `SSH \u8FDE\u63A5\u5931\u8D25\uFF1A${result.message}` });
      this.setDeviceRuntimeStatus(device, "offline");
      this.statusMessage = `SSH \u8FDE\u63A5\u5931\u8D25\uFF1A${result.message}`;
    }
    this.render();
  }
  async detectAndStoreDeviceCapabilities(device) {
    if (!this.deviceStore || device.id === LOCAL_WINDOWS_DEVICE_ID || device.preferredTransferProtocol === "sftp") {
      return void 0;
    }
    const result = await this.sshService.detectCapabilities(await this.getSshConnectionOptions(device));
    if (!result.ok || !result.capabilities) {
      return { status: "error", message: `\u8BBE\u5907\u80FD\u529B\u68C0\u6D4B\u5931\u8D25\uFF0C\u5C06\u6309 SFTP \u515C\u5E95\uFF1A${result.message}` };
    }
    const capabilities = this.toDeviceCapabilities(result.capabilities);
    this.deviceStore.updateDeviceCapabilities(device.id, capabilities);
    return this.getProtocolCheckResult(this.normalizeTransferProtocol(device.preferredTransferProtocol ?? defaultTurboFileTransferProtocol), result.capabilities);
  }
  async detectDraftProtocolCapabilities(draft, editingDevice) {
    if (draft.preferredTransferProtocol === "sftp") {
      return { status: "success", message: "SFTP \u7A33\u5B9A\u6A21\u5F0F\uFF0C\u65E0\u9700\u989D\u5916\u68C0\u6D4B\u3002", missingDependencies: [] };
    }
    const result = await this.sshService.detectCapabilities(await this.getSshConnectionOptionsFromDraft(draft, editingDevice));
    if (!result.ok || !result.capabilities) {
      return { status: "error", message: `\u8BBE\u5907\u80FD\u529B\u68C0\u6D4B\u5931\u8D25\uFF1A${result.message}`, missingDependencies: [] };
    }
    return this.getProtocolCheckResult(this.normalizeTransferProtocol(draft.preferredTransferProtocol ?? defaultTurboFileTransferProtocol), result.capabilities);
  }
  getProtocolCheckResult(protocol, capabilities) {
    if (protocol === "auto-fast") {
      if (capabilities.tar && capabilities.scp) {
        return { status: "success", message: "\u667A\u80FD\u6781\u901F\u53EF\u7528\uFF1A\u5355\u6587\u4EF6\u56FA\u5B9A\u4F7F\u7528 SCP\uFF0C\u591A\u6587\u4EF6\u548C\u6587\u4EF6\u5939\u56FA\u5B9A\u4F7F\u7528 tar\u3002", capabilities, missingDependencies: [] };
      }
      if (capabilities.scp) {
        return { status: "error", message: "\u667A\u80FD\u6781\u901F\u9700\u8981 tar \u652F\u6301\uFF1A\u5355\u6587\u4EF6\u53EF\u7528 SCP\uFF0C\u591A\u6587\u4EF6\u548C\u6587\u4EF6\u5939\u9700\u8981 tar\u3002", capabilities, missingDependencies: [] };
      }
      return { status: "error", message: "\u672A\u68C0\u6D4B\u5230\u53EF\u7528\u4F20\u8F93\u80FD\u529B\uFF0C\u8BF7\u68C0\u67E5 SSH/SFTP/SCP\u3002", capabilities, missingDependencies: [] };
    }
    if (protocol === "rsync") {
      const missingDependencies = this.getMissingProtocolDependencies(protocol, capabilities);
      if (capabilities.rsync) {
        const message = capabilities.sshpass ? "rsync \u53EF\u7528\uFF0Csshpass \u53EF\u7528\u3002\u91CD\u590D\u540C\u6B65\u4F1A\u4F7F\u7528 rsync \u589E\u91CF\u6A21\u5F0F\u3002" : "rsync \u53EF\u7528\u3002\u672C\u5730\u4E0E SSH \u4E92\u4F20\u53EF\u76F4\u63A5\u4F7F\u7528\uFF1BSSH \u8BBE\u5907\u4E92\u4F20\u5BC6\u7801\u8DEF\u7EBF\u5EFA\u8BAE\u5B89\u88C5 sshpass\u3002";
        return { status: "success", message, capabilities, missingDependencies };
      }
      return { status: "error", message: `\u7F3A\u5C11 ${missingDependencies.join("\u3001")}\uFF0Crsync \u589E\u91CF\u4E0D\u53EF\u7528\u3002`, capabilities, missingDependencies };
    }
    if (protocol === "tar") {
      return this.getProtocolCheckResult("auto-fast", capabilities);
    }
    if (protocol === "scp") {
      return capabilities.scp ? { status: "success", message: "SCP \u53EF\u7528\uFF0C\u517C\u5BB9\u6A21\u5F0F\u53EF\u4F7F\u7528\u3002", capabilities, missingDependencies: [] } : { status: "error", message: "SCP \u4E0D\u53EF\u7528\uFF0C\u5C06\u6309 SFTP \u515C\u5E95\u3002", capabilities, missingDependencies: [] };
    }
    return void 0;
  }
  getMissingProtocolDependencies(protocol, capabilities) {
    if (protocol !== "rsync") {
      return [];
    }
    const missing = [];
    if (!capabilities.rsync) {
      missing.push("rsync");
    }
    if (!capabilities.sshpass) {
      missing.push("sshpass");
    }
    return missing;
  }
  toDeviceCapabilities(capabilities) {
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
  handleWorkbenchCommand(command) {
    if (!this.deviceStore) {
      return;
    }
    if (command.targetInstanceId && command.targetInstanceId !== this.currentInput?.instanceId) {
      return;
    }
    if (command.type === "showPage") {
      this.setActivePage(command.page);
      return;
    }
    if (command.type === "addDevice") {
      this.showAddDeviceForm();
      return;
    }
    if (command.type === "refreshDevices") {
      this.devices = this.deviceStore.loadDevices();
      this.ensurePaneDeviceSelection();
      this.statusMessage = `\u8BBE\u5907\u5217\u8868\u5DF2\u5237\u65B0\uFF1A${this.devices.length} \u53F0 SSH \u8BBE\u5907\u3002`;
      this.render();
      return;
    }
    if (command.type === "selectDevice") {
      const device = this.getAllDevices().find((candidate) => candidate.id === command.deviceId);
      if (!device) {
        this.statusMessage = "\u672A\u627E\u5230\u8981\u6253\u5F00\u7684\u8BBE\u5907\u3002";
        this.render();
        return;
      }
      const targetSide = this.paneStates.right.deviceId === device.id ? "left" : "right";
      if (targetSide === "right") {
        this.hasAppliedInitialRightPaneDefault = true;
      }
      const state = this.paneStates[targetSide];
      state.deviceId = device.id;
      state.path = this.getDefaultPaneDevicePath(device);
      state.items = [];
      state.error = void 0;
      this.resetPaneScroll(targetSide);
      this.clearPaneSelection(targetSide);
      this.statusMessage = `\u5DF2\u5728${this.getSideLabel(targetSide)}\u6253\u5F00\u8BBE\u5907\uFF1A${device.name}`;
      this.render();
      void this.refreshPane(targetSide);
      return;
    }
    if (command.type === "showSettings") {
      this.setActivePage("transfer");
      return;
    }
    if (command.type === "showTaskLog") {
      this.setActivePage("tasks");
      return;
    }
    if (command.type === "clearTasks") {
      this.clearFinishedTasks();
      return;
    }
    if (command.type === "testConnection") {
      void this.testCurrentSshConnection();
      return;
    }
    if (command.type === "sync") {
      void this.syncSelectedDirectories();
      return;
    }
    if (command.type === "openTerminal") {
      void this.openTerminal(command.side);
    }
  }
  renderPane(side) {
    const state = this.paneStates[side];
    const device = this.getPaneDevice(side);
    const pane = $(".turbofile-pane");
    pane.dataset.turbofileSide = side;
    pane.classList.toggle("is-maximized", this.maximizedPane === side);
    pane.classList.toggle("is-hidden-by-maximize", !!this.maximizedPane && this.maximizedPane !== side);
    pane.addEventListener("pointerdown", () => this.setActiveFilePaneSide(side));
    pane.addEventListener("focusin", () => this.setActiveFilePaneSide(side));
    const browserTitle = side === "left" ? "\u5DE6\u4FA7\u6587\u4EF6\u6D4F\u89C8" : "\u53F3\u4FA7\u6587\u4EF6\u6D4F\u89C8";
    const header = $(".turbofile-pane-header");
    header.appendChild(this.renderDeviceSelect(side, device));
    const browserHeader = $(".turbofile-browser-header");
    const toolbar = $(".turbofile-browser-toolbar");
    const toolbarTitle = $(".turbofile-browser-toolbar-title");
    toolbarTitle.appendChild(renderTurboFileIcon(side === "left" ? "files" : "folder-check", side === "left" ? "info" : "success"));
    toolbarTitle.append(browserTitle);
    const itemCount = $(".turbofile-browser-item-count");
    this.updatePaneItemCountElement(side, itemCount);
    toolbarTitle.appendChild(itemCount);
    toolbar.appendChild(toolbarTitle);
    const toolbarAccent = side === "left" ? "primary" : "success";
    const gridAccent = side === "left" ? "info" : "success";
    this.appendToolbarButton(toolbar, Codicon.refresh, "\u5237\u65B0", () => this.refreshPane(side, { force: true }), "arrow-clockwise", toolbarAccent);
    this.appendToolbarButton(toolbar, Codicon.search, "\u641C\u7D22", () => this.searchInPane(side), "search", toolbarAccent);
    this.appendToolbarButton(toolbar, Codicon.trash, "\u5220\u9664\u9009\u4E2D\u9879", () => this.deleteSelected(side), "trash", "danger");
    this.appendToolbarButton(toolbar, Codicon.copy, "\u590D\u5236\u5F53\u524D\u8DEF\u5F84", () => {
      void this.copyPanePath(side);
    }, "files", "secondary");
    this.appendToolbarButton(toolbar, Codicon.fileMedia, "\u5C55\u5F00\u56FE\u7247", () => this.openImageGrid(side), "grid-3x3-gap", gridAccent);
    this.appendToolbarButton(toolbar, Codicon.terminal, "\u6253\u5F00\u7EC8\u7AEF", () => this.openTerminal(side), "terminal", toolbarAccent);
    this.appendToolbarButton(
      toolbar,
      this.maximizedPane === side ? Codicon.screenNormal : Codicon.screenFull,
      this.maximizedPane === side ? "\u6062\u590D\u53CC\u680F" : "\u5355\u680F\u663E\u793A",
      () => this.togglePaneMaximized(side)
    );
    const pathbar = this.renderPanePathbar(side, device, state, toolbarAccent);
    const selectedCount = this.getSelectedTransferItems(side).length;
    if (selectedCount > 1) {
      const selectionCount = $(".turbofile-selection-count");
      selectionCount.textContent = `\u5DF2\u9009 ${selectedCount} \u9879`;
      pathbar.appendChild(selectionCount);
    }
    browserHeader.appendChild(toolbar);
    browserHeader.appendChild(pathbar);
    const list = $(".turbofile-file-list");
    list.classList.toggle("is-external-drop-target", this.externalDropTargetSide === side);
    list.classList.add("show-file-icons");
    list.tabIndex = 0;
    list.addEventListener("pointerdown", (event) => {
      this.setActiveFilePaneSide(side);
      if (event.target?.closest(".turbofile-inline-rename")) {
        return;
      }
      list.focus({ preventScroll: true });
    });
    list.addEventListener("click", (event) => {
      const target = event.target;
      if (!target?.closest(".turbofile-file-row") && this.paneStates[side].selectedPaths.size) {
        this.clearPaneSelection(side);
        this.updateRenderedSelection(side);
      }
    });
    list.addEventListener("keydown", (event) => {
      if (event.key === "F2") {
        event.preventDefault();
        this.setActiveFilePaneSide(side);
        void this.renameSelected(side);
        return;
      }
      if (event.key === "Delete") {
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
        if (key === "a") {
          event.preventDefault();
          this.setActiveFilePaneSide(side);
          this.selectAllPaneItems(side);
          return;
        }
        if (key === "c" || key === "x") {
          event.preventDefault();
          this.setActiveFilePaneSide(side);
          this.copySelectedToInternalClipboard(side, key === "x" ? "move" : "copy");
          return;
        }
      }
    });
    list.addEventListener("paste", (event) => {
      event.preventDefault();
      void this.pasteIntoPane(side);
    });
    list.addEventListener("dragover", (event) => {
      const sourceSide = event.dataTransfer?.getData("application/x-turbofile-side");
      if (sourceSide && sourceSide !== side) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "copy";
        }
        this.setExternalDropTargetSide(void 0);
        return;
      }
      if (this.hasExternalDropData(event)) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "copy";
        }
        this.setExternalDropTargetSide(side);
        return;
      }
      this.setExternalDropTargetSide(void 0);
    });
    list.addEventListener("dragleave", (event) => {
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && list.contains(relatedTarget)) {
        return;
      }
      this.setExternalDropTargetSide(void 0);
    });
    list.addEventListener("drop", (event) => {
      const initiatedAt = Date.now();
      event.preventDefault();
      this.setExternalDropTargetSide(void 0);
      const sourceSide = event.dataTransfer?.getData("application/x-turbofile-side");
      if (sourceSide && sourceSide !== side) {
        this.deferAfterDrag(() => void this.transferSelected(sourceSide, side, initiatedAt));
        return;
      }
      const externalPaths = this.extractExternalDropPaths(event);
      if (externalPaths.length) {
        this.deferAfterDrag(() => void this.transferExternalPaths(side, externalPaths, "copy", initiatedAt));
      }
    });
    list.addEventListener("contextmenu", (event) => this.showPaneContextMenu(side, event));
    list.addEventListener("scroll", () => this.handleFileListScroll(side, list));
    this.renderFileList(side, list);
    pane.appendChild(header);
    pane.appendChild(browserHeader);
    pane.appendChild(list);
    return pane;
  }
  renderDeviceSelect(side, currentDevice) {
    const select = $(".turbofile-device-select");
    const button = $("button.turbofile-device-select-button");
    const menu = $(".turbofile-device-select-menu");
    const devices = this.getAllDevices();
    const isOpen = this.openDeviceSelectSide === side;
    select.dataset.turbofileSide = side;
    select.classList.toggle("is-open", isOpen);
    button.type = "button";
    button.title = "\u9009\u62E9\u8BBE\u5907";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", String(isOpen));
    button.setAttribute("aria-label", `${this.getSideLabel(side)}\u8BBE\u5907\u9009\u62E9`);
    button.appendChild(this.renderDeviceSelectIcon(currentDevice));
    button.appendChild($("span.turbofile-device-select-label", void 0, currentDevice ? this.getDeviceDisplayLabel(currentDevice) : "Windows"));
    button.appendChild(renderIcon(Codicon.chevronDown));
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", `${this.getSideLabel(side)}\u8BBE\u5907\u5217\u8868`);
    for (const device of devices) {
      const option = $("button.turbofile-device-select-option");
      option.type = "button";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", device.id === currentDevice?.id ? "true" : "false");
      option.dataset.deviceId = device.id;
      if (device.id === currentDevice?.id) {
        option.classList.add("is-selected");
      }
      option.appendChild(this.renderDeviceSelectIcon(device));
      option.appendChild($("span.turbofile-device-select-label", void 0, this.getDeviceDisplayLabel(device)));
      option.addEventListener("pointerenter", () => this.prefetchPaneDeviceDefaultDirectory(side, device));
      option.addEventListener("focus", () => this.prefetchPaneDeviceDefaultDirectory(side, device));
      option.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.closeDeviceSelect(side, false);
        this.setPaneDevice(side, device);
      });
      menu.appendChild(option);
    }
    const toggleMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = this.openDeviceSelectSide !== side || !select.classList.contains("is-open");
      this.closeDeviceSelect(void 0, false);
      this.openDeviceSelectSide = nextOpen ? side : void 0;
      select.classList.toggle("is-open", nextOpen);
      button.setAttribute("aria-expanded", String(nextOpen));
      if (nextOpen) {
        this.pendingRenderAfterDeviceSelectClose = false;
        const selected = menu.querySelector(".turbofile-device-select-option.is-selected") ?? menu.querySelector(".turbofile-device-select-option");
        selected?.focus();
      } else {
        this.flushPendingRenderAfterDeviceSelectClose();
      }
    };
    button.addEventListener("click", toggleMenu);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        toggleMenu(event);
      }
    });
    select.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeDeviceSelect(side);
        button.focus();
      }
    });
    const window2 = getWindow(select);
    const handleWindowClick = (event) => {
      if (!select.contains(event.target)) {
        this.closeDeviceSelect(side);
      }
    };
    const handleWindowKeydown = (event) => {
      if (event.key === "Escape" && select.classList.contains("is-open")) {
        event.preventDefault();
        this.closeDeviceSelect(side);
        button.focus();
      }
    };
    window2.addEventListener("click", handleWindowClick);
    window2.addEventListener("keydown", handleWindowKeydown);
    this.renderDisposables.add({ dispose: () => window2.removeEventListener("click", handleWindowClick) });
    this.renderDisposables.add({ dispose: () => window2.removeEventListener("keydown", handleWindowKeydown) });
    select.appendChild(button);
    select.appendChild(menu);
    return select;
  }
  shouldDeferRenderForOpenDeviceSelect() {
    if (this.activePage !== "transfer" || !this.openDeviceSelectSide || !this.container) {
      return false;
    }
    return !!this.container.querySelector(`.turbofile-device-select[data-turbofile-side="${this.openDeviceSelectSide}"].is-open`);
  }
  closeDeviceSelect(side, flushPendingRender = true) {
    if (side && this.openDeviceSelectSide !== side) {
      return;
    }
    this.openDeviceSelectSide = void 0;
    for (const opened of Array.from(this.container?.querySelectorAll(".turbofile-device-select.is-open") ?? [])) {
      opened.classList.remove("is-open");
      opened.querySelector(".turbofile-device-select-button")?.setAttribute("aria-expanded", "false");
    }
    if (flushPendingRender) {
      this.flushPendingRenderAfterDeviceSelectClose();
    }
  }
  flushPendingRenderAfterDeviceSelectClose() {
    if (!this.pendingRenderAfterDeviceSelectClose) {
      return;
    }
    this.pendingRenderAfterDeviceSelectClose = false;
    this.render();
  }
  renderPanePathbar(side, device, state, toolbarAccent) {
    const pathbar = $(".turbofile-pathbar");
    pathbar.classList.add(`turbofile-pathbar-${toolbarAccent}`);
    pathbar.appendChild(renderTurboFileIcon("geo-alt-fill", toolbarAccent));
    if (device?.id === LOCAL_WINDOWS_DEVICE_ID) {
      const locationButton = $("button.turbofile-location-menu-button");
      locationButton.type = "button";
      locationButton.title = "\u5FEB\u901F\u5207\u6362 Windows \u4F4D\u7F6E";
      locationButton.setAttribute("aria-haspopup", "menu");
      locationButton.setAttribute("aria-label", `${this.getSideLabel(side)}\u5FEB\u901F\u5207\u6362 Windows \u4F4D\u7F6E`);
      locationButton.appendChild(this.renderWindowsLocationIcon(state.path));
      const locationLabel = $("span.turbofile-location-menu-button-label");
      locationLabel.textContent = this.getWindowsLocationLabel(state.path);
      locationButton.appendChild(locationLabel);
      locationButton.appendChild(renderIcon(Codicon.chevronDown));
      locationButton.addEventListener("click", (event) => this.showWindowsLocationMenu(side, event));
      locationButton.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.showWindowsLocationMenu(side, event);
        }
      });
      pathbar.appendChild(locationButton);
    }
    const display = $("span.turbofile-path-display");
    display.tabIndex = 0;
    display.title = state.error ? state.error : this.formatPanePathForDisplay(state.path, !!device && this.isWindowsDevice(device));
    this.renderPathDisplayContent(display, side, device, state);
    display.addEventListener("click", (event) => this.maybeStartPathInlineEdit(event, side, display));
    display.addEventListener("dblclick", (event) => {
      event.preventDefault();
      this.startPathInlineEdit(side, display);
    });
    display.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.startPathInlineEdit(side, display);
      }
    });
    pathbar.appendChild(display);
    return pathbar;
  }
  renderWindowsLocationIcon(path) {
    const icon = $("span.turbofile-location-icon");
    icon.classList.add(this.getWindowsLocationIconClass(path));
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }
  renderPathDisplayContent(display, side, device, state) {
    clearNode(display);
    if (state.error) {
      display.classList.add("is-error");
      display.textContent = state.error;
      return;
    }
    display.classList.remove("is-error");
    const windowsPath = !!device && this.isWindowsDevice(device);
    const segments = this.getPathSegments(state.path, windowsPath);
    if (!segments.length) {
      const root = $("button.turbofile-path-segment");
      root.type = "button";
      root.textContent = windowsPath ? this.formatPanePathForDisplay(state.path, true) : "\u6839\u76EE\u5F55";
      root.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.openPanePath(side, state.path);
      });
      display.appendChild(root);
      return;
    }
    segments.forEach((segment, index) => {
      if (index > 0) {
        const separator = $("span.turbofile-path-separator");
        separator.textContent = windowsPath ? "\\" : "/";
        display.appendChild(separator);
      }
      const button = $("button.turbofile-path-segment");
      button.type = "button";
      button.textContent = segment.label;
      button.title = this.formatPanePathForDisplay(segment.path, windowsPath);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.openPanePath(side, segment.path);
      });
      display.appendChild(button);
    });
  }
  getPathSegments(path, windowsPath) {
    if (!path) {
      return [];
    }
    if (!windowsPath) {
      const parts = path.split("/").filter(Boolean);
      const segments2 = [{ label: "\u6839\u76EE\u5F55", path: "/" }];
      let current2 = "";
      for (const part of parts) {
        current2 = `${current2}/${part}`;
        segments2.push({ label: part, path: current2 });
      }
      return segments2;
    }
    const normalized = this.formatPanePathForDisplay(path, true);
    const match = /^([A-Za-z]:)(?:\\(.*))?$/.exec(normalized);
    if (!match) {
      return [{ label: normalized, path: normalized }];
    }
    const segments = [{ label: match[1], path: `${match[1]}\\` }];
    const rest = match[2] ?? "";
    let current = `${match[1]}\\`;
    for (const part of rest.split("\\").filter(Boolean)) {
      current = current.endsWith("\\") ? `${current}${part}` : `${current}\\${part}`;
      segments.push({ label: part, path: current });
    }
    return segments;
  }
  maybeStartPathInlineEdit(event, side, display) {
    const target = event.target;
    if (target?.closest(".turbofile-path-segment, .turbofile-path-separator")) {
      return;
    }
    this.startPathInlineEdit(side, display);
  }
  startPathInlineEdit(side, display) {
    const device = this.getPaneDevice(side);
    const windowsPath = !!device && this.isWindowsDevice(device);
    const currentPath = this.formatPanePathForDisplay(this.paneStates[side].path, windowsPath);
    clearNode(display);
    display.classList.add("is-editing");
    const input = $("input.turbofile-path-inline-editor");
    input.type = "text";
    input.value = currentPath;
    input.spellcheck = false;
    display.appendChild(input);
    let committed = false;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        committed = true;
        void this.commitPathInlineEdit(side, input.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        committed = true;
        this.render();
      }
    });
    input.addEventListener("blur", () => {
      if (!committed && display.isConnected) {
        this.render();
      }
    });
    getWindow(display).setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }
  async commitPathInlineEdit(side, rawPath) {
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
  async openPanePath(side, path) {
    await this.refreshPane(side, { path, force: true });
  }
  async navigatePaneDirectory(side, path) {
    const device = this.getPaneDevice(side);
    if (!device) {
      return;
    }
    const state = this.paneStates[side];
    const requestId = ++this.paneRequestSeq[side];
    const cached = this.getCachedPaneDirectory(device, path);
    state.path = path;
    state.error = void 0;
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
        this.setDeviceRuntimeStatus(device, "offline");
        this.statusMessage = `${device.name} \u76EE\u5F55\u5237\u65B0\u5931\u8D25\uFF1A${message}`;
      }
    } finally {
      if (this.paneRequestSeq[side] === requestId) {
        state.loading = false;
        this.render();
      }
    }
  }
  renderFileList(side, list) {
    const state = this.paneStates[side];
    state.viewportHeight = list.clientHeight || state.viewportHeight || FILE_LIST_DEFAULT_VIEWPORT_HEIGHT;
    this.clampFileListScrollTop(side);
    if (state.error) {
      this.fileListRenderedRange[side] = void 0;
      list.appendChild(this.renderFileRow(side, { name: state.error, size: "", rawSize: 0, modified: "", rawModified: 0, type: "unknown" }, false));
      return;
    }
    if (state.loading && state.items.length === 0) {
      this.fileListRenderedRange[side] = void 0;
      const row = $(".turbofile-file-row");
      const name = $(".turbofile-file-name");
      name.textContent = "\u6B63\u5728\u52A0\u8F7D\u76EE\u5F55...";
      row.appendChild(name);
      row.appendChild($(".turbofile-file-meta"));
      row.appendChild($(".turbofile-file-meta"));
      list.appendChild(row);
      return;
    }
    const range = this.getFileListRange(state);
    this.renderFileListSlice(side, list, range);
    list.scrollTop = state.scrollTop;
    this.restoreRenderedFileListScroll(side, list);
    this.scheduleEnrichVisibleRemoteRows(side);
  }
  renderFileListSlice(side, list, range) {
    const state = this.paneStates[side];
    clearNode(list);
    const visibleItems = this.getVisibleFileItems(state);
    if (range.topSpacerHeight > 0) {
      const topSpacer = $(".turbofile-file-list-spacer");
      topSpacer.style.height = `${range.topSpacerHeight}px`;
      list.appendChild(topSpacer);
    }
    for (const item of visibleItems.slice(range.startIndex, range.endIndex)) {
      list.appendChild(this.renderFileRow(side, item, this.isItemSelected(side, item)));
    }
    if (range.bottomSpacerHeight > 0) {
      const bottomSpacer = $(".turbofile-file-list-spacer");
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
  prefetchRenderedDirectoryRows(side, items, range) {
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
  getFileListRange(state) {
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
  clampFileListScrollTop(side) {
    const state = this.paneStates[side];
    const viewportHeight = state.viewportHeight > 0 ? state.viewportHeight : FILE_LIST_DEFAULT_VIEWPORT_HEIGHT;
    const totalHeight = this.getVisibleFileItems(state).length * FILE_LIST_ROW_HEIGHT;
    const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
    const nextScrollTop = Math.max(0, Math.min(state.scrollTop, maxScrollTop));
    if (nextScrollTop === state.scrollTop) {
      return;
    }
    state.scrollTop = nextScrollTop;
    this.fileListRenderedRange[side] = void 0;
  }
  getVisibleFileItems(state) {
    return state.items;
  }
  handleFileListScroll(side, list) {
    const state = this.paneStates[side];
    state.scrollTop = list.scrollTop;
    state.viewportHeight = list.clientHeight || state.viewportHeight;
    if (this.fileListScrollRaf[side] || !this.container) {
      return;
    }
    this.fileListScrollRaf[side] = getWindow(this.container).requestAnimationFrame(() => {
      this.fileListScrollRaf[side] = 0;
      const currentList = this.container?.querySelector(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`);
      if (!currentList || currentList !== list || state.error) {
        return;
      }
      this.updateFileListVirtualSlice(side, currentList);
    });
  }
  updateFileListVirtualSlice(side, list) {
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
  rerenderFileListSliceInPlace(side) {
    if (this.activePage !== "transfer" || this.isTaskLogVisible) {
      return;
    }
    const list = this.container?.querySelector(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`);
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
  scheduleEnrichVisibleRemoteRows(side) {
    const device = this.getPaneDevice(side);
    if (!device || device.id === LOCAL_WINDOWS_DEVICE_ID) {
      return;
    }
    if (!this.paneStates[side].items.some((item) => item.attrsPending)) {
      return;
    }
    if (this.remoteEnrichInFlight[side]) {
      this.remoteEnrichAgain[side] = true;
      return;
    }
    void this.enrichVisibleRemoteRows(side);
  }
  async enrichVisibleRemoteRows(side) {
    const device = this.getPaneDevice(side);
    if (!device || device.id === LOCAL_WINDOWS_DEVICE_ID) {
      return;
    }
    const state = this.paneStates[side];
    const path = state.path;
    const range = this.getFileListRange(state);
    const pending = this.getVisibleFileItems(state).slice(range.startIndex, range.endIndex).filter((item) => item.attrsPending && !!item.path && !item.parent);
    if (!pending.length) {
      return;
    }
    this.remoteEnrichInFlight[side] = true;
    try {
      const options = await this.getSshConnectionOptions(device);
      const stats = await this.sshService.statRemoteEntries(options, path, pending.map((item) => item.name));
      if (this.paneStates[side].path !== path || this.getPaneDevice(side)?.id !== device.id) {
        return;
      }
      const byName = new Map(stats.map((stat) => [stat.name, stat]));
      let changed = false;
      for (const item of pending) {
        const stat = byName.get(item.name);
        if (!stat) {
          continue;
        }
        item.rawSize = stat.size;
        item.size = item.directory ? "" : formatSize(stat.size);
        item.rawModified = stat.modified;
        item.modified = stat.modified > 0 ? formatDate(stat.modified) : "";
        item.attrsPending = false;
        changed = true;
      }
      if (changed) {
        this.rerenderFileListSliceInPlace(side);
      }
    } catch {
    } finally {
      this.remoteEnrichInFlight[side] = false;
      if (this.remoteEnrichAgain[side]) {
        this.remoteEnrichAgain[side] = false;
        this.scheduleEnrichVisibleRemoteRows(side);
      }
    }
  }
  resetPaneScroll(side) {
    const state = this.paneStates[side];
    state.scrollTop = 0;
    state.viewportHeight = 0;
    this.fileListRenderedRange[side] = void 0;
    this.clearFileListScrollRaf(side);
    this.clearFileListRestoreRaf(side);
  }
  clearFileListScrollRaf(side) {
    if (!this.fileListScrollRaf[side] || !this.container) {
      this.fileListScrollRaf[side] = 0;
      return;
    }
    getWindow(this.container).cancelAnimationFrame(this.fileListScrollRaf[side]);
    this.fileListScrollRaf[side] = 0;
  }
  restoreRenderedFileListScroll(side, list) {
    if (!this.container) {
      return;
    }
    this.clearFileListRestoreRaf(side);
    this.fileListRestoreRaf[side] = getWindow(this.container).requestAnimationFrame(() => {
      this.fileListRestoreRaf[side] = 0;
      const currentList = this.container?.querySelector(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`);
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
  clearFileListRestoreRaf(side) {
    if (!this.fileListRestoreRaf[side] || !this.container) {
      this.fileListRestoreRaf[side] = 0;
      return;
    }
    getWindow(this.container).cancelAnimationFrame(this.fileListRestoreRaf[side]);
    this.fileListRestoreRaf[side] = 0;
  }
  renderFileRow(side, item, selected) {
    const row = $(".turbofile-file-row");
    const renaming = this.isInlineRenameTarget(side, item);
    if (item.path) {
      row.dataset.turbofilePath = item.path;
    }
    if (selected || renaming) {
      row.classList.add("is-selected");
    }
    if (renaming) {
      row.classList.add("is-renaming");
    }
    row.classList.add("is-clickable");
    if (item.path && !item.parent && !renaming) {
      row.draggable = true;
      row.addEventListener("dragstart", (event) => {
        this.beginFileRowDrag(side, item, event);
      });
      row.addEventListener("drag", (event) => {
        this.maybeStartWindowsFileDragFromPointer(side, event);
      });
      row.addEventListener("dragend", () => {
        this.clearCurrentFileDragState();
      });
    }
    row.addEventListener("click", (event) => {
      this.setActiveFilePaneSide(side);
      if (renaming && event.target?.closest(".turbofile-inline-rename")) {
        return;
      }
      if (event.detail > 1) {
        return;
      }
      this.container?.querySelector(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`)?.focus({ preventScroll: true });
      this.selectItem(side, item, event, false);
      this.updateRenderedSelection(side);
    });
    if ((item.directory || item.parent) && item.path) {
      row.addEventListener("pointerenter", () => this.prefetchPaneDirectory(side, item.path));
      row.addEventListener("pointerdown", (event) => {
        this.prefetchPaneDirectory(side, item.path);
        this.maybeOpenPaneDirectoryOnFastDoubleClick(side, item, event, renaming);
      });
      const dropTargetPath = item.path;
      row.addEventListener("dragover", (event) => {
        if (this.currentFileDragSide !== side || !this.canMoveSelectionIntoDirectory(side, item, dropTargetPath)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        row.classList.add("is-internal-drop-target");
      });
      row.addEventListener("dragleave", (event) => {
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && row.contains(relatedTarget)) {
          return;
        }
        row.classList.remove("is-internal-drop-target");
      });
      row.addEventListener("drop", (event) => {
        if (this.currentFileDragSide !== side || !this.canMoveSelectionIntoDirectory(side, item, dropTargetPath)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        row.classList.remove("is-internal-drop-target");
        const targetLabel = item.parent ? "\u4E0A\u4E00\u7EA7\u76EE\u5F55" : item.name;
        this.clearCurrentFileDragState();
        this.deferAfterDrag(() => void this.moveSelectedItemsIntoDirectory(side, dropTargetPath, targetLabel));
      });
    }
    row.addEventListener("dblclick", () => {
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
    row.addEventListener("contextmenu", (event) => {
      this.setActiveFilePaneSide(side);
      this.showFileContextMenu(side, item, event);
    });
    const name = $(".turbofile-file-name");
    if (renaming) {
      name.classList.add("is-renaming");
      this.renderInlineRenameInput(side, item, name);
    } else {
      name.appendChild(this.renderFileBrowserIcon(item));
      name.append(item.name);
    }
    const size = $(".turbofile-file-meta");
    size.textContent = item.size;
    const modified = $(".turbofile-file-meta");
    modified.textContent = item.modified;
    row.appendChild(name);
    row.appendChild(size);
    row.appendChild(modified);
    return row;
  }
  maybeOpenPaneDirectoryOnFastDoubleClick(side, item, event, renaming) {
    if (renaming || event.button !== 0 || !item.path || !item.directory && !item.parent) {
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
  consumeSuppressedNativeDirectoryDoubleClick(side, path) {
    if (!path) {
      return false;
    }
    const state = this.paneDoubleClickState[side];
    if (state.suppressNativePath !== path) {
      return false;
    }
    state.suppressNativePath = void 0;
    return true;
  }
  renderInlineRenameInput(side, item, container) {
    let icon = this.renderFileBrowserIcon(item);
    container.appendChild(icon);
    const inputHost = $("span.turbofile-inline-rename");
    container.appendChild(inputHost);
    const inputBox = new InputBox(inputHost, this.contextViewService, {
      ariaLabel: "\u8F93\u5165\u6587\u4EF6\u540D\u3002\u6309 Enter \u786E\u8BA4\u6216 Escape \u53D6\u6D88\u3002",
      inputBoxStyles: defaultInputBoxStyles,
      validationOptions: {
        validation: (value) => {
          const message = this.validateRenameName(side, item, value);
          return message ? { content: message, type: MessageType.ERROR } : null;
        }
      }
    });
    const disposables = new DisposableStore();
    disposables.add(inputBox);
    this.renderDisposables.add(disposables);
    let currentSelectionState = "prefix";
    let finished = false;
    const selectByState = () => {
      const value = inputBox.value;
      const dotIndex = value.lastIndexOf(".");
      if (item.directory || dotIndex <= 0) {
        inputBox.select({ start: 0, end: value.length });
        return;
      }
      if (currentSelectionState === "prefix") {
        inputBox.select({ start: 0, end: dotIndex });
      } else if (currentSelectionState === "all") {
        inputBox.select({ start: 0, end: value.length });
      } else {
        inputBox.select({ start: dotIndex + 1, end: value.length });
      }
    };
    const finish = (success) => {
      if (finished) {
        return;
      }
      finished = true;
      const nextName = inputBox.value;
      disposables.dispose();
      if (!this.isInlineRenameTarget(side, item)) {
        return;
      }
      this.inlineRename = void 0;
      this.render();
      if (success && nextName.trim() && nextName !== item.name && !this.validateRenameName(side, item, nextName)) {
        void this.performRename(side, item, nextName);
      }
    };
    inputBox.value = item.name;
    inputBox.validate();
    disposables.add(inputBox.onDidChange((value) => {
      const targetName = value || " ";
      const targetPath = item.path ? joinPanePath(this.paneStates[side].path, targetName, this.isWindowsDevice(this.getPaneDevice(side) ?? this.localWindowsDevice)) : void 0;
      const nextIcon = this.renderFileBrowserIcon({ ...item, name: targetName, path: targetPath });
      icon.replaceWith(nextIcon);
      icon = nextIcon;
      inputBox.validate();
    }));
    const handleKeydown = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "a" || key === "c" || key === "v" || key === "x" || key === "y" || key === "z") {
          event.stopPropagation();
          return;
        }
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (!inputBox.validate()) {
          finish(true);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        event.stopPropagation();
        if (currentSelectionState === "prefix") {
          currentSelectionState = "all";
        } else if (currentSelectionState === "all") {
          currentSelectionState = "suffix";
        } else {
          currentSelectionState = "prefix";
        }
        selectByState();
      }
    };
    inputBox.inputElement.addEventListener("keydown", handleKeydown);
    disposables.add({ dispose: () => inputBox.inputElement.removeEventListener("keydown", handleKeydown) });
    const stopClipboardEventPropagation = (event) => event.stopPropagation();
    for (const eventType of ["copy", "cut", "paste"]) {
      inputBox.inputElement.addEventListener(eventType, stopClipboardEventPropagation);
      disposables.add({ dispose: () => inputBox.inputElement.removeEventListener(eventType, stopClipboardEventPropagation) });
    }
    const handleBlur = () => {
      const window3 = getWindow(inputBox.inputElement);
      window3.setTimeout(() => {
        if (finished || window3.document.activeElement === inputBox.inputElement) {
          return;
        }
        finish(inputBox.isInputValid());
      }, 0);
    };
    inputBox.inputElement.addEventListener("blur", handleBlur);
    disposables.add({ dispose: () => inputBox.inputElement.removeEventListener("blur", handleBlur) });
    const window2 = getWindow(inputHost);
    const frame = window2.requestAnimationFrame(() => {
      if (!finished && this.isInlineRenameTarget(side, item)) {
        inputBox.focus();
        currentSelectionState = "prefix";
        selectByState();
      }
    });
    disposables.add({ dispose: () => window2.cancelAnimationFrame(frame) });
  }
  renderTaskbar() {
    const taskbar = $(".turbofile-taskbar");
    const runningTransfers = this.tasks.filter((task) => task.kind === "transfer" && task.status === "running");
    const runningTasks = this.tasks.filter((task) => task.status === "running");
    const latest = this.tasks[0];
    const stats = this.getTaskStats();
    if (runningTransfers.length) {
      taskbar.classList.add("has-live-transfer");
    }
    taskbar.tabIndex = 0;
    taskbar.setAttribute("role", "button");
    taskbar.title = "\u6253\u5F00\u4EFB\u52A1\u65E5\u5FD7";
    taskbar.setAttribute("aria-label", "\u6253\u5F00\u4EFB\u52A1\u65E5\u5FD7");
    taskbar.addEventListener("click", () => this.setActivePage("tasks"));
    taskbar.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.setActivePage("tasks");
      }
    });
    const progress = $(".turbofile-statusbar-progress");
    const progressValue = $(".turbofile-statusbar-progress-value");
    const liveSummary = runningTransfers.length ? this.getLiveTransferAggregate(runningTransfers) : void 0;
    const livePercent = liveSummary && liveSummary.totalBytes > 0 ? Math.max(0, Math.min(100, liveSummary.transferredBytes / liveSummary.totalBytes * 100)) : runningTasks.length ? Math.max(...runningTasks.map((task) => task.progress)) : 0;
    progressValue.style.width = runningTasks.length ? `${livePercent.toFixed(1)}%` : "0%";
    progress.classList.toggle("is-running", runningTasks.length > 0);
    progress.appendChild(progressValue);
    taskbar.appendChild(progress);
    const content = $(".turbofile-statusbar-content");
    const left = $(".turbofile-statusbar-section.is-left");
    left.appendChild(this.renderStatusbarItem(Codicon.history, `\u8FD0\u884C ${stats.running} \xB7 \u6210\u529F ${stats.success} \xB7 \u5931\u8D25 ${stats.error} \xB7 \u53D6\u6D88 ${stats.canceled}`));
    const message = $(".turbofile-statusbar-message");
    const title = $(".turbofile-statusbar-message-title");
    const meta = $(".turbofile-task-meta.turbofile-statusbar-message-detail");
    if (runningTransfers.length) {
      title.textContent = this.getLiveTransferStatusTitle(runningTransfers);
      meta.textContent = "";
    } else if (latest) {
      title.textContent = this.formatTaskLine(latest);
      meta.textContent = "";
    } else {
      title.textContent = this.statusMessage;
      meta.textContent = "\u6682\u65E0\u4F20\u8F93\u4EFB\u52A1\uFF0C\u6700\u8FD1\u65E5\u5FD7\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002";
    }
    message.appendChild(title);
    if (meta.textContent) {
      message.appendChild(meta);
    }
    const right = $(".turbofile-statusbar-section.is-right");
    if (runningTransfers.length && liveSummary) {
      const isRsyncTransferRunning = runningTransfers.some((task) => task.strategy?.startsWith("rsync"));
      const transferSizeText = liveSummary.totalBytes > 0 ? `${formatSize(liveSummary.transferredBytes)} / ${formatSize(liveSummary.totalBytes)}` : liveSummary.transferredBytes > 0 || isRsyncTransferRunning ? formatSize(liveSummary.transferredBytes) : "\u51C6\u5907\u4F20\u8F93";
      const showElapsedTime = liveSummary.remainingMs === void 0 || liveSummary.remainingMs <= 0 || !Number.isFinite(liveSummary.remainingMs);
      const timeText = showElapsedTime ? this.formatElapsed(liveSummary.startedAt) : this.formatRemaining(liveSummary.remainingMs);
      const timeTitle = showElapsedTime ? "\u5DF2\u8017\u65F6" : "\u5269\u4F59\u65F6\u95F4";
      right.appendChild(this.renderStatusbarItem(Codicon.arrowSwap, this.formatSpeed(liveSummary.speedBytesPerSecond), "\u5F53\u524D\u901F\u5EA6"));
      right.appendChild(this.renderStatusbarItem(Codicon.clock, timeText, timeTitle));
      right.appendChild(this.renderStatusbarItem(Codicon.archive, transferSizeText, "\u5DF2\u4F20\u8F93"));
      const protocol = runningTransfers.length === 1 ? this.getTransferProtocolLabel(runningTransfers[0].strategy) : void 0;
      if (protocol) {
        right.appendChild(this.renderStatusbarItem(Codicon.terminal, protocol, "\u4F20\u8F93\u6A21\u5F0F"));
      }
      const cancel = this.createIconButton(Codicon.close, "\u53D6\u6D88\u8FD0\u884C\u4E2D\u7684\u4F20\u8F93", "turbofile-statusbar-cancel");
      this.renderDisposables.add(cancel);
      cancel.element.disabled = runningTransfers.every((task) => task.cancelRequested);
      cancel.element.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.cancelRunningTransfers(runningTransfers);
      });
      right.appendChild(cancel.element);
    } else if (latest) {
      right.appendChild(this.renderStatusbarItem(this.getTaskIcon(latest), latest.status === "running" ? "\u8FDB\u884C\u4E2D" : latest.status === "success" ? "\u5B8C\u6210" : latest.status === "canceled" ? "\u5DF2\u53D6\u6D88" : "\u5931\u8D25"));
    } else {
      right.appendChild(this.renderStatusbarItem(Codicon.info, "\u4EFB\u52A1\u65E5\u5FD7"));
    }
    content.appendChild(left);
    content.appendChild(message);
    content.appendChild(right);
    taskbar.appendChild(content);
    return taskbar;
  }
  refreshTaskbar() {
    if (!this.container || this.isTaskbarHiddenForTerminal() || this.activePage !== "transfer") {
      return;
    }
    const current = this.container.querySelector(".turbofile-taskbar");
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
  isTaskbarHiddenForTerminal() {
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
  renderStatusbarItem(icon, text, title) {
    const item = $(".turbofile-statusbar-item");
    if (title) {
      item.title = title;
    }
    item.appendChild(renderIcon(icon));
    const label = $("span");
    label.textContent = text;
    item.appendChild(label);
    return item;
  }
  getLiveTransferStatusTitle(tasks) {
    const items = tasks.flatMap((task) => this.getLiveTransferItems(task).map((item) => ({ task, item })));
    const active = items.find(({ item }) => item.status === "running") ?? items.find(({ item }) => item.status === "waiting") ?? items[0];
    if (!active) {
      return tasks.length > 1 ? `\u6B63\u5728\u4F20\u8F93 ${tasks.length} \u4E2A\u4EFB\u52A1` : tasks[0].label;
    }
    return items.length > 1 ? `\u6B63\u5728\u4F20\u8F93\uFF1A${active.item.name} \xB7 ${items.length} \u9879` : `\u6B63\u5728\u4F20\u8F93\uFF1A${active.item.name}`;
  }
  getLiveTransferItems(task) {
    return task.transferItems?.length ? task.transferItems : [this.createFallbackTransferItem(task)];
  }
  createFallbackTransferItem(task) {
    const totalBytes = task.totalBytes ?? task.bytes ?? 0;
    const transferredBytes = task.transferredBytes ?? 0;
    return {
      name: task.label.replace(/^复制\s+/, ""),
      type: "file",
      displaySize: totalBytes > 0 ? formatSize(totalBytes) : "",
      rawSize: totalBytes,
      status: task.status === "running" ? "running" : task.status,
      progress: task.progress,
      transferredBytes,
      totalBytes,
      speedBytesPerSecond: task.speedBytesPerSecond ?? 0,
      remainingMs: task.remainingMs,
      strategy: task.strategy,
      speedSamples: task.speedSamples ?? []
    };
  }
  getLiveTransferAggregate(tasks) {
    let transferredBytes = 0;
    let totalBytes = 0;
    let speedBytesPerSecond = 0;
    let startedAt;
    const addStartedAt = (candidate) => {
      if (candidate === void 0) {
        return;
      }
      startedAt = startedAt === void 0 ? candidate : Math.min(startedAt, candidate);
    };
    for (const task of tasks) {
      const taskDataStartedAt = task.transferStartedAt;
      const taskVisibleStartedAt = getVisibleTransferStartedAt({
        status: task.status,
        strategy: task.strategy,
        startedAt: task.startedAt,
        transferStartedAt: task.transferStartedAt
      });
      if ((task.transferItems?.length ?? 0) > 1 && task.activeTransferItemIndex === void 0 && task.totalBytes !== void 0) {
        transferredBytes += task.transferredBytes ?? 0;
        totalBytes += task.totalBytes ?? 0;
        speedBytesPerSecond += task.status === "running" ? task.speedBytesPerSecond ?? 0 : 0;
        addStartedAt(taskVisibleStartedAt);
        continue;
      }
      const items = this.getLiveTransferItems(task);
      for (const item of items) {
        transferredBytes += item.transferredBytes;
        totalBytes += this.getLiveTransferItemTotal(item, task);
        speedBytesPerSecond += item.status === "running" ? item.speedBytesPerSecond : 0;
        addStartedAt(getVisibleTransferStartedAt({
          status: item.status,
          strategy: item.strategy ?? task.strategy,
          startedAt: item.startedAt ?? task.startedAt,
          transferStartedAt: item.transferStartedAt ?? taskDataStartedAt
        }));
      }
    }
    const remainingBytes = Math.max(0, totalBytes - transferredBytes);
    const remainingMs = totalBytes > 0 && transferredBytes < totalBytes && speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond * 1e3 : void 0;
    return {
      transferredBytes,
      totalBytes,
      speedBytesPerSecond,
      remainingMs,
      startedAt
    };
  }
  getLiveTransferItemTotal(item, task) {
    const strategy = item.strategy ?? task?.strategy;
    if ((task?.status === "running" || item.status === "running") && this.isRsyncStrategy(strategy)) {
      return Math.max(item.totalBytes, 0);
    }
    return Math.max(item.totalBytes, item.rawSize, item.transferredBytes, 0);
  }
  isRsyncStrategy(strategy) {
    return isTurboFileRsyncStrategy(strategy);
  }
  formatSpeed(bytesPerSecond) {
    return bytesPerSecond && bytesPerSecond > 0 ? `${formatTransferRate(bytesPerSecond)}/s` : "--";
  }
  formatRemaining(milliseconds) {
    return milliseconds !== void 0 && Number.isFinite(milliseconds) && milliseconds >= 0 ? formatDuration(milliseconds) : "--";
  }
  formatElapsed(startedAt) {
    if (startedAt === void 0) {
      return "--";
    }
    return formatDuration(Math.max(0, Date.now() - startedAt));
  }
  async cancelRunningTransfers(tasks) {
    for (const task of tasks) {
      await this.cancelTask(task);
    }
  }
  getRunningTaskCount() {
    return this.tasks.filter((task) => task.status === "running").length;
  }
  updateInputRunningTaskCount() {
    this.currentInput?.setRunningTaskCount(this.getRunningTaskCount());
  }
  async cancelRunningTasksForClose() {
    const runningTasks = this.tasks.filter((task) => task.status === "running");
    await this.cancelRunningTransfers(runningTasks);
    for (const task of runningTasks) {
      if (task.status === "running") {
        this.finishTask(task, "canceled", `\u5DF2\u53D6\u6D88\u4EFB\u52A1\uFF1A${task.label}`);
      }
    }
    this.updateInputRunningTaskCount();
  }
  renderTaskLogOverlay() {
    const overlay = $(".turbofile-task-log-overlay");
    const panel = $(".turbofile-task-log-panel");
    const header = $(".turbofile-task-log-header");
    const title = $("h2");
    title.textContent = "\u4EFB\u52A1\u65E5\u5FD7";
    const close = this.createIconButton(Codicon.close, "\u5173\u95ED\u4EFB\u52A1\u65E5\u5FD7", "turbofile-toolbar-button");
    this.renderDisposables.add(close);
    close.element.addEventListener("click", () => {
      this.isTaskLogVisible = false;
      this.render();
    });
    header.appendChild(title);
    header.appendChild(close.element);
    const list = $(".turbofile-task-log-list");
    if (!this.tasks.length) {
      const empty = $(".turbofile-task-log-empty");
      empty.textContent = "\u6682\u65E0\u4EFB\u52A1\u8BB0\u5F55";
      list.appendChild(empty);
    } else {
      for (const task of this.tasks) {
        list.appendChild(this.renderTaskRow(task));
      }
    }
    panel.appendChild(header);
    panel.appendChild(list);
    overlay.appendChild(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        this.isTaskLogVisible = false;
        this.render();
      }
    });
    return overlay;
  }
  clearFinishedTasks() {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (this.tasks[i].status !== "running") {
        this.tasks.splice(i, 1);
      }
    }
    this.statusMessage = "\u5DF2\u6E05\u7A7A\u5B8C\u6210\u7684\u4EFB\u52A1\u3002";
    this.render();
  }
  renderTaskRow(task) {
    const row = $(".turbofile-task-row");
    row.classList.add(`is-${task.status}`);
    const name = $(".turbofile-task-row-name");
    name.appendChild(renderIcon(this.getTaskIcon(task)));
    name.append(task.label);
    const detail = $(".turbofile-task-row-detail");
    detail.textContent = task.detail;
    const metrics = $(".turbofile-task-row-metrics");
    metrics.textContent = this.getTaskMetrics(task);
    const actions = $(".turbofile-task-row-actions");
    if (task.status === "running" && task.progressId) {
      const cancel = this.createIconButton(Codicon.debugStop, "\u53D6\u6D88\u4EFB\u52A1", "turbofile-task-row-button");
      this.renderDisposables.add(cancel);
      cancel.element.disabled = !!task.cancelRequested;
      cancel.element.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.cancelTask(task);
      });
      actions.appendChild(cancel.element);
    } else if ((task.status === "error" || task.status === "canceled") && task.retryTransfer) {
      const retry = this.createIconButton(Codicon.redo, "\u91CD\u8BD5\u4EFB\u52A1", "turbofile-task-row-button");
      this.renderDisposables.add(retry);
      retry.element.addEventListener("click", (event) => {
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
  async cancelTask(task) {
    if (task.status !== "running" || task.cancelRequested) {
      return;
    }
    task.cancelRequested = true;
    task.detail = "\u6B63\u5728\u53D6\u6D88\u4EFB\u52A1...";
    this.statusMessage = task.detail;
    this.render();
    if (!task.progressId) {
      return;
    }
    const result = await this.sshService.cancelTransfer(task.progressId);
    if (!result.ok && task.status === "running") {
      this.finishTask(task, "error", `\u53D6\u6D88\u4EFB\u52A1\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
    }
  }
  async retryTask(task) {
    const retry = task.retryTransfer;
    if (!retry || task.status !== "error" && task.status !== "canceled") {
      return;
    }
    const sourceDevice = retry.sourceDeviceId ? this.getDeviceById(retry.sourceDeviceId) : this.getPaneDevice(retry.sourceSide);
    const targetDevice = this.getPaneDevice(retry.targetSide);
    const nextTask = this.beginTask("transfer", `\u91CD\u8BD5 ${retry.sourceItem.name}`, `${sourceDevice?.name ?? retry.sourceSide} -> ${targetDevice?.name ?? retry.targetSide}`);
    nextTask.retryTransfer = retry;
    const result = await this.transferItem(retry.sourceSide, retry.targetSide, retry.sourceItem, {
      refreshTarget: true,
      task: nextTask,
      targetPath: retry.targetPath,
      sourceDeviceOverride: sourceDevice
    });
    if (result.ok) {
      this.finishTask(nextTask, "success", `\u91CD\u8BD5\u5B8C\u6210\uFF1A${retry.sourceItem.name}`, { bytes: result.bytes, strategy: result.strategy });
      return;
    }
    if (result.canceled) {
      this.finishTask(nextTask, "canceled", `\u5DF2\u53D6\u6D88\u91CD\u8BD5\uFF1A${retry.sourceItem.name}`);
      return;
    }
    this.finishTask(nextTask, "error", `\u91CD\u8BD5\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
  }
  updateLiveTransferTicker() {
    const needsStartupTicker = this.tasks.some((task) => this.needsLiveTransferStartupTicker(task));
    if (needsStartupTicker && this.liveTransferTicker === void 0 && this.container) {
      this.liveTransferTicker = getWindow(this.container).setInterval(() => {
        if (!this.tasks.some((task) => this.needsLiveTransferStartupTicker(task))) {
          this.clearLiveTransferTicker();
          return;
        }
        this.render();
      }, TURBOFILE_RSYNC_STARTUP_TICK_INTERVAL_MS);
    } else if (!needsStartupTicker) {
      this.clearLiveTransferTicker();
    }
  }
  needsLiveTransferStartupTicker(task) {
    if (task.kind !== "transfer" || task.status !== "running") {
      return false;
    }
    if (task.transferStartedAt !== void 0) {
      return false;
    }
    return this.getLiveTransferItems(task).some((item) => item.status === "running" && item.transferStartedAt === void 0 && this.isRsyncStrategy(item.strategy ?? task.strategy));
  }
  clearLiveTransferTicker() {
    if (this.liveTransferTicker !== void 0 && this.container) {
      getWindow(this.container).clearInterval(this.liveTransferTicker);
    }
    this.liveTransferTicker = void 0;
  }
  beginTask(kind, label, detail) {
    const task = {
      id: this.taskSequence++,
      kind,
      label,
      detail,
      status: "running",
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
  updateTask(task, detail, progress = task.progress) {
    task.detail = detail;
    task.progress = progress;
    this.statusMessage = detail;
    this.render();
  }
  updateTransferProgress(task, event) {
    const activeItem = task.activeTransferItemIndex !== void 0 ? task.transferItems?.[task.activeTransferItemIndex] : void 0;
    const strategy = this.getTransferStrategyFromProgress(event) ?? task.strategy;
    const isRsyncProgress = strategy?.startsWith("rsync") ?? false;
    const knownTotalBytes = activeItem ? activeItem.totalBytes : task.totalBytes ?? 0;
    const totalBytes = event.totalBytes > 0 ? event.totalBytes : isRsyncProgress ? 0 : knownTotalBytes;
    const transferredBytes = Math.min(event.transferredBytes, totalBytes > 0 ? totalBytes : event.transferredBytes);
    const progress = totalBytes > 0 ? Math.max(0, Math.min(100, Math.round(transferredBytes / totalBytes * 100))) : event.phase === "complete" ? 100 : Math.max(8, task.progress);
    let detail = this.formatTransferProgressDetail(event, transferredBytes, totalBytes);
    if (event.totalItems && event.totalItems > 1) {
      const completedItems = Math.max(0, Math.min(event.completedItems ?? 0, event.totalItems));
      const currentName = event.currentName ? `\uFF1A${event.currentName}` : "";
      detail = `${detail} \xB7 ${completedItems}/${event.totalItems}${currentName}`;
    }
    const now = Date.now();
    const speedTarget = activeItem ?? task;
    const resetRsyncSpeedSample = isRsyncProgress && transferredBytes > 0 && task.transferStartedAt === void 0 && (speedTarget.lastSampleBytes ?? 0) <= 0;
    const sampledSpeed = resetRsyncSpeedSample ? this.resetTransferSpeedSample(speedTarget, transferredBytes, now) : this.calculateTransferSpeed(speedTarget, transferredBytes, now);
    const eventSpeed = event.speedBytesPerSecond !== void 0 && event.speedBytesPerSecond >= 0 && Number.isFinite(event.speedBytesPerSecond) ? event.speedBytesPerSecond : void 0;
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
    if (shouldStartTransferTimingValue && task.transferStartedAt === void 0) {
      task.transferStartedAt = now;
    }
    if (activeItem) {
      activeItem.startedAt ??= task.startedAt;
      if (shouldStartTransferTimingValue && activeItem.transferStartedAt === void 0) {
        activeItem.transferStartedAt = now;
      }
      activeItem.status = event.phase === "complete" ? "success" : "running";
      activeItem.transferredBytes = transferredBytes;
      activeItem.totalBytes = totalBytes;
      activeItem.progress = event.phase === "complete" ? 100 : progress;
      activeItem.speedBytesPerSecond = speed;
      activeItem.remainingMs = speed > 0 && totalBytes > 0 && totalBytes > transferredBytes ? (totalBytes - transferredBytes) / speed * 1e3 : void 0;
      activeItem.strategy = strategy;
      if (event.phase === "complete") {
        activeItem.endedAt = now;
      }
    }
    const aggregate = this.getLiveTransferAggregate([task]);
    task.transferredBytes = activeItem ? aggregate.transferredBytes : transferredBytes;
    task.totalBytes = activeItem ? aggregate.totalBytes : totalBytes;
    task.speedBytesPerSecond = activeItem ? aggregate.speedBytesPerSecond : speed;
    task.remainingMs = aggregate.remainingMs;
    task.strategy = strategy;
    task.progress = activeItem && aggregate.totalBytes > 0 ? Math.max(0, Math.min(100, Math.round(aggregate.transferredBytes / aggregate.totalBytes * 100))) : event.phase === "complete" ? 100 : progress;
    task.detail = detail;
    this.statusMessage = detail;
    this.updateLiveTransferTicker();
    const renderIntervalMs = strategy?.startsWith("rsync") ? RSYNC_PROGRESS_RENDER_INTERVAL_MS : TRANSFER_PROGRESS_RENDER_INTERVAL_MS;
    if (event.phase === "complete" || totalBytes > 0 && transferredBytes >= totalBytes || now - (task.lastProgressRenderAt ?? 0) > renderIntervalMs) {
      task.lastProgressRenderAt = now;
      if (this.activePage === "transfer" && !this.isTaskLogVisible) {
        this.refreshTaskbar();
      } else {
        this.render();
      }
    }
  }
  calculateTransferSpeed(target, transferredBytes, now) {
    const previousAt = target.lastSampleAt;
    const previousBytes = target.lastSampleBytes;
    const previousSpeed = target.speedBytesPerSecond ?? 0;
    if (previousAt === void 0 || previousBytes === void 0 || now <= previousAt || transferredBytes < previousBytes) {
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
    const rawSpeed = elapsed > 0 ? (transferredBytes - previousBytes) / elapsed * 1e3 : 0;
    this.appendTransferSpeedSample(target.speedSamples ??= [], rawSpeed);
    return this.getSmoothedTransferSpeed(target.speedSamples, previousSpeed);
  }
  resetTransferSpeedSample(target, transferredBytes, now) {
    target.lastSampleAt = now;
    target.lastSampleBytes = transferredBytes;
    return target.speedBytesPerSecond ?? 0;
  }
  appendTransferSpeedSample(samples, speed) {
    if (!Number.isFinite(speed) || speed <= 0) {
      return;
    }
    samples.push(speed);
    if (samples.length > TRANSFER_SPEED_SAMPLE_MAX_COUNT) {
      samples.splice(0, samples.length - TRANSFER_SPEED_SAMPLE_MAX_COUNT);
    }
  }
  getSmoothedTransferSpeed(samples, previousSpeed) {
    const validSamples = samples.filter((speed) => Number.isFinite(speed) && speed > 0);
    if (!validSamples.length) {
      return previousSpeed;
    }
    const sorted = [...validSamples].sort((a, b) => a - b);
    const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
    const average = trimmed.reduce((sum, speed) => sum + speed, 0) / trimmed.length;
    return previousSpeed > 0 ? previousSpeed * 0.65 + average * 0.35 : average;
  }
  getTransferStrategyFromProgress(event) {
    if (event.strategy) {
      return event.strategy;
    }
    const detail = event.detail?.toLowerCase() ?? "";
    if (event.phase === "rsync-direct") {
      return detail.includes("parallel") ? "rsync-direct-parallel" : "rsync-direct";
    }
    if (event.phase === "relay-download" || event.phase === "relay-upload") {
      if (detail.includes("rsync relay")) {
        return "rsync-relay";
      }
      return "sftp-relay";
    }
    if (detail.includes("rsync relay")) {
      return "rsync-relay";
    }
    if (detail.includes("direct sftp")) {
      return "sftp-direct";
    }
    if (detail.includes("direct scp")) {
      return "scp-direct";
    }
    if (detail.includes("scp upload")) {
      return "scp-upload";
    }
    if (detail.includes("scp download")) {
      return "scp-download";
    }
    if (detail.includes("sftp upload")) {
      return "sftp-upload";
    }
    if (detail.includes("sftp download")) {
      return "sftp-download";
    }
    if (detail.includes("sftp relay")) {
      return "sftp-relay";
    }
    if (detail.includes("direct rsync")) {
      return "rsync-direct";
    }
    if (detail.includes("direct tar")) {
      return "tar-direct";
    }
    if (detail.includes("tar relay")) {
      return "tar-relay";
    }
    if (detail.includes("tar upload")) {
      return "tar-upload";
    }
    if (detail.includes("tar download")) {
      return "tar-download";
    }
    if (detail.includes("remote copy")) {
      return "remote-copy";
    }
    if (detail.includes("local copy")) {
      return "local-copy";
    }
    return void 0;
  }
  getTransferProtocolLabel(strategy) {
    switch (strategy) {
      case "tar-direct":
        return "tar \u76F4\u8FDE";
      case "tar-relay":
        return "tar \u4E2D\u8F6C";
      case "tar-upload":
        return "tar \u4E0A\u4F20";
      case "tar-download":
        return "tar \u4E0B\u8F7D";
      case "rsync-direct":
      case "rsync-direct-parallel":
        return "rsync \u76F4\u8FDE";
      case "sftp-direct":
        return "sftp \u76F4\u8FDE";
      case "scp-direct":
        return "scp \u76F4\u8FDE";
      case "scp-relay":
        return "scp \u4E2D\u8F6C";
      case "sftp-upload":
        return "sftp \u4E0A\u4F20";
      case "sftp-download":
        return "sftp \u4E0B\u8F7D";
      case "scp-upload":
        return "scp \u4E0A\u4F20";
      case "scp-download":
        return "scp \u4E0B\u8F7D";
      case "rsync-upload":
        return "rsync \u4E0A\u4F20";
      case "rsync-download":
        return "rsync \u4E0B\u8F7D";
      case "rsync-relay":
        return "rsync \u4E2D\u8F6C";
      case "sftp-relay":
        return "sftp \u4E2D\u8F6C";
      case "remote-copy":
        return "\u540C\u673A\u590D\u5236";
      case "local-copy":
        return "\u672C\u5730\u590D\u5236";
      case "remote-move":
        return "\u540C\u673A\u79FB\u52A8";
      case "local-move":
        return "\u672C\u673A\u79FB\u52A8";
      default:
        return strategy;
    }
  }
  getPlannedTransferStrategy(sourceDevice, targetDevice, sourceItem) {
    if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
      return "local-copy";
    }
    if (this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
      return "remote-copy";
    }
    const sourceEndpoint = this.toPlanningEndpoint(sourceDevice, sourceItem.path ?? "");
    const targetEndpoint = this.toPlanningEndpoint(targetDevice, "");
    const plan = resolveTransferPlan({
      source: sourceEndpoint,
      target: targetEndpoint,
      sourceType: sourceItem.type,
      itemCount: 1
    });
    return this.transferAttemptToPlannedStrategy(plan.attempts[0], sourceEndpoint, targetEndpoint);
  }
  getPlannedBatchTransferStrategy(sourceDevice, targetDevice, sourceItems) {
    if (!sourceItems.length) {
      return "scp-direct";
    }
    if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
      return "local-copy";
    }
    if (this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
      return "remote-copy";
    }
    const sourceEndpoint = this.toPlanningEndpoint(sourceDevice, sourceItems[0].path ?? "");
    const targetEndpoint = this.toPlanningEndpoint(targetDevice, "");
    const plan = resolveTransferPlan({
      source: sourceEndpoint,
      target: targetEndpoint,
      sourceType: sourceItems.some((item) => item.directory) ? "directory" : sourceItems[0].type,
      itemCount: sourceItems.length
    });
    return this.transferAttemptToPlannedStrategy(plan.attempts[0], sourceEndpoint, targetEndpoint);
  }
  primeTransferTaskStrategy(task, sourceDevice, targetDevice, sourceItems) {
    const plannedStrategy = sourceItems.length > 1 ? this.getPlannedBatchTransferStrategy(sourceDevice, targetDevice, sourceItems) : this.getPlannedTransferStrategy(sourceDevice, targetDevice, sourceItems[0]);
    const initialStrategy = this.shouldDeferSshToSshStrategy(sourceDevice, targetDevice) ? void 0 : plannedStrategy;
    task.strategy = initialStrategy;
    for (const transferItem of task.transferItems ?? []) {
      transferItem.strategy = initialStrategy;
    }
    this.updateLiveTransferTicker();
    if (this.activePage === "transfer" && !this.isTaskLogVisible) {
      this.refreshTaskbar();
    } else {
      this.render();
    }
  }
  toPlanningEndpoint(device, path) {
    if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
      return { kind: "local", path };
    }
    return {
      kind: "ssh",
      path,
      label: device.name,
      supportsRsync: device.capabilities.rsync,
      supportsTar: device.capabilities.tar,
      preferredProtocol: device.preferredTransferProtocol
    };
  }
  transferAttemptToPlannedStrategy(attempt, source, target) {
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
    if (source.kind === "local" && target.kind === "ssh") {
      return `${attempt.protocol}-upload`;
    }
    if (source.kind === "ssh" && target.kind === "local") {
      return `${attempt.protocol}-download`;
    }
    return "local-copy";
  }
  shouldDeferSshToSshStrategy(sourceDevice, targetDevice) {
    return sourceDevice.id !== LOCAL_WINDOWS_DEVICE_ID && targetDevice.id !== LOCAL_WINDOWS_DEVICE_ID && !this.isSameDeviceForNativeOperation(sourceDevice, targetDevice);
  }
  formatTransferProgressDetail(event, transferredBytes, totalBytes) {
    const phase = event.phase;
    const phaseLabel = phase === "relay-download" ? "\u4E2D\u8F6C\u4E0B\u8F7D" : phase === "relay-upload" ? "\u4E2D\u8F6C\u4E0A\u4F20" : phase === "rsync-direct" ? "\u76F4\u8FDE\u4F20\u8F93" : phase === "prepare" ? "\u51C6\u5907\u4F20\u8F93" : phase === "complete" ? "\u4F20\u8F93\u5B8C\u6210" : "\u6B63\u5728\u4F20\u8F93";
    const extraParts = [];
    if (event.toCheck !== void 0 && event.totalChecks !== void 0) {
      extraParts.push(`to-check ${event.toCheck}/${event.totalChecks}`);
    }
    if (event.transferIndex !== void 0) {
      extraParts.push(`xfr#${event.transferIndex}`);
    }
    const extra = extraParts.length > 0 ? ` (${extraParts.join("; ")})` : "";
    if (totalBytes > 0) {
      return `${phaseLabel}\uFF1A${formatSize(transferredBytes)} / ${formatSize(totalBytes)}${extra}`;
    }
    if (transferredBytes > 0) {
      return `${phaseLabel}\uFF1A${formatSize(transferredBytes)}${extra}`;
    }
    return extra ? `${phaseLabel} (${extraParts.join("; ")})` : phaseLabel;
  }
  finishTask(task, status, detail, options = {}) {
    task.status = status;
    task.detail = detail;
    task.endedAt = Date.now();
    if (task.kind === "transfer") {
      const timingStartedAt = task.transferStartedAt ?? task.startedAt;
      const elapsedMs = Math.max(1, task.endedAt - timingStartedAt);
      task.durationMs = Math.max(task.durationMs ?? 0, options.durationMs ?? 0, elapsedMs);
    } else {
      task.durationMs = options.durationMs ?? task.durationMs;
    }
    task.progress = status === "canceled" ? Math.max(task.progress, 0) : 100;
    task.bytes = options.bytes;
    task.averageBytesPerSecond = options.averageBytesPerSecond ?? (options.bytes !== void 0 && task.durationMs !== void 0 && task.durationMs > 0 ? Math.round(options.bytes / (task.durationMs / 1e3)) : task.averageBytesPerSecond);
    if (options.bytes !== void 0) {
      task.transferredBytes = options.bytes;
      task.totalBytes = options.bytes;
    }
    task.strategy = options.strategy;
    task.error = options.error;
    if (task.transferItems?.length) {
      for (const item of task.transferItems) {
        if (status === "success" && item.status !== "success") {
          item.status = "success";
          item.progress = 100;
          item.transferredBytes = this.getLiveTransferItemTotal(item);
          item.endedAt = task.endedAt;
        } else if (status === "canceled" && (item.status === "waiting" || item.status === "running")) {
          item.status = "canceled";
          item.endedAt = task.endedAt;
        } else if (status === "error" && item.status === "running") {
          item.status = "error";
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
  getTaskStats() {
    const stats = { running: 0, success: 0, error: 0, canceled: 0 };
    for (const task of this.tasks) {
      stats[task.status]++;
    }
    return stats;
  }
  formatTaskLine(task) {
    const status = task.status === "running" ? "\u8FDB\u884C\u4E2D" : task.status === "success" ? "\u5B8C\u6210" : task.status === "canceled" ? "\u5DF2\u53D6\u6D88" : "\u5931\u8D25";
    const metrics = this.getTaskMetrics(task);
    return `${status}\uFF1A${task.label}${metrics ? ` \xB7 ${metrics}` : ""}`;
  }
  getTaskMetrics(task) {
    const timingStartedAt = task.transferStartedAt ?? task.startedAt;
    const elapsedMs = task.durationMs ?? (task.endedAt ?? Date.now()) - timingStartedAt;
    const duration = formatDuration(elapsedMs);
    const parts = [duration];
    if (task.status === "running" && task.totalBytes !== void 0 && task.transferredBytes !== void 0) {
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
    if (task.bytes !== void 0) {
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
    return parts.join(" \xB7 ");
  }
  getTaskIcon(task) {
    if (task.status === "running") {
      return Codicon.loading;
    }
    if (task.status === "error") {
      return Codicon.error;
    }
    if (task.status === "canceled") {
      return Codicon.circleSlash;
    }
    return Codicon.check;
  }
  renderLegacyImageGridOverlay() {
    const state = this.imageGridState;
    const overlay = $(".turbofile-image-grid-overlay");
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        this.closeImageGridPage();
      }
    });
    const panel = $(".turbofile-image-grid-panel");
    if (!state) {
      return overlay;
    }
    const selected = state.images[state.selectedIndex];
    const header = $(".turbofile-image-grid-header");
    const title = $(".turbofile-image-grid-title");
    title.appendChild(renderIcon(Codicon.fileMedia));
    title.append(`\u56FE\u7247\u6D4F\u89C8 \xB7 ${this.getSideLabel(state.side)} \xB7 ${state.images.length} \u5F20`);
    header.appendChild(title);
    const actions = $(".turbofile-image-grid-actions");
    const previous = this.createIconButton(Codicon.chevronLeft, "\u4E0A\u4E00\u5F20", "turbofile-toolbar-button");
    previous.element.addEventListener("click", () => this.moveImageGridPreview(-1));
    actions.appendChild(previous.element);
    const next = this.createIconButton(Codicon.chevronRight, "\u4E0B\u4E00\u5F20", "turbofile-toolbar-button");
    next.element.addEventListener("click", () => this.moveImageGridPreview(1));
    actions.appendChild(next.element);
    const open = this.createButton("\u6253\u5F00", "turbofile-secondary-button");
    open.element.disabled = !selected?.item.path;
    open.element.addEventListener("click", () => {
      if (selected?.item.path) {
        this.closeImageGridPage();
        void this.previewSelected(state.side, selected.item);
      }
    });
    actions.appendChild(open.element);
    const close = this.createIconButton(Codicon.close, "\u5173\u95ED", "turbofile-toolbar-button");
    close.element.addEventListener("click", () => this.closeImageGridPage());
    actions.appendChild(close.element);
    header.appendChild(actions);
    panel.appendChild(header);
    const preview = $(".turbofile-image-grid-preview");
    if (selected?.thumbnailContent) {
      const image = document.createElement("img");
      image.className = "turbofile-image-grid-preview-image";
      image.src = `data:${selected.thumbnailMime};base64,${selected.thumbnailContent}`;
      image.alt = selected.item.name;
      preview.appendChild(image);
    } else {
      const placeholder = $(".turbofile-image-grid-placeholder");
      placeholder.appendChild(renderIcon(Codicon.fileMedia));
      placeholder.append(selected?.thumbnailError ?? (selected?.thumbnailLoading ? "\u6B63\u5728\u52A0\u8F7D\u56FE\u7247..." : "\u51C6\u5907\u52A0\u8F7D\u56FE\u7247"));
      preview.appendChild(placeholder);
    }
    const caption = $(".turbofile-image-grid-caption");
    caption.textContent = selected ? `${state.selectedIndex + 1} / ${state.images.length} \xB7 ${selected.item.name}` : "";
    preview.appendChild(caption);
    panel.appendChild(preview);
    const strip = $(".turbofile-image-grid-strip");
    for (let index = 0; index < state.images.length; index++) {
      const image = state.images[index];
      const card = $("button.turbofile-image-grid-card");
      card.type = "button";
      card.title = image.item.name;
      if (index === state.selectedIndex) {
        card.classList.add("is-selected");
      }
      card.addEventListener("pointerdown", (event) => this.selectImageGridItemWithPointer(index, event));
      card.addEventListener("contextmenu", (event) => this.selectImageGridItemWithContextMenu(index, event));
      if (image.thumbnailContent) {
        const thumb = document.createElement("img");
        thumb.loading = "lazy";
        thumb.src = `data:${image.thumbnailMime};base64,${image.thumbnailContent}`;
        thumb.alt = image.item.name;
        card.appendChild(thumb);
      } else {
        const placeholder = $(".turbofile-image-grid-card-placeholder");
        placeholder.appendChild(renderIcon(Codicon.fileMedia));
        const name = $("span");
        name.textContent = image.thumbnailLoading ? "\u52A0\u8F7D\u4E2D" : image.item.name;
        placeholder.appendChild(name);
        card.appendChild(placeholder);
      }
      strip.appendChild(card);
    }
    panel.appendChild(strip);
    overlay.appendChild(panel);
    return overlay;
  }
  renderImageGridPage() {
    const state = this.imageGridState;
    const page = $(".turbofile-image-page");
    if (!state) {
      return page;
    }
    this.invalidateImageGridBodyWidthCache();
    this.normalizeImageGridStateColumns(state);
    const range = this.getImageGridVirtualRange(state);
    const header = $(".turbofile-image-page-header");
    const headerLeft = $(".turbofile-image-page-header-left");
    const title = $(".turbofile-image-page-title");
    title.appendChild(renderIcon(Codicon.fileMedia));
    title.append("\u56FE\u7247\u7F51\u683C");
    headerLeft.appendChild(title);
    const columns = $(".turbofile-image-page-columns");
    const label = $("span.turbofile-image-page-columns-label");
    label.textContent = "\u5217\u6570";
    columns.appendChild(label);
    for (const option of []) {
      const button = $("button.turbofile-image-page-columns-button");
      button.type = "button";
      button.textContent = String(option);
      if (state.columns === option) {
        button.classList.add("is-active");
      }
      button.addEventListener("click", () => this.setImageGridColumns(option));
      columns.appendChild(button);
    }
    headerLeft.appendChild(columns);
    header.appendChild(headerLeft);
    const actions = $(".turbofile-image-page-actions");
    const deleteButton = $("button.turbofile-image-page-action.is-delete.is-danger");
    const selectedCount = this.getImageGridDeleteTargets(state).length;
    deleteButton.type = "button";
    deleteButton.title = selectedCount ? "\u5220\u9664\u9009\u4E2D\u56FE\u7247" : "\u8BF7\u5148\u9009\u62E9\u8981\u5220\u9664\u7684\u56FE\u7247";
    deleteButton.disabled = selectedCount === 0;
    deleteButton.setAttribute("aria-label", "\u5220\u9664\u9009\u4E2D\u56FE\u7247");
    deleteButton.appendChild(renderIcon(Codicon.trash));
    deleteButton.addEventListener("click", () => {
      void this.deleteSelectedImageGridItems();
    });
    actions.appendChild(deleteButton);
    actions.appendChild(this.renderImageGridSortControl(state));
    actions.appendChild(this.renderImageGridScaleControl(state));
    const closeIcon = $("button.turbofile-image-page-action.is-close");
    closeIcon.type = "button";
    closeIcon.title = "\u5173\u95ED";
    closeIcon.setAttribute("aria-label", "\u5173\u95ED\u56FE\u7247\u7F51\u683C");
    closeIcon.appendChild(renderIcon(Codicon.close));
    closeIcon.addEventListener("click", () => this.closeImageGridPage());
    actions.appendChild(closeIcon);
    const close = this.createButton("\u5173\u95ED", "turbofile-secondary-button");
    close.element.addEventListener("click", () => this.closeImageGridPage());
    actions.appendChild(close.element);
    header.appendChild(actions);
    page.appendChild(header);
    const body = $(".turbofile-image-page-body");
    body.scrollTop = state.scrollTop;
    body.addEventListener("scroll", () => this.handleImageGridScroll(body), { passive: true });
    page.addEventListener("wheel", (event) => this.handleImageGridWheel(event, body), { passive: false, capture: true });
    const grid = $(".turbofile-image-page-grid");
    grid.setAttribute("role", "listbox");
    grid.setAttribute("aria-multiselectable", "true");
    grid.style.setProperty("--turbofile-image-grid-columns", String(this.getImageGridEffectiveColumns(state)));
    grid.style.setProperty("--turbofile-image-grid-scale", String(state.thumbnailScale));
    this.renderImageGridSlice(grid, state, range);
    body.appendChild(grid);
    page.appendChild(body);
    const scrollTop = state.scrollTop;
    getWindow(body).requestAnimationFrame(() => {
      if (!body.isConnected) {
        return;
      }
      this.invalidateImageGridBodyWidthCache();
      if (scrollTop > 0) {
        body.scrollTop = scrollTop;
      }
    });
    return page;
  }
  renderImageGridScaleControl(state) {
    const select = $(".turbofile-image-page-scale");
    const button = $("button.turbofile-image-page-scale-button");
    const menu = $(".turbofile-image-page-scale-menu");
    button.type = "button";
    button.title = "\u56FE\u7247\u653E\u5927\u500D\u7387";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "\u56FE\u7247\u653E\u5927\u500D\u7387");
    button.appendChild(renderIcon(Codicon.zoomIn));
    button.appendChild($("span.turbofile-image-page-scale-label", void 0, this.getImageGridScaleLabel(state.thumbnailScale)));
    button.appendChild(renderIcon(Codicon.chevronDown));
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "\u56FE\u7247\u653E\u5927\u500D\u7387");
    for (const scale of IMAGE_GRID_THUMBNAIL_SCALE_OPTIONS) {
      const isActive = state.thumbnailScale === scale;
      const item = $("button.turbofile-image-page-scale-option");
      item.type = "button";
      item.dataset.scale = String(scale);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive) {
        item.classList.add("is-active");
      }
      const check = $("span.turbofile-image-page-scale-check");
      if (isActive) {
        check.appendChild(renderIcon(Codicon.check));
      }
      item.appendChild(check);
      item.appendChild($("span.turbofile-image-page-scale-option-label", void 0, this.getImageGridScaleLabel(scale)));
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        select.classList.remove("is-open");
        button.setAttribute("aria-expanded", "false");
        this.setImageGridThumbnailScale(scale);
      });
      menu.appendChild(item);
    }
    const closeMenu = () => {
      select.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    };
    const toggleMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = !select.classList.contains("is-open");
      select.classList.toggle("is-open", nextOpen);
      button.setAttribute("aria-expanded", String(nextOpen));
      if (nextOpen) {
        const active = menu.querySelector(".turbofile-image-page-scale-option.is-active") ?? menu.querySelector(".turbofile-image-page-scale-option");
        active?.focus();
      }
    };
    button.addEventListener("click", toggleMenu);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        toggleMenu(event);
      }
    });
    const ownerWindow = getWindow(select);
    const handleWindowClick = (event) => {
      if (!select.contains(event.target)) {
        closeMenu();
      }
    };
    const handleWindowKeydown = (event) => {
      if (event.key === "Escape" && select.classList.contains("is-open")) {
        event.preventDefault();
        closeMenu();
        button.focus();
      }
    };
    ownerWindow.addEventListener("click", handleWindowClick);
    ownerWindow.addEventListener("keydown", handleWindowKeydown);
    this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener("click", handleWindowClick) });
    this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener("keydown", handleWindowKeydown) });
    select.appendChild(button);
    select.appendChild(menu);
    return select;
  }
  renderImageGridSortControl(state) {
    const select = $(".turbofile-image-page-sort");
    const button = $("button.turbofile-image-page-sort-button");
    const menu = $(".turbofile-image-page-sort-menu");
    button.type = "button";
    button.title = "\u6392\u5E8F\u65B9\u5F0F";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "\u6392\u5E8F\u65B9\u5F0F");
    button.appendChild(renderIcon(Codicon.listOrdered));
    button.appendChild($("span.turbofile-image-page-sort-label", void 0, this.getImageGridSortLabel(state)));
    button.appendChild(renderIcon(state.sortDescending ? Codicon.arrowDown : Codicon.arrowUp));
    button.appendChild(renderIcon(Codicon.chevronDown));
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "\u56FE\u7247\u6392\u5E8F\u65B9\u5F0F");
    for (const option of IMAGE_GRID_SORT_OPTIONS) {
      const isActive = state.sortKey === option.key;
      const item = $("button.turbofile-image-page-sort-option");
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive) {
        item.classList.add("is-active");
      }
      const check = $("span.turbofile-image-page-sort-check");
      if (isActive) {
        check.appendChild(renderIcon(Codicon.check));
      }
      item.appendChild(check);
      item.appendChild($("span.turbofile-image-page-sort-option-label", void 0, option.label));
      if (isActive) {
        item.appendChild(renderIcon(state.sortDescending ? Codicon.arrowDown : Codicon.arrowUp));
      }
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        select.classList.remove("is-open");
        button.setAttribute("aria-expanded", "false");
        this.setImageGridSort(option.key);
      });
      menu.appendChild(item);
    }
    const closeMenu = () => {
      select.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    };
    const toggleMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = !select.classList.contains("is-open");
      select.classList.toggle("is-open", nextOpen);
      button.setAttribute("aria-expanded", String(nextOpen));
      if (nextOpen) {
        const active = menu.querySelector(".turbofile-image-page-sort-option.is-active") ?? menu.querySelector(".turbofile-image-page-sort-option");
        active?.focus();
      }
    };
    button.addEventListener("click", toggleMenu);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        toggleMenu(event);
      }
    });
    const ownerWindow = getWindow(select);
    const handleWindowClick = (event) => {
      if (!select.contains(event.target)) {
        closeMenu();
      }
    };
    const handleWindowKeydown = (event) => {
      if (event.key === "Escape" && select.classList.contains("is-open")) {
        event.preventDefault();
        closeMenu();
        button.focus();
      }
    };
    ownerWindow.addEventListener("click", handleWindowClick);
    ownerWindow.addEventListener("keydown", handleWindowKeydown);
    this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener("click", handleWindowClick) });
    this.renderDisposables.add({ dispose: () => ownerWindow.removeEventListener("keydown", handleWindowKeydown) });
    select.appendChild(button);
    select.appendChild(menu);
    return select;
  }
  renderImageGridSlice(grid, state, range) {
    clearNode(grid);
    grid.style.setProperty("--turbofile-image-grid-columns", String(this.getImageGridEffectiveColumns(state)));
    grid.style.setProperty("--turbofile-image-grid-scale", String(state.thumbnailScale));
    this.releaseImageGridImagesOutsideRange(state, range);
    if (range.topSpacerHeight > 0) {
      const topSpacer = $(".turbofile-image-page-spacer");
      topSpacer.style.height = `${range.topSpacerHeight}px`;
      grid.appendChild(topSpacer);
    }
    for (let index = range.startIndex; index < range.endIndex; index++) {
      grid.appendChild(this.renderImageGridCard(state, state.images[index], index));
    }
    if (range.bottomSpacerHeight > 0) {
      const bottomSpacer = $(".turbofile-image-page-spacer");
      bottomSpacer.style.height = `${range.bottomSpacerHeight}px`;
      grid.appendChild(bottomSpacer);
    }
    this.imageGridRenderedRange = {
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      columns: this.getImageGridEffectiveColumns(state),
      total: state.images.length
    };
    const indexes = [];
    for (let index = range.startIndex; index < range.endIndex; index++) {
      indexes.push(index);
    }
    this.queueImageGridThumbnailLoads(state, indexes, true);
  }
  renderImageGridCard(state, image, index) {
    const card = $("div.turbofile-image-page-card");
    const cardSize = this.getImageGridCardSize(state, image);
    card.tabIndex = 0;
    card.setAttribute("role", "option");
    card.title = image.item.name;
    card.dataset.imageIndex = String(index);
    const isSelected = state.selectedIndexes.has(index);
    if (isSelected) {
      card.classList.add("is-selected");
    }
    if (state.selectedIndex === index) {
      card.classList.add("is-focused");
    }
    card.setAttribute("aria-selected", isSelected ? "true" : "false");
    const preview = $(".turbofile-image-page-card-preview");
    this.applyImageGridCardPreviewSize(preview, cardSize);
    const thumbnailSrc = image.thumbnailUrl || (image.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : "");
    if (thumbnailSrc) {
      const thumb = document.createElement("img");
      thumb.loading = "eager";
      thumb.decoding = "async";
      this.applyImageGridCardImageSize(thumb, cardSize);
      thumb.addEventListener("error", () => this.handleImageGridThumbnailError(state, index));
      thumb.src = thumbnailSrc;
      thumb.alt = image.item.name;
      preview.appendChild(thumb);
    } else {
      const placeholder = $(".turbofile-image-page-card-placeholder");
      placeholder.appendChild(renderIcon(Codicon.fileMedia));
      preview.appendChild(placeholder);
    }
    this.appendImageGridCardChrome(preview, image, index);
    card.appendChild(preview);
    const name = $(".turbofile-image-page-card-name");
    name.textContent = image.item.name;
    name.addEventListener("dblclick", (event) => event.stopPropagation());
    card.appendChild(name);
    card.addEventListener("pointerdown", (event) => this.selectImageGridItemWithPointer(index, event));
    card.addEventListener("contextmenu", (event) => this.selectImageGridItemWithContextMenu(index, event));
    card.addEventListener("dblclick", (event) => {
      event.preventDefault();
      this.openImageGridPreview(index);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.openImageGridPreview(index);
      } else if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        this.selectImageGridItem(index, event);
      }
    });
    return card;
  }
  getImageGridCardSize(state, image) {
    return getTurboFileImageGridCardSize({ width: image.width, height: image.height }, state.thumbnailScale, this.getImageGridBaseCardWidth(state), this.getImageGridBasePreviewHeight(state), IMAGE_GRID_CARD_VERTICAL_CHROME, IMAGE_GRID_CARD_INLINE_CHROME);
  }
  applyImageGridCardPreviewSize(preview, size) {
    preview.style.width = `${Math.max(1, size.cardWidth - IMAGE_GRID_CARD_INLINE_CHROME)}px`;
    preview.style.height = `${Math.max(1, size.rowHeight - IMAGE_GRID_CARD_VERTICAL_CHROME)}px`;
  }
  applyImageGridCardImageSize(image, size) {
    image.style.width = `${size.imageWidth}px`;
    image.style.height = `${size.imageHeight}px`;
  }
  appendImageGridCardChrome(preview, image, index) {
    const info = $(".turbofile-image-page-card-info");
    const indexLabel = $("span.turbofile-image-page-card-index");
    indexLabel.textContent = String(index + 1);
    info.appendChild(indexLabel);
    const dimensions = $("span.turbofile-image-page-card-dimensions");
    const dimensionsLabel = this.getImageGridCardDimensionsLabel(image);
    dimensions.textContent = dimensionsLabel;
    if (!dimensionsLabel) {
      dimensions.classList.add("is-empty");
    }
    info.appendChild(dimensions);
    preview.appendChild(info);
  }
  getImageGridCardDimensionsLabel(image) {
    return image.width && image.height ? `${image.width}\xD7${image.height}` : "";
  }
  renderImagePreviewOverlay() {
    const state = this.imageGridState;
    const overlay = $(".turbofile-image-preview-overlay");
    if (!state?.previewVisible) {
      return overlay;
    }
    overlay.tabIndex = -1;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Image preview");
    overlay.addEventListener("wheel", (event) => this.handleImagePreviewWheel(event));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        this.closeImageGridPreview();
      }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeImageGridPreview();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.moveImageGridPreview(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        this.moveImageGridPreview(1);
      }
    });
    const dismiss = $("button.turbofile-image-preview-dismiss");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "\u5173\u95ED\u9884\u89C8");
    dismiss.addEventListener("click", () => this.closeImageGridPreview());
    overlay.appendChild(dismiss);
    const stage = $(".turbofile-image-preview-stage");
    this.renderImagePreviewStageContent(stage, state);
    overlay.appendChild(stage);
    const toolbar = $(".turbofile-image-preview-toolbar");
    const pixelInspector = this.renderImagePreviewTopAction(Codicon.symbolColor, "RGB \u50CF\u7D20\u68C0\u67E5", () => this.toggleImagePreviewPixelInspector(), state.pixelInspectorVisible);
    pixelInspector.dataset.turbofilePreviewToggle = "pixel-inspector";
    toolbar.appendChild(pixelInspector);
    const losslessSampling = this.renderImagePreviewTopAction(Codicon.symbolRuler, "\u65E0\u635F\u50CF\u7D20\u7F29\u653E", () => this.toggleImagePreviewSamplingMode(), state.previewSamplingMode === "lossless");
    losslessSampling.dataset.turbofilePreviewToggle = "lossless-sampling";
    toolbar.appendChild(losslessSampling);
    const histogram = this.renderImagePreviewTopAction(Codicon.graphLine, "\u76F4\u65B9\u56FE", () => this.toggleImagePreviewHistogram(), state.histogramVisible);
    histogram.dataset.turbofilePreviewToggle = "histogram";
    toolbar.appendChild(histogram);
    toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.download, "\u4E0B\u8F7D\u56FE\u7247", () => {
      void this.downloadImageGridPreview();
    }));
    toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.trash, "\u5220\u9664\u56FE\u7247", () => {
      void this.deleteImageGridPreview();
    }));
    toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.close, "\u5173\u95ED", () => this.closeImageGridPreview()));
    overlay.appendChild(toolbar);
    if (state.histogramVisible) {
      overlay.appendChild(this.renderImagePreviewHistogramPanel(state));
    }
    overlay.appendChild(this.renderImagePreviewSideButton(state, -1));
    overlay.appendChild(this.renderImagePreviewSideButton(state, 1));
    const footer = $(".turbofile-image-preview-footer");
    footer.appendChild(this.renderImagePreviewZoomControls(state));
    footer.appendChild(this.renderImagePreviewInfoStrip(state));
    overlay.appendChild(footer);
    const navigation = $(".turbofile-image-preview-navigation");
    const previous = $("button.turbofile-image-preview-nav-button");
    previous.type = "button";
    previous.appendChild(renderIcon(Codicon.chevronLeft));
    previous.addEventListener("click", () => this.moveImageGridPreview(-1));
    navigation.appendChild(previous);
    const next = $("button.turbofile-image-preview-nav-button");
    next.type = "button";
    next.appendChild(renderIcon(Codicon.chevronRight));
    next.addEventListener("click", () => this.moveImageGridPreview(1));
    navigation.appendChild(next);
    overlay.appendChild(navigation);
    getWindow(overlay).requestAnimationFrame(() => {
      if (overlay.isConnected) {
        overlay.focus({ preventScroll: true });
      }
    });
    return overlay;
  }
  renderImagePreviewTopAction(icon, label, handler, active = false) {
    const button = $("button.turbofile-image-preview-action");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    if (active) {
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    }
    button.appendChild(renderIcon(icon));
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handler();
    });
    return button;
  }
  renderImagePreviewZoomControls(state) {
    const controls = $(".turbofile-image-preview-zoom-controls");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Zoom controls");
    const zoomOut = this.renderImagePreviewTopAction(Codicon.zoomOut, "\u7F29\u5C0F", () => this.zoomImagePreviewByOculanteStep(-IMAGE_PREVIEW_BUTTON_ZOOM_DELTA));
    zoomOut.classList.add("is-transient");
    zoomOut.disabled = state.previewZoom <= IMAGE_PREVIEW_ZOOM_MIN;
    controls.appendChild(zoomOut);
    const value = $("button.turbofile-image-preview-zoom-value");
    value.type = "button";
    value.disabled = true;
    value.textContent = this.getImagePreviewZoomLabel(state);
    controls.appendChild(value);
    const zoomIn = this.renderImagePreviewTopAction(Codicon.zoomIn, "\u653E\u5927", () => this.zoomImagePreviewByOculanteStep(IMAGE_PREVIEW_BUTTON_ZOOM_DELTA));
    zoomIn.classList.add("is-transient");
    zoomIn.disabled = state.previewZoom >= IMAGE_PREVIEW_ZOOM_MAX;
    controls.appendChild(zoomIn);
    const reset = this.renderImagePreviewTopAction(Codicon.screenNormal, "\u9002\u5E94\u7A97\u53E3", () => this.resetImagePreviewView());
    reset.classList.add("is-reset");
    reset.disabled = state.previewFitPending;
    controls.appendChild(reset);
    return controls;
  }
  renderImagePreviewInfoStrip(state) {
    const info = $(".turbofile-image-preview-caption.turbofile-image-preview-info-strip");
    this.renderImagePreviewInfoStripContent(info, state);
    return info;
  }
  renderImagePreviewHistogramPanel(state) {
    const panel = $(".turbofile-image-preview-histogram");
    panel.style.left = `${state.histogramX}px`;
    panel.style.top = `${state.histogramY}px`;
    const header = $(".turbofile-image-preview-histogram-header");
    header.append("Histogram");
    const close = $("button.turbofile-image-preview-histogram-close");
    close.type = "button";
    close.title = "\u5173\u95ED\u76F4\u65B9\u56FE";
    close.setAttribute("aria-label", "\u5173\u95ED\u76F4\u65B9\u56FE");
    close.appendChild(renderIcon(Codicon.close));
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleImagePreviewHistogram();
    });
    header.appendChild(close);
    this.attachImagePreviewHistogramDrag(panel, state);
    panel.appendChild(header);
    const canvas = document.createElement("canvas");
    canvas.className = "turbofile-image-preview-histogram-canvas";
    canvas.width = 260;
    canvas.height = 130;
    panel.appendChild(canvas);
    const selected = state.images[state.selectedIndex];
    const src = this.getImagePreviewSource(selected);
    const analysis = selected && src ? this.prepareImagePreviewAnalysis(selected, src) : void 0;
    this.drawImagePreviewHistogram(canvas, analysis);
    return panel;
  }
  renderImagePreviewInfoStripContent(info, state) {
    clearNode(info);
    info.setAttribute("aria-label", this.getImagePreviewCaption(state));
    const image = state.images[state.selectedIndex];
    if (!image) {
      return;
    }
    const index = $("span.turbofile-image-preview-info-index");
    index.textContent = `${state.selectedIndex + 1} / ${state.images.length}`;
    info.appendChild(index);
    const name = $("span.turbofile-image-preview-info-name");
    name.textContent = image.item.name;
    info.appendChild(name);
    const dimensions = $("span.turbofile-image-preview-info-dimensions");
    dimensions.textContent = image.width && image.height ? `${image.width} \xD7 ${image.height}` : image.previewLoading ? "Loading original" : "Original image";
    info.appendChild(dimensions);
  }
  renderImagePreviewSideButton(state, delta) {
    const button = $("button.turbofile-image-preview-side");
    button.type = "button";
    button.classList.add(delta < 0 ? "is-left" : "is-right");
    const targetIndex = state.selectedIndex + delta;
    const image = state.images[targetIndex];
    button.disabled = !image;
    if (image) {
      const src = this.getImagePreviewThumbnailSource(image);
      if (src) {
        const thumb = document.createElement("img");
        thumb.src = src;
        thumb.alt = image.item.name;
        button.appendChild(thumb);
      }
    }
    const icon = $("span.turbofile-image-preview-side-icon");
    icon.appendChild(renderIcon(delta < 0 ? Codicon.chevronLeft : Codicon.chevronRight));
    button.appendChild(icon);
    button.addEventListener("click", () => this.moveImageGridPreview(delta));
    return button;
  }
  renderImagePreviewStageContent(stage, state) {
    clearNode(stage);
    const selected = state.images[state.selectedIndex];
    const previewSrc = this.getImagePreviewSource(selected);
    if (selected && previewSrc && this.isImagePreviewDecoded(selected, previewSrc)) {
      const figure = $(".turbofile-image-preview-figure");
      figure.setAttribute("role", "img");
      figure.setAttribute("aria-label", selected.item.name);
      if (state.pixelInspectorVisible) {
        figure.classList.add("is-pixel-inspector");
      }
      this.appendImagePreviewCanvas(figure, selected, previewSrc, state);
      figure.addEventListener("pointerdown", (event) => this.handleImagePreviewPointerDown(event));
      figure.addEventListener("contextmenu", (event) => this.showPreviewImageContextMenu(event));
      if (state.pixelInspectorVisible) {
        this.attachImagePreviewPixelInspector(stage, figure, selected, previewSrc);
      }
      stage.appendChild(figure);
      this.renderImagePreviewCanvas();
      return;
    }
    const interimSrc = selected && !selected.previewError ? this.getImagePreviewThumbnailSource(selected) : "";
    if (selected && interimSrc) {
      const figure = $(".turbofile-image-preview-figure.is-preview-interim");
      figure.setAttribute("role", "img");
      figure.setAttribute("aria-label", selected.item.name);
      const interim = document.createElement("img");
      interim.className = "turbofile-image-preview-interim";
      interim.src = interimSrc;
      interim.alt = selected.item.name;
      interim.draggable = false;
      figure.appendChild(interim);
      stage.appendChild(figure);
      return;
    }
    const placeholder = $(".turbofile-image-preview-placeholder");
    placeholder.appendChild(renderIcon(Codicon.fileMedia));
    placeholder.append(selected?.previewError ?? (selected?.previewLoading || previewSrc ? "Loading image..." : "Preparing image..."));
    stage.appendChild(placeholder);
  }
  getImagePreviewSource(image) {
    return this.getImagePreviewFullSource(image);
  }
  getImagePreviewFullSource(image) {
    return image?.previewUrl || (image?.previewContent ? `data:${image.previewMime};base64,${image.previewContent}` : "");
  }
  getImagePreviewThumbnailSource(image) {
    return image?.thumbnailUrl || (image?.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : "") || this.getImagePreviewFullSource(image);
  }
  getImagePreviewKey(image, src) {
    return `${image.item.path ?? image.item.name}|${src}`;
  }
  isImagePreviewDecoded(image, src) {
    return !!image.previewImage && image.previewImageKey === this.getImagePreviewKey(image, src);
  }
  appendImagePreviewCanvas(figure, image, src, state) {
    const ownerDocument = figure.ownerDocument;
    const canvas = ownerDocument.createElement("canvas");
    canvas.className = "turbofile-image-preview-canvas";
    canvas.setAttribute("aria-label", image.item.name);
    figure.appendChild(canvas);
    this.prepareImagePreviewRender(image, src, canvas, state);
  }
  prepareImagePreviewRender(image, src, canvas, state) {
    const context = canvas.getContext("2d");
    if (!context) {
      return void 0;
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
    const decodedImage = image.previewImageKey === key ? image.previewImage : void 0;
    state.previewFitPending = true;
    const render = {
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
    loader.decoding = "async";
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
  async ensureImagePreviewElementLoaded(state, index) {
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
      loader.decoding = "async";
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
        image.previewImageLoading = void 0;
        image.previewImageLoadingKey = void 0;
      }
    }
  }
  loadImagePreviewElement(loader, src) {
    return new Promise((resolve, reject) => {
      let retries = 0;
      loader.onload = async () => {
        try {
          await loader.decode?.();
        } catch {
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
        reject(new Error("Failed to load image"));
      };
      loader.src = src;
    });
  }
  observeImagePreviewCanvas(canvas) {
    this.imagePreviewResizeObserver?.disconnect();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    this.imagePreviewResizeObserver = new ResizeObserver(() => this.renderImagePreviewCanvas());
    this.imagePreviewResizeObserver.observe(canvas);
  }
  queueImagePreviewCanvasRender() {
    const canvas = this.imagePreviewRender?.canvas;
    const ownerWindow = canvas ? getWindow(canvas) : getWindow(this.container ?? document.body);
    ownerWindow.requestAnimationFrame(() => this.renderImagePreviewCanvas());
  }
  renderImagePreviewCanvas() {
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
    const shouldSmooth = state.previewSamplingMode === "smooth" || state.previewZoom < 1;
    render.context.imageSmoothingEnabled = shouldSmooth;
    render.context.imageSmoothingQuality = shouldSmooth ? "high" : "low";
    const drawX = Math.trunc(state.previewPanX);
    const drawY = Math.trunc(state.previewPanY);
    const drawWidth = render.width * state.previewZoom;
    const drawHeight = render.height * state.previewZoom;
    render.context.drawImage(render.image, drawX, drawY, drawWidth, drawHeight);
    this.updateImagePreviewZoomValue(state);
  }
  resetImagePreviewViewToFit(state, render, viewportWidth, viewportHeight) {
    const fitScale = Math.min(viewportWidth / render.width, viewportHeight / render.height);
    const scale = Math.min(Math.max(IMAGE_PREVIEW_ZOOM_MIN, fitScale), 1);
    state.previewZoom = scale;
    state.previewPanX = (viewportWidth - render.width * scale) / 2;
    state.previewPanY = (viewportHeight - render.height * scale) / 2;
    state.previewFitPending = false;
  }
  limitImagePreviewOffset(state, render, viewportWidth, viewportHeight) {
    const rect = render.canvas.getBoundingClientRect();
    const width = Math.max(1, viewportWidth ?? rect.width);
    const height = Math.max(1, viewportHeight ?? rect.height);
    const scaledWidth = render.width * state.previewZoom;
    const scaledHeight = render.height * state.previewZoom;
    state.previewPanX = scaledWidth <= width ? (width - scaledWidth) / 2 : Math.min(0, Math.max(width - scaledWidth, state.previewPanX));
    state.previewPanY = scaledHeight <= height ? (height - scaledHeight) / 2 : Math.min(0, Math.max(height - scaledHeight, state.previewPanY));
  }
  handleImagePreviewWheel(event) {
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
  handleImagePreviewPointerDown(event) {
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
    const figure = event.currentTarget;
    figure.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const initialPanX = state.previewPanX;
    const initialPanY = state.previewPanY;
    const move = (moveEvent) => {
      state.previewPanX = initialPanX + moveEvent.clientX - startX;
      state.previewPanY = initialPanY + moveEvent.clientY - startY;
      state.previewFitPending = false;
      this.limitImagePreviewOffset(state, render);
      this.renderImagePreviewCanvas();
    };
    const end = (endEvent) => {
      figure.removeEventListener("pointermove", move);
      figure.removeEventListener("pointerup", end);
      figure.removeEventListener("pointercancel", end);
      if (figure.hasPointerCapture(endEvent.pointerId)) {
        figure.releasePointerCapture(endEvent.pointerId);
      }
    };
    figure.addEventListener("pointermove", move);
    figure.addEventListener("pointerup", end);
    figure.addEventListener("pointercancel", end);
  }
  attachImagePreviewPixelInspector(stage, figure, image, src) {
    if (figure.dataset.turbofilePixelInspectorAttached === "true") {
      return;
    }
    const tooltip = $(".turbofile-image-preview-pixel-tooltip");
    tooltip.textContent = "Loading RGB...";
    stage.appendChild(tooltip);
    figure.dataset.turbofilePixelInspectorAttached = "true";
    this.prepareImagePreviewAnalysis(image, src);
    figure.addEventListener("mousemove", (event) => {
      if (figure.dataset.turbofilePixelInspectorAttached !== "true") {
        tooltip.classList.remove("is-visible");
        return;
      }
      this.updateImagePreviewPixelTooltip(event, stage, tooltip, image, src);
    });
    figure.addEventListener("mouseleave", () => {
      tooltip.classList.remove("is-visible");
    });
  }
  updateImagePreviewPixelTooltip(event, stage, tooltip, image, src) {
    const figure = event.currentTarget;
    if (!this.imageGridState?.pixelInspectorVisible || figure?.dataset.turbofilePixelInspectorAttached !== "true" || !figure.classList.contains("is-pixel-inspector")) {
      tooltip.classList.remove("is-visible");
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
    tooltip.classList.add("is-visible");
    if (!analysis.ready) {
      tooltip.textContent = `X: ${x}, Y: ${y}
Loading RGB...`;
      return;
    }
    const pixel = analysis.context.getImageData(x, y, 1, 1).data;
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];
    tooltip.textContent = `X: ${x}, Y: ${y}
RGB (${r}, ${g}, ${b})
HSV (${this.toHsvColor(r, g, b)})`;
  }
  toHsvColor(r, g, b) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let hue = 0;
    if (delta !== 0) {
      if (max === red) {
        hue = (green - blue) / delta % 6;
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
    const saturation = max === 0 ? 0 : delta / max * 100;
    const value = max * 100;
    return `${Math.round(hue)}\xB0, ${Math.round(saturation)}%, ${Math.round(value)}%`;
  }
  prepareImagePreviewAnalysis(image, src) {
    const ownerDocument = this.container?.ownerDocument ?? document;
    const key = this.getImagePreviewKey(image, src);
    if (this.imagePreviewAnalysis?.key === key) {
      return this.imagePreviewAnalysis;
    }
    const canvas = ownerDocument.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return void 0;
    }
    const analysis = {
      key,
      canvas,
      context,
      width: Math.max(1, image.width ?? 1),
      height: Math.max(1, image.height ?? 1),
      ready: false
    };
    this.imagePreviewAnalysis = analysis;
    const loader = new Image();
    loader.decoding = "async";
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
  drawImagePreviewHistogram(canvas, analysis) {
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#808080";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    for (let x = 0; x <= 5; x++) {
      const lineX = Math.round(x / 5 * width) + 0.5;
      context.beginPath();
      context.moveTo(lineX, 0);
      context.lineTo(lineX, height);
      context.stroke();
    }
    if (!analysis?.ready) {
      context.fillStyle = "#ffffff";
      context.font = "12px Archivo, Segoe UI, sans-serif";
      context.fillText("Loading histogram...", 12, 24);
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
    this.drawImagePreviewHistogramChannel(context, red, max, width, height, "rgba(255, 0, 32, 0.86)");
    this.drawImagePreviewHistogramChannel(context, green, max, width, height, "rgba(0, 235, 74, 0.76)");
    this.drawImagePreviewHistogramChannel(context, blue, max, width, height, "rgba(0, 46, 255, 0.82)");
  }
  drawImagePreviewHistogramChannel(context, bins, max, width, height, color) {
    context.beginPath();
    context.moveTo(0, height);
    for (let index = 0; index < bins.length; index++) {
      const x = index / (bins.length - 1) * width;
      const y = height - bins[index] / max * (height - 6);
      context.lineTo(x, y);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }
  updateImagePreviewHistogramCanvas() {
    const canvas = this.container?.querySelector(".turbofile-image-preview-histogram-canvas");
    if (canvas) {
      const state = this.imageGridState;
      const selected = state?.images[state.selectedIndex];
      const src = this.getImagePreviewSource(selected);
      const analysis = selected && src ? this.prepareImagePreviewAnalysis(selected, src) : void 0;
      this.drawImagePreviewHistogram(canvas, analysis);
    }
  }
  attachImagePreviewHistogramDrag(panel, state) {
    panel.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      event.preventDefault();
      const ownerWindow = getWindow(panel);
      const startX = event.clientX;
      const startY = event.clientY;
      const initialX = state.histogramX;
      const initialY = state.histogramY;
      panel.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        state.histogramX = Math.max(8, initialX + moveEvent.clientX - startX);
        state.histogramY = Math.max(8, initialY + moveEvent.clientY - startY);
        panel.style.left = `${state.histogramX}px`;
        panel.style.top = `${state.histogramY}px`;
      };
      const up = (upEvent) => {
        ownerWindow.removeEventListener("pointermove", move);
        ownerWindow.removeEventListener("pointerup", up);
        ownerWindow.removeEventListener("pointercancel", up);
        if (panel.hasPointerCapture(upEvent.pointerId)) {
          panel.releasePointerCapture(upEvent.pointerId);
        }
      };
      ownerWindow.addEventListener("pointermove", move);
      ownerWindow.addEventListener("pointerup", up);
      ownerWindow.addEventListener("pointercancel", up);
    });
  }
  updateImagePreviewOverlay() {
    const state = this.imageGridState;
    if (!state?.previewVisible || !this.container) {
      return;
    }
    const stage = this.container.querySelector(".turbofile-image-preview-stage");
    if (stage) {
      this.renderImagePreviewStageContent(stage, state);
    }
    const caption = this.container.querySelector(".turbofile-image-preview-caption");
    if (caption) {
      this.renderImagePreviewInfoStripContent(caption, state);
    }
    const zoomValue = this.container.querySelector(".turbofile-image-preview-zoom-value");
    if (zoomValue) {
      zoomValue.textContent = this.getImagePreviewZoomLabel(state);
    }
    if (state.histogramVisible) {
      this.updateImagePreviewHistogramCanvas();
    }
    this.updateImagePreviewSideButtons(state);
  }
  updateImagePreviewSideButtons(state) {
    const overlay = this.container?.querySelector(".turbofile-image-preview-overlay");
    if (!overlay || this.imageGridState !== state || !state.previewVisible) {
      return;
    }
    for (const button of Array.from(overlay.querySelectorAll(".turbofile-image-preview-side"))) {
      button.remove();
    }
    overlay.appendChild(this.renderImagePreviewSideButton(state, -1));
    overlay.appendChild(this.renderImagePreviewSideButton(state, 1));
  }
  updateImagePreviewToggleButton(toggle, active) {
    const button = this.container?.querySelector(`.turbofile-image-preview-action[data-turbofile-preview-toggle="${toggle}"]`);
    if (!button) {
      return;
    }
    button.classList.toggle("is-active", active);
    if (active) {
      button.setAttribute("aria-pressed", "true");
    } else {
      button.removeAttribute("aria-pressed");
    }
  }
  updateImagePreviewPixelInspectorInPlace(state) {
    const stage = this.container?.querySelector(".turbofile-image-preview-stage");
    const figure = stage?.querySelector(".turbofile-image-preview-figure");
    if (!stage || !figure) {
      return;
    }
    figure.classList.toggle("is-pixel-inspector", state.pixelInspectorVisible);
    const tooltip = stage.querySelector(".turbofile-image-preview-pixel-tooltip");
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
  updateImagePreviewHistogramInPlace(state) {
    const overlay = this.container?.querySelector(".turbofile-image-preview-overlay");
    const panel = overlay?.querySelector(".turbofile-image-preview-histogram");
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
  renderSyncPreviewOverlay() {
    const state = this.syncPreviewState;
    const overlay = $(".turbofile-sync-overlay");
    const panel = $(".turbofile-sync-panel");
    if (!state) {
      return overlay;
    }
    const totalPlan = state.plan.map((_, index) => this.getSyncPreviewStep(state, index));
    const selectedPlan = this.getSelectedSyncPlan(state);
    const totalStats = this.getSyncPlanStats(totalPlan);
    const selectedStats = this.getSyncPlanStats(selectedPlan);
    const header = $(".turbofile-sync-header");
    const title = $(".turbofile-sync-title");
    title.appendChild(renderIcon(Codicon.sync));
    title.append("\u540C\u6B65\u9884\u89C8");
    header.appendChild(title);
    const headerActions = $(".turbofile-sync-header-actions");
    const close = this.createIconButton(Codicon.close, "\u53D6\u6D88\u540C\u6B65", "turbofile-toolbar-button");
    close.element.addEventListener("click", () => this.resolveSyncPreview(void 0));
    headerActions.appendChild(close.element);
    header.appendChild(headerActions);
    panel.appendChild(header);
    const summary = $(".turbofile-sync-summary");
    const mode = state.plan.some((step) => step.recursive) ? "\u9009\u4E2D\u76EE\u5F55\u9012\u5F52\u5DEE\u5F02\u540C\u6B65" : "\u5F53\u524D\u5217\u8868\u8F7B\u91CF\u540C\u6B65";
    summary.appendChild(this.renderSyncSummaryMetric("\u6A21\u5F0F", mode));
    summary.appendChild(this.renderSyncSummaryMetric("\u5DF2\u9009\u62E9", `${selectedPlan.length} / ${state.plan.length} \u9879`));
    summary.appendChild(this.renderSyncSummaryMetric("\u5927\u5C0F", formatSize(selectedStats.bytes)));
    summary.appendChild(this.renderSyncSummaryMetric("\u65B0\u589E", `${selectedStats.missing} / ${totalStats.missing}`));
    summary.appendChild(this.renderSyncSummaryMetric("\u8F83\u65B0", `${selectedStats.newer} / ${totalStats.newer}`));
    summary.appendChild(this.renderSyncSummaryMetric("\u5927\u5C0F\u4E0D\u540C", `${selectedStats.size} / ${totalStats.size}`));
    summary.appendChild(this.renderSyncSummaryMetric("\u65B9\u5411", `${selectedStats.leftToRight} \u5DE6->\u53F3 / ${selectedStats.rightToLeft} \u53F3->\u5DE6`));
    panel.appendChild(summary);
    const toolbar = $(".turbofile-sync-toolbar");
    const hint = $(".turbofile-sync-hint");
    hint.textContent = "\u51B2\u7A81\u9879\u53EF\u9010\u6761\u5207\u6362\u65B9\u5411\uFF0C\u4E5F\u53EF\u4EE5\u7528\u89C4\u5219\u6309\u94AE\u6279\u91CF\u51B3\u5B9A\u65B9\u5411\u3002";
    toolbar.appendChild(hint);
    const directionActions = $(".turbofile-sync-direction-actions");
    const hasReversibleItems = state.plan.some((step) => !!step.reverse);
    const autoDirection = this.createButton("\u81EA\u52A8\u65B9\u5411", "turbofile-secondary-button");
    autoDirection.element.disabled = !hasReversibleItems || state.reversedIndexes.size === 0;
    autoDirection.element.addEventListener("click", () => this.setSyncConflictDirection(state, "auto"));
    directionActions.appendChild(autoDirection.element);
    const leftToRight = this.createButton("\u51B2\u7A81\u5DE6->\u53F3", "turbofile-secondary-button");
    leftToRight.element.disabled = !hasReversibleItems;
    leftToRight.element.addEventListener("click", () => this.setSyncConflictDirection(state, "left-to-right"));
    directionActions.appendChild(leftToRight.element);
    const rightToLeft = this.createButton("\u51B2\u7A81\u53F3->\u5DE6", "turbofile-secondary-button");
    rightToLeft.element.disabled = !hasReversibleItems;
    rightToLeft.element.addEventListener("click", () => this.setSyncConflictDirection(state, "right-to-left"));
    directionActions.appendChild(rightToLeft.element);
    toolbar.appendChild(directionActions);
    const selectAll = this.createButton("\u5168\u9009", "turbofile-secondary-button");
    selectAll.element.addEventListener("click", () => {
      state.selectedIndexes.clear();
      for (let index = 0; index < state.plan.length; index++) {
        state.selectedIndexes.add(index);
      }
      this.render();
    });
    toolbar.appendChild(selectAll.element);
    const clearAll = this.createButton("\u6E05\u7A7A", "turbofile-secondary-button");
    clearAll.element.addEventListener("click", () => {
      state.selectedIndexes.clear();
      this.render();
    });
    toolbar.appendChild(clearAll.element);
    const start = this.createButton(`\u5F00\u59CB\u540C\u6B65 ${selectedPlan.length} \u9879`, "turbofile-primary-button");
    start.element.disabled = selectedPlan.length === 0;
    start.element.addEventListener("click", () => this.resolveSyncPreview(selectedPlan));
    toolbar.appendChild(start.element);
    panel.appendChild(toolbar);
    const list = $(".turbofile-sync-list");
    for (const [index] of state.plan.entries()) {
      list.appendChild(this.renderSyncPreviewRow(state, this.getSyncPreviewStep(state, index), index));
    }
    panel.appendChild(list);
    overlay.appendChild(panel);
    return overlay;
  }
  renderSyncSummaryMetric(label, value) {
    const metric = $(".turbofile-sync-summary-metric");
    const labelElement = $("span");
    labelElement.textContent = label;
    const valueElement = $("strong");
    valueElement.textContent = value;
    metric.appendChild(labelElement);
    metric.appendChild(valueElement);
    return metric;
  }
  renderSyncPreviewRow(state, step, index) {
    const originalStep = state.plan[index];
    const row = $(".turbofile-sync-row");
    const checked = state.selectedIndexes.has(index);
    if (!checked) {
      row.classList.add("is-skipped");
    }
    if (state.reversedIndexes.has(index)) {
      row.classList.add("is-reversed");
    }
    const setChecked = (value) => {
      if (value) {
        state.selectedIndexes.add(index);
      } else {
        state.selectedIndexes.delete(index);
      }
      this.render();
    };
    row.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLElement && target.closest("button")) {
        return;
      }
      setChecked(!state.selectedIndexes.has(index));
    });
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.className = "turbofile-sync-checkbox";
    checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      setChecked(checkbox.checked);
    });
    row.appendChild(checkbox);
    const direction = document.createElement("button");
    direction.type = "button";
    direction.className = "turbofile-sync-direction";
    direction.disabled = !originalStep.reverse;
    direction.title = originalStep.reverse ? "\u5207\u6362\u540C\u6B65\u65B9\u5411" : "\u7F3A\u5931\u9879\u65E0\u6CD5\u5207\u6362\u65B9\u5411";
    if (state.reversedIndexes.has(index)) {
      direction.classList.add("is-reversed");
    }
    if (originalStep.reverse) {
      direction.appendChild(renderIcon(Codicon.arrowSwap));
    }
    direction.append(this.getSyncDirectionLabel(step));
    direction.addEventListener("click", (event) => {
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
    const reason = $(".turbofile-sync-reason");
    reason.textContent = this.getSyncReasonLabel(step.reason);
    reason.classList.add(`is-${step.reason}`);
    row.appendChild(reason);
    const path = $(".turbofile-sync-path");
    path.title = step.relativePath;
    path.textContent = step.relativePath;
    row.appendChild(path);
    const meta = $(".turbofile-sync-meta");
    const size = step.item.directory ? "\u76EE\u5F55" : formatSize(step.item.rawSize);
    meta.textContent = `${size} \xB7 ${step.item.modified || "\u672A\u77E5\u65F6\u95F4"}`;
    row.appendChild(meta);
    return row;
  }
  getSelectedSyncPlan(state) {
    const selectedPlan = [];
    for (const [index] of state.plan.entries()) {
      if (state.selectedIndexes.has(index)) {
        selectedPlan.push(this.getSyncPreviewStep(state, index));
      }
    }
    return selectedPlan;
  }
  getSyncPreviewStep(state, index) {
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
  setSyncConflictDirection(state, direction) {
    if (direction === "auto") {
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
  matchesSyncDirection(step, direction) {
    return direction === "left-to-right" ? step.sourceSide === "left" && step.targetSide === "right" : step.sourceSide === "right" && step.targetSide === "left";
  }
  getSyncPlanStats(plan) {
    let missing = 0;
    let newer = 0;
    let size = 0;
    let bytes = 0;
    let leftToRight = 0;
    let rightToLeft = 0;
    for (const step of plan) {
      if (step.reason === "missing") {
        missing++;
      } else if (step.reason === "newer") {
        newer++;
      } else {
        size++;
      }
      bytes += step.item.directory ? 0 : step.item.rawSize;
      if (step.sourceSide === "left" && step.targetSide === "right") {
        leftToRight++;
      } else if (step.sourceSide === "right" && step.targetSide === "left") {
        rightToLeft++;
      }
    }
    return { missing, newer, size, bytes, leftToRight, rightToLeft };
  }
  resolveSyncPreview(plan) {
    const state = this.syncPreviewState;
    this.syncPreviewState = void 0;
    state?.resolve(plan);
    this.render();
  }
  togglePaneMaximized(side) {
    this.maximizedPane = this.maximizedPane === side ? void 0 : side;
    this.fileListRenderedRange.left = void 0;
    this.fileListRenderedRange.right = void 0;
    this.render();
  }
  appendToolbarButton(parent, icon, title, handler, turboIcon, iconColor) {
    const button = document.createElement("button");
    button.className = "turbofile-toolbar-button";
    button.title = title;
    button.appendChild(turboIcon ? renderTurboFileIcon(turboIcon, iconColor) : renderIcon(icon));
    if (handler) {
      button.addEventListener("click", handler);
    }
    parent.appendChild(button);
  }
  createButton(label, className) {
    const element = document.createElement("button");
    element.className = className;
    element.textContent = label;
    return {
      element,
      dispose: () => element.remove()
    };
  }
  createIconButton(icon, title, className) {
    const element = document.createElement("button");
    element.className = className;
    element.title = title;
    element.appendChild(renderIcon(icon));
    return {
      element,
      dispose: () => element.remove()
    };
  }
  renderDialogOverlay() {
    const state = this.dialogState;
    const overlay = $(".turbofile-dialog-overlay");
    if (!state) {
      return overlay;
    }
    const panel = $(".turbofile-dialog-panel");
    if (state.danger) {
      panel.classList.add("is-danger");
    }
    const header = $(".turbofile-dialog-header");
    const icon = $(".turbofile-dialog-icon");
    icon.appendChild(renderIcon(state.danger ? Codicon.trash : state.kind === "prompt" ? Codicon.edit : Codicon.info));
    header.appendChild(icon);
    const copy = $(".turbofile-dialog-copy");
    const title = $("h3");
    title.textContent = state.title;
    const message = $("p");
    message.textContent = state.message;
    copy.appendChild(title);
    copy.appendChild(message);
    if (state.detail) {
      const detail = $("div.turbofile-dialog-detail");
      detail.textContent = state.detail;
      copy.appendChild(detail);
    }
    header.appendChild(copy);
    panel.appendChild(header);
    let input;
    if (state.kind === "prompt") {
      input = $("input.turbofile-dialog-input");
      input.value = state.defaultValue ?? "";
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.resolveDialog(input?.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          this.resolveDialog(void 0);
        }
      });
      panel.appendChild(input);
      getWindow(input).requestAnimationFrame(() => input?.focus());
    }
    const actions = $(".turbofile-dialog-actions");
    if (state.cancelLabel) {
      const cancel = $("button.turbofile-dialog-button.turbofile-dialog-button-secondary");
      cancel.type = "button";
      cancel.textContent = state.cancelLabel;
      cancel.addEventListener("click", () => this.resolveDialog(void 0));
      actions.appendChild(cancel);
    }
    const confirm = $("button.turbofile-dialog-button.turbofile-dialog-button-primary");
    confirm.type = "button";
    confirm.textContent = state.confirmLabel;
    confirm.classList.toggle("is-danger", !!state.danger);
    confirm.addEventListener("click", () => this.resolveDialog(state.kind === "prompt" ? input?.value : true));
    actions.appendChild(confirm);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        this.resolveDialog(void 0);
      }
    });
    return overlay;
  }
  showDialogConfirm(title, message, detail, danger = false) {
    return new Promise((resolve) => {
      this.dialogState = {
        kind: "confirm",
        title,
        message,
        detail,
        danger,
        confirmLabel: danger ? "\u5220\u9664" : "\u786E\u5B9A",
        cancelLabel: "\u53D6\u6D88",
        resolve: (value) => resolve(value === true)
      };
      this.render();
    });
  }
  showDialogPrompt(title, message, defaultValue = "") {
    return new Promise((resolve) => {
      this.dialogState = {
        kind: "prompt",
        title,
        message,
        defaultValue,
        confirmLabel: "\u786E\u5B9A",
        cancelLabel: "\u53D6\u6D88",
        resolve: (value) => resolve(typeof value === "string" ? value : void 0)
      };
      this.render();
    });
  }
  showDialogInfo(title, message, detail) {
    this.dialogState = {
      kind: "info",
      title,
      message,
      detail,
      confirmLabel: "\u77E5\u9053\u4E86",
      resolve: () => void 0
    };
    this.render();
  }
  resolveDialog(value) {
    const state = this.dialogState;
    if (!state) {
      return;
    }
    this.dialogState = void 0;
    state.resolve(value);
    this.render();
  }
  showFileContextMenu(side, item, event) {
    event.preventDefault();
    event.stopPropagation();
    this.setActiveFilePaneSide(side);
    const anchor = new StandardMouseEvent(getWindow(event), event);
    if (item.path) {
      const state = this.paneStates[side];
      if (item.parent || !state.selectedPaths.has(item.path)) {
        this.selectItem(side, item, void 0, false);
        this.statusMessage = item.parent ? "\u5DF2\u9009\u62E9\u4E0A\u7EA7\u76EE\u5F55\u5165\u53E3\u3002" : `\u5DF2\u9009\u62E9 ${item.name}\u3002\u53EF\u53F3\u952E\u65B0\u5EFA\u3001\u91CD\u547D\u540D\u3001\u590D\u5236\u8DEF\u5F84\u3001\u8BA1\u7B97\u5927\u5C0F\u3001\u89E3\u538B\u3001\u538B\u7F29\u6216\u5220\u9664\u3002`;
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
  showPaneContextMenu(side, event) {
    event.preventDefault();
    this.setActiveFilePaneSide(side);
    const anchor = new StandardMouseEvent(getWindow(event), event);
    this.contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      getActions: () => this.getPaneContextActions(side),
      skipTelemetry: true
    });
  }
  showPreviewImageContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const anchor = new StandardMouseEvent(getWindow(event), event);
    this.contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      getActions: () => [
        this.menuAction("turbofile.copyPreviewImage", "\u590D\u5236", Codicon.copy, () => {
          void this.copyPreviewImageToClipboard();
        }, this.canCopyPreviewImage())
      ],
      skipTelemetry: true
    });
  }
  getFileContextActions(side, item) {
    const canOperate = !!item.path && !item.parent;
    const canExtract = canOperate && !item.directory && isArchiveFile(item.name);
    if (item.parent) {
      return this.getPaneContextActions(side);
    }
    return [
      this.menuAction("turbofile.newFolder", "\u65B0\u5EFA\u6587\u4EF6\u5939", Codicon.newFolder, () => this.createFolder(side)),
      this.menuAction("turbofile.newFile", "\u65B0\u5EFA\u6587\u4EF6", Codicon.newFile, () => this.createFile(side)),
      this.menuAction("turbofile.rename", "\u91CD\u547D\u540D", Codicon.edit, () => this.renameSelected(side), canOperate),
      this.menuAction("turbofile.copyPath", "\u590D\u5236\u8DEF\u5F84", Codicon.copy, () => this.copySelectedPath(side), canOperate),
      this.menuAction("turbofile.calculateSize", "\u8BA1\u7B97\u5927\u5C0F", Codicon.symbolNumeric, () => this.calculateSelectedSize(side), canOperate),
      this.menuAction("turbofile.extract", "\u89E3\u538B", Codicon.unarchive, () => this.extractSelected(side), canExtract),
      this.menuAction("turbofile.compress", "\u538B\u7F29", Codicon.archive, () => this.compressSelected(side), canOperate),
      this.menuAction("turbofile.delete", "\u5220\u9664", Codicon.trash, () => this.deleteSelected(side), canOperate)
    ];
  }
  getPaneContextActions(side) {
    return [
      this.menuAction("turbofile.newFolder", "\u65B0\u5EFA\u6587\u4EF6\u5939", Codicon.newFolder, () => this.createFolder(side)),
      this.menuAction("turbofile.newFile", "\u65B0\u5EFA\u6587\u4EF6", Codicon.newFile, () => this.createFile(side))
    ];
  }
  menuAction(id, label, icon, run, enabled = true, checked) {
    return toAction({
      id,
      label,
      enabled,
      checked,
      class: typeof icon === "string" ? icon : ThemeIcon.asClassName(icon),
      run
    });
  }
  getSideLabel(side) {
    return side === "left" ? "\u5DE6\u4FA7" : "\u53F3\u4FA7";
  }
  async testCurrentSshConnection() {
    const target = this.getPaneDevice("right")?.id !== LOCAL_WINDOWS_DEVICE_ID ? this.getPaneDevice("right") : this.devices[0];
    if (!target || target.id === LOCAL_WINDOWS_DEVICE_ID || !this.deviceStore) {
      this.statusMessage = "\u8BF7\u5148\u6DFB\u52A0\u6216\u5207\u6362\u5230\u4E00\u4E2A SSH \u8BBE\u5907\u3002";
      this.render();
      return;
    }
    const task = this.beginTask("ssh-test", `\u6D4B\u8BD5 SSH ${target.name}`, `${target.host}:${target.port || 22}`);
    try {
      const result = await this.sshService.testConnection(await this.getSshConnectionOptions(target));
      if (result.ok) {
        this.finishTask(task, "success", `SSH \u8FDE\u63A5\u6210\u529F\uFF1A${target.name}`);
      } else {
        this.finishTask(task, "error", `SSH \u8FDE\u63A5\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `SSH \u8FDE\u63A5\u5931\u8D25\uFF1A${message}`, { error: message });
    }
  }
  async refreshPane(side, options = {}) {
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
    state.error = void 0;
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
      state.error = void 0;
      this.setDeviceRuntimeStatus(device, "online");
      this.rememberPaneDevicePath(side, device, listing.path);
      this.prefetchNeighborDirectories(device, listing.path, listing.items);
      this.clearPaneSelection(side);
      this.statusMessage = `${device.name} \u5DF2\u52A0\u8F7D ${state.items.filter((item) => !item.parent).length} \u9879\u3002`;
      this.rememberPaneDeviceSnapshot(side);
    } catch (error) {
      if (this.paneRequestSeq[side] === requestId) {
        if (await this.recoverMissingPanePath(side, device, targetPath, error, options)) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        state.error = message;
        this.setDeviceRuntimeStatus(device, "offline");
        this.statusMessage = `${device.name} \u76EE\u5F55\u5237\u65B0\u5931\u8D25\uFF1A${message}`;
      }
    } finally {
      if (this.paneRequestSeq[side] === requestId) {
        state.loading = false;
        this.render();
      }
    }
  }
  async loadPaneDirectory(device, path, force, purpose = "foreground") {
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
    const promise = (async () => {
      const isRemote = device.id !== LOCAL_WINDOWS_DEVICE_ID;
      const listing = isRemote ? await this.sshService.listRemoteDirectoryNames(await this.getSshConnectionOptions(device), path, force) : await this.sshService.listLocalDirectory(path, force);
      this.setDeviceRuntimeStatus(device, "online");
      const items = this.toFileItems(device, listing.path, listing.entries);
      if (isRemote) {
        for (const item of items) {
          if (!item.parent && item.rawModified === 0) {
            item.attrsPending = true;
            item.size = "";
            item.modified = "";
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
  async recoverMissingPanePath(side, device, missingPath, error, options) {
    if (!this.isMissingPanePathError(error)) {
      return false;
    }
    const fallbackPaths = this.getMissingPanePathFallbacks(device, missingPath);
    this.forgetMissingPanePath(device, missingPath);
    if (!fallbackPaths.length) {
      return false;
    }
    const state = this.paneStates[side];
    state.error = void 0;
    state.items = [];
    this.clearPaneSelection(side);
    this.statusMessage = `${device.name} \u9358\u71BA\u6D30\u8930\u66DE\u51E1\u6D93\u5D85\u74E8\u9366\uE7D2\u7D1D\u5BB8\u8336\u569C\u9354\u3125\u6D16\u95AB\u20AC\u9352?${fallbackPaths[0]}`;
    await this.refreshPane(side, { ...options, path: fallbackPaths[0], force: true });
    return true;
  }
  async prefetchDefaultDeviceDirectories() {
    const devices = this.getAllDevices();
    for (const device of devices) {
      await this.prefetchPaneDeviceDefaultDirectory("left", device);
    }
  }
  async prefetchPaneDeviceDefaultDirectory(side, device) {
    const path = this.getRememberedPaneDevicePath(side, device) ?? this.getRememberedPaneDevicePath(side === "left" ? "right" : "left", device) ?? this.getDefaultPaneDevicePath(device);
    if (!path || this.getCachedPaneDirectory(device, path)) {
      return;
    }
    const cacheKey = this.getPaneDirectoryCacheKey(device, path);
    if (this.paneDirectoryInflight.has(cacheKey)) {
      return;
    }
    try {
      await this.loadPaneDirectory(device, path, false, "prefetch");
    } catch {
    }
  }
  getCachedPaneDirectory(device, path) {
    const cacheKey = this.getPaneDirectoryCacheKey(device, path);
    const cached = this.paneDirectoryCache.get(cacheKey);
    if (!cached) {
      return void 0;
    }
    if (cached.expiresAt <= Date.now()) {
      this.paneDirectoryCache.delete(cacheKey);
      return void 0;
    }
    return cached;
  }
  applyPaneDirectoryEntry(side, device, listing) {
    const state = this.paneStates[side];
    state.path = listing.path;
    state.items = listing.items;
    state.error = void 0;
    state.loading = false;
    this.setDeviceRuntimeStatus(device, "online");
    this.clearPaneSelection(side);
    this.rememberPaneDevicePath(side, device, listing.path);
    this.rememberPaneDeviceSnapshot(side);
    this.prefetchNeighborDirectories(device, listing.path, listing.items);
    this.statusMessage = `${device.name} \u5DF2\u52A0\u8F7D ${state.items.filter((item) => !item.parent).length} \u9879\u3002`;
  }
  prefetchPaneDirectory(side, path) {
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
    void this.loadPaneDirectory(device, path, false, "prefetch").catch(() => void 0);
  }
  prefetchNeighborDirectories(device, currentPath, items) {
    const candidates = [
      getPaneParentPath(currentPath, this.isWindowsDevice(device)),
      ...items.filter((item) => item.directory && !item.parent && item.path).slice(0, PANE_DIRECTORY_PREFETCH_LIMIT).map((item) => item.path)
    ].filter((path) => !!path);
    for (const path of candidates) {
      const cacheKey = this.getPaneDirectoryCacheKey(device, path);
      const cached = this.paneDirectoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now() || this.paneDirectoryInflight.has(cacheKey)) {
        continue;
      }
      void this.loadPaneDirectory(device, path, false, "prefetch").catch(() => void 0);
    }
  }
  getPaneDirectoryCacheKey(device, path) {
    return `${device.id}|${device.host}|${device.port || 0}|${device.username}|${device.authType ?? ""}|${path}`;
  }
  invalidatePaneDirectoryCaches(device, paths) {
    const keys = new Set(paths.map((path) => this.getPaneDirectoryCacheKey(device, path)));
    for (const key of keys) {
      this.paneDirectoryCache.delete(key);
      this.paneDirectoryInflight.delete(key);
    }
  }
  getVisiblePaneSidesForDeviceDirectories(device, paths) {
    const windowsPath = this.isWindowsDevice(device);
    return ["left", "right"].filter((side) => {
      const paneDevice = this.getPaneDevice(side);
      if (!paneDevice || !this.isSameDeviceForNativeOperation(device, paneDevice)) {
        return false;
      }
      return paths.some((path) => this.pathsEqualForDevice(this.paneStates[side].path, path, windowsPath));
    });
  }
  isMissingPanePathError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /no such file|no such file or directory|file not found|path not found|enoent/i.test(message);
  }
  getMissingPanePathFallbacks(device, missingPath) {
    const windowsPath = this.isWindowsDevice(device);
    const fallbackPaths = [];
    const addFallback = (path) => {
      if (!path) {
        return;
      }
      const exists = windowsPath ? fallbackPaths.some((candidate) => isSameWindowsPath(candidate, path)) : fallbackPaths.includes(path);
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
      addFallback("/");
    }
    return fallbackPaths;
  }
  forgetMissingPanePath(device, missingPath) {
    for (const side of ["left", "right"]) {
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
  isPanePathMatch(device, left, right) {
    if (!left || !right) {
      return false;
    }
    return this.isWindowsDevice(device) ? isSameWindowsPath(left, right) : left === right;
  }
  clearPaneDirectoryCachesForDevice(deviceId) {
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
  trimPaneDirectoryCache() {
    while (this.paneDirectoryCache.size > PANE_DIRECTORY_CACHE_MAX_ENTRIES) {
      const firstKey = this.paneDirectoryCache.keys().next().value;
      if (!firstKey) {
        return;
      }
      this.paneDirectoryCache.delete(firstKey);
    }
  }
  selectItem(side, item, event, shouldRender = true) {
    if (!item.path) {
      return;
    }
    const state = this.paneStates[side];
    const isToggle = !!event && (event.ctrlKey || event.metaKey);
    const isRange = !!event?.shiftKey && !!state.selectionAnchorPath && !item.parent;
    if (isRange) {
      const anchorIndex = state.items.findIndex((candidate) => candidate.path === state.selectionAnchorPath);
      const itemIndex = state.items.findIndex((candidate) => candidate.path === item.path);
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
        state.selectedPath = void 0;
      }
    } else {
      this.setSingleSelection(side, item);
    }
    const selectedItems = this.getSelectedTransferItems(side);
    if (selectedItems.length > 1) {
      this.statusMessage = `${this.getSideLabel(side)}\u5DF2\u9009\u62E9 ${selectedItems.length} \u9879\u3002\u53EF\u6279\u91CF\u590D\u5236\u3001\u526A\u5207\u6216\u5220\u9664\u3002`;
    } else if (!item.parent) {
      this.statusMessage = `${this.getSideLabel(side)}\u5DF2\u9009\u62E9\uFF1A${item.name}`;
    }
    if (shouldRender) {
      this.render();
    }
  }
  selectAllPaneItems(side) {
    this.setActiveFilePaneSide(side);
    const state = this.paneStates[side];
    const selectablePaths = state.items.filter((item) => !!item.path && !item.parent).map((item) => item.path);
    state.selectedPaths.clear();
    for (const path of selectablePaths) {
      state.selectedPaths.add(path);
    }
    const focusedPath = state.selectedPath && state.selectedPaths.has(state.selectedPath) ? state.selectedPath : selectablePaths[0];
    state.selectedPath = focusedPath;
    state.selectionAnchorPath = focusedPath;
    this.statusMessage = selectablePaths.length ? `${this.getSideLabel(side)}\u5DF2\u5168\u9009 ${selectablePaths.length} \u9879\u3002` : `${this.getSideLabel(side)}\u5F53\u524D\u76EE\u5F55\u6682\u65E0\u53EF\u9009\u9879\u76EE\u3002`;
    this.render();
  }
  isEditableKeyboardTarget(target) {
    const element = target instanceof HTMLElement ? target : void 0;
    if (!element) {
      return false;
    }
    return element.isContentEditable || !!element.closest('input, textarea, select, [contenteditable="true"]');
  }
  updateRenderedSelection(side) {
    const pane = this.container?.querySelector(`.turbofile-pane[data-turbofile-side="${side}"]`);
    if (!pane) {
      return;
    }
    const state = this.paneStates[side];
    for (const row of pane.querySelectorAll(".turbofile-file-row")) {
      const path = row.dataset.turbofilePath;
      row.classList.toggle("is-selected", !!path && state.selectedPaths.has(path));
    }
    const count = pane.querySelector(".turbofile-browser-item-count");
    if (count) {
      this.updatePaneItemCountElement(side, count);
    }
    this.updatePaneSelectionBadge(side, pane);
    const meta = this.container?.querySelector(".turbofile-task-meta");
    if (meta && !this.tasks[0]) {
      meta.textContent = this.statusMessage;
    }
    this.refreshTaskbar();
  }
  updatePaneSelectionBadge(side, pane) {
    const pathbar = pane.querySelector(".turbofile-pathbar");
    if (!pathbar) {
      return;
    }
    const selectedCount = this.getSelectedTransferItems(side).length;
    let selectionCount = pathbar.querySelector(".turbofile-selection-count");
    if (selectedCount <= 1) {
      selectionCount?.remove();
      return;
    }
    if (!selectionCount) {
      selectionCount = $(".turbofile-selection-count");
      pathbar.appendChild(selectionCount);
    }
    selectionCount.textContent = `\u5DF2\u9009 ${selectedCount} \u9879`;
  }
  updatePaneItemCountElement(side, element) {
    const selected = this.getPaneSelectedItemCount(side);
    const total = this.getPaneItemCount(side);
    element.textContent = `${selected} / ${total}`;
    element.title = `\u5DF2\u9009\u62E9 ${selected} / \u5171 ${total} \u9879`;
  }
  getPaneSelectedItemCount(side) {
    return Math.min(this.paneStates[side].selectedPaths.size, this.getPaneItemCount(side));
  }
  getPaneItemCount(side) {
    const items = this.paneStates[side].items;
    return Math.max(0, items.length - (items[0]?.parent ? 1 : 0));
  }
  async openItem(side, item) {
    if (!item.path) {
      return;
    }
    if (item.directory || item.parent) {
      await this.navigatePaneDirectory(side, item.path);
      return;
    }
    await this.previewSelected(side, item);
  }
  createTransferTaskItem(item) {
    const knownSize = item.directory ? 0 : Math.max(0, item.rawSize);
    const displaySize = item.directory && knownSize === 0 ? "" : item.size;
    return {
      name: item.name,
      type: item.type,
      displaySize,
      rawSize: knownSize,
      status: "waiting",
      progress: 0,
      transferredBytes: 0,
      totalBytes: knownSize,
      speedBytesPerSecond: 0,
      speedSamples: []
    };
  }
  async ensureTransferItemSize(device, sourceItem, transferItem, task, options = {}) {
    if (!sourceItem.path || sourceItem.parent) {
      return;
    }
    if (!sourceItem.directory) {
      const size2 = Math.max(0, sourceItem.rawSize);
      transferItem.rawSize = size2;
      transferItem.totalBytes = Math.max(transferItem.totalBytes, size2);
      transferItem.displaySize = formatSize(size2);
      return;
    }
    if (transferItem.rawSize > 0) {
      transferItem.displaySize = formatSize(transferItem.rawSize);
      transferItem.totalBytes = Math.max(transferItem.totalBytes, transferItem.rawSize);
      return;
    }
    if (options.skipDirectorySize) {
      transferItem.displaySize = "";
      transferItem.totalBytes = Math.max(transferItem.totalBytes, 0);
      return;
    }
    this.updateTask(task, `\u6B63\u5728\u8BA1\u7B97\u76EE\u5F55\u5927\u5C0F\uFF1A${sourceItem.name}`, Math.max(10, task.progress));
    const result = await this.sshService.calculatePathSize(await this.toTransferEndpoint(device, sourceItem.path));
    if (!result.ok) {
      transferItem.displaySize = "";
      return;
    }
    const size = Math.max(0, result.size);
    transferItem.rawSize = size;
    transferItem.totalBytes = Math.max(transferItem.totalBytes, size);
    transferItem.displaySize = size > 0 ? formatSize(size) : "";
  }
  setExternalDropTargetSide(side) {
    if (this.externalDropTargetSide === side) {
      return;
    }
    this.externalDropTargetSide = side;
    for (const candidate of ["left", "right"]) {
      this.getPaneFileListElement(candidate)?.classList.toggle("is-external-drop-target", side === candidate);
    }
  }
  getPaneFileListElement(side) {
    return this.container?.querySelector(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`) ?? void 0;
  }
  hasExternalDropData(event) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return false;
    }
    const types = Array.from(dataTransfer.types || []);
    return !!dataTransfer.getData(CodeDataTransfers.FILES) || !!dataTransfer.getData(DataTransfers.RESOURCES) || types.includes(DataTransfers.FILES) || dataTransfer.files.length > 0;
  }
  extractExternalDropPaths(event) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return [];
    }
    const paths = [];
    const seen = /* @__PURE__ */ new Set();
    const acceptPath = (candidate) => {
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
        const codeFiles = JSON.parse(rawCodeFiles);
        for (const codeFile of codeFiles) {
          acceptPath(codeFile);
        }
      } catch {
      }
    }
    const rawResources = dataTransfer.getData(DataTransfers.RESOURCES);
    if (rawResources) {
      try {
        const resources = JSON.parse(rawResources);
        for (const resource of resources) {
          const uri = URI.parse(resource);
          if (uri.scheme === "file") {
            acceptPath(uri.fsPath);
          }
        }
      } catch {
      }
    }
    for (const file of Array.from(dataTransfer.files)) {
      acceptPath(getPathForFile(file));
    }
    return paths;
  }
  async transferExternalPaths(targetSide, sourcePaths, operation = "copy", initiatedAt) {
    this.taskbarHiddenForTerminal = false;
    const targetDevice = this.getPaneDevice(targetSide);
    if (!targetDevice) {
      this.statusMessage = "\u5F53\u524D\u76EE\u6807\u9762\u677F\u672A\u9009\u62E9\u8BBE\u5907\uFF0C\u65E0\u6CD5\u63A5\u6536\u672C\u5730 Windows \u6587\u4EF6\u3002";
      this.render();
      return false;
    }
    const sourceItems = (await Promise.all(sourcePaths.map((path) => this.resolveExternalTransferItem(path)))).filter((item) => !!item);
    if (!sourceItems.length) {
      this.statusMessage = "\u672A\u8BC6\u522B\u5230\u53EF\u4F20\u8F93\u7684 Windows \u6587\u4EF6\u6216\u6587\u4EF6\u5939\u3002";
      this.render();
      return false;
    }
    if (sourceItems.length > 1) {
      const transferred = await this.transferItemsBatch(targetSide, targetSide, this.localWindowsDevice, targetDevice, sourceItems, operation, initiatedAt);
      if (operation === "move") {
        await this.refreshLocalPanesForWindowsPaths(sourceItems.map((item) => item.path).filter(Boolean));
      }
      return transferred;
    }
    const batch = sourceItems.length > 1;
    const actionLabel = operation === "move" ? "\u526A\u5207\u7C98\u8D34" : "\u672C\u5730\u590D\u5236";
    const label = batch ? `${actionLabel} ${sourceItems.length} \u9879` : `${actionLabel} ${sourceItems[0].name}`;
    const task = this.beginTask("transfer", label, `Windows -> ${targetDevice.name}`);
    task.progress = 0;
    task.cancelRequested = false;
    task.transferItems = sourceItems.map((item) => this.createTransferTaskItem(item));
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
    if (operation === "move" && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
      return this.moveExternalWindowsItemsNatively(targetSide, task, sourceItems);
    }
    let completed = 0;
    let failed = 0;
    let totalBytes = 0;
    const strategies = /* @__PURE__ */ new Set();
    const failures = [];
    for (const [index, sourceItem] of sourceItems.entries()) {
      if (task.cancelRequested) {
        for (const pending of task.transferItems.slice(index)) {
          pending.status = "canceled";
          pending.endedAt = Date.now();
        }
        this.finishTask(task, "canceled", batch ? `\u5DF2\u53D6\u6D88\u5916\u90E8\u62D6\u5165\u4F20\u8F93\uFF1A${sourceItem.name}` : `\u5DF2\u53D6\u6D88\u4F20\u8F93\uFF1A${sourceItem.name}`, { bytes: totalBytes });
        return false;
      }
      const progress = Math.min(88, 12 + Math.round(index / sourceItems.length * 70));
      const transferItem = task.transferItems[index];
      task.activeTransferItemIndex = index;
      transferItem.status = "running";
      transferItem.startedAt = Date.now();
      transferItem.progress = 0;
      transferItem.error = void 0;
      transferItem.speedBytesPerSecond = 0;
      transferItem.lastSampleAt = void 0;
      transferItem.lastSampleBytes = void 0;
      transferItem.speedSamples = [];
      await this.ensureTransferItemSize(this.localWindowsDevice, sourceItem, transferItem, task, {
        skipDirectorySize: !!sourceItem.directory
      });
      this.updateTask(task, batch ? `\u6B63\u5728\u4F20\u8F93 ${index + 1}/${sourceItems.length}\uFF1A${sourceItem.name}` : `\u6B63\u5728\u4F20\u8F93\uFF1A${sourceItem.name}`, progress);
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
        transferItem.status = "success";
        transferItem.progress = 100;
        transferItem.transferredBytes = result.bytes;
        transferItem.totalBytes = Math.max(result.bytes, transferItem.totalBytes);
        transferItem.strategy = result.strategy ?? transferItem.strategy;
        transferItem.endedAt = Date.now();
        if (result.strategy) {
          strategies.add(result.strategy);
        }
      } else if (result.canceled) {
        transferItem.status = "canceled";
        transferItem.endedAt = Date.now();
        for (const pending of task.transferItems.slice(index + 1)) {
          pending.status = "canceled";
          pending.endedAt = Date.now();
        }
        this.finishTask(task, "canceled", batch ? `\u5DF2\u53D6\u6D88\u5916\u90E8\u62D6\u5165\u4F20\u8F93\uFF1A${sourceItem.name}` : `\u5DF2\u53D6\u6D88\u4F20\u8F93\uFF1A${sourceItem.name}`, { bytes: totalBytes });
        return false;
      } else {
        failed++;
        transferItem.status = "error";
        transferItem.error = result.message;
        transferItem.endedAt = Date.now();
        failures.push(`${sourceItem.name}: ${result.message}`);
      }
    }
    this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u6807\u76EE\u5F55\uFF1A${targetDevice.name}`, 92);
    await this.refreshPane(targetSide, { force: true });
    const strategy = [...strategies].join(", ") || void 0;
    if (failed > 0) {
      this.finishTask(task, "error", batch ? `\u672C\u5730 Windows \u4F20\u8F93\u5B8C\u6210 ${completed} \u9879\uFF0C\u5931\u8D25 ${failed} \u9879\u3002` : `\u4F20\u8F93\u5931\u8D25\uFF1A${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
      return false;
    }
    if (operation === "move") {
      const cleanupFailures = await this.deleteExternalSourceItems(task, sourceItems);
      await this.refreshLocalPanesForWindowsPaths(sourceItems.map((item) => item.path).filter(Boolean));
      if (cleanupFailures.length) {
        this.finishTask(task, "error", `\u76EE\u6807\u5DF2\u590D\u5236\uFF0C\u4F46\u5220\u9664\u672C\u5730\u6765\u6E90\u5931\u8D25 ${cleanupFailures.length} \u9879\u3002`, { bytes: totalBytes, strategy, error: cleanupFailures[0] });
        return false;
      }
    }
    const successMessage = batch ? `${operation === "move" ? "\u672C\u5730\u526A\u5207\u4F20\u8F93" : "\u672C\u5730\u590D\u5236\u4F20\u8F93"}\u5B8C\u6210\uFF1A${completed} \u9879\uFF0C${formatSize(totalBytes)}\u3002` : `${operation === "move" ? "\u526A\u5207\u4F20\u8F93" : "\u590D\u5236\u4F20\u8F93"}\u5B8C\u6210\uFF1A${sourceItems[0].name}\uFF0C\u7B56\u7565 ${strategy ?? "unknown"}\uFF0C${formatSize(totalBytes)}\u3002`;
    this.finishTask(task, "success", successMessage, { bytes: totalBytes, strategy });
    return true;
  }
  async pasteWindowsClipboardFiles(targetSide) {
    const clipboardFiles = await this.sshService.readWindowsClipboardFiles();
    if (!clipboardFiles.ok || !clipboardFiles.paths.length) {
      this.statusMessage = "\u526A\u8D34\u677F\u91CC\u6CA1\u6709\u53EF\u7C98\u8D34\u7684\u672C\u5730 Windows \u6587\u4EF6\u6216\u6587\u4EF6\u5939\u3002";
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
  getWindowsClipboardPasteKey(targetSide, paths, operation) {
    const targetPath = this.paneStates[targetSide].path.toLowerCase();
    const sourcePaths = paths.map((path) => path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase()).sort().join("\n");
    return `${targetSide}:${targetPath}:${operation}:${sourcePaths}`;
  }
  copySelectedToInternalClipboard(sourceSide, operation) {
    const sourceDevice = this.getPaneDevice(sourceSide);
    const items = this.getSelectedTransferItems(sourceSide);
    if (!sourceDevice || !items.length) {
      this.statusMessage = operation === "move" ? "\u8BF7\u5148\u9009\u62E9\u8981\u526A\u5207\u7684\u6587\u4EF6\u6216\u76EE\u5F55\u3002" : "\u8BF7\u5148\u9009\u62E9\u8981\u590D\u5236\u7684\u6587\u4EF6\u6216\u76EE\u5F55\u3002";
      this.render();
      return;
    }
    this.internalTransferClipboard = {
      operation,
      sourceSide,
      sourceDevice: { ...sourceDevice },
      sourcePath: this.paneStates[sourceSide].path,
      items: items.map((item) => ({ ...item })),
      createdAt: Date.now()
    };
    const action = operation === "move" ? "\u526A\u5207" : "\u590D\u5236";
    this.statusMessage = `\u5DF2${action} ${items.length} \u9879\uFF0C\u53EF\u5728\u76EE\u6807\u6587\u4EF6\u6D4F\u89C8\u533A\u6309 Ctrl+V \u7C98\u8D34\u3002`;
    this.render();
  }
  async pasteIntoPane(targetSide) {
    if (this.internalTransferClipboard?.items.length) {
      await this.pasteInternalTransferClipboard(targetSide);
      return;
    }
    await this.pasteWindowsClipboardFiles(targetSide);
  }
  async pasteInternalTransferClipboard(targetSide) {
    const clipboard = this.internalTransferClipboard;
    const targetDevice = this.getPaneDevice(targetSide);
    if (!clipboard?.items.length || !targetDevice) {
      this.statusMessage = "\u5F53\u524D\u6CA1\u6709\u53EF\u7C98\u8D34\u7684\u5185\u90E8\u6587\u4EF6\uFF0C\u6216\u76EE\u6807\u9762\u677F\u672A\u9009\u62E9\u8BBE\u5907\u3002";
      this.render();
      return false;
    }
    const sourceDevice = clipboard.sourceDevice;
    const sourceItems = clipboard.items.map((item) => ({ ...item }));
    if (sourceItems.length > 1) {
      const transferred = await this.transferItemsBatch(clipboard.sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, clipboard.operation);
      if (transferred && clipboard.operation === "move") {
        this.internalTransferClipboard = void 0;
      }
      return transferred;
    }
    const batch = sourceItems.length > 1;
    const actionLabel = clipboard.operation === "move" ? "\u526A\u5207\u7C98\u8D34" : "\u590D\u5236\u7C98\u8D34";
    const task = this.beginTask("transfer", batch ? `${actionLabel} ${sourceItems.length} \u9879` : `${actionLabel} ${sourceItems[0].name}`, `${sourceDevice.name} -> ${targetDevice.name}`);
    task.progress = 0;
    task.cancelRequested = false;
    task.transferItems = sourceItems.map((item) => this.createTransferTaskItem(item));
    task.speedSamples = [];
    if (clipboard.operation === "move" && this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
      const moved = await this.moveInternalItemsNatively(task, sourceDevice, clipboard.sourceSide, targetSide, sourceItems);
      if (moved) {
        this.internalTransferClipboard = void 0;
      }
      return moved;
    }
    let completed = 0;
    let failed = 0;
    let totalBytes = 0;
    const strategies = /* @__PURE__ */ new Set();
    const failures = [];
    for (const [index, sourceItem] of sourceItems.entries()) {
      if (task.cancelRequested) {
        for (const pending of task.transferItems.slice(index)) {
          pending.status = "canceled";
          pending.endedAt = Date.now();
        }
        this.finishTask(task, "canceled", batch ? `\u5DF2\u53D6\u6D88\u5185\u90E8\u7C98\u8D34\uFF1A${sourceItem.name}` : `\u5DF2\u53D6\u6D88\u7C98\u8D34\uFF1A${sourceItem.name}`, { bytes: totalBytes });
        return false;
      }
      const transferItem = task.transferItems[index];
      task.activeTransferItemIndex = index;
      transferItem.status = "running";
      transferItem.startedAt = Date.now();
      transferItem.progress = 0;
      transferItem.error = void 0;
      transferItem.speedBytesPerSecond = 0;
      transferItem.lastSampleAt = void 0;
      transferItem.lastSampleBytes = void 0;
      transferItem.speedSamples = [];
      const progress = Math.min(88, 12 + Math.round(index / sourceItems.length * 70));
      await this.ensureTransferItemSize(sourceDevice, sourceItem, transferItem, task, {
        skipDirectorySize: !!sourceItem.directory
      });
      const targetPath = joinPanePath(this.paneStates[targetSide].path, sourceItem.name, this.isWindowsDevice(targetDevice));
      if (this.isSameTransferTarget(sourceDevice, sourceItem.path, targetDevice, targetPath)) {
        failed++;
        transferItem.status = "error";
        transferItem.error = "\u6765\u6E90\u548C\u76EE\u6807\u8DEF\u5F84\u76F8\u540C\uFF0C\u5DF2\u8DF3\u8FC7\u3002";
        transferItem.endedAt = Date.now();
        failures.push(`${sourceItem.name}: \u6765\u6E90\u548C\u76EE\u6807\u8DEF\u5F84\u76F8\u540C`);
        continue;
      }
      this.updateTask(task, batch ? `\u6B63\u5728\u7C98\u8D34 ${index + 1}/${sourceItems.length}\uFF1A${sourceItem.name}` : `\u6B63\u5728\u7C98\u8D34\uFF1A${sourceItem.name}`, progress);
      const result = await this.transferItem(clipboard.sourceSide, targetSide, sourceItem, {
        refreshTarget: false,
        task,
        sourceDeviceOverride: sourceDevice,
        targetDeviceOverride: targetDevice
      });
      if (result.ok) {
        completed++;
        totalBytes += result.bytes;
        transferItem.status = "success";
        transferItem.progress = 100;
        transferItem.transferredBytes = result.bytes;
        transferItem.totalBytes = Math.max(result.bytes, transferItem.totalBytes);
        transferItem.strategy = result.strategy ?? transferItem.strategy;
        transferItem.endedAt = Date.now();
        if (result.strategy) {
          strategies.add(result.strategy);
        }
      } else if (result.canceled) {
        transferItem.status = "canceled";
        transferItem.endedAt = Date.now();
        for (const pending of task.transferItems.slice(index + 1)) {
          pending.status = "canceled";
          pending.endedAt = Date.now();
        }
        this.finishTask(task, "canceled", batch ? `\u5DF2\u53D6\u6D88\u5185\u90E8\u7C98\u8D34\uFF1A${sourceItem.name}` : `\u5DF2\u53D6\u6D88\u7C98\u8D34\uFF1A${sourceItem.name}`, { bytes: totalBytes });
        return false;
      } else {
        failed++;
        transferItem.status = "error";
        transferItem.error = result.message;
        transferItem.endedAt = Date.now();
        failures.push(`${sourceItem.name}: ${result.message}`);
      }
    }
    this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${sourceDevice.name} / ${targetDevice.name}`, 92);
    await Promise.all([
      this.refreshPane(clipboard.sourceSide, { force: true }),
      this.refreshPane(targetSide, { force: true })
    ]);
    const strategy = [...strategies].join(", ") || void 0;
    if (failed > 0) {
      this.finishTask(task, "error", batch ? `\u5185\u90E8\u7C98\u8D34\u5B8C\u6210 ${completed} \u9879\uFF0C\u5931\u8D25 ${failed} \u9879\u3002` : `\u5185\u90E8\u7C98\u8D34\u5931\u8D25\uFF1A${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
      return false;
    }
    if (clipboard.operation === "move") {
      const cleanupFailures = await this.deleteInternalClipboardSources(task, sourceDevice, clipboard.sourceSide, sourceItems);
      if (cleanupFailures.length) {
        this.finishTask(task, "error", `\u76EE\u6807\u5DF2\u590D\u5236\uFF0C\u4F46\u5220\u9664\u6765\u6E90\u5931\u8D25 ${cleanupFailures.length} \u9879\u3002`, { bytes: totalBytes, strategy, error: cleanupFailures[0] });
        return false;
      }
      this.internalTransferClipboard = void 0;
    }
    const successMessage = batch ? `${clipboard.operation === "move" ? "\u526A\u5207\u7C98\u8D34" : "\u590D\u5236\u7C98\u8D34"}\u5B8C\u6210\uFF1A${completed} \u9879\uFF0C${formatSize(totalBytes)}\u3002` : `${clipboard.operation === "move" ? "\u526A\u5207\u7C98\u8D34" : "\u590D\u5236\u7C98\u8D34"}\u5B8C\u6210\uFF1A${sourceItems[0].name}\uFF0C\u7B56\u7565 ${strategy ?? "unknown"}\uFF0C${formatSize(totalBytes)}\u3002`;
    this.finishTask(task, "success", successMessage, { bytes: totalBytes, strategy });
    return true;
  }
  isSameTransferTarget(sourceDevice, sourcePath, targetDevice, targetPath) {
    if (!sourcePath || !this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
      return false;
    }
    if (this.isWindowsDevice(sourceDevice)) {
      return isSameWindowsPath(sourcePath, targetPath);
    }
    return trimTrailingSlash(sourcePath) === trimTrailingSlash(targetPath);
  }
  isSameDeviceForNativeOperation(sourceDevice, targetDevice) {
    if (sourceDevice.id === targetDevice.id) {
      return true;
    }
    if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID || targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
      return false;
    }
    return sourceDevice.host === targetDevice.host && (sourceDevice.port || 22) === (targetDevice.port || 22) && sourceDevice.username === targetDevice.username;
  }
  pathsEqualForDevice(left, right, windowsPath) {
    return windowsPath ? isSameWindowsPath(left, right) : trimTrailingSlash(left) === trimTrailingSlash(right);
  }
  /**
   * True when `candidate` is `ancestor` itself or nested below it. Used to forbid moving a folder
   * into itself or one of its own descendants.
   */
  isPathInsideOrEqual(candidate, ancestor, windowsPath) {
    if (windowsPath) {
      const c2 = candidate.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
      const a2 = ancestor.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
      return c2 === a2 || c2.startsWith(`${a2}\\`);
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
  getDirectoryMoveTargets(side, targetDir) {
    const device = this.getPaneDevice(side);
    if (!device || !targetDir) {
      return [];
    }
    const windowsPath = this.isWindowsDevice(device);
    return this.getSelectedTransferItems(side).filter((item) => {
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
  canMoveSelectionIntoDirectory(side, targetItem, targetDir) {
    if (!targetItem.directory && !targetItem.parent) {
      return false;
    }
    return this.getDirectoryMoveTargets(side, targetDir).length > 0;
  }
  /**
   * Moves the current same-pane selection into `targetDir` using a native same-device rename, the
   * same primitive used by cut/paste. Powers dragging rows onto a folder or the ".." row.
   */
  async moveSelectedItemsIntoDirectory(side, targetDir, targetLabel) {
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
    const strategy = windowsPath ? "local-move" : "remote-move";
    const task = this.beginTask("transfer", batch ? `\u79FB\u52A8 ${sourceItems.length} \u9879\u5230 ${targetLabel}` : `\u79FB\u52A8 ${sourceItems[0].name} \u5230 ${targetLabel}`, device.name);
    task.progress = 0;
    task.cancelRequested = false;
    task.transferItems = sourceItems.map((item) => this.createTransferTaskItem(item));
    task.speedSamples = [];
    this.invalidatePaneDirectoryCaches(device, refreshPaths);
    this.removePaneItems(side, sourceItems);
    const failures = [];
    let completed = 0;
    let totalBytes = 0;
    for (const [index, sourceItem] of sourceItems.entries()) {
      const transferItem = task.transferItems[index];
      task.activeTransferItemIndex = index;
      transferItem.status = "running";
      transferItem.startedAt = Date.now();
      transferItem.progress = 0;
      transferItem.strategy = strategy;
      const itemBytes = Math.max(sourceItem.rawSize, transferItem.totalBytes, 0);
      const targetPath = joinPanePath(targetDir, sourceItem.name, windowsPath);
      this.updateTask(task, batch ? `\u6B63\u5728\u79FB\u52A8 ${index + 1}/${sourceItems.length}\uFF1A${sourceItem.name}` : `\u6B63\u5728\u79FB\u52A8\uFF1A${sourceItem.name}`, Math.min(88, 12 + Math.round(index / sourceItems.length * 70)));
      const result = await this.sshService.renamePath(await this.toTransferEndpoint(device, sourceItem.path), targetPath);
      if (result.ok) {
        completed++;
        totalBytes += itemBytes;
        transferItem.status = "success";
        transferItem.progress = 100;
        transferItem.transferredBytes = itemBytes;
        transferItem.totalBytes = Math.max(itemBytes, transferItem.totalBytes);
        transferItem.endedAt = Date.now();
        this.invalidatePaneDirectoryCaches(device, refreshPaths);
      } else {
        transferItem.status = "error";
        transferItem.error = result.message;
        transferItem.endedAt = Date.now();
        failures.push(`${sourceItem.name}: ${result.message}`);
      }
    }
    this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 92);
    this.invalidatePaneDirectoryCaches(device, refreshPaths);
    const visibleRefreshSides = this.getVisiblePaneSidesForDeviceDirectories(device, refreshPaths);
    await Promise.all([
      ...visibleRefreshSides.map((side2) => this.refreshPane(side2, { force: true })),
      this.loadPaneDirectory(device, targetDir, true, "prefetch").catch(() => void 0)
    ]);
    if (failures.length) {
      this.finishTask(task, "error", batch ? `\u79FB\u52A8\u5B8C\u6210 ${completed} \u9879\uFF0C\u5931\u8D25 ${failures.length} \u9879\u3002` : `\u79FB\u52A8\u5931\u8D25\uFF1A${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
      return;
    }
    this.finishTask(task, "success", batch ? `\u79FB\u52A8\u5B8C\u6210\uFF1A${completed} \u9879 \u2192 ${targetLabel}` : `\u79FB\u52A8\u5B8C\u6210\uFF1A${sourceItems[0].name} \u2192 ${targetLabel}`, { bytes: totalBytes, strategy });
  }
  async moveInternalItemsNatively(task, device, sourceSide, targetSide, sourceItems) {
    const batch = sourceItems.length > 1;
    const failures = [];
    const strategy = this.isWindowsDevice(device) ? "local-move" : "remote-move";
    let completed = 0;
    let totalBytes = 0;
    this.removePaneItems(sourceSide, sourceItems.filter((item) => !!item.path));
    for (const [index, sourceItem] of sourceItems.entries()) {
      const transferItem = task.transferItems?.[index];
      task.activeTransferItemIndex = index;
      if (transferItem) {
        transferItem.status = "running";
        transferItem.startedAt = Date.now();
        transferItem.progress = 0;
        transferItem.error = void 0;
        transferItem.speedBytesPerSecond = 0;
        transferItem.lastSampleAt = void 0;
        transferItem.lastSampleBytes = void 0;
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
          transferItem.status = "error";
          transferItem.error = "\u6E90\u8DEF\u5F84\u548C\u76EE\u6807\u8DEF\u5F84\u76F8\u540C\uFF0C\u5DF2\u8DF3\u8FC7\u3002";
          transferItem.endedAt = Date.now();
        }
        failures.push(`${sourceItem.name}: \u6E90\u8DEF\u5F84\u548C\u76EE\u6807\u8DEF\u5F84\u76F8\u540C`);
        continue;
      }
      this.updateTask(task, batch ? `\u6B63\u5728\u79FB\u52A8 ${index + 1}/${sourceItems.length}\uFF1A${sourceItem.name}` : `\u6B63\u5728\u79FB\u52A8\uFF1A${sourceItem.name}`, Math.min(88, 12 + Math.round(index / sourceItems.length * 70)));
      const result = await this.sshService.renamePath(await this.toTransferEndpoint(device, sourceItem.path), targetPath);
      if (result.ok) {
        completed++;
        totalBytes += itemBytes;
        if (transferItem) {
          transferItem.status = "success";
          transferItem.progress = 100;
          transferItem.transferredBytes = itemBytes;
          transferItem.totalBytes = Math.max(itemBytes, transferItem.totalBytes);
          transferItem.strategy = strategy;
          transferItem.endedAt = Date.now();
        }
      } else {
        if (transferItem) {
          transferItem.status = "error";
          transferItem.error = result.message;
          transferItem.endedAt = Date.now();
        }
        failures.push(`${sourceItem.name}: ${result.message}`);
      }
    }
    this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 92);
    await Promise.all([.../* @__PURE__ */ new Set([sourceSide, targetSide])].map((side) => this.refreshPane(side, { force: true })));
    if (failures.length) {
      this.finishTask(task, "error", batch ? `\u540C\u8BBE\u5907\u79FB\u52A8\u5B8C\u6210 ${completed} \u9879\uFF0C\u5931\u8D25 ${failures.length} \u9879\u3002` : `\u540C\u8BBE\u5907\u79FB\u52A8\u5931\u8D25\uFF1A${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
      return false;
    }
    this.finishTask(task, "success", batch ? `\u540C\u8BBE\u5907\u79FB\u52A8\u5B8C\u6210\uFF1A${completed} \u9879\u3002` : `\u540C\u8BBE\u5907\u79FB\u52A8\u5B8C\u6210\uFF1A${sourceItems[0].name}`, { bytes: totalBytes, strategy });
    return true;
  }
  async moveExternalWindowsItemsNatively(targetSide, task, sourceItems) {
    const batch = sourceItems.length > 1;
    const failures = [];
    const strategy = "local-move";
    let completed = 0;
    let totalBytes = 0;
    for (const [index, sourceItem] of sourceItems.entries()) {
      const transferItem = task.transferItems?.[index];
      task.activeTransferItemIndex = index;
      if (transferItem) {
        transferItem.status = "running";
        transferItem.startedAt = Date.now();
        transferItem.progress = 0;
        transferItem.error = void 0;
        transferItem.speedBytesPerSecond = 0;
        transferItem.lastSampleAt = void 0;
        transferItem.lastSampleBytes = void 0;
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
          transferItem.status = "error";
          transferItem.error = "\u6E90\u8DEF\u5F84\u548C\u76EE\u6807\u8DEF\u5F84\u76F8\u540C\uFF0C\u5DF2\u8DF3\u8FC7\u3002";
          transferItem.endedAt = Date.now();
        }
        failures.push(`${sourceItem.name}: \u6E90\u8DEF\u5F84\u548C\u76EE\u6807\u8DEF\u5F84\u76F8\u540C`);
        continue;
      }
      this.updateTask(task, batch ? `\u6B63\u5728\u672C\u673A\u79FB\u52A8 ${index + 1}/${sourceItems.length}\uFF1A${sourceItem.name}` : `\u6B63\u5728\u672C\u673A\u79FB\u52A8\uFF1A${sourceItem.name}`, Math.min(88, 12 + Math.round(index / sourceItems.length * 70)));
      const result = await this.sshService.renamePath(await this.toTransferEndpoint(this.localWindowsDevice, sourceItem.path), targetPath);
      if (result.ok) {
        completed++;
        totalBytes += itemBytes;
        if (transferItem) {
          transferItem.status = "success";
          transferItem.progress = 100;
          transferItem.transferredBytes = itemBytes;
          transferItem.totalBytes = Math.max(itemBytes, transferItem.totalBytes);
          transferItem.strategy = strategy;
          transferItem.endedAt = Date.now();
        }
      } else {
        if (transferItem) {
          transferItem.status = "error";
          transferItem.error = result.message;
          transferItem.endedAt = Date.now();
        }
        failures.push(`${sourceItem.name}: ${result.message}`);
      }
    }
    this.updateTask(task, "\u6B63\u5728\u5237\u65B0\u672C\u673A\u76EE\u5F55", 92);
    await Promise.all([
      this.refreshPane(targetSide, { force: true }),
      this.refreshLocalPanesForWindowsPaths(sourceItems.map((item) => item.path).filter(Boolean))
    ]);
    if (failures.length) {
      this.finishTask(task, "error", batch ? `\u672C\u673A\u79FB\u52A8\u5B8C\u6210 ${completed} \u9879\uFF0C\u5931\u8D25 ${failures.length} \u9879\u3002` : `\u672C\u673A\u79FB\u52A8\u5931\u8D25\uFF1A${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
      return false;
    }
    this.finishTask(task, "success", batch ? `\u672C\u673A\u79FB\u52A8\u5B8C\u6210\uFF1A${completed} \u9879\u3002` : `\u672C\u673A\u79FB\u52A8\u5B8C\u6210\uFF1A${sourceItems[0].name}`, { bytes: totalBytes, strategy });
    return true;
  }
  async deleteInternalClipboardSources(task, sourceDevice, sourceSide, sourceItems) {
    const failures = [];
    const batch = sourceItems.length > 1;
    this.removePaneItems(sourceSide, sourceItems.filter((item) => !!item.path));
    for (const [index, item] of sourceItems.entries()) {
      if (!item.path) {
        continue;
      }
      this.updateTask(task, batch ? `\u6B63\u5728\u5220\u9664\u6765\u6E90 ${index + 1}/${sourceItems.length}\uFF1A${item.name}` : `\u6B63\u5728\u5220\u9664\u6765\u6E90\uFF1A${item.name}`, Math.min(98, 92 + Math.round((index + 1) / sourceItems.length * 6)));
      const result = await this.sshService.deletePath(await this.toTransferEndpoint(sourceDevice, item.path), true);
      if (!result.ok) {
        failures.push(`${item.name}: ${result.message}`);
      }
    }
    await this.refreshPane(sourceSide, { force: true });
    return failures;
  }
  async deleteExternalSourceItems(task, sourceItems) {
    const failures = [];
    for (const [index, item] of sourceItems.entries()) {
      if (!item.path) {
        continue;
      }
      this.updateTask(task, `\u6B63\u5728\u5220\u9664\u672C\u5730\u6765\u6E90 ${index + 1}/${sourceItems.length}\uFF1A${item.name}`, Math.min(98, 92 + Math.round((index + 1) / sourceItems.length * 6)));
      const result = await this.sshService.deletePath(await this.toTransferEndpoint(this.localWindowsDevice, item.path), true);
      if (!result.ok) {
        failures.push(`${item.name}: ${result.message}`);
      }
    }
    return failures;
  }
  async refreshLocalPanesForWindowsPaths(paths) {
    const parentPaths = paths.map((path) => getPaneParentPath(path, true)).filter((path) => !!path);
    if (!parentPaths.length) {
      return;
    }
    const refreshes = [];
    for (const side of ["left", "right"]) {
      const device = this.getPaneDevice(side);
      if (device?.id !== LOCAL_WINDOWS_DEVICE_ID) {
        continue;
      }
      if (parentPaths.some((parentPath) => isSameWindowsPath(parentPath, this.paneStates[side].path))) {
        refreshes.push(this.refreshPane(side, { force: true }));
      }
    }
    await Promise.all(refreshes);
  }
  async resolveExternalTransferItem(path) {
    const name = getPathBasename(path);
    if (!name) {
      return void 0;
    }
    const parentPath = getPaneParentPath(path, true);
    if (parentPath) {
      try {
        const listing = await this.sshService.listLocalDirectory(parentPath);
        const entry = listing.entries.find((candidate) => isSameWindowsPath(candidate.path, path));
        if (entry) {
          return this.toFileItem(entry);
        }
      } catch {
      }
    }
    return {
      name,
      path,
      size: "",
      rawSize: 0,
      modified: "",
      rawModified: 0,
      type: getWindowsDriveRoot(path) ? "directory" : "unknown",
      directory: !!getWindowsDriveRoot(path)
    };
  }
  async transferItemsToWindowsDirectory(sourceSide, sourceDevice, sourceItems, targetDirectory, initiatedAt) {
    this.taskbarHiddenForTerminal = false;
    const items = sourceItems.filter((item) => !!item.path && !item.parent);
    if (!items.length) {
      this.statusMessage = "\u6CA1\u6709\u53EF\u62D6\u5230 Windows \u7684\u6587\u4EF6\u3002";
      this.render();
      return false;
    }
    const targetDevice = this.localWindowsDevice;
    if (items.length === 1) {
      const sourceItem = items[0];
      const task2 = this.beginTask("transfer", `\u62D6\u51FA ${sourceItem.name}`, `${sourceDevice.name} -> Windows`);
      task2.progress = 0;
      task2.cancelRequested = false;
      task2.transferItems = [this.createTransferTaskItem(sourceItem)];
      task2.speedSamples = [];
      this.primeTransferTaskStrategy(task2, sourceDevice, targetDevice, items);
      task2.activeTransferItemIndex = 0;
      const transferItem = task2.transferItems[0];
      transferItem.status = "running";
      transferItem.startedAt = Date.now();
      await this.ensureTransferItemSize(sourceDevice, sourceItem, transferItem, task2, {
        skipDirectorySize: !!sourceItem.directory
      });
      const result = await this.transferItem(sourceSide, sourceSide, sourceItem, {
        refreshTarget: false,
        task: task2,
        targetPath: joinPanePath(targetDirectory, sourceItem.name, true),
        targetDeviceOverride: targetDevice,
        initiatedAt
      });
      if (result.ok) {
        transferItem.status = "success";
        transferItem.progress = 100;
        transferItem.transferredBytes = result.bytes;
        transferItem.totalBytes = Math.max(result.bytes, transferItem.totalBytes);
        transferItem.strategy = result.strategy ?? transferItem.strategy;
        transferItem.endedAt = Date.now();
        this.finishTask(task2, "success", `\u62D6\u51FA\u5B8C\u6210\uFF1A${sourceItem.name}\uFF0C${formatSize(result.bytes)}\u3002`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
        return true;
      }
      transferItem.status = result.canceled ? "canceled" : "error";
      transferItem.error = result.canceled ? void 0 : result.message;
      transferItem.endedAt = Date.now();
      this.finishTask(task2, result.canceled ? "canceled" : "error", result.canceled ? `\u5DF2\u53D6\u6D88\u62D6\u51FA\uFF1A${sourceItem.name}` : `\u62D6\u51FA\u5931\u8D25\uFF1A${result.message}`, { bytes: result.bytes, strategy: result.strategy, error: result.canceled ? void 0 : result.message, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
      return false;
    }
    const task = this.beginTask("transfer", `\u62D6\u51FA ${items.length} \u9879`, `${sourceDevice.name} -> Windows`);
    task.progress = 0;
    task.cancelRequested = false;
    task.transferItems = items.map((item) => this.createTransferTaskItem(item));
    task.speedSamples = [];
    this.primeTransferTaskStrategy(task, sourceDevice, targetDevice, items);
    const progressId = `turbofile-windows-drag-${task.id}-${Date.now()}`;
    task.progressId = progressId;
    for (const transferItem of task.transferItems) {
      transferItem.progressId = progressId;
      transferItem.status = "running";
      transferItem.startedAt = Date.now();
    }
    const progressDisposable = this.sshService.onDynamicTransferProgress(progressId)((event) => this.updateTransferProgress(task, event));
    try {
      const sourceEndpoint = await this.toTransferEndpoint(sourceDevice, items[0].path);
      const targetDirectoryEndpoint = {
        kind: "local",
        path: targetDirectory,
        label: "Windows"
      };
      const expectedBytes = items.reduce((sum, item) => sum + (item.directory ? 0 : Math.max(0, item.rawSize)), 0);
      const plannedStrategy = this.getPlannedBatchTransferStrategy(sourceDevice, targetDevice, items);
      task.strategy = plannedStrategy;
      for (const transferItem of task.transferItems) {
        transferItem.strategy = plannedStrategy;
      }
      this.updateTask(task, `\u6B63\u5728\u62D6\u51FA\u5230 Windows 0/${items.length}`, 8);
      const result = await this.sshService.transferBatch({
        source: sourceEndpoint,
        targetDirectory: targetDirectoryEndpoint,
        items: items.map((item) => ({
          sourcePath: item.path,
          targetName: item.name,
          displayName: item.name,
          sourceType: item.type,
          expectedBytes: item.directory ? 0 : Math.max(0, item.rawSize)
        })),
        operation: "copy",
        progressId,
        expectedBytes,
        strategyHint: "auto",
        clientStartedAt: initiatedAt ?? task.startedAt
      });
      const failedPaths = new Set(result.failures.map((failure) => failure.path));
      for (const [index, item] of items.entries()) {
        const transferItem = task.transferItems[index];
        if (!transferItem) {
          continue;
        }
        transferItem.strategy = result.strategy ?? transferItem.strategy;
        transferItem.endedAt = Date.now();
        if (result.canceled) {
          transferItem.status = "canceled";
        } else if (failedPaths.has(item.path)) {
          transferItem.status = "error";
          transferItem.error = result.failures.find((failure) => failure.path === item.path)?.message;
        } else {
          transferItem.status = "success";
          transferItem.progress = 100;
          transferItem.transferredBytes = Math.max(transferItem.transferredBytes, transferItem.totalBytes, item.rawSize, 0);
        }
      }
      if (result.canceled) {
        this.finishTask(task, "canceled", `\u5DF2\u53D6\u6D88\u62D6\u51FA\u5230 Windows\uFF1A${items.length} \u9879`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
        return false;
      }
      if (!result.ok) {
        this.finishTask(task, "error", `\u62D6\u51FA\u5230 Windows \u5B8C\u6210 ${result.completed} \u9879\uFF0C\u5931\u8D25 ${result.failed} \u9879\u3002`, { bytes: result.bytes, strategy: result.strategy, error: result.failures[0]?.message, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
        return false;
      }
      this.finishTask(task, "success", `\u62D6\u51FA\u5230 Windows \u5B8C\u6210\uFF1A${result.completed} \u9879\uFF0C${formatSize(result.bytes)}\u3002`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u62D6\u51FA\u5230 Windows \u5931\u8D25\uFF1A${message}`, { error: message });
      return false;
    } finally {
      progressDisposable.dispose();
    }
  }
  async transferSelected(sourceSide, targetSide, initiatedAt) {
    this.taskbarHiddenForTerminal = false;
    const sourceDevice = this.getPaneDevice(sourceSide);
    const targetDevice = this.getPaneDevice(targetSide);
    const sourceItems = this.getSelectedTransferItems(sourceSide);
    if (!sourceDevice || !targetDevice || !sourceItems.length) {
      this.statusMessage = "\u8BF7\u5148\u5728\u6765\u6E90\u9762\u677F\u9009\u62E9\u4E00\u4E2A\u6216\u591A\u4E2A\u6587\u4EF6/\u76EE\u5F55\u3002";
      this.render();
      return false;
    }
    if (sourceItems.length > 1) {
      return this.transferItemsBatch(sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, "copy", initiatedAt);
    }
    const batch = sourceItems.length > 1;
    const label = batch ? `\u590D\u5236 ${sourceItems.length} \u9879` : `\u590D\u5236 ${sourceItems[0].name}`;
    const task = this.beginTask("transfer", label, `${sourceDevice.name} -> ${targetDevice.name}`);
    task.progress = 0;
    task.cancelRequested = false;
    task.transferItems = sourceItems.map((item) => this.createTransferTaskItem(item));
    task.speedSamples = [];
    this.primeTransferTaskStrategy(task, sourceDevice, targetDevice, sourceItems);
    if (!batch) {
      task.retryTransfer = { sourceSide, targetSide, sourceItem: { ...sourceItems[0] } };
    }
    let completed = 0;
    let failed = 0;
    let totalBytes = 0;
    const strategies = /* @__PURE__ */ new Set();
    const failures = [];
    for (const [index, sourceItem] of sourceItems.entries()) {
      if (task.cancelRequested) {
        for (const pending of task.transferItems.slice(index)) {
          pending.status = "canceled";
          pending.endedAt = Date.now();
        }
        this.finishTask(task, "canceled", batch ? `\u5DF2\u53D6\u6D88\u6279\u91CF\u4F20\u8F93\uFF1A${sourceItem.name}` : `\u5DF2\u53D6\u6D88\u4F20\u8F93\uFF1A${sourceItem.name}`, { bytes: totalBytes });
        return false;
      }
      const progress = Math.min(88, 12 + Math.round(index / sourceItems.length * 70));
      const transferItem = task.transferItems[index];
      task.activeTransferItemIndex = index;
      transferItem.status = "running";
      transferItem.startedAt = Date.now();
      transferItem.progress = 0;
      transferItem.error = void 0;
      transferItem.speedBytesPerSecond = 0;
      transferItem.lastSampleAt = void 0;
      transferItem.lastSampleBytes = void 0;
      transferItem.speedSamples = [];
      await this.ensureTransferItemSize(sourceDevice, sourceItem, transferItem, task, {
        skipDirectorySize: !!sourceItem.directory
      });
      this.updateTask(task, batch ? `\u6B63\u5728\u4F20\u8F93 ${index + 1}/${sourceItems.length}\uFF1A${sourceItem.name}` : `\u6B63\u5728\u4F20\u8F93\uFF1A${sourceItem.name}`, progress);
      const result = await this.transferItem(sourceSide, targetSide, sourceItem, { refreshTarget: false, task, initiatedAt });
      if (result.ok) {
        completed++;
        totalBytes += result.bytes;
        transferItem.status = "success";
        transferItem.progress = 100;
        transferItem.transferredBytes = result.bytes;
        transferItem.totalBytes = Math.max(result.bytes, transferItem.totalBytes);
        transferItem.strategy = result.strategy ?? transferItem.strategy;
        transferItem.endedAt = Date.now();
        if (result.strategy) {
          strategies.add(result.strategy);
        }
      } else if (result.canceled) {
        transferItem.status = "canceled";
        transferItem.endedAt = Date.now();
        for (const pending of task.transferItems.slice(index + 1)) {
          pending.status = "canceled";
          pending.endedAt = Date.now();
        }
        this.finishTask(task, "canceled", batch ? `\u5DF2\u53D6\u6D88\u6279\u91CF\u4F20\u8F93\uFF1A${sourceItem.name}` : `\u5DF2\u53D6\u6D88\u4F20\u8F93\uFF1A${sourceItem.name}`, { bytes: totalBytes });
        return false;
      } else {
        failed++;
        transferItem.status = "error";
        transferItem.error = result.message;
        transferItem.endedAt = Date.now();
        failures.push(`${sourceItem.name}: ${result.message}`);
      }
    }
    this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${sourceDevice.name} / ${targetDevice.name}`, 92);
    await Promise.all([
      this.refreshPane(sourceSide, { force: true }),
      this.refreshPane(targetSide, { force: true })
    ]);
    const strategy = [...strategies].join(", ") || void 0;
    if (failed > 0) {
      this.finishTask(task, "error", batch ? `\u6279\u91CF\u4F20\u8F93\u5B8C\u6210 ${completed} \u9879\uFF0C\u5931\u8D25 ${failed} \u9879\u3002` : `\u4F20\u8F93\u5931\u8D25\uFF1A${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
      return false;
    }
    const successMessage = batch ? `\u6279\u91CF\u4F20\u8F93\u5B8C\u6210\uFF1A${completed} \u9879\uFF0C${formatSize(totalBytes)}\u3002` : `\u4F20\u8F93\u5B8C\u6210\uFF1A${sourceItems[0].name}\uFF0C\u7B56\u7565 ${strategy ?? "unknown"}\uFF0C${formatSize(totalBytes)}\u3002`;
    this.finishTask(task, "success", successMessage, { bytes: totalBytes, strategy });
    return true;
  }
  async transferItem(sourceSide, targetSide, sourceItem, options) {
    const targetState = this.paneStates[targetSide];
    const sourceDevice = options.sourceDeviceOverride ?? this.getPaneDevice(sourceSide);
    const targetDevice = options.targetDeviceOverride ?? this.getPaneDevice(targetSide);
    if (!sourceDevice || !targetDevice || !sourceItem.path || sourceItem.parent) {
      return { ok: false, message: "\u6765\u6E90\u6216\u76EE\u6807\u65E0\u6548\u3002", bytes: 0 };
    }
    const targetPath = options.targetPath ?? joinPanePath(targetState.path, sourceItem.name, this.isWindowsDevice(targetDevice));
    const progressId = options.task ? `turbofile-transfer-${options.task.id}-${Date.now()}` : void 0;
    if (options.task) {
      options.task.progressId = progressId;
      const activeItem = options.task.activeTransferItemIndex !== void 0 ? options.task.transferItems?.[options.task.activeTransferItemIndex] : void 0;
      if (activeItem) {
        activeItem.progressId = progressId;
      }
    }
    const progressDisposable = progressId && options.task ? this.sshService.onDynamicTransferProgress(progressId)((event) => this.updateTransferProgress(options.task, event)) : void 0;
    try {
      const sourceEndpoint = await this.toTransferEndpoint(sourceDevice, sourceItem.path);
      const targetEndpoint = await this.toTransferEndpoint(targetDevice, targetPath);
      const plannedStrategy = this.getPlannedTransferStrategy(sourceDevice, targetDevice, sourceItem);
      const activeItem = options.task?.activeTransferItemIndex !== void 0 ? options.task.transferItems?.[options.task.activeTransferItemIndex] : void 0;
      const expectedBytes = sourceItem.directory ? Math.max(activeItem?.totalBytes ?? 0, activeItem?.rawSize ?? 0, 0) : Math.max(activeItem?.totalBytes ?? 0, activeItem?.rawSize ?? 0, sourceItem.rawSize, 0);
      const initialStrategy = this.shouldDeferSshToSshStrategy(sourceDevice, targetDevice) ? void 0 : plannedStrategy;
      if (activeItem) {
        activeItem.strategy = initialStrategy;
      }
      if (options.task) {
        options.task.strategy = initialStrategy;
      }
      if (options.task) {
        this.updateTask(options.task, `\u6B63\u5728\u4F20\u8F93\uFF1A${sourceItem.name} -> ${targetDevice.name}`, Math.max(35, options.task.progress));
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
        if (options.task && result.durationMs !== void 0) {
          options.task.durationMs = (options.task.durationMs ?? 0) + result.durationMs;
          options.task.averageBytesPerSecond = void 0;
        }
        if (options.refreshTarget) {
          if (options.task) {
            this.updateTask(options.task, `\u6B63\u5728\u5237\u65B0\u76EE\u6807\u76EE\u5F55\uFF1A${targetDevice.name}`, 90);
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
  async transferItemsBatch(sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, operation, initiatedAt) {
    const items = sourceItems.filter((item) => !!item.path && !item.parent);
    if (!items.length) {
      return false;
    }
    const actionLabel = operation === "move" ? "\u526A\u5207\u4F20\u8F93" : "\u6279\u91CF\u4F20\u8F93";
    const task = this.beginTask("transfer", `${actionLabel} ${items.length} \u9879`, `${sourceDevice.name} -> ${targetDevice.name}`);
    task.progress = 0;
    task.cancelRequested = false;
    task.transferItems = items.map((item) => this.createTransferTaskItem(item));
    task.speedSamples = [];
    this.primeTransferTaskStrategy(task, sourceDevice, targetDevice, items);
    const progressId = `turbofile-batch-${task.id}-${Date.now()}`;
    task.progressId = progressId;
    for (const transferItem of task.transferItems) {
      transferItem.progressId = progressId;
      transferItem.status = "running";
      transferItem.startedAt = Date.now();
    }
    const progressDisposable = this.sshService.onDynamicTransferProgress(progressId)((event) => this.updateTransferProgress(task, event));
    try {
      const sourceEndpoint = await this.toTransferEndpoint(sourceDevice, items[0].path);
      const targetDirectoryEndpoint = await this.toTransferEndpoint(targetDevice, this.paneStates[targetSide].path);
      const expectedBytes = items.reduce((sum, item) => sum + (item.directory ? 0 : Math.max(0, item.rawSize)), 0);
      const plannedStrategy = this.getPlannedBatchTransferStrategy(sourceDevice, targetDevice, items);
      const initialStrategy = this.shouldDeferSshToSshStrategy(sourceDevice, targetDevice) ? void 0 : plannedStrategy;
      task.strategy = initialStrategy;
      for (const transferItem of task.transferItems) {
        transferItem.strategy = initialStrategy;
      }
      this.updateTask(task, `\u6B63\u5728\u6279\u91CF\u4F20\u8F93 0/${items.length}`, 8);
      const result = await this.sshService.transferBatch({
        source: sourceEndpoint,
        targetDirectory: targetDirectoryEndpoint,
        items: items.map((item) => ({
          sourcePath: item.path,
          targetName: item.name,
          displayName: item.name,
          sourceType: item.type,
          expectedBytes: item.directory ? 0 : Math.max(0, item.rawSize)
        })),
        operation,
        progressId,
        expectedBytes,
        strategyHint: "auto",
        clientStartedAt: initiatedAt ?? task.startedAt
      });
      const failedPaths = new Set(result.failures.map((failure) => failure.path));
      for (const [index, item] of items.entries()) {
        const transferItem = task.transferItems[index];
        if (!transferItem) {
          continue;
        }
        transferItem.strategy = result.strategy ?? transferItem.strategy;
        transferItem.endedAt = Date.now();
        if (result.canceled) {
          transferItem.status = "canceled";
        } else if (failedPaths.has(item.path)) {
          transferItem.status = "error";
          transferItem.error = result.failures.find((failure) => failure.path === item.path)?.message;
        } else {
          transferItem.status = "success";
          transferItem.progress = 100;
          transferItem.transferredBytes = Math.max(transferItem.transferredBytes, transferItem.totalBytes, item.rawSize, 0);
        }
      }
      this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${sourceDevice.name} / ${targetDevice.name}`, 92);
      await Promise.all([
        this.refreshPane(sourceSide, { force: true }),
        this.refreshPane(targetSide, { force: true })
      ]);
      if (result.canceled) {
        this.finishTask(task, "canceled", `\u5DF2\u53D6\u6D88\u6279\u91CF\u4F20\u8F93\uFF1A${items.length} \u9879`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
        return false;
      }
      if (!result.ok) {
        this.finishTask(task, "error", `\u6279\u91CF\u4F20\u8F93\u5B8C\u6210 ${result.completed} \u9879\uFF0C\u5931\u8D25 ${result.failed} \u9879\u3002`, { bytes: result.bytes, strategy: result.strategy, error: result.failures[0]?.message, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
        return false;
      }
      this.finishTask(task, "success", `${operation === "move" ? "\u526A\u5207\u4F20\u8F93" : "\u6279\u91CF\u4F20\u8F93"}\u5B8C\u6210\uFF1A${result.completed} \u9879\uFF0C${formatSize(result.bytes)}\u3002`, { bytes: result.bytes, strategy: result.strategy, durationMs: result.durationMs, averageBytesPerSecond: result.averageBytesPerSecond });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u6279\u91CF\u4F20\u8F93\u5931\u8D25\uFF1A${message}`, { error: message });
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
  insertOptimisticPaneItem(side, item) {
    const state = this.paneStates[side];
    if (item.path && state.items.some((existing) => existing.path === item.path)) {
      return;
    }
    const parents = state.items.filter((existing) => existing.parent);
    const entries = state.items.filter((existing) => !existing.parent);
    entries.push(item);
    entries.sort((a, b) => {
      if (!!a.directory !== !!b.directory) {
        return a.directory ? -1 : 1;
      }
      return a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" });
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
    this.fileListRenderedRange[side] = void 0;
    this.render();
  }
  async createFolder(side) {
    const state = this.paneStates[side];
    const device = this.getPaneDevice(side);
    if (!device) {
      return;
    }
    const name = await this.showDialogPrompt("\u65B0\u5EFA\u6587\u4EF6\u5939", "\u8BF7\u8F93\u5165\u65B0\u6587\u4EF6\u5939\u540D\u79F0");
    if (!name?.trim()) {
      return;
    }
    const folderName = name.trim();
    const targetPath = joinPanePath(state.path, folderName, this.isWindowsDevice(device));
    const task = this.beginTask("mkdir", `\u65B0\u5EFA\u6587\u4EF6\u5939 ${folderName}`, device.name);
    try {
      const result = await this.sshService.createDirectory(await this.toTransferEndpoint(device, targetPath));
      if (result.ok) {
        this.insertOptimisticPaneItem(side, {
          name: folderName,
          path: targetPath,
          size: "",
          rawSize: 0,
          modified: formatDate(Date.now()),
          rawModified: Date.now(),
          type: "directory",
          directory: true
        });
        this.finishTask(task, "success", `\u5DF2\u521B\u5EFA\u6587\u4EF6\u5939\uFF1A${folderName}`);
      } else {
        this.finishTask(task, "error", `\u65B0\u5EFA\u6587\u4EF6\u5939\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
        await this.refreshPane(side, { force: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u65B0\u5EFA\u6587\u4EF6\u5939\u5931\u8D25\uFF1A${message}`, { error: message });
    }
  }
  async createFile(side) {
    const state = this.paneStates[side];
    const device = this.getPaneDevice(side);
    if (!device) {
      return;
    }
    const name = await this.showDialogPrompt("\u65B0\u5EFA\u6587\u4EF6", "\u8BF7\u8F93\u5165\u65B0\u6587\u4EF6\u540D\u79F0");
    if (!name?.trim()) {
      return;
    }
    const fileName = name.trim();
    const targetPath = joinPanePath(state.path, fileName, this.isWindowsDevice(device));
    const task = this.beginTask("create-file", `\u65B0\u5EFA\u6587\u4EF6 ${fileName}`, device.name);
    try {
      const result = await this.sshService.writeFile(await this.toTransferEndpoint(device, targetPath), "", "utf8");
      if (result.ok) {
        this.insertOptimisticPaneItem(side, {
          name: fileName,
          path: targetPath,
          size: formatSize(0),
          rawSize: 0,
          modified: formatDate(Date.now()),
          rawModified: Date.now(),
          type: "file"
        });
        this.finishTask(task, "success", `\u5DF2\u521B\u5EFA\u6587\u4EF6\uFF1A${fileName}`);
      } else {
        this.finishTask(task, "error", `\u65B0\u5EFA\u6587\u4EF6\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
        await this.refreshPane(side, { force: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u65B0\u5EFA\u6587\u4EF6\u5931\u8D25\uFF1A${message}`, { error: message });
      await this.refreshPane(side, { force: true });
    }
  }
  async deleteSelected(side) {
    const items = this.getSelectedTransferItems(side);
    const device = this.getPaneDevice(side);
    if (!items.length || !device) {
      this.statusMessage = "\u8BF7\u5148\u9009\u62E9\u8981\u5220\u9664\u7684\u6587\u4EF6\u6216\u76EE\u5F55\u3002";
      this.render();
      return;
    }
    const batch = items.length > 1;
    if (!await this.showDialogConfirm("\u5220\u9664\u786E\u8BA4", batch ? `\u786E\u5B9A\u5220\u9664\u9009\u4E2D\u7684 ${items.length} \u9879\u5417\uFF1F` : `\u786E\u5B9A\u5220\u9664 ${items[0].name} \u5417\uFF1F`, void 0, true)) {
      return;
    }
    this.removePaneItems(side, items);
    const task = this.beginTask("delete", batch ? `\u5220\u9664 ${items.length} \u9879` : `\u5220\u9664 ${items[0].name}`, device.name);
    try {
      this.updateTask(task, batch ? `\u6B63\u5728\u5220\u9664 ${items.length} \u9879\u2026` : `\u6B63\u5728\u5220\u9664\uFF1A${items[0].name}`, 40);
      const endpoints = await Promise.all(items.filter((item) => !!item.path).map((item) => this.toTransferEndpoint(device, item.path)));
      const result = await this.sshService.deletePaths(endpoints, true);
      this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
      await this.refreshPane(side, { force: true });
      if (!result.ok) {
        this.finishTask(task, "error", `\u5220\u9664\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
        return;
      }
      this.finishTask(task, "success", batch ? `\u5DF2\u5220\u9664\uFF1A${items.length} \u9879` : `\u5DF2\u5220\u9664\uFF1A${items[0].name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u5220\u9664\u5931\u8D25\uFF1A${message}`, { error: message });
      await this.refreshPane(side, { force: true });
    }
  }
  removePaneItems(side, items) {
    if (this.removePaneItemsFromState(side, items)) {
      this.render();
    }
  }
  removePaneItemsFromState(side, items) {
    const paths = new Set(items.map((item) => item.path).filter((path) => !!path));
    if (!paths.size) {
      return false;
    }
    const state = this.paneStates[side];
    state.items = state.items.filter((item) => !item.path || !paths.has(item.path));
    this.clearPaneSelection(side);
    this.fileListRenderedRange[side] = void 0;
    const device = this.getPaneDevice(side);
    if (device) {
      this.paneDirectoryCache.delete(this.getPaneDirectoryCacheKey(device, state.path));
    }
    return true;
  }
  applyOptimisticRename(side, item, targetName, targetPath) {
    if (!item.path) {
      return void 0;
    }
    const state = this.paneStates[side];
    const index = state.items.findIndex((candidate) => candidate.path === item.path);
    if (index < 0) {
      return void 0;
    }
    const snapshot = {
      panePath: state.path,
      index,
      originalItem: state.items[index],
      renamedPath: targetPath,
      selectedPath: state.selectedPath,
      selectedPaths: Array.from(state.selectedPaths),
      selectionAnchorPath: state.selectionAnchorPath
    };
    const now = Date.now();
    const renamedItem = {
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
    this.fileListRenderedRange[side] = void 0;
    const device = this.getPaneDevice(side);
    if (device) {
      this.paneDirectoryCache.delete(this.getPaneDirectoryCacheKey(device, state.path));
    }
    this.statusMessage = `\u5DF2\u91CD\u547D\u540D\uFF1A${item.name} -> ${targetName}`;
    this.rememberPaneDeviceSnapshot(side);
    this.render();
    return snapshot;
  }
  revertOptimisticRename(side, snapshot) {
    const state = this.paneStates[side];
    if (state.path !== snapshot.panePath) {
      return;
    }
    const renamedIndex = state.items.findIndex((item) => item.path === snapshot.renamedPath);
    state.items = [...state.items];
    if (renamedIndex >= 0) {
      state.items[renamedIndex] = snapshot.originalItem;
    } else {
      state.items.splice(Math.min(snapshot.index, state.items.length), 0, snapshot.originalItem);
    }
    state.selectedPath = snapshot.selectedPath;
    state.selectedPaths = new Set(snapshot.selectedPaths);
    state.selectionAnchorPath = snapshot.selectionAnchorPath;
    this.fileListRenderedRange[side] = void 0;
    this.rememberPaneDeviceSnapshot(side);
    this.render();
  }
  async renameSelected(side) {
    const item = this.getSelectedItem(side);
    const device = this.getPaneDevice(side);
    if (!item?.path || !device || item.parent) {
      this.statusMessage = "\u8BF7\u5148\u9009\u62E9\u8981\u91CD\u547D\u540D\u7684\u6587\u4EF6\u6216\u76EE\u5F55\u3002";
      this.render();
      return;
    }
    this.startInlineRename(side, item);
  }
  startInlineRename(side, item) {
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
    this.statusMessage = `\u6B63\u5728\u91CD\u547D\u540D\uFF1A${item.name}`;
    this.render();
  }
  isInlineRenameTarget(side, item) {
    return !!item.path && this.inlineRename?.side === side && this.inlineRename.path === item.path;
  }
  validateRenameName(side, item, value) {
    const device = this.getPaneDevice(side);
    if (!value.trim()) {
      return "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\u3002";
    }
    if (value === "." || value === "..") {
      return "\u4E0D\u80FD\u4F7F\u7528 . \u6216 .. \u4F5C\u4E3A\u540D\u79F0\u3002";
    }
    if (value.includes("/") || value.includes("\\")) {
      return "\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u8DEF\u5F84\u5206\u9694\u7B26\u3002";
    }
    if (device && this.isWindowsDevice(device) && /[<>:"|?*]/.test(value)) {
      return 'Windows \u540D\u79F0\u4E0D\u80FD\u5305\u542B < > : " | ? *\u3002';
    }
    const caseInsensitive = !device || this.isWindowsDevice(device);
    const nameKey = caseInsensitive ? value.toLocaleLowerCase() : value;
    const duplicate = this.paneStates[side].items.some((candidate) => {
      if (!candidate.path || candidate.parent || candidate.path === item.path) {
        return false;
      }
      const candidateKey = caseInsensitive ? candidate.name.toLocaleLowerCase() : candidate.name;
      return candidateKey === nameKey;
    });
    if (duplicate) {
      return "\u5DF2\u5B58\u5728\u540C\u540D\u6587\u4EF6\u6216\u76EE\u5F55\u3002";
    }
    return void 0;
  }
  async performRename(side, item, nextName) {
    const device = this.getPaneDevice(side);
    if (!item.path || !device || item.parent || !nextName.trim() || nextName === item.name) {
      return;
    }
    const targetName = nextName;
    const targetPath = joinPanePath(this.paneStates[side].path, targetName, this.isWindowsDevice(device));
    const optimisticRename = this.applyOptimisticRename(side, item, targetName, targetPath);
    const task = this.beginTask("rename", `\u91CD\u547D\u540D ${item.name}`, `${item.name} -> ${targetName}`);
    try {
      const result = await this.sshService.renamePath(await this.toTransferEndpoint(device, item.path), targetPath);
      if (result.ok) {
        this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
        this.finishTask(task, "success", `\u5DF2\u91CD\u547D\u540D\uFF1A${item.name} -> ${targetName}`);
      } else {
        if (optimisticRename) {
          this.revertOptimisticRename(side, optimisticRename);
        }
        this.finishTask(task, "error", `\u91CD\u547D\u540D\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      }
    } catch (error) {
      if (optimisticRename) {
        this.revertOptimisticRename(side, optimisticRename);
      }
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u91CD\u547D\u540D\u5931\u8D25\uFF1A${message}`, { error: message });
    }
  }
  async previewSelected(side, explicitItem) {
    const item = explicitItem ?? this.getSelectedItem(side);
    const device = this.getPaneDevice(side);
    if (!item?.path || !device || item.parent || item.directory) {
      this.statusMessage = "\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u6587\u4EF6\u8FDB\u884C\u9884\u89C8\u3002";
      this.render();
      return;
    }
    if (!isImageFile(item.name)) {
      void this.openNativeDocument(side, item, device);
      return;
    }
    this.openImageGrid(side, item.path, true, "file-list");
  }
  openImageGrid(side, selectedPath, previewVisible = false, previewOrigin = "grid") {
    const state = this.paneStates[side];
    this.clearImageGridThumbnailQueue();
    this.clearImageGridPreviewPrefetchTimer();
    this.clearImageGridLoadedImageIndexes();
    this.clearImageGridLayoutMetrics();
    this.imageGridRenderedRange = void 0;
    const images = state.items.filter((item) => !item.parent && !item.directory && !!item.path && isImageFile(item.name)).map((item) => {
      return {
        item,
        thumbnailContent: "",
        thumbnailMime: "image/jpeg",
        thumbnailLoading: false,
        previewContent: "",
        previewMime: getMimeType(item.name),
        previewLoading: false
      };
    });
    if (!images.length) {
      this.statusMessage = "\u5F53\u524D\u76EE\u5F55\u6CA1\u6709\u53EF\u5C55\u5F00\u6D4F\u89C8\u7684\u56FE\u7247\u3002";
      this.render();
      return;
    }
    sortImageGridImages(images, this.imageGridSortKey, this.imageGridSortDescending);
    const selectedPanePaths = new Set(state.selectedPaths);
    const selectedIndexCandidate = selectedPath ? images.findIndex((image) => image.item.path === selectedPath) : images.findIndex((image) => !!image.item.path && selectedPanePaths.has(image.item.path));
    const selectedIndex = Math.max(0, selectedIndexCandidate);
    const selectedIndexes = /* @__PURE__ */ new Set();
    for (const [index, image] of images.entries()) {
      if (image.item.path && (selectedPanePaths.has(image.item.path) || image.item.path === selectedPath)) {
        selectedIndexes.add(index);
      }
    }
    if (!selectedIndexes.size) {
      selectedIndexes.add(selectedIndex);
    }
    this.imagePreviewAnalysis = void 0;
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
      previewSamplingMode: "smooth",
      pixelInspectorVisible: false,
      histogramVisible: false,
      histogramX: 104,
      histogramY: 72,
      fileListScrollTop: state.scrollTop,
      scrollTop: 0,
      viewportHeight: this.getImageGridDefaultViewportHeight()
    };
    this.imageGridCtrlWheelDeltaRemainder = 0;
    this.activePage = "images";
    this.updateTransferTabsVisibility();
    this.notifyActivePageChanged();
    this.statusMessage = `\u5DF2\u5C55\u5F00 ${this.getSideLabel(side)} \u56FE\u7247\uFF1A${images.length} \u5F20\u3002`;
    this.render();
    if (previewVisible && this.imageGridState) {
      this.imageGridPreviewRequestSeq++;
      void this.ensureImageGridPreviewLoaded(this.imageGridState, selectedIndex, this.imageGridPreviewRequestSeq);
      this.scheduleImageGridPreviewNeighborsLoaded(this.imageGridState, selectedIndex);
    }
  }
  closeImageGridPage() {
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
    this.imagePreviewAnalysis = void 0;
    this.clearImagePreviewRender();
    this.imageGridRenderedRange = void 0;
    this.imageGridState = void 0;
    if (state) {
      this.restoreFileListScrollAfterImageGrid(state.side, state.fileListScrollTop);
    }
    this.activePage = "transfer";
    this.updateTransferTabsVisibility();
    this.notifyActivePageChanged();
    this.render();
  }
  restoreFileListScrollAfterImageGrid(side, scrollTop) {
    const state = this.paneStates[side];
    state.scrollTop = Math.max(0, scrollTop);
    this.fileListRenderedRange[side] = void 0;
    this.clearFileListScrollRaf(side);
  }
  selectImageGridItem(index, event) {
    const state = this.imageGridState;
    if (!state || index < 0 || index >= state.images.length) {
      return;
    }
    const isToggle = !!event && (event.ctrlKey || event.metaKey);
    const anchorIndex = state.selectionAnchorIndex;
    const isRange = !!event?.shiftKey && anchorIndex !== void 0;
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
  selectImageGridItemWithPointer(index, event) {
    if (event.button !== 0) {
      return;
    }
    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      target.focus({ preventScroll: true });
    }
    this.selectImageGridItem(index, event);
  }
  selectImageGridItemWithContextMenu(index, event) {
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
  setSingleImageGridSelection(state, index) {
    state.selectedIndexes.clear();
    state.selectedIndexes.add(index);
    state.selectedIndex = index;
    state.selectionAnchorIndex = index;
  }
  setImageGridRangeSelection(state, anchorIndex, index) {
    state.selectedIndexes.clear();
    const start = Math.max(0, Math.min(anchorIndex, index));
    const end = Math.min(state.images.length - 1, Math.max(anchorIndex, index));
    for (let candidate = start; candidate <= end; candidate++) {
      state.selectedIndexes.add(candidate);
    }
    state.selectedIndex = index;
  }
  selectAllImageGridItems() {
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
      state.selectionAnchorIndex = void 0;
    }
    this.updateImageGridSelection();
    this.updateImageGridSelectionStatus(state);
  }
  moveImageGridPreview(delta) {
    const state = this.imageGridState;
    if (!state?.images.length) {
      return;
    }
    const baseIndex = state.previewPendingIndex ?? state.selectedIndex;
    const nextIndex = (baseIndex + delta + state.images.length) % state.images.length;
    if (nextIndex === state.selectedIndex) {
      this.imageGridPreviewRequestSeq++;
      state.previewPendingIndex = void 0;
      state.previewPendingRequestSeq = void 0;
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
  commitImageGridPreviewIndexIfReady(state, index, requestSeq) {
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
    state.previewSamplingMode = "smooth";
    state.previewPendingIndex = void 0;
    state.previewPendingRequestSeq = void 0;
    this.imagePreviewAnalysis = void 0;
    this.clearImagePreviewRender();
    this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
    this.updateImagePreviewOverlay();
    return true;
  }
  openImageGridPreview(index) {
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
    state.previewOrigin = "grid";
    state.previewVisible = true;
    state.previewZoom = 1;
    state.previewPanX = 0;
    state.previewPanY = 0;
    state.previewFitPending = true;
    state.previewSamplingMode = "smooth";
    state.previewPendingIndex = void 0;
    state.previewPendingRequestSeq = void 0;
    this.imagePreviewAnalysis = void 0;
    this.clearImagePreviewRender();
    this.imageGridPreviewRequestSeq++;
    this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
    this.render();
    void this.ensureImageGridPreviewLoaded(state, index, this.imageGridPreviewRequestSeq);
    this.scheduleImageGridPreviewNeighborsLoaded(state, index);
    this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(index, state.images.length));
  }
  closeImageGridPreview() {
    const state = this.imageGridState;
    if (!state) {
      return;
    }
    if (state.previewOrigin === "file-list") {
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
    state.previewSamplingMode = "smooth";
    state.previewPendingIndex = void 0;
    state.previewPendingRequestSeq = void 0;
    this.imagePreviewAnalysis = void 0;
    this.clearImagePreviewRender();
    this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
    this.render();
  }
  toggleImagePreviewPixelInspector() {
    const state = this.imageGridState;
    if (!state?.previewVisible) {
      return;
    }
    state.pixelInspectorVisible = !state.pixelInspectorVisible;
    this.updateImagePreviewToggleButton("pixel-inspector", state.pixelInspectorVisible);
    this.updateImagePreviewPixelInspectorInPlace(state);
  }
  toggleImagePreviewHistogram() {
    const state = this.imageGridState;
    if (!state?.previewVisible) {
      return;
    }
    state.histogramVisible = !state.histogramVisible;
    this.updateImagePreviewToggleButton("histogram", state.histogramVisible);
    this.updateImagePreviewHistogramInPlace(state);
  }
  toggleImagePreviewSamplingMode() {
    const state = this.imageGridState;
    if (!state?.previewVisible) {
      return;
    }
    state.previewSamplingMode = state.previewSamplingMode === "lossless" ? "smooth" : "lossless";
    this.updateImagePreviewToggleButton("lossless-sampling", state.previewSamplingMode === "lossless");
    this.renderImagePreviewCanvas();
  }
  zoomImagePreviewByOculanteStep(step) {
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
  setImageGridPreviewZoom(zoom, anchor) {
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
    state.previewPanX -= (zoomAnchor.x - state.previewPanX) * delta / oldScale;
    state.previewPanY -= (zoomAnchor.y - state.previewPanY) * delta / oldScale;
    state.previewZoom = newScale;
    state.previewFitPending = false;
    this.limitImagePreviewOffset(state, render);
    this.renderImagePreviewCanvas();
  }
  resetImagePreviewView() {
    const state = this.imageGridState;
    if (!state?.previewVisible) {
      return;
    }
    state.previewFitPending = true;
    this.renderImagePreviewCanvas();
  }
  updateImagePreviewZoomValue(state) {
    const controls = this.container?.querySelector(".turbofile-image-preview-zoom-controls");
    const zoomValue = controls?.querySelector(".turbofile-image-preview-zoom-value");
    if (zoomValue) {
      zoomValue.textContent = this.getImagePreviewZoomLabel(state);
    }
    const transientButtons = controls?.querySelectorAll(".turbofile-image-preview-action.is-transient");
    if (transientButtons?.[0]) {
      transientButtons[0].disabled = state.previewZoom <= IMAGE_PREVIEW_ZOOM_MIN;
    }
    if (transientButtons?.[1]) {
      transientButtons[1].disabled = state.previewZoom >= IMAGE_PREVIEW_ZOOM_MAX;
    }
    const resetButton = controls?.querySelector(".turbofile-image-preview-action.is-reset");
    if (resetButton) {
      resetButton.disabled = state.previewFitPending;
    }
  }
  getImagePreviewZoomLabel(state) {
    return `${Math.round(state.previewZoom * 100)}%`;
  }
  clearImagePreviewRender() {
    this.imagePreviewResizeObserver?.disconnect();
    this.imagePreviewResizeObserver = void 0;
    this.imagePreviewRender = void 0;
    this.imagePreviewRenderSeq++;
  }
  async downloadImageGridPreview() {
    const state = this.imageGridState;
    const image = state?.images[state.selectedIndex];
    const device = state ? this.getPaneDevice(state.side) : void 0;
    if (!image?.item.path || !device) {
      return;
    }
    try {
      const result = await this.sshService.readImage(await this.toTransferEndpoint(device, image.item.path), {
        encoding: "base64",
        forceOriginal: true,
        maxBytes: 256 * 1024 * 1024,
        sourceSize: image.item.rawSize,
        sourceModified: image.item.rawModified
      });
      if (!result.ok || !result.content) {
        throw new Error(result.message || "\u65E0\u6CD5\u8BFB\u53D6\u539F\u59CB\u56FE\u7247\u3002");
      }
      const src = `data:${result.mime || getMimeType(image.item.name)};base64,${result.content}`;
      const ownerDocument = this.container?.ownerDocument ?? document;
      const anchor = ownerDocument.createElement("a");
      anchor.href = src;
      anchor.download = image.item.name;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      ownerDocument.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u4E0B\u8F7D\u56FE\u7247\u5931\u8D25\uFF1A${message}`;
      this.render();
    }
  }
  canCopyPreviewImage() {
    const gridState = this.imageGridState;
    if (gridState?.previewVisible) {
      const image = gridState.images[gridState.selectedIndex];
      return !!image && !!this.getImagePreviewSource(image);
    }
    return false;
  }
  async copyPreviewImageToClipboard() {
    try {
      const gridState = this.imageGridState;
      if (gridState?.previewVisible) {
        const image = gridState.images[gridState.selectedIndex];
        const device = this.getPaneDevice(gridState.side);
        if (!image?.item.path || !device) {
          return;
        }
        const result = await this.sshService.readImage(await this.toTransferEndpoint(device, image.item.path), {
          encoding: "base64",
          forceOriginal: true,
          maxBytes: 128 * 1024 * 1024,
          sourceSize: image.item.rawSize,
          sourceModified: image.item.rawModified
        });
        if (!result.ok || !result.content) {
          throw new Error(result.message || "\u65E0\u6CD5\u8BFB\u53D6\u9884\u89C8\u56FE\u7247\u3002");
        }
        await this.writePreviewImageContentToClipboard(result.content, result.mime, image.item.name);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u590D\u5236\u56FE\u7247\u5931\u8D25\uFF1A${message}`;
      this.showDialogInfo("\u590D\u5236\u56FE\u7247\u5931\u8D25", message);
    }
  }
  async writePreviewImageContentToClipboard(content, mime, name) {
    const result = await this.sshService.writeClipboardImage(content, mime, "base64");
    if (!result.ok) {
      throw new Error(result.message || "\u590D\u5236\u56FE\u7247\u5931\u8D25\u3002");
    }
    this.statusMessage = `\u5DF2\u590D\u5236\u56FE\u7247\uFF1A${name}`;
  }
  async deleteSelectedImageGridItems() {
    const state = this.imageGridState;
    const device = state ? this.getPaneDevice(state.side) : void 0;
    if (!state || !device) {
      return;
    }
    const targets = this.getImageGridDeleteTargets(state).filter(({ image }) => !!image.item.path);
    if (!targets.length) {
      this.statusMessage = "\u8BF7\u5148\u9009\u62E9\u8981\u5220\u9664\u7684\u56FE\u7247\u3002";
      this.render();
      return;
    }
    const batch = targets.length > 1;
    const confirmMessage = batch ? `\u786E\u5B9A\u5220\u9664\u9009\u4E2D\u7684 ${targets.length} \u5F20\u56FE\u7247\u5417\uFF1F` : `\u5220\u9664 ${targets[0].image.item.name}\uFF1F`;
    if (!await this.showDialogConfirm("\u5220\u9664\u56FE\u7247", confirmMessage, void 0, true)) {
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
      state.selectionAnchorIndex = void 0;
    }
    state.previewZoom = 1;
    state.previewPanX = 0;
    state.previewPanY = 0;
    state.previewFitPending = true;
    state.previewSamplingMode = "smooth";
    state.previewVisible = keepPreviewVisible && state.images.length > 0;
    this.imageGridPreviewRequestSeq++;
    this.imageGridRenderedRange = void 0;
    this.clearImageGridThumbnailQueue();
    this.clearImageGridPreviewPrefetchTimer();
    this.clearImageGridLoadedImageIndexes();
    this.imagePreviewAnalysis = void 0;
    this.clearImagePreviewRender();
    this.removePaneItemsFromState(state.side, items);
    const task = this.beginTask("delete", batch ? `\u5220\u9664 ${targets.length} \u5F20\u56FE\u7247` : `\u5220\u9664 ${items[0].name}`, device.name);
    this.render();
    if (state.previewVisible) {
      void this.ensureImageGridPreviewLoaded(state, state.selectedIndex, this.imageGridPreviewRequestSeq);
      this.scheduleImageGridPreviewNeighborsLoaded(state, state.selectedIndex);
      this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(state.selectedIndex, state.images.length));
    }
    try {
      this.updateTask(task, batch ? `\u6B63\u5728\u5220\u9664 ${items.length} \u5F20\u56FE\u7247\u2026` : `\u6B63\u5728\u5220\u9664\uFF1A${items[0].name}`, 40);
      const endpoints = await Promise.all(items.filter((item) => !!item.path).map((item) => this.toTransferEndpoint(device, item.path)));
      const result = await this.sshService.deletePaths(endpoints, true);
      this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
      await this.refreshPane(state.side, { force: true });
      if (!result.ok) {
        this.finishTask(task, "error", `\u5220\u9664\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
        return;
      }
      this.finishTask(task, "success", batch ? `\u5DF2\u5220\u9664\uFF1A${items.length} \u5F20\u56FE\u7247` : `\u5DF2\u5220\u9664\uFF1A${items[0].name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u5220\u9664\u5931\u8D25\uFF1A${message}`, { error: message });
      await this.refreshPane(state.side, { force: true });
    }
  }
  async deleteImageGridPreview() {
    const imageGridState = this.imageGridState;
    if (imageGridState) {
      await this.deleteSelectedImageGridItems();
      return;
    }
    const state = this.imageGridState;
    const image = state?.images[state.selectedIndex];
    const device = state ? this.getPaneDevice(state.side) : void 0;
    if (!state || !image?.item.path || !device) {
      return;
    }
    if (!await this.showDialogConfirm("\u5220\u9664\u56FE\u7247", `\u5220\u9664 ${image.item.name}\uFF1F`, void 0, true)) {
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
    state.previewSamplingMode = "smooth";
    state.previewVisible = state.images.length > 0;
    this.imageGridPreviewRequestSeq++;
    this.imageGridRenderedRange = void 0;
    this.clearImageGridThumbnailQueue();
    this.clearImageGridPreviewPrefetchTimer();
    this.clearImageGridLoadedImageIndexes();
    this.imagePreviewAnalysis = void 0;
    this.clearImagePreviewRender();
    this.removePaneItemsFromState(state.side, [image.item]);
    const task = this.beginTask("delete", `Delete ${image.item.name}`, device.name);
    this.render();
    if (state.previewVisible) {
      void this.ensureImageGridPreviewLoaded(state, state.selectedIndex, this.imageGridPreviewRequestSeq);
      this.scheduleImageGridPreviewNeighborsLoaded(state, state.selectedIndex);
      this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(state.selectedIndex, state.images.length));
    }
    try {
      const result = await this.sshService.deletePath(await this.toTransferEndpoint(device, image.item.path), true);
      if (result.ok) {
        this.finishTask(task, "success", `Deleted: ${image.item.name}`);
      } else {
        this.finishTask(task, "error", `Delete failed: ${result.message}`, { error: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `Delete failed: ${message}`, { error: message });
    } finally {
      await this.refreshPane(state.side, { force: true });
    }
  }
  setImageGridColumns(columns) {
    if (!this.imageGridState) {
      return;
    }
    const nextColumns = this.normalizeImageGridColumns(columns);
    if (this.imageGridState.columns === nextColumns) {
      return;
    }
    this.imageGridState.columns = nextColumns;
    this.imageGridRenderedRange = void 0;
    this.clearImageGridThumbnailQueue();
    this.render();
  }
  setImageGridThumbnailScale(scale) {
    if (!this.imageGridState) {
      return;
    }
    const nextScale = this.normalizeImageGridThumbnailScale(scale);
    if (this.imageGridState.thumbnailScale === nextScale) {
      return;
    }
    this.imageGridState.thumbnailScale = nextScale;
    this.clearImageGridLayoutMetrics(this.imageGridState);
    this.imageGridRenderedRange = void 0;
    this.clearImageGridThumbnailQueue();
    this.clearImageGridLoadedImageIndexes();
    for (const image of this.imageGridState.images) {
      this.releaseImageBlobUrl(image.thumbnailUrl);
      image.thumbnailUrl = void 0;
      image.thumbnailContent = "";
      image.thumbnailLoading = false;
      image.thumbnailError = void 0;
    }
    this.render();
  }
  normalizeImageGridThumbnailScale(scale) {
    const rounded = Math.round(scale);
    return IMAGE_GRID_THUMBNAIL_SCALE_OPTIONS.includes(rounded) ? rounded : 1;
  }
  getImageGridScaleLabel(scale) {
    const normalized = this.normalizeImageGridThumbnailScale(scale);
    return normalized === 1 ? "1x" : `${normalized}x`;
  }
  normalizeImageGridStateColumns(state) {
    const nextColumns = this.normalizeImageGridColumns(state.columns);
    if (state.columns !== nextColumns) {
      state.columns = nextColumns;
      this.imageGridRenderedRange = void 0;
    }
  }
  setImageGridSort(key) {
    const state = this.imageGridState;
    if (!state) {
      return;
    }
    const nextDescending = state.sortKey === key ? !state.sortDescending : false;
    state.sortKey = key;
    state.sortDescending = nextDescending;
    this.imageGridSortKey = key;
    this.imageGridSortDescending = nextDescending;
    const selectedPath = state.images[state.selectedIndex]?.item.path;
    const selectedPaths = new Set(this.getImageGridSelectedImages(state).map(({ image }) => image.item.path).filter((path) => !!path));
    const anchorPath = state.selectionAnchorIndex !== void 0 ? state.images[state.selectionAnchorIndex]?.item.path : void 0;
    sortImageGridImages(state.images, key, nextDescending);
    state.selectedIndexes.clear();
    for (const [index, image] of state.images.entries()) {
      if (image.item.path && selectedPaths.has(image.item.path)) {
        state.selectedIndexes.add(index);
      }
    }
    if (selectedPath) {
      const nextIndex = state.images.findIndex((image) => image.item.path === selectedPath);
      if (nextIndex >= 0) {
        state.selectedIndex = nextIndex;
      }
    }
    if (!state.selectedIndexes.size && state.images[state.selectedIndex]) {
      state.selectedIndexes.add(state.selectedIndex);
    }
    const nextAnchorIndex = anchorPath ? state.images.findIndex((image) => image.item.path === anchorPath) : -1;
    state.selectionAnchorIndex = nextAnchorIndex >= 0 ? nextAnchorIndex : state.selectedIndex;
    this.imageGridRenderedRange = void 0;
    this.clearImageGridThumbnailQueue();
    this.clearImageGridLoadedImageIndexes();
    this.render();
  }
  getImageGridSortLabel(state) {
    return IMAGE_GRID_SORT_OPTIONS.find((option) => option.key === state.sortKey)?.label ?? "\u540D\u79F0";
  }
  getImagePreviewCaption(state) {
    const image = state.images[state.selectedIndex];
    if (!image) {
      return "";
    }
    const sizeText = image.width && image.height ? `\u539F\u56FE ${image.width}x${image.height}` : image.previewLoading ? "\u6B63\u5728\u52A0\u8F7D\u539F\u56FE" : "\u539F\u56FE";
    return `${image.item.name} (${state.selectedIndex + 1}/${state.images.length}) | ${sizeText}`;
  }
  getImageGridLoadIndexes(selectedIndex, total) {
    const indexes = /* @__PURE__ */ new Set();
    for (let offset = -IMAGE_GRID_NEIGHBOR_LOAD_COUNT; offset <= IMAGE_GRID_NEIGHBOR_LOAD_COUNT; offset++) {
      const index = selectedIndex + offset;
      if (index >= 0 && index < total) {
        indexes.add(index);
      }
    }
    return [...indexes];
  }
  scheduleImageGridThumbnailsLoaded(indexes) {
    const state = this.imageGridState;
    if (!state || !indexes.length || !this.container) {
      return;
    }
    const ownerWindow = getWindow(this.container);
    ownerWindow.requestAnimationFrame(() => {
      ownerWindow.setTimeout(() => {
        if (this.imageGridState === state && this.activePage === "images") {
          this.queueImageGridThumbnailLoads(state, indexes, true);
        }
      }, 0);
    });
  }
  scheduleImageGridPreviewNeighborsLoaded(state, index) {
    this.clearImageGridPreviewPrefetchTimer();
    if (!this.container || !state.images.length) {
      return;
    }
    this.imageGridPreviewPrefetchTimer = setTimeout(() => {
      this.imageGridPreviewPrefetchTimer = void 0;
      if (this.imageGridState !== state || this.activePage !== "images") {
        return;
      }
      for (let offset = 1; offset <= IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT; offset++) {
        const previous = (index - offset + state.images.length) % state.images.length;
        const next = (index + offset) % state.images.length;
        void this.ensureImageGridPreviewLoaded(state, previous, void 0, true);
        if (next !== previous) {
          void this.ensureImageGridPreviewLoaded(state, next, void 0, true);
        }
      }
    }, IMAGE_GRID_PREVIEW_PREFETCH_DELAY_MS);
  }
  async ensureImageGridThumbnailsLoaded(indexes) {
    const state = this.imageGridState;
    if (!state) {
      return;
    }
    this.queueImageGridThumbnailLoads(state, indexes, true);
  }
  queueImageGridThumbnailLoads(state, indexes, priority) {
    if (this.imageGridState !== state || this.activePage !== "images") {
      return;
    }
    const device = this.getPaneDevice(state.side);
    if (device && this.isRemoteSshImageDevice(device)) {
      void this.loadImageGridThumbnailsBatch(state, device, indexes);
      return;
    }
    const requests = [];
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
  async loadImageGridThumbnailsBatch(state, device, indexes) {
    const pending = [];
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
      let entries = [];
      try {
        const endpoint = await this.toTransferEndpoint(device, state.path ?? "/");
        entries = await this.sshService.readImageBatch(endpoint, chunk.map((target) => target.path));
      } catch {
        entries = [];
      }
      if (this.imageGridState !== state) {
        for (const target of chunk) {
          target.image.thumbnailLoading = false;
        }
        return;
      }
      const byPath = new Map(entries.map((entry) => [entry.path, entry]));
      for (const target of chunk) {
        target.image.thumbnailLoading = false;
        const entry = byPath.get(target.path);
        if (entry?.ok && entry.content) {
          if (!this.isImageGridIndexNearViewport(state, target.index)) {
            continue;
          }
          this.releaseImageBlobUrl(target.image.thumbnailUrl);
          target.image.thumbnailContent = "";
          target.image.thumbnailUrl = this.createBlobUrlFromBase64(entry.content, entry.mime ?? getMimeType(target.image.item.name));
          target.image.thumbnailMime = entry.mime ?? getMimeType(target.image.item.name);
          target.image.thumbnailError = void 0;
          this.imageGridLoadedThumbnailIndexes.add(target.index);
          this.updateImageGridCard(target.index);
        } else if (entry?.oversized) {
          void this.applySshThumbnailViaProtocol(state, device, target.index);
        } else {
          target.image.thumbnailError = entry?.message ?? "\u52A0\u8F7D\u5931\u8D25";
          this.updateImageGridCard(target.index);
        }
      }
    }
  }
  createBlobUrlFromBase64(content, mime) {
    try {
      const bytes = decodeBase64(content).buffer;
      const blobBytes = new Uint8Array(bytes.byteLength);
      blobBytes.set(bytes);
      const blob = new Blob([blobBytes.buffer], { type: mime || "application/octet-stream" });
      return URL.createObjectURL(blob);
    } catch {
      return void 0;
    }
  }
  async applySshThumbnailViaProtocol(state, device, index) {
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
    image.thumbnailContent = "";
    image.thumbnailUrl = result.ok ? result.url : void 0;
    image.thumbnailMime = result.mime || getMimeType(image.item.name);
    image.thumbnailError = result.ok ? void 0 : result.message;
    if (result.ok) {
      this.imageGridLoadedThumbnailIndexes.add(index);
    }
    this.updateImageGridCard(index);
  }
  processImageGridThumbnailQueue() {
    const state = this.imageGridState;
    if (!state || this.activePage !== "images") {
      return;
    }
    const limit = this.getImageGridThumbnailParallelLimit(state);
    const available = Math.max(0, limit - this.imageGridThumbnailLoadingCount);
    for (let started = 0; started < available && this.imageGridThumbnailQueue.length; ) {
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
  async runImageGridThumbnailRequest(request) {
    try {
      await this.loadImageGridThumbnail(request.state, request.index);
    } finally {
      this.imageGridThumbnailLoadingCount = Math.max(0, this.imageGridThumbnailLoadingCount - 1);
      this.processImageGridThumbnailQueue();
    }
  }
  shouldLoadImageGridThumbnail(state, index) {
    if (this.imageGridState !== state || this.activePage !== "images" || !this.isImageGridIndexNearViewport(state, index)) {
      return false;
    }
    const image = state.images[index];
    return !!image && !image.thumbnailUrl && !image.thumbnailContent && !image.thumbnailLoading && !image.thumbnailError;
  }
  async readImageGridImage(device, path, options) {
    const cacheKey = this.getImageReadCacheKey(device, path, options);
    const cached = this.imageReadCache.get(cacheKey);
    if (cached) {
      this.imageReadCache.delete(cacheKey);
      this.imageReadCache.set(cacheKey, cached);
      return {
        ok: true,
        message: "Image loaded from cache.",
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
  isRemoteSshImageDevice(device) {
    return device.id !== LOCAL_WINDOWS_DEVICE_ID;
  }
  async createImageGridResourceUrl(device, path, options) {
    return this.sshService.createImageResource(await this.toTransferEndpoint(device, path), options);
  }
  getImageReadCacheKey(device, path, options) {
    return JSON.stringify({
      device: device.id,
      host: device.host,
      port: device.port || 0,
      path,
      width: options.width || 0,
      height: options.height || 0,
      quality: options.quality || 0,
      format: options.format || "",
      forceOriginal: !!options.forceOriginal,
      sourceSize: options.sourceSize || 0,
      sourceModified: options.sourceModified || 0
    });
  }
  trimImageReadCache() {
    while (this.imageReadCache.size > IMAGE_READ_CACHE_MAX_ENTRIES) {
      const firstKey = this.imageReadCache.keys().next().value;
      if (!firstKey) {
        return;
      }
      this.imageReadCache.delete(firstKey);
    }
  }
  createImageObjectUrl(result) {
    if (!result.ok) {
      return void 0;
    }
    try {
      let bytes;
      if (result.buffer) {
        bytes = result.buffer.buffer;
      } else if (result.content) {
        bytes = decodeBase64(result.content).buffer;
      } else {
        return void 0;
      }
      const blobBytes = new Uint8Array(bytes.byteLength);
      blobBytes.set(bytes);
      const blob = new Blob([blobBytes.buffer], { type: result.mime || "application/octet-stream" });
      return URL.createObjectURL(blob);
    } catch {
      return void 0;
    }
  }
  async loadImageGridThumbnail(state, index) {
    const image = state.images[index];
    const device = this.getPaneDevice(state.side);
    if (!image?.item.path || !device || this.imageGridState !== state || !this.isImageGridIndexNearViewport(state, index)) {
      return;
    }
    try {
      const requestWidth = this.getImageGridThumbnailRequestWidth(state);
      if (this.isRemoteSshImageDevice(device)) {
        const result2 = await this.createImageGridResourceUrl(device, image.item.path, createTurboFileImageGridResourceOptions(requestWidth, image.item.rawSize, image.item.rawModified));
        if (this.imageGridState !== state || !this.isImageGridIndexNearViewport(state, index)) {
          if (result2.url) {
            this.releaseImageBlobUrl(result2.url);
          }
          return;
        }
        this.releaseImageBlobUrl(image.thumbnailUrl);
        image.thumbnailContent = "";
        image.thumbnailUrl = result2.ok ? result2.url : void 0;
        image.thumbnailMime = result2.mime || getMimeType(image.item.name);
        image.thumbnailError = result2.ok ? void 0 : result2.message;
        if (result2.ok) {
          this.imageGridLoadedThumbnailIndexes.add(index);
        }
        this.updateImageGridCard(index);
        return;
      }
      const shouldReadOriginalFirst = this.shouldUseOriginalImageGridCardSource(image.width, image.height);
      let result = shouldReadOriginalFirst ? await this.readImageGridImage(device, image.item.path, {
        encoding: "base64",
        forceOriginal: true,
        sourceSize: image.item.rawSize,
        sourceModified: image.item.rawModified
      }) : await this.readImageGridImage(device, image.item.path, {
        encoding: "base64",
        width: requestWidth,
        quality: IMAGE_GRID_THUMB_QUALITY,
        format: "webp",
        interpolation: "lanczos",
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
          encoding: "base64",
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
      const thumbnailUrl = result.ok ? this.createImageObjectUrl(result) : void 0;
      image.thumbnailContent = thumbnailUrl ? "" : result.ok ? result.content : "";
      image.thumbnailUrl = thumbnailUrl;
      image.thumbnailMime = result.mime || getMimeType(image.item.name);
      image.thumbnailError = result.ok ? void 0 : result.message;
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
  async ensureImageGridPreviewLoaded(state, index, requestSeq, silent = false) {
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
        const result2 = await this.createImageGridResourceUrl(device, image.item.path, createTurboFileImagePreviewResourceOptions(this.isWindowsDevice(device), request, image.item.rawSize, image.item.rawModified));
        if (this.imageGridState !== state || !this.shouldKeepImageGridPreview(state, index)) {
          if (result2.url) {
            this.releaseImageBlobUrl(result2.url);
          }
          return;
        }
        this.releaseImageBlobUrl(image.previewUrl);
        image.previewContent = "";
        image.previewUrl = result2.ok ? result2.url : void 0;
        image.previewMime = result2.mime || getMimeType(image.item.name);
        image.previewError = result2.ok ? void 0 : result2.message;
        if (result2.ok) {
          this.imageGridLoadedPreviewIndexes.add(index);
          await this.ensureImagePreviewElementLoaded(state, index);
        }
        return;
      }
      const result = await this.readImageGridImage(device, image.item.path, {
        encoding: "base64",
        width: request.width,
        height: request.height,
        quality: request.quality,
        format: "jpeg",
        interpolation: "lanczos",
        maxBytes: 128 * 1024 * 1024,
        sourceSize: image.item.rawSize,
        sourceModified: image.item.rawModified
      });
      if (this.imageGridState !== state || !this.shouldKeepImageGridPreview(state, index)) {
        return;
      }
      this.releaseImageBlobUrl(image.previewUrl);
      const previewUrl = result.ok ? this.createImageObjectUrl(result) : void 0;
      image.previewContent = previewUrl ? "" : result.ok ? result.content : "";
      image.previewUrl = previewUrl;
      image.previewMime = result.mime || getMimeType(image.item.name);
      image.previewError = result.ok ? void 0 : result.message;
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
  finishImageGridPreviewLoad(state, index, requestSeq, silent = false) {
    if (this.imageGridState !== state) {
      return;
    }
    if (state.previewPendingIndex === index && state.previewPendingRequestSeq !== void 0 && this.commitImageGridPreviewIndexIfReady(state, index, state.previewPendingRequestSeq)) {
      this.scheduleImageGridPreviewNeighborsLoaded(state, index);
      return;
    }
    if (!silent && state.selectedIndex === index && (!requestSeq || requestSeq === this.imageGridPreviewRequestSeq)) {
      this.updateImagePreviewOverlay();
      this.scheduleImageGridPreviewNeighborsLoaded(state, index);
    }
  }
  bindImageGridObserver() {
    if (this.activePage !== "images" || !this.imageGridState || !this.container) {
      this.disposeImageGridObserver();
      return;
    }
    const body = this.container.querySelector(".turbofile-image-page-body");
    if (!body || !("IntersectionObserver" in getWindow(this.container))) {
      return;
    }
    this.disposeImageGridObserver();
    this.imageGridObserver = new IntersectionObserver((entries) => {
      const state = this.imageGridState;
      if (!state) {
        return;
      }
      const visibleIndexes2 = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const value = Number(entry.target.dataset.imageIndex);
        if (Number.isFinite(value)) {
          visibleIndexes2.push(value);
          this.imageGridObserver?.unobserve(entry.target);
        }
      }
      if (visibleIndexes2.length) {
        void this.ensureImageGridThumbnailsLoaded(visibleIndexes2);
      }
    }, {
      root: body,
      rootMargin: "320px",
      threshold: 0.01
    });
    const visibleIndexes = [];
    for (const card of Array.from(this.container.querySelectorAll(".turbofile-image-page-card[data-image-index]"))) {
      this.imageGridObserver.observe(card);
      const value = Number(card.dataset.imageIndex);
      if (Number.isFinite(value)) {
        visibleIndexes.push(value);
      }
    }
    if (visibleIndexes.length) {
      this.scheduleImageGridThumbnailsLoaded(visibleIndexes);
    }
  }
  disposeImageGridObserver() {
    if (!this.imageGridObserver) {
      return;
    }
    this.imageGridObserver.disconnect();
    this.imageGridObserver = void 0;
  }
  updateImageGridCard(index) {
    if (!this.container || this.activePage !== "images") {
      return;
    }
    const card = this.container.querySelector(`.turbofile-image-page-card[data-image-index="${index}"]`);
    const state = this.imageGridState;
    const image = state?.images[index];
    if (!card || !image) {
      return;
    }
    const preview = card.querySelector(".turbofile-image-page-card-preview");
    if (!preview) {
      return;
    }
    clearNode(preview);
    const cardSize = this.getImageGridCardSize(state, image);
    this.applyImageGridCardPreviewSize(preview, cardSize);
    const thumbnailSrc = image.thumbnailUrl || (image.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : "");
    if (thumbnailSrc) {
      const thumb = document.createElement("img");
      thumb.loading = "eager";
      thumb.decoding = "async";
      this.applyImageGridCardImageSize(thumb, cardSize);
      thumb.addEventListener("error", () => this.handleImageGridThumbnailError(state, index));
      thumb.src = thumbnailSrc;
      thumb.alt = image.item.name;
      preview.appendChild(thumb);
    } else {
      const placeholder = $(".turbofile-image-page-card-placeholder");
      placeholder.appendChild(renderIcon(Codicon.fileMedia));
      preview.appendChild(placeholder);
    }
    this.appendImageGridCardChrome(preview, image, index);
  }
  getImageGridDefaultViewportHeight() {
    const height = this.container?.clientHeight ?? 0;
    return Math.max(480, height - 44);
  }
  getImageGridEffectiveColumns(state) {
    const base = Math.max(1, state.columns);
    return getTurboFileImageGridEffectiveColumns(base, this.getImageGridBodyWidth(), this.getImageGridMaxCardWidth(state), IMAGE_GRID_CARD_GAP);
  }
  getImageGridVirtualRange(state) {
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
  getImageGridRowHeight(state) {
    return this.getImageGridLayoutMetrics(state).rowHeight;
  }
  getImageGridMaxCardWidth(state) {
    return this.getImageGridLayoutMetrics(state).maxCardWidth;
  }
  getImageGridMaxImageWidth(state) {
    return this.getImageGridLayoutMetrics(state).maxImageWidth;
  }
  getImageGridBaseCardWidth(state) {
    const columns = Math.max(1, state.columns);
    const width = this.getImageGridBodyWidth();
    const available = width - IMAGE_GRID_CARD_GAP * Math.max(0, columns - 1);
    return Math.max(IMAGE_GRID_THUMB_MIN, available / columns);
  }
  getImageGridBasePreviewHeight(state) {
    return this.getImageGridBaseCardWidth(state) * 150 / 220;
  }
  getImageGridLayoutMetrics(state) {
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
  clearImageGridLayoutMetrics(state) {
    if (!state || this.imageGridLayoutMetrics?.state === state) {
      this.imageGridLayoutMetrics = void 0;
    }
  }
  getImageGridBodyWidth() {
    if (this.imageGridBodyWidthCache !== void 0) {
      return this.imageGridBodyWidthCache;
    }
    const body = this.container?.querySelector(".turbofile-image-page-body");
    const measured = body?.clientWidth ?? 0;
    const width = measured > 0 ? Math.max(320, measured - 28) : Math.max(320, (this.container?.clientWidth ?? 1440) - 28);
    this.imageGridBodyWidthCache = width;
    return width;
  }
  invalidateImageGridBodyWidthCache() {
    this.imageGridBodyWidthCache = void 0;
  }
  getImageGridThumbnailRequestWidth(state) {
    const ownerWindow = this.container?.ownerDocument.defaultView;
    const dpr = Math.min(IMAGE_DPR_CAP, ownerWindow?.devicePixelRatio || 1);
    const scaled = Math.round(this.getImageGridMaxImageWidth(state) * dpr);
    return clampNumber(quantizeNumber(scaled, IMAGE_GRID_THUMB_STEP), IMAGE_GRID_THUMB_MIN, IMAGE_GRID_THUMB_MAX);
  }
  shouldUseOriginalImageGridCardSource(width, height) {
    return !!width && !!height && width <= IMAGE_GRID_ORIGINAL_CARD_DIMENSION_THRESHOLD && height <= IMAGE_GRID_ORIGINAL_CARD_DIMENSION_THRESHOLD;
  }
  getImagePreviewRequestSize() {
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
  getImageGridThumbnailParallelLimit(state) {
    const device = this.getPaneDevice(state.side);
    if (!device || device.id === LOCAL_WINDOWS_DEVICE_ID) {
      return IMAGE_GRID_LOCAL_PARALLEL_LIMIT;
    }
    return device.platform === "windows" ? IMAGE_GRID_REMOTE_WINDOWS_PARALLEL_LIMIT : IMAGE_GRID_REMOTE_PARALLEL_LIMIT;
  }
  handleImageGridScroll(body) {
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
      if (this.activePage !== "images" || this.imageGridState !== state) {
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
  handleImageGridWheel(event, body) {
    const state = this.imageGridState;
    if (!state || !event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    const deltaModeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? Math.max(body.clientHeight, IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD) : 1;
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
  normalizeImageGridColumns(columns) {
    const rounded = Math.round(columns);
    return clampNumber(rounded, IMAGE_GRID_COLUMN_MIN, this.getImageGridMaxColumns());
  }
  getImageGridMaxColumns() {
    const width = this.getImageGridBodyWidth();
    return Math.max(IMAGE_GRID_COLUMN_MIN, Math.floor((width + IMAGE_GRID_CARD_GAP) / (IMAGE_GRID_THUMB_MIN + IMAGE_GRID_CARD_GAP)));
  }
  updateImageGridVirtualSlice(state, range) {
    if (!this.container || this.imageGridState !== state || this.activePage !== "images") {
      return;
    }
    const grid = this.container.querySelector(".turbofile-image-page-grid");
    if (!grid) {
      return;
    }
    const body = this.container.querySelector(".turbofile-image-page-body");
    const scrollTopBeforeRender = body ? body.scrollTop : state.scrollTop;
    this.renderImageGridSlice(grid, state, range);
    if (body && body.scrollTop < scrollTopBeforeRender) {
      body.scrollTop = scrollTopBeforeRender;
      state.scrollTop = scrollTopBeforeRender;
    }
  }
  clearImageGridScrollTimer() {
    if (!this.imageGridScrollRenderTimer) {
      return;
    }
    clearTimeout(this.imageGridScrollRenderTimer);
    this.imageGridScrollRenderTimer = void 0;
  }
  clearImageGridScrollRaf() {
    if (!this.imageGridScrollRaf || !this.container) {
      this.imageGridScrollRaf = 0;
      return;
    }
    getWindow(this.container).cancelAnimationFrame(this.imageGridScrollRaf);
    this.imageGridScrollRaf = 0;
  }
  clearImageGridPreviewPrefetchTimer() {
    if (!this.imageGridPreviewPrefetchTimer) {
      return;
    }
    clearTimeout(this.imageGridPreviewPrefetchTimer);
    this.imageGridPreviewPrefetchTimer = void 0;
  }
  getImageGridVisibleIndexes(state) {
    const rendered = this.imageGridRenderedRange;
    const range = this.imageGridState === state && rendered && rendered.columns === this.getImageGridEffectiveColumns(state) && rendered.total === state.images.length ? { startIndex: rendered.startIndex, endIndex: rendered.endIndex } : this.getImageGridVirtualRange(state);
    const indexes = [];
    for (let index = range.startIndex; index < range.endIndex; index++) {
      indexes.push(index);
    }
    return indexes;
  }
  trimImageGridThumbnailQueue(state) {
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
  clearImageGridThumbnailQueue() {
    this.imageGridThumbnailQueue.length = 0;
    this.imageGridThumbnailQueued.clear();
  }
  clearImageGridLoadedImageIndexes() {
    this.imageGridLoadedThumbnailIndexes.clear();
    this.imageGridLoadedPreviewIndexes.clear();
  }
  isImageGridIndexNearViewport(state, index) {
    const rendered = this.imageGridRenderedRange;
    if (this.imageGridState === state && rendered && rendered.columns === this.getImageGridEffectiveColumns(state) && rendered.total === state.images.length) {
      return index >= rendered.startIndex && index < rendered.endIndex;
    }
    const range = this.getImageGridVirtualRange(state);
    return index >= range.startIndex && index < range.endIndex;
  }
  releaseImageGridImagesOutsideRange(state, range) {
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
        image.thumbnailUrl = void 0;
        image.thumbnailContent = "";
        image.thumbnailError = void 0;
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
        image.previewUrl = void 0;
        image.previewContent = "";
        image.previewError = void 0;
        image.previewImage = void 0;
        image.previewImageKey = void 0;
        image.previewImageLoading = void 0;
        image.previewImageLoadingKey = void 0;
        this.imageGridLoadedPreviewIndexes.delete(index);
      }
    }
  }
  releaseImageGridImage(image) {
    this.releaseImageBlobUrl(image.thumbnailUrl);
    this.releaseImageBlobUrl(image.previewUrl);
    image.thumbnailUrl = void 0;
    image.thumbnailContent = "";
    image.thumbnailLoading = false;
    image.thumbnailError = void 0;
    image.previewUrl = void 0;
    image.previewContent = "";
    image.previewLoading = false;
    image.previewError = void 0;
    image.previewImage = void 0;
    image.previewImageKey = void 0;
    image.previewImageLoading = void 0;
    image.previewImageLoadingKey = void 0;
  }
  releaseImageGridStateImages(state) {
    if (!state) {
      return;
    }
    for (const image of state.images) {
      this.releaseImageGridImage(image);
    }
  }
  getImageGridCircularDistance(state, index, selectedIndex) {
    if (!state.images.length) {
      return Number.MAX_SAFE_INTEGER;
    }
    const distance = Math.abs(index - selectedIndex);
    return Math.min(distance, state.images.length - distance);
  }
  shouldKeepImageGridPreview(state, index) {
    if (this.imageGridState !== state || !state.previewVisible) {
      return false;
    }
    if (this.getImageGridCircularDistance(state, index, state.selectedIndex) <= IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT) {
      return true;
    }
    return state.previewPendingIndex !== void 0 && this.getImageGridCircularDistance(state, index, state.previewPendingIndex) <= IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT;
  }
  getImageGridQueueKey(state, index) {
    return `${state.side}|${state.path}|${index}`;
  }
  handleImageGridThumbnailError(state, index) {
    if (this.imageGridState !== state) {
      return;
    }
    const image = state.images[index];
    if (!image) {
      return;
    }
    image.thumbnailUrl = void 0;
    image.thumbnailContent = "";
    image.thumbnailError = "\u7F29\u7565\u56FE\u89E3\u7801\u5931\u8D25";
    this.updateImageGridCard(index);
  }
  getImageGridSelectedIndexes(state) {
    for (const index of Array.from(state.selectedIndexes)) {
      if (index < 0 || index >= state.images.length) {
        state.selectedIndexes.delete(index);
      }
    }
    return Array.from(state.selectedIndexes).sort((a, b) => a - b);
  }
  getImageGridSelectedImages(state) {
    return this.getImageGridSelectedIndexes(state).map((index) => ({ index, image: state.images[index] })).filter((entry) => !!entry.image);
  }
  getImageGridDeleteTargets(state) {
    const selected = this.getImageGridSelectedImages(state);
    if (selected.length) {
      return selected;
    }
    const image = state.images[state.selectedIndex];
    return image ? [{ index: state.selectedIndex, image }] : [];
  }
  updateImageGridSelection() {
    const state = this.imageGridState;
    if (!this.container || !state) {
      return;
    }
    const selectedIndexes = new Set(this.getImageGridSelectedIndexes(state));
    for (const card of Array.from(this.container.querySelectorAll(".turbofile-image-page-card[data-image-index]"))) {
      const index = Number(card.dataset.imageIndex);
      const selected = Number.isFinite(index) && selectedIndexes.has(index);
      card.classList.toggle("is-selected", selected);
      card.classList.toggle("is-focused", Number.isFinite(index) && state.selectedIndex === index);
      card.setAttribute("aria-selected", selected ? "true" : "false");
    }
    const deleteButton = this.container.querySelector(".turbofile-image-page-action.is-delete");
    if (deleteButton) {
      const deleteTargetCount = this.getImageGridDeleteTargets(state).length;
      deleteButton.disabled = deleteTargetCount === 0;
      deleteButton.title = deleteTargetCount ? "\u5220\u9664\u9009\u4E2D\u56FE\u7247" : "\u8BF7\u5148\u9009\u62E9\u8981\u5220\u9664\u7684\u56FE\u7247";
    }
    const meta = this.container.querySelector(".turbofile-task-meta");
    if (meta && !this.tasks[0]) {
      meta.textContent = this.statusMessage;
    }
    this.refreshTaskbar();
  }
  updateImageGridSelectionStatus(state) {
    const selectedCount = this.getImageGridSelectedIndexes(state).length;
    if (selectedCount > 1) {
      this.statusMessage = `\u5DF2\u9009\u62E9 ${selectedCount} \u5F20\u56FE\u7247\uFF0C\u53EF\u6309 Delete \u5220\u9664\u3002`;
      return;
    }
    if (selectedCount === 0) {
      this.statusMessage = "\u672A\u9009\u62E9\u56FE\u7247\u3002";
      return;
    }
    const image = state.images[state.selectedIndex];
    this.statusMessage = image ? `\u5DF2\u9009\u62E9\u56FE\u7247\uFF1A${image.item.name}` : "\u8BF7\u5148\u9009\u62E9\u8981\u5220\u9664\u7684\u56FE\u7247\u3002";
  }
  releaseImageBlobUrl(url) {
    if (!url) {
      return;
    }
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
      return;
    }
    if (url.startsWith("turbofile-image:")) {
      void this.sshService.releaseImageResource(url);
    }
  }
  ensureRemoteFileSystemProvider() {
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
  ensureRemoteDocumentLabelFormatter() {
    if (this.remoteDocumentLabelFormatterRegistered) {
      return;
    }
    this.remoteDocumentLabelFormatterRegistered = true;
    this._register(this.labelService.registerFormatter({
      scheme: TURBOFILE_REMOTE_DOCUMENT_SCHEME,
      formatting: {
        label: "${path}",
        separator: "/",
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
  getDocumentEditorTargetIndex() {
    const editors = this.group?.editors;
    if (!editors || editors.length === 0) {
      return void 0;
    }
    let index = 0;
    for (let i = 0; i < editors.length; i++) {
      if (editors[i] instanceof TurboFileEditorInput) {
        index = i + 1;
      }
    }
    return index;
  }
  async openNativeDocument(side, item, device) {
    if (!item.path) {
      return;
    }
    if (this.imageGridState) {
      this.closeImageGridPage();
    }
    const reportOpenError = (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u6253\u5F00\u5931\u8D25\uFF1A${message}`;
      this.render();
    };
    try {
      const resource = device.id === LOCAL_WINDOWS_DEVICE_ID ? URI.file(item.path) : this.ensureRemoteFileSystemProvider().registerFile(device, this.getSshConnectionOptions(device), item);
      const editorInput = {
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
      this.ensureDocumentTabRightOfTransfer(pane?.group, pane?.input);
    } catch (error) {
      reportOpenError(error);
    }
  }
  /**
   * Guarantees the "transfer pages on the left, documents on the right" tab order: if the opened
   * document ended up to the left of any TurboFile transfer page in its group, move it to the end.
   */
  ensureDocumentTabRightOfTransfer(group, input) {
    if (!group || !input) {
      return;
    }
    const editors = group.editors;
    const currentIndex = editors.indexOf(input);
    if (currentIndex < 0) {
      return;
    }
    const hasTransferToRight = editors.slice(currentIndex + 1).some((editor) => editor instanceof TurboFileEditorInput);
    if (hasTransferToRight) {
      group.moveEditor(input, group, { index: editors.length - 1 });
    }
  }
  async compressSelected(side) {
    const item = this.getSelectedItem(side);
    const device = this.getPaneDevice(side);
    if (!item?.path || !device || item.parent) {
      this.statusMessage = "\u8BF7\u5148\u9009\u62E9\u8981\u538B\u7F29\u7684\u6587\u4EF6\u6216\u76EE\u5F55\u3002";
      this.render();
      return;
    }
    if (!await this.showDialogConfirm("\u538B\u7F29\u786E\u8BA4", `\u786E\u5B9A\u538B\u7F29 ${item.name} \u5417\uFF1F`, "\u538B\u7F29\u8FDB\u5EA6\u4F1A\u663E\u793A\u5728\u5E95\u90E8\u4EFB\u52A1\u533A\u57DF\u3002")) {
      return;
    }
    const task = this.beginTask("compress", `\u538B\u7F29 ${item.name}`, device.name);
    try {
      const result = await this.sshService.compressPath(await this.toTransferEndpoint(device, item.path));
      this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
      if (result.ok) {
        this.finishTask(task, "success", `\u538B\u7F29\u5B8C\u6210\uFF1A${item.name}`);
      } else {
        this.finishTask(task, "error", `\u538B\u7F29\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u538B\u7F29\u5931\u8D25\uFF1A${message}`, { error: message });
    } finally {
      await this.refreshPane(side, { force: true });
    }
  }
  async extractSelected(side) {
    const item = this.getSelectedItem(side);
    const device = this.getPaneDevice(side);
    if (!item?.path || !device || item.parent || item.directory) {
      this.statusMessage = "\u8BF7\u5148\u9009\u62E9\u8981\u89E3\u538B\u7684\u5F52\u6863\u6587\u4EF6\u3002";
      this.render();
      return;
    }
    if (!isArchiveFile(item.name)) {
      this.statusMessage = "\u5F53\u524D\u6587\u4EF6\u4E0D\u662F\u652F\u6301\u7684\u5F52\u6863\u683C\u5F0F\u3002";
      this.render();
      return;
    }
    if (!await this.showDialogConfirm("\u89E3\u538B\u786E\u8BA4", `\u786E\u5B9A\u89E3\u538B ${item.name} \u5417\uFF1F`, "\u89E3\u538B\u8FDB\u5EA6\u4F1A\u663E\u793A\u5728\u5E95\u90E8\u4EFB\u52A1\u533A\u57DF\u3002")) {
      return;
    }
    const task = this.beginTask("extract", `\u89E3\u538B ${item.name}`, device.name);
    try {
      const result = await this.sshService.extractPath(await this.toTransferEndpoint(device, item.path));
      this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
      if (result.ok) {
        this.finishTask(task, "success", `\u89E3\u538B\u5B8C\u6210\uFF1A${item.name}`);
      } else {
        this.finishTask(task, "error", `\u89E3\u538B\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u89E3\u538B\u5931\u8D25\uFF1A${message}`, { error: message });
    } finally {
      await this.refreshPane(side, { force: true });
    }
  }
  async copyPanePath(side) {
    const device = this.getPaneDevice(side);
    const windowsPath = !!device && this.isWindowsDevice(device);
    const path = this.formatPanePathForDisplay(this.paneStates[side].path, windowsPath);
    await this.clipboardService.writeText(path);
    this.statusMessage = `\u5DF2\u590D\u5236\u5F53\u524D\u8DEF\u5F84\uFF1A${path}`;
    this.render();
  }
  async copySelectedPath(side) {
    const item = this.getSelectedItem(side);
    const device = this.getPaneDevice(side);
    if (!item?.path || !device || item.parent) {
      this.statusMessage = "\u8BF7\u5148\u9009\u62E9\u8981\u590D\u5236\u8DEF\u5F84\u7684\u6587\u4EF6\u6216\u76EE\u5F55\u3002";
      this.render();
      return;
    }
    const path = this.formatPanePathForDisplay(item.path, this.isWindowsDevice(device));
    await this.clipboardService.writeText(path);
    this.statusMessage = `\u5DF2\u590D\u5236\u8DEF\u5F84\uFF1A${path}`;
    await this.refreshPane(side, { force: true });
    this.render();
  }
  async calculateSelectedSize(side) {
    const item = this.getSelectedItem(side);
    const device = this.getPaneDevice(side);
    if (!item?.path || !device || item.parent) {
      this.statusMessage = "\u8BF7\u5148\u9009\u62E9\u8981\u8BA1\u7B97\u5927\u5C0F\u7684\u6587\u4EF6\u6216\u76EE\u5F55\u3002";
      this.render();
      return;
    }
    const displayPath = this.formatPanePathForDisplay(item.path, this.isWindowsDevice(device));
    const task = this.beginTask("size", `\u8BA1\u7B97\u5927\u5C0F ${item.name}`, device.name);
    try {
      const result = await this.sshService.calculatePathSize(await this.toTransferEndpoint(device, item.path));
      this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
      if (result.ok) {
        const sizeText = result.humanSize ?? formatSize(result.size);
        this.finishTask(task, "success", `${item.name} \u5927\u5C0F\uFF1A${sizeText}`);
        this.showDialogInfo("\u8BA1\u7B97\u5927\u5C0F\u5B8C\u6210", `${item.name} \u5927\u5C0F\uFF1A${sizeText}`, `\u8BBE\u5907\uFF1A${device.name}
\u8DEF\u5F84\uFF1A${displayPath}`);
      } else {
        this.finishTask(task, "error", `\u8BA1\u7B97\u5927\u5C0F\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
        this.showDialogInfo("\u8BA1\u7B97\u5927\u5C0F\u5931\u8D25", result.message, `\u8BBE\u5907\uFF1A${device.name}
\u8DEF\u5F84\uFF1A${displayPath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u8BA1\u7B97\u5927\u5C0F\u5931\u8D25\uFF1A${message}`, { error: message });
      this.showDialogInfo("\u8BA1\u7B97\u5927\u5C0F\u5931\u8D25", message, `\u8BBE\u5907\uFF1A${device.name}
\u8DEF\u5F84\uFF1A${displayPath}`);
    } finally {
      await this.refreshPane(side, { force: true });
    }
  }
  async searchInPane(side) {
    const keyword = (await this.quickInputService.input({
      title: "\u9012\u5F52\u67E5\u627E",
      placeHolder: "\u8F93\u5165\u6587\u4EF6\u540D\u3001\u76EE\u5F55\u540D\u6216\u5173\u952E\u5B57",
      prompt: `\u641C\u7D22${this.getSideLabel(side)}\u5F53\u524D\u5DF2\u52A0\u8F7D\u76EE\u5F55`
    }))?.trim();
    if (!keyword) {
      return;
    }
    const normalizedKeyword = keyword.toLowerCase();
    const state = this.paneStates[side];
    const matches = state.items.filter((item) => !item.parent && item.path && item.name.toLowerCase().includes(normalizedKeyword));
    if (!matches.length) {
      this.statusMessage = `\u5F53\u524D\u76EE\u5F55\u672A\u627E\u5230\uFF1A${keyword}`;
      this.render();
      return;
    }
    let target = matches[0];
    if (matches.length > 1) {
      const device = this.getPaneDevice(side);
      const windowsPath = !!device && this.isWindowsDevice(device);
      const picks = matches.slice(0, 80).map((item) => ({
        label: item.name,
        description: item.directory ? "\u6587\u4EF6\u5939" : item.size,
        detail: this.formatPanePathForDisplay(item.path ?? "", windowsPath),
        item
      }));
      const picked = await this.quickInputService.pick(picks, {
        title: "\u641C\u7D22\u7ED3\u679C",
        placeHolder: `\u627E\u5230 ${matches.length} \u9879\uFF0C\u9009\u62E9\u8981\u5B9A\u4F4D\u7684\u6587\u4EF6\u6216\u6587\u4EF6\u5939`
      });
      if (!picked) {
        return;
      }
      target = picked.item;
    }
    this.revealPaneItem(side, target, `\u5DF2\u5B9A\u4F4D\uFF1A${target.name}`);
  }
  revealPaneItem(side, item, message) {
    if (!item.path) {
      return;
    }
    const state = this.paneStates[side];
    const index = this.getVisibleFileItems(state).findIndex((candidate) => candidate.path === item.path);
    if (index >= 0) {
      state.scrollTop = Math.max(0, (index - 4) * FILE_LIST_ROW_HEIGHT);
      this.fileListRenderedRange[side] = void 0;
    }
    this.setSingleSelection(side, item);
    this.statusMessage = message;
    this.render();
  }
  async openTerminal(side) {
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
        const instance2 = await this.createAndRevealTerminal({
          cwd: state.path,
          location: TerminalLocation.Panel,
          config: defaultProfile ? {
            ...defaultProfile,
            profileName: title,
            overrideName: true,
            icon: defaultProfile.icon ?? Codicon.terminal
          } : void 0
        });
        this.bindTerminalToPage(pageInstanceId, instance2);
        await this.revealBoundTerminalsForPage(pageInstanceId, instance2, true);
        this.statusMessage = `\u5DF2\u6253\u5F00\u672C\u5730\u7EC8\u7AEF\uFF1A${title}`;
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
      this.statusMessage = `\u5DF2\u6253\u5F00\u5185\u7F6E SSH \u7EC8\u7AEF\uFF1A${title}`;
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.restoreTaskbarAfterTerminal();
      this.statusMessage = device.id === LOCAL_WINDOWS_DEVICE_ID ? `\u6253\u5F00\u672C\u5730\u7EC8\u7AEF\u5931\u8D25\uFF1A${message}` : `\u6253\u5F00 SSH \u7EC8\u7AEF\u5931\u8D25\uFF1A${message}`;
      this.render();
    } finally {
      this.terminalRevealInProgress = false;
    }
  }
  restoreTaskbarAfterTerminal() {
    if (!this.taskbarHiddenForTerminal) {
      return;
    }
    this.taskbarHiddenForTerminal = false;
    if (this.activePage === "transfer") {
      this.render();
    }
  }
  rememberTerminalPanelHiddenForCurrentPage() {
    if (!this.isEditorVisible) {
      return;
    }
    const pageInstanceId = this.currentInput?.instanceId;
    if (!pageInstanceId || this.getBoundTerminalsForPage(pageInstanceId).length === 0) {
      return;
    }
    turboFileTerminalPanelHiddenByPageId.add(pageInstanceId);
  }
  beginTerminalPanelVisibilityChange() {
    if (this.terminalPanelVisibilityResetHandle !== void 0) {
      getWindow(this.container).clearTimeout(this.terminalPanelVisibilityResetHandle);
      this.terminalPanelVisibilityResetHandle = void 0;
    }
    this.terminalPanelVisibilityChangeDepth++;
    this.terminalPanelVisibilityInProgress = true;
  }
  endTerminalPanelVisibilityChange() {
    this.terminalPanelVisibilityChangeDepth = Math.max(0, this.terminalPanelVisibilityChangeDepth - 1);
    if (this.terminalPanelVisibilityChangeDepth > 0) {
      return;
    }
    this.terminalPanelVisibilityResetHandle = getWindow(this.container).setTimeout(() => {
      this.terminalPanelVisibilityResetHandle = void 0;
      if (this.terminalPanelVisibilityChangeDepth === 0) {
        this.terminalPanelVisibilityInProgress = false;
      }
    }, 100);
  }
  bindTerminalToPage(pageInstanceId, instance) {
    this.clearTerminalBindingForInstance(instance.instanceId);
    turboFileTerminalPageByTerminalId.set(instance.instanceId, pageInstanceId);
    turboFileLastActiveTerminalByPageId.set(pageInstanceId, instance.instanceId);
  }
  getBoundTerminalsForPage(pageInstanceId) {
    const instances = [];
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
  getBoundTerminalsForOtherPages(pageInstanceId) {
    const instances = [];
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
  async revealBoundTerminalsForPage(pageInstanceId, activeInstance, focus) {
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
      const lastActiveInstance = lastActiveTerminalId !== void 0 ? pageTerminals.find((instance) => instance.instanceId === lastActiveTerminalId) : void 0;
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
  async syncActiveTerminalForCurrentPage() {
    if (!this.isEditorVisible) {
      return;
    }
    const pageInstanceId = this.currentInput?.instanceId;
    if (!pageInstanceId) {
      return;
    }
    await this.revealBoundTerminalsForPage(pageInstanceId, void 0, false);
  }
  clearTerminalBindingForInstance(terminalInstanceId) {
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
  async createAndRevealTerminal(options) {
    const instance = await this.terminalService.createTerminal(options);
    this.terminalService.setActiveInstance(instance);
    await this.terminalService.focusInstance(instance);
    return instance;
  }
  getTerminalTitle(side, device) {
    return `\u6781\u901F\u4F20 ${this.getSideLabel(side)} ${this.getDeviceDisplayLabel(device)}`;
  }
  async syncSelectedDirectories() {
    const leftDevice = this.getPaneDevice("left");
    const rightDevice = this.getPaneDevice("right");
    if (!leftDevice || !rightDevice) {
      this.statusMessage = "\u8BF7\u5148\u5728\u5DE6\u53F3\u4E24\u4FA7\u9009\u62E9\u53EF\u7528\u8BBE\u5907\u3002";
      this.render();
      return;
    }
    const task = this.beginTask("sync", "\u540C\u6B65\u5F53\u524D\u76EE\u5F55", `${leftDevice.name} <-> ${rightDevice.name}`);
    try {
      this.updateTask(task, "\u6B63\u5728\u626B\u63CF\u540C\u6B65\u5DEE\u5F02...", 8);
      const plan = await this.buildSyncPlan(task);
      if (!plan.length) {
        this.finishTask(task, "success", "\u4E24\u4FA7\u540C\u6B65\u8303\u56F4\u5DF2\u7ECF\u4E00\u81F4\u3002");
        return;
      }
      this.updateTask(task, "\u7B49\u5F85\u786E\u8BA4\u540C\u6B65\u8303\u56F4...", 12);
      const confirmedPlan = await this.showSyncPlanPreview(plan);
      if (!confirmedPlan) {
        this.finishTask(task, "success", "\u5DF2\u53D6\u6D88\u540C\u6B65\u3002");
        return;
      }
      if (!confirmedPlan.length) {
        this.finishTask(task, "success", "\u672A\u9009\u62E9\u540C\u6B65\u9879\u76EE\u3002");
        return;
      }
      let completed = 0;
      let failed = 0;
      let totalBytes = 0;
      const strategies = /* @__PURE__ */ new Set();
      const failures = [];
      for (const [index, step] of confirmedPlan.entries()) {
        const sourceDevice = this.getPaneDevice(step.sourceSide);
        const targetDevice = this.getPaneDevice(step.targetSide);
        const progress = Math.min(88, 10 + Math.round(index / confirmedPlan.length * 72));
        const displayPath = step.relativePath || step.item.name;
        this.updateTask(task, `\u540C\u6B65 ${displayPath}\uFF1A${sourceDevice?.name ?? step.sourceSide} -> ${targetDevice?.name ?? step.targetSide}`, progress);
        const result = await this.transferItem(step.sourceSide, step.targetSide, step.item, { refreshTarget: false, task, targetPath: step.targetPath });
        if (result.ok) {
          completed++;
          totalBytes += result.bytes;
          if (result.strategy) {
            strategies.add(result.strategy);
          }
        } else if (result.canceled) {
          this.finishTask(task, "canceled", `\u5DF2\u53D6\u6D88\u540C\u6B65\uFF1A${displayPath}`, { bytes: totalBytes });
          return;
        } else {
          failed++;
          failures.push(`${displayPath}: ${result.message}`);
        }
      }
      this.updateTask(task, "\u6B63\u5728\u5237\u65B0\u4E24\u4FA7\u76EE\u5F55", 92);
      await Promise.all([this.refreshPane("left"), this.refreshPane("right")]);
      const strategy = [...strategies].join(", ") || void 0;
      if (failed > 0) {
        this.finishTask(task, "error", `\u540C\u6B65\u5B8C\u6210 ${completed} \u9879\uFF0C\u5931\u8D25 ${failed} \u9879\u3002`, { bytes: totalBytes, strategy, error: failures[0] });
        return;
      }
      this.finishTask(task, "success", `\u540C\u6B65\u5B8C\u6210\uFF1A${completed} \u9879\u3002`, { bytes: totalBytes, strategy });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u540C\u6B65\u5931\u8D25\uFF1A${message}`, { error: message });
    }
  }
  showSyncPlanPreview(plan) {
    return new Promise((resolve) => {
      this.syncPreviewState = {
        plan,
        selectedIndexes: new Set(plan.map((_, index) => index)),
        reversedIndexes: /* @__PURE__ */ new Set(),
        resolve
      };
      this.render();
    });
  }
  async buildSyncPlan(task) {
    const recursivePlan = await this.tryBuildRecursiveSyncPlan(task);
    return recursivePlan ?? this.buildFlatSyncPlan();
  }
  async tryBuildRecursiveSyncPlan(task) {
    const roots = this.getRecursiveSyncRoots();
    const leftDevice = this.getPaneDevice("left");
    const rightDevice = this.getPaneDevice("right");
    if (!roots || !leftDevice || !rightDevice || !roots.left.path || !roots.right.path) {
      return void 0;
    }
    if (task) {
      this.updateTask(task, `\u6B63\u5728\u9012\u5F52\u626B\u63CF\uFF1A${roots.left.name} / ${roots.right.name}`, 8);
    }
    const [leftEntries, rightEntries] = await Promise.all([
      this.collectSyncTree("left", roots.left.path, "", { count: 0 }, task),
      this.collectSyncTree("right", roots.right.path, "", { count: 0 }, task)
    ]);
    const caseInsensitive = this.isWindowsDevice(leftDevice) || this.isWindowsDevice(rightDevice);
    return this.buildSyncPlanFromEntries(leftEntries, rightEntries, roots.left.path, roots.right.path, caseInsensitive, true);
  }
  getRecursiveSyncRoots() {
    const leftSelected = this.getSelectedDirectory("left");
    const rightSelected = this.getSelectedDirectory("right");
    if (leftSelected && rightSelected) {
      return { left: leftSelected, right: rightSelected };
    }
    if (leftSelected) {
      const rightMatch = this.findPaneDirectoryByName("right", leftSelected.name);
      return rightMatch ? { left: leftSelected, right: rightMatch } : void 0;
    }
    if (rightSelected) {
      const leftMatch = this.findPaneDirectoryByName("left", rightSelected.name);
      return leftMatch ? { left: leftMatch, right: rightSelected } : void 0;
    }
    return void 0;
  }
  getSelectedDirectory(side) {
    const selected = this.getSelectedItem(side);
    return selected?.path && selected.directory && !selected.parent && selected.type !== "unknown" ? selected : void 0;
  }
  findPaneDirectoryByName(side, name) {
    const device = this.getPaneDevice(side);
    const caseInsensitive = !!device && this.isWindowsDevice(device);
    const key = caseInsensitive ? name.toLocaleLowerCase() : name;
    return this.paneStates[side].items.find((item) => {
      if (!item.path || !item.directory || item.parent || item.type === "unknown") {
        return false;
      }
      return (caseInsensitive ? item.name.toLocaleLowerCase() : item.name) === key;
    });
  }
  async collectSyncTree(side, rootPath, relativeRoot, counter, task) {
    counter.count++;
    if (counter.count > SYNC_RECURSIVE_SCAN_LIMIT) {
      throw new Error(`\u9012\u5F52\u540C\u6B65\u626B\u63CF\u8D85\u8FC7 ${SYNC_RECURSIVE_SCAN_LIMIT} \u9879\uFF0C\u8BF7\u8FDB\u5165\u66F4\u5C0F\u7684\u76EE\u5F55\u540E\u518D\u540C\u6B65\u3002`);
    }
    if (task && counter.count % 25 === 0) {
      this.updateTask(task, `\u6B63\u5728\u626B\u63CF${this.getSideLabel(side)}\uFF1A${relativeRoot || "."}`, 8);
    }
    const items = await this.listPaneDirectory(side, rootPath);
    const entries = [];
    for (const item of items) {
      if (!item.path || item.parent || item.type === "unknown") {
        continue;
      }
      const relativePath = relativeRoot ? `${relativeRoot}/${item.name}` : item.name;
      counter.count++;
      if (counter.count > SYNC_RECURSIVE_SCAN_LIMIT) {
        throw new Error(`\u9012\u5F52\u540C\u6B65\u626B\u63CF\u8D85\u8FC7 ${SYNC_RECURSIVE_SCAN_LIMIT} \u9879\uFF0C\u8BF7\u8FDB\u5165\u66F4\u5C0F\u7684\u76EE\u5F55\u540E\u518D\u540C\u6B65\u3002`);
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
  async listPaneDirectory(side, path) {
    const device = this.getPaneDevice(side);
    if (!device) {
      return [];
    }
    const listing = await this.loadPaneDirectory(device, path, false);
    return listing.items.filter((item) => !!item.path && !item.parent && item.type !== "unknown");
  }
  buildFlatSyncPlan() {
    const leftDevice = this.getPaneDevice("left");
    const rightDevice = this.getPaneDevice("right");
    const caseInsensitive = !!leftDevice && !!rightDevice && (this.isWindowsDevice(leftDevice) || this.isWindowsDevice(rightDevice));
    const leftEntries = this.getSyncItems("left").map((item) => ({ relativePath: item.name, item }));
    const rightEntries = this.getSyncItems("right").map((item) => ({ relativePath: item.name, item }));
    return this.buildSyncPlanFromEntries(leftEntries, rightEntries, this.paneStates.left.path, this.paneStates.right.path, caseInsensitive, false);
  }
  buildSyncPlanFromEntries(leftEntries, rightEntries, leftRootPath, rightRootPath, caseInsensitive, recursive) {
    const leftByPath = new Map(leftEntries.map((entry) => [this.getSyncPathKey(entry.relativePath, caseInsensitive), entry]));
    const rightByPath = new Map(rightEntries.map((entry) => [this.getSyncPathKey(entry.relativePath, caseInsensitive), entry]));
    const plan = [];
    for (const leftEntry of leftEntries) {
      const rightEntry = rightByPath.get(this.getSyncPathKey(leftEntry.relativePath, caseInsensitive));
      if (!rightEntry) {
        plan.push({
          sourceSide: "left",
          targetSide: "right",
          item: leftEntry.item,
          reason: "missing",
          relativePath: leftEntry.relativePath,
          targetPath: recursive ? this.joinRelativePanePath("right", rightRootPath, leftEntry.relativePath) : void 0,
          recursive
        });
        continue;
      }
      const decision = this.getSyncDecision(leftEntry.item, rightEntry.item);
      if (decision === "left") {
        const relativePath = leftEntry.relativePath;
        plan.push({
          sourceSide: "left",
          targetSide: "right",
          item: leftEntry.item,
          reason: leftEntry.item.rawSize !== rightEntry.item.rawSize ? "size" : "newer",
          relativePath,
          targetPath: recursive ? this.joinRelativePanePath("right", rightRootPath, relativePath) : void 0,
          recursive,
          reverse: {
            sourceSide: "right",
            targetSide: "left",
            item: rightEntry.item,
            targetPath: recursive ? this.joinRelativePanePath("left", leftRootPath, relativePath) : void 0
          }
        });
      }
    }
    for (const rightEntry of rightEntries) {
      const leftEntry = leftByPath.get(this.getSyncPathKey(rightEntry.relativePath, caseInsensitive));
      if (!leftEntry) {
        plan.push({
          sourceSide: "right",
          targetSide: "left",
          item: rightEntry.item,
          reason: "missing",
          relativePath: rightEntry.relativePath,
          targetPath: recursive ? this.joinRelativePanePath("left", leftRootPath, rightEntry.relativePath) : void 0,
          recursive
        });
        continue;
      }
      const decision = this.getSyncDecision(leftEntry.item, rightEntry.item);
      if (decision === "right") {
        const relativePath = rightEntry.relativePath;
        plan.push({
          sourceSide: "right",
          targetSide: "left",
          item: rightEntry.item,
          reason: rightEntry.item.rawSize !== leftEntry.item.rawSize ? "size" : "newer",
          relativePath,
          targetPath: recursive ? this.joinRelativePanePath("left", leftRootPath, relativePath) : void 0,
          recursive,
          reverse: {
            sourceSide: "left",
            targetSide: "right",
            item: leftEntry.item,
            targetPath: recursive ? this.joinRelativePanePath("right", rightRootPath, relativePath) : void 0
          }
        });
      }
    }
    return plan;
  }
  getSyncItems(side) {
    const selected = this.getSelectedItem(side);
    if (selected?.path && !selected.parent && selected.type !== "unknown") {
      return [selected];
    }
    return this.paneStates[side].items.filter((item) => !!item.path && !item.parent && !item.directory && item.type !== "unknown");
  }
  getSyncPathKey(relativePath, caseInsensitive) {
    const normalized = relativePath.replace(/\\/g, "/");
    return caseInsensitive ? normalized.toLocaleLowerCase() : normalized;
  }
  joinRelativePanePath(side, rootPath, relativePath) {
    const device = this.getPaneDevice(side);
    const windowsPath = !!device && this.isWindowsDevice(device);
    return relativePath.split("/").filter((segment) => !!segment).reduce((currentPath, segment) => joinPanePath(currentPath, segment, windowsPath), rootPath);
  }
  getSyncDirectionLabel(step) {
    return step.sourceSide === "left" ? "\u5DE6 -> \u53F3" : "\u53F3 -> \u5DE6";
  }
  getSyncReasonLabel(reason) {
    if (reason === "missing") {
      return "\u65B0\u589E";
    }
    if (reason === "newer") {
      return "\u8F83\u65B0";
    }
    return "\u5927\u5C0F\u4E0D\u540C";
  }
  getSyncDecision(leftItem, rightItem) {
    if (leftItem.directory || rightItem.directory) {
      return;
    }
    const skewMs = 1e3;
    if (leftItem.rawModified > rightItem.rawModified + skewMs) {
      return "left";
    }
    if (rightItem.rawModified > leftItem.rawModified + skewMs) {
      return "right";
    }
    if (leftItem.rawSize !== rightItem.rawSize) {
      return leftItem.rawModified >= rightItem.rawModified ? "left" : "right";
    }
    return void 0;
  }
  async toTransferEndpoint(device, path) {
    if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
      return {
        kind: "local",
        path,
        label: device.name
      };
    }
    return {
      kind: "ssh",
      path,
      connection: await this.getSshConnectionOptions(device),
      label: device.name,
      supportsRsync: device.capabilities.rsync,
      supportsTar: device.capabilities.tar ?? device.capabilities.archive,
      preferredProtocol: device.preferredTransferProtocol
    };
  }
  async getSshConnectionOptions(device) {
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
  async getSshConnectionOptionsFromDraft(draft, editingDevice) {
    return {
      host: draft.host,
      port: draft.port || 22,
      username: draft.username,
      password: draft.password ?? (editingDevice ? await this.deviceStore?.getPassword(editingDevice.id) : void 0),
      privateKey: draft.privateKey ?? (editingDevice ? await this.deviceStore?.getPrivateKey(editingDevice.id) : void 0),
      privateKeyPath: draft.privateKeyPath,
      passphrase: draft.passphrase ?? (editingDevice ? await this.deviceStore?.getPassphrase(editingDevice.id) : void 0)
    };
  }
  clearPaneSelection(side) {
    const state = this.paneStates[side];
    state.selectedPath = void 0;
    state.selectedPaths.clear();
    state.selectionAnchorPath = void 0;
  }
  setSingleSelection(side, item) {
    const state = this.paneStates[side];
    state.selectedPath = item.path;
    state.selectedPaths.clear();
    if (item.path && !item.parent) {
      state.selectedPaths.add(item.path);
    }
    state.selectionAnchorPath = item.path;
  }
  isItemSelected(side, item) {
    if (!item.path) {
      return false;
    }
    const state = this.paneStates[side];
    return state.selectedPaths.has(item.path) || state.selectedPath === item.path;
  }
  ensureItemInSelection(side, item) {
    if (!item.path || item.parent) {
      return;
    }
    if (!this.paneStates[side].selectedPaths.has(item.path)) {
      this.selectItem(side, item, void 0, false);
      this.render();
    }
  }
  getSelectedTransferItems(side) {
    const state = this.paneStates[side];
    const selectedItems = state.items.filter((item) => !!item.path && !item.parent && state.selectedPaths.has(item.path));
    if (selectedItems.length) {
      return selectedItems;
    }
    const selected = this.getSelectedItem(side);
    return selected?.path && !selected.parent ? [selected] : [];
  }
  getLastSelectedPath(side) {
    const state = this.paneStates[side];
    for (let index = state.items.length - 1; index >= 0; index--) {
      const item = state.items[index];
      if (item.path && state.selectedPaths.has(item.path)) {
        return item.path;
      }
    }
    return void 0;
  }
  getSelectedItem(side) {
    const state = this.paneStates[side];
    if (state.selectedPath) {
      const focused = state.items.find((item) => item.path === state.selectedPath);
      if (focused) {
        return focused;
      }
    }
    return state.items.find((item) => !!item.path && state.selectedPaths.has(item.path));
  }
  toFileItems(device, currentPath, entries) {
    const parentPath = getPaneParentPath(currentPath, this.isWindowsDevice(device));
    const parent = parentPath ? [{
      name: "..",
      path: parentPath,
      size: "",
      rawSize: 0,
      modified: "\u53CC\u51FB\u8FD4\u56DE\u4E0A\u7EA7",
      rawModified: 0,
      type: "directory",
      directory: true,
      parent: true
    }] : [];
    const showDotNames = this.isWindowsDevice(device);
    return [...parent, ...entries.filter((entry) => showDotNames || !isHiddenFileName(entry.name)).map((entry) => this.toFileItem(entry))];
  }
  toFileItem(entry) {
    return {
      name: entry.name,
      path: entry.path,
      size: entry.type === "directory" ? "" : formatSize(entry.size),
      rawSize: entry.size,
      modified: formatDate(entry.modified),
      rawModified: entry.modified,
      type: entry.type,
      directory: entry.type === "directory"
    };
  }
  getAllDevices() {
    return [this.localWindowsDevice, ...this.devices];
  }
  createLocalWindowsDevice() {
    const defaultPath = this.getConfiguredLocalWindowsDefaultPath();
    return {
      id: LOCAL_WINDOWS_DEVICE_ID,
      name: "Windows",
      host: "localhost",
      port: 0,
      username: "local",
      authType: "password",
      defaultPath,
      platform: "windows",
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
  getConfiguredLocalWindowsDefaultPath() {
    const savedPath = this.storageService.get(TURBOFILE_LOCAL_WINDOWS_DEFAULT_PATH_STORAGE_KEY, StorageScope.PROFILE);
    return savedPath || this.getLocalWindowsDefaultPath();
  }
  getLocalWindowsDeviceDefaultPath() {
    return this.localWindowsDevice.defaultPath || this.getConfiguredLocalWindowsDefaultPath();
  }
  getConfiguredLocalWindowsTransferProtocol() {
    const protocol = this.storageService.get(TURBOFILE_LOCAL_WINDOWS_TRANSFER_PROTOCOL_STORAGE_KEY, StorageScope.PROFILE);
    return protocol === "auto-fast" || protocol === "rsync" || protocol === "sftp" || protocol === "scp" ? protocol : defaultTurboFileTransferProtocol;
  }
  saveLocalWindowsDevice(draft) {
    const defaultPath = draft.defaultPath?.trim() || this.getLocalWindowsDefaultPath();
    const preferredTransferProtocol = this.normalizeTransferProtocol(draft.preferredTransferProtocol ?? defaultTurboFileTransferProtocol);
    this.storageService.store(TURBOFILE_LOCAL_WINDOWS_DEFAULT_PATH_STORAGE_KEY, defaultPath, StorageScope.PROFILE, StorageTarget.MACHINE);
    this.storageService.store(TURBOFILE_LOCAL_WINDOWS_TRANSFER_PROTOCOL_STORAGE_KEY, preferredTransferProtocol, StorageScope.PROFILE, StorageTarget.MACHINE);
    this.localWindowsDevice = {
      ...this.localWindowsDevice,
      name: draft.name.trim() || "Windows",
      defaultPath,
      preferredTransferProtocol
    };
    return this.localWindowsDevice;
  }
  syncLocalWindowsDefaultPath(previousDefaultPath, nextDefaultPath) {
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
    for (const side of ["left", "right"]) {
      const state = this.paneStates[side];
      if (state.deviceId !== LOCAL_WINDOWS_DEVICE_ID) {
        continue;
      }
      const shouldUseNewDefault = !state.path || isSameWindowsPath(state.path, previousDefaultPath) || isSameWindowsPath(state.path, systemUserPath);
      if (!shouldUseNewDefault) {
        continue;
      }
      state.path = nextDefaultPath;
      state.items = [];
      state.error = void 0;
      this.resetPaneScroll(side);
      this.clearPaneSelection(side);
      this.rememberPaneDevicePath(side, this.localWindowsDevice, nextDefaultPath);
      void this.refreshPane(side, { path: nextDefaultPath, force: true, silent: true });
      refreshed = true;
    }
    return refreshed;
  }
  getLocalWindowsDefaultPath() {
    return this.environmentService.userHome.fsPath || LOCAL_WINDOWS_FALLBACK_PATH;
  }
  async refreshWindowsDriveRoots() {
    const letters = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const probes = await Promise.all(letters.map(async (letter) => {
      const root = `${letter}:\\`;
      try {
        await this.sshService.listLocalDirectory(root);
        return root;
      } catch {
        return void 0;
      }
    }));
    this.availableWindowsDriveRoots = probes.filter((root) => !!root);
    if (!this.availableWindowsDriveRoots.length) {
      this.availableWindowsDriveRoots = [LOCAL_WINDOWS_FALLBACK_PATH];
    }
    if (this.activePage === "transfer") {
      this.render();
    }
  }
  getWindowsLocationLabel(path) {
    const desktopPath = joinPanePath(this.getLocalWindowsDefaultPath(), "Desktop", true);
    if (isSameWindowsPath(path, desktopPath)) {
      return "\u684C\u9762";
    }
    const driveRoot = getWindowsDriveRoot(path);
    if (driveRoot) {
      return this.getWindowsDriveLabel(driveRoot);
    }
    return "Windows";
  }
  getWindowsDriveLabel(driveRoot) {
    const drive = driveRoot.substring(0, 1).toUpperCase();
    return `${drive}\u76D8`;
  }
  getWindowsLocationIconClass(path) {
    const desktopPath = joinPanePath(this.getLocalWindowsDefaultPath(), "Desktop", true);
    if (isSameWindowsPath(path, desktopPath)) {
      return "turbofile-location-icon-windows";
    }
    const driveRoot = getWindowsDriveRoot(path);
    if (driveRoot) {
      return "turbofile-location-icon-windows";
    }
    return "turbofile-location-icon-drive";
  }
  getWindowsLocationMenuIconClass(path) {
    return `turbofile-windows-location-action turbofile-location-menu-icon ${this.getWindowsLocationIconClass(path)}`;
  }
  showWindowsLocationMenu(side, event) {
    event.preventDefault();
    event.stopPropagation();
    this.setActiveFilePaneSide(side);
    const anchor = event instanceof MouseEvent ? new StandardMouseEvent(getWindow(event), event) : event.currentTarget;
    this.contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      getActions: () => this.getWindowsLocationActions(side),
      getActionViewItem: (action, options) => action.id.startsWith(`turbofile.windowsLocation.${side}.`) ? new ActionViewItem(null, action, { ...options, icon: true, label: true }) : void 0,
      skipTelemetry: true
    });
  }
  getWindowsLocationActions(side) {
    const state = this.paneStates[side];
    const homePath = this.getLocalWindowsDefaultPath();
    const desktopPath = joinPanePath(homePath, "Desktop", true);
    const actions = [
      this.menuAction(`turbofile.windowsLocation.${side}.desktop`, "\u684C\u9762", this.getWindowsLocationMenuIconClass(desktopPath), () => this.openWindowsLocalPath(side, desktopPath, "\u684C\u9762"), true, isSameWindowsPath(state.path, desktopPath)),
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
  getWindowsDriveRoots() {
    const roots = /* @__PURE__ */ new Set();
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
  openWindowsLocalPath(side, path, label) {
    const device = this.getPaneDevice(side);
    if (device?.id !== LOCAL_WINDOWS_DEVICE_ID) {
      return;
    }
    const state = this.paneStates[side];
    state.path = path;
    state.items = [];
    state.error = void 0;
    this.resetPaneScroll(side);
    this.clearPaneSelection(side);
    this.statusMessage = `\u5DF2\u5728${this.getSideLabel(side)}\u6253\u5F00 Windows \u4F4D\u7F6E\uFF1A${label}`;
    this.render();
    void this.refreshPane(side);
  }
  getPaneDevice(side) {
    const state = this.paneStates[side];
    return this.getAllDevices().find((device) => device.id === state.deviceId);
  }
  getDeviceById(deviceId) {
    return this.getAllDevices().find((device) => device.id === deviceId);
  }
  renderFileBrowserIcon(item) {
    if (item.parent) {
      return renderTurboFileIcon("arrow-up-circle", "primary");
    }
    if (item.directory) {
      return renderTurboFileIcon("folder-fill", "warning");
    }
    const icon = $("span.turbofile-file-theme-icon.monaco-icon-label");
    const resource = item.path ? URI.file(item.path) : void 0;
    icon.classList.add(...getIconClasses(this.modelService, this.languageService, resource, FileKind.FILE));
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }
  getDeviceDisplayLabel(device) {
    if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
      return "Windows";
    }
    const host = device.host;
    return `${device.name} (${host})`;
  }
  renderDeviceSelectIcon(_device) {
    const icon = $("span.turbofile-device-select-icon");
    icon.setAttribute("aria-hidden", "true");
    icon.appendChild(renderTurboFileDeviceMonitorIcon());
    return icon;
  }
  renderDevicePageIcon(device) {
    if (!this.isWindowsDevice(device)) {
      return renderIcon(Codicon.server);
    }
    const icon = $("span.turbofile-device-page-icon");
    icon.setAttribute("aria-hidden", "true");
    icon.appendChild(renderTurboFileDeviceMonitorIcon());
    return icon;
  }
  formatPanePathForDisplay(path, windowsPath) {
    if (!windowsPath) {
      return this.normalizePanePath(path || "/", false);
    }
    return this.normalizePanePath(path || LOCAL_WINDOWS_FALLBACK_PATH, true);
  }
  normalizePaneInputPath(path, windowsPath) {
    const trimmed = path.trim();
    if (!trimmed) {
      return "";
    }
    return this.normalizePanePath(trimmed, windowsPath);
  }
  normalizePanePath(path, windowsPath) {
    if (windowsPath) {
      return path.replace(/\//g, "\\");
    }
    let normalized = path.replace(/\\/g, "/").trim();
    if (!normalized || normalized === "." || normalized === "./" || normalized === "/." || normalized === "/./") {
      return "/";
    }
    if (normalized.startsWith("./")) {
      normalized = normalized.substring(1);
    }
    if (!normalized.startsWith("/")) {
      normalized = `/${normalized}`;
    }
    normalized = normalized.replace(/\/+/g, "/").replace(/\/\.(?=\/|$)/g, "");
    if (normalized.length > 1) {
      normalized = normalized.replace(/\/+$/, "");
    }
    return normalized || "/";
  }
  getDefaultPaneDevicePath(device) {
    return device.id === LOCAL_WINDOWS_DEVICE_ID ? this.getLocalWindowsDeviceDefaultPath() : this.normalizePanePath(device.defaultPath || "/", false);
  }
  getPaneDeviceMemoryKey(side, device) {
    return `${side}|${device.id}`;
  }
  getPaneDevicePathStorageKey(side, device) {
    return `turbofile.panePath.${side}.${encodeURIComponent(device.id)}`;
  }
  rememberPaneDevicePath(side, device, path) {
    if (!path) {
      return;
    }
    const normalizedPath = this.normalizePanePath(path, this.isWindowsDevice(device));
    this.storageService.store(this.getPaneDevicePathStorageKey(side, device), normalizedPath, StorageScope.PROFILE, StorageTarget.USER);
  }
  getRememberedPaneDevicePath(side, device) {
    const path = this.storageService.get(this.getPaneDevicePathStorageKey(side, device), StorageScope.PROFILE);
    return path ? this.normalizePanePath(path, this.isWindowsDevice(device)) : void 0;
  }
  getInitialPaneDevicePath(side, device) {
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
  rememberPaneDeviceSnapshot(side) {
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
  getPaneDeviceSnapshot(side, device) {
    const key = this.getPaneDeviceMemoryKey(side, device);
    const snapshot = this.paneDeviceSnapshots.get(key);
    if (!snapshot) {
      return void 0;
    }
    if (snapshot.expiresAt <= Date.now()) {
      this.paneDeviceSnapshots.delete(key);
      return void 0;
    }
    return snapshot;
  }
  setPaneDevice(side, device) {
    const state = this.paneStates[side];
    if (side === "right") {
      this.hasAppliedInitialRightPaneDefault = true;
    }
    if (state.deviceId === device.id) {
      state.error = void 0;
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
    state.error = void 0;
    this.resetPaneScroll(side);
    if (snapshot?.path === targetPath) {
      state.scrollTop = snapshot.scrollTop;
    }
    this.clearPaneSelection(side);
    this.statusMessage = `\u5DF2\u5728${this.getSideLabel(side)}\u6253\u5F00\u8BBE\u5907\uFF1A${device.name}`;
    this.render();
    if (cached) {
      this.applyPaneDirectoryEntry(side, device, cached);
      this.render();
      return;
    }
    void this.refreshPane(side, { path: targetPath, silent: true });
  }
  ensurePaneDeviceSelection(options = {}) {
    const devices = this.getAllDevices();
    for (const side of ["left", "right"]) {
      const state = this.paneStates[side];
      if (!devices.some((device) => device.id === state.deviceId)) {
        state.deviceId = devices[0].id;
        state.path = this.getDefaultPaneDevicePath(devices[0]);
      }
    }
    if (options.preferFirstSshOnRight && !this.hasAppliedInitialRightPaneDefault && this.devices[0] && this.paneStates.right.deviceId === LOCAL_WINDOWS_DEVICE_ID) {
      this.paneStates.right.deviceId = this.devices[0].id;
      this.paneStates.right.path = this.devices[0].defaultPath || "/";
      this.hasAppliedInitialRightPaneDefault = true;
    }
  }
  isWindowsDevice(device) {
    return device.id === LOCAL_WINDOWS_DEVICE_ID || device.platform === "windows";
  }
  normalizeTransferProtocol(value) {
    return value === "auto-fast" || value === "rsync" || value === "scp" || value === "sftp" ? value : defaultTurboFileTransferProtocol;
  }
  renderDeviceForm() {
    const overlay = $(".turbofile-device-overlay");
    const form = document.createElement("form");
    form.className = "turbofile-device-form";
    this.bindDeviceFormEventIsolation(form);
    const editingDevice = this.editingDeviceId ? this.getAllDevices().find((device) => device.id === this.editingDeviceId) : void 0;
    const isEditing = !!editingDevice;
    const isEditingLocalWindows = editingDevice?.id === LOCAL_WINDOWS_DEVICE_ID;
    const title = $(".turbofile-device-form-title");
    title.textContent = isEditingLocalWindows ? "\u7F16\u8F91\u672C\u673A Windows" : isEditing ? "\u7F16\u8F91 SSH \u8BBE\u5907" : "\u6DFB\u52A0 SSH \u8BBE\u5907";
    form.appendChild(title);
    if (isEditingLocalWindows) {
      this.appendInputField(form, "name", "\u8BBE\u5907\u540D\u79F0", "Windows", "text", false, editingDevice.name);
      this.appendHiddenInput(form, "host", editingDevice.host);
      this.appendHiddenInput(form, "port", String(editingDevice.port || 0));
      this.appendHiddenInput(form, "username", editingDevice.username || "local");
      this.appendHiddenInput(form, "platform", "windows");
      this.appendHiddenInput(form, "authType", "password");
      this.appendProtocolField(form, editingDevice);
      this.appendInputField(form, "defaultPath", "\u9ED8\u8BA4\u76EE\u5F55", this.getLocalWindowsDefaultPath(), "text", true, editingDevice.defaultPath || this.getLocalWindowsDefaultPath());
    } else {
      this.appendInputField(form, "name", "\u8BBE\u5907\u540D\u79F0", "Linux Server", "text", false, editingDevice?.name);
      this.appendInputField(form, "host", "IP / \u4E3B\u673A\u540D", "192.168.10.15", "text", false, editingDevice?.host);
      this.appendInputField(form, "port", "\u7AEF\u53E3", "22", "number", false, String(editingDevice?.port || 22));
      this.appendInputField(form, "username", "\u7528\u6237\u540D", "root", "text", false, editingDevice?.username);
      this.appendSelectField(form, "platform", "\u7CFB\u7EDF\u7C7B\u578B", [
        ["linux", "Linux"],
        ["wsl", "WSL"],
        ["unknown", "Unknown"]
      ], editingDevice?.platform ?? "linux");
      this.appendSelectField(form, "authType", "\u8BA4\u8BC1\u65B9\u5F0F", [
        ["password", "\u5BC6\u7801"],
        ["privateKey", "\u79C1\u94A5"]
      ], editingDevice?.authType ?? "password");
      this.appendProtocolField(form, editingDevice);
      this.appendInputField(form, "password", "\u5BC6\u7801", isEditing ? "\u7559\u7A7A\u4FDD\u6301\u539F\u5BC6\u7801" : "", "password", true);
      this.appendInputField(form, "privateKeyPath", "\u79C1\u94A5\u8DEF\u5F84", "C:\\Users\\User\\.ssh\\id_rsa", "text", true, editingDevice?.privateKeyPath);
      this.appendInputField(form, "passphrase", "\u79C1\u94A5\u53E3\u4EE4", isEditing ? "\u7559\u7A7A\u4FDD\u6301\u539F\u79C1\u94A5\u53E3\u4EE4" : "", "password", true);
      this.appendInputField(form, "defaultPath", "\u9ED8\u8BA4\u76EE\u5F55", "/home", "text", true, editingDevice?.defaultPath);
    }
    const message = $(".turbofile-device-form-message");
    message.textContent = this.deviceFormMessage;
    form.appendChild(message);
    const actions = $(".turbofile-device-form-actions");
    const cancel = this.createButton("\u53D6\u6D88", "turbofile-secondary-button");
    const save = this.createButton("\u4FDD\u5B58\u8BBE\u5907", "turbofile-primary-button");
    cancel.element.type = "button";
    save.element.type = "submit";
    actions.appendChild(cancel.element);
    actions.appendChild(save.element);
    form.appendChild(actions);
    cancel.element.addEventListener("click", () => {
      this.isDeviceFormVisible = false;
      this.editingDeviceId = void 0;
      this.render();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const draft = this.readDeviceDraft(form, message);
      if (!draft || !this.deviceStore) {
        return;
      }
      message.textContent = draft.preferredTransferProtocol === "sftp" ? "\u6B63\u5728\u4FDD\u5B58\u8BBE\u5907..." : "\u6B63\u5728\u4FDD\u5B58\u5E76\u68C0\u6D4B\u8BBE\u5907\u80FD\u529B...";
      try {
        const previousLocalWindowsDefaultPath = isEditingLocalWindows ? this.getLocalWindowsDeviceDefaultPath() : void 0;
        let savedDevice = isEditingLocalWindows ? this.saveLocalWindowsDevice(draft) : editingDevice ? await this.deviceStore.updateDevice(editingDevice.id, draft) : await this.deviceStore.saveDevice(draft);
        const capabilityResult = isEditingLocalWindows ? void 0 : await this.detectAndStoreDeviceCapabilities(savedDevice);
        if (!isEditingLocalWindows) {
          savedDevice = this.deviceStore.loadDevices().find((device) => device.id === savedDevice.id) ?? savedDevice;
          this.devices = this.deviceStore.loadDevices();
        }
        this.clearPaneDirectoryCachesForDevice(savedDevice.id);
        this.ensurePaneDeviceSelection();
        const refreshedLocalWindowsPanes = isEditingLocalWindows ? this.syncLocalWindowsDefaultPath(previousLocalWindowsDefaultPath ?? this.getLocalWindowsDefaultPath(), savedDevice.defaultPath || this.getLocalWindowsDeviceDefaultPath()) : false;
        if (capabilityResult) {
          this.deviceConnectionMessages.set(savedDevice.id, capabilityResult);
          this.setDeviceRuntimeStatus(savedDevice, capabilityResult.status === "error" ? "offline" : "online");
        } else if (isEditingLocalWindows) {
          this.deviceConnectionMessages.set(savedDevice.id, { status: "success", message: "\u672C\u673A\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0CWindows \u4E0E\u670D\u52A1\u5668\u4E92\u4F20\u4F1A\u6309\u6240\u9009\u534F\u8BAE\u6267\u884C\u3002" });
          this.setDeviceRuntimeStatus(savedDevice, "online");
        } else if (savedDevice.preferredTransferProtocol === "sftp") {
          this.deviceConnectionMessages.set(savedDevice.id, { status: "success", message: "SFTP \u7A33\u5B9A\u6A21\u5F0F\uFF0C\u65E0\u9700\u989D\u5916\u68C0\u6D4B\u3002" });
        }
        this.deviceFormMessage = `${editingDevice ? "\u5DF2\u66F4\u65B0" : "\u5DF2\u4FDD\u5B58"}\u8BBE\u5907\uFF1A${savedDevice.name}${capabilityResult ? `\uFF0C${capabilityResult.message}` : ""}`;
        this.statusMessage = `${this.deviceFormMessage}\u3002\u53EF\u5728\u8BBE\u5907\u4E0B\u62C9\u83DC\u5355\u4E2D\u9009\u62E9\u3002`;
        this.isDeviceFormVisible = false;
        this.editingDeviceId = void 0;
        this.render();
        if (!isEditingLocalWindows || !refreshedLocalWindowsPanes) {
          void this.refreshPane("right");
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.deviceFormMessage = `\u4FDD\u5B58\u5931\u8D25\uFF1A${reason}`;
        message.textContent = this.deviceFormMessage;
        this.statusMessage = this.deviceFormMessage;
      }
    });
    overlay.appendChild(form);
    window.setTimeout(() => {
      const firstInput = form.querySelector('input[name="name"]');
      firstInput?.focus({ preventScroll: true });
      firstInput?.select();
    }, 0);
    return overlay;
  }
  bindDeviceFormEventIsolation(form) {
    const stopPropagation = (event) => event.stopPropagation();
    for (const eventName of ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "keydown", "keyup", "keypress"]) {
      form.addEventListener(eventName, stopPropagation);
    }
  }
  appendInputField(parent, name, label, placeholder, type = "text", wide = false, value) {
    const field = $(".turbofile-device-field");
    if (wide) {
      field.classList.add("is-wide");
    }
    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    labelElement.htmlFor = `turbofile-device-${name}`;
    const input = document.createElement("input");
    input.id = `turbofile-device-${name}`;
    input.name = name;
    input.type = type;
    input.placeholder = placeholder;
    input.value = value ?? (name === "port" ? "22" : "");
    this.bindDeviceFormControl(input);
    field.appendChild(labelElement);
    field.appendChild(input);
    parent.appendChild(field);
  }
  appendHiddenInput(parent, name, value) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    parent.appendChild(input);
  }
  appendProtocolField(parent, editingDevice) {
    const isLocalWindowsDevice = editingDevice?.id === LOCAL_WINDOWS_DEVICE_ID || editingDevice?.platform === "windows";
    const field = $(".turbofile-device-field.is-wide");
    const labelElement = document.createElement("label");
    labelElement.textContent = "\u4F20\u8F93\u6A21\u5F0F";
    labelElement.htmlFor = "turbofile-device-preferredTransferProtocol";
    const row = $(".turbofile-device-protocol-row");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "minmax(180px, 1fr) auto auto";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    const select = document.createElement("select");
    select.id = "turbofile-device-preferredTransferProtocol";
    select.name = "preferredTransferProtocol";
    const protocolOptions = [
      ["auto-fast", "\u667A\u80FD\u6781\u901F\uFF08\u63A8\u8350\uFF09"],
      ["scp", "SCP \u6587\u4EF6"],
      ["sftp", "SFTP \u7A33\u5B9A\u6A21\u5F0F"],
      ["rsync", "rsync \u589E\u91CF"]
    ];
    for (const [value, text] of protocolOptions) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      option.selected = (editingDevice?.preferredTransferProtocol ?? defaultTurboFileTransferProtocol) === value;
      select.appendChild(option);
    }
    this.bindDeviceFormControl(select);
    const detect = this.createButton("\u68C0\u6D4B", "turbofile-secondary-button").element;
    detect.type = "button";
    const install = this.createButton("\u5B89\u88C5 rsync/sshpass", "turbofile-secondary-button").element;
    install.type = "button";
    install.style.display = "none";
    const getLocalWindowsProtocolStatus = () => {
      const protocol = this.normalizeTransferProtocol(select.value);
      return protocol === "rsync" ? "Windows \u672C\u673A\u5DF2\u5185\u7F6E rsync\uFF0C\u53EF\u76F4\u63A5\u7528\u4E8E\u672C\u673A\u4E0E SSH \u8BBE\u5907\u589E\u91CF\u4F20\u8F93\uFF0C\u65E0\u9700\u5355\u72EC\u5B89\u88C5 Cygwin/MSYS2\u3002" : "\u672C\u673A\u6A21\u5F0F\u7528\u4E8E Windows \u4E0E\u670D\u52A1\u5668\u4E92\u4F20\uFF0C\u65E0\u9700 SSH \u68C0\u6D4B\u3002";
    };
    const status = $(".turbofile-device-protocol-status");
    status.style.gridColumn = "1 / -1";
    status.style.minHeight = "18px";
    status.style.color = "var(--vscode-descriptionForeground)";
    status.textContent = isLocalWindowsDevice ? getLocalWindowsProtocolStatus() : select.value === "sftp" ? "SFTP \u7A33\u5B9A\u6A21\u5F0F\uFF0C\u65E0\u9700\u989D\u5916\u68C0\u6D4B\u3002" : "\u9009\u62E9\u540E\u5C06\u81EA\u52A8\u68C0\u6D4B\u8BBE\u5907\u80FD\u529B\u3002";
    let lastMissingDependencies = [];
    let detectionRun = 0;
    const setStatus = (kind, message) => {
      status.textContent = message;
      status.style.color = kind === "success" ? "var(--vscode-testing-iconPassed)" : kind === "error" ? "var(--vscode-testing-iconFailed)" : "var(--vscode-descriptionForeground)";
    };
    const setInstallVisible = (visible) => {
      install.style.display = visible ? "" : "none";
    };
    const runDetection = async () => {
      const protocol = this.normalizeTransferProtocol(select.value);
      lastMissingDependencies = [];
      setInstallVisible(false);
      if (isLocalWindowsDevice) {
        setStatus("idle", getLocalWindowsProtocolStatus());
        return;
      }
      if (protocol === "sftp") {
        setStatus("idle", "SFTP \u7A33\u5B9A\u6A21\u5F0F\uFF0C\u65E0\u9700\u989D\u5916\u68C0\u6D4B\u3002");
        return;
      }
      const draft = this.readDeviceDraft(parent, status);
      if (!draft) {
        setInstallVisible(false);
        return;
      }
      const runId = ++detectionRun;
      detect.disabled = true;
      install.disabled = true;
      setStatus("testing", "\u6B63\u5728\u68C0\u6D4B\u8BBE\u5907\u4F20\u8F93\u80FD\u529B...");
      try {
        const result = await this.detectDraftProtocolCapabilities(draft, editingDevice);
        if (runId !== detectionRun) {
          return;
        }
        if (!result) {
          setStatus("idle", "SFTP \u7A33\u5B9A\u6A21\u5F0F\uFF0C\u65E0\u9700\u989D\u5916\u68C0\u6D4B\u3002");
          setInstallVisible(false);
          return;
        }
        lastMissingDependencies = result.missingDependencies ?? [];
        setStatus(result.status, result.message);
        setInstallVisible(protocol === "rsync" && lastMissingDependencies.length > 0 && !!result.capabilities);
      } catch (error) {
        if (runId !== detectionRun) {
          return;
        }
        const reason = error instanceof Error ? error.message : String(error);
        setStatus("error", `\u80FD\u529B\u68C0\u6D4B\u5931\u8D25\uFF1A${reason}`);
        setInstallVisible(false);
      } finally {
        if (runId === detectionRun) {
          detect.disabled = false;
          install.disabled = false;
        }
      }
    };
    detect.addEventListener("click", () => {
      void runDetection();
    });
    select.addEventListener("change", () => {
      void runDetection();
    });
    install.addEventListener("click", async () => {
      const dependencies = lastMissingDependencies.filter((dependency) => dependency === "rsync" || dependency === "sshpass");
      if (!dependencies.length) {
        return;
      }
      const confirmed = getWindow(this.container).confirm(`\u5C06\u5728\u8FDC\u7AEF\u670D\u52A1\u5668\u5B89\u88C5\uFF1A${dependencies.join("\u3001")}

\u8BE5\u64CD\u4F5C\u4F1A\u4FEE\u6539\u8FDC\u7AEF\u7CFB\u7EDF\u5305\uFF0C\u8BF7\u786E\u8BA4\u4F60\u4FE1\u4EFB\u8FD9\u53F0\u670D\u52A1\u5668\u5E76\u62E5\u6709\u5B89\u88C5\u6743\u9650\u3002`);
      if (!confirmed) {
        return;
      }
      const draft = this.readDeviceDraft(parent, status);
      if (!draft) {
        return;
      }
      detect.disabled = true;
      install.disabled = true;
      setStatus("testing", "\u6B63\u5728\u8FDC\u7AEF\u5B89\u88C5 rsync/sshpass...");
      const result = await this.sshService.installTransferDependencies(await this.getSshConnectionOptionsFromDraft(draft, editingDevice), dependencies);
      if (result.capabilities && editingDevice && this.deviceStore) {
        this.deviceStore.updateDeviceCapabilities(editingDevice.id, this.toDeviceCapabilities(result.capabilities));
        this.devices = this.deviceStore.loadDevices();
      }
      if (!result.ok) {
        lastMissingDependencies = result.missingPackages;
        setStatus("error", `\u5B89\u88C5\u540E\u4ECD\u4E0D\u53EF\u7528\uFF1A${result.message}`);
        setInstallVisible(lastMissingDependencies.length > 0);
      } else {
        setStatus("success", "rsync/sshpass \u5B89\u88C5\u6210\u529F\uFF0C\u6B63\u5728\u91CD\u65B0\u68C0\u6D4B...");
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
    if (select.value === "rsync") {
      window.setTimeout(() => {
        void runDetection();
      }, 0);
    }
  }
  appendSelectField(parent, name, label, options, selectedValue) {
    const field = $(".turbofile-device-field");
    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    labelElement.htmlFor = `turbofile-device-${name}`;
    const select = document.createElement("select");
    select.id = `turbofile-device-${name}`;
    select.name = name;
    for (const [value, text] of options) {
      const option = document.createElement("option");
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
  bindDeviceFormControl(control) {
    control.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      control.focus({ preventScroll: true });
    });
    for (const eventName of ["mousedown", "mouseup", "click", "dblclick", "keydown", "keyup", "keypress", "input", "change"]) {
      control.addEventListener(eventName, (event) => event.stopPropagation());
    }
  }
  readDeviceDraft(form, message) {
    const formData = new FormData(form);
    const host = String(formData.get("host") || "").trim();
    const username = String(formData.get("username") || "").trim();
    if (!host || !username) {
      message.textContent = "\u8BF7\u586B\u5199 IP / \u4E3B\u673A\u540D\u548C\u7528\u6237\u540D\u3002";
      return void 0;
    }
    return {
      name: String(formData.get("name") || host).trim(),
      host,
      port: Number(formData.get("port")) || 22,
      username,
      authType: String(formData.get("authType") || "password"),
      password: String(formData.get("password") || "") || void 0,
      privateKeyPath: String(formData.get("privateKeyPath") || "") || void 0,
      passphrase: String(formData.get("passphrase") || "") || void 0,
      defaultPath: String(formData.get("defaultPath") || "") || void 0,
      platform: String(formData.get("platform") || "unknown"),
      preferredTransferProtocol: this.normalizeTransferProtocol(String(formData.get("preferredTransferProtocol") || defaultTurboFileTransferProtocol))
    };
  }
};
TurboFileEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IWorkbenchThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, INativeEnvironmentService),
  __decorateParam(5, ITurboFileSshService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IContextViewService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IModelService),
  __decorateParam(10, ILanguageService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IEditorService),
  __decorateParam(13, ITextEditorService),
  __decorateParam(14, ITerminalService),
  __decorateParam(15, ITerminalGroupService),
  __decorateParam(16, ITerminalProfileService),
  __decorateParam(17, IQuickInputService),
  __decorateParam(18, IClipboardService),
  __decorateParam(19, IConfigurationService),
  __decorateParam(20, IWorkbenchLayoutService),
  __decorateParam(21, IUpdateService),
  __decorateParam(22, IProductService),
  __decorateParam(23, ILabelService)
], TurboFileEditor);
class TurboFileRemoteFileSystemProvider extends Disposable {
  constructor(sshService) {
    super();
    this.sshService = sshService;
    this.capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
    this.onDidChangeCapabilities = Event.None;
    this._onDidChangeFile = this._register(new Emitter());
    this.onDidChangeFile = this._onDidChangeFile.event;
    this.devices = /* @__PURE__ */ new Map();
    this.stats = /* @__PURE__ */ new Map();
    this.remotePaths = /* @__PURE__ */ new Map();
  }
  registerFile(device, connection, item) {
    const resource = URI.from({
      scheme: TURBOFILE_REMOTE_DOCUMENT_SCHEME,
      authority: device.id,
      path: toRemoteDocumentUriPath(item.path ?? "/")
    });
    this.devices.set(device.id, { connection, label: device.name });
    this.remotePaths.set(resource.toString(), item.path ?? resource.path);
    this.stats.set(resource.toString(), this.toStat(item));
    return resource;
  }
  watch(_resource, _opts) {
    return Disposable.None;
  }
  async stat(resource) {
    const cached = this.stats.get(resource.toString());
    if (cached) {
      return cached;
    }
    const path = this.toRemotePath(resource);
    if (path === "/") {
      return { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    const entry = await this.lookupEntry(resource);
    const stat = this.toEntryStat(entry);
    this.stats.set(resource.toString(), stat);
    return stat;
  }
  async mkdir(resource) {
    const result = await this.sshService.createDirectory(await this.toEndpoint(resource));
    if (!result.ok) {
      throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
    }
    this.stats.set(resource.toString(), { type: FileType.Directory, ctime: Date.now(), mtime: Date.now(), size: 0 });
    this._onDidChangeFile.fire([{ resource, type: FileChangeType.ADDED }]);
  }
  async readdir(resource) {
    const registeredDevice = this.getRegisteredDevice(resource);
    const listing = await this.sshService.listRemoteDirectory(await registeredDevice.connection, this.toRemotePath(resource));
    return listing.entries.map((entry) => {
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
  async delete(resource, opts) {
    const result = await this.sshService.deletePath(await this.toEndpoint(resource), opts.recursive);
    if (!result.ok) {
      throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
    }
    this.stats.delete(resource.toString());
    this.remotePaths.delete(resource.toString());
    this._onDidChangeFile.fire([{ resource, type: FileChangeType.DELETED }]);
  }
  async rename(from, to, _opts) {
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
  async readFile(resource) {
    const result = await this.sshService.readFile(await this.toEndpoint(resource), { encoding: "base64", maxBytes: 256 * 1024 * 1024 });
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
  async writeFile(resource, content, _opts) {
    const result = await this.sshService.writeFile(await this.toEndpoint(resource), encodeBase64(VSBuffer.wrap(content)), "base64");
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
  async lookupEntry(resource) {
    const registeredDevice = this.getRegisteredDevice(resource);
    const path = this.toRemotePath(resource);
    const parentPath = getPaneParentPath(path, false) ?? "/";
    const listing = await this.sshService.listRemoteDirectory(await registeredDevice.connection, parentPath);
    const name = getPathBasename(path);
    const entry = listing.entries.find((entry2) => entry2.path === path || entry2.name === name);
    if (!entry) {
      throw createTurboFileProviderError(`File not found: ${path}`, FileSystemProviderErrorCode.FileNotFound);
    }
    return entry;
  }
  async toEndpoint(resource) {
    const registeredDevice = this.getRegisteredDevice(resource);
    return {
      kind: "ssh",
      path: this.toRemotePath(resource),
      connection: await registeredDevice.connection,
      label: registeredDevice.label
    };
  }
  getRegisteredDevice(resource) {
    const registeredDevice = this.devices.get(resource.authority);
    if (!registeredDevice) {
      throw createTurboFileProviderError(`Remote device is not registered: ${resource.authority}`, FileSystemProviderErrorCode.Unavailable);
    }
    return registeredDevice;
  }
  toRemotePath(resource) {
    return this.remotePaths.get(resource.toString()) ?? resource.path;
  }
  toStat(item) {
    const mtime = item.rawModified || Date.now();
    return {
      type: toProviderFileType(item.type),
      ctime: mtime,
      mtime,
      size: item.rawSize
    };
  }
  toEntryStat(entry) {
    return {
      type: toProviderFileType(entry.type),
      ctime: entry.modified,
      mtime: entry.modified,
      size: entry.size
    };
  }
}
class TurboFileSshTerminalProcess extends BasePty {
  constructor(id, cols, rows, sshService, connection, cwd) {
    super(id, false);
    this.sshService = sshService;
    this.connection = connection;
    this.cwd = cwd;
    this.terminalDisposables = this._register(new DisposableStore());
    this.pendingInput = [];
    this.isShutdown = false;
    this._lastDimensions.cols = cols;
    this._lastDimensions.rows = rows;
    this._properties.cwd = cwd;
    this._properties.initialCwd = cwd;
    void Promise.resolve(connection).then((resolvedConnection) => {
      this._properties.title = `\u6781\u901F\u4F20 ${resolvedConnection.username}@${resolvedConnection.host}`;
      this.handleDidChangeProperty({ type: ProcessPropertyType.Title, value: this._properties.title });
    }, () => void 0);
  }
  async start() {
    try {
      const connection = await this.connection;
      const session = await this.sshService.createSshTerminal(connection, this.cwd, this._lastDimensions.cols, this._lastDimensions.rows);
      this.sessionId = session.sessionId;
      this._properties.cwd = session.cwd;
      this._properties.initialCwd = session.cwd;
      this.terminalDisposables.add(this.sshService.onDynamicSshTerminalData(session.sessionId)((data) => this.handleData(data)));
      this.terminalDisposables.add(this.sshService.onDynamicSshTerminalExit(session.sessionId)((code) => {
        this.sessionId = void 0;
        this.terminalDisposables.clear();
        this.handleExit(code);
      }));
      this.handleReady({ pid: session.pid, cwd: session.cwd, windowsPty: void 0 });
      for (const data of this.pendingInput.splice(0)) {
        void this.sshService.writeSshTerminal(session.sessionId, data);
      }
      return void 0;
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) };
    }
  }
  shutdown(_immediate) {
    if (this.isShutdown) {
      return;
    }
    this.isShutdown = true;
    const sessionId = this.sessionId;
    this.sessionId = void 0;
    this.terminalDisposables.clear();
    if (sessionId) {
      void this.sshService.shutdownSshTerminal(sessionId);
    }
    this.handleExit(void 0);
  }
  input(data) {
    if (this.isShutdown) {
      return;
    }
    if (!this.sessionId) {
      this.pendingInput.push(data);
      return;
    }
    void this.sshService.writeSshTerminal(this.sessionId, data);
  }
  sendSignal(signal) {
    if (signal === "SIGINT") {
      this.input("");
      return;
    }
    if (signal === "SIGTERM" || signal === "SIGKILL") {
      this.shutdown(true);
    }
  }
  processBinary(data) {
    this.input(data);
    return Promise.resolve();
  }
  resize(cols, rows) {
    if (this.isShutdown || this._lastDimensions.cols === cols && this._lastDimensions.rows === rows) {
      return;
    }
    this._lastDimensions.cols = cols;
    this._lastDimensions.rows = rows;
    if (this.sessionId) {
      void this.sshService.resizeSshTerminal(this.sessionId, cols, rows);
    }
  }
  clearBuffer() {
  }
  acknowledgeDataEvent(_charCount) {
  }
  setUnicodeVersion(_version) {
    return Promise.resolve();
  }
  getInitialCwd() {
    return Promise.resolve(this._properties.initialCwd);
  }
  getCwd() {
    return Promise.resolve(this._properties.cwd || this._properties.initialCwd);
  }
  refreshProperty(type) {
    return Promise.resolve(this._properties[type]);
  }
  updateProperty(type, value) {
    this._properties[type] = value;
    this.handleDidChangeProperty({ type, value });
    return Promise.resolve();
  }
}
function getPaneParentPath(path, windowsPath) {
  if (!path) {
    return void 0;
  }
  if (!windowsPath) {
    const normalized2 = path.length > 1 ? path.replace(/\/+$/, "") : path;
    if (normalized2 === "/") {
      return void 0;
    }
    const index = normalized2.lastIndexOf("/");
    return index <= 0 ? "/" : normalized2.substring(0, index);
  }
  const normalized = path.replace(/[\\/]+$/, "");
  if (/^[A-Za-z]:$/.test(normalized)) {
    return void 0;
  }
  const slash = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  if (slash <= 2 && /^[A-Za-z]:/.test(normalized)) {
    return `${normalized.substring(0, 2)}\\`;
  }
  if (slash <= 0) {
    return void 0;
  }
  return normalized.substring(0, slash);
}
function getWindowsDriveRoot(path) {
  const match = /^([A-Za-z]):/.exec(path.replace(/\//g, "\\").trim());
  return match ? `${match[1].toUpperCase()}:\\` : void 0;
}
function isSameWindowsPath(left, right) {
  return getWindowsPathKey(left) === getWindowsPathKey(right);
}
function isPathOnWindowsDrive(path, driveRoot) {
  return getWindowsDriveRoot(path) === getWindowsDriveRoot(driveRoot);
}
function getWindowsPathKey(path) {
  return path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}
function isSupportedWindowsDropPath(path) {
  return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}
function joinPanePath(parentPath, name, windowsPath) {
  if (!windowsPath) {
    if (!parentPath || parentPath === "/") {
      return `/${name}`;
    }
    return parentPath.endsWith("/") ? `${parentPath}${name}` : `${parentPath}/${name}`;
  }
  if (!parentPath) {
    return name;
  }
  const separator = parentPath.includes("/") && !parentPath.includes("\\") ? "/" : "\\";
  return parentPath.endsWith("\\") || parentPath.endsWith("/") ? `${parentPath}${name}` : `${parentPath}${separator}${name}`;
}
function toRemoteDocumentUriPath(path) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
function getPathBasename(path) {
  const normalized = path.replace(/[\\/]+$/, "");
  const slash = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return slash >= 0 ? normalized.substring(slash + 1) : normalized;
}
function toProviderFileType(type) {
  if (type === "directory") {
    return FileType.Directory;
  }
  if (type === "file") {
    return FileType.File;
  }
  if (type === "symlink") {
    return FileType.File | FileType.SymbolicLink;
  }
  return FileType.Unknown;
}
function createTurboFileProviderError(message, code) {
  return createFileSystemProviderError(message, code);
}
function renderTurboFileIcon(icon, color) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("turbofile-bi-icon");
  if (color) {
    svg.classList.add(`turbofile-text-${color}`);
  }
  for (const path of getTurboFileIconPaths(icon)) {
    const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathElement.setAttribute("d", path.d);
    pathElement.setAttribute("fill", "currentColor");
    if (path.fillRule) {
      pathElement.setAttribute("fill-rule", path.fillRule);
    }
    svg.appendChild(pathElement);
  }
  return svg;
}
let turboFileDeviceMonitorIconId = 0;
function renderTurboFileDeviceMonitorIcon() {
  const screenId = `turbofileDeviceScreen${++turboFileDeviceMonitorIconId}`;
  const shineId = `turbofileDeviceShine${turboFileDeviceMonitorIconId}`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("turbofile-device-monitor-svg");
  const create = (tag, attrs) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attrs)) {
      element.setAttribute(name, value);
    }
    return element;
  };
  const defs = create("defs", {});
  const screen = create("linearGradient", { id: screenId, x1: "4", y1: "4", x2: "20", y2: "16", gradientUnits: "userSpaceOnUse" });
  screen.appendChild(create("stop", { "stop-color": "#5de7ef" }));
  screen.appendChild(create("stop", { offset: "1", "stop-color": "#2e8cff" }));
  const shine = create("linearGradient", { id: shineId, x1: "6", y1: "5", x2: "18", y2: "13", gradientUnits: "userSpaceOnUse" });
  shine.appendChild(create("stop", { "stop-color": "#ffffff", "stop-opacity": ".42" }));
  shine.appendChild(create("stop", { offset: "1", "stop-color": "#ffffff", "stop-opacity": "0" }));
  defs.appendChild(screen);
  defs.appendChild(shine);
  svg.appendChild(defs);
  svg.appendChild(create("rect", { x: "3.4", y: "4.2", width: "17.2", height: "12", rx: "1.4", fill: "#1f2933" }));
  svg.appendChild(create("rect", { x: "4.6", y: "5.3", width: "14.8", height: "9.7", rx: ".7", fill: `url(#${screenId})` }));
  svg.appendChild(create("path", { fill: `url(#${shineId})`, d: "M5.6 6.1h12.8v3.2c-2.6-.8-5.2-.9-7.8-.3-1.8.4-3.4.3-5-.1V6.1z" }));
  svg.appendChild(create("path", { fill: "#343a40", d: "M10.6 16.2h2.8v2.1h3.7v1.5H6.9v-1.5h3.7v-2.1z" }));
  svg.appendChild(create("path", { fill: "#8a98a8", d: "M7.8 20h8.4c.4 0 .7.3.7.7v.2H7.1v-.2c0-.4.3-.7.7-.7z" }));
  svg.appendChild(create("path", { fill: "#ffffff", "fill-opacity": ".28", d: "M5.4 5.9h13.2v.8H5.4z" }));
  return svg;
}
function renderTurboFileAppearanceIcon(icon) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("turbofile-appearance-icon");
  if (icon === "sun") {
    for (const d of ["M12 2.75V5.1", "M12 18.9v2.35", "M4.64 4.64l1.66 1.66", "M17.7 17.7l1.66 1.66", "M2.75 12H5.1", "M18.9 12h2.35", "M4.64 19.36l1.66-1.66", "M17.7 6.3l1.66-1.66"]) {
      const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path2.setAttribute("d", d);
      svg.appendChild(path2);
    }
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "4");
    svg.appendChild(circle);
    return svg;
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  if (icon === "moon") {
    path.setAttribute("d", "M20.2 14.4A7.7 7.7 0 0 1 9.6 3.8 8.2 8.2 0 1 0 20.2 14.4Z");
  } else {
    path.setAttribute("d", "M4 5.5h16v10.5H4zM9 20h6M12 16v4");
  }
  svg.appendChild(path);
  return svg;
}
function getTurboFileIconPaths(icon) {
  switch (icon) {
    case "archive":
      return [
        { d: "M0 2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1v7.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 1 12.5V5a1 1 0 0 1-1-1V2zm2 3v7.5A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5V5H2zm13-3H1v2h14V2zM5 7.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z" }
      ];
    case "arrow-clockwise":
      return [
        { d: "M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z", fillRule: "evenodd" },
        { d: "M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" }
      ];
    case "arrow-up-circle":
      return [
        { d: "M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8zm15 0A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-7.5 3.5a.5.5 0 0 1-1 0V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707V11.5z", fillRule: "evenodd" }
      ];
    case "clock":
      return [
        { d: "M8 3.5a.5.5 0 0 1 .5.5v3.25l2.15 1.29a.5.5 0 0 1-.514.858l-2.4-1.44A.5.5 0 0 1 7.5 7.53V4a.5.5 0 0 1 .5-.5z" },
        { d: "M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm0-1A7 7 0 1 1 8 1a7 7 0 0 1 0 14z" }
      ];
    case "cloud-upload-fill":
      return [
        { d: "M8 0a5.53 5.53 0 0 0-3.594 1.342c-.766.66-1.321 1.52-1.464 2.383C1.266 4.095 0 5.555 0 7.318 0 9.366 1.708 11 3.781 11H7.5V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707V11h4.188C14.502 11 16 9.57 16 7.773c0-1.636-1.242-2.969-2.834-3.194C12.923 1.999 10.69 0 8 0zm-.5 14.5V11h1v3.5a.5.5 0 0 1-1 0z", fillRule: "evenodd" }
      ];
    case "eye":
      return [
        { d: "M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" },
        { d: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" }
      ];
    case "file-earmark":
      return [
        { d: "M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z" }
      ];
    case "file-earmark-zip":
      return [
        { d: "M5 7.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v.938l.4 1.599a1 1 0 0 1-.416 1.074l-.93.62a1 1 0 0 1-1.11 0l-.929-.62a1 1 0 0 1-.415-1.074L5 8.438V7.5zm2 0H6v.938a1 1 0 0 1-.03.243l-.4 1.598.93.62.929-.62-.4-1.598A1 1 0 0 1 7 8.438V7.5z" },
        { d: "M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1h-2v1h-1v1h1v1h-1v1h1v1H6V5H5V4h1V3H5V2h1V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z" }
      ];
    case "files":
      return [
        { d: "M13 0H6a2 2 0 0 0-2 2 2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2 2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm0 13V4a2 2 0 0 0-2-2H5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1zM3 4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4z" }
      ];
    case "folder-check":
      return [
        { d: "m.5 3 .04.87a1.99 1.99 0 0 0-.342 1.311l.637 7A2 2 0 0 0 2.826 14H9v-1H2.826a1 1 0 0 1-.995-.91l-.637-7A1 1 0 0 1 2.19 4h11.62a1 1 0 0 1 .996 1.09L14.54 8h1.005l.256-2.819A2 2 0 0 0 13.81 3H9.828a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 6.172 1H2.5a2 2 0 0 0-2 2zm5.672-1a1 1 0 0 1 .707.293L7.586 3H2.19c-.24 0-.47.042-.683.12L1.5 2.98a1 1 0 0 1 1-.98h3.672z" },
        { d: "M15.854 10.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.707 0l-1.5-1.5a.5.5 0 0 1 .707-.708l1.146 1.147 2.646-2.647a.5.5 0 0 1 .708 0z" }
      ];
    case "folder-fill":
      return [
        { d: "M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.825a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3zm-8.322.12C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139z" }
      ];
    case "folder-plus":
      return [
        { d: "m.5 3 .04.87a1.99 1.99 0 0 0-.342 1.311l.637 7A2 2 0 0 0 2.826 14H9v-1H2.826a1 1 0 0 1-.995-.91l-.637-7A1 1 0 0 1 2.19 4h11.62a1 1 0 0 1 .996 1.09L14.54 8h1.005l.256-2.819A2 2 0 0 0 13.81 3H9.828a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 6.172 1H2.5a2 2 0 0 0-2 2zm5.672-1a1 1 0 0 1 .707.293L7.586 3H2.19c-.24 0-.47.042-.683.12L1.5 2.98a1 1 0 0 1 1-.98h3.672z" },
        { d: "M13.5 10a.5.5 0 0 1 .5.5V12h1.5a.5.5 0 1 1 0 1H14v1.5a.5.5 0 1 1-1 0V13h-1.5a.5.5 0 0 1 0-1H13v-1.5a.5.5 0 0 1 .5-.5z" }
      ];
    case "geo-alt-fill":
      return [
        { d: "M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" }
      ];
    case "grid-3x3-gap":
      return [
        { d: "M4 2v2H2V2h2zm1 12v-2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm0-5V7a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm0-5V2a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm5 10v-2a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm0-5V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zm0-5V2a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1zM9 2v2H7V2h2zm5 0v2h-2V2h2zM4 7v2H2V7h2zm5 0v2H7V7h2zm5 0h-2v2h2V7zM4 12v2H2v-2h2zm5 0v2H7v-2h2zm5 0v2h-2v-2h2zM12 1a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1h-2zm-1 6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V7zm1 4a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-2z" }
      ];
    case "hdd-network-fill":
      return [
        { d: "M2 2a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h5.5v3A1.5 1.5 0 0 0 6 11.5H.5a.5.5 0 0 0 0 1H6A1.5 1.5 0 0 0 7.5 14h1a1.5 1.5 0 0 0 1.5-1.5h5.5a.5.5 0 0 0 0-1H10A1.5 1.5 0 0 0 8.5 10V7H14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2zm.5 3a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm2 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z" }
      ];
    case "lightning-charge-fill":
      return [
        { d: "M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z" }
      ];
    case "pencil-square":
      return [
        { d: "M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z" },
        { d: "M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z", fillRule: "evenodd" }
      ];
    case "scissors":
      return [
        { d: "M3.5 3.5c.828 0 1.5.672 1.5 1.5S4.328 6.5 3.5 6.5 2 5.828 2 5s.672-1.5 1.5-1.5zM6 5c0-.813-.39-1.536-.993-1.993L8 0h2L5.993 4.007C5.39 4.464 5 5.187 5 6c0 .383.085.747.238 1.073L0 12.31V14h1.69l5.237-5.238A2.985 2.985 0 0 0 8 9c.813 0 1.536-.39 1.993-.993L14 12.014V10L9.993 5.993A2.985 2.985 0 0 0 10 6c0-.813-.39-1.536-.993-1.993L14 0h-2L7.073 4.927A2.985 2.985 0 0 0 6 5zm6.5 4.5c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5S11 11.828 11 11s.672-1.5 1.5-1.5z" }
      ];
    case "search":
      return [
        { d: "M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" }
      ];
    case "terminal":
      return [
        { d: "M6 9a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3A.5.5 0 0 1 6 9zM3.854 4.146a.5.5 0 1 0-.708.708L4.793 6.5 3.146 8.146a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2z" },
        { d: "M2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H2zm12 1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12z" }
      ];
    case "trash":
      return [
        { d: "M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" },
        { d: "M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z", fillRule: "evenodd" }
      ];
  }
}
function isHiddenFileName(name) {
  return !!name && name !== ".." && name.startsWith(".");
}
function isImageFile(name) {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(name);
}
function getFileExtensionLower(name) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
}
function compareImageGridImagesBy(a, b, key) {
  switch (key) {
    case "size":
      return (a.item.rawSize || 0) - (b.item.rawSize || 0);
    case "date":
      return (a.item.rawModified || 0) - (b.item.rawModified || 0);
    case "type":
      return IMAGE_GRID_SORT_COLLATOR.compare(getFileExtensionLower(a.item.name), getFileExtensionLower(b.item.name));
    case "dimensions":
      return (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0);
    case "name":
    default:
      return IMAGE_GRID_SORT_COLLATOR.compare(a.item.name, b.item.name);
  }
}
function sortImageGridImages(images, key, descending) {
  images.sort((a, b) => {
    let comparison = compareImageGridImagesBy(a, b, key);
    if (comparison === 0 && key !== "name") {
      comparison = IMAGE_GRID_SORT_COLLATOR.compare(a.item.name, b.item.name);
    }
    return descending ? -comparison : comparison;
  });
}
function isArchiveFile(name) {
  return /\.(zip|rar|7z|tar|tgz|tar\.gz|tar\.bz2|tbz2|tar\.xz|txz|tar\.zst|tzst|gz|bz2|xz)$/i.test(name);
}
function getMimeType(name) {
  const lower = name.toLowerCase();
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
  if (lower.endsWith(".avif")) {
    return "image/avif";
  }
  if (lower.endsWith(".ico")) {
    return "image/x-icon";
  }
  if (lower.endsWith(".bmp")) {
    return "image/bmp";
  }
  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "text/plain";
}
function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
function quantizeNumber(value, step) {
  const normalizedStep = Math.max(1, Math.round(step));
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value / normalizedStep) * normalizedStep;
}
function formatSize(size) {
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
function trimTrailingSlash(path) {
  return path.length > 1 ? path.replace(/[\\/]+$/, "") : path;
}
function formatDuration(milliseconds) {
  const seconds = Math.max(0.1, Math.max(0, milliseconds) / 1e3);
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}
function formatThroughput(bytes, milliseconds) {
  if (bytes <= 0 || milliseconds <= 0) {
    return "";
  }
  return `${formatTransferRate(bytes / milliseconds * 1e3)}/s`;
}
function formatTransferRate(bytesPerSecond) {
  if (bytesPerSecond < 1e3) {
    return `${Math.round(bytesPerSecond)} B`;
  }
  const kb = bytesPerSecond / 1e3;
  if (kb < 1e3) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1e3;
  if (mb < 1e3) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1e3).toFixed(1)} GB`;
}
function formatDate(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  const pad = (value) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export {
  TurboFileEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcYnJvd3NlclxcdHVyYm9maWxlRWRpdG9yLnRzIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxHQUFHLFdBQXNCLGlCQUErQjtBQUNqRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsY0FBYyxjQUFjLGdCQUFnQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBa0IsV0FBVyxnQkFBZ0I7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBbUwsNEJBQXlOO0FBQzVZLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLCtCQUErQixnQkFBZ0IsVUFBVSxnQ0FBZ0MsNkJBQTZCLFVBQWtFLG9CQUE2RztBQUM5UyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQWtHLHFCQUFxQix3QkFBd0I7QUFDL0ksU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFB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Q0FBQztBQUNqQztBQUVBLFNBQVMsV0FBVyxXQUEyQjtBQUM5QyxNQUFJLENBQUMsV0FBVztBQUNmLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxPQUFPLElBQUksS0FBSyxTQUFTO0FBQy9CLFFBQU0sTUFBTSxDQUFDLFVBQWtCLE1BQU0sU0FBUyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQy9ELFNBQU8sR0FBRyxLQUFLLFlBQVksQ0FBQyxJQUFJLElBQUksS0FBSyxTQUFTLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLElBQUksSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLElBQUksSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQ2xJOyIsCiAgIm5hbWVzIjogWyJ3aW5kb3ciLCAic2VnbWVudHMiLCAiY3VycmVudCIsICJzaXplIiwgImMiLCAiYSIsICJzaWRlIiwgInRhc2siLCAicmVzdWx0IiwgInZpc2libGVJbmRleGVzIiwgImluc3RhbmNlIiwgImVudHJ5IiwgIm5vcm1hbGl6ZWQiLCAicGF0aCJdCn0K
