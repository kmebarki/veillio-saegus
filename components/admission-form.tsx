'use client'

import { Check, Send, ShieldCheck } from 'lucide-react'
import { useState, useTransition } from 'react'

import { createAdmissionRequest } from '@/app/actions/admissions'
import { Button } from '@/components/ui/button'

export function AdmissionForm({ name, email }: { name: string; email: string }) {
  const [organization, setOrganization] = useState('')
  const [requestedRole, setRequestedRole] = useState<'Watcher' | 'Reader'>('Reader')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => setResult(await createAdmissionRequest({ organization, requestedRole, message })))
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary font-mono text-sm font-bold text-primary-foreground">V</div><div><p className="font-semibold">Veillio</p><p className="text-xs text-muted-foreground">Demande d’admission</p></div></div>
        <section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {result?.ok ? <div className="flex flex-col items-center gap-4 py-10 text-center"><div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary"><Check /></div><div><h1 className="text-2xl font-semibold tracking-tight">Demande transmise</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{result.message}</p></div></div> : <>
            <div className="flex items-start gap-3"><ShieldCheck className="mt-1 size-6 shrink-0 text-primary" /><div><h1 className="text-2xl font-semibold tracking-tight">Rejoindre votre organisation</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Complétez votre demande. Un administrateur vérifiera votre périmètre avant d’activer vos droits.</p></div></div>
            <div className="mt-6 rounded-xl bg-muted/60 p-4 text-sm"><p className="font-medium">{name}</p><p className="mt-1 text-muted-foreground">{email}</p></div>
            <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
              <label className="flex flex-col gap-2 text-sm font-medium">Organisation<input required minLength={2} maxLength={160} value={organization} onChange={(event) => setOrganization(event.target.value)} className="h-11 rounded-xl border bg-background px-3 font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" /></label>
              <label className="flex flex-col gap-2 text-sm font-medium">Accès demandé<select value={requestedRole} onChange={(event) => setRequestedRole(event.target.value as 'Watcher' | 'Reader')} className="h-11 rounded-xl border bg-background px-3 font-normal outline-none focus:border-ring"><option value="Reader">Lecteur</option><option value="Watcher">Contributeur</option></select></label>
              <label className="flex flex-col gap-2 text-sm font-medium">Contexte de la demande<textarea maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-28 resize-y rounded-xl border bg-background p-3 font-normal leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="Expliquez brièvement votre besoin…" /></label>
              {result && !result.ok && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{result.message}</p>}
              <Button type="submit" size="lg" disabled={pending}>{pending ? 'Envoi…' : 'Envoyer la demande'}<Send data-icon="inline-end" /></Button>
            </form>
          </>}
        </section>
      </div>
    </main>
  )
}
