import catalogData from '@/lib/services-catalog-v3.json'
import {
  defaultConfig,
  type AuthType,
  type ConnectorCategory,
  type ConnectorConfig,
  type ConnectorKind,
} from '@/lib/connector-catalog'

export const SERVICE_CATEGORIES = catalogData.categories
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]

export type ServiceDefinition = {
  id: string
  name: string
  category: ServiceCategory
  ecosystem: string
  adapter: string
  authCandidates: AuthMethodId[]
  description: string
  api: boolean
  status: string
  custom: boolean
}

export const AUTH_METHOD_IDS = [
  'NONE',
  'API_KEY',
  'BASIC_AUTH',
  'BEARER_TOKEN',
  'OAUTH2_AUTH_CODE',
  'OAUTH2_CLIENT',
  'USER_PASSWORD',
  'SERVICE_ACCOUNT',
  'CUSTOM',
] as const

export type AuthMethodId = (typeof AUTH_METHOD_IDS)[number]

export const SERVICE_CATALOG = catalogData.services as ServiceDefinition[]

const CATEGORY_SLUGS: Record<ServiceCategory, ConnectorCategory> = {
  Web: 'websites',
  'Bases de données': 'databases',
  'Flux RSS / Atom': 'rss',
  'Réseaux sociaux': 'social',
  'Stockage cloud': 'cloud',
  'Boîtes mail': 'email',
  'Dossiers locaux': 'local',
  'Messageries collaboratives': 'collaborative',
  'Bases de connaissances': 'knowledge',
}

const OPERATIONAL_SERVICE_IDS = new Set([
  'site-web-generique-html',
  'flux-rss-2-0-generique',
  'flux-atom-1-0-generique',
  'imap-generique',
])

export function getServiceDefinition(serviceId: string) {
  return SERVICE_CATALOG.find((service) => service.id === serviceId)
}

export function getServicesByCategory(category: ServiceCategory) {
  return SERVICE_CATALOG.filter((service) => service.category === category)
}

export function isServiceOperational(service: ServiceDefinition) {
  return OPERATIONAL_SERVICE_IDS.has(service.id)
}

export function connectorKindForService(service: ServiceDefinition): ConnectorKind {
  if (service.category === 'Flux RSS / Atom') return 'rss'
  if (service.category === 'Boîtes mail') return 'imap'
  if (service.category === 'Dossiers locaux' || service.category === 'Messageries collaboratives') return 'webhook'
  if (service.category === 'Stockage cloud' && /sharepoint|onedrive|microsoft 365/i.test(`${service.name} ${service.adapter}`)) return 'm365'
  if (service.category === 'Web' && !service.api) return 'web'
  return 'api'
}

export function legacyAuthType(methodId: AuthMethodId): AuthType {
  if (methodId === 'NONE' || methodId === 'CUSTOM') return 'none'
  if (methodId === 'API_KEY') return 'api_key_header'
  if (methodId === 'BASIC_AUTH' || methodId === 'USER_PASSWORD') return 'basic'
  if (methodId === 'BEARER_TOKEN' || methodId === 'OAUTH2_AUTH_CODE') return 'bearer'
  return 'oauth_client'
}

export function configForService(service: ServiceDefinition, authMethods: AuthMethodId[]): ConnectorConfig {
  const kind = connectorKindForService(service)
  const config = defaultConfig(kind)
  const selectedMethods = authMethods.length > 0 ? authMethods : service.authCandidates.filter((method) => method !== 'CUSTOM').slice(0, 1)
  const primaryAuth = legacyAuthType(selectedMethods[0] ?? 'NONE')

  config.integration = {
    category: CATEGORY_SLUGS[service.category],
    templateId: service.id,
    parameters: {
      adapter: service.adapter,
      ecosystem: service.ecosystem,
      authMethods: selectedMethods.join(','),
      operational: String(isServiceOperational(service)),
      serviceStatus: service.status,
    },
  }
  config.auth = {
    type: primaryAuth,
    keyName: primaryAuth === 'api_key_header' ? 'X-API-Key' : primaryAuth === 'api_key_query' ? 'api_key' : '',
  }
  return config
}

export function selectedAuthMethods(config: ConnectorConfig): AuthMethodId[] {
  const value = config.integration.parameters.authMethods ?? ''
  return value.split(',').filter((method): method is AuthMethodId => AUTH_METHOD_IDS.includes(method as AuthMethodId))
}
