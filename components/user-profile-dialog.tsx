'use client'

import { CalendarDays, Clock, Mail, MapPin, Pencil, Phone, ShieldCheck, UserRound, Users, type LucideIcon } from 'lucide-react'
import { useState, useTransition } from 'react'

import { saveUserProfile } from '@/app/actions/profile'
import { ProfileFields } from '@/components/profile-fields'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { ProfileValues, UserProfile } from '@/lib/profile'

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <header className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-[18px]" aria-hidden /></span>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </header>
      {children}
    </section>
  )
}

function Field({ label, value, required, className = '' }: { label: string; value: string; required?: boolean; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <dt className="text-xs font-medium text-muted-foreground">{label}{required && <span className="text-primary"> *</span>}</dt>
      <dd className="break-words text-sm font-medium">{value || <span className="font-normal italic text-muted-foreground">Non renseigné</span>}</dd>
    </div>
  )
}

function AccessRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm font-medium">{children}</dd>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const active = status === 'Actif'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${active ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive'}`}>
      <span className={`size-1.5 rounded-full ${active ? 'bg-primary' : 'bg-destructive'}`} />
      {status}
    </span>
  )
}

function initialsOf(profile: UserProfile) {
  const letters = `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.trim()
  return (letters || profile.email.charAt(0)).toUpperCase()
}

export function UserProfileDialog({ profile, onClose, onSaved }: { profile: UserProfile; onClose: () => void; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<ProfileValues>({
    civility: profile.civility, firstName: profile.firstName, lastName: profile.lastName, city: profile.city, country: profile.country,
    profession: profile.profession, company: profile.company, addressLine1: profile.addressLine1, addressLine2: profile.addressLine2,
    postalCode: profile.postalCode, phone: profile.phone,
  })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await saveUserProfile({ userId: profile.id, ...values })
      if (!result.ok) {
        setError(result.message)
        return
      }
      onSaved(result.message)
      onClose()
    })
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim()
  const address = [profile.addressLine1, profile.addressLine2].filter(Boolean).join(' — ')

  return (
    <Modal open onClose={onClose} title={fullName || 'Fiche utilisateur'} size="xl" bare>
      <div className="relative overflow-hidden border-b bg-gradient-to-br from-accent via-card to-card px-6 pb-6 pt-8 sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground shadow-sm" aria-hidden>{initialsOf(profile)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{profile.civility || 'Fiche utilisateur'}</p>
            <h2 aria-hidden className="mt-1 font-serif text-4xl leading-tight tracking-tight text-balance sm:text-5xl">
              {profile.firstName} <em className="text-primary">{profile.lastName}</em>
              {!fullName && <span>{profile.email}</span>}
            </h2>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Mail className="size-4" aria-hidden />{profile.email}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"><ShieldCheck className="size-3.5" aria-hidden />{profile.role}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"><Users className="size-3.5" aria-hidden />{profile.team}</span>
          <StatusPill status={profile.status} />
        </div>
      </div>

      <div className="grid gap-4 bg-background/60 p-4 sm:p-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          {editing ? (
            <Section icon={Pencil} title="Modifier la fiche">
              <form id="profile-form" className="flex flex-col gap-4" onSubmit={submit}>
                <ProfileFields value={values} onChange={setValues} />
                {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
              </form>
            </Section>
          ) : (
            <>
              <Section icon={UserRound} title="Identité">
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Field label="Civilité" value={profile.civility} required />
                  <Field label="Prénom" value={profile.firstName} required />
                  <Field label="Nom" value={profile.lastName} required />
                </dl>
                <dl className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
                  <Field label="Profession" value={profile.profession} />
                  <Field label="Raison sociale" value={profile.company} />
                </dl>
              </Section>
              <Section icon={MapPin} title="Localisation">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Ville" value={profile.city} required />
                  <Field label="Pays" value={profile.country} required />
                  <Field label="Adresse" value={address} className="sm:col-span-2" />
                  <Field label="Code postal" value={profile.postalCode} />
                </dl>
              </Section>
              <Section icon={Phone} title="Coordonnées">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Téléphone" value={profile.phone} />
                  <Field label="E-mail" value={profile.email} />
                </dl>
              </Section>
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Section icon={ShieldCheck} title="Accès et activité">
            <dl className="flex flex-col gap-4">
              <AccessRow icon={ShieldCheck} label="Rôle">{profile.role}</AccessRow>
              <AccessRow icon={Users} label="Équipe">{profile.team}</AccessRow>
              <AccessRow icon={Clock} label="Dernière activité">{profile.lastSeen}</AccessRow>
              <AccessRow icon={CalendarDays} label="Compte créé le">{profile.createdAt}</AccessRow>
            </dl>
          </Section>
        </aside>
      </div>

      <footer className="sticky bottom-0 flex justify-end gap-2 border-t bg-card/95 px-4 py-4 backdrop-blur sm:px-6">
        {editing ? (
          <>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
            <Button type="submit" form="profile-form" disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>Fermer</Button>
            {profile.canEdit && <Button onClick={() => setEditing(true)}><Pencil data-icon="inline-start" />Modifier la fiche</Button>}
          </>
        )}
      </footer>
    </Modal>
  )
}
