import { NextResponse } from 'next/server'

import { getCollectionsOverview } from '@/app/actions/collections'

export const dynamic = 'force-dynamic'

export async function GET() {
  const overview = await getCollectionsOverview()
  return NextResponse.json(overview, { headers: { 'Cache-Control': 'no-store' } })
}
