<template>
  <div :class="['note-tree', { 'is-dark': theme === 'dark' }]" @contextmenu.prevent="handleTreeContextMenu">
    <div class="note-tree__toolbar" @contextmenu.stop.prevent>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button class="note-tree__action" size="small" tertiary circle @click="openFolderPicker('markdown')" @contextmenu.stop.prevent>
            <template #icon>
              <n-icon :component="DocumentTextOutline" size="14" />
            </template>
          </n-button>
        </template>
        新建笔记
      </n-tooltip>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button class="note-tree__action" size="small" tertiary circle @click="openFolderPicker('notebook')" @contextmenu.stop.prevent>
            <template #icon>
              <n-icon :component="CodeSlashOutline" size="14" />
            </template>
          </n-button>
        </template>
        新建超级笔记
      </n-tooltip>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button class="note-tree__refresh" size="small" tertiary circle :loading="refreshing" @click="refreshTree" @contextmenu.stop.prevent>
            <template #icon>
              <n-icon :component="RefreshOutline" size="14" />
            </template>
          </n-button>
        </template>
        刷新目录
      </n-tooltip>
    </div>
    <n-input
      v-model:value="searchQuery"
      class="note-tree__search"
      size="small"
      clearable
      placeholder="搜索笔记和文件夹"
      @contextmenu.stop
    />
    <n-text depth="3" class="note-tree__meta">{{ treeCountSummary }}</n-text>

    <n-alert v-if="runtimeIssue" type="warning" style="margin-bottom: 8px;">
      {{ runtimeIssue }}
    </n-alert>

    <div
      class="note-tree__scroll"
      :class="{ 'is-drop-root-target': isDropRootTarget }"
      @dragover.prevent="handleBlankAreaDragOver"
      @dragleave="handleBlankAreaDragLeave"
      @drop.prevent="handleBlankAreaDrop"
    >
      <n-tree
        class="note-tree__list"
        block-line
        virtual-scroll
        draggable
        :animated="false"
        expand-on-click
        ellipsis
        :data="treeData"
        :pattern="searchQuery"
        :show-irrelevant-nodes="false"
        :allow-drop="allowTreeDrop"
        :node-props="nodeProps"
        v-model:expanded-keys="expandedKeys"
        v-model:selected-keys="selectedKeys"
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
      :title="folderPickerTitle"
      style="width: 400px;"
      :bordered="false"
      :mask-closable="false"
    >
      <div class="folder-picker-content">
        <div class="folder-tree-header">
          <span>选择文件夹</span>
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
          class="note-tree__picker-list"
          block-line
          expand-on-click
          :data="treeData"
          :node-props="folderNodeProps"
          v-model:expanded-keys="folderExpandedKeys"
          v-model:selected-keys="selectedFolderKeys"
          style="overflow-y: auto;"
          :render-prefix="renderPrefix"
          :render-label="renderLabel"
        />
        <div class="note-name-input">
          <span>笔记名称：</span>
          <n-input
            v-model:value="newNoteName"
            placeholder="请输入笔记名称（不含扩展名）"
            autofocus
          />
        </div>
      </div>
      <template #footer>
        <div class="modal-footer">
          <n-button @click="showFolderPicker = false">取消</n-button>
          <n-button type="primary" @click="createNoteInSelectedFolder" :disabled="!newNoteName.trim()">创建</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, h, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  FileTrayFullOutline,
  Folder,
  FolderOpenOutline,
  CreateOutline,
  TrashOutline,
  RefreshOutline,
  DownloadOutline,
  CopyOutline,
  DocumentTextOutline,
  CodeSlashOutline
} from '@vicons/ionicons5';
import {
  NIcon,
  NTree,
  NDropdown,
  NText,
  useMessage,
  useDialog,
  NInput,
  NButton,
  NModal,
  NTooltip,
  NAlert
} from 'naive-ui';
import {
  createDirectory,
  writeFile,
  readFile,
  deleteItem,
  moveItem,
  listDirectory,
  exists,
  stat,
  openInFileManager,
  describeFileOperationsError
} from '@/utils/fileOperations';
import path from 'path-browserify';
import { copyTextToClipboard } from '@/utils/clipboard';
import { ensureMarkdownPreviewRuntime } from '@/utils/mdEditorRuntime';
import { sanitizeSvgTree } from '@/utils/sanitizeSvg';
import { getNoteConfig } from '@/utils/configListener';
import { decryptNoteContent, normalizeNoteSecurityConfig } from '@/utils/noteEncryption';
import {
  safeDecodeURIComponent as safeDecodeURIComponentUtil,
  stripUrlHashAndQuery as stripUrlHashAndQueryUtil,
  splitMarkdownLinkDestination as splitMarkdownLinkDestinationUtil,
  sanitizeSubPathUnderRoot as sanitizeSubPathUnderRootUtil,
  buildNoteHrefFromPath as buildNoteHrefFromPathUtil,
  toPosixPath as toPosixPathUtil,
  rewriteNoteAssetsLinksInMarkdown as rewriteNoteAssetsLinksInMarkdownUtil
} from '@/utils/notePathUtils';
import {
  createEmptyNotebook,
  serializeNotebook
} from '@/utils/notebookModel';
import {
  getNoteExtensionByType,
  getNoteTypeByPath,
  getNoteTypeLabel,
  isSupportedNotePath,
  stripNoteExtension
} from '@/utils/noteTypes';
import { deleteNoteAttachmentDirectories } from '@/utils/noteAttachmentCleanup';

const props = defineProps({
  theme: {
    type: String,
    default: 'light'
  },
  getUnlockedPassword: {
    type: Function,
    default: null
  }
});

const message = useMessage();
const dialog = useDialog();
const noteConfig = getNoteConfig();

// 树数据
const treeData = ref([]);
const expandedKeys = ref([]);
const selectedKeys = ref([]);
const loadedPaths = new Set();
const treeNodeIndex = new Map();
const refreshing = ref(false);
const runtimeIssue = ref('');
const searchQuery = ref('');
const noteSecurity = computed(() => normalizeNoteSecurityConfig(noteConfig.value?.noteSecurity));
const treeStats = computed(() => {
  let folderCount = 0;
  let markdownCount = 0;
  let notebookCount = 0;

  const visit = (nodes) => {
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
      if (!node) return;
      if (node.isLeaf) {
        if (getNodeNoteType(node) === 'notebook') notebookCount += 1;
        else markdownCount += 1;
        return;
      }
      folderCount += 1;
      visit(node.children);
    });
  };

  visit(treeData.value);
  return {
    folderCount,
    markdownCount,
    notebookCount,
    noteCount: markdownCount + notebookCount
  };
});
const treeCountSummary = computed(() => {
  const stats = treeStats.value;
  const base = `文件夹 ${stats.folderCount} · 笔记 ${stats.noteCount}（Markdown ${stats.markdownCount} / Notebook ${stats.notebookCount}）`;
  return searchQuery.value ? `${base} · 搜索覆盖完整目录` : base;
});
let pendingRefreshRequested = false;
let pendingRefreshSilent = true;
let refreshPromise = null;

// 右键菜单状态
const showContextMenu = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const draggingSourcePath = ref('');
const dropTargetPath = ref('');
const isDropRootTarget = computed(() => normalizeNoteTreePath(dropTargetPath.value) === normalizeNoteTreePath('note'));
const currentNode = ref(null);

// 文件夹选择模态框（仅用于欢迎界面按钮）
const showFolderPicker = ref(false);
const folderExpandedKeys = ref([]);
const selectedFolderKeys = ref(['note']);
const newNoteName = ref('');
const pendingCreateNoteType = ref('markdown');

// 定义事件
const emit = defineEmits(['select', 'prepare-delete', 'prepare-rename', 'delete', 'rename', 'set-password', 'clear-password', 'reset-password', 'export-html', 'export-png']);
const folderPickerTitle = computed(() => `为新${getNoteTypeLabel(pendingCreateNoteType.value)}选择文件夹`);

// 右键菜单选项
const menuOptions = computed(() => [
  {
    label: '打开所在文件夹',
    key: 'openInFileManager',
    icon: () => h(NIcon, null, { default: () => h(FolderOpenOutline) })
  },
  {
    type: 'divider'
  },
  {
    label: '新建笔记',
    key: 'newFile',
    icon: () => h(NIcon, null, { default: () => h(CreateOutline) })
  },
  {
    label: '新建超级笔记',
    key: 'newNotebook',
    icon: () => h(NIcon, null, { default: () => h(CodeSlashOutline) })
  },
  {
    label: '新建文件夹',
    key: 'newFolder',
    icon: () => h(NIcon, null, { default: () => h(CreateOutline) })
  },
  {
    type: 'divider'
  },
  {
    label: '复制 Markdown 链接',
    key: 'copyNoteMarkdownLink',
    icon: () => h(NIcon, null, { default: () => h(CopyOutline) }),
    disabled: !(currentNode.value && currentNode.value.isLeaf)
  },
  {
    label: '复制相对路径',
    key: 'copyRelativePath',
    icon: () => h(NIcon, null, { default: () => h(CopyOutline) }),
    disabled: !currentNode.value
  },
  {
    type: 'divider'
  },
  {
    label: '设置笔记密码',
    key: 'setNotePassword',
    icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
    disabled: !(currentNode.value && currentNode.value.isLeaf)
  },
  {
    label: '清除笔记密码',
    key: 'clearNotePassword',
    icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
    disabled: !(currentNode.value && currentNode.value.isLeaf)
  },
  {
    label: '全局配置密码重置笔记密码',
    key: 'resetNotePasswordByGlobal',
    icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
    disabled: !(currentNode.value && currentNode.value.isLeaf)
  },
  {
    label: '导出 HTML',
    key: 'exportHtml',
    icon: () => h(NIcon, null, { default: () => h(DownloadOutline) }),
    disabled: !(currentNode.value && currentNode.value.isLeaf && getNodeNoteType(currentNode.value) === 'markdown')
  },
  {
    label: '导出成 PNG',
    key: 'exportPng',
    icon: () => h(NIcon, null, { default: () => h(DownloadOutline) }),
    disabled: !(currentNode.value && currentNode.value.isLeaf && getNodeNoteType(currentNode.value) === 'markdown')
  },
  {
    label: '重命名',
    key: 'rename',
    icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
    disabled: !currentNode.value
  },
  {
    label: '删除',
    key: 'delete',
    icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
    disabled: !currentNode.value
  }
]);

// 初始化
onMounted(async () => {
  try {
    window.addEventListener('noteFilesChanged', handleExternalNoteFilesChanged);
  } catch {
    // ignore
  }

  try {
    const noteExists = await exists('note');
    if (!noteExists) {
      await createDirectory('note');
    }
    await loadDirectory('note', null);
    runtimeIssue.value = '';
  } catch (err) {
    runtimeIssue.value = describeFileOperationsError(err, '笔记功能');
    message.error(runtimeIssue.value);
  }
});

onBeforeUnmount(() => {
  try {
    window.removeEventListener('noteFilesChanged', handleExternalNoteFilesChanged);
  } catch {
    // ignore
  }
});

function handleExternalNoteFilesChanged(e) {
  const rootPath = String(e?.detail?.rootPath || '').trim();
  if (rootPath && rootPath !== 'note') return;
  void applyExternalTreeChanges(e?.detail);
}

function normalizeNoteTreePath(value) {
  return toPosixPath(String(value || '').trim());
}

function getTreeParentPath(targetPath) {
  const normalized = normalizeNoteTreePath(targetPath);
  if (!normalized || normalized === 'note') return 'note';
  return normalized.includes('/') ? normalized.substring(0, normalized.lastIndexOf('/')) : 'note';
}

function sortNoteTreeChildren(children = []) {
  return [...children].sort((a, b) => {
    if (!!a?.isLeaf === !!b?.isLeaf) {
      return String(a?.label || '').localeCompare(String(b?.label || ''));
    }
    return a?.isLeaf ? 1 : -1;
  });
}

function replaceLoadedPathsUnderBase(basePath, nextLoadedPaths) {
  const normalizedBase = normalizeNoteTreePath(basePath);
  if (!normalizedBase) return;
  for (const existing of [...loadedPaths]) {
    if (existing === normalizedBase || String(existing || '').startsWith(`${normalizedBase}/`)) {
      loadedPaths.delete(existing);
    }
  }
  for (const item of nextLoadedPaths || []) {
    const normalized = normalizeNoteTreePath(item);
    if (normalized) loadedPaths.add(normalized);
  }
}

function pruneTreeStateToExistingNodes() {
  const allowRoot = (key) => key === 'note' || treeNodeIndex.has(key);
  expandedKeys.value = expandedKeys.value.filter(allowRoot);
  folderExpandedKeys.value = folderExpandedKeys.value.filter(allowRoot);
  selectedKeys.value = selectedKeys.value.filter(allowRoot);
  selectedFolderKeys.value = selectedFolderKeys.value.filter(allowRoot);
}

function pruneNestedPaths(paths, options = {}) {
  const normalized = Array.from(new Set((Array.isArray(paths) ? paths : [])
    .map((item) => normalizeNoteTreePath(item))
    .filter((item) => item && item !== 'note.assets' && item !== 'note/.assets')))
  const descending = options.descending === true;
  normalized.sort((a, b) => {
    const depthDiff = a.split('/').length - b.split('/').length;
    return descending ? depthDiff * -1 : depthDiff;
  });
  return normalized.filter((item, index) => {
    return !normalized.some((other, otherIndex) => {
      if (otherIndex === index || !other) return false;
      return other !== item && item.startsWith(`${other}/`);
    });
  });
}

function clearTreeStateForRemovedPath(targetPath) {
  const normalized = normalizeNoteTreePath(targetPath);
  if (!normalized) return;
  selectedKeys.value = selectedKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`));
  selectedFolderKeys.value = selectedFolderKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`));
  expandedKeys.value = expandedKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`));
  folderExpandedKeys.value = folderExpandedKeys.value.filter((key) => key !== normalized && !String(key || '').startsWith(`${normalized}/`));
  for (const loadedPath of [...loadedPaths]) {
    if (loadedPath === normalized || String(loadedPath || '').startsWith(`${normalized}/`)) {
      loadedPaths.delete(loadedPath);
    }
  }
}

function detachTreeNodeByPath(targetPath, options = {}) {
  const normalized = normalizeNoteTreePath(targetPath);
  if (!normalized || normalized === 'note') return null;
  const parentPath = getTreeParentPath(normalized);
  let detached = null;
  if (parentPath === 'note') {
    const current = Array.isArray(treeData.value) ? [...treeData.value] : [];
    const next = [];
    current.forEach((node) => {
      if (node?.key === normalized && !detached) detached = node;
      else next.push(node);
    });
    if (detached) treeData.value = next;
  } else {
    const parentNode = findNodeByKey(parentPath);
    if (!parentNode || !Array.isArray(parentNode.children)) return null;
    const next = [];
    parentNode.children.forEach((node) => {
      if (node?.key === normalized && !detached) detached = node;
      else next.push(node);
    });
    if (detached) parentNode.children = next;
  }
  if (!detached) return null;
  if (!options.preserveState) clearTreeStateForRemovedPath(normalized);
  rebuildTreeNodeIndex();
  return detached;
}

function removeTreeNodeByPath(targetPath) {
  return !!detachTreeNodeByPath(targetPath);
}

function upsertTreeNode(parentPathRaw, node) {
  const parentPath = normalizeNoteTreePath(parentPathRaw);
  const nextNode = node && typeof node === 'object'
    ? {
        ...node,
        key: normalizeNoteTreePath(node.key),
        label: String(node.label || ''),
        isLeaf: !!node.isLeaf,
        ...(node.noteType ? { noteType: node.noteType } : {}),
        ...(Array.isArray(node.children) ? { children: node.children } : node.isLeaf ? {} : { children: [] })
      }
    : null;
  if (!nextNode?.key) return null;

  if (parentPath === 'note') {
    const existing = Array.isArray(treeData.value) ? [...treeData.value] : [];
    const withoutCurrent = existing.filter((item) => item?.key !== nextNode.key);
    treeData.value = sortNoteTreeChildren([...withoutCurrent, nextNode]);
  } else {
    const parentNode = findNodeByKey(parentPath);
    if (!parentNode || !Array.isArray(parentNode.children)) return null;
    const existing = Array.isArray(parentNode.children) ? [...parentNode.children] : [];
    const withoutCurrent = existing.filter((item) => item?.key !== nextNode.key);
    parentNode.children = sortNoteTreeChildren([...withoutCurrent, nextNode]);
  }
  loadedPaths.add(parentPath);
  rebuildTreeNodeIndex();
  return findNodeByKey(nextNode.key);
}

function createNoteTreeNode(entryPath, isDirectory) {
  const normalized = normalizeNoteTreePath(entryPath);
  const fileName = normalized.split('/').pop() || normalized;
  return {
    key: normalized,
    label: isDirectory ? fileName : stripNoteExtension(fileName),
    isLeaf: !isDirectory,
    ...(isDirectory ? { children: [] } : { noteType: getNoteTypeByPath(normalized) })
  };
}

async function buildExternalTreeNode(entryPath) {
  const normalized = normalizeNoteTreePath(entryPath);
  if (!normalized || normalized === 'note') return null;
  let statInfo = null;
  try {
    statInfo = await stat(normalized);
  } catch {
    return null;
  }
  const isDirectory = !!statInfo?.isDirectory?.();
  const fileName = normalized.split('/').pop() || normalized;
  if (isDirectory) {
    const dirName = String(fileName || '').trim();
    if (dirName === 'assets' || dirName.endsWith('.assets')) return null;
    const loadedPathCollector = new Set();
    const children = await scanDirectoryChildren(normalized, loadedPathCollector);
    return {
      ...createNoteTreeNode(normalized, true),
      children,
      loadedPathCollector
    };
  }
  if (!isSupportedNotePath(fileName)) return null;
  return createNoteTreeNode(normalized, false);
}

async function applyExternalAddedPath(entryPath) {
  const normalized = normalizeNoteTreePath(entryPath);
  if (!normalized || normalized === 'note') return false;
  const parentPath = getTreeParentPath(normalized);
  if (parentPath !== 'note' && !loadedPaths.has(parentPath)) return false;
  const node = await buildExternalTreeNode(normalized);
  if (!node) return false;
  const inserted = upsertTreeNode(parentPath, node);
  if (!inserted) return false;
  if (node.loadedPathCollector instanceof Set) {
    replaceLoadedPathsUnderBase(normalized, node.loadedPathCollector);
  }
  return true;
}

function moveExistingTreeNode(oldPath, newPath) {
  const normalizedOldPath = normalizeNoteTreePath(oldPath);
  const normalizedNewPath = normalizeNoteTreePath(newPath);
  if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) return false;
  const detached = detachTreeNodeByPath(normalizedOldPath, { preserveState: true });
  if (!detached) return false;
  updateNodeKeysRecursively(detached, normalizedOldPath, normalizedNewPath);
  detached.label = detached.isLeaf
    ? stripNoteExtension(path.basename(normalizedNewPath))
    : String(path.basename(normalizedNewPath) || detached.label || '');
  if (detached.isLeaf) detached.noteType = getNoteTypeByPath(normalizedNewPath);
  const parentPath = getTreeParentPath(normalizedNewPath);
  upsertTreeNode(parentPath, detached);
  updateTreeStateAfterPathChange(normalizedOldPath, normalizedNewPath);
  rebuildTreeNodeIndex();
  return true;
}

async function applyExternalTreeChanges(detail = {}) {
  const addedPaths = pruneNestedPaths(detail?.addedPaths || []);
  const removedPaths = pruneNestedPaths(detail?.removedPaths || []);
  const totalRoots = addedPaths.length + removedPaths.length;

  if (
    totalRoots === 0
    || addedPaths.includes('note')
    || removedPaths.includes('note')
    || totalRoots > 24
  ) {
    await refreshTree({ silent: true });
    return;
  }

  if (addedPaths.length === 1 && removedPaths.length === 1) {
    const moved = moveExistingTreeNode(removedPaths[0], addedPaths[0]);
    if (moved) return;
  }

  removedPaths
    .sort((a, b) => b.split('/').length - a.split('/').length)
    .forEach((targetPath) => {
      removeTreeNodeByPath(targetPath);
    });

  for (const targetPath of addedPaths.sort((a, b) => a.split('/').length - b.split('/').length)) {
    await applyExternalAddedPath(targetPath);
  }
}

async function refreshTreeBranch(targetPath, force = false) {
  const normalized = normalizeNoteTreePath(targetPath);
  if (!normalized) return false;

  if (normalized === 'note') {
    await loadDirectory('note', null);
    return true;
  }

  const node = findNodeByKey(normalized);
  if (!node) return false;
  await loadDirectory(normalized, node);
  return true;
}

async function refreshTree(options = {}) {
  const silent = options?.silent === true;
  if (refreshPromise) {
    pendingRefreshRequested = true;
    pendingRefreshSilent = pendingRefreshSilent && silent;
    return refreshPromise;
  }

  refreshPromise = (async () => {
    refreshing.value = true;
    try {
      const noteExists = await exists('note');
      if (!noteExists) {
        await createDirectory('note');
      }

      const keepExpanded = Array.isArray(expandedKeys.value) ? [...expandedKeys.value] : [];
      const keepFolderExpanded = Array.isArray(folderExpandedKeys.value) ? [...folderExpandedKeys.value] : [];

      loadedPaths.clear();
      runtimeIssue.value = '';
      await loadDirectory('note', null);
      expandedKeys.value = keepExpanded;
      folderExpandedKeys.value = keepFolderExpanded;
      pruneTreeStateToExistingNodes();

      if (!silent) {
        message.success('目录已刷新');
      }
    } catch (err) {
      runtimeIssue.value = describeFileOperationsError(err, '笔记功能');
      if (!silent) {
        message.error('刷新目录失败：' + runtimeIssue.value);
      }
    } finally {
      refreshing.value = false;
      if (pendingRefreshRequested) {
        const nextSilent = pendingRefreshSilent;
        pendingRefreshRequested = false;
        pendingRefreshSilent = true;
        refreshPromise = null;
        return refreshTree({ silent: nextSilent });
      }
    }

    return null;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// 懒加载
watch(expandedKeys, async (newKeys, oldKeys) => {
  const newlyExpanded = newKeys.filter(key => !oldKeys.includes(key));
  for (const key of newlyExpanded) {
    if (loadedPaths.has(key)) continue;
    const node = findNodeByKey(key);
    if (node && node.children && node.children.length === 0) {
      await loadDirectory(key, node);
    }
  }
});

watch(folderExpandedKeys, async (newKeys, oldKeys) => {
  const newlyExpanded = newKeys.filter(key => !oldKeys.includes(key));
  for (const key of newlyExpanded) {
    if (loadedPaths.has(key)) continue;
    const node = findNodeByKey(key);
    if (node && node.children && node.children.length === 0) {
      await loadDirectory(key, node);
    }
  }
});

function rebuildTreeNodeIndex() {
  treeNodeIndex.clear();
  const visit = (nodes) => {
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
      if (!node?.key) return;
      treeNodeIndex.set(node.key, node);
      if (Array.isArray(node.children) && node.children.length) visit(node.children);
    });
  };
  visit(treeData.value);
}

// 查找节点
function findNodeByKey(key) {
  return treeNodeIndex.get(key) || null;
}

// 加载目录
async function loadDirectory(relativePath, parentNode) {
  try {
    const nextLoadedPaths = new Set();
    const children = await scanDirectoryChildren(relativePath, nextLoadedPaths);

    if (parentNode === null) {
      treeData.value = children;
    } else {
      parentNode.children = children;
    }
    rebuildTreeNodeIndex();
    replaceLoadedPathsUnderBase(relativePath, nextLoadedPaths);
    pruneTreeStateToExistingNodes();
  } catch (err) {
    const errorText = describeFileOperationsError(err, '笔记目录');
    runtimeIssue.value = errorText;
    message.error('加载目录失败：' + errorText);
  }
}

async function scanDirectoryChildren(relativePath, loadedPathCollector = new Set()) {
  loadedPathCollector.add(relativePath);
  const entries = await listDirectory(relativePath);
  const scanned = await Promise.all(
    entries.map(async (entry) => {
      const statInfo = await stat(entry);
      const isDirectory = statInfo.isDirectory();
      const fileName = entry.split('/').pop();
      if (isDirectory) {
        const n = String(fileName || '').trim();
        if (n === 'assets' || n.endsWith('.assets')) return null;
        return {
          key: entry,
          label: fileName,
          isLeaf: false,
          children: await scanDirectoryChildren(entry, loadedPathCollector)
        };
      }
      if (!isSupportedNotePath(fileName)) return null;
      return {
        key: entry,
        label: stripNoteExtension(fileName),
        isLeaf: true,
        noteType: getNoteTypeByPath(entry)
      };
    })
  );
  return sortNoteTreeChildren(scanned.filter(Boolean));
}

// 主树节点属性
function nodeProps({ option }) {
  const normalizedOptionPath = normalizeNoteTreePath(option.key);
  const isDropTarget = normalizedOptionPath && normalizeNoteTreePath(dropTargetPath.value) === normalizedOptionPath;
  return {
    class: isDropTarget ? 'is-drop-target' : '',
    onClick() {
      if (option.isLeaf) {
        emit('select', option.key);
        selectedKeys.value = [option.key];
      } else {
        selectedKeys.value = [option.key];
      }
    },
    onContextmenu(e) {
      e.preventDefault();
      e.stopPropagation();
      currentNode.value = option;
      showContextMenu.value = false;
      menuX.value = e.clientX;
      menuY.value = e.clientY;
      setTimeout(() => {
        showContextMenu.value = true;
      }, 10);
    }
  };
}

// 模态框内树节点属性
function folderNodeProps({ option }) {
  return {
    disabled: !option.children,
    onClick() {
      if (option.children) {
        selectedFolderKeys.value = [option.key];
      }
    }
  };
}

function allowTreeDrop({ node, dropPosition }) {
  if (!node) return true;
  if (dropPosition === 'inside') return !node.isLeaf;
  return true;
}

function resolveDropTargetDirectory(targetNode, dropPosition) {
  if (!targetNode) return 'note';
  if (dropPosition === 'inside') {
    return targetNode.isLeaf ? '' : normalizeNoteTreePath(targetNode.key);
  }
  return getDirectoryPathForNode(targetNode);
}

function isPathEqualOrInside(targetPath, basePath) {
  const target = normalizeNoteTreePath(targetPath);
  const base = normalizeNoteTreePath(basePath);
  if (!target || !base) return false;
  return target === base || target.startsWith(`${base}/`);
}

async function moveNoteEntryToPath(oldPathRaw, newPathRaw) {
  const oldPath = normalizeNoteTreePath(oldPathRaw);
  const newPath = normalizeNoteTreePath(newPathRaw);
  if (!oldPath || !newPath || oldPath === newPath) return false;

  const movingNode = findNodeByKey(oldPath);
  const isDirectory = !!movingNode && !movingNode.isLeaf;
  if (isDirectory && isPathEqualOrInside(newPath, oldPath)) {
    message.warning('不能把文件夹移动到自身或其子目录中');
    return false;
  }

  if (await exists(newPath)) {
    message.warning('目标位置已存在同名文件或文件夹');
    return false;
  }

  if (movingNode?.isLeaf && getNodeNoteType(movingNode) === 'markdown') {
    await renameNoteWithImagesMove(oldPath, newPath);
  } else if (isDirectory) {
    await renameFolderWithImagesMove(oldPath, newPath);
  } else {
    await moveItem(oldPath, newPath);
  }

  const oldParentPath = getTreeParentPath(oldPath);
  const targetParentPath = getTreeParentPath(newPath);
  moveExistingTreeNode(oldPath, newPath);
  if (!findNodeByKey(newPath)) {
    await refreshTreeBranch(targetParentPath, true);
  }
  if (findNodeByKey(oldPath)) {
    await refreshTreeBranch(oldParentPath);
  }
  emit('rename', oldPath, newPath);
  return true;
}

function clearDropTarget() {
  dropTargetPath.value = '';
}

function setDropTargetFromNode(node) {
  const path = normalizeNoteTreePath(node?.key);
  if (!path) return;
  dropTargetPath.value = path;
}

async function handleTreeDrop({ node, dragNode, dropPosition }) {
  const sourcePath = normalizeNoteTreePath(dragNode?.key);
  const targetDir = resolveDropTargetDirectory(node, dropPosition);
  clearDropTarget();
  if (!sourcePath || !targetDir) return;

  const nextPath = normalizeNoteTreePath(`${targetDir}/${path.basename(sourcePath)}`);
  if (!nextPath || nextPath === sourcePath) return;

  try {
    await moveNoteEntryToPath(sourcePath, nextPath);
  } catch (err) {
    message.error('移动失败：' + (err?.message || String(err)));
  }
}

function handleTreeDragEnter({ node }) {
  if (!draggingSourcePath.value) return;
  setDropTargetFromNode(node);
}

function handleTreeDragOver({ node }) {
  if (!draggingSourcePath.value) return;
  setDropTargetFromNode(node);
}

function handleTreeDragLeave({ node, event }) {
  if (!draggingSourcePath.value) return;
  if (event?.currentTarget !== event?.target) return;
  const path = normalizeNoteTreePath(node?.key);
  if (path && normalizeNoteTreePath(dropTargetPath.value) === path) {
    clearDropTarget();
  }
}

function handleBlankAreaDragOver(event) {
  const target = event?.target;
  if (target?.closest?.('.n-tree-node, .n-tree-node-content')) return;
  if (!draggingSourcePath.value) return;
  dropTargetPath.value = normalizeNoteTreePath('note');
}

function handleBlankAreaDragLeave(event) {
  if (event?.currentTarget !== event?.target) return;
  if (isDropRootTarget.value) {
    clearDropTarget();
  }
}

async function handleBlankAreaDrop(event) {
  const target = event?.target;
  if (target?.closest?.('.n-tree-node, .n-tree-node-content')) return;

  const sourcePath = normalizeNoteTreePath(draggingSourcePath.value);
  if (!sourcePath) return;

  const nextPath = normalizeNoteTreePath(`${'note'}/${path.basename(sourcePath)}`);
  if (!nextPath || nextPath === sourcePath) return;

  try {
    await moveNoteEntryToPath(sourcePath, nextPath);
  } catch (err) {
    message.error('移动失败：' + (err?.message || String(err)));
  } finally {
    draggingSourcePath.value = '';
    clearDropTarget();
  }
}

// 空白区域右键
function handleTreeContextMenu(e) {
  e.preventDefault();
  currentNode.value = null;
  showContextMenu.value = false;
  menuX.value = e.clientX;
  menuY.value = e.clientY;
  setTimeout(() => {
    showContextMenu.value = true;
  }, 10);
}

function handleTreeDragStart({ node }) {
  clearDropTarget();
  draggingSourcePath.value = normalizeNoteTreePath(node?.key);
}

function handleTreeDragEnd() {
  draggingSourcePath.value = '';
  clearDropTarget();
}

function handleClickOutside() {
  showContextMenu.value = false;
}

// 菜单选择
async function handleMenuSelect(key) {
  showContextMenu.value = false;
  const node = currentNode.value;
  switch (key) {
    case 'openInFileManager':
      await openNodeInFileManager(node);
      break;
    case 'newFile':
      if (node && node.children) {
        await createNoteInFolder(node.key, 'markdown');
      } else if (node && !node.children) {
        const parentPath = node.key.substring(0, node.key.lastIndexOf('/'));
        await createNoteInFolder(parentPath, 'markdown');
      } else {
        await createNoteInFolder('note', 'markdown');
      }
      break;
    case 'newNotebook':
      if (node && node.children) {
        await createNoteInFolder(node.key, 'notebook');
      } else if (node && !node.children) {
        const parentPath = node.key.substring(0, node.key.lastIndexOf('/'));
        await createNoteInFolder(parentPath, 'notebook');
      } else {
        await createNoteInFolder('note', 'notebook');
      }
      break;
    case 'newFolder':
      createFolder(node);
      break;
    case 'rename':
      if (node) renameNode(node);
      break;
    case 'delete':
      if (node) deleteNode(node);
      break;
    case 'exportHtml':
      if (node && node.isLeaf) emit('export-html', node.key);
      break;
    case 'exportPng':
      if (node && node.isLeaf) emit('export-png', node.key);
      break;
    case 'copyNoteMarkdownLink':
      if (node && node.isLeaf) copyNoteMarkdownLink(node);
      break;
    case 'copyRelativePath':
      if (node) copyNodeRelativePath(node);
      break;
    case 'setNotePassword':
      if (node && node.isLeaf) emit('set-password', node.key);
      break;
    case 'clearNotePassword':
      if (node && node.isLeaf) emit('clear-password', node.key);
      break;
    case 'resetNotePasswordByGlobal':
      if (node && node.isLeaf) emit('reset-password', node.key);
      break;
  }
}

function getDirectoryPathForNode(node) {
  const nodePath = String(node?.key || '').trim();
  if (!nodePath) return 'note';
  if (!node?.isLeaf) return nodePath;
  return path.dirname(nodePath);
}

async function openNodeInFileManager(node) {
  try {
    const noteExists = await exists('note');
    if (!noteExists) {
      await createDirectory('note');
    }
    const targetDir = getDirectoryPathForNode(node);
    await openInFileManager(targetDir);
  } catch (err) {
    message.error('打开文件管理器失败：' + (err?.message || String(err)));
  }
}

function copyNoteLink(node) {
  const href = buildNoteHrefFromPath(node?.key);
  if (!href) {
    message.warning('无法生成笔记链接');
    return;
  }
  copyToClipboard(href);
}

function copyNoteMarkdownLink(node) {
  const href = buildNoteHrefFromPath(node?.key);
  if (!href) {
    message.warning('无法生成笔记链接');
    return;
  }
  const title = String(node?.label || '').trim() || '笔记';
  copyToClipboard(`[${title}](${href})`);
}

function getNodeFileName(node) {
  const nodePath = String(node?.key || '').trim();
  if (nodePath) {
    return String(path.basename(nodePath) || '').trim();
  }
  return String(node?.label || '').trim();
}

function copyNodeFileName(node) {
  const name = getNodeFileName(node);
  if (!name) {
    message.warning('无法获取文件名');
    return;
  }
  copyToClipboard(name);
}

function copyNodeRelativePath(node) {
  try {
    const nodePath = String(node?.key || '').trim();
    if (!nodePath) {
      message.warning('无法获取路径');
      return;
    }
    const relativePath = nodePath.startsWith('note/') ? nodePath.slice(5) : nodePath;
    copyToClipboard(relativePath);
  } catch (err) {
    message.error('复制相对路径失败：' + (err?.message || String(err)));
  }
}

function guessMimeByExt(extRaw) {
  const ext = String(extRaw || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

function toUint8Array(bufLike) {
  if (!bufLike) return new Uint8Array();
  if (bufLike instanceof Uint8Array) return bufLike;
  if (bufLike instanceof ArrayBuffer) return new Uint8Array(bufLike);
  if (ArrayBuffer.isView(bufLike)) {
    return new Uint8Array(bufLike.buffer, bufLike.byteOffset, bufLike.byteLength);
  }
  if (bufLike?.type === 'Buffer' && Array.isArray(bufLike?.data)) {
    return Uint8Array.from(bufLike.data);
  }
  return new Uint8Array();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

async function binaryToDataUrl(bufLike, mime) {
  const bytes = toUint8Array(bufLike);
  if (!bytes || bytes.byteLength === 0) return '';
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  return await blobToDataUrl(blob);
}

function getUrlScheme(url) {
  const s = String(url || '').trim();
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(s);
  return m ? String(m[1] || '').toLowerCase() : '';
}

function sanitizeHrefForExport(hrefRaw, { safeMode }) {
  const raw = String(hrefRaw || '').trim();
  if (!raw) return null;
  if (raw.startsWith('#')) return raw;
  const href = raw.startsWith('//') ? `https:${raw}` : raw;
  const scheme = getUrlScheme(href);
  if (scheme === 'javascript' || scheme === 'vbscript' || scheme === 'data') return null;
  if (safeMode && scheme && !['http', 'https', 'mailto'].includes(scheme)) return null;
  return href;
}

function sanitizeSrcForExport(srcRaw, { safeMode, allowData = false } = {}) {
  const raw = String(srcRaw || '').trim();
  if (!raw) return null;
  if (allowData && raw.startsWith('data:')) return raw;
  const src = raw.startsWith('//') ? `https:${raw}` : raw;
  const scheme = getUrlScheme(src);
  if (scheme === 'javascript' || scheme === 'vbscript') return null;
  if (safeMode && scheme && !['http', 'https'].includes(scheme)) return null;
  return src;
}

function sanitizeExportedDom(dom, { safeMode }) {
  dom.querySelectorAll('script, base').forEach((n) => n.remove());
  dom
    .querySelectorAll('meta[http-equiv], meta[charset], link[rel], object, embed')
    .forEach((n) => n.remove());
  if (safeMode) dom.querySelectorAll('iframe').forEach((n) => n.remove());

  dom.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes || []).forEach((attr) => {
      const name = String(attr?.name || '');
      if (/^on/i.test(name)) el.removeAttribute(name);
    });
  });

  dom.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    const clean = sanitizeHrefForExport(href, { safeMode });
    if (!clean) {
      a.removeAttribute('href');
      a.removeAttribute('target');
      a.removeAttribute('rel');
      return;
    }
    a.setAttribute('href', clean);
    if (/^https?:\/\//i.test(clean)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  if (!safeMode) {
    dom.querySelectorAll('iframe').forEach((frame) => {
      const src = frame.getAttribute('src');
      const clean = sanitizeSrcForExport(src, { safeMode: true, allowData: false });
      if (!clean) frame.removeAttribute('src');
      else frame.setAttribute('src', clean);
    });
  }

  dom.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    const clean = sanitizeSrcForExport(src, { safeMode, allowData: true });
    if (!clean) img.removeAttribute('src');
    else img.setAttribute('src', clean);
    img.removeAttribute('srcset');
  });
}

const ADMONITION_TYPE_LABELS = Object.freeze({
  note: '提示',
  tip: '提示',
  hint: '提示',
  info: '信息',
  important: '重要',
  warning: '警告',
  warn: '警告',
  caution: '注意',
  danger: '危险',
  error: '错误',
  success: '成功',
  check: '成功',
  question: '问题'
});

function normalizeAdmonitionType(typeRaw) {
  const type = String(typeRaw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!type) return 'note';
  if (type === 'warn') return 'warning';
  if (type === 'hint') return 'tip';
  if (type === 'check') return 'success';
  return type;
}

function parseAdmonitionMarker(line) {
  const match = String(line || '').match(/^!!!\s*([A-Za-z][\w-]*)(?:\s+(.*?))?\s*$/);
  if (!match) return null;

  const type = normalizeAdmonitionType(match[1]);
  let title = String(match[2] || '').trim();
  if (
    (title.startsWith('"') && title.endsWith('"')) ||
    (title.startsWith("'") && title.endsWith("'")) ||
    (title.startsWith('“') && title.endsWith('”'))
  ) {
    title = title.slice(1, -1).trim();
  }

  return {
    type,
    title: title || ADMONITION_TYPE_LABELS[type] || type
  };
}

function installAdmonitionMarkdownRule(md) {
  if (!md?.block?.ruler || md.__aiToolsAdmonitionRuleInstalled) return;
  md.__aiToolsAdmonitionRuleInstalled = true;

  md.block.ruler.before('fence', 'ai_tools_admonition', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const marker = parseAdmonitionMarker(state.src.slice(start, max));
    if (!marker) return false;

    const baseIndent = state.sCount[startLine];
    let nextLine = startLine + 1;
    let content = '';
    let hasExplicitClose = false;

    for (let line = startLine + 1; line < endLine; line += 1) {
      const lineStart = state.bMarks[line] + state.tShift[line];
      const lineMax = state.eMarks[line];
      if (/^!!!\s*$/.test(state.src.slice(lineStart, lineMax))) {
        content = state.getLines(startLine + 1, line, baseIndent, false);
        nextLine = line + 1;
        hasExplicitClose = true;
        break;
      }
    }

    if (!hasExplicitClose) {
      let indentedEndLine = nextLine;
      let hasIndentedContent = false;
      while (indentedEndLine < endLine) {
        if (!state.isEmpty(indentedEndLine) && state.sCount[indentedEndLine] <= baseIndent) break;
        if (!state.isEmpty(indentedEndLine)) hasIndentedContent = true;
        indentedEndLine += 1;
      }

      if (hasIndentedContent) {
        nextLine = indentedEndLine;
        content = state.getLines(startLine + 1, nextLine, baseIndent + 4, false);
      } else {
        while (nextLine < endLine && state.isEmpty(nextLine)) nextLine += 1;
        const contentStartLine = nextLine;
        while (nextLine < endLine) {
          if (state.isEmpty(nextLine)) break;
          const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
          const lineMax = state.eMarks[nextLine];
          const lineText = state.src.slice(lineStart, lineMax);
          if (/^!!!\s*$/.test(lineText) || parseAdmonitionMarker(lineText)) break;
          nextLine += 1;
        }
        if (nextLine <= contentStartLine) return false;
        content = state.getLines(contentStartLine, nextLine, baseIndent, false);
      }
    }

    if (!content.trim()) return false;
    if (silent) return true;

    const open = state.push('admonition_open', 'aside', 1);
    open.attrSet('class', `note-admonition note-admonition--${marker.type}`);

    const titleOpen = state.push('admonition_title_open', 'div', 1);
    titleOpen.attrSet('class', 'note-admonition__title');
    const titleText = state.push('text', '', 0);
    titleText.content = marker.title;
    state.push('admonition_title_close', 'div', -1);

    const bodyOpen = state.push('admonition_body_open', 'div', 1);
    bodyOpen.attrSet('class', 'note-admonition__body');
    state.md.block.parse(content, state.md, state.env, state.tokens);
    state.push('admonition_body_close', 'div', -1);

    state.push('admonition_close', 'aside', -1);
    state.line = nextLine;
    return true;
  });
}

function waitForAnimationFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function createExportRenderHost() {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-20000px';
  host.style.top = '0';
  host.style.width = '1200px';
  host.style.height = '800px';
  host.style.pointerEvents = 'none';
  host.style.opacity = '0';
  host.style.overflow = 'hidden';
  host.style.zIndex = '-1';
  document.body.appendChild(host);
  return host;
}

function isCodeBlockLanguage(code, language) {
  const className = String(code?.getAttribute?.('class') || '');
  return new RegExp(`(?:^|\\s)(?:language|lang)-${language}(?:\\s|$)`, 'i').test(className);
}

function normalizeMermaidExportSource(source) {
  const text = String(source || '');
  if (!text.trim()) return text;

  const replacements = [
    [/^(\s*)xychart(\s|$)/, '$1xychart-beta$2'],
    [/^(\s*)sankey(\s|$)/, '$1sankey-beta$2'],
    [/^(\s*)radar(\s|$)/, '$1radar-beta$2'],
    [/^(\s*)block(\s|$)/, '$1block-beta$2']
  ];

  let next = text;
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(next)) {
      next = next.replace(pattern, replacement);
      break;
    }
  }

  return next;
}

async function renderDiagramBlocksForExport(dom, { theme = 'light' } = {}) {
  const mermaidBlocks = Array.from(dom.querySelectorAll('pre > code')).filter((code) => isCodeBlockLanguage(code, 'mermaid'));
  const echartsBlocks = Array.from(dom.querySelectorAll('pre > code')).filter((code) => isCodeBlockLanguage(code, 'echarts'));

  if (!mermaidBlocks.length && !echartsBlocks.length) return;

  await ensureMarkdownPreviewRuntime();

  const [mermaidMod, echartsMod] = await Promise.all([
    import('mermaid'),
    import('echarts')
  ]);

  const mermaid = mermaidMod?.default || mermaidMod;
  const echarts = echartsMod?.default || echartsMod;
  const renderHost = createExportRenderHost();
  const chartTheme = theme === 'dark' ? 'dark' : 'light';
  const chartBackground = theme === 'dark' ? '#0f172a' : '#ffffff';

  try {
    if (mermaidBlocks.length && mermaid?.initialize && mermaid?.render) {
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'default'
      });

      for (const [index, code] of mermaidBlocks.entries()) {
        const source = normalizeMermaidExportSource(code.textContent || '').trim();
        if (!source) continue;

        const pre = code.parentElement;
        if (!pre?.parentElement) continue;

        try {
          const { svg } = await mermaid.render(`note-export-mermaid-${Date.now()}-${index}`, source, renderHost);
          const wrapper = dom.createElement('div');
          wrapper.className = 'note-export-diagram note-export-diagram--mermaid';
          const safeSvg = sanitizeSvgTree(svg || '', { aggressive: true });
          wrapper.appendChild(dom.importNode(safeSvg, true));
          wrapper.querySelector('svg')?.removeAttribute('height');
          pre.replaceWith(wrapper);
        } catch (err) {
          console.warn('导出 HTML 时 Mermaid 渲染失败：', err);
        }
      }
    }

    if (echartsBlocks.length && echarts?.init) {
      for (const code of echartsBlocks) {
        const source = String(code.textContent || '').trim();
        if (!source) continue;

        const pre = code.parentElement;
        if (!pre?.parentElement) continue;

        let chart = null;
        const chartHost = document.createElement('div');
        chartHost.style.width = '960px';
        chartHost.style.height = '540px';
        chartHost.style.position = 'absolute';
        chartHost.style.left = '0';
        chartHost.style.top = '0';
        chartHost.style.background = chartBackground;
        renderHost.appendChild(chartHost);

        try {
          const option = new Function(`return ${source}`)();
          if (!option || typeof option !== 'object') {
            throw new Error('ECharts option 需要返回一个对象');
          }

          chart = echarts.init(chartHost, chartTheme, { renderer: 'canvas' });
          chart.setOption(option);
          chart.resize();
          await waitForAnimationFrame();
          await waitForAnimationFrame();

          const dataUrl = chart.getDataURL({
            type: 'png',
            pixelRatio: 2,
            backgroundColor: chartBackground
          });

          if (dataUrl) {
            const figure = dom.createElement('figure');
            figure.className = 'note-export-diagram note-export-diagram--echarts';

            const img = dom.createElement('img');
            img.setAttribute('src', dataUrl);
            img.setAttribute('alt', 'ECharts 图表');
            img.setAttribute('loading', 'lazy');

            figure.appendChild(img);
            pre.replaceWith(figure);
          }
        } catch (err) {
          console.warn('导出 HTML 时 ECharts 渲染失败：', err);
        } finally {
          chart?.dispose?.();
          chartHost.remove();
        }
      }
    }
  } finally {
    renderHost.remove();
  }
}

function resolveImageFileRelPathFromSrc(notePath, srcRaw) {
  const src = String(srcRaw || '').trim();
  if (!src) return null;

  // External / unsupported scheme
  if (
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('file:') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src)
  ) {
    return null;
  }

  const decoded = safeDecodeURIComponent(stripUrlHashAndQuery(src));
  const baseDir = String(notePath || '').includes('/') ? path.dirname(notePath) : 'note';
  let resolved;
  if (decoded.startsWith('/')) {
    const safeAbsRel = sanitizeSubPathUnderRoot(decoded);
    if (!safeAbsRel) return null;
    resolved = safeAbsRel.startsWith('note/') ? safeAbsRel : `note/${safeAbsRel}`;
  } else {
    resolved = path.normalize(path.join(baseDir, decoded));
  }
  const rel = String(resolved || '').replace(/\\/g, '/');

  // 仅嵌入 note/ 下的本地图片
  if (rel.startsWith('note/')) return rel;
  return null;
}

function buildStandaloneHtml({ title, bodyHtml, theme = 'light' }) {
  const safeTitle = String(title || 'note').replace(/[<>&"]/g, (c) => {
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '&') return '&amp;';
    if (c === '"') return '&quot;';
    return c;
  });

  const csp = `default-src 'none'; img-src data: http: https:; style-src 'unsafe-inline'; frame-src http: https:; base-uri 'none'; form-action 'none'; object-src 'none'`;
  const isDark = theme === 'dark';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="referrer" content="no-referrer" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: ${isDark ? 'dark' : 'light'}; }
    body { margin: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.6; background: ${isDark ? '#0f172a' : '#ffffff'}; color: ${isDark ? '#e5e7eb' : '#111827'}; }
    a { color: ${isDark ? '#7dd3fc' : '#2563eb'}; }
    img { max-width: 100%; height: auto; }
    pre { overflow: auto; padding: 12px; border-radius: 8px; background: rgba(127,127,127,0.12); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    blockquote { margin: 0; padding-left: 12px; border-left: 4px solid rgba(127,127,127,0.35); color: rgba(127,127,127,0.95); }
    table { border-collapse: collapse; }
    th, td { border: 1px solid rgba(127,127,127,0.35); padding: 6px 10px; }
    .note-admonition { --note-admonition-color: ${isDark ? '#38bdf8' : '#0284c7'}; margin: 16px 0; padding: 12px 14px; border: 1px solid ${isDark ? 'rgba(56, 189, 248, 0.38)' : 'rgba(2, 132, 199, 0.3)'}; border-color: color-mix(in srgb, var(--note-admonition-color) 42%, transparent); border-left-width: 4px; border-radius: 8px; background: ${isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.08)'}; background: color-mix(in srgb, var(--note-admonition-color) ${isDark ? '14%' : '9%'}, transparent); }
    .note-admonition--tip, .note-admonition--success { --note-admonition-color: ${isDark ? '#34d399' : '#059669'}; }
    .note-admonition--warning, .note-admonition--caution { --note-admonition-color: ${isDark ? '#fbbf24' : '#d97706'}; }
    .note-admonition--danger, .note-admonition--error { --note-admonition-color: ${isDark ? '#fb7185' : '#e11d48'}; }
    .note-admonition--important { --note-admonition-color: ${isDark ? '#a78bfa' : '#7c3aed'}; }
    .note-admonition--question { --note-admonition-color: ${isDark ? '#22d3ee' : '#0891b2'}; }
    .note-admonition__title { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; color: var(--note-admonition-color); font-weight: 700; }
    .note-admonition__title::before { content: "!"; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: var(--note-admonition-color); color: ${isDark ? '#0f172a' : '#ffffff'}; font-size: 12px; line-height: 1; }
    .note-admonition__body > :first-child { margin-top: 0; }
    .note-admonition__body > :last-child { margin-bottom: 0; }
    .note-export-diagram { margin: 16px 0; padding: 16px; border-radius: 12px; border: 1px solid rgba(127,127,127,0.2); background: ${isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(248, 250, 252, 0.9)'}; display: flex; justify-content: center; align-items: center; overflow: auto; }
    .note-export-diagram img,
    .note-export-diagram svg { display: block; max-width: 100%; height: auto; }
    .note-export-diagram--echarts img { width: min(100%, 960px); }
  </style>
</head>
<body>
${String(bodyHtml || '')}
</body>
</html>`;
}

async function exportNoteAsHtml(notePath, options = {}) {
  const allowRawHtml = options?.allowRawHtml !== false;
  const safeMode = !allowRawHtml;
  const p = String(notePath || '');
  if (!p || !p.endsWith('.md')) {
    message.warning('仅支持导出 .md 笔记');
    return;
  }

  const protectedMeta = getProtectedNoteMeta(p);
  const notePassword = getUnlockedPassword(p);
  if (protectedMeta && !notePassword) {
    message.warning('受保护的 Markdown 笔记请先在编辑器中解锁后再导出');
    return;
  }

  const destPath = p.replace(/\.md$/i, '.html');
  const doExport = async () => {
    try {
      const rawMarkdown = String(await readFile(p, 'utf-8') || '');
      const markdown = protectedMeta
        ? await decryptNoteContent(rawMarkdown, notePassword)
        : rawMarkdown;
      const markdownItMod = await import('markdown-it');
      const MarkdownIt = markdownItMod?.default || markdownItMod;
      const md = new MarkdownIt({ html: allowRawHtml, linkify: true, breaks: true });
      installAdmonitionMarkdownRule(md);
      const rendered = md.render(String(markdown || ''));

      const dom = new DOMParser().parseFromString(rendered, 'text/html');
      await renderDiagramBlocksForExport(dom, { theme: props.theme });
      const imgs = Array.from(dom.querySelectorAll('img'));
      for (const img of imgs) {
        const src = img.getAttribute('src');
        const fileRel = resolveImageFileRelPathFromSrc(p, src);
        if (!fileRel) continue;

        try {
          const mime = guessMimeByExt(path.extname(fileRel));
          const buf = await readFile(fileRel, null);
          const dataUrl = await binaryToDataUrl(buf, mime);
          if (dataUrl) img.setAttribute('src', dataUrl);
        } catch (e) {
          console.warn('导出时读取图片失败：', fileRel, e);
        }
      }

      sanitizeExportedDom(dom, { safeMode });
      const title = path.basename(p, '.md');
      const html = buildStandaloneHtml({ title, bodyHtml: dom.body.innerHTML, theme: props.theme });
      await writeFile(destPath, html);
      message.success(`已导出：${destPath}`);
    } catch (err) {
      message.error('导出失败：' + (err?.message || String(err)));
    }
  };

  const already = await exists(destPath);
  if (!already) {
    await doExport();
    return;
  }

  dialog.warning({
    title: '导出 HTML',
    content: `目标文件已存在，是否覆盖？\n${destPath}`,
    positiveText: '覆盖',
    negativeText: '取消',
    onPositiveClick: async () => {
      await doExport();
    }
  });
}

function getNodeNoteType(node) {
  return String(node?.noteType || getNoteTypeByPath(node?.key || ''));
}

function buildLeafNode(fullPath) {
  return {
    key: fullPath,
    label: stripNoteExtension(path.basename(fullPath)),
    isLeaf: true,
    noteType: getNoteTypeByPath(fullPath)
  };
}

function buildNewNoteFileName(name, noteType) {
  const cleanName = stripNoteExtension(String(name || '').trim());
  return `${cleanName}${getNoteExtensionByType(noteType)}`;
}

function buildNewNoteContent(noteType) {
  return noteType === 'notebook' ? serializeNotebook(createEmptyNotebook()) : '';
}

// 右键新建笔记（直接弹出输入框）
async function createNoteInFolder(folderPath, noteType = 'markdown') {
  const inputValue = ref('');
  dialog.create({
    title: `新建${getNoteTypeLabel(noteType)}`,
    content: () => h('div', [
      h('span', null, '笔记名称：'),
      h(NInput, {
        value: inputValue.value,
        onUpdateValue: (val) => { inputValue.value = val; },
        autofocus: true,
        placeholder: '请输入笔记名称（不含扩展名）',
        style: 'margin-top: 8px; width: 100%;'
      })
    ]),
    positiveText: '创建',
    negativeText: '取消',
    onPositiveClick: async () => {
      const name = inputValue.value?.trim();
      if (!name) {
        message.warning('名称不能为空');
        return false;
      }
      const fileName = buildNewNoteFileName(name, noteType);
      const fullPath = folderPath + '/' + fileName;
      const fileExists = await exists(fullPath);
      if (fileExists) {
        message.warning('已存在同名文件');
        return false;
      }
      try {
        await writeFile(fullPath, buildNewNoteContent(noteType));
        message.success(`${getNoteTypeLabel(noteType)}创建成功`);

        const parentNode = folderPath === 'note' ? null : findNodeByKey(folderPath);
        const newNode = buildLeafNode(fullPath);
        if (parentNode) {
          if (!parentNode.children) parentNode.children = [];
          parentNode.children.push(newNode);
          parentNode.children.sort((a, b) => {
            if (a.isLeaf === b.isLeaf) return a.label.localeCompare(b.label);
            return a.isLeaf ? 1 : -1;
          });
          if (!expandedKeys.value.includes(folderPath)) {
            expandedKeys.value.push(folderPath);
          }
        } else {
          treeData.value.push(newNode);
          treeData.value.sort((a, b) => {
            if (a.isLeaf === b.isLeaf) return a.label.localeCompare(b.label);
            return a.isLeaf ? 1 : -1;
          });
        }
        rebuildTreeNodeIndex();
        selectedKeys.value = [fullPath];
        emit('select', fullPath);
        return true;
      } catch (err) {
        message.error('创建失败：' + err.message);
        return false;
      }
    }
  });
}

// 欢迎界面 “New Note” 按钮触发：打开文件夹选择器
function openFolderPicker(noteType = 'markdown') {
  pendingCreateNoteType.value = noteType;
  if (currentNode.value && currentNode.value.children) {
    selectedFolderKeys.value = [currentNode.value.key];
  } else {
    selectedFolderKeys.value = ['note'];
  }
  newNoteName.value = '';
  showFolderPicker.value = true;
}

// 模态框内新建笔记
async function createNoteInSelectedFolder() {
  const folderPath = selectedFolderKeys.value[0] || 'note';
  const name = newNoteName.value.trim();
  const noteType = pendingCreateNoteType.value;
  if (!name) {
    message.warning('笔记名称不能为空');
    return;
  }
  const fileName = buildNewNoteFileName(name, noteType);
  const fullPath = folderPath + '/' + fileName;
  const fileExists = await exists(fullPath);
  if (fileExists) {
    message.warning('已存在同名文件');
    return;
  }
  try {
    await writeFile(fullPath, buildNewNoteContent(noteType));
    message.success(`${getNoteTypeLabel(noteType)}创建成功`);
    showFolderPicker.value = false;

    const parentNode = folderPath === 'note' ? null : findNodeByKey(folderPath);
    const newNode = buildLeafNode(fullPath);
    if (parentNode) {
      if (!parentNode.children) parentNode.children = [];
      parentNode.children.push(newNode);
      parentNode.children.sort((a, b) => {
        if (a.isLeaf === b.isLeaf) return a.label.localeCompare(b.label);
        return a.isLeaf ? 1 : -1;
      });
      if (!expandedKeys.value.includes(folderPath)) {
        expandedKeys.value.push(folderPath);
      }
    } else {
      treeData.value.push(newNode);
      treeData.value.sort((a, b) => {
        if (a.isLeaf === b.isLeaf) return a.label.localeCompare(b.label);
        return a.isLeaf ? 1 : -1;
      });
    }
    rebuildTreeNodeIndex();
    selectedKeys.value = [fullPath];
    emit('select', fullPath);
  } catch (err) {
    message.error('创建失败：' + err.message);
  }
}

// 新建文件夹（通用）
async function createFolderInPath(parentPath, folderName) {
  const fullPath = parentPath + '/' + folderName;
  const folderExists = await exists(fullPath);
  if (folderExists) {
    message.warning('已存在同名文件夹');
    throw new Error('文件夹已存在');
  }
  try {
    await createDirectory(fullPath);
    message.success('文件夹创建成功');
    const parentNode = parentPath === 'note' ? null : findNodeByKey(parentPath);
    const newNode = {
      key: fullPath,
      label: folderName,
      children: []
    };
    if (parentNode) {
      if (!parentNode.children) parentNode.children = [];
      parentNode.children.push(newNode);
      parentNode.children.sort((a, b) => {
        if (a.isLeaf === b.isLeaf) return a.label.localeCompare(b.label);
        return a.isLeaf ? 1 : -1;
      });
      if (!expandedKeys.value.includes(parentPath)) {
        expandedKeys.value.push(parentPath);
      }
    } else {
      treeData.value.push(newNode);
      treeData.value.sort((a, b) => {
        if (a.isLeaf === b.isLeaf) return a.label.localeCompare(b.label);
        return a.isLeaf ? 1 : -1;
      });
    }
    rebuildTreeNodeIndex();
    selectedKeys.value = [fullPath];
    return fullPath;
  } catch (err) {
    message.error('创建失败：' + err.message);
    throw err;
  }
}

// 右键新建文件夹
async function createFolder(parentNode) {
  const parentPath = parentNode ? getDirectoryPathForNode(parentNode) : 'note';
  const inputValue = ref('');
  dialog.create({
    title: '新建文件夹',
    content: () => h('div', [
      h('span', null, '文件夹名称：'),
      h(NInput, {
        value: inputValue.value,
        onUpdateValue: (val) => { inputValue.value = val; },
        autofocus: true,
        placeholder: '请输入文件夹名称',
        style: 'margin-top: 8px; width: 100%;'
      })
    ]),
    positiveText: '创建',
    negativeText: '取消',
    onPositiveClick: async () => {
      const name = inputValue.value?.trim();
      if (!name) {
        message.warning('名称不能为空');
        return false;
      }
      try {
        await createFolderInPath(parentPath, name);
        return true;
      } catch {
        return false;
      }
    }
  });
}

// 模态框内新建文件夹
async function openNewFolderDialog() {
  const parentPath = selectedFolderKeys.value[0] || 'note';
  const inputValue = ref('');
  dialog.create({
    title: '新建文件夹',
    content: () => h('div', [
      h('span', null, '文件夹名称：'),
      h(NInput, {
        value: inputValue.value,
        onUpdateValue: (val) => { inputValue.value = val; },
        autofocus: true,
        placeholder: '请输入文件夹名称',
        style: 'margin-top: 8px; width: 100%;'
      })
    ]),
    positiveText: '创建',
    negativeText: '取消',
    onPositiveClick: async () => {
      const name = inputValue.value?.trim();
      if (!name) {
        message.warning('名称不能为空');
        return false;
      }
      try {
        const newPath = await createFolderInPath(parentPath, name);
        selectedFolderKeys.value = [newPath];
        if (!folderExpandedKeys.value.includes(parentPath)) {
          folderExpandedKeys.value.push(parentPath);
        }
        return true;
      } catch {
        return false;
      }
    }
  });
}

// 检查文件夹内是否有文件
async function hasFilesInFolder(folderPath) {
  try {
    const entries = await listDirectory(folderPath);
    for (const entry of entries) {
      const statInfo = await stat(entry);
      if (!statInfo.isDirectory()) return true;
      const dirName = String(entry || '').split('/').pop();
      if (dirName === 'assets' || String(dirName || '').endsWith('.assets')) return true;
      const has = await hasFilesInFolder(entry);
      if (has) return true;
    }
    return false;
  } catch (err) {
    console.error('检查文件夹内容失败：', err);
    return false;
  }
}

async function getAllNoteFilesInFolder(folderPath) {
  const files = [];
  const entries = await listDirectory(folderPath);
  for (const entry of entries) {
    const statInfo = await stat(entry);
    if (statInfo.isDirectory()) {
      const dirName = String(entry || '').split('/').pop();
      if (dirName === 'assets' || String(dirName || '').endsWith('.assets')) continue;
      const subFiles = await getAllNoteFilesInFolder(entry);
      files.push(...subFiles);
    } else if (isSupportedNotePath(entry)) {
      files.push(entry);
    }
  }
  return files;
}

/**
 * 删除单个笔记引用的所有图片文件，并清理空目录
 */
async function deleteImagesForNote(notePath) {
  await deleteNoteAttachmentDirectories(notePath).catch((err) => {
    console.warn(`删除笔记附件失败：${notePath}`, err);
  });
}

/**
 * 删除文件夹内所有笔记引用的图片
 */
async function deleteImagesForFolder(folderPath) {
  const noteFiles = await getAllNoteFilesInFolder(folderPath);
  for (const noteFile of noteFiles) {
    await deleteImagesForNote(noteFile);
  }
}

// ---------- 重命名 ----------
// ---------- 重命名（同步 *.assets 目录 + 正文图片路径）----------
function copyToClipboard(text) {
  return copyTextToClipboard(text, {
    onUnsupported: () => message.warning('当前环境不支持剪贴板复制'),
    onSuccess: () => message.success('已复制到剪贴板'),
    onError: (err) => message.error('复制失败：' + (err?.message || String(err)))
  });
}

function getProtectedNoteMeta(filePath) {
  const normalized = toPosixPath(String(filePath || '').trim());
  if (!normalized) return null;
  return noteSecurity.value.protectedNotes[normalized] || null;
}

function getUnlockedPassword(filePath) {
  const normalized = toPosixPath(String(filePath || '').trim());
  if (!normalized || typeof props.getUnlockedPassword !== 'function') return '';
  return String(props.getUnlockedPassword(normalized) || '');
}

function buildNoteHrefFromPath(noteAbsPath) {
  return buildNoteHrefFromPathUtil(noteAbsPath);
}

function safeDecodeURIComponent(val) {
  return safeDecodeURIComponentUtil(val);
}

function stripUrlHashAndQuery(url) {
  return stripUrlHashAndQueryUtil(url);
}

function splitMarkdownLinkDestination(insideRaw) {
  return splitMarkdownLinkDestinationUtil(insideRaw);
}

function sanitizeSubPathUnderRoot(subPathRaw) {
  return sanitizeSubPathUnderRootUtil(subPathRaw);
}

function toPosixPath(p) {
  return toPosixPathUtil(p);
}

function rewriteNoteAssetsLinksInMarkdown(markdown, oldDocName, newDocName) {
  return rewriteNoteAssetsLinksInMarkdownUtil(markdown, oldDocName, newDocName);
}

async function ensureDirectoryExists(dirPath) {
  if (!(await exists(dirPath))) {
    await createDirectory(dirPath);
  }
}

const DIRECTORY_COPY_CONCURRENCY = 8;

function createAsyncTaskQueue() {
  const items = [];
  const waiters = [];
  let closed = false;

  return {
    push(item) {
      if (closed) return;
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ value: item, done: false });
        return;
      }
      items.push(item);
    },
    close() {
      if (closed) return;
      closed = true;
      while (waiters.length) {
        const waiter = waiters.shift();
        waiter({ value: undefined, done: true });
      }
    },
    async shift() {
      if (items.length) {
        return { value: items.shift(), done: false };
      }
      if (closed) {
        return { value: undefined, done: true };
      }
      return new Promise((resolve) => waiters.push(resolve));
    }
  };
}

async function copyDirectoryWithConcurrency(srcPath, destPath, options = {}) {
  const queue = createAsyncTaskQueue();
  const workerCount = Math.max(1, Number(options.concurrency) || DIRECTORY_COPY_CONCURRENCY);
  const mergeDirectories = options.mergeDirectories === true;
  const skipExistingFiles = options.skipExistingFiles === true;
  const binary = options.binary === true;
  let pendingTasks = 0;
  let firstError = null;

  const enqueue = (task) => {
    pendingTasks += 1;
    queue.push(task);
  };

  enqueue({ type: 'directory', srcPath, destPath });

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const { value: task, done } = await queue.shift();
      if (done) return;

      try {
        if (task.type === 'directory') {
          if (mergeDirectories) {
            await ensureDirectoryExists(task.destPath);
          } else {
            await createDirectory(task.destPath);
          }

          const entries = await listDirectory(task.srcPath);
          for (const entry of entries) {
            const statInfo = await stat(entry);
            const relative = entry.substring(task.srcPath.length + 1);
            const destEntry = toPosixPath(task.destPath + '/' + relative);
            if (statInfo.isDirectory()) {
              enqueue({ type: 'directory', srcPath: entry, destPath: destEntry });
            } else {
              enqueue({ type: 'file', srcPath: entry, destPath: destEntry });
            }
          }
        } else {
          if (skipExistingFiles && (await exists(task.destPath))) continue;
          const fileContent = binary ? await readFile(task.srcPath, null) : await readFile(task.srcPath);
          await writeFile(task.destPath, fileContent);
        }
      } catch (err) {
        if (!firstError) firstError = err;
      } finally {
        pendingTasks -= 1;
        if (pendingTasks === 0) {
          queue.close();
        }
      }
    }
  });

  await Promise.all(workers);

  if (firstError) {
    throw firstError;
  }
}

/**
 * 复制文件夹内容到目标文件夹（如目标已存在则合并），以二进制方式复制文件（避免图片损坏）
 */
async function copyFolderMergeBinary(srcPath, destPath) {
  await copyDirectoryWithConcurrency(srcPath, destPath, {
    binary: true,
    skipExistingFiles: true,
    mergeDirectories: true
  });
}

async function renameNoteWithImagesMove(oldNotePath, newNotePath) {
  const oldDocName = path.basename(oldNotePath, path.extname(oldNotePath));
  const newDocName = path.basename(newNotePath, path.extname(newNotePath));

  const oldAssetsDirRel = toPosixPath(path.join(path.dirname(oldNotePath), `${oldDocName}.assets`));
  const newAssetsDirRel = toPosixPath(path.join(path.dirname(newNotePath), `${newDocName}.assets`));

  const needSyncAssets =
    oldAssetsDirRel &&
    newAssetsDirRel &&
    oldAssetsDirRel !== newAssetsDirRel &&
    (await exists(oldAssetsDirRel));

  const originalContent = await readFile(oldNotePath, 'utf-8');
  const rewrittenContent = rewriteNoteAssetsLinksInMarkdown(originalContent, oldDocName, newDocName);
  let assetsMoved = false;
  let newAssetsDirExisted = false;
  let noteMoved = false;
  if (needSyncAssets) {
    newAssetsDirExisted = await exists(newAssetsDirRel);
    if (!newAssetsDirExisted) {
      try {
        await moveItem(oldAssetsDirRel, newAssetsDirRel);
        assetsMoved = true;
      } catch {
        await copyFolderMergeBinary(oldAssetsDirRel, newAssetsDirRel);
      }
    } else {
      await copyFolderMergeBinary(oldAssetsDirRel, newAssetsDirRel);
    }
  }

  try {
    await moveItem(oldNotePath, newNotePath);
    noteMoved = true;

    if (rewrittenContent !== originalContent) {
      await writeFile(newNotePath, rewrittenContent);
    }
  } catch (err) {
    if (noteMoved) {
      await moveItem(newNotePath, oldNotePath).catch(() => {});
    }
    if (needSyncAssets && assetsMoved) {
      await moveItem(newAssetsDirRel, oldAssetsDirRel).catch(() => {});
    }
    if (needSyncAssets && !assetsMoved && !newAssetsDirExisted) {
      await deleteItem(newAssetsDirRel).catch(() => {});
    }
    throw err;
  }

  if (needSyncAssets) {
    if (!assetsMoved && (await exists(oldAssetsDirRel))) {
      await deleteItem(oldAssetsDirRel).catch((cleanupErr) => {
        console.warn('Failed to cleanup old assets dir:', oldAssetsDirRel, cleanupErr);
      });
    }
  }
}

async function renameFolderWithImagesMove(oldFolderPath, newFolderPath) {
  await moveItem(oldFolderPath, newFolderPath);
}

function replacePathPrefix(targetPath, oldBase, newBase) {
  const t = String(targetPath || '');
  if (t === oldBase) return newBase;
  if (t.startsWith(oldBase + '/')) return newBase + t.slice(oldBase.length);
  return t;
}

function uniqueStrings(list) {
  return Array.from(new Set(Array.isArray(list) ? list : []));
}

function updateNodeKeysRecursively(treeNode, oldBase, newBase) {
  if (!treeNode) return;
  treeNode.key = replacePathPrefix(treeNode.key, oldBase, newBase);
  if (Array.isArray(treeNode.children)) {
    treeNode.children.forEach((child) => updateNodeKeysRecursively(child, oldBase, newBase));
  }
}

function updateTreeStateAfterPathChange(oldBase, newBase) {
  expandedKeys.value = uniqueStrings(expandedKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)));
  folderExpandedKeys.value = uniqueStrings(folderExpandedKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)));
  selectedKeys.value = uniqueStrings(selectedKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)));
  selectedFolderKeys.value = uniqueStrings(selectedFolderKeys.value.map((k) => replacePathPrefix(k, oldBase, newBase)));

  const nextLoaded = new Set();
  for (const p of loadedPaths) {
    nextLoaded.add(replacePathPrefix(p, oldBase, newBase));
  }
  loadedPaths.clear();
  for (const p of nextLoaded) loadedPaths.add(p);
  rebuildTreeNodeIndex();
}

async function renameNode(node) {
  const isFile = node.isLeaf;
  const oldPath = node.key;
  const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
  const oldName = node.label;
  const protectedMeta = isFile && getNodeNoteType(node) === 'markdown' ? getProtectedNoteMeta(oldPath) : null;
  const unlockedPassword = protectedMeta ? getUnlockedPassword(oldPath) : '';
  if (protectedMeta && !unlockedPassword) {
    message.warning('受保护的 Markdown 笔记请先在编辑器中解锁后再重命名');
    return;
  }
  const inputValue = ref(oldName);
  dialog.create({
    title: '重命名',
    content: () => h('div', [
      h('span', null, '新名称：'),
      h(NInput, {
        value: inputValue.value,
        onUpdateValue: (val) => { inputValue.value = val; },
        autofocus: true,
        placeholder: isFile ? '请输入新名称（不含扩展名）' : '请输入新文件夹名称',
        style: 'margin-top: 8px; width: 100%;'
      })
    ]),
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      const newName = inputValue.value?.trim();
      if (!newName) {
        message.warning('名称不能为空');
        return false;
      }
      let newPath;
      if (isFile) {
        const baseName = buildNewNoteFileName(newName, getNodeNoteType(node));
        newPath = parentPath + '/' + baseName;
      } else {
        newPath = parentPath + '/' + newName;
      }
      if (oldPath === newPath) return true;

      const targetExists = await exists(newPath);
      if (targetExists) {
        message.warning('已存在同名文件或文件夹');
        return false;
      }

      try {
        await new Promise((resolve, reject) => {
          emit('prepare-rename', oldPath, newPath, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        if (isFile) {
          if (getNodeNoteType(node) === 'markdown') {
            await renameNoteWithImagesMove(oldPath, newPath);
          } else {
            await moveItem(oldPath, newPath);
          }
        } else {
          await renameFolderWithImagesMove(oldPath, newPath);
        }
        message.success('重命名成功');

        const parentNode = findNodeByKey(parentPath);
        if (parentNode) {
          const index = parentNode.children.findIndex(child => child.key === oldPath);
          if (index !== -1) {
            parentNode.children[index].key = newPath;
            parentNode.children[index].label = isFile ? stripNoteExtension(path.basename(newPath)) : newName;
            if (isFile) parentNode.children[index].noteType = getNodeNoteType(parentNode.children[index]);
            parentNode.children.sort((a, b) => {
              if (a.isLeaf === b.isLeaf) return a.label.localeCompare(b.label);
              return a.isLeaf ? 1 : -1;
            });
          }
        } else {
          const index = treeData.value.findIndex(child => child.key === oldPath);
          if (index !== -1) {
            treeData.value[index].key = newPath;
            treeData.value[index].label = isFile ? stripNoteExtension(path.basename(newPath)) : newName;
            if (isFile) treeData.value[index].noteType = getNodeNoteType(treeData.value[index]);
            treeData.value.sort((a, b) => {
              if (a.isLeaf === b.isLeaf) return a.label.localeCompare(b.label);
              return a.isLeaf ? 1 : -1;
            });
          }
        }
        rebuildTreeNodeIndex();
        if (selectedKeys.value.includes(oldPath)) {
          selectedKeys.value = [newPath];
        }
        if (!isFile) {
          updateNodeKeysRecursively(node, oldPath, newPath);
          updateTreeStateAfterPathChange(oldPath, newPath);
        }
        emit('rename', oldPath, newPath);
        return true;
      } catch (err) {
        message.error('重命名失败：' + err.message);
        return false;
      }
    }
  });
}

// 复制文件夹（辅助函数）
async function copyFolder(srcPath, destPath) {
  await copyDirectoryWithConcurrency(srcPath, destPath);
}

// ---------- 删除（集成图片清理）----------
async function deleteNode(node) {
  const isFolder = node.children !== undefined;
  let confirmMessage = `确定删除“${node.label}”吗？此操作不可撤销。`;
  if (isFolder) {
    const hasFiles = await hasFilesInFolder(node.key);
    if (hasFiles) {
      confirmMessage = '该文件夹包含文件，确定删除吗？其所有内容将被永久移除。';
    }
  }
  dialog.warning({
    title: '删除',
    content: confirmMessage,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await new Promise((resolve, reject) => {
          emit('prepare-delete', node.key, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        if (isFolder) {
          await deleteImagesForFolder(node.key);
        } else if (getNodeNoteType(node) === 'markdown') {
          await deleteImagesForNote(node.key);
        }

        // 再删除文件/文件夹本身
        await deleteItem(node.key);
        message.success('删除成功');

        // 更新树
        const parentPath = node.key.substring(0, node.key.lastIndexOf('/'));
        const parentNode = findNodeByKey(parentPath);
        if (parentNode) {
          parentNode.children = parentNode.children.filter(child => child.key !== node.key);
        } else {
          treeData.value = treeData.value.filter(child => child.key !== node.key);
        }
        rebuildTreeNodeIndex();
        if (selectedKeys.value.includes(node.key)) {
          selectedKeys.value = [];
        }
        emit('delete', node.key);
      } catch (err) {
        message.error('删除失败：' + err.message);
      }
    }
  });
}

// 前缀图标
function renderPrefix({ option }) {
  if (option.children) {
    const isExpanded = expandedKeys.value.includes(option.key);
    return h(NIcon, null, {
      default: () => isExpanded ? h(FolderOpenOutline) : h(Folder)
    });
  } else {
    return h(NIcon, null, {
      default: () => h(getNodeNoteType(option) === 'notebook' ? CodeSlashOutline : DocumentTextOutline)
    });
  }
}

function renderLabel({ option }) {
  const labelText = typeof option.label === 'string' ? option.label : String(option.label ?? '');
  return h('span', { class: 'tree-node-label', title: labelText }, labelText);
}

async function selectFile(filePath) {
  const p = toPosixPath(filePath);
  if (!p || !p.startsWith('note/')) return;

  // Expand & lazy-load ancestors so the target node exists in tree data.
  const parts = p.split('/').filter(Boolean);
  const ancestors = [];
  let current = 'note';
  for (let i = 1; i < parts.length - 1; i++) {
    current = `${current}/${parts[i]}`;
    ancestors.push(current);
  }

  if (ancestors.length) {
    expandedKeys.value = uniqueStrings([...expandedKeys.value, ...ancestors]);

    for (const dir of ancestors) {
      if (loadedPaths.has(dir)) continue;
      const node = findNodeByKey(dir);
      if (node && node.children && node.children.length === 0) {
        await loadDirectory(dir, node);
      }
    }
  }

  selectedKeys.value = [p];
}

// 暴露方法给父组件
defineExpose({
  openNewNoteModal: openFolderPicker,
  openNewNotebookModal: () => openFolderPicker('notebook'),
  selectFile
});
</script>

<style scoped>
.note-tree {
  display: flex;
  flex-direction: column;
  padding: 4px 2px 2px;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.note-tree.is-dark {
  color: rgba(226, 232, 240, 0.94);
}

.note-tree__toolbar {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.note-tree__search {
  flex: 0 0 auto;
  margin-bottom: 10px;
}

.note-tree__meta {
  margin-bottom: 10px;
  font-size: 12px;
  line-height: 1.5;
}

.note-tree__refresh {
  box-shadow: 0 10px 22px rgba(24, 43, 48, 0.08);
  border: 1px solid rgba(87, 126, 139, 0.14);
}

.note-tree.is-dark .note-tree__refresh {
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.28);
  border-color: rgba(148, 163, 184, 0.14);
}

.note-tree__scroll,
.note-tree__picker-list {
  border-radius: 16px;
  padding: 4px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.48), rgba(246, 248, 250, 0.56));
}

.note-tree__scroll {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  overscroll-behavior: contain;
}

.note-tree__scroll.is-drop-root-target {
  box-shadow: inset 0 0 0 1px rgba(55, 128, 138, 0.22), inset 0 0 0 999px rgba(55, 128, 138, 0.035);
}

.note-tree__list {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.note-tree__picker-list {
  max-height: 320px;
  overflow: auto;
}

.note-tree.is-dark .note-tree__scroll,
.note-tree.is-dark .note-tree__picker-list {
  border: none;
  background: transparent !important;
  box-shadow: none;
}

.note-tree :deep(.n-tree-node-wrapper) {
  margin: 2px 0;
}

.note-tree :deep(.n-tree-node-content) {
  border-radius: 12px;
  transition: background-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.note-tree :deep(.n-tree-node.is-drop-target > .n-tree-node-content) {
  background: linear-gradient(90deg, rgba(55, 128, 138, 0.2), rgba(55, 128, 138, 0.08));
  box-shadow: inset 0 0 0 1px rgba(55, 128, 138, 0.22);
}

.note-tree.is-dark :deep(.n-tree-node-content) {
  color: rgba(226, 232, 240, 0.94);
}

.note-tree.is-dark :deep(.n-tree-node.is-drop-target > .n-tree-node-content) {
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.18), rgba(148, 163, 184, 0.07));
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.22);
}

.note-tree.is-dark :deep(.n-tree-node-switcher) {
  color: rgba(148, 163, 184, 0.9);
}

.note-tree :deep(.n-tree-node-content:hover) {
  transform: translateX(2px);
  background: rgba(84, 131, 146, 0.08);
  box-shadow: inset 0 0 0 1px rgba(84, 131, 146, 0.08);
}

.note-tree.is-dark :deep(.n-tree-node-content:hover) {
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.1);
}

.note-tree :deep(.n-tree-node--selected > .n-tree-node-content) {
  background: linear-gradient(90deg, rgba(55, 128, 138, 0.16), rgba(55, 128, 138, 0.04));
  box-shadow: inset 0 0 0 1px rgba(55, 128, 138, 0.14);
}

.note-tree.is-dark :deep(.n-tree-node--selected > .n-tree-node-content) {
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
.note-name-input {
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
