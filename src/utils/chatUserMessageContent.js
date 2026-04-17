const ATTACHMENT_BLOCK_HEADER = '【附件内容】'

function isObjectLike(value) {
  return !!value && typeof value === 'object'
}

function isTextPart(part) {
  return isObjectLike(part) && (part.type === 'text' || typeof part.text === 'string' || typeof part.content === 'string')
}

function getTextPartValue(part) {
  if (!isObjectLike(part)) return ''
  if (typeof part.text === 'string') return part.text
  if (typeof part.content === 'string') return part.content
  return ''
}

function setTextPartValue(part, value) {
  const cloned = isObjectLike(part) ? { ...part } : { type: 'text' }
  if (cloned.type === 'text' || Object.prototype.hasOwnProperty.call(cloned, 'text') || !Object.prototype.hasOwnProperty.call(cloned, 'content')) {
    cloned.text = value
    if (!cloned.type) cloned.type = 'text'
    return cloned
  }
  cloned.content = value
  return cloned
}

function extractPrimaryUserTextContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    return content
      .filter(isTextPart)
      .map((part) => getTextPartValue(part))
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }

  if (isObjectLike(content)) {
    if (typeof content.text === 'string') return content.text
    if (typeof content.content === 'string') return content.content
  }

  return ''
}

export function splitUserTextAndAttachmentBlock(text) {
  const raw = String(text || '')
  const markerIndex = raw.indexOf(ATTACHMENT_BLOCK_HEADER)
  if (markerIndex === -1) {
    return {
      leadText: raw.trim(),
      attachmentBlock: '',
      hasAttachmentBlock: false
    }
  }

  return {
    leadText: raw.slice(0, markerIndex).trim(),
    attachmentBlock: raw.slice(markerIndex).trim(),
    hasAttachmentBlock: true
  }
}

export function extractEditableUserTextFromContent(content) {
  return splitUserTextAndAttachmentBlock(extractPrimaryUserTextContent(content)).leadText
}

export function contentHasUserAttachments(content) {
  if (Array.isArray(content) && content.some((part) => part?.type === 'image_url')) return true
  return splitUserTextAndAttachmentBlock(extractPrimaryUserTextContent(content)).hasAttachmentBlock
}

export function mergeUserTextWithExistingAttachments(content, nextText = '') {
  const nextLeadText = String(nextText ?? '').trim()
  const currentText = extractPrimaryUserTextContent(content)
  const { attachmentBlock } = splitUserTextAndAttachmentBlock(currentText)
  const mergedText = [nextLeadText, attachmentBlock].filter(Boolean).join('\n\n').trim()

  if (Array.isArray(content)) {
    const next = content.map((part) => (isObjectLike(part) ? { ...part } : part))
    const textIndex = next.findIndex((part) => isTextPart(part))
    if (textIndex >= 0) {
      next[textIndex] = setTextPartValue(next[textIndex], mergedText)
      return next
    }
    if (mergedText) next.unshift({ type: 'text', text: mergedText })
    return next
  }

  if (isObjectLike(content)) {
    if (typeof content.text === 'string') return { ...content, text: mergedText }
    if (typeof content.content === 'string') return { ...content, content: mergedText }
    if (mergedText) return { ...content, text: mergedText }
    return { ...content }
  }

  return mergedText
}
