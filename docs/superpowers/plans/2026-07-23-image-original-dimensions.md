# Image Original Dimensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure transformed SSH thumbnails retain and display their source image dimensions without adding an SSH round trip or directory scan.

**Architecture:** Extend the existing length-framed image batch response with original width and height fields. Parse those fields into the shared batch-entry contract and merge them into the image-grid model, whose formatter already prefers original dimensions.

**Tech Stack:** TypeScript, POSIX shell command generation, Mocha TDD tests.

## Global Constraints

- Keep one SSH command per normal visible thumbnail batch.
- Do not call `readImageMetadataBatch` from the image grid.
- Do not change thumbnail concurrency, dimensions, quality, or transfer payload strategy.
- Preserve all unrelated working-tree changes.

---

### Task 1: Add the failing end-to-end source contract test

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: existing `ITurboFileImageBatchEntry`, batch command builder/parser, and image-grid result merge.
- Produces: a regression test covering all layers that must carry original dimensions.

- [ ] Add a test asserting that the contract, command frame, parser and editor merge all contain original dimension fields.
- [ ] Compile the updated test and run it to verify it fails because the batch contract does not yet carry dimensions.

### Task 2: Extend the existing image batch frame

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`

**Interfaces:**
- Consumes: existing `readImageBatch()` result flow.
- Produces: optional `originalWidth` and `originalHeight` on `ITurboFileImageBatchEntry`.

- [ ] Add optional original dimension fields to the shared batch entry.
- [ ] Emit original dimensions in the same remote batch command only when a thumbnail is transformed.
- [ ] Parse the two new frame fields without changing payload framing.
- [ ] Merge parsed dimensions into the image-grid model before rendering the thumbnail.
- [ ] Run compilation and the focused regression test until it passes.

### Task 3: Verify compatibility and performance invariants

**Files:**
- Test: existing TurboFile image and static test suites.

**Interfaces:**
- Consumes: compiled source from Task 2.
- Produces: verification evidence only.

- [ ] Run `npm run compile-check-ts-native` and require exit code 0.
- [ ] Run TurboFile image dimension, metadata, resource, preview and grid-pane tests.
- [ ] Inspect the diff to confirm no metadata pre-scan, extra normal-path SSH call, or concurrency change was introduced.
