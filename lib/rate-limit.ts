import 'server-only'

import { and, count, gt, inArray, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { auditEvents } from '@/lib/db/schema'

export async function isRateLimited({ actorUserId, actions, windowMs, max }: { actorUserId: string; actions: string[]; windowMs: number; max: number }) {
  const [row] = await db
    .select({ total: count() })
    .from(auditEvents)
    .where(and(eq(auditEvents.actorUserId, actorUserId), inArray(auditEvents.action, actions), gt(auditEvents.createdAt, new Date(Date.now() - windowMs))))
  return (row?.total ?? 0) >= max
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { code?: unknown; cause?: unknown }
  return candidate.code === '23505' || isUniqueViolation(candidate.cause)
}
