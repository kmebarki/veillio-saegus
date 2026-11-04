import { describe, expect, it } from 'vitest'

import { authMethodRegistry, isAuthMethodSelectable, updateAuthMethodSelection } from '../lib/auth-method-registry'
import { resolveBundledOperationalRuntime } from '../lib/authentication/runtime-registry'

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

  it('active le runtime BASIC_AUTH intégré pour IMAP', () => {
    expect(resolveBundledOperationalRuntime({
      methodId: 'BASIC_AUTH',
      methodVersion: '1.1.0',
      adapterId: 'imap',
      adapterVersion: '1.0.0',
    })).toEqual({ handlerKey: 'http-basic', handlerVersion: '1.0.0' })
  })

  it('active automatiquement les accès publics RSS sans identifiants', () => {
    expect(resolveBundledOperationalRuntime({
      methodId: 'NONE',
      methodVersion: '1.0.0',
      adapterId: 'rss',
      adapterVersion: '1.0.0',
    })).toEqual({ handlerKey: 'none', handlerVersion: '1.0.0' })
  })

  it('ne contourne pas la qualification pour un adaptateur non intégré', () => {
    expect(resolveBundledOperationalRuntime({
      methodId: 'BASIC_AUTH',
      methodVersion: '1.1.0',
      adapterId: 'api',
      adapterVersion: '1.0.0',
    })).toBeNull()
  })
})
