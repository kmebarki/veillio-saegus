import type { ConnectorHealth, ConnectorKind, ConnectorStatus } from '@/lib/connector-catalog'

export type ConnectionScope = 'private' | 'public' | 'organization'
export type ConnectionLifecycle = 'draft' | 'active' | 'suspended' | 'archived'
export type ConnectionHealth = 'unverified' | 'running' | 'healthy' | 'degraded' | 'error' | 'expired' | 'indeterminate'

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
  logoUrl: string
  connectorId: string
  connectorName: string
  connectorLogoUrl: string
  connectorKind: ConnectorKind
  connectorUrl: string
  host: string
  insecure: boolean
  authType: string
  keyName: string
  scope: ConnectionScope
  lifecycle: ConnectionLifecycle
  connectionHealth: ConnectionHealth
  origin: 'manual' | 'source' | 'automatic_none' | 'migration'
  revision: number
  technicalRevision: number
  ownerName: string
  username: string
  hasSecret: boolean
  methodId: string
  methodVersion: string
  adapterId: string
  adapterVersion: string
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
  logoUrl: string
  kind: ConnectorKind
  status: ConnectorStatus
  authType: string
  requiresAuth: boolean
  keyName: string
  host: string
  insecure: boolean
  sharedCount: number
  runtimeAvailable: boolean
  runtimeReason: string
}

export type ConnectionsOverview = {
  viewer: { id: string; canManage: boolean }
  organizationName: string
  connections: ConnectionSummary[]
  connectors: ConnectorChoice[]
  stats: { total: number; shared: number; personal: number; attention: number }
}

export type ConnectionActivityEntry = { id: number; label: string; detail: string; actor: string; at: string }
