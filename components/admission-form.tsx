'use client'

import { Check, Clock, LogOut, MailCheck, Send, ShieldCheck } from 'lucide-react'
import { useState, useTransition } from 'react'

import { createAdmissionRequest } from '@/app/actions/admissions'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/modal'
import { authClient } from '@/lib/auth-client'

type Props = {
  name: string
  email: string
  emailVerified: boolean
  organizationName: string
  teams: { id: string; name: string }[]
  pending: boolean
  rejection: string | null
}

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle: string }) {
  async function logout() {
    await authClient.signOut()
    window.location.replace('/sign-in')
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary font-mono text-sm font-bold text-primary-foreground">V</div>
          <div className="flex-1"><p className="font-semibold">Veillio</p><p className="text-xs text-muted-foreground">{subtitle}</p></div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut data-icon="inline-start" />Se déconnecter</Button>
        </div>
        <section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">{children}</section>
      </div>
    </main>
  )
}

function Notice({ icon: Icon, title, text, children }: { icon: typeof Check; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary"><Icon /></div>
      <div><h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground text-pretty">{text}</p></div>
      {children}
    </div>
  )
}

export function AdmissionForm({ name, email, emailVerified, organizationName, teams, pending, rejection }: Props) {
  const [teamId, setTeamId] = useState('')
  const [requestedRole, setRequestedRole] = useState<'Watcher' | 'Reader'>('Reader')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [mailSent, setMailSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => setResult(await createAdmissionRequest({ teamId, requestedRole, message })))
  }

  function resendVerification() {
    startTransition(async () => {
      await authClient.sendVerificationEmail({ email, callbackURL: '/admission' })
      setMailSent(true)
    })
  }

  if (!emailVerified) {
    return (
      <Shell subtitle="Vérification de l’adresse e-mail">
        <Notice icon={MailCheck} title="Confirmez votre adresse e-mail" text={`Un lien de confirmation a été envoyé à ${email}. Cliquez dessus, puis revenez sur cette page pour choisir votre équipe.`}>
          <Button variant="outline" disabled={isPending || mailSent} onClick={resendVerification}>{mailSent ? 'E-mail renvoyé' : 'Renvoyer le lien'}</Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>J’ai confirmé mon adresse</Button>
        </Notice>
      </Shell>
    )
  }

  if (pending || result?.ok) {
    return (
      <Shell subtitle="Demande d’admission">
        <Notice icon={result?.ok ? Check : Clock} title={result?.ok ? 'Demande transmise' : 'Demande en cours de traitement'} text={result?.ok ? result.message : 'Votre demande a été transmise au responsable de votre équipe et aux administrateurs. Vous recevrez un e-mail dès qu’une décision sera prise.'} />
      </Shell>
    )
  }

  return (
    <Shell subtitle="Demande d’admission">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 size-6 shrink-0 text-primary" />
        <div><h1 className="text-2xl font-semibold tracking-tight text-balance">Rejoindre {organizationName}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground text-pretty">Choisissez l’équipe que vous souhaitez rejoindre. Son responsable et les administrateurs vérifieront votre demande avant d’activer vos droits.</p></div>
      </div>
      <div className="mt-6 rounded-xl bg-muted/60 p-4 text-sm"><p className="font-medium">{name}</p><p className="mt-1 text-muted-foreground">{email}</p></div>
      {rejection && <p role="status" className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">Votre précédente demande n’a pas été retenue : {rejection}</p>}
      {teams.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed p-4 text-sm leading-6 text-muted-foreground">Aucune équipe n’est encore disponible. Demandez à un administrateur de créer les équipes de votre organisation.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm font-medium">Équipe à rejoindre
            <select required value={teamId} onChange={(event) => setTeamId(event.target.value)} className={fieldClass}>
              <option value="" disabled>Sélectionnez votre équipe</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">Accès demandé
            <select value={requestedRole} onChange={(event) => setRequestedRole(event.target.value as 'Watcher' | 'Reader')} className={fieldClass}><option value="Reader">Lecteur</option><option value="Watcher">Contributeur</option></select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">Contexte de la demande
            <textarea maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-28 resize-y rounded-xl border bg-background p-3 text-sm font-normal leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="Expliquez brièvement votre besoin…" />
          </label>
          {result && !result.ok && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{result.message}</p>}
          <Button type="submit" size="lg" disabled={isPending || !teamId}>{isPending ? 'Envoi…' : 'Envoyer la demande'}<Send data-icon="inline-end" /></Button>
        </form>
      )}
    </Shell>
  )
}
