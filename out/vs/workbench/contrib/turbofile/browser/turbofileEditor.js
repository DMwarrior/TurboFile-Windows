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
import { TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
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
import { TurboFileEditorInput } from "../common/turbofileEditorInput.js";
import { TurboFileDeviceStore } from "./turbofileDeviceStore.js";
import { turboFileWorkbenchBridge } from "./turbofileWorkbenchBridge.js";
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
const PANE_DEVICE_SNAPSHOT_TTL_MS = 3e5;
const PANE_FAST_DOUBLE_CLICK_MS = 300;
const TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY = "turbofile.browser.fontSize";
const TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY = "turbofile.browser.fontFamily";
const TURBOFILE_UI_FONT_SIZE_STORAGE_KEY = "turbofile.ui.fontSize";
const TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY = "turbofile.ui.fontFamily";
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
  { columns: 8, kind: "medium", label: "\u6807\u51C6\u7F51\u683C" }
];
const IMAGE_GRID_NEIGHBOR_LOAD_COUNT = 2;
const IMAGE_GRID_OVERSCAN_ROWS = 1;
const IMAGE_GRID_CARD_GAP = 16;
const IMAGE_GRID_CARD_VERTICAL_CHROME = 58;
const IMAGE_GRID_THUMB_MIN = 96;
const IMAGE_GRID_THUMB_MAX = 640;
const IMAGE_GRID_THUMB_STEP = 64;
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
    this.imagePreviewRenderSeq = 0;
    this.imageReadCache = /* @__PURE__ */ new Map();
    this.fileListScrollRaf = { left: 0, right: 0 };
    this.fileListRestoreRaf = { left: 0, right: 0 };
    this.fileListRenderedRange = { left: void 0, right: void 0 };
    this.paneDirectoryCache = /* @__PURE__ */ new Map();
    this.paneDirectoryInflight = /* @__PURE__ */ new Map();
    this.paneDeviceSnapshots = /* @__PURE__ */ new Map();
    this.activePage = "transfer";
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
    this.currentTransferMode = "copy";
    this.lastActiveSide = "left";
    this.taskbarHiddenForTerminal = false;
    this.windowsClipboardPasteInFlight = /* @__PURE__ */ new Set();
    this.availableWindowsDriveRoots = [];
    this.statusMessage = "\u6781\u901F\u4F20\u5DF2\u542F\u52A8\uFF1A\u53CC\u680F\u6D4F\u89C8\u3001\u8BBE\u5907\u7BA1\u7406\u3001\u4F20\u8F93\u3001\u9884\u89C8\u548C\u7EC8\u7AEF\u5165\u53E3\u5DF2\u63A5\u5165\u3002";
    this.taskSequence = 1;
    this.tasks = [];
    this.isEditorVisible = false;
    const localWindowsDefaultPath = this.getLocalWindowsDefaultPath();
    this.localWindowsDevice = {
      id: LOCAL_WINDOWS_DEVICE_ID,
      name: "Windows",
      host: "localhost",
      port: 0,
      username: "local",
      authType: "password",
      defaultPath: localWindowsDefaultPath,
      platform: "windows",
      capabilities: {
        ssh: false,
        sftp: false,
        scp: false,
        rsync: false,
        shell: true,
        archive: true
      },
      preferredTransferProtocol: "sftp"
    };
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
    this._register(this.layoutService.onDidChangePartVisibility((event) => {
      if (event.partId === Parts.PANEL_PART && !event.visible) {
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
    if (this.configurationService.getValue("workbench.statusBar.visible") !== false) {
      await this.configurationService.updateValue("workbench.statusBar.visible", false, ConfigurationTarget.USER);
    }
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
    document.body.classList.remove("turbofile-editor-theme-light", "turbofile-editor-theme-dark");
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
  renderTransferPage() {
    const page = $(".turbofile-transfer-page");
    if (this.tasks.some((task) => task.kind === "transfer" && task.status === "running")) {
      page.classList.add("has-live-transfer");
    }
    const main = $(".turbofile-main");
    main.appendChild(this.renderPane("left"));
    main.appendChild(this.renderPane("right"));
    page.appendChild(main);
    if (!this.taskbarHiddenForTerminal || this.tasks.some((task) => task.kind === "transfer" && task.status === "running")) {
      page.appendChild(this.renderTaskbar());
    } else {
      page.classList.add("is-terminal-focused");
    }
    return page;
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
      this.createPageButton(Codicon.add, "\u6DFB\u52A0 SSH \u8BBE\u5907", () => this.showAddDeviceForm(), true)
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
    meta.appendChild(this.renderInfoLine("\u4F20\u8F93\u534F\u8BAE", this.getDeviceTransferProtocolLabel(device)));
    card.appendChild(meta);
    const actions = $(".turbofile-page-card-actions");
    actions.appendChild(this.createPageButton(Codicon.send, "\u8FDE\u63A5", () => {
      void this.testDeviceConnection(device);
    }, true));
    if (device.id !== LOCAL_WINDOWS_DEVICE_ID) {
      actions.appendChild(this.createPageButton(Codicon.edit, "\u7F16\u8F91", () => this.showEditDeviceForm(device)));
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
      case "rsync":
        return device.capabilities.rsync ? "rsync \u6781\u901F\u6A21\u5F0F" : "rsync \u5F85\u68C0\u6D4B";
      case "scp":
        return device.capabilities.scp ? "scp \u517C\u5BB9\u6A21\u5F0F" : "scp \u5F85\u68C0\u6D4B";
      case "sftp":
      default:
        return "SFTP \u9ED8\u8BA4\u7A33\u5B9A";
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
    const effectiveMode = this.getEffectiveAppearanceMode(this.getAppearanceMode());
    this.container.classList.toggle("is-turbofile-light", effectiveMode === "light");
    this.container.classList.toggle("is-turbofile-dark", effectiveMode === "dark");
    document.body.classList.toggle("turbofile-editor-theme-light", effectiveMode === "light");
    document.body.classList.toggle("turbofile-editor-theme-dark", effectiveMode === "dark");
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
    try {
      if (mode === "system") {
        await this.configurationService.updateValue(ThemeSettings.PREFERRED_DARK_THEME, darkTheme.settingsId, ConfigurationTarget.USER);
        await this.configurationService.updateValue(ThemeSettings.PREFERRED_LIGHT_THEME, lightTheme.settingsId, ConfigurationTarget.USER);
        await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, true, ConfigurationTarget.USER);
        const preferred = this.workbenchThemeService.getPreferredColorScheme();
        await this.workbenchThemeService.setColorTheme(preferred === ColorScheme.LIGHT ? lightTheme : darkTheme, "auto");
        this.statusMessage = "\u5DF2\u8BBE\u7F6E\u4E3A\u8DDF\u968F\u7CFB\u7EDF\u4E3B\u9898\u3002";
      } else {
        await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, false, ConfigurationTarget.USER);
        await this.applyColorTheme(mode === "light" ? lightTheme : darkTheme);
        return;
      }
      this.render();
    } catch (error) {
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
    if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
      return;
    }
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
      return "";
    }
    const result = await this.sshService.detectCapabilities(await this.getSshConnectionOptions(device));
    if (!result.ok || !result.capabilities) {
      return "\u534F\u8BAE\u80FD\u529B\u68C0\u6D4B\u5931\u8D25\uFF0C\u5C06\u6309 SFTP \u515C\u5E95";
    }
    const capabilities = this.toDeviceCapabilities(result.capabilities);
    this.deviceStore.updateDeviceCapabilities(device.id, capabilities);
    if (device.preferredTransferProtocol === "rsync") {
      return capabilities.rsync ? "rsync \u53EF\u7528" : "rsync \u4E0D\u53EF\u7528\uFF0C\u5C06\u6309 SFTP \u515C\u5E95";
    }
    if (device.preferredTransferProtocol === "scp") {
      return capabilities.scp ? "SCP \u53EF\u7528" : "SCP \u4E0D\u53EF\u7528\uFF0C\u5C06\u6309 SFTP \u515C\u5E95";
    }
    return "";
  }
  toDeviceCapabilities(capabilities) {
    return {
      ssh: capabilities.ssh,
      sftp: capabilities.sftp,
      scp: capabilities.scp,
      rsync: capabilities.rsync,
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
      state.path = device.defaultPath || (device.id === LOCAL_WINDOWS_DEVICE_ID ? this.getLocalWindowsDefaultPath() : "/");
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
      this.lastActiveSide = command.side;
      void this.openTerminal(command.side);
    }
  }
  renderPane(side) {
    const state = this.paneStates[side];
    const device = this.getPaneDevice(side);
    const pane = $(".turbofile-pane");
    pane.dataset.turbofileSide = side;
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
      this.lastActiveSide = side;
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
        void this.renameSelected(side);
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
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
          this.selectAllPaneItems(side);
          return;
        }
        if (key === "c" || key === "x") {
          event.preventDefault();
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
          event.dataTransfer.dropEffect = this.getDropTransferOperation(event);
        }
        this.setExternalDropTargetSide(void 0);
        return;
      }
      if (this.hasExternalDropData(event)) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = this.getDropTransferOperation(event);
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
        if (this.getDropTransferOperation(event) === "move") {
          void this.moveSelected(sourceSide, side);
        } else {
          void this.transferSelected(sourceSide, side);
        }
        return;
      }
      const externalPaths = this.extractExternalDropPaths(event);
      if (externalPaths.length) {
        void this.transferExternalPaths(side, externalPaths, this.getDropTransferOperation(event));
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
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.commitPathInlineEdit(side, input.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.render();
      }
    });
    input.addEventListener("blur", () => {
      if (display.isConnected) {
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
    if (range.topSpacerHeight > 0) {
      const topSpacer = $(".turbofile-file-list-spacer");
      topSpacer.style.height = `${range.topSpacerHeight}px`;
      list.appendChild(topSpacer);
    }
    for (const item of this.getVisibleFileItems(state).slice(range.startIndex, range.endIndex)) {
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
      total: this.getVisibleFileItems(state).length
    };
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
        this.ensureItemInSelection(side, item);
        const operation = this.getInternalDragOperation(side, item, event);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copyMove";
          event.dataTransfer.dropEffect = operation;
        }
        event.dataTransfer?.setData("application/x-turbofile-side", side);
        event.dataTransfer?.setData("application/x-turbofile-operation", operation);
        event.dataTransfer?.setData("text/plain", item.path ?? "");
      });
    }
    row.addEventListener("click", (event) => {
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
      const nextName = inputBox.value.trim();
      disposables.dispose();
      if (!this.isInlineRenameTarget(side, item)) {
        return;
      }
      this.inlineRename = void 0;
      this.render();
      if (success && nextName && nextName !== item.name && !this.validateRenameName(side, item, nextName)) {
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
    if (runningTransfers.length) {
      taskbar.classList.add("has-live-transfer");
      taskbar.appendChild(this.renderLiveTransferPanel(runningTransfers));
      return taskbar;
    }
    const stats = this.getTaskStats();
    const latest = this.tasks[0];
    const status = $(".turbofile-bottom-status");
    const title = $(".turbofile-task-title");
    title.textContent = `\u8FD0\u884C ${stats.running} \xB7 \u6210\u529F ${stats.success} \xB7 \u5931\u8D25 ${stats.error} \xB7 \u53D6\u6D88 ${stats.canceled}`;
    const meta = $(".turbofile-task-meta");
    meta.textContent = latest ? this.formatTaskLine(latest) : this.statusMessage;
    status.appendChild(title);
    status.appendChild(meta);
    const actions = $(".turbofile-bottom-actions");
    this.appendBottomAction(actions, Codicon.copy, "\u590D\u5236", "\u590D\u5236\u6A21\u5F0F", false, () => this.setTransferMode("copy"), false, `is-mode ${this.currentTransferMode === "copy" ? "is-selected" : ""}`, "files");
    this.appendBottomAction(actions, Codicon.move, "\u526A\u5207", "\u526A\u5207\u6A21\u5F0F", false, () => this.setTransferMode("move"), false, `is-mode ${this.currentTransferMode === "move" ? "is-selected" : ""}`, "scissors");
    this.appendBottomAction(actions, Codicon.zap, "\u5F00\u59CB\u4F20\u8F93", "\u6309\u5F53\u524D\u590D\u5236/\u526A\u5207\u6A21\u5F0F\u5F00\u59CB\u4F20\u8F93", true, () => {
      void this.startPrimaryTransfer();
    }, false, "is-start", "lightning-charge-fill", "warning");
    const spacer = $(".turbofile-bottom-spacer");
    taskbar.appendChild(status);
    taskbar.appendChild(actions);
    taskbar.appendChild(spacer);
    return taskbar;
  }
  renderLiveTransferPanel(tasks) {
    const transferItems = tasks.flatMap((task) => this.getLiveTransferItems(task).map((item) => ({ task, item })));
    if (transferItems.length <= 1) {
      const task = tasks[0];
      const item = transferItems[0]?.item ?? this.createFallbackTransferItem(task);
      return this.renderSingleLiveTransferPanel(task, item);
    }
    return this.renderMultiLiveTransferPanel(tasks, transferItems);
  }
  renderSingleLiveTransferPanel(task, item) {
    const panel = $(".turbofile-live-transfer-panel");
    panel.classList.add("is-single");
    panel.appendChild(this.renderLiveTransferFileCard(task, item, true));
    return panel;
  }
  renderMultiLiveTransferPanel(tasks, transferItems) {
    const panel = $(".turbofile-live-transfer-panel");
    panel.classList.add("is-multi");
    const aggregate = this.getLiveTransferAggregate(tasks);
    const header = $(".turbofile-live-transfer-header");
    const title = $(".turbofile-live-transfer-title");
    title.textContent = "\u591A\u6587\u4EF6\u4F20\u8F93";
    const count = $(".turbofile-live-transfer-count");
    count.textContent = String(transferItems.length);
    title.appendChild(count);
    header.appendChild(title);
    const summary = $(".turbofile-live-transfer-summary");
    summary.appendChild(this.renderLiveTransferMetric("lightning-charge-fill", this.formatSpeed(aggregate.speedBytesPerSecond), "\u5F53\u524D\u901F\u5EA6", "success"));
    summary.appendChild(this.renderLiveTransferMetric("clock", this.formatElapsed(this.getElapsedSince(aggregate.startedAt)), "\u5DF2\u8017\u65F6", "info"));
    summary.appendChild(this.renderLiveTransferMetric("arrow-clockwise", this.formatRemaining(aggregate.remainingMs), "\u5269\u4F59\u65F6\u95F4", "primary"));
    summary.appendChild(this.renderLiveTransferMetric("archive", `${formatSize(aggregate.transferredBytes)} / ${formatSize(aggregate.totalBytes)}`, "\u5DF2\u4F20\u8F93", "info"));
    const cancelAll = document.createElement("button");
    cancelAll.className = "turbofile-live-transfer-cancel-all";
    cancelAll.type = "button";
    cancelAll.title = "\u53D6\u6D88\u5168\u90E8\u4F20\u8F93";
    cancelAll.appendChild(renderIcon(Codicon.close));
    cancelAll.append("\u5168\u90E8\u53D6\u6D88");
    cancelAll.addEventListener("click", () => {
      void this.cancelRunningTransfers(tasks);
    });
    summary.appendChild(cancelAll);
    header.appendChild(summary);
    const list = $(".turbofile-live-transfer-list");
    list.appendChild(this.renderLiveTransferFileCard(tasks[0], this.createAggregateTransferItem(tasks, transferItems, aggregate), false));
    const footer = $(".turbofile-live-transfer-footer");
    footer.textContent = `${transferItems.filter(({ item }) => item.status === "running").length || transferItems.filter(({ item }) => item.status === "waiting").length} \u4E2A\u4EFB\u52A1\u6B63\u5728\u4F20\u8F93\u4E2D`;
    const total = $(".turbofile-live-transfer-total");
    total.textContent = `\u603B\u901F\u5EA6\uFF1A${this.formatSpeed(aggregate.speedBytesPerSecond)}`;
    footer.appendChild(total);
    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(footer);
    return panel;
  }
  renderLiveTransferFileCard(task, item, showCancel) {
    const card = $(".turbofile-live-transfer-card");
    card.classList.add(`is-${item.status}`);
    const top = $(".turbofile-live-transfer-card-top");
    top.appendChild(this.renderLiveTransferFileIcon(item));
    const identity = $(".turbofile-live-transfer-identity");
    const name = $(".turbofile-live-transfer-name");
    name.textContent = item.name;
    const size = $(".turbofile-live-transfer-size");
    size.textContent = item.displaySize || (item.rawSize > 0 || item.type !== "directory" ? formatSize(item.rawSize) : "");
    identity.appendChild(name);
    identity.appendChild(size);
    top.appendChild(identity);
    const percent = $(".turbofile-live-transfer-percent");
    percent.textContent = `${this.getLiveTransferPercent(item).toFixed(1)}%`;
    top.appendChild(percent);
    if (showCancel) {
      const cancel = document.createElement("button");
      cancel.className = "turbofile-live-transfer-cancel";
      cancel.type = "button";
      cancel.title = "\u53D6\u6D88\u4F20\u8F93";
      cancel.disabled = !!task.cancelRequested;
      cancel.appendChild(renderIcon(Codicon.close));
      cancel.addEventListener("click", () => {
        void this.cancelTask(task);
      });
      top.appendChild(cancel);
    }
    const progress = $(".turbofile-live-transfer-progress");
    const progressValue = $(".turbofile-live-transfer-progress-value");
    progressValue.style.width = `${this.getLiveTransferPercent(item)}%`;
    progress.appendChild(progressValue);
    const metrics = $(".turbofile-live-transfer-metrics");
    metrics.appendChild(this.renderLiveTransferMetric("lightning-charge-fill", this.formatSpeed(item.speedBytesPerSecond), "\u5F53\u524D\u901F\u5EA6", "success"));
    metrics.appendChild(this.renderLiveTransferMetric("clock", this.formatElapsed(this.getLiveTransferElapsedMs(task, item)), "\u5DF2\u8017\u65F6", "info"));
    metrics.appendChild(this.renderLiveTransferMetric("arrow-clockwise", this.formatRemaining(item.remainingMs), "\u5269\u4F59\u65F6\u95F4", "primary"));
    metrics.appendChild(this.renderLiveTransferMetric("archive", `${formatSize(item.transferredBytes)} / ${formatSize(this.getLiveTransferItemTotal(item))}`, "\u5DF2\u4F20\u8F93", "info"));
    metrics.appendChild(this.renderLiveTransferMetric("terminal", this.getTransferProtocolLabel(item.strategy ?? task.strategy) ?? "\u8BC6\u522B\u4E2D", "\u4F20\u8F93\u534F\u8BAE", "primary"));
    const wave = $(".turbofile-live-transfer-wave");
    wave.appendChild(this.renderLiveTransferSparkline(item.speedSamples));
    const waveLabel = $(".turbofile-live-transfer-wave-label");
    waveLabel.textContent = "\u901F\u5EA6\u6CE2\u52A8";
    wave.appendChild(waveLabel);
    metrics.appendChild(wave);
    card.appendChild(top);
    card.appendChild(progress);
    card.appendChild(metrics);
    return card;
  }
  renderLiveTransferMetric(icon, value, label, color) {
    const metric = $(".turbofile-live-transfer-metric");
    metric.appendChild(renderTurboFileIcon(icon, color));
    const text = $(".turbofile-live-transfer-metric-text");
    const valueNode = $(".turbofile-live-transfer-metric-value");
    valueNode.textContent = value;
    const labelNode = $(".turbofile-live-transfer-metric-label");
    labelNode.textContent = label;
    text.appendChild(valueNode);
    text.appendChild(labelNode);
    metric.appendChild(text);
    return metric;
  }
  renderLiveTransferFileIcon(item) {
    const icon = $(".turbofile-live-transfer-file-icon");
    const lowerName = item.name.toLowerCase();
    if (lowerName.endsWith(".zip") || lowerName.endsWith(".7z") || lowerName.endsWith(".rar") || lowerName.endsWith(".tar") || lowerName.endsWith(".gz")) {
      icon.classList.add("is-archive");
      icon.appendChild(renderTurboFileIcon("file-earmark-zip"));
      return icon;
    }
    if (lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".webp") || lowerName.endsWith(".bmp")) {
      icon.classList.add("is-image");
      icon.appendChild(renderTurboFileIcon("file-earmark"));
      return icon;
    }
    icon.classList.add("is-file");
    icon.appendChild(renderTurboFileIcon("file-earmark"));
    return icon;
  }
  renderLiveTransferSparkline(samples) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 30");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("turbofile-live-transfer-sparkline");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const normalized = samples.length >= 2 ? samples.slice(-24) : [1, 1, 1, 1, 1, 1];
    const max = Math.max(...normalized, 1);
    const points = normalized.map((value, index) => {
      const x = normalized.length === 1 ? 0 : index / (normalized.length - 1) * 120;
      const y = 26 - Math.max(0, Math.min(24, value / max * 22));
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    path.setAttribute("d", points.join(" "));
    svg.appendChild(path);
    return svg;
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
  createAggregateTransferItem(tasks, transferItems, aggregate) {
    const running = transferItems.find(({ item }) => item.status === "running") ?? transferItems.find(({ item }) => item.status === "waiting") ?? transferItems[0];
    const runningTask = tasks.find((task) => task.status === "running") ?? tasks[0];
    return {
      name: running?.item.status === "running" ? `\u6B63\u5728\u4F20\u8F93\uFF1A${running.item.name}` : `\u591A\u6587\u4EF6\u4F20\u8F93 ${transferItems.length} \u9879`,
      type: running?.item.type ?? "file",
      displaySize: `${transferItems.length} \u9879`,
      rawSize: aggregate.totalBytes,
      status: runningTask.status === "running" ? "running" : runningTask.status,
      progress: aggregate.totalBytes > 0 ? Math.round(aggregate.transferredBytes / aggregate.totalBytes * 100) : runningTask.progress,
      transferredBytes: aggregate.transferredBytes,
      totalBytes: aggregate.totalBytes,
      speedBytesPerSecond: aggregate.speedBytesPerSecond,
      remainingMs: aggregate.remainingMs,
      startedAt: aggregate.startedAt,
      strategy: running?.item.strategy ?? runningTask.strategy,
      speedSamples: runningTask.speedSamples ?? []
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
  getLiveTransferPercent(item) {
    if (item.status === "success") {
      return 100;
    }
    const totalBytes = this.getLiveTransferItemTotal(item);
    if (totalBytes > 0) {
      return Math.max(0, Math.min(100, item.transferredBytes / totalBytes * 100));
    }
    return Math.max(0, Math.min(100, item.progress));
  }
  formatSpeed(bytesPerSecond) {
    return bytesPerSecond && bytesPerSecond > 0 ? `${formatSize(bytesPerSecond)}/s` : "--";
  }
  formatRemaining(milliseconds) {
    return milliseconds !== void 0 && Number.isFinite(milliseconds) && milliseconds >= 0 ? formatDuration(milliseconds) : "--";
  }
  formatElapsed(milliseconds) {
    return milliseconds !== void 0 && Number.isFinite(milliseconds) && milliseconds >= 0 ? formatDuration(milliseconds) : "--";
  }
  getLiveTransferElapsedMs(task, item) {
    return this.getElapsedSince(item.startedAt ?? task.startedAt, item.endedAt ?? task.endedAt);
  }
  getElapsedSince(startedAt, endedAt) {
    if (startedAt === void 0) {
      return void 0;
    }
    return Math.max(0, (endedAt ?? Date.now()) - startedAt);
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
  appendBottomAction(parent, icon, label, title, primary, handler, disabled = false, extraClass = "", turboIcon, iconColor) {
    const button = document.createElement("button");
    button.className = `turbofile-bottom-action${primary ? " is-primary" : ""}${extraClass ? ` ${extraClass}` : ""}`;
    button.type = "button";
    button.title = title;
    button.disabled = disabled;
    button.appendChild(turboIcon ? renderTurboFileIcon(turboIcon, iconColor) : renderIcon(icon));
    button.append(label);
    button.addEventListener("click", handler);
    parent.appendChild(button);
  }
  setTransferMode(mode) {
    this.currentTransferMode = mode;
    this.statusMessage = mode === "copy" ? "\u5DF2\u5207\u6362\u4E3A\u590D\u5236\u6A21\u5F0F\u3002" : "\u5DF2\u5207\u6362\u4E3A\u526A\u5207\u6A21\u5F0F\uFF0C\u5F00\u59CB\u4F20\u8F93\u540E\u4F1A\u6E05\u7406\u6E90\u6587\u4EF6\u3002";
    this.render();
  }
  getPrimaryTransferSides() {
    if (this.getSelectedTransferItems("left").length > 0) {
      return { sourceSide: "left", targetSide: "right" };
    }
    if (this.getSelectedTransferItems("right").length > 0) {
      return { sourceSide: "right", targetSide: "left" };
    }
    return { sourceSide: this.lastActiveSide, targetSide: this.getOppositeSide(this.lastActiveSide) };
  }
  async copyFromPrimarySide() {
    const { sourceSide, targetSide } = this.getPrimaryTransferSides();
    await this.transferSelected(sourceSide, targetSide);
  }
  async moveFromPrimarySide() {
    const { sourceSide, targetSide } = this.getPrimaryTransferSides();
    await this.moveSelected(sourceSide, targetSide);
  }
  async startPrimaryTransfer() {
    if (this.currentTransferMode === "move") {
      await this.moveFromPrimarySide();
      return;
    }
    await this.copyFromPrimarySide();
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
    if (activeItem) {
      activeItem.startedAt ??= task.startedAt;
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
      case "rsync-direct":
      case "rsync-direct-parallel":
        return "\u76F4\u8FDE rsync";
      case "sftp-direct":
        return "\u76F4\u8FDE sftp";
      case "sftp-upload":
      case "sftp-download":
        return "\u76F4\u8FDE sftp";
      case "rsync-relay":
        return "\u4E2D\u8F6C rsync";
      case "sftp-relay":
        return "\u4E2D\u8F6C sftp";
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
      return "sftp-upload";
    }
    if (targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
      return "sftp-download";
    }
    if (this.isSameDeviceForNativeOperation(sourceDevice, targetDevice)) {
      return "remote-copy";
    }
    if (!this.isWindowsDevice(sourceDevice) && !this.isWindowsDevice(targetDevice) && sourceDevice.preferredTransferProtocol === "rsync" && targetDevice.preferredTransferProtocol === "rsync" && sourceDevice.capabilities.rsync && targetDevice.capabilities.rsync) {
      return sourceItem.directory ? "rsync-direct-parallel" : "rsync-direct";
    }
    return "sftp-direct";
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
    task.progress = status === "canceled" ? Math.max(task.progress, 0) : 100;
    task.bytes = options.bytes;
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
    const duration = formatDuration((task.endedAt ?? Date.now()) - task.startedAt);
    const parts = [duration];
    if (task.status === "running" && task.totalBytes !== void 0 && task.transferredBytes !== void 0) {
      if (task.totalBytes > 0) {
        parts.push(`${formatSize(task.transferredBytes)} / ${formatSize(task.totalBytes)}`);
      } else if (task.transferredBytes > 0) {
        parts.push(formatSize(task.transferredBytes));
      }
      const runningThroughput = formatThroughput(task.transferredBytes, Date.now() - task.startedAt);
      if (runningThroughput) {
        parts.push(runningThroughput);
      }
    }
    if (task.bytes !== void 0) {
      parts.push(formatSize(task.bytes));
      const throughput = formatThroughput(task.bytes, (task.endedAt ?? Date.now()) - task.startedAt);
      if (throughput) {
        parts.push(throughput);
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
    figure.addEventListener("mousemove", (event) => this.updateImagePreviewPixelTooltip(event, stage, tooltip, image, src));
    figure.addEventListener("mouseleave", () => {
      tooltip.classList.remove("is-visible");
    });
  }
  updateImagePreviewPixelTooltip(event, stage, tooltip, image, src) {
    if (!this.imageGridState?.pixelInspectorVisible) {
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
HTML (#${this.toHexColor(r, g, b)})`;
  }
  toHexColor(r, g, b) {
    return [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("");
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
      tooltip?.classList.remove("is-visible");
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
  getOppositeSide(side) {
    return side === "left" ? "right" : "left";
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
      this.paneDirectoryCache.set(cacheKey, entry);
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
    this.lastActiveSide = side;
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
    const state = this.paneStates[side];
    const selectablePaths = state.items.filter((item) => !!item.path && !item.parent).map((item) => item.path);
    state.selectedPaths.clear();
    for (const path of selectablePaths) {
      state.selectedPaths.add(path);
    }
    const focusedPath = state.selectedPath && state.selectedPaths.has(state.selectedPath) ? state.selectedPath : selectablePaths[0];
    state.selectedPath = focusedPath;
    state.selectionAnchorPath = focusedPath;
    this.lastActiveSide = side;
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
  getInternalDragOperation(side, item, event) {
    if (this.internalTransferClipboard?.operation === "move" && this.internalTransferClipboard.sourceSide === side && this.internalTransferClipboard.items.some((candidate) => candidate.path === item.path)) {
      return "move";
    }
    return this.getDropTransferOperation(event);
  }
  getDropTransferOperation(event) {
    const dataTransfer = event.dataTransfer;
    const explicitOperation = dataTransfer?.getData("application/x-turbofile-operation");
    if (explicitOperation === "move") {
      return "move";
    }
    if (explicitOperation === "copy") {
      return "copy";
    }
    if (event.shiftKey || dataTransfer?.effectAllowed?.toLowerCase() === "move") {
      return "move";
    }
    return "copy";
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
      if (activeItem) {
        activeItem.strategy = plannedStrategy;
      }
      if (options.task) {
        options.task.strategy = plannedStrategy;
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
        if (options.refreshTarget) {
          if (options.task) {
            this.updateTask(options.task, `\u6B63\u5728\u5237\u65B0\u76EE\u6807\u76EE\u5F55\uFF1A${targetDevice.name}`, 90);
          }
          await this.refreshPane(targetSide, { force: true });
        }
        return { ok: true, message: result.message, bytes: result.bytes, strategy: result.strategy };
      }
      return { ok: false, message: result.message, bytes: result.bytes, strategy: result.strategy, canceled: result.canceled };
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
      task.strategy = plannedStrategy;
      for (const transferItem of task.transferItems) {
        transferItem.strategy = plannedStrategy;
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
        this.finishTask(task, "canceled", `\u5DF2\u53D6\u6D88\u6279\u91CF\u4F20\u8F93\uFF1A${items.length} \u9879`, { bytes: result.bytes, strategy: result.strategy });
        return false;
      }
      if (!result.ok) {
        this.finishTask(task, "error", `\u6279\u91CF\u4F20\u8F93\u5B8C\u6210 ${result.completed} \u9879\uFF0C\u5931\u8D25 ${result.failed} \u9879\u3002`, { bytes: result.bytes, strategy: result.strategy, error: result.failures[0]?.message });
        return false;
      }
      this.finishTask(task, "success", `${operation === "move" ? "\u526A\u5207\u4F20\u8F93" : "\u6279\u91CF\u4F20\u8F93"}\u5B8C\u6210\uFF1A${result.completed} \u9879\uFF0C${formatSize(result.bytes)}\u3002`, { bytes: result.bytes, strategy: result.strategy });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u6279\u91CF\u4F20\u8F93\u5931\u8D25\uFF1A${message}`, { error: message });
      return false;
    } finally {
      progressDisposable.dispose();
    }
  }
  async moveSelected(sourceSide, targetSide) {
    const items = this.getSelectedTransferItems(sourceSide);
    const device = this.getPaneDevice(sourceSide);
    const targetDevice = this.getPaneDevice(targetSide);
    if (!items.length || !device || !targetDevice) {
      this.statusMessage = "\u8BF7\u5148\u9009\u62E9\u8981\u526A\u5207\u7684\u6587\u4EF6\u6216\u76EE\u5F55\u3002";
      this.render();
      return;
    }
    if (items.length > 1) {
      await this.transferItemsBatch(sourceSide, targetSide, device, targetDevice, items, "move");
      return;
    }
    if (this.isSameDeviceForNativeOperation(device, targetDevice)) {
      const batch2 = items.length > 1;
      const task2 = this.beginTask("rename", batch2 ? `\u526A\u5207\u79FB\u52A8 ${items.length} \u9879` : `\u526A\u5207\u79FB\u52A8 ${items[0].name}`, `${device.name} -> ${targetDevice.name}`);
      task2.progress = 0;
      task2.cancelRequested = false;
      task2.transferItems = items.map((item) => this.createTransferTaskItem(item));
      task2.speedSamples = [];
      await this.moveInternalItemsNatively(task2, device, sourceSide, targetSide, items);
      return;
    }
    const transferred = await this.transferSelected(sourceSide, targetSide);
    if (!transferred) {
      return;
    }
    const batch = items.length > 1;
    const task = this.beginTask("delete", batch ? `\u526A\u5207\u6E05\u7406 ${items.length} \u9879` : `\u526A\u5207\u6E05\u7406 ${items[0].name}`, `\u6B63\u5728\u5220\u9664\u6765\u6E90\uFF1A${device.name}`);
    this.removePaneItems(sourceSide, items);
    try {
      let deleted = 0;
      const failures = [];
      for (const [index, item] of items.entries()) {
        this.updateTask(task, batch ? `\u6B63\u5728\u5220\u9664\u6765\u6E90 ${index + 1}/${items.length}\uFF1A${item.name}` : `\u6B63\u5728\u5220\u9664\u6765\u6E90\uFF1A${item.name}`, Math.min(88, 20 + Math.round(index / items.length * 60)));
        const result = await this.sshService.deletePath(await this.toTransferEndpoint(device, item.path), true);
        if (result.ok) {
          deleted++;
        } else {
          failures.push(`${item.name}: ${result.message}`);
        }
      }
      this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u6765\u6E90\u76EE\u5F55\uFF1A${device.name}`, 90);
      await this.refreshPane(sourceSide, { force: true });
      if (failures.length) {
        this.finishTask(task, "error", `\u76EE\u6807\u5DF2\u590D\u5236\uFF0C\u4F46\u5220\u9664\u6765\u6E90\u5931\u8D25 ${failures.length} \u9879\u3002`, { error: failures[0] });
        return;
      }
      this.finishTask(task, "success", batch ? `\u526A\u5207\u5B8C\u6210\uFF1A${deleted} \u9879` : `\u526A\u5207\u5B8C\u6210\uFF1A${items[0].name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u76EE\u6807\u5DF2\u590D\u5236\uFF0C\u4F46\u5220\u9664\u6765\u6E90\u5931\u8D25\uFF1A${message}`, { error: message });
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
    const name = value.trim();
    if (!name) {
      return "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\u3002";
    }
    if (name === "." || name === "..") {
      return "\u4E0D\u80FD\u4F7F\u7528 . \u6216 .. \u4F5C\u4E3A\u540D\u79F0\u3002";
    }
    if (name.includes("/") || name.includes("\\")) {
      return "\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u8DEF\u5F84\u5206\u9694\u7B26\u3002";
    }
    if (device && this.isWindowsDevice(device) && /[<>:"|?*]/.test(name)) {
      return 'Windows \u540D\u79F0\u4E0D\u80FD\u5305\u542B < > : " | ? *\u3002';
    }
    const caseInsensitive = !device || this.isWindowsDevice(device);
    const nameKey = caseInsensitive ? name.toLocaleLowerCase() : name;
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
    if (!item.path || !device || item.parent || !nextName.trim() || nextName.trim() === item.name) {
      return;
    }
    const targetName = nextName.trim();
    const targetPath = joinPanePath(this.paneStates[side].path, targetName, this.isWindowsDevice(device));
    const task = this.beginTask("rename", `\u91CD\u547D\u540D ${item.name}`, `${item.name} -> ${targetName}`);
    try {
      const result = await this.sshService.renamePath(await this.toTransferEndpoint(device, item.path), targetPath);
      if (result.ok) {
        this.updateTask(task, `\u6B63\u5728\u5237\u65B0\u76EE\u5F55\uFF1A${device.name}`, 90);
        this.finishTask(task, "success", `\u5DF2\u91CD\u547D\u540D\uFF1A${item.name} -> ${targetName}`);
      } else {
        this.finishTask(task, "error", `\u91CD\u547D\u540D\u5931\u8D25\uFF1A${result.message}`, { error: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finishTask(task, "error", `\u91CD\u547D\u540D\u5931\u8D25\uFF1A${message}`, { error: message });
    } finally {
      await this.refreshPane(side, { force: true });
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
      columns: 8,
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
    if (!this.imageGridState || this.imageGridState.columns === columns) {
      return;
    }
    this.imageGridState.columns = columns;
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
      const result = await this.readImageGridImage(device, image.item.path, {
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
      this.releaseImageBlobUrl(image.thumbnailUrl);
      const thumbnailUrl = result.ok ? this.createImageObjectUrl(result) : void 0;
      image.thumbnailContent = thumbnailUrl ? "" : result.ok ? result.content : "";
      image.thumbnailUrl = thumbnailUrl;
      image.thumbnailMime = result.mime || getMimeType(image.item.name);
      image.thumbnailError = result.ok ? void 0 : result.message;
      image.width = result.width ?? image.width;
      image.height = result.height ?? image.height;
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
      const resource = device.id === LOCAL_WINDOWS_DEVICE_ID ? URI.file(item.path) : this.ensureRemoteFileSystemProvider().registerFile(device, await this.getSshConnectionOptions(device), item);
      void this.editorService.openEditor({
        resource,
        options: {
          pinned: true,
          revealIfOpened: true,
          override: DEFAULT_EDITOR_ASSOCIATION.id
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
    if (!device) {
      return;
    }
    this.taskbarHiddenForTerminal = true;
    this.render();
    const title = this.getTerminalTitle(side, device);
    await this.terminalGroupService.showPanel(true);
    if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
      const task2 = this.beginTask("terminal", `\u6253\u5F00\u7EC8\u7AEF ${title}`, state.path);
      try {
        const defaultProfile = this.terminalProfileService.getDefaultProfile();
        await this.createAndRevealTerminal({
          cwd: state.path,
          location: TerminalLocation.Panel,
          config: defaultProfile ? {
            ...defaultProfile,
            profileName: title,
            overrideName: true,
            icon: defaultProfile.icon ?? Codicon.terminal
          } : void 0
        });
        this.finishTask(task2, "success", `\u5DF2\u6253\u5F00\u672C\u5730\u7EC8\u7AEF\uFF1A${title}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.restoreTaskbarAfterTerminal();
        this.finishTask(task2, "error", `\u6253\u5F00\u672C\u5730\u7EC8\u7AEF\u5931\u8D25\uFF1A${message}`, { error: message });
      }
      return;
    }
    const task = this.beginTask("terminal", `\u6253\u5F00 SSH \u7EC8\u7AEF ${title}`, state.path);
    try {
      const connection = await this.getSshConnectionOptions(device);
      await this.createAndRevealTerminal({
        location: TerminalLocation.Panel,
        config: {
          name: title,
          icon: Codicon.terminal,
          isFeatureTerminal: false,
          customPtyImplementation: (id, cols, rows) => new TurboFileSshTerminalProcess(id, cols, rows, this.sshService, connection, state.path)
        }
      });
      this.finishTask(task, "success", `\u5DF2\u6253\u5F00\u5185\u7F6E SSH \u7EC8\u7AEF\uFF1A${title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.restoreTaskbarAfterTerminal();
      this.finishTask(task, "error", `\u6253\u5F00 SSH \u7EC8\u7AEF\u5931\u8D25\uFF1A${message}`, { error: message });
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
  async createAndRevealTerminal(options) {
    const instance = await this.terminalService.createTerminal(options);
    this.terminalService.setActiveInstance(instance);
    await this.terminalService.focusInstance(instance);
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
      supportsRsync: device.preferredTransferProtocol === "rsync" && device.capabilities.rsync,
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
    return device.defaultPath || (device.id === LOCAL_WINDOWS_DEVICE_ID ? this.getLocalWindowsDefaultPath() : "/");
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
    const targetPath = this.getRememberedPaneDevicePath(side, device) ?? this.getDefaultPaneDevicePath(device);
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
        state.path = devices[0].defaultPath || this.getLocalWindowsDefaultPath();
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
    return value === "rsync" || value === "scp" || value === "sftp" ? value : "sftp";
  }
  renderDeviceForm() {
    const overlay = $(".turbofile-device-overlay");
    const form = document.createElement("form");
    form.className = "turbofile-device-form";
    this.bindDeviceFormEventIsolation(form);
    const editingDevice = this.editingDeviceId ? this.devices.find((device) => device.id === this.editingDeviceId) : void 0;
    const isEditing = !!editingDevice;
    const title = $(".turbofile-device-form-title");
    title.textContent = isEditing ? "\u7F16\u8F91 SSH \u8BBE\u5907" : "\u6DFB\u52A0 SSH \u8BBE\u5907";
    form.appendChild(title);
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
    this.appendSelectField(form, "preferredTransferProtocol", "\u4F20\u8F93\u534F\u8BAE", [
      ["sftp", "SFTP \u9ED8\u8BA4\u7A33\u5B9A"],
      ["rsync", "rsync \u6781\u901F\u6A21\u5F0F"],
      ["scp", "SCP \u517C\u5BB9\u6A21\u5F0F"]
    ], editingDevice?.preferredTransferProtocol ?? "sftp");
    this.appendInputField(form, "password", "\u5BC6\u7801", isEditing ? "\u7559\u7A7A\u4FDD\u6301\u539F\u5BC6\u7801" : "", "password", true);
    this.appendInputField(form, "privateKeyPath", "\u79C1\u94A5\u8DEF\u5F84", "C:\\Users\\User\\.ssh\\id_rsa", "text", true, editingDevice?.privateKeyPath);
    this.appendInputField(form, "passphrase", "\u79C1\u94A5\u53E3\u4EE4", isEditing ? "\u7559\u7A7A\u4FDD\u6301\u539F\u79C1\u94A5\u53E3\u4EE4" : "", "password", true);
    this.appendInputField(form, "defaultPath", "\u9ED8\u8BA4\u76EE\u5F55", "/home", "text", true, editingDevice?.defaultPath);
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
      message.textContent = "\u6B63\u5728\u4FDD\u5B58\u8BBE\u5907...";
      try {
        let savedDevice = editingDevice ? await this.deviceStore.updateDevice(editingDevice.id, draft) : await this.deviceStore.saveDevice(draft);
        const capabilityMessage = await this.detectAndStoreDeviceCapabilities(savedDevice);
        savedDevice = this.deviceStore.loadDevices().find((device) => device.id === savedDevice.id) ?? savedDevice;
        this.devices = this.deviceStore.loadDevices();
        this.ensurePaneDeviceSelection();
        this.deviceFormMessage = `${editingDevice ? "\u5DF2\u66F4\u65B0" : "\u5DF2\u4FDD\u5B58"}\u8BBE\u5907\uFF1A${savedDevice.name}${capabilityMessage ? `\uFF0C${capabilityMessage}` : ""}`;
        this.statusMessage = `${this.deviceFormMessage}\u3002\u53EF\u5728\u8BBE\u5907\u4E0B\u62C9\u83DC\u5355\u4E2D\u9009\u62E9\u3002`;
        this.isDeviceFormVisible = false;
        this.editingDeviceId = void 0;
        this.render();
        void this.refreshPane("right");
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
      preferredTransferProtocol: this.normalizeTransferProtocol(String(formData.get("preferredTransferProtocol") || "sftp"))
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
    const result = await this.sshService.createDirectory(this.toEndpoint(resource));
    if (!result.ok) {
      throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
    }
    this.stats.set(resource.toString(), { type: FileType.Directory, ctime: Date.now(), mtime: Date.now(), size: 0 });
    this._onDidChangeFile.fire([{ resource, type: FileChangeType.ADDED }]);
  }
  async readdir(resource) {
    const registeredDevice = this.getRegisteredDevice(resource);
    const listing = await this.sshService.listRemoteDirectory(registeredDevice.connection, this.toRemotePath(resource));
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
    const result = await this.sshService.deletePath(this.toEndpoint(resource), opts.recursive);
    if (!result.ok) {
      throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
    }
    this.stats.delete(resource.toString());
    this.remotePaths.delete(resource.toString());
    this._onDidChangeFile.fire([{ resource, type: FileChangeType.DELETED }]);
  }
  async rename(from, to, _opts) {
    const result = await this.sshService.renamePath(this.toEndpoint(from), this.toRemotePath(to));
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
    const result = await this.sshService.readFile(this.toEndpoint(resource), { encoding: "base64", maxBytes: 256 * 1024 * 1024 });
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
    const result = await this.sshService.writeFile(this.toEndpoint(resource), encodeBase64(VSBuffer.wrap(content)), "base64");
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
    const listing = await this.sshService.listRemoteDirectory(registeredDevice.connection, parentPath);
    const name = getPathBasename(path);
    const entry = listing.entries.find((entry2) => entry2.path === path || entry2.name === name);
    if (!entry) {
      throw createTurboFileProviderError(`File not found: ${path}`, FileSystemProviderErrorCode.FileNotFound);
    }
    return entry;
  }
  toEndpoint(resource) {
    const registeredDevice = this.getRegisteredDevice(resource);
    return {
      kind: "ssh",
      path: this.toRemotePath(resource),
      connection: registeredDevice.connection,
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
    this._properties.title = `\u6781\u901F\u4F20 ${connection.username}@${connection.host}`;
  }
  async start() {
    try {
      const session = await this.sshService.createSshTerminal(this.connection, this.cwd, this._lastDimensions.cols, this._lastDimensions.rows);
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
  return `${formatSize(bytes / milliseconds * 1e3)}/s`;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcYnJvd3NlclxcdHVyYm9maWxlRWRpdG9yLnRzIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxHQUFHLFdBQXNCLGlCQUErQjtBQUNqRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsY0FBYyxjQUFjLGdCQUFnQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBa0IsV0FBVyxnQkFBZ0I7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBd0gsNEJBQXNJO0FBQzlQLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLCtCQUErQixnQkFBZ0IsVUFBVSxnQ0FBZ0MsNkJBQTZCLFVBQWtFLG9CQUE2RztBQUM5UyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQXVILHdCQUF3QjtBQUMvSSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDBCQUEwQztBQUNuRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtDQUFzRDtBQUUvRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QixhQUFh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LEVBQ3ZCLHVCQUF1QjtBQUFBLEVBQ3ZCLG1CQUFtQjtBQUFBLEVBQ25CLGdDQUFnQztBQUFBLEVBQ2hDLDRCQUE0QjtBQUFBLEVBQzVCLGdDQUFnQztBQUFBLEVBQ2hDLHFCQUFxQjtBQUFBLEVBQ3JCLHFCQUFxQjtBQUFBLEVBQ3JCLDBCQUEwQjtBQUFBLEVBQzFCLDhCQUE4QjtBQUFBLEVBQzlCLDhCQUE4QjtBQUFBLEVBQzlCLG1DQUFtQztBQUFBLEVBQ25DLG9CQUFvQjtBQUFBLEVBQ3BCLG9CQUFvQjtBQUFBLEVBQ3BCLDBCQUEwQjtBQUFBLEVBQzFCLHlCQUF5QjtBQUFBLEVBQ3pCLHlCQUF5QjtBQUFBLEVBQ3pCLDhCQUE4QjtBQUFBLEVBQzlCLHdDQUF3QztBQUFBLEVBQ3hDLG9CQUFvQjtBQUFBLEVBQ3BCLDhCQUE4QjtBQUFBLEVBQzlCLG1DQUFtQztBQUFBLEVBQ25DLG9DQUFvQztBQUFBLEVBQ3BDLG1CQUFtQjtBQUFBLEVBQ25CLG1CQUFtQjtBQUFBLEVBQ25CLDRCQUE0QjtBQUFBLEVBQzVCLDRCQUE0QjtBQUFBLEVBQzVCLGVBQWU7QUFBQSxFQUNmLHlCQUF5QjtBQUFBLEVBQ3pCLHlCQUF5QjtBQUFBLEVBQ3pCLGtDQUFrQztBQUFBLEVBQ2xDLDJCQUEyQjtBQUFBLEVBQzNCLDJCQUEyQjtBQUFBLEVBQzNCLHVCQUF1QjtBQUFBLEVBQ3ZCLGlCQUFpQjtBQUFBLEVBQ2pCLHVCQUF1QjtBQUFBLEVBQ3ZCLDZCQUE2QjtBQUFBLEVBQzdCLDJCQUEyQjtBQUFBLEVBQzNCLDRCQUE0QjtBQUFBLEVBQzVCLDRCQUE0QjtBQUFBLEVBQzVCLDRCQUE0QjtBQUFBLEVBQzVCLHdCQUF3QjtBQUFBLEVBQ3hCLHVCQUF1QjtBQUFBLEVBQ3ZCLHVCQUF1QjtBQUFBLEVBQ3ZCLHlDQUF5QztBQUFBLEVBQ3pDLDRDQUE0QztBQUFBLEVBQzVDLDJDQUEyQztBQUFBLEVBQzNDLGdDQUFnQztBQUFBLEVBQ2hDLG1DQUFtQztBQUFBLEVBQ25DLGtDQUFrQztBQUFBLEVBQ2xDLHNCQUFzQjtBQUFBLEVB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RUFDN0I7QUFDQSxRQUFNLFVBQVUsS0FBSyxNQUFNLFVBQVUsRUFBRTtBQUN2QyxRQUFNLG1CQUFtQixLQUFLLE1BQU0sVUFBVSxFQUFFLEVBQUUsU0FBUyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQzVFLFNBQU8sR0FBRyxPQUFPLElBQUksZ0JBQWdCO0FBQ3RDO0FBRUEsU0FBUyxpQkFBaUIsT0FBZSxjQUE4QjtBQUN0RSxNQUFJLFNBQVMsS0FBSyxnQkFBZ0IsR0FBRztBQUNwQyxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sR0FBRyxXQUFZLFFBQVEsZUFBZ0IsR0FBSSxDQUFDO0FBQ3BEO0FBRUEsU0FBUyxXQUFXLFdBQTJCO0FBQzlDLE1BQUksQ0FBQyxXQUFXO0FBQ2YsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLE9BQU8sSUFBSSxLQUFLLFNBQVM7QUFDL0IsUUFBTSxNQUFNLENBQUMsVUFBa0IsTUFBTSxTQUFTLEVBQUUsU0FBUyxHQUFHLEdBQUc7QUFDL0QsU0FBTyxHQUFHLEtBQUssWUFBWSxDQUFDLElBQUksSUFBSSxLQUFLLFNBQVMsSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsSUFBSSxJQUFJLEtBQUssU0FBUyxDQUFDLENBQUMsSUFBSSxJQUFJLEtBQUssV0FBVyxDQUFDLENBQUM7QUFDbEk7IiwKICAibmFtZXMiOiBbIndpbmRvdyIsICJzZWdtZW50cyIsICJjdXJyZW50IiwgInNpemUiLCAiYmF0Y2giLCAidGFzayIsICJ2aXNpYmxlSW5kZXhlcyIsICJlbnRyeSIsICJub3JtYWxpemVkIiwgInBhdGgiXQp9Cg==
