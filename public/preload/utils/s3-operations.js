const { AwsClient } = require('aws4fetch');
const fs = require('fs').promises;

class S3ClientWrapper {
    /**
     * @param {Object} config - 配置对象，与原来完全一致
     * @param {string} config.region - **必填**，区域（如 'cn-north-4'），签名需要
     * @param {string} config.accessKeyId - 访问密钥 ID
     * @param {string} config.secretAccessKey - 秘密访问密钥
     * @param {string} config.bucket - 默认存储桶名称
     * @param {string} [config.endpoint] - 自定义 endpoint（如 'https://obs.cn-north-4.myhuaweicloud.com'）
     *                                     若不传，则自动拼接为 https://s3.{region}.amazonaws.com（用于 AWS）
     * @param {boolean} [config.forcePathStyle] - 是否强制使用路径风格（大多数自定义存储需要 true，AWS 等云厂商通常 false）
     */
    constructor(config) {
        const {
            region,
            accessKeyId,
            secretAccessKey,
            bucket,
            endpoint,
            forcePathStyle = true, // 默认 true 以兼容多数自定义存储（如华为云、MinIO）
        } = config;

        // region 是必需的（签名需要），即使 endpoint 指定了也不能省略
        if (!region) throw new Error('region 是必填参数');

        this.bucket = bucket;
        this.region = region;
        this.forcePathStyle = forcePathStyle;

        // 处理 endpoint：若未提供，则按 AWS 标准格式拼接
        if (endpoint) {
            // 移除末尾可能的斜杠
            this.endpoint = endpoint.replace(/\/$/, '');
        } else {
            // AWS S3 标准 endpoint
            this.endpoint = `https://s3.${region}.amazonaws.com`;
        }

        // 初始化 aws4fetch 客户端
        this.client = new AwsClient({
            accessKeyId,
            secretAccessKey,
            region,
            service: 's3', // 固定为 s3
        });
    }

    /**
     * 构造请求 URL（根据 forcePathStyle 决定风格）
     * @param {string} key - 对象键
     * @param {string} [bucket] - 可指定桶名，默认使用 this.bucket
     * @returns {string} 完整 URL
     */
    _buildUrl(key, bucket = this.bucket) {
        // 将 key 按 '/' 分割，分别编码每个片段，再重新拼接
        const encodedKey = key.split('/').map(encodeURIComponent).join('/');
        if (this.forcePathStyle) {
            return `${this.endpoint}/${bucket}/${encodedKey}`;
        } else {
            const url = new URL(this.endpoint);
            url.host = `${bucket}.${url.host}`;
            url.pathname = `/${encodedKey}`;
            return url.toString();
        }
    }

    /**
     * 元数据转请求头（添加 x-amz-meta- 前缀）
     */
    _metadataToHeaders(metadata = {}) {
        const headers = {};
        for (const [key, value] of Object.entries(metadata)) {
            headers[`x-amz-meta-${key.toLowerCase()}`] = value;
        }
        return headers;
    }

    /**
     * 从响应头解析元数据
     */
    _headersToMetadata(headers) {
        const metadata = {};
        for (const [key, value] of headers.entries()) {
            if (key.toLowerCase().startsWith('x-amz-meta-')) {
                metadata[key.slice(11)] = value; // 去掉前缀
            }
        }
        return metadata;
    }

    /**
     * 上传文件（普通上传，适合小文件）
     * @param {string} bucketName - 存储桶名称（若传入，则覆盖默认桶）
     * @param {string} localFilePath - 本地文件路径（Node.js 环境）
     * @param {string} s3Key - S3 对象键
     * @param {Object} [options] - 选项，如 { metadata, contentType }
     * @returns {Promise<Object>} 上传结果（包含 ETag 等）
     */
    async uploadFile(bucketName, localFilePath, s3Key, options = {}) {
        // 读取整个文件到内存（适合小文件）
        const fileContent = await fs.readFile(localFilePath).catch(err => {
            throw new Error(`无法读取本地文件: ${err.message}`);
        });

        const url = this._buildUrl(s3Key, bucketName);
        const headers = {
            'Content-Type': options.contentType || 'application/octet-stream',
            'Content-Length': fileContent.length.toString(),
            ...this._metadataToHeaders(options.metadata),
        };

        const response = await this.client.fetch(url, {
            method: 'PUT',
            headers,
            body: fileContent,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`上传失败 (${response.status}): ${errorText}`);
        }

        // 返回类似 SDK 的结构
        return {
            ETag: response.headers.get('ETag'),
            $metadata: { httpStatusCode: response.status },
        };
    }

    /**
     * 删除文件
     * @param {string} bucketName - 存储桶名称
     * @param {string} s3Key - 对象键
     * @returns {Promise<Object>}
     */
    async deleteFile(bucketName, s3Key) {
        const url = this._buildUrl(s3Key, bucketName);
        const response = await this.client.fetch(url, { method: 'DELETE' });
        if (!response.ok && response.status !== 204) {
            throw new Error(`删除失败 (${response.status})`);
        }
        return { $metadata: { httpStatusCode: response.status } };
    }

    /**
     * 列出存储桶中的对象键（使用正则解析 XML，无需额外库）
     * @param {string} bucketName - 存储桶名称
     * @param {string} [prefix] - 前缀过滤
     * @returns {Promise<string[]>} 对象键数组
     */
    async listObjects(bucketName, prefix = '') {
        let isTruncated = true;
        let continuationToken = null;
        const allKeys = [];
        while (isTruncated) {
            const url = new URL(this._buildUrl('', bucketName));
            url.searchParams.set('list-type', '2');
            if (prefix) url.searchParams.set('prefix', prefix);
            if (continuationToken) url.searchParams.set('continuation-token', continuationToken);
            
            const response = await this.client.fetch(url.toString(), { method: 'GET' });
            if (!response.ok) throw new Error(`列出对象失败 (${response.status})`);
            const xml = await response.text();
            
            const keys = this._parseKeysFromXml(xml);
            allKeys.push(...keys);
            
            // 检查是否有更多数据
            isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
            const tokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
            continuationToken = tokenMatch ? tokenMatch[1] : null;
        }
        return allKeys;
    }

    /**
     * 从 S3 ListObjectsV2 返回的 XML 中提取所有 Key
     * @param {string} xml 
     * @returns {string[]}
     */
    _parseKeysFromXml(xml) {
        const keys = [];
        // 正则匹配 <Key> 标签内容（非贪婪匹配）
        const keyRegex = /<Key>(.*?)<\/Key>/gs;
        let match;
        while ((match = keyRegex.exec(xml)) !== null) {
            keys.push(match[1]);
        }
        return keys;
    }

    /**
     * 获取对象元数据
     * @param {string} bucketName - 存储桶名称
     * @param {string} s3Key - 对象键
     * @returns {Promise<Object|null>} 元数据对象，若不存在返回 null
     */
    async headObject(bucketName, s3Key) {
        const url = this._buildUrl(s3Key, bucketName);
        const response = await this.client.fetch(url, { method: 'HEAD' });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`获取元数据失败 (${response.status})`);

        return {
            size: parseInt(response.headers.get('Content-Length') || '0'),
            lastModified: new Date(response.headers.get('Last-Modified')),
            etag: response.headers.get('ETag'),
            metadata: this._headersToMetadata(response.headers),
        };
    }

    /**
     * 下载文件到本地
     * @param {string} bucketName 存储桶
     * @param {string} s3Key 对象键
     * @param {string} localFilePath 本地文件路径
     * @returns {Promise<Object>}
     */
    async downloadFile(bucketName, s3Key, localFilePath) {
        const url = this._buildUrl(s3Key, bucketName);
        const response = await this.client.fetch(url, { method: 'GET' });
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`对象不存在: ${s3Key}`);
            }
            throw new Error(`下载失败 (${response.status}): ${await response.text()}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        await fs.writeFile(localFilePath, Buffer.from(arrayBuffer));
        return { $metadata: { httpStatusCode: response.status } };
    }
}

module.exports = S3ClientWrapper;