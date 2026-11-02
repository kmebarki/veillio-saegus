import type { RoleKey } from '@/lib/roles'

export type AdminViewer = {
  id: string
  role: RoleKey
  teamId: string | null
  canAdminister: boolean
  assignableRoles: RoleKey[]
}

export type AdminUser = {
  id: string
  name: string
  email: string
  image: string | null
  initials: string
  roleKey: RoleKey
  role: string
  teamId: string | null
  team: string
  status: string
  lastSeen: string
  manageable: boolean
}

export type AdminAdmission = {
  id: string
  name: string
  email: string
  initials: string
  requestedAt: string
  requestedRole: string
  requestedRoleKey: RoleKey
  declaredTeamId: string | null
  declaredTeam: string
  message: string
}

export type AdminInvitation = {
  id: string
  name: string
  email: string
  initials: string
  role: string
  team: string
  status: string
  sentAt: string
  expiresAt: string
  invitedBy: string
}

export type AdminTeam = { id: string; name: string; memberCount: number }
export type AdminDomain = { id: string; domain: string; autoAdmit: boolean }
export type AdminOrganization = { id: string; name: string; teams: AdminTeam[]; domains: AdminDomain[] }

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }
