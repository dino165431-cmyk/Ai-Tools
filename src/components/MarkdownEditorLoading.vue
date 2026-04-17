<template>
  <div :class="['markdown-editor-loading', { 'is-dark': theme === 'dark' }]">
    <div class="markdown-editor-loading__toolbar">
      <span class="markdown-editor-loading__chip w-1" />
      <span class="markdown-editor-loading__chip w-2" />
      <span class="markdown-editor-loading__chip w-3" />
      <span class="markdown-editor-loading__chip w-4" />
    </div>
    <div class="markdown-editor-loading__body">
      <div class="markdown-editor-loading__pane">
        <span class="markdown-editor-loading__line long" />
        <span class="markdown-editor-loading__line mid" />
        <span class="markdown-editor-loading__line short" />
        <span class="markdown-editor-loading__line long" />
      </div>
      <div class="markdown-editor-loading__pane is-preview">
        <span class="markdown-editor-loading__line mid" />
        <span class="markdown-editor-loading__line long" />
        <span class="markdown-editor-loading__line short" />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  theme: {
    type: String,
    default: 'light'
  }
})
</script>

<style scoped>
.markdown-editor-loading {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 320px;
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.96));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.markdown-editor-loading.is-dark {
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(15, 23, 42, 0.98));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.1);
}

.markdown-editor-loading__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.markdown-editor-loading__body {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.markdown-editor-loading__pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 22px;
}

.markdown-editor-loading__pane.is-preview {
  border-left: 1px solid rgba(148, 163, 184, 0.12);
}

.markdown-editor-loading__chip,
.markdown-editor-loading__line {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
}

.markdown-editor-loading.is-dark .markdown-editor-loading__chip,
.markdown-editor-loading.is-dark .markdown-editor-loading__line {
  background: rgba(100, 116, 139, 0.22);
}

.markdown-editor-loading__chip::after,
.markdown-editor-loading__line::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.52), transparent);
  animation: markdown-editor-loading-shimmer 1.5s ease-in-out infinite;
}

.markdown-editor-loading.is-dark .markdown-editor-loading__chip::after,
.markdown-editor-loading.is-dark .markdown-editor-loading__line::after {
  background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.2), transparent);
}

.markdown-editor-loading__chip {
  height: 10px;
}

.markdown-editor-loading__chip.w-1 {
  width: 72px;
}

.markdown-editor-loading__chip.w-2 {
  width: 54px;
}

.markdown-editor-loading__chip.w-3 {
  width: 66px;
}

.markdown-editor-loading__chip.w-4 {
  width: 48px;
}

.markdown-editor-loading__line {
  height: 12px;
}

.markdown-editor-loading__line.long {
  width: 100%;
}

.markdown-editor-loading__line.mid {
  width: 76%;
}

.markdown-editor-loading__line.short {
  width: 46%;
}

@keyframes markdown-editor-loading-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@media (max-width: 900px) {
  .markdown-editor-loading__body {
    grid-template-columns: 1fr;
  }

  .markdown-editor-loading__pane.is-preview {
    border-left: none;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
  }
}
</style>
