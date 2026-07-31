const dns = require('dns')
const net = require('net')
const { URL } = require('url')

const PUBLIC_WEB_PROTOCOLS = new Set(['http:', 'https:'])
const BLOCKED_HOSTNAME_SUFFIXES = Object.freeze([
  '.localhost',
  '.local',
  '.localdomain',
  '.lan',
  '.home',
  '.test',
  '.example',
  '.invalid',
  '.internal',
  '.home.arpa'
])

function cleanHostname(value) {
  return String(value || '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()
}

function isBlockedIpv4Address(address) {
  const parts = String(address || '').split('.').map((item) => Number(item))
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    return true
  }

  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && (b === 0 || b === 2)) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51) return true
  if (a === 203 && b === 0) {
    const c = parts[2]
    if (c === 113) return true
  }
  return false
}

function expandIpv6Address(address) {
  let source = cleanHostname(address)
  const zoneIndex = source.indexOf('%')
  if (zoneIndex >= 0) source = source.slice(0, zoneIndex)

  const mappedIpv4Match = source.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mappedIpv4Match) {
    const ipv4 = mappedIpv4Match[2].split('.').map((item) => Number(item))
    if (ipv4.length !== 4 || ipv4.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
      return null
    }
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16)
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16)
    source = `${mappedIpv4Match[1]}${high}:${low}`
  }

  const halves = source.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  if (halves.length === 1 && left.length !== 8) return null
  if (left.length + right.length > 8) return null

  const fillCount = halves.length === 2 ? 8 - left.length - right.length : 0
  const parts = [
    ...left,
    ...Array.from({ length: fillCount }, () => '0'),
    ...right
  ]
  if (parts.length !== 8 || parts.some((item) => !/^[0-9a-f]{1,4}$/i.test(item))) return null
  return parts.map((item) => Number.parseInt(item, 16))
}

function isBlockedIpv6Address(address) {
  const parts = expandIpv6Address(address)
  if (!parts) return true

  if (parts.every((item) => item === 0)) return true
  if (parts.slice(0, 7).every((item) => item === 0) && parts[7] === 1) return true

  const first = parts[0]
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80) return true
  if ((first & 0xffc0) === 0xfec0) return true
  if ((first & 0xff00) === 0xff00) return true
  if (first === 0x2001 && parts[1] === 0x0db8) return true
  if (
    (first === 0x0064 && parts[1] === 0xff9b && parts[2] === 0) ||
    (first === 0x0064 && parts[1] === 0xff9b && parts[2] === 1)
  ) return true

  const hasIpv4Payload =
    parts.slice(0, 5).every((item) => item === 0) &&
    (parts[5] === 0 || parts[5] === 0xffff)
  if (hasIpv4Payload) {
    const ipv4 = [
      parts[6] >> 8,
      parts[6] & 0xff,
      parts[7] >> 8,
      parts[7] & 0xff
    ].join('.')
    return isBlockedIpv4Address(ipv4)
  }

  return false
}

function isBlockedNetworkAddress(address) {
  const normalized = cleanHostname(address)
  const family = net.isIP(normalized)
  if (family === 4) return isBlockedIpv4Address(normalized)
  if (family === 6) return isBlockedIpv6Address(normalized)
  return true
}

function isBlockedNetworkHostname(hostname) {
  const normalized = cleanHostname(hostname)
  if (!normalized) return true
  if (net.isIP(normalized)) return isBlockedNetworkAddress(normalized)
  if (normalized === 'localhost') return true
  if (!normalized.includes('.')) return true
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

function createUnsafeNetworkTargetError(target) {
  const error = new Error(`不允许访问本机、私网或保留网络地址：${String(target || '').trim() || 'unknown'}`)
  error.code = 'ERR_UNSAFE_NETWORK_TARGET'
  return error
}

function assertPublicNetworkUrl(rawUrl, baseUrl) {
  let parsed
  try {
    parsed = baseUrl ? new URL(String(rawUrl || ''), baseUrl) : new URL(String(rawUrl || ''))
  } catch {
    throw new Error('URL 不合法')
  }

  if (!PUBLIC_WEB_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`仅支持 http/https：${parsed.protocol || 'unknown'}`)
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL 不允许包含用户名或密码')
  }
  if (isBlockedNetworkHostname(parsed.hostname)) {
    throw createUnsafeNetworkTargetError(parsed.hostname)
  }
  return parsed
}

function normalizeLookupResults(address, family) {
  if (Array.isArray(address)) {
    return address.map((item) => ({
      address: String(item?.address || ''),
      family: Number(item?.family) || net.isIP(String(item?.address || ''))
    }))
  }
  return [{
    address: String(address || ''),
    family: Number(family) || net.isIP(String(address || ''))
  }]
}

function assertPublicLookupResults(address, family, hostname) {
  const results = normalizeLookupResults(address, family)
  if (!results.length || results.some((item) => !item.address || isBlockedNetworkAddress(item.address))) {
    throw createUnsafeNetworkTargetError(hostname)
  }
  return results
}

function createPublicNetworkLookup(baseLookup = dns.lookup) {
  return (hostname, options, callback) => {
    const lookupCallback = typeof options === 'function' ? options : callback
    const lookupOptions = typeof options === 'function' ? undefined : options
    if (typeof lookupCallback !== 'function') {
      throw new TypeError('lookup callback is required')
    }

    const onLookup = (error, address, family) => {
      if (error) {
        lookupCallback(error)
        return
      }
      try {
        assertPublicLookupResults(address, family, hostname)
        lookupCallback(null, address, family)
      } catch (unsafeError) {
        lookupCallback(unsafeError)
      }
    }

    if (lookupOptions === undefined) baseLookup(hostname, onLookup)
    else baseLookup(hostname, lookupOptions, onLookup)
  }
}

async function resolvePublicNetworkHost(hostname, lookup = dns.promises.lookup) {
  const normalized = cleanHostname(hostname)
  if (isBlockedNetworkHostname(normalized)) {
    throw createUnsafeNetworkTargetError(normalized)
  }
  const literalFamily = net.isIP(normalized)
  if (literalFamily) {
    return [{ address: normalized, family: literalFamily }]
  }

  const results = await lookup(normalized, { all: true, verbatim: true })
  return assertPublicLookupResults(results, undefined, normalized)
}

async function assertPublicNetworkHost(hostname, lookup = dns.promises.lookup) {
  await resolvePublicNetworkHost(hostname, lookup)
  return true
}

module.exports = {
  PUBLIC_WEB_PROTOCOLS,
  assertPublicLookupResults,
  assertPublicNetworkHost,
  assertPublicNetworkUrl,
  createPublicNetworkLookup,
  isBlockedNetworkAddress,
  isBlockedNetworkHostname,
  resolvePublicNetworkHost
}
