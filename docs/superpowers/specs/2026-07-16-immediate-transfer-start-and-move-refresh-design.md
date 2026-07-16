# Immediate Transfer Start and Move Refresh Design

## Goal

Make every TurboFile transfer begin as soon as its entry point is triggered, without recursively calculating folder or multi-item totals first, while preserving live transferred bytes, speed, elapsed time, cancellation safety, and transfer throughput. Make every successful move refresh both source and target directories only after source cleanup has completed. Improve the copy/cut badge legibility without changing its footprint or colors.

## Confirmed Behavior

- A single regular file may use its already-known file size and displays `transferred / total`.
- A single folder, multiple files, multiple folders, and mixed selections have an unknown total and display transferred bytes only.
- Unknown-total transfers still display live speed and elapsed time.
- Drag-and-drop, Ctrl+C/V, Ctrl+X/V, same-machine, same-SSH, cross-SSH, upload, and download entry points follow the same immediate-start rule.
- Successful move operations refresh the source directory and target directory after the source has been removed.
- Failed or canceled transfers never delete the source.
- The copy/cut badge remains 24 px wide with the existing left-copy blue, right-copy green, and cut red colors.

## Root Causes

### Startup delay

The current transfer path contains multiple forms of size discovery before or alongside actual transfer work:

- Local native batch copy awaits `getLocalBatchTransferSize`, which recursively walks selected directories before entering the copy loop.
- The renderer starts `fillBatchDirectorySizesInBackground`, which sends a size request for every selected directory and competes with the active transfer for disk and SSH resources.
- Several TAR, SFTP, SCP, same-remote, and relay branches query source directory content size before starting the data command when `expectedBytes` is unknown.

These scans contradict the unknown-total contract and account for the visible preparation delay on first transfer.

### Stale source directory after cut

The per-item internal clipboard fallback refreshes source and target panes before deleting the source. The subsequent deletion can therefore leave a just-refreshed, stale source listing visible. Move completion and refresh logic is also spread across several entry points, which makes ordering inconsistent.

## Design

### 1. Total-size policy

Derive total-size knowledge from the selection shape, not from the transfer protocol:

- Exactly one regular file: use the file size already present in the directory entry or the protocol's non-recursive file metadata.
- Any directory or any selection with more than one item: set the total to unknown (`0` in the existing transfer API) and never discover a recursive total solely for progress display.

No directory size calculation may be started in the renderer, main process, or protocol strategy before transfer. Existing post-start byte reporting remains available:

- Local copy callbacks count bytes actually copied.
- TAR upload/download stream callbacks count archive bytes as they flow.
- Rsync/SCP/SFTP/native direct strategies keep their existing non-blocking progress events or destination-growth sampling after the command has started.

Post-transfer checks required to determine success may remain, but they must not be used to delay command launch or retroactively introduce a progress total for unknown-total transfers.

### 2. Immediate command dispatch

Each entry point performs only the minimum work required to construct a valid command:

1. Capture the user action time and create the task immediately.
2. Validate source and target paths and resolve endpoint/connection information.
3. Select the transfer strategy.
4. Start the copy/move/protocol command.

Recursive local walks, remote `du`/content-size commands, and per-folder background size jobs are excluded from this startup sequence. Necessary SSH connection establishment, target-parent creation, conflict handling, and source-type checks are retained because the transfer command cannot safely run without them.

For local native batch copy, the existing recursive copy routine itself reports byte deltas while copying; it must not perform a separate first traversal.

### 3. Move completion and refresh ordering

All move paths follow the same state machine:

1. Transfer/copy or native rename completes successfully.
2. If the strategy is copy-then-delete, delete all source items.
3. If any source deletion fails, report an error and do not report the move as successful.
4. Invalidate source and target directory caches.
5. Force-refresh every visible pane showing the affected source or target directory.
6. Mark the task successful only after the refresh request has been issued and completed.

Native same-device rename/move skips the copy-then-delete step because the native command already removes the old path, but it still performs cache invalidation and both-directory refresh after the command succeeds.

On cancellation or transfer failure, source deletion is skipped. The target may be refreshed to expose or clean up a partial result according to the existing protocol behavior, but the source listing remains authoritative and intact.

External Windows moves refresh every visible local pane whose current path matches the moved items' source parent, plus the target pane. Cross-device and cross-SSH moves refresh the originating pane and destination pane after main-process cleanup has returned.

### 4. Copy/cut badge typography

Keep the existing 24 x 24 button and 24 x 18 inner badge geometry. Change only the label typography:

- `font-size: 10px` (from 9 px)
- `font-weight: 400` (from 600)

Hover, active, and focus states remain free of the large outer highlight. Existing colors and border geometry remain unchanged.

## Error Handling and Safety

- A move never deletes its source until the transfer result is successful.
- Cancellation is checked before cleanup and prevents cleanup.
- Cleanup failures remain visible as failures; they are never converted into successful moves.
- Removing total-size discovery must not remove protocol success checks or overwrite/conflict protection.
- No new buffering, staging file, throttling, archive wrapper, or progress relay is introduced, so the transfer data path and throughput remain unchanged.

## Test Strategy

Add regression tests before production edits:

- Local native batch transfer does not call or await recursive batch-size discovery before copying.
- Renderer batch transfer does not start background folder-size calculation.
- TAR and other directory/multi-item strategies do not query a recursive source total before command dispatch.
- Single regular-file transfers retain a known total.
- Unknown-total progress preserves transferred bytes, speed, and elapsed time without displaying a total.
- Copy-then-delete moves delete the source before refreshing either pane.
- Successful native and cross-device moves refresh both affected directories.
- Failed and canceled moves do not delete the source.
- Copy/cut badge typography is 10 px and normal weight, while dimensions and colors are unchanged.

Run `npm run compile-check-ts-native` first, then the targeted TurboFile unit tests, then the complete TurboFile unit suite required by the repository.

## Non-Goals

- Changing protocol order or replacing the restored 1.148.0 transfer data path.
- Adding directory totals after a transfer has started.
- Introducing fake progress percentages for unknown totals.
- Changing copy/cut button position, colors, dimensions, or per-pane independence.
- Packaging a new installer unless separately requested.
