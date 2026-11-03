'use client'

import { CheckCircle2, CircleDashed, Filter, KeyRound, Plus, Search, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { transitionAuthenticationMethod } from '@/app/actions/authentication-methods'
import { AuthenticationProposalWizard } from '@/components/authentication/proposal-wizard'
import { Sidebar } from '@/components/veillio-dashboard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { AuthenticationMethodView, AuthenticationOverview } from '@/lib/authentication/view-model'
import { cn } from '@/lib/utils'

const STATUS_LABELS = { brouillon: 'Brouillon', a_valider: 'À valider', disponible: 'Disponible', desactivee: 'Désactivée', obsolete: 'Obsolète' } as const
const STAT_CARDS: { label: string; key: keyof AuthenticationOverview['stats']; icon: LucideIcon }[] = [
  { label: 'Méthodes', key: 'methods', icon: KeyRound },
  { label: 'Familles', key: 'families', icon: Filter },
  { label: 'Disponibles', key: 'available', icon: ShieldCheck },
  { label: 'À valider', key: 'awaitingReview', icon: CircleDashed },
]

function MethodDetail({ method, viewer, onChanged }: { method: AuthenticationMethodView; viewer: AuthenticationOverview['viewer']; onChanged: () => void }) {
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const [pending, startTransition] = useTransition()
  const canSubmit = method.status === 'brouillon' && viewer.canPropose
  const canReview = method.status === 'a_valider' && viewer.canReview
  const canDeactivate = method.status === 'disponible' && viewer.canDeactivate

  function transition(target: 'brouillon' | 'a_valider' | 'disponible' | 'desactivee') {
    setFeedback('')
    startTransition(async () => {
      const result = await transitionAuthenticationMethod({ versionId: method.id, target, reason })
      setFeedback(result.message)
      if (result.ok) onChanged()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{method.methodId}</Badge><Badge variant="secondary">v{method.version}</Badge><Badge variant={method.status === 'disponible' ? 'default' : 'outline'}>{STATUS_LABELS[method.status]}</Badge></div>
      <div><h3 className="text-lg font-semibold">{method.displayName}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{method.description || 'Aucune description.'}</p></div>
      {!method.runtime.available && <Alert><ShieldAlert /><AlertTitle>Non disponible au runtime</AlertTitle><AlertDescription>Mode fail-closed : {method.runtime.missing.join(', ')}.</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardHeader><CardTitle>Classification</CardTitle><CardDescription>Famille et variante contractuelles</CardDescription></CardHeader><CardContent className="flex flex-col gap-2 text-sm"><p><span className="text-muted-foreground">Famille :</span> {method.familyLabel}</p><p><span className="text-muted-foreground">Variante :</span> {method.variantLabel ?? 'Aucune'}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Transmission</CardTitle><CardDescription>Résolue par l’adaptateur vérifié</CardDescription></CardHeader><CardContent className="flex flex-col gap-2 text-sm"><p><span className="text-muted-foreground">Type :</span> {method.transmission.type}</p><p><span className="text-muted-foreground">Protocole :</span> {method.transmission.protocol}</p><p><span className="text-muted-foreground">TLS :</span> {method.transmission.requiresTls ? 'Requis' : 'Non requis'}</p></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Schéma de Connexion</CardTitle><CardDescription>{method.fields.length} champ{method.fields.length > 1 ? 's' : ''} · les secrets ne sont jamais relus</CardDescription></CardHeader><CardContent>{method.fields.length ? <ul className="flex flex-col gap-2">{method.fields.map((field) => <li key={field.code} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-medium">{field.label}</p><p className="font-mono text-xs text-muted-foreground">{field.code} · {field.valueSource}</p></div><div className="flex gap-2">{field.required && <Badge variant="outline">Requis</Badge>}{field.secret && <Badge variant="secondary">Secret</Badge>}{!field.editableInConnection && <Badge variant="outline">Adaptateur</Badge>}</div></li>)}</ul> : <p className="text-sm text-muted-foreground">Aucun champ requis.</p>}</CardContent></Card>
      {(canSubmit || canReview || canDeactivate) && <Card><CardHeader><CardTitle>Gouvernance</CardTitle><CardDescription>Chaque transition exige un motif et produit un événement d’audit.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motif de la transition (8 caractères minimum)…" aria-label="Motif de la transition" />{feedback && <p className="text-sm text-muted-foreground" role="status">{feedback}</p>}<div className="flex flex-wrap gap-2">{canSubmit && <Button disabled={pending || reason.trim().length < 8} onClick={() => transition('a_valider')}>Soumettre à validation</Button>}{canReview && <><Button variant="outline" disabled={pending || reason.trim().length < 8} onClick={() => transition('brouillon')}>Demander des corrections</Button>{viewer.canPublish && <Button disabled={pending || reason.trim().length < 8} onClick={() => transition('disponible')}>Publier</Button>}</>}{canDeactivate && <Button variant="destructive" disabled={pending || reason.trim().length < 8} onClick={() => transition('desactivee')}>Désactiver</Button>}</div></CardContent></Card>}
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
        <main className="mx-auto flex max-w-[1500px] flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <header className="flex flex-col justify-between gap-5 border-b pb-6 sm:flex-row sm:items-end">
            <div><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span>Paramètres</span><span>/</span><span className="text-foreground">Authentification</span></div><h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">Référentiel Authentification</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Contrats versionnés, gouvernance et preuves runtime. Une définition déclarative ne vaut jamais capacité technique.</p></div>
            {overview.viewer.canPropose && <Button onClick={() => setProposalOpen(true)}><Plus data-icon="inline-start" />Proposer une méthode</Button>}
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Synthèse du référentiel">
            {STAT_CARDS.map(({ label, key, icon: Icon }) => <Card key={key}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{overview.stats[key]}</p></div></CardContent></Card>)}
          </section>

          <Alert><ShieldCheck /><AlertTitle>Mode strict et shadow mode</AlertTitle><AlertDescription>Les 18 définitions V1.3.0 sont seedées comme références non disponibles. Les Connecteurs existants restent qualifiables, mais aucune méthode ne devient « Disponible » sans handler, tests, revue indépendante, compatibilité et activation.</AlertDescription></Alert>

          <section className="flex flex-col gap-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <label className="relative"><span className="sr-only">Rechercher</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Méthode, identifiant, famille…" /></label>
              <Select value={family} onValueChange={(value) => setFamily(value ?? 'all')}><SelectTrigger aria-label="Filtrer par famille"><SelectValue placeholder="Toutes les familles" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Toutes les familles</SelectItem>{overview.families.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
              <Select value={status} onValueChange={(value) => setStatus(value ?? 'all')}><SelectTrigger aria-label="Filtrer par statut"><SelectValue placeholder="Tous les statuts" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Tous les statuts</SelectItem>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
            </div>

            {methods.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{methods.map((method) => <button key={method.id} type="button" onClick={() => setSelected(method)} className="flex min-h-52 flex-col rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"><div className="flex w-full items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound /></span><Badge variant={method.status === 'disponible' ? 'default' : 'outline'}>{STATUS_LABELS[method.status]}</Badge></div><h2 className="mt-5 text-base font-semibold">{method.displayName}</h2><p className="mt-1 font-mono text-xs text-muted-foreground">{method.methodId} · v{method.version}</p><p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">{method.description}</p><div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs"><span>{method.familyLabel}</span><span className={cn('flex items-center gap-1 font-medium', method.runtime.available ? 'text-primary' : 'text-muted-foreground')}>{method.runtime.available ? <CheckCircle2 /> : <CircleDashed />}{method.runtime.available ? 'Runtime validé' : `${method.runtime.missing.length} preuve(s) manquante(s)`}</span></div></button>)}</div> : <Empty className="border"><EmptyHeader><EmptyTitle>Aucune méthode trouvée</EmptyTitle><EmptyDescription>Modifiez les filtres ou la recherche.</EmptyDescription></EmptyHeader></Empty>}
          </section>
        </main>
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.displayName ?? 'Méthode'} description="Définition contractuelle, transmission et état runtime" size="xl">{selected && <MethodDetail method={selected} viewer={overview.viewer} onChanged={() => { setSelected(null); router.refresh() }} />}</Modal>
      <Modal open={proposalOpen} onClose={() => setProposalOpen(false)} title="Proposer une méthode" description="La proposition est enregistrée uniquement en brouillon." size="2xl"><AuthenticationProposalWizard families={overview.families} onClose={() => setProposalOpen(false)} /></Modal>
    </div>
  )
}
