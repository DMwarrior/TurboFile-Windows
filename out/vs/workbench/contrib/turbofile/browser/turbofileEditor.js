/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TurboFileEditor_1;
import './media/turbofile.css';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { $, clearNode, getWindow } from '../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { Separator, toAction } from '../../../../base/common/actions.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITurboFileSshService } from '../../../../platform/turbofile/common/turbofile.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { createFileSystemProviderError, FileKind, FileSystemProviderErrorCode, FileType, IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CodeDataTransfers, getPathForFile } from '../../../../platform/dnd/browser/dnd.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ITerminalGroupService, ITerminalService } from '../../terminal/browser/terminal.js';
import { BasePty } from '../../terminal/common/basePty.js';
import { ITerminalProfileService } from '../../terminal/common/terminal.js';
import { ColorThemeData } from '../../../services/themes/common/colorThemeData.js';
import { COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS, IWorkbenchThemeService, ThemeSettings, ThemeSettingDefaults } from '../../../services/themes/common/workbenchThemeService.js';
import { TurboFileEditorInput } from '../common/turbofileEditorInput.js';
import { TurboFileDeviceStore } from './turbofileDeviceStore.js';
import { turboFileWorkbenchBridge } from './turbofileWorkbenchBridge.js';
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
const PANE_DEVICE_SNAPSHOT_TTL_MS = 300000;
const TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY = 'turbofile.browser.fontSize';
const TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY = 'turbofile.browser.fontFamily';
const TURBOFILE_UI_FONT_SIZE_STORAGE_KEY = 'turbofile.ui.fontSize';
const TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY = 'turbofile.ui.fontFamily';
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
];
const TURBOFILE_BROWSER_FONT_FAMILIES = TURBOFILE_UI_FONT_FAMILIES;
const IMAGE_GRID_VIEW_OPTIONS = [
    { columns: 4, kind: 'large', label: '大图网格' },
    { columns: 8, kind: 'medium', label: '标准网格' },
];
const IMAGE_GRID_NEIGHBOR_LOAD_COUNT = 2;
const IMAGE_GRID_OVERSCAN_ROWS = 1;
const IMAGE_GRID_CARD_GAP = 16;
const IMAGE_GRID_CARD_VERTICAL_CHROME = 0;
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
};
let TurboFileEditor = class TurboFileEditor extends EditorPane {
    static { TurboFileEditor_1 = this; }
    static { this.ID = TurboFileEditorInput.EDITOR_ID; }
    constructor(group, telemetryService, workbenchThemeService, storageService, environmentService, sshService, contextMenuService, fileService, modelService, languageService, instantiationService, editorService, terminalService, terminalGroupService, terminalProfileService, quickInputService, clipboardService, configurationService, layoutService) {
        super(TurboFileEditor_1.ID, group, telemetryService, workbenchThemeService, storageService);
        this.workbenchThemeService = workbenchThemeService;
        this.storageService = storageService;
        this.environmentService = environmentService;
        this.sshService = sshService;
        this.contextMenuService = contextMenuService;
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
        this.imageGridThumbnailQueued = new Set();
        this.imageGridThumbnailLoadingCount = 0;
        this.imageGridPreviewRequestSeq = 0;
        this.imageGridLoadedThumbnailIndexes = new Set();
        this.imageGridLoadedPreviewIndexes = new Set();
        this.imagePreviewRenderSeq = 0;
        this.imageReadCache = new Map();
        this.fileListScrollRaf = { left: 0, right: 0 };
        this.fileListRenderedRange = { left: undefined, right: undefined };
        this.paneDirectoryCache = new Map();
        this.paneDirectoryInflight = new Map();
        this.paneDeviceSnapshots = new Map();
        this.activePage = 'transfer';
        this.isTaskLogVisible = false;
        this.paneRequestSeq = { left: 0, right: 0 };
        this.isDeviceFormVisible = false;
        this.hasAppliedInitialRightPaneDefault = false;
        this.deviceFormMessage = '';
        this.deviceConnectionMessages = new Map();
        this.availableColorThemes = [];
        this.isLoadingColorThemes = false;
        this.hasLoadedColorThemes = false;
        this.currentTransferMode = 'copy';
        this.lastActiveSide = 'left';
        this.taskbarHiddenForTerminal = false;
        this.windowsClipboardPasteInFlight = new Set();
        this.availableWindowsDriveRoots = [];
        this.statusMessage = '极速传已启动：双栏浏览、设备管理、传输、预览和终端入口已接入。';
        this.taskSequence = 1;
        this.tasks = [];
        const localWindowsDefaultPath = this.getLocalWindowsDefaultPath();
        this.localWindowsDevice = {
            id: LOCAL_WINDOWS_DEVICE_ID,
            name: '樊坤',
            host: '10.190.129.29',
            port: 0,
            username: 'warrior',
            authType: 'password',
            defaultPath: localWindowsDefaultPath,
            platform: 'windows',
            capabilities: {
                ssh: false,
                sftp: false,
                scp: false,
                rsync: false,
                shell: true,
                archive: true
            }
        };
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
    createEditor(parent) {
        this.editorGroupContainer = parent.closest('.editor-group-container');
        this.editorGroupContainer?.classList.add('turbofile-main-editor-group');
        this.container = $('.turbofile-workbench');
        parent.appendChild(this.container);
        this.deviceStore = this.instantiationService.createInstance(TurboFileDeviceStore);
        this.devices = this.deviceStore.loadDevices();
        void this.ensureDefaultSshDevices();
        void this.ensureTurboFileChrome();
        this.ensureRemoteFileSystemProvider();
        void this.ensureNativeEditorTabs();
        this._register(turboFileWorkbenchBridge.onDidRunCommand(command => this.handleWorkbenchCommand(command)));
        this._register(this.layoutService.onDidChangePartVisibility(event => {
            if (event.partId === "workbench.parts.panel" /* Parts.PANEL_PART */ && !event.visible) {
                this.restoreTaskbarAfterTerminal();
            }
        }));
        this._register(this.workbenchThemeService.onDidColorThemeChange(() => {
            this.applyTurboFileThemeState();
            this.ensureTitlebarThemeToggle();
            if (this.activePage === 'themes') {
                this.render();
            }
        }));
        void this.syncNativeEditorDisplaySettings();
        void this.loadColorThemes();
        void this.refreshWindowsDriveRoots();
        this.ensurePaneDeviceSelection({ preferFirstSshOnRight: true });
        this.render();
        void this.refreshPane('left');
        void this.refreshPane('right');
        void this.prefetchDefaultDeviceDirectories();
    }
    async ensureTurboFileChrome() {
        if (this.configurationService.getValue('workbench.statusBar.visible') !== false) {
            await this.configurationService.updateValue('workbench.statusBar.visible', false, 2 /* ConfigurationTarget.USER */);
        }
    }
    async ensureDefaultSshDevices() {
        if (!this.deviceStore) {
            return;
        }
        const result = await this.deviceStore.ensureDefaultDevices();
        if (!result.added && !result.updated) {
            return;
        }
        this.devices = this.deviceStore.loadDevices();
        this.ensurePaneDeviceSelection({ preferFirstSshOnRight: true });
        this.statusMessage = `已加载默认 SSH 设备：新增 ${result.added} 台，更新 ${result.updated} 台。`;
        this.render();
        void this.refreshPane('left');
        void this.refreshPane('right');
        void this.prefetchDefaultDeviceDirectories();
    }
    async setInput(input, options, context, token) {
        await super.setInput(input, options, context, token);
        if (!token.isCancellationRequested) {
            this.render();
        }
    }
    layout(_dimension, _position) {
        // CSS grid owns the fast-transfer two-pane layout.
    }
    setVisible(visible) {
        super.setVisible(visible);
        document.body.classList.toggle('turbofile-main-editor-visible', visible);
        if (visible) {
            this.ensureTitlebarThemeToggle();
        }
        else {
            this.removeTitlebarThemeToggle();
        }
    }
    focus() {
        this.container?.focus();
    }
    dispose() {
        document.body.classList.remove('turbofile-main-editor-visible');
        this.editorGroupContainer?.classList.remove('turbofile-main-editor-group');
        this.removeTitlebarThemeToggle();
        this.clearFileListScrollRaf('left');
        this.clearFileListScrollRaf('right');
        this.disposeImageGridObserver();
        this.clearImageGridScrollTimer();
        this.clearImageGridScrollRaf();
        this.clearImageGridThumbnailQueue();
        this.clearImageGridPreviewPrefetchTimer();
        this.clearImageGridLoadedImageIndexes();
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
        const shell = $('.turbofile-editor-shell');
        const content = $('.turbofile-editor-content');
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
    renderTransferPage() {
        const page = $('.turbofile-transfer-page');
        if (this.tasks.some(task => task.kind === 'transfer' && task.status === 'running')) {
            page.classList.add('has-live-transfer');
        }
        const main = $('.turbofile-main');
        main.appendChild(this.renderPane('left'));
        main.appendChild(this.renderPane('right'));
        page.appendChild(main);
        if (!this.taskbarHiddenForTerminal || this.tasks.some(task => task.kind === 'transfer' && task.status === 'running')) {
            page.appendChild(this.renderTaskbar());
        }
        else {
            page.classList.add('is-terminal-focused');
        }
        return page;
    }
    renderDevicesPage() {
        const page = $('.turbofile-full-page');
        page.appendChild(this.renderPageHeader(Codicon.server, '设备管理', '管理已保存的 SSH 设备，可在这里编辑、删除和测试连接。', [
            this.createPageButton(Codicon.refresh, '刷新设备', () => {
                this.devices = this.deviceStore?.loadDevices() ?? [];
                this.ensurePaneDeviceSelection();
                this.statusMessage = `设备列表已刷新：${this.devices.length} 台 SSH 设备。`;
                this.render();
            }),
            this.createPageButton(Codicon.add, '添加 SSH 设备', () => this.showAddDeviceForm(), true)
        ]));
        const grid = $('.turbofile-device-page-grid');
        for (const device of this.getAllDevices()) {
            grid.appendChild(this.renderDevicePageCard(device));
        }
        page.appendChild(grid);
        return page;
    }
    ensureTitlebarThemeToggle(retry = 0) {
        if (!document.body.classList.contains('turbofile-main-editor-visible')) {
            return;
        }
        this.removeTitlebarThemeToggle();
        const titlebarRight = document.querySelector('.monaco-workbench .part.titlebar .titlebar-container > .titlebar-right');
        const controls = titlebarRight?.querySelector('.window-controls-container');
        if (!titlebarRight || !controls) {
            if (retry < 10) {
                setTimeout(() => this.ensureTitlebarThemeToggle(retry + 1), 100);
            }
            return;
        }
        titlebarRight.insertBefore(this.createThemeToggleButton(), controls);
    }
    removeTitlebarThemeToggle() {
        for (const button of Array.from(document.querySelectorAll('.turbofile-theme-toggle'))) {
            button.remove();
        }
    }
    createThemeToggleButton() {
        const effectiveMode = this.getEffectiveAppearanceMode(this.getAppearanceMode());
        const targetMode = effectiveMode === 'light' ? 'dark' : 'light';
        const button = $('button.turbofile-theme-toggle');
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
    renderDevicePageCard(device) {
        const card = $('.turbofile-page-card.turbofile-device-page-card');
        card.classList.add(`is-tone-${this.getDeviceCardTone(device)}`);
        const title = $('.turbofile-page-card-title');
        title.appendChild(renderIcon(device.id === LOCAL_WINDOWS_DEVICE_ID ? Codicon.deviceDesktop : Codicon.server));
        const titleText = $('span');
        titleText.textContent = device.name;
        title.appendChild(titleText);
        const status = $('span.turbofile-device-card-status');
        status.textContent = '在线';
        title.appendChild(status);
        card.appendChild(title);
        const meta = $('.turbofile-device-page-meta');
        meta.appendChild(this.renderInfoLine('地址', device.id === LOCAL_WINDOWS_DEVICE_ID ? device.host : `${device.host}:${device.port || 22}`));
        meta.appendChild(this.renderInfoLine('用户', device.username || '本机'));
        meta.appendChild(this.renderInfoLine('默认目录', device.defaultPath || (device.id === LOCAL_WINDOWS_DEVICE_ID ? this.getLocalWindowsDefaultPath() : '/')));
        card.appendChild(meta);
        const actions = $('.turbofile-page-card-actions');
        actions.appendChild(this.createPageButton(Codicon.send, '连接', () => this.showDialogInfo('连接设备', `请在传输页左右设备栏选择「${device.name}」后开始浏览和传输。`), true));
        if (device.id !== LOCAL_WINDOWS_DEVICE_ID) {
            actions.appendChild(this.createPageButton(Codicon.edit, '编辑', () => this.showEditDeviceForm(device)));
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
    getDeviceCardTone(device) {
        const seed = `${device.host}:${device.port || 22}:${device.name}`;
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
        }
        return Math.abs(hash) % 6;
    }
    renderSettingsPage() {
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
    }
    renderAppearanceFontSettingsCard() {
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
    renderEditorFontSizeSetting() {
        return this.renderFontSizeSetting('文档字体大小', '调整当前打开文档的字号，修改后立即生效。', 'editor.fontSize', this.getEditorFontSize(), 8, 40, value => this.updateEditorFontSize(value));
    }
    renderUiFontSizeSetting() {
        return this.renderFontSizeSetting('UI 字号', '统一调整极速传界面的字体大小，不影响 VS Code 原生文档编辑器。', 'turbofile-ui-font-size', this.getUiFontSize(), 11, 24, value => this.updateUiFontSize(value));
    }
    renderBrowserFontSizeSetting() {
        return this.renderFontSizeSetting('文件浏览区字体大小', '只控制左右文件浏览区域，修改后立即生效。', 'turbofile-browser-font-size', this.getBrowserFontSize(), 11, 20, value => this.updateBrowserFontSize(value));
    }
    renderUiFontFamilySetting() {
        return this.renderFontFamilySetting('UI 字体', '选择极速传界面使用的字体。', 'turbofile-ui-font-family', this.getUiFontFamily(), TURBOFILE_UI_FONT_FAMILIES, value => this.updateUiFontFamily(value));
    }
    renderBrowserFontFamilySetting() {
        return this.renderFontFamilySetting('文件浏览区字体', '选择文件名、大小和时间的显示字体。', 'turbofile-browser-font-family', this.getBrowserFontFamily(), TURBOFILE_BROWSER_FONT_FAMILIES, value => this.updateBrowserFontFamily(value));
    }
    renderFontSizeSetting(labelText, descriptionText, id, currentFontSize, min, max, update) {
        const row = $('.turbofile-editor-setting-row.turbofile-appearance-wide-setting');
        const copy = $('.turbofile-editor-setting-copy');
        const label = $('label');
        label.textContent = labelText;
        label.htmlFor = id;
        const description = $('span');
        description.textContent = descriptionText;
        copy.appendChild(label);
        copy.appendChild(description);
        const controls = $('.turbofile-editor-setting-controls');
        const input = $('input.turbofile-editor-font-size-input');
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
    renderFontFamilySetting(labelText, descriptionText, id, currentFontFamily, options, update) {
        const row = $('.turbofile-editor-setting-row.turbofile-appearance-wide-setting');
        const copy = $('.turbofile-editor-setting-copy');
        const label = $('label');
        label.textContent = labelText;
        label.htmlFor = id;
        const description = $('span');
        description.textContent = descriptionText;
        copy.appendChild(label);
        copy.appendChild(description);
        const controls = $('.turbofile-editor-setting-controls');
        const select = $('select.turbofile-browser-select');
        select.id = id;
        for (const [value, optionLabel] of options) {
            const option = $('option');
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
    getUiFontSize() {
        const stored = Number(this.storageService.get(TURBOFILE_UI_FONT_SIZE_STORAGE_KEY, 0 /* StorageScope.PROFILE */, String(TURBOFILE_UI_DEFAULT_FONT_SIZE)));
        return this.normalizeUiFontSize(stored, TURBOFILE_UI_DEFAULT_FONT_SIZE);
    }
    getEditorFontSize() {
        const value = this.configurationService.getValue('editor.fontSize');
        return this.normalizeEditorFontSize(typeof value === 'number' ? value : TURBOFILE_UI_DEFAULT_FONT_SIZE, TURBOFILE_UI_DEFAULT_FONT_SIZE);
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
        this.storageService.store(TURBOFILE_UI_FONT_SIZE_STORAGE_KEY, String(fontSize), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.statusMessage = `UI 字号已设置为 ${fontSize}px。`;
        this.render();
    }
    updateEditorFontSize(value) {
        const fontSize = this.normalizeEditorFontSize(value, this.getEditorFontSize());
        void this.configurationService.updateValue('editor.fontSize', fontSize, 2 /* ConfigurationTarget.USER */);
        this.statusMessage = `文档字体大小已设置为 ${fontSize}px。`;
        this.render();
    }
    getUiFontFamily() {
        const stored = this.storageService.get(TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY, 0 /* StorageScope.PROFILE */, TURBOFILE_UI_DEFAULT_FONT_FAMILY);
        return TURBOFILE_UI_FONT_FAMILIES.some(([value]) => value === stored) ? stored : TURBOFILE_UI_DEFAULT_FONT_FAMILY;
    }
    updateUiFontFamily(value) {
        const fontFamily = TURBOFILE_UI_FONT_FAMILIES.some(([option]) => option === value) ? value : TURBOFILE_UI_DEFAULT_FONT_FAMILY;
        this.storageService.store(TURBOFILE_UI_FONT_FAMILY_STORAGE_KEY, fontFamily, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.statusMessage = 'UI 字体已更新。';
        this.render();
    }
    getBrowserFontSize() {
        const stored = Number(this.storageService.get(TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY, 0 /* StorageScope.PROFILE */, String(TURBOFILE_BROWSER_DEFAULT_FONT_SIZE)));
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
        this.storageService.store(TURBOFILE_BROWSER_FONT_SIZE_STORAGE_KEY, String(fontSize), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.statusMessage = `文件浏览区字体大小已设置为 ${fontSize}px。`;
        this.render();
    }
    getBrowserFontFamily() {
        const stored = this.storageService.get(TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY, 0 /* StorageScope.PROFILE */, TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY);
        return TURBOFILE_BROWSER_FONT_FAMILIES.some(([value]) => value === stored) ? stored : TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY;
    }
    updateBrowserFontFamily(value) {
        const fontFamily = TURBOFILE_BROWSER_FONT_FAMILIES.some(([option]) => option === value) ? value : TURBOFILE_BROWSER_DEFAULT_FONT_FAMILY;
        this.storageService.store(TURBOFILE_BROWSER_FONT_FAMILY_STORAGE_KEY, fontFamily, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.statusMessage = '文件浏览区字体已更新。';
        this.render();
    }
    applyBrowserAppearanceSettings() {
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
    renderThemesPage() {
        const page = $('.turbofile-full-page.turbofile-appearance-page');
        const shell = $('.turbofile-appearance-shell');
        const title = $('h1.turbofile-appearance-title');
        title.textContent = '外观';
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
        this.container.classList.toggle('is-turbofile-light', effectiveMode === 'light');
        this.container.classList.toggle('is-turbofile-dark', effectiveMode === 'dark');
    }
    getAppearanceMode() {
        if (this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
            return 'system';
        }
        return this.getEffectiveAppearanceMode();
    }
    getEffectiveAppearanceMode(mode) {
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
    getAppearanceTheme(mode) {
        const label = mode === 'dark' ? TURBOFILE_APPEARANCE_DARK_THEME_LABEL : TURBOFILE_APPEARANCE_LIGHT_THEME_LABEL;
        const settingsId = mode === 'dark' ? ThemeSettingDefaults.COLOR_THEME_DARK : ThemeSettingDefaults.COLOR_THEME_LIGHT;
        const themeId = mode === 'light' ? TURBOFILE_LIGHT_THEME_CLASS_ID : 'vs-dark turbofile-2017-dark-cpp';
        const themes = [...this.getBuiltinColorThemes(), ...this.availableColorThemes];
        return themes.find(theme => theme.label === label || theme.id === themeId)
            ?? themes.find(theme => theme.settingsId === settingsId)
            ?? this.createBuiltinColorTheme(mode === 'dark' ? 'vs-dark turbofile-2017-dark-cpp' : TURBOFILE_LIGHT_THEME_CLASS_ID, label, settingsId, mode === 'dark' ? COLOR_THEME_DARK_INITIAL_COLORS : TURBOFILE_LIGHT_THEME_COLORS);
    }
    async applyAppearanceMode(mode) {
        const darkTheme = this.getAppearanceTheme('dark');
        const lightTheme = this.getAppearanceTheme('light');
        try {
            if (mode === 'system') {
                await this.configurationService.updateValue(ThemeSettings.PREFERRED_DARK_THEME, darkTheme.settingsId, 2 /* ConfigurationTarget.USER */);
                await this.configurationService.updateValue(ThemeSettings.PREFERRED_LIGHT_THEME, lightTheme.settingsId, 2 /* ConfigurationTarget.USER */);
                await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, true, 2 /* ConfigurationTarget.USER */);
                const preferred = this.workbenchThemeService.getPreferredColorScheme();
                await this.workbenchThemeService.setColorTheme(preferred === ColorScheme.LIGHT ? lightTheme : darkTheme, 'auto');
                this.statusMessage = '已设置为跟随系统主题。';
            }
            else {
                await this.configurationService.updateValue(ThemeSettings.DETECT_COLOR_SCHEME, false, 2 /* ConfigurationTarget.USER */);
                await this.applyColorTheme(mode === 'light' ? lightTheme : darkTheme);
                return;
            }
            this.render();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.statusMessage = `切换外观失败：${message}`;
            this.render();
        }
    }
    async applyColorTheme(theme) {
        try {
            await this.workbenchThemeService.setColorTheme(theme, 'auto');
            this.statusMessage = `已切换主题：${this.getThemeLabel(theme)}`;
            this.render();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.statusMessage = `切换主题失败：${message}`;
            this.render();
        }
    }
    async loadColorThemes(force = false) {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.statusMessage = `加载主题失败：${message}`;
        }
        finally {
            this.isLoadingColorThemes = false;
            this.hasLoadedColorThemes = true;
            if (this.activePage === 'themes') {
                this.render();
            }
        }
    }
    async syncNativeEditorDisplaySettings() {
        const settingsHome = this.environmentService.parentAppUserRoamingDataHome;
        if (!settingsHome) {
            return;
        }
        const settingsUri = joinPath(settingsHome, 'settings.json');
        try {
            const settingsText = (await this.fileService.readFile(settingsUri)).value.toString();
            const settings = JSON.parse(settingsText);
            const updates = [];
            const applyIfUnset = (key, value) => {
                const inspect = this.configurationService.inspect(key);
                if (inspect.userValue !== undefined || inspect.userLocalValue !== undefined || inspect.userRemoteValue !== undefined || inspect.workspaceValue !== undefined || inspect.workspaceFolderValue !== undefined || inspect.memoryValue !== undefined) {
                    return;
                }
                updates.push(this.configurationService.updateValue(key, value, 8 /* ConfigurationTarget.MEMORY */));
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
                applyIfUnset('editor.tokenColorCustomizations', tokenColorCustomizations);
            }
            const semanticTokenColorCustomizations = settings['editor.semanticTokenColorCustomizations'];
            if (semanticTokenColorCustomizations && typeof semanticTokenColorCustomizations === 'object') {
                applyIfUnset('editor.semanticTokenColorCustomizations', semanticTokenColorCustomizations);
            }
            const semanticHighlighting = settings['editor.semanticHighlighting.enabled'];
            if (typeof semanticHighlighting === 'boolean' || typeof semanticHighlighting === 'string') {
                applyIfUnset('editor.semanticHighlighting.enabled', semanticHighlighting);
            }
            await Promise.all(updates);
        }
        catch {
            // If the host VS Code settings file is unavailable, keep the current editor configuration.
        }
    }
    getBuiltinColorThemes() {
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
    appendColorThemeIfMissing(themes, theme) {
        if (!themes.some(candidate => candidate.id === theme.id || candidate.settingsId === theme.settingsId || candidate.label === theme.label)) {
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
                return '浅色';
            case ColorScheme.HIGH_CONTRAST_DARK:
                return '高对比深色';
            case ColorScheme.HIGH_CONTRAST_LIGHT:
                return '高对比浅色';
            default:
                return '深色';
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
        }
        else {
            for (const task of this.tasks) {
                list.appendChild(this.renderTaskRow(task));
            }
        }
        page.appendChild(list);
        return page;
    }
    renderPageHeader(icon, title, subtitle, actions = []) {
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
    renderSummaryCard(label, value, icon) {
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
    renderInfoLine(label, value) {
        const line = $('.turbofile-info-line');
        const key = $('span');
        key.textContent = label;
        const content = $('strong');
        content.textContent = value;
        line.appendChild(key);
        line.appendChild(content);
        return line;
    }
    createPageButton(icon, label, handler, primary = false) {
        const button = $('button.turbofile-page-button');
        button.type = 'button';
        if (primary) {
            button.classList.add('is-primary');
        }
        button.appendChild(renderIcon(icon));
        button.append(label);
        button.addEventListener('click', handler);
        return button;
    }
    showAddDeviceForm() {
        this.activePage = 'devices';
        this.isDeviceFormVisible = true;
        this.editingDeviceId = undefined;
        this.deviceFormMessage = '';
        this.statusMessage = '请填写 SSH 设备信息，保存后会出现在设备下拉列表中。';
        this.render();
    }
    showEditDeviceForm(device) {
        if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
            return;
        }
        this.activePage = 'devices';
        this.isDeviceFormVisible = true;
        this.editingDeviceId = device.id;
        this.deviceFormMessage = `正在编辑设备：${device.name}`;
        this.statusMessage = this.deviceFormMessage;
        this.render();
    }
    setActivePage(page) {
        if (page !== 'images' && this.activePage === 'images') {
            this.imageGridState = undefined;
            this.disposeImageGridObserver();
            this.clearImageGridScrollTimer();
            this.clearImageGridScrollRaf();
            this.clearImageGridThumbnailQueue();
            this.clearImageGridPreviewPrefetchTimer();
        }
        this.activePage = page;
        if (page !== 'transfer') {
            this.taskbarHiddenForTerminal = false;
        }
        this.isTaskLogVisible = false;
        this.isDeviceFormVisible = false;
        this.editingDeviceId = undefined;
        this.render();
    }
    async deleteDeviceFromPage(device) {
        if (!this.deviceStore || device.id === LOCAL_WINDOWS_DEVICE_ID) {
            return;
        }
        const confirmed = getWindow(this.container).confirm(`确定删除设备“${device.name}”吗？`);
        if (!confirmed) {
            return;
        }
        const affectedSides = ['left', 'right'].filter(side => this.paneStates[side].deviceId === device.id);
        await this.deviceStore.deleteDevice(device.id);
        this.deviceConnectionMessages.delete(device.id);
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
    async testDeviceConnection(device) {
        if (device.id === LOCAL_WINDOWS_DEVICE_ID) {
            this.statusMessage = '本机 Windows 设备不需要 SSH 测试。';
            this.render();
            return;
        }
        this.deviceConnectionMessages.set(device.id, { status: 'testing', message: '正在测试 SSH 连接...' });
        this.render();
        const task = this.beginTask('ssh-test', `测试 ${device.name}`, `${device.username}@${device.host}:${device.port || 22}`);
        const result = await this.sshService.testConnection(await this.getSshConnectionOptions(device));
        if (result.ok) {
            this.finishTask(task, 'success', `SSH 连接成功：${device.name}`);
            this.deviceConnectionMessages.set(device.id, { status: 'success', message: `SSH 连接成功：${device.name}` });
            this.statusMessage = `SSH 连接成功：${device.name}`;
        }
        else {
            this.finishTask(task, 'error', `SSH 连接失败：${result.message}`, { error: result.message });
            this.deviceConnectionMessages.set(device.id, { status: 'error', message: `SSH 连接失败：${result.message}` });
            this.statusMessage = `SSH 连接失败：${result.message}`;
        }
        this.render();
    }
    handleWorkbenchCommand(command) {
        if (!this.deviceStore) {
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
            state.path = device.defaultPath || (device.id === LOCAL_WINDOWS_DEVICE_ID ? this.getLocalWindowsDefaultPath() : '/');
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
            this.setActivePage('settings');
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
            this.lastActiveSide = command.side;
            void this.openTerminal(command.side);
        }
    }
    renderPane(side) {
        const state = this.paneStates[side];
        const device = this.getPaneDevice(side);
        const pane = $('.turbofile-pane');
        pane.dataset.turbofileSide = side;
        const title = side === 'left' ? '左侧服务器' : '右侧服务器';
        const browserTitle = side === 'left' ? '左侧文件浏览' : '右侧文件浏览';
        const header = $('.turbofile-pane-header');
        const titleRow = $('.turbofile-pane-title');
        titleRow.appendChild(renderTurboFileIcon(side === 'left' ? 'hdd-network-fill' : 'cloud-upload-fill', side === 'left' ? 'primary' : 'success'));
        titleRow.append(title);
        const deviceSelect = this.renderDeviceSelect(side, device);
        header.appendChild(titleRow);
        header.appendChild(deviceSelect);
        const browserHeader = $('.turbofile-browser-header');
        const toolbar = $('.turbofile-browser-toolbar');
        const toolbarTitle = $('.turbofile-browser-toolbar-title');
        toolbarTitle.appendChild(renderTurboFileIcon(side === 'left' ? 'files' : 'folder-check', side === 'left' ? 'info' : 'success'));
        toolbarTitle.append(browserTitle);
        toolbar.appendChild(toolbarTitle);
        const toolbarAccent = side === 'left' ? 'primary' : 'success';
        const gridAccent = side === 'left' ? 'info' : 'success';
        this.appendToolbarButton(toolbar, Codicon.refresh, '刷新', () => this.refreshPane(side, { force: true }), 'arrow-clockwise', toolbarAccent);
        this.appendToolbarButton(toolbar, Codicon.search, '搜索', () => this.searchInPane(side), 'search', toolbarAccent);
        this.appendToolbarButton(toolbar, Codicon.trash, '删除选中项', () => this.deleteSelected(side), 'trash', 'danger');
        this.appendToolbarButton(toolbar, Codicon.copy, '复制当前路径', () => { void this.copyPanePath(side); }, 'files', 'secondary');
        this.appendToolbarButton(toolbar, Codicon.fileMedia, '展开图片', () => this.openImageGrid(side), 'grid-3x3-gap', gridAccent);
        this.appendToolbarButton(toolbar, Codicon.terminal, '打开终端', () => this.openTerminal(side), 'terminal', toolbarAccent);
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
        list.addEventListener('pointerdown', () => {
            this.lastActiveSide = side;
            list.focus({ preventScroll: true });
        });
        list.addEventListener('click', event => {
            const target = event.target;
            if (!target?.closest('.turbofile-file-row') && this.paneStates[side].selectedPaths.size) {
                this.clearPaneSelection(side);
                this.updateRenderedSelection(side);
            }
        });
        list.addEventListener('keydown', event => {
            if (event.key === 'Delete') {
                event.preventDefault();
                void this.deleteSelected(side);
                return;
            }
            if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                const key = event.key.toLowerCase();
                if (key === 'c' || key === 'x') {
                    event.preventDefault();
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
            const sourceSide = event.dataTransfer?.getData('application/x-turbofile-side');
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
            event.preventDefault();
            this.setExternalDropTargetSide(undefined);
            const sourceSide = event.dataTransfer?.getData('application/x-turbofile-side');
            if (sourceSide && sourceSide !== side) {
                void this.transferSelected(sourceSide, side);
                return;
            }
            const externalPaths = this.extractExternalDropPaths(event);
            if (externalPaths.length) {
                void this.transferExternalPaths(side, externalPaths);
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
    renderDeviceSelect(side, currentDevice) {
        const select = $('.turbofile-device-select');
        const button = $('button.turbofile-device-select-button');
        const menu = $('.turbofile-device-select-menu');
        const devices = this.getAllDevices();
        button.type = 'button';
        button.title = '选择设备';
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', `${this.getSideLabel(side)}设备选择`);
        button.appendChild($('span.turbofile-device-select-icon', undefined, currentDevice ? this.getDeviceOptionIcon(currentDevice) : '🖥️'));
        button.appendChild($('span.turbofile-device-select-label', undefined, currentDevice ? this.getDeviceDisplayLabel(currentDevice) : 'Windows (localhost)'));
        button.appendChild(renderIcon(Codicon.chevronDown));
        menu.setAttribute('role', 'listbox');
        menu.setAttribute('aria-label', `${this.getSideLabel(side)}设备列表`);
        for (const device of devices) {
            const option = $('button.turbofile-device-select-option');
            option.type = 'button';
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', device.id === currentDevice?.id ? 'true' : 'false');
            option.dataset.deviceId = device.id;
            if (device.id === currentDevice?.id) {
                option.classList.add('is-selected');
            }
            option.appendChild($('span.turbofile-device-select-icon', undefined, this.getDeviceOptionIcon(device)));
            option.appendChild($('span.turbofile-device-select-label', undefined, this.getDeviceDisplayLabel(device)));
            option.addEventListener('pointerenter', () => this.prefetchPaneDeviceDefaultDirectory(side, device));
            option.addEventListener('focus', () => this.prefetchPaneDeviceDefaultDirectory(side, device));
            option.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                this.setPaneDevice(side, device);
            });
            menu.appendChild(option);
        }
        const closeMenu = () => {
            select.classList.remove('is-open');
            button.setAttribute('aria-expanded', 'false');
        };
        const toggleMenu = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const nextOpen = !select.classList.contains('is-open');
            for (const opened of Array.from(this.container?.querySelectorAll('.turbofile-device-select.is-open') ?? [])) {
                opened.classList.remove('is-open');
                opened.querySelector('.turbofile-device-select-button')?.setAttribute('aria-expanded', 'false');
            }
            select.classList.toggle('is-open', nextOpen);
            button.setAttribute('aria-expanded', String(nextOpen));
            if (nextOpen) {
                const selected = menu.querySelector('.turbofile-device-select-option.is-selected') ?? menu.querySelector('.turbofile-device-select-option');
                selected?.focus();
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
                closeMenu();
                button.focus();
            }
        });
        const window = getWindow(select);
        const handleWindowClick = (event) => {
            if (!select.contains(event.target)) {
                closeMenu();
            }
        };
        const handleWindowKeydown = (event) => {
            if (event.key === 'Escape' && select.classList.contains('is-open')) {
                event.preventDefault();
                closeMenu();
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
    renderPanePathbar(side, device, state, toolbarAccent) {
        const pathbar = $('.turbofile-pathbar');
        pathbar.classList.add(`turbofile-pathbar-${toolbarAccent}`);
        pathbar.appendChild(renderTurboFileIcon('geo-alt-fill', toolbarAccent));
        if (device?.id === LOCAL_WINDOWS_DEVICE_ID) {
            const locationButton = $('button.turbofile-location-menu-button');
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
        const display = $('span.turbofile-path-display');
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
    renderWindowsLocationIcon(path) {
        const icon = $('span.turbofile-location-icon');
        icon.classList.add(this.getWindowsLocationIconClass(path));
        icon.setAttribute('aria-hidden', 'true');
        return icon;
    }
    renderPathDisplayContent(display, side, device, state) {
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
            const root = $('button.turbofile-path-segment');
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
            const button = $('button.turbofile-path-segment');
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
    getPathSegments(path, windowsPath) {
        if (!path) {
            return [];
        }
        if (!windowsPath) {
            const parts = path.split('/').filter(Boolean);
            const segments = [{ label: '根目录', path: '/' }];
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
        const segments = [{ label: match[1], path: `${match[1]}\\` }];
        const rest = match[2] ?? '';
        let current = `${match[1]}\\`;
        for (const part of rest.split('\\').filter(Boolean)) {
            current = current.endsWith('\\') ? `${current}${part}` : `${current}\\${part}`;
            segments.push({ label: part, path: current });
        }
        return segments;
    }
    maybeStartPathInlineEdit(event, side, display) {
        const target = event.target;
        if (target?.closest('.turbofile-path-segment, .turbofile-path-separator')) {
            return;
        }
        this.startPathInlineEdit(side, display);
    }
    startPathInlineEdit(side, display) {
        const device = this.getPaneDevice(side);
        const windowsPath = !!device && this.isWindowsDevice(device);
        const currentPath = this.formatPanePathForDisplay(this.paneStates[side].path, windowsPath);
        clearNode(display);
        display.classList.add('is-editing');
        const input = $('input.turbofile-path-inline-editor');
        input.type = 'text';
        input.value = currentPath;
        input.spellcheck = false;
        display.appendChild(input);
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void this.commitPathInlineEdit(side, input.value);
            }
            else if (event.key === 'Escape') {
                event.preventDefault();
                this.render();
            }
        });
        input.addEventListener('blur', () => {
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
        await this.navigatePaneDirectory(side, path);
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
        state.error = undefined;
        state.loading = false;
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
        }
        catch (error) {
            if (this.paneRequestSeq[side] === requestId) {
                const message = error instanceof Error ? error.message : String(error);
                state.error = message;
                this.statusMessage = `${device.name} 目录刷新失败：${message}`;
            }
        }
        finally {
            if (this.paneRequestSeq[side] === requestId) {
                state.loading = false;
                this.render();
            }
        }
    }
    renderFileList(side, list) {
        const state = this.paneStates[side];
        state.viewportHeight = list.clientHeight || state.viewportHeight || FILE_LIST_DEFAULT_VIEWPORT_HEIGHT;
        if (state.error) {
            this.fileListRenderedRange[side] = undefined;
            list.appendChild(this.renderFileRow(side, { name: state.error, size: '', rawSize: 0, modified: '', rawModified: 0, type: 'unknown' }, false));
            return;
        }
        const range = this.getFileListRange(state);
        this.renderFileListSlice(side, list, range);
        list.scrollTop = state.scrollTop;
    }
    renderFileListSlice(side, list, range) {
        const state = this.paneStates[side];
        clearNode(list);
        if (range.topSpacerHeight > 0) {
            const topSpacer = $('.turbofile-file-list-spacer');
            topSpacer.style.height = `${range.topSpacerHeight}px`;
            list.appendChild(topSpacer);
        }
        for (const item of this.getVisibleFileItems(state).slice(range.startIndex, range.endIndex)) {
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
        this.fileListRenderedRange[side] = undefined;
        this.clearFileListScrollRaf(side);
    }
    clearFileListScrollRaf(side) {
        if (!this.fileListScrollRaf[side] || !this.container) {
            this.fileListScrollRaf[side] = 0;
            return;
        }
        getWindow(this.container).cancelAnimationFrame(this.fileListScrollRaf[side]);
        this.fileListScrollRaf[side] = 0;
    }
    renderFileRow(side, item, selected) {
        const row = $('.turbofile-file-row');
        if (item.path) {
            row.dataset.turbofilePath = item.path;
        }
        if (selected) {
            row.classList.add('is-selected');
        }
        row.classList.add('is-clickable');
        if (item.path && !item.parent) {
            row.draggable = true;
            row.addEventListener('dragstart', event => {
                this.ensureItemInSelection(side, item);
                event.dataTransfer?.setData('application/x-turbofile-side', side);
                event.dataTransfer?.setData('text/plain', item.path ?? '');
            });
        }
        row.addEventListener('click', event => {
            if (event.detail > 1) {
                return;
            }
            this.container?.querySelector(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`)?.focus({ preventScroll: true });
            this.selectItem(side, item, event, false);
            this.updateRenderedSelection(side);
        });
        if ((item.directory || item.parent) && item.path) {
            row.addEventListener('pointerenter', () => this.prefetchPaneDirectory(side, item.path));
            row.addEventListener('pointerdown', () => this.prefetchPaneDirectory(side, item.path));
        }
        row.addEventListener('dblclick', () => {
            if (item.directory || item.parent) {
                void this.openItem(side, item);
            }
            else {
                void this.previewSelected(side, item);
            }
        });
        row.addEventListener('contextmenu', event => {
            this.showFileContextMenu(side, item, event);
        });
        const name = $('.turbofile-file-name');
        name.appendChild(this.renderFileBrowserIcon(item));
        name.append(item.name);
        const size = $('.turbofile-file-meta');
        size.textContent = item.size;
        const modified = $('.turbofile-file-meta');
        modified.textContent = item.modified;
        row.appendChild(name);
        row.appendChild(size);
        row.appendChild(modified);
        return row;
    }
    renderTaskbar() {
        const taskbar = $('.turbofile-taskbar');
        const runningTransfers = this.tasks.filter(task => task.kind === 'transfer' && task.status === 'running');
        if (runningTransfers.length) {
            taskbar.classList.add('has-live-transfer');
            taskbar.appendChild(this.renderLiveTransferPanel(runningTransfers));
            return taskbar;
        }
        const stats = this.getTaskStats();
        const latest = this.tasks[0];
        const status = $('.turbofile-bottom-status');
        const title = $('.turbofile-task-title');
        title.textContent = `运行 ${stats.running} · 成功 ${stats.success} · 失败 ${stats.error} · 取消 ${stats.canceled}`;
        const meta = $('.turbofile-task-meta');
        meta.textContent = latest ? this.formatTaskLine(latest) : this.statusMessage;
        status.appendChild(title);
        status.appendChild(meta);
        const actions = $('.turbofile-bottom-actions');
        this.appendBottomAction(actions, Codicon.copy, '复制', '复制模式', false, () => this.setTransferMode('copy'), false, `is-mode ${this.currentTransferMode === 'copy' ? 'is-selected' : ''}`, 'files');
        this.appendBottomAction(actions, Codicon.move, '剪切', '剪切模式', false, () => this.setTransferMode('move'), false, `is-mode ${this.currentTransferMode === 'move' ? 'is-selected' : ''}`, 'scissors');
        this.appendBottomAction(actions, Codicon.zap, '开始传输', '按当前复制/剪切模式开始传输', true, () => { void this.startPrimaryTransfer(); }, false, 'is-start', 'lightning-charge-fill', 'warning');
        const spacer = $('.turbofile-bottom-spacer');
        taskbar.appendChild(status);
        taskbar.appendChild(actions);
        taskbar.appendChild(spacer);
        return taskbar;
    }
    renderLiveTransferPanel(tasks) {
        const transferItems = tasks.flatMap(task => this.getLiveTransferItems(task).map(item => ({ task, item })));
        if (transferItems.length <= 1) {
            const task = tasks[0];
            const item = transferItems[0]?.item ?? this.createFallbackTransferItem(task);
            return this.renderSingleLiveTransferPanel(task, item);
        }
        return this.renderMultiLiveTransferPanel(tasks, transferItems);
    }
    renderSingleLiveTransferPanel(task, item) {
        const panel = $('.turbofile-live-transfer-panel');
        panel.classList.add('is-single');
        panel.appendChild(this.renderLiveTransferFileCard(task, item, true));
        return panel;
    }
    renderMultiLiveTransferPanel(tasks, transferItems) {
        const panel = $('.turbofile-live-transfer-panel');
        panel.classList.add('is-multi');
        const aggregate = this.getLiveTransferAggregate(tasks);
        const header = $('.turbofile-live-transfer-header');
        const title = $('.turbofile-live-transfer-title');
        title.textContent = '多文件传输';
        const count = $('.turbofile-live-transfer-count');
        count.textContent = String(transferItems.length);
        title.appendChild(count);
        header.appendChild(title);
        const summary = $('.turbofile-live-transfer-summary');
        summary.appendChild(this.renderLiveTransferMetric('lightning-charge-fill', this.formatSpeed(aggregate.speedBytesPerSecond), '当前速度', 'success'));
        summary.appendChild(this.renderLiveTransferMetric('arrow-clockwise', this.formatRemaining(aggregate.remainingMs), '剩余时间', 'primary'));
        summary.appendChild(this.renderLiveTransferMetric('archive', `${formatSize(aggregate.transferredBytes)} / ${formatSize(aggregate.totalBytes)}`, '已传输', 'info'));
        const cancelAll = document.createElement('button');
        cancelAll.className = 'turbofile-live-transfer-cancel-all';
        cancelAll.type = 'button';
        cancelAll.title = '取消全部传输';
        cancelAll.appendChild(renderIcon(Codicon.close));
        cancelAll.append('全部取消');
        cancelAll.addEventListener('click', () => { void this.cancelRunningTransfers(tasks); });
        summary.appendChild(cancelAll);
        header.appendChild(summary);
        const list = $('.turbofile-live-transfer-list');
        for (const { task, item } of transferItems) {
            list.appendChild(this.renderLiveTransferFileCard(task, item, false));
        }
        const footer = $('.turbofile-live-transfer-footer');
        footer.textContent = `${transferItems.filter(({ item }) => item.status === 'running').length || transferItems.filter(({ item }) => item.status === 'waiting').length} 个任务正在传输中`;
        const total = $('.turbofile-live-transfer-total');
        total.textContent = `总速度：${this.formatSpeed(aggregate.speedBytesPerSecond)}`;
        footer.appendChild(total);
        panel.appendChild(header);
        panel.appendChild(list);
        panel.appendChild(footer);
        return panel;
    }
    renderLiveTransferFileCard(task, item, showCancel) {
        const card = $('.turbofile-live-transfer-card');
        card.classList.add(`is-${item.status}`);
        const top = $('.turbofile-live-transfer-card-top');
        top.appendChild(this.renderLiveTransferFileIcon(item));
        const identity = $('.turbofile-live-transfer-identity');
        const name = $('.turbofile-live-transfer-name');
        name.textContent = item.name;
        const size = $('.turbofile-live-transfer-size');
        size.textContent = item.displaySize || (item.rawSize > 0 || item.type !== 'directory' ? formatSize(item.rawSize) : '');
        identity.appendChild(name);
        identity.appendChild(size);
        top.appendChild(identity);
        const percent = $('.turbofile-live-transfer-percent');
        percent.textContent = `${this.getLiveTransferPercent(item).toFixed(1)}%`;
        top.appendChild(percent);
        if (showCancel) {
            const cancel = document.createElement('button');
            cancel.className = 'turbofile-live-transfer-cancel';
            cancel.type = 'button';
            cancel.title = '取消传输';
            cancel.disabled = !!task.cancelRequested;
            cancel.appendChild(renderIcon(Codicon.close));
            cancel.addEventListener('click', () => { void this.cancelTask(task); });
            top.appendChild(cancel);
        }
        const progress = $('.turbofile-live-transfer-progress');
        const progressValue = $('.turbofile-live-transfer-progress-value');
        progressValue.style.width = `${this.getLiveTransferPercent(item)}%`;
        progress.appendChild(progressValue);
        const metrics = $('.turbofile-live-transfer-metrics');
        metrics.appendChild(this.renderLiveTransferMetric('lightning-charge-fill', this.formatSpeed(item.speedBytesPerSecond), '当前速度', 'success'));
        metrics.appendChild(this.renderLiveTransferMetric('arrow-clockwise', this.formatRemaining(item.remainingMs), '剩余时间', 'primary'));
        metrics.appendChild(this.renderLiveTransferMetric('archive', `${formatSize(item.transferredBytes)} / ${formatSize(this.getLiveTransferItemTotal(item))}`, '已传输', 'info'));
        metrics.appendChild(this.renderLiveTransferMetric('terminal', this.getTransferProtocolLabel(item.strategy ?? task.strategy) ?? '识别中', '传输协议', 'primary'));
        const wave = $('.turbofile-live-transfer-wave');
        wave.appendChild(this.renderLiveTransferSparkline(item.speedSamples));
        const waveLabel = $('.turbofile-live-transfer-wave-label');
        waveLabel.textContent = '速度波动';
        wave.appendChild(waveLabel);
        metrics.appendChild(wave);
        card.appendChild(top);
        card.appendChild(progress);
        card.appendChild(metrics);
        return card;
    }
    renderLiveTransferMetric(icon, value, label, color) {
        const metric = $('.turbofile-live-transfer-metric');
        metric.appendChild(renderTurboFileIcon(icon, color));
        const text = $('.turbofile-live-transfer-metric-text');
        const valueNode = $('.turbofile-live-transfer-metric-value');
        valueNode.textContent = value;
        const labelNode = $('.turbofile-live-transfer-metric-label');
        labelNode.textContent = label;
        text.appendChild(valueNode);
        text.appendChild(labelNode);
        metric.appendChild(text);
        return metric;
    }
    renderLiveTransferFileIcon(item) {
        const icon = $('.turbofile-live-transfer-file-icon');
        const lowerName = item.name.toLowerCase();
        if (lowerName.endsWith('.zip') || lowerName.endsWith('.7z') || lowerName.endsWith('.rar') || lowerName.endsWith('.tar') || lowerName.endsWith('.gz')) {
            icon.classList.add('is-archive');
            icon.appendChild(renderTurboFileIcon('file-earmark-zip'));
            return icon;
        }
        if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.webp') || lowerName.endsWith('.bmp')) {
            icon.classList.add('is-image');
            icon.appendChild(renderTurboFileIcon('file-earmark'));
            return icon;
        }
        icon.classList.add('is-file');
        icon.appendChild(renderTurboFileIcon('file-earmark'));
        return icon;
    }
    renderLiveTransferSparkline(samples) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 120 30');
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('turbofile-live-transfer-sparkline');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const normalized = samples.length >= 2 ? samples.slice(-24) : [1, 1, 1, 1, 1, 1];
        const max = Math.max(...normalized, 1);
        const points = normalized.map((value, index) => {
            const x = normalized.length === 1 ? 0 : (index / (normalized.length - 1)) * 120;
            const y = 26 - Math.max(0, Math.min(24, (value / max) * 22));
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        });
        path.setAttribute('d', points.join(' '));
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
    getLiveTransferAggregate(tasks) {
        let transferredBytes = 0;
        let totalBytes = 0;
        let speedBytesPerSecond = 0;
        for (const task of tasks) {
            const items = this.getLiveTransferItems(task);
            for (const item of items) {
                transferredBytes += item.transferredBytes;
                totalBytes += this.getLiveTransferItemTotal(item);
                speedBytesPerSecond += item.status === 'running' ? item.speedBytesPerSecond : 0;
            }
        }
        const remainingBytes = Math.max(0, totalBytes - transferredBytes);
        return {
            transferredBytes,
            totalBytes,
            speedBytesPerSecond,
            remainingMs: speedBytesPerSecond > 0 ? (remainingBytes / speedBytesPerSecond) * 1000 : undefined
        };
    }
    getLiveTransferItemTotal(item) {
        return Math.max(item.totalBytes, item.rawSize, item.transferredBytes, 0);
    }
    getLiveTransferPercent(item) {
        if (item.status === 'success') {
            return 100;
        }
        const totalBytes = this.getLiveTransferItemTotal(item);
        if (totalBytes > 0) {
            return Math.max(0, Math.min(100, (item.transferredBytes / totalBytes) * 100));
        }
        return Math.max(0, Math.min(100, item.progress));
    }
    formatSpeed(bytesPerSecond) {
        return bytesPerSecond && bytesPerSecond > 0 ? `${formatSize(bytesPerSecond)}/s` : '--';
    }
    formatRemaining(milliseconds) {
        return milliseconds !== undefined && Number.isFinite(milliseconds) && milliseconds >= 0 ? formatDuration(milliseconds) : '--';
    }
    async cancelRunningTransfers(tasks) {
        for (const task of tasks) {
            await this.cancelTask(task);
        }
    }
    renderTaskLogOverlay() {
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
        }
        else {
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
    appendBottomAction(parent, icon, label, title, primary, handler, disabled = false, extraClass = '', turboIcon, iconColor) {
        const button = document.createElement('button');
        button.className = `turbofile-bottom-action${primary ? ' is-primary' : ''}${extraClass ? ` ${extraClass}` : ''}`;
        button.type = 'button';
        button.title = title;
        button.disabled = disabled;
        button.appendChild(turboIcon ? renderTurboFileIcon(turboIcon, iconColor) : renderIcon(icon));
        button.append(label);
        button.addEventListener('click', handler);
        parent.appendChild(button);
    }
    setTransferMode(mode) {
        this.currentTransferMode = mode;
        this.statusMessage = mode === 'copy' ? '已切换为复制模式。' : '已切换为剪切模式，开始传输后会清理源文件。';
        this.render();
    }
    getPrimaryTransferSides() {
        if (this.getSelectedTransferItems('left').length > 0) {
            return { sourceSide: 'left', targetSide: 'right' };
        }
        if (this.getSelectedTransferItems('right').length > 0) {
            return { sourceSide: 'right', targetSide: 'left' };
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
        if (this.currentTransferMode === 'move') {
            await this.moveFromPrimarySide();
            return;
        }
        await this.copyFromPrimarySide();
    }
    clearFinishedTasks() {
        for (let i = this.tasks.length - 1; i >= 0; i--) {
            if (this.tasks[i].status !== 'running') {
                this.tasks.splice(i, 1);
            }
        }
        this.statusMessage = '已清空完成的任务。';
        this.render();
    }
    renderTaskRow(task) {
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
        }
        else if ((task.status === 'error' || task.status === 'canceled') && task.retryTransfer) {
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
    async cancelTask(task) {
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
    async retryTask(task) {
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
    beginTask(kind, label, detail) {
        const task = {
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
        const activeItem = task.activeTransferItemIndex !== undefined ? task.transferItems?.[task.activeTransferItemIndex] : undefined;
        const knownTotalBytes = activeItem ? activeItem.totalBytes : task.totalBytes ?? 0;
        const totalBytes = event.totalBytes > 0 ? event.totalBytes : knownTotalBytes;
        const transferredBytes = Math.min(event.transferredBytes, totalBytes > 0 ? totalBytes : event.transferredBytes);
        const progress = totalBytes > 0
            ? Math.max(0, Math.min(100, Math.round((transferredBytes / totalBytes) * 100)))
            : event.phase === 'complete' ? 100 : Math.max(8, task.progress);
        const detail = this.formatTransferProgressDetail(event.phase, transferredBytes, totalBytes);
        const now = Date.now();
        const speed = this.calculateTransferSpeed(activeItem ?? task, transferredBytes, now);
        const strategy = this.getTransferStrategyFromProgress(event) ?? task.strategy;
        if (activeItem) {
            activeItem.status = event.phase === 'complete' ? 'success' : 'running';
            activeItem.transferredBytes = transferredBytes;
            activeItem.totalBytes = totalBytes;
            activeItem.progress = event.phase === 'complete' ? 100 : progress;
            activeItem.speedBytesPerSecond = speed;
            activeItem.remainingMs = speed > 0 && totalBytes > transferredBytes ? ((totalBytes - transferredBytes) / speed) * 1000 : undefined;
            activeItem.strategy = strategy;
            this.appendTransferSpeedSample(activeItem.speedSamples, speed);
        }
        const aggregate = this.getLiveTransferAggregate([task]);
        task.transferredBytes = activeItem ? aggregate.transferredBytes : transferredBytes;
        task.totalBytes = activeItem ? aggregate.totalBytes : totalBytes;
        task.speedBytesPerSecond = speed;
        task.remainingMs = aggregate.remainingMs;
        task.strategy = strategy;
        task.progress = activeItem && aggregate.totalBytes > 0
            ? Math.max(0, Math.min(100, Math.round((aggregate.transferredBytes / aggregate.totalBytes) * 100)))
            : event.phase === 'complete' ? 100 : progress;
        task.detail = detail;
        this.appendTransferSpeedSample(task.speedSamples ??= [], speed);
        this.statusMessage = detail;
        if (event.phase === 'complete' || transferredBytes >= totalBytes || now - (task.lastProgressRenderAt ?? 0) > 150) {
            task.lastProgressRenderAt = now;
            this.render();
        }
    }
    calculateTransferSpeed(target, transferredBytes, now) {
        const previousAt = target.lastSampleAt;
        const previousBytes = target.lastSampleBytes;
        target.lastSampleAt = now;
        target.lastSampleBytes = transferredBytes;
        if (previousAt === undefined || previousBytes === undefined || now <= previousAt || transferredBytes < previousBytes) {
            return 0;
        }
        const elapsed = now - previousAt;
        return elapsed > 0 ? ((transferredBytes - previousBytes) / elapsed) * 1000 : 0;
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
        const detail = event.detail?.toLowerCase() ?? '';
        if (event.phase === 'rsync-direct') {
            return detail.includes('parallel') ? 'rsync-direct-parallel' : 'rsync-direct';
        }
        if (event.phase === 'relay-download' || event.phase === 'relay-upload') {
            return 'sftp-relay';
        }
        if (detail.includes('direct sftp')) {
            return 'sftp-direct';
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
        if (detail.includes('remote copy')) {
            return 'remote-copy';
        }
        if (detail.includes('local copy')) {
            return 'local-copy';
        }
        return undefined;
    }
    getTransferProtocolLabel(strategy) {
        switch (strategy) {
            case 'rsync-direct':
            case 'rsync-direct-parallel':
                return '直连 rsync';
            case 'sftp-direct':
                return '直连 sftp';
            case 'sftp-upload':
            case 'sftp-download':
                return '直连 sftp';
            case 'sftp-relay':
                return '中转 sftp';
            case 'remote-copy':
                return '同机复制';
            case 'local-copy':
                return '本地复制';
            default:
                return strategy;
        }
    }
    getPlannedTransferStrategy(sourceDevice, targetDevice, sourceItem) {
        if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID && targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
            return 'local-copy';
        }
        if (sourceDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
            return 'sftp-upload';
        }
        if (targetDevice.id === LOCAL_WINDOWS_DEVICE_ID) {
            return 'sftp-download';
        }
        if (sourceDevice.id === targetDevice.id) {
            return 'remote-copy';
        }
        if (!this.isWindowsDevice(sourceDevice) && !this.isWindowsDevice(targetDevice) && sourceDevice.capabilities.rsync && targetDevice.capabilities.rsync) {
            return sourceItem.directory ? 'rsync-direct-parallel' : 'rsync-direct';
        }
        return 'sftp-direct';
    }
    formatTransferProgressDetail(phase, transferredBytes, totalBytes) {
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
        if (totalBytes > 0) {
            return `${phaseLabel}：${formatSize(transferredBytes)} / ${formatSize(totalBytes)}`;
        }
        return phaseLabel;
    }
    finishTask(task, status, detail, options = {}) {
        task.status = status;
        task.detail = detail;
        task.endedAt = Date.now();
        task.progress = status === 'canceled' ? Math.max(task.progress, 0) : 100;
        task.bytes = options.bytes;
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
                }
                else if (status === 'canceled' && (item.status === 'waiting' || item.status === 'running')) {
                    item.status = 'canceled';
                    item.endedAt = task.endedAt;
                }
                else if (status === 'error' && item.status === 'running') {
                    item.status = 'error';
                    item.error = options.error;
                    item.endedAt = task.endedAt;
                }
            }
        }
        this.statusMessage = detail;
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
        const status = task.status === 'running' ? '进行中' : task.status === 'success' ? '完成' : task.status === 'canceled' ? '已取消' : '失败';
        const metrics = this.getTaskMetrics(task);
        return `${status}：${task.label}${metrics ? ` · ${metrics}` : ''}`;
    }
    getTaskMetrics(task) {
        const duration = formatDuration((task.endedAt ?? Date.now()) - task.startedAt);
        const parts = [duration];
        if (task.status === 'running' && task.totalBytes !== undefined && task.transferredBytes !== undefined) {
            if (task.totalBytes > 0) {
                parts.push(`${formatSize(task.transferredBytes)} / ${formatSize(task.totalBytes)}`);
            }
            else if (task.transferredBytes > 0) {
                parts.push(formatSize(task.transferredBytes));
            }
            const runningThroughput = formatThroughput(task.transferredBytes, Date.now() - task.startedAt);
            if (runningThroughput) {
                parts.push(runningThroughput);
            }
        }
        if (task.bytes !== undefined) {
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
        return parts.join(' · ');
    }
    getTaskIcon(task) {
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
    renderPreviewOverlay() {
        const preview = this.previewState;
        const overlay = $('.turbofile-preview-overlay');
        const panel = $('.turbofile-preview-panel');
        if (!preview) {
            return overlay;
        }
        const header = $('.turbofile-preview-header');
        const title = $('.turbofile-preview-title');
        title.appendChild(renderIcon(preview.mode === 'image' ? Codicon.preview : preview.mode === 'text' ? Codicon.symbolFile : Codicon.fileBinary));
        title.append(`${preview.item.name}${preview.dirty ? ' *' : ''}`);
        header.appendChild(title);
        const actions = $('.turbofile-preview-actions');
        if (preview.mode === 'text' && !preview.loading && !preview.error) {
            const save = this.createButton('保存', 'turbofile-primary-button');
            save.element.addEventListener('click', () => this.savePreview());
            actions.appendChild(save.element);
        }
        const close = this.createButton('关闭', 'turbofile-secondary-button');
        close.element.addEventListener('click', () => {
            this.previewState = undefined;
            this.render();
        });
        actions.appendChild(close.element);
        header.appendChild(actions);
        panel.appendChild(header);
        const body = $('.turbofile-preview-body');
        if (preview.loading) {
            body.textContent = '正在加载...';
        }
        else if (preview.error) {
            body.textContent = preview.error;
        }
        else if (preview.mode === 'image') {
            const image = document.createElement('img');
            image.className = 'turbofile-preview-image';
            image.src = `data:${preview.mime};base64,${preview.content}`;
            image.alt = preview.item.name;
            body.appendChild(image);
        }
        else if (preview.mode === 'text') {
            const textarea = document.createElement('textarea');
            textarea.className = 'turbofile-preview-textarea';
            textarea.spellcheck = false;
            textarea.value = preview.content;
            textarea.addEventListener('input', () => {
                preview.content = textarea.value;
                preview.dirty = true;
            });
            body.appendChild(textarea);
        }
        else {
            body.textContent = `该文件类型暂不支持内嵌预览。大小：${preview.item.size || '未知'}`;
        }
        panel.appendChild(body);
        overlay.appendChild(panel);
        return overlay;
    }
    renderLegacyImageGridOverlay() {
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
        }
        else {
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
            const card = $('button.turbofile-image-grid-card');
            card.type = 'button';
            card.title = image.item.name;
            if (index === state.selectedIndex) {
                card.classList.add('is-selected');
            }
            card.addEventListener('click', () => this.selectImageGridItem(index));
            if (image.thumbnailContent) {
                const thumb = document.createElement('img');
                thumb.loading = 'lazy';
                thumb.src = `data:${image.thumbnailMime};base64,${image.thumbnailContent}`;
                thumb.alt = image.item.name;
                card.appendChild(thumb);
            }
            else {
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
    renderImageGridPage() {
        const state = this.imageGridState;
        const page = $('.turbofile-image-page');
        if (!state) {
            return page;
        }
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
        for (const option of []) {
            const button = $('button.turbofile-image-page-columns-button');
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
        for (const option of IMAGE_GRID_VIEW_OPTIONS) {
            actions.appendChild(this.renderImageGridViewButton(state, option));
        }
        const closeIcon = $('button.turbofile-image-page-action.is-close');
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
        const grid = $('.turbofile-image-page-grid');
        grid.style.setProperty('--turbofile-image-grid-columns', String(state.columns));
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
        const button = $('button.turbofile-image-page-action');
        button.type = 'button';
        button.title = option.label;
        button.setAttribute('aria-label', option.label);
        button.setAttribute('aria-pressed', String(state.columns === option.columns));
        if (state.columns === option.columns) {
            button.classList.add('is-active');
        }
        button.appendChild(this.renderImageGridViewIcon(option.kind));
        button.addEventListener('click', () => this.setImageGridColumns(option.columns));
        return button;
    }
    renderImageGridViewIcon(kind) {
        const icon = $('span.turbofile-image-page-view-icon');
        icon.classList.add(`is-${kind}`);
        const cellCount = kind === 'large' ? 4 : kind === 'medium' ? 9 : 3;
        for (let index = 0; index < cellCount; index++) {
            icon.appendChild($('span'));
        }
        return icon;
    }
    renderImageGridSlice(grid, state, range) {
        clearNode(grid);
        grid.style.setProperty('--turbofile-image-grid-columns', String(state.columns));
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
        const card = $('button.turbofile-image-page-card');
        card.type = 'button';
        card.title = image.item.name;
        card.dataset.imageIndex = String(index);
        if (state.selectedIndex === index) {
            card.classList.add('is-selected');
        }
        const preview = $('.turbofile-image-page-card-preview');
        const thumbnailSrc = image.thumbnailUrl || (image.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : '');
        if (thumbnailSrc) {
            const thumb = document.createElement('img');
            thumb.loading = 'eager';
            thumb.decoding = 'async';
            thumb.addEventListener('error', () => this.handleImageGridThumbnailError(state, index));
            thumb.src = thumbnailSrc;
            thumb.alt = image.item.name;
            preview.appendChild(thumb);
        }
        else {
            const placeholder = $('.turbofile-image-page-card-placeholder');
            placeholder.appendChild(renderIcon(Codicon.fileMedia));
            preview.appendChild(placeholder);
        }
        this.appendImageGridCardChrome(preview, image, index);
        card.appendChild(preview);
        const name = $('.turbofile-image-page-card-name');
        name.textContent = image.item.name;
        card.appendChild(name);
        card.addEventListener('click', () => this.selectImageGridItem(index));
        card.addEventListener('dblclick', event => {
            event.preventDefault();
            this.openImageGridPreview(index);
        });
        return card;
    }
    appendImageGridCardChrome(preview, image, index) {
        const info = $('.turbofile-image-page-card-info');
        const indexLabel = $('span.turbofile-image-page-card-index');
        indexLabel.textContent = String(index + 1);
        info.appendChild(indexLabel);
        const name = $('span.turbofile-image-page-card-filename');
        name.textContent = image.item.name;
        info.appendChild(name);
        const dimensions = $('span.turbofile-image-page-card-dimensions');
        const dimensionsLabel = this.getImageGridCardDimensionsLabel(image);
        dimensions.textContent = dimensionsLabel;
        if (!dimensionsLabel) {
            dimensions.classList.add('is-empty');
        }
        info.appendChild(dimensions);
        preview.appendChild(info);
    }
    getImageGridCardDimensionsLabel(image) {
        return image.width && image.height ? `${image.width}×${image.height}` : '';
    }
    renderImagePreviewOverlay() {
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
            }
            else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                this.moveImageGridPreview(-1);
            }
            else if (event.key === 'ArrowRight') {
                event.preventDefault();
                this.moveImageGridPreview(1);
            }
        });
        const dismiss = $('button.turbofile-image-preview-dismiss');
        dismiss.type = 'button';
        dismiss.setAttribute('aria-label', 'Close overlay');
        dismiss.addEventListener('click', () => this.closeImageGridPreview());
        overlay.appendChild(dismiss);
        const stage = $('.turbofile-image-preview-stage');
        this.renderImagePreviewStageContent(stage, state);
        overlay.appendChild(stage);
        const toolbar = $('.turbofile-image-preview-toolbar');
        toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.symbolColor, 'Toggle RGB pixel inspector', () => this.toggleImagePreviewPixelInspector(), state.pixelInspectorVisible));
        toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.graphLine, 'Toggle histogram', () => this.toggleImagePreviewHistogram(), state.histogramVisible));
        toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.download, 'Download image', () => this.downloadImageGridPreview()));
        toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.trash, 'Delete image', () => { void this.deleteImageGridPreview(); }));
        toolbar.appendChild(this.renderImagePreviewTopAction(Codicon.close, 'Close', () => this.closeImageGridPreview()));
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
        const previous = $('button.turbofile-image-preview-nav-button');
        previous.type = 'button';
        previous.appendChild(renderIcon(Codicon.chevronLeft));
        previous.addEventListener('click', () => this.moveImageGridPreview(-1));
        navigation.appendChild(previous);
        const next = $('button.turbofile-image-preview-nav-button');
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
    renderImagePreviewTopAction(icon, label, handler, active = false) {
        const button = $('button.turbofile-image-preview-action');
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
    renderImagePreviewZoomControls(state) {
        const controls = $('.turbofile-image-preview-zoom-controls');
        controls.setAttribute('role', 'group');
        controls.setAttribute('aria-label', 'Zoom controls');
        const zoomOut = this.renderImagePreviewTopAction(Codicon.zoomOut, 'Zoom out', () => this.zoomImagePreviewByOculanteStep(-IMAGE_PREVIEW_BUTTON_ZOOM_DELTA));
        zoomOut.classList.add('is-transient');
        zoomOut.disabled = state.previewZoom <= IMAGE_PREVIEW_ZOOM_MIN;
        controls.appendChild(zoomOut);
        const value = $('button.turbofile-image-preview-zoom-value');
        value.type = 'button';
        value.disabled = true;
        value.textContent = this.getImagePreviewZoomLabel(state);
        controls.appendChild(value);
        const zoomIn = this.renderImagePreviewTopAction(Codicon.zoomIn, 'Zoom in', () => this.zoomImagePreviewByOculanteStep(IMAGE_PREVIEW_BUTTON_ZOOM_DELTA));
        zoomIn.classList.add('is-transient');
        zoomIn.disabled = state.previewZoom >= IMAGE_PREVIEW_ZOOM_MAX;
        controls.appendChild(zoomIn);
        const reset = this.renderImagePreviewTopAction(Codicon.screenNormal, 'Reset to fit', () => this.resetImagePreviewView());
        reset.classList.add('is-reset');
        reset.disabled = state.previewFitPending;
        controls.appendChild(reset);
        return controls;
    }
    renderImagePreviewInfoStrip(state) {
        const info = $('.turbofile-image-preview-caption.turbofile-image-preview-info-strip');
        this.renderImagePreviewInfoStripContent(info, state);
        return info;
    }
    renderImagePreviewHistogramPanel(state) {
        const panel = $('.turbofile-image-preview-histogram');
        panel.style.left = `${state.histogramX}px`;
        panel.style.top = `${state.histogramY}px`;
        const header = $('.turbofile-image-preview-histogram-header');
        header.append('Histogram');
        const close = $('button.turbofile-image-preview-histogram-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close histogram');
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
    renderImagePreviewInfoStripContent(info, state) {
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
    renderImagePreviewSideButton(state, delta) {
        const button = $('button.turbofile-image-preview-side');
        button.type = 'button';
        button.classList.add(delta < 0 ? 'is-left' : 'is-right');
        const targetIndex = state.selectedIndex + delta;
        const image = state.images[targetIndex];
        button.disabled = !image;
        if (image) {
            const src = image.thumbnailUrl || (image.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : '') || image.previewUrl || (image.previewContent ? `data:${image.previewMime};base64,${image.previewContent}` : '');
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
    renderImagePreviewStageContent(stage, state) {
        clearNode(stage);
        const selected = state.images[state.selectedIndex];
        const previewSrc = this.getImagePreviewSource(selected);
        if (selected && previewSrc) {
            const figure = $('.turbofile-image-preview-figure');
            figure.setAttribute('role', 'img');
            figure.setAttribute('aria-label', selected.item.name);
            if (state.pixelInspectorVisible) {
                figure.classList.add('is-pixel-inspector');
            }
            this.appendImagePreviewCanvas(figure, selected, previewSrc, state);
            figure.addEventListener('pointerdown', event => this.handleImagePreviewPointerDown(event));
            if (state.pixelInspectorVisible) {
                this.attachImagePreviewPixelInspector(stage, figure, selected, previewSrc);
            }
            stage.appendChild(figure);
            return;
        }
        const placeholder = $('.turbofile-image-preview-placeholder');
        placeholder.appendChild(renderIcon(Codicon.fileMedia));
        placeholder.append(selected?.previewError ?? (selected?.previewLoading ? 'Loading image...' : 'Preparing image...'));
        stage.appendChild(placeholder);
    }
    getImagePreviewSource(image) {
        return image?.previewUrl
            || (image?.previewContent ? `data:${image.previewMime};base64,${image.previewContent}` : '')
            || image?.thumbnailUrl
            || (image?.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : '');
    }
    appendImagePreviewCanvas(figure, image, src, state) {
        const ownerDocument = figure.ownerDocument;
        const canvas = ownerDocument.createElement('canvas');
        canvas.className = 'turbofile-image-preview-canvas';
        canvas.setAttribute('aria-label', image.item.name);
        figure.appendChild(canvas);
        this.prepareImagePreviewRender(image, src, canvas, state);
    }
    prepareImagePreviewRender(image, src, canvas, state) {
        const context = canvas.getContext('2d');
        if (!context) {
            return undefined;
        }
        const key = `${image.item.path ?? image.item.name}|${src}`;
        const current = this.imagePreviewRender;
        if (current?.key === key) {
            current.canvas = canvas;
            current.context = context;
            this.observeImagePreviewCanvas(canvas);
            this.queueImagePreviewCanvasRender();
            return current;
        }
        state.previewFitPending = true;
        const render = {
            key,
            canvas,
            context,
            width: Math.max(1, image.width ?? 1),
            height: Math.max(1, image.height ?? 1),
            ready: false,
            requestSeq: ++this.imagePreviewRenderSeq
        };
        this.imagePreviewRender = render;
        this.observeImagePreviewCanvas(canvas);
        this.queueImagePreviewCanvasRender();
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
    observeImagePreviewCanvas(canvas) {
        this.imagePreviewResizeObserver?.disconnect();
        if (typeof ResizeObserver === 'undefined') {
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
        render.context.imageSmoothingEnabled = state.previewZoom < 1;
        render.context.imageSmoothingQuality = state.previewZoom < 1 ? 'high' : 'low';
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
        state.previewPanX = Math.min(width, Math.max(-scaledWidth, state.previewPanX));
        state.previewPanY = Math.min(height, Math.max(-scaledHeight, state.previewPanY));
    }
    handleImagePreviewWheel(event) {
        event.preventDefault();
        event.stopPropagation();
        const state = this.imageGridState;
        const render = this.imagePreviewRender;
        if (!state?.previewVisible || !render?.ready) {
            return;
        }
        const rect = render.canvas.getBoundingClientRect();
        const anchor = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        const wheelDelta = Math.max(-IMAGE_PREVIEW_WHEEL_DELTA_LIMIT, Math.min(IMAGE_PREVIEW_WHEEL_DELTA_LIMIT, -event.deltaY / IMAGE_PREVIEW_WHEEL_DIVISOR));
        const scaleDelta = wheelDelta * state.previewZoom * IMAGE_PREVIEW_ZOOM_RATIO;
        this.setImageGridPreviewZoom(state.previewZoom + scaleDelta, anchor);
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
    attachImagePreviewPixelInspector(stage, figure, image, src) {
        const tooltip = $('.turbofile-image-preview-pixel-tooltip');
        tooltip.textContent = 'Loading RGB...';
        stage.appendChild(tooltip);
        this.prepareImagePreviewAnalysis(image, src);
        figure.addEventListener('mousemove', event => this.updateImagePreviewPixelTooltip(event, stage, tooltip, image, src));
        figure.addEventListener('mouseleave', () => {
            tooltip.classList.remove('is-visible');
        });
    }
    updateImagePreviewPixelTooltip(event, stage, tooltip, image, src) {
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
        tooltip.textContent = `X: ${x}, Y: ${y}\nRGB (${r}, ${g}, ${b})\nHTML (#${this.toHexColor(r, g, b)})`;
    }
    toHexColor(r, g, b) {
        return [r, g, b].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    prepareImagePreviewAnalysis(image, src) {
        const ownerDocument = this.container?.ownerDocument ?? document;
        const key = `${image.item.path ?? image.item.name}|${src}`;
        if (this.imagePreviewAnalysis?.key === key) {
            return this.imagePreviewAnalysis;
        }
        const canvas = ownerDocument.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            return undefined;
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
            }
            catch {
                analysis.ready = false;
            }
            this.updateImagePreviewHistogramCanvas();
        };
        loader.src = src;
        return analysis;
    }
    drawImagePreviewHistogram(canvas, analysis) {
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
    drawImagePreviewHistogramChannel(context, bins, max, width, height, color) {
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
    updateImagePreviewHistogramCanvas() {
        const canvas = this.container?.querySelector('.turbofile-image-preview-histogram-canvas');
        if (canvas) {
            this.drawImagePreviewHistogram(canvas, this.imagePreviewAnalysis);
        }
    }
    attachImagePreviewHistogramDrag(panel, state) {
        panel.addEventListener('pointerdown', event => {
            if (event.target.closest('button')) {
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
    updateImagePreviewOverlay() {
        const state = this.imageGridState;
        if (!state?.previewVisible || !this.container) {
            return;
        }
        const stage = this.container.querySelector('.turbofile-image-preview-stage');
        if (stage) {
            this.renderImagePreviewStageContent(stage, state);
        }
        const caption = this.container.querySelector('.turbofile-image-preview-caption');
        if (caption) {
            this.renderImagePreviewInfoStripContent(caption, state);
        }
        const zoomValue = this.container.querySelector('.turbofile-image-preview-zoom-value');
        if (zoomValue) {
            zoomValue.textContent = this.getImagePreviewZoomLabel(state);
        }
    }
    renderSyncPreviewOverlay() {
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
    renderSyncSummaryMetric(label, value) {
        const metric = $('.turbofile-sync-summary-metric');
        const labelElement = $('span');
        labelElement.textContent = label;
        const valueElement = $('strong');
        valueElement.textContent = value;
        metric.appendChild(labelElement);
        metric.appendChild(valueElement);
        return metric;
    }
    renderSyncPreviewRow(state, step, index) {
        const originalStep = state.plan[index];
        const row = $('.turbofile-sync-row');
        const checked = state.selectedIndexes.has(index);
        if (!checked) {
            row.classList.add('is-skipped');
        }
        if (state.reversedIndexes.has(index)) {
            row.classList.add('is-reversed');
        }
        const setChecked = (value) => {
            if (value) {
                state.selectedIndexes.add(index);
            }
            else {
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
            }
            else {
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
            }
            else if (this.matchesSyncDirection(step.reverse, direction)) {
                state.reversedIndexes.add(index);
            }
        }
        this.render();
    }
    matchesSyncDirection(step, direction) {
        return direction === 'left-to-right'
            ? step.sourceSide === 'left' && step.targetSide === 'right'
            : step.sourceSide === 'right' && step.targetSide === 'left';
    }
    getSyncPlanStats(plan) {
        let missing = 0;
        let newer = 0;
        let size = 0;
        let bytes = 0;
        let leftToRight = 0;
        let rightToLeft = 0;
        for (const step of plan) {
            if (step.reason === 'missing') {
                missing++;
            }
            else if (step.reason === 'newer') {
                newer++;
            }
            else {
                size++;
            }
            bytes += step.item.directory ? 0 : step.item.rawSize;
            if (step.sourceSide === 'left' && step.targetSide === 'right') {
                leftToRight++;
            }
            else if (step.sourceSide === 'right' && step.targetSide === 'left') {
                rightToLeft++;
            }
        }
        return { missing, newer, size, bytes, leftToRight, rightToLeft };
    }
    resolveSyncPreview(plan) {
        const state = this.syncPreviewState;
        this.syncPreviewState = undefined;
        state?.resolve(plan);
        this.render();
    }
    appendToolbarButton(parent, icon, title, handler, turboIcon, iconColor) {
        const button = document.createElement('button');
        button.className = 'turbofile-toolbar-button';
        button.title = title;
        button.appendChild(turboIcon ? renderTurboFileIcon(turboIcon, iconColor) : renderIcon(icon));
        if (handler) {
            button.addEventListener('click', handler);
        }
        parent.appendChild(button);
    }
    createButton(label, className) {
        const element = document.createElement('button');
        element.className = className;
        element.textContent = label;
        return {
            element,
            dispose: () => element.remove()
        };
    }
    createIconButton(icon, title, className) {
        const element = document.createElement('button');
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
        let input;
        if (state.kind === 'prompt') {
            input = $('input.turbofile-dialog-input');
            input.value = state.defaultValue ?? '';
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.resolveDialog(input?.value);
                }
                else if (event.key === 'Escape') {
                    event.preventDefault();
                    this.resolveDialog(undefined);
                }
            });
            panel.appendChild(input);
            getWindow(input).requestAnimationFrame(() => input?.focus());
        }
        const actions = $('.turbofile-dialog-actions');
        if (state.cancelLabel) {
            const cancel = $('button.turbofile-dialog-button.turbofile-dialog-button-secondary');
            cancel.type = 'button';
            cancel.textContent = state.cancelLabel;
            cancel.addEventListener('click', () => this.resolveDialog(undefined));
            actions.appendChild(cancel);
        }
        const confirm = $('button.turbofile-dialog-button.turbofile-dialog-button-primary');
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
    showDialogConfirm(title, message, detail, danger = false) {
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
    showDialogPrompt(title, message, defaultValue = '') {
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
    showDialogInfo(title, message, detail) {
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
    resolveDialog(value) {
        const state = this.dialogState;
        if (!state) {
            return;
        }
        this.dialogState = undefined;
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
    showPaneContextMenu(side, event) {
        event.preventDefault();
        const anchor = new StandardMouseEvent(getWindow(event), event);
        this.contextMenuService.showContextMenu({
            getAnchor: () => anchor,
            getActions: () => this.getPaneContextActions(side),
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
    getPaneContextActions(side) {
        return [
            this.menuAction('turbofile.newFolder', '新建文件夹', Codicon.newFolder, () => this.createFolder(side)),
            this.menuAction('turbofile.newFile', '新建文件', Codicon.newFile, () => this.createFile(side))
        ];
    }
    menuAction(id, label, icon, run, enabled = true, checked) {
        return toAction({
            id,
            label,
            enabled,
            checked,
            class: typeof icon === 'string' ? icon : ThemeIcon.asClassName(icon),
            run
        });
    }
    getOppositeSide(side) {
        return side === 'left' ? 'right' : 'left';
    }
    getSideLabel(side) {
        return side === 'left' ? '左侧' : '右侧';
    }
    async testCurrentSshConnection() {
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
            }
            else {
                this.finishTask(task, 'error', `SSH 连接失败：${result.message}`, { error: result.message });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `SSH 连接失败：${message}`, { error: message });
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
        if (targetPath !== state.path) {
            this.resetPaneScroll(side);
        }
        state.path = targetPath;
        state.loading = true;
        state.error = undefined;
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
            this.rememberPaneDevicePath(side, device, listing.path);
            this.prefetchNeighborDirectories(device, listing.path, listing.items);
            this.clearPaneSelection(side);
            this.statusMessage = `${device.name} 已加载 ${state.items.filter(item => !item.parent).length} 项。`;
            this.rememberPaneDeviceSnapshot(side);
        }
        catch (error) {
            if (this.paneRequestSeq[side] === requestId) {
                const message = error instanceof Error ? error.message : String(error);
                state.error = message;
                this.statusMessage = `${device.name} 目录刷新失败：${message}`;
            }
        }
        finally {
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
        }
        else {
            this.paneDirectoryCache.delete(cacheKey);
        }
        const promise = (async () => {
            const listing = device.id === LOCAL_WINDOWS_DEVICE_ID
                ? await this.sshService.listLocalDirectory(path, force)
                : await this.sshService.listRemoteDirectory(await this.getSshConnectionOptions(device), path, force);
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
        }
        finally {
            this.paneDirectoryInflight.delete(cacheKey);
        }
    }
    async prefetchDefaultDeviceDirectories() {
        const devices = this.getAllDevices();
        for (const device of devices) {
            await this.prefetchPaneDeviceDefaultDirectory('left', device);
        }
    }
    async prefetchPaneDeviceDefaultDirectory(side, device) {
        const path = this.getRememberedPaneDevicePath(side, device) ?? this.getRememberedPaneDevicePath(side === 'left' ? 'right' : 'left', device) ?? this.getDefaultPaneDevicePath(device);
        if (!path || this.getCachedPaneDirectory(device, path)) {
            return;
        }
        const cacheKey = this.getPaneDirectoryCacheKey(device, path);
        if (this.paneDirectoryInflight.has(cacheKey)) {
            return;
        }
        try {
            await this.loadPaneDirectory(device, path, false);
        }
        catch {
            // Background warmup must never slow down the visible UI.
        }
    }
    getCachedPaneDirectory(device, path) {
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
    applyPaneDirectoryEntry(side, device, listing) {
        const state = this.paneStates[side];
        state.path = listing.path;
        state.items = listing.items;
        state.error = undefined;
        state.loading = false;
        this.clearPaneSelection(side);
        this.rememberPaneDevicePath(side, device, listing.path);
        this.rememberPaneDeviceSnapshot(side);
        this.prefetchNeighborDirectories(device, listing.path, listing.items);
        this.statusMessage = `${device.name} 已加载 ${state.items.filter(item => !item.parent).length} 项。`;
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
        void this.loadPaneDirectory(device, path, false).catch(() => undefined);
    }
    prefetchNeighborDirectories(device, currentPath, items) {
        const candidates = [
            getPaneParentPath(currentPath, this.isWindowsDevice(device)),
            ...items.filter(item => item.directory && !item.parent && item.path).slice(0, PANE_DIRECTORY_PREFETCH_LIMIT).map(item => item.path)
        ].filter((path) => !!path);
        for (const path of candidates) {
            const cacheKey = this.getPaneDirectoryCacheKey(device, path);
            const cached = this.paneDirectoryCache.get(cacheKey);
            if ((cached && cached.expiresAt > Date.now()) || this.paneDirectoryInflight.has(cacheKey)) {
                continue;
            }
            void this.loadPaneDirectory(device, path, false).catch(() => undefined);
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
            }
            else {
                this.setSingleSelection(side, item);
            }
        }
        else if (isToggle && !item.parent) {
            if (state.selectedPaths.has(item.path)) {
                state.selectedPaths.delete(item.path);
                if (state.selectedPath === item.path) {
                    state.selectedPath = this.getLastSelectedPath(side);
                }
            }
            else {
                state.selectedPaths.add(item.path);
                state.selectedPath = item.path;
            }
            state.selectionAnchorPath = item.path;
            if (!state.selectedPaths.size) {
                state.selectedPath = undefined;
            }
        }
        else {
            this.setSingleSelection(side, item);
        }
        const selectedItems = this.getSelectedTransferItems(side);
        if (selectedItems.length > 1) {
            this.statusMessage = `${this.getSideLabel(side)}已选择 ${selectedItems.length} 项。可批量复制、剪切或删除。`;
        }
        else if (!item.parent) {
            this.statusMessage = `${this.getSideLabel(side)}已选择：${item.name}`;
        }
        if (shouldRender) {
            this.render();
        }
    }
    updateRenderedSelection(side) {
        const pane = this.container?.querySelector(`.turbofile-pane[data-turbofile-side="${side}"]`);
        if (!pane) {
            return;
        }
        const state = this.paneStates[side];
        for (const row of pane.querySelectorAll('.turbofile-file-row')) {
            const path = row.dataset.turbofilePath;
            row.classList.toggle('is-selected', !!path && state.selectedPaths.has(path));
        }
        const meta = this.container?.querySelector('.turbofile-task-meta');
        if (meta && !this.tasks[0]) {
            meta.textContent = this.statusMessage;
        }
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
        const knownSize = Math.max(0, item.rawSize);
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
    async ensureTransferItemSize(device, sourceItem, transferItem, task) {
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
    setExternalDropTargetSide(side) {
        if (this.externalDropTargetSide === side) {
            return;
        }
        this.externalDropTargetSide = side;
        for (const candidate of ['left', 'right']) {
            this.getPaneFileListElement(candidate)?.classList.toggle('is-external-drop-target', side === candidate);
        }
    }
    getPaneFileListElement(side) {
        return this.container?.querySelector(`.turbofile-pane[data-turbofile-side="${side}"] .turbofile-file-list`) ?? undefined;
    }
    hasExternalDropData(event) {
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
    extractExternalDropPaths(event) {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) {
            return [];
        }
        const paths = [];
        const seen = new Set();
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
            }
            catch {
                // Ignore malformed drop data and continue with the next source.
            }
        }
        const rawResources = dataTransfer.getData(DataTransfers.RESOURCES);
        if (rawResources) {
            try {
                const resources = JSON.parse(rawResources);
                for (const resource of resources) {
                    const uri = URI.parse(resource);
                    if (uri.scheme === 'file') {
                        acceptPath(uri.fsPath);
                    }
                }
            }
            catch {
                // Ignore malformed resource payloads and continue with native files.
            }
        }
        for (const file of Array.from(dataTransfer.files)) {
            acceptPath(getPathForFile(file));
        }
        return paths;
    }
    async transferExternalPaths(targetSide, sourcePaths, operation = 'copy') {
        this.taskbarHiddenForTerminal = false;
        const targetDevice = this.getPaneDevice(targetSide);
        if (!targetDevice) {
            this.statusMessage = '当前目标面板未选择设备，无法接收本地 Windows 文件。';
            this.render();
            return false;
        }
        const sourceItems = (await Promise.all(sourcePaths.map(path => this.resolveExternalTransferItem(path)))).filter((item) => !!item);
        if (!sourceItems.length) {
            this.statusMessage = '未识别到可传输的 Windows 文件或文件夹。';
            this.render();
            return false;
        }
        const batch = sourceItems.length > 1;
        const actionLabel = operation === 'move' ? '剪切粘贴' : '本地复制';
        const label = batch ? `${actionLabel} ${sourceItems.length} 项` : `${actionLabel} ${sourceItems[0].name}`;
        const task = this.beginTask('transfer', label, `Windows -> ${targetDevice.name}`);
        task.progress = 0;
        task.cancelRequested = false;
        task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
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
        let completed = 0;
        let failed = 0;
        let totalBytes = 0;
        const strategies = new Set();
        const failures = [];
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
            await this.ensureTransferItemSize(this.localWindowsDevice, sourceItem, transferItem, task);
            this.updateTask(task, batch ? `正在传输 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在传输：${sourceItem.name}`, progress);
            const result = await this.transferItem(targetSide, targetSide, sourceItem, {
                refreshTarget: false,
                task,
                sourceDeviceOverride: this.localWindowsDevice,
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
            }
            else if (result.canceled) {
                transferItem.status = 'canceled';
                transferItem.endedAt = Date.now();
                for (const pending of task.transferItems.slice(index + 1)) {
                    pending.status = 'canceled';
                    pending.endedAt = Date.now();
                }
                this.finishTask(task, 'canceled', batch ? `已取消外部拖入传输：${sourceItem.name}` : `已取消传输：${sourceItem.name}`, { bytes: totalBytes });
                return false;
            }
            else {
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
            await this.refreshLocalPanesForWindowsPaths(sourceItems.map(item => item.path).filter(Boolean));
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
    async pasteWindowsClipboardFiles(targetSide) {
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
        }
        finally {
            this.windowsClipboardPasteInFlight.delete(pasteKey);
        }
    }
    getWindowsClipboardPasteKey(targetSide, paths, operation) {
        const targetPath = this.paneStates[targetSide].path.toLowerCase();
        const sourcePaths = paths
            .map(path => path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase())
            .sort()
            .join('\n');
        return `${targetSide}:${targetPath}:${operation}:${sourcePaths}`;
    }
    copySelectedToInternalClipboard(sourceSide, operation) {
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
            this.statusMessage = '当前没有可粘贴的内部文件，或目标面板未选择设备。';
            this.render();
            return false;
        }
        const sourceDevice = clipboard.sourceDevice;
        const sourceItems = clipboard.items.map(item => ({ ...item }));
        const batch = sourceItems.length > 1;
        const actionLabel = clipboard.operation === 'move' ? '剪切粘贴' : '复制粘贴';
        const task = this.beginTask('transfer', batch ? `${actionLabel} ${sourceItems.length} 项` : `${actionLabel} ${sourceItems[0].name}`, `${sourceDevice.name} -> ${targetDevice.name}`);
        task.progress = 0;
        task.cancelRequested = false;
        task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
        task.speedSamples = [];
        let completed = 0;
        let failed = 0;
        let totalBytes = 0;
        const strategies = new Set();
        const failures = [];
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
            await this.ensureTransferItemSize(sourceDevice, sourceItem, transferItem, task);
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
            }
            else if (result.canceled) {
                transferItem.status = 'canceled';
                transferItem.endedAt = Date.now();
                for (const pending of task.transferItems.slice(index + 1)) {
                    pending.status = 'canceled';
                    pending.endedAt = Date.now();
                }
                this.finishTask(task, 'canceled', batch ? `已取消内部粘贴：${sourceItem.name}` : `已取消粘贴：${sourceItem.name}`, { bytes: totalBytes });
                return false;
            }
            else {
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
    isSameTransferTarget(sourceDevice, sourcePath, targetDevice, targetPath) {
        if (!sourcePath || sourceDevice.id !== targetDevice.id) {
            return false;
        }
        if (this.isWindowsDevice(sourceDevice)) {
            return isSameWindowsPath(sourcePath, targetPath);
        }
        return trimTrailingSlash(sourcePath) === trimTrailingSlash(targetPath);
    }
    async deleteInternalClipboardSources(task, sourceDevice, sourceSide, sourceItems) {
        const failures = [];
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
    async deleteExternalSourceItems(task, sourceItems) {
        const failures = [];
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
    async refreshLocalPanesForWindowsPaths(paths) {
        const parentPaths = paths
            .map(path => getPaneParentPath(path, true))
            .filter((path) => !!path);
        if (!parentPaths.length) {
            return;
        }
        const refreshes = [];
        for (const side of ['left', 'right']) {
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
    async resolveExternalTransferItem(path) {
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
            }
            catch {
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
    async transferSelected(sourceSide, targetSide) {
        this.taskbarHiddenForTerminal = false;
        const sourceDevice = this.getPaneDevice(sourceSide);
        const targetDevice = this.getPaneDevice(targetSide);
        const sourceItems = this.getSelectedTransferItems(sourceSide);
        if (!sourceDevice || !targetDevice || !sourceItems.length) {
            this.statusMessage = '请先在来源面板选择一个或多个文件/目录。';
            this.render();
            return false;
        }
        const batch = sourceItems.length > 1;
        const label = batch ? `复制 ${sourceItems.length} 项` : `复制 ${sourceItems[0].name}`;
        const task = this.beginTask('transfer', label, `${sourceDevice.name} -> ${targetDevice.name}`);
        task.progress = 0;
        task.cancelRequested = false;
        task.transferItems = sourceItems.map(item => this.createTransferTaskItem(item));
        task.speedSamples = [];
        if (!batch) {
            task.retryTransfer = { sourceSide, targetSide, sourceItem: { ...sourceItems[0] } };
        }
        let completed = 0;
        let failed = 0;
        let totalBytes = 0;
        const strategies = new Set();
        const failures = [];
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
            await this.ensureTransferItemSize(sourceDevice, sourceItem, transferItem, task);
            this.updateTask(task, batch ? `正在传输 ${index + 1}/${sourceItems.length}：${sourceItem.name}` : `正在传输：${sourceItem.name}`, progress);
            const result = await this.transferItem(sourceSide, targetSide, sourceItem, { refreshTarget: false, task });
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
            }
            else if (result.canceled) {
                transferItem.status = 'canceled';
                transferItem.endedAt = Date.now();
                for (const pending of task.transferItems.slice(index + 1)) {
                    pending.status = 'canceled';
                    pending.endedAt = Date.now();
                }
                this.finishTask(task, 'canceled', batch ? `已取消批量传输：${sourceItem.name}` : `已取消传输：${sourceItem.name}`, { bytes: totalBytes });
                return false;
            }
            else {
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
    async transferItem(sourceSide, targetSide, sourceItem, options) {
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
            ? this.sshService.onDynamicTransferProgress(progressId)(event => this.updateTransferProgress(options.task, event))
            : undefined;
        try {
            const sourceEndpoint = await this.toTransferEndpoint(sourceDevice, sourceItem.path);
            const targetEndpoint = await this.toTransferEndpoint(targetDevice, targetPath);
            const plannedStrategy = this.getPlannedTransferStrategy(sourceDevice, targetDevice, sourceItem);
            const activeItem = options.task?.activeTransferItemIndex !== undefined ? options.task.transferItems?.[options.task.activeTransferItemIndex] : undefined;
            const expectedBytes = Math.max(activeItem?.totalBytes ?? 0, activeItem?.rawSize ?? 0, sourceItem.rawSize, 0);
            if (activeItem) {
                activeItem.strategy = plannedStrategy;
            }
            if (options.task) {
                options.task.strategy = plannedStrategy;
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
                expectedBytes
            });
            if (result.ok) {
                if (options.refreshTarget) {
                    if (options.task) {
                        this.updateTask(options.task, `正在刷新目标目录：${targetDevice.name}`, 90);
                    }
                    await this.refreshPane(targetSide, { force: true });
                }
                return { ok: true, message: result.message, bytes: result.bytes, strategy: result.strategy };
            }
            return { ok: false, message: result.message, bytes: result.bytes, strategy: result.strategy, canceled: result.canceled };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { ok: false, message, bytes: 0 };
        }
        finally {
            progressDisposable?.dispose();
        }
    }
    async moveSelected(sourceSide, targetSide) {
        const items = this.getSelectedTransferItems(sourceSide);
        const device = this.getPaneDevice(sourceSide);
        if (!items.length || !device) {
            this.statusMessage = '请先选择要剪切的文件或目录。';
            this.render();
            return;
        }
        const transferred = await this.transferSelected(sourceSide, targetSide);
        if (!transferred) {
            return;
        }
        const batch = items.length > 1;
        const task = this.beginTask('delete', batch ? `剪切清理 ${items.length} 项` : `剪切清理 ${items[0].name}`, `正在删除来源：${device.name}`);
        this.removePaneItems(sourceSide, items);
        try {
            let deleted = 0;
            const failures = [];
            for (const [index, item] of items.entries()) {
                this.updateTask(task, batch ? `正在删除来源 ${index + 1}/${items.length}：${item.name}` : `正在删除来源：${item.name}`, Math.min(88, 20 + Math.round((index / items.length) * 60)));
                const result = await this.sshService.deletePath(await this.toTransferEndpoint(device, item.path), true);
                if (result.ok) {
                    deleted++;
                }
                else {
                    failures.push(`${item.name}: ${result.message}`);
                }
            }
            this.updateTask(task, `正在刷新来源目录：${device.name}`, 90);
            await this.refreshPane(sourceSide, { force: true });
            if (failures.length) {
                this.finishTask(task, 'error', `目标已复制，但删除来源失败 ${failures.length} 项。`, { error: failures[0] });
                return;
            }
            this.finishTask(task, 'success', batch ? `剪切完成：${deleted} 项` : `剪切完成：${items[0].name}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `目标已复制，但删除来源失败：${message}`, { error: message });
        }
    }
    async createFolder(side) {
        const state = this.paneStates[side];
        const device = this.getPaneDevice(side);
        if (!device) {
            return;
        }
        const name = await this.showDialogPrompt('新建文件夹', '请输入新文件夹名称');
        if (!name?.trim()) {
            return;
        }
        const targetPath = joinPanePath(state.path, name.trim(), this.isWindowsDevice(device));
        const task = this.beginTask('mkdir', `新建文件夹 ${name.trim()}`, device.name);
        try {
            const result = await this.sshService.createDirectory(await this.toTransferEndpoint(device, targetPath));
            if (result.ok) {
                this.updateTask(task, `正在刷新目录：${device.name}`, 90);
                this.finishTask(task, 'success', `已创建文件夹：${name.trim()}`);
            }
            else {
                this.finishTask(task, 'error', `新建文件夹失败：${result.message}`, { error: result.message });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `新建文件夹失败：${message}`, { error: message });
        }
        finally {
            await this.refreshPane(side, { force: true });
        }
    }
    async createFile(side) {
        const state = this.paneStates[side];
        const device = this.getPaneDevice(side);
        if (!device) {
            return;
        }
        const name = await this.showDialogPrompt('新建文件', '请输入新文件名称');
        if (!name?.trim()) {
            return;
        }
        const targetPath = joinPanePath(state.path, name.trim(), this.isWindowsDevice(device));
        const task = this.beginTask('create-file', `新建文件 ${name.trim()}`, device.name);
        try {
            const result = await this.sshService.writeFile(await this.toTransferEndpoint(device, targetPath), '', 'utf8');
            if (result.ok) {
                this.updateTask(task, `正在刷新目录：${device.name}`, 90);
                this.finishTask(task, 'success', `已创建文件：${name.trim()}`);
            }
            else {
                this.finishTask(task, 'error', `新建文件失败：${result.message}`, { error: result.message });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `新建文件失败：${message}`, { error: message });
        }
        finally {
            await this.refreshPane(side, { force: true });
        }
    }
    async deleteSelected(side) {
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
            let deleted = 0;
            const failures = [];
            for (const [index, item] of items.entries()) {
                this.updateTask(task, batch ? `正在删除 ${index + 1}/${items.length}：${item.name}` : `正在删除：${item.name}`, Math.min(88, 15 + Math.round((index / items.length) * 70)));
                const result = await this.sshService.deletePath(await this.toTransferEndpoint(device, item.path), true);
                if (result.ok) {
                    deleted++;
                }
                else {
                    failures.push(`${item.name}: ${result.message}`);
                }
            }
            this.updateTask(task, `正在刷新目录：${device.name}`, 90);
            await this.refreshPane(side, { force: true });
            if (failures.length) {
                this.finishTask(task, 'error', `删除完成 ${deleted} 项，失败 ${failures.length} 项。`, { error: failures[0] });
                return;
            }
            this.finishTask(task, 'success', batch ? `已删除：${deleted} 项` : `已删除：${items[0].name}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `删除失败：${message}`, { error: message });
            await this.refreshPane(side, { force: true });
        }
    }
    removePaneItems(side, items) {
        if (this.removePaneItemsFromState(side, items)) {
            this.render();
        }
    }
    removePaneItemsFromState(side, items) {
        const paths = new Set(items.map(item => item.path).filter((path) => !!path));
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
    async renameSelected(side) {
        const item = this.getSelectedItem(side);
        const device = this.getPaneDevice(side);
        if (!item?.path || !device || item.parent) {
            this.statusMessage = '请先选择要重命名的文件或目录。';
            this.render();
            return;
        }
        const nextName = await this.showDialogPrompt('重命名', '请输入新名称', item.name);
        if (!nextName?.trim() || nextName.trim() === item.name) {
            return;
        }
        const targetPath = joinPanePath(this.paneStates[side].path, nextName.trim(), this.isWindowsDevice(device));
        const task = this.beginTask('rename', `重命名 ${item.name}`, `${item.name} -> ${nextName.trim()}`);
        try {
            const result = await this.sshService.renamePath(await this.toTransferEndpoint(device, item.path), targetPath);
            if (result.ok) {
                this.updateTask(task, `正在刷新目录：${device.name}`, 90);
                this.finishTask(task, 'success', `已重命名：${item.name} -> ${nextName.trim()}`);
            }
            else {
                this.finishTask(task, 'error', `重命名失败：${result.message}`, { error: result.message });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `重命名失败：${message}`, { error: message });
        }
        finally {
            await this.refreshPane(side, { force: true });
        }
    }
    async previewSelected(side, explicitItem) {
        const item = explicitItem ?? this.getSelectedItem(side);
        const device = this.getPaneDevice(side);
        if (!item?.path || !device || item.parent || item.directory) {
            this.statusMessage = '请先选择一个文件进行预览。';
            this.render();
            return;
        }
        if (!isImageFile(item.name)) {
            await this.openNativeDocument(side, item, device);
            return;
        }
        this.openImageGrid(side, item.path, true);
        /*

        this.previewState = {
            side,
            item,
            mode: 'image',
            content: '',
            mime: getMimeType(item.name),
            loading: true,
            dirty: false
        };
        this.render();

        const result = await this.sshService.readFile(await this.toTransferEndpoint(device, item.path), {
            encoding: 'base64',
            maxBytes: 25 * 1024 * 1024
        });

        if (this.previewState?.item.path !== item.path) {
            return;
        }

        this.previewState = {
            ...this.previewState,
            content: result.content,
            mime: result.mime,
            loading: false,
            error: result.ok ? undefined : result.message
        };
        this.statusMessage = result.ok ? `已打开预览：${item.name}` : `预览失败：${result.message}`;
        this.render();
        */
    }
    openImageGrid(side, selectedPath, previewVisible = false) {
        const state = this.paneStates[side];
        this.clearImageGridThumbnailQueue();
        this.clearImageGridPreviewPrefetchTimer();
        this.clearImageGridLoadedImageIndexes();
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
        const selectedIndex = selectedPath ? Math.max(0, images.findIndex(image => image.item.path === selectedPath)) : 0;
        this.previewState = undefined;
        this.imagePreviewAnalysis = undefined;
        this.clearImagePreviewRender();
        this.imageGridState = {
            side,
            path: state.path,
            images,
            selectedIndex,
            columns: 8,
            previewVisible,
            previewZoom: 1,
            previewPanX: 0,
            previewPanY: 0,
            previewFitPending: true,
            pixelInspectorVisible: false,
            histogramVisible: false,
            histogramX: 104,
            histogramY: 72,
            scrollTop: 0,
            viewportHeight: this.getImageGridDefaultViewportHeight()
        };
        this.activePage = 'images';
        this.statusMessage = `已展开 ${this.getSideLabel(side)} 图片：${images.length} 张。`;
        this.render();
        if (previewVisible && this.imageGridState) {
            this.imageGridPreviewRequestSeq++;
            this.scheduleImageGridPreviewLoaded(this.imageGridState, selectedIndex, this.imageGridPreviewRequestSeq);
            this.scheduleImageGridPreviewNeighborsLoaded(this.imageGridState, selectedIndex);
        }
    }
    closeImageGridPage() {
        this.disposeImageGridObserver();
        this.clearImageGridScrollTimer();
        this.clearImageGridScrollRaf();
        this.clearImageGridThumbnailQueue();
        this.clearImageGridPreviewPrefetchTimer();
        this.clearImageGridLoadedImageIndexes();
        this.imagePreviewAnalysis = undefined;
        this.clearImagePreviewRender();
        this.imageGridRenderedRange = undefined;
        this.imageGridState = undefined;
        this.activePage = 'transfer';
        this.render();
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
        const nextIndex = (state.selectedIndex + delta + state.images.length) % state.images.length;
        state.selectedIndex = nextIndex;
        state.previewZoom = 1;
        state.previewPanX = 0;
        state.previewPanY = 0;
        state.previewFitPending = true;
        this.imagePreviewAnalysis = undefined;
        this.clearImagePreviewRender();
        this.imageGridPreviewRequestSeq++;
        this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
        this.render();
        this.scheduleImageGridPreviewLoaded(state, nextIndex, this.imageGridPreviewRequestSeq);
        this.scheduleImageGridPreviewNeighborsLoaded(state, nextIndex);
        this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(nextIndex, state.images.length));
    }
    openImageGridPreview(index) {
        const state = this.imageGridState;
        if (!state || index < 0 || index >= state.images.length) {
            return;
        }
        state.selectedIndex = index;
        state.previewVisible = true;
        state.previewZoom = 1;
        state.previewPanX = 0;
        state.previewPanY = 0;
        state.previewFitPending = true;
        this.imagePreviewAnalysis = undefined;
        this.clearImagePreviewRender();
        this.imageGridPreviewRequestSeq++;
        this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
        this.render();
        this.scheduleImageGridPreviewLoaded(state, index, this.imageGridPreviewRequestSeq);
        this.scheduleImageGridPreviewNeighborsLoaded(state, index);
        this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(index, state.images.length));
    }
    closeImageGridPreview() {
        if (!this.imageGridState) {
            return;
        }
        this.imageGridPreviewRequestSeq++;
        this.clearImageGridPreviewPrefetchTimer();
        this.imageGridState.previewVisible = false;
        this.imageGridState.previewZoom = 1;
        this.imageGridState.previewPanX = 0;
        this.imageGridState.previewPanY = 0;
        this.imageGridState.previewFitPending = true;
        this.imagePreviewAnalysis = undefined;
        this.clearImagePreviewRender();
        this.releaseImageGridImagesOutsideRange(this.imageGridState, this.getImageGridVirtualRange(this.imageGridState));
        this.render();
    }
    toggleImagePreviewPixelInspector() {
        const state = this.imageGridState;
        if (!state?.previewVisible) {
            return;
        }
        state.pixelInspectorVisible = !state.pixelInspectorVisible;
        this.render();
    }
    toggleImagePreviewHistogram() {
        const state = this.imageGridState;
        if (!state?.previewVisible) {
            return;
        }
        state.histogramVisible = !state.histogramVisible;
        this.render();
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
        state.previewPanX -= ((zoomAnchor.x - state.previewPanX) * delta) / oldScale;
        state.previewPanY -= ((zoomAnchor.y - state.previewPanY) * delta) / oldScale;
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
        const controls = this.container?.querySelector('.turbofile-image-preview-zoom-controls');
        const zoomValue = controls?.querySelector('.turbofile-image-preview-zoom-value');
        if (zoomValue) {
            zoomValue.textContent = this.getImagePreviewZoomLabel(state);
        }
        const transientButtons = controls?.querySelectorAll('.turbofile-image-preview-action.is-transient');
        if (transientButtons?.[0]) {
            transientButtons[0].disabled = state.previewZoom <= IMAGE_PREVIEW_ZOOM_MIN;
        }
        if (transientButtons?.[1]) {
            transientButtons[1].disabled = state.previewZoom >= IMAGE_PREVIEW_ZOOM_MAX;
        }
        const resetButton = controls?.querySelector('.turbofile-image-preview-action.is-reset');
        if (resetButton) {
            resetButton.disabled = state.previewFitPending;
        }
    }
    getImagePreviewZoomLabel(state) {
        return `${Math.round(state.previewZoom * 100)}%`;
    }
    clearImagePreviewRender() {
        this.imagePreviewResizeObserver?.disconnect();
        this.imagePreviewResizeObserver = undefined;
        this.imagePreviewRender = undefined;
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
        const anchor = ownerDocument.createElement('a');
        anchor.href = src;
        anchor.download = image.item.name;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        ownerDocument.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }
    async deleteImageGridPreview() {
        const state = this.imageGridState;
        const image = state?.images[state.selectedIndex];
        const device = state ? this.getPaneDevice(state.side) : undefined;
        if (!state || !image?.item.path || !device) {
            return;
        }
        if (!await this.showDialogConfirm('Delete image', `Delete ${image.item.name}?`, undefined, true)) {
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
            this.scheduleImageGridPreviewLoaded(state, state.selectedIndex, this.imageGridPreviewRequestSeq);
            this.scheduleImageGridPreviewNeighborsLoaded(state, state.selectedIndex);
            this.scheduleImageGridThumbnailsLoaded(this.getImageGridLoadIndexes(state.selectedIndex, state.images.length));
        }
        try {
            const result = await this.sshService.deletePath(await this.toTransferEndpoint(device, image.item.path), true);
            if (result.ok) {
                this.finishTask(task, 'success', `Deleted: ${image.item.name}`);
            }
            else {
                this.finishTask(task, 'error', `Delete failed: ${result.message}`, { error: result.message });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `Delete failed: ${message}`, { error: message });
        }
        finally {
            await this.refreshPane(state.side, { force: true });
        }
    }
    setImageGridColumns(columns) {
        if (!this.imageGridState || this.imageGridState.columns === columns) {
            return;
        }
        this.imageGridState.columns = columns;
        this.imageGridRenderedRange = undefined;
        this.clearImageGridThumbnailQueue();
        this.render();
    }
    getImagePreviewCaption(state) {
        const image = state.images[state.selectedIndex];
        if (!image) {
            return '';
        }
        const sizeText = image.width && image.height ? `原图 ${image.width}x${image.height}` : image.previewLoading ? '正在加载原图' : '原图';
        return `${image.item.name} (${state.selectedIndex + 1}/${state.images.length}) | ${sizeText}`;
    }
    getImageGridLoadIndexes(selectedIndex, total) {
        const indexes = new Set();
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
                if (this.imageGridState === state && this.activePage === 'images') {
                    this.queueImageGridThumbnailLoads(state, indexes, true);
                }
            }, 0);
        });
    }
    scheduleImageGridPreviewLoaded(state, index, requestSeq) {
        if (!this.container) {
            return;
        }
        const ownerWindow = getWindow(this.container);
        ownerWindow.requestAnimationFrame(() => {
            ownerWindow.setTimeout(() => {
                if (this.imageGridState === state && this.activePage === 'images') {
                    void this.ensureImageGridPreviewLoaded(state, index, requestSeq);
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
    async ensureImageGridThumbnailsLoaded(indexes) {
        const state = this.imageGridState;
        if (!state) {
            return;
        }
        this.queueImageGridThumbnailLoads(state, indexes, true);
    }
    queueImageGridThumbnailLoads(state, indexes, priority) {
        if (this.imageGridState !== state || this.activePage !== 'images') {
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
        }
        else {
            this.imageGridThumbnailQueue.push(...requests);
        }
        this.trimImageGridThumbnailQueue(state);
        this.processImageGridThumbnailQueue();
    }
    processImageGridThumbnailQueue() {
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
    async runImageGridThumbnailRequest(request) {
        try {
            await this.loadImageGridThumbnail(request.state, request.index);
        }
        finally {
            this.imageGridThumbnailLoadingCount = Math.max(0, this.imageGridThumbnailLoadingCount - 1);
            this.processImageGridThumbnailQueue();
        }
    }
    shouldLoadImageGridThumbnail(state, index) {
        if (this.imageGridState !== state || this.activePage !== 'images' || !this.isImageGridIndexNearViewport(state, index)) {
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
                message: 'Image loaded from cache.',
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
            format: options.format || '',
            forceOriginal: !!options.forceOriginal
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
            return undefined;
        }
        try {
            let bytes;
            if (result.buffer) {
                bytes = result.buffer.buffer;
            }
            else if (result.content) {
                bytes = decodeBase64(result.content).buffer;
            }
            else {
                return undefined;
            }
            const blobBytes = new Uint8Array(bytes.byteLength);
            blobBytes.set(bytes);
            const blob = new Blob([blobBytes.buffer], { type: result.mime || 'application/octet-stream' });
            return URL.createObjectURL(blob);
        }
        catch {
            return undefined;
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
                encoding: 'base64',
                width: requestWidth,
                quality: IMAGE_GRID_THUMB_QUALITY,
                format: 'webp',
                interpolation: 'lanczos'
            });
            if (this.imageGridState !== state || !this.isImageGridIndexNearViewport(state, index)) {
                return;
            }
            this.releaseImageBlobUrl(image.thumbnailUrl);
            const thumbnailUrl = result.ok ? this.createImageObjectUrl(result) : undefined;
            image.thumbnailContent = thumbnailUrl ? '' : result.ok ? result.content : '';
            image.thumbnailUrl = thumbnailUrl;
            image.thumbnailMime = result.mime || getMimeType(image.item.name);
            image.thumbnailError = result.ok ? undefined : result.message;
            image.width = result.width ?? image.width;
            image.height = result.height ?? image.height;
            if (result.ok) {
                this.imageGridLoadedThumbnailIndexes.add(index);
            }
            this.updateImageGridCard(index);
        }
        catch (error) {
            if (this.imageGridState === state) {
                image.thumbnailError = error instanceof Error ? error.message : String(error);
                this.updateImageGridCard(index);
            }
        }
        finally {
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
        if (image.previewUrl || image.previewContent || image.previewLoading) {
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
                encoding: 'base64',
                width: request.width,
                height: request.height,
                quality: request.quality,
                format: 'jpeg',
                interpolation: 'lanczos',
                forceOriginal: true,
                maxBytes: 128 * 1024 * 1024
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
            }
        }
        catch (error) {
            if (this.imageGridState === state) {
                image.previewError = error instanceof Error ? error.message : String(error);
            }
        }
        finally {
            if (this.imageGridState === state) {
                image.previewLoading = false;
                if (state.selectedIndex === index && (!requestSeq || requestSeq === this.imageGridPreviewRequestSeq)) {
                    this.updateImagePreviewOverlay();
                    this.scheduleImageGridPreviewNeighborsLoaded(state, index);
                }
            }
        }
    }
    bindImageGridObserver() {
        if (this.activePage !== 'images' || !this.imageGridState || !this.container) {
            this.disposeImageGridObserver();
            return;
        }
        const body = this.container.querySelector('.turbofile-image-page-body');
        if (!body || !('IntersectionObserver' in getWindow(this.container))) {
            return;
        }
        this.disposeImageGridObserver();
        this.imageGridObserver = new IntersectionObserver(entries => {
            const state = this.imageGridState;
            if (!state) {
                return;
            }
            const visibleIndexes = [];
            for (const entry of entries) {
                if (!entry.isIntersecting) {
                    continue;
                }
                const value = Number(entry.target.dataset.imageIndex);
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
        const visibleIndexes = [];
        for (const card of Array.from(this.container.querySelectorAll('.turbofile-image-page-card[data-image-index]'))) {
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
        this.imageGridObserver = undefined;
    }
    updateImageGridCard(index) {
        if (!this.container || this.activePage !== 'images') {
            return;
        }
        const card = this.container.querySelector(`.turbofile-image-page-card[data-image-index="${index}"]`);
        const state = this.imageGridState;
        const image = state?.images[index];
        if (!card || !image) {
            return;
        }
        const preview = card.querySelector('.turbofile-image-page-card-preview');
        if (!preview) {
            return;
        }
        clearNode(preview);
        const thumbnailSrc = image.thumbnailUrl || (image.thumbnailContent ? `data:${image.thumbnailMime};base64,${image.thumbnailContent}` : '');
        if (thumbnailSrc) {
            const thumb = document.createElement('img');
            thumb.loading = 'eager';
            thumb.decoding = 'async';
            thumb.addEventListener('error', () => this.handleImageGridThumbnailError(state, index));
            thumb.src = thumbnailSrc;
            thumb.alt = image.item.name;
            preview.appendChild(thumb);
        }
        else {
            const placeholder = $('.turbofile-image-page-card-placeholder');
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
        const available = width - (IMAGE_GRID_CARD_GAP * Math.max(0, columns - 1));
        const columnWidth = Math.max(IMAGE_GRID_THUMB_MIN, available / columns);
        const previewHeight = columnWidth * 150 / 220;
        return Math.max(150, Math.round(previewHeight + IMAGE_GRID_CARD_VERTICAL_CHROME));
    }
    getImageGridBodyWidth() {
        const body = this.container?.querySelector('.turbofile-image-page-body');
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
        const available = width - (IMAGE_GRID_CARD_GAP * Math.max(0, columns - 1));
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
        return device.platform === 'windows' ? IMAGE_GRID_REMOTE_WINDOWS_PARALLEL_LIMIT : IMAGE_GRID_REMOTE_PARALLEL_LIMIT;
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
            if (this.activePage !== 'images' || this.imageGridState !== state) {
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
        if (!this.container || this.imageGridState !== state || this.activePage !== 'images') {
            return;
        }
        const grid = this.container.querySelector('.turbofile-image-page-grid');
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
        this.imageGridScrollRenderTimer = undefined;
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
        this.imageGridPreviewPrefetchTimer = undefined;
    }
    getImageGridVisibleIndexes(state) {
        const rendered = this.imageGridRenderedRange;
        const range = this.imageGridState === state && rendered && rendered.columns === state.columns && rendered.total === state.images.length
            ? { startIndex: rendered.startIndex, endIndex: rendered.endIndex }
            : this.getImageGridVirtualRange(state);
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
            const keepPreview = state.previewVisible && this.getImageGridCircularDistance(state, index, state.selectedIndex) <= IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT;
            if (!keepPreview && (image.previewUrl || image.previewContent || image.previewError)) {
                this.releaseImageBlobUrl(image.previewUrl);
                image.previewUrl = undefined;
                image.previewContent = '';
                image.previewError = undefined;
                this.imageGridLoadedPreviewIndexes.delete(index);
            }
        }
    }
    releaseImageGridImage(image) {
        this.releaseImageBlobUrl(image.thumbnailUrl);
        this.releaseImageBlobUrl(image.previewUrl);
        image.thumbnailUrl = undefined;
        image.thumbnailContent = '';
        image.thumbnailError = undefined;
        image.previewUrl = undefined;
        image.previewContent = '';
        image.previewError = undefined;
    }
    getImageGridCircularDistance(state, index, selectedIndex) {
        if (!state.images.length) {
            return Number.MAX_SAFE_INTEGER;
        }
        const distance = Math.abs(index - selectedIndex);
        return Math.min(distance, state.images.length - distance);
    }
    shouldKeepImageGridPreview(state, index) {
        return this.imageGridState === state && state.previewVisible && this.getImageGridCircularDistance(state, index, state.selectedIndex) <= IMAGE_GRID_PREVIEW_NEIGHBOR_COUNT;
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
        image.thumbnailUrl = undefined;
        image.thumbnailContent = '';
        image.thumbnailError = '缩略图解码失败';
        this.updateImageGridCard(index);
    }
    updateImageGridSelection(index) {
        if (!this.container) {
            return;
        }
        for (const card of Array.from(this.container.querySelectorAll('.turbofile-image-page-card.is-selected'))) {
            card.classList.remove('is-selected');
        }
        const selected = this.container.querySelector(`.turbofile-image-page-card[data-image-index="${index}"]`);
        selected?.classList.add('is-selected');
    }
    releaseImageBlobUrl(url) {
        if (!url) {
            return;
        }
        if (url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    }
    ensureRemoteFileSystemProvider() {
        if (!this.remoteFileSystemProvider) {
            const existingProvider = this.fileService.getProvider(TURBOFILE_REMOTE_DOCUMENT_SCHEME);
            if (existingProvider instanceof TurboFileRemoteFileSystemProvider) {
                this.remoteFileSystemProvider = existingProvider;
            }
            else {
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
        await this.ensureNativeEditorTabs();
        const resource = device.id === LOCAL_WINDOWS_DEVICE_ID
            ? URI.file(item.path)
            : this.ensureRemoteFileSystemProvider().registerFile(device, await this.getSshConnectionOptions(device), item);
        this.previewState = undefined;
        await this.editorService.openEditor({ resource, options: { pinned: true } });
        this.statusMessage = `已用 VS Code 原生编辑器打开：${item.name}`;
        this.render();
    }
    async ensureNativeEditorTabs() {
        if (!this.nativeEditorTabsPromise) {
            this.nativeEditorTabsPromise = (async () => {
                const showTabs = this.configurationService.getValue('workbench.editor.showTabs');
                if (showTabs !== 'multiple') {
                    await this.configurationService.updateValue('workbench.editor.showTabs', 'multiple', 2 /* ConfigurationTarget.USER */);
                }
            })();
        }
        await this.nativeEditorTabsPromise;
    }
    async savePreview() {
        const preview = this.previewState;
        if (!preview || preview.mode !== 'text' || !preview.item.path) {
            return;
        }
        const device = this.getPaneDevice(preview.side);
        if (!device) {
            return;
        }
        const task = this.beginTask('save', `保存 ${preview.item.name}`, device.name);
        try {
            const result = await this.sshService.writeFile(await this.toTransferEndpoint(device, preview.item.path), preview.content, 'utf8');
            if (result.ok) {
                preview.dirty = false;
                this.updateTask(task, `正在刷新目录：${device.name}`, 90);
                await this.refreshPane(preview.side);
                this.finishTask(task, 'success', `已保存：${preview.item.name}`, { bytes: preview.content.length });
            }
            else {
                this.finishTask(task, 'error', `保存失败：${result.message}`, { error: result.message });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `保存失败：${message}`, { error: message });
        }
        this.render();
    }
    async compressSelected(side) {
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
            }
            else {
                this.finishTask(task, 'error', `压缩失败：${result.message}`, { error: result.message });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `压缩失败：${message}`, { error: message });
        }
        finally {
            await this.refreshPane(side, { force: true });
        }
    }
    async extractSelected(side) {
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
            }
            else {
                this.finishTask(task, 'error', `解压失败：${result.message}`, { error: result.message });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `解压失败：${message}`, { error: message });
        }
        finally {
            await this.refreshPane(side, { force: true });
        }
    }
    async copyPanePath(side) {
        const device = this.getPaneDevice(side);
        const windowsPath = !!device && this.isWindowsDevice(device);
        const path = this.formatPanePathForDisplay(this.paneStates[side].path, windowsPath);
        await this.clipboardService.writeText(path);
        this.statusMessage = `已复制当前路径：${path}`;
        this.render();
    }
    async copySelectedPath(side) {
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
    async calculateSelectedSize(side) {
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
            }
            else {
                this.finishTask(task, 'error', `计算大小失败：${result.message}`, { error: result.message });
                this.showDialogInfo('计算大小失败', result.message, `设备：${device.name}\n路径：${displayPath}`);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `计算大小失败：${message}`, { error: message });
            this.showDialogInfo('计算大小失败', message, `设备：${device.name}\n路径：${displayPath}`);
        }
        finally {
            await this.refreshPane(side, { force: true });
        }
    }
    async searchInPane(side) {
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
            const picks = matches.slice(0, 80).map(item => ({
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
    revealPaneItem(side, item, message) {
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
            const task = this.beginTask('terminal', `打开终端 ${title}`, state.path);
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
                    } : undefined
                });
                this.finishTask(task, 'success', `已打开本地终端：${title}`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.restoreTaskbarAfterTerminal();
                this.finishTask(task, 'error', `打开本地终端失败：${message}`, { error: message });
            }
            return;
        }
        const task = this.beginTask('terminal', `打开 SSH 终端 ${title}`, state.path);
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
            this.finishTask(task, 'success', `已打开内置 SSH 终端：${title}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.restoreTaskbarAfterTerminal();
            this.finishTask(task, 'error', `打开 SSH 终端失败：${message}`, { error: message });
        }
    }
    restoreTaskbarAfterTerminal() {
        if (!this.taskbarHiddenForTerminal) {
            return;
        }
        this.taskbarHiddenForTerminal = false;
        if (this.activePage === 'transfer') {
            this.render();
        }
    }
    async createAndRevealTerminal(options) {
        const instance = await this.terminalService.createTerminal(options);
        this.terminalService.setActiveInstance(instance);
        await this.terminalService.focusInstance(instance);
    }
    getTerminalTitle(side, device) {
        return `极速传 ${this.getSideLabel(side)} ${this.getDeviceDisplayLabel(device)}`;
    }
    async syncSelectedDirectories() {
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
            const strategies = new Set();
            const failures = [];
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
                }
                else if (result.canceled) {
                    this.finishTask(task, 'canceled', `已取消同步：${displayPath}`, { bytes: totalBytes });
                    return;
                }
                else {
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.finishTask(task, 'error', `同步失败：${message}`, { error: message });
        }
    }
    showSyncPlanPreview(plan) {
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
    async buildSyncPlan(task) {
        const recursivePlan = await this.tryBuildRecursiveSyncPlan(task);
        return recursivePlan ?? this.buildFlatSyncPlan();
    }
    async tryBuildRecursiveSyncPlan(task) {
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
    getRecursiveSyncRoots() {
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
    getSelectedDirectory(side) {
        const selected = this.getSelectedItem(side);
        return selected?.path && selected.directory && !selected.parent && selected.type !== 'unknown' ? selected : undefined;
    }
    findPaneDirectoryByName(side, name) {
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
    async collectSyncTree(side, rootPath, relativeRoot, counter, task) {
        counter.count++;
        if (counter.count > SYNC_RECURSIVE_SCAN_LIMIT) {
            throw new Error(`递归同步扫描超过 ${SYNC_RECURSIVE_SCAN_LIMIT} 项，请进入更小的目录后再同步。`);
        }
        if (task && counter.count % 25 === 0) {
            this.updateTask(task, `正在扫描${this.getSideLabel(side)}：${relativeRoot || '.'}`, 8);
        }
        const items = await this.listPaneDirectory(side, rootPath);
        const entries = [];
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
                }
                else {
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
        return listing.items.filter(item => !!item.path && !item.parent && item.type !== 'unknown');
    }
    buildFlatSyncPlan() {
        const leftDevice = this.getPaneDevice('left');
        const rightDevice = this.getPaneDevice('right');
        const caseInsensitive = !!leftDevice && !!rightDevice && (this.isWindowsDevice(leftDevice) || this.isWindowsDevice(rightDevice));
        const leftEntries = this.getSyncItems('left').map(item => ({ relativePath: item.name, item }));
        const rightEntries = this.getSyncItems('right').map(item => ({ relativePath: item.name, item }));
        return this.buildSyncPlanFromEntries(leftEntries, rightEntries, this.paneStates.left.path, this.paneStates.right.path, caseInsensitive, false);
    }
    buildSyncPlanFromEntries(leftEntries, rightEntries, leftRootPath, rightRootPath, caseInsensitive, recursive) {
        const leftByPath = new Map(leftEntries.map(entry => [this.getSyncPathKey(entry.relativePath, caseInsensitive), entry]));
        const rightByPath = new Map(rightEntries.map(entry => [this.getSyncPathKey(entry.relativePath, caseInsensitive), entry]));
        const plan = [];
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
    getSyncItems(side) {
        const selected = this.getSelectedItem(side);
        if (selected?.path && !selected.parent && selected.type !== 'unknown') {
            return [selected];
        }
        return this.paneStates[side].items.filter(item => !!item.path && !item.parent && !item.directory && item.type !== 'unknown');
    }
    getSyncPathKey(relativePath, caseInsensitive) {
        const normalized = relativePath.replace(/\\/g, '/');
        return caseInsensitive ? normalized.toLocaleLowerCase() : normalized;
    }
    joinRelativePanePath(side, rootPath, relativePath) {
        const device = this.getPaneDevice(side);
        const windowsPath = !!device && this.isWindowsDevice(device);
        return relativePath
            .split('/')
            .filter(segment => !!segment)
            .reduce((currentPath, segment) => joinPanePath(currentPath, segment, windowsPath), rootPath);
    }
    getSyncDirectionLabel(step) {
        return step.sourceSide === 'left' ? '左 -> 右' : '右 -> 左';
    }
    getSyncReasonLabel(reason) {
        if (reason === 'missing') {
            return '新增';
        }
        if (reason === 'newer') {
            return '较新';
        }
        return '大小不同';
    }
    getSyncDecision(leftItem, rightItem) {
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
    async toTransferEndpoint(device, path) {
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
            supportsRsync: device.capabilities.rsync
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
        state.selectedPath = undefined;
        state.selectedPaths.clear();
        state.selectionAnchorPath = undefined;
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
            this.selectItem(side, item, undefined, false);
            this.render();
        }
    }
    getSelectedTransferItems(side) {
        const state = this.paneStates[side];
        const selectedItems = state.items.filter(item => !!item.path && !item.parent && state.selectedPaths.has(item.path));
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
        return undefined;
    }
    getSelectedItem(side) {
        const state = this.paneStates[side];
        if (state.selectedPath) {
            const focused = state.items.find(item => item.path === state.selectedPath);
            if (focused) {
                return focused;
            }
        }
        return state.items.find(item => !!item.path && state.selectedPaths.has(item.path));
    }
    toFileItems(device, currentPath, entries) {
        const parentPath = getPaneParentPath(currentPath, this.isWindowsDevice(device));
        const parent = parentPath ? [{
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
        return [...parent, ...entries.filter(entry => !isHiddenFileName(entry.name)).map(entry => this.toFileItem(entry))];
    }
    toFileItem(entry) {
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
    getAllDevices() {
        return [this.localWindowsDevice, ...this.devices];
    }
    getLocalWindowsDefaultPath() {
        return this.environmentService.userHome.fsPath || LOCAL_WINDOWS_FALLBACK_PATH;
    }
    async refreshWindowsDriveRoots() {
        const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        const probes = await Promise.all(letters.map(async (letter) => {
            const root = `${letter}:\\`;
            try {
                await this.sshService.listLocalDirectory(root);
                return root;
            }
            catch {
                return undefined;
            }
        }));
        this.availableWindowsDriveRoots = probes.filter((root) => !!root);
        if (!this.availableWindowsDriveRoots.length) {
            this.availableWindowsDriveRoots = [LOCAL_WINDOWS_FALLBACK_PATH];
        }
        if (this.activePage === 'transfer') {
            this.render();
        }
    }
    getWindowsLocationLabel(path) {
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
    getWindowsDriveLabel(driveRoot) {
        const drive = driveRoot.substring(0, 1).toUpperCase();
        return `${drive}盘`;
    }
    getWindowsLocationIconClass(path) {
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
            getActionViewItem: (action, options) => action.id.startsWith(`turbofile.windowsLocation.${side}.`)
                ? new ActionViewItem(null, action, { ...options, icon: true, label: true })
                : undefined,
            skipTelemetry: true
        });
    }
    getWindowsLocationActions(side) {
        const state = this.paneStates[side];
        const homePath = this.getLocalWindowsDefaultPath();
        const desktopPath = joinPanePath(homePath, 'Desktop', true);
        const actions = [
            this.menuAction(`turbofile.windowsLocation.${side}.desktop`, '桌面', this.getWindowsLocationMenuIconClass(desktopPath), () => this.openWindowsLocalPath(side, desktopPath, '桌面'), true, isSameWindowsPath(state.path, desktopPath)),
            new Separator()
        ];
        for (const root of this.getWindowsDriveRoots()) {
            const drive = root.substring(0, 1).toUpperCase();
            actions.push(this.menuAction(`turbofile.windowsLocation.${side}.drive.${drive}`, this.getWindowsDriveLabel(root), this.getWindowsLocationMenuIconClass(root), () => this.openWindowsLocalPath(side, root, this.getWindowsDriveLabel(root)), true, isPathOnWindowsDrive(state.path, root)));
        }
        return actions;
    }
    getWindowsDriveRoots() {
        const roots = new Set();
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
        state.error = undefined;
        this.resetPaneScroll(side);
        this.clearPaneSelection(side);
        this.statusMessage = `已在${this.getSideLabel(side)}打开 Windows 位置：${label}`;
        this.render();
        void this.refreshPane(side);
    }
    getPaneDevice(side) {
        const state = this.paneStates[side];
        return this.getAllDevices().find(device => device.id === state.deviceId);
    }
    getDeviceById(deviceId) {
        return this.getAllDevices().find(device => device.id === deviceId);
    }
    renderFileBrowserIcon(item) {
        if (item.parent) {
            return renderTurboFileIcon('arrow-up-circle', 'primary');
        }
        if (item.directory) {
            return renderTurboFileIcon('folder-fill', 'warning');
        }
        const icon = $('span.turbofile-file-theme-icon.monaco-icon-label');
        const resource = item.path ? URI.file(item.path) : undefined;
        icon.classList.add(...getIconClasses(this.modelService, this.languageService, resource, FileKind.FILE));
        icon.setAttribute('aria-hidden', 'true');
        return icon;
    }
    getDeviceDisplayLabel(device) {
        const host = device.id === LOCAL_WINDOWS_DEVICE_ID && device.host === 'localhost' ? '10.190.129.29' : device.host;
        return `${device.name} (${host})`;
    }
    getDeviceOptionIcon(_device) {
        return '🖥️';
    }
    formatPanePathForDisplay(path, windowsPath) {
        if (!windowsPath) {
            return path || '/';
        }
        return (path || LOCAL_WINDOWS_FALLBACK_PATH).replace(/\//g, '\\');
    }
    normalizePaneInputPath(path, windowsPath) {
        const trimmed = path.trim();
        if (!trimmed) {
            return '';
        }
        if (!windowsPath) {
            const normalized = trimmed.replace(/\\/g, '/');
            return normalized.startsWith('/') ? normalized : `/${normalized}`;
        }
        return trimmed.replace(/\//g, '\\');
    }
    getDefaultPaneDevicePath(device) {
        return device.defaultPath || (device.id === LOCAL_WINDOWS_DEVICE_ID ? this.getLocalWindowsDefaultPath() : '/');
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
        this.storageService.store(this.getPaneDevicePathStorageKey(side, device), path, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
    getRememberedPaneDevicePath(side, device) {
        const path = this.storageService.get(this.getPaneDevicePathStorageKey(side, device), 0 /* StorageScope.PROFILE */);
        return path || undefined;
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
            return undefined;
        }
        if (snapshot.expiresAt <= Date.now()) {
            this.paneDeviceSnapshots.delete(key);
            return undefined;
        }
        return snapshot;
    }
    setPaneDevice(side, device) {
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
        state.deviceId = device.id;
        const targetPath = this.getRememberedPaneDevicePath(side, device) ?? this.getDefaultPaneDevicePath(device);
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
    ensurePaneDeviceSelection(options = {}) {
        const devices = this.getAllDevices();
        for (const side of ['left', 'right']) {
            const state = this.paneStates[side];
            if (!devices.some(device => device.id === state.deviceId)) {
                state.deviceId = devices[0].id;
                state.path = devices[0].defaultPath || this.getLocalWindowsDefaultPath();
            }
        }
        if (options.preferFirstSshOnRight && !this.hasAppliedInitialRightPaneDefault && this.devices[0] && this.paneStates.right.deviceId === LOCAL_WINDOWS_DEVICE_ID) {
            this.paneStates.right.deviceId = this.devices[0].id;
            this.paneStates.right.path = this.devices[0].defaultPath || '/';
            this.hasAppliedInitialRightPaneDefault = true;
        }
    }
    isWindowsDevice(device) {
        return device.id === LOCAL_WINDOWS_DEVICE_ID || device.platform === 'windows';
    }
    renderDeviceForm() {
        const overlay = $('.turbofile-device-overlay');
        const form = document.createElement('form');
        form.className = 'turbofile-device-form';
        const editingDevice = this.editingDeviceId ? this.devices.find(device => device.id === this.editingDeviceId) : undefined;
        const isEditing = !!editingDevice;
        const title = $('.turbofile-device-form-title');
        title.textContent = isEditing ? '编辑 SSH 设备' : '添加 SSH 设备';
        form.appendChild(title);
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
        this.appendInputField(form, 'password', '密码', isEditing ? '留空保持原密码' : '', 'password', true);
        this.appendInputField(form, 'privateKeyPath', '私钥路径', 'C:\\Users\\warrior\\.ssh\\id_rsa', 'text', true, editingDevice?.privateKeyPath);
        this.appendInputField(form, 'passphrase', '私钥口令', isEditing ? '留空保持原私钥口令' : '', 'password', true);
        this.appendInputField(form, 'defaultPath', '默认目录', '/home', 'text', true, editingDevice?.defaultPath);
        const message = $('.turbofile-device-form-message');
        message.textContent = this.deviceFormMessage;
        form.appendChild(message);
        const actions = $('.turbofile-device-form-actions');
        const cancel = this.createButton('取消', 'turbofile-secondary-button');
        const test = this.createButton('测试连接', 'turbofile-secondary-button');
        const save = this.createButton('保存设备', 'turbofile-primary-button');
        cancel.element.type = 'button';
        test.element.type = 'button';
        save.element.type = 'submit';
        actions.appendChild(cancel.element);
        actions.appendChild(test.element);
        actions.appendChild(save.element);
        form.appendChild(actions);
        cancel.element.addEventListener('click', () => {
            this.isDeviceFormVisible = false;
            this.editingDeviceId = undefined;
            this.render();
        });
        test.element.addEventListener('click', async () => {
            const draft = this.readDeviceDraft(form, message);
            if (!draft) {
                return;
            }
            message.textContent = '正在测试 SSH 连接...';
            const storedPassword = editingDevice && this.deviceStore ? await this.deviceStore.getPassword(editingDevice.id) : undefined;
            const storedPrivateKey = editingDevice && this.deviceStore ? await this.deviceStore.getPrivateKey(editingDevice.id) : undefined;
            const storedPassphrase = editingDevice && this.deviceStore ? await this.deviceStore.getPassphrase(editingDevice.id) : undefined;
            const result = await this.sshService.testConnection({
                host: draft.host,
                port: draft.port,
                username: draft.username,
                password: draft.password || storedPassword,
                privateKey: draft.privateKey || storedPrivateKey,
                privateKeyPath: draft.privateKeyPath,
                passphrase: draft.passphrase || storedPassphrase
            });
            this.deviceFormMessage = result.ok ? 'SSH 连接成功。' : `SSH 连接失败：${result.message}`;
            message.textContent = this.deviceFormMessage;
        });
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const draft = this.readDeviceDraft(form, message);
            if (!draft || !this.deviceStore) {
                return;
            }
            message.textContent = '正在保存设备...';
            try {
                const savedDevice = editingDevice ? await this.deviceStore.updateDevice(editingDevice.id, draft) : await this.deviceStore.saveDevice(draft);
                this.devices = this.deviceStore.loadDevices();
                this.ensurePaneDeviceSelection();
                this.deviceFormMessage = `${editingDevice ? '已更新' : '已保存'}设备：${savedDevice.name}`;
                this.statusMessage = `${this.deviceFormMessage}。可在设备下拉菜单中选择。`;
                this.isDeviceFormVisible = false;
                this.editingDeviceId = undefined;
                this.render();
                void this.refreshPane('right');
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                this.deviceFormMessage = `保存失败：${reason}`;
                message.textContent = this.deviceFormMessage;
                this.statusMessage = this.deviceFormMessage;
            }
        });
        overlay.appendChild(form);
        return overlay;
    }
    appendInputField(parent, name, label, placeholder, type = 'text', wide = false, value) {
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
        field.appendChild(labelElement);
        field.appendChild(input);
        parent.appendChild(field);
    }
    appendSelectField(parent, name, label, options, selectedValue) {
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
        field.appendChild(labelElement);
        field.appendChild(select);
        parent.appendChild(field);
    }
    readDeviceDraft(form, message) {
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
            authType: String(formData.get('authType') || 'password'),
            password: String(formData.get('password') || '') || undefined,
            privateKeyPath: String(formData.get('privateKeyPath') || '') || undefined,
            passphrase: String(formData.get('passphrase') || '') || undefined,
            defaultPath: String(formData.get('defaultPath') || '') || undefined,
            platform: String(formData.get('platform') || 'unknown')
        };
    }
};
TurboFileEditor = TurboFileEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IWorkbenchThemeService),
    __param(3, IStorageService),
    __param(4, INativeEnvironmentService),
    __param(5, ITurboFileSshService),
    __param(6, IContextMenuService),
    __param(7, IFileService),
    __param(8, IModelService),
    __param(9, ILanguageService),
    __param(10, IInstantiationService),
    __param(11, IEditorService),
    __param(12, ITerminalService),
    __param(13, ITerminalGroupService),
    __param(14, ITerminalProfileService),
    __param(15, IQuickInputService),
    __param(16, IClipboardService),
    __param(17, IConfigurationService),
    __param(18, IWorkbenchLayoutService)
], TurboFileEditor);
export { TurboFileEditor };
class TurboFileRemoteFileSystemProvider extends Disposable {
    constructor(sshService) {
        super();
        this.sshService = sshService;
        this.capabilities = 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
        this.onDidChangeCapabilities = Event.None;
        this._onDidChangeFile = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFile.event;
        this.devices = new Map();
        this.stats = new Map();
        this.remotePaths = new Map();
    }
    registerFile(device, connection, item) {
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
    watch(_resource, _opts) {
        return Disposable.None;
    }
    async stat(resource) {
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
    async mkdir(resource) {
        const result = await this.sshService.createDirectory(this.toEndpoint(resource));
        if (!result.ok) {
            throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
        }
        this.stats.set(resource.toString(), { type: FileType.Directory, ctime: Date.now(), mtime: Date.now(), size: 0 });
        this._onDidChangeFile.fire([{ resource, type: 1 /* FileChangeType.ADDED */ }]);
    }
    async readdir(resource) {
        const registeredDevice = this.getRegisteredDevice(resource);
        const listing = await this.sshService.listRemoteDirectory(registeredDevice.connection, this.toRemotePath(resource));
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
    async delete(resource, opts) {
        const result = await this.sshService.deletePath(this.toEndpoint(resource), opts.recursive);
        if (!result.ok) {
            throw createTurboFileProviderError(result.message, FileSystemProviderErrorCode.Unknown);
        }
        this.stats.delete(resource.toString());
        this.remotePaths.delete(resource.toString());
        this._onDidChangeFile.fire([{ resource, type: 2 /* FileChangeType.DELETED */ }]);
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
            { resource: from, type: 2 /* FileChangeType.DELETED */ },
            { resource: to, type: 1 /* FileChangeType.ADDED */ }
        ]);
    }
    async readFile(resource) {
        const result = await this.sshService.readFile(this.toEndpoint(resource), { encoding: 'base64', maxBytes: 256 * 1024 * 1024 });
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
        const result = await this.sshService.writeFile(this.toEndpoint(resource), encodeBase64(VSBuffer.wrap(content)), 'base64');
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
        this._onDidChangeFile.fire([{ resource, type: 0 /* FileChangeType.UPDATED */ }]);
    }
    async lookupEntry(resource) {
        const registeredDevice = this.getRegisteredDevice(resource);
        const path = this.toRemotePath(resource);
        const parentPath = getPaneParentPath(path, false) ?? '/';
        const listing = await this.sshService.listRemoteDirectory(registeredDevice.connection, parentPath);
        const name = getPathBasename(path);
        const entry = listing.entries.find(entry => entry.path === path || entry.name === name);
        if (!entry) {
            throw createTurboFileProviderError(`File not found: ${path}`, FileSystemProviderErrorCode.FileNotFound);
        }
        return entry;
    }
    toEndpoint(resource) {
        const registeredDevice = this.getRegisteredDevice(resource);
        return {
            kind: 'ssh',
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
        this._properties.title = `极速传 ${connection.username}@${connection.host}`;
    }
    async start() {
        try {
            const session = await this.sshService.createSshTerminal(this.connection, this.cwd, this._lastDimensions.cols, this._lastDimensions.rows);
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
        }
        catch (error) {
            return { message: error instanceof Error ? error.message : String(error) };
        }
    }
    shutdown(_immediate) {
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
        if (signal === 'SIGINT') {
            this.input('\x03');
            return;
        }
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            this.shutdown(true);
        }
    }
    processBinary(data) {
        this.input(data);
        return Promise.resolve();
    }
    resize(cols, rows) {
        if (this.isShutdown || (this._lastDimensions.cols === cols && this._lastDimensions.rows === rows)) {
            return;
        }
        this._lastDimensions.cols = cols;
        this._lastDimensions.rows = rows;
        if (this.sessionId) {
            void this.sshService.resizeSshTerminal(this.sessionId, cols, rows);
        }
    }
    clearBuffer() {
        // The SSH PTY stream is live-only; VS Code owns the visible scrollback buffer.
    }
    acknowledgeDataEvent(_charCount) {
        // ssh2 channels provide their own backpressure, so no extra browser ack is needed.
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
function getWindowsDriveRoot(path) {
    const match = /^([A-Za-z]):/.exec(path.replace(/\//g, '\\').trim());
    return match ? `${match[1].toUpperCase()}:\\` : undefined;
}
function isSameWindowsPath(left, right) {
    return getWindowsPathKey(left) === getWindowsPathKey(right);
}
function isPathOnWindowsDrive(path, driveRoot) {
    return getWindowsDriveRoot(path) === getWindowsDriveRoot(driveRoot);
}
function getWindowsPathKey(path) {
    return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}
function isSupportedWindowsDropPath(path) {
    return /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}
function joinPanePath(parentPath, name, windowsPath) {
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
function toRemoteDocumentUriPath(path) {
    const normalized = path.replace(/\\/g, '/');
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
function getPathBasename(path) {
    const normalized = path.replace(/[\\/]+$/, '');
    const slash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    return slash >= 0 ? normalized.substring(slash + 1) : normalized;
}
function toProviderFileType(type) {
    if (type === 'directory') {
        return FileType.Directory;
    }
    if (type === 'file') {
        return FileType.File;
    }
    if (type === 'symlink') {
        return FileType.SymbolicLink;
    }
    return FileType.Unknown;
}
function createTurboFileProviderError(message, code) {
    return createFileSystemProviderError(message, code);
}
function renderTurboFileIcon(icon, color) {
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
function renderTurboFileAppearanceIcon(icon) {
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
    }
    else {
        path.setAttribute('d', 'M4 5.5h16v10.5H4zM9 20h6M12 16v4');
    }
    svg.appendChild(path);
    return svg;
}
function getTurboFileIconPaths(icon) {
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
function isHiddenFileName(name) {
    return !!name && name !== '..' && name.startsWith('.');
}
function isImageFile(name) {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}
function isArchiveFile(name) {
    return /\.(zip|tar|tgz|tar\.gz|tar\.bz2|tbz2|tar\.xz|txz)$/i.test(name);
}
function getMimeType(name) {
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
    if (lower.endsWith('.bmp')) {
        return 'image/bmp';
    }
    if (lower.endsWith('.svg')) {
        return 'image/svg+xml';
    }
    return 'text/plain';
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
    return path.length > 1 ? path.replace(/[\\/]+$/, '') : path;
}
function formatDuration(milliseconds) {
    if (milliseconds < 1000) {
        return `${Math.max(0, Math.round(milliseconds))} ms`;
    }
    const seconds = milliseconds / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(1)} s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
}
function formatThroughput(bytes, milliseconds) {
    if (bytes <= 0 || milliseconds <= 0) {
        return '';
    }
    return `${formatSize((bytes / milliseconds) * 1000)}/s`;
}
function formatDate(timestamp) {
    if (!timestamp) {
        return '';
    }
    const date = new Date(timestamp);
    const pad = (value) => value.toString().padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vRDovV29yay9Db2RlL1R1cmJvRmlsZS1XaW5kb3dzL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3R1cmJvZmlsZS9icm93c2VyL3R1cmJvZmlsZUVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyx1QkFBdUIsQ0FBQztBQUMvQixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQWEsU0FBUyxFQUFnQixNQUFNLGlDQUFpQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN6RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRWpGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQVcsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUs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Y0FBYyxFQUFFLFdBQVcsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNoRSxNQUFNLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLElBQUksR0FBRyxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUM7UUFDakUsTUFBTSxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLFVBQVUsQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ2hFLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEYsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxJQUFJLENBQUM7UUFDaEUsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsR0FBRyxLQUFLLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxJQUFJLENBQUM7UUFDOUQsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNyQixPQUFPLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQyxR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