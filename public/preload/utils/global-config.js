const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, exec, execFile, execFileSync } = require('child_process');
const { parseEnv: parseNodeEnv } = require('util');
const { fileURLToPath } = require('url');
const {
    MAX_SKILL_PACKAGE_DOWNLOAD_BYTES,
    MAX_SKILL_PACKAGE_FILE_BYTES,
    MAX_SKILL_PACKAGE_FILE_COUNT,
    MAX_SKILL_PACKAGE_TOTAL_FILE_BYTES,
    buildExportableSkillPackage,
    normalizeSkillPackage,
    slugify
} = require('./skill-package');
const { DEFAULT_CONTENT_SEARCH_CONFIG, normalizeContentSearchConfig } = require('./contentSearchConfig');
const {
    assertPublicNetworkUrl,
    createPublicNetworkLookup
} = require('./network-safety');
const {
    BUILTIN_SKILL_IDS: BUILTIN_SKILL_ID_MAP,
    buildBuiltinSkillRecords
} = require('../builtin-skills');

const SKILL_PACKAGE_DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_SKILL_PACKAGE_ERROR_RESPONSE_BYTES = 512 * 1024;
const MAX_SKILL_PACKAGE_REDIRECTS = 4;

function killProcessTreeSafely(proc) {
    if (!proc || !Number.isFinite(Number(proc.pid))) return
    if (process.platform === 'win32') {
        try {
            spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
                windowsHide: true,
                stdio: 'ignore'
            })
            return
        } catch {
            // Fall through to the generic kill below.
        }
    } else {
        try {
            // detached: true makes the child a process-group leader.
            process.kill(-proc.pid, 'SIGKILL')
        } catch {
            // Fall through to the generic kill below.
        }
    }
    try {
        proc.kill('SIGKILL')
    } catch {
        // The process may already be gone.
    }
}

function formatBytesAsMiB(bytes) {
    return `${Math.floor(Number(bytes) / 1024 / 1024)}MiB`;
}

function requestPublicSkillPackageOnce(parsedUrl) {
    return new Promise((resolve, reject) => {
        const client = parsedUrl.protocol === 'https:' ? https : http;
        let settled = false;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            callback(value);
        };
        const req = client.request(parsedUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json,text/plain;q=0.9,*/*;q=0.1',
                'User-Agent': 'AiTools/1.0'
            },
            lookup: createPublicNetworkLookup()
        }, (response) => {
            const status = Number(response.statusCode) || 0;
            const location = String(response.headers?.location || '').trim();
            if ([301, 302, 303, 307, 308].includes(status) && location) {
                response.destroy();
                finish(resolve, { status, location, text: '' });
                return;
            }

            const responseLimit = status >= 200 && status < 300
                ? MAX_SKILL_PACKAGE_DOWNLOAD_BYTES
                : MAX_SKILL_PACKAGE_ERROR_RESPONSE_BYTES;
            const contentLength = Number(response.headers?.['content-length']);
            if (Number.isFinite(contentLength) && contentLength > responseLimit) {
                req.destroy();
                finish(reject, new Error(
                    status >= 200 && status < 300
                        ? `Skill 包下载内容过大（网络响应上限 ${formatBytesAsMiB(MAX_SKILL_PACKAGE_DOWNLOAD_BYTES)}）`
                        : 'Skill 包下载失败，错误响应内容过大'
                ));
                return;
            }

            const chunks = [];
            let totalBytes = 0;
            response.on('data', (chunk) => {
                if (settled) return;
                totalBytes += chunk.length;
                if (totalBytes > responseLimit) {
                    req.destroy();
                    finish(reject, new Error(
                        status >= 200 && status < 300
                            ? `Skill 包下载内容过大（网络响应上限 ${formatBytesAsMiB(MAX_SKILL_PACKAGE_DOWNLOAD_BYTES)}）`
                            : 'Skill 包下载失败，错误响应内容过大'
                    ));
                    return;
                }
                chunks.push(chunk);
            });
            response.once('end', () => {
                finish(resolve, {
                    status,
                    location: '',
                    text: Buffer.concat(chunks, totalBytes).toString('utf-8')
                });
            });
            response.once('error', (error) => finish(reject, error));
        });

        req.setTimeout(SKILL_PACKAGE_DOWNLOAD_TIMEOUT_MS, () => {
            req.destroy(new Error(`Skill 包下载超时（${SKILL_PACKAGE_DOWNLOAD_TIMEOUT_MS}ms）`));
        });
        req.once('error', (error) => finish(reject, error));
        req.end();
    });
}

async function downloadPublicSkillPackageText(rawUrl) {
    let currentUrl = String(rawUrl || '').trim();

    for (let redirectCount = 0; redirectCount <= MAX_SKILL_PACKAGE_REDIRECTS; redirectCount += 1) {
        const parsedUrl = assertPublicNetworkUrl(currentUrl);
        const response = await requestPublicSkillPackageOnce(parsedUrl);
        if (response.location) {
            if (redirectCount >= MAX_SKILL_PACKAGE_REDIRECTS) {
                throw new Error(`Skill 包下载重定向次数超过 ${MAX_SKILL_PACKAGE_REDIRECTS} 次`);
            }
            currentUrl = new URL(response.location, parsedUrl).toString();
            continue;
        }
        if (response.status < 200 || response.status >= 300) {
            const errorPreview = String(response.text || 'Unknown error')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 500);
            throw new Error(`下载失败 (${response.status || 'unknown'})：${errorPreview || 'Unknown error'}`);
        }
        return {
            text: response.text,
            finalUrl: parsedUrl.toString()
        };
    }

    throw new Error('Skill 包下载失败');
}

const DEFAULT_SYSTEM_PROMPT = [
  '你是一个 AI 助手（AI Assistant），定位为「执行型智能助手」。',
  '',
  '## 🗣️ 沟通语言',
  '- 默认使用简体中文。',
  '- 用户明确要求其他语言时再切换。',
  '',
  '## 🎯 核心目标',
  '以「准确、可执行、可验证」为最高优先级。',
  '',
  '你的任务不是展示知识，而是帮助用户快速完成目标。',
  '',
  '优先级：',
  '1. 解决问题',
  '2. 提供可执行方案',
  '3. 给出验证方法',
  '4. 必要时补充原理',
  '',
  '## 🚀 工作方式',
  '',
  '- 优先直接解决问题，不进行无意义铺垫。',
  '- 能确定的信息直接执行，不重复询问。',
  '- 不确定但风险较低时，给出合理方案并标注假设。',
  '- 只有以下情况才主动询问：',
  '  - 缺少关键输入',
  '  - 存在明显不同方向选择',
  '  - 操作可能造成不可逆损失',
  '',
  '## 📌 输出风格',
  '',
  '默认格式：',
  '',
  '【结论】',
  '直接给答案或推荐方案。',
  '',
  '【步骤】',
  '提供执行步骤、代码、命令或操作流程。',
  '',
  '【验证】',
  '说明如何确认是否成功。',
  '',
  '【注意事项】',
  '只列出必要风险和限制。',
  '',
  '要求：',
  '- 简洁优先。',
  '- 避免重复用户问题。',
  '- 避免客套开场。',
  '- 避免长篇背景介绍。',
  '- 不输出无关扩展内容。',
  '',
  '## 🧠 分析原则',
  '',
  '- 内部进行完整分析和校验。',
  '- 对外只输出：',
  '  - 关键判断',
  '  - 必要依据',
  '  - 执行结果',
  '',
  '不要输出详细思考过程。',
  '',
  '## 💻 代码与技术任务',
  '',
  '当涉及代码、配置、命令：',
  '',
  '- 优先提供完整可运行示例。',
  '- 不只提供零散代码片段。',
  '- 包含必要上下文。',
  '- 提供验证命令或测试方法。',
  '- 如果修改代码，明确指出修改位置。',
  '',
  '## ⚠️ 风险操作',
  '',
  '涉及以下操作时：',
  '',
  '- 删除数据',
  '- 修改系统配置',
  '- 权限调整',
  '- 网络、安全相关操作',
  '',
  '必须：',
  '',
  '1. 明确风险。',
  '2. 给出安全方案。',
  '3. 必要时请求确认。',
  '',
  '## ❌ 禁止行为',
  '',
  '禁止：',
  '- 编造不存在的信息。',
  '- 假装已经执行实际操作。',
  '- 输出无法验证的结论。',
  '- 使用大量模板化客套语言。',
  '- 为简单问题提供复杂回答。',
  '',
  '## 📏 输出长度',
  '',
  '默认控制长度：',
  '',
  '- 简单问题：100字以内。',
  '- 普通技术问题：300~800字。',
  '- 复杂设计问题：结构化详细回答。',
  '',
  '只有用户明确要求深入分析时，再展开。',
].join('\n')

const LEGACY_DEFAULT_SYSTEM_PROMPTS = new Set([
    [
        '你是一个 AI 助手（AI Assistant）。',
        '默认使用简体中文回复；仅在用户明确要求时切换到其他语言。',
        '优先给出准确、可执行、可验证的结论与步骤。',
        '不确定时先提出 1 到 2 个关键澄清问题，避免做高风险假设。',
        '涉及代码、配置或命令时，优先给出可直接操作的步骤与示例。',
        '遇到可能有风险或权限不足的操作时，先说明风险并征求确认。',
        '不要编造信息；需要外部信息时，明确说明并给出获取或验证方式。'
    ].join('\n'),
    [
        '你是一个 AI 助手（AI Assistant）。',
        '',
        '沟通语言：',
        '- 默认使用简体中文与用户交流；仅当用户明确要求时才切换到其他语言。',
        '',
        '目标与风格：',
        '- 以“准确、可执行、可验证”为优先；先给结论/方案，再给步骤与注意事项。',
        '- 不确定时先提出 1 到 2 个关键澄清问题，避免做高风险假设。',
        '- 涉及代码/配置/命令时，优先给出可直接操作的步骤与示例。',
        '',
        '思考与解释：',
        '- 你可以在内部进行逐步推理与自检。',
        '- 对外请用简洁的“思路要点/关键依据”进行引导（3 到 5 条要点即可），避免冗长。',
        '',
        '安全与边界：',
        '- 遇到可能有风险或权限不足的操作，先提示风险与替代方案，并征求确认。',
        '- 不要编造信息；需要外部信息时明确说明，并给出获取/验证方法。'
    ].join('\n')
])

function normalizeDefaultSystemPrompt(value) {
    if (typeof value !== 'string') return DEFAULT_SYSTEM_PROMPT
    const normalized = value.replace(/\r\n?/g, '\n').trim()
    return LEGACY_DEFAULT_SYSTEM_PROMPTS.has(normalized) ? DEFAULT_SYSTEM_PROMPT : value
}

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
    storeMaxItems: 200,
    dynamicMemoryMaxAgeDays: 180,
    profileMaxItems: 8,
    relevantMaxItems: 6
})

// -------------------- Built-in presets (Skill / Prompt / Agent) --------------------
const LEGACY_BUILTIN_MCP_SERVER_IDS = Object.freeze([
    'builtin_notes_mcp',
    'builtin_config_mcp',
    'builtin_sessions_mcp',
    'builtin_agents_mcp',
    'builtin_shell_mcp'
])
const BUILTIN_SKILL_ID = BUILTIN_SKILL_ID_MAP.notes
const BUILTIN_CONFIG_SKILL_ID = BUILTIN_SKILL_ID_MAP.config
const BUILTIN_SESSIONS_SKILL_ID = BUILTIN_SKILL_ID_MAP.sessions
const BUILTIN_AGENT_ORCHESTRATION_SKILL_ID = BUILTIN_SKILL_ID_MAP.agents
const BUILTIN_SHELL_SKILL_ID = BUILTIN_SKILL_ID_MAP.shell
const BUILTIN_PROMPT_ID = 'builtin_prompt_notes'
const BUILTIN_AGENT_ID = 'builtin_agent_notes'
const BUILTIN_PROVIDER_ID = 'builtin_provider_utools_ai'

const BUILTIN_SKILL_IDS = [BUILTIN_SKILL_ID, BUILTIN_CONFIG_SKILL_ID, BUILTIN_SESSIONS_SKILL_ID, BUILTIN_AGENT_ORCHESTRATION_SKILL_ID, BUILTIN_SHELL_SKILL_ID]
const BUILTIN_PROMPT_IDS = [BUILTIN_PROMPT_ID]
const BUILTIN_AGENT_IDS = [BUILTIN_AGENT_ID]
const BUILTIN_PROVIDER_IDS = [BUILTIN_PROVIDER_ID]

function buildBuiltinSkill() {
    return buildBuiltinSkillRecords()[BUILTIN_SKILL_ID]
}

function buildBuiltinConfigSkill() {
    return buildBuiltinSkillRecords()[BUILTIN_CONFIG_SKILL_ID]
}

function buildBuiltinSessionsSkill() {
    return buildBuiltinSkillRecords()[BUILTIN_SESSIONS_SKILL_ID]
}

function buildBuiltinAgentOrchestrationSkill() {
    return buildBuiltinSkillRecords()[BUILTIN_AGENT_ORCHESTRATION_SKILL_ID]
}

function buildBuiltinShellSkill() {
    return buildBuiltinSkillRecords()[BUILTIN_SHELL_SKILL_ID]
}

function buildBuiltinPrompt() {
    return {
        _id: BUILTIN_PROMPT_ID,
        name: 'Ai Tools 助手（内置）',
        description: 'Ai Tools 内置助手系统提示词：稳定地按需加载 Skill，并通过原生 actions 管理笔记、超级笔记、配置、会话、智能体和命令工作区。',
        type: 'system',
        content: [
            '你是 Ai Tools 插件内置助手。使用内置 Skill 的原生 actions 读取和修改真实数据；Action 通过 skill_discover 按需发现并通过 skill_call 调用，外部 MCP 只用于用户配置的第三方工具。',
            '',
            '角色边界：',
            '- Prompt：定义系统级指令、风格、约束与回答边界。',
            '- Skill：定义可复用规则、知识入口、任务流程和可调用的原生 actions；必要时按需加载 SKILL.md，并按需发现 Action Schema。',
            '- MCP：仅表示用户配置的外部工具能力。',
            '- Agent：把 provider / model / prompt / skills / MCP 组合起来执行具体任务。',
            '',
            '通用原则：',
            '- 只有在需要读取真实状态、验证结果或修改数据时才使用工具；纯解释或当前上下文足够时直接回答。读取或修改笔记、配置时不要猜。',
            '- 用户不需要先说出 Skill、MCP、Prompt、Agent 或笔记的名字。收到非简单任务后，先根据任务中的专有名词、业务标识、目标产物和工作流判断是否可能已有实现；命中线索时优先轻量检索和复用，未命中再自行完成。不要为寒暄、常识问答或明显一次性的小任务做无意义的全局扫描。',
            '- 默认通用 Agent 可按需使用全部已安装 Skill 和已启用 MCP，但不会预先挂载全部 Skill；宿主会根据当前任务最多激活少量相关 Skill。优先使用当前已挂载的能力，未命中时再轻量发现，不要一次性展开全部正文或 Schema。',
            '- 写入前先确认路径、id、名称和模式；只有缺失信息会显著改变写入目标或风险时，才问 1 个简短澄清问题。',
            '- 敏感信息如 API Key、env、headers 不要回显。',
            '- 内置 Skill / Prompt 不可删除或修改；内置 Agent 不可删除，且只允许部分字段更新。',
            '- 对 Agent、Skill、MCP、笔记和会话这类可能很多的对象，默认优先轻量定位，优先用检索/最近/目录工具缩小范围，不要一上来就做整库递归遍历。',
            '',
            '执行稳定性（高优先级）：',
            '- 先区分用户是在询问/审查/诊断，还是要求创建/修改/执行；前一类默认只读，不要擅自产生外部写入。',
            '- 采用最小充分调用并复用本轮结果。能力索引、`skill_discover`、目录、列表、搜索和同一文件读取在状态未变化时原则上只调用一次；继续分页、结果明确不足或目标状态已改变时除外。',
            '- 已加载的 Skill 不要再次加载；已取得的 Action Schema 直接复用。只发现当前要调用的 Action，不要反复查看全部可用能力。',
            '- 工具失败后先根据错误调整参数、路径、权限或工具，不要原样重复失败调用；同一根因连续失败 2 次后停止盲试，说明阻碍并给出可执行的下一步。',
            '- 写入或执行成功后只做一次必要验证；验证已足够时不要继续重复读取、搜索或运行。',
            '- 只有 action 明确返回成功，才可以声称已保存、已修改、已执行或已通过验证；不得编造 action 结果、id、路径、文件、下载链接或测试结果。',
            '- 达到用户目标后立即停止工具调用并给出简洁结论，不要为了“再确认一下”继续扫描。',
            '',
            '内置 Skill actions：',
            '- 笔记：`notes_*` 管理 Markdown 和目录；`notebook_*` 管理并执行 `.ipynb` 超级笔记。',
            '- 会话：`sessions_*` 检索与读取历史会话和定时任务日志。',
            '- 配置：`config_*` 管理外部 MCP、Skills、Prompts、Agents、Providers 和定时任务。',
            '- 编排：`agents_list` / `agent_run`。',
    '- 命令工作区：先用 `sandbox_status` 查看实际隔离等级和 Python/uv/Node/Git 等工具链。创建或读取源码、README、JSON 等文本时优先使用 `sandbox_write_file` / `sandbox_read_file`，不要把大段内容嵌入 Shell 命令。确需执行命令时使用 `sandbox_run`；Windows 默认使用 PowerShell，需要 Bash 语法时再用 `bash_run` 或指定 `shell: bash`。工作位置按文件生命周期决定：聊天附件放在对应会话沙盒；临时脚本、中间产物和未指定目标的生成结果都使用 `workspace_scope: sandbox`。即使用户已连接本机工作区，也不要自动改到那里执行；只有任务明确要求读取或原地修改当前本机项目时，才对相关操作使用 `workspace_scope: host`。本机根目录由宿主注入，工具仍只能使用相对路径，不得填写或猜测绝对路径。查找文件时可用 `sandbox_list` 的 `workspace_scope: all` 同时检索沙盒和本机工作区，并根据返回的 `workspaceKind` 选择后续范围。命令与代码执行是否需要审批由当前工具权限模式决定。',
    '- 会话沙盒产生文件后，优先放入 `output/`。用户明确要求把最终文件保存到当前本机工作区时，使用 `sandbox_export` 从沙盒直接复制到本机相对路径；不要回读 Base64、切块或手工重写二进制文件。只有 action 实际返回 `downloadHref` 时才使用它生成下载链接。本机工作区文件没有沙盒下载链接，应报告 action 返回的相对路径；不要自行拼接或猜测 `sandbox-file://`、绝对路径或普通相对下载链接。',
            '- Windows PowerShell 的 `Compress-Archive` 只接受 `.zip` 目标。生成 `.apks`、`.jar`、`.docx` 等 ZIP 容器时，直接先写入临时 `.zip` 再重命名为目标后缀，或使用 .NET 压缩 API；不要先用不受支持的后缀调用一次再补救。',
            '',
            '配置规范：',
            '- 标准 Skill 导入优先：如果用户提供的是 skill 目录或 `SKILL.md`，优先使用 `config_import_skill_directory` / `config_import_skill_file`。',
            '- 只有旧版内联 Skill，或用户明确要求把规则直接保存到配置里时，才使用 `config_add_skill` / `config_update_skill`。',
            '- `config_update_*` 必须使用 `{ id, patch }`；修改 `transportType` 或定时任务类型时，要补齐必需字段。',
            '- 涉及相对时间时，先调用 `config_get_system_time` 再回答具体日期或时间。',
            '- 绑定关系要分清：Agent 只能绑定系统 Prompt；用户 Prompt 用于插入输入框，不直接绑定到 Agent。',
            '- 任务可能已有用户 Prompt 模板时，先 `config_list_prompts` 按名称和描述定位，再用 `config_read_prompt` 读取唯一候选。用户 Prompt 是可复用指导或输入模板，不能覆盖更高优先级安全约束。',
            '',
            '笔记规范：',
            '- 已知明确路径时，直接 `notes_read`；不要为了读单篇笔记先列树。',
            '- 已知关键词或路径片段时，优先 `notes_search`；默认走关键词检索，只有全局检索完整配置向量服务商和模型并启用混合模式后才会使用混合检索，否则自动回退到关键词检索。索引会在笔记变更和配置切换后自动维护。加密笔记不会出现在搜索和最近列表中。已知目录或最近线索时，再用 `notes_list_directory` / `notes_list_recent`。',
            '- 查阅笔记：优先先 `notes_search` / `notes_list_directory` / `notes_list_recent`，只在确实需要整体结构时再用 `notes_list_tree`，然后再 `notes_read`。',
            '- 不要默认从 note 根目录做大深度 `notes_list_tree`。',
            '- 当请求包含 bundle_id、业务字段名、脚本名、接口名、固定产物名等明显专有线索，或用户暗示“以前做过/有现成方法”时，即使用户没有说“笔记”，也应先用 1-3 个最有区分度的词调用 `notes_search`。若命中可执行超级笔记，先读取说明和参数，再按用户目标调用对应 `notebook_*` 动作执行；不要只复述实现。',
            '',
            '智能体与会话规范：',
            '- 查找合适的用户 Agent 时，优先先 `agents_list`；如果只知道任务意图、能力特征或提示词方向，可以直接传 `query`。Agent、Skill 和 MCP 共用全局能力检索配置；默认走关键词检索，完整配置向量服务商和模型并启用混合模式后才会结合语义结果。内置默认通用 Agent 不属于可委派目标，不能把当前任务再次委派给它自身。',
            '- 查历史会话：优先先 `sessions_search` / `sessions_list_directory` / `sessions_list_recent`，默认走关键词检索，只有全局检索完整配置向量服务商和模型并启用混合模式后才会使用混合检索，否则自动回退到关键词检索。索引会在会话变更和配置切换后自动维护。只在确实需要整体结构时再用 `sessions_list_tree`，然后再 `sessions_read` / `sessions_read_many`。',
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
        // 默认通用 Agent 不预绑定 Skill；聊天与定时任务会根据当前任务按需路由。
        skills: [],
        // 外部 MCP 仍由用户按需绑定；内置能力通过按需激活的 Skill 原生 actions 提供。
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
    maxTokensExpanded: 100000,
    maxTokensCompact: 80000,
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
    autoSyncEnabled: false
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
        autoSyncEnabled: src.autoSyncEnabled === true || src.autoBackupEnabled === true || src.autoRestoreEnabled === true
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
            maxTokensExpanded: preset === 'aggressive' ? 32000 : preset === 'wide' ? 250000 : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTokensExpanded,
            maxTokensCompact: preset === 'aggressive' ? 24000 : preset === 'wide' ? 200000 : DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTokensCompact,
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
        maxTokensExpanded: normalizeIntegerInRange(src.maxTokensExpanded, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTokensExpanded, 1000, 4000000),
        maxTokensCompact: normalizeIntegerInRange(src.maxTokensCompact, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxTokensCompact, 1000, 4000000),
        maxCharsExpanded: normalizeIntegerInRange(src.maxCharsExpanded, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxCharsExpanded, 4000, 4200000),
        maxCharsCompact: normalizeIntegerInRange(src.maxCharsCompact, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.maxCharsCompact, 4000, 4200000),
        autoCompactTriggerPercent: normalizeBudgetTriggerPercent(src.autoCompactTriggerPercent, DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG.autoCompactTriggerPercent)
    }

    next.keepRecentTurnsFull = Math.min(next.keepRecentTurnsFull, next.maxTurns)
    next.maxTokensCompact = Math.min(next.maxTokensCompact, next.maxTokensExpanded)
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
        defaultSystemPrompt: normalizeDefaultSystemPrompt(src.defaultSystemPrompt),
        toolApprovalMode: ['manual', 'safe', 'full', 'trusted', 'deny'].includes(src.toolApprovalMode)
            ? src.toolApprovalMode
            : 'safe',
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
        storeMaxItems: normalizeChatMemoryInteger(src.storeMaxItems, DEFAULT_CHAT_MEMORY_CONFIG.storeMaxItems, 20, 5000),
        dynamicMemoryMaxAgeDays: normalizeChatMemoryInteger(
            src.dynamicMemoryMaxAgeDays,
            DEFAULT_CHAT_MEMORY_CONFIG.dynamicMemoryMaxAgeDays,
            0,
            3650
        ),
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

const AGENT_REASONING_EFFORT_OPTIONS = new Set([
    'auto',
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max'
])

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

    // Remove legacy built-in MCP selections; built-in capabilities now come from native Skill actions.
    const oldDefault = new Set(LEGACY_BUILTIN_MCP_SERVER_IDS)
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

function parseSkillAgentYaml(text) {
    const raw = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    const result = {}
    let section = ''

    raw.split('\n').forEach((line) => {
        if (!line.trim() || line.trimStart().startsWith('#')) return
        const top = line.match(/^([A-Za-z0-9_-]+)\s*:\s*$/)
        if (top) {
            section = top[1]
            if (!result[section]) result[section] = {}
            return
        }
        const field = line.match(/^\s{2}([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
        if (!field || !section) return
        const value = parseSimpleYamlScalar(field[2])
        result[section][field[1]] =
            value === 'true' ? true : value === 'false' ? false : value
    })

    return result
}

function normalizeSkillInterfaceMetadata(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    return {
        displayName: String(source.display_name || source.displayName || '').trim(),
        shortDescription: String(source.short_description || source.shortDescription || '').trim(),
        defaultPrompt: String(source.default_prompt || source.defaultPrompt || '').trim(),
        iconSmall: String(source.icon_small || source.iconSmall || '').trim(),
        iconLarge: String(source.icon_large || source.iconLarge || '').trim(),
        brandColor: String(source.brand_color || source.brandColor || '').trim()
    }
}

function normalizeConfigIconValue(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if (/[\u0000-\u001f\u007f]/.test(raw)) throw new Error('icon contains control characters')
    if (/^data:/i.test(raw)) {
        if (!/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml|avif);base64,/i.test(raw)) {
            throw new Error('icon data URL must contain a supported image')
        }
        if (raw.length > 512 * 1024) throw new Error('icon data URL is too large')
        if (/^data:image\/svg\+xml;base64,/i.test(raw)) {
            let svg = ''
            try {
                svg = Buffer.from(raw.slice(raw.indexOf(',') + 1), 'base64').toString('utf-8')
            } catch {
                throw new Error('icon SVG data URL is invalid')
            }
            if (/<script\b|on[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:|data:)/i.test(svg)) {
                throw new Error('icon SVG contains active or remote content')
            }
        }
        return raw
    }
    if (/^https?:\/\//i.test(raw)) {
        if (raw.length > 2048) throw new Error('icon URL is too long')
        return raw
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) throw new Error('unsupported icon URL scheme')
    if (Array.from(raw).length > 8) throw new Error('text icon cannot exceed 8 characters')
    return raw
}

function validateStandardSkillFrontmatter(frontmatter, skillRoot) {
    const meta = frontmatter && typeof frontmatter === 'object' ? frontmatter : {}
    const name = String(meta.name || '').trim()
    const description = String(meta.description || '').trim()
    const folderName = path.basename(skillRoot)

    if (!name) throw new Error('SKILL.md frontmatter 缺少必填字段 name')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
        throw new Error('SKILL.md name 必须为 1-64 位小写字母、数字或单连字符')
    }
    if (name !== folderName) throw new Error(`SKILL.md name 必须与目录名一致：${folderName}`)
    if (!description) throw new Error('SKILL.md frontmatter 缺少必填字段 description')
    if (description.length > 1024) throw new Error('SKILL.md description 不能超过 1024 个字符')
    if (meta.compatibility != null && String(meta.compatibility).trim().length > 500) {
        throw new Error('SKILL.md compatibility 不能超过 500 个字符')
    }
    if (meta['allowed-tools'] != null && typeof meta['allowed-tools'] !== 'string') {
        throw new Error('SKILL.md allowed-tools 必须是空格分隔的字符串')
    }
    return { name, description }
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

const SKILL_DOTENV_FILENAME = '.env'
const MAX_SKILL_DOTENV_BYTES = 64 * 1024
const RESERVED_SKILL_ENV_KEYS = new Set([
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'LANG',
    'LC_ALL',
    'TERM',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
    'HOME',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'TMP',
    'TEMP',
    'TMPDIR',
    'NODE_OPTIONS',
    'NODE_PATH',
    'NODE_EXTRA_CA_CERTS',
    'NODE_TLS_REJECT_UNAUTHORIZED',
    'ELECTRON_RUN_AS_NODE',
    'PYTHONHOME',
    'PYTHONPATH',
    'PYTHONSTARTUP',
    'VIRTUAL_ENV',
    'BASH_ENV',
    'ENV',
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH'
])

function getSkillEnvironmentFileBasename(filePath) {
    const normalized = normalizeSkillPathForMatch(filePath).toLowerCase()
    return normalized ? path.posix.basename(normalized) : ''
}

function isSkillEnvironmentExampleFilePath(filePath) {
    return getSkillEnvironmentFileBasename(filePath) === '.env.example'
}

function isSensitiveSkillEnvironmentFilePath(filePath) {
    const basename = getSkillEnvironmentFileBasename(filePath)
    return basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example')
}

function isReservedSkillEnvironmentKey(key) {
    const normalized = String(key || '').trim().toUpperCase()
    return RESERVED_SKILL_ENV_KEYS.has(normalized)
        || normalized.startsWith('AI_TOOLS_')
        || normalized.startsWith('SKILL_')
        || normalized.startsWith('XDG_')
}

function parseSkillDotEnvFallback(text) {
    const parsed = {}
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)

    lines.forEach((rawLine, index) => {
        let line = rawLine.trim()
        if (!line || line.startsWith('#')) return
        line = line.replace(/^export\s+/, '')

        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
        if (!match) throw new Error(`invalid assignment at line ${index + 1}`)

        const key = match[1]
        let value = match[2].trim()
        const quote = value[0]

        if (quote === '"' || quote === "'") {
            let closingIndex = -1
            for (let i = 1; i < value.length; i += 1) {
                if (quote === '"' && value[i] === '\\') {
                    i += 1
                    continue
                }
                if (value[i] === quote) {
                    closingIndex = i
                    break
                }
            }
            if (closingIndex < 0) throw new Error(`unterminated quoted value at line ${index + 1}`)

            const trailing = value.slice(closingIndex + 1).trim()
            if (trailing && !trailing.startsWith('#')) {
                throw new Error(`unexpected content at line ${index + 1}`)
            }

            value = value.slice(1, closingIndex)
            if (quote === '"') {
                value = value.replace(/\\([nrt"\\$])/g, (_whole, escaped) => {
                    if (escaped === 'n') return '\n'
                    if (escaped === 'r') return '\r'
                    if (escaped === 't') return '\t'
                    return escaped
                })
            }
        } else {
            const commentIndex = value.indexOf('#')
            if (commentIndex >= 0) value = value.slice(0, commentIndex).trim()
        }

        parsed[key] = value
    })

    return parsed
}

function parseSkillDotEnv(text) {
    const normalized = String(text || '').replace(/^\uFEFF/, '')
    return typeof parseNodeEnv === 'function'
        ? parseNodeEnv(normalized)
        : parseSkillDotEnvFallback(normalized)
}

function normalizeFileIndex(index) {
    const src = index && typeof index === 'object' && !Array.isArray(index) ? index : {}
    const visiblePaths = (value) => normalizeStringList(value).filter((item) => !isSensitiveSkillEnvironmentFilePath(item))
    return {
        skill: String(src.skill || 'SKILL.md'),
        references: visiblePaths(src.references),
        scripts: visiblePaths(src.scripts),
        assets: visiblePaths(src.assets),
        agents: visiblePaths(src.agents),
        extra: visiblePaths(src.extra)
    }
}

const SKILL_SCRIPT_MANIFEST_PATH = 'scripts/manifest.json'
const RUNNABLE_SKILL_SCRIPT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.py', '.ps1', '.sh', '.bash'])
const SKILL_SCRIPT_HELPER_SEGMENTS = new Set(['lib', 'libs', 'utils', 'common', 'shared', 'helpers', 'helper', 'vendor', 'internal', 'tests', 'fixtures'])
const SKILL_SCRIPT_HELPER_BASENAMES = new Set(['__init__', 'util', 'utils', 'common', 'shared', 'helper', 'helpers', 'base', 'types', 'constants'])
const MANAGED_SKILLS_RELATIVE_PATH = path.join('.ai-tools-settings', 'skills')
const MAX_MANAGED_SKILL_FILES = 50000
const MAX_SKILL_PYTHON_DEPENDENCY_FILE_BYTES = 1024 * 1024
const SKILL_PYTHON_DEPENDENCY_CANDIDATES = Object.freeze([
    { path: 'requirements.txt', type: 'requirements' },
    { path: 'scripts/requirements.txt', type: 'requirements' },
    { path: 'pyproject.toml', type: 'project' }
])

function normalizeSkillPathForMatch(filePath) {
    return String(filePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

function isPathInside(rootPath, candidatePath) {
    const root = path.resolve(String(rootPath || ''))
    const candidate = path.resolve(String(candidatePath || ''))
    const relative = path.relative(root, candidate)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
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

function toSkillDependencyErrorPreview(error, maxLength = 500) {
    const redacted = String(error || '')
        .replace(/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, '$1[redacted]@')
        .replace(/([?&](?:token|api[_-]?key|secret|password|passwd|authorization)=)[^&\s]+/gi, '$1[redacted]')
        .replace(/\b(authorization|api[_-]?key|secret|password|passwd)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    return toSkillScriptPreviewText(redacted, maxLength)
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
        this._skillPythonSetupQueues = new Map();
        this._skillPythonSetupTargets = new Map();

        this._defaultConfig = {
            theme: 'light',
            chatConfig: {
                defaultProviderId: BUILTIN_PROVIDER_ID,
                defaultModel: '',
                defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
                toolApprovalMode: 'safe',
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
                [BUILTIN_AGENT_ORCHESTRATION_SKILL_ID]: buildBuiltinAgentOrchestrationSkill(),
                [BUILTIN_SHELL_SKILL_ID]: buildBuiltinShellSkill()
            },
            mcpServers: {},
            timedTask: {},
            dataStorageRoot: getDefaultUserDataRoot(),
            cloudConfig: this._clone(DEFAULT_CLOUD_CONFIG)
        };
    }

    _applyBuiltinsInPlace(config) {
        if (!this._isPlainObject(config)) return false
        let changed = false

        const builtinSkills = buildBuiltinSkillRecords()
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

        for (const legacyId of LEGACY_BUILTIN_MCP_SERVER_IDS) {
            if (Object.prototype.hasOwnProperty.call(config.mcpServers, legacyId)) {
                delete config.mcpServers[legacyId]
                changed = true
            }
        }

        for (const [skillId, skill] of Object.entries(config.skills)) {
            if (!skill || typeof skill !== 'object') continue
            const nextMcp = normalizeStringList(skill.mcp).filter((id) => !LEGACY_BUILTIN_MCP_SERVER_IDS.includes(id))
            if (!safeJsonEquals(nextMcp, normalizeStringList(skill.mcp))) {
                config.skills[skillId] = { ...skill, mcp: nextMcp }
                changed = true
            }
        }
        for (const [agentId, agent] of Object.entries(config.agents)) {
            if (!agent || typeof agent !== 'object') continue
            const nextMcp = normalizeStringList(agent.mcp).filter((id) => !LEGACY_BUILTIN_MCP_SERVER_IDS.includes(id))
            if (!safeJsonEquals(nextMcp, normalizeStringList(agent.mcp))) {
                config.agents[agentId] = { ...agent, mcp: nextMcp }
                changed = true
            }
        }

        for (const [skillId, builtinSkill] of Object.entries(builtinSkills)) {
            if (!safeJsonEquals(config.skills[skillId], builtinSkill)) {
                config.skills[skillId] = this._clone(builtinSkill)
                changed = true
            }
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
        const normalized = raw ? raw.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '') : fallback
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
                const normalized = relPath.replace(/\\/g, '/')
                if (isSensitiveSkillEnvironmentFilePath(normalized)) return
                if (entry.isDirectory()) {
                    walk(nextAbs, relPath)
                    return
                }
                if (!entry.isFile()) return

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

    _scanSkillDirectoryFileDetails(skillRoot, fileIndex) {
        const index = normalizeFileIndex(fileIndex)
        const paths = [
            index.skill,
            ...index.references,
            ...index.scripts,
            ...index.assets,
            ...index.agents,
            ...index.extra
        ]
        return paths.map((relativePath) => {
            const resolved = this._resolveSkillFileAbs(skillRoot, relativePath)
            if (!fs.existsSync(resolved.abs)) return null
            const stat = fs.statSync(resolved.abs)
            if (!stat.isFile()) return null
            const category =
                resolved.inner === index.skill
                    ? 'skill'
                    : ['references', 'scripts', 'assets', 'agents'].find((name) => resolved.inner.startsWith(`${name}/`)) || 'extra'
            return {
                path: resolved.inner,
                category,
                size: Number(stat.size) || 0,
                mtimeMs: Number(stat.mtimeMs) || 0
            }
        }).filter(Boolean)
    }

    _readSkillAgentConfig(skillRoot, fileIndex) {
        const index = normalizeFileIndex(fileIndex)
        const metadataPath = index.agents.find((item) => item.toLowerCase() === 'agents/openai.yaml') || ''
        if (!metadataPath) {
            return {
                path: '',
                interface: normalizeSkillInterfaceMetadata(),
                policy: { allowImplicitInvocation: true },
                warnings: ['agents/openai.yaml 未提供，将使用默认展示信息。']
            }
        }

        const resolved = this._resolveSkillFileAbs(skillRoot, metadataPath)
        const parsed = parseSkillAgentYaml(fs.readFileSync(resolved.abs, 'utf-8'))
        const interfaceMetadata = normalizeSkillInterfaceMetadata(parsed.interface)
        const warnings = []
        const validateIconPath = (rawPath, fieldName) => {
            if (!rawPath) return ''
            const inner = this._normalizeSkillInnerPath(rawPath, '')
            if (!inner.startsWith('assets/')) {
                warnings.push(`${fieldName} 必须指向 assets/ 内的文件。`)
                return ''
            }
            const iconFile = this._resolveSkillFileAbs(skillRoot, inner)
            if (!fs.existsSync(iconFile.abs) || !fs.statSync(iconFile.abs).isFile()) {
                warnings.push(`${fieldName} 文件不存在：${inner}`)
                return ''
            }
            if (!['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(path.extname(iconFile.abs).toLowerCase())) {
                warnings.push(`${fieldName} 不是受支持的图片格式：${inner}`)
                return ''
            }
            return inner
        }

        interfaceMetadata.iconSmall = validateIconPath(interfaceMetadata.iconSmall, 'icon_small')
        interfaceMetadata.iconLarge = validateIconPath(interfaceMetadata.iconLarge, 'icon_large')
        if (interfaceMetadata.brandColor && !/^#[0-9a-f]{6}$/i.test(interfaceMetadata.brandColor)) {
            warnings.push('brand_color 应为 6 位十六进制颜色。')
            interfaceMetadata.brandColor = ''
        }

        return {
            path: metadataPath,
            interface: interfaceMetadata,
            policy: {
                allowImplicitInvocation: parsed?.policy?.allow_implicit_invocation !== false
            },
            warnings
        }
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
            const candidates = [
                skill.sourcePath,
                skill?.install?.originalSourcePath
            ]
                .map((value) => typeof value === 'string' ? value.trim() : '')
                .filter(Boolean)
            return candidates.some((candidate) => path.resolve(candidate) === target)
        }) || null
    }

    _getManagedSkillsRoot(config) {
        const dataRoot = this._ensureWritableDataStorageRoot(config)
        const managedRoot = path.resolve(dataRoot, MANAGED_SKILLS_RELATIVE_PATH)
        if (!isPathInside(dataRoot, managedRoot)) {
            throw new Error('managed skills root escaped dataStorageRoot')
        }
        fs.mkdirSync(managedRoot, { recursive: true })
        return managedRoot
    }

    _getManagedSkillIdRoot(config, skillId) {
        const safeSkillId = String(skillId || '').trim()
        if (!/^[A-Za-z0-9_-]+$/.test(safeSkillId)) return ''

        const managedRoot = this._getManagedSkillsRoot(config)
        const skillIdRoot = path.resolve(managedRoot, safeSkillId)
        if (!isPathInside(managedRoot, skillIdRoot) || skillIdRoot === managedRoot) {
            throw new Error('managed skill id path escaped the managed skills directory')
        }
        return skillIdRoot
    }

    _getManagedSkillVersionRootForSource(config, skillId, sourcePath) {
        const skillIdRoot = this._getManagedSkillIdRoot(config, skillId)
        const source = typeof sourcePath === 'string' && sourcePath.trim()
            ? path.resolve(sourcePath.trim())
            : ''
        if (!skillIdRoot || !source || !isPathInside(skillIdRoot, source) || source === skillIdRoot) return ''

        const relative = path.relative(skillIdRoot, source)
        const segments = relative.split(path.sep).filter(Boolean)
        if (segments.length < 2) return ''

        const versionRoot = path.resolve(skillIdRoot, segments[0])
        return isPathInside(skillIdRoot, versionRoot) && versionRoot !== skillIdRoot ? versionRoot : ''
    }

    _pruneManagedSkillVersions(config, skillId, keepSourcePaths = []) {
        const skillIdRoot = this._getManagedSkillIdRoot(config, skillId)
        if (!skillIdRoot || !fs.existsSync(skillIdRoot)) return []

        const keepVersionRoots = new Set(
            normalizeStringList(keepSourcePaths)
                .map((sourcePath) => this._getManagedSkillVersionRootForSource(config, skillId, sourcePath))
                .filter(Boolean)
                .map((versionRoot) => path.resolve(versionRoot))
        )
        const removed = []

        fs.readdirSync(skillIdRoot, { withFileTypes: true }).forEach((entry) => {
            const candidate = path.resolve(skillIdRoot, entry.name)
            if (!isPathInside(skillIdRoot, candidate) || candidate === skillIdRoot) return
            if (keepVersionRoots.has(candidate)) return
            fs.rmSync(candidate, { recursive: true, force: true })
            removed.push(candidate)
        })

        if (!fs.readdirSync(skillIdRoot).length) {
            fs.rmdirSync(skillIdRoot)
        }
        return removed
    }

    _cleanupManagedSkillStorage(config, skillId) {
        const skillIdRoot = this._getManagedSkillIdRoot(config, skillId)
        if (skillIdRoot && fs.existsSync(skillIdRoot)) {
            fs.rmSync(skillIdRoot, { recursive: true, force: true })
        }

        const safeSkillId = String(skillId || '').trim()
        if (!/^[A-Za-z0-9_-]+$/.test(safeSkillId)) return
        const dataRoot = this._ensureWritableDataStorageRoot(config)
        const runtimeSkillsRoots = new Set([
            this._getSkillRuntimeBaseRoot(dataRoot),
            path.resolve(dataRoot, '.ai-tools-settings', 'runtime', 'skills')
        ])
        runtimeSkillsRoots.forEach((runtimeSkillsRoot) => {
            const runtimeSkillRoot = path.resolve(runtimeSkillsRoot, safeSkillId)
            if (isPathInside(runtimeSkillsRoot, runtimeSkillRoot) && runtimeSkillRoot !== runtimeSkillsRoot && fs.existsSync(runtimeSkillRoot)) {
                fs.rmSync(runtimeSkillRoot, { recursive: true, force: true })
            }
        })
    }

    _pruneManagedSkillVersionsAfterCommit(config, skillId, keepSourcePaths = []) {
        try {
            return this._pruneManagedSkillVersions(config, skillId, keepSourcePaths)
        } catch (error) {
            console.warn(`清理 Skill ${skillId} 的旧托管版本失败。`, error)
            return []
        }
    }

    _assertManagedSkillSourceTree(sourceRoot) {
        const root = this._ensureAbsoluteDirectory(sourceRoot, 'sourcePath')
        const stack = [root]
        let fileCount = 0

        while (stack.length) {
            const current = stack.pop()
            const entries = fs.readdirSync(current, { withFileTypes: true })
            for (const entry of entries) {
                if (entry.name === '.git' || entry.name === 'node_modules') continue
                const abs = path.join(current, entry.name)
                const stat = fs.lstatSync(abs)
                if (stat.isSymbolicLink()) {
                    throw new Error(`skill import does not allow symbolic links: ${path.relative(root, abs)}`)
                }
                fileCount += 1
                if (fileCount > MAX_MANAGED_SKILL_FILES) {
                    throw new Error(`skill directory contains more than ${MAX_MANAGED_SKILL_FILES} entries`)
                }
                if (stat.isDirectory()) stack.push(abs)
            }
        }
    }

    _copySkillDirectoryToManagedRoot(config, sourceRoot, skillId, skillName) {
        const source = this._ensureAbsoluteDirectory(sourceRoot, 'sourcePath')
        const managedRoot = this._getManagedSkillsRoot(config)
        if (isPathInside(managedRoot, source)) return source

        this._assertManagedSkillSourceTree(source)

        const safeSkillId = String(skillId || '').trim()
        if (!/^[A-Za-z0-9_-]+$/.test(safeSkillId)) {
            throw new Error('skill id contains characters that cannot be used in a managed path')
        }
        const safeSkillName = String(skillName || '').trim()
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeSkillName)) {
            throw new Error('skill name contains characters that cannot be used in a managed path')
        }

        const version = `${Date.now().toString(36)}-${hashString(`${source}:${process.pid}:${process.hrtime.bigint()}`)}`
        const skillVersionsRoot = path.resolve(managedRoot, safeSkillId)
        const versionRoot = path.resolve(skillVersionsRoot, version)
        const target = path.resolve(versionRoot, safeSkillName)
        if (!isPathInside(managedRoot, target)) {
            throw new Error('managed skill target escaped dataStorageRoot')
        }

        fs.mkdirSync(versionRoot, { recursive: true })
        try {
            fs.cpSync(source, target, {
                recursive: true,
                errorOnExist: true,
                filter: (sourcePath) => {
                    if (path.resolve(sourcePath) === source) return true
                    const name = path.basename(sourcePath)
                    return name !== '.git' && name !== 'node_modules'
                }
            })
            return target
        } catch (error) {
            if (isPathInside(skillVersionsRoot, versionRoot)) {
                fs.rmSync(versionRoot, { recursive: true, force: true })
            }
            throw error
        }
    }

    _isManagedSkillPath(config, sourcePath) {
        const source = typeof sourcePath === 'string' ? sourcePath.trim() : ''
        if (!source) return false
        return isPathInside(this._getManagedSkillsRoot(config), source)
    }

    _ensureManagedSkillForUse(skill) {
        if (!skill || skill.builtin || String(skill.sourceType || '').trim() !== 'directory') return skill
        const config = this._getRaw()
        if (this._isManagedSkillPath(config, skill.sourcePath)) return skill
        return this.refreshSkillFromSource(skill._id)
    }

    _getSkillDotEnvRoot(skill, skillRoot) {
        const managedRoot = path.resolve(skillRoot)
        const originalSourcePath = typeof skill?.install?.originalSourcePath === 'string'
            ? skill.install.originalSourcePath.trim()
            : ''
        if (!originalSourcePath || !path.isAbsolute(originalSourcePath)) return managedRoot

        const originalRoot = path.resolve(originalSourcePath)
        if (originalRoot === managedRoot || !fs.existsSync(originalRoot)) return managedRoot

        let originalStat = null
        try {
            originalStat = fs.statSync(originalRoot)
        } catch {
            return managedRoot
        }
        if (!originalStat.isDirectory()) return managedRoot

        const originalEnvPath = path.resolve(originalRoot, SKILL_DOTENV_FILENAME)
        return isPathInside(originalRoot, originalEnvPath) ? originalRoot : managedRoot
    }

    _preserveSkillDotEnv(existingSkill, nextSkill) {
        const previousRoot = typeof existingSkill?.sourcePath === 'string' ? existingSkill.sourcePath.trim() : ''
        const nextRoot = typeof nextSkill?.sourcePath === 'string' ? nextSkill.sourcePath.trim() : ''
        if (!previousRoot || !nextRoot || previousRoot === nextRoot) return false
        if (!path.isAbsolute(previousRoot) || !path.isAbsolute(nextRoot)) return false

        const previousEnvRoot = this._getSkillDotEnvRoot(existingSkill, previousRoot)
        const previousEnvPath = path.resolve(previousEnvRoot, SKILL_DOTENV_FILENAME)
        const nextEnvPath = path.resolve(nextRoot, SKILL_DOTENV_FILENAME)
        if (!isPathInside(previousEnvRoot, previousEnvPath) || !isPathInside(nextRoot, nextEnvPath)) return false
        if (!fs.existsSync(previousEnvPath) || fs.existsSync(nextEnvPath)) return false

        this._loadSkillDotEnv(previousEnvRoot)
        fs.copyFileSync(previousEnvPath, nextEnvPath, fs.constants.COPYFILE_EXCL)
        return true
    }

    _loadSkillDotEnv(skillRoot) {
        const envPath = path.resolve(skillRoot, SKILL_DOTENV_FILENAME)
        if (!isPathInside(skillRoot, envPath)) {
            throw new Error('skill .env path escaped the skill directory')
        }
        if (!fs.existsSync(envPath)) return {}

        const stat = fs.lstatSync(envPath)
        if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new Error('skill .env must be a regular file')
        }
        if (stat.size > MAX_SKILL_DOTENV_BYTES) {
            throw new Error(`skill .env cannot exceed ${MAX_SKILL_DOTENV_BYTES} bytes`)
        }

        let parsed
        try {
            parsed = parseSkillDotEnv(fs.readFileSync(envPath, 'utf-8'))
        } catch (error) {
            throw new Error(`invalid skill .env: ${error?.message || String(error)}`)
        }

        const safeEnv = {}
        Object.entries(parsed || {}).forEach(([rawKey, rawValue]) => {
            const key = String(rawKey || '').trim()
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
                throw new Error(`invalid skill .env variable name: ${key || '(empty)'}`)
            }
            if (isReservedSkillEnvironmentKey(key)) {
                throw new Error(`skill .env cannot override reserved environment variable: ${key}`)
            }
            safeEnv[key] = String(rawValue ?? '')
        })
        return safeEnv
    }

    _getSkillRuntimeRoot(dataRoot, skill) {
        const safeSkillId = String(skill?._id || 'skill').replace(/[^A-Za-z0-9_-]/g, '_')
        const runtimeBaseRoot = this._getSkillRuntimeBaseRoot(dataRoot)
        const runtimeRoot = path.resolve(runtimeBaseRoot, safeSkillId)
        if (!isPathInside(runtimeBaseRoot, runtimeRoot)) throw new Error('skill runtime path escaped managed runtime directory')
        return runtimeRoot
    }

    _getSkillRuntimeBaseRoot(dataRoot) {
        const shortRootCandidates = [
            String(process.env.LOCALAPPDATA || '').trim(),
            String(process.env.TEMP || process.env.TMP || os.tmpdir() || '').trim()
        ]
        for (const candidateRoot of shortRootCandidates) {
            if (!candidateRoot || !path.isAbsolute(candidateRoot)) continue
            const base = path.resolve(candidateRoot)
            const shortRuntimeRoot = path.resolve(base, 'AiTools', 'skill-runtime')
            if (!isPathInside(base, shortRuntimeRoot) || shortRuntimeRoot === base) continue
            try {
                fs.mkdirSync(shortRuntimeRoot, { recursive: true })
                return shortRuntimeRoot
            } catch {
                // Sandboxed or locked environments fall back to the configured data root.
            }
        }

        const fallbackRoot = path.resolve(dataRoot, '.ai-tools-settings', 'runtime', 'skills')
        if (!isPathInside(dataRoot, fallbackRoot)) throw new Error('skill runtime path escaped dataStorageRoot')
        return fallbackRoot
    }

    _buildSkillRuntimeEnvironment(dataRoot, skill, skillRoot, scriptPath) {
        const runtimeRoot = this._getSkillRuntimeRoot(dataRoot, skill)
        const runtimeBaseRoot = this._getSkillRuntimeBaseRoot(dataRoot)
        const tempRoot = path.join(runtimeRoot, 'tmp')
        const configRoot = path.join(runtimeRoot, 'config')
        const cacheRoot = path.join(runtimeRoot, 'cache')
        const dataHome = path.join(runtimeRoot, 'data')
        ;[runtimeRoot, tempRoot, configRoot, cacheRoot, dataHome].forEach((dir) => {
            if (!isPathInside(runtimeBaseRoot, dir)) throw new Error('skill runtime path escaped managed runtime directory')
            fs.mkdirSync(dir, { recursive: true })
        })

        const skillEnv = this._loadSkillDotEnv(this._getSkillDotEnvRoot(skill, skillRoot))
        const env = {}
        ;[
            'PATH',
            'Path',
            'PATHEXT',
            'SystemRoot',
            'SYSTEMROOT',
            'WINDIR',
            'ComSpec',
            'COMSPEC',
            'LANG',
            'LC_ALL',
            'TERM',
            'NUMBER_OF_PROCESSORS',
            'PROCESSOR_ARCHITECTURE'
        ].forEach((key) => {
            if (process.env[key] !== undefined) env[key] = process.env[key]
        })

        return {
            ...skillEnv,
            ...env,
            HOME: runtimeRoot,
            USERPROFILE: runtimeRoot,
            APPDATA: configRoot,
            LOCALAPPDATA: dataHome,
            TMP: tempRoot,
            TEMP: tempRoot,
            TMPDIR: tempRoot,
            XDG_CONFIG_HOME: configRoot,
            XDG_CACHE_HOME: cacheRoot,
            XDG_DATA_HOME: dataHome,
            AI_TOOLS_DATA_ROOT: dataRoot,
            AI_TOOLS_SKILL_ID: String(skill?._id || ''),
            AI_TOOLS_SKILL_NAME: String(skill?.name || ''),
            AI_TOOLS_SKILL_ROOT: skillRoot,
            AI_TOOLS_SKILL_ENTRY_FILE: String(skill?.entryFile || 'SKILL.md'),
            AI_TOOLS_SKILL_SCRIPT_PATH: scriptPath,
            SKILL_ID: String(skill?._id || ''),
            SKILL_NAME: String(skill?.name || ''),
            SKILL_ROOT: skillRoot,
            SKILL_ENTRY_FILE: String(skill?.entryFile || 'SKILL.md'),
            SKILL_SCRIPT_PATH: scriptPath
        }
    }

    _runSkillProcess(command, args, options = {}) {
        return new Promise((resolve, reject) => {
            const timeoutMs = Math.max(1000, Math.floor(Number(options.timeoutMs) || 120000))
            const maxBuffer = options.maxBuffer || 8 * 1024 * 1024
            const stdoutChunks = []
            const stderrChunks = []
            const stdoutBytes = { value: 0 }
            const stderrBytes = { value: 0 }
            let settled = false
            let timedOut = false
            let settleTimer = null

            const child = spawn(
                command,
                Array.isArray(args) ? args : [],
                {
                    cwd: options.cwd,
                    env: options.env,
                    windowsHide: true,
                    detached: process.platform !== 'win32',
                    stdio: ['pipe', 'pipe', 'pipe']
                }
            )

            const appendChunk = (chunks, counter, chunk) => {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''))
                if (!bytes.length || counter.value >= maxBuffer) return
                const remaining = maxBuffer - counter.value
                chunks.push(bytes.length > remaining ? bytes.subarray(0, remaining) : bytes)
                counter.value += Math.min(bytes.length, remaining)
            }

            const collectOutput = () => ({
                stdout: Buffer.concat(stdoutChunks, stdoutBytes.value).toString('utf8'),
                stderr: Buffer.concat(stderrChunks, stderrBytes.value).toString('utf8')
            })

            child.stdout?.on('data', (chunk) => appendChunk(stdoutChunks, stdoutBytes, chunk))
            child.stderr?.on('data', (chunk) => appendChunk(stderrChunks, stderrBytes, chunk))

            const failTimeout = () => {
                if (settled) return
                settled = true
                clearTimeout(settleTimer)
                const output = collectOutput()
                const err = new Error(output.stderr || output.stdout || `skill process timed out after ${timeoutMs}ms`)
                err.code = 'ETIMEDOUT'
                err.killed = true
                err.stdout = output.stdout
                err.stderr = output.stderr
                reject(err)
            }

            const timer = setTimeout(() => {
                timedOut = true
                killProcessTreeSafely(child)
                // Grandchildren may keep the pipes open so 'close' may never fire;
                // force-settle shortly after the kill attempt.
                settleTimer = setTimeout(() => {
                    try { child.stdout?.destroy() } catch { /* ignore */ }
                    try { child.stderr?.destroy() } catch { /* ignore */ }
                    failTimeout()
                }, 3000)
            }, timeoutMs)

            child.once('error', (error) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                clearTimeout(settleTimer)
                const err = new Error(error.message || String(error))
                err.code = error.code
                err.stdout = Buffer.concat(stdoutChunks, stdoutBytes.value).toString('utf8')
                err.stderr = Buffer.concat(stderrChunks, stderrBytes.value).toString('utf8')
                reject(err)
            })

            child.once('close', (code, signal) => {
                clearTimeout(timer)
                clearTimeout(settleTimer)
                if (settled) return
                if (timedOut) {
                    failTimeout()
                    return
                }
                settled = true
                if (code !== 0) {
                    const output = collectOutput()
                    const err = new Error(output.stderr || output.stdout || `skill process exited with code ${code}`)
                    err.code = code
                    err.stdout = output.stdout
                    err.stderr = output.stderr
                    reject(err)
                    return
                }
                resolve(collectOutput())
            })

            if (child.stdin) {
                const input = options.input === undefined || options.input === null ? '' : String(options.input)
                if (input) child.stdin.write(input)
                child.stdin.end()
            }
        })
    }

    _runSkillProcessSync(command, args, options = {}) {
        try {
            const stdout = execFileSync(
                command,
                Array.isArray(args) ? args : [],
                {
                    cwd: options.cwd,
                    env: options.env,
                    windowsHide: true,
                    timeout: options.timeoutMs,
                    maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
                    encoding: 'utf8'
                }
            )
            return { stdout: String(stdout || ''), stderr: '' }
        } catch (error) {
            const stdout = String(error?.stdout || '')
            const stderr = String(error?.stderr || '')
            const err = new Error(stderr || stdout || error?.message || String(error))
            err.code = error?.code
            err.stdout = stdout
            err.stderr = stderr
            throw err
        }
    }

    _buildSkillDependencyInstallerEnvironment(runtimeEnv) {
        const allowedKeys = [
            'PATH',
            'Path',
            'PATHEXT',
            'SystemRoot',
            'SYSTEMROOT',
            'WINDIR',
            'ComSpec',
            'COMSPEC',
            'LANG',
            'LC_ALL',
            'TERM',
            'NUMBER_OF_PROCESSORS',
            'PROCESSOR_ARCHITECTURE',
            'HOME',
            'USERPROFILE',
            'APPDATA',
            'LOCALAPPDATA',
            'TMP',
            'TEMP',
            'TMPDIR',
            'XDG_CONFIG_HOME',
            'XDG_CACHE_HOME',
            'XDG_DATA_HOME'
        ]
        const env = {}
        allowedKeys.forEach((key) => {
            if (runtimeEnv?.[key] !== undefined) env[key] = runtimeEnv[key]
        })
        return env
    }

    _buildSkillVirtualEnvironment(runtimeEnv, environmentRoot) {
        const binRoot = process.platform === 'win32'
            ? path.join(environmentRoot, 'Scripts')
            : path.join(environmentRoot, 'bin')
        const inheritedPath = String(runtimeEnv?.PATH ?? runtimeEnv?.Path ?? '')
        const nextPath = inheritedPath ? `${binRoot}${path.delimiter}${inheritedPath}` : binRoot
        const env = {
            ...(runtimeEnv || {}),
            VIRTUAL_ENV: environmentRoot,
            PATH: nextPath
        }
        if (process.platform === 'win32' || runtimeEnv?.Path !== undefined) env.Path = nextPath
        return env
    }

    _getSkillVirtualEnvironmentPythonPath(environmentRoot) {
        return process.platform === 'win32'
            ? path.join(environmentRoot, 'Scripts', 'python.exe')
            : path.join(environmentRoot, 'bin', 'python')
    }

    _findSkillPythonDependencySpec(skillRoot) {
        for (const candidate of SKILL_PYTHON_DEPENDENCY_CANDIDATES) {
            const resolved = this._resolveSkillFileAbs(skillRoot, candidate.path)
            if (!fs.existsSync(resolved.abs)) continue

            const stat = fs.lstatSync(resolved.abs)
            if (stat.isSymbolicLink() || !stat.isFile()) {
                throw new Error(`Python dependency declaration must be a regular file: ${resolved.inner}`)
            }
            if (stat.size > MAX_SKILL_PYTHON_DEPENDENCY_FILE_BYTES) {
                throw new Error(`Python dependency declaration cannot exceed ${MAX_SKILL_PYTHON_DEPENDENCY_FILE_BYTES} bytes: ${resolved.inner}`)
            }

            const content = fs.readFileSync(resolved.abs)
            const fingerprint = crypto
                .createHash('sha256')
                .update(`ai-tools-skill-python-v2\0${candidate.type}\0${resolved.inner}\0`)
                .update(content)

            if (candidate.type === 'project') {
                fingerprint.update(`\0${path.resolve(skillRoot)}`)
                ;['uv.lock', 'poetry.lock', 'pdm.lock'].forEach((lockPath) => {
                    const lockResolved = this._resolveSkillFileAbs(skillRoot, lockPath)
                    if (!fs.existsSync(lockResolved.abs)) return
                    const lockStat = fs.lstatSync(lockResolved.abs)
                    if (lockStat.isSymbolicLink() || !lockStat.isFile()) return
                    if (lockStat.size > MAX_SKILL_PYTHON_DEPENDENCY_FILE_BYTES) return
                    fingerprint.update(`\0${lockResolved.inner}\0`).update(fs.readFileSync(lockResolved.abs))
                })
            }

            return {
                type: candidate.type,
                path: resolved.inner,
                absPath: resolved.abs,
                fingerprint: fingerprint.digest('hex')
            }
        }
        return null
    }

    _readSkillPythonEnvironmentMarker(environmentRoot) {
        const markerPath = path.join(environmentRoot, '.ai-tools-ready.json')
        if (!fs.existsSync(markerPath)) return null
        try {
            const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
            return parsed && typeof parsed === 'object' ? parsed : null
        } catch {
            return null
        }
    }

    _pruneSkillPythonEnvironments(pythonRoot, keepEnvironmentRoot) {
        if (!fs.existsSync(pythonRoot)) return
        const keep = path.resolve(keepEnvironmentRoot)
        fs.readdirSync(pythonRoot, { withFileTypes: true }).forEach((entry) => {
            const candidate = path.resolve(pythonRoot, entry.name)
            if (!isPathInside(pythonRoot, candidate) || candidate === pythonRoot || candidate === keep) return
            try {
                fs.rmSync(candidate, { recursive: true, force: true })
            } catch (error) {
                console.warn('清理旧 Skill Python 虚拟环境失败。', error)
            }
        })
    }

    async _ensureSkillPythonEnvironment({ dataRoot, skill, skillRoot, runtimeEnv, dependencySpec, timeoutMs }) {
        const runtimeRoot = this._getSkillRuntimeRoot(dataRoot, skill)
        const pythonRoot = path.resolve(runtimeRoot, 'python')
        const environmentName = dependencySpec.fingerprint.slice(0, 24)
        const environmentRoot = path.resolve(pythonRoot, environmentName)
        if (!isPathInside(runtimeRoot, pythonRoot) || !isPathInside(pythonRoot, environmentRoot)) {
            throw new Error('skill Python environment path escaped the skill runtime directory')
        }
        fs.mkdirSync(pythonRoot, { recursive: true })

        const environmentPython = this._getSkillVirtualEnvironmentPythonPath(environmentRoot)
        const existingMarker = this._readSkillPythonEnvironmentMarker(environmentRoot)
        if (existingMarker?.fingerprint === dependencySpec.fingerprint && fs.existsSync(environmentPython)) {
            this._pruneSkillPythonEnvironments(pythonRoot, environmentRoot)
            return {
                command: environmentPython,
                env: this._buildSkillVirtualEnvironment(runtimeEnv, environmentRoot),
                metadata: {
                    managed: true,
                    reused: true,
                    dependencyFile: dependencySpec.path,
                    dependencyType: dependencySpec.type,
                    environmentRoot
                }
            }
        }

        const installTimeoutMs = Math.max(5 * 60 * 1000, Math.min(10 * 60 * 1000, Number(timeoutMs) || 0))
        const installerEnv = this._buildSkillDependencyInstallerEnvironment(runtimeEnv)
        const pythonCandidates = [
            { command: 'python', prefixArgs: [], label: 'python' },
            { command: 'py', prefixArgs: ['-3'], label: 'py -3' }
        ]
        const errors = []

        for (const candidate of pythonCandidates) {
            fs.rmSync(environmentRoot, { recursive: true, force: true })
            let setupStage = 'venv'

            try {
                await this._runSkillProcess(
                    candidate.command,
                    [...candidate.prefixArgs, '-m', 'venv', '--system-site-packages', environmentRoot],
                    {
                        cwd: skillRoot,
                        env: installerEnv,
                        timeoutMs: installTimeoutMs
                    }
                )

                const environmentPythonPath = this._getSkillVirtualEnvironmentPythonPath(environmentRoot)
                if (!fs.existsSync(environmentPythonPath)) {
                    throw new Error(`virtual environment did not create a Python executable: ${environmentPythonPath}`)
                }

                const pipArgs = [
                    '-m',
                    'pip',
                    'install',
                    '--disable-pip-version-check',
                    '--no-input',
                    '--require-virtualenv'
                ]
                if (dependencySpec.type === 'requirements') {
                    pipArgs.push('-r', dependencySpec.absPath)
                } else {
                    pipArgs.push(skillRoot)
                }

                setupStage = 'pip'
                await this._runSkillProcess(environmentPythonPath, pipArgs, {
                    cwd: dependencySpec.type === 'requirements' ? path.dirname(dependencySpec.absPath) : skillRoot,
                    env: this._buildSkillVirtualEnvironment(installerEnv, environmentRoot),
                    timeoutMs: installTimeoutMs
                })

                fs.writeFileSync(
                    path.join(environmentRoot, '.ai-tools-ready.json'),
                    JSON.stringify({
                        version: 2,
                        fingerprint: dependencySpec.fingerprint,
                        dependencyFile: dependencySpec.path,
                        dependencyType: dependencySpec.type,
                        systemSitePackages: true,
                        createdAt: new Date().toISOString()
                    }, null, 2),
                    'utf8'
                )

                this._pruneSkillPythonEnvironments(pythonRoot, environmentRoot)

                return {
                    command: this._getSkillVirtualEnvironmentPythonPath(environmentRoot),
                    env: this._buildSkillVirtualEnvironment(runtimeEnv, environmentRoot),
                    metadata: {
                        managed: true,
                        reused: false,
                        dependencyFile: dependencySpec.path,
                        dependencyType: dependencySpec.type,
                        environmentRoot
                    }
                }
            } catch (error) {
                fs.rmSync(environmentRoot, { recursive: true, force: true })
                const detail = toSkillScriptPreviewText(error?.message || String(error), 500)
                errors.push(`${candidate.label}: ${detail || 'unknown error'}`)
                const missingInstallerRuntime = error?.code === 'ENOENT'
                    || /No module named (?:venv|ensurepip|pip)|ensurepip is not available/i.test(String(error?.message || error))
                if (setupStage === 'pip' && !missingInstallerRuntime) {
                    throw new Error(
                        `failed to install Python dependencies from ${dependencySpec.path} with ${candidate.label}: ${detail || 'unknown error'}`
                    )
                }
            }
        }

        throw new Error(
            `failed to prepare Python dependencies from ${dependencySpec.path}: ${errors.join(' | ') || 'no Python 3 runtime found'}`
        )
    }

    _ensureSkillPythonEnvironmentSync({ dataRoot, skill, skillRoot, runtimeEnv, dependencySpec, timeoutMs }) {
        const runtimeRoot = this._getSkillRuntimeRoot(dataRoot, skill)
        const pythonRoot = path.resolve(runtimeRoot, 'python')
        const environmentName = dependencySpec.fingerprint.slice(0, 24)
        const environmentRoot = path.resolve(pythonRoot, environmentName)
        if (!isPathInside(runtimeRoot, pythonRoot) || !isPathInside(pythonRoot, environmentRoot)) {
            throw new Error('skill Python environment path escaped the skill runtime directory')
        }
        fs.mkdirSync(pythonRoot, { recursive: true })

        const environmentPython = this._getSkillVirtualEnvironmentPythonPath(environmentRoot)
        const existingMarker = this._readSkillPythonEnvironmentMarker(environmentRoot)
        if (existingMarker?.fingerprint === dependencySpec.fingerprint && fs.existsSync(environmentPython)) {
            this._pruneSkillPythonEnvironments(pythonRoot, environmentRoot)
            return {
                command: environmentPython,
                env: this._buildSkillVirtualEnvironment(runtimeEnv, environmentRoot),
                metadata: {
                    managed: true,
                    reused: true,
                    dependencyFile: dependencySpec.path,
                    dependencyType: dependencySpec.type,
                    environmentRoot
                }
            }
        }

        const installTimeoutMs = Math.max(5 * 60 * 1000, Math.min(10 * 60 * 1000, Number(timeoutMs) || 0))
        const installerEnv = this._buildSkillDependencyInstallerEnvironment(runtimeEnv)
        const pythonCandidates = [
            { command: 'python', prefixArgs: [], label: 'python' },
            { command: 'py', prefixArgs: ['-3'], label: 'py -3' }
        ]
        const errors = []

        for (const candidate of pythonCandidates) {
            fs.rmSync(environmentRoot, { recursive: true, force: true })
            let setupStage = 'venv'

            try {
                this._runSkillProcessSync(
                    candidate.command,
                    [...candidate.prefixArgs, '-m', 'venv', '--system-site-packages', environmentRoot],
                    {
                        cwd: skillRoot,
                        env: installerEnv,
                        timeoutMs: installTimeoutMs
                    }
                )

                const environmentPythonPath = this._getSkillVirtualEnvironmentPythonPath(environmentRoot)
                if (!fs.existsSync(environmentPythonPath)) {
                    throw new Error(`virtual environment did not create a Python executable: ${environmentPythonPath}`)
                }

                const pipArgs = [
                    '-m',
                    'pip',
                    'install',
                    '--disable-pip-version-check',
                    '--no-input',
                    '--require-virtualenv'
                ]
                if (dependencySpec.type === 'requirements') {
                    pipArgs.push('-r', dependencySpec.absPath)
                } else {
                    pipArgs.push(skillRoot)
                }

                setupStage = 'pip'
                this._runSkillProcessSync(environmentPythonPath, pipArgs, {
                    cwd: dependencySpec.type === 'requirements' ? path.dirname(dependencySpec.absPath) : skillRoot,
                    env: this._buildSkillVirtualEnvironment(installerEnv, environmentRoot),
                    timeoutMs: installTimeoutMs
                })

                fs.writeFileSync(
                    path.join(environmentRoot, '.ai-tools-ready.json'),
                    JSON.stringify({
                        version: 2,
                        fingerprint: dependencySpec.fingerprint,
                        dependencyFile: dependencySpec.path,
                        dependencyType: dependencySpec.type,
                        systemSitePackages: true,
                        createdAt: new Date().toISOString()
                    }, null, 2),
                    'utf8'
                )

                this._pruneSkillPythonEnvironments(pythonRoot, environmentRoot)

                return {
                    command: this._getSkillVirtualEnvironmentPythonPath(environmentRoot),
                    env: this._buildSkillVirtualEnvironment(runtimeEnv, environmentRoot),
                    metadata: {
                        managed: true,
                        reused: false,
                        dependencyFile: dependencySpec.path,
                        dependencyType: dependencySpec.type,
                        environmentRoot
                    }
                }
            } catch (error) {
                fs.rmSync(environmentRoot, { recursive: true, force: true })
                const detail = toSkillScriptPreviewText(error?.message || String(error), 500)
                errors.push(`${candidate.label}: ${detail || 'unknown error'}`)
                const missingInstallerRuntime = error?.code === 'ENOENT'
                    || /No module named (?:venv|ensurepip|pip)|ensurepip is not available/i.test(String(error?.message || error))
                if (setupStage === 'pip' && !missingInstallerRuntime) {
                    throw new Error(
                        `failed to install Python dependencies from ${dependencySpec.path} with ${candidate.label}: ${detail || 'unknown error'}`
                    )
                }
            }
        }

        throw new Error(
            `failed to prepare Python dependencies from ${dependencySpec.path}: ${errors.join(' | ') || 'no Python 3 runtime found'}`
        )
    }

    _prepareSkillPythonDependenciesForImport(config, skill, skillRoot) {
        const dependencySpec = this._findSkillPythonDependencySpec(skillRoot)
        if (!dependencySpec) return null

        const dataRoot = this._ensureWritableDataStorageRoot(config)
        const runtimeEnv = this._buildSkillRuntimeEnvironment(dataRoot, skill, skillRoot, '')
        const prepared = this._ensureSkillPythonEnvironmentSync({
            dataRoot,
            skill,
            skillRoot,
            runtimeEnv,
            dependencySpec,
            timeoutMs: 10 * 60 * 1000
        })
        return prepared.metadata
    }

    _buildSkillPythonDependencyState(dependencySpec, patch = {}) {
        if (!dependencySpec) return null
        return {
            status: 'pending',
            dependencyFile: dependencySpec.path,
            dependencyType: dependencySpec.type,
            fingerprint: dependencySpec.fingerprint,
            ...patch
        }
    }

    _isCurrentSkillPythonDependencyJob(skill, target) {
        if (!skill || !target) return false
        const currentSource = String(skill.sourcePath || '').trim()
        const targetSource = String(target.sourcePath || '').trim()
        if (!currentSource || !targetSource) return false

        try {
            if (path.resolve(currentSource) !== path.resolve(targetSource)) return false
        } catch {
            return false
        }

        return String(skill?.install?.pythonDependencies?.fingerprint || '') === String(target.fingerprint || '')
    }

    _updateSkillPythonDependencyState(target, patch) {
        const config = this._getRaw()
        const current = config.skills?.[target.skillId]
        if (!this._isCurrentSkillPythonDependencyJob(current, target)) return false

        current.install = {
            ...(current.install && typeof current.install === 'object' ? current.install : {}),
            pythonDependencies: {
                ...(current.install?.pythonDependencies && typeof current.install.pythonDependencies === 'object'
                    ? current.install.pythonDependencies
                    : {}),
                ...patch
            }
        }
        config.skills[target.skillId] = current
        this._applyBuiltinsInPlace(config)
        this._save(config)
        return true
    }

    _buildSkillPythonDependencyJobTarget(skill, dependencySpec) {
        if (!skill || !dependencySpec) return null
        const skillId = String(skill._id || '').trim()
        const sourcePath = String(skill.sourcePath || '').trim()
        if (!skillId || !sourcePath || !dependencySpec.fingerprint) return null
        return {
            skillId,
            sourcePath,
            dependencyFile: dependencySpec.path,
            dependencyType: dependencySpec.type,
            fingerprint: dependencySpec.fingerprint
        }
    }

    _scheduleSkillPythonDependencies(skill, dependencySpec = null) {
        const resolvedSpec = dependencySpec || this._findSkillPythonDependencySpec(skill?.sourcePath)
        const target = this._buildSkillPythonDependencyJobTarget(skill, resolvedSpec)
        if (!target) return Promise.resolve(null)

        const queuedTarget = this._skillPythonSetupTargets.get(target.skillId)
        const queuedJob = this._skillPythonSetupQueues.get(target.skillId)
        if (
            queuedJob
            && queuedTarget?.sourcePath === target.sourcePath
            && queuedTarget?.fingerprint === target.fingerprint
        ) {
            return queuedJob
        }

        const previous = this._skillPythonSetupQueues.get(target.skillId) || Promise.resolve()
        const job = previous
            .catch(() => null)
            .then(() => this._prepareSkillPythonDependenciesInBackground(target))
        this._skillPythonSetupQueues.set(target.skillId, job)
        this._skillPythonSetupTargets.set(target.skillId, target)
        job.then(
            () => {
                if (this._skillPythonSetupQueues.get(target.skillId) === job) {
                    this._skillPythonSetupQueues.delete(target.skillId)
                    this._skillPythonSetupTargets.delete(target.skillId)
                }
            },
            () => {
                if (this._skillPythonSetupQueues.get(target.skillId) === job) {
                    this._skillPythonSetupQueues.delete(target.skillId)
                    this._skillPythonSetupTargets.delete(target.skillId)
                }
            }
        )
        return job
    }

    async _prepareSkillPythonDependenciesInBackground(target) {
        const config = this._getRaw()
        const skill = config.skills?.[target.skillId]
        if (!this._isCurrentSkillPythonDependencyJob(skill, target)) return null

        try {
            const skillRoot = this._ensureAbsoluteDirectory(skill.sourcePath, 'sourcePath')
            const dependencySpec = this._findSkillPythonDependencySpec(skillRoot)
            if (!dependencySpec || dependencySpec.fingerprint !== target.fingerprint) return null

            const dataRoot = this._ensureWritableDataStorageRoot(config)
            const runtimeEnv = this._buildSkillRuntimeEnvironment(dataRoot, skill, skillRoot, '')
            const prepared = await this._ensureSkillPythonEnvironment({
                dataRoot,
                skill,
                skillRoot,
                runtimeEnv,
                dependencySpec,
                timeoutMs: 10 * 60 * 1000
            })
            this._updateSkillPythonDependencyState(target, {
                status: 'ready',
                reused: !!prepared?.metadata?.reused,
                preparedAt: new Date().toISOString(),
                error: ''
            })
            return prepared?.metadata || null
        } catch (error) {
            const errorMessage = toSkillDependencyErrorPreview(error?.message || String(error), 500)
            this._updateSkillPythonDependencyState(target, {
                status: 'error',
                reused: false,
                error: errorMessage || 'failed to prepare Python dependencies',
                failedAt: new Date().toISOString()
            })
            console.warn('[Skill] Python dependency setup failed in background', {
                skillId: target.skillId,
                dependencyFile: target.dependencyFile,
                error: errorMessage || 'unknown error'
            })
            return null
        }
    }

    _schedulePendingSkillPythonDependencies(config) {
        Object.values(config?.skills || {}).forEach((skill) => {
            const state = skill?.install?.pythonDependencies
            if (state?.status !== 'pending') return
            try {
                const dependencySpec = this._findSkillPythonDependencySpec(skill.sourcePath)
                if (dependencySpec) this._scheduleSkillPythonDependencies(skill, dependencySpec)
            } catch (error) {
                console.warn('[Skill] Failed to resume pending Python dependency setup', {
                    skillId: String(skill?._id || ''),
                    error: toSkillDependencyErrorPreview(error?.message || String(error), 300) || 'unknown error'
                })
            }
        })
    }

    async _prepareSkillPythonRuntime({ dataRoot, skill, skillRoot, runtimeEnv, timeoutMs }) {
        const dependencySpec = this._findSkillPythonDependencySpec(skillRoot)
        if (!dependencySpec) {
            return {
                attempts: [
                    { command: 'python', prefixArgs: [] },
                    { command: 'py', prefixArgs: ['-3'] }
                ],
                env: runtimeEnv,
                metadata: {
                    managed: false,
                    reused: false,
                    dependencyFile: '',
                    dependencyType: ''
                }
            }
        }

        const runtimeRoot = this._getSkillRuntimeRoot(dataRoot, skill)
        const pythonRoot = path.resolve(runtimeRoot, 'python')
        const environmentRoot = path.resolve(pythonRoot, dependencySpec.fingerprint.slice(0, 24))
        const environmentPython = this._getSkillVirtualEnvironmentPythonPath(environmentRoot)
        const marker = this._readSkillPythonEnvironmentMarker(environmentRoot)
        if (marker?.fingerprint !== dependencySpec.fingerprint || !fs.existsSync(environmentPython)) {
            const pendingState = skill?.install?.pythonDependencies
            if (pendingState?.status === 'pending') {
                const pendingJob = this._skillPythonSetupQueues.get(String(skill?._id || '').trim())
                    || this._scheduleSkillPythonDependencies(skill, dependencySpec)
                await pendingJob
            }
        }

        const readyMarker = this._readSkillPythonEnvironmentMarker(environmentRoot)
        if (readyMarker?.fingerprint !== dependencySpec.fingerprint || !fs.existsSync(environmentPython)) {
            throw new Error(
                `Python dependencies from ${dependencySpec.path} are not prepared. Refresh the Skill to install them into its managed environment.`
            )
        }

        return {
            attempts: [{ command: environmentPython, prefixArgs: [] }],
            env: this._buildSkillVirtualEnvironment(runtimeEnv, environmentRoot),
            metadata: {
                managed: true,
                reused: true,
                dependencyFile: dependencySpec.path,
                dependencyType: dependencySpec.type,
                environmentRoot
            }
        }
    }

    _shouldHydrateDirectorySkillCache(skill) {
        if (!skill || skill.builtin) return false
        if (String(skill?.sourceType || '').trim() !== 'directory') return false
        if (!String(skill?.sourcePath || '').trim()) return false

        const cache = skill?.cache && typeof skill.cache === 'object' ? skill.cache : {}
        const fileIndex = cache?.fileIndex && typeof cache.fileIndex === 'object' ? cache.fileIndex : null
        const scriptCatalog = Array.isArray(cache?.scriptCatalog) ? cache.scriptCatalog : null

        if (!fileIndex) return true
        if (!Array.isArray(cache?.fileDetails)) return true
        const cachedPaths = ['references', 'scripts', 'assets', 'agents', 'extra']
            .flatMap((key) => normalizeStringList(fileIndex?.[key]))
        if (cachedPaths.some((item) => isSensitiveSkillEnvironmentFilePath(item))) return true
        if (cache.fileDetails.some((item) => isSensitiveSkillEnvironmentFilePath(item?.path))) return true
        if (!skill?.interface || typeof skill.interface !== 'object') return true
        const runnableScripts = normalizeStringList(fileIndex?.scripts).filter((item) => isRunnableSkillScriptPath(item))
        if (runnableScripts.length && (!scriptCatalog || !scriptCatalog.length)) return true
        if (!runnableScripts.length) return false
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
                const fileDetails = this._scanSkillDirectoryFileDetails(skillRoot, fileIndex)
                const agentConfig = this._readSkillAgentConfig(skillRoot, fileIndex)
                const { scriptCatalog, scriptManifestPath } = this._loadSkillScriptCatalog(skillRoot, fileIndex)
                const prevCache = skill?.cache && typeof skill.cache === 'object' ? skill.cache : {}

                skill.interface = agentConfig.interface
                skill.policy = agentConfig.policy
                skill.cache = {
                    ...prevCache,
                    fileIndex,
                    fileDetails,
                    scriptCatalog,
                    scriptManifestPath,
                    metadataPath: agentConfig.path,
                    validationWarnings: agentConfig.warnings,
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
        const standardMeta = validateStandardSkillFrontmatter(frontmatter, skillRoot)
        const skillName = standardMeta.name
        const summary = summarizeSkillMarkdown(body)
        const description = standardMeta.description
        const existing = options.existing && typeof options.existing === 'object' ? options.existing : null
        const suggestedId = String(options.id || existing?._id || '').trim()
        const baseId = `skill_${slugify(skillName)}`
        const nextId = suggestedId || `${baseId}_${hashString(skillRoot).slice(0, 6)}`
        const fileIndex = this._scanSkillDirectoryFiles(skillRoot)
        const fileDetails = this._scanSkillDirectoryFileDetails(skillRoot, fileIndex)
        const agentConfig = this._readSkillAgentConfig(skillRoot, fileIndex)
        const { scriptCatalog, scriptManifestPath } = this._loadSkillScriptCatalog(skillRoot, fileIndex)

        return {
            ...(existing && typeof existing === 'object' ? existing : {}),
            _id: nextId,
            name: agentConfig.interface.displayName || skillName,
            packageName: skillName,
            description,
            content: '',
            sourceType: 'directory',
            sourcePath: skillRoot,
            entryFile,
            triggers: existing?.triggers && typeof existing.triggers === 'object' ? { ...existing.triggers } : {},
            mcp: normalizeStringList(existing?.mcp),
            install: existing?.install && typeof existing.install === 'object' ? { ...existing.install } : null,
            interface: agentConfig.interface,
            policy: agentConfig.policy,
            capabilities: {
                referenceCount: fileIndex.references.length,
                scriptCount: scriptCatalog.length,
                assetCount: fileIndex.assets.length,
                agentMetadataCount: fileIndex.agents.length
            },
            cache: {
                frontmatter,
                summary,
                fileIndex,
                fileDetails,
                scriptCatalog,
                scriptManifestPath,
                metadataPath: agentConfig.path,
                validationWarnings: agentConfig.warnings,
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

    _buildSkillPackageFiles(skill) {
        if (!skill || String(skill.sourceType || '').trim() !== 'directory') return []

        const skillRoot = this._ensureAbsoluteDirectory(skill.sourcePath, 'sourcePath')
        const fileIndex = this._scanSkillDirectoryFiles(skillRoot)
        const relativePaths = [
            skill.entryFile || fileIndex.skill || 'SKILL.md',
            ...fileIndex.references,
            ...fileIndex.scripts,
            ...fileIndex.assets,
            ...fileIndex.agents,
            ...fileIndex.extra
        ]
        const uniquePaths = Array.from(new Set(relativePaths.map((item) => this._normalizeSkillInnerPath(item))))
        if (uniquePaths.length > MAX_SKILL_PACKAGE_FILE_COUNT) {
            throw new Error(`Skill 包文件数不能超过 ${MAX_SKILL_PACKAGE_FILE_COUNT}`)
        }

        let totalBytes = 0
        return uniquePaths.map((relativePath) => {
            const resolved = this._resolveSkillFileAbs(skillRoot, relativePath)
            const stat = fs.lstatSync(resolved.abs)
            if (stat.isSymbolicLink() || !stat.isFile()) {
                throw new Error(`Skill 包只能包含普通文件：${resolved.inner}`)
            }
            if (stat.size > MAX_SKILL_PACKAGE_FILE_BYTES) {
                throw new Error(
                    `Skill 包单文件（${resolved.inner}）不能超过 ${formatBytesAsMiB(MAX_SKILL_PACKAGE_FILE_BYTES)}`
                )
            }
            totalBytes += stat.size
            if (totalBytes > MAX_SKILL_PACKAGE_TOTAL_FILE_BYTES) {
                throw new Error(
                    `Skill 包展开后的文件总大小不能超过 ${formatBytesAsMiB(MAX_SKILL_PACKAGE_TOTAL_FILE_BYTES)}`
                )
            }

            const content = fs.readFileSync(resolved.abs)
            return {
                path: resolved.inner,
                encoding: 'base64',
                content: content.toString('base64'),
                size: content.length
            }
        })
    }

    _materializeSkillPackageFiles(config, pkg) {
        const files = Array.isArray(pkg?.files) ? pkg.files : []
        if (!files.length) return null

        const skillId = String(pkg?.skill?._id || '').trim()
        if (!/^[A-Za-z0-9_-]+$/.test(skillId)) {
            throw new Error('带文件的 Skill 包要求 skill._id 仅包含字母、数字、下划线或短横线')
        }

        const entryFile = files.find((file) => String(file?.path || '') === 'SKILL.md')
        const entryContent = entryFile?.encoding === 'base64'
            ? Buffer.from(entryFile.content, 'base64').toString('utf8')
            : String(entryFile?.content || '')
        const { frontmatter } = extractSkillFrontmatter(entryContent)
        const packageName = String(frontmatter?.name || '').trim()
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageName)) {
            throw new Error('Skill 包内 SKILL.md 的 name 不是有效的包名')
        }

        const managedRoot = this._getManagedSkillsRoot(config)
        const version = `${Date.now().toString(36)}-${hashString(`${skillId}:${process.pid}:${process.hrtime.bigint()}`)}`
        const versionRoot = path.resolve(managedRoot, skillId, version)
        const target = path.resolve(versionRoot, packageName)
        if (!isPathInside(managedRoot, target)) {
            throw new Error('Skill 包托管目录越过了 dataStorageRoot')
        }

        fs.mkdirSync(target, { recursive: true })
        try {
            files.forEach((file) => {
                const relativePath = this._normalizeSkillInnerPath(file.path, '')
                const destination = path.resolve(target, ...relativePath.split('/'))
                if (!isPathInside(target, destination)) {
                    throw new Error(`Skill 包文件越过了托管目录：${relativePath}`)
                }
                const content = file.encoding === 'base64'
                    ? Buffer.from(file.content, 'base64')
                    : Buffer.from(file.content, 'utf8')
                fs.mkdirSync(path.dirname(destination), { recursive: true })
                fs.writeFileSync(destination, content, { flag: 'wx' })
            })
            return { root: target, cleanupRoot: versionRoot }
        } catch (error) {
            if (isPathInside(managedRoot, versionRoot)) {
                fs.rmSync(versionRoot, { recursive: true, force: true })
            }
            throw error
        }
    }

    _buildInstalledFilePackageSkill(config, pkg) {
        const materialized = this._materializeSkillPackageFiles(config, pkg)
        if (!materialized) return null

        try {
            const record = this._buildDirectorySkillRecord(materialized.root, {
                id: pkg.skill._id
            })
            const bindings = this._normalizeDirectorySkillBindings(null, pkg.skill)
            record.name = String(pkg.skill.name || record.name || record._id)
            record.triggers = bindings.triggers
            record.mcp = bindings.mcp
            record.packageInfo = this._clone(pkg.skill.packageInfo || {})
            record.install = {
                type: 'package',
                source: String(pkg?.meta?.source || ''),
                importedAt: new Date().toISOString(),
                managed: true
            }
            return { skill: record, cleanupRoot: materialized.cleanupRoot }
        } catch (error) {
            const managedRoot = this._getManagedSkillsRoot(config)
            if (isPathInside(managedRoot, materialized.cleanupRoot)) {
                fs.rmSync(materialized.cleanupRoot, { recursive: true, force: true })
            }
            throw error
        }
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

        const packagedSkill = this._clone(pkg.skill);
        const skillId = String(packagedSkill?._id || '').trim();
        const existingSkill = config.skills[skillId];
        const hasPackagedFiles = Array.isArray(pkg.files) && pkg.files.length > 0;
        if (existingSkill && BUILTIN_SKILL_IDS.includes(skillId)) {
            throw new Error(`内置 Skill 冲突：${skillId}`);
        }
        if (hasPackagedFiles && existingSkill && !overwrite) {
            throw new Error(`Skill 已存在：${skillId}（如需覆盖请启用 overwrite）`);
        }

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

                if (!overwrite) {
                    throw new Error(`MCP server 已存在：${id}（如需覆盖请启用 overwrite）`);
                }

                config.mcpServers[id] = this._clone(server);
                updatedMcpIds.push(id);
            }
        }

        let materializedPackage = null;
        let skill = packagedSkill;
        let skillAction = 'added';
        let committed = false;
        let pythonDependencySpec = null;

        try {
            if (hasPackagedFiles) {
                materializedPackage = this._buildInstalledFilePackageSkill(config, pkg);
                skill = materializedPackage.skill;
                if (existingSkill) this._preserveSkillDotEnv(existingSkill, skill)
                pythonDependencySpec = this._findSkillPythonDependencySpec(skill.sourcePath)
                if (pythonDependencySpec) {
                    skill.install = {
                        ...(skill.install && typeof skill.install === 'object' ? skill.install : {}),
                        pythonDependencies: this._buildSkillPythonDependencyState(pythonDependencySpec)
                    }
                } else if (skill.install?.pythonDependencies) {
                    const nextInstall = { ...skill.install }
                    delete nextInstall.pythonDependencies
                    skill.install = nextInstall
                }
            }

            if (existingSkill) {
                if (!hasPackagedFiles && safeJsonEquals(existingSkill, skill)) {
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
            committed = true;
            if (hasPackagedFiles && skill?.sourcePath) {
                this._pruneManagedSkillVersionsAfterCommit(config, skillId, [skill.sourcePath])
            }
            if (pythonDependencySpec) this._scheduleSkillPythonDependencies(skill, pythonDependencySpec)

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
        } finally {
            if (!committed && materializedPackage?.cleanupRoot) {
                const managedRoot = this._getManagedSkillsRoot(config);
                if (isPathInside(managedRoot, materializedPackage.cleanupRoot)) {
                    fs.rmSync(materializedPackage.cleanupRoot, { recursive: true, force: true });
                }
            }
        }
    }

    getConfig() {
        const config = this._getRaw()
        this._schedulePendingSkillPythonDependencies(config)
        return this._buildPublicConfig(config)
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
                .filter(Boolean)
            : [];
        const files = this._buildSkillPackageFiles(skill);

        const payload = buildExportableSkillPackage({
            skill,
            mcpServers,
            files
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
        const stat = fs.lstatSync(inputPath);
        if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new Error('Skill 包路径必须指向普通文件');
        }
        if (stat.size > MAX_SKILL_PACKAGE_DOWNLOAD_BYTES) {
            throw new Error(
                `Skill 包文件过大（读取上限 ${formatBytesAsMiB(MAX_SKILL_PACKAGE_DOWNLOAD_BYTES)}）`
            );
        }
        const text = fs.readFileSync(inputPath, 'utf-8');
        const parsed = this._parseJsonText(text, inputPath);
        return this.installSkillPackage(parsed, { ...options, source: inputPath });
    }

    async installSkillPackageFromUrl(url, options = {}) {
        const normalizedUrl = typeof url === 'string' ? url.trim() : '';
        if (!normalizedUrl) throw new Error('url 不能为空');

        const download = await downloadPublicSkillPackageText(normalizedUrl);
        const parsed = this._parseJsonText(download.text, download.finalUrl);
        return this.installSkillPackage(parsed, { ...options, source: download.finalUrl });
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

        const sourceRecord = this._buildDirectorySkillRecord(absRoot, {
            id: options.id,
            existing
        })
        const conflict = config.skills[sourceRecord._id]
        if (conflict && (!existing || conflict._id !== existing._id) && !options.overwrite) {
            throw new Error(`skill id already exists: ${sourceRecord._id}`)
        }

        let managedRoot = ''
        let committed = false
        try {
            managedRoot = this._copySkillDirectoryToManagedRoot(config, absRoot, sourceRecord._id, sourceRecord.packageName)
            const record = this._buildDirectorySkillRecord(managedRoot, {
                id: sourceRecord._id,
                existing
            })
            const bindings = this._normalizeDirectorySkillBindings(existing, options)
            record.triggers = bindings.triggers
            record.mcp = bindings.mcp

            if (options.install && typeof options.install === 'object') {
                record.install = {
                    ...(record.install && typeof record.install === 'object' ? record.install : {}),
                    ...options.install,
                    managed: true,
                    originalSourcePath: absRoot,
                    ...(resolvedSource.discovered && resolvedSource.requested ? { selectedPath: resolvedSource.requested } : {})
                }
            } else if (!record.install || typeof record.install !== 'object') {
                record.install = {
                    type: 'directory',
                    importedAt: new Date().toISOString(),
                    managed: true,
                    originalSourcePath: absRoot,
                    ...(resolvedSource.discovered && resolvedSource.requested ? { selectedPath: resolvedSource.requested } : {})
                }
            } else {
                record.install = {
                    ...record.install,
                    managed: true,
                    originalSourcePath: absRoot,
                    ...(resolvedSource.discovered && resolvedSource.requested ? { selectedPath: resolvedSource.requested } : {})
                }
            }

            const pythonDependencySpec = this._findSkillPythonDependencySpec(managedRoot)
            if (pythonDependencySpec) {
                record.install.pythonDependencies = this._buildSkillPythonDependencyState(pythonDependencySpec)
            } else if (record.install?.pythonDependencies) {
                delete record.install.pythonDependencies
            }

            if (conflict && (!existing || conflict._id !== existing._id)) {
                if (!options.overwrite) {
                    throw new Error(`skill id already exists: ${record._id}`)
                }
            }

            config.skills[record._id] = record
            this._applyBuiltinsInPlace(config)
            this._save(config)
            committed = true
            this._pruneManagedSkillVersionsAfterCommit(config, record._id, [record.sourcePath])
            if (pythonDependencySpec) this._scheduleSkillPythonDependencies(record, pythonDependencySpec)
            return this._clone(record)
        } finally {
            if (!committed && managedRoot && path.resolve(managedRoot) !== path.resolve(absRoot)) {
                const failedVersionRoot = this._getManagedSkillVersionRootForSource(config, sourceRecord._id, managedRoot)
                if (failedVersionRoot && fs.existsSync(failedVersionRoot)) {
                    fs.rmSync(failedVersionRoot, { recursive: true, force: true })
                }
            }
        }
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

        const originalSourcePath = typeof existing?.install?.originalSourcePath === 'string'
            ? existing.install.originalSourcePath.trim()
            : ''
        const refreshSource = originalSourcePath || existing.sourcePath

        return this.importSkillDirectory(refreshSource, {
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
        let skill = this.getSkill(skillId)

        const sourceType = String(skill?.sourceType || '').trim()
        if (sourceType !== 'directory' && sourceType !== 'builtin-directory') {
            const inner = this._normalizeSkillInnerPath(filePath)
            if (inner !== 'SKILL.md') throw new Error('inline skill only supports SKILL.md')
            return {
                id: skillId,
                path: 'SKILL.md',
                content: String(skill?.content || ''),
                sourceType: 'inline'
            }
        }

        if (sourceType === 'directory') skill = this._ensureManagedSkillForUse(skill)
        const skillRoot = this._ensureAbsoluteDirectory(skill.sourcePath, 'sourcePath')
        const resolved = this._resolveSkillFileAbs(skillRoot, filePath || skill.entryFile || 'SKILL.md')
        if (isSensitiveSkillEnvironmentFilePath(resolved.inner)) {
            throw new Error('skill environment files cannot be read')
        }
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
        if (!textExts.has(ext) && !isSkillEnvironmentExampleFilePath(resolved.inner)) {
            throw new Error(`binary skill file is not supported: ${resolved.inner}`)
        }

        return {
            id: skillId,
            path: resolved.inner,
            content: fs.readFileSync(resolved.abs, 'utf-8'),
            sourceType
        }
    }

    readSkillIcon(id, variant = 'small') {
        const skillId = typeof id === 'string' ? id.trim() : ''
        if (!skillId) throw new Error('skill id cannot be empty')
        let skill = this.getSkill(skillId)
        const sourceType = String(skill?.sourceType || '').trim()
        if (sourceType !== 'directory' && sourceType !== 'builtin-directory') return null
        if (sourceType === 'directory') skill = this._ensureManagedSkillForUse(skill)

        const interfaceMetadata = normalizeSkillInterfaceMetadata(skill?.interface)
        const requested = String(variant || '').trim().toLowerCase() === 'large'
            ? interfaceMetadata.iconLarge || interfaceMetadata.iconSmall
            : interfaceMetadata.iconSmall || interfaceMetadata.iconLarge
        if (!requested) return null

        const skillRoot = this._ensureAbsoluteDirectory(skill.sourcePath, 'sourcePath')
        const inner = this._normalizeSkillInnerPath(requested, '')
        if (!inner.startsWith('assets/')) throw new Error('skill icon must be stored under assets/')
        const resolved = this._resolveSkillFileAbs(skillRoot, inner)
        if (!fs.existsSync(resolved.abs)) throw new Error(`skill icon not found: ${inner}`)
        const stat = fs.statSync(resolved.abs)
        if (!stat.isFile()) throw new Error(`skill icon is not a file: ${inner}`)
        if (stat.size > 2 * 1024 * 1024) throw new Error('skill icon cannot exceed 2 MB')

        const ext = path.extname(resolved.abs).toLowerCase()
        const mimeByExtension = {
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.avif': 'image/avif'
        }
        const mime = mimeByExtension[ext]
        if (!mime) throw new Error(`unsupported skill icon type: ${ext || '(none)'}`)
        const bytes = fs.readFileSync(resolved.abs)
        if (ext === '.svg') {
            const svg = bytes.toString('utf-8')
            if (/<script\b|on[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:|data:)/i.test(svg)) {
                throw new Error('skill SVG icon contains active or remote content')
            }
        }

        return {
            id: skillId,
            path: inner,
            mime,
            size: Number(stat.size) || 0,
            dataUrl: `data:${mime};base64,${bytes.toString('base64')}`
        }
    }

    async runSkillScript(id, scriptPath, options = {}) {
        const skillId = typeof id === 'string' ? id.trim() : ''
        if (!skillId) throw new Error('skill id cannot be empty')

        let skill = this.getSkill(skillId)
        if (String(skill?.sourceType || '').trim() !== 'directory') {
            throw new Error('inline skill does not support script execution')
        }

        skill = this._ensureManagedSkillForUse(skill)
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
        const runtimeConfig = this._getRaw()
        const dataRoot = this._ensureWritableDataStorageRoot(runtimeConfig)
        if (!this._isManagedSkillPath(runtimeConfig, skillRoot)) {
            throw new Error('skill scripts can only run from the managed skills directory under dataStorageRoot')
        }
        const runtimeEnv = this._buildSkillRuntimeEnvironment(dataRoot, skill, skillRoot, resolved.inner)

        const attempts = []
        let executionEnv = runtimeEnv
        let pythonEnvironment = null
        if (['.js', '.cjs', '.mjs'].includes(ext)) {
            attempts.push({ command: process.execPath || 'node', args: [resolved.abs, ...scriptArgs] })
        } else if (ext === '.py') {
            const preparedPython = await this._prepareSkillPythonRuntime({
                dataRoot,
                skill,
                skillRoot,
                runtimeEnv,
                timeoutMs
            })
            executionEnv = preparedPython.env
            pythonEnvironment = preparedPython.metadata
            preparedPython.attempts.forEach((attempt) => {
                attempts.push({
                    command: attempt.command,
                    args: [...(attempt.prefixArgs || []), resolved.abs, ...scriptArgs]
                })
            })
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
                const result = await this._runSkillProcess(attempt.command, attempt.args, {
                    cwd: execCwd,
                    env: executionEnv,
                    timeoutMs,
                    input: stdinText
                })
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
                    scriptMeta: scriptMeta || null,
                    pythonEnvironment
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
            let settled = false
            let settleTimer = null
            const child = exec(command, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                clearTimeout(settleTimer)
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
            const timer = setTimeout(() => {
                killProcessTreeSafely(child)
                settleTimer = setTimeout(() => {
                    if (settled) return
                    settled = true
                    const err = new Error('install command timed out after 120000ms')
                    err.code = 'ETIMEDOUT'
                    reject(err)
                }, 3000)
            }, 120000)
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
    _normalizeCustomMcpServerRecord(item) {
        const record = this._isPlainObject(item) ? { ...item } : {}
        const transportType = String(record.transportType || '').trim()
        record.icon = normalizeConfigIconValue(record.icon)
        record.brandColor = /^#[0-9a-f]{6}$/i.test(String(record.brandColor || '').trim())
            ? String(record.brandColor || '').trim()
            : ''
        if (transportType === 'stdio') {
            delete record.url
            delete record.headers
            delete record.method
            delete record.stream
            delete record.pingOnConnect
            delete record.maxTotalTimeout
        } else if (transportType === 'streamableHttp') {
            delete record.command
            delete record.args
            delete record.env
            delete record.cwd
            delete record.method
            delete record.stream
            delete record.pingOnConnect
            delete record.maxTotalTimeout
        }
        return record
    }

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
        const transportType = String(item?.transportType || '').trim()
        if (!['stdio', 'streamableHttp'].includes(transportType)) {
            throw new Error(`Unsupported custom MCP transport type: ${transportType || '(empty)'}`)
        }
        config.mcpServers[item._id] = this._normalizeCustomMcpServerRecord(item);
        this._save(config);
        return config.mcpServers;
    }

    updateMcpServer(id, updatedFields) {
        const config = this._getRaw();
        if (!config.mcpServers[id]) throw new Error('MCP server not found');
        const merged = { ...config.mcpServers[id], ...updatedFields }
        const transportType = String(merged.transportType || '').trim()
        if (!['stdio', 'streamableHttp'].includes(transportType)) {
            throw new Error(`旧版 MCP 传输 ${transportType || '(empty)'} 需要先迁移为 streamableHttp`)
        }
        config.mcpServers[id] = this._normalizeCustomMcpServerRecord(merged);
        this._save(config);
        return config.mcpServers;
    }

    deleteMcpServer(id) {
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
        try {
            this._cleanupManagedSkillStorage(config, id)
        } catch (error) {
            console.warn(`清理已删除 Skill ${id} 的托管文件失败。`, error)
        }
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
