/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTurboFileNativeDragSession, dropTurboFileNativeDragSessionInternally, settleTurboFileNativeDragSession, shouldHandoffTurboFileDragToWindows, startTurboFileNativeDragSession } from '../../common/turbofileNativeDragSession.js';

suite('TurboFileNativeDragSession', () => {
	test('freezes the source snapshot and follows the native drag lifecycle', () => {
		const items = [{ path: '/source/a.txt', name: 'a.txt' }];
		const prepared = createTurboFileNativeDragSession('session-1', 'left', 'copy', items);
		items.push({ path: '/source/b.txt', name: 'b.txt' });
		const dragging = startTurboFileNativeDragSession(prepared);
		const dropped = dropTurboFileNativeDragSessionInternally(dragging, { kind: 'pane', side: 'right', initiatedAt: 42 });
		const completed = settleTurboFileNativeDragSession(dropped, 'completed');

		assert.deepStrictEqual({
			preparedState: prepared.state,
			frozenItems: prepared.items,
			allowWindowsHandoff: prepared.allowWindowsHandoff,
			draggingState: dragging.state,
			droppedState: dropped.state,
			target: dropped.internalTarget,
			completedState: completed.state
		}, {
			preparedState: 'preparing',
			frozenItems: [{ path: '/source/a.txt', name: 'a.txt' }],
			allowWindowsHandoff: true,
			draggingState: 'dragging',
			droppedState: 'dropped-internal',
			target: { kind: 'pane', side: 'right', initiatedAt: 42 },
			completedState: 'completed'
		});
	});

	test('can lock image-grid sessions to internal pane drops', () => {
		const session = createTurboFileNativeDragSession('grid-session', 'left', 'copy', [{ path: '/source/a.png', name: 'a.png' }], false);
		assert.strictEqual(session.allowWindowsHandoff, false);
	});

	test('keeps the first internal target and ignores invalid late transitions', () => {
		const prepared = createTurboFileNativeDragSession('session-2', 'right', 'move', [{ path: '/source/folder', name: 'folder' }]);
		const invalidDrop = dropTurboFileNativeDragSessionInternally(prepared, { kind: 'pane', side: 'left', initiatedAt: 1 });
		const dragging = startTurboFileNativeDragSession(prepared);
		const firstDrop = dropTurboFileNativeDragSessionInternally(dragging, { kind: 'directory', side: 'right', path: '/target', label: 'target', initiatedAt: 2 });
		const lateDrop = dropTurboFileNativeDragSessionInternally(firstDrop, { kind: 'pane', side: 'left', initiatedAt: 3 });
		const invalidSettle = settleTurboFileNativeDragSession(prepared, 'completed');

		assert.deepStrictEqual({
			invalidDropIsOriginal: invalidDrop === prepared,
			firstDrop,
			lateDropIsFirst: lateDrop === firstDrop,
			invalidSettleIsOriginal: invalidSettle === prepared
		}, {
			invalidDropIsOriginal: true,
			firstDrop: {
				...dragging,
				state: 'dropped-internal',
				internalTarget: { kind: 'directory', side: 'right', path: '/target', label: 'target', initiatedAt: 2 }
			},
			lateDropIsFirst: true,
			invalidSettleIsOriginal: true
		});
	});

	test('settles a dragging session only into a terminal state', () => {
		const dragging = startTurboFileNativeDragSession(createTurboFileNativeDragSession('session-3', 'left', 'copy', []));

		assert.deepStrictEqual([
			settleTurboFileNativeDragSession(dragging, 'canceled').state,
			settleTurboFileNativeDragSession(dragging, 'failed').state,
			settleTurboFileNativeDragSession(dragging, 'completed').state
		], ['canceled', 'failed', 'completed']);
	});

	test('ignores Chromium zero-coordinate samples but hands real boundary exits to Windows', () => {
		const bounds = { width: 1920, height: 1080 };

		assert.deepStrictEqual({
			inside: shouldHandoffTurboFileDragToWindows({ clientX: 960, clientY: 540, screenX: 960, screenY: 540 }, bounds),
			zeroCoordinates: shouldHandoffTurboFileDragToWindows({ clientX: 0, clientY: 0, screenX: 0, screenY: 0 }, bounds),
			leftBoundary: shouldHandoffTurboFileDragToWindows({ clientX: 0, clientY: 540, screenX: 100, screenY: 540 }, bounds),
			rightBoundary: shouldHandoffTurboFileDragToWindows({ clientX: 1919, clientY: 540, screenX: 2019, screenY: 540 }, bounds)
		}, {
			inside: false,
			zeroCoordinates: false,
			leftBoundary: true,
			rightBoundary: true
		});
	});
});
