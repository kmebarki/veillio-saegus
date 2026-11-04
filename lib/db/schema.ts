import { bigserial, boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  civility: text('civility'),
  firstName: text('firstName'),
  lastName: text('lastName'),
  city: text('city'),
  country: text('country'),
  profession: text('profession'),
  company: text('company'),
  addressLine1: text('addressLine1'),
  addressLine2: text('addressLine2'),
  postalCode: text('postalCode'),
  phone: text('phone'),
  role: text('role').notNull().default('reader'),
  status: text('status').notNull().default('active'),
  organizationId: uuid('organizationId'),
  teamId: uuid('teamId'),
  lastLoginAt: timestamp('lastLoginAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
})

export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('Pending'),
  organizationId: uuid('organizationId'),
  teamId: uuid('teamId'),
  tokenHash: text('tokenHash').notNull().unique(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdByUserId: text('createdByUserId').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const admissionRequests = pgTable('admission_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  organization: text('organization'),
  message: text('message'),
  requestedRole: text('requestedRole').notNull().default('Reader'),
  status: text('status').notNull().default('Pending'),
  declaredTeamId: uuid('declaredTeamId'),
  decisionComment: text('decisionComment'),
  reviewedByUserId: text('reviewedByUserId'),
  reviewedAt: timestamp('reviewedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  internalReference: text('internalReference'),
  type: text('type').notNull().default('client'),
  primaryDomain: text('primaryDomain'),
  addressLine1: text('addressLine1'),
  addressLine2: text('addressLine2'),
  postalCode: text('postalCode'),
  city: text('city'),
  country: text('country').notNull().default('France'),
  logoPathname: text('logoPathname'),
  defaultLanguage: text('defaultLanguage').notNull().default('Français'),
  timezone: text('timezone').notNull().default('Europe/Paris'),
  contactEmail: text('contactEmail'),
  phone: text('phone'),
  responsibleUserId: text('responsibleUserId'),
  administrationScope: text('administrationScope').notNull().default('organization'),
  setupStatus: text('setupStatus').notNull().default('to_configure'),
  offer: text('offer'),
  status: text('status').notNull().default('active'),
  miniSiteEnabled: boolean('miniSiteEnabled').notNull().default(false),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  leadUserId: text('leadUserId'),
  archivedAt: timestamp('archivedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const permissionGroups = pgTable('permission_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  permissions: text('permissions').array().notNull().default([]),
  version: integer('version').notNull().default(1),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const permissionGroupMembers = pgTable(
  'permission_group_members',
  {
    groupId: uuid('groupId').notNull().references(() => permissionGroups.id, { onDelete: 'cascade' }),
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    addedByUserId: text('addedByUserId'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })],
)

export type StoredConnectorConfig = Record<string, unknown>

export type ConnectorRunDetails = {
  checks?: { id: string; label: string; status: 'ok' | 'warning' | 'error' | 'skipped'; detail: string }[]
  sample?: { title: string; link: string; date: string; summary: string }[]
  finalUrl?: string
  contentType?: string
  bytes?: number
}

export type WebhookEventPayloadItem = { title: string; link: string; date: string; summary: string; guid?: string }

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectorId: uuid('connectorId').notNull(),
  organizationId: uuid('organizationId').notNull(),
  status: text('status').notNull(),
  httpStatus: integer('httpStatus').notNull().default(200),
  signatureValid: boolean('signatureValid').notNull().default(false),
  bytes: integer('bytes').notNull().default(0),
  sourceIp: text('sourceIp'),
  message: text('message'),
  item: jsonb('item').$type<WebhookEventPayloadItem | null>(),
  receivedAt: timestamp('receivedAt', { withTimezone: true }).notNull().defaultNow(),
})

export type StoredAuthMethodDefinition = Record<string, unknown>

export const authFamilies = pgTable('auth_families', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  description: text('description').notNull().default(''),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const authVariants = pgTable('auth_variants', {
  id: text('id').primaryKey(),
  familyId: text('familyId').notNull(),
  label: text('label').notNull(),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const authMethods = pgTable('auth_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  methodId: text('methodId').notNull().unique(),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const authMethodVersions = pgTable('auth_method_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  methodId: text('methodId').notNull(),
  version: text('version').notNull(),
  definition: jsonb('definition').$type<StoredAuthMethodDefinition>().notNull(),
  status: text('status').notNull().default('brouillon'),
  authorUserId: text('authorUserId'),
  reviewerUserId: text('reviewerUserId'),
  reviewedAt: timestamp('reviewedAt', { withTimezone: true }),
  isImmutable: boolean('isImmutable').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const authCompatibilities = pgTable('auth_compatibilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  methodId: text('methodId').notNull(),
  methodVersion: text('methodVersion').notNull(),
  serviceId: text('serviceId').notNull(),
  adapterId: text('adapterId').notNull(),
  adapterVersion: text('adapterVersion').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const authRuntimeEvidence = pgTable('auth_runtime_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  methodId: text('methodId').notNull(),
  methodVersion: text('methodVersion').notNull(),
  handlerKey: text('handlerKey'),
  handlerVersion: text('handlerVersion'),
  deployed: boolean('deployed').notNull().default(false),
  securityReviewed: boolean('securityReviewed').notNull().default(false),
  contractTestsPassed: boolean('contractTestsPassed').notNull().default(false),
  enabled: boolean('enabled').notNull().default(false),
  evidenceRefs: jsonb('evidenceRefs').$type<string[]>().notNull().default([]),
  updatedByUserId: text('updatedByUserId'),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const secretVaultEntries = pgTable('secret_vault_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId').notNull(),
  ownerUserId: text('ownerUserId'),
  connectionId: uuid('connectionId'),
  fieldCode: text('fieldCode'),
  operationId: uuid('operationId'),
  state: text('state').notNull().default('active'),
  ciphertext: text('ciphertext').notNull(),
  hint: text('hint'),
  encryptionContext: text('encryptionContext').notNull(),
  activatedAt: timestamp('activatedAt', { withTimezone: true }),
  revokedAt: timestamp('revokedAt', { withTimezone: true }),
  rotatedAt: timestamp('rotatedAt', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const connectors = pgTable('connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  logoUrl: text('logoUrl'),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('draft'),
  config: jsonb('config').$type<StoredConnectorConfig>().notNull(),
  secretCiphertext: text('secretCiphertext'),
  intervalMinutes: integer('intervalMinutes').notNull().default(0),
  version: integer('version').notNull().default(1),
  lastCheckAt: timestamp('lastCheckAt', { withTimezone: true }),
  lastCheckStatus: text('lastCheckStatus'),
  lastCheckMessage: text('lastCheckMessage'),
  lastCheckVersion: integer('lastCheckVersion'),
  lastLatencyMs: integer('lastLatencyMs'),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const connectorRuns = pgTable('connector_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  connectorId: uuid('connectorId').notNull().references(() => connectors.id, { onDelete: 'cascade' }),
  trigger: text('trigger').notNull(),
  status: text('status').notNull(),
  httpStatus: integer('httpStatus'),
  itemsFound: integer('itemsFound'),
  durationMs: integer('durationMs'),
  message: text('message'),
  details: jsonb('details').$type<ConnectorRunDetails>().notNull().default({}),
  actorUserId: text('actorUserId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId').notNull(),
  connectorId: uuid('connectorId').notNull().references(() => connectors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  scope: text('scope').notNull().default('organization'),
  ownerUserId: text('ownerUserId'),
  username: text('username'),
  config: jsonb('config').$type<Record<string, string>>().notNull().default({}),
  secretRef: uuid('secretRef'),
  serviceId: text('serviceId'),
  variantId: text('variantId'),
  methodId: text('methodId'),
  methodVersion: text('methodVersion'),
  adapterId: text('adapterId'),
  adapterVersion: text('adapterVersion'),
  handlerKey: text('handlerKey'),
  handlerVersion: text('handlerVersion'),
  ownerKind: text('ownerKind').notNull().default('organization'),
  ownerId: text('ownerId'),
  lifecycle: text('lifecycle').notNull().default('active'),
  health: text('health').notNull().default('unverified'),
  origin: text('origin').notNull().default('manual'),
  revision: integer('revision').notNull().default(1),
  technicalRevision: integer('technicalRevision').notNull().default(1),
  lastTestedTechnicalRevision: integer('lastTestedTechnicalRevision'),
  autoReuseKey: text('autoReuseKey'),
  lastValidatedMethodVersion: text('lastValidatedMethodVersion'),
  lastValidatedAdapterVersion: text('lastValidatedAdapterVersion'),
  secretCiphertext: text('secretCiphertext'),
  secretHint: text('secretHint'),
  secretRotatedAt: timestamp('secretRotatedAt', { withTimezone: true }),
  expiresAt: timestamp('expiresAt', { withTimezone: true }),
  description: text('description'),
  logoUrl: text('logoUrl'),
  version: integer('version').notNull().default(1),
  lastCheckAt: timestamp('lastCheckAt', { withTimezone: true }),
  lastCheckStatus: text('lastCheckStatus'),
  lastCheckMessage: text('lastCheckMessage'),
  lastCheckVersion: integer('lastCheckVersion'),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const connectionOrganizationAccess = pgTable(
  'connection_organization_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    connectionId: uuid('connection_id').notNull().references(() => connections.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('connection_organization_access_unique').on(table.userId, table.connectionId, table.organizationId)],
)

export type StoredSourceDefinition = {
  notes?: string
  path?: string
}

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  connectorId: uuid('connector_id').notNull(),
  connectionId: uuid('connection_id'),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  endpoint: text('endpoint').notNull(),
  scope: text('scope').notNull().default('organization'),
  ownerUserId: text('owner_user_id'),
  definition: jsonb('definition').$type<StoredSourceDefinition>().notNull().default({}),
  version: integer('version').notNull().default(1),
  createdByUserId: text('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const connectionSecretBindings = pgTable('connection_secret_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connectionId').notNull().references(() => connections.id, { onDelete: 'restrict' }),
  fieldCode: text('fieldCode').notNull(),
  secretRef: uuid('secretRef').notNull().references(() => secretVaultEntries.id, { onDelete: 'restrict' }),
  generation: integer('generation').notNull().default(1),
  state: text('state').notNull().default('active'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const connectionExecutionGrants = pgTable('connection_execution_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  connectionId: uuid('connectionId').notNull().references(() => connections.id, { onDelete: 'restrict' }),
  organizationId: uuid('organizationId').notNull(),
  sourceId: uuid('sourceId'),
  jobId: text('jobId'),
  purpose: text('purpose').notNull(),
  adapterId: text('adapterId').notNull(),
  adapterVersion: text('adapterVersion').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revokedAt', { withTimezone: true }),
  createdByUserId: text('createdByUserId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const connectionTestJobs = pgTable('connection_test_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connectionId').notNull().references(() => connections.id, { onDelete: 'restrict' }),
  organizationId: uuid('organizationId').notNull(),
  technicalRevision: integer('technicalRevision').notNull(),
  idempotencyKey: text('idempotencyKey').notNull(),
  status: text('status').notNull().default('pending'),
  outcome: jsonb('outcome').$type<Record<string, unknown>>().notNull().default({}),
  startedAt: timestamp('startedAt', { withTimezone: true }),
  finishedAt: timestamp('finishedAt', { withTimezone: true }),
  createdByUserId: text('createdByUserId').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const collectionOccurrences = pgTable('collection_occurrences', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  watchId: uuid('watch_id'),
  watchName: text('watch_name').notNull(),
  sourceId: uuid('source_id'),
  sourceName: text('source_name').notNull(),
  connectorId: uuid('connector_id'),
  connectionId: uuid('connection_id'),
  state: text('state').notNull(),
  trigger: text('trigger').notNull().default('schedule'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  deferredUntil: timestamp('deferred_until', { withTimezone: true }),
  itemsRetrieved: integer('items_retrieved').notNull().default(0),
  newItems: integer('new_items').notNull().default(0),
  duplicateItems: integer('duplicate_items').notNull().default(0),
  attemptCount: integer('attempt_count').notNull().default(0),
  errorCategory: text('error_category'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  cursorBefore: text('cursor_before'),
  cursorAfter: text('cursor_after'),
  parentOccurrenceId: uuid('parent_occurrence_id'),
  requestedByUserId: text('requested_by_user_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const collectionAttempts = pgTable('collection_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  occurrenceId: uuid('occurrence_id').notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  state: text('state').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  itemsRetrieved: integer('items_retrieved').notNull().default(0),
  errorCategory: text('error_category'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  retryable: boolean('retryable').notNull().default(false),
  workerId: text('worker_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const collectionPolicies = pgTable('collection_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  connectorId: uuid('connector_id'),
  maxParallel: integer('max_parallel').notNull().default(4),
  maxAttempts: integer('max_attempts').notNull().default(3),
  baseBackoffSeconds: integer('base_backoff_seconds').notNull().default(30),
  maxQuotaDeferralMinutes: integer('max_quota_deferral_minutes').notNull().default(1440),
  retentionDays: integer('retention_days').notNull().default(90),
  updatedByUserId: text('updated_by_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authorizedDomains = pgTable('authorized_domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId').notNull(),
  domain: text('domain').notNull().unique(),
  autoAdmit: boolean('autoAdmit').notNull().default(true),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const auditEvents = pgTable('audit_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorUserId: text('actorUserId').notNull(),
  action: text('action').notNull(),
  targetType: text('targetType').notNull(),
  targetId: text('targetId').notNull(),
  metadata: jsonb('metadata').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})
