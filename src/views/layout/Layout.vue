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
            <n-layout
                :native-scrollbar="false"
                :scrollbar-props="{ trigger: 'none' }"
                class="app-shell__content"
            >
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
  min-height: var(--app-viewport-height);
  height: var(--app-viewport-height);
  overflow: hidden;
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

/* Keep the fixed-height shell's only child stretched, otherwise long pages get clipped. */
.app-shell :deep(> .n-space-item) {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.app-shell__layout {
  background: transparent;
  height: var(--app-viewport-height);
  max-height: var(--app-viewport-height);
  min-height: 0;
  overflow: hidden;
}

.app-shell__layout :deep(> .n-layout-scroll-container) {
  display: flex;
  width: 100%;
  height: 100%;
  max-height: 100%;
  align-items: stretch;
  min-height: 0;
  overflow: hidden;
}


.app-shell__sider {
  contain: layout;
  display: flex;
  flex-direction: column;
  height: var(--app-viewport-height);
  max-height: var(--app-viewport-height);
  min-height: 0;
  align-self: stretch;
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
  flex: 1 1 0;
  height: var(--app-viewport-height);
  max-height: var(--app-viewport-height);
  min-height: 0;
  min-width: 0;
  padding: var(--app-shell-padding);
  box-sizing: border-box;
  overflow: hidden;
  background: transparent;
}

.app-shell__content :deep(> .n-scrollbar),
.app-shell__content :deep(> .n-scrollbar > .n-scrollbar-container) {
  height: 100%;
  max-height: 100%;
  min-height: 0;
}

.app-shell__content :deep(> .n-scrollbar > .n-scrollbar-container > .n-scrollbar-content) {
  box-sizing: border-box;
  min-height: 100%;
}

.app-shell__content :deep(> .n-scrollbar > .n-scrollbar-rail),
.app-shell__sider :deep(> .n-scrollbar > .n-scrollbar-rail) {
  opacity: 1 !important;
  visibility: visible;
  pointer-events: auto;
  background: var(--app-scrollbar-rail) !important;
}

.app-shell__content :deep(> .n-scrollbar > .n-scrollbar-rail > .n-scrollbar-rail__scrollbar),
.app-shell__sider :deep(> .n-scrollbar > .n-scrollbar-rail > .n-scrollbar-rail__scrollbar) {
  opacity: 1 !important;
  visibility: visible;
  background: var(--app-scrollbar-thumb) !important;
}

.app-shell__content :deep(> .n-scrollbar > .n-scrollbar-rail:hover),
.app-shell__sider :deep(> .n-scrollbar > .n-scrollbar-rail:hover) {
  background: var(--app-scrollbar-rail-hover) !important;
}

.app-shell__content :deep(.n-layout-scroll-container) {
  background: transparent;
}

.app-shell__sider :deep(> .n-scrollbar),
.app-shell__sider :deep(> .n-scrollbar > .n-scrollbar-container) {
  height: 100%;
  max-height: 100%;
  min-height: 0;
}

.app-shell__sider :deep(> .n-scrollbar > .n-scrollbar-container > .n-scrollbar-content) {
  box-sizing: border-box;
  min-height: 100%;
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

@media (max-width: 720px) {
  .app-shell__sider :deep(.n-menu) {
    padding: 10px 6px;
  }
}
</style>
