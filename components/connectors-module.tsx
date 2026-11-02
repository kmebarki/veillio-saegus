'use client'

import { ArrowLeft, Bell, ChevronRight, CircleHelp, Lock, Menu, Plug, Plus, Search, Settings, Timer } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { ConnectorDetailDialog } from '@/components/connector-detail-dialog'
import { HealthDot, KindIcon, StatusBadge, formatDuration } from '@/components/connector-ui'
import { ConnectorWorkbench } from '@/components/connector-workbench'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Sidebar } from '@/components/veillio-dashboard'
import { UserMenu } from '@/components/user-menu'
import { CONNECTOR_CATALOG, COMING_SOON_KINDS, getKindInfo, type ConnectorKind, type ConnectorStatus } from '@/lib/connector-catalog'
import type { ConnectorSummary, ConnectorsOverview } from '@/lib/connector-types'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | ConnectorStatus | 'attention'
type Sort = 'name' | 'recent' | 'health'

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'active', label: 'Actifs' },
  { id: 'paused', label: 'En pause' },
  { id: 'draft', label: 'Brouillons' },
  { id: 'attention', label: 'À surveiller' },
]

const HEALTH_RANK = { error: 0, warning: 1, unknown: 2, ok: 3 } as const

function needsAttention(connector: ConnectorSummary) {
  return connector.health === 'error' || connector.health === 'warning' || (connector.status === 'active' && !connector.testedCurrentVersion)
}

function ConnectorCard({ connector, onOpen }: { connector: ConnectorSummary; onOpen: () => void }) {
  const info = getKindInfo(connector.kind)
  return (
    <article>
      <button type="button" onClick={onOpen} aria-label={`Ouvrir le connecteur ${connector.name}`} className="group flex h-full w-full flex-col gap-4 rounded-2xl border bg-card p-5 text-left outline-none transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><KindIcon kind={connector.kind} className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold tracking-[-0.02em]">{connector.name}</h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{info?.label}{connector.host ? ` · ${connector.host}` : ''}</p>
          </div>
          <StatusBadge status={connector.status} />
        </div>

        <p className="line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{connector.lastCheckMessage && connector.health === 'error' ? connector.lastCheckMessage : connector.description || info?.tagline}</p>

        <div className="mt-auto flex flex-col gap-3 border-t pt-4">
          <div className="flex items-center justify-between gap-3"><HealthDot connector={connector} /><ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden /></div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {connector.lastLatencyMs !== null && <span className="flex items-center gap-1.5"><Timer className="size-3.5" aria-hidden />{formatDuration(connector.lastLatencyMs)}</span>}
            {connector.authType !== 'none' && <span className="flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden />{connector.connectionCount > 0 ? `${connector.connectionCount} connexion${connector.connectionCount > 1 ? 's' : ''}` : 'Aucune connexion'}</span>}
          </div>
        </div>
      </button>
    </article>
  )
}

function CreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (message: string, id?: string) => void }) {
  const [kind, setKind] = useState<ConnectorKind | null>(null)
  const info = kind ? getKindInfo(kind) : null

  function close() {
    setKind(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} size="2xl" title={info ? `Nouveau connecteur · ${info.label}` : 'Nouveau connecteur'} description={info ? info.description : 'Choisissez le type de source à connecter. Vous pourrez la tester avant de l’enregistrer.'}>
      {!info || !kind ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 md:grid-cols-3">
            {CONNECTOR_CATALOG.map((item) => (
              <button key={item.kind} type="button" onClick={() => setKind(item.kind)} className="group flex flex-col gap-4 rounded-2xl border bg-card p-5 text-left outline-none transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg hover:shadow-primary/5 focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><KindIcon kind={item.kind} className="size-6" /></span>
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em]">{item.label}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.tagline}</p>
                </div>
                <ul className="flex flex-col gap-1.5 text-[13px] leading-5 text-muted-foreground">
                  {item.strengths.map((strength) => <li key={strength} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden />{strength}</li>)}
                </ul>
                <p className="mt-auto border-t pt-3 text-xs text-muted-foreground">Requis : {item.requires}</p>
              </button>
            ))}
          </div>
          <section aria-label="Types à venir">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prochainement</h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {COMING_SOON_KINDS.map((item) => (
                <li key={item.label} className="rounded-xl border border-dashed px-3 py-2.5 opacity-70"><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.tagline}</p></li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div><Button type="button" variant="ghost" size="sm" onClick={() => setKind(null)}><ArrowLeft data-icon="inline-start" />Changer de type</Button></div>
          <ConnectorWorkbench
            kind={kind}
            canManage
            onCancel={() => setKind(null)}
            onSaved={({ message, id }) => {
              setKind(null)
              onCreated(message, id)
            }}
          />
        </div>
      )}
    </Modal>
  )
}

export function ConnectorsModule({ overview }: { overview: ConnectorsOverview }) {
  const router = useRouter()
  const { viewer, connectors, stats } = overview
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [kindFilter, setKindFilter] = useState<ConnectorKind | 'all'>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [createOpen, setCreateOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = connectors.filter((connector) => {
      if (statusFilter === 'attention' ? !needsAttention(connector) : statusFilter !== 'all' && connector.status !== statusFilter) return false
      if (kindFilter !== 'all' && connector.kind !== kindFilter) return false
      return !needle || `${connector.name} ${connector.description} ${connector.host}`.toLowerCase().includes(needle)
    })
    return list.sort((a, b) => (sort === 'health' ? HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.name.localeCompare(b.name, 'fr') : sort === 'recent' ? b.updatedAt.localeCompare(a.updatedAt) : a.name.localeCompare(b.name, 'fr')))
  }, [connectors, query, statusFilter, kindFilter, sort])

  const counts = useMemo(
    () => ({ all: connectors.length, active: connectors.filter((c) => c.status === 'active').length, paused: connectors.filter((c) => c.status === 'paused').length, draft: connectors.filter((c) => c.status === 'draft').length, attention: connectors.filter(needsAttention).length }),
    [connectors],
  )

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4200)
  }

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Connecteurs" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Intégrations <span className="px-2">/</span> <strong className="font-medium text-foreground">Connecteurs</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><UserMenu /></div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-2 text-xs font-medium text-primary">{overview.organizationName}</p>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Connecteurs</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{viewer.canManage ? 'Branchez vos sources de veille (flux RSS, pages web, API), testez chaque connexion en direct et activez-les en toute confiance.' : 'Consultez les connecteurs de l’organisation, leur configuration et l’état de leurs connexions.'}</p>
              </div>
              {viewer.canManage && <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Nouveau connecteur</Button>}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs">
              <div className="metric-card"><p>Connecteurs</p><strong>{stats.total}</strong><span>{stats.active} actif(s)</span></div>
              <div className="metric-card"><p>Connexions saines</p><strong>{stats.healthy}</strong><span>Dernier test réussi</span></div>
              <div className="metric-card"><p>À surveiller</p><strong>{stats.attention}</strong><span>{stats.attention > 0 ? 'Erreur, réserve ou à retester' : 'Rien à signaler'}</span></div>
              <div className="metric-card"><p>Latence moyenne</p><strong>{stats.avgLatencyMs === null ? '—' : formatDuration(stats.avgLatencyMs)}</strong><span>Dernières mesures</span></div>
            </section>

            {connectors.length > 0 && (
              <section className="flex flex-col gap-3" aria-label="Filtres">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="relative flex-1">
                    <span className="sr-only">Rechercher un connecteur</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-card pl-9 pr-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="Rechercher par nom, description ou domaine" />
                  </label>
                  <label><span className="sr-only">Type</span>
                    <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as ConnectorKind | 'all')} className="h-10 rounded-xl border bg-card px-3 text-sm outline-none focus:border-ring">
                      <option value="all">Tous les types</option>
                      {CONNECTOR_CATALOG.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
                    </select>
                  </label>
                  <label><span className="sr-only">Trier</span>
                    <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="h-10 rounded-xl border bg-card px-3 text-sm outline-none focus:border-ring">
                      <option value="name">Nom (A-Z)</option>
                      <option value="health">Santé (problèmes d’abord)</option>
                      <option value="recent">Dernière modification</option>
                    </select>
                  </label>
                </div>
                <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filtrer par statut">
                  {STATUS_FILTERS.map(({ id, label }) => (
                    <button key={id} type="button" role="tab" aria-selected={statusFilter === id} onClick={() => setStatusFilter(id)} className={cn('flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors', statusFilter === id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>
                      {label}<span className={cn('text-xs tabular-nums', statusFilter === id ? 'opacity-80' : 'text-muted-foreground')}>{counts[id]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {visible.length > 0 ? (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Liste des connecteurs">
                {visible.map((connector) => <ConnectorCard key={connector.id} connector={connector} onOpen={() => setOpenId(connector.id)} />)}
              </section>
            ) : (
              <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Plug className="size-7" aria-hidden /></span>
                <div>
                  <p className="text-lg font-semibold tracking-[-0.02em]">{connectors.length === 0 ? 'Aucun connecteur pour le moment' : 'Aucun connecteur ne correspond'}</p>
                  <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{connectors.length === 0 ? (viewer.canManage ? 'Un connecteur relie Veillio à une source externe. Commencez par un flux RSS : c’est le plus rapide à configurer.' : 'Un administrateur doit créer les connecteurs de l’organisation.') : 'Modifiez vos filtres ou votre recherche.'}</p>
                </div>
                {connectors.length === 0 && viewer.canManage && <Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Créer un connecteur</Button>}
              </section>
            )}
          </div>
        </main>
      </div>

      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(message, id) => {
          setCreateOpen(false)
          notify(message)
          router.refresh()
          if (id) setOpenId(id)
        }}
      />

      {openId && <ConnectorDetailDialog key={openId} connectorId={openId} viewer={viewer} onClose={() => setOpenId(null)} onNotify={notify} onOpenConnector={setOpenId} />}

      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl">{toast}</div>}
    </div>
  )
}
