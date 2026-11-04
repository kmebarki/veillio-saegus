import type { AuthMethodId } from '@/lib/connector-service-catalog'

export type AuthMethodDefinition = {
  id: AuthMethodId
  label: string
  description: string
  transport: string
  status: 'available' | 'shadow' | 'proposal-only'
  version: string
  sensitive: boolean
}

const AUTH_METHODS: AuthMethodDefinition[] = [
  { id: 'NONE', label: 'Aucune authentification', description: 'Ressource publique accessible sans identifiant.', transport: 'Aucun', status: 'shadow', version: '1.3.0', sensitive: false },
  { id: 'API_KEY', label: 'Clé API', description: 'Clé transmise par en-tête HTTP ou paramètre selon le contrat.', transport: 'En-tête ou requête', status: 'shadow', version: '1.3.0', sensitive: true },
  { id: 'BASIC_AUTH', label: 'HTTP Basic', description: 'Identifiant et mot de passe encodés dans Authorization.', transport: 'En-tête Authorization', status: 'shadow', version: '1.3.0', sensitive: true },
  { id: 'BEARER_TOKEN', label: 'Jeton Bearer', description: 'Jeton d’accès transmis dans Authorization.', transport: 'En-tête Authorization', status: 'shadow', version: '1.3.0', sensitive: true },
  { id: 'OAUTH2_AUTH_CODE', label: 'OAuth 2 — Authorization Code', description: 'Autorisation interactive déléguée par un utilisateur.', transport: 'Protocole OAuth 2', status: 'shadow', version: '1.3.0', sensitive: true },
  { id: 'OAUTH2_CLIENT', label: 'OAuth 2 — Client Credentials', description: 'Autorisation applicative sans utilisateur.', transport: 'Protocole OAuth 2', status: 'shadow', version: '1.3.0', sensitive: true },
  { id: 'USER_PASSWORD', label: 'Identifiant / mot de passe', description: 'Identifiants propres au protocole du service.', transport: 'Protocole spécifique', status: 'shadow', version: '1.3.0', sensitive: true },
  { id: 'SERVICE_ACCOUNT', label: 'Compte de service', description: 'Identité technique fournie par la plateforme distante.', transport: 'Jeton ou assertion signée', status: 'shadow', version: '1.3.0', sensitive: true },
  { id: 'CUSTOM', label: 'Méthode personnalisée', description: 'Méthode proposée, soumise à validation et implémentation technique.', transport: 'À définir', status: 'proposal-only', version: '1.1', sensitive: true },
]

export interface AuthMethodRegistry {
  list(): AuthMethodDefinition[]
  get(id: AuthMethodId): AuthMethodDefinition | undefined
  listSupported(ids: AuthMethodId[]): AuthMethodDefinition[]
  getProposalHref(): string
}

export const authMethodRegistry: AuthMethodRegistry = {
  list: () => AUTH_METHODS,
  get: (id) => AUTH_METHODS.find((method) => method.id === id),
  listSupported: (ids) => ids.map((id) => AUTH_METHODS.find((method) => method.id === id)).filter((method): method is AuthMethodDefinition => Boolean(method)),
  getProposalHref: () => '/admin/settings/authentication?intent=proposal',
}
