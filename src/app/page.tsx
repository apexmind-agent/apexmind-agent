'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/sidebar'
import { Dashboard } from '@/components/dashboard'
import { Prospecting } from '@/components/prospecting'
import { LeadsDatabase } from '@/components/leads-database'
import { EmailGenerator } from '@/components/email-generator'
import { FollowUps } from '@/components/follow-ups'
import { SentEmails } from '@/components/sent-emails'
import { ErrorBoundary } from '@/components/error-boundary'
import { Menu, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useT } from '@/lib/i18n'

const TAB_TITLES: Record<string, { 'pt-BR': string; 'en': string }> = {
  dashboard: { 'pt-BR': 'Painel', 'en': 'Dashboard' },
  prospecting: { 'pt-BR': 'Prospecção IA', 'en': 'AI Prospecting' },
  leads: { 'pt-BR': 'Banco de Leads', 'en': 'Leads Database' },
  emails: { 'pt-BR': 'Gerador de E-mails', 'en': 'Email Generator' },
  followups: { 'pt-BR': 'Follow-ups', 'en': 'Follow-ups' },
  sent: { 'pt-BR': 'E-mails Enviados', 'en': 'Sent Emails' },
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const { t, language } = useT()

  const getTabTitle = (tab: string) => {
    const entry = TAB_TITLES[tab]
    if (!entry) return tab
    return entry[language] || entry['en'] || tab
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <ErrorBoundary><Dashboard /></ErrorBoundary>
      case 'prospecting':
        return <ErrorBoundary><Prospecting /></ErrorBoundary>
      case 'leads':
        return <ErrorBoundary><LeadsDatabase /></ErrorBoundary>
      case 'emails':
        return <ErrorBoundary><EmailGenerator /></ErrorBoundary>
      case 'followups':
        return <ErrorBoundary><FollowUps /></ErrorBoundary>
      case 'sent':
        return <ErrorBoundary><SentEmails /></ErrorBoundary>
      default:
        return <ErrorBoundary><Dashboard /></ErrorBoundary>
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              {/* Mobile menu */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 bg-sidebar p-0">
                  <Sidebar activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab) }} />
                </SheetContent>
              </Sheet>

              <div>
                <h1 className="text-lg font-bold">{getTabTitle(activeTab)}</h1>
                <p className="text-xs text-muted-foreground">ApexMind {t('sidebar.aiAgent')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 sm:flex">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">{t('header.aiPowered')}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 sm:p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  )
}
