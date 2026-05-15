'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, Globe, Star, MessageSquare, AlertTriangle, ExternalLink, Mail, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

const INDUSTRIES = [
  'Restaurant & Food Service',
  'Real Estate',
  'Healthcare & Medical',
  'Legal Services',
  'Home Services',
  'Automotive',
  'Retail & E-commerce',
  'Fitness & Wellness',
  'Construction',
  'Financial Services',
  'Education',
  'Technology',
  'Marketing & Advertising',
  'Hospitality & Travel',
  'Manufacturing',
  'Professional Services',
]

const REGIONS = [
  { value: 'USA', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'CANADA', label: 'Canada' },
  { value: 'AUSTRALIA', label: 'Australia' },
]

interface ProspectLead {
  id: string
  companyName: string
  city: string
  state?: string | null
  country: string
  website?: string | null
  industry?: string | null
  websiteScore?: number | null
  brandScore?: number | null
  communicationScore?: number | null
  marketingNeed?: string | null
  hasAwards: boolean
  region: string
  status: string
}

export function Prospecting() {
  const [region, setRegion] = useState('USA')
  const [industry, setIndustry] = useState('')
  const [city, setCity] = useState('')
  const [customQuery, setCustomQuery] = useState('')
  const [results, setResults] = useState<ProspectLead[]>([])

  const queryClient = useQueryClient()

  const prospectMutation = useMutation({
    mutationFn: async (data: { query: string; region: string; city: string; industry: string }) => {
      const res = await fetch('/api/prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Prospecting failed')
      return res.json()
    },
    onSuccess: (data) => {
      setResults(data.leads || [])
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success(`Found ${data.total} new leads!`)
    },
    onError: () => {
      toast.error('Prospecting failed. Please try again.')
    },
  })

  const researchMutation = useMutation({
    mutationFn: async (data: { companyName: string; website?: string; leadId: string }) => {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Research failed')
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success(`Deep research completed for ${variables.companyName}`)
    },
    onError: () => {
      toast.error('Research failed. Please try again.')
    },
  })

  const emailMutation = useMutation({
    mutationFn: async (data: { leadId: string; contactId: string }) => {
      const res = await fetch('/api/emails/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Email generation failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      toast.success('Email generated! Check the Email Generator tab.')
    },
    onError: () => {
      toast.error('No contacts found. Run deep research first to add contacts.')
    },
  })

  const handleProspect = () => {
    prospectMutation.mutate({
      query: customQuery,
      region,
      city,
      industry,
    })
  }

  const getScoreColor = (score: number | null | undefined) => {
    if (!score) return 'text-muted-foreground'
    if (score <= 3) return 'text-red-400'
    if (score <= 6) return 'text-yellow-400'
    return 'text-emerald-400'
  }

  const getMarketingNeedColor = (need: string | null | undefined) => {
    switch (need) {
      case 'HIGH': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'LOW': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card className="card-glow border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-5 w-5 text-primary" />
            AI Prospecting Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map(i => (
                    <SelectItem key={i} value={i}>{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">City</Label>
              <Input
                placeholder="e.g. Oklahoma City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Custom Query</Label>
              <Input
                placeholder="e.g. plumbers with bad websites"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleProspect}
            disabled={prospectMutation.isPending}
            className="gold-gradient text-black font-semibold hover:opacity-90"
            size="lg"
          >
            {prospectMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Prospecting...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Start Prospecting
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">
            Found {results.length} Leads
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {results.map((lead) => (
              <Card key={lead.id} className="card-glow border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-200 hover:border-primary/30">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-semibold">{lead.companyName}</h4>
                      <p className="text-sm text-muted-foreground">
                        {lead.city}{lead.state ? `, ${lead.state}` : ''} · {lead.country}
                      </p>
                    </div>
                    <Badge className={getMarketingNeedColor(lead.marketingNeed)} variant="outline">
                      {lead.marketingNeed || 'N/A'}
                    </Badge>
                  </div>

                  {lead.website && (
                    <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Globe className="h-3 w-3" />
                      <span className="truncate">{lead.website}</span>
                    </div>
                  )}

                  {lead.industry && (
                    <div className="mb-3">
                      <Badge variant="secondary" className="text-xs">{lead.industry}</Badge>
                    </div>
                  )}

                  {/* Scores */}
                  <div className="mb-3 flex gap-3">
                    <div className="flex items-center gap-1 text-xs">
                      <Globe className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Web:</span>
                      <span className={`font-semibold ${getScoreColor(lead.websiteScore)}`}>
                        {lead.websiteScore || '-'}/10
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <Star className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Brand:</span>
                      <span className={`font-semibold ${getScoreColor(lead.brandScore)}`}>
                        {lead.brandScore || '-'}/10
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <MessageSquare className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Comm:</span>
                      <span className={`font-semibold ${getScoreColor(lead.communicationScore)}`}>
                        {lead.communicationScore || '-'}/10
                      </span>
                    </div>
                  </div>

                  {lead.hasAwards && (
                    <div className="mb-3 flex items-center gap-1 text-xs text-primary">
                      <AlertTriangle className="h-3 w-3" />
                      Has Awards — mention in outreach
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => researchMutation.mutate({
                        companyName: lead.companyName,
                        website: lead.website || undefined,
                        leadId: lead.id,
                      })}
                      disabled={researchMutation.isPending}
                    >
                      {researchMutation.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Search className="mr-1 h-3 w-3" />
                      )}
                      Deep Research
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => {
                        // Fetch lead contacts first, then generate email
                        fetch(`/api/leads/${lead.id}`)
                          .then(r => r.json())
                          .then(data => {
                            const contact = data.lead?.contacts?.[0]
                            if (contact) {
                              emailMutation.mutate({ leadId: lead.id, contactId: contact.id })
                            } else {
                              toast.error('No contacts found. Run deep research first.')
                            }
                          })
                      }}
                      disabled={emailMutation.isPending}
                    >
                      {emailMutation.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Mail className="mr-1 h-3 w-3" />
                      )}
                      Generate Email
                    </Button>
                    {lead.website && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => window.open(lead.website!, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!prospectMutation.isPending && results.length === 0 && (
        <Card className="border-dashed border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Search className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="mb-2 text-lg font-medium text-muted-foreground">Start Your Search</h3>
            <p className="max-w-md text-center text-sm text-muted-foreground/70">
              Configure your search parameters above and click &quot;Start Prospecting&quot; to find companies that need better advertising. Our AI will search the web for businesses with poor marketing presence.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
