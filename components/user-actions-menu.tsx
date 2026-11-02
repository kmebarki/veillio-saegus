'use client'

import { KeyRound, MoreHorizontal, ShieldCheck, UserCog, UserRoundX, UserCheck, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { changeUserRole, changeUserTeam, revokeUserSessions, updateUserStatus } from '@/app/actions/admin-access'
import { Button } from '@/components/ui/button'
import { Modal, fieldClass } from '@/components/ui/modal'
import type { ActionResult, AdminTeam, AdminUser, AdminViewer } from '@/lib/admin-types'
import { ROLE_LABELS, type RoleKey } from '@/lib/roles'

type RunAction = (action: () => Promise<ActionResult>) => void

export function UserActionsMenu({ user, viewer, teams, busy, run }: { user: AdminUser; viewer: AdminViewer; teams: AdminTeam[]; busy: boolean; run: RunAction }) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'role' | 'team' | null>(null)
  const [role, setRole] = useState<RoleKey>(user.roleKey)
  const [teamId, setTeamId] = useState(user.teamId ?? '')
  const container = useRef<HTMLDivElement>(null)
  const isActive = user.status === 'Actif'

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user.manageable) return <span className="text-xs text-muted-foreground">—</span>

  const itemClass = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50'

  return (
    <div ref={container} className="relative inline-block text-left">
      <Button variant="ghost" size="icon" aria-label={`Actions pour ${user.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><MoreHorizontal /></Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-xl border bg-card p-1 shadow-lg">
          <button role="menuitem" className={itemClass} disabled={busy} onClick={() => { setOpen(false); setRole(user.roleKey); setDialog('role') }}><UserCog className="size-4" />Modifier le rôle</button>
          <button role="menuitem" className={itemClass} disabled={busy} onClick={() => { setOpen(false); setTeamId(user.teamId ?? ''); setDialog('team') }}><Users className="size-4" />Changer d’équipe</button>
          <button role="menuitem" className={itemClass} disabled={busy} onClick={() => { setOpen(false); run(() => revokeUserSessions({ userId: user.id })) }}><KeyRound className="size-4" />Révoquer les sessions</button>
          <div className="my-1 h-px bg-border" />
          <button role="menuitem" className={`${itemClass} ${isActive ? 'text-destructive' : ''}`} disabled={busy} onClick={() => { setOpen(false); run(() => updateUserStatus({ userId: user.id, status: isActive ? 'suspended' : 'active' })) }}>{isActive ? <UserRoundX className="size-4" /> : <UserCheck className="size-4" />}{isActive ? 'Suspendre le compte' : 'Réactiver le compte'}</button>
        </div>
      )}

      <Modal open={dialog === 'role'} onClose={() => setDialog(null)} title="Modifier le rôle" description={`Rôle actuel de ${user.name} : ${user.role}.`}>
        <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); setDialog(null); run(() => changeUserRole({ userId: user.id, role })) }}>
          <label className="flex flex-col gap-2 text-sm font-medium">Nouveau rôle
            <select value={role} onChange={(event) => setRole(event.target.value as RoleKey)} className={fieldClass}>
              {viewer.assignableRoles.map((key) => <option key={key} value={key}>{ROLE_LABELS[key]}</option>)}
            </select>
          </label>
          {role === 'super_admin' && user.roleKey !== 'super_admin' && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5 text-destructive"><ShieldCheck className="mt-0.5 size-4 shrink-0" />{user.name} obtiendra tous les droits, y compris les permissions sensibles et la gestion des autres super administrateurs.</p>
          )}
          <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />Le changement s’applique à la prochaine requête de l’utilisateur et est journalisé.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>Annuler</Button><Button type="submit" disabled={busy || role === user.roleKey}>Enregistrer</Button></div>
        </form>
      </Modal>

      <Modal open={dialog === 'team'} onClose={() => setDialog(null)} title="Changer d’équipe" description={`Équipe actuelle de ${user.name} : ${user.team}.`}>
        <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); setDialog(null); run(() => changeUserTeam({ userId: user.id, teamId: teamId || null })) }}>
          <label className="flex flex-col gap-2 text-sm font-medium">Équipe
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)} className={fieldClass}>
              <option value="">Aucune équipe</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialog(null)}>Annuler</Button><Button type="submit" disabled={busy || teamId === (user.teamId ?? '')}>Enregistrer</Button></div>
        </form>
      </Modal>
    </div>
  )
}
