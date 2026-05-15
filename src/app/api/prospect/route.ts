import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { selectCities, callOpenRouter } from '@/lib/ai'
import { searchBusinesses, scrapeBusinessEmails, buildSearchQuery, type WebSearchResult } from '@/lib/web-search'
import { verifyEmailSmtp, type SmtpVerificationResult } from '@/lib/smtp-verifier'
import { validateEmail } from '@/lib/email-validator'

export const maxDuration = 300 // 5 minutes — this is a heavy operation

interface ProcessedBusiness {
  companyName: string
  website: string
  snippet: string
  city: string
  state?: string
  country: string
  industry?: string
  emails: Array<{
    email: string
    source: 'homepage' | 'contact_page' | 'about_page' | 'search'
    isBusinessDomain: boolean
  }>
  phoneNumbers: string[]
  emailVerified: boolean
  smtpVerified: boolean
  smtpStatus: string
  validationConfidence: number
  websiteScore: number
  brandScore: number
  communicationScore: number
  marketingNeed: string
  notes: string
  companySize: string
  hasAwards: boolean
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { region, city, industry } = body

    console.log(`[PROSPECT] Starting REAL web search: region=${region}, city=${city}, industry=${industry}`)

    // ===== STEP 1: Determine cities to search =====
    let citiesToSearch: Array<{ city: string; state: string; country: string }>

    if (city) {
      const countryName = region === 'UK' ? 'United Kingdom'
        : region === 'CANADA' ? 'Canada'
        : region === 'AUSTRALIA' ? 'Australia'
        : 'USA'
      citiesToSearch = [{ city, state: '', country: countryName }]
    } else {
      try {
        const selectedCities = await selectCities(region || 'USA', 3)
        citiesToSearch = selectedCities.map(c => ({
          city: c.city,
          state: c.state,
          country: c.country,
        }))
        console.log(`[PROSPECT] AI selected cities:`, citiesToSearch.map(c => `${c.city}, ${c.state}`).join('; '))
      } catch {
        citiesToSearch = [{ city: 'Council Bluffs', state: 'IA', country: 'USA' }]
      }
    }

    // ===== STEP 2: Web search for businesses in each city =====
    // NO MORE AI FABRICATION — if web search finds nothing, we return nothing.
    const allSearchResults: Array<WebSearchResult & { searchCity: string; searchState: string; searchCountry: string }> = []

    for (const cityObj of citiesToSearch) {
      const queries = buildSearchQuery(region || 'USA', cityObj.city, industry)

      // Try up to 2 queries per city for speed
      for (const query of queries.slice(0, 2)) {
        try {
          const results = await searchBusinesses(query, 10)
          console.log(`[PROSPECT] Search "${query}" returned ${results.length} results`)

          for (const result of results) {
            allSearchResults.push({
              ...result,
              searchCity: cityObj.city,
              searchState: cityObj.state,
              searchCountry: cityObj.country,
            })
          }
        } catch (error) {
          console.error(`[PROSPECT] Search failed for "${query}":`, error)
        }
      }

      // Additional targeted searches for emails
      if (industry) {
        try {
          const emailQuery = `${industry} ${cityObj.city} contact email`
          const emailResults = await searchBusinesses(emailQuery, 10)
          for (const result of emailResults) {
            allSearchResults.push({
              ...result,
              searchCity: cityObj.city,
              searchState: cityObj.state,
              searchCountry: cityObj.country,
            })
          }
        } catch {}
      }
    }

    // NO AI FABRICATION FALLBACK — if web search found nothing, return honest result
    if (allSearchResults.length === 0) {
      return NextResponse.json({
        leads: [],
        total: 0,
        message: 'No businesses found via web search. Try different criteria, a specific city, or a different industry. The system only uses REAL data from the web — no fabricated results.',
      })
    }

    // ===== STEP 3: Filter and deduplicate results =====
    const filteredResults = filterSearchResults(allSearchResults, industry)
    console.log(`[PROSPECT] After filtering: ${filteredResults.length} unique businesses (from ${allSearchResults.length} raw results)`)

    // ===== STEP 4: Process each business — scrape emails, SMTP verify, score =====
    const processedBusinesses: ProcessedBusiness[] = []
    const MAX_BUSINESSES = 6

    for (let i = 0; i < filteredResults.length && processedBusinesses.length < MAX_BUSINESSES; i++) {
      const result = filteredResults[i]

      // Skip if no valid URL
      if (!result.url || !result.url.startsWith('http')) continue

      // Skip directory sites and social media
      if (isDirectoryOrSocial(result.url, result.host_name)) continue

      console.log(`[PROSPECT] Processing [${processedBusinesses.length + 1}/${MAX_BUSINESSES}]: ${result.name} (${result.url})`)

      try {
        // Scrape the website for emails and contact info
        const { emails, phones, homepageTextSnippet } = await scrapeBusinessEmails(result.url, result.name)

        const homepageSnippet = homepageTextSnippet || ''

        // ===== SMTP VERIFICATION of emails =====
        let bestEmail = ''
        let emailVerified = false
        let smtpVerified = false
        let smtpStatus = 'NO_EMAIL'
        let validationConfidence = 0

        if (emails.length > 0) {
          // Quick MX check on top 3 emails only (speed)
          const mxCheckedEmails: Array<{ email: string; source: any; isBusinessDomain: boolean; mxOk: boolean }> = []

          for (const e of emails.slice(0, 3)) {
            try {
              const mxResult = await validateEmail(e.email)
              mxCheckedEmails.push({
                ...e,
                mxOk: mxResult.canSend || mxResult.domainCheck.canReceiveEmail,
              })
            } catch {
              mxCheckedEmails.push({ ...e, mxOk: false })
            }
          }

          // Prioritize: business domain + MX ok > business domain > any MX ok > any
          const sortedEmails = mxCheckedEmails.sort((a, b) => {
            if (a.isBusinessDomain && a.mxOk && (!b.isBusinessDomain || !b.mxOk)) return -1
            if (b.isBusinessDomain && b.mxOk && (!a.isBusinessDomain || !a.mxOk)) return 1
            if (a.isBusinessDomain && !b.isBusinessDomain) return -1
            if (b.isBusinessDomain && !a.isBusinessDomain) return 1
            if (a.mxOk && !b.mxOk) return -1
            if (b.mxOk && !a.mxOk) return 1
            return 0
          })

          // Verify only the top candidate (speed)
          const candidate = sortedEmails[0]
          console.log(`[PROSPECT] Verifying: ${candidate.email} (MX: ${candidate.mxOk})`)

          try {
            const smtpResult: SmtpVerificationResult = await verifyEmailSmtp(candidate.email)

            console.log(`[PROSPECT] SMTP result: ${candidate.email} → ${smtpResult.status} (confidence: ${smtpResult.confidence}%)`)

            if (smtpResult.status === 'VALID') {
              bestEmail = candidate.email
              emailVerified = true
              smtpVerified = true
              smtpStatus = 'VALID'
              validationConfidence = smtpResult.confidence
            } else if (smtpResult.status === 'CATCH_ALL') {
              bestEmail = candidate.email
              emailVerified = candidate.mxOk
              smtpVerified = false
              smtpStatus = 'CATCH_ALL'
              validationConfidence = 70
            } else if (smtpResult.status === 'INVALID') {
              console.log(`[PROSPECT] ✗ ${candidate.email} — mailbox does NOT exist`)
              // Try second candidate if available
              if (sortedEmails.length > 1 && sortedEmails[1].mxOk) {
                bestEmail = sortedEmails[1].email
                emailVerified = true
                smtpVerified = false
                smtpStatus = 'MX_ONLY_ALT'
                validationConfidence = 50
              }
            } else {
              // MX_ONLY or UNKNOWN — use it if MX check passed
              if (candidate.mxOk) {
                bestEmail = candidate.email
                emailVerified = true
                smtpVerified = false
                smtpStatus = smtpResult.status
                validationConfidence = smtpResult.confidence
              }
            }
          } catch (smtpError) {
            console.log(`[PROSPECT] Verification error for ${candidate.email}:`, smtpError instanceof Error ? smtpError.message : 'unknown')
            if (candidate.mxOk) {
              bestEmail = candidate.email
              emailVerified = true
              smtpVerified = false
              smtpStatus = 'VERIFY_ERROR'
              validationConfidence = 45
            }
          }
        }

        // Score the business using heuristics (fast, no AI call)
        const heuristicScores = heuristicScore(result.snippet, homepageSnippet)

        processedBusinesses.push({
          companyName: cleanCompanyName(result.name),
          website: result.url,
          snippet: result.snippet,
          city: result.searchCity,
          state: result.searchState || undefined,
          country: result.searchCountry,
          industry: heuristicScores.industry || industry || guessIndustry(result.snippet),
          emails,
          phoneNumbers: phones,
          emailVerified,
          smtpVerified,
          smtpStatus,
          validationConfidence,
          websiteScore: heuristicScores.websiteScore,
          brandScore: heuristicScores.brandScore,
          communicationScore: heuristicScores.communicationScore,
          marketingNeed: heuristicScores.marketingNeed,
          notes: heuristicScores.notes,
          companySize: heuristicScores.companySize,
          hasAwards: false,
        })

        const emailLabel = bestEmail ? `${bestEmail} (${smtpVerified ? 'SMTP ✓' : smtpStatus})` : 'NO EMAIL'
        console.log(`[PROSPECT] ✓ ${result.name}: email=${emailLabel}`)
      } catch (error) {
        console.error(`[PROSPECT] Error processing ${result.name}:`, error)
      }
    }

    // ===== STEP 5: Save to database =====
    const savedLeads = []

    for (const biz of processedBusinesses) {
      try {
        const bestEmail = biz.emails[0]?.email || ''

        // Check if company already exists
        const existing = await db.lead.findFirst({
          where: { companyName: biz.companyName, city: biz.city }
        })

        if (existing) {
          // Update existing lead with new info
          const existingContact = await db.contact.findFirst({
            where: { leadId: existing.id, email: bestEmail }
          })

          if (!existingContact && bestEmail) {
            await db.contact.create({
              data: {
                leadId: existing.id,
                name: guessContactName(biz.companyName),
                title: 'Owner/Manager',
                email: bestEmail,
                emailValidated: biz.emailVerified,
                emailBounced: biz.smtpStatus === 'INVALID',
              }
            })
          } else if (existingContact && bestEmail) {
            await db.contact.update({
              where: { id: existingContact.id },
              data: {
                emailValidated: biz.emailVerified,
                emailBounced: biz.smtpStatus === 'INVALID',
              }
            })
          }

          await db.lead.update({
            where: { id: existing.id },
            data: {
              websiteScore: biz.websiteScore,
              brandScore: biz.brandScore,
              communicationScore: biz.communicationScore,
              marketingNeed: biz.marketingNeed as any,
              notes: biz.notes || existing.notes,
            }
          })

          const fullLead = await db.lead.findUnique({
            where: { id: existing.id },
            include: { contacts: true }
          })
          savedLeads.push(fullLead || existing)
          continue
        }

        // Create new lead
        const lead = await db.lead.create({
          data: {
            companyName: biz.companyName,
            address: null,
            city: biz.city,
            state: biz.state || null,
            country: biz.country,
            website: biz.website,
            industry: biz.industry,
            companySize: biz.companySize,
            websiteScore: biz.websiteScore,
            brandScore: biz.brandScore,
            communicationScore: biz.communicationScore,
            marketingNeed: biz.marketingNeed as any,
            hasAwards: biz.hasAwards,
            awardDetails: null,
            notes: biz.notes || null,
            region: region || 'USA',
            status: 'NEW',
          }
        })

        // Create contact with verified email
        if (bestEmail) {
          await db.contact.create({
            data: {
              leadId: lead.id,
              name: guessContactName(biz.companyName),
              title: 'Owner/Manager',
              email: bestEmail,
              emailValidated: biz.emailVerified,
              emailBounced: biz.smtpStatus === 'INVALID',
            }
          })
        }

        // Add secondary emails as additional contacts
        for (let i = 1; i < Math.min(biz.emails.length, 3); i++) {
          const email = biz.emails[i]
          if (email.email !== bestEmail && email.isBusinessDomain) {
            await db.contact.create({
              data: {
                leadId: lead.id,
                name: `Contact (${email.source})`,
                title: email.isBusinessDomain ? 'Business' : 'General',
                email: email.email,
                emailValidated: false,
                emailBounced: false,
              }
            })
          }
        }

        const fullLead = await db.lead.findUnique({
          where: { id: lead.id },
          include: { contacts: true }
        })
        savedLeads.push(fullLead || lead)
      } catch (saveErr) {
        console.error('Save lead error:', saveErr)
      }
    }

    // ===== STEP 6: Log session =====
    try {
      await db.prospectingSession.create({
        data: {
          searchQuery: `${region || 'USA'} ${city || 'AI-selected'} ${industry || ''}`,
          region: region || 'USA',
          city: city || null,
          industry: industry || null,
          status: 'COMPLETED',
          leadsFound: savedLeads.length,
          results: JSON.stringify({
            leadIds: savedLeads.map(l => l.id),
            smtpVerified: processedBusinesses.filter(b => b.smtpVerified).length,
            mxOnly: processedBusinesses.filter(b => b.emailVerified && !b.smtpVerified).length,
            noEmail: processedBusinesses.filter(b => !b.emailVerified).length,
          }),
          completedAt: new Date(),
        }
      })
    } catch {
      // Session logging is non-critical
    }

    const smtpVerifiedCount = processedBusinesses.filter(b => b.smtpVerified).length
    const mxOnlyCount = processedBusinesses.filter(b => b.emailVerified && !b.smtpVerified).length
    const noEmailCount = processedBusinesses.filter(b => !b.emailVerified).length

    console.log(`[PROSPECT] Complete: ${savedLeads.length} leads saved (SMTP verified: ${smtpVerifiedCount}, MX only: ${mxOnlyCount}, No email: ${noEmailCount})`)

    return NextResponse.json({
      leads: savedLeads,
      total: savedLeads.length,
      verificationSummary: {
        smtpVerified: smtpVerifiedCount,
        mxOnlyVerified: mxOnlyCount,
        noVerifiedEmail: noEmailCount,
        totalProcessed: processedBusinesses.length,
      },
      searchInfo: {
        citiesSearched: citiesToSearch.map(c => `${c.city}, ${c.state}`),
        totalResults: allSearchResults.length,
        filteredResults: filteredResults.length,
        processedResults: processedBusinesses.length,
      }
    })
  } catch (error) {
    console.error('Prospecting error:', error)
    const message = error instanceof Error ? error.message : 'Prospecting failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ===== HELPER FUNCTIONS =====

function filterSearchResults(
  results: Array<WebSearchResult & { searchCity: string; searchState: string; searchCountry: string }>,
  industry?: string
): Array<WebSearchResult & { searchCity: string; searchState: string; searchCountry: string }> {
  // Deduplicate by URL domain
  const seen = new Set<string>()
  const filtered = results.filter(r => {
    try {
      const urlObj = new URL(r.url)
      const domain = urlObj.hostname.replace(/^www\./, '')
      if (seen.has(domain)) return false
      seen.add(domain)
      return true
    } catch {
      return false
    }
  })

  // Filter out directory sites, social media, and irrelevant results
  return filtered.filter(r => !isDirectoryOrSocial(r.url, r.host_name))
}

function isDirectoryOrSocial(url: string, hostName: string): boolean {
  const blockedPatterns = [
    'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
    'yelp.com', 'tripadvisor.com', 'yellowpages.com', 'whitepages.com',
    'google.com/maps', 'maps.google', 'goo.gl', 'bit.ly', 'tinyurl.com',
    'wikipedia.org', 'reddit.com', 'pinterest.com', 'tiktok.com',
    'youtube.com', 'angi.com', 'homeadvisor.com', 'thumbtack.com',
    'betterbusinessbureau', 'bbb.org', 'manta.com', 'hotfrog.com',
    'foursquare.com', 'zomato.com', 'opentable.com', 'grubhub.com',
    'doordash.com', 'ubereats.com', 'groupon.com',
    'reddit.com', 'craigslist.org', 'indeed.com', 'ziprecruiter.com',
    'glassdoor.com', 'monster.com', 'zillow.com', 'realtor.com',
    'amazon.com', 'ebay.com', 'etsy.com', 'walmart.com',
    'webmd.com', 'healthgrades.com', 'zocdoc.com',
  ]
  const lower = (url + ' ' + hostName).toLowerCase()
  return blockedPatterns.some(p => lower.includes(p))
}

function cleanCompanyName(name: string): string {
  return name
    .replace(/[-_|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(Home|Welcome|Contact|About)\s*[-–|]?\s*/i, '')
    .replace(/\s*[-–|]\s*(Home|Official Site|Website|Welcome).*$/i, '')
    .trim() || 'Unknown Business'
}

function guessIndustry(snippet: string): string {
  const lower = snippet.toLowerCase()
  const industryMap: Record<string, string[]> = {
    'Dental': ['dental', 'dentist', 'orthodontist'],
    'Legal Services': ['law firm', 'attorney', 'lawyer', 'legal'],
    'Restaurant & Food Service': ['restaurant', 'cafe', 'bakery', 'diner', 'pizza', 'bbq'],
    'Healthcare & Medical': ['medical', 'clinic', 'physician', 'health', 'chiropractic'],
    'Home Services': ['plumbing', 'electrician', 'hvac', 'roofing', 'landscaping'],
    'Automotive': ['auto', 'car', 'mechanic', 'tire', 'dealership'],
    'Real Estate': ['real estate', 'realtor', 'property', 'housing'],
    'Fitness & Wellness': ['gym', 'fitness', 'yoga', 'spa', 'salon'],
    'Construction': ['construction', 'building', 'contractor', 'remodeling'],
    'Retail & E-commerce': ['store', 'shop', 'retail', 'boutique'],
    'Financial Services': ['bank', 'insurance', 'accounting', 'financial'],
    'Pet Services': ['vet', 'pet', 'animal', 'grooming'],
    'Funeral Services': ['funeral', 'cemetery', 'cremation'],
  }

  for (const [industry, keywords] of Object.entries(industryMap)) {
    if (keywords.some(k => lower.includes(k))) return industry
  }
  return 'Professional Services'
}

function guessContactName(companyName: string): string {
  return 'Owner/Manager'
}

function heuristicScore(snippet: string, homepageSnippet: string): {
  websiteScore: number
  brandScore: number
  communicationScore: number
  marketingNeed: string
  industry: string
  companySize: string
  notes: string
} {
  const text = (snippet + ' ' + homepageSnippet).toLowerCase()

  // Website score: lower if outdated patterns found
  let websiteScore = 6
  if (text.includes('copyright 201') || text.includes('copyright 2020') || text.includes('copyright 2021')) websiteScore = 3
  if (text.includes('under construction') || text.includes('coming soon')) websiteScore = 2
  if (text.includes('flash') || text.includes('iframe')) websiteScore = 3
  if (text.includes('wordpress') && text.includes('theme')) websiteScore = 4
  if (text.length < 200) websiteScore = 3 // Very little content

  // Brand score: lower if generic
  let brandScore = 5
  if (text.includes('welcome to') && text.includes('website')) brandScore = 3
  if (text.includes('lorem ipsum')) brandScore = 1
  if (text.includes('default') && text.includes('template')) brandScore = 2
  if (text.includes('award') || text.includes('certified')) brandScore = 7

  // Communication score
  let communicationScore = 5
  if (!text.includes('@') && !text.includes('contact')) communicationScore = 3
  if (text.includes('call us') || text.includes('phone')) communicationScore = 6
  if (text.includes('schedule') || text.includes('appointment') || text.includes('book')) communicationScore = 7
  if (text.includes('free consultation')) communicationScore = 8

  // Marketing need
  const marketingNeed = (websiteScore <= 4 || brandScore <= 4) ? 'HIGH'
    : (websiteScore <= 6 || brandScore <= 6) ? 'MEDIUM' : 'LOW'

  // Industry guess
  const industry = guessIndustry(snippet)

  return {
    websiteScore,
    brandScore,
    communicationScore,
    marketingNeed,
    industry,
    companySize: '1-10',
    notes: marketingNeed === 'HIGH'
      ? 'Significant room for marketing improvement — strong prospect for ApexMind.'
      : 'Moderate marketing potential — could benefit from professional advertising.',
  }
}
