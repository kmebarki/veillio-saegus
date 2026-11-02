'use server'

import { createHash, randomBytes } from 'node:crypto'

import { and, desc, eq, gt } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getCurrentIdentity, requireAdmin } from '@/lib/authorization'
import { db } from '@/lib/db'
import { admissionRequests, auditEvents, invitations, sessions, users } from '@/lib/db/schema'
import { sendInvitationEmail } from '@/lib/email'

const invitationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['Administrator', 'Watcher', 'Reader']),
})

const admissionDecisionSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['Approved', 'Rejected']),
})

const statusSchema = z.object({
  userId: z.string().min(1).max(255),
  status: z.enum(['active', 'suspended']),
})

const roleLabels: Record<string, string> = {
  super_admin: 'Super administrateur',
  admin: 'Administrateur',
  pilot: 'Manager',
  contributor: 'Contributeur',
  reader: 'Lecteur',
}

const requestedRoleToDatabase: Record<string, string> = {
  Watcher: 'contributor',
  Reader: 'reader',
}

export async function getAdminAccessData() {
  await requireAdmin()
  const [userRows, admissionRows] = await Promise.all([
    db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt)),
    db.select().from(admissionRequests).where(eq(admissionRequests.status, 'Pending')).orderBy(desc(admissionRequests.createdAt)),
  ])

  return {
    users: userRows.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      initials: user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      role: roleLabels[user.role] ?? 'Lecteur',
      team: 'Organisation',
      status: user.status === 'suspended' ? 'Suspendu' : 'Actif',
      lastSeen: user.lastLoginAt ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(user.lastLoginAt) : 'Jamais connecté',
    })),
    admissions: admissionRows.map((admission) => ({
      id: admission.id,
      name: admission.name,
      email: admission.email,
      initials: admission.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      requestedAt: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(admission.createdAt),
      requestedRole: admission.requestedRole === 'Watcher' ? 'Contributeur' : 'Lecteur',
      message: admission.message ?? 'Aucun message ajouté.',
    })),
  }
}

export async function createInvitation(input: unknown) {
  const actor = await requireAdmin()
  const parsed = invitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Les informations saisies sont invalides.' }

  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1)
  if (existingUser.length > 0) return { ok: false as const, message: 'Cet utilisateur possède déjà un compte.' }

  const existingInvitation = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.email, parsed.data.email), eq(invitations.status, 'Pending')))
    .limit(1)
  if (existingInvitation.length > 0) return { ok: false as const, message: 'Une invitation est déjà en attente pour cette adresse.' }

  const invitationToken = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(invitationToken).digest('hex')
  const [invitation] = await db.insert(invitations).values({
    ...parsed.data,
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdByUserId: actor.id,
  }).returning({ id: invitations.id })

  try {
    await sendInvitationEmail({
      email: parsed.data.email,
      name: parsed.data.name,
      token: invitationToken,
      role: roleLabels[parsed.data.role] ?? 'Lecteur',
    })
  } catch {
    await db.update(invitations).set({ status: 'Cancelled', updatedAt: new Date() }).where(eq(invitations.id, invitation.id))
    await db.insert(auditEvents).values({
      actorUserId: actor.id,
      action: 'invitation.delivery_failed',
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { email: parsed.data.email },
    })
    return { ok: false as const, message: 'L’invitation n’a pas pu être envoyée. Vérifiez la configuration SMTP Microsoft 365.' }
  }

  await db.insert(auditEvents).values({
    actorUserId: actor.id,
    action: 'invitation.sent',
    targetType: 'invitation',
    targetId: invitation.id,
    metadata: { email: parsed.data.email, role: parsed.data.role },
  })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Invitation envoyée par e-mail.' }
}

export async function acceptInvitation(input: unknown) {
  const identity = await getCurrentIdentity()
  if (!identity) return { ok: false as const, message: 'Authentification requise.' }

  const parsed = z.object({ token: z.string().min(32).max(256) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Invitation invalide.' }

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex')
  const result = await db.transaction(async (tx) => {
    const [invitation] = await tx
      .update(invitations)
      .set({ status: 'Accepted', updatedAt: new Date() })
      .where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.email, identity.email), eq(invitations.status, 'Pending'), gt(invitations.expiresAt, new Date())))
      .returning({ id: invitations.id, role: invitations.role })

    if (!invitation) return null
    const assignedRole = invitation.role === 'Administrator' ? 'admin' : invitation.role === 'Watcher' ? 'contributor' : 'reader'
    await tx.update(users).set({ role: assignedRole, status: 'active', updatedAt: new Date() }).where(eq(users.id, identity.id))
    await tx.insert(auditEvents).values({
      actorUserId: identity.id,
      action: 'invitation.accepted',
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { role: invitation.role },
    })
    return assignedRole
  })

  if (!result) return { ok: false as const, message: 'Cette invitation est invalide, expirée ou liée à une autre adresse.' }
  return { ok: true as const, destination: result === 'admin' ? '/admin/users' : '/admission' }
}

export async function decideAdmission(input: unknown) {
  const actor = await requireAdmin()
  const parsed = admissionDecisionSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Décision invalide.' }

  const result = await db.transaction(async (tx) => {
    const [admission] = await tx
      .update(admissionRequests)
      .set({ status: parsed.data.decision, reviewedByUserId: actor.id, reviewedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(admissionRequests.id, parsed.data.id), eq(admissionRequests.status, 'Pending')))
      .returning()

    if (!admission) return false

    if (parsed.data.decision === 'Approved') {
      await tx.update(users).set({ role: requestedRoleToDatabase[admission.requestedRole] ?? 'reader', status: 'active', updatedAt: new Date() }).where(eq(users.email, admission.email))
    }

    await tx.insert(auditEvents).values({
      actorUserId: actor.id,
      action: `admission.${parsed.data.decision.toLowerCase()}`,
      targetType: 'admission_request',
      targetId: admission.id,
      metadata: { email: admission.email },
    })
    return true
  })

  if (!result) return { ok: false as const, message: 'Cette demande a déjà été traitée.' }
  revalidatePath('/admin/users')
  return { ok: true as const, message: parsed.data.decision === 'Approved' ? 'Admission approuvée.' : 'Demande refusée.' }
}

export async function updateUserStatus(input: unknown) {
  const actor = await requireAdmin()
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success || parsed.data.userId === actor.id) return { ok: false as const, message: 'Cette modification est interdite.' }

  const [updated] = await db.update(users).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(users.id, parsed.data.userId)).returning({ id: users.id })
  if (!updated) return { ok: false as const, message: 'Utilisateur introuvable.' }

  if (parsed.data.status === 'suspended') {
    await db.delete(sessions).where(eq(sessions.userId, parsed.data.userId))
  }
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: `user.${parsed.data.status}`, targetType: 'user', targetId: updated.id })
  revalidatePath('/admin/users')
  return { ok: true as const, message: parsed.data.status === 'suspended' ? 'Utilisateur suspendu.' : 'Utilisateur réactivé.' }
}
