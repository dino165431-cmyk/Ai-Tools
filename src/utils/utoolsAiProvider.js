import { ref } from 'vue'

export const UTOOLS_AI_PROVIDER_ID = 'builtin_provider_utools_ai'
export const UTOOLS_AI_PROVIDER_TYPE = 'utools-ai'

const runtimeModels = ref([])
const loading = ref(false)
const loaded = ref(false)
const loadError = ref('')

let loadPromise = null

function getUtoolsApi() {
  if (typeof window !== 'undefined' && window?.utools) return window.utools
  if (typeof globalThis !== 'undefined' && globalThis?.utools) return globalThis.utools
  return null
}

function normalizeString(val) {
  const text = val === null || val === undefined ? '' : String(val).trim()
  return text
}

function uniqueModelIds(items) {
  const out = []
  const seen = new Set()

  ;(Array.isArray(items) ? items : []).forEach((item) => {
    const id = normalizeString(item?.id)
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push({
      id,
      label: normalizeString(item?.label) || id,
      description: normalizeString(item?.description),
      icon: normalizeString(item?.icon),
      cost: Number.isFinite(Number(item?.cost)) ? Number(item.cost) : 0
    })
  })

  return out
}

function coercePlainTextContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    const textParts = []
    let imageCount = 0

    content.forEach((part) => {
      if (!part || typeof part !== 'object') return
      if (part.type === 'text') {
        const text = normalizeString(part.text)
        if (text) textParts.push(text)
        return
      }
      if (part.type === 'image_url') {
        imageCount += 1
      }
    })

    if (imageCount > 0) {
      textParts.push(`（附带 ${imageCount} 张图片；uTools 官方 AI 当前按文本历史消息传递，本轮不会直接附带图片二进制内容）`)
    }

    return textParts.join('\n\n').trim()
  }

  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text
    if (typeof content.content === 'string') return content.content
    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return String(content)
    }
  }

  return String(content)
}

export function isUtoolsBuiltinProvider(providerOrId) {
  if (!providerOrId) return false
  if (typeof providerOrId === 'string') return normalizeString(providerOrId) === UTOOLS_AI_PROVIDER_ID

  return (
    normalizeString(providerOrId?._id) === UTOOLS_AI_PROVIDER_ID ||
    normalizeString(providerOrId?.providerType) === UTOOLS_AI_PROVIDER_TYPE
  )
}

export function mergeUtoolsBuiltinProvider(provider) {
  if (!provider || typeof provider !== 'object') return provider
  if (!isUtoolsBuiltinProvider(provider)) return provider

  return {
    ...provider,
    providerType: UTOOLS_AI_PROVIDER_TYPE,
    builtin: true,
    selectModels: runtimeModels.value.map((item) => item.id)
  }
}

export function getUtoolsAiModelsState() {
  return {
    models: runtimeModels,
    loading,
    loaded,
    loadError
  }
}

export function canUseUtoolsAi() {
  return typeof getUtoolsApi()?.ai === 'function'
}

export function canManageUtoolsAiModels() {
  return typeof getUtoolsApi()?.allAiModels === 'function'
}

export function openUtoolsAiModelsSetting() {
  const api = getUtoolsApi()
  if (typeof api?.redirectAiModelsSetting === 'function') {
    api.redirectAiModelsSetting()
    return true
  }
  return false
}

export async function refreshUtoolsAiModels(options = {}) {
  const force = options?.force === true
  if (loadPromise && !force) return loadPromise

  const api = getUtoolsApi()
  if (typeof api?.allAiModels !== 'function') {
    runtimeModels.value = []
    loaded.value = true
    loadError.value = '当前环境不支持 uTools 官方 AI 模型列表'
    return runtimeModels.value
  }

  loading.value = true
  loadError.value = ''

  const runner = (async () => {
    try {
      const list = await api.allAiModels()
      runtimeModels.value = uniqueModelIds(list)
      loaded.value = true
      loadError.value = ''
      return runtimeModels.value
    } catch (err) {
      runtimeModels.value = []
      loaded.value = true
      loadError.value = err?.message || String(err)
      throw err
    } finally {
      loading.value = false
      loadPromise = null
    }
  })()

  loadPromise = runner
  return runner
}

export function initUtoolsAiProvider() {
  return refreshUtoolsAiModels().catch(() => runtimeModels.value)
}

export function buildUtoolsAiMessages({ systemContent, apiMessages }) {
  const messages = []
  const systemText = normalizeString(systemContent)
  if (systemText) {
    messages.push({ role: 'system', content: systemText })
  }

  ;(Array.isArray(apiMessages) ? apiMessages : []).forEach((message) => {
    if (!message || typeof message !== 'object') return
    const role = normalizeString(message.role)
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return

    const content = coercePlainTextContent(message.content)
    const next = {
      role,
      content
    }

    if (role === 'assistant') {
      const reasoning = normalizeString(
        message.reasoning_content ?? message.reasoning ?? message.thinking ?? message.thought
      )
      if (reasoning) next.reasoning_content = reasoning
    }

    messages.push(next)
  })

  return messages
}

export function registerUtoolsAiToolFunctions({ tools, invokeTool }) {
  const target =
    typeof window !== 'undefined'
      ? window
      : typeof globalThis !== 'undefined'
        ? globalThis
        : null

  if (!target || typeof invokeTool !== 'function') {
    return () => {}
  }

  const restorers = []

  ;(Array.isArray(tools) ? tools : []).forEach((tool) => {
    const name = normalizeString(tool?.function?.name)
    if (!name) return

    const hadOwn = Object.prototype.hasOwnProperty.call(target, name)
    const previous = target[name]

    target[name] = async (args = {}) => invokeTool(name, args)

    restorers.push(() => {
      if (!hadOwn) {
        try {
          delete target[name]
        } catch {
          target[name] = undefined
        }
        return
      }
      target[name] = previous
    })
  })

  return () => {
    restorers.reverse().forEach((restore) => {
      try {
        restore()
      } catch {
        // ignore
      }
    })
  }
}
