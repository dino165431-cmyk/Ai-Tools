# Native action catalog

All actions are read-only and confined to the configured `session/` root.

- `sessions_list_directory`: list one directory level.
- `sessions_list_recent`: return bounded recent session or timed-task files.
- `sessions_search`: search indexed titles, paths, participants, messages, and task content.
- `sessions_list_tree`: return a bounded hierarchy when a structural view is required.
- `sessions_read`: read and optionally parse one verified JSON session.
- `sessions_read_many`: read a small bounded set and report per-file errors without hiding successful results.

Search and recent actions should narrow candidates before full reads. Parsed output can contain messages, tool calls, approvals, timing, errors, and incomplete runs; consumers must distinguish these event types instead of treating all stored text as a final answer.
