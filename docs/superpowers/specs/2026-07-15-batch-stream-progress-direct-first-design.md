# TurboFile Batch Stream Progress and Direct-First Routing Design

**Date:** 2026-07-15
**Status:** Approved in chat

## Goal

Start multi-item and directory tar transfers immediately without walking the source tree to calculate a logical total. While the transfer is running, show only the bytes that have actually passed through the transfer, the current speed, and elapsed time. Preserve the existing single regular-file SCP behavior, including its known total size.

For SSH-to-SSH transfers, optimistically try both direct server-to-server directions before using a relay. A cached or recently failed route may affect ordering, but it must not classify the devices as relay-only.

## Progress Policy

- A single regular file keeps its existing SCP size and percentage behavior.
- A transfer containing multiple selected items starts with `expectedBytes = 0`, including when every selected item is a regular file with a known listing size.
- A directory transferred through tar also starts with an unknown total because recursively calculating it has the same metadata cost as walking all contained files.
- Unknown-total transfers show transferred bytes, current speed, and elapsed time. They do not show a denominator, percentage-derived ETA, or a misleading partial total.
- Local-to-SSH and SSH-to-local tar transfers count archive bytes in the existing stream callback.
- SSH-to-SSH relay tar transfers add a pass-through counter to the existing Node.js pipeline.
- SSH-to-SSH direct tar transfers must not poll the target with recursive `find`/`du`. Direct progress uses lightweight output from the direct stream when available; otherwise the UI remains indeterminate until completion rather than scanning the directory tree.
- Completion uses the successful exit status of both tar endpoints. A failed or canceled move never deletes source items.

Archive bytes are intentionally used instead of logical file sizes. Tar headers can make this value slightly larger than the sum of file contents, but it accurately represents transferred stream data and has effectively no additional filesystem traversal cost.

## Direct-First Routing

- Every automatic SSH-to-SSH transfer plan is ordered as direct, then relay for the same protocol.
- The direct route resolver always returns `source-push` and `target-pull` candidates when both endpoints have SSH connection details.
- A previously successful route is tried first.
- A route in failure cooldown is moved later in the direct ordering, not removed. This prevents a stale classification from skipping direct transfer entirely.
- If both direct directions fail or stall within the existing bounded timeout, the current relay attempt runs automatically.
- An explicit relay strategy hint remains respected.

## Code Changes

1. Remove UI background directory-size calculation from batch transfer entry points and force batch request/item expected sizes to zero.
2. Make the main-process batch total policy authoritative so callers cannot accidentally re-enable a multi-item pre-scan.
3. Remove batch tar source-size promises, blocking size scans, and recursive target-growth polling.
4. Count archive bytes in upload, download, and relay pipelines and report progress with `totalBytes = 0`.
5. Preserve single regular-file SCP expected-size handling.
6. Change direct-route cooldown filtering into stable prioritization so both direct directions remain candidates before relay.
7. Keep existing cancellation and move cleanup ordering unchanged.

## Testing

- Unit/static tests prove multi-item requests do not pass known totals or call background size calculation.
- Tests prove batch tar paths do not call source/target recursive size helpers before or during transfer.
- Tests prove relay tar counts stream bytes with an unknown total.
- Transfer-plan tests retain direct-before-relay ordering.
- Route-resolution tests prove cooldown cannot eliminate all direct candidates.
- Existing single-file SCP plan tests continue to pass unchanged.
- Run `npm run compile-check-ts-native` before the targeted TurboFile unit tests, then run the relevant test suites.

## Non-Goals

- No optional pre-scan toggle.
- No per-file logical byte accounting inside tar.
- No change to single-file SCP behavior.
- No change to same-device native copy or move behavior.
