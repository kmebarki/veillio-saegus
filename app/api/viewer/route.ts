import { NextResponse } from 'next/server'

import { getCurrentIdentity, getEffectivePermissions } from '@/lib/authorization'
import { isAdminRole, isRoleKey, ROLE_LABELS } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export async function GET() {
  const identity = await getCurrentIdentity()
  if (!identity) return NextResponse.json({ viewer: null }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

  const permissions = await getEffectivePermissions(identity.id, identity.role)
  const isAdmin = isAdminRole(identity.role)
  const firstName = identity.name.trim().split(/\s+/)[0] || identity.email

  return NextResponse.json(
    {
      viewer: {
        id: identity.id,
        name: identity.name,
        firstName,
        email: identity.email,
        role: identity.role,
        roleLabel: isRoleKey(identity.role) ? ROLE_LABELS[identity.role] : identity.role,
        permissions,
        access: {
          users: isAdmin || (identity.role === 'pilot' && Boolean(identity.teamId)),
          teams: isAdmin || permissions.includes('teams.view'),
          groups: isAdmin || permissions.includes('groups.view'),
          connectors: permissions.includes('connectors.view'),
          connections: permissions.includes('connections.view'),
          collections: permissions.includes('collections.view'),
        },
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
