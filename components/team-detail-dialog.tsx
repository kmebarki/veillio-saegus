'use client'

import { Archive, ArchiveRestore, Check, Clock3, Crown, History, Mail, Search, ShieldCheck, Trash2, UserMinus, UserPlus, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import { addTeamMembers, archiveTeam, deleteTeam, getTeamDetail, removeTeamMember, restoreTeam, setTeamLead, updateTeam } from '@/app/actions/teams'
import { Button } from '@/components/ui/button'
import { Modal, fieldClass } from '@/components/ui/modal'
import { UserAvatar } from '@/components/user-avatar'
import type { TeamDetail, TeamViewer } from '@/lib/team-types'
import { cn } from '@/lib/utils'

type Tab = 'members' | 'pending' | 'settings' | 'history'
type Result = { ok: boolean; message: string }

type Props = {
  teamId: string
  viewer: TeamViewer
  onClose: () => void
  onNotify: (message: string) => void
}

export function TeamDetailDialog({ teamId, viewer, onClose, onNotify }: Props) {
  const router = useRouter()
  const [detail, setDetail] = useState<TeamDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('members')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [form, setForm] = useState({ name: '', description: '' })

  useEffect(() => {
    let cancelled = false
    getTeamDetail({ id: teamId })
      .then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setLoadError(result.message)
          return
        }
        setLoadError('')
        setDetail(result.detail)
        setForm({ name: result.detail.team.name, description: result.detail.team.description })
      })
      .catch(() => !cancelled && setLoadError('Impossible de charger cette équipe.'))
    return () => {
      cancelled = true
    }
  }, [teamId, reloadKey])

  const run = useCallback(
    (action: () => Promise<Result>, after?: (result: Result) => void) => {
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

  const candidates = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase()
    return (detail?.candidates ?? []).filter((candidate) => !needle || `${candidate.name} ${candidate.email}`.toLowerCase().includes(needle))
  }, [detail, pickerQuery])

  const team = detail?.team
  const canEdit = viewer.canAdminister && !!team && !team.archived
  const pendingCount = (detail?.admissions.length ?? 0) + (detail?.invitations.length ?? 0)

  const tabs: { id: Tab; label: string; icon: typeof Users; count?: number }[] = [
    { id: 'members', label: 'Membres', icon: Users, count: detail?.members.length },
    { id: 'pending', label: 'En attente', icon: Clock3, count: pendingCount },
    ...(viewer.canAdminister ? [{ id: 'settings' as const, label: 'Paramètres', icon: ShieldCheck }] : []),
    { id: 'history', label: 'Historique', icon: History },
  ]

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }

  return (
    <Modal open onClose={onClose} title={team?.name ?? 'Équipe'} description={team ? undefined : 'Chargement…'} size="xl">
      {loadError ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">{loadError}</p>
      ) : !detail || !team ? (
        <div className="flex flex-col gap-3" aria-busy="true"><div className="h-16 animate-pulse rounded-2xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {team.archived && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">Archivée</span>}
            <span className="flex items-center gap-1.5"><Users className="size-4" />{team.activeMemberCount} actif(s) sur {team.memberCount}</span>
            <span className="flex items-center gap-1.5"><Crown className="size-4" />{team.leadName ?? 'Aucun responsable'}</span>
            <span>Créée le {team.createdAt}</span>
          </div>
          {team.description && <p className="text-sm leading-6 text-muted-foreground">{team.description}</p>}

          <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Sections de l’équipe">
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
                            {candidate.teamName && <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">Actuellement : {candidate.teamName}</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Un utilisateur déjà rattaché à une autre équipe sera déplacé.</p>
                    <Button disabled={selected.length === 0 || isPending} onClick={() => run(() => addTeamMembers({ teamId, userIds: selected }), () => { setSelected([]); setPicker(false) })}>{isPending ? 'Ajout…' : `Ajouter (${selected.length})`}</Button>
                  </div>
                </div>
              )}

              {detail.members.length === 0 ? (
                <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Cette équipe n’a pas encore de membre.</p>
              ) : (
                <ul className="divide-y rounded-2xl border">
                  {detail.members.map((member) => (
                    <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <UserAvatar initials={member.initials} image={member.image} name={member.name} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">{member.name}{member.isLead && <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"><Crown className="size-3" />Responsable</span>}</p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <span className="hidden text-xs text-muted-foreground sm:block">{member.role}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', member.status === 'Actif' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground')}>{member.status}</span>
                      <span className="hidden w-36 text-right text-xs text-muted-foreground md:block">{member.lastSeen}</span>
                      {canEdit && member.manageable && (
                        confirm === `remove:${member.id}` ? (
                          <span className="flex items-center gap-1">
                            <Button size="sm" variant="destructive" disabled={isPending} onClick={() => run(() => removeTeamMember({ teamId, userId: member.id }))}>Retirer</Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Annuler</Button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            {member.status === 'Actif' && (
                              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => setTeamLead({ teamId, userId: member.isLead ? null : member.id }))}>
                                <Crown data-icon="inline-start" />{member.isLead ? 'Retirer le rôle' : 'Responsable'}
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" aria-label={`Retirer ${member.name} de l’équipe`} onClick={() => setConfirm(`remove:${member.id}`)}><UserMinus /></Button>
                          </span>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'pending' && (
            <div className="flex flex-col gap-5" role="tabpanel">
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Demandes d’admission ({detail.admissions.length})</h3>
                {detail.admissions.length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande en attente.</p> : (
                  <ul className="divide-y rounded-2xl border">
                    {detail.admissions.map((admission) => (
                      <li key={admission.id} className="flex flex-col gap-1 px-4 py-3">
                        <div className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{admission.initials}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{admission.name}</p><p className="truncate text-xs text-muted-foreground">{admission.email}</p></div><span className="text-xs text-muted-foreground">{admission.requestedRole} · {admission.requestedAt}</span></div>
                        {admission.message && <p className="pl-11 text-sm text-muted-foreground">« {admission.message} »</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {detail.admissions.length > 0 && <p className="text-xs text-muted-foreground">Traitez ces demandes depuis le module Utilisateurs et admissions.</p>}
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Invitations envoyées ({detail.invitations.length})</h3>
                {detail.invitations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune invitation en attente.</p> : (
                  <ul className="divide-y rounded-2xl border">
                    {detail.invitations.map((invitation) => (
                      <li key={invitation.id} className="flex items-center gap-3 px-4 py-3"><Mail className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invitation.name}</p><p className="truncate text-xs text-muted-foreground">{invitation.email}</p></div><span className="text-xs text-muted-foreground">{invitation.role} · expire le {invitation.expiresAt}</span></li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === 'settings' && viewer.canAdminister && (
            <div className="flex flex-col gap-6" role="tabpanel">
              <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); run(() => updateTeam({ id: teamId, ...form })) }}>
                <label className="flex flex-col gap-2 text-sm font-medium">Nom de l’équipe
                  <input required minLength={2} maxLength={80} disabled={team.archived} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={fieldClass} />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">Description
                  <textarea maxLength={400} rows={3} disabled={team.archived} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={cn(fieldClass, 'h-auto resize-none py-2.5 leading-6')} />
                  <span className="text-right text-xs font-normal text-muted-foreground">{form.description.length}/400</span>
                </label>
                {!team.archived && <div className="flex justify-end"><Button type="submit" disabled={isPending}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</Button></div>}
              </form>

              <section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 p-4">
                <h3 className="text-sm font-semibold">Zone sensible</h3>
                {team.archived ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">Restaurer l’équipe la rend de nouveau disponible pour les admissions.</p>
                      <Button variant="outline" disabled={isPending} onClick={() => run(() => restoreTeam({ id: teamId }))}><ArchiveRestore data-icon="inline-start" />Restaurer</Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                      <p className="text-sm text-muted-foreground">Suppression définitive possible uniquement si l’équipe n’a plus de membre.</p>
                      {confirm === 'delete' ? (
                        <span className="flex gap-1"><Button variant="destructive" disabled={isPending} onClick={() => run(() => deleteTeam({ id: teamId }), onClose)}>Confirmer la suppression</Button><Button variant="ghost" onClick={() => setConfirm(null)}>Annuler</Button></span>
                      ) : (
                        <Button variant="destructive" onClick={() => setConfirm('delete')}><Trash2 data-icon="inline-start" />Supprimer</Button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Une équipe archivée n’est plus proposée aux nouvelles admissions. Ses membres sont conservés.</p>
                    {confirm === 'archive' ? (
                      <span className="flex gap-1"><Button variant="destructive" disabled={isPending} onClick={() => run(() => archiveTeam({ id: teamId }))}>Confirmer l’archivage</Button><Button variant="ghost" onClick={() => setConfirm(null)}>Annuler</Button></span>
                    ) : (
                      <Button variant="outline" onClick={() => setConfirm('archive')}><Archive data-icon="inline-start" />Archiver</Button>
                    )}
                  </div>
                )}
              </section>
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
