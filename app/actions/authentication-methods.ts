'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { AuthMethodDefinitionV13, AuthLifecycleStatus } from '@/lib/authentication/types'
import { canTransitionAuthMethod, validateAuthMethodDefinition } from '@/lib/authentication/validation'
import { evaluateAvailability } from '@/lib/authentication/runtime-registry'
import { ensureAuthenticationSeed } from '@/lib/authentication/seed'
import type { AuthenticationOverview } from '@/lib/authentication/view-model'
import { getEffectivePermissions, requirePermission } from '@/lib/authorization'
import { db } from '@/lib/db'
import { auditEvents, authCompatibilities, authFamilies, authMethods, authMethodVersions, authRuntimeEvidence, authVariants } from '@/lib/db/schema'

const methodIdSchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'Utilisez des majuscules, chiffres et underscores.')
const transitionSchema = z.object({ versionId: z.string().uuid(), target: z.enum(['brouillon', 'a_valider', 'disponible', 'desactivee', 'obsolete']), reason: z.string().trim().min(8).max(500) })

type Failure = { ok: false; message: string; fieldErrors?: Record<string, string> }
const fail = (message: string, fieldErrors?: Record<string, string>): Failure => ({ ok: false, message, fieldErrors })

async function getPermissions(actor: Awaited<ReturnType<typeof requirePermission>>) {
  return new Set(await getEffectivePermissions(actor.id, actor.role))
}

export async function getAuthenticationOverview(): Promise<AuthenticationOverview> {
  const actor = await requirePermission('auth.method.view')
  await ensureAuthenticationSeed()
  const permissions = await getPermissions(actor)
  const [familyRows, variantRows, versionRows, evidenceRows, compatibilityRows] = await Promise.all([
    db.select().from(authFamilies).orderBy(authFamilies.sortOrder),
    db.select().from(authVariants).orderBy(authVariants.sortOrder),
    db.select().from(authMethodVersions).orderBy(authMethodVersions.methodId, authMethodVersions.version),
    db.select().from(authRuntimeEvidence),
    db.select().from(authCompatibilities).where(eq(authCompatibilities.enabled, true)),
  ])
  const familyById = new Map(familyRows.map((row) => [row.id, row]))
  const variantById = new Map(variantRows.map((row) => [row.id, row]))
  const evidenceByVersion = new Map(evidenceRows.map((row) => [`${row.methodId}@${row.methodVersion}`, row]))
  const compatibilityCounts = new Map<string, number>()
  for (const row of compatibilityRows) compatibilityCounts.set(`${row.methodId}@${row.methodVersion}`, (compatibilityCounts.get(`${row.methodId}@${row.methodVersion}`) ?? 0) + 1)

  const methods = versionRows.map((row) => {
    const definition = row.definition as AuthMethodDefinitionV13
    const evidence = evidenceByVersion.get(`${row.methodId}@${row.version}`)
    const compatibilityCount = compatibilityCounts.get(`${row.methodId}@${row.version}`) ?? 0
    const runtime = evaluateAvailability({ handlerKey: evidence?.handlerKey ?? null, handlerVersion: evidence?.handlerVersion ?? null, deployed: evidence?.deployed ?? false, securityReviewed: evidence?.securityReviewed ?? false, contractTestsPassed: evidence?.contractTestsPassed ?? false, enabled: evidence?.enabled ?? false, compatibilityVerified: compatibilityCount > 0 }, row.status)
    return {
      id: row.id,
      methodId: row.methodId,
      displayName: definition.displayName,
      description: definition.description ?? '',
      familyId: definition.familyId,
      familyLabel: familyById.get(definition.familyId)?.label ?? definition.familyId,
      variantId: definition.variantId,
      variantLabel: definition.variantId ? (variantById.get(definition.variantId)?.label ?? definition.variantId) : null,
      version: row.version,
      status: row.status as AuthLifecycleStatus,
      statusReason: definition.lifecycle.reason,
      fields: definition.fieldSchema.fields,
      transmission: { type: definition.transmission.type, protocol: definition.transmission.protocol, requiresTls: definition.transmission.requiresTls, bindingsCount: definition.transmission.bindings.length },
      runtime: {
        ...runtime,
        handlerKey: evidence?.handlerKey ?? null,
        handlerVersion: evidence?.handlerVersion ?? null,
        handlerRegistered: !runtime.missing.includes('handler déployé et enregistré'),
        deployed: evidence?.deployed ?? false,
        contractTestsPassed: evidence?.contractTestsPassed ?? false,
        securityReviewed: evidence?.securityReviewed ?? false,
        enabled: evidence?.enabled ?? false,
        updatedAt: evidence?.updatedAt.toISOString() ?? null,
      },
      compatibilityCount,
      authorUserId: row.authorUserId,
      reviewerUserId: row.reviewerUserId,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      isImmutable: row.isImmutable,
      createdAt: row.createdAt.toISOString(),
    }
  })

  return {
    contractVersion: '1.3.0',
    families: familyRows.map((family) => ({ ...family, variants: variantRows.filter((variant) => variant.familyId === family.id).map(({ id, label }) => ({ id, label })) })),
    methods,
    stats: { methods: methods.length, families: familyRows.length, available: methods.filter((method) => method.runtime.available).length, awaitingReview: methods.filter((method) => method.status === 'a_valider').length, drafts: methods.filter((method) => method.status === 'brouillon').length },
    viewer: { canPropose: permissions.has('auth.method.propose'), canReview: permissions.has('auth.method.review'), canPublish: permissions.has('auth.method.publish'), canDeactivate: permissions.has('auth.method.deactivate') },
  }
}

export async function proposeAuthenticationMethod(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('auth.method.propose')
  const definition = input as AuthMethodDefinitionV13
  const validation = validateAuthMethodDefinition(definition)
  if (!validation.ok) return fail('Le contrat contient des erreurs.', { contract: validation.errors.join(' · ') })
  const methodId = methodIdSchema.safeParse(definition.methodId)
  if (!methodId.success) return fail('Identifiant de méthode invalide.', { methodId: methodId.error.issues[0]?.message ?? 'Identifiant invalide.' })
  if (definition.lifecycle.status !== 'brouillon') return fail('Une proposition doit être enregistrée en brouillon.')
  definition.runtime = { handlerKey: null, handlerVersion: null, deployed: false, securityReviewed: false, contractTestsPassed: false, enabled: false }
  definition.lifecycle = { status: 'brouillon', reason: 'Proposition en cours de rédaction', approvedBy: null, approvedAt: null }

  const existing = await db.select({ id: authMethods.id }).from(authMethods).where(eq(authMethods.methodId, definition.methodId)).limit(1)
  if (existing.length) return fail('Cet identifiant de méthode existe déjà.', { methodId: 'Choisissez un identifiant unique.' })

  await db.transaction(async (tx) => {
    await tx.insert(authMethods).values({ methodId: definition.methodId, createdByUserId: actor.id })
    await tx.insert(authMethodVersions).values({ methodId: definition.methodId, version: definition.version, definition, status: 'brouillon', authorUserId: actor.id })
    await tx.insert(authRuntimeEvidence).values({ methodId: definition.methodId, methodVersion: definition.version, evidenceRefs: [] })
    await tx.insert(auditEvents).values({ actorUserId: actor.id, action: 'auth.method.proposed', targetType: 'auth_method', targetId: definition.methodId, metadata: { version: definition.version, reason: definition.lifecycle.reason } })
  })
  revalidatePath('/admin/settings/authentication')
  return { ok: true, message: 'Méthode enregistrée en brouillon.' }
}

export async function transitionAuthenticationMethod(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const parsed = transitionSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Transition invalide.')
  const requiredPermission = parsed.data.target === 'a_valider' ? 'auth.method.propose' : parsed.data.target === 'disponible' || parsed.data.target === 'brouillon' ? 'auth.method.review' : 'auth.method.deactivate'
  const actor = await requirePermission(requiredPermission)
  const [row] = await db.select().from(authMethodVersions).where(eq(authMethodVersions.id, parsed.data.versionId)).limit(1)
  if (!row) return fail('Version introuvable.')
  const from = row.status as AuthLifecycleStatus
  if (!canTransitionAuthMethod(from, parsed.data.target)) return fail(`Transition ${from} → ${parsed.data.target} interdite.`)
  if ((parsed.data.target === 'disponible' || parsed.data.target === 'brouillon') && row.authorUserId === actor.id) return fail('L’auteur ne peut pas réviser sa propre proposition.')

  const definition = row.definition as AuthMethodDefinitionV13
  definition.lifecycle = { status: parsed.data.target, reason: parsed.data.reason, approvedBy: parsed.data.target === 'disponible' ? actor.id : null, approvedAt: parsed.data.target === 'disponible' ? new Date().toISOString() : null }
  await db.transaction(async (tx) => {
    await tx.update(authMethodVersions).set({ status: parsed.data.target, definition, reviewerUserId: parsed.data.target === 'a_valider' ? null : actor.id, reviewedAt: parsed.data.target === 'a_valider' ? null : new Date(), isImmutable: parsed.data.target === 'disponible' }).where(eq(authMethodVersions.id, row.id))
    await tx.insert(auditEvents).values({ actorUserId: actor.id, action: `auth.method.${parsed.data.target}`, targetType: 'auth_method', targetId: row.methodId, metadata: { version: row.version, reason: parsed.data.reason } })
  })
  revalidatePath('/admin/settings/authentication')
  const messages: Record<AuthLifecycleStatus, string> = {
    brouillon: 'Corrections demandées.',
    a_valider: 'Méthode soumise.',
    disponible: 'Contrat validé.',
    desactivee: 'Méthode désactivée.',
    obsolete: 'Méthode déclarée obsolète.',
  }
  return { ok: true, message: messages[parsed.data.target] }
}
