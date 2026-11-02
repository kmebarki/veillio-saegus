import { redirect } from 'next/navigation'

import { AuthForm } from '@/components/auth-form'
import { getCurrentIdentity } from '@/lib/authorization'

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const identity = await getCurrentIdentity()
  if (identity) redirect(identity.role === 'super_admin' || identity.role === 'admin' ? '/admin/users' : '/admission')
  const { invite } = await searchParams
  return <AuthForm mode="sign-up" invitationToken={invite} />
}
