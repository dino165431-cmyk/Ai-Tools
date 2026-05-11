const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');
const { fileURLToPath } = require('url');
const { buildExportableSkillPackage, normalizeSkillPackage, slugify } = require('./skill-package');
const { DEFAULT_CONTENT_SEARCH_CONFIG, normalizeContentSearchConfig } = require('./contentSearchConfig');

const DEFAULT_SYSTEM_PROMPT = [
    '你是一个 AI 助手（AI Assistant）。',
    '默认使用简体中文回复；仅在用户明确要求时切换到其他语言。',
    '优先给出准确、可执行、可验证的结论与步骤。',
    '不确定时先提出 1 到 2 个关键澄清问题，避免做高风险假设。',
    '涉及代码、配置或命令时，优先给出可直接操作的步骤与示例。',
    '遇到可能有风险或权限不足的操作时，先说明风险并征求确认。',
    '不要编造信息；需要外部信息时，明确说明并给出获取或验证方式。'
].join('\n')

const DEFAULT_CHAT_MEMORY_CONFIG = Object.freeze({
    enabled: false,
    scope: 'global',
    autoExtract: true,
    extraction: Object.freeze({
        providerId: '',
        model: ''
    }),
    embedding: Object.freeze({
        providerId: '',
        model: ''
    }),
    topK: 5,
    maxInjectChars: 1600,
    minSimilarity: 0.38,
    minConfidence: 0.6,
    profileMaxItems: 8,
    relevantMaxItems: 6
})

// -------------------- Built-in presets (MCP / Skill / Prompt / Agent) --------------------
const BUILTIN_MCP_SERVER_ID = 'builtin_notes_mcp'
const BUILTIN_CONFIG_MCP_SERVER_ID = 'builtin_config_mcp'
const BUILTIN_SESSIONS_MCP_SERVER_ID = 'builtin_sessions_mcp'
const BUILTIN_AGENTS_MCP_SERVER_ID = 'builtin_agents_mcp'
const BUILTIN_SKILL_ID = 'builtin_skill_notes'
const BUILTIN_CONFIG_SKILL_ID = 'builtin_skill_config'
const BUILTIN_SESSIONS_SKILL_ID = 'builtin_skill_sessions'
const BUILTIN_AGENT_ORCHESTRATION_SKILL_ID = 'builtin_skill_agent_orchestration'
const BUILTIN_PROMPT_ID = 'builtin_prompt_notes'
const BUILTIN_AGENT_ID = 'builtin_agent_notes'
const BUILTIN_PROVIDER_ID = 'builtin_provider_utools_ai'

const BUILTIN_MCP_SERVER_IDS = [BUILTIN_MCP_SERVER_ID, BUILTIN_CONFIG_MCP_SERVER_ID, BUILTIN_SESSIONS_MCP_SERVER_ID, BUILTIN_AGENTS_MCP_SERVER_ID]
const BUILTIN_SKILL_IDS = [BUILTIN_SKILL_ID, BUILTIN_CONFIG_SKILL_ID, BUILTIN_SESSIONS_SKILL_ID, BUILTIN_AGENT_ORCHESTRATION_SKILL_ID]
const BUILTIN_PROMPT_IDS = [BUILTIN_PROMPT_ID]
const BUILTIN_AGENT_IDS = [BUILTIN_AGENT_ID]
const BUILTIN_PROVIDER_IDS = [BUILTIN_PROVIDER_ID]

function buildBuiltinMcpServer() {
    return {
        _id: BUILTIN_MCP_SERVER_ID,
        name: '内置笔记（MCP）',
        transportType: 'builtinNotes',
        disabled: false,
        keepAlive: true,
        timeout: 15000,
        allowTools: [],
        notesRoot: 'note',
        builtin: true
    }
}

function buildBuiltinConfigMcpServer() {
    return {
        _id: BUILTIN_CONFIG_MCP_SERVER_ID,
        name: '内置配置（MCP）',
        transportType: 'builtinConfig',
        disabled: false,
        keepAlive: true,
        timeout: 15000,
        allowTools: [],
        builtin: true
    }
}

function buildBuiltinSessionsMcpServer() {
    return {
        _id: BUILTIN_SESSIONS_MCP_SERVER_ID,
        name: '内置会话历史（MCP）',
        transportType: 'builtinSessions',
        disabled: false,
        keepAlive: true,
        timeout: 15000,
        allowTools: [],
        sessionsRoot: 'session',
        builtin: true
    }
}

function buildBuiltinAgentsMcpServer() {
    return {
        _id: BUILTIN_AGENTS_MCP_SERVER_ID,
        name: '内置智能体编排（MCP）',
        transportType: 'builtinAgents',
        disabled: false,
        keepAlive: true,
        timeout: 120000,
        allowTools: [],
        builtin: true
    }
}

function buildBuiltinSkill() {
    return {
        _id: BUILTIN_SKILL_ID,
        name: '笔记查阅与记录（内置）',
        description: '用于查阅笔记、记录笔记：优先按目录或最近项轻量定位，再读取或写入具体笔记；索引会随笔记变更和配置切换自动维护，加密笔记不参与索引检索。',
        content: [
            '你是一个“笔记助手”。你可以通过内置 MCP 工具访问用户的笔记库，完成“查阅笔记 / 记笔记”相关工作。',
            '笔记根目录：`note/`（相对“数据存储根目录”）。图片目录：`*.assets/`。',
            `可用工具（均来自内置 MCP：\`${BUILTIN_MCP_SERVER_ID}\`）：`,
            '- `notes_list_directory`：列出某个目录下的直接子目录和笔记，不递归，适合大目录快速定位。',
            '- `notes_list_recent`：按最近修改时间列出笔记，适合先看最近活跃内容。',
            '- `notes_search`：按笔记名、标题、摘要或相对路径搜索笔记，默认是关键词检索；如果全局检索配置启用了 embedding 的混合模式，排序会自动结合关键词和语义结果。索引会在笔记增删改、移动和配置切换后自动维护。加密笔记不会进入索引，因此不会出现在搜索或最近列表中。',
            '- `notes_read`：读取指定 `path` 的笔记；加密笔记会直接报错，需要先在笔记页解锁。',
            '- `notes_list_tree`：列出笔记树形结构；默认只展开较浅层级，确实需要全局概览时再提高 `maxDepth`。',
            '- `notes_create`：新建笔记并写入内容（可传 `path`，或传 `dirPath` + `noteName`；`noteName` 可不带 `.md`）。',
            '- `notes_write`：写入笔记内容（可传 `path`，或传 `dirPath` + `noteName`；默认追加 `mode=append`，覆盖用 `mode=overwrite`）。',
            '使用原则：',
            '1. 如果用户已经给出了明确路径，或路径已经能唯一确定目标，直接 `notes_read` / `notes_write` / `notes_create`，不要先列目录。',
            '2. 用户只给了关键词、文件名片段、路径片段时，优先先 `notes_search` 缩小范围，再 `notes_read`；默认走关键词检索，启用 embedding 后会自动变成混合检索。加密笔记不会进入检索结果，且 `notes_read` 不能直接读取。',
            '3. 用户只给了目录、主题、最近修改、最近记录等线索时，优先先 `notes_list_directory` 或 `notes_list_recent` 缩小范围，再 `notes_read`。',
            '4. 只有用户明确要“看结构 / 看层级 / 看整库分布”，或者前几步无法定位时，才使用 `notes_list_tree`；默认不要从 note 根目录做大深度遍历。',
            '5. 用户要“记录 / 新增 / 整理”笔记：优先确认写入的目录与笔记名；不明确时先问 1 个澄清问题。',
            '6. 默认不要覆盖已有内容；仅在用户明确要求或你已确认时才使用覆盖模式。',
            '7. 写入完成后，向用户回报最终写入的相对路径，例如 `project/todo.md`。'
        ].join('\n'),
        triggers: {
            keywords: ['笔记', '记笔记', '记录', '查阅', '查看笔记', '笔记库', 'note']
        },
        mcp: [BUILTIN_MCP_SERVER_ID],
        builtin: true
    }
}

function buildBuiltinConfigSkill() {
    return {
        _id: BUILTIN_CONFIG_SKILL_ID,
        name: '配置管理（内置）',
        description: '用于在聊天中严格新增或修改配置：MCP、技能、提示词、智能体、服务商、定时任务。支持从标准 Skill 目录或 SKILL.md 导入，也兼容旧版内联 Skill payload。',
        content: [
            '你是一个“配置助手”。你可以通过内置 MCP 工具帮助用户创建、修改和检查本插件的真实配置。',
            '',
            '重要约束：',
            '- 先 list 再改：不知道 `_id` 时，先调用对应 `config_list_*`，不要猜 `_id`。',
            '- `config_add_*` 直接传完整对象；`config_update_*` 顶层只能传 `{ id, patch }`，不要把 patch 里的字段平铺到顶层。',
            '- 标准 Skill 导入优先：如果用户给的是 skill 目录或 `SKILL.md`，优先使用 `config_import_skill_directory` / `config_import_skill_file`。',
            '- 只有旧版内联 Skill，或用户明确要把规则直接存进配置时，才使用 `config_add_skill` / `config_update_skill`。',
            '- 目录型 Skill 只登记 `sourcePath`、`entryFile`、`mcp`、`triggers` 等元数据，不复制实际文件。',
            '- 敏感字段如 `apikey`、`env`、`headers` 不要回显；列表里的 `***` 只是脱敏占位，不能原样写回。',
            '- 修改 `transportType` 或 `trigger.type` 时，要在同一个 patch 里补齐新类型所需字段。',
            '',
            `可用工具（均来自内置 MCP：\`${BUILTIN_CONFIG_MCP_SERVER_ID}\` / builtin_config_mcp）：`,
            '- `config_list_mcp_servers` / `config_add_mcp_server` / `config_update_mcp_server` / `config_delete_mcp_server`',
            '- `config_list_skills` / `config_import_skill_directory` / `config_import_skill_file` / `config_add_skill` / `config_update_skill` / `config_delete_skill`',
            '- `config_list_prompts` / `config_add_prompt` / `config_update_prompt` / `config_delete_prompt`',
            '- `config_list_agents` / `config_add_agent` / `config_update_agent` / `config_delete_agent`',
            '- `config_list_providers` / `config_add_provider` / `config_update_provider` / `config_delete_provider`',
            '- `config_list_timed_tasks` / `config_add_timed_task` / `config_update_timed_task` / `config_delete_timed_task`',
            '- `config_get_system_time`',
            '',
            '高频字段规则：',
            '- `args` 必须是字符串数组；`env` / `headers` 必须是对象。',
            '- `config_import_skill_directory` / `config_import_skill_file` 的 `path` 必须是绝对路径，并且目标要符合 `SKILL.md` 结构。',
            '- 定时任务建议直接传完整 `trigger` 对象。',
            '- 修改后向用户说明改动内容、影响范围，以及在哪里验证结果。'
        ].join('\n'),
        triggers: {
            keywords: ['配置', '设置', 'MCP', '技能', '提示词', '智能体', '服务商', 'provider', 'agent', 'skill', 'prompt', '定时任务', 'timedTask', '模型', 'apikey', 'baseurl']
        },
        mcp: [BUILTIN_CONFIG_MCP_SERVER_ID],
        builtin: true
    }
}

function buildBuiltinSessionsSkill() {
    return {
        _id: BUILTIN_SESSIONS_SKILL_ID,
        name: '会话历史 / 定时任务日志（内置）',
        description: '用于查询历史会话与定时任务执行记录：优先按目录或最近项轻量定位，再读取会话 JSON 分析；索引会随会话变更和配置切换自动维护。',
        content: [
            '你是一个“会话历史查询助手”。你可以通过内置 MCP 工具读取历史会话和定时任务执行日志。',
            '存储位置相对数据根目录：普通会话在 `session/`；定时任务通常在 `session/定时任务/...`。',
            `可用工具（来自内置 MCP：\`${BUILTIN_SESSIONS_MCP_SERVER_ID}\`）：`,
            '- `sessions_list_directory`：列出某个目录下的直接子目录和会话文件，不递归，适合大目录快速定位。',
            '- `sessions_list_recent`：按最近修改时间列出会话文件，适合先看最近记录。',
            '- `sessions_search`：按会话文件名、标题、摘要或相对路径搜索会话，默认是关键词检索；如果全局检索配置启用了 embedding 的混合模式，排序会自动结合关键词和语义结果。索引会在会话增删改、移动和配置切换后自动维护。',
            '- `sessions_list_tree`：列出会话树形结构；默认只展开较浅层级，确实需要全局概览时再提高 `maxDepth`。',
            '- `sessions_read`：读取单个会话文件并解析 JSON。',
            '- `sessions_read_many`：批量读取多个会话文件并解析 JSON。',
            '使用原则：',
            '1. 如果用户已经给出了明确路径，或路径已经能唯一确定目标，直接 `sessions_read` 或 `sessions_read_many`，不要先列目录。',
            '2. 用户只给了关键词、文件名片段、路径片段时，优先先 `sessions_search` 缩小范围，再 `sessions_read` 或 `sessions_read_many`；默认走关键词检索，启用 embedding 后会自动变成混合检索。',
            '3. 用户只给了目录、任务名、最近记录、最近失败等线索时，优先先 `sessions_list_directory` 或 `sessions_list_recent` 定位，再 `sessions_read` 或 `sessions_read_many`。',
            '4. 只有用户明确要“看结构 / 看层级 / 看整库分布”，或者前几步无法定位时，才使用 `sessions_list_tree`；默认不要从 session 根目录做大深度遍历。',
            '5. 批量分析时，先用轻量工具筛出小批量目标，再 `sessions_read_many`，避免把大量无关会话一次读入。'
        ].join('\n'),
        triggers: {
            keywords: ['历史会话', '会话历史', '会话树', '会话记录', '读取会话', '会话文件', '定时任务日志', '任务执行日志', '定时任务', 'cron']
        },
        mcp: [BUILTIN_SESSIONS_MCP_SERVER_ID],
        builtin: true
    }
}

function buildBuiltinAgentOrchestrationSkill() {
    return {
        _id: BUILTIN_AGENT_ORCHESTRATION_SKILL_ID,
        name: '任务拆解与子智能体编排（内置）',
        description: '用于主动识别复杂任务并拆解给已有 Agent 执行，再统一汇总结论、风险和后续步骤。',
        content: [
            '你是一个“任务拆解与子智能体编排助手”。当任务明显包含多个相对独立的子目标时，应优先拆解再委托执行。',
            '',
            `可用工具（来自内置 MCP：\`${BUILTIN_AGENTS_MCP_SERVER_ID}\`）：`,
            '- `agents_list`：查看当前可用的 Agent；带 `query` 时会搜索 id、名称、provider、model、prompt、skill、MCP，默认关键词检索，启用 embedding 后会自动变成混合检索。',
            '- `agent_run`：调用指定 Agent 执行单个子任务，并返回过程与结果。',
            '',
            '执行原则：',
            '- 先用 `agents_list` 确认可用 Agent，再选择合适的执行者；如果只知道任务特征，不知道具体 Agent 名称，也先用 `agents_list query=...` 缩小范围。',
            '- 每个 `agent_run` 只交付一个边界清晰的子任务，说明目标、范围、约束和预期产物。',
            '- 子任务之间尽量解耦，避免后一个任务依赖前一个任务里未确认的隐式状态。',
            '- 多个 Agent 返回后，由主线程统一汇总结论、冲突点与剩余风险。',
            '- 如果任务本身很直接，就保持在主线程处理，不要为了拆分而拆分。'
        ].join('\n'),
        triggers: {
            keywords: ['复杂任务', '多步骤', '拆解', '拆分', '编排', '委派', '子智能体', '多阶段', '分工', '并行', '协作', '大任务'],
            intents: ['implement', 'analyze', 'refactor', 'research']
        },
        mcp: [BUILTIN_AGENTS_MCP_SERVER_ID],
        builtin: true
    }
}

function buildBuiltinPrompt() {
    return {
        _id: BUILTIN_PROMPT_ID,
        name: 'Ai Tools 助手（内置）',
        description: '覆盖笔记查阅/记录与配置管理的系统提示词，强调标准 Skill 导入优先、旧版内联 Skill 兼容、敏感配置保护与工具调用规范。',
        type: 'system',
        content: [
            '你是 Ai Tools 插件内置助手。你可以使用本插件提供的 MCP 工具读取和修改真实数据与配置。',
            '',
            '角色边界：',
            '- Prompt：定义系统级指令、风格、约束与回答边界。',
            '- Skill：定义可复用的规则、知识入口和任务流程；必要时再按需加载正文或附加文件。',
            '- MCP：定义可调用的外部工具能力。',
            '- Agent：把 provider / model / prompt / skills / MCP 组合起来执行具体任务。',
            '',
            '通用原则：',
            '- 能用工具就用工具，尤其是读取或修改笔记、配置时不要猜。',
            '- 写入前先确认路径、id、名称和模式；不明确时先问 1 个澄清问题。',
            '- 敏感信息如 API Key、env、headers 不要回显。',
            '- 内置 MCP / Skill / Prompt 不可删除或修改；内置 Agent 不可删除，且只允许部分字段更新。',
            '- 对 Agent、笔记和会话这类可能很多的对象，默认优先轻量定位，优先用检索/最近/目录工具缩小范围，不要一上来就做整库递归遍历。',
            '- `agents_list` / `notes_search` / `sessions_search` 默认是关键词检索；如果全局检索配置启用了 embedding 的混合模式，工具会自动把关键词和语义结果一起用于排序，调用方式不变。Agent 索引会随智能体、提示词、技能、MCP、服务商配置变更自动维护；笔记和会话索引会随数据变更、移动、删除以及配置切换自动维护。笔记侧的加密内容不参与索引或搜索，`notes_read` 也不会直接读取加密笔记。',
            '',
            '内置 MCP：',
            `- 笔记 MCP（\`${BUILTIN_MCP_SERVER_ID}\`）：\`notes_list_directory\` / \`notes_list_recent\` / \`notes_search\` / \`notes_list_tree\` / \`notes_read\` / \`notes_create\` / \`notes_write\``,
            `- 会话 MCP（\`${BUILTIN_SESSIONS_MCP_SERVER_ID}\`）：\`sessions_list_directory\` / \`sessions_list_recent\` / \`sessions_search\` / \`sessions_list_tree\` / \`sessions_read\` / \`sessions_read_many\``,
            `- 配置 MCP（\`${BUILTIN_CONFIG_MCP_SERVER_ID}\`）：\`config_*\` 系列工具，包含 \`config_import_skill_directory\` / \`config_import_skill_file\` / \`config_get_system_time\``,
            `- 编排 MCP（\`${BUILTIN_AGENTS_MCP_SERVER_ID}\`）：\`agents_list\` / \`agent_run\``,
            '',
            '配置规范：',
            '- 标准 Skill 导入优先：如果用户提供的是 skill 目录或 `SKILL.md`，优先使用 `config_import_skill_directory` / `config_import_skill_file`。',
            '- 只有旧版内联 Skill，或用户明确要求把规则直接保存到配置里时，才使用 `config_add_skill` / `config_update_skill`。',
            '- `config_update_*` 必须使用 `{ id, patch }`；修改 `transportType` 或定时任务类型时，要补齐必需字段。',
            '- 涉及相对时间时，先调用 `config_get_system_time` 再回答具体日期或时间。',
            '- 绑定关系要分清：Agent 只能绑定系统 Prompt；用户 Prompt 用于插入输入框，不直接绑定到 Agent。',
            '',
            '笔记规范：',
            '- 已知明确路径时，直接 `notes_read`；不要为了读单篇笔记先列树。',
            '- 已知关键词或路径片段时，优先 `notes_search`；默认走关键词检索，配置了 embedding 后会自动用混合检索。索引会在笔记变更和配置切换后自动维护。加密笔记不会出现在搜索和最近列表中。已知目录或最近线索时，再用 `notes_list_directory` / `notes_list_recent`。',
            '- 查阅笔记：优先先 `notes_search` / `notes_list_directory` / `notes_list_recent`，只在确实需要整体结构时再用 `notes_list_tree`，然后再 `notes_read`。',
            '- 不要默认从 note 根目录做大深度 `notes_list_tree`。',
            '',
            '智能体与会话规范：',
            '- 查找合适的 Agent 时，优先先 `agents_list`；如果只知道任务意图、能力特征或提示词方向，可以直接传 `query` 做关键词/语义检索。',
            '- 查历史会话：优先先 `sessions_search` / `sessions_list_directory` / `sessions_list_recent`，默认走关键词检索，配置了 embedding 后会自动用混合检索。索引会在会话变更和配置切换后自动维护。只在确实需要整体结构时再用 `sessions_list_tree`，然后再 `sessions_read` / `sessions_read_many`。',
            '- 已知明确路径时，直接 `sessions_read`；批量分析前先用轻量工具筛小范围，再 `sessions_read_many`。',
            '- 写入笔记默认追加；除非用户明确要求，否则不要覆盖已有内容。'
        ].join('\n'),
        builtin: true
    }
}

function buildBuiltinProvider() {
    return {
        _id: BUILTIN_PROVIDER_ID,
        name: 'uTools AI（内置）',
        providerType: 'utools-ai',
        baseurl: '',
        apikey: '',
        selectModels: [],
        builtin: true
    }
}

function buildBuiltinAgent() {
    return {
        _id: BUILTIN_AGENT_ID,
        name: 'Ai Tools 助手（内置）',
        provider: null,
        model: null,
        skills: [BUILTIN_SKILL_ID, BUILTIN_CONFIG_SKILL_ID, BUILTIN_SESSIONS_SKILL_ID, BUILTIN_AGENT_ORCHESTRATION_SKILL_ID],
        // 内置助手默认由 skill.mcp 自动挂载对应 MCP，这里保持空数组。
        mcp: [],
        modelParams: null,
        prompt: BUILTIN_PROMPT_ID,
        builtin: true
    }
}

function normalizeOptionalString(val) {
    const s = val === null || val === undefined ? '' : String(val).trim()
    return s ? s : null
}

function normalizeStringList(val) {
    if (!Array.isArray(val)) return []
    const out = []
    const seen = new Set()
    val.forEach((x) => {
        const s = String(x || '').trim()
        if (!s || seen.has(s)) return
        seen.add(s)
        out.push(s)
    })
    return out
}

const CHAT_CONTEXT_WINDOW_PRESET_OPTIONS = new Set(['aggressive', 'balanced', 'wide', 'custom'])
const CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_OPTIONS = new Set(['recent', 'balanced', 'attachments'])
const DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG = Object.freeze({
    preset: 'balanced',
    historyFocus: 'balanced',
    maxTurns: 48,
    keepRecentTurnsFull: 16,
    maxMessages: 320,
    maxCharsExpanded: 400000,
    maxCharsCompact: 320000,
    autoCompactTriggerPercent: 80
})

const DEFAULT_NOTE_SECURITY_CONFIG = Object.freeze({
    globalFallbackVerifier: null,
    protectedNotes: {}
})

const DEFAULT_CONFIG_SECURITY_CONFIG = Object.freeze({
    passwordVerifier: null,
    recoveryQuestion: '',
    recoveryAnswerVerifier: null,
    passwordRecoveryEnvelope: ''
})
const DIAGRAM_TEMPLATE_KINDS = Object.freeze(['mermaid', 'echarts'])
const MAX_RECENT_DIAGRAM_TEMPLATES = 5
const DEFAULT_NOTE_EDITOR_CONFIG = Object.freeze({
    diagramTemplates: Object.freeze({
        mermaid: Object.freeze({
            favorites: Object.freeze([]),
            recent: Object.freeze([]),
            custom: Object.freeze([])
        }),
        echarts: Object.freeze({
            favorites: Object.freeze([]),
            recent: Object.freeze([]),
            custom: Object.freeze([])
        })
    })
})
const DEFAULT_NOTEBOOK_RUNTIME_CONFIG = Object.freeze({
    pythonPath: 'python',
    venvRoot: '',
    noteEnvBindings: {},
    kernelName: '',
    startupTimeoutMs: 0,
    executeTimeoutMs: 0
})
const LOCAL_NOTEBOOK_RUNTIME_CONFIG_DIRNAME = '.ai-tools-local'
const LOCAL_NOTEBOOK_RUNTIME_CONFIG_FILENAME = 'notebook-runtime.json'
const LOCAL_WEB_SEARCH_CONFIG_FILENAME = 'web-search.json'
const DEFAULT_WEB_SEARCH_CONFIG = Object.freeze({
    proxyUrl: '',
    allowInsecureTlsFallback: false,
    searchApiProvider: 'none',
    searchApiKey: '',
    searchApiEndpoint: '',
    searchApiMarket: 'zh-CN'
})
const DEFAULT_CLOUD_CONFIG = Object.freeze({
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucket: '',
    endpoint: '',
    forcePathStyle: null,
    autoBackupEnabled: false,
    autoRestoreEnabled: false
})
const LOCAL_WEB_SEARCH_CONFIG_KEYS = Object.freeze(['proxyUrl', 'allowInsecureTlsFallback'])
const SYNCED_WEB_SEARCH_CONFIG_KEYS = Object.freeze(['searchApiProvider', 'searchApiKey', 'searchApiEndpoint', 'searchApiMarket'])
const DEFAULT_NOTE_CONFIG = Object.freeze({
    noteEditor: DEFAULT_NOTE_EDITOR_CONFIG,
    noteSecurity: DEFAULT_NOTE_SECURITY_CONFIG,
    notebookRuntime: DEFAULT_NOTEBOOK_RUNTIME_CONFIG
})

function getLocalNotebookRuntimeConfigFilePath() {
    const userDataRoot = getDefaultUserDataRoot()
    if (!userDataRoot) return ''
    return path.join(userDataRoot, LOCAL_NOTEBOOK_RUNTIME_CONFIG_DIRNAME, LOCAL_NOTEBOOK_RUNTIME_CONFIG_FILENAME)
}

function getLocalWebSearchConfigFilePath() {
    const userDataRoot = getDefaultUserDataRoot()
    if (!userDataRoot) return ''
    return path.join(userDataRoot, LOCAL_NOTEBOOK_RUNTIME_CONFIG_DIRNAME, LOCAL_WEB_SEARCH_CONFIG_FILENAME)
}

function normalizeWebSearchConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const rawProvider = typeof src.searchApiProvider === 'string' ? src.searchApiProvider.trim() : ''
    const allowedProviders = new Set(['none', 'duckduckgo_instant_answer', 'brave_search', 'bocha_search'])
    const provider = allowedProviders.has(rawProvider) ? rawProvider : 'none'
    const usesCredentialedApi = provider === 'brave_search' || provider === 'bocha_search'
    return {
        proxyUrl: typeof src.proxyUrl === 'string' ? src.proxyUrl.trim() : '',
        allowInsecureTlsFallback: src.allowInsecureTlsFallback === true,
        searchApiProvider: provider,
        searchApiKey: usesCredentialedApi && typeof src.searchApiKey === 'string' ? src.searchApiKey.trim() : '',
        searchApiEndpoint: usesCredentialedApi && typeof src.searchApiEndpoint === 'string' ? src.searchApiEndpoint.trim() : '',
        searchApiMarket: usesCredentialedApi && typeof src.searchApiMarket === 'string' && src.searchApiMarket.trim()
            ? src.searchApiMarket.trim()
            : 'zh-CN'
    }
}

function normalizeCloudConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    return {
        region: typeof src.region === 'string' ? src.region.trim() : '',
        accessKeyId: typeof src.accessKeyId === 'string' ? src.accessKeyId.trim() : '',
        secretAccessKey: typeof src.secretAccessKey === 'string' ? src.secretAccessKey.trim() : '',
        bucket: typeof src.bucket === 'string' ? src.bucket.trim() : '',
        endpoint: typeof src.endpoint === 'string' ? src.endpoint.trim() : '',
        forcePathStyle: typeof src.forcePathStyle === 'boolean' ? src.forcePathStyle : null,
        autoBackupEnabled: src.autoBackupEnabled === true,
        autoRestoreEnabled: src.autoRestoreEnabled === true
    }
}

function pickWebSearchConfig(raw, keys) {
    const normalized = normalizeWebSearchConfig(raw)
    return Object.fromEntries(keys.map((key) => [key, normalized[key]]))
}

function pickLocalWebSearchConfig(raw) {
    return pickWebSearchConfig(raw, LOCAL_WEB_SEARCH_CONFIG_KEYS)
}

function pickSyncedWebSearchConfig(raw) {
    return pickWebSearchConfig(raw, SYNCED_WEB_SEARCH_CONFIG_KEYS)
}

function hasSyncedWebSearchConfig(raw) {
    const normalized = pickSyncedWebSearchConfig(raw)
    return normalized.searchApiProvider !== DEFAULT_WEB_SEARCH_CONFIG.searchApiProvider ||
        normalized.searchApiKey !== DEFAULT_WEB_SEARCH_CONFIG.searchApiKey ||
        normalized.searchApiEndpoint !== DEFAULT_WEB_SEARCH_CONFIG.searchApiEndpoint ||
        normalized.searchApiMarket !== DEFAULT_WEB_SEARCH_CONFIG.searchApiMarket
}

function normalizeIntegerInRange(value, fallback, min, max) {
    const num = Number(value)
    if (!Number.isFinite(num)) return fallback
    const rounded = Math.floor(num)
    return Math.min(max, Math.max(min, rounded))
}

function normalizeExecuteTimeoutMs(value, fallback = 0) {
    const num = Number(value)
    if (!Number.isFinite(num)) return fallback
    const rounded = Math.floor(num)
    if (rounded <= 0) return 0
    return Math.min(600000, rounded)
}

function normalizeStartupTimeoutMs(value, fallback = 0) {
    const num = Number(value)
    if (!Number.isFinite(num)) return fallback
    const rounded = Math.floor(num)
    if (rounded <= 0) return 0
    return Math.min(120000, Math.max(3000, rounded))
}

function normalizeBudgetTriggerPercent(value, fallback) {
    return normalizeIntegerInRange(value, fallback, 55, 95)
}

function normalizeChatContextWindowConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const preset = CHAT_CONTEXT_WINDOW_PRESET_OPTIONS.has(String(src.preset || '').trim())
        ? String(src.preset || '').trim()
        : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.preset
    const historyFocus = CHAT_CONTEXT_WINDOW_HISTORY_FOCUS_OPTIONS.has(String(src.historyFocus || '').trim())
        ? String(src.historyFocus || '').trim()
        : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.historyFocus

    if (preset !== 'custom') {
        return {
            preset,
            historyFocus,
            maxTurns: preset === 'aggressive' ? 18 : preset === 'wide' ? 96 : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTurns,
            keepRecentTurnsFull: preset === 'aggressive' ? 6 : preset === 'wide' ? 32 : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.keepRecentTurnsFull,
            maxMessages: preset === 'aggressive' ? 120 : preset === 'wide' ? 800 : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxMessages,
            maxCharsExpanded: preset === 'aggressive' ? 128000 : preset === 'wide' ? 1000000 : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxCharsExpanded,
            maxCharsCompact: preset === 'aggressive' ? 96000 : preset === 'wide' ? 800000 : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxCharsCompact,
            autoCompactTriggerPercent: preset === 'aggressive' ? 75 : preset === 'wide' ? 85 : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.autoCompactTriggerPercent
        }
    }

    const next = {
        preset,
        historyFocus,
        maxTurns: normalizeIntegerInRange(src.maxTurns, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTurns, 2, 200),
        keepRecentTurnsFull: normalizeIntegerInRange(src.keepRecentTurnsFull, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.keepRecentTurnsFull, 1, 64),
        maxMessages: normalizeIntegerInRange(src.maxMessages, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxMessages, 8, 1000),
        maxCharsExpanded: normalizeIntegerInRange(src.maxCharsExpanded, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxCharsExpanded, 4000, 4200000),
        maxCharsCompact: normalizeIntegerInRange(src.maxCharsCompact, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxCharsCompact, 4000, 4200000),
        autoCompactTriggerPercent: normalizeBudgetTriggerPercent(src.autoCompactTriggerPercent, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.autoCompactTriggerPercent)
    }

    next.keepRecentTurnsFull = Math.min(next.keepRecentTurnsFull, next.maxTurns)
    next.maxCharsCompact = Math.min(next.maxCharsCompact, next.maxCharsExpanded)
    return next
}

function normalizePasswordVerifier(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null
    if (!src) return null
    const iterations = Number(src.iterations)
    const salt = String(src.salt || '').trim()
    const hash = String(src.hash || '').trim()
    if (!Number.isFinite(iterations) || iterations < 1000) return null
    if (!salt || !hash) return null
    return {
        v: 1,
        kdf: 'PBKDF2-SHA256',
        iterations: Math.floor(iterations),
        salt,
        hash
    }
}

function normalizeNoteSecurityConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const mapRaw = src.protectedNotes && typeof src.protectedNotes === 'object' && !Array.isArray(src.protectedNotes)
        ? src.protectedNotes
        : {}
    const protectedNotes = {}

    Object.entries(mapRaw).forEach(([rawKey, rawVal]) => {
        const key = String(rawKey || '').trim().replace(/\\/g, '/')
        if (!key || !key.startsWith('note/')) return
        if (!['.md', '.ipynb'].some((ext) => key.toLowerCase().endsWith(ext))) return
        if (key.includes('\0') || key.includes('../') || key.startsWith('../')) return
        const verifier = normalizePasswordVerifier(rawVal?.verifier || rawVal?.passwordVerifier || rawVal)
        if (!verifier) return
        protectedNotes[key] = {
            verifier,
            updatedAt: typeof rawVal?.updatedAt === 'string' ? rawVal.updatedAt : '',
            hasFallbackRecovery: !!rawVal?.hasFallbackRecovery
        }
    })

    return {
        globalFallbackVerifier: normalizePasswordVerifier(src.globalFallbackVerifier),
        protectedNotes
    }
}

function normalizeNotebookRuntimeConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const noteEnvBindings = Object.fromEntries(
        Object.entries(src.noteEnvBindings && typeof src.noteEnvBindings === 'object' && !Array.isArray(src.noteEnvBindings) ? src.noteEnvBindings : {})
            .map(([filePath, envName]) => {
                const normalizedFilePath = String(filePath || '').trim().replace(/\\/g, '/')
                const normalizedKey = /^[A-Za-z]:\//.test(normalizedFilePath)
                    ? `${normalizedFilePath.slice(0, 1).toLowerCase()}${normalizedFilePath.slice(1)}`
                    : normalizedFilePath
                return [normalizedKey, String(envName || '').trim()]
            })
            .filter(([filePath, envName]) => filePath && envName)
    )
    return {
        pythonPath: typeof src.pythonPath === 'string' && src.pythonPath.trim()
            ? src.pythonPath.trim()
            : DEFAULT_NOTEBOOK_RUNTIME_CONFIG.pythonPath,
        venvRoot: typeof src.venvRoot === 'string' ? src.venvRoot.trim() : '',
        noteEnvBindings,
        kernelName: typeof src.kernelName === 'string' ? src.kernelName.trim() : '',
        startupTimeoutMs: normalizeStartupTimeoutMs(
            src.startupTimeoutMs,
            DEFAULT_NOTEBOOK_RUNTIME_CONFIG.startupTimeoutMs
        ),
        executeTimeoutMs: normalizeIntegerInRange(
            normalizeExecuteTimeoutMs(src.executeTimeoutMs, DEFAULT_NOTEBOOK_RUNTIME_CONFIG.executeTimeoutMs),
            DEFAULT_NOTEBOOK_RUNTIME_CONFIG.executeTimeoutMs,
            0,
            600000
        )
    }
}

function normalizeConfigSecurityConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const recoveryQuestion = typeof src.recoveryQuestion === 'string' ? src.recoveryQuestion.trim() : ''
    return {
        passwordVerifier: normalizePasswordVerifier(src.passwordVerifier || src.globalConfigVerifier),
        recoveryQuestion,
        recoveryAnswerVerifier: normalizePasswordVerifier(src.recoveryAnswerVerifier),
        passwordRecoveryEnvelope: recoveryQuestion && typeof src.passwordRecoveryEnvelope === 'string'
            ? src.passwordRecoveryEnvelope.trim()
            : ''
    }
}

function normalizeDiagramTemplateKind(kind) {
    const text = String(kind || '').trim().toLowerCase()
    return DIAGRAM_TEMPLATE_KINDS.includes(text) ? text : 'mermaid'
}

function normalizeDiagramTemplateIdList(list, max = Number.MAX_SAFE_INTEGER) {
    const out = []
    ;(Array.isArray(list) ? list : []).forEach((item) => {
        const id = String(item || '').trim()
        if (!id || out.includes(id)) return
        out.push(id)
    })
    return out.slice(0, Math.max(0, Number(max) || 0))
}

function normalizeCustomDiagramTemplate(raw, fallbackKind) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const label = String(src.label || '').trim()
    const template = String(src.template || '').trim()
    if (!label || !template) return null

    const kind = normalizeDiagramTemplateKind(src.kind || fallbackKind)
    const nowIso = new Date().toISOString()
    const createdAt = String(src.createdAt || nowIso)
    const updatedAt = String(src.updatedAt || createdAt || nowIso)
    const rawId = String(src.id || '').trim()
    const id = rawId || `custom:${kind}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    return {
        id,
        kind,
        label,
        syntax: String(src.syntax || '').trim(),
        group: String(src.group || '').trim() || 'Custom',
        keywords: normalizeDiagramTemplateIdList(src.keywords),
        template,
        createdAt,
        updatedAt
    }
}

function normalizeDiagramTemplateBucket(rawBucket, kind) {
    const src = rawBucket && typeof rawBucket === 'object' && !Array.isArray(rawBucket) ? rawBucket : {}
    const custom = []

    ;(Array.isArray(src.custom) ? src.custom : []).forEach((item) => {
        const normalized = normalizeCustomDiagramTemplate(item, kind)
        if (!normalized) return
        if (custom.some((entry) => entry.id === normalized.id)) return
        custom.push(normalized)
    })

    return {
        favorites: normalizeDiagramTemplateIdList(src.favorites),
        recent: normalizeDiagramTemplateIdList(src.recent, MAX_RECENT_DIAGRAM_TEMPLATES),
        custom
    }
}

function normalizeNoteTemplateState(rawState) {
    const src = rawState && typeof rawState === 'object' && !Array.isArray(rawState) ? rawState : null
    if (!src) return null

    return JSON.parse(JSON.stringify(src))
}

function normalizeNoteEditorConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const templates = src.diagramTemplates && typeof src.diagramTemplates === 'object' && !Array.isArray(src.diagramTemplates)
        ? src.diagramTemplates
        : {}

    const next = {
        diagramTemplates: {
            mermaid: normalizeDiagramTemplateBucket(templates.mermaid, 'mermaid'),
            echarts: normalizeDiagramTemplateBucket(templates.echarts, 'echarts')
        }
    }

    const noteTemplates = normalizeNoteTemplateState(src.noteTemplates)
    if (noteTemplates) {
        next.noteTemplates = noteTemplates
    }

    return next
}

function normalizeChatConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const {
        noteEditor: _legacyNoteEditor,
        noteSecurity: _legacyNoteSecurity,
        configSecurity: _legacyConfigSecurity,
        ...rest
    } = src

    return {
        ...rest,
        defaultProviderId: typeof src.defaultProviderId === 'string' ? src.defaultProviderId : BUILTIN_PROVIDER_ID,
        defaultModel: typeof src.defaultModel === 'string' ? src.defaultModel : '',
        defaultSystemPrompt: typeof src.defaultSystemPrompt === 'string'
            ? src.defaultSystemPrompt
            : DEFAULT_SYSTEM_PROMPT,
        contextWindow: normalizeChatContextWindowConfig(src.contextWindow),
        memory: normalizeChatMemoryConfig(src.memory)
    }
}

function normalizeNoteConfig(raw, legacyChatConfig) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const legacy = legacyChatConfig && typeof legacyChatConfig === 'object' && !Array.isArray(legacyChatConfig)
        ? legacyChatConfig
        : {}
    const noteEditorSource = src.noteEditor !== undefined ? src.noteEditor : legacy.noteEditor
    const noteSecuritySource = src.noteSecurity !== undefined ? src.noteSecurity : legacy.noteSecurity

    return {
        ...src,
        noteEditor: normalizeNoteEditorConfig(noteEditorSource),
        noteSecurity: normalizeNoteSecurityConfig(noteSecuritySource),
        notebookRuntime: normalizeNotebookRuntimeConfig(src.notebookRuntime)
    }
}

function normalizePromptAndAgentBindingsInConfig(rawConfig) {
    const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
        ? { ...rawConfig }
        : {}
    const promptsMapRaw = config.prompts && typeof config.prompts === 'object' && !Array.isArray(config.prompts) ? config.prompts : {}
    const promptsMap = Object.fromEntries(
        Object.entries(promptsMapRaw).map(([id, prompt]) => [id, normalizePromptConfigEntry(prompt, id)])
    )
    const agentsMapRaw = config.agents && typeof config.agents === 'object' && !Array.isArray(config.agents) ? config.agents : {}
    const agentsMap = Object.fromEntries(
        Object.entries(agentsMapRaw).map(([id, agent]) => {
            const normalizedAgent = agent && typeof agent === 'object' && !Array.isArray(agent) ? { ...agent } : {}
            normalizedAgent.prompt = sanitizeAgentPromptReference(normalizedAgent.prompt, promptsMap)
            return [id, normalizedAgent]
        })
    )

    return {
        ...config,
        prompts: promptsMap,
        agents: agentsMap
    }
}

function syncConfigStructure(rawConfig) {
    const config = normalizePromptAndAgentBindingsInConfig(rawConfig)
    const chatConfig = normalizeChatConfig(config.chatConfig)
    const contentSearchConfig = normalizeContentSearchConfig(config.contentSearchConfig)
    const noteConfig = normalizeNoteConfig(config.noteConfig, config.chatConfig)
    const noteSecurity = noteConfig.noteSecurity
    const configSecurity = normalizeConfigSecurityConfig(
        config.configSecurity !== undefined ? config.configSecurity : config.chatConfig?.configSecurity
    )
    const canonicalVerifier = configSecurity.passwordVerifier || noteSecurity.globalFallbackVerifier || null

    const nextConfigSecurity = canonicalVerifier
        ? {
            passwordVerifier: canonicalVerifier,
            recoveryQuestion: configSecurity.recoveryQuestion,
            recoveryAnswerVerifier: configSecurity.recoveryQuestion ? configSecurity.recoveryAnswerVerifier : null,
            passwordRecoveryEnvelope: configSecurity.recoveryQuestion ? configSecurity.passwordRecoveryEnvelope : ''
        }
        : {
            passwordVerifier: null,
            recoveryQuestion: '',
            recoveryAnswerVerifier: null,
            passwordRecoveryEnvelope: ''
        }

    return {
        ...config,
        chatConfig,
        contentSearchConfig,
        noteConfig: {
            ...noteConfig,
            noteSecurity: {
                ...noteConfig.noteSecurity,
                globalFallbackVerifier: canonicalVerifier
            }
        },
        configSecurity: nextConfigSecurity,
        cloudConfig: normalizeCloudConfig(config.cloudConfig)
    }
}

function mergeChatConfig(current, patch) {
    const base = normalizeChatConfig(current)
    const src = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
    const next = { ...base, ...src }

    if (src.contextWindow !== undefined) {
        next.contextWindow = normalizeChatContextWindowConfig({
            ...base.contextWindow,
            ...(src.contextWindow && typeof src.contextWindow === 'object' && !Array.isArray(src.contextWindow)
                ? src.contextWindow
                : {})
        })
    }

    if (src.memory !== undefined) {
        next.memory = normalizeChatMemoryConfig({
            ...base.memory,
            ...(src.memory && typeof src.memory === 'object' && !Array.isArray(src.memory)
                ? src.memory
                : {})
        })
    }

    return normalizeChatConfig(next)
}

function normalizeChatMemoryString(value) {
    return String(value || '').trim()
}

function normalizeChatMemorySelection(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    return {
        providerId: normalizeChatMemoryString(src.providerId),
        model: normalizeChatMemoryString(src.model)
    }
}

function normalizeChatMemoryInteger(value, fallback, min, max) {
    const num = Number(value)
    if (!Number.isFinite(num)) return fallback
    return Math.min(max, Math.max(min, Math.round(num)))
}

function normalizeChatMemoryNumber(value, fallback, min, max) {
    const num = Number(value)
    if (!Number.isFinite(num)) return fallback
    return Math.min(max, Math.max(min, num))
}

function normalizeChatMemoryConfig(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    return {
        enabled: src.enabled === true,
        scope: normalizeChatMemoryString(src.scope).toLowerCase() === 'global' ? 'global' : 'global',
        autoExtract: src.autoExtract !== false,
        extraction: normalizeChatMemorySelection(src.extraction),
        embedding: normalizeChatMemorySelection(src.embedding),
        topK: normalizeChatMemoryInteger(src.topK, DEFAULT_CHAT_MEMORY_CONFIG.topK, 1, 20),
        maxInjectChars: normalizeChatMemoryInteger(src.maxInjectChars, DEFAULT_CHAT_MEMORY_CONFIG.maxInjectChars, 400, 8000),
        minSimilarity: normalizeChatMemoryNumber(src.minSimilarity, DEFAULT_CHAT_MEMORY_CONFIG.minSimilarity, 0, 1),
        minConfidence: normalizeChatMemoryNumber(src.minConfidence, DEFAULT_CHAT_MEMORY_CONFIG.minConfidence, 0, 1),
        profileMaxItems: normalizeChatMemoryInteger(src.profileMaxItems, DEFAULT_CHAT_MEMORY_CONFIG.profileMaxItems, 1, 20),
        relevantMaxItems: normalizeChatMemoryInteger(src.relevantMaxItems, DEFAULT_CHAT_MEMORY_CONFIG.relevantMaxItems, 1, 20)
    }
}

function mergeContentSearchConfig(current, patch) {
    const base = normalizeContentSearchConfig(current)
    const src = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
    const next = {
        ...base,
        ...src
    }

    if (src.embedding !== undefined) {
        next.embedding = normalizeContentSearchConfig({
            ...base,
            embedding: {
                ...base.embedding,
                ...(src.embedding && typeof src.embedding === 'object' && !Array.isArray(src.embedding)
                    ? src.embedding
                    : {})
            }
        }).embedding
    }

    return normalizeContentSearchConfig(next)
}

function mergeNoteEditorConfig(current, patch) {
    const base = normalizeNoteEditorConfig(current)
    const src = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
    const next = {
        ...base,
        ...src
    }

    if (src.diagramTemplates && typeof src.diagramTemplates === 'object' && !Array.isArray(src.diagramTemplates)) {
        next.diagramTemplates = { ...base.diagramTemplates }
        Object.entries(src.diagramTemplates).forEach(([kind, bucket]) => {
            next.diagramTemplates[kind] = (
                bucket && typeof bucket === 'object' && !Array.isArray(bucket)
                    ? { ...(base.diagramTemplates[kind] || {}), ...bucket }
                    : bucket
            )
        })
    }

    if (src.noteTemplates && typeof src.noteTemplates === 'object' && !Array.isArray(src.noteTemplates)) {
        const baseNoteTemplates = (
            base.noteTemplates && typeof base.noteTemplates === 'object' && !Array.isArray(base.noteTemplates)
                ? base.noteTemplates
                : {}
        )
        const nextNoteTemplates = {
            ...baseNoteTemplates,
            ...src.noteTemplates
        }

        ;['builtinRootOverrides', 'builtinCategoryOverrides', 'builtinTemplateOverrides'].forEach((key) => {
            if (!(src.noteTemplates[key] && typeof src.noteTemplates[key] === 'object' && !Array.isArray(src.noteTemplates[key]))) {
                return
            }
            nextNoteTemplates[key] = {
                ...(baseNoteTemplates[key] && typeof baseNoteTemplates[key] === 'object' && !Array.isArray(baseNoteTemplates[key])
                    ? baseNoteTemplates[key]
                    : {}),
                ...src.noteTemplates[key]
            }
        })

        next.noteTemplates = nextNoteTemplates
    }

    return normalizeNoteEditorConfig(next)
}

function mergeNoteConfig(current, patch) {
    const base = normalizeNoteConfig(current)
    const src = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}

    return normalizeNoteConfig({
        ...base,
        ...src,
        noteEditor: src.noteEditor !== undefined
            ? mergeNoteEditorConfig(base.noteEditor, src.noteEditor)
            : base.noteEditor,
        noteSecurity: src.noteSecurity !== undefined
            ? normalizeNoteSecurityConfig({
                ...base.noteSecurity,
                ...(src.noteSecurity && typeof src.noteSecurity === 'object' && !Array.isArray(src.noteSecurity)
                    ? src.noteSecurity
                    : {})
            })
            : base.noteSecurity,
        notebookRuntime: src.notebookRuntime !== undefined
            ? normalizeNotebookRuntimeConfig({
                ...base.notebookRuntime,
                ...(src.notebookRuntime && typeof src.notebookRuntime === 'object' && !Array.isArray(src.notebookRuntime)
                    ? src.notebookRuntime
                    : {})
            })
            : base.notebookRuntime
    })
}

function mergeConfigSecurity(current, patch) {
    const base = normalizeConfigSecurityConfig(current)
    const src = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
    return normalizeConfigSecurityConfig({
        ...base,
        ...src
    })
}

const AGENT_REASONING_EFFORT_OPTIONS = new Set(['auto', 'low', 'medium', 'high'])

function normalizeOptionalNumber(value, options = {}) {
    if (value === '' || value === null || value === undefined) return null
    const num = Number(value)
    if (!Number.isFinite(num)) return null

    const min = typeof options.min === 'number' ? options.min : -Infinity
    const max = typeof options.max === 'number' ? options.max : Infinity
    const integer = !!options.integer

    if (num < min || num > max) return null
    if (integer && !Number.isInteger(num)) return null
    return num
}

function normalizeReasoningEffort(value) {
    if (value === '' || value === null || value === undefined) return null
    const normalized = String(value).trim().toLowerCase()
    return AGENT_REASONING_EFFORT_OPTIONS.has(normalized) ? normalized : null
}

function compactAgentModelParams(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const compacted = {}

    const temperature = normalizeOptionalNumber(src.temperature, { min: 0, max: 2 })
    const topP = normalizeOptionalNumber(src.topP ?? src.top_p, { min: 0, max: 1 })
    const maxTokens = normalizeOptionalNumber(src.maxTokens ?? src.max_tokens, { min: 1, integer: true })
    const presencePenalty = normalizeOptionalNumber(src.presencePenalty ?? src.presence_penalty, { min: -2, max: 2 })
    const frequencyPenalty = normalizeOptionalNumber(src.frequencyPenalty ?? src.frequency_penalty, { min: -2, max: 2 })
    const seed = normalizeOptionalNumber(src.seed, { integer: true })
    const reasoningEffort = normalizeReasoningEffort(src.reasoningEffort ?? src.reasoning_effort)

    if (temperature !== null) compacted.temperature = temperature
    if (topP !== null) compacted.topP = topP
    if (maxTokens !== null) compacted.maxTokens = maxTokens
    if (presencePenalty !== null) compacted.presencePenalty = presencePenalty
    if (frequencyPenalty !== null) compacted.frequencyPenalty = frequencyPenalty
    if (seed !== null) compacted.seed = seed
    if (reasoningEffort) compacted.reasoningEffort = reasoningEffort

    return Object.keys(compacted).length ? compacted : null
}

function mergeBuiltinAgent(override, builtinAgent) {
    const src = override && typeof override === 'object' && !Array.isArray(override) ? override : {}
    const out = { ...builtinAgent }

    // 仅允许覆盖：provider / model / mcp / modelParams
    out.provider = normalizeOptionalString(src.provider)
    out.model = normalizeOptionalString(src.model)
    out.mcp = normalizeStringList(src.mcp)
    out.modelParams = compactAgentModelParams(src.modelParams)

    // Migrate legacy default MCP selections to implicit skill-mounted defaults.
    const oldDefault = new Set([BUILTIN_MCP_SERVER_ID, BUILTIN_CONFIG_MCP_SERVER_ID, BUILTIN_AGENTS_MCP_SERVER_ID])
    if (out.mcp.length && out.mcp.every((id) => oldDefault.has(id))) out.mcp = []

    return out
}

function normalizePromptType(value) {
    return String(value || '').trim().toLowerCase() === 'user' ? 'user' : 'system'
}

function isSystemPromptConfig(prompt) {
    return normalizePromptType(prompt?.type) === 'system'
}

function normalizePromptConfigEntry(rawPrompt, fallbackId = '') {
    const src = rawPrompt && typeof rawPrompt === 'object' && !Array.isArray(rawPrompt) ? rawPrompt : {}
    const normalized = {
        ...src,
        type: normalizePromptType(src.type)
    }
    if (!normalized._id && fallbackId) normalized._id = fallbackId
    return normalized
}

function sanitizeAgentPromptReference(promptId, promptsMap) {
    const id = String(promptId || '').trim()
    if (!id) return null
    if (BUILTIN_PROMPT_IDS.includes(id)) return id
    const prompt = promptsMap && typeof promptsMap === 'object' ? promptsMap[id] : null
    return prompt && isSystemPromptConfig(prompt) ? id : null
}

function mergeBuiltinProvider(_override, builtinProvider) {
    return { ...builtinProvider }
}

function safeJsonEquals(a, b) {
    try {
        return JSON.stringify(a) === JSON.stringify(b)
    } catch {
        return false
    }
}

function reorderObjectWithFirstKeys(obj, firstKeys = []) {
    const src = obj && typeof obj === 'object' ? obj : {}
    const out = {}
    const first = Array.isArray(firstKeys) ? firstKeys : []
    first.forEach((k) => {
        if (k && Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k]
    })
    Object.keys(src).forEach((k) => {
        if (first.includes(k)) return
        out[k] = src[k]
    })
    return out
}

function hashString(text) {
    const input = String(text || '')
    let hash = 0
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i)
        hash |= 0
    }
    return Math.abs(hash).toString(36)
}

function unwrapQuotedText(value) {
    const text = String(value || '').trim()
    if (!text) return ''

    const match = text.match(/^(['"])([\s\S]*)\1$/)
    return match ? match[2].trim() : text
}

function normalizeExternalPathValue(value) {
    const text = unwrapQuotedText(value)
    if (!text) return ''

    if (/^file:\/\//i.test(text)) {
        try {
            return fileURLToPath(new URL(text))
        } catch {
            return text
        }
    }

    return text
}

function getDefaultUserDataRoot() {
    try {
        const raw = normalizeExternalPathValue(globalThis?.utools?.getPath?.('userData'))
        if (!raw || !path.isAbsolute(raw)) return ''
        return path.resolve(raw)
    } catch {
        return ''
    }
}

function parseSimpleYamlScalar(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith('\'') && raw.endsWith('\''))) {
        return raw.slice(1, -1)
    }
    return raw
}

function countLeadingSpaces(text) {
    const match = String(text || '').match(/^(\s*)/)
    return match ? match[1].length : 0
}

function normalizeYamlBlockLines(lines) {
    const list = Array.isArray(lines) ? lines.map((line) => String(line || '')) : []
    let minIndent = Infinity

    list.forEach((line) => {
        if (!line.trim()) return
        minIndent = Math.min(minIndent, countLeadingSpaces(line))
    })

    const indent = Number.isFinite(minIndent) ? minIndent : 0
    return list.map((line) => line.slice(Math.min(indent, countLeadingSpaces(line))))
}

function parseYamlBlockScalar(header, lines) {
    const style = String(header || '').trim().startsWith('>') ? 'folded' : 'literal'
    const normalizedLines = normalizeYamlBlockLines(lines)

    if (style === 'literal') {
        return normalizedLines.join('\n').replace(/\s+$/, '')
    }

    let out = ''
    let previousBlank = true

    normalizedLines.forEach((line) => {
        const isBlank = !line.trim()
        if (isBlank) {
            out += '\n'
            previousBlank = true
            return
        }

        if (out && !previousBlank) out += ' '
        out += line.trim()
        previousBlank = false
    })

    return out.trim()
}

function extractSkillFrontmatter(text) {
    const raw = String(text || '')
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
    if (!match) {
        return { frontmatter: {}, body: raw }
    }

    const block = match[1]
    const lines = block.split(/\r?\n/)
    const frontmatter = {}
    let currentParent = null

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        const nested = line.match(/^\s{2,}([A-Za-z0-9_-]+):\s*(.*)$/)
        if (nested && currentParent && frontmatter[currentParent] && typeof frontmatter[currentParent] === 'object') {
            frontmatter[currentParent][nested[1]] = parseSimpleYamlScalar(nested[2])
            continue
        }

        const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
        if (!top) continue

        const [, key, value] = top
        if (/^[|>][+-]?$/.test(value)) {
            let blockIndent = 0
            for (let j = i + 1; j < lines.length; j += 1) {
                const candidate = lines[j]
                if (!candidate.trim()) continue
                blockIndent = countLeadingSpaces(candidate)
                break
            }

            const blockLines = []
            let nextIndex = i + 1
            while (nextIndex < lines.length) {
                const candidate = lines[nextIndex]
                const isBlank = !candidate.trim()
                const indent = countLeadingSpaces(candidate)
                if (!isBlank && blockIndent > 0 && indent < blockIndent) break
                if (!isBlank && blockIndent === 0 && indent === 0 && /^[A-Za-z0-9_-]+:\s*/.test(candidate)) break
                blockLines.push(candidate)
                nextIndex += 1
            }

            frontmatter[key] = parseYamlBlockScalar(value, blockLines)
            currentParent = null
            i = nextIndex - 1
            continue
        }

        if (!value) {
            frontmatter[key] = {}
            currentParent = key
            continue
        }

        frontmatter[key] = parseSimpleYamlScalar(value)
        currentParent = null
    }

    return {
        frontmatter,
        body: raw.slice(match[0].length)
    }
}

function summarizeSkillMarkdown(text) {
    const lines = String(text || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())

    const useful = []
    for (const line of lines) {
        if (!line) {
            if (useful.length) break
            continue
        }
        if (line.startsWith('#')) continue
        useful.push(line)
        if (useful.join(' ').length >= 240) break
    }

    return useful.join(' ').trim().slice(0, 240)
}

function normalizeFileIndex(index) {
    const src = index && typeof index === 'object' && !Array.isArray(index) ? index : {}
    return {
        skill: String(src.skill || 'SKILL.md'),
        references: normalizeStringList(src.references),
        scripts: normalizeStringList(src.scripts),
        assets: normalizeStringList(src.assets),
        agents: normalizeStringList(src.agents),
        extra: normalizeStringList(src.extra)
    }
}

const SKILL_SCRIPT_MANIFEST_PATH = 'scripts/manifest.json'
const RUNNABLE_SKILL_SCRIPT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.py', '.ps1', '.sh', '.bash'])
const SKILL_SCRIPT_HELPER_SEGMENTS = new Set(['lib', 'libs', 'utils', 'common', 'shared', 'helpers', 'helper', 'vendor', 'internal', 'tests', 'fixtures'])
const SKILL_SCRIPT_HELPER_BASENAMES = new Set(['__init__', 'util', 'utils', 'common', 'shared', 'helper', 'helpers', 'base', 'types', 'constants'])

function normalizeSkillPathForMatch(filePath) {
    return String(filePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

function isRunnableSkillScriptPath(filePath) {
    const normalized = normalizeSkillPathForMatch(filePath)
    if (!normalized.startsWith('scripts/')) return false
    if (normalized.toLowerCase() === SKILL_SCRIPT_MANIFEST_PATH) return false
    return RUNNABLE_SKILL_SCRIPT_EXTENSIONS.has(path.extname(normalized).toLowerCase())
}

function normalizeSkillScriptOutputType(value) {
    const raw = typeof value === 'string'
        ? value
        : value && typeof value === 'object' && typeof value.type === 'string'
            ? value.type
            : ''
    const normalized = String(raw || '').trim().toLowerCase()
    return normalized === 'json' ? 'json' : 'text'
}

function normalizeSkillScriptMetaText(value) {
    if (typeof value === 'string') return value.trim()
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .join('\n')
    }
    if (value && typeof value === 'object') {
        const description = typeof value.description === 'string' ? value.description.trim() : ''
        if (description) return description
    }
    return ''
}

function tryParseJsonText(text, options = {}) {
    const raw = String(text || '')
    const trimmed = raw.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }

    const force = !!options.force
    if (!force && !/^[\[{]/.test(trimmed)) {
        return { ok: false, reason: 'not_json_like' }
    }

    try {
        return { ok: true, value: JSON.parse(trimmed) }
    } catch (error) {
        return { ok: false, reason: 'invalid_json', error }
    }
}

function toSkillScriptPreviewText(text, maxLength = 220) {
    const normalized = String(text || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

    if (!normalized) return ''
    if (normalized.length <= maxLength) return normalized
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`
}

function cleanLeadingCommentText(text) {
    return String(text || '')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/^\s*#\!.*\n/, '')
        .replace(/^\s*#\s*-\*-\s*coding[:=].*\n/i, '')
        .trim()
}

function extractPythonModuleDocstring(text) {
    const source = cleanLeadingCommentText(text).replace(/^\s+/, '')
    const match = source.match(/^(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/)
    return match ? String(match[1] || match[2] || '').trim() : ''
}

function extractLeadingLineCommentBlock(text, marker = '#') {
    const lines = cleanLeadingCommentText(text).split('\n')
    const out = []

    for (const rawLine of lines) {
        const line = String(rawLine || '')
        if (!line.trim()) {
            if (out.length) break
            continue
        }

        if (!line.trimStart().startsWith(marker)) break
        out.push(line.replace(/^\s*#+\s?/, '').replace(/^\s*\/\/\s?/, '').trim())
    }

    return out.join('\n').trim()
}

function extractLeadingBlockComment(text, startToken, endToken, options = {}) {
    const source = cleanLeadingCommentText(text).replace(/^\s+/, '')
    if (!source.startsWith(startToken)) return ''

    const endIndex = source.indexOf(endToken, startToken.length)
    if (endIndex < 0) return ''

    const inner = source.slice(startToken.length, endIndex)
    return inner
        .split('\n')
        .map((line) => {
            if (options.stripAsterisk) return line.replace(/^\s*\*\s?/, '').trim()
            return line.trim()
        })
        .join('\n')
        .trim()
}

function extractScriptHeaderText(filePath, text) {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.py') {
        return extractPythonModuleDocstring(text) || extractLeadingLineCommentBlock(text, '#')
    }
    if (['.js', '.cjs', '.mjs'].includes(ext)) {
        return extractLeadingBlockComment(text, '/**', '*/', { stripAsterisk: true })
            || extractLeadingBlockComment(text, '/*', '*/', { stripAsterisk: true })
            || extractLeadingLineCommentBlock(text, '//')
    }
    if (ext === '.ps1') {
        return extractLeadingBlockComment(text, '<#', '#>')
            || extractLeadingLineCommentBlock(text, '#')
    }
    if (['.sh', '.bash'].includes(ext)) {
        return extractLeadingLineCommentBlock(text, '#')
    }
    return ''
}

function parseHeaderHints(text) {
    const raw = String(text || '').replace(/\r\n/g, '\n').trim()
    if (!raw) {
        return {
            description: '',
            whenToUse: '',
            argsHelp: '',
            inputHelp: ''
        }
    }

    const lines = raw.split('\n').map((line) => line.trim())
    const descriptionLines = []
    let whenToUse = ''
    let argsHelp = ''
    let inputHelp = ''

    for (const line of lines) {
        if (!line) {
            if (descriptionLines.length) break
            continue
        }

        if (!whenToUse && /^(when to use|use when|for |适用|用于)/i.test(line)) {
            whenToUse = line.replace(/^(when to use|use when|for |适用|用于)\s*[:：]?\s*/i, '').trim() || line
            continue
        }
        if (!argsHelp && /^(usage|args?|arguments?|options?)\s*[:：]/i.test(line)) {
            argsHelp = line.replace(/^(usage|args?|arguments?|options?)\s*[:：]\s*/i, '').trim() || line
            continue
        }
        if (!inputHelp && /^(input|stdin|输入)\s*[:：]/i.test(line)) {
            inputHelp = line.replace(/^(input|stdin|输入)\s*[:：]\s*/i, '').trim() || line
            continue
        }

        descriptionLines.push(line)
    }

    return {
        description: toSkillScriptPreviewText(descriptionLines.join(' ')),
        whenToUse: toSkillScriptPreviewText(whenToUse),
        argsHelp: toSkillScriptPreviewText(argsHelp),
        inputHelp: toSkillScriptPreviewText(inputHelp)
    }
}

function inferCliArgsHelpFromCode(filePath, text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
    const hints = []
    const pushHint = (value) => {
        const textValue = toSkillScriptPreviewText(value, 160)
        if (!textValue) return
        if (hints.includes(textValue)) return
        hints.push(textValue)
    }

    lines.forEach((line) => {
        if (!/(add_argument|click\.option|typer\.Option|ArgumentParser|argparse|@click\.option)/.test(line)) return

        const optionMatch = line.match(/(['"])(--[\w-]+|-\w)\1/)
        const helpMatch = line.match(/\bhelp\s*=\s*(['"])(.*?)\1/)
        if (optionMatch?.[2] && helpMatch?.[2]) {
            pushHint(`${optionMatch[2]}: ${helpMatch[2]}`)
            return
        }
        if (optionMatch?.[2]) {
            pushHint(optionMatch[2])
            return
        }

        const descMatch = line.match(/\bdescription\s*=\s*(['"])(.*?)\1/)
        if (descMatch?.[2]) pushHint(descMatch[2])
    })

    return hints.slice(0, 4).join('; ')
}

function inferInputHelpFromCode(filePath, text) {
    const source = String(text || '')
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.py' && /\b(sys\.stdin|fileinput\.input|input\()/m.test(source)) return 'Reads text from stdin or interactive input.'
    if (['.js', '.cjs', '.mjs'].includes(ext) && /\bprocess\.stdin\b/m.test(source)) return 'Reads text from stdin.'
    if (ext === '.ps1' && /\$input\b|Read-Host\b/m.test(source)) return 'Consumes pipeline input or interactive input.'
    if (['.sh', '.bash'].includes(ext) && /\bread\s+[-\w]*\b|cat\s+-\b|stdin\b/m.test(source)) return 'Reads input from stdin or shell read.'
    return ''
}

function inferOutputTypeFromCode(filePath, text) {
    const source = String(text || '')
    const ext = path.extname(filePath).toLowerCase()

    if (ext === '.py' && /\bjson\.(dump|dumps)\s*\(/m.test(source)) return 'json'
    if (['.js', '.cjs', '.mjs'].includes(ext) && /\bJSON\.stringify\s*\(/m.test(source)) return 'json'
    if (ext === '.ps1' && /\bConvertTo-Json\b/m.test(source)) return 'json'
    if (['.sh', '.bash'].includes(ext) && /\bjq\b|\bpython\b.*json/m.test(source)) return 'json'
    return 'text'
}

function computeSkillScriptEntrypointScore(scriptPath, text) {
    const normalizedPath = normalizeSkillPathForMatch(scriptPath)
    const ext = path.extname(normalizedPath).toLowerCase()
    const basename = path.basename(normalizedPath, ext).toLowerCase()
    const segments = normalizedPath.split('/').slice(1, -1).map((part) => part.toLowerCase())
    const source = String(text || '')
    let score = 0

    if (!normalizedPath.slice('scripts/'.length).includes('/')) score += 1
    if (/^#!.*\b(node|python|bash|sh|pwsh|powershell)\b/m.test(source)) score += 2
    if (segments.some((segment) => SKILL_SCRIPT_HELPER_SEGMENTS.has(segment))) score -= 2
    if (SKILL_SCRIPT_HELPER_BASENAMES.has(basename)) score -= 2

    if (ext === '.py') {
        if (/if\s+__name__\s*==\s*['"]__main__['"]\s*:/m.test(source)) score += 3
        if (/\b(argparse\.ArgumentParser|click\.command|typer\.(Typer|run)|def\s+main\s*\()/m.test(source)) score += 2
    } else if (['.js', '.cjs', '.mjs'].includes(ext)) {
        if (/\brequire\.main\s*===\s*module\b|\bimport\.meta\.url\b|\bprocess\.argv\b/m.test(source)) score += 3
    } else if (ext === '.ps1') {
        score += normalizedPath.slice('scripts/'.length).includes('/') ? 1 : 2
    } else if (['.sh', '.bash'].includes(ext)) {
        score += normalizedPath.slice('scripts/'.length).includes('/') ? 1 : 2
    }

    return score
}

class GlobalConfig {
    constructor() {
        if (GlobalConfig.instance) {
            return GlobalConfig.instance;
        }
        GlobalConfig.instance = this;

        this.STORAGE_KEY = 'global-config';

        this._defaultConfig = {
            theme: 'light',
            chatConfig: {
                defaultProviderId: BUILTIN_PROVIDER_ID,
                defaultModel: '',
                defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
                contextWindow: this._clone(DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG),
                memory: this._clone(DEFAULT_CHAT_MEMORY_CONFIG)
            },
            contentSearchConfig: this._clone(DEFAULT_CONTENT_SEARCH_CONFIG),
            noteConfig: this._clone(DEFAULT_NOTE_CONFIG),
            configSecurity: this._clone(DEFAULT_CONFIG_SECURITY_CONFIG),
            agents: {
                [BUILTIN_AGENT_ID]: buildBuiltinAgent()
            },
            providers: {
                [BUILTIN_PROVIDER_ID]: buildBuiltinProvider()
            },
            prompts: {
                [BUILTIN_PROMPT_ID]: buildBuiltinPrompt()
            },
            skills: {
                [BUILTIN_SKILL_ID]: buildBuiltinSkill(),
                [BUILTIN_CONFIG_SKILL_ID]: buildBuiltinConfigSkill(),
                [BUILTIN_SESSIONS_SKILL_ID]: buildBuiltinSessionsSkill(),
                [BUILTIN_AGENT_ORCHESTRATION_SKILL_ID]: buildBuiltinAgentOrchestrationSkill()
            },
            mcpServers: {
                [BUILTIN_MCP_SERVER_ID]: buildBuiltinMcpServer(),
                [BUILTIN_CONFIG_MCP_SERVER_ID]: buildBuiltinConfigMcpServer(),
                [BUILTIN_SESSIONS_MCP_SERVER_ID]: buildBuiltinSessionsMcpServer(),
                [BUILTIN_AGENTS_MCP_SERVER_ID]: buildBuiltinAgentsMcpServer()
            },
            timedTask: {},
            dataStorageRoot: getDefaultUserDataRoot(),
            cloudConfig: this._clone(DEFAULT_CLOUD_CONFIG)
        };
    }

    _applyBuiltinsInPlace(config) {
        if (!this._isPlainObject(config)) return false
        let changed = false

        const builtinMcp = buildBuiltinMcpServer()
        const builtinConfigMcp = buildBuiltinConfigMcpServer()
        const builtinSessionsMcp = buildBuiltinSessionsMcpServer()
        const builtinAgentsMcp = buildBuiltinAgentsMcpServer()
        const builtinSkill = buildBuiltinSkill()
        const builtinConfigSkill = buildBuiltinConfigSkill()
        const builtinSessionsSkill = buildBuiltinSessionsSkill()
        const builtinAgentOrchestrationSkill = buildBuiltinAgentOrchestrationSkill()
        const builtinPrompt = buildBuiltinPrompt()
        const builtinAgent = buildBuiltinAgent()
        const builtinProvider = buildBuiltinProvider()

        if (!this._isPlainObject(config.mcpServers)) {
            config.mcpServers = {}
            changed = true
        }
        if (!this._isPlainObject(config.skills)) {
            config.skills = {}
            changed = true
        }
        if (!this._isPlainObject(config.prompts)) {
            config.prompts = {}
            changed = true
        }
        if (!this._isPlainObject(config.agents)) {
            config.agents = {}
            changed = true
        }
        if (!this._isPlainObject(config.providers)) {
            config.providers = {}
            changed = true
        }

        if (!safeJsonEquals(config.mcpServers[BUILTIN_MCP_SERVER_ID], builtinMcp)) {
            config.mcpServers[BUILTIN_MCP_SERVER_ID] = this._clone(builtinMcp)
            changed = true
        }
        if (!safeJsonEquals(config.mcpServers[BUILTIN_CONFIG_MCP_SERVER_ID], builtinConfigMcp)) {
            config.mcpServers[BUILTIN_CONFIG_MCP_SERVER_ID] = this._clone(builtinConfigMcp)
            changed = true
        }
        if (!safeJsonEquals(config.mcpServers[BUILTIN_SESSIONS_MCP_SERVER_ID], builtinSessionsMcp)) {
            config.mcpServers[BUILTIN_SESSIONS_MCP_SERVER_ID] = this._clone(builtinSessionsMcp)
            changed = true
        }
        if (!safeJsonEquals(config.mcpServers[BUILTIN_AGENTS_MCP_SERVER_ID], builtinAgentsMcp)) {
            config.mcpServers[BUILTIN_AGENTS_MCP_SERVER_ID] = this._clone(builtinAgentsMcp)
            changed = true
        }
        if (!safeJsonEquals(config.skills[BUILTIN_SKILL_ID], builtinSkill)) {
            config.skills[BUILTIN_SKILL_ID] = this._clone(builtinSkill)
            changed = true
        }
        if (!safeJsonEquals(config.skills[BUILTIN_CONFIG_SKILL_ID], builtinConfigSkill)) {
            config.skills[BUILTIN_CONFIG_SKILL_ID] = this._clone(builtinConfigSkill)
            changed = true
        }
        if (!safeJsonEquals(config.skills[BUILTIN_SESSIONS_SKILL_ID], builtinSessionsSkill)) {
            config.skills[BUILTIN_SESSIONS_SKILL_ID] = this._clone(builtinSessionsSkill)
            changed = true
        }
        if (!safeJsonEquals(config.skills[BUILTIN_AGENT_ORCHESTRATION_SKILL_ID], builtinAgentOrchestrationSkill)) {
            config.skills[BUILTIN_AGENT_ORCHESTRATION_SKILL_ID] = this._clone(builtinAgentOrchestrationSkill)
            changed = true
        }
        if (!safeJsonEquals(config.prompts[BUILTIN_PROMPT_ID], builtinPrompt)) {
            config.prompts[BUILTIN_PROMPT_ID] = this._clone(builtinPrompt)
            changed = true
        }

        const nextBuiltinAgent = mergeBuiltinAgent(config.agents[BUILTIN_AGENT_ID], builtinAgent)
        if (!safeJsonEquals(config.agents[BUILTIN_AGENT_ID], nextBuiltinAgent)) {
            config.agents[BUILTIN_AGENT_ID] = this._clone(nextBuiltinAgent)
            changed = true
        }
        const nextBuiltinProvider = mergeBuiltinProvider(config.providers[BUILTIN_PROVIDER_ID], builtinProvider)
        if (!safeJsonEquals(config.providers[BUILTIN_PROVIDER_ID], nextBuiltinProvider)) {
            config.providers[BUILTIN_PROVIDER_ID] = this._clone(nextBuiltinProvider)
            changed = true
        }

        const nextMcpServers = reorderObjectWithFirstKeys(config.mcpServers, BUILTIN_MCP_SERVER_IDS)
        if (!safeJsonEquals(nextMcpServers, config.mcpServers)) {
            config.mcpServers = nextMcpServers
            changed = true
        }
        const nextSkills = reorderObjectWithFirstKeys(config.skills, BUILTIN_SKILL_IDS)
        if (!safeJsonEquals(nextSkills, config.skills)) {
            config.skills = nextSkills
            changed = true
        }
        const nextPrompts = reorderObjectWithFirstKeys(config.prompts, BUILTIN_PROMPT_IDS)
        if (!safeJsonEquals(nextPrompts, config.prompts)) {
            config.prompts = nextPrompts
            changed = true
        }
        const nextAgents = reorderObjectWithFirstKeys(config.agents, BUILTIN_AGENT_IDS)
        if (!safeJsonEquals(nextAgents, config.agents)) {
            config.agents = nextAgents
            changed = true
        }
        const nextProviders = reorderObjectWithFirstKeys(config.providers, BUILTIN_PROVIDER_IDS)
        if (!safeJsonEquals(nextProviders, config.providers)) {
            config.providers = nextProviders
            changed = true
        }

        return changed
    }

    ensureBuiltins() {
        const config = this._getRaw()
        const changed = this._applyBuiltinsInPlace(config)
        if (changed) this._save(config)
        return this._clone(config)
    }

    _isPlainObject(obj) {
        return obj && typeof obj === 'object' && !Array.isArray(obj);
    }

    _clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    _mergeDefaults(target, defaults) {
        if (!this._isPlainObject(target)) return this._clone(defaults);
        if (!this._isPlainObject(defaults)) return target;

        for (const [key, defVal] of Object.entries(defaults)) {
            if (target[key] === undefined) {
                target[key] = this._clone(defVal);
                continue;
            }
            if (this._isPlainObject(defVal)) {
                if (!this._isPlainObject(target[key])) {
                    target[key] = this._clone(defVal);
                    continue;
                }
                this._mergeDefaults(target[key], defVal);
            }
        }
        return target;
    }

    _getLocalNotebookRuntimeConfigPath() {
        return getLocalNotebookRuntimeConfigFilePath()
    }

    _getLocalWebSearchConfigPath() {
        return getLocalWebSearchConfigFilePath()
    }

    _hasLocalNotebookRuntimeConfig() {
        const filePath = this._getLocalNotebookRuntimeConfigPath()
        if (!filePath) return false
        try {
            return fs.existsSync(filePath)
        } catch {
            return false
        }
    }

    _readExistingLocalNotebookRuntimeConfig() {
        const filePath = this._getLocalNotebookRuntimeConfigPath()
        if (!filePath) return null

        try {
            if (!fs.existsSync(filePath)) return null
            const text = String(fs.readFileSync(filePath, 'utf-8') || '').replace(/^\uFEFF/, '')
            return normalizeNotebookRuntimeConfig(this._parseJsonText(text, 'Notebook Runtime 配置'))
        } catch {
            return null
        }
    }

    _hasReadableLocalNotebookRuntimeConfig() {
        return !!this._readExistingLocalNotebookRuntimeConfig()
    }

    _canStripLegacyNotebookRuntimeConfig(rawLegacy) {
        const normalizedLegacyRuntime = normalizeNotebookRuntimeConfig(rawLegacy)
        if (safeJsonEquals(normalizedLegacyRuntime, DEFAULT_NOTEBOOK_RUNTIME_CONFIG)) {
            return true
        }

        const localRuntime = this._readExistingLocalNotebookRuntimeConfig()
        if (!localRuntime) {
            return false
        }

        return !safeJsonEquals(localRuntime, DEFAULT_NOTEBOOK_RUNTIME_CONFIG)
    }

    _readLocalNotebookRuntimeConfig(fallback = DEFAULT_NOTEBOOK_RUNTIME_CONFIG) {
        const filePath = this._getLocalNotebookRuntimeConfigPath()
        const normalizedFallback = normalizeNotebookRuntimeConfig(fallback)
        if (!filePath) return normalizedFallback

        try {
            if (!fs.existsSync(filePath)) return normalizedFallback
            const text = String(fs.readFileSync(filePath, 'utf-8') || '').replace(/^\uFEFF/, '')
            return normalizeNotebookRuntimeConfig(this._parseJsonText(text, 'Notebook Runtime 配置'))
        } catch (err) {
            console.warn('读取本地 Notebook Runtime 配置失败。', err)
            return normalizedFallback
        }
    }

    _writeLocalNotebookRuntimeConfig(raw) {
        const filePath = this._getLocalNotebookRuntimeConfigPath()
        if (!filePath) throw new Error('无法定位本地 Notebook Runtime 配置目录')

        const normalized = normalizeNotebookRuntimeConfig(raw)
        this._ensureParentDir(filePath)
        fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + '\n', 'utf-8')
        return normalized
    }

    _readLocalWebSearchConfig(fallback = DEFAULT_WEB_SEARCH_CONFIG) {
        const filePath = this._getLocalWebSearchConfigPath()
        const normalizedFallback = normalizeWebSearchConfig(fallback)
        if (!filePath) return normalizedFallback

        try {
            if (!fs.existsSync(filePath)) return normalizedFallback
            const text = String(fs.readFileSync(filePath, 'utf-8') || '').replace(/^\uFEFF/, '')
            return normalizeWebSearchConfig({
                ...normalizedFallback,
                ...pickLocalWebSearchConfig(this._parseJsonText(text, '联网搜索配置'))
            })
        } catch (err) {
            console.warn('读取本地联网搜索配置失败。', err)
            return normalizedFallback
        }
    }

    _writeLocalWebSearchConfig(raw) {
        const filePath = this._getLocalWebSearchConfigPath()
        if (!filePath) throw new Error('无法定位本地联网搜索配置目录')

        const normalized = pickLocalWebSearchConfig(raw)
        this._ensureParentDir(filePath)
        fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + '\n', 'utf-8')
        return normalized
    }

    _stripNotebookRuntimeFromStorageConfig(raw) {
        const config = this._isPlainObject(raw) ? this._clone(raw) : {}
        if (this._isPlainObject(config.noteConfig) && Object.prototype.hasOwnProperty.call(config.noteConfig, 'notebookRuntime')) {
            delete config.noteConfig.notebookRuntime
        }
        if (Object.prototype.hasOwnProperty.call(config, 'webSearchConfig')) {
            const syncedWebSearchConfig = pickSyncedWebSearchConfig(config.webSearchConfig)
            if (hasSyncedWebSearchConfig(syncedWebSearchConfig)) {
                config.webSearchConfig = syncedWebSearchConfig
            } else {
                delete config.webSearchConfig
            }
        }
        return config
    }

    _migrateLegacyNotebookRuntimeConfig(raw) {
        const config = this._isPlainObject(raw) ? this._clone(raw) : {}
        const legacyRuntime = config.noteConfig?.notebookRuntime

        if (legacyRuntime === undefined) {
            return { config, changed: false }
        }

        const normalizedLegacyRuntime = normalizeNotebookRuntimeConfig(legacyRuntime)
        let canStrip = this._canStripLegacyNotebookRuntimeConfig(normalizedLegacyRuntime)

        if (!canStrip) {
            try {
                this._writeLocalNotebookRuntimeConfig(normalizedLegacyRuntime)
                canStrip = true
            } catch (err) {
                console.warn('迁移 Notebook Runtime 本地配置失败。', err)
            }
        }

        if (!canStrip) {
            return { config, changed: false }
        }

        return {
            config: this._stripNotebookRuntimeFromStorageConfig(config),
            changed: true
        }
    }

    _buildPublicConfig(raw) {
        const config = normalizePromptAndAgentBindingsInConfig(this._clone(this._isPlainObject(raw) ? raw : this._defaultConfig))
        config.contentSearchConfig = normalizeContentSearchConfig(config.contentSearchConfig)
        const normalizedNoteConfig = normalizeNoteConfig(config.noteConfig, config.chatConfig)
        config.noteConfig = {
            ...normalizedNoteConfig,
            notebookRuntime: this._readLocalNotebookRuntimeConfig(normalizedNoteConfig.notebookRuntime)
        }
        config.webSearchConfig = this._readLocalWebSearchConfig(config.webSearchConfig)
        this._hydrateDirectorySkillCacheSnapshot(config)
        return config
    }

    _buildExportableConfig(raw) {
        const config = normalizePromptAndAgentBindingsInConfig(this._stripNotebookRuntimeFromStorageConfig(raw))
        this._hydrateDirectorySkillCacheSnapshot(config)
        return config
    }

    _buildStorageRepairConfig(raw, repaired) {
        const base = this._isPlainObject(raw) ? this._clone(raw) : {}
        const shouldPreserveLegacyNotebookRuntime = this._isPlainObject(base.noteConfig)
            && Object.prototype.hasOwnProperty.call(base.noteConfig, 'notebookRuntime')
            && !this._canStripLegacyNotebookRuntimeConfig(base.noteConfig.notebookRuntime)
        const sanitized = this._stripNotebookRuntimeFromStorageConfig(
            this._clone(this._isPlainObject(repaired) ? repaired : this._defaultConfig)
        )
        const healed = {
            ...base,
            theme: sanitized.theme,
            chatConfig: this._clone(sanitized.chatConfig),
            contentSearchConfig: this._clone(sanitized.contentSearchConfig),
            noteConfig: this._clone(sanitized.noteConfig),
            configSecurity: this._clone(sanitized.configSecurity),
            agents: this._clone(sanitized.agents),
            providers: this._clone(sanitized.providers),
            prompts: this._clone(sanitized.prompts),
            skills: this._clone(sanitized.skills),
            mcpServers: this._clone(sanitized.mcpServers),
            timedTask: this._clone(sanitized.timedTask),
            dataStorageRoot: sanitized.dataStorageRoot,
            cloudConfig: this._clone(sanitized.cloudConfig)
        }

        if (Object.prototype.hasOwnProperty.call(sanitized, 'webSearchConfig')) {
            healed.webSearchConfig = this._clone(sanitized.webSearchConfig)
        } else if (Object.prototype.hasOwnProperty.call(healed, 'webSearchConfig')) {
            delete healed.webSearchConfig
        }

        if (shouldPreserveLegacyNotebookRuntime) {
            healed.noteConfig = this._isPlainObject(healed.noteConfig) ? healed.noteConfig : {}
            healed.noteConfig.notebookRuntime = normalizeNotebookRuntimeConfig(base.noteConfig.notebookRuntime)
        }

        return healed
    }

    _formatStorageSize(sizeBytes) {
        const bytes = Number(sizeBytes)
        if (!Number.isFinite(bytes) || bytes < 0) return '未知大小'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    }

    _isLikelyStorageQuotaError(err) {
        const text = [
            err?.name,
            err?.code,
            err?.message
        ].filter(Boolean).join(' ')
        return /(quota|limit|size|space|capacity|too\s+large|max|exceed|overflow|full|超限|上限|过大|空间不足)/i.test(text)
    }

    _buildStorageOperationError(action, err, meta = {}) {
        const details = []
        if (meta.reason) details.push(String(meta.reason))
        if (meta.serializationFailed) {
            details.push('请检查是否包含循环引用、BigInt 或其他不可序列化值')
        }
        if (Number.isFinite(meta.sizeBytes)) {
            details.push(`当前序列化后大小约 ${this._formatStorageSize(meta.sizeBytes)}`)
        }

        const causeMessage = err?.message ? String(err.message).trim() : String(err || '').trim()
        if (causeMessage) {
            details.push(`底层错误：${causeMessage}`)
        }

        const wrapped = new Error(details.length ? `${action}失败：${details.join('；')}` : `${action}失败`)
        if (err !== undefined) wrapped.cause = err
        if (err?.code !== undefined) wrapped.code = err.code
        if (Number.isFinite(meta.sizeBytes)) wrapped.sizeBytes = meta.sizeBytes
        if (meta.serializationFailed) wrapped.serializationFailed = true
        if (meta.quotaLikely) wrapped.quotaLikely = true
        wrapped.storageAction = action
        return wrapped
    }

    _serializeStoragePayload(raw, action = '保存配置') {
        try {
            const json = JSON.stringify(raw)
            if (typeof json !== 'string') {
                throw this._buildStorageOperationError(action, null, {
                    reason: '配置序列化结果为空，无法写入存储',
                    serializationFailed: true
                })
            }
            return {
                json,
                sizeBytes: Buffer.byteLength(json, 'utf8')
            }
        } catch (err) {
            if (err?.serializationFailed) throw err
            throw this._buildStorageOperationError(action, err, {
                reason: '配置无法序列化',
                serializationFailed: true
            })
        }
    }

    _readStorageValue(key) {
        try {
            return utools.dbCryptoStorage.getItem(key)
        } catch (err) {
            throw this._buildStorageOperationError('读取配置', err, {
                reason: '无法从加密存储读取配置'
            })
        }
    }

    _writeStorageValue(key, value, action = '保存配置') {
        const { sizeBytes } = this._serializeStoragePayload(value, action)
        try {
            utools.dbCryptoStorage.setItem(key, value)
        } catch (err) {
            const maybeQuota = this._isLikelyStorageQuotaError(err)
            throw this._buildStorageOperationError(action, err, {
                reason: maybeQuota ? '配置写入失败，可能超出存储容量限制' : '配置写入失败',
                sizeBytes,
                quotaLikely: maybeQuota
            })
        }
        return { sizeBytes }
    }

    _tryRepairStorage(raw, reason, sourceError = null) {
        try {
            this._writeStorageValue(this.STORAGE_KEY, raw, '修复配置存储')
            return true
        } catch (repairError) {
            if (sourceError) {
                console.warn(`全局配置自动修复失败：${reason}`, repairError, sourceError)
            } else {
                console.warn(`全局配置自动修复失败：${reason}`, repairError)
            }
            return false
        }
    }

    _getRaw() {
        let stored = null
        try {
            stored = this._readStorageValue(this.STORAGE_KEY)
        } catch (readError) {
            const fallback = this._clone(this._defaultConfig)
            console.warn('读取全局配置失败，已回退到默认配置。', readError)
            this._tryRepairStorage(
                this._buildStorageRepairConfig({}, fallback),
                '读取存储异常，已回退到默认配置',
                readError
            )
            return fallback
        }

        if (stored === null || stored === undefined) {
            return this._clone(this._defaultConfig)
        }

        const repairReasons = []
        let rawConfig = stored
        if (!this._isPlainObject(rawConfig)) {
            repairReasons.push('配置根对象已损坏，已回退为默认结构')
            rawConfig = {}
        }

        const migrated = this._migrateLegacyNotebookRuntimeConfig(rawConfig)
        rawConfig = migrated.config
        if (migrated.changed) {
            repairReasons.push('已迁移旧版 notebookRuntime 配置')
        }

        const normalized = syncConfigStructure(this._clone(rawConfig))
        const merged = this._mergeDefaults(normalized, this._defaultConfig);
        const repaired = syncConfigStructure(merged)
        if (this._applyBuiltinsInPlace(repaired)) {
            repairReasons.push('已补齐缺失或损坏的内置配置')
        }

        const healedStorage = this._buildStorageRepairConfig(rawConfig, repaired)
        if (!safeJsonEquals(rawConfig, healedStorage)) {
            repairReasons.push('已修复缺失字段或错误类型')
        }

        if (repairReasons.length) {
            console.warn(`检测到全局配置异常，准备自动修复：${repairReasons.join('；')}`)
            this._tryRepairStorage(healedStorage, repairReasons.join('；'))
        }

        return repaired;
    }

    _save(raw) {
        const normalized = normalizePromptAndAgentBindingsInConfig(this._clone(raw))
        const sanitized = this._stripNotebookRuntimeFromStorageConfig(normalized)
        this._ensureWritableDataStorageRoot(sanitized)
        this._writeStorageValue(this.STORAGE_KEY, sanitized, '保存配置')
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('globalConfigChanged', { detail: this._buildPublicConfig(sanitized) }));
        }
    }

    // 公共 API
    _cleanFilePath(filePath, label = 'filePath') {
        const value = normalizeExternalPathValue(filePath);
        if (!value) throw new Error(`${label} 不能为空`);
        if (value.includes('\0')) throw new Error(`${label} 包含非法字符`);
        return value;
    }

    _ensureWritableDataStorageRoot(raw) {
        const config = this._isPlainObject(raw) ? raw : {}
        const current = normalizeExternalPathValue(config.dataStorageRoot)
        const fallback = getDefaultUserDataRoot()
        const candidates = []

        if (current && path.isAbsolute(current)) candidates.push(path.resolve(current))
        if (fallback && !candidates.includes(fallback)) candidates.push(fallback)

        let lastError = null
        for (const candidate of candidates) {
            try {
                if (fs.existsSync(candidate)) {
                    const stat = fs.statSync(candidate)
                    if (!stat.isDirectory()) {
                        throw new Error(`dataStorageRoot is not a directory: ${candidate}`)
                    }
                } else {
                    fs.mkdirSync(candidate, { recursive: true })
                }
                config.dataStorageRoot = candidate
                return candidate
            } catch (err) {
                lastError = err
            }
        }

        if (lastError) throw lastError
        throw new Error('dataStorageRoot is not configured')
    }

    _ensureParentDir(filePath) {
        const dir = path.dirname(filePath);
        if (dir && dir !== '.' && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    _parseJsonText(text, sourceLabel = 'JSON') {
        const cleanText = String(text || '').replace(/^\uFEFF/, '');
        try {
            return JSON.parse(cleanText);
        } catch (err) {
            throw new Error(`${sourceLabel} JSON 解析失败：${err?.message || String(err)}`);
        }
    }

    _ensureAbsoluteDirectory(dirPath, label = 'dirPath') {
        const value = this._cleanFilePath(dirPath, label)
        if (!path.isAbsolute(value)) throw new Error(`${label} must be an absolute path`)
        const abs = path.resolve(value)
        if (!fs.existsSync(abs)) throw new Error(`${label} does not exist: ${abs}`)
        const stat = fs.statSync(abs)
        if (!stat.isDirectory()) throw new Error(`${label} is not a directory: ${abs}`)
        return abs
    }

    _resolveSkillImportPath(inputPath, label = 'path') {
        const value = this._cleanFilePath(inputPath, label)
        if (!path.isAbsolute(value)) throw new Error(`${label} must be an absolute path`)

        const abs = path.resolve(value)
        if (!fs.existsSync(abs)) throw new Error(`${label} does not exist: ${abs}`)

        const stat = fs.statSync(abs)
        if (stat.isDirectory()) {
            const directEntry = path.join(abs, 'SKILL.md')
            if (fs.existsSync(directEntry) && fs.statSync(directEntry).isFile()) {
                return { kind: 'directory', abs }
            }

            const discovered = this._discoverSkillDirectoriesInRoots([abs])
            if (discovered.length === 1) {
                return {
                    kind: 'directory',
                    abs: discovered[0],
                    requested: abs,
                    discovered: true
                }
            }

            if (discovered.length > 1) {
                throw new Error(`${label} is not a skill directory: ${abs}. Found ${discovered.length} nested skill directories; please choose a specific skill directory or SKILL.md`)
            }

            throw new Error(`SKILL.md not found in ${abs}`)
        }

        if (stat.isFile()) {
            if (path.basename(abs).toLowerCase() !== 'skill.md') {
                throw new Error(`${label} must point to a skill directory or SKILL.md: ${abs}`)
            }
            return { kind: 'file', abs }
        }

        throw new Error(`${label} is neither a file nor a directory: ${abs}`)
    }

    _normalizeSkillInnerPath(filePath, fallback = 'SKILL.md') {
        const raw = typeof filePath === 'string' ? filePath.trim() : ''
        const normalized = raw ? raw.replace(/\\/g, '/').replace(/^\/+/, '') : fallback
        if (!normalized) throw new Error('filePath cannot be empty')
        if (normalized.includes('\0')) throw new Error('filePath contains illegal character')
        if (normalized.split('/').some((part) => part === '..')) {
            throw new Error('filePath cannot escape the skill directory')
        }
        return normalized
    }

    _resolveSkillFileAbs(skillRoot, filePath) {
        const inner = this._normalizeSkillInnerPath(filePath)
        const target = path.resolve(skillRoot, inner)
        const rel = path.relative(skillRoot, target)
        if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
            throw new Error('filePath cannot escape the skill directory')
        }
        return { inner, abs: target }
    }

    _scanSkillDirectoryFiles(skillRoot) {
        const fileIndex = { skill: 'SKILL.md', references: [], scripts: [], assets: [], agents: [], extra: [] }
        const skipDirs = new Set(['.git', 'node_modules', '.DS_Store'])

        const walk = (currentAbs, relativeBase = '') => {
            const entries = fs.readdirSync(currentAbs, { withFileTypes: true })
            entries.forEach((entry) => {
                if (skipDirs.has(entry.name)) return
                const relPath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name
                const nextAbs = path.join(currentAbs, entry.name)
                if (entry.isDirectory()) {
                    walk(nextAbs, relPath)
                    return
                }
                if (!entry.isFile()) return

                const normalized = relPath.replace(/\\/g, '/')
                if (normalized === 'SKILL.md') return
                if (normalized.startsWith('references/')) fileIndex.references.push(normalized)
                else if (normalized.startsWith('scripts/')) fileIndex.scripts.push(normalized)
                else if (normalized.startsWith('assets/')) fileIndex.assets.push(normalized)
                else if (normalized.startsWith('agents/')) fileIndex.agents.push(normalized)
                else fileIndex.extra.push(normalized)
            })
        }

        walk(skillRoot)
        return normalizeFileIndex(fileIndex)
    }

    _analyzeSkillScriptFile(skillRoot, scriptPath) {
        const normalizedPath = normalizeSkillPathForMatch(scriptPath)
        const scriptAbs = path.join(skillRoot, normalizedPath)
        let text = ''

        try {
            text = fs.readFileSync(scriptAbs, 'utf-8')
        } catch {
            text = ''
        }

        const headerText = extractScriptHeaderText(normalizedPath, text)
        const headerHints = parseHeaderHints(headerText)
        const argsHelp = headerHints.argsHelp || inferCliArgsHelpFromCode(normalizedPath, text)
        const inputHelp = headerHints.inputHelp || inferInputHelpFromCode(normalizedPath, text)
        const outputType = inferOutputTypeFromCode(normalizedPath, text)
        const entryScore = computeSkillScriptEntrypointScore(normalizedPath, text)
        const runtime = path.extname(normalizedPath).replace(/^\./, '').toLowerCase()

        return {
            path: normalizedPath,
            name: path.basename(normalizedPath, path.extname(normalizedPath)),
            description: headerHints.description || '',
            whenToUse: headerHints.whenToUse || '',
            argsHelp,
            inputHelp,
            outputType,
            outputTypeDeclared: false,
            outputTypeSource: outputType === 'json' ? 'inferred' : 'default',
            cwd: '',
            timeoutMs: null,
            runtime,
            entryScore
        }
    }

    _buildFallbackSkillScriptCatalog(skillRoot, fileIndex) {
        const analyzed = normalizeStringList(fileIndex?.scripts)
            .filter((scriptPath) => isRunnableSkillScriptPath(scriptPath))
            .map((scriptPath) => this._analyzeSkillScriptFile(skillRoot, scriptPath))
            .sort((a, b) => {
                const scoreDiff = Number(b?.entryScore || 0) - Number(a?.entryScore || 0)
                if (scoreDiff !== 0) return scoreDiff
                return String(a?.path || '').localeCompare(String(b?.path || ''))
            })

        return analyzed.map((entry) => ({
            path: entry.path,
            name: entry.name,
            description: entry.description,
            whenToUse: entry.whenToUse,
            argsHelp: entry.argsHelp,
            inputHelp: entry.inputHelp,
            outputType: entry.outputType,
            outputTypeDeclared: !!entry.outputTypeDeclared,
            outputTypeSource: entry.outputTypeSource || 'default',
            cwd: entry.cwd,
            timeoutMs: entry.timeoutMs,
            runtime: entry.runtime || '',
            isLikelyEntrypoint: Number(entry?.entryScore || 0) >= 2
        }))
    }

    _normalizeSkillScriptCatalogEntry(entry, fileIndex, index = 0) {
        const source = typeof entry === 'string' ? { path: entry } : entry
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            throw new Error(`invalid skill script manifest entry at index ${index}`)
        }

        const rawPath = String(source.path || source.script || source.file || '').trim()
        if (!rawPath) {
            throw new Error(`skill script manifest entry ${index} is missing path`)
        }

        const scriptPath = this._normalizeSkillInnerPath(rawPath, '')
        if (!isRunnableSkillScriptPath(scriptPath)) {
            throw new Error(`skill script manifest entry ${index} must point to a runnable file under scripts/: ${scriptPath}`)
        }

        const indexedScripts = new Set(normalizeStringList(fileIndex?.scripts))
        if (!indexedScripts.has(scriptPath)) {
            throw new Error(`skill script manifest entry ${index} points to a missing file: ${scriptPath}`)
        }

        const timeoutValue = Number(source.timeoutMs ?? source.timeout_ms)
        const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0
            ? Math.floor(timeoutValue)
            : null

        const rawCwd = String(source.cwd || '').trim()
        const normalizedCwd = rawCwd ? this._normalizeSkillInnerPath(rawCwd, '') : ''
        const hasOutputType = Object.prototype.hasOwnProperty.call(source, 'outputType')
            || Object.prototype.hasOwnProperty.call(source, 'output_type')
            || Object.prototype.hasOwnProperty.call(source, 'output')

        return {
            path: scriptPath,
            name: String(source.name || path.basename(scriptPath, path.extname(scriptPath))).trim() || path.basename(scriptPath, path.extname(scriptPath)),
            description: normalizeSkillScriptMetaText(source.description || source.desc),
            whenToUse: normalizeSkillScriptMetaText(source.whenToUse ?? source.when_to_use ?? source.useWhen ?? source.use_when),
            argsHelp: normalizeSkillScriptMetaText(source.argsHelp ?? source.args_help ?? source.args),
            inputHelp: normalizeSkillScriptMetaText(source.inputHelp ?? source.input_help ?? source.input),
            outputType: normalizeSkillScriptOutputType(source.outputType ?? source.output_type ?? source.output),
            outputTypeDeclared: hasOutputType,
            outputTypeSource: hasOutputType ? 'manifest' : 'default',
            cwd: normalizedCwd,
            timeoutMs,
            runtime: path.extname(scriptPath).replace(/^\./, '').toLowerCase(),
            isLikelyEntrypoint: true
        }
    }

    _loadSkillScriptCatalog(skillRoot, fileIndex) {
        const normalizedFileIndex = normalizeFileIndex(fileIndex)
        const fallbackCatalog = this._buildFallbackSkillScriptCatalog(skillRoot, normalizedFileIndex)
        const scriptMap = new Map(fallbackCatalog.map((entry) => [entry.path, entry]))
        const manifestPath = normalizedFileIndex.scripts.includes(SKILL_SCRIPT_MANIFEST_PATH)
            ? SKILL_SCRIPT_MANIFEST_PATH
            : ''

        if (!manifestPath) {
            return {
                scriptCatalog: Array.from(scriptMap.values()),
                scriptManifestPath: null
            }
        }

        const manifestAbs = path.join(skillRoot, manifestPath)
        let rawManifest = null
        try {
            rawManifest = JSON.parse(fs.readFileSync(manifestAbs, 'utf-8'))
        } catch (error) {
            throw new Error(`invalid skill script manifest (${manifestPath}): ${error.message || String(error)}`)
        }

        const entries = Array.isArray(rawManifest)
            ? rawManifest
            : Array.isArray(rawManifest?.scripts)
                ? rawManifest.scripts
                : null

        if (!entries) {
            throw new Error(`invalid skill script manifest (${manifestPath}): expected an array or an object with a scripts array`)
        }

        entries.forEach((entry, index) => {
            const normalized = this._normalizeSkillScriptCatalogEntry(entry, normalizedFileIndex, index)
            scriptMap.set(normalized.path, {
                ...(scriptMap.get(normalized.path) || {}),
                ...normalized
            })
        })

        return {
            scriptCatalog: Array.from(scriptMap.values()),
            scriptManifestPath: manifestPath
        }
    }

    _matchSkillScriptCatalogEntry(scriptCatalog, scriptPath) {
        const normalizedPath = normalizeSkillPathForMatch(scriptPath)
        const list = Array.isArray(scriptCatalog) ? scriptCatalog : []
        return list.find((entry) => normalizeSkillPathForMatch(entry?.path) === normalizedPath) || null
    }

    _findSkillBySourcePath(config, sourcePath) {
        const target = path.resolve(String(sourcePath || ''))
        const list = Object.values(config?.skills || {})
        return list.find((skill) => {
            if (!skill || skill.builtin) return false
            const current = typeof skill.sourcePath === 'string' ? skill.sourcePath.trim() : ''
            if (!current) return false
            return path.resolve(current) === target
        }) || null
    }

    _shouldHydrateDirectorySkillCache(skill) {
        if (!skill || skill.builtin) return false
        if (String(skill?.sourceType || '').trim() !== 'directory') return false
        if (!String(skill?.sourcePath || '').trim()) return false

        const cache = skill?.cache && typeof skill.cache === 'object' ? skill.cache : {}
        const fileIndex = cache?.fileIndex && typeof cache.fileIndex === 'object' ? cache.fileIndex : null
        const scriptCatalog = Array.isArray(cache?.scriptCatalog) ? cache.scriptCatalog : null

        if (!fileIndex) return true
        if (!scriptCatalog || !scriptCatalog.length) return true
        if (cache?.scriptManifestPath) return false

        return scriptCatalog.every((entry) => {
            if (!entry || typeof entry !== 'object') return true
            return !String(entry.description || '').trim()
                && !String(entry.whenToUse || '').trim()
                && !String(entry.argsHelp || '').trim()
                && !String(entry.inputHelp || '').trim()
                && !String(entry.runtime || '').trim()
                && String(entry.outputType || 'text').trim().toLowerCase() === 'text'
        })
    }

    _hydrateDirectorySkillCacheSnapshot(config) {
        if (!this._isPlainObject(config?.skills)) return

        Object.values(config.skills).forEach((skill) => {
            if (!this._shouldHydrateDirectorySkillCache(skill)) return

            try {
                const skillRoot = this._ensureAbsoluteDirectory(skill.sourcePath, 'sourcePath')
                const fileIndex = this._scanSkillDirectoryFiles(skillRoot)
                const { scriptCatalog, scriptManifestPath } = this._loadSkillScriptCatalog(skillRoot, fileIndex)
                const prevCache = skill?.cache && typeof skill.cache === 'object' ? skill.cache : {}

                skill.cache = {
                    ...prevCache,
                    fileIndex,
                    scriptCatalog,
                    scriptManifestPath,
                    refreshedAt: prevCache.refreshedAt || new Date().toISOString()
                }
            } catch {
                // ignore broken external skill paths here; explicit refresh/import will surface errors
            }
        })
    }

    _buildDirectorySkillRecord(sourcePath, options = {}) {
        const skillRoot = this._ensureAbsoluteDirectory(sourcePath, 'sourcePath')
        const entryFile = this._normalizeSkillInnerPath(options.entryFile || 'SKILL.md', 'SKILL.md')
        const entryAbs = path.join(skillRoot, entryFile)
        if (!fs.existsSync(entryAbs)) throw new Error(`SKILL.md not found in ${skillRoot}`)

        const text = fs.readFileSync(entryAbs, 'utf-8')
        const { frontmatter, body } = extractSkillFrontmatter(text)
        const skillName = String(frontmatter?.name || path.basename(skillRoot)).trim() || path.basename(skillRoot)
        const summary = summarizeSkillMarkdown(body)
        const description = String(frontmatter?.description || summary || '').trim()
        const existing = options.existing && typeof options.existing === 'object' ? options.existing : null
        const suggestedId = String(options.id || existing?._id || '').trim()
        const baseId = `skill_${slugify(skillName)}`
        const nextId = suggestedId || `${baseId}_${hashString(skillRoot).slice(0, 6)}`
        const fileIndex = this._scanSkillDirectoryFiles(skillRoot)
        const { scriptCatalog, scriptManifestPath } = this._loadSkillScriptCatalog(skillRoot, fileIndex)

        return {
            ...(existing && typeof existing === 'object' ? existing : {}),
            _id: nextId,
            name: skillName,
            description,
            content: '',
            sourceType: 'directory',
            sourcePath: skillRoot,
            entryFile,
            triggers: existing?.triggers && typeof existing.triggers === 'object' ? { ...existing.triggers } : {},
            mcp: normalizeStringList(existing?.mcp),
            install: existing?.install && typeof existing.install === 'object' ? { ...existing.install } : null,
            cache: {
                frontmatter,
                summary,
                fileIndex,
                scriptCatalog,
                scriptManifestPath,
                refreshedAt: new Date().toISOString()
            }
        }
    }

    _normalizeDirectorySkillBindings(existing, incoming) {
        const prevTriggers = existing?.triggers && typeof existing.triggers === 'object' ? existing.triggers : {}
        const nextTriggers = incoming?.triggers && typeof incoming.triggers === 'object' ? incoming.triggers : prevTriggers
        return {
            triggers: {
                tags: normalizeStringList(nextTriggers.tags),
                keywords: normalizeStringList(nextTriggers.keywords),
                regex: normalizeStringList(nextTriggers.regex),
                intents: normalizeStringList(nextTriggers.intents)
            },
            mcp: normalizeStringList(incoming?.mcp ?? existing?.mcp)
        }
    }

    _collectSkillPathsFromCommandOutput(text) {
        const out = new Set()
        const collectFromValue = (value) => {
            if (!value) return
            if (typeof value === 'string') {
                const trimmed = value.trim()
                if (!trimmed) return
                if (path.isAbsolute(trimmed)) out.add(path.resolve(trimmed))
                return
            }
            if (Array.isArray(value)) {
                value.forEach((item) => collectFromValue(item))
                return
            }
            if (typeof value === 'object') {
                Object.entries(value).forEach(([key, child]) => {
                    if (['path', 'sourcePath', 'skillPath', 'directory', 'dir', 'root'].includes(String(key))) {
                        collectFromValue(child)
                    } else {
                        collectFromValue(child)
                    }
                })
            }
        }

        const raw = String(text || '').trim()
        if (!raw) return []
        try {
            collectFromValue(JSON.parse(raw))
        } catch {
            raw.split(/\r?\n/).forEach((line) => {
                const trimmed = line.trim()
                if (!trimmed) return
                try {
                    collectFromValue(JSON.parse(trimmed))
                    return
                } catch {
                    if (path.isAbsolute(trimmed)) out.add(path.resolve(trimmed))
                }
            })
        }
        return Array.from(out)
    }

    _discoverSkillDirectoriesInRoots(roots) {
        const found = new Set()
        const skipDirs = new Set(['.git', 'node_modules'])

        const walk = (dirPath) => {
            if (!fs.existsSync(dirPath)) return
            let entries = []
            try {
                entries = fs.readdirSync(dirPath, { withFileTypes: true })
            } catch {
                return
            }

            if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) {
                found.add(path.resolve(dirPath))
            }

            entries.forEach((entry) => {
                if (!entry.isDirectory()) return
                if (skipDirs.has(entry.name)) return
                walk(path.join(dirPath, entry.name))
            })
        }

        normalizeStringList(roots).forEach((root) => {
            if (!path.isAbsolute(root)) return
            walk(path.resolve(root))
        })

        return Array.from(found)
    }

    _prepareSkillPackage(rawPackage, sourceHint = '') {
        const normalized = normalizeSkillPackage(rawPackage, { source: sourceHint });
        const skill = this._clone(normalized.skill || {});

        if (!this._isPlainObject(skill) || !skill._id) {
            throw new Error('Skill package 缺少 skill._id');
        }
        if (!String(skill.name || '').trim()) {
            throw new Error('Skill package 缺少 skill.name');
        }

        delete skill.builtin;
        skill.packageInfo = {
            ...(this._isPlainObject(skill.packageInfo) ? skill.packageInfo : {}),
            kind: normalized.kind,
            schemaVersion: normalized.schemaVersion,
            name: String(normalized?.meta?.name || skill.name || skill._id),
            version: String(normalized?.meta?.version || ''),
            author: String(normalized?.meta?.author || ''),
            homepage: String(normalized?.meta?.homepage || ''),
            source: String(normalized?.meta?.source || sourceHint || ''),
            installedAt: new Date().toISOString()
        };

        const mcpServers = (Array.isArray(normalized.mcpServers) ? normalized.mcpServers : [])
            .map((item) => {
                const server = this._clone(item);
                delete server.builtin;
                return server;
            })
            .filter((item) => this._isPlainObject(item) && String(item._id || '').trim());

        return {
            ...normalized,
            skill,
            mcpServers
        };
    }

    _installSkillPackageNormalized(pkg, options = {}) {
        const overwrite = !!options.overwrite;
        const installMcpServers = options.installMcpServers !== false;
        const config = this._getRaw();
        if (!this._isPlainObject(config.skills)) config.skills = {};
        if (!this._isPlainObject(config.mcpServers)) config.mcpServers = {};

        const addedMcpIds = [];
        const updatedMcpIds = [];
        const skippedMcpIds = [];

        if (installMcpServers) {
            for (const server of (Array.isArray(pkg.mcpServers) ? pkg.mcpServers : [])) {
                const id = String(server?._id || '').trim();
                if (!id) continue;

                const existing = config.mcpServers[id];
                if (!existing) {
                    config.mcpServers[id] = this._clone(server);
                    addedMcpIds.push(id);
                    continue;
                }

                if (safeJsonEquals(existing, server)) {
                    skippedMcpIds.push(id);
                    continue;
                }

                if (BUILTIN_MCP_SERVER_IDS.includes(id)) {
                    throw new Error(`内置 MCP 冲突：${id}`);
                }
                if (!overwrite) {
                    throw new Error(`MCP server 已存在：${id}（如需覆盖请启用 overwrite）`);
                }

                config.mcpServers[id] = this._clone(server);
                updatedMcpIds.push(id);
            }
        }

        const skill = this._clone(pkg.skill);
        const skillId = String(skill?._id || '').trim();
        const existingSkill = config.skills[skillId];
        let skillAction = 'added';

        if (existingSkill) {
            if (BUILTIN_SKILL_IDS.includes(skillId)) {
                throw new Error(`内置 Skill 冲突：${skillId}`);
            }
            if (safeJsonEquals(existingSkill, skill)) {
                skillAction = 'skipped';
            } else {
                if (!overwrite) {
                    throw new Error(`Skill 已存在：${skillId}（如需覆盖请启用 overwrite）`);
                }
                config.skills[skillId] = skill;
                skillAction = 'updated';
            }
        } else {
            config.skills[skillId] = skill;
        }

        if (!existingSkill || skillAction === 'updated') {
            config.skills[skillId] = skill;
        }

        this._applyBuiltinsInPlace(config);
        this._save(config);

        const missingMcpIds = (Array.isArray(skill?.mcp) ? skill.mcp : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
            .filter((id) => !config.mcpServers[id]);

        return {
            ok: true,
            source: String(pkg?.meta?.source || ''),
            skill: {
                id: skillId,
                name: String(skill?.name || skillId),
                action: skillAction
            },
            mcpServers: {
                added: addedMcpIds,
                updated: updatedMcpIds,
                skipped: skippedMcpIds
            },
            missingMcpIds
        };
    }

    getConfig() {
        return this._buildPublicConfig(this._getRaw());
    }

    exportToFile(filePath) {
        const outputPath = typeof filePath === 'string' ? filePath.trim() : '';
        if (!outputPath) throw new Error('filePath 不能为空');
        if (outputPath.includes('\0')) throw new Error('filePath 包含非法字符');

        const dir = path.dirname(outputPath);
        if (dir && dir !== '.' && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const content = JSON.stringify(this._buildExportableConfig(this._getRaw()), null, 2) + '\n';
        fs.writeFileSync(outputPath, content, 'utf-8');
        return outputPath;
    }

    importFromFile(filePath) {
        const inputPath = typeof filePath === 'string' ? filePath.trim() : '';
        if (!inputPath) throw new Error('filePath 不能为空');
        if (inputPath.includes('\0')) throw new Error('filePath 包含非法字符');

        let text = fs.readFileSync(inputPath, 'utf-8');
        // 兼容 BOM
        text = String(text || '').replace(/^\uFEFF/, '');

        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            throw new Error('JSON 解析失败：' + (err?.message || String(err)));
        }

        if (!this._isPlainObject(parsed)) {
            throw new Error('配置文件内容必须是一个 JSON 对象');
        }

        const normalized = syncConfigStructure(this._clone(parsed))
        const merged = this._mergeDefaults(normalized, this._defaultConfig);

        // 关键字段做一次兜底修正：避免 null/错误类型导致 _save 失败
        if (merged.theme !== 'light' && merged.theme !== 'dark') {
            merged.theme = this._defaultConfig.theme;
        }

        if (!this._isPlainObject(merged.chatConfig)) {
            merged.chatConfig = this._clone(this._defaultConfig.chatConfig);
        } else {
            if (typeof merged.chatConfig.defaultProviderId !== 'string') merged.chatConfig.defaultProviderId = '';
            if (typeof merged.chatConfig.defaultModel !== 'string') merged.chatConfig.defaultModel = '';
            if (typeof merged.chatConfig.defaultSystemPrompt !== 'string') {
                merged.chatConfig.defaultSystemPrompt = this._defaultConfig.chatConfig.defaultSystemPrompt;
            }
            merged.chatConfig = normalizeChatConfig(merged.chatConfig);
        }

        merged.noteConfig = normalizeNoteConfig(merged.noteConfig, parsed.chatConfig)
        merged.configSecurity = normalizeConfigSecurityConfig(
            merged.configSecurity !== undefined ? merged.configSecurity : parsed.chatConfig?.configSecurity
        )
        const finalMerged = syncConfigStructure(merged)

        if (typeof finalMerged.dataStorageRoot !== 'string') finalMerged.dataStorageRoot = '';
        finalMerged.dataStorageRoot = finalMerged.dataStorageRoot.trim();
        if (!finalMerged.dataStorageRoot || finalMerged.dataStorageRoot.includes('\0')) {
            finalMerged.dataStorageRoot = this._defaultConfig.dataStorageRoot;
        }

        finalMerged.cloudConfig = normalizeCloudConfig(finalMerged.cloudConfig)

        try {
            this._applyBuiltinsInPlace(finalMerged);
            this._save(finalMerged);
        } catch (err) {
            // Fall back to the default data root when an imported machine-specific path is unavailable.
            const fallbackRoot = this._defaultConfig.dataStorageRoot;
            if (finalMerged.dataStorageRoot !== fallbackRoot) {
                finalMerged.dataStorageRoot = fallbackRoot;
                this._applyBuiltinsInPlace(finalMerged);
                this._save(finalMerged);
            } else {
                throw err;
            }
        }
        return this.getConfig();
    }

    exportSkillToFile(id, filePath, options = {}) {
        const skillId = typeof id === 'string' ? id.trim() : '';
        if (!skillId) throw new Error('skill id 不能为空');
        if (BUILTIN_SKILL_IDS.includes(skillId)) {
            throw new Error('内置 Skill 暂不支持导出为发布包');
        }

        const outputPath = this._cleanFilePath(filePath);
        const config = this._getRaw();
        const skill = config.skills?.[skillId];
        if (!skill) throw new Error('Skill not found');

        const includeMcpServers = options?.includeMcpServers !== false;
        const mcpServers = includeMcpServers
            ? (Array.isArray(skill?.mcp) ? skill.mcp : [])
                .map((mcpId) => config.mcpServers?.[mcpId])
                .filter((item) => item && !BUILTIN_MCP_SERVER_IDS.includes(item._id))
            : [];

        const payload = buildExportableSkillPackage({
            skill,
            mcpServers
        });

        this._ensureParentDir(outputPath);
        fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
        return outputPath;
    }

    installSkillPackage(rawPackage, options = {}) {
        const sourceHint = typeof options?.source === 'string' ? options.source.trim() : '';
        const pkg = this._prepareSkillPackage(rawPackage, sourceHint);
        return this._installSkillPackageNormalized(pkg, options);
    }

    installSkillPackageFromFile(filePath, options = {}) {
        const inputPath = this._cleanFilePath(filePath);
        const text = fs.readFileSync(inputPath, 'utf-8');
        const parsed = this._parseJsonText(text, inputPath);
        return this.installSkillPackage(parsed, { ...options, source: inputPath });
    }

    async installSkillPackageFromUrl(url, options = {}) {
        const normalizedUrl = typeof url === 'string' ? url.trim() : '';
        if (!normalizedUrl) throw new Error('url 不能为空');

        let parsedUrl = null;
        try {
            parsedUrl = new URL(normalizedUrl);
        } catch (err) {
            throw new Error(`url 不合法：${err?.message || String(err)}`);
        }

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error(`仅支持 http/https：${parsedUrl.protocol}`);
        }
        if (typeof fetch !== 'function') {
            throw new Error('当前环境不支持 fetch');
        }

        const response = await fetch(parsedUrl.toString(), { method: 'GET' });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`下载失败 (${response.status})：${text || response.statusText || 'Unknown error'}`);
        }

        const parsed = this._parseJsonText(text, normalizedUrl);
        return this.installSkillPackage(parsed, { ...options, source: normalizedUrl });
    }

    importSkillDirectory(sourcePath, options = {}) {
        const config = this._getRaw()
        if (!this._isPlainObject(config.skills)) config.skills = {}

        const resolvedSource = this._resolveSkillImportPath(sourcePath, 'sourcePath')
        if (resolvedSource.kind === 'file') {
            return this.importSkillFile(resolvedSource.abs, options)
        }

        const absRoot = resolvedSource.abs
        const existingByPath = this._findSkillBySourcePath(config, absRoot)
        const existing = existingByPath || (options.id ? config.skills[String(options.id).trim()] : null) || null

        if (existing && existing.builtin) {
            throw new Error('builtin skill cannot be replaced')
        }

        const record = this._buildDirectorySkillRecord(absRoot, {
            id: options.id,
            existing
        })
        const bindings = this._normalizeDirectorySkillBindings(existing, options)
        record.triggers = bindings.triggers
        record.mcp = bindings.mcp

        if (options.install && typeof options.install === 'object') {
            record.install = {
                ...(record.install && typeof record.install === 'object' ? record.install : {}),
                ...options.install,
                ...(resolvedSource.discovered && resolvedSource.requested ? { selectedPath: resolvedSource.requested } : {})
            }
        } else if (!record.install || typeof record.install !== 'object') {
            record.install = {
                type: 'directory',
                importedAt: new Date().toISOString(),
                ...(resolvedSource.discovered && resolvedSource.requested ? { selectedPath: resolvedSource.requested } : {})
            }
        } else if (resolvedSource.discovered && resolvedSource.requested) {
            record.install = {
                ...record.install,
                selectedPath: resolvedSource.requested
            }
        }

        const conflict = config.skills[record._id]
        if (conflict && (!existing || conflict._id !== existing._id)) {
            if (!options.overwrite) {
                throw new Error(`skill id already exists: ${record._id}`)
            }
        }

        config.skills[record._id] = record
        this._applyBuiltinsInPlace(config)
        this._save(config)
        return this._clone(record)
    }

    importSkillFile(filePath, options = {}) {
        const resolvedSource = this._resolveSkillImportPath(filePath, 'filePath')
        if (resolvedSource.kind === 'directory') {
            return this.importSkillDirectory(resolvedSource.abs, options)
        }

        const absPath = resolvedSource.abs
        return this.importSkillDirectory(path.dirname(absPath), {
            ...options,
            install: {
                ...(options.install && typeof options.install === 'object' ? options.install : {}),
                type: 'file',
                filePath: absPath,
                importedAt: new Date().toISOString()
            }
        })
    }

    refreshSkillFromSource(id) {
        const skillId = typeof id === 'string' ? id.trim() : ''
        if (!skillId) throw new Error('skill id cannot be empty')
        const config = this._getRaw()
        const existing = config.skills?.[skillId]
        if (!existing) throw new Error('Skill not found')
        if (existing.builtin) return this._clone(existing)
        if (String(existing.sourceType || '').trim() !== 'directory') return this._clone(existing)

        return this.importSkillDirectory(existing.sourcePath, {
            id: skillId,
            overwrite: true,
            mcp: existing.mcp,
            triggers: existing.triggers,
            install: existing.install
        })
    }

    listSkillFiles(id) {
        const skillId = typeof id === 'string' ? id.trim() : ''
        if (!skillId) throw new Error('skill id cannot be empty')
        const skill = this.getSkill(skillId)
        return normalizeFileIndex(skill?.cache?.fileIndex)
    }

    readSkillFile(id, filePath = 'SKILL.md') {
        const skillId = typeof id === 'string' ? id.trim() : ''
        if (!skillId) throw new Error('skill id cannot be empty')
        const skill = this.getSkill(skillId)

        if (String(skill?.sourceType || '').trim() !== 'directory') {
            const inner = this._normalizeSkillInnerPath(filePath)
            if (inner !== 'SKILL.md') throw new Error('inline skill only supports SKILL.md')
            return {
                id: skillId,
                path: 'SKILL.md',
                content: String(skill?.content || ''),
                sourceType: 'inline'
            }
        }

        const skillRoot = this._ensureAbsoluteDirectory(skill.sourcePath, 'sourcePath')
        const resolved = this._resolveSkillFileAbs(skillRoot, filePath || skill.entryFile || 'SKILL.md')
        if (!fs.existsSync(resolved.abs)) throw new Error(`skill file not found: ${resolved.inner}`)
        const stat = fs.statSync(resolved.abs)
        if (!stat.isFile()) throw new Error(`技能路径不是文件：${resolved.inner}`)

        const ext = path.extname(resolved.abs).toLowerCase()
        const textExts = new Set([
            '', '.md', '.txt', '.json', '.yaml', '.yml', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx',
            '.py', '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd',
            '.html', '.css', '.svg', '.xml', '.toml', '.ini', '.cfg', '.conf', '.env',
            '.sql', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.php'
        ])
        if (!textExts.has(ext)) throw new Error(`binary skill file is not supported: ${resolved.inner}`)

        return {
            id: skillId,
            path: resolved.inner,
            content: fs.readFileSync(resolved.abs, 'utf-8'),
            sourceType: 'directory'
        }
    }

    async runSkillScript(id, scriptPath, options = {}) {
        const skillId = typeof id === 'string' ? id.trim() : ''
        if (!skillId) throw new Error('skill id cannot be empty')

        const skill = this.getSkill(skillId)
        if (String(skill?.sourceType || '').trim() !== 'directory') {
            throw new Error('inline skill does not support script execution')
        }

        const skillRoot = this._ensureAbsoluteDirectory(skill.sourcePath, 'sourcePath')
        const fileIndex = this._scanSkillDirectoryFiles(skillRoot)
        const { scriptCatalog } = this._loadSkillScriptCatalog(skillRoot, fileIndex)
        const normalizedScriptPath = typeof scriptPath === 'string' ? scriptPath.trim() : ''

        let resolved = null
        if (!normalizedScriptPath) {
            if (scriptCatalog.length !== 1) {
                throw new Error(`script path is required unless the skill exposes exactly one runnable script (available: ${scriptCatalog.map((entry) => entry.path).join(', ') || 'none'})`)
            }
            resolved = this._resolveSkillFileAbs(skillRoot, scriptCatalog[0].path)
        } else {
            resolved = this._resolveSkillFileAbs(skillRoot, normalizedScriptPath)
        }

        if (!isRunnableSkillScriptPath(resolved.inner)) {
            throw new Error('only runnable files under scripts/ can be executed')
        }
        if (!fs.existsSync(resolved.abs)) throw new Error(`skill script not found: ${resolved.inner}`)

        const stat = fs.statSync(resolved.abs)
        if (!stat.isFile()) throw new Error(`skill script is not a file: ${resolved.inner}`)

        const ext = path.extname(resolved.abs).toLowerCase()
        const scriptMeta = this._matchSkillScriptCatalogEntry(scriptCatalog, resolved.inner)
        const timeoutHint = scriptMeta?.timeoutMs
        const timeoutMs = Math.max(1000, Math.min(
            10 * 60 * 1000,
            Math.floor(Number(options.timeoutMs ?? options.timeout_ms ?? timeoutHint ?? 120000) || 120000)
        ))

        const cwdInput = typeof options.cwd === 'string' && options.cwd.trim()
            ? options.cwd.trim()
            : typeof scriptMeta?.cwd === 'string'
                ? scriptMeta.cwd.trim()
                : ''
        let execCwd = skillRoot
        if (cwdInput) {
            const cwdResolved = this._resolveSkillFileAbs(skillRoot, cwdInput)
            if (!fs.existsSync(cwdResolved.abs) || !fs.statSync(cwdResolved.abs).isDirectory()) {
                throw new Error(`cwd is not a directory: ${cwdResolved.inner}`)
            }
            execCwd = cwdResolved.abs
        }

        const scriptArgs = Array.isArray(options.args)
            ? options.args.map((item) => String(item ?? ''))
            : []
        const stdinText = options.input === undefined || options.input === null
            ? ''
            : String(options.input)

        const runExecFile = (command, args) => {
            return new Promise((resolve, reject) => {
                const child = execFile(
                    command,
                    args,
                    {
                        cwd: execCwd,
                        env: {
                            ...process.env,
                            AI_TOOLS_SKILL_ID: skillId,
                            AI_TOOLS_SKILL_NAME: String(skill?.name || ''),
                            AI_TOOLS_SKILL_ROOT: skillRoot,
                            AI_TOOLS_SKILL_ENTRY_FILE: String(skill?.entryFile || 'SKILL.md'),
                            AI_TOOLS_SKILL_SCRIPT_PATH: resolved.inner,
                            SKILL_ID: skillId,
                            SKILL_NAME: String(skill?.name || ''),
                            SKILL_ROOT: skillRoot,
                            SKILL_ENTRY_FILE: String(skill?.entryFile || 'SKILL.md'),
                            SKILL_SCRIPT_PATH: resolved.inner
                        },
                        windowsHide: true,
                        timeout: timeoutMs,
                        maxBuffer: 8 * 1024 * 1024
                    },
                    (error, stdout, stderr) => {
                        if (error) {
                            const err = new Error(stderr || stdout || error.message || String(error))
                            err.code = error.code
                            err.stdout = String(stdout || '')
                            err.stderr = String(stderr || '')
                            reject(err)
                            return
                        }
                        resolve({
                            stdout: String(stdout || ''),
                            stderr: String(stderr || '')
                        })
                    }
                )

                if (child?.stdin) {
                    if (stdinText) child.stdin.write(stdinText)
                    child.stdin.end()
                }
            })
        }

        const attempts = []
        if (['.js', '.cjs', '.mjs'].includes(ext)) {
            attempts.push({ command: process.execPath || 'node', args: [resolved.abs, ...scriptArgs] })
        } else if (ext === '.py') {
            attempts.push({ command: 'python', args: [resolved.abs, ...scriptArgs] })
            attempts.push({ command: 'py', args: ['-3', resolved.abs, ...scriptArgs] })
        } else if (ext === '.ps1') {
            attempts.push({
                command: 'powershell.exe',
                args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolved.abs, ...scriptArgs]
            })
        } else if (['.sh', '.bash'].includes(ext)) {
            attempts.push({ command: 'bash', args: [resolved.abs, ...scriptArgs] })
        } else {
            throw new Error(`unsupported skill script type: ${ext || '(no extension)'}. Use .js/.mjs/.cjs/.py/.ps1/.sh`)
        }

        let lastError = null
        for (const attempt of attempts) {
            try {
                const result = await runExecFile(attempt.command, attempt.args)
                const expectedJson = scriptMeta?.outputType === 'json' && !!scriptMeta?.outputTypeDeclared
                const parsedOutput = tryParseJsonText(result.stdout, { force: expectedJson })

                if (expectedJson && !parsedOutput.ok) {
                    const parseError = parsedOutput.error?.message || parsedOutput.reason || 'invalid_json'
                    throw new Error(`skill script ${resolved.inner} must output valid JSON stdout: ${parseError}`)
                }

                const outputType = parsedOutput.ok ? 'json' : 'text'
                return {
                    ok: true,
                    id: skillId,
                    path: resolved.inner,
                    command: attempt.command,
                    args: attempt.args,
                    cwd: execCwd,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: 0,
                    sourceType: 'directory',
                    outputType,
                    output: parsedOutput.ok ? parsedOutput.value : result.stdout,
                    scriptMeta: scriptMeta || null
                }
            } catch (err) {
                lastError = err
                if (err?.code === 'ENOENT') continue
                throw err
            }
        }

        throw lastError || new Error(`failed to execute skill script: ${resolved.inner}`)
    }

    async installSkillsFromCommand(options = {}) {
        const command = typeof options.command === 'string' ? options.command.trim() : ''
        if (!command) throw new Error('command cannot be empty')

        const cwd = typeof options.cwd === 'string' && options.cwd.trim() ? options.cwd.trim() : undefined
        const sourcePath = typeof options.sourcePath === 'string' && options.sourcePath.trim() ? options.sourcePath.trim() : ''
        const expectedRoots = normalizeStringList(options.expectedInstallRoots)
        const fallbackRoots = expectedRoots.length ? expectedRoots : []
        const before = this._discoverSkillDirectoriesInRoots(fallbackRoots)

        const execResult = await new Promise((resolve, reject) => {
            exec(command, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    const err = new Error(stderr || stdout || error.message || String(error))
                    err.stdout = stdout
                    err.stderr = stderr
                    reject(err)
                    return
                }
                resolve({
                    stdout: String(stdout || ''),
                    stderr: String(stderr || '')
                })
            })
        })

        const explicitPaths = new Set(this._collectSkillPathsFromCommandOutput(execResult.stdout))
        if (sourcePath) explicitPaths.add(path.resolve(sourcePath))

        const after = this._discoverSkillDirectoriesInRoots(fallbackRoots)
        const beforeSet = new Set(before)
        const discovered = after.filter((dir) => !beforeSet.has(dir))
        const candidates = Array.from(new Set([...explicitPaths, ...discovered]))
            .filter((dir) => {
                try {
                    return fs.existsSync(path.join(dir, 'SKILL.md'))
                } catch {
                    return false
                }
            })

        if (!candidates.length) {
            throw new Error('command finished but no SKILL.md directory was discovered')
        }

        const installed = candidates.map((dir) => {
            const imported = this.importSkillDirectory(dir, {
                overwrite: !!options.overwrite,
                install: {
                    type: 'command',
                    command,
                    cwd: cwd || '',
                    installedAt: new Date().toISOString(),
                    stdoutPreview: String(execResult.stdout || '').trim().slice(0, 2000)
                }
            })
            return { id: imported._id, name: imported.name, sourcePath: imported.sourcePath }
        })

        return {
            ok: true,
            command,
            installed,
            stdout: execResult.stdout,
            stderr: execResult.stderr
        }
    }

    getChatConfig() {
        return this._clone(this._getRaw()).chatConfig;
    }

    getContentSearchConfig() {
        return this._clone(this.getConfig()).contentSearchConfig;
    }

    getNoteConfig() {
        return this._clone(this.getConfig()).noteConfig;
    }

    getConfigSecurity() {
        return this._clone(this._getRaw()).configSecurity;
    }

    getDataStorageRoot() {
        return this._clone(this._getRaw()).dataStorageRoot;
    }

    getCloudConfig() {
        return this._clone(this._getRaw()).cloudConfig;
    }

    getWebSearchConfig() {
        return this._clone(this.getConfig()).webSearchConfig;
    }

    updateWebSearchConfig(partial) {
        if (!this._isPlainObject(partial)) {
            throw new Error('partial must be a plain object');
        }
        const current = this.getWebSearchConfig()
        const updated = normalizeWebSearchConfig({ ...current, ...partial })
        this._writeLocalWebSearchConfig(updated)

        const config = this._getRaw()
        const syncedWebSearchConfig = pickSyncedWebSearchConfig(updated)
        if (hasSyncedWebSearchConfig(syncedWebSearchConfig)) {
            config.webSearchConfig = syncedWebSearchConfig
        } else {
            delete config.webSearchConfig
        }
        this._save(config)
        return updated;
    }

    updateContentSearchConfig(partial) {
        if (!this._isPlainObject(partial)) {
            throw new Error('partial must be a plain object');
        }
        return this.updateConfig({ contentSearchConfig: partial }).contentSearchConfig;
    }

    // ---------- core config ----------
    updateConfig(partial) {
        const config = this._getRaw();
        if (!this._isPlainObject(partial)) {
            throw new Error('partial must be a plain object');
        }
        const cleanPartial = Object.fromEntries(Object.entries(partial).filter(([_, v]) => v !== undefined));
        let nextLocalNotebookRuntime = null

        if (cleanPartial.chatConfig !== undefined && !this._isPlainObject(cleanPartial.chatConfig)) {
            throw new Error('chatConfig must be a plain object');
        }
        if (cleanPartial.noteConfig !== undefined && !this._isPlainObject(cleanPartial.noteConfig)) {
            throw new Error('noteConfig must be a plain object');
        }
        if (cleanPartial.contentSearchConfig !== undefined && !this._isPlainObject(cleanPartial.contentSearchConfig)) {
            throw new Error('contentSearchConfig must be a plain object');
        }
        if (cleanPartial.configSecurity !== undefined && !this._isPlainObject(cleanPartial.configSecurity)) {
            throw new Error('configSecurity must be a plain object');
        }

        if (cleanPartial.noteConfig !== undefined) {
            const nextNotePatch = { ...cleanPartial.noteConfig }
            if (Object.prototype.hasOwnProperty.call(nextNotePatch, 'notebookRuntime')) {
                nextLocalNotebookRuntime = normalizeNotebookRuntimeConfig(nextNotePatch.notebookRuntime)
                delete nextNotePatch.notebookRuntime
            }
            if (Object.keys(nextNotePatch).length) {
                cleanPartial.noteConfig = nextNotePatch
            } else {
                delete cleanPartial.noteConfig
            }
        }

        if (nextLocalNotebookRuntime) {
            this._writeLocalNotebookRuntimeConfig(nextLocalNotebookRuntime)
        }

        const nextConfig = {
            ...config,
            chatConfig: cleanPartial.chatConfig !== undefined
                ? mergeChatConfig(config.chatConfig, cleanPartial.chatConfig)
                : config.chatConfig,
            contentSearchConfig: cleanPartial.contentSearchConfig !== undefined
                ? mergeContentSearchConfig(config.contentSearchConfig, cleanPartial.contentSearchConfig)
                : normalizeContentSearchConfig(config.contentSearchConfig),
            noteConfig: cleanPartial.noteConfig !== undefined
                ? mergeNoteConfig(config.noteConfig, cleanPartial.noteConfig)
                : config.noteConfig,
            configSecurity: cleanPartial.configSecurity !== undefined
                ? mergeConfigSecurity(config.configSecurity, cleanPartial.configSecurity)
                : config.configSecurity
        }

        const synced = syncConfigStructure(nextConfig)
        this._save(synced);
        return this._buildPublicConfig(synced);
    }

    // ---------- chatConfig ----------
    updateChatConfig(partial) {
        if (!this._isPlainObject(partial)) {
            throw new Error('partial must be a plain object');
        }

        const {
            noteEditor,
            noteSecurity,
            configSecurity,
            ...chatConfigPatch
        } = partial
        const rootPatch = {}

        if (Object.keys(chatConfigPatch).length) {
            rootPatch.chatConfig = chatConfigPatch
        }
        if (noteEditor !== undefined || noteSecurity !== undefined) {
            rootPatch.noteConfig = {}
            if (noteEditor !== undefined) rootPatch.noteConfig.noteEditor = noteEditor
            if (noteSecurity !== undefined) rootPatch.noteConfig.noteSecurity = noteSecurity
        }
        if (configSecurity !== undefined) {
            rootPatch.configSecurity = configSecurity
        }

        const updated = this.updateConfig(rootPatch)
        return updated.chatConfig;
    }

    updateNoteConfig(partial) {
        if (!this._isPlainObject(partial)) {
            throw new Error('partial must be a plain object');
        }
        return this.updateConfig({ noteConfig: partial }).noteConfig;
    }

    updateConfigSecurity(partial) {
        if (!this._isPlainObject(partial)) {
            throw new Error('partial must be a plain object');
        }
        return this.updateConfig({ configSecurity: partial }).configSecurity;
    }

    // ---------- agents 操作 ----------
    getAgent(id) {
        const config = this._getRaw();
        if (!config.agents[id]) throw new Error('Agent not found');
        return this._clone(config.agents[id]);
    }

    addAgent(item) {
        const config = this._getRaw();
        if (!this._isPlainObject(config.agents)) config.agents = {};
        if (config.agents[item._id]) {
            throw new Error(`Agent with id ${item._id} already exists`);
        }
        config.agents[item._id] = {
            ...item,
            prompt: sanitizeAgentPromptReference(item?.prompt, config.prompts)
        };
        this._save(config);
        return config.agents;
    }

    updateAgent(id, updatedFields) {
        const config = this._getRaw();
        if (!config.agents[id]) throw new Error('Agent not found');

        if (BUILTIN_AGENT_IDS.includes(id)) {
            const builtinAgent = buildBuiltinAgent()
            const merged = mergeBuiltinAgent({ ...config.agents[id], ...(updatedFields || {}) }, builtinAgent)
            config.agents[id] = merged
            this._save(config)
            return config.agents
        }

        config.agents[id] = {
            ...config.agents[id],
            ...updatedFields,
            prompt: sanitizeAgentPromptReference(
                Object.prototype.hasOwnProperty.call(updatedFields || {}, 'prompt')
                    ? updatedFields?.prompt
                    : config.agents[id]?.prompt,
                config.prompts
            )
        };
        this._save(config);
        return config.agents;
    }

    deleteAgent(id) {
        if (BUILTIN_AGENT_IDS.includes(id)) throw new Error('内置 Agent 不可删除');
        const config = this._getRaw();
        if (!config.agents[id]) throw new Error('Agent not found');
        delete config.agents[id];
        this._save(config);
        return config.agents;
    }

    // ---------- providers 操作 ----------
    getProvider(id) {
        const config = this._getRaw();
        if (!config.providers[id]) throw new Error('Provider not found');
        return this._clone(config.providers[id]);
    }

    addProvider(item) {
        if (BUILTIN_PROVIDER_IDS.includes(item?._id)) {
            throw new Error('内置 Provider 不可覆盖');
        }
        const config = this._getRaw();
        if (!this._isPlainObject(config.providers)) config.providers = {};
        if (config.providers[item._id]) {
            throw new Error(`Provider with id ${item._id} already exists`);
        }
        config.providers[item._id] = item;
        this._save(config);
        return config.providers;
    }

    updateProvider(id, updatedFields) {
        if (BUILTIN_PROVIDER_IDS.includes(id)) throw new Error('内置 Provider 不可修改');
        const config = this._getRaw();
        if (!config.providers[id]) throw new Error('Provider not found');
        config.providers[id] = { ...config.providers[id], ...updatedFields };
        this._save(config);
        return config.providers;
    }

    deleteProvider(id) {
        if (BUILTIN_PROVIDER_IDS.includes(id)) throw new Error('内置 Provider 不可删除');
        const config = this._getRaw();
        if (!config.providers[id]) throw new Error('Provider not found');
        delete config.providers[id];
        this._save(config);
        return config.providers;
    }

    // ---------- prompts 操作 ----------
    getPrompt(id) {
        const config = this._getRaw();
        if (!config.prompts[id]) throw new Error('Prompt not found');
        return this._clone(config.prompts[id]);
    }

    addPrompt(item) {
        const config = this._getRaw();
        if (!this._isPlainObject(config.prompts)) config.prompts = {};
        const normalizedItem = normalizePromptConfigEntry(item, item?._id)
        const promptId = String(normalizedItem?._id || '').trim()
        if (!promptId) throw new Error('Prompt _id is required');
        if (config.prompts[promptId]) {
            throw new Error(`Prompt with id ${promptId} already exists`);
        }
        config.prompts[promptId] = normalizedItem;
        this._save(config);
        return config.prompts;
    }

    updatePrompt(id, updatedFields) {
        if (id === BUILTIN_PROMPT_ID) throw new Error('内置 Prompt 不可修改');
        const config = this._getRaw();
        if (!config.prompts[id]) throw new Error('Prompt not found');
        config.prompts[id] = normalizePromptConfigEntry({ ...config.prompts[id], ...updatedFields }, id);
        this._save(config);
        return config.prompts;
    }

    deletePrompt(id) {
        if (id === BUILTIN_PROMPT_ID) throw new Error('内置 Prompt 不可删除');
        const config = this._getRaw();
        if (!config.prompts[id]) throw new Error('Prompt not found');
        delete config.prompts[id];
        this._save(config);
        return config.prompts;
    }

    // ---------- mcpServers 操作 ----------
    getMcpServer(id) {
        const config = this._getRaw();
        if (!config.mcpServers[id]) throw new Error('MCP server not found');
        return this._clone(config.mcpServers[id]);
    }

    addMcpServer(item) {
        const config = this._getRaw();
        if (!this._isPlainObject(config.mcpServers)) config.mcpServers = {};
        if (config.mcpServers[item._id]) {
            throw new Error(`MCP server with id ${item._id} already exists`);
        }
        config.mcpServers[item._id] = item;
        this._save(config);
        return config.mcpServers;
    }

    updateMcpServer(id, updatedFields) {
        if (BUILTIN_MCP_SERVER_IDS.includes(id)) throw new Error('内置 MCP 不可修改');
        const config = this._getRaw();
        if (!config.mcpServers[id]) throw new Error('MCP server not found');
        config.mcpServers[id] = { ...config.mcpServers[id], ...updatedFields };
        this._save(config);
        return config.mcpServers;
    }

    deleteMcpServer(id) {
        if (BUILTIN_MCP_SERVER_IDS.includes(id)) throw new Error('内置 MCP 不可删除');
        const config = this._getRaw();
        if (!config.mcpServers[id]) throw new Error('MCP server not found');
        delete config.mcpServers[id];
        this._save(config);
        return config.mcpServers;
    }

    // ---------- skills 操作 ----------
    getSkill(id) {
        const config = this._getRaw();
        if (!config.skills[id]) throw new Error('Skill not found');
        return this._clone(config.skills[id]);
    }

    addSkill(item) {
        const config = this._getRaw();
        if (!this._isPlainObject(config.skills)) config.skills = {};
        if (config.skills[item._id]) {
            throw new Error(`Skill with id ${item._id} already exists`);
        }
        config.skills[item._id] = item;
        this._save(config);
        return config.skills;
    }

    updateSkill(id, updatedFields) {
        const config = this._getRaw();
        if (!config.skills[id]) throw new Error('Skill not found');
        if (BUILTIN_SKILL_IDS.includes(id)) throw new Error('内置 Skill 不可修改');

        config.skills[id] = { ...config.skills[id], ...updatedFields };
        this._save(config);
        return config.skills;
    }

    deleteSkill(id) {
        if (BUILTIN_SKILL_IDS.includes(id)) throw new Error('内置 Skill 不可删除');
        const config = this._getRaw();
        if (!config.skills[id]) throw new Error('Skill not found');
        delete config.skills[id];
        this._save(config);
        return config.skills;
    }

    // ---------- timedTask 操作 ----------
    getTimedTask(id) {
        const config = this._getRaw();
        if (!config.timedTask[id]) throw new Error('Timed task not found');
        return this._clone(config.timedTask[id]);
    }

    addTimedTask(item) {
        if (!this._isPlainObject(item)) throw new Error('Timed task must be a plain object')
        const rawId = typeof item._id === 'string' ? item._id.trim() : ''
        if (!rawId) throw new Error('Timed task _id 不能为空')
        item._id = rawId

        const config = this._getRaw();
        if (!this._isPlainObject(config.timedTask)) config.timedTask = {};
        if (config.timedTask[item._id]) {
            throw new Error(`Timed task with id ${item._id} already exists`);
        }
        config.timedTask[item._id] = item;
        this._save(config);
        return config.timedTask;
    }

    updateTimedTask(id, updatedFields) {
        const config = this._getRaw();
        if (!config.timedTask[id]) throw new Error('Timed task not found');
        if (!this._isPlainObject(updatedFields)) throw new Error('updatedFields must be a plain object')
        const patch = { ...updatedFields }
        delete patch._id
        delete patch.builtin
        config.timedTask[id] = { ...config.timedTask[id], ...patch };
        this._save(config);
        return config.timedTask;
    }

    deleteTimedTask(id) {
        const config = this._getRaw();
        if (!config.timedTask[id]) throw new Error('Timed task not found');
        delete config.timedTask[id];
        this._save(config);
        return config.timedTask;
    }

    // ---------- dataStorageRoot ----------
    updateDataStorageRoot(rootPath) {
        const config = this._getRaw();
        config.dataStorageRoot = rootPath;
        this._save(config);
        return config.dataStorageRoot;
    }

    resetDataStorageRoot() {
        const config = this._getRaw();
        config.dataStorageRoot = utools.getPath('userData');
        this._save(config);
        return config.dataStorageRoot;
    }

    // ---------- cloudConfig ----------
    updateCloudConfig(partial) {
        const config = this._getRaw();
        const current = config.cloudConfig;
        if (!this._isPlainObject(current)) {
            throw new Error('cloudConfig is not an object');
        }
        if (!this._isPlainObject(partial)) {
            throw new Error('partial must be a plain object');
        }
        const cleanPartial = Object.fromEntries(
            Object.entries(partial).filter(([_, v]) => v !== undefined)
        );
        config.cloudConfig = normalizeCloudConfig({ ...current, ...cleanPartial });
        this._save(config);
        return config.cloudConfig;
    }

    cutTheme() {
        const config = this._getRaw();
        config.theme = config.theme === 'dark' ? 'light' : 'dark';
        this._save(config);
        return config.theme;
    }
}

module.exports = new GlobalConfig();




