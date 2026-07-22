/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TurboFileDragOperation } from './turbofileDragDrop.js';

export type TurboFileNativeDragSessionState = 'preparing' | 'dragging' | 'dropped-internal' | 'canceled' | 'failed' | 'completed';

export type TurboFileNativeDragTarget = {
	readonly kind: 'pane';
	readonly side: 'left' | 'right';
	readonly initiatedAt: number;
} | {
	readonly kind: 'directory';
	readonly side: 'left' | 'right';
	readonly path: string;
	readonly label: string;
	readonly initiatedAt: number;
};

export interface TurboFileNativeDragSession<T> {
	readonly id: string;
	readonly sourceSide: 'left' | 'right';
	readonly operation: TurboFileDragOperation;
	readonly items: readonly T[];
	readonly state: TurboFileNativeDragSessionState;
	readonly internalTarget?: TurboFileNativeDragTarget;
}

export interface TurboFileNativeDragPointerPosition {
	readonly clientX: number;
	readonly clientY: number;
	readonly screenX: number;
	readonly screenY: number;
}

export interface TurboFileNativeDragViewportBounds {
	readonly width: number;
	readonly height: number;
}

/**
 * Returns whether Chromium's file drag has left the workbench and must be handed to Windows OLE.
 * Chromium can report every pointer coordinate as zero when a fast drag exits the native window;
 * that event is an exit signal rather than an unusable sample and must not be ignored.
 */
export function shouldHandoffTurboFileDragToWindows(position: TurboFileNativeDragPointerPosition, bounds: TurboFileNativeDragViewportBounds): boolean {
	const hasZeroCoordinates = position.clientX === 0
		&& position.clientY === 0
		&& position.screenX === 0
		&& position.screenY === 0;
	return hasZeroCoordinates
		|| position.clientX <= 0
		|| position.clientY <= 0
		|| position.clientX >= bounds.width - 1
		|| position.clientY >= bounds.height - 1;
}

export function createTurboFileNativeDragSession<T>(id: string, sourceSide: 'left' | 'right', operation: TurboFileDragOperation, items: readonly T[]): TurboFileNativeDragSession<T> {
	return {
		id,
		sourceSide,
		operation,
		items: Object.freeze([...items]),
		state: 'preparing'
	};
}

export function startTurboFileNativeDragSession<T>(session: TurboFileNativeDragSession<T>): TurboFileNativeDragSession<T> {
	return session.state === 'preparing' ? { ...session, state: 'dragging' } : session;
}

export function dropTurboFileNativeDragSessionInternally<T>(session: TurboFileNativeDragSession<T>, target: TurboFileNativeDragTarget): TurboFileNativeDragSession<T> {
	return session.state === 'dragging' ? { ...session, state: 'dropped-internal', internalTarget: target } : session;
}

export function settleTurboFileNativeDragSession<T>(session: TurboFileNativeDragSession<T>, state: Extract<TurboFileNativeDragSessionState, 'canceled' | 'failed' | 'completed'>): TurboFileNativeDragSession<T> {
	return session.state === 'dragging' || session.state === 'dropped-internal' ? { ...session, state } : session;
}
