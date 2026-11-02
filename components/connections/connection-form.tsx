'use client'

import { Check, PlugZap, ShieldCheck, TriangleAlert, User, Users } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

import { createConnection, testConnection, testDraftConnection, updateConnection } from '@/app/actions/connections'
import { inDaysIso, inputClass, todayIso } from '@/components/connections/helpers'
import { RequestPreview } from '@/components/connections/request-preview'
import { SecretField } from '@/components/connections/secret-field'
import { TestResult } from '@/components/connections/test-result'
import { KindIcon } from '@/components/connector-ui'
import { Button } from '@/components/ui/button'
import { analyzeSecret, analyzeUsername } from '@/lib/connection-secret'
import type { ConnectionScope, ConnectionSummary, ConnectionsOverview } from '@/lib/connection-types'
import { AUTH_LABELS, secretLabel, type AuthType } from '@/lib/connector-catalog'
import type { TestOutcome } from '@/lib/connector-types'
import { cn } from '@/lib/utils'

export type FormTarget = { mode: 'create'; connectorId?: string } | { mode: 'edit'; connection: ConnectionSummary }

type Props = { target: FormTarget; overview: ConnectionsOverview; onClose: () => void; onDone: (message: string) => void }

const EXPIRY_PRESETS = [
  { label: '30 jours', days: 30 },
  { label: '90 jours', days: 90 },
  { label: '1 an', days: 365 },
] as const

export function ConnectionForm({ target, overview, onClose, onDone }: Props) {
  const editing = target.mode === 'edit' ? target.connection : null
  const initialConnector = editing?.connectorId ?? (target.mode === 'create' ? target.connectorId : undefined) ?? overview.connectors[0]?.id ?? ''

  const [connectorId, setConnectorId] = useState(initialConnector)
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [scope, setScope] = useState<ConnectionScope>(editing?.scope ?? (overview.viewer.canManage ? 'organization' : 'user'))
  const [username, setUsername] = useState(editing?.username ?? '')
  const [secret, setSecret] = useState('')
  const [replacing, setReplacing] = useState(!editing)
  const [expiresAt, setExpiresAt] = useState(editing?.expiresAt ?? '')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<TestOutcome | null>(null)
  const [pending, startTransition] = useTransition()
  const [testing, startTesting] = useTransition()

  const choice = overview.connectors.find((item) => item.id === connectorId)
  const authType = (editing?.authType ?? choice?.authType ?? 'api_key_header') as AuthType
  const keyName = editing?.keyName ?? choice?.keyName ?? ''
  const endpoint = editing?.connectorUrl ?? (choice ? `${choice.insecure ? 'http' : 'https'}://${choice.host}` : '')
  const insecure = editing?.insecure ?? choice?.insecure ?? false

  const analysis = useMemo(() => analyzeSecret(authType, secret), [authType, secret])
  const userCheck = useMemo(() => analyzeUsername(authType, username), [authType, username])
  const secretReady = editing && !replacing ? true : analysis.valid
  const showUsernameError = authType === 'basic' && username.length > 0 && userCheck.error
  const canSubmit = !pending && name.trim().length >= 2 && Boolean(connectorId) && secretReady && !userCheck.error
  const canTest = !testing && !pending && secretReady && !userCheck.error && Boolean(connectorId)

  function runDraftTest() {
    setError(null)
    setDraft(null)
    startTesting(async () => {
      const result = await testDraftConnection({ connectorId, connectionId: editing?.id, username, secret: editing && !replacing ? '' : secret })
      if (!result.ok) return setError(result.message)
      setDraft(result.outcome)
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      if (editing) {
        const result = await updateConnection({ id: editing.id, version: editing.version, name, description, username, expiresAt, secret: replacing ? { mode: 'set', value: secret } : { mode: 'keep', value: '' } })
        if (!result.ok) return setError(result.message)
        return onDone(result.message)
      }
      const created = await createConnection({ connectorId, name, description, scope, username, secret, expiresAt })
      if (!created.ok) return setError(created.message)
      const tested = await testConnection({ id: created.id })
      onDone(tested.ok ? `Connexion créée · ${tested.outcome.status === 'success' ? 'test réussi' : tested.outcome.status === 'warning' ? 'test réussi avec réserves' : 'test en échec, vérifiez les identifiants'}.` : created.message)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="flex min-w-0 flex-col gap-5">
        {!editing && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Connecteur</legend>
            <div role="radiogroup" aria-label="Connecteur" className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">
              {overview.connectors.map((item) => {
                const selected = item.id === connectorId
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setConnectorId(item.id)
                      setDraft(null)
                    }}
                    className={cn('relative flex items-start gap-3 rounded-xl border p-3 text-left transition-colors', selected ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'bg-card hover:border-foreground/30')}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><KindIcon kind={item.kind} className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.host || 'URL à renseigner'} · {AUTH_LABELS[item.authType as AuthType]?.label.split(' (')[0] ?? 'Clé API'}</span>
                      <span className="mt-1 block text-[11px] font-medium text-muted-foreground">{item.sharedCount > 0 ? `${item.sharedCount} connexion${item.sharedCount > 1 ? 's' : ''} partagée${item.sharedCount > 1 ? 's' : ''}` : 'Aucune connexion partagée'}</span>
                    </span>
                    {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        {editing && (
          <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><KindIcon kind={editing.connectorKind} className="size-4" /></span>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{editing.connectorName}</p><p className="truncate text-xs text-muted-foreground">{editing.host} · {AUTH_LABELS[authType]?.label}</p></div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Nom de la connexion
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Ex. Clé API NCBI de l’équipe" maxLength={80} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Description <span className="-mt-1 text-xs font-normal text-muted-foreground">Facultatif</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} placeholder="Ex. Quota 10 requêtes/s, compte de Marie" maxLength={240} />
          </label>
        </div>

        {!editing && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Qui peut l’utiliser ?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { id: 'organization', title: 'Partagée', text: 'Toute l’organisation : veilles et collectes.', icon: Users, disabled: !overview.viewer.canManage },
                { id: 'user', title: 'Personnelle', text: 'Vous seul pouvez la voir et l’utiliser.', icon: User, disabled: false },
              ] as const).map((option) => (
                <label key={option.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors', scope === option.id ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'bg-card', option.disabled && 'cursor-not-allowed opacity-50')}>
                  <input type="radio" name="scope" value={option.id} checked={scope === option.id} disabled={option.disabled} onChange={() => setScope(option.id)} className="sr-only" />
                  <option.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span><span className="block font-medium">{option.title}</span><span className="text-xs text-muted-foreground">{option.disabled ? 'Réservé aux gestionnaires de connexions.' : option.text}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-4 rounded-2xl border p-4">
          <legend className="px-1.5 text-sm font-semibold">Identifiants</legend>
          {authType === 'basic' && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Identifiant
              <input value={username} onChange={(event) => setUsername(event.target.value)} className={cn(inputClass, showUsernameError && 'border-destructive')} autoComplete="off" spellCheck={false} data-1p-ignore required aria-invalid={Boolean(showUsernameError)} />
              {showUsernameError && <span className="text-xs font-normal text-destructive">{userCheck.error}</span>}
            </label>
          )}
          <SecretField label={secretLabel(authType)} value={secret} onChange={(value) => { setSecret(value); setDraft(null) }} analysis={analysis} existingHint={editing ? (editing.secretHint ?? '') : undefined} replacing={replacing} onReplacingChange={setReplacing} />
          {analysis.jwtExpiry && expiresAt !== analysis.jwtExpiry && (
            <button type="button" className="self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15" onClick={() => setExpiresAt(analysis.jwtExpiry ?? '')}>Utiliser l’expiration du jeton ({analysis.jwtExpiry})</button>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Expiration du secret <span className="font-normal text-muted-foreground">· Facultatif</span></legend>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={expiresAt} min={todayIso()} onChange={(event) => setExpiresAt(event.target.value)} className={cn(inputClass, 'w-auto')} aria-label="Date d’expiration" />
            {EXPIRY_PRESETS.map((preset) => (
              <button key={preset.days} type="button" onClick={() => setExpiresAt(inDaysIso(preset.days))} className={cn('h-9 rounded-full border px-3 text-xs font-medium transition-colors', expiresAt === inDaysIso(preset.days) ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:text-foreground')}>{preset.label}</button>
            ))}
            {expiresAt && <button type="button" onClick={() => setExpiresAt('')} className="h-9 rounded-full px-3 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Aucune</button>}
          </div>
          <p className="text-xs text-muted-foreground">Un rappel apparaît 14 jours avant l’échéance dans « À surveiller ».</p>
        </fieldset>
      </div>

      <aside className="flex min-w-0 flex-col gap-5 self-start rounded-2xl border bg-muted/30 p-4 lg:sticky lg:top-0">
        <RequestPreview authType={authType} keyName={keyName} username={username.trim()} connectorUrl={endpoint} insecure={insecure} />

        <section aria-label="Sécurité du stockage" className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sécurité</h3>
          <ul className="flex flex-col gap-2 text-xs leading-5 text-muted-foreground">
            <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />Chiffrement AES-256-GCM, clé dérivée du secret serveur et liée à l’identifiant de cette connexion.</li>
            <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />Jamais renvoyé au navigateur : seul un indice (fin du secret) est affiché.</li>
            <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />Masqué dans les résultats de test et les journaux.</li>
          </ul>
        </section>

        <section aria-label="Test des identifiants" className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vérification</h3>
          <Button type="button" variant="outline" disabled={!canTest} onClick={runDraftTest}><PlugZap data-icon="inline-start" />{testing ? 'Test en cours…' : editing && !replacing ? 'Tester les identifiants actuels' : 'Tester sans enregistrer'}</Button>
          {draft && <TestResult outcome={draft} compact />}
          {!draft && !testing && <p className="text-xs leading-5 text-muted-foreground">Envoie une requête de test au connecteur avec ces identifiants, sans rien enregistrer.</p>}
        </section>
      </aside>

      <div className="flex flex-col gap-3 border-t pt-4 lg:col-span-2">
        {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button type="submit" disabled={!canSubmit}>{pending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer et tester'}</Button>
        </div>
      </div>
    </form>
  )
}
