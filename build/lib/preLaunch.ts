/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootDir = path.resolve(import.meta.dirname, '..', '..');

function runProcess(command: string, args: ReadonlyArray<string> = []) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { cwd: rootDir, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
		child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
		child.on('error', reject);
	});
}

async function exists(subdir: string) {
	try {
		await fs.stat(path.join(rootDir, subdir));
		return true;
	} catch {
		return false;
	}
}

async function ensureNodeModules() {
	if (!(await exists('node_modules'))) {
		await runProcess(npm, ['ci']);
	}
}

async function getElectron() {
	if (process.env['VSCODE_FORCE_ELECTRON'] !== '1') {
		const executable = await getElectronExecutableSubpath();
		if (executable && await exists(executable)) {
			console.log(`Electron runtime already exists (${executable}); skipping npm run electron.`);
			return;
		}
	}
	console.log('Preparing Electron runtime. This can take a while on the first run.');
	await runProcess(npm, ['run', 'electron']);
}

async function getElectronExecutableSubpath(): Promise<string | undefined> {
	try {
		const raw = await fs.readFile(path.join(rootDir, 'product.json'), 'utf8');
		const product = JSON.parse(raw) as { nameShort?: string };
		const nameShort = product.nameShort;
		if (!nameShort) {
			return undefined;
		}
		if (process.platform === 'win32') {
			return path.join('.build', 'electron', `${nameShort}.exe`);
		}
		if (process.platform === 'darwin') {
			return path.join('.build', 'electron', `${nameShort}.app`);
		}
		return path.join('.build', 'electron', nameShort);
	} catch {
		return undefined;
	}
}

async function ensureCompiled() {
	if (!(await exists('out'))) {
		await runProcess(npm, ['run', 'compile']);
	}
}

async function main() {
	await ensureNodeModules();
	await getElectron();
	await ensureCompiled();

	// Can't require this until after dependencies are installed
	const { getBuiltInExtensions } = await import('./builtInExtensions.ts');
	await getBuiltInExtensions();
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
