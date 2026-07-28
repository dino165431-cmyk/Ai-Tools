# Native action catalog

The configuration Skill manages application records directly. It does not mount an internal MCP transport.

## External MCP servers

- `config_list_mcp_servers`
- `config_add_mcp_server`
- `config_update_mcp_server`
- `config_delete_mcp_server`

Records may include a text, HTTP(S), or supported image data icon and a `#RRGGBB` brand color. A `transportType` change must include the complete compatible stdio or streamable-HTTP fields in the same patch.

## Skills

- `config_list_skills`
- `config_import_skill_directory`
- `config_import_skill_file`
- `config_add_skill`
- `config_update_skill`
- `config_delete_skill`

Standard directory imports parse `SKILL.md`, `agents/openai.yaml`, `references/`, `scripts/`, and `assets/`. The managed copy retains `sourcePath`, file details, script catalog, interface metadata, policy, warnings, and import provenance.

## Prompts, agents, providers, and tasks

- Prompts: `config_list_prompts`, `config_add_prompt`, `config_update_prompt`, `config_delete_prompt`
- Agents: `config_list_agents`, `config_add_agent`, `config_update_agent`, `config_delete_agent`
- Providers: `config_list_providers`, `config_add_provider`, `config_update_provider`, `config_delete_provider`
- Timed tasks: `config_list_timed_tasks`, `config_add_timed_task`, `config_update_timed_task`, `config_delete_timed_task`
- Time: `config_get_system_time`

Every update action accepts `{ id, patch }`. Keep `env` and `headers` as objects, `args` as an array, and all binding ids as arrays. Credential fields are redacted as `***` in list results and must never be copied back as real values.
