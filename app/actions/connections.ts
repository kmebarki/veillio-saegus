'use server'

import { randomUUID } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { configSchema, defaultConfig, isConnectorKind, needsSecret, type ConnectorConfig, type ConnectorHealth, type ConnectorKind } from '@/lib/connector-catalog'
import { analyzeSecret, analyzeUsername, secretHintOf, SECRET_MAX } from '@/lib/connection-secret'
import type { ConnectionActivityEntry, ConnectionsOverview, ConnectionSummary } from '@/lib/connection-types'
import type { TestOutcome } from '@/lib/connector-types'
import { runConnectorTest } from '@/lib/connectors/engine'
import { activatePreparedSecret, putSecret, readLegacySecret, readSecret, revokeSecret } from '@/lib/authentication/vault'
import { getDefaultOrganization, requirePermission } from '@/lib/authorization'
import { evaluateConnectionRuntime, resolveOperationalRuntime } from '@/lib/connections/registry'
import { db } from '@/lib/db'
import { auditEvents, connectionSecretBindings, connectionTestJobs, connections, connectors, sources, users } from '@/lib/db/schema'
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
const scopeField = z.enum(['private', 'organization'])
const logoField = z
  .string()
  .trim()
  .max(150_000, 'Le logo est trop volumineux.')
  .refine(
    (value) => value === '' || (value.length <= 500 && /^https:\/\/[^\s"'<>]+$/.test(value)) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value),
    'Le logo doit être une image importée ou une adresse https valide.',
  )
  .optional()

const createSchema = z.object({ connectorId: z.string().uuid(), name: nameField, description: descriptionField, logoUrl: logoField, scope: scopeField, username: usernameField.optional(), secret: secretField, expiresAt: expiryField })
const updateSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  name: nameField,
  description: descriptionField,
  logoUrl: logoField,
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

function methodIdForAuth(authType: ConnectorConfig['auth']['type']) {
  const methods: Partial<Record<ConnectorConfig['auth']['type'], string>> = {
    none: 'NONE', basic: 'BASIC_AUTH', bearer: 'BEARER_TOKEN', api_key_header: 'API_KEY', api_key_query: 'API_KEY', oauth_client: 'OAUTH2_CLIENT',
  }
  return methods[authType] ?? 'CUSTOM'
}

function serviceIdOf(row: ConnectorRow) {
  const integration = (row.config as { integration?: { templateId?: unknown } }).integration
  return typeof integration?.templateId === 'string' && integration.templateId ? integration.templateId : `custom:${kindOf(row)}`
}

function adapterVersionOf(row: ConnectorRow) {
  const integration = (row.config as { integration?: { adapterVersion?: unknown } }).integration
  return typeof integration?.adapterVersion === 'string' && integration.adapterVersion ? integration.adapterVersion : '1.0.0'
}

async function runtimeDecisionFor(row: ConnectorRow, methodId: string) {
  return resolveOperationalRuntime({
    methodId,
    serviceId: serviceIdOf(row),
    adapterId: kindOf(row),
    adapterVersion: adapterVersionOf(row),
  })
}

function hasCapability(actor: Actor, capability: string) {
  return actor.permissions.includes(capability) || actor.permissions.includes('connections.manage')
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
  return row.scope !== 'private' || row.ownerUserId === actor.id
}

function canEdit(actor: Actor, row: Row) {
  if (row.lifecycle === 'archived') return false
  if (row.scope !== 'private') return actor.permissions.includes('connections.manage')
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
    logoUrl: row.logoUrl ?? '',
    connectorId: connectorRow.id,
    connectorName: connectorRow.name,
    connectorLogoUrl: connectorRow.logoUrl ?? '',
    connectorKind: kind,
    connectorUrl: config.url,
    host: hostOf(config.url),
    insecure: config.url.trim().toLowerCase().startsWith('http://'),
    authType: config.auth.type,
    keyName: config.auth.keyName,
    scope: row.scope === 'private' || row.scope === 'public' ? row.scope : 'organization',
    lifecycle: (['draft', 'active', 'suspended', 'archived'].includes(row.lifecycle) ? row.lifecycle : 'draft') as ConnectionSummary['lifecycle'],
    connectionHealth: (['unverified', 'running', 'healthy', 'degraded', 'error', 'expired', 'indeterminate'].includes(row.health) ? row.health : 'unverified') as ConnectionSummary['connectionHealth'],
    origin: (['manual', 'source', 'automatic_none', 'migration'].includes(row.origin) ? row.origin : 'migration') as ConnectionSummary['origin'],
    revision: row.revision,
    technicalRevision: row.technicalRevision,
    ownerName,
    username: row.username ?? '',
    hasSecret: Boolean(row.secretRef || row.secretCiphertext),
    methodId: row.methodId ?? methodIdForAuth(config.auth.type),
    methodVersion: row.methodVersion ?? '1.0.0',
    adapterId: row.adapterId ?? connectorRow.kind,
    adapterVersion: row.adapterVersion ?? String(connectorRow.version),
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
  for (const row of connectionRows) if (row.scope !== 'private') sharedCounts.set(row.connectorId, (sharedCounts.get(row.connectorId) ?? 0) + 1)

  const summaries = connectionRows
    .filter((row) => canSee(actor, row))
    .flatMap((row) => {
      const connectorRow = connectorById.get(row.connectorId)
      if (!connectorRow) return []
      return [toSummary(actor, row, connectorRow, row.ownerUserId ? (names.get(row.ownerUserId) ?? 'Utilisateur') : 'Organisation')]
    })

  const choices = await Promise.all(connectorRows.map(async (row) => {
    const kind = kindOf(row)
    const config = readConfig(kind, row.config)
    const requiresAuth = needsSecret(config.auth.type)
    const runtime = requiresAuth ? await runtimeDecisionFor(row, methodIdForAuth(config.auth.type)) : { usable: true, reasons: [] as string[] }
    return {
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl ?? '',
      kind,
      status: (['draft', 'active', 'paused'].includes(row.status) ? row.status : 'draft') as 'draft' | 'active' | 'paused',
      authType: config.auth.type,
      requiresAuth,
      keyName: config.auth.keyName,
      host: hostOf(config.url),
      insecure: config.url.trim().toLowerCase().startsWith('http://'),
      sharedCount: sharedCounts.get(row.id) ?? 0,
      runtimeAvailable: runtime.usable,
      runtimeReason: runtime.usable ? 'Runtime disponible' : runtime.reasons.join(', '),
    }
  }))

  return {
    viewer: { id: actor.id, canManage: actor.permissions.includes('connections.manage') },
    organizationName: organization.name,
    connections: summaries,
    connectors: choices,
    stats: {
      total: summaries.length,
      shared: summaries.filter((item) => item.scope !== 'private').length,
      personal: summaries.filter((item) => item.scope === 'private').length,
      attention: summaries.filter((item) => item.health === 'error' || item.health === 'warning' || !item.testedCurrentVersion || (item.expiresInDays !== null && item.expiresInDays <= EXPIRY_WARNING_DAYS)).length,
    },
  }
}

export async function createConnection(input: unknown): Promise<{ ok: true; message: string; id: string } | Failure> {
  const actor = await requirePermission('connections.view')
  const organization = await getDefaultOrganization()
  if (!organization) return fail('Aucune organisation n’est configurée.')
  if (!hasCapability(actor, 'connections.create')) return fail('Vous n’avez pas la capacité de créer une Connexion.')

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Les informations saisies sont invalides.')
  const { connectorId, name, scope } = parsed.data

  if (scope !== 'private' && !actor.permissions.includes('connections.manage')) return fail('Vous n’avez pas le droit de créer une connexion partagée ou publique.')

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
  const methodId = methodIdForAuth(config.auth.type)
  const adapterId = kindOf(connectorRow)
  const adapterVersion = adapterVersionOf(connectorRow)
  const serviceId = serviceIdOf(connectorRow)
  const runtime = await runtimeDecisionFor(connectorRow, methodId)
  if (!runtime.usable || !runtime.methodVersion) return fail(`Cette méthode n’est pas disponible au runtime : ${runtime.reasons.join(', ')}.`)
  const methodVersion = runtime.methodVersion

  const secretRef = await putSecret({ organizationId: organization.id, connectionId: id, fieldCode: 'credential', purpose: 'create', ownerUserId: scope === 'private' ? actor.id : null, plaintext: credentials.secret, hint: secretHintOf(credentials.secret) })
  await db.transaction(async (tx) => {
    await tx.insert(connections).values({
      id,
      organizationId: organization.id,
      connectorId,
      serviceId,
      name,
      description: parsed.data.description || null,
      logoUrl: parsed.data.logoUrl || null,
      scope,
      ownerUserId: scope === 'private' ? actor.id : null,
      ownerKind: scope === 'private' ? 'user' : 'organization',
      ownerId: scope === 'private' ? actor.id : organization.id,
      lifecycle: 'active',
      health: 'unverified',
      origin: 'manual',
      username: credentials.username || null,
      config: credentials.username ? { username: credentials.username } : {},
      secretRef,
      methodId,
      methodVersion,
      adapterId,
      adapterVersion,
      handlerKey: runtime.handlerKey,
      handlerVersion: runtime.handlerVersion,
      secretCiphertext: null,
      secretHint: secretHintOf(credentials.secret),
      secretRotatedAt: new Date(),
      expiresAt: expiry.date,
      createdByUserId: actor.id,
    })
    await tx.insert(connectionSecretBindings).values({ connectionId: id, fieldCode: 'credential', secretRef, generation: 1, state: 'active' })
    await tx.insert(auditEvents).values(audit(actor.id, 'connection.created', id, { scope, connectorId, serviceId, methodId, methodVersion, adapterId, adapterVersion }))
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
  if (!hasCapability(actor, replacing ? 'connections.rotate' : 'connections.create')) return fail('Vous n’avez pas la capacité de modifier ces paramètres.')
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
  const operationId = replacing ? randomUUID() : null
  const preparedSecretRef = replacing
    ? await putSecret({ organizationId: row.organizationId, connectionId: row.id, fieldCode: 'credential', purpose: 'rotate', ownerUserId: row.ownerUserId, plaintext: newSecret, hint: secretHintOf(newSecret), operationId, state: 'prepared' })
    : null

  if (preparedSecretRef) {
    const activated = await activatePreparedSecret(preparedSecretRef, { organizationId: row.organizationId, connectionId: row.id, fieldCode: 'credential', purpose: 'rotate' })
    if (!activated) return fail('Le nouveau secret n’a pas pu être préparé. Aucun changement n’a été appliqué.')
  }

  const nextSecretRef = preparedSecretRef ?? row.secretRef
  const updated = await db.transaction(async (tx) => {
    const result = await tx
      .update(connections)
      .set({
        name,
        description: parsed.data.description || null,
        logoUrl: parsed.data.logoUrl || null,
        username: username.value || null,
        config: username.value ? { ...row.config, username: username.value } : row.config,
        secretRef: nextSecretRef,
        secretCiphertext: replacing ? null : row.secretCiphertext,
        secretHint: replacing ? secretHintOf(newSecret) : row.secretHint,
        secretRotatedAt: replacing ? new Date() : row.secretRotatedAt,
        expiresAt: expiry.date,
        version: row.version + 1,
        revision: row.revision + 1,
        technicalRevision: credentialsChanged ? row.technicalRevision + 1 : row.technicalRevision,
        health: credentialsChanged ? 'unverified' : row.health,
        lastValidatedMethodVersion: credentialsChanged ? null : row.lastValidatedMethodVersion,
        lastValidatedAdapterVersion: credentialsChanged ? null : row.lastValidatedAdapterVersion,
        updatedAt: new Date(),
      })
      .where(and(eq(connections.id, row.id), eq(connections.version, row.version)))
      .returning({ id: connections.id })

    if (result.length && preparedSecretRef) {
      await tx.update(connectionSecretBindings).set({ state: 'retired', updatedAt: new Date() }).where(and(eq(connectionSecretBindings.connectionId, row.id), eq(connectionSecretBindings.state, 'active')))
      await tx.insert(connectionSecretBindings).values({ connectionId: row.id, fieldCode: 'credential', secretRef: preparedSecretRef, generation: row.technicalRevision + 1, state: 'active' })
    }
    return result
  })

  if (!updated.length) {
    if (preparedSecretRef) await revokeSecret(preparedSecretRef, { organizationId: row.organizationId, connectionId: row.id, fieldCode: 'credential', purpose: 'rotate' })
    return fail('Cette connexion a été modifiée entre-temps. Rechargez la page.')
  }

  if (preparedSecretRef && row.secretRef) await revokeSecret(row.secretRef, { organizationId: row.organizationId, connectionId: row.id, fieldCode: 'credential', purpose: 'rotate' })
  await db.insert(auditEvents).values(audit(actor.id, replacing ? 'connection.secret_rotated' : credentialsChanged ? 'connection.credentials_changed' : 'connection.updated', row.id, { revision: row.revision + 1, technicalRevision: credentialsChanged ? row.technicalRevision + 1 : row.technicalRevision }))
  revalidateAll()
  return { ok: true, message: replacing ? 'Secret remplacé. Relancez un test pour valider.' : credentialsChanged ? 'Identifiant mis à jour. Relancez un test.' : 'Connexion mise à jour.' }
}

export async function deleteConnection(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('connections.view')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Connexion invalide.')
  const row = await loadConnection(parsed.data.id)
  if (!row || !canSee(actor, row)) return fail('Connexion introuvable.')
  if (!canEdit(actor, row) || !hasCapability(actor, 'connections.archive')) return fail('Vous n’avez pas la capacité d’archiver cette Connexion.')

  const [dependentSource] = await db.select({ id: sources.id }).from(sources).where(eq(sources.connectionId, row.id)).limit(1)
  if (dependentSource) return fail('Cette connexion est utilisée par une Source. Retirez d’abord cette dépendance.')

  const [archived] = await db
    .update(connections)
    .set({ lifecycle: 'archived', revision: row.revision + 1, version: row.version + 1, updatedAt: new Date() })
    .where(and(eq(connections.id, row.id), eq(connections.version, row.version)))
    .returning({ id: connections.id })
  if (!archived) return fail('Cette connexion a été modifiée entre-temps. Rechargez la page.')

  await db.insert(auditEvents).values(audit(actor.id, 'connection.archived', row.id, { scope: row.scope, revision: row.revision + 1 }))
  revalidateAll()
  return { ok: true, message: 'Connexion archivée.' }
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
  if (!canEdit(actor, row) || !hasCapability(actor, 'connections.test')) return fail('Vous n’avez pas la capacité de tester cette Connexion.')
  if (await tooManyTests(actor)) return fail(`Trop de tests en peu de temps (${TEST_MAX_PER_WINDOW} par 10 minutes). Patientez un instant.`)

  const connectorRow = await loadConnector(row.connectorId)
  if (!connectorRow) return fail('Le connecteur associé est introuvable.')
  const kind = kindOf(connectorRow)
  const config = readConfig(kind, connectorRow.config)
  const runtime = await evaluateConnectionRuntime({ methodId: row.methodId ?? methodIdForAuth(config.auth.type), methodVersion: row.methodVersion ?? '1.3.0', serviceId: row.serviceId ?? serviceIdOf(connectorRow), adapterId: row.adapterId ?? kind, adapterVersion: row.adapterVersion ?? adapterVersionOf(connectorRow) })
  if (!runtime.usable) return fail(`Test refusé : ${runtime.reasons.join(', ')}.`)

  const idempotencyKey = `test:${row.id}:${row.technicalRevision}:${Math.floor(Date.now() / 5_000)}`
  const [job] = await db.insert(connectionTestJobs).values({ connectionId: row.id, organizationId: row.organizationId, technicalRevision: row.technicalRevision, idempotencyKey, status: 'running', startedAt: new Date(), createdByUserId: actor.id }).onConflictDoNothing().returning({ id: connectionTestJobs.id })
  if (!job) return fail('Un test identique est déjà en cours.')

  const secret = await readSecret(row.secretRef, { organizationId: row.organizationId, connectionId: row.id, fieldCode: 'credential', purpose: 'test' }) ?? readLegacySecret(row.secretCiphertext, row.id)
  const outcome = secret ? await runConnectorTest(kind, config, secret, row.username ?? '') : unreadableSecretOutcome()
  const health = outcome.status === 'success' ? 'healthy' : outcome.status === 'warning' ? 'degraded' : 'error'

  await db.transaction(async (tx) => {
    await tx
      .update(connections)
      .set({ health, lastCheckAt: new Date(), lastCheckStatus: outcome.status, lastCheckMessage: outcome.message, lastCheckVersion: row.version, lastTestedTechnicalRevision: row.technicalRevision, lastValidatedMethodVersion: outcome.status !== 'error' ? row.methodVersion : null, lastValidatedAdapterVersion: outcome.status !== 'error' ? row.adapterVersion : null, ...(secret && !row.secretHint ? { secretHint: secretHintOf(secret) } : {}) })
      .where(and(eq(connections.id, row.id), eq(connections.technicalRevision, row.technicalRevision)))
    await tx.update(connectionTestJobs).set({ status: 'completed', outcome, finishedAt: new Date() }).where(eq(connectionTestJobs.id, job.id))
    await tx.insert(auditEvents).values(audit(actor.id, 'connection.tested', row.id, { status: outcome.status, host: hostOf(config.url), draft: false, technicalRevision: row.technicalRevision }))
  })

  revalidateAll()
  return { ok: true, outcome, message: outcome.message }
}

/** Teste des identifiants saisis (ou, si le secret est laissé vide, ceux déjà enregistrés) sans rien enregistrer. */
export async function testDraftConnection(input: unknown): Promise<{ ok: true; outcome: TestOutcome } | Failure> {
  const actor = await requirePermission('connections.view')
  if (!hasCapability(actor, 'connections.test')) return fail('Vous n’avez pas la capacité de tester une Connexion.')
  const organization = await getDefaultOrganization()
  if (!organization) return fail('Aucune organisation n’est configurée.')
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Les informations saisies sont invalides.')

  const connectorRow = await loadConnector(parsed.data.connectorId)
  if (!connectorRow || connectorRow.organizationId !== organization.id) return fail('Connecteur introuvable.')
  const kind = kindOf(connectorRow)
  const config = readConfig(kind, connectorRow.config)
  if (!needsSecret(config.auth.type)) return fail('Ce connecteur n’utilise aucune authentification.')
  const runtime = await runtimeDecisionFor(connectorRow, methodIdForAuth(config.auth.type))
  if (!runtime.usable) return fail(`Test refusé : ${runtime.reasons.join(', ')}.`)

  let secret: string
  let username: string
  if (parsed.data.secret.trim() === '' && parsed.data.connectionId) {
    const row = await loadConnection(parsed.data.connectionId)
    if (!row || row.connectorId !== connectorRow.id || !canSee(actor, row) || !canEdit(actor, row)) return fail('Connexion introuvable.')
    const stored = await readSecret(row.secretRef, { organizationId: row.organizationId, connectionId: row.id, fieldCode: 'credential', purpose: 'test' }) ?? readLegacySecret(row.secretCiphertext, row.id)
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
  'connection.archived': 'Connexion archivée',
}

const TEST_STATUS_LABELS: Record<string, string> = { success: 'réussi', warning: 'avec réserves', error: 'en échec' }

export async function getConnectionActivity(input: unknown): Promise<{ ok: true; entries: ConnectionActivityEntry[] } | Failure> {
  const actor = await requirePermission('connections.view')
  if (!hasCapability(actor, 'connections.auditRead')) return fail('Vous n’avez pas la capacité de consulter cet historique.')
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
