---
name: run-data-shell
description: Work on files in a guarded command workspace with structured file reads/writes, explicit file import, bounded PowerShell or Bash execution, toolchain probing, file listing, and user-controlled result export. Use when the user asks to run commands, modify attached/local files, run a script, archive files, or automate a local file task.
---

# Sandboxed Command Workspace

Use this skill for command-line file work. By default, commands run in a dedicated workspace
under the AI Tools data directory rather than in the user's note, session, or configuration
directories. Chat attachments, temporary files, intermediate results, and generated artifacts stay
in this chat sandbox by default, even when the user selected a host workspace. The selected host
workspace is a separate data source/target: use `workspace_scope: host` only when the user asks to
inspect or modify files there. The host injects its root internally; keep `cwd` relative and never
invent or pass an absolute workspace path.

The host exposes actions progressively. Use `skill_discover` for exact schemas, then call them through `skill_call`.

- Call `sandbox_status` before a build or runtime task when tool availability is unknown. It reports the real isolation level and discovers Python, uv, Node, npm, Git, and Bash from a refreshed user/machine PATH.
- Prefer `sandbox_read_file` and `sandbox_write_file` for source code, README files, JSON, and other text. These actions validate relative paths and symlinks structurally, so content containing `/`, URLs, or absolute-path examples is not mistaken for a command escape.
- Use `sandbox_run` only when a process really needs to run. On Windows its `auto` shell uses PowerShell, so built-in commands such as `Compress-Archive`, `Expand-Archive`, and `Get-ChildItem` are available without extra packages.
- PowerShell `Compress-Archive` accepts only a `.zip` destination. For ZIP-based formats with another extension (for example `.apks`, `.jar`, `.docx`, or `.xlsx`), create a temporary `.zip` and rename it to the requested extension after success, or use the .NET compression API. Do not intentionally trigger the known extension error first.
- Use `bash_run` or `sandbox_run` with `shell: bash` only when Bash syntax or Git tools are specifically useful.
- When an attachment block contains `sandbox_workspace_id` and `sandbox_path`, pass that workspace id with `workspace_scope: sandbox` and use the listed relative file path.
- Use `sandbox_import` only when the user explicitly supplied an external absolute path and wants that file copied into the workspace.
- Use `sandbox_list` with `workspace_scope: all` to find files across both the chat sandbox and the selected host workspace. Every result is labeled with its source. Use `sandbox` or `host` when only one side is relevant.
- Keep exploratory scripts, extracted data, caches, temporary archives, and intermediate transformations in the chat sandbox. Use `workspace_scope: host` for reads/writes/commands only when the task explicitly concerns the selected local project or the user asks to save there.
- Use `sandbox_reset` only when the user explicitly asks to clear the workspace.
- Put generated artifacts in the chat sandbox's `output/` where practical so they remain downloadable. Copy or write them to the host workspace only when the user explicitly requests that destination.
- Shell/code execution, writes, imports, resets, and destructive actions require approval. Read-only status/list/read actions can run automatically in low-risk mode.
- Never print tokens, credentials, cookies, private keys, or unrelated user files.
- Treat timeout or non-zero exit as failure even if partial output exists.
- Mention generated files in the final response. In the default isolated workspace, use a returned file's `downloadHref` for Markdown downloads, for example `[下载 result.zip](sandbox-file://chat-id/output/result.zip)`. Never invent a `sandbox-file://` link when `downloadHref` is absent. Files created in a user-selected host workspace intentionally have no `downloadHref`; report their workspace-relative path instead, because the result UI already lets the user open, locate, or save a copy of them.

The workspace boundary is a filesystem guard, not a virtual machine or OS process sandbox.
Every command result reports `isolationLevel`, `sandboxEnforced`, and `networkRestricted`.
A user-selected host workspace can be accessed only through explicit host scope and can directly modify that directory. Keep changes within the user's request and do not
attempt to bypass either workspace boundary with another interpreter, encoded paths, symlinks,
environment tricks, or network access.

For the action contracts and output behavior, read [references/actions.md](references/actions.md).
