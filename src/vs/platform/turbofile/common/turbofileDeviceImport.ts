/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix, win32 } from '../../../base/common/path.js';

export interface TurboFileWinScpSite {
	readonly name: string;
	readonly host: string;
	readonly port: number;
	readonly username: string;
	readonly defaultPath: string;
	readonly authType: 'password' | 'privateKey';
	readonly privateKeyPath?: string;
	readonly password?: string;
	readonly passphrase?: string;
	readonly credentialIssue?: 'protected' | 'invalid';
	readonly preferredTransferProtocol: 'auto-fast' | 'scp' | 'sftp';
	readonly platform: 'unknown';
	readonly source?: string;
}

export interface TurboFileWinScpImportResult {
	readonly sites: readonly TurboFileWinScpSite[];
	readonly skipped: readonly { readonly name: string; readonly reason: 'protocol' | 'proxy' | 'invalid' | 'conditional' }[];
}

export interface ITurboFileSavedSshDiscovery extends TurboFileWinScpImportResult {
	readonly warnings: readonly string[];
}

const supportedFields = new Set(['hostname', 'portnumber', 'username', 'remotedirectory', 'publickeyfile', 'fsprotocol', 'proxymethod', 'tunnel', 'password', 'passwordplain', 'passphrase', 'passphraseplain']);

/** Decodes WinSCP's saved-password format, including older and extended-length records. */
function decodeWinScpPassword(encoded: string, binding: string): { value?: string; issue?: 'protected' | 'invalid' } {
	if (!encoded) {
		return {};
	}
	if (encoded.length > 132000 || !/^(?:[\da-f]{2})+$/i.test(encoded)) {
		return { issue: 'invalid' };
	}
	const bytes = Uint8Array.from(encoded.match(/../g)!, pair => parseInt(pair, 16) ^ 0x5c);
	try {
		let offset = 0;
		const read = (): number => {
			if (offset >= bytes.length) {
				throw new Error('Invalid saved credential.');
			}
			return bytes[offset++];
		};
		const first = read();
		let length = first;
		if (first === 0xff) {
			const version = read();
			if (version === 1) {
				return { issue: 'protected' };
			}
			if (version !== 0 && version !== 2) {
				return { issue: 'invalid' };
			}
			length = version === 2 ? read() * 256 + read() : read();
		}
		const padding = read();
		offset += padding;
		if (offset + length > bytes.length) {
			return { issue: 'invalid' };
		}
		const payload = bytes.subarray(offset, offset + length);
		const prefix = first === 0xff ? new TextEncoder().encode(binding) : new Uint8Array(0);
		if (prefix.length > payload.length || prefix.some((byte, index) => byte !== payload[index])) {
			return { issue: 'invalid' };
		}
		const value = new TextDecoder('utf-8', { fatal: true }).decode(payload.subarray(prefix.length));
		return value.includes('\0') ? { issue: 'invalid' } : { value };
	} catch {
		return { issue: 'invalid' };
	} finally {
		bytes.fill(0);
	}
}

function decodeWinScpString(value: string): string {
	try {
		return decodeURIComponent(value).replace(/^\uFEFF/, '');
	} catch {
		return value;
	}
}

/** Reads a user-selected export. Shell commands and proxy credentials are never imported. */
export function parseTurboFileWinScpIni(text: string, includePasswords = true): TurboFileWinScpImportResult {
	const sections = new Map<string, Map<string, string>>();
	let current: Map<string, string> | undefined;
	for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith(';') || line.startsWith('#')) {
			continue;
		}
		if (line.startsWith('[') && line.endsWith(']')) {
			const section = line.slice(1, -1);
			current = undefined;
			if (section.toLowerCase().startsWith('sessions\\')) {
				const name = decodeWinScpString(section.slice('sessions\\'.length));
				current = sections.get(name) ?? new Map<string, string>();
				sections.set(name, current);
			}
			continue;
		}
		const separator = rawLine.indexOf('=');
		if (current && separator > 0) {
			const key = rawLine.slice(0, separator).trim().toLowerCase();
			if (supportedFields.has(key) && (includePasswords || !['password', 'passwordplain', 'passphrase', 'passphraseplain'].includes(key))) {
				const value = rawLine.slice(separator + 1).replace(/\r$/, '');
				current.set(key, decodeWinScpString(key.endsWith('plain') ? value : value.trim()));
			}
		}
	}
	const sites: TurboFileWinScpSite[] = [];
	const skipped: Array<{ name: string; reason: 'protocol' | 'proxy' | 'invalid' }> = [];
	const defaults = sections.get('Default Settings');
	for (const [name, values] of sections) {
		if (name === 'Default Settings') {
			continue;
		}
		const get = (key: string, fallback = '') => values.get(key) ?? defaults?.get(key) ?? fallback;
		const protocol = get('fsprotocol', '1').toLowerCase();
		// WinSCP: 0 = SCP, 1 = SFTP with SCP fallback, 2 = SFTP only.
		if (!['0', '1', '2', 'scp', 'sftp'].includes(protocol)) {
			skipped.push({ name, reason: 'protocol' });
			continue;
		}
		if (!['0', 'none', 'off', ''].includes(get('proxymethod', '0').toLowerCase()) || !['0', 'off', ''].includes(get('tunnel', '0').toLowerCase())) {
			skipped.push({ name, reason: 'proxy' });
			continue;
		}
		const host = get('hostname').trim();
		const username = get('username').trim();
		const portText = get('portnumber', '22');
		const port = /^\d+$/.test(portText) ? Number(portText) : NaN;
		const defaultPath = get('remotedirectory', '/') || '/';
		const privateKeyPath = get('publickeyfile').replace(/^"(.*)"$/, '$1') || undefined;
		if (!host || !username || /[\x00-\x20\x7f]/.test(host) || /[\x00-\x1f\x7f]/.test(name + username + defaultPath + (privateKeyPath ?? '')) || !defaultPath.startsWith('/') || defaultPath.includes('\\') || !Number.isInteger(port) || port < 1 || port > 65535) {
			skipped.push({ name, reason: 'invalid' });
			continue;
		}
		// Never inherit a password from Default Settings: its binding belongs to a different login.
		const readCredential = (field: 'password' | 'passphrase', binding: string) => {
			const plain = values.get(`${field}plain`);
			return plain !== undefined
				? (plain.includes('\0') ? { issue: 'invalid' as const } : { value: plain })
				: decodeWinScpPassword(values.get(field) ?? '', binding);
		};
		const password = readCredential('password', get('username') + get('hostname'));
		const passphrase = readCredential('passphrase', privateKeyPath ?? '');
		const credentialIssue = password.issue === 'protected' || passphrase.issue === 'protected' ? 'protected' : password.issue ?? passphrase.issue;
		sites.push({
			name, host, port, username,
			defaultPath,
			authType: privateKeyPath ? 'privateKey' : 'password',
			privateKeyPath,
			...(password.value ? { password: password.value } : {}),
			...(passphrase.value ? { passphrase: passphrase.value } : {}),
			...(credentialIssue ? { credentialIssue } : {}),
			preferredTransferProtocol: protocol === '0' || protocol === 'scp' ? 'scp' : protocol === '2' ? 'sftp' : 'auto-fast',
			platform: 'unknown'
		});
	}
	return { sites, skipped };
}

/** Matches a saved login, while preserving sessions that use different starting directories. */
export function getTurboFileImportedDeviceIdentity(device: { host: string; port: number; username: string; defaultPath?: string }): string {
	const directory = (device.defaultPath?.trim() || '/').replace(/\/+/g, '/').replace(/\/\.(?=\/|$)/g, '').replace(/\/+$/, '') || '/';
	return JSON.stringify([device.host.trim().toLowerCase(), device.port, device.username, directory]);
}

/** Tokenizes configuration without evaluating substitutions, commands or Match exec. */
export function tokenizeTurboFileSshConfigLine(line: string): string[] {
	line = line.replace(/^(\s*[a-z][a-z0-9]*)\s*=\s*/i, '$1 ');
	const tokens: string[] = [];
	let token = '';
	let quote = '';
	for (let index = 0; index < line.length; index++) {
		const char = line[index];
		if (char === '\\' && ['"', "'", '#', ' ', '\\'].includes(line[index + 1])) {
			token += line[++index];
		} else if (quote) {
			if (char === quote) { quote = ''; } else { token += char; }
		} else if (char === '"' || char === "'") {
			quote = char;
		} else if (char === '#') {
			break;
		} else if (/\s/.test(char)) {
			if (token) { tokens.push(token); token = ''; }
		} else {
			token += char;
		}
	}
	if (quote) { return []; }
	if (token) { tokens.push(token); }
	return tokens;
}

function matchesSshHost(patterns: readonly string[], host: string): boolean {
	let matched = false;
	for (const pattern of patterns) {
		const negative = pattern.startsWith('!');
		const value = negative ? pattern.slice(1) : pattern;
		const regex = value.split('').map(char => char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
		if (new RegExp(`^${regex}$`, 'i').test(host)) {
			if (negative) { return false; }
			matched = true;
		}
	}
	return matched;
}

export interface ITurboFileSshConfigContext {
	readonly home: string;
	readonly username: string;
	readonly defaultIdentityFile?: string;
	readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Uses OpenSSH's first-value rule and only offers concrete aliases, never wildcard host patterns. */
export function parseTurboFileSshConfig(text: string, context: ITurboFileSshConfigContext): TurboFileWinScpImportResult {
	const records = text.split(/\r?\n/).map(tokenizeTurboFileSshConfigLine).filter(tokens => tokens.length >= 2);
	const aliases = new Map<string, string>();
	for (const [keyword, ...args] of records) {
		if (keyword.toLowerCase() === 'host') {
			for (const alias of args) {
				if (!/[*!?]/.test(alias) && !aliases.has(alias.toLowerCase())) { aliases.set(alias.toLowerCase(), alias); }
			}
		}
	}
	const sites: TurboFileWinScpSite[] = [];
	const skipped: Array<{ name: string; reason: 'proxy' | 'invalid' | 'conditional' }> = [];
	for (const name of aliases.values()) {
		// Match can depend on local commands, network state and additional parse passes.
		// Do not execute it or silently import a potentially different connection.
		if (records.some(([keyword]) => keyword.toLowerCase() === 'match')) {
			skipped.push({ name, reason: 'conditional' });
			continue;
		}
		let active = true;
		let concreteMatch = false;
		const includeGuards: boolean[] = [];
		const options = new Map<string, string>();
		for (const [rawKeyword, ...args] of records) {
			const keyword = rawKeyword.toLowerCase();
			if (keyword === 'turbofileincludestart') { includeGuards.push(active && includeGuards.every(Boolean)); continue; }
			if (keyword === 'turbofileincludeend') { includeGuards.pop(); continue; }
			if (!includeGuards.every(Boolean)) { continue; }
			if (keyword === 'host') {
				active = matchesSshHost(args, name);
				concreteMatch ||= active && args.some(arg => arg.toLowerCase() === name.toLowerCase());
			} else if (active && !options.has(keyword)) {
				options.set(keyword, args[0]);
			}
		}
		if (!concreteMatch) { continue; }
		if (['proxyjump', 'proxycommand'].some(key => options.has(key) && options.get(key)?.toLowerCase() !== 'none')) {
			skipped.push({ name, reason: 'proxy' });
			continue;
		}
		const username = options.get('user') || context.username;
		const host = (options.get('hostname') || name).replace(/%h/g, name);
		const portText = options.get('port') || '22';
		const port = /^\d+$/.test(portText) ? Number(portText) : NaN;
		if (!username || /[\x00-\x20\x7f@/\\%]/.test(host) || /[\x00-\x1f\x7f]/.test(name + username) || !Number.isInteger(port) || port < 1 || port > 65535) {
			skipped.push({ name, reason: 'invalid' });
			continue;
		}
		let privateKeyPath = options.get('identityfile') ?? context.defaultIdentityFile;
		if (privateKeyPath?.toLowerCase() === 'none') { privateKeyPath = undefined; }
		if (privateKeyPath) {
			const substitutions: Readonly<Record<string, string>> = { '%': '%', d: context.home, h: host, n: name, p: String(port), r: username, u: context.username };
			privateKeyPath = privateKeyPath.replace(/%([%dhnpru])/g, (match, key: string) => substitutions[key] ?? match)
				.replace(/\$\{([^}]+)\}/g, (match, key: string) => context.env?.[key] ?? match);
			const paths = /^[a-z]:|\\/i.test(context.home) ? win32 : posix;
			if (/^~[/\\]/.test(privateKeyPath)) { privateKeyPath = paths.join(context.home, privateKeyPath.slice(2)); }
			if (privateKeyPath.includes('%') || privateKeyPath.includes('${') || privateKeyPath.startsWith('~') || /[\x00-\x1f\x7f]/.test(privateKeyPath)) {
				skipped.push({ name, reason: 'invalid' });
				continue;
			}
			privateKeyPath = paths.isAbsolute(privateKeyPath) ? privateKeyPath : paths.resolve(context.home, privateKeyPath);
		}
		if (options.has('certificatefile') || (options.has('identityagent') && options.get('identityagent')?.toLowerCase() !== 'none')) {
			skipped.push({ name, reason: 'conditional' });
			continue;
		}
		sites.push({ name, host, port, username, defaultPath: '/', authType: privateKeyPath ? 'privateKey' : 'password', privateKeyPath, platform: 'unknown', preferredTransferProtocol: 'auto-fast' });
	}
	return { sites, skipped };
}
