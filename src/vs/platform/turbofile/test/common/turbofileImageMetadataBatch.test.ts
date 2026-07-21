/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parseTurboFileImageMetadataFrames } from '../../common/turbofileImageMetadataBatch.js';

suite('TurboFileImageMetadataBatch', () => {
	test('parses multiple length-framed headers without confusing binary zero bytes for separators', () => {
		const png = pngHeader(1920, 1080);
		const jpeg = jpegHeader(800, 600);
		const result = parseTurboFileImageMetadataFrames(concat(
			frame('/photos/a.png', 4321, 1710000000, 0, 0, png),
			frame('/photos/b.jpg', 9876, 1720000000, 0, 0, jpeg)
		));

		assert.deepStrictEqual(result, [
			{ path: '/photos/a.png', size: 4321, modified: 1710000000000, width: 1920, height: 1080 },
			{ path: '/photos/b.jpg', size: 9876, modified: 1720000000000, width: 800, height: 600 }
		]);
	});

	test('prefers dimensions supplied by a remote metadata tool', () => {
		assert.deepStrictEqual(parseTurboFileImageMetadataFrames(frame('/photos/a.tiff', 123, 1700000000, 6000, 4000, new Uint8Array())), [
			{ path: '/photos/a.tiff', size: 123, modified: 1700000000000, width: 6000, height: 4000 }
		]);
	});

	test('keeps stat metadata when dimensions are unknown and ignores a truncated frame', () => {
		const complete = frame('/photos/a.raw', 10, 1700000000, 0, 0, new Uint8Array([1, 2, 3]));
		const truncated = frame('/photos/b.png', 20, 1700000001, 0, 0, pngHeader(10, 20)).subarray(0, -2);
		assert.deepStrictEqual(parseTurboFileImageMetadataFrames(concat(complete, truncated)), [
			{ path: '/photos/a.raw', size: 10, modified: 1700000000000 }
		]);
	});
});

function frame(path: string, size: number, modifiedSeconds: number, width: number, height: number, header: Uint8Array): Uint8Array {
	return concat(new TextEncoder().encode(`${path}\0${size}\0${modifiedSeconds}\0${width}\0${height}\0${header.byteLength}\0`), header);
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
	const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.byteLength;
	}
	return result;
}

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
		0xff, 0xc0, 0x00, 0x07, 0x08,
		(height >>> 8) & 0xff, height & 0xff,
		(width >>> 8) & 0xff, width & 0xff
	]);
}
