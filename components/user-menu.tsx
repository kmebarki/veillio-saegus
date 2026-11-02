'use client'

import { LogOut, UserRoundCog } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { getUserProfile } from '@/app/actions/profile'
import { signOutAction } from '@/app/actions/session'
import { UserAvatar } from '@/components/user-avatar'
import { UserProfileDialog } from '@/components/user-profile-dialog'
import { authClient } from '@/lib/auth-client'
import type { UserProfile } from '@/lib/profile'
import { useViewer } from '@/lib/use-viewer'

function initialsOf(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return (email[0] ?? '?').toUpperCase()
  return parts.slice(0, 2).map((part) => part[0]!.toUpperCase()).join('')
}

export function UserMenu() {
  const { data: session, isPending } = authClient.useSession()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function logout() {
    setSigningOut(true)
    const result = await signOutAction()
    if (!result.ok) {
      await authClient.signOut().catch(() => undefined)
    }
    window.location.assign('/sign-in')
  }

  async function openProfile() {
    if (!email || loadingProfile) return
    setProfileError('')
    setLoadingProfile(true)
    const result = await getUserProfile({ email })
    setLoadingProfile(false)
    if (!result.ok) {
      setProfileError(result.message)
      return
    }
    setOpen(false)
    setProfile(result.profile)
  }

  const { viewer, isLoading } = useViewer()
  const user = session?.user
  const name = viewer?.name ?? user?.name ?? ''
  const email = viewer?.email ?? user?.email ?? ''
  const roleLabel = viewer?.roleLabel

  if (isPending || (isLoading && !viewer)) return <span className="ml-1 size-9 animate-pulse rounded-full bg-muted" aria-hidden />

  return (
    <div ref={containerRef} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={name ? `Menu du compte de ${name}` : 'Menu du compte'}
        className="rounded-full outline-none ring-offset-background transition-shadow hover:ring-2 hover:ring-ring/30 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UserAvatar image={user?.image} initials={initialsOf(name, email)} name={name} />
      </button>

      {open && (
        <div id={menuId} role="menu" className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          <div className="border-b px-4 py-3">
            <p className="truncate text-sm font-semibold">{name || 'Mon compte'}</p>
            {email && <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>}
            {roleLabel && <p className="mt-2 inline-flex rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">{roleLabel}</p>}
          </div>
          <div className="flex flex-col gap-1 p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={openProfile}
              disabled={loadingProfile || !email}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:opacity-60"
            >
              <UserRoundCog className="size-4" />
              {loadingProfile ? 'Chargement du compte…' : 'Compte et environnement'}
            </button>
            {profileError && <p role="alert" className="px-3 py-1 text-xs text-destructive">{profileError}</p>}
            <div className="my-0.5 border-t" />
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:opacity-60"
            >
              <LogOut className="size-4" />
              {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
          </div>
        </div>
      )}

      {profile && (
        <UserProfileDialog
          profile={profile}
          onClose={() => setProfile(null)}
          onSaved={() => window.location.reload()}
        />
      )}
    </div>
  )
}
