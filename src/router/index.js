import { createRouter, createWebHashHistory } from 'vue-router'
import Layout from '@/views/layout/Layout.vue'
import { routers } from './routes'
import { getChatConfig } from '@/utils/configListener'

const routes = [
  {
    path: '/',
    name: 'layout',
    component: Layout,
    redirect: { name: 'chat' },
    children: routers
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach((to) => {
  if (to.meta?.requiresMemoryEnabled !== true) return true
  const enabled = getChatConfig().value?.memory?.enabled === true
  if (enabled) return true
  return { name: 'config' }
})

export default router
