import type { Metadata } from 'next'

import { getAdminAccessData } from '@/app/actions/admin-access'
import { UsersAdmissions } from '@/components/users-admissions'

export const metadata: Metadata = {
  title: 'Utilisateurs et admissions · Veillio',
  description: 'Gestion sécurisée des utilisateurs, rôles, équipes et demandes d’admission Veillio.',
}

export default async function UsersAdmissionsPage() {
  const data = await getAdminAccessData()
  return <UsersAdmissions viewer={data.viewer} users={data.users} admissions={data.admissions} invitations={data.invitations} organization={data.organization} />
}
