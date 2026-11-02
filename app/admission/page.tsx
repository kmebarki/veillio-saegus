import { redirect } from 'next/navigation'

import { getAdmissionContext } from '@/app/actions/admissions'
import { AdmissionForm } from '@/components/admission-form'
import { requireIdentity } from '@/lib/authorization'
import { applyDomainAdmission } from '@/lib/domain-admission'
import { isAdminRole } from '@/lib/roles'

export default async function AdmissionPage() {
  const identity = await requireIdentity()
  if (isAdminRole(identity.role)) redirect('/admin/users')

  const admitted = await applyDomainAdmission(identity)
  if (admitted) redirect('/')

  const context = await getAdmissionContext(identity.email)
  return (
    <AdmissionForm
      name={identity.name}
      email={identity.email}
      emailVerified={identity.emailVerified}
      organizationName={context.organizationName}
      teams={context.teams}
      pending={context.pending}
      rejection={context.rejection}
    />
  )
}
