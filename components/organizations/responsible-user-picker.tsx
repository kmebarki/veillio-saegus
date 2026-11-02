'use client'

import { useDeferredValue, useState } from 'react'
import { Search, UserRound, X } from 'lucide-react'
import useSWR from 'swr'

import { searchOrganizationResponsibles } from '@/app/actions/organizations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { OrganizationUserOption } from '@/lib/organization-types'

export function ResponsibleUserPicker({
  selected,
  onChange,
}: {
  selected: OrganizationUserOption | null
  onChange: (user: OrganizationUserOption | null) => void
}) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const searchKey = deferredQuery.length >= 2 ? `organization-responsibles:${deferredQuery}` : null
  const { data = [], error, isLoading } = useSWR(searchKey, () => searchOrganizationResponsibles(deferredQuery), {
    keepPreviousData: true,
  })

  return (
    <div className="flex flex-col gap-3">
      {selected && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><UserRound /></span>
            <span className="min-w-0"><strong className="block truncate text-sm font-medium">{selected.name}</strong><span className="block truncate text-xs text-muted-foreground">{selected.email}</span></span>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Retirer le responsable" onClick={() => onChange(null)}><X /></Button>
        </div>
      )}

      <label className="relative">
        <span className="sr-only">Rechercher un responsable</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 rounded-lg pl-9" placeholder={selected ? 'Rechercher pour changer de responsable' : 'Rechercher par nom ou e-mail'} autoComplete="off" />
      </label>

      {deferredQuery.length < 2 ? (
        <p className="text-xs text-muted-foreground">Saisissez au moins 2 caractères. Seuls les 20 meilleurs résultats sont affichés.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto rounded-lg border bg-card p-1" role="listbox" aria-label="Résultats de recherche">
          {isLoading && <p className="px-3 py-4 text-sm text-muted-foreground">Recherche…</p>}
          {!isLoading && error && <p className="px-3 py-4 text-sm text-destructive">La recherche est momentanément indisponible.</p>}
          {!isLoading && !error && data.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Aucun contact actif trouvé.</p>}
          {!isLoading && !error && data.map((user) => (
            <button key={user.id} type="button" role="option" aria-selected={selected?.id === user.id} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { onChange(user); setQuery('') }}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><UserRound /></span>
              <span className="min-w-0"><strong className="block truncate text-sm font-medium">{user.name}</strong><span className="block truncate text-xs text-muted-foreground">{user.email}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
