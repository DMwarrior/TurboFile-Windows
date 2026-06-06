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
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { DEFAULT_EDITOR_ASSOCIATION } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
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
const IMAGE_GRID_VIEW_OPTIONS = [
  { columns: 4, kind: "large", label: "\u5927\u56FE\u7F51\u683C" },
  { columns: 12, kind: "medium", label: "\u6807\u51C6\u7F51\u683C" }
];
const IMAGE_GRID_COLUMN_STEPS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const IMAGE_GRID_NEIGHBOR_LOAD_COUNT = 2;
const IMAGE_GRID_OVERSCAN_ROWS = 1;
const IMAGE_GRID_CARD_GAP = 16;
const IMAGE_GRID_CARD_VERTICAL_CHROME = 58;
const IMAGE_GRID_THUMB_MIN = 96;
const IMAGE_GRID_THUMB_MAX = 640;
const IMAGE_GRID_THUMB_STEP = 64;
const IMAGE_GRID_ORIGINAL_CARD_DIMENSION_THRESHOLD = 100;
const IMAGE_GRID_CTRL_WHEEL_STEP_THRESHOLD = 100;
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
  constructor(group, telemetryService, workbenchThemeService, storageService, environmentService, sshService, contextMenuService, contextViewService, fileService, modelService, languageService, instantiationService, editorService, terminalService, terminalGroupService, terminalProfileService, quickInputService, clipboardService, configurationService, layoutService) {
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
    this.terminalService = terminalService;
    this.terminalGroupService = terminalGroupService;
    this.terminalProfileService = terminalProfileService;
    this.quickInputService = quickInputService;
    this.clipboardService = clipboardService;
    this.configurationService = configurationService;
    this.layoutService = layoutService;
    this.renderDisposables = this._register(new DisposableStore());
    this.devices = [];
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
    this.paneDirectoryInflight = /* @__PURE__ */ new Map();
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
    this.deviceConnectionMessages = /* @__PURE__ */ new Map();
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
      this.ensureTitlebarThemeToggle();
      if (this.activePage === "themes") {
        this.render();
      }
    }));
    void this.syncNativeEditorDisplaySettings();
    void this.loadColorThemes();
    void this.refreshWindowsDriveRoots();
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
  }
  setVisible(visible) {
    super.setVisible(visible);
    this.isEditorVisible = visible;
    document.body.classList.toggle("turbofile-main-editor-visible", visible);
    this.updateTransferTabsVisibility();
    if (visible) {
      void this.syncActiveTerminalForCurrentPage();
      this.applyTurboFileThemeState();
      this.ensureTitlebarThemeToggle();
    } else {
      this.removeTitlebarThemeToggle();
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
    this.removeTitlebarThemeToggle();
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
    this.ensureTitlebarThemeToggle();
    if (this.previewState) {
      this.container.appendChild(this.renderPreviewOverlay());
    }
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
    this.renderDisposables.add({ dispose: () => this.container?.removeEventListener("keydown", handleKeydown) });
  }
  handleWorkbenchKeydown(event) {
    if (event.defaultPrevented || event.key !== "Delete" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }
    const side = this.getDeleteKeyboardTargetSide(event);
    if (!side) {
      return;
    }
    event.preventDefault();
    void this.deleteSelected(side);
  }
  getDeleteKeyboardTargetSide(event) {
    if (this.activePage !== "transfer" || this.dialogState || this.previewState || this.imageGridState?.previewVisible || this.isDeviceFormVisible || this.isTaskLogVisible) {
      return void 0;
    }
    const target = event.target;
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
  }
  /**
   * dragstart handler for a file-list row. Marks the drag as TurboFile-originated (so internal
   * drop handlers can detect it via the side data) and remembers the source side so a later
   * dragleave from the window can hand off to the Windows native drag pipeline. Drags from the
   * TurboFile file area are always copy-only by design — there is no Shift-to-move semantic.
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
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-turbofile-side", side);
    event.dataTransfer.setData("application/x-turbofile-operation", "copy");
    const items = this.getSelectedTransferItems(side);
    const labels = items.length ? items.map((i) => i.name) : [item.name];
    event.dataTransfer.setData("text/plain", labels.join("\n"));
    this.tryStartImmediateLocalWindowsDrag(side, event);
  }
  tryStartImmediateLocalWindowsDrag(side, event) {
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
   * Windows directly; remote files are staged through the normal transfer pipeline first so
   * Explorer/Desktop still receives real Windows paths.
   */
  async startWindowsFileDragFromPane(side) {
    const device = this.getPaneDevice(side);
    if (!device) {
      return;
    }
    if (device.id !== LOCAL_WINDOWS_DEVICE_ID) {
      this.statusMessage = "SSH \u6587\u4EF6\u6682\u4E0D\u652F\u6301\u76F4\u63A5\u62D6\u5230 Windows\u3002\u8BF7\u7528 Ctrl+C \u590D\u5236\uFF0C\u6216\u628A\u672C\u5730\u9762\u677F\u5207\u5230\u76EE\u6807\u76EE\u5F55\u540E\u4F20\u8F93\u3002";
      this.render();
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
    const targetSide = this.getTransferDropTargetSide(event);
    event.preventDefault();
    event.stopPropagation();
    this.setExternalDropTargetSide(void 0);
    const sourceSide = this.getTurboFileDragSourceSide(event);
    if (sourceSide) {
      if (sourceSide !== targetSide) {
        void this.transferSelected(sourceSide, targetSide);
      }
      this.clearCurrentFileDragState();
      return;
    }
    const externalPaths = this.extractExternalDropPaths(event);
    if (externalPaths.length) {
      void this.transferExternalPaths(targetSide, externalPaths, "copy");
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
  ensureTitlebarThemeToggle(retry = 0) {
    if (!document.body.classList.contains("turbofile-main-editor-visible")) {
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
  renderDevicePageCard(device) {
    const card = $(".turbofile-page-card.turbofile-device-page-card");
    card.classList.add(`is-tone-${this.getDeviceCardTone(device)}`);
    const title = $(".turbofile-page-card-title");
    title.appendChild(this.renderDevicePageIcon(device));
    const titleText = $("span");
    titleText.textContent = device.name;
    title.appendChild(titleText);
    const status = $("span.turbofile-device-card-status");
    status.textContent = "\u5728\u7EBF";
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
        return device.capabilities.tar || device.capabilities.rsync ? "\u667A\u80FD\u6781\u901F\uFF08\u6309\u573A\u666F\u81EA\u52A8\uFF09" : "\u667A\u80FD\u6781\u901F\uFF08\u81EA\u52A8\u515C\u5E95\uFF09";
      case "rsync":
        return device.capabilities.rsync ? "rsync \u589E\u91CF\uFF08\u53EF\u7528\uFF09" : "rsync \u589E\u91CF\uFF08\u672A\u901A\u8FC7\u68C0\u6D4B\uFF09";
      case "tar":
        return device.capabilities.tar ? "tar \u76EE\u5F55\u4F20\u8F93\uFF08\u53EF\u7528\uFF09" : "tar \u76EE\u5F55\u4F20\u8F93\uFF08\u5C06\u81EA\u52A8\u515C\u5E95\uFF09";
      case "scp":
        return device.capabilities.scp ? "SCP \u6587\u4EF6\uFF08\u53EF\u7528\uFF09" : "SCP \u6587\u4EF6\uFF08\u672A\u901A\u8FC7\u68C0\u6D4B\uFF09";
      case "sftp":
      default:
        return "SFTP \u7A33\u5B9A\u6A21\u5F0F";
    }
  }
  renderSettingsPage() {
    const page = $(".turbofile-full-page");
    page.appendChild(this.renderPageHeader(Codicon.settingsGear, "\u7CFB\u7EDF\u8BBE\u7F6E", "\u7BA1\u7406 \u6781\u901F\u4F20 \u7684\u672C\u5730\u884C\u4E3A\u3001\u5B57\u4F53\u548C\u5FEB\u6377\u64CD\u4F5C\u3002"));
    const actionsSection = $(".turbofile-settings-section");
    const actionsTitle = $(".turbofile-section-title");
    actionsTitle.appendChild(renderIcon(Codicon.tools));
    actionsTitle.append("\u5FEB\u6377\u64CD\u4F5C");
    actionsSection.appendChild(actionsTitle);
    const quickActions = $(".turbofile-settings-actions");
    quickActions.appendChild(this.createPageButton(Codicon.plug, "\u6D4B\u8BD5\u5F53\u524D SSH \u8BBE\u5907", () => {
      void this.testCurrentSshConnection();
    }));
    quickActions.appendChild(this.createPageButton(Codicon.terminal, "\u6253\u5F00\u5DE6\u4FA7\u7EC8\u7AEF", () => {
      void this.openTerminal("left");
    }));
    quickActions.appendChild(this.createPageButton(Codicon.terminal, "\u6253\u5F00\u53F3\u4FA7\u7EC8\u7AEF", () => {
      void this.openTerminal("right");
    }));
    quickActions.appendChild(this.createPageButton(Codicon.sync, "\u540C\u6B65\u6587\u4EF6\u5939", () => {
      void this.syncSelectedDirectories();
    }, true));
    actionsSection.appendChild(quickActions);
    page.appendChild(actionsSection);
    return page;
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
    const themes = [...this.getBuiltinColorThemes(), ...this.availableColorThemes];
    return themes.find((theme) => theme.label === label || theme.id === themeId) ?? themes.find((theme) => theme.settingsId === settingsId) ?? this.createBuiltinColorTheme(mode === "dark" ? "vs-dark turbofile-2017-dark-cpp" : TURBOFILE_LIGHT_THEME_CLASS_ID, label, settingsId, mode === "dark" ? COLOR_THEME_DARK_INITIAL_COLORS : TURBOFILE_LIGHT_THEME_COLORS);
  }
  async applyAppearanceMode(mode) {
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
        await this.workbenchThemeService.setColorTheme(preferred === ColorScheme.LIGHT ? lightTheme : darkTheme, "auto");
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
      await this.workbenchThemeService.setColorTheme(theme, "auto");
      this.statusMessage = `\u5DF2\u5207\u6362\u4E3B\u9898\uFF1A${this.getThemeLabel(theme)}`;
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u5207\u6362\u4E3B\u9898\u5931\u8D25\uFF1A${message}`;
      this.render();
    }
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
    this.render();
    const task = this.beginTask("ssh-test", `\u6D4B\u8BD5 ${device.name}`, `${device.username}@${device.host}:${device.port || 22}`);
    const result = await this.sshService.testConnection(await this.getSshConnectionOptions(device));
    if (result.ok) {
      this.finishTask(task, "success", `SSH \u8FDE\u63A5\u6210\u529F\uFF1A${device.name}`);
      this.deviceConnectionMessages.set(device.id, { status: "success", message: `SSH \u8FDE\u63A5\u6210\u529F\uFF1A${device.name}` });
      this.statusMessage = `SSH \u8FDE\u63A5\u6210\u529F\uFF1A${device.name}`;
    } else {
      this.finishTask(task, "error", `SSH \u8FDE\u63A5\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      this.deviceConnectionMessages.set(device.id, { status: "error", message: `SSH \u8FDE\u63A5\u5931\u8D25\uFF1A${result.message}` });
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
      if ((capabilities.tar || capabilities.rsync) && capabilities.scp) {
        return { status: "success", message: "\u667A\u80FD\u6781\u901F\u53EF\u7528\uFF1A\u76EE\u5F55\u4F18\u5148 tar+ssh\uFF0C\u5355\u6587\u4EF6\u4F18\u5148 SCP\uFF1Brsync \u4EC5\u5728\u9009\u62E9 rsync \u589E\u91CF\u65F6\u4F7F\u7528\u3002", capabilities, missingDependencies: [] };
      }
      if (capabilities.scp || capabilities.sftp) {
        return { status: "success", message: "\u672A\u68C0\u6D4B\u5230\u5B8C\u6574 rsync/tar/scp \u80FD\u529B\uFF0C\u5C06\u81EA\u52A8\u4F7F\u7528\u53EF\u7528\u534F\u8BAE\u515C\u5E95\u3002", capabilities, missingDependencies: [] };
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
      if (capabilities.tar || capabilities.archive) {
        return { status: "success", message: "tar \u76EE\u5F55\u4F20\u8F93\u53EF\u7528\uFF1Btar \u5931\u8D25\u65F6\u4F1A\u81EA\u52A8\u515C\u5E95\u3002", capabilities, missingDependencies: [] };
      }
      return { status: "success", message: "tar \u672A\u68C0\u6D4B\u5230\uFF0C\u5C06\u81EA\u52A8\u4F7F\u7528 rsync/SCP/SFTP \u515C\u5E95\u3002", capabilities, missingDependencies: [] };
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
      this.setActivePage("settings");
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
      event.preventDefault();
      this.setExternalDropTargetSide(void 0);
      const sourceSide = event.dataTransfer?.getData("application/x-turbofile-side");
      if (sourceSide && sourceSide !== side) {
        void this.transferSelected(sourceSide, side);
        return;
      }
      const externalPaths = this.extractExternalDropPaths(event);
      if (externalPaths.length) {
        void this.transferExternalPaths(side, externalPaths, "copy");
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
    button.type = "button";
    button.title = "\u9009\u62E9\u8BBE\u5907";
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
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
        this.setPaneDevice(side, device);
      });
      menu.appendChild(option);
    }
    const closeMenu = () => {
      select.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    };
    const toggleMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = !select.classList.contains("is-open");
      for (const opened of Array.from(this.container?.querySelectorAll(".turbofile-device-select.is-open") ?? [])) {
        opened.classList.remove("is-open");
        opened.querySelector(".turbofile-device-select-button")?.setAttribute("aria-expanded", "false");
      }
      select.classList.toggle("is-open", nextOpen);
      button.setAttribute("aria-expanded", String(nextOpen));
      if (nextOpen) {
        const selected = menu.querySelector(".turbofile-device-select-option.is-selected") ?? menu.querySelector(".turbofile-device-select-option");
        selected?.focus();
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
        closeMenu();
        button.focus();
      }
    });
    const window2 = getWindow(select);
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
    window2.addEventListener("click", handleWindowClick);
    window2.addEventListener("keydown", handleWindowKeydown);
    this.renderDisposables.add({ dispose: () => window2.removeEventListener("click", handleWindowClick) });
    this.renderDisposables.add({ dispose: () => window2.removeEventListener("keydown", handleWindowKeydown) });
    select.appendChild(button);
    select.appendChild(menu);
    return select;
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
      const transferSizeText = liveSummary.totalBytes > 0 ? `${formatSize(liveSummary.transferredBytes)} / ${formatSize(liveSummary.totalBytes)}` : liveSummary.transferredBytes > 0 ? formatSize(liveSummary.transferredBytes) : "\u51C6\u5907\u4E2D";
      right.appendChild(this.renderStatusbarItem(Codicon.arrowSwap, this.formatSpeed(liveSummary.speedBytesPerSecond), "\u5F53\u524D\u901F\u5EA6"));
      right.appendChild(this.renderStatusbarItem(Codicon.clock, this.formatRemaining(liveSummary.remainingMs), "\u5269\u4F59\u65F6\u95F4"));
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
    for (const task of tasks) {
      startedAt = startedAt === void 0 ? task.startedAt : Math.min(startedAt, task.startedAt);
      if ((task.transferItems?.length ?? 0) > 1 && task.activeTransferItemIndex === void 0 && task.totalBytes !== void 0) {
        transferredBytes += task.transferredBytes ?? 0;
        totalBytes += task.totalBytes ?? 0;
        speedBytesPerSecond += task.status === "running" ? task.speedBytesPerSecond ?? 0 : 0;
        continue;
      }
      const items = this.getLiveTransferItems(task);
      for (const item of items) {
        transferredBytes += item.transferredBytes;
        totalBytes += this.getLiveTransferItemTotal(item);
        speedBytesPerSecond += item.status === "running" ? item.speedBytesPerSecond : 0;
      }
    }
    const remainingBytes = Math.max(0, totalBytes - transferredBytes);
    return {
      transferredBytes,
      totalBytes,
      speedBytesPerSecond,
      remainingMs: speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond * 1e3 : void 0,
      startedAt
    };
  }
  getLiveTransferItemTotal(item) {
    return Math.max(item.totalBytes, item.rawSize, item.transferredBytes, 0);
  }
  formatSpeed(bytesPerSecond) {
    return bytesPerSecond && bytesPerSecond > 0 ? `${formatTransferRate(bytesPerSecond)}/s` : "--";
  }
  formatRemaining(milliseconds) {
    return milliseconds !== void 0 && Number.isFinite(milliseconds) && milliseconds >= 0 ? formatDuration(milliseconds) : "--";
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
    const knownTotalBytes = activeItem ? activeItem.totalBytes : task.totalBytes ?? 0;
    const totalBytes = event.totalBytes > 0 ? event.totalBytes : knownTotalBytes;
    const transferredBytes = Math.min(event.transferredBytes, totalBytes > 0 ? totalBytes : event.transferredBytes);
    const progress = totalBytes > 0 ? Math.max(0, Math.min(100, Math.round(transferredBytes / totalBytes * 100))) : event.phase === "complete" ? 100 : Math.max(8, task.progress);
    let detail = this.formatTransferProgressDetail(event.phase, transferredBytes, totalBytes);
    if (event.totalItems && event.totalItems > 1) {
      const completedItems = Math.max(0, Math.min(event.completedItems ?? 0, event.totalItems));
      const currentName = event.currentName ? `\uFF1A${event.currentName}` : "";
      detail = `${detail} \xB7 ${completedItems}/${event.totalItems}${currentName}`;
    }
    const now = Date.now();
    const speed = this.calculateTransferSpeed(activeItem ?? task, transferredBytes, now);
    const strategy = this.getTransferStrategyFromProgress(event) ?? task.strategy;
    const isDataPhase = event.phase !== "prepare" && event.phase !== "complete" && transferredBytes > 0;
    if (isDataPhase && task.transferStartedAt === void 0) {
      task.transferStartedAt = now;
    }
    if (activeItem) {
      activeItem.startedAt ??= task.startedAt;
      if (isDataPhase && activeItem.transferStartedAt === void 0) {
        activeItem.transferStartedAt = now;
      }
      activeItem.status = event.phase === "complete" ? "success" : "running";
      activeItem.transferredBytes = transferredBytes;
      activeItem.totalBytes = totalBytes;
      activeItem.progress = event.phase === "complete" ? 100 : progress;
      activeItem.speedBytesPerSecond = speed;
      activeItem.remainingMs = speed > 0 && totalBytes > transferredBytes ? (totalBytes - transferredBytes) / speed * 1e3 : void 0;
      activeItem.strategy = strategy;
      if (event.phase === "complete") {
        activeItem.endedAt = now;
      }
      this.appendTransferSpeedSample(activeItem.speedSamples, speed);
    }
    const aggregate = this.getLiveTransferAggregate([task]);
    task.transferredBytes = activeItem ? aggregate.transferredBytes : transferredBytes;
    task.totalBytes = activeItem ? aggregate.totalBytes : totalBytes;
    task.speedBytesPerSecond = speed;
    task.remainingMs = aggregate.remainingMs;
    task.strategy = strategy;
    task.progress = activeItem && aggregate.totalBytes > 0 ? Math.max(0, Math.min(100, Math.round(aggregate.transferredBytes / aggregate.totalBytes * 100))) : event.phase === "complete" ? 100 : progress;
    task.detail = detail;
    this.appendTransferSpeedSample(task.speedSamples ??= [], speed);
    this.statusMessage = detail;
    if (event.phase === "complete" || transferredBytes >= totalBytes || now - (task.lastProgressRenderAt ?? 0) > 150) {
      task.lastProgressRenderAt = now;
      this.render();
    }
  }
  calculateTransferSpeed(target, transferredBytes, now) {
    const previousAt = target.lastSampleAt;
    const previousBytes = target.lastSampleBytes;
    target.lastSampleAt = now;
    target.lastSampleBytes = transferredBytes;
    if (previousAt === void 0 || previousBytes === void 0 || now <= previousAt || transferredBytes < previousBytes) {
      return 0;
    }
    const elapsed = now - previousAt;
    return elapsed > 0 ? (transferredBytes - previousBytes) / elapsed * 1e3 : 0;
  }
  appendTransferSpeedSample(samples, speed) {
    if (!Number.isFinite(speed) || speed <= 0) {
      return;
    }
    samples.push(speed);
    if (samples.length > 32) {
      samples.splice(0, samples.length - 32);
    }
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
    if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
      if (targetDevice.preferredTransferProtocol === "auto-fast" && sourceItem.directory) {
        return targetDevice.capabilities.rsync ? "rsync-upload" : "scp-upload";
      }
      if (targetDevice.preferredTransferProtocol === "tar" && sourceItem.directory) {
        return "tar-upload";
      }
      if (targetDevice.preferredTransferProtocol === "rsync" && this.canUseLocalRsyncCommand(targetDevice)) {
        return "rsync-upload";
      }
      if (targetDevice.preferredTransferProtocol !== "sftp") {
        return "scp-upload";
      }
      return "sftp-upload";
    }
    if (targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
      if (sourceDevice.preferredTransferProtocol === "auto-fast" && sourceItem.directory) {
        return sourceDevice.capabilities.rsync ? "rsync-download" : "scp-download";
      }
      if (sourceDevice.preferredTransferProtocol === "tar" && sourceItem.directory) {
        return "tar-download";
      }
      if (sourceDevice.preferredTransferProtocol === "rsync" && this.canUseLocalRsyncCommand(sourceDevice)) {
        return "rsync-download";
      }
      if (sourceDevice.preferredTransferProtocol !== "sftp") {
        return "scp-download";
      }
      return "sftp-download";
    }
    if (this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
      return "remote-copy";
    }
    if (!this.isWindowsDevice(sourceDevice) && !this.isWindowsDevice(targetDevice)) {
      if (sourceDevice.preferredTransferProtocol === "auto-fast") {
        return sourceItem.directory && sourceDevice.capabilities.rsync && targetDevice.capabilities.rsync ? "rsync-direct" : "scp-direct";
      }
      if (sourceDevice.preferredTransferProtocol === "rsync") {
        return sourceDevice.capabilities.rsync && targetDevice.capabilities.rsync ? sourceItem.directory ? "rsync-direct-parallel" : "rsync-direct" : "rsync-relay";
      }
      if (sourceDevice.preferredTransferProtocol === "tar") {
        return sourceItem.directory && sourceDevice.capabilities.tar && targetDevice.capabilities.tar ? "tar-direct" : "scp-direct";
      }
      return sourceDevice.preferredTransferProtocol === "sftp" ? "sftp-direct" : "scp-direct";
    }
    return "sftp-direct";
  }
  canUseLocalRsyncCommand(device) {
    return device.capabilities.rsync;
  }
  shouldDeferSshToSshStrategy(sourceDevice, targetDevice) {
    return sourceDevice.id !== LOCAL_WINDOWS_DEVICE_ID && targetDevice.id !== LOCAL_WINDOWS_DEVICE_ID && !this.isSameDeviceForNativeOperation(sourceDevice, targetDevice);
  }
  formatTransferProgressDetail(phase, transferredBytes, totalBytes) {
    const phaseLabel = phase === "relay-download" ? "\u4E2D\u8F6C\u4E0B\u8F7D" : phase === "relay-upload" ? "\u4E2D\u8F6C\u4E0A\u4F20" : phase === "rsync-direct" ? "\u76F4\u8FDE\u4F20\u8F93" : phase === "prepare" ? "\u51C6\u5907\u4F20\u8F93" : phase === "complete" ? "\u4F20\u8F93\u5B8C\u6210" : "\u6B63\u5728\u4F20\u8F93";
    if (totalBytes > 0) {
      return `${phaseLabel}\uFF1A${formatSize(transferredBytes)} / ${formatSize(totalBytes)}`;
    }
    return phaseLabel;
  }
  finishTask(task, status, detail, options = {}) {
    task.status = status;
    task.detail = detail;
    task.endedAt = Date.now();
    task.durationMs = options.durationMs ?? task.durationMs;
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
  renderPreviewOverlay() {
    const preview = this.previewState;
    const overlay = $(".turbofile-preview-overlay");
    const panel = $(".turbofile-preview-panel");
    if (!preview) {
      return overlay;
    }
    const header = $(".turbofile-preview-header");
    const title = $(".turbofile-preview-title");
    title.appendChild(renderIcon(preview.mode === "image" ? Codicon.preview : preview.mode === "text" ? Codicon.symbolFile : Codicon.fileBinary));
    title.append(`${preview.item.name}${preview.dirty ? " *" : ""}`);
    header.appendChild(title);
    const actions = $(".turbofile-preview-actions");
    if (preview.mode === "text" && !preview.loading && !preview.error) {
      const save = this.createButton("\u4FDD\u5B58", "turbofile-primary-button");
      save.element.addEventListener("click", () => this.savePreview());
      actions.appendChild(save.element);
    }
    const close = this.createButton("\u5173\u95ED", "turbofile-secondary-button");
    close.element.addEventListener("click", () => {
      this.previewState = void 0;
      this.render();
    });
    actions.appendChild(close.element);
    header.appendChild(actions);
    panel.appendChild(header);
    const body = $(".turbofile-preview-body");
    if (preview.loading) {
      body.textContent = "\u6B63\u5728\u52A0\u8F7D...";
    } else if (preview.error) {
      body.textContent = preview.error;
    } else if (preview.mode === "image") {
      const image = document.createElement("img");
      image.className = "turbofile-preview-image";
      image.src = `data:${preview.mime};base64,${preview.content}`;
      image.alt = preview.item.name;
      image.addEventListener("contextmenu", (event) => this.showPreviewImageContextMenu(event));
      body.appendChild(image);
    } else if (preview.mode === "text") {
      const textarea = document.createElement("textarea");
      textarea.className = "turbofile-preview-textarea";
      textarea.spellcheck = false;
      textarea.value = preview.content;
      textarea.addEventListener("input", () => {
        preview.content = textarea.value;
        preview.dirty = true;
      });
      body.appendChild(textarea);
    } else {
      body.textContent = `\u8BE5\u6587\u4EF6\u7C7B\u578B\u6682\u4E0D\u652F\u6301\u5185\u5D4C\u9884\u89C8\u3002\u5927\u5C0F\uFF1A${preview.item.size || "\u672A\u77E5"}`;
    }
    panel.appendChild(body);
    overlay.appendChild(panel);
    return overlay;
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
      card.addEventListener("click", () => this.selectImageGridItem(index));
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
    for (const option of IMAGE_GRID_VIEW_OPTIONS) {
      actions.appendChild(this.renderImageGridViewButton(state, option));
    }
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
    body.addEventListener("wheel", (event) => this.handleImageGridWheel(event, body), { passive: false });
    const grid = $(".turbofile-image-page-grid");
    grid.style.setProperty("--turbofile-image-grid-columns", String(state.columns));
    this.renderImageGridSlice(grid, state, range);
    body.appendChild(grid);
    page.appendChild(body);
    const scrollTop = state.scrollTop;
    if (scrollTop > 0) {
      getWindow(body).requestAnimationFrame(() => {
        if (body.isConnected) {
          body.scrollTop = scrollTop;
        }
      });
    }
    return page;
  }
  renderImageGridViewButton(state, option) {
    const button = $("button.turbofile-image-page-action");
    button.type = "button";
    button.title = option.label;
    button.setAttribute("aria-label", option.label);
    button.setAttribute("aria-pressed", String(state.columns === option.columns));
    if (state.columns === option.columns) {
      button.classList.add("is-active");
    }
    button.appendChild(this.renderImageGridViewIcon(option.kind));
    button.addEventListener("click", () => this.setImageGridColumns(option.columns));
    return button;
  }
  renderImageGridViewIcon(kind) {
    const icon = $("span.turbofile-image-page-view-icon");
    icon.classList.add(`is-${kind}`);
    const cellCount = kind === "large" ? 4 : kind === "medium" ? 9 : 3;
    for (let index = 0; index < cellCount; index++) {
      icon.appendChild($("span"));
    }
    return icon;
  }
  renderImageGridSlice(grid, state, range) {
    clearNode(grid);
    grid.style.setProperty("--turbofile-image-grid-columns", String(state.columns));
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
      columns: state.columns,
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
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.title = image.item.name;
    card.dataset.imageIndex = String(index);
    if (state.selectedIndex === index) {
      card.classList.add("is-selected");
    }
    const preview = $(".turbofile-image-page-card-preview");
    const thumbnailSrc = image.thumbnailUrl || (image.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : "");
    if (thumbnailSrc) {
      const thumb = document.createElement("img");
      thumb.loading = "eager";
      thumb.decoding = "async";
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
    name.addEventListener("pointerdown", (event) => event.stopPropagation());
    name.addEventListener("click", (event) => event.stopPropagation());
    name.addEventListener("dblclick", (event) => event.stopPropagation());
    card.appendChild(name);
    card.addEventListener("click", () => this.selectImageGridItem(index));
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
        this.selectImageGridItem(index);
      }
    });
    return card;
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
    toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.download, "\u4E0B\u8F7D\u56FE\u7247", () => this.downloadImageGridPreview()));
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
      this.rememberPaneDevicePath(side, device, listing.path);
      this.prefetchNeighborDirectories(device, listing.path, listing.items);
      this.clearPaneSelection(side);
      this.statusMessage = `${device.name} \u5DF2\u52A0\u8F7D ${state.items.filter((item) => !item.parent).length} \u9879\u3002`;
      this.rememberPaneDeviceSnapshot(side);
    } catch (error) {
      if (this.paneRequestSeq[side] === requestId) {
        const message = error instanceof Error ? error.message : String(error);
        state.error = message;
        this.statusMessage = `${device.name} \u76EE\u5F55\u5237\u65B0\u5931\u8D25\uFF1A${message}`;
      }
    } finally {
      if (this.paneRequestSeq[side] === requestId) {
        state.loading = false;
        this.render();
      }
    }
  }
  async loadPaneDirectory(device, path, force) {
    const cacheKey = this.getPaneDirectoryCacheKey(device, path);
    const now = Date.now();
    if (!force) {
      const cached = this.paneDirectoryCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached;
      }
      const inflight = this.paneDirectoryInflight.get(cacheKey);
      if (inflight) {
        return inflight;
      }
    } else {
      this.paneDirectoryCache.delete(cacheKey);
    }
    const promise = (async () => {
      const listing = device.id === LOCAL_WINDOWS_DEVICE_ID ? await this.sshService.listLocalDirectory(path, force) : await this.sshService.listRemoteDirectory(await this.getSshConnectionOptions(device), path, force);
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
    this.paneDirectoryInflight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.paneDirectoryInflight.delete(cacheKey);
    }
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
      await this.loadPaneDirectory(device, path, false);
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
    void this.loadPaneDirectory(device, path, false).catch(() => void 0);
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
      void this.loadPaneDirectory(device, path, false).catch(() => void 0);
    }
  }
  getPaneDirectoryCacheKey(device, path) {
    return `${device.id}|${device.host}|${device.port || 0}|${path}`;
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
  async transferExternalPaths(targetSide, sourcePaths, operation = "copy") {
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
      const transferred = await this.transferItemsBatch(targetSide, targetSide, this.localWindowsDevice, targetDevice, sourceItems, operation);
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
  async transferSelected(sourceSide, targetSide) {
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
      return this.transferItemsBatch(sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, "copy");
    }
    const batch = sourceItems.length > 1;
    const label = batch ? `\u590D\u5236 ${sourceItems.length} \u9879` : `\u590D\u5236 ${sourceItems[0].name}`;
    const task = this.beginTask("transfer", label, `${sourceDevice.name} -> ${targetDevice.name}`);
    task.progress = 0;
    task.cancelRequested = false;
    task.transferItems = sourceItems.map((item) => this.createTransferTaskItem(item));
    task.speedSamples = [];
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
      const result = await this.transferItem(sourceSide, targetSide, sourceItem, { refreshTarget: false, task });
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
        expectedBytes
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
  async transferItemsBatch(sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, operation) {
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
      const plannedStrategy = this.getPlannedTransferStrategy(sourceDevice, targetDevice, items[0]);
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
        strategyHint: "auto"
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
    const selectedIndex = selectedPath ? Math.max(0, images.findIndex((image) => image.item.path === selectedPath)) : 0;
    this.previewState = void 0;
    this.imagePreviewAnalysis = void 0;
    this.clearImagePreviewRender();
    this.imageGridState = {
      side,
      path: state.path,
      images,
      selectedIndex,
      columns: 12,
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
  selectImageGridItem(index) {
    const state = this.imageGridState;
    if (!state || index < 0 || index >= state.images.length) {
      return;
    }
    state.selectedIndex = index;
    this.updateImageGridSelection(index);
    this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(index, state.images.length));
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
    state.selectedIndex = index;
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
  downloadImageGridPreview() {
    const state = this.imageGridState;
    const image = state?.images[state.selectedIndex];
    const src = this.getImagePreviewSource(image);
    if (!image || !src) {
      return;
    }
    const ownerDocument = this.container?.ownerDocument ?? document;
    const anchor = ownerDocument.createElement("a");
    anchor.href = src;
    anchor.download = image.item.name;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    ownerDocument.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  canCopyPreviewImage() {
    const gridState = this.imageGridState;
    if (gridState?.previewVisible) {
      const image = gridState.images[gridState.selectedIndex];
      return !!image && !!this.getImagePreviewSource(image);
    }
    const preview = this.previewState;
    return !!preview && preview.mode === "image" && !preview.loading && !preview.error && !!preview.content;
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
      const preview = this.previewState;
      if (!preview || preview.mode !== "image" || preview.loading || preview.error || !preview.content) {
        return;
      }
      await this.writePreviewImageContentToClipboard(preview.content, preview.mime, preview.item.name);
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
  async deleteImageGridPreview() {
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
        height: cached.height
      };
    }
    const result = await this.sshService.readImage(await this.toTransferEndpoint(device, path), options);
    if (result.ok && result.content && result.size <= IMAGE_READ_CACHE_MAX_BYTES) {
      this.imageReadCache.set(cacheKey, {
        content: result.content,
        mime: result.mime,
        size: result.size,
        width: result.width,
        height: result.height
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
      const result = await this.readImageGridImage(device, image.item.path, {
        encoding: "base64",
        width: request.width,
        height: request.height,
        quality: request.quality,
        format: "jpeg",
        interpolation: "lanczos",
        forceOriginal: true,
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
    const thumbnailSrc = image.thumbnailUrl || (image.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : "");
    if (thumbnailSrc) {
      const thumb = document.createElement("img");
      thumb.loading = "eager";
      thumb.decoding = "async";
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
  getImageGridVirtualRange(state) {
    const total = state.images.length;
    if (!total) {
      return { startIndex: 0, endIndex: 0, topSpacerHeight: 0, bottomSpacerHeight: 0 };
    }
    const columns = Math.max(1, state.columns);
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
    const width = this.getImageGridBodyWidth();
    const columns = Math.max(1, state.columns);
    const available = width - IMAGE_GRID_CARD_GAP * Math.max(0, columns - 1);
    const columnWidth = Math.max(IMAGE_GRID_THUMB_MIN, available / columns);
    const previewHeight = columnWidth * 150 / 220;
    return Math.max(150, Math.round(previewHeight + IMAGE_GRID_CARD_VERTICAL_CHROME));
  }
  getImageGridBodyWidth() {
    const body = this.container?.querySelector(".turbofile-image-page-body");
    const measured = body?.clientWidth ?? 0;
    if (measured > 0) {
      return Math.max(320, measured - 28);
    }
    const fallback = this.container?.clientWidth ?? 1440;
    return Math.max(320, fallback - 28);
  }
  getImageGridThumbnailRequestWidth(state) {
    const width = this.getImageGridBodyWidth();
    const columns = Math.max(1, state.columns);
    const available = width - IMAGE_GRID_CARD_GAP * Math.max(0, columns - 1);
    const columnWidth = Math.max(IMAGE_GRID_THUMB_MIN, available / columns);
    const ownerWindow = this.container?.ownerDocument.defaultView;
    const dpr = Math.min(IMAGE_DPR_CAP, ownerWindow?.devicePixelRatio || 1);
    const scaled = Math.round(columnWidth * dpr);
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
      if (rendered && rendered.startIndex === range.startIndex && rendered.endIndex === range.endIndex && rendered.columns === state.columns && rendered.total === state.images.length) {
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
    if (rounded <= IMAGE_GRID_COLUMN_STEPS[0]) {
      return IMAGE_GRID_COLUMN_STEPS[0];
    }
    const max = IMAGE_GRID_COLUMN_STEPS[IMAGE_GRID_COLUMN_STEPS.length - 1];
    if (rounded >= max) {
      return max;
    }
    return rounded;
  }
  updateImageGridVirtualSlice(state, range) {
    if (!this.container || this.imageGridState !== state || this.activePage !== "images") {
      return;
    }
    const grid = this.container.querySelector(".turbofile-image-page-grid");
    if (!grid) {
      return;
    }
    this.renderImageGridSlice(grid, state, range);
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
    const range = this.imageGridState === state && rendered && rendered.columns === state.columns && rendered.total === state.images.length ? { startIndex: rendered.startIndex, endIndex: rendered.endIndex } : this.getImageGridVirtualRange(state);
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
    if (this.imageGridState === state && rendered && rendered.columns === state.columns && rendered.total === state.images.length) {
      return index >= rendered.startIndex && index < rendered.endIndex;
    }
    const range = this.getImageGridVirtualRange(state);
    return index >= range.startIndex && index < range.endIndex;
  }
  releaseImageGridImagesOutsideRange(state, range) {
    const keepThumbnailStart = Math.max(0, range.startIndex - state.columns);
    const keepThumbnailEnd = Math.min(state.images.length, range.endIndex + state.columns);
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
  updateImageGridSelection(index) {
    if (!this.container) {
      return;
    }
    for (const card of Array.from(this.container.querySelectorAll(".turbofile-image-page-card.is-selected"))) {
      card.classList.remove("is-selected");
    }
    const selected = this.container.querySelector(`.turbofile-image-page-card[data-image-index="${index}"]`);
    selected?.classList.add("is-selected");
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
    this.previewState = void 0;
    const reportOpenError = (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.statusMessage = `\u6253\u5F00\u5931\u8D25\uFF1A${message}`;
      this.render();
    };
    try {
      const resource = device.id === LOCAL_WINDOWS_DEVICE_ID ? URI.file(item.path) : this.ensureRemoteFileSystemProvider().registerFile(device, this.getSshConnectionOptions(device), item);
      const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(resource) ?? void 0;
      void this.editorService.openEditor({
        resource,
        languageId,
        options: {
          pinned: true,
          override: DEFAULT_EDITOR_ASSOCIATION.id,
          index: this.getDocumentEditorTargetIndex()
        }
      }).catch(reportOpenError);
    } catch (error) {
      reportOpenError(error);
    }
  }
  async savePreview() {
    const preview = this.previewState;
    if (!preview || preview.mode !== "text" || !preview.item.path) {
      return;
    }
    const device = this.getPaneDevice(preview.side);
    if (!device) {
      return;
    }
    const task = this.beginTask("save", `\u4FDD\u5B58 ${preview.item.name}`, device.name);
    try {
      const result = await this.sshService.writeFile(await this.toTransferEndpoint(device, preview.item.path), preview.content, "utf8");
      if (result.ok) {
        preview.dirty = false;
        this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
        await this.refreshPane(preview.side);
        this.finishTask(task, "success", `\u5DF2\u4FDD\u5B58\uFF1A${preview.item.name}`, { bytes: preview.content.length });
      } else {
        this.finishTask(task, "error", `\u4FDD\u5B58\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u4FDD\u5B58\u5931\u8D25\uFF1A${message}`, { error: message });
    }
    this.render();
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
    return protocol === "auto-fast" || protocol === "rsync" || protocol === "sftp" || protocol === "scp" || protocol === "tar" ? protocol : defaultTurboFileTransferProtocol;
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
      return path || "/";
    }
    return (path || LOCAL_WINDOWS_FALLBACK_PATH).replace(/\//g, "\\");
  }
  normalizePaneInputPath(path, windowsPath) {
    const trimmed = path.trim();
    if (!trimmed) {
      return "";
    }
    if (!windowsPath) {
      const normalized = trimmed.replace(/\\/g, "/");
      return normalized.startsWith("/") ? normalized : `/${normalized}`;
    }
    return trimmed.replace(/\//g, "\\");
  }
  getDefaultPaneDevicePath(device) {
    return device.id === LOCAL_WINDOWS_DEVICE_ID ? this.getLocalWindowsDeviceDefaultPath() : device.defaultPath || "/";
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
    this.storageService.store(this.getPaneDevicePathStorageKey(side, device), path, StorageScope.PROFILE, StorageTarget.USER);
  }
  getRememberedPaneDevicePath(side, device) {
    const path = this.storageService.get(this.getPaneDevicePathStorageKey(side, device), StorageScope.PROFILE);
    return path || void 0;
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
    return value === "auto-fast" || value === "rsync" || value === "scp" || value === "sftp" || value === "tar" ? value : defaultTurboFileTransferProtocol;
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
        this.ensurePaneDeviceSelection();
        const refreshedLocalWindowsPanes = isEditingLocalWindows ? this.syncLocalWindowsDefaultPath(previousLocalWindowsDefaultPath ?? this.getLocalWindowsDefaultPath(), savedDevice.defaultPath || this.getLocalWindowsDeviceDefaultPath()) : false;
        if (capabilityResult) {
          this.deviceConnectionMessages.set(savedDevice.id, capabilityResult);
        } else if (isEditingLocalWindows) {
          this.deviceConnectionMessages.set(savedDevice.id, { status: "success", message: "\u672C\u673A\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0CWindows \u4E0E\u670D\u52A1\u5668\u4E92\u4F20\u4F1A\u6309\u6240\u9009\u534F\u8BAE\u6267\u884C\u3002" });
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
      ["tar", "tar \u76EE\u5F55\u4F20\u8F93"],
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
  __decorateParam(13, ITerminalService),
  __decorateParam(14, ITerminalGroupService),
  __decorateParam(15, ITerminalProfileService),
  __decorateParam(16, IQuickInputService),
  __decorateParam(17, IClipboardService),
  __decorateParam(18, IConfigurationService),
  __decorateParam(19, IWorkbenchLayoutService)
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
    return FileType.SymbolicLink;
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
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
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
  if (milliseconds < 1e3) {
    return `${Math.max(0, Math.round(milliseconds))} ms`;
  }
  const seconds = milliseconds / 1e3;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcYnJvd3NlclxcdHVyYm9maWxlRWRpdG9yLnRzIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxHQUFHLFdBQXNCLGlCQUErQjtBQUNqRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsY0FBYyxjQUFjLGdCQUFnQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBa0IsV0FBVyxnQkFBZ0I7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBd0gsNEJBQThMO0FBQ3RULFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLCtCQUErQixnQkFBZ0IsVUFBVSxnQ0FBZ0MsNkJBQTZCLFVBQWtFLG9CQUE2RztBQUM5UyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQWtHLHFCQUFxQix3QkFBd0I7QUFDL0ksU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQ0FBc0Q7QUFFL0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFB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LEVBQ2QseUJBQXlCO0FBQUEsRUFDekIsc0JBQXNCO0FBQUEsRUFDdEIsbUJBQW1CO0FBQUEsRUFDbkIsd0JBQXdCO0FBQUEsRUFDeEIsbUJBQW1CO0FBQUEsRUFDbkIsMEJBQTBCO0FBQUEsRUFDMUIsMEJBQTBCO0FBQUEsRUFDMUIsa0NBQWtDO0FBQUEsRUFDbEMsNEJBQTRCO0FBQUEsRUFDNUIsZ0NBQWdDO0FBQUEsRUFDaEMsc0JBQXNCO0FBQUEsRUFDdEIsK0JBQStCO0FBQUEsRUFDL0IsK0JBQStCO0FBQUEsRUFDL0Isc0JBQXNCO0FBQUEsRUFDdEIsc0JBQXNCO0FBQUEsRUFDdEIsa0JBQWtCO0FBQUEsRUFDbEIsMkJBQTJCO0FBQUEsRUFDM0IsbUNBQW1DO0FBQUEsRUFDbkMsbUNBQW1DO0FBQUEsRUFDbkMsK0JBQStCO0FBQUEsRUFDL0IscUJBQXFCO0FBQUEsRUFDckIscUJBQXFCO0FBQUEsRUFDckIsK0JBQStCO0FBQUEsRUFDL0IscUNBQXFDO0FBQUEsRUFDckMsMkJBQTJCO0FBQUEsRUFDM0IsOEJBQThCO0FBQUEsRUFDOUIsc0NBQXNDO0FBQUEsRUFDdEMsaUNBQWlDO0FBQUEsRUFDakMsdUNBQXVDO0FBQUEsRUFDdkMsOEJBQThCO0FBQUEsRUFDOUIsdUNBQXVDO0FBQUEsRUFDdkMsb0NBQW9DO0FBQUEsRUFDcEMsZ0NBQWdDO0FBQUEsRUFDaEMsc0JBQXNCO0FBQUEsRUFDdEIsd0JBQXdCO0FBQUEsRUFDeEIsd0JBQXdCO0FBQUEsRUFDeEIsb0JBQW9CO0FBQUEsRUFDcEIsMEJBQTBCO0FBQUEsRUFDMUIsMEJBQTBCO0FBQUEsRUFDMUIsY0FBYztBQUFBLEVBQ2Qsb0JBQW9CO0FBQUEsRUFDcEIsZ0JBQWdCO0FBQUEsRUFDaEIsK0JBQStCO0FBQUEsRUFDL0IsaUNBQWlDO0FBQUEsRUFDakMsd0JBQXdCO0FBQUEsRUFDeEIsd0JBQXdCO0FBQUEsRUFDeEIsb0JBQW9CO0FBQUEsRUFDcEIsZ0NBQWdDO0FBQUEsRUFDaEMsNkJBQTZCO0FBQUEsRUFDN0IsNkJBQTZCO0FBQUEsRUFDN0IsK0JBQStCO0FBQUEsRUFDL0IsK0JBQStCO0FBQUEsRUFDL0IsbUJBQW1CO0FBQUEsRUFDbkIsa0NBQWtDO0FBQUEsRUFDbEMsa0NBQWtDO0FBQUEsRUFDbEMsb0NBQW9DO0FBQUEsRUFDcEMsb0NBQW9DO0FBQUEsRUFDcEMsd0JBQXdCO0FBQUEsRUFDeEIsd0JBQXdCO0FBQUEsRUFDeEIscUJBQXFCO0FBQUEsRUFDckIsNEJBQTRCO0FBQUEsRUFDNUIsb0JBQW9CO0FBQUEsRUFDcEIsb0JBQW9CO0FBQUEsRUFDcEIsZ0JBQWdCO0FBQUEsRUFDaEIsK0JBQStCO0FBQUEsRUFDL0IsdUJBQXVCO0FBQUEsRUFDdkIsdUJBQXVCO0FBQUEsRUFDdkIsbUJBQW1CO0FBQUEsRUFDbkIsZ0NBQWdDO0FBQUEsRUFDaEMsNEJBQTRCO0FBQUEsRUFDNUIsZ0NBQWdDO0FBQUEsRUFDaEMscUJBQXFCO0FBQUEsRUFDckIscUJBQXFCO0FBQUEsRUFDckIsMEJBQTBCO0FBQUEsRUFDMUIsOEJBQThCO0FBQUEsRUFDOUIsOEJBQThCO0FBQUEsRUFDOUIsbUNBQW1DO0FBQUEsRUFDbkMsb0JBQW9CO0FBQUEsRUFDcEIsb0JBQW9CO0FBQUEsRUFDcEIsMEJBQTBCO0FBQUEsRUFDMUIseUJBQXlCO0FBQUEsRUFDekIseUJBQXlCO0FBQUEsRUFDekIsOEJBQThCO0FBQUEsRUFDOUIsd0NBQXdDO0FBQUEsRUFDeEMsb0JBQW9CO0FBQUEsRUFDcEIsOEJBQThCO0FBQUEsRUFDOUIsbUNBQW1DO0FBQUEsRUFDbkMsb0NBQW9DO0FBQUEsRUFDcEMsbUJBQW1CO0FBQUEsRUFDbkIsbUJBQW1CO0FBQUEsRUFDbkIsNEJBQTRCO0FBQUEsRUFDNUIsNEJBQTRCO0FBQUEsRUFDNUIsZUFBZTtBQUFBLEVBQ2YseUJBQXlCO0FBQUEsRUFDekIseUJBQXlCO0FBQUEsRUFDekIsa0NBQWtDO0FBQUEsRUFDbEMsMkJBQTJCO0FBQUEsRUFDM0IsMkJBQTJCO0FBQUEsRUFDM0IsdUJBQXVCO0FBQUEsRUFDdkIsaUJBQWlCO0FBQUEsRUFDakIs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QUFVLGVBQWU7QUFDL0IsTUFBSSxVQUFVLElBQUk7QUFDakIsV0FBTyxHQUFHLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUM3QjtBQUNBLFFBQU0sVUFBVSxLQUFLLE1BQU0sVUFBVSxFQUFFO0FBQ3ZDLFFBQU0sbUJBQW1CLEtBQUssTUFBTSxVQUFVLEVBQUUsRUFBRSxTQUFTLEVBQUUsU0FBUyxHQUFHLEdBQUc7QUFDNUUsU0FBTyxHQUFHLE9BQU8sSUFBSSxnQkFBZ0I7QUFDdEM7QUFFQSxTQUFTLGlCQUFpQixPQUFlLGNBQThCO0FBQ3RFLE1BQUksU0FBUyxLQUFLLGdCQUFnQixHQUFHO0FBQ3BDLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxHQUFHLG1CQUFvQixRQUFRLGVBQWdCLEdBQUksQ0FBQztBQUM1RDtBQUVBLFNBQVMsbUJBQW1CLGdCQUFnQztBQUMzRCxNQUFJLGlCQUFpQixLQUFNO0FBQzFCLFdBQU8sR0FBRyxLQUFLLE1BQU0sY0FBYyxDQUFDO0FBQUEsRUFDckM7QUFDQSxRQUFNLEtBQUssaUJBQWlCO0FBQzVCLE1BQUksS0FBSyxLQUFNO0FBQ2QsV0FBTyxHQUFHLEdBQUcsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUN4QjtBQUNBLFFBQU0sS0FBSyxLQUFLO0FBQ2hCLE1BQUksS0FBSyxLQUFNO0FBQ2QsV0FBTyxHQUFHLEdBQUcsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUN4QjtBQUNBLFNBQU8sSUFBSSxLQUFLLEtBQU0sUUFBUSxDQUFDLENBQUM7QUFDakM7QUFFQSxTQUFTLFdBQVcsV0FBMkI7QUFDOUMsTUFBSSxDQUFDLFdBQVc7QUFDZixXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sT0FBTyxJQUFJLEtBQUssU0FBUztBQUMvQixRQUFNLE1BQU0sQ0FBQyxVQUFrQixNQUFNLFNBQVMsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUMvRCxTQUFPLEdBQUcsS0FBSyxZQUFZLENBQUMsSUFBSSxJQUFJLEtBQUssU0FBUyxJQUFJLENBQUMsQ0FBQyxJQUFJLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxJQUFJLElBQUksS0FBSyxTQUFTLENBQUMsQ0FBQyxJQUFJLElBQUksS0FBSyxXQUFXLENBQUMsQ0FBQztBQUNsSTsiLAogICJuYW1lcyI6IFsid2luZG93IiwgInNlZ21lbnRzIiwgImN1cnJlbnQiLCAic2l6ZSIsICJ2aXNpYmxlSW5kZXhlcyIsICJpbnN0YW5jZSIsICJlbnRyeSIsICJub3JtYWxpemVkIiwgInBhdGgiXQp9Cg==
