'use client'

import { Check, ChevronsUpDown, Lock, Search, SearchX } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'

import { inputClass } from '@/components/connections/helpers'
import { ConnectorLogo } from '@/components/connector-ui'
import type { ConnectorChoice } from '@/lib/connection-types'
import { AUTH_LABELS, CONNECTOR_CATALOG, type AuthType, type ConnectorKind } from '@/lib/connector-catalog'
import { cn } from '@/lib/utils'

type Props = { connectors: ConnectorChoice[]; value: string; onSelect: (id: string) => void }
type KindFilter = ConnectorKind | 'all' | 'uncovered'

const kindLabel = (kind: ConnectorKind) => CONNECTOR_CATALOG.find((item) => item.kind === kind)?.label ?? kind
const authLabel = (type: string) => AUTH_LABELS[type as AuthType]?.label.split(' (')[0] ?? 'Clé API'

export function ConnectorPicker({ connectors, value, onSelect }: Props) {
  const listId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(!value)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [active, setActive] = useState(0)

  const usable = useMemo(() => connectors.filter((item) => item.requiresAuth), [connectors])
  const withoutAuth = connectors.length - usable.length
  const selected = usable.find((item) => item.id === value)
  const kinds = useMemo(() => Array.from(new Set(usable.map((item) => item.kind))), [usable])
  const uncoveredCount = useMemo(() => usable.filter((item) => item.sharedCount === 0).length, [usable])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return usable
      .filter((item) => (kind === 'all' ? true : kind === 'uncovered' ? item.sharedCount === 0 : item.kind === kind))
      .filter((item) => !needle || `${item.name} ${item.host} ${kindLabel(item.kind)}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [usable, query, kind])

  const chips: { id: KindFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Tous', count: usable.length },
    ...(uncoveredCount > 0 && uncoveredCount < usable.length ? [{ id: 'uncovered' as const, label: 'Sans connexion partagée', count: uncoveredCount }] : []),
    ...(kinds.length > 1 ? kinds.map((item) => ({ id: item, label: kindLabel(item), count: usable.filter((connector) => connector.kind === item).length })) : []),
  ]

  function choose(id: string) {
    if (!usable.find((item) => item.id === id)?.runtimeAvailable) return
    onSelect(id)
    setOpen(false)
    setQuery('')
    setKind('all')
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault()
      choose(results[active].id)
    } else if (event.key === 'Escape' && open && selected) {
      event.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-2" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((current) => !current)
          setActive(0)
          window.setTimeout(() => searchRef.current?.focus(), 0)
        }}
        className={cn('flex min-h-14 w-full items-center gap-3 rounded-xl border bg-background px-3 py-2 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30', open && 'border-primary ring-2 ring-primary/15')}
      >
        {selected ? (
          <>
            <ConnectorLogo kind={selected.kind} logoUrl={selected.logoUrl} className="size-9 rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{selected.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{selected.host || 'URL à renseigner'} · {kindLabel(selected.kind)} · {authLabel(selected.authType)}</span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground">Choisir un connecteur parmi {usable.length}…</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 shadow-sm">
          <label className="relative block">
            <span className="sr-only">Rechercher un connecteur</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              className={cn(inputClass, 'pl-9')}
              placeholder="Rechercher par nom, hôte ou type"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
            />
          </label>

          {chips.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrer par type">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={kind === chip.id}
                  onClick={() => {
                    setKind(chip.id)
                    setActive(0)
                  }}
                  className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors', kind === chip.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
                >
                  {chip.label}
                  <span className={kind === chip.id ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}>{chip.count}</span>
                </button>
              ))}
            </div>
          )}

          {results.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Connecteurs" className="max-h-60 overflow-y-auto overscroll-contain rounded-lg">
              {results.map((item, index) => (
                <li key={item.id} role="option" aria-selected={item.id === value}>
                  <button
                    type="button"
                    disabled={!item.runtimeAvailable}
                    onClick={() => choose(item.id)}
                    onMouseEnter={() => setActive(index)}
                    title={item.runtimeAvailable ? undefined : item.runtimeReason}
                    className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50', index === active ? 'bg-muted' : 'hover:bg-muted/60')}
                  >
                    <ConnectorLogo kind={item.kind} logoUrl={item.logoUrl} className="size-8 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.runtimeAvailable ? `${item.host || 'URL à renseigner'} · ${authLabel(item.authType)}` : `Indisponible · ${item.runtimeReason}`}</span>
                    </span>
                    {item.sharedCount === 0 && <span className="hidden shrink-0 rounded-full bg-chart-4/15 px-2 py-0.5 text-[11px] font-medium sm:inline-block">Aucune partagée</span>}
                    {item.id === value && <Check className="size-4 shrink-0 text-primary" aria-label="Sélectionné" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <SearchX className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Aucun connecteur ne correspond</p>
              <button type="button" onClick={() => { setQuery(''); setKind('all') }} className="text-xs font-medium text-primary underline-offset-4 hover:underline">Réinitialiser la recherche</button>
            </div>
          )}

          <p className="flex flex-wrap items-center gap-x-1.5 px-1 text-xs text-muted-foreground">
            <span>{results.length} sur {usable.length}</span>
            {withoutAuth > 0 && <span className="inline-flex items-center gap-1"><Lock className="size-3" aria-hidden />· {withoutAuth} sans authentification (aucune connexion nécessaire)</span>}
          </p>
        </div>
      )}
    </div>
  )
}
