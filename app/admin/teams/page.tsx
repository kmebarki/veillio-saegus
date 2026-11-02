import type { Metadata } from 'next'

import { getTeamsOverview } from '@/app/actions/teams'
import { TeamsModule } from '@/components/teams-module'

export const metadata: Metadata = {
  title: 'Équipes · Veillio',
  description: 'Gestion des équipes Veillio : membres, responsables, demandes d’admission, invitations et historique.',
}

export default async function TeamsPage() {
  const overview = await getTeamsOverview()
  return <TeamsModule overview={overview} />
}
