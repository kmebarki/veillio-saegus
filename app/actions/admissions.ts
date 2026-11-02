'use server'

import { and, desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { getCurrentIdentity, getDefaultOrganization } from '@/lib/authorization'
import { db } from '@/lib/db'
import { admissionRequests, auditEvents, teams } from '@/lib/db/schema'

const admissionSchema = z.object({
  teamId: z.string().uuid(),
  requestedRole: z.enum(['Watcher', 'Reader']),
  message: z.string().trim().max(1000),
})

export async function getAdmissionContext(email: string) {
  const [organization, teamRows, [latest]] = await Promise.all([
    getDefaultOrganization(),
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(teams.name),
    db
      .select({ status: admissionRequests.status, decisionComment: admissionRequests.decisionComment })
      .from(admissionRequests)
      .where(eq(admissionRequests.email, email))
      .orderBy(desc(admissionRequests.createdAt))
      .limit(1),
  ])

  return {
    organizationName: organization?.name ?? 'Votre organisation',
    teams: teamRows,
    pending: latest?.status === 'Pending',
    rejection: latest?.status === 'Rejected' ? latest.decisionComment ?? 'Votre précédente demande n’a pas été retenue.' : null,
  }
}

export async function createAdmissionRequest(input: unknown) {
  const identity = await getCurrentIdentity()
  if (!identity) redirect('/sign-in')
  if (!identity.emailVerified) return { ok: false as const, message: 'Confirmez d’abord votre adresse e-mail.' }
  if (identity.organizationId) return { ok: false as const, message: 'Votre compte est déjà rattaché à une organisation.' }

  const parsed = admissionSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: 'Choisissez une équipe et vérifiez les informations saisies.' }

  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, parsed.data.teamId)).limit(1)
  if (!team) return { ok: false as const, message: 'Équipe introuvable.' }

  const existing = await db
    .select({ id: admissionRequests.id })
    .from(admissionRequests)
    .where(and(eq(admissionRequests.email, identity.email), eq(admissionRequests.status, 'Pending')))
    .limit(1)
  if (existing.length > 0) return { ok: false as const, message: 'Votre demande est déjà en cours de traitement.' }

  const organization = await getDefaultOrganization()
  const [request] = await db.insert(admissionRequests).values({
    email: identity.email,
    name: identity.name,
    organization: organization?.name ?? null,
    declaredTeamId: parsed.data.teamId,
    requestedRole: parsed.data.requestedRole,
    message: parsed.data.message,
  }).returning({ id: admissionRequests.id })

  await db.insert(auditEvents).values({ actorUserId: identity.id, action: 'admission.requested', targetType: 'admission_request', targetId: request.id, metadata: { teamId: parsed.data.teamId } })
  return { ok: true as const, message: 'Votre demande a été transmise au responsable de l’équipe et aux administrateurs.' }
}
