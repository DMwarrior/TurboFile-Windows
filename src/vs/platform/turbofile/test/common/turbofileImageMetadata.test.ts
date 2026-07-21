/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { readTurboFileImageDimensions } from '../../common/turbofileImageMetadata.js';

suite('TurboFileImageMetadata', () => {
	test('reads PNG, JPEG, GIF, and BMP dimensions from finite headers', () => {
		assert.deepStrictEqual(readTurboFileImageDimensions('a.png', pngHeader(1920, 1080)), { width: 1920, height: 1080 });
		assert.deepStrictEqual(readTurboFileImageDimensions('a.jpg', jpegHeader(4032, 3024)), { width: 4032, height: 3024 });
		assert.deepStrictEqual(readTurboFileImageDimensions('a.gif', gifHeader(640, 360)), { width: 640, height: 360 });
		assert.deepStrictEqual(readTurboFileImageDimensions('a.bmp', bmpHeader(800, 600)), { width: 800, height: 600 });
	});

	test('reads WebP and ICO dimensions without decoding image pixels', () => {
		assert.deepStrictEqual(readTurboFileImageDimensions('a.webp', webpExtendedHeader(3840, 2160)), { width: 3840, height: 2160 });
		assert.deepStrictEqual(readTurboFileImageDimensions('lossless.webp', webpLosslessHeader(1024, 768)), { width: 1024, height: 768 });
		assert.deepStrictEqual(readTurboFileImageDimensions('lossy.webp', webpLossyHeader(1280, 720)), { width: 1280, height: 720 });
		assert.deepStrictEqual(readTurboFileImageDimensions('a.ico', icoHeader(256, 128)), { width: 256, height: 128 });
		assert.deepStrictEqual(readTurboFileImageDimensions('multi.ico', multiIcoHeader()), { width: 256, height: 256 });
	});

	test('reads TIFF, SVG, and AVIF metadata containers', () => {
		assert.deepStrictEqual(readTurboFileImageDimensions('a.tiff', tiffHeader(1200, 900)), { width: 1200, height: 900 });
		assert.deepStrictEqual(readTurboFileImageDimensions('a.svg', new TextEncoder().encode('<svg viewBox="0 0 1600 900"></svg>')), { width: 1600, height: 900 });
		assert.deepStrictEqual(readTurboFileImageDimensions('percent.svg', new TextEncoder().encode('<svg width="100%" height="100%" viewBox="0 0 800 600"></svg>')), { width: 800, height: 600 });
		assert.deepStrictEqual(readTurboFileImageDimensions('prefixed.svg', new TextEncoder().encode('<svg data-width="12" data-height="34" viewBox="0 0 640 480"></svg>')), { width: 640, height: 480 });
		assert.deepStrictEqual(readTurboFileImageDimensions('a.avif', avifHeader(2560, 1440)), { width: 2560, height: 1440 });
	});

	test('rejects truncated, corrupt, and zero-sized metadata', () => {
		assert.strictEqual(readTurboFileImageDimensions('bad.png', new Uint8Array([1, 2, 3])), undefined);
		assert.strictEqual(readTurboFileImageDimensions('bad.jpg', new Uint8Array([0xff, 0xd8, 0xff])), undefined);
		assert.strictEqual(readTurboFileImageDimensions('bad.svg', new TextEncoder().encode('<svg width="0" height="20"></svg>')), undefined);
	});
});

function pngHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(24);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
	bytes.set([0x49, 0x48, 0x44, 0x52], 12);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
}

function jpegHeader(width: number, height: number): Uint8Array {
	return new Uint8Array([
		0xff, 0xd8,
		0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
		0xff, 0xc0, 0x00, 0x07, 0x08,
		(height >>> 8) & 0xff, height & 0xff,
		(width >>> 8) & 0xff, width & 0xff,
		0xff, 0xd9
	]);
}

function gifHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(10);
	bytes.set(new TextEncoder().encode('GIF89a'));
	const view = new DataView(bytes.buffer);
	view.setUint16(6, width, true);
	view.setUint16(8, height, true);
	return bytes;
}

function bmpHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(30);
	bytes.set([0x42, 0x4d]);
	const view = new DataView(bytes.buffer);
	view.setUint32(14, 40, true);
	view.setInt32(18, width, true);
	view.setInt32(22, height, true);
	return bytes;
}

function webpExtendedHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(30);
	bytes.set(new TextEncoder().encode('RIFF'), 0);
	bytes.set(new TextEncoder().encode('WEBP'), 8);
	bytes.set(new TextEncoder().encode('VP8X'), 12);
	writeUint24LE(bytes, 24, width - 1);
	writeUint24LE(bytes, 27, height - 1);
	return bytes;
}

function webpLosslessHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(25);
	bytes.set(new TextEncoder().encode('RIFF'), 0);
	bytes.set(new TextEncoder().encode('WEBP'), 8);
	bytes.set(new TextEncoder().encode('VP8L'), 12);
	bytes[20] = 0x2f;
	const encodedWidth = width - 1;
	const encodedHeight = height - 1;
	bytes[21] = encodedWidth & 0xff;
	bytes[22] = ((encodedWidth >>> 8) & 0x3f) | ((encodedHeight & 0x03) << 6);
	bytes[23] = (encodedHeight >>> 2) & 0xff;
	bytes[24] = (encodedHeight >>> 10) & 0x0f;
	return bytes;
}

function webpLossyHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(30);
	bytes.set(new TextEncoder().encode('RIFF'), 0);
	bytes.set(new TextEncoder().encode('WEBP'), 8);
	bytes.set(new TextEncoder().encode('VP8 '), 12);
	bytes.set([0x9d, 0x01, 0x2a], 20);
	const view = new DataView(bytes.buffer);
	view.setUint16(23, width, true);
	view.setUint16(25, height, true);
	return bytes;
}

function icoHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(22);
	bytes.set([0, 0, 1, 0, 1, 0, width === 256 ? 0 : width, height === 256 ? 0 : height]);
	return bytes;
}

function multiIcoHeader(): Uint8Array {
	const bytes = new Uint8Array(38);
	bytes.set([0, 0, 1, 0, 2, 0]);
	bytes.set([32, 32], 6);
	bytes.set([0, 0], 22);
	return bytes;
}

function tiffHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(38);
	bytes.set([0x49, 0x49, 42, 0]);
	const view = new DataView(bytes.buffer);
	view.setUint32(4, 8, true);
	view.setUint16(8, 2, true);
	writeTiffLongEntry(view, 10, 256, width);
	writeTiffLongEntry(view, 22, 257, height);
	return bytes;
}

function avifHeader(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(20);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, 20);
	bytes.set(new TextEncoder().encode('ispe'), 4);
	view.setUint32(12, width);
	view.setUint32(16, height);
	return bytes;
}

function writeUint24LE(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = value & 0xff;
	bytes[offset + 1] = (value >>> 8) & 0xff;
	bytes[offset + 2] = (value >>> 16) & 0xff;
}

function writeTiffLongEntry(view: DataView, offset: number, tag: number, value: number): void {
	view.setUint16(offset, tag, true);
	view.setUint16(offset + 2, 4, true);
	view.setUint32(offset + 4, 1, true);
	view.setUint32(offset + 8, value, true);
}
