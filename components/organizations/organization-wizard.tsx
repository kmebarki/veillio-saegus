'use client'

import { useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Bell, Building2, Check, CircleHelp, Globe2, Menu, Settings, ShieldCheck, UserRoundPlus, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { createOrganization } from '@/app/actions/organizations'
import { Sidebar } from '@/components/veillio-dashboard'
import { UserMenu } from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CreateOrganizationInput, OrganizationUserOption } from '@/lib/organization-types'
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
  country: 'France',
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
  adminName: '',
  adminEmail: '',
}

const selectTriggerClass = 'h-10 w-full rounded-xl'

function WizardStepper({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Étapes de création" className="rounded-2xl border bg-card p-4 lg:sticky lg:top-24">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col">
        {steps.map((step, index) => {
          const Icon = step.icon
          const completed = index < currentStep
          const active = index === currentStep
          return (
            <li key={step.title} className="min-w-44 flex-1 lg:min-w-0">
              <div className={cn('flex items-center gap-3 rounded-xl px-3 py-3 transition-colors', active && 'bg-primary text-primary-foreground', !active && completed && 'bg-primary/8 text-primary', !active && !completed && 'text-muted-foreground')} aria-current={active ? 'step' : undefined}>
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border', active && 'border-primary-foreground/20 bg-primary-foreground/10', !active && 'border-border bg-background')}>
                  {completed ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span><strong className="block text-sm font-semibold">{step.title}</strong><span className={cn('mt-0.5 hidden text-xs lg:block', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{step.description}</span></span>
              </div>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function SelectField({ label, value, items, onChange, description }: { label: string; value: string; items: { value: string; label: string }[]; onChange: (value: string) => void; description?: string }) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select items={items} value={value} onValueChange={(nextValue) => nextValue && onChange(nextValue)}>
        <SelectTrigger className={selectTriggerClass}><SelectValue /></SelectTrigger>
        <SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col justify-between gap-1 border-b py-3 text-sm last:border-b-0 sm:flex-row sm:items-center"><span className="text-muted-foreground">{label}</span><strong className="font-medium sm:text-right">{value || 'Non renseigné'}</strong></div>
}

export function OrganizationWizard({ userOptions }: { userOptions: OrganizationUserOption[] }) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [form, setForm] = useState(initialForm)
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
      if (!form.country || !form.defaultLanguage || !form.timezone) return 'Le pays, la langue et le fuseau horaire sont requis.'
      if (form.contactEmail && !/^\S+@\S+\.\S+$/.test(form.contactEmail)) return 'L’adresse e-mail de contact est invalide.'
    }
    if (currentStep === 2 && form.inviteAdmin) {
      if (form.adminName.trim().length < 2) return 'Renseignez le nom du premier administrateur.'
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
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1))
  }

  function submit() {
    if (!confirmed) {
      setError('Confirmez l’exactitude des informations avant de créer l’organisation.')
      return
    }
    setError('')
    startTransition(async () => {
      const result = await createOrganization(form)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setToast(result.message)
      window.setTimeout(() => {
        router.push('/admin/organizations')
        router.refresh()
      }, 900)
    })
  }

  const responsibleItems = [{ value: 'none', label: 'Aucun responsable' }, ...userOptions.map((user) => ({ value: user.id, label: `${user.name} · ${user.email}` }))]
  const responsibleName = userOptions.find((user) => user.id === form.responsibleUserId)?.name ?? 'Non attribué'

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Organisations" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Administration <span className="px-2">/</span> Organisations <span className="px-2">/</span> <strong className="font-medium text-foreground">Nouvelle</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><UserMenu /></div>
        </header>

        <main className="mx-auto max-w-[1250px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section><Button render={<Link href="/admin/organizations" />} nativeButton={false} variant="ghost" className="-ml-2 mb-3"><ArrowLeft data-icon="inline-start" />Retour aux organisations</Button><p className="mb-2 text-xs font-medium text-primary">Création guidée</p><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Nouvelle organisation</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Configurez le périmètre, l’administration et l’état initial de la nouvelle organisation.</p></section>

            <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
              <WizardStepper currentStep={currentStep} />
              <section className="rounded-2xl border bg-card shadow-sm">
                <div className="border-b px-5 py-5 sm:px-7"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Étape {currentStep + 1} sur {steps.length}</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">{steps[currentStep].title}</h2><p className="mt-1 text-sm text-muted-foreground">{steps[currentStep].description}</p></div>
                <div className="px-5 py-6 sm:px-7">
                  {currentStep === 0 && (
                    <FieldGroup>
                      <div className="grid gap-5 md:grid-cols-2">
                        <Field><FieldLabel htmlFor="organization-name">Nom de l’organisation</FieldLabel><Input id="organization-name" value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex. Ministère de la Culture" className="h-10 rounded-xl" autoFocus /><FieldDescription>Nom affiché dans toute la plateforme.</FieldDescription></Field>
                        <Field><FieldLabel htmlFor="organization-reference">Référence interne</FieldLabel><Input id="organization-reference" value={form.internalReference} onChange={(event) => update('internalReference', event.target.value.toUpperCase())} placeholder="Ex. MCULT" className="h-10 rounded-xl font-mono" /><FieldDescription>Identifiant court, unique et stable.</FieldDescription></Field>
                      </div>
                      <SelectField label="Type d’organisation" value={form.type} onChange={(value) => update('type', value)} items={[{ value: 'client', label: 'Client' }, { value: 'internal', label: 'Interne' }, { value: 'partner', label: 'Partenaire' }]} />
                      <Field><FieldLabel htmlFor="organization-domain">Domaine principal</FieldLabel><Input id="organization-domain" value={form.primaryDomain} onChange={(event) => update('primaryDomain', event.target.value.toLowerCase())} placeholder="entreprise.fr" className="h-10 rounded-xl" /><FieldDescription>Saisi sans protocole ni chemin.</FieldDescription></Field>
                    </FieldGroup>
                  )}

                  {currentStep === 1 && (
                    <FieldGroup>
                      <div className="grid gap-5 md:grid-cols-2"><Field><FieldLabel htmlFor="organization-country">Pays</FieldLabel><Input id="organization-country" value={form.country} onChange={(event) => update('country', event.target.value)} className="h-10 rounded-xl" /></Field><SelectField label="Langue par défaut" value={form.defaultLanguage} onChange={(value) => update('defaultLanguage', value)} items={[{ value: 'Français', label: 'Français' }, { value: 'English', label: 'English' }, { value: 'Deutsch', label: 'Deutsch' }, { value: 'Español', label: 'Español' }]} /></div>
                      <SelectField label="Fuseau horaire" value={form.timezone} onChange={(value) => update('timezone', value)} items={[{ value: 'Europe/Paris', label: 'Europe/Paris · UTC+1' }, { value: 'Europe/London', label: 'Europe/London · UTC+0' }, { value: 'America/New_York', label: 'America/New_York · UTC-5' }, { value: 'Asia/Dubai', label: 'Asia/Dubai · UTC+4' }]} />
                      <div className="grid gap-5 md:grid-cols-2"><Field><FieldLabel htmlFor="organization-email">E-mail de contact</FieldLabel><Input id="organization-email" type="email" value={form.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} placeholder="contact@entreprise.fr" className="h-10 rounded-xl" /></Field><Field><FieldLabel htmlFor="organization-phone">Téléphone</FieldLabel><Input id="organization-phone" type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+33 1 00 00 00 00" className="h-10 rounded-xl" /></Field></div>
                    </FieldGroup>
                  )}

                  {currentStep === 2 && (
                    <FieldGroup>
                      <SelectField label="Responsable de l’organisation" value={form.responsibleUserId ?? 'none'} onChange={(value) => update('responsibleUserId', value === 'none' ? null : value)} items={responsibleItems} description="Ce responsable peut être attribué ou modifié ultérieurement." />
                      <SelectField label="Périmètre d’administration" value={form.administrationScope} onChange={(value) => update('administrationScope', value)} items={[{ value: 'organization', label: 'Organisation uniquement' }, { value: 'global', label: 'Administration globale' }]} />
                      <div className="rounded-xl border bg-muted/30 p-4"><Field orientation="horizontal"><Checkbox id="invite-admin" checked={form.inviteAdmin} onCheckedChange={(checked) => update('inviteAdmin', checked === true)} /><FieldContent><FieldLabel htmlFor="invite-admin">Inviter le premier administrateur</FieldLabel><FieldDescription>Une invitation sécurisée valable 7 jours sera envoyée après la création.</FieldDescription></FieldContent></Field></div>
                      {form.inviteAdmin && <div className="grid gap-5 rounded-xl border p-4 md:grid-cols-2"><Field><FieldLabel htmlFor="admin-name">Nom complet</FieldLabel><Input id="admin-name" value={form.adminName} onChange={(event) => update('adminName', event.target.value)} placeholder="Prénom Nom" className="h-10 rounded-xl" /></Field><Field><FieldLabel htmlFor="admin-email">E-mail professionnel</FieldLabel><Input id="admin-email" type="email" value={form.adminEmail} onChange={(event) => update('adminEmail', event.target.value)} placeholder="admin@entreprise.fr" className="h-10 rounded-xl" /></Field></div>}
                    </FieldGroup>
                  )}

                  {currentStep === 3 && (
                    <FieldGroup>
                      <SelectField label="Statut initial" value={form.initialStatus} onChange={(value) => update('initialStatus', value as CreateOrganizationInput['initialStatus'])} items={[{ value: 'to_configure', label: 'À configurer' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspendue' }]} description="Le statut À configurer permet de préparer le périmètre avant son ouverture." />
                      <SelectField label="Offre" value={form.offer || 'none'} onChange={(value) => update('offer', value === 'none' ? '' : value)} items={[{ value: 'none', label: 'Aucune offre attribuée' }, { value: 'essential', label: 'Essential' }, { value: 'business', label: 'Business' }, { value: 'enterprise', label: 'Enterprise' }]} />
                      <div className="rounded-xl border bg-muted/30 p-4"><Field orientation="horizontal"><Checkbox id="mini-site" checked={form.miniSiteEnabled} onCheckedChange={(checked) => update('miniSiteEnabled', checked === true)} /><FieldContent><FieldLabel htmlFor="mini-site">Activer le mini-site</FieldLabel><FieldDescription>Prépare un espace public personnalisable pour les publications de l’organisation.</FieldDescription></FieldContent></Field></div>
                    </FieldGroup>
                  )}

                  {currentStep === 4 && (
                    <div className="flex flex-col gap-5">
                      <div className="rounded-xl border bg-background px-4"><ReviewRow label="Organisation" value={`${form.name} · ${form.internalReference.toUpperCase()}`} /><ReviewRow label="Type et domaine" value={`${form.type === 'client' ? 'Client' : form.type === 'internal' ? 'Interne' : 'Partenaire'} · ${form.primaryDomain}`} /><ReviewRow label="Localisation" value={`${form.country} · ${form.defaultLanguage} · ${form.timezone}`} /><ReviewRow label="Responsable" value={responsibleName} /><ReviewRow label="Périmètre" value={form.administrationScope === 'global' ? 'Administration globale' : 'Organisation uniquement'} /><ReviewRow label="Statut initial" value={form.initialStatus === 'active' ? 'Active' : form.initialStatus === 'suspended' ? 'Suspendue' : 'À configurer'} /><ReviewRow label="Offre" value={form.offer || 'Aucune'} /><ReviewRow label="Premier administrateur" value={form.inviteAdmin ? `${form.adminName} · ${form.adminEmail}` : 'Invitation désactivée'} /><ReviewRow label="Mini-site" value={form.miniSiteEnabled ? 'Activé' : 'Désactivé'} /></div>
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><Field orientation="horizontal"><Checkbox id="confirm-organization" checked={confirmed} onCheckedChange={(checked) => { setConfirmed(checked === true); setError('') }} /><FieldContent><FieldLabel htmlFor="confirm-organization">Je confirme l’exactitude de ces informations</FieldLabel><FieldDescription>La référence interne et le domaine doivent être uniques sur la plateforme.</FieldDescription></FieldContent></Field></div>
                    </div>
                  )}

                  {error && <p role="alert" className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
                </div>
                <div className="flex flex-col-reverse justify-between gap-3 border-t px-5 py-4 sm:flex-row sm:px-7">
                  <Button type="button" variant="outline" disabled={currentStep === 0 || isPending} onClick={() => { setCurrentStep((step) => Math.max(step - 1, 0)); setError('') }}><ArrowLeft data-icon="inline-start" />Précédent</Button>
                  {currentStep < steps.length - 1 ? <Button type="button" onClick={goNext}>Continuer<ArrowRight data-icon="inline-end" /></Button> : <Button type="button" disabled={isPending || !confirmed} onClick={submit}><UserRoundPlus data-icon="inline-start" />{isPending ? 'Création…' : 'Créer l’organisation'}</Button>}
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
