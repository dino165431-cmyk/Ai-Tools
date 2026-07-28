# Native action catalog

## Discover

`agents_list` returns configured agents with provider, model, prompt, selected Skills, external MCP bindings, and matching metadata. Use it before delegation when the exact agent id is unknown.

## Run

`agent_run` executes one bounded task with the selected agent. It can expose that agent's built-in native Skill actions and external MCP tools while preserving the application's approval flow.

The run lifecycle can report live reasoning, tool requests, approval pauses, tool results, final output, metrics, failure, or abort. Callers must preserve the trace and must not present a paused or failed run as completed.

Do not delegate recursively to this orchestration Skill. Keep task scope explicit and synthesize the returned evidence in the parent conversation.
