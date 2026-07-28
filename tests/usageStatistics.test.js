import assert from 'node:assert/strict'
import test from 'node:test'

import usageStatistics from '../public/preload/utils/usage-statistics.js'

test('usage statistics normalizes chat completions and responses token fields', () => {
  assert.deepEqual(
    usageStatistics._test.normalizeUsage({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      prompt_tokens_details: { cached_tokens: 3 }
    }),
    {
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 3,
      cacheWriteTokens: 0,
      uncachedInputTokens: 7,
      reasoningTokens: 0,
      totalTokens: 15,
      cacheReported: true,
      cacheWriteReported: false
    }
  )
  assert.deepEqual(
    usageStatistics._test.normalizeUsage({
      input_tokens: 8,
      output_tokens: 2,
      input_tokens_details: { cached_tokens: 4 }
    }),
    {
      inputTokens: 8,
      outputTokens: 2,
      cachedTokens: 4,
      cacheWriteTokens: 0,
      uncachedInputTokens: 4,
      reasoningTokens: 0,
      totalTokens: 10,
      cacheReported: true,
      cacheWriteReported: false
    }
  )
})

test('usage statistics normalizes DeepSeek cache hit and miss fields', () => {
  assert.deepEqual(
    usageStatistics._test.normalizeUsage({
      prompt_tokens: 1000,
      completion_tokens: 100,
      total_tokens: 1100,
      prompt_cache_hit_tokens: 800,
      prompt_cache_miss_tokens: 200
    }),
    {
      inputTokens: 1000,
      outputTokens: 100,
      cachedTokens: 800,
      cacheWriteTokens: 0,
      uncachedInputTokens: 200,
      reasoningTokens: 0,
      totalTokens: 1100,
      cacheReported: true,
      cacheWriteReported: false
    }
  )
})

test('usage statistics normalizes Anthropic cache reads and writes into total input', () => {
  assert.deepEqual(
    usageStatistics._test.normalizeUsage({
      input_tokens: 50,
      output_tokens: 20,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 50
    }),
    {
      inputTokens: 1000,
      outputTokens: 20,
      cachedTokens: 900,
      cacheWriteTokens: 50,
      uncachedInputTokens: 50,
      reasoningTokens: 0,
      totalTokens: 1020,
      cacheReported: true,
      cacheWriteReported: true
    }
  )
})

test('usage statistics normalizes Gemini usage metadata passed directly', () => {
  assert.deepEqual(
    usageStatistics._test.normalizeUsage({
      promptTokenCount: 120,
      candidatesTokenCount: 30,
      cachedContentTokenCount: 70,
      thoughtsTokenCount: 12,
      totalTokenCount: 150
    }),
    {
      inputTokens: 120,
      outputTokens: 30,
      cachedTokens: 70,
      cacheWriteTokens: 0,
      uncachedInputTokens: 50,
      reasoningTokens: 12,
      totalTokens: 150,
      cacheReported: true,
      cacheWriteReported: false
    }
  )
})

test('usage statistics distinguishes legacy unknown cache data from reported zero', () => {
  const startAt = new Date(2026, 6, 1, 0, 0, 0, 0).getTime()
  const endAt = new Date(2026, 6, 2, 0, 0, 0, 0).getTime()
  const summary = usageStatistics._test.summarizeEntries([
    {
      timestamp: new Date(2026, 6, 1, 9, 0).toISOString(),
      model: 'legacy',
      inputTokens: 100,
      outputTokens: 10,
      cachedTokens: 0,
      totalTokens: 110
    },
    {
      usageSchemaVersion: 2,
      timestamp: new Date(2026, 6, 1, 10, 0).toISOString(),
      model: 'reported',
      inputTokens: 200,
      outputTokens: 20,
      cachedTokens: 0,
      cacheReported: true,
      totalTokens: 220
    }
  ], {
    startAt,
    endAt,
    groupBy: 'day'
  })

  assert.equal(summary.requests, 2)
  assert.equal(summary.cacheReportedRequests, 1)
  assert.equal(summary.cacheReportedInputTokens, 200)
  assert.equal(summary.byModel.legacy.cacheReportedRequests, 0)
  assert.equal(summary.byModel.reported.cacheReportedRequests, 1)
})

test('usage statistics filters the selected range and builds a continuous time series', () => {
  const startAt = new Date(2026, 6, 1, 0, 0, 0, 0).getTime()
  const endAt = new Date(2026, 6, 3, 0, 0, 0, 0).getTime()
  const summary = usageStatistics._test.summarizeEntries([
    {
      timestamp: new Date(2026, 6, 1, 9, 15).toISOString(),
      model: 'gpt-a',
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120
    },
    {
      timestamp: new Date(2026, 6, 1, 18, 30).toISOString(),
      model: 'gpt-b',
      input_tokens: 50,
      output_tokens: 10,
      total_tokens: 60
    },
    {
      timestamp: new Date(2026, 5, 30, 23, 59).toISOString(),
      model: 'outside-range',
      total_tokens: 999
    }
  ], {
    startAt,
    endAt,
    groupBy: 'day'
  })

  assert.equal(summary.requests, 2)
  assert.equal(summary.totalTokens, 180)
  assert.equal(summary.series.length, 2)
  assert.equal(summary.series[0].requests, 2)
  assert.equal(summary.series[0].totalTokens, 180)
  assert.equal(summary.series[1].requests, 0)
  assert.deepEqual(Object.keys(summary.byModel).sort(), ['gpt-a', 'gpt-b'])
})

test('usage statistics chooses a safe granularity for long ranges', () => {
  const startAt = new Date(2025, 0, 1).getTime()
  const endAt = new Date(2026, 0, 1).getTime()
  const range = usageStatistics._test.normalizeSummaryRange({
    startAt,
    endAt,
    groupBy: 'hour'
  })

  assert.equal(range.groupBy, 'day')
  assert.deepEqual(
    usageStatistics._test.listUtcMonthKeys(Date.UTC(2026, 0, 31), Date.UTC(2026, 2, 1)),
    ['2026-01', '2026-02']
  )
})
