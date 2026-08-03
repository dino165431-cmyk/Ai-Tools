import { computed, ref, watch } from 'vue'
import {
  getInlinePickerMatchScore,
  INLINE_COMMAND_DEFINITIONS,
  INLINE_COMMAND_KIND_LABELS
} from '@/utils/chatInlinePicker'
import { truncateInlineText } from '@/utils/chatAttachmentUtils'
import { isSystemPrompt } from '@/utils/promptConfig'
import { hasActiveBasePromptSelection } from '@/utils/chatPromptTooling'

const INLINE_AGENT_SUGGESTION_LIMIT = 8
const INLINE_COMMAND_SUGGESTION_LIMIT = 8

export function makeLocalPromptOptionValue(promptId) {
  return `local:${String(promptId || '').trim()}`
}

export function makeMcpPromptOptionValue(item = {}) {
  const serverId = encodeURIComponent(String(item.serverId || '').trim())
  const promptName = encodeURIComponent(String(item.name || '').trim())
  return `mcp:${serverId}:${promptName}`
}

export function useChatInlinePicker(sources) {
  const {
    agents,
    providers,
    selectedAgentId,
    prompts,
    mcpPromptCatalog,
    basePromptMode,
    selectedPromptId,
    skills,
    agentSkillIdSet,
    selectedSkillIds,
    manualMcpIds,
    derivedMcpIds,
    orderedMcpServers
  } = sources

  const inlineAgentQuery = ref('')
  const inlineAgentMatchStart = ref(-1)
  const inlineAgentMatchEnd = ref(-1)
  const inlineAgentActiveIndex = ref(0)
  const inlineCommandMode = ref('')
  const inlineCommandType = ref('')
  const inlineCommandQuery = ref('')
  const inlineCommandMatchStart = ref(-1)
  const inlineCommandMatchEnd = ref(-1)
  const inlineCommandActiveIndex = ref(0)

  const inlineAgentPickerHeaderText = computed(() => {
    const query = String(inlineAgentQuery.value || '').trim()
    return query ? `@${query}` : '@'
  })

  const inlineCommandPickerTitle = computed(() => {
    if (inlineCommandMode.value === 'kind') return '选择命令类型'
    return INLINE_COMMAND_KIND_LABELS[inlineCommandType.value] || '选择命令'
  })

  const inlineCommandPickerHeaderText = computed(() => {
    if (inlineCommandMode.value === 'kind') {
      const query = String(inlineCommandQuery.value || '').trim()
      return query ? `/${query}` : '/'
    }

    const kind = String(inlineCommandType.value || '').trim()
    if (!kind) return ''
    const query = String(inlineCommandQuery.value || '').trim()
    return query ? `/${kind} ${query}` : `/${kind}`
  })

  const inlineAgentSuggestions = computed(() => {
    const list = (Array.isArray(agents.value) ? agents.value : []).filter((agent) => agent?.builtin !== true)
    const query = String(inlineAgentQuery.value || '').trim()

    return list
      .map((agent) => {
        const id = String(agent?._id || '').trim()
        const name = String(agent?.name || '').trim()
        if (!id) return null

        const provider = (providers.value || []).find((item) => item?._id === agent?.provider)
        const selected = selectedAgentId.value === id
        const providerLabel = provider?.name || provider?._id || ''
        const model = String(agent?.model || '').trim()
        const score = query
          ? getInlinePickerMatchScore([name, id, providerLabel, model], query)
          : selected ? -1 : 10
        if (!Number.isFinite(score)) return null

        return {
          value: id,
          id,
          name,
          label: name || id,
          model,
          providerLabel,
          selected,
          score
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || Number(b.selected) - Number(a.selected) || a.label.localeCompare(b.label))
      .slice(0, INLINE_AGENT_SUGGESTION_LIMIT)
  })

  const inlineCommandSuggestions = computed(() => {
    const mode = String(inlineCommandMode.value || '').trim()
    const kind = String(inlineCommandType.value || '').trim()
    const query = String(inlineCommandQuery.value || '').trim()
    if (mode === 'kind') {
      return INLINE_COMMAND_DEFINITIONS
        .map((item) => {
          const score = query
            ? getInlinePickerMatchScore([item.kind, item.label, item.token, ...item.aliases.map((alias) => `/${alias}`)], query)
            : 0
          if (query && !Number.isFinite(score)) return null
          return {
            value: item.kind,
            id: item.label,
            label: item.token,
            description: item.description,
            meta: item.aliases.length ? item.aliases.map((alias) => `/${alias}`).join(' ') : '',
            selected: false,
            selectedTag: '',
            score
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
        .slice(0, INLINE_COMMAND_SUGGESTION_LIMIT)
    }

    if (!kind) return []

    if (kind === 'prompt') {
      const localItems = (prompts.value || [])
        .filter((prompt) => prompt?.builtin !== true)
        .map((prompt) => {
          const id = String(prompt?._id || '').trim()
          if (!id) return null
          const label = String(prompt?.name || prompt?._id || '').trim()
          const description = truncateInlineText(prompt?.content, 72)
          const systemPrompt = isSystemPrompt(prompt)
          const selected = systemPrompt && hasActiveBasePromptSelection({
            basePromptMode: basePromptMode.value,
            selectedPromptId: selectedPromptId.value
          }) && selectedPromptId.value === id
          const score = query
            ? getInlinePickerMatchScore([label, id, description], query)
            : selected ? -1 : 10
          if (!Number.isFinite(score)) return null
          return {
            value: makeLocalPromptOptionValue(id),
            id,
            label: label || id,
            description,
            meta: systemPrompt ? '本地 · 系统' : '本地 · 用户',
            selected,
            selectedTag: systemPrompt ? '当前' : '',
            score
          }
        })
        .filter(Boolean)

      const mcpItems = (mcpPromptCatalog.value || [])
        .map((item) => {
          const serverId = String(item?.serverId || '').trim()
          const name = String(item?.name || '').trim()
          if (!serverId || !name) return null
          const label = String(item?.label || name).trim()
          const description = truncateInlineText(item?.description, 72)
          const meta = ['MCP', item?.serverName || serverId, item?.arguments?.length ? `参数 ${item.arguments.length}` : ''].filter(Boolean).join(' · ')
          const score = query
            ? getInlinePickerMatchScore([label, name, serverId, item?.serverName, description, meta], query)
            : 12
          if (!Number.isFinite(score)) return null
          return {
            value: makeMcpPromptOptionValue(item),
            id: name,
            label,
            description,
            meta,
            selected: false,
            selectedTag: '',
            score,
            disabled: !!item.disabled,
            title: [item?.serverName && item.serverName !== serverId ? serverId : '', description, item.disabled ? '该 MCP 已禁用' : ''].filter(Boolean).join('\n')
          }
        })
        .filter(Boolean)

      return [...localItems, ...mcpItems]
        .sort((a, b) => a.score - b.score || Number(b.selected) - Number(a.selected) || a.label.localeCompare(b.label, 'zh-Hans-CN'))
        .slice(0, INLINE_COMMAND_SUGGESTION_LIMIT)
    }

    if (kind === 'skill') {
      const agentSet = agentSkillIdSet.value
      return (skills.value || [])
        .map((skill) => {
          const id = String(skill?._id || '').trim()
          if (!id) return null
          const label = String(skill?.name || skill?._id || '').trim()
          const description = truncateInlineText(skill?.description || skill?.content, 72)
          const selected = (selectedSkillIds.value || []).includes(id)
          const meta = agentSet.has(id) ? '智能体' : ''
          const score = query
            ? getInlinePickerMatchScore([label, id, description, meta], query)
            : selected ? -1 : 10
          if (!Number.isFinite(score)) return null
          return {
            value: id,
            id,
            label: label || id,
            description,
            meta,
            selected,
            selectedTag: '已选中',
            score
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score || Number(b.selected) - Number(a.selected) || a.label.localeCompare(b.label))
        .slice(0, INLINE_COMMAND_SUGGESTION_LIMIT)
    }

    if (kind === 'mcp') {
      const manualIdSet = new Set(Array.isArray(manualMcpIds.value) ? manualMcpIds.value : [])
      const derivedIdSet = new Set(Array.isArray(derivedMcpIds.value) ? derivedMcpIds.value : [])

      return orderedMcpServers.value
        .map((server) => {
          const id = String(server?._id || '').trim()
          if (!id) return null
          const label = String(server?.name || server?._id || '').trim()
          const disabled = !!server?.disabled
          const manualSelected = manualIdSet.has(id)
          const derivedSelected = derivedIdSet.has(id)
          const selected = manualSelected || derivedSelected
          const metaParts = []
          const transportType = String(server?.transportType || '').trim().toUpperCase()
          if (transportType) metaParts.push(transportType)
          if (derivedSelected && !manualSelected) metaParts.push('技能')
          if (disabled) metaParts.push('已禁用')
          const meta = metaParts.join(' · ')
          const description = truncateInlineText(server?.description || server?.url || server?.baseUrl || server?.command, 72)
          const score = query
            ? getInlinePickerMatchScore([label, id, description, meta], query)
            : manualSelected ? -2 : derivedSelected ? -1 : disabled ? 20 : 10
          if (!Number.isFinite(score)) return null
          return {
            value: id,
            id,
            label: label || id,
            description,
            meta,
            selected,
            selectedTag: manualSelected ? '已选中' : derivedSelected ? '技能' : '',
            disabled,
            title: [label && label !== id ? id : '', description, disabled ? '该 MCP 已禁用，请先到设置页启用' : '']
              .filter(Boolean)
              .join('\n'),
            score
          }
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.score - b.score ||
            Number(!!a.disabled) - Number(!!b.disabled) ||
            Number(b.selected) - Number(a.selected) ||
            a.label.localeCompare(b.label, 'zh-Hans-CN')
        )
    }

    return []
  })

  const showInlineAgentPicker = computed(() => {
    return inlineAgentMatchStart.value >= 0 && inlineAgentSuggestions.value.length > 0
  })

  const showInlineCommandPicker = computed(() => {
    return inlineCommandMatchStart.value >= 0 && inlineCommandSuggestions.value.length > 0
  })

  function clearInlineAgentPicker() {
    inlineAgentQuery.value = ''
    inlineAgentMatchStart.value = -1
    inlineAgentMatchEnd.value = -1
    inlineAgentActiveIndex.value = 0
  }

  function clearInlineCommandPicker() {
    inlineCommandMode.value = ''
    inlineCommandType.value = ''
    inlineCommandQuery.value = ''
    inlineCommandMatchStart.value = -1
    inlineCommandMatchEnd.value = -1
    inlineCommandActiveIndex.value = 0
  }

  function clearInlinePickers() {
    clearInlineAgentPicker()
    clearInlineCommandPicker()
  }

  function moveInlineAgentActive(step) {
    const list = inlineAgentSuggestions.value
    if (!list.length) return
    const size = list.length
    inlineAgentActiveIndex.value = (inlineAgentActiveIndex.value + step + size) % size
  }

  function getFirstEnabledInlineCommandIndex(list = inlineCommandSuggestions.value) {
    const index = (Array.isArray(list) ? list : []).findIndex((item) => !item?.disabled)
    return index >= 0 ? index : 0
  }

  function moveInlineCommandActive(step) {
    const list = inlineCommandSuggestions.value
    if (!list.length) return
    const size = list.length
    let nextIndex = inlineCommandActiveIndex.value
    let attempts = 0
    do {
      nextIndex = (nextIndex + step + size) % size
      attempts += 1
    } while (attempts < size && list[nextIndex]?.disabled)
    inlineCommandActiveIndex.value = nextIndex
  }

  watch(inlineAgentSuggestions, (list) => {
    if (!list.length || inlineAgentActiveIndex.value >= list.length) {
      inlineAgentActiveIndex.value = 0
    }
  })

  watch(inlineCommandSuggestions, (list) => {
    if (!list.length) {
      inlineCommandActiveIndex.value = 0
      return
    }
    if (inlineCommandActiveIndex.value >= list.length || list[inlineCommandActiveIndex.value]?.disabled) {
      inlineCommandActiveIndex.value = getFirstEnabledInlineCommandIndex(list)
    }
  })

  return {
    inlineAgentQuery,
    inlineAgentMatchStart,
    inlineAgentMatchEnd,
    inlineAgentActiveIndex,
    inlineCommandMode,
    inlineCommandType,
    inlineCommandQuery,
    inlineCommandMatchStart,
    inlineCommandMatchEnd,
    inlineCommandActiveIndex,
    inlineAgentPickerHeaderText,
    inlineCommandPickerTitle,
    inlineCommandPickerHeaderText,
    inlineAgentSuggestions,
    inlineCommandSuggestions,
    showInlineAgentPicker,
    showInlineCommandPicker,
    clearInlineAgentPicker,
    clearInlineCommandPicker,
    clearInlinePickers,
    moveInlineAgentActive,
    moveInlineCommandActive,
    getFirstEnabledInlineCommandIndex
  }
}
