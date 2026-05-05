import { computed, ref } from 'vue';
import { initUtoolsAiProvider, mergeUtoolsBuiltinProvider } from '@/utils/utoolsAiProvider';
import { DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG } from '@/utils/chatContextWindow';
import { DEFAULT_CHAT_MEMORY_CONFIG, normalizeChatMemoryConfig } from '@/utils/chatMemoryConfig';
import { getDefaultNoteSecurityConfig } from '@/utils/noteEncryption';
import { DEFAULT_NOTE_EDITOR_CONFIG } from '@/utils/noteTemplateConfig';
import { DEFAULT_NOTEBOOK_RUNTIME_CONFIG } from '@/utils/notebookRuntimeConfig';

const DEFAULT_SYSTEM_PROMPT = `你是一个 AI 助手（AI Assistant）。

沟通语言：
- 默认使用简体中文与用户交流；仅当用户明确要求时才切换到其他语言。

目标与风格：
- 以“准确、可执行、可验证”为优先；先给结论/方案，再给步骤与注意事项。
- 不确定时先提出 1–3 个关键澄清问题，避免做高风险假设。
- 涉及代码/配置/命令时，优先给出可直接操作的步骤与示例。

思考与解释：
- 你可以在内部进行逐步推理与自检。
- 对外请用简洁的“思路要点/关键依据”进行引导（3–6 条要点即可），避免冗长。

安全与边界：
- 遇到可能有风险或权限不足的操作，先提示风险与替代方案，并征求确认。
- 不要编造信息；需要外部信息时明确说明并给出获取/验证方法。`;

function getDefaultConfigSecurity() {
    return {
        passwordVerifier: null,
        recoveryQuestion: '',
        recoveryAnswerVerifier: null,
        passwordRecoveryEnvelope: ''
    };
}

function getDefaultNoteConfig() {
    return {
        noteEditor: { ...DEFAULT_NOTE_EDITOR_CONFIG },
        noteSecurity: getDefaultNoteSecurityConfig(),
        notebookRuntime: { ...DEFAULT_NOTEBOOK_RUNTIME_CONFIG }
    };
}

function getDefaultChatConfig() {
    return {
        defaultProviderId: '',
        defaultModel: '',
        defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
        imageGenerationMode: 'auto',
        videoGenerationMode: 'auto',
        contextWindow: { ...DEFAULT_CHAT_CONTEXT_WINDOW_CONFIG },
        memory: normalizeChatMemoryConfig(DEFAULT_CHAT_MEMORY_CONFIG)
    };
}

function getDefaultWebSearchConfig() {
    return {
        proxyUrl: '',
        allowInsecureTlsFallback: true,
        searchApiProvider: 'none',
        searchApiKey: '',
        searchApiEndpoint: '',
        searchApiMarket: 'zh-CN'
    };
}

const globalConfig = ref({
    theme: 'light',
    chatConfig: getDefaultChatConfig(),
    noteConfig: getDefaultNoteConfig(),
    configSecurity: getDefaultConfigSecurity(),
    agents: {},
    providers: {},
    prompts: {},
    mcpServers: {},
    skills: {},
    timedTask: {},
    dataStorageRoot: '',
    cloudConfig: {
        region: '',
        accessKeyId: '',
        secretAccessKey: '',
        bucket: '',
        endpoint: '',
        forcePathStyle: null,
        autoBackupEnabled: false,
        autoRestoreEnabled: false
    },
    webSearchConfig: getDefaultWebSearchConfig()
});

function getGlobalConfigApi() {
    return globalThis?.globalConfig;
}

function requireGlobalConfigApi() {
    const api = getGlobalConfigApi();
    if (!api) {
        throw new Error('globalConfig 未注入（请在 uTools 插件环境中运行）');
    }
    return api;
}

function init() {
    try {
        if (window?.globalConfig?.getConfig) {
            const cfg = window.globalConfig.getConfig();
            if (cfg && typeof cfg === 'object') {
                globalConfig.value = cfg;
            }
        }
    } catch (err) {
        console.warn('初始化全局配置失败：', err);
    }

    try {
        window.addEventListener('globalConfigChanged', (e) => {
            const detail = e?.detail;
            if (detail && typeof detail === 'object') {
                globalConfig.value = detail;
            }
        });
    } catch (err) {
        console.warn('监听 globalConfigChanged 失败：', err);
    }

    initUtoolsAiProvider().catch((err) => {
        console.warn('初始化 uTools 官方 AI 模型失败：', err);
    });
}

// 辅助：将对象转换为数组
function toArray(obj) {
    return Object.values(obj || {});
}

// agents
export function getAgents() {
    return computed(() => toArray(globalConfig.value.agents));
}

export function getAgentById(id) {
    return computed(() => globalConfig.value.agents[id]);
}

export function addAgent(item) {
    return requireGlobalConfigApi().addAgent(item);
}

export function updateAgent(id, item) {
    return requireGlobalConfigApi().updateAgent(id, item);
}

export function deleteAgent(id) {
    return requireGlobalConfigApi().deleteAgent(id);
}

// providers
export function getProviders() {
    return computed(() => toArray(globalConfig.value.providers).map((item) => mergeUtoolsBuiltinProvider(item)));
}

export function getProviderById(id) {
    return computed(() => mergeUtoolsBuiltinProvider(globalConfig.value.providers[id]));
}

export function addProvider(item) {
    return requireGlobalConfigApi().addProvider(item);
}

export function updateProvider(id, item) {
    return requireGlobalConfigApi().updateProvider(id, item);
}

export function deleteProvider(id) {
    return requireGlobalConfigApi().deleteProvider(id);
}

// prompts
export function getPrompts() {
    return computed(() => toArray(globalConfig.value.prompts));
}

export function getPromptById(id) {
    return computed(() => globalConfig.value.prompts[id]);
}

export function addPrompt(item) {
    return requireGlobalConfigApi().addPrompt(item);
}

export function updatePrompt(id, item) {
    return requireGlobalConfigApi().updatePrompt(id, item);
}

export function deletePrompt(id) {
    return requireGlobalConfigApi().deletePrompt(id);
}

// skills
export function getSkills() {
    return computed(() => toArray(globalConfig.value.skills));
}

export function getSkillById(id) {
    return computed(() => globalConfig.value.skills[id]);
}

export function addSkill(item) {
    return requireGlobalConfigApi().addSkill(item);
}

export function updateSkill(id, item) {
    return requireGlobalConfigApi().updateSkill(id, item);
}

export function deleteSkill(id) {
    return requireGlobalConfigApi().deleteSkill(id);
}

export function exportSkillToFile(id, filePath, options) {
    return requireGlobalConfigApi().exportSkillToFile(id, filePath, options);
}

export function installSkillPackage(rawPackage, options) {
    return requireGlobalConfigApi().installSkillPackage(rawPackage, options);
}

export function installSkillPackageFromFile(filePath, options) {
    return requireGlobalConfigApi().installSkillPackageFromFile(filePath, options);
}

export function installSkillPackageFromUrl(url, options) {
    return requireGlobalConfigApi().installSkillPackageFromUrl(url, options);
}

export function importSkillDirectory(sourcePath, options) {
    return requireGlobalConfigApi().importSkillDirectory(sourcePath, options);
}

export function importSkillFile(filePath, options) {
    return requireGlobalConfigApi().importSkillFile(filePath, options);
}

export function refreshSkillFromSource(id) {
    return requireGlobalConfigApi().refreshSkillFromSource(id);
}

export function readSkillFile(id, filePath) {
    return requireGlobalConfigApi().readSkillFile(id, filePath);
}

export function listSkillFiles(id) {
    return requireGlobalConfigApi().listSkillFiles(id);
}

export function runSkillScript(id, scriptPath, options) {
    return requireGlobalConfigApi().runSkillScript(id, scriptPath, options);
}

export function installSkillsFromCommand(options) {
    return requireGlobalConfigApi().installSkillsFromCommand(options);
}

// mcp servers
export function getMcpServers() {
    return computed(() => toArray(globalConfig.value.mcpServers));
}

export function getMcpServerById(id) {
    return computed(() => globalConfig.value.mcpServers[id]);
}

export function addMcpServer(item) {
    return requireGlobalConfigApi().addMcpServer(item);
}

export function updateMcpServer(id, item) {
    return requireGlobalConfigApi().updateMcpServer(id, item);
}

export function deleteMcpServer(id) {
    return requireGlobalConfigApi().deleteMcpServer(id);
}

// timedTask
export function getTimedTasks() {
    return computed(() => toArray(globalConfig.value.timedTask));
}

export function getTimedTaskById(id) {
    return computed(() => globalConfig.value.timedTask?.[id]);
}

export function addTimedTask(item) {
    return requireGlobalConfigApi().addTimedTask(item);
}

export function updateTimedTask(id, item) {
    return requireGlobalConfigApi().updateTimedTask(id, item);
}

export function deleteTimedTask(id) {
    return requireGlobalConfigApi().deleteTimedTask(id);
}

// theme
export function getTheme() {
    return computed(() => globalConfig.value.theme);
}

// chat config
export function getChatConfig() {
    return computed(() => globalConfig.value.chatConfig || getDefaultChatConfig());
}

export function updateChatConfig(partial) {
    return requireGlobalConfigApi().updateChatConfig(partial);
}

export function getNoteConfig() {
    return computed(() => globalConfig.value.noteConfig || getDefaultNoteConfig());
}

export function updateNoteConfig(partial) {
    return requireGlobalConfigApi().updateNoteConfig(partial);
}

export function getConfigSecurity() {
    return computed(() => globalConfig.value.configSecurity || getDefaultConfigSecurity());
}

export function updateConfigSecurity(partial) {
    return requireGlobalConfigApi().updateConfigSecurity(partial);
}

export function updateGlobalConfig(partial) {
    return requireGlobalConfigApi().updateConfig(partial);
}

export function cutTheme() {
    return requireGlobalConfigApi().cutTheme();
}

// dataStorageRoot
export function getDataStorageRoot() {
    return computed(() => globalConfig.value.dataStorageRoot);
}

export function setDataStorageRoot(path) {
    return requireGlobalConfigApi().updateDataStorageRoot(path);
}

export function resetDataStorageRoot() {
    return requireGlobalConfigApi().resetDataStorageRoot();
}

// cloudConfig
export function getCloudConfig() {
    return computed(() => globalConfig.value.cloudConfig);
}

export function updateCloudConfig(partial) {
    return requireGlobalConfigApi().updateCloudConfig(partial);
}

export function getWebSearchConfig() {
    return computed(() => globalConfig.value.webSearchConfig || getDefaultWebSearchConfig());
}

export function updateWebSearchConfig(partial) {
    return requireGlobalConfigApi().updateWebSearchConfig(partial);
}

export function exportGlobalConfigToFile(filePath) {
    return requireGlobalConfigApi().exportToFile(filePath);
}

export function importGlobalConfigFromFile(filePath) {
    return requireGlobalConfigApi().importFromFile(filePath);
}

export default {
    init
};
