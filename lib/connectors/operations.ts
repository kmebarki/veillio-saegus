import type { ApiEndpoint, ApiInputParameter, ApiOperationOutput, ConnectorConfig, OperationAvailability } from '@/lib/connector-catalog'

export type ConnectorOperationContract = {
  id: string
  label: string
  summary: string
  method: 'GET' | 'POST'
  pathTemplate: string
  inputParameters: ApiInputParameter[]
  output: ApiOperationOutput
  pagination: ConnectorConfig['api']['pagination']['type']
  availability: OperationAvailability
  restrictions: string[]
  revision: number
}

const UNKNOWN_OUTPUT: ApiOperationOutput = {
  mediaTypes: [],
  contentKinds: ['unknown'],
  shapeKnown: false,
  retrieval: 'to_verify',
  processing: 'to_verify',
}

export function normalizeOperation(endpoint: ApiEndpoint): ConnectorOperationContract {
  const output = endpoint.output ?? UNKNOWN_OUTPUT
  const restrictions: string[] = []
  const readSafety = endpoint.readSafety ?? (endpoint.method === 'GET' ? 'verified_read' : 'to_verify')
  if (endpoint.method === 'POST' && readSafety !== 'verified_read') restrictions.push('Lecture sans effet de bord non attestée : test automatique bloqué.')
  if (output.processing === 'unsupported') restrictions.push('Récupération décrite, mais traitement du contenu non pris en charge par cet adaptateur.')
  if ((endpoint.inputParameters ?? []).some((parameter) => parameter.in === 'path' && parameter.required === true && parameter.example == null)) {
    restrictions.push('Une valeur de test manque pour au moins un paramètre de chemin obligatoire.')
  }

  return {
    id: endpoint.id,
    label: endpoint.label,
    summary: endpoint.summary,
    method: endpoint.method,
    pathTemplate: endpoint.pathTemplate || safePathname(endpoint.url),
    inputParameters: endpoint.inputParameters ?? [],
    output,
    pagination: endpoint.capabilities?.pagination ?? endpoint.pagination.type,
    availability: endpoint.availability ?? 'to_verify',
    restrictions,
    revision: endpoint.revision ?? 1,
  }
}

export function operationsFromConfig(config: ConnectorConfig): ConnectorOperationContract[] {
  return config.api.endpoints.map(normalizeOperation)
}

export function operationTestRestriction(config: ConnectorConfig): string | null {
  const operation = config.api.endpoints.find((endpoint) => endpoint.id === config.api.activeEndpointId)
  if (operation) {
    const missingPathValue = operation.inputParameters.some((parameter) => parameter.in === 'path' && parameter.required === true && parameter.example == null)
    if (missingPathValue) return 'Une valeur de test explicite manque pour un paramètre de chemin obligatoire. Aucun appel réseau n’a été effectué.'
    if (operation.availability === 'unsupported') return 'Cette opération n’est pas prise en charge par la version actuelle de l’adaptateur. Aucun appel réseau n’a été effectué.'
    if (operation.output.processing === 'unsupported') return 'Le format déclaré peut être récupérable, mais son traitement n’est pas pris en charge par ce banc d’essai. Aucun appel réseau n’a été effectué.'
  }
  if (config.api.method === 'POST' && (!operation || operation.readSafety !== 'verified_read')) {
    return 'Ce POST n’est pas attesté comme une opération de lecture sans effet de bord. Aucun appel réseau n’a été effectué.'
  }
  return null
}

function safePathname(url: string) {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}
