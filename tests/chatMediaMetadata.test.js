import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildImageMetaLine,
  buildVideoMetaLine,
  imageMetaLabel,
  videoMetaLabel
} from '../src/utils/chatMediaMetadata.js'

test('buildImageMetaLine formats request size and generation timing metadata', () => {
  const meta = buildImageMetaLine({
    mime: 'image/png',
    size: 2048,
    requestSize: '1024x1024',
    generationTimeMs: 12500
  })

  assert.equal(meta, 'PNG · 2.00 KB · 请求尺寸：1024x1024 · 生成用时：13s')
})

test('buildVideoMetaLine formats resolution, duration, and elapsed metadata', () => {
  const meta = buildVideoMetaLine({
    mime: 'video/mp4',
    size: 1024 * 1024,
    resolution: '1920x1080',
    durationSeconds: 6,
    generationTimeMs: 45000
  })

  assert.equal(meta, 'MP4 · 1.00 MB · 分辨率：1920 x 1080 · 时长：6s · 生成用时：45s')
})

test('media label helpers prefer existing metaLine before rebuilding metadata', () => {
  assert.equal(imageMetaLabel({ metaLine: '自定义图片信息', mime: 'image/png' }), '自定义图片信息')
  assert.equal(videoMetaLabel({ metaLine: '自定义视频信息', mime: 'video/mp4' }), '自定义视频信息')
})
