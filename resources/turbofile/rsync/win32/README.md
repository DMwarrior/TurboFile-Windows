Bundled Windows rsync lives in this folder.

TurboFile uses this folder first so Windows users do not need to install or configure rsync,
OpenSSH, Cygwin, MSYS2, or PATH entries manually.

Current bundled runtime:

- rsync 3.4.3-1 from MSYS2 `msys/x86_64`
- OpenSSH 10.3p1-1 from MSYS2 `msys/x86_64`
- MSYS2 runtime DLLs required by rsync/OpenSSH

Runtime behavior:

- The app prepends this folder to `PATH`.
- `rsync.exe` is resolved from here first.
- `ssh.exe` is resolved from here when present, so rsync over SSH does not depend on Windows'
  optional OpenSSH client.
- Password authentication is handled by TurboFile through a temporary askpass script.

When updating this bundle, keep rsync on the latest stable upstream release and refresh the
matching MSYS2 runtime dependencies. Keep package metadata under `licenses/pkginfo` for auditability.
