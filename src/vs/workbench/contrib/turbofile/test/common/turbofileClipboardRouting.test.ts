/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { localize } from '../../../../../nls.js';
import { getTurboFileImageGridPasteTargetSide } from '../../common/turbofileImageGridClipboard.js';

type PaneSide = 'left' | 'right';

class TestElement {
	readonly dataset: { turbofileSide?: PaneSide };
	isContentEditable = false;

	constructor(readonly surface: string, side?: PaneSide, readonly grid = false) {
		this.dataset = { turbofileSide: side };
	}

	closest(selector: string): TestElement | null {
		if (selector === '.turbofile-pane[data-turbofile-side]' && this.dataset.turbofileSide) {
			return this;
		}
		return selector === '.turbofile-pane-image-grid' && this.grid ? this : null;
	}
}

interface ITestKeyboardEvent {
	key: string;
	code: string;
	target: TestElement;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	defaultPrevented: boolean;
	stopped: boolean;
	preventDefault(): void;
	stopPropagation(): void;
}

interface ITestDevice {
	id: string;
	name: string;
}

interface ITestItem {
	name: string;
	path: string;
}

interface ITestAction {
	id: string;
	enabled: boolean;
	run(): void;
}

interface ITestClipboard {
	sourceSide: PaneSide;
	sourceDevice: ITestDevice;
	sourcePath: string;
	items: ITestItem[];
}

interface ITestTransferContext {
	source: { device: ITestDevice; directoryPath: string };
	target: { device: ITestDevice; directoryPath: string };
}

interface IEditorHarness {
	isEditorVisible: boolean;
	currentInput: object;
	editorService: { activeEditor: object | undefined };
	activeFilePaneSide: PaneSide;
	container: { ownerDocument: { body: TestElement; documentElement: TestElement } };
	devices: Record<PaneSide, ITestDevice>;
	paneStates: Record<PaneSide, { path: string; trashMode: { active: boolean } }>;
	paneImageGridStates: Partial<Record<PaneSide, { side: PaneSide; displayMode: 'pane'; previewVisible: false }>>;
	imageGridState: IEditorHarness['paneImageGridStates'][PaneSide];
	internalTransferClipboard: ITestClipboard | undefined;
	selectedItems: Record<PaneSide, ITestItem[]>;
	pastedSides: PaneSide[];
	transfers: ITestTransferContext[];
	renames: Array<{ source: string; target: string; progressId: string }>;
	disposedSubscriptions: number;
	transferHook?: () => Promise<void>;
	resolveTransferConflictItems(items: ITestItem[]): Promise<ITestItem[]>;
	handleWorkbenchKeydown(event: ITestKeyboardEvent): void;
	pasteInternalTransferClipboard(side: PaneSide): Promise<boolean>;
	getFileContextActions(side: PaneSide, item: ITestItem): ITestAction[];
	getPaneContextActions(side: PaneSide): ITestAction[];
}

/** Replay the actual editor methods while keeping Electron, the DOM and transfer effects isolated. */
function createEditorHarness(surface = 'active'): IEditorHarness {
	const editorPath = path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
	const source = ts.createSourceFile(editorPath, fs.readFileSync(editorPath, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['handleWorkbenchKeydown', 'handlePaneKeyboardShortcut', 'handleImageGridKeyboardShortcut', 'isImageGridSurfaceActive', 'isKeyboardEventFromTurboFileSurface', 'getPaneSideFromElement', 'setActiveFilePaneSide', 'getClipboardShortcutKey', 'isEditableKeyboardTarget', 'copySelectedToInternalClipboard', 'pasteInternalTransferClipboard', 'createTransferContext', 'getFileContextActions', 'getPaneContextActions', 'moveInternalItemsNatively', 'renameTransferItem']);
	const methods: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && names.has(node.name.getText(source))) {
			methods.push(node.getText(source));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.strictEqual(methods.length, names.size);
	const code = ts.transpileModule(`class Harness {
		isEditorVisible = true;
		currentInput = {};
		editorService = { activeEditor: this.currentInput };
		activePage = 'transfer';
		activeFilePaneSide = 'left';
		container = { ownerDocument: document, contains: target => target instanceof HTMLElement && target.surface === surface };
		devices = { left: { id: '62', name: '62' }, right: { id: '64', name: '64' } };
		paneStates = { left: { path: '/source', trashMode: { active: false } }, right: { path: '/target', trashMode: { active: false } } };
		paneImageGridStates = {};
		selectedItems = { left: [{ name: 'a', path: '/source/a' }], right: [{ name: 'b', path: '/target/b' }] };
		pastedSides = [];
		transfers = [];
		renames = [];
		disposedSubscriptions = 0;
		sshService = {
			onDynamicTransferProgress: () => () => ({ dispose: () => this.disposedSubscriptions++ }),
			renamePath: async (source, target, options) => { this.renames.push({ source: source.path, target, progressId: options.progressId }); return { ok: true }; }
		};
		getActiveImageGridPreviewState() { return undefined; }
		getPaneDevice(side) { return this.devices[side]; }
		getSelectedTransferItems(side) { return this.selectedItems[side]; }
		isSameDeviceForNativeOperation(source, target) { return source.id === target.id; }
		menuAction(id, _label, _icon, run, enabled = true) { return { id, run, enabled }; }
		isWindowsDevice() { return false; }
		isSameTransferTarget() { return false; }
		async toTransferEndpoint(_device, path) { return { path }; }
		beginTask() { return { id: 1, kind: 'transfer', status: 'running', progress: 0 }; }
		createTransferTaskItem(item) { return { ...item, totalBytes: 0 }; }
		primeTransferTaskStrategy() { }
		updateTask() { }
		finishTask(task, status) { task.status = status; }
		async removeMovedTrashMetadata() { return []; }
		schedulePostTransferReconcile() { }
		applyOptimisticTransferResult() { }
		refreshTaskbar() { }
		render() { }
		pasteIntoPane(side) { this.pastedSides.push(side); }
		copyImageGridSelectionToInternalClipboard(state, operation) { this.copySelectedToInternalClipboard(state.side, operation, false); }
		createSameDirectoryCopyItems(clipboard) { return clipboard.items; }
		async resolveTransferConflictItems(items) { return items; }
		async transferItemsBatch(_sourceSide, _targetSide, _source, _target, _items, _operation, _time, context) { await this.transferHook?.(); this.transfers.push(context); return true; }
		${methods.join('\n')}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const document = { body: new TestElement('document'), documentElement: new TestElement('document') };
	const Harness: new () => IEditorHarness = new Function('HTMLElement', 'Node', 'document', 'surface', 'getTurboFileImageGridPasteTargetSide', 'localize', 'Codicon', 'isArchiveFile', 'isTurboFileTrashRootView', 'joinPanePath', `${code}; return Harness;`)(TestElement, TestElement, document, surface, getTurboFileImageGridPasteTargetSide, localize, {}, () => false, () => false, (directory: string, name: string) => `${directory}/${name}`);
	return new Harness();
}

function keyboardEvent(key: string, target: TestElement): ITestKeyboardEvent {
	return {
		key, code: key, target, ctrlKey: true, metaKey: false, altKey: false, defaultPrevented: false, stopped: false,
		preventDefault() { this.defaultPrevented = true; },
		stopPropagation() { this.stopped = true; }
	};
}

suite('TurboFileClipboardRouting', () => {
	test('hidden tabs cannot intercept clipboard shortcuts after a render drops focus to body', () => {
		const hidden = createEditorHarness('hidden');
		const active = createEditorHarness();
		hidden.isEditorVisible = false;
		hidden.editorService.activeEditor = active.currentInput;
		active.container.ownerDocument = hidden.container.ownerDocument;
		active.activeFilePaneSide = 'right';
		const event = keyboardEvent('c', hidden.container.ownerDocument.body);
		hidden.handleWorkbenchKeydown(event);
		active.handleWorkbenchKeydown(event);
		assert.deepStrictEqual({ hiddenClipboard: hidden.internalTransferClipboard, activeSource: active.internalTransferClipboard?.sourceDevice.id }, { hiddenClipboard: undefined, activeSource: '64' });
	});

	test('a visible inactive group cannot steal body shortcuts from the active editor', () => {
		const inactive = createEditorHarness();
		inactive.editorService.activeEditor = {};
		const event = keyboardEvent('v', inactive.container.ownerDocument.body);
		inactive.handleWorkbenchKeydown(event);
		assert.deepStrictEqual({ intercepted: event.defaultPrevented, pastedSides: inactive.pastedSides }, { intercepted: false, pastedSides: [] });
	});

	test('the active editor keeps same-side clipboard shortcuts working after list replacement', () => {
		const editor = createEditorHarness();
		editor.activeFilePaneSide = 'right';
		editor.handleWorkbenchKeydown(keyboardEvent('c', editor.container.ownerDocument.body));
		editor.paneStates.right.path = '/target/subdirectory';
		editor.handleWorkbenchKeydown(keyboardEvent('v', editor.container.ownerDocument.body));
		assert.deepStrictEqual({ source: editor.internalTransferClipboard?.sourcePath, device: editor.internalTransferClipboard?.sourceDevice.id, pastedSides: editor.pastedSides }, { source: '/target', device: '64', pastedSides: ['right'] });
	});

	test('editable inputs retain normal text clipboard behavior', () => {
		const editor = createEditorHarness();
		const input = new TestElement('active', 'left');
		input.isContentEditable = true;
		const event = keyboardEvent('v', input);
		editor.handleWorkbenchKeydown(event);
		assert.deepStrictEqual({ intercepted: event.defaultPrevented, pastedSides: editor.pastedSides }, { intercepted: false, pastedSides: [] });
	});

	test('IME Process shortcuts use physical keys while terminal shortcuts remain untouched', () => {
		const editor = createEditorHarness();
		const copy = keyboardEvent('Process', new TestElement('active', 'right'));
		copy.code = 'KeyC';
		editor.handleWorkbenchKeydown(copy);
		const paste = keyboardEvent('Unidentified', new TestElement('active', 'right'));
		paste.code = 'KeyV';
		editor.handleWorkbenchKeydown(paste);
		const terminal = keyboardEvent('v', new TestElement('terminal'));
		editor.handleWorkbenchKeydown(terminal);
		assert.deepStrictEqual({ copied: editor.internalTransferClipboard?.sourceSide, pasted: editor.pastedSides, terminalIntercepted: terminal.defaultPrevented }, { copied: 'right', pasted: ['right'], terminalIntercepted: false });
	});

	test('file menus share the clipboard source and paste follows the same pane after navigation', () => {
		const editor = createEditorHarness();
		const actions = editor.getFileContextActions('right', editor.selectedItems.right[0]);
		actions.find(action => action.id === 'turbofile.copy')!.run();
		editor.paneStates.right.path = '/target/subdirectory';
		editor.getPaneContextActions('right').find(action => action.id === 'turbofile.paste')!.run();
		assert.deepStrictEqual({ source: editor.internalTransferClipboard?.sourcePath, pasted: editor.pastedSides }, { source: '/target', pasted: ['right'] });
	});

	test('one same-host cut retains the native rename overwrite route with a disposed progress subscription', async () => {
		const editor = createEditorHarness();
		editor.handleWorkbenchKeydown(keyboardEvent('x', new TestElement('active', 'right')));
		editor.paneStates.right.path = '/target/subdirectory';
		await editor.pasteInternalTransferClipboard('right');
		assert.deepStrictEqual({ routes: editor.renames.map(rename => ({ source: rename.source, target: rename.target, progress: !!rename.progressId })), batchRoutes: editor.transfers, disposed: editor.disposedSubscriptions, clipboard: editor.internalTransferClipboard }, { routes: [{ source: '/target/b', target: '/target/subdirectory/b', progress: true }], batchRoutes: [], disposed: 1, clipboard: undefined });
	});

	test('Tab focus into the other image grid uses its selection and its paste destination', () => {
		const editor = createEditorHarness();
		editor.paneImageGridStates.left = { side: 'left', displayMode: 'pane', previewVisible: false };
		editor.paneImageGridStates.right = { side: 'right', displayMode: 'pane', previewVisible: false };
		editor.imageGridState = editor.paneImageGridStates.left;
		const target = new TestElement('active', 'right', true);
		editor.handleWorkbenchKeydown(keyboardEvent('c', target));
		editor.handleWorkbenchKeydown(keyboardEvent('v', target));
		assert.deepStrictEqual({ sourceSide: editor.internalTransferClipboard?.sourceSide, items: editor.internalTransferClipboard?.items, pastedSides: editor.pastedSides }, { sourceSide: 'right', items: [{ name: 'b', path: '/target/b' }], pastedSides: ['right'] });
	});

	test('clipboard source and destination stay fixed while a conflict prompt awaits navigation', async () => {
		const editor = createEditorHarness();
		editor.selectedItems.left.push({ name: 'second', path: '/source/second' });
		editor.handleWorkbenchKeydown(keyboardEvent('c', new TestElement('active', 'left')));
		editor.resolveTransferConflictItems = async items => {
			editor.paneStates.right.path = '/different';
			editor.devices.left = { id: 'changed-source', name: 'changed' };
			editor.devices.right = { id: 'changed-target', name: 'changed' };
			return items;
		};
		await editor.pasteInternalTransferClipboard('right');
		assert.deepStrictEqual(editor.transfers.map(context => ({ source: context.source.device.id, sourcePath: context.source.directoryPath, target: context.target.device.id, targetPath: context.target.directoryPath })), [{ source: '62', sourcePath: '/source', target: '64', targetPath: '/target' }]);
	});

	test('finishing a cut cannot erase files copied while the transfer was running', async () => {
		const editor = createEditorHarness();
		editor.selectedItems.left.push({ name: 'second', path: '/source/second' });
		editor.handleWorkbenchKeydown(keyboardEvent('x', new TestElement('active', 'left')));
		editor.transferHook = async () => editor.handleWorkbenchKeydown(keyboardEvent('c', new TestElement('active', 'right')));
		await editor.pasteInternalTransferClipboard('right');
		assert.deepStrictEqual({ sourceSide: editor.internalTransferClipboard?.sourceSide, names: editor.internalTransferClipboard?.items.map(item => item.name) }, { sourceSide: 'right', names: ['b'] });
	});
});
