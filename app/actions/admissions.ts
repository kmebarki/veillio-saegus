'use server'

import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { getCurrentIdentity, getDefaultOrganization } from '@/lib/authorization'
import { db } from '@/lib/db'
import { admissionRequests, auditEvents, teams, users } from '@/lib/db/schema'
import { sendAdmissionRequestNotification } from '@/lib/email'
import { isRateLimited, isUniqueViolation } from '@/lib/rate-limit'

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

  const [team] = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.id, parsed.data.teamId)).limit(1)
  if (!team) return { ok: false as const, message: 'Équipe introuvable.' }

  const existing = await db
    .select({ id: admissionRequests.id })
    .from(admissionRequests)
    .where(and(eq(admissionRequests.email, identity.email), eq(admissionRequests.status, 'Pending')))
    .limit(1)
  if (existing.length > 0) return { ok: false as const, message: 'Votre demande est déjà en cours de traitement.' }

  if (await isRateLimited({ actorUserId: identity.id, actions: ['admission.requested'], windowMs: 24 * 60 * 60 * 1000, max: 5 })) {
    return { ok: false as const, message: 'Trop de demandes envoyées aujourd’hui. Réessayez demain.' }
  }

  const organization = await getDefaultOrganization()
  let request: { id: string }
  try {
    ;[request] = await db.insert(admissionRequests).values({
      email: identity.email,
      name: identity.name,
      organization: organization?.name ?? null,
      declaredTeamId: parsed.data.teamId,
      requestedRole: parsed.data.requestedRole,
      message: parsed.data.message,
    }).returning({ id: admissionRequests.id })
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false as const, message: 'Votre demande est déjà en cours de traitement.' }
    throw error
  }

  await db.insert(auditEvents).values({ actorUserId: identity.id, action: 'admission.requested', targetType: 'admission_request', targetId: request.id, metadata: { teamId: parsed.data.teamId } })

  try {
    const recipients = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.status, 'active'), or(inArray(users.role, ['super_admin', 'admin']), and(eq(users.role, 'pilot'), eq(users.teamId, parsed.data.teamId)))))
    if (recipients.length > 0) {
      await sendAdmissionRequestNotification({
        recipients,
        applicantName: identity.name,
        applicantEmail: identity.email,
        teamName: team.name,
        message: parsed.data.message,
      })
    }
  } catch (error) {
    console.error('Admission notification failed', error)
  }

  return { ok: true as const, message: 'Votre demande a été transmise au responsable de l’équipe et aux administrateurs.' }
}
