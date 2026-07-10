# SSH Post-Transfer Directory Recovery Design

## Problem

After a multi-item transfer, TurboFile refreshes both panes with forced directory reads. A forced read forgets an existing prefetch request without stopping it, so an old prefetch and the new foreground refresh can overlap on the same shared SSH/SFTP directory session.

When either request fails, the current cleanup path disposes the session by connection key alone. A late failure from the old session can therefore remove and close a newer replacement session. The replacement request then fails with `No response from server`. A manual refresh succeeds because the overlapping requests have finished by that point.

## Goals

- Never let an old request close a newer SSH/SFTP directory session.
- Recover transient directory-read failures without exposing an avoidable offline state.
- Reduce unnecessary post-transfer directory refreshes and channel pressure.
- Prevent stale prefetch results from replacing a fresh post-transfer listing.
- Preserve immediate errors for authentication, permission, missing-path, and invalid-directory failures.
- Keep transfer protocols, transfer data paths, and UI layout unchanged.

## Non-Goals

- Reworking transfer cancellation in this change.
- Changing SSH credentials, device storage, or transfer protocol selection.
- Replacing the directory cache architecture.
- Hiding persistent connection errors.

## Root Cause

The directory session map is keyed by SSH identity and stores a shared session promise. Cleanup currently calls `disposeDirectorySftpSession(key)`. With overlapping requests, this sequence is possible:

1. Requests A and B use session generation 1.
2. A detects a transient disconnect and disposes generation 1.
3. A creates generation 2 and stores it under the same key.
4. B later handles the generation 1 failure and disposes by key.
5. The key now points to generation 2, so B closes the healthy replacement.

Multi-item transfer completion makes the race much more likely because the renderer force-refreshes source and target panes concurrently while prefetch requests may still be running.

## Design

### Generation-Safe Directory Sessions

Each directory SSH/SFTP session receives a monotonically increasing generation number. The service records the current generation for each connection key.

All cleanup paths carry the generation they intend to dispose. A cleanup operation removes the map entry, clears its idle timer, and closes resources only when the expected generation is still current. Close/error callbacks from an old client use the same conditional removal rule.

Idle timers also capture the generation active when the timer is created. A delayed timer from an old generation cannot close a replacement session.

### Transient Read Recovery

Directory reads keep using the shared session fast path. Retryable errors use up to three attempts:

- Attempt 1 uses the current session.
- A retry disposes only the failed generation.
- Retries wait for a short bounded backoff before creating or reusing the replacement session.
- Each retry checks that the error is classified as transient.

Authentication, permission, missing-path, and not-a-directory errors are returned immediately. A prefetch failure remains background-only and does not mark a visible pane offline.

### Post-Transfer Refresh Policy

After an ordinary copy, only the target pane is refreshed because the source directory did not change.

After a move, both source and target panes are refreshed. If both panes use the same SSH identity, the reads run sequentially. Different devices may still refresh concurrently.

The policy is expressed as a small pure helper so copy/move and same-device behavior can be unit tested independently.

### Stale Prefetch Protection

For each pane directory cache key, an in-flight request is applied only if it is still the current tracked request for that key. A force refresh invalidates the older tracked request. The old request may finish, but it cannot overwrite the newer cache entry.

The main-process directory listing cache uses the same invalidation intent: a listing started before a cache-clear event cannot repopulate the cleared entry after a transfer.

## Error Handling

- Transient socket/SFTP errors: generation-safe reconnect and bounded retry.
- Authentication failure: no retry; report the server error.
- Permission failure: no retry; report the path and permission error.
- Missing path/not a directory: no retry; preserve existing path recovery behavior.
- Prefetch failure: discard silently and leave the visible pane unchanged.
- Exhausted transient retries: display the final connection error once.

## Tests

- An old session generation cannot remove or close a newer generation.
- An old idle timer cannot dispose a replacement session.
- Retryable directory errors receive bounded retries; path and permission errors do not.
- Copy completion refreshes only the target pane.
- Move completion refreshes both panes.
- Same-device move refreshes sequentially; different-device move may refresh concurrently.
- A stale prefetch completion cannot overwrite a force-refresh cache entry.
- Existing directory navigation, transfer plan, and SSH main-service regression tests continue to pass, except for any documented pre-existing unrelated failure.

## Verification

- Run `npm run compile-check-ts-native -- --pretty false`.
- Run `npm run gulp compile-client`.
- Run the focused TurboFile directory session, retry, inflight, navigation, and SSH service tests.
- Exercise repeated multi-item transfers followed by target-pane refreshes without observing `No response from server`.
