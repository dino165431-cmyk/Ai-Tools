---
name: run-data-shell
description: Work on files in a guarded command workspace with structured file reads/writes, explicit file import, bounded PowerShell or Bash execution, toolchain probing, file listing, and user-controlled result export. Use when the user asks to run commands, modify attached/local files, run a script, archive files, or automate a local file task.
---

# Sandboxed Command Workspace

Use this skill for command-line file work. By default, commands run in a dedicated workspace
under the AI Tools data directory rather than in the user's note, session, or configuration
directories. If the current chat explicitly says that the user selected a host workspace,
`sandbox_run` and `bash_run` run there instead. The host injects that root internally; keep
`cwd` relative and never invent or pass an absolute workspace path.

The host exposes actions progressively. Use `skill_discover` for exact schemas, then call them through `skill_call`.

- Call `sandbox_status` before a build or runtime task when tool availability is unknown. It reports the real isolation level and discovers Python, uv, Node, npm, Git, and Bash from a refreshed user/machine PATH.
- Prefer `sandbox_read_file` and `sandbox_write_file` for source code, README files, JSON, and other text. These actions validate relative paths and symlinks structurally, so content containing `/`, URLs, or absolute-path examples is not mistaken for a command escape.
- Use `sandbox_run` only when a process really needs to run. On Windows its `auto` shell uses PowerShell, so built-in commands such as `Compress-Archive`, `Expand-Archive`, and `Get-ChildItem` are available without extra packages.
- Use `bash_run` or `sandbox_run` with `shell: bash` only when Bash syntax or Git tools are specifically useful.
- When an attachment block contains `沙盒工作区` and `沙盒文件`, pass that workspace id to the run action and use the listed relative file path.
- Use `sandbox_import` only when the user explicitly supplied an external absolute path and wants that file copied into the workspace.
- Use `sandbox_list` to inspect available or generated files in either the default workspace or an explicitly selected host workspace.
- Use `sandbox_reset` only when the user explicitly asks to clear the workspace.
- Put final artifacts in `output/` where practical.
- Shell/code execution, writes, imports, resets, and destructive actions require approval. Read-only status/list/read actions can run automatically in low-risk mode.
- Never print tokens, credentials, cookies, private keys, or unrelated user files.
- Treat timeout or non-zero exit as failure even if partial output exists.
- Mention generated files in the final response. Use each returned file's `downloadHref` for Markdown downloads, for example `[下载 result.zip](sandbox-file://chat-id/output/result.zip)`. Do not invent a plain relative link. The UI lets the user open, locate, copy the path of, or save a copy of returned files.

The workspace boundary is a filesystem guard, not a virtual machine or OS process sandbox.
Every command result reports `isolationLevel`, `sandboxEnforced`, and `networkRestricted`.
A user-selected host workspace can directly modify that directory. Keep changes within the user's request and do not
attempt to bypass either workspace boundary with another interpreter, encoded paths, symlinks,
environment tricks, or network access.

For the action contracts and output behavior, read [references/actions.md](references/actions.md).
