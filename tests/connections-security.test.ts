import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { evaluateAvailability } from '../lib/authentication/runtime-registry'
import { canMutateConnection, canViewConnection } from '../lib/connections/access-policy'

const connectionActions = readFileSync(resolve(process.cwd(), 'app/actions/connections.ts'), 'utf8')
const connectionModule = readFileSync(resolve(process.cwd(), 'components/connections-module.tsx'), 'utf8')
const executionGrants = readFileSync(resolve(process.cwd(), 'lib/connections/execution-grant.ts'), 'utf8')

describe('propriété et visibilité des Connexions', () => {
  const owner = { userId: 'user-a', organizationId: 'org-a' }
  const otherManager = { userId: 'user-b', organizationId: 'org-b' }
  const connection = { scope: 'organization', ownerKind: 'user', ownerId: 'user-a', lifecycle: 'active' }

  it('sépare la visibilité de la propriété canonique', () => {
    expect(canViewConnection(otherManager, connection, ['org-b'])).toBe(true)
    expect(canMutateConnection(otherManager, connection)).toBe(false)
    expect(canMutateConnection(owner, connection)).toBe(true)
  })

  it('refuse la visibilité inter-organisations implicite', () => {
    expect(canViewConnection(otherManager, connection, ['org-a'])).toBe(false)
    expect(connectionActions).not.toContain("row.scope === 'public' || actor.permissions.includes('connections.manage')")
  })

  it('préserve le propriétaire lors des changements de portée', () => {
    expect(connectionActions).toContain('ownerUserId: actor.id')
    expect(connectionActions).toContain('ownerKind: \'user\'')
    expect(connectionActions).toContain('ownerId: actor.id')
    expect(connectionActions).not.toMatch(/ownerId:\s*parsed\.data\.scope/)
  })

  it('bloque la publication sans politique d’approbation', () => {
    expect(connectionActions).toContain('La publication publique nécessite une approbation qui n’est pas encore configurée.')
  })
})

describe('gates runtime fail-closed', () => {
  const completeEvidence = {
    handlerKey: 'http-bearer',
    handlerVersion: '1.0.0',
    deployed: true,
    securityReviewed: true,
    contractTestsPassed: true,
    enabled: true,
    compatibilityVerified: true,
  }

  it('exige toutes les preuves avant de rendre une méthode exécutable', () => {
    expect(evaluateAvailability(completeEvidence, 'disponible')).toEqual({ available: true, missing: [] })
    expect(evaluateAvailability({ ...completeEvidence, securityReviewed: false }, 'disponible')).toMatchObject({ available: false, missing: ['revue de sécurité indépendante'] })
    expect(evaluateAvailability({ ...completeEvidence, compatibilityVerified: false }, 'disponible')).toMatchObject({ available: false, missing: ['compatibilité adaptateur'] })
    expect(evaluateAvailability({ ...completeEvidence, handlerKey: 'inconnu' }, 'disponible')).toMatchObject({ available: false, missing: ['handler déployé et enregistré'] })
  })
})

describe('parcours de création', () => {
  it('garde le bouton Nouvelle connexion visible même sans runtime qualifié', () => {
    expect(connectionModule).toContain('<Button onClick={() => setForm({ mode: \'create\' })}><Plus data-icon="inline-start" />Nouvelle connexion</Button>')
    expect(connectionModule).not.toContain('{canCreate && <Button')
  })
})

describe('grants d’exécution à usage unique', () => {
  it('lie le grant au principal et le consomme atomiquement', () => {
    expect(executionGrants).toContain('createdByUserId, input.principal.userId')
    expect(executionGrants).toContain('isNull(connectionExecutionGrants.consumedAt)')
    expect(executionGrants).toContain('consumedAt: new Date()')
    expect(executionGrants).toContain('.returning({ id: connectionExecutionGrants.id })')
  })
})
