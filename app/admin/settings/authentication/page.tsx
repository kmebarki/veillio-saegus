import type { Metadata } from 'next'

import { getAuthenticationOverview } from '@/app/actions/authentication-methods'
import { AuthenticationModule } from '@/components/authentication/authentication-module'

export const metadata: Metadata = {
  title: 'Authentification · Paramètres · Veillio',
  description: 'Référentiel versionné des méthodes d’authentification, gouvernance et preuves runtime.',
}

export default async function AuthenticationSettingsPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const [overview, params] = await Promise.all([getAuthenticationOverview(), searchParams])
  return <AuthenticationModule overview={overview} openProposal={params.intent === 'proposal'} />
}
