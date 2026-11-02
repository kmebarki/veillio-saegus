'use server'

import { createHash, randomBytes } from 'node:crypto'

import { del } from '@vercel/blob'
import { and, asc, count, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'

import { getEffectivePermissions, requirePermission } from '@/lib/authorization'
import { db } from '@/lib/db'
import {
  auditEvents,
  authorizedDomains,
  collectionOccurrences,
  collectionPolicies,
  connections,
  connectors,
  invitations,
  organizations,
  permissionGroups,
  sources,
  teams,
  users,
  webhookEvents,
} from '@/lib/db/schema'
import { sendInvitationEmail } from '@/lib/email'
import type { CreateOrganizationInput, OrganizationListItem, OrganizationsOverview, UpdateOrganizationInput } from '@/lib/organization-types'

const INVITATION_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000
const responsibleUsers = alias(users, 'responsible_users')

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  internalReference: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_-]+$/),
  type: z.enum(['client', 'internal', 'partner']),
  primaryDomain: z.string().trim().toLowerCase().min(3).max(253).regex(/^(?!-)(?:[a-z0-9-]+\.)+[a-z]{2,}$/),
  addressLine1: z.string().trim().max(160),
  addressLine2: z.string().trim().max(160),
  postalCode: z.string().trim().min(2).max(20),
  city: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(80),
  logoPathname: z.string().trim().regex(/^organizations\/logos\/[a-f0-9-]+\.(jpg|png|webp)$/).nullable(),
  defaultLanguage: z.string().trim().min(2).max(50),
  timezone: z.string().trim().min(3).max(80),
  contactEmail: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]),
  phone: z.string().trim().max(40),
  responsibleUserId: z.string().min(1).max(255).nullable(),
  administrationScope: z.enum(['organization', 'global']),
  initialStatus: z.enum(['active', 'to_configure', 'suspended']),
  offer: z.string().trim().max(80),
  miniSiteEnabled: z.boolean(),
  inviteAdmin: z.boolean(),
  adminFirstName: z.string().trim().max(80),
  adminLastName: z.string().trim().max(80),
  adminEmail: z.string().trim().toLowerCase().max(254),
}).superRefine((data, context) => {
  if (!data.inviteAdmin) return
  if (data.adminFirstName.length < 2) context.addIssue({ code: 'custom', path: ['adminFirstName'], message: 'Le prénom de l’administrateur est requis.' })
  if (data.adminLastName.length < 2) context.addIssue({ code: 'custom', path: ['adminLastName'], message: 'Le nom de l’administrateur est requis.' })
  if (!z.string().email().safeParse(data.adminEmail).success) context.addIssue({ code: 'custom', path: ['adminEmail'], message: 'L’adresse e-mail de l’administrateur est invalide.' })
})

async function getRequestOrigin() {
  const requestHeaders = await headers()
  const origin = requestHeaders.get('origin')
  if (origin) return origin
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  return host ? `${requestHeaders.get('x-forwarded-proto') ?? 'https'}://${host}` : undefined
}

export async function canManageOrganizations() {
  const actor = await requirePermission('organizations.view')
  const permissions = await getEffectivePermissions(actor.id, actor.role)
  return permissions.includes('organizations.manage')
}

export async function getOrganizationsOverview(): Promise<OrganizationsOverview> {
  const actor = await requirePermission('organizations.view')
  const permissions = await getEffectivePermissions(actor.id, actor.role)
  const organizationRows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      internalReference: organizations.internalReference,
      type: organizations.type,
      primaryDomain: organizations.primaryDomain,
      addressLine1: organizations.addressLine1,
      addressLine2: organizations.addressLine2,
      postalCode: organizations.postalCode,
      city: organizations.city,
      country: organizations.country,
      logoPathname: organizations.logoPathname,
      defaultLanguage: organizations.defaultLanguage,
      timezone: organizations.timezone,
      contactEmail: organizations.contactEmail,
      phone: organizations.phone,
      responsibleUserId: organizations.responsibleUserId,
      responsibleName: responsibleUsers.name,
      administrationScope: organizations.administrationScope,
      setupStatus: organizations.setupStatus,
      offer: organizations.offer,
      status: organizations.status,
      miniSiteEnabled: organizations.miniSiteEnabled,
      createdAt: organizations.createdAt,
      usersCount: sql<number>`(select count(*)::int from "user" where "user"."organizationId" = "organizations"."id")`,
      teamsCount: sql<number>`(select count(*)::int from "teams" where "teams"."organizationId" = "organizations"."id")`,
    })
    .from(organizations)
    .leftJoin(responsibleUsers, eq(organizations.responsibleUserId, responsibleUsers.id))
    .orderBy(desc(organizations.createdAt))

  return {
    canManage: permissions.includes('organizations.manage'),
    organizations: organizationRows.map((organization) => ({
      ...organization,
      setupStatus: organization.setupStatus === 'active' ? 'active' : 'to_configure',
      status: organization.status === 'suspended' ? 'suspended' : 'active',
      watchesCount: 0,
      createdAt: organization.createdAt.toISOString(),
    })),
  }
}

export async function getOrganizationForEdit(id: string): Promise<OrganizationListItem | null> {
  await requirePermission('organizations.manage')
  if (!z.string().uuid().safeParse(id).success) return null
  const overview = await getOrganizationsOverview()
  return overview.organizations.find((organization) => organization.id === id) ?? null
}

export async function searchOrganizationResponsibles(query: string) {
  await requirePermission('organizations.manage')
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 2) return []

  const pattern = `%${normalizedQuery}%`
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.status, 'active'), or(ilike(users.name, pattern), ilike(users.email, pattern))))
    .orderBy(asc(users.name))
    .limit(20)
}

export async function createOrganization(input: CreateOrganizationInput) {
  const actor = await requirePermission('organizations.manage')
  const parsed = organizationSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? 'Les informations saisies sont invalides.' }

  const data = parsed.data
  const adminName = `${data.adminFirstName} ${data.adminLastName}`.trim()
  let invitationToken: string | null = null
  let invitationId: string | null = null

  try {
    const result = await db.transaction(async (transaction) => {
      if (data.responsibleUserId) {
        const [responsible] = await transaction.select({ id: users.id }).from(users).where(and(eq(users.id, data.responsibleUserId), eq(users.status, 'active'))).limit(1)
        if (!responsible) throw new Error('RESPONSIBLE_NOT_FOUND')
      }

      if (data.inviteAdmin) {
        const [existingUser] = await transaction.select({ id: users.id }).from(users).where(eq(users.email, data.adminEmail)).limit(1)
        if (existingUser) throw new Error('ADMIN_ALREADY_EXISTS')
      }

      const [organization] = await transaction.insert(organizations).values({
        name: data.name,
        internalReference: data.internalReference.toUpperCase(),
        type: data.type,
        primaryDomain: data.primaryDomain,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        postalCode: data.postalCode,
        city: data.city,
        country: data.country,
        logoPathname: data.logoPathname,
        defaultLanguage: data.defaultLanguage,
        timezone: data.timezone,
        contactEmail: data.contactEmail || null,
        phone: data.phone || null,
        responsibleUserId: data.responsibleUserId,
        administrationScope: data.administrationScope,
        setupStatus: data.initialStatus === 'to_configure' ? 'to_configure' : 'active',
        status: data.initialStatus === 'suspended' ? 'suspended' : 'active',
        offer: data.offer || null,
        miniSiteEnabled: data.miniSiteEnabled,
        createdByUserId: actor.id,
        updatedAt: new Date(),
      }).returning({ id: organizations.id, name: organizations.name })

      if (data.inviteAdmin) {
        invitationToken = randomBytes(32).toString('base64url')
        const [invitation] = await transaction.insert(invitations).values({
          name: adminName,
          email: data.adminEmail,
          role: 'Administrator',
          organizationId: organization.id,
          tokenHash: createHash('sha256').update(invitationToken).digest('hex'),
          expiresAt: new Date(Date.now() + INVITATION_VALIDITY_MS),
          createdByUserId: actor.id,
        }).returning({ id: invitations.id })
        invitationId = invitation.id
      }

      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        action: 'organization.created',
        targetType: 'organization',
        targetId: organization.id,
        metadata: { name: organization.name, internalReference: data.internalReference.toUpperCase(), adminInvited: data.inviteAdmin },
      })
      return organization
    })

    let message = 'Organisation créée avec succès.'
    if (data.inviteAdmin && invitationToken && invitationId) {
      try {
        await sendInvitationEmail({ email: data.adminEmail, name: adminName, token: invitationToken, role: 'Administrateur', origin: await getRequestOrigin() })
        message = 'Organisation créée et invitation administrateur envoyée.'
      } catch {
        await db.update(invitations).set({ status: 'Cancelled', updatedAt: new Date() }).where(eq(invitations.id, invitationId))
        message = 'Organisation créée. L’invitation n’a pas pu être envoyée et a été annulée.'
      }
    }

    revalidatePath('/admin/organizations')
    return { ok: true as const, id: result.id, message }
  } catch (error) {
    if (error instanceof Error && error.message === 'RESPONSIBLE_NOT_FOUND') return { ok: false as const, message: 'Le responsable sélectionné est introuvable.' }
    if (error instanceof Error && error.message === 'ADMIN_ALREADY_EXISTS') return { ok: false as const, message: 'Cet administrateur possède déjà un compte.' }
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === '23505') return { ok: false as const, message: 'Cette référence interne ou ce domaine est déjà utilisé.' }
    return { ok: false as const, message: 'La création de l’organisation a échoué.' }
  }
}

export async function updateOrganization(id: string, input: UpdateOrganizationInput) {
  const actor = await requirePermission('organizations.manage')
  if (!z.string().uuid().safeParse(id).success) return { ok: false as const, message: 'Organisation introuvable.' }

  const parsed = organizationSchema.safeParse({
    ...input,
    inviteAdmin: false,
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
  })
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? 'Les informations saisies sont invalides.' }

  const data = parsed.data
  try {
    const result = await db.transaction(async (transaction) => {
      if (data.responsibleUserId) {
        const [responsible] = await transaction.select({ id: users.id }).from(users).where(and(eq(users.id, data.responsibleUserId), eq(users.status, 'active'))).limit(1)
        if (!responsible) throw new Error('RESPONSIBLE_NOT_FOUND')
      }

      const [duplicate] = await transaction
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(ne(organizations.id, id), or(eq(organizations.internalReference, data.internalReference.toUpperCase()), eq(organizations.primaryDomain, data.primaryDomain))))
        .limit(1)
      if (duplicate) throw new Error('ORGANIZATION_DUPLICATE')

      const [organization] = await transaction
        .update(organizations)
        .set({
          name: data.name,
          internalReference: data.internalReference.toUpperCase(),
          type: data.type,
          primaryDomain: data.primaryDomain,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2 || null,
          postalCode: data.postalCode,
          city: data.city,
          country: data.country,
          logoPathname: data.logoPathname,
          defaultLanguage: data.defaultLanguage,
          timezone: data.timezone,
          contactEmail: data.contactEmail || null,
          phone: data.phone || null,
          responsibleUserId: data.responsibleUserId,
          administrationScope: data.administrationScope,
          setupStatus: data.initialStatus === 'to_configure' ? 'to_configure' : 'active',
          status: data.initialStatus === 'suspended' ? 'suspended' : 'active',
          offer: data.offer || null,
          miniSiteEnabled: data.miniSiteEnabled,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, id))
        .returning({ id: organizations.id, name: organizations.name })
      if (!organization) throw new Error('ORGANIZATION_NOT_FOUND')

      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        action: 'organization.updated',
        targetType: 'organization',
        targetId: organization.id,
        metadata: { name: organization.name, internalReference: data.internalReference.toUpperCase() },
      })
      return organization
    })

    revalidatePath('/admin/organizations')
    revalidatePath(`/admin/organizations/${id}/edit`)
    return { ok: true as const, id: result.id, message: 'Organisation modifiée avec succès.' }
  } catch (error) {
    if (error instanceof Error && error.message === 'RESPONSIBLE_NOT_FOUND') return { ok: false as const, message: 'Le responsable sélectionné est introuvable.' }
    if (error instanceof Error && error.message === 'ORGANIZATION_DUPLICATE') return { ok: false as const, message: 'Cette référence interne ou ce domaine est déjà utilisé.' }
    if (error instanceof Error && error.message === 'ORGANIZATION_NOT_FOUND') return { ok: false as const, message: 'Organisation introuvable.' }
    return { ok: false as const, message: 'La modification de l’organisation a échoué.' }
  }
}

export async function deleteOrganization(id: string) {
  const actor = await requirePermission('organizations.manage')
  if (!z.string().uuid().safeParse(id).success) return { ok: false as const, message: 'Organisation introuvable.' }

  const [organization] = await db.select({ id: organizations.id, name: organizations.name, logoPathname: organizations.logoPathname }).from(organizations).where(eq(organizations.id, id)).limit(1)
  if (!organization) return { ok: false as const, message: 'Organisation introuvable.' }

  const dependencies = await Promise.all([
    db.select({ total: count() }).from(users).where(eq(users.organizationId, id)),
    db.select({ total: count() }).from(teams).where(eq(teams.organizationId, id)),
    db.select({ total: count() }).from(invitations).where(eq(invitations.organizationId, id)),
    db.select({ total: count() }).from(permissionGroups).where(eq(permissionGroups.organizationId, id)),
    db.select({ total: count() }).from(connectors).where(eq(connectors.organizationId, id)),
    db.select({ total: count() }).from(connections).where(eq(connections.organizationId, id)),
    db.select({ total: count() }).from(sources).where(eq(sources.organizationId, id)),
    db.select({ total: count() }).from(webhookEvents).where(eq(webhookEvents.organizationId, id)),
    db.select({ total: count() }).from(collectionOccurrences).where(eq(collectionOccurrences.organizationId, id)),
    db.select({ total: count() }).from(collectionPolicies).where(eq(collectionPolicies.organizationId, id)),
    db.select({ total: count() }).from(authorizedDomains).where(eq(authorizedDomains.organizationId, id)),
  ])
  const labels = ['utilisateur', 'équipe', 'invitation', 'groupe de permissions', 'connecteur', 'connexion', 'source', 'événement webhook', 'collecte', 'politique de collecte', 'domaine autorisé']
  const blockers = dependencies
    .map(([result], index) => ({ label: labels[index], total: result?.total ?? 0 }))
    .filter((dependency) => dependency.total > 0)

  if (blockers.length > 0) {
    const summary = blockers.slice(0, 3).map(({ label, total }) => `${total} ${label}${total > 1 ? 's' : ''}`).join(', ')
    return { ok: false as const, message: `Suppression impossible : cette organisation est encore liée à ${summary}${blockers.length > 3 ? '…' : '.'}` }
  }

  try {
    await db.transaction(async (transaction) => {
      const [deleted] = await transaction.delete(organizations).where(eq(organizations.id, id)).returning({ id: organizations.id })
      if (!deleted) throw new Error('ORGANIZATION_NOT_FOUND')
      await transaction.insert(auditEvents).values({
        actorUserId: actor.id,
        action: 'organization.deleted',
        targetType: 'organization',
        targetId: id,
        metadata: { name: organization.name },
      })
    })
    if (organization.logoPathname) await del(organization.logoPathname).catch(() => undefined)
    revalidatePath('/admin/organizations')
    return { ok: true as const, message: 'Organisation supprimée.' }
  } catch {
    return { ok: false as const, message: 'La suppression de l’organisation a échoué.' }
  }
}
