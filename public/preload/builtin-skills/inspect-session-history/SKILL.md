---
name: inspect-session-history
description: Search, browse, read, and analyze Ai Tools chat sessions and timed-task execution logs with native read-only actions. Use when the user asks about prior conversations, task runs, recent failures, historical decisions, session files, cron logs, or comparisons across stored sessions.
---

# Inspect Session History

Read stored session JSON under `session/`. Timed-task runs usually live under `session/定时任务/`.

The host exposes actions progressively. Use `skill_discover` for an action schema when needed, then invoke it with `skill_call`; when this guide says “Call `sessions_read`”, pass `action: "sessions_read"` to that gateway.

## Locate sessions

- Call `sessions_read` directly for one known path.
- Call `sessions_read_many` only for a small verified set of paths.
- Call `sessions_search` for a title, filename, path fragment, message excerpt, or task topic.
- Call `sessions_list_recent` for recent activity or failures.
- Call `sessions_list_directory` for one directory level.
- Call `sessions_list_tree` only for an explicit hierarchy request or when lighter lookup failed.

## Analyze

- Narrow the candidate set before reading full JSON.
- Distinguish user messages, assistant messages, tool events, approvals, errors, and final outcomes.
- Compare timestamps and execution status when diagnosing timed tasks.
- Cite session-relative paths in the answer so the user can verify the source.
- State when stored records are incomplete or truncated.

Do not mutate session files through this Skill.

For the complete read-only action catalog and response expectations, read [references/actions.md](references/actions.md).
