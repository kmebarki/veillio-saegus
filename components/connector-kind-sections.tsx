'use client'

import { Check, Copy, Info } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Field, NumberField, Section, monoField } from '@/components/connector-form-primitives'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/modal'
import {
  IMAP_SECURITY,
  M365_CLOUDS,
  M365_CLOUD_INFO,
  M365_SOURCES,
  M365_SOURCE_LABELS,
  type ConnectorConfig,
  type ImapConfig,
  type M365Config,
  type WebhookConfig,
} from '@/lib/connector-catalog'
import { cn } from '@/lib/utils'

type SectionProps<T> = { value: T; onChange: (patch: Partial<T>) => void }

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border bg-muted/40 px-3 py-2.5 text-[13px] leading-5 text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function ImapSections({ value, onChange }: SectionProps<ImapConfig>) {
  return (
    <>
      <Section title="Serveur de messagerie" description="Connexion IMAP en lecture seule : aucun message n’est modifié, déplacé ni supprimé.">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Serveur IMAP" hint="Nom de domaine complet. Les adresses IP et noms internes sont refusés.">
            <input required spellCheck={false} autoCapitalize="none" maxLength={253} value={value.host} onChange={(event) => onChange({ host: event.target.value })} className={monoField} placeholder="imap.exemple.fr" />
          </Field>
          <Field label="Sécurité">
            <select
              value={value.security}
              onChange={(event) => {
                const security = event.target.value as ImapConfig['security']
                onChange({ security, port: security === 'tls' ? 993 : 143 })
              }}
              className={fieldClass}
            >
              {IMAP_SECURITY.map((mode) => <option key={mode} value={mode}>{mode === 'tls' ? 'TLS (port 993)' : 'STARTTLS (port 143)'}</option>)}
            </select>
          </Field>
        </div>
        <Callout>
          L’adresse de la boîte et le mot de passe d’application se configurent dans <span className="font-medium text-foreground">Connexions</span>. Pour Gmail ou Microsoft, utilisez un mot de passe d’application, pas le mot de passe du compte.
        </Callout>
      </Section>

      <Section title="Messages à collecter" description="Chaque message correspondant devient un contenu de veille.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dossier" hint="Ex. INBOX, Veille, Newsletters/IA.">
            <input required maxLength={200} value={value.folder} onChange={(event) => onChange({ folder: event.target.value })} className={fieldClass} />
          </Field>
          <NumberField label="Fenêtre de lecture" hint="Messages reçus durant les N derniers jours." value={value.sinceDays} min={1} max={365} suffix="jours" onChange={(sinceDays) => onChange({ sinceDays })} />
          <Field label="Expéditeur contient (facultatif)">
            <input maxLength={200} value={value.fromFilter} onChange={(event) => onChange({ fromFilter: event.target.value })} className={fieldClass} placeholder="newsletter@editeur.com" />
          </Field>
          <Field label="Objet contient (facultatif)">
            <input maxLength={200} value={value.subjectFilter} onChange={(event) => onChange({ subjectFilter: event.target.value })} className={fieldClass} placeholder="Veille hebdo" />
          </Field>
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={value.unreadOnly} onChange={(event) => onChange({ unreadOnly: event.target.checked })} className="mt-1 size-4 rounded border accent-primary" />
          <span>
            <span className="font-medium">Messages non lus uniquement</span>
            <span className="block text-xs leading-5 text-muted-foreground">La collecte ne marque jamais un message comme lu.</span>
          </span>
        </label>
        <Field label="Lien du contenu" hint="Détermine l’adresse associée à chaque message.">
          <select value={value.linkMode} onChange={(event) => onChange({ linkMode: event.target.value as ImapConfig['linkMode'] })} className={fieldClass}>
            <option value="first_link">Premier lien du message (articles, newsletters)</option>
            <option value="sender">Adresse de l’expéditeur (mailto)</option>
          </select>
        </Field>
      </Section>
    </>
  )
}

function CopyField({ label, value, placeholder }: { label: string; value: string; placeholder: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input readOnly value={value || placeholder} onFocus={(event) => event.currentTarget.select()} aria-label={label} className={cn(monoField, 'flex-1', !value && 'text-muted-foreground')} />
        <Button type="button" variant="outline" disabled={!value} onClick={copy} aria-label="Copier l’adresse">
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? 'Copié' : 'Copier'}
        </Button>
      </div>
    </div>
  )
}

export function WebhookSections({ value, authType, connectorId, onChange }: SectionProps<WebhookConfig> & { authType: ConnectorConfig['auth']['type']; connectorId?: string }) {
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const endpoint = connectorId && origin ? `${origin}/api/webhooks/${connectorId}` : ''
  const signed = authType === 'webhook_hmac'

  return (
    <>
      <Section title="Adresse de réception" description="À renseigner chez l’expéditeur (outil tiers, automatisation, application interne). Requêtes POST au format JSON.">
        <CopyField label="URL du webhook" value={endpoint} placeholder="Disponible après l’enregistrement du connecteur" />
        <Callout>
          {signed ? (
            <>
              Chaque requête doit porter un en-tête <code className="font-mono text-foreground">{value.signatureHeader || 'X-Veillio-Signature'}</code> contenant le HMAC-SHA256 (hexadécimal ou base64) de{' '}
              {value.timestampHeader ? <code className="font-mono text-foreground">{'{horodatage}.{corps}'}</code> : 'le corps brut'}, calculé avec le secret partagé configuré dans Connexions.
            </>
          ) : (
            <>
              Chaque requête doit porter l’en-tête <code className="font-mono text-foreground">Authorization: Bearer &lt;jeton&gt;</code>, le jeton étant celui configuré dans Connexions.
            </>
          )}
        </Callout>
      </Section>

      {signed && (
        <Section title="Signature" description="Protège contre les requêtes falsifiées et rejouées.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="En-tête de signature"><input spellCheck={false} maxLength={64} value={value.signatureHeader} onChange={(event) => onChange({ signatureHeader: event.target.value })} className={monoField} /></Field>
            <Field label="En-tête d’horodatage" hint="Laissez vide pour signer le corps seul (sans protection contre le rejeu).">
              <input spellCheck={false} maxLength={64} value={value.timestampHeader} onChange={(event) => onChange({ timestampHeader: event.target.value })} className={monoField} />
            </Field>
            <NumberField label="Tolérance d’horloge" hint="Au-delà, la requête est rejetée." value={value.toleranceSec} min={30} max={3600} suffix="s" onChange={(toleranceSec) => onChange({ toleranceSec })} />
          </div>
        </Section>
      )}

      <Section title="Mapping du payload" description="Chemins dans le JSON reçu, en notation pointée : data.items, fields.title, links[0].href.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Liste des éléments" hint="Laissez vide si chaque requête contient un seul contenu." className="sm:col-span-2">
            <input spellCheck={false} maxLength={120} value={value.itemsPath} onChange={(event) => onChange({ itemsPath: event.target.value })} className={monoField} placeholder="data.items" />
          </Field>
          <Field label="Titre"><input required spellCheck={false} maxLength={120} value={value.titlePath} onChange={(event) => onChange({ titlePath: event.target.value })} className={monoField} /></Field>
          <Field label="Lien (facultatif)"><input spellCheck={false} maxLength={120} value={value.linkPath} onChange={(event) => onChange({ linkPath: event.target.value })} className={monoField} /></Field>
          <Field label="Date (facultatif)"><input spellCheck={false} maxLength={120} value={value.datePath} onChange={(event) => onChange({ datePath: event.target.value })} className={monoField} /></Field>
          <Field label="Résumé (facultatif)"><input spellCheck={false} maxLength={120} value={value.summaryPath} onChange={(event) => onChange({ summaryPath: event.target.value })} className={monoField} /></Field>
        </div>
      </Section>

      <Section title="Limites et idempotence" description="Garde-fous appliqués à chaque réception.">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField label="Taille maximale" value={value.maxPayloadKb} min={1} max={1024} suffix="Ko" onChange={(maxPayloadKb) => onChange({ maxPayloadKb })} />
          <NumberField label="Débit maximal" value={value.rateLimitPerMin} min={1} max={6000} suffix="/min" onChange={(rateLimitPerMin) => onChange({ rateLimitPerMin })} />
          <Field label="En-tête d’identifiant" hint="Un événement déjà reçu est ignoré."><input spellCheck={false} maxLength={64} value={value.idHeader} onChange={(event) => onChange({ idHeader: event.target.value })} className={monoField} /></Field>
        </div>
      </Section>
    </>
  )
}

export function M365Sections({ value, onChange }: SectionProps<M365Config>) {
  const isOneDrive = value.source === 'onedrive'
  const suffix = M365_CLOUD_INFO[value.cloud].sharepointSuffix

  return (
    <>
      <Section title="Application Entra ID" description="Accès en lecture seule via une inscription d’application (permissions d’application Microsoft Graph).">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cloud Microsoft" className="sm:col-span-2">
            <select value={value.cloud} onChange={(event) => onChange({ cloud: event.target.value as M365Config['cloud'] })} className={fieldClass}>
              {M365_CLOUDS.map((cloud) => <option key={cloud} value={cloud}>{M365_CLOUD_INFO[cloud].label}</option>)}
            </select>
          </Field>
          <Field label="Tenant" hint="GUID ou domaine (contoso.onmicrosoft.com).">
            <input required spellCheck={false} maxLength={253} value={value.tenantId} onChange={(event) => onChange({ tenantId: event.target.value })} className={monoField} placeholder="contoso.onmicrosoft.com" />
          </Field>
          <Field label="ID d’application (client)" hint="GUID de l’inscription d’application.">
            <input required spellCheck={false} maxLength={64} value={value.clientId} onChange={(event) => onChange({ clientId: event.target.value })} className={monoField} placeholder="00000000-0000-0000-0000-000000000000" />
          </Field>
        </div>
        <Callout>
          Le secret client se configure dans <span className="font-medium text-foreground">Connexions</span>. Permissions Graph recommandées : <code className="font-mono text-foreground">Sites.Selected</code> (SharePoint) ou <code className="font-mono text-foreground">Files.Read.All</code> (OneDrive).
        </Callout>
      </Section>

      <Section title="Source de contenu" description="Quelles données Microsoft 365 alimentent cette veille.">
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Source Microsoft 365">
          {M365_SOURCES.map((source) => {
            const checked = value.source === source
            return (
              <button key={source} type="button" role="radio" aria-checked={checked} onClick={() => onChange({ source })} className={cn('flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors', checked ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60')}>
                <span className="text-[13px] font-semibold">{M365_SOURCE_LABELS[source].label}</span>
                <span className="text-xs leading-4 text-muted-foreground">{M365_SOURCE_LABELS[source].hint}</span>
              </button>
            )
          })}
        </div>

        {isOneDrive ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Utilisateur (UPN)" hint="Propriétaire du OneDrive lu.">
              <input required type="email" spellCheck={false} maxLength={254} value={value.userPrincipal} onChange={(event) => onChange({ userPrincipal: event.target.value })} className={monoField} placeholder="prenom.nom@entreprise.com" />
            </Field>
            <Field label="Dossier (facultatif)" hint="Racine si vide. Ex. Veille/Rapports.">
              <input spellCheck={false} maxLength={400} value={value.folderPath} onChange={(event) => onChange({ folderPath: event.target.value })} className={monoField} />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Site SharePoint" hint={`HTTPS, se terminant par ${suffix}.`} className="sm:col-span-2">
              <input required type="url" spellCheck={false} maxLength={500} value={value.siteUrl} onChange={(event) => onChange({ siteUrl: event.target.value })} className={monoField} placeholder={`https://contoso${suffix}/sites/veille`} />
            </Field>
            {value.source === 'sharepoint_list' ? (
              <Field label="Nom de la liste"><input required maxLength={200} value={value.listName} onChange={(event) => onChange({ listName: event.target.value })} className={fieldClass} placeholder="Actualités sectorielles" /></Field>
            ) : (
              <>
                <Field label="Bibliothèque"><input maxLength={200} value={value.libraryName} onChange={(event) => onChange({ libraryName: event.target.value })} className={fieldClass} placeholder="Documents" /></Field>
                <Field label="Dossier (facultatif)"><input spellCheck={false} maxLength={400} value={value.folderPath} onChange={(event) => onChange({ folderPath: event.target.value })} className={monoField} placeholder="Veille/Rapports" /></Field>
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="Champs et filtres" description="Adaptez la lecture au contenu de la source.">
        <div className="grid gap-4 sm:grid-cols-2">
          {value.source === 'sharepoint_list' && (
            <>
              <Field label="Colonne du titre" hint="Nom interne de la colonne."><input spellCheck={false} maxLength={80} value={value.titleField} onChange={(event) => onChange({ titleField: event.target.value })} className={monoField} /></Field>
              <Field label="Colonne du résumé (facultatif)"><input spellCheck={false} maxLength={80} value={value.summaryField} onChange={(event) => onChange({ summaryField: event.target.value })} className={monoField} /></Field>
              <Field label="Colonne de date (facultatif)" hint="Sinon, la date de modification est utilisée."><input spellCheck={false} maxLength={80} value={value.dateField} onChange={(event) => onChange({ dateField: event.target.value })} className={monoField} /></Field>
            </>
          )}
          {value.source !== 'sharepoint_list' && (
            <Field label="Extensions de fichiers (facultatif)" hint="Séparées par des virgules. Vide = tous les fichiers." className="sm:col-span-2">
              <input spellCheck={false} maxLength={120} value={value.fileExtensions} onChange={(event) => onChange({ fileExtensions: event.target.value })} className={monoField} placeholder="pdf, docx, pptx" />
            </Field>
          )}
        </div>
      </Section>
    </>
  )
}
