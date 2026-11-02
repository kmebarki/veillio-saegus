import { redirect } from 'next/navigation'

import { AdmissionForm } from '@/components/admission-form'
import { requireIdentity } from '@/lib/authorization'

export default async function AdmissionPage() {
  const identity = await requireIdentity()
  if (identity.role === 'super_admin' || identity.role === 'admin') redirect('/admin/users')
  return <AdmissionForm name={identity.name} email={identity.email} />
}
