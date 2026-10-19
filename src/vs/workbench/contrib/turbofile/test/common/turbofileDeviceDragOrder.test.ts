/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as ts from 'typescript';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { localize } from '../../../../../nls.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TurboFileDeviceStore } from '../../browser/turbofileDeviceStore.js';
import { defaultTurboFileDeviceCapabilities, TurboFileDevice } from '../../common/turbofileTypes.js';

type Listener = (event: TestDragEvent) => void;

class TestEventTarget {
	private readonly listeners = new Map<string, { listener: Listener; capture: boolean }[]>();
	readonly alerts: string[] = [];

	alert(message: string): void {
		this.alerts.push(message);
	}

	addEventListener(type: string, listener: Listener, capture = false): void {
		const entries = this.listeners.get(type) ?? [];
		entries.push({ listener, capture });
		this.listeners.set(type, entries);
	}

	removeEventListener(type: string, listener: Listener, capture = false): void {
		this.listeners.set(type, (this.listeners.get(type) ?? []).filter(entry => entry.listener !== listener || entry.capture !== capture));
	}

	dispatchEvent(event: TestDragEvent): void {
		event.dispatching = true;
		try {
			for (const entry of this.listeners.get(event.type) ?? []) {
				entry.listener(event);
			}
		} finally {
			event.dispatching = false;
		}
	}

	get listenerCount(): number {
		return [...this.listeners.values()].reduce((count, entries) => count + entries.length, 0);
	}
}

class TestElement extends TestEventTarget {
	readonly dataset: { deviceOrderId?: string } = {};
	readonly children: TestElement[] = [];
	readonly classes = new Set<string>();
	readonly classList = {
		add: (...names: string[]): void => { names.forEach(name => this.classes.add(name)); },
		remove: (...names: string[]): void => { names.forEach(name => this.classes.delete(name)); },
		contains: (name: string): boolean => this.classes.has(name),
		toggle: (name: string, force: boolean): void => { if (force) { this.classes.add(name); } else { this.classes.delete(name); } }
	};
	parentElement: TestElement | undefined;
	draggable = false;
	title = '';
	textContent = '';
	rect = { left: 0, top: 0, width: 120, height: 80 };
	readonly tagName: string;

	constructor(readonly ownerWindow: TestEventTarget, selector = 'div') {
		super();
		const [tag, ...classes] = selector.split('.');
		this.tagName = (tag || 'div').toUpperCase();
		this.classList.add(...classes);
	}

	appendChild(child: TestElement): TestElement {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	contains(element: TestElement): boolean {
		return this === element || this.children.some(child => child.contains(element));
	}

	closest(selector: string): TestElement | null {
		if (selector === '[data-device-order-id]' && this.dataset.deviceOrderId) {
			return this;
		}
		if (selector.split(', ').some(tag => tag.toUpperCase() === this.tagName)) {
			return this;
		}
		return this.parentElement?.closest(selector) ?? null;
	}

	getBoundingClientRect(): TestElement['rect'] {
		return this.rect;
	}
}

class TestDataTransfer {
	private readonly data = new Map<string, string>();
	readonly types: string[] = [];
	readonly files: string[] = [];
	effectAllowed = 'uninitialized';
	dropEffect = 'none';

	clearData(): void {
		this.data.clear();
		this.types.length = 0;
	}

	setData(type: string, value: string): void {
		this.data.set(type, value);
		if (!this.types.includes(type)) {
			this.types.push(type);
		}
	}

	getData(type: string): string {
		return this.data.get(type) ?? '';
	}
}

class TestDragEvent {
	defaultPrevented = false;
	stopped = false;
	dispatching = false;

	constructor(readonly type: string, readonly target: TestElement, readonly dataTransfer: TestDataTransfer | null = new TestDataTransfer(), readonly clientX = 0, readonly clientY = 0) { }
	preventDefault(): void { this.defaultPrevented = true; }
	stopPropagation(): void { this.stopped = true; }
}

class TestScheduler implements IDisposable {
	scheduled = false;
	constructor(private readonly callback: () => void) { }
	schedule(): void { this.scheduled = true; }
	flush(): void { if (this.scheduled) { this.scheduled = false; this.callback(); } }
	dispose(): void { this.scheduled = false; }
}

interface IEditorHarness {
	activePage: string;
	isEditorVisible: boolean;
	isDeviceFormVisible: boolean;
	isTaskLogVisible: boolean;
	dialogState: object | undefined;
	container: TestElement;
	devices: TurboFileDevice[];
	deviceOrderDragId: string | undefined;
	deviceOrderDragCard: TestElement | undefined;
	deviceOrderDropTarget: TestElement | undefined;
	deviceOrderDragHorizontal: boolean;
	pendingRenderAfterDeviceOrderDrag: boolean;
	pendingDeviceOrderDrop: { sourceId: string; targetId: string; position: 'before' | 'after' } | undefined;
	deviceOrderWriteInProgress: boolean;
	deviceOrderDropScheduler: TestScheduler;
	renderDisposables: DisposableStore;
	renderCount: number;
	sideEffects: string[];
	paneStates: Record<'left' | 'right', { deviceId: string; path: string; items: string[]; selectedPaths: Set<string> }>;
	getAllDevices(): TurboFileDevice[];
	renderDevicePageCard(device: TurboFileDevice): TestElement;
	registerDeviceOrderChanges(): void;
	registerDeviceOrderDragInterceptor(grid: TestElement): void;
	beginDeviceOrderDrag(card: TestElement, device: TurboFileDevice, event: TestDragEvent): void;
	handleDeviceOrderDragEvent(event: TestDragEvent, grid: TestElement): void;
	finishDeviceOrderDrag(): void;
	render(): void;
}

/** Replay editor drag methods, render guards and the real storage subscription without Electron. */
function createEditorHarness(disposables: Pick<DisposableStore, 'add'>, singleColumn = false, shared?: { storage: InMemoryStorageService; secrets: TestSecretStorageService }) {
	const editorPath = path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
	const source = ts.createSourceFile(editorPath, fs.readFileSync(editorPath, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['beginDeviceOrderDrag', 'registerDeviceOrderDragInterceptor', 'handleDeviceOrderDragEvent', 'clearDeviceOrderDropTarget', 'finishDeviceOrderDrag', 'completeDeviceOrderDrop', 'getAllDevices', 'renderDevicePageCard']);
	const methods: string[] = [];
	let orderSubscription = '';
	let renderGuard = '';
	let dragType = '';
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node)) {
			if (names.has(node.name.getText(source))) {
				methods.push(node.getText(source));
			}
			if (node.name.getText(source) === 'render') {
				renderGuard = node.body?.statements.find(statement => ts.isIfStatement(statement) && statement.expression.getText(source) === 'this.deviceOrderDragId')?.getText(source) ?? '';
			}
		}
		if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(source) === 'this._register') {
			const registration = node.expression.arguments[0];
			if (registration && ts.isCallExpression(registration) && registration.expression.getText(source) === 'this.deviceStore.onDidChangeDeviceOrder') {
				orderSubscription = node.getText(source);
			}
		}
		if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'TURBOFILE_DEVICE_ORDER_DRAG_TYPE' && node.initializer && ts.isStringLiteral(node.initializer)) {
			dragType = node.initializer.text;
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.deepStrictEqual({ methods: methods.length, subscription: !!orderSubscription, guard: !!renderGuard, dragType: !!dragType }, { methods: names.size, subscription: true, guard: true, dragType: true });
	const storage = shared?.storage ?? disposables.add(new InMemoryStorageService());
	const secrets = shared?.secrets ?? disposables.add(new TestSecretStorageService());
	const makeDevice = (id: string): TurboFileDevice => ({ id, name: id, host: '192.0.2.1', port: 22, username: 'test-user', authType: 'password', platform: id === 'local-windows' ? 'windows' : 'linux', capabilities: defaultTurboFileDeviceCapabilities, preferredTransferProtocol: 'auto-fast' });
	if (!shared) {
		storage.store('turbofile.devices', JSON.stringify([makeDevice('server-a'), makeDevice('server-b')]), StorageScope.PROFILE, StorageTarget.MACHINE);
		storage.store('turbofile.transferProtocolDefault.autoFast.v1', 'true', StorageScope.PROFILE, StorageTarget.MACHINE);
	}
	const store = disposables.add(new TurboFileDeviceStore(storage, secrets));
	const lifetime = disposables.add(new DisposableStore());
	const ownerWindow = new TestEventTarget();
	const createElement = (selector = 'div'): TestElement => new TestElement(ownerWindow, selector);
	const code = ts.transpileModule(`class Harness {
		activePage = 'devices'; isEditorVisible = true; isDeviceFormVisible = false; isTaskLogVisible = false;
		dialogState = undefined; container = createElement(); deviceStore = store; devices = store.loadDevices();
		localWindowsDevice = makeDevice('local-windows'); deviceConnectionMessages = new Map();
		deviceOrderDragHorizontal = true; deviceOrderWriteInProgress = false; pendingRenderAfterDeviceOrderDrag = false;
		renderDisposables = this._register(new DisposableStore()); renderCount = 0; sideEffects = [];
		deviceOrderDropScheduler = this._register(new TestScheduler(() => this.completeDeviceOrderDrop()));
		paneStates = { left: { deviceId: 'local-windows', path: 'C:/source', items: ['left-file'], selectedPaths: new Set(['C:/source/left-file']) }, right: { deviceId: 'server-a', path: '/target', items: ['right-file'], selectedPaths: new Set(['/target/right-file']) } };
		_register(disposable) { return lifetime.add(disposable); }
		registerDeviceOrderChanges() { ${orderSubscription} }
		render() { ${renderGuard} this.renderCount++; }
		getDeviceCardTone() { return 0; } renderDevicePageIcon() { return createElement(); }
		getDeviceRuntimeStatus() { return 'online'; } getDeviceRuntimeStatusLabel(status) { return status; }
		renderInfoLine() { return createElement(); } getLocalWindowsDefaultPath() { return 'C:/'; }
		getDeviceTransferProtocolLabel() { return 'auto-fast'; }
		createPageButton(_icon, _label, callback) { const button = createElement('button'); button.addEventListener('click', callback); return button; }
		transferItemsBatch() { this.sideEffects.push('transfer'); }
		testDeviceConnection() { this.sideEffects.push('connection'); } detectAndStoreDeviceCapabilities() { this.sideEffects.push('probe'); }
		refreshPane() { this.sideEffects.push('refresh'); } prewarmCurrentTransferPair() { this.sideEffects.push('prewarm'); }
		invalidatePreparedTransferPair() { this.sideEffects.push('invalidate'); }
		${methods.join('\n')}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IEditorHarness = new Function('Element', '$', 'getWindow', 'TURBOFILE_DEVICE_ORDER_DRAG_TYPE', 'LOCAL_WINDOWS_DEVICE_ID', 'localize', 'Codicon', 'store', 'makeDevice', 'createElement', 'lifetime', 'DisposableStore', 'TestScheduler', `${code}; return Harness;`)(TestElement, createElement, (element: TestElement) => element.ownerWindow, dragType, 'local-windows', localize, { send: 'send', edit: 'edit', trash: 'trash' }, store, makeDevice, createElement, lifetime, DisposableStore, TestScheduler);
	const editor = new Harness();
	editor.registerDeviceOrderChanges();
	const grid = editor.container.appendChild(createElement('.turbofile-device-page-grid'));
	for (const [index, device] of editor.getAllDevices().entries()) {
		const card = grid.appendChild(editor.renderDevicePageCard(device));
		card.rect = { left: singleColumn ? 0 : index % 2 * 140, top: (singleColumn ? index : Math.floor(index / 2)) * 100, width: 120, height: 80 };
	}
	editor.registerDeviceOrderDragInterceptor(grid);
	const reorder = sinon.spy(store, 'reorderDevice');
	const card = (id: string): TestElement => grid.children.find(card => card.dataset.deviceOrderId === id)!;
	const begin = (id: string): TestDataTransfer => {
		const data = new TestDataTransfer();
		const event = new TestDragEvent('dragstart', card(id), data);
		card(id).dispatchEvent(event);
		return data;
	};
	const drag = (type: string, targetId: string, data: TestDataTransfer, half: 'before' | 'after'): TestDragEvent => {
		const target = card(targetId);
		const event = new TestDragEvent(type, target.children[0], data, target.rect.left + (half === 'before' ? 1 : target.rect.width - 1), target.rect.top + (half === 'before' ? 1 : target.rect.height - 1));
		ownerWindow.dispatchEvent(event);
		return event;
	};
	return { editor, grid, card, begin, drag, reorder, ownerWindow, storage, secrets, store, lifetime, dragType };
}

suite('TurboFileDeviceDragOrder', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const singleColumn of [false, true]) {
		for (const half of ['before', 'after'] as const) {
			test(`uses ${singleColumn ? 'upper/lower' : 'left/right'} card halves for a ${half} drop`, () => {
				const harness = createEditorHarness(disposables, singleColumn);
				const sourceId = half === 'before' ? 'server-b' : 'local-windows';
				const data = harness.begin(sourceId);
				const originalPanes = structuredClone(harness.editor.paneStates);
				const over = harness.drag('dragover', 'server-a', data, half);
				assert.deepStrictEqual({ axis: harness.editor.deviceOrderDragHorizontal, intercepted: [over.defaultPrevented, over.stopped], marker: harness.card('server-a').classList.contains(`is-device-order-${half}`), vertical: harness.card('server-a').classList.contains('is-device-order-vertical') }, { axis: !singleColumn, intercepted: [true, true], marker: true, vertical: singleColumn });
				const drop = harness.drag('drop', 'server-a', data, half);
				assert.deepStrictEqual({ calls: harness.reorder.callCount, renders: harness.editor.renderCount, scheduled: harness.editor.deviceOrderDropScheduler.scheduled, dragId: harness.editor.deviceOrderDragId, marker: harness.card('server-a').classList.contains(`is-device-order-${half}`) }, { calls: 0, renders: 0, scheduled: true, dragId: undefined, marker: false });
				harness.editor.deviceOrderDropScheduler.flush();
				assert.deepStrictEqual({ calls: harness.reorder.args, renders: harness.editor.renderCount, order: harness.editor.getAllDevices().map(device => device.id), panes: harness.editor.paneStates, effects: harness.editor.sideEffects, dispatching: drop.dispatching }, { calls: [[sourceId, 'server-a', half]], renders: 1, order: half === 'before' ? ['local-windows', 'server-b', 'server-a'] : ['server-a', 'local-windows', 'server-b'], panes: originalPanes, effects: [], dispatching: false });
			});
		}
	}

	test('keeps action button drags separate from card drags', () => {
		const harness = createEditorHarness(disposables);
		const card = harness.card('server-a');
		const button = card.children[2].children[0];
		card.dispatchEvent(new TestDragEvent('pointerdown', button));
		const blocked = new TestDragEvent('dragstart', card);
		card.dispatchEvent(blocked);
		card.dispatchEvent(new TestDragEvent('pointerdown', card.children[1]));
		const data = harness.begin('server-a');

		assert.deepStrictEqual({ blocked: blocked.defaultPrevented, dragId: harness.editor.deviceOrderDragId, types: data.types, id: data.getData(harness.dragType), effect: data.effectAllowed, draggable: card.draggable }, { blocked: true, dragId: 'server-a', types: [harness.dragType], id: 'server-a', effect: 'move', draggable: true });
	});

	test('does not consume external file or plain text drops', () => {
		const harness = createEditorHarness(disposables);
		const data = new TestDataTransfer();
		data.types.push('Files');
		data.files.push('C:/outside-file.txt');
		data.setData('text/plain', 'server-b');
		const events = ['dragenter', 'dragover', 'drop'].map(type => harness.drag(type, 'server-a', data, 'before'));

		assert.deepStrictEqual({ intercepted: events.map(event => [event.defaultPrevented, event.stopped]), calls: harness.reorder.callCount, scheduled: harness.editor.deviceOrderDropScheduler.scheduled, effect: data.dropEffect }, { intercepted: [[false, false], [false, false], [false, false]], calls: 0, scheduled: false, effect: 'none' });
	});

	test('a drop onto its source never reaches the store', () => {
		const harness = createEditorHarness(disposables);
		const data = harness.begin('server-a');
		harness.drag('drop', 'server-a', data, 'after');
		harness.editor.deviceOrderDropScheduler.flush();

		assert.deepStrictEqual({ calls: harness.reorder.callCount, stored: harness.storage.get('turbofile.deviceOrder', StorageScope.PROFILE), renders: harness.editor.renderCount, dragId: harness.editor.deviceOrderDragId, sourceMarker: harness.card('server-a').classList.contains('is-device-order-dragging') }, { calls: 0, stored: undefined, renders: 0, dragId: undefined, sourceMarker: false });
	});

	test('an already adjacent placement has no persistence or render effect', () => {
		const harness = createEditorHarness(disposables);
		const data = harness.begin('server-a');
		harness.drag('drop', 'server-b', data, 'before');
		harness.editor.deviceOrderDropScheduler.flush();

		assert.deepStrictEqual({ calls: harness.reorder.args, result: harness.reorder.returnValues, stored: harness.storage.get('turbofile.deviceOrder', StorageScope.PROFILE), renders: harness.editor.renderCount }, { calls: [['server-a', 'server-b', 'before']], result: [false], stored: undefined, renders: 0 });
	});

	test('canceling clears both markers and performs a deferred background render once', () => {
		const harness = createEditorHarness(disposables, true);
		const data = harness.begin('server-b');
		harness.drag('dragover', 'server-a', data, 'before');
		harness.editor.render();
		assert.deepStrictEqual({ pending: harness.editor.pendingRenderAfterDeviceOrderDrag, renders: harness.editor.renderCount }, { pending: true, renders: 0 });
		harness.ownerWindow.dispatchEvent(new TestDragEvent('dragend', harness.card('server-b'), data));
		harness.editor.deviceOrderDropScheduler.flush();
		harness.editor.deviceOrderDropScheduler.flush();

		assert.deepStrictEqual({ calls: harness.reorder.callCount, renders: harness.editor.renderCount, pending: harness.editor.pendingRenderAfterDeviceOrderDrag, dragId: harness.editor.deviceOrderDragId, dropTarget: harness.editor.deviceOrderDropTarget, sourceMarker: harness.card('server-b').classList.contains('is-device-order-dragging'), targetMarkers: [...harness.card('server-a').classes].filter(name => name.startsWith('is-device-order-')) }, { calls: 0, renders: 1, pending: false, dragId: undefined, dropTarget: undefined, sourceMarker: false, targetMarkers: [] });
	});

	test('releases all capture listeners when the rendered page is disposed', () => {
		const harness = createEditorHarness(disposables);
		const registered = harness.ownerWindow.listenerCount;
		harness.editor.renderDisposables.clear();
		const data = new TestDataTransfer();
		data.setData(harness.dragType, 'server-b');
		const ignored = harness.drag('drop', 'server-a', data, 'before');

		assert.deepStrictEqual({ registered, remaining: harness.ownerWindow.listenerCount, intercepted: ignored.defaultPrevented, calls: harness.reorder.callCount, scheduled: harness.editor.deviceOrderDropScheduler.scheduled }, { registered: 4, remaining: 0, intercepted: false, calls: 0, scheduled: false });
	});

	test('recovers from a failed storage write and allows a later successful drag', () => {
		const harness = createEditorHarness(disposables);
		const alerts = sinon.spy(harness.ownerWindow, 'alert');
		const storeFailure = sinon.stub(harness.storage, 'store').throws(new Error('Profile storage unavailable'));
		try {
			const data = harness.begin('server-b');
			harness.drag('drop', 'local-windows', data, 'before');
			harness.editor.deviceOrderDropScheduler.flush();
			assert.deepStrictEqual({
				pendingDrop: harness.editor.pendingDeviceOrderDrop,
				pendingRender: harness.editor.pendingRenderAfterDeviceOrderDrag,
				dragId: harness.editor.deviceOrderDragId,
				writing: harness.editor.deviceOrderWriteInProgress,
				order: harness.editor.getAllDevices().map(device => device.id),
				stored: harness.storage.get('turbofile.deviceOrder', StorageScope.PROFILE),
				renders: harness.editor.renderCount,
				alertCount: alerts.callCount,
				alertIncludesCause: harness.ownerWindow.alerts[0]?.includes('Profile storage unavailable')
			}, {
				pendingDrop: undefined,
				pendingRender: false,
				dragId: undefined,
				writing: false,
				order: ['local-windows', 'server-a', 'server-b'],
				stored: undefined,
				renders: 1,
				alertCount: 1,
				alertIncludesCause: true
			});
		} finally {
			storeFailure.restore();
		}
		const retryData = harness.begin('server-b');
		harness.drag('drop', 'local-windows', retryData, 'before');
		harness.editor.deviceOrderDropScheduler.flush();
		assert.deepStrictEqual({ order: harness.editor.getAllDevices().map(device => device.id), alerts: alerts.callCount, renders: harness.editor.renderCount, writing: harness.editor.deviceOrderWriteInProgress, effects: harness.editor.sideEffects }, { order: ['server-b', 'local-windows', 'server-a'], alerts: 1, renders: 2, writing: false, effects: [] });
	});

	test('storage changes update another editor without changing panes or probing devices', () => {
		const first = createEditorHarness(disposables);
		const second = createEditorHarness(disposables, false, first);
		const originalPanes = structuredClone(second.editor.paneStates);
		const data = first.begin('server-b');
		first.drag('drop', 'local-windows', data, 'before');
		first.editor.deviceOrderDropScheduler.flush();

		assert.deepStrictEqual({ order: second.editor.getAllDevices().map(device => device.id), ssh: second.editor.devices.map(device => device.id), renders: [first.editor.renderCount, second.editor.renderCount], panes: second.editor.paneStates, effects: second.editor.sideEffects }, { order: ['server-b', 'local-windows', 'server-a'], ssh: ['server-b', 'server-a'], renders: [1, 1], panes: originalPanes, effects: [] });
	});
});
