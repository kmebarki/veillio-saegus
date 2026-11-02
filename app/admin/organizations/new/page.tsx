import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getOrganizationsOverview } from '@/app/actions/organizations'
import { OrganizationWizard } from '@/components/organizations/organization-wizard'

export const metadata: Metadata = {
  title: 'Nouvelle organisation · Veillio',
  description: 'Assistant de création d’une organisation Veillio.',
}

export default async function NewOrganizationPage() {
  const overview = await getOrganizationsOverview()
  if (!overview.canManage) redirect('/admin/organizations')
  return <OrganizationWizard userOptions={overview.userOptions} />
}
