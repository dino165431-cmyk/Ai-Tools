---
name: manage-ai-tools-config
description: Inspect and safely manage Ai Tools providers, external MCP servers, skills, prompts, agents, timed tasks, and system time through native Skill actions. Use when the user asks to add, update, delete, import, list, or troubleshoot application configuration, model settings, API providers, automations, prompts, or agent bindings.
---

# Manage Ai Tools Config

Use native Skill actions to inspect and change the real application configuration.

The host exposes actions progressively. Use `skill_discover` for an action schema when needed, then invoke it with `skill_call`; when this guide says “Call `config_list_skills`”, pass `action: "config_list_skills"` to that gateway.

## Workflow

1. Call the matching `config_list_*` action before a mutation when the `_id` is unknown.
2. Use the returned exact `_id`; never invent one for an existing record.
3. Call `config_add_*` with the complete object.
4. Call `config_update_*` with `{ "id": "...", "patch": { ... } }`. In shorthand, every update uses `{ id, patch }`; never flatten patch fields into the top level.
5. Call `config_delete_*` only when the user clearly requested removal and the target is exact.
6. Call `config_get_system_time` when a timed-task date or timezone needs a current reference.
7. Report the changed fields, impact, and where to verify them.

## Skills

- Prefer `config_import_skill_directory` or `config_import_skill_file` for a standard Skill containing `SKILL.md`.
- Use `config_add_skill` only for legacy inline skills or when the user explicitly wants inline content.
- A directory Skill keeps its managed `sourcePath`, entry file, parsed interface metadata, package file index, and import origin.
- Preserve existing bindings unless the user asks to replace them.

## Validation

- Keep `args` as a string array.
- Keep `env` and `headers` as objects.
- When changing `transportType`, provide all required fields for the new transport in the same patch.
- When changing a timed-task trigger type, provide the complete compatible `trigger`.
- Use an absolute path for Skill imports.

## Security

- Never reveal `apikey`, secret environment values, authorization headers, tokens, or cookies.
- Treat `***` in list output as a redaction marker. Never write it back as a real credential.
- Do not modify or delete built-in Skill, Prompt, Agent, or Provider records beyond the explicitly supported fields.
- Require approval for every configuration mutation.

For the complete native action catalog and field rules, read [references/actions.md](references/actions.md).
