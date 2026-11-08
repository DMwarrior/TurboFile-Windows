/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ITurboFileMoveFileSnapshot {
	readonly path: string;
	readonly size: number;
	/** Milliseconds locally; whole seconds for SFTP attributes. */
	readonly mtime: number;
	readonly ctime?: number;
	readonly ino?: number;
	readonly dev?: number;
	/** Preserve remote nanosecond timestamps and 64-bit identities without JS number rounding. */
	readonly mtimeNs?: string;
	readonly ctimeNs?: string;
	readonly inoText?: string;
	readonly devText?: string;
}

export interface ITurboFileMoveDirectorySnapshot {
	readonly path: string;
	readonly ino?: number;
	readonly dev?: number;
	readonly inoText?: string;
	readonly devText?: string;
}

export interface ITurboFileMoveSnapshot {
	readonly sourceKind: 'local' | 'ssh';
	readonly rootPath?: string;
	readonly files: ITurboFileMoveFileSnapshot[];
	readonly directories: Set<string>;
	readonly directoryMetadata?: readonly ITurboFileMoveDirectorySnapshot[];
	/** Links and special files were intentionally left out of the removable set. */
	readonly retained?: boolean;
}

export interface ITurboFileMoveRemoteStats {
	readonly size: number;
	readonly mtime: number;
	isFile(): boolean;
	isDirectory(): boolean;
	isSymbolicLink(): boolean;
}

export interface ITurboFileMoveRemoteIo {
	/** Must be lstat: following a directory link is unsafe for source cleanup. */
	stat(path: string): Promise<ITurboFileMoveRemoteStats>;
	readDirectory(path: string): Promise<readonly { readonly filename: string; readonly attrs: ITurboFileMoveRemoteStats }[]>;
}

/** Capture metadata only, before a move starts. Copy operations must not call this helper. */
export async function captureTurboFileLocalMoveSnapshots(paths: readonly string[], checkCanceled: () => void): Promise<Map<string, ITurboFileMoveSnapshot>> {
	const snapshots = new Map<string, ITurboFileMoveSnapshot>();
	for (const input of paths) {
		const rootPath = path.resolve(input);
		const files: ITurboFileMoveFileSnapshot[] = [];
		const directories = new Set<string>();
		const directoryMetadata: ITurboFileMoveDirectorySnapshot[] = [];
		const pending = [rootPath];
		let retained = false;
		while (pending.length) {
			checkCanceled();
			const current = pending.pop()!;
			const stat = await fs.lstat(current);
			checkCanceled();
			if (stat.isSymbolicLink()) {
				retained = true;
			} else if (stat.isDirectory()) {
				directories.add(current);
				directoryMetadata.push({ path: current, ino: stat.ino, dev: stat.dev });
				const entries = await fs.readdir(current);
				checkCanceled();
				for (const name of entries) {
					pending.push(path.join(current, name));
				}
			} else if (stat.isFile()) {
				files.push({ path: current, size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, ino: stat.ino, dev: stat.dev });
			} else {
				retained = true;
			}
		}
		snapshots.set(input, { sourceKind: 'local', rootPath, files, directories, directoryMetadata, retained });
	}
	return snapshots;
}

/** NAS/Windows fallback: reuse readdir attributes instead of statting each file. */
export async function captureTurboFileRemoteMoveSnapshots(paths: readonly string[], io: ITurboFileMoveRemoteIo, checkCanceled: () => void): Promise<Map<string, ITurboFileMoveSnapshot>> {
	const snapshots = new Map<string, ITurboFileMoveSnapshot>();
	for (const rootPath of paths) {
		const files: ITurboFileMoveFileSnapshot[] = [];
		const directories = new Set<string>();
		const pending: { path: string; attrs?: ITurboFileMoveRemoteStats }[] = [{ path: rootPath }];
		let retained = false;
		while (pending.length) {
			checkCanceled();
			const current = pending.pop()!;
			const stat = current.attrs ?? await io.stat(current.path);
			checkCanceled();
			if (stat.isSymbolicLink()) {
				retained = true;
			} else if (stat.isDirectory()) {
				// Directory entries may have changed since their parent's readdir returned.
				const fresh = current.attrs ? await io.stat(current.path) : stat;
				checkCanceled();
				if (!fresh.isDirectory() || fresh.isSymbolicLink()) {
					throw new Error('Move source directory changed while its metadata was being captured.');
				}
				directories.add(current.path);
				const entries = await io.readDirectory(current.path);
				checkCanceled();
				for (const entry of entries) {
					if (entry.filename === '.' || entry.filename === '..') {
						continue;
					}
					if (!entry.filename || /[\/\0]/.test(entry.filename)) {
						throw new Error('Invalid directory entry in move source.');
					}
					const parent = /^[a-z]:\\/i.test(current.path) ? current.path.replace(/\\/g, '/') : current.path;
					pending.push({ path: `${parent.replace(/\/$/, '')}/${entry.filename}`, attrs: entry.attrs });
				}
			} else if (stat.isFile()) {
				files.push({ path: current.path, size: stat.size, mtime: stat.mtime });
			} else {
				retained = true;
			}
		}
		snapshots.set(rootPath, { sourceKind: 'ssh', rootPath, files, directories, retained });
	}
	return snapshots;
}

export const TURBOFILE_MOVE_PYTHON_UNAVAILABLE = 'TURBOFILE_MOVE_PYTHON_UNAVAILABLE';

const pythonCapture = `import sys,json,os,stat,time
paths=json.load(sys.stdin)
result=[]
steps=0; last_heartbeat=time.monotonic()
def heartbeat():
 global steps,last_heartbeat
 steps+=1
 if steps%256==0:
  now=time.monotonic()
  if now-last_heartbeat>=1:
   sys.stderr.write('.'); sys.stderr.flush(); last_heartbeat=now
def fingerprint(p,s):
 return {'path':p,'size':s.st_size,'mtime':int(s.st_mtime),'mtimeNs':str(s.st_mtime_ns),'ctimeNs':str(s.st_ctime_ns),'inoText':str(s.st_ino),'devText':str(s.st_dev)}
for root in paths:
 if not isinstance(root,str) or not os.path.isabs(root): raise ValueError('Move source must be absolute')
 files=[]; directories=[]; identities=[]; retained=False; pending=[root]
 while pending:
  p=pending.pop(); s=os.lstat(p); heartbeat()
  if stat.S_ISLNK(s.st_mode): retained=True
  elif stat.S_ISDIR(s.st_mode):
   directories.append(p); identities.append({'path':p,'inoText':str(s.st_ino),'devText':str(s.st_dev)})
   for name in os.listdir(p): pending.append(os.path.join(p,name).replace(os.sep,'/'))
  elif stat.S_ISREG(s.st_mode): files.append(fingerprint(p,s))
  else: retained=True
 result.append({'sourceKind':'ssh','rootPath':root,'files':files,'directories':directories,'directoryMetadata':identities,'retained':retained})
print(json.dumps({'snapshots':result},ensure_ascii=True))
`;

const pythonCleanup = `import sys,json,os,stat,errno,time
r=json.load(sys.stdin); root=r['rootPath']; files=r['files']; directories=r['directories']; retained=bool(r.get('retained')); deleted=0
steps=0; last_heartbeat=time.monotonic()
def heartbeat():
 global steps,last_heartbeat
 steps+=1
 if steps%256==0:
  now=time.monotonic()
  if now-last_heartbeat>=1:
   sys.stderr.write('.'); sys.stderr.flush(); last_heartbeat=now
if not isinstance(root,str) or not os.path.isabs(root): raise ValueError('Move source must be absolute')
root=os.path.normpath(root)
if os.path.dirname(root)==root: raise ValueError('Refusing cleanup of a filesystem root')
def inside(p):
 return isinstance(p,str) and os.path.isabs(p) and os.path.commonpath([root,os.path.normpath(p)])==root
if not all(inside(f['path']) for f in files) or not all(inside(p) for p in directories): raise ValueError('Move snapshot escaped its source root')
identities={d['path']:d for d in r.get('directoryMetadata',[])}
def same_identity(s,e):
 return (e.get('inoText') is None or str(s.st_ino)==e['inoText']) and (e.get('devText') is None or str(s.st_dev)==e['devText'])
def parents_safe(p):
 current=os.path.dirname(p)
 while current:
  s=os.lstat(current)
  if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode): return False
  expected=identities.get(current)
  if expected is not None and not same_identity(s,expected): return False
  parent=os.path.dirname(current)
  if parent==current: break
  current=parent
 return True
for f in files:
 heartbeat()
 p=f['path']
 try:
  if not parents_safe(p): retained=True; continue
  s=os.lstat(p)
  same=stat.S_ISREG(s.st_mode) and s.st_size==f['size'] and same_identity(s,f)
  if f.get('mtimeNs') is not None: same=same and str(s.st_mtime_ns)==f['mtimeNs']
  else: same=same and int(s.st_mtime)==f['mtime']
  if f.get('ctimeNs') is not None: same=same and str(s.st_ctime_ns)==f['ctimeNs']
  if not same: retained=True; continue
  os.unlink(p); deleted+=1
 except FileNotFoundError: pass
 except OSError: retained=True
for p in sorted(set(directories),key=lambda value:len(value),reverse=True):
 heartbeat()
 try:
  if not parents_safe(p): retained=True; continue
  s=os.lstat(p); expected=identities.get(p)
  if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or (expected is not None and not same_identity(s,expected)): retained=True; continue
  os.rmdir(p)
 except FileNotFoundError: pass
 except OSError: retained=True
print(json.dumps({'retained':retained,'deletedFiles':deleted}))
`;

function pythonCommand(script: string): string {
	const encoded = Buffer.from(script, 'utf8').toString('base64');
	const program = `import sys; sys.version_info >= (3, 6) or sys.exit('${TURBOFILE_MOVE_PYTHON_UNAVAILABLE}'); import base64; exec(base64.b64decode('${encoded}'))`;
	const quoted = `'${program.replace(/'/g, `'\\''`)}'`;
	return `if command -v python3 >/dev/null 2>&1; then python3 -c ${quoted}; elif command -v python >/dev/null 2>&1; then python -c ${quoted}; else printf '%s\\n' '${TURBOFILE_MOVE_PYTHON_UNAVAILABLE}' >&2; exit 127; fi`;
}

export function buildTurboFilePosixMoveCaptureCommand(): string {
	return pythonCommand(pythonCapture);
}

export function encodeTurboFileMoveCapturePaths(paths: readonly string[]): Buffer {
	return Buffer.from(JSON.stringify(paths), 'utf8');
}

interface ISerializedMoveSnapshot extends Omit<ITurboFileMoveSnapshot, 'directories'> {
	readonly directories: readonly string[];
}

export function decodeTurboFileRemoteMoveSnapshots(paths: readonly string[], output: Buffer | string): Map<string, ITurboFileMoveSnapshot> {
	const result = JSON.parse(output.toString()) as { snapshots?: ISerializedMoveSnapshot[] };
	if (!Array.isArray(result.snapshots) || result.snapshots.length !== paths.length) {
		throw new Error('Incomplete remote move source snapshot.');
	}
	const snapshots = new Map<string, ITurboFileMoveSnapshot>();
	for (const [index, snapshot] of result.snapshots.entries()) {
		const root = paths[index];
		if (snapshot.sourceKind !== 'ssh' || snapshot.rootPath !== root || !Array.isArray(snapshot.files) || !Array.isArray(snapshot.directories)) {
			throw new Error('Invalid remote move source snapshot.');
		}
		const normalizedRoot = path.posix.normalize(root);
		const contains = (value: string): boolean => {
			const normalized = path.posix.normalize(value);
			return !value.includes('\0') && (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot.replace(/\/$/, '')}/`));
		};
		if (!snapshot.files.every(file => typeof file.path === 'string' && contains(file.path) && Number.isSafeInteger(file.size) && file.size >= 0 && Number.isFinite(file.mtime)) || !snapshot.directories.every(directory => typeof directory === 'string' && contains(directory))) {
			throw new Error('Remote move snapshot contains invalid paths or metadata.');
		}
		snapshots.set(root, { ...snapshot, directories: new Set(snapshot.directories) });
	}
	return snapshots;
}

export function buildTurboFilePosixMoveCleanupCommand(): string {
	return pythonCommand(pythonCleanup);
}

export function encodeTurboFileMoveCleanupSnapshot(snapshot: ITurboFileMoveSnapshot): Buffer {
	if (snapshot.sourceKind !== 'ssh' || !snapshot.rootPath) {
		throw new Error('Remote move cleanup requires a captured source root.');
	}
	return Buffer.from(JSON.stringify({ ...snapshot, directories: [...snapshot.directories] }), 'utf8');
}
