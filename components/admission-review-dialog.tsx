'use client'

import { useState } from 'react'

import { decideAdmission } from '@/app/actions/admin-access'
import { Button } from '@/components/ui/button'
import { Modal, fieldClass } from '@/components/ui/modal'
import type { ActionResult, AdminAdmission, AdminTeam, AdminViewer } from '@/lib/admin-types'
import { ROLE_LABELS, type RoleKey } from '@/lib/roles'

type Mode = 'approve' | 'reject'

export function AdmissionReviewDialog({ admission, mode, viewer, teams, busy, onClose, run }: {
  admission: AdminAdmission | null
  mode: Mode
  viewer: AdminViewer
  teams: AdminTeam[]
  busy: boolean
  onClose: () => void
  run: (action: () => Promise<ActionResult>) => void
}) {
  if (!admission) return null
  return <ReviewForm key={`${admission.id}-${mode}`} admission={admission} mode={mode} viewer={viewer} teams={teams} busy={busy} onClose={onClose} run={run} />
}

function ReviewForm({ admission, mode, viewer, teams, busy, onClose, run }: {
  admission: AdminAdmission
  mode: Mode
  viewer: AdminViewer
  teams: AdminTeam[]
  busy: boolean
  onClose: () => void
  run: (action: () => Promise<ActionResult>) => void
}) {
  const roles = viewer.assignableRoles.filter((key): key is Exclude<RoleKey, 'admin' | 'super_admin'> => key !== 'admin' && key !== 'super_admin')
  const [role, setRole] = useState<string>(roles.includes(admission.requestedRoleKey as never) ? admission.requestedRoleKey : roles[roles.length - 1] ?? 'reader')
  const [teamId, setTeamId] = useState(admission.declaredTeamId ?? '')
  const [comment, setComment] = useState('')
  const approve = mode === 'approve'

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onClose()
    run(() => decideAdmission(approve
      ? { id: admission.id, decision: 'Approved', role, teamId: viewer.canAdminister ? teamId || null : undefined }
      : { id: admission.id, decision: 'Rejected', comment }))
  }

  return (
    <Modal open onClose={onClose} title={approve ? 'Approuver la demande' : 'Refuser la demande'} description={`${admission.name} · ${admission.email}`}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {approve ? <>
          <div className="rounded-xl bg-muted/60 p-3 text-sm"><p className="text-xs text-muted-foreground">Demande de l’utilisateur</p><p className="mt-1 font-medium">{admission.requestedRole} · équipe {admission.declaredTeam}</p></div>
          <label className="flex flex-col gap-2 text-sm font-medium">Rôle attribué
            <select value={role} onChange={(event) => setRole(event.target.value)} className={fieldClass}>{roles.map((key) => <option key={key} value={key}>{ROLE_LABELS[key]}</option>)}</select>
          </label>
          {viewer.canAdminister ? (
            <label className="flex flex-col gap-2 text-sm font-medium">Équipe
              <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className={fieldClass}><option value="">Aucune équipe</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
            </label>
          ) : <p className="text-sm text-muted-foreground">L’utilisateur sera rattaché à votre équipe.</p>}
        </> : (
          <label className="flex flex-col gap-2 text-sm font-medium">Motif du refus
            <textarea required minLength={3} maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ce commentaire sera communiqué à l’utilisateur par e-mail." className="min-h-28 resize-y rounded-xl border bg-background p-3 text-sm font-normal leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
          </label>
        )}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Annuler</Button><Button type="submit" variant={approve ? 'default' : 'destructive'} disabled={busy}>{approve ? 'Approuver' : 'Refuser la demande'}</Button></div>
      </form>
    </Modal>
  )
}
