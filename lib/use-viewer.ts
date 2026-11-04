'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'

export type ViewerInfo = {
  id: string
  name: string
  firstName: string
  email: string
  role: string
  roleLabel: string
  permissions: string[]
  access: { organizations: boolean; users: boolean; teams: boolean; groups: boolean; connectors: boolean; connections: boolean; collections: boolean }
}

async function fetchViewer(url: string): Promise<ViewerInfo | null> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) return null
  const body = (await response.json()) as { viewer: ViewerInfo | null }
  return body.viewer
}

export function useViewer() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const { data, isLoading } = useSWR(mounted ? '/api/viewer' : null, fetchViewer, {
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  })

  return { viewer: data ?? null, isLoading: !mounted || isLoading }
}
