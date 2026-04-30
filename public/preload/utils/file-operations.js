const globalConfig = require('./global-config')
const S3ClientWrapper = require('./s3-operations')
const path = require('path')
const fs = require('fs').promises
const { execFile } = require('child_process')

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
        await fs.writeFile(fullPath, data)
        this._clearBlobCacheForRelativePath(relativePath)
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
        if (stat.isDirectory()) {
            await this._runDeleteWithRetry(() => fs.rm(fullPath, { recursive: true, force: true }))
        } else {
            await this._runDeleteWithRetry(() => fs.unlink(fullPath))
        }
        this._clearBlobCacheForRelativePath(relativePath, { recursive: stat.isDirectory() })
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

    async backupToCloud(progressCallback) {
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

    async restoreFromCloud(progressCallback) {
        const s3 = this._getS3Client()
        const bucket = globalConfig.getCloudConfig().bucket
        const remoteFiles = await this._retryOperation(() => s3.listObjects(bucket))
        const total = remoteFiles.length
        let completed = 0

        for (const key of remoteFiles) {
            const fullPath = this._resolvePath(key)
            await fs.mkdir(path.dirname(fullPath), { recursive: true })
            await this._retryOperation(() => s3.downloadFile(bucket, key, fullPath))
            completed += 1
            this._clearBlobCacheForRelativePath(key)
            if (progressCallback) progressCallback(completed, total)
        }

        return { downloaded: total }
    }

    async syncToCloud(progressCallback) {
        const s3 = this._getS3Client()
        const bucket = globalConfig.getCloudConfig().bucket
        const localFiles = await this._getLocalFiles('')
        const remoteFiles = await this._retryOperation(() => s3.listObjects(bucket))

        const localSet = new Set(localFiles)
        const remoteSet = new Set(remoteFiles)
        const toUpload = localFiles.filter((relPath) => !remoteSet.has(relPath))
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
