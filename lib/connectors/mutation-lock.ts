import { sql, type SQL } from 'drizzle-orm'

type SqlExecutor = { execute(query: SQL): unknown }

export function connectorMutationResource(connectorId: string) {
  return `connector:${connectorId}`
}

export async function lockConnectorMutation(executor: SqlExecutor, connectorId: string) {
  await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended(${connectorMutationResource(connectorId)}::text, 0))`)
}
