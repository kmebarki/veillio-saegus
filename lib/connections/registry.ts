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
  const [method] = await db
    .select({ version: authMethodVersions.version, status: authMethodVersions.status })
    .from(authMethodVersions)
    .where(and(eq(authMethodVersions.methodId, target.methodId), eq(authMethodVersions.version, target.methodVersion)))
    .limit(1)

  if (!method) return { usable: false, methodVersion: target.methodVersion, handlerKey: null, handlerVersion: null, reasons: ['méthode d’authentification introuvable'] }

  const [evidence] = await db
    .select({
      handlerKey: authRuntimeEvidence.handlerKey,
      handlerVersion: authRuntimeEvidence.handlerVersion,
      deployed: authRuntimeEvidence.deployed,
      securityReviewed: authRuntimeEvidence.securityReviewed,
      contractTestsPassed: authRuntimeEvidence.contractTestsPassed,
      enabled: authRuntimeEvidence.enabled,
    })
    .from(authRuntimeEvidence)
    .where(and(eq(authRuntimeEvidence.methodId, target.methodId), eq(authRuntimeEvidence.methodVersion, target.methodVersion)))
    .limit(1)

  const [compatibility] = await db
    .select({ enabled: authCompatibilities.enabled })
    .from(authCompatibilities)
    .where(and(
      eq(authCompatibilities.methodId, target.methodId),
      eq(authCompatibilities.methodVersion, target.methodVersion),
      eq(authCompatibilities.serviceId, target.serviceId),
      eq(authCompatibilities.adapterId, target.adapterId),
      eq(authCompatibilities.adapterVersion, target.adapterVersion),
      eq(authCompatibilities.enabled, true),
    ))
    .limit(1)

  if (!evidence) return { usable: false, methodVersion: method.version, handlerKey: null, handlerVersion: null, reasons: ['preuve runtime absente'] }

  const availability = evaluateAvailability({ ...evidence, compatibilityVerified: Boolean(compatibility) }, method.status)
  return {
    usable: availability.available,
    methodVersion: method.version,
    handlerKey: evidence.handlerKey,
    handlerVersion: evidence.handlerVersion,
    reasons: availability.missing,
  }
}

export async function resolveOperationalRuntime(input: Omit<ConnectionRuntimeTarget, 'methodVersion'>): Promise<RuntimeDecision> {
  const versions = await db
    .select({ version: authMethodVersions.version })
    .from(authMethodVersions)
    .where(eq(authMethodVersions.methodId, input.methodId))
    .orderBy(desc(authMethodVersions.createdAt))

  if (versions.length === 0) return { usable: false, methodVersion: null, handlerKey: null, handlerVersion: null, reasons: ['méthode d’authentification introuvable'] }

  let latestDecision: RuntimeDecision | null = null
  for (const version of versions) {
    const decision = await evaluateConnectionRuntime({ ...input, methodVersion: version.version })
    if (decision.usable) return decision
    latestDecision ??= decision
  }
  return latestDecision ?? { usable: false, methodVersion: null, handlerKey: null, handlerVersion: null, reasons: ['aucune version runtime disponible'] }
}
