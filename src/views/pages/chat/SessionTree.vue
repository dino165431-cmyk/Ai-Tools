<template>
  <div :class="['session-tree', { 'is-dark': props.theme === 'dark' }]" @contextmenu.prevent="handleTreeContextMenu">
    <div class="session-tree__toolbar" @contextmenu.stop.prevent>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button class="session-tree__refresh" size="small" tertiary circle :loading="refreshing" @click="refreshTree">
            <template #icon>
              <n-icon :component="RefreshOutline" size="14" />
            </template>
          </n-button>
        </template>
        刷新目录
      </n-tooltip>
    </div>

    <n-alert v-if="runtimeIssue" type="warning" style="margin-bottom: 8px;">
      {{ runtimeIssue }}
    </n-alert>

    <n-tree
      class="session-tree__list"
      block-line
      expand-on-click
      ellipsis
      :data="treeData"
      :node-props="nodeProps"
      v-model:expanded-keys="expandedKeys"
      v-model:selected-keys="selectedKeys"
      style="width: 100%;"
      :render-prefix="renderPrefix"
      :render-label="renderLabel"
    />

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

const emit = defineEmits(['select', 'saved', 'rename', 'delete'])

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

const showContextMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const currentNode = ref(null)

const showFolderPicker = ref(false)
const folderExpandedKeys = ref([])
const selectedFolderKeys = ref([props.root])
const newSessionName = ref('')

const pendingPayload = ref(null)

const protectedTimedTaskDir = computed(() => `${props.root}/Timed Task`)
function isProtectedPath(p) {
  const path = String(p || '').trim()
  if (!path) return false
  return path === protectedTimedTaskDir.value
}

function handleExternalSessionFilesChanged(e) {
  const changedPath = String(e?.detail?.path || '').trim()
  if (changedPath && !changedPath.startsWith(String(props.root || ''))) return
  refreshTree({ silent: true })
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

async function loadDirectory(relativePath, parentNode) {
  try {
    const entries = await listDirectory(relativePath)
    const children = []

    for (const entry of entries) {
      const statInfo = await stat(entry)
      const isDirectory = statInfo.isDirectory()
      const fileName = entry.split('/').pop()

      if (!isDirectory && !String(fileName || '').endsWith('.json')) continue

      const label = isDirectory ? fileName : String(fileName || '').slice(0, -5)
      children.push({
        key: entry,
        label,
        isLeaf: !isDirectory,
        children: isDirectory ? [] : undefined
      })
    }

    children.sort((a, b) => {
      if (a.isLeaf === b.isLeaf) return a.label.localeCompare(b.label)
      return a.isLeaf ? 1 : -1
    })

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
      if (option.isLeaf) emit('select', option.key)
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
  return {
    disabled: !option.children,
    onClick() {
      if (option.children) selectedFolderKeys.value = [option.key]
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
  return h('span', { class: 'tree-node-label', title: labelText }, labelText)
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

function sortTreeChildren(children = []) {
  return [...children].sort((a, b) => {
    if (!!a?.isLeaf === !!b?.isLeaf) return String(a?.label || '').localeCompare(String(b?.label || ''))
    return a?.isLeaf ? 1 : -1
  })
}

function createTreeNode(entryPath, isDirectory) {
  const normalizedPath = String(entryPath || '').trim().replace(/\\/g, '/')
  const fileName = normalizedPath.split('/').pop() || normalizedPath
  return {
    key: normalizedPath,
    label: isDirectory ? fileName : String(fileName || '').replace(/\.json$/i, ''),
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
    message.warning('Timed Task 目录不支持重命名')
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
  if (isProtectedPath(protectedPath)) {
    message.warning('Timed Task 目录不支持删除')
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

        emit('delete', p)
        await refreshTree({ silent: true })
      } catch (err) {
        message.error('删除失败：' + (err?.message || String(err)))
      }
    }
  })
}

async function openNewFolderDialog() {
  const parentPath = selectedFolderKeys.value[0] || props.root
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

  const defaultFolder = String(options?.defaultFolder || '').trim()
  selectedFolderKeys.value = [defaultFolder || props.root]

  newSessionName.value = String(options?.defaultName || '').trim()

  showFolderPicker.value = true
  await refreshTree({ silent: true })
  await nextTick()
  await selectFolderPath(defaultFolder || props.root)
}

async function selectPath(filePath) {
  const p = String(filePath || '').trim().replace(/\\/g, '/')
  if (!p || (p !== props.root && !p.startsWith(`${props.root}/`))) return

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
    const payload = JSON.parse(JSON.stringify(pendingPayload.value))
    payload.title = payload.title || name
    payload.savedAt = new Date().toISOString()
    const json = JSON.stringify(payload, null, 2)

    await writeFile(fullPath, json)

    showFolderPicker.value = false
    pendingPayload.value = null
    newSessionName.value = ''

    const dirs = listAncestorDirs(fullPath).filter((d) => d !== props.root)
    const nextExpanded = Array.from(new Set([...(expandedKeys.value || []), ...dirs, folderPath]))
    const nextFolderExpanded = Array.from(new Set([...(folderExpandedKeys.value || []), ...dirs, folderPath]))
    expandedKeys.value = nextExpanded
    folderExpandedKeys.value = nextFolderExpanded

    upsertTreeNode(folderPath, createTreeNode(fullPath, false))
    await selectPath(fullPath)
    void refreshTree({ silent: true })
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
  clearSelection() {
    selectedKeys.value = []
  }
})
</script>

<style scoped>
.session-tree {
  display: flex;
  flex-direction: column;
  height: 99%;
  padding: 4px 2px 2px;
}

.session-tree.is-dark {
  color: rgba(226, 232, 240, 0.94);
}

.session-tree__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.session-tree__refresh {
  box-shadow: 0 10px 22px rgba(24, 43, 48, 0.08);
  border: 1px solid rgba(87, 126, 139, 0.14);
}

.session-tree.is-dark .session-tree__refresh {
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.28);
  border-color: rgba(148, 163, 184, 0.14);
}

.session-tree__list,
.session-tree__picker-list {
  border-radius: 16px;
  padding: 4px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.48), rgba(246, 248, 250, 0.56));
}

.session-tree.is-dark .session-tree__list,
.session-tree.is-dark .session-tree__picker-list {
  border: none;
  background: transparent !important;
  box-shadow: none;
}

.session-tree :deep(.n-tree-node-wrapper) {
  margin: 2px 0;
}

.session-tree :deep(.n-tree-node-content) {
  border-radius: 12px;
  transition: background-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
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

.tree-node-label {
  display: inline-block;
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
