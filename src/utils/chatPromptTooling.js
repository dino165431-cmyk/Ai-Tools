export function normalizePromptText(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').trim()
}

export function buildBasePromptSelectionState(promptId, defaultSystemPrompt = '') {
  const resolvedPromptId = String(promptId || '').trim()
  if (resolvedPromptId) {
    return {
      basePromptMode: 'prompt',
      selectedPromptId: resolvedPromptId,
      customSystemPrompt: ''
    }
  }

  return {
    basePromptMode: 'custom',
    selectedPromptId: null,
    customSystemPrompt: String(defaultSystemPrompt || '')
  }
}

export function buildCustomSystemPromptState(promptText = '', explicit = null) {
  const rawPromptText = String(promptText ?? '')
  const hasPromptText = !!normalizePromptText(rawPromptText)
  return {
    basePromptMode: 'custom',
    selectedPromptId: null,
    customSystemPrompt: rawPromptText,
    customSystemPromptExplicit: explicit === null
      ? hasPromptText
      : explicit === true && hasPromptText
  }
}

export function buildMergedChatState(defaultState = {}, persistedState = {}) {
  const base = defaultState && typeof defaultState === 'object' ? { ...defaultState } : {}
  const override = persistedState && typeof persistedState === 'object' ? { ...persistedState } : {}
  if (override.contextWindow && typeof override.contextWindow === 'object' && !Array.isArray(override.contextWindow)) {
    override.contextWindow = { ...override.contextWindow }
  }
  return {
    ...base,
    ...override
  }
}

export function resolveSystemPromptModalApplyState(currentState = {}, options = {}) {
  const basePromptMode = String(currentState?.basePromptMode || '').trim() === 'prompt' ? 'prompt' : 'custom'
  const selectedPromptId = String(options?.selectedPromptId || currentState?.selectedPromptId || '').trim()
  const selectedPromptContent = String(options?.selectedPromptContent ?? '')
  const draftText = String(options?.draftText ?? '')
  const currentCustomSystemPrompt = String(currentState?.customSystemPrompt ?? '')
  const currentCustomSystemPromptExplicit = currentState?.customSystemPromptExplicit === true

  if (
    basePromptMode === 'prompt' &&
    selectedPromptId &&
    normalizePromptText(draftText) === normalizePromptText(selectedPromptContent)
  ) {
    return {
      basePromptMode: 'prompt',
      selectedPromptId,
      customSystemPrompt: '',
      customSystemPromptExplicit: false
    }
  }

  if (
    basePromptMode === 'custom' &&
    normalizePromptText(draftText) === normalizePromptText(currentCustomSystemPrompt)
  ) {
    return buildCustomSystemPromptState(currentCustomSystemPrompt, currentCustomSystemPromptExplicit)
  }

  return buildCustomSystemPromptState(draftText)
}

export function hasActiveBasePromptSelection(currentState = {}) {
  const basePromptMode = String(currentState?.basePromptMode || '').trim()
  const selectedPromptId = String(currentState?.selectedPromptId || '').trim()
  return basePromptMode === 'prompt' && !!selectedPromptId
}

export function isPromptModalSelectionCurrentBasePrompt(parsedValue, currentState = {}) {
  const parsedType = String(parsedValue?.type || '').trim()
  const parsedPromptId = String(parsedValue?.promptId || '').trim()
  if (parsedType !== 'local' || !parsedPromptId) return false

  const selectedPromptId = String(currentState?.selectedPromptId || '').trim()
  return hasActiveBasePromptSelection(currentState) && selectedPromptId === parsedPromptId
}

export function shouldClearBasePromptSelectionFromPromptModal(parsedValue, currentState = {}) {
  const parsedType = String(parsedValue?.type || '').trim()
  const parsedPromptId = String(parsedValue?.promptId || '').trim()
  if (parsedType !== 'local' || parsedPromptId) return false

  return hasActiveBasePromptSelection(currentState)
}

export function shouldClearBasePromptSelectionImmediately(currentState = {}, parsedValue = null) {
  if (!hasActiveBasePromptSelection(currentState)) return false

  return (
    shouldClearBasePromptSelectionFromPromptModal(parsedValue, currentState) ||
    isPromptModalSelectionCurrentBasePrompt(parsedValue, currentState)
  )
}

export const AGENT_SKILL_LAZY_LOAD_GUIDANCE_LINES = Object.freeze([
  '## 技能（按需加载）',
  '- 以下为智能体预设技能，默认只提供名称、描述和文件索引。',
  '- 只有在你确实需要某个技能的完整规则时，才调用 `use_skill` 或 `use_skills`。',
  '- 标准目录 Skill 先用 `use_skill({"id":"..."})` 加载 `SKILL.md`。',
  '- 需要补充材料时，再用 `read_skill_file({"id":"...","path":"references/..."})` 或 `read_skill_file({"id":"...","path":"scripts/..."})` 按需读取文本文件。',
  '- 如果技能自带可执行脚本，再用 `run_skill_script({"id":"...","path":"scripts/xxx.js","args":["..."]})` 执行；只允许执行 `scripts/` 目录下脚本。若仅有一个可执行脚本，`path` 可省略。标准 skill 优先依赖 `SKILL.md` 和脚本顶部注释来说明用法；`scripts/manifest.json` 仅作为可选兼容扩展，不是必须。',
  '- `assets/` 只应在其中存放文本模板、SVG、HTML、CSS、JSON 等可读文本时再读取；二进制图片、字体、压缩包等资产不要用 `read_skill_file`。',
  '- 优先使用技能块展示的 id，不要传空对象，也不要猜不存在的技能。',
  '- 单个技能用：`use_skill({"id":"..."})`；多个技能再用：`use_skills({"ids":["...","..."]})`。',
  '- `activate_all_agent_skills` 只在你确认需要全部技能时使用，且必须传：`{"confirm":true}`。',
  '- 技能关联的 MCP 会随技能选择自动挂载；`use_skill` / `use_skills` 仅负责把技能正文加入系统提示词。'
])

export const COMPACT_MCP_CATALOG_NOTE =
  'tool_names is the tool-name list. tool_names_truncated=true means the list is partial, not exhaustive. tool_hints and pinned_tool_hints are hints only, not full schemas. Prefer the exact server_id and tool. Put real tool arguments in args. args may be an object, string, array, number, boolean, or null. For config_add_* tools pass the full object directly; for config_update_* tools pass {"id":"...","patch":{...}}. If the schema is unclear, tool_names may be incomplete, the tool looks executable (script/run/execute/exec), or a call just failed, use mcp_discover({server_id, tool}) first, then retry with mcp_call({server_id, tool, args}).'

export const COMPACT_MCP_TOOL_GUIDANCE_LINES = Object.freeze([
  '## MCP tools (compact mode)',
  '- The system prompt already includes an MCP catalog JSON with `server_id`, `tool_names`, `tool_names_truncated`, `tool_hints`, and sometimes `pinned_tool_hints`.',
  '- Prefer the exact `server_id` and `tool` from the catalog. Do not guess server names or tool names. If `tool_names_truncated=true`, do not treat the list as exhaustive. `pinned_tool_hints` and `tool_hints` are only hints, not full schemas.',
  '- Put real tool arguments in `args`. `args` may be an object, string, array, number, boolean, or null. Tools without arguments usually use `args:{}`.',
  '- Standard form: `mcp_call({"server_id":"...","tool":"...","args":{...}})`. If the target inputSchema root is not an object, set `args` to the raw JSON value instead.',
  '- If the user explicitly wants to run a script/task/automation and the catalog contains a tool whose name or description includes `script`, `run`, `execute`, or `exec`, call it directly instead of only describing it.',
  '- For config tools (`config_` prefix), call `config_list_*` first when the id is unknown; `config_add_*` should receive the full object directly, and `config_update_*` must receive {"id":"...","patch":{...}}.',
  '- If sensitive fields in the listing are shown as `***`, that is a redaction placeholder. Do not write `***` back into `apikey`, `env`, or `headers`.',
  '- Only call `mcp_discover` when you need to refresh the catalog, check for missing tools, or fetch the full inputSchema for one tool.',
  '- When querying one tool schema, prefer `mcp_discover({"server_id":"...","tool":"..."})`.'
])

export const INTERNAL_TOOL_SPECS = Object.freeze({
  useSkill: {
    description:
      '激活一个当前已选择的智能体预设技能。只在系统提示词列出的技能范围内调用。必须优先传技能 id，不要传空对象。单个技能示例：{"id":"skill_xxx"}；如需多个技能，改用 use_skills。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: '技能 _id（必填，优先使用系统提示词里给出的 id）' },
        name: { type: 'string', description: '技能 name（兜底，不推荐）' },
        skill_id: { type: 'string', description: '同 id（兼容字段，不推荐）' },
        skill_name: { type: 'string', description: '同 name（兼容字段，不推荐）' }
      },
      required: ['id'],
      additionalProperties: false
    }
  },
  useSkills: {
    description:
      '批量激活多个当前已选择的智能体预设技能。只在确实需要多个技能时使用；ids 必须是非空数组，示例：{"ids":["skill_a","skill_b"]}。如只需一个技能，优先 use_skill。',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
          description: '技能 _id 列表（必填）'
        },
        names: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: '技能 name 列表（兜底，不推荐）'
        }
      },
      required: ['ids'],
      additionalProperties: false
    }
  },
  readSkillFile: {
    description:
      '读取当前已选择技能目录中的某个文本文件。适用于 references/*、scripts/*，以及少量文本型 assets（例如 .md、.json、.yaml、.svg、.html、.css 模板）。必须传 skill id 和相对路径，不允许使用 `..`。二进制图片、字体、压缩包等资产不支持读取。示例：{"id":"skill_xxx","path":"references/latest-model.md"}。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: '技能 _id（必填）' },
        path: {
          type: 'string',
          minLength: 1,
          description: '相对 skill 根目录的文件路径，例如 references/latest-model.md、scripts/build.ts、assets/template.html'
        }
      },
      required: ['id', 'path'],
      additionalProperties: false
    }
  },
  runSkillScript: {
    description:
      '执行当前已选择技能目录下 `scripts/` 中的脚本。适用于 skill 自带的自动化脚本。必须传 skill id；`path` 优先传完整相对路径，若该 skill 只有 1 个可执行脚本则可省略。路径只能位于 `scripts/` 下。支持 `.js/.mjs/.cjs/.py/.ps1/.sh`。标准 skill 通常通过 `SKILL.md` 和脚本顶部 docstring / 注释说明如何使用脚本；`scripts/manifest.json` 仅作为可选兼容扩展。可选传 `args`、`input`、`timeout_ms`。示例：{"id":"skill_xxx","path":"scripts/run.js","args":["--target","demo"]}。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: '技能 _id（必填）' },
        path: { type: 'string', minLength: 1, description: '可选；相对 skill 根目录的脚本路径，例如 scripts/run.js。若仅有一个可执行脚本可省略' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: '可选；脚本参数数组，例如 ["--target","demo"]'
        },
        input: {
          type: 'string',
          description: '可选；通过 stdin 传给脚本的文本输入'
        },
        timeout_ms: {
          type: 'integer',
          description: '可选；执行超时毫秒数，默认 120000'
        }
      },
      required: ['id'],
      additionalProperties: false
    }
  },
  activateAllAgentSkills: {
    description:
      '一键激活当前已选择的全部智能体预设技能。会加载所有技能完整内容，可能显著拉长系统提示词；仅在明确需要全部技能时调用，并且必须传 {"confirm":true}。',
    parameters: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: '必须传 true 才会执行。固定写法：{"confirm":true}' }
      },
      required: ['confirm'],
      additionalProperties: false
    }
  },
  webSearch: {
    description:
      '联网搜索公开网页资料。仅在用户明确需要联网，或问题涉及最新信息、事实核验、价格、版本、政策、新闻等可能过时的信息时调用。搜索结果来自本次运行的实时请求；如果结果已经回答了问题，应优先基于工具结果回答，不要因为模型知识截止时间更早而反复搜索同一问题。搜索结果只是候选链接，不等同于原文证据；除非用户只需要链接列表或搜索结果已足够回答简单事实，否则调用后应继续用 web_read 阅读最相关的 1-3 个页面，再回答用户。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: '搜索关键词或问题，尽量具体。' },
        limit: { type: 'integer', description: '返回结果数量，默认 5，最多 10。' }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  webRead: {
    description:
      '读取公开网页正文。用户直接提供 URL 时可直接调用；也应在 web_search 返回相关 URL 后调用，用于获取页面标题、描述和正文摘录。不要读取用户未要求的敏感或登录后页面。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1, description: '要读取的 http/https 网页 URL。' },
        maxChars: { type: 'integer', description: '返回正文最大字符数，默认 12000，最多 40000。' }
      },
      required: ['url'],
      additionalProperties: false
    }
  },
  mcpDiscover: {
    description:
      'Inspect the MCP servers and tools currently mounted in this chat. If you want the inputSchema for one tool, pass the exact server_id and tool, for example {"server_id":"browser","tool":"navigate"}. tool_names may be truncated, and tool_hints / pinned_tool_hints are only hints, not full schemas.',
    parameters: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'MCP 服务 _id（优先）' },
        server_name: { type: 'string', description: 'MCP 服务 name（兜底，不推荐）' },
        refresh: { type: 'boolean', description: '是否强制刷新工具列表' },
        tool: { type: 'string', description: '若提供，表示查询该工具的详细信息和 inputSchema' },
        search: { type: 'string', description: '按名称模糊搜索工具' },
        with_schema: { type: 'boolean', description: '列表模式下是否包含 inputSchema' },
        limit: { type: 'integer', description: '列表模式下最多返回多少个工具' }
      },
      additionalProperties: false
    }
  },
  mcpCall: {
    description:
      'Call an MCP tool. Pass the exact server_id and tool, and put the real tool arguments in args. args may be an object, string, array, number, boolean, or null. If the target inputSchema root is not an object, pass args as the raw JSON value. For config_add_* tools pass the full object directly; for config_update_* tools pass {"id":"...","patch":{...}}. If the schema is unclear, call mcp_discover({server_id, tool}) first.',
    parameters: {
      type: 'object',
      properties: {
        server_id: { type: 'string', minLength: 1, description: 'MCP 服务 _id（必填）' },
        server_name: { type: 'string', description: 'MCP 服务 name（兜底，不推荐）' },
        tool: { type: 'string', minLength: 1, description: '工具名称（必填）' },
        args: { description: '工具参数（必填）。必须与目标工具 inputSchema 一致；可以是对象、字符串、数组、数字、布尔值或 null。无参工具通常传 {}。' },
        arguments: { description: '同 args（兼容字段，不推荐）' }
      },
      required: ['server_id', 'tool', 'args'],
      additionalProperties: false
    }
  }
})
