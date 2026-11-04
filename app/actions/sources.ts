'use server'

import { randomUUID } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getDefaultOrganization, requirePermission } from '@/lib/authorization'
import { getKindInfo, isConnectorKind, needsSecret, type ConnectorKind } from '@/lib/connector-catalog'
import { db } from '@/lib/db'
import { auditEvents, collectionOccurrences, connections, connectors, sources, users } from '@/lib/db/schema'
import type { SourceCollectionEntry, SourceConnectorChoice, SourceDiagnostic, SourceSummary, SourcesOverview } from '@/lib/source-types'

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const createSchema = z.object({
  connectorId: z.string().uuid(),
  connectionId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.').max(100, 'Le nom est trop long.'),
  description: z.string().trim().max(300, 'La description est trop longue.').optional(),
  imageUrl: z.string().trim().max(1000, 'L’adresse de l’image est trop longue.').refine((value) => !value || /^https?:\/\//i.test(value), 'Renseignez une adresse d’image commençant par http:// ou https://.').optional(),
  endpoint: z.string().trim().min(3, 'Renseignez l’origine ou le chemin de la Source.').max(1000, 'L’origine est trop longue.'),
  scope: z.enum(['organization', 'user']),
})

type Failure = { ok: false; message: string }
const fail = (message: string): Failure => ({ ok: false, message })
const categoryByKind: Record<ConnectorKind, string> = {
  rss: 'Flux RSS / Atom', web: 'Web', api: 'Bases de données', imap: 'Boîtes mail', webhook: 'Webhook entrant', m365: 'Microsoft 365',
}
function connectorKind(value: string): ConnectorKind {
  return isConnectorKind(value) ? value : 'web'
}

function currentSuccess(row: { version: number; lastCheckStatus: string | null; lastCheckVersion: number | null }) {
  return row.lastCheckStatus === 'success' && row.lastCheckVersion === row.version
}

function testDetail(row: { version: number; lastCheckStatus: string | null; lastCheckVersion: number | null; lastCheckMessage: string | null }) {
  if (currentSuccess(row)) return row.lastCheckMessage || 'Prérequis vérifiés.'
  if (row.lastCheckStatus === 'error' || row.lastCheckStatus === 'warning') return row.lastCheckMessage || 'Le dernier contrôle demande une attention.'
  if (row.lastCheckVersion !== null && row.lastCheckVersion !== row.version) return 'La configuration a changé depuis le dernier contrôle.'
  return 'Aucun contrôle concluant n’est disponible.'
}

function canSeeConnection(actorId: string, row: { scope: string; ownerUserId: string | null }) {
  return row.scope !== 'private' || row.ownerUserId === actorId
}

function versionPinsCurrent(row: { methodId: string | null; methodVersion: string | null; adapterId: string | null; adapterVersion: string | null; lastValidatedMethodVersion: string | null; lastValidatedAdapterVersion: string | null }) {
  if (!row.methodId && !row.adapterId) return true
  return Boolean(row.methodId && row.adapterId && row.methodVersion === row.lastValidatedMethodVersion && row.adapterVersion === row.lastValidatedAdapterVersion)
}

function formatOccurrence(row: typeof collectionOccurrences.$inferSelect): SourceCollectionEntry {
  const state = ['scheduled', 'running', 'deferred', 'completed', 'failed'].includes(row.state) ? row.state as SourceCollectionEntry['state'] : 'failed'
  return {
    id: row.id,
    watchName: row.watchName,
    state,
    scheduledFor: dateTime.format(row.scheduledFor),
    finishedAt: row.finishedAt ? dateTime.format(row.finishedAt) : null,
    itemsRetrieved: row.itemsRetrieved,
    newItems: row.newItems,
    errorMessage: row.errorMessage,
  }
}

async function organizationFor(actor: Awaited<ReturnType<typeof requirePermission>>) {
  if (actor.organizationId) return { id: actor.organizationId, name: 'Votre organisation' }
  return getDefaultOrganization()
}

export async function getSourcesOverview(): Promise<SourcesOverview> {
  const actor = await requirePermission('sources.manage')
  const organization = await organizationFor(actor)
  if (!organization) return { organizationName: 'Votre organisation', viewer: { id: actor.id, canManage: true }, stats: { referenced: 0, usable: 0, attention: 0, watches: 0 }, sources: [], connectors: [] }

  const [sourceRows, connectorRows, connectionRows, occurrenceRows, auditRows, userRows] = await Promise.all([
    db.select().from(sources).where(eq(sources.organizationId, organization.id)).orderBy(desc(sources.updatedAt)),
    db.select({ id: connectors.id, name: connectors.name, description: connectors.description, kind: connectors.kind, status: connectors.status, config: connectors.config, version: connectors.version, lastCheckStatus: connectors.lastCheckStatus, lastCheckVersion: connectors.lastCheckVersion, lastCheckAt: connectors.lastCheckAt, lastCheckMessage: connectors.lastCheckMessage }).from(connectors).where(eq(connectors.organizationId, organization.id)).orderBy(connectors.name),
    db.select({ id: connections.id, connectorId: connections.connectorId, name: connections.name, scope: connections.scope, lifecycle: connections.lifecycle, ownerUserId: connections.ownerUserId, version: connections.version, methodId: connections.methodId, methodVersion: connections.methodVersion, adapterId: connections.adapterId, adapterVersion: connections.adapterVersion, lastValidatedMethodVersion: connections.lastValidatedMethodVersion, lastValidatedAdapterVersion: connections.lastValidatedAdapterVersion, lastCheckStatus: connections.lastCheckStatus, lastCheckVersion: connections.lastCheckVersion, lastCheckAt: connections.lastCheckAt, lastCheckMessage: connections.lastCheckMessage, expiresAt: connections.expiresAt }).from(connections).where(eq(connections.organizationId, organization.id)).orderBy(connections.name),
    db.select().from(collectionOccurrences).where(eq(collectionOccurrences.organizationId, organization.id)).orderBy(desc(collectionOccurrences.scheduledFor)).limit(500),
    db.select().from(auditEvents).where(eq(auditEvents.targetType, 'source')).orderBy(desc(auditEvents.createdAt)).limit(500),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.organizationId, organization.id)),
  ])

  const names = new Map(userRows.map((row) => [row.id, row.name]))
  names.set(actor.id, actor.name)
  const connectorById = new Map(connectorRows.map((row) => [row.id, row]))
  const visibleConnections = connectionRows.filter((row) => row.lifecycle === 'active' && canSeeConnection(actor.id, row))
  const connectionById = new Map(visibleConnections.map((row) => [row.id, row]))
  const now = Date.now()

  const connectorChoices: SourceConnectorChoice[] = connectorRows.map((row) => {
    const kind = connectorKind(row.kind)
    const auth = (row.config as { auth?: { type?: string } } | null)?.auth?.type ?? 'none'
    const requiresConnection = needsSecret(auth as Parameters<typeof needsSecret>[0])
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? getKindInfo(kind)?.description ?? '',
      kind,
      category: categoryByKind[kind],
      active: row.status === 'active',
      ready: row.status === 'active' && currentSuccess(row),
      requiresConnection,
      healthDetail: row.status !== 'active' ? 'Ce Connecteur n’est pas actif.' : testDetail(row),
      connections: visibleConnections.filter((connection) => connection.connectorId === row.id).map((connection) => {
        const expired = connection.expiresAt ? connection.expiresAt.getTime() < now : false
        const pinsCurrent = versionPinsCurrent(connection)
        return { id: connection.id, name: connection.name, scope: connection.scope === 'private' ? 'user' : 'organization', ready: currentSuccess(connection) && pinsCurrent && !expired, detail: expired ? 'Identifiants expirés.' : !pinsCurrent ? 'La méthode ou l’adaptateur a changé depuis le dernier test.' : testDetail(connection) }
      }),
    }
  })

  const visibleSources = sourceRows.filter((row) => row.scope === 'organization' || row.ownerUserId === actor.id)
  const summaries: SourceSummary[] = visibleSources.flatMap((row) => {
    const connector = connectorById.get(row.connectorId)
    if (!connector) return []
    const kind = connectorKind(connector.kind)
    const auth = (connector.config as { auth?: { type?: string } } | null)?.auth?.type ?? 'none'
    const requiresConnection = needsSecret(auth as Parameters<typeof needsSecret>[0])
    const connection = row.connectionId ? connectionById.get(row.connectionId) : null
    const connectorReady = connector.status === 'active' && currentSuccess(connector)
    const connectionReady = !requiresConnection || Boolean(connection && currentSuccess(connection) && versionPinsCurrent(connection) && (!connection.expiresAt || connection.expiresAt.getTime() >= now))
    const collections = occurrenceRows.filter((item) => item.sourceId === row.id).map(formatOccurrence)
    const lastCollection = collections[0] ?? null
    const explicitProblem = connector.lastCheckStatus === 'error' || connector.lastCheckStatus === 'warning' || connection?.lastCheckStatus === 'error' || connection?.lastCheckStatus === 'warning' || lastCollection?.state === 'failed'
    const diagnostic: SourceDiagnostic = explicitProblem ? 'attention' : connectorReady && connectionReady ? 'usable' : 'unverified'
    const diagnosticLabel = diagnostic === 'usable' ? 'Utilisable' : diagnostic === 'attention' ? 'À examiner' : 'Non vérifiée'
    const diagnosticDetail = diagnostic === 'usable'
      ? 'Connecteur et accès requis vérifiés.'
      : explicitProblem
        ? lastCollection?.state === 'failed' ? lastCollection.errorMessage || 'La dernière collecte est en erreur.' : connection?.lastCheckStatus === 'error' || connection?.lastCheckStatus === 'warning' ? testDetail(connection) : testDetail(connector)
        : !connectorReady ? testDetail(connector) : 'La Connexion requise n’a pas de contrôle concluant.'
    const testCandidates = [connector.lastCheckAt, connection?.lastCheckAt ?? null].filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())
    const watches = [...new Set(collections.map((item) => item.watchName))]
    const audit = auditRows.filter((item) => item.targetId === row.id).slice(0, 20).map((item) => ({
      id: item.id,
      action: item.action,
      actor: names.get(item.actorUserId) ?? 'Utilisateur',
      at: dateTime.format(item.createdAt),
      detail: item.action === 'source.created' ? 'Définition de Source créée.' : 'Configuration de Source mise à jour.',
    }))
    return [{
      id: row.id, name: row.name, description: row.description ?? '', imageUrl: row.imageUrl, endpoint: row.endpoint, scope: row.scope === 'user' ? 'user' : 'organization', ownerName: row.ownerUserId ? names.get(row.ownerUserId) ?? 'Utilisateur' : organization.name,
      connectorId: connector.id, connectorName: connector.name, connectorKind: kind, connectorCategory: categoryByKind[kind], connectionId: row.connectionId, connectionName: connection?.name ?? null,
      diagnostic, diagnosticLabel, diagnosticDetail, lastTestAt: testCandidates[0] ? dateTime.format(testCandidates[0]) : null, lastTestResult: diagnosticDetail,
      lastCollection, watches, collections: collections.slice(0, 30), audit, createdAt: dateTime.format(row.createdAt), updatedAt: dateTime.format(row.updatedAt), canManage: true,
    }]
  })

  const watchNames = new Set(summaries.flatMap((source) => source.watches))
  return {
    organizationName: organization.name,
    viewer: { id: actor.id, canManage: true },
    stats: { referenced: summaries.length, usable: summaries.filter((item) => item.diagnostic === 'usable').length, attention: summaries.filter((item) => item.diagnostic === 'attention').length, watches: watchNames.size },
    sources: summaries,
    connectors: connectorChoices,
  }
}

export async function createSource(input: unknown): Promise<{ ok: true; message: string; id: string } | Failure> {
  const actor = await requirePermission('sources.manage')
  const organization = await organizationFor(actor)
  if (!organization) return fail('Aucune organisation n’est configurée.')
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Les informations sont invalides.')

  const [connector] = await db.select().from(connectors).where(and(eq(connectors.id, parsed.data.connectorId), eq(connectors.organizationId, organization.id))).limit(1)
  if (!connector) return fail('Connecteur introuvable.')
  const kind = connectorKind(connector.kind)
  if (['rss', 'web', 'api'].includes(kind) && !/^https?:\/\//i.test(parsed.data.endpoint)) return fail('Renseignez une adresse commençant par http:// ou https://.')
  const auth = (connector.config as { auth?: { type?: string } } | null)?.auth?.type ?? 'none'
  const requiresConnection = needsSecret(auth as Parameters<typeof needsSecret>[0])

  let connection: typeof connections.$inferSelect | null = null
  if (parsed.data.connectionId) {
    const [candidate] = await db.select().from(connections).where(and(eq(connections.id, parsed.data.connectionId), eq(connections.organizationId, organization.id))).limit(1)
    connection = candidate ?? null
    if (!connection || connection.lifecycle !== 'active' || !canSeeConnection(actor.id, connection)) return fail('Connexion introuvable, inactive ou non autorisée.')
    if (connection.connectorId !== connector.id) return fail('Cette Connexion n’est pas compatible avec le Connecteur sélectionné.')
    if (parsed.data.scope === 'organization' && connection.scope === 'private') return fail('Une Source partagée ne peut pas utiliser une Connexion privée.')
    if (!versionPinsCurrent(connection)) return fail('La méthode ou l’adaptateur de cette Connexion doit être retesté avant utilisation.')
  }
  if (requiresConnection && !connection) return fail('Ce Connecteur exige une Connexion vérifiée.')

  if (!requiresConnection && !connection) {
    const ownerKey = parsed.data.scope === 'user' ? actor.id : organization.id
    const autoReuseKey = `${organization.id}:${connector.id}:NONE:${ownerKey}`
    const [existingNone] = await db.select().from(connections).where(and(eq(connections.organizationId, organization.id), eq(connections.autoReuseKey, autoReuseKey))).limit(1)
    if (existingNone) {
      connection = existingNone
    } else {
      const integration = (connector.config as { integration?: { templateId?: unknown; adapterVersion?: unknown } }).integration
      const serviceId = typeof integration?.templateId === 'string' && integration.templateId ? integration.templateId : `custom:${kind}`
      const adapterVersion = typeof integration?.adapterVersion === 'string' && integration.adapterVersion ? integration.adapterVersion : '1.0.0'
      const [createdNone] = await db.insert(connections).values({
        id: randomUUID(), organizationId: organization.id, connectorId: connector.id, serviceId, name: `Accès public · ${connector.name}`, scope: parsed.data.scope === 'user' ? 'private' : 'organization', ownerUserId: parsed.data.scope === 'user' ? actor.id : null, ownerKind: parsed.data.scope === 'user' ? 'user' : 'organization', ownerId: ownerKey, lifecycle: 'active', health: 'unverified', origin: 'automatic_none', methodId: 'NONE', methodVersion: '1.0.0', adapterId: kind, adapterVersion, handlerKey: 'none', handlerVersion: '1.0.0', lastValidatedMethodVersion: '1.0.0', lastValidatedAdapterVersion: adapterVersion, autoReuseKey, createdByUserId: actor.id,
      }).onConflictDoNothing().returning()
      if (createdNone) {
        connection = createdNone
        await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'connection.none_created', targetType: 'connection', targetId: createdNone.id, metadata: { connectorId: connector.id, sourceScope: parsed.data.scope } })
      } else {
        const [racedNone] = await db.select().from(connections).where(eq(connections.autoReuseKey, autoReuseKey)).limit(1)
        connection = racedNone ?? null
      }
    }
  }
  if (!connection) return fail('La Connexion technique n’a pas pu être créée ou résolue.')

  const duplicateWhere = parsed.data.scope === 'organization'
    ? and(eq(sources.organizationId, organization.id), eq(sources.scope, 'organization'), sql`lower(${sources.name}) = lower(${parsed.data.name})`)
    : and(eq(sources.organizationId, organization.id), eq(sources.scope, 'user'), eq(sources.ownerUserId, actor.id), sql`lower(${sources.name}) = lower(${parsed.data.name})`)
  const [duplicate] = await db.select({ id: sources.id }).from(sources).where(duplicateWhere).limit(1)
  if (duplicate) return fail('Une Source de même nom existe déjà dans ce périmètre.')

  const [created] = await db.transaction(async (tx) => {
    const rows = await tx.insert(sources).values({ organizationId: organization.id, connectorId: connector.id, connectionId: connection?.id ?? null, name: parsed.data.name, description: parsed.data.description || null, imageUrl: parsed.data.imageUrl || null, endpoint: parsed.data.endpoint, scope: parsed.data.scope, ownerUserId: parsed.data.scope === 'user' ? actor.id : null, createdByUserId: actor.id }).returning({ id: sources.id })
    await tx.insert(auditEvents).values({ actorUserId: actor.id, action: 'source.created', targetType: 'source', targetId: rows[0].id, metadata: { connectorId: connector.id, scope: parsed.data.scope, connectionScope: connection?.scope ?? null } })
    return rows
  })
  revalidatePath('/admin/sources')
  return { ok: true, message: 'Source ajoutée au catalogue.', id: created.id }
}

