import type { AuthType } from '@/lib/connector-catalog'

export const SECRET_MAX = 4096

export type SecretIssue = { level: 'error' | 'warning' | 'info'; message: string }
export type SecretAnalysis = { value: string; empty: boolean; valid: boolean; issues: SecretIssue[]; jwtExpiry: string | null }

const PLACEHOLDER = /^(your[-_ ]|xxx+|changeme|change[-_ ]me|todo$|example|test$|<.+>$|\*{3,}|•{3,})/i
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/

function jwtExpiryOf(value: string): string | null {
  if (!JWT.test(value)) return null
  try {
    const payload = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
    return typeof json.exp === 'number' ? new Date(json.exp * 1000).toISOString().slice(0, 10) : null
  } catch {
    return null
  }
}

/** Normalise un secret collé (espaces, guillemets, préfixe « Bearer ») et signale les erreurs qui casseraient la requête HTTP. */
export function analyzeSecret(authType: AuthType, raw: string): SecretAnalysis {
  const issues: SecretIssue[] = []
  let value = raw.trim()
  if (raw.length && value !== raw) issues.push({ level: 'info', message: 'Espaces ou retours à la ligne retirés en début et fin de saisie.' })

  const quoted = value.match(/^(["'`])([\s\S]*)\1$/)
  if (quoted) {
    value = quoted[2].trim()
    issues.push({ level: 'info', message: 'Guillemets entourant le secret retirés.' })
  }
  if (authType === 'bearer' && /^bearer\s+/i.test(value)) {
    value = value.replace(/^bearer\s+/i, '')
    issues.push({ level: 'info', message: 'Préfixe « Bearer » retiré : il est ajouté automatiquement.' })
  }

  if (!value) return { value, empty: true, valid: false, issues, jwtExpiry: null }

  if (value.length > SECRET_MAX) issues.push({ level: 'error', message: `Secret trop long (${SECRET_MAX} caractères maximum).` })
  if (/[\u0000-\u001f\u007f]/.test(value)) issues.push({ level: 'error', message: 'Le secret contient un retour à la ligne ou un caractère de contrôle : collez-le sur une seule ligne.' })
  if (authType !== 'basic' && /[^\u0020-\u007e]/.test(value)) {
    issues.push({ level: authType === 'api_key_query' ? 'warning' : 'error', message: 'Caractères non ASCII (accents, symboles) : refusés dans un en-tête HTTP, probablement une erreur de copie.' })
  }
  if (authType !== 'basic' && /\s/.test(value)) issues.push({ level: 'warning', message: 'Le secret contient des espaces : inhabituel pour une clé ou un jeton.' })
  if (value.length < 8) issues.push({ level: 'warning', message: 'Secret très court (moins de 8 caractères).' })
  if (PLACEHOLDER.test(value)) issues.push({ level: 'warning', message: 'Ressemble à une valeur d’exemple plutôt qu’à un vrai secret.' })
  if (authType === 'api_key_query' && /[^\w.~-]/.test(value)) issues.push({ level: 'info', message: 'Des caractères spéciaux seront encodés dans l’URL.' })

  const jwtExpiry = jwtExpiryOf(value)
  if (JWT.test(value)) issues.push({ level: 'info', message: jwtExpiry ? `Jeton JWT détecté, valable jusqu’au ${jwtExpiry}.` : 'Jeton JWT détecté.' })

  return { value, empty: false, valid: !issues.some((issue) => issue.level === 'error'), issues, jwtExpiry }
}

export function analyzeUsername(authType: AuthType, raw: string): { value: string; error: string | null } {
  const value = raw.trim()
  if (authType !== 'basic') return { value: '', error: null }
  if (!value) return { value, error: 'Renseignez l’identifiant (nom d’utilisateur).' }
  if (value.includes(':')) return { value, error: 'L’identifiant ne peut pas contenir « : » (séparateur du schéma Basic).' }
  if (/[\u0000-\u001f\u007f]/.test(value)) return { value, error: 'L’identifiant contient un caractère de contrôle.' }
  if (value.length > 200) return { value, error: 'L’identifiant est trop long.' }
  return { value, error: null }
}

/** Indice non réversible affiché à la place du secret : fin de la valeur uniquement pour les secrets longs. */
export function secretHintOf(value: string) {
  return value.length >= 16 ? `…${value.slice(-4)} · ${value.length} car.` : `${value.length} car.`
}

export type PreviewSegment = { text: string; secret?: boolean }

/** Montre à quel endroit exact de la requête HTTP le secret sera injecté. */
export function requestPreview(authType: AuthType, keyName: string, username: string): { where: string; segments: PreviewSegment[] } | null {
  const secret: PreviewSegment = { text: '‹secret›', secret: true }
  if (authType === 'bearer') return { where: 'En-tête HTTP', segments: [{ text: 'Authorization: Bearer ' }, secret] }
  if (authType === 'basic') return { where: 'En-tête HTTP', segments: [{ text: `Authorization: Basic base64(${username || 'identifiant'}:` }, secret, { text: ')' }] }
  if (authType === 'api_key_header') return { where: 'En-tête HTTP', segments: [{ text: `${keyName || 'X-API-Key'}: ` }, secret] }
  if (authType === 'api_key_query') return { where: 'Paramètre d’URL', segments: [{ text: `?${keyName || 'api_key'}=` }, secret] }
  return null
}
