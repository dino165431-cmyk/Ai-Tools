---
name: run-data-shell
description: Work on files in an isolated command workspace with explicit file import, bounded Bash execution, file listing, and user-controlled result export. Use when the user asks to run commands, modify attached/local files, run a script, or automate a local file task.
---

# Sandboxed Command Workspace

Use this skill for command-line file work. Commands run in a dedicated workspace under the AI Tools data directory rather than in the user's note, session, or configuration directories.

The host exposes actions progressively. Use `skill_discover` for exact schemas, then call them through `skill_call`.

- Use `bash_run` to execute a narrowly scoped command in the workspace.
- When an attachment block contains `沙盒工作区` and `沙盒文件`, pass that workspace id to `bash_run` and use the listed relative file path.
- Use `sandbox_import` only when the user explicitly supplied an external absolute path and wants that file copied into the workspace.
- Use `sandbox_list` to inspect available or generated files.
- Use `sandbox_reset` only when the user explicitly asks to clear the workspace.
- Put final artifacts in `output/` where practical.
- Every action requires approval. Do not retry destructive commands automatically.
- Never print tokens, credentials, cookies, private keys, or unrelated user files.
- Treat timeout or non-zero exit as failure even if partial output exists.
- Mention generated files in the final response. The UI lets the user open, locate, copy the path of, or save a copy of returned files.

The workspace boundary is a filesystem guard, not a virtual machine. Do not attempt to bypass it with another interpreter, encoded paths, symlinks, environment tricks, or network access.

For the action contracts and output behavior, read [references/actions.md](references/actions.md).
