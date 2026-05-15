'use client'

import { useQuery } from '@tanstack/react-query'
import { StatCard } from '@/components/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Mail, CalendarClock, TrendingUp, AlertTriangle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { useT } from '@/lib/i18n'

const REGION_COLORS: Record<string, string> = {
  USA: '#D4A853',
  UK: '#10B981',
  CANADA: '#F59E0B',
  AUSTRALIA: '#EF4444',
}

const STATUS_COLORS: Record<string, string> = {
  NEW: '#D4A853',
  CONTACTED: '#3B82F6',
  FOLLOW_UP: '#8B5CF6',
  INTERESTED: '#10B981',
  NOT_INTERESTED: '#EF4444',
  BOUNCED: '#6B7280',
}

interface StatsData {
  totalLeads: number
  emailsSent: number
  followUpsPending: number
  conversionRate: number
  leadsByRegion: { region: string; count: number }[]
  leadsByStatus: { status: string; count: number }[]
  recentLeads: Array<{
    id: string
    companyName: string
    city: string
    region: string
    status: string
    createdAt: string
    _count: { contacts: number; emails: number }
  }>
  recentEmails: Array<{
    id: string
    subject: string
    status: string
    createdAt: string
    lead?: { companyName: string }
    contact?: { name: string; email?: string }
  }>
  _setupRequired?: boolean
}

export function Dashboard() {
  const { data: stats, isLoading, error } = useQuery<StatsData>({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then(r => r.json()),
    retry: 1,
  })
  const { t } = useT()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse border-border/50 bg-card/80">
              <CardContent className="p-6">
                <div className="h-20 rounded bg-muted/30" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const setupRequired = stats?._setupRequired

  return (
    <div className="space-y-6">
      {/* Setup Warning */}
      {setupRequired && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-yellow-500">Configuração Necessária</p>
              <p className="text-sm text-muted-foreground mt-1">
                As variáveis de ambiente (DATABASE_URL e OPENROUTER_API_KEY) ainda não foram configuradas no servidor.
                Vá em <strong>Settings → Environment</strong> na Render e adicione as variáveis.
                Depois disso, o app vai funcionar completamente.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('dashboard.totalLeads')}
          value={stats?.totalLeads || 0}
          icon={Users}
          subtitle={t('dashboard.acrossRegions')}
        />
        <StatCard
          title={t('dashboard.emailsSent')}
          value={stats?.emailsSent || 0}
          icon={Mail}
          subtitle={t('dashboard.coldOutreach')}
        />
        <StatCard
          title={t('dashboard.followupsPending')}
          value={stats?.followUpsPending || 0}
          icon={CalendarClock}
          subtitle={t('dashboard.scheduledWeek')}
        />
        <StatCard
          title={t('dashboard.conversionRate')}
          value={`${stats?.conversionRate || 0}%`}
          icon={TrendingUp}
          subtitle={t('dashboard.leadsToInterested')}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leads by Region */}
        <Card className="card-glow border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t('dashboard.leadsByRegion')}</CardTitle>
          </CardHeader>
          <CardContent>
            {(stats?.leadsByRegion?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats?.leadsByRegion || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="region" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1E293B',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {(stats?.leadsByRegion || []).map((entry, index) => (
                      <Cell key={index} fill={REGION_COLORS[entry.region] || '#D4A853'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                {t('dashboard.noDataProspecting')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads by Status */}
        <Card className="card-glow border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t('dashboard.leadsByStatus')}</CardTitle>
          </CardHeader>
          <CardContent>
            {(stats?.leadsByStatus?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={stats?.leadsByStatus || []}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ status, count }) => `${status}: ${count}`}
                  >
                    {(stats?.leadsByStatus || []).map((entry, index) => (
                      <Cell key={index} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1E293B',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-muted-foreground">
                {t('dashboard.noDataProspecting')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Leads */}
        <Card className="card-glow border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t('dashboard.recentLeads')}</CardTitle>
          </CardHeader>
          <CardContent>
            {(stats?.recentLeads?.length || 0) > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {stats?.recentLeads?.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{lead.companyName}</p>
                      <p className="text-xs text-muted-foreground">{lead.city}, {lead.region}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{lead._count.contacts} {t('dashboard.contacts')}</Badge>
                      <Badge
                        className="text-[10px]"
                        style={{
                          backgroundColor: `${STATUS_COLORS[lead.status] || '#6B7280'}20`,
                          color: STATUS_COLORS[lead.status] || '#6B7280',
                          borderColor: `${STATUS_COLORS[lead.status] || '#6B7280'}40`,
                        }}
                      >
                        {lead.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
                {t('dashboard.noLeads')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Emails */}
        <Card className="card-glow border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t('dashboard.recentEmails')}</CardTitle>
          </CardHeader>
          <CardContent>
            {(stats?.recentEmails?.length || 0) > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {stats?.recentEmails?.map((email) => (
                  <div
                    key={email.id}
                    className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{email.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {email.lead?.companyName || 'Unknown'} · {email.contact?.name || 'Unknown'}
                      </p>
                    </div>
                    <div className="ml-2 flex flex-col items-end gap-1">
                      <Badge
                        className="text-[10px]"
                        style={{
                          backgroundColor: `${STATUS_COLORS[email.status] || '#6B7280'}20`,
                          color: STATUS_COLORS[email.status] || '#6B7280',
                          borderColor: `${STATUS_COLORS[email.status] || '#6B7280'}40`,
                        }}
                      >
                        {email.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(email.createdAt), 'MMM d')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
                {t('dashboard.noEmails')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
