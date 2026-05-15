'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Users, Search, Plus, Eye, Globe, Star, MessageSquare, Loader2 } from 'lucide-react'
import { LeadDetailDialog } from '@/components/lead-detail-dialog'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

const STATUS_OPTIONS = ['ALL', 'NEW', 'CONTACTED', 'FOLLOW_UP', 'INTERESTED', 'NOT_INTERESTED', 'BOUNCED']
const REGION_OPTIONS = ['ALL', 'USA', 'UK', 'CANADA', 'AUSTRALIA']

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  CONTACTED: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  FOLLOW_UP: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  INTERESTED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  NOT_INTERESTED: 'bg-red-500/20 text-red-400 border-red-500/30',
  BOUNCED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

function getScoreColor(score: number | null | undefined) {
  if (!score) return 'text-muted-foreground'
  if (score <= 3) return 'text-red-400'
  if (score <= 6) return 'text-yellow-400'
  return 'text-emerald-400'
}

export function LeadsDatabase() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // Add lead form
  const [newLead, setNewLead] = useState({
    companyName: '',
    city: '',
    state: '',
    country: 'USA',
    website: '',
    industry: '',
    companySize: '',
    region: 'USA',
    notes: '',
  })

  const queryClient = useQueryClient()
  const { t } = useT()

  const { data, isLoading } = useQuery({
    queryKey: ['leads', search, statusFilter, regionFilter, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (regionFilter !== 'ALL') params.set('region', regionFilter)
      params.set('page', page.toString())
      params.set('limit', '20')
      return fetch(`/api/leads?${params}`).then(r => r.json())
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof newLead) => {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to create lead')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setAddOpen(false)
      setNewLead({
        companyName: '',
        city: '',
        state: '',
        country: 'USA',
        website: '',
        industry: '',
        companySize: '',
        region: 'USA',
        notes: '',
      })
      toast.success(t('leads.leadCreated'))
    },
    onError: () => {
      toast.error(t('leads.leadFailed'))
    },
  })

  const handleViewLead = (id: string) => {
    setSelectedLeadId(id)
    setDetailOpen(true)
  }

  const leads = data?.leads || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('leads.database')}</h2>
          <Badge variant="secondary" className="text-xs">{total} {t('leads.total')}</Badge>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm" className="gold-gradient text-black font-semibold hover:opacity-90">
          <Plus className="mr-1 h-4 w-4" /> {t('leads.addLead')}
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('leads.searchLeads')}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={t('leads.status')} />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{s === 'ALL' ? t('leads.allStatuses') : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={regionFilter} onValueChange={(v) => { setRegionFilter(v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={t('leads.region')} />
              </SelectTrigger>
              <SelectContent>
                {REGION_OPTIONS.map(r => (
                  <SelectItem key={r} value={r}>{r === 'ALL' ? t('leads.allRegions') : r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : leads.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('leads.company')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('leads.location')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('leads.industry')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('leads.scores')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('leads.status')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('leads.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead: {
                    id: string;
                    companyName: string;
                    city: string;
                    state?: string | null;
                    country: string;
                    industry?: string | null;
                    websiteScore?: number | null;
                    brandScore?: number | null;
                    communicationScore?: number | null;
                    status: string;
                    region: string;
                    _count: { contacts: number; followUps: number };
                  }) => (
                    <TableRow key={lead.id} className="border-border/20 hover:bg-muted/30">
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{lead.companyName}</p>
                          <p className="text-xs text-muted-foreground">{lead.region}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{lead.city}{lead.state ? `, ${lead.state}` : ''}</TableCell>
                      <TableCell>
                        {lead.industry ? (
                          <Badge variant="secondary" className="text-[10px]">{lead.industry}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 text-xs">
                          <span className={getScoreColor(lead.websiteScore)}>
                            <Globe className="inline h-3 w-3" /> {lead.websiteScore || '-'}
                          </span>
                          <span className={getScoreColor(lead.brandScore)}>
                            <Star className="inline h-3 w-3" /> {lead.brandScore || '-'}
                          </span>
                          <span className={getScoreColor(lead.communicationScore)}>
                            <MessageSquare className="inline h-3 w-3" /> {lead.communicationScore || '-'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[lead.status] || ''} variant="outline">
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs"
                          onClick={() => handleViewLead(lead.id)}
                        >
                          <Eye className="mr-1 h-3 w-3" /> {t('leads.view')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">{t('leads.noLeads')}</p>
              <p className="text-xs text-muted-foreground/70">{t('leads.startOrAdd')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            {t('leads.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('leads.page')} {page} {t('leads.of')} {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            {t('leads.next')}
          </Button>
        </div>
      )}

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        leadId={selectedLeadId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {/* Add Lead Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border/50 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="gold-text">{t('leads.addNewLead')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm">{t('leads.companyName')} *</Label>
                <Input
                  value={newLead.companyName}
                  onChange={(e) => setNewLead({ ...newLead, companyName: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t('leads.city')} *</Label>
                <Input
                  value={newLead.city}
                  onChange={(e) => setNewLead({ ...newLead, city: e.target.value })}
                  placeholder="New York"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t('leads.state')}</Label>
                <Input
                  value={newLead.state}
                  onChange={(e) => setNewLead({ ...newLead, state: e.target.value })}
                  placeholder="NY"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t('leads.country')}</Label>
                <Input
                  value={newLead.country}
                  onChange={(e) => setNewLead({ ...newLead, country: e.target.value })}
                  placeholder="USA"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t('leads.website')}</Label>
                <Input
                  value={newLead.website}
                  onChange={(e) => setNewLead({ ...newLead, website: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t('leads.industry')}</Label>
                <Input
                  value={newLead.industry}
                  onChange={(e) => setNewLead({ ...newLead, industry: e.target.value })}
                  placeholder="Technology"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t('leads.companySize')}</Label>
                <Input
                  value={newLead.companySize}
                  onChange={(e) => setNewLead({ ...newLead, companySize: e.target.value })}
                  placeholder="11-50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t('leads.region')}</Label>
                <Select value={newLead.region} onValueChange={(v) => setNewLead({ ...newLead, region: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USA">USA</SelectItem>
                    <SelectItem value="UK">UK</SelectItem>
                    <SelectItem value="CANADA">Canada</SelectItem>
                    <SelectItem value="AUSTRALIA">Australia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{t('leads.notes')}</Label>
              <Textarea
                value={newLead.notes}
                onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                placeholder={t('followups.notesPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('leads.cancel')}</Button>
            <Button
              onClick={() => createMutation.mutate(newLead)}
              disabled={!newLead.companyName || !newLead.city || createMutation.isPending}
              className="gold-gradient text-black font-semibold hover:opacity-90"
            >
              {createMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {t('leads.createLead')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
