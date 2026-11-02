'use server'

import { and, count, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireAdmin, requireTeamsAccess, getDefaultOrganization } from '@/lib/authorization'
import { db } from '@/lib/db'
import { admissionRequests, auditEvents, invitations, teams, users } from '@/lib/db/schema'
import { isUniqueViolation } from '@/lib/rate-limit'
import { ROLE_LABELS, canManageTarget, isAdminRole, isRoleKey, type RoleKey } from '@/lib/roles'
import type { TeamDetail, TeamHistoryEntry, TeamSummary, TeamViewer, TeamsOverview } from '@/lib/team-types'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const MAX_BULK_MEMBERS = 50

const nameField = z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.').max(80, 'Le nom ne peut pas dépasser 80 caractères.').transform((value) => value.replace(/\s+/g, ' '))
const descriptionField = z.string().trim().max(400, 'La description ne peut pas dépasser 400 caractères.')

const createSchema = z.object({ name: nameField, description: descriptionField.optional() })
const updateSchema = z.object({ id: z.string().uuid(), name: nameField, description: descriptionField.optional() })
const idSchema = z.object({ id: z.string().uuid() })
const membersSchema = z.object({ teamId: z.string().uuid(), userIds: z.array(z.string().min(1).max(255)).min(1).max(MAX_BULK_MEMBERS) })
const memberSchema = z.object({ teamId: z.string().uuid(), userId: z.string().min(1).max(255) })
const leadSchema = z.object({ teamId: z.string().uuid(), userId: z.string().min(1).max(255).nullable() })

const ACTION_LABELS: Record<string, string> = {
  'team.created': 'Équipe créée',
  'team.updated': 'Informations modifiées',
  'team.archived': 'Équipe archivée',
  'team.restored': 'Équipe restaurée',
  'team.member_added': 'Membre ajouté',
  'team.member_removed': 'Membre retiré',
  'team.lead_changed': 'Responsable modifié',
}

type Failure = { ok: false; message: string }
const fail = (message: string): Failure => ({ ok: false, message })

function getInitials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? 'Les informations saisies sont invalides.'
}

function revalidateTeams() {
  revalidatePath('/admin/teams')
  revalidatePath('/admin/users')
}

async function loadTeam(id: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1)
  return team ?? null
}

async function findDuplicateName(organizationId: string, name: string, excludeId?: string) {
  const [duplicate] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.organizationId, organizationId), sql`lower(${teams.name}) = lower(${name})`, excludeId ? ne(teams.id, excludeId) : undefined))
    .limit(1)
  return Boolean(duplicate)
}

async function countPending(teamId: string) {
  const [[admissionTotal], [invitationTotal]] = await Promise.all([
    db.select({ total: count() }).from(admissionRequests).where(and(eq(admissionRequests.declaredTeamId, teamId), eq(admissionRequests.status, 'Pending'))),
    db.select({ total: count() }).from(invitations).where(and(eq(invitations.teamId, teamId), eq(invitations.status, 'Pending'), gt(invitations.expiresAt, new Date()))),
  ])
  return { admissions: admissionTotal?.total ?? 0, invitations: invitationTotal?.total ?? 0 }
}

function audit(actorUserId: string, action: string, teamId: string, metadata: Record<string, string | number | boolean | null> = {}) {
  return { actorUserId, action, targetType: 'team', targetId: teamId, metadata }
}

async function buildSummaries(rows: (typeof teams.$inferSelect)[]): Promise<TeamSummary[]> {
  if (rows.length === 0) return []
  const ids = rows.map((team) => team.id)
  const leadIds = rows.flatMap((team) => (team.leadUserId ? [team.leadUserId] : []))

  const [memberRows, memberCounts, admissionCounts, invitationCounts, leadRows] = await Promise.all([
    db.select({ id: users.id, name: users.name, image: users.image, teamId: users.teamId })
      .from(users).where(inArray(users.teamId, ids)).orderBy(users.name),
    db.select({ teamId: users.teamId, total: count(), active: sql<number>`count(*) filter (where ${users.status} = 'active')`.mapWith(Number) })
      .from(users).where(inArray(users.teamId, ids)).groupBy(users.teamId),
    db.select({ teamId: admissionRequests.declaredTeamId, total: count() })
      .from(admissionRequests).where(and(eq(admissionRequests.status, 'Pending'), inArray(admissionRequests.declaredTeamId, ids))).groupBy(admissionRequests.declaredTeamId),
    db.select({ teamId: invitations.teamId, total: count() })
      .from(invitations).where(and(eq(invitations.status, 'Pending'), gt(invitations.expiresAt, new Date()), inArray(invitations.teamId, ids))).groupBy(invitations.teamId),
    leadIds.length > 0 ? db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(inArray(users.id, leadIds)) : Promise.resolve([]),
  ])

  const counts = new Map(memberCounts.map((row) => [row.teamId, row]))
  const admissionMap = new Map(admissionCounts.map((row) => [row.teamId, row.total]))
  const invitationMap = new Map(invitationCounts.map((row) => [row.teamId, row.total]))
  const leads = new Map(leadRows.map((lead) => [lead.id, lead]))
  const membersByTeam = new Map<string, { id: string; name: string; image: string | null; initials: string }[]>()
  for (const member of memberRows) {
    if (!member.teamId) continue
    const list = membersByTeam.get(member.teamId) ?? []
    if (list.length < 5) list.push({ id: member.id, name: member.name, image: member.image, initials: getInitials(member.name) })
    membersByTeam.set(member.teamId, list)
  }

  return rows.map((team) => {
    const lead = team.leadUserId ? leads.get(team.leadUserId) : undefined
    const stats = counts.get(team.id)
    return {
      id: team.id,
      name: team.name,
      description: team.description ?? '',
      archived: team.status === 'archived',
      leadId: lead?.id ?? null,
      leadName: lead?.name ?? null,
      leadImage: lead?.image ?? null,
      leadInitials: lead ? getInitials(lead.name) : '',
      memberCount: stats?.total ?? 0,
      activeMemberCount: stats?.active ?? 0,
      pendingAdmissions: admissionMap.get(team.id) ?? 0,
      pendingInvitations: invitationMap.get(team.id) ?? 0,
      createdAt: dateFormatter.format(team.createdAt),
      members: membersByTeam.get(team.id) ?? [],
    }
  })
}

export async function getTeamsOverview(): Promise<TeamsOverview> {
  const actor = await requireTeamsAccess()
  const canAdminister = isAdminRole(actor.role)
  const organization = await getDefaultOrganization()

  const rows = canAdminister
    ? await db.select().from(teams).orderBy(teams.status, teams.name)
    : actor.teamId
      ? await db.select().from(teams).where(eq(teams.id, actor.teamId))
      : []

  const viewer: TeamViewer = { id: actor.id, role: actor.role as RoleKey, teamId: actor.teamId, canAdminister }
  return { viewer, organizationName: organization?.name ?? 'Votre organisation', teams: await buildSummaries(rows) }
}

export async function getTeamDetail(input: unknown): Promise<{ ok: true; detail: TeamDetail } | Failure> {
  const actor = await requireTeamsAccess()
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Équipe invalide.')

  const canAdminister = isAdminRole(actor.role)
  if (!canAdminister && actor.teamId !== parsed.data.id) return fail('Cette équipe ne relève pas de votre périmètre.')

  const team = await loadTeam(parsed.data.id)
  if (!team) return fail('Équipe introuvable.')

  const [[summary], memberRows, admissionRows, invitationRows, historyRows, candidateRows] = await Promise.all([
    buildSummaries([team]),
    db.select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role, status: users.status, lastLoginAt: users.lastLoginAt })
      .from(users).where(eq(users.teamId, team.id)).orderBy(users.name),
    db.select().from(admissionRequests)
      .where(and(eq(admissionRequests.declaredTeamId, team.id), eq(admissionRequests.status, 'Pending'))).orderBy(desc(admissionRequests.createdAt)),
    db.select().from(invitations)
      .where(and(eq(invitations.teamId, team.id), eq(invitations.status, 'Pending'), gt(invitations.expiresAt, new Date()))).orderBy(desc(invitations.createdAt)),
    db.select({ id: auditEvents.id, action: auditEvents.action, metadata: auditEvents.metadata, createdAt: auditEvents.createdAt, actor: users.name })
      .from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(and(eq(auditEvents.targetType, 'team'), eq(auditEvents.targetId, team.id))).orderBy(desc(auditEvents.createdAt)).limit(40),
    canAdminister && team.status === 'active'
      ? db.select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role, teamId: users.teamId })
          .from(users)
          .where(and(eq(users.organizationId, team.organizationId), eq(users.status, 'active'), sql`${users.teamId} is distinct from ${team.id}`))
          .orderBy(users.name).limit(300)
      : Promise.resolve([]),
  ])

  const teamNameRows = candidateRows.length > 0
    ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, candidateRows.flatMap((row) => (row.teamId ? [row.teamId] : []))))
    : []
  const teamNames = new Map(teamNameRows.map((row) => [row.id, row.name]))

  const detail: TeamDetail = {
    team: summary,
    members: memberRows.map((member) => {
      const roleKey = (isRoleKey(member.role) ? member.role : 'reader') as RoleKey
      return {
        id: member.id,
        name: member.name,
        email: member.email,
        image: member.image,
        initials: getInitials(member.name),
        roleKey,
        role: ROLE_LABELS[roleKey],
        status: member.status === 'suspended' ? 'Suspendu' : 'Actif',
        lastSeen: member.lastLoginAt ? dateTimeFormatter.format(member.lastLoginAt) : 'Jamais connecté',
        isLead: member.id === team.leadUserId,
        manageable: canAdminister && team.status === 'active' && canManageTarget(actor.role, member.role),
      }
    }),
    admissions: admissionRows.map((admission) => ({
      id: admission.id,
      name: admission.name,
      email: admission.email,
      initials: getInitials(admission.name),
      requestedRole: admission.requestedRole === 'Watcher' ? 'Contributeur' : 'Lecteur',
      requestedAt: dateTimeFormatter.format(admission.createdAt),
      message: admission.message ?? '',
    })),
    invitations: invitationRows.map((invitation) => ({
      id: invitation.id,
      name: invitation.name,
      email: invitation.email,
      initials: getInitials(invitation.name),
      role: ({ Administrator: 'Administrateur', Manager: 'Manager', Watcher: 'Contributeur', Reader: 'Lecteur' } as Record<string, string>)[invitation.role] ?? 'Lecteur',
      status: 'En attente',
      expiresAt: dateTimeFormatter.format(invitation.expiresAt),
    })),
    history: historyRows.map((row): TeamHistoryEntry => {
      const metadata = row.metadata ?? {}
      const subject = typeof metadata.userName === 'string' ? metadata.userName : ''
      const detailText = row.action === 'team.updated' && typeof metadata.previousName === 'string' && metadata.previousName !== metadata.name
        ? `Renommée depuis « ${metadata.previousName} »`
        : row.action === 'team.created' ? `Équipe « ${metadata.name ?? team.name} »` : subject
      return { id: row.id, label: ACTION_LABELS[row.action] ?? row.action, detail: detailText, actor: row.actor ?? 'Utilisateur supprimé', at: dateTimeFormatter.format(row.createdAt) }
    }),
    candidates: candidateRows
      .filter((candidate) => canManageTarget(actor.role, candidate.role))
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        image: candidate.image,
        initials: getInitials(candidate.name),
        teamName: candidate.teamId ? teamNames.get(candidate.teamId) ?? null : null,
      })),
  }

  return { ok: true, detail }
}

export async function createTeam(input: unknown): Promise<{ ok: true; message: string; id: string } | Failure> {
  const actor = await requireAdmin()
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail(firstError(parsed.error))

  const organization = await getDefaultOrganization()
  if (!organization) return fail('Organisation introuvable.')
  if (await findDuplicateName(organization.id, parsed.data.name)) return fail('Une équipe porte déjà ce nom.')

  try {
    const created = await db.transaction(async (tx) => {
      const [team] = await tx.insert(teams).values({ organizationId: organization.id, name: parsed.data.name, description: parsed.data.description || null }).returning({ id: teams.id })
      await tx.insert(auditEvents).values(audit(actor.id, 'team.created', team.id, { name: parsed.data.name }))
      return team
    })
    revalidateTeams()
    return { ok: true, message: 'Équipe créée.', id: created.id }
  } catch (error) {
    if (isUniqueViolation(error)) return fail('Une équipe porte déjà ce nom.')
    throw error
  }
}

export async function updateTeam(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requireAdmin()
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(firstError(parsed.error))

  const team = await loadTeam(parsed.data.id)
  if (!team) return fail('Équipe introuvable.')
  if (team.status === 'archived') return fail('Une équipe archivée ne peut pas être modifiée. Restaurez-la d’abord.')
  if (await findDuplicateName(team.organizationId, parsed.data.name, team.id)) return fail('Une équipe porte déjà ce nom.')

  const description = parsed.data.description || null
  if (team.name === parsed.data.name && (team.description ?? null) === description) return { ok: true, message: 'Aucune modification à enregistrer.' }

  try {
    await db.transaction(async (tx) => {
      await tx.update(teams).set({ name: parsed.data.name, description, updatedAt: new Date() }).where(eq(teams.id, team.id))
      await tx.insert(auditEvents).values(audit(actor.id, 'team.updated', team.id, { name: parsed.data.name, previousName: team.name }))
    })
  } catch (error) {
    if (isUniqueViolation(error)) return fail('Une équipe porte déjà ce nom.')
    throw error
  }
  revalidateTeams()
  return { ok: true, message: 'Équipe mise à jour.' }
}

export async function archiveTeam(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requireAdmin()
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Équipe invalide.')

  const team = await loadTeam(parsed.data.id)
  if (!team) return fail('Équipe introuvable.')
  if (team.status === 'archived') return fail('Cette équipe est déjà archivée.')

  const pending = await countPending(team.id)
  if (pending.admissions > 0) return fail(`${pending.admissions} demande(s) d’admission en attente ciblent cette équipe. Traitez-les avant d’archiver.`)
  if (pending.invitations > 0) return fail(`${pending.invitations} invitation(s) en attente ciblent cette équipe. Annulez-les avant d’archiver.`)

  const [updated] = await db.update(teams).set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(teams.id, team.id), eq(teams.status, 'active'))).returning({ id: teams.id })
  if (!updated) return fail('Cette équipe est déjà archivée.')
  await db.insert(auditEvents).values(audit(actor.id, 'team.archived', team.id, { name: team.name }))
  revalidateTeams()
  return { ok: true, message: 'Équipe archivée. Elle n’est plus proposée aux nouvelles admissions.' }
}

export async function restoreTeam(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requireAdmin()
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Équipe invalide.')

  const team = await loadTeam(parsed.data.id)
  if (!team) return fail('Équipe introuvable.')
  if (team.status !== 'archived') return fail('Cette équipe est déjà active.')

  const [updated] = await db.update(teams).set({ status: 'active', archivedAt: null, updatedAt: new Date() }).where(and(eq(teams.id, team.id), eq(teams.status, 'archived'))).returning({ id: teams.id })
  if (!updated) return fail('Cette équipe est déjà active.')
  await db.insert(auditEvents).values(audit(actor.id, 'team.restored', team.id, { name: team.name }))
  revalidateTeams()
  return { ok: true, message: 'Équipe restaurée.' }
}

export async function deleteTeam(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requireAdmin()
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Équipe invalide.')

  const team = await loadTeam(parsed.data.id)
  if (!team) return fail('Équipe introuvable.')
  if (team.status !== 'archived') return fail('Archivez l’équipe avant de la supprimer définitivement.')

  const deleted = await db.transaction(async (tx) => {
    const [members] = await tx.select({ total: count() }).from(users).where(eq(users.teamId, team.id))
    if ((members?.total ?? 0) > 0) return 'members' as const
    await tx.update(admissionRequests).set({ declaredTeamId: null }).where(eq(admissionRequests.declaredTeamId, team.id))
    await tx.update(invitations).set({ teamId: null }).where(eq(invitations.teamId, team.id))
    await tx.delete(teams).where(eq(teams.id, team.id))
    await tx.insert(auditEvents).values(audit(actor.id, 'team.deleted', team.id, { name: team.name }))
    return 'ok' as const
  })

  if (deleted === 'members') return fail('Cette équipe contient encore des membres. Réaffectez-les avant de la supprimer.')
  revalidateTeams()
  return { ok: true, message: 'Équipe supprimée définitivement.' }
}

export async function addTeamMembers(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requireAdmin()
  const parsed = membersSchema.safeParse(input)
  if (!parsed.success) return fail('Sélectionnez au moins un utilisateur.')

  const team = await loadTeam(parsed.data.teamId)
  if (!team) return fail('Équipe introuvable.')
  if (team.status !== 'active') return fail('Cette équipe est archivée : impossible d’ajouter des membres.')

  const userIds = [...new Set(parsed.data.userIds)]
  const targets = await db
    .select({ id: users.id, name: users.name, role: users.role, status: users.status, teamId: users.teamId, organizationId: users.organizationId })
    .from(users).where(inArray(users.id, userIds))

  const eligible = targets.filter((target) => target.organizationId === team.organizationId && target.status === 'active' && target.teamId !== team.id && canManageTarget(actor.role, target.role))
  if (eligible.length === 0) return fail('Aucun des utilisateurs sélectionnés ne peut être ajouté à cette équipe.')

  await db.transaction(async (tx) => {
    for (const target of eligible) {
      await tx.update(users).set({ teamId: team.id, updatedAt: new Date() }).where(eq(users.id, target.id))
      await tx.update(teams).set({ leadUserId: null, updatedAt: new Date() }).where(and(eq(teams.leadUserId, target.id), ne(teams.id, team.id)))
      await tx.insert(auditEvents).values(audit(actor.id, 'team.member_added', team.id, { userId: target.id, userName: target.name, previousTeamId: target.teamId }))
    }
  })

  revalidateTeams()
  const skipped = userIds.length - eligible.length
  const base = eligible.length === 1 ? '1 membre ajouté.' : `${eligible.length} membres ajoutés.`
  return { ok: true, message: skipped > 0 ? `${base} ${skipped} utilisateur(s) ignoré(s) (déjà membres ou non éligibles).` : base }
}

export async function removeTeamMember(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requireAdmin()
  const parsed = memberSchema.safeParse(input)
  if (!parsed.success) return fail('Membre invalide.')

  const team = await loadTeam(parsed.data.teamId)
  if (!team) return fail('Équipe introuvable.')
  if (team.status !== 'active') return fail('Cette équipe est archivée : ses membres ne peuvent pas être modifiés.')

  const [target] = await db.select({ id: users.id, name: users.name, role: users.role, teamId: users.teamId }).from(users).where(eq(users.id, parsed.data.userId)).limit(1)
  if (!target || target.teamId !== team.id) return fail('Ce membre ne fait plus partie de l’équipe.')
  if (!canManageTarget(actor.role, target.role)) return fail('Vous n’avez pas le droit de modifier cet utilisateur.')

  await db.transaction(async (tx) => {
    await tx.update(users).set({ teamId: null, updatedAt: new Date() }).where(eq(users.id, target.id))
    await tx.update(teams).set({ leadUserId: null, updatedAt: new Date() }).where(and(eq(teams.id, team.id), eq(teams.leadUserId, target.id)))
    await tx.insert(auditEvents).values(audit(actor.id, 'team.member_removed', team.id, { userId: target.id, userName: target.name }))
  })

  revalidateTeams()
  return { ok: true, message: `${target.name} a été retiré de l’équipe.` }
}

export async function setTeamLead(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requireAdmin()
  const parsed = leadSchema.safeParse(input)
  if (!parsed.success) return fail('Responsable invalide.')

  const team = await loadTeam(parsed.data.teamId)
  if (!team) return fail('Équipe introuvable.')
  if (team.status !== 'active') return fail('Cette équipe est archivée : son responsable ne peut pas être modifié.')

  if (parsed.data.userId === null) {
    if (!team.leadUserId) return { ok: true, message: 'Aucun responsable n’était défini.' }
    await db.transaction(async (tx) => {
      await tx.update(teams).set({ leadUserId: null, updatedAt: new Date() }).where(eq(teams.id, team.id))
      await tx.insert(auditEvents).values(audit(actor.id, 'team.lead_changed', team.id, { userId: null, userName: 'Aucun responsable' }))
    })
    revalidateTeams()
    return { ok: true, message: 'Responsable retiré.' }
  }

  const [member] = await db.select({ id: users.id, name: users.name, status: users.status, teamId: users.teamId }).from(users).where(eq(users.id, parsed.data.userId)).limit(1)
  if (!member || member.teamId !== team.id) return fail('Le responsable doit être membre de l’équipe.')
  if (member.status !== 'active') return fail('Un utilisateur suspendu ne peut pas être responsable.')
  if (team.leadUserId === member.id) return { ok: true, message: `${member.name} est déjà responsable.` }

  await db.transaction(async (tx) => {
    await tx.update(teams).set({ leadUserId: member.id, updatedAt: new Date() }).where(eq(teams.id, team.id))
    await tx.insert(auditEvents).values(audit(actor.id, 'team.lead_changed', team.id, { userId: member.id, userName: member.name }))
  })
  revalidateTeams()
  return { ok: true, message: `${member.name} est désormais responsable de l’équipe.` }
}
