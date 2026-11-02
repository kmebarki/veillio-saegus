import { z } from 'zod'

export const CONNECTOR_KINDS = ['rss', 'web', 'api'] as const
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number]

export const CONNECTOR_STATUSES = ['draft', 'active', 'paused'] as const
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number]

export type ConnectorHealth = 'ok' | 'warning' | 'error' | 'unknown'

export type ConnectorKindInfo = {
  kind: ConnectorKind
  label: string
  tagline: string
  description: string
  accent: 'violet' | 'sky' | 'amber'
  strengths: string[]
  requires: string
}

export const CONNECTOR_CATALOG: ConnectorKindInfo[] = [
  {
    kind: 'rss',
    label: 'Flux RSS / Atom',
    tagline: 'Blogs, médias, publications officielles',
    description: 'Lit un flux RSS 0.9x/2.0, Atom ou RDF. Le format est détecté automatiquement.',
    accent: 'violet',
    strengths: ['Détection automatique du format', 'Dédoublonnage par identifiant', 'Aucun mapping à écrire'],
    requires: 'URL du flux',
  },
  {
    kind: 'web',
    label: 'Page web',
    tagline: 'Sites sans flux, pages de listing',
    description: 'Extrait des articles d’une page HTML grâce à des sélecteurs CSS que vous définissez.',
    accent: 'sky',
    strengths: ['Sélecteurs CSS testables', 'Liens relatifs résolus', 'Aperçu des éléments extraits'],
    requires: 'URL et sélecteurs CSS',
  },
  {
    kind: 'api',
    label: 'API JSON',
    tagline: 'Services et bases documentaires',
    description: 'Interroge une API REST renvoyant du JSON, avec authentification, pagination et mapping de champs.',
    accent: 'amber',
    strengths: ['Clé API, Bearer, Basic', 'Pagination page, offset, curseur', 'Mapping de champs par chemin'],
    requires: 'URL, chemin des éléments et champs',
  },
]

export const COMING_SOON_KINDS = [
  { label: 'Messagerie (IMAP)', tagline: 'Newsletters et alertes e-mail' },
  { label: 'Webhook entrant', tagline: 'Réception poussée signée' },
  { label: 'Microsoft 365', tagline: 'SharePoint et OneDrive' },
  { label: 'Slack / Teams', tagline: 'Canaux de partage' },
]

export function getKindInfo(kind: string) {
  return CONNECTOR_CATALOG.find((item) => item.kind === kind)
}

export function isConnectorKind(value: string): value is ConnectorKind {
  return (CONNECTOR_KINDS as readonly string[]).includes(value)
}

export const AUTH_TYPES = ['none', 'basic', 'bearer', 'api_key_header', 'api_key_query'] as const
export type AuthType = (typeof AUTH_TYPES)[number]

export const AUTH_LABELS: Record<AuthType, { label: string; hint: string }> = {
  none: { label: 'Aucune', hint: 'Ressource publique.' },
  basic: { label: 'Basic (identifiant + mot de passe)', hint: 'En-tête Authorization: Basic …' },
  bearer: { label: 'Jeton Bearer', hint: 'En-tête Authorization: Bearer …' },
  api_key_header: { label: 'Clé API dans un en-tête', hint: 'Ex. X-API-Key: …' },
  api_key_query: { label: 'Clé API dans l’URL', hint: 'Ex. ?api_key=… (moins sûr : visible dans les journaux du fournisseur)' },
}

export const DEDUPE_OPTIONS = [
  { value: 'link', label: 'Lien de l’article' },
  { value: 'guid', label: 'Identifiant du flux (guid)' },
  { value: 'title', label: 'Titre' },
] as const

export const PAGINATION_TYPES = ['none', 'page', 'offset', 'cursor'] as const

export const FORBIDDEN_HEADERS = ['host', 'content-length', 'connection', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'authorization', 'cookie', 'accept-encoding']

export const DEFAULT_USER_AGENT = 'VeillioBot/1.0 (+collecte de veille)'

export type KeyValue = { name: string; value: string }

export type ApiPagination = { type: (typeof PAGINATION_TYPES)[number]; param: string; sizeParam: string; pageSize: number; maxPages: number; cursorPath: string }

export const MAX_API_ENDPOINTS = 50

export type ApiEndpoint = {
  id: string
  label: string
  summary: string
  url: string
  method: 'GET' | 'POST'
  query: KeyValue[]
  body: string
  itemsPath: string
  titlePath: string
  linkPath: string
  datePath: string
  summaryPath: string
  pagination: ApiPagination
}

export type ConnectorConfig = {
  url: string
  auth: { type: AuthType; keyName: string }
  http: { timeoutSec: number; userAgent: string; headers: KeyValue[]; followRedirects: boolean; maxItems: number }
  retry: { maxAttempts: number; backoffSec: number }
  dedupe: 'link' | 'guid' | 'title'
  web: { itemSelector: string; titleSelector: string; linkSelector: string; dateSelector: string; summarySelector: string }
  api: {
    method: 'GET' | 'POST'
    query: KeyValue[]
    body: string
    itemsPath: string
    titlePath: string
    linkPath: string
    datePath: string
    summaryPath: string
    pagination: ApiPagination
    endpoints: ApiEndpoint[]
    activeEndpointId: string
  }
}

export function defaultConfig(kind: ConnectorKind): ConnectorConfig {
  return {
    url: '',
    auth: { type: 'none', keyName: kind === 'api' ? 'X-API-Key' : '' },
    http: { timeoutSec: 15, userAgent: DEFAULT_USER_AGENT, headers: [], followRedirects: true, maxItems: 100 },
    retry: { maxAttempts: 3, backoffSec: 30 },
    dedupe: kind === 'rss' ? 'guid' : 'link',
    web: { itemSelector: 'article', titleSelector: 'h2 a', linkSelector: 'h2 a', dateSelector: 'time', summarySelector: 'p' },
    api: {
      method: 'GET',
      query: [],
      body: '',
      itemsPath: 'items',
      titlePath: 'title',
      linkPath: 'url',
      datePath: 'published_at',
      summaryPath: 'summary',
      pagination: { type: 'none', param: 'page', sizeParam: 'limit', pageSize: 50, maxPages: 3, cursorPath: 'next_cursor' },
      endpoints: [],
      activeEndpointId: '',
    },
  }
}

const headerName = z
  .string()
  .trim()
  .min(1, 'Nom d’en-tête ou de paramètre vide.')
  .max(64, 'Nom trop long (64 caractères maximum).')
  .regex(/^[A-Za-z0-9_.\-[\]]+$/, 'Nom invalide : lettres, chiffres, tiret, point et underscore uniquement.')

const keyValue = z.object({ name: headerName, value: z.string().max(500, 'Valeur trop longue (500 caractères maximum).') })

const selector = z.string().trim().max(200, 'Sélecteur trop long (200 caractères maximum).')
const path = z.string().trim().max(120, 'Chemin trop long (120 caractères maximum).').regex(/^[A-Za-z0-9_$.\-[\]]*$/, 'Chemin invalide : utilisez la notation a.b[0].c.')

const paginationSchema = z.object({
  type: z.enum(PAGINATION_TYPES),
  param: z.string().trim().max(64),
  sizeParam: z.string().trim().max(64),
  pageSize: z.number().int().min(1).max(500, '500 éléments par page maximum.'),
  maxPages: z.number().int().min(1).max(10, '10 pages maximum.'),
  cursorPath: path,
})

const endpointSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(300),
  url: z.string().trim().min(1).max(2000),
  method: z.enum(['GET', 'POST']),
  query: z.array(keyValue).max(15, '15 paramètres maximum.'),
  body: z.string().max(5000),
  itemsPath: path,
  titlePath: path,
  linkPath: path,
  datePath: path,
  summaryPath: path,
  pagination: paginationSchema,
})

export const configSchema = z.object({
  url: z.string().trim().min(1, 'L’URL est obligatoire.').max(2000, 'URL trop longue (2000 caractères maximum).'),
  auth: z.object({
    type: z.enum(AUTH_TYPES),
    keyName: z.string().trim().max(64),
  }),
  http: z.object({
    timeoutSec: z.number().int().min(2, 'Délai minimum : 2 s.').max(30, 'Délai maximum : 30 s.'),
    userAgent: z.string().trim().min(3, 'User-Agent trop court.').max(200, 'User-Agent trop long.').regex(/^[\x20-\x7e]+$/, 'User-Agent : caractères ASCII uniquement.'),
    headers: z.array(keyValue).max(10, '10 en-têtes personnalisés maximum.'),
    followRedirects: z.boolean(),
    maxItems: z.number().int().min(1, 'Au moins 1 élément.').max(500, '500 éléments maximum par collecte.'),
  }),
  retry: z.object({
    maxAttempts: z.number().int().min(1).max(5, '5 tentatives maximum.'),
    backoffSec: z.number().int().min(5, 'Attente minimale : 5 s.').max(3600, 'Attente maximale : 1 h.'),
  }),
  dedupe: z.enum(['link', 'guid', 'title']),
  web: z.object({
    itemSelector: selector,
    titleSelector: selector,
    linkSelector: selector,
    dateSelector: selector,
    summarySelector: selector,
  }),
  api: z.object({
    method: z.enum(['GET', 'POST']),
    query: z.array(keyValue).max(15, '15 paramètres maximum.'),
    body: z.string().max(5000, 'Corps trop long (5000 caractères maximum).'),
    itemsPath: path,
    titlePath: path,
    linkPath: path,
    datePath: path,
    summaryPath: path,
    pagination: paginationSchema,
    endpoints: z.array(endpointSchema).max(MAX_API_ENDPOINTS, `${MAX_API_ENDPOINTS} endpoints maximum.`).default([]),
    activeEndpointId: z.string().trim().max(64).default(''),
  }),
})

export type ValidationIssue = string

export function validateKindConfig(kind: ConnectorKind, config: ConnectorConfig): ValidationIssue | null {
  if ((config.auth.type === 'api_key_header' || config.auth.type === 'api_key_query') && !config.auth.keyName) return 'Indiquez le nom de l’en-tête ou du paramètre qui porte la clé.'
  if (kind === 'web') {
    if (!config.web.itemSelector) return 'Le sélecteur des éléments est obligatoire.'
    if (!config.web.titleSelector) return 'Le sélecteur du titre est obligatoire.'
    if (!config.web.linkSelector) return 'Le sélecteur du lien est obligatoire.'
  }
  if (kind === 'api') {
    if (!config.api.titlePath) return 'Le chemin du titre est obligatoire.'
    if (!config.api.linkPath) return 'Le chemin du lien est obligatoire.'
    if (config.api.method === 'POST' && config.api.body.trim()) {
      try {
        JSON.parse(config.api.body)
      } catch {
        return 'Le corps de la requête doit être un JSON valide.'
      }
    }
    const pagination = config.api.pagination
    if (pagination.type !== 'none' && !pagination.param) return 'Indiquez le nom du paramètre de pagination.'
    if (pagination.type === 'cursor' && !pagination.cursorPath) return 'Indiquez le chemin du curseur de page suivante dans la réponse.'
  }
  const forbidden = config.http.headers.find((header) => FORBIDDEN_HEADERS.includes(header.name.toLowerCase()))
  if (forbidden) return `L’en-tête « ${forbidden.name} » est réservé : utilisez l’authentification pour les identifiants.`
  return null
}

export function needsSecret(type: AuthType) {
  return type !== 'none'
}

export function secretLabel(type: AuthType) {
  return type === 'basic' ? 'Mot de passe' : type === 'bearer' ? 'Jeton' : 'Clé API'
}
