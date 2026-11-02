'use server'

import { and, count, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getDefaultOrganization, requireAdmin } from '@/lib/authorization'
import { db } from '@/lib/db'
import { admissionRequests, auditEvents, authorizedDomains, invitations, teams, users } from '@/lib/db/schema'
import { PUBLIC_EMAIL_DOMAINS } from '@/lib/domain-admission'

const domainPattern = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/

const teamNameSchema = z.object({ name: z.string().trim().min(2).max(80) })
const idSchema = z.object({ id: z.string().uuid() })
const domainSchema = z.object({
  domain: z.string().trim().toLowerCase().transform((value) => value.replace(/^@/, '')).pipe(z.string().max(253).regex(domainPattern)),
  autoAdmit: z.boolean(),
})
const domainToggleSchema = z.object({ id: z.string().uuid(), autoAdmit: z.boolean() })

export async function createTeam(input: unknown) {
  const actor = await requireAdmin()
  const parsed = teamNameSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Le nom de l’équipe est invalide.' }
  const organization = await getDefaultOrganization()
  if (!organization) return { ok: false as const, message: 'Organisation introuvable.' }

  const [duplicate] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.organizationId, organization.id), eq(teams.name, parsed.data.name))).limit(1)
  if (duplicate) return { ok: false as const, message: 'Une équipe porte déjà ce nom.' }

  const [team] = await db.insert(teams).values({ organizationId: organization.id, name: parsed.data.name }).returning({ id: teams.id })
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'team.created', targetType: 'team', targetId: team.id, metadata: { name: parsed.data.name } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Équipe créée.' }
}

export async function renameTeam(input: unknown) {
  const actor = await requireAdmin()
  const parsed = z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(80) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Les informations sont invalides.' }

  const [team] = await db.update(teams).set({ name: parsed.data.name }).where(eq(teams.id, parsed.data.id)).returning({ id: teams.id })
  if (!team) return { ok: false as const, message: 'Équipe introuvable.' }
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'team.renamed', targetType: 'team', targetId: team.id, metadata: { name: parsed.data.name } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Équipe renommée.' }
}

export async function deleteTeam(input: unknown) {
  const actor = await requireAdmin()
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Équipe invalide.' }

  const [[members], [pendingAdmissions], [pendingInvitations]] = await Promise.all([
    db.select({ total: count() }).from(users).where(eq(users.teamId, parsed.data.id)),
    db.select({ total: count() }).from(admissionRequests).where(and(eq(admissionRequests.declaredTeamId, parsed.data.id), eq(admissionRequests.status, 'Pending'))),
    db.select({ total: count() }).from(invitations).where(and(eq(invitations.teamId, parsed.data.id), eq(invitations.status, 'Pending'))),
  ])
  if (members.total > 0 || pendingAdmissions.total > 0 || pendingInvitations.total > 0) {
    return { ok: false as const, message: 'Cette équipe contient des membres ou des demandes en cours. Réaffectez-les avant de la supprimer.' }
  }

  const [deleted] = await db.delete(teams).where(eq(teams.id, parsed.data.id)).returning({ id: teams.id })
  if (!deleted) return { ok: false as const, message: 'Équipe introuvable.' }
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'team.deleted', targetType: 'team', targetId: deleted.id })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Équipe supprimée.' }
}

export async function addAuthorizedDomain(input: unknown) {
  const actor = await requireAdmin()
  const parsed = domainSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Le nom de domaine est invalide (exemple : saegus.com).' }
  if (PUBLIC_EMAIL_DOMAINS.has(parsed.data.domain)) return { ok: false as const, message: 'Un domaine de messagerie grand public ne peut pas être autorisé.' }
  const organization = await getDefaultOrganization()
  if (!organization) return { ok: false as const, message: 'Organisation introuvable.' }

  const [existing] = await db.select({ id: authorizedDomains.id }).from(authorizedDomains).where(eq(authorizedDomains.domain, parsed.data.domain)).limit(1)
  if (existing) return { ok: false as const, message: 'Ce domaine est déjà configuré.' }

  const [domain] = await db.insert(authorizedDomains).values({ organizationId: organization.id, domain: parsed.data.domain, autoAdmit: parsed.data.autoAdmit }).returning({ id: authorizedDomains.id })
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'domain.added', targetType: 'authorized_domain', targetId: domain.id, metadata: { domain: parsed.data.domain, autoAdmit: parsed.data.autoAdmit } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Domaine ajouté.' }
}

export async function setDomainAutoAdmit(input: unknown) {
  const actor = await requireAdmin()
  const parsed = domainToggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Domaine invalide.' }

  const [domain] = await db.update(authorizedDomains).set({ autoAdmit: parsed.data.autoAdmit }).where(eq(authorizedDomains.id, parsed.data.id)).returning({ id: authorizedDomains.id })
  if (!domain) return { ok: false as const, message: 'Domaine introuvable.' }
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'domain.auto_admit_changed', targetType: 'authorized_domain', targetId: domain.id, metadata: { autoAdmit: parsed.data.autoAdmit } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: parsed.data.autoAdmit ? 'Admission automatique activée.' : 'Admission automatique désactivée.' }
}

export async function removeAuthorizedDomain(input: unknown) {
  const actor = await requireAdmin()
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Domaine invalide.' }

  const [domain] = await db.delete(authorizedDomains).where(eq(authorizedDomains.id, parsed.data.id)).returning({ id: authorizedDomains.id, domain: authorizedDomains.domain })
  if (!domain) return { ok: false as const, message: 'Domaine introuvable.' }
  await db.insert(auditEvents).values({ actorUserId: actor.id, action: 'domain.removed', targetType: 'authorized_domain', targetId: domain.id, metadata: { domain: domain.domain } })
  revalidatePath('/admin/users')
  return { ok: true as const, message: 'Domaine supprimé.' }
}
