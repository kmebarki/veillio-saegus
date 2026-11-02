'use client'

import { Check, Globe, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { useState } from 'react'

import { renameOrganization } from '@/app/actions/admin-access'
import { addAuthorizedDomain, createTeam, deleteTeam, removeAuthorizedDomain, renameTeam, setDomainAutoAdmit } from '@/app/actions/organization'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/modal'
import type { ActionResult, AdminOrganization } from '@/lib/admin-types'

export function OrganizationPanel({ organization, busy, run }: { organization: AdminOrganization; busy: boolean; run: (action: () => Promise<ActionResult>) => void }) {
  const [orgName, setOrgName] = useState(organization.name)
  const [teamName, setTeamName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
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
        <div><h2 className="flex items-center gap-2 text-base font-semibold"><Users className="size-4 text-primary" />Équipes</h2><p className="mt-1 text-sm text-muted-foreground">Les utilisateurs choisissent leur équipe lors d’une demande d’admission.</p></div>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); run(() => createTeam({ name: teamName })); setTeamName('') }}>
          <label className="flex-1"><span className="sr-only">Nom de la nouvelle équipe</span><input required minLength={2} maxLength={80} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Nouvelle équipe" className={fieldClass} /></label>
          <Button type="submit" disabled={busy}><Plus data-icon="inline-start" />Ajouter</Button>
        </form>
        <ul className="divide-y rounded-xl border">
          {organization.teams.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune équipe. Créez-en une pour accepter des demandes d’admission.</li>}
          {organization.teams.map((team) => (
            <li key={team.id} className="flex items-center gap-3 px-4 py-3">
              {editingId === team.id ? (
                <form className="flex flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); run(() => renameTeam({ id: team.id, name: editingName })); setEditingId(null) }}>
                  <input required minLength={2} maxLength={80} autoFocus aria-label="Nom de l’équipe" value={editingName} onChange={(event) => setEditingName(event.target.value)} className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring" />
                  <Button type="submit" size="icon" aria-label="Valider"><Check /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Annuler" onClick={() => setEditingId(null)}><X /></Button>
                </form>
              ) : <>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{team.name}</p><p className="text-xs text-muted-foreground">{team.memberCount} membre{team.memberCount > 1 ? 's' : ''}</p></div>
                <Button variant="ghost" size="icon" aria-label={`Renommer ${team.name}`} onClick={() => { setEditingId(team.id); setEditingName(team.name) }}><Pencil /></Button>
                <Button variant="ghost" size="icon" aria-label={`Supprimer ${team.name}`} disabled={busy} onClick={() => run(() => deleteTeam({ id: team.id }))}><Trash2 /></Button>
              </>}
            </li>
          ))}
        </ul>
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
