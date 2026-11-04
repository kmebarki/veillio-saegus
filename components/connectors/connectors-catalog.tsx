'use client'

import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Database,
  Download,
  Gauge,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { deleteConnector } from '@/app/actions/connectors'
import { ConnectorLogo, HealthDot, StatusBadge } from '@/components/connector-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SERVICE_CATEGORIES, getServiceDefinition, type ServiceCategory } from '@/lib/connector-service-catalog'
import type { ConnectorSummary, ConnectorsOverview } from '@/lib/connector-types'

const PAGE_SIZE = 8

type Props = {
  overview: ConnectorsOverview
  onCreate: () => void
  onOpen: (id: string) => void
  onNotify: (message: string) => void
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof Database }) {
  return (
    <article className="flex items-start justify-between gap-4 rounded-2xl border bg-card p-4">
      <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 font-serif text-3xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon /></span>
    </article>
  )
}

function exportCsv(connectors: ConnectorSummary[]) {
  const escape = (value: string | number) => {
    const text = String(value)
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
    return `"${safe.replaceAll('"', '""')}"`
  }
  const rows = [
    ['Nom', 'Service', 'Adaptateur', 'Catégorie', 'Statut', 'Santé', 'Dernier test', 'Création'],
    ...connectors.map((connector) => {
      const service = getServiceDefinition(connector.serviceId)
      return [connector.name, connector.provider, connector.adapter, service?.category ?? connector.category, connector.status, connector.health, connector.lastCheckAt ?? '', connector.createdAt]
    }),
  ]
  const blob = new Blob([`\uFEFF${rows.map((row) => row.map(escape).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `connecteurs-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function ConnectorsCatalog({ overview, onCreate, onOpen, onNotify }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ServiceCategory | 'all'>('all')
  const [status, setStatus] = useState<'all' | ConnectorSummary['status']>('all')
  const [health, setHealth] = useState<'all' | ConnectorSummary['health']>('all')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<ConnectorSummary | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr')
    return overview.connectors.filter((connector) => {
      const service = getServiceDefinition(connector.serviceId)
      const matchesQuery = !needle || [connector.name, connector.provider, connector.adapter, connector.description, connector.host].some((value) => value.toLocaleLowerCase('fr').includes(needle))
      return matchesQuery && (category === 'all' || service?.category === category) && (status === 'all' || connector.status === status) && (health === 'all' || connector.health === health)
    })
  }, [category, health, overview.connectors, query, status])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const categoryItems = [{ value: 'all', label: 'Toutes les catégories' }, ...SERVICE_CATEGORIES.map((item) => ({ value: item, label: item }))]

  function resetPage() {
    setPage(1)
  }

  function confirmDelete() {
    if (!deleteTarget || deleteTarget.status === 'active') return
    setDeleteError('')
    startTransition(async () => {
      const result = await deleteConnector({ id: deleteTarget.id })
      if (!result.ok) {
        setDeleteError(result.message)
        return
      }
      setDeleteTarget(null)
      onNotify(result.message)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-end">
        <div><p className="text-xs font-semibold text-primary">{overview.organizationName}</p><h1 className="mt-2 font-serif text-3xl tracking-tight sm:text-4xl">Connecteurs</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Définissez les contrats techniques, les méthodes d’accès compatibles et les capacités qui alimentent vos Sources.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}><Download data-icon="inline-start" />Exporter</Button>{overview.viewer.canManage && <Button onClick={onCreate}><Plus data-icon="inline-start" />Nouveau connecteur</Button>}</div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs Connecteurs">
        <MetricCard label="Connecteurs" value={overview.stats.total} detail={`${overview.stats.active} actif${overview.stats.active > 1 ? 's' : ''}`} icon={Database} />
        <MetricCard label="Disponibles" value={overview.stats.healthy} detail="Dernier test réussi" icon={CircleCheck} />
        <MetricCard label="À surveiller" value={overview.stats.attention} detail="Erreur, alerte ou retest requis" icon={CircleAlert} />
        <MetricCard label="Latence moyenne" value={overview.stats.avgLatencyMs === null ? '—' : `${overview.stats.avgLatencyMs} ms`} detail="Sur les derniers diagnostics" icon={Gauge} />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card" aria-label="Catalogue des connecteurs configurés">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center">
          <label className="relative flex-1"><span className="sr-only">Rechercher un connecteur</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={query} onChange={(event) => { setQuery(event.target.value); resetPage() }} className="pl-9" placeholder="Rechercher un connecteur, un service ou un adaptateur" /></label>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><SlidersHorizontal /><span>Filtres</span></div>
          <Select items={categoryItems} value={category} onValueChange={(value) => { setCategory((value ?? 'all') as ServiceCategory | 'all'); resetPage() }}><SelectTrigger className="w-full xl:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Toutes les catégories</SelectItem>{SERVICE_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent></Select>
          <Select items={[{ value: 'all', label: 'Tous les statuts' }, { value: 'active', label: 'Actifs' }, { value: 'paused', label: 'En pause' }, { value: 'draft', label: 'Brouillons' }]} value={status} onValueChange={(value) => { setStatus((value ?? 'all') as typeof status); resetPage() }}><SelectTrigger className="w-full xl:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="active">Actifs</SelectItem><SelectItem value="paused">En pause</SelectItem><SelectItem value="draft">Brouillons</SelectItem></SelectGroup></SelectContent></Select>
          <Select items={[{ value: 'all', label: 'Tous les états' }, { value: 'ok', label: 'Disponibles' }, { value: 'warning', label: 'Attention' }, { value: 'error', label: 'En erreur' }, { value: 'unknown', label: 'Non testés' }]} value={health} onValueChange={(value) => { setHealth((value ?? 'all') as typeof health); resetPage() }}><SelectTrigger className="w-full xl:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Tous les états</SelectItem><SelectItem value="ok">Disponibles</SelectItem><SelectItem value="warning">Attention</SelectItem><SelectItem value="error">En erreur</SelectItem><SelectItem value="unknown">Non testés</SelectItem></SelectGroup></SelectContent></Select>
        </div>

        {rows.length > 0 ? (
          <Table>
            <TableHeader><TableRow><TableHead>Connecteur</TableHead><TableHead>Service / Adaptateur</TableHead><TableHead>Authentification</TableHead><TableHead>Statut</TableHead><TableHead>Dernier contrôle</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((connector) => {
              const service = getServiceDefinition(connector.serviceId)
              return (
                <TableRow key={connector.id} className="group cursor-pointer" onClick={() => onOpen(connector.id)}>
                  <TableCell><div className="flex max-w-72 items-center gap-3"><ConnectorLogo kind={connector.kind} logoUrl={connector.logoUrl} className="size-10 rounded-xl" /><div className="min-w-0"><p className="truncate font-semibold group-hover:text-primary">{connector.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{connector.host || connector.description || 'Configuration à compléter'}</p></div></div></TableCell>
                  <TableCell><p className="text-sm font-medium">{connector.provider}</p><p className="mt-1 text-xs text-muted-foreground">{connector.adapter}</p>{service && <Badge variant="outline" className="mt-2">{service.category}</Badge>}</TableCell>
                  <TableCell><p className="max-w-48 truncate text-xs font-mono">{connector.authMethods.join(' · ') || 'NONE'}</p></TableCell>
                  <TableCell><StatusBadge status={connector.status} /></TableCell>
                  <TableCell><div className="flex flex-col gap-1"><HealthDot connector={connector} /><span className="text-xs text-muted-foreground">{connector.lastCheckAt ?? 'Aucun test'}</span></div></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {overview.viewer.canManage ? (
                        <>
                          <Button variant="ghost" size="icon" aria-label={`Modifier ${connector.name}`} onClick={(event) => { event.stopPropagation(); onOpen(connector.id) }}><Pencil /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Supprimer ${connector.name}`} onClick={(event) => { event.stopPropagation(); setDeleteError(''); setDeleteTarget(connector) }}><Trash2 /></Button>
                        </>
                      ) : <Button variant="ghost" size="icon" aria-label={`Ouvrir ${connector.name}`} onClick={(event) => { event.stopPropagation(); onOpen(connector.id) }}><ChevronRight /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}</TableBody>
          </Table>
        ) : (
          <Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><Database /></EmptyMedia><EmptyTitle>{overview.connectors.length ? 'Aucun résultat' : 'Aucun connecteur configuré'}</EmptyTitle><EmptyDescription>{overview.connectors.length ? 'Modifiez la recherche ou les filtres.' : 'Créez un premier contrat technique depuis le catalogue V3.'}</EmptyDescription></EmptyHeader>{!overview.connectors.length && overview.viewer.canManage && <EmptyContent><Button onClick={onCreate}><Plus data-icon="inline-start" />Nouveau connecteur</Button></EmptyContent>}</Empty>
        )}

        {filtered.length > 0 && <nav className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Pagination"><p className="text-sm text-muted-foreground">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} sur {filtered.length}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft data-icon="inline-start" />Précédent</Button><span className="min-w-20 text-center text-sm font-medium">{currentPage} / {pages}</span><Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage((value) => value + 1)}>Suivant<ChevronRight data-icon="inline-end" /></Button></div></nav>}
      </section>

      <section className="grid gap-3 rounded-2xl border bg-card p-5 md:grid-cols-3" aria-label="Principes du module">
        <div className="flex gap-3"><Database className="mt-0.5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Connecteur</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Capacités, endpoints et contrat technique.</p></div></div>
        <div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Connexion</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Valeurs d’accès, secrets et portée.</p></div></div>
        <div className="flex gap-3"><Activity className="mt-0.5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Source</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Origine d’information et Connexions autorisées.</p></div></div>
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4" role="presentation" onClick={() => { if (!isPending) setDeleteTarget(null) }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-connector-title" aria-describedby="delete-connector-description" className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2 /></div>
            <h2 id="delete-connector-title" className="mt-4 text-lg font-semibold">Supprimer {deleteTarget.name} ?</h2>
            <p id="delete-connector-description" className="mt-2 text-sm leading-6 text-muted-foreground">
              {deleteTarget.status === 'active' ? 'Ce connecteur est actif. Mettez-le en pause avant de pouvoir le supprimer.' : 'Cette action est définitive. Les tests et les connexions associés seront également supprimés.'}
            </p>
            {deleteError && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" disabled={isPending} onClick={() => setDeleteTarget(null)}>Annuler</Button>
              <Button variant="destructive" disabled={isPending || deleteTarget.status === 'active'} onClick={confirmDelete}>{isPending ? 'Suppression…' : 'Supprimer définitivement'}</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
