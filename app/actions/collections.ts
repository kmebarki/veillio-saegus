'use server'

import { and, desc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getDefaultOrganization, requirePermission } from '@/lib/authorization'
import type { CollectionDetail, CollectionOccurrenceSummary, CollectionPolicySummary, CollectionsOverview } from '@/lib/collection-types'
import { db } from '@/lib/db'
import { auditEvents, collectionAttempts, collectionOccurrences, collectionPolicies, connections, connectors } from '@/lib/db/schema'
import { isRateLimited, isUniqueViolation } from '@/lib/rate-limit'

const idSchema = z.object({ id: z.string().uuid() })
const policySchema = z.object({
  maxParallel: z.number().int().min(1).max(50),
  maxAttempts: z.number().int().min(1).max(10),
  baseBackoffSeconds: z.number().int().min(5).max(3600),
  maxQuotaDeferralMinutes: z.number().int().min(15).max(10080),
  retentionDays: z.number().int().min(7).max(365),
})

type Failure = { ok: false; message: string }
const fail = (message: string): Failure => ({ ok: false, message })
const defaultPolicy: CollectionPolicySummary = { id: null, maxParallel: 4, maxAttempts: 3, baseBackoffSeconds: 30, maxQuotaDeferralMinutes: 1440, retentionDays: 90, updatedAt: null }

async function resolveOrganization(actor: Awaited<ReturnType<typeof requirePermission>>) {
  if (actor.organizationId) return { id: actor.organizationId, name: 'Votre organisation' }
  return getDefaultOrganization()
}

function toOccurrence(row: {
  id: string
  watchName: string
  sourceName: string
  state: string
  trigger: string
  scheduledFor: Date
  startedAt: Date | null
  finishedAt: Date | null
  deferredUntil: Date | null
  itemsRetrieved: number
  newItems: number
  duplicateItems: number
  attemptCount: number
  errorCategory: string | null
  errorCode: string | null
  errorMessage: string | null
  parentOccurrenceId: string | null
  connectorName: string | null
  connectionName: string | null
}): CollectionOccurrenceSummary {
  return {
    id: row.id,
    watchName: row.watchName,
    sourceName: row.sourceName,
    connectorName: row.connectorName ?? 'Connecteur non renseigné',
    connectionName: row.connectionName ?? 'Sans connexion',
    state: row.state as CollectionOccurrenceSummary['state'],
    trigger: row.trigger as CollectionOccurrenceSummary['trigger'],
    scheduledFor: row.scheduledFor.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    deferredUntil: row.deferredUntil?.toISOString() ?? null,
    itemsRetrieved: row.itemsRetrieved,
    newItems: row.newItems,
    duplicateItems: row.duplicateItems,
    attemptCount: row.attemptCount,
    errorCategory: row.errorCategory,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    parentOccurrenceId: row.parentOccurrenceId,
    durationMs: row.startedAt && row.finishedAt ? Math.max(0, row.finishedAt.getTime() - row.startedAt.getTime()) : null,
  }
}

async function getOrganizationOccurrence(organizationId: string, id: string) {
  const [row] = await db
    .select({
      id: collectionOccurrences.id,
      organizationId: collectionOccurrences.organizationId,
      watchId: collectionOccurrences.watchId,
      watchName: collectionOccurrences.watchName,
      sourceId: collectionOccurrences.sourceId,
      sourceName: collectionOccurrences.sourceName,
      connectorId: collectionOccurrences.connectorId,
      connectionId: collectionOccurrences.connectionId,
      state: collectionOccurrences.state,
      trigger: collectionOccurrences.trigger,
      scheduledFor: collectionOccurrences.scheduledFor,
      startedAt: collectionOccurrences.startedAt,
      finishedAt: collectionOccurrences.finishedAt,
      deferredUntil: collectionOccurrences.deferredUntil,
      itemsRetrieved: collectionOccurrences.itemsRetrieved,
      newItems: collectionOccurrences.newItems,
      duplicateItems: collectionOccurrences.duplicateItems,
      attemptCount: collectionOccurrences.attemptCount,
      errorCategory: collectionOccurrences.errorCategory,
      errorCode: collectionOccurrences.errorCode,
      errorMessage: collectionOccurrences.errorMessage,
      cursorBefore: collectionOccurrences.cursorBefore,
      cursorAfter: collectionOccurrences.cursorAfter,
      parentOccurrenceId: collectionOccurrences.parentOccurrenceId,
      connectorName: connectors.name,
      connectionName: connections.name,
    })
    .from(collectionOccurrences)
    .leftJoin(connectors, eq(connectors.id, collectionOccurrences.connectorId))
    .leftJoin(connections, eq(connections.id, collectionOccurrences.connectionId))
    .where(and(eq(collectionOccurrences.id, id), eq(collectionOccurrences.organizationId, organizationId)))
    .limit(1)
  return row ?? null
}

export async function getCollectionsOverview(): Promise<CollectionsOverview> {
  const actor = await requirePermission('collections.view')
  const organization = await resolveOrganization(actor)
  if (!organization) {
    return { organizationName: 'Aucune organisation', viewer: { canRetry: false, canConfigure: false }, stats: { total: 0, scheduled: 0, running: 0, deferred: 0, completed: 0, failed: 0, successRate: 0, newItems: 0 }, occurrences: [], policy: defaultPolicy, refreshedAt: new Date().toISOString() }
  }

  const [rows, aggregateRows, policyRows] = await Promise.all([
    db
      .select({
        id: collectionOccurrences.id,
        watchName: collectionOccurrences.watchName,
        sourceName: collectionOccurrences.sourceName,
        state: collectionOccurrences.state,
        trigger: collectionOccurrences.trigger,
        scheduledFor: collectionOccurrences.scheduledFor,
        startedAt: collectionOccurrences.startedAt,
        finishedAt: collectionOccurrences.finishedAt,
        deferredUntil: collectionOccurrences.deferredUntil,
        itemsRetrieved: collectionOccurrences.itemsRetrieved,
        newItems: collectionOccurrences.newItems,
        duplicateItems: collectionOccurrences.duplicateItems,
        attemptCount: collectionOccurrences.attemptCount,
        errorCategory: collectionOccurrences.errorCategory,
        errorCode: collectionOccurrences.errorCode,
        errorMessage: collectionOccurrences.errorMessage,
        parentOccurrenceId: collectionOccurrences.parentOccurrenceId,
        connectorName: connectors.name,
        connectionName: connections.name,
      })
      .from(collectionOccurrences)
      .leftJoin(connectors, eq(connectors.id, collectionOccurrences.connectorId))
      .leftJoin(connections, eq(connections.id, collectionOccurrences.connectionId))
      .where(eq(collectionOccurrences.organizationId, organization.id))
      .orderBy(desc(collectionOccurrences.scheduledFor))
      .limit(250),
    db
      .select({
        total: sql<number>`count(*)::int`,
        scheduled: sql<number>`count(*) filter (where ${collectionOccurrences.state} = 'scheduled')::int`,
        running: sql<number>`count(*) filter (where ${collectionOccurrences.state} = 'running')::int`,
        deferred: sql<number>`count(*) filter (where ${collectionOccurrences.state} = 'deferred')::int`,
        completed: sql<number>`count(*) filter (where ${collectionOccurrences.state} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${collectionOccurrences.state} = 'failed')::int`,
        newItems: sql<number>`coalesce(sum(${collectionOccurrences.newItems}), 0)::int`,
      })
      .from(collectionOccurrences)
      .where(eq(collectionOccurrences.organizationId, organization.id)),
    db.select().from(collectionPolicies).where(and(eq(collectionPolicies.organizationId, organization.id), sql`${collectionPolicies.connectorId} is null`)).limit(1),
  ])

  const aggregate = aggregateRows[0] ?? { total: 0, scheduled: 0, running: 0, deferred: 0, completed: 0, failed: 0, newItems: 0 }
  const terminal = aggregate.completed + aggregate.failed
  const storedPolicy = policyRows[0]
  const policy: CollectionPolicySummary = storedPolicy
    ? { id: storedPolicy.id, maxParallel: storedPolicy.maxParallel, maxAttempts: storedPolicy.maxAttempts, baseBackoffSeconds: storedPolicy.baseBackoffSeconds, maxQuotaDeferralMinutes: storedPolicy.maxQuotaDeferralMinutes, retentionDays: storedPolicy.retentionDays, updatedAt: storedPolicy.updatedAt.toISOString() }
    : defaultPolicy

  return {
    organizationName: organization.name,
    viewer: { canRetry: actor.permissions.includes('collections.retry'), canConfigure: actor.permissions.includes('collections.configure') },
    stats: { ...aggregate, successRate: terminal === 0 ? 0 : Math.round((aggregate.completed / terminal) * 100) },
    occurrences: rows.map(toOccurrence),
    policy,
    refreshedAt: new Date().toISOString(),
  }
}

export async function getCollectionDetail(input: unknown): Promise<{ ok: true; detail: CollectionDetail } | Failure> {
  const actor = await requirePermission('collections.view')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Collecte invalide.')
  const organization = await resolveOrganization(actor)
  if (!organization) return fail('Organisation introuvable.')
  const row = await getOrganizationOccurrence(organization.id, parsed.data.id)
  if (!row) return fail('Collecte introuvable.')

  const attempts = await db.select().from(collectionAttempts).where(eq(collectionAttempts.occurrenceId, row.id)).orderBy(desc(collectionAttempts.attemptNumber)).limit(20)
  return {
    ok: true,
    detail: {
      occurrence: toOccurrence(row),
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        state: attempt.state as CollectionDetail['attempts'][number]['state'],
        startedAt: attempt.startedAt.toISOString(),
        finishedAt: attempt.finishedAt?.toISOString() ?? null,
        durationMs: attempt.durationMs,
        itemsRetrieved: attempt.itemsRetrieved,
        errorCategory: attempt.errorCategory,
        errorCode: attempt.errorCode,
        errorMessage: attempt.errorMessage,
        retryable: attempt.retryable,
      })),
    },
  }
}

export async function retryCollection(input: unknown): Promise<{ ok: true; message: string; id: string } | Failure> {
  const actor = await requirePermission('collections.retry')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Collecte invalide.')
  if (await isRateLimited({ actorUserId: actor.id, actions: ['collection.retry_requested'], windowMs: 10 * 60 * 1000, max: 20 })) return fail('Trop de relances en peu de temps. Patientez quelques minutes.')
  const organization = await resolveOrganization(actor)
  if (!organization) return fail('Organisation introuvable.')
  const source = await getOrganizationOccurrence(organization.id, parsed.data.id)
  if (!source) return fail('Collecte introuvable.')
  if (source.state !== 'failed' && source.state !== 'deferred') return fail('Seules les collectes en échec ou reportées peuvent être relancées.')

  if (source.sourceId) {
    const [active] = await db.select({ id: collectionOccurrences.id }).from(collectionOccurrences).where(and(eq(collectionOccurrences.organizationId, organization.id), eq(collectionOccurrences.sourceId, source.sourceId), eq(collectionOccurrences.state, 'running'))).limit(1)
    if (active) return fail('Une collecte est déjà en cours pour cette source.')
  }

  try {
    const [created] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(collectionOccurrences).values({
        organizationId: organization.id,
        watchId: source.watchId,
        watchName: source.watchName,
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        connectorId: source.connectorId,
        connectionId: source.connectionId,
        state: 'scheduled',
        trigger: 'manual_retry',
        scheduledFor: new Date(),
        cursorBefore: source.cursorBefore,
        parentOccurrenceId: source.id,
        requestedByUserId: actor.id,
      }).returning({ id: collectionOccurrences.id })
      await tx.insert(auditEvents).values({ actorUserId: actor.id, action: 'collection.retry_requested', targetType: 'collection', targetId: inserted[0].id, metadata: { parentOccurrenceId: source.id } })
      return inserted
    })
    revalidatePath('/admin/collections')
    return { ok: true, message: 'La relance a été planifiée sans modifier l’exécution d’origine.', id: created.id }
  } catch (error) {
    if (isUniqueViolation(error)) return fail('Une relance identique est déjà planifiée ou en cours.')
    return fail('La relance n’a pas pu être planifiée.')
  }
}

export async function updateCollectionPolicy(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('collections.configure')
  const parsed = policySchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Paramètres invalides.')
  const organization = await resolveOrganization(actor)
  if (!organization) return fail('Organisation introuvable.')
  const [existing] = await db.select({ id: collectionPolicies.id }).from(collectionPolicies).where(and(eq(collectionPolicies.organizationId, organization.id), sql`${collectionPolicies.connectorId} is null`)).limit(1)
  if (existing) {
    await db.update(collectionPolicies).set({ ...parsed.data, updatedByUserId: actor.id, updatedAt: new Date() }).where(and(eq(collectionPolicies.id, existing.id), eq(collectionPolicies.organizationId, organization.id)))
  } else {
    await db.insert(collectionPolicies).values({ organizationId: organization.id, connectorId: null, ...parsed.data, updatedByUserId: actor.id })
  }
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'collection.policy_updated', targetType: 'collection_policy', targetId: organization.id, metadata: parsed.data })
  revalidatePath('/admin/collections')
  return { ok: true, message: 'La politique globale de collecte a été mise à jour.' }
}
