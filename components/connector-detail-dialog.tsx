'use client'

import { Activity, Copy, History, LoaderCircle, Pause, Play, Settings2, TestTubeDiagonal, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'

import { deleteConnector, duplicateConnector, getConnectorDetail, setConnectorStatus, testConnector } from '@/app/actions/connectors'
import { ConnectorTestResult } from '@/components/connector-test-panel'
import { HealthDot, KindIcon, StatusBadge, formatDuration } from '@/components/connector-ui'
import { ConnectorWorkbench } from '@/components/connector-workbench'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { AUTH_LABELS, getKindInfo, type AuthType } from '@/lib/connector-catalog'
import type { ConnectorDetail, ConnectorRunEntry, ConnectorViewer } from '@/lib/connector-types'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'config' | 'tests' | 'history'
type Result = { ok: boolean; message: string; id?: string }

type Props = {
  connectorId: string
  viewer: ConnectorViewer
  initialTab?: Tab
  onClose: () => void
  onNotify: (message: string) => void
  onOpenConnector: (id: string) => void
}

function runToOutcome(run: ConnectorRunEntry) {
  return { status: run.status, message: run.message, httpStatus: run.httpStatus, durationMs: run.durationMs ?? 0, itemsFound: run.itemsFound, checks: run.checks, sample: run.sample, finalUrl: run.finalUrl ?? undefined, contentType: run.contentType ?? undefined, bytes: run.bytes ?? undefined }
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold">{value}</dd>
    </div>
  )
}

export function ConnectorDetailDialog({ connectorId, viewer, initialTab = 'overview', onClose, onNotify, onOpenConnector }: Props) {
  const router = useRouter()
  const [detail, setDetail] = useState<ConnectorDetail | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    getConnectorDetail({ id: connectorId })
      .then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setLoadError(result.message)
          return
        }
        setLoadError('')
        setDetail(result.detail)
      })
      .catch(() => !cancelled && setLoadError('Impossible de charger ce connecteur.'))
    return () => {
      cancelled = true
    }
  }, [connectorId, reloadKey])

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1)
    router.refresh()
  }, [router])

  const run = useCallback(
    (name: string, action: () => Promise<Result>, after?: (result: Result) => void) => {
      setError('')
      setBusy(name)
      startTransition(async () => {
        const result = await action()
        setBusy(null)
        setConfirmDelete(false)
        if (!result.ok) {
          setError(result.message)
          return
        }
        onNotify(result.message)
        refresh()
        after?.(result)
      })
    },
    [onNotify, refresh],
  )

  const connector = detail?.connector
  const info = connector ? getKindInfo(connector.kind) : undefined
  const lastRun = detail?.runs[0]
  const canActivate = connector ? connector.status !== 'active' && connector.testedCurrentVersion && connector.health !== 'error' && connector.health !== 'unknown' : false

  const tabs: { id: Tab; label: string; icon: typeof Activity; count?: number }[] = [
    { id: 'overview', label: 'Vue d’ensemble', icon: Activity },
    { id: 'config', label: viewer.canManage ? 'Configuration' : 'Paramétrage', icon: Settings2 },
    { id: 'tests', label: 'Tests', icon: TestTubeDiagonal, count: detail?.runs.length },
    { id: 'history', label: 'Journal', icon: History },
  ]

  return (
    <Modal open onClose={onClose} title={connector?.name ?? 'Connecteur'} description={connector ? undefined : 'Chargement…'} size="2xl">
      {loadError ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">{loadError}</p>
      ) : !detail || !connector ? (
        <div className="flex flex-col gap-3" aria-busy="true"><div className="h-20 animate-pulse rounded-2xl bg-muted" /><div className="h-56 animate-pulse rounded-2xl bg-muted" /></div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><KindIcon kind={connector.kind} className="size-6" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-semibold tracking-[-0.02em]">{connector.name}</h3><StatusBadge status={connector.status} /></div>
              <p className="truncate text-sm text-muted-foreground">{info?.label} · {connector.host || 'adresse non définie'}</p>
            </div>
            <HealthDot connector={connector} />
          </div>

          <div className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="Sections du connecteur">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors', tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <Icon className="size-4" aria-hidden />{label}
                {typeof count === 'number' && count > 0 && <span className="rounded-full bg-secondary px-1.5 text-xs font-semibold text-secondary-foreground">{count}</span>}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          {tab === 'overview' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" role="tabpanel">
              <div className="flex min-w-0 flex-col gap-5">
                {connector.description && <p className="text-sm leading-6 text-muted-foreground">{connector.description}</p>}
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Fact label="Authentification" value={AUTH_LABELS[connector.authType as AuthType]?.label.split(' (')[0] ?? 'Aucune'} />
                  <Fact label="Connexions" value={connector.authType === 'none' ? 'Non requises' : String(connector.connectionCount)} />
                  <Fact label="Latence" value={formatDuration(connector.lastLatencyMs)} />
                  <Fact label="Dernier test" value={connector.lastCheckAt ?? 'Jamais'} />
                  <Fact label="Version" value={`v${connector.version}`} />
                </dl>

                {!connector.testedCurrentVersion && connector.status !== 'active' && (
                  <p role="note" className="rounded-xl bg-chart-4/15 px-3 py-2.5 text-sm leading-6">{connector.lastCheckAt ? 'La configuration a changé depuis le dernier test.' : 'Ce connecteur n’a pas encore été testé.'} Lancez un test pour pouvoir l’activer.</p>
                )}

                {viewer.canManage && (
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={isPending} onClick={() => run('test', () => testConnector({ id: connector.id }))}>{busy === 'test' ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <TestTubeDiagonal data-icon="inline-start" />}{busy === 'test' ? 'Test en cours…' : 'Tester maintenant'}</Button>
                    {connector.status === 'active' ? (
                      <Button variant="outline" disabled={isPending} onClick={() => run('pause', () => setConnectorStatus({ id: connector.id, status: 'paused' }))}><Pause data-icon="inline-start" />Mettre en pause</Button>
                    ) : (
                      <Button variant="outline" disabled={isPending || !canActivate} title={canActivate ? undefined : 'Un test réussi avec la configuration actuelle est requis'} onClick={() => run('activate', () => setConnectorStatus({ id: connector.id, status: 'active' }))}><Play data-icon="inline-start" />Activer</Button>
                    )}
                    <Button variant="outline" disabled={isPending} onClick={() => run('duplicate', () => duplicateConnector({ id: connector.id }), (result) => result.id && onOpenConnector(result.id))}><Copy data-icon="inline-start" />Dupliquer</Button>
                  </div>
                )}

                {viewer.canManage && (
                  <section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 p-4">
                    <h4 className="text-sm font-semibold">Zone sensible</h4>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">{connector.status === 'active' ? 'Mettez le connecteur en pause pour pouvoir le supprimer.' : 'La suppression est définitive et efface l’historique de tests.'}</p>
                      {confirmDelete ? (
                        <span className="flex gap-1"><Button variant="destructive" disabled={isPending} onClick={() => run('delete', () => deleteConnector({ id: connector.id }), onClose)}>{busy === 'delete' ? 'Suppression…' : 'Confirmer'}</Button><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button></span>
                      ) : (
                        <Button variant="destructive" disabled={connector.status === 'active'} onClick={() => setConfirmDelete(true)}><Trash2 data-icon="inline-start" />Supprimer</Button>
                      )}
                    </div>
                  </section>
                )}
              </div>

              <aside className="min-w-0" aria-label="Dernier diagnostic">
                {lastRun ? (
                  <div className="flex flex-col gap-3">
                    <h4 className="text-sm font-semibold">Dernier diagnostic</h4>
                    <ConnectorTestResult outcome={runToOutcome(lastRun)} at={`${lastRun.at} · ${lastRun.actor}`} compact />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed px-4 py-10 text-center"><p className="text-sm font-medium">Aucun diagnostic</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Le résultat du premier test apparaîtra ici.</p></div>
                )}
              </aside>
            </div>
          )}

          {tab === 'config' && (
            <div role="tabpanel">
              <ConnectorWorkbench key={connector.version} kind={connector.kind} existing={{ connector, config: detail.config, connections: detail.connections }} canManage={viewer.canManage} onSaved={({ message }) => { onNotify(message); refresh() }} onCancel={onClose} />
            </div>
          )}

          {tab === 'tests' && (
            <div role="tabpanel">
              {detail.runs.length === 0 ? <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Aucun test enregistré.</p> : (
                <ul className="flex flex-col gap-2">
                  {detail.runs.map((entry) => (
                    <li key={entry.id}>
                      <details className="group rounded-2xl border bg-card [&_summary::-webkit-details-marker]:hidden">
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className={cn('size-2.5 shrink-0 rounded-full', entry.status === 'success' ? 'bg-primary' : entry.status === 'warning' ? 'bg-chart-4' : 'bg-destructive')} aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.message}</span>
                          <span className="text-xs text-muted-foreground">{entry.httpStatus ? `HTTP ${entry.httpStatus} · ` : ''}{formatDuration(entry.durationMs)}{entry.itemsFound !== null ? ` · ${entry.itemsFound} élément(s)` : ''}</span>
                          <span className="text-xs text-muted-foreground">{entry.at} · {entry.actor}</span>
                        </summary>
                        <div className="border-t p-4"><ConnectorTestResult outcome={runToOutcome(entry)} /></div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div role="tabpanel">
              {detail.history.length === 0 ? <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Aucun événement enregistré.</p> : (
                <ol className="flex flex-col gap-3">
                  {detail.history.map((entry) => (
                    <li key={entry.id} className="flex gap-3 text-sm">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                      <div className="min-w-0 flex-1"><p className="font-medium">{entry.label}{entry.detail && <span className="font-normal text-muted-foreground"> · {entry.detail}</span>}</p><p className="text-xs text-muted-foreground">Par {entry.actor} · {entry.at}</p></div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
