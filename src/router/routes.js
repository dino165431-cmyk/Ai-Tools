import {
    BareMetalServer02,
    SkillLevelIntermediate,
    CloudSatelliteConfig
} from '@vicons/carbon'

import {
    ChatMultiple24Filled,
    NotepadEdit16Regular,
    PeopleSettings24Regular,
    AppsListDetail20Regular,
    BrainCircuit20Regular,
    DataUsage24Regular,
    Timer24Regular
} from '@vicons/fluent'

import {
    Prompt
} from '@vicons/tabler'

import {
    Magento
} from '@vicons/fa'

import {
    CubeOutline
} from '@vicons/ionicons5'

export const routers = [
    {
        path: '/chat',
        name: 'chat',
        component: () => import('@/views/pages/chat/Chat.vue'),
        meta: {
            keepAlive: true,
            menu: true,
            label: '聊天',
            description: '与模型对话、调用工具和智能体',
            icon: ChatMultiple24Filled
        }
    },
    {
        path: '/note',
        name: 'note',
        component: () => import('@/views/pages/note/Note.vue'),
        meta: {
            keepAlive: true,
            menu: true,
            label: '笔记',
            description: '管理 Markdown 笔记与 Notebook',
            icon: NotepadEdit16Regular
        }
    },
    {
        path: '/setting',
        name: 'setting',
        redirect: { name: 'provider' },
        meta: {
            menu: true,
            label: '设置',
            description: '模型、助手、扩展能力和应用选项',
            icon: PeopleSettings24Regular
        },
        children: [
            {
                path: 'tasks',
                name: 'timedTask',
                component: () => import('@/views/pages/setting/timedTask/TimedTask.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '自动任务',
                    description: '按计划自动运行对话或智能体',
                    icon: Timer24Regular
                }
            },
            {
                path: 'memory',
                name: 'memory',
                component: () => import('@/views/pages/setting/memory/Memory.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '记忆管理',
                    description: '查看和管理助手保存的长期信息',
                    icon: BrainCircuit20Regular,
                    requiresMemoryEnabled: true
                }
            },
            {
                path: 'sandboxes',
                name: 'sandbox',
                component: () => import('@/views/pages/setting/sandbox/Sandbox.vue'),
                meta: {
                    menu: true,
                    label: '沙盒管理',
                    description: '查看沙盒占用、会话引用和回收站',
                    icon: CubeOutline
                }
            },
            {
                path: 'models',
                name: 'provider',
                component: () => import('@/views/pages/setting/provider/Provider.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '模型服务',
                    description: '配置 OpenAI 兼容接口和可用模型',
                    icon: AppsListDetail20Regular
                }
            },
            {
                path: 'assistants',
                name: 'agent',
                component: () => import('@/views/pages/setting/agent/Agent.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '智能助手',
                    description: '组合模型、提示词、技能与工具',
                    icon: Magento
                }
            },
            {
                path: 'prompts',
                name: 'prompt',
                component: () => import('@/views/pages/setting/prompt/Prompt.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '提示词',
                    description: '管理可复用的系统提示词与模板',
                    icon: Prompt
                }
            },
            {
                path: 'skills',
                name: 'skill',
                component: () => import('@/views/pages/setting/skill/Skill.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '技能',
                    description: '导入和管理标准 SKILL.md 技能包',
                    icon: SkillLevelIntermediate
                }
            },
            {
                path: 'skills/new',
                name: 'skillNew',
                component: () => import('@/views/pages/setting/skill/SkillDetail.vue'),
                meta: {
                    label: '新建技能',
                    description: '创建内联技能'
                }
            },
            {
                path: 'skills/:id',
                name: 'skillDetail',
                component: () => import('@/views/pages/setting/skill/SkillDetail.vue'),
                meta: {
                    label: '技能详情',
                    description: '查看技能包、界面元数据、文件和绑定'
                }
            },
            {
                path: 'tools',
                name: 'mcp',
                component: () => import('@/views/pages/setting/mcp/Mcp.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '扩展工具',
                    description: '管理外部 MCP 服务及其工具权限',
                    icon: BareMetalServer02
                }
            },
            {
                path: 'notes',
                name: 'noteTemplate',
                component: () => import('@/views/pages/setting/noteTemplate/NoteTemplate.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '笔记配置',
                    description: '设置笔记模板、编辑器和目录规则',
                    icon: NotepadEdit16Regular
                }
            },
            {
                path: 'usage',
                name: 'usage',
                component: () => import('@/views/pages/setting/usage/Usage.vue'),
                meta: {
                    menu: true,
                    label: '用量统计',
                    description: '查看保存在本地的模型 Token 消耗',
                    icon: DataUsage24Regular
                }
            },
            {
                path: 'advanced',
                name: 'config',
                component: () => import('@/views/pages/setting/config/Config.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '高级设置',
                    description: '上下文、联网、存储、安全和实验选项',
                    icon: CloudSatelliteConfig
                }
            }
        ]
    }
]
