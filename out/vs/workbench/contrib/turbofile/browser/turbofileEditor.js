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
import { TurboFileEditorInput } from "../common/turbofileEditorInput.js";
import { TurboFileDeviceStore } from "./turbofileDeviceStore.js";
import { turboFileWorkbenchBridge } from "./turbofileWorkbenchBridge.js";
import { TurboFileDirectoryInflightTracker } from "../common/turbofileDirectoryInflight.js";
import { getTurboFileDirectoryMoveRefreshPaths, getTurboFileRowDragEffectAllowed, shouldHandleTurboFilePaneDropAtPage } from "../common/turbofileDragDrop.js";
import { getTurboFileImageGridCardSize, getTurboFileImageGridEffectiveColumns } from "../common/turbofileImageGridSizing.js";
import { createTurboFileImagePreviewReadOptions } from "../common/turbofileImagePreview.js";
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
const IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT = 2;
const IMAGE_GRID_PREVIEW_PREFETCH_DELAY_MS = 80;
const IMAGE_DPR_CAP = 2;
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
  constructor(group, telemetryService, workbenchThemeService, storageService, environmentService, sshService, contextMenuService, contextViewService, fileService, modelService, languageService, instantiationService, editorService, textEditorService, terminalService, terminalGroupService, terminalProfileService, quickInputService, clipboardService, configurationService, layoutService, updateService, productService) {
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
    if (this.taskbarHiddenForTerminal) {
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
    if (!this.taskbarHiddenForTerminal) {
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
    if (!this.container || this.taskbarHiddenForTerminal || this.activePage !== "transfer") {
      return;
    }
    const current = this.container.querySelector(".turbofile-taskbar");
    if (!current) {
      return;
    }
    current.replaceWith(this.renderTaskbar());
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
      const isRunningRsyncTask = task.status === "running" && this.isRsyncStrategy(task.strategy);
      if ((task.transferItems?.length ?? 0) > 1 && task.activeTransferItemIndex === void 0 && task.totalBytes !== void 0) {
        transferredBytes += task.transferredBytes ?? 0;
        totalBytes += isRunningRsyncTask ? 0 : task.totalBytes ?? 0;
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
      return 0;
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
    const totalBytes = isRsyncProgress ? 0 : event.totalBytes > 0 ? event.totalBytes : knownTotalBytes;
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
      loader.onload = async () => {
        try {
          await loader.decode?.();
        } catch {
        }
        resolve(loader);
      };
      loader.onerror = () => reject(new Error("Failed to load image"));
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
      const listing = device.id === LOCAL_WINDOWS_DEVICE_ID ? await this.sshService.listLocalDirectory(path, force) : await this.sshService.listRemoteDirectory(await this.getSshConnectionOptions(device), path, force);
      this.setDeviceRuntimeStatus(device, "online");
      const entry = {
        expiresAt: Date.now() + PANE_DIRECTORY_CACHE_TTL_MS,
        path: listing.path,
        items: this.toFileItems(device, listing.path, listing.entries)
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
    const targetPath = joinPanePath(state.path, name.trim(), this.isWindowsDevice(device));
    const task = this.beginTask("mkdir", `\u65B0\u5EFA\u6587\u4EF6\u5939 ${name.trim()}`, device.name);
    try {
      const result = await this.sshService.createDirectory(await this.toTransferEndpoint(device, targetPath));
      if (result.ok) {
        this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
        this.finishTask(task, "success", `\u5DF2\u521B\u5EFA\u6587\u4EF6\u5939\uFF1A${name.trim()}`);
      } else {
        this.finishTask(task, "error", `\u65B0\u5EFA\u6587\u4EF6\u5939\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u65B0\u5EFA\u6587\u4EF6\u5939\u5931\u8D25\uFF1A${message}`, { error: message });
    } finally {
      await this.refreshPane(side, { force: true });
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
    const targetPath = joinPanePath(state.path, name.trim(), this.isWindowsDevice(device));
    const task = this.beginTask("create-file", `\u65B0\u5EFA\u6587\u4EF6 ${name.trim()}`, device.name);
    try {
      const result = await this.sshService.writeFile(await this.toTransferEndpoint(device, targetPath), "", "utf8");
      if (result.ok) {
        this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
        this.finishTask(task, "success", `\u5DF2\u521B\u5EFA\u6587\u4EF6\uFF1A${name.trim()}`);
      } else {
        this.finishTask(task, "error", `\u65B0\u5EFA\u6587\u4EF6\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u65B0\u5EFA\u6587\u4EF6\u5931\u8D25\uFF1A${message}`, { error: message });
    } finally {
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
      let deleted = 0;
      const failures = [];
      for (const [index, item] of items.entries()) {
        this.updateTask(task, batch ? `\u6B63\u5728\u5220\u9664 ${index + 1}/${items.length}\uFF1A${item.name}` : `\u6B63\u5728\u5220\u9664\uFF1A${item.name}`, Math.min(88, 15 + Math.round(index / items.length * 70)));
        const result = await this.sshService.deletePath(await this.toTransferEndpoint(device, item.path), true);
        if (result.ok) {
          deleted++;
        } else {
          failures.push(`${item.name}: ${result.message}`);
        }
      }
      this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
      await this.refreshPane(side, { force: true });
      if (failures.length) {
        this.finishTask(task, "error", `\u5220\u9664\u5B8C\u6210 ${deleted} \u9879\uFF0C\u5931\u8D25 ${failures.length} \u9879\u3002`, { error: failures[0] });
        return;
      }
      this.finishTask(task, "success", batch ? `\u5DF2\u5220\u9664\uFF1A${deleted} \u9879` : `\u5DF2\u5220\u9664\uFF1A${items[0].name}`);
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
      let deleted = 0;
      const failures = [];
      for (const [index, item] of items.entries()) {
        this.updateTask(task, batch ? `\u6B63\u5728\u5220\u9664 ${index + 1}/${items.length}\uFF1A${item.name}` : `\u6B63\u5728\u5220\u9664\uFF1A${item.name}`, Math.min(88, 15 + Math.round(index / items.length * 70)));
        const result = await this.sshService.deletePath(await this.toTransferEndpoint(device, item.path), true);
        if (result.ok) {
          deleted++;
        } else {
          failures.push(`${item.name}: ${result.message}`);
        }
      }
      this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
      await this.refreshPane(state.side, { force: true });
      if (failures.length) {
        this.finishTask(task, "error", `\u5220\u9664\u5B8C\u6210 ${deleted} \u5F20\uFF0C\u5931\u8D25 ${failures.length} \u5F20\u3002`, { error: failures[0] });
        return;
      }
      this.finishTask(task, "success", batch ? `\u5DF2\u5220\u9664\uFF1A${deleted} \u5F20\u56FE\u7247` : `\u5DF2\u5220\u9664\uFF1A${items[0].name}`);
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
      const previousColumns = this.getImageGridEffectiveColumns(state);
      const previousRowHeight = this.getImageGridRowHeight(state);
      const requestWidth = this.getImageGridThumbnailRequestWidth(state);
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
      const sourceWidth = result.originalWidth ?? result.width ?? resolvedWidth;
      const sourceHeight = result.originalHeight ?? result.height ?? resolvedHeight;
      image.thumbnailContent = thumbnailUrl ? "" : result.ok ? result.content : "";
      image.thumbnailUrl = thumbnailUrl;
      image.thumbnailMime = result.mime || getMimeType(image.item.name);
      image.thumbnailError = result.ok ? void 0 : result.message;
      image.width = sourceWidth;
      image.height = sourceHeight;
      this.clearImageGridLayoutMetrics(state);
      if (result.ok) {
        this.imageGridLoadedThumbnailIndexes.add(index);
      }
      const nextColumns = this.getImageGridEffectiveColumns(state);
      const nextRowHeight = this.getImageGridRowHeight(state);
      if (previousColumns !== nextColumns || previousRowHeight !== nextRowHeight) {
        this.imageGridRenderedRange = void 0;
        this.updateImageGridVirtualSlice(state, this.getImageGridVirtualRange(state));
      } else {
        this.updateImageGridCard(index);
      }
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
    image.previewLoading = true;
    if (!silent && state.selectedIndex === index && (!requestSeq || requestSeq === this.imageGridPreviewRequestSeq)) {
      this.updateImagePreviewOverlay();
    }
    try {
      const result = await this.readImageGridImage(device, image.item.path, createTurboFileImagePreviewReadOptions(image.item.rawSize, image.item.rawModified));
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
    return this.remoteFileSystemProvider;
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
      await this.editorService.openEditor(fileEditor, {
        pinned: true,
        revealIfOpened: true,
        override: DEFAULT_EDITOR_ASSOCIATION.id,
        index: this.getDocumentEditorTargetIndex()
      });
    } catch (error) {
      reportOpenError(error);
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
  __decorateParam(22, IProductService)
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
  return /\.(zip|tar|tgz|tar\.gz|tar\.bz2|tbz2|tar\.xz|txz)$/i.test(name);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcYnJvd3NlclxcdHVyYm9maWxlRWRpdG9yLnRzIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxHQUFHLFdBQXNCLGlCQUErQjtBQUNqRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsY0FBYyxjQUFjLGdCQUFnQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBa0IsV0FBVyxnQkFBZ0I7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBd0gsNEJBQXlOO0FBQ2pWLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLCtCQUErQixnQkFBZ0IsVUFBVSxnQ0FBZ0MsNkJBQTZCLFVBQWtFLG9CQUE2RztBQUM5UyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQWtHLHFCQUFxQix3QkFBd0I7QUFDL0ksU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFB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V0FBTyxHQUFHLEdBQUcsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUN4QjtBQUNBLFNBQU8sSUFBSSxLQUFLLEtBQU0sUUFBUSxDQUFDLENBQUM7QUFDakM7QUFFQSxTQUFTLFdBQVcsV0FBMkI7QUFDOUMsTUFBSSxDQUFDLFdBQVc7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sT0FBTyxJQUFJLEtBQUssU0FBUztBQUMvQixRQUFNLE1BQU0sQ0FBQyxVQUFrQixNQUFNLFNBQVMsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUMvRCxTQUFPLEdBQUcsS0FBSyxZQUFZLENBQUMsSUFBSSxJQUFJLEtBQUssU0FBUyxJQUFJLENBQUMsQ0FBQyxJQUFJLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxJQUFJLElBQUksS0FBSyxTQUFTLENBQUMsQ0FBQyxJQUFJLElBQUksS0FBSyxXQUFXLENBQUMsQ0FBQztBQUNsSTsiLAogICJuYW1lcyI6IFsid2luZG93IiwgInNlZ21lbnRzIiwgImN1cnJlbnQiLCAic2l6ZSIsICJjIiwgImEiLCAic2lkZSIsICJ0YXNrIiwgInZpc2libGVJbmRleGVzIiwgImluc3RhbmNlIiwgImVudHJ5IiwgIm5vcm1hbGl6ZWQiLCAicGF0aCJdCn0K
