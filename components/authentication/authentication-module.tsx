'use client'

import { KeyRound, Menu, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { AuthenticationMethodForm } from '@/components/authentication/proposal-wizard'
import { Sidebar } from '@/components/veillio-dashboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AuthenticationMethodView, AuthenticationOverview } from '@/lib/authentication/view-model'

function MethodDetail({ method }: { method: AuthenticationMethodView }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{method.methodId}</Badge>
        <Badge variant="secondary">v{method.version}</Badge>
        <Badge variant="outline">{method.familyLabel}</Badge>
        {method.variantLabel && <Badge variant="outline">{method.variantLabel}</Badge>}
      </div>

      {method.description && <p className="text-sm leading-6 text-muted-foreground">{method.description}</p>}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Champs</CardTitle>
          <Badge variant="outline">{method.fields.length}</Badge>
        </CardHeader>
        <CardContent>
          {method.fields.length ? (
            <ul>
              {method.fields.map((field) => (
                <li key={field.code} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0">
                  <div>
                    <p className="text-sm font-medium">{field.label}</p>
                    <p className="font-mono text-xs text-muted-foreground">{field.code}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{field.type}</Badge>
                    {field.required && <Badge variant="outline">Obligatoire</Badge>}
                    {field.secret && <Badge variant="secondary">Secret</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Aucun champ.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Transmission</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Type</p><p className="mt-1 font-medium">{method.transmission.type}</p></div>
          <div><p className="text-xs text-muted-foreground">Protocole</p><p className="mt-1 font-medium">{method.transmission.protocol}</p></div>
          <div><p className="text-xs text-muted-foreground">TLS</p><p className="mt-1 font-medium">{method.transmission.requiresTls ? 'Requis' : 'Non requis'}</p></div>
        </CardContent>
      </Card>
    </div>
  )
}

export function AuthenticationModule({ overview, openProposal = false }: { overview: AuthenticationOverview; openProposal?: boolean }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('all')
  const [selected, setSelected] = useState<AuthenticationMethodView | null>(null)
  const [createOpen, setCreateOpen] = useState(openProposal)

  const methods = useMemo(() => overview.methods.filter((method) => {
    const haystack = `${method.methodId} ${method.displayName} ${method.description} ${method.familyLabel}`.toLocaleLowerCase('fr')
    return (!query.trim() || haystack.includes(query.trim().toLocaleLowerCase('fr'))) && (family === 'all' || method.familyId === family)
  }), [family, overview.methods, query])

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Référentiel authentification" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="text-sm text-muted-foreground">Paramètres <span className="px-2">/</span> <strong className="font-medium text-foreground">Référentiel authentification</strong></div>
        </header>
        <main className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <header className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
            <div>
              <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Référentiel d’authentification</h1>
              <p className="mt-2 text-sm text-muted-foreground">Schémas utilisés par les connecteurs.</p>
            </div>
            {overview.viewer.canCreate && <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Ajouter une méthode</Button>}
          </header>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px]">
            <label className="relative">
              <span className="sr-only">Rechercher</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher…" />
            </label>
            <Select value={family} onValueChange={(value) => setFamily(value ?? 'all')}>
              <SelectTrigger aria-label="Filtrer par famille"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="all">Toutes les familles</SelectItem>{overview.families.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>

          {methods.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {methods.map((method) => (
                <button key={method.id} type="button" onClick={() => setSelected(method)} className="flex min-h-36 flex-col rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted/30">
                  <div className="flex w-full items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound /></span>
                    <Badge variant="outline">{method.familyLabel}</Badge>
                  </div>
                  <h2 className="mt-4 text-base font-semibold">{method.displayName}</h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{method.methodId} · v{method.version}</p>
                  <p className="mt-auto pt-4 text-xs text-muted-foreground">{method.fields.length} champ{method.fields.length > 1 ? 's' : ''}</p>
                </button>
              ))}
            </div>
          ) : <Empty className="border"><EmptyHeader><EmptyTitle>Aucune méthode</EmptyTitle><EmptyDescription>Modifiez la recherche ou ajoutez une méthode.</EmptyDescription></EmptyHeader></Empty>}
        </main>
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.displayName ?? 'Méthode'} size="xl">
        {selected && <MethodDetail method={selected} />}
      </Modal>
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Ajouter une méthode" size="2xl">
        <AuthenticationMethodForm families={overview.families} onClose={() => setCreateOpen(false)} />
      </Modal>
    </div>
  )
}
