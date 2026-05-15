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
import { Mail, Loader2, Sparkles, Send, Save, RotateCcw, User } from 'lucide-react'
import { toast } from 'sonner'

export function EmailGenerator() {
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [selectedContactId, setSelectedContactId] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [currentEmailId, setCurrentEmailId] = useState<string | null>(null)

  const queryClient = useQueryClient()

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
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      toast.success('Email generated successfully!')
    },
    onError: () => {
      toast.error('Failed to generate email. Please try again.')
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
        toast.success('Email marked as sent!')
      } else {
        toast.success('Email saved as draft!')
      }
    },
    onError: () => {
      toast.error('Failed to save email')
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
      if (data.isValid) {
        toast.success(`Email appears valid (${data.confidence}% confidence)`)
      } else {
        toast.warning(`Email may not be valid: ${data.reason}`)
      }
    },
    onError: () => {
      toast.error('Email validation failed')
    },
  })

  const handleGenerate = () => {
    if (!selectedLeadId || !selectedContactId) {
      toast.error('Please select a lead and contact first')
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

  const leads = leadsData?.leads || []
  const contacts = leadData?.lead?.contacts || []
  const selectedContact = contacts.find((c: { id: string }) => c.id === selectedContactId)

  return (
    <div className="space-y-6">
      {/* Selection Panel */}
      <Card className="card-glow border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-5 w-5 text-primary" />
            Email Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Select Lead</Label>
              <Select value={selectedLeadId} onValueChange={(v) => { setSelectedLeadId(v); setSelectedContactId(''); setEmailSubject(''); setEmailBody(''); setCurrentEmailId(null) }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a lead..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {leads.map((lead: { id: string; companyName: string; city: string; region: string }) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.companyName} — {lead.city}, {lead.region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Select Contact</Label>
              <Select value={selectedContactId} onValueChange={setSelectedContactId} disabled={!selectedLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder={selectedLeadId ? 'Choose a contact...' : 'Select a lead first'} />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((contact: { id: string; name: string; title: string; email: string }) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name} ({contact.title})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedContact && (
            <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/20 p-3">
              <User className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{selectedContact.name} — {selectedContact.title}</p>
                <p className="text-xs text-muted-foreground">{selectedContact.email}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => validateMutation.mutate({ email: selectedContact.email, contactId: selectedContact.id })}
                disabled={validateMutation.isPending}
              >
                {validateMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Validate Email
              </Button>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={!selectedLeadId || !selectedContactId || generateMutation.isPending}
            className="gold-gradient text-black font-semibold hover:opacity-90"
            size="lg"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Email
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Email Editor */}
      {(emailSubject || emailBody) && (
        <Card className="card-glow border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Email Preview</CardTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={generateMutation.isPending}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Regenerate
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Subject</Label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Body</Label>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={12}
                className="text-sm leading-relaxed resize-none"
              />
            </div>

            <Separator className="bg-border/30" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {currentEmailId && (
                  <Badge variant="outline" className="text-xs">Draft</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={!currentEmailId || saveMutation.isPending}
                >
                  <Save className="mr-1 h-3 w-3" /> Save Draft
                </Button>
                <Button
                  size="sm"
                  onClick={handleMarkSent}
                  disabled={!currentEmailId || saveMutation.isPending}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Send className="mr-1 h-3 w-3" /> Mark as Sent
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!emailSubject && !emailBody && (
        <Card className="border-dashed border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Mail className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="mb-2 text-lg font-medium text-muted-foreground">Generate Your Email</h3>
            <p className="max-w-md text-center text-sm text-muted-foreground/70">
              Select a lead and contact above, then click &quot;Generate Email&quot; to create a personalized cold email powered by AI.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
