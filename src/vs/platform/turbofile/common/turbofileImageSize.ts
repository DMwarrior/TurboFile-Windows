/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITurboFileImageSize {
	readonly width: number;
	readonly height: number;
}

export function getTurboFileImageSizeFromHeader(data: Uint8Array): ITurboFileImageSize | undefined {
	return getJpegImageSize(data)
		?? getPngImageSize(data)
		?? getGifImageSize(data)
		?? getBmpImageSizeFromHeader(data)
		?? getWebpImageSize(data);
}

function getJpegImageSize(data: Uint8Array): ITurboFileImageSize | undefined {
	if (data.byteLength < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
		return undefined;
	}

	const startOfFrameMarkers = new Set([
		0xc0, 0xc1, 0xc2, 0xc3,
		0xc5, 0xc6, 0xc7,
		0xc9, 0xca, 0xcb,
		0xcd, 0xce, 0xcf
	]);
	let offset = 2;
	while (offset + 1 < data.byteLength) {
		if (data[offset] !== 0xff) {
			offset++;
			continue;
		}
		while (offset < data.byteLength && data[offset] === 0xff) {
			offset++;
		}
		if (offset >= data.byteLength) {
			break;
		}
		const marker = data[offset++];
		if (marker === 0xd8 || marker === 0xd9) {
			continue;
		}
		if (marker === 0xda || offset + 2 > data.byteLength) {
			break;
		}
		const segmentLength = readUint16BE(data, offset);
		offset += 2;
		if (segmentLength < 2) {
			break;
		}
		if (startOfFrameMarkers.has(marker)) {
			if (offset + 5 > data.byteLength) {
				break;
			}
			return positiveSize(readUint16BE(data, offset + 3), readUint16BE(data, offset + 1));
		}
		offset += segmentLength - 2;
	}
	return undefined;
}

function getPngImageSize(data: Uint8Array): ITurboFileImageSize | undefined {
	if (data.byteLength < 24
		|| data[0] !== 0x89
		|| data[1] !== 0x50
		|| data[2] !== 0x4e
		|| data[3] !== 0x47
		|| data[4] !== 0x0d
		|| data[5] !== 0x0a
		|| data[6] !== 0x1a
		|| data[7] !== 0x0a) {
		return undefined;
	}
	return positiveSize(readUint32BE(data, 16), readUint32BE(data, 20));
}

function getGifImageSize(data: Uint8Array): ITurboFileImageSize | undefined {
	if (data.byteLength < 10 || !matchesAscii(data, 0, 'GIF87a') && !matchesAscii(data, 0, 'GIF89a')) {
		return undefined;
	}
	return positiveSize(readUint16LE(data, 6), readUint16LE(data, 8));
}

function getBmpImageSizeFromHeader(data: Uint8Array): ITurboFileImageSize | undefined {
	if (data.byteLength < 26 || data[0] !== 0x42 || data[1] !== 0x4d) {
		return undefined;
	}
	const headerSize = readUint32LE(data, 14);
	if (headerSize === 12) {
		if (data.byteLength < 22) {
			return undefined;
		}
		return positiveSize(readUint16LE(data, 18), readUint16LE(data, 20));
	}
	if (headerSize < 12) {
		return undefined;
	}
	return positiveSize(Math.abs(readInt32LE(data, 18)), Math.abs(readInt32LE(data, 22)));
}

function getWebpImageSize(data: Uint8Array): ITurboFileImageSize | undefined {
	if (data.byteLength < 26 || !matchesAscii(data, 0, 'RIFF') || !matchesAscii(data, 8, 'WEBP')) {
		return undefined;
	}
	if (matchesAscii(data, 12, 'VP8X')) {
		if (data.byteLength < 30) {
			return undefined;
		}
		return positiveSize(readUint24LE(data, 24) + 1, readUint24LE(data, 27) + 1);
	}
	if (matchesAscii(data, 12, 'VP8L')) {
		if (data.byteLength < 25 || data[20] !== 0x2f) {
			return undefined;
		}
		const b0 = data[21];
		const b1 = data[22];
		const b2 = data[23];
		const b3 = data[24];
		const width = 1 + (((b1 & 0x3f) << 8) | b0);
		const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
		return positiveSize(width, height);
	}
	if (!matchesAscii(data, 12, 'VP8 ')) {
		return undefined;
	}
	const chunkStart = 20;
	const searchEnd = Math.min(data.byteLength - 4, chunkStart + 16);
	for (let offset = chunkStart; offset <= searchEnd; offset++) {
		if (data[offset] === 0x9d && data[offset + 1] === 0x01 && data[offset + 2] === 0x2a) {
			return positiveSize(readUint16LE(data, offset + 3) & 0x3fff, readUint16LE(data, offset + 5) & 0x3fff);
		}
	}
	return undefined;
}

function positiveSize(width: number, height: number): ITurboFileImageSize | undefined {
	return width > 0 && height > 0 ? { width, height } : undefined;
}

function matchesAscii(data: Uint8Array, offset: number, text: string): boolean {
	if (offset + text.length > data.byteLength) {
		return false;
	}
	for (let index = 0; index < text.length; index++) {
		if (data[offset + index] !== text.charCodeAt(index)) {
			return false;
		}
	}
	return true;
}

function readUint16BE(data: Uint8Array, offset: number): number {
	return (data[offset] << 8) | data[offset + 1];
}

function readUint16LE(data: Uint8Array, offset: number): number {
	return data[offset] | (data[offset + 1] << 8);
}

function readUint24LE(data: Uint8Array, offset: number): number {
	return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

function readUint32BE(data: Uint8Array, offset: number): number {
	return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function readUint32LE(data: Uint8Array, offset: number): number {
	return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function readInt32LE(data: Uint8Array, offset: number): number {
	return readUint32LE(data, offset) | 0;
}
