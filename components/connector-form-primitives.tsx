'use client'

import { fieldClass } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
      <header>
        <h3 className="text-sm font-semibold tracking-[-0.01em]">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-sm font-medium', className)}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal leading-5 text-muted-foreground">{hint}</span>}
    </label>
  )
}

export function NumberField({ label, hint, value, min, max, suffix, disabled, onChange }: { label: string; hint?: string; value: number; min: number; max: number; suffix?: string; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      <span className="relative block">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          disabled={disabled}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? Number.NaN : Math.trunc(Number(event.target.value)))}
          className={cn(fieldClass, suffix && 'pr-12')}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </Field>
  )
}

export const monoField = cn(fieldClass, 'font-mono text-[13px]')
