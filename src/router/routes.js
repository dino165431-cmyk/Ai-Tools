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
    Timer24Regular
} from '@vicons/fluent'

import {
    Prompt
} from '@vicons/tabler'

import {
    Magento
} from '@vicons/fa'

export const routers = [
    {
        path: '/chat',
        name: 'chat',
        component: () => import('@/views/pages/chat/Chat.vue'),
        meta: {
            keepAlive: true,
            menu: true,
            label: '聊天',
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
            icon: PeopleSettings24Regular
        },
        children: [
            {
                path: '/timedTask',
                name: 'timedTask',
                component: () => import('@/views/pages/setting/timedTask/TimedTask.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '定时任务',
                    icon: Timer24Regular
                }
            },
            {
                path: '/provider',
                name: 'provider',
                component: () => import('@/views/pages/setting/provider/Provider.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '服务商',
                    icon: AppsListDetail20Regular
                }
            },
            {
                path: '/agent',
                name: 'agent',
                component: () => import('@/views/pages/setting/agent/Agent.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '智能体',
                    icon: Magento
                }
            },
            {
                path: '/prompt',
                name: 'prompt',
                component: () => import('@/views/pages/setting/prompt/Prompt.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '提示词',
                    icon: Prompt
                }
            },
            {
                path: '/skill',
                name: 'skill',
                component: () => import('@/views/pages/setting/skill/Skill.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '技能',
                    icon: SkillLevelIntermediate
                }
            },
            {
                path: '/mcp',
                name: 'mcp',
                component: () => import('@/views/pages/setting/mcp/Mcp.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: 'MCP',
                    icon: BareMetalServer02
                }
            },
            {
                path: '/noteTemplate',
                name: 'noteTemplate',
                component: () => import('@/views/pages/setting/noteTemplate/NoteTemplate.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '笔记配置',
                    icon: NotepadEdit16Regular
                }
            },
            {
                path: '/config',
                name: 'config',
                component: () => import('@/views/pages/setting/config/Config.vue'),
                meta: {
                    keepAlive: true,
                    menu: true,
                    label: '配置',
                    icon: CloudSatelliteConfig
                }
            }
        ]
    }
]
