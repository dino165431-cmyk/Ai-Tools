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
  'tool_names 是可用工具名列表，tool_hints 只是常见 top-level 参数提示，不等于完整 schema。调用时优先使用精确的 server_id 与 tool；真实工具参数必须放在 args 字段里，但 args 本身不一定是对象，也可以是字符串、数组、数字、布尔值或 null，具体按目标工具 inputSchema 传。若 tool 名以 config_add_ 开头，args 里直接传完整对象，不要再包 patch；若以 config_update_ 开头，args 必须是 {"id":"...","patch":{...}}。若 schema 不确定、索引不完整、工具像 script/run/execute 这类可执行工具，或上次调用报错，请先用 mcp_discover({server_id, tool}) 获取 inputSchema，再用 mcp_call({server_id, tool, args}) 重试。'

export const COMPACT_MCP_TOOL_GUIDANCE_LINES = Object.freeze([
  '## MCP 工具（精简模式）',
  '- 系统提示词中已附带 MCP 工具索引（JSON），包含 server_id、tool_names 和常见参数提示。',
  '- 调用时优先直接使用索引里的精确 `server_id` 和 `tool`，不要自行猜测服务名或工具名。',
  '- 实际工具参数必须放在 `args` 字段里；`args` 可以是对象，也可以是字符串、数组、数字、布尔值或 null。无参工具通常传 `args:{}`。',
  '- 标准调用写法：`mcp_call({"server_id":"...","tool":"...","args":{...}})`；若目标工具的 inputSchema 顶层不是 object，就把 `args` 改成对应的原始 JSON 值。',
  '- 当用户明确要“执行脚本 / 运行任务 / 调用自动化动作”时，如果目录里存在名称或描述包含 `script`、`run`、`execute`、`exec` 的 MCP 工具，优先直接调用，不要只停留在口头说明。',
  '- 对配置类工具（tool 以 `config_` 开头），未知 `_id` 先调用 `config_list_*`；`config_add_*` 直接传完整对象，`config_update_*` 必须传 `{"id":"...","patch":{...}}`。',
  '- 如果列表接口里的敏感字段是 `***`，那只是脱敏占位值；不要把 `***` 原样写回 `apikey` / `env` / `headers`。',
  '- 只有在你需要刷新工具列表、查漏，或需要某个工具的完整 `inputSchema` 时，才调用 `mcp_discover`。',
  '- 查询单个工具 schema 时，优先写成：`mcp_discover({"server_id":"...","tool":"..."})`。'
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
      '查看当前会话已挂载的 MCP 服务与工具。若要查询单个工具的 inputSchema，请同时传精确的 server_id 和 tool，例如 {"server_id":"browser","tool":"navigate"}。',
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
      '调用 MCP 工具。必须传精确的 server_id、tool，并把真实工具参数放进 args 字段里；args 可以是对象，也可以是字符串、数组、数字、布尔值或 null。标准示例：{"server_id":"browser","tool":"navigate","args":{"url":"https://example.com"}}。若目标工具 inputSchema 顶层不是 object，就把 args 直接写成对应原始 JSON 值。若 tool 名以 config_add_ 开头，args 直接传完整对象；若以 config_update_ 开头，args 必须传 {"id":"...","patch":{...}}。参数不确定时先调用 mcp_discover({server_id, tool}) 获取 inputSchema。',
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
