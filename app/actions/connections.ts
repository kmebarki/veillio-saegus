'use server'

import { randomUUID } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { configSchema, defaultConfig, isConnectorKind, needsSecret, type ConnectorConfig, type ConnectorHealth, type ConnectorKind } from '@/lib/connector-catalog'
import { analyzeSecret, analyzeUsername, secretHintOf, SECRET_MAX } from '@/lib/connection-secret'
import type { ConnectionActivityEntry, ConnectionsOverview, ConnectionSummary } from '@/lib/connection-types'
import type { TestOutcome } from '@/lib/connector-types'
import { decryptSecret, encryptSecret } from '@/lib/connectors/crypto'
import { runConnectorTest } from '@/lib/connectors/engine'
import { getDefaultOrganization, requirePermission } from '@/lib/authorization'
import { db } from '@/lib/db'
import { auditEvents, connections, connectors, users } from '@/lib/db/schema'
import { isRateLimited } from '@/lib/rate-limit'

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })

const DAY_MS = 86_400_000
const MAX_CONNECTIONS = 200
const TEST_WINDOW_MS = 10 * 60 * 1000
const TEST_MAX_PER_WINDOW = 30
const EXPIRY_WARNING_DAYS = 14

const nameField = z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.').max(80, 'Le nom ne peut pas dépasser 80 caractères.').transform((value) => value.replace(/\s+/g, ' '))
const descriptionField = z.string().trim().max(240, 'La description ne peut pas dépasser 240 caractères.').optional()
const usernameField = z.string().max(200, 'L’identifiant est trop long.')
const secretField = z.string().max(SECRET_MAX * 2, 'Le secret est trop long.')
const expiryField = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’expiration invalide.'), z.literal(''), z.null()]).optional()
const scopeField = z.enum(['organization', 'user'])

const createSchema = z.object({ connectorId: z.string().uuid(), name: nameField, description: descriptionField, scope: scopeField, username: usernameField.optional(), secret: secretField, expiresAt: expiryField })
const updateSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  name: nameField,
  description: descriptionField,
  username: usernameField.optional(),
  secret: z.object({ mode: z.enum(['keep', 'set']), value: secretField }),
  expiresAt: expiryField,
})
const draftSchema = z.object({ connectorId: z.string().uuid(), connectionId: z.string().uuid().optional(), username: usernameField.optional(), secret: secretField })
const idSchema = z.object({ id: z.string().uuid() })

type Failure = { ok: false; message: string }
const fail = (message: string): Failure => ({ ok: false, message })

type Row = typeof connections.$inferSelect
type ConnectorRow = typeof connectors.$inferSelect

function healthOf(status: string | null): ConnectorHealth {
  return status === 'success' ? 'ok' : status === 'warning' ? 'warning' : status === 'error' ? 'error' : 'unknown'
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function readConfig(kind: ConnectorKind, raw: unknown): ConnectorConfig {
  const parsed = configSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  const stored = (raw ?? {}) as { url?: unknown }
  return { ...defaultConfig(kind), url: typeof stored.url === 'string' ? stored.url : '' }
}

function kindOf(row: ConnectorRow): ConnectorKind {
  return isConnectorKind(row.kind) ? row.kind : 'rss'
}

function audit(actorUserId: string, action: string, connectionId: string, metadata: Record<string, string | number | boolean | null> = {}) {
  return { actorUserId, action, targetType: 'connection', targetId: connectionId, metadata }
}

function revalidateAll() {
  revalidatePath('/admin/connections')
  revalidatePath('/admin/connectors')
}

async function loadConnection(id: string) {
  const [row] = await db.select().from(connections).where(eq(connections.id, id)).limit(1)
  return row ?? null
}

async function loadConnector(id: string) {
  const [row] = await db.select().from(connectors).where(eq(connectors.id, id)).limit(1)
  return row ?? null
}

type Actor = Awaited<ReturnType<typeof requirePermission>>

function canSee(actor: Actor, row: Row) {
  return row.scope === 'organization' || row.ownerUserId === actor.id
}

function canEdit(actor: Actor, row: Row) {
  if (row.scope === 'organization') return actor.permissions.includes('connections.manage')
  return row.ownerUserId === actor.id
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

/** Une date d'expiration vaut jusqu'à la fin de la journée choisie (UTC). */
function parseExpiry(value: string | null | undefined, current: Date | null): { date: Date | null; error?: string } {
  if (!value) return { date: null }
  const date = new Date(`${value}T23:59:59.000Z`)
  if (Number.isNaN(date.getTime())) return { date: null, error: 'Date d’expiration invalide.' }
  const unchanged = current !== null && isoDay(current) === value
  if (!unchanged && date.getTime() < Date.now()) return { date: null, error: 'La date d’expiration est déjà passée.' }
  return { date }
}

function prepareCredentials(config: ConnectorConfig, usernameRaw: string | undefined, secretRaw: string): { error: string } | { secret: string; username: string } {
  const user = analyzeUsername(config.auth.type, usernameRaw ?? '')
  if (user.error) return { error: user.error }
  const analysis = analyzeSecret(config.auth.type, secretRaw)
  if (analysis.empty) return { error: 'Renseignez le secret (clé API, jeton ou mot de passe).' }
  const blocking = analysis.issues.find((issue) => issue.level === 'error')
  if (blocking) return { error: blocking.message }
  return { secret: analysis.value, username: user.value }
}

function toSummary(actor: Actor, row: Row, connectorRow: ConnectorRow, ownerName: string): ConnectionSummary {
  const kind = kindOf(connectorRow)
  const config = readConfig(kind, connectorRow.config)
  const now = Date.now()
  const rotated = row.secretRotatedAt ?? row.createdAt
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    connectorId: connectorRow.id,
    connectorName: connectorRow.name,
    connectorKind: kind,
    connectorUrl: config.url,
    host: hostOf(config.url),
    insecure: config.url.trim().toLowerCase().startsWith('http://'),
    authType: config.auth.type,
    keyName: config.auth.keyName,
    scope: row.scope === 'user' ? 'user' : 'organization',
    ownerName,
    username: row.username ?? '',
    hasSecret: Boolean(row.secretCiphertext),
    secretHint: row.secretHint,
    secretRotatedAt: dateFormatter.format(rotated),
    secretAgeDays: Math.max(0, Math.floor((now - rotated.getTime()) / DAY_MS)),
    expiresAt: row.expiresAt ? isoDay(row.expiresAt) : null,
    expiresInDays: row.expiresAt ? Math.ceil((row.expiresAt.getTime() - now) / DAY_MS) : null,
    health: healthOf(row.lastCheckStatus),
    version: row.version,
    lastCheckAt: row.lastCheckAt ? dateTimeFormatter.format(row.lastCheckAt) : null,
    lastCheckMessage: row.lastCheckMessage,
    testedCurrentVersion: row.lastCheckVersion === row.version,
    canEdit: canEdit(actor, row),
    createdAt: dateTimeFormatter.format(row.createdAt),
    updatedAt: dateTimeFormatter.format(row.updatedAt),
  }
}

export async function getConnectionsOverview(): Promise<ConnectionsOverview> {
  const actor = await requirePermission('connections.view')
  const organization = await getDefaultOrganization()
  if (!organization) {
    return { viewer: { id: actor.id, canManage: false }, organizationName: 'Votre organisation', connections: [], connectors: [], stats: { total: 0, shared: 0, personal: 0, attention: 0 } }
  }

  const [connectorRows, connectionRows, userRows] = await Promise.all([
    db.select().from(connectors).where(eq(connectors.organizationId, organization.id)).orderBy(connectors.name),
    db.select().from(connections).where(eq(connections.organizationId, organization.id)).orderBy(connections.name),
    db.select({ id: users.id, name: users.name }).from(users),
  ])

  const connectorById = new Map(connectorRows.map((row) => [row.id, row]))
  const names = new Map(userRows.map((row) => [row.id, row.name]))
  const sharedCounts = new Map<string, number>()
  for (const row of connectionRows) if (row.scope === 'organization') sharedCounts.set(row.connectorId, (sharedCounts.get(row.connectorId) ?? 0) + 1)

  const summaries = connectionRows
    .filter((row) => canSee(actor, row))
    .flatMap((row) => {
      const connectorRow = connectorById.get(row.connectorId)
      if (!connectorRow) return []
      return [toSummary(actor, row, connectorRow, row.ownerUserId ? (names.get(row.ownerUserId) ?? 'Utilisateur') : 'Organisation')]
    })

  const choices = connectorRows.flatMap((row) => {
    const kind = kindOf(row)
    const config = readConfig(kind, row.config)
    return [
      {
        id: row.id,
        name: row.name,
        kind,
        status: (['draft', 'active', 'paused'].includes(row.status) ? row.status : 'draft') as 'draft' | 'active' | 'paused',
        authType: config.auth.type,
        requiresAuth: needsSecret(config.auth.type),
        keyName: config.auth.keyName,
        host: hostOf(config.url),
        insecure: config.url.trim().toLowerCase().startsWith('http://'),
        sharedCount: sharedCounts.get(row.id) ?? 0,
      },
    ]
  })

  return {
    viewer: { id: actor.id, canManage: actor.permissions.includes('connections.manage') },
    organizationName: organization.name,
    connections: summaries,
    connectors: choices,
    stats: {
      total: summaries.length,
      shared: summaries.filter((item) => item.scope === 'organization').length,
      personal: summaries.filter((item) => item.scope === 'user').length,
      attention: summaries.filter((item) => item.health === 'error' || item.health === 'warning' || !item.testedCurrentVersion || (item.expiresInDays !== null && item.expiresInDays <= EXPIRY_WARNING_DAYS)).length,
    },
  }
}

export async function createConnection(input: unknown): Promise<{ ok: true; message: string; id: string } | Failure> {
  const actor = await requirePermission('connections.view')
  const organization = await getDefaultOrganization()
  if (!organization) return fail('Aucune organisation n’est configurée.')

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Les informations saisies sont invalides.')
  const { connectorId, name, scope } = parsed.data

  if (scope === 'organization' && !actor.permissions.includes('connections.manage')) return fail('Vous n’avez pas le droit de créer une connexion partagée.')

  const connectorRow = await loadConnector(connectorId)
  if (!connectorRow || connectorRow.organizationId !== organization.id) return fail('Connecteur introuvable.')
  const config = readConfig(kindOf(connectorRow), connectorRow.config)
  if (!needsSecret(config.auth.type)) return fail('Ce connecteur n’utilise aucune authentification : aucune connexion n’est nécessaire.')

  const credentials = prepareCredentials(config, parsed.data.username, parsed.data.secret)
  if ('error' in credentials) return fail(credentials.error)
  const expiry = parseExpiry(parsed.data.expiresAt, null)
  if (expiry.error) return fail(expiry.error)

  const existing = await db.select({ id: connections.id, name: connections.name }).from(connections).where(eq(connections.organizationId, organization.id))
  if (existing.length >= MAX_CONNECTIONS) return fail(`Limite de ${MAX_CONNECTIONS} connexions atteinte.`)
  if (existing.some((item) => item.name.toLowerCase() === name.toLowerCase())) return fail('Une connexion porte déjà ce nom.')

  const id = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(connections).values({
      id,
      organizationId: organization.id,
      connectorId,
      name,
      description: parsed.data.description || null,
      scope,
      ownerUserId: scope === 'user' ? actor.id : null,
      username: credentials.username || null,
      secretCiphertext: encryptSecret(credentials.secret, id),
      secretHint: secretHintOf(credentials.secret),
      secretRotatedAt: new Date(),
      expiresAt: expiry.date,
      createdByUserId: actor.id,
    })
    await tx.insert(auditEvents).values(audit(actor.id, 'connection.created', id, { scope, connectorId }))
  })

  revalidateAll()
  return { ok: true, message: 'Connexion créée.', id }
}

export async function updateConnection(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('connections.view')
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Les informations saisies sont invalides.')
  const row = await loadConnection(parsed.data.id)
  if (!row || !canSee(actor, row)) return fail('Connexion introuvable.')
  if (!canEdit(actor, row)) return fail('Vous n’avez pas le droit de modifier cette connexion.')
  if (row.version !== parsed.data.version) return fail('Cette connexion a été modifiée entre-temps. Rechargez la page.')

  const connectorRow = await loadConnector(row.connectorId)
  if (!connectorRow) return fail('Le connecteur associé est introuvable.')
  const config = readConfig(kindOf(connectorRow), connectorRow.config)

  const name = parsed.data.name
  const duplicates = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.organizationId, row.organizationId), sql`lower(${connections.name}) = lower(${name})`, sql`${connections.id} <> ${row.id}`))
    .limit(1)
  if (duplicates.length) return fail('Une connexion porte déjà ce nom.')

  const replacing = parsed.data.secret.mode === 'set'
  let username = analyzeUsername(config.auth.type, parsed.data.username ?? '')
  let newSecret = ''
  if (replacing) {
    const credentials = prepareCredentials(config, parsed.data.username, parsed.data.secret.value)
    if ('error' in credentials) return fail(credentials.error)
    newSecret = credentials.secret
    username = { value: credentials.username, error: null }
  } else if (username.error) {
    return fail(username.error)
  }
  const expiry = parseExpiry(parsed.data.expiresAt, row.expiresAt)
  if (expiry.error) return fail(expiry.error)

  const credentialsChanged = replacing || username.value !== (row.username ?? '')
  const updated = await db
    .update(connections)
    .set({
      name,
      description: parsed.data.description || null,
      username: username.value || null,
      secretCiphertext: replacing ? encryptSecret(newSecret, row.id) : row.secretCiphertext,
      secretHint: replacing ? secretHintOf(newSecret) : row.secretHint,
      secretRotatedAt: replacing ? new Date() : row.secretRotatedAt,
      expiresAt: expiry.date,
      version: credentialsChanged ? row.version + 1 : row.version,
      updatedAt: new Date(),
    })
    .where(and(eq(connections.id, row.id), eq(connections.version, row.version)))
    .returning({ id: connections.id })
  if (!updated.length) return fail('Cette connexion a été modifiée entre-temps. Rechargez la page.')

  await db.insert(auditEvents).values(audit(actor.id, replacing ? 'connection.secret_rotated' : credentialsChanged ? 'connection.credentials_changed' : 'connection.updated', row.id, {}))
  revalidateAll()
  return { ok: true, message: replacing ? 'Secret remplacé. Relancez un test pour valider.' : credentialsChanged ? 'Identifiant mis à jour. Relancez un test.' : 'Connexion mise à jour.' }
}

export async function deleteConnection(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('connections.view')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Connexion invalide.')
  const row = await loadConnection(parsed.data.id)
  if (!row || !canSee(actor, row)) return fail('Connexion introuvable.')
  if (!canEdit(actor, row)) return fail('Vous n’avez pas le droit de supprimer cette connexion.')

  await db.transaction(async (tx) => {
    await tx.delete(connections).where(eq(connections.id, row.id))
    await tx.insert(auditEvents).values(audit(actor.id, 'connection.deleted', row.id, { scope: row.scope }))
  })
  revalidateAll()
  return { ok: true, message: 'Connexion supprimée.' }
}

function unreadableSecretOutcome(): TestOutcome {
  return {
    status: 'error',
    message: 'Le secret enregistré est illisible. Saisissez-le à nouveau.',
    httpStatus: null,
    durationMs: 0,
    itemsFound: null,
    checks: [{ id: 'url', label: 'Identifiants', status: 'error', detail: 'Remplacez le secret de cette connexion.' }],
    sample: [],
  }
}

async function tooManyTests(actor: Actor) {
  return isRateLimited({ actorUserId: actor.id, actions: ['connection.tested'], windowMs: TEST_WINDOW_MS, max: TEST_MAX_PER_WINDOW })
}

export async function testConnection(input: unknown): Promise<{ ok: true; outcome: TestOutcome; message: string } | Failure> {
  const actor = await requirePermission('connections.view')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Connexion invalide.')
  const row = await loadConnection(parsed.data.id)
  if (!row || !canSee(actor, row)) return fail('Connexion introuvable.')
  if (!canEdit(actor, row)) return fail('Vous n’avez pas le droit de tester cette connexion.')
  if (await tooManyTests(actor)) return fail(`Trop de tests en peu de temps (${TEST_MAX_PER_WINDOW} par 10 minutes). Patientez un instant.`)

  const connectorRow = await loadConnector(row.connectorId)
  if (!connectorRow) return fail('Le connecteur associé est introuvable.')
  const kind = kindOf(connectorRow)
  const config = readConfig(kind, connectorRow.config)

  const secret = decryptSecret(row.secretCiphertext, row.id)
  const outcome = secret ? await runConnectorTest(kind, config, secret, row.username ?? '') : unreadableSecretOutcome()

  await db.transaction(async (tx) => {
    await tx
      .update(connections)
      .set({ lastCheckAt: new Date(), lastCheckStatus: outcome.status, lastCheckMessage: outcome.message, lastCheckVersion: row.version, ...(secret && !row.secretHint ? { secretHint: secretHintOf(secret) } : {}) })
      .where(eq(connections.id, row.id))
    await tx.insert(auditEvents).values(audit(actor.id, 'connection.tested', row.id, { status: outcome.status, host: hostOf(config.url), draft: false }))
  })

  revalidateAll()
  return { ok: true, outcome, message: outcome.message }
}

/** Teste des identifiants saisis (ou, si le secret est laissé vide, ceux déjà enregistrés) sans rien enregistrer. */
export async function testDraftConnection(input: unknown): Promise<{ ok: true; outcome: TestOutcome } | Failure> {
  const actor = await requirePermission('connections.view')
  const organization = await getDefaultOrganization()
  if (!organization) return fail('Aucune organisation n’est configurée.')
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Les informations saisies sont invalides.')

  const connectorRow = await loadConnector(parsed.data.connectorId)
  if (!connectorRow || connectorRow.organizationId !== organization.id) return fail('Connecteur introuvable.')
  const kind = kindOf(connectorRow)
  const config = readConfig(kind, connectorRow.config)
  if (!needsSecret(config.auth.type)) return fail('Ce connecteur n’utilise aucune authentification.')

  let secret: string
  let username: string
  if (parsed.data.secret.trim() === '' && parsed.data.connectionId) {
    const row = await loadConnection(parsed.data.connectionId)
    if (!row || row.connectorId !== connectorRow.id || !canSee(actor, row) || !canEdit(actor, row)) return fail('Connexion introuvable.')
    const stored = decryptSecret(row.secretCiphertext, row.id)
    if (!stored) return fail('Le secret enregistré est illisible. Saisissez-le à nouveau.')
    const user = analyzeUsername(config.auth.type, parsed.data.username ?? row.username ?? '')
    if (user.error) return fail(user.error)
    secret = stored
    username = user.value
  } else {
    const credentials = prepareCredentials(config, parsed.data.username, parsed.data.secret)
    if ('error' in credentials) return fail(credentials.error)
    secret = credentials.secret
    username = credentials.username
  }

  if (await tooManyTests(actor)) return fail(`Trop de tests en peu de temps (${TEST_MAX_PER_WINDOW} par 10 minutes). Patientez un instant.`)

  const outcome = await runConnectorTest(kind, config, secret, username)
  await db.insert(auditEvents).values(audit(actor.id, 'connection.tested', parsed.data.connectionId ?? connectorRow.id, { status: outcome.status, host: hostOf(config.url), draft: true }))
  return { ok: true, outcome }
}

const ACTIVITY_LABELS: Record<string, string> = {
  'connection.created': 'Connexion créée',
  'connection.updated': 'Paramètres modifiés',
  'connection.credentials_changed': 'Identifiant modifié',
  'connection.secret_rotated': 'Secret remplacé',
  'connection.tested': 'Test de la connexion',
  'connection.deleted': 'Connexion supprimée',
}

const TEST_STATUS_LABELS: Record<string, string> = { success: 'réussi', warning: 'avec réserves', error: 'en échec' }

export async function getConnectionActivity(input: unknown): Promise<{ ok: true; entries: ConnectionActivityEntry[] } | Failure> {
  const actor = await requirePermission('connections.view')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Connexion invalide.')
  const row = await loadConnection(parsed.data.id)
  if (!row || !canSee(actor, row)) return fail('Connexion introuvable.')

  const events = await db
    .select({ id: auditEvents.id, action: auditEvents.action, metadata: auditEvents.metadata, createdAt: auditEvents.createdAt, actor: users.name })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(and(eq(auditEvents.targetType, 'connection'), eq(auditEvents.targetId, row.id)))
    .orderBy(desc(auditEvents.id))
    .limit(12)

  return {
    ok: true,
    entries: events.map((event) => {
      const status = typeof event.metadata.status === 'string' ? (TEST_STATUS_LABELS[event.metadata.status] ?? event.metadata.status) : ''
      return {
        id: event.id,
        label: ACTIVITY_LABELS[event.action] ?? event.action,
        detail: event.action === 'connection.tested' ? `${status}${event.metadata.draft ? ' (avant enregistrement)' : ''}` : '',
        actor: event.actor ?? 'Utilisateur',
        at: dateTimeFormatter.format(event.createdAt),
      }
    }),
  }
}
