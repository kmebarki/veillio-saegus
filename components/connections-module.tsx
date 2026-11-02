'use client'

import { Bell, CircleHelp, KeyRound, Menu, Pencil, PlugZap, Plus, Search, Settings, Trash2, User, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { createConnection, deleteConnection, testConnection, updateConnection } from '@/app/actions/connections'
import { HealthDot, KindIcon } from '@/components/connector-ui'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Sidebar } from '@/components/veillio-dashboard'
import { UserMenu } from '@/components/user-menu'
import { secretLabel, type AuthType } from '@/lib/connector-catalog'
import type { ConnectionScope, ConnectionSummary, ConnectionsOverview } from '@/lib/connection-types'
import { cn } from '@/lib/utils'

type ScopeFilter = 'all' | ConnectionScope

const AUTH_LABELS: Record<string, string> = { basic: 'Identifiant + mot de passe', bearer: 'Jeton Bearer', api_key_header: 'Clé API (en-tête)', api_key_query: 'Clé API (paramètre d’URL)' }
const inputClass = 'h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20'

function authLabel(type: string) {
  return AUTH_LABELS[type] ?? 'Clé API'
}

function ConnectionCard({ connection, onEdit, onTest, onDelete, busy }: { connection: ConnectionSummary; onEdit: () => void; onTest: () => void; onDelete: () => void; busy: boolean }) {
  const personal = connection.scope === 'user'
  return (
    <article className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><KindIcon kind={connection.connectorKind} className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-[-0.02em]">{connection.name}</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{connection.connectorName} · {authLabel(connection.authType)}</p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', personal ? 'bg-secondary text-secondary-foreground' : 'bg-primary/10 text-primary')}>
          {personal ? <User className="size-3.5" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
          {personal ? 'Personnelle' : 'Partagée'}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">{secretLabel(connection.authType as AuthType)}</dt><dd className="mt-0.5 flex items-center gap-1.5 font-medium"><KeyRound className="size-3.5 text-muted-foreground" aria-hidden />{connection.hasSecret ? '•••••••• (chiffré)' : 'Non renseigné'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{personal ? 'Propriétaire' : 'Portée'}</dt><dd className="mt-0.5 truncate font-medium">{connection.ownerName}</dd></div>
        {connection.username && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Identifiant</dt><dd className="mt-0.5 truncate font-medium">{connection.username}</dd></div>}
      </dl>

      <div className="flex flex-col gap-1 border-t pt-3">
        <HealthDot connector={connection} />
        <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">{connection.lastCheckMessage ?? 'Testez la connexion pour vérifier les identifiants.'}{connection.lastCheckAt ? ` (${connection.lastCheckAt})` : ''}</p>
      </div>

      {connection.canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={onTest}><PlugZap data-icon="inline-start" />Tester</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit}><Pencil data-icon="inline-start" />Modifier</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete} className="ml-auto text-destructive hover:text-destructive"><Trash2 data-icon="inline-start" />Supprimer</Button>
        </div>
      )}
    </article>
  )
}

type FormTarget = { mode: 'create' } | { mode: 'edit'; connection: ConnectionSummary }

function ConnectionForm({ target, overview, onClose, onDone }: { target: FormTarget; overview: ConnectionsOverview; onClose: () => void; onDone: (message: string) => void }) {
  const editing = target.mode === 'edit' ? target.connection : null
  const [connectorId, setConnectorId] = useState(editing?.connectorId ?? overview.connectors[0]?.id ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  const [scope, setScope] = useState<ConnectionScope>(editing?.scope ?? (overview.viewer.canManage ? 'organization' : 'user'))
  const [username, setUsername] = useState(editing?.username ?? '')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const connector = overview.connectors.find((item) => item.id === connectorId)
  const authType = (editing?.authType ?? connector?.authType ?? 'api_key_header') as AuthType
  const needsUsername = authType === 'basic'
  const label = secretLabel(authType)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = editing
        ? await updateConnection({ id: editing.id, version: editing.version, name, username, secret: secret ? { mode: 'set', value: secret } : { mode: 'keep', value: '' } })
        : await createConnection({ connectorId, name, scope, username, secret })
      if (!result.ok) return setError(result.message)
      onDone(result.message)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {!editing && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Connecteur
          <select value={connectorId} onChange={(event) => setConnectorId(event.target.value)} className={inputClass} required>
            {overview.connectors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.host ? ` · ${item.host}` : ''}</option>)}
          </select>
          {connector && <span className="text-xs font-normal text-muted-foreground">Authentification requise : {authLabel(connector.authType)}{connector.keyName && (authType === 'api_key_header' || authType === 'api_key_query') ? ` (« ${connector.keyName} »)` : ''}.</span>}
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nom de la connexion
        <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Ex. Clé API NCBI de l’équipe" maxLength={80} required />
      </label>

      {!editing && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Qui peut l’utiliser ?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { id: 'organization', title: 'Partagée', text: 'Toute l’organisation (veilles, collectes).', disabled: !overview.viewer.canManage },
              { id: 'user', title: 'Personnelle', text: 'Vous seul pouvez la voir et l’utiliser.', disabled: false },
            ] as const).map((option) => (
              <label key={option.id} className={cn('flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 text-sm', scope === option.id ? 'border-primary bg-primary/5' : 'bg-card', option.disabled && 'cursor-not-allowed opacity-50')}>
                <span className="flex items-center gap-2 font-medium"><input type="radio" name="scope" value={option.id} checked={scope === option.id} disabled={option.disabled} onChange={() => setScope(option.id)} className="accent-primary" />{option.title}</span>
                <span className="pl-6 text-xs text-muted-foreground">{option.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {needsUsername && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Identifiant
          <input value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass} autoComplete="off" required />
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {label}
        <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} className={inputClass} autoComplete="new-password" required={!editing} placeholder={editing ? 'Laisser vide pour conserver le secret actuel' : ''} />
        <span className="text-xs font-normal text-muted-foreground">Chiffré avant stockage et jamais réaffiché.</span>
      </label>

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Annuler</Button>
        <Button type="submit" disabled={pending || (!editing && !connectorId)}>{pending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer la connexion'}</Button>
      </div>
    </form>
  )
}

export function ConnectionsModule({ overview }: { overview: ConnectionsOverview }) {
  const router = useRouter()
  const { viewer, connections, connectors, stats } = overview
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [form, setForm] = useState<FormTarget | null>(null)
  const [toDelete, setToDelete] = useState<ConnectionSummary | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return connections.filter((item) => (scopeFilter === 'all' || item.scope === scopeFilter) && (!needle || `${item.name} ${item.connectorName} ${item.username}`.toLowerCase().includes(needle)))
  }, [connections, query, scopeFilter])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 4200)
  }

  async function run(id: string, action: () => Promise<{ ok: boolean; message: string }>) {
    setBusyId(id)
    const result = await action()
    setBusyId(null)
    notify(result.message)
    router.refresh()
  }

  const canCreate = connectors.length > 0

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
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Une connexion donne l’accès réel à un fournisseur de données : clé API, jeton ou mot de passe, partagés par l’organisation ou propres à un utilisateur. Le <Link href="/admin/connectors" className="font-medium text-primary underline-offset-4 hover:underline">connecteur</Link> définit seulement comment communiquer avec le fournisseur.</p>
              </div>
              {canCreate && <Button onClick={() => setForm({ mode: 'create' })}><Plus data-icon="inline-start" />Nouvelle connexion</Button>}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs">
              <div className="metric-card"><p>Connexions</p><strong>{stats.total}</strong><span>Visibles par vous</span></div>
              <div className="metric-card"><p>Partagées</p><strong>{stats.shared}</strong><span>Utilisables par l’organisation</span></div>
              <div className="metric-card"><p>Personnelles</p><strong>{stats.personal}</strong><span>Réservées à leur propriétaire</span></div>
              <div className="metric-card"><p>À surveiller</p><strong>{stats.attention}</strong><span>{stats.attention > 0 ? 'Erreur, réserve ou à retester' : 'Rien à signaler'}</span></div>
            </section>

            {connections.length > 0 && (
              <section className="flex flex-col gap-3 sm:flex-row sm:items-center" aria-label="Filtres">
                <label className="relative flex-1">
                  <span className="sr-only">Rechercher une connexion</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} className={cn(inputClass, 'pl-9')} placeholder="Rechercher par nom, connecteur ou identifiant" />
                </label>
                <div className="flex gap-1" role="tablist" aria-label="Filtrer par portée">
                  {([['all', 'Toutes'], ['organization', 'Partagées'], ['user', 'Personnelles']] as const).map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={scopeFilter === id} onClick={() => setScopeFilter(id)} className={cn('h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors', scopeFilter === id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>{label}</button>
                  ))}
                </div>
              </section>
            )}

            {visible.length > 0 ? (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Liste des connexions">
                {visible.map((connection) => (
                  <ConnectionCard
                    key={connection.id}
                    connection={connection}
                    busy={busyId === connection.id}
                    onEdit={() => setForm({ mode: 'edit', connection })}
                    onTest={() => run(connection.id, () => testConnection({ id: connection.id }))}
                    onDelete={() => setToDelete(connection)}
                  />
                ))}
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
                        : 'Aucun connecteur n’exige d’authentification pour l’instant. Configurez l’authentification d’un connecteur (API JSON) pour pouvoir lui associer une connexion.'}
                  </p>
                </div>
                {connections.length === 0 && canCreate && <Button onClick={() => setForm({ mode: 'create' })}><Plus data-icon="inline-start" />Créer une connexion</Button>}
                {!canCreate && <Button variant="outline" render={<Link href="/admin/connectors" />}>Ouvrir les connecteurs</Button>}
              </section>
            )}
          </div>
        </main>
      </div>

      <Modal open={form !== null} onClose={() => setForm(null)} size="xl" title={form?.mode === 'edit' ? 'Modifier la connexion' : 'Nouvelle connexion'} description="Les identifiants sont chiffrés et ne sont jamais renvoyés au navigateur.">
        {form && (
          <ConnectionForm
            key={form.mode === 'edit' ? form.connection.id : 'new'}
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

      <Modal open={toDelete !== null} onClose={() => setToDelete(null)} size="md" title="Supprimer la connexion ?" description={toDelete ? `« ${toDelete.name} » sera supprimée définitivement. Les collectes qui l’utilisent ne pourront plus s’authentifier.` : undefined}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>Annuler</Button>
          <Button
            variant="destructive"
            onClick={() => {
              const target = toDelete
              setToDelete(null)
              if (target) void run(target.id, () => deleteConnection({ id: target.id }))
            }}
          >
            Supprimer
          </Button>
        </div>
      </Modal>

      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl">{toast}</div>}
    </div>
  )
}
