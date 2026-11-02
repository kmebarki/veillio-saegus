'use server'

import { createHash, randomBytes } from 'node:crypto'

import { and, count, desc, eq, gt, inArray, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { AdminAdmission, AdminInvitation, AdminOrganization, AdminUser, AdminViewer } from '@/lib/admin-types'
import { getCurrentIdentity, getDefaultOrganization, requireAdmin, requireManager } from '@/lib/authorization'
import { db } from '@/lib/db'
import { admissionRequests, auditEvents, authorizedDomains, invitations, organizations, sessions, teams, users } from '@/lib/db/schema'
import { sendAdmissionDecisionEmail, sendInvitationEmail } from '@/lib/email'
import { isRateLimited } from '@/lib/rate-limit'
import { ROLE_LABELS, canManageTarget, getAssignableRoles, isAdminRole, isRoleKey, type RoleKey } from '@/lib/roles'

const INVITATION_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000

const invitationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['Administrator', 'Manager', 'Watcher', 'Reader']),
  teamId: z.string().uuid().nullable().optional(),
})

const admissionDecisionSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['Approved', 'Rejected']),
  role: z.enum(['pilot', 'contributor', 'reader']).optional(),
  teamId: z.string().uuid().nullable().optional(),
  comment: z.string().trim().max(500).optional(),
})

const statusSchema = z.object({ userId: z.string().min(1).max(255), status: z.enum(['active', 'suspended']) })
const roleSchema = z.object({ userId: z.string().min(1).max(255), role: z.enum(['admin', 'pilot', 'contributor', 'reader']) })
const teamAssignmentSchema = z.object({ userId: z.string().min(1).max(255), teamId: z.string().uuid().nullable() })
const userIdSchema = z.object({ userId: z.string().min(1).max(255) })
const invitationIdSchema = z.object({ id: z.string().uuid() })
const acceptSchema = z.object({ token: z.string().min(32).max(256) })

const invitationRoleToDatabase: Record<string, RoleKey> = {
  Administrator: 'admin',
  Manager: 'pilot',
  Watcher: 'contributor',
  Reader: 'reader',
}

const invitationRoleLabels: Record<string, string> = {
  Administrator: 'Administrateur',
  Manager: 'Manager',
  Watcher: 'Contributeur',
  Reader: 'Lecteur',
}

const requestedRoleToDatabase: Record<string, RoleKey> = { Watcher: 'contributor', Reader: 'reader' }
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

function getInitials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function getInvitationStatus(status: string, expiresAt: Date) {
  if (status === 'Accepted') return 'Acceptée'
  if (status === 'Cancelled') return 'Annulée'
  return expiresAt.getTime() <= Date.now() ? 'Expirée' : 'En attente'
}

const INVITATION_RATE_LIMIT = { actions: ['invitation.sent', 'invitation.resent'], windowMs: 60 * 60 * 1000, max: 30 }
const RATE_LIMIT_MESSAGE = 'Trop d’invitations envoyées récemment. Réessayez dans une heure.'

async function isLastActiveAdmin(target: { id: string; role: string }) {
  if (!isAdminRole(target.role)) return false
  const [others] = await db
    .select({ total: count() })
    .from(users)
    .where(and(inArray(users.role, ['super_admin', 'admin']), eq(users.status, 'active'), ne(users.id, target.id)))
  return (others?.total ?? 0) === 0
}

async function teamExists(teamId: string) {
  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1)
  return Boolean(team)
}

export async function getAdminAccessData() {
  const actor = await requireManager()
  const canAdminister = isAdminRole(actor.role)
  const scopedTeamId = canAdminister ? null : actor.teamId

  const [userRows, admissionRows, invitationRows, teamRows, memberCounts, domainRows, organization] = await Promise.all([
    db.select({
      id: users.id, name: users.name, email: users.email, image: users.image, role: users.role, status: users.status,
      teamId: users.teamId, lastLoginAt: users.lastLoginAt,
    }).from(users).where(scopedTeamId ? eq(users.teamId, scopedTeamId) : undefined).orderBy(desc(users.createdAt)),
    db.select().from(admissionRequests)
      .where(scopedTeamId ? and(eq(admissionRequests.status, 'Pending'), eq(admissionRequests.declaredTeamId, scopedTeamId)) : eq(admissionRequests.status, 'Pending'))
      .orderBy(desc(admissionRequests.createdAt)),
    canAdminister
      ? db.select({
          id: invitations.id, name: invitations.name, email: invitations.email, role: invitations.role, status: invitations.status,
          teamId: invitations.teamId, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt, invitedBy: users.name,
        }).from(invitations).leftJoin(users, eq(users.id, invitations.createdByUserId)).orderBy(desc(invitations.createdAt))
      : Promise.resolve([]),
    db.select().from(teams).orderBy(teams.name),
    db.select({ teamId: users.teamId, total: count() }).from(users).groupBy(users.teamId),
    canAdminister ? db.select().from(authorizedDomains).orderBy(authorizedDomains.domain) : Promise.resolve([]),
    getDefaultOrganization(),
  ])

  const teamNames = new Map(teamRows.map((team) => [team.id, team.name]))
  const counts = new Map(memberCounts.map((row) => [row.teamId, row.total]))
  const assignableRoles = getAssignableRoles(actor.role)

  const viewer: AdminViewer = { id: actor.id, role: actor.role as RoleKey, teamId: actor.teamId, canAdminister, assignableRoles }

  const adminUsers: AdminUser[] = userRows.map((user) => {
    const roleKey = (isRoleKey(user.role) ? user.role : 'reader') as RoleKey
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      initials: getInitials(user.name),
      roleKey,
      role: ROLE_LABELS[roleKey],
      teamId: user.teamId,
      team: user.teamId ? teamNames.get(user.teamId) ?? 'Équipe supprimée' : 'Aucune équipe',
      status: user.status === 'suspended' ? 'Suspendu' : 'Actif',
      lastSeen: user.lastLoginAt ? dateTimeFormatter.format(user.lastLoginAt) : 'Jamais connecté',
      manageable: canAdminister && user.id !== actor.id && canManageTarget(actor.role, user.role),
    }
  })

  const adminAdmissions: AdminAdmission[] = admissionRows.map((admission) => ({
    id: admission.id,
    name: admission.name,
    email: admission.email,
    initials: getInitials(admission.name),
    requestedAt: dateTimeFormatter.format(admission.createdAt),
    requestedRole: admission.requestedRole === 'Watcher' ? 'Contributeur' : 'Lecteur',
    requestedRoleKey: requestedRoleToDatabase[admission.requestedRole] ?? 'reader',
    declaredTeamId: admission.declaredTeamId,
    declaredTeam: admission.declaredTeamId ? teamNames.get(admission.declaredTeamId) ?? 'Équipe supprimée' : 'Non précisée',
    message: admission.message ?? 'Aucun message ajouté.',
  }))

  const adminInvitations: AdminInvitation[] = invitationRows.map((invitation) => ({
    id: invitation.id,
    name: invitation.name,
    email: invitation.email,
    initials: getInitials(invitation.name),
    role: invitationRoleLabels[invitation.role] ?? 'Lecteur',
    team: invitation.teamId ? teamNames.get(invitation.teamId) ?? 'Équipe supprimée' : 'Aucune équipe',
    status: getInvitationStatus(invitation.status, invitation.expiresAt),
    sentAt: dateTimeFormatter.format(invitation.createdAt),
    expiresAt: dateTimeFormatter.format(invitation.expiresAt),
    invitedBy: invitation.invitedBy ?? 'Utilisateur supprimé',
  }))

  const adminOrganization: AdminOrganization | null = organization
    ? {
        id: organization.id,
        name: organization.name,
        teams: teamRows.map((team) => ({ id: team.id, name: team.name, memberCount: counts.get(team.id) ?? 0 })),
        domains: domainRows.map((domain) => ({ id: domain.id, domain: domain.domain, autoAdmit: domain.autoAdmit })),
      }
    : null

  return { viewer, users: adminUsers, admissions: adminAdmissions, invitations: adminInvitations, organization: adminOrganization }
}

export async function createInvitation(input: unknown) {
  const actor = await requireAdmin()
  const parsed = invitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Les informations saisies sont invalides.' }
  if (!getAssignableRoles(actor.role).includes(invitationRoleToDatabase[parsed.data.role])) {
    return { ok: false as const, message: 'Vous ne pouvez pas inviter avec ce rôle.' }
  }
  if (parsed.data.teamId && !(await teamExists(parsed.data.teamId))) return { ok: false as const, message: 'Équipe introuvable.' }
  if (await isRateLimited({ actorUserId: actor.id, ...INVITATION_RATE_LIMIT })) return { ok: false as const, message: RATE_LIMIT_MESSAGE }

  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1)
  if (existingUser.length > 0) return { ok: false as const, message: 'Cet utilisateur possède déjà un compte.' }

  const existingInvitation = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.email, parsed.data.email), eq(invitations.status, 'Pending'), gt(invitations.expiresAt, new Date())))
    .limit(1)
  if (existingInvitation.length > 0) return { ok: false as const, message: 'Une invitation est déjà en attente pour cette adresse.' }

  const invitationToken = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(invitationToken).digest('hex')
  const [invitation] = await db.insert(invitations).values({
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    teamId: parsed.data.teamId ?? null,
    tokenHash,
    expiresAt: new Date(Date.now() + INVITATION_VALIDITY_MS),
    createdByUserId: actor.id,
  }).returning({ id: invitations.id })

  try {
    await sendInvitationEmail({ email: parsed.data.email, name: parsed.data.name, token: invitationToken, role: invitationRoleLabels[parsed.data.role] ?? 'Lecteur' })
  } catch {
    await db.update(invitations).set({ status: 'Cancelled', updatedAt: new Date() }).where(eq(invitations.id, invitation.id))
    await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'invitation.delivery_failed', targetType: 'invitation', targetId: invitation.id, metadata: { email: parsed.data.email } })
    return { ok: false as const, message: 'L’invitation n’a pas pu être envoyée. Vérifiez la configuration SMTP Microsoft 365.' }
  }

  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'invitation.sent', targetType: 'invitation', targetId: invitation.id, metadata: { email: parsed.data.email, role: parsed.data.role } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Invitation envoyée par e-mail.' }
}

export async function resendInvitation(input: unknown) {
  const actor = await requireAdmin()
  const parsed = invitationIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Invitation invalide.' }
  if (await isRateLimited({ actorUserId: actor.id, ...INVITATION_RATE_LIMIT })) return { ok: false as const, message: RATE_LIMIT_MESSAGE }

  const [invitation] = await db.select().from(invitations).where(eq(invitations.id, parsed.data.id)).limit(1)
  if (!invitation || invitation.status !== 'Pending') return { ok: false as const, message: 'Cette invitation ne peut plus être renvoyée.' }

  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, invitation.email)).limit(1)
  if (existingUser.length > 0) return { ok: false as const, message: 'Cet utilisateur possède déjà un compte.' }

  const invitationToken = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(invitationToken).digest('hex')

  try {
    await sendInvitationEmail({ email: invitation.email, name: invitation.name, token: invitationToken, role: invitationRoleLabels[invitation.role] ?? 'Lecteur' })
  } catch {
    return { ok: false as const, message: 'L’invitation n’a pas pu être renvoyée. Vérifiez la configuration SMTP Microsoft 365.' }
  }

  await db.update(invitations).set({ tokenHash, expiresAt: new Date(Date.now() + INVITATION_VALIDITY_MS), createdAt: new Date(), createdByUserId: actor.id, updatedAt: new Date() }).where(eq(invitations.id, invitation.id))
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'invitation.resent', targetType: 'invitation', targetId: invitation.id, metadata: { email: invitation.email } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Invitation renvoyée par e-mail.' }
}

export async function cancelInvitation(input: unknown) {
  const actor = await requireAdmin()
  const parsed = invitationIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Invitation invalide.' }

  const [cancelled] = await db
    .update(invitations)
    .set({ status: 'Cancelled', updatedAt: new Date() })
    .where(and(eq(invitations.id, parsed.data.id), eq(invitations.status, 'Pending')))
    .returning({ id: invitations.id, email: invitations.email })
  if (!cancelled) return { ok: false as const, message: 'Cette invitation ne peut plus être annulée.' }

  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'invitation.cancelled', targetType: 'invitation', targetId: cancelled.id, metadata: { email: cancelled.email } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Invitation annulée.' }
}

export async function acceptInvitation(input: unknown) {
  const identity = await getCurrentIdentity()
  if (!identity) return { ok: false as const, message: 'Authentification requise.' }

  const parsed = acceptSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Invitation invalide.' }

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex')
  const defaultOrganization = await getDefaultOrganization()

  const result = await db.transaction(async (tx) => {
    const [invitation] = await tx
      .update(invitations)
      .set({ status: 'Accepted', updatedAt: new Date() })
      .where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.email, identity.email), eq(invitations.status, 'Pending'), gt(invitations.expiresAt, new Date())))
      .returning({ id: invitations.id, role: invitations.role, teamId: invitations.teamId, createdByUserId: invitations.createdByUserId })

    if (!invitation) return null
    const [inviter] = await tx.select({ organizationId: users.organizationId }).from(users).where(eq(users.id, invitation.createdByUserId)).limit(1)
    const assignedRole = invitationRoleToDatabase[invitation.role] ?? 'reader'
    await tx.update(users).set({
      role: assignedRole,
      status: 'active',
      emailVerified: true,
      organizationId: inviter?.organizationId ?? defaultOrganization?.id ?? null,
      teamId: invitation.teamId,
      updatedAt: new Date(),
    }).where(eq(users.id, identity.id))
    await tx.insert(auditEvents).values({ actorUserId: identity.id, action: 'invitation.accepted', targetType: 'invitation', targetId: invitation.id, metadata: { role: invitation.role } })
    return assignedRole
  })

  if (!result) return { ok: false as const, message: 'Cette invitation est invalide, expirée ou liée à une autre adresse.' }
  return { ok: true as const, destination: isAdminRole(result) ? '/admin/users' : '/' }
}

export async function decideAdmission(input: unknown) {
  const actor = await requireManager()
  const parsed = admissionDecisionSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Décision invalide.' }
  const { decision, comment } = parsed.data
  if (decision === 'Rejected' && (!comment || comment.length < 3)) return { ok: false as const, message: 'Un motif de refus est requis.' }

  const [admission] = await db.select().from(admissionRequests).where(and(eq(admissionRequests.id, parsed.data.id), eq(admissionRequests.status, 'Pending'))).limit(1)
  if (!admission) return { ok: false as const, message: 'Cette demande a déjà été traitée.' }

  if (admission.email.toLowerCase() === actor.email.toLowerCase()) return { ok: false as const, message: 'Vous ne pouvez pas traiter votre propre demande.' }

  const canAdminister = isAdminRole(actor.role)
  if (!canAdminister && (!actor.teamId || admission.declaredTeamId !== actor.teamId)) return { ok: false as const, message: 'Cette demande ne relève pas de votre équipe.' }

  const requestedRole = requestedRoleToDatabase[admission.requestedRole] ?? 'reader'
  const finalRole = (parsed.data.role ?? requestedRole) as RoleKey
  const finalTeamId = canAdminister ? parsed.data.teamId ?? admission.declaredTeamId : actor.teamId

  if (decision === 'Approved') {
    if (!getAssignableRoles(actor.role).includes(finalRole)) return { ok: false as const, message: 'Vous ne pouvez pas attribuer ce rôle.' }
    if (finalTeamId && !(await teamExists(finalTeamId))) return { ok: false as const, message: 'Équipe introuvable.' }
  }

  const defaultOrganization = await getDefaultOrganization()
  const processed = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(admissionRequests)
      .set({ status: decision, reviewedByUserId: actor.id, reviewedAt: new Date(), decisionComment: comment || null, updatedAt: new Date() })
      .where(and(eq(admissionRequests.id, admission.id), eq(admissionRequests.status, 'Pending')))
      .returning({ id: admissionRequests.id })
    if (!updated) return false

    if (decision === 'Approved') {
      const [approvedUser] = await tx.update(users).set({
        role: finalRole,
        status: 'active',
        organizationId: actor.organizationId ?? defaultOrganization?.id ?? null,
        teamId: finalTeamId ?? null,
        updatedAt: new Date(),
      }).where(and(eq(users.email, admission.email), ne(users.role, 'super_admin'), ne(users.role, 'admin'))).returning({ id: users.id })
      if (!approvedUser) return false
    }

    await tx.insert(auditEvents).values({
      actorUserId: actor.id,
      action: `admission.${decision.toLowerCase()}`,
      targetType: 'admission_request',
      targetId: admission.id,
      metadata: { email: admission.email, role: decision === 'Approved' ? finalRole : null },
    })
    return true
  })

  if (!processed) return { ok: false as const, message: 'Cette demande a déjà été traitée.' }

  let notified = true
  try {
    await sendAdmissionDecisionEmail({ email: admission.email, name: admission.name, approved: decision === 'Approved', comment })
  } catch {
    notified = false
  }

  revalidatePath('/admin/users')
  const base = decision === 'Approved' ? 'Admission approuvée.' : 'Demande refusée.'
  return { ok: true as const, message: notified ? base : `${base} L’e-mail de notification n’a pas pu être envoyé.` }
}

async function loadManageableTarget(actor: { id: string; role: string }, userId: string) {
  if (userId === actor.id) return { error: 'Vous ne pouvez pas modifier votre propre compte.' as const }
  const [target] = await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { error: 'Utilisateur introuvable.' as const }
  if (!canManageTarget(actor.role, target.role)) return { error: 'Vous n’avez pas le droit de modifier cet utilisateur.' as const }
  return { target }
}

export async function updateUserStatus(input: unknown) {
  const actor = await requireAdmin()
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Cette modification est invalide.' }
  const loaded = await loadManageableTarget(actor, parsed.data.userId)
  if (loaded.error !== undefined) return { ok: false as const, message: loaded.error }

  if (parsed.data.status === 'suspended' && (await isLastActiveAdmin(loaded.target))) return { ok: false as const, message: 'Impossible de suspendre le dernier administrateur actif.' }

  await db.update(users).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(users.id, parsed.data.userId))
  if (parsed.data.status === 'suspended') await db.delete(sessions).where(eq(sessions.userId, parsed.data.userId))
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: `user.${parsed.data.status}`, targetType: 'user', targetId: parsed.data.userId })
  revalidatePath('/admin/users')
  return { ok: true as const, message: parsed.data.status === 'suspended' ? 'Utilisateur suspendu.' : 'Utilisateur réactivé.' }
}

export async function changeUserRole(input: unknown) {
  const actor = await requireAdmin()
  const parsed = roleSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Rôle invalide.' }
  if (!getAssignableRoles(actor.role).includes(parsed.data.role)) return { ok: false as const, message: 'Vous ne pouvez pas attribuer ce rôle.' }
  const loaded = await loadManageableTarget(actor, parsed.data.userId)
  if (loaded.error !== undefined) return { ok: false as const, message: loaded.error }

  if (!isAdminRole(parsed.data.role) && (await isLastActiveAdmin(loaded.target))) return { ok: false as const, message: 'Impossible de retirer le rôle du dernier administrateur actif.' }

  await db.update(users).set({ role: parsed.data.role, updatedAt: new Date() }).where(eq(users.id, parsed.data.userId))
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'user.role_changed', targetType: 'user', targetId: parsed.data.userId, metadata: { from: loaded.target.role, to: parsed.data.role } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: `Rôle mis à jour : ${ROLE_LABELS[parsed.data.role]}.` }
}

export async function changeUserTeam(input: unknown) {
  const actor = await requireAdmin()
  const parsed = teamAssignmentSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Équipe invalide.' }
  if (parsed.data.teamId && !(await teamExists(parsed.data.teamId))) return { ok: false as const, message: 'Équipe introuvable.' }
  const loaded = await loadManageableTarget(actor, parsed.data.userId)
  if (loaded.error !== undefined) return { ok: false as const, message: loaded.error }

  await db.update(users).set({ teamId: parsed.data.teamId, updatedAt: new Date() }).where(eq(users.id, parsed.data.userId))
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'user.team_changed', targetType: 'user', targetId: parsed.data.userId, metadata: { teamId: parsed.data.teamId } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Équipe mise à jour.' }
}

export async function revokeUserSessions(input: unknown) {
  const actor = await requireAdmin()
  const parsed = userIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Utilisateur invalide.' }
  const loaded = await loadManageableTarget(actor, parsed.data.userId)
  if (loaded.error !== undefined) return { ok: false as const, message: loaded.error }

  await db.delete(sessions).where(eq(sessions.userId, parsed.data.userId))
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'user.sessions_revoked', targetType: 'user', targetId: parsed.data.userId })
  return { ok: true as const, message: 'Sessions révoquées. L’utilisateur devra se reconnecter.' }
}

export async function getExportRows() {
  const actor = await requireAdmin()
  const rows = await db
    .select({ name: users.name, email: users.email, role: users.role, status: users.status, teamId: users.teamId, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt))
  const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, rows.flatMap((row) => (row.teamId ? [row.teamId] : []))))
  const teamNames = new Map(teamRows.map((team) => [team.id, team.name]))
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'users.exported', targetType: 'user', targetId: 'all', metadata: { count: rows.length } })
  return rows.map((row) => ({
    name: row.name,
    email: row.email,
    role: ROLE_LABELS[(isRoleKey(row.role) ? row.role : 'reader') as RoleKey],
    team: row.teamId ? teamNames.get(row.teamId) ?? '' : '',
    status: row.status === 'suspended' ? 'Suspendu' : 'Actif',
    lastLogin: row.lastLoginAt ? row.lastLoginAt.toISOString() : '',
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function renameOrganization(input: unknown) {
  const actor = await requireAdmin()
  const parsed = z.object({ name: z.string().trim().min(2).max(160) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Nom invalide.' }
  const organization = await getDefaultOrganization()
  if (!organization) return { ok: false as const, message: 'Organisation introuvable.' }
  await db.update(organizations).set({ name: parsed.data.name }).where(eq(organizations.id, organization.id))
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'organization.renamed', targetType: 'organization', targetId: organization.id })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Organisation renommée.' }
}
