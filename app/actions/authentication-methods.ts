'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { AuthMethodDefinitionV13 } from '@/lib/authentication/types'
import { validateAuthMethodDefinition } from '@/lib/authentication/validation'
import { ensureAuthenticationSeed } from '@/lib/authentication/seed'
import type { AuthenticationOverview } from '@/lib/authentication/view-model'
import { getEffectivePermissions, requirePermission } from '@/lib/authorization'
import { db } from '@/lib/db'
import { auditEvents, authFamilies, authMethods, authMethodVersions, authVariants } from '@/lib/db/schema'

const methodIdSchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'Utilisez des majuscules, chiffres et underscores.')

type Failure = { ok: false; message: string; fieldErrors?: Record<string, string> }
const fail = (message: string, fieldErrors?: Record<string, string>): Failure => ({ ok: false, message, fieldErrors })

export async function getAuthenticationOverview(): Promise<AuthenticationOverview> {
  const actor = await requirePermission('auth.method.view')
  await ensureAuthenticationSeed()
  const permissions = new Set(await getEffectivePermissions(actor.id, actor.role))
  const [familyRows, variantRows, versionRows] = await Promise.all([
    db.select().from(authFamilies).orderBy(authFamilies.sortOrder),
    db.select().from(authVariants).orderBy(authVariants.sortOrder),
    db.select().from(authMethodVersions).orderBy(authMethodVersions.methodId, authMethodVersions.version),
  ])
  const familyById = new Map(familyRows.map((row) => [row.id, row]))
  const variantById = new Map(variantRows.map((row) => [row.id, row]))

  return {
    families: familyRows.map((family) => ({
      ...family,
      variants: variantRows.filter((variant) => variant.familyId === family.id).map(({ id, label }) => ({ id, label })),
    })),
    methods: versionRows.map((row) => {
      const definition = row.definition as AuthMethodDefinitionV13
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
        fields: definition.fieldSchema.fields,
        transmission: {
          type: definition.transmission.type,
          protocol: definition.transmission.protocol,
          requiresTls: definition.transmission.requiresTls,
        },
        createdAt: row.createdAt.toISOString(),
      }
    }),
    viewer: { canCreate: permissions.has('auth.method.propose') },
  }
}

export async function createAuthenticationMethod(input: unknown): Promise<{ ok: true; message: string } | Failure> {
  const actor = await requirePermission('auth.method.propose')
  const definition = input as AuthMethodDefinitionV13
  const validation = validateAuthMethodDefinition(definition)
  if (!validation.ok) return fail('La méthode contient des erreurs.', { definition: validation.errors.join(' · ') })

  const methodId = methodIdSchema.safeParse(definition.methodId)
  if (!methodId.success) return fail('Identifiant de méthode invalide.', { methodId: methodId.error.issues[0]?.message ?? 'Identifiant invalide.' })

  const existing = await db.select({ id: authMethods.id }).from(authMethods).where(eq(authMethods.methodId, definition.methodId)).limit(1)
  if (existing.length) return fail('Cet identifiant existe déjà.', { methodId: 'Choisissez un identifiant unique.' })

  const now = new Date().toISOString()
  definition.lifecycle = { status: 'disponible', reason: 'Méthode enregistrée dans le référentiel', approvedBy: null, approvedAt: now }
  definition.runtime = { handlerKey: null, handlerVersion: null, deployed: false, securityReviewed: false, contractTestsPassed: false, enabled: false }

  await db.transaction(async (tx) => {
    await tx.insert(authMethods).values({ methodId: definition.methodId, createdByUserId: actor.id })
    await tx.insert(authMethodVersions).values({
      methodId: definition.methodId,
      version: definition.version,
      definition,
      status: 'disponible',
      authorUserId: actor.id,
      isImmutable: false,
    })
    await tx.insert(auditEvents).values({
      actorUserId: actor.id,
      action: 'auth.method.created',
      targetType: 'auth_method',
      targetId: definition.methodId,
      metadata: { version: definition.version },
    })
  })

  revalidatePath('/admin/settings/authentication')
  return { ok: true, message: 'Méthode ajoutée au référentiel.' }
}
