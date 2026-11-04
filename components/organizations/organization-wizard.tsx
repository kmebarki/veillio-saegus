'use client'

import { useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Bell, Building2, Check, CircleHelp, Globe2, ImagePlus, Menu, Save, Settings, ShieldCheck, UserRoundPlus, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { createOrganization, updateOrganization } from '@/app/actions/organizations'
import { ResponsibleUserPicker } from '@/components/organizations/responsible-user-picker'
import { Sidebar } from '@/components/veillio-dashboard'
import { UserMenu } from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CreateOrganizationInput, OrganizationListItem, OrganizationUserOption } from '@/lib/organization-types'
import { cn } from '@/lib/utils'

const steps = [
  { title: 'Identité', description: 'Nom, référence et domaine', icon: Building2 },
  { title: 'Coordonnées', description: 'Pays, langue et contact', icon: Globe2 },
  { title: 'Administration', description: 'Responsable et premier admin', icon: Users },
  { title: 'Statut et options', description: 'Activation et services', icon: ShieldCheck },
  { title: 'Confirmation', description: 'Contrôle avant création', icon: Check },
]

const initialForm: CreateOrganizationInput = {
  name: '',
  internalReference: '',
  type: 'client',
  primaryDomain: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  country: 'France',
  logoPathname: null,
  defaultLanguage: 'Français',
  timezone: 'Europe/Paris',
  contactEmail: '',
  phone: '',
  responsibleUserId: null,
  administrationScope: 'organization',
  initialStatus: 'to_configure',
  offer: '',
  miniSiteEnabled: false,
  inviteAdmin: false,
  adminFirstName: '',
  adminLastName: '',
  adminEmail: '',
}

const selectTriggerClass = 'h-10 w-full rounded-md'

function RequiredMark() {
  return <><span aria-hidden="true" className="text-primary">*</span><span className="sr-only"> (obligatoire)</span></>
}

function WizardStepper({ currentStep, isEditing, visibleSteps, onStepChange }: { currentStep: number; isEditing: boolean; visibleSteps: typeof steps; onStepChange: (step: number) => void }) {
  return (
    <nav aria-label={isEditing ? 'Sections de modification' : 'Étapes de création'} className="rounded-lg border bg-card p-3">
      {isEditing && <p className="mb-3 px-1 text-xs text-muted-foreground"><strong className="font-medium text-foreground">Modification rapide :</strong> ouvrez une section, ajustez les informations puis enregistrez directement.</p>}
      <ol className={cn('flex gap-2 overflow-x-auto lg:grid', isEditing ? 'lg:grid-cols-4' : 'lg:grid-cols-5')}>
        {visibleSteps.map((step, index) => {
          const Icon = step.icon
          const completed = !isEditing && index < currentStep
          const active = index === currentStep
          const content = <><span className={cn('grid size-8 shrink-0 place-items-center rounded-md border', active && 'border-primary-foreground/20 bg-primary-foreground/10', !active && 'border-border bg-background')}>{completed ? <Check className="size-4" /> : <Icon className="size-4" />}</span><span className="min-w-0"><strong className="block truncate text-sm font-semibold">{step.title}</strong><span className={cn('mt-0.5 hidden truncate text-xs xl:block', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{step.description}</span></span></>
          const stepClassName = cn('flex h-full w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors', active && 'bg-primary text-primary-foreground', !active && completed && 'bg-primary/8 text-primary', !active && !completed && 'text-muted-foreground', isEditing && !active && 'cursor-pointer hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')
          return (
            <li key={step.title} className="min-w-44 lg:min-w-0">
              {isEditing ? <button type="button" className={stepClassName} aria-current={active ? 'step' : undefined} onClick={() => onStepChange(index)}>{content}</button> : <div className={stepClassName} aria-current={active ? 'step' : undefined}>{content}</div>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function SelectField({ label, value, items, onChange, description, required = false }: { label: string; value: string; items: { value: string; label: string }[]; onChange: (value: string) => void; description?: string; required?: boolean }) {
  return (
    <Field>
      <FieldLabel>{label} {required && <RequiredMark />}</FieldLabel>
      <Select items={items} value={value} onValueChange={(nextValue) => nextValue && onChange(nextValue)}>
        <SelectTrigger className={selectTriggerClass} aria-required={required}><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}><SelectGroup>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col justify-between gap-1 border-b py-3 text-sm last:border-b-0 sm:flex-row sm:items-center"><span className="text-muted-foreground">{label}</span><strong className="font-medium sm:text-right">{value || 'Non renseigné'}</strong></div>
}

async function uploadOrganizationLogo(file: File) {
  const formData = new FormData()
  formData.append('logo', file)
  const response = await fetch('/api/organization-logos', { method: 'POST', body: formData })
  const result = await response.json() as { pathname?: string; error?: string }
  if (!response.ok || !result.pathname) throw new Error(result.error ?? 'Le téléversement du logo a échoué.')
  return result.pathname
}

async function removeOrganizationLogo(pathname: string) {
  await fetch(`/api/organization-logos?pathname=${encodeURIComponent(pathname)}`, { method: 'DELETE' })
}

export function OrganizationWizard({ organization }: { organization?: OrganizationListItem }) {
  const router = useRouter()
  const isEditing = Boolean(organization)
  const visibleSteps = isEditing ? steps.slice(0, -1) : steps
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [form, setForm] = useState<CreateOrganizationInput>(() => organization ? {
    name: organization.name,
    internalReference: organization.internalReference ?? '',
    type: organization.type,
    primaryDomain: organization.primaryDomain ?? '',
    addressLine1: organization.addressLine1 ?? '',
    addressLine2: organization.addressLine2 ?? '',
    postalCode: organization.postalCode ?? '',
    city: organization.city ?? '',
    country: organization.country,
    logoPathname: organization.logoPathname,
    defaultLanguage: organization.defaultLanguage,
    timezone: organization.timezone,
    contactEmail: organization.contactEmail ?? '',
    phone: organization.phone ?? '',
    responsibleUserId: organization.responsibleUserId,
    administrationScope: organization.administrationScope,
    initialStatus: organization.status === 'suspended' ? 'suspended' : organization.setupStatus,
    offer: organization.offer ?? '',
    miniSiteEnabled: organization.miniSiteEnabled,
    inviteAdmin: false,
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
  } : initialForm)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [selectedResponsible, setSelectedResponsible] = useState<OrganizationUserOption | null>(() => organization?.responsibleUserId ? { id: organization.responsibleUserId, name: organization.responsibleName ?? 'Responsable actuel', email: '' } : null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof CreateOrganizationInput>(key: K, value: CreateOrganizationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function getStepError() {
    if (currentStep === 0) {
      if (form.name.trim().length < 2) return 'Renseignez un nom d’organisation valide.'
      if (!/^[a-zA-Z0-9_-]{2,40}$/.test(form.internalReference.trim())) return 'La référence interne doit contenir 2 à 40 lettres, chiffres, tirets ou underscores.'
      if (!/^(?!-)(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(form.primaryDomain.trim())) return 'Renseignez un domaine principal valide, par exemple entreprise.fr.'
    }
    if (currentStep === 1) {
      if (form.postalCode.trim().length < 2 || form.city.trim().length < 2 || !form.country) return 'Le code postal, la ville et le pays sont requis.'
      if (!form.defaultLanguage || !form.timezone) return 'La langue et le fuseau horaire sont requis.'
      if (form.contactEmail && !/^\S+@\S+\.\S+$/.test(form.contactEmail)) return 'L’adresse e-mail de contact est invalide.'
    }
    if (currentStep === 2 && form.inviteAdmin) {
      if (form.adminFirstName.trim().length < 2) return 'Renseignez le prénom du premier administrateur.'
      if (form.adminLastName.trim().length < 2) return 'Renseignez le nom du premier administrateur.'
      if (!/^\S+@\S+\.\S+$/.test(form.adminEmail)) return 'Renseignez une adresse e-mail administrateur valide.'
    }
    return ''
  }

  function goNext() {
    const stepError = getStepError()
    if (stepError) {
      setError(stepError)
      return
    }
    setCurrentStep((step) => Math.min(step + 1, visibleSteps.length - 1))
  }

  function submit() {
    if (!isEditing && !confirmed) {
      setError('Confirmez l’exactitude des informations avant de créer l’organisation.')
      return
    }
    setError('')
    startTransition(async () => {
      let uploadedLogoPathname: string | null = null
      try {
        if (logoFile) uploadedLogoPathname = await uploadOrganizationLogo(logoFile)
        const logoPathname = uploadedLogoPathname ?? form.logoPathname
        const result = organization
          ? await updateOrganization(organization.id, { ...form, logoPathname })
          : await createOrganization({ ...form, logoPathname })
        if (!result.ok) {
          if (uploadedLogoPathname) await removeOrganizationLogo(uploadedLogoPathname)
          setError(result.message)
          return
        }
        if (organization?.logoPathname && uploadedLogoPathname && organization.logoPathname !== uploadedLogoPathname) await removeOrganizationLogo(organization.logoPathname)
        setToast(result.message)
        window.setTimeout(() => {
          router.push('/admin/organizations')
          router.refresh()
        }, 900)
      } catch (submissionError) {
        if (uploadedLogoPathname) await removeOrganizationLogo(uploadedLogoPathname)
        setError(submissionError instanceof Error ? submissionError.message : isEditing ? 'La modification de l’organisation a échoué.' : 'La création de l’organisation a échoué.')
      }
    })
  }

  const responsibleName = selectedResponsible?.name ?? 'Non attribué'

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Organisations" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Administration <span className="px-2">/</span> Organisations <span className="px-2">/</span> <strong className="font-medium text-foreground">{isEditing ? 'Modifier' : 'Nouvelle'}</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><UserMenu /></div>
        </header>

        <main className="mx-auto max-w-[1250px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section><Button render={<Link href="/admin/organizations" />} nativeButton={false} variant="ghost" className="-ml-2 mb-3"><ArrowLeft data-icon="inline-start" />Retour aux organisations</Button><p className="mb-2 text-xs font-medium text-primary">{isEditing ? 'Mise à jour guidée' : 'Création guidée'}</p><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">{isEditing ? `Modifier ${organization?.name}` : 'Nouvelle organisation'}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{isEditing ? 'Mettez à jour les informations, le périmètre et le statut de cette organisation.' : 'Configurez le périmètre, l’administration et l’état initial de la nouvelle organisation.'}</p></section>

            <div className="flex flex-col gap-4">
              <WizardStepper currentStep={currentStep} isEditing={isEditing} visibleSteps={visibleSteps} onStepChange={(step) => { setCurrentStep(step); setError('') }} />
              <section className="rounded-lg border bg-card shadow-sm">
                <div className="flex flex-col gap-3 border-b px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{isEditing ? 'Section' : 'Étape'} {currentStep + 1} sur {visibleSteps.length}</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">{visibleSteps[currentStep].title}</h2><p className="mt-1 text-sm text-muted-foreground">{visibleSteps[currentStep].description}</p></div><p className="shrink-0 text-xs text-muted-foreground"><RequiredMark /> Champs obligatoires</p></div>
                <div className="px-5 py-6 sm:px-7">
                  {currentStep === 0 && (
                    <FieldGroup>
                      <div className="grid gap-5 md:grid-cols-2">
                        <Field><FieldLabel htmlFor="organization-name">Nom de l’organisation <RequiredMark /></FieldLabel><Input id="organization-name" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex. Ministère de la Culture" className="h-10 rounded-md" required autoFocus /><FieldDescription>Nom affiché dans toute la plateforme.</FieldDescription></Field>
                        <Field><FieldLabel htmlFor="organization-reference">Référence interne <RequiredMark /></FieldLabel><Input id="organization-reference" value={form.internalReference} onChange={(event) => update('internalReference', event.target.value.toUpperCase())} placeholder="Ex. MCULT" className="h-10 rounded-md font-mono" required /><FieldDescription>Identifiant court, unique et stable.</FieldDescription></Field>
                      </div>
                      <SelectField label="Type d’organisation" value={form.type} onChange={(value) => update('type', value)} items={[{ value: 'client', label: 'Client' }, { value: 'internal', label: 'Interne' }, { value: 'partner', label: 'Partenaire' }]} required />
                      <Field><FieldLabel htmlFor="organization-domain">Domaine principal <RequiredMark /></FieldLabel><Input id="organization-domain" value={form.primaryDomain} onChange={(event) => update('primaryDomain', event.target.value.toLowerCase())} placeholder="entreprise.fr" className="h-10 rounded-md" required /><FieldDescription>Saisi sans protocole ni chemin.</FieldDescription></Field>
                      <Field><FieldLabel htmlFor="organization-logo">Logo</FieldLabel><label htmlFor="organization-logo" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-4 hover:bg-muted/40"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ImagePlus /></span><span><strong className="block text-sm font-medium">{logoFile?.name ?? 'Choisir un fichier'}</strong><span className="mt-1 block text-xs text-muted-foreground">JPG, PNG ou WebP · 2 Mo maximum</span></span></label><Input id="organization-logo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 2 * 1024 * 1024) { setError('Le logo doit peser moins de 2 Mo.'); event.target.value = ''; return } setLogoFile(file); setError('') }} /></Field>
                    </FieldGroup>
                  )}

                  {currentStep === 1 && (
                    <FieldGroup>
                      <Field><FieldLabel htmlFor="organization-address-1">Adresse — ligne 1 <span className="font-normal text-muted-foreground">(facultatif)</span></FieldLabel><Input id="organization-address-1" value={form.addressLine1} onChange={(event) => update('addressLine1', event.target.value)} placeholder="12 rue des Lilas" className="h-10 rounded-md" /></Field>
                      <Field><FieldLabel htmlFor="organization-address-2">Adresse — ligne 2 <span className="font-normal text-muted-foreground">(facultatif)</span></FieldLabel><Input id="organization-address-2" value={form.addressLine2} onChange={(event) => update('addressLine2', event.target.value)} placeholder="Bâtiment, étage, complément" className="h-10 rounded-md" /></Field>
                      <div className="grid gap-5 md:grid-cols-3"><Field><FieldLabel htmlFor="organization-postal-code">Code postal <RequiredMark /></FieldLabel><Input id="organization-postal-code" value={form.postalCode} onChange={(event) => update('postalCode', event.target.value)} autoComplete="postal-code" className="h-10 rounded-md" required /></Field><Field><FieldLabel htmlFor="organization-city">Ville <RequiredMark /></FieldLabel><Input id="organization-city" value={form.city} onChange={(event) => update('city', event.target.value)} autoComplete="address-level2" className="h-10 rounded-md" required /></Field><Field><FieldLabel htmlFor="organization-country">Pays <RequiredMark /></FieldLabel><Input id="organization-country" value={form.country} onChange={(event) => update('country', event.target.value)} autoComplete="country-name" className="h-10 rounded-md" required /></Field></div>
                      <div className="grid gap-5 md:grid-cols-2"><SelectField label="Langue par défaut" value={form.defaultLanguage} onChange={(value) => update('defaultLanguage', value)} items={[{ value: 'Français', label: 'Français' }, { value: 'English', label: 'English' }, { value: 'Deutsch', label: 'Deutsch' }, { value: 'Español', label: 'Español' }]} required /><SelectField label="Fuseau horaire" value={form.timezone} onChange={(value) => update('timezone', value)} items={[{ value: 'Europe/Paris', label: 'Europe/Paris · UTC+1' }, { value: 'Europe/London', label: 'Europe/London · UTC+0' }, { value: 'America/New_York', label: 'America/New_York · UTC-5' }, { value: 'Asia/Dubai', label: 'Asia/Dubai · UTC+4' }]} required /></div>
                      <div className="grid gap-5 md:grid-cols-2"><Field><FieldLabel htmlFor="organization-email">E-mail de contact</FieldLabel><Input id="organization-email" type="email" value={form.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} placeholder="contact@entreprise.fr" className="h-10 rounded-md" /></Field><Field><FieldLabel htmlFor="organization-phone">Téléphone</FieldLabel><Input id="organization-phone" type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+33 1 00 00 00 00" className="h-10 rounded-md" /></Field></div>
                    </FieldGroup>
                  )}

                  {currentStep === 2 && (
                    <FieldGroup>
                      <Field><FieldLabel>Responsable de l’organisation</FieldLabel><ResponsibleUserPicker selected={selectedResponsible} onChange={(user) => { setSelectedResponsible(user); update('responsibleUserId', user?.id ?? null) }} /><FieldDescription>Recherche progressive adaptée aux annuaires volumineux.</FieldDescription></Field>
                      <SelectField label="Périmètre d’administration" value={form.administrationScope} onChange={(value) => update('administrationScope', value)} items={[{ value: 'organization', label: 'Organisation uniquement' }, { value: 'global', label: 'Administration globale' }]} required />
                      {!isEditing && <div className="rounded-lg border bg-muted/30 p-4"><Field orientation="horizontal"><Checkbox id="invite-admin" checked={form.inviteAdmin} onCheckedChange={(checked) => update('inviteAdmin', checked === true)} /><FieldContent><FieldLabel htmlFor="invite-admin">Inviter le premier administrateur</FieldLabel><FieldDescription>Une invitation sécurisée valable 7 jours sera envoyée après la création.</FieldDescription></FieldContent></Field></div>}
                      {!isEditing && form.inviteAdmin && <div className="grid gap-5 rounded-lg border p-4 md:grid-cols-3"><Field><FieldLabel htmlFor="admin-first-name">Prénom <RequiredMark /></FieldLabel><Input id="admin-first-name" value={form.adminFirstName} onChange={(event) => update('adminFirstName', event.target.value)} autoComplete="given-name" className="h-10 rounded-md" required /></Field><Field><FieldLabel htmlFor="admin-last-name">Nom <RequiredMark /></FieldLabel><Input id="admin-last-name" value={form.adminLastName} onChange={(event) => update('adminLastName', event.target.value)} autoComplete="family-name" className="h-10 rounded-md" required /></Field><Field><FieldLabel htmlFor="admin-email">E-mail professionnel <RequiredMark /></FieldLabel><Input id="admin-email" type="email" value={form.adminEmail} onChange={(event) => update('adminEmail', event.target.value)} placeholder="admin@entreprise.fr" className="h-10 rounded-md" required /></Field></div>}
                    </FieldGroup>
                  )}

                  {currentStep === 3 && (
                    <FieldGroup>
                      <SelectField label="Statut initial" value={form.initialStatus} onChange={(value) => update('initialStatus', value as CreateOrganizationInput['initialStatus'])} items={[{ value: 'to_configure', label: 'À configurer' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspendue' }]} description="Le statut À configurer permet de préparer le périmètre avant son ouverture." required />
                      <SelectField label="Offre (facultatif)" value={form.offer || 'none'} onChange={(value) => update('offer', value === 'none' ? '' : value)} items={[{ value: 'none', label: 'Aucune offre attribuée' }, { value: 'essential', label: 'Essential' }, { value: 'business', label: 'Business' }, { value: 'enterprise', label: 'Enterprise' }]} />
                      <div className="rounded-lg border bg-muted/30 p-4"><Field orientation="horizontal"><Checkbox id="mini-site" checked={form.miniSiteEnabled} onCheckedChange={(checked) => update('miniSiteEnabled', checked === true)} /><FieldContent><FieldLabel htmlFor="mini-site">Activer le mini-site</FieldLabel><FieldDescription>Prépare un espace public personnalisable pour les publications de l’organisation.</FieldDescription></FieldContent></Field></div>
                    </FieldGroup>
                  )}

                  {currentStep === 4 && (
                    <div className="flex flex-col gap-5">
                      <div className="rounded-lg border bg-background px-4"><ReviewRow label="Organisation" value={`${form.name} · ${form.internalReference.toUpperCase()}`} /><ReviewRow label="Logo" value={logoFile?.name ?? 'Aucun logo'} /><ReviewRow label="Type et domaine" value={`${form.type === 'client' ? 'Client' : form.type === 'internal' ? 'Interne' : 'Partenaire'} · ${form.primaryDomain}`} /><ReviewRow label="Adresse" value={[form.addressLine1, form.addressLine2, `${form.postalCode} ${form.city}`.trim(), form.country].filter(Boolean).join(' · ')} /><ReviewRow label="Langue et fuseau" value={`${form.defaultLanguage} · ${form.timezone}`} /><ReviewRow label="Responsable" value={responsibleName} /><ReviewRow label="Périmètre" value={form.administrationScope === 'global' ? 'Administration globale' : 'Organisation uniquement'} /><ReviewRow label="Statut initial" value={form.initialStatus === 'active' ? 'Active' : form.initialStatus === 'suspended' ? 'Suspendue' : 'À configurer'} /><ReviewRow label="Offre" value={form.offer || 'Aucune'} />{!isEditing && <ReviewRow label="Premier administrateur" value={form.inviteAdmin ? `${form.adminFirstName} ${form.adminLastName} · ${form.adminEmail}` : 'Invitation désactivée'} />}<ReviewRow label="Mini-site" value={form.miniSiteEnabled ? 'Activé' : 'Désactivé'} /></div>
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><Field orientation="horizontal"><Checkbox id="confirm-organization" checked={confirmed} onCheckedChange={(checked) => { setConfirmed(checked === true); setError('') }} /><FieldContent><FieldLabel htmlFor="confirm-organization">Je confirme l’exactitude de ces informations <RequiredMark /></FieldLabel><FieldDescription>La référence interne et le domaine doivent rester uniques sur la plateforme.</FieldDescription></FieldContent></Field></div>
                    </div>
                  )}

                  {error && <p role="alert" className="mt-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
                </div>
                <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-card/95 px-5 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-7">
                  {isEditing ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Button type="button" variant="outline" disabled={currentStep === 0 || isPending} onClick={() => { setCurrentStep((step) => Math.max(step - 1, 0)); setError('') }}><ArrowLeft data-icon="inline-start" />Précédent</Button>
                        <Button type="button" variant="outline" disabled={currentStep === visibleSteps.length - 1 || isPending} onClick={goNext}>Suivant<ArrowRight data-icon="inline-end" /></Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push('/admin/organizations')}>Annuler</Button>
                        <Button type="button" disabled={isPending} onClick={submit}><Save data-icon="inline-start" />{isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="outline" disabled={currentStep === 0 || isPending} onClick={() => { setCurrentStep((step) => Math.max(step - 1, 0)); setError('') }}><ArrowLeft data-icon="inline-start" />Précédent</Button>
                      {currentStep < visibleSteps.length - 1 ? <Button type="button" onClick={goNext}>Continuer<ArrowRight data-icon="inline-end" /></Button> : <Button type="button" disabled={isPending || !confirmed} onClick={submit}><UserRoundPlus data-icon="inline-start" />{isPending ? 'Création…' : 'Créer l’organisation'}</Button>}
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl">{toast}</div>}
    </div>
  )
}
