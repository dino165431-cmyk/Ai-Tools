<template>
  <n-config-provider
    :theme-overrides="{ common: { fontWeightStrong: '600' } }"
    :theme="theme === 'dark' ? darkTheme : null"
  >
    <n-dialog-provider>
      <n-message-provider>
        <router-view /> 
      </n-message-provider>
    </n-dialog-provider>
    <n-global-style />
  </n-config-provider>
</template>

<script setup>
import { onBeforeUnmount, onMounted, watchEffect } from 'vue'
import { NConfigProvider, NGlobalStyle, darkTheme, NDialogProvider, NMessageProvider } from 'naive-ui'
import { getTheme } from '@/utils/configListener';

const theme = getTheme()
const SCROLLBAR_SCROLLING_CLASS = 'app-scrollbar--scrolling'
const scrollbarHideTimerMap = new WeakMap()

function markScrollbarScrolling(scrollbarEl) {
  if (!(scrollbarEl instanceof HTMLElement)) return
  const existingTimer = scrollbarHideTimerMap.get(scrollbarEl)
  if (existingTimer) window.clearTimeout(existingTimer)
  scrollbarEl.classList.add(SCROLLBAR_SCROLLING_CLASS)
  const nextTimer = window.setTimeout(() => {
    scrollbarEl.classList.remove(SCROLLBAR_SCROLLING_CLASS)
    scrollbarHideTimerMap.delete(scrollbarEl)
  }, 560)
  scrollbarHideTimerMap.set(scrollbarEl, nextTimer)
}

function handleGlobalScrollbarScroll(event) {
  const target = event?.target
  if (!(target instanceof Element)) return
  const containerEl = target.closest('.n-scrollbar-container')
  if (!containerEl) return
  const scrollbarEl = containerEl.closest('.n-scrollbar')
  markScrollbarScrolling(scrollbarEl)
}

watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('app-theme-dark', theme.value === 'dark')
  document.body.classList.toggle('app-theme-dark', theme.value === 'dark')
})

onMounted(() => {
  if (typeof document === 'undefined') return
  document.addEventListener('scroll', handleGlobalScrollbarScroll, true)
})

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  document.removeEventListener('scroll', handleGlobalScrollbarScroll, true)
  document.querySelectorAll(`.n-scrollbar.${SCROLLBAR_SCROLLING_CLASS}`).forEach((el) => {
    el.classList.remove(SCROLLBAR_SCROLLING_CLASS)
  })
  document.documentElement.classList.remove('app-theme-dark')
  document.body.classList.remove('app-theme-dark')
})
</script>

<style>
:root {
  --app-viewport-height: 100vh;
  --app-shell-padding: 15px;
  --app-scrollbar-size: 9px;
  --app-scrollbar-radius: 999px;
  --app-scrollbar-track: rgba(148, 163, 184, 0.12);
  --app-scrollbar-track-hover: rgba(148, 163, 184, 0.18);
  --app-scrollbar-thumb: rgba(59, 130, 246, 0.3);
  --app-scrollbar-thumb-hover: rgba(37, 99, 235, 0.44);
  --app-scrollbar-thumb-active: rgba(29, 78, 216, 0.56);
  --app-scrollbar-thumb-border: rgba(255, 255, 255, 0.72);
  --app-scrollbar-shadow: rgba(15, 23, 42, 0.06);
  --app-scrollbar-rail: rgba(148, 163, 184, 0.12);
  --app-scrollbar-rail-hover: rgba(148, 163, 184, 0.18);
  color-scheme: light;
}

@supports (height: 100dvh) {
  :root {
    --app-viewport-height: 100dvh;
  }
}

:root.app-theme-dark,
body.app-theme-dark {
  --app-scrollbar-track: rgba(15, 23, 42, 0.52);
  --app-scrollbar-track-hover: rgba(30, 41, 59, 0.78);
  --app-scrollbar-thumb: rgba(71, 85, 105, 0.9);
  --app-scrollbar-thumb-hover: rgba(100, 116, 139, 0.96);
  --app-scrollbar-thumb-active: rgba(148, 163, 184, 0.98);
  --app-scrollbar-thumb-border: rgba(8, 15, 28, 0.92);
  --app-scrollbar-shadow: rgba(2, 6, 23, 0.5);
  --app-scrollbar-rail: rgba(15, 23, 42, 0.52);
  --app-scrollbar-rail-hover: rgba(30, 41, 59, 0.78);
  color-scheme: dark;
}

body {
  scrollbar-width: thin;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track);
}

body.app-theme-dark :where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body,
  .notebook-editor__runtime-message,
  .md-editor,
  .md-editor-custom-scrollbar
) {
  color-scheme: dark !important;
}

*::-webkit-scrollbar {
  width: var(--app-scrollbar-size);
  height: var(--app-scrollbar-size);
  background: var(--app-scrollbar-track) !important;
}

*::-webkit-scrollbar-track {
  background: var(--app-scrollbar-track) !important;
  border-radius: var(--app-scrollbar-radius);
}

*::-webkit-scrollbar-track-piece {
  background: var(--app-scrollbar-track) !important;
  border-radius: var(--app-scrollbar-radius);
}

*::-webkit-scrollbar-track:hover {
  background: var(--app-scrollbar-track-hover) !important;
}

*::-webkit-scrollbar-thumb {
  background: var(--app-scrollbar-thumb) !important;
  background-clip: padding-box;
  border: 2px solid transparent;
  border-radius: var(--app-scrollbar-radius);
  box-shadow:
    inset 0 0 0 1px var(--app-scrollbar-thumb-border),
    0 4px 12px var(--app-scrollbar-shadow);
}

*::-webkit-scrollbar-thumb:hover {
  background: var(--app-scrollbar-thumb-hover) !important;
}

*::-webkit-scrollbar-thumb:active {
  background: var(--app-scrollbar-thumb-active) !important;
}

*::-webkit-scrollbar-corner {
  background: var(--app-scrollbar-track) !important;
}

/* Unified scrollbar baseline for all common app scroll containers */
:where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body,
  .notebook-editor__runtime-message
) {
  scrollbar-width: thin;
  scrollbar-color: var(--app-scrollbar-thumb) var(--app-scrollbar-track);
}

:where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body,
  .notebook-editor__runtime-message
)::-webkit-scrollbar {
  width: var(--app-scrollbar-size);
  height: var(--app-scrollbar-size);
  background: var(--app-scrollbar-track) !important;
}

:where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body,
  .notebook-editor__runtime-message
)::-webkit-scrollbar-track {
  background: var(--app-scrollbar-track) !important;
  border-radius: var(--app-scrollbar-radius);
}

:where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body,
  .notebook-editor__runtime-message
)::-webkit-scrollbar-track-piece {
  background: var(--app-scrollbar-track) !important;
  border-radius: var(--app-scrollbar-radius);
}

:where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body,
  .notebook-editor__runtime-message
)::-webkit-scrollbar-track:hover {
  background: var(--app-scrollbar-track-hover) !important;
}

:where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body,
  .notebook-editor__runtime-message
)::-webkit-scrollbar-thumb {
  background: var(--app-scrollbar-thumb) !important;
  background-clip: padding-box;
  border: 2px solid transparent;
  border-radius: var(--app-scrollbar-radius);
  box-shadow:
    inset 0 0 0 1px var(--app-scrollbar-thumb-border),
    0 4px 12px var(--app-scrollbar-shadow);
}

:where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body,
  .notebook-editor__runtime-message
)::-webkit-scrollbar-thumb:hover {
  background: var(--app-scrollbar-thumb-hover) !important;
}

:where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body,
  .notebook-editor__runtime-message
)::-webkit-scrollbar-thumb:active {
  background: var(--app-scrollbar-thumb-active) !important;
}

:where(
  .n-layout .n-layout-scroll-container,
  .n-layout .n-layout-sider-scroll-container,
  .editor-shell__catalog-body,
  .notebook-editor__body
) {
  background-color: transparent;
}

.n-scrollbar > .n-scrollbar-rail {
  border-radius: var(--app-scrollbar-radius);
  background: transparent !important;
  opacity: 0 !important;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.16s ease, background-color 0.16s ease, visibility 0.16s ease;
}

.n-scrollbar > .n-scrollbar-rail > .n-scrollbar-rail__scrollbar {
  border-radius: var(--app-scrollbar-radius);
  opacity: 0 !important;
  visibility: hidden;
  background: var(--app-scrollbar-thumb) !important;
  box-shadow:
    inset 0 0 0 1px var(--app-scrollbar-thumb-border),
    0 4px 12px var(--app-scrollbar-shadow);
  transition: opacity 0.16s ease, background-color 0.16s ease, visibility 0.16s ease;
}

.n-scrollbar:hover > .n-scrollbar-rail,
.n-scrollbar:hover > .n-scrollbar-rail > .n-scrollbar-rail__scrollbar {
  opacity: 0 !important;
  visibility: hidden;
  pointer-events: none;
}

.n-scrollbar.app-scrollbar--scrolling > .n-scrollbar-rail {
  opacity: 1 !important;
  visibility: visible;
  pointer-events: auto;
  background: var(--app-scrollbar-rail) !important;
}

.n-scrollbar.app-scrollbar--scrolling > .n-scrollbar-rail:hover {
  background: var(--app-scrollbar-rail-hover) !important;
}

.n-scrollbar.app-scrollbar--scrolling > .n-scrollbar-rail > .n-scrollbar-rail__scrollbar {
  opacity: 1 !important;
  visibility: visible;
}

.n-scrollbar.app-scrollbar--scrolling > .n-scrollbar-rail:hover > .n-scrollbar-rail__scrollbar {
  background: var(--app-scrollbar-thumb-hover) !important;
}

/* Force Naive UI scrollbar CSS vars to follow app-level tokens. */
.n-scrollbar {
  --n-scrollbar-rail-color: transparent !important;
  --n-scrollbar-color: var(--app-scrollbar-thumb) !important;
  --n-scrollbar-color-hover: var(--app-scrollbar-thumb-hover) !important;
}

/* md-editor-v3 uses div-based scrollbars, so bridge them to the same app tokens. */
body .md-editor,
body .md-editor-modal-container,
body .md-editor-catalog,
body .md-editor-catalog-dark {
  --md-scrollbar-bg-color: var(--app-scrollbar-track) !important;
  --md-scrollbar-thumb-color: var(--app-scrollbar-thumb) !important;
  --md-scrollbar-thumb-hover-color: var(--app-scrollbar-thumb-hover) !important;
  --md-scrollbar-thumb-active-color: var(--app-scrollbar-thumb-active) !important;
}

body .md-editor-custom-scrollbar__track {
  background: var(--app-scrollbar-track) !important;
  border-radius: var(--app-scrollbar-radius);
}

body .md-editor-custom-scrollbar__thumb {
  background: var(--app-scrollbar-thumb) !important;
  border-radius: var(--app-scrollbar-radius);
  box-shadow:
    inset 0 0 0 1px var(--app-scrollbar-thumb-border),
    0 4px 12px var(--app-scrollbar-shadow);
}

body .md-editor-custom-scrollbar__thumb:hover {
  background: var(--app-scrollbar-thumb-hover) !important;
}

.n-modal-container {
  z-index: 200000 !important;
}

.n-tooltip,
.n-popover {
  max-width: min(640px, calc(100vw - 24px));
}

.n-tooltip .n-popover__content,
.n-popover .n-popover__content,
.n-popover__content {
  max-width: min(640px, calc(100vw - 24px));
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  overflow-x: hidden;
  line-height: 1.55;
}

body.app-theme-dark .n-image-preview-overlay {
  background: rgba(2, 6, 23, 0.82);
  backdrop-filter: blur(14px);
}

body.app-theme-dark .n-image-preview-toolbar {
  background: rgba(15, 23, 42, 0.9);
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.42);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

body.app-theme-dark .n-image-preview-wrapper {
  background:
    radial-gradient(circle at center, rgba(56, 189, 248, 0.12), transparent 44%),
    radial-gradient(circle at center, rgba(15, 23, 42, 0.2), transparent 72%);
}

body.app-theme-dark .n-image-preview {
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.88));
  box-shadow:
    inset 0 0 0 1px rgba(148, 163, 184, 0.16),
    0 28px 72px rgba(2, 6, 23, 0.42);
}

@media (max-width: 720px) {
  :root {
    --app-shell-padding: 10px;
  }
}
</style>
