import type { ConnectorKind } from '@/lib/connector-catalog'

export type SourceDiagnostic = 'usable' | 'attention' | 'unverified'
export type SourceScope = 'organization' | 'user'

export type SourceConnectionChoice = {
  id: string
  name: string
  scope: SourceScope
  ready: boolean
  detail: string
}

export type SourceConnectorChoice = {
  id: string
  name: string
  description: string
  kind: ConnectorKind
  category: string
  active: boolean
  ready: boolean
  requiresConnection: boolean
  healthDetail: string
  connections: SourceConnectionChoice[]
}

export type SourceCollectionEntry = {
  id: string
  watchName: string
  state: 'scheduled' | 'running' | 'deferred' | 'completed' | 'failed'
  scheduledFor: string
  finishedAt: string | null
  itemsRetrieved: number
  newItems: number
  errorMessage: string | null
}

export type SourceAuditEntry = {
  id: number
  action: string
  actor: string
  at: string
  detail: string
}

export type SourceSummary = {
  id: string
  name: string
  description: string
  imageUrl: string | null
  endpoint: string
  scope: SourceScope
  ownerName: string
  connectorId: string
  connectorName: string
  connectorKind: ConnectorKind
  connectorCategory: string
  connectionId: string | null
  connectionName: string | null
  diagnostic: SourceDiagnostic
  diagnosticLabel: string
  diagnosticDetail: string
  lastTestAt: string | null
  lastTestResult: string
  lastCollection: SourceCollectionEntry | null
  watches: string[]
  collections: SourceCollectionEntry[]
  audit: SourceAuditEntry[]
  createdAt: string
  updatedAt: string
  canManage: boolean
}

export type SourcesOverview = {
  organizationName: string
  viewer: { id: string; canManage: boolean }
  stats: { referenced: number; usable: number; attention: number; watches: number }
  sources: SourceSummary[]
  connectors: SourceConnectorChoice[]
}
