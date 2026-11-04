'use client'

import { Bell, CircleHelp, Menu, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConnectorDetailPage } from '@/components/connectors/connector-detail-page'
import { ConnectorWizard } from '@/components/connectors/connector-wizard'
import { ConnectorsCatalog } from '@/components/connectors/connectors-catalog'
import { Button } from '@/components/ui/button'
import { UserMenu } from '@/components/user-menu'
import { Sidebar } from '@/components/veillio-dashboard'
import type { ConnectorsOverview } from '@/lib/connector-types'

type View = { type: 'catalog' } | { type: 'create' } | { type: 'detail'; id: string }

export function ConnectorsModule({ overview }: { overview: ConnectorsOverview }) {
  const router = useRouter()
  const [view, setView] = useState<View>({ type: 'catalog' })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState('')

  function notify(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4500)
  }

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeItem="Connecteurs" />
      <div className="lg:pl-[288px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground sm:block">Pilotage <span className="px-2">/</span> Intégrations <span className="px-2">/</span> <strong className="font-medium text-foreground">Connecteurs</strong></div>
          <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="icon-lg" aria-label="Aide"><CircleHelp /></Button><Button variant="ghost" size="icon-lg" aria-label="Paramètres"><Settings /></Button><Button variant="ghost" size="icon-lg" aria-label="Notifications"><Bell /></Button><UserMenu /></div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {view.type === 'catalog' && <ConnectorsCatalog overview={overview} onCreate={() => setView({ type: 'create' })} onOpen={(id) => setView({ type: 'detail', id })} onNotify={notify} />}
          {view.type === 'create' && <ConnectorWizard onCancel={() => setView({ type: 'catalog' })} onCreated={(message, id) => { notify(message); router.refresh(); setView({ type: 'detail', id }) }} />}
          {view.type === 'detail' && <ConnectorDetailPage connectorId={view.id} viewer={overview.viewer} onBack={() => setView({ type: 'catalog' })} onNotify={(message) => { notify(message); router.refresh() }} onOpenConnector={(id) => setView({ type: 'detail', id })} />}
        </main>
      </div>
      {notice && <div role="status" className="fixed bottom-5 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl">{notice}</div>}
    </div>
  )
}
