# Native action catalog

## `sandbox_run`

Runs a command inside one sandbox workspace. Accepts:

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

## `sandbox_import`

Copies explicitly named absolute source file paths into `inbox/`. It only accepts regular files, rejects symlinks, applies per-file and batch size limits, never changes the sources, and returns imported file entries.

## `sandbox_list`

Lists regular non-symlink files in the workspace. Runtime metadata under `.runtime/` is hidden.

## `sandbox_reset`

Deletes a single validated workspace and recreates its empty `inbox/` and `output/` directories. Use only at the user's explicit request.
