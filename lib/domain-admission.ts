import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db'
import { auditEvents, authorizedDomains, users } from '@/lib/db/schema'

export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com', 'live.fr', 'msn.com',
  'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.fr', 'aol.com',
  'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'neuf.fr',
])

export function getEmailDomain(email: string) {
  return email.split('@').pop()?.trim().toLowerCase() ?? ''
}

export async function applyDomainAdmission(identity: { id: string; email: string; emailVerified: boolean; organizationId: string | null }) {
  if (identity.organizationId) return true
  if (!identity.emailVerified) return false

  const domain = getEmailDomain(identity.email)
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return false

  const [rule] = await db
    .select({ organizationId: authorizedDomains.organizationId })
    .from(authorizedDomains)
    .where(and(eq(authorizedDomains.domain, domain), eq(authorizedDomains.autoAdmit, true)))
    .limit(1)
  if (!rule) return false

  const [updated] = await db
    .update(users)
    .set({ organizationId: rule.organizationId, role: 'reader', status: 'active', updatedAt: new Date() })
    .where(and(eq(users.id, identity.id), isNull(users.organizationId)))
    .returning({ id: users.id })

  if (updated) {
    await db.insert(auditEvents).values({
      actorUserId: identity.id,
      action: 'admission.auto_approved',
      targetType: 'user',
      targetId: identity.id,
      metadata: { domain },
    })
  }
  return true
}
