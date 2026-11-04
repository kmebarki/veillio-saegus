'use client'

import {
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Database,
  FileKey,
  Globe2,
  KeyRound,
  LoaderCircle,
  Mail,
  Search,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'

import { createConnector, testConnectorDraft } from '@/app/actions/connectors'
import { headerRulesToStaticHeaders, HttpHeaderPolicyEditor } from '@/components/http-header-policy-editor'
import { EndpointsSection } from '@/components/openapi-import'
import { authMethodRegistry } from '@/lib/auth-method-registry'
import {
  SERVICE_CATALOG,
  SERVICE_CATEGORIES,
  configForService,
  connectorKindForService,
  isServiceOperational,
  type AuthMethodId,
  type ServiceCategory,
  type ServiceDefinition,
} from '@/lib/connector-service-catalog'
import { defaultConfig, type ConnectorConfig, type HttpHeaderRule } from '@/lib/connector-catalog'
import { commitActiveEndpoint } from '@/lib/connectors/endpoints'
import type { TestOutcome } from '@/lib/connector-types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const STEPS = [
  { id: 1, label: 'Identification', icon: Database },
  { id: 2, label: 'Authentification', icon: KeyRound },
  { id: 3, label: 'Capacités / API', icon: Braces },
  { id: 4, label: 'Vérification', icon: ShieldCheck },
] as const

const CATEGORY_ICONS: Record<ServiceCategory, typeof Globe2> = {
  Web: Globe2,
  'Bases de données': Database,
  'Flux RSS / Atom': Database,
  'Réseaux sociaux': Globe2,
  'Stockage cloud': Database,
  'Boîtes mail': Mail,
  'Dossiers locaux': Database,
  'Messageries collaboratives': Mail,
  'Bases de connaissances': FileKey,
}

const RESERVED_HEADERS = new Set(['authorization', 'host', 'content-length', 'cookie', 'set-cookie', 'proxy-authorization'])

type Props = {
  onCancel: () => void
  onCreated: (message: string, id: string) => void
}

type HeaderDraft = HttpHeaderRule

function WizardStep({ step, current }: { step: (typeof STEPS)[number]; current: number }) {
  const complete = step.id < current
  const active = step.id === current
  const Icon = step.icon
  return (
    <li className="flex min-w-40 flex-1 items-center gap-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full border text-sm font-semibold', complete && 'border-primary bg-primary text-primary-foreground', active && 'border-primary bg-primary/10 text-primary', !active && !complete && 'bg-card text-muted-foreground')}>
        {complete ? <Check /> : <Icon />}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-muted-foreground">Étape {step.id}</span>
        <span className={cn('block truncate text-sm font-semibold', active && 'text-primary')}>{step.label}</span>
      </span>
      {step.id < STEPS.length && <ChevronRight className="ml-auto text-muted-foreground" aria-hidden />}
    </li>
  )
}

function SummaryCard({ service, name, authMethods, endpoint, endpointCount, headers }: { service: ServiceDefinition | undefined; name: string; authMethods: AuthMethodId[]; endpoint: string; endpointCount: number; headers: HeaderDraft[] }) {
  const Icon = service ? CATEGORY_ICONS[service.category] : Database
  return (
    <aside className="flex flex-col gap-4 rounded-2xl border bg-card p-5 lg:sticky lg:top-24 lg:self-start" aria-label="Aperçu du connecteur">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon /></span>
        <div className="min-w-0"><p className="text-xs text-muted-foreground">Aperçu</p><h3 className="truncate font-semibold">{name || 'Nouveau connecteur'}</h3></div>
      </div>
      <dl className="flex flex-col gap-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">Service</dt><dd className="mt-1 font-medium">{service?.name ?? 'À sélectionner'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Adaptateur associé</dt><dd className="mt-1 font-medium">{service?.adapter ?? '—'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Authentification</dt><dd className="mt-1">{authMethods.length ? authMethods.map((id) => authMethodRegistry.get(id)?.label ?? id).join(', ') : 'À définir'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Cible technique</dt><dd className="mt-1 break-all font-mono text-xs">{endpoint || 'Non renseignée'}</dd></div>
        {service?.api && <div><dt className="text-xs text-muted-foreground">Endpoints API</dt><dd className="mt-1">{endpointCount} endpoint{endpointCount > 1 ? 's' : ''}</dd></div>}
        <div><dt className="text-xs text-muted-foreground">Politique HTTP</dt><dd className="mt-1">{headers.length} règle{headers.length > 1 ? 's' : ''}</dd></div>
      </dl>
      {service && (
        <div className={cn('rounded-xl px-3 py-2.5 text-xs leading-5', isServiceOperational(service) ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground')}>
          {isServiceOperational(service) ? 'Adaptateur disponible dans le moteur actuel.' : 'Définition enregistrable en brouillon. L’adaptateur doit être validé avant activation.'}
        </div>
      )}
    </aside>
  )
}

export function ConnectorWizard({ onCancel, onCreated }: Props) {
  const [step, setStep] = useState(1)
  const [category, setCategory] = useState<ServiceCategory>('Web')
  const [serviceId, setServiceId] = useState('')
  const [serviceQuery, setServiceQuery] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [authMethods, setAuthMethods] = useState<AuthMethodId[]>([])
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [headers, setHeaders] = useState<HeaderDraft[]>([])
  const [apiDraft, setApiDraft] = useState<ConnectorConfig['api']>(() => defaultConfig('api').api)
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const [error, setError] = useState('')
  const [isTesting, startTesting] = useTransition()
  const [isSaving, startSaving] = useTransition()

  const services = useMemo(() => SERVICE_CATALOG.filter((service) => service.category === category && (!serviceQuery.trim() || `${service.name} ${service.ecosystem} ${service.description}`.toLocaleLowerCase('fr').includes(serviceQuery.trim().toLocaleLowerCase('fr')))), [category, serviceQuery])
  const service = SERVICE_CATALOG.find((item) => item.id === serviceId)
  const supportedMethods = service ? authMethodRegistry.listSupported(service.authCandidates) : []
  const categoryItems = SERVICE_CATEGORIES.map((item) => ({ value: item, label: item }))
  const endpointEditorConfig = useMemo(() => {
    if (!service) return null
    const config = configForService(service, authMethods)
    config.url = endpoint
    config.api = apiDraft
    config.http.headerPolicy = headers
    return config
  }, [apiDraft, authMethods, endpoint, headers, service])

  function chooseService(nextService: ServiceDefinition) {
    setServiceId(nextService.id)
    setName(nextService.name.replace(/\s+—\s+.+$/, ''))
    const usableMethods = nextService.authCandidates.filter((method) => method !== 'CUSTOM')
    setAuthMethods(usableMethods.includes('NONE') ? ['NONE'] : usableMethods.slice(0, 1))
    setCapabilities(nextService.api ? ['endpoints', 'headers', 'mapping'] : ['lecture', 'normalisation', 'deduplication'])
    setEndpoint('')
    setApiDraft(defaultConfig(connectorKindForService(nextService)).api)
    setOutcome(null)
  }

  function toggleAuth(id: AuthMethodId) {
    if (id === 'CUSTOM') return
    setAuthMethods((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current.filter((item) => item !== 'NONE' || id === 'NONE'), id])
    setOutcome(null)
  }

  function updateApiEndpoints(next: ConnectorConfig) {
    setApiDraft(next.api)
    setEndpoint(next.url)
    setOutcome(null)
    const detectedMethod: Partial<Record<ConnectorConfig['auth']['type'], AuthMethodId>> = {
      none: 'NONE',
      basic: 'BASIC_AUTH',
      bearer: 'BEARER_TOKEN',
      api_key_header: 'API_KEY',
      api_key_query: 'API_KEY',
      oauth_client: 'OAUTH2_CLIENT',
    }
    const method = detectedMethod[next.auth.type]
    if (method && service?.authCandidates.includes(method)) setAuthMethods([method])
  }

  function validateCurrentStep() {
    setError('')
    if (step === 1 && (!service || name.trim().length < 2)) {
      setError(!service ? 'Sélectionnez un service dans le catalogue V3.' : 'Le nom doit contenir au moins 2 caractères.')
      return false
    }
    if (step === 2 && authMethods.length === 0 && supportedMethods.some((method) => method.status === 'available')) {
      setError('Sélectionnez au moins une méthode prise en charge par l’adaptateur.')
      return false
    }
    if (step === 3) {
      const kind = service ? connectorKindForService(service) : 'api'
      if (kind !== 'webhook' && !endpoint.trim()) {
        setError(kind === 'imap' ? 'Renseignez le serveur de messagerie.' : 'Renseignez l’adresse technique du service.')
        return false
      }
      const invalidHeader = headers.find((header) => !header.name.trim() || RESERVED_HEADERS.has(header.name.trim().toLowerCase()))
      if (invalidHeader) {
        setError(!invalidHeader.name.trim() ? 'Chaque règle HTTP doit avoir un nom.' : `L’en-tête « ${invalidHeader.name} » est réservé et ne peut pas être défini ici.`)
        return false
      }
    }
    return true
  }

  function next() {
    if (!validateCurrentStep()) return
    setStep((current) => Math.min(4, current + 1))
  }

  function buildConfig() {
    if (!service) return null
    const config = configForService(service, authMethods)
    const kind = connectorKindForService(service)
    if (kind === 'imap') config.imap.host = endpoint.replace(/^https?:\/\//, '').split('/')[0]
    else if (kind === 'webhook') config.integration.parameters.receiver = endpoint
    else config.url = endpoint
    config.api = apiDraft
    config.http.headerPolicy = headers
    config.http.headers = headerRulesToStaticHeaders(headers, apiDraft.activeEndpointId)
    config.integration.parameters.capabilities = capabilities.join(',')
    return { kind, config: commitActiveEndpoint(config) }
  }

  function testDraft() {
    const prepared = buildConfig()
    if (!prepared || !service) return
    setError('')
    if (!isServiceOperational(service)) {
      setError('Cet adaptateur n’est pas attesté dans le registre déployé. Le connecteur peut être enregistré uniquement en brouillon.')
      return
    }
    if (!authMethods.includes('NONE')) {
      setError('Le test authentifié sera disponible après création d’une Connexion, sans stocker de secret dans le Connecteur.')
      return
    }
    startTesting(async () => {
      const result = await testConnectorDraft({ kind: prepared.kind, config: prepared.config })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setOutcome(result.outcome)
    })
  }

  function save() {
    const prepared = buildConfig()
    if (!prepared || !service) return
    setError('')
    startSaving(async () => {
      const result = await createConnector({ kind: prepared.kind, name, description, logoUrl: '', config: prepared.config })
      if (!result.ok) {
        setError(result.message)
        return
      }
      onCreated(result.message, result.id)
    })
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-end">
        <div>
          <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft data-icon="inline-start" />Retour au catalogue</Button>
          <h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">Nouveau connecteur</h1>
          <p className="mt-2 text-sm text-muted-foreground">Définissez le contrat technique sans enregistrer d’identifiants ni de secrets.</p>
        </div>
        <Badge variant="secondary">Catalogue V3 · 103 services</Badge>
      </div>

      <ol className="flex gap-4 overflow-x-auto rounded-2xl border bg-card p-4" aria-label="Progression de la création">
        {STEPS.map((item) => <WizardStep key={item.id} step={item} current={step} />)}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6">
          {step === 1 && (
            <div className="flex flex-col gap-6">
              <div><p className="text-xs font-semibold text-primary">01 — Identification</p><h2 className="mt-1 font-serif text-2xl">Quel service souhaitez-vous connecter ?</h2><p className="mt-2 text-sm text-muted-foreground">La catégorie et le service déterminent automatiquement l’adaptateur technique.</p></div>
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field><FieldLabel>Catégorie</FieldLabel><Select items={categoryItems} value={category} onValueChange={(value) => { setCategory((value ?? 'Web') as ServiceCategory); setServiceId(''); setServiceQuery('') }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{SERVICE_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                  <Field><FieldLabel htmlFor="service-search">Rechercher dans la catégorie</FieldLabel><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="service-search" value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} className="pl-9" placeholder="Nom, écosystème…" /></div></Field>
                </div>
                <Field><FieldLabel>Service / Connecteur</FieldLabel><div className="grid max-h-72 gap-2 overflow-y-auto rounded-xl border bg-muted/20 p-2 sm:grid-cols-2">{services.map((item) => { const checked = item.id === serviceId; const Icon = CATEGORY_ICONS[item.category]; return <button key={item.id} type="button" onClick={() => chooseService(item)} className={cn('flex items-start gap-3 rounded-xl border p-3 text-left transition-colors', checked ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-muted/60')}><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{item.name}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.ecosystem} · {item.description}</span></span>{checked && <CircleCheck className="shrink-0 text-primary" aria-hidden />}</button> })}{services.length === 0 && <p className="col-span-full p-8 text-center text-sm text-muted-foreground">Aucun service ne correspond à cette recherche.</p>}</div><FieldDescription>{services.length} service{services.length > 1 ? 's' : ''} dans cette catégorie.</FieldDescription></Field>
                {service && <div className="flex items-start gap-3 rounded-xl border bg-primary/5 p-4"><Braces className="mt-0.5 shrink-0 text-primary" aria-hidden /><div><p className="text-sm font-semibold">Adaptateur associé automatiquement</p><p className="mt-1 text-sm text-muted-foreground">{service.adapter} · {service.status}</p></div></div>}
                <Field><FieldLabel htmlFor="connector-name">Nom du connecteur</FieldLabel><Input id="connector-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Ex. Veille réglementaire — France" /></Field>
                <Field><FieldLabel htmlFor="connector-description">Description</FieldLabel><textarea id="connector-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} rows={3} className="min-h-24 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" placeholder="Finalité, périmètre et responsable technique…" /></Field>
              </FieldGroup>
            </div>
          )}

          {step === 2 && service && (
            <div className="flex flex-col gap-6">
              <div><p className="text-xs font-semibold text-primary">02 — Authentification</p><h2 className="mt-1 font-serif text-2xl">Méthodes prises en charge</h2><p className="mt-2 text-sm text-muted-foreground">Le Connecteur enregistre uniquement les références autorisées. Les valeurs et secrets seront saisis dans Connexions.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {supportedMethods.map((method) => {
                  const checked = authMethods.includes(method.id)
                  const unavailable = method.status !== 'available'
                  return (
                    <label key={method.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4', checked && 'border-primary bg-primary/5', unavailable && 'cursor-default bg-muted/40')}>
                      <Checkbox checked={checked} disabled={unavailable} onCheckedChange={() => toggleAuth(method.id)} aria-label={method.label} />
                      <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm">{method.label}</strong><Badge variant="outline">{method.id}</Badge><Badge variant={unavailable ? 'secondary' : 'default'}>{unavailable ? 'Proposition · non activable' : 'Disponible'}</Badge></span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{method.description}</span><span className="mt-2 block text-xs font-medium">Transmission : {method.transport}</span></span>
                    </label>
                  )
                })}
              </div>
              <div className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold">Une méthode manque ?</p><p className="mt-1 text-xs text-muted-foreground">Toute proposition passe par le référentiel central avant de devenir utilisable.</p></div><Link href={authMethodRegistry.getProposalHref()} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">Proposer une méthode</Link></div>
              <div className="flex items-start gap-3 rounded-xl bg-primary/10 p-4 text-sm"><ShieldCheck className="mt-0.5 shrink-0 text-primary" aria-hidden /><p>Aucun secret n’est demandé ici. Le futur formulaire de Connexion sera généré depuis le contrat de la méthode sélectionnée.</p></div>
            </div>
          )}

          {step === 3 && service && (
            <div className="flex flex-col gap-6">
              <div><p className="text-xs font-semibold text-primary">03 — Capacités / API</p><h2 className="mt-1 font-serif text-2xl">Contrat technique de l’adaptateur</h2><p className="mt-2 text-sm text-muted-foreground">Déclarez la cible, les capacités et la politique d’en-têtes HTTP. Les valeurs sensibles restent dans Connexions.</p></div>
              <FieldGroup>
                <Field><FieldLabel htmlFor="endpoint">{connectorKindForService(service) === 'imap' ? 'Serveur de messagerie' : connectorKindForService(service) === 'webhook' ? 'Identifiant du récepteur (facultatif)' : 'Adresse technique'}</FieldLabel><Input id="endpoint" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setOutcome(null) }} placeholder={connectorKindForService(service) === 'imap' ? 'imap.exemple.fr' : 'https://api.exemple.fr/v1'} /><FieldDescription>Ce champ décrit la cible du Connecteur, jamais un identifiant personnel.</FieldDescription></Field>
                <Field><FieldLabel>Capacités déclarées</FieldLabel><div className="grid gap-2 sm:grid-cols-3">{(service.api ? [['endpoints', 'Endpoints'], ['headers', 'En-têtes HTTP'], ['mapping', 'Mapping des sorties']] : [['lecture', 'Lecture'], ['normalisation', 'Normalisation'], ['deduplication', 'Déduplication']]).map(([id, label]) => <label key={id} className="flex items-center gap-3 rounded-xl border p-3 text-sm font-medium"><Checkbox checked={capabilities.includes(id)} onCheckedChange={(checked) => setCapabilities((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))} />{label}</label>)}</div></Field>
                {service.api && endpointEditorConfig && <EndpointsSection config={endpointEditorConfig} onChange={updateApiEndpoints} allowEndpointEditing />}
                <Field><HttpHeaderPolicyEditor rules={headers} endpoints={apiDraft.endpoints} onChange={(next) => { setHeaders(next); setOutcome(null) }} /></Field>
              </FieldGroup>
            </div>
          )}

          {step === 4 && service && (
            <div className="flex flex-col gap-6">
              <div><p className="text-xs font-semibold text-primary">04 — Vérification</p><h2 className="mt-1 font-serif text-2xl">Contrôlez avant l’enregistrement</h2><p className="mt-2 text-sm text-muted-foreground">Le Connecteur sera créé en brouillon. L’activation reste conditionnée à un adaptateur disponible, une Connexion valide et un test réussi.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[['Service', service.name], ['Adaptateur', service.adapter], ['Méthodes', authMethods.join(', ') || 'À valider dans le référentiel central'], ['Cible', endpoint || 'Non requise'], ['Endpoints', service.api ? `${apiDraft.endpoints.length} importé${apiDraft.endpoints.length > 1 ? 's' : ''}` : 'Non applicable'], ['Capacités', capabilities.join(', ') || 'Aucune'], ['En-têtes', `${headers.length} règle${headers.length > 1 ? 's' : ''}`]].map(([label, value]) => <div key={label} className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>)}
              </div>
              {!isServiceOperational(service) && <div className="flex items-start gap-3 rounded-xl bg-secondary p-4 text-sm"><CircleAlert className="mt-0.5 shrink-0" aria-hidden /><p><strong>Adaptateur non attesté.</strong> Cette définition restera en brouillon et ne pourra pas être activée tant que le registre technique n’aura pas validé l’adaptateur.</p></div>}
              {outcome && <div className={cn('flex items-start gap-3 rounded-xl p-4 text-sm', outcome.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}><CircleCheck className="mt-0.5 shrink-0" aria-hidden /><div><p className="font-semibold">{outcome.message}</p><p className="mt-1 text-xs">{outcome.httpStatus ? `HTTP ${outcome.httpStatus} · ` : ''}{outcome.durationMs} ms · {outcome.itemsFound ?? 0} élément(s)</p></div></div>}
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={testDraft} disabled={isTesting || isSaving || !isServiceOperational(service)}>{isTesting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}{isTesting ? 'Vérification…' : 'Vérifier la configuration'}</Button><Button type="button" onClick={save} disabled={isSaving}>{isSaving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <CircleCheck data-icon="inline-start" />}{isSaving ? 'Enregistrement…' : 'Enregistrer le brouillon'}</Button></div>
            </div>
          )}

          {error && <FieldError className="mt-5">{error}</FieldError>}
        </div>
        <SummaryCard service={service} name={name} authMethods={authMethods} endpoint={endpoint} endpointCount={apiDraft.endpoints.length} headers={headers} />
      </div>

      <footer className="flex flex-col-reverse justify-between gap-3 border-t pt-5 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">Étape {step} sur 4 · {STEPS[step - 1].label}</p>
        <div className="flex gap-2"><Button variant="outline" onClick={step === 1 ? onCancel : () => { setStep((current) => current - 1); setError('') }}>{step === 1 ? 'Annuler' : <><ArrowLeft data-icon="inline-start" />Précédent</>}</Button>{step < 4 && <Button onClick={next}>Continuer<ArrowRight data-icon="inline-end" /></Button>}</div>
      </footer>
    </section>
  )
}
