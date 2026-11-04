import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

import schema from '@/lib/authentication/contracts/method-v1.3.0.schema.json'
import type { AuthLifecycleStatus, AuthMethodDefinitionV13 } from '@/lib/authentication/types'

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const validateSchema = ajv.compile<AuthMethodDefinitionV13>(schema)

const PROTECTED_HEADERS = new Set(['authorization', 'cookie', 'host', 'content-length', 'proxy-authorization', 'set-cookie'])
const TRANSITIONS: Record<AuthLifecycleStatus, AuthLifecycleStatus[]> = {
  brouillon: ['a_valider'],
  a_valider: ['brouillon', 'disponible'],
  disponible: ['desactivee', 'obsolete'],
  desactivee: ['a_valider', 'obsolete'],
  obsolete: [],
}

export type ContractValidationResult = { ok: true } | { ok: false; errors: string[] }

function schemaError(error: ErrorObject) {
  return `${error.instancePath || '/'} ${error.message ?? 'est invalide'}`
}

function unsafePattern(pattern: string) {
  return pattern.length > 240 || /\\[1-9]|\(\?<([=!])|\([^)]*[+*][^)]*\)[+*{]/.test(pattern)
}

export function canTransitionAuthMethod(from: AuthLifecycleStatus, to: AuthLifecycleStatus) {
  return TRANSITIONS[from].includes(to)
}

export function validateAuthMethodDefinition(value: unknown): ContractValidationResult {
  if (!validateSchema(value)) return { ok: false, errors: (validateSchema.errors ?? []).map(schemaError) }

  const method = value as AuthMethodDefinitionV13
  const errors: string[] = []
  const codes = new Set<string>()
  const fields = [...method.fieldSchema.fields].sort((a, b) => a.order - b.order)

  for (const [index, field] of fields.entries()) {
    if (codes.has(field.code)) errors.push(`Le code de champ « ${field.code} » est dupliqué.`)
    codes.add(field.code)
    if (field.order !== index + 1) errors.push(`L’ordre des champs doit être continu à partir de 1 (${field.code}).`)
    if (field.validation.pattern && unsafePattern(field.validation.pattern)) errors.push(`La regex du champ « ${field.code} » est refusée car elle peut être coûteuse ou ambiguë.`)
    if (field.secret) {
      if (field.valueSource !== 'connection.secretRef') errors.push(`Le secret « ${field.code} » doit provenir de connection.secretRef.`)
      if (!field.storage || field.storage.mode !== 'vaultRef' || field.storage.readBack !== false) errors.push(`Le secret « ${field.code} » doit être stocké sans relecture dans le coffre.`)
      if (field.defaultValue !== null) errors.push(`Le secret « ${field.code} » ne peut pas avoir de valeur par défaut.`)
    } else if (field.storage) {
      errors.push(`Le champ non secret « ${field.code} » ne doit pas déclarer de stockage coffre.`)
    }
    if (field.valueSource === 'adapter.nonSecretConfig' && field.editableInConnection) errors.push(`Le champ adaptateur « ${field.code} » ne peut pas être éditable dans Connexions.`)
    if (field.visibility.operator === 'equals' && (!codes.has(field.visibility.fieldCode) || field.visibility.fieldCode === field.code)) errors.push(`La visibilité de « ${field.code} » doit dépendre d’un champ antérieur.`)
  }

  for (const binding of method.transmission.bindings) {
    const target = binding.target as { name?: unknown; nameFixedByAdapter?: unknown }
    const isProtectedHeader = typeof target.name === 'string' && PROTECTED_HEADERS.has(target.name.toLowerCase())
    const isServerControlled = target.nameFixedByAdapter === true && !binding.clientEditable

    if (isProtectedHeader && !isServerControlled) errors.push(`L’en-tête protégé « ${target.name} » doit être fixé par l’adaptateur et non modifiable par le client.`)
    if (binding.clientEditable) errors.push('Une liaison de transmission ne peut jamais être modifiable par le client.')
  }

  const usesHttpTransport = method.transmission.protocol.toLowerCase().startsWith('http') || method.transmission.bindings.some((binding) => binding.channel.startsWith('http.'))
  if (usesHttpTransport && method.transmission.requiresTls === false && method.fieldSchema.fields.some((field) => field.secret)) errors.push('Une méthode HTTP contenant un secret doit exiger TLS.')
  return errors.length ? { ok: false, errors } : { ok: true }
}
