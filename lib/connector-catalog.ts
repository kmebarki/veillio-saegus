import { z } from 'zod'

export const CONNECTOR_KINDS = ['rss', 'web', 'api', 'imap', 'webhook', 'm365'] as const
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number]

export const HTTP_KINDS = ['rss', 'web', 'api'] as const
export type HttpKind = (typeof HTTP_KINDS)[number]

export function isHttpKind(kind: ConnectorKind): kind is HttpKind {
  return (HTTP_KINDS as readonly string[]).includes(kind)
}

export const CONNECTOR_STATUSES = ['draft', 'active', 'paused'] as const
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number]

export type ConnectorHealth = 'ok' | 'warning' | 'error' | 'unknown'

export const CONNECTOR_CATEGORIES = [
  'websites',
  'databases',
  'rss',
  'social',
  'cloud',
  'email',
  'local',
  'collaborative',
  'knowledge',
] as const
export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number]

export type ConnectorCategoryInfo = {
  id: ConnectorCategory
  label: string
  description: string
}

export const CONNECTOR_CATEGORY_CATALOG: ConnectorCategoryInfo[] = [
  { id: 'websites', label: 'Sites web', description: 'Pages publiques, sitemaps et API éditoriales.' },
  { id: 'databases', label: 'Bases de données', description: 'PostgreSQL, MySQL, SQL Server et moteurs de recherche.' },
  { id: 'rss', label: 'Flux RSS', description: 'Flux RSS, Atom et RDF normalisés.' },
  { id: 'social', label: 'Réseaux sociaux', description: 'LinkedIn, X, Reddit et YouTube.' },
  { id: 'cloud', label: 'Stockage cloud', description: 'SharePoint, OneDrive, Google Drive et Dropbox.' },
  { id: 'email', label: 'Boîtes mail', description: 'Gmail, Outlook et serveurs IMAP.' },
  { id: 'local', label: 'Dossiers locaux', description: 'Dossiers synchronisés par un agent sécurisé.' },
  { id: 'collaborative', label: 'Outils collaboratifs', description: 'Slack, Teams, Discord et webhooks métier.' },
  { id: 'knowledge', label: 'Bases de connaissances', description: 'Notion, Confluence et wikis internes.' },
]

export type ConnectorTemplateField = {
  key: string
  label: string
  placeholder: string
  hint?: string
  required?: boolean
  type?: 'text' | 'url' | 'number' | 'password'
}

export type ConnectorTemplate = {
  id: string
  category: ConnectorCategory
  label: string
  description: string
  kind: ConnectorKind
  authType?: AuthType
  fields: ConnectorTemplateField[]
}

export type ConnectorKindInfo = {
  kind: ConnectorKind
  label: string
  tagline: string
  description: string
  accent: 'violet' | 'sky' | 'amber' | 'emerald' | 'rose' | 'blue'
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
  {
    kind: 'imap',
    label: 'Messagerie (IMAP)',
    tagline: 'Newsletters et alertes e-mail',
    description: 'Lit une boîte aux lettres en lecture seule (IMAP) et transforme chaque e-mail filtré en contenu de veille.',
    accent: 'emerald',
    strengths: ['Connexion chiffrée TLS / STARTTLS', 'Filtres expéditeur, objet, ancienneté', 'Lecture seule : aucun e-mail modifié'],
    requires: 'Serveur IMAP, dossier et identifiants',
  },
  {
    kind: 'webhook',
    label: 'Webhook entrant',
    tagline: 'Réception poussée signée',
    description: 'Expose une adresse sécurisée qui reçoit des événements poussés par un service tiers, vérifiés par signature.',
    accent: 'rose',
    strengths: ['Signature HMAC-SHA256 ou jeton Bearer', 'Anti-rejeu et dédoublonnage', 'Journal des événements reçus'],
    requires: 'Secret partagé et mapping du payload',
  },
  {
    kind: 'm365',
    label: 'Microsoft 365',
    tagline: 'SharePoint et OneDrive',
    description: 'Lit des listes SharePoint, des bibliothèques de documents ou un OneDrive via Microsoft Graph.',
    accent: 'blue',
    strengths: ['Application Entra ID (sans mot de passe utilisateur)', 'Listes, bibliothèques, OneDrive', 'Clouds Global, US Gov, Chine'],
    requires: 'Tenant, ID d’application, secret client',
  },
]

export const COMING_SOON_KINDS = [{ label: 'Slack / Teams', tagline: 'Canaux de partage' }]

export function getKindInfo(kind: string) {
  return CONNECTOR_CATALOG.find((item) => item.kind === kind)
}

export function isConnectorKind(value: string): value is ConnectorKind {
  return (CONNECTOR_KINDS as readonly string[]).includes(value)
}

export const AUTH_TYPES = ['none', 'basic', 'bearer', 'api_key_header', 'api_key_query', 'webhook_hmac', 'oauth_client'] as const
export type AuthType = (typeof AUTH_TYPES)[number]

export const AUTH_LABELS: Record<AuthType, { label: string; hint: string }> = {
  none: { label: 'Aucune', hint: 'Ressource publique.' },
  basic: { label: 'Basic (identifiant + mot de passe)', hint: 'En-tête Authorization: Basic …' },
  bearer: { label: 'Jeton Bearer', hint: 'En-tête Authorization: Bearer …' },
  api_key_header: { label: 'Clé API dans un en-tête', hint: 'Ex. X-API-Key: …' },
  api_key_query: { label: 'Clé API dans l’URL', hint: 'Ex. ?api_key=… (moins sûr : visible dans les journaux du fournisseur)' },
  webhook_hmac: { label: 'Signature HMAC-SHA256', hint: 'L’expéditeur signe chaque requête avec le secret partagé.' },
  oauth_client: { label: 'Application Entra ID', hint: 'Secret client OAuth 2.0 (client credentials).' },
}

export const KIND_AUTH_TYPES: Record<ConnectorKind, readonly AuthType[]> = {
  rss: ['none', 'basic', 'bearer', 'api_key_header', 'api_key_query'],
  web: ['none', 'basic', 'bearer', 'api_key_header', 'api_key_query'],
  api: ['none', 'basic', 'bearer', 'api_key_header', 'api_key_query'],
  imap: ['basic'],
  webhook: ['webhook_hmac', 'bearer'],
  m365: ['oauth_client'],
}

const urlField = (label: string, placeholder: string, hint?: string): ConnectorTemplateField => ({ key: 'endpoint', label, placeholder, hint, required: true, type: 'url' })

export const CONNECTOR_TEMPLATES: ConnectorTemplate[] = [
  { id: 'website', category: 'websites', label: 'Site web', description: 'Extrait une liste de contenus avec des sélecteurs CSS.', kind: 'web', fields: [urlField('Adresse du site', 'https://exemple.fr/actualites')] },
  { id: 'web-api', category: 'websites', label: 'API éditoriale', description: 'Interroge une API JSON publiée par le site.', kind: 'api', fields: [urlField('Endpoint API', 'https://exemple.fr/api/articles')] },
  { id: 'postgresql', category: 'databases', label: 'PostgreSQL', description: 'Accès via une passerelle SQL HTTPS en lecture seule.', kind: 'api', authType: 'bearer', fields: [urlField('URL de la passerelle', 'https://data.exemple.fr/query'), { key: 'database', label: 'Base', placeholder: 'veille', required: true }, { key: 'query', label: 'Vue ou requête nommée', placeholder: 'latest_articles', required: true }] },
  { id: 'mysql', category: 'databases', label: 'MySQL', description: 'Accès via une passerelle SQL HTTPS en lecture seule.', kind: 'api', authType: 'bearer', fields: [urlField('URL de la passerelle', 'https://data.exemple.fr/query'), { key: 'database', label: 'Base', placeholder: 'veille', required: true }, { key: 'query', label: 'Vue ou requête nommée', placeholder: 'latest_articles', required: true }] },
  { id: 'sql-server', category: 'databases', label: 'SQL Server', description: 'Accès via une passerelle SQL HTTPS en lecture seule.', kind: 'api', authType: 'bearer', fields: [urlField('URL de la passerelle', 'https://data.exemple.fr/query'), { key: 'database', label: 'Base', placeholder: 'Veille', required: true }, { key: 'query', label: 'Vue ou procédure', placeholder: 'dbo.LatestArticles', required: true }] },
  { id: 'elasticsearch', category: 'databases', label: 'Elasticsearch', description: 'Recherche un index via son API REST.', kind: 'api', authType: 'api_key_header', fields: [urlField('Endpoint de recherche', 'https://search.exemple.fr/articles/_search'), { key: 'index', label: 'Index', placeholder: 'articles-*', required: true }] },
  { id: 'rss', category: 'rss', label: 'RSS / Atom', description: 'Détecte automatiquement RSS, Atom ou RDF.', kind: 'rss', fields: [urlField('URL du flux', 'https://exemple.fr/feed.xml')] },
  { id: 'linkedin', category: 'social', label: 'LinkedIn', description: 'Collecte les publications accessibles via une application autorisée.', kind: 'api', authType: 'bearer', fields: [urlField('Endpoint LinkedIn', 'https://api.linkedin.com/v2/posts'), { key: 'organization', label: 'Organisation ou auteur', placeholder: 'urn:li:organization:…', required: true }] },
  { id: 'x', category: 'social', label: 'X', description: 'Collecte une recherche récente via l’API X.', kind: 'api', authType: 'bearer', fields: [urlField('Endpoint X', 'https://api.x.com/2/tweets/search/recent'), { key: 'query', label: 'Requête', placeholder: 'cybersécurité lang:fr', required: true }] },
  { id: 'reddit', category: 'social', label: 'Reddit', description: 'Suit un subreddit ou une recherche JSON.', kind: 'api', authType: 'bearer', fields: [urlField('Endpoint Reddit', 'https://oauth.reddit.com/r/technology/new'), { key: 'community', label: 'Communauté', placeholder: 'technology', required: true }] },
  { id: 'youtube', category: 'social', label: 'YouTube', description: 'Suit une chaîne ou une requête via YouTube Data API.', kind: 'api', authType: 'api_key_query', fields: [urlField('Endpoint YouTube', 'https://www.googleapis.com/youtube/v3/search'), { key: 'channel', label: 'Chaîne', placeholder: 'UC…' }] },
  { id: 'm365', category: 'cloud', label: 'SharePoint / OneDrive', description: 'Lit des listes et bibliothèques via Microsoft Graph.', kind: 'm365', authType: 'oauth_client', fields: [] },
  { id: 'google-drive', category: 'cloud', label: 'Google Drive', description: 'Liste les fichiers d’un dossier via Google Drive API.', kind: 'api', authType: 'bearer', fields: [urlField('Endpoint Drive', 'https://www.googleapis.com/drive/v3/files'), { key: 'folderId', label: 'ID du dossier', placeholder: '1AbC…', required: true }] },
  { id: 'dropbox', category: 'cloud', label: 'Dropbox', description: 'Liste les fichiers d’un chemin Dropbox.', kind: 'api', authType: 'bearer', fields: [urlField('Endpoint Dropbox', 'https://api.dropboxapi.com/2/files/list_folder'), { key: 'path', label: 'Chemin', placeholder: '/Veille', required: true }] },
  { id: 'imap', category: 'email', label: 'Serveur IMAP', description: 'Lit une boîte mail standard en lecture seule.', kind: 'imap', authType: 'basic', fields: [] },
  { id: 'gmail', category: 'email', label: 'Gmail', description: 'Lit Gmail via IMAP avec un mot de passe d’application.', kind: 'imap', authType: 'basic', fields: [{ key: 'account', label: 'Adresse Gmail', placeholder: 'veille@entreprise.com', required: true }] },
  { id: 'outlook', category: 'email', label: 'Outlook', description: 'Lit Outlook / Exchange Online via IMAP.', kind: 'imap', authType: 'basic', fields: [{ key: 'account', label: 'Adresse Outlook', placeholder: 'veille@entreprise.com', required: true }] },
  { id: 'local-agent', category: 'local', label: 'Agent de dossier', description: 'Reçoit les changements d’un dossier surveillé par un agent local.', kind: 'webhook', authType: 'webhook_hmac', fields: [{ key: 'path', label: 'Chemin surveillé', placeholder: '/Documents/Veille', required: true }, { key: 'extensions', label: 'Extensions', placeholder: 'pdf, docx, txt' }] },
  { id: 'slack', category: 'collaborative', label: 'Slack', description: 'Reçoit les messages d’un canal via une application Slack.', kind: 'webhook', authType: 'webhook_hmac', fields: [{ key: 'channel', label: 'Canal', placeholder: '#veille', required: true }] },
  { id: 'teams', category: 'collaborative', label: 'Microsoft Teams', description: 'Reçoit les messages d’un canal via un webhook signé.', kind: 'webhook', authType: 'bearer', fields: [{ key: 'team', label: 'Équipe', placeholder: 'Innovation', required: true }, { key: 'channel', label: 'Canal', placeholder: 'Veille', required: true }] },
  { id: 'discord', category: 'collaborative', label: 'Discord', description: 'Reçoit les messages d’un salon via un webhook sécurisé.', kind: 'webhook', authType: 'bearer', fields: [{ key: 'channel', label: 'Salon', placeholder: '#veille', required: true }] },
  { id: 'notion', category: 'knowledge', label: 'Notion', description: 'Interroge une base Notion via son API.', kind: 'api', authType: 'bearer', fields: [urlField('Endpoint Notion', 'https://api.notion.com/v1/databases/…/query'), { key: 'databaseId', label: 'ID de la base', placeholder: 'xxxxxxxx-xxxx-…', required: true }] },
  { id: 'confluence', category: 'knowledge', label: 'Confluence', description: 'Recherche les pages d’un espace Confluence.', kind: 'api', authType: 'bearer', fields: [urlField('Endpoint Confluence', 'https://exemple.atlassian.net/wiki/api/v2/pages'), { key: 'space', label: 'Espace', placeholder: 'VEILLE', required: true }] },
  { id: 'knowledge-api', category: 'knowledge', label: 'Wiki / base interne', description: 'Interroge une base de connaissances exposée en JSON.', kind: 'api', authType: 'api_key_header', fields: [urlField('Endpoint de recherche', 'https://knowledge.exemple.fr/api/articles'), { key: 'collection', label: 'Collection', placeholder: 'veille', required: true }] },
]

export function getCategoryInfo(category: ConnectorCategory) {
  return CONNECTOR_CATEGORY_CATALOG.find((item) => item.id === category)
}

export function getConnectorTemplate(templateId: string) {
  return CONNECTOR_TEMPLATES.find((item) => item.id === templateId)
}

export function defaultAuthType(kind: ConnectorKind): AuthType {
  return KIND_AUTH_TYPES[kind][0]
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

export const IMAP_SECURITY = ['tls', 'starttls'] as const
export const IMAP_PORTS = [143, 993] as const
export const M365_CLOUDS = ['global', 'usgov', 'china'] as const
export const M365_SOURCES = ['sharepoint_list', 'sharepoint_library', 'onedrive'] as const

export const M365_CLOUD_INFO: Record<(typeof M365_CLOUDS)[number], { label: string; login: string; graph: string; sharepointSuffix: string }> = {
  global: { label: 'Microsoft 365 (mondial)', login: 'login.microsoftonline.com', graph: 'graph.microsoft.com', sharepointSuffix: '.sharepoint.com' },
  usgov: { label: 'Microsoft 365 US Government', login: 'login.microsoftonline.us', graph: 'graph.microsoft.us', sharepointSuffix: '.sharepoint.us' },
  china: { label: 'Microsoft 365 opéré par 21Vianet', login: 'login.chinacloudapi.cn', graph: 'microsoftgraph.chinacloudapi.cn', sharepointSuffix: '.sharepoint.cn' },
}

export const M365_SOURCE_LABELS: Record<(typeof M365_SOURCES)[number], { label: string; hint: string }> = {
  sharepoint_list: { label: 'Liste SharePoint', hint: 'Chaque ligne de la liste devient un contenu.' },
  sharepoint_library: { label: 'Bibliothèque de documents', hint: 'Chaque fichier d’une bibliothèque devient un contenu.' },
  onedrive: { label: 'OneDrive d’un utilisateur', hint: 'Chaque fichier d’un dossier OneDrive devient un contenu.' },
}

export type ImapConfig = {
  host: string
  port: number
  security: (typeof IMAP_SECURITY)[number]
  folder: string
  sinceDays: number
  unreadOnly: boolean
  fromFilter: string
  subjectFilter: string
  linkMode: 'sender' | 'first_link'
}

export type WebhookConfig = {
  signatureHeader: string
  timestampHeader: string
  toleranceSec: number
  idHeader: string
  itemsPath: string
  titlePath: string
  linkPath: string
  datePath: string
  summaryPath: string
  maxPayloadKb: number
  rateLimitPerMin: number
}

export type M365Config = {
  cloud: (typeof M365_CLOUDS)[number]
  tenantId: string
  clientId: string
  source: (typeof M365_SOURCES)[number]
  siteUrl: string
  listName: string
  libraryName: string
  userPrincipal: string
  folderPath: string
  fileExtensions: string
  titleField: string
  summaryField: string
  dateField: string
}

export type ConnectorIntegrationConfig = {
  category: ConnectorCategory
  templateId: string
  parameters: Record<string, string>
}

export type ConnectorConfig = {
  integration: ConnectorIntegrationConfig
  url: string
  auth: { type: AuthType; keyName: string }
  imap: ImapConfig
  webhook: WebhookConfig
  m365: M365Config
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

export const DEFAULT_IMAP: ImapConfig = { host: '', port: 993, security: 'tls', folder: 'INBOX', sinceDays: 14, unreadOnly: false, fromFilter: '', subjectFilter: '', linkMode: 'first_link' }

export const DEFAULT_WEBHOOK: WebhookConfig = {
  signatureHeader: 'X-Veillio-Signature',
  timestampHeader: 'X-Veillio-Timestamp',
  toleranceSec: 300,
  idHeader: 'X-Event-Id',
  itemsPath: '',
  titlePath: 'title',
  linkPath: 'url',
  datePath: 'published_at',
  summaryPath: 'summary',
  maxPayloadKb: 256,
  rateLimitPerMin: 120,
}

export const DEFAULT_M365: M365Config = {
  cloud: 'global',
  tenantId: '',
  clientId: '',
  source: 'sharepoint_library',
  siteUrl: '',
  listName: '',
  libraryName: 'Documents',
  userPrincipal: '',
  folderPath: '',
  fileExtensions: '',
  titleField: 'Title',
  summaryField: '',
  dateField: '',
}

const DEFAULT_CATEGORY_BY_KIND: Record<ConnectorKind, ConnectorCategory> = {
  rss: 'rss',
  web: 'websites',
  api: 'websites',
  imap: 'email',
  webhook: 'collaborative',
  m365: 'cloud',
}

export function defaultConfig(kind: ConnectorKind): ConnectorConfig {
  return {
    integration: { category: DEFAULT_CATEGORY_BY_KIND[kind], templateId: '', parameters: {} },
    url: '',
    auth: { type: defaultAuthType(kind), keyName: kind === 'api' ? 'X-API-Key' : '' },
    imap: { ...DEFAULT_IMAP },
    webhook: { ...DEFAULT_WEBHOOK },
    m365: { ...DEFAULT_M365 },
    http: { timeoutSec: kind === 'imap' || kind === 'm365' ? 20 : 15, userAgent: DEFAULT_USER_AGENT, headers: [], followRedirects: true, maxItems: 100 },
    retry: { maxAttempts: 3, backoffSec: 30 },
    dedupe: kind === 'rss' || kind === 'imap' || kind === 'webhook' || kind === 'm365' ? 'guid' : 'link',
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

export function configFromTemplate(templateId: string): { kind: ConnectorKind; config: ConnectorConfig } | null {
  const template = getConnectorTemplate(templateId)
  if (!template) return null
  const config = defaultConfig(template.kind)
  config.integration = {
    category: template.category,
    templateId: template.id,
    parameters: Object.fromEntries(template.fields.map((field) => [field.key, ''])),
  }
  if (template.authType) {
    config.auth = {
      type: template.authType,
      keyName: template.authType === 'api_key_query' ? 'key' : template.authType === 'api_key_header' ? 'X-API-Key' : '',
    }
  }
  if (template.id === 'gmail') config.imap.host = 'imap.gmail.com'
  if (template.id === 'outlook') config.imap.host = 'outlook.office365.com'
  return { kind: template.kind, config }
}

export function connectorCategoryOf(kind: ConnectorKind, config: ConnectorConfig): ConnectorCategory {
  return config.integration?.category ?? DEFAULT_CATEGORY_BY_KIND[kind]
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

const imapSchema = z.object({
  host: z.string().trim().toLowerCase().max(253, 'Nom de serveur trop long.'),
  port: z.number().int().refine((port) => (IMAP_PORTS as readonly number[]).includes(port), 'Ports autorisés : 993 (TLS) ou 143 (STARTTLS).'),
  security: z.enum(IMAP_SECURITY),
  folder: z.string().trim().min(1, 'Le dossier est obligatoire.').max(200, 'Nom de dossier trop long.'),
  sinceDays: z.number().int().min(1, 'Au moins 1 jour.').max(365, '365 jours maximum.'),
  unreadOnly: z.boolean(),
  fromFilter: z.string().trim().max(200, 'Filtre expéditeur trop long.'),
  subjectFilter: z.string().trim().max(200, 'Filtre objet trop long.'),
  linkMode: z.enum(['sender', 'first_link']),
})

const webhookSchema = z.object({
  signatureHeader: z.string().trim().max(64),
  timestampHeader: z.string().trim().max(64),
  toleranceSec: z.number().int().min(30, 'Tolérance minimale : 30 s.').max(3600, 'Tolérance maximale : 1 h.'),
  idHeader: z.string().trim().max(64),
  itemsPath: path,
  titlePath: path,
  linkPath: path,
  datePath: path,
  summaryPath: path,
  maxPayloadKb: z.number().int().min(1, '1 Ko minimum.').max(1024, '1024 Ko maximum.'),
  rateLimitPerMin: z.number().int().min(1, '1 requête par minute minimum.').max(6000, '6000 requêtes par minute maximum.'),
})

const m365Schema = z.object({
  cloud: z.enum(M365_CLOUDS),
  tenantId: z.string().trim().max(253),
  clientId: z.string().trim().max(64),
  source: z.enum(M365_SOURCES),
  siteUrl: z.string().trim().max(500),
  listName: z.string().trim().max(200),
  libraryName: z.string().trim().max(200),
  userPrincipal: z.string().trim().max(254),
  folderPath: z.string().trim().max(400),
  fileExtensions: z.string().trim().max(120),
  titleField: z.string().trim().max(80),
  summaryField: z.string().trim().max(80),
  dateField: z.string().trim().max(80),
})

export const configSchema = z.object({
  integration: z.object({
    category: z.enum(CONNECTOR_CATEGORIES),
    templateId: z.string().trim().max(80),
    parameters: z.record(z.string().max(60), z.string().trim().max(500)).default({}),
  }).default({ category: 'websites', templateId: '', parameters: {} }),
  url: z.string().trim().max(2000, 'URL trop longue (2000 caractères maximum).').default(''),
  auth: z.object({
    type: z.enum(AUTH_TYPES),
    keyName: z.string().trim().max(64),
  }),
  imap: imapSchema.default(() => ({ ...DEFAULT_IMAP })),
  webhook: webhookSchema.default(() => ({ ...DEFAULT_WEBHOOK })),
  m365: m365Schema.default(() => ({ ...DEFAULT_M365 })),
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
    body: z.string().max(5000, 'Corps trop long (5000 caract��res maximum).'),
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

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateImap(config: ConnectorConfig): ValidationIssue | null {
  const { imap } = config
  if (!imap.host) return 'Indiquez le serveur IMAP (ex. imap.exemple.fr).'
  if (!HOSTNAME.test(imap.host)) return 'Le serveur IMAP doit être un nom de domaine complet (ex. imap.exemple.fr), pas une adresse IP ni un nom interne.'
  if (imap.security === 'tls' && imap.port !== 993) return 'Le mode TLS implicite utilise le port 993.'
  if (imap.security === 'starttls' && imap.port !== 143) return 'Le mode STARTTLS utilise le port 143.'
  if (/[\u0000-\u001f]/.test(imap.folder)) return 'Le nom du dossier contient un caractère invalide.'
  return null
}

function validateWebhook(config: ConnectorConfig): ValidationIssue | null {
  const { webhook } = config
  if (config.auth.type === 'webhook_hmac') {
    if (!webhook.signatureHeader) return 'Indiquez l’en-tête qui porte la signature.'
    if (!HEADER_NAME.test(webhook.signatureHeader)) return 'Nom d’en-tête de signature invalide.'
    if (webhook.timestampHeader && !HEADER_NAME.test(webhook.timestampHeader)) return 'Nom d’en-tête d’horodatage invalide.'
  }
  if (webhook.idHeader && !HEADER_NAME.test(webhook.idHeader)) return 'Nom d’en-tête d’identifiant d’événement invalide.'
  if (!webhook.titlePath) return 'Le chemin du titre est obligatoire.'
  return null
}

function validateM365(config: ConnectorConfig): ValidationIssue | null {
  const { m365 } = config
  const tenant = m365.tenantId
  if (!tenant) return 'Indiquez l’identifiant du tenant (GUID ou domaine, ex. contoso.onmicrosoft.com).'
  if (!GUID.test(tenant) && !HOSTNAME.test(tenant.toLowerCase())) return 'Le tenant doit être un GUID ou un nom de domaine (ex. contoso.onmicrosoft.com).'
  if (!m365.clientId) return 'Indiquez l’ID d’application (client).'
  if (!GUID.test(m365.clientId)) return 'L’ID d’application doit être un GUID (ex. 3f2a9c1e-….).'
  if (m365.source === 'onedrive') {
    if (!m365.userPrincipal) return 'Indiquez l’adresse (UPN) de l’utilisateur dont le OneDrive est lu.'
    if (!EMAIL.test(m365.userPrincipal)) return 'L’UPN doit ressembler à prenom.nom@entreprise.com.'
  } else {
    if (!m365.siteUrl) return 'Indiquez l’adresse du site SharePoint.'
    let site: URL
    try {
      site = new URL(m365.siteUrl)
    } catch {
      return 'L’adresse du site n’est pas une URL valide (ex. https://contoso.sharepoint.com/sites/veille).'
    }
    const suffix = M365_CLOUD_INFO[m365.cloud].sharepointSuffix
    if (site.protocol !== 'https:' || !site.hostname.toLowerCase().endsWith(suffix)) return `L’adresse du site doit être en HTTPS et se terminer par « ${suffix} ».`
    if (m365.source === 'sharepoint_list' && !m365.listName) return 'Indiquez le nom de la liste SharePoint.'
  }
  if (/[\u0000-\u001f<>:"|?*\\]/.test(m365.folderPath)) return 'Le chemin du dossier contient un caractère interdit.'
  return null
}

export function validateKindConfig(kind: ConnectorKind, config: ConnectorConfig): ValidationIssue | null {
  const template = config.integration.templateId ? getConnectorTemplate(config.integration.templateId) : undefined
  if (template) {
    if (template.kind !== kind || template.category !== config.integration.category) return 'Le profil technique du connecteur est incohérent.'
    const missing = template.fields.find((field) => field.required && !(field.key === 'endpoint' ? config.url : config.integration.parameters[field.key])?.trim())
    if (missing) return `Le champ « ${missing.label} » est obligatoire.`
  }
  if (!KIND_AUTH_TYPES[kind].includes(config.auth.type)) return `Ce type d’authentification n’est pas disponible pour un connecteur « ${getKindInfo(kind)?.label ?? kind} ».`
  if (isHttpKind(kind) && !config.url) return 'L’URL est obligatoire.'
  if (kind === 'imap') return validateImap(config)
  if (kind === 'webhook') return validateWebhook(config)
  if (kind === 'm365') return validateM365(config)
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
  if (type === 'basic') return 'Mot de passe'
  if (type === 'bearer') return 'Jeton'
  if (type === 'webhook_hmac') return 'Secret de signature'
  if (type === 'oauth_client') return 'Secret client'
  return 'Clé API'
}

export function hostOfUrl(url: string) {
  try {
    return new URL(url.trim()).hostname
  } catch {
    return ''
  }
}

/** Cible lisible d’un connecteur : hôte HTTP, serveur IMAP, site SharePoint, etc. */
export function describeTarget(kind: ConnectorKind, config: ConnectorConfig) {
  if (kind === 'imap') return config.imap.host
  if (kind === 'webhook') return 'webhook entrant'
  if (kind === 'm365') {
    const info = M365_CLOUD_INFO[config.m365.cloud]
    return config.m365.source === 'onedrive' ? info.graph : hostOfUrl(config.m365.siteUrl) || info.graph
  }
  return hostOfUrl(config.url)
}
