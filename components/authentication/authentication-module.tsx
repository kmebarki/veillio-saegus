'use client'

import {
  CheckCircle2,
  CircleDashed,
  Filter,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { transitionAuthenticationMethod } from '@/app/actions/authentication-methods'
import { AuthenticationProposalWizard } from '@/components/authentication/proposal-wizard'
import { Sidebar } from '@/components/veillio-dashboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { AuthenticationMethodView, AuthenticationOverview } from '@/lib/authentication/view-model'

const STATUS_LABELS = {
  brouillon: 'Brouillon',
  a_valider: 'À valider',
  disponible: 'Validé',
  desactivee: 'Désactivé',
  obsolete: 'Obsolète',
} as const

const STAT_CARDS: { label: string; key: keyof AuthenticationOverview['stats']; icon: LucideIcon }[] = [
  { label: 'Méthodes', key: 'methods', icon: KeyRound },
  { label: 'Familles', key: 'families', icon: Filter },
  { label: 'Opérationnelles', key: 'available', icon: ShieldCheck },
  { label: 'À valider', key: 'awaitingReview', icon: CircleDashed },
]

function TechnicalStatus({ method }: { method: AuthenticationMethodView }) {
  if (method.runtime.available) return <Badge>Opérationnelle</Badge>
  if (!method.runtime.handlerKey) return <Badge variant="outline">Non implémentée</Badge>
  return <Badge variant="secondary">À qualifier</Badge>
}

function StatusLine({ label, complete, detail }: { label: string; complete: boolean; detail?: string }) {
  return (
    <li className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
      <Badge variant={complete ? 'secondary' : 'outline'}>{complete ? 'OK' : 'Manquant'}</Badge>
    </li>
  )
}

function ContractSummary({ method }: { method: AuthenticationMethodView }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 text-sm">
            <p className="font-medium">Classification</p>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Famille</span><span>{method.familyLabel}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Variante</span><span>{method.variantLabel ?? 'Aucune'}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 text-sm">
            <p className="font-medium">Transmission</p>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Type</span><span>{method.transmission.type}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Protocole</span><span>{method.transmission.protocol}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">TLS</span><span>{method.transmission.requiresTls ? 'Requis' : 'Non requis'}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Champs</p>
            <Badge variant="outline">{method.fields.length}</Badge>
          </div>
          {method.fields.length ? (
            <ul className="mt-2">
              {method.fields.map((field) => (
                <li key={field.code} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0">
                  <div>
                    <p className="text-sm font-medium">{field.label}</p>
                    <p className="font-mono text-xs text-muted-foreground">{field.code}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {field.required && <Badge variant="outline">Requis</Badge>}
                    {field.secret && <Badge variant="secondary">Secret · coffre</Badge>}
                    {!field.editableInConnection && <Badge variant="outline">Adaptateur</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-muted-foreground">Aucun champ requis.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function ReviewPanel({ method, viewer, onChanged }: { method: AuthenticationMethodView; viewer: AuthenticationOverview['viewer']; onChanged: () => void }) {
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const [pending, startTransition] = useTransition()
  const canSubmit = method.status === 'brouillon' && viewer.canPropose
  const canReview = method.status === 'a_valider' && viewer.canReview
  const canDeactivate = method.status === 'disponible' && viewer.canDeactivate
  const hasSecretValueInContract = method.fields.some((field) => field.secret && field.defaultValue !== null)
  const secretStorageIsValid = method.fields
    .filter((field) => field.secret)
    .every((field) => field.valueSource === 'connection.secretRef' && field.storage?.mode === 'vaultRef' && field.storage.readBack === false)

  function transition(target: 'brouillon' | 'a_valider' | 'disponible' | 'desactivee') {
    setFeedback('')
    startTransition(async () => {
      const result = await transitionAuthenticationMethod({ versionId: method.id, target, reason })
      setFeedback(result.message)
      if (result.ok) onChanged()
    })
  }

  const hasActions = canSubmit || canReview || canDeactivate

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Contrat</p>
            <Badge variant={method.status === 'disponible' ? 'default' : 'outline'}>{STATUS_LABELS[method.status]}</Badge>
          </div>
          <ul className="mt-2">
            <StatusLine label="Définition complète" complete={Boolean(method.displayName && method.familyId && method.version)} />
            <StatusLine label="Secrets externalisés" complete={!hasSecretValueInContract && secretStorageIsValid} />
            <StatusLine label="Transmission définie" complete={Boolean(method.transmission.type && method.transmission.protocol)} />
            <StatusLine label="Revue indépendante" complete={Boolean(method.reviewerUserId && method.reviewerUserId !== method.authorUserId)} />
          </ul>
        </CardContent>
      </Card>

      {hasActions && (
        <Card>
          <CardContent className="p-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`review-reason-${method.id}`}>Motif</FieldLabel>
                <Textarea
                  id={`review-reason-${method.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="8 caractères minimum"
                  aria-invalid={reason.length > 0 && reason.trim().length < 8}
                />
              </Field>
            </FieldGroup>
            {feedback && <p className="mt-3 text-sm text-muted-foreground" role="status">{feedback}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {canSubmit && <Button disabled={pending || reason.trim().length < 8} onClick={() => transition('a_valider')}>Soumettre</Button>}
              {canReview && (
                <>
                  <Button variant="outline" disabled={pending || reason.trim().length < 8} onClick={() => transition('brouillon')}>Demander des corrections</Button>
                  {viewer.canPublish && <Button disabled={pending || reason.trim().length < 8} onClick={() => transition('disponible')}>Valider le contrat</Button>}
                </>
              )}
              {canDeactivate && <Button variant="destructive" disabled={pending || reason.trim().length < 8} onClick={() => transition('desactivee')}>Désactiver</Button>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RuntimePanel({ method }: { method: AuthenticationMethodView }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">État technique</p>
            <TechnicalStatus method={method} />
          </div>
          <ul className="mt-2">
            <StatusLine label="Handler" complete={method.runtime.handlerRegistered} detail={method.runtime.handlerKey ? `${method.runtime.handlerKey} · ${method.runtime.handlerVersion}` : undefined} />
            <StatusLine label="Déploiement" complete={method.runtime.deployed} />
            <StatusLine label="Tests contractuels" complete={method.runtime.contractTestsPassed} />
            <StatusLine label="Revue sécurité" complete={method.runtime.securityReviewed} />
            <StatusLine label="Compatibilité" complete={method.compatibilityCount > 0} detail={method.compatibilityCount ? `${method.compatibilityCount} compatibilité${method.compatibilityCount > 1 ? 's' : ''}` : undefined} />
            <StatusLine label="Activation" complete={method.runtime.enabled} />
          </ul>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Les preuves sont générées côté serveur. Aucune valeur secrète n’est enregistrée dans la méthode.</p>
    </div>
  )
}

function MethodDetail({ method, viewer, onChanged }: { method: AuthenticationMethodView; viewer: AuthenticationOverview['viewer']; onChanged: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{method.methodId}</Badge>
            <Badge variant="secondary">v{method.version}</Badge>
          </div>
          {method.description && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{method.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={method.status === 'disponible' ? 'default' : 'outline'}>{STATUS_LABELS[method.status]}</Badge>
          <TechnicalStatus method={method} />
        </div>
      </div>

      <Tabs defaultValue="definition">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="definition">Définition</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="implementation">Implémentation</TabsTrigger>
        </TabsList>
        <TabsContent value="definition" className="pt-4"><ContractSummary method={method} /></TabsContent>
        <TabsContent value="validation" className="pt-4"><ReviewPanel method={method} viewer={viewer} onChanged={onChanged} /></TabsContent>
        <TabsContent value="implementation" className="pt-4"><RuntimePanel method={method} /></TabsContent>
      </Tabs>
    </div>
  )
}

export function AuthenticationModule({ overview, openProposal = false }: { overview: AuthenticationOverview; openProposal?: boolean }) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<AuthenticationMethodView | null>(null)
  const [proposalOpen, setProposalOpen] = useState(openProposal)

  const methods = useMemo(() => overview.methods.filter((method) => {
    const haystack = `${method.methodId} ${method.displayName} ${method.description} ${method.familyLabel}`.toLocaleLowerCase('fr')
    return (!query.trim() || haystack.includes(query.trim().toLocaleLowerCase('fr'))) && (family === 'all' || method.familyId === family) && (status === 'all' || method.status === status)
  }), [family, overview.methods, query, status])

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Paramètres" />
      <div className="lg:pl-[288px]">
        <main className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <header className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span>Paramètres</span><span>/</span><span className="text-foreground">Authentification</span></div>
              <h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">Méthodes d’authentification</h1>
              <p className="mt-2 text-sm text-muted-foreground">Contrats et état d’exécution.</p>
            </div>
            {overview.viewer.canPropose && <Button onClick={() => setProposalOpen(true)}><Plus data-icon="inline-start" />Proposer</Button>}
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Synthèse du référentiel">
            {STAT_CARDS.map(({ label, key, icon: Icon }) => (
              <Card key={key}>
                <CardContent className="flex items-center gap-4 p-5">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon /></span>
                  <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{overview.stats[key]}</p></div>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="flex flex-col gap-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <label className="relative"><span className="sr-only">Rechercher</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Rechercher une méthode…" /></label>
              <Select value={family} onValueChange={(value) => setFamily(value ?? 'all')}><SelectTrigger aria-label="Filtrer par famille"><SelectValue placeholder="Toutes les familles" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Toutes les familles</SelectItem>{overview.families.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
              <Select value={status} onValueChange={(value) => setStatus(value ?? 'all')}><SelectTrigger aria-label="Filtrer par statut"><SelectValue placeholder="Tous les statuts" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Tous les statuts</SelectItem>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
            </div>

            {methods.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {methods.map((method) => (
                  <button key={method.id} type="button" onClick={() => setSelected(method)} className="flex min-h-40 flex-col rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted/30">
                    <div className="flex w-full items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound /></span><Badge variant={method.status === 'disponible' ? 'default' : 'outline'}>{STATUS_LABELS[method.status]}</Badge></div>
                    <h2 className="mt-4 text-base font-semibold">{method.displayName}</h2>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{method.methodId} · v{method.version}</p>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs">
                      <span>{method.familyLabel}</span>
                      <span className="flex items-center gap-1 font-medium text-muted-foreground">{method.runtime.available ? <CheckCircle2 /> : <CircleDashed />}{method.runtime.available ? 'Opérationnelle' : method.runtime.handlerKey ? 'À qualifier' : 'Non implémentée'}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : <Empty className="border"><EmptyHeader><EmptyTitle>Aucune méthode</EmptyTitle><EmptyDescription>Modifiez les filtres.</EmptyDescription></EmptyHeader></Empty>}
          </section>
        </main>
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.displayName ?? 'Méthode'} size="xl">{selected && <MethodDetail method={selected} viewer={overview.viewer} onChanged={() => { setSelected(null); router.refresh() }} />}</Modal>
      <Modal open={proposalOpen} onClose={() => setProposalOpen(false)} title="Proposer une méthode" size="2xl"><AuthenticationProposalWizard families={overview.families} onClose={() => setProposalOpen(false)} /></Modal>
    </div>
  )
}
