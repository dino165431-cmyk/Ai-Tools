import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildImageGenerationManualRequestOptions,
  buildMediaGenerationManualRequestOptions,
  buildVideoGenerationManualRequestOptions,
  normalizeImageGenerationParams,
  normalizeVideoGenerationParams,
  summarizeImageGenerationParams,
  summarizeVideoGenerationParams,
  VIDEO_GENERATION_ASPECT_RATIO_OPTIONS
} from '../src/utils/chatMediaGenerationParams.js'

test('manual media params omit defaults unless explicitly enabled', () => {
  assert.deepEqual(buildMediaGenerationManualRequestOptions('image', false, { size: '1024x1024' }), {})
  assert.deepEqual(buildMediaGenerationManualRequestOptions('video', false, { duration: 5 }), {})
})

test('image params normalize and compact request options', () => {
  assert.deepEqual(normalizeImageGenerationParams({ size: '1024 × 1536', quality: 'high' }), {
    size: '1024x1536',
    quality: 'high'
  })
  assert.deepEqual(buildImageGenerationManualRequestOptions({ size: '1024x1536', quality: 'auto' }), {
    size: '1024x1536'
  })
  assert.deepEqual(buildImageGenerationManualRequestOptions({ size: '1792x1024', quality: 'hd' }), {})
})

test('video params normalize and compact request options', () => {
  assert.equal(normalizeVideoGenerationParams({}).duration, null)
  assert.deepEqual(normalizeVideoGenerationParams({ resolution: '720x1280', aspectRatio: '9:16', duration: 5.4, quality: 'hd' }), {
    size: '720x1280',
    aspect_ratio: '9:16',
    duration: 4,
    quality: 'hd'
  })
  assert.deepEqual(buildVideoGenerationManualRequestOptions({ size: '720x1280', aspect_ratio: '9:16', duration: 5, quality: 'auto' }), {
    size: '720x1280',
    seconds: 4
  })
  assert.deepEqual(buildVideoGenerationManualRequestOptions({ size: '1024x1024', duration: 10 }), {
    seconds: 8
  })
  assert.equal(normalizeVideoGenerationParams({ aspectRatio: '1:1' }).aspect_ratio, 'auto')
  assert.equal(VIDEO_GENERATION_ASPECT_RATIO_OPTIONS.some((item) => item.value === '1:1'), false)
})

test('media param summaries distinguish defaults from manual values', () => {
  assert.equal(summarizeImageGenerationParams(false, { size: '1024x1024' }), '使用模型默认')
  assert.equal(summarizeImageGenerationParams(true, { size: '1024x1024', quality: 'high' }), '1024x1024 · 质量 高')
  assert.equal(summarizeVideoGenerationParams(true, { size: '720x1280', aspect_ratio: '9:16', duration: 5 }), '720x1280 · 4s')
})
