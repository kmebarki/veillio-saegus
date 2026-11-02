import type { Metadata } from 'next'

import { getOrganizationsOverview } from '@/app/actions/organizations'
import { OrganizationsModule } from '@/components/organizations/organizations-module'

export const metadata: Metadata = {
  title: 'Organisations · Veillio',
  description: 'Catalogue et administration des organisations de la plateforme Veillio.',
}

export default async function OrganizationsPage() {
  const overview = await getOrganizationsOverview()
  return <OrganizationsModule overview={overview} />
}
