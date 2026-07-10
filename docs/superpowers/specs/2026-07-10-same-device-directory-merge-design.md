# Same-Device Directory Merge Design

## Goal

Allow an ordinary folder copy between the left and right panes when both panes point to the same device and the exact target folder already exists. The copy merges directory contents and overwrites same-name files without deleting target-only files.

## Behavior Matrix

| Operation | Endpoints | Existing same-name directory | Behavior |
| --- | --- | --- | --- |
| Copy | Same local device | Yes | Merge; overwrite same-name files |
| Copy | Same SSH connection | Yes | Merge; overwrite same-name files |
| Move / cut | Same device | Yes | Reject |
| Copy or move | Different devices, non-rsync | Yes | Reject |
| Copy or move | Any rsync-only plan | Yes | Keep incremental rsync behavior |
| Any operation | Source directory conflicts with a target file | Yes | Reject |

"Same SSH connection" means identical host, port, and username. A matching display name or path alone is not sufficient.

## Design

The transfer service will make the conflict decision at its public single-item and batch entry points. A same-device directory merge exception is permitted only when the operation is copy and the route is the native same-device route. Cross-device protocol fallbacks do not inherit this exception.

For same-device copies, the native copy implementation will copy the source directory contents into the exact target directory. It must not copy the source directory itself into the existing target, which would create an incorrect `folder/folder` nesting. Existing target-only files remain untouched, while same-name files are replaced.

The lower-level tar, SCP, and SFTP target guards remain in place. They continue to reject existing target directories for cross-device non-rsync transfers, even if an entry-point check is bypassed.

## Error Handling

- A same-name target file is never treated as a mergeable directory.
- A move into an existing same-name directory is rejected before any source deletion.
- A failure during copy leaves the source untouched.
- Existing target contents are never recursively deleted as preparation for a copy.

## Tests

- Same-device single-directory copy permits an existing target directory.
- Same-device batch copy permits existing target directories.
- Same-device move still rejects existing target directories.
- Cross-device tar, SCP, and SFTP transfers still reject existing target directories.
- Explicit rsync remains exempt from the rejection.
- Native POSIX same-device copy merges contents into the exact target and does not create `folder/folder` nesting.
- Existing target-only files survive; same-name files are overwritten.
- TypeScript compilation and the relevant TurboFile unit tests pass.
