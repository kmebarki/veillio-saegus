import type { Metadata } from 'next'

import { getConnectionsOverview } from '@/app/actions/connections'
import { ConnectionsModule } from '@/components/connections-module'

export const metadata: Metadata = {
  title: 'Connexions · Veillio',
  description: 'Identifiants (clés API, jetons) donnant accès aux fournisseurs de données pour l’organisation ou un utilisateur.',
}

export default async function ConnectionsPage() {
  const overview = await getConnectionsOverview()
  return <ConnectionsModule overview={overview} />
}
