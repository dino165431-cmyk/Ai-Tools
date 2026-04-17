<template>
  <div v-if="pendingAttachments.length" :class="['chat-page', theme]">
    <div :class="['chat-pending-preview', { 'is-dark': theme === 'dark' }]">
      <div class="chat-pending-preview__header">
      <span>待发送附件 {{ pendingAttachments.length }}</span>
      <span class="chat-pending-preview__meta">
        {{ pendingImageAttachments.length }} 图 · {{ pendingFileAttachments.length }} 文件
      </span>
      <span v-if="showBuiltinHint" class="chat-pending-preview__hint">
        当前会发送图片元数据，SVG 会额外提取可读文本。      </span>
      </div>


    <div v-if="pendingImageAttachments.length" class="chat-image-grid chat-image-grid--pending">
      <div v-for="img in pendingImageAttachments" :key="img.id" class="chat-image-item chat-image-item--pending" @click.stop>
        <n-image
          v-if="img.dataUrl"
          :class="['chat-image-viewer', 'chat-image-viewer--pending', { 'is-dark': theme === 'dark' }]"
          :src="img.dataUrl"
          :alt="img.name || 'image'"
          :img-props="{ class: 'chat-image-viewer__img' }"
          width="104"
          object-fit="contain"
        />
        <div v-else class="chat-image-placeholder">{{ helpers.attachmentStatusText(img) || '等待预览' }}</div>
        <div class="chat-image-caption">
          <div class="chat-image-name">{{ img.name || 'image' }}</div>
          <div v-if="helpers.imageMetaLabel(img)" class="chat-image-meta-line">{{ helpers.imageMetaLabel(img) }}</div>
          <div v-if="helpers.imageInsightLabel(img)" class="chat-image-note">{{ helpers.imageInsightLabel(img) }}</div>
          <div v-if="helpers.attachmentStatusText(img)" class="chat-image-status">{{ helpers.attachmentStatusText(img) }}</div>
        </div>
        <n-flex justify="flex-end" align="center" :size="6" class="chat-image-actions">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="tiny" tertiary circle @click.stop="actions.removeAttachment(img.id)">
                <template #icon>
                  <n-icon :component="CloseOutline" size="14" />
                </template>
              </n-button>
            </template>
            移除
          </n-tooltip>
        </n-flex>
      </div>
    </div>

    <div v-if="pendingFileAttachments.length" class="chat-file-attachments">
      <div
        v-for="a in pendingFileAttachments"
        :key="a.id"
        class="chat-file-attachment-card"
        :class="{
          'is-processing': a.status === 'processing',
          'is-error': a.status === 'error'
        }"
        :title="helpers.attachmentCardTitle(a)"
      >
        <div class="chat-file-attachment-card__icon">
          <n-icon :component="helpers.attachmentIcon(a)" size="16" />
        </div>
        <div class="chat-file-attachment-card__content">
          <div class="chat-file-attachment-card__name">{{ a.name }}</div>
          <div v-if="helpers.attachmentMetaSummary(a)" class="chat-file-attachment-card__meta">
            {{ helpers.attachmentMetaSummary(a) }}
          </div>
        </div>
        <n-button
          class="chat-file-attachment-card__close"
          size="tiny"
          tertiary
          circle
          @click.stop="actions.removeAttachment(a.id)"
        >
          <template #icon>
            <n-icon :component="CloseOutline" size="14" />
          </template>
        </n-button>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { NButton, NFlex, NIcon, NImage, NTooltip } from 'naive-ui'
import { CloseOutline } from '@vicons/ionicons5'

defineProps({
  pendingAttachments: {
    type: Array,
    required: true
  },
  pendingImageAttachments: {
    type: Array,
    required: true
  },
  pendingFileAttachments: {
    type: Array,
    required: true
  },
  showBuiltinHint: {
    type: Boolean,
    default: false
  },
  theme: {
    type: String,
    default: 'light'
  },
  helpers: {
    type: Object,
    required: true
  },
  actions: {
    type: Object,
    required: true
  }
})
</script>

<style scoped>
.chat-pending-preview {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.03);
}

.chat-pending-preview.is-dark,
:deep(.chat-page.dark) .chat-pending-preview {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
}

.chat-pending-preview__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  margin-bottom: 2px;
}

.chat-pending-preview__meta {
  opacity: 0.75;
}

.chat-pending-preview__hint {
  flex: 1 1 100%;
  opacity: 0.68;
}

.chat-image-grid--pending {
  margin: 6px 0 0;
}

.chat-image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-image-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 120px;
}

.chat-image-item--pending {
  max-width: 120px;
}

.chat-image-placeholder {
  width: 104px;
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 11px;
  padding: 8px;
  border-radius: 8px;
  color: rgba(0, 0, 0, 0.55);
  background: rgba(0, 0, 0, 0.04);
}

.chat-pending-preview.is-dark .chat-image-placeholder,
:deep(.chat-page.dark) .chat-image-placeholder {
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.08);
}

.chat-image-viewer--pending {
  display: block;
  width: 104px;
  overflow: hidden;
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.92), rgba(226, 232, 240, 0.92));
}

.chat-image-viewer--pending :deep(img),
.chat-image-viewer--pending :deep(.chat-image-viewer__img),
.chat-image-viewer--pending :deep(.n-image-placeholder),
.chat-image-viewer--pending :deep(.n-image-error) {
  display: block;
  background: transparent;
}

.chat-pending-preview.is-dark .chat-image-viewer--pending,
.chat-image-viewer--pending.is-dark,
:deep(.chat-page.dark) .chat-image-viewer--pending {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.86));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.chat-pending-preview.is-dark .chat-image-viewer--pending :deep(.n-image-placeholder),
.chat-pending-preview.is-dark .chat-image-viewer--pending :deep(.n-image-error),
.chat-image-viewer--pending.is-dark :deep(.n-image-placeholder),
.chat-image-viewer--pending.is-dark :deep(.n-image-error) {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.88));
}

.chat-image-caption {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.chat-image-name {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  word-break: break-all;
}

.chat-image-meta-line,
.chat-image-note,
.chat-image-status {
  font-size: 10px;
  line-height: 1.35;
}

.chat-image-meta-line {
  opacity: 0.72;
}

.chat-image-note {
  opacity: 0.66;
}

.chat-image-status {
  color: #d03050;
}

.chat-image-actions {
  margin-top: 2px;
}

.chat-file-attachments {
  margin-top: 6px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(156px, 1fr));
  gap: 6px;
}

.chat-file-attachment-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.03);
}

:deep(.chat-page.dark) .chat-file-attachment-card {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
}

.chat-file-attachment-card.is-processing {
  border-color: rgba(240, 160, 32, 0.28);
  background: rgba(240, 160, 32, 0.08);
}

:deep(.chat-page.dark) .chat-file-attachment-card.is-processing {
  border-color: rgba(240, 160, 32, 0.36);
  background: rgba(240, 160, 32, 0.12);
}

.chat-file-attachment-card.is-error {
  border-color: rgba(208, 48, 80, 0.24);
  background: rgba(208, 48, 80, 0.06);
}

:deep(.chat-page.dark) .chat-file-attachment-card.is-error {
  border-color: rgba(255, 143, 163, 0.3);
  background: rgba(255, 143, 163, 0.12);
}

.chat-file-attachment-card__icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.05);
}

:deep(.chat-page.dark) .chat-file-attachment-card__icon {
  background: rgba(255, 255, 255, 0.08);
}

.chat-file-attachment-card__content {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.chat-file-attachment-card__name {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-file-attachment-card__meta {
  font-size: 10px;
  line-height: 1.3;
  opacity: 0.68;
}

.chat-file-attachment-card__close {
  flex: 0 0 auto;
}

@media (max-width: 780px) {
  .chat-file-attachments {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
}
</style>
