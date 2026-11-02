import 'server-only'

import dns from 'node:dns/promises'

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

import type { ConnectorConfig } from '@/lib/connector-catalog'
import { normalizeDate, type ParsedItem } from '@/lib/connectors/parsers'
import { isBlockedIp } from '@/lib/connectors/safe-fetch'
import { TestReport, type TestResult } from '@/lib/connectors/test-types'

const LABELS = {
  config: 'Paramètres',
  dns: 'Résolution DNS',
  connect: 'Connexion sécurisée',
  auth: 'Authentification',
  folder: 'Dossier',
  search: 'Recherche des messages',
  parse: 'Lecture des messages',
}

const MAX_SOURCE_BYTES = 400_000
const TEST_MESSAGES = 5

export class ImapError extends Error {
  constructor(
    readonly step: keyof typeof LABELS,
    message: string,
  ) {
    super(message)
  }
}

type ImapLikeError = Error & { code?: string; authenticationFailed?: boolean; responseText?: string; serverResponseCode?: string; response?: string }

function describeError(error: unknown): ImapError {
  if (error instanceof ImapError) return error
  const err = error as ImapLikeError
  if (err.authenticationFailed) return new ImapError('auth', 'Identifiants refusés par le serveur. Vérifiez l’adresse, le mot de passe ; avec Gmail ou Microsoft, utilisez un mot de passe d’application.')
  const code = err.code ?? ''
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new ImapError('dns', 'Nom de serveur introuvable.')
  if (code === 'ECONNREFUSED') return new ImapError('connect', 'Connexion refusée : vérifiez le port et le mode de sécurité.')
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || /timeout/i.test(err.message)) return new ImapError('connect', 'Le serveur n’a pas répondu à temps.')
  if (/certificate|self.signed|CERT_|hostname/i.test(`${code} ${err.message}`)) return new ImapError('connect', 'Le certificat TLS du serveur n’est pas valide ou ne correspond pas au nom de domaine.')
  if (/mailbox|doesn't exist|nonexistent|no such/i.test(`${err.responseText ?? ''} ${err.message}`)) return new ImapError('folder', 'Dossier introuvable sur le serveur.')
  return new ImapError('connect', err.responseText || err.message || 'Erreur IMAP inattendue.')
}

async function resolveSafeAddress(host: string): Promise<string> {
  let addresses: { address: string }[]
  try {
    addresses = await dns.lookup(host, { all: true })
  } catch (error) {
    throw describeError(error)
  }
  if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new ImapError('dns', 'Le serveur pointe vers une adresse privée ou réservée : elle n’est pas autorisée.')
  }
  return addresses[0].address
}

function dateWithin(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function firstLink(text: string) {
  const match = text.match(/https:\/\/[^\s<>"')\]]+/i)
  return match ? match[0].replace(/[.,;]+$/, '') : ''
}

function excerpt(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 400)
}

function stripHtml(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

export type ImapCredentials = { user: string; password: string }

async function openClient(config: ConnectorConfig, credentials: ImapCredentials, report?: TestReport) {
  const { imap } = config
  const address = await resolveSafeAddress(imap.host)
  report?.push('dns', 'ok', `${imap.host} → ${address}`)

  const client = new ImapFlow({
    host: address,
    port: imap.port,
    secure: imap.security === 'tls',
    doSTARTTLS: imap.security === 'starttls' ? true : undefined,
    auth: { user: credentials.user, pass: credentials.password },
    tls: { servername: imap.host, minVersion: 'TLSv1.2', rejectUnauthorized: true },
    logger: false,
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 30_000,
    disableAutoIdle: true,
  })
  client.on('error', () => undefined)

  try {
    await client.connect()
  } catch (error) {
    const described = describeError(error)
    report?.push(described.step === 'auth' ? 'connect' : described.step, 'error', described.message)
    if (described.step === 'auth') {
      report?.push('connect', 'ok', `${imap.security === 'tls' ? 'TLS' : 'STARTTLS'} établi sur le port ${imap.port}.`)
    }
    throw described
  }
  report?.push('connect', 'ok', `${imap.security === 'tls' ? 'TLS' : 'STARTTLS'} établi sur le port ${imap.port}.`)
  report?.push('auth', 'ok', `Connecté en tant que ${credentials.user}.`)
  return client
}

async function readMessages(client: ImapFlow, config: ConnectorConfig, limit: number, report?: TestReport): Promise<{ items: ParsedItem[]; matched: number }> {
  const { imap } = config
  let lock
  try {
    lock = await client.getMailboxLock(imap.folder, { readOnly: true })
  } catch (error) {
    const described = describeError(error)
    const folderError = new ImapError('folder', described.step === 'folder' ? `Dossier « ${imap.folder} » introuvable.` : described.message)
    report?.push('folder', 'error', folderError.message)
    throw folderError
  }
  report?.push('folder', 'ok', `Dossier « ${imap.folder} » ouvert en lecture seule.`)

  try {
    const query: Record<string, unknown> = { since: dateWithin(imap.sinceDays) }
    if (imap.unreadOnly) query.seen = false
    if (imap.fromFilter) query.from = imap.fromFilter
    if (imap.subjectFilter) query.subject = imap.subjectFilter

    const found = (await client.search(query, { uid: true })) || []
    const matched = found.length
    const wanted = found.slice(-limit).reverse()
    report?.push('search', matched > 0 ? 'ok' : 'warning', matched > 0 ? `${matched} message${matched > 1 ? 's' : ''} correspondent aux filtres (${imap.sinceDays} derniers jours).` : 'Aucun message ne correspond aux filtres sur la période. Élargissez la période ou retirez un filtre.')
    if (wanted.length === 0) return { items: [], matched }

    const items: ParsedItem[] = []
    let unreadable = 0
    for await (const message of client.fetch(wanted, { uid: true, envelope: true, internalDate: true, source: { maxLength: MAX_SOURCE_BYTES } }, { uid: true })) {
      try {
        const parsed = message.source ? await simpleParser(message.source) : null
        const subject = (message.envelope?.subject || parsed?.subject || '').trim()
        const sender = message.envelope?.from?.[0]
        const senderName = sender?.name || sender?.address || ''
        const bodyText = (parsed?.text || (typeof parsed?.html === 'string' ? stripHtml(parsed.html) : '') || '').trim()
        const link = imap.linkMode === 'first_link' ? firstLink(bodyText) || firstLink(typeof parsed?.html === 'string' ? parsed.html : '') : ''
        const messageId = parsed?.messageId || `${imap.host}:${imap.folder}:${message.uid}`
        items.push({
          title: subject || '(sans objet)',
          link,
          date: normalizeDate(parsed?.date ?? message.internalDate ?? undefined),
          summary: excerpt(`${senderName ? `${senderName} — ` : ''}${bodyText}`),
          guid: messageId,
        })
      } catch {
        unreadable += 1
      }
    }
    report?.push('parse', unreadable > 0 ? 'warning' : 'ok', unreadable > 0 ? `${unreadable} message${unreadable > 1 ? 's' : ''} illisible${unreadable > 1 ? 's' : ''} ignoré${unreadable > 1 ? 's' : ''}.` : `${items.length} message${items.length > 1 ? 's' : ''} analysé${items.length > 1 ? 's' : ''} (objet, expéditeur, extrait${imap.linkMode === 'first_link' ? ', premier lien' : ''}).`)
    return { items, matched }
  } finally {
    lock.release()
  }
}

export async function testImap(config: ConnectorConfig, secret: string | null, username: string): Promise<TestResult> {
  const report = new TestReport(LABELS, secret)
  const order = ['config', 'dns', 'connect', 'auth', 'folder', 'search', 'parse']
  if (!secret || !username) {
    report.push('config', 'error', 'Adresse e-mail et mot de passe requis : ajoutez une connexion « Messagerie » avec l’adresse e-mail comme identifiant.')
    report.skip(order)
    return report.failure('Identifiants manquants.')
  }
  report.push('config', 'ok', `${config.imap.host}:${config.imap.port} · ${config.imap.security === 'tls' ? 'TLS implicite' : 'STARTTLS'} · dossier « ${config.imap.folder} ».`)

  let client: ImapFlow | null = null
  try {
    client = await openClient(config, { user: username, password: secret }, report)
    const { items, matched } = await readMessages(client, config, TEST_MESSAGES, report)
    return report.finish(items, matched)
  } catch (error) {
    const described = describeError(error)
    if (!report.checks.some((check) => check.status === 'error')) report.push(described.step, 'error', described.message)
    report.skip(order)
    report.checks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    return report.failure(described.message)
  } finally {
    if (client) await client.logout().catch(() => client?.close())
  }
}

export async function collectImap(config: ConnectorConfig, secret: string, username: string, limit: number) {
  const client = await openClient(config, { user: username, password: secret })
  try {
    return await readMessages(client, config, Math.max(1, Math.min(limit, 200)))
  } finally {
    await client.logout().catch(() => client.close())
  }
}
