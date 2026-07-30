import {
  openFile,
  openWorkspaceFile,
  saveFileAs,
  saveWorkspaceFileAs,
  showItemInFolder,
  showWorkspaceItemInFolder,
  writeFile
} from '@/utils/fileOperations'

const defaultOperations = {
  openFile,
  openWorkspaceFile,
  saveFileAs,
  saveWorkspaceFileAs,
  showItemInFolder,
  showWorkspaceItemInFolder,
  writeFile
}

export function isMissingChatWorkspaceFileError(error) {
  const code = String(error?.code || '').trim().toUpperCase()
  const text = String(error?.message || error || '')
  return code === 'ENOENT' || /ENOENT|no such file or directory|文件或目录不存在/i.test(text)
}

export function describeMissingChatWorkspaceFile(file) {
  const name = String(file?.name || file?.path || '结果文件').trim() || '结果文件'
  return `结果文件“${name}”已不在原工作区中。该会话只保留了文件引用，请重新生成文件后再操作。`
}

export function decodeChatWorkspaceFileRecovery(recovery) {
  if (!recovery || typeof recovery !== 'object' || typeof recovery.content !== 'string') return null
  if (String(recovery.encoding || '').trim().toLowerCase() !== 'base64') return recovery.content

  const decode = globalThis.atob
  if (typeof decode !== 'function') throw new Error('当前环境无法恢复 Base64 结果文件')
  const binary = decode(recovery.content)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function isHostWorkspaceFile(file) {
  return (
    String(file?.workspaceKind || '').trim().toLowerCase() === 'host' &&
    String(file?.workspacePath || '').trim() &&
    String(file?.path || '').trim()
  )
}

async function performFileAction(file, action, options, operations) {
  const hostFile = isHostWorkspaceFile(file)
  if (action === 'save') {
    if (hostFile) {
      return operations.saveWorkspaceFileAs(file.workspacePath, file.path, options)
    }
    return operations.saveFileAs(file.dataPath, options)
  }
  if (action === 'open') {
    if (hostFile) return operations.openWorkspaceFile(file.workspacePath, file.path)
    return operations.openFile(file.dataPath)
  }
  if (action === 'show') {
    if (hostFile) return operations.showWorkspaceItemInFolder(file.workspacePath, file.path)
    return operations.showItemInFolder(file.dataPath)
  }
  throw new Error(`不支持的工作区文件操作：${action}`)
}

async function recoverWorkspaceFile(file, operations) {
  const data = decodeChatWorkspaceFileRecovery(file?.recovery)
  const recoveryDataPath = String(file?.recoveryDataPath || file?.dataPath || '').trim()
  if (data === null || !recoveryDataPath) return null
  await operations.writeFile(recoveryDataPath, data)
  return {
    ...file,
    workspaceKind: 'sandbox',
    workspacePath: '',
    dataPath: recoveryDataPath
  }
}

export async function runChatWorkspaceFileAction(file, action, options = {}) {
  const operations = options.operations || defaultOperations
  const actionOptions = options.actionOptions || {}
  try {
    const result = await performFileAction(file, action, actionOptions, operations)
    return { result, recovered: false, file }
  } catch (error) {
    if (!isMissingChatWorkspaceFileError(error)) throw error
    const recoveredFile = await recoverWorkspaceFile(file, operations)
    if (recoveredFile) {
      const result = await performFileAction(recoveredFile, action, actionOptions, operations)
      return { result, recovered: true, file: recoveredFile }
    }
    const missingError = new Error(describeMissingChatWorkspaceFile(file))
    missingError.code = 'CHAT_WORKSPACE_FILE_MISSING'
    throw missingError
  }
}

