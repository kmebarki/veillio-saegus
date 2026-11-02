import { parse as parseYaml } from 'yaml'

import type { ApiEndpoint, ApiPagination, AuthType, KeyValue } from '@/lib/connector-catalog'

export const MAX_SPEC_CHARS = 3_000_000
const MAX_OPERATIONS = 400
const MAX_NODES = 4000
const PATH_OK = /^[A-Za-z0-9_$\-]+$/
const NAME_OK = /^[A-Za-z0-9_.\-[\]]+$/

export type ImportedAuth = { type: AuthType; keyName: string; schemeName: string; note: string }

export type ImportedEndpoint = {
  id: string
  method: 'GET' | 'POST'
  path: string
  resolvedPath: string
  label: string
  summary: string
  tags: string[]
  deprecated: boolean
  requiresAuth: boolean
  confidence: 'high' | 'medium' | 'low'
  notes: string[]
  blocked: string | null
  template: Omit<ApiEndpoint, 'id' | 'label' | 'summary' | 'url'>
}

export type OpenApiImport = {
  title: string
  version: string
  specLabel: string
  servers: string[]
  endpoints: ImportedEndpoint[]
  skippedCount: number
  auth: ImportedAuth | null
  warnings: string[]
}

export class OpenApiError extends Error {}

type Obj = Record<string, unknown>
const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value)
const own = (object: Obj, key: string): unknown => (Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined)
const text = (value: unknown) => (typeof value === 'string' ? value : '')

type Shape = {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'unknown'
  props?: Record<string, Shape>
  items?: Shape
  format?: string
  example?: unknown
  default?: unknown
  enum?: unknown[]
  maximum?: number
}

const UNKNOWN: Shape = { type: 'unknown' }

function parseSpecText(raw: string): Obj {
  const source = raw.replace(/^\uFEFF/, '').trim()
  if (!source) throw new OpenApiError('Le fichier est vide.')
  if (source.length > MAX_SPEC_CHARS) throw new OpenApiError('Spécification trop volumineuse (3 Mo maximum).')
  let parsed: unknown
  if (source.startsWith('{')) {
    try {
      parsed = JSON.parse(source)
    } catch (error) {
      throw new OpenApiError(`JSON invalide : ${error instanceof Error ? error.message : 'erreur de syntaxe'}.`)
    }
  } else {
    try {
      parsed = parseYaml(source, { maxAliasCount: 100, strict: false })
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : 'erreur de syntaxe'
      throw new OpenApiError(`YAML invalide : ${message}`)
    }
  }
  if (!isObj(parsed)) throw new OpenApiError('Le document n’est pas une spécification OpenAPI (objet attendu).')
  return parsed
}

function resolveRef(root: Obj, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined
  let current: unknown = root
  for (const rawSegment of ref.slice(2).split('/')) {
    let segment = rawSegment
    try {
      segment = decodeURIComponent(rawSegment)
    } catch {
      return undefined
    }
    segment = segment.replace(/~1/g, '/').replace(/~0/g, '~')
    if (!isObj(current)) return undefined
    current = own(current, segment)
  }
  return current
}

function deref(root: Obj, node: unknown): unknown {
  let current = node
  for (let hops = 0; hops < 10 && isObj(current) && typeof current.$ref === 'string'; hops++) current = resolveRef(root, current.$ref as string)
  return current
}

type Budget = { nodes: number }

function normalizeType(raw: unknown, node: Obj): Shape['type'] {
  const candidate = Array.isArray(raw) ? raw.find((entry) => entry !== 'null') : raw
  if (candidate === 'object' || candidate === 'array' || candidate === 'string' || candidate === 'boolean') return candidate
  if (candidate === 'number' || candidate === 'integer') return 'number'
  if (isObj(node.properties)) return 'object'
  if (node.items !== undefined) return 'array'
  return 'unknown'
}

function toShape(root: Obj, node: unknown, depth: number, seen: string[], budget: Budget): Shape {
  if (budget.nodes-- <= 0 || depth > 7) return UNKNOWN
  let current = node
  let ref = ''
  for (let hops = 0; hops < 10 && isObj(current) && typeof current.$ref === 'string'; hops++) {
    ref = current.$ref as string
    if (seen.includes(ref)) return UNKNOWN
    current = resolveRef(root, ref)
  }
  if (!isObj(current)) return UNKNOWN
  const trail = ref ? [...seen, ref] : seen

  const merged: Shape = { type: normalizeType(current.type, current) }
  if (current.format !== undefined) merged.format = text(current.format)
  if (current.example !== undefined) merged.example = current.example
  if (current.default !== undefined) merged.default = current.default
  if (Array.isArray(current.enum)) merged.enum = current.enum.slice(0, 20)
  if (typeof current.maximum === 'number') merged.maximum = current.maximum

  const parts = Array.isArray(current.allOf) ? current.allOf : []
  const alternatives = [...(Array.isArray(current.oneOf) ? current.oneOf : []), ...(Array.isArray(current.anyOf) ? current.anyOf : [])]
  for (const part of parts.slice(0, 8)) {
    const sub = toShape(root, part, depth + 1, trail, budget)
    if (sub.type === 'object') {
      merged.type = 'object'
      merged.props = { ...(merged.props ?? {}), ...(sub.props ?? {}) }
    } else if (merged.type === 'unknown') {
      merged.type = sub.type
      merged.items = sub.items
    }
  }
  if (merged.type === 'unknown' && alternatives.length) {
    const first = alternatives.map((alt) => toShape(root, alt, depth + 1, trail, budget)).find((shape) => shape.type !== 'unknown')
    if (first) return { ...first, example: first.example ?? merged.example }
  }

  if (isObj(current.properties)) {
    merged.type = 'object'
    const props: Record<string, Shape> = { ...(merged.props ?? {}) }
    for (const key of Object.keys(current.properties).slice(0, 80)) props[key] = toShape(root, current.properties[key], depth + 1, trail, budget)
    merged.props = props
  }
  if (merged.type === 'array' && !merged.items) merged.items = current.items === undefined ? UNKNOWN : toShape(root, current.items, depth + 1, trail, budget)
  return merged
}

function shapeFromExample(value: unknown, depth = 0): Shape {
  if (Array.isArray(value)) return { type: 'array', items: value.length ? shapeFromExample(value[0], depth + 1) : UNKNOWN }
  if (isObj(value)) {
    if (depth > 5) return { type: 'object', props: {} }
    const props: Record<string, Shape> = {}
    for (const key of Object.keys(value).slice(0, 60)) props[key] = shapeFromExample(value[key], depth + 1)
    return { type: 'object', props }
  }
  if (typeof value === 'string') return { type: 'string', example: value }
  if (typeof value === 'number') return { type: 'number', example: value }
  if (typeof value === 'boolean') return { type: 'boolean', example: value }
  return UNKNOWN
}

function exampleFromShape(shape: Shape, depth = 0): unknown {
  if (shape.example !== undefined) return shape.example
  if (shape.default !== undefined) return shape.default
  if (shape.enum?.length) return shape.enum[0]
  if (depth > 4) return null
  switch (shape.type) {
    case 'object': {
      const result: Obj = {}
      for (const [key, value] of Object.entries(shape.props ?? {}).slice(0, 25)) result[key] = exampleFromShape(value, depth + 1)
      return result
    }
    case 'array':
      return shape.items && shape.items.type !== 'unknown' ? [exampleFromShape(shape.items, depth + 1)] : []
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'string':
      return shape.format === 'date-time' ? '2024-01-01T00:00:00Z' : shape.format === 'date' ? '2024-01-01' : ''
    default:
      return null
  }
}

type ResponseInfo = { shape: Shape | null; nonJson: boolean; declared: boolean }

function firstExample(media: Obj): unknown {
  if (media.example !== undefined) return media.example
  if (isObj(media.examples)) {
    for (const key of Object.keys(media.examples)) {
      const entry = media.examples[key]
      if (isObj(entry) && entry.value !== undefined) return entry.value
    }
  }
  return undefined
}

function pickResponse(root: Obj, operation: Obj, isV2: boolean, globalProduces: string[], budget: Budget): ResponseInfo {
  const responses = isObj(operation.responses) ? operation.responses : null
  if (!responses) return { shape: null, nonJson: false, declared: false }
  const keys = Object.keys(responses)
  const key = ['200', '201'].find((code) => keys.includes(code)) ?? keys.find((code) => /^2\d\d$/.test(code)) ?? (keys.includes('default') ? 'default' : undefined)
  if (!key) return { shape: null, nonJson: false, declared: false }
  const response = deref(root, responses[key])
  if (!isObj(response)) return { shape: null, nonJson: false, declared: false }

  if (isV2) {
    const produces = Array.isArray(operation.produces) ? (operation.produces as unknown[]).map(text) : globalProduces
    if (produces.length && !produces.some((mime) => /json/i.test(mime))) return { shape: null, nonJson: true, declared: true }
    if (response.schema !== undefined) return { shape: toShape(root, response.schema, 0, [], budget), nonJson: false, declared: true }
    const examples = isObj(response.examples) ? firstExample({ examples: Object.fromEntries(Object.entries(response.examples).map(([mime, value]) => [mime, { value }])) }) : undefined
    return { shape: examples !== undefined ? shapeFromExample(examples) : null, nonJson: false, declared: true }
  }

  const content = isObj(response.content) ? response.content : null
  if (!content || Object.keys(content).length === 0) return { shape: null, nonJson: false, declared: true }
  const mime = Object.keys(content).find((entry) => entry === 'application/json') ?? Object.keys(content).find((entry) => /json/i.test(entry))
  if (!mime) return { shape: null, nonJson: true, declared: true }
  const media = content[mime]
  if (!isObj(media)) return { shape: null, nonJson: false, declared: true }
  if (media.schema !== undefined) {
    const shape = toShape(root, media.schema, 0, [], budget)
    if (shape.type !== 'unknown') return { shape, nonJson: false, declared: true }
  }
  const example = firstExample(media)
  return { shape: example !== undefined ? shapeFromExample(example) : null, nonJson: false, declared: true }
}

const CONTAINER_KEYS = ['data', 'response', 'result', 'payload', '_embedded', 'body']
const ITEM_KEYS = ['items', 'results', 'data', 'records', 'articles', 'entries', 'documents', 'hits', 'posts', 'news', 'publications', 'resources', 'list', 'rows', 'content', 'elements', 'values', 'objects']

function findItems(shape: Shape, trail: string[], depth: number): { path: string; item: Shape } | null {
  if (shape.type === 'array') return { path: trail.join('.'), item: shape.items ?? UNKNOWN }
  if (shape.type !== 'object' || !shape.props || depth > 3) return null
  const entries = Object.entries(shape.props).filter(([key]) => PATH_OK.test(key))
  const arrays = entries.filter(([, value]) => value.type === 'array')
  if (arrays.length) {
    const preferred = ITEM_KEYS.map((name) => arrays.find(([key]) => key.toLowerCase() === name)).find(Boolean) ?? arrays[0]
    return { path: [...trail, preferred[0]].join('.'), item: preferred[1].items ?? UNKNOWN }
  }
  for (const name of CONTAINER_KEYS) {
    const nested = entries.find(([key]) => key.toLowerCase() === name && (key.length > 0))
    if (nested && nested[1].type !== 'string') {
      const found = findItems(nested[1], [...trail, nested[0]], depth + 1)
      if (found) return found
    }
  }
  return null
}

type Candidate = { path: string; key: string; shape: Shape; depth: number }

function collect(shape: Shape, prefix: string, depth: number, out: Candidate[]) {
  if (shape.type !== 'object' || !shape.props) return
  for (const [key, value] of Object.entries(shape.props).slice(0, 80)) {
    if (!PATH_OK.test(key)) continue
    const path = prefix ? `${prefix}.${key}` : key
    out.push({ path, key: key.toLowerCase().replace(/[_-]/g, ''), shape: value, depth })
    if (value.type === 'object' && depth < 1) collect(value, path, depth + 1, out)
  }
}

function scalar(shape: Shape) {
  return shape.type === 'string' || shape.type === 'unknown' || shape.type === 'number'
}

function pickField(candidates: Candidate[], exact: RegExp, loose: RegExp, extra?: (candidate: Candidate) => boolean): string {
  const usable = candidates.filter((candidate) => scalar(candidate.shape))
  const byDepth = (a: Candidate, b: Candidate) => a.depth - b.depth
  const exactMatch = usable.filter((candidate) => exact.test(candidate.key)).sort(byDepth)[0]
  if (exactMatch) return exactMatch.path
  if (extra) {
    const extraMatch = usable.filter(extra).sort(byDepth)[0]
    if (extraMatch) return extraMatch.path
  }
  return usable.filter((candidate) => loose.test(candidate.key)).sort(byDepth)[0]?.path ?? ''
}

const CURSOR_KEYS = /^(nextcursor|nextpagetoken|nexttoken|endcursor|continuationtoken|cursor|nextpage|next)$/

function findCursorPath(shape: Shape | null): string {
  if (!shape || shape.type !== 'object') return ''
  const found: Candidate[] = []
  collect(shape, '', 0, found)
  return found.find((candidate) => CURSOR_KEYS.test(candidate.key) && scalar(candidate.shape))?.path ?? ''
}

type Param = { name: string; location: string; required: boolean; shape: Shape; description: string }

function readParams(root: Obj, list: unknown, isV2: boolean, budget: Budget): Param[] {
  if (!Array.isArray(list)) return []
  const params: Param[] = []
  for (const entry of list.slice(0, 60)) {
    const param = deref(root, entry)
    if (!isObj(param)) continue
    const name = text(param.name)
    const location = text(param.in)
    if (!name || !location) continue
    const base = isV2 ? toShape(root, { ...param, $ref: undefined }, 0, [], budget) : toShape(root, param.schema, 0, [], budget)
    const shape: Shape = { ...base }
    if (param.example !== undefined) shape.example = param.example
    if (param.default !== undefined && shape.default === undefined) shape.default = param.default
    params.push({ name, location, required: param.required === true || location === 'path', shape, description: text(param.description) })
  }
  return params
}

function paramValue(param: Param): string {
  const raw = param.shape.example ?? param.shape.default ?? param.shape.enum?.[0]
  if (raw === undefined || raw === null) return ''
  if (Array.isArray(raw)) return raw.join(',')
  if (typeof raw === 'object') return ''
  return String(raw)
}

const PAGE_NAMES = /^(page|pagenumber|pageno|pageindex|p)$/
const OFFSET_NAMES = /^(offset|skip|start|from)$/
const CURSOR_PARAM_NAMES = /^(cursor|after|next|nexttoken|pagetoken|continuation|continuationtoken|startingafter)$/
const SIZE_NAMES = /^(limit|perpage|pagesize|size|count|rows|take|maxresults|hitsperpage|per_page|pagelimit|top)$/

function classifyPagination(params: Param[], responseShape: Shape | null): { pagination: ApiPagination; consumed: Set<string> } {
  const normal = (name: string) => name.toLowerCase().replace(/[_\-.[\]]/g, '')
  const query = params.filter((param) => param.location === 'query' && NAME_OK.test(param.name))
  const cursor = query.find((param) => CURSOR_PARAM_NAMES.test(normal(param.name)))
  const page = query.find((param) => PAGE_NAMES.test(normal(param.name)))
  const offset = query.find((param) => OFFSET_NAMES.test(normal(param.name)))
  const size = query.find((param) => SIZE_NAMES.test(normal(param.name)))
  const driver = cursor ?? page ?? offset
  const pagination: ApiPagination = { type: 'none', param: 'page', sizeParam: 'limit', pageSize: 50, maxPages: 3, cursorPath: '' }
  const consumed = new Set<string>()
  if (!driver) return { pagination, consumed }

  pagination.type = driver === cursor ? 'cursor' : driver === page ? 'page' : 'offset'
  pagination.param = driver.name
  consumed.add(driver.name)
  if (size) {
    pagination.sizeParam = size.name
    consumed.add(size.name)
    const preferred = Number(paramValue(size)) || Number(size.shape.default) || 50
    pagination.pageSize = Math.max(1, Math.min(preferred, size.shape.maximum ?? 500, 500))
  } else {
    pagination.sizeParam = ''
  }
  if (pagination.type === 'cursor') pagination.cursorPath = findCursorPath(responseShape) || 'next_cursor'
  return { pagination, consumed }
}

const SLUG = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function readSecurity(root: Obj, isV2: boolean): { schemes: Record<string, ImportedAuth>; globalRequirements: Obj[] } {
  const defs = isV2 ? root.securityDefinitions : isObj(root.components) ? root.components.securitySchemes : undefined
  const schemes: Record<string, ImportedAuth> = {}
  if (isObj(defs)) {
    for (const name of Object.keys(defs).slice(0, 20)) {
      const scheme = deref(root, defs[name])
      if (!isObj(scheme)) continue
      const type = text(scheme.type).toLowerCase()
      const flavor = text(scheme.scheme).toLowerCase()
      if (type === 'http' && flavor === 'bearer') schemes[name] = { type: 'bearer', keyName: '', schemeName: name, note: 'Jeton Bearer' }
      else if (type === 'http' && flavor === 'basic') schemes[name] = { type: 'basic', keyName: '', schemeName: name, note: 'Authentification Basic' }
      else if (type === 'basic') schemes[name] = { type: 'basic', keyName: '', schemeName: name, note: 'Authentification Basic' }
      else if (type === 'apikey' && text(scheme.in) === 'header' && NAME_OK.test(text(scheme.name))) schemes[name] = { type: 'api_key_header', keyName: text(scheme.name), schemeName: name, note: `Clé API dans l’en-tête ${text(scheme.name)}` }
      else if (type === 'apikey' && text(scheme.in) === 'query' && NAME_OK.test(text(scheme.name))) schemes[name] = { type: 'api_key_query', keyName: text(scheme.name), schemeName: name, note: `Clé API dans le paramètre ${text(scheme.name)}` }
      else if (type === 'oauth2' || type === 'openidconnect') schemes[name] = { type: 'bearer', keyName: '', schemeName: name, note: `${type === 'oauth2' ? 'OAuth 2' : 'OpenID Connect'} : saisissez un jeton d’accès déjà obtenu (le flux d’autorisation n’est pas géré)` }
    }
  }
  const globalRequirements = Array.isArray(root.security) ? (root.security as unknown[]).filter(isObj) : []
  return { schemes, globalRequirements }
}

function requirementsNeedAuth(requirements: unknown): boolean | null {
  if (!Array.isArray(requirements)) return null
  return requirements.some((entry) => isObj(entry) && Object.keys(entry).length > 0)
}

function serverList(root: Obj, isV2: boolean): string[] {
  const clean = (value: string) => value.trim().replace(/\/+$/, '')
  if (isV2) {
    const host = text(root.host)
    if (!host) return []
    const schemes = Array.isArray(root.schemes) ? (root.schemes as unknown[]).map(text) : []
    const scheme = schemes.includes('https') ? 'https' : schemes[0] || 'https'
    return [clean(`${scheme}://${host}${text(root.basePath)}`)]
  }
  if (!Array.isArray(root.servers)) return []
  const urls: string[] = []
  for (const server of root.servers.slice(0, 10)) {
    if (!isObj(server)) continue
    let url = text(server.url)
    const variables = isObj(server.variables) ? server.variables : {}
    url = url.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const variable = own(variables, name)
      return isObj(variable) && variable.default !== undefined ? String(variable.default) : `{${name}}`
    })
    if (url) urls.push(clean(url))
  }
  return urls
}

export function buildEndpointUrl(base: string, resolvedPath: string): string {
  const root = base.trim().replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(root)
  } catch {
    throw new OpenApiError('L’URL de base est invalide : indiquez une adresse complète (https://api.exemple.fr/v1).')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new OpenApiError('L’URL de base doit commencer par https:// ou http://.')
  return `${root}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`
}

export function isAbsoluteHttpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'https:' || url.protocol === 'http:') && !value.includes('{')
  } catch {
    return false
  }
}

export function toApiEndpoint(item: ImportedEndpoint, base: string): ApiEndpoint {
  return { id: item.id, label: item.label.slice(0, 120), summary: item.summary.slice(0, 300), url: buildEndpointUrl(base, item.resolvedPath), ...item.template }
}

export function parseOpenApi(source: string): OpenApiImport {
  const root = parseSpecText(source)
  const isV2 = typeof root.swagger === 'string' && root.swagger.startsWith('2')
  const openapi = text(root.openapi)
  if (!isV2 && !openapi.startsWith('3')) throw new OpenApiError('Version non reconnue : le document doit déclarer « openapi: 3.x » ou « swagger: 2.0 ».')
  if (!isObj(root.paths) || Object.keys(root.paths).length === 0) throw new OpenApiError('Aucun chemin (« paths ») n’est décrit dans cette spécification.')

  const info = isObj(root.info) ? root.info : {}
  const warnings: string[] = []
  const budget: Budget = { nodes: MAX_NODES }
  const { schemes, globalRequirements } = readSecurity(root, isV2)
  const globalProduces = Array.isArray(root.produces) ? (root.produces as unknown[]).map(text) : []
  const globalAuthRequired = requirementsNeedAuth(globalRequirements) ?? false

  let auth: ImportedAuth | null = null
  const firstRequirement = globalRequirements.find((entry) => Object.keys(entry).length > 0)
  const wanted = firstRequirement ? Object.keys(firstRequirement).find((name) => schemes[name]) : undefined
  if (wanted) auth = schemes[wanted]
  else if (Object.keys(schemes).length) auth = Object.values(schemes)[0]

  const endpoints: ImportedEndpoint[] = []
  const usedIds = new Set<string>()
  let skippedCount = 0
  let operations = 0

  outer: for (const path of Object.keys(root.paths)) {
    if (!path.startsWith('/')) continue
    const pathItem = deref(root, (root.paths as Obj)[path])
    if (!isObj(pathItem)) continue
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      const operation = own(pathItem, method)
      if (!isObj(operation)) continue
      if (method !== 'get' && method !== 'post') {
        skippedCount++
        continue
      }
      if (++operations > MAX_OPERATIONS) {
        warnings.push(`Seules les ${MAX_OPERATIONS} premières opérations ont été analysées.`)
        break outer
      }

      const verb = method.toUpperCase() as 'GET' | 'POST'
      const params = [...readParams(root, pathItem.parameters, isV2, budget), ...readParams(root, operation.parameters, isV2, budget)]
      const uniqueParams = params.filter((param, index) => params.findLastIndex((other) => other.name === param.name && other.location === param.location) === index)
      const notes: string[] = []
      let blocked: string | null = null

      let resolvedPath = path
      for (const match of path.matchAll(/\{([^}]+)\}/g)) {
        const param = uniqueParams.find((candidate) => candidate.location === 'path' && candidate.name === match[1])
        const value = param ? paramValue(param) : ''
        if (!value) {
          blocked = `Paramètre de chemin « ${match[1]} » sans valeur d’exemple : endpoint non collectable tel quel.`
          break
        }
        resolvedPath = resolvedPath.replace(match[0], encodeURIComponent(value))
      }

      const response = pickResponse(root, operation, isV2, globalProduces, budget)
      if (!blocked && response.nonJson) blocked = 'La réponse déclarée n’est pas du JSON.'

      let body = ''
      if (verb === 'POST' && !blocked) {
        let bodyShape: Shape | null = null
        if (isV2) {
          const bodyParam = uniqueParams.find((param) => param.location === 'body')
          const rawParam = (Array.isArray(operation.parameters) ? (operation.parameters as unknown[]).map((entry) => deref(root, entry)).find((entry) => isObj(entry) && entry.in === 'body') : undefined) as Obj | undefined
          if (bodyParam && rawParam) bodyShape = toShape(root, rawParam.schema, 0, [], budget)
        } else {
          const requestBody = deref(root, operation.requestBody)
          const content = isObj(requestBody) && isObj(requestBody.content) ? requestBody.content : null
          if (content) {
            const mime = Object.keys(content).find((entry) => /json/i.test(entry))
            if (!mime && Object.keys(content).length) blocked = 'Le corps de la requête n’est pas du JSON (seul le JSON est géré).'
            const media = mime ? content[mime] : null
            if (isObj(media)) {
              const example = firstExample(media)
              bodyShape = example !== undefined ? { type: 'unknown', example } : toShape(root, media.schema, 0, [], budget)
            }
          }
        }
        if (bodyShape) {
          const example = exampleFromShape(bodyShape)
          const serialized = example === null || example === undefined ? '' : JSON.stringify(example, null, 2)
          if (serialized.length > 5000) notes.push('Corps d’exemple trop volumineux : à saisir manuellement.')
          else body = serialized === '{}' ? '' : serialized
          if (body) notes.push('Corps de requête généré à partir du schéma : vérifiez-le.')
        }
      }

      const items = response.shape ? findItems(response.shape, [], 0) : null
      const itemsPath = items?.path ?? ''
      const candidates: Candidate[] = []
      if (items) collect(items.item, '', 0, candidates)

      const titlePath = pickField(candidates, /^(title|titre|headline|name|nom|label|libelle|intitule|subject|objet)$/, /title|titre|name/)
      const linkPath = pickField(candidates, /^(url|link|href|permalink|weburl|htmlurl|canonicalurl|sourceurl|uri|self)$/, /url|link|href/, (candidate) => candidate.shape.format === 'uri' || candidate.shape.format === 'url')
      const datePath = pickField(candidates, /^(publishedat|publicationdate|datepublication|datepublished|pubdate|published|publishdate|datepub|dateparution|date|createdat|created|updatedat|modified|timestamp)$/, /date|time/, (candidate) => candidate.shape.format === 'date-time' || candidate.shape.format === 'date')
      const summaryPath = pickField(candidates, /^(summary|resume|description|abstract|excerpt|snippet|teaser|lead|chapo|content|body|text)$/, /summary|resum|descr|abstract|excerpt/)

      const { pagination, consumed } = classifyPagination(uniqueParams, response.shape)

      const query: KeyValue[] = []
      let optionalSkipped = 0
      let blankRequired = false
      for (const param of uniqueParams) {
        if (param.location !== 'query' || !NAME_OK.test(param.name) || consumed.has(param.name)) continue
        if (auth?.type === 'api_key_query' && auth.keyName === param.name) continue
        const value = paramValue(param)
        if (param.required) {
          if (!value) blankRequired = true
          query.push({ name: param.name, value: value.slice(0, 500) })
        } else if (value && param.shape.example !== undefined) {
          query.push({ name: param.name, value: value.slice(0, 500) })
        } else {
          optionalSkipped++
        }
        if (query.length >= 15) break
      }
      if (blankRequired) notes.push(`Paramètre(s) requis à renseigner : ${query.filter((entry) => !entry.value).map((entry) => entry.name).join(', ')}.`)
      if (optionalSkipped) notes.push(`${optionalSkipped} paramètre${optionalSkipped > 1 ? 's' : ''} optionnel${optionalSkipped > 1 ? 's' : ''} non repris.`)

      if (!response.declared) notes.push('Aucune réponse 2xx décrite : mapping par défaut.')
      else if (!response.shape) notes.push('Réponse sans schéma ni exemple : mapping par défaut.')
      else if (!items) notes.push('Aucune liste d’éléments détectée dans la réponse.')
      if (items && !titlePath) notes.push('Champ titre non détecté.')
      if (items && !linkPath) notes.push('Champ lien non détecté.')

      const opAuth = requirementsNeedAuth(operation.security)
      const requiresAuth = opAuth ?? globalAuthRequired

      const confidence: ImportedEndpoint['confidence'] = !items || !response.shape ? 'low' : titlePath && linkPath && !blankRequired ? 'high' : 'medium'

      const baseId = SLUG(text(operation.operationId) || `${method}-${path}`).slice(0, 56) || `${method}-endpoint`
      let id = baseId
      for (let suffix = 2; usedIds.has(id); suffix++) id = `${baseId}-${suffix}`
      usedIds.add(id)

      const label = text(operation.summary).trim() || text(operation.operationId).trim() || `${verb} ${path}`
      endpoints.push({
        id,
        method: verb,
        path,
        resolvedPath,
        label,
        summary: text(operation.description).trim().replace(/\s+/g, ' ').slice(0, 300) || (text(operation.summary).trim() ? '' : ''),
        tags: Array.isArray(operation.tags) ? (operation.tags as unknown[]).map(text).filter(Boolean).slice(0, 3) : [],
        deprecated: operation.deprecated === true,
        requiresAuth,
        confidence,
        notes,
        blocked,
        template: {
          method: verb,
          query,
          body,
          itemsPath,
          titlePath: titlePath || 'title',
          linkPath: linkPath || 'url',
          datePath,
          summaryPath,
          pagination,
        },
      })
    }
  }

  if (endpoints.length === 0) throw new OpenApiError('Aucun endpoint GET ou POST exploitable n’a été trouvé dans cette spécification.')
  if (budget.nodes <= 0) warnings.push('Spécification très volumineuse : certains schémas ont été analysés partiellement.')
  const servers = serverList(root, isV2)
  if (servers.length === 0) warnings.push('Aucun serveur déclaré : saisissez l’URL de base de l’API.')
  if (auth && /OAuth|OpenID/.test(auth.note)) warnings.push(auth.note + '.')

  return {
    title: text(info.title) || 'API sans titre',
    version: text(info.version),
    specLabel: isV2 ? `Swagger ${text(root.swagger)}` : `OpenAPI ${openapi}`,
    servers,
    endpoints,
    skippedCount,
    auth,
    warnings,
  }
}
