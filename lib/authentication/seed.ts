import referentialJson from '@/lib/authentication/contracts/referential-v1.3.0.json'
import type { AuthReferentialV13 } from '@/lib/authentication/types'
import { validateAuthMethodDefinition } from '@/lib/authentication/validation'
import { db } from '@/lib/db'
import { authFamilies, authMethods, authMethodVersions, authRuntimeEvidence, authVariants } from '@/lib/db/schema'

const referential = referentialJson as AuthReferentialV13
let seeded = false

export function getBundledAuthReferential() {
  return referential
}

export async function ensureAuthenticationSeed() {
  if (seeded) return
  const invalid = referential.methods.flatMap((method) => {
    const result = validateAuthMethodDefinition(method)
    return result.ok ? [] : result.errors.map((error) => `${method.methodId}: ${error}`)
  })
  if (invalid.length) throw new Error(`Contrat Authentification V1.3.0 invalide : ${invalid.join(' · ')}`)

  await db.transaction(async (tx) => {
    for (const [familyIndex, family] of referential.families.entries()) {
      await tx.insert(authFamilies).values({ id: family.id, label: family.label, description: family.description, sortOrder: familyIndex }).onConflictDoUpdate({ target: authFamilies.id, set: { label: family.label, description: family.description, sortOrder: familyIndex, updatedAt: new Date() } })
      for (const [variantIndex, variant] of family.variants.entries()) {
        await tx.insert(authVariants).values({ id: variant.id, familyId: family.id, label: variant.label, sortOrder: variantIndex }).onConflictDoUpdate({ target: authVariants.id, set: { familyId: family.id, label: variant.label, sortOrder: variantIndex, updatedAt: new Date() } })
      }
    }

    for (const method of referential.methods) {
      await tx.insert(authMethods).values({ methodId: method.methodId }).onConflictDoNothing({ target: authMethods.methodId })
      await tx.insert(authMethodVersions).values({ methodId: method.methodId, version: method.version, definition: method, status: method.lifecycle.status, isImmutable: method.lifecycle.status === 'disponible' }).onConflictDoNothing()
      await tx.insert(authRuntimeEvidence).values({ methodId: method.methodId, methodVersion: method.version, handlerKey: method.runtime.handlerKey, handlerVersion: method.runtime.handlerVersion, deployed: false, securityReviewed: false, contractTestsPassed: false, enabled: false, evidenceRefs: [] }).onConflictDoNothing()
    }
  })

  seeded = true
}
