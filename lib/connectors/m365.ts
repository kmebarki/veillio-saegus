import 'server-only'

import { M365_CLOUD_INFO, M365_SOURCE_LABELS, type ConnectorConfig } from '@/lib/connector-catalog'
import { safeFetch, SafeFetchError } from '@/lib/connectors/safe-fetch'
import { TestReport, type TestResult, type TestSample } from '@/lib/connectors/test-types'

const LABELS = {
  config: 'Configuration',
  token: 'Authentification Entra ID',
  resource: 'Ressource Microsoft 365',
  items: 'Extraction',
  fields: 'Champs',
}

const MAX_BYTES = 2 * 1024 * 1024

export class M365Error extends Error {
  constructor(
    public step: 'token' | 'resource' | 'items',
    message: string,
  ) {
    super(message)
  }
}

type GraphJson = Record<string, unknown>

async function graphFetch(url: string, init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutSec: number }) {
  try {
    const response = await safeFetch(url, {
      method: init.method ?? 'GET',
      headers: { Accept: 'application/json', ...init.headers },
      body: init.body,
      timeoutMs: init.timeoutSec * 1000,
      followRedirects: false,
      maxBytes: MAX_BYTES,
    })
    let json: GraphJson = {}
    try {
      json = JSON.parse(response.body.toString('utf8')) as GraphJson
    } catch {
      json = {}
    }
    return { status: response.status, json, durationMs: response.durationMs }
  } catch (error) {
    throw error instanceof SafeFetchError ? new Error(error.message) : new Error('Impossible de joindre Microsoft.')
  }
}

const ENTRA_ERRORS: [RegExp, string][] = [
  [/AADSTS90002|AADSTS900023/, 'Tenant introuvable : vérifiez l’identifiant du tenant (GUID ou domaine).'],
  [/AADSTS700016/, 'Application introuvable dans ce tenant : vérifiez l’ID d’application (client) et le tenant.'],
  [/AADSTS7000215|AADSTS7000218/, 'Secret client refusé : valeur incorrecte (copiez la « Valeur » du secret, pas son identifiant).'],
  [/AADSTS7000222/, 'Le secret client a expiré : créez-en un nouveau dans Entra ID.'],
  [/AADSTS70011/, 'Portée refusée : l’application doit utiliser des autorisations d’application Microsoft Graph.'],
  [/AADSTS500011|AADSTS650052/, 'Microsoft Graph n’est pas disponible pour ce tenant : vérifiez le cloud sélectionné.'],
]

export async function acquireToken(config: ConnectorConfig, secret: string) {
  const { m365 } = config
  const cloud = M365_CLOUD_INFO[m365.cloud]
  const body = new URLSearchParams({ client_id: m365.clientId, client_secret: secret, scope: `https://${cloud.graph}/.default`, grant_type: 'client_credentials' }).toString()
  const { status, json, durationMs } = await graphFetch(`https://${cloud.login}/${encodeURIComponent(m365.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    timeoutSec: config.http.timeoutSec,
  })
  if (status !== 200 || typeof json.access_token !== 'string') {
    const description = typeof json.error_description === 'string' ? json.error_description : ''
    const known = ENTRA_ERRORS.find(([pattern]) => pattern.test(description))
    throw new M365Error('token', known?.[1] ?? (typeof json.error === 'string' ? `Authentification refusée (${json.error}).` : `Authentification refusée (HTTP ${status}).`))
  }
  return { token: json.access_token, durationMs, expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 3600 }
}

function odataString(value: string) {
  return value.replace(/'/g, "''")
}

function encodePath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

async function graphGet(config: ConnectorConfig, token: string, path: string, step: 'resource' | 'items') {
  const cloud = M365_CLOUD_INFO[config.m365.cloud]
  const url = path.startsWith('https://') ? path : `https://${cloud.graph}/v1.0${path}`
  if (!url.startsWith(`https://${cloud.graph}/`)) throw new M365Error(step, 'Lien de pagination inattendu : hôte différent de Microsoft Graph.')
  const { status, json } = await graphFetch(url, { headers: { Authorization: `Bearer ${token}` }, timeoutSec: config.http.timeoutSec })
  if (status >= 200 && status < 300) return json
  const error = (json.error ?? {}) as { code?: string; message?: string }
  if (status === 401) throw new M365Error(step, 'Jeton refusé par Microsoft Graph (HTTP 401).')
  if (status === 403) throw new M365Error(step, 'Accès refusé (HTTP 403) : accordez à l’application les autorisations d’application Sites.Read.All (SharePoint) ou Files.Read.All (OneDrive) avec consentement administrateur.')
  if (status === 404) throw new M365Error(step, 'Ressource introuvable (HTTP 404) : vérifiez l’adresse du site, le nom de la liste ou de la bibliothèque, ou l’UPN.')
  if (status === 429) throw new M365Error(step, 'Microsoft Graph limite le débit (HTTP 429) : espacez les collectes.')
  throw new M365Error(step, `Microsoft Graph a répondu HTTP ${status}${error.code ? ` (${error.code})` : ''}.`)
}

type DriveItem = { id: string; name: string; webUrl?: string; size?: number; lastModifiedDateTime?: string; file?: { mimeType?: string }; folder?: unknown; lastModifiedBy?: { user?: { displayName?: string } } }

type ListItem = { id: string; webUrl?: string; lastModifiedDateTime?: string; fields?: Record<string, unknown> }

export type M365Item = TestSample & { guid: string }

export type M365Resource = { label: string; detail: string }

async function resolveSiteId(config: ConnectorConfig, token: string) {
  const site = new URL(config.m365.siteUrl)
  const path = site.pathname.replace(/\/+$/, '')
  const json = await graphGet(config, token, `/sites/${site.hostname}:${path || '/'}`, 'resource')
  if (typeof json.id !== 'string') throw new M365Error('resource', 'Site SharePoint introuvable.')
  return { id: json.id, name: typeof json.displayName === 'string' ? json.displayName : site.hostname }
}

function formatSize(bytes?: number) {
  if (!bytes) return ''
  return bytes < 1024 ? `${bytes} o` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

function allowedExtension(name: string, extensions: string) {
  const list = extensions
    .split(',')
    .map((ext) => ext.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)
  if (list.length === 0) return true
  const dot = name.lastIndexOf('.')
  return dot >= 0 && list.includes(name.slice(dot + 1).toLowerCase())
}

function fromDriveItem(entry: DriveItem): M365Item {
  const author = entry.lastModifiedBy?.user?.displayName
  const parts = [formatSize(entry.size), entry.file?.mimeType, author ? `modifié par ${author}` : ''].filter(Boolean)
  return { title: entry.name, link: entry.webUrl ?? '', date: entry.lastModifiedDateTime ?? '', summary: parts.join(' · '), guid: entry.id }
}

function field(fields: Record<string, unknown> | undefined, name: string) {
  const value = name && fields ? fields[name] : undefined
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return typeof record.Description === 'string' ? record.Description : typeof record.LookupValue === 'string' ? record.LookupValue : ''
  }
  return ''
}

export async function readM365(config: ConnectorConfig, token: string, limit: number): Promise<{ resource: M365Resource; items: M365Item[]; scanned: number }> {
  const { m365 } = config
  const top = Math.min(Math.max(limit, 1), 200)

  if (m365.source === 'sharepoint_list') {
    const site = await resolveSiteId(config, token)
    const lists = await graphGet(config, token, `/sites/${site.id}/lists?$filter=${encodeURIComponent(`displayName eq '${odataString(m365.listName)}'`)}&$select=id,displayName`, 'resource')
    const found = (lists.value as { id: string; displayName: string }[] | undefined)?.[0]
    if (!found) throw new M365Error('resource', `Liste « ${m365.listName} » introuvable sur ce site. Vérifiez le nom exact.`)
    const result = await graphGet(config, token, `/sites/${site.id}/lists/${found.id}/items?$expand=fields&$top=${top}`, 'items')
    const rows = (result.value as ListItem[] | undefined) ?? []
    const items = rows
      .map((row) => ({
        title: field(row.fields, m365.titleField || 'Title'),
        link: row.webUrl ?? '',
        date: field(row.fields, m365.dateField) || row.lastModifiedDateTime || '',
        summary: field(row.fields, m365.summaryField).slice(0, 1000),
        guid: row.id,
      }))
      .filter((item) => item.title)
    return { resource: { label: `Liste « ${found.displayName} »`, detail: `Site ${site.name}` }, items, scanned: rows.length }
  }

  let driveBase: string
  let resource: M365Resource
  if (m365.source === 'onedrive') {
    const drive = await graphGet(config, token, `/users/${encodeURIComponent(m365.userPrincipal)}/drive?$select=id,name,driveType`, 'resource')
    driveBase = `/drives/${String(drive.id)}`
    resource = { label: `OneDrive de ${m365.userPrincipal}`, detail: `Lecteur de type ${String(drive.driveType ?? 'inconnu')}` }
  } else {
    const site = await resolveSiteId(config, token)
    const drives = await graphGet(config, token, `/sites/${site.id}/drives?$select=id,name`, 'resource')
    const list = (drives.value as { id: string; name: string }[] | undefined) ?? []
    const wanted = (m365.libraryName || 'Documents').toLowerCase()
    const drive = list.find((entry) => entry.name.toLowerCase() === wanted)
    if (!drive) throw new M365Error('resource', `Bibliothèque « ${m365.libraryName} » introuvable. Bibliothèques disponibles : ${list.map((entry) => entry.name).join(', ') || 'aucune'}.`)
    driveBase = `/drives/${drive.id}`
    resource = { label: `Bibliothèque « ${drive.name} »`, detail: `Site ${site.name}` }
  }

  const folder = encodePath(m365.folderPath)
  const children = await graphGet(config, token, `${driveBase}/root${folder ? `:/${folder}:` : ''}/children?$top=${top}&$select=id,name,webUrl,size,lastModifiedDateTime,file,folder,lastModifiedBy`, 'items')
  const rows = (children.value as DriveItem[] | undefined) ?? []
  const items = rows
    .filter((row) => !row.folder && allowedExtension(row.name, m365.fileExtensions))
    .map(fromDriveItem)
    .sort((a, b) => b.date.localeCompare(a.date))
  return { resource, items, scanned: rows.length }
}

export async function collectM365(config: ConnectorConfig, secret: string): Promise<M365Item[]> {
  const { token } = await acquireToken(config, secret)
  return (await readM365(config, token, config.http.maxItems)).items
}

export async function testM365(config: ConnectorConfig, secret: string | null): Promise<TestResult> {
  const report = new TestReport(LABELS, secret)
  const { m365 } = config
  const cloud = M365_CLOUD_INFO[m365.cloud]
  report.push('config', 'ok', `${cloud.label} — ${M365_SOURCE_LABELS[m365.source].label}.`)

  if (!secret) {
    report.push('token', 'error', 'Aucune connexion sélectionnée : le secret client de l’application Entra ID est requis.')
    report.skip(['resource', 'items', 'fields'])
    return report.failure('Sélectionnez une connexion contenant le secret client.')
  }

  let token: string
  try {
    const result = await acquireToken(config, secret)
    token = result.token
    report.push('token', result.expiresIn < 600 ? 'warning' : 'ok', `Jeton obtenu en ${result.durationMs} ms (valable ${Math.round(result.expiresIn / 60)} min), flux client credentials.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentification impossible.'
    report.push('token', 'error', message)
    report.skip(['resource', 'items', 'fields'])
    return report.failure(message)
  }

  try {
    const { resource, items, scanned } = await readM365(config, token, Math.min(config.http.maxItems, 50))
    report.push('resource', 'ok', `${resource.label} atteint. ${resource.detail}.`)
    const emptyDetail = m365.fileExtensions ? `${scanned} élément${scanned > 1 ? 's' : ''} lu${scanned > 1 ? 's' : ''}, aucun ne correspond au filtre d’extensions (${m365.fileExtensions}).` : 'La ressource est vide.'
    report.push('items', items.length > 0 ? 'ok' : 'warning', items.length > 0 ? `${items.length} élément${items.length > 1 ? 's' : ''} exploitable${items.length > 1 ? 's' : ''} sur ${scanned} lu${scanned > 1 ? 's' : ''}.` : emptyDetail)
    if (items.length === 0) {
      report.skip(['fields'])
      return report.finish([], 0, { message: 'Connexion réussie, mais aucun élément n’a été extrait.' })
    }
    const withLink = items.filter((item) => item.link).length
    const withDate = items.filter((item) => item.date).length
    report.push('fields', withLink < items.length ? 'warning' : 'ok', `Lien pour ${Math.round((withLink / items.length) * 100)} % des éléments, date pour ${Math.round((withDate / items.length) * 100)} %.`)
    return report.finish(items, items.length)
  } catch (error) {
    const step = error instanceof M365Error ? error.step : 'resource'
    const message = error instanceof Error ? error.message : 'Lecture impossible.'
    report.push(step, 'error', message)
    report.skip(['resource', 'items', 'fields'])
    return report.failure(message)
  }
}
