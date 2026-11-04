import 'server-only'

import { and, eq } from 'drizzle-orm'

import { configSchema, defaultConfig, isConnectorKind, type ConnectorConfig, type ConnectorKind } from '@/lib/connector-catalog'
import { operationsFromConfig } from '@/lib/connectors/operations'
import { db } from '@/lib/db'
import { connectors } from '@/lib/db/schema'

export async function getConnectorOperationsContract(organizationId: string, connectorId: string) {
  const [connector] = await db
    .select({ id: connectors.id, kind: connectors.kind, config: connectors.config, version: connectors.version })
    .from(connectors)
    .where(and(eq(connectors.id, connectorId), eq(connectors.organizationId, organizationId)))
    .limit(1)

  if (!connector) return null
  const kind: ConnectorKind = isConnectorKind(connector.kind) ? connector.kind : 'api'
  const parsed = configSchema.safeParse(connector.config)
  const config: ConnectorConfig = parsed.success ? parsed.data : defaultConfig(kind)

  return {
    connectorId: connector.id,
    connectorVersion: connector.version,
    operations: operationsFromConfig(config),
  }
}
