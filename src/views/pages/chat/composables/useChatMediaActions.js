import { canWriteClipboardMime, normalizeClipboardMediaMime } from '@/utils/chatClipboard.js'
import { normalizeMediaDimension } from '@/utils/chatMediaMetadata.js'
import { persistChatMediaListAssets, resolveChatMediaAssetPath } from '@/utils/chatMediaAssets.js'
import { resolvePath } from '@/utils/fileOperations'
import { safeOpenExternal } from '@/utils/safeOpenExternal'

export function ensureFilenameExt(nameRaw, mime) {
  const name = String(nameRaw || '').trim()
  const mt = String(mime || '').trim().toLowerCase()
  const hasExt = /\.[a-z0-9]+$/i.test(name)
  if (name && hasExt) return name

  let ext = 'png'
  if (mt.includes('jpeg') || mt.includes('jpg')) ext = 'jpg'
  else if (mt.includes('gif')) ext = 'gif'
  else if (mt.includes('webp')) ext = 'webp'
  else if (mt.includes('bmp')) ext = 'bmp'
  else if (mt.includes('mp4')) ext = 'mp4'
  else if (mt.includes('webm')) ext = 'webm'
  else if (mt.includes('quicktime') || mt.includes('mov')) ext = 'mov'
  else if (mt.includes('x-m4v') || mt.includes('m4v')) ext = 'm4v'

  if (!name) return `image_${Date.now()}.${ext}`
  return `${name}.${ext}`
}

export function useChatMediaActions({
  activeSessionFilePath,
  message,
  copyToClipboard,
  scheduleSessionAutosave,
  scheduleRefreshUserAnchorMeta
}) {
  function copyChatImageLink(img) {
    const src = String(img?.src || '').trim()
    if (!src) return
    copyToClipboard(src)
  }

  function copyChatVideoLink(video) {
    const src = String(video?.src || '').trim()
    if (!src) return
    copyToClipboard(src)
  }

  async function loadChatImageBlob(img) {
    const src = String(img?.src || '').trim()
    if (!src) throw new Error('图片链接为空')

    const response = await fetch(src)
    if (!response.ok) {
      throw new Error(`加载图片失败（HTTP ${response.status}）`)
    }

    const blob = await response.blob()
    if (!blob || !blob.size) {
      throw new Error('图片内容为空')
    }
    return blob
  }

  async function loadChatVideoBlob(video) {
    const src = String(video?.src || '').trim()
    if (!src) throw new Error('视频链接为空')

    const response = await fetch(src)
    if (!response.ok) {
      throw new Error(`加载视频失败（HTTP ${response.status}）`)
    }

    const blob = await response.blob()
    if (!blob || !blob.size) {
      throw new Error('视频内容为空')
    }
    return blob
  }

  function withPreferredBlobMime(blob, mime) {
    const preferred = String(mime || '').trim()
    if (!preferred || String(blob?.type || '').trim().toLowerCase() === preferred.toLowerCase()) return blob
    try {
      return new Blob([blob], { type: preferred })
    } catch {
      return blob
    }
  }

  async function copyChatImage(img) {
    const src = String(img?.src || '').trim()
    if (!src) return

    try {
      if (await copyChatImageFile(img)) {
        message.success('图片已复制到剪贴板')
        return
      }
      if (!await copyChatImageBlob(img)) {
        throw new Error('clipboard image mime unsupported')
      }
      message.success('图片已复制到剪贴板')
    } catch (err) {
      copyChatImageLink(img)
      message.warning(`当前环境不支持直接复制图片，已改为复制图片链接：${err?.message || String(err)}`)
    }
  }

  function getActiveChatImageAssetPath(img) {
    const sessionFilePath = String(activeSessionFilePath.value || '').trim()
    return (
      resolveChatMediaAssetPath(img, { sessionFilePath }) ||
      String(img?.assetPath || img?.localPath || img?.fileRelPath || '').trim()
    )
  }

  async function ensureChatImageAssetPath(img) {
    let assetPath = getActiveChatImageAssetPath(img)
    if (assetPath) return assetPath

    const sessionFilePath = String(activeSessionFilePath.value || '').trim()
    const src = String(img?.src || '').trim()
    if (!sessionFilePath || !src) return ''

    const persisted = await persistChatMediaListAssets([img], {
      kind: 'image',
      messageId: img?.messageId || img?.id || 'image',
      sessionFilePath
    })
    const next = persisted?.[0]
    assetPath = getActiveChatImageAssetPath(next)
    if (assetPath && next && typeof img === 'object') {
      Object.assign(img, next)
      scheduleSessionAutosave()
    }
    return assetPath || ''
  }

  async function copyChatImageFile(img) {
    const copyFile = globalThis?.utools?.copyFile
    if (typeof copyFile !== 'function') return false

    const assetPath = await ensureChatImageAssetPath(img)
    if (!assetPath) return false

    const absPath = String(await resolvePath(assetPath) || '').trim()
    if (!absPath) return false
    return !!copyFile(absPath)
  }

  async function copyChatImageBlob(img) {
    const clipboardApi = navigator?.clipboard
    if (!clipboardApi?.write || typeof ClipboardItem === 'undefined') return false

    const blob = await loadChatImageBlob(img)
    const mime = normalizeClipboardMediaMime(blob.type || img?.mime, 'image/png', 'image/') || 'image/png'
    if (!canWriteClipboardMime(mime, ClipboardItem)) return false
    const clipboardBlob = withPreferredBlobMime(blob, mime)
    await clipboardApi.write([
      new ClipboardItem({
        [mime]: clipboardBlob
      })
    ])
    return true
  }

  function getActiveChatVideoAssetPath(video) {
    const sessionFilePath = String(activeSessionFilePath.value || '').trim()
    return (
      resolveChatMediaAssetPath(video, { sessionFilePath }) ||
      String(video?.assetPath || video?.localPath || video?.fileRelPath || '').trim()
    )
  }

  async function ensureChatVideoAssetPath(video) {
    let assetPath = getActiveChatVideoAssetPath(video)
    if (assetPath) return assetPath

    const sessionFilePath = String(activeSessionFilePath.value || '').trim()
    const src = String(video?.src || '').trim()
    if (!sessionFilePath || !src) return ''

    const persisted = await persistChatMediaListAssets([video], {
      kind: 'video',
      messageId: video?.messageId || video?.id || 'video',
      sessionFilePath
    })
    const next = persisted?.[0]
    assetPath = getActiveChatVideoAssetPath(next)
    if (assetPath && next && typeof video === 'object') {
      Object.assign(video, next)
      scheduleSessionAutosave()
    }
    return assetPath || ''
  }

  async function copyChatVideoFile(video) {
    const copyFile = globalThis?.utools?.copyFile
    if (typeof copyFile !== 'function') return false

    const assetPath = await ensureChatVideoAssetPath(video)
    if (!assetPath) return false

    const absPath = String(await resolvePath(assetPath) || '').trim()
    if (!absPath) return false
    return !!copyFile(absPath)
  }

  async function copyChatVideoBlob(video) {
    const clipboardApi = navigator?.clipboard
    if (!clipboardApi?.write || typeof ClipboardItem === 'undefined') return false

    const blob = await loadChatVideoBlob(video)
    const mime = normalizeClipboardMediaMime(blob.type || video?.mime, 'video/mp4', 'video/') || 'video/mp4'
    if (!canWriteClipboardMime(mime, ClipboardItem)) return false
    const clipboardBlob = withPreferredBlobMime(blob, mime)
    await clipboardApi.write([
      new ClipboardItem({
        [mime]: clipboardBlob
      })
    ])
    return true
  }

  async function copyChatVideo(video) {
    const src = String(video?.src || '').trim()
    if (!src) return

    try {
      if (await copyChatVideoFile(video)) {
        message.success('视频文件已复制到剪贴板')
        return
      }
    } catch {
      // 继续尝试浏览器剪贴板写入。
    }

    try {
      if (await copyChatVideoBlob(video)) {
        message.success('视频已复制到剪贴板')
        return
      }
    } catch {
      // 继续降级为复制链接。
    }

    copyChatVideoLink(video)
    message.warning('当前环境不支持直接复制视频文件，已改为复制视频链接')
  }

  function downloadChatImage(img) {
    const src = String(img?.src || '').trim()
    if (!src) return

    const triggerDownload = (href, filename) => {
      const a = document.createElement('a')
      a.href = href
      a.download = filename
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }

    const filename = ensureFilenameExt(img?.name, img?.mime)

    if (src.startsWith('data:')) {
      try {
        triggerDownload(src, filename)
        return
      } catch (err) {
        message.error('下载失败：' + (err?.message || String(err)))
        return
      }
    }

    if (/^blob:/i.test(src)) {
      try {
        triggerDownload(src, filename)
        return
      } catch (err) {
        message.error('下载失败：' + (err?.message || String(err)))
        return
      }
    }

    if (/^https?:\/\//i.test(src)) {
      loadChatImageBlob(img)
        .then((blob) => {
          const mime = normalizeClipboardMediaMime(blob.type || img?.mime, 'image/png', 'image/') || 'image/png'
          const downloadableBlob = withPreferredBlobMime(blob, mime)
          const objectUrl = URL.createObjectURL(downloadableBlob)
          try {
            triggerDownload(objectUrl, ensureFilenameExt(img?.name, mime))
          } finally {
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200)
          }
        })
        .catch((err) => {
          copyChatImageLink(img)
          safeOpenExternal(src)
          message.info('已复制图片链接。如无法直接下载，请在浏览器中打开后再保存。' + ((err && err.message) ? `（${err.message}）` : ''))
        })
      return
    }

    message.warning('暂不支持下载该图片来源')
  }

  function downloadChatVideo(video) {
    const src = String(video?.src || '').trim()
    if (!src) return

    const triggerDownload = (href, filename) => {
      const a = document.createElement('a')
      a.href = href
      a.download = filename
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }

    const fallbackName = String(video?.name || '').trim() || `video_${Date.now()}`
    const filename = ensureFilenameExt(fallbackName, video?.mime || 'video/mp4')

    if (src.startsWith('data:')) {
      try {
        triggerDownload(src, filename)
        return
      } catch (err) {
        message.error('下载失败：' + (err?.message || String(err)))
        return
      }
    }

    if (/^blob:/i.test(src)) {
      try {
        triggerDownload(src, filename)
        return
      } catch (err) {
        message.error('下载失败：' + (err?.message || String(err)))
        return
      }
    }

    if (/^https?:\/\//i.test(src)) {
      loadChatVideoBlob(video)
        .then((blob) => {
          const mime = normalizeClipboardMediaMime(blob.type || video?.mime, 'video/mp4', 'video/') || 'video/mp4'
          const downloadableBlob = withPreferredBlobMime(blob, mime)
          const objectUrl = URL.createObjectURL(downloadableBlob)
          try {
            triggerDownload(objectUrl, ensureFilenameExt(fallbackName, mime))
          } finally {
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200)
          }
        })
        .catch((err) => {
          copyChatVideoLink(video)
          safeOpenExternal(src)
          message.info('已复制视频链接。如无法直接下载，请在浏览器中打开后再保存。' + ((err && err.message) ? `（${err.message}）` : ''))
        })
      return
    }

    message.warning('暂不支持下载该视频来源')
  }

  function updateChatImageMetadata(img, event) {
    if (!img || typeof img !== 'object') return
    const el = event?.target
    if (!(el instanceof HTMLImageElement)) return
    const width = normalizeMediaDimension(el.naturalWidth || el.width)
    const height = normalizeMediaDimension(el.naturalHeight || el.height)
    let changed = false
    if (width > 0 && !normalizeMediaDimension(img.width)) {
      img.width = width
      changed = true
    }
    if (height > 0 && !normalizeMediaDimension(img.height)) {
      img.height = height
      changed = true
    }
    if (changed) {
      img.resolution = `${normalizeMediaDimension(img.width)}x${normalizeMediaDimension(img.height)}`
      img.metaLine = ''
      scheduleRefreshUserAnchorMeta()
    }
  }

  function updateChatVideoMetadata(video, event) {
    if (!video || typeof video !== 'object') return
    const el = event?.target
    if (!(el instanceof HTMLVideoElement)) return
    const width = normalizeMediaDimension(el.videoWidth)
    const height = normalizeMediaDimension(el.videoHeight)
    const duration = Number(el.duration)
    let changed = false
    if (width > 0 && !normalizeMediaDimension(video.width)) {
      video.width = width
      changed = true
    }
    if (height > 0 && !normalizeMediaDimension(video.height)) {
      video.height = height
      changed = true
    }
    if (Number.isFinite(duration) && duration > 0 && !(Number(video.durationSeconds) > 0)) {
      video.durationSeconds = duration
      changed = true
    }
    if (changed) {
      if (normalizeMediaDimension(video.width) && normalizeMediaDimension(video.height)) {
        video.resolution = `${normalizeMediaDimension(video.width)}x${normalizeMediaDimension(video.height)}`
      }
      video.metaLine = ''
      scheduleRefreshUserAnchorMeta()
    }
  }

  return {
    copyChatImage,
    copyChatVideo,
    downloadChatImage,
    downloadChatVideo,
    updateChatImageMetadata,
    updateChatVideoMetadata
  }
}
