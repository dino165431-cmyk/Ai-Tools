export function collectSessionMediaItems(messages, {
  imageMetaLabel = () => '',
  videoMetaLabel = () => ''
} = {}) {
  const items = []
  ;(Array.isArray(messages) ? messages : []).forEach((msg) => {
    if (!msg || msg.role !== 'assistant') return

    const messageId = String(msg.id || '').trim()
    const imagePrompt = String(msg.imagePrompt || msg.mediaRequest?.prompt || '').trim()
    const videoPrompt = String(msg.videoPrompt || msg.mediaRequest?.prompt || '').trim()

    ;(Array.isArray(msg.images) ? msg.images : []).forEach((media, index) => {
      const src = String(media?.src || '').trim()
      if (!src) return
      items.push({
        key: `${messageId || 'message'}-image-${String(media?.id || index)}`,
        kind: 'image',
        message: msg,
        media,
        src,
        name: String(media?.name || `image_${index + 1}`).trim() || `image_${index + 1}`,
        prompt: imagePrompt,
        meta: imageMetaLabel(media)
      })
    })

    ;(Array.isArray(msg.videos) ? msg.videos : []).forEach((media, index) => {
      const src = String(media?.src || '').trim()
      if (!src) return
      items.push({
        key: `${messageId || 'message'}-video-${String(media?.id || index)}`,
        kind: 'video',
        message: msg,
        media,
        src,
        name: String(media?.name || `video_${index + 1}`).trim() || `video_${index + 1}`,
        prompt: videoPrompt,
        meta: videoMetaLabel(media)
      })
    })
  })
  return items
}

export function countSessionMediaItems(messages) {
  let count = 0
  ;(Array.isArray(messages) ? messages : []).forEach((msg) => {
    if (!msg || msg.role !== 'assistant') return
    count += Array.isArray(msg.images) ? msg.images.filter((media) => String(media?.src || '').trim()).length : 0
    count += Array.isArray(msg.videos) ? msg.videos.filter((media) => String(media?.src || '').trim()).length : 0
  })
  return count
}

export function filterSessionMediaItems(items, filter = 'all') {
  const normalized = String(filter || 'all').trim()
  const list = Array.isArray(items) ? items : []
  if (normalized !== 'image' && normalized !== 'video') return list
  return list.filter((item) => item?.kind === normalized)
}
