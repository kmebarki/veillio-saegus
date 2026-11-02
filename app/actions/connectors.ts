'use server'

import { randomUUID } from 'node:crypto'

import { and, count, desc, eq, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import {
  CONNECTOR_KINDS,
  configSchema,
  defaultConfig,
  isConnectorKind,
  needsSecret,
  validateKindConfig,
  type ConnectorConfig,
  type ConnectorHealth,
  type ConnectorKind,
  type ConnectorStatus,
} from '@/lib/connector-catalog'
import type { ConnectorDetail, ConnectorHistoryEntry, ConnectorRunEntry, ConnectorSummary, ConnectorsOverview, TestOutcome } from '@/lib/connector-types'
import { decryptSecret, encryptSecret } from '@/lib/connectors/crypto'
import { runConnectorTest } from '@/lib/connectors/engine'
import { SafeFetchError, validateTargetUrl } from '@/lib/connectors/safe-fetch'
import { getDefaultOrganization, requirePermission } from '@/lib/authorization'
import { db } from '@/lib/db'
import { auditEvents, connectorRuns, connectors, users, type ConnectorRunDetails } from '@/lib/db/schema'
import { isRateLimited, isUniqueViolation } from '@/lib/rate-limit'

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const MAX_CONNECTORS = 100
const TEST_WINDOW_MS = 10 * 60 * 1000
const TEST_MAX_PER_WINDOW = 30

const nameField = z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.').max(80, 'Le nom ne peut pas dépasser 80 caractères.').transform((value) => value.replace(/\s+/g, ' '))
const descriptionField = z.string().trim().max(300, 'La description ne peut pas dépasser 300 caractères.')
const secretField = z.object({ mode: z.enum(['keep', 'set', 'clear']), value: z.string().max(2000, 'Le secret est trop long (2000 caractères maximum).') })
const kindField = z.enum(CONNECTOR_KINDS)

const createSchema = z.object({ kind: kindField, name: nameField, description: descriptionField.optional(), config: configSchema, secret: secretField })
const updateSchema = createSchema.omit({ kind: true }).extend({ id: z.string().uuid(), version: z.number().int().positive() })
const draftTestSchema = z.object({ id: z.string().uuid().optional(), kind: kindField, config: configSchema, secret: secretField })
const idSchema = z.object({ id: z.string().uuid() })
const statusSchema = z.object({ id: z.string().uuid(), status: z.enum(['active', 'paused']) })

const ACTION_LABELS: Record<string, string> = {
  'connector.created': 'Connecteur créé',
  'connector.duplicated': 'Connecteur dupliqué',
  'connector.updated': 'Informations modifiées',
  'connector.reconfigured': 'Configuration technique modifiée',
  'connector.secret_changed': 'Identifiants modifiés',
  'connector.tested': 'Test de connexion',
  'connector.activated': 'Connecteur activé',
  'connector.paused': 'Connecteur mis en pause',
  'connector.deleted': 'Connecteur supprimé',
}

type Failure = { ok: false; message: string }
const fail = (message: string): Failure => ({ ok: false, message })

type Row = typeof connectors.$inferSelect

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? 'Les informations saisies sont invalides.'
}

function revalidateConnectors() {
  revalidatePath('/admin/connectors')
}

function audit(actorUserId: string, action: string, connectorId: string, metadata: Record<string, string | number | boolean | null> = {}) {
  return { actorUserId, action, targetType: 'connector', targetId: connectorId, metadata }
}

function readConfig(kind: ConnectorKind, raw: unknown): ConnectorConfig {
  const parsed = configSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  const stored = (raw ?? {}) as { url?: unknown }
  return { ...defaultConfig(kind), url: typeof stored.url === 'string' ? stored.url : '' }
}

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

function toSummary(row: Row): ConnectorSummary {
  const kind: ConnectorKind = isConnectorKind(row.kind) ? row.kind : 'rss'
  const config = readConfig(kind, row.config)
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    kind,
    status: (['draft', 'active', 'paused'].includes(row.status) ? row.status : 'draft') as ConnectorStatus,
    health: healthOf(row.lastCheckStatus),
    host: hostOf(config.url),

    version: row.version,
    hasSecret: Boolean(row.secretCiphertext),
    authType: config.auth.type,
    lastCheckAt: row.lastCheckAt ? dateTimeFormatter.format(row.lastCheckAt) : null,
    lastCheckMessage: row.lastCheckMessage,
    lastLatencyMs: row.lastLatencyMs,
    testedCurrentVersion: row.lastCheckVersion === row.version,
    createdAt: dateTimeFormatter.format(row.createdAt),
    updatedAt: dateTimeFormatter.format(row.updatedAt),
  }
}

async function loadConnector(id: string) {
  const [row] = await db.select().from(connectors).where(eq(connectors.id, id)).limit(1)
  return row ?? null
}

async function findDuplicateName(organizationId: string, name: string, excludeId?: string) {
  const [duplicate] = await db
    .select({ id: connectors.id })
    .from(connectors)
    .where(and(eq(connectors.organizationId, organizationId), sql`lower(${connectors.name}) = lower(${name})`, excludeId ? ne(connectors.id, excludeId) : undefined))
    .limit(1)
  return Boolean(duplicate)
}

function checkTarget(kind: ConnectorKind, config: ConnectorConfig): string | null {
  try {
    validateTargetUrl(config.url)
  } catch (error) {
    return error instanceof SafeFetchError ? error.message : 'L’adresse est invalide.'
  }
  return validateKindConfig(kind, config)
}

type SecretInputValue = z.infer<typeof secretField>

function resolveSecret(config: ConnectorConfig, input: SecretInputValue, existing: string | null, connectorId: string): { ok: true; ciphertext: string | null; changed: boolean } | Failure {
  if (!needsSecret(config.auth.type)) return { ok: true, ciphertext: null, changed: existing !== null }
  if (input.mode === 'set') {
    const value = input.value.trim()
    if (value.length < 3) return fail('Le secret est trop court (3 caractères minimum).')
    if (/[\r\n]/.test(value)) return fail('Le secret ne peut pas contenir de saut de ligne.')
    return { ok: true, ciphertext: encryptSecret(value, connectorId), changed: true }
  }
  if (input.mode === 'keep' && existing) return { ok: true, ciphertext: existing, changed: false }
  return fail('Renseignez le secret (mot de passe, jeton ou clé) correspondant au type d’authentification choisi.')
}

function describeChanges(before: ConnectorConfig, after: ConnectorConfig) {
  const sections: string[] = []
  const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  if (before.url !== after.url) sections.push('Adresse')
  if (differs(before.auth, after.auth)) sections.push('Authentification')
  if (differs(before.http, after.http) || differs(before.retry, after.retry)) sections.push('Requête HTTP')
  if (differs(before.web, after.web) || differs(before.api, after.api) || before.dedupe !== after.dedupe) sections.push('Extraction')
  return sections
}

export async function getConnectorsOverview(): Promise<ConnectorsOverview> {
  const actor = await requirePermission('connectors.view')
  const organization = await getDefaultOrganization()
  const rows = organization ? await db.select().from(connectors).where(eq(connectors.organizationId, organization.id)).orderBy(connectors.name) : []
  const summaries = rows.map(toSummary)

  const latencies = summaries.map((item) => item.lastLatencyMs).filter((value): value is number => value !== null)
  return {
    viewer: { id: actor.id, canManage: actor.permissions.includes('connectors.manage') },
    organizationName: organization?.name ?? 'Votre organisation',
    connectors: summaries,
    stats: {
      total: summaries.length,
      active: summaries.filter((item) => item.status === 'active').length,
      healthy: summaries.filter((item) => item.health === 'ok').length,
      attention: summaries.filter((item) => item.health === 'warning' || item.health === 'error' || (item.status === 'active' && !item.testedCurrentVersion)).length,
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
    },
  }
}

export async function getConnectorDetail(input: unknown): Promise<{ ok: true; detail: ConnectorDetail } | Failure> {
  await requirePermission('connectors.view')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Connecteur invalide.')
  const row = await loadConnector(parsed.data.id)
  if (!row) return fail('Connecteur introuvable.')
  const kind: ConnectorKind = isConnectorKind(row.kind) ? row.kind : 'rss'

  const [runRows, historyRows] = await Promise.all([
    db
      .select({ run: connectorRuns, actor: users.name })
      .from(connectorRuns)
      .leftJoin(users, eq(users.id, connectorRuns.actorUserId))
      .where(eq(connectorRuns.connectorId, row.id))
      .orderBy(desc(connectorRuns.createdAt))
      .limit(30),
    db
      .select({ id: auditEvents.id, action: auditEvents.action, metadata: auditEvents.metadata, createdAt: auditEvents.createdAt, actor: users.name })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(and(eq(auditEvents.targetType, 'connector'), eq(auditEvents.targetId, row.id), ne(auditEvents.action, 'connector.tested')))
      .orderBy(desc(auditEvents.createdAt))
      .limit(40),
  ])

  const runs: ConnectorRunEntry[] = runRows.map(({ run, actor }) => {
    const details: ConnectorRunDetails = run.details ?? {}
    return {
      id: run.id,
      status: run.status === 'success' || run.status === 'warning' ? run.status : 'error',
      httpStatus: run.httpStatus,
      itemsFound: run.itemsFound,
      durationMs: run.durationMs,
      message: run.message ?? '',
      at: dateTimeFormatter.format(run.createdAt),
      actor: actor ?? 'Utilisateur supprimé',
      checks: details.checks ?? [],
      sample: details.sample ?? [],
      finalUrl: details.finalUrl ?? null,
      contentType: details.contentType ?? null,
      bytes: details.bytes ?? null,
    }
  })

  const history: ConnectorHistoryEntry[] = historyRows.map((entry) => {
    const metadata = entry.metadata ?? {}
    const detail =
      entry.action === 'connector.reconfigured' && typeof metadata.sections === 'string'
        ? `Sections : ${metadata.sections}${metadata.paused ? ' · remis en pause pour retest' : ''}`
        : entry.action === 'connector.updated' && typeof metadata.previousName === 'string' && metadata.previousName !== metadata.name
          ? `Renommé depuis « ${metadata.previousName} »`
          : typeof metadata.name === 'string' ? `« ${metadata.name} »` : ''
    return { id: entry.id, label: ACTION_LABELS[entry.action] ?? entry.action, detail, actor: entry.actor ?? 'Utilisateur supprimé', at: dateTimeFormatter.format(entry.createdAt) }
  })

  return { ok: true, detail: { connector: toSummary(row), config: readConfig(kind, row.config), runs, history } }
}

export async function createConnector(input: unknown): Promise<{ ok: true; message: string; id: string } | Failure> {
  const actor = await requirePermission('connectors.manage')
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail(firstError(parsed.error))
  const { kind, name, description } = parsed.data
  const config: ConnectorConfig = { ...parsed.data.config, url: parsed.data.config.url.trim() }

  const invalid = checkTarget(kind, config)
  if (invalid) return fail(invalid)

  const organization = await getDefaultOrganization()
  if (!organization) return fail('Organisation introuvable.')
  if (await findDuplicateName(organization.id, name)) return fail('Un connecteur porte déjà ce nom.')
  const [{ total }] = await db.select({ total: count() }).from(connectors).where(eq(connectors.organizationId, organization.id))
  if (total >= MAX_CONNECTORS) return fail(`Limite atteinte : ${MAX_CONNECTORS} connecteurs maximum par organisation.`)

  const id = randomUUID()
  const secret = resolveSecret(config, parsed.data.secret, null, id)
  if (!secret.ok) return secret

  try {
    await db.transaction(async (tx) => {
      await tx.insert(connectors).values({ id, organizationId: organization.id, name, description: description || null, kind, status: 'draft', config, secretCiphertext: secret.ciphertext, createdByUserId: actor.id })
      await tx.insert(auditEvents).values(audit(actor.id, 'connector.created', id, { name, kind }))
    })
  } catch (error) {
    if (isUniqueViolation(error)) return fail('Un connecteur porte déjà ce nom.')
    throw error
  }
  revalidateConnectors()
  return { ok: true, message: 'Connecteur créé en brouillon. Testez-le avant de l’activer.', id }
}

export async function updateConnector(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('connectors.manage')
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(firstError(parsed.error))

  const row = await loadConnector(parsed.data.id)
  if (!row) return fail('Connecteur introuvable.')
  const kind: ConnectorKind = isConnectorKind(row.kind) ? row.kind : 'rss'
  const config: ConnectorConfig = { ...parsed.data.config, url: parsed.data.config.url.trim() }

  const invalid = checkTarget(kind, config)
  if (invalid) return fail(invalid)
  if (await findDuplicateName(row.organizationId, parsed.data.name, row.id)) return fail('Un connecteur porte déjà ce nom.')

  const secret = resolveSecret(config, parsed.data.secret, row.secretCiphertext, row.id)
  if (!secret.ok) return secret

  const previous = readConfig(kind, row.config)
  const sections = describeChanges(previous, config)
  const secretChanged = secret.changed
  const technicalChanged = sections.length > 0 || secretChanged
  const description = parsed.data.description || null
  const infoChanged = row.name !== parsed.data.name || (row.description ?? null) !== description
  if (!technicalChanged && !infoChanged) return { ok: true, message: 'Aucune modification à enregistrer.' }

  const mustPause = technicalChanged && row.status === 'active'
  try {
    const outcome = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(connectors)
        .set({
          name: parsed.data.name,
          description,
          config,
          secretCiphertext: secret.ciphertext,
          status: mustPause ? 'paused' : row.status,
          version: sql`${connectors.version} + 1`,
          lastCheckVersion: technicalChanged ? row.lastCheckVersion : row.lastCheckVersion === row.version ? row.version + 1 : row.lastCheckVersion,
          updatedAt: new Date(),
        })
        .where(and(eq(connectors.id, row.id), eq(connectors.version, parsed.data.version)))
        .returning({ id: connectors.id })
      if (!updated) return 'conflict' as const
      if (infoChanged) await tx.insert(auditEvents).values(audit(actor.id, 'connector.updated', row.id, { name: parsed.data.name, previousName: row.name }))
      if (sections.length > 0) await tx.insert(auditEvents).values(audit(actor.id, 'connector.reconfigured', row.id, { sections: sections.join(', '), paused: mustPause }))
      if (secretChanged) await tx.insert(auditEvents).values(audit(actor.id, 'connector.secret_changed', row.id, {}))
      return 'ok' as const
    })
    if (outcome === 'conflict') return fail('Ce connecteur vient d’être modifié par quelqu’un d’autre. Rechargez-le avant de réessayer.')
  } catch (error) {
    if (isUniqueViolation(error)) return fail('Un connecteur porte déjà ce nom.')
    throw error
  }

  revalidateConnectors()
  if (mustPause) return { ok: true, message: 'Configuration enregistrée. Le connecteur a été mis en pause : retestez-le pour le réactiver.' }
  return { ok: true, message: technicalChanged ? 'Configuration enregistrée. Relancez un test pour valider les changements.' : 'Connecteur mis à jour.' }
}

async function enforceTestRateLimit(actorId: string) {
  return isRateLimited({ actorUserId: actorId, actions: ['connector.tested'], windowMs: TEST_WINDOW_MS, max: TEST_MAX_PER_WINDOW })
}

const RATE_MESSAGE = `Trop de tests en peu de temps (${TEST_MAX_PER_WINDOW} par 10 minutes). Patientez un instant.`

function missingSecretOutcome(): TestOutcome {
  return {
    status: 'error',
    message: 'Le secret d’authentification n’est pas renseigné.',
    httpStatus: null,
    durationMs: 0,
    itemsFound: null,
    checks: [{ id: 'url', label: 'Adresse', status: 'error', detail: 'Renseignez le mot de passe, le jeton ou la clé API avant de tester.' }],
    sample: [],
  }
}

export async function testConnectorDraft(input: unknown): Promise<{ ok: true; outcome: TestOutcome } | Failure> {
  const actor = await requirePermission('connectors.manage')
  const parsed = draftTestSchema.safeParse(input)
  if (!parsed.success) return fail(firstError(parsed.error))
  if (await enforceTestRateLimit(actor.id)) return fail(RATE_MESSAGE)

  const { kind } = parsed.data
  const config: ConnectorConfig = { ...parsed.data.config, url: parsed.data.config.url.trim() }
  const invalid = validateKindConfig(kind, config)
  if (invalid) return fail(invalid)

  let secret: string | null = null
  if (needsSecret(config.auth.type)) {
    if (parsed.data.secret.mode === 'set') secret = parsed.data.secret.value.trim() || null
    else if (parsed.data.secret.mode === 'keep' && parsed.data.id) {
      const row = await loadConnector(parsed.data.id)
      secret = row ? decryptSecret(row.secretCiphertext, row.id) : null
    }
  }

  const targetId = parsed.data.id ?? 'brouillon'
  const outcome = needsSecret(config.auth.type) && !secret ? missingSecretOutcome() : await runConnectorTest(kind, config, secret)
  await db.insert(auditEvents).values(audit(actor.id, 'connector.tested', targetId, { status: outcome.status, draft: true, host: hostOf(config.url) }))
  return { ok: true, outcome }
}

export async function testConnector(input: unknown): Promise<{ ok: true; outcome: TestOutcome; message: string } | Failure> {
  const actor = await requirePermission('connectors.manage')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Connecteur invalide.')
  const row = await loadConnector(parsed.data.id)
  if (!row) return fail('Connecteur introuvable.')
  if (await enforceTestRateLimit(actor.id)) return fail(RATE_MESSAGE)

  const kind: ConnectorKind = isConnectorKind(row.kind) ? row.kind : 'rss'
  const config = readConfig(kind, row.config)
  const secret = decryptSecret(row.secretCiphertext, row.id)

  let outcome: TestOutcome
  if (needsSecret(config.auth.type) && !secret) {
    outcome = row.secretCiphertext
      ? { ...missingSecretOutcome(), message: 'Le secret enregistré est illisible. Saisissez-le à nouveau dans la configuration.' }
      : missingSecretOutcome()
  } else {
    outcome = await runConnectorTest(kind, config, secret)
  }

  await db.transaction(async (tx) => {
    await tx.insert(connectorRuns).values({
      connectorId: row.id,
      trigger: 'test',
      status: outcome.status,
      httpStatus: outcome.httpStatus,
      itemsFound: outcome.itemsFound,
      durationMs: outcome.durationMs,
      message: outcome.message,
      details: { checks: outcome.checks, sample: outcome.sample, finalUrl: outcome.finalUrl, contentType: outcome.contentType, bytes: outcome.bytes },
      actorUserId: actor.id,
    })
    await tx
      .update(connectors)
      .set({
        lastCheckAt: new Date(),
        lastCheckStatus: outcome.status,
        lastCheckMessage: outcome.message,
        lastCheckVersion: row.version,
        lastLatencyMs: outcome.httpStatus ? outcome.durationMs : null,
      })
      .where(and(eq(connectors.id, row.id), eq(connectors.version, row.version)))
    await tx.insert(auditEvents).values(audit(actor.id, 'connector.tested', row.id, { status: outcome.status, draft: false, host: hostOf(config.url) }))
    await tx.execute(sql`delete from connector_runs where "connectorId" = ${row.id} and id not in (select id from connector_runs where "connectorId" = ${row.id} order by "createdAt" desc limit 100)`)
  })

  revalidateConnectors()
  return { ok: true, outcome, message: outcome.message }
}

export async function setConnectorStatus(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('connectors.manage')
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return fail('Demande invalide.')
  const row = await loadConnector(parsed.data.id)
  if (!row) return fail('Connecteur introuvable.')
  if (row.status === parsed.data.status) return { ok: true, message: parsed.data.status === 'active' ? 'Le connecteur est déjà actif.' : 'Le connecteur est déjà en pause.' }

  if (parsed.data.status === 'active') {
    if (row.lastCheckVersion !== row.version || !row.lastCheckStatus) return fail('Lancez un test de connexion avec la configuration actuelle avant d’activer ce connecteur.')
    if (row.lastCheckStatus === 'error') return fail('Le dernier test a échoué : corrigez la configuration puis relancez un test avant d’activer.')
  }

  await db.transaction(async (tx) => {
    await tx.update(connectors).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(connectors.id, row.id))
    await tx.insert(auditEvents).values(audit(actor.id, parsed.data.status === 'active' ? 'connector.activated' : 'connector.paused', row.id, { name: row.name }))
  })
  revalidateConnectors()
  return { ok: true, message: parsed.data.status === 'active' ? 'Connecteur activé : il est prêt pour la collecte.' : 'Connecteur mis en pause.' }
}

export async function duplicateConnector(input: unknown): Promise<{ ok: true; message: string; id: string } | Failure> {
  const actor = await requirePermission('connectors.manage')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Connecteur invalide.')
  const row = await loadConnector(parsed.data.id)
  if (!row) return fail('Connecteur introuvable.')

  const [{ total }] = await db.select({ total: count() }).from(connectors).where(eq(connectors.organizationId, row.organizationId))
  if (total >= MAX_CONNECTORS) return fail(`Limite atteinte : ${MAX_CONNECTORS} connecteurs maximum par organisation.`)

  let name = `${row.name} (copie)`
  for (let index = 2; await findDuplicateName(row.organizationId, name); index += 1) {
    name = `${row.name} (copie ${index})`
    if (index > 20) return fail('Trop de copies existent déjà pour ce connecteur.')
  }

  const id = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(connectors).values({ id, organizationId: row.organizationId, name: name.slice(0, 80), description: row.description, kind: row.kind, status: 'draft', config: row.config, secretCiphertext: null, createdByUserId: actor.id })
    await tx.insert(auditEvents).values(audit(actor.id, 'connector.duplicated', id, { name, source: row.name }))
  })
  revalidateConnectors()
  return { ok: true, message: 'Connecteur dupliqué en brouillon. Les identifiants ne sont pas copiés : saisissez-les avant de tester.', id }
}

export async function deleteConnector(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('connectors.manage')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Connecteur invalide.')
  const row = await loadConnector(parsed.data.id)
  if (!row) return fail('Connecteur introuvable.')
  if (row.status === 'active') return fail('Mettez le connecteur en pause avant de le supprimer.')

  await db.transaction(async (tx) => {
    await tx.delete(connectors).where(eq(connectors.id, row.id))
    await tx.insert(auditEvents).values(audit(actor.id, 'connector.deleted', row.id, { name: row.name, kind: row.kind }))
  })
  revalidateConnectors()
  return { ok: true, message: 'Connecteur supprimé.' }
}
