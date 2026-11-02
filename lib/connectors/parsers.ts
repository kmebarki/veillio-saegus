import 'server-only'

import * as cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'

import type { ConnectorConfig } from '@/lib/connector-catalog'

export type ParsedItem = { title: string; link: string; date: string; summary: string; guid?: string }

export class ParseError extends Error {}

const clean = (value: string, max = 280) => value.replace(/\s+/g, ' ').trim().slice(0, max)

function stripHtml(value: string, max = 280) {
  if (!value) return ''
  const text = value.includes('<') ? cheerio.load(`<div>${value}</div>`).text() : value
  return clean(text, max)
}

export function normalizeDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const input = typeof raw === 'number' ? (raw < 1e11 ? raw * 1000 : raw) : String(raw).trim()
  const time = typeof input === 'number' ? input : /^\d{10,13}$/.test(input) ? Number(input.length <= 10 ? `${input}000` : input) : Date.parse(input)
  if (Number.isNaN(time)) return ''
  const date = new Date(time)
  return date.getFullYear() < 1990 || date.getFullYear() > new Date().getFullYear() + 2 ? '' : date.toISOString()
}

export function absoluteHttpUrl(raw: string, base: string) {
  if (!raw) return ''
  try {
    const url = new URL(raw.trim(), base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

type XmlNode = string | number | { '#text'?: string | number; [key: string]: unknown } | XmlNode[] | undefined

function textOf(node: XmlNode): string {
  if (node === undefined || node === null) return ''
  if (Array.isArray(node)) return textOf(node[0])
  if (typeof node === 'object') return textOf(node['#text'] as XmlNode)
  return String(node)
}

function atomLink(node: XmlNode): string {
  const links = Array.isArray(node) ? node : node ? [node] : []
  const typed = links.filter((link): link is { [key: string]: unknown } => typeof link === 'object' && link !== null)
  const preferred = typed.find((link) => !link['@_rel'] || link['@_rel'] === 'alternate') ?? typed[0]
  if (preferred) return String(preferred['@_href'] ?? '')
  return textOf(node)
}

export function parseFeed(xml: string, baseUrl: string, max: number): { format: string; items: ParsedItem[]; title: string } {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', trimValues: true, processEntities: true, htmlEntities: true })
  let doc: Record<string, unknown>
  try {
    doc = parser.parse(xml)
  } catch {
    throw new ParseError('Le contenu n’est pas un XML valide.')
  }

  const rss = doc.rss as { channel?: Record<string, unknown> } | undefined
  const atom = doc.feed as Record<string, unknown> | undefined
  const rdf = doc['rdf:RDF'] as Record<string, unknown> | undefined

  const toArray = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : []) as Record<string, XmlNode>[]

  if (rss?.channel) {
    const channel = rss.channel
    const items = toArray(channel.item).slice(0, max).map((item) => ({
      title: clean(stripHtml(textOf(item.title)), 200),
      link: absoluteHttpUrl(textOf(item.link) || textOf(item.guid), baseUrl),
      date: normalizeDate(textOf(item.pubDate) || textOf(item['dc:date'])),
      summary: stripHtml(textOf(item.description) || textOf(item['content:encoded'])),
      guid: textOf(item.guid) || undefined,
    }))
    return { format: 'RSS 2.0', items, title: clean(textOf(channel.title as XmlNode), 120) }
  }
  if (atom) {
    const items = toArray(atom.entry).slice(0, max).map((item) => ({
      title: clean(stripHtml(textOf(item.title)), 200),
      link: absoluteHttpUrl(atomLink(item.link), baseUrl),
      date: normalizeDate(textOf(item.published) || textOf(item.updated)),
      summary: stripHtml(textOf(item.summary) || textOf(item.content)),
      guid: textOf(item.id) || undefined,
    }))
    return { format: 'Atom 1.0', items, title: clean(textOf(atom.title as XmlNode), 120) }
  }
  if (rdf) {
    const items = toArray(rdf.item).slice(0, max).map((item) => ({
      title: clean(stripHtml(textOf(item.title)), 200),
      link: absoluteHttpUrl(textOf(item.link), baseUrl),
      date: normalizeDate(textOf(item['dc:date'])),
      summary: stripHtml(textOf(item.description)),
    }))
    return { format: 'RSS 1.0 (RDF)', items, title: clean(textOf((rdf.channel as Record<string, XmlNode> | undefined)?.title), 120) }
  }
  throw new ParseError('XML valide, mais ce n’est ni un flux RSS, ni Atom, ni RDF (balise racine rss, feed ou rdf:RDF introuvable).')
}

export type WebParseReport = { items: ParsedItem[]; matchedItems: number; withTitle: number; withLink: number }

export function parseWeb(html: string, config: ConnectorConfig, baseUrl: string): WebParseReport {
  const $ = cheerio.load(html)
  const { itemSelector, titleSelector, linkSelector, dateSelector, summarySelector } = config.web
  let elements: ReturnType<typeof $>
  try {
    elements = $(itemSelector)
  } catch {
    throw new ParseError(`Le sélecteur d’éléments « ${itemSelector} » n’est pas un sélecteur CSS valide.`)
  }

  const items: ParsedItem[] = []
  let withTitle = 0
  let withLink = 0
  const matchedItems = elements.length

  try {
    elements.slice(0, config.http.maxItems).each((_, node) => {
      const element = $(node)
      const pick = (selector: string) => (selector ? (element.is(selector) ? element : element.find(selector)).first() : element.slice(0, 0))
      const titleNode = pick(titleSelector)
      const linkNode = pick(linkSelector)
      const dateNode = pick(dateSelector)
      const summaryNode = pick(summarySelector)

      const href = linkNode.attr('href') ?? linkNode.find('a[href]').first().attr('href') ?? linkNode.closest('a[href]').attr('href') ?? ''
      const title = clean(titleNode.text() || titleNode.attr('title') || '', 200)
      const link = absoluteHttpUrl(href, baseUrl)
      if (title) withTitle += 1
      if (link) withLink += 1
      items.push({
        title,
        link,
        date: normalizeDate(dateNode.attr('datetime') ?? dateNode.text()),
        summary: clean(summaryNode.text()),
      })
    })
  } catch {
    throw new ParseError('Un des sélecteurs CSS (titre, lien, date ou résumé) n’est pas valide.')
  }
  return { items, matchedItems, withTitle, withLink }
}

export function resolvePath(data: unknown, path: string): unknown {
  if (!path) return data
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let current: unknown = data
  for (const token of tokens) {
    if (current === null || typeof current !== 'object') return undefined
    if (token === '__proto__' || token === 'constructor' || token === 'prototype') return undefined
    current = (current as Record<string, unknown>)[token]
  }
  return current
}

const scalar = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')

export type ApiParseReport = { items: ParsedItem[]; total: number; withTitle: number; withLink: number }

export function parseApi(json: unknown, config: ConnectorConfig, baseUrl: string): ApiParseReport {
  const list = resolvePath(json, config.api.itemsPath)
  if (list === undefined) throw new ParseError(`Le chemin « ${config.api.itemsPath || '(racine)'} » est introuvable dans la réponse.`)
  if (!Array.isArray(list)) throw new ParseError(`Le chemin « ${config.api.itemsPath || '(racine)'} » pointe vers ${typeof list === 'object' ? 'un objet' : 'une valeur simple'} et non vers une liste.`)

  let withTitle = 0
  let withLink = 0
  const items = list.slice(0, config.http.maxItems).map((entry) => {
    const title = clean(stripHtml(scalar(resolvePath(entry, config.api.titlePath))), 200)
    const link = absoluteHttpUrl(scalar(resolvePath(entry, config.api.linkPath)), baseUrl)
    if (title) withTitle += 1
    if (link) withLink += 1
    return {
      title,
      link,
      date: normalizeDate(config.api.datePath ? resolvePath(entry, config.api.datePath) : ''),
      summary: config.api.summaryPath ? stripHtml(scalar(resolvePath(entry, config.api.summaryPath))) : '',
    }
  })
  return { items, total: list.length, withTitle, withLink }
}
