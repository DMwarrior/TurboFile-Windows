# Same-Device Directory Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge existing same-name directories only for ordinary copies on the same device, while preserving non-rsync conflict rejection everywhere else.

**Architecture:** Put the exception decision in a pure common policy so single and batch entry points share one rule. Keep the actual merge in the native same-device copy implementations: local copies already merge, while POSIX and Windows remote-native commands will copy directory contents into the exact target directory. All tar, SCP, and SFTP cross-device guards remain unchanged.

**Tech Stack:** TypeScript, Node.js filesystem APIs, remote POSIX shell/PowerShell commands, Mocha TDD tests.

## Global Constraints

- Same local device and same SSH connection copies merge existing same-name directories.
- Same-name files are overwritten; target-only files remain.
- Same-device move/cut into an existing same-name directory is rejected.
- Different-device non-rsync transfers continue to reject existing same-name directories.
- Rsync-only plans retain incremental merge behavior.
- No transfer path may recursively delete an existing target directory as preparation.
- Preserve all unrelated image, browser, terminal, and transfer behavior.

---

### Task 1: Centralize The Conflict Policy

**Files:**
- Create: `src/vs/platform/turbofile/common/turbofileTransferConflictPolicy.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileTransferConflictPolicy.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:2647`

**Interfaces:**
- Consumes: `ITurboFileTransferEndpoint`, `ITurboFileTransferPlan`, `TurboFileFileType`.
- Produces: `shouldRejectDirectoryTargetConflict(options): boolean`.

- [ ] **Step 1: Write the failing policy matrix test**

```ts
assert.deepStrictEqual([
	shouldRejectDirectoryTargetConflict({ source: local, target: local, sourceType: 'directory', operation: 'copy', plan: scpPlan }),
	shouldRejectDirectoryTargetConflict({ source: sshA, target: sshASecondPane, sourceType: 'directory', operation: 'copy', plan: scpPlan }),
	shouldRejectDirectoryTargetConflict({ source: sshA, target: sshASecondPane, sourceType: 'directory', operation: 'move', plan: scpPlan }),
	shouldRejectDirectoryTargetConflict({ source: sshA, target: sshB, sourceType: 'directory', operation: 'copy', plan: tarPlan }),
	shouldRejectDirectoryTargetConflict({ source: sshA, target: sshB, sourceType: 'directory', operation: 'copy', plan: rsyncPlan })
], [false, false, true, true, false]);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransferConflictPolicy.test.ts`

Expected: FAIL because `turbofileTransferConflictPolicy.js` does not exist.

- [ ] **Step 3: Implement the pure policy**

```ts
export function shouldRejectDirectoryTargetConflict(options: ITransferConflictPolicyOptions): boolean {
	if (options.sourceType !== 'directory' || isRsyncOnly(options.plan)) {
		return false;
	}
	if (options.operation === 'copy' && isSameNativeDevice(options.source, options.target)) {
		return false;
	}
	return true;
}
```

`isSameNativeDevice` returns true for local/local endpoints or SSH endpoints with identical host, normalized port, and username.

- [ ] **Step 4: Use the policy in both service preflight methods**

Single transfers pass `operation: 'copy'`. Batch transfers pass `request.operation === 'move' ? 'move' : 'copy'`. When the policy returns false, no target conflict stat is performed.

- [ ] **Step 5: Run compilation and the policy test**

Run: `npm run compile-check-ts-native -- --pretty false`

Run: `npm run gulp compile-client`

Run: `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransferConflictPolicy.test.ts`

Expected: compilation exits 0 and the policy test passes.

- [ ] **Step 6: Commit the policy change**

```powershell
git add -- src/vs/platform/turbofile/common/turbofileTransferConflictPolicy.ts src/vs/platform/turbofile/test/common/turbofileTransferConflictPolicy.test.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts out/vs/platform/turbofile
git commit -m "Allow same-device directory copy merges"
```

### Task 2: Merge POSIX Same-Device Directory Contents

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofileRemoteNativeBatchPlan.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileRemoteNativeBatchPlan.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:4546`

**Interfaces:**
- Consumes: batch item `sourcePath`, `targetName`, and `sourceType`.
- Produces: a null-delimited native command plan that merges directory contents into `targetDirectory/targetName`.

- [ ] **Step 1: Write failing native plan tests**

Add assertions that a directory copy plan contains an exact destination and content-copy form, while a move plan remains `mv` based:

```ts
const plan = createPosixNativeBatchTransferPlan([
	{ sourcePath: '/tmp/source/11', targetName: '11', sourceType: 'directory' }
], '/tmp/target', 'copy');

assert.ok(plan.command.includes('src/.'));
assert.ok(plan.command.includes('target/$name'));
assert.deepStrictEqual(plan.input.toString('utf8').split('\0'), ['/tmp/source/11', '11', 'directory', '']);
```

- [ ] **Step 2: Run the native plan test and verify RED**

Run: `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileRemoteNativeBatchPlan.test.ts`

Expected: FAIL because the current input contains only source paths and the command copies the directory itself.

- [ ] **Step 3: Implement exact-target POSIX merge commands**

Encode triples of `sourcePath`, `targetName`, and `sourceType`. For directory copies, reject an existing non-directory target, create the exact target directory, and run:

```sh
cp -a --reflink=auto --sparse=always -- "$src"/. "$dst"/ 2>/dev/null || cp -a -- "$src"/. "$dst"/
```

For files, copy to the exact `$dst` with overwrite semantics. For moves, retain native `mv -f` and rely on preflight to reject an existing same-name directory.

- [ ] **Step 4: Update single POSIX same-device copy**

Pass `sourceType` into `buildPosixCopyCommand`. Directory copies use the same `source/. -> target/` merge rule; file copies retain the current exact-file overwrite command.

- [ ] **Step 5: Compile and run native plan tests**

Run: `npm run compile-check-ts-native -- --pretty false`

Run: `npm run gulp compile-client`

Run: `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileRemoteNativeBatchPlan.test.ts`

Expected: compilation exits 0 and all native plan tests pass.

- [ ] **Step 6: Commit POSIX merge behavior**

```powershell
git add -- src/vs/platform/turbofile/common/turbofileRemoteNativeBatchPlan.ts src/vs/platform/turbofile/test/common/turbofileRemoteNativeBatchPlan.test.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts out/vs/platform/turbofile
git commit -m "Merge same-device POSIX directory copies"
```

### Task 3: Preserve Windows Same-Device Merge Semantics

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:9796`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Consumes: source type and exact target path for single copies; batch item names/types for remote Windows copies.
- Produces: PowerShell commands that create the exact target directory and copy children recursively with `-Force`.

- [ ] **Step 1: Write failing static tests for Windows and SFTP boundaries**

Assert that directory-capable SFTP fallback paths still call target conflict checks, and that the Windows native directory copy command copies children into the exact target rather than nesting the source folder.

- [ ] **Step 2: Run the static test and verify RED**

Run: `npm run gulp compile-client`

Run: `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

Expected: the new Windows exact-target merge assertion fails. The unrelated pre-existing directory-listing assertion may remain separately reported.

- [ ] **Step 3: Implement Windows exact-target copy commands**

For a source directory, create `$dst`, enumerate source children with `Get-ChildItem -LiteralPath $src -Force`, and pipe them to `Copy-Item -Destination $dst -Recurse -Force`. For a source file, retain exact-path overwrite. Batch remote Windows commands use each item's `targetName` and `sourceType`.

- [ ] **Step 4: Keep lower-level protocol guards intact**

Verify tar, SCP, local SFTP, direct SFTP, and SFTP relay directory execution paths reject an existing target unless they are running the native same-device copy path. Do not weaken `buildPrepareDirectoryTransferTargetCommand` or `ensureLocalDirectoryTransferTargetAvailable`.

- [ ] **Step 5: Compile and run focused tests**

Run: `npm run compile-check-ts-native -- --pretty false`

Run: `npm run gulp compile-client`

Run: `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransferConflictPolicy.test.ts`

Run: `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileRemoteNativeBatchPlan.test.ts`

Run: `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

Expected: new conflict/merge tests pass; any unrelated pre-existing static test failure is documented exactly.

- [ ] **Step 6: Run final source safety audit**

Run: `rg -n "rm -rf|Remove-Item.*-Recurse|fsp\.rm\([^\n]*recursive" src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`

Expected: recursive removals are limited to source cleanup after successful move, explicit delete actions, temporary paths, and rsync-only cleanup; no non-rsync target preparation deletes an existing directory.

- [ ] **Step 7: Commit the completed implementation**

```powershell
git add -- src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts out/vs/platform/turbofile
git commit -m "Complete same-device directory merge protection"
```
