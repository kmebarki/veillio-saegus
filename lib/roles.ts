export type RoleKey = 'super_admin' | 'admin' | 'pilot' | 'contributor' | 'reader'

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Super administrateur',
  admin: 'Administrateur',
  pilot: 'Manager',
  contributor: 'Contributeur',
  reader: 'Lecteur',
}

export function isRoleKey(value: string): value is RoleKey {
  return value in ROLE_LABELS
}

export function isAdminRole(role: string) {
  return role === 'super_admin' || role === 'admin'
}

export function getAssignableRoles(actorRole: string): RoleKey[] {
  if (actorRole === 'super_admin') return ['admin', 'pilot', 'contributor', 'reader']
  if (actorRole === 'admin') return ['pilot', 'contributor', 'reader']
  if (actorRole === 'pilot') return ['contributor', 'reader']
  return []
}

export function canManageTarget(actorRole: string, targetRole: string) {
  if (targetRole === 'super_admin') return false
  if (actorRole === 'super_admin') return true
  if (actorRole === 'admin') return targetRole !== 'admin'
  return false
}
