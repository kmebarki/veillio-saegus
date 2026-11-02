import type { Metadata } from 'next'

import { getAdminAccessData } from '@/app/actions/admin-access'
import { UsersAdmissions } from '@/components/users-admissions'

export const metadata: Metadata = {
  title: 'Utilisateurs et admissions · Veillio',
  description: 'Gestion sécurisée des utilisateurs, rôles et demandes d’admission Veillio.',
}

export default async function UsersAdmissionsPage() {
  const data = await getAdminAccessData()
  return <UsersAdmissions initialUsers={data.users} initialAdmissions={data.admissions} initialInvitations={data.invitations} />
}
