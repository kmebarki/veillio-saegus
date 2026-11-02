import type { Metadata } from 'next'

import { UsersAdmissions } from '@/components/users-admissions'

export const metadata: Metadata = {
  title: 'Utilisateurs et admissions · Veillio',
  description: 'Gestion des utilisateurs, rôles et demandes d’admission Veillio.',
}

export default function UsersAdmissionsPage() {
  return <UsersAdmissions />
}
