/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { homedir, userInfo } from 'node:os';
import { execFile } from 'node:child_process';
import { localize } from '../../../nls.js';
import { ITurboFileSavedSshDiscovery, parseTurboFileSshConfig, parseTurboFileWinScpIni, tokenizeTurboFileSshConfigLine } from '../common/turbofileDeviceImport.js';

interface IRegistrySession {
	readonly source: string;
	readonly name: string;
	readonly values: Readonly<Record<string, string>>;
}

export interface ITurboFileRegistrySshData {
	readonly sessions: readonly IRegistrySession[];
	readonly iniPaths: readonly string[];
}

export interface ITurboFileSavedSshOptions {
	readonly home?: string;
	readonly username?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly windows?: boolean;
	readonly readRegistry?: () => Promise<ITurboFileRegistrySshData>;
}

const maxConfigBytes = 2 * 1024 * 1024;
const maxConfigFiles = 64;

/** Reads known session keys only. Saved shells and external commands are never run. */
async function readWindowsSessions(): Promise<ITurboFileRegistrySshData> {
	const script = [
		"$ErrorActionPreference='Stop'",
		'[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)',
		'$sessions=@(); $iniPaths=@()',
		"$fields=@('HostName','PortNumber','UserName','RemoteDirectory','PublicKeyFile','FSProtocol','ProxyMethod','Tunnel','Password','PasswordPlain','Passphrase','PassphrasePlain','Protocol')",
		"foreach($item in @(@('WinSCP','HKCU:\\Software\\Martin Prikryl\\WinSCP 2\\Sessions'),@('PuTTY','HKCU:\\Software\\SimonTatham\\PuTTY\\Sessions'),@('KiTTY','HKCU:\\Software\\9bis.com\\KiTTY\\Sessions'))) {",
		' if(Test-Path -LiteralPath $item[1]) { foreach($key in Get-ChildItem -LiteralPath $item[1]) {',
		'  $values=@{}; foreach($field in $fields) { $value=$key.GetValue($field,$null); if($null -ne $value) { $values[$field]=[string]$value } }',
		'  $sessions+=@{source=$item[0];name=$key.PSChildName;values=$values}',
		' } }',
		'}',
		"foreach($keyPath in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\WinSCP.exe','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\WinSCP.exe','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\WinSCP.exe')) {",
		" if(Test-Path -LiteralPath $keyPath) { $exe=(Get-Item -LiteralPath $keyPath).GetValue(''); if($exe) { $iniPaths+=Join-Path ([IO.Path]::GetDirectoryName($exe.Trim('\"'))) 'WinSCP.ini' } }",
		'}',
		'@{sessions=@($sessions);iniPaths=@($iniPaths)} | ConvertTo-Json -Depth 6 -Compress'
	].join('\n');
	return new Promise((resolve, reject) => {
		execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 7000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
			if (error) { reject(new Error('Saved session registry could not be read.')); return; }
			try {
				const value = JSON.parse(stdout.replace(/^\uFEFF/, '')) as ITurboFileRegistrySshData;
				if (!Array.isArray(value.sessions) || !Array.isArray(value.iniPaths)) { throw new Error(); }
				resolve(value);
			} catch { reject(new Error('Invalid saved session registry response.')); }
		});
	});
}

/** Reads configuration only; private-key contents and known_hosts are deliberately excluded. */
export async function discoverTurboFileSavedSshDevices(options: ITurboFileSavedSshOptions = {}): Promise<ITurboFileSavedSshDiscovery> {
	const home = options.home ?? homedir();
	const username = options.username ?? userInfo().username;
	const env = options.env ?? process.env;
	const windows = options.windows ?? process.platform === 'win32';
	const sites: ITurboFileSavedSshDiscovery['sites'][number][] = [];
	const skipped: ITurboFileSavedSshDiscovery['skipped'][number][] = [];
	const warnings: string[] = [];
	let bytesRead = 0;
	let filesRead = 0;
	const add = (result: Pick<ITurboFileSavedSshDiscovery, 'sites' | 'skipped'>, source: string): void => {
		sites.push(...result.sites.map(site => ({ ...site, source })));
		skipped.push(...result.skipped.map(site => ({ ...site, name: source + ' · ' + site.name })));
	};
	const read = async (file: string): Promise<string | undefined> => {
		try {
			if (filesRead >= maxConfigFiles || bytesRead >= 10 * 1024 * 1024) { throw new Error('Configuration limit reached.'); }
			const handle = await fs.open(file, 'r');
			try {
				filesRead++;
				const buffer = Buffer.alloc(maxConfigBytes + 1);
				const result = await handle.read(buffer, 0, buffer.length, 0);
				if (result.bytesRead > maxConfigBytes) { throw new Error('Configuration is too large.'); }
				bytesRead += result.bytesRead;
				const bytes = buffer.subarray(0, result.bytesRead);
				const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
				return new TextDecoder(encoding, { fatal: true }).decode(bytes);
			} finally { await handle.close(); }
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return undefined; }
			warnings.push(localize('turbofile.importReadConfigFailed', "无法完整读取配置：{0}", file));
			return undefined;
		}
	};
	const expandPath = (value: string): string => {
		value = value.replace(/^~[/\\]/, home + path.sep).replace(/\$\{([^}]+)\}/g, (match, key: string) => env[key] ?? match);
		return path.isAbsolute(value) ? value : path.resolve(home, '.ssh', value);
	};
	const glob = async (pattern: string): Promise<string[]> => {
		const absolute = expandPath(pattern);
		const root = path.parse(absolute).root;
		let candidates = [root];
		for (const part of absolute.slice(root.length).split(/[/\\]/).filter(Boolean)) {
			if (!/[?*]/.test(part)) { candidates = candidates.map(parent => path.join(parent, part)); continue; }
			const regex = new RegExp('^' + part.split('').map(char => char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&')).join('') + '$', windows ? 'i' : '');
			const expanded: string[] = [];
			for (const parent of candidates) {
				const entries = await fs.readdir(parent).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') { return []; } throw error; });
				expanded.push(...entries.filter(entry => regex.test(entry)).map(entry => path.join(parent, entry)));
				if (expanded.length > maxConfigFiles) { throw new Error('Too many included configurations.'); }
			}
			candidates = expanded;
		}
		return candidates.sort();
	};
	const stack = new Set<string>();
	const expandSsh = async (file: string, depth = 0): Promise<string> => {
		const key = windows ? file.toLowerCase() : file;
		if (depth > 8 || stack.has(key)) { throw new Error('Recursive SSH Include.'); }
		const text = await read(file);
		if (text === undefined) { return ''; }
		stack.add(key);
		try {
			const lines: string[] = [];
			for (const line of text.split(/\r?\n/)) {
				const [keyword, ...args] = tokenizeTurboFileSshConfigLine(line);
				if (keyword?.toLowerCase() !== 'include') { lines.push(line); continue; }
				lines.push('TurboFileIncludeStart true');
				for (const pattern of args) {
					for (const included of await glob(pattern)) { lines.push(await expandSsh(included, depth + 1)); }
				}
				lines.push('TurboFileIncludeEnd true');
			}
			return lines.join('\n');
		} finally { stack.delete(key); }
	};
	try {
		let text = await expandSsh(path.join(home, '.ssh', 'config'));
		if (windows && env.ProgramData) { text += '\n' + await expandSsh(path.join(env.ProgramData, 'ssh', 'ssh_config')); }
		if (warnings.length) { throw new Error('Incomplete SSH configuration.'); }
		let defaultIdentityFile: string | undefined;
		for (const name of ['id_ed25519', 'id_ecdsa', 'id_rsa']) {
			const candidate = path.join(home, '.ssh', name);
			if ((await fs.stat(candidate).catch(() => undefined))?.isFile()) { defaultIdentityFile = candidate; break; }
		}
		add(parseTurboFileSshConfig(text, { home, username, env, defaultIdentityFile }), 'OpenSSH');
	} catch {
		warnings.push(localize('turbofile.importSshConfigPartial', "SSH 配置的 Include 存在循环、过深或读取失败，请检查 .ssh/config。"));
	}
	if (windows) {
		const iniPaths = new Set<string>();
		for (const folder of [env.APPDATA, env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'WinSCP'), env.ProgramFiles && path.join(env.ProgramFiles, 'WinSCP'), env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'WinSCP')]) {
			if (folder) { iniPaths.add(path.join(folder, 'WinSCP.ini')); }
		}
		try {
			const registry = await (options.readRegistry ?? readWindowsSessions)();
			for (const file of registry.iniPaths) { if (typeof file === 'string' && path.isAbsolute(file)) { iniPaths.add(file); } }
			const groups = new Map<string, string[]>();
			for (const session of registry.sessions) {
				if (typeof session.name !== 'string' || !session.values || !['WinSCP', 'PuTTY', 'KiTTY'].includes(session.source)) { continue; }
				if (session.source !== 'WinSCP' && (session.values.Protocol ?? 'ssh') !== 'ssh') { continue; }
				const values = Object.entries(session.values).filter(([, value]) => typeof value === 'string').map(([key, value]) => key + '=' + encodeURIComponent(value));
				if (session.source !== 'WinSCP') { values.push('FSProtocol=1'); }
				const sections = groups.get(session.source) ?? [];
				sections.push('[Sessions\\' + session.name + ']\n' + values.join('\n'));
				groups.set(session.source, sections);
			}
			for (const [source, sections] of groups) { add(parseTurboFileWinScpIni(sections.join('\n')), source); }
		} catch {
			warnings.push(localize('turbofile.importRegistryPartial', "无法读取 WinSCP/PuTTY/KiTTY 保存的站点，仍可扫描 SSH 配置或手动选择配置文件。"));
		}
		for (const file of iniPaths) {
			const text = await read(file);
			if (text !== undefined) { add(parseTurboFileWinScpIni(text), 'WinSCP · ' + file); }
		}
	}
	return { sites, skipped, warnings };
}
