<template>
  <n-space vertical size="large" :class="['note-page', { 'is-dark': theme === 'dark' }]">
    <n-layout
      embedded
      has-sider
      sider-placement="right"
      class="note-page__layout"
      content-style="height: 100%; min-height: 0; overflow: visible;"
    >
      <n-layout-content class="note-page__content" content-style="padding: 8px 24px 8px 8px;height: calc(100vh - 30px);">
        <div
          class="note-page__workspace"
          :style="openNotes.length ? { '--note-tabs-height': `${tabsHeight}px` } : null"
        >
          <template v-if="openNotes.length">
            <div class="note-page__tabs-shell">
              <n-button
                v-if="tabsScrollable"
                class="note-page__tabs-scroll-button"
                size="tiny"
                tertiary
                circle
                :disabled="!canScrollTabsBackward"
                @click="scrollTabsBy(-240)"
              >
                <template #icon>
                  <n-icon :component="ChevronBackOutline" size="14" />
                </template>
              </n-button>

              <n-tabs
                ref="tabsRef"
                v-model:value="activeNoteId"
                type="card"
                size="small"
                animated
                closable
                class="note-page__tabs"
                @close="handleCloseTab"
              >
                <n-tab-pane
                  v-for="note in openNotes"
                  :key="note.id"
                  :name="note.id"
                  :closable="true"
                  display-directive="show"
                  class="note-page__tab-pane"
                >
                  <template #tab>
                    <span class="note-page__tab-label" :title="note.path">
                      {{ getNoteTabLabel(note.path) }}
                    </span>
                  </template>
                </n-tab-pane>
              </n-tabs>

              <n-button
                v-if="tabsScrollable"
                class="note-page__tabs-scroll-button"
                size="tiny"
                tertiary
                circle
                :disabled="!canScrollTabsForward"
                @click="scrollTabsBy(240)"
              >
                <template #icon>
                  <n-icon :component="ChevronForwardOutline" size="14" />
                </template>
              </n-button>
            </div>

            <div class="note-page__editor-pane">
              <component
                :is="activeEditorComponent"
                ref="activeEditorRef"
                :key="`note-${activeNote?.id || 'active'}`"
                :file-path="activeNote?.path || null"
                :rename-context="activeNote?.renameContext || null"
                :note-access="activeNote?.access || null"
                :theme="theme"
                @new-note="handleNewNote"
                @open-note="handleOpenNote"
              />
            </div>
          </template>

          <div v-else class="note-page__single-editor">
            <component
              :is="MdEditor"
              ref="activeEditorRef"
              key="note-empty"
              :file-path="null"
              :rename-context="null"
              :note-access="null"
              :theme="theme"
              @new-note="handleNewNote"
              @open-note="handleOpenNote"
            />
          </div>
        </div>
      </n-layout-content>
      <n-layout-sider
        class="note-page__sider"
        collapse-mode="transform"
        :width="320"
        :collapsed-width="16"
        content-style="height: 100%; min-height: 0; padding: 24px; display: flex; flex-direction: column; overflow: hidden;"
        show-trigger="arrow-circle"
        bordered
        :scrollbar-props="{ trigger: 'none' }"
      >
        <FileTree
          ref="fileTreeRef"
          :theme="theme"
          :get-unlocked-password="getUnlockedPassword"
          @select="handleFileSelect"
          @prepare-delete="handlePrepareDelete"
          @prepare-rename="handlePrepareRename"
          @delete="handleFileDelete"
          @rename="handleFileRename"
          @set-password="handleSetPasswordRequest"
          @clear-password="handleClearPasswordRequest"
          @reset-password="handleResetPasswordRequest"
        />
      </n-layout-sider>
    </n-layout>
    <n-modal
      v-model:show="unlockModal.show"
      preset="card"
      title="输入笔记密码"
      style="width: 420px; max-width: 95%;"
      :mask-closable="false"
    >
      <n-flex vertical :size="12" :class="['note-page__modal-panel', { 'is-dark': theme === 'dark' }]">
        <div class="note-page__modal-desc">打开 [{{ unlockModal.path }}] 需要先输入密码。</div>
        <n-input
          v-model:value="unlockModal.password"
          type="password"
          show-password-toggle
          placeholder="输入笔记密码"
          @keydown.enter.prevent="submitUnlockNote"
        />
      </n-flex>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeUnlockModal">取消</n-button>
          <n-button type="primary" :loading="unlockModal.loading" @click="submitUnlockNote">打开</n-button>
        </n-flex>
      </template>
    </n-modal>
    <n-modal
      v-model:show="setPasswordModal.show"
      preset="card"
      :title="setPasswordModalModeTitle"
      style="width: 520px; max-width: 95%;"
      :mask-closable="false"
    >
      <n-flex vertical :size="12" :class="['note-page__modal-panel', { 'is-dark': theme === 'dark' }]">
        <div class="note-page__modal-desc">目标笔记：[{{ setPasswordModal.path }}]</div>
        <n-input
          v-if="setPasswordNeedsCurrentPassword"
          v-model:value="setPasswordModal.currentPassword"
          type="password"
          show-password-toggle
          placeholder="输入当前笔记密码"
        />
        <n-input
          v-model:value="setPasswordModal.newPassword"
          type="password"
          show-password-toggle
          placeholder="输入新的笔记密码"
        />
        <n-input
          v-model:value="setPasswordModal.confirmPassword"
          type="password"
          show-password-toggle
          placeholder="再次输入新的笔记密码"
          @keydown.enter.prevent="submitSetNotePassword"
        />
        <n-alert v-if="hasGlobalFallbackPassword" type="info" :show-icon="false">
          已配置全局配置密码。若要允许“全局密码重置此笔记密码”，请在下方输入一次全局配置密码以绑定恢复能力。
        </n-alert>
        <n-input
          v-if="hasGlobalFallbackPassword"
          v-model:value="setPasswordModal.fallbackPassword"
          type="password"
          show-password-toggle
          placeholder="输入全局配置密码（可选）"
        />
      </n-flex>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeSetPasswordModal">取消</n-button>
          <n-button type="primary" :loading="setPasswordModal.loading" @click="submitSetNotePassword">保存</n-button>
        </n-flex>
      </template>
    </n-modal>
    <n-modal
      v-model:show="clearPasswordModal.show"
      preset="card"
      title="清除笔记密码"
      style="width: 460px; max-width: 95%;"
      :mask-closable="false"
    >
      <n-flex vertical :size="12" :class="['note-page__modal-panel', { 'is-dark': theme === 'dark' }]">
        <div class="note-page__modal-desc">
          清除后此笔记将改为明文存储：[{{ clearPasswordModal.path }}]
        </div>
        <n-input
          v-if="clearPasswordNeedsCurrentPassword"
          v-model:value="clearPasswordModal.currentPassword"
          type="password"
          show-password-toggle
          placeholder="输入当前笔记密码"
          @keydown.enter.prevent="submitClearNotePassword"
        />
        <n-alert v-else type="warning" :show-icon="false">
          当前笔记已在本次会话中解锁，将直接移除密码保护。
        </n-alert>
      </n-flex>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeClearPasswordModal">取消</n-button>
          <n-button type="error" :loading="clearPasswordModal.loading" @click="submitClearNotePassword">清除密码</n-button>
        </n-flex>
      </template>
    </n-modal>
    <n-modal
      v-model:show="resetPasswordModal.show"
      preset="card"
      title="使用全局配置密码重置"
      style="width: 520px; max-width: 95%;"
      :mask-closable="false"
    >
      <n-flex vertical :size="12" :class="['note-page__modal-panel', { 'is-dark': theme === 'dark' }]">
        <div class="note-page__modal-desc">目标笔记：[{{ resetPasswordModal.path }}]</div>
        <n-input
          v-model:value="resetPasswordModal.globalPassword"
          type="password"
          show-password-toggle
          placeholder="输入全局配置密码"
        />
        <n-input
          v-model:value="resetPasswordModal.newPassword"
          type="password"
          show-password-toggle
          placeholder="输入新的笔记密码"
        />
        <n-input
          v-model:value="resetPasswordModal.confirmPassword"
          type="password"
          show-password-toggle
          placeholder="再次输入新的笔记密码"
          @keydown.enter.prevent="submitResetNotePassword"
        />
      </n-flex>
      <template #footer>
        <n-flex justify="flex-end" :size="12">
          <n-button @click="closeResetPasswordModal">取消</n-button>
          <n-button type="primary" :loading="resetPasswordModal.loading" @click="submitResetNotePassword">重置密码</n-button>
        </n-flex>
      </template>
    </n-modal>
  </n-space>
</template>

<script setup>
import path from 'path-browserify'
import { computed, ref, defineAsyncComponent, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  NSpace,
  NLayout,
  NLayoutSider,
  NLayoutContent,
  NTabs,
  NTabPane,
  NModal,
  NInput,
  NButton,
  NIcon,
  NAlert,
  NFlex,
  useMessage
} from 'naive-ui'
import { ChevronBackOutline, ChevronForwardOutline } from '@vicons/ionicons5'
import { getTheme, getNoteConfig, updateNoteConfig } from '@/utils/configListener'
import { readFile, writeFile } from '@/utils/fileOperations'
import { consumePendingNoteFile, onOpenNoteFile } from '@/utils/noteOpenBridge'
import { ensureMarkdownEditorRuntime } from '@/utils/mdEditorRuntime'
import {
  createPasswordVerifier,
  normalizeNoteSecurityConfig,
  verifyPassword,
  decryptNoteContent,
  encryptNoteContent,
  clearEncryptedNoteContent,
  changeNotePassword,
  resetNotePasswordWithFallback,
  hasFallbackRecovery,
  isEncryptedNoteContent,
  replaceEncryptedNoteContent
} from '@/utils/noteEncryption'
import { rewriteNoteAssetsLinksInMarkdown } from '@/utils/notePathUtils'
import { getNoteTypeByPath, isSupportedNotePath } from '@/utils/noteTypes'
import { deleteNoteAttachmentDirectories } from '@/utils/noteAttachmentCleanup'
import {
  removeNotebookRuntimeBoundEnvNamesByPredicate,
  rewriteNotebookRuntimeBoundEnvNamesByPrefix
} from '@/utils/notebookRuntimeConfig'
import MdEditor from './MdEditor.vue'

const FileTree = defineAsyncComponent(() => import('./FileTree.vue'))
const NotebookEditor = defineAsyncComponent(() => import('./NotebookEditor.vue'))

const theme = getTheme()
const message = useMessage()
const noteConfig = getNoteConfig()
const fileTreeRef = ref(null)
const activeEditorRef = ref(null)
const openNotes = ref([])
const activeNoteId = ref(null)
const tabsRef = ref(null)
const tabsHeight = ref(0)
const tabsScrollable = ref(false)
const canScrollTabsBackward = ref(false)
const canScrollTabsForward = ref(false)
const unlockedPasswords = ref({})
let disposeOpenNoteBridge = null
let tabsResizeObserver = null
let tabsScrollElement = null

const unlockModal = ref({
  show: false,
  path: '',
  password: '',
  syncTree: true,
  loading: false
})

const setPasswordModal = ref({
  show: false,
  path: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  fallbackPassword: '',
  loading: false
})

const clearPasswordModal = ref({
  show: false,
  path: '',
  currentPassword: '',
  loading: false
})

const resetPasswordModal = ref({
  show: false,
  path: '',
  globalPassword: '',
  newPassword: '',
  confirmPassword: '',
  loading: false
})

const activeNote = computed(() => {
  const activeId = String(activeNoteId.value || '')
  if (!activeId) return null
  return openNotes.value.find((note) => note.id === activeId) || null
})
const openNoteTabSignature = computed(() => {
  return openNotes.value.map((note) => `${note.id}:${note.path}`).join('|')
})
const activeEditorComponent = computed(() => {
  return activeNote.value?.type === 'notebook' ? NotebookEditor : MdEditor
})

const noteSecurity = computed(() => normalizeNoteSecurityConfig(noteConfig.value?.noteSecurity))
const hasGlobalFallbackPassword = computed(() => !!noteSecurity.value.globalFallbackVerifier)
const setPasswordNeedsCurrentPassword = computed(() => {
  const notePath = String(setPasswordModal.value.path || '')
  return !!getProtectedNoteMeta(notePath) && !getUnlockedPassword(notePath)
})
const clearPasswordNeedsCurrentPassword = computed(() => {
  const notePath = String(clearPasswordModal.value.path || '')
  return !!getProtectedNoteMeta(notePath) && !getUnlockedPassword(notePath)
})
const setPasswordModalModeTitle = computed(() => {
  return getProtectedNoteMeta(setPasswordModal.value.path) ? '修改笔记密码' : '设置笔记密码'
})

function buildNoteTabId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeNotePath(filePath) {
  const normalized = typeof filePath === 'string' ? filePath.trim().replace(/\\/g, '/') : ''
  return normalized && normalized.startsWith('note/') ? normalized : ''
}

function getNoteTabLabel(filePath) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return '未命名笔记'
  return path.basename(normalized, path.extname(normalized)) || normalized
}

function getProtectedNoteMeta(filePath) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return null
  return noteSecurity.value.protectedNotes[normalized] || null
}

function getUnlockedPassword(filePath) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return ''
  return String(unlockedPasswords.value[normalized] || '')
}

function setUnlockedPassword(filePath, password) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return
  unlockedPasswords.value = {
    ...unlockedPasswords.value,
    [normalized]: String(password || '')
  }
}

function removeUnlockedPassword(filePath) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized || !Object.prototype.hasOwnProperty.call(unlockedPasswords.value, normalized)) return
  const next = { ...unlockedPasswords.value }
  delete next[normalized]
  unlockedPasswords.value = next
}

function buildNoteAccess(filePath, explicitPassword = '') {
  const normalized = normalizeNotePath(filePath)
  const protectedMeta = getProtectedNoteMeta(normalized)
  if (!protectedMeta) {
    return {
      protected: false,
      password: ''
    }
  }
  return {
    protected: true,
    password: String(explicitPassword || getUnlockedPassword(normalized) || '')
  }
}

function getOpenNoteIndexById(noteId) {
  return openNotes.value.findIndex((note) => note.id === noteId)
}

function syncTreeSelection(filePath) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return
  fileTreeRef.value?.selectFile?.(normalized)
}

function updateOpenNoteAccess(filePath, password = '') {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return
  openNotes.value = openNotes.value.map((note) => {
    if (note.path !== normalized) return note
    return {
      ...note,
      access: buildNoteAccess(normalized, password)
    }
  })
}

function setOpenNoteAccess(filePath, access) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return
  openNotes.value = openNotes.value.map((note) => {
    if (note.path !== normalized) return note
    return {
      ...note,
      access: {
        protected: !!access?.protected,
        password: String(access?.password || '')
      }
    }
  })
}

function openNoteInTab(filePath, options = {}) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return null

  const noteType = getNoteTypeByPath(normalized)
  const access = buildNoteAccess(normalized, options.password)
  let note = openNotes.value.find((item) => item.path === normalized)
  if (!note) {
    note = {
      id: buildNoteTabId(),
      path: normalized,
      type: noteType,
      renameContext: null,
      access
    }
    openNotes.value = [...openNotes.value, note]
  } else {
    note.type = noteType
    note.access = access
    openNotes.value = [...openNotes.value]
  }

  activeNoteId.value = note.id
  if (options.syncTree !== false) syncTreeSelection(normalized)
  return note
}

function chooseFallbackActiveNoteId(closedIndex, closedId) {
  if (!closedId || activeNoteId.value !== closedId) return activeNoteId.value
  if (!openNotes.value.length) return null
  const fallbackIndex = Math.max(0, Math.min(closedIndex - 1, openNotes.value.length - 1))
  return openNotes.value[fallbackIndex]?.id || openNotes.value[0]?.id || null
}

function replacePathPrefix(targetPath, oldBase, newBase) {
  const t = String(targetPath || '')
  if (t === oldBase) return newBase
  if (t.startsWith(`${oldBase}/`)) return `${newBase}${t.slice(oldBase.length)}`
  return t
}

function closeUnlockModal() {
  unlockModal.value = {
    show: false,
    path: '',
    password: '',
    syncTree: true,
    loading: false
  }
}

function closeSetPasswordModal() {
  setPasswordModal.value = {
    show: false,
    path: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    fallbackPassword: '',
    loading: false
  }
}

function closeClearPasswordModal() {
  clearPasswordModal.value = {
    show: false,
    path: '',
    currentPassword: '',
    loading: false
  }
}

function closeResetPasswordModal() {
  resetPasswordModal.value = {
    show: false,
    path: '',
    globalPassword: '',
    newPassword: '',
    confirmPassword: '',
    loading: false
  }
}

function openUnlockModal(filePath, options = {}) {
  unlockModal.value = {
    show: true,
    path: filePath,
    password: '',
    syncTree: options.syncTree !== false,
    loading: false
  }
}

async function saveNoteSecurityProtectedMap(nextProtectedNotes) {
  await updateNoteConfig({
    noteSecurity: {
      ...noteSecurity.value,
      protectedNotes: nextProtectedNotes
    }
  })
}

async function upsertProtectedNote(filePath, payload) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return
  await saveNoteSecurityProtectedMap({
    ...noteSecurity.value.protectedNotes,
    [normalized]: payload
  })
}

async function removeProtectedNotesByPredicate(predicate) {
  const nextProtectedNotes = {}
  Object.entries(noteSecurity.value.protectedNotes).forEach(([notePath, meta]) => {
    if (predicate(notePath, meta)) return
    nextProtectedNotes[notePath] = meta
  })
  await saveNoteSecurityProtectedMap(nextProtectedNotes)
}

async function rewriteProtectedNotesPathMap(oldBase, newBase) {
  const nextProtectedNotes = {}
  Object.entries(noteSecurity.value.protectedNotes).forEach(([notePath, meta]) => {
    nextProtectedNotes[replacePathPrefix(notePath, oldBase, newBase)] = meta
  })
  await saveNoteSecurityProtectedMap(nextProtectedNotes)
}

async function removeNotebookRuntimeBindingsByPredicate(predicate) {
  const currentRuntime = noteConfig.value?.notebookRuntime || {}
  const nextRuntime = removeNotebookRuntimeBoundEnvNamesByPredicate(currentRuntime, predicate)
  if (JSON.stringify(nextRuntime.noteEnvBindings || {}) === JSON.stringify(currentRuntime.noteEnvBindings || {})) {
    return
  }
  await updateNoteConfig({
    notebookRuntime: nextRuntime
  })
}

async function rewriteNotebookRuntimeBindingsPathMap(oldBase, newBase) {
  const currentRuntime = noteConfig.value?.notebookRuntime || {}
  const nextRuntime = rewriteNotebookRuntimeBoundEnvNamesByPrefix(currentRuntime, oldBase, newBase)
  if (JSON.stringify(nextRuntime.noteEnvBindings || {}) === JSON.stringify(currentRuntime.noteEnvBindings || {})) {
    return
  }
  await updateNoteConfig({
    notebookRuntime: nextRuntime
  })
}

async function ensureNoteCanOpen(filePath, password) {
  const raw = String(await readFile(filePath, 'utf-8') || '')
  await decryptNoteContent(raw, password)
}

async function tryOpenProtectedNoteWithCachedPassword(filePath, password, options = {}) {
  try {
    await ensureNoteCanOpen(filePath, password)
    return openNoteInTab(filePath, {
      syncTree: options.syncTree,
      password
    })
  } catch {
    removeUnlockedPassword(filePath)
    updateOpenNoteAccess(filePath, '')
    openUnlockModal(filePath, { syncTree: options.syncTree })
    return null
  }
}

async function ensureNoteOpened(filePath, options = {}) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return null

  const protectedMeta = getProtectedNoteMeta(normalized)
  if (!protectedMeta) {
    return openNoteInTab(normalized, { syncTree: options.syncTree })
  }

  const cachedPassword = getUnlockedPassword(normalized)
  if (cachedPassword) {
    return tryOpenProtectedNoteWithCachedPassword(normalized, cachedPassword, options)
  }

  openUnlockModal(normalized, { syncTree: options.syncTree })
  return null
}

async function submitUnlockNote() {
  const notePath = normalizeNotePath(unlockModal.value.path)
  const password = String(unlockModal.value.password || '')
  if (!notePath) return
  if (!password) {
    message.warning('请输入笔记密码')
    return
  }

  const protectedMeta = getProtectedNoteMeta(notePath)
  const syncTree = unlockModal.value.syncTree
  if (!protectedMeta) {
    closeUnlockModal()
    openNoteInTab(notePath, { syncTree, password })
    return
  }

  unlockModal.value.loading = true
  try {
    const ok = await verifyPassword(password, protectedMeta.verifier)
    if (!ok) {
      message.error('笔记密码错误')
      return
    }

    await ensureNoteCanOpen(notePath, password)
    setUnlockedPassword(notePath, password)
    setOpenNoteAccess(notePath, { protected: true, password })
    closeUnlockModal()
    openNoteInTab(notePath, { syncTree, password })
  } catch (err) {
    message.error('打开笔记失败：' + (err?.message || String(err)))
  } finally {
    unlockModal.value.loading = false
  }
}

async function resolveVerifiedFallbackPassword(candidate) {
  const password = String(candidate || '')
  if (!password) return ''
  if (!hasGlobalFallbackPassword.value) {
    throw new Error('当前未配置全局配置密码')
  }
  const ok = await verifyPassword(password, noteSecurity.value.globalFallbackVerifier)
  if (!ok) throw new Error('全局配置密码错误')
  return password
}

async function handleFileSelect(filePath) {
  await ensureNoteOpened(filePath, { syncTree: false })
}

async function releaseOpenNotesForPath(targetPath) {
  const normalized = normalizeNotePath(targetPath)
  if (!normalized) return

  const nextNotes = openNotes.value.filter((note) => {
    return note.path !== normalized && !note.path.startsWith(`${normalized}/`)
  })

  if (nextNotes.length === openNotes.value.length) return

  const activeIndex = getOpenNoteIndexById(activeNoteId.value)
  const closedId = activeNoteId.value
  openNotes.value = nextNotes
  activeNoteId.value = chooseFallbackActiveNoteId(activeIndex, closedId)

  await nextTick()
  await new Promise((resolve) => window.setTimeout(resolve, 120))
}

function shouldFlushActiveEditorBeforePathChange(targetPath) {
  const normalized = normalizeNotePath(targetPath)
  const activePath = normalizeNotePath(activeNote.value?.path)
  if (!normalized || !activePath) return false
  return activePath === normalized || activePath.startsWith(`${normalized}/`)
}

async function flushActiveEditorForTargetPath(targetPath) {
  if (!shouldFlushActiveEditorBeforePathChange(targetPath)) return
  await activeEditorRef.value?.flushPendingSave?.()
}

async function rewriteProtectedMarkdownNoteAssetsAfterRename(oldPath, newPath, password = '') {
  const normalizedOldPath = normalizeNotePath(oldPath)
  const normalizedNewPath = normalizeNotePath(newPath)
  const notePassword = String(password || '')
  if (!normalizedOldPath || !normalizedNewPath || !notePassword) return false
  if (!isSupportedNotePath(normalizedOldPath) || getNoteTypeByPath(normalizedOldPath) !== 'markdown') return false
  if (!getProtectedNoteMeta(normalizedOldPath)) return false

  const rawContent = String(await readFile(normalizedNewPath, 'utf-8') || '')
  if (!isEncryptedNoteContent(rawContent)) return false

  const plaintext = await decryptNoteContent(rawContent, notePassword)
  const oldDocName = path.basename(normalizedOldPath, path.extname(normalizedOldPath))
  const newDocName = path.basename(normalizedNewPath, path.extname(normalizedNewPath))
  const rewrittenPlaintext = rewriteNoteAssetsLinksInMarkdown(plaintext, oldDocName, newDocName)
  if (rewrittenPlaintext === plaintext) return false

  const rewrittenEncrypted = await replaceEncryptedNoteContent(rawContent, {
    notePassword,
    plaintext: rewrittenPlaintext
  })
  if (rewrittenEncrypted === rawContent) return false

  await writeFile(normalizedNewPath, rewrittenEncrypted)
  return true
}

async function handlePrepareDelete(targetPath, done) {
  try {
    if (shouldFlushActiveEditorBeforePathChange(targetPath)) {
      await activeEditorRef.value?.flushPendingSave?.()
    }
    await releaseOpenNotesForPath(targetPath)
    done?.()
  } catch (err) {
    done?.(err)
  }
}

async function handlePrepareRename(oldPath, _newPath, done) {
  try {
    const normalizedOldPath = normalizeNotePath(oldPath)
    if (
      normalizedOldPath &&
      isSupportedNotePath(normalizedOldPath) &&
      getNoteTypeByPath(normalizedOldPath) === 'markdown' &&
      getProtectedNoteMeta(normalizedOldPath) &&
      !getUnlockedPassword(normalizedOldPath)
    ) {
      message.warning('受保护的 Markdown 笔记请先在编辑器中解锁后再重命名')
      done?.(new Error('受保护的 Markdown 笔记缺少解锁密码'))
      return
    }

    if (shouldFlushActiveEditorBeforePathChange(oldPath)) {
      await activeEditorRef.value?.flushPendingSave?.()
    }
    done?.()
  } catch (err) {
    done?.(err)
  }
}

async function handleFileDelete(deletedPath) {
  const normalized = normalizeNotePath(deletedPath)
  if (!normalized) return

  await releaseOpenNotesForPath(normalized)

  Object.keys(unlockedPasswords.value).forEach((notePath) => {
    if (notePath === normalized || notePath.startsWith(`${normalized}/`)) removeUnlockedPassword(notePath)
  })

  try {
    await removeProtectedNotesByPredicate((notePath) => {
      return notePath === normalized || notePath.startsWith(`${normalized}/`)
    })
    await removeNotebookRuntimeBindingsByPredicate((filePath) => {
      return filePath === normalized || filePath.startsWith(`${normalized}/`)
    })
    await deleteNoteAttachmentDirectories(normalized).catch(() => {})
  } catch (err) {
    message.error('同步笔记相关配置失败：' + (err?.message || String(err)))
  }
}

async function handleFileRename(oldPath, newPath) {
  const normalizedOldPath = normalizeNotePath(oldPath)
  const normalizedNewPath = normalizeNotePath(newPath)
  if (!normalizedOldPath || !normalizedNewPath) return

  const renameTokenPrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let changed = false
  const openNote = openNotes.value.find((note) => note.path === normalizedOldPath)
  const protectedMarkdownPassword = String(openNote?.access?.password || getUnlockedPassword(normalizedOldPath) || '')

  openNotes.value = openNotes.value.map((note, index) => {
    if (note.path !== normalizedOldPath && !note.path.startsWith(`${normalizedOldPath}/`)) return note

    const renamedFrom = note.path
    const renamedTo =
      note.path === normalizedOldPath
        ? normalizedNewPath
        : `${normalizedNewPath}${note.path.slice(normalizedOldPath.length)}`

    changed = true
    return {
      ...note,
      path: renamedTo,
      type: getNoteTypeByPath(renamedTo),
      access: note.access?.protected
        ? {
            protected: true,
            password: String(note.access.password || '')
          }
        : buildNoteAccess(renamedTo),
      renameContext: {
        from: renamedFrom,
        to: renamedTo,
        token: `${renameTokenPrefix}-${index}`
      }
    }
  })

  if (changed && activeNote.value?.path) syncTreeSelection(activeNote.value.path)

  let protectedMarkdownRewriteError = null
  if (protectedMarkdownPassword) {
    try {
      await rewriteProtectedMarkdownNoteAssetsAfterRename(normalizedOldPath, normalizedNewPath, protectedMarkdownPassword)
    } catch (err) {
      protectedMarkdownRewriteError = err
    }
  }

  const nextUnlockedPasswords = {}
  Object.entries(unlockedPasswords.value).forEach(([notePath, password]) => {
    nextUnlockedPasswords[replacePathPrefix(notePath, normalizedOldPath, normalizedNewPath)] = password
  })
  unlockedPasswords.value = nextUnlockedPasswords

  try {
    await rewriteProtectedNotesPathMap(normalizedOldPath, normalizedNewPath)
    await rewriteNotebookRuntimeBindingsPathMap(normalizedOldPath, normalizedNewPath)
  } catch (err) {
    message.error('同步笔记配置失败：' + (err?.message || String(err)))
  }

  if (protectedMarkdownRewriteError) {
    message.warning('重命名已完成，但受保护笔记的图片链接同步失败：' + (protectedMarkdownRewriteError?.message || String(protectedMarkdownRewriteError)))
  }
}

function handleNewNote() {
  fileTreeRef.value?.openNewNoteModal()
}

async function handleOpenNote(filePath) {
  await ensureNoteOpened(filePath)
}

async function handleCloseTab(tabId) {
  const closedId = String(tabId || '')
  if (!closedId) return

  const closedIndex = getOpenNoteIndexById(closedId)
  if (closedIndex < 0) return

  if (activeNoteId.value === closedId) {
    await activeEditorRef.value?.flushPendingSave?.()
  }

  openNotes.value = openNotes.value.filter((note) => note.id !== closedId)
  activeNoteId.value = chooseFallbackActiveNoteId(closedIndex, closedId)
}

function handleSetPasswordRequest(filePath) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return
  setPasswordModal.value = {
    show: true,
    path: normalized,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    fallbackPassword: '',
    loading: false
  }
}

function handleClearPasswordRequest(filePath) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return
  if (!getProtectedNoteMeta(normalized)) {
    message.info('该笔记当前未设置密码')
    return
  }
  clearPasswordModal.value = {
    show: true,
    path: normalized,
    currentPassword: '',
    loading: false
  }
}

function handleResetPasswordRequest(filePath) {
  const normalized = normalizeNotePath(filePath)
  if (!normalized) return
  if (!getProtectedNoteMeta(normalized)) {
    message.info('该笔记当前未设置密码')
    return
  }
  if (!hasGlobalFallbackPassword.value) {
    message.warning('请先在全局配置中设置全局配置密码')
    return
  }
  resetPasswordModal.value = {
    show: true,
    path: normalized,
    globalPassword: '',
    newPassword: '',
    confirmPassword: '',
    loading: false
  }
}

async function submitSetNotePassword() {
  const notePath = normalizeNotePath(setPasswordModal.value.path)
  const currentPassword = getUnlockedPassword(notePath) || String(setPasswordModal.value.currentPassword || '')
  const newPassword = String(setPasswordModal.value.newPassword || '')
  const confirmPassword = String(setPasswordModal.value.confirmPassword || '')
  if (!notePath) return
  if (!newPassword) {
    message.warning('新笔记密码不能为空')
    return
  }
  if (newPassword !== confirmPassword) {
    message.warning('两次输入的新密码不一致')
    return
  }

  setPasswordModal.value.loading = true
  try {
    await flushActiveEditorForTargetPath(notePath)
    const raw = String(await readFile(notePath, 'utf-8') || '')
    const protectedMeta = getProtectedNoteMeta(notePath)
    const fallbackPassword = await resolveVerifiedFallbackPassword(setPasswordModal.value.fallbackPassword)
    const encrypted = protectedMeta && hasFallbackRecovery(raw) && !fallbackPassword
      ? await changeNotePassword(raw, {
          currentNotePassword: currentPassword,
          newNotePassword: newPassword
        })
      : protectedMeta && !fallbackPassword && !hasFallbackRecovery(raw)
        ? await changeNotePassword(raw, {
            currentNotePassword: currentPassword,
            newNotePassword: newPassword,
            newFallbackPassword: ''
          }).catch(async () => {
            const plaintext = await clearEncryptedNoteContent(raw, currentPassword)
            return encryptNoteContent(plaintext, { notePassword: newPassword })
          })
        : await (async () => {
            const plaintext = protectedMeta
              ? await clearEncryptedNoteContent(raw, currentPassword)
              : raw
            return encryptNoteContent(plaintext, {
              notePassword: newPassword,
              fallbackPassword
            })
          })()
    await writeFile(notePath, encrypted)

    const verifier = await createPasswordVerifier(newPassword)
    await upsertProtectedNote(notePath, {
      verifier,
      updatedAt: new Date().toISOString(),
      hasFallbackRecovery: !!fallbackPassword || (protectedMeta ? hasFallbackRecovery(raw) : false)
    })
    setUnlockedPassword(notePath, newPassword)
    setOpenNoteAccess(notePath, { protected: true, password: newPassword })
    closeSetPasswordModal()
    message.success(protectedMeta ? '笔记密码已更新' : '笔记密码已设置')
  } catch (err) {
    message.error((getProtectedNoteMeta(notePath) ? '更新密码失败：' : '设置密码失败：') + (err?.message || String(err)))
  } finally {
    setPasswordModal.value.loading = false
  }
}

async function submitClearNotePassword() {
  const notePath = normalizeNotePath(clearPasswordModal.value.path)
  const currentPassword = getUnlockedPassword(notePath) || String(clearPasswordModal.value.currentPassword || '')
  if (!notePath) return

  clearPasswordModal.value.loading = true
  try {
    await flushActiveEditorForTargetPath(notePath)
    const raw = String(await readFile(notePath, 'utf-8') || '')
    const plaintext = await clearEncryptedNoteContent(raw, currentPassword)
    await writeFile(notePath, plaintext)
    await removeProtectedNotesByPredicate((candidatePath) => candidatePath === notePath)
    removeUnlockedPassword(notePath)
    setOpenNoteAccess(notePath, { protected: false, password: '' })
    closeClearPasswordModal()
    message.success('笔记密码已清除')
  } catch (err) {
    message.error('清除笔记密码失败：' + (err?.message || String(err)))
  } finally {
    clearPasswordModal.value.loading = false
  }
}

async function submitResetNotePassword() {
  const notePath = normalizeNotePath(resetPasswordModal.value.path)
  const globalPassword = String(resetPasswordModal.value.globalPassword || '')
  const newPassword = String(resetPasswordModal.value.newPassword || '')
  const confirmPassword = String(resetPasswordModal.value.confirmPassword || '')
  if (!notePath) return
  if (!globalPassword) {
    message.warning('请输入全局配置密码')
    return
  }
  if (!newPassword) {
    message.warning('新笔记密码不能为空')
    return
  }
  if (newPassword !== confirmPassword) {
    message.warning('两次输入的新密码不一致')
    return
  }

  resetPasswordModal.value.loading = true
  try {
    const ok = await verifyPassword(globalPassword, noteSecurity.value.globalFallbackVerifier)
    if (!ok) {
      message.error('全局配置密码错误')
      return
    }

    await flushActiveEditorForTargetPath(notePath)
    const raw = String(await readFile(notePath, 'utf-8') || '')
    if (!hasFallbackRecovery(raw)) {
      throw new Error('当前笔记未绑定全局配置密码，无法重置')
    }

    const encrypted = await resetNotePasswordWithFallback(raw, {
      fallbackPassword: globalPassword,
      newNotePassword: newPassword,
      newFallbackPassword: globalPassword
    })
    await writeFile(notePath, encrypted)

    const verifier = await createPasswordVerifier(newPassword)
    await upsertProtectedNote(notePath, {
      verifier,
      updatedAt: new Date().toISOString(),
      hasFallbackRecovery: true
    })
    setUnlockedPassword(notePath, newPassword)
    setOpenNoteAccess(notePath, { protected: true, password: newPassword })
    closeResetPasswordModal()
    message.success('笔记密码已重置')
  } catch (err) {
    message.error('重置笔记密码失败：' + (err?.message || String(err)))
  } finally {
    resetPasswordModal.value.loading = false
  }
}

function resolveTabsElement() {
  const tabsInstance = tabsRef.value
  if (!tabsInstance) return null
  return tabsInstance.$el || tabsInstance
}

function resolveTabsNavScrollWrapper() {
  const tabsEl = resolveTabsElement()
  if (!tabsEl) return null
  return tabsEl.querySelector('.n-tabs-nav-scroll-wrapper')
}

function resolveTabsScrollElement() {
  const wrapperEl = resolveTabsNavScrollWrapper()
  if (!wrapperEl) return null

  const candidates = [wrapperEl, ...wrapperEl.querySelectorAll('*')]
  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement)) continue
    if (candidate.scrollWidth <= candidate.clientWidth + 1) continue

    const style = window.getComputedStyle(candidate)
    const overflowX = style?.overflowX || ''
    if (overflowX === 'hidden' || overflowX === 'visible' || overflowX === 'clip') continue
    return candidate
  }

  return wrapperEl.scrollWidth > wrapperEl.clientWidth + 1 ? wrapperEl : null
}

function updateTabsScrollState() {
  const scrollEl = resolveTabsScrollElement()
  tabsScrollElement = scrollEl
  if (!scrollEl) {
    tabsScrollable.value = false
    canScrollTabsBackward.value = false
    canScrollTabsForward.value = false
    return
  }

  const maxScrollLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth)
  const scrollLeft = Math.max(0, scrollEl.scrollLeft)
  tabsScrollable.value = maxScrollLeft > 4
  canScrollTabsBackward.value = scrollLeft > 4
  canScrollTabsForward.value = scrollLeft < maxScrollLeft - 4
}

function bindTabsScrollListener() {
  const nextScrollElement = resolveTabsScrollElement()
  if (tabsScrollElement && tabsScrollElement !== nextScrollElement) {
    tabsScrollElement.removeEventListener('scroll', updateTabsScrollState)
  }

  tabsScrollElement = nextScrollElement
  tabsScrollElement?.removeEventListener?.('scroll', updateTabsScrollState)
  tabsScrollElement?.addEventListener?.('scroll', updateTabsScrollState, { passive: true })
  updateTabsScrollState()
}

function scrollActiveTabIntoView() {
  const tabsEl = resolveTabsElement()
  if (!tabsEl || !activeNoteId.value) return

  const activeTabEl = tabsEl.querySelector('.n-tabs-tab--active')
  if (!activeTabEl?.scrollIntoView) return

  activeTabEl.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest',
    inline: 'nearest'
  })
}

function scrollTabsBy(delta) {
  const scrollEl = resolveTabsScrollElement()
  if (!scrollEl) return

  const maxScrollLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth)
  const nextLeft = Math.max(0, Math.min(maxScrollLeft, scrollEl.scrollLeft + delta))
  scrollEl.scrollTo({
    left: nextLeft,
    behavior: 'smooth'
  })
}

function measureTabsHeight() {
  if (!openNotes.value.length) {
    tabsHeight.value = 0
    return
  }

  const tabsEl = resolveTabsElement()
  if (!tabsEl) return
  tabsHeight.value = Math.ceil(tabsEl.getBoundingClientRect().height || 0)
}

function stopObserveTabsHeight() {
  tabsScrollElement?.removeEventListener?.('scroll', updateTabsScrollState)
  tabsScrollElement = null
  tabsResizeObserver?.disconnect?.()
  tabsResizeObserver = null
}

function syncTabsHeight() {
  if (!openNotes.value.length) {
    tabsHeight.value = 0
    stopObserveTabsHeight()
    return
  }

  nextTick(() => {
    const tabsEl = resolveTabsElement()
    if (!tabsEl) return

    measureTabsHeight()
    bindTabsScrollListener()
    scrollActiveTabIntoView()

    if (typeof ResizeObserver === 'undefined') return
    if (!tabsResizeObserver) {
      tabsResizeObserver = new ResizeObserver(() => {
        measureTabsHeight()
        updateTabsScrollState()
      })
    } else {
      tabsResizeObserver.disconnect()
    }

    tabsResizeObserver.observe(tabsEl)
  })
}

watch(
  () => activeNote.value?.path || '',
  (nextPath) => {
    if (!nextPath) return
    syncTreeSelection(nextPath)
  }
)

watch(
  () => [openNotes.value.length, activeNoteId.value, openNoteTabSignature.value],
  () => {
    syncTabsHeight()
  },
  { flush: 'post' }
)

onMounted(() => {
  void ensureMarkdownEditorRuntime().catch(() => {})

  disposeOpenNoteBridge = onOpenNoteFile((filePath) => {
    void handleOpenNote(filePath)
  })

  const pending = consumePendingNoteFile()
  if (pending) void handleOpenNote(pending)
  syncTabsHeight()
})

onBeforeUnmount(() => {
  stopObserveTabsHeight()
  disposeOpenNoteBridge?.()
  disposeOpenNoteBridge = null
})
</script>

<style scoped>
.note-page {
  height: calc(100vh - 30px);
  min-height: 0;
  overflow: hidden;
}

.note-page :deep(> .n-space-item) {
  height: 100%;
  min-height: 0;
}

.note-page__layout {
  background: transparent;
  height: 100%;
  min-height: 0;
  overflow: visible;
}

.note-page__layout :deep(> .n-layout-scroll-container) {
  overflow: visible;
}

.note-page__content {
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  contain: layout paint;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(246, 249, 250, 0.88));
  border-radius: 24px;
}

.note-page__content :deep(> .n-layout-scroll-container) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.note-page.is-dark .note-page__content {
  background:
    radial-gradient(circle at top left, rgba(148, 163, 184, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(17, 24, 39, 0.86), rgba(15, 23, 42, 0.96));
}

.note-page__workspace,
.note-page__single-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.note-page__workspace {
  flex: 1;
}

.note-page__tabs-shell {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.note-page__editor-pane {
  height: calc(100% - var(--note-tabs-height, 0px));
  min-height: 0;
  contain: layout paint;
}

.note-page__tabs {
  flex: 1;
  min-width: 0;
}

.note-page__tabs-scroll-button {
  margin-top: 6px;
  flex: 0 0 auto;
}

.note-page__tab-label {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.note-page__tabs :deep(.n-tabs-nav) {
  margin-bottom: 10px;
  padding: 0 8px 0 10px;
}

.note-page__tabs :deep(.n-tabs-nav-scroll-wrapper) {
  min-width: 0;
}

.note-page__tabs :deep(.n-tabs-tab) {
  max-width: 220px;
  border-radius: 14px 14px 0 0;
}

.note-page__tabs :deep(.n-tabs-tab__label) {
  max-width: 100%;
}

.note-page__tabs :deep(.n-tabs-pane-wrapper) {
  display: none;
}

.note-page__sider {
  contain: layout;
  position: relative;
  z-index: 20;
  margin-left: 12px;
  height: 100%;
  min-height: 0;
  overflow: visible;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(248, 250, 252, 0.94));
  border-radius: 24px;
}

.note-page__sider :deep(.n-layout-sider-scroll-container) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.note-page__sider :deep(.n-layout-toggle-button) {
  z-index: 60;
  pointer-events: auto;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.note-page.is-dark .note-page__sider {
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.9), rgba(15, 23, 42, 0.98));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
}

.note-page__modal-desc {
  font-size: 13px;
  color: rgba(71, 85, 105, 0.92);
  word-break: break-all;
}

.note-page.is-dark .note-page__modal-desc {
  color: rgba(203, 213, 225, 0.88);
}

.note-page__modal-panel.is-dark .note-page__modal-desc {
  color: rgba(203, 213, 225, 0.88);
}
</style>



