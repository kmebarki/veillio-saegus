import type { ConnectorHealth, ConnectorKind, ConnectorStatus } from '@/lib/connector-catalog'

export type ConnectionScope = 'organization' | 'user'

export type ConnectionSecretInput = { mode: 'keep' | 'set'; value: string }

export type ConnectionOption = {
  id: string
  name: string
  scope: ConnectionScope
}

export type ConnectionSummary = {
  id: string
  name: string
  description: string
  connectorId: string
  connectorName: string
  connectorKind: ConnectorKind
  connectorUrl: string
  host: string
  insecure: boolean
  authType: string
  keyName: string
  scope: ConnectionScope
  ownerName: string
  username: string
  hasSecret: boolean
  secretHint: string | null
  secretRotatedAt: string
  secretAgeDays: number
  expiresAt: string | null
  expiresInDays: number | null
  health: ConnectorHealth
  version: number
  lastCheckAt: string | null
  lastCheckMessage: string | null
  testedCurrentVersion: boolean
  canEdit: boolean
  createdAt: string
  updatedAt: string
}

export type ConnectorChoice = {
  id: string
  name: string
  kind: ConnectorKind
  status: ConnectorStatus
  authType: string
  keyName: string
  host: string
  insecure: boolean
  sharedCount: number
}

export type ConnectionsOverview = {
  viewer: { id: string; canManage: boolean }
  organizationName: string
  connections: ConnectionSummary[]
  connectors: ConnectorChoice[]
  stats: { total: number; shared: number; personal: number; attention: number }
}

export type ConnectionActivityEntry = { id: number; label: string; detail: string; actor: string; at: string }
