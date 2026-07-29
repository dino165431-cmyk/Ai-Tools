# Native action catalog

## `sandbox_status`

Reports the active workspace kind, actual isolation guarantees, relative working directory, and
detected Python/uv/Node/npm/Git/Bash executables. Use `refresh_path: true` after installing a
tool while AI Tools is already running.

## `sandbox_run`

Runs a command inside one guarded workspace. It uses a dedicated working directory, relative-path
preflight, bounded output, and a timeout, but it is not an OS-level process sandbox. Accepts:

- `command`: required command;
- `shell`: optional `auto`, `powershell`, or `bash`; Windows `auto` uses PowerShell;
- `workspace_id`: optional workspace id, especially the id provided with a chat attachment;
- `cwd`: optional directory relative to the active workspace. When the user selected a host
  workspace in chat, the host injects that root internally; the model must still use only a
  relative `cwd`;
- `timeout_ms`: bounded timeout.

Returns the selected shell, exit status, stdout/stderr, timeout state, workspace id, resolved relative working directory, and `changedFiles`. Each changed file includes a workspace-relative `path`, a data-root-relative `dataPath`, and a `downloadHref` used by Markdown and the result UI.

## `bash_run`

Compatibility action for Bash-specific commands. Its result contract is the same as `sandbox_run`.

## `sandbox_read_file`

Reads one regular workspace-relative file without a shell. It rejects symlinks and paths outside
the active workspace, supports UTF-8 or base64, and has a 1MB response limit.

## `sandbox_write_file`

Creates, overwrites, or appends one workspace-relative file without putting its content in a shell
command. It rejects symlinks and workspace escapes and limits one write to 5MB. The default
`create` mode refuses to replace an existing file; replacement requires explicit `mode: overwrite`.

## `sandbox_import`

Copies explicitly named absolute source file paths into `inbox/`. It only accepts regular files, rejects symlinks, applies per-file and batch size limits, never changes the sources, and returns imported file entries.

## `sandbox_list`

Lists regular non-symlink files in the active default or host workspace. Runtime metadata under
`.runtime/` is hidden.

## `sandbox_reset`

Deletes a single validated workspace and recreates its empty `inbox/` and `output/` directories. Use only at the user's explicit request.
