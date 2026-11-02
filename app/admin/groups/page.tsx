import type { Metadata } from 'next'

import { getGroupsOverview } from '@/app/actions/groups'
import { GroupsModule } from '@/components/groups-module'

export const metadata: Metadata = {
  title: 'Groupes et permissions · Veillio',
  description: 'Gestion des groupes Veillio : permissions, membres, matrice des rôles et historique.',
}

export default async function GroupsPage() {
  const overview = await getGroupsOverview()
  return <GroupsModule overview={overview} />
}
