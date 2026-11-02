'use client'

import { ArrowLeft, ArrowRight, CircleCheck, LockKeyhole, Mail } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

const fieldClass = 'h-12 w-full rounded-xl border bg-card pl-11 pr-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20'

type Mode = { type: 'request' } | { type: 'reset'; token: string | null }

export function PasswordResetForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)
  const isRequest = mode.type === 'request'
  const invalidLink = mode.type === 'reset' && !mode.token

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (mode.type === 'request') {
      setPending(true)
      const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: '/reset-password' })
      setPending(false)
      if (result.error?.status === 429) {
        setError('Trop de demandes. Patientez avant de réessayer.')
        return
      }
      setDone(true)
      return
    }

    if (!mode.token) return
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setPending(true)
    const result = await authClient.resetPassword({ newPassword: password, token: mode.token })
    setPending(false)
    if (result.error) {
      setError(result.error.status === 429 ? 'Trop de tentatives. Patientez avant de réessayer.' : 'Ce lien est invalide ou expiré. Demandez-en un nouveau.')
      return
    }
    setDone(true)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-lg font-semibold text-primary">Veillio</p>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">{isRequest ? 'Mot de passe oublié' : 'Nouveau mot de passe'}</h1>

        {done ? (
          <div className="mt-6 flex flex-col gap-6">
            <div className="flex items-start gap-3 rounded-xl bg-primary/10 px-4 py-3 text-sm leading-6 text-foreground" role="status">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>{isRequest ? 'Si un compte existe pour cette adresse, un e-mail contenant un lien valable 1 heure vient d’être envoyé.' : 'Votre mot de passe a été modifié. Vous pouvez vous connecter.'}</p>
            </div>
            <Link href="/sign-in" className={buttonVariants({ size: 'lg' })}>Retour à la connexion<ArrowRight data-icon="inline-end" /></Link>
          </div>
        ) : invalidLink ? (
          <div className="mt-6 flex flex-col gap-6">
            <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">Ce lien est invalide ou expiré.</p>
            <Link href="/forgot-password" className={buttonVariants({ size: 'lg' })}>Demander un nouveau lien</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
            <p className="text-sm leading-6 text-muted-foreground">{isRequest ? 'Saisissez votre adresse e-mail : nous vous enverrons un lien pour choisir un nouveau mot de passe.' : 'Choisissez un nouveau mot de passe. Vos autres sessions seront déconnectées.'}</p>
            {isRequest ? (
              <label className="flex flex-col gap-2 text-sm font-medium">Adresse e-mail<div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} autoComplete="email" /></div></label>
            ) : (
              <>
                <label className="flex flex-col gap-2 text-sm font-medium">Nouveau mot de passe<div className="relative"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required minLength={12} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={fieldClass} autoComplete="new-password" /></div><span className="text-xs font-normal text-muted-foreground">12 caractères minimum.</span></label>
                <label className="flex flex-col gap-2 text-sm font-medium">Confirmer le mot de passe<div className="relative"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required minLength={12} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={fieldClass} autoComplete="new-password" /></div></label>
              </>
            )}
            {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={pending}>{pending ? 'Envoi…' : isRequest ? 'Envoyer le lien' : 'Enregistrer le mot de passe'}<ArrowRight data-icon="inline-end" /></Button>
            <Link href="/sign-in" className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Retour à la connexion</Link>
          </form>
        )}
      </div>
    </main>
  )
}
