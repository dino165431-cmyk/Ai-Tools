import { computed, ref } from 'vue'
import { exists } from '@/utils/fileOperations'
import { requestOpenNoteFile } from '@/utils/noteOpenBridge'
import { buildNoteHrefFromPath, resolveNoteAbsPathFromHref, safeDecodeURIComponent } from '@/utils/notePathUtils'
import { getSafeExternalUrl, safeOpenExternal } from '@/utils/safeOpenExternal'
import { runChatWorkspaceFileAction } from '@/utils/chatWorkspaceFileOperations.js'
import { collectSandboxFileCatalog, resolveSandboxFileLink } from '@/utils/chatSandboxFileLink'

export function buildChatLinkContextMenuOptions(hrefRaw, file = null) {
  if (file) {
    return [
      { label: '保存到指定目录…', key: 'save-file-as' },
      { label: '打开文件', key: 'open-file' },
      { label: '在文件夹中显示', key: 'show-file' },
      { type: 'divider' },
      { label: '复制文件名', key: 'copy-file-name' },
      { label: '复制沙盒路径', key: 'copy-file-path' },
      { label: '复制下载链接', key: 'copy-file-link' }
    ]
  }

  const externalUrl = getSafeExternalUrl(String(hrefRaw || '').trim())
  return [
    {
      label: externalUrl ? '在浏览器中打开链接' : '打开引用的笔记',
      key: 'open'
    },
    { label: '复制链接', key: 'copy' }
  ]
}

export function useChatLinkActions({
  session,
  getChatListElement,
  router,
  message,
  copyToClipboard
}) {
  const chatLinkContextMenu = ref({
    show: false,
    x: 0,
    y: 0,
    href: '',
    text: '',
    file: null
  })

  const sandboxFileCatalog = computed(() => collectSandboxFileCatalog(session.messages))
  const chatLinkContextMenuOptions = computed(() => buildChatLinkContextMenuOptions(
    chatLinkContextMenu.value.href,
    chatLinkContextMenu.value.file
  ))

  function closeChatLinkContextMenu() {
    chatLinkContextMenu.value.show = false
  }

  function cleanupChatPreviewLinkHandlers() {
    closeChatLinkContextMenu()
  }

  async function resolveChatNoteAbsPathFromHref(hrefRaw) {
    return resolveNoteAbsPathFromHref({
      hrefRaw,
      currentDir: 'note',
      existsFn: exists
    })
  }

  async function openChatNoteFromHref(href) {
    const noteAbsPath = await resolveChatNoteAbsPathFromHref(href)
    if (!noteAbsPath) return false
    await router.push({ name: 'note' }).catch(() => {})
    requestOpenNoteFile(noteAbsPath)
    return true
  }

  async function runChatWorkspaceResultFileAction(file, action, actionOptions = {}) {
    const outcome = await runChatWorkspaceFileAction(file, action, { actionOptions })
    if (outcome.recovered) {
      message.warning('原始结果文件已丢失，已根据历史写入内容恢复副本')
    }
    return outcome.result
  }

  function saveChatWorkspaceResultFile(file, options = {}) {
    return runChatWorkspaceResultFileAction(file, 'save', options)
  }

  function openChatWorkspaceResultFile(file) {
    return runChatWorkspaceResultFileAction(file, 'open')
  }

  function showChatWorkspaceResultFile(file) {
    return runChatWorkspaceResultFileAction(file, 'show')
  }

  async function handleChatPreviewLinkClick(event) {
    const link = event.target?.closest?.('a')
    const chatListElement = getChatListElement()
    if (!link || !chatListElement?.contains(link)) return

    const href = String(link.getAttribute('href') || '').trim()
    if (!href || href.startsWith('#')) return

    event.preventDefault()
    event.stopPropagation()

    const sandboxFile = resolveSandboxFileLink(href, sandboxFileCatalog.value)
    if (sandboxFile) {
      try {
        const result = await saveChatWorkspaceResultFile(sandboxFile, {
          suggestedName: sandboxFile.name || 'sandbox-output'
        })
        if (!result?.canceled) message.success('文件已保存')
      } catch (error) {
        message.error(`保存文件失败：${error?.message || String(error)}`)
      }
      return
    }

    if (getSafeExternalUrl(href)) {
      safeOpenExternal(href)
      return
    }

    if (await openChatNoteFromHref(href)) return
    copyToClipboard(href)
  }

  function handleChatPreviewLinkContextMenu(event) {
    const link = event.target?.closest?.('a')
    const chatListElement = getChatListElement()
    if (!link || !chatListElement?.contains(link)) return

    const href = String(link.getAttribute('href') || '').trim()
    if (!href) return

    event.preventDefault()
    event.stopPropagation()
    chatLinkContextMenu.value = {
      show: false,
      x: event.clientX,
      y: event.clientY,
      href,
      text: String(link.textContent || '').trim(),
      file: resolveSandboxFileLink(href, sandboxFileCatalog.value)
    }
    window.setTimeout(() => {
      chatLinkContextMenu.value.show = true
    }, 0)
  }

  async function copyChatContextLink(href) {
    const externalUrl = getSafeExternalUrl(href)
    if (externalUrl?.protocol === 'mailto:') {
      copyToClipboard(safeDecodeURIComponent(externalUrl.pathname))
      return
    }
    if (externalUrl) {
      copyToClipboard(externalUrl.toString())
      return
    }

    try {
      const noteAbsPath = await resolveChatNoteAbsPathFromHref(href)
      const noteHref = noteAbsPath ? buildNoteHrefFromPath(noteAbsPath) : ''
      copyToClipboard(noteHref || href)
    } catch {
      copyToClipboard(href)
    }
  }

  async function handleChatLinkContextMenuSelect(key) {
    const href = String(chatLinkContextMenu.value.href || '').trim()
    const file = chatLinkContextMenu.value.file
    closeChatLinkContextMenu()
    if (!href) return

    if (file) {
      try {
        if (key === 'save-file-as') {
          const result = await saveChatWorkspaceResultFile(file, {
            suggestedName: file.name || 'sandbox-output'
          })
          if (!result?.canceled) message.success('文件已保存')
          return
        }
        if (key === 'open-file') {
          await openChatWorkspaceResultFile(file)
          return
        }
        if (key === 'show-file') {
          await showChatWorkspaceResultFile(file)
          return
        }
        if (key === 'copy-file-name') {
          copyToClipboard(file.name || file.path)
          return
        }
        if (key === 'copy-file-path') {
          copyToClipboard(file.path || file.dataPath)
          return
        }
        if (key === 'copy-file-link') {
          copyToClipboard(file.href || href)
          return
        }
      } catch (error) {
        message.error(`文件操作失败：${error?.message || String(error)}`)
      }
      return
    }

    if (key === 'copy') {
      await copyChatContextLink(href)
      return
    }
    if (key === 'open') {
      if (getSafeExternalUrl(href)) {
        safeOpenExternal(href)
        return
      }
      if (!(await openChatNoteFromHref(href))) message.warning('无法打开该链接')
    }
  }

  return {
    chatLinkContextMenu,
    chatLinkContextMenuOptions,
    cleanupChatPreviewLinkHandlers,
    handleChatPreviewLinkClick,
    handleChatPreviewLinkContextMenu,
    closeChatLinkContextMenu,
    handleChatLinkContextMenuSelect,
    saveChatWorkspaceResultFile,
    openChatWorkspaceResultFile,
    showChatWorkspaceResultFile
  }
}
