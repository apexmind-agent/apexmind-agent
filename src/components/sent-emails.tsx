'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Send, Loader2, Eye, Mail, Pencil, Save, X, Copy, Check, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

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

interface EmailData {
  id: string
  subject: string
  body: string
  type: string
  status: string
  createdAt: string
  sentAt: string | null
  contactEmail?: string
  lead: { companyName: string; city: string }
  contact: { name: string; title: string; email?: string }
}

export function SentEmails() {
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [selectedEmail, setSelectedEmail] = useState<EmailData | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [copied, setCopied] = useState(false)

  const queryClient = useQueryClient()
  const { t } = useT()

  const { data, isLoading } = useQuery({
    queryKey: ['emails', statusFilter, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (typeFilter !== 'ALL') params.set('type', typeFilter)
      return fetch(`/api/emails/update?${params}`).then(r => r.json())
    },
  })

  const saveMutation = useMutation({
    mutationFn: async ({ id, subject, body, status }: { id: string; subject: string; body: string; status: string }) => {
      const res = await fetch('/api/emails/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, subject, body }),
      })
      if (!res.ok) throw new Error('Save failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setIsEditing(false)
      toast.success(t('emails.savedDraft'))
    },
    onError: () => {
      toast.error(t('emails.saveFailed'))
    },
  })

  const emails = data?.emails || []

  const handleViewEmail = (email: EmailData) => {
    setSelectedEmail(email)
    setEditSubject(email.subject)
    setEditBody(email.body)
    setIsEditing(false)
    setDetailOpen(false)
    setDetailOpen(true)
  }

  const handleStartEdit = () => {
    if (selectedEmail) {
      setEditSubject(selectedEmail.subject)
      setEditBody(selectedEmail.body)
    }
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    if (selectedEmail) {
      setEditSubject(selectedEmail.subject)
      setEditBody(selectedEmail.body)
    }
    setIsEditing(false)
  }

  const handleSaveEdit = () => {
    if (!selectedEmail) return
    saveMutation.mutate({
      id: selectedEmail.id,
      subject: editSubject,
      body: editBody,
      status: selectedEmail.status,
    })
  }

  // SEND VIA EMAIL CLIENT
  const handleSendEmail = () => {
    if (!selectedEmail) return
    const email = selectedEmail.contact?.email || selectedEmail.contactEmail || ''
    if (!email) {
      toast.error('No contact email found')
      return
    }

    // Load signature
    let sigText = ''
    try {
      const stored = localStorage.getItem('apexmind-signature')
      if (stored) {
        const sig = JSON.parse(stored)
        const lines: string[] = ['']
        if (sig.name) lines.push(sig.name)
        if (sig.title) lines.push(sig.title)
        lines.push('ApexMind Advertising Agency')
        if (sig.email) lines.push(sig.email)
        if (sig.website) lines.push(sig.website)
        if (sig.phone) lines.push(sig.phone)
        sigText = lines.join('\n')
      }
    } catch {}

    const body = isEditing ? editBody : selectedEmail.body
    const subject = isEditing ? editSubject : selectedEmail.subject
    const fullBody = sigText ? body + sigText : body

    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`
    window.open(mailtoUrl, '_blank')

    // Save any edits and mark as sent
    saveMutation.mutate({
      id: selectedEmail.id,
      subject: isEditing ? editSubject : selectedEmail.subject,
      body: isEditing ? editBody : selectedEmail.body,
      status: 'SENT',
    })
  }

  // COPY EMAIL TO CLIPBOARD
  const handleCopyEmail = async () => {
    if (!selectedEmail) return
    const email = selectedEmail.contact?.email || selectedEmail.contactEmail || ''

    // Load signature
    let sigText = ''
    try {
      const stored = localStorage.getItem('apexmind-signature')
      if (stored) {
        const sig = JSON.parse(stored)
        const lines: string[] = ['']
        if (sig.name) lines.push(sig.name)
        if (sig.title) lines.push(sig.title)
        lines.push('ApexMind Advertising Agency')
        if (sig.email) lines.push(sig.email)
        if (sig.website) lines.push(sig.website)
        if (sig.phone) lines.push(sig.phone)
        sigText = lines.join('\n')
      }
    } catch {}

    const body = isEditing ? editBody : selectedEmail.body
    const subject = isEditing ? editSubject : selectedEmail.subject
    const fullBody = sigText ? body + sigText : body
    const emailText = `To: ${email}\nSubject: ${subject}\n\n${fullBody}`

    try {
      await navigator.clipboard.writeText(emailText)
      setCopied(true)
      toast.success('E-mail copiado! Cole no seu cliente de e-mail.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = emailText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      toast.success('E-mail copiado!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('sent.title')}</h2>
          <Badge variant="secondary" className="text-xs">{emails.length} {t('leads.total')}</Badge>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t('sent.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('sent.allStatuses')}</SelectItem>
              <SelectItem value="DRAFT">{t('emails.draft')}</SelectItem>
              <SelectItem value="SENT">{t('followups.sent')}</SelectItem>
              <SelectItem value="BOUNCED">Bounced</SelectItem>
              <SelectItem value="REPLIED">Replied</SelectItem>
              <SelectItem value="OPENED">Opened</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t('sent.type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('sent.allTypes')}</SelectItem>
              <SelectItem value="INITIAL">{t('sent.initial')}</SelectItem>
              <SelectItem value="FOLLOW_UP">{t('sent.followup')}</SelectItem>
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
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('sent.company')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('sent.contact')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('sent.subject')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('sent.type')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('sent.status')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('sent.date')}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">{t('sent.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emails.map((email: EmailData) => (
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
                          {email.type === 'FOLLOW_UP' ? t('sent.followup') : email.type === 'INITIAL' ? t('sent.initial') : email.type}
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
                          <Eye className="mr-1 h-3 w-3" /> {t('sent.view')}
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
              <h3 className="mb-2 text-lg font-medium text-muted-foreground">{t('sent.noEmailsYet')}</h3>
              <p className="max-w-md text-center text-sm text-muted-foreground/70">
                {t('sent.noEmailsDesc')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Detail Dialog — EDITABLE + SEND */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Pencil className="h-4 w-4 text-primary" />
                  <span className="gold-text text-lg">{t('emails.editEmail')}</span>
                </>
              ) : (
                <span className="gold-text text-lg">{selectedEmail?.subject || t('sent.emailDetails')}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              {/* Status badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className={STATUS_COLORS[selectedEmail.status] || ''} variant="outline">
                  {selectedEmail.status}
                </Badge>
                <Badge className={TYPE_COLORS[selectedEmail.type] || ''} variant="outline">
                  {selectedEmail.type === 'FOLLOW_UP' ? t('sent.followup') : selectedEmail.type === 'INITIAL' ? t('sent.initial') : selectedEmail.type}
                </Badge>
              </div>

              {/* Contact info */}
              <div className="grid gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('sent.to')}</span>{' '}
                  <span className="font-medium">{selectedEmail.contact.name}</span>
                  <span className="text-muted-foreground"> ({selectedEmail.contact.title})</span>
                </div>
                <div>
                  <span className="text-muted-foreground">E-mail:</span>{' '}
                  <span className="font-medium text-primary">{selectedEmail.contact?.email || selectedEmail.contactEmail || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('sent.company')}:</span>{' '}
                  <span className="font-medium">{selectedEmail.lead.companyName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('sent.created')}</span>{' '}
                  {format(new Date(selectedEmail.createdAt), 'MMM d, yyyy h:mm a')}
                </div>
                {selectedEmail.sentAt && (
                  <div>
                    <span className="text-muted-foreground">{t('sent.sentOn')}</span>{' '}
                    {format(new Date(selectedEmail.sentAt), 'MMM d, yyyy h:mm a')}
                  </div>
                )}
              </div>

              <Separator className="bg-border/30" />

              {/* EDITABLE Subject */}
              {isEditing ? (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">{t('emails.subject')}</Label>
                  <Input
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="text-sm border-primary/30 focus:border-primary"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('emails.subject')}</Label>
                  <p className="text-sm font-medium">{selectedEmail.subject}</p>
                </div>
              )}

              {/* EDITABLE Body */}
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-muted-foreground">{t('emails.body')}</Label>
                    <span className="text-[10px] text-muted-foreground/60">{editBody.length} chars</span>
                  </div>
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={14}
                    className="text-sm leading-relaxed resize-y min-h-[200px] border-primary/30 focus:border-primary"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('emails.body')}</Label>
                  <div className="rounded-lg border border-border/30 bg-muted/20 p-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{selectedEmail.body}</p>
                  </div>
                </div>
              )}

              {/* Action buttons — SEND, COPY, EDIT, SAVE */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="flex gap-2">
                  {/* COPY */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyEmail}
                    className="text-xs"
                  >
                    {copied ? <Check className="mr-1 h-3 w-3 text-emerald-400" /> : <Copy className="mr-1 h-3 w-3" />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </Button>

                  {/* EDIT / CANCEL / SAVE */}
                  {isEditing ? (
                    <>
                      <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                        <X className="mr-1 h-3 w-3" /> {t('emails.cancelEdit')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={saveMutation.isPending}
                        className="gold-gradient text-black font-semibold hover:opacity-90"
                      >
                        {saveMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                        {t('emails.saveChanges')}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleStartEdit} className="text-xs">
                      <Pencil className="mr-1 h-3 w-3" /> {t('emails.editEmail')}
                    </Button>
                  )}
                </div>

                {/* SEND */}
                <Button
                  size="sm"
                  onClick={handleSendEmail}
                  disabled={saveMutation.isPending}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Send className="mr-1 h-3 w-3" /> Enviar E-mail
                </Button>
              </div>

              {/* Info */}
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-xs text-emerald-300/80">
                  <strong>Enviar E-mail</strong> abre seu cliente de e-mail (Gmail, Outlook, etc.) com o destinatário,
                  assunto e corpo preenchidos. Sua assinatura é adicionada automaticamente.
                  Revise e envie de lá. Respostas dos clientes irão para o e-mail configurado na sua assinatura.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
