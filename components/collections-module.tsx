'use client'

import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  DatabaseZap,
  Gauge,
  History,
  Menu,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  TimerReset,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import useSWR from 'swr'

import { getCollectionDetail, retryCollection, updateCollectionPolicy } from '@/app/actions/collections'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { UserMenu } from '@/components/user-menu'
import { Sidebar } from '@/components/veillio-dashboard'
import type { CollectionDetail, CollectionOccurrenceSummary, CollectionPolicySummary, CollectionsOverview, CollectionState } from '@/lib/collection-types'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'history' | 'incidents' | 'settings'
type StateFilter = 'all' | CollectionState

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
const relativeFormatter = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })

const stateMeta: Record<CollectionState, { label: string; icon: typeof Clock3; badge: string }> = {
  scheduled: { label: 'Planifiée', icon: Clock3, badge: 'bg-muted text-muted-foreground' },
  running: { label: 'En cours', icon: Activity, badge: 'bg-primary/10 text-primary' },
  deferred: { label: 'Reportée', icon: TimerReset, badge: 'bg-chart-4/15 text-foreground' },
  completed: { label: 'Terminée', icon: CheckCircle2, badge: 'bg-chart-2/15 text-foreground' },
  failed: { label: 'En échec', icon: XCircle, badge: 'bg-destructive/10 text-destructive' },
}

async function fetchOverview(url: string): Promise<CollectionsOverview> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Impossible d’actualiser les collectes.')
  return response.json() as Promise<CollectionsOverview>
}

function formatDate(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : '—'
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return '—'
  if (milliseconds < 1000) return `${milliseconds} ms`
  const seconds = Math.round(milliseconds / 1000)
  if (seconds < 60) return `${seconds} s`
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function relativeDate(value: string) {
  const difference = new Date(value).getTime() - Date.now()
  const minutes = Math.round(difference / 60_000)
  if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 48) return relativeFormatter.format(hours, 'hour')
  return dateTimeFormatter.format(new Date(value))
}

function StatusBadge({ state }: { state: CollectionState }) {
  const meta = stateMeta[state]
  const Icon = meta.icon
  return <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', meta.badge)}><Icon className={cn('size-3.5', state === 'running' && 'animate-pulse')} aria-hidden />{meta.label}</span>
}

function SummaryCards({ overview }: { overview: CollectionsOverview }) {
  const cards = [
    { label: 'Activité', value: overview.stats.running + overview.stats.scheduled, detail: `${overview.stats.running} en cours · ${overview.stats.scheduled} planifiée(s)`, icon: Activity },
    { label: 'Taux de réussite', value: `${overview.stats.successRate}%`, detail: `${overview.stats.completed} terminée(s) sur ${overview.stats.completed + overview.stats.failed}`, icon: Gauge },
    { label: 'Nouveaux contenus', value: overview.stats.newItems, detail: 'Sur toutes les collectes observées', icon: DatabaseZap },
    { label: 'À surveiller', value: overview.stats.failed + overview.stats.deferred, detail: `${overview.stats.failed} échec(s) · ${overview.stats.deferred} report(s)`, icon: AlertTriangle },
  ]
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs de collecte">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.label} className="group flex min-h-32 flex-col rounded-2xl border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
            <div className="flex items-start justify-between gap-3"><p className="text-xs font-medium text-muted-foreground">{card.label}</p><span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" aria-hidden /></span></div>
            <strong className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{card.value}</strong>
            <span className="mt-auto pt-2 text-xs text-muted-foreground">{card.detail}</span>
          </article>
        )
      })}
    </section>
  )
}

function PolicyForm({ policy, onSaved }: { policy: CollectionPolicySummary; onSaved: (message: string) => void }) {
  const [values, setValues] = useState({ maxParallel: policy.maxParallel, maxAttempts: policy.maxAttempts, baseBackoffSeconds: policy.baseBackoffSeconds, maxQuotaDeferralMinutes: policy.maxQuotaDeferralMinutes, retentionDays: policy.retentionDays })
  const [busy, setBusy] = useState(false)
  const fields = [
    { key: 'maxParallel' as const, label: 'Exécutions parallèles', hint: 'De 1 à 50 travaux simultanés', min: 1, max: 50, suffix: 'travaux' },
    { key: 'maxAttempts' as const, label: 'Tentatives maximales', hint: 'Inclut la tentative initiale', min: 1, max: 10, suffix: 'tentatives' },
    { key: 'baseBackoffSeconds' as const, label: 'Délai initial de reprise', hint: 'Le délai augmente exponentiellement', min: 5, max: 3600, suffix: 'secondes' },
    { key: 'maxQuotaDeferralMinutes' as const, label: 'Report quota maximal', hint: 'Au-delà, la collecte passe en échec', min: 15, max: 10080, suffix: 'minutes' },
    { key: 'retentionDays' as const, label: 'Rétention des journaux', hint: 'Les métriques agrégées restent disponibles', min: 7, max: 365, suffix: 'jours' },
  ]

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const result = await updateCollectionPolicy(values)
    setBusy(false)
    onSaved(result.message)
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form onSubmit={submit} className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Settings className="size-5" aria-hidden /></span><div><h2 className="font-semibold">Politique globale</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Ces valeurs s’appliquent par défaut à tous les Connecteurs. Les surcharges par Connecteur pourront les spécialiser sans modifier ce socle.</p></div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-2 rounded-xl border bg-background p-4">
              <span className="text-sm font-medium">{field.label}</span>
              <span className="flex items-center gap-2"><input type="number" min={field.min} max={field.max} value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: Number(event.target.value) }))} className="h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm font-medium outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" required /><span className="text-xs text-muted-foreground">{field.suffix}</span></span>
              <span className="text-xs leading-5 text-muted-foreground">{field.hint}</span>
            </label>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between gap-4 border-t pt-5"><p className="text-xs text-muted-foreground">Dernière mise à jour : {formatDate(policy.updatedAt)}</p><Button type="submit" disabled={busy}>{busy && <RefreshCw data-icon="inline-start" className="animate-spin" />}{busy ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
      </form>
      <aside className="flex flex-col gap-4 rounded-2xl border bg-primary/5 p-5 sm:p-6"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><ShieldCheck className="size-5" aria-hidden /></span><div><h2 className="font-semibold">Garanties actives</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Le moteur conserve l’historique et applique les protections avant toute exécution.</p></div><ul className="flex flex-col gap-3 text-sm"><li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />Idempotence par Veille, Source et occurrence planifiée</li><li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />Une seule exécution active par Source</li><li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />Relances liées sans écraser l’exécution initiale</li><li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />Tentatives et erreurs historisées séparément</li></ul></aside>
    </section>
  )
}

export function CollectionsModule({ initialOverview }: { initialOverview: CollectionsOverview }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [detail, setDetail] = useState<CollectionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const { data: overview = initialOverview, isValidating, mutate } = useSWR('/api/collections', fetchOverview, {
    fallbackData: initialOverview,
    refreshInterval: initialOverview.stats.running > 0 ? 5000 : 20000,
    revalidateOnFocus: true,
  })

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4500)
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return overview.occurrences.filter((item) => {
      const inTab = tab === 'overview' || (tab === 'history' ? item.state === 'completed' || item.state === 'failed' : tab === 'incidents' ? item.state === 'failed' || item.state === 'deferred' : false)
      const inState = stateFilter === 'all' || item.state === stateFilter
      const inSearch = !needle || `${item.watchName} ${item.sourceName} ${item.connectorName} ${item.connectionName} ${item.errorCode ?? ''}`.toLowerCase().includes(needle)
      return inTab && inState && inSearch
    })
  }, [overview.occurrences, query, stateFilter, tab])

  async function openDetail(id: string) {
    setDetailLoading(true)
    const result = await getCollectionDetail({ id })
    setDetailLoading(false)
    if (result.ok) setDetail(result.detail)
    else notify(result.message)
  }

  async function retry(occurrence: CollectionOccurrenceSummary) {
    setBusyId(occurrence.id)
    const result = await retryCollection({ id: occurrence.id })
    setBusyId(null)
    notify(result.message)
    if (result.ok) {
      setDetail(null)
      await mutate()
    }
  }

  const tabs: { id: Tab; label: string; count?: number; icon: typeof Activity }[] = [
    { id: 'overview', label: 'Vue d’ensemble', count: overview.stats.total, icon: Activity },
    { id: 'history', label: 'Historique', count: overview.stats.completed + overview.stats.failed, icon: History },
    { id: 'incidents', label: 'Incidents', count: overview.stats.failed + overview.stats.deferred, icon: AlertTriangle },
    ...(overview.viewer.canConfigure ? [{ id: 'settings' as const, label: 'Paramètres', icon: Settings }] : []),
  ]
  const filters: { id: StateFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Tous', count: overview.stats.total },
    { id: 'running', label: 'En cours', count: overview.stats.running },
    { id: 'scheduled', label: 'Planifiées', count: overview.stats.scheduled },
    { id: 'deferred', label: 'Reportées', count: overview.stats.deferred },
    { id: 'completed', label: 'Terminées', count: overview.stats.completed },
    { id: 'failed', label: 'En échec', count: overview.stats.failed },
  ]

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Collectes" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8"><Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button><div className="hidden text-sm text-muted-foreground sm:block">Intégrations <span className="px-2">/</span> <strong className="font-medium text-foreground">Collectes</strong></div><div className="ml-auto flex items-center gap-1"><span className="mr-2 hidden items-center gap-1.5 text-xs text-muted-foreground md:flex"><span className={cn('size-1.5 rounded-full bg-primary', isValidating && 'animate-pulse')} />{isValidating ? 'Synchronisation…' : `Actualisé ${relativeDate(overview.refreshedAt)}`}</span><Button variant="ghost" size="icon-lg" aria-label="Actualiser" onClick={() => void mutate()} disabled={isValidating}><RefreshCw className={cn(isValidating && 'animate-spin')} /></Button><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><UserMenu /></div></header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section><p className="mb-2 text-xs font-medium text-primary">{overview.organizationName}</p><h1 className="text-balance text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Collectes</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Supervisez chaque occurrence de Veille par Source, suivez les reprises et intervenez sur les incidents sans perdre l’historique d’exécution.</p></section>
            <SummaryCards overview={overview} />

            <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Vues Collectes">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined} className={cn('relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', tab === item.id && 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary')}><Icon className="size-4" aria-hidden />{item.label}{item.count !== undefined && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">{item.count}</span>}</button> })}</nav>

            {tab === 'settings' ? (
              <PolicyForm policy={overview.policy} onSaved={(message) => { notify(message); void mutate() }} />
            ) : (
              <>
                <section className="flex flex-col gap-3 xl:flex-row xl:items-center" aria-label="Filtres des collectes">
                  <label className="relative min-w-0 flex-1"><span className="sr-only">Rechercher une collecte</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-card pl-10 pr-3 text-sm outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/20" placeholder="Veille, Source, Connecteur, Connexion ou code d’erreur" /></label>
                  <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filtrer par état">{filters.map((item) => <button key={item.id} type="button" role="tab" aria-selected={stateFilter === item.id} onClick={() => setStateFilter(item.id)} className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors', stateFilter === item.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>{item.label}<span className="text-xs opacity-75">{item.count}</span></button>)}</div>
                </section>

                {visible.length > 0 ? (
                  <section className="overflow-hidden rounded-2xl border bg-card" aria-label="Liste des occurrences de collecte">
                    <div className="overflow-x-auto"><table className="w-full min-w-[1040px] border-collapse text-left"><thead className="bg-muted/50 text-xs font-medium text-muted-foreground"><tr><th className="px-5 py-3">État</th><th className="px-4 py-3">Veille / Source</th><th className="px-4 py-3">Exécution</th><th className="px-4 py-3 text-right">Résultats</th><th className="px-4 py-3">Planification</th><th className="w-12 px-3 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y">{visible.map((item) => <tr key={item.id} className="group cursor-pointer transition-colors hover:bg-muted/35" onClick={() => void openDetail(item.id)}><td className="px-5 py-4"><StatusBadge state={item.state} /></td><td className="px-4 py-4"><p className="max-w-[250px] truncate text-sm font-medium">{item.watchName}</p><p className="mt-1 max-w-[250px] truncate text-xs text-muted-foreground">{item.sourceName} · {item.connectorName}</p></td><td className="px-4 py-4"><p className="text-sm">{formatDuration(item.durationMs)}</p><p className="mt-1 text-xs text-muted-foreground">{item.attemptCount} tentative(s) · {item.connectionName}</p></td><td className="px-4 py-4 text-right"><p className="text-sm font-semibold tabular-nums">{item.newItems} nouveau(x)</p><p className="mt-1 text-xs tabular-nums text-muted-foreground">{item.itemsRetrieved} récupéré(s)</p></td><td className="px-4 py-4"><p className="text-sm">{formatDate(item.scheduledFor)}</p>{item.deferredUntil && <p className="mt-1 text-xs text-muted-foreground">Reprise {relativeDate(item.deferredUntil)}</p>}{item.errorCode && <p className="mt-1 text-xs font-medium text-destructive">{item.errorCode}</p>}</td><td className="px-3 py-4"><Button variant="ghost" size="icon-sm" aria-label={`Voir ${item.watchName} — ${item.sourceName}`}><ChevronRight /></Button></td></tr>)}</tbody></table></div>
                  </section>
                ) : (
                  <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-16 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><DatabaseZap className="size-7" aria-hidden /></span><div><h2 className="text-lg font-semibold tracking-[-0.02em]">{overview.stats.total === 0 ? 'Aucune collecte pour le moment' : 'Aucune collecte ne correspond'}</h2><p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">{overview.stats.total === 0 ? 'Les occurrences apparaîtront ici lorsque les Veilles planifiées déclencheront leurs Sources. Aucun exemple artificiel n’est injecté.' : 'Modifiez la recherche, le filtre d’état ou la vue sélectionnée.'}</p></div>{overview.stats.total > 0 && <Button variant="outline" onClick={() => { setQuery(''); setStateFilter('all'); setTab('overview') }}>Réinitialiser les filtres</Button>}</section>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <Modal open={detail !== null || detailLoading} onClose={() => { setDetail(null); setDetailLoading(false) }} title={detail ? `${detail.occurrence.watchName} — ${detail.occurrence.sourceName}` : 'Chargement de la collecte'} description={detail ? `Occurrence ${detail.occurrence.id.slice(0, 8)} · ${detail.occurrence.connectorName}` : undefined} size="xl">
        {detailLoading && !detail ? <div className="flex h-48 items-center justify-center"><RefreshCw className="size-6 animate-spin text-primary" aria-label="Chargement" /></div> : detail && <div className="flex flex-col gap-6"><div className="flex flex-wrap items-center justify-between gap-3"><StatusBadge state={detail.occurrence.state} />{overview.viewer.canRetry && (detail.occurrence.state === 'failed' || detail.occurrence.state === 'deferred') && <Button onClick={() => void retry(detail.occurrence)} disabled={busyId === detail.occurrence.id}><RotateCcw data-icon="inline-start" className={cn(busyId === detail.occurrence.id && 'animate-spin')} />{busyId === detail.occurrence.id ? 'Planification…' : 'Relancer cette Source'}</Button>}</div><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[{ label: 'Planifiée', value: formatDate(detail.occurrence.scheduledFor) }, { label: 'Durée', value: formatDuration(detail.occurrence.durationMs) }, { label: 'Nouveaux contenus', value: String(detail.occurrence.newItems) }, { label: 'Doublons', value: String(detail.occurrence.duplicateItems) }].map((item) => <div key={item.label} className="rounded-xl border bg-background p-4"><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-1 text-sm font-semibold">{item.value}</dd></div>)}</dl>{detail.occurrence.errorMessage && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-destructive"><AlertTriangle className="size-4" />{detail.occurrence.errorCode ?? 'Erreur de collecte'}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail.occurrence.errorMessage}</p></div>}<section><h3 className="text-sm font-semibold">Tentatives</h3>{detail.attempts.length > 0 ? <ol className="mt-3 flex flex-col gap-2">{detail.attempts.map((attempt) => <li key={attempt.id} className="flex flex-col justify-between gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-medium">Tentative {attempt.attemptNumber} · <span className="font-normal text-muted-foreground">{stateMeta[attempt.state].label}</span></p><p className="mt-1 text-xs text-muted-foreground">{formatDate(attempt.startedAt)} · {formatDuration(attempt.durationMs)} · {attempt.itemsRetrieved} élément(s)</p>{attempt.errorMessage && <p className="mt-2 text-xs text-destructive">{attempt.errorCode ? `${attempt.errorCode} — ` : ''}{attempt.errorMessage}</p>}</div>{attempt.retryable && <span className="self-start rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Reprise autorisée</span>}</li>)}</ol> : <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Aucune tentative n’a encore été enregistrée pour cette occurrence.</p>}</section></div>}
      </Modal>

      {toast && <div role="status" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border bg-foreground px-4 py-3 text-sm font-medium text-background shadow-xl">{toast}</div>}
    </div>
  )
}
