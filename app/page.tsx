import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { VeillioDashboardV2 } from '@/components/veillio-dashboard-v2'
import { auth } from '@/lib/auth'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  return <VeillioDashboardV2 />
}
