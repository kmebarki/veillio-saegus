import { CheckIcon, formatDuration } from '@/components/connector-ui'
import type { TestOutcome } from '@/lib/connector-types'
import { cn } from '@/lib/utils'

const HEADLINES = {
  success: { label: 'Connexion valide', className: 'border-primary/30 bg-primary/5' },
  warning: { label: 'Connexion établie avec des réserves', className: 'border-chart-4/40 bg-chart-4/10' },
  error: { label: 'Échec de la connexion', className: 'border-destructive/30 bg-destructive/5' },
} as const

export function TestResult({ outcome, compact = false }: { outcome: TestOutcome; compact?: boolean }) {
  const headline = HEADLINES[outcome.status]
  const iconStatus = outcome.status === 'success' ? 'ok' : outcome.status
  return (
    <div role="status" className={cn('flex flex-col gap-3 rounded-2xl border p-4', headline.className)}>
      <div className="flex items-start gap-3">
        <CheckIcon status={iconStatus} className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{headline.label}</p>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{outcome.message}</p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <div className="flex gap-1.5"><dt>HTTP</dt><dd className="font-medium text-foreground">{outcome.httpStatus ?? '—'}</dd></div>
        <div className="flex gap-1.5"><dt>Durée</dt><dd className="font-medium text-foreground">{formatDuration(outcome.durationMs)}</dd></div>
        {outcome.itemsFound !== null && <div className="flex gap-1.5"><dt>Éléments</dt><dd className="font-medium text-foreground">{outcome.itemsFound}</dd></div>}
      </dl>
      {!compact && outcome.checks.length > 0 && (
        <ul className="flex flex-col gap-2 border-t pt-3">
          {outcome.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-sm">
              <CheckIcon status={check.status} className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0"><p className="font-medium">{check.label}</p><p className="break-words text-xs leading-5 text-muted-foreground">{check.detail}</p></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
