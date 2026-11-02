'use client'

import {
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  Filter,
  Mail,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserRoundX,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Sidebar } from '@/components/veillio-dashboard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type UserStatus = 'Actif' | 'Suspendu' | 'Invité'
type Role = 'Administrateur' | 'Manager' | 'Contributeur' | 'Lecteur'
type User = { id: number; name: string; email: string; initials: string; role: Role; team: string; status: UserStatus; lastSeen: string }
type Admission = { id: number; name: string; email: string; initials: string; requestedAt: string; requestedRole: Role; message: string }

const initialUsers: User[] = [
  { id: 1, name: 'Kamel Mebarki', email: 'kamel.mebarki@saegus.com', initials: 'KM', role: 'Administrateur', team: 'Direction', status: 'Actif', lastSeen: 'Maintenant' },
  { id: 2, name: 'Sophie Bernard', email: 'sophie.bernard@saegus.com', initials: 'SB', role: 'Manager', team: 'Innovation', status: 'Actif', lastSeen: 'Il y a 12 min' },
  { id: 3, name: 'Thomas Leroy', email: 'thomas.leroy@saegus.com', initials: 'TL', role: 'Contributeur', team: 'Mobilité', status: 'Actif', lastSeen: 'Hier à 17:42' },
  { id: 4, name: 'Inès Martin', email: 'ines.martin@saegus.com', initials: 'IM', role: 'Lecteur', team: 'Énergie', status: 'Invité', lastSeen: 'Invitation envoyée' },
  { id: 5, name: 'Marc Dubois', email: 'marc.dubois@saegus.com', initials: 'MD', role: 'Contributeur', team: 'Innovation', status: 'Suspendu', lastSeen: '18 oct. 2026' },
]

const initialAdmissions: Admission[] = [
  { id: 101, name: 'Léa Robert', email: 'lea.robert@saegus.com', initials: 'LR', requestedAt: 'Aujourd’hui, 09:14', requestedRole: 'Contributeur', message: 'Je souhaite rejoindre la veille Intelligence artificielle.' },
  { id: 102, name: 'Nicolas Petit', email: 'nicolas.petit@saegus.com', initials: 'NP', requestedAt: 'Hier, 16:38', requestedRole: 'Lecteur', message: 'Accès demandé pour consulter les publications mobilité.' },
]

const roleOptions: Role[] = ['Administrateur', 'Manager', 'Contributeur', 'Lecteur']

function StatusBadge({ status }: { status: UserStatus }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', status === 'Actif' && 'bg-[#E9F7F1] text-[#176B4B]', status === 'Suspendu' && 'bg-[#FCEBED] text-[#9E2F3A]', status === 'Invité' && 'bg-secondary text-secondary-foreground')}>{status}</span>
}

export function UsersAdmissions() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState<'users' | 'admissions'>('users')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'Tous les rôles' | Role>('Tous les rôles')
  const [users, setUsers] = useState(initialUsers)
  const [admissions, setAdmissions] = useState(initialAdmissions)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'Lecteur' as Role })

  const filteredUsers = useMemo(() => users.filter((user) => {
    const matchesQuery = `${user.name} ${user.email} ${user.team}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (roleFilter === 'Tous les rôles' || user.role === roleFilter)
  }), [query, roleFilter, users])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  function approveAdmission(admission: Admission) {
    setAdmissions((current) => current.filter((item) => item.id !== admission.id))
    setUsers((current) => [...current, { id: Date.now(), name: admission.name, email: admission.email, initials: admission.initials, role: admission.requestedRole, team: 'À affecter', status: 'Actif', lastSeen: 'Admission approuvée' }])
    notify(`Admission de ${admission.name} approuvée`)
  }

  function rejectAdmission(admission: Admission) {
    setAdmissions((current) => current.filter((item) => item.id !== admission.id))
    notify(`Demande de ${admission.name} refusée`)
  }

  function addUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const initials = newUser.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    setUsers((current) => [...current, { id: Date.now(), name: newUser.name.trim(), email: newUser.email.trim(), initials, role: newUser.role, team: 'À affecter', status: 'Invité', lastSeen: 'Invitation envoyée' }])
    setDialogOpen(false)
    setNewUser({ name: '', email: '', role: 'Lecteur' })
    notify(`Invitation envoyée à ${newUser.email}`)
  }

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Utilisateurs et admissions" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Administration <span className="px-2">/</span> <strong className="font-medium text-foreground">Utilisateurs et admissions</strong></div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button>
            <Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button>
            <Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="mb-2 text-xs font-medium text-primary">Administration des accès</p><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Utilisateurs et admissions</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Gérez les membres de votre organisation, leurs rôles et les nouvelles demandes d’accès.</p></div>
              <div className="flex gap-2"><Button variant="outline"><Download data-icon="inline-start" />Exporter</Button><Button onClick={() => setDialogOpen(true)}><UserPlus data-icon="inline-start" />Inviter un utilisateur</Button></div>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <div className="metric-card"><p>Utilisateurs actifs</p><strong>{users.filter((user) => user.status === 'Actif').length}</strong><span>{users.length} comptes au total</span></div>
              <div className="metric-card"><p>Admissions en attente</p><strong>{admissions.length}</strong><span>À traiter par un administrateur</span></div>
              <div className="metric-card"><p>Administrateurs</p><strong>{users.filter((user) => user.role === 'Administrateur').length}</strong><span>Accès complet à l’organisation</span></div>
            </section>

            <section className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex border-b px-5 sm:px-6" role="tablist" aria-label="Gestion des accès">
                <button role="tab" aria-selected={tab === 'users'} onClick={() => setTab('users')} className={cn('relative min-h-14 px-1 text-sm font-semibold', tab === 'users' ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary' : 'text-muted-foreground')}>Utilisateurs <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px]">{users.length}</span></button>
                <button role="tab" aria-selected={tab === 'admissions'} onClick={() => setTab('admissions')} className={cn('relative ml-6 min-h-14 px-1 text-sm font-semibold', tab === 'admissions' ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary' : 'text-muted-foreground')}>Admissions <span className="ml-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">{admissions.length}</span></button>
              </div>

              {tab === 'users' ? (
                <div>
                  <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:px-6">
                    <label className="relative flex-1"><span className="sr-only">Rechercher un utilisateur</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-background pl-9 pr-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="Rechercher par nom, e-mail ou équipe" /></label>
                    <label className="relative"><span className="sr-only">Filtrer par rôle</span><Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)} className="h-10 appearance-none rounded-xl border bg-background pl-9 pr-9 text-sm outline-none focus:border-ring"><option>Tous les rôles</option>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /></label>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[790px] text-left"><thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground"><th className="px-6 py-3 font-medium">Utilisateur</th><th className="px-4 py-3 font-medium">Rôle</th><th className="px-4 py-3 font-medium">Équipe</th><th className="px-4 py-3 font-medium">Statut</th><th className="px-4 py-3 font-medium">Dernière activité</th><th className="px-6 py-3"><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody>{filteredUsers.map((user) => <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30"><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{user.initials}</div><div><p className="text-sm font-semibold">{user.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p></div></div></td><td className="px-4 py-4 text-sm">{user.role}</td><td className="px-4 py-4 text-sm text-muted-foreground">{user.team}</td><td className="px-4 py-4"><StatusBadge status={user.status} /></td><td className="px-4 py-4 text-xs text-muted-foreground">{user.lastSeen}</td><td className="px-6 py-4 text-right"><Button variant="ghost" size="icon" aria-label={`Actions pour ${user.name}`}><MoreHorizontal /></Button></td></tr>)}</tbody></table>
                  </div>
                  {filteredUsers.length === 0 && <div className="flex flex-col items-center gap-2 px-6 py-14 text-center"><Users className="size-7 text-muted-foreground" /><p className="font-semibold">Aucun utilisateur trouvé</p><p className="text-sm text-muted-foreground">Modifiez vos critères de recherche.</p></div>}
                </div>
              ) : (
                <div className="p-4 sm:p-6">
                  {admissions.length > 0 ? <div className="flex flex-col gap-3">{admissions.map((admission) => <article key={admission.id} className="flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{admission.initials}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{admission.name}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{admission.requestedRole}</span></div><p className="mt-1 text-xs text-muted-foreground">{admission.email} · Demande reçue {admission.requestedAt.toLowerCase()}</p><p className="mt-2 text-sm">{admission.message}</p></div><div className="flex gap-2 lg:shrink-0"><Button variant="outline" onClick={() => rejectAdmission(admission)}><UserRoundX data-icon="inline-start" />Refuser</Button><Button onClick={() => approveAdmission(admission)}><UserCheck data-icon="inline-start" />Approuver</Button></div></article>)}</div> : <div className="flex flex-col items-center gap-3 py-16 text-center"><div className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><Check /></div><div><p className="font-semibold">Toutes les demandes sont traitées</p><p className="mt-1 text-sm text-muted-foreground">Aucune admission n’est en attente.</p></div></div>}
                </div>
              )}
            </section>

            <aside className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-semibold">Contrôle des accès</p><p className="mt-1 leading-6 text-muted-foreground">Les modifications sensibles devront être journalisées et vérifiées côté serveur dès que la connexion PostgreSQL et l’authentification seront activées.</p></div></aside>
          </div>
        </main>
      </div>

      {dialogOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDialogOpen(false)}><div role="dialog" aria-modal="true" aria-labelledby="invite-title" className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="invite-title" className="text-lg font-semibold">Inviter un utilisateur</h2><p className="mt-1 text-sm text-muted-foreground">Une invitation sera envoyée par e-mail.</p></div><Button variant="ghost" size="icon" aria-label="Fermer" onClick={() => setDialogOpen(false)}><X /></Button></div><form className="mt-6 flex flex-col gap-4" onSubmit={addUser}><label className="flex flex-col gap-1.5 text-sm font-medium">Nom complet<input required value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} className="h-11 rounded-xl border bg-background px-3 font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="Prénom Nom" /></label><label className="flex flex-col gap-1.5 text-sm font-medium">Adresse e-mail<div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input required type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="prenom.nom@entreprise.com" /></div></label><label className="flex flex-col gap-1.5 text-sm font-medium">Rôle<select value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as Role })} className="h-11 rounded-xl border bg-background px-3 font-normal outline-none focus:border-ring">{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label><div className="mt-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button><Button type="submit"><Mail data-icon="inline-start" />Envoyer l’invitation</Button></div></form></div></div>}
      {toast && <div role="status" className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background shadow-xl"><Check className="size-4" />{toast}</div>}
    </div>
  )
}
