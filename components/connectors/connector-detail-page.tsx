'use client'

import {
  Activity,
  ArrowLeft,
  Braces,
  CircleAlert,
  Copy,
  History,
  KeyRound,
  LoaderCircle,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  TestTubeDiagonal,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'

import { deleteConnector, duplicateConnector, getConnectorDetail, setConnectorStatus, testConnector } from '@/app/actions/connectors'
import { ConnectorTestResult } from '@/components/connector-test-panel'
import { ConnectorLogo, HealthDot, StatusBadge, formatDuration } from '@/components/connector-ui'
import { ConnectorWorkbench } from '@/components/connector-workbench'
import { OperationsContract } from '@/components/connectors/operations-contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { authMethodRegistry } from '@/lib/auth-method-registry'
import { getServiceDefinition, selectedAuthMethods } from '@/lib/connector-service-catalog'
import type { ConnectorDetail, ConnectorRunEntry, ConnectorViewer } from '@/lib/connector-types'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'contract' | 'tests' | 'history'
type Result = { ok: boolean; message: string; id?: string }

type Props = {
  connectorId: string
  viewer: ConnectorViewer
  onBack: () => void
  onNotify: (message: string) => void
  onOpenConnector: (id: string) => void
}

function runToOutcome(run: ConnectorRunEntry) {
  return { status: run.status, message: run.message, httpStatus: run.httpStatus, durationMs: run.durationMs ?? 0, itemsFound: run.itemsFound, checks: run.checks, sample: run.sample, finalUrl: run.finalUrl ?? undefined, contentType: run.contentType ?? undefined, bytes: run.bytes ?? undefined }
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>
}

export function ConnectorDetailPage({ connectorId, viewer, onBack, onNotify, onOpenConnector }: Props) {
  const [detail, setDetail] = useState<ConnectorDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    getConnectorDetail({ id: connectorId }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setLoadError(result.message)
        return
      }
      setDetail(result.detail)
      setLoadError('')
    }).catch(() => !cancelled && setLoadError('Impossible de charger ce connecteur.'))
    return () => { cancelled = true }
  }, [connectorId, reloadKey])

  const refresh = useCallback(() => setReloadKey((value) => value + 1), [])

  const run = useCallback((name: string, action: () => Promise<Result>, after?: (result: Result) => void) => {
    setBusy(name)
    setError('')
    startTransition(async () => {
      const result = await action()
      setBusy('')
      setConfirmDelete(false)
      if (!result.ok) {
        setError(result.message)
        return
      }
      onNotify(result.message)
      refresh()
      after?.(result)
    })
  }, [onNotify, refresh])

  if (loadError) return <div className="rounded-2xl border bg-card p-8"><p role="alert" className="text-sm text-destructive">{loadError}</p><Button className="mt-4" variant="outline" onClick={onBack}><ArrowLeft data-icon="inline-start" />Retour</Button></div>
  if (!detail) return <div className="flex flex-col gap-4" aria-busy="true"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>

  const { connector, config } = detail
  const service = getServiceDefinition(connector.serviceId)
  const authMethods = selectedAuthMethods(config)
  const canActivate = connector.status !== 'active' && connector.operational && connector.testedCurrentVersion && connector.health !== 'error' && connector.health !== 'unknown'
  const lastRun = detail.runs[0]
  const tabs: { id: Tab; label: string; icon: typeof Activity; count?: number }[] = [
    { id: 'overview', label: 'Vue d’ensemble', icon: Activity },
    { id: 'contract', label: 'Contrat technique', icon: Braces },
    { id: 'tests', label: 'Tests', icon: TestTubeDiagonal, count: detail.runs.length },
    { id: 'history', label: 'Journal', icon: History, count: detail.history.length },
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 border-b pb-5">
        <Button variant="ghost" size="sm" className="self-start" onClick={onBack}><ArrowLeft data-icon="inline-start" />Retour au catalogue</Button>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="flex min-w-0 items-center gap-4"><ConnectorLogo kind={connector.kind} logoUrl={connector.logoUrl} className="size-14 rounded-2xl" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate font-serif text-3xl tracking-tight sm:text-4xl">{connector.name}</h1><StatusBadge status={connector.status} /></div><p className="mt-2 text-sm text-muted-foreground">{connector.provider} · {connector.adapter}</p></div></div>
          <div className="flex flex-wrap items-center gap-2"><HealthDot connector={connector} />{viewer.canManage && <><Button disabled={isPending || !connector.operational} onClick={() => run('test', () => testConnector({ id: connector.id }))}>{busy === 'test' ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <TestTubeDiagonal data-icon="inline-start" />}{busy === 'test' ? 'Test en cours…' : 'Tester'}</Button>{connector.status === 'active' ? <Button variant="outline" disabled={isPending} onClick={() => run('pause', () => setConnectorStatus({ id: connector.id, status: 'paused' }))}><Pause data-icon="inline-start" />Mettre en pause</Button> : <Button variant="outline" disabled={isPending || !canActivate} onClick={() => run('activate', () => setConnectorStatus({ id: connector.id, status: 'active' }))}><Play data-icon="inline-start" />Activer</Button>}<Button variant="outline" disabled={isPending} onClick={() => run('duplicate', () => duplicateConnector({ id: connector.id }), (result) => result.id && onOpenConnector(result.id))}><Copy data-icon="inline-start" />Dupliquer</Button></>}</div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Sections du connecteur">{tabs.map(({ id, label, icon: Icon, count }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium', tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}><Icon />{label}{typeof count === 'number' && count > 0 && <Badge variant="secondary">{count}</Badge>}</button>)}</div>
      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      {tab === 'overview' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]" role="tabpanel"><div className="flex flex-col gap-5"><section className="rounded-2xl border bg-card p-5"><div className="flex flex-col gap-2"><p className="text-xs font-semibold text-primary">Contrat Connecteur</p><h2 className="font-serif text-2xl">{service?.name ?? connector.provider}</h2><p className="text-sm leading-6 text-muted-foreground">{connector.description || service?.description || 'Aucune description.'}</p></div><dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Fact label="Catégorie" value={service?.category ?? connector.category} /><Fact label="Écosystème" value={service?.ecosystem ?? '—'} /><Fact label="Adaptateur" value={connector.adapter} /><Fact label="Version" value={`v${connector.version}`} /><Fact label="Connexions" value={connector.connectionCount} /><Fact label="Créé le" value={connector.createdAt} /></dl></section>{!connector.operational && <div className="flex items-start gap-3 rounded-2xl bg-secondary p-4 text-sm"><CircleAlert className="mt-0.5 shrink-0" /><p><strong>Définition en brouillon uniquement.</strong> L’adaptateur est référencé mais non attesté dans le registre déployé. Le test et l’activation restent bloqués.</p></div>}{viewer.canManage && <section className="rounded-2xl border border-destructive/30 bg-card p-5"><h2 className="text-sm font-semibold">Zone sensible</h2><div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">La suppression est refusée tant qu’une Connexion ou une Source utilise ce Connecteur.</p>{confirmDelete ? <div className="flex gap-2"><Button variant="destructive" disabled={isPending} onClick={() => run('delete', () => deleteConnector({ id: connector.id }), onBack)}>{busy === 'delete' ? 'Suppression…' : 'Confirmer'}</Button><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button></div> : <Button variant="destructive" disabled={connector.status === 'active'} onClick={() => setConfirmDelete(true)}><Trash2 data-icon="inline-start" />Supprimer</Button>}</div></section>}</div><aside className="rounded-2xl border bg-card p-5"><h2 className="text-sm font-semibold">Dernier diagnostic</h2>{lastRun ? <div className="mt-4"><ConnectorTestResult outcome={runToOutcome(lastRun)} at={`${lastRun.at} · ${lastRun.actor}`} compact /></div> : <div className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucun diagnostic enregistré.</div>}</aside></div>}

      {tab === 'contract' && <div className="flex flex-col gap-5" role="tabpanel"><div className="grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound /></span><div><h2 className="font-semibold">Méthodes d’authentification</h2><p className="text-xs text-muted-foreground">Références du catalogue central</p></div></div><div className="mt-4 flex flex-col gap-2">{authMethods.length ? authMethods.map((id) => { const method = authMethodRegistry.get(id); return <div key={id} className="rounded-xl bg-muted/50 p-3"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{method?.label ?? id}</p><Badge variant="outline">{id}</Badge></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{method?.description}</p></div> }) : <p className="text-sm text-muted-foreground">Aucune méthode V3 enregistrée.</p>}</div></section><section className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck /></span><div><h2 className="font-semibold">Paramètres de Connexion</h2><p className="text-xs text-muted-foreground">Séparés des secrets et valeurs d’accès</p></div></div><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Fact label="Adresse" value={connector.host || 'Non requise'} /><Fact label="Type moteur" value={connector.kind.toUpperCase()} /><Fact label="Tentatives" value={config.retry.maxAttempts} /><Fact label="Volume maximum" value={config.http.maxItems} /></dl></section></div>{connector.kind === 'api' && <OperationsContract operations={detail.operations} />}<section className="overflow-hidden rounded-2xl border bg-card"><div className="flex flex-col justify-between gap-3 border-b p-5 sm:flex-row sm:items-center"><div><h2 className="font-semibold">Politique d’en-têtes HTTP</h2><p className="mt-1 text-xs text-muted-foreground">Règles globales et spécifiques aux endpoints.</p></div>{viewer.canManage && <Button variant="outline" onClick={() => setEditing((value) => !value)}><Settings2 data-icon="inline-start" />{editing ? 'Fermer l’éditeur' : 'Configuration avancée'}</Button>}</div>{config.http.headerPolicy.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-3 font-medium">En-tête</th><th className="p-3 font-medium">Source</th><th className="p-3 font-medium">Portée</th><th className="p-3 font-medium">Valeur / paramètre</th></tr></thead><tbody>{config.http.headerPolicy.map((header) => <tr key={header.id} className="border-t"><td className="p-3 font-mono text-xs font-semibold">{header.name}</td><td className="p-3">{header.source}</td><td className="p-3">{header.scope === 'global' ? 'Global' : header.endpointId || 'Endpoint'}</td><td className="p-3 font-mono text-xs">{header.sensitive ? 'Valeur protégée dans Connexions' : header.value || '—'}</td></tr>)}</tbody></table></div> : <p className="p-8 text-center text-sm text-muted-foreground">Aucune règle personnalisée.</p>}</section>{editing && <section className="rounded-2xl border bg-card p-5"><ConnectorWorkbench key={connector.version} kind={connector.kind} existing={{ connector, config, connections: detail.connections }} canManage={viewer.canManage} onSaved={({ message }) => { onNotify(message); setEditing(false); refresh() }} /></section>}</div>}

      {tab === 'tests' && <div role="tabpanel">{detail.runs.length === 0 ? <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Aucun test enregistré.</p> : <ul className="flex flex-col gap-2">{detail.runs.map((runEntry) => <li key={runEntry.id}><details className="rounded-2xl border bg-card"><summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4"><span className={cn('size-2.5 rounded-full', runEntry.status === 'success' ? 'bg-primary' : runEntry.status === 'warning' ? 'bg-chart-4' : 'bg-destructive')} /><span className="min-w-0 flex-1 text-sm font-semibold">{runEntry.message}</span><span className="text-xs text-muted-foreground">{formatDuration(runEntry.durationMs)} · {runEntry.at}</span></summary><div className="border-t p-4"><ConnectorTestResult outcome={runToOutcome(runEntry)} /></div></details></li>)}</ul>}</div>}

      {tab === 'history' && <div role="tabpanel">{detail.history.length === 0 ? <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Aucun événement enregistré.</p> : <ol className="flex flex-col gap-3">{detail.history.map((entry) => <li key={entry.id} className="flex gap-3 rounded-2xl border bg-card p-4"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm font-semibold">{entry.label}{entry.detail && <span className="font-normal text-muted-foreground"> · {entry.detail}</span>}</p><p className="mt-1 text-xs text-muted-foreground">Par {entry.actor} · {entry.at}</p></div></li>)}</ol>}</div>}
    </section>
  )
}
