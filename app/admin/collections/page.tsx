import type { Metadata } from 'next'

import { getCollectionsOverview } from '@/app/actions/collections'
import { CollectionsModule } from '@/components/collections-module'

export const metadata: Metadata = {
  title: 'Collectes · Veillio',
  description: 'Supervision des occurrences de collecte, incidents, tentatives et politiques d’exécution.',
}

export default async function CollectionsPage() {
  const overview = await getCollectionsOverview()
  return <CollectionsModule initialOverview={overview} />
}
