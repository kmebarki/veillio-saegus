'use client'

import { ArrowRight, Globe, Plus, Trash2, Users } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { renameOrganization } from '@/app/actions/admin-access'
import { addAuthorizedDomain, removeAuthorizedDomain, setDomainAutoAdmit } from '@/app/actions/organization'
import { Button, buttonVariants } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/modal'
import type { ActionResult, AdminOrganization } from '@/lib/admin-types'
import { cn } from '@/lib/utils'

export function OrganizationPanel({ organization, busy, run }: { organization: AdminOrganization; busy: boolean; run: (action: () => Promise<ActionResult>) => void }) {
  const [orgName, setOrgName] = useState(organization.name)
  const [domain, setDomain] = useState('')
  const [autoAdmit, setAutoAdmit] = useState(true)

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4 lg:col-span-2">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); run(() => renameOrganization({ name: orgName })) }}>
          <label className="flex flex-1 flex-col gap-2 text-sm font-medium">Nom de l’organisation<input required minLength={2} maxLength={160} value={orgName} onChange={(event) => setOrgName(event.target.value)} className={fieldClass} /></label>
          <Button type="submit" variant="outline" disabled={busy || orgName.trim() === organization.name}>Renommer</Button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <div><h2 className="flex items-center gap-2 text-base font-semibold"><Users className="size-4 text-primary" />Équipes</h2><p className="mt-1 text-sm text-muted-foreground">Les utilisateurs choisissent leur équipe lors d’une demande d’admission. La gestion complète des équipes (membres, responsables, archivage) se fait dans le module dédié.</p></div>
        <div className="rounded-xl border p-4">
          <p className="text-sm"><strong className="text-2xl font-semibold tracking-[-0.03em]">{organization.teams.length}</strong> <span className="text-muted-foreground">équipe{organization.teams.length > 1 ? 's' : ''} active{organization.teams.length > 1 ? 's' : ''}</span></p>
          <Link href="/admin/teams" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>Gérer les équipes<ArrowRight data-icon="inline-end" /></Link>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div><h2 className="flex items-center gap-2 text-base font-semibold"><Globe className="size-4 text-primary" />Domaines autorisés</h2><p className="mt-1 text-sm text-muted-foreground">Un utilisateur dont l’e-mail est vérifié et appartient à un domaine avec admission automatique rejoint l’organisation sans validation manuelle, avec le rôle Lecteur.</p></div>
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); run(() => addAuthorizedDomain({ domain, autoAdmit })); setDomain('') }}>
          <div className="flex gap-2">
            <label className="flex-1"><span className="sr-only">Nom de domaine</span><input required value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="exemple.com" className={fieldClass} /></label>
            <Button type="submit" disabled={busy}><Plus data-icon="inline-start" />Ajouter</Button>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoAdmit} onChange={(event) => setAutoAdmit(event.target.checked)} className="size-4 accent-primary" />Admission automatique pour ce domaine</label>
        </form>
        <ul className="divide-y rounded-xl border">
          {organization.domains.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun domaine configuré. Toutes les demandes passent par une validation manuelle.</li>}
          {organization.domains.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">@{item.domain}</p><p className="text-xs text-muted-foreground">{item.autoAdmit ? 'Admission automatique' : 'Validation manuelle'}</p></div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={item.autoAdmit} disabled={busy} onChange={(event) => run(() => setDomainAutoAdmit({ id: item.id, autoAdmit: event.target.checked }))} className="size-4 accent-primary" />Auto</label>
              <Button variant="ghost" size="icon" aria-label={`Supprimer ${item.domain}`} disabled={busy} onClick={() => run(() => removeAuthorizedDomain({ id: item.id }))}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
