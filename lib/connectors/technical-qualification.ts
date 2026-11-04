import 'server-only'

import { and, eq } from 'drizzle-orm'

import { configSchema } from '@/lib/connector-catalog'
import { db } from '@/lib/db'
import { connectors } from '@/lib/db/schema'
import { applyTechnicalOperationQualification, type TechnicalOperationEvidence } from '@/lib/connectors/operation-qualification'

export async function qualifyConnectorOperation(organizationId: string, connectorId: string, evidence: TechnicalOperationEvidence) {
  return db.transaction(async (tx) => {
    const [connector] = await tx
      .select({ config: connectors.config, version: connectors.version, updatedAt: connectors.updatedAt })
      .from(connectors)
      .where(and(eq(connectors.id, connectorId), eq(connectors.organizationId, organizationId)))
      .limit(1)
    if (!connector) return { ok: false as const, reason: 'not_found' as const }

    const parsed = configSchema.safeParse(connector.config)
    if (!parsed.success) return { ok: false as const, reason: 'invalid_contract' as const }

    let qualified
    try {
      qualified = applyTechnicalOperationQualification(parsed.data, evidence)
    } catch {
      return { ok: false as const, reason: 'qualification_rejected' as const }
    }

    const [updated] = await tx
      .update(connectors)
      .set({ config: qualified, updatedAt: new Date() })
      .where(and(eq(connectors.id, connectorId), eq(connectors.organizationId, organizationId), eq(connectors.version, connector.version), eq(connectors.updatedAt, connector.updatedAt)))
      .returning({ id: connectors.id })

    return updated ? { ok: true as const } : { ok: false as const, reason: 'concurrent_update' as const }
  })
}
