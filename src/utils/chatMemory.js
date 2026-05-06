import {
  createDirectory,
  openInFileManager,
  readFile,
  resolvePath,
  writeFile
} from '@/utils/fileOperations'
import { getChatConfig, getDataStorageRoot, getProviders, updateChatConfig } from '@/utils/configListener'
import { parseSessionJsonText } from '@/utils/sessionFileJson'
import { buildUtoolsAiMessages, canUseUtoolsAi } from '@/utils/utoolsAiProvider'
import { normalizeChatMemoryConfig, isChatMemoryEnabled, DEFAULT_CHAT_MEMORY_CONFIG } from '@/utils/chatMemoryConfig'

const MEMORY_ROOT = 'chat-memory'
const MEMORY_STORE_FILE = `${MEMORY_ROOT}/memory-store.json`
const MEMORY_SCHEMA_VERSION = 2
const MEMORY_TEXT_LIMIT = 4000
const MEMORY_SUMMARY_LIMIT = 240
const MEMORY_EMBED_LIMIT = 3000
const MEMORY_QUERY_CHUNK_LIMIT = 3
const MEMORY_QUERY_CHUNK_SIZE = 720
const MEMORY_QUERY_PREVIEW_LIMIT = 1400
const MEMORY_CANDIDATE_LIMIT = 64
const MEMORY_CANDIDATE_BATCH_SIZE = 3
const MEMORY_CANDIDATE_MAX = 12
const MEMORY_CANDIDATE_IDLE_MS = 90 * 1000
const MEMORY_AUTO_CLEAN_MIN_INTERVAL_MS = 10 * 60 * 1000
const MEMORY_AUTO_CLEAN_ITEM_THRESHOLD = 12
const PROFILE_MEMORY_MERGE_MIN_SIMILARITY = 0.72
const PROFILE_MEMORY_MERGE_STRONG_SIMILARITY = 0.84
const RELEVANT_MEMORY_MERGE_MIN_SIMILARITY = 0.92
const MEMORY_PROFILE_KINDS = new Set(['profile', 'preference', 'style', 'constraint'])
const MEMORY_PROFILE_KEYS = new Set([
  'name',
  'nickname',
  'display_name',
  'preferred_name',
  'real_name',
  'user.name',
  'user.profile',
  'user_profile',
  'user_info',
  'identity',
  'occupation',
  'job',
  'role',
  'company',
  'project',
  'style',
  'tone',
  'language',
  'reply.style',
  'reply.tone',
  'language.preference'
])
const LOW_SIGNAL_TURN_RE = /^(?:ok|okay|好的?|嗯+|行|可以|收到|明白|继续|thanks?|thank you|谢了|谢谢|辛苦了|麻烦了)[!！。.\s]*$/i
const STABLE_MEMORY_HINT_RE =
  /(以后|今后|默认|一直|长期|习惯|偏好|喜欢|不喜欢|尽量|不要|别|统一|固定|我是|我在|我的项目|我通常|我习惯|请用|请不要|always|prefer|usually|default|my project|i am|i'm|use .* by default)/i
const CJK_SEGMENT_RE = /[\u3400-\u9fff]{2,}/g
const MEMORY_SENTENCE_SPLIT_RE = /[\n\r]+|(?<=[。！？!?；;])|(?<=[.])\s+(?=[A-Z0-9\u3400-\u9fff])/g
const MEMORY_QUERY_CUE_VARIANTS = [
  {
    pattern: /(名字|姓名|称呼|我叫什么|怎么叫|姓什么|name)/i,
    terms: ['名字', '姓名', '称呼', '我叫', '叫做', 'name']
  },
  {
    pattern: /(偏好|喜欢|不喜欢|习惯|默认)/i,
    terms: ['偏好', '喜欢', '不喜欢', '习惯', '默认']
  },
  {
    pattern: /(项目|仓库|代码库|工程)/i,
    terms: ['项目', '仓库', '代码库', '工程']
  },
  {
    pattern: /(工作|职业|职位|角色)/i,
    terms: ['工作', '职业', '职位', '角色']
  }
]
const GENERIC_ENTITY_TOKEN_RE =
  /(用户|名字|姓名|称呼|名为|偏好|风格|语气|语言|项目|职业|身份|角色|公司|回答|回复|assistant|answer|reply|style|tone|language|preference|project|name|user|profile|identity|job|role|company)/i
const ENTITY_TOKEN_RE = /[a-z0-9][a-z0-9._-]{1,}|[\u3400-\u9fff]{2,}/giu

const state = {
  ready: false,
  loading: null,
  store: null,
  autoCleanTimer: null,
  lastAutoCleanAt: 0
}

function nowIso() {
  return new Date().toISOString()
}

function nowMs() {
  return Date.now()
}

function newId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeText(value) {
  return String(value || '').trim()
}

function clampNumber(value, fallback, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function safeDateMs(value, fallback = 0) {
  const direct = Number(value)
  if (Number.isFinite(direct) && direct > 0) return direct
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeStringList(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((item) => normalizeText(item)).filter(Boolean))]
}

function normalizeComparableKey(value, separator = '') {
  const text = normalizeText(value)
  if (!text) return ''
  let normalized = text
  try {
    normalized = normalized.normalize('NFKC')
  } catch {
    // ignore unicode normalization failures
  }
  const replaced = normalized.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, separator)
  if (!separator) return replaced
  return replaced.replace(new RegExp(`${separator}+`, 'g'), separator).replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '')
}

function normalizeIdentitySignature(value) {
  return normalizeComparableKey(value, '')
}

function normalizeProfileKeyName(value) {
  return normalizeComparableKey(value, '_')
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0
  const len = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i += 1) {
    const av = Number(a[i]) || 0
    const bv = Number(b[i]) || 0
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  if (!na || !nb) return 0
  return dot / Math.sqrt(na * nb)
}

function stableStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function dedupeBy(items, keyBuilder) {
  const out = []
  const seen = new Set()
  for (const item of items || []) {
    const key = normalizeText(keyBuilder(item))
    const fallback = normalizeText(item?.id)
    const finalKey = key || fallback
    if (finalKey && seen.has(finalKey)) continue
    if (finalKey) seen.add(finalKey)
    out.push(item)
  }
  return out
}

function normalizeEmbeddingVector(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((n) => Number(n) || 0)
}

function buildMemoryComparableText(item) {
  if (!item || typeof item !== 'object') return ''
  return normalizeText(
    [
      item.summary,
      item.text,
      ...(Array.isArray(item.tags) ? item.tags : []),
      ...(Array.isArray(item.aliases) ? item.aliases : []),
      item.notes
    ]
      .filter(Boolean)
      .join(' ')
  )
}

function collectKeywordTokens(text) {
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized) return []

  const tokens = new Set(
    normalized
      .split(/[\s,.;:!?，。；：、/\\|()[\]{}"'`<>-]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
  )

  const cjkMatches = normalized.match(CJK_SEGMENT_RE) || []
  cjkMatches.forEach((segment) => {
    tokens.add(segment)
    const maxSize = Math.min(4, segment.length)
    for (let size = 2; size <= maxSize; size += 1) {
      for (let start = 0; start <= segment.length - size; start += 1) {
        tokens.add(segment.slice(start, start + size))
        if (tokens.size >= 64) break
      }
      if (tokens.size >= 64) break
    }
  })

  MEMORY_QUERY_CUE_VARIANTS.forEach(({ pattern, terms }) => {
    if (!pattern.test(normalized)) return
    terms.forEach((term) => {
      const value = normalizeText(term).toLowerCase()
      if (value.length >= 2) tokens.add(value)
    })
  })

  return [...tokens].slice(0, 64)
}

function collectEntityLikeTokens(text = '', options = {}) {
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized) return []
  const profileParts = normalizeProfileKeyName(options?.profileKey)
    .split('_')
    .map((part) => part.trim())
    .filter(Boolean)
  const out = new Set()
  const matches = normalized.match(ENTITY_TOKEN_RE) || []
  matches.forEach((match) => {
    const token = normalizeText(match).toLowerCase()
    if (!token || token.length < 2) return
    if (GENERIC_ENTITY_TOKEN_RE.test(token)) return
    if (profileParts.some((part) => part && token.includes(part))) return
    out.add(token)
  })
  return [...out]
}

function countTokenOverlap(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0
  const right = new Set(b.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))
  let count = 0
  for (const token of new Set(a.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))) {
    if (right.has(token)) count += 1
  }
  return count
}

function hasComparableSignatureContainment(a, b, minLength = 12) {
  const left = normalizeIdentitySignature(a)
  const right = normalizeIdentitySignature(b)
  if (!left || !right) return false
  const shorter = left.length <= right.length ? left : right
  const longer = left.length <= right.length ? right : left
  return shorter.length >= minLength && longer.includes(shorter)
}

function estimateQuerySegmentWeight(text = '') {
  const normalized = normalizeText(text)
  if (!normalized) return -1

  let score = Math.min(0.4, normalized.length / 420)
  if (/[?？]/.test(normalized)) score += 1.2
  if (/(请|帮我|告诉我|怎么|如何|多少|是否|能否|why|what|who|when|where|how|which|name|project|preference)/i.test(normalized)) score += 0.8
  if (/(姓名|名字|称呼|偏好|习惯|项目|职业|身份|公司|地点|城市|语言|风格|约束)/.test(normalized)) score += 0.7
  if (/[A-Z][A-Za-z0-9_-]{1,}/.test(normalized)) score += 0.18
  if (/\d{2,}/.test(normalized)) score += 0.12
  if (normalized.length > 180) score -= Math.min(0.55, (normalized.length - 180) / 520)
  return score
}

function splitQueryIntoSegments(text = '') {
  const normalized = normalizeText(text)
  if (!normalized) return []
  return normalized
    .split(MEMORY_SENTENCE_SPLIT_RE)
    .map((part) => normalizeText(part))
    .filter(Boolean)
}

function summarizeQueryForRecall(text = '') {
  const normalized = normalizeText(text)
  if (!normalized) return ''
  if (normalized.length <= MEMORY_QUERY_PREVIEW_LIMIT) return normalized

  const segments = splitQueryIntoSegments(normalized)
  if (!segments.length) return normalized.slice(0, MEMORY_QUERY_PREVIEW_LIMIT)

  const scored = segments
    .map((segment, index) => ({
      segment,
      index,
      score: estimateQuerySegmentWeight(segment) + (index === 0 ? 0.08 : 0)
    }))
    .sort((a, b) => b.score - a.score)

  const picked = []
  const pickedIndexes = new Set()

  const pushSegment = (segment, index) => {
    const textValue = normalizeText(segment)
    if (!textValue || pickedIndexes.has(index)) return
    pickedIndexes.add(index)
    picked.push({ segment: textValue, index })
  }

  pushSegment(segments[0], 0)
  if (segments.length > 1) pushSegment(segments[segments.length - 1], segments.length - 1)
  scored.slice(0, 4).forEach(({ segment, index }) => pushSegment(segment, index))

  return picked
    .sort((a, b) => a.index - b.index)
    .map((item) => item.segment)
    .join('\n')
    .slice(0, MEMORY_QUERY_PREVIEW_LIMIT)
}

function buildRecallQueryChunks(text = '') {
  const normalized = summarizeQueryForRecall(text)
  if (!normalized) return []
  if (normalized.length <= MEMORY_QUERY_CHUNK_SIZE) return [normalized]

  const segments = splitQueryIntoSegments(normalized)
  if (!segments.length) return [normalized.slice(0, MEMORY_QUERY_CHUNK_SIZE)]

  const chunks = []
  let current = ''
  for (const segment of segments) {
    const next = current ? `${current}\n${segment}` : segment
    if (next.length <= MEMORY_QUERY_CHUNK_SIZE || !current) {
      current = next.slice(0, MEMORY_QUERY_CHUNK_SIZE)
      continue
    }
    chunks.push(current)
    current = segment.slice(0, MEMORY_QUERY_CHUNK_SIZE)
    if (chunks.length >= MEMORY_QUERY_CHUNK_LIMIT) break
  }
  if (current && chunks.length < MEMORY_QUERY_CHUNK_LIMIT) chunks.push(current)

  const tokens = collectKeywordTokens(normalized)
  if (tokens.length && chunks.length < MEMORY_QUERY_CHUNK_LIMIT) {
    chunks.push(tokens.join(' ').slice(0, MEMORY_QUERY_CHUNK_SIZE))
  }

  return dedupeBy(chunks.filter(Boolean), (item) => item).slice(0, MEMORY_QUERY_CHUNK_LIMIT)
}

function getProfileKeyHintScore(profileKey = '') {
  const key = normalizeText(profileKey).toLowerCase()
  if (!key) return 0
  if (MEMORY_PROFILE_KEYS.has(key)) return 0.92
  if (key.includes('name')) return 0.9
  if (key.includes('prefer') || key.includes('style') || key.includes('language')) return 0.82
  if (key.includes('user') || key.includes('profile') || key.includes('identity')) return 0.8
  if (key.includes('job') || key.includes('role')) return 0.76
  return 0
}

function getProfileHintScore(item) {
  if (!item) return 0
  const profileKey = normalizeText(item.profileKey).toLowerCase()
  if (!profileKey) return 0
  return getProfileKeyHintScore(profileKey)
}

export function isProfileMemoryKind(kind) {
  return MEMORY_PROFILE_KINDS.has(normalizeText(kind).toLowerCase())
}

export function getMemoryLane(raw) {
  const kind = typeof raw === 'string' ? raw : raw?.kind
  if (isProfileMemoryKind(kind)) return 'profile'
  if (typeof raw === 'object' && raw) {
    const profileKey = normalizeText(raw.profileKey).toLowerCase()
    if (profileKey && getProfileKeyHintScore(profileKey) >= 0.76) return 'profile'
  }
  return 'memory'
}

function normalizeMemoryItem(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const text = normalizeText(src.text || src.summary || src.content)
  const kind = normalizeText(src.kind).toLowerCase() || 'fact'
  const scope = normalizeText(src.scope).toLowerCase() || 'global'
  const createdAt = normalizeText(src.createdAt) || nowIso()
  const updatedAt = normalizeText(src.updatedAt) || createdAt
  return {
    id: normalizeText(src.id) || newId(),
    text: text.slice(0, MEMORY_TEXT_LIMIT),
    summary: normalizeText(src.summary || text).slice(0, MEMORY_SUMMARY_LIMIT),
    kind,
    lane: getMemoryLane(kind),
    scope,
    confidence: clampNumber(src.confidence, 0.7, 0, 1),
    status:
      normalizeText(src.status).toLowerCase() === 'deleted'
        ? 'deleted'
        : normalizeText(src.status).toLowerCase() === 'archived'
          ? 'archived'
          : 'active',
    tags: normalizeStringList(src.tags),
    profileKey: normalizeText(src.profileKey),
    dedupeKey: normalizeText(src.dedupeKey),
    embedding: normalizeEmbeddingVector(src.embedding),
    hitCount: Math.max(0, Math.round(Number(src.hitCount) || 0)),
    lastUsedAt: normalizeText(src.lastUsedAt) || '',
    createdAt,
    updatedAt,
    source: src.source && typeof src.source === 'object' ? { ...src.source } : {},
    notes: normalizeText(src.notes),
    aliases: normalizeStringList(src.aliases)
  }
}

function normalizeStore(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const items = Array.isArray(src.items) ? src.items.map(normalizeMemoryItem) : []
  return {
    version: MEMORY_SCHEMA_VERSION,
    updatedAt: normalizeText(src.updatedAt) || nowIso(),
    items: sortMemoryItems(items)
  }
}

function sortMemoryItems(items = []) {
  return [...items].sort((a, b) => {
    const statusRank = (item) => (item?.status === 'active' ? 0 : item?.status === 'archived' ? 1 : 2)
    const laneRank = (item) => (getMemoryLane(item) === 'profile' ? 0 : 1)
    const sr = statusRank(a) - statusRank(b)
    if (sr !== 0) return sr
    const lr = laneRank(a) - laneRank(b)
    if (lr !== 0) return lr
    const conf = Number(b?.confidence || 0) - Number(a?.confidence || 0)
    if (conf !== 0) return conf
    const hits = Number(b?.hitCount || 0) - Number(a?.hitCount || 0)
    if (hits !== 0) return hits
    return safeDateMs(b?.updatedAt) - safeDateMs(a?.updatedAt)
  })
}

function getDefaultMemoryConfig() {
  return normalizeChatMemoryConfig(DEFAULT_CHAT_MEMORY_CONFIG)
}

function getMemoryConfig() {
  const cfg = getChatConfig().value || {}
  return normalizeChatMemoryConfig(cfg.memory)
}

function isEnabled() {
  return isChatMemoryEnabled(getMemoryConfig())
}

async function ensureRoot() {
  await createDirectory(MEMORY_ROOT)
}

async function loadStoreFromDisk() {
  await ensureRoot()
  const snapshot = await readFile(MEMORY_STORE_FILE, 'utf-8').catch(() => '')
  const parsed = parseSessionJsonText(String(snapshot || ''))
  if (parsed.ok && parsed.value && typeof parsed.value === 'object') return normalizeStore(parsed.value)
  return normalizeStore({ items: [] })
}

async function saveStoreToDisk(store) {
  await ensureRoot()
  const payload = normalizeStore(store)
  await writeFile(MEMORY_STORE_FILE, JSON.stringify(payload, null, 2))
  state.store = payload
  return payload
}

function clearAutoCleanTimer() {
  if (!state.autoCleanTimer) return
  try {
    clearTimeout(state.autoCleanTimer)
  } catch {
    // ignore timer cleanup failures
  }
  state.autoCleanTimer = null
}

function scheduleAutoCleanMemoryStore(options = {}) {
  clearAutoCleanTimer()
  const delayMs = Math.max(1000, Number(options.delayMs || MEMORY_CANDIDATE_IDLE_MS))
  state.autoCleanTimer = setTimeout(() => {
    state.autoCleanTimer = null
    void maybeAutoCleanMemoryStore({ force: false })
  }, delayMs)
}

async function maybeAutoCleanMemoryStore(options = {}) {
  const store = await withStore()
  const activeItems = (store.items || []).filter((item) => item && item.status !== 'deleted')
  if (!activeItems.length) return store

  const now = nowMs()
  const dueByTime = now - Number(state.lastAutoCleanAt || 0) >= MEMORY_AUTO_CLEAN_MIN_INTERVAL_MS
  const dueBySize = activeItems.length >= MEMORY_AUTO_CLEAN_ITEM_THRESHOLD
  if (options.force !== true && !dueByTime && !dueBySize) {
    scheduleAutoCleanMemoryStore({ delayMs: MEMORY_AUTO_CLEAN_MIN_INTERVAL_MS })
    return store
  }

  const cleaned = await cleanMemoryStore()
  state.lastAutoCleanAt = nowMs()
  if ((cleaned?.items || []).length >= MEMORY_AUTO_CLEAN_ITEM_THRESHOLD) {
    scheduleAutoCleanMemoryStore({ delayMs: MEMORY_AUTO_CLEAN_MIN_INTERVAL_MS })
  }
  return cleaned
}

async function withStore() {
  if (state.store) return state.store
  if (!state.loading) {
    state.loading = loadStoreFromDisk()
      .then((store) => {
        state.store = store
        state.ready = true
        return store
      })
      .finally(() => {
        state.loading = null
      })
  }
  return state.loading
}

function getProviderBaseInfo(providerId) {
  const providers = getProviders().value || []
  return providers.find((item) => String(item?._id || '') === String(providerId || '')) || null
}

async function requestOpenAiCompatibleJson({ baseUrl, apiKey, path, body, signal }) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  const candidates = [`${base}${path}`]
  if (!/\/v1$/i.test(base)) candidates.push(`${base}/v1${path}`)
  let lastError = null
  for (const url of candidates) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal
      })
      if (resp.status === 404 && url !== candidates[candidates.length - 1]) continue
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || `HTTP ${resp.status}`)
      }
      return await resp.json()
    } catch (err) {
      lastError = err
      if (url !== candidates[candidates.length - 1]) continue
      throw err
    }
  }
  throw lastError || new Error('request failed')
}

async function requestEmbeddingVector(text, selection) {
  const provider = getProviderBaseInfo(selection?.providerId)
  const model = normalizeText(selection?.model)
  const baseUrl = normalizeText(provider?.baseurl)
  const apiKey = normalizeText(provider?.apikey)
  if (!baseUrl || !apiKey || !model) return []
  const json = await requestOpenAiCompatibleJson({
    baseUrl,
    apiKey,
    path: '/embeddings',
    body: {
      model,
      input: text
    }
  })
  return normalizeEmbeddingVector(json?.data?.[0]?.embedding || [])
}

function safeParseJsonArray(text) {
  const raw = String(text || '').trim()
  if (!raw) return { ok: true, value: [] }
  try {
    const value = JSON.parse(raw)
    return { ok: Array.isArray(value), value: Array.isArray(value) ? value : [] }
  } catch {
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return { ok: false, error: new Error('invalid json') }
    try {
      const value = JSON.parse(match[0])
      return { ok: Array.isArray(value), value: Array.isArray(value) ? value : [] }
    } catch (err) {
      return { ok: false, error: err }
    }
  }
}

function normalizeConversationPairs(rawPairs = []) {
  return (Array.isArray(rawPairs) ? rawPairs : [])
    .map((raw) => {
      const src = raw && typeof raw === 'object' ? raw : {}
      return {
        userText: normalizeText(src.userText).slice(0, 3000),
        assistantText: normalizeText(src.assistantText).slice(0, 4000),
        summary: normalizeText(src.summary).slice(0, 600)
      }
    })
    .filter((item) => item.userText || item.assistantText)
}

function buildExtractionPrompt({ conversationPairs, systemPrompt }) {
  const blocks = [
    '你是一个长期记忆提取器。请从下面的多轮对话片段里提取适合长期保存的记忆，严格输出 JSON 数组。',
    '每一项格式：{ "kind": "profile|preference|style|constraint|fact|project", "text": "...", "summary": "...", "confidence": 0~1, "tags": ["..."], "profileKey": "可选", "dedupeKey": "可选" }。',
    '对于画像项优先提供稳定的 profileKey；如果 dedupeKey 不能稳定命名，可以留空，不要只改分隔符、前后缀或同义表达。',
    '优先提取用户画像、长期偏好、回答风格偏好、项目长期约束、稳定事实、持续中的项目背景。',
    '不要提取一次性的寒暄、短期上下文、当前轮立即失效的信息。',
    '如果没有值得保存的内容，输出 []。'
  ]

  const promptSections = []
  const promptText = normalizeText(systemPrompt)
  if (promptText) {
    promptSections.push(`系统提示词：\n${promptText.slice(0, 2500)}`)
  }

  conversationPairs.forEach((item, index) => {
    promptSections.push(
      [
        `片段 ${index + 1}：`,
        item.userText ? `用户：\n${item.userText}` : '',
        item.assistantText ? `助手：\n${item.assistantText}` : '',
        item.summary ? `摘要：\n${item.summary}` : ''
      ]
        .filter(Boolean)
        .join('\n\n')
    )
  })

  return [...blocks, ...promptSections].join('\n\n')
}

async function requestMemoryExtraction({ userText, assistantText, systemPrompt, selection, conversationPairs }) {
  const provider = getProviderBaseInfo(selection?.providerId)
  const model = normalizeText(selection?.model)
  const baseUrl = normalizeText(provider?.baseurl)
  const apiKey = normalizeText(provider?.apikey)
  if (!provider || !model) throw new Error('memory extraction model is not configured')

  const pairs = normalizeConversationPairs(
    conversationPairs && conversationPairs.length
      ? conversationPairs
      : [{ userText, assistantText }]
  )
  if (!pairs.length) return []

  const prompt = buildExtractionPrompt({
    conversationPairs: pairs,
    systemPrompt
  })

  const body = {
    model,
    messages: buildUtoolsAiMessages({
      systemContent: '你是一个严格的结构化信息提取器，只输出 JSON。',
      apiMessages: [{ role: 'user', content: prompt }]
    }),
    temperature: 0.2
  }

  if (provider?.providerType === 'utools-ai' || provider?.builtin) {
    if (!canUseUtoolsAi()) throw new Error('utools ai is unavailable for memory extraction')
    const result = await window.utools.ai({ model, messages: body.messages })
    const raw = String(result?.content || '').trim()
    const parsed = safeParseJsonArray(raw)
    return parsed.ok ? parsed.value : []
  }

  if (!baseUrl || !apiKey) throw new Error('memory extraction provider credentials are incomplete')

  const json = await requestOpenAiCompatibleJson({
    baseUrl,
    apiKey,
    path: '/chat/completions',
    body: {
      model,
      messages: body.messages,
      temperature: 0.2
    }
  })
  const raw = String(json?.choices?.[0]?.message?.content || '').trim()
  const parsed = safeParseJsonArray(raw)
  return parsed.ok ? parsed.value : []
}

function buildRecallText(item) {
  const parts = []
  if (item.kind) parts.push(`[${item.kind}]`)
  if (item.profileKey) parts.push(item.profileKey)
  const label = parts.join(' ')
  return `${label ? `${label} ` : ''}${item.text || item.summary || ''}`.trim()
}

function scoreProfileItem(item, queryText = '') {
  if (!item || item.status !== 'active' || getMemoryLane(item) !== 'profile') return -1
  const hay = normalizeText(
    [item.text, item.summary, item.profileKey, ...(item.tags || []), ...(item.aliases || [])].join(' ')
  ).toLowerCase()
  const tokens = collectKeywordTokens(queryText)
  const keywordHits = tokens.filter((token) => hay.includes(token)).length
  const keywordScore = Math.min(0.24, keywordHits * 0.06)
  const directKeyBonus =
    item.profileKey && tokens.some((token) => String(item.profileKey || '').toLowerCase().includes(token)) ? 0.12 : 0
  const profileHintBonus = Math.min(0.18, getProfileHintScore(item) * 0.2)
  const confidenceScore = clampNumber(item.confidence, 0.5, 0, 1) * 0.55
  const hitScore = Math.min(0.18, Math.log10((Number(item.hitCount) || 0) + 1) * 0.12)
  const recentDays = item.lastUsedAt ? Math.max(0, (Date.now() - Date.parse(item.lastUsedAt || 0)) / 86400000) : 999
  const recentScore = recentDays < 3 ? 0.16 : recentDays < 14 ? 0.08 : 0
  const textScore = Math.min(0.08, normalizeText(item.text || item.summary).length / 4000)
  const keyBonus = item.profileKey ? 0.08 : 0
  return confidenceScore + hitScore + recentScore + textScore + keyBonus + keywordScore + directKeyBonus + profileHintBonus
}

function scoreMemoryItem(item, queryEmbedding, queryText, config) {
  if (!item || item.status !== 'active' || getMemoryLane(item) === 'profile') return -1
  const embeddingScore = item.embedding.length && queryEmbedding.length ? cosineSimilarity(item.embedding, queryEmbedding) : 0
  const hay = normalizeText(
    [item.text, item.summary, item.profileKey, ...(item.tags || []), ...(item.aliases || [])].join(' ')
  ).toLowerCase()
  const tokens = collectKeywordTokens(queryText)
  const keywordHits = tokens.filter((token) => hay.includes(token)).length
  const keywordScore = Math.min(0.24, keywordHits * 0.05)
  const hardKeywordMatch = keywordHits >= 2 || (keywordHits >= 1 && tokens.length <= 5)
  const hasEmbeddingMatch = queryEmbedding.length && item.embedding.length
  if (!hasEmbeddingMatch && !hardKeywordMatch) return -1
  const confidenceScore = clampNumber(item.confidence, 0.5, 0, 1) * 0.16
  const hitScore = Math.min(0.12, Math.log10((Number(item.hitCount) || 0) + 1) * 0.05)
  const recentDays = item.lastUsedAt ? Math.max(0, (Date.now() - Date.parse(item.lastUsedAt || 0)) / 86400000) : 999
  const recentScore = recentDays < 3 ? 0.08 : recentDays < 14 ? 0.04 : 0
  const minSimilarity = clampNumber(config?.minSimilarity, getDefaultMemoryConfig().minSimilarity, 0, 1)
  if (hasEmbeddingMatch && embeddingScore < minSimilarity && !hardKeywordMatch) return -1
  return embeddingScore * 0.72 + keywordScore + confidenceScore + hitScore + recentScore
}

function upsertMergedItem(existing, patch) {
  const next = normalizeMemoryItem({ ...existing, ...patch })
  next.updatedAt = nowIso()
  next.hitCount = Math.max(Number(existing?.hitCount) || 0, Number(next.hitCount) || 0)
  next.lastUsedAt = patch.lastUsedAt || existing?.lastUsedAt || next.lastUsedAt
  return next
}

function pickPreferredStatus(a = '', b = '') {
  const rank = (status) => {
    const normalized = normalizeText(status).toLowerCase()
    if (normalized === 'active') return 2
    if (normalized === 'archived') return 1
    if (normalized === 'deleted') return 0
    return -1
  }
  return rank(a) >= rank(b) ? normalizeText(a) || 'active' : normalizeText(b) || 'active'
}

function pickEarlierTimestamp(a = '', b = '') {
  const aMs = safeDateMs(a)
  const bMs = safeDateMs(b)
  if (!aMs) return normalizeText(b)
  if (!bMs) return normalizeText(a)
  return aMs <= bMs ? normalizeText(a) : normalizeText(b)
}

function pickLaterTimestamp(a = '', b = '') {
  const aMs = safeDateMs(a)
  const bMs = safeDateMs(b)
  if (!aMs) return normalizeText(b)
  if (!bMs) return normalizeText(a)
  return aMs >= bMs ? normalizeText(a) : normalizeText(b)
}

function pickPreferredTextValue(existingValue = '', incomingValue = '', options = {}) {
  const existingText = normalizeText(existingValue)
  const incomingText = normalizeText(incomingValue)
  if (!existingText) return incomingText
  if (!incomingText) return existingText
  if (options.preferIncomingContent === true) return incomingText
  return existingText.length >= incomingText.length ? existingText : incomingText
}

function buildMergedMemoryItem(existing, incoming, options = {}) {
  const prev = normalizeMemoryItem(existing)
  const next = normalizeMemoryItem(incoming)
  return upsertMergedItem(prev, {
    ...next,
    id: prev.id,
    kind: prev.kind || next.kind,
    scope: prev.scope || next.scope,
    status: pickPreferredStatus(prev.status, next.status),
    createdAt: pickEarlierTimestamp(prev.createdAt, next.createdAt) || prev.createdAt,
    text: pickPreferredTextValue(prev.text, next.text, options),
    summary: pickPreferredTextValue(prev.summary, next.summary, options),
    confidence: Math.max(prev.confidence, next.confidence),
    hitCount: Math.max(prev.hitCount, next.hitCount),
    lastUsedAt: pickLaterTimestamp(prev.lastUsedAt, next.lastUsedAt),
    profileKey: normalizeText(prev.profileKey || next.profileKey),
    dedupeKey: normalizeText(prev.dedupeKey || next.dedupeKey),
    tags: normalizeStringList([...(prev.tags || []), ...(next.tags || [])]),
    aliases: normalizeStringList([...(prev.aliases || []), ...(next.aliases || [])]),
    notes: pickPreferredTextValue(prev.notes, next.notes, options),
    embedding: prev.embedding.length >= next.embedding.length ? prev.embedding : next.embedding,
    source: {
      ...(prev.source && typeof prev.source === 'object' ? prev.source : {}),
      ...(next.source && typeof next.source === 'object' ? next.source : {})
    }
  })
}

function isNameLikeProfileKey(profileKey = '') {
  const key = normalizeProfileKeyName(profileKey)
  return (
    key === 'name' ||
    key.includes('nickname') ||
    key.includes('display_name') ||
    key.includes('preferred_name') ||
    key.includes('real_name')
  )
}

function canonicalizeProfileKeyTokens(profileKey = '') {
  const key = normalizeProfileKeyName(profileKey)
  if (!key) return []
  const rawTokens = key.split('_').map((token) => token.trim()).filter(Boolean)
  const normalized = rawTokens.map((token) => {
    if (['answer', 'response', 'reply'].includes(token)) return 'response'
    if (['style', 'tone', 'format', 'structured', 'structure'].includes(token)) return 'style'
    if (['language', 'lang', 'locale'].includes(token)) return 'language'
    if (['doc', 'document', 'note'].includes(token)) return 'document'
    if (['update', 'overwrite', 'replace', 'rewrite', 'edit'].includes(token)) return 'update'
    if (['material', 'asset', 'creative'].includes(token)) return 'asset'
    if (['matching', 'match', 'matcher'].includes(token)) return 'match'
    if (['project', 'workspace', 'repo', 'repository', 'codebase'].includes(token)) return 'project'
    if (['user', 'profile', 'preference', 'preferred', 'default', 'setting', 'info'].includes(token)) return ''
    return token
  })
  return [...new Set(normalized.filter(Boolean))]
}

function inferProfileSemanticGroupFromText(text = '') {
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized) return ''
  if (/(名字|姓名|称呼|昵称|preferred name|display name|nickname|\bname\b)/i.test(normalized)) return 'identity:name'
  if (/(语言|中文|英文|language|locale)/i.test(normalized)) return 'preference:language'
  if (/(回答|回复|语气|风格|结构化|先结论后步骤|answer|response|reply|tone|style|format)/i.test(normalized)) return 'style:response'
  if (/(文档|笔记|document|doc|note).*(更新|覆盖|替换|overwrite|replace|update)|(?:update|overwrite|replace).*(?:document|doc|note)/i.test(normalized)) {
    return 'preference:doc_update'
  }
  if (/(素材|物料|asset|material|creative).*(匹配|match|matching)|(?:match|matching).*(?:asset|material|creative)/i.test(normalized)) {
    return 'preference:material_matching'
  }
  return ''
}

function getProfileKeySemanticGroup(profileKey = '') {
  const key = normalizeProfileKeyName(profileKey)
  if (!key) return ''
  if (isNameLikeProfileKey(key)) return 'identity:name'
  const tokens = canonicalizeProfileKeyTokens(key)
  if (!tokens.length) return `key:${key}`
  if (tokens.includes('language')) return 'preference:language'
  if (tokens.includes('response') && tokens.includes('style')) return 'style:response'
  if (tokens.includes('document') && tokens.includes('update')) return 'preference:doc_update'
  if (tokens.includes('asset') && tokens.includes('match')) return 'preference:material_matching'
  return `generic:${tokens.sort().join('.')}`
}

function areProfileKeysCompatible(leftKey = '', rightKey = '') {
  const left = normalizeProfileKeyName(leftKey)
  const right = normalizeProfileKeyName(rightKey)
  if (!left || !right) return false
  if (left === right) return true
  const leftGroup = getProfileKeySemanticGroup(left)
  const rightGroup = getProfileKeySemanticGroup(right)
  return !!leftGroup && leftGroup === rightGroup
}

function getProfileSemanticIdentity(item) {
  if (!item) return ''
  const profileKey = normalizeProfileKeyName(item.profileKey)
  if (profileKey) {
    const semanticGroup = getProfileKeySemanticGroup(profileKey)
    if (semanticGroup) return `profile-group:${semanticGroup}`
    return `profile-key:${profileKey}`
  }
  const dedupeKey = normalizeIdentitySignature(item.dedupeKey)
  if (dedupeKey) return `profile-dedupe:${dedupeKey}`
  const inferredGroup = inferProfileSemanticGroupFromText(buildMemoryComparableText(item))
  if (inferredGroup) return `profile-group:${inferredGroup}`
  const comparableText = normalizeIdentitySignature(buildMemoryComparableText(item))
  return comparableText ? `profile-text:${comparableText}` : ''
}

function getMemorySemanticMergeScore(existing, incoming, config = getDefaultMemoryConfig()) {
  if (!existing || !incoming) return -1
  if (normalizeText(existing.id) && normalizeText(existing.id) === normalizeText(incoming.id)) return 2

  const laneA = getMemoryLane(existing)
  const laneB = getMemoryLane(incoming)
  if (laneA !== laneB) return -1

  const dedupeA = normalizeIdentitySignature(existing.dedupeKey)
  const dedupeB = normalizeIdentitySignature(incoming.dedupeKey)
  if (dedupeA && dedupeB && dedupeA === dedupeB) return 1.2

  const textA = buildMemoryComparableText(existing)
  const textB = buildMemoryComparableText(incoming)
  const signatureA = normalizeIdentitySignature(textA)
  const signatureB = normalizeIdentitySignature(textB)
  if (signatureA && signatureB && signatureA === signatureB) return 1.1

  const keywordOverlap = countTokenOverlap(collectKeywordTokens(textA), collectKeywordTokens(textB))
  const entityOverlap = countTokenOverlap(
    collectEntityLikeTokens(textA, { profileKey: existing.profileKey }),
    collectEntityLikeTokens(textB, { profileKey: incoming.profileKey })
  )
  const embeddingScore =
    existing.embedding.length && incoming.embedding.length ? cosineSimilarity(existing.embedding, incoming.embedding) : 0
  const containsEquivalentText = hasComparableSignatureContainment(signatureA, signatureB)

  if (laneA === 'profile') {
    const profileKeyA = normalizeProfileKeyName(existing.profileKey)
    const profileKeyB = normalizeProfileKeyName(incoming.profileKey)
    const exactSameProfileKey = !!profileKeyA && !!profileKeyB && profileKeyA === profileKeyB
    const compatibleProfileKey = areProfileKeysCompatible(profileKeyA, profileKeyB)
    const semanticGroupA = getProfileKeySemanticGroup(profileKeyA) || inferProfileSemanticGroupFromText(textA)
    const semanticGroupB = getProfileKeySemanticGroup(profileKeyB) || inferProfileSemanticGroupFromText(textB)

    if (!profileKeyA || !profileKeyB) {
      if (semanticGroupA && semanticGroupB && semanticGroupA !== semanticGroupB) return -1
      if (containsEquivalentText && keywordOverlap >= 2) return 0.99
      if (keywordOverlap >= 3 && embeddingScore >= PROFILE_MEMORY_MERGE_STRONG_SIMILARITY) return embeddingScore
      return -1
    }

    if (!compatibleProfileKey) {
      if (containsEquivalentText && keywordOverlap >= 2 && embeddingScore >= PROFILE_MEMORY_MERGE_STRONG_SIMILARITY) return embeddingScore
      return -1
    }

    if (isNameLikeProfileKey(profileKeyA) || isNameLikeProfileKey(profileKeyB)) {
      if (containsEquivalentText && entityOverlap >= 1) return 1.05
      if (entityOverlap >= 1 && embeddingScore >= 0.55) return 0.9
      return -1
    }

    const minSimilarity = Math.max(
      clampNumber(config?.minSimilarity, getDefaultMemoryConfig().minSimilarity, 0, 1) + 0.24,
      PROFILE_MEMORY_MERGE_MIN_SIMILARITY
    )
    if (containsEquivalentText && keywordOverlap >= 2) return 1.02
    if (!exactSameProfileKey && containsEquivalentText && keywordOverlap >= 1) return 1.01
    if (keywordOverlap >= 3 && embeddingScore >= minSimilarity) return embeddingScore
    if (keywordOverlap >= 2 && embeddingScore >= PROFILE_MEMORY_MERGE_STRONG_SIMILARITY) return embeddingScore
    return -1
  }

  if (normalizeText(existing.kind).toLowerCase() !== normalizeText(incoming.kind).toLowerCase()) return -1
  if (containsEquivalentText && keywordOverlap >= 2) return 0.96
  const minSimilarity = Math.max(
    clampNumber(config?.minSimilarity, getDefaultMemoryConfig().minSimilarity, 0, 1) + 0.5,
    RELEVANT_MEMORY_MERGE_MIN_SIMILARITY
  )
  if (keywordOverlap >= 3 && embeddingScore >= minSimilarity) return embeddingScore
  return -1
}

function findMemoryMergeCandidateIndex(items = [], candidate, config = getDefaultMemoryConfig()) {
  const list = Array.isArray(items) ? items : []
  const candidateStatus = normalizeText(candidate?.status).toLowerCase() || 'active'
  const identityKey = getMemoryIdentityKey(candidate)
  const exactIndex = list.findIndex((item) => {
    if (!item) return false
    if ((normalizeText(item.status).toLowerCase() || 'active') !== candidateStatus) return false
    return getMemoryIdentityKey(item) === identityKey
  })
  if (exactIndex >= 0) return exactIndex

  let bestIndex = -1
  let bestScore = -1
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index]
    if (!item) continue
    if ((normalizeText(item.status).toLowerCase() || 'active') !== candidateStatus) continue
    const score = getMemorySemanticMergeScore(item, candidate, config)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  }
  return bestScore > 0 ? bestIndex : -1
}

export function getMemoryIdentityKey(item) {
  if (!item) return ''
  const dedupeKey = normalizeIdentitySignature(item.dedupeKey)
  if (dedupeKey) return `dedupe:${dedupeKey}`
  const profileKey = normalizeProfileKeyName(item.profileKey)
  if (profileKey) return `${normalizeText(item.kind).toLowerCase()}:${profileKey}`
  return `${normalizeText(item.kind).toLowerCase()}:${normalizeIdentitySignature(item.summary || item.text)}`
}

export function dedupeMemoryItems(items = [], config = getDefaultMemoryConfig()) {
  const source = sortMemoryItems((Array.isArray(items) ? items : []).map((item) => normalizeMemoryItem(item)))
  const merged = []
  let mergedCount = 0

  for (const item of source) {
    if (!item || item.status === 'deleted') continue
    const existingIndex = findMemoryMergeCandidateIndex(merged, item, config)
    if (existingIndex === -1) {
      merged.push(item)
      continue
    }
    merged[existingIndex] = buildMergedMemoryItem(merged[existingIndex], item)
    mergedCount += 1
  }

  return {
    items: sortMemoryItems(merged.map((item) => normalizeMemoryItem(item))),
    stats: {
      inputCount: source.filter((item) => item && item.status !== 'deleted').length,
      outputCount: merged.length,
      mergedCount
    }
  }
}

async function markMemoryItemsUsed(ids = []) {
  const uniqueIds = normalizeStringList(ids)
  if (!uniqueIds.length) return null
  const store = await withStore()
  let changed = false
  for (const id of uniqueIds) {
    const index = store.items.findIndex((item) => String(item.id || '') === String(id))
    if (index === -1) continue
    store.items[index] = upsertMergedItem(store.items[index], {
      hitCount: (Number(store.items[index].hitCount) || 0) + 1,
      lastUsedAt: nowIso()
    })
    changed = true
  }
  if (!changed) return null
  store.updatedAt = nowIso()
  return await saveStoreToDisk(store)
}

async function upsertExtractedMemoryItems(extracted = [], config = getMemoryConfig()) {
  if (!Array.isArray(extracted) || !extracted.length) return []
  const store = await withStore()
  const nextItems = []

  for (const raw of extracted.slice(0, 20)) {
    const normalized = normalizeMemoryItem(raw)
    if (!normalized.text) continue
    if (normalized.confidence < config.minConfidence) continue
    normalized.embedding = await requestEmbeddingVector(
      `${normalized.kind}\n${normalized.summary || normalized.text}`.slice(0, MEMORY_EMBED_LIMIT),
      config.embedding
    ).catch(() => [])

    const existingIndex = findMemoryMergeCandidateIndex(store.items, normalized, config)

    if (existingIndex === -1) {
      store.items.push(normalized)
      nextItems.push(normalized)
      continue
    }

    store.items[existingIndex] = buildMergedMemoryItem(store.items[existingIndex], normalized)
    nextItems.push(store.items[existingIndex])
  }

  store.items = sortMemoryItems(store.items)
  store.updatedAt = nowIso()
  await saveStoreToDisk(store)
  scheduleAutoCleanMemoryStore()
  return nextItems
}

export async function ensureMemoryStore() {
  return await withStore()
}

export async function listMemoryItems(options = {}) {
  const store = await withStore()
  const lane = normalizeText(options?.lane).toLowerCase()
  const status = normalizeText(options?.status).toLowerCase()
  const items = sortMemoryItems((store.items || []).map((item) => normalizeMemoryItem(item)))
  return items.filter((item) => {
    if (lane && getMemoryLane(item) !== lane) return false
    if (status && item.status !== status) return false
    return true
  })
}

export async function getMemoryItemById(id) {
  const list = await listMemoryItems()
  return list.find((item) => String(item.id || '') === String(id || '')) || null
}

export async function upsertMemoryItem(item) {
  const store = await withStore()
  const next = normalizeMemoryItem(item)
  const config = getMemoryConfig()
  const directIndex = store.items.findIndex((row) => String(row.id || '') === String(next.id))
  const index = directIndex >= 0 ? directIndex : findMemoryMergeCandidateIndex(store.items, next, config)
  const previous = index >= 0 ? store.items[index] : null
  let merged = index === -1 ? next : buildMergedMemoryItem(store.items[index], next, { preferIncomingContent: directIndex === -1 })
  const shouldRefreshEmbedding =
    index === -1 ||
    !Array.isArray(merged.embedding) ||
    !merged.embedding.length ||
    previous?.text !== merged.text ||
    previous?.summary !== merged.summary ||
    previous?.kind !== merged.kind
  if (shouldRefreshEmbedding) {
    merged.embedding = await requestEmbeddingVector(
      `${merged.kind}\n${merged.summary || merged.text}`.slice(0, MEMORY_EMBED_LIMIT),
      config.embedding
    ).catch(() => merged.embedding || [])
  }
  if (index === -1) store.items.push(merged)
  else store.items[index] = merged
  store.items = sortMemoryItems(store.items)
  store.updatedAt = nowIso()
  const saved = await saveStoreToDisk(store)
  scheduleAutoCleanMemoryStore()
  return saved
}

export async function deleteMemoryItem(id) {
  const store = await withStore()
  store.items = store.items.filter((item) => String(item.id || '') !== String(id || ''))
  store.updatedAt = nowIso()
  return await saveStoreToDisk(store)
}

export async function updateMemoryItem(id, patch) {
  const store = await withStore()
  const index = store.items.findIndex((item) => String(item.id || '') === String(id || ''))
  if (index === -1) throw new Error('memory item not found')
  const merged = upsertMergedItem(store.items[index], patch)
  const config = getMemoryConfig()
  const shouldRefreshEmbedding =
    patch &&
    typeof patch === 'object' &&
    (Object.prototype.hasOwnProperty.call(patch, 'text') ||
      Object.prototype.hasOwnProperty.call(patch, 'summary') ||
      Object.prototype.hasOwnProperty.call(patch, 'kind'))
  if (shouldRefreshEmbedding) {
    merged.embedding = await requestEmbeddingVector(
      `${merged.kind}\n${merged.summary || merged.text}`.slice(0, MEMORY_EMBED_LIMIT),
      config.embedding
    ).catch(() => merged.embedding || [])
  }
  store.items[index] = merged
  store.items = sortMemoryItems(store.items)
  store.updatedAt = nowIso()
  const saved = await saveStoreToDisk(store)
  scheduleAutoCleanMemoryStore()
  return saved
}

export async function markMemoryItemUsed(id) {
  return await markMemoryItemsUsed([id])
}

export async function cleanMemoryStore() {
  const store = await withStore()
  const { items, stats } = dedupeMemoryItems(store.items || [], getMemoryConfig())
  store.items = items
  store.updatedAt = nowIso()
  const saved = await saveStoreToDisk(store)
  state.lastAutoCleanAt = nowMs()
  return { ...saved, stats }
}

export async function getResidentProfileItems(limit = getMemoryConfig().profileMaxItems) {
  const config = getMemoryConfig()
  const store = await withStore()
  const unique = dedupeBy(
    (store.items || [])
      .filter((item) => item.status === 'active' && getMemoryLane(item) === 'profile')
      .sort((a, b) => scoreProfileItem(b) - scoreProfileItem(a)),
    (item) => getProfileSemanticIdentity(item) || getMemoryIdentityKey(item)
  )
  return unique.slice(0, Math.max(1, Math.min(20, Number(limit || config.profileMaxItems || 1))))
}

export async function extractAndStoreMemory({ userText, assistantText, systemPrompt, candidates, autoClean = true } = {}) {
  const config = getMemoryConfig()
  if (!config.enabled || config.autoExtract === false) return []

  const conversationPairs = candidates && Array.isArray(candidates)
    ? normalizeConversationPairs(candidates)
    : normalizeConversationPairs([{ userText, assistantText }])
  if (!conversationPairs.length) return []

  const extracted = await requestMemoryExtraction({
    userText,
    assistantText,
    systemPrompt,
    selection: config.extraction,
    conversationPairs
  })
  const items = await upsertExtractedMemoryItems(extracted, config)
  if (autoClean && items.length) scheduleAutoCleanMemoryStore()
  return items
}

export async function recallMemory({ queryText, limit = 5, includeProfile = false, lane = '' } = {}) {
  const config = getMemoryConfig()
  if (!config.enabled) return []
  const store = await withStore()
  const query = normalizeText(queryText)
  if (!query) return []
  const targetLane = normalizeText(lane).toLowerCase()
  const queryChunks = buildRecallQueryChunks(query)
  const queryEmbeddings = await Promise.all(
    queryChunks.map((chunk) => requestEmbeddingVector(chunk.slice(0, MEMORY_EMBED_LIMIT), config.embedding).catch(() => []))
  )
  const candidates = (store.items || []).filter((item) => {
    const itemLane = getMemoryLane(item)
    if (item.status !== 'active') return false
    if (targetLane === 'profile') return itemLane === 'profile'
    if (targetLane === 'memory') return itemLane !== 'profile'
    if (targetLane === 'all' || includeProfile) return true
    return itemLane !== 'profile'
  })

  const scored = candidates
    .map((item) => {
      const itemLane = getMemoryLane(item)
      const score = itemLane === 'profile'
        ? scoreProfileItem(item, query)
        : queryChunks.reduce((best, chunk, index) => {
            const nextScore = scoreMemoryItem(item, queryEmbeddings[index] || [], chunk, config)
            return nextScore > best ? nextScore : best
          }, scoreMemoryItem(item, [], summarizeQueryForRecall(query), config))
      return {
        item: {
          ...item,
          lane: itemLane
        },
        score
      }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(MEMORY_CANDIDATE_LIMIT, Math.max(1, Math.round(limit || config.topK || 5))))

  const picked = []
  const pickedProfileKeys = new Set()
  for (const row of scored) {
    const item = row.item
    if (getMemoryLane(item) === 'profile') {
      const profileIdentity = getProfileSemanticIdentity(item) || getMemoryIdentityKey(item)
      if (pickedProfileKeys.has(profileIdentity)) continue
      pickedProfileKeys.add(profileIdentity)
    }
    picked.push({
      ...item,
      recallScore: row.score
    })
    if (picked.length >= Math.max(1, Math.round(limit || config.topK || 5))) break
  }
  return picked
}

export function buildMemoryContextBlock(input = [], options = {}) {
  const config = normalizeChatMemoryConfig(options.config || getMemoryConfig())
  const profileItems = Array.isArray(input)
    ? input.filter((item) => getMemoryLane(item) === 'profile')
    : Array.isArray(input?.profileItems)
      ? input.profileItems
      : []
  const relevantItems = Array.isArray(input)
    ? input.filter((item) => getMemoryLane(item) !== 'profile')
    : Array.isArray(input?.relevantItems)
      ? input.relevantItems
      : []

  const profileLines = dedupeBy(
    profileItems
      .filter((item) => item?.status === 'active')
      .map((item) => ({ id: item.id, text: buildRecallText(item), key: getProfileSemanticIdentity(item) || getMemoryIdentityKey(item) }))
      .filter((item) => item.text),
    (item) => item.key
  )
    .slice(0, config.profileMaxItems)
    .map((item) => item.text)

  const relevantLines = dedupeBy(
    relevantItems
      .filter((item) => item?.status !== 'deleted' && item?.status !== 'archived')
      .map((item) => ({ id: item.id, text: buildRecallText(item), key: getMemoryIdentityKey(item) }))
      .filter((item) => item.text),
    (item) => item.key
  )
    .slice(0, config.relevantMaxItems)
    .map((item) => item.text)

  const lines = []
  if (profileLines.length) {
    lines.push('用户画像与偏好：')
    lines.push(...profileLines.map((line) => `- ${line}`))
  }
  if (relevantLines.length) {
    lines.push('与当前问题相关的长期记忆：')
    lines.push(...relevantLines.map((line) => `- ${line}`))
  }
  return lines.join('\n').trim().slice(0, config.maxInjectChars)
}

export async function buildMemoryInjection({ queryText, userText, assistantText, systemPrompt, markUsed = true } = {}) {
  const config = getMemoryConfig()
  if (!config.enabled) return { items: [], profileItems: [], relevantItems: [], text: '' }

  const primaryQuery = normalizeText(queryText || userText || assistantText)
  const fallbackQuery = normalizeText([userText, assistantText].filter(Boolean).join('\n'))
  const relevantQuery =
    primaryQuery.length >= 6
      ? primaryQuery
      : normalizeText([primaryQuery, fallbackQuery].filter(Boolean).join('\n'))

  const residentProfileItems = await getResidentProfileItems(config.profileMaxItems)
  const queryProfileItems = relevantQuery
    ? await recallMemory({
        queryText: relevantQuery,
        limit: Math.max(config.profileMaxItems, 4),
        lane: 'profile'
      })
    : []
  const profileItems = dedupeBy(
    [...queryProfileItems, ...residentProfileItems],
    (item) => item.profileKey || item.id || getMemoryIdentityKey(item)
  ).slice(0, config.profileMaxItems)
  const relevantItems = relevantQuery
    ? await recallMemory({
        queryText: relevantQuery,
        limit: config.topK,
        lane: 'memory'
      })
    : []
  const allItems = dedupeBy([...profileItems, ...relevantItems], (item) => item.id || getMemoryIdentityKey(item))
  if (markUsed && allItems.length) {
    await markMemoryItemsUsed(allItems.map((item) => item.id)).catch(() => null)
  }
  const text = buildMemoryContextBlock({ profileItems, relevantItems }, { config })
  return { items: allItems, profileItems, relevantItems, text }
}

export function estimateMemoryCandidatePriority(userText, assistantText = '') {
  const user = normalizeText(userText)
  const assistant = normalizeText(assistantText)
  if (!user && !assistant) return 0
  if (user && LOW_SIGNAL_TURN_RE.test(user) && assistant.length < 80) return 0

  let score = 0.2
  if (STABLE_MEMORY_HINT_RE.test(user)) score += 0.65
  if (/(回答|回复|语气|简洁|详细|先给结论|代码|中文|英文|不要表格|不用表格)/i.test(user)) score += 0.2
  if (/(项目|框架|技术栈|仓库|接口|数据库|部署|环境)/i.test(user)) score += 0.14
  if (user.length >= 24) score += 0.08
  if (user.length >= 80) score += 0.08
  if (assistant.length >= 180) score += 0.06
  return clampNumber(score, 0, 0, 1.3)
}

function buildCandidateFingerprint(candidate) {
  return normalizeText(`${candidate.userText}\n${candidate.assistantText}`).toLowerCase()
}

export function normalizeMemoryCandidateRecord(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const userText = normalizeText(src.userText).slice(0, 3000)
  const assistantText = normalizeText(src.assistantText).slice(0, 4000)
  const summary = normalizeText(src.summary || userText || assistantText).slice(0, 600)
  const createdAt = safeDateMs(src.createdAt, nowMs()) || nowMs()
  const updatedAt = safeDateMs(src.updatedAt, createdAt) || createdAt
  const priority = clampNumber(
    src.priority,
    estimateMemoryCandidatePriority(userText, assistantText),
    0,
    1.3
  )
  return {
    id: normalizeText(src.id) || newId(),
    userText,
    assistantText,
    summary,
    systemPrompt: normalizeText(src.systemPrompt).slice(0, 2000),
    priority,
    forceImmediate: src.forceImmediate === true || priority >= 1,
    fingerprint: normalizeText(src.fingerprint) || buildCandidateFingerprint({ userText, assistantText }),
    createdAt,
    updatedAt
  }
}

export function createMemoryCandidateRecord(raw = {}) {
  const candidate = normalizeMemoryCandidateRecord(raw)
  if (!candidate.userText && !candidate.assistantText) return null
  if (candidate.userText && LOW_SIGNAL_TURN_RE.test(candidate.userText) && candidate.priority < 0.4) return null
  if (candidate.priority < 0.12 && candidate.summary.length < 24) return null
  return candidate
}

export function normalizeMemoryCandidateQueue(queue = []) {
  return (Array.isArray(queue) ? queue : [])
    .map((item) => normalizeMemoryCandidateRecord(item))
    .filter((item) => item.userText || item.assistantText)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function shouldFlushMemoryCandidates(queue = [], options = {}) {
  const list = normalizeMemoryCandidateQueue(queue)
  if (!list.length) return false
  if (options.force === true) return true
  if (list.some((item) => item.forceImmediate)) return true
  if (list.length >= Math.max(1, Number(options.batchSize || MEMORY_CANDIDATE_BATCH_SIZE))) return true
  const oldestAt = Math.min(...list.map((item) => safeDateMs(item.createdAt, nowMs())))
  const idleMs = Math.max(1000, Number(options.idleMs || MEMORY_CANDIDATE_IDLE_MS))
  return Date.now() - oldestAt >= idleMs
}

export function enqueueMemoryCandidate(queue = [], payload = {}, options = {}) {
  const normalizedQueue = normalizeMemoryCandidateQueue(queue)
  const candidate = createMemoryCandidateRecord(payload)
  if (!candidate) {
    return {
      queue: normalizedQueue,
      queued: null,
      changed: false,
      shouldFlush: shouldFlushMemoryCandidates(normalizedQueue, options)
    }
  }

  const next = [...normalizedQueue]
  const existingIndex = next.findIndex((item) => item.fingerprint && item.fingerprint === candidate.fingerprint)
  if (existingIndex >= 0) {
    const existing = next[existingIndex]
    next[existingIndex] = normalizeMemoryCandidateRecord({
      ...existing,
      ...candidate,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: nowMs(),
      priority: Math.max(Number(existing.priority || 0), Number(candidate.priority || 0)),
      forceImmediate: existing.forceImmediate === true || candidate.forceImmediate === true
    })
  } else {
    next.push(candidate)
  }

  next.sort((a, b) => {
    const pa = Number(b.priority || 0) - Number(a.priority || 0)
    if (pa !== 0) return pa
    return a.createdAt - b.createdAt
  })

  const trimmed = next.slice(0, MEMORY_CANDIDATE_MAX).sort((a, b) => a.createdAt - b.createdAt)
  return {
    queue: trimmed,
    queued: candidate,
    changed: true,
    shouldFlush: shouldFlushMemoryCandidates(trimmed, options)
  }
}

export async function flushMemoryCandidates({ candidates, systemPrompt, force = false } = {}) {
  const queue = normalizeMemoryCandidateQueue(candidates)
  if (!queue.length) {
    return { flushed: false, items: [], remaining: [] }
  }
  const config = getMemoryConfig()
  if (!config.enabled || config.autoExtract === false) {
    return { flushed: true, items: [], remaining: [] }
  }
  if (!force && !shouldFlushMemoryCandidates(queue)) {
    return { flushed: false, items: [], remaining: queue }
  }

  const items = await extractAndStoreMemory({
    candidates: queue,
    systemPrompt: normalizeText(systemPrompt) || normalizeText(queue[queue.length - 1]?.systemPrompt),
    autoClean: true
  }).catch(() => null)

  if (!Array.isArray(items)) {
    return {
      flushed: false,
      items: [],
      remaining: queue
    }
  }

  return {
    flushed: true,
    items,
    remaining: []
  }
}

export async function manageMemoryStore(action, payload = {}) {
  if (action === 'list') return await listMemoryItems(payload)
  if (action === 'update') return await updateMemoryItem(payload.id, payload.patch || {})
  if (action === 'delete') return await deleteMemoryItem(payload.id)
  if (action === 'upsert') return await upsertMemoryItem(payload.item || {})
  if (action === 'clean') return await cleanMemoryStore()
  if (action === 'open') {
    await ensureRoot()
    return await openInFileManager(MEMORY_ROOT)
  }
  if (action === 'resolve') {
    await ensureRoot()
    return await resolvePath(MEMORY_ROOT)
  }
  throw new Error(`unsupported memory action: ${action}`)
}

export async function rebuildMemoryEmbeddings() {
  const store = await withStore()
  const config = getMemoryConfig()
  for (const item of store.items || []) {
    if (!item || item.status !== 'active') continue
    item.embedding = await requestEmbeddingVector(
      `${item.kind}\n${item.summary || item.text}`.slice(0, MEMORY_EMBED_LIMIT),
      config.embedding
    ).catch(() => [])
    item.updatedAt = nowIso()
  }
  store.items = sortMemoryItems(store.items)
  store.updatedAt = nowIso()
  const saved = await saveStoreToDisk(store)
  scheduleAutoCleanMemoryStore()
  return saved
}

export async function getMemoryRootPath() {
  const root = String(getDataStorageRoot().value || '').trim()
  return root ? `${root}/${MEMORY_ROOT}`.replace(/\\/g, '/') : ''
}

export async function isMemoryAvailable() {
  return isEnabled()
}

export async function ensureMemoryEnabledConfig() {
  const cfg = getMemoryConfig()
  if (cfg.enabled) return cfg
  const next = normalizeChatMemoryConfig({ ...cfg, enabled: true })
  await updateChatConfig({ memory: next })
  return next
}
