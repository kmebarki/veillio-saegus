import { redirect } from 'next/navigation'

import { AuthForm } from '@/components/auth-form'
import { getCurrentIdentity } from '@/lib/authorization'

export default async function SignUpPage() {
  const identity = await getCurrentIdentity()
  if (identity) redirect(identity.role === 'super_admin' || identity.role === 'admin' ? '/admin/users' : '/admission')
  return <AuthForm mode="sign-up" />
}
