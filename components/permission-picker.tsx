'use client'

import { Check, Lock, Minus } from 'lucide-react'

import { PERMISSION_MODULES, ROLE_PERMISSIONS, normalizePermissions } from '@/lib/permissions'
import { ROLE_LABELS, type RoleKey } from '@/lib/roles'
import { cn } from '@/lib/utils'

type Props = {
  value: string[]
  onChange: (next: string[]) => void
  grantable: string[]
  disabled?: boolean
}

const PRESET_ROLES: RoleKey[] = ['reader', 'contributor', 'pilot', 'admin']

export function PermissionPicker({ value, onChange, grantable, disabled = false }: Props) {
  const selected = new Set(value)
  const allowed = new Set(grantable)

  function toggle(key: string) {
    if (disabled || !allowed.has(key)) return
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(normalizePermissions([...next]))
  }

  function toggleModule(keys: string[]) {
    if (disabled) return
    const usable = keys.filter((key) => allowed.has(key))
    if (usable.length === 0) return
    const next = new Set(selected)
    const everySelected = usable.every((key) => next.has(key))
    for (const key of usable) {
      if (everySelected) next.delete(key)
      else next.add(key)
    }
    onChange(normalizePermissions([...next]))
  }

  function applyPreset(role: RoleKey) {
    if (disabled) return
    const keep = value.filter((key) => !allowed.has(key))
    onChange(normalizePermissions([...keep, ...ROLE_PERMISSIONS[role].filter((key) => allowed.has(key))]))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Partir d’un rôle :</span>
        {PRESET_ROLES.map((role) => (
          <button key={role} type="button" disabled={disabled} onClick={() => applyPreset(role)} className="h-7 rounded-full border bg-card px-3 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50">
            {ROLE_LABELS[role]}
          </button>
        ))}
        <button type="button" disabled={disabled} onClick={() => onChange(value.filter((key) => !allowed.has(key)))} className="h-7 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
          Tout décocher
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {PERMISSION_MODULES.map((module) => {
          const keys = module.permissions.map((permission) => permission.key)
          const count = keys.filter((key) => selected.has(key)).length
          const usable = keys.filter((key) => allowed.has(key))
          const state = count === 0 ? 'none' : count === keys.length ? 'all' : 'some'
          return (
            <fieldset key={module.id} className="rounded-2xl border">
              <legend className="sr-only">{module.label}</legend>
              <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
                <h4 className="text-sm font-semibold">{module.label}</h4>
                <button
                  type="button"
                  disabled={disabled || usable.length === 0}
                  onClick={() => toggleModule(keys)}
                  aria-label={`Tout sélectionner dans ${module.label}`}
                  className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {count}/{keys.length}
                  <span className={cn('grid size-5 place-items-center rounded-md border', state !== 'none' && 'border-primary bg-primary text-primary-foreground')}>
                    {state === 'all' && <Check className="size-3.5" />}
                    {state === 'some' && <Minus className="size-3.5" />}
                  </span>
                </button>
              </div>
              <ul className="divide-y">
                {module.permissions.map((permission) => {
                  const checked = selected.has(permission.key)
                  const locked = !allowed.has(permission.key)
                  return (
                    <li key={permission.key}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={disabled || locked}
                        onClick={() => toggle(permission.key)}
                        className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors', !disabled && !locked && 'hover:bg-muted/40', (disabled || locked) && 'cursor-not-allowed opacity-60')}
                      >
                        <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border', checked && 'border-primary bg-primary text-primary-foreground')}>{checked && <Check className="size-3.5" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            {permission.label}
                            {permission.sensitive && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">Sensible</span>}
                            {locked && <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground"><Lock className="size-3" />Non accordable par vous</span>}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{permission.description}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          )
        })}
      </div>
    </div>
  )
}
