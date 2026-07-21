# 图片网格快速且正确的排序实施计划

> 此计划中的图片头元数据预热已被 `2026-07-17-image-grid-instant-file-sort.md` 取代。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图片网格的名称、类型、修改日期和原始像素面积排序全部正确，并使元数据就绪后的排序切换只进行同步内存排序。

**Architecture:** 把比较规则提取为纯函数模块；在主进程增加批量图片元数据接口，通过单个或少量批次读取文件属性和有限图片头；图片网格打开时主动预热并缓存结果，排序点击只使用缓存。缩略图加载不再驱动排序。

**Tech Stack:** TypeScript、VS Code service DI/main-process remote service、Node.js 文件与 SSH 流、Mocha 单元测试。

## Global Constraints

- “大小”表示原始宽度 × 原始高度，不表示文件字节大小。
- 元数据未知项无论递增或递减都排在已知项之后。
- 禁止为了排序下载完整大图，禁止每张图片一次 SSH 连接或命令。
- 排序后必须保持单选、多选、锚点和滚动位置。
- 修改现有共享文件时保留工作区中用户已有改动；未经用户要求不提交实现文件。
- 测试前必须运行 `npm run compile-check-ts-native`；不得运行 `npm run compile`。

---

### Task 1: 可测试的图片网格纯排序器

**Files:**
- Create: `src/vs/workbench/contrib/turbofile/common/turbofileImageGridSort.ts`
- Create: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridSort.test.ts`

**Interfaces:**
- Produces: `TurboFileImageGridSortKey`, `ITurboFileImageGridSortableItem`, `sortTurboFileImageGridItems(items, key, descending)`。

- [ ] **Step 1: 写失败测试**

测试数据直接构造名称、修改时间、原始宽高和就绪标记，断言：

```ts
assert.deepStrictEqual(names('date', true), ['new.jpg', 'old.jpg', 'unknown.jpg']);
assert.deepStrictEqual(names('size', false), ['small.jpg', 'large.jpg', 'unknown.jpg']);
assert.deepStrictEqual(names('size', true), ['large.jpg', 'small.jpg', 'unknown.jpg']);
assert.deepStrictEqual(names('name', false), ['image2.jpg', 'image10.jpg']);
assert.deepStrictEqual(names('type', false), ['a.jpg', 'b.png']);
```

- [ ] **Step 2: 编译并确认 RED**

Run:

```powershell
npm run compile-check-ts-native
```

Expected: FAIL，因为 `turbofileImageGridSort.ts` 尚不存在。

- [ ] **Step 3: 实现最小纯排序器**

核心规则：

```ts
export function sortTurboFileImageGridItems<T extends ITurboFileImageGridSortableItem>(items: readonly T[], key: TurboFileImageGridSortKey, descending: boolean): T[] {
	return [...items].sort((left, right) => compareTurboFileImageGridItems(left, right, key, descending));
}
```

日期和尺寸先比较 `modifiedKnown`/`dimensionsKnown`，已知项永远在前；两个已知项才按方向比较数值；未知项按名称稳定排序。

- [ ] **Step 4: 确认 GREEN**

Run:

```powershell
npm run compile-check-ts-native
node build/next/index.ts transpile
node test/unit/node/index.js --run src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridSort.test.ts
```

Expected: 编译通过，排序测试全部通过。

---

### Task 2: 有限图片头尺寸解析器

**Files:**
- Create: `src/vs/platform/turbofile/common/turbofileImageMetadata.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileImageMetadata.test.ts`

**Interfaces:**
- Produces: `ITurboFileImageDimensions` 和 `readTurboFileImageDimensions(name, bytes)`。
- Consumed by: Task 3 的本地和远端批量元数据读取。

- [ ] **Step 1: 写失败测试**

用小型合成头部覆盖 PNG、JPEG、GIF、BMP、WebP、ICO、TIFF、SVG 和 AVIF；另测截断、损坏数据返回 `undefined`。示例：

```ts
assert.deepStrictEqual(readTurboFileImageDimensions('a.png', pngHeader(1920, 1080)), { width: 1920, height: 1080 });
assert.deepStrictEqual(readTurboFileImageDimensions('a.jpg', jpegHeader(4032, 3024)), { width: 4032, height: 3024 });
assert.strictEqual(readTurboFileImageDimensions('bad.png', new Uint8Array([1, 2, 3])), undefined);
```

- [ ] **Step 2: 编译并确认 RED**

Run `npm run compile-check-ts-native`。

Expected: FAIL，因为图片头解析模块尚不存在。

- [ ] **Step 3: 实现格式解析**

解析器只读取传入的有限字节，不访问文件系统；所有宽高必须为安全正整数。JPEG 扫描 SOF 标记，TIFF 读取首个 IFD 的 256/257 标签，AVIF 选择有效 `ispe` 中面积最大的尺寸，SVG 优先宽高并回退 `viewBox`。

- [ ] **Step 4: 确认 GREEN**

Run:

```powershell
npm run compile-check-ts-native
node build/next/index.ts transpile
node test/unit/node/index.js --run src/vs/platform/turbofile/test/common/turbofileImageMetadata.test.ts
```

Expected: 所有格式和损坏输入测试通过。

---

### Task 3: 主进程批量图片排序元数据接口

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileImageMetadataBatch.test.ts`

**Interfaces:**
- Produces: `ITurboFileImageMetadataEntry { path, size, modified, width?, height? }`。
- Produces: `ITurboFileSshService.readImageMetadataBatch(endpoint, paths)`。
- Consumes: `readTurboFileImageDimensions`。

- [ ] **Step 1: 写失败测试**

为二进制 NUL 分帧解析写真实测试，覆盖路径、大小、秒级修改时间、工具返回的宽高、头部长度和损坏尾帧；静态测试断言接口按批次读取有限头部，且方法体不调用逐图 `readImage`。

- [ ] **Step 2: 编译并确认 RED**

Run `npm run compile-check-ts-native`。

Expected: FAIL，因为服务契约和批量实现尚不存在。

- [ ] **Step 3: 实现批量接口**

- 本地：并发上限内执行 `stat`，每个文件只读取前 `262144` 字节。
- POSIX SSH：把路径分成有大小限制的批次；每批只执行一个远端 shell 命令。命令优先用 `vipsheader` 或 ImageMagick `identify` 返回原始宽高；无法由工具识别时才返回有限头部。帧格式为 `path\0size\0mtime\0width\0height\0headerLength\0<header bytes>`。
- Windows SSH：每批只执行一个 PowerShell 命令，优先通过可用的系统图片元数据能力读取宽高，无法识别时返回包含 Base64 有限头部的压缩 JSON。
- 每个批次共享已有 SSH 会话；单文件失败转换为缺失宽高的条目，不使整批失败。

- [ ] **Step 4: 确认 GREEN**

Run:

```powershell
npm run compile-check-ts-native
node build/next/index.ts transpile
node test/unit/node/index.js --run src/vs/platform/turbofile/test/common/turbofileImageMetadataBatch.test.ts
node test/unit/node/index.js --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
```

Expected: 编译及批量协议测试通过。

---

### Task 4: 图片网格主动预热和一次性排序

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: `sortTurboFileImageGridItems` 和 `readImageMetadataBatch`。
- Produces: 网格状态中的元数据就绪状态、请求代次和预热 Promise。

- [ ] **Step 1: 写失败测试**

静态/状态测试断言：

```ts
assert.ok(editor.includes('void this.prepareImageGridSortMetadata(nextState)'));
assert.ok(editor.includes('this.sshService.readImageMetadataBatch('));
assert.ok(!editor.includes('resortImageGridAfterSizeUpdate'));
assert.ok(editor.includes('sortTurboFileImageGridItems'));
```

纯状态测试验证排序前后根据路径恢复 `selectedIndex`、`selectedIndexes` 和锚点。

- [ ] **Step 2: 编译并确认 RED**

Run `npm run compile-check-ts-native`。

Expected: FAIL，因为预热方法和新排序器接线尚不存在。

- [ ] **Step 3: 实现预热与接线**

- `openImageGrid` 完成状态创建后立即启动 `prepareImageGridSortMetadata`。
- 批量结果按路径一次性写回 `rawModified`、`rawSize`、`originalWidth`、`originalHeight` 和已知标记。
- 请求代次不匹配或网格已关闭时丢弃结果。
- 名称/类型立即同步排序；日期/大小未就绪时记录目标排序并显示“正在准备排序信息”，就绪后只调用一次 `resortImageGridState`。
- 删除缩略图 `load`、预览 `load` 和单图读取完成后的逐张大小重排。
- 重排前保存滚动位置，重排后保持同一图片路径、多选和锚点。

- [ ] **Step 4: 确认 GREEN**

Run:

```powershell
npm run compile-check-ts-native
node build/next/index.ts transpile
node test/unit/node/index.js --run src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridSort.test.ts
node test/unit/node/index.js --run src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts
```

Expected: 排序和网格接线测试全部通过。

---

### Task 5: 回归和性能约束验证

**Files:**
- Verify only; no additional production scope.

- [ ] **Step 1: 运行最终编译检查**

Run `npm run compile-check-ts-native`。

Expected: PASS。

- [ ] **Step 2: 运行全部 TurboFile 图片和排序测试**

转译后依次运行文件名匹配 `turbofile(FileSort|Image).*\.test\.ts` 的测试。

Expected: 全部 PASS。

- [ ] **Step 3: 检查性能不变量**

使用源码断言确认：已就绪的排序点击路径只调用纯排序器；元数据接口按批次调用；不存在逐张图片加载后重排；不存在为排序读取完整文件的调用。

- [ ] **Step 4: 检查差异边界**

Run `git diff --check` 仅针对本计划涉及文件，并确认未暂存工作区中用户已有修改。
