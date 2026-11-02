'use client'

import { Globe, ImageUp, LoaderCircle, Trash2 } from 'lucide-react'
import { useId, useRef, useState, useTransition } from 'react'

import { fetchSiteLogo } from '@/app/actions/connectors'
import { ConnectorLogo } from '@/components/connector-ui'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/modal'
import type { ConnectorKind } from '@/lib/connector-catalog'

const OUTPUT_SIZE = 128
const MAX_FILE_BYTES = 5 * 1024 * 1024

async function fileToLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Le fichier doit être une image (PNG, JPG, SVG, WebP…).')
  if (file.size > MAX_FILE_BYTES) throw new Error('L’image dépasse 5 Mo.')
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Impossible de lire cette image.'))
      element.src = objectUrl
    })
    const ratio = Math.min(OUTPUT_SIZE / (image.naturalWidth || OUTPUT_SIZE), OUTPUT_SIZE / (image.naturalHeight || OUTPUT_SIZE))
    const width = Math.max(1, Math.round((image.naturalWidth || OUTPUT_SIZE) * ratio))
    const height = Math.max(1, Math.round((image.naturalHeight || OUTPUT_SIZE) * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Impossible de traiter cette image.')
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

type Props = {
  kind: ConnectorKind
  value: string
  sourceUrl: string
  onChange: (logoUrl: string) => void
  disabled?: boolean
}

export function ConnectorLogoField({ kind, value, sourceUrl, onChange, disabled }: Props) {
  const inputId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [isFetching, startFetching] = useTransition()
  const [isReading, setIsReading] = useState(false)
  const [urlText, setUrlText] = useState('')
  const isExternal = value.startsWith('https://')

  async function handleFile(file: File | undefined) {
    if (!file) return
    setMessage('')
    setIsReading(true)
    try {
      onChange(await fileToLogo(file))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Impossible de lire cette image.')
    } finally {
      setIsReading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function fetchFromSite() {
    setMessage('')
    startFetching(async () => {
      const result = await fetchSiteLogo({ url: sourceUrl })
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      onChange(result.logoUrl)
      setMessage(`Logo récupéré depuis ${result.host}.`)
    })
  }

  const busy = isFetching || isReading

  return (
    <div className="flex flex-col gap-2 text-xs font-medium">
      <span id={`${inputId}-label`}>Logo (facultatif)</span>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-labelledby={`${inputId}-label`}>
        <ConnectorLogo kind={kind} logoUrl={value} className="size-14 rounded-xl" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => fileInput.current?.click()}>
            {isReading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
            Importer une image
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy || sourceUrl.trim().length === 0} onClick={fetchFromSite}>
            {isFetching ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Globe className="size-4" aria-hidden />}
            Récupérer depuis le site
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={() => { setMessage(''); onChange('') }}>
              <Trash2 className="size-4" aria-hidden />
              Retirer
            </Button>
          )}
        </div>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="sr-only" tabIndex={-1} aria-label="Importer un logo" onChange={(event) => void handleFile(event.target.files?.[0])} />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="font-normal text-muted-foreground">Ou collez l’adresse d’une image (https)</span>
        <input
          type="url"
          inputMode="url"
          maxLength={500}
          disabled={disabled}
          value={isExternal ? value : urlText}
          onChange={(event) => {
            const next = event.target.value.trim()
            setUrlText(next)
            onChange(/^https:\/\/\S+$/.test(next) ? next : '')
          }}
          className={fieldClass}
          placeholder="https://exemple.fr/logo.png"
        />
      </label>
      <p className="min-h-4 text-xs font-normal text-muted-foreground" role="status" aria-live="polite">
        {message || 'Importé, il est redimensionné automatiquement. Le logo du site est récupéré à partir de l’adresse de la section Source.'}
      </p>
    </div>
  )
}
