'use client'

import { Bell, Check, CircleHelp, KeyRound, Lock, Menu, Plus, Search, Settings, ShieldCheck, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { createGroup } from '@/app/actions/groups'
import { GroupDetailDialog } from '@/components/group-detail-dialog'
import { PermissionPicker } from '@/components/permission-picker'
import { Button } from '@/components/ui/button'
import { Modal, fieldClass } from '@/components/ui/modal'
import { UserAvatar } from '@/components/user-avatar'
import { Sidebar } from '@/components/veillio-dashboard'
import { UserMenu } from '@/components/user-menu'
import type { GroupSummary, GroupsOverview } from '@/lib/group-types'
import { PERMISSION_MODULES, isSensitivePermission } from '@/lib/permissions'
import { cn } from '@/lib/utils'

type Tab = 'groups' | 'matrix'
type Sort = 'name' | 'members' | 'permissions'

const MAX_AVATARS = 4

function GroupCard({ group, onOpen }: { group: GroupSummary; onOpen: () => void }) {
  const hidden = Math.max(0, group.memberCount - MAX_AVATARS)
  const sensitive = group.permissions.filter(isSensitivePermission).length
  const modules = PERMISSION_MODULES.map((module) => ({ label: module.label, total: module.permissions.length, granted: module.permissions.filter((permission) => group.permissions.includes(permission.key)).length })).filter((module) => module.granted > 0)

  return (
    <article className="group flex flex-col rounded-2xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-4 rounded-2xl p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ouvrir le groupe ${group.name}`}>
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-[-0.02em]">{group.name}</h2>
              {sensitive > 0 && <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">Sensible</span>}
              {!group.editable && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Lecture seule" />}
            </div>
            <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{group.description || 'Aucune description.'}</p>
          </div>
        </div>

        <ul className="flex flex-wrap gap-1.5" aria-label="Modules concernés">
          {modules.map((module) => (
            <li key={module.label} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{module.label} <span className="text-secondary-foreground/60">{module.granted}/{module.total}</span></li>
          ))}
        </ul>

        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center">
            <div className="flex -space-x-2">
              {group.members.slice(0, MAX_AVATARS).map((member) => <span key={member.id} className="rounded-full ring-2 ring-card"><UserAvatar initials={member.initials} image={member.image} name={member.name} /></span>)}
            </div>
            {hidden > 0 && <span className="ml-2 text-xs font-medium text-muted-foreground">+{hidden}</span>}
            {group.memberCount === 0 && <span className="text-xs text-muted-foreground">Aucun membre</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><KeyRound className="size-3.5" />{group.permissions.length}</span>
            <span className="flex items-center gap-1"><Users className="size-3.5" />{group.memberCount}</span>
          </div>
        </div>
      </button>
    </article>
  )
}

function RoleMatrix({ overview }: { overview: GroupsOverview }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card" aria-label="Matrice des permissions par rôle">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th scope="col" className="px-4 py-3 font-semibold">Permission</th>
              {overview.roles.map((role) => (
                <th key={role.role} scope="col" className="px-3 py-3 text-center font-semibold">{role.label}<span className="block text-[11px] font-normal text-muted-foreground">{role.userCount} actif(s)</span></th>
              ))}
              <th scope="col" className="px-3 py-3 text-center font-semibold">Groupes<span className="block text-[11px] font-normal text-muted-foreground">qui l’accordent</span></th>
            </tr>
          </thead>
          {PERMISSION_MODULES.map((module) => (
            <tbody key={module.id}>
              <tr className="border-b bg-secondary/40"><th colSpan={overview.roles.length + 2} scope="colgroup" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{module.label}</th></tr>
              {module.permissions.map((permission) => {
                const groupCount = overview.groups.filter((group) => group.permissions.includes(permission.key)).length
                return (
                  <tr key={permission.key} className="border-b last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <span className="flex items-center gap-2 font-medium">{permission.label}{permission.sensitive && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">Sensible</span>}</span>
                      <span className="block text-xs text-muted-foreground">{permission.description}</span>
                    </th>
                    {overview.roles.map((role) => (
                      <td key={role.role} className="px-3 py-3 text-center">
                        {role.permissions.includes(permission.key) ? <><Check className="mx-auto size-4 text-primary" aria-hidden /><span className="sr-only">Oui</span></> : <><span aria-hidden className="text-muted-foreground/40">—</span><span className="sr-only">Non</span></>}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center font-medium">{groupCount > 0 ? groupCount : <span className="text-muted-foreground/40">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>
      <p className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">Les permissions d’un utilisateur sont celles de son rôle, auxquelles s’ajoutent celles de tous les groupes dont il est membre. Un groupe ne peut qu’ajouter des permissions, jamais en retirer.</p>
    </section>
  )
}

export function GroupsModule({ overview }: { overview: GroupsOverview }) {
  const router = useRouter()
  const { viewer, groups } = overview
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('groups')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', permissions: [] as string[] })
  const [formError, setFormError] = useState('')
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const grantable = useMemo(() => viewer.permissions.filter((key) => viewer.isSuperAdmin || !isSensitivePermission(key)), [viewer])
  const assignments = groups.reduce((sum, group) => sum + group.memberCount, 0)
  const sensitiveGroups = groups.filter((group) => group.permissions.some(isSensitivePermission)).length
  const emptyGroups = groups.filter((group) => group.memberCount === 0).length

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = groups.filter((group) => !needle || `${group.name} ${group.description}`.toLowerCase().includes(needle))
    return list.sort((a, b) => sort === 'members' ? b.memberCount - a.memberCount : sort === 'permissions' ? b.permissions.length - a.permissions.length : a.name.localeCompare(b.name, 'fr'))
  }, [groups, query, sort])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 3600)
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    startTransition(async () => {
      const result = await createGroup(form)
      if (!result.ok) {
        setFormError(result.message)
        return
      }
      setCreateOpen(false)
      setForm({ name: '', description: '', permissions: [] })
      notify(result.message)
      router.refresh()
      setOpenGroupId(result.id)
    })
  }

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Groupes et permissions" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Administration <span className="px-2">/</span> <strong className="font-medium text-foreground">Groupes et permissions</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><UserMenu /></div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-2 text-xs font-medium text-primary">{overview.organizationName}</p>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Groupes et permissions</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{viewer.canManage ? 'Accordez des droits supplémentaires à des utilisateurs, au-delà de leur rôle, en les rassemblant dans des groupes.' : 'Consultez les groupes de l’organisation et les permissions qu’ils accordent.'}</p>
              </div>
              {viewer.canManage && <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Nouveau groupe</Button>}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="metric-card"><p>Groupes</p><strong>{groups.length}</strong><span>{emptyGroups > 0 ? `${emptyGroups} sans membre` : 'Tous utilisés'}</span></div>
              <div className="metric-card"><p>Affectations</p><strong>{assignments}</strong><span>Utilisateurs dans des groupes</span></div>
              <div className="metric-card"><p>Groupes sensibles</p><strong>{sensitiveGroups}</strong><span>{sensitiveGroups > 0 ? 'À surveiller' : 'Aucune permission sensible'}</span></div>
              <div className="metric-card"><p>Permissions</p><strong>{PERMISSION_MODULES.reduce((sum, module) => sum + module.permissions.length, 0)}</strong><span>{PERMISSION_MODULES.length} modules</span></div>
            </section>

            <div className="flex w-fit rounded-xl border bg-card p-1" role="tablist" aria-label="Vues">
              {([['groups', 'Groupes'], ['matrix', 'Matrice des permissions']] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('h-8 rounded-lg px-4 text-sm font-medium transition-colors', tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
              ))}
            </div>

            {tab === 'matrix' ? (
              <RoleMatrix overview={overview} />
            ) : (
              <>
                <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="relative flex-1">
                    <span className="sr-only">Rechercher un groupe</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-card pl-9 pr-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="Rechercher par nom ou description" />
                  </label>
                  <label>
                    <span className="sr-only">Trier</span>
                    <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="h-10 rounded-xl border bg-card px-3 text-sm outline-none focus:border-ring">
                      <option value="name">Nom (A-Z)</option>
                      <option value="members">Nombre de membres</option>
                      <option value="permissions">Nombre de permissions</option>
                    </select>
                  </label>
                </section>

                {visible.length > 0 ? (
                  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Liste des groupes">
                    {visible.map((group) => <GroupCard key={group.id} group={group} onOpen={() => setOpenGroupId(group.id)} />)}
                  </section>
                ) : (
                  <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
                    <ShieldCheck className="size-8 text-muted-foreground" />
                    <p className="font-semibold">{groups.length === 0 ? 'Aucun groupe pour le moment' : 'Aucun groupe ne correspond'}</p>
                    <p className="max-w-md text-sm text-muted-foreground">{groups.length === 0 ? (viewer.canManage ? 'Créez un groupe pour accorder des permissions précises à certains utilisateurs, indépendamment de leur rôle.' : 'Un administrateur doit créer les groupes de l’organisation.') : 'Modifiez votre recherche pour retrouver un groupe.'}</p>
                    {groups.length === 0 && viewer.canManage && <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Créer un groupe</Button>}
                  </section>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau groupe" description="Nommez le groupe et choisissez les permissions accordées à ses membres. Vous ajouterez les membres ensuite." size="xl">
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium">Nom du groupe
              <input required minLength={2} maxLength={60} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={fieldClass} placeholder="Ex. Relecteurs de publications" autoFocus />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">Description <span className="font-normal text-muted-foreground">(facultatif)</span>
              <input maxLength={300} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={fieldClass} placeholder="Objet du groupe" />
            </label>
          </div>
          <PermissionPicker value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} grantable={grantable} />
          {formError && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{form.permissions.length} permission(s) sélectionnée(s)</p>
            <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button type="submit" disabled={isPending || form.permissions.length === 0}>{isPending ? 'Création…' : 'Créer le groupe'}</Button></div>
          </div>
        </form>
      </Modal>

      {openGroupId && <GroupDetailDialog key={openGroupId} groupId={openGroupId} viewer={viewer} onClose={() => setOpenGroupId(null)} onNotify={notify} onOpenGroup={setOpenGroupId} />}

      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl">{toast}</div>}
    </div>
  )
}
