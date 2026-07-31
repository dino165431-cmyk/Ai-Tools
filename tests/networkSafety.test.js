import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  assertPublicLookupResults,
  assertPublicNetworkHost,
  assertPublicNetworkUrl,
  createPublicNetworkLookup,
  isBlockedNetworkAddress,
  isBlockedNetworkHostname,
  resolvePublicNetworkHost
} = require('../public/preload/utils/network-safety.js')

test('network safety rejects local, private, reserved, and encoded loopback targets', () => {
  const blockedHosts = [
    'localhost',
    'service.internal',
    'printer.local',
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '192.168.1.2',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '::1',
    '::127.0.0.1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1'
  ]

  for (const hostname of blockedHosts) {
    assert.equal(isBlockedNetworkHostname(hostname), true, hostname)
  }
  assert.throws(() => assertPublicNetworkUrl('http://2130706433/admin'), {
    code: 'ERR_UNSAFE_NETWORK_TARGET'
  })
  assert.throws(() => assertPublicNetworkUrl('http://0x7f000001/admin'), {
    code: 'ERR_UNSAFE_NETWORK_TARGET'
  })
  assert.throws(() => assertPublicNetworkUrl('https://user:secret@example.com/'))
  assert.throws(() => assertPublicNetworkUrl('file:///etc/passwd'))
})

test('network safety accepts public HTTP(S) hosts and addresses', () => {
  assert.equal(isBlockedNetworkHostname('example.com'), false)
  assert.equal(isBlockedNetworkAddress('8.8.8.8'), false)
  assert.equal(isBlockedNetworkAddress('2606:4700:4700::1111'), false)
  assert.equal(assertPublicNetworkUrl('https://example.com/path').hostname, 'example.com')
})

test('network safety rejects a hostname when any DNS answer is non-public', async () => {
  await assert.rejects(
    assertPublicNetworkHost('example.com', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 }
    ]),
    { code: 'ERR_UNSAFE_NETWORK_TARGET' }
  )

  await assert.doesNotReject(
    assertPublicNetworkHost('example.com', async () => [
      { address: '93.184.216.34', family: 4 }
    ])
  )
  assert.deepEqual(
    await resolvePublicNetworkHost('example.com', async () => [
      { address: '93.184.216.34', family: 4 }
    ]),
    [{ address: '93.184.216.34', family: 4 }]
  )
  assert.throws(
    () => assertPublicLookupResults([{ address: '169.254.169.254', family: 4 }], undefined, 'metadata.test'),
    { code: 'ERR_UNSAFE_NETWORK_TARGET' }
  )
})

test('public lookup wrapper blocks DNS rebinding to a private address', async () => {
  const lookup = createPublicNetworkLookup((_hostname, _options, callback) => {
    callback(null, [{ address: '127.0.0.1', family: 4 }])
  })

  const error = await new Promise((resolve) => {
    lookup('example.com', { all: true }, (lookupError) => resolve(lookupError))
  })
  assert.equal(error?.code, 'ERR_UNSAFE_NETWORK_TARGET')
})
