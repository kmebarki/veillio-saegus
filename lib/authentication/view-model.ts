import type { AuthFieldDefinition, AuthLifecycleStatus } from '@/lib/authentication/types'

export type AuthenticationMethodView = {
  id: string
  methodId: string
  displayName: string
  description: string
  familyId: string
  familyLabel: string
  variantId: string | null
  variantLabel: string | null
  version: string
  status: AuthLifecycleStatus
  statusReason: string
  fields: AuthFieldDefinition[]
  transmission: { type: string; protocol: string; requiresTls: boolean; bindingsCount: number }
  runtime: {
    available: boolean
    missing: string[]
    handlerKey: string | null
    handlerVersion: string | null
    handlerRegistered: boolean
    deployed: boolean
    contractTestsPassed: boolean
    securityReviewed: boolean
    enabled: boolean
    updatedAt: string | null
  }
  compatibilityCount: number
  authorUserId: string | null
  reviewerUserId: string | null
  reviewedAt: string | null
  isImmutable: boolean
  createdAt: string
}

export type AuthenticationOverview = {
  contractVersion: string
  families: { id: string; label: string; description: string; variants: { id: string; label: string }[] }[]
  methods: AuthenticationMethodView[]
  stats: { methods: number; families: number; available: number; awaitingReview: number; drafts: number }
  viewer: { canPropose: boolean; canReview: boolean; canPublish: boolean; canDeactivate: boolean }
}
