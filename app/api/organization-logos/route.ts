import { randomUUID } from 'node:crypto'

import { del, get, put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

import { requirePermission } from '@/lib/authorization'

const MAX_LOGO_SIZE = 2 * 1024 * 1024
const LOGO_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const LOGO_PREFIX = 'organizations/logos/'

async function isAuthorized(permission: 'organizations.view' | 'organizations.manage') {
  try {
    await requirePermission(permission)
    return true
  } catch {
    return false
  }
}

function getSafePathname(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get('pathname')
  return pathname?.startsWith(LOGO_PREFIX) ? pathname : null
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized('organizations.manage'))) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('logo')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Sélectionnez un fichier image.' }, { status: 400 })

  const extension = LOGO_TYPES.get(file.type)
  if (!extension) return NextResponse.json({ error: 'Formats acceptés : JPG, PNG ou WebP.' }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_LOGO_SIZE) return NextResponse.json({ error: 'Le logo doit peser moins de 2 Mo.' }, { status: 400 })

  const pathname = `${LOGO_PREFIX}${randomUUID()}.${extension}`
  const blob = await put(pathname, file, { access: 'private', contentType: file.type, addRandomSuffix: false })
  return NextResponse.json({ pathname: blob.pathname })
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized('organizations.view'))) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  const pathname = getSafePathname(request)
  if (!pathname) return NextResponse.json({ error: 'Fichier invalide.' }, { status: 400 })

  const result = await get(pathname, {
    access: 'private',
    ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
  })
  if (!result) return new NextResponse('Fichier introuvable.', { status: 404 })
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' } })

  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': result.blob.contentType ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-cache',
      ETag: result.blob.etag,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function DELETE(request: NextRequest) {
  if (!(await isAuthorized('organizations.manage'))) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
  const pathname = getSafePathname(request)
  if (!pathname) return NextResponse.json({ error: 'Fichier invalide.' }, { status: 400 })
  await del(pathname)
  return NextResponse.json({ ok: true })
}
