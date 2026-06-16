/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITurboFileReadImageOptions } from '../../../../platform/turbofile/common/turbofile.js';

export function createTurboFileImagePreviewReadOptions(sourceSize: number, sourceModified: number): ITurboFileReadImageOptions {
	return {
		encoding: 'base64',
		forceOriginal: true,
		maxBytes: 128 * 1024 * 1024,
		sourceSize,
		sourceModified
	};
}
