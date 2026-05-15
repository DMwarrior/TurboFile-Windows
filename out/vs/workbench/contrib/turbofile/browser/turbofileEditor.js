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
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Separator, toAction } from '../../../../base/common/actions.js';
import { ITurboFileSshService } from '../../../../platform/turbofile/common/turbofile.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, FileType, IFileService } from '../../../../platform/files/common/files.js';
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
const IMAGE_GRID_COLUMN_OPTIONS = [4, 6, 8, 10, 12];
const IMAGE_GRID_NEIGHBOR_LOAD_COUNT = 2;
const IMAGE_GRID_OVERSCAN_ROWS = 1;
const IMAGE_GRID_CARD_GAP = 12;
const IMAGE_GRID_CARD_VERTICAL_CHROME = 62;
const IMAGE_GRID_THUMB_MIN = 96;
const IMAGE_GRID_THUMB_MAX = 640;
const IMAGE_GRID_THUMB_STEP = 64;
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
    constructor(group, telemetryService, workbenchThemeService, storageService, environmentService, sshService, contextMenuService, fileService, instantiationService, editorService, terminalService, terminalGroupService, terminalProfileService, quickInputService, clipboardService, configurationService, layoutService) {
        super(TurboFileEditor_1.ID, group, telemetryService, workbenchThemeService, storageService);
        this.workbenchThemeService = workbenchThemeService;
        this.storageService = storageService;
        this.environmentService = environmentService;
        this.sshService = sshService;
        this.contextMenuService = contextMenuService;
        this.fileService = fileService;
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
        this.deviceFormMessage = '';
        this.deviceConnectionMessages = new Map();
        this.availableColorThemes = [];
        this.isLoadingColorThemes = false;
        this.hasLoadedColorThemes = false;
        this.currentTransferMode = 'copy';
        this.lastActiveSide = 'left';
        this.taskbarHiddenForTerminal = false;
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
        void this.loadColorThemes();
        void this.refreshWindowsDriveRoots();
        this.ensurePaneDeviceSelection();
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
        this.ensurePaneDeviceSelection();
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
        rows.appendChild(this.renderUiFontSizeSetting());
        rows.appendChild(this.renderUiFontFamilySetting());
        rows.appendChild(this.renderBrowserFontSizeSetting());
        rows.appendChild(this.renderBrowserFontFamilySetting());
        card.appendChild(rows);
        return card;
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
        const decrease = this.createPageButton(Codicon.remove, '减小', () => update(currentFontSize - 1));
        const increase = this.createPageButton(Codicon.add, '增大', () => update(currentFontSize + 1), true);
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
        controls.appendChild(decrease);
        controls.appendChild(input);
        controls.appendChild(increase);
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
    normalizeUiFontSize(value, fallback) {
        if (!Number.isFinite(value)) {
            return fallback;
        }
        return Math.min(24, Math.max(11, Math.round(value)));
    }
    updateUiFontSize(value) {
        const fontSize = this.normalizeUiFontSize(value, this.getUiFontSize());
        this.storageService.store(TURBOFILE_UI_FONT_SIZE_STORAGE_KEY, String(fontSize), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        this.statusMessage = `UI 字号已设置为 ${fontSize}px。`;
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
            }
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
        name.appendChild(renderFileBrowserIcon(item));
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
        size.textContent = item.displaySize || formatSize(item.rawSize);
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
        metrics.appendChild(this.renderLiveTransferMetric('terminal', item.strategy ?? task.strategy ?? '传输中', '传输模式', 'primary'));
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
        const totalBytes = event.totalBytes;
        const transferredBytes = Math.min(event.transferredBytes, totalBytes > 0 ? totalBytes : event.transferredBytes);
        const progress = totalBytes > 0
            ? Math.max(0, Math.min(100, Math.round((transferredBytes / totalBytes) * 100)))
            : event.phase === 'complete' ? 100 : Math.max(8, task.progress);
        const detail = this.formatTransferProgressDetail(event.phase, transferredBytes, totalBytes);
        const now = Date.now();
        const activeItem = task.activeTransferItemIndex !== undefined ? task.transferItems?.[task.activeTransferItemIndex] : undefined;
        const speed = this.calculateTransferSpeed(activeItem ?? task, transferredBytes, now);
        const strategy = this.getTransferStrategyLabel(event.phase) ?? task.strategy;
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
    getTransferStrategyLabel(phase) {
        if (phase === 'rsync-direct') {
            return 'rsync-direct';
        }
        if (phase === 'relay-download' || phase === 'relay-upload') {
            return 'sftp-relay';
        }
        return undefined;
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
        for (const option of IMAGE_GRID_COLUMN_OPTIONS) {
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
        card.appendChild(preview);
        const name = $('.turbofile-image-page-card-name');
        name.textContent = image.item.name;
        card.appendChild(name);
        card.addEventListener('click', () => this.selectImageGridItem(index));
        card.addEventListener('dblclick', () => this.openImageGridPreview(index));
        return card;
    }
    renderImagePreviewOverlay() {
        const state = this.imageGridState;
        const overlay = $('.turbofile-image-preview-overlay');
        if (!state?.previewVisible) {
            return overlay;
        }
        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                this.closeImageGridPreview();
            }
        });
        const close = this.createButton('关闭', 'turbofile-secondary-button');
        close.element.classList.add('turbofile-image-preview-close');
        clearNode(close.element);
        close.element.appendChild(renderIcon(Codicon.close));
        close.element.addEventListener('click', () => this.closeImageGridPreview());
        overlay.appendChild(close.element);
        overlay.appendChild(this.renderImagePreviewSideButton(state, -1));
        const stage = $('.turbofile-image-preview-stage');
        this.renderImagePreviewStageContent(stage, state);
        /*
        const previewSrc = selected?.previewUrl || (selected?.previewContent ? `data:${selected.previewMime};base64,${selected.previewContent}` : '') || selected?.thumbnailUrl || (selected?.thumbnailContent ? `data:${selected.thumbnailMime};base64,${selected.thumbnailContent}` : '');
        if (selected && previewSrc) {
            const image = document.createElement('img');
            image.className = 'turbofile-image-preview-image';
            if (!selected.previewUrl && !selected.previewContent) {
                image.classList.add('is-thumbnail');
            }
            image.src = previewSrc;
            image.alt = selected.item.name;
            stage.appendChild(image);
        } else {
            const placeholder = $('.turbofile-image-preview-placeholder');
            placeholder.appendChild(renderIcon(Codicon.fileMedia));
            placeholder.append(selected?.previewError ?? (selected?.previewLoading ? '正在加载原图...' : '准备加载原图'));
            stage.appendChild(placeholder);
        }
        */
        overlay.appendChild(stage);
        overlay.appendChild(this.renderImagePreviewSideButton(state, 1));
        const caption = $('.turbofile-image-preview-caption');
        caption.textContent = this.getImagePreviewCaption(state);
        overlay.appendChild(caption);
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
        return overlay;
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
        const previewSrc = selected?.previewUrl || (selected?.previewContent ? `data:${selected.previewMime};base64,${selected.previewContent}` : '') || selected?.thumbnailUrl || (selected?.thumbnailContent ? `data:${selected.thumbnailMime};base64,${selected.thumbnailContent}` : '');
        if (selected && previewSrc) {
            const image = document.createElement('img');
            image.className = 'turbofile-image-preview-image';
            image.decoding = 'async';
            if (!selected.previewUrl && !selected.previewContent) {
                image.classList.add('is-thumbnail');
            }
            image.src = previewSrc;
            image.alt = selected.item.name;
            stage.appendChild(image);
            return;
        }
        const placeholder = $('.turbofile-image-preview-placeholder');
        placeholder.appendChild(renderIcon(Codicon.fileMedia));
        placeholder.append(selected?.previewError ?? (selected?.previewLoading ? 'Loading image...' : 'Preparing image...'));
        stage.appendChild(placeholder);
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
            caption.textContent = this.getImagePreviewCaption(state);
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
                this.statusMessage = item.parent ? '双击或右键菜单可返回上级目录。' : `已选择 ${item.name}。可预览、传输、删除、重命名、压缩或解压。`;
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
        const otherSide = this.getOppositeSide(side);
        const canOperate = !!item.path && !item.parent;
        const canPreview = canOperate && !item.directory;
        const canExtract = canPreview && isArchiveFile(item.name);
        if (item.parent) {
            return [
                this.menuAction('turbofile.openParent', '返回上级目录', Codicon.arrowUp, () => this.openItem(side, item), !!item.path),
                new Separator(),
                this.menuAction('turbofile.refreshPane', `刷新${this.getSideLabel(side)}`, Codicon.refresh, () => this.refreshPane(side)),
                this.menuAction('turbofile.openTerminal', `在${this.getSideLabel(side)}打开终端`, Codicon.terminal, () => this.openTerminal(side))
            ];
        }
        return [
            item.directory
                ? this.menuAction('turbofile.openDirectory', '打开目录', Codicon.folderOpened, () => this.openItem(side, item), canOperate)
                : this.menuAction('turbofile.preview', '预览 / 编辑', Codicon.eye, () => this.previewSelected(side), canPreview),
            this.menuAction('turbofile.copyToOtherSide', this.getTransferMenuLabel(side, otherSide), Codicon.arrowRight, () => this.transferSelected(side, otherSide), canOperate),
            this.menuAction('turbofile.moveToOtherSide', `剪切到${this.getSideLabel(otherSide)}`, Codicon.move, () => this.moveSelected(side, otherSide), canOperate),
            new Separator(),
            this.menuAction('turbofile.newFolder', `在${this.getSideLabel(side)}新建文件夹`, Codicon.newFolder, () => this.createFolder(side)),
            this.menuAction('turbofile.rename', '重命名', Codicon.edit, () => this.renameSelected(side), canOperate),
            this.menuAction('turbofile.delete', '删除', Codicon.trash, () => this.deleteSelected(side), canOperate),
            new Separator(),
            this.menuAction('turbofile.compress', '压缩', Codicon.archive, () => this.compressSelected(side), canOperate),
            this.menuAction('turbofile.extract', '解压', Codicon.unarchive, () => this.extractSelected(side), canExtract),
            new Separator(),
            this.menuAction('turbofile.openTerminal', `在${this.getSideLabel(side)}打开终端`, Codicon.terminal, () => this.openTerminal(side)),
            this.menuAction('turbofile.refreshPane', `刷新${this.getSideLabel(side)}`, Codicon.refresh, () => this.refreshPane(side))
        ];
    }
    getPaneContextActions(side) {
        const otherSide = this.getOppositeSide(side);
        const otherSelected = this.getSelectedTransferItems(otherSide);
        const canTransferFromOtherSide = otherSelected.length > 0;
        return [
            this.menuAction('turbofile.refreshPane', `刷新${this.getSideLabel(side)}`, Codicon.refresh, () => this.refreshPane(side)),
            this.menuAction('turbofile.newFolder', `在${this.getSideLabel(side)}新建文件夹`, Codicon.newFolder, () => this.createFolder(side)),
            new Separator(),
            this.menuAction('turbofile.copyFromOtherSide', this.getTransferMenuLabel(otherSide, side), Codicon.arrowRight, () => this.transferSelected(otherSide, side), canTransferFromOtherSide),
            this.menuAction('turbofile.moveFromOtherSide', `剪切${this.getSideLabel(otherSide)}选中项到${this.getSideLabel(side)}`, Codicon.move, () => this.moveSelected(otherSide, side), canTransferFromOtherSide),
            new Separator(),
            this.menuAction('turbofile.openTerminal', `在${this.getSideLabel(side)}打开终端`, Codicon.terminal, () => this.openTerminal(side))
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
    getTransferMenuLabel(sourceSide, targetSide) {
        const sourceDevice = this.getPaneDevice(sourceSide);
        const targetDevice = this.getPaneDevice(targetSide);
        const targetLabel = this.getSideLabel(targetSide);
        if (sourceDevice?.id === LOCAL_WINDOWS_DEVICE_ID && targetDevice?.id !== LOCAL_WINDOWS_DEVICE_ID) {
            return `上传到${targetLabel}`;
        }
        if (sourceDevice?.id !== LOCAL_WINDOWS_DEVICE_ID && targetDevice?.id === LOCAL_WINDOWS_DEVICE_ID) {
            return `下载到${targetLabel}`;
        }
        if (sourceDevice?.id !== LOCAL_WINDOWS_DEVICE_ID && targetDevice?.id !== LOCAL_WINDOWS_DEVICE_ID) {
            return `传输到${targetLabel}`;
        }
        return `复制到${targetLabel}`;
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
        return {
            name: item.name,
            type: item.type,
            displaySize: item.size,
            rawSize: item.rawSize,
            status: 'waiting',
            progress: 0,
            transferredBytes: 0,
            totalBytes: Math.max(0, item.rawSize),
            speedBytesPerSecond: 0,
            speedSamples: []
        };
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
        return !!dataTransfer.getData(CodeDataTransfers.FILES)
            || !!dataTransfer.getData(DataTransfers.RESOURCES)
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
    async transferExternalPaths(targetSide, sourcePaths) {
        this.taskbarHiddenForTerminal = false;
        const targetDevice = this.getPaneDevice(targetSide);
        if (!targetDevice) {
            this.statusMessage = '当前目标面板未选择设备，无法接收外部拖入。';
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
        const label = batch ? `拖入 ${sourceItems.length} 项` : `拖入 ${sourceItems[0].name}`;
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
            this.finishTask(task, 'error', batch ? `外部拖入传输完成 ${completed} 项，失败 ${failed} 项。` : `传输失败：${failures[0]}`, { bytes: totalBytes, strategy, error: failures[0] });
            return false;
        }
        const successMessage = batch
            ? `外部拖入传输完成：${completed} 项，${formatSize(totalBytes)}。`
            : `传输完成：${sourceItems[0].name}，策略 ${strategy ?? 'unknown'}，${formatSize(totalBytes)}。`;
        this.finishTask(task, 'success', successMessage, { bytes: totalBytes, strategy });
        return true;
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
            if (options.task) {
                this.updateTask(options.task, `正在传输：${sourceItem.name} -> ${targetDevice.name}`, Math.max(35, options.task.progress));
            }
            const result = await this.sshService.transferFile({
                source: sourceEndpoint,
                target: targetEndpoint,
                sourceType: sourceItem.type,
                overwrite: true,
                progressId
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
                await this.refreshPane(side);
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
        const paths = new Set(items.map(item => item.path).filter((path) => !!path));
        if (!paths.size) {
            return;
        }
        const state = this.paneStates[side];
        state.items = state.items.filter(item => !item.path || !paths.has(item.path));
        this.clearPaneSelection(side);
        this.fileListRenderedRange[side] = undefined;
        const device = this.getPaneDevice(side);
        if (device) {
            this.paneDirectoryCache.delete(this.getPaneDirectoryCacheKey(device, state.path));
        }
        this.render();
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
                await this.refreshPane(side);
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
        this.imageGridState = {
            side,
            path: state.path,
            images,
            selectedIndex,
            columns: 8,
            previewVisible,
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
        this.imageGridPreviewRequestSeq++;
        this.releaseImageGridImagesOutsideRange(state, this.getImageGridVirtualRange(state));
        this.updateImageGridSelection(nextIndex);
        this.updateImagePreviewOverlay();
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
        this.releaseImageGridImagesOutsideRange(this.imageGridState, this.getImageGridVirtualRange(this.imageGridState));
        this.render();
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
            await this.refreshPane(side);
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
            await this.refreshPane(side);
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
    }
    async copyPanePath(side) {
        const device = this.getPaneDevice(side);
        const windowsPath = !!device && this.isWindowsDevice(device);
        const path = this.formatPanePathForDisplay(this.paneStates[side].path, windowsPath);
        await this.clipboardService.writeText(path);
        this.statusMessage = `已复制当前路径：${path}`;
        this.render();
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
            label: device.name
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
        if (drive === 'C') {
            return 'Windows (C:)';
        }
        if (drive === 'D') {
            return 'Data (D:)';
        }
        return `${drive}:`;
    }
    getWindowsLocationIconClass(path) {
        const desktopPath = joinPanePath(this.getLocalWindowsDefaultPath(), 'Desktop', true);
        if (isSameWindowsPath(path, desktopPath)) {
            return 'turbofile-location-icon-desktop';
        }
        const driveRoot = getWindowsDriveRoot(path);
        if (driveRoot?.substring(0, 1).toUpperCase() === 'C') {
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
        if (state.deviceId === device.id) {
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
    ensurePaneDeviceSelection() {
        const devices = this.getAllDevices();
        for (const side of ['left', 'right']) {
            const state = this.paneStates[side];
            if (!devices.some(device => device.id === state.deviceId)) {
                state.deviceId = devices[0].id;
                state.path = devices[0].defaultPath || this.getLocalWindowsDefaultPath();
            }
        }
        if (this.devices[0] && this.paneStates.right.deviceId === LOCAL_WINDOWS_DEVICE_ID) {
            this.paneStates.right.deviceId = this.devices[0].id;
            this.paneStates.right.path = this.devices[0].defaultPath || '/';
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
    __param(8, IInstantiationService),
    __param(9, IEditorService),
    __param(10, ITerminalService),
    __param(11, ITerminalGroupService),
    __param(12, ITerminalProfileService),
    __param(13, IQuickInputService),
    __param(14, IClipboardService),
    __param(15, IConfigurationService),
    __param(16, IWorkbenchLayoutService)
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
function renderFileBrowserIcon(item) {
    if (item.parent) {
        return renderTurboFileIcon('arrow-up-circle', 'primary');
    }
    if (item.directory) {
        return renderTurboFileIcon('folder-fill', 'warning');
    }
    if (isArchiveFile(item.name)) {
        return renderTurboFileIcon('file-earmark-zip', 'primary');
    }
    return renderTurboFileIcon('file-earmark', 'info');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vRDovV29yay9Db2RlL1R1cmJvRmlsZS1XaW5kb3dzL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3R1cmJvZmlsZS9icm93c2VyL3R1cmJvZmlsZUVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyx1QkFBdUIsQ0FBQztBQUMvQixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQWEsU0FBUyxFQUFnQixNQUFNLGlDQUFpQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFakYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFXLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRixPQUFPLEVBQW1GLG9CQUFvQixFQUFrRixNQUFNLG9EQUFvRCxDQUFDO0FBQzNQLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSw2QkFB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