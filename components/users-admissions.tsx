'use client'

import { Bell, Check, ChevronDown, CircleHelp, Download, Filter, LogOut, Mail, Menu, MoreHorizontal, Search, Settings, ShieldCheck, UserCheck, UserPlus, UserRoundX, Users, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { createInvitation, decideAdmission, updateUserStatus } from '@/app/actions/admin-access'
import { Sidebar } from '@/components/veillio-dashboard'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

type UserStatus = 'Actif' | 'Suspendu'
type Role = 'Super administrateur' | 'Administrateur' | 'Manager' | 'Contributeur' | 'Lecteur'
type User = { id: string; name: string; email: string; initials: string; role: string; team: string; status: string; lastSeen: string }
type Admission = { id: string; name: string; email: string; initials: string; requestedAt: string; requestedRole: string; message: string }
type InvitationRole = 'Administrator' | 'Watcher' | 'Reader'

const roleLabels: Record<InvitationRole, string> = { Administrator: 'Administrateur', Watcher: 'Contributeur', Reader: 'Lecteur' }

function StatusBadge({ status }: { status: string }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', status === 'Actif' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')}>{status}</span>
}

export function UsersAdmissions({ initialUsers, initialAdmissions }: { initialUsers: User[]; initialAdmissions: Admission[] }) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState<'users' | 'admissions'>('users')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('Tous les rôles')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'Reader' as InvitationRole })
  const [isPending, startTransition] = useTransition()

  const filteredUsers = useMemo(() => initialUsers.filter((user) => {
    const matchesQuery = `${user.name} ${user.email} ${user.team}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (roleFilter === 'Tous les rôles' || user.role === roleFilter)
  }), [initialUsers, query, roleFilter])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  function handleDecision(admission: Admission, decision: 'Approved' | 'Rejected') {
    startTransition(async () => {
      const result = await decideAdmission({ id: admission.id, decision })
      notify(result.message)
      if (result.ok) router.refresh()
    })
  }

  function handleStatus(user: User) {
    startTransition(async () => {
      const result = await updateUserStatus({ userId: user.id, status: user.status === 'Actif' ? 'suspended' : 'active' })
      notify(result.message)
      if (result.ok) router.refresh()
    })
  }

  function addUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = await createInvitation(newUser)
      if (!result.ok) {
        setFormError(result.message)
        return
      }
      setDialogOpen(false)
      setNewUser({ name: '', email: '', role: 'Reader' })
      notify(result.message)
      router.refresh()
    })
  }

  async function logout() {
    await authClient.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Utilisateurs et admissions" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Administration <span className="px-2">/</span> <strong className="font-medium text-foreground">Utilisateurs et admissions</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><Button variant="ghost" size="icon-lg" aria-label="Se déconnecter" onClick={logout}><LogOut /></Button></div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="mb-2 text-xs font-medium text-primary">Administration des accès</p><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Utilisateurs et admissions</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Gérez les membres de votre organisation, leurs rôles et les nouvelles demandes d’accès.</p></div>
              <div className="flex gap-2"><Button variant="outline"><Download data-icon="inline-start" />Exporter</Button><Button onClick={() => setDialogOpen(true)}><UserPlus data-icon="inline-start" />Inviter un utilisateur</Button></div>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <div className="metric-card"><p>Utilisateurs actifs</p><strong>{initialUsers.filter((user) => user.status === 'Actif').length}</strong><span>{initialUsers.length} comptes au total</span></div>
              <div className="metric-card"><p>Admissions en attente</p><strong>{initialAdmissions.length}</strong><span>À traiter par un administrateur</span></div>
              <div className="metric-card"><p>Administrateurs</p><strong>{initialUsers.filter((user) => user.role.includes('administrateur')).length}</strong><span>Accès complet à l’organisation</span></div>
            </section>

            <section className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex border-b px-5 sm:px-6" role="tablist" aria-label="Gestion des accès">
                <button role="tab" aria-selected={tab === 'users'} onClick={() => setTab('users')} className={cn('relative min-h-14 px-1 text-sm font-semibold', tab === 'users' ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary' : 'text-muted-foreground')}>Utilisateurs <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px]">{initialUsers.length}</span></button>
                <button role="tab" aria-selected={tab === 'admissions'} onClick={() => setTab('admissions')} className={cn('relative ml-6 min-h-14 px-1 text-sm font-semibold', tab === 'admissions' ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary' : 'text-muted-foreground')}>Admissions <span className="ml-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">{initialAdmissions.length}</span></button>
              </div>

              {tab === 'users' ? <div>
                <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:px-6"><label className="relative flex-1"><span className="sr-only">Rechercher un utilisateur</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-background pl-9 pr-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="Rechercher par nom, e-mail ou équipe" /></label><label className="relative"><span className="sr-only">Filtrer par rôle</span><Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-10 appearance-none rounded-xl border bg-background pl-9 pr-9 text-sm outline-none focus:border-ring"><option>Tous les rôles</option>{['Super administrateur', 'Administrateur', 'Manager', 'Contributeur', 'Lecteur'].map((role) => <option key={role}>{role}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /></label></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[790px] text-left"><thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground"><th className="px-6 py-3 font-medium">Utilisateur</th><th className="px-4 py-3 font-medium">Rôle</th><th className="px-4 py-3 font-medium">Équipe</th><th className="px-4 py-3 font-medium">Statut</th><th className="px-4 py-3 font-medium">Dernière activité</th><th className="px-6 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30"><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{user.initials}</div><div><p className="text-sm font-semibold">{user.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p></div></div></td><td className="px-4 py-4 text-sm">{user.role}</td><td className="px-4 py-4 text-sm text-muted-foreground">{user.team}</td><td className="px-4 py-4"><StatusBadge status={user.status} /></td><td className="px-4 py-4 text-xs text-muted-foreground">{user.lastSeen}</td><td className="px-6 py-4 text-right"><Button variant="ghost" size="icon" disabled={isPending} onClick={() => handleStatus(user)} aria-label={user.status === 'Actif' ? `Suspendre ${user.name}` : `Réactiver ${user.name}`}><MoreHorizontal /></Button></td></tr>)}</tbody></table></div>
                {filteredUsers.length === 0 && <div className="flex flex-col items-center gap-2 px-6 py-14 text-center"><Users className="size-7 text-muted-foreground" /><p className="font-semibold">Aucun utilisateur trouvé</p><p className="text-sm text-muted-foreground">Modifiez vos critères de recherche.</p></div>}
              </div> : <div className="p-4 sm:p-6">{initialAdmissions.length > 0 ? <div className="flex flex-col gap-3">{initialAdmissions.map((admission) => <article key={admission.id} className="flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{admission.initials}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{admission.name}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{admission.requestedRole}</span></div><p className="mt-1 text-xs text-muted-foreground">{admission.email} · Demande reçue {admission.requestedAt.toLowerCase()}</p><p className="mt-2 text-sm">{admission.message}</p></div><div className="flex gap-2 lg:shrink-0"><Button variant="outline" disabled={isPending} onClick={() => handleDecision(admission, 'Rejected')}><UserRoundX data-icon="inline-start" />Refuser</Button><Button disabled={isPending} onClick={() => handleDecision(admission, 'Approved')}><UserCheck data-icon="inline-start" />Approuver</Button></div></article>)}</div> : <div className="flex flex-col items-center gap-3 py-16 text-center"><div className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><Check /></div><div><p className="font-semibold">Toutes les demandes sont traitées</p><p className="mt-1 text-sm text-muted-foreground">Aucune admission n’est en attente.</p></div></div>}</div>}
            </section>
            <aside className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-semibold">Contrôle des accès actif</p><p className="mt-1 leading-6 text-muted-foreground">Les sessions, permissions, admissions et modifications sensibles sont vérifiées côté serveur et journalisées dans PostgreSQL.</p></div></aside>
          </div>
        </main>
      </div>

      {dialogOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDialogOpen(false)}><div role="dialog" aria-modal="true" aria-labelledby="invite-title" className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="invite-title" className="text-lg font-semibold">Inviter un utilisateur</h2><p className="mt-1 text-sm text-muted-foreground">L’invitation sera enregistrée pendant 7 jours.</p></div><Button variant="ghost" size="icon" aria-label="Fermer" onClick={() => setDialogOpen(false)}><X /></Button></div><form className="mt-6 flex flex-col gap-4" onSubmit={addUser}><label className="flex flex-col gap-1.5 text-sm font-medium">Nom complet<input required minLength={2} maxLength={120} value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} className="h-11 rounded-xl border bg-background px-3 font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" /></label><label className="flex flex-col gap-1.5 text-sm font-medium">Adresse e-mail<div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" /></div></label><label className="flex flex-col gap-1.5 text-sm font-medium">Rôle<select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as InvitationRole })} className="h-11 rounded-xl border bg-background px-3 font-normal outline-none focus:border-ring">{(Object.keys(roleLabels) as InvitationRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>{formError && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{formError}</p>}<div className="mt-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button><Button type="submit" disabled={isPending}><Mail data-icon="inline-start" />{isPending ? 'Enregistrement…' : 'Enregistrer l’invitation'}</Button></div></form></div></div>}
      {toast && <div role="status" className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background shadow-xl"><Check className="size-4" />{toast}</div>}
    </div>
  )
}
