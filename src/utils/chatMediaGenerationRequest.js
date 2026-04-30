import {
  extractImageGenerationTextResult,
  extractImageOutputEntries,
  extractVideoOutputEntries
} from './chatImageGeneration.js'
import {
  createAbortError,
  getRemainingTimeoutMs,
  isAbortError,
  isTimeoutError,
  throwIfAborted,
  withAbortableTimeout
} from './abortableRequest.js'
import { formatMediaElapsed } from './chatMediaMetadata.js'
import { consumeJsonEventStream } from './streamJsonEvents.js'

export const IMAGE_GENERATION_REQUEST_TIMEOUT_MS = 10 * 60 * 1000
export const VIDEO_GENERATION_REQUEST_TIMEOUT_MS = 10 * 60 * 1000
export const VIDEO_GENERATION_RESULT_TIMEOUT_MS = 30 * 60 * 1000

const OPENAI_VIDEO_GENERATION_SIZES = new Set([
  '720x1280',
  '1280x720',
  '1024x1792',
  '1792x1024',
  '1080x1920',
  '1920x1080'
])
const OPENAI_VIDEO_GENERATION_SECONDS = [4, 8, 12]

export function buildManualImageGenerationRequestInfo(requestOptions = {}) {
  const parts = ['手动产图']
  const size = String(requestOptions?.size || '').trim()
  const quality = String(requestOptions?.quality || '').trim()
  parts.push(size ? `尺寸：${size}` : '尺寸：服务商默认')
  if (quality) parts.push(`质量：${formatMediaOptionValue(quality)}`)
  parts.push(`最长等待：${formatMediaElapsed(IMAGE_GENERATION_REQUEST_TIMEOUT_MS)}`)
  return parts.join(' · ')
}

export function buildManualVideoGenerationRequestInfo(requestOptions = {}) {
  const parts = ['手动产视频']
  const size = String(requestOptions?.size || requestOptions?.resolution || '').trim()
  const duration = Number(requestOptions?.duration ?? requestOptions?.seconds ?? 0)
  parts.push(size ? `分辨率：${size}` : '分辨率：服务商默认')
  if (Number.isFinite(duration) && duration > 0) parts.push(`时长：${Math.round(duration)}s`)
  parts.push(`请求等待：${formatMediaElapsed(VIDEO_GENERATION_REQUEST_TIMEOUT_MS)}`)
  parts.push(`结果轮询：${formatMediaElapsed(VIDEO_GENERATION_RESULT_TIMEOUT_MS)}`)
  return parts.join(' · ')
}

export async function requestImageGeneration({
  baseUrl,
  apiKey,
  model,
  prompt,
  requestOptions = {},
  signal
}) {
  return await withAbortableTimeout(
    (requestSignal) => postImageGeneration({
      baseUrl,
      apiKey,
      body: {
        model,
        prompt,
        ...requestOptions
      },
      signal: requestSignal
    }),
    IMAGE_GENERATION_REQUEST_TIMEOUT_MS,
    '图片生成请求',
    signal
  )
}

export async function requestVideoGeneration({
  baseUrl,
  apiKey,
  model,
  prompt,
  requestOptions = {},
  signal
}) {
  return await withAbortableTimeout(
    (requestSignal) => postVideoGeneration({
      baseUrl,
      apiKey,
      body: {
        model,
        prompt,
        ...requestOptions
      },
      signal: requestSignal
    }),
    VIDEO_GENERATION_REQUEST_TIMEOUT_MS,
    '视频生成请求',
    signal
  )
}

export function extractImageGenerationTaskState(payload, requestMeta = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const status = String(payload.status ?? payload.state ?? payload.task_status ?? payload.taskStatus ?? '')
    .trim()
    .toLowerCase()
  if (!status) return null

  if (!['queued', 'submitted', 'pending', 'accepted', 'processing', 'running', 'in_progress'].includes(status)) {
    return null
  }

  const id = String(payload.task_id ?? payload.taskId ?? payload.job_id ?? payload.jobId ?? payload.id ?? '')
    .trim()
  const endpointKind = requestMeta?.kind === 'responses-api' ? 'responses' : requestMeta?.kind === 'images-api' ? 'images' : ''
  const note = status === 'queued' || status === 'submitted' || status === 'pending' || status === 'accepted'
    ? '服务商已受理图片任务，但当前兼容层还没有轮询到最终图片结果。'
    : '服务商仍在处理图片任务，最终结果返回后会显示在这里。'

  return { id, status, endpointKind, note }
}

export function extractVideoGenerationTaskState(payload, requestMeta = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const status = String(payload.status ?? payload.state ?? payload.task_status ?? payload.taskStatus ?? '')
    .trim()
    .toLowerCase()
  if (!status) return null

  if (!['queued', 'submitted', 'pending', 'accepted', 'processing', 'running', 'in_progress'].includes(status)) {
    return null
  }

  const id = String(payload.task_id ?? payload.taskId ?? payload.job_id ?? payload.jobId ?? payload.id ?? '').trim()
  const endpointKind = requestMeta?.kind === 'videos-api' ? 'videos' : ''
  const note =
    status === 'queued' || status === 'submitted' || status === 'pending' || status === 'accepted'
      ? '视频任务已受理，正在排队生成。'
      : '视频正在生成中，结果就绪后会展示在这里。'

  return { id, status, endpointKind, note }
}

export function buildImageGenerationCompatibilityError(payload, requestMeta = null, diagnostics = {}) {
  const payloadPreview = summarizeMediaGenerationPayload(payload)
  const outputTypes = collectImageGenerationResponseOutputTypes(payload)
  const model = String(diagnostics?.model || '').trim()
  const lines = []
  const image404 =
    Array.isArray(diagnostics?.attempts) &&
    diagnostics.attempts.some((item) => item?.kind === 'images-api' && Number(item?.status) === 404)

  if (requestMeta?.kind === 'responses-api' && isResponsesApiImageSoftFailure(payload)) {
    lines.push('兼容层已判定请求完成，但没有返回可展示的图片结果。')
    lines.push('当前服务商可能只支持文本响应，不支持真正的 image_generation 结果载荷。')
    if (outputTypes.length) lines.push(`输出类型：${outputTypes.join(', ')}`)
    if (isLikelyXaiImageModel(model) && image404) {
      lines.push('当前网关对 xAI 图片接口的兼容可能不完整：/v1/images/generations 不可用，而 /v1/responses 只返回文本。')
      lines.push('如果使用 xAI，优先选择 grok-imagine-image 模型并走 /v1/images/generations 端点。')
    }
  } else {
    lines.push('图片生成接口没有返回可展示的图片数据。')
    if (outputTypes.length) lines.push(`输出类型：${outputTypes.join(', ')}`)
  }

  if (requestMeta?.url) lines.push(`接口：${requestMeta.url}`)
  if (payloadPreview) lines.push(`返回预览：\n${payloadPreview}`)
  return lines.join('\n')
}

export function buildVideoGenerationCompatibilityError(payload, requestMeta = null) {
  const payloadPreview = summarizeMediaGenerationPayload(payload)
  const taskStatus = String(payload?.status ?? payload?.state ?? payload?.task_status ?? payload?.taskStatus ?? '')
    .trim()
    .toLowerCase()
  const errorObj = payload?.error && typeof payload.error === 'object' ? payload.error : null
  const errorCode = String(errorObj?.code || payload?.error_code || payload?.errorCode || '').trim()
  const errorMessage = String(
    errorObj?.message ||
      payload?.error_message ||
      payload?.errorMessage ||
      (typeof payload?.error === 'string' ? payload.error : '')
  ).trim()
  const isTerminalFailure = ['failed', 'error', 'cancelled', 'canceled'].includes(taskStatus)
  const lines = []

  if (isTerminalFailure) {
    lines.push(`视频生成任务${taskStatus === 'cancelled' || taskStatus === 'canceled' ? '已取消' : '失败'}，接口已返回终止状态。`)
    if (errorCode) lines.push(`错误码：${errorCode}`)
    if (errorMessage) lines.push(`错误信息：${errorMessage}`)
    if (errorCode === 'moderation_blocked') {
      lines.push('原因：请求被服务商的内容安全审核系统拦截，因此不会生成可下载的视频文件。')
    }
  } else {
    lines.push('视频生成接口没有返回可展示的视频数据。')
  }

  if (requestMeta?.url) lines.push(`接口：${requestMeta.url}`)
  if (payloadPreview) lines.push(`返回预览：\n${payloadPreview}`)
  return lines.join('\n')
}

export function shouldFallbackMediaRequestToChat(err, mediaKind = 'image') {
  const text = String(err?.message || err || '').trim()
  if (!text) return false

  const lower = text.toLowerCase()
  const mediaLabel = mediaKind === 'video' ? '视频' : '图片'
  const mediaToken = mediaKind === 'video' ? 'video' : 'image'

  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('aborterror') ||
    lower.includes('aborted') ||
    text.includes('超时')
  ) {
    return false
  }

  const httpStatuses = Array.from(
    lower.matchAll(/http[\s:：]*(\d{3})|status[\s:=：]*(\d{3})/gi),
    (match) => Number(match?.[1] || match?.[2] || 0)
  ).filter((code) => Number.isFinite(code) && code > 0)

  if (httpStatuses.some((code) => code === 404 || code === 405 || code === 415 || code === 422 || code >= 500)) {
    return true
  }

  if (mediaKind === 'image' && lower.includes('tool choice') && lower.includes('image_generation') && lower.includes('tools')) {
    return true
  }

  if (
    lower.includes('unsupported') ||
    lower.includes('not supported') ||
    lower.includes('not support') ||
    lower.includes('not found') ||
    text.includes('接口不存在') ||
    text.includes('兼容层') ||
    text.includes('没有返回可展示') ||
    text.includes('只支持文本') ||
    lower.includes('only supports text') ||
    lower.includes('only support text') ||
    text.includes('已尝试以下端点') ||
    lower.includes('/images/generations') ||
    lower.includes('/videos') ||
    lower.includes('/responses') ||
    lower.includes('request failed')
  ) {
    return true
  }

  if (
    (text.includes(mediaLabel) || lower.includes(mediaToken)) &&
    (text.includes('模型') || lower.includes('model') || text.includes('请求失败') || lower.includes('failed'))
  ) {
    return true
  }

  return false
}

export function getVideoGenerationPayloadId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return ''
  return String(payload.id ?? payload.task_id ?? payload.taskId ?? payload.job_id ?? payload.jobId ?? '').trim()
}

export function shouldFetchVideoGenerationContent(payload, requestMeta = null) {
  if (extractVideoOutputEntries(payload, { limit: 1 }).length) return false
  if (!requestMeta || typeof requestMeta !== 'object' || !String(requestMeta.baseEndpoint || '').trim()) return false
  if (!getVideoGenerationPayloadId(payload)) return false

  const status = String(payload?.status ?? payload?.state ?? payload?.task_status ?? payload?.taskStatus ?? '')
    .trim()
    .toLowerCase()
  return ['completed', 'succeeded', 'success'].includes(status)
}

export async function waitForVideoGenerationResult({
  initialPayload,
  requestMeta,
  apiKey,
  signal,
  abortState = null,
  timeoutMs = VIDEO_GENERATION_RESULT_TIMEOUT_MS,
  onStatus = null,
  pollIntervalMs = 8000,
  initialPollDelayMs = pollIntervalMs
}) {
  const directVideos = extractVideoOutputEntries(initialPayload)
  if (directVideos.length) return initialPayload

  let payload = initialPayload
  let taskState = extractVideoGenerationTaskState(payload, requestMeta)
  const videoId = String(taskState?.id || getVideoGenerationPayloadId(payload)).trim()
  if (!videoId) return payload

  const startedAt = Date.now()
  const getRemainingMs = () => getRemainingTimeoutMs(startedAt, timeoutMs)
  let isFirstPoll = true
  while (getRemainingMs() > 0) {
    throwIfAborted(abortState)
    const status = String(payload?.status ?? payload?.state ?? '').trim().toLowerCase()
    if (['completed', 'succeeded', 'success'].includes(status)) {
      if (extractVideoOutputEntries(payload).length) return payload
      let contentPayload = null
      notifyVideoGenerationStatus(onStatus, payload, {
        ...(taskState || {}),
        id: videoId,
        status: status || 'completed',
        stage: 'fetching_result'
      })
      try {
        contentPayload = await withAbortableTimeout(
          (requestSignal) => fetchVideoGenerationContentPayload({ requestMeta, videoId, apiKey, signal: requestSignal }),
          getRemainingMs(),
          '获取视频内容',
          signal
        )
      } catch (err) {
        if (isTimeoutError(err)) return null
        throw err
      }
      return contentPayload || payload
    }
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return payload

    const delayMs = Math.max(0, Number(isFirstPoll ? initialPollDelayMs : pollIntervalMs) || 0)
    isFirstPoll = false
    await delayWithAbort(Math.min(delayMs, getRemainingMs()), abortState, signal)
    if (getRemainingMs() <= 0) break
    let nextPayload = null
    try {
      nextPayload = await withAbortableTimeout(
        (requestSignal) => fetchVideoGenerationStatus({ requestMeta, videoId, apiKey, signal: requestSignal }),
        getRemainingMs(),
        '查询视频任务',
        signal
      )
    } catch (err) {
      if (isTimeoutError(err)) return null
      throw err
    }
    if (!nextPayload) return payload
    payload = nextPayload
    taskState = extractVideoGenerationTaskState(payload, requestMeta)
    notifyVideoGenerationStatus(onStatus, payload, taskState || {
      id: videoId,
      status: String(payload?.status ?? payload?.state ?? '').trim().toLowerCase(),
      stage: 'polling'
    })
    if (!taskState && extractVideoOutputEntries(payload).length) return payload
  }

  return null
}

function notifyVideoGenerationStatus(onStatus, payload, taskState) {
  if (typeof onStatus !== 'function') return
  try {
    onStatus(payload, taskState)
  } catch {
    // ignore observer errors
  }
}

function formatMediaOptionValue(value) {
  const text = String(value || '').trim()
  if (text === 'hd') return '高清'
  if (text === 'high') return '高'
  if (text === 'medium') return '中'
  if (text === 'low') return '低'
  if (text === 'standard') return '标准'
  return text
}

function collectImageGenerationResponseOutputTypes(payload) {
  if (!payload || typeof payload !== 'object') return []
  const output = Array.isArray(payload.output) ? payload.output : []
  const labels = []
  const push = (value) => {
    const text = String(value || '').trim()
    if (!text || labels.includes(text)) return
    labels.push(text)
  }
  output.forEach((item) => {
    if (!item || typeof item !== 'object') return
    push(item.type)
    if (Array.isArray(item.content)) {
      item.content.forEach((part) => {
        const partType = String(part?.type || '').trim()
        if (!partType) return
        push(partType)
        if (item.type) push(`${item.type}:${partType}`)
      })
    }
  })
  return labels
}

function isLikelyXaiImageModel(model) {
  return /grok-imagine/i.test(String(model || '').trim())
}

function isResponsesApiImageSoftFailure(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  if (String(payload.object || '').trim().toLowerCase() !== 'response') return false
  if (extractImageGenerationTaskState(payload, { kind: 'responses-api' })) return false
  if (extractImageOutputEntries(payload).length) return false

  const status = String(payload.status || '').trim().toLowerCase()
  if (status && !['completed', 'succeeded', 'success'].includes(status)) return false

  const outputTypes = collectImageGenerationResponseOutputTypes(payload)
  if (!outputTypes.length) return true

  if (extractImageGenerationTextResult(payload)) return false

  return outputTypes.every((type) => /^(message|output_text|message:output_text)$/i.test(String(type || '').trim()))
}

function buildResponsesImageGenerationTool(body = {}) {
  const tool = { type: 'image_generation' }
  ;['size', 'quality'].forEach((key) => {
    const value = String(body?.[key] || '').trim()
    if (value) tool[key] = value
  })
  return tool
}

function isDataImageUrl(url) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(url || '').trim())
}

function splitDataUrl(dataUrl) {
  const match = String(dataUrl || '').trim().match(/^data:([^;,]+);base64,(.+)$/i)
  if (!match) return null
  return {
    mime: String(match[1] || '').trim().toLowerCase(),
    base64: String(match[2] || '').replace(/\s+/g, '')
  }
}

function dataUrlToBlob(dataUrl, fallbackMime = 'application/octet-stream') {
  const parsed = splitDataUrl(dataUrl)
  if (!parsed) return null
  const mime = parsed.mime || fallbackMime
  const binary =
    typeof atob === 'function'
      ? atob(parsed.base64)
      : typeof Buffer !== 'undefined'
        ? Buffer.from(parsed.base64, 'base64').toString('binary')
        : ''
  if (!binary) return null

  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

function guessImageFileName(nameRaw, mimeRaw, index = 0) {
  const name = String(nameRaw || '').trim()
  if (/\.[a-z0-9]+$/i.test(name)) return name

  const mime = String(mimeRaw || '').trim().toLowerCase()
  let ext = 'png'
  if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg'
  else if (mime.includes('webp')) ext = 'webp'
  else if (mime.includes('gif')) ext = 'gif'
  else if (mime.includes('bmp')) ext = 'bmp'
  else if (mime.includes('svg')) ext = 'svg'
  else if (mime.includes('avif')) ext = 'avif'

  return name ? `${name}.${ext}` : `reference_${index + 1}.${ext}`
}

function normalizeMediaReferenceImages(value = []) {
  const source = Array.isArray(value) ? value : [value]
  const seen = new Set()
  const out = []

  source.forEach((item, index) => {
    if (!item) return
    const dataUrl =
      typeof item === 'string'
        ? String(item || '').trim()
        : String(item.dataUrl || item.src || item.url || item.image_url?.url || item.imageUrl || '').trim()
    if (!isDataImageUrl(dataUrl) || seen.has(dataUrl)) return
    seen.add(dataUrl)
    const parsed = splitDataUrl(dataUrl)
    const mime = String(
      typeof item === 'object' && item
        ? item.mime || item.type || parsed?.mime || ''
        : parsed?.mime || ''
    ).trim()
    out.push({
      dataUrl,
      mime,
      name: guessImageFileName(
        typeof item === 'object' && item ? item.name || item.filename : '',
        mime,
        index
      ),
      width: Number(typeof item === 'object' && item ? item.width || item.naturalWidth || 0 : 0) || 0,
      height: Number(typeof item === 'object' && item ? item.height || item.naturalHeight || 0 : 0) || 0
    })
  })

  return out
}

function extractMediaReferenceImages(body = {}) {
  if (!body || typeof body !== 'object') return []
  const candidates = [
    body.referenceImages,
    body.reference_images,
    body.inputImages,
    body.input_images,
    body.input_image,
    body.inputImage,
    body.image,
    body.images,
    body.image_url,
    body.imageUrl,
    body.image_urls,
    body.imageUrls,
    body.input_reference,
    body.inputReference
  ]
  for (const candidate of candidates) {
    const refs = normalizeMediaReferenceImages(candidate)
    if (refs.length) return refs
  }
  return []
}

function withoutMediaReferenceOptions(body = {}) {
  const out = { ...(body && typeof body === 'object' ? body : {}) }
  ;[
    'referenceImages',
    'reference_images',
    'inputImages',
    'input_images',
    'input_image',
    'inputImage',
    'image',
    'images',
    'image_url',
    'imageUrl',
    'image_urls',
    'imageUrls',
    'input_reference',
    'inputReference'
  ].forEach((key) => {
    delete out[key]
  })
  return out
}

function buildImageGenerationJsonBody(body = {}, referenceImages = []) {
  const out = withoutMediaReferenceOptions(body)
  const refs = normalizeMediaReferenceImages(referenceImages)
  if (!refs.length) return out

  const images = refs.map((item) => item.dataUrl)
  out.image = images[0]
  out.images = images
  out.reference_images = images
  return out
}

function toFormDataFilePayload(value, index = 0) {
  if (!value) return null
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return {
      blob: value,
      filename: guessImageFileName(value.name || '', value.type || '', index)
    }
  }

  const refs = normalizeMediaReferenceImages(value)
  if (!refs.length) return null
  const ref = refs[0]
  const blob = dataUrlToBlob(ref.dataUrl, ref.mime || 'image/png')
  if (!blob) return null
  return {
    blob,
    filename: guessImageFileName(ref.name, ref.mime || blob.type, index)
  }
}

function appendFormDataValue(form, key, value, index = 0, useAppend = false) {
  if (value === undefined || value === null || value === '') return
  const filePayload = toFormDataFilePayload(value, index)
  if (filePayload) {
    if (useAppend) form.append(key, filePayload.blob, filePayload.filename)
    else form.set(key, filePayload.blob, filePayload.filename)
    return
  }
  if (typeof value === 'object') {
    const text = JSON.stringify(value)
    if (useAppend) form.append(key, text)
    else form.set(key, text)
    return
  }
  if (useAppend) form.append(key, String(value))
  else form.set(key, String(value))
}

function buildImageEditFormData(body = {}, referenceImages = []) {
  const form = new FormData()
  const refs = normalizeMediaReferenceImages(referenceImages)
  form.set('model', String(body.model || '').trim())
  form.set('prompt', String(body.prompt || '').trim())
  appendFormDataRequestOptions(form, withoutMediaReferenceOptions(body), ['model', 'prompt'])
  refs.forEach((ref, index) => {
    appendFormDataValue(form, 'image', ref, index, true)
  })
  return form
}

function buildResponsesImageGenerationInput(prompt, referenceImages = []) {
  const refs = normalizeMediaReferenceImages(referenceImages)
  const text = String(prompt || '')
  if (!refs.length) return text
  return [
    {
      role: 'user',
      content: [
        { type: 'input_text', text },
        ...refs.map((ref) => ({
          type: 'input_image',
          image_url: ref.dataUrl
        }))
      ]
    }
  ]
}

function normalizeBaseUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''

  const noQuery = raw.split('#')[0].split('?')[0]
  let base = noQuery.replace(/\/+$/, '')

  // 兼容：用户把“完整接口地址”粘进了接口地址
  base = base
    .replace(/\/v1\/chat\/completions$/i, '/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/v1\/completions$/i, '/v1')
    .replace(/\/completions$/i, '')
    .replace(/\/v1\/models$/i, '/v1')
    .replace(/\/models$/i, '')

  return base.replace(/\/+$/, '')
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    return { ok: false, error: e }
  }
}

function stableStringify(obj, spaces = 2) {
  try {
    return JSON.stringify(obj, null, spaces)
  } catch {
    return String(obj)
  }
}

function truncateText(text, maxChars, suffix) {
  const raw = String(text || '')
  if (!maxChars || raw.length <= maxChars) return raw
  const tail = suffix || ''
  const keep = Math.max(0, maxChars - tail.length)
  return `${raw.slice(0, keep).trimEnd()}${tail}`
}

function summarizeMediaGenerationPayload(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') return truncateText(payload, 600, '(response truncated)')

  try {
    return truncateText(stableStringify(payload), 800, '(response truncated)')
  } catch {
    return truncateText(String(payload), 600, '(response truncated)')
  }
}

function isEventStreamResponse(response) {
  const contentType = String(response?.headers?.get?.('content-type') || '').trim().toLowerCase()
  return contentType.startsWith('text/event-stream')
}

function isImageStreamEventType(value, suffix = '') {
  const type = String(value?.type || value?.event || '').trim().toLowerCase()
  if (!type.includes('image_generation')) return false
  return suffix ? type.endsWith(suffix) || type.includes(suffix) : true
}

function imageStreamEventHasMedia(value) {
  return extractImageOutputEntries(value, { limit: 1 }).length > 0
}

function normalizeImageStreamEventsPayload(events = []) {
  const list = Array.isArray(events) ? events.filter((item) => item && typeof item === 'object') : []
  if (!list.length) return null

  const completed = list.filter((event) => isImageStreamEventType(event, '.completed') && imageStreamEventHasMedia(event))
  if (completed.length) {
    return {
      object: 'image_generation.stream',
      data: completed,
      events: list
    }
  }

  const partial = list.filter((event) => isImageStreamEventType(event, 'partial_image') && imageStreamEventHasMedia(event))
  if (partial.length) {
    return {
      object: 'image_generation.stream',
      data: [partial[partial.length - 1]],
      events: list
    }
  }

  return {
    object: 'image_generation.stream',
    events: list
  }
}

async function readImageGenerationStreamPayload(response, signal) {
  const events = []
  await consumeJsonEventStream({
    response,
    signal,
    isAborted: () => !!signal?.aborted,
    onJson: (json) => {
      if (json && typeof json === 'object') events.push(json)
    }
  })
  return normalizeImageStreamEventsPayload(events)
}

async function postImageGeneration({ baseUrl, apiKey, body, signal }) {
  const base = normalizeBaseUrl(baseUrl)
  let lastError = null
  const triedUrls = []
  const attemptDiagnostics = []
  const referenceImages = extractMediaReferenceImages(body)
  const baseImageBody = withoutMediaReferenceOptions(body)
  const imageApiCandidates = uniqueNonEmpty([
    `${base}/images/generations`,
    !/\/v1$/i.test(base) ? `${base}/v1/images/generations` : ''
  ])
  const imageEditApiCandidates = referenceImages.length
    ? uniqueNonEmpty([
        `${base}/images/edits`,
        !/\/v1$/i.test(base) ? `${base}/v1/images/edits` : ''
      ])
    : []
  const responsesApiCandidates = uniqueNonEmpty([
    `${base}/responses`,
    !/\/v1$/i.test(base) ? `${base}/v1/responses` : ''
  ])
  const imageBodyVariants = baseImageBody?.size
    ? [baseImageBody, (({ size, ...rest }) => rest)(baseImageBody)]
    : [baseImageBody]
  const responsesImageGenerationTool = buildResponsesImageGenerationTool(baseImageBody)
  const attempts = [
    ...imageEditApiCandidates.flatMap((url) =>
      imageBodyVariants.map((imageBody) => ({
        kind: 'images-edits-api',
        url,
        payload: buildImageEditFormData(imageBody, referenceImages)
      }))
    ),
    ...imageApiCandidates.flatMap((url) =>
      imageBodyVariants.flatMap((imageBody) => [
        {
          kind: 'images-api',
          url,
          payload: { ...buildImageGenerationJsonBody(imageBody, referenceImages), stream: true }
        },
        {
          kind: 'images-api',
          url,
          payload: { ...buildImageGenerationJsonBody(imageBody, referenceImages), response_format: 'b64_json' }
        },
        {
          kind: 'images-api',
          url,
          payload: buildImageGenerationJsonBody(imageBody, referenceImages)
        }
      ])
    ),
    ...responsesApiCandidates.flatMap((url) => [
      {
        kind: 'responses-api',
        url,
        payload: {
          model: baseImageBody.model,
          input: buildResponsesImageGenerationInput(baseImageBody.prompt, referenceImages),
          tools: [responsesImageGenerationTool],
          tool_choice: { type: 'image_generation' }
        }
      },
      {
        kind: 'responses-api',
        url,
        payload: {
          model: baseImageBody.model,
          input: buildResponsesImageGenerationInput(baseImageBody.prompt, referenceImages),
          tools: [responsesImageGenerationTool],
          tool_choice: 'required'
        }
      },
      {
        kind: 'responses-api',
        url,
        payload: {
          model: baseImageBody.model,
          input: buildResponsesImageGenerationInput(baseImageBody.prompt, referenceImages),
          tools: [responsesImageGenerationTool]
        }
      }
    ])
  ]

  for (const attempt of attempts) {
    const { kind, url, payload } = attempt
    triedUrls.push(url)
    try {
      let resp = null
      try {
        const isFormPayload = typeof FormData !== 'undefined' && payload instanceof FormData
        const headers = {
          Accept: payload?.stream ? 'application/json, text/event-stream' : 'application/json',
          Authorization: `Bearer ${apiKey}`
        }
        if (!isFormPayload) headers['Content-Type'] = 'application/json'
        resp = await fetch(url, {
          method: 'POST',
          headers,
          body: isFormPayload ? payload : JSON.stringify(payload),
          signal
        })
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) throw err
        lastError = err
        continue
      }

      if (resp.status === 404) {
        attemptDiagnostics.push({ kind, url, status: resp.status })
        lastError = new Error(`图片生成接口不存在（HTTP 404）：${url}`)
        continue
      }
      if (kind === 'images-edits-api' && [405, 415].includes(resp.status)) {
        attemptDiagnostics.push({ kind, url, status: resp.status })
        lastError = new Error(`图片编辑接口不兼容（HTTP ${resp.status}）：${url}`)
        continue
      }

      let responseText = ''
      let parsedResponse = { ok: false, value: null }
      if (resp.ok && payload?.stream && isEventStreamResponse(resp)) {
        const streamPayload = await readImageGenerationStreamPayload(resp, signal)
        if (streamPayload) {
          return { payload: streamPayload, requestMeta: { kind, url, streaming: true } }
        }
        throw new Error('图片生成流式接口返回了空响应')
      } else {
        responseText = await resp.text()
        parsedResponse = safeJsonParse(responseText)
      }

      if (!resp.ok) {
        const errJson = parsedResponse.ok ? parsedResponse.value : null
        const detail = errJson?.error?.message || (parsedResponse.ok ? stableStringify(errJson) : responseText)
        const detailText = String(detail || '').toLowerCase()

        if (
          kind === 'images-edits-api' &&
          (detailText.includes('unsupported') ||
            detailText.includes('not supported') ||
            detailText.includes('not support') ||
            detailText.includes('unknown parameter') ||
            detailText.includes('unrecognized') ||
            detailText.includes('not found'))
        ) {
          attemptDiagnostics.push({ kind, url, status: resp.status, detail: String(detail || '') })
          lastError = new Error(`图片编辑请求失败（HTTP ${resp.status}）：${detail || resp.statusText}`)
          continue
        }

        if (
          kind === 'images-api' &&
          payload.stream &&
          (detailText.includes('stream') || detailText.includes('partial_images') || detailText.includes('unsupported') || detailText.includes('unrecognized'))
        ) {
          attemptDiagnostics.push({ kind, url, status: resp.status, detail: String(detail || '') })
          lastError = new Error(`图片生成请求失败（HTTP ${resp.status}）：${detail || resp.statusText}`)
          continue
        }

        if (
          kind === 'images-api' &&
          payload.response_format === 'b64_json' &&
          (detailText.includes('response_format') || detailText.includes('b64_json') || detailText.includes('unsupported'))
        ) {
          attemptDiagnostics.push({ kind, url, status: resp.status, detail: String(detail || '') })
          lastError = new Error(`图片生成请求失败（HTTP ${resp.status}）：${detail || resp.statusText}`)
          continue
        }

        if (kind === 'images-api' && detailText.includes('not found')) {
          attemptDiagnostics.push({ kind, url, status: resp.status, detail: String(detail || '') })
          lastError = new Error(`图片生成接口不存在（HTTP ${resp.status}）：${url}`)
          continue
        }

        throw new Error(`图片生成请求失败（HTTP ${resp.status}）：${detail || resp.statusText}\nURL: ${url}`)
      }

      if (parsedResponse.ok) {
        if (kind === 'responses-api' && isResponsesApiImageSoftFailure(parsedResponse.value)) {
          attemptDiagnostics.push({ kind, url, status: resp.status, softFailure: true })
          lastError = new Error(
            buildImageGenerationCompatibilityError(parsedResponse.value, { kind, url }, { model: body.model, attempts: attemptDiagnostics })
          )
          continue
        }
        return { payload: parsedResponse.value, requestMeta: { kind, url } }
      }

      const plain = String(responseText || '').trim()
      if (plain) return { payload: plain, requestMeta: { kind, url } }
      throw new Error('图片生成接口返回了空响应')
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw err
      lastError = err
      continue
    }
  }

  const triedSummary = Array.from(new Set(triedUrls)).join('\n')
  if (triedSummary) {
    throw new Error(
      `${lastError?.message || '图片生成请求失败：未收到有效响应。'}\n已尝试以下端点：\n${triedSummary}`
    )
  }

  throw lastError || new Error('图片生成请求失败：未收到有效响应。')
}

async function postVideoGeneration({ baseUrl, apiKey, body, signal }) {
  const base = normalizeBaseUrl(baseUrl)
  const triedUrls = []
  let lastError = null
  const videoBody = await normalizeVideoGenerationRequestBody(body)
  const videoApiCandidates = uniqueNonEmpty([`${base}/videos`, !/\/v1$/i.test(base) ? `${base}/v1/videos` : ''])

  for (const url of videoApiCandidates) {
    triedUrls.push(url)
    try {
      const form = new FormData()
      form.set('model', String(videoBody.model || '').trim())
      form.set('prompt', String(videoBody.prompt || '').trim())
      appendFormDataRequestOptions(form, videoBody, ['model', 'prompt'])

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: form,
        signal
      })

      if (resp.status === 404) {
        lastError = new Error(`视频生成接口不存在（HTTP 404）：${url}`)
        continue
      }

      const responseText = await resp.text()
      const parsedResponse = safeJsonParse(responseText)
      if (!resp.ok) {
        const errJson = parsedResponse.ok ? parsedResponse.value : null
        const detail = errJson?.error?.message || (parsedResponse.ok ? stableStringify(errJson) : responseText)
        throw new Error(`视频生成请求失败（HTTP ${resp.status}）：${detail || resp.statusText}\nURL: ${url}`)
      }

      if (parsedResponse.ok) {
        return { payload: parsedResponse.value, requestMeta: { kind: 'videos-api', url, baseEndpoint: url } }
      }

      const plain = String(responseText || '').trim()
      if (plain) return { payload: plain, requestMeta: { kind: 'videos-api', url, baseEndpoint: url } }
      throw new Error('视频生成接口返回了空响应')
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw err
      lastError = err
      continue
    }
  }

  const triedSummary = Array.from(new Set(triedUrls)).join('\n')
  if (triedSummary) {
    throw new Error(`${lastError?.message || '视频生成请求失败：未收到有效响应。'}\n已尝试以下端点：\n${triedSummary}`)
  }
  throw lastError || new Error('视频生成请求失败：未收到有效响应。')
}

async function normalizeVideoGenerationRequestBody(body = {}) {
  const source = body && typeof body === 'object' ? body : {}
  const out = {
    model: source.model,
    prompt: source.prompt
  }

  const size = normalizeOpenAiVideoSize(source.size || source.resolution)
  if (size) out.size = size

  const seconds = normalizeOpenAiVideoSeconds(source.seconds ?? source.duration)
  if (seconds) out.seconds = seconds

  const inputReference =
    source.input_reference ??
    source.inputReference ??
    source.referenceImages ??
    source.reference_images ??
    source.inputImages ??
    source.input_images
  const references = await normalizeVideoReferenceImagesForRequest(inputReference, out.size)
  if (references.length) {
    out.input_reference = references.length === 1 ? references[0] : references
  } else if (inputReference !== undefined && inputReference !== null && inputReference !== '') {
    out.input_reference = inputReference
  }

  return out
}

function parseVideoSize(value) {
  const text = normalizeOpenAiVideoSize(value)
  const match = text.match(/^(\d{2,5})x(\d{2,5})$/)
  if (!match) return { width: 0, height: 0, size: '' }
  return {
    width: Number(match[1]) || 0,
    height: Number(match[2]) || 0,
    size: text
  }
}

function getImageSizeHint(ref = {}) {
  const width = Number(ref.width || ref.naturalWidth || 0)
  const height = Number(ref.height || ref.naturalHeight || 0)
  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : 0,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : 0
  }
}

async function normalizeVideoReferenceImagesForRequest(inputReference, size) {
  const refs = normalizeMediaReferenceImages(inputReference)
  const target = parseVideoSize(size)
  if (!refs.length || !target.width || !target.height) return refs

  const out = []
  for (const ref of refs) {
    out.push(await resizeVideoReferenceImageIfNeeded(ref, target))
  }
  return out
}

async function resizeVideoReferenceImageIfNeeded(ref = {}, target = {}) {
  const dataUrl = String(ref.dataUrl || '').trim()
  if (!isDataImageUrl(dataUrl)) {
    const sourceSize = getImageSizeHint(ref)
    if (sourceSize.width === target.width && sourceSize.height === target.height) return ref
    return ref
  }

  const resizedDataUrl = await resizeDataImageUrlToVideoCanvas(dataUrl, target.width, target.height)
  if (!resizedDataUrl || resizedDataUrl === dataUrl) return ref

  const baseName = String(ref.name || 'reference.png').replace(/\.[a-z0-9]+$/i, '')
  return {
    ...ref,
    dataUrl: resizedDataUrl,
    mime: 'image/png',
    name: `${baseName || 'reference'}-${target.size || `${target.width}x${target.height}`}.png`,
    width: target.width,
    height: target.height
  }
}

function loadDataImage(dataUrl) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image API unavailable'))
      return
    }
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load reference image'))
    img.src = dataUrl
  })
}

async function resizeDataImageUrlToVideoCanvas(dataUrl, width, height) {
  if (typeof document === 'undefined') return ''
  const targetWidth = Math.round(Number(width) || 0)
  const targetHeight = Math.round(Number(height) || 0)
  if (targetWidth <= 0 || targetHeight <= 0) return ''

  const img = await loadDataImage(dataUrl)
  const sourceWidth = Number(img.naturalWidth || img.width || 0)
  const sourceHeight = Number(img.naturalHeight || img.height || 0)
  if (!sourceWidth || !sourceHeight) return ''
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return dataUrl

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, targetWidth, targetHeight)

  const coverScale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight) * 1.08
  const coverWidth = sourceWidth * coverScale
  const coverHeight = sourceHeight * coverScale
  const coverX = (targetWidth - coverWidth) / 2
  const coverY = (targetHeight - coverHeight) / 2
  ctx.save()
  ctx.filter = 'blur(24px)'
  ctx.globalAlpha = 0.72
  ctx.drawImage(img, coverX, coverY, coverWidth, coverHeight)
  ctx.restore()

  const containScale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const drawWidth = sourceWidth * containScale
  const drawHeight = sourceHeight * containScale
  const drawX = (targetWidth - drawWidth) / 2
  const drawY = (targetHeight - drawHeight) / 2
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

  return canvas.toDataURL('image/png')
}

function normalizeOpenAiVideoSize(value) {
  const text = String(value || '').trim()
  return OPENAI_VIDEO_GENERATION_SIZES.has(text) ? text : ''
}

function normalizeOpenAiVideoSeconds(value) {
  if (value === undefined || value === null || value === '') return 0
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return OPENAI_VIDEO_GENERATION_SECONDS.reduce((best, candidate) => {
    return Math.abs(candidate - seconds) < Math.abs(best - seconds) ? candidate : best
  }, OPENAI_VIDEO_GENERATION_SECONDS[0])
}

function buildVideoStatusCandidates(baseEndpoint, videoId) {
  const base = String(baseEndpoint || '').replace(/\/+$/, '')
  const id = String(videoId || '').trim()
  if (!base || !id) return []
  return uniqueNonEmpty([`${base}/${id}`])
}

function buildVideoContentCandidates(baseEndpoint, videoId) {
  const base = String(baseEndpoint || '').replace(/\/+$/, '')
  const id = String(videoId || '').trim()
  if (!base || !id) return []
  return uniqueNonEmpty([`${base}/${id}/content`])
}

async function delayWithAbort(ms, abortState = null, signal = null) {
  if (!ms || ms <= 0) return
  throwIfAborted(abortState)
  if (signal?.aborted) throw createAbortError()
  await new Promise((resolve, reject) => {
    let settled = false
    let unregisterAbort = null
    let abortHandler = null
    let timer = null

    const finish = (fn) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timer)
      try {
        unregisterAbort?.()
      } catch {
        // ignore
      }
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler)
      fn()
    }

    const onAbort = () => {
      finish(() => reject(createAbortError()))
    }

    timer = globalThis.setTimeout(() => {
      finish(resolve)
    }, ms)

    unregisterAbort = abortState?.onAbort?.(onAbort) || null
    abortHandler = signal ? () => onAbort() : null
    if (signal && abortHandler) signal.addEventListener('abort', abortHandler, { once: true })
    if (abortState?.aborted || signal?.aborted) onAbort()
  })
}

async function fetchVideoGenerationStatus({ requestMeta, videoId, apiKey, signal }) {
  const candidates = buildVideoStatusCandidates(requestMeta?.baseEndpoint, videoId)
  let lastError = null

  for (const url of candidates) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        },
        signal
      })
      if (resp.status === 404) continue
      const responseText = await resp.text()
      const parsedResponse = safeJsonParse(responseText)
      if (!resp.ok) {
        const detail = parsedResponse.ok ? stableStringify(parsedResponse.value) : responseText
        throw new Error(`查询视频任务失败（HTTP ${resp.status}）：${detail || resp.statusText}`)
      }
      if (parsedResponse.ok) return parsedResponse.value
      return String(responseText || '').trim()
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw err
      lastError = err
    }
  }

  if (lastError) throw lastError
  return null
}

async function fetchVideoGenerationContentPayload({ requestMeta, videoId, apiKey, signal }) {
  const candidates = buildVideoContentCandidates(requestMeta?.baseEndpoint, videoId)
  let lastError = null

  for (const url of candidates) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        signal
      })
      if (resp.status === 404) continue
      if (!resp.ok) {
        const responseText = await resp.text()
        throw new Error(`获取视频内容失败（HTTP ${resp.status}）：${responseText || resp.statusText}`)
      }

      const blob = await resp.blob()
      if (!blob || !blob.size) throw new Error('视频内容为空')
      const objectUrl = URL.createObjectURL(blob)
      return {
        data: [
          {
            url: objectUrl,
            mime: blob.type || 'video/mp4',
            name: `video_${videoId}`
          }
        ]
      }
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw err
      lastError = err
    }
  }

  if (lastError) throw lastError
  return null
}

function uniqueNonEmpty(list = []) {
  return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)))
}

function appendFormDataRequestOptions(form, body, reservedKeys = []) {
  if (!form || !body || typeof body !== 'object') return
  const reserved = new Set((Array.isArray(reservedKeys) ? reservedKeys : []).map((key) => String(key)))
  Object.entries(body).forEach(([key, value]) => {
    if (reserved.has(key)) return
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((item, index) => appendFormDataValue(form, key, item, index, true))
      return
    }
    appendFormDataValue(form, key, value)
  })
}
