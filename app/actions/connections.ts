'use server'

import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { configSchema, defaultConfig, isConnectorKind, needsSecret, type ConnectorConfig, type ConnectorHealth, type ConnectorKind } from '@/lib/connector-catalog'
import type { ConnectionsOverview, ConnectionSummary } from '@/lib/connection-types'
import type { TestOutcome } from '@/lib/connector-types'
import { decryptSecret, encryptSecret } from '@/lib/connectors/crypto'
import { runConnectorTest } from '@/lib/connectors/engine'
import { getDefaultOrganization, requirePermission } from '@/lib/authorization'
import { db } from '@/lib/db'
import { auditEvents, connections, connectors, users } from '@/lib/db/schema'
import { isRateLimited } from '@/lib/rate-limit'

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const MAX_CONNECTIONS = 200
const TEST_WINDOW_MS = 10 * 60 * 1000
const TEST_MAX_PER_WINDOW = 30
const SECRET_MAX = 4096

const nameField = z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.').max(80, 'Le nom ne peut pas dépasser 80 caractères.').transform((value) => value.replace(/\s+/g, ' '))
const usernameField = z.string().trim().max(200, 'L’identifiant est trop long.')
const secretField = z.string().max(SECRET_MAX, 'Le secret est trop long.')
const scopeField = z.enum(['organization', 'user'])

const createSchema = z.object({ connectorId: z.string().uuid(), name: nameField, scope: scopeField, username: usernameField.optional(), secret: secretField })
const updateSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  name: nameField,
  username: usernameField.optional(),
  secret: z.object({ mode: z.enum(['keep', 'set']), value: secretField }),
})
const idSchema = z.object({ id: z.string().uuid() })

type Failure = { ok: false; message: string }
const fail = (message: string): Failure => ({ ok: false, message })

type Row = typeof connections.$inferSelect

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

function toSummary(actor: Actor, row: Row, connectorRow: typeof connectors.$inferSelect, ownerName: string): ConnectionSummary {
  const kind: ConnectorKind = isConnectorKind(connectorRow.kind) ? connectorRow.kind : 'rss'
  const config = readConfig(kind, connectorRow.config)
  return {
    id: row.id,
    name: row.name,
    connectorId: connectorRow.id,
    connectorName: connectorRow.name,
    connectorKind: kind,
    authType: config.auth.type,
    keyName: config.auth.keyName,
    scope: row.scope === 'user' ? 'user' : 'organization',
    ownerName,
    username: row.username ?? '',
    hasSecret: Boolean(row.secretCiphertext),
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

  const summaries = connectionRows
    .filter((row) => canSee(actor, row))
    .flatMap((row) => {
      const connectorRow = connectorById.get(row.connectorId)
      if (!connectorRow) return []
      return [toSummary(actor, row, connectorRow, row.ownerUserId ? (names.get(row.ownerUserId) ?? 'Utilisateur') : 'Organisation')]
    })

  const choices = connectorRows.flatMap((row) => {
    const kind: ConnectorKind = isConnectorKind(row.kind) ? row.kind : 'rss'
    const config = readConfig(kind, row.config)
    if (!needsSecret(config.auth.type)) return []
    return [
      {
        id: row.id,
        name: row.name,
        kind,
        status: (['draft', 'active', 'paused'].includes(row.status) ? row.status : 'draft') as 'draft' | 'active' | 'paused',
        authType: config.auth.type,
        keyName: config.auth.keyName,
        host: hostOf(config.url),
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
      attention: summaries.filter((item) => item.health === 'error' || item.health === 'warning' || !item.testedCurrentVersion).length,
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
  const username = (parsed.data.username ?? '').trim()
  const secret = parsed.data.secret.trim()

  if (scope === 'organization' && !actor.permissions.includes('connections.manage')) return fail('Vous n’avez pas le droit de créer une connexion partagée.')

  const connectorRow = await loadConnector(connectorId)
  if (!connectorRow || connectorRow.organizationId !== organization.id) return fail('Connecteur introuvable.')
  const kind: ConnectorKind = isConnectorKind(connectorRow.kind) ? connectorRow.kind : 'rss'
  const config = readConfig(kind, connectorRow.config)
  if (!needsSecret(config.auth.type)) return fail('Ce connecteur n’utilise aucune authentification : aucune connexion n’est nécessaire.')
  if (!secret) return fail('Renseignez le secret (clé API, jeton ou mot de passe).')
  if (config.auth.type === 'basic' && !username) return fail('Renseignez l’identifiant (nom d’utilisateur).')

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
      scope,
      ownerUserId: scope === 'user' ? actor.id : null,
      username: username || null,
      secretCiphertext: encryptSecret(secret, id),
      createdByUserId: actor.id,
    })
    await tx.insert(auditEvents).values(audit(actor.id, 'connection.created', id, { scope, connectorId }))
  })

  revalidateAll()
  return { ok: true, message: 'Connexion créée. Testez-la pour vérifier les identifiants.', id }
}

export async function updateConnection(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('connections.view')
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Les informations saisies sont invalides.')
  const row = await loadConnection(parsed.data.id)
  if (!row || !canSee(actor, row)) return fail('Connexion introuvable.')
  if (!canEdit(actor, row)) return fail('Vous n’avez pas le droit de modifier cette connexion.')
  if (row.version !== parsed.data.version) return fail('Cette connexion a été modifiée entre-temps. Rechargez la page.')

  const name = parsed.data.name
  const username = (parsed.data.username ?? '').trim()
  const duplicates = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.organizationId, row.organizationId), sql`lower(${connections.name}) = lower(${name})`, sql`${connections.id} <> ${row.id}`))
    .limit(1)
  if (duplicates.length) return fail('Une connexion porte déjà ce nom.')

  const newSecret = parsed.data.secret.mode === 'set' ? parsed.data.secret.value.trim() : ''
  if (parsed.data.secret.mode === 'set' && !newSecret) return fail('Le nouveau secret est vide.')

  const credentialsChanged = Boolean(newSecret) || username !== (row.username ?? '')
  const updated = await db
    .update(connections)
    .set({
      name,
      username: username || null,
      secretCiphertext: newSecret ? encryptSecret(newSecret, row.id) : row.secretCiphertext,
      version: credentialsChanged ? row.version + 1 : row.version,
      updatedAt: new Date(),
    })
    .where(and(eq(connections.id, row.id), eq(connections.version, row.version)))
    .returning({ id: connections.id })
  if (!updated.length) return fail('Cette connexion a été modifiée entre-temps. Rechargez la page.')

  await db.insert(auditEvents).values(audit(actor.id, credentialsChanged ? 'connection.credentials_changed' : 'connection.updated', row.id, {}))
  revalidateAll()
  return { ok: true, message: credentialsChanged ? 'Identifiants mis à jour. Relancez un test.' : 'Connexion mise à jour.' }
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

export async function testConnection(input: unknown): Promise<{ ok: true; outcome: TestOutcome; message: string } | Failure> {
  const actor = await requirePermission('connections.view')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Connexion invalide.')
  const row = await loadConnection(parsed.data.id)
  if (!row || !canSee(actor, row)) return fail('Connexion introuvable.')
  if (!canEdit(actor, row)) return fail('Vous n’avez pas le droit de tester cette connexion.')
  if (await isRateLimited({ actorUserId: actor.id, actions: ['connection.tested'], windowMs: TEST_WINDOW_MS, max: TEST_MAX_PER_WINDOW })) {
    return fail(`Trop de tests en peu de temps (${TEST_MAX_PER_WINDOW} par 10 minutes). Patientez un instant.`)
  }

  const connectorRow = await loadConnector(row.connectorId)
  if (!connectorRow) return fail('Le connecteur associé est introuvable.')
  const kind: ConnectorKind = isConnectorKind(connectorRow.kind) ? connectorRow.kind : 'rss'
  const config = readConfig(kind, connectorRow.config)

  const secret = decryptSecret(row.secretCiphertext, row.id)
  const outcome: TestOutcome = secret
    ? await runConnectorTest(kind, config, secret, row.username ?? '')
    : {
        status: 'error',
        message: 'Le secret enregistré est illisible. Saisissez-le à nouveau.',
        httpStatus: null,
        durationMs: 0,
        itemsFound: null,
        checks: [{ id: 'url', label: 'Identifiants', status: 'error', detail: 'Remplacez le secret de cette connexion.' }],
        sample: [],
      }

  await db.transaction(async (tx) => {
    await tx.update(connections).set({ lastCheckAt: new Date(), lastCheckStatus: outcome.status, lastCheckMessage: outcome.message, lastCheckVersion: row.version }).where(eq(connections.id, row.id))
    await tx.insert(auditEvents).values(audit(actor.id, 'connection.tested', row.id, { status: outcome.status, host: hostOf(config.url) }))
  })

  revalidateAll()
  return { ok: true, outcome, message: outcome.message }
}
