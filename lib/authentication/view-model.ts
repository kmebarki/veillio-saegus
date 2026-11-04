import type { AuthFieldDefinition } from '@/lib/authentication/types'

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
  fields: AuthFieldDefinition[]
  transmission: { type: string; protocol: string; requiresTls: boolean }
  createdAt: string
}

export type AuthenticationOverview = {
  families: { id: string; label: string; description: string; variants: { id: string; label: string }[] }[]
  methods: AuthenticationMethodView[]
  viewer: { canCreate: boolean }
}
