'use client'

import { SaegusLogo } from '@/components/saegus-logo'
import {
  Bell,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  FilePenLine,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  LibraryBig,
  Menu,
  MoreHorizontal,
  Network,
  Newspaper,
  Plug,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
  Workflow,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { cn } from '@/lib/utils'
import { useViewer, type ViewerInfo } from '@/lib/use-viewer'

const workspaceItems = [
  { label: 'Tableau de bord', icon: LayoutDashboard, href: '/' },
  { label: 'Catalogue des veilles', icon: LibraryBig, href: '#' },
  { label: 'Mes veilles', icon: Radio, href: '#' },
  { label: 'Mes abonnements', icon: Bell, href: '#' },
  { label: 'Publications', icon: Newspaper, href: '#' },
]

const steeringItems = [
  { label: 'Sources', icon: Database, href: '#' },
  {
    label: 'Intégrations',
    icon: Plug,
    children: ['Connecteurs', 'Connexions', 'Collectes'],
  },
  {
    label: 'Gestion de l’IA',
    icon: BrainCircuit,
    children: ['Fournisseurs et modèles', 'Prompts', 'Traitements IA', 'Règles IA'],
  },
  { label: 'Templates', icon: LayoutTemplate, href: '#' },
  { label: 'Édition et publication', icon: FilePenLine, href: '#' },
  { label: 'Diffusion', icon: Send, href: '#' },
]

const childHrefs: Record<string, string> = { Connecteurs: '/admin/connectors', Connexions: '/admin/connections', Collectes: '/admin/collections' }
const childAccess: Partial<Record<string, keyof ViewerInfo['access']>> = { Connecteurs: 'connectors', Connexions: 'connections', Collectes: 'collections' }

const administrationItems: { label: string; icon: typeof Settings; href: string; access?: keyof ViewerInfo['access'] }[] = [
  { label: 'Utilisateurs et admissions', icon: UserRoundCheck, href: '/admin/users', access: 'users' },
  { label: 'Équipes', icon: Workflow, href: '/admin/teams', access: 'teams' },
  { label: 'Groupes et permissions', icon: ShieldCheck, href: '/admin/groups', access: 'groups' },
  { label: 'Paramètres', icon: Settings, href: '#' },
]

const watches = [
  {
    title: 'Mobilité & villes durables',
    description: 'Innovations urbaines, réglementation et nouveaux usages',
    cadence: 'Chaque lundi',
    next: '2 nov. à 08:00',
    sources: 24,
    newItems: 18,
    status: 'Active',
    tone: 'mint',
  },
  {
    title: 'Intelligence artificielle',
    description: 'Marché, usages professionnels et cadre réglementaire',
    cadence: 'Chaque jour',
    next: 'Demain à 07:30',
    sources: 31,
    newItems: 42,
    status: 'Active',
    tone: 'blue',
  },
  {
    title: 'Transition énergétique',
    description: 'Politiques publiques et mutations des filières',
    cadence: 'Tous les vendredis',
    next: '30 oct. à 09:00',
    sources: 17,
    newItems: 7,
    status: 'À valider',
    tone: 'amber',
  },
]

const publications = [
  { type: 'Digest', title: 'Mobilité & villes durables', date: 'Aujourd’hui, 08:12', meta: '18 contenus · 6 min', color: 'mint' },
  { type: 'Rapport', title: 'Intelligence artificielle', date: 'Hier, 17:40', meta: '42 contenus · 24 pages', color: 'blue' },
  { type: 'Dossier', title: 'Transition énergétique', date: '27 oct. 2026', meta: '31 contenus · 38 pages', color: 'amber' },
]

function Brand() {
  return (
    <div className="flex h-16 flex-col justify-center gap-1 px-5">
      <SaegusLogo priority className="h-6" />
      <p className="text-[10px] font-medium text-muted-foreground">Veillio · Intelligence de veille</p>
    </div>
  )
}

export function Sidebar({ open, onClose, activeItem = 'Tableau de bord' }: { open: boolean; onClose: () => void; activeItem?: string }) {
  const [expandedMenus, setExpandedMenus] = useState(() => new Set(['Intégrations', 'Gestion de l’IA']))
  const { viewer } = useViewer()
  const visibleAdministrationItems = administrationItems.filter((item) => !item.access || viewer?.access[item.access])

  function toggleMenu(label: string) {
    setExpandedMenus((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  function renderMenuItem(
    item: (typeof workspaceItems)[number] | (typeof steeringItems)[number] | (typeof administrationItems)[number],
  ) {
    const Icon = item.icon
    const children = 'children' in item ? item.children : undefined
    const expanded = expandedMenus.has(item.label)

    const itemClassName = cn(
      'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors',
      activeItem === item.label
        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
        : 'text-sidebar-foreground hover:bg-sidebar-accent',
    )

    return (
      <div key={item.label}>
        {children ? (
          <button className={itemClassName} aria-expanded={expanded} onClick={() => toggleMenu(item.label)}>
            <Icon className="size-[18px] shrink-0" />
            <span className="flex-1">{item.label}</span>
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', !expanded && '-rotate-90')} />
          </button>
        ) : (
          <Link href={('href' in item && item.href) ? item.href : '#'} className={itemClassName} onClick={onClose} aria-current={activeItem === item.label ? 'page' : undefined}>
            <Icon className="size-[18px] shrink-0" />
            <span className="flex-1">{item.label}</span>
          </Link>
        )}
        {children && expanded && (
          <div className="flex flex-col gap-0.5 py-1 pl-11">
            {children.map((child) => {
              const href = childHrefs[child]
              const requiredAccess = childAccess[child]
              if (requiredAccess && viewer && !viewer.access[requiredAccess]) return null
              const childClassName = cn(
                'flex min-h-10 items-center rounded-lg px-3 text-left text-[13px] transition-colors',
                activeItem === child ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )
              return href ? (
                <Link key={child} href={href} onClick={onClose} className={childClassName} aria-current={activeItem === child ? 'page' : undefined}>{child}</Link>
              ) : (
                <button key={child} onClick={onClose} className={childClassName}>{child}</button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button aria-label="Fermer le menu" className={cn('fixed inset-0 z-20 bg-foreground/20 backdrop-blur-[2px] lg:hidden', open ? 'block' : 'hidden')} onClick={onClose} />
      <aside className={cn('fixed inset-y-0 left-0 z-30 flex w-[288px] flex-col border-r bg-sidebar transition-transform duration-300 lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between border-b">
          <Brand />
          <Button variant="ghost" size="icon-lg" className="mr-3 lg:hidden" aria-label="Fermer le menu" onClick={onClose}><X /></Button>
        </div>
        <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-5" aria-label="Navigation principale">
          <section className="flex flex-col gap-1" aria-labelledby="workspace-navigation">
            <h2 id="workspace-navigation" className="px-3 pb-1 text-[11px] font-semibold text-muted-foreground">Mon espace</h2>
            {workspaceItems.map((item) => renderMenuItem(item))}
          </section>

          <section className="mt-5 flex flex-col gap-1 border-t pt-5" aria-labelledby="steering-navigation">
            <h2 id="steering-navigation" className="px-3 pb-1 text-[11px] font-semibold text-muted-foreground">Pilotage</h2>
            {steeringItems.map((item) => renderMenuItem(item))}
          </section>

          {visibleAdministrationItems.length > 0 && (
            <section className="mt-5 flex flex-col gap-1 border-t pt-5" aria-labelledby="administration-navigation">
              <h2 id="administration-navigation" className="px-3 pb-1 text-[11px] font-semibold text-muted-foreground">Administration</h2>
              {visibleAdministrationItems.map((item) => renderMenuItem(item))}
            </section>
          )}
        </nav>
      </aside>
    </>
  )
}

function WatchCard({ watch }: { watch: (typeof watches)[number] }) {
  return (
    <article className="group flex min-w-[285px] flex-1 flex-col rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
      <div className="flex items-start justify-between gap-4">
        <div className={cn('watch-icon', `tone-${watch.tone}`)}><Radio /></div>
        <Button variant="ghost" size="icon" aria-label={`Options pour ${watch.title}`}><MoreHorizontal /></Button>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <div className="flex items-center gap-2"><h3 className="text-[15px] font-semibold tracking-[-0.01em]">{watch.title}</h3><span className={cn('status-dot', `tone-${watch.tone}`)} /></div>
        <p className="min-h-10 text-sm leading-5 text-muted-foreground">{watch.description}</p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 border-y py-4 text-xs">
        <div><p className="text-muted-foreground">Collecte</p><p className="mt-1 font-medium">{watch.cadence}</p></div>
        <div><p className="text-muted-foreground">Prochaine</p><p className="mt-1 font-medium">{watch.next}</p></div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{watch.sources} sources</span>
        <span className="font-semibold text-primary">+{watch.newItems} nouveautés</span>
      </div>
    </article>
  )
}

function PublicationList() {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between px-5 py-4 sm:px-6">
        <div><h2 className="font-semibold tracking-[-0.01em]">Dernières publications</h2><p className="mt-1 text-xs text-muted-foreground">Vos restitutions les plus récentes</p></div>
        <Button variant="ghost" size="sm">Tout voir <ChevronRight data-icon="inline-end" /></Button>
      </div>
      <div className="divide-y">
        {publications.map((publication) => (
          <button key={`${publication.type}-${publication.title}`} className="flex min-h-20 w-full items-center gap-3 px-5 text-left transition-colors hover:bg-muted/50 sm:gap-4 sm:px-6">
            <div className={cn('publication-icon', `tone-${publication.color}`)}><FileText /></div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">{publication.type}</span><span className="text-xs text-muted-foreground">{publication.date}</span></div><p className="mt-1 truncate text-sm font-semibold">{publication.title}</p></div>
            <span className="hidden text-xs text-muted-foreground sm:block">{publication.meta}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
  )
}

function AttentionPanel() {
  return (
    <aside className="rounded-2xl bg-primary p-5 text-primary-foreground sm:p-6">
      <div className="flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-white/10"><Sparkles className="size-[18px]" /></div><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold">3 actions</span></div>
      <h2 className="mt-6 text-lg font-semibold tracking-[-0.02em]">À votre attention</h2>
      <p className="mt-2 text-sm leading-5 text-white/60">Des éléments nécessitent votre validation avant diffusion.</p>
      <div className="mt-5 flex flex-col gap-2">
        <button className="flex min-h-14 items-center gap-3 rounded-xl bg-white/8 px-3 text-left hover:bg-white/12"><div className="grid size-8 place-items-center rounded-lg bg-[#F5A623] text-[#0E0A19]"><FileText className="size-4" /></div><div className="flex-1"><p className="text-xs font-semibold">2 publications à valider</p><p className="mt-0.5 text-[11px] text-white/50">Avant demain, 09:00</p></div><ChevronRight className="size-4 text-white/40" /></button>
        <button className="flex min-h-14 items-center gap-3 rounded-xl bg-white/8 px-3 text-left hover:bg-white/12"><div className="grid size-8 place-items-center rounded-lg bg-[#DDD3FD] text-[#2D1574]"><Users className="size-4" /></div><div className="flex-1"><p className="text-xs font-semibold">1 demande d’admission</p><p className="mt-0.5 text-[11px] text-white/50">Re��ue il y a 3 h</p></div><ChevronRight className="size-4 text-white/40" /></button>
      </div>
    </aside>
  )
}

export function VeillioDashboard() {
  const { viewer } = useViewer()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border bg-muted/40 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20" placeholder="Rechercher une veille, une publication…" aria-label="Rechercher" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button>
            <Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button>
            <Button variant="ghost" size="icon-lg" aria-label="Notifications" className="relative"><Bell /><span className="absolute right-2 top-2 size-2 rounded-full border-2 border-background bg-[#F5A623]" /></Button>
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-8">
            <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div><p className="mb-2 text-xs font-medium text-muted-foreground">Mercredi 29 octobre</p><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">Bonjour {viewer?.firstName ?? ''},</h1>{viewer && <p className="mt-1 text-xs font-medium text-primary">{viewer.name} · {viewer.roleLabel}</p>}<p className="mt-2 text-sm text-muted-foreground">Voici l’essentiel de votre activité de veille.</p></div>
              <Button size="lg" className="min-h-11 self-start px-4 sm:self-auto"><Plus data-icon="inline-start" />Nouvelle veille</Button>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <div className="metric-card"><p>Contenus collectés</p><strong>1 284</strong><span>+12% ce mois</span></div>
              <div className="metric-card"><p>Nouveaux aujourd’hui</p><strong>67</strong><span>sur 8 veilles actives</span></div>
              <div className="metric-card"><p>Publications ce mois</p><strong>24</strong><span>98% diffusées</span></div>
            </section>

            <section>
              <div className="mb-4 flex items-end justify-between"><div><h2 className="font-semibold tracking-[-0.01em]">Mes veilles actives</h2><p className="mt-1 text-xs text-muted-foreground">Suivi des collectes et prochaines publications</p></div><Button variant="ghost" size="sm" className="hidden sm:inline-flex">Toutes mes veilles <ChevronRight data-icon="inline-end" /></Button></div>
              <div className="flex gap-3 overflow-x-auto pb-2">{watches.map((watch) => <WatchCard key={watch.title} watch={watch} />)}</div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
              <PublicationList />
              <AttentionPanel />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
