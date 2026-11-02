'use client'

import { Archive, Bell, CircleHelp, Clock3, LogOut, Menu, Plus, Search, Settings, ShieldCheck, UserPlus, Users, Workflow } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { createTeam } from '@/app/actions/teams'
import { Button } from '@/components/ui/button'
import { Modal, fieldClass } from '@/components/ui/modal'
import { TeamDetailDialog } from '@/components/team-detail-dialog'
import { UserAvatar } from '@/components/user-avatar'
import { Sidebar } from '@/components/veillio-dashboard'
import { authClient } from '@/lib/auth-client'
import type { TeamSummary, TeamsOverview } from '@/lib/team-types'
import { cn } from '@/lib/utils'

type Filter = 'active' | 'archived' | 'all'
type Sort = 'name' | 'members' | 'recent'

const MAX_AVATARS = 4

function TeamCard({ team, onOpen }: { team: TeamSummary; onOpen: () => void }) {
  const hidden = Math.max(0, team.members.length - MAX_AVATARS)
  const pending = team.pendingAdmissions + team.pendingInvitations
  return (
    <article className={cn('group flex flex-col rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5', team.archived && 'opacity-75')}>
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-4 rounded-2xl p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ouvrir l’équipe ${team.name}`}>
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Workflow className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-[-0.02em]">{team.name}</h2>
              {team.archived && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Archivée</span>}
            </div>
            <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{team.description || 'Aucune description.'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {team.leadName ? (
            <><UserAvatar initials={team.leadInitials} image={team.leadImage} name={team.leadName} /><div className="min-w-0"><p className="text-[11px] text-muted-foreground">Responsable</p><p className="truncate font-medium">{team.leadName}</p></div></>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground"><ShieldCheck className="size-4" />Aucun responsable désigné</p>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center">
            <div className="flex -space-x-2">
              {team.members.slice(0, MAX_AVATARS).map((member) => <span key={member.id} className="rounded-full ring-2 ring-card"><UserAvatar initials={member.initials} image={member.image} name={member.name} /></span>)}
            </div>
            {hidden > 0 && <span className="ml-2 text-xs font-medium text-muted-foreground">+{hidden}</span>}
            {team.members.length === 0 && <span className="text-xs text-muted-foreground">Aucun membre</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="size-3.5" />{team.activeMemberCount}/{team.memberCount}</span>
            {pending > 0 && <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground"><Clock3 className="size-3.5" />{pending} en attente</span>}
          </div>
        </div>
      </button>
    </article>
  )
}

export function TeamsModule({ overview }: { overview: TeamsOverview }) {
  const router = useRouter()
  const { viewer, teams } = overview
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [sort, setSort] = useState<Sort>('name')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [formError, setFormError] = useState('')
  const [openTeamId, setOpenTeamId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const active = teams.filter((team) => !team.archived)
  const archivedCount = teams.length - active.length
  const totalMembers = active.reduce((sum, team) => sum + team.memberCount, 0)
  const withoutLead = active.filter((team) => !team.leadId).length
  const pendingTotal = active.reduce((sum, team) => sum + team.pendingAdmissions + team.pendingInvitations, 0)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = teams.filter((team) => {
      if (filter === 'active' && team.archived) return false
      if (filter === 'archived' && !team.archived) return false
      return !needle || `${team.name} ${team.description} ${team.leadName ?? ''}`.toLowerCase().includes(needle)
    })
    return list.sort((a, b) => sort === 'members' ? b.memberCount - a.memberCount : sort === 'recent' ? b.createdAt.localeCompare(a.createdAt) : a.name.localeCompare(b.name, 'fr'))
  }, [teams, query, filter, sort])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 3200)
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = await createTeam(form)
      if (!result.ok) {
        setFormError(result.message)
        return
      }
      setCreateOpen(false)
      setForm({ name: '', description: '' })
      notify(result.message)
      router.refresh()
      setOpenTeamId(result.id)
    })
  }

  async function logout() {
    await authClient.signOut()
    window.location.replace('/sign-in')
  }

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Équipes" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Administration <span className="px-2">/</span> <strong className="font-medium text-foreground">Équipes</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><Button variant="ghost" size="icon-lg" aria-label="Se déconnecter" onClick={logout}><LogOut /></Button></div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-2 text-xs font-medium text-primary">{overview.organizationName}</p>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Équipes</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{viewer.canAdminister ? 'Structurez votre organisation : créez des équipes, désignez leurs responsables et gérez leurs membres.' : 'Consultez les équipes de votre organisation et gérez les membres de la vôtre.'}</p>
              </div>
              {viewer.canAdminister && <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Nouvelle équipe</Button>}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="metric-card"><p>Équipes actives</p><strong>{active.length}</strong><span>{archivedCount} archivée(s)</span></div>
              <div className="metric-card"><p>Membres affectés</p><strong>{totalMembers}</strong><span>Dans les équipes actives</span></div>
              <div className="metric-card"><p>Sans responsable</p><strong>{withoutLead}</strong><span>{withoutLead > 0 ? 'À désigner' : 'Toutes pourvues'}</span></div>
              <div className="metric-card"><p>Demandes en attente</p><strong>{pendingTotal}</strong><span>Admissions et invitations</span></div>
            </section>

            <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative flex-1">
                <span className="sr-only">Rechercher une équipe</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-card pl-9 pr-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="Rechercher par nom, description ou responsable" />
              </label>
              <div className="flex rounded-xl border bg-card p-1" role="group" aria-label="Filtrer par statut">
                {([['active', 'Actives'], ['archived', 'Archivées'], ['all', 'Toutes']] as const).map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={cn('h-8 rounded-lg px-3 text-sm font-medium transition-colors', filter === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
                ))}
              </div>
              <label>
                <span className="sr-only">Trier</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="h-10 rounded-xl border bg-card px-3 text-sm outline-none focus:border-ring">
                  <option value="name">Nom (A-Z)</option>
                  <option value="members">Nombre de membres</option>
                  <option value="recent">Plus récentes</option>
                </select>
              </label>
            </section>

            {visible.length > 0 ? (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Liste des équipes">
                {visible.map((team) => <TeamCard key={team.id} team={team} onOpen={() => setOpenTeamId(team.id)} />)}
              </section>
            ) : (
              <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
                {filter === 'archived' ? <Archive className="size-8 text-muted-foreground" /> : <Users className="size-8 text-muted-foreground" />}
                <p className="font-semibold">{teams.length === 0 ? 'Aucune équipe pour le moment' : 'Aucune équipe ne correspond'}</p>
                <p className="max-w-md text-sm text-muted-foreground">{teams.length === 0 ? (viewer.canAdminister ? 'Créez votre première équipe pour y rattacher des membres et leur confier des veilles.' : 'Un administrateur doit créer les équipes de l’organisation.') : 'Modifiez votre recherche ou vos filtres pour retrouver une équipe.'}</p>
                {teams.length === 0 && viewer.canAdminister && <Button onClick={() => setCreateOpen(true)}><UserPlus data-icon="inline-start" />Créer une équipe</Button>}
              </section>
            )}
          </div>
        </main>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle équipe" description="Donnez un nom à l’équipe. Vous pourrez ensuite y ajouter des membres et désigner son responsable.">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-2 text-sm font-medium">Nom de l’équipe
            <input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={fieldClass} placeholder="Ex. Smart Workplace" autoFocus />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">Description <span className="font-normal text-muted-foreground">(facultatif)</span>
            <textarea maxLength={400} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={cn(fieldClass, 'h-auto resize-none py-2.5 leading-6')} placeholder="Périmètre et mission de l’équipe" />
            <span className="text-right text-xs font-normal text-muted-foreground">{form.description.length}/400</span>
          </label>
          {formError && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button type="submit" disabled={isPending}>{isPending ? 'Création…' : 'Créer l’équipe'}</Button></div>
        </form>
      </Modal>

      {openTeamId && <TeamDetailDialog teamId={openTeamId} viewer={viewer} onClose={() => setOpenTeamId(null)} onNotify={notify} />}

      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl">{toast}</div>}
    </div>
  )
}
