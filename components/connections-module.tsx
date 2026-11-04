'use client'

import { Bell, ChevronLeft, ChevronRight, CircleHelp, Globe2, KeyRound, Menu, Pencil, PlugZap, Plus, Search, Settings, Trash2, TriangleAlert, User, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { deleteConnection, getConnectionActivity, testConnection } from '@/app/actions/connections'
import { ConnectionDetail } from '@/components/connections/connection-detail'
import { ConnectionForm, type FormTarget } from '@/components/connections/connection-form'
import { inputClass, needsAttention } from '@/components/connections/helpers'
import { TestResult } from '@/components/connections/test-result'
import { ConnectorLogo, HealthDot, KindIcon } from '@/components/connector-ui'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UserMenu } from '@/components/user-menu'
import { Sidebar } from '@/components/veillio-dashboard'
import type { ConnectionActivityEntry, ConnectionSummary, ConnectionsOverview } from '@/lib/connection-types'
import type { TestOutcome } from '@/lib/connector-types'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'organization' | 'public' | 'private' | 'attention'

const PAGE_SIZE = 8

export function ConnectionsModule({ overview }: { overview: ConnectionsOverview }) {
  const router = useRouter()
  const { viewer, connections, connectors, stats } = overview
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<FormTarget | null>(null)
  const [toDelete, setToDelete] = useState<ConnectionSummary | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [activity, setActivity] = useState<ConnectionActivityEntry[] | null>(null)
  const [result, setResult] = useState<{ connection: ConnectionSummary; outcome: TestOutcome } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const detail = connections.find((item) => item.id === detailId) ?? null
  const uncovered = viewer.canManage ? connectors.filter((item) => item.requiresAuth && item.sharedCount === 0) : []

  const counts = useMemo(() => ({
    all: connections.length,
    organization: connections.filter((item) => item.scope === 'organization').length,
    public: connections.filter((item) => item.scope === 'public').length,
    private: stats.personal,
    attention: stats.attention,
  }), [connections, stats.attention, stats.personal])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return connections.filter((item) => {
      const inFilter = filter === 'all' || (filter === 'attention' ? needsAttention(item) : item.scope === filter)
      return inFilter && (!needle || `${item.name} ${item.connectorName} ${item.username} ${item.host}`.toLowerCase().includes(needle))
    })
  }, [connections, query, filter])
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const rows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4800)
  }

  function openDetail(connection: ConnectionSummary) {
    setDetailId(connection.id)
    setActivity(null)
    void loadActivity(connection.id)
  }

  async function loadActivity(id: string) {
    const response = await getConnectionActivity({ id })
    setActivity(response.ok ? response.entries : [])
  }

  async function test(connection: ConnectionSummary) {
    setBusyId(connection.id)
    setDetailId(null)
    const response = await testConnection({ id: connection.id })
    setBusyId(null)
    if (response.ok) setResult({ connection, outcome: response.outcome })
    else notify(response.message)
    router.refresh()
  }

  async function remove(connection: ConnectionSummary) {
    setBusyId(connection.id)
    const response = await deleteConnection({ id: connection.id })
    setBusyId(null)
    notify(response.message)
    router.refresh()
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Toutes' },
    { id: 'private', label: 'Privées' },
    { id: 'organization', label: 'Organisationnelles' },
    { id: 'public', label: 'Publiques' },
    { id: 'attention', label: 'À surveiller' },
  ]
  const canCreate = connectors.some((item) => item.requiresAuth && item.runtimeAvailable)

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Connexions" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Intégrations <span className="px-2">/</span> <strong className="font-medium text-foreground">Connexions</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><UserMenu /></div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-2 text-xs font-medium text-primary">{overview.organizationName}</p>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Connexions</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Une Connexion est un accès opérationnel versionné à un service, avec une portée privée ou organisationnelle. La publication plateforme suit un parcours d’approbation séparé. Le <Link href="/admin/connectors" className="font-medium text-primary underline-offset-4 hover:underline">Connecteur</Link> définit seulement comment communiquer avec le fournisseur.</p>
              </div>
              {canCreate && <Button onClick={() => setForm({ mode: 'create' })}><Plus data-icon="inline-start" />Nouvelle connexion</Button>}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs">
              <div className="metric-card"><p>Connexions</p><strong>{stats.total}</strong><span>Visibles par vous</span></div>
              <div className="metric-card"><p>Partagées</p><strong>{stats.shared}</strong><span>Organisationnelles ou publiques</span></div>
              <div className="metric-card"><p>Privées</p><strong>{stats.personal}</strong><span>Réservées à leur propriétaire</span></div>
              <div className="metric-card"><p>À surveiller</p><strong>{stats.attention}</strong><span>{stats.attention > 0 ? 'Échec, expiration proche ou à retester' : 'Rien à signaler'}</span></div>
            </section>

            {uncovered.length > 0 && (
              <section aria-label="Connecteurs sans connexion partagée" className="flex flex-col gap-3 rounded-2xl border border-chart-4/40 bg-chart-4/10 p-4">
                <p className="flex items-start gap-2 text-sm font-medium"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{uncovered.length === 1 ? 'Un connecteur authentifié n’a aucune connexion partagée' : `${uncovered.length} connecteurs authentifiés n’ont aucune connexion partagée`} : les veilles ne pourront pas les interroger.</p>
                <div className="flex flex-wrap gap-2">
                  {uncovered.map((item) => (
                    <button key={item.id} type="button" onClick={() => setForm({ mode: 'create', connectorId: item.id })} className="inline-flex h-9 items-center gap-2 rounded-full border bg-card px-3 text-sm font-medium transition-colors hover:border-primary hover:text-primary">
                      <KindIcon kind={item.kind} className="size-4" />{item.name}<Plus className="size-3.5" aria-hidden />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {connections.length > 0 && (
              <section className="flex flex-col gap-3 lg:flex-row lg:items-center" aria-label="Filtres">
                <label className="relative flex-1">
                  <span className="sr-only">Rechercher une connexion</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} className={cn(inputClass, 'pl-9')} placeholder="Rechercher par nom, connecteur, hôte ou identifiant" />
                </label>
                <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filtrer les connexions">
                  {filters.map((item) => (
                    <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => { setFilter(item.id); setPage(1) }} className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors', filter === item.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>
                      {item.label}<span className={cn('text-xs', filter === item.id ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{counts[item.id]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {visible.length > 0 ? (
              <section className="overflow-hidden rounded-2xl border bg-card" aria-label="Liste des connexions">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Connexion</TableHead>
                      <TableHead>Portée</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Santé</TableHead>
                      <TableHead>Dernier contrôle</TableHead>
                      <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((connection) => {
                      const ScopeIcon = connection.scope === 'private' ? User : connection.scope === 'public' ? Globe2 : Users
                      const scopeLabel = connection.scope === 'private' ? 'Privée' : connection.scope === 'public' ? 'Publique' : connection.organizationNames.length > 1 ? `${connection.organizationNames.length} organisations` : (connection.organizationNames[0] ?? 'Organisation')
                      return (
                        <TableRow key={connection.id} className="group cursor-pointer" onClick={() => openDetail(connection)}>
                          <TableCell>
                            <div className="flex max-w-80 items-center gap-3">
                              <ConnectorLogo kind={connection.connectorKind} logoUrl={connection.logoUrl || connection.connectorLogoUrl} className="size-10 rounded-xl" />
                              <div className="min-w-0"><p className="truncate font-semibold group-hover:text-primary">{connection.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{connection.connectorName}{connection.host ? ` · ${connection.host}` : ''}</p></div>
                            </div>
                          </TableCell>
                          <TableCell><span className="inline-flex max-w-48 items-center gap-1.5 text-sm"><ScopeIcon className="size-4 shrink-0 text-primary" aria-hidden /><span className="truncate">{scopeLabel}</span></span></TableCell>
                          <TableCell><Badge variant={connection.lifecycle === 'active' ? 'default' : 'outline'}>{connection.lifecycle === 'active' ? 'Active' : connection.lifecycle === 'draft' ? 'Brouillon' : connection.lifecycle === 'suspended' ? 'Suspendue' : 'Archivée'}</Badge></TableCell>
                          <TableCell><HealthDot connector={connection} /></TableCell>
                          <TableCell><p className="text-sm">{connection.lastCheckAt ?? 'Jamais testée'}</p><p className="mt-1 max-w-48 truncate text-xs text-muted-foreground">{connection.lastCheckMessage ?? 'Test recommandé'}</p></TableCell>
                          <TableCell className="text-right">
                            {connection.canEdit && <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" disabled={busyId === connection.id} aria-label={`Tester ${connection.name}`} onClick={(event) => { event.stopPropagation(); void test(connection) }}><PlugZap /></Button>
                              <Button variant="ghost" size="icon" disabled={busyId === connection.id} aria-label={`Modifier ${connection.name}`} onClick={(event) => { event.stopPropagation(); setForm({ mode: 'edit', connection }) }}><Pencil /></Button>
                              <Button variant="ghost" size="icon" disabled={busyId === connection.id} className="text-destructive hover:text-destructive" aria-label={`Archiver ${connection.name}`} onClick={(event) => { event.stopPropagation(); setToDelete(connection) }}><Trash2 /></Button>
                            </div>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                <nav className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Pagination des connexions">
                  <p className="text-sm text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visible.length)} sur {visible.length}</p>
                  <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft data-icon="inline-start" />Précédent</Button><span className="min-w-20 text-center text-sm font-medium">{currentPage} / {pages}</span><Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage((value) => value + 1)}>Suivant<ChevronRight data-icon="inline-end" /></Button></div>
                </nav>
              </section>
            ) : (
              <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><KeyRound className="size-7" aria-hidden /></span>
                <div>
                  <p className="text-lg font-semibold tracking-[-0.02em]">{connections.length === 0 ? 'Aucune connexion pour le moment' : 'Aucune connexion ne correspond'}</p>
                  <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                    {connections.length > 0
                      ? 'Modifiez vos filtres ou votre recherche.'
                      : canCreate
                        ? 'Ajoutez la clé API ou le jeton d’un fournisseur pour que les connecteurs authentifiés puissent interroger ses données.'
                        : 'Aucune combinaison méthode, adaptateur et preuve runtime n’est actuellement activable. Publiez et attestez une méthode dans le référentiel Authentification.'}
                  </p>
                </div>
                {connections.length === 0 && canCreate && <Button onClick={() => setForm({ mode: 'create' })}><Plus data-icon="inline-start" />Créer une connexion</Button>}
                {!canCreate && <Link href="/admin/connectors" className={buttonVariants({ variant: 'outline' })}>Ouvrir les connecteurs</Link>}
              </section>
            )}
          </div>
        </main>
      </div>

      <Modal open={form !== null} onClose={() => setForm(null)} size="xl" title={form?.mode === 'edit' ? 'Modifier la connexion' : 'Nouvelle connexion'} description="Les identifiants sont chiffrés et ne sont jamais renvoyés au navigateur.">
        {form && (
          <ConnectionForm
            key={form.mode === 'edit' ? form.connection.id : `new-${form.connectorId ?? ''}`}
            target={form}
            overview={overview}
            onClose={() => setForm(null)}
            onDone={(message) => {
              setForm(null)
              notify(message)
              router.refresh()
            }}
          />
        )}
      </Modal>

      <Modal open={detail !== null} onClose={() => setDetailId(null)} size="xl" title={detail?.name ?? ''} description="Paramètres techniques et historique de la connexion.">
        {detail && (
          <ConnectionDetail
            connection={detail}
            activity={activity}
            busy={busyId === detail.id}
            onTest={() => void test(detail)}
            onEdit={() => {
              setDetailId(null)
              setForm({ mode: 'edit', connection: detail })
            }}
            onDelete={() => {
              setDetailId(null)
              setToDelete(detail)
            }}
          />
        )}
      </Modal>

      <Modal open={result !== null} onClose={() => setResult(null)} size="md" title={result ? `Test de « ${result.connection.name} »` : ''} description={result ? `${result.connection.connectorName} · ${result.connection.host}` : undefined}>
        {result && (
          <div className="flex flex-col gap-4">
            <TestResult outcome={result.outcome} />
            <div className="flex justify-end gap-2 border-t pt-4">
              {result.outcome.status === 'error' && result.connection.canEdit && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const connection = result.connection
                    setResult(null)
                    setForm({ mode: 'edit', connection })
                  }}
                >
                  Modifier les identifiants
                </Button>
              )}
              <Button onClick={() => setResult(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={toDelete !== null} onClose={() => setToDelete(null)} size="md" title="Archiver la Connexion ?" description={toDelete ? `« ${toDelete.name} » sera archivée. L’opération est refusée tant qu’une Source active en dépend.` : undefined}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>Annuler</Button>
          <Button
            variant="destructive"
            onClick={() => {
              const target = toDelete
              setToDelete(null)
              if (target) void remove(target)
            }}
          >
            Archiver
          </Button>
        </div>
      </Modal>

      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl">{toast}</div>}
    </div>
  )
}
