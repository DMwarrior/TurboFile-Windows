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
        return `${drive}盘`;
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
        const icon = $('span.turbofile-file-theme-icon.monaco-icon-label');
        const resource = item.path ? URI.file(item.path) : undefined;
        const fileKind = item.directory ? FileKind.FOLDER : FileKind.FILE;
        icon.classList.add(...getIconClasses(this.modelService, this.languageService, resource, fileKind));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vRDovV29yay9Db2RlL1R1cmJvRmlsZS1XaW5kb3dzL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3R1cmJvZmlsZS9icm93c2VyL3R1cmJvZmlsZUVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyx1QkFBdUIsQ0FBQztBQUMvQixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQWEsU0FBUyxFQUFnQixNQUFNLGlDQUFpQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFakYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFXLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUFFLGFBQWEsRUFB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