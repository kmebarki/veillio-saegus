export type ConnectionAccessPrincipal = {
  userId: string
  organizationId: string | null
}

export type ConnectionAccessResource = {
  scope: string
  ownerKind: string | null
  ownerId: string | null
  lifecycle: string
}

export function canViewConnection(
  principal: ConnectionAccessPrincipal,
  connection: ConnectionAccessResource,
  authorizedOrganizationIds: readonly string[],
) {
  if (connection.scope === 'private') {
    return connection.ownerKind === 'user' && connection.ownerId === principal.userId
  }
  if (connection.scope === 'public') return true
  return Boolean(principal.organizationId && authorizedOrganizationIds.includes(principal.organizationId))
}

export function canMutateConnection(principal: ConnectionAccessPrincipal, connection: ConnectionAccessResource) {
  if (connection.lifecycle === 'archived') return false
  if (connection.ownerKind === 'user') return connection.ownerId === principal.userId
  return connection.ownerKind === 'organization' && connection.ownerId === principal.organizationId
}
