import type { ApiEndpoint, ApiOperationQualification, ConnectorConfig, OperationAvailability } from '@/lib/connector-catalog'

export type TechnicalOperationEvidence = {
  operationId: string
  contractRevision: number
  adapterId: string
  adapterVersion: string
  sideEffectFree: boolean
  retrieval: 'available'
  processing: Extract<OperationAvailability, 'available' | 'unsupported'>
}

function withoutAttestation(endpoint: ApiEndpoint) {
  const { availability: _availability, qualification: _qualification, readSafety: _readSafety, output, capabilities, revision: _revision, ...contract } = endpoint
  return {
    ...contract,
    output: { ...output, retrieval: 'to_verify', processing: output.processing === 'unsupported' ? 'unsupported' : 'to_verify' },
    capabilities: {
      ...capabilities,
      download: capabilities.download === 'unsupported' ? 'unsupported' : 'to_verify',
      incremental: capabilities.incremental === 'unsupported' ? 'unsupported' : 'to_verify',
    },
  }
}

function sameContract(left: ApiEndpoint, right: ApiEndpoint) {
  return JSON.stringify(withoutAttestation(left)) === JSON.stringify(withoutAttestation(right))
}

function resetEndpointAttestation(endpoint: ApiEndpoint, revision: number): ApiEndpoint {
  return {
    ...endpoint,
    availability: endpoint.availability === 'unsupported' ? 'unsupported' : 'to_verify',
    readSafety: endpoint.method === 'GET' ? 'verified_read' : 'to_verify',
    revision,
    qualification: undefined,
    output: {
      ...endpoint.output,
      retrieval: endpoint.output.retrieval === 'unsupported' ? 'unsupported' : 'to_verify',
      processing: endpoint.output.processing === 'unsupported' ? 'unsupported' : 'to_verify',
    },
    capabilities: {
      ...endpoint.capabilities,
      download: endpoint.capabilities.download === 'unsupported' ? 'unsupported' : 'to_verify',
      incremental: endpoint.capabilities.incremental === 'unsupported' ? 'unsupported' : 'to_verify',
    },
  }
}

export function sanitizeClientOperationAttestations(incoming: ConnectorConfig, trusted?: ConnectorConfig): ConnectorConfig {
  const trustedById = new Map((trusted?.api.endpoints ?? []).map((endpoint) => [endpoint.id, endpoint]))
  const endpoints = incoming.api.endpoints.map((endpoint) => {
    const previous = trustedById.get(endpoint.id)
    if (previous && sameContract(previous, endpoint)) {
      return {
        ...endpoint,
        availability: previous.availability,
        readSafety: previous.readSafety,
        revision: previous.revision,
        qualification: previous.qualification,
        output: { ...endpoint.output, retrieval: previous.output.retrieval, processing: previous.output.processing },
        capabilities: { ...endpoint.capabilities, download: previous.capabilities.download, incremental: previous.capabilities.incremental },
      }
    }
    return resetEndpointAttestation(endpoint, previous ? previous.revision + 1 : 1)
  })
  return { ...incoming, api: { ...incoming.api, endpoints } }
}

export function applyTechnicalOperationQualification(config: ConnectorConfig, evidence: TechnicalOperationEvidence, qualifiedAt = new Date()): ConnectorConfig {
  const endpoint = config.api.endpoints.find((candidate) => candidate.id === evidence.operationId)
  if (!endpoint) throw new Error('Operation not found')
  if (!evidence.adapterId.trim() || !evidence.adapterVersion.trim()) throw new Error('Adapter identity is required')
  if (endpoint.revision !== evidence.contractRevision) throw new Error('Contract revision mismatch')
  if (endpoint.method === 'POST' && !evidence.sideEffectFree) throw new Error('POST operation is not attested as side-effect free')

  const qualification: ApiOperationQualification = {
    adapterId: evidence.adapterId,
    adapterVersion: evidence.adapterVersion,
    contractRevision: evidence.contractRevision,
    qualifiedAt: qualifiedAt.toISOString(),
    source: 'adapter-contract-suite',
  }

  return {
    ...config,
    api: {
      ...config.api,
      endpoints: config.api.endpoints.map((candidate) => candidate.id === evidence.operationId
        ? {
            ...candidate,
            availability: 'available',
            readSafety: candidate.method === 'GET' || evidence.sideEffectFree ? 'verified_read' : candidate.readSafety,
            qualification,
            output: { ...candidate.output, retrieval: evidence.retrieval, processing: evidence.processing },
          }
        : candidate),
    },
  }
}

export function operationIsUsableByAdapter(endpoint: Pick<ApiEndpoint, 'availability' | 'qualification' | 'revision'>, adapter: { id: string; version: string }) {
  return endpoint.availability === 'available'
    && endpoint.qualification?.adapterId === adapter.id
    && endpoint.qualification.adapterVersion === adapter.version
    && endpoint.qualification.contractRevision === endpoint.revision
}
