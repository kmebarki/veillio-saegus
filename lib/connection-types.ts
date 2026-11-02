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
  connectorId: string
  connectorName: string
  connectorKind: ConnectorKind
  authType: string
  keyName: string
  scope: ConnectionScope
  ownerName: string
  username: string
  hasSecret: boolean
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
}

export type ConnectionsOverview = {
  viewer: { id: string; canManage: boolean }
  organizationName: string
  connections: ConnectionSummary[]
  connectors: ConnectorChoice[]
  stats: { total: number; shared: number; personal: number; attention: number }
}
