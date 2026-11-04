import { getDefaultOrganization, requirePermission } from '@/lib/authorization'

export type VerifiedUserPrincipal = {
  kind: 'user'
  userId: string
  organizationId: string
  permissions: readonly string[]
}

export async function requireConnectionPrincipal(permission = 'connections.view'): Promise<VerifiedUserPrincipal> {
  const actor = await requirePermission(permission)
  const fallbackOrganization = actor.organizationId ? null : await getDefaultOrganization()
  const organizationId = actor.organizationId ?? fallbackOrganization?.id

  if (!organizationId) throw new Error('Aucune organisation active.')

  return {
    kind: 'user',
    userId: actor.id,
    organizationId,
    permissions: actor.permissions,
  }
}

export function hasConnectionCapability(principal: VerifiedUserPrincipal, capability: string) {
  return principal.permissions.includes(capability) || principal.permissions.includes('connections.manage')
}
