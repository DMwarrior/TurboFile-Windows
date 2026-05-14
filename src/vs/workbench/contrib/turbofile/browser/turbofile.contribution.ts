/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../browser/editor.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { WorkbenchPhase, registerWorkbenchContribution2, IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainer, ViewContainerLocation, IViewDescriptorService } from '../../../common/views.js';
import { TurboFileEditorInput } from '../common/turbofileEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { TurboFileEditor } from './turbofileEditor.js';
import { turboFileWorkbenchBridge, TurboFileWorkbenchPage } from './turbofileWorkbenchBridge.js';

interface TurboFileActivityEntry {
	readonly containerId: string;
	readonly viewId: string;
	readonly title: ReturnType<typeof localize2>;
	readonly viewName: ReturnType<typeof localize2>;
	readonly page: TurboFileWorkbenchPage;
	readonly icon: ThemeIcon;
	readonly appearanceIcon?: boolean;
	readonly order: number;
}

const TURBOFILE_ACTIVITY_ENTRIES: TurboFileActivityEntry[] = [
	{
		containerId: 'workbench.view.turbofile.transfer',
		viewId: 'workbench.view.turbofile.transfer.route',
		title: localize2('turbofile.transferContainer', '传输'),
		viewName: localize2('turbofile.transferView', '传输页面'),
		page: 'transfer',
		icon: Codicon.remoteExplorer,
		order: 0
	},
	{
		containerId: 'workbench.view.turbofile.devicesContainer',
		viewId: 'workbench.view.turbofile.devices.route',
		title: localize2('turbofile.devicesContainer', '设备'),
		viewName: localize2('turbofile.devicesView', '设备管理'),
		page: 'devices',
		icon: Codicon.server,
		order: 1
	},
	{
		containerId: 'workbench.view.turbofile.themesContainer',
		viewId: 'workbench.view.turbofile.themes.route',
		title: localize2('turbofile.themesContainer', '外观'),
		viewName: localize2('turbofile.themesView', '外观设置'),
		page: 'themes',
		icon: Codicon.colorMode,
		appearanceIcon: true,
		order: 2
	},
	{
		containerId: 'workbench.view.turbofile.settingsContainer',
		viewId: 'workbench.view.turbofile.settings.route',
		title: localize2('turbofile.settingsContainer', '设置'),
		viewName: localize2('turbofile.settingsView', '系统设置'),
		page: 'settings',
		icon: Codicon.settingsGear,
		order: 3
	},
	{
		containerId: 'workbench.view.turbofile.tasksContainer',
		viewId: 'workbench.view.turbofile.tasks.route',
		title: localize2('turbofile.tasksContainer', '任务日志'),
		viewName: localize2('turbofile.tasksView', '任务日志'),
		page: 'tasks',
		icon: Codicon.history,
		order: 4
	}
];

const TURBOFILE_NAV_COLLAPSED_WIDTH = 48;
const TURBOFILE_NAV_EXPANDED_WIDTH = 214;

let turboFileActivePage: TurboFileWorkbenchPage = 'transfer';
let turboFileNavigationExpanded = false;

function renderTurboFileAppearanceNavIcon(): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('turbofile-nav-sun-icon');
	const paths = [
		'M12 2.75V5.1',
		'M12 18.9v2.35',
		'M4.64 4.64l1.66 1.66',
		'M17.7 17.7l1.66 1.66',
		'M2.75 12H5.1',
		'M18.9 12h2.35',
		'M4.64 19.36l1.66-1.66',
		'M17.7 6.3l1.66-1.66'
	];
	for (const d of paths) {
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

class TurboFileRouteView extends ViewPane {
	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		clearNode(container);
	}
}

class TurboFileStartupContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.turbofile.startup';
	private isOpeningTurboFilePage = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IViewsService private readonly viewsService: IViewsService
	) {
		super();
		document.body.classList.add('turbofile-shell');
		this.configureShell();
		this.renderNavigation();
		void this.openTurboFilePage('transfer', true);
		setTimeout(() => {
			void this.openTurboFilePage('transfer', true);
		}, 250);

		this._register(viewsService.onDidChangeViewContainerVisibility(event => {
			if (!event.visible) {
				return;
			}
			const entry = TURBOFILE_ACTIVITY_ENTRIES.find(candidate => candidate.containerId === event.id);
			if (entry) {
				if (!this.isOpeningTurboFilePage) {
					void this.openTurboFilePage(entry.page, false);
				}
			}
		}));
		this._register(turboFileWorkbenchBridge.onDidRunCommand(command => {
			if (command.type === 'showPage') {
				turboFileActivePage = command.page;
				this.renderNavigation();
			}
		}));
	}

	private configureShell(): void {
		if (this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
			this.layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
		}
		if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		}
		this.resizeTurboFileSideBar();
		this.layoutService.setPartHidden(false, Parts.STATUSBAR_PART);
		this.layoutService.layout();
		this.renderNavigation();
	}

	private async openTurboFilePage(page: TurboFileWorkbenchPage, _hideSideBar: boolean): Promise<void> {
		this.isOpeningTurboFilePage = true;
		try {
			await this.openOrRevealTurboFileEditor();
			await this.viewsService.openViewContainer(TURBOFILE_ACTIVITY_ENTRIES[0].containerId, false);
			turboFileActivePage = page;
			turboFileWorkbenchBridge.run({ type: 'showPage', page });
			if (this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
				this.layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
			}
			if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
				this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
			}
			this.resizeTurboFileSideBar();
			this.layoutService.layout();
			this.renderNavigation();
		} finally {
			this.isOpeningTurboFilePage = false;
		}
	}

	private async openOrRevealTurboFileEditor(): Promise<void> {
		const existingTurboFileEditor = this.editorService.findEditors(TurboFileEditorInput.RESOURCE)
			.find(identifier => identifier.editor instanceof TurboFileEditorInput);
		await this.editorService.openEditor(existingTurboFileEditor?.editor ?? new TurboFileEditorInput(), { pinned: true });
	}

	private resizeTurboFileSideBar(): void {
		const currentSize = this.layoutService.getSize(Parts.SIDEBAR_PART);
		this.layoutService.setSize(Parts.SIDEBAR_PART, {
			width: turboFileNavigationExpanded ? TURBOFILE_NAV_EXPANDED_WIDTH : TURBOFILE_NAV_COLLAPSED_WIDTH,
			height: currentSize.height
		});
	}

	private renderNavigation(retry = 0): void {
		const sideBar = document.querySelector<HTMLElement>('.part.sidebar');
		if (!sideBar) {
			if (retry < 10) {
				setTimeout(() => this.renderNavigation(retry + 1), 100);
			}
			return;
		}

		for (const existing of Array.from(sideBar.children)) {
			if (existing.classList.contains('turbofile-page-nav')) {
				existing.remove();
			}
		}

		const nav = $('nav.turbofile-page-nav.turbofile-app-nav');
		nav.setAttribute('aria-label', '极速传 页面导航');
		if (turboFileNavigationExpanded) {
			nav.classList.add('is-nav-expanded');
		}

		const list = $('.turbofile-page-nav-list');
		for (const entry of TURBOFILE_ACTIVITY_ENTRIES) {
			const button = $('button.turbofile-page-nav-item') as HTMLButtonElement;
			button.type = 'button';
			button.title = `打开${entry.title.value}`;
			if (turboFileActivePage === entry.page) {
				button.classList.add('is-active');
				button.setAttribute('aria-current', 'page');
			}
			button.appendChild(entry.appearanceIcon ? renderTurboFileAppearanceNavIcon() : renderIcon(entry.icon));
			const label = $('span.turbofile-page-nav-label');
			label.textContent = entry.title.value;
			button.appendChild(label);
			button.addEventListener('click', () => {
				void this.openTurboFilePage(entry.page, false);
			});
			list.appendChild(button);
		}
		nav.appendChild(list);

		const toggle = $('button.turbofile-page-nav-toggle') as HTMLButtonElement;
		toggle.type = 'button';
		toggle.title = turboFileNavigationExpanded ? '收起侧边栏' : '展开侧边栏';
		toggle.appendChild(renderIcon(turboFileNavigationExpanded ? Codicon.chevronLeft : Codicon.chevronRight));
		const toggleText = $('span.turbofile-page-nav-label');
		toggleText.textContent = turboFileNavigationExpanded ? '收起侧边栏' : '展开侧边栏';
		toggle.appendChild(toggleText);
		toggle.addEventListener('click', () => {
			turboFileNavigationExpanded = !turboFileNavigationExpanded;
			this.resizeTurboFileSideBar();
			this.layoutService.layout();
			this.renderNavigation();
		});
		nav.appendChild(toggle);

		sideBar.appendChild(nav);
	}
}

class OpenTurboFileAction extends Action2 {
	constructor() {
		super({
			id: 'turbofile.open',
			title: localize2('openTurboFile', '打开 极速传'),
			category: localize2('turboFileCategory', '极速传'),
			f1: true,
			icon: Codicon.remoteExplorer,
			menu: {
				id: MenuId.MenubarHomeMenu,
				group: '1_turbofile',
				order: 1
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const existingTurboFileEditor = editorService.findEditors(TurboFileEditorInput.RESOURCE)
			.find(identifier => identifier.editor instanceof TurboFileEditorInput);
		await editorService.openEditor(existingTurboFileEditor?.editor ?? new TurboFileEditorInput(), { pinned: true });
		turboFileWorkbenchBridge.run({ type: 'showPage', page: 'transfer' });
	}
}

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		TurboFileEditor,
		TurboFileEditor.ID,
		localize('turbofile.editor', '极速传')
	),
	[
		new SyncDescriptor(TurboFileEditorInput)
	]
);

function registerTurboFileViewContainer(entry: TurboFileActivityEntry): ViewContainer {
	return Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
		id: entry.containerId,
		title: entry.title,
		openCommandActionDescriptor: { id: entry.containerId, title: entry.title, order: entry.order },
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [entry.containerId, { mergeViewWithContainerWhenSingleView: true }]),
		icon: entry.icon,
		alwaysUseContainerInfo: true,
		order: entry.order
	}, ViewContainerLocation.Sidebar);
}

for (const entry of TURBOFILE_ACTIVITY_ENTRIES) {
	const container = registerTurboFileViewContainer(entry);
	Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([
		{
			id: entry.viewId,
			name: entry.viewName,
			containerIcon: entry.icon,
			ctorDescriptor: new SyncDescriptor(TurboFileRouteView),
			order: 10,
			weight: 100,
			canToggleVisibility: false,
			canMoveView: false
		}
	], container);
}

registerAction2(OpenTurboFileAction);
registerWorkbenchContribution2(TurboFileStartupContribution.ID, TurboFileStartupContribution, WorkbenchPhase.AfterRestored);
