import { and, desc, eq } from 'drizzle-orm'

import { evaluateAvailability } from '@/lib/authentication/runtime-registry'
import { db } from '@/lib/db'
import { authCompatibilities, authMethodVersions, authRuntimeEvidence } from '@/lib/db/schema'

export type ConnectionRuntimeTarget = {
  methodId: string
  methodVersion: string
  serviceId: string
  adapterId: string
  adapterVersion: string
}

export type RuntimeDecision = {
  usable: boolean
  methodVersion: string | null
  handlerKey: string | null
  handlerVersion: string | null
  reasons: string[]
}

export async function evaluateConnectionRuntime(target: ConnectionRuntimeTarget): Promise<RuntimeDecision> {
  const [versionRows, compatibilityRows, evidenceRows] = await Promise.all([
    db.select({ status: authMethodVersions.status }).from(authMethodVersions).where(and(eq(authMethodVersions.methodId, target.methodId), eq(authMethodVersions.version, target.methodVersion))).limit(1),
    db.select({ enabled: authCompatibilities.enabled }).from(authCompatibilities).where(and(eq(authCompatibilities.methodId, target.methodId), eq(authCompatibilities.methodVersion, target.methodVersion), eq(authCompatibilities.serviceId, target.serviceId), eq(authCompatibilities.adapterId, target.adapterId), eq(authCompatibilities.adapterVersion, target.adapterVersion))).limit(1),
    db.select().from(authRuntimeEvidence).where(and(eq(authRuntimeEvidence.methodId, target.methodId), eq(authRuntimeEvidence.methodVersion, target.methodVersion))).limit(1),
  ])

  const evidence = evidenceRows[0]
  if (!evidence) return { usable: false, methodVersion: target.methodVersion, handlerKey: null, handlerVersion: null, reasons: ['preuves runtime absentes'] }

  const compatibilityVerified = compatibilityRows[0]?.enabled === true
  const availability = evaluateAvailability({ ...evidence, compatibilityVerified }, versionRows[0]?.status ?? 'introuvable')
  return { usable: availability.available, methodVersion: target.methodVersion, handlerKey: evidence.handlerKey, handlerVersion: evidence.handlerVersion, reasons: availability.missing }
}

export async function resolveOperationalRuntime(input: Omit<ConnectionRuntimeTarget, 'methodVersion'>): Promise<RuntimeDecision> {
  const versions = await db
    .select({ version: authMethodVersions.version })
    .from(authMethodVersions)
    .where(and(eq(authMethodVersions.methodId, input.methodId), eq(authMethodVersions.status, 'disponible')))
    .orderBy(desc(authMethodVersions.createdAt))

  if (!versions.length) return { usable: false, methodVersion: null, handlerKey: null, handlerVersion: null, reasons: ['aucune version publiée'] }

  for (const version of versions) {
    const decision = await evaluateConnectionRuntime({ ...input, methodVersion: version.version })
    if (decision.usable) return decision
  }

  return { usable: false, methodVersion: null, handlerKey: null, handlerVersion: null, reasons: ['aucune version publiée ne possède toutes les preuves runtime et de compatibilité'] }
}
