<template>
  <div v-if="!filePath" :class="['welcome-container', { 'is-dark': theme === 'dark' }]">
    <n-card class="welcome-card" :bordered="false">
      <n-icon size="48" :depth="3">
        <FileTrayFullOutline />
      </n-icon>
      <h2>欢迎使用笔记</h2>
      <p>从右侧选择一篇笔记，或新建一篇开始使用。</p>
      <n-button type="primary" @click="$emit('new-note')">
        <template #icon>
          <n-icon><CreateOutline /></n-icon>
        </template>
        新建笔记
      </n-button>
    </n-card>
  </div>
  <div ref="editorContainerRef" v-else :class="['editor-container', { 'is-dark': theme === 'dark' }]">
    <div :class="['editor-shell', { 'is-catalog-collapsed': catalogCollapsed }]">
      <section class="editor-shell__main">
        <header class="editor-shell__header">
          <div class="editor-shell__heading">
            <span class="editor-shell__eyebrow">Markdown Workspace</span>
            <div class="editor-shell__title-row">
              <h3>{{ noteTitle }}</h3>
              <span class="editor-shell__path">{{ filePath }}</span>
            </div>
          </div>
          <n-button secondary size="small" class="editor-shell__toggle" @click="toggleCatalogCollapsed">
            {{ catalogCollapsed ? '显示目录' : '收起目录' }}
          </n-button>
        </header>

        <div class="editor-shell__body">
          <LazyMarkdownEditor
            ref="editorRef"
            v-model="content"
            :editor-id="editorId"
            previewTheme="github"
            :theme="theme"
            :toolbarsExclude="excludeToolbars"
            @on-upload-img="handleEditorUpload"
            @on-html-changed="handleHtmlChanged"
            @on-get-catalog="handleCatalogChange"
            style="height: 100%;"
          />
        </div>
      </section>

      <aside v-show="!catalogCollapsed" class="editor-shell__catalog-panel">
        <div class="editor-shell__catalog-header">
          <div class="editor-shell__catalog-heading">
            <span class="editor-shell__catalog-eyebrow">Document Nav</span>
            <strong>目录</strong>
          </div>
          <span class="editor-shell__catalog-meta">{{ catalogSummary }}</span>
        </div>

        <div ref="catalogBodyRef" class="editor-shell__catalog-body">
          <div v-if="catalogFlatItems.length" class="note-editor-catalog" role="navigation" aria-label="笔记目录">
            <button
              v-for="item in catalogFlatItems"
              :key="item.key"
              type="button"
              class="note-editor-catalog__item"
              :class="{ 'is-active': item.key === activeCatalogKey }"
              :style="{ '--catalog-depth': item.depth }"
              :data-catalog-key="item.key"
              :title="item.text"
              @click="scrollToCatalogItem(item.key)"
            >
              <span class="note-editor-catalog__text">{{ item.text }}</span>
            </button>
          </div>
          <div v-else class="editor-shell__catalog-empty">
            给笔记添加 # / ## 标题后，这里会自动生成独立目录。
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount, onMounted, onUnmounted, nextTick } from 'vue';
import path from 'path-browserify'; 
import { useMessage } from 'naive-ui';
import {
  readFile,
  writeFile,
  exists,
  createDirectory,
  getFileBlobUrl,
  getCachedFileBlobUrlSync,
  clearImageBlobCache,
} from '@/utils/fileOperations';
import LazyMarkdownEditor from '@/components/LazyMarkdownEditor.vue';
import { FileTrayFullOutline, CreateOutline } from '@vicons/ionicons5';
import { NIcon, NCard, NButton } from 'naive-ui';
import { copyTextToClipboard } from '@/utils/clipboard';
import { createMarkdownDiagramDecorator } from '@/utils/markdownDiagramDecorator';
import {
  toPosixPath as toPosixPathUtil,
  safeDecodeURIComponent as safeDecodeURIComponentUtil,
  stripUrlHashAndQuery as stripUrlHashAndQueryUtil,
  sanitizeSubPathUnderRoot as sanitizeSubPathUnderRootUtil,
  splitMarkdownLinkDestination as splitMarkdownLinkDestinationUtil,
  normalizeNotePathInRoot as normalizeNotePathInRootUtil,
  buildNoteHrefFromPath as buildNoteHrefFromPathUtil,
  resolveNoteAbsPathFromHref as resolveNoteAbsPathFromHrefUtil,
  rewriteNoteAssetsLinksInMarkdown as rewriteNoteAssetsLinksInMarkdownUtil
} from '@/utils/notePathUtils';
import {
  buildNoteAssetsDirectory,
  buildNoteAssetsStorage,
  buildUploadedImageAlt,
  resolveImageExtension
} from '@/utils/noteImageUpload';
import { cleanupUnusedNoteAttachments } from '@/utils/noteAttachmentCleanup';
import {
  decryptNoteContent,
  encryptNoteContent,
  isEncryptedNoteContent,
  replaceEncryptedNoteContent
} from '@/utils/noteEncryption';

// 配置 highlight.js 实例，关闭未转义 HTML 的警告
let hljsInstancePromise = null;

function getHighlightJs() {
  if (!hljsInstancePromise) {
    hljsInstancePromise = Promise.all([
      import('highlight.js'),
      import('highlight.js/styles/github.css')
    ]).then(([mod]) => {
      const hljs = mod?.default || mod;
      hljs.configure({
        ignoreUnescapedHTML: true
      });
      return hljs;
    });
  }
  return hljsInstancePromise;
}

const excludeToolbars = [
  'revoke', 'next', 'save', 'github', 'htmlPreview', 'pageFullscreen', 'fullscreen', 'preview', 'catalog'
];

const props = defineProps({
  filePath: {
    type: String,
    default: null
  },
  renameContext: {
    type: Object,
    default: null
  },
  noteAccess: {
    type: Object,
    default: null
  },
  theme: {
    type: String,
    default: 'light'
  }
});

const emit = defineEmits(['new-note', 'open-note']);

const message = useMessage();
const diagramDecorator = createMarkdownDiagramDecorator({
  message,
  getTheme: () => props.theme,
  getMarkdownSource: () => content.value
});
const editorRef = ref(null);
const editorContainerRef = ref(null);
const catalogBodyRef = ref(null);
const content = ref('');
const catalogItems = ref([]);
const catalogScrollElement = ref(null);
const catalogCollapsed = ref(true);
const activeCatalogKey = ref('');
const editorId = `note-editor-${Math.random().toString(36).slice(2, 10)}`;
let lastHandledRenameToken = null;
let cleanupTimeout = null;
let lastSavedFilePath = '';
let lastSavedContent = '';
let saveQueue = Promise.resolve();
let suppressContentWatcher = false;
let htmlRefreshTimer = null;

const noteTitle = computed(() => {
  if (!props.filePath) return '\u672a\u547d\u540d\u7b14\u8bb0';
  return path.basename(props.filePath, path.extname(props.filePath)) || '\u672a\u547d\u540d\u7b14\u8bb0';
});

function flattenCatalogItems(list = []) {
  const flat = [];
  let order = 0;

  const walk = (items) => {
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      order += 1;
      const line = normalizeCatalogLine(item.line);
      flat.push({
        key: [
          line !== null ? line : `line-${order}`,
          Math.max(1, Number(item.level) || 1),
          order
        ].join(':'),
        text: String(item.text || `标题 ${order}`),
        level: Math.max(1, Number(item.level) || 1),
        line,
        order
      });

      if (Array.isArray(item.children) && item.children.length) {
        walk(item.children);
      }
    });
  };

  walk(Array.isArray(list) ? list : []);
  const minLevel = flat.reduce((min, item) => Math.min(min, item.level), flat[0]?.level || 1);

  return flat.map((item) => ({
    ...item,
    depth: Math.max(0, item.level - minLevel)
  }));
}

const catalogFlatItems = computed(() => flattenCatalogItems(catalogItems.value));

const catalogSummary = computed(() => {
  const count = catalogFlatItems.value.length;
  return count ? `${count} \u4e2a\u6807\u9898` : '\u6682\u65e0\u6807\u9898';
});

function isProtectedNote() {
  return !!props.noteAccess?.protected;
}

function getNotePassword() {
  return String(props.noteAccess?.password || '');
}

function toPosixPath(p) {
  return toPosixPathUtil(p);
}

function safeDecodeURIComponent(val) {
  return safeDecodeURIComponentUtil(val);
}

function stripUrlHashAndQuery(url) {
  return stripUrlHashAndQueryUtil(url);
}

function sanitizeSubPathUnderRoot(subPathRaw) {
  return sanitizeSubPathUnderRootUtil(subPathRaw);
}

function splitMarkdownLinkDestination(insideRaw) {
  return splitMarkdownLinkDestinationUtil(insideRaw);
}

function isProbablyExternalSrc(src) {
  const s = String(src || '');
  if (!s) return true;
  if (s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('file:')) return true;
  if (s.startsWith('http://') || s.startsWith('https://')) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return true;
  return false;
}

function normalizeNotePathInRoot(notePath) {
  return normalizeNotePathInRootUtil(notePath);
}

function buildNoteHrefFromPath(noteAbsPath) {
  return buildNoteHrefFromPathUtil(noteAbsPath);
}

async function resolveNoteAbsPathFromHref(hrefRaw) {
  return resolveNoteAbsPathFromHrefUtil({
    hrefRaw,
    currentFilePath: props.filePath,
    currentDir: props.filePath ? toPosixPath(path.dirname(props.filePath)) : 'note',
    existsFn: exists
  });
}

async function openNoteFromHref(href) {
  const noteAbsPath = await resolveNoteAbsPathFromHref(href);
  if (!noteAbsPath) return false;
  emit('open-note', noteAbsPath);
  return true;
}

function rewriteNoteAssetsLinksInMarkdown(markdown, oldDocName, newDocName) {
  return rewriteNoteAssetsLinksInMarkdownUtil(markdown, oldDocName, newDocName);
}

function setEditorContent(nextContent) {
  suppressContentWatcher = true;
  content.value = String(nextContent ?? '');
  void nextTick(() => {
    suppressContentWatcher = false;
  });
}

function copyToClipboard(text) {
  return copyTextToClipboard(text, {
    onUnsupported: () => message.warning('当前环境不支持剪贴板复制'),
    onSuccess: () => message.success('\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f'),
    onError: (err) => message.error('\u590d\u5236\u5931\u8d25\uff1a' + (err?.message || String(err)))
  });
}

function getNoteAssetsInfo(noteFilePath) {
  return buildNoteAssetsDirectory(noteFilePath);
}

function scheduleCleanupAttachments(noteFilePath, markdown) {
  if (cleanupTimeout) clearTimeout(cleanupTimeout);
  const snapshotPath = String(noteFilePath || '');
  const snapshotMd = String(markdown || '');
  cleanupTimeout = setTimeout(() => {
    cleanupTimeout = null;
    cleanupUnusedNoteAttachments(snapshotPath, snapshotMd).catch((e) => {
      console.warn('cleanupUnusedNoteAttachments failed:', e);
    });
  }, 5000);
}

function toggleCatalogCollapsed() {
  catalogCollapsed.value = !catalogCollapsed.value;
  if (catalogCollapsed.value) {
    cleanupPreviewCatalogSync();
    return;
  }

  void nextTick(() => {
    bindPreviewCatalogHeadings();
  });
}

function handleCatalogChange(list = []) {
  catalogItems.value = Array.isArray(list) ? list : [];
  void nextTick(() => {
    syncCatalogScrollElement();
    bindPreviewCatalogHeadings();
    schedulePreviewCatalogMeasurement();
  });
}

function syncCatalogScrollElement(preview = getPreviewRoot()) {
  const nextScrollElement = resolvePreviewScrollContainer(preview) || null;
  if (catalogScrollElement.value === nextScrollElement) return;
  catalogScrollElement.value = nextScrollElement;
}

function cancelPreviewCatalogScrollFrame() {
  if (!previewCatalogScrollFrame) return;
  cancelAnimationFrame(previewCatalogScrollFrame);
  previewCatalogScrollFrame = 0;
}

function cancelPreviewCatalogMeasureFrame() {
  if (!previewCatalogMeasureFrame) return;
  cancelAnimationFrame(previewCatalogMeasureFrame);
  previewCatalogMeasureFrame = 0;
}

function cleanupPreviewCatalogSync() {
  cancelPreviewCatalogScrollFrame();
  cancelPreviewCatalogMeasureFrame();
  previewCatalogScrollSettleToken += 1;
  previewCatalogHeadings = [];
  activeCatalogKey.value = '';
  if (previewCatalogScrollListenerRoot) {
    previewCatalogScrollListenerRoot.removeEventListener('scroll', schedulePreviewCatalogSync);
    previewCatalogScrollListenerRoot = null;
  }
}

function getElementOffsetTopWithin(root, el) {
  if (!(root instanceof HTMLElement) || !(el instanceof HTMLElement)) return 0;
  const rootRect = root.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.top - rootRect.top + root.scrollTop;
}

function normalizeCatalogLine(line) {
  const n = Number(line);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function normalizeCatalogText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function getPreviewHeadingLevel(heading) {
  const match = String(heading?.tagName || '').match(/^H([1-6])$/i);
  return match ? Number(match[1]) : 0;
}

function getPreviewHeadingLine(heading) {
  return normalizeCatalogLine(heading?.dataset?.line);
}

function findPreviewHeadingForCatalogItem(item, headings, usedHeadings) {
  const available = headings.filter((heading) => !usedHeadings.has(heading));
  const expectedLine = normalizeCatalogLine(item.line);
  const expectedLevel = Math.max(1, Number(item.level) || 1);
  const expectedText = normalizeCatalogText(item.text);

  if (expectedLine !== null) {
    const sameLine = available.filter((heading) => getPreviewHeadingLine(heading) === expectedLine);
    const sameLineAndLevel = sameLine.filter((heading) => getPreviewHeadingLevel(heading) === expectedLevel);
    return (
      sameLineAndLevel.find((heading) => normalizeCatalogText(heading.textContent) === expectedText) ||
      sameLineAndLevel[0] ||
      sameLine[0] ||
      null
    );
  }

  return (
    available.find((heading) =>
      getPreviewHeadingLevel(heading) === expectedLevel &&
      normalizeCatalogText(heading.textContent) === expectedText
    ) ||
    available.find((heading) => getPreviewHeadingLevel(heading) === expectedLevel) ||
    available[0] ||
    null
  );
}

function ensureActiveCatalogItemVisible(key) {
  if (!key) return;
  const root = catalogBodyRef.value;
  if (!root?.querySelector) return;

  const target = root.querySelector(`.note-editor-catalog__item[data-catalog-key="${key}"]`);
  if (!target) return;

  const rootRect = root.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (targetRect.top >= rootRect.top && targetRect.bottom <= rootRect.bottom) return;
  target.scrollIntoView({ block: 'nearest' });
}

function syncPreviewCatalogActiveState() {
  previewCatalogScrollFrame = 0;
  if (catalogCollapsed.value) return;

  const scrollRoot = catalogScrollElement.value;
  if (!(scrollRoot instanceof HTMLElement) || !previewCatalogHeadings.length) {
    activeCatalogKey.value = '';
    return;
  }

  const threshold = scrollRoot.scrollTop + 28;
  let nextActiveKey = previewCatalogHeadings[0]?.key || '';

  for (const entry of previewCatalogHeadings) {
    if (!entry.heading.isConnected) continue;
    const top = Number.isFinite(entry.offsetTop)
      ? entry.offsetTop
      : getElementOffsetTopWithin(scrollRoot, entry.heading);
    if (top <= threshold) {
      nextActiveKey = entry.key;
      continue;
    }
    break;
  }

  if (nextActiveKey === activeCatalogKey.value) return;
  activeCatalogKey.value = nextActiveKey;
  ensureActiveCatalogItemVisible(nextActiveKey);
}

function measurePreviewCatalogHeadings() {
  const scrollRoot = catalogScrollElement.value;
  if (!(scrollRoot instanceof HTMLElement) || !previewCatalogHeadings.length) return;

  previewCatalogHeadings = previewCatalogHeadings
    .map((entry) => {
      if (!entry?.heading?.isConnected) return null;
      return {
        ...entry,
        offsetTop: getElementOffsetTopWithin(scrollRoot, entry.heading)
      };
    })
    .filter(Boolean);
}

function schedulePreviewCatalogMeasurement() {
  if (catalogCollapsed.value) return;
  if (previewCatalogMeasureFrame) return;
  previewCatalogMeasureFrame = requestAnimationFrame(() => {
    previewCatalogMeasureFrame = 0;
    measurePreviewCatalogHeadings();
    syncPreviewCatalogActiveState();
  });
}

function schedulePreviewCatalogSync() {
  if (catalogCollapsed.value) return;
  if (previewCatalogScrollFrame) return;
  previewCatalogScrollFrame = requestAnimationFrame(() => {
    syncPreviewCatalogActiveState();
  });
}

function bindPreviewCatalogHeadings(preview = getPreviewRoot()) {
  if (catalogCollapsed.value) {
    cleanupPreviewCatalogSync();
    return;
  }

  const flatItems = catalogFlatItems.value;
  const scrollRoot = resolvePreviewScrollContainer(preview) || null;
  syncCatalogScrollElement(preview);

  if (previewCatalogScrollListenerRoot !== scrollRoot) {
    previewCatalogScrollListenerRoot?.removeEventListener('scroll', schedulePreviewCatalogSync);
    previewCatalogScrollListenerRoot = scrollRoot;
    previewCatalogScrollListenerRoot?.addEventListener('scroll', schedulePreviewCatalogSync, { passive: true });
  }

  if (!preview || !flatItems.length) {
    previewCatalogHeadings = [];
    activeCatalogKey.value = '';
    return;
  }

  const headings = Array.from(preview.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const usedHeadings = new Set();
  previewCatalogHeadings = flatItems
    .map((item) => {
      const heading = findPreviewHeadingForCatalogItem(item, headings, usedHeadings);
      if (!(heading instanceof HTMLElement)) return null;
      usedHeadings.add(heading);
      heading.dataset.noteCatalogKey = item.key;
      return {
        key: item.key,
        heading,
        offsetTop: NaN
      };
    })
    .filter(Boolean);

  schedulePreviewCatalogMeasurement();
}

function getCatalogHeadingScrollTop(scrollRoot, heading) {
  return Math.max(0, getElementOffsetTopWithin(scrollRoot, heading) - 24);
}

function settleCatalogScrollPosition(entry, token) {
  const scrollRoot = catalogScrollElement.value;
  const heading = entry?.heading;
  if (token !== previewCatalogScrollSettleToken) return;
  if (!(scrollRoot instanceof HTMLElement) || !(heading instanceof HTMLElement) || !heading.isConnected) return;

  const nextTop = getCatalogHeadingScrollTop(scrollRoot, heading);
  if (Math.abs(scrollRoot.scrollTop - nextTop) <= 2) {
    schedulePreviewCatalogMeasurement();
    return;
  }

  scrollRoot.scrollTo({
    top: nextTop,
    behavior: 'auto'
  });
  schedulePreviewCatalogMeasurement();
}

function scrollToCatalogItem(key) {
  const scrollRoot = catalogScrollElement.value;
  let entry = previewCatalogHeadings.find((item) => item.key === key);
  if (!entry?.heading?.isConnected) {
    bindPreviewCatalogHeadings();
    entry = previewCatalogHeadings.find((item) => item.key === key);
  }
  if (!(scrollRoot instanceof HTMLElement) || !entry?.heading) return;

  const targetTop = getCatalogHeadingScrollTop(scrollRoot, entry.heading);
  previewCatalogScrollSettleToken += 1;
  const token = previewCatalogScrollSettleToken;
  scrollRoot.scrollTo({
    top: targetTop,
    behavior: 'smooth'
  });

  [180, 360, 700].forEach((delay) => {
    window.setTimeout(() => settleCatalogScrollPosition(entry, token), delay);
  });
}

function clearPendingHtmlRefresh() {
  if (!htmlRefreshTimer) return;
  clearTimeout(htmlRefreshTimer);
  htmlRefreshTimer = null;
}

function runWhenIdle(task) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task(), { timeout: 240 });
    return;
  }
  window.setTimeout(task, 48);
}


// ---------- 加载文件内容 ----------
async function loadFileContent(filePath) {
  try {
    const rawContent = String(await readFile(filePath, 'utf-8') || '');
    const fileContent = isProtectedNote()
      ? await decryptNoteContent(rawContent, getNotePassword())
      : rawContent;
    lastSavedFilePath = String(filePath || '');
    lastSavedContent = fileContent;
    setEditorContent(fileContent);
  } catch (err) {
    message.error('\u8bfb\u53d6\u6587\u4ef6\u5931\u8d25\uff1a' + (err?.message || String(err)));
  }
}

// ---------- 自动保存（防抖）----------
let saveTimeout = null;
async function persistNoteText(filePath, nextContent) {
  const snapshotPath = String(filePath || '');
  const snapshotContent = String(nextContent ?? '');
  if (!snapshotPath) return;

  if (!isProtectedNote()) {
    await writeFile(snapshotPath, snapshotContent);
    return;
  }

  const password = getNotePassword();
  if (!password) {
    throw new Error('当前受保护笔记缺少解锁密码，无法保存');
  }

  const fileExists = await exists(snapshotPath);
  if (!fileExists) {
    await writeFile(snapshotPath, await encryptNoteContent(snapshotContent, { notePassword: password }));
    return;
  }

  const rawContent = String(await readFile(snapshotPath, 'utf-8') || '');
  const encryptedContent = isEncryptedNoteContent(rawContent)
    ? await replaceEncryptedNoteContent(rawContent, {
        notePassword: password,
        plaintext: snapshotContent
      })
    : await encryptNoteContent(snapshotContent, { notePassword: password });

  await writeFile(snapshotPath, encryptedContent);
}

function queuePersistContent(filePath, nextContent) {
  const snapshotPath = String(filePath || '');
  const snapshotContent = String(nextContent ?? '');
  if (!snapshotPath) return Promise.resolve();

  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const fileExists = await exists(snapshotPath);
      if (!fileExists) return;
      if (lastSavedFilePath === snapshotPath && lastSavedContent === snapshotContent) return;
      await persistNoteText(snapshotPath, snapshotContent);
      lastSavedFilePath = snapshotPath;
      lastSavedContent = snapshotContent;
      scheduleCleanupAttachments(snapshotPath, snapshotContent);
    });

  return saveQueue;
}

watch(content, (newContent) => {
  if (suppressContentWatcher) return;
  if (!props.filePath) return;
  const nextContent = String(newContent ?? '');
  if (lastSavedFilePath === props.filePath && lastSavedContent === nextContent) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await queuePersistContent(props.filePath, nextContent);
    } catch (err) {
      message.error('\u81ea\u52a8\u4fdd\u5b58\u5931\u8d25\uff1a' + (err?.message || String(err)));
    }
  }, 500);
});

// ---------- 切换文档时处理 ----------
let previewRefreshScheduled = false;
let previewLinkRoot = null;
let previewImageObserver = null;
let previewImageObserverRoot = null;
let previewDiagramRoot = null;
let previewDiagramObserver = null;
let previewDiagramObserverSuspended = false;
let previewDiagramDecorateTimer = null;
let previewCatalogScrollFrame = 0;
let previewCatalogMeasureFrame = 0;
let previewCatalogHeadings = [];
let previewCatalogScrollListenerRoot = null;
let previewCatalogScrollSettleToken = 0;
let previewRenderToken = 0;
const pendingPreviewImageLoads = new Map();
const DIAGRAM_HOST_SELECTOR = 'div.md-editor-echarts, div.md-editor-mermaid, p.md-editor-mermaid';

watch(() => props.filePath, async (newPath, oldPath) => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  clearPendingHtmlRefresh();
  previewRefreshScheduled = false;
  cleanupPreviewLinkHandlers();
  cleanupPreviewImageObserver();
  cleanupPreviewDiagramObserver();
  cleanupPreviewCatalogSync();
  diagramDecorator.dispose();
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
    cleanupTimeout = null;
  }
  if (oldPath && content.value) {
    try {
      const renameInfo = props.renameContext;
      const isRenameSave =
        renameInfo &&
        renameInfo.from === oldPath &&
        renameInfo.to === newPath &&
        renameInfo.token &&
        renameInfo.token !== lastHandledRenameToken;

      if (isRenameSave) {
        const oldDocName = path.basename(renameInfo.from, path.extname(renameInfo.from));
        const newDocName = path.basename(renameInfo.to, path.extname(renameInfo.to));
        const rewritten = rewriteNoteAssetsLinksInMarkdown(content.value, oldDocName, newDocName);
        const rewrittenContent = String(rewritten || '');
        setEditorContent(rewrittenContent);
        await persistNoteText(renameInfo.to, rewrittenContent);
        lastSavedFilePath = String(renameInfo.to || '');
        lastSavedContent = rewrittenContent;
        scheduleCleanupAttachments(renameInfo.to, rewrittenContent);
        lastHandledRenameToken = renameInfo.token;
      } else {
        await queuePersistContent(oldPath, content.value);
      }
    } catch (err) {
      message.error('保存上一份文件失败：' + (err?.message || String(err)));
    }
  }
  pendingPreviewImageLoads.clear();
  clearImageBlobCache();

  if (newPath) {
    await loadFileContent(newPath);
  } else {
    lastSavedFilePath = '';
    lastSavedContent = '';
    catalogItems.value = [];
    catalogScrollElement.value = null;
    activeCatalogKey.value = '';
    content.value = '';
  }

  if (content.value) {
    editorRef.value?.togglePreviewOnly(true)
  } else {
    editorRef.value?.togglePreviewOnly(false)
  }

  await nextTick();
  syncCatalogScrollElement();
  editorRef.value?.rerender?.();
}, { immediate: true });

onUnmounted(() => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  clearPendingHtmlRefresh();
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
    cleanupTimeout = null;
  }
  previewRefreshScheduled = false;
  cleanupPreviewLinkHandlers();
  cleanupPreviewImageObserver();
  cleanupPreviewDiagramObserver();
  cleanupPreviewCatalogSync();
  diagramDecorator.dispose();
  pendingPreviewImageLoads.clear();
  clearImageBlobCache();
  catalogItems.value = [];
  catalogScrollElement.value = null;
  activeCatalogKey.value = '';
});

onBeforeUnmount(() => {
  const snapshotPath = String(props.filePath || '');
  const snapshotContent = String(content.value ?? '');
  if (!snapshotPath) return;
  if (lastSavedFilePath === snapshotPath && lastSavedContent === snapshotContent) return;
  void queuePersistContent(snapshotPath, snapshotContent).catch(() => {});
});

// ---------- 粘贴图片上传 ----------
async function legacyUploadImage(file) {
  try {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = file.name.split('.').pop() || 'png';
    const filename = `${timestamp}-${random}.${ext}`;

    const storage = buildNoteAssetsStorage(props.filePath, filename);
    if (!storage) {
      message.error('\u6587\u6863\u8def\u5f84\u4e0d\u5728 note \u76ee\u5f55\u4e2d');
      return;
    }

    if (!(await exists(storage.assetsDirRel))) {
      await createDirectory(storage.assetsDirRel);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    await writeFile(storage.imageRelPath, buffer);

    const relUrl = storage.relativeUrl;
    const alt = (file?.name ? String(file.name).trim() : '') || 'image.png';
    const imageMarkdown = `![${alt}#100](${relUrl})`;

    editorRef.value.insert(() => {
        return {
            targetValue: imageMarkdown, 
            select: false,    
            deviationStart: 0,
            deviationEnd: 0
        };
    });

    // 生成 blob URL 缓存，避免预览闪烁
    await getFileBlobUrl(storage.imageRelPath);
  } catch (err) {
    message.error('\u4e0a\u4f20\u56fe\u7247\u5931\u8d25\uff1a' + (err?.message || String(err)));
  }
}

function legacyHandlePaste(e) {
  if (!props.filePath) return;
  const items = e.clipboardData?.items;
  if (!items) return;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.indexOf('image') !== -1) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        uploadAndInsertImages([file]);
      }
      break;
    }
  }
}

function buildEditorImageMarkdown(items) {
  return items
    .map((item) => `![${item.alt}#100](${item.url})`)
    .join('\n');
}

function insertUploadedImages(items) {
  const imageMarkdown = buildEditorImageMarkdown(items);
  if (!imageMarkdown) return;

  editorRef.value?.insert(() => ({
    targetValue: imageMarkdown,
    select: false,
    deviationStart: 0,
    deviationEnd: 0
  }));
}

async function persistUploadedImage(file) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = resolveImageExtension({
    fileName: file?.name,
    mimeType: file?.type,
    bytes
  });
  const filename = `${timestamp}-${random}.${extension}`;
  const storage = buildNoteAssetsStorage(props.filePath, filename);

  if (!storage) {
    throw new Error('\u5f53\u524d\u7b14\u8bb0\u8def\u5f84\u65e0\u6548\uff0c\u65e0\u6cd5\u4fdd\u5b58\u56fe\u7247');
  }

  if (!(await exists(storage.assetsDirRel))) {
    await createDirectory(storage.assetsDirRel);
  }

  await writeFile(storage.imageRelPath, bytes);
  await getFileBlobUrl(storage.imageRelPath).catch(() => null);

  return {
    url: storage.relativeUrl,
    alt: buildUploadedImageAlt({
      fileName: file?.name,
      extension
    }),
    title: '',
    fileRelPath: storage.imageRelPath,
    extension
  };
}

async function uploadImages(files) {
  const fileList = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!fileList.length) return [];

  const uploaded = [];
  const errors = [];

  for (const file of fileList) {
    try {
      uploaded.push(await persistUploadedImage(file));
    } catch (err) {
      errors.push(err);
      console.warn('upload image failed:', err);
    }
  }

  if (!uploaded.length && errors.length) {
    throw errors[0];
  }

  if (errors.length) {
    message.warning(`${errors.length} \u5f20\u56fe\u7247\u4e0a\u4f20\u5931\u8d25\uff0c\u5df2\u8df3\u8fc7`);
  }

  return uploaded;
}

function toEditorUploadPayload(items) {
  return items.map((item) => ({
    url: item.url,
    alt: `${item.alt}#100`,
    title: item.title || ''
  }));
}

async function handleEditorUpload(files, callback) {
  if (!props.filePath) {
    message.warning('请先打开一个笔记再上传图片');
    callback?.([]);
    return;
  }

  try {
    const uploaded = await uploadImages(files);
    callback?.(toEditorUploadPayload(uploaded));
  } catch (err) {
    message.error('\u4e0a\u4f20\u56fe\u7247\u5931\u8d25\uff1a' + (err?.message || String(err)));
    callback?.([]);
  }
}

async function uploadAndInsertImages(files) {
  if (!props.filePath) return;

  try {
    const uploaded = await uploadImages(files);
    insertUploadedImages(uploaded);
  } catch (err) {
    message.error('\u4e0a\u4f20\u56fe\u7247\u5931\u8d25\uff1a' + (err?.message || String(err)));
  }
}

function decoratePreviewDiagrams(preview) {
  if (!preview) return;
  previewDiagramObserverSuspended = true;
  previewDiagramObserver?.disconnect();
  try {
    diagramDecorator.decorate(preview);
  } finally {
    previewDiagramObserverSuspended = false;
    schedulePreviewCatalogMeasurement();
    if (previewDiagramRoot === preview && previewDiagramObserver) {
      previewDiagramObserver.observe(preview, {
        childList: true,
        subtree: true
      });
    }
  }
}

function getPreviewRoot() {
  return editorContainerRef.value?.querySelector?.('.md-editor-preview') || null;
}

function isScrollablePreviewContainer(el) {
  if (!(el instanceof HTMLElement)) return false;
  const styles = window.getComputedStyle(el);
  const overflowY = `${styles.overflowY || ''} ${styles.overflow || ''}`.toLowerCase();
  return /(auto|scroll|overlay)/.test(overflowY) && el.scrollHeight > el.clientHeight + 1;
}

function resolvePreviewScrollContainer(preview = getPreviewRoot()) {
  if (!preview) return null;
  const candidates = [
    preview.closest('.md-editor.md-editor-previewOnly'),
    preview.closest('.md-editor-preview-wrapper'),
    preview.closest('.md-editor-content'),
    preview
  ];

  return (
    candidates.find((el) => isScrollablePreviewContainer(el)) ||
    candidates.find(Boolean) ||
    null
  );
}

function cleanupPreviewLinkHandlers() {
  if (!previewLinkRoot) return;
  previewLinkRoot.removeEventListener('click', handlePreviewLinkClick);
  previewLinkRoot.removeEventListener('contextmenu', handlePreviewLinkContextMenu);
  previewLinkRoot = null;
}

function cleanupPreviewImageObserver() {
  if (!previewImageObserver) {
    previewImageObserverRoot = null;
    return;
  }
  previewImageObserver.disconnect();
  previewImageObserver = null;
  previewImageObserverRoot = null;
}

function clearPreviewDiagramDecorateTimer() {
  if (!previewDiagramDecorateTimer) return;
  clearTimeout(previewDiagramDecorateTimer);
  previewDiagramDecorateTimer = null;
}

function cleanupPreviewDiagramObserver() {
  clearPreviewDiagramDecorateTimer();
  if (!previewDiagramObserver) {
    previewDiagramRoot = null;
    previewDiagramObserverSuspended = false;
    return;
  }
  previewDiagramObserver.disconnect();
  previewDiagramObserver = null;
  previewDiagramRoot = null;
  previewDiagramObserverSuspended = false;
}

function nodeContainsDiagramHost(node) {
  if (!(node instanceof Element)) return false;
  if (node.matches(DIAGRAM_HOST_SELECTOR)) return true;
  return !!node.querySelector?.(DIAGRAM_HOST_SELECTOR);
}

function mutationNeedsDiagramRefresh(mutations = []) {
  return mutations.some((mutation) => {
    if (mutation.target instanceof Element) {
      if (mutation.target.closest('.note-preview-diagram-actions')) return false;
      if (mutation.target.closest('pre code')) return false;
    }

    if (nodeContainsDiagramHost(mutation.target)) return true;
    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => nodeContainsDiagramHost(node));
  });
}

function scheduleDecoratePreviewDiagrams(preview = getPreviewRoot()) {
  if (!preview || previewDiagramDecorateTimer) return;
  previewDiagramDecorateTimer = setTimeout(() => {
    previewDiagramDecorateTimer = null;
    if (!preview.isConnected) return;
    decoratePreviewDiagrams(preview);
  }, 32);
}

function ensurePreviewDiagramObserver(preview) {
  if (!preview) return;
  if (previewDiagramRoot === preview && previewDiagramObserver) return;

  cleanupPreviewDiagramObserver();
  previewDiagramRoot = preview;
  previewDiagramObserver = new MutationObserver((mutations) => {
    if (previewDiagramObserverSuspended) return;
    if (!mutationNeedsDiagramRefresh(mutations)) return;
    scheduleDecoratePreviewDiagrams(preview);
  });
  previewDiagramObserver.observe(preview, {
    childList: true,
    subtree: true
  });
}

function loadPreviewImageBlobUrl(relPath) {
  const safeRelPath = String(relPath || '').trim();
  if (!safeRelPath) return Promise.resolve(null);

  const pendingKey = `file:${safeRelPath}`;
  if (pendingPreviewImageLoads.has(pendingKey)) {
    return pendingPreviewImageLoads.get(pendingKey);
  }

  const task = getFileBlobUrl(safeRelPath)
    .catch((err) => {
      console.warn('加载 file 预览图片失败:', safeRelPath, err);
      return null;
    })
    .finally(() => {
      pendingPreviewImageLoads.delete(pendingKey);
    });

  pendingPreviewImageLoads.set(pendingKey, task);
  return task;
}

function resolveDeferredPreviewImage(img) {
  if (!img || !img.isConnected) return;

  const relPath = String(img.dataset.localSrcPath || '').trim();
  const cacheKey = String(img.dataset.localSrcKey || '').trim();
  if (!relPath || !cacheKey) return;

  loadPreviewImageBlobUrl(relPath).then((url) => {
    if (!url || !img.isConnected) return;
    if (img.dataset.localSrcKey !== cacheKey) return;
    if (img.src !== url) img.src = url;
  });
}

function ensurePreviewImageObserver(preview = getPreviewRoot()) {
  if (typeof IntersectionObserver !== 'function') return previewImageObserver;

  const nextRoot = resolvePreviewScrollContainer(preview) || null;
  if (previewImageObserver && previewImageObserverRoot === nextRoot) return previewImageObserver;

  cleanupPreviewImageObserver();
  previewImageObserverRoot = nextRoot;

  previewImageObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        previewImageObserver?.unobserve(img);
        resolveDeferredPreviewImage(img);
      });
    },
    {
      root: nextRoot,
      rootMargin: '200px 0px'
    }
  );

  return previewImageObserver;
}

function processNodesInBatches(nodes, worker, chunkSize = 12, shouldContinue = null, onComplete = null) {
  const list = Array.from(nodes || []);
  if (!list.length || typeof worker !== 'function') return;

  let index = 0;
  const safeChunkSize = Math.max(1, Number(chunkSize) || 12);

  const step = () => {
    if (typeof shouldContinue === 'function' && !shouldContinue()) return;
    const end = Math.min(index + safeChunkSize, list.length);
    for (; index < end; index += 1) {
      if (typeof shouldContinue === 'function' && !shouldContinue()) return;
      worker(list[index], index);
    }

    if (index < list.length) {
      if (typeof shouldContinue === 'function' && !shouldContinue()) return;
      runWhenIdle(step);
      return;
    }

    if (typeof onComplete === 'function') onComplete();
  };

  step();
}

function ensurePreviewLinkHandlers(preview) {
  if (!preview || previewLinkRoot === preview) return;
  cleanupPreviewLinkHandlers();
  preview.addEventListener('click', handlePreviewLinkClick);
  preview.addEventListener('contextmenu', handlePreviewLinkContextMenu);
  previewLinkRoot = preview;
}

function resolvePreviewImageScale(img) {
  const currentAlt = String(img.getAttribute('alt') || '');
  const storedRawAlt = String(img.dataset.scaleAltRaw || '');
  const storedCleanAlt = String(img.dataset.scaleAltClean || '');
  const rawAlt = storedRawAlt && currentAlt === storedCleanAlt ? storedRawAlt : currentAlt;
  const scaleMatch = rawAlt.match(/#(\d+)$/);

  let scale = 100;
  let cleanAlt = rawAlt;
  if (scaleMatch) {
    scale = parseInt(scaleMatch[1], 10);
    if (isNaN(scale) || scale < 1) scale = 100;
    cleanAlt = rawAlt.replace(/#\d+$/, '');
  }

  img.dataset.scaleAltRaw = rawAlt;
  img.dataset.scaleAltClean = cleanAlt;
  if (currentAlt !== cleanAlt) img.setAttribute('alt', cleanAlt);
  if (img.getAttribute('title') !== cleanAlt) img.setAttribute('title', cleanAlt);

  return scale;
}

function clearPreviewImageLoadHandler(img) {
  if (typeof img?._loadHandler !== 'function') return;
  img.removeEventListener('load', img._loadHandler);
  delete img._loadHandler;
}

function isImageReadyForScaling(img) {
  return !!(img?.complete && img.naturalWidth && img.naturalHeight);
}

function applyPreviewImageScale(img, scale) {
  clearPreviewImageLoadHandler(img);

  if (scale === 100) {
    img.removeAttribute('width');
    img.removeAttribute('height');
    return;
  }

  const scaleRatio = scale / 100;
  const loadHandler = function() {
    if (this.naturalWidth && this.naturalHeight) {
      this.width = Math.round(this.naturalWidth * scaleRatio);
      this.height = Math.round(this.naturalHeight * scaleRatio);
    }
    schedulePreviewCatalogMeasurement();
    this.removeEventListener('load', loadHandler);
    if (this._loadHandler === loadHandler) delete this._loadHandler;
  };

  img._loadHandler = loadHandler;
  img.addEventListener('load', loadHandler);

  if (isImageReadyForScaling(img)) {
    try {
      loadHandler.call(img);
    } catch {
      // ignore
    }
  }
}

function buildPreviewImageSignature(img, src) {
  return [
    String(src || ''),
    String(img.dataset.scaleAltRaw || img.getAttribute('alt') || ''),
    String(props.filePath || '')
  ].join('||');
}

function preparePreviewImage(img, imageObserver) {
  const src = img.getAttribute('src');
  if (!src) return;

  const scale = resolvePreviewImageScale(img);
  const signature = buildPreviewImageSignature(img, src);
  if (img.dataset.aiToolsPreviewSignature === signature) return;
  img.dataset.aiToolsPreviewSignature = signature;

  img.loading = 'lazy';
  img.decoding = 'async';
  img.setAttribute('fetchpriority', 'low');
  applyPreviewImageScale(img, scale);
  if (scale === 100 && !img.complete) {
    img.addEventListener('load', schedulePreviewCatalogMeasurement, { once: true });
  }

  if (!isProbablyExternalSrc(src)) {
    if (!props.filePath) return;
    const rawSrc = stripUrlHashAndQuery(src);
    const decodedSrc = safeDecodeURIComponent(rawSrc);

    const noteDirRel = toPosixPath(path.dirname(props.filePath));
    let resolvedRel;
    if (decodedSrc.startsWith('/')) {
      const safeAbsRel = sanitizeSubPathUnderRoot(decodedSrc);
      if (!safeAbsRel) return;
      resolvedRel = safeAbsRel.startsWith('note/') ? safeAbsRel : `note/${safeAbsRel}`;
    } else {
      resolvedRel = toPosixPath(path.normalize(path.join(noteDirRel, decodedSrc)));
    }

    if (!resolvedRel.startsWith('note/')) return;

    const cacheKey = 'file:' + resolvedRel;
    img.dataset.localSrcKey = cacheKey;
    img.dataset.localSrcPath = resolvedRel;

    const cached = getCachedFileBlobUrlSync(resolvedRel);
    if (cached && img.src !== cached) {
      img.src = cached;
    } else if (!cached) {
      if (imageObserver) imageObserver.observe(img);
      else resolveDeferredPreviewImage(img);
    }
    return;
  }

  delete img.dataset.localSrcKey;
  delete img.dataset.localSrcPath;
}


async function handlePreviewLinkClick(e) {
  const link = e.target?.closest?.('a');
  if (!link || !previewLinkRoot?.contains(link)) return;

  const href = link.getAttribute('href');
  if (!href || href.startsWith('#')) return;

  e.preventDefault();
  e.stopPropagation();

  if (/^https?:\/\//i.test(href)) {
    try {
      globalThis?.utools?.shellOpenExternal?.(href);
    } catch {
      // ignore
    }
    try {
      if (!globalThis?.utools?.shellOpenExternal) window.open(href, '_blank', 'noopener');
    } catch {
      // ignore
    }
    return;
  }

  if (/^mailto:/i.test(href)) {
    try {
      globalThis?.utools?.shellOpenExternal?.(href);
    } catch {
      // ignore
    }
    return;
  }

  const ok = await openNoteFromHref(href);
  if (ok) return;
  copyToClipboard(href);
}

function handlePreviewLinkContextMenu(e) {
  const link = e.target?.closest?.('a');
  if (!link || !previewLinkRoot?.contains(link)) return;

  const href = link.getAttribute('href');
  if (!href) return;

  e.preventDefault();
  e.stopPropagation();

  if (/^mailto:/i.test(href)) {
    const raw = String(href).replace(/^mailto:/i, '').split('?')[0];
    copyToClipboard(safeDecodeURIComponent(raw));
    return;
  }
  if (/^https?:\/\//i.test(href)) {
    copyToClipboard(href);
    return;
  }

  resolveNoteAbsPathFromHref(href)
    .then((noteAbsPath) => {
      if (!noteAbsPath) {
        copyToClipboard(href);
        return;
      }
      const noteHref = buildNoteHrefFromPath(noteAbsPath);
      copyToClipboard(noteHref || href);
    })
    .catch(() => copyToClipboard(href));
}

function previewHasDiagramHosts(preview) {
  return !!preview?.querySelector?.(DIAGRAM_HOST_SELECTOR);
}

// ---------- 预览渲染：替换图片 src、应用缩放、清理 alt ----------
const handleHtmlChanged = () => {
  if (previewRefreshScheduled) return;
  previewRefreshScheduled = true;
  clearPendingHtmlRefresh();
  htmlRefreshTimer = window.setTimeout(() => {
    htmlRefreshTimer = null;
    nextTick(() => {
      const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16));
      raf(async () => {
        previewRefreshScheduled = false;
        const renderToken = ++previewRenderToken;
        const isCurrentRender = () => renderToken === previewRenderToken;
        const preview = getPreviewRoot();
        if (!preview) {
          catalogScrollElement.value = null;
          cleanupPreviewCatalogSync();
          cleanupPreviewLinkHandlers();
          cleanupPreviewImageObserver();
          cleanupPreviewDiagramObserver();
          return;
        }
        syncCatalogScrollElement(preview);
        bindPreviewCatalogHeadings(preview);
        const hasImages = !!preview.querySelector('img');
        if (hasImages) {
          const imageObserver = ensurePreviewImageObserver(preview);
          processNodesInBatches(preview.querySelectorAll('img'), (img) => {
            if (!img?.isConnected) return;
            preparePreviewImage(img, imageObserver);
          }, 10, isCurrentRender);
        } else {
          cleanupPreviewImageObserver();
        }

        ensurePreviewLinkHandlers(preview);
        if (previewHasDiagramHosts(preview)) {
          ensurePreviewDiagramObserver(preview);
          decoratePreviewDiagrams(preview);
        } else {
          cleanupPreviewDiagramObserver();
        }

        const codeBlocks = Array.from(preview.querySelectorAll('pre code')).filter(
          (block) => block.dataset.highlighted !== 'yes'
        );
        if (!codeBlocks.length) return;

        runWhenIdle(async () => {
          if (!isCurrentRender()) return;
          const hljs = await getHighlightJs();
          if (!isCurrentRender()) return;
          processNodesInBatches(codeBlocks, (block) => {
            if (!block.isConnected || block.dataset.highlighted === 'yes') return;
            hljs.highlightElement(block);
          }, 6, isCurrentRender, schedulePreviewCatalogMeasurement);
        });
      });
    });
  }, 140);
};

onMounted(() => {
  window.addEventListener('resize', schedulePreviewCatalogMeasurement, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', schedulePreviewCatalogMeasurement);
});
</script>

<style scoped>
.welcome-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.welcome-container.is-dark {
  color: rgba(226, 232, 240, 0.96);
}

.welcome-card {
  text-align: center;
  max-width: 500px;
  padding: 32px;
  line-height: 50px;
  border: 1px solid rgba(87, 126, 139, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(246, 249, 250, 0.92));
  box-shadow: 0 18px 38px rgba(18, 39, 43, 0.08);
}

.welcome-container.is-dark .welcome-card {
  border-color: rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.9), rgba(15, 23, 42, 0.8));
  box-shadow: 0 18px 38px rgba(2, 6, 23, 0.3);
}

.welcome-container.is-dark .welcome-card :deep(.n-icon) {
  color: rgba(148, 163, 184, 0.92);
}

.editor-container {
  display: flex;
  height: 100%;
  min-height: 0;
  padding: 12px;
  border-radius: 24px;
  overflow: hidden;
  contain: layout paint;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.1), transparent 24%),
    linear-gradient(140deg, rgba(255, 255, 255, 0.88), rgba(244, 247, 250, 0.94));
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.editor-container.is-dark {
  border-color: rgba(148, 163, 184, 0.14);
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.12), transparent 24%),
    linear-gradient(145deg, rgba(15, 23, 42, 0.92), rgba(2, 6, 23, 0.94));
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.32);
}

.editor-shell {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.editor-shell__main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  contain: layout paint;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.88);
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.editor-container.is-dark .editor-shell__main {
  border-color: rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.88);
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.16);
}

.editor-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.36));
}

.editor-container.is-dark .editor-shell__header {
  border-bottom-color: rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.66), rgba(15, 23, 42, 0.34));
}

.editor-shell__heading {
  min-width: 0;
}

.editor-shell__eyebrow,
.editor-shell__catalog-eyebrow {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(71, 85, 105, 0.86);
}

.editor-container.is-dark .editor-shell__eyebrow,
.editor-container.is-dark .editor-shell__catalog-eyebrow {
  color: rgba(148, 163, 184, 0.82);
}

.editor-shell__title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.editor-shell__title-row h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  color: #0f172a;
}

.editor-container.is-dark .editor-shell__title-row h3 {
  color: #f8fafc;
}

.editor-shell__path {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(71, 85, 105, 0.78);
  font-family: 'Fira Code', 'SFMono-Regular', Consolas, monospace;
}

.editor-container.is-dark .editor-shell__path {
  color: rgba(148, 163, 184, 0.8);
}

.editor-shell__toggle {
  flex: 0 0 auto;
}

.editor-shell__body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  padding: 16px;
}

.editor-shell__catalog-panel {
  display: flex;
  flex: 0 0 260px;
  flex-direction: column;
  width: 260px;
  height: 99%;
  min-width: 0;
  min-height: 0;
  contain: layout paint;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.editor-container.is-dark .editor-shell__catalog-panel {
  border-color: rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.9);
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.16);
}

.editor-shell__catalog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.editor-container.is-dark .editor-shell__catalog-header {
  border-bottom-color: rgba(148, 163, 184, 0.12);
}

.editor-shell__catalog-heading strong {
  display: block;
  font-size: 18px;
  line-height: 1.2;
  color: #0f172a;
}

.editor-container.is-dark .editor-shell__catalog-heading strong {
  color: #f8fafc;
}

.editor-shell__catalog-meta {
  flex: 0 0 auto;
  margin-top: 2px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  font-size: 12px;
  line-height: 1.4;
}

.editor-container.is-dark .editor-shell__catalog-meta {
  background: rgba(56, 189, 248, 0.14);
  color: #7dd3fc;
}

.editor-shell__catalog-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.editor-shell__catalog-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: 20px;
  border: 1px dashed rgba(148, 163, 184, 0.26);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.76);
  color: rgba(71, 85, 105, 0.88);
  font-size: 13px;
  line-height: 1.7;
  text-align: center;
}

.editor-container.is-dark .editor-shell__catalog-empty {
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.48);
  color: rgba(203, 213, 225, 0.86);
}

.editor-container :deep(.md-editor) {
  height: 100%;
  min-height: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.editor-container :deep(.md-editor-content) {
  min-height: 0;
}

.editor-container :deep(.md-editor-toolbar) {
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.editor-container.is-dark :deep(.md-editor-toolbar) {
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.8);
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.18);
}

.editor-container :deep(.md-editor-toolbar-item) {
  border-radius: 12px;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.editor-container :deep(.md-editor-toolbar-item:hover) {
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
  transform: translateY(-1px);
}

.editor-container.is-dark :deep(.md-editor-toolbar-item:hover) {
  background: rgba(56, 189, 248, 0.14);
  color: #e0f2fe;
}

.editor-container :deep(.md-editor-preview-wrapper) {
  min-height: 0;
  contain: layout paint;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(248, 250, 252, 0.92));
}

.editor-container.is-dark :deep(.md-editor-preview-wrapper) {
  border-color: rgba(148, 163, 184, 0.14);
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.78));
}

.editor-container :deep(.md-editor-input-wrapper) {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
}

.editor-container.is-dark :deep(.md-editor-input-wrapper) {
  border-color: rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.8);
}

.editor-container :deep(.cm-editor) {
  background: transparent;
}

.editor-container :deep(.cm-scroller) {
  padding: 8px 0;
}

.editor-container :deep(.md-editor-preview) {
  padding: 10px 4px 28px;
}

.editor-container :deep(.md-editor-preview img) {
  display: block;
  max-width: 100%;
  height: auto;
  contain: paint;
}

.editor-container :deep(.md-editor-preview pre),
.editor-container :deep(.md-editor-preview table),
.editor-container :deep(.md-editor-preview blockquote),
.editor-container :deep(.md-editor-preview .note-preview-diagram),
.editor-container :deep(.md-editor-preview img) {
  content-visibility: auto;
  contain-intrinsic-size: auto 280px;
}

.editor-container :deep(.md-editor.md-editor-previewOnly) {
  height: 100% !important;
  min-height: 0;
  overflow: auto !important;
  display: flex;
  flex-direction: column;
}

.editor-container :deep(.md-editor.md-editor-previewOnly .md-editor-content) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.editor-container :deep(.md-editor.md-editor-previewOnly .md-editor-preview-wrapper) {
  height: 100% !important;
  overflow: visible !important;
}

.note-editor-catalog {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 99%;
  min-height: 0;
}

.note-editor-catalog__item {
  position: relative;
  width: 100%;
  padding: 10px 12px 10px calc(18px + var(--catalog-depth, 0) * 14px);
  border: none;
  border-radius: 14px;
  background: transparent;
  color: rgba(51, 65, 85, 0.9);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.note-editor-catalog__item::before {
  content: '';
  position: absolute;
  inset: 10px auto 10px calc(8px + var(--catalog-depth, 0) * 14px);
  width: 3px;
  border-radius: 999px;
  background: transparent;
}

.note-editor-catalog__item.is-active::before {
  background: linear-gradient(180deg, #0ea5e9, #2563eb);
}

.editor-container.is-dark .note-editor-catalog__item.is-active::before {
  background: linear-gradient(180deg, #38bdf8, #60a5fa);
}

.note-editor-catalog__text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.45;
}

.note-editor-catalog__item:hover {
  background: rgba(37, 99, 235, 0.08);
  color: #0f172a;
  transform: translateX(2px);
}

.note-editor-catalog__item.is-active {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(37, 99, 235, 0.08));
  color: #0f172a;
  font-weight: 600;
}

.editor-container.is-dark .note-editor-catalog__item {
  color: rgba(203, 213, 225, 0.88);
}

.editor-container.is-dark .note-editor-catalog__item:hover {
  background: rgba(56, 189, 248, 0.12);
  color: #f8fafc;
}

.editor-container.is-dark .note-editor-catalog__item.is-active {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(59, 130, 246, 0.14));
  color: #f8fafc;
}

.editor-container :deep(.note-preview-diagram) {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
}

.editor-container :deep(.md-editor-mermaid-action) {
  display: none !important;
}

.editor-container :deep(.note-preview-diagram-actions) {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  gap: 8px;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.editor-container :deep(.note-preview-diagram:hover .note-preview-diagram-actions) {
  opacity: 1;
  transform: translateY(0);
}

.editor-container :deep(.note-preview-diagram-action) {
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.editor-container.is-dark :deep(.note-preview-diagram-action) {
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  border-color: rgba(148, 163, 184, 0.18);
}

.editor-container :deep(.note-preview-diagram-error) {
  width: 100%;
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid rgba(248, 113, 113, 0.28);
  border-radius: 16px;
  background: rgba(254, 242, 242, 0.94);
  color: #7f1d1d;
}

.editor-container.is-dark :deep(.note-preview-diagram-error) {
  background: rgba(69, 10, 10, 0.55);
  border-color: rgba(248, 113, 113, 0.24);
  color: #fecaca;
}

.editor-container :deep(.note-preview-diagram-error__title) {
  font-size: 14px;
  font-weight: 700;
}

.editor-container :deep(.note-preview-diagram-error__message) {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.editor-container :deep(.note-preview-diagram-error__meta) {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.86;
}

.editor-container :deep(.note-preview-diagram-error__details) {
  margin-top: 10px;
}

.editor-container :deep(.note-preview-diagram-error__details summary) {
  cursor: pointer;
  font-size: 12px;
}

.editor-container :deep(.note-preview-diagram-error pre) {
  margin-top: 8px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.editor-container.is-dark :deep(.note-preview-diagram-error pre) {
  background: rgba(15, 23, 42, 0.52);
}

@media (max-width: 1280px) {
  .editor-shell {
    flex-direction: column;
  }

  .editor-shell__catalog-panel {
    width: 100%;
    flex-basis: 240px;
  }
}
</style>






