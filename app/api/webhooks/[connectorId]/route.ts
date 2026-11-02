import { NextResponse } from 'next/server'

import { handleWebhookRequest } from '@/lib/connectors/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HARD_LIMIT_BYTES = 1024 * 1024 + 1024

export async function POST(request: Request, context: { params: Promise<{ connectorId: string }> }) {
  const { connectorId } = await context.params
  if (!UUID.test(connectorId)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > HARD_LIMIT_BYTES) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })

  const rawBody = await request.text()
  if (rawBody.length > HARD_LIMIT_BYTES) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  try {
    const result = await handleWebhookRequest({ connectorId, headers: request.headers, rawBody, sourceIp: forwarded })
    return NextResponse.json(result.body, { status: result.status, headers: result.headers })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export function GET() {
  return NextResponse.json({ error: 'method_not_allowed', message: 'Utilisez POST.' }, { status: 405, headers: { Allow: 'POST' } })
}
