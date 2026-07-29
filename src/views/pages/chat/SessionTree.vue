<template>
  <div :class="['session-tree', { 'is-dark': props.theme === 'dark' }]" @contextmenu.prevent="handleTreeContextMenu">
    <div class="session-tree__toolbar" @contextmenu.stop.prevent>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button class="session-tree__refresh" size="small" tertiary circle :loading="refreshing" title="刷新目录" @click="refreshTree">
            <template #icon>
              <n-icon :component="RefreshOutline" size="14" />
            </template>
          </n-button>
        </template>
        刷新目录
      </n-tooltip>

      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button class="session-tree__cleanup" size="small" tertiary circle title="清理 3 天前的历史会话" @click="emit('cleanup-auto-sessions')">
            <template #icon>
              <n-icon :component="TrashOutline" size="14" />
            </template>
          </n-button>
        </template>
        清理 3 天前的历史会话
      </n-tooltip>
    </div>

    <n-alert v-if="runtimeIssue" type="warning" style="margin-bottom: 8px;">
      {{ runtimeIssue }}
    </n-alert>

    <div
      class="session-tree__scroll"
      :class="{ 'is-drop-root-target': isDropRootTarget }"
      @dragover.prevent="handleBlankAreaDragOver"
      @dragleave="handleBlankAreaDragLeave"
      @drop.prevent="handleBlankAreaDrop"
    >
      <div
        v-if="directoryLoadState.active"
        class="session-tree__loading"
        role="status"
        aria-live="polite"
      >
        <n-spin size="small" />
        <div class="session-tree__loading-copy">
          <strong>{{ directoryLoadingLabel }}</strong>
          <span v-if="directoryLoadState.total > 0">
            {{ directoryLoadState.processed }}/{{ directoryLoadState.total }}
          </span>
        </div>
      </div>

      <n-tree
        class="session-tree__list"
        block-line
        virtual-scroll
        draggable
        :animated="false"
        expand-on-click
        ellipsis
        :data="treeData"
        :allow-drop="allowTreeDrop"
        :node-props="nodeProps"
        v-model:expanded-keys="expandedKeys"
        v-model:selected-keys="selectedKeys"
        @update:selected-keys="handleSelectedKeysChange"
        @dragstart="handleTreeDragStart"
        @dragend="handleTreeDragEnd"
        @dragenter="handleTreeDragEnter"
        @dragleave="handleTreeDragLeave"
        @dragover="handleTreeDragOver"
        @drop="handleTreeDrop"
        style="width: 100%; height: 100%; min-height: 0;"
        :scrollbar-props="{ trigger: 'none' }"
        :render-prefix="renderPrefix"
        :render-label="renderLabel"
      />
    </div>

    <n-dropdown
      placement="bottom-start"
      trigger="manual"
      :show="showContextMenu"
      :x="menuX"
      :y="menuY"
      :options="menuOptions"
      @clickoutside="handleClickOutside"
      @select="handleMenuSelect"
    />

    <n-modal
      v-model:show="showFolderPicker"
      preset="card"
      title="保存会话"
      style="width: 420px;"
      :bordered="false"
      :mask-closable="false"
    >
      <div class="folder-picker-content">
        <div class="folder-tree-header">
          <span>选择文件夹：</span>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button size="small" tertiary circle @click="openNewFolderDialog">
                <template #icon>
                  <n-icon :component="CreateOutline" size="14" />
                </template>
              </n-button>
            </template>
            新建文件夹
          </n-tooltip>
        </div>
        <n-tree
          class="session-tree__picker-list"
          block-line
          expand-on-click
          :data="treeData"
          :node-props="folderNodeProps"
          v-model:expanded-keys="folderExpandedKeys"
          v-model:selected-keys="selectedFolderKeys"
          style="max-height: 260px; overflow-y: auto;"
          :render-prefix="renderPrefix"
          :render-label="renderLabel"
        />
        <div class="session-name-input">
          <span>会话名称：</span>
          <n-input v-model:value="newSessionName" placeholder="请输入会话名称（不含扩展名）" autofocus />
        </div>
      </div>
      <template #footer>
        <div class="modal-footer">
          <n-button @click="showFolderPicker = false">取消</n-button>
          <n-button type="primary" @click="saveSessionInSelectedFolder" :disabled="!newSessionName.trim()">
            保存
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, reactive, h, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import path from 'path-browserify'
import { FileTrayFullOutline, Folder, FolderOpenOutline, RefreshOutline, CreateOutline, TrashOutline } from '@vicons/ionicons5'
import { NIcon, NTree, NDropdown, useMessage, useDialog, NInput, NButton, NModal, NTooltip, NAlert, NSpin } from 'naive-ui'
import {
  createDirectory,
  writeFile,
  listDirectory,
  listDirectoryWithStats,
  exists,
  stat,
  deleteItem,
  moveItem,
  openInFileManager,
  describeFileOperationsError
} from '@/utils/fileOperations'
import { buildChatSessionAssetsDirectory, isChatSessionAssetsDirectoryPath } from '@/utils/chatMediaAssets.js'
import { resolveChatSessionCreatedTimeMs } from '@/utils/chatSessionCreatedTime.js'
import { readSessionJsonFile } from '@/utils/sessionFileJson.js'

const props = defineProps({
  root: {
    type: String,
    default: 'session'
  },
  theme: {
    type: String,
    default: 'light'
  }
})

const emit = defineEmits(['select', 'saved', 'rename', 'delete', 'cleanup-auto-sessions'])

const message = useMessage()
const dialog = useDialog()

const treeData = ref([])
const expandedKeys = ref([])
const selectedKeys = ref([])
const loadedPaths = new Set()
const refreshing = ref(false)
const runtimeIssue = ref('')
const directoryLoadState = reactive({
  active: false,
  path: '',
  processed: 0,
  total: 0
})
const directoryLoadingLabel = computed(() => {
  if (directoryLoadState.total > 0) return '正在整理会话列表'
  return '正在扫描会话目录'
})
const directoryLoadPromises = new Map()
let activeDirectoryLoadCount = 0
let pendingRefreshRequested = false
let pendingRefreshSilent = true
let refreshPromise = null

const showContextMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const currentNode = ref(null)
const draggingSourcePath = ref('')
const dropTargetPath = ref('')
const isDropRootTarget = computed(() => normalizeTreePath(dropTargetPath.value) === normalizeTreePath(props.root))

const showFolderPicker = ref(false)
const folderExpandedKeys = ref([])
const selectedFolderKeys = ref([props.root])
const newSessionName = ref('')

const pendingPayload = ref(null)
const pendingSaveOptions = ref({})

const TIMED_TASK_DIR_NAME = '定时任务'
const AUTO_CHAT_DIR_NAME = '历史会话'

const SESSION_META_CACHE_MAX_ENTRIES = 2000
const sessionFileMetaCache = new Map()

const protectedSystemDirs = computed(() => [
  `${props.root}/${TIMED_TASK_DIR_NAME}`,
  `${props.root}/${AUTO_CHAT_DIR_NAME}`
])

function normalizeTreePath(p) {
  return String(p || '').trim().replace(/\\/g, '/')
}

function buildSessionFileMetaCacheVersion(statInfo) {
  const size = Number(statInfo?.size)
  const mtimeMs = statTimeMs(statInfo)
  const hasSize = Number.isFinite(size)
  const hasMtime = Number.isFinite(mtimeMs) && mtimeMs > 0
  if (!hasSize && !hasMtime) return ''
  return `${hasSize ? size : '?'}:${hasMtime ? mtimeMs : 0}`
}

function getCachedSessionFileMeta(entryPath, statInfo) {
  const normalizedPath = normalizeTreePath(entryPath)
  if (!normalizedPath) return null
  const version = buildSessionFileMetaCacheVersion(statInfo)
  if (!version) return null
  const cached = sessionFileMetaCache.get(normalizedPath)
  if (!cached || cached.version !== version || !cached.value) return null
  sessionFileMetaCache.delete(normalizedPath)
  sessionFileMetaCache.set(normalizedPath, cached)
  return { ...cached.value }
}

function setCachedSessionFileMeta(entryPath, statInfo, value) {
  const normalizedPath = normalizeTreePath(entryPath)
  if (!normalizedPath || !value || typeof value !== 'object') return value
  const version = buildSessionFileMetaCacheVersion(statInfo)
  if (!version) return value
  if (sessionFileMetaCache.has(normalizedPath)) sessionFileMetaCache.delete(normalizedPath)
  sessionFileMetaCache.set(normalizedPath, {
    version,
    value: { ...value }
  })
  while (sessionFileMetaCache.size > SESSION_META_CACHE_MAX_ENTRIES) {
    const oldestKey = sessionFileMetaCache.keys().next().value
    if (!oldestKey) break
    sessionFileMetaCache.delete(oldestKey)
  }
  return value
}

function invalidateSessionFileMetaCacheTree(targetPath) {
  const normalizedPath = normalizeTreePath(targetPath)
  if (!normalizedPath) return
  for (const cacheKey of [...sessionFileMetaCache.keys()]) {
    if (cacheKey === normalizedPath || cacheKey.startsWith(`${normalizedPath}/`)) {
      sessionFileMetaCache.delete(cacheKey)
    }
  }
}

function renameSessionFileMetaCacheTree(oldBase, newBase) {
  const normalizedOldBase = normalizeTreePath(oldBase)
  const normalizedNewBase = normalizeTreePath(newBase)
  if (!normalizedOldBase || !normalizedNewBase || normalizedOldBase === normalizedNewBase) return
  const movedEntries = []
  for (const [cacheKey, cacheValue] of sessionFileMetaCache.entries()) {
    if (cacheKey === normalizedOldBase || cacheKey.startsWith(`${normalizedOldBase}/`)) {
      movedEntries.push([`${normalizedNewBase}${cacheKey.slice(normalizedOldBase.length)}`, cacheValue])
      sessionFileMetaCache.delete(cacheKey)
    }
  }
  movedEntries.forEach(([nextKey, cacheValue]) => {
    sessionFileMetaCache.set(nextKey, cacheValue)
  })
}

function isPathInside(target, base) {
  const path = normalizeTreePath(target)
  const root = normalizeTreePath(base)
  return !!path && !!root && (path === root || path.startsWith(`${root}/`))
}

function isProtectedSystemDir(p) {
  const path = normalizeTreePath(p)
  if (!path) return false
  return protectedSystemDirs.value.some((dir) => path === normalizeTreePath(dir))
}

function isInsideProtectedSystemDir(p) {
  const path = normalizeTreePath(p)
  if (!path) return false
  return protectedSystemDirs.value.some((dir) => isPathInside(path, dir))
}

function isProtectedPath(p) {
  return isProtectedSystemDir(p)
}

function isJsonSessionPath(p) {
  return String(p || '').trim().toLowerCase().endsWith('.json')
}

async function readDeletedSessionPayload(p) {
  if (!isJsonSessionPath(p)) return null
  try {
    const parsed = await readSessionJsonFile(p)
    return parsed.ok ? parsed.value : null
  } catch {
    return null
  }
}

async function collectDeletedSessionPayloads(p) {
  const startPath = String(p || '').trim()
  if (!startPath) return []

  const payloads = []

  async function walk(entryPath) {
    if (isChatSessionAssetsDirectoryPath(entryPath)) return

    try {
      const statInfo = await stat(entryPath)
      if (statInfo?.isDirectory?.()) {
        const entries = await listDirectory(entryPath).catch(() => [])
        for (const entry of entries) await walk(entry)
        return
      }
    } catch {
      // If stat fails, still try to read it as a session file.
    }

    const payload = await readDeletedSessionPayload(entryPath)
    if (payload) payloads.push({ path: entryPath, payload })
  }

  await walk(startPath)
  return payloads
}

async function moveSessionAssetDirectoryForRename(oldPath, newPath) {
  const from = buildChatSessionAssetsDirectory(oldPath)
  const to = buildChatSessionAssetsDirectory(newPath)
  if (!from || !to || from === to) return
  try {
    if (!(await exists(from))) return
    await moveItem(from, to, { overwrite: true })
  } catch (err) {
    message.warning('会话资源目录移动失败：' + (err?.message || String(err)))
  }
}

function removeTreeNodeByPath(targetPath) {
  const normalized = normalizeTreePath(targetPath)
  return !!detachTreeNodeByPath(normalized)
}

function clearTreeStateForRemovedPath(targetPath) {
  const normalized = normalizeTreePath(targetPath)
  if (!normalized) return
  invalidateSessionFileMetaCacheTree(normalized)
  selectedKeys.value = selectedKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`))
  selectedFolderKeys.value = selectedFolderKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`))
  expandedKeys.value = expandedKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`))
  folderExpandedKeys.value = folderExpandedKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`))
  for (const loadedPath of [...loadedPaths]) {
    if (loadedPath === normalized || String(loadedPath || '').startsWith(`${normalized}/`)) {
      loadedPaths.delete(loadedPath)
    }
  }
}

function detachTreeNodeByPath(targetPath, options = {}) {
  const normalized = normalizeTreePath(targetPath)
  if (!normalized || normalized === props.root) return null
  const parentPath = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : props.root
  let detached = null
  if (parentPath === props.root) {
    const current = Array.isArray(treeData.value) ? [...treeData.value] : []
    const next = []
    current.forEach((node) => {
      if (node?.key === normalized && !detached) detached = node
      else next.push(node)
    })
    if (detached) treeData.value = next
  } else {
    const parentNode = findNodeByKey(treeData.value, parentPath)
    if (!parentNode || !Array.isArray(parentNode.children)) return null
    const next = []
    parentNode.children.forEach((node) => {
      if (node?.key === normalized && !detached) detached = node
      else next.push(node)
    })
    if (detached) parentNode.children = next
  }
  if (!detached) return null
  if (!options.preserveState) clearTreeStateForRemovedPath(normalized)
  return detached
}

function getPathDepth(p) {
  const parts = String(p || '')
    .split('/')
    .filter(Boolean)
  return parts.length
}

function listAncestorDirs(filePath) {
  const p = String(filePath || '').trim()
  if (!p) return []
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= 1) return []
  const dirs = []
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join('/')
    dirs.push(dir)
  }
  return dirs
}

async function ensureRootReady() {
  const root = String(props.root || '').trim()
  if (!root) throw new Error('缺少根目录')
  const ok = await exists(root)
  if (!ok) await createDirectory(root)
}

onMounted(async () => {
  try {
    window.addEventListener('sessionFilesChanged', handleExternalSessionFilesChanged)
  } catch {
    // ignore
  }

  try {
    await ensureRootReady()
    await loadDirectory(props.root, null)
    runtimeIssue.value = ''
  } catch (err) {
    runtimeIssue.value = describeFileOperationsError(err, '会话功能')
    message.error(runtimeIssue.value)
  }
})

onBeforeUnmount(() => {
  try {
    window.removeEventListener('sessionFilesChanged', handleExternalSessionFilesChanged)
  } catch {
    // ignore
  }
})

function handleExternalSessionFilesChanged(e) {
  const rootPath = String(e?.detail?.rootPath || '').trim()
  if (rootPath && rootPath !== props.root) return
  void applyExternalTreeChanges(e?.detail)
}

async function refreshTree(options = {}) {
  const silent = !!options.silent

  if (refreshPromise) {
    pendingRefreshRequested = true
    pendingRefreshSilent = pendingRefreshSilent && silent
    return refreshPromise
  }

  refreshPromise = (async () => {
    refreshing.value = true

  try {
    await ensureRootReady()

    const keepExpanded = Array.isArray(expandedKeys.value) ? [...expandedKeys.value] : []
    const keepFolderExpanded = Array.isArray(folderExpandedKeys.value) ? [...folderExpandedKeys.value] : []
    const keepSelected = Array.isArray(selectedKeys.value) ? [...selectedKeys.value] : []
    const keepSelectedFolder = Array.isArray(selectedFolderKeys.value) ? [...selectedFolderKeys.value] : []

    loadedPaths.clear()
    runtimeIssue.value = ''
    await loadDirectory(props.root, null)

    const allExpanded = Array.from(new Set([...keepExpanded, ...keepFolderExpanded]))
    const sortedExpanded = allExpanded
      .filter((k) => typeof k === 'string' && k)
      .sort((a, b) => getPathDepth(a) - getPathDepth(b))

    for (const key of sortedExpanded) {
      if (loadedPaths.has(key)) continue
      const node = findNodeByKey(treeData.value, key)
      if (node && node.children && node.children.length === 0) {
        await loadDirectory(key, node)
      }
    }

    expandedKeys.value = uniqueStrings(keepExpanded)
    folderExpandedKeys.value = uniqueStrings(keepFolderExpanded)

    const folderPath = String(keepSelectedFolder[0] || '').trim()
    if (folderPath) {
      await selectFolderPath(folderPath)
    }

    const selectedPath = String(keepSelected[0] || '').trim()
    if (selectedPath) {
      await selectPath(selectedPath)
    }

    if (!silent) message.success('目录已刷新')
  } catch (err) {
    runtimeIssue.value = describeFileOperationsError(err, '会话功能')
    message.error('刷新目录失败：' + runtimeIssue.value)
  } finally {
    refreshing.value = false
    if (pendingRefreshRequested) {
      const nextSilent = pendingRefreshSilent
      pendingRefreshRequested = false
      pendingRefreshSilent = true
      refreshPromise = null
      return refreshTree({ silent: nextSilent })
    }
  }

  return null
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

function handleClickOutside() {
  showContextMenu.value = false
}

const menuOptions = computed(() => [
  {
    label: '在文件管理器中打开',
    key: 'openInFileManager',
    icon: () => h(NIcon, null, { default: () => h(FolderOpenOutline) })
  },
  {
    type: 'divider'
  },
  {
    label: '重命名',
    key: 'rename',
    icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
    disabled: !currentNode.value || isProtectedPath(currentNode.value?.key)
  },
  {
    label: '删除',
    key: 'delete',
    icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
    disabled: !currentNode.value || isProtectedPath(currentNode.value?.key)
  }
])

async function handleMenuSelect(key) {
  showContextMenu.value = false
  const node = currentNode.value
  if (key === 'openInFileManager') {
    await openNodeInFileManager(node)
    return
  }
  if (!node) return
  if (key === 'rename') await handleRenameNode(node)
  if (key === 'delete') await deleteNode(node)
}

watch(expandedKeys, async (newKeys, oldKeys) => {
  const newlyExpanded = newKeys.filter((key) => !oldKeys.includes(key))
  for (const key of newlyExpanded) {
    if (loadedPaths.has(key)) continue
    const node = findNodeByKey(treeData.value, key)
    if (node && node.children && node.children.length === 0) {
      await loadDirectory(key, node)
    }
  }
})

watch(folderExpandedKeys, async (newKeys, oldKeys) => {
  const newlyExpanded = newKeys.filter((key) => !oldKeys.includes(key))
  for (const key of newlyExpanded) {
    if (loadedPaths.has(key)) continue
    const node = findNodeByKey(treeData.value, key)
    if (node && node.children && node.children.length === 0) {
      await loadDirectory(key, node)
    }
  }
})

function findNodeByKey(nodes, key) {
  for (const node of nodes) {
    if (node.key === key) return node
    if (node.children) {
      const found = findNodeByKey(node.children, key)
      if (found) return found
    }
  }
  return null
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function parseTimeMs(value) {
  if (!value) return 0
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

function startOfLocalDayMs(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function formatTreeMetaDate(ms, options = {}) {
  if (!ms) return ''
  const withTime = options.withTime === true
  const d = new Date(ms)
  const today = startOfLocalDayMs(Date.now())
  const day = startOfLocalDayMs(ms)
  let dateLabel = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  if (day === today) dateLabel = '今天'
  else if (day === today - 24 * 60 * 60 * 1000) dateLabel = '昨天'
  if (!withTime) return dateLabel
  return `${dateLabel} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function displaySystemDirName(name) {
  return name
}

function stripGeneratedTimePrefix(name) {
  return String(name || '').replace(/^\d{8}-\d{6}-/, '').trim()
}

function isTimedTaskPath(entryPath, data = null) {
  const sourceType = String(data?.source?.type || '').trim()
  if (sourceType === 'timed_task') return true
  return protectedSystemDirs.value
    .filter((dir) => dir.endsWith(`/${TIMED_TASK_DIR_NAME}`))
    .some((dir) => isPathInside(entryPath, dir))
}

function isAutoChatPath(entryPath, data = null) {
  const sourceType = String(data?.source?.type || '').trim()
  if (sourceType === 'auto_chat_session') return true
  return protectedSystemDirs.value
    .filter((dir) => dir.endsWith(`/${AUTO_CHAT_DIR_NAME}`))
    .some((dir) => isPathInside(entryPath, dir))
}

function statTimeMs(statInfo) {
  const direct = Number(statInfo?.mtimeMs)
  if (Number.isFinite(direct) && direct > 0) return direct
  return parseTimeMs(statInfo?.mtime)
}

function statBirthTimeMs(statInfo) {
  const direct = Number(statInfo?.birthtimeMs)
  if (Number.isFinite(direct) && direct > 0) return direct
  return parseTimeMs(statInfo?.birthtime)
}

function parseSessionCreatedTimeMs(value) {
  return parseTimeMs(value)
}

function resolveSessionCreatedTimeMs(data, statInfo) {
  return resolveChatSessionCreatedTimeMs(data) || statBirthTimeMs(statInfo) || statTimeMs(statInfo)
}

function readSessionFileMeta(entryPath, statInfo) {
  const fileName = String(entryPath || '').split('/').pop() || ''
  const fallbackName = String(fileName || '').replace(/\.json$/i, '')
  const cachedMeta = getCachedSessionFileMeta(entryPath, statInfo)
  if (cachedMeta) return cachedMeta

  // 列表首屏只使用文件名和一次目录扫描返回的 stat 元数据。标题写入文件名，
  // 不需要为了侧栏展示读取并解析每一份完整会话 JSON。
  const timedTask = isTimedTaskPath(entryPath)
  const autoChat = isAutoChatPath(entryPath)
  const title = stripGeneratedTimePrefix(fallbackName)
  const timeMs = resolveSessionCreatedTimeMs(null, statInfo)

  const metaLabel = formatTreeMetaDate(timeMs)

  return setCachedSessionFileMeta(entryPath, statInfo, {
    label: title || fallbackName || '\u672a\u547d\u540d\u4f1a\u8bdd',
    metaLabel,
    sortTimeMs: timeMs,
    sessionKind: timedTask ? 'timed-task' : autoChat ? 'history-session' : 'session'
  })
}

function createDirectoryEntryStat(entry = {}) {
  return {
    size: Number(entry?.size || 0),
    mtimeMs: Number(entry?.mtimeMs || 0),
    ctimeMs: Number(entry?.ctimeMs || 0),
    birthtimeMs: Number(entry?.birthtimeMs || 0),
    isDirectory: () => entry?.isDirectory === true,
    isFile: () => entry?.isFile !== false
  }
}

async function mapWithConcurrency(items, concurrency, mapper, onProgress) {
  const list = Array.isArray(items) ? items : []
  const results = new Array(list.length)
  let cursor = 0
  let processed = 0

  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(list[index], index)
      processed += 1
      onProgress?.(processed, list.length)
    }
  }

  const workerCount = Math.min(list.length, Math.max(1, Number(concurrency) || 1))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

async function listDirectoryEntries(relativePath) {
  const enrichedEntries = await listDirectoryWithStats(relativePath)
  if (Array.isArray(enrichedEntries)) {
    directoryLoadState.total = enrichedEntries.length
    directoryLoadState.processed = enrichedEntries.length
    return enrichedEntries.map((entry) => ({
      path: String(entry?.path || '').replace(/\\/g, '/'),
      statInfo: createDirectoryEntryStat(entry)
    }))
  }

  const entries = await listDirectory(relativePath)
  directoryLoadState.total = entries.length
  directoryLoadState.processed = 0
  return mapWithConcurrency(
    entries,
    12,
    async (entry) => ({
      path: entry,
      statInfo: await stat(entry)
    }),
    (processed, total) => {
      if (processed === total || processed % 8 === 0) {
        directoryLoadState.processed = processed
      }
    }
  )
}

async function loadDirectoryInternal(relativePath, parentNode) {
  try {
    const entries = await listDirectoryEntries(relativePath)
    const children = entries.map(({ path: entry, statInfo }) => {
      if (isChatSessionAssetsDirectoryPath(entry)) return null

      const isDirectory = statInfo.isDirectory()
      const fileName = entry.split('/').pop()

      if (!isDirectory && !String(fileName || '').endsWith('.json')) return null

      const fileMeta = isDirectory ? null : readSessionFileMeta(entry, statInfo)
      const label = isDirectory ? displaySystemDirName(fileName) : fileMeta.label
      return {
        key: entry,
        label,
        metaLabel: fileMeta?.metaLabel || '',
        sortTimeMs: fileMeta?.sortTimeMs || 0,
        sessionKind: fileMeta?.sessionKind || '',
        isLeaf: !isDirectory,
        children: isDirectory ? [] : undefined
      }
    }).filter(Boolean)

    children.sort(compareTreeNodes)

    if (parentNode === null) treeData.value = children
    else parentNode.children = children

    loadedPaths.add(relativePath)
  } catch (err) {
    message.error('加载目录失败：' + (err?.message || String(err)))
  }
}

async function loadDirectory(relativePath, parentNode) {
  const normalizedPath = normalizeTreePath(relativePath)
  if (!normalizedPath) return
  const existing = directoryLoadPromises.get(normalizedPath)
  if (existing) return existing

  activeDirectoryLoadCount += 1
  directoryLoadState.active = true
  directoryLoadState.path = normalizedPath
  directoryLoadState.processed = 0
  directoryLoadState.total = 0

  const task = loadDirectoryInternal(normalizedPath, parentNode).finally(() => {
    directoryLoadPromises.delete(normalizedPath)
    activeDirectoryLoadCount = Math.max(0, activeDirectoryLoadCount - 1)
    if (activeDirectoryLoadCount === 0) {
      directoryLoadState.active = false
      directoryLoadState.path = ''
      directoryLoadState.processed = 0
      directoryLoadState.total = 0
    }
  })
  directoryLoadPromises.set(normalizedPath, task)
  return task
}

function nodeProps({ option }) {
  const normalizedOptionPath = normalizeTreePath(option.key)
  const isDropTarget = normalizedOptionPath && normalizeTreePath(dropTargetPath.value) === normalizedOptionPath
  return {
    class: isDropTarget ? 'is-drop-target' : '',
    onClick() {
      selectedKeys.value = [option.key]
    },
    onContextmenu(e) {
      e.preventDefault()
      e.stopPropagation()
      currentNode.value = option
      showContextMenu.value = false
      menuX.value = e.clientX
      menuY.value = e.clientY
      setTimeout(() => {
        showContextMenu.value = true
      }, 10)
    }
  }
}

function handleSelectedKeysChange(keys, _options, meta) {
  selectedKeys.value = uniqueStrings(Array.isArray(keys) ? keys : [])
  if (meta?.action !== 'select') return
  const selectedPath = String(selectedKeys.value[0] || '').trim()
  if (!selectedPath) return
  const selectedNode = findNodeByKey(treeData.value, selectedPath)
  if (selectedNode?.isLeaf) emit('select', selectedPath)
}

function handleTreeContextMenu(e) {
  e.preventDefault()
  currentNode.value = null
  showContextMenu.value = false
  menuX.value = e.clientX
  menuY.value = e.clientY
  setTimeout(() => {
    showContextMenu.value = true
  }, 10)
}

function handleTreeDragStart({ node }) {
  dropTargetPath.value = ''
  draggingSourcePath.value = normalizeTreePath(node?.key)
}

function handleTreeDragEnd() {
  draggingSourcePath.value = ''
  dropTargetPath.value = ''
}

function getDirectoryPathForNode(node) {
  const nodePath = String(node?.key || '').trim()
  if (!nodePath) return String(props.root || '').trim()
  if (!node?.isLeaf) return nodePath
  if (!nodePath.includes('/')) return String(props.root || '').trim()
  return nodePath.substring(0, nodePath.lastIndexOf('/'))
}

async function openNodeInFileManager(node) {
  try {
    await ensureRootReady()
    const targetDir = getDirectoryPathForNode(node)
    await openInFileManager(targetDir)
  } catch (err) {
    message.error('打开文件管理器失败：' + (err?.message || String(err)))
  }
}

function folderNodeProps({ option }) {
  const disabled = !option.children || isInsideProtectedSystemDir(option.key)
  return {
    disabled,
    onClick() {
      if (!disabled && option.children) selectedFolderKeys.value = [option.key]
    }
  }
}

function renderPrefix({ option }) {
  if (option.children) {
    const isExpanded = expandedKeys.value.includes(option.key) || folderExpandedKeys.value.includes(option.key)
    return h(NIcon, null, {
      default: () => (isExpanded ? h(FolderOpenOutline) : h(Folder))
    })
  }
  return h(NIcon, null, {
    default: () => h(FileTrayFullOutline)
  })
}

function renderLabel({ option }) {
  const labelText = typeof option.label === 'string' ? option.label : String(option.label ?? '')
  const metaText = String(option.metaLabel || '').trim()
  const title = labelText
  const metaColor = props.theme === 'dark' ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.86)'
  return h('span', {
    class: 'tree-node-label-wrap',
    title,
    style: {
      display: 'flex',
      alignItems: 'center',
      minWidth: '0',
      width: '100%',
      maxWidth: '100%',
      gap: metaText ? '10px' : '0'
    }
  }, [
    h('span', {
      class: 'tree-node-label',
      style: {
        display: 'block',
        flex: '1 1 auto',
        minWidth: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: '22px'
      }
    }, labelText),
    metaText
      ? h('span', {
          class: 'tree-node-meta',
          style: {
            display: 'block',
            flex: '0 0 auto',
            marginLeft: 'auto',
            maxWidth: '88px',
            minWidth: '0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '11px',
            lineHeight: '22px',
            color: metaColor
          }
        }, metaText)
      : null
  ])
}

function replacePathPrefix(targetPath, oldBase, newBase) {
  const t = String(targetPath || '')
  if (t === oldBase) return newBase
  if (t.startsWith(oldBase + '/')) return newBase + t.slice(oldBase.length)
  return t
}

function uniqueStrings(list) {
  return Array.from(new Set(Array.isArray(list) ? list : []))
}

function compareTreeNodes(a, b) {
  if (!!a?.isLeaf !== !!b?.isLeaf) return a?.isLeaf ? 1 : -1
  if (a?.isLeaf && b?.isLeaf) {
    const at = Number(a?.sortTimeMs || 0)
    const bt = Number(b?.sortTimeMs || 0)
    if (at !== bt) return bt - at
    return 0
  }
  return 0
}

function normalizeComparableTreeNode(node) {
  return {
    key: normalizeTreePath(node?.key),
    label: String(node?.label || ''),
    metaLabel: String(node?.metaLabel || ''),
    sortTimeMs: Number(node?.sortTimeMs || 0) || 0,
    sessionKind: String(node?.sessionKind || ''),
    isLeaf: !!node?.isLeaf
  }
}

function isSameComparableTreeNode(a, b) {
  const left = normalizeComparableTreeNode(a)
  const right = normalizeComparableTreeNode(b)
  return (
    left.key === right.key &&
    left.label === right.label &&
    left.metaLabel === right.metaLabel &&
    left.sortTimeMs === right.sortTimeMs &&
    left.sessionKind === right.sessionKind &&
    left.isLeaf === right.isLeaf
  )
}

function sortTreeChildren(children = []) {
  return [...children].sort((a, b) => {
    return compareTreeNodes(a, b)
  })
}

function createTreeNode(entryPath, isDirectory) {
  const normalizedPath = String(entryPath || '').trim().replace(/\\/g, '/')
  const fileName = normalizedPath.split('/').pop() || normalizedPath
  const now = Date.now()
  const label = isDirectory
    ? displaySystemDirName(fileName)
    : stripGeneratedTimePrefix(String(fileName || '').replace(/\.json$/i, ''))
  return {
    key: normalizedPath,
    label,
    metaLabel: isDirectory ? '' : formatTreeMetaDate(now),
    sortTimeMs: isDirectory ? 0 : now,
    isLeaf: !isDirectory,
    children: isDirectory ? [] : undefined
  }
}

function upsertTreeNode(parentPath, node) {
  const normalizedParentPath = String(parentPath || '').trim().replace(/\\/g, '/')
  const nextNode = node ? { ...node, key: normalizeTreePath(node.key) } : null
  if (!normalizedParentPath || !nextNode?.key) return null

  const existingNode = findNodeByKey(treeData.value, nextNode.key)
  if (existingNode && isSameComparableTreeNode(existingNode, nextNode)) {
    return existingNode
  }

  if (normalizedParentPath === props.root) {
    const existing = Array.isArray(treeData.value) ? [...treeData.value] : []
    const withoutCurrent = existing.filter((item) => item?.key !== nextNode.key)
    treeData.value = sortTreeChildren([...withoutCurrent, nextNode])
    loadedPaths.add(props.root)
    return findNodeByKey(treeData.value, nextNode.key)
  }

  const parentNode = findNodeByKey(treeData.value, normalizedParentPath)
  if (!parentNode || !Array.isArray(parentNode.children)) return null

  const existing = Array.isArray(parentNode.children) ? [...parentNode.children] : []
  const withoutCurrent = existing.filter((item) => item?.key !== nextNode.key)
  parentNode.children = sortTreeChildren([...withoutCurrent, nextNode])
  loadedPaths.add(normalizedParentPath)
  return findNodeByKey(treeData.value, nextNode.key)
}

function touchPath(entryPath, options = {}) {
  const normalizedPath = String(entryPath || '').trim().replace(/\\/g, '/')
  if (!normalizedPath) return null

  const parentPath = normalizedPath.includes('/')
    ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/'))
    : props.root
  const existingNode = findNodeByKey(treeData.value, normalizedPath)
  const now = Date.now()
  const fallbackLabel = stripGeneratedTimePrefix(
    String(normalizedPath.split('/').pop() || normalizedPath).replace(/\.json$/i, '')
  )
  const nextLabel = String(options.label || '').trim() || existingNode?.label || fallbackLabel
  const createdTimeMs = Number(options.createdTimeMs || 0)
  const nextSortTimeMs = existingNode?.sortTimeMs && createdTimeMs > 0
    ? Math.min(Number(existingNode.sortTimeMs || 0) || createdTimeMs, createdTimeMs)
    : Number(existingNode?.sortTimeMs || createdTimeMs || now)
  const nextNode = existingNode
    ? {
        ...existingNode,
        label: nextLabel,
        metaLabel: formatTreeMetaDate(nextSortTimeMs || now),
        sortTimeMs: nextSortTimeMs
      }
    : {
        ...createTreeNode(normalizedPath, false),
        label: nextLabel,
        metaLabel: formatTreeMetaDate(createdTimeMs || now),
        sortTimeMs: createdTimeMs || now
      }

  return upsertTreeNode(parentPath || props.root, nextNode)
}

function resolveCreatedTimeMsForPayload(payload) {
  if (!payload || typeof payload !== 'object') return 0
  return resolveSessionCreatedTimeMs(payload, null)
}

function updateTreeStateAfterPathChange(oldBase, newBase) {
  renameSessionFileMetaCacheTree(oldBase, newBase)
  expandedKeys.value = uniqueStrings(expandedKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)))
  folderExpandedKeys.value = uniqueStrings(folderExpandedKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)))
  selectedKeys.value = uniqueStrings(selectedKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)))
  selectedFolderKeys.value = uniqueStrings(selectedFolderKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)))
  const nextLoaded = new Set()
  for (const loadedPath of loadedPaths) {
    nextLoaded.add(replacePathPrefix(loadedPath, oldBase, newBase))
  }
  loadedPaths.clear()
  for (const loadedPath of nextLoaded) {
    loadedPaths.add(loadedPath)
  }
}

function updateNodeKeysRecursively(treeNode, oldBase, newBase) {
  if (!treeNode) return
  treeNode.key = replacePathPrefix(treeNode.key, oldBase, newBase)
  if (Array.isArray(treeNode.children)) {
    treeNode.children.forEach((child) => updateNodeKeysRecursively(child, oldBase, newBase))
  }
}

function pruneNestedPaths(paths, options = {}) {
  const normalized = Array.from(new Set((Array.isArray(paths) ? paths : [])
    .map((item) => normalizeTreePath(item))
    .filter(Boolean)))
  const descending = options.descending === true
  normalized.sort((a, b) => {
    const depthDiff = a.split('/').length - b.split('/').length
    return descending ? depthDiff * -1 : depthDiff
  })
  return normalized.filter((item, index) => {
    return !normalized.some((other, otherIndex) => {
      if (otherIndex === index || !other) return false
      return other !== item && item.startsWith(`${other}/`)
    })
  })
}

async function buildExternalTreeNode(entryPath) {
  const normalizedPath = normalizeTreePath(entryPath)
  if (!normalizedPath || normalizedPath === props.root || isChatSessionAssetsDirectoryPath(normalizedPath)) return null

  let statInfo = null
  try {
    statInfo = await stat(normalizedPath)
  } catch {
    return null
  }

  const isDirectory = !!statInfo?.isDirectory?.()
  const fileName = normalizedPath.split('/').pop()
  if (!isDirectory && !String(fileName || '').endsWith('.json')) return null

  const fileMeta = isDirectory ? null : await readSessionFileMeta(normalizedPath, statInfo)
  return {
    key: normalizedPath,
    label: isDirectory ? displaySystemDirName(fileName) : fileMeta.label,
    metaLabel: fileMeta?.metaLabel || '',
    sortTimeMs: fileMeta?.sortTimeMs || 0,
    sessionKind: fileMeta?.sessionKind || '',
    isLeaf: !isDirectory,
    children: isDirectory ? [] : undefined
  }
}

async function applyExternalAddedPath(entryPath) {
  const normalizedPath = normalizeTreePath(entryPath)
  if (!normalizedPath || normalizedPath === props.root || isChatSessionAssetsDirectoryPath(normalizedPath)) return false
  const parentPath = normalizedPath.includes('/') ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) : props.root
  if (parentPath !== props.root && !loadedPaths.has(parentPath)) return false
  const node = await buildExternalTreeNode(normalizedPath)
  if (!node) return false
  const inserted = upsertTreeNode(parentPath || props.root, node)
  if (!inserted) return false
  if (!node.isLeaf && (expandedKeys.value.includes(normalizedPath) || folderExpandedKeys.value.includes(normalizedPath))) {
    await loadDirectory(normalizedPath, inserted)
  }
  return true
}

function moveExistingTreeNode(oldPath, newPath, nodePatch = null) {
  const normalizedOldPath = normalizeTreePath(oldPath)
  const normalizedNewPath = normalizeTreePath(newPath)
  if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) return false
  const detached = detachTreeNodeByPath(normalizedOldPath, { preserveState: true })
  if (!detached) return false

  updateNodeKeysRecursively(detached, normalizedOldPath, normalizedNewPath)
  if (nodePatch && typeof nodePatch === 'object') {
    detached.label = String(nodePatch.label || detached.label || '')
    detached.metaLabel = String(nodePatch.metaLabel || detached.metaLabel || '')
    detached.sortTimeMs = Number(nodePatch.sortTimeMs || detached.sortTimeMs || 0) || 0
    detached.sessionKind = String(nodePatch.sessionKind || detached.sessionKind || '')
    detached.isLeaf = !!nodePatch.isLeaf
  }

  const parentPath = normalizedNewPath.includes('/') ? normalizedNewPath.substring(0, normalizedNewPath.lastIndexOf('/')) : props.root
  upsertTreeNode(parentPath || props.root, detached)
  updateTreeStateAfterPathChange(normalizedOldPath, normalizedNewPath)
  return true
}

async function applyExternalTreeChanges(detail = {}) {
  const addedPaths = pruneNestedPaths(detail?.addedPaths || [])
  const removedPaths = pruneNestedPaths(detail?.removedPaths || [])
  const totalRoots = addedPaths.length + removedPaths.length

  if (
    totalRoots === 0
    || addedPaths.includes(props.root)
    || removedPaths.includes(props.root)
    || totalRoots > 24
  ) {
    await refreshTree({ silent: true })
    return
  }

  if (addedPaths.length === 1 && removedPaths.length === 1) {
    const nextNode = await buildExternalTreeNode(addedPaths[0])
    const moved = moveExistingTreeNode(removedPaths[0], addedPaths[0], nextNode)
    if (moved) return
  }

  removedPaths
    .sort((a, b) => b.split('/').length - a.split('/').length)
    .forEach((targetPath) => {
      removeTreeNodeByPath(targetPath)
    })

  for (const targetPath of addedPaths.sort((a, b) => a.split('/').length - b.split('/').length)) {
    await applyExternalAddedPath(targetPath)
  }
}

async function refreshTreeBranch(targetPath, force = false) {
  const normalizedPath = normalizeTreePath(targetPath)
  if (!normalizedPath) return false

  if (normalizedPath === props.root) {
    await loadDirectory(props.root, null)
    return true
  }

  const node = findNodeByKey(treeData.value, normalizedPath)
  if (!node) return false
  if (!force && !loadedPaths.has(normalizedPath)) return false

  await loadDirectory(normalizedPath, node)
  return true
}

function allowTreeDrop({ node, dropPosition }) {
  if (!node) return true
  if (dropPosition === 'inside') return !node.isLeaf
  return true
}

function resolveDropTargetDirectory(targetNode, dropPosition) {
  if (!targetNode) return props.root
  if (dropPosition === 'inside') {
    return targetNode.isLeaf ? '' : normalizeTreePath(targetNode.key)
  }
  return getDirectoryPathForNode(targetNode)
}

function isPathEqualOrInside(targetPath, basePath) {
  const target = normalizeTreePath(targetPath)
  const base = normalizeTreePath(basePath)
  if (!target || !base) return false
  return target === base || target.startsWith(`${base}/`)
}

async function moveSessionEntryToPath(oldPathRaw, newPathRaw) {
  const oldPath = normalizeTreePath(oldPathRaw)
  const newPath = normalizeTreePath(newPathRaw)
  if (!oldPath || !newPath || oldPath === newPath) return false

  const movingNode = findNodeByKey(treeData.value, oldPath)
  const isDirectory = !!movingNode && !movingNode.isLeaf
  const targetParent = newPath.includes('/') ? newPath.substring(0, newPath.lastIndexOf('/')) : props.root

  if (isProtectedSystemDir(oldPath) || isInsideProtectedSystemDir(oldPath)) {
    message.warning('系统目录及其内容不支持拖拽移动')
    return false
  }
  if (isProtectedSystemDir(targetParent) || isInsideProtectedSystemDir(targetParent)) {
    message.warning('不能移动到系统目录中')
    return false
  }
  if (isDirectory && isPathEqualOrInside(newPath, oldPath)) {
    message.warning('不能把文件夹移动到自身或其子目录中')
    return false
  }
  if (await exists(newPath)) {
    message.warning('目标位置已存在同名文件或文件夹')
    return false
  }

  await moveItem(oldPath, newPath)
  if (movingNode?.isLeaf) {
    await moveSessionAssetDirectoryForRename(oldPath, newPath)
  }

  const nextNode = await buildExternalTreeNode(newPath)
  const oldParentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : props.root
  const targetParentPath = newPath.includes('/') ? newPath.substring(0, newPath.lastIndexOf('/')) : props.root
  moveExistingTreeNode(oldPath, newPath, nextNode)
  if (!findNodeByKey(treeData.value, newPath)) {
    await refreshTreeBranch(targetParentPath, true)
  }
  if (findNodeByKey(treeData.value, oldPath)) {
    await refreshTreeBranch(oldParentPath)
  }
  emit('rename', oldPath, newPath)
  return true
}

function clearDropTarget() {
  dropTargetPath.value = ''
}

function setDropTargetFromNode(node) {
  const path = normalizeTreePath(node?.key)
  if (!path) return
  dropTargetPath.value = path
}

async function handleTreeDrop({ node, dragNode, dropPosition }) {
  const sourcePath = normalizeTreePath(dragNode?.key)
  const targetDir = resolveDropTargetDirectory(node, dropPosition)
  clearDropTarget()
  if (!sourcePath || !targetDir) return

  const nextPath = normalizeTreePath(`${targetDir}/${path.basename(sourcePath)}`)
  if (!nextPath || nextPath === sourcePath) return

  try {
    await moveSessionEntryToPath(sourcePath, nextPath)
  } catch (err) {
    message.error('移动失败：' + (err?.message || String(err)))
  }
}

function handleTreeDragEnter({ node }) {
  if (!draggingSourcePath.value) return
  setDropTargetFromNode(node)
}

function handleTreeDragOver({ node }) {
  if (!draggingSourcePath.value) return
  setDropTargetFromNode(node)
}

function handleTreeDragLeave({ node, event }) {
  if (!draggingSourcePath.value) return
  if (event?.currentTarget !== event?.target) return
  const path = normalizeTreePath(node?.key)
  if (path && normalizeTreePath(dropTargetPath.value) === path) {
    clearDropTarget()
  }
}

function handleBlankAreaDragOver(event) {
  const target = event?.target
  if (target?.closest?.('.n-tree-node, .n-tree-node-content')) return
  if (!draggingSourcePath.value) return
  dropTargetPath.value = normalizeTreePath(props.root)
}

function handleBlankAreaDragLeave(event) {
  if (event?.currentTarget !== event?.target) return
  if (isDropRootTarget.value) {
    clearDropTarget()
  }
}

async function handleBlankAreaDrop(event) {
  const target = event?.target
  if (target?.closest?.('.n-tree-node, .n-tree-node-content')) return

  const sourcePath = normalizeTreePath(draggingSourcePath.value)
  if (!sourcePath) return

  const nextPath = normalizeTreePath(`${props.root}/${path.basename(sourcePath)}`)
  if (!nextPath || nextPath === sourcePath) return

  try {
    await moveSessionEntryToPath(sourcePath, nextPath)
  } catch (err) {
    message.error('移动失败：' + (err?.message || String(err)))
  } finally {
    draggingSourcePath.value = ''
    clearDropTarget()
  }
}

async function handleRenameNode(node) {
  try {
    await ensureRootReady()
  } catch (err) {
    message.error('初始化失败：' + (err?.message || String(err)))
    return
  }

  const isFile = !!node?.isLeaf
  const oldPath = String(node?.key || '').trim()
  if (!oldPath) return
  if (isProtectedPath(oldPath)) {
    message.warning('系统目录不支持重命名')
    return
  }

  const parentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : props.root
  const inputValue = ref(String(node?.label || ''))

  dialog.create({
    title: '重命名',
    content: () =>
      h('div', [
        h('span', null, '新名称：'),
        h(NInput, {
          value: inputValue.value,
          onUpdateValue: (val) => {
            inputValue.value = val
          },
          autofocus: true,
          placeholder: isFile ? '请输入新名称（不含扩展名）' : '请输入新文件夹名称',
          style: 'margin-top: 8px; width: 100%;'
        })
      ]),
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      const newName = String(inputValue.value || '').trim()
      if (!newName) {
        message.warning('名称不能为空')
        return false
      }

      const newPath = isFile
        ? `${parentPath}/${newName.endsWith('.json') ? newName : `${newName}.json`}`
        : `${parentPath}/${newName}`

      if (oldPath === newPath) return true
      if (await exists(newPath)) {
        message.warning('已存在同名文件或文件夹')
        return false
      }

      try {
        await moveSessionEntryToPath(oldPath, newPath)
        message.success('重命名成功')
        return true
      } catch (err) {
        message.error('重命名失败：' + (err?.message || String(err)))
        return false
      }
    }
  })
}

async function renameNode(node) {
  try {
    await ensureRootReady()
  } catch (err) {
    message.error('初始化失败：' + (err?.message || String(err)))
    return
  }

  const isFile = !!node.isLeaf
  const oldPath = String(node.key || '').trim()
  if (!oldPath) return
  if (isProtectedPath(oldPath)) {
    message.warning('系统目录不支持重命名')
    return
  }

  const parentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : props.root
  const oldName = String(node.label || '')
  const inputValue = ref(oldName)

  dialog.create({
    title: '重命名',
    content: () =>
      h('div', [
        h('span', null, '新名称：'),
        h(NInput, {
          value: inputValue.value,
          onUpdateValue: (val) => {
            inputValue.value = val
          },
          autofocus: true,
          placeholder: isFile ? '请输入新名称（不含扩展名）' : '请输入新文件夹名称',
          style: 'margin-top: 8px; width: 100%;'
        })
      ]),
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      const newName = inputValue.value?.trim()
      if (!newName) {
        message.warning('名称不能为空')
        return false
      }

      const newPath = isFile
        ? `${parentPath}/${newName.endsWith('.json') ? newName : `${newName}.json`}`
        : `${parentPath}/${newName}`

      if (oldPath === newPath) return true

      const targetExists = await exists(newPath)
      if (targetExists) {
        message.warning('已存在同名文件/文件夹')
        return false
      }

      try {
        await moveItem(oldPath, newPath)
        if (isFile) await moveSessionAssetDirectoryForRename(oldPath, newPath)
        message.success('重命名成功')

        if (selectedKeys.value.includes(oldPath)) selectedKeys.value = [newPath]
        if (!isFile) updateTreeStateAfterPathChange(oldPath, newPath)

        await refreshTree({ silent: true })
        emit('rename', oldPath, newPath)
        return true
      } catch (err) {
        message.error('重命名失败：' + (err?.message || String(err)))
        return false
      }
    }
  })
}

async function deleteNode(node) {
  try {
    await ensureRootReady()
  } catch (err) {
    message.error('初始化失败：' + (err?.message || String(err)))
    return
  }

  const protectedPath = String(node?.key || '').trim()
  if (isProtectedSystemDir(protectedPath)) {
    message.warning('系统目录不支持删除')
    return
  }

  const isFolder = node && node.children !== undefined
  const label = String(node?.label || '')
  let confirmMessage = `确定删除“${label}”吗？此操作不可撤销。`

  if (isFolder) {
    try {
      const entries = await listDirectory(node.key)
      if (Array.isArray(entries) && entries.length) {
        confirmMessage = '该文件夹包含内容，确定删除吗？其所有内容将被永久移除。'
      }
    } catch {
      // ignore
    }
  }

  dialog.warning({
    title: '删除',
    content: confirmMessage,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const p = String(node?.key || '').trim()
        if (!p) return
        const deletedSessionPayloads = await collectDeletedSessionPayloads(p)
        await deleteItem(p)
        message.success('删除成功')

        const selected = selectedKeys.value?.[0]
        if (selected && (selected === p || selected.startsWith(p + '/'))) {
          selectedKeys.value = []
        }

        expandedKeys.value = (expandedKeys.value || []).filter((k) => k !== p && !String(k || '').startsWith(p + '/'))
        folderExpandedKeys.value = (folderExpandedKeys.value || []).filter(
          (k) => k !== p && !String(k || '').startsWith(p + '/')
        )
        selectedFolderKeys.value = (selectedFolderKeys.value || []).filter(
          (k) => k !== p && !String(k || '').startsWith(p + '/')
        )

        emit('delete', p, deletedSessionPayloads)
        await refreshTree({ silent: true })
      } catch (err) {
        message.error('删除失败：' + (err?.message || String(err)))
      }
    }
  })
}

async function openNewFolderDialog() {
  const parentPath = selectedFolderKeys.value[0] || props.root
  if (isInsideProtectedSystemDir(parentPath)) {
    message.warning('系统目录不支持新建子文件夹')
    return
  }
  const inputValue = ref('')

  dialog.create({
    title: '新建文件夹',
    content: () =>
      h('div', [
        h('span', null, '文件夹名称：'),
        h(NInput, {
          value: inputValue.value,
          onUpdateValue: (val) => {
            inputValue.value = val
          },
          autofocus: true,
          placeholder: '请输入文件夹名称',
          style: 'margin-top: 8px; width: 100%;'
        })
      ]),
    positiveText: '创建',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await ensureRootReady()
      } catch (err) {
        message.error('初始化失败：' + (err?.message || String(err)))
        return false
      }
      const name = inputValue.value?.trim()
      if (!name) {
        message.warning('名称不能为空')
        return false
      }

      const newPath = `${parentPath}/${name}`
      const folderExists = await exists(newPath)
      if (folderExists) {
        message.warning('已存在同名文件夹')
        return false
      }

      try {
        await createDirectory(newPath)
        folderExpandedKeys.value = uniqueStrings([...folderExpandedKeys.value, parentPath])
        expandedKeys.value = uniqueStrings([...expandedKeys.value, parentPath])
        upsertTreeNode(parentPath, createTreeNode(newPath, true))
        await selectFolderPath(newPath)
        void refreshTree({ silent: true })
        message.success('文件夹创建成功')
        return true
      } catch (err) {
        message.error('创建失败：' + (err?.message || String(err)))
        return false
      }
    }
  })
}

async function openSaveSessionModal(payload, options = {}) {
  pendingPayload.value = payload
  pendingSaveOptions.value = options && typeof options === 'object' ? options : {}

  const defaultFolder = String(options?.defaultFolder || '').trim()
  const safeDefaultFolder = defaultFolder && !isInsideProtectedSystemDir(defaultFolder) ? defaultFolder : props.root
  selectedFolderKeys.value = [safeDefaultFolder]

  newSessionName.value = String(options?.defaultName || '').trim()

  showFolderPicker.value = true
  await refreshTree({ silent: true })
  await nextTick()
  await selectFolderPath(safeDefaultFolder)
}

async function selectPath(filePath) {
  const p = String(filePath || '').trim().replace(/\\/g, '/')
  if (!p || (p !== props.root && !p.startsWith(`${props.root}/`))) return
  if (isChatSessionAssetsDirectoryPath(p)) return

  const ancestors = listAncestorDirs(p).filter((dir) => dir !== props.root)
  if (ancestors.length) {
    expandedKeys.value = uniqueStrings([...expandedKeys.value, ...ancestors])
    folderExpandedKeys.value = uniqueStrings([...folderExpandedKeys.value, ...ancestors])

    for (const dir of ancestors) {
      if (loadedPaths.has(dir)) continue
      const node = findNodeByKey(treeData.value, dir)
      if (node && node.children && node.children.length === 0) {
        await loadDirectory(dir, node)
      }
    }
  }

  selectedKeys.value = [p]
}

async function selectFolderPath(folderPath) {
  const p = String(folderPath || '').trim().replace(/\\/g, '/')
  if (!p || (p !== props.root && !p.startsWith(`${props.root}/`))) return
  if (isChatSessionAssetsDirectoryPath(p)) return
  if (isInsideProtectedSystemDir(p)) return

  const ancestors = listAncestorDirs(p).filter((dir) => dir !== props.root)
  if (ancestors.length) {
    expandedKeys.value = uniqueStrings([...expandedKeys.value, ...ancestors])
    folderExpandedKeys.value = uniqueStrings([...folderExpandedKeys.value, ...ancestors])

    for (const dir of ancestors) {
      if (loadedPaths.has(dir)) continue
      const node = findNodeByKey(treeData.value, dir)
      if (node && node.children && node.children.length === 0) {
        await loadDirectory(dir, node)
      }
    }
  }

  selectedFolderKeys.value = [p]
}

async function saveSessionInSelectedFolder() {
  try {
    await ensureRootReady()
  } catch (err) {
    message.error('初始化失败：' + (err?.message || String(err)))
    return
  }
  const folderPath = selectedFolderKeys.value[0] || props.root
  if (isInsideProtectedSystemDir(folderPath)) {
    message.warning('系统目录不支持手动保存')
    return
  }
  const name = newSessionName.value.trim()
  if (!name) {
    message.warning('会话名称不能为空')
    return
  }

  const fileName = name.endsWith('.json') ? name : `${name}.json`
  const fullPath = `${folderPath}/${fileName}`

  if (!pendingPayload.value) {
    message.warning('没有可保存的会话内容')
    return
  }

  const fileExists = await exists(fullPath)
  if (fileExists) {
    message.warning('已存在同名会话')
    return
  }

  try {
    const preparePayload = pendingSaveOptions.value?.preparePayload
    const preparedPayload = typeof preparePayload === 'function'
      ? await preparePayload(fullPath, { name, folderPath })
      : pendingPayload.value
    const payload = JSON.parse(JSON.stringify(preparedPayload || {}))
    payload.title = payload.title || name
    payload.createdAt = payload.createdAt || new Date().toISOString()
    payload.savedAt = new Date().toISOString()
    const json = JSON.stringify(payload, null, 2)

    await writeFile(fullPath, json)

    showFolderPicker.value = false
    pendingPayload.value = null
    pendingSaveOptions.value = {}
    newSessionName.value = ''

    const dirs = listAncestorDirs(fullPath).filter((d) => d !== props.root)
    const nextExpanded = Array.from(new Set([...(expandedKeys.value || []), ...dirs, folderPath]))
    const nextFolderExpanded = Array.from(new Set([...(folderExpandedKeys.value || []), ...dirs, folderPath]))
    expandedKeys.value = nextExpanded
    folderExpandedKeys.value = nextFolderExpanded

    touchPath(fullPath, {
      label: name,
      createdTimeMs: resolveCreatedTimeMsForPayload(payload)
    })
    await selectPath(fullPath)
    emit('saved', fullPath)
    message.success('会话已保存')
  } catch (err) {
    message.error('保存失败：' + (err?.message || String(err)))
  }
}

defineExpose({
  refreshTree,
  openSaveSessionModal,
  selectPath,
  touchPath,
  clearSelection() {
    selectedKeys.value = []
  }
})
</script>

<style scoped>
.session-tree {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  padding: 4px 2px 2px;
  box-sizing: border-box;
  overflow: hidden;
}

.session-tree.is-dark {
  color: rgba(226, 232, 240, 0.94);
}

.session-tree__toolbar {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-bottom: 10px;
}

.session-tree__refresh,
.session-tree__cleanup {
  box-shadow: 0 10px 22px rgba(24, 43, 48, 0.08);
  border: 1px solid rgba(87, 126, 139, 0.14);
}

.session-tree.is-dark .session-tree__refresh,
.session-tree.is-dark .session-tree__cleanup {
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.28);
  border-color: rgba(148, 163, 184, 0.14);
}

.session-tree__scroll,
.session-tree__picker-list {
  border-radius: 16px;
  padding: 4px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.48), rgba(246, 248, 250, 0.56));
}

.session-tree__scroll {
  position: relative;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  overscroll-behavior: contain;
}

.session-tree__loading {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: calc(100% - 24px);
  padding: 8px 12px;
  border: 1px solid rgba(55, 128, 138, 0.16);
  border-radius: 12px;
  color: rgba(31, 41, 55, 0.9);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.1);
  transform: translateX(-50%);
  backdrop-filter: blur(10px);
}

.session-tree__loading-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  font-size: 11px;
  line-height: 1.4;
}

.session-tree__loading-copy strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-tree__loading-copy span {
  opacity: 0.65;
}

.session-tree.is-dark .session-tree__loading {
  border-color: rgba(125, 211, 252, 0.16);
  color: rgba(226, 232, 240, 0.94);
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.36);
}

.session-tree__scroll.is-drop-root-target {
  box-shadow: inset 0 0 0 1px rgba(55, 128, 138, 0.22), inset 0 0 0 999px rgba(55, 128, 138, 0.035);
}

.session-tree__list {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.session-tree__picker-list {
  max-height: 320px;
  overflow: auto;
  width: 100%;
  min-width: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.session-tree.is-dark .session-tree__scroll,
.session-tree.is-dark .session-tree__picker-list {
  border: none;
  background: transparent !important;
  box-shadow: none;
}

.session-tree :deep(.n-tree-node-wrapper) {
  margin: 2px 0;
  min-width: 0;
  max-width: 100%;
}

.session-tree :deep(.n-tree-node-content) {
  border-radius: 12px;
  height: 32px;
  min-height: 32px;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  overflow: hidden;
  transition: background-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.session-tree :deep(.n-tree-node.is-drop-target > .n-tree-node-content) {
  background: linear-gradient(90deg, rgba(55, 128, 138, 0.2), rgba(55, 128, 138, 0.08));
  box-shadow: inset 0 0 0 1px rgba(55, 128, 138, 0.22);
}

.session-tree :deep(.n-tree-node-content__text) {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.session-tree.is-dark :deep(.n-tree-node-content) {
  color: rgba(226, 232, 240, 0.94);
}

.session-tree.is-dark :deep(.n-tree-node.is-drop-target > .n-tree-node-content) {
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.18), rgba(148, 163, 184, 0.07));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.22);
}

.session-tree.is-dark :deep(.n-tree-node-switcher) {
  color: rgba(148, 163, 184, 0.9);
}

.session-tree :deep(.n-tree-node-content:hover) {
  transform: translateX(2px);
  background: rgba(84, 131, 146, 0.08);
  box-shadow: inset 0 0 0 1px rgba(84, 131, 146, 0.08);
}

.session-tree.is-dark :deep(.n-tree-node-content:hover) {
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.1);
}

.session-tree :deep(.n-tree-node--selected > .n-tree-node-content) {
  background: linear-gradient(90deg, rgba(55, 128, 138, 0.16), rgba(55, 128, 138, 0.04));
  box-shadow: inset 0 0 0 1px rgba(55, 128, 138, 0.14);
}

.session-tree.is-dark :deep(.n-tree-node--selected > .n-tree-node-content) {
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.14), rgba(148, 163, 184, 0.05));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16);
}

.tree-node-label-wrap {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.tree-node-label {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 22px;
}

.tree-node-meta {
  display: block;
  flex: 0 0 auto;
  margin-left: auto;
  max-width: 88px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 22px;
  color: rgba(100, 116, 139, 0.86);
}

.session-tree.is-dark .tree-node-meta {
  color: rgba(148, 163, 184, 0.9);
}
.folder-picker-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.folder-tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.session-name-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
