<template>
  <div
    v-if="!msg.editing && ((msg.images && msg.images.length) || (msg.attachments && msg.attachments.length))"
    :class="['chat-page', theme]"
  >
    <div :class="['chat-attachment-block', { 'is-dark': theme === 'dark' }]">
      <div class="chat-attachment-toggle" @click="actions.toggleAttachmentsExpanded(msg)">
      <n-icon :component="msg.attachmentsExpanded ? ChevronUpOutline : ChevronDownOutline" size="14" />
      <n-icon :component="AttachOutline" size="14" style="margin-left: 2px;" />
      <span class="chat-attachment-label">附件</span>
      <span class="chat-attachment-meta">
        {{ helpers.countImageAttachments(msg) }} 图 · {{ helpers.countFileAttachments(msg) }} 文件
      </span>
      <span class="chat-attachment-hint">{{ msg.attachmentsExpanded ? '点击收起' : '点击展开' }}</span>
      </div>

    <div v-if="msg.attachmentsExpanded" class="chat-attachment-body">
      <div v-if="msg.images && msg.images.length" class="chat-image-grid">
        <n-image-group>
          <div v-for="img in msg.images" :key="img.id" class="chat-image-item" @click.stop>
            <n-image
              :class="['chat-image-viewer', 'chat-image-viewer--attachment', { 'is-dark': theme === 'dark' }]"
              :src="img.src"
              :alt="img.name || 'image'"
              :img-props="{ class: 'chat-image-viewer__img' }"
              width="180"
              object-fit="contain"
            />
            <div class="chat-image-caption">
              <div class="chat-image-name">{{ img.name || 'image' }}</div>
              <div v-if="helpers.imageMetaLabel(img)" class="chat-image-meta-line">{{ helpers.imageMetaLabel(img) }}</div>
              <div v-if="helpers.imageInsightLabel(img)" class="chat-image-note">{{ helpers.imageInsightLabel(img) }}</div>
            </div>
            <n-flex justify="flex-end" align="center" :size="6" class="chat-image-actions">
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button size="tiny" tertiary circle @click.stop="actions.downloadChatImage(img)">
                    <template #icon>
                      <n-icon :component="DownloadOutline" size="14" />
                    </template>
                  </n-button>
                </template>
                下载
              </n-tooltip>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button size="tiny" tertiary circle @click.stop="actions.copyChatImage(img)">
                    <template #icon>
                      <n-icon :component="CopyOutline" size="14" />
                    </template>
                  </n-button>
                </template>
                复制链接
              </n-tooltip>
            </n-flex>
          </div>
        </n-image-group>
      </div>

      <div v-if="displayAttachments.length" class="chat-file-attachments">
        <div
          v-for="a in displayAttachments"
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
          <span v-if="a.status === 'processing'" class="chat-attachment-status">（处理中）</span>
          <span v-else-if="a.status === 'error'" class="chat-attachment-status">（解析失败）</span>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { NButton, NFlex, NIcon, NImage, NImageGroup, NTooltip } from 'naive-ui'
import { AttachOutline, ChevronDownOutline, ChevronUpOutline, CopyOutline, DownloadOutline } from '@vicons/ionicons5'

const props = defineProps({
  msg: {
    type: Object,
    required: true
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

const displayAttachments = computed(() => props.helpers.listDisplayAttachments(props.msg))
</script>

<style scoped>
.chat-attachment-block {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(0, 0, 0, 0.10);
}

.chat-attachment-block.is-dark,
:deep(.chat-page.dark) .chat-attachment-block {
  border-top-color: rgba(255, 255, 255, 0.14);
}

.chat-attachment-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 4px 6px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.03);
  transition: background-color 120ms ease, border-color 120ms ease;
}

.chat-attachment-toggle:hover {
  background: rgba(0, 0, 0, 0.05);
}

.chat-attachment-block.is-dark .chat-attachment-toggle,
:deep(.chat-page.dark) .chat-attachment-toggle {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
}

.chat-attachment-block.is-dark .chat-attachment-toggle:hover,
:deep(.chat-page.dark) .chat-attachment-toggle:hover {
  background: rgba(255, 255, 255, 0.09);
}

.chat-attachment-label {
  font-size: 12px;
  font-weight: 500;
}

.chat-attachment-meta {
  font-size: 12px;
  opacity: 0.75;
}

.chat-attachment-hint {
  font-size: 12px;
  opacity: 0.55;
  margin-left: 8px;
}

.chat-attachment-body {
  margin-top: 6px;
}

.chat-file-attachments {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chat-image-viewer--attachment {
  display: block;
  width: 180px;
  max-width: 100%;
  overflow: hidden;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.94), rgba(226, 232, 240, 0.9));
}

.chat-image-viewer--attachment :deep(img),
.chat-image-viewer--attachment :deep(.chat-image-viewer__img),
.chat-image-viewer--attachment :deep(.n-image-placeholder),
.chat-image-viewer--attachment :deep(.n-image-error) {
  display: block;
  background: transparent;
}

.chat-attachment-block.is-dark .chat-image-viewer--attachment,
.chat-image-viewer--attachment.is-dark,
:deep(.chat-page.dark) .chat-image-viewer--attachment {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.84));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.chat-attachment-block.is-dark .chat-image-viewer--attachment :deep(.n-image-placeholder),
.chat-attachment-block.is-dark .chat-image-viewer--attachment :deep(.n-image-error),
.chat-image-viewer--attachment.is-dark :deep(.n-image-placeholder),
.chat-image-viewer--attachment.is-dark :deep(.n-image-error) {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.88));
}

.chat-attachment-status {
  flex: 0 0 auto;
  margin-left: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(15, 23, 42, 0.62);
}

:deep(.chat-page.dark) .chat-attachment-status {
  color: rgba(226, 232, 240, 0.72);
}

.chat-file-attachment-card {
  min-width: 0;
  max-width: min(100%, 320px);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
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
  width: 28px;
  height: 28px;
  border-radius: 10px;
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
  gap: 2px;
}

.chat-file-attachment-card__name {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  word-break: break-all;
}

.chat-file-attachment-card__meta {
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.68;
}

</style>
