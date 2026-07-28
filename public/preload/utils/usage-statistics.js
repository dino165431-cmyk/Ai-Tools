const path = require('path')
const fs = require('fs').promises
const globalConfig = require('./global-config')

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const VALID_GROUPS = new Set(['hour', 'day', 'month'])
const USAGE_SCHEMA_VERSION = 2

function finiteNonNegative(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function firstPresent(...values) {
  return values.find(hasValue)
}

function hasAnyPresent(...values) {
  return values.some(hasValue)
}

function normalizeUsage(raw = {}) {
  const usageMetadata = raw.usageMetadata && typeof raw.usageMetadata === 'object'
    ? raw.usageMetadata
    : raw.usage_metadata && typeof raw.usage_metadata === 'object'
      ? raw.usage_metadata
      : {}
  const inputDetails = raw.input_tokens_details && typeof raw.input_tokens_details === 'object'
    ? raw.input_tokens_details
    : {}
  const promptDetails = raw.prompt_tokens_details && typeof raw.prompt_tokens_details === 'object'
    ? raw.prompt_tokens_details
    : {}
  const outputDetails = raw.output_tokens_details && typeof raw.output_tokens_details === 'object'
    ? raw.output_tokens_details
    : {}
  const completionDetails = raw.completion_tokens_details && typeof raw.completion_tokens_details === 'object'
    ? raw.completion_tokens_details
    : {}

  const cacheReadRaw = firstPresent(
    raw.cacheReadTokens,
    raw.cachedTokens,
    raw.cached_tokens,
    inputDetails.cached_tokens,
    promptDetails.cached_tokens,
    raw.prompt_cache_hit_tokens,
    raw.cache_read_input_tokens,
    raw.cachedContentTokenCount,
    raw.cached_content_token_count,
    usageMetadata.cachedContentTokenCount,
    usageMetadata.cached_content_token_count
  )
  const cacheWriteRaw = firstPresent(
    raw.cacheWriteTokens,
    raw.cache_write_tokens,
    inputDetails.cache_write_tokens,
    promptDetails.cache_write_tokens,
    raw.cache_creation_input_tokens
  )
  const cachedTokens = finiteNonNegative(
    cacheReadRaw
  )
  const cacheWriteTokens = finiteNonNegative(cacheWriteRaw)

  const canonicalInputRaw = firstPresent(raw.inputTokens, raw.prompt_tokens)
  const providerInputRaw = firstPresent(
    raw.input_tokens,
    raw.promptTokenCount,
    raw.prompt_token_count,
    usageMetadata.promptTokenCount,
    usageMetadata.prompt_token_count
  )
  const hasAnthropicBreakdown =
    hasValue(raw.cache_read_input_tokens) || hasValue(raw.cache_creation_input_tokens)
  const inputTokens = hasValue(canonicalInputRaw)
    ? finiteNonNegative(canonicalInputRaw)
    : hasAnthropicBreakdown && hasValue(raw.input_tokens)
      ? finiteNonNegative(raw.input_tokens) + finiteNonNegative(raw.cache_read_input_tokens) +
        finiteNonNegative(raw.cache_creation_input_tokens)
      : finiteNonNegative(providerInputRaw)
  const outputTokens = finiteNonNegative(firstPresent(
    raw.outputTokens,
    raw.output_tokens,
    raw.completion_tokens,
    raw.candidatesTokenCount,
    raw.candidates_token_count,
    usageMetadata.candidatesTokenCount,
    usageMetadata.candidates_token_count
  ))
  const reasoningTokens = finiteNonNegative(firstPresent(
    raw.reasoningTokens,
    outputDetails.reasoning_tokens,
    completionDetails.reasoning_tokens,
    raw.thoughtsTokenCount,
    raw.thoughts_token_count,
    usageMetadata.thoughtsTokenCount,
    usageMetadata.thoughts_token_count
  ))
  const explicitUncachedInputRaw = firstPresent(
    raw.uncachedInputTokens,
    raw.prompt_cache_miss_tokens,
    hasAnthropicBreakdown ? raw.input_tokens : undefined
  )
  const uncachedInputTokens = hasValue(explicitUncachedInputRaw)
    ? finiteNonNegative(explicitUncachedInputRaw)
    : Math.max(0, inputTokens - cachedTokens)
  const totalTokens = finiteNonNegative(firstPresent(
    raw.totalTokens,
    raw.total_tokens,
    raw.totalTokenCount,
    raw.total_token_count,
    usageMetadata.totalTokenCount,
    usageMetadata.total_token_count
  )) || inputTokens + outputTokens

  const hasCacheReadField = hasAnyPresent(
    raw.cacheReadTokens,
    raw.cached_tokens,
    inputDetails.cached_tokens,
    promptDetails.cached_tokens,
    raw.prompt_cache_hit_tokens,
    raw.cache_read_input_tokens,
    raw.cachedContentTokenCount,
    raw.cached_content_token_count,
    usageMetadata.cachedContentTokenCount,
    usageMetadata.cached_content_token_count
  )
  const cacheReported = typeof raw.cacheReported === 'boolean'
    ? raw.cacheReported
    : hasCacheReadField || (
        hasValue(raw.cachedTokens) &&
        (Number(raw.usageSchemaVersion) >= USAGE_SCHEMA_VERSION || cachedTokens > 0)
      )
  const cacheWriteReported = typeof raw.cacheWriteReported === 'boolean'
    ? raw.cacheWriteReported
    : hasAnyPresent(
        raw.cacheWriteTokens,
        raw.cache_write_tokens,
        inputDetails.cache_write_tokens,
        promptDetails.cache_write_tokens,
        raw.cache_creation_input_tokens
      ) || (
        hasValue(raw.cacheWriteTokens) &&
        (Number(raw.usageSchemaVersion) >= USAGE_SCHEMA_VERSION || cacheWriteTokens > 0)
      )

  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    cacheWriteTokens,
    uncachedInputTokens,
    reasoningTokens,
    totalTokens,
    cacheReported,
    cacheWriteReported
  }
}

function getUsageDirectory() {
  const root = String(globalConfig.getDataStorageRoot?.() || '').trim()
  if (!root || !path.isAbsolute(root)) throw new Error('dataStorageRoot is not configured')
  return path.join(path.resolve(root), '.ai-tools-settings', 'usage')
}

function startOfLocalMonth(timestamp = Date.now()) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
}

function startOfNextLocalMonth(timestamp = Date.now()) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
}

function parseTimestamp(value) {
  if (value === '' || value === null || value === undefined) return null
  const timestamp = typeof value === 'number' ? value : Date.parse(String(value))
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeSummaryRange(options = {}, now = Date.now()) {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(String(options.month || ''))
  let defaultStart = startOfLocalMonth(now)
  let defaultEnd = startOfNextLocalMonth(now)
  if (monthMatch) {
    defaultStart = new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1).getTime()
    defaultEnd = new Date(Number(monthMatch[1]), Number(monthMatch[2]), 1).getTime()
  }

  const startAt = parseTimestamp(options.startAt) ?? defaultStart
  let endAt = parseTimestamp(options.endAt) ?? defaultEnd
  if (endAt <= startAt) endAt = startAt + DAY_MS

  const duration = endAt - startAt
  let groupBy = VALID_GROUPS.has(options.groupBy) ? options.groupBy : duration <= 2 * DAY_MS ? 'hour' : 'day'
  // 避免一次生成数千个图表点，长时间范围自动采用更合适的粒度。
  if (groupBy === 'hour' && duration > 31 * DAY_MS) groupBy = 'day'
  if (groupBy === 'day' && duration > 3 * 366 * DAY_MS) groupBy = 'month'

  return { startAt, endAt, groupBy }
}

function floorBucketTimestamp(timestamp, groupBy) {
  const date = new Date(timestamp)
  if (groupBy === 'month') {
    date.setDate(1)
    date.setHours(0, 0, 0, 0)
  } else if (groupBy === 'day') {
    date.setHours(0, 0, 0, 0)
  } else {
    date.setMinutes(0, 0, 0)
  }
  return date.getTime()
}

function nextBucketTimestamp(timestamp, groupBy) {
  const date = new Date(timestamp)
  if (groupBy === 'month') date.setMonth(date.getMonth() + 1)
  else if (groupBy === 'day') date.setDate(date.getDate() + 1)
  else date.setHours(date.getHours() + 1)
  return date.getTime()
}

function createUsageAggregate() {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    uncachedInputTokens: 0,
    reasoningTokens: 0,
    cacheReportedRequests: 0,
    cacheWriteReportedRequests: 0,
    cacheReportedInputTokens: 0,
    totalTokens: 0
  }
}

function addUsage(target, usage) {
  target.requests += 1
  target.inputTokens += usage.inputTokens
  target.outputTokens += usage.outputTokens
  target.cachedTokens += usage.cachedTokens
  target.cacheWriteTokens += usage.cacheWriteTokens
  target.uncachedInputTokens += usage.uncachedInputTokens
  target.reasoningTokens += usage.reasoningTokens
  if (usage.cacheReported) {
    target.cacheReportedRequests += 1
    target.cacheReportedInputTokens += usage.inputTokens
  }
  if (usage.cacheWriteReported) target.cacheWriteReportedRequests += 1
  target.totalTokens += usage.totalTokens
}

function createSeries(range) {
  const series = []
  let cursor = floorBucketTimestamp(range.startAt, range.groupBy)
  while (cursor < range.endAt) {
    series.push({
      timestamp: new Date(cursor).toISOString(),
      ...createUsageAggregate()
    })
    cursor = nextBucketTimestamp(cursor, range.groupBy)
  }
  return series
}

function summarizeEntries(entries = [], options = {}) {
  const range = normalizeSummaryRange(options, options.now)
  const summary = {
    startAt: new Date(range.startAt).toISOString(),
    endAt: new Date(range.endAt).toISOString(),
    groupBy: range.groupBy,
    ...createUsageAggregate(),
    byModel: {},
    series: createSeries(range)
  }
  const seriesByTimestamp = new Map(
    summary.series.map((item) => [Date.parse(item.timestamp), item])
  )

  for (const entry of Array.isArray(entries) ? entries : []) {
    const timestamp = parseTimestamp(entry?.timestamp)
    if (timestamp === null || timestamp < range.startAt || timestamp >= range.endAt) continue

    const usage = normalizeUsage(entry)
    const modelName = String(entry.model || '未知模型').trim() || '未知模型'
    addUsage(summary, usage)

    const model = summary.byModel[modelName] ||= createUsageAggregate()
    addUsage(model, usage)

    const bucketTimestamp = floorBucketTimestamp(timestamp, range.groupBy)
    const bucket = seriesByTimestamp.get(bucketTimestamp)
    if (bucket) addUsage(bucket, usage)
  }

  return summary
}

function listUtcMonthKeys(startAt, endAt) {
  const keys = []
  const finalTimestamp = Math.max(startAt, endAt - 1)
  let cursor = Date.UTC(new Date(startAt).getUTCFullYear(), new Date(startAt).getUTCMonth(), 1)
  const final = Date.UTC(new Date(finalTimestamp).getUTCFullYear(), new Date(finalTimestamp).getUTCMonth(), 1)
  while (cursor <= final) {
    keys.push(new Date(cursor).toISOString().slice(0, 7))
    const date = new Date(cursor)
    cursor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  }
  return keys
}

async function readUsageEntries(range) {
  const directory = getUsageDirectory()
  const chunks = await Promise.all(listUtcMonthKeys(range.startAt, range.endAt).map(async (month) => {
    try {
      return await fs.readFile(path.join(directory, `${month}.jsonl`), 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return ''
      throw error
    }
  }))

  const entries = []
  for (const text of chunks) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        // 单条损坏记录不应阻断整份统计。
      }
    }
  }
  return entries
}

async function recordUsage(entry = {}) {
  const usage = normalizeUsage(entry.usage || entry)
  if (
    !usage.totalTokens &&
    !usage.inputTokens &&
    !usage.outputTokens &&
    !usage.cachedTokens &&
    !usage.cacheWriteTokens
  ) {
    return { recorded: false }
  }
  const now = new Date()
  const month = now.toISOString().slice(0, 7)
  const directory = getUsageDirectory()
  await fs.mkdir(directory, { recursive: true })
  const payload = {
    usageSchemaVersion: USAGE_SCHEMA_VERSION,
    timestamp: now.toISOString(),
    providerId: String(entry.providerId || '').trim(),
    model: String(entry.model || '').trim(),
    endpoint: String(entry.endpoint || '').trim(),
    purpose: String(entry.purpose || '').trim(),
    ...usage
  }
  await fs.appendFile(path.join(directory, `${month}.jsonl`), `${JSON.stringify(payload)}\n`, 'utf8')
  return { recorded: true, ...payload }
}

async function getUsageSummary(options = {}) {
  const range = normalizeSummaryRange(options)
  const entries = await readUsageEntries(range)
  return summarizeEntries(entries, range)
}

module.exports = {
  recordUsage,
  getUsageSummary,
  _test: {
    normalizeUsage,
    normalizeSummaryRange,
    floorBucketTimestamp,
    listUtcMonthKeys,
    summarizeEntries
  }
}
