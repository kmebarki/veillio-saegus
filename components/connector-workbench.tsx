'use client'

import { FlaskConical, LoaderCircle, Save, TestTubeDiagonal } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'

import { createConnector, testConnectorDraft, updateConnector } from '@/app/actions/connectors'
import { ConnectorConfigForm, type ConnectorDraft } from '@/components/connector-config-form'
import { ConnectorTestResult } from '@/components/connector-test-panel'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/modal'
import type { ConnectionOption } from '@/lib/connection-types'
import { defaultConfig, isHttpKind, needsSecret, type ConnectorConfig, type ConnectorKind } from '@/lib/connector-catalog'
import type { ConnectorSummary, TestOutcome } from '@/lib/connector-types'

type Props = {
  kind: ConnectorKind
  initialConfig?: ConnectorConfig
  existing?: { connector: ConnectorSummary; config: ConnectorConfig; connections?: ConnectionOption[] }
  canManage: boolean
  onSaved: (result: { message: string; id?: string }) => void
  onCancel?: () => void
}

function numbersAreValid(config: ConnectorConfig) {
  const values = [config.http.timeoutSec, config.http.maxItems, config.retry.maxAttempts, config.retry.backoffSec, config.api.pagination.pageSize, config.api.pagination.maxPages]
  return values.every((value) => Number.isFinite(value))
}

export function ConnectorWorkbench({ kind, initialConfig, existing, canManage, onSaved, onCancel }: Props) {
  const initial = useMemo<ConnectorDraft>(
    () => ({
      name: existing?.connector.name ?? '',
      description: existing?.connector.description ?? '',
      logoUrl: existing?.connector.logoUrl ?? '',
      config: existing?.config ?? initialConfig ?? defaultConfig(kind),
    }),
    [existing, initialConfig, kind],
  )
  const [draft, setDraft] = useState<ConnectorDraft>(initial)
  const [connectionId, setConnectionId] = useState('')
  const connections = existing?.connections ?? []
  const [outcome, setOutcome] = useState<{ result: TestOutcome; snapshot: string; at: string } | null>(null)
  const [error, setError] = useState('')
  const [isTesting, startTesting] = useTransition()
  const [isSaving, startSaving] = useTransition()

  const snapshot = JSON.stringify({ draft, connectionId })
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const stale = outcome !== null && outcome.snapshot !== snapshot
  const readOnly = !canManage
  const requiresCredential = needsSecret(draft.config.auth.type)

  function test() {
    setError('')
    if (!numbersAreValid(draft.config)) {
      setError('Un des champs numériques est vide ou invalide.')
      return
    }
    startTesting(async () => {
      const result = await testConnectorDraft({ id: existing?.connector.id, kind, config: draft.config, connectionId: connectionId || undefined })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setOutcome({ result: result.outcome, snapshot, at: new Intl.DateTimeFormat('fr-FR', { timeStyle: 'medium' }).format(new Date()) })
    })
  }

  function save() {
    setError('')
    if (!numbersAreValid(draft.config)) {
      setError('Un des champs numériques est vide ou invalide.')
      return
    }
    startSaving(async () => {
      const base = { name: draft.name, description: draft.description, logoUrl: draft.logoUrl, config: draft.config }
      if (existing) {
        const updated = await updateConnector({ ...base, id: existing.connector.id, version: existing.connector.version })
        if (!updated.ok) {
          setError(updated.message)
          return
        }
        onSaved({ message: updated.message, id: existing.connector.id })
        return
      }
      const created = await createConnector({ ...base, kind })
      if (!created.ok) {
        setError(created.message)
        return
      }
      onSaved({ message: created.message, id: created.id })
    })
  }

  const hasTarget = isHttpKind(kind) ? draft.config.url.trim().length > 0 : kind === 'imap' ? draft.config.imap.host.trim().length > 0 : true
  const canSave = canManage && draft.name.trim().length >= 2 && hasTarget && (existing ? dirty : true) && !isSaving

  return (
    <form
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) save()
      }}
    >
      <div className="min-w-0">
        <ConnectorConfigForm kind={kind} connectorId={existing?.connector.id} draft={draft} onChange={setDraft} disabled={readOnly || isSaving} />
      </div>

      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0 lg:max-h-[calc(92dvh-8rem)] lg:self-start lg:overflow-y-auto lg:pr-1" aria-label="Test de connexion">
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><FlaskConical className="size-4" aria-hidden /></span>
            <div>
              <h3 className="text-sm font-semibold">Banc d’essai</h3>
              <p className="text-xs text-muted-foreground">Teste la configuration en cours, sans l’enregistrer.</p>
            </div>
          </div>
          {canManage && requiresCredential && (
            existing && connections.length > 0 ? (
              <label className="flex flex-col gap-1.5 text-xs font-medium">
                Connexion utilisée pour le test
                <select value={connectionId} onChange={(event) => setConnectionId(event.target.value)} className={fieldClass}>
                  <option value="">Connexion partagée par défaut</option>
                  {connections.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.scope === 'private' ? 'privée' : item.scope === 'public' ? 'publique' : 'organisationnelle'})</option>)}
                </select>
              </label>
            ) : (
              <p className="rounded-xl bg-chart-4/15 px-3 py-2 text-xs leading-5">
                Ce connecteur exige une authentification. {existing ? 'Aucune connexion n’existe encore : ' : 'Enregistrez-le, puis '}
                <Link href="/admin/connections" className="font-medium text-primary underline-offset-4 hover:underline">créez une connexion</Link>
                {existing ? ' pour pouvoir tester.' : ' pour pouvoir le tester.'}
              </p>
            )
          )}
          {canManage ? (
            <Button type="button" onClick={test} disabled={isTesting || isSaving || !hasTarget} variant={outcome && !stale ? 'outline' : 'default'}>
              {isTesting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <TestTubeDiagonal data-icon="inline-start" />}
              {isTesting ? 'Test en cours…' : outcome ? 'Relancer le test' : 'Tester la connexion'}
            </Button>
          ) : <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">Vous pouvez consulter la configuration, mais pas la tester ni la modifier.</p>}
          {stale && <p role="status" className="rounded-xl bg-chart-4/15 px-3 py-2 text-xs font-medium leading-5">La configuration a changé depuis ce test. Relancez-le pour valider les modifications.</p>}
        </div>

        {isTesting && !outcome ? (
          <div className="flex flex-col gap-2" aria-busy="true"><div className="h-16 animate-pulse rounded-2xl bg-muted" /><div className="h-28 animate-pulse rounded-2xl bg-muted" /></div>
        ) : outcome ? (
          <div className={isTesting || stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}><ConnectorTestResult outcome={outcome.result} at={outcome.at} compact /></div>
        ) : (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">Aucun test lancé</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Le diagnostic vérifie l’adresse, la connexion, l’authentification, le format de la réponse et affiche un aperçu des contenus extraits.</p>
          </div>
        )}
      </aside>

      <div className="flex flex-col gap-3 border-t pt-4 lg:col-span-2">
        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {existing ? (dirty ? 'Modifications non enregistrées.' : 'Aucune modification.') : 'Le connecteur est créé en brouillon : il ne collecte rien tant qu’il n’est pas activé.'}
          </p>
          <div className="flex gap-2">
            {onCancel && <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>{existing ? 'Fermer' : 'Retour'}</Button>}
            {canManage && <Button type="submit" disabled={!canSave}>{isSaving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}{isSaving ? 'Enregistrement…' : existing ? 'Enregistrer' : 'Créer le connecteur'}</Button>}
          </div>
        </div>
      </div>
    </form>
  )
}
