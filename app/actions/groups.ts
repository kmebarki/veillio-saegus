'use server'

import { and, count, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getDefaultOrganization, requirePermission } from '@/lib/authorization'
import { db } from '@/lib/db'
import { auditEvents, permissionGroupMembers, permissionGroups, users } from '@/lib/db/schema'
import type { GroupDetail, GroupHistoryEntry, GroupSummary, GroupViewer, GroupsOverview, RoleMatrixColumn } from '@/lib/group-types'
import { PERMISSION_KEYS, getRolePermissions, isPermissionKey, isSensitivePermission, normalizePermissions } from '@/lib/permissions'
import { isUniqueViolation } from '@/lib/rate-limit'
import { ROLE_LABELS, isRoleKey, type RoleKey } from '@/lib/roles'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const MAX_GROUPS = 100
const MAX_BULK_MEMBERS = 50
const MAX_MEMBERS_PER_GROUP = 500

const nameField = z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.').max(60, 'Le nom ne peut pas dépasser 60 caractères.').transform((value) => value.replace(/\s+/g, ' '))
const descriptionField = z.string().trim().max(300, 'La description ne peut pas dépasser 300 caractères.')
const permissionsField = z
  .array(z.string().max(60))
  .min(1, 'Sélectionnez au moins une permission.')
  .max(PERMISSION_KEYS.length, 'Liste de permissions invalide.')
  .refine((keys) => keys.every(isPermissionKey), 'Une permission sélectionnée est inconnue.')

const createSchema = z.object({ name: nameField, description: descriptionField.optional(), permissions: permissionsField })
const updateSchema = createSchema.extend({ id: z.string().uuid(), version: z.number().int().positive() })
const idSchema = z.object({ id: z.string().uuid() })
const membersSchema = z.object({ groupId: z.string().uuid(), userIds: z.array(z.string().min(1).max(255)).min(1).max(MAX_BULK_MEMBERS) })
const memberSchema = z.object({ groupId: z.string().uuid(), userId: z.string().min(1).max(255) })

const ACTION_LABELS: Record<string, string> = {
  'group.created': 'Groupe créé',
  'group.duplicated': 'Groupe dupliqué',
  'group.updated': 'Informations modifiées',
  'group.permissions_changed': 'Permissions modifiées',
  'group.member_added': 'Membre ajouté',
  'group.member_removed': 'Membre retiré',
  'group.deleted': 'Groupe supprimé',
}

type Failure = { ok: false; message: string }
const fail = (message: string): Failure => ({ ok: false, message })

type Actor = Awaited<ReturnType<typeof requirePermission>>

function getInitials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? 'Les informations saisies sont invalides.'
}

function revalidateGroups() {
  revalidatePath('/admin/groups')
}

function isSuperAdmin(actor: Actor) {
  return actor.role === 'super_admin'
}

function missingPermissions(actor: Actor, permissions: readonly string[]) {
  return permissions.filter((permission) => !actor.permissions.includes(permission))
}

function sensitiveDiff(before: readonly string[], after: readonly string[]) {
  const previous = new Set(before.filter(isSensitivePermission))
  const next = new Set(after.filter(isSensitivePermission))
  return [...previous].some((key) => !next.has(key)) || [...next].some((key) => !previous.has(key))
}

function lockReason(actor: Actor, permissions: readonly string[]) {
  if (!actor.permissions.includes('groups.manage')) return 'Vous n’avez pas le droit de gérer les groupes.'
  if (missingPermissions(actor, permissions).length > 0) return 'Ce groupe accorde des permissions que vous ne détenez pas : vous ne pouvez pas le modifier.'
  return null
}

function audit(actorUserId: string, action: string, groupId: string, metadata: Record<string, string | number | boolean | null> = {}) {
  return { actorUserId, action, targetType: 'group', targetId: groupId, metadata }
}

async function loadGroup(id: string) {
  const [group] = await db.select().from(permissionGroups).where(eq(permissionGroups.id, id)).limit(1)
  return group ?? null
}

async function findDuplicateName(organizationId: string, name: string, excludeId?: string) {
  const [duplicate] = await db
    .select({ id: permissionGroups.id })
    .from(permissionGroups)
    .where(and(eq(permissionGroups.organizationId, organizationId), sql`lower(${permissionGroups.name}) = lower(${name})`, excludeId ? ne(permissionGroups.id, excludeId) : undefined))
    .limit(1)
  return Boolean(duplicate)
}

async function buildSummaries(actor: Actor, rows: (typeof permissionGroups.$inferSelect)[]): Promise<GroupSummary[]> {
  if (rows.length === 0) return []
  const ids = rows.map((group) => group.id)

  const [counts, memberRows] = await Promise.all([
    db.select({ groupId: permissionGroupMembers.groupId, total: count() }).from(permissionGroupMembers).where(inArray(permissionGroupMembers.groupId, ids)).groupBy(permissionGroupMembers.groupId),
    db
      .select({ groupId: permissionGroupMembers.groupId, id: users.id, name: users.name, image: users.image })
      .from(permissionGroupMembers)
      .innerJoin(users, eq(users.id, permissionGroupMembers.userId))
      .where(inArray(permissionGroupMembers.groupId, ids))
      .orderBy(permissionGroupMembers.createdAt),
  ])

  const totals = new Map(counts.map((row) => [row.groupId, row.total]))
  const preview = new Map<string, GroupSummary['members']>()
  for (const member of memberRows) {
    const list = preview.get(member.groupId) ?? []
    if (list.length < 5) list.push({ id: member.id, name: member.name, image: member.image, initials: getInitials(member.name) })
    preview.set(member.groupId, list)
  }

  return rows.map((group) => {
    const reason = lockReason(actor, group.permissions)
    return {
      id: group.id,
      name: group.name,
      description: group.description ?? '',
      permissions: normalizePermissions(group.permissions),
      memberCount: totals.get(group.id) ?? 0,
      members: preview.get(group.id) ?? [],
      createdAt: dateFormatter.format(group.createdAt),
      updatedAt: dateTimeFormatter.format(group.updatedAt),
      version: group.version,
      editable: reason === null,
      lockedReason: reason,
    }
  })
}

function buildViewer(actor: Actor): GroupViewer {
  return {
    id: actor.id,
    role: (isRoleKey(actor.role) ? actor.role : 'reader') as RoleKey,
    canManage: actor.permissions.includes('groups.manage'),
    permissions: actor.permissions,
    isSuperAdmin: isSuperAdmin(actor),
  }
}

export async function getGroupsOverview(): Promise<GroupsOverview> {
  const actor = await requirePermission('groups.view')
  const organization = await getDefaultOrganization()

  const [rows, roleCounts] = await Promise.all([
    organization ? db.select().from(permissionGroups).where(eq(permissionGroups.organizationId, organization.id)).orderBy(permissionGroups.name) : Promise.resolve([]),
    db.select({ role: users.role, total: count() }).from(users).where(eq(users.status, 'active')).groupBy(users.role),
  ])

  const totals = new Map(roleCounts.map((row) => [row.role, row.total]))
  const roles: RoleMatrixColumn[] = (Object.keys(ROLE_LABELS) as RoleKey[]).map((role) => ({
    role,
    label: ROLE_LABELS[role],
    userCount: totals.get(role) ?? 0,
    permissions: getRolePermissions(role),
  }))

  return {
    viewer: buildViewer(actor),
    organizationName: organization?.name ?? 'Votre organisation',
    groups: await buildSummaries(actor, rows),
    roles,
  }
}

export async function getGroupDetail(input: unknown): Promise<{ ok: true; detail: GroupDetail } | Failure> {
  const actor = await requirePermission('groups.view')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Groupe invalide.')

  const group = await loadGroup(parsed.data.id)
  if (!group) return fail('Groupe introuvable.')

  const reason = lockReason(actor, group.permissions)
  const canEdit = reason === null
  const canAddSensitive = isSuperAdmin(actor) || !group.permissions.some(isSensitivePermission)

  const [[summary], memberRows, historyRows] = await Promise.all([
    buildSummaries(actor, [group]),
    db
      .select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role, status: users.status, addedAt: permissionGroupMembers.createdAt })
      .from(permissionGroupMembers)
      .innerJoin(users, eq(users.id, permissionGroupMembers.userId))
      .where(eq(permissionGroupMembers.groupId, group.id))
      .orderBy(users.name),
    db
      .select({ id: auditEvents.id, action: auditEvents.action, metadata: auditEvents.metadata, createdAt: auditEvents.createdAt, actor: users.name })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(and(eq(auditEvents.targetType, 'group'), eq(auditEvents.targetId, group.id)))
      .orderBy(desc(auditEvents.createdAt))
      .limit(40),
  ])

  const memberIds = memberRows.map((member) => member.id)
  const candidateRows = canEdit && canAddSensitive
    ? await db
        .select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role })
        .from(users)
        .where(and(eq(users.organizationId, group.organizationId), eq(users.status, 'active'), ne(users.role, 'super_admin'), memberIds.length > 0 ? notInArray(users.id, memberIds) : undefined))
        .orderBy(users.name)
        .limit(300)
    : []

  const detail: GroupDetail = {
    group: summary,
    members: memberRows.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      image: member.image,
      initials: getInitials(member.name),
      role: isRoleKey(member.role) ? ROLE_LABELS[member.role] : 'Lecteur',
      status: member.status === 'suspended' ? 'Suspendu' : 'Actif',
      addedAt: dateFormatter.format(member.addedAt),
      removable: canEdit,
    })),
    candidates: candidateRows.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      image: candidate.image,
      initials: getInitials(candidate.name),
      role: isRoleKey(candidate.role) ? ROLE_LABELS[candidate.role] : 'Lecteur',
    })),
    grantable: actor.permissions.filter((permission) => isSuperAdmin(actor) || !isSensitivePermission(permission) || group.permissions.includes(permission)),
    history: historyRows.map((row): GroupHistoryEntry => {
      const metadata = row.metadata ?? {}
      const detailText =
        row.action === 'group.permissions_changed'
          ? [metadata.added ? `Ajoutées : ${metadata.added}` : '', metadata.removed ? `Retirées : ${metadata.removed}` : ''].filter(Boolean).join(' · ')
          : row.action === 'group.updated' && typeof metadata.previousName === 'string' && metadata.previousName !== metadata.name
            ? `Renommé depuis « ${metadata.previousName} »`
            : typeof metadata.userName === 'string' ? metadata.userName : typeof metadata.name === 'string' ? `« ${metadata.name} »` : ''
      return { id: row.id, label: ACTION_LABELS[row.action] ?? row.action, detail: detailText, actor: row.actor ?? 'Utilisateur supprimé', at: dateTimeFormatter.format(row.createdAt) }
    }),
  }

  return { ok: true, detail }
}

function checkGrant(actor: Actor, before: readonly string[], after: readonly string[]): string | null {
  const missing = missingPermissions(actor, after)
  if (missing.length > 0) return 'Vous ne pouvez accorder que des permissions que vous détenez vous-même.'
  if (!isSuperAdmin(actor) && sensitiveDiff(before, after)) return 'Seul un super administrateur peut accorder ou retirer une permission sensible.'
  return null
}

export async function createGroup(input: unknown): Promise<{ ok: true; message: string; id: string } | Failure> {
  const actor = await requirePermission('groups.manage')
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail(firstError(parsed.error))

  const permissions = normalizePermissions(parsed.data.permissions)
  const denied = checkGrant(actor, [], permissions)
  if (denied) return fail(denied)

  const organization = await getDefaultOrganization()
  if (!organization) return fail('Organisation introuvable.')
  if (await findDuplicateName(organization.id, parsed.data.name)) return fail('Un groupe porte déjà ce nom.')

  const [{ total }] = await db.select({ total: count() }).from(permissionGroups).where(eq(permissionGroups.organizationId, organization.id))
  if (total >= MAX_GROUPS) return fail(`Limite atteinte : ${MAX_GROUPS} groupes maximum par organisation.`)

  try {
    const created = await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(permissionGroups)
        .values({ organizationId: organization.id, name: parsed.data.name, description: parsed.data.description || null, permissions, createdByUserId: actor.id })
        .returning({ id: permissionGroups.id })
      await tx.insert(auditEvents).values(audit(actor.id, 'group.created', group.id, { name: parsed.data.name, permissions: permissions.length }))
      return group
    })
    revalidateGroups()
    return { ok: true, message: 'Groupe créé.', id: created.id }
  } catch (error) {
    if (isUniqueViolation(error)) return fail('Un groupe porte déjà ce nom.')
    throw error
  }
}

export async function updateGroup(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('groups.manage')
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(firstError(parsed.error))

  const group = await loadGroup(parsed.data.id)
  if (!group) return fail('Groupe introuvable.')
  const reason = lockReason(actor, group.permissions)
  if (reason) return fail(reason)

  const permissions = normalizePermissions(parsed.data.permissions)
  const denied = checkGrant(actor, group.permissions, permissions)
  if (denied) return fail(denied)
  if (await findDuplicateName(group.organizationId, parsed.data.name, group.id)) return fail('Un groupe porte déjà ce nom.')

  const description = parsed.data.description || null
  const before = new Set(group.permissions)
  const after = new Set(permissions)
  const added = permissions.filter((key) => !before.has(key))
  const removed = group.permissions.filter((key) => !after.has(key))
  const infoChanged = group.name !== parsed.data.name || (group.description ?? null) !== description
  if (!infoChanged && added.length === 0 && removed.length === 0) return { ok: true, message: 'Aucune modification à enregistrer.' }

  try {
    const outcome = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(permissionGroups)
        .set({ name: parsed.data.name, description, permissions, version: sql`${permissionGroups.version} + 1`, updatedAt: new Date() })
        .where(and(eq(permissionGroups.id, group.id), eq(permissionGroups.version, parsed.data.version)))
        .returning({ id: permissionGroups.id })
      if (!updated) return 'conflict' as const
      if (infoChanged) await tx.insert(auditEvents).values(audit(actor.id, 'group.updated', group.id, { name: parsed.data.name, previousName: group.name }))
      if (added.length > 0 || removed.length > 0) {
        await tx.insert(auditEvents).values(audit(actor.id, 'group.permissions_changed', group.id, { added: added.join(', '), removed: removed.join(', ') }))
      }
      return 'ok' as const
    })
    if (outcome === 'conflict') return fail('Ce groupe vient d’être modifié par quelqu’un d’autre. Rechargez-le avant de réessayer.')
  } catch (error) {
    if (isUniqueViolation(error)) return fail('Un groupe porte déjà ce nom.')
    throw error
  }

  revalidateGroups()
  return { ok: true, message: 'Groupe mis à jour. Les permissions s’appliquent immédiatement à ses membres.' }
}

export async function duplicateGroup(input: unknown): Promise<{ ok: true; message: string; id: string } | Failure> {
  const actor = await requirePermission('groups.manage')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Groupe invalide.')

  const group = await loadGroup(parsed.data.id)
  if (!group) return fail('Groupe introuvable.')
  const denied = checkGrant(actor, [], group.permissions)
  if (denied) return fail(denied)

  const [{ total }] = await db.select({ total: count() }).from(permissionGroups).where(eq(permissionGroups.organizationId, group.organizationId))
  if (total >= MAX_GROUPS) return fail(`Limite atteinte : ${MAX_GROUPS} groupes maximum par organisation.`)

  const base = `${group.name} (copie)`.slice(0, 60)
  let name = base
  for (let index = 2; await findDuplicateName(group.organizationId, name); index += 1) name = `${base.slice(0, 55)} ${index}`

  try {
    const created = await db.transaction(async (tx) => {
      const [copy] = await tx
        .insert(permissionGroups)
        .values({ organizationId: group.organizationId, name, description: group.description, permissions: group.permissions, createdByUserId: actor.id })
        .returning({ id: permissionGroups.id })
      await tx.insert(auditEvents).values(audit(actor.id, 'group.duplicated', copy.id, { name, sourceGroupId: group.id }))
      return copy
    })
    revalidateGroups()
    return { ok: true, message: 'Groupe dupliqué sans ses membres.', id: created.id }
  } catch (error) {
    if (isUniqueViolation(error)) return fail('Un groupe porte déjà ce nom. Réessayez.')
    throw error
  }
}

export async function deleteGroup(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('groups.manage')
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return fail('Groupe invalide.')

  const group = await loadGroup(parsed.data.id)
  if (!group) return fail('Groupe introuvable.')
  const reason = lockReason(actor, group.permissions)
  if (reason) return fail(reason)
  if (!isSuperAdmin(actor) && group.permissions.some(isSensitivePermission)) return fail('Seul un super administrateur peut supprimer un groupe qui accorde une permission sensible.')

  const removedMembers = await db.transaction(async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(permissionGroupMembers).where(eq(permissionGroupMembers.groupId, group.id))
    await tx.delete(permissionGroups).where(eq(permissionGroups.id, group.id))
    await tx.insert(auditEvents).values(audit(actor.id, 'group.deleted', group.id, { name: group.name, memberCount: total }))
    return total
  })

  revalidateGroups()
  return { ok: true, message: removedMembers > 0 ? `Groupe supprimé. ${removedMembers} membre(s) perdent les permissions associées.` : 'Groupe supprimé.' }
}

export async function addGroupMembers(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('groups.manage')
  const parsed = membersSchema.safeParse(input)
  if (!parsed.success) return fail('Sélectionnez au moins un utilisateur.')

  const group = await loadGroup(parsed.data.groupId)
  if (!group) return fail('Groupe introuvable.')
  const reason = lockReason(actor, group.permissions)
  if (reason) return fail(reason)
  if (!isSuperAdmin(actor) && group.permissions.some(isSensitivePermission)) return fail('Seul un super administrateur peut ajouter des membres à un groupe qui accorde une permission sensible.')

  const userIds = [...new Set(parsed.data.userIds)]
  const targets = await db
    .select({ id: users.id, name: users.name, role: users.role, status: users.status, organizationId: users.organizationId })
    .from(users)
    .where(inArray(users.id, userIds))
  const eligible = targets.filter((target) => target.organizationId === group.organizationId && target.status === 'active' && target.role !== 'super_admin')
  if (eligible.length === 0) return fail('Aucun des utilisateurs sélectionnés ne peut être ajouté à ce groupe.')

  const added = await db.transaction(async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(permissionGroupMembers).where(eq(permissionGroupMembers.groupId, group.id))
    if (total + eligible.length > MAX_MEMBERS_PER_GROUP) return null
    const inserted = await tx
      .insert(permissionGroupMembers)
      .values(eligible.map((target) => ({ groupId: group.id, userId: target.id, addedByUserId: actor.id })))
      .onConflictDoNothing()
      .returning({ userId: permissionGroupMembers.userId })
    const names = new Map(eligible.map((target) => [target.id, target.name]))
    for (const row of inserted) await tx.insert(auditEvents).values(audit(actor.id, 'group.member_added', group.id, { userId: row.userId, userName: names.get(row.userId) ?? null }))
    return inserted.length
  })

  if (added === null) return fail(`Un groupe ne peut pas dépasser ${MAX_MEMBERS_PER_GROUP} membres.`)
  if (added === 0) return fail('Ces utilisateurs font déjà partie du groupe.')
  revalidateGroups()
  const skipped = userIds.length - added
  const base = added === 1 ? '1 membre ajouté.' : `${added} membres ajoutés.`
  return { ok: true, message: skipped > 0 ? `${base} ${skipped} utilisateur(s) ignoré(s).` : base }
}

export async function removeGroupMember(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('groups.manage')
  const parsed = memberSchema.safeParse(input)
  if (!parsed.success) return fail('Membre invalide.')

  const group = await loadGroup(parsed.data.groupId)
  if (!group) return fail('Groupe introuvable.')
  const reason = lockReason(actor, group.permissions)
  if (reason) return fail(reason)
  if (!isSuperAdmin(actor) && group.permissions.some(isSensitivePermission)) return fail('Seul un super administrateur peut retirer des membres d’un groupe qui accorde une permission sensible.')

  const [target] = await db.select({ name: users.name }).from(users).where(eq(users.id, parsed.data.userId)).limit(1)
  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(permissionGroupMembers)
      .where(and(eq(permissionGroupMembers.groupId, group.id), eq(permissionGroupMembers.userId, parsed.data.userId)))
      .returning({ userId: permissionGroupMembers.userId })
    if (rows.length > 0) await tx.insert(auditEvents).values(audit(actor.id, 'group.member_removed', group.id, { userId: parsed.data.userId, userName: target?.name ?? null }))
    return rows.length
  })

  if (removed === 0) return fail('Ce membre ne fait plus partie du groupe.')
  revalidateGroups()
  return { ok: true, message: 'Membre retiré du groupe.' }
}
