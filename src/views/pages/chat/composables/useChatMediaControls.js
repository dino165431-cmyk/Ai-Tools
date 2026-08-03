import { computed, reactive, ref } from 'vue'
import {
  buildMediaGenerationManualRequestOptions,
  createDefaultImageGenerationParams,
  createDefaultVideoGenerationParams,
  normalizeImageGenerationParams,
  normalizeMediaGenerationParamsEnabled,
  normalizeVideoGenerationParams,
  summarizeImageGenerationParams,
  summarizeVideoGenerationParams
} from '@/utils/chatMediaGenerationParams.js'

export function normalizeChatMediaGenerationMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (mode === 'on' || mode === 'off') return mode
  return 'auto'
}

export function useChatMediaControls() {
  const thinkingEffort = ref('auto')
  const imageGenerationMode = ref('auto')
  const videoGenerationMode = ref('auto')
  const imageGenerationParamsEnabled = ref(false)
  const imageGenerationParams = reactive(createDefaultImageGenerationParams())
  const videoGenerationParamsEnabled = ref(false)
  const videoGenerationParams = reactive(createDefaultVideoGenerationParams())

  const thinkingEffortLabel = computed(() => {
    const value = String(thinkingEffort.value || 'auto')
    if (value === 'none') return '关闭'
    if (value === 'minimal') return '极低'
    if (value === 'low') return '低'
    if (value === 'medium') return '中'
    if (value === 'high') return '高'
    if (value === 'xhigh') return '很高'
    if (value === 'max') return '最高'
    return '自动'
  })

  const imageGenerationModeLabel = computed(() => {
    const value = String(imageGenerationMode.value || 'auto')
    if (value === 'on') return '开启'
    if (value === 'off') return '关闭'
    return '自动'
  })

  const videoGenerationModeLabel = computed(() => {
    const value = String(videoGenerationMode.value || 'auto')
    if (value === 'on') return '开启'
    if (value === 'off') return '关闭'
    return '自动'
  })

  const imageGenerationParamsSummary = computed(() =>
    summarizeImageGenerationParams(imageGenerationParamsEnabled.value, imageGenerationParams)
  )

  const videoGenerationParamsSummary = computed(() =>
    summarizeVideoGenerationParams(videoGenerationParamsEnabled.value, videoGenerationParams)
  )

  const mediaGenerationParamsAutosaveKey = computed(() =>
    JSON.stringify({
      imageEnabled: imageGenerationParamsEnabled.value,
      image: normalizeImageGenerationParams(imageGenerationParams),
      videoEnabled: videoGenerationParamsEnabled.value,
      video: normalizeVideoGenerationParams(videoGenerationParams)
    })
  )

  const showInputModeTags = computed(() => (
    thinkingEffort.value !== 'auto' ||
    normalizeChatMediaGenerationMode(imageGenerationMode.value) !== 'auto' ||
    normalizeChatMediaGenerationMode(videoGenerationMode.value) !== 'auto' ||
    imageGenerationParamsEnabled.value ||
    videoGenerationParamsEnabled.value
  ))

  const thinkingEffortButtonType = computed(() => (
    thinkingEffort.value !== 'auto' ? 'primary' : 'default'
  ))

  function setImageGenerationMode(nextMode) {
    imageGenerationMode.value = normalizeChatMediaGenerationMode(nextMode)
  }

  function setVideoGenerationMode(nextMode) {
    videoGenerationMode.value = normalizeChatMediaGenerationMode(nextMode)
  }

  function assignImageGenerationParams(nextParams = {}) {
    Object.assign(imageGenerationParams, normalizeImageGenerationParams(nextParams))
  }

  function assignVideoGenerationParams(nextParams = {}) {
    Object.assign(videoGenerationParams, normalizeVideoGenerationParams(nextParams))
  }

  function setImageGenerationParamsEnabled(enabled) {
    imageGenerationParamsEnabled.value = normalizeMediaGenerationParamsEnabled(enabled)
  }

  function setVideoGenerationParamsEnabled(enabled) {
    videoGenerationParamsEnabled.value = normalizeMediaGenerationParamsEnabled(enabled)
  }

  function resetImageGenerationParams() {
    assignImageGenerationParams(createDefaultImageGenerationParams())
  }

  function resetVideoGenerationParams() {
    assignVideoGenerationParams(createDefaultVideoGenerationParams())
  }

  function getCurrentImageGenerationRequestOptions() {
    return buildMediaGenerationManualRequestOptions(
      'image',
      imageGenerationParamsEnabled.value,
      imageGenerationParams
    )
  }

  function getCurrentVideoGenerationRequestOptions() {
    return buildMediaGenerationManualRequestOptions(
      'video',
      videoGenerationParamsEnabled.value,
      videoGenerationParams
    )
  }

  function cycleImageGenerationMode() {
    const order = ['auto', 'on', 'off']
    const index = order.indexOf(normalizeChatMediaGenerationMode(imageGenerationMode.value))
    setImageGenerationMode(order[(index + 1 + order.length) % order.length])
  }

  function cycleVideoGenerationMode() {
    const order = ['auto', 'on', 'off']
    const index = order.indexOf(normalizeChatMediaGenerationMode(videoGenerationMode.value))
    setVideoGenerationMode(order[(index + 1 + order.length) % order.length])
  }

  return {
    thinkingEffort,
    thinkingEffortLabel,
    thinkingEffortButtonType,
    imageGenerationMode,
    imageGenerationModeLabel,
    imageGenerationParamsEnabled,
    imageGenerationParams,
    imageGenerationParamsSummary,
    videoGenerationMode,
    videoGenerationModeLabel,
    videoGenerationParamsEnabled,
    videoGenerationParams,
    videoGenerationParamsSummary,
    mediaGenerationParamsAutosaveKey,
    showInputModeTags,
    setImageGenerationMode,
    setVideoGenerationMode,
    assignImageGenerationParams,
    assignVideoGenerationParams,
    setImageGenerationParamsEnabled,
    setVideoGenerationParamsEnabled,
    resetImageGenerationParams,
    resetVideoGenerationParams,
    getCurrentImageGenerationRequestOptions,
    getCurrentVideoGenerationRequestOptions,
    cycleImageGenerationMode,
    cycleVideoGenerationMode
  }
}
