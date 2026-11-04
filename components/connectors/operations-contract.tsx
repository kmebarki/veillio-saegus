import { Badge } from '@/components/ui/badge'
import type { ConnectorOperationContract } from '@/lib/connectors/operations'

const AVAILABILITY_LABELS = {
  to_verify: 'À vérifier',
  available: 'Disponible',
  unsupported: 'Non pris en charge',
} as const

const KIND_LABELS = {
  article: 'Articles',
  structured_data: 'Données structurées',
  text: 'Texte',
  document: 'Documents',
  image: 'Images',
  audio: 'Audio',
  video: 'Vidéos',
  message: 'Messages',
  unknown: 'Format inconnu',
} as const

function OutputSummary({ operation }: { operation: ConnectorOperationContract }) {
  const kinds = operation.output.contentKinds.map((kind) => KIND_LABELS[kind]).join(' · ')
  const media = operation.output.mediaTypes.map((type) => type.replace('application/', '').replace('image/', '')).join(', ')
  return <>{kinds}{media ? ` · ${media}` : ''}</>
}

export function OperationsContract({ operations }: { operations: ConnectorOperationContract[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b p-5">
        <h2 className="font-semibold">Opérations disponibles</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Capacités déclarées par le contrat. Un accès réel avec une Connexion est vérifié séparément.</p>
      </div>
      {operations.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">Aucune opération API n’est enregistrée pour ce Connecteur.</p>
      ) : (
        <div className="divide-y">
          {operations.map((operation) => {
            const required = operation.inputParameters.filter((parameter) => parameter.required === true)
            const optional = operation.inputParameters.filter((parameter) => parameter.required === false)
            const unknown = operation.inputParameters.filter((parameter) => parameter.required === null)
            return (
              <details key={operation.id} className="group">
                <summary className="flex cursor-pointer list-none flex-col gap-2 p-4 hover:bg-muted/40 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{operation.label}</span>
                    <span className="block truncate text-xs text-muted-foreground"><OutputSummary operation={operation} /></span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{operation.method}</Badge>
                    <Badge variant={operation.availability === 'available' ? 'default' : 'secondary'}>{AVAILABILITY_LABELS[operation.availability]}</Badge>
                  </span>
                </summary>
                <div className="flex flex-col gap-4 border-t bg-muted/20 p-4 text-sm">
                  {operation.summary && <p className="leading-6 text-muted-foreground">{operation.summary}</p>}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paramètres</h3>
                      {operation.inputParameters.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Aucun paramètre documenté.</p> : <ul className="mt-2 flex flex-col gap-2">{operation.inputParameters.map((parameter) => <li key={`${parameter.in}:${parameter.name}`} className="rounded-xl border bg-card p-3"><div className="flex flex-wrap items-center gap-2"><code className="font-mono text-xs font-semibold">{parameter.name}</code><Badge variant="outline">{parameter.type}</Badge><span className="text-xs text-muted-foreground">{parameter.required === true ? 'Obligatoire' : parameter.required === false ? 'Facultatif' : 'Obligation inconnue'}</span></div>{parameter.description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{parameter.description}</p>}{parameter.enum.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Valeurs admises : {parameter.enum.join(', ')}</p>}</li>)}</ul>}
                    </div>
                    <div className="flex flex-col gap-3">
                      <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Réponses déclarées</h3><p className="mt-2 text-sm">{operation.output.mediaTypes.length ? operation.output.mediaTypes.join(', ') : 'Type non documenté'}</p><p className="mt-1 text-xs text-muted-foreground">Récupération : {AVAILABILITY_LABELS[operation.output.retrieval]} · Traitement : {AVAILABILITY_LABELS[operation.output.processing]}</p></div>
                      <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informations techniques</h3><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{operation.method} {operation.pathTemplate}</p><p className="mt-1 text-xs text-muted-foreground">Révision {operation.revision} · {required.length} obligatoire(s) · {optional.length} facultatif(s){unknown.length ? ` · ${unknown.length} non qualifié(s)` : ''}</p></div>
                    </div>
                  </div>
                  {operation.restrictions.length > 0 && <ul className="flex flex-col gap-1 text-xs leading-5 text-muted-foreground">{operation.restrictions.map((restriction) => <li key={restriction}>{restriction}</li>)}</ul>}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </section>
  )
}
