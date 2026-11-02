'use client'

import { Check, Copy, History, KeyRound, Search, Settings2, Trash2, UserMinus, UserPlus, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import { addGroupMembers, deleteGroup, duplicateGroup, getGroupDetail, removeGroupMember, updateGroup } from '@/app/actions/groups'
import { PermissionPicker } from '@/components/permission-picker'
import { Button } from '@/components/ui/button'
import { Modal, fieldClass } from '@/components/ui/modal'
import { UserAvatar } from '@/components/user-avatar'
import type { GroupDetail, GroupViewer } from '@/lib/group-types'
import { cn } from '@/lib/utils'

type Tab = 'permissions' | 'members' | 'settings' | 'history'
type Result = { ok: boolean; message: string }

type Props = {
  groupId: string
  viewer: GroupViewer
  onClose: () => void
  onNotify: (message: string) => void
  onOpenGroup: (id: string) => void
}

export function GroupDetailDialog({ groupId, viewer, onClose, onNotify, onOpenGroup }: Props) {
  const router = useRouter()
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState<Tab>('permissions')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState({ name: '', description: '', permissions: [] as string[] })
  const [picker, setPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    getGroupDetail({ id: groupId })
      .then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setLoadError(result.message)
          return
        }
        setLoadError('')
        setDetail(result.detail)
        setDraft({ name: result.detail.group.name, description: result.detail.group.description, permissions: result.detail.group.permissions })
      })
      .catch(() => !cancelled && setLoadError('Impossible de charger ce groupe.'))
    return () => {
      cancelled = true
    }
  }, [groupId, reloadKey])

  const run = useCallback(
    (action: () => Promise<Result & { id?: string }>, after?: (result: Result & { id?: string }) => void) => {
      setError('')
      startTransition(async () => {
        const result = await action()
        if (!result.ok) {
          setError(result.message)
          setConfirm(null)
          return
        }
        onNotify(result.message)
        setConfirm(null)
        setReloadKey((key) => key + 1)
        router.refresh()
        after?.(result)
      })
    },
    [onNotify, router],
  )

  const group = detail?.group
  const canEdit = viewer.canManage && !!group?.editable
  const dirty = useMemo(() => {
    if (!group) return false
    return draft.name.trim() !== group.name || draft.description.trim() !== group.description || draft.permissions.join('|') !== group.permissions.join('|')
  }, [draft, group])

  const candidates = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase()
    return (detail?.candidates ?? []).filter((candidate) => !needle || `${candidate.name} ${candidate.email}`.toLowerCase().includes(needle))
  }, [detail, pickerQuery])

  const tabs: { id: Tab; label: string; icon: typeof Users; count?: number }[] = [
    { id: 'permissions', label: 'Permissions', icon: KeyRound, count: group?.permissions.length },
    { id: 'members', label: 'Membres', icon: Users, count: detail?.members.length },
    ...(viewer.canManage ? [{ id: 'settings' as const, label: 'Paramètres', icon: Settings2 }] : []),
    { id: 'history', label: 'Historique', icon: History },
  ]

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  function save() {
    if (!group) return
    run(() => updateGroup({ id: group.id, version: group.version, name: draft.name, description: draft.description, permissions: draft.permissions }))
  }

  return (
    <Modal open onClose={onClose} title={group?.name ?? 'Groupe'} description={group ? undefined : 'Chargement…'} size="xl">
      {loadError ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">{loadError}</p>
      ) : !detail || !group ? (
        <div className="flex flex-col gap-3" aria-busy="true"><div className="h-16 animate-pulse rounded-2xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><KeyRound className="size-4" />{group.permissions.length} permission(s)</span>
            <span className="flex items-center gap-1.5"><Users className="size-4" />{group.memberCount} membre(s)</span>
            <span>Créé le {group.createdAt}</span>
            <span>Mis à jour le {group.updatedAt}</span>
          </div>
          {group.description && <p className="text-sm leading-6 text-muted-foreground">{group.description}</p>}
          {group.lockedReason && <p role="note" className="rounded-xl bg-secondary px-3 py-2 text-sm text-secondary-foreground">{group.lockedReason} Ce groupe est affiché en lecture seule.</p>}

          <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Sections du groupe">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn('-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors', tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                <Icon className="size-4" />{label}
                {typeof count === 'number' && count > 0 && <span className="rounded-full bg-secondary px-1.5 text-xs font-semibold text-secondary-foreground">{count}</span>}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          {dirty && canEdit && (tab === 'permissions' || tab === 'settings') && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
              <p className="text-sm font-medium text-primary">Modifications non enregistrées. Elles s’appliquent immédiatement aux membres.</p>
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setDraft({ name: group.name, description: group.description, permissions: group.permissions })}>Annuler</Button>
                <Button size="sm" disabled={isPending || draft.permissions.length === 0} onClick={save}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
              </span>
            </div>
          )}

          {tab === 'permissions' && (
            <div role="tabpanel">
              <PermissionPicker value={draft.permissions} onChange={(permissions) => setDraft((current) => ({ ...current, permissions }))} grantable={detail.grantable} disabled={!canEdit} />
            </div>
          )}

          {tab === 'members' && (
            <div className="flex flex-col gap-3" role="tabpanel">
              {canEdit && (
                <div className="flex justify-end">
                  <Button variant={picker ? 'outline' : 'default'} onClick={() => { setPicker((value) => !value); setSelected([]); setPickerQuery('') }}><UserPlus data-icon="inline-start" />{picker ? 'Fermer' : 'Ajouter des membres'}</Button>
                </div>
              )}

              {picker && canEdit && (
                <div className="flex flex-col gap-3 rounded-2xl border bg-muted/40 p-4">
                  <label className="relative">
                    <span className="sr-only">Rechercher un utilisateur</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} className={cn(fieldClass, 'h-10 pl-9')} placeholder="Rechercher par nom ou e-mail" />
                  </label>
                  <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                    {candidates.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted-foreground">Aucun utilisateur disponible.</li>}
                    {candidates.map((candidate) => {
                      const checked = selected.includes(candidate.id)
                      return (
                        <li key={candidate.id}>
                          <button type="button" onClick={() => toggle(candidate.id)} aria-pressed={checked} className={cn('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-card', checked && 'bg-card')}>
                            <span className={cn('grid size-5 shrink-0 place-items-center rounded-md border', checked && 'border-primary bg-primary text-primary-foreground')}>{checked && <Check className="size-3.5" />}</span>
                            <UserAvatar initials={candidate.initials} image={candidate.image} name={candidate.name} />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{candidate.name}</span><span className="block truncate text-xs text-muted-foreground">{candidate.email}</span></span>
                            <span className="shrink-0 text-xs text-muted-foreground">{candidate.role}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Les super administrateurs disposent déjà de toutes les permissions.</p>
                    <Button disabled={selected.length === 0 || isPending} onClick={() => run(() => addGroupMembers({ groupId, userIds: selected }), () => { setSelected([]); setPicker(false) })}>{isPending ? 'Ajout…' : `Ajouter (${selected.length})`}</Button>
                  </div>
                </div>
              )}

              {detail.members.length === 0 ? (
                <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Aucun membre. Ajoutez des utilisateurs pour leur accorder les permissions de ce groupe.</p>
              ) : (
                <ul className="divide-y rounded-2xl border">
                  {detail.members.map((member) => (
                    <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <UserAvatar initials={member.initials} image={member.image} name={member.name} />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.name}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p></div>
                      <span className="hidden text-xs text-muted-foreground sm:block">{member.role}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', member.status === 'Actif' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground')}>{member.status}</span>
                      <span className="hidden text-xs text-muted-foreground md:block">Depuis le {member.addedAt}</span>
                      {canEdit && member.removable && (
                        confirm === `remove:${member.id}` ? (
                          <span className="flex items-center gap-1">
                            <Button size="sm" variant="destructive" disabled={isPending} onClick={() => run(() => removeGroupMember({ groupId, userId: member.id }))}>Retirer</Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Annuler</Button>
                          </span>
                        ) : (
                          <Button size="icon" variant="ghost" aria-label={`Retirer ${member.name} du groupe`} onClick={() => setConfirm(`remove:${member.id}`)}><UserMinus /></Button>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'settings' && viewer.canManage && (
            <div className="flex flex-col gap-6" role="tabpanel">
              <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); save() }}>
                <label className="flex flex-col gap-2 text-sm font-medium">Nom du groupe
                  <input required minLength={2} maxLength={60} disabled={!canEdit} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={fieldClass} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">Description
                  <textarea maxLength={300} rows={3} disabled={!canEdit} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={cn(fieldClass, 'h-auto resize-none py-2.5 leading-6')} />
                  <span className="text-right text-xs font-normal text-muted-foreground">{draft.description.length}/300</span>
                </label>
                {canEdit && <div className="flex justify-end"><Button type="submit" disabled={isPending || !dirty}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</Button></div>}
              </form>

              <section className="flex flex-col gap-3 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Créer un nouveau groupe avec les mêmes permissions, sans ses membres.</p>
                  <Button variant="outline" disabled={isPending} onClick={() => run(() => duplicateGroup({ id: groupId }), (result) => result.id && onOpenGroup(result.id))}><Copy data-icon="inline-start" />Dupliquer</Button>
                </div>
              </section>

              {canEdit && (
                <section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 p-4">
                  <h3 className="text-sm font-semibold">Zone sensible</h3>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">La suppression est définitive. Les {group.memberCount} membre(s) perdent immédiatement les permissions de ce groupe.</p>
                    {confirm === 'delete' ? (
                      <span className="flex gap-1"><Button variant="destructive" disabled={isPending} onClick={() => run(() => deleteGroup({ id: groupId }), onClose)}>Confirmer la suppression</Button><Button variant="ghost" onClick={() => setConfirm(null)}>Annuler</Button></span>
                    ) : (
                      <Button variant="destructive" onClick={() => setConfirm('delete')}><Trash2 data-icon="inline-start" />Supprimer</Button>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div role="tabpanel">
              {detail.history.length === 0 ? <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Aucun événement enregistré.</p> : (
                <ol className="flex flex-col gap-3">
                  {detail.history.map((entry) => (
                    <li key={entry.id} className="flex gap-3 text-sm">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                      <div className="min-w-0 flex-1"><p className="font-medium">{entry.label}{entry.detail && <span className="font-normal text-muted-foreground"> · {entry.detail}</span>}</p><p className="text-xs text-muted-foreground">Par {entry.actor} · {entry.at}</p></div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
