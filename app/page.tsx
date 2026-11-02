import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { VeillioDashboard } from '@/components/veillio-dashboard'
import { auth } from '@/lib/auth'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  return <VeillioDashboard />
}
