---
name: orchestrate-agents
description: Discover configured Ai Tools agents and delegate bounded sub-tasks through native Skill actions, preserving live trace, approvals, model settings, selected skills, and external MCP access. Use for complex multi-step work, parallelizable research or implementation, specialist delegation, or requests to run a configured agent.
---

# Orchestrate Agents

Use `agents_list` to discover suitable configured agents and `agent_run` to execute one bounded sub-task.

The host exposes actions progressively. Use `skill_discover` for an action schema when needed, then invoke it with `skill_call`; when this guide says “Use `agent_run`”, pass `action: "agent_run"` to that gateway.

## Delegate

- Search by capability, provider, model, prompt, Skill, or external MCP when the agent id is unknown.
- Give each `agent_run` one concrete objective, scope, constraints, and expected output.
- Keep independent work independent; avoid hidden state between delegated tasks.
- Keep direct, small tasks in the current conversation.

## Synthesize

- Review all returned results before answering.
- Reconcile conflicts and identify assumptions.
- Report failures, rejected approvals, partial progress, and residual risk.
- Do not claim a delegated task completed when its status is paused, failed, aborted, or blocked.

The delegated agent may use its selected built-in Skill actions and external MCP servers. Preserve approval boundaries for writes, execution, and shell commands.

For the complete native action catalog, trace lifecycle, and delegation boundaries, read [references/actions.md](references/actions.md).
