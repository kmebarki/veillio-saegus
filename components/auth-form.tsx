'use client'

import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { acceptInvitation } from '@/app/actions/admin-access'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode, invitationToken }: { mode: 'sign-in' | 'sign-up'; invitationToken?: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const isSignUp = mode === 'sign-up'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    const result = isSignUp
      ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: '/admission' })
      : await authClient.signIn.email({ email: email.trim(), password })

    setPending(false)
    if (result.error) {
      setError('Impossible de vous authentifier. Vérifiez vos informations et réessayez.')
      return
    }
    if (isSignUp && invitationToken) {
      const acceptance = await acceptInvitation({ token: invitationToken })
      if (!acceptance.ok) {
        setError(acceptance.message)
        return
      }
      window.location.replace(acceptance.destination)
      return
    }
    window.location.replace('/admission')
  }

  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.72fr)]">
      <section className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-primary-foreground/20 font-mono text-sm font-bold">V</span><span className="text-lg font-semibold tracking-tight">Veillio</span></div>
        <div className="max-w-xl"><p className="font-mono text-xs uppercase tracking-[0.18em] text-primary-foreground/70">Administration sécurisée</p><h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.05em]">L’accès à la veille commence par une identité vérifiée.</h1><p className="mt-5 max-w-lg text-base leading-7 text-primary-foreground/75">Authentification, admissions et habilitations sont contrôlées côté serveur et tracées dans PostgreSQL.</p></div>
        <p className="text-xs text-primary-foreground/60">Veillio · Saegus</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden"><p className="text-lg font-semibold text-primary">Veillio</p></div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{isSignUp ? 'Créer le compte initial' : 'Espace sécurisé'}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{isSignUp ? 'Créer votre compte' : 'Se connecter'}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{isSignUp ? 'Le premier compte créé devient super administrateur.' : 'Accédez à l’administration de votre organisation.'}</p>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
            {isSignUp && <label className="flex flex-col gap-2 text-sm font-medium">Nom complet<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="h-12 rounded-xl border bg-card px-4 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" autoComplete="name" /></label>}
            <label className="flex flex-col gap-2 text-sm font-medium">Adresse e-mail<div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-xl border bg-card pl-11 pr-4 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" autoComplete="email" /></div></label>
            <label className="flex flex-col gap-2 text-sm font-medium">Mot de passe<div className="relative"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required minLength={12} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border bg-card pl-11 pr-12 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" autoComplete={isSignUp ? 'new-password' : 'current-password'} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{isSignUp && <span className="text-xs font-normal text-muted-foreground">12 caractères minimum.</span>}</label>
            {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={pending}>{pending ? 'Vérification…' : isSignUp ? 'Créer le compte' : 'Se connecter'}<ArrowRight data-icon="inline-end" /></Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">{isSignUp ? 'Vous avez déjà un compte ?' : 'Premier accès ?'} <Link className="font-semibold text-primary hover:underline" href={isSignUp ? '/sign-in' : '/sign-up'}>{isSignUp ? 'Se connecter' : 'Créer le compte initial'}</Link></p>
        </div>
      </section>
    </main>
  )
}
