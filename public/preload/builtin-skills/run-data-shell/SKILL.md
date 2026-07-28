---
name: run-data-shell
description: Run an explicitly approved Bash command inside the configured Ai Tools data directory with bounded timeout and output. Use when the user asks to execute a shell command, inspect files with command-line tools, run a local script, or automate a task rooted in the application data directory.
---

# Run Data Shell

Use `bash_run` for commands that must execute inside the configured Ai Tools data directory.

The host exposes actions progressively. Use `skill_discover` for the action schema when needed, then invoke it with `skill_call` and `action: "bash_run"`.

- Keep the command narrowly scoped to the request.
- Prefer read-only inspection before a destructive command.
- Require explicit approval for every call.
- Keep paths within the data directory and rely on the runtime boundary checks.
- Set a bounded timeout appropriate to the command.
- Never print tokens, credentials, cookies, or private keys.
- Report the exit code and relevant stdout/stderr without claiming success on a non-zero exit.
- Do not retry a destructive command automatically.

For the action contract, boundary checks, and output behavior, read [references/actions.md](references/actions.md).
