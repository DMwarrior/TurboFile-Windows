/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileDeviceForm', () => {
	const readEditor = () => fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
	const methodBlock = (source: string, start: string, end: string): string => {
		const startIndex = source.indexOf(start);
		const endIndex = source.indexOf(end, startIndex);
		assert.ok(startIndex >= 0, `${start} should exist`);
		assert.ok(endIndex > startIndex, `${end} should follow ${start}`);
		return source.slice(startIndex, endIndex);
	};

	test('new SSH devices default to passwords while imported key devices retain editable key credentials', () => {
		const source = readEditor();
		const renderDeviceForm = methodBlock(source, 'private renderDeviceForm()', 'private bindDeviceFormEventIsolation');

		assert.deepStrictEqual({
			preservesImportedAuthentication: renderDeviceForm.includes("this.appendHiddenInput(form, 'authType', editingDevice?.authType ?? 'password');"),
			keyFieldsAreConditional: renderDeviceForm.includes("if (editingDevice?.authType === 'privateKey')"),
			rendersAuthenticationSelect: renderDeviceForm.includes("this.appendSelectField(form, 'authType'"),
			rendersPrivateKeyPath: renderDeviceForm.includes("this.appendInputField(form, 'privateKeyPath'"),
			rendersPrivateKeyPassphrase: renderDeviceForm.includes("this.appendInputField(form, 'passphrase'")
		}, {
			preservesImportedAuthentication: true,
			keyFieldsAreConditional: true,
			rendersAuthenticationSelect: false,
			rendersPrivateKeyPath: true,
			rendersPrivateKeyPassphrase: true
		});
	});

	test('background renders keep the mounted device form and its focused input alive', () => {
		const source = readEditor();
		const render = methodBlock(source, 'private render(): void', 'private renderActivePage');

		assert.deepStrictEqual({
			findsMountedOverlay: render.includes("querySelector<HTMLElement>(':scope > .turbofile-device-overlay')"),
			preservesMountedOverlay: render.includes('this.clearContainerForRender(retainedDeviceFormOverlay);'),
			insertsPageBelowOverlay: render.includes('this.container.insertBefore(shell, retainedDeviceFormOverlay);'),
			reusesMountedOverlay: render.includes('if (this.isDeviceFormVisible && !retainedDeviceFormOverlay)'),
			avoidsWholeContainerClear: !render.includes('clearNode(this.container);')
		}, {
			findsMountedOverlay: true,
			preservesMountedOverlay: true,
			insertsPageBelowOverlay: true,
			reusesMountedOverlay: true,
			avoidsWholeContainerClear: true
		});
	});

	test('initial focus runs in the form window only after the form is attached', () => {
		const source = readEditor();
		const renderDeviceForm = methodBlock(source, 'private renderDeviceForm()', 'private bindDeviceFormEventIsolation');

		assert.deepStrictEqual({
			usesOwnerWindowFrame: renderDeviceForm.includes('getWindow(form).requestAnimationFrame(() => {'),
			checksAttachment: renderDeviceForm.includes('if (!form.isConnected)')
		}, {
			usesOwnerWindowFrame: true,
			checksAttachment: true
		});
	});
});
