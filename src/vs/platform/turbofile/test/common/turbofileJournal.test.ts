/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ITurboFileJournalWrite, normalizeTurboFileJournalWrite, sanitizeTurboFileJournalText, TurboFileJournalBuffer, TURBOFILE_JOURNAL_QUEUE_BYTES, TURBOFILE_JOURNAL_RECORD_BYTES } from '../../common/turbofileJournal.js';

function fixture(id = 'fixture', status: ITurboFileJournalWrite['record']['status'] = 'running'): ITurboFileJournalWrite {
	return { record: { id, kind: 'copy', status, startedAt: Date.now(), sourceDevice: 'Source', targetDevice: 'Target', sourcePath: '/source', targetPath: '/target', itemCount: 1 } };
}

suite('TurboFile summary journal buffer', () => {
	test('keeps only card fields and redacts credentials in a short failure reason', () => {
		const initial = fixture('failed', 'error');
		const write = { ...initial, record: { ...initial.record, password: 'secret-record', error: 'password=hunter token: abc', message: 'unused-output', transitions: ['unused-protocol-trace'] }, items: [{ source: 'unused-item' }], privateKey: 'secret-key' };
		const serialized = JSON.stringify(normalizeTurboFileJournalWrite(write));
		assert.deepStrictEqual(['hunter', 'abc', 'secret-record', 'secret-key', 'unused-output', 'unused-protocol-trace', 'unused-item', 'transitions', 'items'].filter(secret => serialized.includes(secret)), []);
	});

	test('does not inspect or allocate a selected-file list', () => {
		const write = { ...fixture(), get items(): never { throw new Error('must not read item detail'); } };
		assert.strictEqual(normalizeTurboFileJournalWrite(write)!.record.itemCount, 1);
	});

	test('redacts JSON, URL, bearer and private-key diagnostics', () => {
		const result = sanitizeTurboFileJournalText('"password":"hunter" https://user:secret@host Bearer eyJ.abc -----BEGIN OPENSSH PRIVATE KEY-----\nprivate-data');
		assert.deepStrictEqual(['hunter', ':secret@', 'eyJ.abc', 'private-data'].filter(secret => result.includes(secret)), []);
	});

	test('coalesces task start and result into one summary', () => {
		const queue = new TurboFileJournalBuffer(); const initial = fixture(); queue.enqueue(initial);
		queue.enqueue({ record: { ...initial.record, status: 'success', bytes: 123 } });
		const result = queue.shift()!;
		assert.deepStrictEqual([result.record.status, result.record.bytes, queue.byteLength, queue.size], ['success', 123, 0, 0]);
	});

	test('bounds multibyte paths and failure text', () => {
		const queue = new TurboFileJournalBuffer(); const initial = fixture('large', 'error');
		queue.enqueue({ record: { ...initial.record, sourcePath: '源'.repeat(10000), targetPath: '目标'.repeat(10000), error: '错误'.repeat(10000) } });
		const write = queue.shift()!;
		assert.ok(write.record.sourcePath.length <= 2048 && write.record.error!.length <= 512 && VSBuffer.fromString(JSON.stringify(write)).byteLength <= TURBOFILE_JOURNAL_RECORD_BYTES);
	});

	test('keeps a 256 KiB queue bounded under sustained terminal results and signals gaps', () => {
		const queue = new TurboFileJournalBuffer();
		for (let index = 0; index < 2500; index++) { const write = fixture(`op-${index}`, 'error'); queue.enqueue({ record: { ...write.record, error: 'x'.repeat(512) } }); }
		assert.ok(queue.byteLength <= TURBOFILE_JOURNAL_QUEUE_BYTES && queue.takeGap() && !queue.takeGap());
	});

	test('prioritizes a final summary when running summaries fill the queue', () => {
		const queue = new TurboFileJournalBuffer();
		for (let index = 0; index < 500; index++) { const write = fixture(`op-${index}`); queue.enqueue({ record: { ...write.record, sourcePath: 'x'.repeat(2048) } }); }
		queue.enqueue(fixture('final-operation', 'error'));
		let found = false;
		while (queue.size) { if (queue.shift()!.record.id === 'final-operation') { found = true; } }
		assert.ok(found && queue.byteLength === 0);
	});

	test('rejects invalid status, identity, kind and dates', () => {
		const write = fixture();
		assert.deepStrictEqual([
			normalizeTurboFileJournalWrite({ record: { ...write.record, id: '../escape' } }),
			normalizeTurboFileJournalWrite({ record: { ...write.record, startedAt: NaN } }),
			normalizeTurboFileJournalWrite({ record: { ...write.record, startedAt: 1e100 } }),
			normalizeTurboFileJournalWrite({ record: { ...write.record, status: 'constructor' as 'running' } }),
			normalizeTurboFileJournalWrite({ record: { ...write.record, kind: 'writeFile' } })
		], Array(5).fill(undefined));
	});
});
