'use client'

import { ArrowLeft, ArrowRight, Check, Database, Globe2, KeyRound, LockKeyhole, Mail, Radio, Webhook } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'

import { createSource } from '@/app/actions/sources'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/modal'
import type { SourceConnectorChoice, SourceScope } from '@/lib/source-types'
import { cn } from '@/lib/utils'

const categoryExamples = [
  { label: 'Web', icon: Globe2, detail: 'Pages web et API' },
  { label: 'Bases de données', icon: Database, detail: 'Via un Connecteur vérifié' },
  { label: 'Réseaux sociaux', icon: Radio, detail: 'Adaptateur non disponible' },
  { label: 'Stockage cloud', icon: Database, detail: 'Adaptateur non disponible' },
  { label: 'Boîtes mail', icon: Mail, detail: 'IMAP en lecture seule' },
  { label: 'Dossiers locaux', icon: LockKeyhole, detail: 'Adaptateur non disponible' },
  { label: 'Flux RSS / Atom', icon: Radio, detail: 'Flux normalisés' },
  { label: 'Webhook entrant', icon: Webhook, detail: 'Événements poussés' },
  { label: 'Microsoft 365', icon: Database, detail: 'SharePoint et OneDrive' },
  { label: 'Slack / Teams', icon: Radio, detail: 'Adaptateur non disponible' },
]

type Draft = { connectorId: string; connectionId: string; name: string; description: string; imageUrl: string; endpoint: string; scope: SourceScope }
const initialDraft: Draft = { connectorId: '', connectionId: '', name: '', description: '', imageUrl: '', endpoint: '', scope: 'organization' }

export function SourceWizard({ connectors, onClose, onCreated }: { connectors: SourceConnectorChoice[]; onClose: () => void; onCreated: (message: string, id: string) => void }) {
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState(initialDraft)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const selected = connectors.find((item) => item.id === draft.connectorId) ?? null
  const availableCategories = new Set(connectors.map((item) => item.category))
  const connections = useMemo(() => selected?.connections.filter((item) => draft.scope === 'user' || item.scope === 'organization') ?? [], [selected, draft.scope])

  function chooseConnector(connector: SourceConnectorChoice) {
    setDraft((current) => ({ ...current, connectorId: connector.id, connectionId: '' }))
    setError('')
  }

  function next() {
    if (step === 1 && !selected) return setError('Sélectionnez un Connecteur du registre technique.')
    if (step === 2 && selected?.requiresConnection && !draft.connectionId) return setError('Sélectionnez une Connexion autorisée pour ce Connecteur.')
    if (step === 3 && (!draft.name.trim() || !draft.endpoint.trim())) return setError('Renseignez le nom et l’origine de la Source.')
    setError('')
    setStep((current) => Math.min(4, current + 1))
  }

  function submit() {
    startTransition(async () => {
      const response = await createSource({ ...draft, connectionId: draft.connectionId || null })
      if (!response.ok) return setError(response.message)
      onCreated(response.message, response.id)
    })
  }

  return (
    <div className="flex min-h-[600px] flex-col">
      <div className="grid grid-cols-4 gap-2 border-b pb-5" aria-label="Progression">
        {['Connecteur', 'Accès', 'Définition', 'Validation'].map((label, index) => (
          <div key={label} className="flex items-center gap-2 text-xs font-medium">
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-full border', step > index + 1 ? 'border-primary bg-primary text-primary-foreground' : step === index + 1 ? 'border-primary text-primary' : 'text-muted-foreground')}>{step > index + 1 ? <Check className="size-3.5" /> : index + 1}</span>
            <span className="hidden sm:inline">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-5 py-6">
        {step === 1 && <>
          <div><h3 className="text-lg font-semibold">Choisissez une capacité technique</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Les catégories décrivent le catalogue cible. Seuls les Connecteurs présents dans le registre sont sélectionnables.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {categoryExamples.map(({ label, icon: Icon, detail }) => <div key={label} className={cn('rounded-2xl border p-3', availableCategories.has(label) ? 'bg-card' : 'bg-muted/40 text-muted-foreground')}><Icon className="size-4" /><p className="mt-3 text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {connectors.map((connector) => <button key={connector.id} type="button" onClick={() => chooseConnector(connector)} className={cn('rounded-2xl border p-4 text-left transition-colors', draft.connectorId === connector.id ? 'border-primary bg-accent' : 'bg-card hover:border-primary/50')}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{connector.name}</p><p className="mt-1 text-xs font-medium text-primary">{connector.category}</p></div><span className={cn('size-2 rounded-full', connector.ready ? 'bg-primary' : 'bg-muted-foreground/40')} /></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{connector.description}</p><p className="mt-2 text-xs text-muted-foreground">{connector.ready ? 'Contrôle technique concluant' : connector.healthDetail}</p></button>)}
          </div>
        </>}

        {step === 2 && selected && <>
          <div><h3 className="text-lg font-semibold">Définissez le périmètre et l’accès</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Une définition partagée ne partage jamais les identifiants. Une Source partagée ne peut utiliser qu’une Connexion organisationnelle.</p></div>
          <fieldset className="flex flex-col gap-3"><legend className="mb-2 text-sm font-medium">Périmètre de la définition</legend>{([['organization', 'Partagée avec l’organisation', 'Connexion organisationnelle uniquement'], ['user', 'Individuelle', 'Connexion organisationnelle ou votre Connexion personnelle']] as const).map(([value, label, detail]) => <label key={value} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-4', draft.scope === value && 'border-primary bg-accent')}><input type="radio" name="scope" checked={draft.scope === value} onChange={() => setDraft((current) => ({ ...current, scope: value, connectionId: '' }))} className="mt-1 accent-[var(--primary)]" /><span><strong className="text-sm">{label}</strong><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></span></label>)}</fieldset>
          {selected.requiresConnection ? <fieldset className="flex flex-col gap-3"><legend className="mb-2 text-sm font-medium">Connexion autorisée</legend>{connections.length ? connections.map((connection) => <label key={connection.id} className={cn('flex cursor-pointer items-start justify-between gap-3 rounded-2xl border p-4', draft.connectionId === connection.id && 'border-primary bg-accent')}><span className="flex items-start gap-3"><input type="radio" name="connection" checked={draft.connectionId === connection.id} onChange={() => setDraft((current) => ({ ...current, connectionId: connection.id }))} className="mt-1 accent-[var(--primary)]" /><span><strong className="text-sm">{connection.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{connection.scope === 'organization' ? 'Organisation' : 'Personnelle'} · {connection.detail}</span></span></span><span className={cn('mt-1 size-2 rounded-full', connection.ready ? 'bg-primary' : 'bg-destructive')} /></label>) : <div className="rounded-2xl border border-dashed bg-muted/40 p-5 text-sm text-muted-foreground">Aucune Connexion compatible n’est disponible dans ce périmètre. Créez ou vérifiez d’abord une Connexion pour ce Connecteur.</div>}</fieldset> : <div className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground"><KeyRound className="mr-2 inline size-4" />Ce Connecteur utilise une ressource publique : une Connexion technique « None » sera créée ou réutilisée automatiquement, sans secret.</div>}
        </>}

        {step === 3 && selected && <>
          <div><h3 className="text-lg font-semibold">Décrivez l’origine d’information</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Aucun secret ne doit être saisi ici. Les identifiants restent attachés à la Connexion choisie.</p></div>
          <label className="flex flex-col gap-2 text-sm font-medium">Nom de la Source<input className={fieldClass} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex. Actualités de la Commission européenne" /></label>
          <label className="flex flex-col gap-2 text-sm font-medium">Origine ou chemin<input className={fieldClass} value={draft.endpoint} onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))} placeholder={['rss', 'web', 'api'].includes(selected.kind) ? 'https://…' : selected.kind === 'imap' ? 'INBOX/Newsletters' : 'Chemin de la ressource'} /></label>
          <label className="flex flex-col gap-2 text-sm font-medium">Image <span className="font-normal text-muted-foreground">(facultative)</span><input type="url" className={fieldClass} value={draft.imageUrl} onChange={(event) => setDraft((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="https://exemple.com/image.jpg" /></label>
          <label className="flex flex-col gap-2 text-sm font-medium">Description <span className="font-normal text-muted-foreground">(facultative)</span><textarea className="min-h-28 w-full rounded-xl border bg-background p-3 text-sm font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Expliquez ce que cette Source apporte aux Veilles." /></label>
        </>}

        {step === 4 && selected && <>
          <div><h3 className="text-lg font-semibold">Vérifiez la chaîne de collecte</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Cette étape crée la définition de Source. Elle ne crée ni Veille, ni Collecte, et ne modifie aucune Connexion.</p></div>
          <div className="grid gap-3 rounded-2xl border bg-muted/30 p-5 sm:grid-cols-2"><Summary label="Source" value={draft.name} /><Summary label="Connecteur" value={selected.name} /><Summary label="Périmètre" value={draft.scope === 'organization' ? 'Organisation' : 'Individuel'} /><Summary label="Connexion" value={selected.requiresConnection ? selected.connections.find((item) => item.id === draft.connectionId)?.name ?? 'Non définie' : 'None · créée ou réutilisée automatiquement'} /><div className="sm:col-span-2"><Summary label="Origine" value={draft.endpoint} /></div><div className="sm:col-span-2"><Summary label="Image" value={draft.imageUrl} /></div></div>
          <div className="rounded-2xl border p-5"><p className="text-sm font-semibold">Connecteur → Connexion → Source → Veille → Collecte</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Le Connecteur fournit la capacité technique, la Connexion porte l’accès, et cette Source décrit l’origine. L’association à une Veille et l’exécution des Collectes restent séparées.</p></div>
        </>}
        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{error}</p>}
      </div>

      <div className="flex items-center justify-between border-t pt-5"><Button variant="ghost" onClick={step === 1 ? onClose : () => { setError(''); setStep((current) => current - 1) }}><ArrowLeft data-icon="inline-start" />{step === 1 ? 'Annuler' : 'Retour'}</Button>{step < 4 ? <Button onClick={next}>Continuer<ArrowRight data-icon="inline-end" /></Button> : <Button disabled={pending} onClick={submit}>{pending ? 'Ajout en cours…' : 'Ajouter la Source'}</Button>}</div>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value || 'Non renseigné'}</p></div> }
