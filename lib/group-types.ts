import type { RoleKey } from '@/lib/roles'

export type GroupViewer = {
  id: string
  role: RoleKey
  canManage: boolean
  permissions: string[]
  isSuperAdmin: boolean
}

export type GroupSummary = {
  id: string
  name: string
  description: string
  permissions: string[]
  memberCount: number
  members: { id: string; name: string; image: string | null; initials: string }[]
  createdAt: string
  updatedAt: string
  version: number
  editable: boolean
  lockedReason: string | null
}

export type GroupMember = {
  id: string
  name: string
  email: string
  image: string | null
  initials: string
  role: string
  status: string
  addedAt: string
  removable: boolean
}

export type GroupCandidate = {
  id: string
  name: string
  email: string
  image: string | null
  initials: string
  role: string
}

export type GroupHistoryEntry = {
  id: number
  label: string
  detail: string
  actor: string
  at: string
}

export type GroupDetail = {
  group: GroupSummary
  members: GroupMember[]
  candidates: GroupCandidate[]
  grantable: string[]
  history: GroupHistoryEntry[]
}

export type RoleMatrixColumn = { role: RoleKey; label: string; userCount: number; permissions: string[] }

export type GroupsOverview = {
  viewer: GroupViewer
  organizationName: string
  groups: GroupSummary[]
  roles: RoleMatrixColumn[]
}
