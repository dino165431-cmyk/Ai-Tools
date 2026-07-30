# Native action catalog

## `sandbox_status`

Reports the active workspace kind, actual isolation guarantees, relative working directory, and
detected Python/uv/Node/npm/Git/Bash executables. Use `refresh_path: true` after installing a
tool while AI Tools is already running. `workspace_scope` accepts `sandbox` (default) or `host`.

## `sandbox_run`

Runs a command inside one guarded workspace. It uses a dedicated working directory, relative-path
preflight, bounded output, and a timeout, but it is not an OS-level process sandbox. Accepts:

- `command`: required command;
- `shell`: optional `auto`, `powershell`, or `bash`; Windows `auto` uses PowerShell;
- `workspace_id`: optional workspace id, especially the id provided with a chat attachment;
- `workspace_scope`: optional `sandbox` (default) or `host`. Attachments, temporary files,
  intermediate results, and generated artifacts belong in the sandbox. Use `host` only when the
  task explicitly needs the user-selected local workspace;
- `cwd`: optional directory relative to the active workspace. When the user selected a host
  workspace in chat, the host injects that root internally; the model must still use only a
  relative `cwd`;
- `timeout_ms`: bounded timeout.

Returns the selected shell, exit status, stdout/stderr, timeout state, workspace id, resolved relative working directory, and `changedFiles`. Each changed file includes a workspace-relative `path`. Files in the default isolated workspace also include a data-root-relative `dataPath` and a `downloadHref` used by Markdown and the result UI. Files in a user-selected host workspace intentionally omit those fields and are operated on through the validated host workspace root.

## `bash_run`

Compatibility action for Bash-specific commands. Its result contract is the same as `sandbox_run`.

## `sandbox_read_file`

Reads one regular workspace-relative file without a shell. It rejects symlinks and paths outside
the active workspace, normalizes UTF-8, UTF-16LE, and Windows legacy text to Unicode (or returns
base64 when requested), and has a 1MB response limit. It defaults to `workspace_scope: sandbox`;
use `host` only for the selected local workspace.

## `sandbox_write_file`

Creates, overwrites, or appends one workspace-relative file without putting its content in a shell
command. It rejects symlinks and workspace escapes and limits one write to 5MB. The default
`create` mode refuses to replace an existing file; replacement requires explicit `mode: overwrite`.
It defaults to the chat sandbox.

## `sandbox_import`

Copies explicitly named absolute source file paths into `inbox/`. It only accepts regular files, rejects symlinks, applies per-file and batch size limits, never changes the sources, and returns imported file entries.

## `sandbox_list`

Lists regular non-symlink files. `workspace_scope` accepts `sandbox`, `host`, or `all`. When a host
workspace is selected, the chat UI defaults this action to `all`, returning matches from both roots
with `workspaceKind`, `workspaceId`, and `workspacePath` source labels. Runtime metadata under
`.runtime/` is hidden.

## `sandbox_reset`

Deletes a single validated workspace and recreates its empty `inbox/` and `output/` directories. Use only at the user's explicit request.
