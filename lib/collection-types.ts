export type CollectionState = 'scheduled' | 'running' | 'deferred' | 'completed' | 'failed'
export type CollectionTrigger = 'schedule' | 'manual_retry' | 'recovery'

export type CollectionOccurrenceSummary = {
  id: string
  watchName: string
  sourceName: string
  connectorName: string
  connectionName: string
  state: CollectionState
  trigger: CollectionTrigger
  scheduledFor: string
  startedAt: string | null
  finishedAt: string | null
  deferredUntil: string | null
  itemsRetrieved: number
  newItems: number
  duplicateItems: number
  attemptCount: number
  errorCategory: string | null
  errorCode: string | null
  errorMessage: string | null
  parentOccurrenceId: string | null
  durationMs: number | null
}

export type CollectionAttemptSummary = {
  id: string
  attemptNumber: number
  state: Exclude<CollectionState, 'scheduled'>
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  itemsRetrieved: number
  errorCategory: string | null
  errorCode: string | null
  errorMessage: string | null
  retryable: boolean
}

export type CollectionPolicySummary = {
  id: string | null
  maxParallel: number
  maxAttempts: number
  baseBackoffSeconds: number
  maxQuotaDeferralMinutes: number
  retentionDays: number
  updatedAt: string | null
}

export type CollectionsOverview = {
  organizationName: string
  viewer: {
    canRetry: boolean
    canConfigure: boolean
  }
  stats: {
    total: number
    scheduled: number
    running: number
    deferred: number
    completed: number
    failed: number
    successRate: number
    newItems: number
  }
  occurrences: CollectionOccurrenceSummary[]
  policy: CollectionPolicySummary
  refreshedAt: string
}

export type CollectionDetail = {
  occurrence: CollectionOccurrenceSummary
  attempts: CollectionAttemptSummary[]
}
