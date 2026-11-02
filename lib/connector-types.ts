import type { ConnectorConfig, ConnectorHealth, ConnectorKind, ConnectorStatus } from '@/lib/connector-catalog'

export type ConnectorViewer = {
  id: string
  canManage: boolean
}

export type ConnectorSummary = {
  id: string
  name: string
  description: string
  kind: ConnectorKind
  status: ConnectorStatus
  health: ConnectorHealth
  host: string
  version: number
  hasSecret: boolean
  authType: string
  lastCheckAt: string | null
  lastCheckMessage: string | null
  lastLatencyMs: number | null
  testedCurrentVersion: boolean
  createdAt: string
  updatedAt: string
}

export type CheckEntry = { id: string; label: string; status: 'ok' | 'warning' | 'error' | 'skipped'; detail: string }
export type SampleEntry = { title: string; link: string; date: string; summary: string }

export type ConnectorRunEntry = {
  id: number
  status: 'success' | 'warning' | 'error'
  httpStatus: number | null
  itemsFound: number | null
  durationMs: number | null
  message: string
  at: string
  actor: string
  checks: CheckEntry[]
  sample: SampleEntry[]
  finalUrl: string | null
  contentType: string | null
  bytes: number | null
}

export type ConnectorHistoryEntry = { id: number; label: string; detail: string; actor: string; at: string }

export type ConnectorDetail = {
  connector: ConnectorSummary
  config: ConnectorConfig
  runs: ConnectorRunEntry[]
  history: ConnectorHistoryEntry[]
}

export type ConnectorStats = {
  total: number
  active: number
  healthy: number
  attention: number
  avgLatencyMs: number | null
}

export type ConnectorsOverview = {
  viewer: ConnectorViewer
  organizationName: string
  connectors: ConnectorSummary[]
  stats: ConnectorStats
}

export type SecretInput = { mode: 'keep' | 'set' | 'clear'; value: string }

export type TestOutcome = {
  status: 'success' | 'warning' | 'error'
  message: string
  httpStatus: number | null
  durationMs: number
  itemsFound: number | null
  checks: CheckEntry[]
  sample: SampleEntry[]
  finalUrl?: string
  contentType?: string
  bytes?: number
}
