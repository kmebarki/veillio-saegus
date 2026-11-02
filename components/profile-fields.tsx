'use client'

import { fieldClass } from '@/components/ui/modal'
import { CIVILITIES, type ProfileValues } from '@/lib/profile'

type Props = { value: ProfileValues; onChange: (value: ProfileValues) => void; fieldClassName?: string }

export function ProfileFields({ value, onChange, fieldClassName = fieldClass }: Props) {
  function bind(key: keyof ProfileValues) {
    return { value: value[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [key]: event.target.value }) }
  }
  const label = 'flex flex-col gap-1.5 text-sm font-medium'

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[150px_1fr_1fr]">
        <label className={label}>Civilité *
          <select required className={fieldClassName} autoComplete="honorific-prefix" {...bind('civility')}>
            <option value="">Choisir</option>
            {CIVILITIES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className={label}>Prénom *<input required maxLength={80} className={fieldClassName} autoComplete="given-name" {...bind('firstName')} /></label>
        <label className={label}>Nom *<input required maxLength={80} className={fieldClassName} autoComplete="family-name" {...bind('lastName')} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Ville *<input required maxLength={120} className={fieldClassName} autoComplete="address-level2" {...bind('city')} /></label>
        <label className={label}>Pays *<input required maxLength={120} className={fieldClassName} autoComplete="country-name" {...bind('country')} /></label>
      </div>
      <div className="flex flex-col gap-4 border-t pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Facultatif</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>Profession<input maxLength={120} className={fieldClassName} autoComplete="organization-title" {...bind('profession')} /></label>
          <label className={label}>Raison sociale<input maxLength={160} className={fieldClassName} autoComplete="organization" {...bind('company')} /></label>
        </div>
        <label className={label}>Adresse (ligne 1)<input maxLength={200} className={fieldClassName} autoComplete="address-line1" {...bind('addressLine1')} /></label>
        <label className={label}>Adresse (ligne 2)<input maxLength={200} className={fieldClassName} autoComplete="address-line2" {...bind('addressLine2')} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>Code postal<input maxLength={20} className={fieldClassName} autoComplete="postal-code" {...bind('postalCode')} /></label>
          <label className={label}>Téléphone<input type="tel" maxLength={25} pattern="[+0-9\s().\-]{6,25}" title="Numéro de téléphone valide" className={fieldClassName} autoComplete="tel" {...bind('phone')} /></label>
        </div>
      </div>
    </div>
  )
}
