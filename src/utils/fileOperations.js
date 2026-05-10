function getFileOperationsApi() {
    return globalThis?.aiToolsApi?.files;
}

export function hasFileOperationsApi() {
    return !!getFileOperationsApi();
}

export function describeFileOperationsError(err, featureLabel = '当前功能') {
    const raw = err?.message || String(err || '');
    const label = String(featureLabel || '当前功能').trim() || '当前功能';

    if (raw.includes('未注入')) {
        return `${label}依赖 uTools preload 注入的 aiToolsApi.files。当前环境未注入，请在 uTools 插件环境中运行。`;
    }

    if (raw.includes('数据存储根目录未配置')) {
        return `${label}依赖数据存储根目录。请先到“设置 / 配置”里配置数据存储根目录。`;
    }

    if (raw.includes('数据存储根目录必须为绝对路径')) {
        return '数据存储根目录必须为绝对路径，请到“设置 / 配置”里修正。';
    }

    if (raw.includes('数据存储根目录包含非法字符')) {
        return '数据存储根目录包含非法字符，请到“设置 / 配置”里重新选择目录。';
    }

    if (
        raw.includes('Access is denied') ||
        raw.includes('EACCES') ||
        raw.includes('EPERM') ||
        raw.includes('operation not permitted')
    ) {
        return `${label}访问目录失败。当前数据存储根目录可能指向了无权限访问的位置，请到“设置 / 配置”里改成当前账号可读写的本地目录。`;
    }

    return raw;
}

function rejectNotInjected(methodName) {
    return Promise.reject(
        new Error(`aiToolsApi.files.${methodName} 未注入（请在 uTools 插件环境中运行）`)
    );
}

function callFileOpsAsync(methodName, ...args) {
    const api = getFileOperationsApi();
    const fn = api?.[methodName];
    if (typeof fn !== 'function') return rejectNotInjected(methodName);

    try {
        const result = fn.apply(api, args);
        if (result && typeof result.then === 'function') return result;
        return Promise.resolve(result);
    } catch (err) {
        return Promise.reject(err);
    }
}

export function createDirectory(relativePath) {
    return callFileOpsAsync('createDirectory', relativePath);
}

export function writeFile(relativePath, data) {
    return callFileOpsAsync('writeFile', relativePath, data);
}

export function readFile(relativePath, encoding) {
    return callFileOpsAsync('readFile', relativePath, encoding);
}

export function deleteItem(relativePath) {
    return callFileOpsAsync('deleteItem', relativePath);
}

export function listDirectory(relativePath) {
    return callFileOpsAsync('listDirectory', relativePath);
}

export function exists(relativePath) {
    return callFileOpsAsync('exists', relativePath);
}

export function stat(relativePath) {
    return callFileOpsAsync('stat', relativePath);
}

export function openInFileManager(relativePath) {
    return callFileOpsAsync('openInFileManager', relativePath);
}

export function resolvePath(relativePath) {
    return callFileOpsAsync('resolvePath', relativePath);
}

export function moveItem(fromRelativePath, toRelativePath, options) {
    return callFileOpsAsync('moveItem', fromRelativePath, toRelativePath, options);
}

export function renameItem(oldRelativePath, newRelativePath, options) {
    return callFileOpsAsync('renameItem', oldRelativePath, newRelativePath, options);
}

export function backupToCloud(progressCallback) {
    return callFileOpsAsync('backupToCloud', progressCallback);
}

export function restoreFromCloud(progressCallback) {
    return callFileOpsAsync('restoreFromCloud', progressCallback);
}

export function syncToCloud(progressCallback) {
    return callFileOpsAsync('syncToCloud', progressCallback);
}

export function getFileBlobUrl(fileRelPath) {
    return callFileOpsAsync('getFileBlobUrl', fileRelPath);
}

export function getCachedFileBlobUrlSync(fileRelPath) {
    const api = getFileOperationsApi();
    try {
        return api?.getCachedFileBlobUrlSync?.(fileRelPath) ?? null;
    } catch (err) {
        console.warn('getCachedFileBlobUrlSync failed:', err);
        return null;
    }
}

export function clearImageBlobCache(imageRelPath) {
    const api = getFileOperationsApi();
    try {
        return api?.clearImageBlobCache?.(imageRelPath);
    } catch (err) {
        console.warn('clearImageBlobCache failed:', err);
        return undefined;
    }
}
