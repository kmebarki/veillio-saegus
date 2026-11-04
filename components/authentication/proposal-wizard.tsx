'use client'

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { createAuthenticationMethod } from '@/app/actions/authentication-methods'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { AuthFieldDefinition, AuthFieldType, AuthMethodDefinitionV13 } from '@/lib/authentication/types'

const FIELD_TYPES: { value: AuthFieldType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'password', label: 'Mot de passe' },
  { value: 'url', label: 'URL' },
  { value: 'dateTime', label: 'Date et heure' },
  { value: 'enum', label: 'Liste' },
  { value: 'file', label: 'Fichier' },
  { value: 'secretFile', label: 'Fichier secret' },
  { value: 'certificate', label: 'Certificat' },
]

type Family = { id: string; label: string; description: string; variants: { id: string; label: string }[] }
type DraftField = Pick<AuthFieldDefinition, 'code' | 'label' | 'type' | 'required' | 'secret'>

function emptyField(order: number): DraftField {
  return { code: `field_${order}`, label: `Champ ${order}`, type: 'text', required: true, secret: false }
}

function normalizeFields(fields: DraftField[]): AuthFieldDefinition[] {
  return fields.map((field, index) => {
    const secret = field.secret || ['password', 'secretFile', 'certificate'].includes(field.type)
    return {
      ...field,
      code: field.code.trim(),
      label: field.label.trim(),
      secret,
      description: '',
      order: index + 1,
      defaultValue: null,
      validation: {},
      visibility: { operator: 'always' },
      ...(secret ? { storage: { scope: 'connection' as const, mode: 'vaultRef' as const, readBack: false as const } } : {}),
      valueSource: secret ? 'connection.secretRef' : 'connection.config',
      editableInConnection: true,
    }
  })
}

export function AuthenticationMethodForm({ families, onClose }: { families: Family[]; onClose: () => void }) {
  const router = useRouter()
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
    methodId: methodId.trim().toUpperCase(),
    displayName: displayName.trim(),
    description: description.trim(),
    familyId,
    variantId: variantId || null,
    supportedVariantIds: variantId ? [variantId] : [],
    version: '1.0.0',
    schemaRevision: 1,
    lifecycle: { status: 'disponible', reason: 'Référentiel', approvedBy: null, approvedAt: null },
    runtime: { handlerKey: null, handlerVersion: null, deployed: false, securityReviewed: false, contractTestsPassed: false, enabled: false },
    fieldSchema: { schemaVersion: '1.3.0', fields: normalizeFields(fields) },
    transmission: {
      type: transmissionType.trim(),
      protocol: protocol.trim(),
      bindings: [],
      handlerOperation: 'adapter_defined',
      requiresTls,
      resolvedBy: 'verifiedAdapterAndHandler',
      customHeadersAllowed: false,
      policyRef: 'HTTP_TRANSMISSION_POLICY_V1_3',
    },
    composition: { identityModel: false, secondaryFactorsAllowed: [], requiresAdapterDeclaration: true },
    compatibility: { sourceOfTruth: 'connectors.adapterRegistry', serviceIds: [], adapterIds: [] },
  }), [description, displayName, familyId, fields, methodId, protocol, requiresTls, transmissionType, variantId])

  function updateField(index: number, patch: Partial<DraftField>) {
    setFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field))
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= fields.length) return
    setFields((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function submit() {
    setError('')
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(definition.methodId) || !definition.displayName || !familyId) {
      setError('Renseignez un identifiant, un nom et une famille.')
      return
    }
    if (fields.some((field) => !/^[a-z][a-z0-9_]{0,63}$/.test(field.code.trim()) || !field.label.trim())) {
      setError('Chaque champ doit avoir un code valide et un libellé.')
      return
    }
    if (new Set(fields.map((field) => field.code.trim())).size !== fields.length) {
      setError('Les codes de champs doivent être uniques.')
      return
    }

    startTransition(async () => {
      const result = await createAuthenticationMethod(definition)
      if (!result.ok) {
        setError(result.fieldErrors?.definition ?? result.fieldErrors?.methodId ?? result.message)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="method-id">Identifiant</FieldLabel>
            <Input id="method-id" value={methodId} onChange={(event) => setMethodId(event.target.value.toUpperCase())} placeholder="API_KEY" />
          </Field>
          <Field>
            <FieldLabel htmlFor="method-name">Nom</FieldLabel>
            <Input id="method-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Clé API" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Famille</FieldLabel>
            <Select value={familyId} onValueChange={(value) => { setFamilyId(value ?? ''); setVariantId('') }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{families.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Variante</FieldLabel>
            <Select value={variantId || '__none'} onValueChange={(value) => setVariantId(value === '__none' ? '' : (value ?? ''))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="__none">Aucune</SelectItem>{family?.variants.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="method-description">Description</FieldLabel>
          <Textarea id="method-description" value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </FieldGroup>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Champs</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setFields((current) => [...current, emptyField(current.length + 1)])}><Plus data-icon="inline-start" />Ajouter</Button>
        </div>
        {fields.map((field, index) => (
          <Card key={`${index}-${field.code}`}>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-sm">Champ {index + 1}</CardTitle>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => moveField(index, -1)} disabled={index === 0} aria-label="Monter"><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} aria-label="Descendre"><ArrowDown /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))} aria-label="Supprimer"><Trash2 /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field><FieldLabel>Code</FieldLabel><Input value={field.code} onChange={(event) => updateField(index, { code: event.target.value })} /></Field>
                  <Field><FieldLabel>Libellé</FieldLabel><Input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} /></Field>
                  <Field><FieldLabel>Type</FieldLabel><Select value={field.type} onValueChange={(value) => updateField(index, { type: (value ?? 'text') as AuthFieldType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{FIELD_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                </div>
                <div className="flex flex-wrap gap-5">
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={field.required} onCheckedChange={(checked) => updateField(index, { required: checked === true })} />Obligatoire</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={field.secret} onCheckedChange={(checked) => updateField(index, { secret: checked === true })} />Secret</label>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Transmission</h3>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="transmission-type">Type</FieldLabel><Input id="transmission-type" value={transmissionType} onChange={(event) => setTransmissionType(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="protocol">Protocole</FieldLabel><Input id="protocol" value={protocol} onChange={(event) => setProtocol(event.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={requiresTls} onCheckedChange={(checked) => setRequiresTls(checked === true)} />TLS requis</label>
        </FieldGroup>
      </section>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
        <Button type="button" onClick={submit} disabled={pending}>{pending ? 'Enregistrement…' : 'Ajouter la méthode'}</Button>
      </div>
    </div>
  )
}
