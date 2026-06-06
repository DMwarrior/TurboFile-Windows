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
        return { status: "success", message: "\u667A\u80FD\u6781\u901F\u53EF\u7528\uFF1A\u6587\u4EF6\u5939/\u591A\u6587\u4EF6\u4F18\u5148 rsync\uFF0C\u5355\u6587\u4EF6\u4F18\u5148 SCP\uFF1B\u5931\u8D25\u65F6\u81EA\u52A8\u515C\u5E95\u3002", capabilities, missingDependencies: [] };
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
      const isRsyncTransferRunning = runningTransfers.some((task) => task.strategy?.startsWith("rsync"));
      const transferSizeText = liveSummary.totalBytes > 0 ? `${formatSize(liveSummary.transferredBytes)} / ${formatSize(liveSummary.totalBytes)}` : liveSummary.transferredBytes > 0 ? formatSize(liveSummary.transferredBytes) : isRsyncTransferRunning ? "\u4F20\u8F93\u4E2D" : "\u51C6\u5907\u4E2D";
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
      if (targetDevice.preferredTransferProtocol === "tar" && sourceItem.directory) {
        return "tar-upload";
      }
      if (sourceItem.directory && targetDevice.preferredTransferProtocol !== "sftp") {
        return "rsync-upload";
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
      if (sourceDevice.preferredTransferProtocol === "tar" && sourceItem.directory) {
        return "tar-download";
      }
      if (sourceItem.directory && sourceDevice.preferredTransferProtocol !== "sftp") {
        return "rsync-download";
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
  getPlannedBatchTransferStrategy(sourceDevice, targetDevice, sourceItems) {
    if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID && targetDevice.id !== LOCAL_WINDOWS_DEVICE_ID) {
      if (targetDevice.preferredTransferProtocol === "tar") {
        return "tar-upload";
      }
      if (targetDevice.preferredTransferProtocol !== "sftp") {
        return "rsync-upload";
      }
    }
    if (sourceDevice.id !== LOCAL_WINDOWS_DEVICE_ID && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
      if (sourceDevice.preferredTransferProtocol === "tar") {
        return "tar-download";
      }
      if (sourceDevice.preferredTransferProtocol !== "sftp") {
        return "rsync-download";
      }
    }
    return this.getPlannedTransferStrategy(sourceDevice, targetDevice, sourceItems[0]);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcYnJvd3NlclxcdHVyYm9maWxlRWRpdG9yLnRzIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxHQUFHLFdBQXNCLGlCQUErQjtBQUNqRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsY0FBYyxjQUFjLGdCQUFnQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBa0IsV0FBVyxnQkFBZ0I7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBd0gsNEJBQThMO0FBQ3RULFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLCtCQUErQixnQkFBZ0IsVUFBVSxnQ0FBZ0MsNkJBQTZCLFVBQWtFLG9CQUE2RztBQUM5UyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQWtHLHFCQUFxQix3QkFBd0I7QUFDL0ksU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQ0FBc0Q7QUFFL0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFB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LEVBQ2QseUJBQXlCO0FBQUEsRUFDekIsc0JBQXNCO0FBQUEsRUFDdEIsbUJBQW1CO0FBQUEsRUFDbkIsd0JBQXdCO0FBQUEsRUFDeEIsbUJBQW1CO0FBQUEsRUFDbkIsMEJBQTBCO0FBQUEsRUFDMUIsMEJBQTBCO0FBQUEsRUFDMUIsa0NBQWtDO0FBQUEsRUFDbEMsNEJBQTRCO0FBQUEsRUFDNUIsZ0NBQWdDO0FBQUEsRUFDaEMsc0JBQXNCO0FBQUEsRUFDdEIsK0JBQStCO0FBQUEsRUFDL0IsK0JBQStCO0FBQUEsRUFDL0Isc0JBQXNCO0FBQUEsRUFDdEIsc0JBQXNCO0FBQUEsRUFDdEIsa0JBQWtCO0FBQUEsRUFDbEIsMkJBQTJCO0FBQUEsRUFDM0IsbUNBQW1DO0FBQUEsRUFDbkMsbUNBQW1DO0FBQUEsRUFDbkMsK0JBQStCO0FBQUEsRUFDL0IscUJBQXFCO0FBQUEsRUFDckIscUJBQXFCO0FBQUEsRUFDckIsK0JBQStCO0FBQUEsRUFDL0IscUNBQXFDO0FBQUEsRUFDckMsMkJBQTJCO0FBQUEsRUFDM0IsOEJBQThCO0FBQUEsRUFDOUIsc0NBQXNDO0FBQUEsRUFDdEMsaUNBQWlDO0FBQUEsRUFDakMsdUNBQXVDO0FBQUEsRUFDdkMsOEJBQThCO0FBQUEsRUFDOUIsdUNBQXVDO0FBQUEsRUFDdkMsb0NBQW9DO0FBQUEsRUFDcEMsZ0NBQWdDO0FBQUEsRUFDaEMsc0JBQXNCO0FBQUEsRUFDdEIsd0JBQXdCO0FBQUEsRUFDeEIsd0JBQXdCO0FBQUEsRUFDeEIsb0JBQW9CO0FBQUEsRUFDcEIsMEJBQTBCO0FBQUEsRUFDMUIsMEJBQTBCO0FBQUEsRUFDMUIsY0FBYztBQUFBLEVBQ2Qsb0JBQW9CO0FBQUEsRUFDcEIsZ0JBQWdCO0FBQUEsRUFDaEIsK0JBQStCO0FBQUEsRUFDL0IsaUNBQWlDO0FBQUEsRUFDakMsd0JBQXdCO0FBQUEsRUFDeEIsd0JBQXdCO0FBQUEsRUFDeEIsb0JBQW9CO0FBQUEsRUFDcEIsZ0NBQWdDO0FBQUEsRUFDaEMsNkJBQTZCO0FBQUEsRUFDN0IsNkJBQTZCO0FBQUEsRUFDN0IsK0JBQStCO0FBQUEsRUFDL0IsK0JBQStCO0FBQUEsRUFDL0IsbUJBQW1CO0FBQUEsRUFDbkIsa0NBQWtDO0FBQUEsRUFDbEMsa0NBQWtDO0FBQUEsRUFDbEMsb0NBQW9DO0FBQUEsRUFDcEMsb0NBQW9DO0FBQUEsRUFDcEMsd0JBQXdCO0FBQUEsRUFDeEIsd0JBQXdCO0FBQUEsRUFDeEIscUJBQXFCO0FBQUEsRUFDckIsNEJBQTRCO0FBQUEsRUFDNUIsb0JBQW9CO0FBQUEsRUFDcEIsb0JBQW9CO0FBQUEsRUFDcEIsZ0JBQWdCO0FBQUEsRUFDaEIsK0JBQStCO0FBQUEsRUFDL0IsdUJBQXVCO0FBQUEsRUFDdkIsdUJBQXVCO0FBQUEsRUFDdkIsbUJBQW1CO0FBQUEsRUFDbkIsZ0NBQWdDO0FBQUEsRUFDaEMsNEJBQTRCO0FBQUEsRUFDNUIsZ0NBQWdDO0FBQUEsRUFDaEMscUJBQXFCO0FBQUEsRUFDckIscUJBQXFCO0FBQUEsRUFDckIsMEJBQTBCO0FBQUEsRUFDMUIsOEJBQThCO0FBQUEsRUFDOUIsOEJBQThCO0FBQUEsRUFDOUIsbUNBQW1DO0FBQUEsRUFDbkMsb0JBQW9CO0FBQUEsRUFDcEIsb0JBQW9CO0FBQUEsRUFDcEIsMEJBQTBCO0FBQUEsRUFDMUIseUJBQXlCO0FBQUEsRUFDekIseUJBQXlCO0FBQUEsRUFDekIsOEJBQThCO0FBQUEsRUFDOUIsd0NBQXdDO0FBQUEsRUFDeEMsb0JBQW9CO0FBQUEsRUFDcEIsOEJBQThCO0FBQUEsRUFDOUIsbUNBQW1DO0FBQUEsRUFDbkMsb0NBQW9DO0FBQUEsRUFDcEMsbUJBQW1CO0FBQUEsRUFDbkIsbUJBQW1CO0FBQUEsRUFDbkIsNEJBQTRCO0FBQUEsRUFDNUIsNEJBQTRCO0FBQUEsRUFDNUIsZUFBZTtBQUFBLEVBQ2YseUJBQXlCO0FBQUEsRUFDekIseUJBQXlCO0FBQUEsRUFDekIsa0NBQWtDO0FBQUEsRUFDbEMsMkJBQTJCO0FBQUEsRUFDM0IsMkJBQTJCO0FBQUEsRUFDM0IsdUJBQXVCO0FBQUEsRUFDdkIsaUJBQWlCO0FBQUEsRUFDakIs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QUFDZCxXQUFPLEdBQUcsR0FBRyxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ3hCO0FBQ0EsUUFBTSxLQUFLLEtBQUs7QUFDaEIsTUFBSSxLQUFLLEtBQU07QUFDZCxXQUFPLEdBQUcsR0FBRyxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ3hCO0FBQ0EsU0FBTyxJQUFJLEtBQUssS0FBTSxRQUFRLENBQUMsQ0FBQztBQUNqQztBQUVBLFNBQVMsV0FBVyxXQUEyQjtBQUM5QyxNQUFJLENBQUMsV0FBVztBQUNmLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxPQUFPLElBQUksS0FBSyxTQUFTO0FBQy9CLFFBQU0sTUFBTSxDQUFDLFVBQWtCLE1BQU0sU0FBUyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQy9ELFNBQU8sR0FBRyxLQUFLLFlBQVksQ0FBQyxJQUFJLElBQUksS0FBSyxTQUFTLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLElBQUksSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDLElBQUksSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQ2xJOyIsCiAgIm5hbWVzIjogWyJ3aW5kb3ciLCAic2VnbWVudHMiLCAiY3VycmVudCIsICJzaXplIiwgInZpc2libGVJbmRleGVzIiwgImluc3RhbmNlIiwgImVudHJ5IiwgIm5vcm1hbGl6ZWQiLCAicGF0aCJdCn0K
