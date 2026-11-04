export function connectorScopeAllows(organizationId: string, connector: { organizationId: string }) {
  return connector.organizationId === organizationId
}
