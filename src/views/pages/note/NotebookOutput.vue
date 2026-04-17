<template>
  <div :class="['notebook-output', { 'is-dark': theme === 'dark' }]">
    <template v-for="(item, index) in normalizedOutputs" :key="`${item.output_type}-${index}`">
      <div class="notebook-output__block notebook-output__block--stream" v-if="item.output_type === 'stream'">
        <div class="notebook-output__meta">
          {{ item.name || 'stdout' }}
        </div>
        <div class="notebook-output__scroll">
          <pre>{{ item.text }}</pre>
        </div>
      </div>

      <div class="notebook-output__block notebook-output__block--error" v-else-if="item.output_type === 'error'">
        <div class="notebook-output__meta">
          {{ item.ename || 'Error' }}<span v-if="item.evalue">: {{ item.evalue }}</span>
        </div>
        <div class="notebook-output__scroll">
          <pre>{{ formatTraceback(item) }}</pre>
        </div>
      </div>

      <div
        v-else-if="item.output_type === 'display_data' || item.output_type === 'execute_result'"
        class="notebook-output__block notebook-output__block--rich"
      >
        <div class="notebook-output__meta">
          {{ item.output_type === 'execute_result' ? '结果' : '展示' }}
          <span v-if="item.execution_count != null"> · In [{{ item.execution_count }}]</span>
        </div>

        <div class="notebook-output__rich-body">
          <div v-if="resolveMarkdownOutput(item)" class="notebook-output__markdown">
            <LazyMarkdownPreview
              :editor-id="`${previewIdBase}-${index}-md`"
              :model-value="resolveMarkdownOutput(item)"
              preview-theme="github"
              :theme="theme"
            />
          </div>

          <div
            v-else-if="resolveHtmlOutput(item)"
            class="notebook-output__html markdown-body"
            v-html="resolveHtmlOutput(item)"
          />

          <img
            v-else-if="resolveImageOutput(item)"
            class="notebook-output__image"
            :src="resolveImageOutput(item)"
            alt="Notebook output"
          />

          <div v-else-if="resolveJsonOutput(item)" class="notebook-output__scroll">
            <pre>{{ resolveJsonOutput(item) }}</pre>
          </div>
          <div v-else class="notebook-output__scroll">
            <pre>{{ resolvePlainTextOutput(item) }}</pre>
          </div>
        </div>
      </div>

      <div class="notebook-output__block notebook-output__block--fallback" v-else>
        <div class="notebook-output__meta">
          {{ item.output_type || 'output' }}
        </div>
        <div class="notebook-output__scroll">
          <pre>{{ stringifyOutput(item) }}</pre>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import LazyMarkdownPreview from '@/components/LazyMarkdownPreview.vue'

const props = defineProps({
  outputs: {
    type: Array,
    default: () => []
  },
  previewIdBase: {
    type: String,
    default: 'notebook-output'
  },
  theme: {
    type: String,
    default: 'light'
  }
})

const normalizedOutputs = computed(() => (Array.isArray(props.outputs) ? props.outputs : []))

function resolvePlainTextOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  if (typeof data['text/plain'] === 'string') return data['text/plain']
  if (Array.isArray(data['text/plain'])) return data['text/plain'].join('')
  return ''
}

function resolveMarkdownOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  if (typeof data['text/markdown'] === 'string') return data['text/markdown']
  if (Array.isArray(data['text/markdown'])) return data['text/markdown'].join('')
  return ''
}

function resolveHtmlOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  if (typeof data['text/html'] === 'string') return data['text/html']
  if (Array.isArray(data['text/html'])) return data['text/html'].join('')
  return ''
}

function resolveImageOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  if (typeof data['image/png'] === 'string') return `data:image/png;base64,${data['image/png']}`
  if (typeof data['image/jpeg'] === 'string') return `data:image/jpeg;base64,${data['image/jpeg']}`
  if (typeof data['image/gif'] === 'string') return `data:image/gif;base64,${data['image/gif']}`
  if (typeof data['image/svg+xml'] === 'string') {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data['image/svg+xml'])}`
  }
  return ''
}

function resolveJsonOutput(output) {
  const data = output?.data && typeof output.data === 'object' ? output.data : {}
  const value = data['application/json']
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function stringifyOutput(output) {
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output ?? '')
  }
}

function formatTraceback(output) {
  if (Array.isArray(output?.traceback) && output.traceback.length) {
    return output.traceback.join('\n')
  }
  return [output?.ename, output?.evalue].filter(Boolean).join(': ')
}
</script>

<style scoped>
.notebook-output {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notebook-output__block {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.9);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.notebook-output__block--error {
  border-color: rgba(248, 113, 113, 0.34);
  background: rgba(254, 242, 242, 0.96);
}

.notebook-output__meta {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  font-size: 12px;
  font-weight: 600;
  color: rgba(51, 65, 85, 0.92);
  background: rgba(255, 255, 255, 0.44);
}

.notebook-output pre {
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
  color: rgba(15, 23, 42, 0.92);
}

.notebook-output__html,
.notebook-output__markdown {
  padding: 12px;
}

.notebook-output__html {
  color: rgba(15, 23, 42, 0.92);
}

.notebook-output__image {
  display: block;
  max-width: 100%;
  height: auto;
  padding: 12px;
  box-sizing: border-box;
}

.notebook-output.is-dark .notebook-output__block {
  border-color: rgba(71, 85, 105, 0.58);
  background: rgba(15, 23, 42, 0.92);
  box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.06);
}

.notebook-output.is-dark .notebook-output__block--error {
  border-color: rgba(248, 113, 113, 0.34);
  background: rgba(69, 10, 10, 0.42);
}

.notebook-output.is-dark .notebook-output__meta {
  color: rgba(226, 232, 240, 0.92);
  border-bottom-color: rgba(71, 85, 105, 0.54);
  background: rgba(30, 41, 59, 0.72);
}

.notebook-output.is-dark pre,
.notebook-output.is-dark .notebook-output__html {
  color: rgba(226, 232, 240, 0.94);
}
</style>
