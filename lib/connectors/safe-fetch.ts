import 'server-only'

import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import zlib from 'node:zlib'

export type SafeFetchErrorCode = 'invalid_url' | 'blocked' | 'dns' | 'timeout' | 'connect' | 'tls' | 'redirect' | 'network'

export class SafeFetchError extends Error {
  constructor(public code: SafeFetchErrorCode, message: string) {
    super(message)
  }
}

export type SafeFetchInit = {
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
  timeoutMs: number
  followRedirects: boolean
  maxBytes: number
  maxRedirects?: number
  stripOnCrossOrigin?: string[]
}

export type SafeFetchResult = {
  status: number
  contentType: string
  body: Buffer
  bytes: number
  truncated: boolean
  finalUrl: string
  redirects: number
  durationMs: number
}

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443])
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.lan', '.home', '.corp', '.intranet']

function ipv4Blocked(a: number, b: number) {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  return false
}

function expandIpv6(address: string) {
  const [head, tail = ''] = address.split('::')
  const toGroups = (part: string) => (part ? part.split(':') : [])
  let headGroups = toGroups(head)
  let tailGroups = toGroups(tail)
  const lastGroup = (address.includes('::') ? tailGroups : headGroups).at(-1)
  if (lastGroup && lastGroup.includes('.')) {
    const octets = lastGroup.split('.').map(Number)
    const converted = [((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16)]
    if (address.includes('::')) tailGroups = [...tailGroups.slice(0, -1), ...converted]
    else headGroups = [...headGroups.slice(0, -1), ...converted]
  }
  const missing = 8 - headGroups.length - tailGroups.length
  const groups = address.includes('::') ? [...headGroups, ...Array(Math.max(missing, 0)).fill('0'), ...tailGroups] : headGroups
  return groups.map((group) => parseInt(group || '0', 16))
}

export function isBlockedIp(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) {
    const [a, b] = address.split('.').map(Number)
    return ipv4Blocked(a, b)
  }
  if (family === 6) {
    const groups = expandIpv6(address.toLowerCase().split('%')[0])
    if (groups.length !== 8 || groups.some((group) => Number.isNaN(group))) return true
    const allZeroPrefix = groups.slice(0, 5).every((group) => group === 0)
    if (allZeroPrefix && (groups[5] === 0xffff || groups[5] === 0)) {
      if (groups[5] === 0 && groups[6] === 0 && groups[7] <= 1) return true
      return ipv4Blocked(groups[6] >> 8, groups[6] & 255)
    }
    if (groups[0] === 0x64 && groups[1] === 0xff9b) return ipv4Blocked(groups[6] >> 8, groups[6] & 255)
    if ((groups[0] & 0xfe00) === 0xfc00) return true
    if ((groups[0] & 0xffc0) === 0xfe80) return true
    if ((groups[0] & 0xff00) === 0xff00) return true
    return false
  }
  return true
}

export function validateTargetUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new SafeFetchError('invalid_url', 'L’adresse n’est pas une URL valide (ex. https://exemple.com/flux.xml).')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SafeFetchError('invalid_url', 'Seuls les protocoles http et https sont autorisés.')
  if (url.username || url.password) throw new SafeFetchError('invalid_url', 'N’incluez pas d’identifiants dans l’URL : utilisez la section Authentification.')
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!ALLOWED_PORTS.has(port)) throw new SafeFetchError('blocked', `Le port ${port} n’est pas autorisé (autorisés : 80, 443, 8080, 8443).`)
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host.includes('.') && net.isIP(host) === 0) throw new SafeFetchError('blocked', 'Les noms d’hôte internes ne sont pas autorisés.')
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) throw new SafeFetchError('blocked', 'Les adresses du réseau interne ne sont pas autorisées.')
  if (net.isIP(host) !== 0 && isBlockedIp(host)) throw new SafeFetchError('blocked', 'Cette adresse IP est privée ou réservée : elle n’est pas autorisée.')
  return url
}

const guardedLookup = ((hostname: string, options: dns.LookupOptions, callback: (error: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0)
    const list = addresses as dns.LookupAddress[]
    if (list.length === 0 || list.some((entry) => isBlockedIp(entry.address))) {
      const blocked = new Error('Le nom de domaine pointe vers une adresse privée ou réservée.') as NodeJS.ErrnoException
      blocked.code = 'EBLOCKED'
      return callback(blocked, '', 0)
    }
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}) as unknown as net.LookupFunction

function decoderFor(encoding: string | undefined) {
  const value = (encoding ?? '').toLowerCase()
  if (value === 'gzip' || value === 'x-gzip') return zlib.createGunzip()
  if (value === 'deflate') return zlib.createInflate()
  if (value === 'br') return zlib.createBrotliDecompress()
  return null
}

function mapNetworkError(error: NodeJS.ErrnoException): SafeFetchError {
  const code = error.code ?? ''
  if (code === 'EBLOCKED') return new SafeFetchError('blocked', error.message)
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new SafeFetchError('dns', 'Le nom de domaine est introuvable (DNS).')
  if (code === 'ECONNREFUSED') return new SafeFetchError('connect', 'Connexion refusée par le serveur.')
  if (code === 'ECONNRESET') return new SafeFetchError('connect', 'Connexion interrompue par le serveur.')
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return new SafeFetchError('timeout', 'Le serveur ne répond pas dans le délai imparti.')
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS|HOSTNAME_MISMATCH/i.test(code) || /certificate|tls|ssl/i.test(error.message)) {
    return new SafeFetchError('tls', 'Le certificat TLS du serveur est invalide ou non reconnu.')
  }
  return new SafeFetchError('network', 'Erreur réseau lors de la connexion au serveur.')
}

function singleRequest(url: URL, init: SafeFetchInit, deadline: number) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer; truncated: boolean }>((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return reject(new SafeFetchError('timeout', 'Le délai maximum est dépassé.'))

    const transport = url.protocol === 'https:' ? https : http
    const headers = { ...init.headers }
    if (init.body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(init.body))

    const request = transport.request(url, { method: init.method, headers, lookup: guardedLookup, agent: false, timeout: Math.min(remaining, init.timeoutMs) }, (response) => {
      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400) {
        response.resume()
        resolve({ status, headers: response.headers, body: Buffer.alloc(0), truncated: false })
        return
      }

      const chunks: Buffer[] = []
      let total = 0
      let truncated = false
      const decoder = decoderFor(response.headers['content-encoding'] as string | undefined)
      const source = decoder ? response.pipe(decoder) : response

      const finish = () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks), truncated })
      source.on('data', (chunk: Buffer) => {
        if (truncated) return
        total += chunk.length
        if (total > init.maxBytes) {
          chunks.push(chunk.subarray(0, chunk.length - (total - init.maxBytes)))
          truncated = true
          request.destroy()
          finish()
          return
        }
        chunks.push(chunk)
      })
      source.on('end', () => !truncated && finish())
      source.on('error', () => (truncated ? undefined : reject(new SafeFetchError('network', 'Le contenu reçu est corrompu ou mal encodé.'))))
      response.on('error', (error) => (truncated ? undefined : reject(mapNetworkError(error as NodeJS.ErrnoException))))
    })

    request.on('timeout', () => request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })))
    request.on('error', (error) => reject(mapNetworkError(error as NodeJS.ErrnoException)))
    if (init.body !== undefined) request.write(init.body)
    request.end()
  })
}

export async function safeFetch(rawUrl: string, init: SafeFetchInit): Promise<SafeFetchResult> {
  const startedAt = Date.now()
  const deadline = startedAt + init.timeoutMs
  const maxRedirects = init.maxRedirects ?? 4
  let url = validateTargetUrl(rawUrl)
  let current = { ...init }
  let redirects = 0

  for (;;) {
    const result = await singleRequest(url, current, deadline)
    const location = result.headers.location
    if (result.status >= 300 && result.status < 400 && location) {
      if (!init.followRedirects) {
        return { status: result.status, contentType: String(result.headers['content-type'] ?? ''), body: result.body, bytes: 0, truncated: false, finalUrl: url.toString(), redirects, durationMs: Date.now() - startedAt }
      }
      redirects += 1
      if (redirects > maxRedirects) throw new SafeFetchError('redirect', `Trop de redirections (plus de ${maxRedirects}).`)
      const next = validateTargetUrl(new URL(location, url).toString())
      if (next.origin !== url.origin) {
        const stripped = new Set((init.stripOnCrossOrigin ?? []).map((name) => name.toLowerCase()))
        current = { ...current, headers: Object.fromEntries(Object.entries(current.headers).filter(([name]) => !stripped.has(name.toLowerCase()))) }
      }
      if ([301, 302, 303].includes(result.status)) current = { ...current, method: 'GET', body: undefined }
      url = next
      continue
    }
    return {
      status: result.status,
      contentType: String(result.headers['content-type'] ?? ''),
      body: result.body,
      bytes: result.body.length,
      truncated: result.truncated,
      finalUrl: url.toString(),
      redirects,
      durationMs: Date.now() - startedAt,
    }
  }
}
