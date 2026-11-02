import { PasswordResetForm } from '@/components/password-reset-form'

export const metadata = { title: 'Nouveau mot de passe · Veillio' }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams
  return <PasswordResetForm mode={{ type: 'reset', token: error ? null : token ?? null }} />
}
