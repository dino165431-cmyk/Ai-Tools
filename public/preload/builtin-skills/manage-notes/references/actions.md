# Native action catalog

All paths are relative to the configured `note/` root. The runtime rejects traversal outside that root.

## Locate and read

- `notes_list_directory`: list one directory level.
- `notes_list_recent`: return recently modified Markdown and notebook files.
- `notes_search`: search indexed titles, paths, Markdown text, and notebook cell content.
- `notes_list_tree`: return a bounded directory tree.
- `notes_read`: read a Markdown note.
- `notebook_read`: parse a `.ipynb` super note and return normalized cells and metadata.

## Mutate

- `notes_create`: create a Markdown note or notebook.
- `notes_write`: append to or explicitly overwrite Markdown.
- `notes_move`: move or rename a note, notebook, or directory.
- `notes_delete`: delete a verified target and its associated asset directory when applicable.
- `notebook_create`: create an empty or pre-populated notebook.
- `notebook_update_cell`: append or replace one verified cell while preserving other cells.
- `notebook_delete_cell`: remove one cell by id or index.

Mutations require approval. Move and delete operations must use the exact relative path returned by a read or lookup action.

## Execute notebooks

- `notebook_execute_cell`: execute one code cell.
- `notebook_execute_all`: execute code cells in document order.

Supported runtimes are Python, JavaScript, and SQL. Execution requires approval. The default persists normalized outputs and execution metadata; `save: false` returns transient outputs without rewriting the notebook. Whole-notebook execution stops at the first failure unless `continue_on_error` is explicitly enabled.

Notebook execution uses the host runtime and is outside the chat sandbox. Agent-triggered execution therefore requires a fresh hard approval for every call and cannot be remembered for the session unless trusted tool mode is enabled; trusted mode intentionally approves every tool call. AI-authored code should run through the sandbox Skill instead of being staged in a super note.
