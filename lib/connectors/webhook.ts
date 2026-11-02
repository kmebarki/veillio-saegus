import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { and, desc, eq, gte, sql } from 'drizzle-orm'

import type { ConnectorConfig } from '@/lib/connector-catalog'
import { db } from '@/lib/db'
import { connections, connectors, webhookEvents, type WebhookEventPayloadItem } from '@/lib/db/schema'
import { decryptSecret } from '@/lib/connectors/crypto'
import { normalizeDate, resolvePath } from '@/lib/connectors/parsers'
import { TestReport, type TestResult } from '@/lib/connectors/test-types'

const LABELS = {
  config: 'Authentification',
  endpoint: 'Adresse de réception',
  secret: 'Secret partagé',
  events: 'Événements reçus',
  mapping: 'Mapping du payload',
}

const MAX_ITEMS_PER_REQUEST = 100

export function webhookPath(connectorId: string) {
  return `/api/webhooks/${connectorId}`
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function text(value: unknown, max: number) {
  if (typeof value === 'string') return value.trim().slice(0, max)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).slice(0, max)
  return ''
}

function httpLink(value: unknown) {
  const raw = text(value, 2000)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

export function extractWebhookItems(config: ConnectorConfig, payload: unknown): WebhookEventPayloadItem[] {
  const { webhook } = config
  const source = webhook.itemsPath ? resolvePath(payload, webhook.itemsPath) : Array.isArray(payload) ? payload : [payload]
  const list = Array.isArray(source) ? source : source && typeof source === 'object' ? [source] : []
  return list.slice(0, MAX_ITEMS_PER_REQUEST).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const title = text(resolvePath(entry, webhook.titlePath), 300)
    if (!title) return []
    const link = webhook.linkPath ? httpLink(resolvePath(entry, webhook.linkPath)) : ''
    const date = webhook.datePath ? normalizeDate(resolvePath(entry, webhook.datePath)) : ''
    const summary = webhook.summaryPath ? text(resolvePath(entry, webhook.summaryPath), 1000) : ''
    const record = entry as Record<string, unknown>
    const guid = text(record.id ?? record.guid ?? record.uuid, 200) || link || title
    return [{ title, link, date, summary, guid }]
  })
}

type VerifyOutcome = { ok: true } | { ok: false; reason: string }

export function verifyWebhookRequest(config: ConnectorConfig, secrets: string[], headers: Headers, rawBody: string): VerifyOutcome {
  if (secrets.length === 0) return { ok: false, reason: 'Aucun secret configuré.' }
  const { webhook } = config

  if (config.auth.type === 'bearer') {
    const header = headers.get('authorization') ?? ''
    const token = header.replace(/^bearer\s+/i, '')
    if (!token) return { ok: false, reason: 'En-tête Authorization absent.' }
    return secrets.some((secret) => safeEqual(token, secret)) ? { ok: true } : { ok: false, reason: 'Jeton Bearer invalide.' }
  }

  const signature = headers.get(webhook.signatureHeader)
  if (!signature) return { ok: false, reason: `En-tête de signature « ${webhook.signatureHeader} » absent.` }

  let signedPayload = rawBody
  if (webhook.timestampHeader) {
    const timestamp = headers.get(webhook.timestampHeader)
    if (!timestamp) return { ok: false, reason: `En-tête d’horodatage « ${webhook.timestampHeader} » absent.` }
    const numeric = Number(timestamp)
    if (!Number.isFinite(numeric)) return { ok: false, reason: 'Horodatage invalide.' }
    const seconds = numeric > 1e11 ? numeric / 1000 : numeric
    if (Math.abs(Date.now() / 1000 - seconds) > webhook.toleranceSec) return { ok: false, reason: `Horodatage hors tolérance (${webhook.toleranceSec} s) : requête rejouée ou horloge décalée.` }
    signedPayload = `${timestamp}.${rawBody}`
  }

  const provided = signature.trim().replace(/^sha256=/i, '')
  const matches = secrets.some((secret) => {
    const digest = createHmac('sha256', secret).update(signedPayload).digest()
    return safeEqual(provided.toLowerCase(), digest.toString('hex')) || safeEqual(provided, digest.toString('base64'))
  })
  return matches ? { ok: true } : { ok: false, reason: 'Signature invalide.' }
}

export type WebhookResponse = { status: number; body: Record<string, unknown>; headers?: Record<string, string> }

type IncomingWebhook = { connectorId: string; headers: Headers; rawBody: string; sourceIp: string | null }

export async function handleWebhookRequest({ connectorId, headers, rawBody, sourceIp }: IncomingWebhook): Promise<WebhookResponse> {
  const [connector] = await db.select().from(connectors).where(and(eq(connectors.id, connectorId), eq(connectors.kind, 'webhook'))).limit(1)
  if (!connector) return { status: 404, body: { error: 'not_found' } }
  if (connector.status === 'paused') return { status: 409, body: { error: 'paused', message: 'Ce connecteur est en pause.' } }

  const { configSchema } = await import('@/lib/connector-catalog')
  const parsed = configSchema.safeParse(connector.config)
  if (!parsed.success) return { status: 500, body: { error: 'invalid_configuration' } }
  const config = parsed.data as ConnectorConfig

  const log = async (status: 'accepted' | 'duplicate' | 'rejected', httpStatus: number, message: string, signatureValid: boolean, item: WebhookEventPayloadItem | null = null) => {
    await db.insert(webhookEvents).values({
      connectorId,
      organizationId: connector.organizationId,
      status,
      httpStatus,
      signatureValid,
      bytes: Buffer.byteLength(rawBody),
      sourceIp,
      message,
      item,
    })
  }

  const since = new Date(Date.now() - 60_000)
  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.connectorId, connectorId), gte(webhookEvents.receivedAt, since)))
  if (recent >= config.webhook.rateLimitPerMin) return { status: 429, body: { error: 'rate_limited', message: 'Trop de requêtes.' }, headers: { 'Retry-After': '60' } }

  if (Buffer.byteLength(rawBody) > config.webhook.maxPayloadKb * 1024) {
    await log('rejected', 413, `Payload supérieur à ${config.webhook.maxPayloadKb} Ko.`, false)
    return { status: 413, body: { error: 'payload_too_large' } }
  }

  const credentialRows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.connectorId, connectorId), eq(connections.scope, 'organization')))
  const secrets = credentialRows.flatMap((row) => {
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return []
    const secret = decryptSecret(row.secretCiphertext, row.id)
    return secret ? [secret] : []
  })
  if (secrets.length === 0) {
    await log('rejected', 503, 'Aucune connexion (secret) rattachée à ce connecteur.', false)
    return { status: 503, body: { error: 'not_configured' } }
  }

  const verification = verifyWebhookRequest(config, secrets, headers, rawBody)
  if (!verification.ok) {
    await log('rejected', 401, verification.reason, false)
    return { status: 401, body: { error: 'unauthorized' } }
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    await log('rejected', 400, 'Corps JSON invalide.', true)
    return { status: 400, body: { error: 'invalid_json' } }
  }

  const items = extractWebhookItems(config, payload)
  if (items.length === 0) {
    await log('rejected', 422, `Aucun élément exploitable : le chemin du titre « ${config.webhook.titlePath} » ou la liste « ${config.webhook.itemsPath || 'racine'} » ne correspond pas.`, true)
    return { status: 422, body: { error: 'no_items', message: 'Aucun élément exploitable dans le payload.' } }
  }

  const eventId = config.webhook.idHeader ? headers.get(config.webhook.idHeader)?.trim().slice(0, 200) : ''
  let accepted = 0
  let duplicates = 0
  for (const [index, item] of items.entries()) {
    const guid = eventId ? (items.length > 1 ? `${eventId}:${index}` : eventId) : item.guid
    const stored = { ...item, guid }
    const [existing] = await db
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.connectorId, connectorId), eq(webhookEvents.status, 'accepted'), sql`${webhookEvents.item}->>'guid' = ${guid ?? ''}`))
      .limit(1)
    if (existing) {
      duplicates += 1
      continue
    }
    await log('accepted', 202, 'Événement accepté.', true, stored)
    accepted += 1
  }
  if (accepted === 0) await log('duplicate', 200, `${duplicates} événement${duplicates > 1 ? 's' : ''} déjà reçu${duplicates > 1 ? 's' : ''} (dédoublonné${duplicates > 1 ? 's' : ''}).`, true)

  await db.update(connectors).set({ lastCheckAt: new Date(), lastCheckStatus: 'success', lastCheckMessage: `${accepted} événement${accepted > 1 ? 's' : ''} reçu${accepted > 1 ? 's' : ''}.`, updatedAt: new Date() }).where(eq(connectors.id, connectorId))

  return { status: accepted > 0 ? 202 : 200, body: { accepted, duplicates } }
}

export async function testWebhook(config: ConnectorConfig, secret: string | null, connectorId?: string): Promise<TestResult> {
  const report = new TestReport(LABELS, secret)
  const { webhook } = config
  const scheme = config.auth.type === 'bearer' ? 'Jeton Bearer dans l’en-tête Authorization' : `Signature HMAC-SHA256 dans « ${webhook.signatureHeader} »${webhook.timestampHeader ? ` avec horodatage « ${webhook.timestampHeader} » (tolérance ${webhook.toleranceSec} s)` : ' sans horodatage (pas de protection anti-rejeu)'}`
  report.push('config', webhook.timestampHeader || config.auth.type === 'bearer' ? 'ok' : 'warning', scheme + '.')

  report.push('endpoint', connectorId ? 'ok' : 'warning', connectorId ? `POST ${webhookPath(connectorId)} — limite ${webhook.maxPayloadKb} Ko, ${webhook.rateLimitPerMin} requêtes/min.` : 'L’adresse sera générée à l’enregistrement du connecteur.')

  if (!secret) report.push('secret', 'error', 'Aucune connexion sélectionnée : sans secret partagé, toutes les requêtes seraient refusées.')
  else report.push('secret', secret.length >= 32 ? 'ok' : 'warning', secret.length >= 32 ? 'Secret de longueur robuste.' : `Secret de ${secret.length} caractères : générez-en un d’au moins 32 caractères.`)

  if (!connectorId) {
    report.skip(['events', 'mapping'])
    return report.finish([], 0, { message: 'Enregistrez le connecteur pour obtenir l’adresse de réception.', itemsFound: 0 })
  }

  const events = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.connectorId, connectorId))
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(50)
  const accepted = events.filter((event) => event.status === 'accepted')
  const rejected = events.filter((event) => event.status === 'rejected')

  if (events.length === 0) {
    report.push('events', 'warning', 'Aucun événement reçu pour l’instant. Envoyez une requête de test depuis le service émetteur.')
    report.skip(['mapping'])
    return report.finish([], 0, { message: 'En attente du premier événement.' })
  }
  const last = events[0]
  report.push('events', accepted.length > 0 ? (rejected.length > accepted.length ? 'warning' : 'ok') : 'error', `${accepted.length} accepté${accepted.length > 1 ? 's' : ''}, ${rejected.length} rejeté${rejected.length > 1 ? 's' : ''} sur les ${events.length} derniers. Dernier : ${last.status === 'accepted' ? 'accepté' : last.message ?? 'rejeté'} (${last.receivedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC).`)

  const items = accepted.flatMap((event) => (event.item ? [event.item] : []))
  if (items.length === 0) {
    report.push('mapping', 'error', 'Aucun événement accepté : impossible de valider le mapping. Vérifiez la signature et les chemins des champs.')
  } else {
    const withLink = items.filter((item) => item.link).length
    const withDate = items.filter((item) => item.date).length
    report.push('mapping', withLink === 0 ? 'warning' : 'ok', `Titre présent sur 100 % des éléments, lien sur ${Math.round((withLink / items.length) * 100)} %, date sur ${Math.round((withDate / items.length) * 100)} %.`)
  }
  return report.finish(items, accepted.length)
}
