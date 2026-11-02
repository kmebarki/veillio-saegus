'use server'

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { getCurrentIdentity } from '@/lib/authorization'
import { db } from '@/lib/db'
import { admissionRequests } from '@/lib/db/schema'

const admissionSchema = z.object({
  organization: z.string().trim().min(2).max(160),
  requestedRole: z.enum(['Watcher', 'Reader']),
  message: z.string().trim().max(1000),
})

export async function createAdmissionRequest(input: unknown) {
  const identity = await getCurrentIdentity()
  if (!identity) redirect('/sign-in')
  const parsed = admissionSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Les informations saisies sont invalides.' }

  const existing = await db.select({ id: admissionRequests.id }).from(admissionRequests).where(and(eq(admissionRequests.email, identity.email), eq(admissionRequests.status, 'Pending'))).limit(1)
  if (existing.length > 0) return { ok: false as const, message: 'Votre demande est déjà en cours de traitement.' }

  await db.insert(admissionRequests).values({
    email: identity.email,
    name: identity.name,
    organization: parsed.data.organization,
    requestedRole: parsed.data.requestedRole,
    message: parsed.data.message,
  })
  return { ok: true as const, message: 'Votre demande a été transmise aux administrateurs.' }
}
