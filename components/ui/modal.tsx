'use client'

import { X } from 'lucide-react'
import { useEffect, useId } from 'react'

import { Button } from '@/components/ui/button'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  size?: 'md' | 'xl'
  bare?: boolean
}

export function Modal({ open, onClose, title, description, children, size = 'md', bare = false }: ModalProps) {
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

  const width = size === 'xl' ? 'max-w-4xl' : 'max-w-lg'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-3 backdrop-blur-sm sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative max-h-[92dvh] w-full ${width} overflow-y-auto rounded-3xl border bg-card shadow-2xl ${bare ? '' : 'p-6'}`}
      >
        {bare ? (
          <>
            <h2 id={titleId} className="sr-only">{title}</h2>
            <Button variant="ghost" size="icon" aria-label="Fermer" className="absolute right-4 top-4 z-10 rounded-full bg-card/70 backdrop-blur" onClick={onClose}><X /></Button>
            {children}
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
                {description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>}
              </div>
              <Button variant="ghost" size="icon" aria-label="Fermer" onClick={onClose}><X /></Button>
            </div>
            <div className="mt-6">{children}</div>
          </>
        )}
      </div>
    </div>
  )
}

export const fieldClass = 'h-11 w-full rounded-xl border bg-background px-3 text-sm font-normal outline-none focus:border-ring focus:ring-2 focus:ring-ring/20'
