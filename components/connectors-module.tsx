'use client'

import {
  ArrowLeft,
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  Database,
  Folder,
  Globe2,
  Mail,
  Menu,
  MessageSquare,
  Plus,
  Radio,
  Rss,
  Search,
  Settings,
  SlidersHorizontal,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { ConnectorDetailDialog } from '@/components/connector-detail-dialog'
import { ConnectorLogo, HealthDot, StatusBadge } from '@/components/connector-ui'
import { ConnectorWorkbench } from '@/components/connector-workbench'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sidebar } from '@/components/veillio-dashboard'
import { UserMenu } from '@/components/user-menu'
import {
  CONNECTOR_CATEGORY_CATALOG,
  CONNECTOR_TEMPLATES,
  configFromTemplate,
  getCategoryInfo,
  type ConnectorCategory,
  type ConnectorTemplate,
} from '@/lib/connector-catalog'
import type { ConnectorSummary, ConnectorsOverview } from '@/lib/connector-types'

const CATEGORY_ICONS: Record<ConnectorCategory, typeof Globe2> = {
  websites: Globe2,
  databases: Database,
  rss: Rss,
  social: Radio,
  cloud: Cloud,
  email: Mail,
  local: Folder,
  collaborative: MessageSquare,
  knowledge: BookOpen,
}

const PAGE_SIZE = 10

type HealthFilter = 'all' | 'healthy' | 'attention' | 'untested'

function matchesHealth(connector: ConnectorSummary, health: HealthFilter) {
  if (health === 'healthy') return connector.health === 'ok' && connector.testedCurrentVersion
  if (health === 'attention') return connector.health === 'error' || connector.health === 'warning' || (connector.health !== 'unknown' && !connector.testedCurrentVersion)
  if (health === 'untested') return connector.health === 'unknown'
  return true
}

function CreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (message: string, id?: string) => void }) {
  const [category, setCategory] = useState<ConnectorCategory | null>(null)
  const [template, setTemplate] = useState<ConnectorTemplate | null>(null)
  const prepared = template ? configFromTemplate(template.id) : null
  const categoryInfo = category ? getCategoryInfo(category) : null
  const templates = category ? CONNECTOR_TEMPLATES.filter((item) => item.category === category) : []

  function reset() {
    setCategory(null)
    setTemplate(null)
  }

  function close() {
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="2xl"
      title={template ? `Nouveau connecteur · ${template.label}` : categoryInfo ? categoryInfo.label : 'Nouveau connecteur'}
      description={template ? template.description : categoryInfo ? 'Choisissez l’intégration à configurer dans cette catégorie.' : 'Choisissez d’abord une catégorie métier, puis un connecteur adapté.'}
    >
      {!category ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTOR_CATEGORY_CATALOG.map((item) => {
            const Icon = CATEGORY_ICONS[item.id]
            const examples = CONNECTOR_TEMPLATES.filter((templateItem) => templateItem.category === item.id).slice(0, 4)
            return (
              <button key={item.id} type="button" onClick={() => setCategory(item.id)} className="group flex min-h-44 flex-col items-start gap-3 rounded-2xl border bg-card p-4 text-left outline-none transition-colors hover:border-primary/60 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden /></span>
                <span><strong className="block text-sm">{item.label}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span></span>
                <span className="mt-auto text-xs text-muted-foreground">{examples.map((example) => example.label).join(' · ')}</span>
              </button>
            )
          })}
        </div>
      ) : !template ? (
        <div className="flex flex-col gap-5">
          <div><Button type="button" variant="ghost" size="sm" onClick={() => setCategory(null)}><ArrowLeft data-icon="inline-start" />Toutes les catégories</Button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((item) => (
              <button key={item.id} type="button" onClick={() => setTemplate(item)} className="flex items-start justify-between gap-4 rounded-2xl border bg-card p-4 text-left outline-none transition-colors hover:border-primary/60 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                <span><strong className="text-sm">{item.label}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span></span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      ) : prepared ? (
        <div className="flex flex-col gap-4">
          <div><Button type="button" variant="ghost" size="sm" onClick={() => setTemplate(null)}><ArrowLeft data-icon="inline-start" />Changer d’intégration</Button></div>
          <ConnectorWorkbench
            kind={prepared.kind}
            initialConfig={prepared.config}
            canManage
            onCancel={() => setTemplate(null)}
            onSaved={({ message, id }) => {
              reset()
              onCreated(message, id)
            }}
          />
        </div>
      ) : null}
    </Modal>
  )
}

export function ConnectorsModule({ overview }: { overview: ConnectorsOverview }) {
  const router = useRouter()
  const { viewer, connectors } = overview
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ConnectorCategory | 'all'>('all')
  const [status, setStatus] = useState<'all' | ConnectorSummary['status']>('all')
  const [health, setHealth] = useState<HealthFilter>('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr')
    return connectors
      .filter((connector) => category === 'all' || connector.category === category)
      .filter((connector) => status === 'all' || connector.status === status)
      .filter((connector) => matchesHealth(connector, health))
      .filter((connector) => !needle || [connector.name, connector.provider, connector.description, connector.host, getCategoryInfo(connector.category)?.label].some((value) => value?.toLocaleLowerCase('fr').includes(needle)))
      .sort((first, second) => first.name.localeCompare(second.name, 'fr', { sensitivity: 'base' }))
  }, [category, connectors, health, query, status])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function resetPage() {
    setPage(1)
  }

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4200)
  }

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Connecteurs" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
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
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Configurez les capacités techniques qui relient Veillio aux sources externes, puis contrôlez leur disponibilité et leur état.</p>
              </div>
              {viewer.canManage && <Button onClick={() => setCreateOpen(true)} size="lg"><Plus data-icon="inline-start" />Nouveau connecteur</Button>}
            </section>

            <section className="rounded-2xl border bg-card" aria-label="Catalogue des connecteurs">
              <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center">
                <label className="relative flex-1">
                  <span className="sr-only">Rechercher un connecteur</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={query} onChange={(event) => { setQuery(event.target.value); resetPage() }} className="h-10 rounded-xl pl-9" placeholder="Rechercher par nom, fournisseur, catégorie ou domaine" />
                </label>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><SlidersHorizontal className="size-4" aria-hidden /><span className="hidden sm:inline">Filtres</span></div>
                <Select items={[{ value: 'all', label: 'Toutes les catégories' }, ...CONNECTOR_CATEGORY_CATALOG.map((item) => ({ value: item.id, label: item.label }))]} value={category} onValueChange={(value) => { setCategory((value ?? 'all') as ConnectorCategory | 'all'); resetPage() }}>
                  <SelectTrigger className="h-10 w-full rounded-xl xl:w-48"><SelectValue placeholder="Toutes les catégories" /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="all">Toutes les catégories</SelectItem>{CONNECTOR_CATEGORY_CATALOG.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                <Select items={[{ value: 'all', label: 'Tous les statuts' }, { value: 'active', label: 'Actifs' }, { value: 'paused', label: 'En pause' }, { value: 'draft', label: 'Brouillons' }]} value={status} onValueChange={(value) => { setStatus((value ?? 'all') as typeof status); resetPage() }}>
                  <SelectTrigger className="h-10 w-full rounded-xl xl:w-40"><SelectValue placeholder="Tous les statuts" /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="active">Actifs</SelectItem><SelectItem value="paused">En pause</SelectItem><SelectItem value="draft">Brouillons</SelectItem></SelectGroup></SelectContent>
                </Select>
                <Select items={[{ value: 'all', label: 'Tous les états' }, { value: 'healthy', label: 'Sains' }, { value: 'attention', label: 'À surveiller' }, { value: 'untested', label: 'Jamais testés' }]} value={health} onValueChange={(value) => { setHealth((value ?? 'all') as HealthFilter); resetPage() }}>
                  <SelectTrigger className="h-10 w-full rounded-xl xl:w-40"><SelectValue placeholder="Tous les états" /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="all">Tous les états</SelectItem><SelectItem value="healthy">Sains</SelectItem><SelectItem value="attention">À surveiller</SelectItem><SelectItem value="untested">Jamais testés</SelectItem></SelectGroup></SelectContent>
                </Select>
              </div>

              {visible.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Connecteur</TableHead><TableHead>Type / Catégorie</TableHead><TableHead>Statut</TableHead><TableHead>Dernier test</TableHead><TableHead>Date de création</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {paginated.map((connector) => {
                      const categoryInfo = getCategoryInfo(connector.category)
                      return (
                        <TableRow key={connector.id} className="group">
                          <TableCell>
                            <button type="button" className="flex max-w-80 items-center gap-3 text-left" onClick={() => setOpenId(connector.id)}>
                              <ConnectorLogo kind={connector.kind} logoUrl={connector.logoUrl} className="size-9 rounded-lg" />
                              <span className="min-w-0"><strong className="block truncate font-medium text-foreground group-hover:text-primary">{connector.name}</strong><span className="mt-1 block truncate text-xs text-muted-foreground">{connector.host || connector.description || 'Configuration à compléter'}</span></span>
                            </button>
                          </TableCell>
                          <TableCell><span className="block text-sm font-medium">{connector.provider}</span><span className="mt-1 block text-xs text-muted-foreground">{categoryInfo?.label}</span></TableCell>
                          <TableCell><StatusBadge status={connector.status} /></TableCell>
                          <TableCell><div className="flex flex-col gap-1"><HealthDot connector={connector} /><span className="text-xs text-muted-foreground">{connector.lastCheckAt ?? 'Aucun test'}</span></div></TableCell>
                          <TableCell><span className="text-sm text-muted-foreground">{connector.createdAt}</span></TableCell>
                          <TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={`Ouvrir ${connector.name}`} onClick={() => setOpenId(connector.id)}><ChevronRight /></Button></TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <Empty className="min-h-80">
                  <EmptyHeader><EmptyMedia variant="icon"><Database /></EmptyMedia><EmptyTitle>{connectors.length === 0 ? 'Aucun connecteur configuré' : 'Aucun connecteur trouvé'}</EmptyTitle><EmptyDescription>{connectors.length === 0 ? 'Ajoutez une première intégration pour relier Veillio à une source externe.' : 'Ajustez votre recherche ou vos filtres.'}</EmptyDescription></EmptyHeader>
                  {connectors.length === 0 && viewer.canManage && <EmptyContent><Button onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />Créer un connecteur</Button></EmptyContent>}
                </Empty>
              )}

              {visible.length > 0 && (
                <nav aria-label="Pagination des connecteurs" className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visible.length)} sur {visible.length} connecteur{visible.length > 1 ? 's' : ''}</p>
                  <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft data-icon="inline-start" />Précédent</Button><span className="min-w-20 text-center text-sm font-medium" aria-live="polite">Page {currentPage} / {totalPages}</span><Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Suivant<ChevronRight data-icon="inline-end" /></Button></div>
                </nav>
              )}
            </section>
          </div>
        </main>
      </div>

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(message, id) => { setCreateOpen(false); notify(message); router.refresh(); if (id) setOpenId(id) }} />
      {openId && <ConnectorDetailDialog key={openId} connectorId={openId} viewer={viewer} onClose={() => setOpenId(null)} onNotify={notify} onOpenConnector={setOpenId} />}
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl">{toast}</div>}
    </div>
  )
}
