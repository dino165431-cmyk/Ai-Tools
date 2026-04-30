import { createApp } from 'vue'
import App from '@/App.vue'
import utoolsListener from '@/utils/utoolsListener'
import configListener from '@/utils/configListener'
import router from './router'
import 'vfonts/Lato.css'
import 'vfonts/FiraCode.css'

utoolsListener.init()
configListener.init()

if (window?.utools) {
  import('@/utils/timedTaskRunner')
    .then(({ initTimedTaskRunner }) => initTimedTaskRunner())
    .catch((err) => {
      console.warn('初始化定时任务失败：', err)
    })
}

const app = createApp(App)

app.use(router)

app.mount('#app')
