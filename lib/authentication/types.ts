export type AuthLifecycleStatus = 'brouillon' | 'a_valider' | 'disponible' | 'desactivee' | 'obsolete'
export type AuthValueSource = 'connection.secretRef' | 'connection.config' | 'adapter.nonSecretConfig'
export type AuthFieldType = 'text' | 'password' | 'url' | 'dateTime' | 'list' | 'enum' | 'file' | 'secretFile' | 'certificate'

export type AuthFieldVisibility =
  | { operator: 'always' }
  | { operator: 'equals'; fieldCode: string; value: string }

export type AuthFieldDefinition = {
  code: string
  label: string
  type: AuthFieldType
  required: boolean
  secret: boolean
  description: string
  order: number
  defaultValue: string | null
  validation: { format?: string; minLength?: number; maxLength?: number; pattern?: string; enum?: string[] }
  visibility: AuthFieldVisibility
  storage?: { scope: 'connection'; mode: 'vaultRef'; readBack: false }
  valueSource: AuthValueSource
  editableInConnection: boolean
}

export type AuthBinding = {
  channel: string
  target: Record<string, unknown>
  source: Record<string, unknown>
  format: Record<string, unknown>
  required: boolean
  clientEditable: false
  note?: string
}

export type AuthMethodDefinitionV13 = {
  methodId: string
  displayName: string
  description?: string
  familyId: string
  variantId: string | null
  supportedVariantIds: string[]
  version: string
  legacyVersionLabel?: string
  schemaRevision: number
  lifecycle: { status: AuthLifecycleStatus; reason: string; approvedBy: string | null; approvedAt: string | null }
  runtime: {
    handlerKey: string | null
    handlerVersion: string | null
    deployed: boolean
    securityReviewed: boolean
    contractTestsPassed: boolean
    enabled: boolean
  }
  fieldSchema: { schemaVersion: '1.3.0'; fields: AuthFieldDefinition[] }
  transmission: {
    type: string
    protocol: string
    bindings: AuthBinding[]
    handlerOperation: string
    requiresTls: boolean
    resolvedBy: 'verifiedAdapterAndHandler'
    customHeadersAllowed: false
    policyRef: 'HTTP_TRANSMISSION_POLICY_V1_3'
    placementOptions?: Record<string, unknown>[]
    note?: string
    oauthProfileRef?: string
  }
  composition: {
    identityModel: boolean
    secondaryFactorsAllowed: string[]
    requiresAdapterDeclaration: boolean
    delegatesTo?: string
  }
  compatibility: { sourceOfTruth: 'connectors.adapterRegistry'; serviceIds: string[]; adapterIds: string[] }
}

export type AuthFamilyDefinition = {
  id: string
  label: string
  description: string
  variants: { id: string; label: string }[]
}

export type AuthReferentialV13 = {
  contractVersion: '1.3.0'
  families: AuthFamilyDefinition[]
  methods: AuthMethodDefinitionV13[]
}

export type RuntimeEvidence = {
  handlerKey: string | null
  handlerVersion: string | null
  deployed: boolean
  securityReviewed: boolean
  contractTestsPassed: boolean
  enabled: boolean
  compatibilityVerified: boolean
}

export type EffectiveAvailability = {
  available: boolean
  missing: string[]
}
