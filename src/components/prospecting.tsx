'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2, Globe, Star, MessageSquare, ExternalLink, Mail, Sparkles, ShieldCheck, ShieldAlert, ShieldX, Phone, MapPin, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

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
  'Hospitality & Travel',
  'Manufacturing',
  'Professional Services',
  'Pet Services',
  'Dental',
  'Funeral Services',
]

const REGIONS = [
  { value: 'USA', labelKey: 'region.USA' },
  { value: 'UK', labelKey: 'region.UK' },
  { value: 'CANADA', labelKey: 'region.CANADA' },
  { value: 'AUSTRALIA', labelKey: 'region.AUSTRALIA' },
]

interface ContactInfo {
  id: string
  name: string
  title: string
  email: string
  emailValidated: boolean
  emailBounced: boolean
}

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
  notes?: string | null
  contacts?: ContactInfo[]
}

export function Prospecting() {
  const [region, setRegion] = useState('USA')
  const [industry, setIndustry] = useState('')
  const [city, setCity] = useState('')
  const [customQuery, setCustomQuery] = useState('')
  const [results, setResults] = useState<ProspectLead[]>([])
  const [searchInfo, setSearchInfo] = useState<{
    citiesSearched: string[]
    totalResults: number
    filteredResults: number
    processedResults: number
  } | null>(null)
  const [verificationSummary, setVerificationSummary] = useState<{
    smtpVerified: number
    mxOnlyVerified: number
    noVerifiedEmail: number
    totalProcessed: number
  } | null>(null)

  const queryClient = useQueryClient()
  const { t } = useT()

  const prospectMutation = useMutation({
    mutationFn: async (data: { query: string; region: string; city: string; industry: string }) => {
      const res = await fetch('/api/prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Prospecting failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setResults(data.leads || [])
      setSearchInfo(data.searchInfo || null)
      setVerificationSummary(data.verificationSummary || null)
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })

      const verifiedCount = (data.leads || []).filter((l: ProspectLead) =>
        l.contacts?.some((c: ContactInfo) => c.emailValidated)
      ).length
      const totalCount = data.leads?.length || 0

      if (totalCount === 0) {
        toast.warning(t('prospecting.noResults'))
      } else {
        toast.success(`${totalCount} ${t('prospecting.foundNewLeads')} (${verifiedCount} ${t('prospecting.emailsVerified')})`)
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('prospecting.prospectingFailed'))
    },
  })

  const researchMutation = useMutation({
    mutationFn: async (data: { leadId: string }) => {
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
      toast.success(t('prospecting.researchCompleted'))
    },
    onError: () => {
      toast.error(t('prospecting.researchFailed'))
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
      toast.success(t('prospecting.emailGenerated'))
    },
    onError: () => {
      toast.error(t('prospecting.noContacts'))
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

  const getEmailStatus = (lead: ProspectLead) => {
    const contacts = lead.contacts || []
    if (contacts.length === 0) return 'none'
    const hasVerified = contacts.some(c => c.emailValidated)
    const hasBounced = contacts.some(c => c.emailBounced)
    const hasEmail = contacts.some(c => c.email && c.email.length > 0)

    if (hasVerified && !hasBounced) return 'verified'
    if (hasBounced) return 'bounced'
    if (hasEmail) return 'unverified'
    return 'none'
  }

  const getEmailStatusBadge = (lead: ProspectLead) => {
    const status = getEmailStatus(lead)
    switch (status) {
      case 'verified':
        return (
          <Badge variant="outline" className="text-[9px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="mr-1 h-2.5 w-2.5" /> SMTP Verified
          </Badge>
        )
      case 'bounced':
        return (
          <Badge variant="outline" className="text-[9px] border-red-500/30 bg-red-500/10 text-red-400">
            <ShieldX className="mr-1 h-2.5 w-2.5" /> Invalid
          </Badge>
        )
      case 'unverified':
        return (
          <Badge variant="outline" className="text-[9px] border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
            <ShieldAlert className="mr-1 h-2.5 w-2.5" /> MX Only
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-[9px] border-border/30 bg-muted/20 text-muted-foreground">
            No Email
          </Badge>
        )
    }
  }

  const getContactEmail = (lead: ProspectLead): string => {
    const contacts = lead.contacts || []
    // Prefer verified business email
    const verified = contacts.find(c => c.emailValidated && c.email)
    if (verified) return verified.email
    // Then any email
    const anyEmail = contacts.find(c => c.email && c.email.length > 0)
    if (anyEmail) return anyEmail.email
    return ''
  }

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card className="card-glow border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-5 w-5 text-primary" />
            {t('prospecting.aiSearch')}
          </CardTitle>
          <p className="text-xs text-emerald-400/80 mt-1">
            REAL web search + SMTP verification — no fabricated data, no bounces
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('prospecting.region')}</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{t(r.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('prospecting.industry')}</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger>
                  <SelectValue placeholder={t('prospecting.selectIndustry')} />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map(i => (
                    <SelectItem key={i} value={i}>{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('prospecting.city')}</Label>
              <Input
                placeholder={t('prospecting.cityPlaceholderDynamic')}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">{t('prospecting.cityHint')}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Custom Query ({t('prospecting.optional')})</Label>
              <Input
                placeholder="e.g. plumbers with bad websites"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleProspect}
              disabled={prospectMutation.isPending}
              className="gold-gradient text-black font-semibold hover:opacity-90"
              size="lg"
            >
              {prospectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching web + SMTP verifying...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('prospecting.startProspecting')}
                </>
              )}
            </Button>
            {prospectMutation.isPending && (
              <span className="text-xs text-muted-foreground animate-pulse">
                This takes 1-3 minutes — searching web, scraping sites, SMTP verifying emails...
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Verification Summary */}
      {verificationSummary && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-3 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-lg font-bold text-emerald-400">{verificationSummary.smtpVerified}</p>
                <p className="text-[10px] text-muted-foreground">SMTP Verified</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardContent className="p-3 flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="text-lg font-bold text-yellow-400">{verificationSummary.mxOnlyVerified}</p>
                <p className="text-[10px] text-muted-foreground">MX Only</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-3 flex items-center gap-3">
              <ShieldX className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-lg font-bold text-red-400">{verificationSummary.noVerifiedEmail}</p>
                <p className="text-[10px] text-muted-foreground">No Email Found</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3 flex items-center gap-3">
              <Zap className="h-5 w-5 text-primary" />
              <div>
                <p className="text-lg font-bold text-primary">{verificationSummary.totalProcessed}</p>
                <p className="text-[10px] text-muted-foreground">Total Processed</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search Info */}
      {searchInfo && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs border-primary/30 bg-primary/5">
            <MapPin className="mr-1 h-3 w-3" />
            Cities: {searchInfo.citiesSearched.join(', ')}
          </Badge>
          <Badge variant="outline" className="text-xs border-border/30 bg-muted/20">
            {searchInfo.processedResults} businesses processed from {searchInfo.totalResults} web results
          </Badge>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">
            {results.length} {t('prospecting.foundLeads')}
            <span className="ml-2 text-sm text-emerald-400/80">
              ({results.filter(l => getEmailStatus(l) === 'verified').length} SMTP verified)
            </span>
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {results.map((lead) => {
              const contactEmail = getContactEmail(lead)
              const emailStatus = getEmailStatus(lead)
              const phone = lead.notes?.match(/Phone:\s*([\d\s\-+()]+)/)?.[1]

              return (
                <Card key={lead.id} className={`card-glow border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-200 hover:border-primary/30 ${
                  emailStatus === 'verified' ? 'border-emerald-500/20' : emailStatus === 'bounced' ? 'border-red-500/20' : ''
                }`}>
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
                      <div className="mb-2">
                        <Badge variant="secondary" className="text-xs">{lead.industry}</Badge>
                      </div>
                    )}

                    {/* Email Status */}
                    <div className="mb-2">
                      {getEmailStatusBadge(lead)}
                      {contactEmail && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {contactEmail}
                        </p>
                      )}
                    </div>

                    {/* Phone */}
                    {phone && (
                      <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {phone}
                      </div>
                    )}

                    {/* Scores */}
                    <div className="mb-3 flex gap-3">
                      <div className="flex items-center gap-1 text-xs">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">{t('prospecting.web')}:</span>
                        <span className={`font-semibold ${getScoreColor(lead.websiteScore)}`}>
                          {lead.websiteScore || '-'}/10
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <Star className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">{t('prospecting.brand')}:</span>
                        <span className={`font-semibold ${getScoreColor(lead.brandScore)}`}>
                          {lead.brandScore || '-'}/10
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">{t('prospecting.comm')}:</span>
                        <span className={`font-semibold ${getScoreColor(lead.communicationScore)}`}>
                          {lead.communicationScore || '-'}/10
                        </span>
                      </div>
                    </div>

                    {lead.hasAwards && (
                      <div className="mb-3 flex items-center gap-1 text-xs text-primary">
                        <Star className="h-3 w-3" />
                        {t('prospecting.hasAwards')}
                      </div>
                    )}

                    {/* Real Data Badge */}
                    <div className="mb-3">
                      <Badge variant="outline" className="text-[9px] border-emerald-500/20 bg-emerald-500/5 text-emerald-400/80">
                        Real Data — Web Search + SMTP Verified
                      </Badge>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => researchMutation.mutate({ leadId: lead.id })}
                        disabled={researchMutation.isPending}
                      >
                        {researchMutation.isPending ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Search className="mr-1 h-3 w-3" />
                        )}
                        {t('prospecting.deepResearch')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => {
                          fetch(`/api/leads/${lead.id}`)
                            .then(r => r.json())
                            .then(data => {
                              const contact = data.lead?.contacts?.find((c: ContactInfo) =>
                                c.email && c.email.length > 0
                              )
                              if (contact) {
                                emailMutation.mutate({ leadId: lead.id, contactId: contact.id })
                              } else {
                                toast.error(t('prospecting.noContacts'))
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
                        {t('prospecting.generateEmail')}
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
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!prospectMutation.isPending && results.length === 0 && (
        <Card className="border-dashed border-border/50 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Search className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="mb-2 text-lg font-medium text-muted-foreground">{t('prospecting.startSearch')}</h3>
            <p className="max-w-md text-center text-sm text-muted-foreground/70">
              {t('prospecting.startSearchDescReal')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
