import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const S3ClientWrapper = require('../public/preload/utils/s3-operations.js')

function createClient() {
  return new S3ClientWrapper({
    region: 'test-region',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket',
    endpoint: 'https://s3.example.test'
  })
}

test('S3 XML key parser decodes escaped object keys', () => {
  const client = createClient()
  const keys = client._parseKeysFromXml(`
    <ListBucketResult>
      <Contents><Key>note/A&amp;B&lt;1&gt;&quot;x&quot;&apos;y&apos;&#x2F;&#X2F;&#47;.md</Key></Contents>
      <Contents><Key>plain.md</Key></Contents>
    </ListBucketResult>
  `)

  assert.deepEqual(keys, ['note/A&B<1>"x"\'y\'///.md', 'plain.md'])
})

test('S3 URL builder encodes SigV4 unsafe key characters', () => {
  const client = createClient()
  const url = client._buildUrl("session/历史会话/'initiated by' 'sdk', 'gps adid.json")

  assert.equal(
    new URL(url).pathname,
    "/test-bucket/session/%E5%8E%86%E5%8F%B2%E4%BC%9A%E8%AF%9D/%27initiated%20by%27%20%27sdk%27%2C%20%27gps%20adid.json"
  )
  assert.equal(url.includes("'"), false)
})

test('listObjects decodes continuation tokens from S3 XML', async () => {
  const client = createClient()
  const requestedUrls = []
  const pages = [
    '<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>first&amp;key.md</Key></Contents><NextContinuationToken>next&amp;token</NextContinuationToken></ListBucketResult>',
    '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>second.md</Key></Contents></ListBucketResult>'
  ]

  client.client = {
    fetch: async (url) => {
      requestedUrls.push(url)
      return new Response(pages.shift(), { status: 200 })
    }
  }

  const keys = await client.listObjects('test-bucket')
  const secondRequest = new URL(requestedUrls[1])

  assert.deepEqual(keys, ['first&key.md', 'second.md'])
  assert.equal(secondRequest.searchParams.get('continuation-token'), 'next&token')
})
