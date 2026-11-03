import { CalendarClock, Pencil, PlugZap, Trash2 } from 'lucide-react'

import { ageLabel, expiryBadge, TONE_CLASSES } from '@/components/connections/helpers'
import { RequestPreview } from '@/components/connections/request-preview'
import { ConnectorLogo, HealthDot } from '@/components/connector-ui'
import { Button } from '@/components/ui/button'
import type { ConnectionActivityEntry, ConnectionSummary } from '@/lib/connection-types'
import { AUTH_LABELS, type AuthType } from '@/lib/connector-catalog'
import { cn } from '@/lib/utils'

type Props = {
  connection: ConnectionSummary
  activity: ConnectionActivityEntry[] | null
  busy: boolean
  onEdit: () => void
  onTest: () => void
  onDelete: () => void
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  )
}

export function ConnectionDetail({ connection, activity, busy, onEdit, onTest, onDelete }: Props) {
  const expiry = expiryBadge(connection)
  const authType = connection.authType as AuthType

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex items-center gap-3">
          <ConnectorLogo kind={connection.connectorKind} logoUrl={connection.logoUrl || connection.connectorLogoUrl} className="size-12 rounded-xl" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{connection.connectorName}</p>
            <p className="truncate text-xs text-muted-foreground">{connection.host || connection.connectorUrl}</p>
          </div>
          <div className="ml-auto"><HealthDot connector={connection} /></div>
        </div>

        {connection.description && <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm leading-6 text-muted-foreground">{connection.description}</p>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl border p-4 sm:grid-cols-3">
          <Fact label="Authentification">{AUTH_LABELS[authType]?.label.split(' (')[0] ?? 'Clé API'}</Fact>
          {(authType === 'api_key_header' || authType === 'api_key_query') && <Fact label={authType === 'api_key_header' ? 'En-tête' : 'Paramètre'}><span className="font-mono">{connection.keyName}</span></Fact>}
          {connection.username && <Fact label="Identifiant">{connection.username}</Fact>}
          <Fact label="Portée">{connection.scope === 'private' ? `Privée · ${connection.ownerName}` : connection.scope === 'public' ? 'Publique' : 'Organisationnelle'}</Fact>
          <Fact label="Méthode"><span className="font-mono">{connection.methodId}@{connection.methodVersion}</span></Fact>
          <Fact label="Adaptateur"><span className="font-mono">{connection.adapterId}@{connection.adapterVersion}</span></Fact>
          <Fact label="Secret"><span className="font-mono">{connection.secretHint ?? 'Chiffré'}</span></Fact>
          <Fact label="Dernière rotation">{connection.secretRotatedAt} ({ageLabel(connection.secretAgeDays)})</Fact>
          <Fact label="Expiration">{expiry ? <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs', TONE_CLASSES[expiry.tone])}><CalendarClock className="size-3" aria-hidden />{expiry.label}</span> : 'Non définie'}</Fact>
          <Fact label="Créée le">{connection.createdAt}</Fact>
          <Fact label="Révision">v{connection.version}</Fact>
        </dl>

        <section aria-label="Dernier test" className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dernier test</h3>
          <p className="text-sm leading-6 text-muted-foreground">{connection.lastCheckMessage ? `${connection.lastCheckMessage}${connection.lastCheckAt ? ` (${connection.lastCheckAt})` : ''}` : 'Cette connexion n’a pas encore été testée.'}</p>
          {connection.lastCheckMessage && !connection.testedCurrentVersion && <p className="text-xs font-medium text-foreground">Les identifiants ont changé depuis : relancez un test.</p>}
        </section>

        {connection.canEdit && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" disabled={busy} onClick={onTest}><PlugZap data-icon="inline-start" />{busy ? 'Test en cours…' : 'Tester la connexion'}</Button>
            <Button variant="outline" disabled={busy} onClick={onEdit}><Pencil data-icon="inline-start" />Modifier</Button>
            <Button variant="ghost" disabled={busy} onClick={onDelete} className="ml-auto text-destructive hover:text-destructive"><Trash2 data-icon="inline-start" />Supprimer</Button>
          </div>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-6 self-start rounded-2xl border bg-muted/30 p-4">
        <RequestPreview authType={authType} keyName={connection.keyName} username={connection.username} connectorUrl={connection.connectorUrl} insecure={connection.insecure} />
        <section aria-label="Activité" className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activité récente</h3>
          {activity === null ? (
            <p className="text-xs text-muted-foreground">Chargement…</p>
          ) : activity.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun événement enregistré.</p>
          ) : (
            <ol className="flex flex-col gap-3 border-l pl-4">
              {activity.map((entry) => (
                <li key={entry.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                  <p className="text-sm font-medium">{entry.label}{entry.detail ? <span className="font-normal text-muted-foreground"> · {entry.detail}</span> : null}</p>
                  <p className="text-xs text-muted-foreground">{entry.actor} · {entry.at}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  )
}
