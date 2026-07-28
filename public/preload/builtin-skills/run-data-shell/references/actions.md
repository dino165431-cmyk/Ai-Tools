# Native action catalog

## `bash_run`

Runs Bash inside one sandbox workspace. Accepts:

- `command`: required Bash command;
- `workspace_id`: optional workspace id, especially the id provided with a chat attachment;
- `cwd`: optional directory relative to that workspace;
- `timeout_ms`: bounded timeout.

Returns exit status, stdout/stderr, timeout state, workspace id, resolved relative working directory, and `changedFiles`. Each changed file includes a workspace-relative `path` and a data-root-relative `dataPath` used by the result UI.

## `sandbox_import`

Copies explicitly named absolute source file paths into `inbox/`. It only accepts regular files, rejects symlinks, applies per-file and batch size limits, never changes the sources, and returns imported file entries.

## `sandbox_list`

Lists regular non-symlink files in the workspace. Runtime metadata under `.runtime/` is hidden.

## `sandbox_reset`

Deletes a single validated workspace and recreates its empty `inbox/` and `output/` directories. Use only at the user's explicit request.
