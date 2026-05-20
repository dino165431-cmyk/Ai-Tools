import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyMediaGenerationPresetToInput,
  buildMediaGenerationPresetOptions
} from '../src/utils/chatMediaPresets.js'

function flattenPresetOptions(options) {
  return (Array.isArray(options) ? options : []).flatMap((item) => {
    if (Array.isArray(item?.children)) return item.children
    return item ? [item] : []
  })
}

test('buildMediaGenerationPresetOptions exposes image and video preset labels', () => {
  const options = buildMediaGenerationPresetOptions()
  assert.ok(options.some((item) => item.type === 'group' && item.key === 'image-presets' && item.label === '图片'))
  assert.ok(options.some((item) => item.type === 'group' && item.key === 'video-presets' && item.label === '视频'))

  const flat = flattenPresetOptions(options)
  assert.ok(flat.some((item) => item.key === 'image-cover' && item.label === '封面图'))
  assert.ok(flat.some((item) => item.key === 'image-product-shot' && item.label === '商品主图'))
  assert.ok(flat.some((item) => item.key === 'video-short' && item.label === '短视频'))
  assert.ok(flat.some((item) => item.key === 'video-product-demo' && item.label === '产品演示'))
  assert.equal(flat.some((item) => item.key === 'video-square-social'), false)
})

test('applyMediaGenerationPresetToInput prefixes trimmed prompt and returns media kind', () => {
  const image = applyMediaGenerationPresetToInput('  一只猫  ', 'image-avatar')
  assert.equal(image.kind, 'image')
  assert.equal(image.text, '头像，1:1，主体清晰，干净背景：一只猫')
  assert.equal(image.paramsEnabled, true)
  assert.deepEqual(image.params, { size: '1024x1024' })

  const video = applyMediaGenerationPresetToInput('', 'video-short')
  assert.equal(video.kind, 'video')
  assert.equal(video.text, '短视频，9:16，4 秒，镜头运动自然，主体清晰：')
  assert.equal(video.paramsEnabled, true)
  assert.deepEqual(video.params, { size: '720x1280', aspect_ratio: '9:16', duration: 4 })
})

test('common media presets return explicit request parameters', () => {
  const poster = applyMediaGenerationPresetToInput('活动发布', 'image-poster')
  assert.equal(poster.kind, 'image')
  assert.equal(poster.paramsEnabled, true)
  assert.deepEqual(poster.params, { size: '1024x1536', quality: 'high' })

  const demo = applyMediaGenerationPresetToInput('智能水杯', 'video-product-demo')
  assert.equal(demo.kind, 'video')
  assert.equal(demo.paramsEnabled, true)
  assert.deepEqual(demo.params, { size: '1280x720', aspect_ratio: '16:9', duration: 8 })
})
