<template>
  <n-flex
    vertical
    align="center"
    :class="['settings-page', 'settings-page--prompt', { 'is-dark': theme === 'dark' }]"
    style="max-width: 1000px; margin: 0 auto;"
  >
    <n-card hoverable class="settings-hero-card" style="width: 100%">
        <n-flex justify="space-between" align="center">
          <n-flex align="center">
            <n-icon :component="Prompt" size="20" :depth="1" />
            <span style="font-weight: 500;">提示词管理</span>
          </n-flex>
          <n-flex align="center">
          <n-button tertiary size="small" @click="openAddModal">
            新增提示词
          </n-button>
        </n-flex>
      </n-flex>
    </n-card>

    <n-flex wrap :size="16" justify="flex-start" class="settings-grid" style="width: 100%; margin-top: 8px;">
      <n-card
        v-for="prompt in prompts"
        :key="prompt._id"
        hoverable
        size="small"
        class="settings-grid-card"
        :style="cardStyle"
        @click="openEditModal(prompt)"
      >
        <n-flex vertical>
          <n-flex justify="space-between" align="center">
            <n-text strong depth="1" style="font-size: 16px;">
              {{ prompt.name || '未命名' }}
            </n-text>
            <n-button
              v-if="!prompt.builtin"
              text
              size="small"
              title="删除提示词"
              @click.stop="confirmDelete(prompt)"
              style="margin-left: auto;"
            >
              <n-icon :component="Trash" size="18" />
            </n-button>
          </n-flex>

          <n-flex align="center" wrap :size="6" style="margin-top: 6px;">
            <n-tag v-if="prompt.builtin" size="small" type="info" bordered>内置</n-tag>
            <n-tag v-if="prompt.description" size="small" type="info" bordered>
              有描述
            </n-tag>
            <n-tag v-if="prompt.content" size="small" type="success" bordered>
              有内容
            </n-tag>
          </n-flex>

          <n-ellipsis v-if="prompt.description" class="settings-card__meta" :line-clamp="2">
            {{ prompt.description }}
          </n-ellipsis>
        </n-flex>
      </n-card>
    </n-flex>

    <n-modal
      v-model:show="showModal"
      :mask-closable="false"
      preset="card"
      :title="modalMode === 'add' ? '新增提示词' : '编辑提示词'"
      style="width: 800px; max-width: 95%;"
    >
      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-placement="left"
        label-width="110px"
      >
        <n-form-item label="名称" path="name">
          <n-input v-model:value="formData.name" :disabled="readOnly" placeholder="请输入提示词名称（必填）" />
        </n-form-item>

        <n-form-item label="描述" path="description">
          <n-input
            v-model:value="formData.description"
            :disabled="readOnly"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="可选：简短说明该提示词的用途"
          />
        </n-form-item>

        <n-form-item label="内容" path="content">
          <n-input
            v-model:value="formData.content"
            :disabled="readOnly"
            type="textarea"
            :autosize="{ minRows: 6, maxRows: 14 }"
            placeholder="可选：提示词内容"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="handleSave" :loading="saving" :disabled="readOnly">
            保存
          </n-button>
        </n-flex>
      </template>
    </n-modal>
  </n-flex>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import {
  NCard, NFlex, NIcon, NButton, NInput, NText, NTag, NEllipsis,
  NModal, NForm, NFormItem, useDialog, useMessage
} from 'naive-ui'
import { Trash } from '@vicons/fa'
import { Prompt } from '@vicons/tabler'

import {
  getPrompts,
  addPrompt,
  updatePrompt,
  deletePrompt,
  getTheme
} from '@/utils/configListener'

const prompts = getPrompts()
const theme = getTheme()

const dialog = useDialog()
const message = useMessage()
const formRef = ref(null)

const showModal = ref(false)
const modalMode = ref('add')
const currentEditId = ref(null)
const currentEditBuiltin = ref(false)
const readOnly = computed(() => modalMode.value === 'edit' && currentEditBuiltin.value)

const formData = reactive({
  name: '',
  description: '',
  content: ''
})

const rules = {
  name: { required: true, message: '名称为必填项', trigger: ['blur', 'input'] }
}

const cardStyle = computed(() => ({
  width: 'calc((100% - 32px) / 3)',
  marginBottom: '0',
  cursor: 'pointer'
}))

const openAddModal = () => {
  modalMode.value = 'add'
  currentEditId.value = null
  currentEditBuiltin.value = false
  formData.name = ''
  formData.description = ''
  formData.content = ''
  formRef.value?.restoreValidation()
  showModal.value = true
}

const openEditModal = (prompt) => {
  modalMode.value = 'edit'
  currentEditId.value = prompt._id
  currentEditBuiltin.value = !!prompt.builtin
  formData.name = prompt.name || ''
  formData.description = prompt.description || ''
  formData.content = prompt.content || ''
  formRef.value?.restoreValidation()
  showModal.value = true
}

const saving = ref(false)
const handleSave = () => {
  if (readOnly.value) {
    message.warning('内置提示词不可编辑')
    return
  }
  formRef.value?.validate(async (errors) => {
    if (errors) {
      message.warning('请填写必填项')
      return
    }
    saving.value = true
    try {
      const name = formData.name.trim()
      const promptData = {
        name,
        description: formData.description || '',
        content: formData.content || ''
      }

      const safeData = JSON.parse(JSON.stringify(promptData))
      if (modalMode.value === 'add') {
        const newPrompt = { _id: crypto.randomUUID(), ...safeData }
        await addPrompt(newPrompt)
        message.success('提示词新增成功')
      } else {
        await updatePrompt(currentEditId.value, safeData)
        message.success('提示词更新成功')
      }
      showModal.value = false
    } catch (err) {
      message.error('操作失败：' + err.message)
    } finally {
      saving.value = false
    }
  })
}

const confirmDelete = (prompt) => {
  if (prompt?.builtin) {
    message.warning('内置提示词不可删除')
    return
  }
  dialog.warning({
    title: '确认删除',
    content: `确定删除提示词“${prompt.name || '未命名'}”吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deletePrompt(prompt._id)
        message.success('提示词已删除')
      } catch (err) {
        message.error('删除失败：' + err.message)
      }
    }
  })
}
</script>

<style scoped>
.settings-page {
  position: relative;
  padding-bottom: 8px;
}

.settings-page::before {
  content: '';
  position: absolute;
  inset: 10px 0 auto;
  height: 220px;
  border-radius: 30px;
  background:
    radial-gradient(circle at top left, rgba(52, 168, 139, 0.16), transparent 48%),
    radial-gradient(circle at top right, rgba(83, 117, 191, 0.12), transparent 42%);
  filter: blur(6px);
  pointer-events: none;
}

.settings-page.is-dark::before {
  background:
    radial-gradient(circle at top left, rgba(52, 168, 139, 0.2), transparent 48%),
    radial-gradient(circle at top right, rgba(83, 117, 191, 0.16), transparent 42%);
}

.settings-hero-card,
.settings-grid-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(76, 116, 128, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(246, 249, 250, 0.92));
  box-shadow: 0 18px 38px rgba(18, 39, 43, 0.08);
}

.settings-page.is-dark .settings-hero-card,
.settings-page.is-dark .settings-grid-card {
  border-color: rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(15, 23, 42, 0.76));
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.3);
}

.settings-hero-card::after,
.settings-grid-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent 48%);
  pointer-events: none;
}

.settings-page.is-dark .settings-hero-card::after,
.settings-page.is-dark .settings-grid-card::after {
  background: linear-gradient(135deg, rgba(125, 211, 252, 0.08), transparent 48%);
}

.settings-grid-card {
  animation: settings-card-enter 240ms ease;
}

.n-card {
  transition: all 0.2s;
}
.n-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 32px rgba(15, 34, 38, 0.12);
}

.settings-page.is-dark .n-card:hover {
  box-shadow: 0 18px 34px rgba(2, 6, 23, 0.34);
}

@keyframes settings-card-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.settings-card__meta {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(71, 85, 105, 0.88);
}

.settings-page.is-dark .settings-card__meta {
  color: rgba(203, 213, 225, 0.88);
}
</style>
