'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CalendarClock, Clock, CheckCircle2, SkipForward, Loader2, Plus, RefreshCw } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  PENDING: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  SENT: { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
  SKIPPED: { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: SkipForward },
}

export function FollowUps() {
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [newFollowUp, setNewFollowUp] = useState({
    leadId: '',
    scheduledDate: format(addDays(new Date(), 3), 'yyyy-MM-dd'),
    notes: '',
  })

  const queryClient = useQueryClient()
  const { t } = useT()

  const { data: followUpsData, isLoading } = useQuery({
    queryKey: ['followups', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      return fetch(`/api/followups?${params}`).then(r => r.json())
    },
  })

  const { data: leadsData } = useQuery({
    queryKey: ['leads-for-followup'],
    queryFn: () => fetch('/api/leads?limit=100').then(r => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof newFollowUp) => {
      const res = await fetch('/api/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to schedule follow-up')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followups'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setScheduleOpen(false)
      toast.success(t('followups.scheduledSuccess'))
    },
    onError: () => {
      toast.error(t('followups.scheduleFailed'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, scheduledDate, notes }: { id: string; status?: string; scheduledDate?: string; notes?: string }) => {
      const res = await fetch('/api/followups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, scheduledDate, notes }),
      })
      if (!res.ok) throw new Error('Failed to update follow-up')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followups'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success(t('followups.updated'))
    },
    onError: () => {
      toast.error(t('followups.updateFailed'))
    },
  })

  const followUps = followUpsData?.followUps || []
  const leads = leadsData?.leads || []

  const suggestedDates = [
    { label: t('followups.3days'), date: format(addDays(new Date(), 3), 'yyyy-MM-dd') },
    { label: t('followups.1week'), date: format(addDays(new Date(), 7), 'yyyy-MM-dd') },
    { label: t('followups.2weeks'), date: format(addDays(new Date(), 14), 'yyyy-MM-dd') },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('followups.title')}</h2>
          <Badge variant="secondary" className="text-xs">{followUps.length} {t('leads.total')}</Badge>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('followups.allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('followups.allStatuses')}</SelectItem>
              <SelectItem value="PENDING">{t('followups.pending')}</SelectItem>
              <SelectItem value="SENT">{t('followups.sent')}</SelectItem>
              <SelectItem value="SKIPPED">{t('followups.skipped')}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setScheduleOpen(true)} size="sm" className="gold-gradient text-black font-semibold hover:opacity-90">
            <Plus className="mr-1 h-4 w-4" /> {t('followups.schedule')}
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : followUps.length > 0 ? (
        <div className="space-y-3">
          {followUps.map((fu: {
            id: string;
            scheduledDate: string;
            status: string;
            notes: string | null;
            lead: { companyName: string; city: string; region: string };
          }) => {
            const config = STATUS_CONFIG[fu.status] || STATUS_CONFIG.PENDING
            const Icon = config.icon
            const isOverdue = new Date(fu.scheduledDate) < new Date() && fu.status === 'PENDING'

            return (
              <Card
                key={fu.id}
                className={`card-glow border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-200 hover:border-primary/30 ${
                  isOverdue ? 'border-red-500/30' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg p-2 ${config.color.split(' ')[0]}`}>
                        <Icon className={`h-4 w-4 ${config.color.split(' ')[1]}`} />
                      </div>
                      <div>
                        <h4 className="font-semibold">{fu.lead.companyName}</h4>
                        <p className="text-sm text-muted-foreground">
                          {fu.lead.city}, {fu.lead.region}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {t('followups.scheduled')} {format(new Date(fu.scheduledDate), 'MMM d, yyyy')}
                          </span>
                          {isOverdue && (
                            <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/30">
                              {t('followups.overdue')}
                            </Badge>
                          )}
                        </div>
                        {fu.notes && (
                          <p className="mt-1 text-xs text-muted-foreground">{fu.notes}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className={config.color} variant="outline">
                        {fu.status}
                      </Badge>
                      {fu.status === 'PENDING' && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            onClick={() => updateMutation.mutate({ id: fu.id, status: 'SENT' })}
                            disabled={updateMutation.isPending}
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" /> {t('followups.done')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => updateMutation.mutate({ id: fu.id, status: 'SKIPPED' })}
                            disabled={updateMutation.isPending}
                          >
                            <SkipForward className="mr-1 h-3 w-3" /> {t('followups.skip')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs"
                            onClick={() => updateMutation.mutate({
                              id: fu.id,
                              scheduledDate: format(addDays(new Date(), 3), 'yyyy-MM-dd'),
                            })}
                            disabled={updateMutation.isPending}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" /> {t('followups.reschedule')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="border-dashed border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CalendarClock className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="mb-2 text-lg font-medium text-muted-foreground">{t('followups.noFollowups')}</h3>
            <p className="max-w-md text-center text-sm text-muted-foreground/70">
              {t('followups.noFollowupsDesc')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="gold-text">{t('followups.scheduleFollowup')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">{t('followups.selectLead')}</Label>
              <Select value={newFollowUp.leadId} onValueChange={(v) => setNewFollowUp({ ...newFollowUp, leadId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('followups.chooseLead')} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {leads.map((lead: { id: string; companyName: string; city: string }) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.companyName} — {lead.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{t('followups.scheduledDate')}</Label>
              <Input
                type="date"
                value={newFollowUp.scheduledDate}
                onChange={(e) => setNewFollowUp({ ...newFollowUp, scheduledDate: e.target.value })}
              />
              <div className="flex gap-2">
                {suggestedDates.map((sd) => (
                  <Button
                    key={sd.label}
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => setNewFollowUp({ ...newFollowUp, scheduledDate: sd.date })}
                  >
                    {sd.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{t('followups.notes')}</Label>
              <Textarea
                value={newFollowUp.notes}
                onChange={(e) => setNewFollowUp({ ...newFollowUp, notes: e.target.value })}
                placeholder={t('followups.notesPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>{t('followups.cancel')}</Button>
            <Button
              onClick={() => createMutation.mutate(newFollowUp)}
              disabled={!newFollowUp.leadId || createMutation.isPending}
              className="gold-gradient text-black font-semibold hover:opacity-90"
            >
              {createMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {t('followups.schedule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
