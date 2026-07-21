/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readTurboFileImageDimensions } from './turbofileImageMetadata.js';

export interface ITurboFileParsedImageMetadata {
	readonly path: string;
	readonly size: number;
	readonly modified: number;
	readonly width?: number;
	readonly height?: number;
}

/**
 * Parses a sequence of NUL-delimited metadata fields followed by an exact-length binary header.
 * Header bytes may contain arbitrary zeros, so only the declared length advances to the next frame.
 */
export function parseTurboFileImageMetadataFrames(bytes: Uint8Array): ITurboFileParsedImageMetadata[] {
	const result: ITurboFileParsedImageMetadata[] = [];
	let offset = 0;
	while (offset < bytes.byteLength) {
		const fields: string[] = [];
		for (let fieldIndex = 0; fieldIndex < 6; fieldIndex++) {
			const field = readNullTerminatedField(bytes, offset);
			if (!field) {
				return result;
			}
			fields.push(field.value);
			offset = field.nextOffset;
		}

		const [path, sizeText, modifiedText, widthText, heightText, headerLengthText] = fields;
		const size = Number(sizeText);
		const modifiedSeconds = Number(modifiedText);
		const suppliedWidth = Number(widthText);
		const suppliedHeight = Number(heightText);
		const headerLength = Number(headerLengthText);
		if (!path || !isNonNegativeSafeInteger(size) || !Number.isFinite(modifiedSeconds) || modifiedSeconds < 0 || !isNonNegativeSafeInteger(headerLength) || offset + headerLength > bytes.byteLength) {
			return result;
		}

		const header = bytes.subarray(offset, offset + headerLength);
		offset += headerLength;
		const parsed = isPositiveSafeInteger(suppliedWidth) && isPositiveSafeInteger(suppliedHeight)
			? { width: suppliedWidth, height: suppliedHeight }
			: readTurboFileImageDimensions(path, header);
		result.push({
			path,
			size,
			modified: Math.round(modifiedSeconds * 1000),
			...(parsed ? { width: parsed.width, height: parsed.height } : {})
		});
	}
	return result;
}

function readNullTerminatedField(bytes: Uint8Array, offset: number): { readonly value: string; readonly nextOffset: number } | undefined {
	let end = offset;
	while (end < bytes.byteLength && bytes[end] !== 0) {
		end++;
	}
	if (end >= bytes.byteLength) {
		return undefined;
	}
	return {
		value: new TextDecoder().decode(bytes.subarray(offset, end)),
		nextOffset: end + 1
	};
}

function isPositiveSafeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}
