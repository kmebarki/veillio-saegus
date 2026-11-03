import { eq } from 'drizzle-orm'

import { decryptSecret, encryptSecret } from '@/lib/connectors/crypto'
import { db } from '@/lib/db'
import { secretVaultEntries } from '@/lib/db/schema'

export async function putSecret(input: { organizationId: string; ownerUserId?: string | null; plaintext: string; hint?: string | null; existingRef?: string | null }) {
  if (input.existingRef) {
    const [updated] = await db.update(secretVaultEntries).set({ ciphertext: encryptSecret(input.plaintext, input.existingRef), hint: input.hint ?? null, encryptionContext: input.existingRef, rotatedAt: new Date() }).where(eq(secretVaultEntries.id, input.existingRef)).returning({ id: secretVaultEntries.id })
    if (updated) return updated.id
  }

  const [created] = await db.insert(secretVaultEntries).values({ organizationId: input.organizationId, ownerUserId: input.ownerUserId ?? null, ciphertext: 'pending', hint: input.hint ?? null, encryptionContext: 'pending' }).returning({ id: secretVaultEntries.id })
  await db.update(secretVaultEntries).set({ ciphertext: encryptSecret(input.plaintext, created.id), encryptionContext: created.id }).where(eq(secretVaultEntries.id, created.id))
  return created.id
}

export async function readSecret(secretRef: string | null) {
  if (!secretRef) return null
  const [entry] = await db.select({ ciphertext: secretVaultEntries.ciphertext, encryptionContext: secretVaultEntries.encryptionContext }).from(secretVaultEntries).where(eq(secretVaultEntries.id, secretRef)).limit(1)
  return entry ? decryptSecret(entry.ciphertext, entry.encryptionContext) : null
}

export async function deleteSecret(secretRef: string | null) {
  if (!secretRef) return
  await db.delete(secretVaultEntries).where(eq(secretVaultEntries.id, secretRef))
}
