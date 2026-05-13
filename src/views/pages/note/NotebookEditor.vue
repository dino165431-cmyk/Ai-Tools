<template>
  <div v-if="!filePath" :class="['notebook-welcome', { 'is-dark': theme === 'dark' }]">
    <n-card class="notebook-welcome__card" :bordered="false">
      <n-icon size="46" :depth="3"><CodeSlashOutline /></n-icon>
      <h2>欢迎使用超级笔记</h2>
      <p>从右侧打开一个 <code>.ipynb</code> 文件，或者先新建一篇超级笔记。</p>
      <n-button type="primary" @click="emit('new-note')">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建超级笔记
      </n-button>
    </n-card>
  </div>
  <div v-else ref="editorRootRef" :class="['notebook-editor', { 'is-dark': theme === 'dark' }]">
    <header class="notebook-editor__header">
      <div class="notebook-editor__heading">
        <span class="notebook-editor__eyebrow">Notebook Workspace</span>
        <div class="notebook-editor__title-row">
          <h3>{{ noteTitle }}</h3>
          <span class="notebook-editor__path">{{ filePath }}</span>
        </div>
        <div class="notebook-editor__meta">
          <n-tag size="small" :bordered="false" type="info">{{ saveStatusLabel }}</n-tag>
          <n-tag size="small" :bordered="false">{{ kernelLabel }}</n-tag>
          <n-tag size="small" :bordered="false" :type="runtimeEnvTagType">{{ runtimeEnvTagLabel }}</n-tag>
          <n-tag size="small" :bordered="false" :type="pythonLspStatus.type">{{ pythonLspStatus.label }}</n-tag>
          <n-tag v-if="runningCellId" size="small" :bordered="false" type="warning">执行中</n-tag>
        </div>
      </div>
      <div class="notebook-editor__toolbar">
        <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="small" @click="insertCellRelativeToSelection('markdown')"><template #icon><n-icon><DocumentTextOutline /></n-icon></template></n-button></template>添加 Markdown（Ctrl+Alt+M）</n-tooltip>
        <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="small" @click="insertCellRelativeToSelection('code')"><template #icon><n-icon><CodeSlashOutline /></n-icon></template></n-button></template>添加代码 Cell（Ctrl+Alt+C）</n-tooltip>
        <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="small" :loading="manualSaving" :disabled="loading || !filePath" @click="saveNow"><template #icon><n-icon><SaveOutline /></n-icon></template></n-button></template>立即保存</n-tooltip>
        <n-tooltip trigger="hover"><template #trigger><n-button type="primary" ghost circle size="small" :loading="runAllLoading" :disabled="loading || !notebook.cells.length || !!runningCellId || runtimeInstallModal.loading" @click="runAllCellsSafe"><template #icon><n-icon><PlayOutline /></n-icon></template></n-button></template>从上到下运行全部 Cell</n-tooltip>
        <n-tooltip trigger="hover"><template #trigger><n-button circle size="small" :loading="kernelActionLoading" :disabled="!runningCellId || runtimeInstallModal.loading || kernelActionLoading" @click="interruptCurrentSessionSafe"><template #icon><n-icon><PauseOutline /></n-icon></template></n-button></template>停止当前执行</n-tooltip>
        <n-tooltip trigger="hover"><template #trigger><n-button circle size="small" :loading="kernelActionLoading" :disabled="runtimeInstallModal.loading || kernelActionLoading" @click="restartCurrentSessionSafe"><template #icon><n-icon><RefreshOutline /></n-icon></template></n-button></template>{{ runningCellId ? '强制重启 Kernel（终止当前执行）' : '重启 Kernel' }}</n-tooltip>
      </div>
    </header>
    <n-alert v-if="loadError" class="notebook-editor__alert" type="error" :show-icon="false">{{ loadError }}</n-alert>
    <n-alert v-else-if="runtimeIssue || managedEnvHealthIssue" class="notebook-editor__alert" type="warning" :show-icon="false">{{ runtimeIssue || managedEnvHealthIssue }}</n-alert>
    <div class="notebook-editor__body">
      <div v-if="!loading && stickyCellVisible && stickyCell" class="notebook-editor__sticky-layer">
        <div class="notebook-editor__sticky-header">
          <div class="notebook-editor__sticky-title">
            <n-dropdown v-if="stickyCell.cell_type === 'code'" :options="buildRuntimeDropdownOptions()" trigger="click" :disabled="stickyCellRunning" @select="handleStickyRuntimeSelect">
              <n-tag
                size="small"
                :bordered="false"
                :type="getCellRuntimeDescriptor(stickyCell).tagType"
                class="notebook-editor__sticky-runtime-tag"
              >
                {{ getCellRuntimeDescriptor(stickyCell).label }}
              </n-tag>
            </n-dropdown>
            <n-tag v-else size="small" :bordered="false" type="success">Markdown</n-tag>
            <span>Cell {{ stickyCellIndex + 1 }}</span>
            <span v-if="stickyCell.cell_type === 'code'" class="notebook-editor__sticky-exec">In [{{ stickyCellExecutionCountLabel }}]</span>
          </div>

          <div class="notebook-editor__sticky-actions">
            <template v-if="stickyCell.cell_type === 'markdown'">
              <n-tooltip trigger="hover"><template #trigger><n-button type="primary" ghost circle size="tiny" @click="runStickyCell"><template #icon><n-icon><PlayOutline /></n-icon></template></n-button></template>运行（Shift+Enter）</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="insertCellAfter(stickyCell.id, 'markdown')"><template #icon><n-icon><DocumentTextOutline /></n-icon></template></n-button></template>在下方插入 Markdown（Ctrl+Alt+M）</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="insertCellAfter(stickyCell.id, 'code')"><template #icon><n-icon><CodeSlashOutline /></n-icon></template></n-button></template>在下方插入代码 Cell（Ctrl+Alt+C）</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="scrollStickyCellContent"><template #icon><n-icon><ChevronDownOutline /></n-icon></template></n-button></template>跳到正文区域</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="toggleStickyMarkdownPreview"><template #icon><n-icon><component :is="stickyCellPreviewing ? CreateOutline : EyeOutline" /></n-icon></template></n-button></template>{{ stickyCellPreviewing ? '切换到编辑模式' : '切换到预览模式' }}</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="toggleStickyCellCollapsed"><template #icon><n-icon><component :is="stickyCellCollapsed ? ExpandCellIcon : CollapseCellIcon" /></n-icon></template></n-button></template>{{ stickyCellCollapsed ? '展开 Cell' : '折叠 Cell' }}</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" :disabled="stickyCellIndex <= 0" @click="moveCell(stickyCell.id, -1)"><template #icon><n-icon><ArrowUpOutline /></n-icon></template></n-button></template>上移</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" :disabled="stickyCellIndex >= notebook.cells.length - 1" @click="moveCell(stickyCell.id, 1)"><template #icon><n-icon><ArrowDownOutline /></n-icon></template></n-button></template>下移</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="deleteCell(stickyCell.id)"><template #icon><n-icon><TrashOutline /></n-icon></template></n-button></template>删除</n-tooltip>
            </template>

            <template v-else>
              <n-tooltip trigger="hover"><template #trigger><n-button :type="stickyCellRunning ? 'warning' : 'primary'" ghost circle size="tiny" @click="handleStickyRunOrStop"><template #icon><n-icon><component :is="stickyCellRunning ? StopCircleOutline : PlayOutline" /></n-icon></template></n-button></template>{{ stickyCellRunning ? '停止运行' : '运行（Shift+Enter）' }}</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="insertCellAfter(stickyCell.id, 'markdown')"><template #icon><n-icon><DocumentTextOutline /></n-icon></template></n-button></template>在下方插入 Markdown（Ctrl+Alt+M）</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="insertCellAfter(stickyCell.id, 'code')"><template #icon><n-icon><CodeSlashOutline /></n-icon></template></n-button></template>在下方插入代码 Cell（Ctrl+Alt+C）</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" :disabled="!stickyCellHasOutputs" @click="scrollStickyCellOutput"><template #icon><n-icon><ChevronDownOutline /></n-icon></template></n-button></template>跳到输出区</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="scrollStickyCellCode"><template #icon><n-icon><ChevronUpOutline /></n-icon></template></n-button></template>回到代码区</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" @click="toggleStickyCellCollapsed"><template #icon><n-icon><component :is="stickyCellCollapsed ? ExpandCellIcon : CollapseCellIcon" /></n-icon></template></n-button></template>{{ stickyCellCollapsed ? '展开 Cell' : '折叠 Cell' }}</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" :disabled="!stickyCellHasOutputs || stickyCellRunning" @click="clearStickyCellOutputs"><template #icon><n-icon><LayersClearIcon /></n-icon></template></n-button></template>清空输出</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" :disabled="stickyCellIndex <= 0 || stickyCellRunning" @click="moveCell(stickyCell.id, -1)"><template #icon><n-icon><ArrowUpOutline /></n-icon></template></n-button></template>上移</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" :disabled="stickyCellIndex >= notebook.cells.length - 1 || stickyCellRunning" @click="moveCell(stickyCell.id, 1)"><template #icon><n-icon><ArrowDownOutline /></n-icon></template></n-button></template>下移</n-tooltip>
              <n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="tiny" :disabled="stickyCellRunning" @click="deleteCell(stickyCell.id)"><template #icon><n-icon><TrashOutline /></n-icon></template></n-button></template>删除</n-tooltip>
            </template>
          </div>
        </div>
      </div>
      <div v-if="loading" class="notebook-editor__empty"><n-spin size="small" /><span>正在加载超级笔记...</span></div>
      <div v-else-if="notebook.cells.length" class="notebook-editor__cells">
        <component :is="cell.cell_type === 'markdown' ? NotebookCellMarkdown : NotebookCellCode" v-for="(cell, index) in notebook.cells" :ref="setCellRef(cell.id)" :key="cell.id" :cell="cell" :index="index" :cell-count="notebook.cells.length" :selected="selectedCellId === cell.id" :previewing="isMarkdownPreviewing(cell.id)" :collapsed="isCellCollapsed(cell.id)" :running="runningCellId === cell.id" :theme="theme" :file-path="filePath" :content-active="shouldRenderCellContent(cell.id, index)" :runtime-input-request="getRuntimePromptRequestForCell(cell.id)" :python-modules="getCellRuntime(cell) === 'python' ? availablePythonModules : []" :python-path="getCellRuntime(cell) === 'python' ? activePythonPath : ''" :notebook-magic-options="getCellRuntime(cell) === 'python' ? notebookMagicOptions : []" :completion-context="selectedCellId === cell.id && getCellRuntime(cell) === 'python' ? getPythonCompletionContext(index) : ''" :python-context-cells="selectedCellId === cell.id && getCellRuntime(cell) === 'python' ? getPythonContextCells(index) : []" @focus="setSelectedCell(cell.id)" @toggle-preview="toggleMarkdownPreview(cell.id)" @toggle-collapse="toggleCellCollapsed(cell.id)" @update-source="updateCellSource(cell.id, $event)" @update-runtime="updateCellRuntime(cell.id, $event)" @delete="deleteCell(cell.id)" @move-up="moveCell(cell.id, -1)" @move-down="moveCell(cell.id, 1)" @add-after="insertCellAfter(cell.id, $event)" @run="runCellById(cell.id)" @stop="stopCellRun(cell.id)" @clear-outputs="clearCodeCellOutputs(cell.id)" @submit-runtime-input="submitRuntimePromptInput($event)" @abort-runtime-input="abortRuntimePromptInput()" @runtime-error="handlePythonCompletionFailure($event)" @go-to-definition="handlePythonDefinitionNavigation" />
      </div>
      <div v-else class="notebook-editor__empty notebook-editor__empty--blank">
        <n-empty description="当前超级笔记还是空的"><template #extra><div class="notebook-editor__empty-actions"><n-tooltip trigger="hover"><template #trigger><n-button quaternary circle size="large" @click="insertCellRelativeToSelection('markdown')"><template #icon><n-icon><DocumentTextOutline /></n-icon></template></n-button></template>添加 Markdown（Ctrl+Alt+M）</n-tooltip><n-tooltip trigger="hover"><template #trigger><n-button type="primary" ghost circle size="large" @click="insertCellRelativeToSelection('code')"><template #icon><n-icon><CodeSlashOutline /></n-icon></template></n-button></template>添加代码 Cell（Ctrl+Alt+C）</n-tooltip></div></template></n-empty>
      </div>
    </div>
    <n-modal v-model:show="runtimeInstallModal.show" preset="card" title="Notebook 运行环境" :mask-closable="!runtimeInstallModal.loading" style="width: 720px; max-width: 95%;">
      <div class="notebook-editor__modal-stack">
        <n-alert type="warning" :show-icon="false"><div class="notebook-editor__runtime-message">{{ runtimeInstallModal.message }}</div></n-alert>
        <n-form label-placement="left" label-width="120px">
          <n-form-item label="Python 解释器"><n-input v-model:value="runtimeInstallModal.pythonPath" :disabled="runtimeInstallModal.loading" placeholder="留空时优先使用自动检测到的 Python" /></n-form-item>
          <n-form-item label="自动检测结果"><div class="notebook-editor__detected-python"><n-text depth="3" style="word-break: break-all;">{{ runtimeDetectedPythonText }}</n-text><n-button secondary style="width: fit-content;" :loading="runtimeInstallModal.detecting" :disabled="runtimeInstallModal.loading" @click="useDetectedRuntimePython">使用检测结果</n-button></div></n-form-item>
          <n-form-item label="安装命令"><n-text code style="word-break: break-all;">{{ runtimeInstallCommand }}</n-text></n-form-item>
        </n-form>
      </div>
      <template #footer><div class="notebook-editor__modal-footer"><n-button secondary :loading="runtimeInstallModal.detecting" :disabled="runtimeInstallModal.loading" @click="refreshRuntimePythonDetection">重新检测 Python</n-button><div class="notebook-editor__modal-footer-actions"><n-button :disabled="runtimeInstallModal.loading" @click="closeRuntimeInstallModal">取消</n-button><n-button :loading="runtimeInstallModal.loading" :disabled="runtimeInstallModal.loading" @click="saveRuntimePythonConfigOnly">仅保存路径</n-button><n-button type="primary" :loading="runtimeInstallModal.loading" :disabled="runtimeInstallModal.loading" @click="saveRuntimePythonAndInstall">保存并安装依赖</n-button></div></div></template>
    </n-modal>
  </div>
</template>

<script setup>
import path from 'path-browserify'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NEmpty, NForm, NFormItem, NIcon, NInput, NModal, NSpin, NTag, NText, NTooltip, useMessage } from 'naive-ui'
import { AddOutline, ArrowDownOutline, ArrowUpOutline, ChevronDownOutline, ChevronUpOutline, CodeSlashOutline, CreateOutline, DocumentTextOutline, EyeOutline, PauseOutline, PlayOutline, RefreshOutline, SaveOutline, StopCircleOutline, TrashOutline } from '@vicons/ionicons5'
import { getNoteConfig, updateNoteConfig } from '@/utils/configListener'
import { exists, readFile, writeFile } from '@/utils/fileOperations'
import { createEmptyNotebook, createNotebookCell, getNotebookCellRuntime, getNotebookCellRuntimeDescriptor, getNotebookRuntimeConfig, normalizeNotebook, NOTEBOOK_CELL_RUNTIME_OPTIONS, parseNotebookTextForEditor, serializeNormalizedNotebook, serializeNotebook, setNotebookCellRuntime } from '@/utils/notebookModel'
import { buildNotebookMagicCompletionOptions, buildNotebookRuntimeMagicExecutionPlan, buildNotebookSqlDependencyHintText, buildNotebookSqlDependencyInstallPackages, buildNotebookSqlDependencyPlan, buildNotebookSqlExecutionCode, buildNotebookSqlMagicCompletionOptions, parseNotebookDirectExecutionSpecs } from '@/utils/notebookMagicCommands'
import { buildRuntimeDisplayOutputs as buildRuntimeDisplayOutputsForCell, buildRuntimeMagicPreludeOutputs } from '@/utils/notebookRuntimeDisplay'
import { checkNotebookPythonLsp, createManagedNotebookVenv, createNotebookSession, detectNotebookPython, executeNotebookCell, executeNotebookJavaScriptCell, executeNotebookMagicSpecs, forceRestartNotebookSession, installNotebookDependencies, interruptNotebookMagicExecution, interruptNotebookSession, invalidateNotebookRuntimeCaches, listManagedNotebookVenvs, listNotebookPythonModules, provideNotebookCellInput, restartNotebookSession, shutdownNotebookSession } from '@/utils/notebookRuntime'
import { decryptNoteContent, encryptNoteContent, isEncryptedNoteContent, replaceEncryptedNoteContent } from '@/utils/noteEncryption'
import { getNotebookRuntimeBoundEnvName, normalizeNotebookRuntimeConfig, rewriteNotebookRuntimeBoundEnvName, setNotebookRuntimeBoundEnvName } from '@/utils/notebookRuntimeConfig'
import { cleanupUnusedNotebookAttachments } from '@/utils/noteAttachmentCleanup'
import NotebookCellCode from './notebook/NotebookCellCode.vue'
import NotebookCellMarkdown from './notebook/NotebookCellMarkdown.vue'
import { CollapseCellIcon, ExpandCellIcon, LayersClearIcon } from './notebook/notebookCellIcons'

const props = defineProps({ filePath: { type: String, default: null }, renameContext: { type: Object, default: null }, noteAccess: { type: Object, default: null }, theme: { type: String, default: 'light' } })
const emit = defineEmits(['new-note', 'open-note'])
const message = useMessage()
const noteConfig = getNoteConfig()
const notebook = ref(createEmptyNotebook())
const loading = ref(false)
const loadError = ref('')
const runtimeIssue = ref('')
const manualSaving = ref(false)
const runningCellId = ref('')
const runAllLoading = ref(false)
const kernelActionLoading = ref(false)
const sessionId = ref('')
const sessionKernelName = ref('')
const lastRunStoppedByUser = ref(false)
const saveState = ref('saved')
const selectedCellId = ref('')
const pendingRuntimeRetry = ref(null)
const runtimeDetectedPython = ref('')
const availablePythonModules = ref([])
const managedVenvRoot = ref('')
const managedVenvs = ref([])
const visibleCellIds = ref(new Set())
const hydratedCellIds = ref(new Set())
const pythonLspCheck = ref({ ok: false, error: '', pythonPath: '' })
const pythonEnvironmentHealth = ref({ pythonPath: '', missingPackages: [], missingLspDependency: false, lspError: '', needsInstall: false })
const pythonEnvironmentInspectionPending = ref(false)
const lastInspectedPythonEnvironmentKey = ref('')
const lastPythonCompletionIssue = ref('')
const managedEnvHealthIssue = ref('')
const runtimeUserAbortState = ref({ cellId: '', reason: '' })
const activeDirectExecutionId = ref('')
const editorRootRef = ref(null)
const markdownPreviewingCellIds = ref(new Set())
const collapsedCellIds = ref(new Set())
const runtimeInstallModal = reactive({ show: false, loading: false, detecting: false, pythonPath: '', message: '', baseMessage: '', progressMessage: '', installLogs: '', installPackages: [] })
const runtimePromptModal = reactive({ prompt: '', password: false, submitting: false, requestId: '', cellId: '', outputCount: 0 })
const cellComponentRefs = new Map()
const cellRefHandlers = new Map()
const pythonContextTextCache = []
const pythonContextCellsCache = []
const pendingRuntimePatchByCellId = new Map()
const runtimeBackendOutputsByCellId = new Map()
const runtimeInputEchoesByCellId = new Map()
const runtimePreludeLinesByCellId = new Map()
let suppressNotebookWatcher = false, saveTimeout = null, cleanupTimeout = null, saveQueue = Promise.resolve(), lastSavedFilePath = '', lastSavedSerialized = '', latestLoadToken = 0, sessionEnsuringPromise = null, sessionPrewarmTimer = null, runtimePatchTimer = null, cellVisibilityObserver = null, pendingCellObserverRefresh = false, lastHandledRenameToken = '', pythonRuntimeInspectionToken = 0, stickyHeaderSyncFrame = 0, stickyHeaderScrollRoot = null, managedVenvRefreshTimer = null, pythonEnvironmentWarmupTimer = null, pythonEnvironmentWarmupIdleHandle = null
const REQUIRED_NOTEBOOK_MODULES = ['jupyter_client', 'ipykernel']
const NOTEBOOK_BASE_INSTALL_PACKAGES = ['jupyter_client', 'ipykernel', 'jedi-language-server']
const noteTitle = computed(() => !props.filePath ? '未命名超级笔记' : path.basename(props.filePath, path.extname(props.filePath)) || '未命名超级笔记')
const runtimeConfig = computed(() => getNotebookRuntimeConfig(noteConfig.value))
const notebookRuntimeEnvName = computed(() => getNotebookRuntimeBoundEnvName(runtimeConfig.value, props.filePath))
const activeManagedVenv = computed(() => managedVenvs.value.find((item) => item?.name === notebookRuntimeEnvName.value && item?.exists) || null)
const missingManagedVenv = computed(() => notebookRuntimeEnvName.value && !activeManagedVenv.value ? notebookRuntimeEnvName.value : '')
const activePythonPath = computed(() => activeManagedVenv.value?.pythonPath || resolveRuntimePythonPath())
const kernelLabel = computed(() => sessionKernelName.value ? `Kernel: ${sessionKernelName.value}` : (String(runtimeConfig.value.kernelName || '').trim() ? `Kernel: ${String(runtimeConfig.value.kernelName || '').trim()}` : 'Kernel: python3'))
const runtimeEnvTagLabel = computed(() => {
  if (activeManagedVenv.value?.name) return `环境: ${activeManagedVenv.value.name}`
  if (missingManagedVenv.value) return `环境缺失: ${missingManagedVenv.value}`
  return '环境: 默认'
})
const runtimeEnvTagType = computed(() => missingManagedVenv.value ? 'warning' : activeManagedVenv.value?.name ? 'success' : 'default')
const notebookMagicOptions = computed(() => [
  ...buildNotebookMagicCompletionOptions(managedVenvs.value.map((item) => item?.name).filter(Boolean)),
  ...buildNotebookSqlMagicCompletionOptions()
])
const saveStatusLabel = computed(() => saveState.value === 'saving' ? '保存中' : saveState.value === 'error' ? '保存失败' : saveState.value === 'dirty' ? '未保存' : '已保存')
const runtimeDetectedPythonText = computed(() => String(runtimeDetectedPython.value || '').trim() || '未检测到可用 Python，请手动填写解释器路径。')
const runtimeInstallCommand = computed(() => `"${resolveRuntimePythonPath(runtimeInstallModal.pythonPath)}" -m pip install ${(normalizeInstallPackageList(runtimeInstallModal.installPackages).length ? normalizeInstallPackageList(runtimeInstallModal.installPackages) : NOTEBOOK_BASE_INSTALL_PACKAGES).join(' ')}`)
const stickyCell = computed(() => notebook.value.cells.find((cell) => cell.id === stickyCellId.value) || null)
const stickyCellIndex = computed(() => stickyCell.value ? Math.max(0, notebook.value.cells.findIndex((cell) => cell.id === stickyCell.value.id)) : -1)
const stickyCellRunning = computed(() => !!stickyCell.value?.id && runningCellId.value === stickyCell.value.id)
const stickyCellPreviewing = computed(() => !!stickyCell.value?.id && isMarkdownPreviewing(stickyCell.value.id))
const stickyCellCollapsed = computed(() => !!stickyCell.value?.id && isCellCollapsed(stickyCell.value.id))
const stickyCellHasOutputs = computed(() => Array.isArray(stickyCell.value?.outputs) && stickyCell.value.outputs.length > 0)
const stickyCellExecutionCountLabel = computed(() => {
  const count = Number(stickyCell.value?.execution_count)
  return Number.isFinite(count) ? String(count) : ' '
})
const pythonLspStatus = computed(() => {
  const activePath = String(activePythonPath.value || '').trim()
  if (!activePath) {
    return { type: 'default', label: 'LSP 未配置' }
  }
  const inspectionKey = `${String(props.filePath || '').trim()}::${activePath}`
  if (pythonEnvironmentInspectionPending.value || lastInspectedPythonEnvironmentKey.value !== inspectionKey) {
    return { type: 'default', label: 'LSP 检测中' }
  }
  if (pythonLspCheck.value.ok) {
    return { type: 'success', label: 'LSP 已启用' }
  }
  if (pythonEnvironmentHealth.value.missingLspDependency) {
    return { type: 'warning', label: 'LSP 缺少依赖' }
  }
  return { type: 'warning', label: 'LSP 未启用' }
})
function stripRuntimeState(rawNotebook) { const draft = normalizeNotebook(rawNotebook); draft.cells = draft.cells.map((cell) => cell.cell_type !== 'code' ? cell : { ...cell, execution_count: null, outputs: [] }); return draft }
function serializeNotebookForStorage(rawNotebook) { return serializeNotebook(stripRuntimeState(rawNotebook)) }
function isProtectedNote() { return !!props.noteAccess?.protected }
function getNotePassword() { return String(props.noteAccess?.password || '') }
function isMarkdownPreviewing(cellId) { return markdownPreviewingCellIds.value.has(cellId) }
function setMarkdownPreview(cellId, previewing) { const next = new Set(markdownPreviewingCellIds.value); if (previewing) next.add(cellId); else next.delete(cellId); markdownPreviewingCellIds.value = next }
function toggleMarkdownPreview(cellId) { setSelectedCell(cellId); setMarkdownPreview(cellId, !isMarkdownPreviewing(cellId)) }
function isCellCollapsed(cellId) { return collapsedCellIds.value.has(cellId) }
function setCellCollapsed(cellId, collapsed) { const next = new Set(collapsedCellIds.value); if (collapsed) next.add(cellId); else next.delete(cellId); collapsedCellIds.value = next }
function toggleCellCollapsed(cellId) { setSelectedCell(cellId); setCellCollapsed(cellId, !isCellCollapsed(cellId)) }
function buildInitialMarkdownPreviewState(rawNotebook) { return new Set((rawNotebook?.cells || []).filter((cell) => cell?.cell_type === 'markdown' && String(cell.source || '').trim()).map((cell) => cell.id)) }
function resetTransientCellState(preferredCellId = '', options = {}) { markdownPreviewingCellIds.value = options.markdownPreviewIds instanceof Set ? new Set(options.markdownPreviewIds) : new Set(); collapsedCellIds.value = options.collapsedCellIds instanceof Set ? new Set(options.collapsedCellIds) : new Set(); hydratedCellIds.value = options.hydratedCellIds instanceof Set ? new Set(options.hydratedCellIds) : new Set(); selectedCellId.value = preferredCellId && notebook.value.cells.some((cell) => cell.id === preferredCellId) ? preferredCellId : notebook.value.cells[0]?.id || '' }
function setSelectedCell(cellId) { if (!cellId) return selectedCellId.value = ''; if (notebook.value.cells.some((cell) => cell.id === cellId)) selectedCellId.value = cellId }
function getCellIndex(cellId) { return notebook.value.cells.findIndex((cell) => cell.id === cellId) }
function getNextCellId(cellId) { const index = getCellIndex(cellId); return index < 0 ? '' : notebook.value.cells[index + 1]?.id || '' }
function getCellById(cellId) { return notebook.value.cells.find((cell) => cell.id === cellId) || null }
function getCellRuntime(cellOrId) {
  const cell = typeof cellOrId === 'string' ? getCellById(cellOrId) : cellOrId
  return getNotebookCellRuntime(cell)
}
function getCellRuntimeDescriptor(cellOrId) {
  return getNotebookCellRuntimeDescriptor(getCellRuntime(cellOrId))
}
function isCellPythonRuntime(cellOrId) {
  return getCellRuntime(cellOrId) === 'python'
}
function buildRuntimeDropdownOptions() {
  return NOTEBOOK_CELL_RUNTIME_OPTIONS.map((item) => ({
    label: item.label,
    key: item.value,
    props: {
      title: item.description
    }
  }))
}
function updateCellRuntime(cellId, runtime) {
  const targetId = String(cellId || '').trim()
  const nextRuntime = String(runtime || '').trim()
  if (!targetId || !nextRuntime) return
  const index = getCellIndex(targetId)
  if (index < 0) return
  const currentCell = notebook.value.cells[index]
  if (!currentCell || currentCell.cell_type !== 'code' || getCellRuntime(currentCell) === nextRuntime) return
  mutateNotebook((draft) => {
    const cell = draft.cells.find((item) => item.id === targetId)
    if (!cell || cell.cell_type !== 'code') return
    setNotebookCellRuntime(cell, nextRuntime)
    cell.execution_count = null
    cell.outputs = []
  }, {
    selectedCellId: targetId,
    invalidateContextFromIndex: index + 1
  })
}
function buildSqlDependencyHintText(sourceText = '', errorText = '') {
  return buildNotebookSqlDependencyHintText(sourceText, errorText, availablePythonModules.value)
}
function extractNotebookErrorText(outputs = []) {
  const lines = []
  ;(Array.isArray(outputs) ? outputs : []).forEach((output) => {
    if (!output || typeof output !== 'object') return
    if (output.output_type === 'error') {
      if (output.ename) lines.push(String(output.ename))
      if (output.evalue) lines.push(String(output.evalue))
      if (Array.isArray(output.traceback)) lines.push(...output.traceback.map((item) => String(item || '')))
    }
    if (output.output_type === 'stream') {
      const text = String(output.text || '').trim()
      if (text) lines.push(text)
    }
  })
  return lines.join('\n').trim()
}
function augmentSqlOutputsIfNeeded(cellSource, outputs = [], forceSqlMode = false) {
  const normalizedOutputs = Array.isArray(outputs) ? outputs.map((item) => ({ ...item })) : []
  const sourceText = String(cellSource || '')
  const errorText = extractNotebookErrorText(normalizedOutputs)
  if (!String(errorText || '').trim()) return normalizedOutputs
  const hintText = buildSqlDependencyHintText(sourceText, errorText)
  if (!hintText) return normalizedOutputs
  return [
    {
      output_type: 'stream',
      name: 'stdout',
      text: `${hintText}\n`
    },
    ...normalizedOutputs
  ]
}
function warnPlaintextSqlConnectionRisk(cellSource = '') {
  if (isProtectedNote()) return
  const matched = String(cellSource || '').match(/^\s*%{1,2}sql\s+([^\s]+)\s*$/im)
  const connectionUrl = String(matched?.[1] || '').trim()
  if (!connectionUrl.includes('://')) return
  if (!connectionUrl) return
  message.warning('当前笔记未加密，%sql 连接串会以明文保存到 .ipynb 中，请确认不包含敏感凭据。')
}
function resolveNotebookScrollViewport() { return editorRootRef.value?.querySelector?.('.notebook-editor__body') || null }
function resolveCellComponent(cellId) { return cellComponentRefs.get(String(cellId || '')) || null }
function resolveCellElement(cellId) {
  const component = resolveCellComponent(cellId)
  const componentRoot = component?.getRootElement?.()
  if (componentRoot instanceof HTMLElement) return componentRoot
  const viewport = resolveNotebookScrollViewport()
  if (!viewport || !cellId) return null
  const safeCellId = String(cellId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return viewport.querySelector?.(`[data-cell-id="${safeCellId}"]`) || null
}
function resolveCellHeaderElement(cellId) {
  const component = resolveCellComponent(cellId)
  const header = component?.getHeaderElement?.()
  if (header instanceof HTMLElement) return header
  return resolveCellElement(cellId)?.querySelector?.('.notebook-cell__header') || null
}
async function moveToNextCellOrScrollToBottom(cellId, options = {}) {
  const nextCellId = getNextCellId(cellId)
  if (nextCellId) {
    selectedCellId.value = nextCellId
    focusCellEditor(nextCellId, null, options)
    return
  }
  flushQueuedRuntimeCodeCellResults()
  await nextTick()
  const viewport = resolveNotebookScrollViewport()
  if (!(viewport instanceof HTMLElement)) return
  viewport.scrollTo({
    top: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
    behavior: options.scrollBehavior || 'smooth'
  })
}
const stickyCellId = ref('')
const stickyCellVisible = ref(false)

function clearPythonContextCaches(fromIndex = 0) {
  const safeIndex = Math.max(0, Math.floor(Number(fromIndex) || 0))
  pythonContextTextCache.length = Math.min(pythonContextTextCache.length, safeIndex)
  pythonContextCellsCache.length = Math.min(pythonContextCellsCache.length, safeIndex)
}
function ensurePythonContextCaches(index = 0) {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0))
  for (let cursor = pythonContextTextCache.length; cursor <= safeIndex; cursor += 1) {
    if (cursor === 0) {
      pythonContextTextCache[0] = ''
      pythonContextCellsCache[0] = []
      continue
    }
    const previousText = String(pythonContextTextCache[cursor - 1] || '')
    const previousCells = Array.isArray(pythonContextCellsCache[cursor - 1]) ? pythonContextCellsCache[cursor - 1] : []
    const previousCell = notebook.value.cells[cursor - 1]
    if (previousCell?.cell_type !== 'code' || getNotebookCellRuntime(previousCell) !== 'python') {
      pythonContextTextCache[cursor] = previousText
      pythonContextCellsCache[cursor] = previousCells
      continue
    }
    const source = String(previousCell.source || '')
    pythonContextTextCache[cursor] = previousText && source ? `${previousText}\n\n${source}` : source || previousText
    pythonContextCellsCache[cursor] = previousCells.concat({
      id: `cell-${previousCell.id}`,
      source
    })
  }
}
function disconnectCellVisibilityObserver() {
  try {
    cellVisibilityObserver?.disconnect?.()
  } catch {
    // ignore
  }
  cellVisibilityObserver = null
  if (stickyHeaderScrollRoot) {
    stickyHeaderScrollRoot.removeEventListener('scroll', handleNotebookViewportScroll)
    stickyHeaderScrollRoot = null
  }
  if (stickyHeaderSyncFrame) {
    cancelAnimationFrame(stickyHeaderSyncFrame)
    stickyHeaderSyncFrame = 0
  }
}
function clearManagedVenvRefreshTimer() {
  if (!managedVenvRefreshTimer) return
  clearTimeout(managedVenvRefreshTimer)
  managedVenvRefreshTimer = null
}
function clearPythonEnvironmentWarmupTimer() {
  if (pythonEnvironmentWarmupTimer) {
    clearTimeout(pythonEnvironmentWarmupTimer)
    pythonEnvironmentWarmupTimer = null
  }
  if (typeof window !== 'undefined' && pythonEnvironmentWarmupIdleHandle !== null) {
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(pythonEnvironmentWarmupIdleHandle)
    else clearTimeout(pythonEnvironmentWarmupIdleHandle)
  }
  pythonEnvironmentWarmupIdleHandle = null
  pythonEnvironmentInspectionPending.value = false
}
function scheduleManagedVenvRefresh(delayMs = 600) {
  clearManagedVenvRefreshTimer()
  managedVenvRefreshTimer = setTimeout(() => {
    managedVenvRefreshTimer = null
    void refreshManagedVenvs({ silent: true })
  }, Math.max(0, Number(delayMs) || 0))
}
function schedulePythonEnvironmentWarmup(delayMs = 900) {
  clearPythonEnvironmentWarmupTimer()
  if (loading.value || !props.filePath) return
  const pythonPath = String(activePythonPath.value || '').trim()
  if (!pythonPath) return
  const inspectionKey = `${String(props.filePath || '').trim()}::${pythonPath}`
  if (lastInspectedPythonEnvironmentKey.value === inspectionKey) return
  pythonEnvironmentInspectionPending.value = true
  pythonEnvironmentWarmupTimer = setTimeout(() => {
    pythonEnvironmentWarmupTimer = null
    if (loading.value || !props.filePath) {
      pythonEnvironmentInspectionPending.value = false
      return
    }
    const runInspection = () => {
      pythonEnvironmentWarmupIdleHandle = null
      if (loading.value || !props.filePath) {
        pythonEnvironmentInspectionPending.value = false
        return
      }
      const currentPythonPath = String(activePythonPath.value || '').trim()
      const currentInspectionKey = `${String(props.filePath || '').trim()}::${currentPythonPath}`
      void inspectPythonEnvironment(currentPythonPath).finally(() => {
        lastInspectedPythonEnvironmentKey.value = currentInspectionKey
        pythonEnvironmentInspectionPending.value = false
      })
    }
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      pythonEnvironmentWarmupIdleHandle = window.requestIdleCallback(runInspection, { timeout: 1200 })
      return
    }
    pythonEnvironmentWarmupIdleHandle = setTimeout(runInspection, 0)
  }, Math.max(0, Number(delayMs) || 0))
}
function handleNotebookViewportScroll() {
  scheduleStickyHeaderSync()
}
function syncStickyHeaderBinding(viewport = resolveNotebookScrollViewport()) {
  const nextRoot = viewport instanceof HTMLElement ? viewport : null
  if (stickyHeaderScrollRoot === nextRoot) return
  stickyHeaderScrollRoot?.removeEventListener('scroll', handleNotebookViewportScroll)
  stickyHeaderScrollRoot = nextRoot
  stickyHeaderScrollRoot?.addEventListener('scroll', handleNotebookViewportScroll, { passive: true })
}
function syncStickyCell() {
  const viewport = resolveNotebookScrollViewport()
  if (!(viewport instanceof HTMLElement)) {
    stickyCellId.value = ''
    stickyCellVisible.value = false
    return
  }
  const viewportRect = viewport.getBoundingClientRect()
  const threshold = viewportRect.top
  let candidateId = ''
  const candidateIds = new Set(visibleCellIds.value)
  if (selectedCellId.value) candidateIds.add(selectedCellId.value)
  if (stickyCellId.value) candidateIds.add(stickyCellId.value)
  const cellsToMeasure = candidateIds.size
    ? notebook.value.cells.filter((cell) => candidateIds.has(cell.id))
    : []
  for (const cell of cellsToMeasure) {
    const element = resolveCellElement(cell.id)
    const header = resolveCellHeaderElement(cell.id)
    if (!(element instanceof HTMLElement) || !(header instanceof HTMLElement)) continue
    const rect = element.getBoundingClientRect()
    const headerRect = header.getBoundingClientRect()
    const stickyBottom = threshold + Math.max(1, Math.ceil(headerRect.height || 0))
    if (headerRect.top <= threshold && rect.bottom > stickyBottom) candidateId = cell.id
  }
  stickyCellId.value = candidateId
  stickyCellVisible.value = !!candidateId
}
function scheduleStickyHeaderSync() {
  if (stickyHeaderSyncFrame) return
  stickyHeaderSyncFrame = requestAnimationFrame(() => {
    stickyHeaderSyncFrame = 0
    syncStickyCell()
  })
}
function areStringSetsEqual(left, right) {
  if (!(left instanceof Set) || !(right instanceof Set)) return false
  if (left.size !== right.size) return false
  for (const item of left) {
    if (!right.has(item)) return false
  }
  return true
}
function refreshCellVisibilityObserver() {
  pendingCellObserverRefresh = false
  disconnectCellVisibilityObserver()
  const viewport = resolveNotebookScrollViewport()
  if (!(viewport instanceof HTMLElement)) return
  syncStickyHeaderBinding(viewport)
  const observedIds = new Set()
  cellVisibilityObserver = new IntersectionObserver((entries) => {
    const updated = new Set(visibleCellIds.value)
    const hydrated = new Set(hydratedCellIds.value)
    let visibleChanged = false
    let hydratedChanged = false
    entries.forEach((entry) => {
      const cellId = String(entry?.target?.getAttribute?.('data-cell-id') || '').trim()
      if (!cellId) return
      if (entry.isIntersecting) {
        if (!updated.has(cellId)) {
          updated.add(cellId)
          visibleChanged = true
        }
        if (!hydrated.has(cellId)) {
          hydrated.add(cellId)
          hydratedChanged = true
        }
      }
      else if (updated.delete(cellId)) {
        visibleChanged = true
      }
    })
    if (visibleChanged) visibleCellIds.value = updated
    if (hydratedChanged) hydratedCellIds.value = hydrated
    if (visibleChanged || hydratedChanged) scheduleStickyHeaderSync()
  }, {
    root: viewport,
    rootMargin: '160px 0px 220px 0px',
    threshold: 0.01
  })
  viewport.querySelectorAll?.('[data-cell-id]')?.forEach?.((element) => {
    const cellId = String(element?.getAttribute?.('data-cell-id') || '').trim()
    if (cellId) observedIds.add(cellId)
    cellVisibilityObserver?.observe?.(element)
  })
  const nextVisibleIds = new Set([...visibleCellIds.value].filter((cellId) => observedIds.has(cellId)))
  const nextHydratedIds = new Set([...hydratedCellIds.value].filter((cellId) => observedIds.has(cellId)))
  if (!areStringSetsEqual(nextVisibleIds, visibleCellIds.value)) visibleCellIds.value = nextVisibleIds
  if (!areStringSetsEqual(nextHydratedIds, hydratedCellIds.value)) hydratedCellIds.value = nextHydratedIds
  scheduleStickyHeaderSync()
}
function scheduleRefreshCellVisibilityObserver() {
  if (pendingCellObserverRefresh) return
  pendingCellObserverRefresh = true
  nextTick(() => refreshCellVisibilityObserver())
}
function shouldRenderCellContent(cellId, index = -1) {
  const targetId = String(cellId || '').trim()
  if (!targetId) return false
  if (selectedCellId.value === targetId || runningCellId.value === targetId) return true
  if (hydratedCellIds.value.has(targetId)) return true
  if (visibleCellIds.value.has(targetId)) return true
  const selectedIndex = getCellIndex(selectedCellId.value)
  if (selectedIndex >= 0 && Math.abs(selectedIndex - Number(index)) <= 1) return true
  return false
}
function ensureCellInViewport(cellId, options = {}) {
  const viewport = resolveNotebookScrollViewport()
  const cellEl = resolveCellElement(cellId)
  if (!(viewport instanceof HTMLElement)) return
  if (!(cellEl instanceof HTMLElement)) return
  const viewportRect = viewport.getBoundingClientRect()
  const cellRect = cellEl.getBoundingClientRect()
  const marginTop = Math.max(12, Number(options.marginTop) || 0)
  const marginBottom = Math.max(12, Number(options.marginBottom) || 0)
  const outOfViewport = cellRect.top < viewportRect.top + marginTop || cellRect.bottom > viewportRect.bottom - marginBottom
  if (!outOfViewport) return
  const offsetTop = cellEl.offsetTop
  const targetTop = Math.max(0, offsetTop - marginTop)
  const targetBottom = Math.max(0, offsetTop + cellEl.offsetHeight - viewport.clientHeight + marginBottom)
  const nextTop = cellRect.top < viewportRect.top + marginTop ? targetTop : targetBottom
  viewport.scrollTo({
    top: nextTop,
    behavior: options.behavior || 'smooth'
  })
}
function focusCellEditor(cellId, cursorOffset = null, options = {}) {
  if (!cellId) return
  setCellCollapsed(cellId, false)
  nextTick(async () => {
    if (options.ensureVisible !== false) ensureCellInViewport(cellId, { behavior: options.scrollBehavior || 'smooth' })
    await nextTick()
    cellComponentRefs.get(cellId)?.focusEditor?.(cursorOffset)
  })
}
function focusCellRuntimeInput(cellId, options = {}) {
  if (!cellId) return
  setCellCollapsed(cellId, false)
  nextTick(async () => {
    if (options.ensureVisible !== false) ensureCellInViewport(cellId, { behavior: options.scrollBehavior || 'smooth' })
    await nextTick()
    cellComponentRefs.get(cellId)?.scrollToOutput?.()
    cellComponentRefs.get(cellId)?.focusRuntimeInput?.()
  })
}
function setCellRef(cellId) {
  const targetId = String(cellId || '')
  if (cellRefHandlers.has(targetId)) return cellRefHandlers.get(targetId)
  const handler = (instance) => {
    const currentInstance = cellComponentRefs.get(targetId)
    if (instance) {
      if (currentInstance === instance) return
      cellComponentRefs.set(targetId, instance)
      nextTick(() => {
        if (cellComponentRefs.get(targetId) !== instance) return
        scheduleStickyHeaderSync()
        scheduleRefreshCellVisibilityObserver()
      })
      return
    }
    if (!currentInstance) return
    cellComponentRefs.delete(targetId)
    scheduleRefreshCellVisibilityObserver()
  }
  cellRefHandlers.set(targetId, handler)
  return handler
}
function scrollStickyCellContent() {
  const cellId = stickyCell.value?.id
  if (!cellId) return
  setSelectedCell(cellId)
  setCellCollapsed(cellId, false)
  nextTick(() => cellComponentRefs.get(cellId)?.scrollToContent?.())
}
function scrollStickyCellOutput() {
  const cellId = stickyCell.value?.id
  if (!cellId) return
  setSelectedCell(cellId)
  setCellCollapsed(cellId, false)
  nextTick(() => cellComponentRefs.get(cellId)?.scrollToOutput?.())
}
function scrollStickyCellCode() {
  const cellId = stickyCell.value?.id
  if (!cellId) return
  setSelectedCell(cellId)
  setCellCollapsed(cellId, false)
  nextTick(() => cellComponentRefs.get(cellId)?.scrollToCode?.())
}
function toggleStickyCellCollapsed() {
  const cellId = stickyCell.value?.id
  if (!cellId) return
  toggleCellCollapsed(cellId)
}
function handleStickyRuntimeSelect(runtime) {
  const cellId = stickyCell.value?.id
  if (!cellId) return
  setSelectedCell(cellId)
  updateCellRuntime(cellId, runtime)
}
function toggleStickyMarkdownPreview() {
  const cellId = stickyCell.value?.id
  if (!cellId || stickyCell.value?.cell_type !== 'markdown') return
  setSelectedCell(cellId)
  toggleMarkdownPreview(cellId)
}
function clearStickyCellOutputs() {
  const cellId = stickyCell.value?.id
  if (!cellId || stickyCell.value?.cell_type !== 'code') return
  setSelectedCell(cellId)
  clearCodeCellOutputs(cellId)
}
function runStickyCell() {
  const cellId = stickyCell.value?.id
  if (!cellId) return
  setSelectedCell(cellId)
  void runCellById(cellId)
}
function handleStickyRunOrStop() {
  const cellId = stickyCell.value?.id
  if (!cellId) return
  setSelectedCell(cellId)
  if (stickyCellRunning.value) {
    void stopCellRun(cellId)
    return
  }
  void runCellById(cellId)
}
function setNotebookValue(nextNotebook, options = {}) {
  suppressNotebookWatcher = true
  notebook.value = options.alreadyNormalized ? nextNotebook : normalizeNotebook(nextNotebook)
  lastSavedSerialized = typeof options.serializedText === 'string' ? options.serializedText : serializeNotebookForStorage(notebook.value)
  clearPythonContextCaches(0)
  suppressNotebookWatcher = false
}
function cloneNotebookState() { return normalizeNotebook(notebook.value) }
async function loadNotebook(filePath) {
  const token = ++latestLoadToken
  loading.value = true
  loadError.value = ''
  runtimeIssue.value = ''
  try {
    const rawContent = String(await readFile(filePath, 'utf-8') || '')
    const fileContent = isProtectedNote() ? await decryptNoteContent(rawContent, getNotePassword()) : rawContent
    if (token !== latestLoadToken) return
    const parsedNotebook = parseNotebookTextForEditor(fileContent)
    const serializedNotebook = serializeNormalizedNotebook(parsedNotebook)
    setNotebookValue(parsedNotebook, {
      alreadyNormalized: true,
      serializedText: serializedNotebook
    })
    lastSavedFilePath = String(filePath || '')
    saveState.value = 'saved'
    resetTransientCellState('', { markdownPreviewIds: buildInitialMarkdownPreviewState(parsedNotebook) })
  } catch (err) {
    if (token !== latestLoadToken) return
    loadError.value = `读取超级笔记失败：${err?.message || String(err)}`
    setNotebookValue(createEmptyNotebook())
    lastSavedFilePath = String(filePath || '')
    saveState.value = 'saved'
    resetTransientCellState()
  } finally {
    if (token === latestLoadToken) loading.value = false
  }
}
async function persistNotebookText(filePath, serializedText) { const snapshotPath = String(filePath || ''), snapshotText = String(serializedText || ''); if (!snapshotPath) return; if (!isProtectedNote()) return writeFile(snapshotPath, snapshotText); const password = getNotePassword(); if (!password) throw new Error('当前受保护笔记缺少解锁密码，无法保存。'); if (!(await exists(snapshotPath))) return writeFile(snapshotPath, await encryptNoteContent(snapshotText, { notePassword: password })); const rawContent = String(await readFile(snapshotPath, 'utf-8') || ''); const encryptedContent = isEncryptedNoteContent(rawContent) ? await replaceEncryptedNoteContent(rawContent, { notePassword: password, plaintext: snapshotText }) : await encryptNoteContent(snapshotText, { notePassword: password }); return writeFile(snapshotPath, encryptedContent) }
function queuePersistNotebook(filePath, notebookSnapshot, options = {}) { const snapshotPath = String(filePath || ''), snapshotSerialized = serializeNotebookForStorage(notebookSnapshot); if (!snapshotPath) return Promise.resolve(); if (!options.force && lastSavedFilePath === snapshotPath && lastSavedSerialized === snapshotSerialized) { saveState.value = 'saved'; return Promise.resolve() } saveState.value = 'saving'; saveQueue = saveQueue.catch(() => {}).then(async () => { if (!(await exists(snapshotPath)) && !options.force) return; await persistNotebookText(snapshotPath, snapshotSerialized); lastSavedFilePath = snapshotPath; lastSavedSerialized = snapshotSerialized; saveState.value = 'saved'; if (!options.skipCleanup) scheduleCleanupNotebookAttachments(snapshotPath, notebookSnapshot) }).catch((err) => { saveState.value = 'error'; throw err }); return saveQueue }
async function flushPendingSave() { if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null } await saveQueue.catch(() => {}); const snapshotPath = String(props.filePath || ''); if (!snapshotPath) return; const snapshotSerialized = serializeNotebookForStorage(notebook.value); if (lastSavedFilePath === snapshotPath && lastSavedSerialized === snapshotSerialized) return; await queuePersistNotebook(snapshotPath, notebook.value, { force: true, skipCleanup: true }) }
defineExpose({
  flushPendingSave
})
function scheduleNotebookSave(filePath, notebookSnapshot, delayMs = 500) {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    saveTimeout = null
    try {
      await queuePersistNotebook(filePath, notebookSnapshot)
    } catch (err) {
      message.error(`自动保存失败：${err?.message || String(err)}`)
    }
  }, Math.max(0, Number(delayMs) || 0))
}
function scheduleCleanupNotebookAttachments(filePath, notebookSnapshot) { if (cleanupTimeout) clearTimeout(cleanupTimeout); const snapshotPath = String(filePath || ''); const snapshotNotebook = normalizeNotebook(notebookSnapshot); cleanupTimeout = setTimeout(() => { cleanupTimeout = null; cleanupUnusedNotebookAttachments(snapshotPath, snapshotNotebook).catch((err) => { console.warn('cleanupUnusedNotebookAttachments failed:', err) }) }, 5000) }
function markNotebookDirty(notebookSnapshot = notebook.value, options = {}) {
  if (suppressNotebookWatcher || !props.filePath) return
  if (!options.assumeDirty) {
    const currentSerialized = serializeNotebookForStorage(notebookSnapshot)
    if (lastSavedFilePath === props.filePath && lastSavedSerialized === currentSerialized) {
      saveState.value = 'saved'
      return
    }
  }
  saveState.value = 'dirty'
  if (!options.skipCleanup) scheduleCleanupNotebookAttachments(props.filePath, notebookSnapshot)
  scheduleNotebookSave(props.filePath, notebookSnapshot, 500)
}
function mutateNotebook(mutator, options = {}) { const next = cloneNotebookState(); mutator(next); notebook.value = normalizeNotebook(next); clearPythonContextCaches(options.invalidateContextFromIndex ?? 0); scheduleRefreshCellVisibilityObserver(); markNotebookDirty(notebook.value); if (options.selectedCellId !== undefined) setSelectedCell(options.selectedCellId) }
function updateCellSource(cellId, nextSource) {
  const cell = notebook.value.cells.find((item) => item.id === cellId)
  if (!cell) return
  const normalizedSource = String(nextSource ?? '')
  if (cell.source === normalizedSource) {
    if (selectedCellId.value !== cellId) setSelectedCell(cellId)
    return
  }
  const editedCellIndex = getCellIndex(cellId)
  cell.source = normalizedSource
  clearPythonContextCaches(editedCellIndex + 1)
  markNotebookDirty(notebook.value, { assumeDirty: true, skipCleanup: true })
  if (selectedCellId.value !== cellId) setSelectedCell(cellId)
}
function insertCellAfter(cellId, cellType) { let insertedCellId = ''; const invalidateFrom = Math.max(0, getCellIndex(cellId) + 1); const runtime = cellType === 'code' ? getCellRuntime(cellId) : ''; mutateNotebook((draft) => { const nextCell = createNotebookCell(cellType, runtime); insertedCellId = nextCell.id; const index = draft.cells.findIndex((item) => item.id === cellId); if (index < 0) draft.cells.push(nextCell); else draft.cells.splice(index + 1, 0, nextCell) }, { selectedCellId: insertedCellId, invalidateContextFromIndex: invalidateFrom }); setMarkdownPreview(insertedCellId, false); focusCellEditor(insertedCellId) }
function appendCell(cellType) { let insertedCellId = ''; const runtime = cellType === 'code' ? getCellRuntime(selectedCellId.value) : ''; mutateNotebook((draft) => { const nextCell = createNotebookCell(cellType, runtime); insertedCellId = nextCell.id; draft.cells.push(nextCell) }, { selectedCellId: insertedCellId, invalidateContextFromIndex: notebook.value.cells.length }); setMarkdownPreview(insertedCellId, false); focusCellEditor(insertedCellId) }
function insertCellRelativeToSelection(cellType) { const selectedId = selectedCellId.value; if (selectedId) return insertCellAfter(selectedId, cellType); return appendCell(cellType) }
function insertCellRelativeToContext(cellType, anchorCellId = '') { return anchorCellId ? insertCellAfter(anchorCellId, cellType) : appendCell(cellType) }
function deleteCell(cellId) { const i = getCellIndex(cellId), fallback = notebook.value.cells[i + 1]?.id || notebook.value.cells[i - 1]?.id || ''; mutateNotebook((draft) => { draft.cells = draft.cells.filter((item) => item.id !== cellId) }, { selectedCellId: fallback, invalidateContextFromIndex: Math.max(0, i) }); setMarkdownPreview(cellId, false); setCellCollapsed(cellId, false) }
function moveCell(cellId, offset) { const index = getCellIndex(cellId); const invalidateFrom = Math.max(0, Math.min(index, index + offset)); mutateNotebook((draft) => { const currentIndex = draft.cells.findIndex((item) => item.id === cellId), targetIndex = currentIndex + offset; if (currentIndex < 0 || targetIndex < 0 || targetIndex >= draft.cells.length) return; const [cell] = draft.cells.splice(currentIndex, 1); draft.cells.splice(targetIndex, 0, cell) }, { selectedCellId: cellId, invalidateContextFromIndex: invalidateFrom }) }
function clearCodeCellOutputs(cellId) { mutateNotebook((draft) => { const cell = draft.cells.find((item) => item.id === cellId); if (cell?.cell_type === 'code') { cell.outputs = []; cell.execution_count = null } }, { selectedCellId: cellId, invalidateContextFromIndex: notebook.value.cells.length }) }
function cloneNotebookOutputValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneNotebookOutputValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneNotebookOutputValue(item)]))
  }
  return value
}
function cloneNotebookOutputs(outputs = []) {
  if (!Array.isArray(outputs)) return []
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(outputs)
    } catch {
      // fall through to manual cloning
    }
  }
  return outputs.map((item) => cloneNotebookOutputValue(item))
}
function applyRuntimeCodeCellResult(cellId, payload = {}) {
  const cell = notebook.value.cells.find((item) => item.id === cellId)
  if (!cell || cell.cell_type !== 'code') return
  if (Object.prototype.hasOwnProperty.call(payload, 'outputs')) {
    // Runtime progress may keep mutating the same raw output objects; clone here
    // so Vue always receives a fresh reactive snapshot and updates immediately.
    cell.outputs = cloneNotebookOutputs(payload.outputs)
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'execution_count')) {
    cell.execution_count = Number.isFinite(Number(payload.execution_count)) ? Number(payload.execution_count) : null
  }
}
function flushQueuedRuntimeCodeCellResults() {
  if (runtimePatchTimer) {
    clearTimeout(runtimePatchTimer)
    runtimePatchTimer = null
  }
  pendingRuntimePatchByCellId.forEach((payload, cellId) => {
    applyRuntimeCodeCellResult(cellId, payload)
  })
  pendingRuntimePatchByCellId.clear()
}
function patchRuntimeCodeCellResult(cellId, payload = {}, options = {}) {
  const existing = pendingRuntimePatchByCellId.get(cellId) || {}
  pendingRuntimePatchByCellId.set(cellId, {
    ...existing,
    ...payload
  })
  if (options.immediate) {
    flushQueuedRuntimeCodeCellResults()
    return
  }
  if (runtimePatchTimer) return
  runtimePatchTimer = setTimeout(() => flushQueuedRuntimeCodeCellResults(), 60)
}
async function refreshManagedVenvs(options = {}) {
  try {
    const result = await listManagedNotebookVenvs()
    managedVenvRoot.value = String(result?.rootPath || '').trim()
    managedVenvs.value = Array.isArray(result?.envs) ? result.envs : []
    return managedVenvs.value
  } catch (err) {
    managedVenvRoot.value = ''
    managedVenvs.value = []
    if (!options?.silent) message.error(err?.message || String(err))
    return []
  }
}
async function persistNotebookManagedEnvName(envName = '', filePath = props.filePath) {
  const nextRuntime = setNotebookRuntimeBoundEnvName(runtimeConfig.value, filePath, envName)
  await updateNoteConfig({
    notebookRuntime: nextRuntime
  })
  return nextRuntime
}
async function rewriteNotebookManagedEnvBindingForRename(renameInfo = props.renameContext) {
  const from = String(renameInfo?.from || '').trim()
  const to = String(renameInfo?.to || '').trim()
  const token = String(renameInfo?.token || '').trim()
  if (!from || !to || !token || token === lastHandledRenameToken || to !== String(props.filePath || '').trim()) return
  const nextRuntime = rewriteNotebookRuntimeBoundEnvName(runtimeConfig.value, from, to)
  if (JSON.stringify(nextRuntime.noteEnvBindings || {}) === JSON.stringify(runtimeConfig.value.noteEnvBindings || {})) {
    lastHandledRenameToken = token
    return
  }
  await updateNoteConfig({
    notebookRuntime: nextRuntime
  })
  lastHandledRenameToken = token
}
function buildRuntimeInfoText() {
  const currentEnvName = String(notebookRuntimeEnvName.value || '').trim()
  const activePath = String(activePythonPath.value || '').trim() || 'python'
  const lines = [
    `本机虚拟环境目录: ${managedVenvRoot.value || '(未检测到)'}`,
    currentEnvName
      ? (activeManagedVenv.value
          ? `当前笔记环境: ${currentEnvName}`
          : `当前笔记环境: ${currentEnvName}（未找到，已回退默认环境）`)
      : '当前笔记环境: 默认',
    `当前解释器: ${activePath}`,
    `默认解释器: ${resolveRuntimePythonPath()}`
  ]
  if (managedVenvs.value.length) {
    lines.push(`可用环境: ${managedVenvs.value.map((item) => item.name).join('、')}`)
  } else {
    lines.push('可用环境: 暂无')
  }
  return lines.join('\n')
}
function buildRuntimeHelpText() {
  return [
    '超级笔记环境命令',
    '',
    `1. %runtime list`,
    '列出当前 Notebook Runtime 虚拟环境目录里的所有环境。',
    '',
    '2. %runtime create-venv myenv',
    '在 Notebook Runtime 配置里的“虚拟环境存储目录/myenv”创建虚拟环境，并自动安装 Notebook 依赖。',
    '',
    '3. %runtime use myenv',
    '让当前笔记切换到 myenv。只影响当前这篇超级笔记。',
    '',
    '4. %runtime reset',
    '清除当前笔记的环境覆盖，恢复为默认解释器。',
    '',
    '5. %runtime info',
    '查看当前笔记正在使用的环境和解释器路径。',
    '',
    '补充说明',
    '- 默认情况下，超级笔记使用设置页中的默认 Python 解释器。',
    '- `%pip install ...` 会安装到当前激活环境。',
    '- `!python -m venv myenv` 也会按托管环境方式创建到本机虚拟环境目录。',
    managedVenvRoot.value ? `- 当前托管环境目录：${managedVenvRoot.value}` : ''
  ].filter(Boolean).join('\n')
}
function getPythonCompletionContext(index) {
  if (!Number.isFinite(index) || index < 0) return ''
  ensurePythonContextCaches(index)
  return String(pythonContextTextCache[index] || '')
}
function getPythonContextCells(index) {
  if (!Number.isFinite(index) || index < 0) return []
  ensurePythonContextCaches(index)
  return Array.isArray(pythonContextCellsCache[index]) ? pythonContextCellsCache[index] : []
}
function handlePythonDefinitionNavigation(payload) { const cellId = String(payload?.cellId || '').trim(); if (!cellId) return; const targetId = cellId.replace(/^cell-/, ''); const targetCell = notebook.value.cells.find((cell) => cell.id === targetId); if (!targetCell) return; setSelectedCell(targetId); if (targetCell.cell_type === 'markdown') setMarkdownPreview(targetId, true); focusCellEditor(targetId, payload?.cursorOffset) }
function resolveRuntimePythonPath(preferred = '') {
  const explicitPreferred = String(preferred || '').trim()
  if (explicitPreferred) return explicitPreferred
  const configuredPath = String(runtimeConfig.value.pythonPath || '').trim()
  return configuredPath || 'python'
}
function extractRuntimePythonPath(messageText = '') { return String(String(messageText || '').match(/Python(?:\s*路径)?\s*:\s*([^\r\n]+)/i)?.[1] || '').trim() }
function composeRuntimeInstallMessage() { const sections = []; const baseMessage = String(runtimeInstallModal.baseMessage || '').trim(); const progressMessage = String(runtimeInstallModal.progressMessage || '').trim(); const installLogs = String(runtimeInstallModal.installLogs || '').trim(); if (baseMessage) sections.push(baseMessage); if (progressMessage) sections.push(`安装进度：${progressMessage}`); if (installLogs) sections.push(`安装日志：\n${installLogs}`); runtimeInstallModal.message = sections.join('\n\n').trim() }
function appendRuntimeInstallLog(text = '') { const normalized = String(text || '').replace(/\r\n/g, '\n').trim(); if (!normalized) return; const nextLogs = [...String(runtimeInstallModal.installLogs || '').split('\n').filter(Boolean), ...normalized.split('\n').map((line) => line.trim()).filter(Boolean)].slice(-80); runtimeInstallModal.installLogs = nextLogs.join('\n'); composeRuntimeInstallMessage() }
function isRuntimeDependencyIssue(messageText = '') { const text = String(messageText || '').toLowerCase(); return ['jupyter_client', 'ipykernel', 'jedi-language-server', 'jedi_language_server', 'no module named', 'missing_jupyter_client', 'failed to import jupyter_client'].some((keyword) => text.includes(keyword)) }
function isRuntimePythonPathIssue(messageText = '') { const text = String(messageText || '').toLowerCase(); return ['enoent', '找不到 python', 'python was not found', 'notebook 运行时使用的 python', '[winerror 2]'].some((keyword) => text.includes(keyword)) }
function shouldPromptRuntimeInstall(messageText = '') { return isRuntimeDependencyIssue(messageText) || isRuntimePythonPathIssue(messageText) }
function isPythonLspDependencyIssue(messageText = '') { const text = String(messageText || '').toLowerCase(); return ["no module named 'jedi_language_server'", 'no module named jedi_language_server', '当前 python 环境缺少 jedi-language-server'].some((keyword) => text.includes(keyword)) }
function isPythonLspPathIssue(messageText = '') { const text = String(messageText || '').toLowerCase(); return ['找不到 jedi language server 启动命令', 'enoent', '[winerror 2]', 'python was not found'].some((keyword) => text.includes(keyword)) }
function isPythonLspStartupModeIssue(messageText = '') { const text = String(messageText || '').toLowerCase(); return ['cannot be directly executed', 'no module named jedi_language_server.__main__', '当前 jedi-language-server 启动方式不正确'].some((keyword) => text.includes(keyword)) }
function isUserAbortError(err) {
  const text = String(err?.message || err || '').toLowerCase()
  return ['用户停止', '已停止', 'stopped by user', 'user_abort', 'notebook 命令已被用户停止'].some((keyword) => text.includes(keyword))
}
function listMissingNotebookDependencyLabels(health = pythonEnvironmentHealth.value) {
  const labels = []
  ;(Array.isArray(health?.missingPackages) ? health.missingPackages : []).forEach((name) => labels.push(name))
  if (health?.missingLspDependency) labels.push('jedi-language-server')
  return Array.from(new Set(labels))
}
function analyzePythonEnvironmentHealth(pythonPath = '', modules = [], lspResult = {}) {
  const moduleSet = new Set((Array.isArray(modules) ? modules : []).map((item) => String(item || '').trim()).filter(Boolean))
  const missingPackages = REQUIRED_NOTEBOOK_MODULES.filter((name) => !moduleSet.has(name))
  const lspError = String(lspResult?.error || '').trim()
  const missingLspDependency = !moduleSet.has('jedi_language_server') || isPythonLspDependencyIssue(lspError)
  return {
    pythonPath: String(pythonPath || '').trim(),
    missingPackages,
    missingLspDependency,
    lspError,
    needsInstall: missingPackages.length > 0 || missingLspDependency
  }
}
function updateManagedEnvHealthIssue(health = pythonEnvironmentHealth.value) {
  const envName = String(activeManagedVenv.value?.name || '').trim()
  if (!envName || !health?.needsInstall) {
    managedEnvHealthIssue.value = ''
    return
  }
  const missing = listMissingNotebookDependencyLabels(health)
  managedEnvHealthIssue.value = missing.length
    ? `当前托管环境 ${envName} 缺少 Notebook 依赖：${missing.join('、')}。重新执行 \`%runtime use ${envName}\` 可自动补齐。`
    : `当前托管环境 ${envName} 尚未准备完成，Notebook 内核或补全暂不可用。重新执行 \`%runtime use ${envName}\` 可自动补齐。`
}
function getPythonCompletionFailureSummary(messageText = '') {
  const detail = String(messageText || '').trim()
  const pythonPath = String(activePythonPath.value || '').trim() || 'python'
  const healthError = String(pythonLspCheck.value.error || '').trim()
  if (isPythonLspPathIssue(detail) || isPythonLspPathIssue(healthError) || isRuntimePythonPathIssue(detail) || isRuntimePythonPathIssue(healthError)) {
    return `Python 补全暂不可用：当前激活环境的解释器不可用（${pythonPath}）。`
  }
  if (isPythonLspDependencyIssue(detail) || isPythonLspDependencyIssue(healthError)) {
    return `Python 补全暂不可用：当前激活环境缺少补全依赖（${pythonPath}）。`
  }
  if (isPythonLspStartupModeIssue(detail) || isPythonLspStartupModeIssue(healthError)) {
    return `Python 补全暂不可用：当前激活环境启动语言服务器失败（${pythonPath}）。`
  }
  return `Python 补全暂不可用：当前激活环境启动语言服务器失败（${pythonPath}）。`
}
function handlePythonCompletionFailure(err) {
  const detail = String(err?.message || err || '').trim()
  if (!detail || detail === lastPythonCompletionIssue.value) return false
  lastPythonCompletionIssue.value = detail
  message.warning(getPythonCompletionFailureSummary(detail))
  return false
}
function guardRuntimeInstallPending() { if (!runtimeInstallModal.loading) return false; message.warning('Notebook 依赖正在安装，请等待安装完成后再继续使用。'); return true }
async function refreshRuntimePythonDetection() { runtimeInstallModal.detecting = true; try { const result = await detectNotebookPython(); runtimeDetectedPython.value = String(result?.pythonPath || result?.path || result || '').trim() } catch (err) { runtimeDetectedPython.value = ''; message.error(err?.message || String(err)) } finally { runtimeInstallModal.detecting = false } }
async function inspectPythonEnvironment(preferredPythonPath = '', options = {}) {
  const inspectionToken = ++pythonRuntimeInspectionToken
  const pythonPath = resolveRuntimePythonPath(preferredPythonPath)
  const workspacePath = props.filePath ? path.dirname(props.filePath) : ''
  const inspectionKey = `${String(props.filePath || '').trim()}::${pythonPath}`
  try {
    if (options?.force) {
      await invalidateNotebookRuntimeCaches({
        pythonPath,
        workspacePath
      }).catch(() => {})
    }
    const [result, lspResult] = await Promise.all([
      listNotebookPythonModules({ pythonPath, workspacePath }),
      checkNotebookPythonLsp({ pythonPath, workspacePath })
    ])
    const modules = Array.isArray(result?.modules) ? result.modules : []
    const health = analyzePythonEnvironmentHealth(pythonPath, modules, lspResult)
    if (inspectionToken !== pythonRuntimeInspectionToken) return health
    availablePythonModules.value = modules
    pythonLspCheck.value = {
      ok: !!lspResult?.ok,
      error: String(lspResult?.error || '').trim(),
      pythonPath: String(lspResult?.pythonPath || pythonPath).trim()
    }
    pythonEnvironmentHealth.value = health
    updateManagedEnvHealthIssue(health)
    lastInspectedPythonEnvironmentKey.value = inspectionKey
    return health
  } catch (err) {
    const lspError = String(err?.message || '').trim()
    const health = analyzePythonEnvironmentHealth(pythonPath, [], { ok: false, error: lspError })
    if (inspectionToken !== pythonRuntimeInspectionToken) return health
    availablePythonModules.value = []
    pythonLspCheck.value = { ok: false, error: lspError, pythonPath }
    pythonEnvironmentHealth.value = health
    updateManagedEnvHealthIssue(health)
    lastInspectedPythonEnvironmentKey.value = inspectionKey
    return health
  }
}
async function loadPythonModulesForCompletion(preferredPythonPath = '', options = {}) { return await inspectPythonEnvironment(preferredPythonPath, options) }
function normalizeInstallPackageList(packages = []) {
  return Array.from(new Set((Array.isArray(packages) ? packages : []).map((item) => String(item || '').trim()).filter(Boolean)))
}
function buildRuntimeInstallPackageList(packages = []) {
  const normalized = normalizeInstallPackageList(packages)
  return normalized.length ? normalized : NOTEBOOK_BASE_INSTALL_PACKAGES
}
function buildSqlInstallPromptMessage(packages = [], connectionKind = '') {
  const normalizedPackages = buildRuntimeInstallPackageList(packages)
  const sections = ['检测到 SQL 运行依赖缺失，已准备自动安装。']
  if (connectionKind) sections.push(`连接类型：${connectionKind}`)
  if (normalizedPackages.length) sections.push(`将安装：${normalizedPackages.join('、')}`)
  sections.push('安装完成后会自动重试当前 Cell。')
  return sections.join('\n')
}
async function ensureSqlDependenciesBeforeRun(sourceText = '', retryRequest = null, options = {}) {
  const pythonPath = resolveRuntimePythonPath(options?.pythonPath || activePythonPath.value)
  const inspectionKey = `${String(props.filePath || '').trim()}::${pythonPath}`
  if (lastInspectedPythonEnvironmentKey.value !== inspectionKey) {
    await inspectPythonEnvironment(pythonPath).catch(() => {})
  }
  const sqlPlan = buildNotebookSqlDependencyPlan(sourceText, availablePythonModules.value, { treatAsSqlCell: !!options?.treatAsSqlCell })
  if (!sqlPlan.active) return { ok: true, installPackages: [] }
  const runtimeMissingPackages = Array.isArray(pythonEnvironmentHealth.value?.missingPackages) ? pythonEnvironmentHealth.value.missingPackages : []
  const installPackages = normalizeInstallPackageList([...runtimeMissingPackages, ...sqlPlan.installPackages])
  if (!installPackages.length) return { ok: true, installPackages: [] }
  openRuntimeInstallModal(buildSqlInstallPromptMessage(installPackages, sqlPlan.connectionKind), retryRequest, installPackages)
  return { ok: false, installPackages }
}
function openRuntimeInstallModal(messageText, retryRequest = null, installPackages = []) { pendingRuntimeRetry.value = retryRequest; runtimeInstallModal.baseMessage = String(messageText || '当前 Notebook 运行环境暂不可用。').trim(); runtimeInstallModal.progressMessage = ''; runtimeInstallModal.installLogs = ''; runtimeInstallModal.installPackages = buildRuntimeInstallPackageList(installPackages); runtimeInstallModal.pythonPath = extractRuntimePythonPath(messageText) || String(activePythonPath.value || runtimeConfig.value.pythonPath || '').trim(); runtimeInstallModal.show = true; runtimeInstallModal.loading = false; composeRuntimeInstallMessage(); void refreshRuntimePythonDetection() }
function closeRuntimeInstallModal() { if (!runtimeInstallModal.loading) runtimeInstallModal.show = false }
function closeRuntimePromptModal() {
  runtimePromptModal.prompt = ''
  runtimePromptModal.password = false
  runtimePromptModal.submitting = false
  runtimePromptModal.requestId = ''
  runtimePromptModal.cellId = ''
  runtimePromptModal.outputCount = 0
}
function openRuntimePromptModal(cellId, payload = {}) {
  const nextCellId = String(cellId || '').trim()
  setSelectedCell(nextCellId)
  runtimePromptModal.cellId = nextCellId
  runtimePromptModal.requestId = String(payload?.input_request_id || payload?.inputRequestId || '').trim()
  runtimePromptModal.prompt = String(payload?.prompt || '').trim()
  runtimePromptModal.password = !!payload?.password
  runtimePromptModal.submitting = false
  runtimePromptModal.outputCount = Array.isArray(payload?.outputs)
    ? payload.outputs.length
    : (Array.isArray(runtimeBackendOutputsByCellId.get(nextCellId)) ? runtimeBackendOutputsByCellId.get(nextCellId).length : 0)
  focusCellRuntimeInput(nextCellId)
}
function getRuntimePromptRequestForCell(cellId) {
  const targetId = String(cellId || '').trim()
  if (!targetId || runtimePromptModal.cellId !== targetId || !String(runtimePromptModal.requestId || '').trim()) return null
  return {
    prompt: runtimePromptModal.prompt,
    password: runtimePromptModal.password,
    submitting: runtimePromptModal.submitting,
    requestId: runtimePromptModal.requestId
  }
}
async function submitRuntimePromptInput(payload = {}) {
  if (runtimePromptModal.submitting) return
  const activeSessionId = String(sessionId.value || '').trim()
  const inputRequestId = String(runtimePromptModal.requestId || '').trim()
  const activeCellId = String(runtimePromptModal.cellId || '').trim()
  if (!activeSessionId || !inputRequestId || !activeCellId) return
  const submittedValue = typeof payload === 'object' && payload !== null && 'value' in payload
    ? String(payload.value ?? '')
    : String(payload ?? '')
  const promptText = String(runtimePromptModal.prompt || '')
  const isPassword = !!runtimePromptModal.password
  const promptOutputCount = Number(runtimePromptModal.outputCount) || 0
  runtimePromptModal.submitting = true
  try {
    await provideNotebookCellInput(activeSessionId, {
      inputRequestId,
      value: submittedValue
    })
    appendRuntimePromptEchoOutput(activeCellId, {
      prompt: promptText,
      value: submittedValue,
      password: isPassword,
      afterOutputCount: promptOutputCount
    })
    if (runtimePromptModal.requestId === inputRequestId && runtimePromptModal.cellId === activeCellId) {
      closeRuntimePromptModal()
    }
  } catch (err) {
    runtimePromptModal.submitting = false
    message.error(err?.message || String(err))
  }
}
async function abortRuntimePromptInput() {
  if (runtimePromptModal.submitting) return
  const activeCellId = String(runtimePromptModal.cellId || runningCellId.value || '').trim()
  closeRuntimePromptModal()
  if (activeCellId) await stopCellRun(activeCellId)
}
function useDetectedRuntimePython() { const detectedPath = String(runtimeDetectedPython.value || '').trim(); if (!detectedPath) return message.warning('未检测到可用的 Python，请先手动填写解释器路径。'); runtimeInstallModal.pythonPath = detectedPath }
async function persistNotebookRuntimePython(pythonPath) { const nextRuntime = normalizeNotebookRuntimeConfig({ ...runtimeConfig.value, pythonPath: String(pythonPath || '').trim() }); await updateNoteConfig({ notebookRuntime: nextRuntime }); return nextRuntime }
async function retryPendingRuntimeAction() { const request = pendingRuntimeRetry.value; pendingRuntimeRetry.value = null; if (!request) return; if (request.type === 'run-all') return runAllCellsSafe(); if (request.type === 'run-cell' && request.cellId) return runCellById(request.cellId) }
async function saveRuntimePythonConfigOnly() { runtimeInstallModal.loading = true; try { if (activeManagedVenv.value?.name) throw new Error('当前笔记正在使用托管环境，请使用 `%runtime reset` 恢复默认环境，或用 `%runtime use 环境名` 切换。'); const pythonPath = resolveRuntimePythonPath(runtimeInstallModal.pythonPath); await persistNotebookRuntimePython(pythonPath); runtimeInstallModal.show = false; await loadPythonModulesForCompletion(pythonPath, { force: true }); message.success('Python 解释器路径已保存到当前电脑本地配置。') } catch (err) { message.error(err?.message || String(err)) } finally { runtimeInstallModal.loading = false } }
async function saveRuntimePythonAndInstall() { runtimeInstallModal.loading = true; runtimeInstallModal.progressMessage = '正在准备安装 Notebook 依赖...'; runtimeInstallModal.installLogs = ''; composeRuntimeInstallMessage(); try { const pythonPath = resolveRuntimePythonPath(runtimeInstallModal.pythonPath || activePythonPath.value); runtimeInstallModal.pythonPath = pythonPath; if (!activeManagedVenv.value?.name) await persistNotebookRuntimePython(pythonPath); const installPackages = buildRuntimeInstallPackageList(runtimeInstallModal.installPackages); await installNotebookDependencies({ pythonPath, packages: installPackages, onProgress: (progress) => { const summary = String(progress?.message || progress?.text || '').trim(); if (summary) runtimeInstallModal.progressMessage = summary; const rawLog = String(progress?.text || progress?.message || '').trim(); if (rawLog) appendRuntimeInstallLog(rawLog); else composeRuntimeInstallMessage() } }); runtimeInstallModal.progressMessage = '依赖安装完成，正在重新加载 Notebook 运行环境...'; composeRuntimeInstallMessage(); await shutdownCurrentSession(); runtimeIssue.value = ''; await loadPythonModulesForCompletion(pythonPath, { force: true }); runtimeInstallModal.show = false; message.success(activeManagedVenv.value?.name ? `环境 ${activeManagedVenv.value.name} 的 Notebook 依赖已安装完成。` : 'Notebook 依赖已安装完成，已恢复可用。'); await retryPendingRuntimeAction() } catch (err) { runtimeIssue.value = `Notebook 执行失败：${err?.message || String(err)}`; runtimeInstallModal.progressMessage = '安装失败，请检查上面的日志输出后重试。'; appendRuntimeInstallLog(err?.message || String(err)); message.error('Notebook 依赖安装失败，请先处理安装日志中的问题。') } finally { runtimeInstallModal.loading = false; composeRuntimeInstallMessage() } }
function handleRuntimeFailure(err, retryRequest = null, options = {}) {
  const detail = String(err?.message || err || '').trim()
  if (isUserAbortError(err)) {
    runtimeIssue.value = ''
    pendingRuntimeRetry.value = null
    return false
  }

  const errorText = `Notebook 执行失败：${detail}`
  runtimeIssue.value = errorText
  lastPythonCompletionIssue.value = ''

  if (shouldPromptRuntimeInstall(detail)) {
    const retryCell = retryRequest?.cellId ? getCellById(retryRequest.cellId) : null
    const runtimeMissingPackages = Array.isArray(pythonEnvironmentHealth.value?.missingPackages) ? pythonEnvironmentHealth.value.missingPackages : []
    const sqlInstallPackages = retryCell && getCellRuntime(retryCell) === 'sql'
      ? buildNotebookSqlDependencyInstallPackages(String(retryCell.source || ''), detail, availablePythonModules.value)
      : []
    const installPackages = normalizeInstallPackageList([...runtimeMissingPackages, ...sqlInstallPackages])

    if (installPackages.length) {
      openRuntimeInstallModal(errorText, retryRequest, installPackages)
      return false
    }
  }

  pendingRuntimeRetry.value = null
  if (options?.showToast) message.error(errorText)
  return false
}
function allocateNotebookRuntimeExecutionId(prefix = 'runtime') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
async function ensureManagedEnvironmentDependencies(pythonPath, envName, appendLine = null) {
  const missingLabels = listMissingNotebookDependencyLabels()
  const log = typeof appendLine === 'function' ? appendLine : null
  if (!pythonEnvironmentHealth.value.needsInstall) return pythonEnvironmentHealth.value
  if (log) log(`检测到环境 ${envName} 缺少依赖：${missingLabels.join('、')}，正在自动安装...`)
  const executionId = allocateNotebookRuntimeExecutionId('envdeps')
  activeDirectExecutionId.value = executionId
  try {
    await installNotebookDependencies({
      executionId,
      pythonPath,
      onProgress: (progress) => {
        if (progress?.executionId) activeDirectExecutionId.value = String(progress.executionId || executionId)
        const summary = String(progress?.message || progress?.text || '').trim()
        if (summary && log) log(summary)
      }
    })
  } finally {
    activeDirectExecutionId.value = ''
  }
  const refreshedHealth = await inspectPythonEnvironment(pythonPath, { force: true })
  if (refreshedHealth?.needsInstall) {
    throw new Error(`环境 ${envName} 依赖仍未准备完成，请稍后重试。`)
  }
  if (log) log(`环境 ${envName} 的 Notebook 依赖已补齐。`)
  return refreshedHealth
}
function markRuntimeUserAbort(reason = '') { runtimeUserAbortState.value = { cellId: String(runningCellId.value || '').trim(), reason: String(reason || '').trim() } }
function consumeRuntimeUserAbort(cellId = '') { const state = runtimeUserAbortState.value; const targetCellId = String(cellId || '').trim(); if (!state?.reason) return null; if (state.cellId && targetCellId && state.cellId !== targetCellId) return null; runtimeUserAbortState.value = { cellId: '', reason: '' }; return state }
async function forceRestartSession(reason = 'Notebook 执行已被用户终止（强制重启 Kernel）') { if (!sessionId.value) { const activeId = await ensureSession(); return { sessionId: activeId, forced: false, started: true } } const result = await forceRestartNotebookSession(sessionId.value, { reason: String(reason || '').trim() || 'Notebook 执行已被用户终止（强制重启 Kernel）' }); sessionId.value = String(result?.sessionId || sessionId.value || ''); sessionKernelName.value = String(result?.kernel_name || result?.kernelName || sessionKernelName.value || runtimeConfig.value.kernelName || 'python3'); runtimeIssue.value = ''; return result }
async function ensureSession() { if (sessionId.value) return sessionId.value; if (sessionEnsuringPromise) return sessionEnsuringPromise; const runtime = runtimeConfig.value; sessionEnsuringPromise = createNotebookSession({ notebookPath: props.filePath, pythonPath: activePythonPath.value, kernelName: runtime.kernelName, startupTimeoutMs: runtime.startupTimeoutMs, executeTimeoutMs: runtime.executeTimeoutMs }).then((session) => { sessionId.value = String(session?.sessionId || ''); sessionKernelName.value = String(session?.kernelName || runtime.kernelName || 'python3'); runtimeIssue.value = ''; return sessionId.value }).finally(() => { sessionEnsuringPromise = null }); return sessionEnsuringPromise }
function clearSessionPrewarmTimer() { if (!sessionPrewarmTimer) return; clearTimeout(sessionPrewarmTimer); sessionPrewarmTimer = null }
function canPrewarmSession() { return !!props.filePath && !loading.value && !runtimeInstallModal.loading && !runningCellId.value && !kernelActionLoading.value && !sessionId.value && !sessionEnsuringPromise }
function scheduleSessionPrewarm(delayMs = 260) { clearSessionPrewarmTimer(); if (!canPrewarmSession()) return; sessionPrewarmTimer = setTimeout(() => { sessionPrewarmTimer = null; if (!canPrewarmSession()) return; void ensureSession().catch(() => {}) }, Math.max(0, Number(delayMs) || 0)) }
async function runMarkdownCell(cellId, options = {}) { setSelectedCell(cellId); setMarkdownPreview(cellId, true); if (options.moveToNext) await moveToNextCellOrScrollToBottom(cellId); return true }
function patchRuntimeMagicCellSuccess(cellId, lines = []) {
  patchRuntimeCodeCellResult(cellId, {
    outputs: lines.length ? [{ output_type: 'stream', name: 'stdout', text: `${lines.join('\n')}\n` }] : [],
    execution_count: null
  }, { immediate: true })
}
function buildRuntimeDisplayOutputs(cellId, lines = [], outputs = []) {
  const targetCellId = String(cellId || '').trim()
  const echoEntries = targetCellId ? (runtimeInputEchoesByCellId.get(targetCellId) || []) : []
  return buildRuntimeDisplayOutputsForCell(lines, outputs, echoEntries)
}
function updateRuntimeBackendOutputs(cellId, outputs = []) {
  const targetCellId = String(cellId || '').trim()
  if (!targetCellId) return
  const nextOutputs = Array.isArray(outputs) ? outputs : []
  const previousOutputs = runtimeBackendOutputsByCellId.get(targetCellId)
  if (Array.isArray(previousOutputs) && nextOutputs.length < previousOutputs.length) {
    runtimeInputEchoesByCellId.delete(targetCellId)
  }
  runtimeBackendOutputsByCellId.set(targetCellId, nextOutputs)
}
function appendRuntimePromptEchoOutput(cellId, payload = {}) {
  const targetCellId = String(cellId || '').trim()
  if (!targetCellId) return
  const promptText = String(payload?.prompt || '')
  const submittedValue = String(payload?.value ?? '')
  const isPassword = !!payload?.password
  const afterOutputCount = Math.max(0, Number(payload?.afterOutputCount) || 0)
  const echoedText = isPassword ? (promptText ? `${promptText}\n` : '') : `${promptText}${submittedValue}\n`
  if (!echoedText) return
  const echoEntries = runtimeInputEchoesByCellId.get(targetCellId) || []
  runtimeInputEchoesByCellId.set(targetCellId, [
    ...echoEntries,
    {
      afterOutputCount,
      output: {
        output_type: 'stream',
        name: 'stdout',
        text: echoedText
      }
    }
  ])
  const outputs = Array.isArray(runtimeBackendOutputsByCellId.get(targetCellId)) ? runtimeBackendOutputsByCellId.get(targetCellId) : []
  const preludeLines = runtimePreludeLinesByCellId.get(targetCellId) || []
  patchRuntimeCodeCellResult(targetCellId, {
    outputs: buildRuntimeDisplayOutputs(targetCellId, preludeLines, outputs)
  }, { immediate: true })
}
function patchRuntimeMagicCellFailure(cellId, lines = [], err = null) {
  patchRuntimeCodeCellResult(cellId, {
    outputs: [
      ...buildRuntimeMagicPreludeOutputs(lines),
      {
        output_type: 'error',
        ename: 'RuntimeMagicError',
        evalue: String(err?.message || err || '执行失败'),
        traceback: []
      }
    ],
    execution_count: null
  }, { immediate: true })
}
function appendNotebookStreamOutput(outputs, streamName, text) {
  const normalizedText = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalizedText) return
  const targetName = String(streamName || 'stdout').trim() || 'stdout'
  const lastOutput = Array.isArray(outputs) ? outputs[outputs.length - 1] : null
  if (lastOutput?.output_type === 'stream' && lastOutput?.name === targetName) {
    lastOutput.text = `${String(lastOutput.text || '')}${normalizedText}`
    return
  }
  outputs.push({
    output_type: 'stream',
    name: targetName,
    text: normalizedText
  })
}
function buildDirectExecutionOutputState(preludeLines = []) {
  return {
    outputs: buildRuntimeMagicPreludeOutputs(preludeLines).map((item) => ({ ...item })),
    execution_count: null
  }
}
function appendDirectExecutionProgress(outputState, progress = {}) {
  const text = String(progress?.text || progress?.message || '').trimEnd()
  if (!text) return
  const streamName = ['stderr', 'error'].includes(String(progress?.phase || '').trim()) ? 'stderr' : 'stdout'
  appendNotebookStreamOutput(outputState.outputs, streamName, `${text}\n`)
}
async function executeNotebookDirectMagicSpecs(cellId, specs = [], preludeLines = []) {
  const outputState = buildDirectExecutionOutputState(preludeLines)
  const pythonPath = String(activePythonPath.value || resolveRuntimePythonPath()).trim() || 'python'
  const cwd = props.filePath ? path.dirname(props.filePath) : ''

  try {
    const result = await executeNotebookMagicSpecs({
      specs,
      pythonPath,
      cwd,
      onProgress: (progress) => {
        if (progress?.executionId) activeDirectExecutionId.value = String(progress.executionId || '')
        appendDirectExecutionProgress(outputState, progress)
        patchRuntimeCodeCellResult(cellId, {
          outputs: outputState.outputs,
          execution_count: null
        })
      }
    })
    if (result?.executionId) activeDirectExecutionId.value = String(result.executionId || '')
    patchRuntimeCodeCellResult(cellId, {
      outputs: outputState.outputs,
      execution_count: null
    }, { immediate: true })
    if (specs.some((spec) => spec?.kind === 'pip')) {
      await loadPythonModulesForCompletion(pythonPath, { force: true })
    }
    return true
  } catch (err) {
    if (consumeRuntimeUserAbort(cellId) || isUserAbortError(err)) {
      appendNotebookStreamOutput(outputState.outputs, 'stdout', '命令已停止。\n')
      patchRuntimeCodeCellResult(cellId, {
        outputs: outputState.outputs,
        execution_count: null
      }, { immediate: true })
      lastRunStoppedByUser.value = true
      runtimeIssue.value = ''
      return false
    }
    patchRuntimeCodeCellResult(cellId, {
      outputs: [
        ...outputState.outputs,
        {
          output_type: 'error',
          ename: 'NotebookMagicError',
          evalue: String(err?.message || err || '执行失败'),
          traceback: []
        }
      ],
      execution_count: null
    }, { immediate: true })
    return false
  } finally {
    activeDirectExecutionId.value = ''
  }
}
async function executeRuntimeMagicCommands(cellId, commands = []) {
  const lines = []
  const appendLine = (text = '') => {
    const normalized = String(text || '').trimEnd()
    if (!normalized) return
    lines.push(normalized)
    patchRuntimeMagicCellSuccess(cellId, lines)
  }

  try {
    await refreshManagedVenvs({ silent: true })
    for (const command of commands) {
      appendLine(`> ${command.raw}`)
      if (command.command === 'invalid') {
        throw new Error('未识别的环境命令。可用命令有：%runtime help / list / info / create-venv / use / reset')
      }
      if (command.command === 'help') {
        appendLine(buildRuntimeHelpText())
        continue
      }
      if (command.command === 'list') {
        await refreshManagedVenvs({ silent: true })
        appendLine(buildRuntimeInfoText())
        continue
      }
      if (command.command === 'info') {
        appendLine(buildRuntimeInfoText())
        continue
      }
      if (command.command === 'create-venv') {
        const envName = String(command.argText || '').trim()
        if (!envName) throw new Error('请在 `%runtime create-venv 环境名` 后填写环境名称。')
        const executionId = allocateNotebookRuntimeExecutionId('createvenv')
        activeDirectExecutionId.value = executionId
        let created = null
        try {
          created = await createManagedNotebookVenv({
            executionId,
            name: envName,
            pythonPath: activePythonPath.value || resolveRuntimePythonPath(),
            onProgress: (progress) => {
              if (progress?.executionId) activeDirectExecutionId.value = String(progress.executionId || executionId)
              const progressText = String(progress?.message || progress?.text || '').trim()
              if (progressText) appendLine(progressText)
            }
          })
        } finally {
          activeDirectExecutionId.value = ''
        }
        await refreshManagedVenvs({ silent: true })
        if (created?.existed) appendLine(`环境已存在：${created?.name || envName}`)
        else appendLine(`环境已创建：${created?.name || envName}`)
        appendLine(`解释器路径：${String(created?.pythonPath || '').trim()}`)
        continue
      }
      if (command.command === 'use') {
        const envName = String(command.argText || '').trim()
        if (!envName) throw new Error('请在 `%runtime use 环境名` 后填写已创建的环境名称。')
        await refreshManagedVenvs({ silent: true })
        const targetEnv = managedVenvs.value.find((item) => item?.name === envName && item?.exists)
        if (!targetEnv) throw new Error(`未找到可用环境：${envName}`)
        const alreadyUsing = notebookRuntimeEnvName.value === envName
        if (!alreadyUsing) {
          await persistNotebookManagedEnvName(envName)
          await shutdownCurrentSession()
        }
        runtimeIssue.value = ''
        const envHealth = await inspectPythonEnvironment(targetEnv.pythonPath, { force: true })
        if (envHealth?.needsInstall) {
          await ensureManagedEnvironmentDependencies(targetEnv.pythonPath, envName, appendLine)
        }
        scheduleSessionPrewarm(80)
        appendLine(alreadyUsing ? `当前笔记已在环境：${envName}` : `当前笔记已切换到环境：${envName}`)
        appendLine(`解释器路径：${String(targetEnv.pythonPath || '').trim()}`)
        continue
      }
      if (command.command === 'reset') {
        if (!notebookRuntimeEnvName.value) {
          appendLine('当前笔记已是默认环境。')
          appendLine(`默认解释器：${resolveRuntimePythonPath()}`)
          continue
        }
        await persistNotebookManagedEnvName('')
        await shutdownCurrentSession()
        runtimeIssue.value = ''
        await loadPythonModulesForCompletion(resolveRuntimePythonPath(), { force: true })
        scheduleSessionPrewarm(80)
        appendLine('当前笔记已恢复为默认环境。')
        appendLine(`默认解释器：${resolveRuntimePythonPath()}`)
      }
    }
    patchRuntimeMagicCellSuccess(cellId, lines)
    return { ok: true, lines }
  } catch (err) {
    activeDirectExecutionId.value = ''
    if (consumeRuntimeUserAbort(cellId) || isUserAbortError(err)) {
      lastRunStoppedByUser.value = true
      runtimeIssue.value = ''
      patchRuntimeMagicCellSuccess(cellId, [...lines, '命令已停止。'])
      return { ok: false, aborted: true, lines }
    }
    patchRuntimeMagicCellFailure(cellId, lines, err)
    return { ok: false, aborted: false, lines }
  }
}
function prepareSqlCellSource(source = '') {
  return buildNotebookSqlExecutionCode(source)
}
async function runPythonCell(cellId, options = {}) {
  if (guardRuntimeInstallPending() || runningCellId.value) return false
  const targetCell = notebook.value.cells.find((item) => item.id === cellId)
  if (!targetCell || targetCell.cell_type !== 'code') return false
  const source = String(targetCell.source || '')
  const sqlDependencyPreflight = await ensureSqlDependenciesBeforeRun(source, { type: 'run-cell', cellId }, { treatAsSqlCell: false })
  if (!sqlDependencyPreflight.ok) return false
  closeRuntimePromptModal()
  clearCodeCellOutputs(cellId)
  runtimeBackendOutputsByCellId.set(cellId, [])
  runtimeInputEchoesByCellId.delete(cellId)
  runtimePreludeLinesByCellId.set(cellId, [])
  lastRunStoppedByUser.value = false
  runningCellId.value = cellId
  runtimeIssue.value = ''
  setSelectedCell(cellId)
  try {
    const magicPlan = buildNotebookRuntimeMagicExecutionPlan(source)
    if (magicPlan.invalidCommand) {
      patchRuntimeMagicCellFailure(cellId, [`> ${magicPlan.invalidCommand.raw}`], new Error(magicPlan.invalidReason || '环境命令位置不正确'))
      return false
    }
    const sqlSourceForHints = String(magicPlan.code || source || '')
    if (sqlSourceForHints) warnPlaintextSqlConnectionRisk(sqlSourceForHints)
    let runtimePreludeLines = []
    if (magicPlan.commands.length) {
      const runtimeResult = await executeRuntimeMagicCommands(cellId, magicPlan.commands)
      if (!runtimeResult?.ok) return false
      runtimePreludeLines = Array.isArray(runtimeResult?.lines) ? runtimeResult.lines : []
      runtimePreludeLinesByCellId.set(cellId, runtimePreludeLines)
      if (!String(magicPlan.code || '').trim()) {
        return true
      }
    }
    const directExecutionSpecs = parseNotebookDirectExecutionSpecs(String(magicPlan.code || source || ''))
    if (directExecutionSpecs.length) {
      const ok = await executeNotebookDirectMagicSpecs(cellId, directExecutionSpecs, runtimePreludeLines)
      if (ok && options.moveToNext) await moveToNextCellOrScrollToBottom(cellId)
      return ok
    }
    const activeSessionId = await ensureSession()
    if (consumeRuntimeUserAbort(cellId)) {
      lastRunStoppedByUser.value = true
      return false
    }
    let latestRuntimeOutputs = []
    const result = await executeNotebookCell(activeSessionId, {
      code: String(magicPlan.code || source || ''),
      timeoutMs: runtimeConfig.value.executeTimeoutMs,
      onProgress: (partial) => {
        if (Object.prototype.hasOwnProperty.call(partial || {}, 'outputs')) {
          latestRuntimeOutputs = Array.isArray(partial?.outputs) ? partial.outputs : []
          updateRuntimeBackendOutputs(cellId, latestRuntimeOutputs)
        }
        patchRuntimeCodeCellResult(cellId, {
          outputs: augmentSqlOutputsIfNeeded(sqlSourceForHints, buildRuntimeDisplayOutputs(cellId, runtimePreludeLines, latestRuntimeOutputs)),
          execution_count: partial?.execution_count
        })
        if (partial?.status === 'input_requested') {
          openRuntimePromptModal(cellId, partial)
        }
      }
    })
    updateRuntimeBackendOutputs(cellId, Array.isArray(result?.outputs) ? result.outputs : [])
    patchRuntimeCodeCellResult(cellId, {
      outputs: augmentSqlOutputsIfNeeded(sqlSourceForHints, buildRuntimeDisplayOutputs(cellId, runtimePreludeLines, result?.outputs)),
      execution_count: result?.execution_count
    })
    if (consumeRuntimeUserAbort(cellId)) {
      lastRunStoppedByUser.value = true
      runtimeIssue.value = ''
      return false
    }
    if (options.moveToNext) await moveToNextCellOrScrollToBottom(cellId)
    return true
  } catch (err) {
    if (consumeRuntimeUserAbort(cellId)) {
      lastRunStoppedByUser.value = true
      runtimeIssue.value = ''
      return false
    }
    return handleRuntimeFailure(err, { type: 'run-cell', cellId })
  } finally {
    closeRuntimePromptModal()
    runtimeBackendOutputsByCellId.delete(cellId)
    runtimeInputEchoesByCellId.delete(cellId)
    runtimePreludeLinesByCellId.delete(cellId)
    runningCellId.value = ''
  }
}
async function runSqlCell(cellId, options = {}) {
  if (guardRuntimeInstallPending() || runningCellId.value) return false
  const targetCell = notebook.value.cells.find((item) => item.id === cellId)
  if (!targetCell || targetCell.cell_type !== 'code') return false
  const source = String(targetCell.source || '')
  const sqlDependencyPreflight = await ensureSqlDependenciesBeforeRun(source, { type: 'run-cell', cellId }, { treatAsSqlCell: true })
  if (!sqlDependencyPreflight.ok) return false
  closeRuntimePromptModal()
  clearCodeCellOutputs(cellId)
  runtimeBackendOutputsByCellId.set(cellId, [])
  runtimeInputEchoesByCellId.delete(cellId)
  runtimePreludeLinesByCellId.set(cellId, [])
  lastRunStoppedByUser.value = false
  runningCellId.value = cellId
  runtimeIssue.value = ''
  setSelectedCell(cellId)
  try {
    warnPlaintextSqlConnectionRisk(source)
    const activeSessionId = await ensureSession()
    if (consumeRuntimeUserAbort(cellId)) {
      lastRunStoppedByUser.value = true
      return false
    }
    let latestRuntimeOutputs = []
    const sqlExecutionSource = prepareSqlCellSource(source)
    const result = await executeNotebookCell(activeSessionId, {
      code: sqlExecutionSource,
      timeoutMs: runtimeConfig.value.executeTimeoutMs,
      onProgress: (partial) => {
        if (Object.prototype.hasOwnProperty.call(partial || {}, 'outputs')) {
          latestRuntimeOutputs = Array.isArray(partial?.outputs) ? partial.outputs : []
          updateRuntimeBackendOutputs(cellId, latestRuntimeOutputs)
        }
        patchRuntimeCodeCellResult(cellId, {
          outputs: augmentSqlOutputsIfNeeded(source, buildRuntimeDisplayOutputs(cellId, [], latestRuntimeOutputs), true),
          execution_count: partial?.execution_count
        })
      }
    })
    updateRuntimeBackendOutputs(cellId, Array.isArray(result?.outputs) ? result.outputs : [])
    patchRuntimeCodeCellResult(cellId, {
      outputs: augmentSqlOutputsIfNeeded(source, buildRuntimeDisplayOutputs(cellId, [], result?.outputs), true),
      execution_count: result?.execution_count
    })
    if (consumeRuntimeUserAbort(cellId)) {
      lastRunStoppedByUser.value = true
      runtimeIssue.value = ''
      return false
    }
    if (options.moveToNext) await moveToNextCellOrScrollToBottom(cellId)
    return true
  } catch (err) {
    if (consumeRuntimeUserAbort(cellId)) {
      lastRunStoppedByUser.value = true
      runtimeIssue.value = ''
      return false
    }
    return handleRuntimeFailure(err, { type: 'run-cell', cellId })
  } finally {
    closeRuntimePromptModal()
    runtimeBackendOutputsByCellId.delete(cellId)
    runtimeInputEchoesByCellId.delete(cellId)
    runtimePreludeLinesByCellId.delete(cellId)
    runningCellId.value = ''
  }
}
async function runJavaScriptCell(cellId, options = {}) {
  if (guardRuntimeInstallPending() || runningCellId.value) return false
  const targetCell = notebook.value.cells.find((item) => item.id === cellId)
  if (!targetCell || targetCell.cell_type !== 'code') return false
  closeRuntimePromptModal()
  clearCodeCellOutputs(cellId)
  runtimeBackendOutputsByCellId.set(cellId, [])
  runtimeInputEchoesByCellId.delete(cellId)
  runtimePreludeLinesByCellId.set(cellId, [])
  lastRunStoppedByUser.value = false
  runningCellId.value = cellId
  runtimeIssue.value = ''
  setSelectedCell(cellId)
  const executionId = allocateNotebookRuntimeExecutionId('javascript')
  activeDirectExecutionId.value = executionId
  try {
    const result = await executeNotebookJavaScriptCell({
      code: String(targetCell.source || ''),
      executionId,
      timeoutMs: runtimeConfig.value.executeTimeoutMs,
      onProgress: (partial) => {
        if (partial?.executionId) activeDirectExecutionId.value = String(partial.executionId || executionId)
        if (Object.prototype.hasOwnProperty.call(partial || {}, 'outputs')) {
          const latestOutputs = Array.isArray(partial?.outputs) ? partial.outputs : []
          updateRuntimeBackendOutputs(cellId, latestOutputs)
          patchRuntimeCodeCellResult(cellId, {
            outputs: latestOutputs,
            execution_count: null
          })
        }
      }
    })
    if (result?.executionId) activeDirectExecutionId.value = String(result.executionId || executionId)
    const resultOutputs = Array.isArray(result?.outputs) ? result.outputs : []
    updateRuntimeBackendOutputs(cellId, resultOutputs)
    patchRuntimeCodeCellResult(cellId, {
      outputs: resultOutputs,
      execution_count: null
    }, { immediate: true })
    if (result && result.ok === false) {
      runtimeIssue.value = ''
      return false
    }
    if (consumeRuntimeUserAbort(cellId)) {
      lastRunStoppedByUser.value = true
      runtimeIssue.value = ''
      return false
    }
    if (options.moveToNext) await moveToNextCellOrScrollToBottom(cellId)
    return true
  } catch (err) {
    if (consumeRuntimeUserAbort(cellId) || isUserAbortError(err)) {
      lastRunStoppedByUser.value = true
      runtimeIssue.value = ''
      return false
    }
    return handleRuntimeFailure(err, { type: 'run-cell', cellId })
  } finally {
    closeRuntimePromptModal()
    runtimeBackendOutputsByCellId.delete(cellId)
    runtimeInputEchoesByCellId.delete(cellId)
    runtimePreludeLinesByCellId.delete(cellId)
    activeDirectExecutionId.value = ''
    runningCellId.value = ''
  }
}
async function runCodeCell(cellId, options = {}) { return runPythonCell(cellId, options) }
async function runCellById(cellId, options = {}) {
  const targetCell = notebook.value.cells.find((item) => item.id === cellId)
  if (!targetCell) return false
  if (targetCell.cell_type === 'markdown') return runMarkdownCell(cellId, options)
  if (targetCell.cell_type !== 'code') return false
  const runtime = getCellRuntime(targetCell)
  if (runtime === 'javascript') return runJavaScriptCell(cellId, options)
  if (runtime === 'sql') return runSqlCell(cellId, options)
  return runPythonCell(cellId, options)
}
async function runAllCellsSafe() { if (guardRuntimeInstallPending() || runningCellId.value || runAllLoading.value) return; runAllLoading.value = true; try { for (const cell of notebook.value.cells) { const ok = await runCellById(cell.id); if (!ok) { if (!lastRunStoppedByUser.value) pendingRuntimeRetry.value = { type: 'run-all' }; break } } } finally { runAllLoading.value = false } }
async function interruptCurrentSessionSafe() {
  if (guardRuntimeInstallPending() || !runningCellId.value || kernelActionLoading.value) return
  kernelActionLoading.value = true
  try {
    closeRuntimePromptModal()
    markRuntimeUserAbort('interrupt')
    if (activeDirectExecutionId.value) {
      await interruptNotebookMagicExecution(activeDirectExecutionId.value).catch(() => {})
      activeDirectExecutionId.value = ''
      message.success('已停止当前命令执行。')
      return
    }
    if (!sessionId.value) return
    await interruptNotebookSession(sessionId.value)
    message.success('已停止当前执行，Kernel 保持运行。')
  } catch (err) {
    consumeRuntimeUserAbort()
    handleRuntimeFailure(err)
  } finally {
    kernelActionLoading.value = false
  }
}
async function restartCurrentSessionSafe() { if (guardRuntimeInstallPending() || kernelActionLoading.value) return; kernelActionLoading.value = true; try { closeRuntimePromptModal(); if (activeDirectExecutionId.value && runningCellId.value) { markRuntimeUserAbort('force-restart'); await interruptNotebookMagicExecution(activeDirectExecutionId.value).catch(() => {}); activeDirectExecutionId.value = ''; message.success('当前命令已停止。'); return } if (!sessionId.value) { await ensureSession(); return message.success('Kernel 已启动。') } if (runningCellId.value) { markRuntimeUserAbort('force-restart'); await forceRestartSession('Notebook 执行已被用户终止（强制重启 Kernel）'); message.success('Kernel 已强制重启，当前执行已终止。'); return } const result = await restartNotebookSession(sessionId.value); sessionKernelName.value = String(result?.kernel_name || sessionKernelName.value || runtimeConfig.value.kernelName || 'python3'); runtimeIssue.value = ''; message.success('Kernel 已重启。') } catch (err) { consumeRuntimeUserAbort(); handleRuntimeFailure(err) } finally { kernelActionLoading.value = false } }
async function stopCellRun(cellId) {
  if (guardRuntimeInstallPending() || kernelActionLoading.value) return
  if (!runningCellId.value || runningCellId.value !== cellId) return
  kernelActionLoading.value = true
  try {
    closeRuntimePromptModal()
    markRuntimeUserAbort('stop-cell')
    if (activeDirectExecutionId.value) {
      await interruptNotebookMagicExecution(activeDirectExecutionId.value).catch(() => {})
      activeDirectExecutionId.value = ''
      message.success('已停止当前命令运行。')
      return
    }
    if (!sessionId.value) return
    await interruptNotebookSession(sessionId.value)
    message.success('已停止当前 Cell 运行，Kernel 保持运行。')
  } catch (err) {
    consumeRuntimeUserAbort(cellId)
    handleRuntimeFailure(err)
  } finally {
    kernelActionLoading.value = false
  }
}
async function shutdownCurrentSession() { clearSessionPrewarmTimer(); closeRuntimePromptModal(); const activeSessionId = String(sessionId.value || ''); sessionEnsuringPromise = null; if (activeDirectExecutionId.value) { await interruptNotebookMagicExecution(activeDirectExecutionId.value).catch(() => {}); activeDirectExecutionId.value = '' } if (!activeSessionId) return; sessionId.value = ''; sessionKernelName.value = ''; runtimeUserAbortState.value = { cellId: '', reason: '' }; try { await shutdownNotebookSession(activeSessionId) } catch {} }
async function saveNow() { if (!props.filePath) return; if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null } manualSaving.value = true; try { await queuePersistNotebook(props.filePath, notebook.value, { force: true }); await cleanupUnusedNotebookAttachments(props.filePath, notebook.value).catch(() => {}); message.success('超级笔记已保存。') } catch (err) { message.error(`保存失败：${err?.message || String(err)}`) } finally { manualSaving.value = false } }
function resolveCellIdFromNode(target) { if (!(target instanceof Node)) return ''; const element = target instanceof Element ? target : target.parentElement; const cellId = element?.closest?.('[data-cell-id]')?.getAttribute('data-cell-id'); return cellId || '' }
function resolveCellIdFromEventTarget(target) { const fromTarget = resolveCellIdFromNode(target); if (fromTarget) return fromTarget; const activeElement = document.activeElement; const fromActive = resolveCellIdFromNode(activeElement); if (fromActive) return fromActive; const selection = window.getSelection?.(); return resolveCellIdFromNode(selection?.anchorNode || null) }
function isShortcutEventInsideEditor(event) { const root = editorRootRef.value; if (!root) return false; const activeElement = document.activeElement; return (event.target instanceof Node && root.contains(event.target)) || (activeElement instanceof Node && root.contains(activeElement)) }
function handleGlobalKeydown(event) { if (!isShortcutEventInsideEditor(event) || event.defaultPrevented || event.isComposing) return; const key = String(event.key || '').toLowerCase(); const anchorCellId = resolveCellIdFromEventTarget(event.target); if (event.shiftKey && key === 'enter') { const cellId = anchorCellId || selectedCellId.value; if (!cellId) return; event.preventDefault(); void runCellById(cellId, { moveToNext: true }); return } if (!(event.ctrlKey || event.metaKey) || !event.altKey || event.shiftKey) return; if (key === 'm') { event.preventDefault(); insertCellRelativeToContext('markdown', anchorCellId); return } if (key === 'c') { event.preventDefault(); insertCellRelativeToContext('code', anchorCellId) } }
lastSavedSerialized = serializeNotebookForStorage(createEmptyNotebook())
onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown, true)
})
watch(() => [props.filePath, props.renameContext?.from, props.renameContext?.to, props.renameContext?.token], () => { void rewriteNotebookManagedEnvBindingForRename(props.renameContext).catch((err) => { message.error(err?.message || String(err)) }) }, { immediate: true })
watch(() => [props.filePath, activePythonPath.value, loading.value], ([filePath, pythonPath, isLoading]) => {
  if (!filePath || isLoading) {
    clearPythonEnvironmentWarmupTimer()
    return
  }
  const inspectionKey = `${String(filePath || '').trim()}::${String(pythonPath || '').trim()}`
  if (!String(pythonPath || '').trim()) return
  if (lastInspectedPythonEnvironmentKey.value === inspectionKey) return
  schedulePythonEnvironmentWarmup(1800)
}, { immediate: true })
watch(() => notebook.value.cells.map((cell) => cell.id).join('|'), () => {
  const validIds = new Set(notebook.value.cells.map((cell) => cell.id))
  markdownPreviewingCellIds.value = new Set([...markdownPreviewingCellIds.value].filter((cellId) => validIds.has(cellId)))
  collapsedCellIds.value = new Set([...collapsedCellIds.value].filter((cellId) => validIds.has(cellId)))
  hydratedCellIds.value = new Set([...hydratedCellIds.value].filter((cellId) => validIds.has(cellId)))
  scheduleRefreshCellVisibilityObserver()
})
watch(() => [selectedCellId.value, runningCellId.value], () => { scheduleStickyHeaderSync() })
watch(() => missingManagedVenv.value, (envName, prevEnvName) => {
  const name = String(envName || '').trim()
  if (!name || name === String(prevEnvName || '').trim()) return
  message.warning(`当前笔记绑定的环境不存在，已回退默认环境：${name}`)
})
watch(() => props.filePath, async (newPath, oldPath) => { if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null } if (cleanupTimeout) { clearTimeout(cleanupTimeout); cleanupTimeout = null } clearManagedVenvRefreshTimer(); clearPythonEnvironmentWarmupTimer(); clearSessionPrewarmTimer(); lastInspectedPythonEnvironmentKey.value = ''; pythonLspCheck.value = { ok: false, error: '', pythonPath: '' }; pythonEnvironmentHealth.value = { pythonPath: '', missingPackages: [], missingLspDependency: false, lspError: '', needsInstall: false }; if (runtimePatchTimer) flushQueuedRuntimeCodeCellResults(); visibleCellIds.value = new Set(); hydratedCellIds.value = new Set(); if (oldPath) { const currentSerialized = serializeNotebookForStorage(notebook.value); if (lastSavedFilePath === oldPath && lastSavedSerialized !== currentSerialized) { try { await queuePersistNotebook(oldPath, notebook.value, { force: true }) } catch (err) { message.error(`保存上一份超级笔记失败：${err?.message || String(err)}`) } } await cleanupUnusedNotebookAttachments(oldPath, notebook.value).catch(() => {}) } await shutdownCurrentSession(); if (!newPath) { setNotebookValue(createEmptyNotebook()); lastSavedFilePath = ''; loadError.value = ''; runtimeIssue.value = ''; saveState.value = 'saved'; resetTransientCellState(); return } await loadNotebook(newPath); scheduleRefreshCellVisibilityObserver(); scheduleManagedVenvRefresh(700) }, { immediate: true })
onBeforeUnmount(async () => { window.removeEventListener('keydown', handleGlobalKeydown, true); clearSessionPrewarmTimer(); clearManagedVenvRefreshTimer(); clearPythonEnvironmentWarmupTimer(); disconnectCellVisibilityObserver(); if (runtimePatchTimer) flushQueuedRuntimeCodeCellResults(); if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null } if (cleanupTimeout) { clearTimeout(cleanupTimeout); cleanupTimeout = null } if (props.filePath) { const currentSerialized = serializeNotebookForStorage(notebook.value); if (lastSavedFilePath === props.filePath && lastSavedSerialized !== currentSerialized) { try { await queuePersistNotebook(props.filePath, notebook.value, { force: true }) } catch {} } await cleanupUnusedNotebookAttachments(props.filePath, notebook.value).catch(() => {}) } await shutdownCurrentSession() })
</script>

<style scoped>
.notebook-welcome,.notebook-editor{height:100%;min-height:0}.notebook-welcome{display:flex;align-items:center;justify-content:center}.notebook-welcome__card{width:min(520px,100%);text-align:center;border-radius:28px;background:linear-gradient(145deg,rgba(248,250,252,.96),rgba(226,232,240,.82))}.notebook-welcome__card h2{margin:14px 0 8px}.notebook-welcome__card p{margin:0 0 16px;color:rgba(71,85,105,.92)}.notebook-welcome.is-dark .notebook-welcome__card{background:linear-gradient(145deg,rgba(30,41,59,.94),rgba(15,23,42,.92))}.notebook-editor{display:flex;flex-direction:column;gap:12px;height:100%;padding:12px;box-sizing:border-box;overflow:visible;border-radius:28px;background:radial-gradient(circle at top left,rgba(56,189,248,.12),transparent 28%),radial-gradient(circle at top right,rgba(251,191,36,.12),transparent 24%),linear-gradient(180deg,rgba(248,250,252,.94),rgba(241,245,249,.92))}.notebook-editor.is-dark{background:radial-gradient(circle at top left,rgba(56,189,248,.18),transparent 28%),radial-gradient(circle at top right,rgba(251,191,36,.12),transparent 24%),linear-gradient(180deg,rgba(15,23,42,.96),rgba(15,23,42,.92))}.notebook-editor__header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border:1px solid rgba(148,163,184,.2);border-radius:22px;background:rgba(255,255,255,.76)}.notebook-editor.is-dark .notebook-editor__header{background:rgba(15,23,42,.72);border-color:rgba(71,85,105,.5)}.notebook-editor__heading{min-width:0}.notebook-editor__eyebrow{display:inline-block;margin-bottom:6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:rgba(14,116,144,.9)}.notebook-editor__title-row{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}.notebook-editor__title-row h3{margin:0;font-size:24px}.notebook-editor__path{color:rgba(71,85,105,.88);word-break:break-all}.notebook-editor.is-dark .notebook-editor__path{color:rgba(203,213,225,.82)}.notebook-editor__meta{display:flex;flex-wrap:wrap;gap:8px}.notebook-editor__toolbar{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}.notebook-editor__alert{border-radius:16px}.notebook-editor__body{flex:1;min-height:0;overflow:auto;padding-right:12px;padding-bottom:4px}.notebook-editor__cells{display:flex;flex-direction:column;gap:12px;overflow:visible;padding-right:6px;padding-bottom:8px}.notebook-editor__cells-spacer{flex:0 0 auto;width:100%}.notebook-editor__empty{min-height:220px;display:flex;align-items:center;justify-content:center;gap:12px;border:1px dashed rgba(148,163,184,.42);border-radius:24px;background:rgba(255,255,255,.6)}.notebook-editor__empty--blank{flex-direction:column}.notebook-editor__empty-actions{display:flex;gap:12px}.notebook-editor.is-dark .notebook-editor__empty{background:rgba(15,23,42,.58);border-color:rgba(71,85,105,.56)}.notebook-editor__modal-stack{display:flex;flex-direction:column;gap:14px}.notebook-editor__runtime-message{white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto}.notebook-editor__detected-python{display:flex;flex-direction:column;gap:8px;width:100%}.notebook-editor__modal-footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.notebook-editor__modal-footer-actions{display:flex;justify-content:flex-end;gap:12px}@media (max-width:960px){.notebook-editor__header,.notebook-editor__modal-footer{flex-direction:column;align-items:flex-start}.notebook-editor__toolbar,.notebook-editor__modal-footer-actions{justify-content:flex-start}}
</style>

<style scoped>
.notebook-editor__body {
  overflow: auto;
  padding-right: 12px;
  padding-bottom: 4px;
  scrollbar-gutter: stable;
  overflow-anchor: none;
  overscroll-behavior: contain;
}

.notebook-editor__sticky-layer {
  position: sticky;
  top: 0;
  z-index: 18;
  height: 0;
  overflow: visible;
  pointer-events: none;
}

.notebook-editor__sticky-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-bottom-color: rgba(148, 163, 184, 0.14);
  border-radius: 18px 18px 0 0;
  background: rgba(255, 255, 255, 0.96);
  pointer-events: auto;
}

.notebook-editor.is-dark .notebook-editor__sticky-header {
  border-color: rgba(71, 85, 105, 0.5);
  border-bottom-color: rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.97);
}

.notebook-editor__sticky-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: rgba(51, 65, 85, 0.92);
}

.notebook-editor__sticky-runtime-tag {
  cursor: pointer;
}

.notebook-editor.is-dark .notebook-editor__sticky-title {
  color: rgba(226, 232, 240, 0.9);
}

.notebook-editor__sticky-exec {
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
}

.notebook-editor__sticky-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.notebook-editor {
  gap: 8px;
}

.notebook-editor__header {
  padding: 12px 16px;
  border-radius: 20px;
}

.notebook-editor__eyebrow {
  margin-bottom: 4px;
  font-size: 11px;
  letter-spacing: 0.1em;
}

.notebook-editor__title-row {
  gap: 2px;
  margin-bottom: 6px;
}

.notebook-editor__title-row h3 {
  font-size: 20px;
  line-height: 1.2;
}

.notebook-editor__path {
  font-size: 12px;
  line-height: 1.35;
}

.notebook-editor__meta {
  gap: 6px;
}

.notebook-editor__toolbar {
  gap: 4px;
}

.notebook-editor__body {
  padding-right: 8px;
  padding-bottom: 2px;
}

.notebook-editor__cells {
  gap: 10px;
  padding-right: 4px;
  padding-bottom: 6px;
}

.notebook-editor__alert {
  border-radius: 14px;
}
</style>



