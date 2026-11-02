import { bigserial, boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organizationId').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
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
