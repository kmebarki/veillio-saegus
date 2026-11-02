'use client'

import { useMemo, useState } from 'react'
import { Bell, Building2, ChevronRight, CircleHelp, Globe2, Menu, Plus, Search, Settings, SlidersHorizontal, Users, Workflow, X } from 'lucide-react'
import Link from 'next/link'

import { OrganizationStatusBadge } from '@/components/organizations/organization-status-badge'
import { Sidebar } from '@/components/veillio-dashboard'
import { UserMenu } from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { OrganizationListItem, OrganizationsOverview } from '@/lib/organization-types'

const typeLabels: Record<string, string> = { client: 'Client', internal: 'Interne', partner: 'Partenaire' }

function OrganizationInspector({ organization, onClose }: { organization: OrganizationListItem; onClose: () => void }) {
  const details = [
    ['Référence', organization.internalReference ?? 'Non renseignée'],
    ['Domaine', organization.primaryDomain ?? 'Non renseigné'],
    ['Type', typeLabels[organization.type] ?? organization.type],
    ['Pays', organization.country],
    ['Langue', organization.defaultLanguage],
    ['Fuseau horaire', organization.timezone],
    ['Responsable', organization.responsibleName ?? 'Non attribué'],
    ['Contact', organization.contactEmail ?? 'Non renseigné'],
    ['Offre', organization.offer ?? 'Non renseignée'],
  ]

  return (
    <>
      <button type="button" aria-label="Fermer l’inspecteur" className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-2xl" aria-label={`Détails de ${organization.name}`}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></div>
            <div className="min-w-0"><p className="truncate font-semibold">{organization.name}</p><p className="mt-1 truncate text-sm text-muted-foreground">{organization.primaryDomain ?? organization.internalReference}</p></div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Fermer" onClick={onClose}><X /></Button>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
          <OrganizationStatusBadge organization={organization} />
          <section className="grid grid-cols-3 gap-2" aria-label="Volumes de l’organisation">
            {[['Utilisateurs', organization.usersCount], ['Équipes', organization.teamsCount], ['Veilles', organization.watchesCount]].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-3"><strong className="text-lg">{value}</strong><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>
            ))}
          </section>
          <section>
            <h2 className="text-sm font-semibold">Informations générales</h2>
            <dl className="mt-3 divide-y rounded-xl border bg-card px-4">
              {details.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-3 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}
            </dl>
          </section>
          <section className="rounded-xl border bg-muted/35 p-4">
            <div className="flex items-center gap-2"><Globe2 className="size-4 text-primary" /><h2 className="text-sm font-semibold">Mini-site</h2></div>
            <p className="mt-2 text-sm text-muted-foreground">{organization.miniSiteEnabled ? 'Le mini-site est activé pour cette organisation.' : 'Le mini-site n’est pas activé.'}</p>
          </section>
        </div>
      </aside>
    </>
  )
}

export function OrganizationsModule({ overview }: { overview: OrganizationsOverview }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [country, setCountry] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const countries = useMemo(() => [...new Set(overview.organizations.map((item) => item.country))].sort(), [overview.organizations])
  const visibleOrganizations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr')
    return overview.organizations.filter((organization) => {
      const effectiveStatus = organization.status === 'suspended' ? 'suspended' : organization.setupStatus
      const matchesQuery = !normalizedQuery || [organization.name, organization.internalReference, organization.primaryDomain, organization.country].some((value) => value?.toLocaleLowerCase('fr').includes(normalizedQuery))
      return matchesQuery && (status === 'all' || status === effectiveStatus) && (type === 'all' || type === organization.type) && (country === 'all' || country === organization.country)
    })
  }, [country, overview.organizations, query, status, type])

  const activeCount = overview.organizations.filter((item) => item.status === 'active' && item.setupStatus === 'active').length
  const setupCount = overview.organizations.filter((item) => item.status === 'active' && item.setupStatus === 'to_configure').length
  const totalUsers = overview.organizations.reduce((total, item) => total + item.usersCount, 0)
  const selected = overview.organizations.find((item) => item.id === selectedId) ?? null

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Organisations" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Administration <span className="px-2">/</span> <strong className="font-medium text-foreground">Organisations</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><UserMenu /></div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="mb-2 text-xs font-medium text-primary">Administration système</p><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Organisations</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Supervisez les organisations clientes, leur périmètre d’administration et leur état de configuration.</p></div>
              {overview.canManage && <Button render={<Link href="/admin/organizations/new" />} nativeButton={false} size="lg"><Plus data-icon="inline-start" />Nouvelle organisation</Button>}
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs Organisations">
              <div className="metric-card"><p>Organisations</p><strong>{overview.organizations.length}</strong><span>Référencées au total</span></div>
              <div className="metric-card"><p>Actives</p><strong>{activeCount}</strong><span>En exploitation</span></div>
              <div className="metric-card"><p>À configurer</p><strong>{setupCount}</strong><span>Nécessitent une action</span></div>
              <div className="metric-card"><p>Utilisateurs</p><strong>{totalUsers}</strong><span>Rattachés aux organisations</span></div>
            </section>

            <section className="rounded-2xl border bg-card">
              <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center">
                <label className="relative flex-1"><span className="sr-only">Rechercher une organisation</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 rounded-xl pl-9" placeholder="Rechercher par nom, domaine ou référence" /></label>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><SlidersHorizontal className="size-4" /><span className="hidden sm:inline">Filtres</span></div>
                <Select items={[{ value: 'all', label: 'Tous les statuts' }, { value: 'active', label: 'Actives' }, { value: 'to_configure', label: 'À configurer' }, { value: 'suspended', label: 'Suspendues' }]} value={status} onValueChange={(value) => setStatus(value ?? 'all')}><SelectTrigger className="h-10 w-full rounded-xl xl:w-44"><SelectValue placeholder="Tous les statuts" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="active">Actives</SelectItem><SelectItem value="to_configure">À configurer</SelectItem><SelectItem value="suspended">Suspendues</SelectItem></SelectContent></Select>
                <Select items={[{ value: 'all', label: 'Tous les types' }, { value: 'client', label: 'Clients' }, { value: 'internal', label: 'Internes' }, { value: 'partner', label: 'Partenaires' }]} value={type} onValueChange={(value) => setType(value ?? 'all')}><SelectTrigger className="h-10 w-full rounded-xl xl:w-40"><SelectValue placeholder="Tous les types" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les types</SelectItem><SelectItem value="client">Clients</SelectItem><SelectItem value="internal">Internes</SelectItem><SelectItem value="partner">Partenaires</SelectItem></SelectContent></Select>
                <Select items={[{ value: 'all', label: 'Tous les pays' }, ...countries.map((item) => ({ value: item, label: item }))]} value={country} onValueChange={(value) => setCountry(value ?? 'all')}><SelectTrigger className="h-10 w-full rounded-xl xl:w-40"><SelectValue placeholder="Tous les pays" /></SelectTrigger><SelectContent><SelectItem value="all">Tous les pays</SelectItem>{countries.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
              </div>

              {visibleOrganizations.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Organisation</TableHead><TableHead>Statut</TableHead><TableHead>Responsable</TableHead><TableHead className="text-center">Utilisateurs</TableHead><TableHead className="text-center">Équipes</TableHead><TableHead className="text-center">Veilles</TableHead><TableHead><span className="sr-only">Ouvrir</span></TableHead></TableRow></TableHeader>
                  <TableBody>{visibleOrganizations.map((organization) => (
                    <TableRow key={organization.id} className="group">
                      <TableCell><button type="button" className="flex items-center gap-3 text-left" onClick={() => setSelectedId(organization.id)}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Building2 className="size-4" /></span><span><strong className="block font-medium text-foreground group-hover:text-primary">{organization.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{organization.primaryDomain ?? organization.internalReference ?? 'Sans domaine'}</span></span></button></TableCell>
                      <TableCell><OrganizationStatusBadge organization={organization} /></TableCell>
                      <TableCell><span className="text-sm">{organization.responsibleName ?? 'Non attribué'}</span></TableCell>
                      <TableCell className="text-center font-medium">{organization.usersCount}</TableCell><TableCell className="text-center font-medium">{organization.teamsCount}</TableCell><TableCell className="text-center font-medium">{organization.watchesCount}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="icon" aria-label={`Ouvrir ${organization.name}`} onClick={() => setSelectedId(organization.id)}><ChevronRight /></Button></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              ) : (
                <Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>Aucune organisation trouvée</EmptyTitle><EmptyDescription>{overview.organizations.length === 0 ? 'Créez la première organisation pour commencer à structurer la plateforme.' : 'Ajustez votre recherche ou vos filtres.'}</EmptyDescription></EmptyHeader>{overview.organizations.length === 0 && overview.canManage && <EmptyContent><Button render={<Link href="/admin/organizations/new" />} nativeButton={false}><Plus data-icon="inline-start" />Créer une organisation</Button></EmptyContent>}</Empty>
              )}
            </section>

            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="size-3.5" /> Les volumes utilisateurs et équipes sont calculés en temps réel. <Workflow className="ml-2 size-3.5" /> Le volume de veilles sera activé avec le catalogue de veilles.</p>
          </div>
        </main>
      </div>
      {selected && <OrganizationInspector organization={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}
