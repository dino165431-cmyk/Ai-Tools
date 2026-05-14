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

    <div class="session-tree__scroll">
      <n-tree
        class="session-tree__list"
        block-line
        virtual-scroll
        :animated="false"
        expand-on-click
        ellipsis
        :data="treeData"
        :node-props="nodeProps"
        v-model:expanded-keys="expandedKeys"
        v-model:selected-keys="selectedKeys"
        @update:selected-keys="handleSelectedKeysChange"
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
import { ref, h, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { FileTrayFullOutline, Folder, FolderOpenOutline, RefreshOutline, CreateOutline, TrashOutline } from '@vicons/ionicons5'
import { NIcon, NTree, NDropdown, useMessage, useDialog, NInput, NButton, NModal, NTooltip, NAlert } from 'naive-ui'
import { createDirectory, writeFile, listDirectory, exists, stat, deleteItem, moveItem, openInFileManager, describeFileOperationsError } from '@/utils/fileOperations'
import { buildChatSessionAssetsDirectory, isChatSessionAssetsDirectoryPath } from '@/utils/chatMediaAssets.js'
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
let pendingRefreshRequested = false
let pendingRefreshSilent = true
let refreshPromise = null
let externalRefreshTimer = null
const pendingExternalChangePaths = new Set()

const showContextMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const currentNode = ref(null)

const showFolderPicker = ref(false)
const folderExpandedKeys = ref([])
const selectedFolderKeys = ref([props.root])
const newSessionName = ref('')

const pendingPayload = ref(null)
const pendingSaveOptions = ref({})

const TIMED_TASK_DIR_NAME = '定时任务'
const AUTO_CHAT_DIR_NAME = '历史会话'

const protectedSystemDirs = computed(() => [
  `${props.root}/${TIMED_TASK_DIR_NAME}`,
  `${props.root}/${AUTO_CHAT_DIR_NAME}`
])

function normalizeTreePath(p) {
  return String(p || '').trim().replace(/\\/g, '/')
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

function handleExternalSessionFilesChanged(e) {
  const rawPaths = Array.isArray(e?.detail?.paths) ? e.detail.paths : [e?.detail?.path]
  rawPaths
    .map((item) => normalizeTreePath(item))
    .filter((item) => item && item.startsWith(String(props.root || '')))
    .forEach((item) => pendingExternalChangePaths.add(item))
  if (!pendingExternalChangePaths.size) return
  if (externalRefreshTimer) {
    clearTimeout(externalRefreshTimer)
  }
  externalRefreshTimer = window.setTimeout(() => {
    externalRefreshTimer = null
    void flushExternalSessionChanges()
  }, 180)
}

function removeTreeNodeByPath(targetPath) {
  const normalized = normalizeTreePath(targetPath)
  if (!normalized) return false
  const parentPath = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : props.root
  if (parentPath === props.root) {
    const next = (Array.isArray(treeData.value) ? treeData.value : []).filter((node) => node?.key !== normalized)
    if (next.length === treeData.value.length) return false
    treeData.value = next
  } else {
    const parentNode = findNodeByKey(treeData.value, parentPath)
    if (!parentNode || !Array.isArray(parentNode.children)) return false
    const next = parentNode.children.filter((node) => node?.key !== normalized)
    if (next.length === parentNode.children.length) return false
    parentNode.children = next
  }
  selectedKeys.value = selectedKeys.value.filter((key) => key !== normalized)
  selectedFolderKeys.value = selectedFolderKeys.value.filter((key) => key !== normalized)
  expandedKeys.value = expandedKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`))
  folderExpandedKeys.value = folderExpandedKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`))
  loadedPaths.delete(normalized)
  return true
}

async function syncExternalSessionFileChange(sessionPath) {
  const normalized = normalizeTreePath(sessionPath)
  if (!normalized || !isJsonSessionPath(normalized) || isChatSessionAssetsDirectoryPath(normalized)) return
  const parentPath = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : props.root
  const parentLoaded = parentPath === props.root || loadedPaths.has(parentPath)
  if (!parentLoaded) return

  const fileExists = await exists(normalized).catch(() => false)
  if (!fileExists) {
    removeTreeNodeByPath(normalized)
    return
  }

  const statInfo = await stat(normalized)
  if (statInfo?.isDirectory?.()) {
    await refreshTree({ silent: true })
    return
  }

  const fileMeta = await readSessionFileMeta(normalized, statInfo)
  upsertTreeNode(parentPath || props.root, {
    key: normalized,
    label: fileMeta.label,
    metaLabel: fileMeta.metaLabel || '',
    sortTimeMs: fileMeta.sortTimeMs || statTimeMs(statInfo),
    sessionKind: fileMeta.sessionKind || '',
    isLeaf: true
  })
}

async function flushExternalSessionChanges() {
  const changedPaths = Array.from(pendingExternalChangePaths)
  pendingExternalChangePaths.clear()
  if (!changedPaths.length) return

  const needsFullRefresh = changedPaths.some((item) => {
    if (!item || item === props.root) return true
    if (isChatSessionAssetsDirectoryPath(item)) return false
    return !isJsonSessionPath(item)
  })
  if (needsFullRefresh) {
    await refreshTree({ silent: true })
    return
  }

  for (const item of changedPaths) {
    await syncExternalSessionFileChange(item)
  }
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
    await ensureRootReady()
    await loadDirectory(props.root, null)
    runtimeIssue.value = ''
  } catch (err) {
    runtimeIssue.value = describeFileOperationsError(err, '会话功能')
    message.error(runtimeIssue.value)
  }
})

onMounted(() => {
  try {
    window.addEventListener('sessionFilesChanged', handleExternalSessionFilesChanged)
  } catch {
    // ignore
  }
})

onBeforeUnmount(() => {
  try {
    window.removeEventListener('sessionFilesChanged', handleExternalSessionFilesChanged)
  } catch {
    // ignore
  }
  if (externalRefreshTimer) {
    clearTimeout(externalRefreshTimer)
    externalRefreshTimer = null
  }
  pendingExternalChangePaths.clear()
})

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
  if (key === 'rename') await renameNode(node)
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

function parseSessionCreatedTimeMs(value) {
  return parseTimeMs(value)
}

function resolveSessionCreatedTimeMs(data, statInfo) {
  return (
    parseSessionCreatedTimeMs(data?.source?.startedAt) ||
    parseSessionCreatedTimeMs(data?.source?.createdAt) ||
    parseSessionCreatedTimeMs(data?.createdAt) ||
    parseSessionCreatedTimeMs(data?.savedAt) ||
    statTimeMs(statInfo)
  )
}

async function readSessionFileMeta(entryPath, statInfo) {
  const fileName = String(entryPath || '').split('/').pop() || ''
  const fallbackName = String(fileName || '').replace(/\.json$/i, '')
  const maxMetaReadBytes = 1024 * 1024
  let data = null

  try {
    const size = Number(statInfo?.size)
    if (!Number.isFinite(size) || size <= maxMetaReadBytes) {
      const parsed = await readSessionJsonFile(entryPath)
      data = parsed.ok ? parsed.value : null
    }
  } catch {
    data = null
  }

  const timedTask = isTimedTaskPath(entryPath, data)
  const autoChat = isAutoChatPath(entryPath, data)
  const titleRaw = String(data?.title || '').trim()
  const title = titleRaw || stripGeneratedTimePrefix(fallbackName)
  const timeMs = resolveSessionCreatedTimeMs(data, statInfo)

  const metaLabel = formatTreeMetaDate(timeMs)

  return {
    label: title || fallbackName || '未命名会话',
    metaLabel,
    sortTimeMs: timeMs,
    sessionKind: timedTask ? 'timed-task' : autoChat ? 'history-session' : 'session'
  }
}

async function loadDirectory(relativePath, parentNode) {
  try {
    const entries = await listDirectory(relativePath)
    const children = (await Promise.all(entries.map(async (entry) => {
      if (isChatSessionAssetsDirectoryPath(entry)) return null

      const statInfo = await stat(entry)
      const isDirectory = statInfo.isDirectory()
      const fileName = entry.split('/').pop()

      if (!isDirectory && !String(fileName || '').endsWith('.json')) return null

      const fileMeta = isDirectory ? null : await readSessionFileMeta(entry, statInfo)
      const label = isDirectory ? displaySystemDirName(fileName) : fileMeta.label
      return {
        key: entry,
        label,
        metaLabel: fileMeta?.metaLabel || '',
        sortTimeMs: fileMeta?.sortTimeMs || statTimeMs(statInfo),
        sessionKind: fileMeta?.sessionKind || '',
        isLeaf: !isDirectory,
        children: isDirectory ? [] : undefined
      }
    }))).filter(Boolean)

    children.sort(compareTreeNodes)

    if (parentNode === null) treeData.value = children
    else parentNode.children = children

    loadedPaths.add(relativePath)
  } catch (err) {
    message.error('加载目录失败：' + (err?.message || String(err)))
  }
}

function nodeProps({ option }) {
  return {
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
  }
  return String(a?.label || '').localeCompare(String(b?.label || ''), 'zh-Hans-CN')
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
  const nextNode = node ? { ...node } : null
  if (!normalizedParentPath || !nextNode?.key) return null

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
  const nextNode = existingNode
    ? {
        ...existingNode,
        label: nextLabel,
        metaLabel: existingNode.metaLabel || formatTreeMetaDate(existingNode.sortTimeMs || createdTimeMs || now),
        sortTimeMs: Number(existingNode.sortTimeMs || createdTimeMs || now)
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
  expandedKeys.value = uniqueStrings(expandedKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)))
  folderExpandedKeys.value = uniqueStrings(folderExpandedKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)))
  selectedKeys.value = uniqueStrings(selectedKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)))
  selectedFolderKeys.value = uniqueStrings(selectedFolderKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)))
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
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  overscroll-behavior: contain;
}

.session-tree__list {
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

.session-tree :deep(.n-tree-node-content__text) {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.session-tree.is-dark :deep(.n-tree-node-content) {
  color: rgba(226, 232, 240, 0.94);
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
