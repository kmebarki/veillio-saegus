import { Braces, CircleAlert, CircleCheck, CircleDashed, CirclePause, Cloud, Globe, Mail, Rss, TriangleAlert, Webhook } from 'lucide-react'

import type { ConnectorHealth, ConnectorKind, ConnectorStatus } from '@/lib/connector-catalog'
import type { ConnectorSummary } from '@/lib/connector-types'
import { cn } from '@/lib/utils'

export const KIND_ICONS: Record<ConnectorKind, typeof Rss> = { rss: Rss, web: Globe, api: Braces, imap: Mail, webhook: Webhook, m365: Cloud }

export function KindIcon({ kind, className }: { kind: ConnectorKind; className?: string }) {
  const Icon = KIND_ICONS[kind]
  return <Icon className={className} aria-hidden />
}

export function ConnectorLogo({ kind, logoUrl, className }: { kind: ConnectorKind; logoUrl?: string; className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden border bg-card', logoUrl ? 'p-1.5' : 'bg-primary/10 text-primary', className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-contain" />
      ) : (
        <KindIcon kind={kind} className="size-1/2" />
      )}
    </span>
  )
}

const STATUS_STYLES: Record<ConnectorStatus, { label: string; className: string; icon: typeof CircleCheck }> = {
  active: { label: 'Actif', className: 'bg-primary/10 text-primary', icon: CircleCheck },
  paused: { label: 'En pause', className: 'bg-secondary text-secondary-foreground', icon: CirclePause },
  draft: { label: 'Brouillon', className: 'bg-muted text-muted-foreground', icon: CircleDashed },
}

export function StatusBadge({ status }: { status: ConnectorStatus }) {
  const { label, className, icon: Icon } = STATUS_STYLES[status]
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', className)}><Icon className="size-3.5" aria-hidden />{label}</span>
}

const HEALTH_STYLES: Record<ConnectorHealth, { label: string; dot: string; text: string }> = {
  ok: { label: 'Connexion saine', dot: 'bg-primary', text: 'text-foreground' },
  warning: { label: 'Points d’attention', dot: 'bg-chart-4', text: 'text-foreground' },
  error: { label: 'En erreur', dot: 'bg-destructive', text: 'text-destructive' },
  unknown: { label: 'Jamais testé', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
}

export function healthLabel(connector: Pick<ConnectorSummary, 'health' | 'testedCurrentVersion'>) {
  if (connector.health !== 'unknown' && !connector.testedCurrentVersion) return 'À retester'
  return HEALTH_STYLES[connector.health].label
}

export function HealthDot({ connector, withLabel = true }: { connector: Pick<ConnectorSummary, 'health' | 'testedCurrentVersion'>; withLabel?: boolean }) {
  const stale = connector.health !== 'unknown' && !connector.testedCurrentVersion
  const style = HEALTH_STYLES[connector.health]
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-medium', stale ? 'text-muted-foreground' : style.text)}>
      <span className="relative flex size-2.5" aria-hidden>
        {connector.health === 'ok' && !stale && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" />}
        <span className={cn('relative inline-flex size-2.5 rounded-full', stale ? 'bg-chart-4' : style.dot)} />
      </span>
      {withLabel ? healthLabel(connector) : <span className="sr-only">{healthLabel(connector)}</span>}
    </span>
  )
}

export function CheckIcon({ status, className }: { status: 'ok' | 'warning' | 'error' | 'skipped'; className?: string }) {
  if (status === 'ok') return <CircleCheck className={cn('text-primary', className)} aria-label="Réussi" />
  if (status === 'warning') return <TriangleAlert className={cn('text-chart-4', className)} aria-label="Attention" />
  if (status === 'error') return <CircleAlert className={cn('text-destructive', className)} aria-label="Échec" />
  return <CircleDashed className={cn('text-muted-foreground/60', className)} aria-label="Non évalué" />
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return '—'
  return bytes < 1024 ? `${bytes} o` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return '—'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

export function formatSampleDate(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date)
}
