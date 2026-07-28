# Native action catalog

`bash_run` accepts a command, an optional working directory relative to the configured data root, and a bounded timeout.

The runtime:

- rejects working directories outside the data root;
- selects an available Bash executable;
- caps timeout and captured output;
- returns exit code, stdout, stderr, timeout state, and resolved working directory;
- requires approval for every invocation.

Use exact paths, avoid secret-bearing output, and treat a timeout or non-zero exit as a failed command even when partial stdout is available.
