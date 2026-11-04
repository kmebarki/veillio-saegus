import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { defaultConfig, type ApiEndpoint } from '../lib/connector-catalog'
import { connectorScopeAllows } from '../lib/connectors/access'
import { connectorDeletionDecision } from '../lib/connectors/deletion'
import { runConnectorTest } from '../lib/connectors/engine'
import { connectorMutationResource } from '../lib/connectors/mutation-lock'
import { applyTechnicalOperationQualification, operationIsUsableByAdapter, sanitizeClientOperationAttestations } from '../lib/connectors/operation-qualification'

const connectorActions = readFileSync(resolve(process.cwd(), 'app/actions/connectors.ts'), 'utf8')
const sourceActions = readFileSync(resolve(process.cwd(), 'app/actions/sources.ts'), 'utf8')

function endpoint(overrides: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return {
    id: 'search', label: 'Rechercher', summary: '', url: 'https://api.example.com/search', method: 'GET', query: [], body: '', itemsPath: 'items', titlePath: 'title', linkPath: 'url', datePath: '', summaryPath: '',
    pagination: { type: 'none', param: 'page', sizeParam: 'limit', pageSize: 50, maxPages: 3, cursorPath: '' },
    pathTemplate: '/search', inputParameters: [],
    output: { mediaTypes: ['application/json'], contentKinds: ['structured_data'], shapeKnown: true, retrieval: 'to_verify', processing: 'to_verify' },
    capabilities: { pagination: 'none', download: 'unsupported', incremental: 'to_verify' },
    availability: 'to_verify', readSafety: 'verified_read', revision: 1,
    ...overrides,
  }
}

function apiConfig(operation: ApiEndpoint) {
  const config = defaultConfig('api')
  config.url = operation.url
  config.api.method = operation.method
  config.api.endpoints = [operation]
  config.api.activeEndpointId = operation.id
  return config
}

describe('isolation multi-organisations des Connecteurs', () => {
  it('refuse une ressource d’une autre organisation et conserve l’accès légitime', () => {
    const connector = { organizationId: 'org-b' }
    expect(connectorScopeAllows('org-a', connector)).toBe(false)
    expect(connectorScopeAllows('org-b', connector)).toBe(true)
  })

  it.each(['getConnectorDetail', 'updateConnector', 'testConnector', 'setConnectorStatus', 'duplicateConnector', 'deleteConnector'])(
    '%s passe par un chargement borné à l’organisation',
    (action) => {
      const body = connectorActions.slice(connectorActions.indexOf(`export async function ${action}`))
      const nextAction = body.indexOf('\nexport async function ', 1)
      const actionBody = nextAction === -1 ? body : body.slice(0, nextAction)
      expect(actionBody).toMatch(/organizationId/)
      expect(actionBody).toMatch(action === 'deleteConnector' ? /eq\(connectors\.organizationId, organizationId\)/ : /loadConnector\([^\n]+organizationId\)/)
    },
  )
})

describe('suppression sans cascade et concurrence Source', () => {
  it('refuse séparément une Connexion et une Source', () => {
    expect(connectorDeletionDecision({ status: 'paused', connectionCount: 1, sourceCount: 0 })).toEqual({ type: 'dependencies', connectionCount: 1, sourceCount: 0 })
    expect(connectorDeletionDecision({ status: 'paused', connectionCount: 0, sourceCount: 1 })).toEqual({ type: 'dependencies', connectionCount: 0, sourceCount: 1 })
  })

  it('autorise uniquement un Connecteur inactif sans dépendance', () => {
    expect(connectorDeletionDecision({ status: 'paused', connectionCount: 0, sourceCount: 0 })).toEqual({ type: 'deletable' })
    expect(connectorDeletionDecision({ status: 'active', connectionCount: 0, sourceCount: 0 })).toEqual({ type: 'active' })
  })

  it('sérialise création de Source et suppression sur la même ressource', () => {
    const id = '45b9f34b-83eb-4aed-a7d8-771b8d5cff2f'
    expect(connectorMutationResource(id)).toBe(`connector:${id}`)
    expect(connectorActions).toContain('lockConnectorMutation(tx, parsed.data.id)')
    expect(sourceActions).toContain('lockConnectorMutation(tx, connector.id)')
    expect(connectorActions).toContain('not exists (select 1 from connections')
    expect(connectorActions).toContain('not exists (select 1 from sources')
    expect(connectorActions).not.toMatch(/onDelete:\s*['"]cascade['"]/)
  })
})

describe('sécurité d’exécution', () => {
  it('ne fait aucun appel réseau pour un POST non attesté', async () => {
    const operation = endpoint({ method: 'POST', readSafety: 'to_verify' })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await runConnectorTest('api', apiConfig(operation), null)
    expect(result.status).toBe('error')
    expect(result.message).toContain('Aucun appel réseau')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it.each(['path', 'query', 'body', 'header'] as const)('bloque un paramètre %s obligatoire sans valeur avant le réseau', async (location) => {
    const operation = endpoint({ inputParameters: [{ name: 'requiredValue', in: location, type: 'string', format: '', required: true, description: '', enum: [] }] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await runConnectorTest('api', apiConfig(operation), null)
    expect(result.status).toBe('error')
    expect(result.message).toContain('Aucun appel réseau')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('n’autorise aucune sélection implicite de Connexion authentifiée', () => {
    expect(connectorActions).toContain('if (!connectorId || !connectionId) return null')
    expect(connectorActions).not.toMatch(/connectionId\s*\?\?\s*/)
  })
})

describe('qualification technique versionnée', () => {
  it('qualifie uniquement la révision et la version d’adaptateur attestées', () => {
    const config = apiConfig(endpoint())
    const qualified = applyTechnicalOperationQualification(config, {
      operationId: 'search', contractRevision: 1, adapterId: 'rest-json', adapterVersion: '3.1.0', sideEffectFree: true,
      retrieval: 'available', processing: 'available',
    }, new Date('2026-11-04T10:00:00.000Z'))
    const operation = qualified.api.endpoints[0]
    expect(operation.availability).toBe('available')
    expect(operationIsUsableByAdapter(operation, { id: 'rest-json', version: '3.1.0' })).toBe(true)
    expect(operationIsUsableByAdapter(operation, { id: 'rest-json', version: '3.2.0' })).toBe(false)
    expect(() => applyTechnicalOperationQualification(config, {
      operationId: 'search', contractRevision: 2, adapterId: 'rest-json', adapterVersion: '3.1.0', sideEffectFree: true,
      retrieval: 'available', processing: 'available',
    })).toThrow('Contract revision mismatch')
  })

  it('refuse de qualifier un POST sans attestation d’innocuité', () => {
    const config = apiConfig(endpoint({ method: 'POST', readSafety: 'to_verify' }))
    expect(() => applyTechnicalOperationQualification(config, {
      operationId: 'search', contractRevision: 1, adapterId: 'rest-json', adapterVersion: '3.1.0', sideEffectFree: false,
      retrieval: 'available', processing: 'available',
    })).toThrow('side-effect free')
  })

  it('conserve la distinction entre récupération et traitement', () => {
    const config = apiConfig(endpoint({ output: { mediaTypes: ['application/pdf'], contentKinds: ['document'], shapeKnown: true, retrieval: 'to_verify', processing: 'unsupported' } }))
    const qualified = applyTechnicalOperationQualification(config, {
      operationId: 'search', contractRevision: 1, adapterId: 'binary-download', adapterVersion: '3.1.0', sideEffectFree: true,
      retrieval: 'available', processing: 'unsupported',
    })
    expect(qualified.api.endpoints[0]).toMatchObject({ availability: 'available', output: { retrieval: 'available', processing: 'unsupported' } })
  })

  it('neutralise toute auto-qualification envoyée par le client ou issue d’un import', () => {
    const forged = apiConfig(endpoint({ availability: 'available', output: { mediaTypes: ['application/json'], contentKinds: ['structured_data'], shapeKnown: true, retrieval: 'available', processing: 'available' } }))
    const sanitized = sanitizeClientOperationAttestations(forged)
    expect(sanitized.api.endpoints[0]).toMatchObject({ availability: 'to_verify', output: { retrieval: 'to_verify', processing: 'to_verify' } })
    expect(sanitized.api.endpoints[0].qualification).toBeUndefined()
    expect(connectorActions).not.toContain('qualifyConnectorOperation')
  })
})
