import { ExternalLink, Gauge, Link2, Timer } from 'lucide-react'

import { CheckIcon, formatBytes, formatDuration, formatSampleDate } from '@/components/connector-ui'
import type { TestOutcome } from '@/lib/connector-types'
import { cn } from '@/lib/utils'

const TONE = {
  success: { label: 'Test réussi', className: 'border-primary/30 bg-primary/5 text-primary' },
  warning: { label: 'Réussi avec réserves', className: 'border-chart-4/40 bg-chart-4/10 text-foreground' },
  error: { label: 'Test échoué', className: 'border-destructive/30 bg-destructive/5 text-destructive' },
} as const

type Props = {
  outcome: TestOutcome
  at?: string
  compact?: boolean
}

export function ConnectorTestResult({ outcome, at, compact = false }: Props) {
  const tone = TONE[outcome.status]
  const facts = [
    { icon: Gauge, label: 'HTTP', value: outcome.httpStatus ? String(outcome.httpStatus) : '—' },
    { icon: Timer, label: 'Durée', value: formatDuration(outcome.durationMs) },
    { icon: Link2, label: 'Éléments', value: outcome.itemsFound === null ? '—' : String(outcome.itemsFound) },
  ]

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div className={cn('rounded-2xl border px-4 py-3', tone.className)}>
        <p className="text-xs font-semibold uppercase tracking-wide">{tone.label}{at ? <span className="font-normal normal-case tracking-normal opacity-80"> · {at}</span> : null}</p>
        <p className="mt-1 text-sm font-medium leading-6 text-foreground">{outcome.message}</p>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {facts.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl bg-muted/60 px-3 py-2">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Icon className="size-3.5" aria-hidden />{label}</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <ol className="flex flex-col" aria-label="Étapes du diagnostic">
        {outcome.checks.map((check, index) => (
          <li key={check.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <CheckIcon status={check.status} className="size-[18px] shrink-0" />
              {index < outcome.checks.length - 1 && <span className="my-1 w-px flex-1 bg-border" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <p className="text-sm font-semibold">{check.label}</p>
              <p className={cn('text-[13px] leading-5', check.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{check.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {!compact && (outcome.finalUrl || outcome.contentType || outcome.bytes) && (
        <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          {outcome.finalUrl && <p className="break-all"><span className="font-semibold text-foreground">URL finale</span> · {outcome.finalUrl}</p>}
          <p>{[outcome.contentType, outcome.bytes ? formatBytes(outcome.bytes) : null].filter(Boolean).join(' · ')}</p>
        </div>
      )}

      {outcome.sample.length > 0 && (
        <section aria-label="Aperçu des contenus extraits">
          <h4 className="mb-2 text-sm font-semibold">Aperçu des contenus extraits</h4>
          <ul className="flex flex-col gap-2">
            {outcome.sample.slice(0, compact ? 3 : 5).map((item, index) => (
              <li key={`${item.link}-${index}`} className="rounded-xl border bg-card px-3 py-2.5">
                <p className="line-clamp-2 text-sm font-medium leading-5">{item.title || <span className="text-destructive">Titre manquant</span>}</p>
                {item.summary && !compact && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</p>}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {item.date && <span>{formatSampleDate(item.date)}</span>}
                  {item.link ? (
                    <a href={item.link} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-1 text-primary hover:underline"><ExternalLink className="size-3 shrink-0" aria-hidden /><span className="truncate">{item.link.replace(/^https?:\/\//, '')}</span></a>
                  ) : <span className="text-destructive">Lien manquant</span>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
