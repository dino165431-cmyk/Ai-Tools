import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildToolVisionUserMessage,
  buildVisionFallbackTextFromContent,
  messageContentHasImageUrl,
  shouldAutoAttachToolImagesForVision,
  shouldFallbackVisionInputToText
} from '../src/utils/toolVisionContext.js'

test('shouldAutoAttachToolImagesForVision detects image-analysis intent', () => {
  assert.equal(shouldAutoAttachToolImagesForVision('帮我看下这张图片里写了什么'), true)
  assert.equal(shouldAutoAttachToolImagesForVision('请描述图中内容'), true)
  assert.equal(shouldAutoAttachToolImagesForVision('帮我生成一张图片海报'), false)
})

test('messageContentHasImageUrl detects multimodal content', () => {
  assert.equal(messageContentHasImageUrl([{ type: 'text', text: 'hi' }]), false)
  assert.equal(messageContentHasImageUrl([{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }]), true)
})

test('buildVisionFallbackTextFromContent preserves text and notes omitted images', () => {
  const text = buildVisionFallbackTextFromContent([
    { type: 'text', text: '请结合图片回答' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }
  ], { reason: '当前接口不支持 image_url' })

  assert.match(text, /请结合图片回答/)
  assert.match(text, /图片已省略/)
})

test('buildToolVisionUserMessage creates synthetic multimodal user context', () => {
  const msg = buildToolVisionUserMessage({
    serverName: '内置笔记',
    toolName: 'notes_read',
    userPrompt: '请分析图片内容',
    images: [
      { name: 'note-image', src: 'data:image/png;base64,abc123', mime: 'image/png' }
    ]
  })

  assert.equal(msg.role, 'user')
  assert.equal(msg.synthetic_tool_vision, true)
  assert.equal(Array.isArray(msg.content), true)
  assert.equal(msg.content[1].type, 'image_url')
  assert.match(msg.vision_fallback_text, /图片已省略/)
})

test('buildToolVisionUserMessage keeps data URLs near the 2MB source-image limit', () => {
  const payload = Buffer.alloc(2 * 1024 * 1024 - 64, 97).toString('base64')
  const msg = buildToolVisionUserMessage({
    serverName: '内置笔记',
    toolName: 'notes_read',
    userPrompt: '请分析图片内容',
    images: [
      { name: 'large-note-image', src: `data:image/png;base64,${payload}`, mime: 'image/png' }
    ]
  })

  assert.ok(msg)
  assert.equal(msg.content.filter((part) => part?.type === 'image_url').length, 1)
  assert.match(msg.vision_fallback_text, /共 1 张/)
})

test('shouldFallbackVisionInputToText detects common unsupported-image errors', () => {
  assert.equal(shouldFallbackVisionInputToText('invalid content part: image_url is not supported'), true)
  assert.equal(shouldFallbackVisionInputToText('This model does not support image inputs.'), true)
  assert.equal(shouldFallbackVisionInputToText('当前模型不支持图片输入，仅支持文本。'), true)
  assert.equal(shouldFallbackVisionInputToText('rate limit exceeded'), false)
})
