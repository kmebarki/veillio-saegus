'use client'

import {
  ArrowRight,
  Bell,
  Bot,
  CircleHelp,
  Database,
  FileChartColumn,
  FileText,
  Menu,
  Radio,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
} from 'lucide-react'
import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'

import { Sidebar } from '@/components/veillio-dashboard'
import { UserMenu } from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { useViewer } from '@/lib/use-viewer'

const kpis = [
  { label: 'Veilles actives', value: '12', change: '+2 ce mois', icon: FileText },
  { label: 'Sources actives', value: '48', change: '+6 ce mois', icon: Database },
  { label: 'Équipes suivies', value: '3', change: 'Smart Workplace, Data, Shift', icon: Users },
  { label: 'Contenus diffusés', value: '18', change: '+35 % ce mois', icon: Send },
]

const activityData = [
  { day: '4 oct.', contents: 16 },
  { day: '5 oct.', contents: 23 },
  { day: '6 oct.', contents: 18 },
  { day: '7 oct.', contents: 25 },
  { day: '8 oct.', contents: 31 },
  { day: '9 oct.', contents: 38 },
  { day: '10 oct.', contents: 26 },
  { day: '11 oct.', contents: 22 },
  { day: '12 oct.', contents: 34 },
  { day: '13 oct.', contents: 46 },
  { day: '14 oct.', contents: 36 },
  { day: '15 oct.', contents: 27 },
  { day: '16 oct.', contents: 32 },
  { day: '17 oct.', contents: 39 },
  { day: '18 oct.', contents: 44 },
  { day: '19 oct.', contents: 37 },
  { day: '20 oct.', contents: 40 },
  { day: '21 oct.', contents: 51 },
  { day: '22 oct.', contents: 39 },
  { day: '23 oct.', contents: 49 },
  { day: '24 oct.', contents: 44 },
  { day: '25 oct.', contents: 41 },
  { day: '26 oct.', contents: 43 },
  { day: '27 oct.', contents: 52 },
  { day: '28 oct.', contents: 61 },
  { day: '29 oct.', contents: 74 },
]

const activityConfig = {
  contents: { label: 'Contenus collectés', color: 'var(--chart-1)' },
} satisfies ChartConfig

const themes = [
  { key: 'ai', label: 'IA & Agentique', value: 36, fill: 'var(--color-ai)' },
  { key: 'platform', label: 'Power Platform', value: 26, fill: 'var(--color-platform)' },
  { key: 'sector', label: 'Veilles sectorielles', value: 22, fill: 'var(--color-sector)' },
  { key: 'governance', label: 'Gouvernance', value: 16, fill: 'var(--color-governance)' },
]

const themesConfig = {
  value: { label: 'Part' },
  ai: { label: 'IA & Agentique', color: 'var(--chart-1)' },
  platform: { label: 'Power Platform', color: 'var(--chart-2)' },
  sector: { label: 'Veilles sectorielles', color: 'var(--chart-3)' },
  governance: { label: 'Gouvernance', color: 'var(--chart-4)' },
} satisfies ChartConfig

const watchCards = [
  {
    title: 'IA générative',
    description: 'Innovations, usages et cas d’application de l’IA en entreprise.',
    teams: 'Smart Workplace, Data',
    newItems: 12,
    tags: ['IA', 'Productivité'],
    icon: Bot,
  },
  {
    title: 'Power Platform',
    description: 'Automatisations, applications métier et nouvelles fonctionnalités.',
    teams: 'Smart Workplace, Shift',
    newItems: 8,
    tags: ['Power Platform', 'Low-code'],
    icon: Workflow,
  },
  {
    title: 'Gouvernance & conformité',
    description: 'Réglementation, risques et pratiques responsables de l’IA.',
    teams: 'Data',
    newItems: 6,
    tags: ['Conformité', 'IA Act'],
    icon: ShieldCheck,
  },
]

function DashboardHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [query, setQuery] = useState('')

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={onOpenMenu}>
        <Menu />
      </Button>
      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 w-full rounded-xl border bg-muted/40 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
          placeholder="Rechercher une veille, une publication…"
          aria-label="Rechercher"
        />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button>
        <Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button>
        <Button variant="ghost" size="icon-lg" aria-label="Notifications" className="relative">
          <Bell />
          <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-background bg-primary" />
        </Button>
        <UserMenu />
      </div>
    </header>
  )
}

function WelcomePanel() {
  const { viewer } = useViewer()
  const firstName = viewer?.firstName || 'Alexandre'

  return (
    <section className="border-t-4 border-primary bg-card px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Lundi 2 novembre 2026</p>
        <h1 className="max-w-4xl text-balance font-serif text-5xl leading-none tracking-[-0.04em] sm:text-6xl">
          Bonjour <em className="text-primary">{firstName}</em>
        </h1>
      </div>
    </section>
  )
}

function KpiGrid() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs clés">
      {kpis.map((kpi) => {
        const Icon = kpi.icon
        return (
          <Card key={kpi.label} className="min-h-40">
            <CardHeader>
              <div className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <CardAction>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  <TrendingUp className="size-3.5" aria-hidden="true" />
                  {kpi.change.startsWith('+') ? kpi.change.split(' ')[0] : ''}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="mt-auto">
              <p className="text-3xl font-semibold tracking-[-0.04em]">{kpi.value}</p>
              <p className="mt-1 text-sm font-semibold">{kpi.label}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{kpi.change}</p>
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}

function ActivityChart() {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="font-serif text-3xl tracking-[-0.03em]">Vue d’ensemble</CardTitle>
        <CardDescription>Contenus collectés sur les 30 derniers jours</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">30 derniers jours</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={activityConfig} className="h-64 w-full" role="img" aria-label="Histogramme des contenus collectés sur 30 jours">
          <BarChart accessibilityLayer data={activityData} margin={{ left: 8, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={10} interval={4} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={34} />
            <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="contents" fill="var(--chart-1)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="grid grid-cols-3 gap-4">
        <div><p className="text-lg font-semibold">1 248</p><p className="text-xs text-muted-foreground">collectés</p></div>
        <div><p className="text-lg font-semibold">312</p><p className="text-xs text-muted-foreground">sélectionnés</p></div>
        <div><p className="text-lg font-semibold">18</p><p className="text-xs text-muted-foreground">diffusés</p></div>
      </CardFooter>
    </Card>
  )
}

function ThemesChart() {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="font-serif text-3xl tracking-[-0.03em]">Répartition par thématique</CardTitle>
        <CardDescription>Part des contenus collectés ce mois-ci</CardDescription>
      </CardHeader>
      <CardContent className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_180px] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_170px]">
        <ChartContainer config={themesConfig} className="mx-auto aspect-square h-56" role="img" aria-label="Répartition des contenus par thématique">
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Pie data={themes} dataKey="value" nameKey="key" innerRadius={62} outerRadius={88} strokeWidth={4}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">1 248</tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 22} className="fill-muted-foreground text-xs">contenus</tspan>
                      </text>
                    )
                  }
                  return null
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="flex flex-col gap-3" aria-label="Légende des thématiques">
          {themes.map((theme, index) => (
            <li key={theme.key} className="flex items-center gap-2 text-xs">
              <span className="size-2.5 rounded-full" style={{ background: `var(--chart-${index + 1})` }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{theme.label}</span>
              <strong>{theme.value} %</strong>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function WatchCard({ watch }: { watch: (typeof watchCards)[number] }) {
  const Icon = watch.icon

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </div>
        <CardTitle className="mt-3">{watch.title}</CardTitle>
        <CardDescription className="leading-relaxed">{watch.description}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" aria-label={`Ouvrir ${watch.title}`}><ArrowRight /></Button>
        </CardAction>
      </CardHeader>
      <CardContent className="mt-auto">
        <div className="flex flex-wrap gap-2">
          {watch.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">{tag}</span>
          ))}
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-3 text-xs">
        <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground"><Users className="size-4 shrink-0" /><span className="truncate">{watch.teams}</span></span>
        <strong className="shrink-0 text-primary">{watch.newItems} nouveautés</strong>
      </CardFooter>
    </Card>
  )
}

export function VeillioDashboardV2() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Tableau de bord" />
      <div className="lg:pl-[288px]">
        <DashboardHeader onOpenMenu={() => setSidebarOpen(true)} />
        <main className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <WelcomePanel />
          <KpiGrid />
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]" aria-label="Analyses de veille">
            <ActivityChart />
            <ThemesChart />
          </section>
          <section className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><Sparkles className="size-4" />À suivre</p>
                <h2 className="font-serif text-4xl tracking-[-0.04em]">Veilles à suivre</h2>
              </div>
              <Button variant="ghost" size="sm">Tout voir <ArrowRight data-icon="inline-end" /></Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {watchCards.map((watch) => <WatchCard key={watch.title} watch={watch} />)}
            </div>
          </section>
          <div className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
            <Radio className="size-4 text-primary" aria-hidden="true" />
            <span>Données de démonstration pour validation de la nouvelle direction visuelle.</span>
          </div>
        </main>
      </div>
    </div>
  )
}
