import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractImageGenerationTextResult,
  extractImageOutputEntries,
  extractVideoOutputEntries,
  reconcilePersistedSandboxToolImages
} from '../src/utils/chatImageGeneration.js'

test('extractImageGenerationTextResult reads text-only responses payloads', () => {
  const payload = {
    object: 'response',
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: '先给出一段文字说明。' }]
      }
    ]
  }

  assert.equal(extractImageGenerationTextResult(payload), '先给出一段文字说明。')
})

test('extractImageGenerationTextResult ignores image-only payload fields', () => {
  const payload = {
    created: 123,
    data: [
      {
        b64_json: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8'
      }
    ]
  }

  assert.equal(extractImageGenerationTextResult(payload), '')
})

test('extractImageGenerationTextResult deduplicates repeated text parts', () => {
  const payload = {
    output_text: '同一段文本',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: '同一段文本' }]
      }
    ]
  }

  assert.equal(extractImageGenerationTextResult(payload), '同一段文本')
})

test('extractImageOutputEntries preserves image metadata from provider payloads', () => {
  const payload = {
    created: 1760000000,
    data: [
      {
        url: 'https://cdn.example.test/image.png',
        width: 1536,
        height: 1024,
        size_bytes: 345678,
        generation_time_ms: 12000
      }
    ]
  }

  const images = extractImageOutputEntries(payload)
  assert.equal(images.length, 1)
  assert.equal(images[0].width, 1536)
  assert.equal(images[0].height, 1024)
  assert.equal(images[0].size, 345678)
  assert.equal(images[0].generationTimeMs, 12000)
  assert.equal(images[0].createdAt, '1760000000')
})

test('extractImageOutputEntries treats OpenAI image stream event type as metadata, not MIME', () => {
  const b64 = Buffer.from(`stream-final-${'x'.repeat(160)}`).toString('base64')
  const payload = {
    type: 'image_generation.completed',
    b64_json: b64,
    output_format: 'png'
  }

  const images = extractImageOutputEntries(payload)
  assert.equal(images.length, 1)
  assert.equal(images[0].mime, 'image/png')
  assert.ok(images[0].src.startsWith('data:image/png;base64,'))
})

test('extractImageOutputEntries does not treat generic base64 file content as an image', () => {
  const zipBytes = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(256, 0x61)
  ])
  const textBytes = Buffer.from(`plain base64 chunk ${'x'.repeat(256)}`)

  assert.deepEqual(extractImageOutputEntries({
    kind: 'sandbox_read_file_result',
    path: 'output/report.xlsx',
    encoding: 'base64',
    content: zipBytes.toString('base64')
  }), [])
  assert.deepEqual(extractImageOutputEntries({
    kind: 'sandbox_read_file_result',
    path: 'output/chunks/000.txt',
    encoding: 'utf8',
    content: textBytes.toString('base64')
  }), [])
})

test('reconcilePersistedSandboxToolImages hides stale fake images from historical file reads', () => {
  const staleImages = [{ id: 'legacy-image', mime: 'image/png', assetRef: 'legacy.png' }]
  const xlsxContent = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(256, 0x61)
  ]).toString('base64')

  assert.deepEqual(reconcilePersistedSandboxToolImages(staleImages, {
    kind: 'sandbox_read_file_result',
    path: 'output/report.xlsx',
    encoding: 'base64',
    content: xlsxContent
  }), [])

  const pngContent = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(256, 0x61)
  ]).toString('base64')
  assert.equal(reconcilePersistedSandboxToolImages(staleImages, {
    kind: 'sandbox_read_file_result',
    path: 'output/chart.png',
    encoding: 'base64',
    content: pngContent
  }), staleImages)
})

test('extractVideoOutputEntries preserves video resolution, duration, and timing metadata', () => {
  const payload = {
    created_at: '2026-04-24T12:00:00.000Z',
    videos: [
      {
        url: 'https://cdn.example.test/render.mp4',
        mime: 'video/mp4',
        resolution: '1920x1080',
        duration_seconds: 6,
        elapsed_ms: 45000
      }
    ]
  }

  const videos = extractVideoOutputEntries(payload)
  assert.equal(videos.length, 1)
  assert.equal(videos[0].width, 1920)
  assert.equal(videos[0].height, 1080)
  assert.equal(videos[0].durationSeconds, 6)
  assert.equal(videos[0].generationTimeMs, 45000)
  assert.equal(videos[0].createdAt, '2026-04-24T12:00:00.000Z')
})

test('extractVideoOutputEntries accepts blob URLs when mime identifies video', () => {
  const payload = {
    data: [
      {
        url: 'blob:file:///e2c7bb5c-afbe-4e29-a9a2-2bc903d3f1e6',
        mime: 'video/mp4',
        name: 'video_video_1'
      }
    ]
  }

  const videos = extractVideoOutputEntries(payload)
  assert.equal(videos.length, 1)
  assert.equal(videos[0].src, 'blob:file:///e2c7bb5c-afbe-4e29-a9a2-2bc903d3f1e6')
  assert.equal(videos[0].mime, 'video/mp4')
  assert.equal(videos[0].name, 'video_video_1')
})

test('extractVideoOutputEntries accepts video blob wrappers with common content hints', () => {
  assert.deepEqual(
    extractVideoOutputEntries({
      data: [
        {
          url: 'blob:file:///video-with-content-type',
          content_type: 'video/mp4; codecs="avc1"',
          name: 'openai_video'
        }
      ]
    }).map((video) => ({ src: video.src, mime: video.mime, name: video.name })),
    [
      {
        src: 'blob:file:///video-with-content-type',
        mime: 'video/mp4',
        name: 'openai_video'
      }
    ]
  )

  assert.deepEqual(
    extractVideoOutputEntries({
      data: [
        {
          url: 'blob:file:///video-with-name-hint',
          name: 'video_video_123'
        }
      ]
    }).map((video) => ({ src: video.src, mime: video.mime, name: video.name })),
    [
      {
        src: 'blob:file:///video-with-name-hint',
        mime: 'video/mp4',
        name: 'video_video_123'
      }
    ]
  )
})
