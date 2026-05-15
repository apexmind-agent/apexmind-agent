'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Globe, Star, MessageSquare, Mail, CalendarClock, Users, Trophy, ExternalLink, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface LeadDetailDialogProps {
  leadId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  CONTACTED: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  FOLLOW_UP: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  INTERESTED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  NOT_INTERESTED: 'bg-red-500/20 text-red-400 border-red-500/30',
  BOUNCED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const SCORE_COLORS: Record<string, string> = {
  low: 'text-red-400',
  mid: 'text-yellow-400',
  high: 'text-emerald-400',
}

function getScoreColor(score: number | null | undefined) {
  if (!score) return 'text-muted-foreground'
  if (score <= 3) return SCORE_COLORS.low
  if (score <= 6) return SCORE_COLORS.mid
  return SCORE_COLORS.high
}

export function LeadDetailDialog({ leadId, open, onOpenChange }: LeadDetailDialogProps) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => fetch(`/api/leads/${leadId}`).then(r => r.json()),
    enabled: !!leadId && open,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      onOpenChange(false)
      toast.success('Lead deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete lead')
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data?.lead, status }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Status updated')
    },
  })

  const lead = data?.lead

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="gold-text text-xl">{lead?.companyName || 'Loading...'}</span>
            {lead && (
              <Badge className={STATUS_COLORS[lead.status] || ''} variant="outline">
                {lead.status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : lead ? (
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="text-sm font-medium">{lead.city}{lead.state ? `, ${lead.state}` : ''}, {lead.country}</p>
              </div>
              {lead.website && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Website</p>
                  <a
                    href={lead.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {lead.website}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {lead.industry && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Industry</p>
                  <Badge variant="secondary" className="text-xs">{lead.industry}</Badge>
                </div>
              )}
              {lead.companySize && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Company Size</p>
                  <p className="text-sm">{lead.companySize} employees</p>
                </div>
              )}
            </div>

            {/* Scores */}
            <div className="flex gap-4 rounded-lg border border-border/30 bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Website:</span>
                <span className={`text-sm font-bold ${getScoreColor(lead.websiteScore)}`}>
                  {lead.websiteScore || '-'}/10
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Brand:</span>
                <span className={`text-sm font-bold ${getScoreColor(lead.brandScore)}`}>
                  {lead.brandScore || '-'}/10
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Comm:</span>
                <span className={`text-sm font-bold ${getScoreColor(lead.communicationScore)}`}>
                  {lead.communicationScore || '-'}/10
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Awards:</span>
                <span className="text-sm font-bold text-muted-foreground">
                  {lead.hasAwards ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {lead.notes && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{lead.notes}</p>
              </div>
            )}

            <Separator className="bg-border/30" />

            {/* Tabs */}
            <Tabs defaultValue="contacts" className="w-full">
              <TabsList className="w-full bg-muted/30">
                <TabsTrigger value="contacts" className="flex-1">
                  <Users className="mr-1 h-3 w-3" /> Contacts ({lead.contacts?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="emails" className="flex-1">
                  <Mail className="mr-1 h-3 w-3" /> Emails ({lead.emails?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="followups" className="flex-1">
                  <CalendarClock className="mr-1 h-3 w-3" /> Follow-ups ({lead.followUps?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="contacts" className="mt-3">
                <div className="space-y-2">
                  {lead.contacts?.length > 0 ? lead.contacts.map((contact: { id: string; name: string; title: string; email?: string; emailValidated?: boolean }) => (
                    <div key={contact.id} className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
                      <div>
                        <p className="text-sm font-medium">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.title}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{contact.email || 'N/A'}</p>
                        {contact.emailValidated && (
                          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">Validated</Badge>
                        )}
                      </div>
                    </div>
                  )) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">No contacts yet. Run deep research to find contacts.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="emails" className="mt-3">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {lead.emails?.length > 0 ? lead.emails.map((email: { id: string; subject: string; status: string; type: string; createdAt: string; contact?: { name: string } }) => (
                    <div key={email.id} className="rounded-lg border border-border/30 bg-muted/20 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{email.subject}</p>
                        <Badge variant="outline" className="text-[10px]">{email.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        To: {email.contact?.name || 'Unknown'} · {email.type} · {format(new Date(email.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  )) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">No emails yet. Generate one from the Email Generator tab.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="followups" className="mt-3">
                <div className="space-y-2">
                  {lead.followUps?.length > 0 ? lead.followUps.map((fu: { id: string; scheduledDate: string; status: string; notes: string | null }) => (
                    <div key={fu.id} className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3">
                      <div>
                        <p className="text-sm font-medium">{format(new Date(fu.scheduledDate), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-muted-foreground">{fu.notes || 'No notes'}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{fu.status}</Badge>
                    </div>
                  )) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">No follow-ups scheduled.</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <Separator className="bg-border/30" />

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1">
                {['NEW', 'CONTACTED', 'FOLLOW_UP', 'INTERESTED', 'NOT_INTERESTED'].map(status => (
                  <Button
                    key={status}
                    size="sm"
                    variant={lead.status === status ? 'default' : 'outline'}
                    className={`text-[10px] ${lead.status === status ? 'gold-gradient text-black' : ''}`}
                    onClick={() => updateStatusMutation.mutate({ id: lead.id, status })}
                    disabled={updateStatusMutation.isPending}
                  >
                    {status.replace('_', ' ')}
                  </Button>
                ))}
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="ml-auto text-xs"
                onClick={() => deleteMutation.mutate(lead.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="mr-1 h-3 w-3" /> Delete
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
