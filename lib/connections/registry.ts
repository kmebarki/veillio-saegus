import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { authMethodVersions } from '@/lib/db/schema'

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
    .select({ version: authMethodVersions.version })
    .from(authMethodVersions)
    .where(and(eq(authMethodVersions.methodId, target.methodId), eq(authMethodVersions.version, target.methodVersion)))
    .limit(1)

  return method
    ? { usable: true, methodVersion: method.version, handlerKey: null, handlerVersion: null, reasons: [] }
    : { usable: false, methodVersion: target.methodVersion, handlerKey: null, handlerVersion: null, reasons: ['méthode d’authentification introuvable'] }
}

export async function resolveOperationalRuntime(input: Omit<ConnectionRuntimeTarget, 'methodVersion'>): Promise<RuntimeDecision> {
  const [method] = await db
    .select({ version: authMethodVersions.version })
    .from(authMethodVersions)
    .where(eq(authMethodVersions.methodId, input.methodId))
    .orderBy(desc(authMethodVersions.createdAt))
    .limit(1)

  return method
    ? { usable: true, methodVersion: method.version, handlerKey: null, handlerVersion: null, reasons: [] }
    : { usable: false, methodVersion: null, handlerKey: null, handlerVersion: null, reasons: ['méthode d’authentification introuvable'] }
}
