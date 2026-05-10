import { createApp } from 'vue'
import App from '@/App.vue'
import utoolsListener from '@/utils/utoolsListener'
import configListener from '@/utils/configListener'
import {
  beginPluginSession,
  disposePluginSession,
  registerCleanup
} from '@/utils/pluginLifecycle'
import { initTimedTaskRunner } from '@/utils/timedTaskRunner'
import router from './router'
import 'vfonts/Lato.css'
import 'vfonts/FiraCode.css'

let app = null
let rendererSessionBootstrapped = false

function syncPreloadLifecycleStart() {
  try {
    window?.aiToolsApi?.lifecycle?.start?.()
  } catch (err) {
    console.warn('初始化 preload 生命周期失败:', err)
  }
}

function syncPreloadLifecycleDispose(context = {}) {
  try {
    return window?.aiToolsApi?.lifecycle?.dispose?.(context)
  } catch (err) {
    console.warn('清理 preload 生命周期失败:', err)
    return Promise.resolve()
  }
}

function mountApp() {
  if (app) return

  app = createApp(App)
  app.use(router)
  app.mount('#app')

  registerCleanup(() => {
    if (!app) return
    const mountedApp = app
    app = null
    mountedApp.unmount()
  }, 'vue-app-unmount')
}

function bootstrapRendererSession() {
  if (rendererSessionBootstrapped) return
  rendererSessionBootstrapped = true

  const stopConfigListener = configListener.init?.()
  if (typeof stopConfigListener === 'function') {
    registerCleanup(stopConfigListener, 'config-listener')
  }

  const stopTimedTaskRunner = initTimedTaskRunner?.()
  if (typeof stopTimedTaskRunner === 'function') {
    registerCleanup(stopTimedTaskRunner, 'timed-task-runner')
  }

  registerCleanup(() => {
    rendererSessionBootstrapped = false
  }, 'renderer-session-flag')

  registerCleanup(() => syncPreloadLifecycleDispose({ reason: 'renderer-session-dispose' }), 'preload-lifecycle')

  mountApp()
  syncPreloadLifecycleStart()
}

function startRendererSession(enterData = null) {
  bootstrapRendererSession()
  return beginPluginSession(enterData)
}

utoolsListener.setLifecycleHandlers({
  onEnter: (enterData) => {
    void startRendererSession(enterData)
  },
  onOut: ({ processExit } = {}) => {
    void disposePluginSession({
      reason: 'utools-plugin-out',
      processExit: processExit === true
    })
  }
})

utoolsListener.init()
void startRendererSession()
