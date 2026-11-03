'use client'

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { proposeAuthenticationMethod } from '@/app/actions/authentication-methods'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { AuthFieldDefinition, AuthFieldType, AuthMethodDefinitionV13 } from '@/lib/authentication/types'
import { cn } from '@/lib/utils'

const STEPS = ['Identification', 'Schéma des champs', 'Transmission', 'Vérification'] as const
const FIELD_TYPES: { value: AuthFieldType; label: string }[] = [{ value: 'text', label: 'Texte' }, { value: 'password', label: 'Mot de passe' }, { value: 'url', label: 'URL' }, { value: 'dateTime', label: 'Date et heure' }, { value: 'enum', label: 'Liste de choix' }, { value: 'file', label: 'Fichier' }, { value: 'secretFile', label: 'Fichier secret' }, { value: 'certificate', label: 'Certificat' }]

type Family = { id: string; label: string; description: string; variants: { id: string; label: string }[] }
type DraftField = AuthFieldDefinition & { adapterManaged: boolean }

function emptyField(order: number): DraftField {
  return { code: `field_${order}`, label: `Champ ${order}`, type: 'text', required: true, secret: false, description: '', order, defaultValue: null, validation: {}, visibility: { operator: 'always' }, valueSource: 'connection.config', editableInConnection: true, adapterManaged: false }
}

function normalizeFields(fields: DraftField[]): AuthFieldDefinition[] {
  return fields.map((field, index) => {
    const secret = field.secret || ['password', 'secretFile', 'certificate'].includes(field.type)
    const adapterManaged = !secret && field.adapterManaged
    return { code: field.code.trim(), label: field.label.trim(), type: field.type, required: field.required, secret, description: field.description.trim(), order: index + 1, defaultValue: secret ? null : field.defaultValue, validation: field.validation, visibility: field.visibility, ...(secret ? { storage: { scope: 'connection' as const, mode: 'vaultRef' as const, readBack: false as const } } : {}), valueSource: secret ? 'connection.secretRef' : adapterManaged ? 'adapter.nonSecretConfig' : 'connection.config', editableInConnection: !adapterManaged }
  })
}

export function AuthenticationProposalWizard({ families, onClose }: { families: Family[]; onClose: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [methodId, setMethodId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [familyId, setFamilyId] = useState(families[0]?.id ?? '')
  const [variantId, setVariantId] = useState('')
  const [fields, setFields] = useState<DraftField[]>([])
  const [transmissionType, setTransmissionType] = useState('adapter_managed')
  const [protocol, setProtocol] = useState('https')
  const [requiresTls, setRequiresTls] = useState(true)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const family = families.find((item) => item.id === familyId)

  const definition = useMemo<AuthMethodDefinitionV13>(() => ({
    methodId: methodId.trim().toUpperCase(), displayName: displayName.trim(), description: description.trim(), familyId, variantId: variantId || null, supportedVariantIds: variantId ? [variantId] : [], version: '1.0.0', schemaRevision: 1,
    lifecycle: { status: 'brouillon', reason: 'Proposition en cours de rédaction', approvedBy: null, approvedAt: null },
    runtime: { handlerKey: null, handlerVersion: null, deployed: false, securityReviewed: false, contractTestsPassed: false, enabled: false },
    fieldSchema: { schemaVersion: '1.3.0', fields: normalizeFields(fields) },
    transmission: { type: transmissionType, protocol, bindings: [], handlerOperation: 'adapter_defined', requiresTls, resolvedBy: 'verifiedAdapterAndHandler', customHeadersAllowed: false, policyRef: 'HTTP_TRANSMISSION_POLICY_V1_3' },
    composition: { identityModel: false, secondaryFactorsAllowed: [], requiresAdapterDeclaration: true },
    compatibility: { sourceOfTruth: 'connectors.adapterRegistry', serviceIds: [], adapterIds: [] },
  }), [description, displayName, familyId, fields, methodId, protocol, requiresTls, transmissionType, variantId])

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= fields.length) return
    setFields((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next })
  }

  function updateField(index: number, patch: Partial<DraftField>) {
    setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field))
  }

  function next() {
    setError('')
    if (step === 0 && (!/^[A-Z][A-Z0-9_]{1,63}$/.test(methodId.trim().toUpperCase()) || !displayName.trim() || !familyId)) return setError('Renseignez un identifiant technique valide, un nom et une famille.')
    if (step === 1 && fields.some((field) => !/^[a-z][a-z0-9_]{0,63}$/.test(field.code.trim()) || !field.label.trim())) return setError('Chaque champ doit avoir un code snake_case unique et un libellé.')
    if (step === 1 && new Set(fields.map((field) => field.code.trim())).size !== fields.length) return setError('Les codes de champs doivent être uniques.')
    setStep((current) => Math.min(STEPS.length - 1, current + 1))
  }

  function submit() {
    setError('')
    startTransition(async () => {
      const result = await proposeAuthenticationMethod(definition)
      if (!result.ok) return setError(result.fieldErrors?.contract ?? result.message)
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid gap-2 sm:grid-cols-4" aria-label="Étapes de la proposition">{STEPS.map((label, index) => <li key={label} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium', index === step && 'border-primary bg-primary/5 text-primary', index < step && 'bg-muted')}><span className={cn('grid size-6 place-items-center rounded-full border', index < step && 'border-primary bg-primary text-primary-foreground')}>{index < step ? <Check /> : index + 1}</span>{label}</li>)}</ol>
      {error && <Alert variant="destructive"><TriangleAlert /><AlertTitle>Impossible de continuer</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      {step === 0 && <FieldGroup><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="method-id">Identifiant technique</FieldLabel><Input id="method-id" value={methodId} onChange={(event) => setMethodId(event.target.value.toUpperCase())} placeholder="EXEMPLE_AUTH" /><FieldDescription>Stable, en majuscules, sans secret.</FieldDescription></Field><Field><FieldLabel htmlFor="method-name">Nom affiché</FieldLabel><Input id="method-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Authentification Exemple" /></Field></div><Field><FieldLabel htmlFor="method-description">Description</FieldLabel><Textarea id="method-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Finalité et contraintes de la méthode…" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>Famille</FieldLabel><Select value={familyId} onValueChange={(value) => { setFamilyId(value ?? ''); setVariantId('') }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{families.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>Variante</FieldLabel><Select value={variantId || '__none'} onValueChange={(value) => setVariantId(value === '__none' ? '' : (value ?? ''))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none">Aucune</SelectItem>{family?.variants.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></div></FieldGroup>}

      {step === 1 && <div className="flex flex-col gap-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="font-semibold">Champs de la Connexion</h3><p className="text-sm text-muted-foreground">La provenance et l’éditabilité sont recalculées côté serveur.</p></div><Button type="button" variant="outline" onClick={() => setFields((current) => [...current, emptyField(current.length + 1)])}><Plus data-icon="inline-start" />Ajouter un champ</Button></div>{fields.length ? fields.map((field, index) => <Card key={`${index}-${field.code}`}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Champ {index + 1}</CardTitle><CardDescription>{field.secret ? 'Secret vers le coffre, sans relecture' : field.adapterManaged ? 'Paramètre imposé par l’adaptateur' : 'Configuration de la Connexion'}</CardDescription></div><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" onClick={() => moveField(index, -1)} disabled={index === 0} aria-label="Monter"><ArrowUp /></Button><Button type="button" variant="ghost" size="icon" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} aria-label="Descendre"><ArrowDown /></Button><Button type="button" variant="ghost" size="icon" onClick={() => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))} aria-label="Supprimer"><Trash2 /></Button></div></div></CardHeader><CardContent><FieldGroup><div className="grid gap-3 sm:grid-cols-3"><Field><FieldLabel>Code</FieldLabel><Input value={field.code} onChange={(event) => updateField(index, { code: event.target.value })} /></Field><Field><FieldLabel>Libellé</FieldLabel><Input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} /></Field><Field><FieldLabel>Type</FieldLabel><Select value={field.type} onValueChange={(value) => updateField(index, { type: (value ?? 'text') as AuthFieldType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{FIELD_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></div><Field><FieldLabel>Description</FieldLabel><Input value={field.description} onChange={(event) => updateField(index, { description: event.target.value })} /></Field><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><Checkbox checked={field.required} onCheckedChange={(checked) => updateField(index, { required: checked === true })} />Requis</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={field.secret} onCheckedChange={(checked) => updateField(index, { secret: checked === true, adapterManaged: false })} />Secret</label><label className="flex items-center gap-2 text-sm"><Checkbox checked={field.adapterManaged} disabled={field.secret} onCheckedChange={(checked) => updateField(index, { adapterManaged: checked === true })} />Géré par l’adaptateur</label></div></FieldGroup></CardContent></Card>) : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Aucun champ. Cette méthode ne demandera aucune valeur dans Connexions.</CardContent></Card>}</div>}

      {step === 2 && <FieldGroup><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="transmission-type">Type de transmission</FieldLabel><Input id="transmission-type" value={transmissionType} onChange={(event) => setTransmissionType(event.target.value)} /></Field><Field><FieldLabel htmlFor="protocol">Protocole</FieldLabel><Input id="protocol" value={protocol} onChange={(event) => setProtocol(event.target.value)} /></Field></div><label className="flex items-center gap-3 rounded-xl border p-4 text-sm"><Checkbox checked={requiresTls} onCheckedChange={(checked) => setRequiresTls(checked === true)} /><span><strong className="block">Exiger TLS</strong><span className="text-muted-foreground">Obligatoire dès qu’un secret est transmis.</span></span></label><Alert><AlertTitle>Transmission autoritaire côté serveur</AlertTitle><AlertDescription>Les bindings, en-têtes et formats sont résolus par un adaptateur et un handler vérifiés. Le client ne peut pas les modifier.</AlertDescription></Alert></FieldGroup>}

      {step === 3 && <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>{definition.displayName}</CardTitle><CardDescription>{definition.methodId} · v{definition.version}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3 text-sm"><p><span className="text-muted-foreground">Famille :</span> {family?.label}</p><p><span className="text-muted-foreground">Variante :</span> {family?.variants.find((item) => item.id === variantId)?.label ?? 'Aucune'}</p><p><span className="text-muted-foreground">Champs :</span> {definition.fieldSchema.fields.length}</p><p><span className="text-muted-foreground">Secrets :</span> {definition.fieldSchema.fields.filter((field) => field.secret).length}</p><p><span className="text-muted-foreground">Transmission :</span> {definition.transmission.type} · {definition.transmission.protocol}</p></CardContent></Card><Alert><Badge variant="outline">Brouillon</Badge><AlertTitle>Pas de publication directe</AlertTitle><AlertDescription>Après enregistrement, une autre personne devra réviser la proposition. La disponibilité restera bloquée tant que toutes les preuves runtime ne seront pas présentes.</AlertDescription></Alert></div>}

      <div className="flex justify-between gap-3 border-t pt-4"><Button type="button" variant="ghost" onClick={step === 0 ? onClose : () => setStep((current) => current - 1)}><ArrowLeft data-icon="inline-start" />{step === 0 ? 'Annuler' : 'Retour'}</Button>{step < STEPS.length - 1 ? <Button type="button" onClick={next}>Continuer<ArrowRight data-icon="inline-end" /></Button> : <Button type="button" onClick={submit} disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer le brouillon'}</Button>}</div>
    </div>
  )
}
