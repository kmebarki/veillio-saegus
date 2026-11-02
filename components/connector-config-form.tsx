'use client'

import { KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { EndpointsSection } from '@/components/openapi-import'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/modal'
import {
  AUTH_LABELS,
  AUTH_TYPES,
  DEDUPE_OPTIONS,
  PAGINATION_TYPES,
  needsSecret,
  secretLabel,
  type ConnectorConfig,
  type ConnectorKind,
  type KeyValue,
} from '@/lib/connector-catalog'
import { cn } from '@/lib/utils'

export type ConnectorDraft = {
  name: string
  description: string
  config: ConnectorConfig
}

type Props = {
  kind: ConnectorKind
  draft: ConnectorDraft
  onChange: (draft: ConnectorDraft) => void
  disabled?: boolean
}

const PAGINATION_LABELS: Record<(typeof PAGINATION_TYPES)[number], string> = {
  none: 'Aucune (une seule requête)',
  page: 'Par numéro de page',
  offset: 'Par décalage (offset)',
  cursor: 'Par curseur',
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
      <header>
        <h3 className="text-sm font-semibold tracking-[-0.01em]">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  )
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-sm font-medium', className)}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal leading-5 text-muted-foreground">{hint}</span>}
    </label>
  )
}

function NumberField({ label, hint, value, min, max, suffix, disabled, onChange }: { label: string; hint?: string; value: number; min: number; max: number; suffix?: string; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      <span className="relative block">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          disabled={disabled}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? Number.NaN : Math.trunc(Number(event.target.value)))}
          className={cn(fieldClass, suffix && 'pr-12')}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </Field>
  )
}

function KeyValueEditor({ label, items, max, namePlaceholder, valuePlaceholder, disabled, onChange }: { label: string; items: KeyValue[]; max: number; namePlaceholder: string; valuePlaceholder: string; disabled?: boolean; onChange: (items: KeyValue[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {items.length === 0 && <p className="rounded-xl border border-dashed px-3 py-3 text-center text-[13px] text-muted-foreground">Aucun élément.</p>}
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <input aria-label={`${label} – nom ${index + 1}`} value={item.name} maxLength={64} placeholder={namePlaceholder} onChange={(event) => onChange(items.map((entry, i) => (i === index ? { ...entry, name: event.target.value } : entry)))} className={cn(fieldClass, 'h-10 flex-1 font-mono text-[13px]')} />
          <input aria-label={`${label} – valeur ${index + 1}`} value={item.value} maxLength={500} placeholder={valuePlaceholder} onChange={(event) => onChange(items.map((entry, i) => (i === index ? { ...entry, value: event.target.value } : entry)))} className={cn(fieldClass, 'h-10 flex-[1.4] font-mono text-[13px]')} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Supprimer la ligne ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}><Trash2 /></Button>
        </div>
      ))}
      {items.length < max && (
        <div><Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, { name: '', value: '' }])}><Plus data-icon="inline-start" />Ajouter</Button></div>
      )}
    </fieldset>
  )
}

function CredentialsNotice({ type }: { type: ConnectorConfig['auth']['type'] }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border bg-muted/40 px-3 py-2.5 text-[13px] leading-5 text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p>
        Le {secretLabel(type).toLowerCase()} {type === 'basic' ? 'et l’identifiant ne se saisissent' : 'ne se saisit'} pas ici : ils se configurent dans{' '}
        <Link href="/admin/connections" className="font-medium text-primary underline-offset-4 hover:underline">Connexions</Link>, pour l’organisation ou pour un utilisateur.
      </p>
    </div>
  )
}

export function ConnectorConfigForm({ kind, draft, onChange, disabled }: Props) {
  const { config } = draft
  const set = (patch: Partial<ConnectorDraft>) => onChange({ ...draft, ...patch })
  const setConfig = (patch: Partial<ConnectorConfig>) => set({ config: { ...config, ...patch } })
  const setAuth = (patch: Partial<ConnectorConfig['auth']>) => setConfig({ auth: { ...config.auth, ...patch } })
  const setHttp = (patch: Partial<ConnectorConfig['http']>) => setConfig({ http: { ...config.http, ...patch } })
  const setRetry = (patch: Partial<ConnectorConfig['retry']>) => setConfig({ retry: { ...config.retry, ...patch } })
  const setWeb = (patch: Partial<ConnectorConfig['web']>) => setConfig({ web: { ...config.web, ...patch } })
  const setApi = (patch: Partial<ConnectorConfig['api']>) => setConfig({ api: { ...config.api, ...patch } })
  const setPagination = (patch: Partial<ConnectorConfig['api']['pagination']>) => setApi({ pagination: { ...config.api.pagination, ...patch } })

  const authType = config.auth.type
  const isKeyAuth = authType === 'api_key_header' || authType === 'api_key_query'
  const pagination = config.api.pagination

  function changeAuthType(type: ConnectorConfig['auth']['type']) {
    const defaultKey = type === 'api_key_query' ? 'api_key' : 'X-API-Key'
    const keyName = type === 'api_key_header' || type === 'api_key_query' ? (config.auth.keyName && config.auth.type === type ? config.auth.keyName : defaultKey) : ''
    onChange({ ...draft, config: { ...config, auth: { type, keyName } } })
  }

  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4">
      <Section title="Identité" description="Comment ce connecteur apparaît dans la galerie et les journaux.">
        <Field label="Nom du connecteur">
          <input required minLength={2} maxLength={80} value={draft.name} onChange={(event) => set({ name: event.target.value })} className={fieldClass} placeholder={kind === 'rss' ? 'Ex. Le Monde – Technologies' : kind === 'web' ? 'Ex. Blog éditeur – actualités' : 'Ex. API Légifrance – JORF'} />
        </Field>
        <Field label="Description (facultatif)">
          <input maxLength={300} value={draft.description} onChange={(event) => set({ description: event.target.value })} className={fieldClass} placeholder="Ce que ce connecteur alimente, qui en est responsable…" />
        </Field>
      </Section>

      {kind === 'api' && <EndpointsSection config={config} onChange={(next) => onChange({ ...draft, config: next })} disabled={disabled} />}

      <Section title="Source" description={kind === 'rss' ? 'Adresse du flux RSS, Atom ou RDF. Le format est détecté automatiquement.' : kind === 'web' ? 'Adresse de la page de listing à analyser.' : 'Point d’accès de l’API qui renvoie du JSON.'}>
        <div className="flex flex-col gap-4">
          <div className={cn('grid gap-4', kind === 'api' && 'sm:grid-cols-[140px_1fr]')}>
            {kind === 'api' && (
              <Field label="Méthode">
                <select value={config.api.method} onChange={(event) => setApi({ method: event.target.value as 'GET' | 'POST' })} className={fieldClass}><option value="GET">GET</option><option value="POST">POST</option></select>
              </Field>
            )}
            <Field label="URL" hint="HTTPS recommandé. Les adresses internes (localhost, réseaux privés) sont refusées.">
              <input type="url" inputMode="url" required spellCheck={false} maxLength={2000} value={config.url} onChange={(event) => setConfig({ url: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} placeholder={kind === 'rss' ? 'https://exemple.fr/feed.xml' : kind === 'web' ? 'https://exemple.fr/actualites' : 'https://api.exemple.fr/v1/articles'} />
            </Field>
          </div>

          {kind === 'api' && (
            <>
              <KeyValueEditor label="Paramètres de requête" items={config.api.query} max={15} namePlaceholder="nom (ex. lang)" valuePlaceholder="valeur (ex. fr)" onChange={(query) => setApi({ query })} disabled={disabled} />
              {config.api.method === 'POST' && (
                <Field label="Corps de la requête (JSON)" hint="Envoyé avec Content-Type: application/json.">
                  <textarea rows={4} spellCheck={false} maxLength={5000} value={config.api.body} onChange={(event) => setApi({ body: event.target.value })} className={cn(fieldClass, 'h-auto resize-y py-2.5 font-mono text-[13px] leading-5')} placeholder={'{\n  "query": "intelligence artificielle"\n}'} />
                </Field>
              )}
            </>
          )}
        </div>
      </Section>

      <Section title="Authentification" description="Définit seulement comment la requête s’authentifie. Les identifiants eux-mêmes sont gérés dans Connexions.">
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Type d’authentification">
            {AUTH_TYPES.map((type) => {
              const checked = authType === type
              return (
                <button key={type} type="button" role="radio" aria-checked={checked} onClick={() => changeAuthType(type)} className={cn('flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors', checked ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60')}>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">{type !== 'none' && <KeyRound className="size-3.5 text-primary" aria-hidden />}{AUTH_LABELS[type].label}</span>
                  <span className="text-xs leading-4 text-muted-foreground">{AUTH_LABELS[type].hint}</span>
                </button>
              )
            })}
          </div>

          {isKeyAuth && (
            <Field label={authType === 'api_key_header' ? 'Nom de l’en-tête' : 'Nom du paramètre'}>
              <input maxLength={64} spellCheck={false} value={config.auth.keyName} onChange={(event) => setAuth({ keyName: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} />
            </Field>
          )}
          {needsSecret(authType) && <CredentialsNotice type={authType} />}
        </div>
      </Section>

      {kind === 'web' && (
        <Section title="Extraction" description="Sélecteurs CSS appliqués à la page. Les sélecteurs de titre, lien, date et résumé sont évalués à l’intérieur de chaque élément.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Élément (un par contenu)" hint="Ex. article, .post-card, li.result" className="sm:col-span-2"><input required spellCheck={false} maxLength={200} value={config.web.itemSelector} onChange={(event) => setWeb({ itemSelector: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
            <Field label="Titre"><input required spellCheck={false} maxLength={200} value={config.web.titleSelector} onChange={(event) => setWeb({ titleSelector: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
            <Field label="Lien" hint="Doit pointer vers un élément portant un href."><input required spellCheck={false} maxLength={200} value={config.web.linkSelector} onChange={(event) => setWeb({ linkSelector: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
            <Field label="Date (facultatif)" hint="Attribut datetime lu en priorité."><input spellCheck={false} maxLength={200} value={config.web.dateSelector} onChange={(event) => setWeb({ dateSelector: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
            <Field label="Résumé (facultatif)"><input spellCheck={false} maxLength={200} value={config.web.summarySelector} onChange={(event) => setWeb({ summarySelector: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
          </div>
        </Section>
      )}

      {kind === 'api' && (
        <>
          <Section title="Mapping des champs" description="Chemins dans la réponse JSON, en notation pointée : data.items, fields.title, links[0].href.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Liste des éléments" hint="Laissez vide si la réponse est directement un tableau." className="sm:col-span-2"><input spellCheck={false} maxLength={120} value={config.api.itemsPath} onChange={(event) => setApi({ itemsPath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} placeholder="data.items" /></Field>
              <Field label="Titre"><input required spellCheck={false} maxLength={120} value={config.api.titlePath} onChange={(event) => setApi({ titlePath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
              <Field label="Lien"><input required spellCheck={false} maxLength={120} value={config.api.linkPath} onChange={(event) => setApi({ linkPath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
              <Field label="Date (facultatif)"><input spellCheck={false} maxLength={120} value={config.api.datePath} onChange={(event) => setApi({ datePath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
              <Field label="Résumé (facultatif)"><input spellCheck={false} maxLength={120} value={config.api.summaryPath} onChange={(event) => setApi({ summaryPath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
            </div>
          </Section>

          <Section title="Pagination" description="Pour récupérer davantage que la première page de résultats.">
            <div className="flex flex-col gap-4">
              <Field label="Mode de pagination">
                <select value={pagination.type} onChange={(event) => setPagination({ type: event.target.value as typeof pagination.type })} className={fieldClass}>
                  {PAGINATION_TYPES.map((type) => <option key={type} value={type}>{PAGINATION_LABELS[type]}</option>)}
                </select>
              </Field>
              {pagination.type !== 'none' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={pagination.type === 'cursor' ? 'Paramètre du curseur' : pagination.type === 'offset' ? 'Paramètre d’offset' : 'Paramètre de page'}><input spellCheck={false} maxLength={64} value={pagination.param} onChange={(event) => setPagination({ param: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
                  <Field label="Paramètre de taille de page"><input spellCheck={false} maxLength={64} value={pagination.sizeParam} onChange={(event) => setPagination({ sizeParam: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
                  <NumberField label="Éléments par page" value={pagination.pageSize} min={1} max={500} onChange={(pageSize) => setPagination({ pageSize })} />
                  <NumberField label="Pages maximum" hint="Garde-fou contre les boucles infinies." value={pagination.maxPages} min={1} max={10} onChange={(maxPages) => setPagination({ maxPages })} />
                  {pagination.type === 'cursor' && <Field label="Chemin du curseur suivant" hint="Où lire le curseur dans la réponse." className="sm:col-span-2"><input spellCheck={false} maxLength={120} value={pagination.cursorPath} onChange={(event) => setPagination({ cursorPath: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>}
                </div>
              )}
            </div>
          </Section>
        </>
      )}

      <details className="group rounded-2xl border bg-card [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
          <span>Réglages avancés <span className="font-normal text-muted-foreground">· délais, en-têtes, tentatives, dédoublonnage</span></span>
          <span className="text-xs font-medium text-primary group-open:hidden">Afficher</span>
          <span className="hidden text-xs font-medium text-primary group-open:inline">Masquer</span>
        </summary>
        <div className="flex flex-col gap-4 border-t p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label="Délai maximum" value={config.http.timeoutSec} min={2} max={30} suffix="s" onChange={(timeoutSec) => setHttp({ timeoutSec })} />
            <NumberField label="Éléments maximum" hint="Par collecte." value={config.http.maxItems} min={1} max={500} onChange={(maxItems) => setHttp({ maxItems })} />
            <Field label="Doublons détectés par">
              <select value={config.dedupe} onChange={(event) => setConfig({ dedupe: event.target.value as ConnectorConfig['dedupe'] })} className={fieldClass}>
                {DEDUPE_OPTIONS.filter((option) => kind === 'rss' || option.value !== 'guid').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Tentatives en cas d’échec" hint="Erreurs réseau, 429 et 5xx uniquement." value={config.retry.maxAttempts} min={1} max={5} onChange={(maxAttempts) => setRetry({ maxAttempts })} />
            <NumberField label="Attente entre tentatives" hint="Doublée à chaque nouvel essai." value={config.retry.backoffSec} min={5} max={3600} suffix="s" onChange={(backoffSec) => setRetry({ backoffSec })} />
          </div>
          <Field label="User-Agent" hint="Identifie Veillio auprès du site interrogé."><input spellCheck={false} maxLength={200} value={config.http.userAgent} onChange={(event) => setHttp({ userAgent: event.target.value })} className={cn(fieldClass, 'font-mono text-[13px]')} /></Field>
          <label className="flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm">
            <input type="checkbox" checked={config.http.followRedirects} onChange={(event) => setHttp({ followRedirects: event.target.checked })} className="mt-0.5 size-4 accent-primary" />
            <span><span className="font-medium">Suivre les redirections</span><span className="block text-xs leading-5 text-muted-foreground">Jusqu’à 5 redirections, chacune revalidée (jamais vers une adresse interne). Les identifiants ne sont pas transmis à un autre domaine.</span></span>
          </label>
          <KeyValueEditor label="En-têtes personnalisés" items={config.http.headers} max={10} namePlaceholder="X-Exemple" valuePlaceholder="valeur" disabled={disabled} onChange={(headers) => setHttp({ headers })} />
        </div>
      </details>
    </fieldset>
  )
}
