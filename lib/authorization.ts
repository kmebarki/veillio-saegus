import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { organizations, permissionGroupMembers, permissionGroups, users } from '@/lib/db/schema'
import { getRolePermissions, normalizePermissions } from '@/lib/permissions'
import { isAdminRole } from '@/lib/roles'

export async function getCurrentIdentity() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const [identity] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      emailVerified: users.emailVerified,
      organizationId: users.organizationId,
      teamId: users.teamId,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (!identity || identity.status !== 'active') return null
  return identity
}

export async function requireIdentity() {
  const identity = await getCurrentIdentity()
  if (!identity) redirect('/sign-in')
  return identity
}

export async function requireAdmin() {
  const identity = await requireIdentity()
  if (!isAdminRole(identity.role)) redirect('/')
  return identity
}

export async function requireManager() {
  const identity = await requireIdentity()
  if (!isAdminRole(identity.role) && !(identity.role === 'pilot' && identity.teamId)) redirect('/')
  return identity
}

export async function requireTeamsAccess() {
  const identity = await requireIdentity()
  if (isAdminRole(identity.role)) return identity
  const permissions = await getEffectivePermissions(identity.id, identity.role)
  if (!permissions.includes('teams.view')) redirect('/')
  return identity
}

export const getEffectivePermissions = cache(async (userId: string, role: string) => {
  const groupRows = await db
    .select({ permissions: permissionGroups.permissions })
    .from(permissionGroupMembers)
    .innerJoin(permissionGroups, eq(permissionGroups.id, permissionGroupMembers.groupId))
    .where(eq(permissionGroupMembers.userId, userId))
  return normalizePermissions([...getRolePermissions(role), ...groupRows.flatMap((row) => row.permissions)])
})

export async function requirePermission(permission: string) {
  const identity = await requireIdentity()
  const permissions = await getEffectivePermissions(identity.id, identity.role)
  if (!permissions.includes(permission)) redirect('/')
  return { ...identity, permissions }
}

export async function getDefaultOrganization() {
  const [organization] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).orderBy(organizations.createdAt).limit(1)
  return organization ?? null
}
