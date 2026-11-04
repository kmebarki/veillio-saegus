import type { EffectiveAvailability, RuntimeEvidence } from '@/lib/authentication/types'

export type AuthRuntimeHandler = {
  key: string
  version: string
  operations: readonly string[]
}

const handlers = new Map<string, AuthRuntimeHandler>()

const BUILTIN_HANDLERS: AuthRuntimeHandler[] = [
  { key: 'none', version: '1.0.0', operations: ['execute', 'test'] },
  { key: 'http-api-key', version: '1.0.0', operations: ['execute', 'test'] },
  { key: 'http-basic', version: '1.0.0', operations: ['execute', 'test'] },
  { key: 'http-bearer', version: '1.0.0', operations: ['execute', 'test'] },
  { key: 'oauth2-client-credentials', version: '1.0.0', operations: ['execute', 'test', 'refresh'] },
]

for (const handler of BUILTIN_HANDLERS) handlers.set(`${handler.key}@${handler.version}`, handler)

const BUNDLED_OPERATIONAL_TARGETS = [
  { methodId: 'NONE', methodVersion: '1.0.0', adapterId: 'rss', adapterVersion: '1.0.0', handlerKey: 'none', handlerVersion: '1.0.0' },
  { methodId: 'NONE', methodVersion: '1.0.0', adapterId: 'web', adapterVersion: '1.0.0', handlerKey: 'none', handlerVersion: '1.0.0' },
  { methodId: 'NONE', methodVersion: '1.0.0', adapterId: 'api', adapterVersion: '1.0.0', handlerKey: 'none', handlerVersion: '1.0.0' },
  { methodId: 'BASIC_AUTH', methodVersion: '1.1.0', adapterId: 'imap', adapterVersion: '1.0.0', handlerKey: 'http-basic', handlerVersion: '1.0.0' },
] as const

export function resolveBundledOperationalRuntime(target: { methodId: string; methodVersion: string; adapterId: string; adapterVersion: string }) {
  const runtime = BUNDLED_OPERATIONAL_TARGETS.find((candidate) =>
    candidate.methodId === target.methodId
    && candidate.methodVersion === target.methodVersion
    && candidate.adapterId === target.adapterId
    && candidate.adapterVersion === target.adapterVersion,
  )
  if (!runtime || !hasAuthRuntimeHandler(runtime.handlerKey, runtime.handlerVersion)) return null
  return { handlerKey: runtime.handlerKey, handlerVersion: runtime.handlerVersion }
}

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
