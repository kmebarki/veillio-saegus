import { MAX_API_ENDPOINTS, type ApiEndpoint, type ConnectorConfig } from '@/lib/connector-catalog'

type EditableEndpointFields = Pick<ApiEndpoint, 'url' | 'method' | 'query' | 'body' | 'itemsPath' | 'titlePath' | 'linkPath' | 'datePath' | 'summaryPath' | 'pagination'>

export function readEndpointFields(config: ConnectorConfig): EditableEndpointFields {
  const { api } = config
  return {
    url: config.url,
    method: api.method,
    query: api.query,
    body: api.body,
    itemsPath: api.itemsPath,
    titlePath: api.titlePath,
    linkPath: api.linkPath,
    datePath: api.datePath,
    summaryPath: api.summaryPath,
    pagination: api.pagination,
  }
}

function sameFields(endpoint: ApiEndpoint, fields: EditableEndpointFields) {
  return JSON.stringify(readComparable(endpoint)) === JSON.stringify(readComparable(fields))
}

function readComparable(fields: EditableEndpointFields) {
  return {
    url: fields.url,
    method: fields.method,
    query: fields.query,
    body: fields.body,
    itemsPath: fields.itemsPath,
    titlePath: fields.titlePath,
    linkPath: fields.linkPath,
    datePath: fields.datePath,
    summaryPath: fields.summaryPath,
    pagination: fields.pagination,
  }
}

function mergeImportedEndpoint(existing: ApiEndpoint | undefined, incoming: ApiEndpoint): ApiEndpoint {
  if (!existing) return incoming
  const unchanged = JSON.stringify({ ...existing, revision: 1, availability: 'to_verify' }) === JSON.stringify({ ...incoming, revision: 1, availability: 'to_verify' })
  return unchanged
    ? { ...incoming, revision: existing.revision, availability: existing.availability }
    : { ...incoming, revision: existing.revision + 1, availability: 'to_verify' }
}

export function loadEndpoint(config: ConnectorConfig, endpoint: ApiEndpoint): ConnectorConfig {
  return {
    ...config,
    url: endpoint.url,
    api: {
      ...config.api,
      method: endpoint.method,
      query: endpoint.query,
      body: endpoint.body,
      itemsPath: endpoint.itemsPath,
      titlePath: endpoint.titlePath,
      linkPath: endpoint.linkPath,
      datePath: endpoint.datePath,
      summaryPath: endpoint.summaryPath,
      pagination: endpoint.pagination,
      activeEndpointId: endpoint.id,
    },
  }
}

// Reports edits made on the active endpoint back to its entry, so switching never loses work.
export function commitActiveEndpoint(config: ConnectorConfig): ConnectorConfig {
  const { activeEndpointId, endpoints } = config.api
  if (!activeEndpointId || !endpoints.some((endpoint) => endpoint.id === activeEndpointId)) return config
  const fields = readEndpointFields(config)
  return {
    ...config,
    api: {
      ...config.api,
      endpoints: endpoints.map((endpoint) => endpoint.id !== activeEndpointId || sameFields(endpoint, fields)
        ? endpoint
        : { ...endpoint, ...fields, revision: endpoint.revision + 1, availability: 'to_verify' }),
    },
  }
}

export function switchEndpoint(config: ConnectorConfig, id: string): ConnectorConfig {
  const committed = commitActiveEndpoint(config)
  const target = committed.api.endpoints.find((endpoint) => endpoint.id === id)
  return target ? loadEndpoint(committed, target) : committed
}

export function removeEndpoint(config: ConnectorConfig, id: string): ConnectorConfig {
  const committed = commitActiveEndpoint(config)
  const endpoints = committed.api.endpoints.filter((endpoint) => endpoint.id !== id)
  return { ...committed, api: { ...committed.api, endpoints, activeEndpointId: committed.api.activeEndpointId === id ? '' : committed.api.activeEndpointId } }
}

export function addEndpoints(config: ConnectorConfig, incoming: ApiEndpoint[], activateId: string | null): ConnectorConfig {
  const committed = commitActiveEndpoint(config)
  const existingById = new Map(committed.api.endpoints.map((endpoint) => [endpoint.id, endpoint]))
  const incomingIds = new Set(incoming.map((endpoint) => endpoint.id))
  const kept = committed.api.endpoints.filter((endpoint) => !incomingIds.has(endpoint.id))
  const merged = incoming.map((endpoint) => mergeImportedEndpoint(existingById.get(endpoint.id), endpoint))
  const endpoints = [...kept, ...merged].slice(0, MAX_API_ENDPOINTS)
  const next: ConnectorConfig = { ...committed, api: { ...committed.api, endpoints } }
  const target = activateId ? endpoints.find((endpoint) => endpoint.id === activateId) : undefined
  return target ? loadEndpoint(next, target) : next
}
