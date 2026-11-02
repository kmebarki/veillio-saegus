'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getCurrentIdentity } from '@/lib/authorization'
import { db } from '@/lib/db'
import { admissionRequests, auditEvents, teams, users } from '@/lib/db/schema'
import { type UserProfile, profileSchema } from '@/lib/profile'
import { ROLE_LABELS, canManageTarget, isAdminRole, isRoleKey, type RoleKey } from '@/lib/roles'

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const lookupSchema = z.union([z.object({ userId: z.string().min(1).max(255) }), z.object({ email: z.string().trim().toLowerCase().email().max(254) })])
const saveSchema = profileSchema.and(z.object({ userId: z.string().min(1).max(255).optional() }))

function splitName(name: string) {
  const [first = '', ...rest] = name.trim().split(/\s+/)
  return { firstName: first, lastName: rest.join(' ') }
}

export async function getUserProfile(input: unknown) {
  const actor = await getCurrentIdentity()
  if (!actor) return { ok: false as const, message: 'Authentification requise.' }

  const parsed = lookupSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Utilisateur invalide.' }

  const [target] = await db
    .select()
    .from(users)
    .where('userId' in parsed.data ? eq(users.id, parsed.data.userId) : eq(users.email, parsed.data.email))
    .limit(1)
  if (!target) return { ok: false as const, message: 'Utilisateur introuvable.' }

  const isSelf = target.id === actor.id
  const canAdminister = isAdminRole(actor.role)
  const isTeamManager = actor.role === 'pilot' && Boolean(actor.teamId)

  let allowed = isSelf || canAdminister
  if (!allowed && isTeamManager) {
    if (target.teamId === actor.teamId) {
      allowed = true
    } else {
      const [pending] = await db
        .select({ id: admissionRequests.id })
        .from(admissionRequests)
        .where(and(eq(admissionRequests.email, target.email), eq(admissionRequests.status, 'Pending'), eq(admissionRequests.declaredTeamId, actor.teamId as string)))
        .limit(1)
      allowed = Boolean(pending)
    }
  }
  if (!allowed) return { ok: false as const, message: 'Vous n’avez pas accès à cette fiche.' }

  let teamName = 'Aucune équipe'
  if (target.teamId) {
    const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, target.teamId)).limit(1)
    teamName = team?.name ?? 'Équipe supprimée'
  }

  const fallback = splitName(target.name)
  const roleKey = (isRoleKey(target.role) ? target.role : 'reader') as RoleKey
  const profile: UserProfile = {
    id: target.id,
    email: target.email,
    civility: target.civility ?? '',
    firstName: target.firstName ?? fallback.firstName,
    lastName: target.lastName ?? fallback.lastName,
    city: target.city ?? '',
    country: target.country ?? '',
    profession: target.profession ?? '',
    company: target.company ?? '',
    addressLine1: target.addressLine1 ?? '',
    addressLine2: target.addressLine2 ?? '',
    postalCode: target.postalCode ?? '',
    phone: target.phone ?? '',
    role: ROLE_LABELS[roleKey],
    team: teamName,
    status: target.status === 'suspended' ? 'Suspendu' : 'Actif',
    lastSeen: target.lastLoginAt ? dateTimeFormatter.format(target.lastLoginAt) : 'Jamais connecté',
    createdAt: dateTimeFormatter.format(target.createdAt),
    canEdit: isSelf || (canAdminister && canManageTarget(actor.role, target.role)),
  }
  return { ok: true as const, profile }
}

export async function saveUserProfile(input: unknown) {
  const actor = await getCurrentIdentity()
  if (!actor) return { ok: false as const, message: 'Authentification requise.' }

  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Vérifiez les champs obligatoires et le format des informations saisies.' }
  const { userId, ...values } = parsed.data

  const targetId = userId ?? actor.id
  if (targetId !== actor.id) {
    if (!isAdminRole(actor.role)) return { ok: false as const, message: 'Vous n’avez pas le droit de modifier cette fiche.' }
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, targetId)).limit(1)
    if (!target) return { ok: false as const, message: 'Utilisateur introuvable.' }
    if (!canManageTarget(actor.role, target.role)) return { ok: false as const, message: 'Vous n’avez pas le droit de modifier cette fiche.' }
  }

  await db.update(users).set({ ...values, name: `${values.firstName} ${values.lastName}`.trim(), updatedAt: new Date() }).where(eq(users.id, targetId))
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'user.profile_updated', targetType: 'user', targetId })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Fiche utilisateur enregistrée.' }
}
