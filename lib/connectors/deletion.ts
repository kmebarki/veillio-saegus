export type ConnectorDeletionDecision =
  | { type: 'active' }
  | { type: 'dependencies'; connectionCount: number; sourceCount: number }
  | { type: 'deletable' }

export function connectorDeletionDecision(input: { status: string; connectionCount: number; sourceCount: number }): ConnectorDeletionDecision {
  if (input.status === 'active') return { type: 'active' }
  if (input.connectionCount > 0 || input.sourceCount > 0) {
    return { type: 'dependencies', connectionCount: input.connectionCount, sourceCount: input.sourceCount }
  }
  return { type: 'deletable' }
}
