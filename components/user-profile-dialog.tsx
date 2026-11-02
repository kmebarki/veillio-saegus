'use client'

import { Pencil } from 'lucide-react'
import { useState, useTransition } from 'react'

import { saveUserProfile } from '@/app/actions/profile'
import { ProfileFields } from '@/components/profile-fields'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { ProfileValues, UserProfile } from '@/lib/profile'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[170px_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="text-sm">{value || <span className="text-muted-foreground">Non renseigné</span>}</dd>
    </div>
  )
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

  return (
    <Modal open onClose={onClose} title={`${profile.firstName} ${profile.lastName}`.trim() || 'Fiche utilisateur'} description={profile.email}>
      {editing ? (
        <form className="flex flex-col gap-5" onSubmit={submit}>
          <ProfileFields value={values} onChange={setValues} />
          {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(false)}>Annuler</Button><Button type="submit" disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer'}</Button></div>
        </form>
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="flex flex-col gap-3">
            <Row label="Civilité" value={profile.civility} />
            <Row label="Prénom" value={profile.firstName} />
            <Row label="Nom" value={profile.lastName} />
            <Row label="Ville" value={profile.city} />
            <Row label="Pays" value={profile.country} />
            <Row label="Profession" value={profile.profession} />
            <Row label="Raison sociale" value={profile.company} />
            <Row label="Adresse" value={[profile.addressLine1, profile.addressLine2].filter(Boolean).join(', ')} />
            <Row label="Code postal" value={profile.postalCode} />
            <Row label="Téléphone" value={profile.phone} />
          </dl>
          <dl className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4">
            <Row label="Rôle" value={profile.role} />
            <Row label="Équipe" value={profile.team} />
            <Row label="Statut" value={profile.status} />
            <Row label="Dernière activité" value={profile.lastSeen} />
            <Row label="Compte créé le" value={profile.createdAt} />
          </dl>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Fermer</Button>{profile.canEdit && <Button onClick={() => setEditing(true)}><Pencil data-icon="inline-start" />Modifier la fiche</Button>}</div>
        </div>
      )}
    </Modal>
  )
}
