import { and, eq, isNull, or } from 'drizzle-orm'

import { decryptSecret, encryptSecret } from '@/lib/connectors/crypto'
import { db } from '@/lib/db'
import { secretVaultEntries } from '@/lib/db/schema'

export type SecretContext = {
  organizationId: string
  connectionId?: string | null
  fieldCode?: string | null
  purpose: 'create' | 'test' | 'execute' | 'rotate' | 'connector-test' | 'webhook-verify'
}

type PutSecretInput = SecretContext & {
  ownerUserId?: string | null
  plaintext: string
  hint?: string | null
  operationId?: string | null
  state?: 'prepared' | 'active'
}

export async function putSecret(input: PutSecretInput) {
  const state = input.state ?? 'active'
  const [created] = await db
    .insert(secretVaultEntries)
    .values({
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId ?? null,
      connectionId: input.connectionId ?? null,
      fieldCode: input.fieldCode ?? null,
      operationId: input.operationId ?? null,
      state: 'prepared',
      ciphertext: 'pending',
      hint: input.hint ?? null,
      encryptionContext: 'pending',
      activatedAt: null,
    })
    .returning({ id: secretVaultEntries.id })

  await db
    .update(secretVaultEntries)
    .set({ ciphertext: encryptSecret(input.plaintext, created.id), encryptionContext: created.id, state, activatedAt: state === 'active' ? new Date() : null })
    .where(eq(secretVaultEntries.id, created.id))
  return created.id
}

export async function readSecret(secretRef: string | null, context: SecretContext) {
  if (!secretRef) return null
  const connectionPredicate = context.connectionId
    ? or(eq(secretVaultEntries.connectionId, context.connectionId), isNull(secretVaultEntries.connectionId))
    : isNull(secretVaultEntries.connectionId)
  const [entry] = await db
    .select({ ciphertext: secretVaultEntries.ciphertext, encryptionContext: secretVaultEntries.encryptionContext, state: secretVaultEntries.state })
    .from(secretVaultEntries)
    .where(and(eq(secretVaultEntries.id, secretRef), eq(secretVaultEntries.organizationId, context.organizationId), eq(secretVaultEntries.state, 'active'), connectionPredicate))
    .limit(1)

  if (!entry || entry.state === 'revoked') return null
  return decryptSecret(entry.ciphertext, entry.encryptionContext)
}

export function readLegacySecret(ciphertext: string | null, connectionId: string) {
  return ciphertext ? decryptSecret(ciphertext, connectionId) : null
}

export async function activatePreparedSecret(secretRef: string, context: SecretContext) {
  const [updated] = await db
    .update(secretVaultEntries)
    .set({ state: 'active', activatedAt: new Date(), rotatedAt: new Date() })
    .where(and(eq(secretVaultEntries.id, secretRef), eq(secretVaultEntries.organizationId, context.organizationId), eq(secretVaultEntries.state, 'prepared')))
    .returning({ id: secretVaultEntries.id })
  return Boolean(updated)
}

export async function revokeSecret(secretRef: string | null, context: SecretContext) {
  if (!secretRef) return
  await db
    .update(secretVaultEntries)
    .set({ state: 'revoked', revokedAt: new Date() })
    .where(and(eq(secretVaultEntries.id, secretRef), eq(secretVaultEntries.organizationId, context.organizationId)))
}
