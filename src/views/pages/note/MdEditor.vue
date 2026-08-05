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
  <div
    ref="editorContainerRef"
    v-else
    :class="['editor-container', 'ai-markdown-surface', { 'is-dark': theme === 'dark' }]"
    @contextmenu="handleEditorAreaContextMenu"
  >
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
  <n-dropdown
    placement="bottom-start"
    trigger="manual"
    :show="editorContextMenu.show"
    :x="editorContextMenu.x"
    :y="editorContextMenu.y"
    :options="editorContextMenuOptions"
    @clickoutside="closeEditorContextMenu"
    @select="handleEditorContextMenuSelect"
  />
  <n-modal
    v-model:show="noteReferencePicker.show"
    preset="card"
    title="引用笔记"
    style="width: 640px; max-width: 94vw;"
    :bordered="false"
  >
    <div :class="['note-reference-picker', { 'is-dark': theme === 'dark' }]">
      <n-input
        v-model:value="noteReferencePicker.query"
        autofocus
        clearable
        placeholder="搜索标题、正文或语义"
        @keydown.enter.prevent="selectFirstNoteReference"
      />
      <div class="note-reference-picker__meta">
        <span v-if="noteReferencePicker.loading">正在检索…</span>
        <span v-else-if="noteReferencePicker.searchMode">
          {{ noteReferencePicker.searchMode === 'hybrid' ? '混合检索' : '关键词检索' }}
          · {{ noteReferencePicker.items.length }} 条结果
        </span>
        <span v-else>输入关键词后，可从内容索引中选择一篇笔记。</span>
      </div>
      <div v-if="noteReferencePicker.error" class="note-reference-picker__error">
        {{ noteReferencePicker.error }}
      </div>
      <div v-else-if="noteReferencePicker.items.length" class="note-reference-picker__results">
        <button
          v-for="item in noteReferencePicker.items"
          :key="item.path"
          type="button"
          class="note-reference-picker__item"
          @click="insertSelectedNoteReference(item)"
        >
          <span class="note-reference-picker__title">{{ item.title || item.name || item.path }}</span>
          <span class="note-reference-picker__path">{{ item.path }}</span>
          <span v-if="item.preview" class="note-reference-picker__preview">{{ item.preview }}</span>
        </button>
      </div>
      <div v-else-if="noteReferencePicker.query && !noteReferencePicker.loading" class="note-reference-picker__empty">
        没有找到可引用的明文笔记。
      </div>
    </div>
    <template #footer>
      <div class="note-reference-picker__footer">
        <span>在编辑区输入 <code>[[关键词</code> 也可以直接唤起检索。</span>
        <n-button @click="noteReferencePicker.show = false">关闭</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount, onMounted, onUnmounted, nextTick } from 'vue';
import path from 'path-browserify'; 
import { useMessage } from 'naive-ui';
import {
  readFile,
  writeFile,
  writeAbsoluteFile,
  exists,
  createDirectory,
  getFileBlobUrl,
  getCachedFileBlobUrlSync,
  clearImageBlobCache,
} from '@/utils/fileOperations';
import LazyMarkdownEditor from '@/components/LazyMarkdownEditor.vue';
import { FileTrayFullOutline, CreateOutline } from '@vicons/ionicons5';
import { NIcon, NCard, NButton, NDropdown, NInput, NModal } from 'naive-ui';
import { copyTextToClipboard } from '@/utils/clipboard';
import { searchNotes } from '@/utils/contentSearch';
import {
  buildNoteReference,
  extractTrailingNoteReferenceTrigger,
  replaceNoteReferenceTrigger
} from '@/utils/noteReference';
import {
  createMarkdownDiagramDecorator,
  renderEchartsSvgForExport,
  renderMermaidSvgForExport
} from '@/utils/markdownDiagramDecorator';
import { getSafeExternalUrl, safeOpenExternal } from '@/utils/safeOpenExternal';
import { shouldPersistMarkdownDraftOnPathChange } from '@/utils/mdEditorSaveState';
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
import {
  cleanupUnusedNoteAttachments,
  hasPotentialNoteAttachmentReferences
} from '@/utils/noteAttachmentCleanup';
import {
  decryptNoteContent,
  encryptNoteContent,
  isEncryptedNoteContent,
  replaceEncryptedNoteContent
} from '@/utils/noteEncryption';

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
const editorContextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  href: '',
  selection: '',
  source: 'editor'
});
const noteReferencePicker = ref({
  show: false,
  query: '',
  loading: false,
  error: '',
  searchMode: '',
  items: [],
  trigger: null
});
const editorId = `note-editor-${Math.random().toString(36).slice(2, 10)}`;
let lastHandledRenameToken = null;
let cleanupTimeout = null;
let lastSavedFilePath = '';
let lastSavedContent = '';
let saveQueue = Promise.resolve();
let suppressContentWatcher = false;
let htmlRefreshTimer = null;
let noteReferenceSearchTimer = null;
let noteReferenceSearchToken = 0;

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

const editorContextMenuOptions = computed(() => {
  const state = editorContextMenu.value;
  const options = [];
  if (state.href) {
    const externalUrl = getSafeExternalUrl(state.href);
    options.push({
      label: externalUrl ? '在浏览器中打开链接' : '打开引用的笔记',
      key: 'open-link'
    });
    options.push({ label: '复制链接', key: 'copy-link' });
    options.push({ type: 'divider' });
  }

  options.push({ label: '搜索并引用笔记…', key: 'reference-note' });
  options.push({
    label: '复制选中内容',
    key: 'copy-selection',
    disabled: !state.selection
  });
  options.push({
    label: '将选中内容设为引用块',
    key: 'blockquote-selection',
    disabled: !state.selection || state.source !== 'editor'
  });
  options.push({
    label: '粘贴纯文本',
    key: 'paste-text',
    disabled: state.source !== 'editor' || typeof navigator?.clipboard?.readText !== 'function'
  });
  options.push({ type: 'divider' });
  options.push({
    label: '复制当前笔记 Markdown 链接',
    key: 'copy-current-note-link',
    disabled: !props.filePath
  });
  return options;
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

function closeEditorContextMenu() {
  editorContextMenu.value.show = false;
}

function getContextSelection(target) {
  if (target?.closest?.('.md-editor-preview')) {
    const selection = window.getSelection?.();
    const text = String(selection?.toString?.() || '');
    if (text) return { text, source: 'preview' };
  }
  return {
    text: String(editorRef.value?.getSelectedText?.() || ''),
    source: 'editor'
  };
}

function showEditorContextMenu(event, options = {}) {
  const selection = getContextSelection(event?.target);
  editorContextMenu.value = {
    show: false,
    x: Number(event?.clientX) || 0,
    y: Number(event?.clientY) || 0,
    href: String(options.href || '').trim(),
    selection: selection.text,
    source: selection.source
  };
  window.setTimeout(() => {
    editorContextMenu.value.show = true;
  }, 0);
}

function handleEditorAreaContextMenu(event) {
  const link = event.target?.closest?.('a');
  if (link && editorContainerRef.value?.contains(link)) {
    const href = String(link.getAttribute('href') || '').trim();
    if (!href) return;
    event.preventDefault();
    event.stopPropagation();
    showEditorContextMenu(event, { href });
    return;
  }

  const inEditor = !!event.target?.closest?.('.md-editor-input-wrapper, .md-editor-preview');
  if (!inEditor) return;
  event.preventDefault();
  event.stopPropagation();
  showEditorContextMenu(event);
}

async function copyContextLink(href) {
  const externalUrl = getSafeExternalUrl(href);
  if (externalUrl?.protocol === 'mailto:') {
    return copyToClipboard(safeDecodeURIComponent(externalUrl.pathname));
  }
  if (externalUrl) return copyToClipboard(externalUrl.toString());

  try {
    const noteAbsPath = await resolveNoteAbsPathFromHref(href);
    const noteHref = noteAbsPath ? buildNoteHrefFromPath(noteAbsPath) : '';
    return copyToClipboard(noteHref || href);
  } catch {
    return copyToClipboard(href);
  }
}

async function openContextLink(href) {
  if (getSafeExternalUrl(href)) {
    safeOpenExternal(href);
    return;
  }
  if (await openNoteFromHref(href)) return;
  message.warning('无法打开该链接');
}

function insertEditorText(targetValue) {
  const text = String(targetValue || '');
  if (!text) return;
  editorRef.value?.insert?.(() => ({
    targetValue: text,
    select: false,
    deviationStart: 0,
    deviationEnd: 0
  }));
}

function openNoteReferencePicker(options = {}) {
  const query = String(options.query || '').trim();
  noteReferencePicker.value.trigger = options.trigger || null;
  noteReferencePicker.value.query = query;
  noteReferencePicker.value.error = '';
  noteReferencePicker.value.items = [];
  noteReferencePicker.value.searchMode = '';
  noteReferencePicker.value.show = true;
}

async function handleEditorContextMenuSelect(key) {
  const state = { ...editorContextMenu.value };
  closeEditorContextMenu();

  if (key === 'open-link') {
    await openContextLink(state.href);
    return;
  }
  if (key === 'copy-link') {
    await copyContextLink(state.href);
    return;
  }
  if (key === 'reference-note') {
    openNoteReferencePicker();
    return;
  }
  if (key === 'copy-selection') {
    await copyToClipboard(state.selection);
    return;
  }
  if (key === 'blockquote-selection') {
    const quoted = String(state.selection || '')
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join('\n');
    insertEditorText(quoted);
    return;
  }
  if (key === 'paste-text') {
    try {
      insertEditorText(await navigator.clipboard.readText());
    } catch (error) {
      message.error(`读取剪贴板失败：${error?.message || String(error)}`);
    }
    return;
  }
  if (key === 'copy-current-note-link') {
    const href = buildNoteHrefFromPath(props.filePath);
    if (!href) {
      message.warning('无法生成当前笔记链接');
      return;
    }
    await copyToClipboard(`[${noteTitle.value}](${href})`);
  }
}

function clearNoteReferenceSearchTimer() {
  if (!noteReferenceSearchTimer) return;
  clearTimeout(noteReferenceSearchTimer);
  noteReferenceSearchTimer = null;
}

async function runNoteReferenceSearch() {
  const query = String(noteReferencePicker.value.query || '').trim();
  if (!noteReferencePicker.value.show || !query) {
    noteReferencePicker.value.loading = false;
    noteReferencePicker.value.items = [];
    noteReferencePicker.value.searchMode = '';
    noteReferencePicker.value.error = '';
    return;
  }

  const token = ++noteReferenceSearchToken;
  noteReferencePicker.value.loading = true;
  noteReferencePicker.value.error = '';
  try {
    const result = await searchNotes({ query, limit: 30 });
    if (token !== noteReferenceSearchToken || !noteReferencePicker.value.show) return;
    noteReferencePicker.value.items = Array.isArray(result?.items) ? result.items : [];
    noteReferencePicker.value.searchMode = String(result?.searchMode || 'keyword');
  } catch (error) {
    if (token !== noteReferenceSearchToken) return;
    noteReferencePicker.value.items = [];
    noteReferencePicker.value.searchMode = '';
    noteReferencePicker.value.error = error?.message || String(error);
  } finally {
    if (token === noteReferenceSearchToken) noteReferencePicker.value.loading = false;
  }
}

function scheduleNoteReferenceSearch() {
  clearNoteReferenceSearchTimer();
  noteReferenceSearchTimer = window.setTimeout(() => {
    noteReferenceSearchTimer = null;
    void runNoteReferenceSearch();
  }, 180);
}

function insertSelectedNoteReference(item) {
  const reference = buildNoteReference(item);
  if (!reference) {
    message.warning('无法为该笔记生成引用链接');
    return;
  }

  const trigger = noteReferencePicker.value.trigger;
  const replacement = trigger
    ? replaceNoteReferenceTrigger(content.value, trigger, item)
    : null;
  noteReferencePicker.value.show = false;
  noteReferencePicker.value.trigger = null;
  if (replacement) {
    content.value = replacement.content;
  } else {
    insertEditorText(reference.markdown);
  }
  message.success('已插入笔记引用');
}

function selectFirstNoteReference() {
  const first = noteReferencePicker.value.items[0];
  if (first) insertSelectedNoteReference(first);
}

function getNoteAssetsInfo(noteFilePath) {
  return buildNoteAssetsDirectory(noteFilePath);
}

function scheduleCleanupAttachments(noteFilePath, markdown) {
  const snapshotPath = String(noteFilePath || '');
  const snapshotMd = String(markdown || '');
  if (!snapshotPath || !hasPotentialNoteAttachmentReferences(snapshotMd)) return;
  if (cleanupTimeout) clearTimeout(cleanupTimeout);
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
    lastSavedFilePath = String(filePath || '');
    lastSavedContent = '';
    setEditorContent('');
    catalogItems.value = [];
    catalogScrollElement.value = null;
    activeCatalogKey.value = '';
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

async function flushPendingSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  await saveQueue.catch(() => {});

  const snapshotPath = String(props.filePath || '');
  const snapshotContent = String(content.value ?? '');
  if (!snapshotPath) return;
  if (lastSavedFilePath === snapshotPath && lastSavedContent === snapshotContent) return;

  await queuePersistContent(snapshotPath, snapshotContent);
}

const EXPORT_MAX_CANVAS_EDGE = 16384;
const EXPORT_IMAGE_TIMEOUT_MS = 12000;

function getUtoolsApi() {
  return window?.utools || globalThis?.utools || null;
}

function extractDialogPath(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'object') {
    const candidates = [entry.path, entry.filePath, entry.fullPath, entry.value];
    for (const candidate of candidates) {
      const text = typeof candidate === 'string' ? candidate.trim() : '';
      if (text) return text;
    }
  }
  return '';
}

function resolveSaveDialogPath(result) {
  if (!result) return '';
  if (typeof result === 'string') return result.trim();
  if (typeof result === 'object') return extractDialogPath(result);
  return '';
}

function openExportSaveDialog({ title, defaultPath, filters }) {
  const api = getUtoolsApi();
  if (!api?.showSaveDialog) throw new Error('当前环境不支持保存文件对话框。');
  return resolveSaveDialogPath(api.showSaveDialog({
    title,
    defaultPath,
    filters
  }));
}

function sanitizeExportFileBaseName(name) {
  const text = String(name || '').trim() || 'note';
  return text.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
}

function buildDefaultExportFileName(extension) {
  const safeExt = String(extension || '').replace(/^\./, '').trim() || 'txt';
  return `${sanitizeExportFileBaseName(noteTitle.value)}.${safeExt}`;
}

function getPreviewViewportWidth(preview) {
  const rect = preview?.getBoundingClientRect?.() || { width: 0 };
  return Math.max(
    1,
    Math.ceil(preview?.clientWidth || preview?.scrollWidth || rect.width || 1)
  );
}

function getDiagramExportSize(node) {
  const sourceSvg = node?.querySelector?.('svg');
  if (sourceSvg instanceof SVGElement) {
    const rect = sourceSvg.getBoundingClientRect?.() || { width: 0, height: 0 };
    const viewBox = String(sourceSvg.getAttribute?.('viewBox') || '').trim();
    if (rect.width > 0 && rect.height > 0) {
      return {
        width: Math.max(240, Math.ceil(rect.width)),
        height: Math.max(180, Math.ceil(rect.height))
      };
    }
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map((value) => Number(value)).filter((value) => Number.isFinite(value));
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return {
          width: Math.max(240, Math.ceil(parts[2])),
          height: Math.max(180, Math.ceil(parts[3]))
        };
      }
    }
  }

  const sourceCanvas = node?.querySelector?.('canvas');
  if (sourceCanvas instanceof HTMLCanvasElement) {
    return {
      width: Math.max(240, Math.ceil(sourceCanvas.width || sourceCanvas.getBoundingClientRect?.().width || 960)),
      height: Math.max(180, Math.ceil(sourceCanvas.height || sourceCanvas.getBoundingClientRect?.().height || 540))
    };
  }

  const explicitWidth = parsePixelDimensionValue(node?.dataset?.aiToolsDiagramWidth);
  const explicitHeight = parsePixelDimensionValue(node?.dataset?.aiToolsDiagramHeight);
  if (explicitWidth || explicitHeight) {
    return {
      width: explicitWidth || 960,
      height: explicitHeight || 540
    };
  }

  const rect = node?.getBoundingClientRect?.() || { width: 0, height: 0 };
  return {
    width: Math.max(240, Math.ceil(node?.scrollWidth || rect.width || 960)),
    height: Math.max(180, Math.ceil(node?.scrollHeight || rect.height || 540))
  };
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
  if (!bytes.byteLength) return '';
  return await blobToDataUrl(new Blob([bytes], { type: mime || 'application/octet-stream' }));
}

function waitForAnimationFrames(count = 1) {
  const frames = Math.max(1, Number(count) || 1);
  return new Promise((resolve) => {
    const step = (remaining) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      const raf = window?.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16));
      raf(() => step(remaining - 1));
    };
    step(frames);
  });
}

function waitForImageReady(img, timeoutMs = EXPORT_IMAGE_TIMEOUT_MS) {
  if (!(img instanceof HTMLImageElement)) return Promise.resolve();
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.removeEventListener('load', handleDone);
      img.removeEventListener('error', handleDone);
      resolve();
    };
    const handleDone = () => finish();
    const timer = window.setTimeout(finish, Math.max(1000, timeoutMs));
    img.addEventListener('load', handleDone, { once: true });
    img.addEventListener('error', handleDone, { once: true });
  });
}

async function waitForPreviewImages(preview) {
  const images = Array.from(preview?.querySelectorAll?.('img') || []);
  if (!images.length) return;
  await Promise.all(images.map((img) => waitForImageReady(img)));
}

async function hydratePreviewImagesForExport(preview) {
  const images = Array.from(preview?.querySelectorAll?.('img') || []);
  if (!images.length) return;

  const imageObserver = ensurePreviewImageObserver(preview);
  images.forEach((img) => preparePreviewImage(img, imageObserver));

  // 导出时不能依赖 IntersectionObserver：预览区外的图片也必须完成本地路径解析，
  // 后续克隆时才能将它们嵌入为 data URL。
  await Promise.all(images.map(async (img) => {
    const localPath = String(img?.dataset?.localSrcPath || '').trim();
    if (!localPath) return;

    const url = await loadPreviewImageBlobUrl(localPath);
    if (url && img.isConnected) img.src = url;
  }));
}

function previewDiagramNodeIsRendered(node) {
  if (!(node instanceof HTMLElement)) return true;
  if (node.classList.contains('md-editor-echarts')) {
    return !!node.querySelector?.('svg, canvas');
  }
  if (node.classList.contains('md-editor-mermaid')) {
    return !!node.querySelector?.('svg');
  }
  return true;
}

async function waitForPreviewDiagrams(preview, timeoutMs = 4000) {
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 0);
  while (Date.now() < deadline) {
    const diagramNodes = Array.from(preview?.querySelectorAll?.(DIAGRAM_HOST_SELECTOR) || []);
    if (!diagramNodes.length) return;
    if (diagramNodes.every((node) => previewDiagramNodeIsRendered(node))) return;
    await waitForAnimationFrames(2);
  }
}

function hasUnsafeExportUrl(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(text);
  if (!match) return false;
  const scheme = String(match[1] || '').toLowerCase();
  return scheme === 'javascript' || scheme === 'vbscript';
}

function stripExportOnlyNodes(root) {
  if (!(root instanceof Element)) return;
  root.querySelectorAll('.note-preview-diagram-actions, .md-editor-mermaid-action, script, iframe, object, embed, frame, frameset').forEach((node) => {
    node.remove();
  });
  root.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes || []).forEach((attr) => {
      if (/^on/i.test(String(attr?.name || ''))) {
        el.removeAttribute(attr.name);
      }
    });
    if (hasUnsafeExportUrl(el.getAttribute?.('href'))) {
      el.removeAttribute('href');
    }
    if (hasUnsafeExportUrl(el.getAttribute?.('src'))) {
      el.removeAttribute('src');
    }
  });
}

function replaceExportImageWithPlaceholder(img, messageText = '该图片无法导出') {
  if (!(img instanceof HTMLImageElement)) return;
  img.removeAttribute('src');
  img.removeAttribute('srcset');
  img.removeAttribute('sizes');
  img.setAttribute('alt', img.getAttribute('alt') || messageText);
  img.style.display = 'inline-flex';
  img.style.alignItems = 'center';
  img.style.justifyContent = 'center';
  img.style.minHeight = img.style.minHeight || '48px';
  img.style.minWidth = img.style.minWidth || '120px';
  img.style.padding = img.style.padding || '8px 12px';
  img.style.border = img.style.border || '1px dashed rgba(148, 163, 184, 0.5)';
  img.style.borderRadius = img.style.borderRadius || '10px';
  img.style.background = img.style.background || 'rgba(148, 163, 184, 0.08)';
}

function inlineComputedStyle(sourceEl, cloneEl) {
  if (!(sourceEl instanceof Element) || !(cloneEl instanceof Element)) return;
  const computed = window.getComputedStyle(sourceEl);
  const declarations = [];

  for (let index = 0; index < computed.length; index += 1) {
    const propertyName = computed[index];
    const value = computed.getPropertyValue(propertyName);
    if (!value) continue;
    declarations.push(`${propertyName}:${value};`);
  }

  declarations.push('animation:none !important;');
  declarations.push('transition:none !important;');
  declarations.push('content-visibility:visible !important;');
  declarations.push('contain:none !important;');
  declarations.push('contain-intrinsic-size:auto !important;');
  declarations.push('caret-color:transparent;');
  cloneEl.setAttribute('style', declarations.join(''));
}

function cloneRenderedDiagramContent(sourceNode, cloneNode) {
  if (!(sourceNode instanceof HTMLElement) || !(cloneNode instanceof HTMLElement)) return false;

  const renderedSvg = sourceNode.querySelector?.('svg');
  if (renderedSvg instanceof SVGElement) {
    const svgClone = renderedSvg.cloneNode(true);
    if (svgClone instanceof SVGElement && !svgClone.getAttribute('xmlns')) {
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    cloneNode.replaceChildren(svgClone);
    return true;
  }

  const renderedCanvas = sourceNode.querySelector?.('canvas');
  if (renderedCanvas instanceof HTMLCanvasElement) {
    try {
      const image = document.createElement('img');
      image.setAttribute('src', renderedCanvas.toDataURL('image/png'));
      image.setAttribute('alt', renderedCanvas.getAttribute('aria-label') || 'canvas');
      image.width = renderedCanvas.width;
      image.height = renderedCanvas.height;
      cloneNode.replaceChildren(image);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function normalizeExportDiagramBoxes(root) {
  if (!(root instanceof Element)) return;
  root.querySelectorAll('.note-preview-diagram, .md-editor-echarts, .md-editor-mermaid, p.md-editor-mermaid').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.setProperty('overflow', 'visible', 'important');
    node.style.setProperty('contain', 'none', 'important');
    node.style.setProperty('content-visibility', 'visible', 'important');
    node.style.setProperty('height', 'auto', 'important');
    node.style.setProperty('min-height', '0', 'important');
    node.style.setProperty('max-height', 'none', 'important');
    node.style.setProperty('width', 'auto', 'important');
  });
  root.querySelectorAll('svg').forEach((svg) => {
    if (!(svg instanceof SVGElement)) return;
    svg.style.setProperty('max-width', 'none', 'important');
    svg.style.setProperty('max-height', 'none', 'important');
    svg.style.setProperty('overflow', 'visible', 'important');
  });
}

function clonePreviewNodeForExport(sourceNode) {
  if (!sourceNode) return null;
  if (sourceNode.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(sourceNode.textContent || '');
  }
  if (sourceNode.nodeType !== Node.ELEMENT_NODE) return null;

  const sourceEl = sourceNode;
  if (sourceEl.matches?.('.note-preview-diagram-actions, .md-editor-mermaid-action, script, iframe, object, embed, frame, frameset')) {
    return null;
  }

  if (sourceEl instanceof HTMLCanvasElement) {
    const image = document.createElement('img');
    try {
      image.setAttribute('src', sourceEl.toDataURL('image/png'));
    } catch {
      image.setAttribute('src', '');
    }
    image.setAttribute('alt', sourceEl.getAttribute('aria-label') || 'canvas');
    image.width = sourceEl.width;
    image.height = sourceEl.height;
    image.className = sourceEl.className || '';
    inlineComputedStyle(sourceEl, image);
    return image;
  }

  const clone = sourceEl.cloneNode(false);
  if (clone instanceof Element) {
    inlineComputedStyle(sourceEl, clone);
    if (clone instanceof HTMLImageElement) {
      clone.loading = 'eager';
      clone.decoding = 'sync';
      clone.removeAttribute('srcset');
    }
    if (clone.tagName.toLowerCase() === 'svg' && !clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
  }

  Array.from(sourceEl.childNodes || []).forEach((child) => {
    const clonedChild = clonePreviewNodeForExport(child);
    if (clonedChild) clone.appendChild(clonedChild);
  });

  return clone;
}

async function inlineClonedImages(sourceRoot, cloneRoot) {
  const sourceImages = Array.from(sourceRoot?.querySelectorAll?.('img') || []);
  const cloneImages = Array.from(cloneRoot?.querySelectorAll?.('img') || []);

  await Promise.all(cloneImages.map(async (cloneImg, index) => {
    const sourceImg = sourceImages[index];
    if (!(cloneImg instanceof HTMLImageElement)) return;

    const localPath = String(
      cloneImg.dataset.localSrcPath ||
      sourceImg?.dataset?.localSrcPath ||
      ''
    ).trim();
    const currentSrc = String(
      sourceImg?.currentSrc ||
      sourceImg?.src ||
      cloneImg.currentSrc ||
      cloneImg.src ||
      cloneImg.getAttribute('src') ||
      ''
    ).trim();
    let nextSrc = currentSrc;

    try {
      if (localPath) {
        const buffer = await readFile(localPath, null);
        const dataUrl = await binaryToDataUrl(buffer, guessMimeByExt(path.extname(localPath)));
        if (dataUrl) nextSrc = dataUrl;
      }
      if (nextSrc === currentSrc && currentSrc.startsWith('blob:')) {
        const response = await fetch(currentSrc);
        if (response.ok) {
          nextSrc = await blobToDataUrl(await response.blob());
        }
      } else if (nextSrc === currentSrc && /^https?:\/\//i.test(currentSrc)) {
        const response = await fetch(currentSrc);
        if (response.ok) {
          nextSrc = await blobToDataUrl(await response.blob());
        }
      }
    } catch {
      nextSrc = currentSrc;
    }

    if (nextSrc) cloneImg.setAttribute('src', nextSrc);
    cloneImg.removeAttribute('srcset');
    cloneImg.removeAttribute('sizes');
    cloneImg.removeAttribute('loading');
    cloneImg.removeAttribute('decoding');
    cloneImg.removeAttribute('fetchpriority');
  }));
}

async function inlineClonedDiagrams(sourceRoot, cloneRoot) {
  const sourceNodes = Array.from(sourceRoot?.querySelectorAll?.('.md-editor-echarts, div.md-editor-mermaid, p.md-editor-mermaid') || []);
  const cloneNodes = Array.from(cloneRoot?.querySelectorAll?.('.md-editor-echarts, div.md-editor-mermaid, p.md-editor-mermaid') || []);

  await Promise.all(cloneNodes.map(async (cloneNode, index) => {
    const sourceNode = sourceNodes[index];
    if (!(cloneNode instanceof HTMLElement) || !(sourceNode instanceof HTMLElement)) return;

    const isEcharts = cloneNode.classList.contains('md-editor-echarts');
    const isMermaid = cloneNode.classList.contains('md-editor-mermaid');
    if (!isEcharts && !isMermaid) return;

    try {
      if (cloneRenderedDiagramContent(sourceNode, cloneNode)) {
        return;
      }

      if (isEcharts) {
        const source = String(sourceNode.dataset.aiToolsDiagramSource || sourceNode.textContent || '').trim();
        if (!source) return;
        const svgMarkup = await renderEchartsSvgForExport(source, props.theme, getDiagramExportSize(sourceNode));
        cloneNode.innerHTML = svgMarkup;
      } else {
        const source = String(sourceNode.dataset.aiToolsDiagramSource || sourceNode.dataset.content || sourceNode.textContent || '').trim();
        if (!source) return;
        const svgMarkup = await renderMermaidSvgForExport(source, props.theme, getDiagramExportSize(sourceNode));
        cloneNode.innerHTML = svgMarkup;
      }
    } catch (err) {
      console.warn('导出图表失败，保留当前渲染结果：', err);
    }
  }));
}

function getExportBackgroundColor(preview) {
  const previewWrapper = preview?.closest?.('.md-editor-preview-wrapper');
  const target = previewWrapper instanceof HTMLElement ? previewWrapper : preview;
  const color = String(window.getComputedStyle(target || document.body).backgroundColor || '').trim();
  if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
    return props.theme === 'dark' ? '#0f172a' : '#ffffff';
  }
  return color;
}

function getPreviewExportSize(preview) {
  const rect = preview?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const width = Math.max(
    1,
    Math.ceil(preview?.scrollWidth || 0),
    Math.ceil(preview?.clientWidth || 0),
    Math.ceil(rect.width || 0)
  );
  const height = Math.max(
    1,
    Math.ceil(preview?.scrollHeight || 0),
    Math.ceil(preview?.clientHeight || 0),
    Math.ceil(rect.height || 0)
  );
  return { width, height };
}

async function buildPreviewExportClone(preview) {
  const cloneRoot = clonePreviewNodeForExport(preview);
  if (!(cloneRoot instanceof HTMLElement || cloneRoot instanceof SVGElement)) {
    throw new Error('无法创建导出内容');
  }

  if (cloneRoot instanceof Element) {
    cloneRoot.style.overflow = 'visible';
    cloneRoot.style.height = 'auto';
    cloneRoot.style.maxHeight = 'none';
    cloneRoot.style.minHeight = '0';
  }

  stripExportOnlyNodes(cloneRoot);
  await inlineClonedImages(preview, cloneRoot);
  await inlineClonedDiagrams(preview, cloneRoot);
  normalizeExportDiagramBoxes(cloneRoot);
  return cloneRoot;
}

function buildStandaloneExportHtml(title, bodyHtml) {
  const safeTitle = String(title || 'note')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const background = props.theme === 'dark' ? '#0f172a' : '#ffffff';
  const color = props.theme === 'dark' ? '#e5e7eb' : '#111827';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; padding: 0; background: ${background}; color: ${color}; }
    body { padding: 24px; box-sizing: border-box; overflow: visible; }
    *, *::before, *::after { content-visibility: visible !important; contain: none !important; }
    .note-preview-diagram, .md-editor-echarts, .md-editor-mermaid, p.md-editor-mermaid {
      overflow: visible !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      width: auto !important;
    }
    svg {
      overflow: visible !important;
      max-width: none !important;
      max-height: none !important;
    }
    img, svg, canvas { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${String(bodyHtml || '')}
</body>
</html>`;
}

async function waitForPreviewExportReady() {
  await flushPendingSave();
  clearPendingHtmlRefresh();
  editorRef.value?.rerender?.();
  await nextTick();
  await waitForAnimationFrames(3);

  const preview = getPreviewRoot();
  if (!(preview instanceof HTMLElement)) {
    throw new Error('未找到可导出的笔记预览内容');
  }
  if (previewHasDiagramHosts(preview)) {
    decoratePreviewDiagrams(preview);
  }
  await hydratePreviewImagesForExport(preview);
  await waitForPreviewImages(preview);
  await waitForPreviewDiagrams(preview);
  await waitForAnimationFrames(2);
  return preview;
}

async function renderPreviewCloneToPngBlob(preview, cloneRoot) {
  const api = getUtoolsApi();
  if (!api?.createBrowserWindow) {
    throw new Error('当前环境不支持 PNG 导出窗口');
  }

  const width = getPreviewViewportWidth(preview);
  const background = getExportBackgroundColor(preview);
  const html = buildStandaloneExportHtml(noteTitle.value, cloneRoot.outerHTML);
  const exportUrl = 'export-preview.html';
  const windowOptions = {
    show: false,
    width,
    height: 1,
    frame: false,
    resizable: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    focusable: false,
    backgroundColor: background,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  };

  const captureWindow = await new Promise((resolve, reject) => {
    let settled = false;
    let win = null;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('PNG 导出窗口加载超时'));
    }, 10000);

    try {
      win = api.createBrowserWindow(exportUrl, windowOptions, () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(win);
      });
    } catch (err) {
      window.clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });

  try {
    await captureWindow.webContents.executeJavaScript(`
      (async () => {
        const html = ${JSON.stringify(html)};
        document.open();
        document.write(html);
        document.close();

        if (document.fonts?.ready) {
          try { await document.fonts.ready; } catch {}
        }

        const waitForImage = (img) => new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 5000);
        });

        await Promise.all(Array.from(document.images || []).map((img) => waitForImage(img)));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return true;
      })()
    `);

    const measureSize = () => captureWindow.webContents.executeJavaScript(`
      ({
        width: Math.max(1, Math.ceil(document.documentElement.scrollWidth || document.body.scrollWidth || ${width})),
        height: Math.max(1, Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 1))
      })
    `);

    let captureWidth = Math.max(1, Math.ceil(Number(width || 1)));
    let captureHeight = 1;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const size = await measureSize();
      const nextWidth = Math.max(1, Math.ceil(Number(size?.width || captureWidth)));
      const nextHeight = Math.max(1, Math.ceil(Number(size?.height || captureHeight)));
      captureWidth = Math.max(captureWidth, nextWidth);
      captureHeight = Math.max(captureHeight, nextHeight);

      captureWindow.setContentSize(captureWidth, captureHeight, false);
      await captureWindow.webContents.executeJavaScript(
        `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`
      );

      const settledSize = await measureSize();
      const settledWidth = Math.max(1, Math.ceil(Number(settledSize?.width || captureWidth)));
      const settledHeight = Math.max(1, Math.ceil(Number(settledSize?.height || captureHeight)));
      if (settledWidth === captureWidth && settledHeight === captureHeight) {
        break;
      }
      captureWidth = Math.max(captureWidth, settledWidth);
      captureHeight = Math.max(captureHeight, settledHeight);
    }

    const nativeImage = await captureWindow.capturePage(
      { x: 0, y: 0, width: captureWidth, height: captureHeight },
      { stayHidden: true }
    );
    const pngBuffer = nativeImage?.toPNG?.();
    if (!pngBuffer || !pngBuffer.length) {
      throw new Error('PNG 生成失败');
    }
    return new Blob([pngBuffer], { type: 'image/png' });
  } finally {
    try {
      captureWindow?.destroy?.();
    } catch {
      // ignore
    }
  }
}

async function exportCurrentNoteAsHtml() {
  if (!props.filePath) throw new Error('当前没有打开的笔记');

  try {
    const outputPath = openExportSaveDialog({
      title: '导出 HTML',
      defaultPath: buildDefaultExportFileName('html'),
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });
    if (!outputPath) return false;

    const preview = await waitForPreviewExportReady();
    const cloneRoot = await buildPreviewExportClone(preview);
    const html = buildStandaloneExportHtml(noteTitle.value, cloneRoot.outerHTML);
    await writeAbsoluteFile(outputPath, html);
    message.success(`已导出：${outputPath}`);
    return true;
  } finally {
    await nextTick();
  }
}

async function exportCurrentNoteAsPng() {
  if (!props.filePath) throw new Error('当前没有打开的笔记');

  try {
    const outputPath = openExportSaveDialog({
      title: '导出 PNG',
      defaultPath: buildDefaultExportFileName('png'),
      filters: [{ name: 'PNG', extensions: ['png'] }]
    });
    if (!outputPath) return false;

    const preview = await waitForPreviewExportReady();
    const cloneRoot = await buildPreviewExportClone(preview);
    const blob = await renderPreviewCloneToPngBlob(preview, cloneRoot);
    await writeAbsoluteFile(outputPath, new Uint8Array(await blob.arrayBuffer()));
    message.success(`已导出：${outputPath}`);
    return true;
  } finally {
    await nextTick();
  }
}

defineExpose({
  flushPendingSave,
  exportCurrentNoteAsHtml,
  exportCurrentNoteAsPng
});

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

watch(content, (newContent) => {
  if (suppressContentWatcher || !props.filePath || noteReferencePicker.value.show) return;
  const trigger = extractTrailingNoteReferenceTrigger(newContent);
  if (!trigger?.query) return;
  openNoteReferencePicker({
    query: trigger.query,
    trigger
  });
});

watch(
  () => [noteReferencePicker.value.show, noteReferencePicker.value.query],
  ([show]) => {
    if (!show) {
      clearNoteReferenceSearchTimer();
      noteReferenceSearchToken += 1;
      noteReferencePicker.value.loading = false;
      return;
    }
    scheduleNoteReferenceSearch();
  }
);

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
  const currentContent = String(content.value ?? '');
  if (shouldPersistMarkdownDraftOnPathChange({
    oldPath,
    currentContent,
    lastSavedFilePath,
    lastSavedContent
  })) {
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
        const rewritten = rewriteNoteAssetsLinksInMarkdown(currentContent, oldDocName, newDocName);
        const rewrittenContent = String(rewritten || '');
        setEditorContent(rewrittenContent);
        await persistNoteText(renameInfo.to, rewrittenContent);
        lastSavedFilePath = String(renameInfo.to || '');
        lastSavedContent = rewrittenContent;
        scheduleCleanupAttachments(renameInfo.to, rewrittenContent);
        lastHandledRenameToken = renameInfo.token;
      } else {
        await queuePersistContent(oldPath, currentContent);
      }
    } catch (err) {
      message.error('保存上一份文件失败：' + (err?.message || String(err)));
    }
  }
  pendingPreviewImageLoads.clear();

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
  clearNoteReferenceSearchTimer();
  closeEditorContextMenu();
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

  const href = String(link.getAttribute('href') || '').trim();
  if (!href || href.startsWith('#')) return;

  e.preventDefault();
  e.stopPropagation();

  if (getSafeExternalUrl(href)) {
    safeOpenExternal(href);
    return;
  }

  const ok = await openNoteFromHref(href);
  if (ok) return;
  copyToClipboard(href);
}

function handlePreviewLinkContextMenu(e) {
  const link = e.target?.closest?.('a');
  if (!link || !previewLinkRoot?.contains(link)) return;

  const href = String(link.getAttribute('href') || '').trim();
  if (!href) return;

  e.preventDefault();
  e.stopPropagation();
  showEditorContextMenu(e, { href });
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
.note-reference-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-reference-picker__meta {
  min-height: 18px;
  color: rgba(71, 85, 105, 0.78);
  font-size: 12px;
}

.note-reference-picker.is-dark .note-reference-picker__meta {
  color: rgba(203, 213, 225, 0.72);
}

.note-reference-picker__error {
  color: #d03050;
  font-size: 12px;
}

.note-reference-picker__results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(52vh, 460px);
  overflow: auto;
}

.note-reference-picker__item {
  display: grid;
  grid-template-columns: minmax(120px, 0.65fr) minmax(160px, 1fr);
  gap: 4px 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.86);
  color: #0f172a;
  text-align: left;
  cursor: pointer;
}

.note-reference-picker__item:hover {
  border-color: rgba(37, 99, 235, 0.3);
  background: rgba(239, 246, 255, 0.94);
}

.note-reference-picker.is-dark .note-reference-picker__item {
  border-color: rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.68);
  color: #e2e8f0;
}

.note-reference-picker.is-dark .note-reference-picker__item:hover {
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(12, 74, 110, 0.36);
}

.note-reference-picker__title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-reference-picker__path {
  overflow: hidden;
  color: rgba(71, 85, 105, 0.72);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-reference-picker.is-dark .note-reference-picker__path {
  color: rgba(203, 213, 225, 0.68);
}

.note-reference-picker__preview {
  grid-column: 1 / -1;
  display: -webkit-box;
  overflow: hidden;
  color: rgba(51, 65, 85, 0.82);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.note-reference-picker.is-dark .note-reference-picker__preview {
  color: rgba(203, 213, 225, 0.78);
}

.note-reference-picker__empty {
  padding: 28px 12px;
  color: rgba(71, 85, 105, 0.76);
  text-align: center;
}

.note-reference-picker__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: rgba(71, 85, 105, 0.76);
  font-size: 12px;
}

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

.editor-container :deep(.md-editor-preview > *) {
  content-visibility: auto;
  contain-intrinsic-block-size: auto 96px;
}

.editor-container :deep(.md-editor-preview img) {
  display: block;
  max-width: 100%;
  height: auto;
  contain: paint;
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






