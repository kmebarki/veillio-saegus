import type { ConnectionSummary } from '@/lib/connection-types'

export const EXPIRY_WARNING_DAYS = 14
export const STALE_SECRET_DAYS = 180

export const inputClass = 'h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20'

export type Tone = 'ok' | 'warning' | 'danger' | 'neutral'

export const TONE_CLASSES: Record<Tone, string> = {
  ok: 'bg-primary/10 text-primary',
  warning: 'bg-chart-4/15 text-foreground',
  danger: 'bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
}

export function expiryBadge(connection: Pick<ConnectionSummary, 'expiresAt' | 'expiresInDays'>): { label: string; tone: Tone } | null {
  const days = connection.expiresInDays
  if (days === null) return null
  if (days < 0) return { label: 'Expirée', tone: 'danger' }
  if (days === 0) return { label: 'Expire aujourd’hui', tone: 'danger' }
  if (days <= EXPIRY_WARNING_DAYS) return { label: `Expire dans ${days} j`, tone: 'warning' }
  return { label: `Expire le ${connection.expiresAt}`, tone: 'neutral' }
}

export function needsAttention(connection: ConnectionSummary) {
  return connection.health === 'error' || connection.health === 'warning' || !connection.testedCurrentVersion || (connection.expiresInDays !== null && connection.expiresInDays <= EXPIRY_WARNING_DAYS)
}

export function ageLabel(days: number) {
  if (days < 1) return 'aujourd’hui'
  if (days < 31) return `il y a ${days} j`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  return `il y a ${Math.floor(days / 365)} an${days >= 730 ? 's' : ''}`
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function inDaysIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}
