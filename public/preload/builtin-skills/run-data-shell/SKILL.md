---
name: run-data-shell
description: Work on files in an isolated command workspace with explicit file import, bounded PowerShell or Bash execution, file listing, and user-controlled result export. Use when the user asks to run commands, modify attached/local files, run a script, archive files, or automate a local file task.
---

# Sandboxed Command Workspace

Use this skill for command-line file work. Commands run in a dedicated workspace under the AI Tools data directory rather than in the user's note, session, or configuration directories.

The host exposes actions progressively. Use `skill_discover` for exact schemas, then call them through `skill_call`.

- Prefer `sandbox_run`. On Windows its `auto` shell uses PowerShell, so built-in commands such as `Compress-Archive`, `Expand-Archive`, `Get-ChildItem`, and `Copy-Item` are available without extra packages.
- Use `bash_run` or `sandbox_run` with `shell: bash` only when Bash syntax or Git tools are specifically useful.
- When an attachment block contains `沙盒工作区` and `沙盒文件`, pass that workspace id to the run action and use the listed relative file path.
- Use `sandbox_import` only when the user explicitly supplied an external absolute path and wants that file copied into the workspace.
- Use `sandbox_list` to inspect available or generated files.
- Use `sandbox_reset` only when the user explicitly asks to clear the workspace.
- Put final artifacts in `output/` where practical.
- Every action requires approval. Do not retry destructive commands automatically.
- Never print tokens, credentials, cookies, private keys, or unrelated user files.
- Treat timeout or non-zero exit as failure even if partial output exists.
- Mention generated files in the final response. Use each returned file's `downloadHref` for Markdown downloads, for example `[下载 result.zip](sandbox-file://chat-id/output/result.zip)`. Do not invent a plain relative link. The UI lets the user open, locate, copy the path of, or save a copy of returned files.

The workspace boundary is a filesystem guard, not a virtual machine. Do not attempt to bypass it with another interpreter, encoded paths, symlinks, environment tricks, or network access.

For the action contracts and output behavior, read [references/actions.md](references/actions.md).
