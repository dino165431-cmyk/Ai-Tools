import { computed, nextTick, ref } from 'vue'
import { shouldShowChatAnchorRail } from '@/utils/chatDisplayFolding.js'

export function getChatUserAnchorPreview(message) {
  const text = String(message?.content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0] || ''
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return '(empty)'
  return flat.length > 40 ? `${flat.slice(0, 40)}...` : flat
}

export function findLastChatAnchorTopAtOrBefore(meta, targetTop) {
  const list = Array.isArray(meta) ? meta : []
  let left = 0
  let right = list.length - 1
  let answer = -1
  while (left <= right) {
    const middle = (left + right) >> 1
    const top = Number(list[middle]?.top)
    if (Number.isFinite(top) && top <= targetTop) {
      answer = middle
      left = middle + 1
    } else {
      right = middle - 1
    }
  }
  return answer
}

export function useChatUserAnchors({
  messages,
  isDenseLayout,
  getMessageTop,
  getScrollContainer,
  ensureLayoutObserver,
  onAfterRefresh
}) {
  const userAnchorMeta = ref([])
  const activeAnchorId = ref(null)
  const userAnchorElMap = new Map()
  let anchorMetaRefreshScheduled = false

  const userAnchors = computed(() => {
    const anchors = []
    for (const message of messages.value || []) {
      if (!message || message.role !== 'user') continue
      const index = anchors.length + 1
      anchors.push({
        id: message.id,
        domId: `q-${message.id}`,
        index,
        preview: getChatUserAnchorPreview(message)
      })
    }
    return anchors
  })

  const showAnchorRail = computed(() => (
    shouldShowChatAnchorRail(userAnchors.value.length, { dense: isDenseLayout.value })
  ))

  function refreshUserAnchorMeta() {
    userAnchorMeta.value = userAnchors.value
      .map((anchor) => {
        const top = getMessageTop(anchor.id)
        if (!Number.isFinite(top)) return null
        return { ...anchor, top }
      })
      .filter(Boolean)
  }

  function updateActiveAnchorFromScroll(container) {
    const element = container || getScrollContainer()
    if (!element) return
    if (userAnchorMeta.value.length !== userAnchors.value.length) refreshUserAnchorMeta()

    const meta = userAnchorMeta.value
    if (!meta.length) {
      activeAnchorId.value = null
      return
    }

    const scrollTop = element.scrollTop
    const viewBottom = scrollTop + element.clientHeight
    const margin = 8

    let active = null
    const currentTop = scrollTop + margin
    const activeIndex = findLastChatAnchorTopAtOrBefore(meta, currentTop)
    if (activeIndex >= 0) active = meta[activeIndex]?.id || null

    if (!active) {
      const lowerBound = scrollTop - margin
      const upperBound = viewBottom + margin
      let firstInViewIndex = findLastChatAnchorTopAtOrBefore(meta, lowerBound)
      firstInViewIndex = Math.max(0, firstInViewIndex)
      if (Number(meta[firstInViewIndex]?.top) < lowerBound) firstInViewIndex += 1

      for (let index = firstInViewIndex; index < meta.length; index += 1) {
        const top = Number(meta[index]?.top)
        if (!Number.isFinite(top)) continue
        if (top > upperBound) break
        active = meta[index]?.id || null
        break
      }

      if (!active) active = meta[0]?.id || null
    }

    activeAnchorId.value = active
  }

  function scheduleRefreshUserAnchorMeta() {
    if (anchorMetaRefreshScheduled) return
    anchorMetaRefreshScheduled = true

    const raf = window?.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16))
    raf(async () => {
      anchorMetaRefreshScheduled = false
      await nextTick()
      const container = getScrollContainer()
      ensureLayoutObserver?.()
      refreshUserAnchorMeta()
      updateActiveAnchorFromScroll(container)
      onAfterRefresh?.(container)
    })
  }

  function pruneUserAnchors(validIds) {
    const ids = validIds instanceof Set ? validIds : new Set(validIds || [])
    Array.from(userAnchorElMap.keys()).forEach((id) => {
      if (!ids.has(id)) userAnchorElMap.delete(id)
    })
    if (activeAnchorId.value && !ids.has(activeAnchorId.value)) activeAnchorId.value = null
    scheduleRefreshUserAnchorMeta()
  }

  function resetUserAnchors() {
    userAnchorElMap.clear()
    userAnchorMeta.value = []
    activeAnchorId.value = null
  }

  return {
    userAnchorMeta,
    activeAnchorId,
    userAnchorElMap,
    userAnchors,
    showAnchorRail,
    refreshUserAnchorMeta,
    updateActiveAnchorFromScroll,
    scheduleRefreshUserAnchorMeta,
    pruneUserAnchors,
    resetUserAnchors
  }
}
