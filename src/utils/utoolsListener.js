import { ref } from 'vue'

const EMPTY_ENTER_DATA = {
  code: '',
  type: '',
  payload: '',
  from: '',
  option: ''
}

const utoolsEnterEventData = ref({ ...EMPTY_ENTER_DATA })

let hasBoundHostListeners = false
let onEnterHandler = null
let onOutHandler = null

function normalizeEnterData(data) {
  const safe = data && typeof data === 'object' ? data : {}
  const {
    code = '',
    type = '',
    payload = '',
    from = '',
    option = ''
  } = safe
  return { code, type, payload, from, option }
}

function resetUtoolsEnterData() {
  utoolsEnterEventData.value = { ...EMPTY_ENTER_DATA }
}

export function setUtoolsLifecycleHandlers({ onEnter, onOut } = {}) {
  if (typeof onEnter === 'function') onEnterHandler = onEnter
  if (typeof onOut === 'function') onOutHandler = onOut
}

function initUtoolsListener() {
  if (hasBoundHostListeners) return
  hasBoundHostListeners = true

  try {
    window?.utools?.onPluginEnter?.((data) => {
      const nextEnterData = normalizeEnterData(data)
      utoolsEnterEventData.value = nextEnterData
      try {
        onEnterHandler?.(nextEnterData)
      } catch (err) {
        console.warn('初始化 uTools 进入回调失败:', err)
      }
    })

    window?.utools?.onPluginOut?.((processExit) => {
      try {
        onOutHandler?.({
          processExit: !!processExit,
          enterData: { ...utoolsEnterEventData.value }
        })
      } catch (err) {
        console.warn('初始化 uTools 退出回调失败:', err)
      } finally {
        resetUtoolsEnterData()
      }
    })
  } catch (err) {
    console.warn('初始化 uTools 监听失败:', err)
  }
}

export function useUtoolsEnterData() {
  return utoolsEnterEventData
}

export function resetUtoolsListenerState() {
  resetUtoolsEnterData()
  hasBoundHostListeners = false
  onEnterHandler = null
  onOutHandler = null
}

export default {
  init: initUtoolsListener,
  reset: resetUtoolsListenerState,
  setLifecycleHandlers: setUtoolsLifecycleHandlers
}
