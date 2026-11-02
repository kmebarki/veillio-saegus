'use client'

import { Ban, Bell, Building2, Check, ChevronDown, CircleHelp, Download, Filter, IdCard, Mail, Menu, Search, Send, Settings, ShieldCheck, UserCheck, UserPlus, UserRoundX, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { cancelInvitation, createInvitation, getExportRows, resendInvitation } from '@/app/actions/admin-access'
import { getUserProfile } from '@/app/actions/profile'
import { AdmissionReviewDialog } from '@/components/admission-review-dialog'
import { UserProfileDialog } from '@/components/user-profile-dialog'
import type { UserProfile } from '@/lib/profile'
import { OrganizationPanel } from '@/components/organization-panel'
import { Button } from '@/components/ui/button'
import { Modal, fieldClass } from '@/components/ui/modal'
import { UserActionsMenu } from '@/components/user-actions-menu'
import { UserAvatar } from '@/components/user-avatar'
import { Sidebar } from '@/components/veillio-dashboard'
import type { ActionResult, AdminAdmission, AdminInvitation, AdminOrganization, AdminUser, AdminViewer } from '@/lib/admin-types'
import { UserMenu } from '@/components/user-menu'
import { ROLE_LABELS, type RoleKey } from '@/lib/roles'
import { cn } from '@/lib/utils'

type Tab = 'users' | 'admissions' | 'invitations' | 'organization'
type InvitationRole = 'Administrator' | 'Manager' | 'Watcher' | 'Reader'

const roleToInvitation: Partial<Record<RoleKey, InvitationRole>> = { admin: 'Administrator', pilot: 'Manager', contributor: 'Watcher', reader: 'Reader' }

const statusStyles: Record<string, string> = {
  'En attente': 'bg-secondary text-secondary-foreground',
  'Acceptée': 'bg-primary/10 text-primary',
  'Expirée': 'bg-muted text-muted-foreground',
  'Annulée': 'bg-destructive/10 text-destructive',
  Actif: 'bg-primary/10 text-primary',
  Suspendu: 'bg-destructive/10 text-destructive',
}

function StatusBadge({ status }: { status: string }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', statusStyles[status] ?? 'bg-muted text-muted-foreground')}>{status}</span>
}

function Avatar({ initials, image, name }: { initials: string; image?: string | null; name?: string }) {
  return <UserAvatar initials={initials} image={image} name={name} />
}

function SearchField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative flex-1">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border bg-background pl-9 pr-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder={placeholder} />
    </label>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 appearance-none rounded-xl border bg-background pl-9 pr-9 text-sm outline-none focus:border-ring">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </label>
  )
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
  return <div className="flex flex-col items-center gap-2 px-6 py-14 text-center"><Icon className="size-7 text-muted-foreground" /><p className="font-semibold">{title}</p><p className="text-sm text-muted-foreground">{text}</p></div>
}

function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function UsersAdmissions({ viewer, users, admissions, invitations, organization }: {
  viewer: AdminViewer
  users: AdminUser[]
  admissions: AdminAdmission[]
  invitations: AdminInvitation[]
  organization: AdminOrganization | null
}) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('users')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('Tous les rôles')
  const [invitationFilter, setInvitationFilter] = useState('Toutes')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [review, setReview] = useState<{ admission: AdminAdmission; mode: 'approve' | 'reject' } | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [invite, setInvite] = useState<{ name: string; email: string; role: InvitationRole; teamId: string }>({ name: '', email: '', role: 'Reader', teamId: '' })
  const [isPending, startTransition] = useTransition()

  const teams = organization?.teams ?? []
  const inviteRoles = viewer.assignableRoles.flatMap((key) => (roleToInvitation[key] ? [{ key, value: roleToInvitation[key] as InvitationRole }] : []))

  const filteredUsers = useMemo(() => users.filter((user) => `${user.name} ${user.email} ${user.team}`.toLowerCase().includes(query.toLowerCase()) && (roleFilter === 'Tous les rôles' || user.role === roleFilter)), [users, query, roleFilter])
  const filteredInvitations = useMemo(() => invitations.filter((item) => `${item.name} ${item.email} ${item.invitedBy}`.toLowerCase().includes(query.toLowerCase()) && (invitationFilter === 'Toutes' || item.status === invitationFilter)), [invitations, query, invitationFilter])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 3200)
  }

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action()
      notify(result.message)
      if (result.ok) router.refresh()
    })
  }

  function openProfile(target: { userId: string } | { email: string }) {
    startTransition(async () => {
      const result = await getUserProfile(target)
      if (result.ok) setProfile(result.profile)
      else notify(result.message)
    })
  }

  function submitInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = await createInvitation({ name: invite.name, email: invite.email, role: invite.role, teamId: invite.teamId || null })
      if (!result.ok) {
        setFormError(result.message)
        return
      }
      setInviteOpen(false)
      setInvite({ name: '', email: '', role: 'Reader', teamId: '' })
      notify(result.message)
      router.refresh()
    })
  }

  function exportUsers() {
    startTransition(async () => {
      try {
        const rows = await getExportRows()
        const header = ['Nom', 'E-mail', 'Rôle', 'Équipe', 'Statut', 'Dernière connexion', 'Créé le']
        const lines = rows.map((row) => [row.name, row.email, row.role, row.team, row.status, row.lastLogin, row.createdAt].map(csvCell).join(','))
        const blob = new Blob([`\uFEFF${[header.map(csvCell).join(','), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'utilisateurs-veillio.csv'
        link.click()
        URL.revokeObjectURL(url)
        notify('Export CSV généré.')
      } catch {
        notify('L’export n’a pas pu être généré.')
      }
    })
  }

  const tabs: { id: Tab; label: string; count?: number; tone?: string }[] = [
    { id: 'users', label: 'Utilisateurs', count: users.length },
    { id: 'admissions', label: 'Admissions', count: admissions.length, tone: 'bg-secondary text-secondary-foreground' },
    ...(viewer.canAdminister ? [{ id: 'invitations' as const, label: 'Invitations', count: invitations.length }, { id: 'organization' as const, label: 'Organisation' }] : []),
  ]

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Utilisateurs et admissions" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Administration <span className="px-2">/</span> <strong className="font-medium text-foreground">Utilisateurs et admissions</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><UserMenu /></div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-2 text-xs font-medium text-primary">{organization?.name ?? 'Administration des accès'}</p>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Utilisateurs et admissions</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{viewer.canAdminister ? 'Gérez les membres de votre organisation, leurs rôles, leurs équipes et les nouvelles demandes d’accès.' : 'Validez les demandes d’admission de votre équipe et consultez ses membres.'}</p>
              </div>
              {viewer.canAdminister && <div className="flex gap-2"><Button variant="outline" disabled={isPending} onClick={exportUsers}><Download data-icon="inline-start" />Exporter</Button><Button onClick={() => setInviteOpen(true)}><UserPlus data-icon="inline-start" />Inviter un utilisateur</Button></div>}
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <div className="metric-card"><p>Utilisateurs actifs</p><strong>{users.filter((user) => user.status === 'Actif').length}</strong><span>{users.length} comptes au total</span></div>
              <div className="metric-card"><p>Admissions en attente</p><strong>{admissions.length}</strong><span>À traiter</span></div>
              <div className="metric-card"><p>Équipes</p><strong>{teams.length}</strong><span>{organization?.domains.length ?? 0} domaine(s) autorisé(s)</span></div>
            </section>

            <section className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex gap-6 overflow-x-auto border-b px-5 sm:px-6" role="tablist" aria-label="Gestion des accès">
                {tabs.map((item) => (
                  <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setQuery('') }} className={cn('relative min-h-14 shrink-0 px-1 text-sm font-semibold', tab === item.id ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary' : 'text-muted-foreground')}>
                    {item.label}{item.count !== undefined && <span className={cn('ml-1.5 rounded-full px-2 py-0.5 text-[11px]', item.tone ?? 'bg-muted')}>{item.count}</span>}
                  </button>
                ))}
              </div>

              {tab === 'users' && (
                <div>
                  <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:px-6"><SearchField label="Rechercher un utilisateur" value={query} onChange={setQuery} placeholder="Rechercher par nom, e-mail ou équipe" /><FilterSelect label="Filtrer par rôle" value={roleFilter} onChange={setRoleFilter} options={['Tous les rôles', ...Object.values(ROLE_LABELS)]} /></div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[790px] text-left">
                      <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground"><th className="px-6 py-3 font-medium">Utilisateur</th><th className="px-4 py-3 font-medium">Rôle</th><th className="px-4 py-3 font-medium">Équipe</th><th className="px-4 py-3 font-medium">Statut</th><th className="px-4 py-3 font-medium">Dernière activité</th><th className="px-6 py-3"><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody>{filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-6 py-4"><button type="button" onClick={() => openProfile({ userId: user.id })} className="flex items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ouvrir la fiche de ${user.name}`}><Avatar initials={user.initials} image={user.image} name={user.name} /><div><p className="text-sm font-semibold hover:underline">{user.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p></div></button></td>
                          <td className="px-4 py-4 text-sm">{user.role}</td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">{user.team}</td>
                          <td className="px-4 py-4"><StatusBadge status={user.status} /></td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">{user.lastSeen}</td>
                          <td className="px-6 py-4 text-right"><UserActionsMenu user={user} viewer={viewer} teams={teams} busy={isPending} run={run} /></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  {filteredUsers.length === 0 && <EmptyState icon={Users} title="Aucun utilisateur trouvé" text="Modifiez vos critères de recherche." />}
                </div>
              )}

              {tab === 'admissions' && (
                <div className="p-4 sm:p-6">
                  {admissions.length > 0 ? (
                    <div className="flex flex-col gap-3">{admissions.map((admission) => (
                      <article key={admission.id} className="flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center">
                        <Avatar initials={admission.initials} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{admission.name}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{admission.requestedRole}</span><span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">Équipe : {admission.declaredTeam}</span></div>
                          <p className="mt-1 text-xs text-muted-foreground">{admission.email} · Demande reçue le {admission.requestedAt}</p>
                          <p className="mt-2 text-sm">{admission.message}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 lg:shrink-0"><Button variant="ghost" disabled={isPending} onClick={() => openProfile({ email: admission.email })}><IdCard data-icon="inline-start" />Voir la fiche</Button><Button variant="outline" disabled={isPending} onClick={() => setReview({ admission, mode: 'reject' })}><UserRoundX data-icon="inline-start" />Refuser</Button><Button disabled={isPending} onClick={() => setReview({ admission, mode: 'approve' })}><UserCheck data-icon="inline-start" />Approuver</Button></div>
                      </article>
                    ))}</div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-16 text-center"><div className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground"><Check /></div><div><p className="font-semibold">Toutes les demandes sont traitées</p><p className="mt-1 text-sm text-muted-foreground">Aucune admission n’est en attente.</p></div></div>
                  )}
                </div>
              )}

              {tab === 'invitations' && viewer.canAdminister && (
                <div>
                  <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:px-6"><SearchField label="Rechercher une invitation" value={query} onChange={setQuery} placeholder="Rechercher par nom, e-mail ou expéditeur" /><FilterSelect label="Filtrer par statut" value={invitationFilter} onChange={setInvitationFilter} options={['Toutes', 'En attente', 'Acceptée', 'Expirée', 'Annulée']} /></div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left">
                      <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground"><th className="px-6 py-3 font-medium">Invité</th><th className="px-4 py-3 font-medium">Rôle</th><th className="px-4 py-3 font-medium">Équipe</th><th className="px-4 py-3 font-medium">Statut</th><th className="px-4 py-3 font-medium">Envoyée le</th><th className="px-4 py-3 font-medium">Expire le</th><th className="px-4 py-3 font-medium">Invité par</th><th className="px-6 py-3 text-right font-medium">Actions</th></tr></thead>
                      <tbody>{filteredInvitations.map((item) => (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-6 py-4"><div className="flex items-center gap-3"><Avatar initials={item.initials} /><div><p className="text-sm font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.email}</p></div></div></td>
                          <td className="px-4 py-4 text-sm">{item.role}</td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">{item.team}</td>
                          <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">{item.sentAt}</td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">{item.expiresAt}</td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">{item.invitedBy}</td>
                          <td className="px-6 py-4"><div className="flex justify-end gap-1">
                            {(item.status === 'En attente' || item.status === 'Expirée') && <Button variant="ghost" size="icon" disabled={isPending} onClick={() => run(() => resendInvitation({ id: item.id }))} aria-label={`Renvoyer l’invitation à ${item.name}`}><Send /></Button>}
                            {item.status === 'En attente' && <Button variant="ghost" size="icon" disabled={isPending} onClick={() => run(() => cancelInvitation({ id: item.id }))} aria-label={`Annuler l’invitation de ${item.name}`}><Ban /></Button>}
                          </div></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  {filteredInvitations.length === 0 && <EmptyState icon={Mail} title="Aucune invitation trouvée" text={invitations.length === 0 ? 'Les invitations envoyées apparaîtront ici.' : 'Modifiez vos critères de recherche.'} />}
                </div>
              )}

              {tab === 'organization' && viewer.canAdminister && (organization ? <OrganizationPanel key={organization.id} organization={organization} busy={isPending} run={run} /> : <EmptyState icon={Building2} title="Organisation introuvable" text="Aucune organisation n’est configurée." />)}
            </section>

            <aside className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-semibold">Contrôle des accès actif</p><p className="mt-1 leading-6 text-muted-foreground">Les sessions, permissions, admissions et modifications sensibles sont vérifiées côté serveur et journalisées.</p></div></aside>
          </div>
        </main>
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Inviter un utilisateur" description="L’invitation est valable 7 jours et rattache l’utilisateur à l’équipe choisie.">
        <form className="flex flex-col gap-4" onSubmit={submitInvitation}>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Nom complet<input required minLength={2} maxLength={120} value={invite.name} onChange={(event) => setInvite({ ...invite, name: event.target.value })} className={fieldClass} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">Adresse e-mail<input required type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} className={fieldClass} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">Rôle<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as InvitationRole })} className={fieldClass}>{inviteRoles.map((item) => <option key={item.key} value={item.value}>{ROLE_LABELS[item.key]}</option>)}</select></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Équipe<select value={invite.teamId} onChange={(event) => setInvite({ ...invite, teamId: event.target.value })} className={fieldClass}><option value="">Aucune équipe</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          </div>
          {formError && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Annuler</Button><Button type="submit" disabled={isPending}><Send data-icon="inline-start" />{isPending ? 'Envoi…' : 'Envoyer l’invitation'}</Button></div>
        </form>
      </Modal>

      {profile && <UserProfileDialog key={profile.id} profile={profile} onClose={() => setProfile(null)} onSaved={(message) => { notify(message); router.refresh() }} />}

      <AdmissionReviewDialog admission={review?.admission ?? null} mode={review?.mode ?? 'approve'} viewer={viewer} teams={teams} busy={isPending} onClose={() => setReview(null)} run={run} />

      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-background shadow-xl">{toast}</div>}
    </div>
  )
}
