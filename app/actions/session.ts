'use server'

import { headers } from 'next/headers'

import { auth } from '@/lib/auth'

export async function signOutAction() {
  try {
    await auth.api.signOut({ headers: await headers() })
    return { ok: true as const }
  } catch (error) {
    console.error('Sign out failed', error instanceof Error ? error.message : error)
    return { ok: false as const }
  }
}
