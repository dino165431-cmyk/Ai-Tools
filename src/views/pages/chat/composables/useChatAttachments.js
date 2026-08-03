import { computed, reactive, ref } from 'vue'
import { DocumentTextOutline, ImageOutline } from '@vicons/ionicons5'
import {
  MAX_ATTACHMENT_BATCH_BYTES,
  MAX_ATTACHMENT_FILE_BYTES,
  MAX_IMAGE_BYTES,
  buildDisplayImagesFromReferenceAttachments,
  buildImageAttachmentSummary,
  fileToDataUrl,
  getFileExt,
  guessExtensionFromMime,
  isImageAttachmentLike,
  isSupportedAttachmentFile,
  normalizeAttachmentName,
  normalizeMediaReferenceImagesForRequest,
  resolveChatLongTextAttachmentPlan
} from '@/utils/chatAttachmentUtils'
import { isImageAttachment } from '@/utils/chatMediaPresentation'

export function useChatAttachments({ createId, message }) {
  const pendingAttachments = ref([])
  const attachmentParseQueue = new Map()

  const pendingImageAttachments = computed(() => {
    const list = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
    return list.filter((item) => isImageAttachment(item))
  })

  const pendingFileAttachments = computed(() => {
    const list = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
    return list.filter((item) => !isImageAttachment(item))
  })

  async function collectAttachmentMediaReferenceImages(attachments = [], userDisplay = null) {
    const list = Array.isArray(attachments) ? attachments : []
    if (list.length) {
      await Promise.all(list.map((attachment) => ensureAttachmentParsed(attachment)))
    }

    const refs = []
    for (const attachment of list) {
      if (attachment?.status === 'ready' && attachment.kind === 'image' && attachment.dataUrl) {
        refs.push(attachment)
      }
    }

    const normalized = normalizeMediaReferenceImagesForRequest(refs)
    if (userDisplay && normalized.length && !(Array.isArray(userDisplay.images) && userDisplay.images.length)) {
      userDisplay.images = buildDisplayImagesFromReferenceAttachments(normalized, createId)
    }
    return normalized
  }

  function removeAttachment(id) {
    const list = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
    pendingAttachments.value = list.filter((attachment) => attachment?.id !== id)
  }

  function attachmentIcon(attachment) {
    const mime = String(attachment?.mime || '')
    const ext = String(attachment?.ext || '')
    if (isImageAttachmentLike({ mime, ext, kind: attachment?.kind })) return ImageOutline
    return DocumentTextOutline
  }

  async function parseAttachment(attachment) {
    const file = attachment?.file
    if (!file) throw new Error('附件文件为空')

    if (file.size > MAX_ATTACHMENT_FILE_BYTES) {
      throw new Error(`附件过大（${Math.ceil(file.size / 1024 / 1024)}MB），单文件上限为 ${Math.ceil(MAX_ATTACHMENT_FILE_BYTES / 1024 / 1024)}MB`)
    }

    const name = String(attachment.name || file.name || 'unnamed')
    const ext = String(attachment.ext || getFileExt(name) || guessExtensionFromMime(attachment.mime || file.type || '')).trim().toLowerCase()
    const mime = String(attachment.mime || file.type || '')

    if (isImageAttachmentLike({ mime, ext })) {
      if (file.size > MAX_IMAGE_BYTES) {
        return {
          kind: 'file',
          name,
          ext,
          mime,
          text: '',
          sandboxOnly: true,
          previewError: `图片超过 ${Math.ceil(MAX_IMAGE_BYTES / 1024 / 1024)}MB，本地预览已跳过`
        }
      }
      const dataUrl = await fileToDataUrl(file)
      const imageSummary = await buildImageAttachmentSummary({ file, name, ext, mime, dataUrl })
      return {
        kind: 'image',
        name,
        ext,
        mime,
        dataUrl,
        text: imageSummary.text,
        width: imageSummary.width,
        height: imageSummary.height,
        metaLine: imageSummary.metaLine,
        svgTextPreview: imageSummary.svgTextPreview
      }
    }

    // Non-image files are consumed from the per-chat sandbox. Renderer-side
    // extraction would duplicate work without adding request context.
    return { kind: 'file', name, ext, mime, text: '', sandboxOnly: true }
  }

  async function ensureAttachmentParsed(attachment) {
    if (!attachment?.id) return
    if (attachment.status === 'ready' || attachment.status === 'error') return

    if (attachmentParseQueue.has(attachment.id)) return attachmentParseQueue.get(attachment.id)

    const task = (async () => {
      attachment.status = 'processing'
      attachment.error = ''
      attachment.previewError = ''
      try {
        const parsed = await parseAttachment(attachment)
        attachment.kind = parsed.kind
        attachment.text = parsed.text || ''
        attachment.dataUrl = parsed.dataUrl || ''
        attachment.width = Number(parsed.width || 0)
        attachment.height = Number(parsed.height || 0)
        attachment.metaLine = parsed.metaLine || ''
        attachment.svgTextPreview = parsed.svgTextPreview || ''
        attachment.sandboxOnly = parsed.sandboxOnly === true
        attachment.previewError = parsed.previewError || ''
        attachment.status = 'ready'
      } catch (error) {
        // Preview parsing is non-blocking when the source File can still be
        // imported into the chat sandbox.
        if (
          attachment.file &&
          typeof attachment.file.arrayBuffer === 'function' &&
          Number(attachment.file.size || 0) <= MAX_ATTACHMENT_FILE_BYTES
        ) {
          attachment.kind = 'file'
          attachment.text = ''
          attachment.dataUrl = ''
          attachment.width = 0
          attachment.height = 0
          attachment.metaLine = ''
          attachment.svgTextPreview = ''
          attachment.sandboxOnly = true
          attachment.previewError = error?.message || String(error)
          attachment.status = 'ready'
        } else {
          attachment.status = 'error'
          attachment.error = error?.message || String(error)
        }
      } finally {
        attachmentParseQueue.delete(attachment.id)
      }
    })()

    attachmentParseQueue.set(attachment.id, task)
    return task
  }

  function createPendingAttachment(file, options = {}) {
    const normalizedName = normalizeAttachmentName(file, options)
    return reactive({
      id: createId(),
      name: normalizedName,
      ext: getFileExt(normalizedName) || guessExtensionFromMime(file?.type),
      mime: file?.type || '',
      size: file?.size || 0,
      file,
      kind: '',
      text: '',
      dataUrl: '',
      width: 0,
      height: 0,
      metaLine: '',
      svgTextPreview: '',
      sandboxOnly: false,
      previewError: '',
      status: 'pending',
      error: '',
      autoWrappedLongText: options.autoWrappedLongText === true
    })
  }

  function createLongTextAttachmentFile(plan) {
    try {
      return new File([plan.attachmentText], plan.attachmentName, {
        type: plan.attachmentMime,
        lastModified: Date.now()
      })
    } catch {
      try {
        const file = new Blob([plan.attachmentText], { type: plan.attachmentMime })
        Object.defineProperty(file, 'name', {
          configurable: true,
          enumerable: true,
          value: plan.attachmentName
        })
        return file
      } catch {
        return null
      }
    }
  }

  function createPendingLongTextAttachment(plan) {
    const file = createLongTextAttachmentFile(plan)
    if (!file) return null
    const attachment = createPendingAttachment(file, {
      name: plan.attachmentName,
      autoWrappedLongText: true
    })
    void ensureAttachmentParsed(attachment)
    return attachment
  }

  function appendPendingFiles(files, options = {}) {
    const list = Array.isArray(files) ? files.filter(Boolean) : []
    if (!list.length) return 0

    const current = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
    const oversizedFile = list.find((file) => Number(file?.size || 0) > MAX_ATTACHMENT_FILE_BYTES)
    if (oversizedFile) {
      message.warning(`附件“${oversizedFile.name || '未命名文件'}”超过单文件上限（${Math.ceil(MAX_ATTACHMENT_FILE_BYTES / 1024 / 1024)}MB）`)
      return 0
    }

    const totalBytes = current.reduce((sum, attachment) => sum + Number(attachment?.size || 0), 0) + list.reduce((sum, file) => sum + Number(file?.size || 0), 0)
    if (totalBytes > MAX_ATTACHMENT_BATCH_BYTES) {
      message.warning(`附件总大小超过单次上限（${Math.ceil(MAX_ATTACHMENT_BATCH_BYTES / 1024 / 1024)}MB），请减少文件数量或大小`)
      return 0
    }

    const added = list.map((file) => createPendingAttachment(file, options))
    pendingAttachments.value = [...current, ...added]
    added.forEach((attachment) => ensureAttachmentParsed(attachment))
    return added.length
  }

  function getSupportedClipboardFiles(event) {
    const files = []
    const seen = new Set()
    const addFile = (file) => {
      if (!file || !isSupportedAttachmentFile(file)) return
      const key = [
        String(file.name || '').trim().toLowerCase(),
        Number(file.size || 0),
        String(file.type || '').trim().toLowerCase()
      ].join('|')
      if (seen.has(key)) return
      seen.add(key)
      files.push(file)
    }

    Array.from(event?.clipboardData?.items || []).forEach((item) => {
      addFile(item?.kind === 'file' ? item.getAsFile?.() : null)
    })
    Array.from(event?.clipboardData?.files || []).forEach(addFile)
    return files
  }

  function handleComposerPaste(event) {
    const files = getSupportedClipboardFiles(event)
    if (files.length) {
      event.preventDefault()
      const addedCount = appendPendingFiles(files)
      if (addedCount > 0) message.success(`Added ${addedCount} attachments`)
      return
    }

    const pastedText = String(event?.clipboardData?.getData?.('text/plain') || '')
    const current = Array.isArray(pendingAttachments.value) ? pendingAttachments.value : []
    const plan = resolveChatLongTextAttachmentPlan(pastedText, current)
    if (!plan.wrapped) {
      if (plan.error) {
        event.preventDefault()
        message.warning(plan.error)
      }
      return
    }

    event.preventDefault()
    const attachment = createPendingLongTextAttachment(plan)
    if (!attachment) {
      message.warning('当前环境无法创建长文本附件，请改为手动上传 Markdown 文件。')
      return
    }
    pendingAttachments.value = [...current, attachment]
    message.success('粘贴内容较长，已自动添加为 Markdown 附件')
  }

  function handleFileInputChange(event) {
    const files = Array.from(event?.target?.files || [])
    try {
      if (event?.target) event.target.value = ''
    } catch {
      // ignore read-only file inputs
    }
    if (files.length) appendPendingFiles(files)
  }

  return {
    pendingAttachments,
    pendingImageAttachments,
    pendingFileAttachments,
    collectAttachmentMediaReferenceImages,
    removeAttachment,
    attachmentIcon,
    ensureAttachmentParsed,
    createPendingLongTextAttachment,
    appendPendingFiles,
    handleComposerPaste,
    handleFileInputChange
  }
}
