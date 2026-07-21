/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITurboFileImageDimensions {
	readonly width: number;
	readonly height: number;
}

export function readTurboFileImageDimensions(name: string, bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	const detected = readPngDimensions(bytes)
		?? readJpegDimensions(bytes)
		?? readGifDimensions(bytes)
		?? readBmpDimensions(bytes)
		?? readWebpDimensions(bytes)
		?? readIcoDimensions(bytes)
		?? readTiffDimensions(bytes);
	if (detected) {
		return detected;
	}
	const lowerName = name.toLowerCase();
	return lowerName.endsWith('.avif')
		? readAvifDimensions(bytes)
		: lowerName.endsWith('.svg') ? readSvgDimensions(bytes) : undefined;
}

function dimensions(width: number, height: number): ITurboFileImageDimensions | undefined {
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
		return undefined;
	}
	return { width, height };
}

function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
	if (offset < 0 || offset + expected.length > bytes.length) {
		return false;
	}
	for (let index = 0; index < expected.length; index++) {
		if (bytes[offset + index] !== expected[index]) {
			return false;
		}
	}
	return true;
}

function matchesAscii(bytes: Uint8Array, offset: number, expected: string): boolean {
	if (offset < 0 || offset + expected.length > bytes.length) {
		return false;
	}
	for (let index = 0; index < expected.length; index++) {
		if (bytes[offset + index] !== expected.charCodeAt(index)) {
			return false;
		}
	}
	return true;
}

function dataView(bytes: Uint8Array): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readPngDimensions(bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	if (bytes.length < 24 || !matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || !matchesAscii(bytes, 12, 'IHDR')) {
		return undefined;
	}
	const view = dataView(bytes);
	return dimensions(view.getUint32(16), view.getUint32(20));
}

function readJpegDimensions(bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
		return undefined;
	}

	let offset = 2;
	while (offset + 3 < bytes.length) {
		while (offset < bytes.length && bytes[offset] !== 0xff) {
			offset++;
		}
		while (offset < bytes.length && bytes[offset] === 0xff) {
			offset++;
		}
		if (offset >= bytes.length) {
			return undefined;
		}

		const marker = bytes[offset++];
		if (marker === 0xd8 || marker === 0x01) {
			continue;
		}
		if (marker === 0xd9 || marker === 0xda || offset + 2 > bytes.length) {
			return undefined;
		}

		const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
		if (segmentLength < 2 || offset + segmentLength > bytes.length) {
			return undefined;
		}
		if (isJpegStartOfFrame(marker)) {
			if (segmentLength < 7) {
				return undefined;
			}
			return dimensions(
				(bytes[offset + 5] << 8) | bytes[offset + 6],
				(bytes[offset + 3] << 8) | bytes[offset + 4]
			);
		}
		offset += segmentLength;
	}
	return undefined;
}

function isJpegStartOfFrame(marker: number): boolean {
	return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readGifDimensions(bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	if (bytes.length < 10 || (!matchesAscii(bytes, 0, 'GIF87a') && !matchesAscii(bytes, 0, 'GIF89a'))) {
		return undefined;
	}
	const view = dataView(bytes);
	return dimensions(view.getUint16(6, true), view.getUint16(8, true));
}

function readBmpDimensions(bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	if (bytes.length < 26 || !matchesAscii(bytes, 0, 'BM')) {
		return undefined;
	}
	const view = dataView(bytes);
	const dibSize = view.getUint32(14, true);
	if (dibSize === 12) {
		return dimensions(view.getUint16(18, true), view.getUint16(20, true));
	}
	if (dibSize < 16) {
		return undefined;
	}
	return dimensions(view.getInt32(18, true), Math.abs(view.getInt32(22, true)));
}

function readWebpDimensions(bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	if (bytes.length < 20 || !matchesAscii(bytes, 0, 'RIFF') || !matchesAscii(bytes, 8, 'WEBP')) {
		return undefined;
	}

	if (matchesAscii(bytes, 12, 'VP8X') && bytes.length >= 30) {
		return dimensions(readUint24LE(bytes, 24) + 1, readUint24LE(bytes, 27) + 1);
	}
	if (matchesAscii(bytes, 12, 'VP8L') && bytes.length >= 25 && bytes[20] === 0x2f) {
		const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
		const height = 1 + (bytes[22] >>> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
		return dimensions(width, height);
	}
	if (matchesAscii(bytes, 12, 'VP8 ') && bytes.length >= 30) {
		for (let offset = 20; offset + 6 < bytes.length; offset++) {
			if (matches(bytes, offset, [0x9d, 0x01, 0x2a])) {
				const view = dataView(bytes);
				return dimensions(view.getUint16(offset + 3, true) & 0x3fff, view.getUint16(offset + 5, true) & 0x3fff);
			}
		}
	}
	return undefined;
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
	return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readIcoDimensions(bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	if (bytes.length < 22 || !matches(bytes, 0, [0, 0, 1, 0]) || bytes[4] === 0 && bytes[5] === 0) {
		return undefined;
	}
	const count = dataView(bytes).getUint16(4, true);
	let best: ITurboFileImageDimensions | undefined;
	for (let index = 0; index < count; index++) {
		const offset = 6 + index * 16;
		if (offset + 16 > bytes.length) {
			break;
		}
		const candidate = dimensions(bytes[offset] || 256, bytes[offset + 1] || 256);
		if (candidate && (!best || candidate.width * candidate.height > best.width * best.height)) {
			best = candidate;
		}
	}
	return best;
}

function readTiffDimensions(bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	if (bytes.length < 10) {
		return undefined;
	}
	const littleEndian = matchesAscii(bytes, 0, 'II');
	if (!littleEndian && !matchesAscii(bytes, 0, 'MM')) {
		return undefined;
	}
	const view = dataView(bytes);
	if (view.getUint16(2, littleEndian) !== 42) {
		return undefined;
	}
	const directoryOffset = view.getUint32(4, littleEndian);
	if (directoryOffset + 2 > bytes.length) {
		return undefined;
	}
	const entryCount = view.getUint16(directoryOffset, littleEndian);
	let width: number | undefined;
	let height: number | undefined;
	for (let index = 0; index < entryCount; index++) {
		const offset = directoryOffset + 2 + index * 12;
		if (offset + 12 > bytes.length) {
			break;
		}
		const tag = view.getUint16(offset, littleEndian);
		if (tag !== 256 && tag !== 257) {
			continue;
		}
		const type = view.getUint16(offset + 2, littleEndian);
		const count = view.getUint32(offset + 4, littleEndian);
		if (count !== 1 || (type !== 3 && type !== 4)) {
			continue;
		}
		const value = type === 3 ? view.getUint16(offset + 8, littleEndian) : view.getUint32(offset + 8, littleEndian);
		if (tag === 256) {
			width = value;
		} else {
			height = value;
		}
	}
	return width !== undefined && height !== undefined ? dimensions(width, height) : undefined;
}

function readSvgDimensions(bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	let source: string;
	try {
		source = new TextDecoder().decode(bytes);
	} catch {
		return undefined;
	}
	const match = /<svg\b[^>]*>/i.exec(source);
	if (!match) {
		return undefined;
	}
	const tag = match[0];
	const widthAttribute = readSvgNumberAttribute(tag, 'width');
	const heightAttribute = readSvgNumberAttribute(tag, 'height');
	if ((widthAttribute.value !== undefined && widthAttribute.value <= 0) || (heightAttribute.value !== undefined && heightAttribute.value <= 0)) {
		return undefined;
	}
	if (widthAttribute.value !== undefined && heightAttribute.value !== undefined) {
		return dimensions(widthAttribute.value, heightAttribute.value);
	}
	const viewBox = /\bviewBox\s*=\s*(["'])(.*?)\1/i.exec(tag);
	if (!viewBox) {
		return undefined;
	}
	const values = viewBox[2].trim().split(/[\s,]+/).map(value => Number(value));
	return values.length === 4 ? dimensions(values[2], values[3]) : undefined;
}

function readSvgNumberAttribute(tag: string, name: string): { readonly present: boolean; readonly value: number | undefined } {
	const match = new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag);
	if (!match) {
		return { present: false, value: undefined };
	}
	const raw = match[2].trim();
	if (!raw || raw.endsWith('%')) {
		return { present: true, value: undefined };
	}
	const value = Number.parseFloat(raw);
	return { present: true, value: Number.isFinite(value) ? value : undefined };
}

function readAvifDimensions(bytes: Uint8Array): ITurboFileImageDimensions | undefined {
	let best: ITurboFileImageDimensions | undefined;
	for (let offset = 4; offset + 16 <= bytes.length; offset++) {
		if (!matchesAscii(bytes, offset, 'ispe')) {
			continue;
		}
		const view = dataView(bytes);
		const candidate = dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
		if (candidate && (!best || candidate.width * candidate.height > best.width * best.height)) {
			best = candidate;
		}
	}
	return best;
}
