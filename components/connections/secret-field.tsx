'use client'

import { CircleAlert, ClipboardPaste, Eye, EyeOff, Info, Lock, TriangleAlert, X } from 'lucide-react'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { inputClass } from '@/components/connections/helpers'
import type { SecretAnalysis, SecretIssue } from '@/lib/connection-secret'
import { cn } from '@/lib/utils'

const ISSUE_STYLES: Record<SecretIssue['level'], { icon: typeof Info; className: string }> = {
  error: { icon: CircleAlert, className: 'text-destructive' },
  warning: { icon: TriangleAlert, className: 'text-foreground' },
  info: { icon: Info, className: 'text-muted-foreground' },
}

type SecretFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  analysis: SecretAnalysis
  existingHint?: string | null
  replacing: boolean
  onReplacingChange: (replacing: boolean) => void
}

export function SecretField({ label, value, onChange, analysis, existingHint, replacing, onReplacingChange }: SecretFieldProps) {
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const [pasteError, setPasteError] = useState(false)
  const editingExisting = existingHint !== undefined

  if (editingExisting && !replacing) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Lock className="size-4" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm tracking-wider">••••••••••••{existingHint ? ` ${existingHint.split(' · ')[0]}` : ''}</p>
            <p className="text-xs text-muted-foreground">Chiffré et jamais réaffiché{existingHint?.includes('·') ? ` · ${existingHint.split(' · ')[1]}` : ''}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onReplacingChange(true)}>Remplacer</Button>
        </div>
      </div>
    )
  }

  async function paste() {
    setPasteError(false)
    try {
      onChange(await navigator.clipboard.readText())
      setRevealed(false)
    } catch {
      setPasteError(true)
    }
  }

  const hasError = analysis.issues.some((issue) => issue.level === 'error')

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{editingExisting ? `Nouveau ${label.toLowerCase()}` : label}</label>
        {editingExisting && <button type="button" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => { onReplacingChange(false); onChange('') }}>Conserver l’actuel</button>}
      </div>
      <div className="relative">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(inputClass, 'h-11 pr-28 font-mono tracking-wide', hasError && 'border-destructive focus:border-destructive focus:ring-destructive/20')}
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          aria-invalid={hasError}
          aria-describedby={`${id}-issues`}
          placeholder="Collez le secret ici"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {value && <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Effacer" onClick={() => onChange('')}><X /></Button>}
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Coller depuis le presse-papiers" onClick={paste}><ClipboardPaste /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={revealed ? 'Masquer le secret' : 'Afficher le secret'} aria-pressed={revealed} onClick={() => setRevealed((current) => !current)}>{revealed ? <EyeOff /> : <Eye />}</Button>
        </div>
      </div>
      <ul id={`${id}-issues`} aria-live="polite" className="flex flex-col gap-1">
        {pasteError && <li className="flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Le navigateur a refusé l’accès au presse-papiers : collez avec Ctrl/Cmd + V.</li>}
        {analysis.issues.map((issue) => {
          const { icon: Icon, className } = ISSUE_STYLES[issue.level]
          return <li key={issue.message} className={cn('flex items-start gap-1.5 text-xs leading-5', className)}><Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />{issue.message}</li>
        })}
        {!analysis.empty && analysis.valid && <li className="text-xs text-muted-foreground">{analysis.value.length} caractères · le secret sera chiffré avant stockage.</li>}
      </ul>
    </div>
  )
}
