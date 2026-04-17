import { createApp } from 'vue'
import App from '@/App.vue'
import utoolsListener from '@/utils/utoolsListener'
import configListener from '@/utils/configListener'
import { initTimedTaskRunner } from '@/utils/timedTaskRunner'
import router from './router'
import 'vfonts/Lato.css'
import 'vfonts/FiraCode.css'

utoolsListener.init()
configListener.init()

if (window?.utools) {
  initTimedTaskRunner()
}

const app = createApp(App)

app.use(router)

app.mount('#app')
