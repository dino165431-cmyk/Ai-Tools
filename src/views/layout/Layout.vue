<template>
    <n-space vertical size="large" :class="['app-shell', { 'is-dark': theme === 'dark' }]">
        <n-layout has-sider sider-placement="left" class="app-shell__layout">
            <n-layout-sider
                bordered
                show-trigger
                collapse-mode="width"
                :collapsed-width="64"
                :width="240"
                :native-scrollbar="false"
                :scrollbar-props="{ trigger: 'none' }"
                class="app-shell__sider"
            >
                <n-menu
                    :collapsed-width="64"
                    :collapsed-icon-size="22"
                    :options="menuOptions"
                    :value="selectedKey"
                    @update:value="handleMenuSelect"
                />
            </n-layout-sider>
            <n-layout :native-scrollbar="false" :scrollbar-props="{ trigger: 'none' }" class="app-shell__content" style="height: 100vh;padding: 15px;">
                <router-view v-slot="{ Component, route }">
                    <keep-alive :include="keepAliveComponentNames">
                        <component :is="Component" :key="route.name" />
                    </keep-alive>
                </router-view>
            </n-layout>
        </n-layout>
    </n-space>
</template>

<script setup>
import { NSpace, NLayout, NLayoutSider, NMenu } from 'naive-ui'
import { h, computed, watch } from 'vue'
import { NIcon } from 'naive-ui'
import { useRouter, useRoute } from 'vue-router'
import { routers } from '@/router/routes'
import { useUtoolsEnterData } from '@/utils/utoolsListener'
import { getTheme } from '@/utils/configListener'

const router = useRouter()
const route = useRoute()
const utoolsEnterData = useUtoolsEnterData()
const theme = getTheme()

function renderIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

function transformRoutesToMenu(routes) {
  const menuItems = []
  for (const route of routes) {
    if (route.meta?.menu) {
      const menuItem = {
        label: route.meta.label || route.name || route.path,
        key: route.name,
        icon: route.meta.icon ? renderIcon(route.meta.icon) : undefined,
        disabled: route.meta.disabled || false,
      }
      if (route.children && route.children.length > 0) {
        const childMenus = transformRoutesToMenu(route.children)
        if (childMenus.length > 0) {
          menuItem.children = childMenus
        }
      }
      menuItems.push(menuItem)
    }
  }
  return menuItems
}

const menuOptions = transformRoutesToMenu(routers)
const keepAliveComponentNames = Object.freeze(['Chat', 'Note'])

const selectedKey = computed(() => route.name)

function handleMenuSelect(key) {
  router.push({ name: key })
}

const ENTER_ROUTE_MAP = Object.freeze({
  Ai: 'chat'
})

watch(
  utoolsEnterData,
  (val) => {
    const target = ENTER_ROUTE_MAP[val?.code]
    if (!target || route.name === target) return
    router.replace({ name: target })
  },
  { immediate: true }
)
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.08), transparent 28%),
    radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.08), transparent 24%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.94), rgba(241, 245, 249, 0.98));
}

.app-shell.is-dark {
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.14), transparent 28%),
    radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.12), transparent 24%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.94), rgba(15, 23, 42, 0.98));
}

.app-shell__layout {
  background: transparent;
}


.app-shell__sider {
  height: 100vh;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(248, 250, 252, 0.94));
  box-shadow: inset -1px 0 0 rgba(15, 23, 42, 0.04);
  position: relative;
  z-index: 2;
  overflow: visible;
}

.app-shell.is-dark .app-shell__sider {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.84), rgba(15, 23, 42, 0.94));
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.08);
}

.app-shell__content {
  position: relative;
  z-index: 1;
  background: transparent;
}

.app-shell__content :deep(> .n-layout-scroll-container) {
  background: transparent;
}

.app-shell__sider :deep(.n-layout-toggle-button) {
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);
  z-index: 3;
}

.app-shell.is-dark .app-shell__sider :deep(.n-layout-toggle-button) {
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 10px 18px rgba(2, 6, 23, 0.32);
}

.app-shell__sider :deep(.n-menu) {
  padding: 12px 8px;
  background: transparent;
}

.app-shell__sider :deep(.n-menu-item-content),
.app-shell__sider :deep(.n-submenu .n-submenu-title) {
  border-radius: 14px;
  transition: transform 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

.app-shell__sider :deep(.n-menu-item-content:hover),
.app-shell__sider :deep(.n-submenu .n-submenu-title:hover) {
  transform: translateX(2px);
  box-shadow: inset 0 0 0 1px rgba(76, 129, 142, 0.08);
}

.app-shell.is-dark .app-shell__sider :deep(.n-menu-item-content:hover),
.app-shell.is-dark .app-shell__sider :deep(.n-submenu .n-submenu-title:hover) {
  box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.14);
}

.app-shell__sider :deep(.n-menu-item-content--selected) {
  box-shadow: inset 0 0 0 1px rgba(76, 129, 142, 0.12);
}

.app-shell.is-dark .app-shell__sider :deep(.n-menu-item-content--selected) {
  box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.2);
}
</style>
