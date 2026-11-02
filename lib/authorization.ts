import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

const ADMIN_ROLES = new Set(['super_admin', 'admin'])

export async function getCurrentIdentity() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const [identity] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (!identity || identity.status !== 'active') return null
  return identity
}

export async function requireIdentity() {
  const identity = await getCurrentIdentity()
  if (!identity) redirect('/sign-in')
  return identity
}

export async function requireAdmin() {
  const identity = await requireIdentity()
  if (!ADMIN_ROLES.has(identity.role)) redirect('/')
  return identity
}
