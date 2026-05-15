'use client'

import {
  LayoutDashboard,
  Search,
  Users,
  Mail,
  CalendarClock,
  Send,
  Zap,
  ChevronLeft,
  ChevronRight,
  Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useLanguageStore, useT } from '@/lib/i18n'

interface SidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const navItems = [
  { id: 'dashboard', labelKey: 'sidebar.dashboard', icon: LayoutDashboard },
  { id: 'prospecting', labelKey: 'sidebar.prospecting', icon: Search },
  { id: 'leads', labelKey: 'sidebar.leads', icon: Users },
  { id: 'emails', labelKey: 'sidebar.emails', icon: Mail },
  { id: 'followups', labelKey: 'sidebar.followups', icon: CalendarClock },
  { id: 'sent', labelKey: 'sidebar.sent', icon: Send },
]

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { language, setLanguage } = useLanguageStore()
  const { t } = useT()

  const toggleLanguage = () => {
    setLanguage(language === 'pt-BR' ? 'en' : 'pt-BR')
  }

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border/50 bg-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-border/50 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
          <Zap className="h-6 w-6 text-primary" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold gold-text">ApexMind</h1>
            <p className="text-[10px] text-muted-foreground">{t('sidebar.aiAgent')}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
              {!collapsed && <span>{t(item.labelKey)}</span>}
            </button>
          )
        })}
      </nav>

      {/* Language Toggle */}
      <div className="border-t border-border/50 p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          className={cn('w-full', collapsed ? 'justify-center' : 'justify-start')}
          title={t('sidebar.language')}
        >
          <Globe className="h-4 w-4 shrink-0 text-primary" />
          {!collapsed && (
            <span className="ml-2 text-sm">
              {language === 'pt-BR' ? '🇧🇷 PT-BR' : '🇺🇸 EN'}
            </span>
          )}
        </Button>
      </div>

      {/* Collapse button */}
      <div className="border-t border-border/50 p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full justify-center"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  )
}
