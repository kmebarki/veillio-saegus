import type { RoleKey } from '@/lib/roles'

export type TeamViewer = {
  id: string
  role: RoleKey
  teamId: string | null
  canAdminister: boolean
}

export type TeamSummary = {
  id: string
  name: string
  description: string
  archived: boolean
  leadId: string | null
  leadName: string | null
  leadImage: string | null
  leadInitials: string
  memberCount: number
  activeMemberCount: number
  pendingAdmissions: number
  pendingInvitations: number
  createdAt: string
  members: { id: string; name: string; image: string | null; initials: string }[]
}

export type TeamMember = {
  id: string
  name: string
  email: string
  image: string | null
  initials: string
  roleKey: RoleKey
  role: string
  status: string
  lastSeen: string
  isLead: boolean
  manageable: boolean
}

export type TeamAdmission = {
  id: string
  name: string
  email: string
  initials: string
  requestedRole: string
  requestedAt: string
  message: string
}

export type TeamInvitation = {
  id: string
  name: string
  email: string
  initials: string
  role: string
  status: string
  expiresAt: string
}

export type TeamHistoryEntry = {
  id: number
  label: string
  detail: string
  actor: string
  at: string
}

export type TeamDetail = {
  team: TeamSummary
  members: TeamMember[]
  admissions: TeamAdmission[]
  invitations: TeamInvitation[]
  history: TeamHistoryEntry[]
  candidates: { id: string; name: string; email: string; image: string | null; initials: string; teamName: string | null }[]
}

export type TeamsOverview = {
  viewer: TeamViewer
  organizationName: string
  teams: TeamSummary[]
}
