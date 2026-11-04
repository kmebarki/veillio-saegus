import { createHash, randomBytes } from 'node:crypto'

import { and, eq, gt, isNull } from 'drizzle-orm'

import { readLegacySecret, readSecret } from '@/lib/authentication/vault'
import { canViewConnection } from '@/lib/connections/access-policy'
import { evaluateConnectionRuntime } from '@/lib/connections/registry'
import type { VerifiedUserPrincipal } from '@/lib/connections/principal'
import { db } from '@/lib/db'
import { connectionExecutionGrants, connectionOrganizationAccess, connections, sources } from '@/lib/db/schema'

const GRANT_TTL_MS = 60_000

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueConnectionExecutionGrant(input: {
  principal: VerifiedUserPrincipal
  connectionId: string
  sourceId?: string | null
  jobId?: string | null
  purpose: 'collection' | 'test' | 'oauth-callback'
}) {
  const [connection] = await db.select().from(connections).where(eq(connections.id, input.connectionId)).limit(1)
  const access = connection
    ? await db.select({ organizationId: connectionOrganizationAccess.organizationId }).from(connectionOrganizationAccess).where(eq(connectionOrganizationAccess.connectionId, connection.id))
    : []
  const canUse = input.principal.permissions.includes('connections.use') || input.principal.permissions.includes('connections.manage')
  const visible = connection && canViewConnection(
    { userId: input.principal.userId, organizationId: input.principal.organizationId },
    connection,
    access.map((item) => item.organizationId),
  )
  if (!connection || !canUse || !visible || connection.lifecycle !== 'active' || !connection.adapterId || !connection.adapterVersion) throw new Error('Connexion non exécutable.')

  if (input.sourceId) {
    const [source] = await db.select({ id: sources.id }).from(sources).where(and(eq(sources.id, input.sourceId), eq(sources.organizationId, input.principal.organizationId), eq(sources.connectionId, connection.id))).limit(1)
    if (!source) throw new Error('Source non autorisée pour cette Connexion.')
  }

  const token = randomBytes(32).toString('base64url')
  await db.insert(connectionExecutionGrants).values({
    tokenHash: hashToken(token),
    connectionId: connection.id,
    organizationId: input.principal.organizationId,
    sourceId: input.sourceId ?? null,
    jobId: input.jobId ?? null,
    purpose: input.purpose,
    adapterId: connection.adapterId,
    adapterVersion: connection.adapterVersion,
    expiresAt: new Date(Date.now() + GRANT_TTL_MS),
    createdByUserId: input.principal.userId,
  })
  return token
}

export async function withConnectionExecutionGrant<T>(input: {
  token: string
  principal: Pick<VerifiedUserPrincipal, 'userId' | 'organizationId'>
  sourceId?: string | null
  jobId?: string | null
  purpose: 'collection' | 'test' | 'oauth-callback'
  execute: (credential: { username: string; secret: string | null }) => Promise<T>
}) {
  const tokenHash = hashToken(input.token)
  const [grant] = await db.select().from(connectionExecutionGrants).where(and(
    eq(connectionExecutionGrants.tokenHash, tokenHash),
    eq(connectionExecutionGrants.organizationId, input.principal.organizationId),
    eq(connectionExecutionGrants.createdByUserId, input.principal.userId),
    eq(connectionExecutionGrants.purpose, input.purpose),
    isNull(connectionExecutionGrants.consumedAt),
    isNull(connectionExecutionGrants.revokedAt),
    gt(connectionExecutionGrants.expiresAt, new Date()),
  )).limit(1)
  if (!grant || (grant.sourceId ?? null) !== (input.sourceId ?? null) || (grant.jobId ?? null) !== (input.jobId ?? null)) throw new Error('Grant d’exécution invalide ou expiré.')

  const [claimed] = await db.update(connectionExecutionGrants)
    .set({ consumedAt: new Date() })
    .where(and(eq(connectionExecutionGrants.id, grant.id), isNull(connectionExecutionGrants.consumedAt), isNull(connectionExecutionGrants.revokedAt), gt(connectionExecutionGrants.expiresAt, new Date())))
    .returning({ id: connectionExecutionGrants.id })
  if (!claimed) throw new Error('Grant d’exécution déjà consommé.')

  const [connection] = await db.select().from(connections).where(eq(connections.id, grant.connectionId)).limit(1)
  if (!connection || connection.lifecycle !== 'active' || connection.adapterId !== grant.adapterId || connection.adapterVersion !== grant.adapterVersion || !connection.methodId || !connection.methodVersion || !connection.serviceId) throw new Error('Connexion modifiée ou indisponible.')

  const runtime = await evaluateConnectionRuntime({ methodId: connection.methodId, methodVersion: connection.methodVersion, serviceId: connection.serviceId, adapterId: connection.adapterId, adapterVersion: connection.adapterVersion })
  if (!runtime.usable) throw new Error('La méthode ou l’adaptateur n’est plus disponible.')

  const secret = connection.methodId === 'NONE'
    ? null
    : await readSecret(connection.secretRef, { organizationId: connection.organizationId, connectionId: connection.id, fieldCode: 'credential', purpose: 'execute' }) ?? readLegacySecret(connection.secretCiphertext, connection.id)
  if (connection.methodId !== 'NONE' && !secret) throw new Error('Secret indisponible.')

  return input.execute({ username: connection.username ?? '', secret })
}
