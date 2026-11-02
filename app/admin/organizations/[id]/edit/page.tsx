import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getOrganizationForEdit } from '@/app/actions/organizations'
import { OrganizationWizard } from '@/components/organizations/organization-wizard'

export const metadata: Metadata = {
  title: 'Modifier une organisation · Veillio',
  description: 'Modification d’une organisation Veillio.',
}

export default async function EditOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const organization = await getOrganizationForEdit(id)
  if (!organization) notFound()
  return <OrganizationWizard organization={organization} />
}
