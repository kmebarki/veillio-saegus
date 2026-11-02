import type { Metadata } from 'next'

import { getConnectorsOverview } from '@/app/actions/connectors'
import { ConnectorsModule } from '@/components/connectors-module'

export const metadata: Metadata = {
  title: 'Connecteurs · Veillio',
  description: 'Configuration technique, test et supervision des connecteurs de sources Veillio.',
}

export default async function ConnectorsPage() {
  const overview = await getConnectorsOverview()
  return <ConnectorsModule overview={overview} />
}
