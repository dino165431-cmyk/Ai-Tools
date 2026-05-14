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
const EXTERNAL_WATCH_RESCAN_DEBOUNCE_MS = 250
const EXTERNAL_WATCH_POLL_INTERVAL_MS = 2000
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

function getTimestampMs(value) {
    if (value instanceof Date) {
        const timestamp = value.getTime()
        return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? value : 0
    }

    if (!value || typeof value !== 'object') return 0

    const directMs = Number(value.mtimeMs ?? value.lastModifiedMs ?? value.timestampMs)
    if (Number.isFinite(directMs) && directMs > 0) return directMs

    if (value.mtime) {
        const mtime = new Date(value.mtime).getTime()
        if (Number.isFinite(mtime) && mtime > 0) return mtime
    }

    if (value.lastModified) {
        const lastModified = new Date(value.lastModified).getTime()
        if (Number.isFinite(lastModified) && lastModified > 0) return lastModified
    }

    return 0
}

class FileOperations {
    constructor() {
        if (FileOperations.instance) {
            return FileOperations.instance
        }
        FileOperations.instance = this
        this._disposed = false
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
        this._cloudAutoDecisionTimer = null
        this._externalWatchers = new Map()
        this._externalWatchDebounceTimers = new Map()
        this._externalWatchResyncTimers = new Map()
        this._internalMutationSuppressUntil = new Map()
        this._lastWatcherRootSignature = ''
        this._globalConfigChangedListener = null
        this._recursiveExternalWatchSupported = null
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
        const changed = this._normalizeRelativePath(changedRelPath) || root
        if (!root) return
        if (this._isPathSuppressedByInternalMutation(changed || root)) return

        const existingTimer = this._externalWatchDebounceTimers.get(root)
        if (existingTimer) clearTimeout(existingTimer)

        const timer = setTimeout(async () => {
            this._externalWatchDebounceTimers.delete(root)
            try {
                await contentIndex.markDirtyByPath(root, 'external_watch')
            } catch (err) {
                console.warn?.('[Content index] external watch dirty mark failed:', err)
            }

            const eventDetail = { path: changed, rootPath: root, paths: [changed] }
            this._dispatchWindowEvent('storageFilesChanged', eventDetail)
            if (root === 'note') {
                this._dispatchWindowEvent('noteFilesChanged', eventDetail)
            } else if (root === 'session') {
                this._dispatchWindowEvent('sessionFilesChanged', eventDetail)
            }
        }, EXTERNAL_WATCH_DEBOUNCE_MS)

        this._externalWatchDebounceTimers.set(root, timer)
    }

    _queueExternalWatcherResync(rootRelPath) {
        const root = this._normalizeRelativePath(rootRelPath)
        if (!root) return

        const existingTimer = this._externalWatchResyncTimers.get(root)
        if (existingTimer) clearTimeout(existingTimer)

        const timer = setTimeout(() => {
            this._externalWatchResyncTimers.delete(root)
            try {
                this._restartExternalWatcherForRoot(root)
            } catch (err) {
                console.warn?.(`[External watch] resync failed for ${root}:`, err)
            }
        }, EXTERNAL_WATCH_RESCAN_DEBOUNCE_MS)

        this._externalWatchResyncTimers.set(root, timer)
    }

    _createExternalWatcherEntry(rootRel, absPath) {
        return {
            rootRel,
            absPath,
            mode: 'unknown',
            watcher: null,
            childWatchers: new Map(),
            pollTimer: null,
            snapshot: new Map()
        }
    }

    _closeWatcherEntry(entry) {
        if (!entry) return
        try {
            entry.watcher?.close?.()
        } catch {
            // ignore close failures
        }
        entry.watcher = null

        for (const watcher of entry.childWatchers?.values?.() || []) {
            try {
                watcher?.close?.()
            } catch {
                // ignore close failures
            }
        }
        entry.childWatchers?.clear?.()

        if (entry.pollTimer) {
            clearInterval(entry.pollTimer)
            entry.pollTimer = null
        }

        entry.snapshot = new Map()
    }

    _closeExternalWatchers() {
        for (const entry of this._externalWatchers.values()) {
            this._closeWatcherEntry(entry)
        }
        this._externalWatchers.clear()
        for (const timer of this._externalWatchResyncTimers.values()) {
            clearTimeout(timer)
        }
        this._externalWatchResyncTimers.clear()
    }

    _handleExternalWatchEvent(entry, filename = '') {
        const rootRel = this._normalizeRelativePath(entry?.rootRel)
        if (!rootRel) return

        const rawName = typeof filename === 'string' ? filename : ''
        const normalizedRel = rawName
            ? `${rootRel}/${String(rawName).replace(/\\/g, '/')}`.replace(/\/+/g, '/')
            : rootRel
        const relevant = rootRel === 'note'
            ? contentIndex._internal.isRelevantWatchedPath('note', normalizedRel)
            : contentIndex._internal.isRelevantWatchedPath('session', normalizedRel)
        if (!relevant && normalizedRel !== rootRel) return
        this._queueExternalTreeRefresh(rootRel, normalizedRel)
    }

    _shouldRetryExternalWatchWithoutRecursive(err) {
        const code = String(err?.code || '').toUpperCase()
        const message = String(err?.message || '')
        return code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'
            || code === 'ERR_INVALID_OPT_VALUE'
            || code === 'ERR_INVALID_ARG_VALUE'
            || /recursive/i.test(message)
    }

    _detectRecursiveExternalWatchSupport() {
        if (typeof this._recursiveExternalWatchSupported === 'boolean') {
            return this._recursiveExternalWatchSupported
        }
        return true
    }

    _watchDirectory(entry, dirAbs, relativeFromRoot = '') {
        const normalizedDirRel = this._normalizeRelativePath(relativeFromRoot)
        const watcher = fsSync.watch(dirAbs, (_eventType, filename) => {
            const childName = typeof filename === 'string' ? String(filename) : ''
            const relative = normalizedDirRel && childName
                ? `${normalizedDirRel}/${childName}`
                : normalizedDirRel || childName
            this._handleExternalWatchEvent(entry, relative)
            this._queueExternalWatcherResync(entry.rootRel)
        })
        entry.childWatchers.set(dirAbs, watcher)
        return watcher
    }

    _listWatchableDirectories(rootRel, rootAbs) {
        const queue = [{ abs: rootAbs, rel: '' }]
        const dirs = []

        while (queue.length) {
            const current = queue.shift()
            dirs.push(current)

            let entries = []
            try {
                entries = fsSync.readdirSync(current.abs, { withFileTypes: true })
            } catch (err) {
                if (err?.code === 'ENOENT') continue
                throw err
            }

            for (const entry of entries) {
                if (!entry?.isDirectory?.()) continue
                const childRel = current.rel ? `${current.rel}/${entry.name}` : entry.name
                const normalizedRel = `${rootRel}/${childRel}`.replace(/\/+/g, '/')
                const relevant = rootRel === 'note'
                    ? contentIndex._internal.isRelevantWatchedPath('note', normalizedRel)
                    : contentIndex._internal.isRelevantWatchedPath('session', normalizedRel)
                if (!relevant) continue
                queue.push({
                    abs: path.join(current.abs, entry.name),
                    rel: childRel
                })
            }
        }

        return dirs
    }

    _captureExternalWatchSnapshot(rootRel, rootAbs) {
        const entriesMap = new Map()
        const queue = [{ abs: rootAbs, rel: '' }]

        while (queue.length) {
            const current = queue.shift()
            let entries = []
            try {
                entries = fsSync.readdirSync(current.abs, { withFileTypes: true })
            } catch (err) {
                if (err?.code === 'ENOENT') continue
                throw err
            }

            for (const entry of entries) {
                const childRel = current.rel ? `${current.rel}/${entry.name}` : entry.name
                const normalizedRel = `${rootRel}/${childRel}`.replace(/\/+/g, '/')
                const relevant = rootRel === 'note'
                    ? contentIndex._internal.isRelevantWatchedPath('note', normalizedRel)
                    : contentIndex._internal.isRelevantWatchedPath('session', normalizedRel)
                if (!relevant) continue

                if (entry.isDirectory()) {
                    entriesMap.set(normalizedRel, 'dir')
                    queue.push({
                        abs: path.join(current.abs, entry.name),
                        rel: childRel
                    })
                    continue
                }

                if (entry.isFile()) {
                    let statInfo = null
                    try {
                        statInfo = fsSync.statSync(path.join(current.abs, entry.name))
                    } catch (err) {
                        if (err?.code === 'ENOENT') continue
                        throw err
                    }
                    entriesMap.set(normalizedRel, `file:${Number(statInfo?.mtimeMs || 0)}:${Number(statInfo?.size || 0)}`)
                }
            }
        }

        return entriesMap
    }

    _armRecursiveExternalWatcher(entry) {
        const watcher = fsSync.watch(entry.absPath, { recursive: true }, (_eventType, filename) => {
            this._handleExternalWatchEvent(entry, filename)
        })
        entry.mode = 'native-recursive'
        entry.watcher = watcher
        return true
    }

    _armDirectoryTreeExternalWatcher(entry) {
        const directories = this._listWatchableDirectories(entry.rootRel, entry.absPath)
        for (const directory of directories) {
            this._watchDirectory(entry, directory.abs, directory.rel)
        }
        entry.mode = 'directory-tree'
        return true
    }

    _armPollingExternalWatcher(entry) {
        entry.snapshot = this._captureExternalWatchSnapshot(entry.rootRel, entry.absPath)
        entry.pollTimer = setInterval(() => {
            try {
                const nextSnapshot = this._captureExternalWatchSnapshot(entry.rootRel, entry.absPath)
                const previousSnapshot = entry.snapshot || new Map()
                let changed = false

                for (const [filePath, signature] of nextSnapshot.entries()) {
                    if (!previousSnapshot.has(filePath) || previousSnapshot.get(filePath) !== signature) {
                        changed = true
                        break
                    }
                }

                if (!changed) {
                    for (const filePath of previousSnapshot.keys()) {
                        if (!nextSnapshot.has(filePath)) {
                            changed = true
                            break
                        }
                    }
                }

                entry.snapshot = nextSnapshot
                if (changed) {
                    this._queueExternalTreeRefresh(entry.rootRel, entry.rootRel)
                }
            } catch (err) {
                if (err?.code === 'ENOENT') {
                    entry.snapshot = new Map()
                    this._queueExternalTreeRefresh(entry.rootRel, entry.rootRel)
                    return
                }
                console.warn?.(`[External watch] polling failed for ${entry.rootRel}:`, err)
            }
        }, EXTERNAL_WATCH_POLL_INTERVAL_MS)
        entry.mode = 'polling'
        return true
    }

    _startExternalWatcherForRoot(rootRel, absPath) {
        const entry = this._createExternalWatcherEntry(rootRel, absPath)
        this._externalWatchers.set(rootRel, entry)

        try {
            if (this._detectRecursiveExternalWatchSupport()) {
                try {
                    this._armRecursiveExternalWatcher(entry)
                    this._recursiveExternalWatchSupported = true
                    return
                } catch (err) {
                    if (this._shouldRetryExternalWatchWithoutRecursive(err)) {
                        this._recursiveExternalWatchSupported = false
                        console.warn?.(`[External watch] recursive mode unavailable for ${rootRel}, falling back:`, err)
                    } else {
                        throw err
                    }
                }
            }

            try {
                this._armDirectoryTreeExternalWatcher(entry)
                return
            } catch (err) {
                console.warn?.(`[External watch] directory-tree mode failed for ${rootRel}, falling back to polling:`, err)
                this._closeWatcherEntry(entry)
            }

            this._armPollingExternalWatcher(entry)
        } catch (err) {
            this._closeWatcherEntry(entry)
            this._externalWatchers.delete(rootRel)
            throw err
        }
    }

    _restartExternalWatcherForRoot(rootRel) {
        const existing = this._externalWatchers.get(rootRel)
        if (!existing) return
        const absPath = existing.absPath
        this._closeWatcherEntry(existing)
        this._startExternalWatcherForRoot(rootRel, absPath)
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
                this._startExternalWatcherForRoot(rootRel, absPath)
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
            try {
                await contentIndex.markDirtyByPath(relativePath, 'write_failed')
            } catch (markErr) {
                console.warn?.('[Content index] dirty mark failed after write sync failure:', markErr)
            }
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
        this._disposed = false
        this._cloudAutomationInitialized = true

        this._handleCloudAutomationConfigChange(this._getCloudConfigSafe())
        this._ensureExternalWatchers()

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            this._globalConfigChangedListener = (event) => {
                this._handleCloudAutomationConfigChange(event?.detail?.cloudConfig)
                this._ensureExternalWatchers()
            }
            window.addEventListener('globalConfigChanged', this._globalConfigChangedListener)
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
        return config?.autoBackupEnabled === true && this._hasRequiredCloudConfig(config) && this._hasDataStorageRoot()
    }

    _isCloudAutoRestoreReady(config = this._getCloudConfigSafe()) {
        return config?.autoRestoreEnabled === true && this._hasRequiredCloudConfig(config) && this._hasDataStorageRoot()
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

    _clearCloudAutoDecisionTimer() {
        if (!this._cloudAutoDecisionTimer) return
        clearTimeout(this._cloudAutoDecisionTimer)
        this._cloudAutoDecisionTimer = null
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
        if (!backupReady || !restoreReady) {
            this._clearCloudAutoDecisionTimer()
        }

        if (shouldRunInitialRestore || shouldRunInitialBackup) {
            if (backupReady && restoreReady) {
                this._clearCloudAutoDecisionTimer()
                this._clearCloudAutoBackupTimer()
                this._clearCloudAutoRestoreTimer()
                this._scheduleCloudAutoDecision()
                return
            }

            if (shouldRunInitialRestore) this._scheduleCloudAutoRestore()
            if (shouldRunInitialBackup) this._scheduleCloudAutoBackup()
        }
    }

    _scheduleCloudAutoBackup() {
        if (this._disposed) return
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
        if (this._disposed) return
        if (!this._cloudAutomationInitialized || !this._isCloudAutoRestoreReady()) return

        this._clearCloudAutoRestoreTimer()
        this._cloudAutoRestoreTimer = setTimeout(() => {
            this._cloudAutoRestoreTimer = null
            void this._runCloudAutoRestore()
        }, CLOUD_AUTO_RESTORE_DEBOUNCE_MS)
    }

    _scheduleCloudAutoDecision() {
        if (this._disposed) return
        if (!this._cloudAutomationInitialized || !this._isCloudAutoBackupReady() || !this._isCloudAutoRestoreReady()) return

        this._clearCloudAutoDecisionTimer()
        this._cloudAutoDecisionTimer = setTimeout(() => {
            this._cloudAutoDecisionTimer = null
            void this._runCloudAutoDecision()
        }, CLOUD_AUTO_RESTORE_DEBOUNCE_MS)
    }

    _scheduleCloudAutoBackupAfterMutation() {
        this._clearCloudAutoDecisionTimer()
        this._clearCloudAutoRestoreTimer()
        this._cloudAutoRestorePending = false
        this._scheduleCloudAutoBackup()
    }

    _isCloudAutoOperationRunning() {
        return this._cloudOperationRunning || this._cloudAutoBackupRunning || this._cloudAutoRestoreRunning
    }

    _schedulePendingCloudAutoOperation() {
        if (this._disposed) return
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
        if (this._disposed) return
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
        if (this._disposed) return
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

    _hasDataStorageRoot() {
        try {
            return !!String(globalConfig.getDataStorageRoot?.() || '').trim()
        } catch {
            return false
        }
    }

    async _getLatestLocalTimestamp() {
        let localFiles = []
        try {
            localFiles = await this._getLocalFiles('')
        } catch (err) {
            console.warn?.('[Cloud auto decision] local file scan failed:', err)
            return { timestamp: 0, path: '', total: 0 }
        }

        let latestTimestamp = 0
        let latestPath = ''
        for (const relPath of localFiles) {
            const fullPath = this._resolvePath(relPath)
            let statInfo = null
            try {
                statInfo = await fs.stat(fullPath)
            } catch (err) {
                if (err?.code === 'ENOENT') continue
                continue
            }

            const timestamp = getTimestampMs(statInfo)
            if (timestamp > latestTimestamp) {
                latestTimestamp = timestamp
                latestPath = relPath
            }
        }

        return {
            timestamp: latestTimestamp,
            path: latestPath,
            total: localFiles.length
        }
    }

    async _getLatestCloudTimestamp() {
        let s3 = null
        let bucket = ''
        try {
            s3 = this._getS3Client()
            bucket = globalConfig.getCloudConfig().bucket
        } catch (err) {
            console.warn?.('[Cloud auto decision] cloud client init failed:', err)
            return { timestamp: 0, path: '', total: 0 }
        }

        let remoteFiles = []
        try {
            remoteFiles = (await this._retryOperation(() => s3.listObjects(bucket)))
                .filter((key) => String(key || '').trim() && !String(key).endsWith('/'))
        } catch (err) {
            console.warn?.('[Cloud auto decision] remote file scan failed:', err)
            return { timestamp: 0, path: '', total: 0 }
        }

        let latestTimestamp = 0
        let latestPath = ''
        for (const key of remoteFiles) {
            let meta = null
            try {
                meta = await this._retryOperation(() => s3.headObject(bucket, key))
            } catch (err) {
                continue
            }

            const timestamp = getTimestampMs(meta)
            if (timestamp > latestTimestamp) {
                latestTimestamp = timestamp
                latestPath = key
            }
        }

        return {
            timestamp: latestTimestamp,
            path: latestPath,
            total: remoteFiles.length
        }
    }

    async _resolveCloudAutoDecision() {
        const [localInfo, cloudInfo] = await Promise.all([
            this._getLatestLocalTimestamp(),
            this._getLatestCloudTimestamp()
        ])

        if (!localInfo.total && !cloudInfo.total) return null
        if (!localInfo.total) return 'restore'
        if (!cloudInfo.total) return 'backup'
        if (cloudInfo.timestamp > localInfo.timestamp) return 'restore'
        return 'backup'
    }

    async _runCloudAutoDecision() {
        if (this._disposed) return
        if (!this._isCloudAutoBackupReady() || !this._isCloudAutoRestoreReady()) return

        let direction = null
        try {
            direction = await this._resolveCloudAutoDecision()
        } catch (err) {
            console.warn?.('[Cloud auto decision] failed, falling back to backup:', err)
            direction = 'backup'
        }

        if (direction === 'restore') {
            await this._runCloudAutoRestore()
            return
        }

        if (direction === 'backup') {
            await this._runCloudAutoBackup()
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
        this._markInternalMutation(relativePath)
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

    dispose() {
        this._disposed = true
        this._cloudAutomationInitialized = false
        this._cloudAutoBackupReady = false
        this._cloudAutoBackupSignature = ''
        this._cloudAutoBackupPending = false
        this._cloudAutoRestoreReady = false
        this._cloudAutoRestoreSignature = ''
        this._cloudAutoRestorePending = false
        this._cloudOperationRunning = false
        this._cloudAutoBackupRunning = false
        this._cloudAutoRestoreRunning = false
        this._clearCloudAutoBackupTimer()
        this._clearCloudAutoRestoreTimer()
        this._clearCloudAutoDecisionTimer()
        this._closeExternalWatchers()
        for (const timer of this._externalWatchDebounceTimers.values()) {
            clearTimeout(timer)
        }
        this._externalWatchDebounceTimers.clear()
        this._internalMutationSuppressUntil.clear()
        this._lastWatcherRootSignature = ''
        if (this._globalConfigChangedListener && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            try {
                window.removeEventListener('globalConfigChanged', this._globalConfigChangedListener)
            } catch {
                // ignore
            }
        }
        this._globalConfigChangedListener = null
        this.clearImageBlobCache()
    }
}

module.exports = new FileOperations()
