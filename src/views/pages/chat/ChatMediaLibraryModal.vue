<template>
  <n-modal
    v-model:show="showModel"
    :mask-closable="true"
    preset="card"
    title="媒体库"
    style="width: 920px; max-width: 95%;"
  >
    <n-flex vertical :size="12" :class="['chat-media-library', { 'is-dark': theme === 'dark' }]">
      <n-flex align="center" justify="space-between" wrap :size="8">
        <n-flex align="center" wrap :size="6">
          <n-button size="tiny" :type="filterModel === 'all' ? 'primary' : 'default'" @click="filterModel = 'all'">
            全部
          </n-button>
          <n-button size="tiny" :type="filterModel === 'image' ? 'primary' : 'default'" @click="filterModel = 'image'">
            图片
          </n-button>
          <n-button size="tiny" :type="filterModel === 'video' ? 'primary' : 'default'" @click="filterModel = 'video'">
            视频
          </n-button>
        </n-flex>
        <n-text depth="3" class="chat-media-library__count">{{ items.length }} / {{ totalCount }}</n-text>
      </n-flex>

      <n-scrollbar style="max-height: 70vh;">
        <div v-if="items.length" class="session-media-library-grid">
          <div
            v-for="item in items"
            :key="item.key"
            class="session-media-library-item"
            @click.stop
          >
            <div class="session-media-library-item__preview">
              <n-image
                v-if="item.kind === 'image'"
                :src="item.src"
                :alt="item.name"
                object-fit="cover"
                width="100%"
                :img-props="{ loading: 'lazy', decoding: 'async' }"
              />
              <video
                v-else
                class="session-media-library-item__video"
                :src="item.src"
                controls
                controlslist="nofullscreen"
                preload="metadata"
                playsinline
              />
            </div>
            <div class="session-media-library-item__body">
              <div class="session-media-library-item__title">{{ item.name }}</div>
              <div v-if="item.meta" class="session-media-library-item__meta">{{ item.meta }}</div>
              <div v-if="item.prompt" class="session-media-library-item__prompt">{{ item.prompt }}</div>
              <n-flex align="center" justify="flex-end" :size="6" class="session-media-library-item__actions">
                <n-tooltip v-if="item.prompt" trigger="hover">
                  <template #trigger>
                    <n-button size="tiny" tertiary circle @click.stop="emit('copy-prompt', item)">
                      <template #icon>
                        <n-icon :component="CopyOutline" size="14" />
                      </template>
                    </n-button>
                  </template>
                  复制提示词
                </n-tooltip>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-button size="tiny" tertiary circle @click.stop="emit('regenerate-media', item.message, item.kind)">
                      <template #icon>
                        <n-icon :component="RefreshOutline" size="14" />
                      </template>
                    </n-button>
                  </template>
                  再次生成
                </n-tooltip>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-button
                      size="tiny"
                      tertiary
                      circle
                      @click.stop="item.kind === 'image' ? emit('download-image', item.media) : emit('download-video', item.media)"
                    >
                      <template #icon>
                        <n-icon :component="DownloadOutline" size="14" />
                      </template>
                    </n-button>
                  </template>
                  下载
                </n-tooltip>
              </n-flex>
            </div>
          </div>
        </div>
        <n-text v-else depth="3">当前会话还没有可展示的媒体结果</n-text>
      </n-scrollbar>
    </n-flex>
  </n-modal>
</template>

<script setup>
import { computed } from 'vue'
import {
  NButton,
  NFlex,
  NIcon,
  NImage,
  NModal,
  NScrollbar,
  NText,
  NTooltip
} from 'naive-ui'
import { CopyOutline, DownloadOutline, RefreshOutline } from '@vicons/ionicons5'

const props = defineProps({
  show: { type: Boolean, default: false },
  theme: { type: String, default: 'light' },
  filter: { type: String, default: 'all' },
  items: { type: Array, default: () => [] },
  totalCount: { type: Number, default: 0 }
})

const emit = defineEmits([
  'update:show',
  'update:filter',
  'copy-prompt',
  'regenerate-media',
  'download-image',
  'download-video'
])

const showModel = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
})

const filterModel = computed({
  get: () => props.filter,
  set: (value) => emit('update:filter', value)
})
</script>

<style scoped>
.chat-media-library__count {
  font-size: 12px;
}

.session-media-library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding-right: 6px;
}

.session-media-library-item {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.72);
}

.chat-media-library.is-dark .session-media-library-item {
  border-color: rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.52);
}

.session-media-library-item__preview {
  width: 100%;
  aspect-ratio: 16 / 10;
  background: rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.session-media-library-item__preview :deep(.n-image),
.session-media-library-item__preview :deep(img),
.session-media-library-item__video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.session-media-library-item__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  min-width: 0;
}

.session-media-library-item__title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-media-library-item__meta,
.session-media-library-item__prompt {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(71, 85, 105, 0.86);
  word-break: break-word;
}

.chat-media-library.is-dark .session-media-library-item__meta,
.chat-media-library.is-dark .session-media-library-item__prompt {
  color: rgba(203, 213, 225, 0.82);
}

.session-media-library-item__prompt {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.session-media-library-item__actions {
  margin-top: 2px;
}
</style>
