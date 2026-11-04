import { describe, expect, it } from 'vitest'

import { authMethodRegistry, isAuthMethodSelectable, updateAuthMethodSelection } from '../lib/auth-method-registry'

describe('sélection des méthodes d’authentification', () => {
  it('rend les méthodes standard shadow sélectionnables', () => {
    expect(isAuthMethodSelectable(authMethodRegistry.get('NONE')!)).toBe(true)
    expect(isAuthMethodSelectable(authMethodRegistry.get('API_KEY')!)).toBe(true)
    expect(isAuthMethodSelectable(authMethodRegistry.get('CUSTOM')!)).toBe(false)
  })

  it('retire Aucune authentification lorsqu’une méthode authentifiée est choisie', () => {
    expect(updateAuthMethodSelection(['NONE'], 'API_KEY', true)).toEqual(['API_KEY'])
  })

  it('rend Aucune authentification exclusive', () => {
    expect(updateAuthMethodSelection(['API_KEY', 'BASIC_AUTH'], 'NONE', true)).toEqual(['NONE'])
  })

  it('permet de décocher une méthode', () => {
    expect(updateAuthMethodSelection(['API_KEY', 'BASIC_AUTH'], 'API_KEY', false)).toEqual(['BASIC_AUTH'])
  })
})
