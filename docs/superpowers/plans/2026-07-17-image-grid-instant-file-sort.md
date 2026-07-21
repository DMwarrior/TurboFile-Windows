# 图片网格即时文件排序实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图片网格四种排序复用主文件列表元数据并在点击后立即、正确、局部生效。

**Architecture:** 纯排序器改用文件字节大小和目录修改时间；编辑器移除图片排序元数据预扫描，把排序后的 UI 更新限制在当前图片网格的排序控件和虚拟切片。选择、滚动和已加载图片缓存按图片对象重新映射。

**Tech Stack:** TypeScript、VS Code DOM 工具、Mocha 单元测试。

## Global Constraints

- 不修改传输协议或传输代码。
- 不扫描图片内容或图片头来完成排序。
- 不在排序切换时调用编辑器级 `render()`。
- 保留当前工作区中的用户改动，本次不创建 Git 提交。

---

### Task 1: 文件元数据纯排序器

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileImageGridSort.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridSort.test.ts`

**Interfaces:**
- Produces: `ITurboFileImageGridSortableItem.rawSize`, `sizeKnown` and `sortTurboFileImageGridItems(...)`.

- [x] **Step 1: Write failing tests** asserting byte-size sorting, both directions, unknown-last behavior, date, type and natural name ordering.
- [x] **Step 2: Run** `scripts\test.bat --grep TurboFileImageGridSort` and confirm the byte-size assertion fails against pixel-area behavior.
- [x] **Step 3: Replace** pixel-area fields and comparison with `rawSize` and `sizeKnown` while retaining deterministic name fallback.
- [x] **Step 4: Run** the focused sort test and confirm all assertions pass.

### Task 2: 局部即时排序交互

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: `sortTurboFileImageGridItems(...)` from Task 1.
- Produces: `updateImageGridAfterSort(state)` for sort-control and virtual-slice refresh.

- [x] **Step 1: Write failing structural assertions** requiring no `prepareImageGridSortMetadata`, no `readImageMetadataBatch`, no full `render()` in `applyImageGridSort`, and a local sort refresh method.
- [x] **Step 2: Run** `scripts\test.bat --grep TurboFileImageGridPane` and confirm the new assertions fail for the existing metadata scan/full render path.
- [x] **Step 3: Remove** image sort metadata status, promise, retry and prewarm fields and methods.
- [x] **Step 4: Map** `rawSize`, `rawModified`, `attrsPending` into the pure sorter and remap selection/loading indexes after sorting.
- [x] **Step 5: Implement** `updateImageGridAfterSort(state)` to preserve scroll position, update the sort control and repaint only the virtual grid slice.
- [x] **Step 6: Run** focused image-grid tests and confirm they pass.

### Task 3: 完整验证

**Files:**
- Verify only.

- [x] **Step 1: Run** `npm run compile-check-ts-native`; expect zero TypeScript errors.
- [x] **Step 2: Run** `scripts\test.bat --grep TurboFileImageGridSort`; expect all tests pass.
- [x] **Step 3: Run** `scripts\test.bat --grep TurboFileImageGridPane`; expect all tests pass.
- [x] **Step 4: Run** `scripts\test.bat --grep TurboFileFileSort`; expect all tests pass.
- [x] **Step 5: Run** `npm run gulp compile-client`; expect compilation with zero errors.
