import 'server-only'

import type { ConnectorConfig, ConnectorKind } from '@/lib/connector-catalog'
import { ParseError, parseApi, parseFeed, parseWeb, resolvePath, type ParsedItem } from '@/lib/connectors/parsers'
import { safeFetch, SafeFetchError, validateTargetUrl } from '@/lib/connectors/safe-fetch'

export type CheckStatus = 'ok' | 'warning' | 'error' | 'skipped'
export type TestCheck = { id: string; label: string; status: CheckStatus; detail: string }
export type TestSample = { title: string; link: string; date: string; summary: string }

export type TestResult = {
  status: 'success' | 'warning' | 'error'
  message: string
  httpStatus: number | null
  durationMs: number
  itemsFound: number | null
  checks: TestCheck[]
  sample: TestSample[]
  finalUrl?: string
  contentType?: string
  bytes?: number
}

const MAX_BYTES = 2 * 1024 * 1024
const MASK = '••••••'

const ACCEPT: Record<ConnectorKind, string> = {
  rss: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  web: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  api: 'application/json, */*;q=0.5',
}

function redact(text: string, secret: string | null) {
  return secret && secret.length >= 3 ? text.split(secret).join(MASK).split(encodeURIComponent(secret)).join(MASK) : text
}

function buildRequest(kind: ConnectorKind, config: ConnectorConfig, secret: string | null) {
  const url = new URL(config.url.trim())
  const headers: Record<string, string> = {
    'User-Agent': config.http.userAgent,
    Accept: ACCEPT[kind],
    'Accept-Encoding': 'gzip, deflate, br',
  }
  for (const header of config.http.headers) if (header.name) headers[header.name] = header.value

  const sensitive: string[] = []
  if (secret) {
    if (config.auth.type === 'bearer') {
      headers.Authorization = `Bearer ${secret}`
      sensitive.push('Authorization')
    } else if (config.auth.type === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${config.auth.username}:${secret}`).toString('base64')}`
      sensitive.push('Authorization')
    } else if (config.auth.type === 'api_key_header') {
      headers[config.auth.keyName] = secret
      sensitive.push(config.auth.keyName)
    } else if (config.auth.type === 'api_key_query') {
      url.searchParams.set(config.auth.keyName, secret)
    }
  }

  let body: string | undefined
  if (kind === 'api') {
    for (const param of config.api.query) if (param.name) url.searchParams.set(param.name, param.value)
    const { pagination } = config.api
    if (pagination.type !== 'none') {
      if (pagination.sizeParam) url.searchParams.set(pagination.sizeParam, String(pagination.pageSize))
      if (pagination.type === 'page') url.searchParams.set(pagination.param, '1')
      if (pagination.type === 'offset') url.searchParams.set(pagination.param, '0')
    }
    if (config.api.method === 'POST' && config.api.body.trim()) {
      body = config.api.body
      headers['Content-Type'] = 'application/json'
    }
  }
  return { url: url.toString(), headers, body, sensitive }
}

export async function runConnectorTest(kind: ConnectorKind, config: ConnectorConfig, secret: string | null): Promise<TestResult> {
  const startedAt = Date.now()
  const checks: TestCheck[] = []
  const push = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail: redact(detail, secret) })
  const skipRemaining = (from: string[]) => {
    for (const id of from) if (!checks.some((check) => check.id === id)) push(id, CHECK_LABELS[id], 'skipped', 'Non évalué : une étape précédente a échoué.')
  }

  const fail = (message: string, partial: Partial<TestResult> = {}): TestResult => ({
    status: 'error',
    message: redact(message, secret),
    httpStatus: null,
    durationMs: Date.now() - startedAt,
    itemsFound: null,
    checks,
    sample: [],
    ...partial,
  })

  let request: ReturnType<typeof buildRequest>
  try {
    const target = validateTargetUrl(config.url)
    request = buildRequest(kind, config, secret)
    push('url', CHECK_LABELS.url, target.protocol === 'http:' ? 'warning' : 'ok', target.protocol === 'http:' ? `Hôte ${target.hostname} joint en HTTP non chiffré : privilégiez HTTPS.` : `Hôte ${target.hostname}, connexion chiffrée (HTTPS).`)
  } catch (error) {
    const message = error instanceof SafeFetchError ? error.message : 'Adresse invalide.'
    push('url', CHECK_LABELS.url, 'error', message)
    skipRemaining(['connect', 'http', 'format', 'items', 'fields'])
    return fail(message)
  }

  let response: Awaited<ReturnType<typeof safeFetch>>
  try {
    response = await safeFetch(request.url, {
      method: kind === 'api' ? config.api.method : 'GET',
      headers: request.headers,
      body: request.body,
      timeoutMs: config.http.timeoutSec * 1000,
      followRedirects: config.http.followRedirects,
      maxBytes: MAX_BYTES,
      stripOnCrossOrigin: request.sensitive,
    })
  } catch (error) {
    const message = error instanceof SafeFetchError ? error.message : 'Impossible de joindre le serveur.'
    push('connect', CHECK_LABELS.connect, 'error', message)
    skipRemaining(['http', 'format', 'items', 'fields'])
    return fail(message)
  }

  const finalUrl = redactUrl(response.finalUrl, config, secret)
  const common = { httpStatus: response.status, finalUrl, contentType: response.contentType.split(';')[0].trim(), bytes: response.bytes }
  push('connect', CHECK_LABELS.connect, 'ok', `Serveur joint en ${response.durationMs} ms${response.redirects ? `, ${response.redirects} redirection${response.redirects > 1 ? 's' : ''} suivie${response.redirects > 1 ? 's' : ''}` : ''}.`)

  const { status } = response
  if (status === 401 || status === 403) {
    const hint = config.auth.type === 'none' ? 'Aucune authentification n’est configurée : le serveur exige peut-être des identifiants.' : 'Les identifiants ont été refusés : vérifiez le secret et le type d’authentification.'
    push('http', CHECK_LABELS.http, 'error', `HTTP ${status} : accès refusé. ${hint}`)
    skipRemaining(['format', 'items', 'fields'])
    return fail(`Accès refusé (HTTP ${status}).`, common)
  }
  if (status === 404 || status === 410) {
    push('http', CHECK_LABELS.http, 'error', `HTTP ${status} : la ressource n’existe pas à cette adresse.`)
    skipRemaining(['format', 'items', 'fields'])
    return fail(`Ressource introuvable (HTTP ${status}).`, common)
  }
  if (status === 429) {
    push('http', CHECK_LABELS.http, 'error', 'HTTP 429 : le fournisseur limite le débit. Espacez les collectes.')
    skipRemaining(['format', 'items', 'fields'])
    return fail('Limite de débit atteinte (HTTP 429).', common)
  }
  if (status >= 500) {
    push('http', CHECK_LABELS.http, 'error', `HTTP ${status} : erreur côté serveur distant.`)
    skipRemaining(['format', 'items', 'fields'])
    return fail(`Erreur du serveur distant (HTTP ${status}).`, common)
  }
  if (status >= 300) {
    push('http', CHECK_LABELS.http, 'error', `HTTP ${status} : redirection non suivie. Activez « Suivre les redirections » ou corrigez l’URL.`)
    skipRemaining(['format', 'items', 'fields'])
    return fail(`Redirection non suivie (HTTP ${status}).`, common)
  }
  if (status < 200) {
    push('http', CHECK_LABELS.http, 'error', `HTTP ${status} inattendu.`)
    skipRemaining(['format', 'items', 'fields'])
    return fail(`Réponse inattendue (HTTP ${status}).`, common)
  }
  push('http', CHECK_LABELS.http, response.truncated ? 'warning' : 'ok', response.truncated ? `HTTP ${status}. Réponse tronquée à ${MAX_BYTES / 1024 / 1024} Mo : seule la première partie est analysée.` : `HTTP ${status}, ${formatBytes(response.bytes)} reçus.`)

  const text = response.body.toString('utf8')
  let items: ParsedItem[] = []
  let formatDetail = ''
  let itemsDetail = ''
  let itemsStatus: CheckStatus = 'ok'
  let fieldsDetail = ''
  let fieldsStatus: CheckStatus = 'ok'
  let pagination: { status: CheckStatus; detail: string } | null = null

  try {
    if (kind === 'rss') {
      if (/^\s*<!doctype html|^\s*<html/i.test(text)) throw new ParseError('La page renvoie du HTML et non un flux : l’URL pointe probablement vers le site, pas vers le flux.')
      const feed = parseFeed(text, response.finalUrl, config.http.maxItems)
      items = feed.items
      formatDetail = `${feed.format}${feed.title ? ` — « ${feed.title} »` : ''}.`
    } else if (kind === 'web') {
      if (!/html|xml|text\/plain/i.test(response.contentType) && response.contentType) throw new ParseError(`Type de contenu inattendu (${response.contentType}) : une page HTML est attendue.`)
      const report = parseWeb(text, config, response.finalUrl)
      items = report.items
      formatDetail = 'Document HTML analysé.'
      itemsDetail = `${report.matchedItems} élément${report.matchedItems > 1 ? 's' : ''} correspond${report.matchedItems > 1 ? 'ent' : ''} à « ${config.web.itemSelector} ».`
      if (report.matchedItems === 0) {
        itemsStatus = 'error'
        itemsDetail = `Aucun élément ne correspond à « ${config.web.itemSelector} ». Les sites très dynamiques (rendu JavaScript) ne sont pas lisibles par ce connecteur.`
      }
      const rate = report.items.length ? Math.round((report.withTitle / report.items.length) * 100) : 0
      const linkRate = report.items.length ? Math.round((report.withLink / report.items.length) * 100) : 0
      fieldsDetail = `Titre trouvé pour ${rate} % des éléments (« ${config.web.titleSelector} »), lien pour ${linkRate} % (« ${config.web.linkSelector} »).`
      if (report.items.length && (rate < 80 || linkRate < 80)) fieldsStatus = rate < 30 || linkRate < 30 ? 'error' : 'warning'
    } else {
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw new ParseError('La réponse n’est pas du JSON valide.')
      }
      const report = parseApi(json, config, response.finalUrl)
      items = report.items
      formatDetail = 'JSON valide.'
      itemsDetail = `${report.total} élément${report.total > 1 ? 's' : ''} dans « ${config.api.itemsPath || 'racine'} ».`
      const rate = report.items.length ? Math.round((report.withTitle / report.items.length) * 100) : 0
      const linkRate = report.items.length ? Math.round((report.withLink / report.items.length) * 100) : 0
      fieldsDetail = `Titre (« ${config.api.titlePath} ») pour ${rate} % des éléments, lien (« ${config.api.linkPath} ») pour ${linkRate} %.`
      if (report.items.length && (rate < 80 || linkRate < 80)) fieldsStatus = rate < 30 || linkRate < 30 ? 'error' : 'warning'
      const page = config.api.pagination
      if (page.type === 'cursor') {
        const cursor = resolvePath(json, page.cursorPath)
        pagination = cursor ? { status: 'ok', detail: `Curseur de page suivante trouvé (« ${page.cursorPath} »).` } : { status: 'warning', detail: `Curseur « ${page.cursorPath} » absent de la réponse (normal s’il n’y a qu’une page).` }
      } else if (page.type !== 'none') {
        pagination = { status: report.total >= page.pageSize ? 'ok' : 'warning', detail: report.total >= page.pageSize ? `Page complète (${report.total}) : les pages suivantes seront parcourues (${page.maxPages} maximum).` : `La première page contient ${report.total} éléments, moins que la taille demandée (${page.pageSize}) : une seule page sera lue.` }
      }
    }
  } catch (error) {
    const message = error instanceof ParseError ? error.message : 'Le contenu n’a pas pu être analysé.'
    const failedAtItems = kind === 'api' && /chemin/i.test(message)
    push('format', CHECK_LABELS.format, failedAtItems ? 'ok' : 'error', failedAtItems ? 'JSON valide.' : message)
    if (failedAtItems) push('items', CHECK_LABELS.items, 'error', message)
    skipRemaining(['items', 'fields'])
    return fail(message, common)
  }

  push('format', CHECK_LABELS.format, 'ok', formatDetail)
  if (items.length === 0 && itemsStatus !== 'error') itemsStatus = kind === 'rss' ? 'warning' : 'error'
  push('items', CHECK_LABELS.items, itemsStatus, itemsStatus === 'ok' || kind === 'rss' || kind === 'api' ? itemsDetail || `${items.length} élément${items.length > 1 ? 's' : ''} détecté${items.length > 1 ? 's' : ''}.` : itemsDetail)
  if (items.length === 0) {
    skipRemaining(['fields'])
    return {
      status: itemsStatus === 'error' ? 'error' : 'warning',
      message: 'Connexion réussie, mais aucun élément n’a été extrait.',
      itemsFound: 0,
      durationMs: Date.now() - startedAt,
      checks,
      sample: [],
      ...common,
    }
  }

  if (kind === 'rss') {
    const withTitle = items.filter((item) => item.title).length
    const withLink = items.filter((item) => item.link).length
    fieldsDetail = `Titre présent pour ${Math.round((withTitle / items.length) * 100)} % des éléments, lien pour ${Math.round((withLink / items.length) * 100)} %.`
    if (withTitle < items.length * 0.8 || withLink < items.length * 0.8) fieldsStatus = 'warning'
  }
  const dated = items.filter((item) => item.date).length
  const datePart = dated === items.length ? ' Dates reconnues sur tous les éléments.' : dated === 0 ? ' Aucune date exploitable : les contenus seront datés à la collecte.' : ` Dates reconnues pour ${dated} élément${dated > 1 ? 's' : ''} sur ${items.length}.`
  push('fields', CHECK_LABELS.fields, fieldsStatus, fieldsDetail + datePart)
  if (pagination) push('pagination', CHECK_LABELS.pagination, pagination.status, pagination.detail)

  const hasError = checks.some((check) => check.status === 'error')
  const hasWarning = checks.some((check) => check.status === 'warning')
  const durationMs = Date.now() - startedAt
  return {
    status: hasError ? 'error' : hasWarning ? 'warning' : 'success',
    message: hasError
      ? 'Les éléments sont lus, mais les champs obligatoires sont insuffisants.'
      : `${items.length} élément${items.length > 1 ? 's' : ''} détecté${items.length > 1 ? 's' : ''}${hasWarning ? ', avec des points d’attention.' : ' : connecteur prêt.'}`,
    itemsFound: items.length,
    durationMs,
    checks,
    sample: items.slice(0, 5).map(({ title, link, date, summary }) => ({ title: redact(title, secret), link: redact(link, secret), date, summary: redact(summary, secret) })),
    ...common,
    httpStatus: status,
  }
}

const CHECK_LABELS: Record<string, string> = {
  url: 'Adresse',
  connect: 'Connexion',
  http: 'Réponse HTTP',
  format: 'Format',
  items: 'Extraction',
  fields: 'Champs',
  pagination: 'Pagination',
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} o` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

function redactUrl(raw: string, config: ConnectorConfig, secret: string | null) {
  try {
    const url = new URL(raw)
    if (config.auth.type === 'api_key_query' && config.auth.keyName && url.searchParams.has(config.auth.keyName)) url.searchParams.set(config.auth.keyName, MASK)
    return redact(url.toString(), secret)
  } catch {
    return redact(raw, secret)
  }
}
