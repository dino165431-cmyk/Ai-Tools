import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildVideoGenerationCompatibilityError,
  buildManualImageGenerationRequestInfo,
  buildManualVideoGenerationRequestInfo,
  requestImageGeneration,
  requestVideoGeneration,
  shouldFetchVideoGenerationContent,
  shouldFallbackMediaRequestToChat,
  waitForVideoGenerationResult
} from '../src/utils/chatMediaGenerationRequest.js'

test('manual media request info keeps current Chinese labels and timeout display', () => {
  assert.equal(
    buildManualImageGenerationRequestInfo({ size: '1024x1024' }),
    '手动产图 · 尺寸：1024x1024 · 最长等待：10m'
  )
  assert.equal(
    buildManualVideoGenerationRequestInfo(),
    '手动产视频 · 分辨率：服务商默认 · 请求等待：10m · 结果轮询：30m'
  )
  assert.equal(
    buildManualVideoGenerationRequestInfo({ size: '720x1280', aspect_ratio: '9:16', duration: 5, quality: 'hd' }),
    '手动产视频 · 分辨率：720x1280 · 时长：5s · 请求等待：10m · 结果轮询：30m'
  )
})

test('shouldFallbackMediaRequestToChat does not fallback on timeout or abort', () => {
  assert.equal(shouldFallbackMediaRequestToChat(new Error('图片生成请求 timed out (600000ms)'), 'image'), false)
  assert.equal(shouldFallbackMediaRequestToChat(new Error('AbortError: aborted'), 'video'), false)
  assert.equal(shouldFallbackMediaRequestToChat(new Error('请求超时'), 'image'), false)
})

test('shouldFallbackMediaRequestToChat falls back on incompatible media endpoints', () => {
  assert.equal(shouldFallbackMediaRequestToChat(new Error('图片生成接口不存在（HTTP 404）：/v1/images/generations'), 'image'), true)
  assert.equal(shouldFallbackMediaRequestToChat(new Error('兼容层已判定请求完成，但没有返回可展示的图片结果。'), 'image'), true)
  assert.equal(shouldFallbackMediaRequestToChat(new Error('视频生成请求失败（HTTP 500）：server error'), 'video'), true)
})

test('shouldFallbackMediaRequestToChat falls back on image generation tool choice incompatibility', () => {
  assert.equal(
    shouldFallbackMediaRequestToChat(new Error("Tool choice 'image_generation' not found in 'tools' parameter."), 'image'),
    true
  )
})

test('buildVideoGenerationCompatibilityError surfaces failed task errors', () => {
  const message = buildVideoGenerationCompatibilityError(
    {
      id: 'video_1',
      object: 'video',
      status: 'failed',
      error: {
        code: 'moderation_blocked',
        message: 'Your request was blocked by our moderation system.'
      }
    },
    { url: 'https://api.openai.com/v1/videos' }
  )

  assert.match(message, /视频生成任务失败/)
  assert.match(message, /moderation_blocked/)
  assert.match(message, /内容安全审核系统/)
  assert.match(message, /api\.openai\.com\/v1\/videos/)
})

test('requestVideoGeneration sends enabled manual request options', async () => {
  const originalFetch = globalThis.fetch
  let capturedForm = null

  globalThis.fetch = async (_url, init) => {
    capturedForm = init.body
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'vid_1', status: 'completed' })
    }
  }

  try {
    const result = await requestVideoGeneration({
      baseUrl: 'https://api.test/v1',
      apiKey: 'test-key',
      model: 'video-model',
      prompt: '生成短视频',
      requestOptions: {
        size: '720x1280',
        aspect_ratio: '9:16',
        seconds: 5,
        quality: 'hd'
      }
    })

    assert.equal(result.payload.id, 'vid_1')
    assert.equal(capturedForm.get('model'), 'video-model')
    assert.equal(capturedForm.get('prompt'), '生成短视频')
    assert.equal(capturedForm.get('size'), '720x1280')
    assert.equal(capturedForm.get('aspect_ratio'), null)
    assert.equal(capturedForm.get('seconds'), '4')
    assert.equal(capturedForm.get('quality'), null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('requestVideoGeneration sends uploaded image attachment as input_reference', async () => {
  const originalFetch = globalThis.fetch
  let capturedForm = null

  globalThis.fetch = async (_url, init) => {
    capturedForm = init.body
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'vid_ref_1', status: 'queued' })
    }
  }

  try {
    await requestVideoGeneration({
      baseUrl: 'https://api.test/v1',
      apiKey: 'test-key',
      model: 'video-model',
      prompt: 'animate this image',
      requestOptions: {
        referenceImages: [
          {
            dataUrl: `data:image/png;base64,${Buffer.from('reference-image').toString('base64')}`,
            name: 'reference.png',
            mime: 'image/png'
          }
        ]
      }
    })

    const inputReference = capturedForm.get('input_reference')
    assert.ok(inputReference instanceof Blob)
    assert.equal(inputReference.type, 'image/png')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('requestVideoGeneration resizes image reference to requested video size when canvas is available', async () => {
  const originalFetch = globalThis.fetch
  const originalDocument = globalThis.document
  const originalImage = globalThis.Image
  let capturedForm = null

  const resizedBytes = Buffer.from('resized-reference')
  const resizedDataUrl = `data:image/png;base64,${resizedBytes.toString('base64')}`
  const canvasCalls = []

  globalThis.document = {
    createElement: (tag) => {
      assert.equal(tag, 'canvas')
      return {
        width: 0,
        height: 0,
        getContext: (type) => {
          assert.equal(type, '2d')
          return {
            save: () => {},
            restore: () => {},
            fillRect: () => {},
            drawImage: (...args) => canvasCalls.push(args),
            set fillStyle(_value) {},
            set filter(_value) {},
            set globalAlpha(_value) {}
          }
        },
        toDataURL: (type) => {
          assert.equal(type, 'image/png')
          return resizedDataUrl
        }
      }
    }
  }
  globalThis.Image = class {
    constructor() {
      this.naturalWidth = 640
      this.naturalHeight = 640
    }

    set src(_value) {
      queueMicrotask(() => this.onload?.())
    }
  }

  globalThis.fetch = async (_url, init) => {
    capturedForm = init.body
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'vid_ref_resized', status: 'queued' })
    }
  }

  try {
    await requestVideoGeneration({
      baseUrl: 'https://api.test/v1',
      apiKey: 'test-key',
      model: 'video-model',
      prompt: 'animate this image',
      requestOptions: {
        size: '1280x720',
        referenceImages: [
          {
            dataUrl: `data:image/png;base64,${Buffer.from('source-reference').toString('base64')}`,
            name: 'reference.png',
            mime: 'image/png',
            width: 1280,
            height: 720
          }
        ]
      }
    })

    const inputReference = capturedForm.get('input_reference')
    assert.ok(inputReference instanceof Blob)
    assert.equal(inputReference.type, 'image/png')
    assert.equal(await inputReference.text(), resizedBytes.toString())
    assert.equal(canvasCalls.length, 2)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.document = originalDocument
    globalThis.Image = originalImage
  }
})

test('requestVideoGeneration keeps multiple uploaded image references', async () => {
  const originalFetch = globalThis.fetch
  let capturedForm = null

  globalThis.fetch = async (_url, init) => {
    capturedForm = init.body
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'vid_ref_2', status: 'queued' })
    }
  }

  try {
    await requestVideoGeneration({
      baseUrl: 'https://api.test/v1',
      apiKey: 'test-key',
      model: 'video-model',
      prompt: 'animate these images',
      requestOptions: {
        referenceImages: [
          `data:image/png;base64,${Buffer.from('reference-a').toString('base64')}`,
          `data:image/png;base64,${Buffer.from('reference-b').toString('base64')}`
        ]
      }
    })

    assert.equal(capturedForm.getAll('input_reference').length, 2)
    assert.ok(capturedForm.getAll('input_reference').every((item) => item instanceof Blob))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('requestVideoGeneration maps legacy duration option to seconds', async () => {
  const originalFetch = globalThis.fetch
  let capturedForm = null

  globalThis.fetch = async (_url, init) => {
    capturedForm = init.body
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'vid_1', status: 'queued' })
    }
  }

  try {
    await requestVideoGeneration({
      baseUrl: 'https://api.test/v1',
      apiKey: 'test-key',
      model: 'video-model',
      prompt: '生成短视频',
      requestOptions: { duration: 8 }
    })

    assert.equal(capturedForm.get('seconds'), '8')
    assert.equal(capturedForm.get('duration'), null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('shouldFetchVideoGenerationContent recognizes completed id-only video jobs', () => {
  assert.equal(
    shouldFetchVideoGenerationContent(
      { id: 'vid_1', status: 'completed' },
      { baseEndpoint: 'https://api.test/videos' }
    ),
    true
  )
  assert.equal(
    shouldFetchVideoGenerationContent(
      { id: 'vid_1', status: 'completed', data: [{ url: 'https://cdn.test/video.mp4' }] },
      { baseEndpoint: 'https://api.test/videos' }
    ),
    false
  )
  assert.equal(
    shouldFetchVideoGenerationContent(
      { id: 'vid_1', status: 'processing' },
      { baseEndpoint: 'https://api.test/videos' }
    ),
    false
  )
})

test('requestImageGeneration sends reference image through image edit form data', async () => {
  const originalFetch = globalThis.fetch
  let capturedUrl = ''
  let capturedForm = null

  globalThis.fetch = async (url, init) => {
    capturedUrl = url
    capturedForm = init.body
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ b64_json: Buffer.from(`img-${'x'.repeat(160)}`).toString('base64') }] })
    }
  }

  try {
    const result = await requestImageGeneration({
      baseUrl: 'https://api.test/v1',
      apiKey: 'test-key',
      model: 'gpt-image-1',
      prompt: 'restyle this',
      requestOptions: {
        referenceImages: [
          {
            dataUrl: `data:image/png;base64,${Buffer.from('reference-image').toString('base64')}`,
            name: 'reference.png',
            mime: 'image/png'
          }
        ]
      }
    })

    assert.equal(capturedUrl, 'https://api.test/v1/images/edits')
    assert.equal(capturedForm.get('model'), 'gpt-image-1')
    assert.equal(capturedForm.get('prompt'), 'restyle this')
    assert.equal(capturedForm.getAll('image').length, 1)
    assert.ok(capturedForm.get('image') instanceof Blob)
    assert.equal(result.payload.data.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('requestImageGeneration retries responses image generation without tool_choice', async () => {
  const originalFetch = globalThis.fetch
  const responsePayloads = []
  const b64 = Buffer.from(`img-${'x'.repeat(160)}`).toString('base64')

  globalThis.fetch = async (url, init) => {
    const href = String(url || '')
    if (href.endsWith('/images/generations')) {
      return {
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: { message: 'not found' } })
      }
    }

    const body = JSON.parse(String(init.body || '{}'))
    responsePayloads.push(body)
    if (body.tool_choice !== undefined) {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: "Tool choice 'image_generation' not found in 'tools' parameter." } })
      }
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ b64_json: b64 }] })
    }
  }

  try {
    const result = await requestImageGeneration({
      baseUrl: 'https://api.test/v1',
      apiKey: 'test-key',
      model: 'gpt-image-1',
      prompt: 'make an image'
    })

    assert.equal(responsePayloads.length, 3)
    assert.equal(responsePayloads[0].tool_choice?.type, 'image_generation')
    assert.equal(responsePayloads[1].tool_choice, 'required')
    assert.equal(responsePayloads[2].tool_choice, undefined)
    assert.equal(result.payload.data[0].b64_json, b64)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('requestImageGeneration reads OpenAI image generation streaming events', async () => {
  const originalFetch = globalThis.fetch
  let capturedBody = null
  const b64 = Buffer.from(`png-${'x'.repeat(160)}`).toString('base64')

  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body || '{}'))
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      text: async () => [
        `data: ${JSON.stringify({ type: 'image_generation.partial_image', partial_image_index: 0, b64_json: Buffer.from(`partial-${'x'.repeat(160)}`).toString('base64'), output_format: 'png' })}`,
        '',
        `data: ${JSON.stringify({ type: 'image_generation.completed', b64_json: b64, output_format: 'png' })}`,
        '',
        'data: [DONE]',
        ''
      ].join('\n')
    }
  }

  try {
    const result = await requestImageGeneration({
      baseUrl: 'https://api.test/v1',
      apiKey: 'test-key',
      model: 'gpt-image-1',
      prompt: 'stream an image'
    })

    assert.equal(capturedBody.stream, true)
    assert.equal(result.requestMeta.streaming, true)
    assert.equal(result.payload.data.length, 1)
    assert.equal(result.payload.data[0].type, 'image_generation.completed')
    assert.equal(result.payload.data[0].b64_json, b64)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('waitForVideoGenerationResult reports fetching-result progress', async () => {
  const originalFetch = globalThis.fetch
  const originalCreateObjectURL = globalThis.URL?.createObjectURL
  const statuses = []

  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://api.test/videos/vid_1/content')
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob(['video'], { type: 'video/mp4' })
    }
  }
  globalThis.URL.createObjectURL = () => 'blob:test-video'

  try {
    const payload = await waitForVideoGenerationResult({
      initialPayload: { id: 'vid_1', status: 'completed' },
      requestMeta: { baseEndpoint: 'https://api.test/videos' },
      apiKey: 'test-key',
      timeoutMs: 1000,
      onStatus: (_payload, taskState) => statuses.push(taskState?.stage)
    })

    assert.equal(payload?.data?.[0]?.url, 'blob:test-video')
    assert.deepEqual(statuses, ['fetching_result'])
  } finally {
    globalThis.fetch = originalFetch
    globalThis.URL.createObjectURL = originalCreateObjectURL
  }
})
