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
