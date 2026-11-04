import { describe, expect, it } from 'vitest'

import { configSchema, defaultConfig, type ApiEndpoint } from '../lib/connector-catalog'
import { addEndpoints } from '../lib/connectors/endpoints'
import { operationTestRestriction, operationsFromConfig } from '../lib/connectors/operations'
import { parseOpenApi, toApiEndpoint } from '../lib/connectors/openapi'

const openApi = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Projects API', version: '1.2.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/projects/{projectId}/documents': {
      get: {
        operationId: 'listProjectDocuments',
        summary: 'Lister les documents',
        parameters: [
          { name: 'projectId', in: 'path', required: true, description: 'Projet cible', schema: { type: 'string', example: 'demo-project' } },
          { name: 'status', in: 'query', required: false, description: 'État du document', schema: { type: 'string', enum: ['draft', 'published'] } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 25, maximum: 100 } },
        ],
        responses: {
          200: {
            description: 'PDF exporté',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
          },
        },
      },
    },
    '/search': {
      post: {
        operationId: 'searchDocuments',
        summary: 'Rechercher des documents',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: { type: 'string', description: 'Expression recherchée' },
                  language: { type: 'string', enum: ['fr', 'en'], description: 'Langue' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Résultats', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string', format: 'uri' } } } } } } } },
      },
    },
  },
})

function endpoint(overrides: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return {
    id: 'list-items', label: 'Lister', summary: '', url: 'https://api.example.com/items', method: 'GET', query: [], body: '', itemsPath: 'items', titlePath: 'title', linkPath: 'url', datePath: '', summaryPath: '',
    pagination: { type: 'none', param: 'page', sizeParam: 'limit', pageSize: 50, maxPages: 3, cursorPath: '' },
    pathTemplate: '/items', inputParameters: [],
    output: { mediaTypes: ['application/json'], contentKinds: ['structured_data'], shapeKnown: true, retrieval: 'to_verify', processing: 'to_verify' },
    capabilities: { pagination: 'none', download: 'unsupported', incremental: 'to_verify' },
    availability: 'to_verify', readSafety: 'verified_read', revision: 1,
    ...overrides,
  }
}

describe('import OpenAPI Connecteurs V3.1', () => {
  it('conserve chemin, paramètres, obligations, formats et nature de sortie', () => {
    const parsed = parseOpenApi(openApi)
    const imported = toApiEndpoint(parsed.endpoints[0], parsed.servers[0])

    expect(imported.id).toBe('listprojectdocuments')
    expect(imported.pathTemplate).toBe('/projects/{projectId}/documents')
    expect(imported.url).toBe('https://api.example.com/v1/projects/demo-project/documents')
    expect(imported.inputParameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'projectId', in: 'path', type: 'string', required: true, description: 'Projet cible', example: 'demo-project' }),
      expect.objectContaining({ name: 'status', in: 'query', type: 'string', required: false, enum: ['draft', 'published'], description: 'État du document' }),
    ]))
    expect(imported.output).toMatchObject({ mediaTypes: ['application/pdf'], contentKinds: ['document'], retrieval: 'to_verify', processing: 'unsupported' })
    expect(imported.availability).toBe('to_verify')
  })

  it('conserve les champs du corps JSON et bloque un POST non attesté', () => {
    const parsed = parseOpenApi(openApi)
    const imported = toApiEndpoint(parsed.endpoints[1], parsed.servers[0])
    expect(imported.inputParameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'query', in: 'body', required: true, type: 'string', description: 'Expression recherchée' }),
      expect.objectContaining({ name: 'language', in: 'body', required: false, enum: ['fr', 'en'] }),
    ]))
    expect(imported.readSafety).toBe('to_verify')

    const config = defaultConfig('api')
    config.api.method = 'POST'
    config.api.endpoints = [imported]
    config.api.activeEndpointId = imported.id
    expect(operationTestRestriction(config)).toContain('Aucun appel réseau')
  })
})

describe('compatibilité et réimport', () => {
  it('normalise un endpoint historique sans inventer de capacité', () => {
    const legacy = defaultConfig('api') as unknown as Record<string, unknown>
    const api = (legacy.api as Record<string, unknown>)
    api.endpoints = [{ id: 'legacy', label: 'Historique', summary: '', url: 'https://api.example.com/items', method: 'GET', query: [], body: '', itemsPath: 'items', titlePath: 'title', linkPath: 'url', datePath: '', summaryPath: '', pagination: { type: 'none', param: 'page', sizeParam: 'limit', pageSize: 50, maxPages: 3, cursorPath: '' } }]
    const parsed = configSchema.parse(legacy)
    const [operation] = operationsFromConfig(parsed)
    expect(operation.availability).toBe('to_verify')
    expect(operation.output.contentKinds).toEqual(['unknown'])
    expect(operation.inputParameters).toEqual([])
  })

  it('garde l’ID et la révision à l’identique, puis invalide un contrat modifié', () => {
    const config = defaultConfig('api')
    const first = endpoint({ availability: 'available', revision: 3 })
    config.api.endpoints = [first]

    const same = addEndpoints(config, [endpoint()], null).api.endpoints[0]
    expect(same.id).toBe(first.id)
    expect(same.revision).toBe(3)
    expect(same.availability).toBe('available')

    const changed = addEndpoints(config, [endpoint({ pathTemplate: '/v2/items' })], null).api.endpoints[0]
    expect(changed.id).toBe(first.id)
    expect(changed.revision).toBe(4)
    expect(changed.availability).toBe('to_verify')
  })
})
