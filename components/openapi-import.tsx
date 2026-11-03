'use client'

import { FileUp, Pencil, Search, Trash2, TriangleAlert } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { fieldClass, Modal } from '@/components/ui/modal'
import { AUTH_LABELS, MAX_API_ENDPOINTS, PAGINATION_TYPES, type ConnectorConfig, type KeyValue } from '@/lib/connector-catalog'
import { addEndpoints, commitActiveEndpoint, removeEndpoint, switchEndpoint } from '@/lib/connectors/endpoints'
import { MAX_SPEC_CHARS, OpenApiError, isAbsoluteHttpUrl, parseOpenApi, toApiEndpoint, type ImportedEndpoint, type OpenApiImport } from '@/lib/connectors/openapi'
import { cn } from '@/lib/utils'

type Props = {
  config: ConnectorConfig
  onChange: (config: ConnectorConfig) => void
  disabled?: boolean
  allowEndpointEditing?: boolean
}

const CONFIDENCE_LABELS = { high: 'Mapping fiable', medium: 'Mapping probable', low: 'Mapping à vérifier' } as const
const PAGINATION_LABELS: Record<(typeof PAGINATION_TYPES)[number], string> = {
  none: 'Aucune (une seule requête)',
  page: 'Par numéro de page',
  offset: 'Par décalage (offset)',
  cursor: 'Par curseur',
}

function MethodBadge({ method }: { method: string }) {
  return <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-secondary px-1.5 font-mono text-[11px] font-semibold text-secondary-foreground">{method}</span>
}

export function EndpointsSection({ config, onChange, disabled, allowEndpointEditing = false }: Props) {
  const [open, setOpen] = useState(false)
  const [editConfig, setEditConfig] = useState<ConnectorConfig | null>(null)
  const { endpoints, activeEndpointId } = config.api

  function editEndpoint(id: string) {
    const next = switchEndpoint(config, id)
    onChange(next)
    setEditConfig(next)
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em]">Endpoints</h3>
          <p className="mt-0.5 max-w-xl text-[13px] leading-5 text-muted-foreground">Importez une spécification OpenAPI (JSON ou YAML) pour créer les endpoints automatiquement.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}><FileUp data-icon="inline-start" />Importer OpenAPI</Button>
      </header>

      {endpoints.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">Aucun endpoint importé. La requête configurée dans « Source » est utilisée telle quelle.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Endpoints importés">
          {endpoints.map((endpoint) => {
            const active = endpoint.id === activeEndpointId
            return (
              <li key={endpoint.id} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', active && 'border-primary bg-primary/5 ring-1 ring-primary')}>
                <MethodBadge method={endpoint.method} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{endpoint.label}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground" title={endpoint.url}>{endpoint.url}</p>
                </div>
                {allowEndpointEditing ? (
                  <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => editEndpoint(endpoint.id)}><Pencil data-icon="inline-start" />{active ? 'Modifier' : 'Éditer'}</Button>
                ) : active ? (
                  <span className="shrink-0 text-xs font-medium text-primary">En édition</span>
                ) : (
                  <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(switchEndpoint(config, endpoint.id))}><Pencil data-icon="inline-start" />Éditer</Button>
                )}
                <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Retirer l’endpoint ${endpoint.label}`} onClick={() => onChange(removeEndpoint(config, endpoint.id))}><Trash2 /></Button>
              </li>
            )
          })}
        </ul>
      )}
      {endpoints.length > 0 && !allowEndpointEditing && <p className="text-xs leading-5 text-muted-foreground">L’endpoint « en édition » est modifié via les sections Source, Mapping et Pagination.</p>}

      <Modal open={open} onClose={() => setOpen(false)} size="xl" title="Importer une spécification OpenAPI" description="OpenAPI 3.x ou Swagger 2.0, au format JSON ou YAML. Le fichier est analysé dans votre navigateur.">
        {open && <ImportDialog config={config} onClose={() => setOpen(false)} onApply={(next) => { onChange(next); setOpen(false) }} />}
      </Modal>
      <Modal open={Boolean(editConfig)} onClose={() => setEditConfig(null)} size="xl" title="Modifier l’endpoint" description="Ajustez la requête, le mapping de réponse et la pagination de cet endpoint.">
        {editConfig && <EndpointEditor config={editConfig} onCancel={() => setEditConfig(null)} onApply={(next) => { onChange(commitActiveEndpoint(next)); setEditConfig(null) }} />}
      </Modal>
    </section>
  )
}

function EndpointEditor({ config, onCancel, onApply }: { config: ConnectorConfig; onCancel: () => void; onApply: (config: ConnectorConfig) => void }) {
  const [draft, setDraft] = useState(config)
  const activeEndpoint = draft.api.endpoints.find((endpoint) => endpoint.id === draft.api.activeEndpointId)
  const pagination = draft.api.pagination

  function setApi(patch: Partial<ConnectorConfig['api']>) {
    setDraft((current) => ({ ...current, api: { ...current.api, ...patch } }))
  }

  function setMetadata(patch: { label?: string; summary?: string }) {
    setDraft((current) => ({
      ...current,
      api: {
        ...current.api,
        endpoints: current.api.endpoints.map((endpoint) => endpoint.id === current.api.activeEndpointId ? { ...endpoint, ...patch } : endpoint),
      },
    }))
  }

  function setQuery(query: KeyValue[]) {
    setApi({ query })
  }

  if (!activeEndpoint) return null

  return (
    <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); onApply(draft) }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Nom de l&apos;endpoint</span>
          <input required maxLength={120} value={activeEndpoint.label} onChange={(event) => setMetadata({ label: event.target.value })} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Description</span>
          <input maxLength={300} value={activeEndpoint.summary} onChange={(event) => setMetadata({ summary: event.target.value })} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Méthode</span>
          <select value={draft.api.method} onChange={(event) => setApi({ method: event.target.value as 'GET' | 'POST' })} className={fieldClass}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2 sm:row-start-3 sm:col-start-2">
          <span className="text-sm font-medium">URL</span>
          <input type="url" required spellCheck={false} maxLength={2000} value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} className={cn(fieldClass, 'font-mono text-[13px]')} />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div><h4 className="text-sm font-semibold">Paramètres de requête</h4><p className="text-xs text-muted-foreground">Ajoutez les paramètres transmis dans l&apos;URL.</p></div>
          <Button type="button" variant="outline" size="sm" disabled={draft.api.query.length >= 15} onClick={() => setQuery([...draft.api.query, { name: '', value: '' }])}>Ajouter</Button>
        </div>
        {draft.api.query.length === 0 ? <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">Aucun paramètre.</p> : draft.api.query.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input aria-label={`Nom du paramètre ${index + 1}`} maxLength={100} value={item.name} onChange={(event) => setQuery(draft.api.query.map((entry, entryIndex) => entryIndex === index ? { ...entry, name: event.target.value } : entry))} className={cn(fieldClass, 'font-mono text-[13px]')} placeholder="nom" />
            <input aria-label={`Valeur du paramètre ${index + 1}`} maxLength={500} value={item.value} onChange={(event) => setQuery(draft.api.query.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry))} className={cn(fieldClass, 'font-mono text-[13px]')} placeholder="valeur" />
            <Button type="button" variant="ghost" size="icon" aria-label={`Retirer le paramètre ${index + 1}`} onClick={() => setQuery(draft.api.query.filter((_, entryIndex) => entryIndex !== index))}><Trash2 /></Button>
          </div>
        ))}
      </div>

      {draft.api.method === 'POST' && <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Corps JSON</span><textarea rows={5} spellCheck={false} maxLength={5000} value={draft.api.body} onChange={(event) => setApi({ body: event.target.value })} className={cn(fieldClass, 'h-auto resize-y py-2.5 font-mono text-[13px] leading-5')} /></label>}

      <div className="flex flex-col gap-3">
        <div><h4 className="text-sm font-semibold">Mapping de la réponse</h4><p className="text-xs text-muted-foreground">Chemins JSON en notation pointée.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-medium">Liste des éléments</span><input maxLength={120} value={draft.api.itemsPath} onChange={(event) => setApi({ itemsPath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} placeholder="data.items" /></label>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Titre</span><input required maxLength={120} value={draft.api.titlePath} onChange={(event) => setApi({ titlePath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></label>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Lien</span><input required maxLength={120} value={draft.api.linkPath} onChange={(event) => setApi({ linkPath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></label>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Date</span><input maxLength={120} value={draft.api.datePath} onChange={(event) => setApi({ datePath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></label>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Résumé</span><input maxLength={120} value={draft.api.summaryPath} onChange={(event) => setApi({ summaryPath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></label>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div><h4 className="text-sm font-semibold">Pagination</h4><p className="text-xs text-muted-foreground">Configurez la récupération des pages suivantes.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-medium">Mode</span><select value={pagination.type} onChange={(event) => setApi({ pagination: { ...pagination, type: event.target.value as typeof pagination.type } })} className={fieldClass}>{PAGINATION_TYPES.map((type) => <option key={type} value={type}>{PAGINATION_LABELS[type]}</option>)}</select></label>
          {pagination.type !== 'none' && <>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Paramètre de page</span><input maxLength={64} value={pagination.param} onChange={(event) => setApi({ pagination: { ...pagination, param: event.target.value } })} className={cn(fieldClass, 'font-mono text-[13px]')} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Paramètre de taille</span><input maxLength={64} value={pagination.sizeParam} onChange={(event) => setApi({ pagination: { ...pagination, sizeParam: event.target.value } })} className={cn(fieldClass, 'font-mono text-[13px]')} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Éléments par page</span><input type="number" min={1} max={500} value={pagination.pageSize} onChange={(event) => setApi({ pagination: { ...pagination, pageSize: Number(event.target.value) } })} className={fieldClass} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Pages maximum</span><input type="number" min={1} max={10} value={pagination.maxPages} onChange={(event) => setApi({ pagination: { ...pagination, maxPages: Number(event.target.value) } })} className={fieldClass} /></label>
            {pagination.type === 'cursor' && <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-medium">Chemin du curseur suivant</span><input maxLength={120} value={pagination.cursorPath} onChange={(event) => setApi({ pagination: { ...pagination, cursorPath: event.target.value } })} className={cn(fieldClass, 'font-mono text-[13px]')} /></label>}
          </>}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button type="submit">Enregistrer l&apos;endpoint</Button>
      </div>
    </form>
  )
}

function ImportDialog({ config, onClose, onApply }: { config: ConnectorConfig; onClose: () => void; onApply: (config: ConnectorConfig) => void }) {
  const [source, setSource] = useState('')
  const [fileName, setFileName] = useState('')
  const [spec, setSpec] = useState<OpenApiImport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applyAuth, setApplyAuth] = useState(true)
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const serversId = useId()

  const room = Math.max(0, MAX_API_ENDPOINTS - config.api.endpoints.filter((endpoint) => !selected.has(endpoint.id)).length)

  const visible = useMemo(() => {
    if (!spec) return []
    const query = filter.trim().toLowerCase()
    if (!query) return spec.endpoints
    return spec.endpoints.filter((item) => `${item.method} ${item.path} ${item.label} ${item.tags.join(' ')}`.toLowerCase().includes(query))
  }, [spec, filter])

  async function readFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (file.size > MAX_SPEC_CHARS * 2) {
      setError('Ce fichier est trop volumineux (3 Mo de texte maximum).')
      return
    }
    setFileName(file.name)
    setSource(await file.text())
    setSpec(null)
  }

  function analyze() {
    setError(null)
    if (!source.trim()) {
      setError('Choisissez un fichier ou collez le contenu de la spécification.')
      return
    }
    if (source.length > MAX_SPEC_CHARS) {
      setError('Cette spécification est trop volumineuse (3 Mo de texte maximum).')
      return
    }
    try {
      const result = parseOpenApi(source)
      setSpec(result)
      const absolute = result.servers.find(isAbsoluteHttpUrl)
      setBaseUrl(absolute ?? '')
      setApplyAuth(Boolean(result.auth && result.auth.type !== 'none'))
      setSelected(new Set(result.endpoints.filter((item) => !item.blocked && !item.deprecated && item.confidence !== 'low').slice(0, MAX_API_ENDPOINTS).map((item) => item.id)))
    } catch (cause) {
      setSpec(null)
      setError(cause instanceof OpenApiError ? cause.message : 'Impossible de lire cette spécification. Vérifiez qu’il s’agit d’un JSON ou d’un YAML valide.')
    }
  }

  function toggle(item: ImportedEndpoint) {
    if (item.blocked) return
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  function selectVisible(value: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const item of visible) {
        if (item.blocked) continue
        if (value) next.add(item.id)
        else next.delete(item.id)
      }
      return next
    })
  }

  function confirm() {
    if (!spec) return
    setError(null)
    const chosen = spec.endpoints.filter((item) => selected.has(item.id) && !item.blocked)
    if (chosen.length === 0) return setError('Sélectionnez au moins un endpoint.')
    if (!isAbsoluteHttpUrl(baseUrl)) return setError('Indiquez l’URL de base de l’API (ex. https://api.exemple.fr/v1).')
    try {
      const incoming = chosen.map((item) => toApiEndpoint(item, baseUrl))
      let next = addEndpoints(config, incoming, incoming[0].id)
      if (applyAuth && spec.auth && spec.auth.type !== 'none') next = { ...next, auth: { type: spec.auth.type, keyName: spec.auth.keyName } }
      onApply(next)
    } catch (cause) {
      setError(cause instanceof OpenApiError ? cause.message : 'L’import a échoué.')
    }
  }

  const selectedCount = spec ? spec.endpoints.filter((item) => selected.has(item.id) && !item.blocked).length : 0
  const overLimit = spec !== null && selectedCount > room

  return (
    <div className="flex flex-col gap-4">
      {!spec ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-4">
            <input ref={inputRef} type="file" accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml,text/plain" className="sr-only" aria-label="Fichier de spécification" onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = '' }} />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><FileUp data-icon="inline-start" />Choisir un fichier</Button>
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{fileName || 'openapi.json, openapi.yaml, swagger.yml…'}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Ou collez le contenu
            <textarea rows={8} spellCheck={false} value={source} onChange={(event) => { setSource(event.target.value); setFileName('') }} className={cn(fieldClass, 'h-auto resize-y py-2.5 font-mono text-[13px] leading-5')} placeholder={'openapi: 3.0.3\ninfo:\n  title: Mon API\npaths:\n  /articles:\n    get: …'} />
          </label>
          <p className="text-xs leading-5 text-muted-foreground">Les références locales ($ref) sont résolues. Aucune requête n’est envoyée à ce stade.</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm"><span className="font-semibold">{spec.title}</span> <span className="text-muted-foreground">· v{spec.version} · {spec.specLabel}</span></p>
            <button type="button" onClick={() => setSpec(null)} className="text-xs font-medium text-primary underline-offset-4 hover:underline">Changer de fichier</button>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            URL de base de l’API
            <input type="url" inputMode="url" spellCheck={false} list={serversId} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} className={cn(fieldClass, 'font-mono text-[13px]')} placeholder="https://api.exemple.fr/v1" />
            <datalist id={serversId}>{spec.servers.filter(isAbsoluteHttpUrl).map((server) => <option key={server} value={server} />)}</datalist>
            <span className="text-xs font-normal leading-5 text-muted-foreground">{spec.servers.length ? 'Reprise des serveurs déclarés dans la spécification ; modifiable.' : 'Aucun serveur déclaré dans la spécification : saisissez-le.'} Le chemin de chaque endpoint y est ajouté.</span>
          </label>

          {spec.auth && spec.auth.type !== 'none' && (
            <label className="flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm">
              <input type="checkbox" checked={applyAuth} onChange={(event) => setApplyAuth(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="font-medium">Appliquer l’authentification détectée : {AUTH_LABELS[spec.auth.type].label}{spec.auth.keyName ? ` (${spec.auth.keyName})` : ''}</span>
                <span className="block text-xs leading-5 text-muted-foreground">{spec.auth.note} Les identifiants se saisissent ensuite dans Connexions.</span>
              </span>
            </label>
          )}

          {spec.warnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-xl bg-chart-4/15 px-3 py-2.5 text-[13px] leading-5">
              {spec.warnings.map((warning) => <li key={warning} className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{warning}</li>)}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrer les endpoints" placeholder="Filtrer par chemin, nom ou tag" className={cn(fieldClass, 'h-10 pl-9')} />
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => selectVisible(true)}>Tout cocher</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => selectVisible(false)}>Tout décocher</Button>
          </div>

          <ul className="flex max-h-[44vh] flex-col gap-1.5 overflow-y-auto pr-1" aria-label="Endpoints détectés">
            {visible.length === 0 && <li className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Aucun endpoint ne correspond.</li>}
            {visible.map((item) => {
              const checked = selected.has(item.id)
              return (
                <li key={item.id}>
                  <label className={cn('flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm', item.blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50', checked && 'border-primary bg-primary/5')}>
                    <input type="checkbox" checked={checked} disabled={Boolean(item.blocked)} onChange={() => toggle(item)} className="mt-1 size-4 accent-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><MethodBadge method={item.method} /><span className="truncate font-mono text-[13px]">{item.path}</span></span>
                      <span className="mt-0.5 block truncate text-[13px] font-medium">{item.label}</span>
                      {item.summary && item.summary !== item.label && <span className="block truncate text-xs text-muted-foreground">{item.summary}</span>}
                      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {item.blocked ? <span className="text-destructive">{item.blocked}</span> : <span>{CONFIDENCE_LABELS[item.confidence]}</span>}
                        {item.requiresAuth && <span>Authentification requise</span>}
                        {item.deprecated && <span>Déconseillé</span>}
                        {item.tags.length > 0 && <span>{item.tags.slice(0, 3).join(', ')}</span>}
                      </span>
                      {!item.blocked && item.notes.length > 0 && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.notes.join(' ')}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          {spec.skippedCount > 0 && <p className="text-xs leading-5 text-muted-foreground">{spec.skippedCount} opération{spec.skippedCount > 1 ? 's' : ''} ignorée{spec.skippedCount > 1 ? 's' : ''} (seules les lectures JSON sont importables).</p>}
        </>
      )}

      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {overLimit && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">Un connecteur accepte {MAX_API_ENDPOINTS} endpoints au maximum : décochez-en {selectedCount - room}.</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        {spec ? (
          <Button type="button" disabled={selectedCount === 0 || overLimit} onClick={confirm}>Importer {selectedCount} endpoint{selectedCount > 1 ? 's' : ''}</Button>
        ) : (
          <Button type="button" disabled={!source.trim()} onClick={analyze}>Analyser</Button>
        )}
      </div>
    </div>
  )
}
