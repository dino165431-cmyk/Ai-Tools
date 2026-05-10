const globalConfig = require('./global-config')
const S3ClientWrapper = require('./s3-operations')
const contentIndex = require('./content-index')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const { execFile } = require('child_process')

const CLOUD_AUTO_BACKUP_DEBOUNCE_MS = 15000
const CLOUD_AUTO_RESTORE_DEBOUNCE_MS = 15000
const CLOUD_AUTO_BACKUP_MIN_INTERVAL_MS = 5 * 60 * 1000
const CLOUD_AUTO_REQUIRED_KEYS = ['region', 'accessKeyId', 'secretAccessKey', 'bucket']
const EXTERNAL_WATCH_DEBOUNCE_MS = 500
const INTERNAL_MUTATION_SUPPRESS_MS = 1500

let electronShell = null
try {
    electronShell = require('electron')?.shell || null
} catch {
    electronShell = null
}

function guessMimeByExt(extRaw) {
    const ext = String(extRaw || '').toLowerCase()
    if (ext === '.png') return 'image/png'
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
    if (ext === '.gif') return 'image/gif'
    if (ext === '.webp') return 'image/webp'
    if (ext === '.svg') return 'image/svg+xml'
    if (ext === '.bmp') return 'image/bmp'
    if (ext === '.ico') return 'image/x-icon'
    if (ext === '.mp4') return 'video/mp4'
    if (ext === '.webm') return 'video/webm'
    if (ext === '.mov') return 'video/quicktime'
    if (ext === '.m4v') return 'video/x-m4v'
    if (ext === '.ogv') return 'video/ogg'
    return 'application/octet-stream'
}

class FileOperations {
    constructor() {
        if (FileOperations.instance) {
            return FileOperations.instance
        }
        FileOperations.instance = this
        this._imageBlobCache = new Map()
        this._cloudAutomationInitialized = false
        this._cloudAutoBackupReady = false
        this._cloudAutoBackupSignature = ''
        this._cloudAutoBackupTimer = null
        this._cloudOperationRunning = false
        this._cloudAutoBackupRunning = false
        this._cloudAutoBackupPending = false
        this._cloudAutoBackupLastRunAt = 0
        this._cloudAutoRestoreReady = false
        this._cloudAutoRestoreSignature = ''
        this._cloudAutoRestoreTimer = null
        this._cloudAutoRestoreRunning = false
        this._cloudAutoRestorePending = false
        this._externalWatchers = new Map()
        this._externalWatchDebounceTimers = new Map()
        this._internalMutationSuppressUntil = new Map()
        this._lastWatcherRootSignature = ''
    }

    _revokeCachedBlobUrl(cacheKey) {
        if (!cacheKey || !this._imageBlobCache.has(cacheKey)) return
        const url = this._imageBlobCache.get(cacheKey)
        if (url) {
            try {
                URL.revokeObjectURL(url)
            } catch {
                // ignore revoke failures
            }
        }
        this._imageBlobCache.delete(cacheKey)
    }

    _clearBlobCacheForRelativePath(relativePath, options = {}) {
        const raw = String(relativePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
        if (!raw) return

        const recursive = !!options?.recursive
        const exactKeys = new Set([raw])
        const prefixKeys = recursive ? [`${raw}/`] : []

        for (const key of [...this._imageBlobCache.keys()]) {
            if (exactKeys.has(key) || prefixKeys.some((prefix) => key.startsWith(prefix))) {
                this._revokeCachedBlobUrl(key)
            }
        }
    }

    _dispatchWindowEvent(eventName, detail = {}) {
        try {
            if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
            const CustomEventCtor = window.CustomEvent || globalThis.CustomEvent
            if (typeof CustomEventCtor !== 'function') return
            window.dispatchEvent(new CustomEventCtor(eventName, { detail }))
        } catch {
            // ignore event dispatch failures
        }
    }

    _normalizeRelativePath(relativePath) {
        return String(relativePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
    }

    _notifyRestoredRelativePathsChanged(relativePaths = []) {
        const normalizedPaths = [...new Set(
            (Array.isArray(relativePaths) ? relativePaths : [relativePaths])
                .map((item) => this._normalizeRelativePath(item))
                .filter(Boolean)
        )]
        if (!normalizedPaths.length) return

        this._dispatchWindowEvent('storageFilesChanged', { paths: normalizedPaths })

        const notePaths = normalizedPaths.filter((item) => item === 'note' || item.startsWith('note/'))
        if (notePaths.length) {
            this._dispatchWindowEvent('noteFilesChanged', {
                path: 'note',
                paths: notePaths
            })
        }

        const sessionPaths = normalizedPaths.filter((item) => item === 'session' || item.startsWith('session/'))
        if (sessionPaths.length) {
            this._dispatchWindowEvent('sessionFilesChanged', {
                path: 'session',
                paths: sessionPaths
            })
        }

        const memoryPaths = normalizedPaths.filter((item) => item === 'chat-memory' || item.startsWith('chat-memory/'))
        if (memoryPaths.length) {
            this._dispatchWindowEvent('memoryStoreChanged', {
                path: 'chat-memory',
                paths: memoryPaths
            })
        }
    }

    _markInternalMutation(relativePath) {
        const normalized = this._normalizeRelativePath(relativePath)
        if (!normalized) return
        const now = Date.now()
        this._internalMutationSuppressUntil.set(normalized, now + INTERNAL_MUTATION_SUPPRESS_MS)
        const parts = normalized.split('/').filter(Boolean)
        while (parts.length > 1) {
            parts.pop()
            this._internalMutationSuppressUntil.set(parts.join('/'), now + INTERNAL_MUTATION_SUPPRESS_MS)
        }
    }

    _isPathSuppressedByInternalMutation(relativePath) {
        const normalized = this._normalizeRelativePath(relativePath)
        if (!normalized) return false
        const now = Date.now()
        for (const [key, until] of [...this._internalMutationSuppressUntil.entries()]) {
            if (!Number.isFinite(until) || until <= now) {
                this._internalMutationSuppressUntil.delete(key)
                continue
            }
            if (normalized === key || normalized.startsWith(`${key}/`) || key.startsWith(`${normalized}/`)) {
                return true
            }
        }
        return false
    }

    _queueExternalTreeRefresh(rootRelPath, changedRelPath) {
        const root = this._normalizeRelativePath(rootRelPath)
        if (!root) return
        if (this._isPathSuppressedByInternalMutation(changedRelPath || root)) return

        const existingTimer = this._externalWatchDebounceTimers.get(root)
        if (existingTimer) clearTimeout(existingTimer)

        const timer = setTimeout(async () => {
            this._externalWatchDebounceTimers.delete(root)
            try {
                await contentIndex.markDirtyByPath(root, 'external_watch')
            } catch (err) {
                console.warn?.('[Content index] external watch dirty mark failed:', err)
            }

            this._dispatchWindowEvent('storageFilesChanged', { paths: [root] })
            if (root === 'note') {
                this._dispatchWindowEvent('noteFilesChanged', { path: 'note', paths: ['note'] })
            } else if (root === 'session') {
                this._dispatchWindowEvent('sessionFilesChanged', { path: 'session', paths: ['session'] })
            }
        }, EXTERNAL_WATCH_DEBOUNCE_MS)

        this._externalWatchDebounceTimers.set(root, timer)
    }

    _closeExternalWatchers() {
        for (const watcher of this._externalWatchers.values()) {
            try {
                watcher?.close?.()
            } catch {
                // ignore close failures
            }
        }
        this._externalWatchers.clear()
    }

    _ensureExternalWatchers() {
        let rootAbs = ''
        try {
            rootAbs = this._getDataStorageRootAbs()
        } catch {
            this._closeExternalWatchers()
            this._lastWatcherRootSignature = ''
            return
        }

        const signature = rootAbs
        if (signature === this._lastWatcherRootSignature && this._externalWatchers.size) return

        this._closeExternalWatchers()
        this._lastWatcherRootSignature = signature

        const watchedRoots = ['note', 'session']
        for (const rootRel of watchedRoots) {
            const absPath = path.join(rootAbs, rootRel)
            try {
                fsSync.mkdirSync(absPath, { recursive: true })
                const watcher = fsSync.watch(absPath, { recursive: true }, (_eventType, filename) => {
                    const rawName = typeof filename === 'string' ? filename : ''
                    const normalizedRel = rawName
                        ? `${rootRel}/${String(rawName).replace(/\\/g, '/')}`.replace(/\/+/g, '/')
                        : rootRel
                    const relevant = rootRel === 'note'
                        ? contentIndex._internal.isRelevantWatchedPath('note', normalizedRel)
                        : contentIndex._internal.isRelevantWatchedPath('session', normalizedRel)
                    if (!relevant && normalizedRel !== rootRel) return
                    this._queueExternalTreeRefresh(rootRel, normalizedRel)
                })
                this._externalWatchers.set(rootRel, watcher)
            } catch (err) {
                console.warn?.(`[External watch] failed for ${rootRel}:`, err)
            }
        }
    }

    async _updateContentIndexAfterWrite(relativePath) {
        try {
            await contentIndex.upsertPath(relativePath)
        } catch (err) {
            console.warn?.('[Content index] write sync failed:', err)
            await contentIndex.markDirtyByPath(relativePath, 'write_failed')
        }
    }

    async _updateContentIndexAfterDelete(relativePath, options = {}) {
        try {
            await contentIndex.removePath(relativePath, { isDirectory: options.isDirectory === true })
        } catch (err) {
            console.warn?.('[Content index] delete sync failed:', err)
            await contentIndex.markDirtyByPath(relativePath, 'delete_failed')
        }
    }

    async _updateContentIndexAfterMove(fromRelativePath, toRelativePath, options = {}) {
        try {
            await contentIndex.movePath(fromRelativePath, toRelativePath, { isDirectory: options.isDirectory === true })
        } catch (err) {
            console.warn?.('[Content index] move sync failed:', err)
            await contentIndex.markDirtyRoots([fromRelativePath, toRelativePath], 'move_failed')
        }
    }

    initCloudAutomation() {
        if (this._cloudAutomationInitialized) return
        this._cloudAutomationInitialized = true

        this._handleCloudAutomationConfigChange(this._getCloudConfigSafe())
        this._ensureExternalWatchers()

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('globalConfigChanged', (event) => {
                this._handleCloudAutomationConfigChange(event?.detail?.cloudConfig)
                this._ensureExternalWatchers()
            })
        }
    }

    _getCloudConfigSafe() {
        try {
            return globalConfig.getCloudConfig?.() || {}
        } catch {
            return {}
        }
    }

    _hasRequiredCloudConfig(config) {
        return CLOUD_AUTO_REQUIRED_KEYS.every((key) => String(config?.[key] || '').trim())
    }

    _isCloudAutoBackupReady(config = this._getCloudConfigSafe()) {
        return config?.autoBackupEnabled === true && this._hasRequiredCloudConfig(config)
    }

    _isCloudAutoRestoreReady(config = this._getCloudConfigSafe()) {
        return config?.autoRestoreEnabled === true && this._hasRequiredCloudConfig(config)
    }

    _getCloudConnectionSignature(config) {
        return [
            ...CLOUD_AUTO_REQUIRED_KEYS.map((key) => String(config?.[key] || '').trim()),
            String(config?.endpoint || '').trim(),
            String(config?.forcePathStyle === true)
        ].join('\n')
    }

    _getCloudAutoBackupSignature(config) {
        return this._getCloudConnectionSignature(config)
    }

    _getCloudAutoRestoreSignature(config) {
        return [
            this._getCloudConnectionSignature(config),
            String(globalConfig.getDataStorageRoot?.() || '').trim()
        ].join('\n')
    }

    _clearCloudAutoBackupTimer() {
        if (!this._cloudAutoBackupTimer) return
        clearTimeout(this._cloudAutoBackupTimer)
        this._cloudAutoBackupTimer = null
    }

    _clearCloudAutoRestoreTimer() {
        if (!this._cloudAutoRestoreTimer) return
        clearTimeout(this._cloudAutoRestoreTimer)
        this._cloudAutoRestoreTimer = null
    }

    _handleCloudAutomationConfigChange(config = this._getCloudConfigSafe()) {
        const backupReady = this._isCloudAutoBackupReady(config)
        const backupSignature = backupReady ? this._getCloudAutoBackupSignature(config) : ''
        const shouldRunInitialBackup = backupReady && (!this._cloudAutoBackupReady || this._cloudAutoBackupSignature !== backupSignature)
        const restoreReady = this._isCloudAutoRestoreReady(config)
        const restoreSignature = restoreReady ? this._getCloudAutoRestoreSignature(config) : ''
        const shouldRunInitialRestore = restoreReady && (!this._cloudAutoRestoreReady || this._cloudAutoRestoreSignature !== restoreSignature)

        this._cloudAutoBackupReady = backupReady
        this._cloudAutoBackupSignature = backupSignature
        this._cloudAutoRestoreReady = restoreReady
        this._cloudAutoRestoreSignature = restoreSignature

        if (!backupReady) {
            this._clearCloudAutoBackupTimer()
        }
        if (!restoreReady) {
            this._clearCloudAutoRestoreTimer()
        }

        if (shouldRunInitialRestore) this._scheduleCloudAutoRestore()
        if (shouldRunInitialBackup) this._scheduleCloudAutoBackup()
    }

    _scheduleCloudAutoBackup() {
        if (!this._cloudAutomationInitialized || !this._isCloudAutoBackupReady()) return

        this._clearCloudAutoBackupTimer()
        const now = Date.now()
        const throttleDelay = this._cloudAutoBackupLastRunAt > 0
            ? Math.max(0, CLOUD_AUTO_BACKUP_MIN_INTERVAL_MS - (now - this._cloudAutoBackupLastRunAt))
            : 0
        const delay = Math.max(CLOUD_AUTO_BACKUP_DEBOUNCE_MS, throttleDelay)

        this._cloudAutoBackupTimer = setTimeout(() => {
            this._cloudAutoBackupTimer = null
            void this._runCloudAutoBackup()
        }, delay)
    }

    _scheduleCloudAutoRestore() {
        if (!this._cloudAutomationInitialized || !this._isCloudAutoRestoreReady()) return

        this._clearCloudAutoRestoreTimer()
        this._cloudAutoRestoreTimer = setTimeout(() => {
            this._cloudAutoRestoreTimer = null
            void this._runCloudAutoRestore()
        }, CLOUD_AUTO_RESTORE_DEBOUNCE_MS)
    }

    _scheduleCloudAutoBackupAfterMutation() {
        this._scheduleCloudAutoBackup()
    }

    _isCloudAutoOperationRunning() {
        return this._cloudOperationRunning || this._cloudAutoBackupRunning || this._cloudAutoRestoreRunning
    }

    _schedulePendingCloudAutoOperation() {
        if (this._cloudAutoRestorePending) {
            this._cloudAutoRestorePending = false
            this._scheduleCloudAutoRestore()
            return
        }
        if (this._cloudAutoBackupPending) {
            this._cloudAutoBackupPending = false
            this._scheduleCloudAutoBackup()
        }
    }

    async _runExclusiveCloudOperation(operation) {
        if (this._cloudOperationRunning) {
            throw new Error('已有云端任务正在执行，请稍后再试')
        }
        this._cloudOperationRunning = true
        try {
            return await operation()
        } finally {
            this._cloudOperationRunning = false
        }
    }

    async _runManualCloudOperation(operation) {
        try {
            return await this._runExclusiveCloudOperation(operation)
        } finally {
            this._schedulePendingCloudAutoOperation()
        }
    }

    async _runCloudAutoBackup() {
        if (!this._isCloudAutoBackupReady()) return

        if (this._isCloudAutoOperationRunning()) {
            this._cloudAutoBackupPending = true
            return
        }

        this._cloudAutoBackupRunning = true
        try {
            await this._runExclusiveCloudOperation(() => this._backupToCloudInternal())
            this._cloudAutoBackupLastRunAt = Date.now()
        } catch (err) {
            console.warn?.('[Cloud auto backup] failed:', err)
        } finally {
            this._cloudAutoBackupRunning = false
            this._schedulePendingCloudAutoOperation()
        }
    }

    async _runCloudAutoRestore() {
        if (!this._isCloudAutoRestoreReady()) return

        if (this._isCloudAutoOperationRunning()) {
            this._cloudAutoRestorePending = true
            return
        }

        this._cloudAutoRestoreRunning = true
        try {
            await this._runExclusiveCloudOperation(() => this._restoreFromCloudInternal())
        } catch (err) {
            console.warn?.('[Cloud auto restore] failed:', err)
        } finally {
            this._cloudAutoRestoreRunning = false
            this._schedulePendingCloudAutoOperation()
        }
    }

    _getDataStorageRootAbs() {
        const rootRaw = globalConfig.getDataStorageRoot()
        const root = typeof rootRaw === 'string' ? rootRaw.trim() : ''
        if (!root) {
            throw new Error('数据存储根目录未配置')
        }
        if (root.includes('\0')) {
            throw new Error('数据存储根目录包含非法字符')
        }
        if (!path.isAbsolute(root)) {
            throw new Error('数据存储根目录必须为绝对路径')
        }
        return path.resolve(root)
    }

    _assertSafeRelativePath(relativePath) {
        const rel = relativePath == null ? '' : relativePath
        if (typeof rel !== 'string') {
            throw new Error('路径必须为字符串')
        }
        if (!rel) return
        if (rel.includes('\0')) {
            throw new Error('路径包含非法字符')
        }
        if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.startsWith('\\\\') || rel.startsWith('//')) {
            throw new Error('不允许传入绝对路径')
        }
    }

    _resolvePath(relativePath) {
        this._assertSafeRelativePath(relativePath)

        const rootAbs = this._getDataStorageRootAbs()
        const targetAbs = path.resolve(rootAbs, String(relativePath || ''))
        const rel = path.relative(rootAbs, targetAbs)
        const escapedRoot = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)
        if (escapedRoot) {
            throw new Error('路径越界：不允许访问数据存储根目录以外的路径')
        }
        return targetAbs
    }

    resolvePath(relativePath) {
        return this._resolvePath(relativePath)
    }

    async _getLocalFiles(relativePath = '') {
        const fullPath = this._resolvePath(relativePath)
        try {
            const entries = await fs.readdir(fullPath, { withFileTypes: true })
            const files = []
            for (const entry of entries) {
                const relEntryPath = path.join(relativePath, entry.name).replace(/\\/g, '/')
                if (entry.isFile()) {
                    files.push(relEntryPath)
                } else if (entry.isDirectory()) {
                    const subFiles = await this._getLocalFiles(relEntryPath)
                    files.push(...subFiles)
                }
            }
            return files
        } catch (err) {
            if (err?.code === 'ENOENT') return []
            throw err
        }
    }

    async createDirectory(relativePath) {
        const fullPath = this._resolvePath(relativePath)
        await fs.mkdir(fullPath, { recursive: true })
        return true
    }

    async writeFile(relativePath, data) {
        const fullPath = this._resolvePath(relativePath)
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        this._markInternalMutation(relativePath)
        await fs.writeFile(fullPath, data)
        this._clearBlobCacheForRelativePath(relativePath)
        await this._updateContentIndexAfterWrite(relativePath)
        this._scheduleCloudAutoBackupAfterMutation()
        return true
    }

    _shouldRetryDeleteError(err) {
        const code = String(err?.code || '').toUpperCase()
        return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY'
    }

    async _runDeleteWithRetry(operation, options = {}) {
        const retries = Number.isInteger(options?.retries) ? options.retries : 4
        const delayMs = Number.isInteger(options?.delayMs) ? options.delayMs : 80

        for (let attempt = 0; ; attempt += 1) {
            try {
                return await operation()
            } catch (err) {
                if (!this._shouldRetryDeleteError(err) || attempt >= retries) {
                    throw err
                }
                await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
            }
        }
    }

    async readFile(relativePath, encoding = 'utf-8') {
        const fullPath = this._resolvePath(relativePath)
        return await fs.readFile(fullPath, encoding)
    }

    async deleteItem(relativePath) {
        const fullPath = this._resolvePath(relativePath)
        const stat = await fs.stat(fullPath)
        this._markInternalMutation(relativePath)
        if (stat.isDirectory()) {
            await this._runDeleteWithRetry(() => fs.rm(fullPath, { recursive: true, force: true }))
        } else {
            await this._runDeleteWithRetry(() => fs.unlink(fullPath))
        }
        this._clearBlobCacheForRelativePath(relativePath, { recursive: stat.isDirectory() })
        await this._updateContentIndexAfterDelete(relativePath, { isDirectory: stat.isDirectory() })
        this._scheduleCloudAutoBackupAfterMutation()
        return true
    }

    async _copyItemAbs(srcAbs, destAbs) {
        const stat = await fs.stat(srcAbs)
        if (stat.isDirectory()) {
            await fs.mkdir(destAbs, { recursive: true })
            const entries = await fs.readdir(srcAbs, { withFileTypes: true })
            for (const entry of entries) {
                const srcEntry = path.join(srcAbs, entry.name)
                const destEntry = path.join(destAbs, entry.name)
                if (entry.isDirectory()) {
                    await this._copyItemAbs(srcEntry, destEntry)
                } else if (entry.isFile()) {
                    await fs.mkdir(path.dirname(destEntry), { recursive: true })
                    await fs.copyFile(srcEntry, destEntry)
                }
            }
        } else {
            await fs.mkdir(path.dirname(destAbs), { recursive: true })
            await fs.copyFile(srcAbs, destAbs)
        }
    }

    async moveItem(fromRelativePath, toRelativePath, options = {}) {
        const fromRel = String(fromRelativePath || '')
        const toRel = String(toRelativePath || '')
        if (!fromRel || !toRel) {
            throw new Error('移动路径不能为空')
        }

        const fromAbs = this._resolvePath(fromRel)
        const toAbs = this._resolvePath(toRel)
        if (fromAbs === toAbs) return true
        const fromStat = await fs.stat(fromAbs)
        const recursiveCacheClear = fromStat.isDirectory()
        this._markInternalMutation(fromRel)
        this._markInternalMutation(toRel)

        const overwrite = !!options?.overwrite
        const toExists = await this.exists(toRel)
        if (toExists) {
            if (!overwrite) {
                throw new Error('目标路径已存在')
            }
            await this.deleteItem(toRel)
        }

        await fs.mkdir(path.dirname(toAbs), { recursive: true })

        try {
            await fs.rename(fromAbs, toAbs)
        } catch (err) {
            if (err?.code !== 'EXDEV') throw err
            await this._copyItemAbs(fromAbs, toAbs)
            await fs.rm(fromAbs, { recursive: true, force: true })
        }

        this._clearBlobCacheForRelativePath(fromRel, { recursive: recursiveCacheClear })
        this._clearBlobCacheForRelativePath(toRel, { recursive: recursiveCacheClear })
        await this._updateContentIndexAfterMove(fromRel, toRel, { isDirectory: recursiveCacheClear })
        this._scheduleCloudAutoBackupAfterMutation()
        return true
    }

    async renameItem(oldRelativePath, newRelativePath, options = {}) {
        return this.moveItem(oldRelativePath, newRelativePath, options)
    }

    async listDirectory(relativePath) {
        const fullPath = this._resolvePath(relativePath)
        const entries = await fs.readdir(fullPath, { withFileTypes: true })
        return entries.map((entry) => path.join(relativePath, entry.name).replace(/\\/g, '/'))
    }

    async exists(relativePath) {
        const fullPath = this._resolvePath(relativePath)
        try {
            await fs.access(fullPath)
            return true
        } catch {
            return false
        }
    }

    async stat(relativePath) {
        const fullPath = this._resolvePath(relativePath)
        return await fs.stat(fullPath)
    }

    async openInFileManager(relativePath = '') {
        const fullPath = this._resolvePath(relativePath)
        const statInfo = await fs.stat(fullPath)
        const targetDir = statInfo.isDirectory() ? fullPath : path.dirname(fullPath)

        if (electronShell?.openPath) {
            const err = await electronShell.openPath(targetDir)
            if (err) throw new Error(err)
            return true
        }

        await new Promise((resolve, reject) => {
            const command = process.platform === 'win32'
                ? 'explorer.exe'
                : process.platform === 'darwin'
                    ? 'open'
                    : 'xdg-open'
            execFile(command, [targetDir], (err) => {
                if (err) reject(err)
                else resolve()
            })
        })

        return true
    }

    _getS3Client() {
        const s3Config = globalConfig.getCloudConfig()
        const required = ['region', 'accessKeyId', 'secretAccessKey', 'bucket']
        const missing = required.filter((key) => !s3Config?.[key])
        if (missing.length) {
            throw new Error(`云端存储配置缺失: ${missing.join(', ')}`)
        }
        return new S3ClientWrapper(s3Config)
    }

    async _retryOperation(operation, maxRetries = 3, delay = 1000) {
        let lastError
        for (let i = 0; i < maxRetries; i += 1) {
            try {
                return await operation()
            } catch (err) {
                lastError = err
                if (i < maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, delay))
                }
            }
        }
        throw lastError
    }

    async _backupToCloudInternal(progressCallback) {
        const s3 = this._getS3Client()
        const bucket = globalConfig.getCloudConfig().bucket
        const localFiles = await this._getLocalFiles('')
        const total = localFiles.length
        let completed = 0

        for (const relPath of localFiles) {
            const fullPath = this._resolvePath(relPath)
            await this._retryOperation(() => s3.uploadFile(bucket, fullPath, relPath))
            completed += 1
            if (progressCallback) progressCallback(completed, total)
        }

        return { uploaded: total }
    }

    async backupToCloud(progressCallback) {
        return this._runManualCloudOperation(() => this._backupToCloudInternal(progressCallback))
    }

    async _restoreFromCloudInternal(progressCallback) {
        const s3 = this._getS3Client()
        const bucket = globalConfig.getCloudConfig().bucket
        const remoteFiles = (await this._retryOperation(() => s3.listObjects(bucket)))
            .filter((key) => String(key || '').trim() && !String(key).endsWith('/'))
        const total = remoteFiles.length
        let completed = 0
        const changedRoots = new Set()

        for (const key of remoteFiles) {
            const fullPath = this._resolvePath(key)
            await fs.mkdir(path.dirname(fullPath), { recursive: true })
            await this._retryOperation(() => s3.downloadFile(bucket, key, fullPath))
            completed += 1
            this._clearBlobCacheForRelativePath(key)
            const normalizedKey = this._normalizeRelativePath(key)
            const root = normalizedKey.split('/').filter(Boolean)[0]
            if (root) changedRoots.add(root)
            if (progressCallback) progressCallback(completed, total)
        }

        await contentIndex.markDirtyRoots([...changedRoots], 'cloud_restore')
        this._notifyRestoredRelativePathsChanged([...changedRoots])

        return { downloaded: total }
    }

    async restoreFromCloud(progressCallback) {
        return this._runManualCloudOperation(() => this._restoreFromCloudInternal(progressCallback))
    }

    async _syncToCloudInternal(progressCallback) {
        const s3 = this._getS3Client()
        const bucket = globalConfig.getCloudConfig().bucket
        const localFiles = await this._getLocalFiles('')
        const remoteFiles = await this._retryOperation(() => s3.listObjects(bucket))

        const localSet = new Set(localFiles)
        const toUpload = localFiles
        const toDelete = remoteFiles.filter((key) => !localSet.has(key))

        const totalOperations = toUpload.length + toDelete.length
        let completed = 0
        const updateProgress = () => {
            completed += 1
            if (progressCallback) progressCallback(completed, totalOperations)
        }

        for (const relPath of toUpload) {
            const fullPath = this._resolvePath(relPath)
            await this._retryOperation(() => s3.uploadFile(bucket, fullPath, relPath))
            updateProgress()
        }

        for (const key of toDelete) {
            await this._retryOperation(() => s3.deleteFile(bucket, key))
            updateProgress()
        }

        return {
            uploaded: toUpload.length,
            deleted: toDelete.length
        }
    }

    async syncToCloud(progressCallback) {
        return this._runManualCloudOperation(() => this._syncToCloudInternal(progressCallback))
    }

    async getFileBlobUrl(fileRelPath) {
        const key = String(fileRelPath || '').trim()
        if (!key) throw new Error('fileRelPath 不能为空')
        if (this._imageBlobCache.has(key)) {
            return this._imageBlobCache.get(key)
        }

        const fullPath = this._resolvePath(key)
        const data = await fs.readFile(fullPath)
        const blob = new Blob([data], { type: guessMimeByExt(path.extname(key)) })
        const blobUrl = URL.createObjectURL(blob)
        this._imageBlobCache.set(key, blobUrl)
        return blobUrl
    }

    getCachedFileBlobUrlSync(fileRelPath) {
        return this._imageBlobCache.get(fileRelPath) || null
    }

    clearImageBlobCache(imageRelPath) {
        if (imageRelPath) {
            this._revokeCachedBlobUrl(imageRelPath)
            return
        }

        for (const key of [...this._imageBlobCache.keys()]) {
            this._revokeCachedBlobUrl(key)
        }
    }
}

module.exports = new FileOperations()
