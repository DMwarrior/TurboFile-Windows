# Stable Directory Sort Design

## Goal

Every directory must first appear in the final order selected for its pane. No visible list may be rendered in a temporary order and then move after size or modified-time metadata arrives.

## Required Behavior

- Name, type, modified-time, and size sorting must all be correct on the first visible frame of a newly opened directory.
- Ascending and descending directions must both be respected before the directory becomes visible.
- The existing parent-entry and directory-first grouping rules remain unchanged.
- Double-click navigation, parent navigation, path entry, device switching, page restoration, cached navigation, refresh, and sort changes use the same display-readiness rule.
- No loading text, skeleton, animation, transition, or other waiting effect is added.
- A visible directory list must never be re-sorted because lazy metadata enrichment completed.

## Root Cause

Commit `f78b3e7b` introduced names-and-type-only directory listings plus lazy metadata enrichment for visible rows. Commit `2d4622df` removed the resulting jump by loading complete remote attributes through one `find` round trip before rendering. Commit `af0ac035` later restored the names-only foreground path to protect SSH sessions used by background prefetch and image work.

The current conditional foreground path is not a complete invariant. Attribute-incomplete cache entries, device/page restoration, sort-change races, and an already-running visible-row enrichment can still expose or re-sort partial data.

## Design

### Foreground remote navigation

Foreground remote directory loads always use `listRemoteDirectory`, which returns name, type, size, and modified time in one remote `find` command. The renderer converts and sorts the complete entries in memory before one render. It does not issue one SSH stat command per file.

This restores the stable behavior from `2d4622df` without restoring unlimited full-metadata background prefetch.

### Background prefetch

Idle neighbor prefetch remains names-only and bounded, preserving the later SSH session-stability work. A names-only prefetch result may accelerate name or type views, but it never satisfies a foreground modified-time or size view.

For the directory the user directly points to or presses, prefetch uses the pane's current sort requirement. Modified-time and size sorts request the complete listing early; name and type sorts keep the lightweight request.

### Central display-readiness rule

Introduce one renderer predicate that answers whether a cached or snapshotted listing can be displayed for the current pane sort:

- name or type: names and types are sufficient;
- modified time or size: every non-parent entry must have complete attributes.

All navigation and restoration paths use this predicate before assigning visible pane items. An attribute-incomplete listing is never rendered under an attribute-dependent sort.

### Race prevention

When a full foreground listing is loading for modified-time or size sorting, existing lazy visible-row enrichment must not mutate or re-sort the pane. Stale enrichment results are ignored using the existing request/path identity checks plus the foreground-loading state.

Changing from name/type to modified-time/size performs one full foreground read and one final replacement. It does not progressively sort the currently visible subset.

## Performance

- Remote foreground metadata uses one `find` process and one SSH round trip, matching the historically fast stable implementation.
- No per-entry SSH request is added.
- Directory sorting remains an in-memory `Array.sort` operation.
- Background neighbor prefetch stays names-only and bounded, preventing SSH `MaxSessions` pressure.
- Existing caches and in-flight deduplication remain in use, but cache reuse is gated by display readiness.

## Failure Handling

If a complete foreground listing fails, no partial new-directory order is displayed. Existing error handling reports the failure and leaves no partially sorted result that can later jump.

Stale requests from a previous path or sort cannot replace the current pane.

## Verification

- Pure sort tests cover name, type, modified time, and size in both directions, including ties, parent entry, and directory-first grouping.
- Static navigation tests verify foreground remote loads use complete listings and background neighbor prefetch remains lightweight.
- Renderer regression tests verify every cache/restoration path rejects attribute-incomplete data for modified-time and size sorts.
- A race regression test verifies visible-row enrichment cannot re-sort an attribute-dependent foreground load.
- Mandatory TypeScript compilation runs before focused and complete TurboFile tests.

## Scope

This change does not alter transfer protocols, image-grid sorting, toolbar order, file-row styling, or packaging configuration.
