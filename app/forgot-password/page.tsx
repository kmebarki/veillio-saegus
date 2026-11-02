import { PasswordResetForm } from '@/components/password-reset-form'

export const metadata = { title: 'Mot de passe oublié · Veillio' }

export default function ForgotPasswordPage() {
  return <PasswordResetForm mode={{ type: 'request' }} />
}
