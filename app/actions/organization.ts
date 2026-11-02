'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getDefaultOrganization, requireAdmin } from '@/lib/authorization'
import { db } from '@/lib/db'
import { auditEvents, authorizedDomains } from '@/lib/db/schema'
import { PUBLIC_EMAIL_DOMAINS } from '@/lib/domain-admission'

const domainPattern = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/

const idSchema = z.object({ id: z.string().uuid() })
const domainSchema = z.object({
  domain: z.string().trim().toLowerCase().transform((value) => value.replace(/^@/, '')).pipe(z.string().max(253).regex(domainPattern)),
  autoAdmit: z.boolean(),
})
const domainToggleSchema = z.object({ id: z.string().uuid(), autoAdmit: z.boolean() })

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
