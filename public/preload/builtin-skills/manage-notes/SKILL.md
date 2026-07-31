---
name: manage-notes
description: Manage Ai Tools Markdown notes and .ipynb super notes with native actions for browsing, recent/search, reading, creating, writing, moving, deleting, editing cells, and executing one or all notebook cells. Use when the user asks to inspect, organize, modify, or run content in the note library, including 超级笔记, Notebook, Python, JavaScript, or SQL cells.
---

# Manage Notes

Use native Skill actions to operate on the real note library under `note/`. Treat action paths as relative to that root.

The host exposes actions progressively. Use `skill_discover` for an action schema when needed, then invoke it with `skill_call`; when this guide says “Call `notes_read`”, pass `action: "notes_read"` to that gateway.

## Locate content

- Call `notes_read` or `notebook_read` directly when the path is known.
- Call `notes_search` for a title, filename, path fragment, or content query.
- Call `notes_list_recent` for recently modified content.
- Call `notes_list_directory` for one directory level.
- Call `notes_list_tree` only for an explicit structural overview or when lighter lookup failed.
- Expect search and recent results to include both `.md` and `.ipynb`. Encrypted Markdown notes are excluded from indexing and direct reads.

## Manage notes

- Call `notes_create` with `type: "markdown"` or `type: "notebook"`.
- Call `notes_write` only for Markdown text. Append by default; use overwrite only when the user clearly requests replacement.
- Call `notes_move` to rename or move a Markdown note, a super note, or a directory.
- Call `notes_delete` only after the requested target is unambiguous. This may also remove the matching asset directory.
- Return the final relative path after every successful mutation.

## Manage super notes

- Call `notebook_read` before editing unless the target and cell id/index are already known.
- Call `notebook_create` to create an empty or pre-populated `.ipynb`.
- Call `notebook_update_cell` to add or replace a cell. Preserve other cells and metadata.
- Call `notebook_delete_cell` only for an explicit cell id or verified index.
- Use cell runtimes `python`, `javascript`, or `sql`.

## Execute super notes

- Call `notebook_execute_cell` for one code cell and `notebook_execute_all` for all code cells in order.
- Notebook execution runs in the host Python/JavaScript runtime, not in the chat sandbox. It can access host files and start processes.
- Treat every execution as a high-risk host action that requires a fresh, non-reusable approval in normal and high-risk-auto modes. Trusted tool mode intentionally approves all tools without prompting.
- Never add or rewrite a code cell and then execute it as a way to bypass the sandbox. Use the sandbox Skill for AI-authored scripts and intermediate artifacts.
- Only use the host Notebook runtime when the user explicitly asks to run that notebook or cell and accepts the host-execution warning.
- Outputs are persisted to the `.ipynb` by default. Use `save: false` when the user wants a transient run.
- Stop on the first error by default. Continue only when the user asks for it.
- Never claim a cell ran unless the action returned a successful execution result.

## Safety

- Resolve ambiguous names with search or one focused question.
- Do not overwrite, move, delete, or execute merely because a path resembles the intended target.
- Do not expose secrets found in note content or execution output.
- Report partial execution and the failing cell when a notebook run stops.

For the complete native action catalog and notebook behavior, read [references/actions.md](references/actions.md).
