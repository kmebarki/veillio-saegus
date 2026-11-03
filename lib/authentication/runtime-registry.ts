import type { EffectiveAvailability, RuntimeEvidence } from '@/lib/authentication/types'

export type AuthRuntimeHandler = {
  key: string
  version: string
  operations: readonly string[]
}

const handlers = new Map<string, AuthRuntimeHandler>()

export function registerAuthRuntimeHandler(handler: AuthRuntimeHandler) {
  handlers.set(`${handler.key}@${handler.version}`, handler)
}

export function hasAuthRuntimeHandler(key: string | null, version: string | null) {
  return Boolean(key && version && handlers.has(`${key}@${version}`))
}

export function evaluateAvailability(evidence: RuntimeEvidence, lifecycleStatus: string): EffectiveAvailability {
  const missing: string[] = []
  if (lifecycleStatus !== 'disponible') missing.push('statut disponible')
  if (!evidence.handlerKey || !evidence.handlerVersion || !hasAuthRuntimeHandler(evidence.handlerKey, evidence.handlerVersion)) missing.push('handler déployé et enregistré')
  if (!evidence.deployed) missing.push('déploiement attesté')
  if (!evidence.contractTestsPassed) missing.push('tests contractuels')
  if (!evidence.securityReviewed) missing.push('revue de sécurité indépendante')
  if (!evidence.compatibilityVerified) missing.push('compatibilité adaptateur')
  if (!evidence.enabled) missing.push('activation runtime')
  return { available: missing.length === 0, missing }
}

export function listRegisteredAuthHandlers() {
  return [...handlers.values()]
}
