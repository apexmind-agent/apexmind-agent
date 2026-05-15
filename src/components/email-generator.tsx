'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Mail, Loader2, Sparkles, Send, Save, RotateCcw, User, Trash2, Pencil, Copy, Check, Settings, AlertTriangle, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

// Signature stored in localStorage
interface EmailSignature {
  name: string
  title: string
  email: string
  website: string
  phone: string
}

function loadSignature(): EmailSignature {
  if (typeof window === 'undefined') return { name: '', title: '', email: '', website: '', phone: '' }
  try {
    const stored = localStorage.getItem('apexmind-signature')
    if (stored) return JSON.parse(stored)
  } catch {}
  return { name: '', title: '', email: '', website: '', phone: '' }
}

function saveSignature(sig: EmailSignature) {
  try {
    localStorage.setItem('apexmind-signature', JSON.stringify(sig))
  } catch {}
}

function buildSignatureText(sig: EmailSignature): string {
  const lines: string[] = ['']
  if (sig.name) lines.push(sig.name)
  if (sig.title) lines.push(sig.title)
  lines.push('ApexMind Advertising Agency')
  if (sig.email) lines.push(sig.email)
  if (sig.website) lines.push(sig.website)
  if (sig.phone) lines.push(sig.phone)
  return lines.join('\n')
}

// Email validation state
interface EmailValidation {
  isValid: boolean
  confidence: number
  canSend: boolean
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  reason: string
  domainCheck?: {
    hasMx: boolean
    canReceiveEmail: boolean
    mxRecords: string[]
  }
}

export function EmailGenerator() {
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [selectedContactId, setSelectedContactId] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [currentEmailId, setCurrentEmailId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [signature, setSignature] = useState<EmailSignature>(loadSignature)
  const [emailValidation, setEmailValidation] = useState<EmailValidation | null>(null)
  const [showBounceWarning, setShowBounceWarning] = useState(false)

  const queryClient = useQueryClient()
  const { t } = useT()

  // Fetch leads for dropdown
  const { data: leadsData } = useQuery({
    queryKey: ['leads-for-email'],
    queryFn: () => fetch('/api/leads?limit=100').then(r => r.json()),
  })

  // Fetch lead details (with contacts) when a lead is selected
  const { data: leadData } = useQuery({
    queryKey: ['lead-for-email', selectedLeadId],
    queryFn: () => fetch(`/api/leads/${selectedLeadId}`).then(r => r.json()),
    enabled: !!selectedLeadId,
  })

  const generateMutation = useMutation({
    mutationFn: async (data: { leadId: string; contactId: string }) => {
      const res = await fetch('/api/emails/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Generation failed')
      return res.json()
    },
    onSuccess: (data) => {
      setEmailSubject(data.email?.subject || '')
      setEmailBody(data.email?.body || '')
      setCurrentEmailId(data.email?.id || null)
      setEmailValidation(null) // Reset validation
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      toast.success(t('emails.generatedSuccess'))
    },
    onError: () => {
      toast.error(t('emails.generationFailed'))
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      if (variables.status === 'SENT') {
        toast.success(t('emails.markedSent'))
      } else {
        toast.success(t('emails.savedDraft'))
      }
    },
    onError: () => {
      toast.error(t('emails.saveFailed'))
    },
  })

  const validateMutation = useMutation({
    mutationFn: async ({ email, contactId }: { email: string; contactId: string }) => {
      const res = await fetch('/api/emails/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, contactId }),
      })
      if (!res.ok) throw new Error('Validation failed')
      return res.json()
    },
    onSuccess: (data) => {
      setEmailValidation(data)
      if (data.riskLevel === 'CRITICAL') {
        toast.error(`⚠️ E-mail VAI BOUNCER! ${data.reason}`)
      } else if (data.riskLevel === 'HIGH') {
        toast.warning(`⚠️ E-mail arriscado: ${data.reason}`)
      } else if (data.isValid) {
        toast.success(`${t('emails.valid')} (${data.confidence}% ${t('emails.confidence')})`)
      } else {
        toast.warning(`${t('emails.mayNotBeValid')}: ${data.reason}`)
      }
    },
    onError: () => {
      toast.error(t('emails.validationFailed'))
    },
  })

  const handleGenerate = () => {
    if (!selectedLeadId || !selectedContactId) {
      toast.error(t('emails.selectLeadContact'))
      return
    }
    generateMutation.mutate({ leadId: selectedLeadId, contactId: selectedContactId })
  }

  const handleRegenerate = () => {
    if (!selectedLeadId || !selectedContactId) return
    generateMutation.mutate({ leadId: selectedLeadId, contactId: selectedContactId })
  }

  const handleSaveDraft = () => {
    if (!currentEmailId) return
    saveMutation.mutate({ id: currentEmailId, subject: emailSubject, body: emailBody, status: 'DRAFT' })
  }

  const handleMarkSent = () => {
    if (!currentEmailId) return
    saveMutation.mutate({ id: currentEmailId, subject: emailSubject, body: emailBody, status: 'SENT' })
  }

  const handleClearEmail = () => {
    setEmailSubject('')
    setEmailBody('')
    setEmailValidation(null)
  }

  // Get the full email body with signature
  const getFullBody = () => {
    const sig = buildSignatureText(signature)
    if (sig.trim()) {
      return emailBody + sig
    }
    return emailBody
  }

  // VALIDATE BEFORE SEND
  const handleValidateAndSend = async () => {
    const contact = contacts.find((c: { id: string }) => c.id === selectedContactId)
    if (!contact?.email) {
      toast.error('No contact email found')
      return
    }

    // If already validated and safe, send directly
    if (emailValidation?.canSend && emailValidation.riskLevel !== 'CRITICAL' && emailValidation.riskLevel !== 'HIGH') {
      doSendEmail()
      return
    }

    // Validate first
    const res = await fetch('/api/emails/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: contact.email, contactId: contact.id }),
    })
    const data = await res.json()
    setEmailValidation(data)

    if (data.riskLevel === 'CRITICAL' || !data.canSend) {
      // Show bounce warning — DO NOT SEND
      setShowBounceWarning(true)
      return
    }

    if (data.riskLevel === 'HIGH') {
      // Show warning but allow user to proceed
      setShowBounceWarning(true)
      return
    }

    // Safe to send
    doSendEmail()
  }

  // SEND VIA EMAIL CLIENT (mailto:)
  const doSendEmail = () => {
    const contact = contacts.find((c: { id: string }) => c.id === selectedContactId)
    if (!contact?.email) return

    const fullBody = getFullBody()
    const mailtoUrl = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(fullBody)}`
    window.open(mailtoUrl, '_blank')

    if (currentEmailId) {
      saveMutation.mutate({ id: currentEmailId, subject: emailSubject, body: emailBody, status: 'SENT' })
    }
    toast.success(t('emails.markedSent'))
  }

  // COPY EMAIL TO CLIPBOARD
  const handleCopyEmail = async () => {
    const contact = contacts.find((c: { id: string }) => c.id === selectedContactId)
    const fullBody = getFullBody()
    const emailText = `To: ${contact?.email || ''}\nSubject: ${emailSubject}\n\n${fullBody}`

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

  // Save signature
  const handleSaveSignature = () => {
    saveSignature(signature)
    setSignatureOpen(false)
    toast.success('Assinatura salva!')
  }

  const hasContent = emailSubject || emailBody
  const leads = leadsData?.leads || []
  const contacts = leadData?.lead?.contacts || []
  const selectedContact = contacts.find((c: { id: string }) => c.id === selectedContactId)
  const hasNoContacts = selectedLeadId && contacts.length === 0

  // Risk level display helpers
  const getRiskIcon = (level?: string) => {
    switch (level) {
      case 'LOW': return <ShieldCheck className="h-4 w-4 text-emerald-400" />
      case 'MEDIUM': return <ShieldAlert className="h-4 w-4 text-yellow-400" />
      case 'HIGH': return <ShieldAlert className="h-4 w-4 text-orange-400" />
      case 'CRITICAL': return <ShieldX className="h-4 w-4 text-red-400" />
      default: return null
    }
  }

  const getRiskColor = (level?: string) => {
    switch (level) {
      case 'LOW': return 'border-emerald-500/30 bg-emerald-500/10'
      case 'MEDIUM': return 'border-yellow-500/30 bg-yellow-500/10'
      case 'HIGH': return 'border-orange-500/30 bg-orange-500/10'
      case 'CRITICAL': return 'border-red-500/30 bg-red-500/10'
      default: return 'border-border/30 bg-muted/20'
    }
  }

  return (
    <div className="space-y-6">
      {/* Selection Panel */}
      <Card className="card-glow border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-5 w-5 text-primary" />
              {t('emails.generator')}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => { setSignature(loadSignature()); setSignatureOpen(true) }}
            >
              <Settings className="mr-1 h-3 w-3" /> Assinatura
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('emails.selectLead')}</Label>
              <Select value={selectedLeadId} onValueChange={(v) => { setSelectedLeadId(v); setSelectedContactId(''); setEmailSubject(''); setEmailBody(''); setCurrentEmailId(null); setEmailValidation(null) }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('emails.chooseLead')} />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {leads.map((lead: { id: string; companyName: string; city: string; region: string; _count?: { contacts: number } }) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      <span className="flex items-center gap-2">
                        {lead.companyName} — {lead.city}, {lead.region}
                        {(lead._count?.contacts || 0) > 0 && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">
                            {lead._count?.contacts} {lead._count?.contacts === 1 ? 'contato' : 'contatos'}
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('emails.selectContact')}</Label>
              <Select value={selectedContactId} onValueChange={(v) => { setSelectedContactId(v); setEmailValidation(null) }} disabled={!selectedLeadId || hasNoContacts}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    hasNoContacts
                      ? t('emails.noContactsYet')
                      : selectedLeadId
                        ? t('emails.chooseContact')
                        : t('emails.selectLeadFirst')
                  } />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((contact: { id: string; name: string; title: string; email: string; emailValidated: boolean; emailBounced: boolean }) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      <span className="flex items-center gap-2">
                        {contact.name} ({contact.title})
                        {contact.emailBounced && <Badge variant="outline" className="text-[9px] text-red-400 border-red-500/30">BOUNCE</Badge>}
                        {!contact.emailValidated && !contact.emailBounced && <Badge variant="outline" className="text-[9px] text-yellow-400 border-yellow-500/30">NÃO VERIFICADO</Badge>}
                        {contact.emailValidated && <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30">VERIFICADO</Badge>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedContact && (
            <div className={`flex items-center gap-3 rounded-lg border p-3 ${getRiskColor(emailValidation?.riskLevel)}`}>
              <User className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{selectedContact.name} — {selectedContact.title}</p>
                <p className="text-xs text-muted-foreground">{selectedContact.email}</p>
                {emailValidation && (
                  <div className="mt-1 flex items-center gap-2">
                    {getRiskIcon(emailValidation.riskLevel)}
                    <span className={`text-xs ${emailValidation.riskLevel === 'LOW' ? 'text-emerald-400' : emailValidation.riskLevel === 'CRITICAL' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {emailValidation.riskLevel === 'LOW' ? 'Seguro para enviar' :
                       emailValidation.riskLevel === 'MEDIUM' ? 'Provavelmente seguro' :
                       emailValidation.riskLevel === 'HIGH' ? 'Risco de bounce' :
                       '⚠️ VAI BOUNCER — não enviar!'}
                      {' '}({emailValidation.confidence}%)
                    </span>
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => validateMutation.mutate({ email: selectedContact.email, contactId: selectedContact.id })}
                disabled={validateMutation.isPending}
              >
                {validateMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-1 h-3 w-3" />}
                Verificar
              </Button>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={!selectedLeadId || !selectedContactId || generateMutation.isPending || hasNoContacts}
            className="gold-gradient text-black font-semibold hover:opacity-90"
            size="lg"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('emails.generating')}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {t('emails.generateEmail')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Email Editor — FULLY EDITABLE with SEND */}
      {hasContent && (
        <Card className="card-glow border-primary/20 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Pencil className="h-4 w-4 text-primary" />
                {t('emails.emailPreview')}
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearEmail}
                  className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                >
                  <Trash2 className="mr-1 h-3 w-3" /> {t('emails.clear')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={generateMutation.isPending}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> {t('emails.regenerate')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Subject — EDITABLE */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">{t('emails.subject')}</Label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="text-sm border-primary/30 focus:border-primary"
                placeholder={t('emails.subjectPlaceholder')}
              />
            </div>

            {/* Body — FULLY EDITABLE */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">{t('emails.body')}</Label>
                <span className="text-[10px] text-muted-foreground/60">{emailBody.length} chars</span>
              </div>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={14}
                className="text-sm leading-relaxed resize-y min-h-[200px] border-primary/30 focus:border-primary"
                placeholder={t('emails.bodyPlaceholder')}
              />
            </div>

            {/* Signature Preview */}
            {signature.name && (
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Assinatura (adicionada ao enviar/copiar):</p>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {signature.name && <span className="font-medium text-foreground">{signature.name}</span>}
                  {signature.title && <span> — {signature.title}</span>}
                  {'\n'}ApexMind Advertising Agency
                  {signature.email && <>{'\n'}<span className="text-primary">{signature.email}</span></>}
                  {signature.website && <>{'\n'}<span className="text-primary">{signature.website}</span></>}
                  {signature.phone && <>{'\n'}{signature.phone}</>}
                </div>
              </div>
            )}

            {/* Validation result */}
            {emailValidation && (
              <div className={`rounded-lg border p-3 ${getRiskColor(emailValidation.riskLevel)}`}>
                <div className="flex items-center gap-2 mb-1">
                  {getRiskIcon(emailValidation.riskLevel)}
                  <span className="text-sm font-medium">
                    {emailValidation.riskLevel === 'LOW' ? '✅ E-mail verificado — seguro para enviar' :
                     emailValidation.riskLevel === 'MEDIUM' ? '⚡ E-mail provavelmente válido' :
                     emailValidation.riskLevel === 'HIGH' ? '⚠️ Risco de bounce — verifique o e-mail' :
                     '🚫 E-mail VAI BOUNCER — não envie!'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{emailValidation.reason}</p>
                {emailValidation.domainCheck && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    MX Records: {emailValidation.domainCheck.hasMx ? '✅ Sim' : '❌ Não'} |
                    Pode receber: {emailValidation.domainCheck.canReceiveEmail ? '✅ Sim' : '❌ Não'}
                    {emailValidation.domainCheck.mxRecords.length > 0 && ` | ${emailValidation.domainCheck.mxRecords[0]}`}
                  </p>
                )}
              </div>
            )}

            <Separator className="bg-border/30" />

            {/* ACTION BUTTONS */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {currentEmailId && (
                  <Badge variant="outline" className="text-xs">{t('emails.draft')}</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {/* VALIDATE */}
                {selectedContact && !emailValidation && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => validateMutation.mutate({ email: selectedContact.email, contactId: selectedContact.id })}
                    disabled={validateMutation.isPending}
                    className="text-xs"
                  >
                    {validateMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-1 h-3 w-3" />}
                    Verificar E-mail
                  </Button>
                )}

                {/* COPY TO CLIPBOARD */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyEmail}
                  className="text-xs"
                >
                  {copied ? <Check className="mr-1 h-3 w-3 text-emerald-400" /> : <Copy className="mr-1 h-3 w-3" />}
                  {copied ? 'Copiado!' : 'Copiar E-mail'}
                </Button>

                {/* SAVE DRAFT */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={!currentEmailId || saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                  {t('emails.saveDraft')}
                </Button>

                {/* SEND — with validation */}
                <Button
                  size="sm"
                  onClick={handleValidateAndSend}
                  disabled={!selectedContact?.email || !emailSubject}
                  className={
                    emailValidation?.riskLevel === 'CRITICAL'
                      ? 'bg-red-600 text-white hover:bg-red-700 opacity-70'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }
                >
                  <Send className="mr-1 h-3 w-3" /> Enviar E-mail
                </Button>
              </div>
            </div>

            {/* Info box */}
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs text-emerald-300/80">
                <strong>Enviar E-mail</strong> abre seu cliente de e-mail (Gmail, Outlook, etc.) com o e-mail preenchido.
                A assinatura é adicionada automaticamente. <strong>SEMPRE verifique o e-mail antes de enviar</strong> para evitar bounce.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!hasContent && (
        <Card className="border-dashed border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Mail className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="mb-2 text-lg font-medium text-muted-foreground">{t('emails.generateYourEmail')}</h3>
            <p className="max-w-md text-center text-sm text-muted-foreground/70">
              {t('emails.generateDesc')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* BOUNCE WARNING DIALOG */}
      <AlertDialog open={showBounceWarning} onOpenChange={setShowBounceWarning}>
        <AlertDialogContent className="bg-card border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              {emailValidation?.riskLevel === 'CRITICAL' ? '🚫 E-mail VAI BOUNCER!' : '⚠️ Risco de Bounce'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-foreground">
              <p>
                {emailValidation?.riskLevel === 'CRITICAL'
                  ? 'O domínio deste e-mail NÃO existe ou NÃO pode receber mensagens. Se você enviar, o e-mail VAI voltar com erro de bounce.'
                  : 'Este e-mail tem alto risco de bounce. O domínio pode não aceitar mensagens ou o endereço pode não existir.'}
              </p>
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm">
                <p><strong>E-mail:</strong> {selectedContact?.email}</p>
                <p><strong>Domínio:</strong> {selectedContact?.email?.split('@')[1]}</p>
                <p><strong>MX Records:</strong> {emailValidation?.domainCheck?.hasMx ? '✅ Existe' : '❌ NÃO existe'}</p>
                <p><strong>Pode receber:</strong> {emailValidation?.domainCheck?.canReceiveEmail ? '✅ Sim' : '❌ NÃO'}</p>
                <p><strong>Confiança:</strong> {emailValidation?.confidence}%</p>
                <p className="mt-1 text-xs text-muted-foreground">{emailValidation?.reason}</p>
              </div>
              <p className="text-sm text-red-300">
                <strong>Recomendação:</strong> NÃO envie para este e-mail. Pesquise o e-mail correto no site da empresa ou pule este lead.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-emerald-600 text-white hover:bg-emerald-700">
              ✅ Cancelar — Não enviar
            </AlertDialogCancel>
            {emailValidation?.riskLevel !== 'CRITICAL' && (
              <AlertDialogAction
                onClick={() => { setShowBounceWarning(false); doSendEmail() }}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                ⚠️ Enviar mesmo assim (arriscado)
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Signature Configuration Dialog */}
      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="bg-card border-border/50 max-w-lg">
          <DialogHeader>
            <DialogTitle className="gold-text flex items-center gap-2">
              <Settings className="h-5 w-5" /> Configurar Assinatura
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm">Nome *</Label>
                <Input
                  value={signature.name}
                  onChange={(e) => setSignature({ ...signature, name: e.target.value })}
                  placeholder="Seu nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Cargo</Label>
                <Input
                  value={signature.title}
                  onChange={(e) => setSignature({ ...signature, title: e.target.value })}
                  placeholder="Creative Director"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">E-mail *</Label>
                <Input
                  type="email"
                  value={signature.email}
                  onChange={(e) => setSignature({ ...signature, email: e.target.value })}
                  placeholder="seuemail@apexmind.com"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Site</Label>
                <Input
                  value={signature.website}
                  onChange={(e) => setSignature({ ...signature, website: e.target.value })}
                  placeholder="https://apexmind.com"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-sm">Telefone</Label>
                <Input
                  value={signature.phone}
                  onChange={(e) => setSignature({ ...signature, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            {signature.name && (
              <div className="rounded-lg border border-border/30 bg-muted/20 p-4">
                <p className="text-[10px] text-muted-foreground mb-2">Pré-visualização:</p>
                <div className="text-sm">
                  <p className="font-semibold">{signature.name}</p>
                  {signature.title && <p className="text-muted-foreground">{signature.title}</p>}
                  <p className="text-primary">ApexMind Advertising Agency</p>
                  {signature.email && <p className="text-primary">{signature.email}</p>}
                  {signature.website && <p className="text-primary">{signature.website}</p>}
                  {signature.phone && <p className="text-muted-foreground">{signature.phone}</p>}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatureOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveSignature}
              disabled={!signature.name}
              className="gold-gradient text-black font-semibold hover:opacity-90"
            >
              Salvar Assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
