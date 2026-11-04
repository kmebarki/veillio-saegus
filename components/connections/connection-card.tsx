import { Archive, CalendarClock, Globe2, KeyRound, Pencil, PlugZap, ShieldAlert, User, Users } from 'lucide-react'

import { ageLabel, expiryBadge, STALE_SECRET_DAYS, TONE_CLASSES } from '@/components/connections/helpers'
import { ConnectorLogo, HealthDot } from '@/components/connector-ui'
import { Button } from '@/components/ui/button'
import type { ConnectionSummary } from '@/lib/connection-types'
import { AUTH_LABELS, type AuthType } from '@/lib/connector-catalog'
import { cn } from '@/lib/utils'

type Props = { connection: ConnectionSummary; busy: boolean; onOpen: () => void; onEdit: () => void; onTest: () => void; onDelete: () => void }

export function ConnectionCard({ connection, busy, onOpen, onEdit, onTest, onDelete }: Props) {
  const isPrivate = connection.scope === 'private'
  const isPublic = connection.scope === 'public'
  const expiry = expiryBadge(connection)
  const stale = connection.secretAgeDays >= STALE_SECRET_DAYS
  const authLabel = AUTH_LABELS[connection.authType as AuthType]?.label.split(' (')[0] ?? 'Clé API'

  return (
    <article className="group relative flex flex-col gap-4 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <ConnectorLogo kind={connection.connectorKind} logoUrl={connection.logoUrl || connection.connectorLogoUrl} className="size-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-[-0.02em]">
            <button type="button" onClick={onOpen} className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{connection.name}</button>
          </h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{connection.connectorName} · {authLabel}</p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', isPrivate ? 'bg-secondary text-secondary-foreground' : 'bg-primary/10 text-primary')}>
          {isPrivate ? <User className="size-3.5" aria-hidden /> : isPublic ? <Globe2 className="size-3.5" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
          {isPrivate ? 'Privée' : isPublic ? 'Publique' : 'Organisationnelle'}
        </span>
      </div>

      <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
        <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm tracking-wider">{connection.hasSecret ? `••••••••${connection.secretHint ? ` ${connection.secretHint.split(' · ')[0]}` : ''}` : 'Secret non renseigné'}</p>
          <p className={cn('text-xs', stale ? 'font-medium text-foreground' : 'text-muted-foreground')}>Mis à jour {ageLabel(connection.secretAgeDays)}{stale ? ' · à renouveler' : ''}</p>
        </div>
        {connection.insecure && <span title="Le connecteur utilise http:// : le secret circule en clair" className="grid size-7 place-items-center rounded-full bg-destructive/10 text-destructive"><ShieldAlert className="size-4" aria-label="Connexion non chiffrée (http)" /></span>}
      </div>

      {(expiry || connection.username) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {expiry && <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium', TONE_CLASSES[expiry.tone])}><CalendarClock className="size-3.5" aria-hidden />{expiry.label}</span>}
          {connection.username && <span className="truncate rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">{connection.username}</span>}
        </div>
      )}

      <div className="flex flex-col gap-1 border-t pt-3">
        <HealthDot connector={connection} />
        <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">{connection.lastCheckMessage ?? 'Testez la connexion pour vérifier les identifiants.'}{connection.lastCheckAt ? ` (${connection.lastCheckAt})` : ''}</p>
      </div>

      {(connection.canTest || connection.canEdit || connection.canArchive) && (
        <div className="relative z-10 flex flex-wrap gap-2">
          {connection.canTest && <Button size="sm" variant="outline" disabled={busy} onClick={onTest}><PlugZap data-icon="inline-start" />{busy ? 'Test…' : 'Tester'}</Button>}
          {connection.canEdit && <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit}><Pencil data-icon="inline-start" />Modifier</Button>}
          {connection.canArchive && <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete} className="ml-auto text-destructive hover:text-destructive"><Archive data-icon="inline-start" />Archiver</Button>}
        </div>
      )}
    </article>
  )
}
