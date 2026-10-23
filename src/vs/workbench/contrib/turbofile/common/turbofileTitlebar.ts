/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { State, StateType } from '../../../../platform/update/common/update.js';

export type TurboFileTitlebarUpdateActionKind = 'hidden' | 'checking' | 'download' | 'downloading' | 'install' | 'installing' | 'restart';

export function getTurboFileUpdateDownloadPercent(state: State): string | undefined {
	if (state.type !== StateType.Downloading || typeof state.downloadedBytes !== 'number' || !Number.isFinite(state.downloadedBytes) || typeof state.totalBytes !== 'number' || !Number.isFinite(state.totalBytes) || state.totalBytes <= 0) {
		return undefined;
	}
	const percent = Math.max(0, Math.min(100, state.downloadedBytes / state.totalBytes * 100));
	return `${(state.downloadedBytes < state.totalBytes ? Math.min(99.9, percent) : percent).toFixed(1)}%`;
}

export function getTurboFileTitlebarUpdateActionKind(state: State): TurboFileTitlebarUpdateActionKind {
	switch (state.type) {
		case StateType.CheckingForUpdates:
			return 'hidden';
		case StateType.AvailableForDownload:
			return 'download';
		case StateType.Downloading:
			return 'downloading';
		case StateType.Downloaded:
			return 'install';
		case StateType.Updating:
		case StateType.Overwriting:
			return 'installing';
		case StateType.Ready:
			return 'restart';
		default:
			return 'hidden';
	}
}
