import type { Metadata } from 'next'

import { getSourcesOverview } from '@/app/actions/sources'
import { SourcesModule } from '@/components/sources-module'

export const metadata: Metadata = {
  title: 'Sources · Veillio',
  description: 'Catalogue, diagnostics, historique et droits des origines d’information alimentant les Veilles.',
}

export default async function SourcesPage() {
  const overview = await getSourcesOverview()
  return <SourcesModule overview={overview} />
}
