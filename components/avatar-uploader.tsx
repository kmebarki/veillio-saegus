'use client'

import { Camera, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { UserAvatar } from '@/components/user-avatar'
import { Button } from '@/components/ui/button'

const OUTPUT_SIZE = 256
const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

async function resizeToSquare(file: File) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponible')
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

type Props = {
  value: string | null
  initials: string
  name: string
  onChange: (image: string | null) => void
}

export function AvatarUploader({ value, initials, name, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    if (!ACCEPTED_TYPES.includes(file.type)) return setError('Format non pris en charge. Utilisez JPEG, PNG ou WebP.')
    if (file.size > MAX_SOURCE_BYTES) return setError('L’image dépasse 8 Mo.')
    setBusy(true)
    try {
      onChange(await resizeToSquare(file))
    } catch {
      setError('Impossible de lire cette image.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <UserAvatar image={value} initials={initials} name={name} className="size-20 text-xl" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept={ACCEPTED_TYPES.join(',')} className="sr-only" onChange={handleFile} aria-label="Choisir une photo de profil" tabIndex={-1} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Camera data-icon="inline-start" />{value ? 'Changer la photo' : 'Ajouter une photo'}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Trash2 data-icon="inline-start" />Retirer
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP. L’image est recadrée en carré.</p>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
