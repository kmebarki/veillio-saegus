'use client'

import { ChevronRight, Lock, Search, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'

import { inputClass } from '@/components/connections/helpers'
import { ConnectorLogo } from '@/components/connector-ui'
import type { ConnectorChoice } from '@/lib/connection-types'
import { AUTH_LABELS, CONNECTOR_CATALOG, type AuthType, type ConnectorKind } from '@/lib/connector-catalog'
import { cn } from '@/lib/utils'

type Props = { connectors: ConnectorChoice[]; value: string; onSelect: (id: string) => void }

const kindLabel = (kind: ConnectorKind) => CONNECTOR_CATALOG.find((item) => item.kind === kind)?.label ?? kind
const authLabel = (type: string) => AUTH_LABELS[type as AuthType]?.label.split(' (')[0] ?? 'Clé API'

export function ConnectorPicker({ connectors, value, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<ConnectorKind | 'all' | 'uncovered'>('all')

  const usable = useMemo(() => connectors.filter((item) => item.requiresAuth), [connectors])
  const withoutAuth = connectors.length - usable.length
  const kinds = useMemo(() => Array.from(new Set(usable.map((item) => item.kind))), [usable])
  const uncoveredCount = useMemo(() => usable.filter((item) => item.sharedCount === 0).length, [usable])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return usable
      .filter((item) => (kind === 'all' ? true : kind === 'uncovered' ? item.sharedCount === 0 : item.kind === kind))
      .filter((item) => !needle || `${item.name} ${item.host} ${kindLabel(item.kind)}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(a.sharedCount > 0) - Number(b.sharedCount > 0) || a.name.localeCompare(b.name, 'fr'))
  }, [usable, query, kind])

  const chips: { id: ConnectorKind | 'all' | 'uncovered'; label: string; count: number }[] = [
    { id: 'all', label: 'Tous', count: usable.length },
    ...(uncoveredCount > 0 ? [{ id: 'uncovered' as const, label: 'Sans connexion partagée', count: uncoveredCount }] : []),
    ...kinds.map((item) => ({ id: item, label: kindLabel(item), count: usable.filter((connector) => connector.kind === item).length })),
  ]

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Rechercher un connecteur</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className={cn(inputClass, 'pl-9')} placeholder={`Rechercher parmi ${usable.length} connecteur${usable.length > 1 ? 's' : ''} (nom, hôte, type)`} />
      </label>

      {chips.length > 2 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrer par type">
          {chips.map((chip) => (
            <button key={chip.id} type="button" aria-pressed={kind === chip.id} onClick={() => setKind(chip.id)} className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors', kind === chip.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>
              {chip.label}<span className={kind === chip.id ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}>{chip.count}</span>
            </button>
          ))}
        </div>
      )}

      {results.length > 0 ? (
        <ul role="listbox" aria-label="Connecteurs" className="max-h-[min(52vh,420px)] divide-y overflow-y-auto rounded-xl border bg-card">
          {results.map((item) => {
            const selected = item.id === value
            return (
              <li key={item.id} role="option" aria-selected={selected}>
                <button type="button" onClick={() => onSelect(item.id)} className={cn('group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none', selected && 'bg-primary/5')}>
                  <ConnectorLogo kind={item.kind} logoUrl={item.logoUrl} className="size-9 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.host || 'URL à renseigner'} · {kindLabel(item.kind)} · {authLabel(item.authType)}</span>
                  </span>
                  <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-block', item.sharedCount > 0 ? 'bg-muted text-muted-foreground' : 'bg-chart-4/15 text-foreground')}>
                    {item.sharedCount > 0 ? `${item.sharedCount} partagée${item.sharedCount > 1 ? 's' : ''}` : 'Aucune partagée'}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Aucun connecteur ne correspond</p>
          <button type="button" onClick={() => { setQuery(''); setKind('all') }} className="text-xs font-medium text-primary underline-offset-4 hover:underline">Réinitialiser la recherche</button>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{results.length} sur {usable.length} affiché{results.length > 1 ? 's' : ''}</span>
        {withoutAuth > 0 && <span className="inline-flex items-center gap-1"><Lock className="size-3" aria-hidden />· {withoutAuth} connecteur{withoutAuth > 1 ? 's' : ''} sans authentification (aucune connexion nécessaire)</span>}
      </p>
    </div>
  )
}
