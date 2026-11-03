'use client'

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ApiEndpoint, HttpHeaderRule, KeyValue } from '@/lib/connector-catalog'

const SOURCE_OPTIONS: Array<{ value: HttpHeaderRule['source']; label: string }> = [
  { value: 'fixed', label: 'Fixe' },
  { value: 'default', label: 'Défaut modifiable' },
  { value: 'connection', label: 'Paramètre Connexion' },
  { value: 'runtime', label: 'Généré' },
  { value: 'auth', label: 'Authentification' },
]

export function legacyHeadersToRules(headers: KeyValue[]): HttpHeaderRule[] {
  return headers.map((header, index) => ({
    id: `legacy-header-${index}`,
    name: header.name,
    source: 'fixed',
    value: header.value,
    scope: 'global',
    endpointId: '',
    required: false,
    sensitive: false,
  }))
}

export function headerRulesToStaticHeaders(rules: HttpHeaderRule[], activeEndpointId = ''): KeyValue[] {
  return rules
    .filter((rule) => (rule.source === 'fixed' || rule.source === 'default') && (rule.scope === 'global' || rule.endpointId === activeEndpointId) && rule.name && rule.value)
    .map((rule) => ({ name: rule.name, value: rule.value }))
}

export function HttpHeaderPolicyEditor({ rules, endpoints = [], disabled, onChange }: { rules: HttpHeaderRule[]; endpoints?: ApiEndpoint[]; disabled?: boolean; onChange: (rules: HttpHeaderRule[]) => void }) {
  function addRule() {
    onChange([...rules, { id: crypto.randomUUID(), name: '', source: 'default', value: '', scope: 'global', endpointId: '', required: false, sensitive: false }])
  }

  function updateRule(id: string, patch: Partial<HttpHeaderRule>) {
    onChange(rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule))
  }

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="sr-only">En-têtes HTTP</legend>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <span>
          <span className="block text-sm font-medium">En-têtes HTTP</span>
          <span className="block text-xs leading-5 text-muted-foreground">Globaux ou liés à un endpoint. Authorization est réservé au référentiel d&apos;authentification.</span>
        </span>
        <Button type="button" variant="outline" size="sm" disabled={rules.length >= 30} onClick={addRule}><Plus data-icon="inline-start" />Ajouter une règle</Button>
      </div>

      {rules.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Aucune règle personnalisée. Les en-têtes système restent gérés par l&apos;adaptateur.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((rule, index) => (
            <div key={rule.id} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_170px_150px_auto]">
              <Input aria-label={`Nom de l’en-tête ${index + 1}`} maxLength={64} value={rule.name} onChange={(event) => updateRule(rule.id, { name: event.target.value })} placeholder="X-Client-Version" className="font-mono" />
              <Input aria-label={`Valeur de l’en-tête ${index + 1}`} maxLength={500} value={rule.value} onChange={(event) => updateRule(rule.id, { value: event.target.value })} placeholder="Valeur ou paramètre" className="font-mono" />
              <select aria-label={`Source de l’en-tête ${index + 1}`} value={rule.source} onChange={(event) => updateRule(rule.id, { source: event.target.value as HttpHeaderRule['source'] })} className="h-9 rounded-lg border bg-background px-2 text-sm">
                {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select aria-label={`Portée de l’en-tête ${index + 1}`} value={rule.scope} onChange={(event) => updateRule(rule.id, { scope: event.target.value as HttpHeaderRule['scope'], endpointId: event.target.value === 'global' ? '' : rule.endpointId })} className="h-9 rounded-lg border bg-background px-2 text-sm">
                <option value="global">Global</option>
                <option value="endpoint">Par endpoint</option>
              </select>
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(rules.filter((item) => item.id !== rule.id))} aria-label={`Supprimer la règle ${index + 1}`}><Trash2 /></Button>
              {rule.scope === 'endpoint' && (endpoints.length > 0 ? (
                <select aria-label={`Endpoint de l’en-tête ${index + 1}`} value={rule.endpointId} onChange={(event) => updateRule(rule.id, { endpointId: event.target.value })} className="h-9 rounded-lg border bg-background px-2 font-mono text-sm md:col-span-4">
                  <option value="">Sélectionner un endpoint</option>
                  {endpoints.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.method} · {endpoint.label}</option>)}
                </select>
              ) : (
                <Input aria-label={`Endpoint de l’en-tête ${index + 1}`} maxLength={160} value={rule.endpointId} onChange={(event) => updateRule(rule.id, { endpointId: event.target.value })} placeholder="GET /articles" className="font-mono md:col-span-4" />
              ))}
            </div>
          ))}
        </div>
      )}
    </fieldset>
  )
}
