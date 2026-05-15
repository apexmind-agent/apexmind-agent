'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Send, Loader2, Eye, Mail, Filter } from 'lucide-react'
import { format } from 'date-fns'

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  SENT: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  BOUNCED: 'bg-red-500/20 text-red-400 border-red-500/30',
  REPLIED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  OPENED: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

const TYPE_COLORS: Record<string, string> = {
  INITIAL: 'bg-primary/15 text-primary border-primary/30',
  FOLLOW_UP: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

export function SentEmails() {
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [selectedEmail, setSelectedEmail] = useState<{
    subject: string;
    body: string;
    status: string;
    type: string;
    lead: { companyName: string };
    contact: { name: string; title: string };
    createdAt: string;
    sentAt: string | null;
  } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['emails', statusFilter, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (typeFilter !== 'ALL') params.set('type', typeFilter)
      return fetch(`/api/emails/update?${params}`).then(r => r.json())
    },
  })

  const emails = data?.emails || []

  const handleViewEmail = (email: typeof emails[0]) => {
    setSelectedEmail(email)
    setDetailOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Sent Emails</h2>
          <Badge variant="secondary" className="text-xs">{emails.length} total</Badge>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="BOUNCED">Bounced</SelectItem>
              <SelectItem value="REPLIED">Replied</SelectItem>
              <SelectItem value="OPENED">Opened</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="INITIAL">Initial</SelectItem>
              <SelectItem value="FOLLOW_UP">Follow-up</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : emails.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-xs font-semibold text-muted-foreground">Company</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Contact</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Subject</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Type</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Date</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emails.map((email: {
                    id: string;
                    subject: string;
                    body: string;
                    type: string;
                    status: string;
                    createdAt: string;
                    sentAt: string | null;
                    lead: { companyName: string; city: string };
                    contact: { name: string; title: string };
                  }) => (
                    <TableRow key={email.id} className="border-border/20 hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{email.lead.companyName}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{email.contact.name}</p>
                          <p className="text-xs text-muted-foreground">{email.contact.title}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm">{email.subject}</TableCell>
                      <TableCell>
                        <Badge className={TYPE_COLORS[email.type] || ''} variant="outline">
                          {email.type === 'FOLLOW_UP' ? 'Follow-up' : email.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[email.status] || ''} variant="outline">
                          {email.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {email.sentAt
                          ? format(new Date(email.sentAt), 'MMM d, yyyy')
                          : format(new Date(email.createdAt), 'MMM d, yyyy')
                        }
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs"
                          onClick={() => handleViewEmail(email)}
                        >
                          <Eye className="mr-1 h-3 w-3" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <Mail className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="mb-2 text-lg font-medium text-muted-foreground">No Emails Yet</h3>
              <p className="max-w-md text-center text-sm text-muted-foreground/70">
                Generate emails from the Email Generator tab. They&apos;ll appear here once created.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="gold-text text-lg">
              {selectedEmail?.subject || 'Email Details'}
            </DialogTitle>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className={STATUS_COLORS[selectedEmail.status] || ''} variant="outline">
                  {selectedEmail.status}
                </Badge>
                <Badge className={TYPE_COLORS[selectedEmail.type] || ''} variant="outline">
                  {selectedEmail.type === 'FOLLOW_UP' ? 'Follow-up' : selectedEmail.type}
                </Badge>
              </div>

              <div className="grid gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">To:</span>{' '}
                  <span className="font-medium">{selectedEmail.contact.name}</span>
                  <span className="text-muted-foreground"> ({selectedEmail.contact.title})</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Company:</span>{' '}
                  <span className="font-medium">{selectedEmail.lead.companyName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>{' '}
                  {format(new Date(selectedEmail.createdAt), 'MMM d, yyyy h:mm a')}
                </div>
                {selectedEmail.sentAt && (
                  <div>
                    <span className="text-muted-foreground">Sent:</span>{' '}
                    {format(new Date(selectedEmail.sentAt), 'MMM d, yyyy h:mm a')}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/30 bg-muted/20 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{selectedEmail.body}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
