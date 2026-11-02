'use client'

import { X } from 'lucide-react'
import { useEffect, useId } from 'react'

import { Button } from '@/components/ui/button'

export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode }) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" aria-label="Fermer" onClick={onClose}><X /></Button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

export const fieldClass = 'h-11 w-full rounded-xl border bg-background px-3 text-sm font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/20'
