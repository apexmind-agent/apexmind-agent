import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { selectCities, callOpenRouter } from '@/lib/ai'
import { searchBusinesses, scrapeBusinessEmails, buildSearchQuery } from '@/lib/web-search'
import { validateEmail } from '@/lib/email-validator'

export const maxDuration = 300

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
    source: string
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

    console.log(`[PROSPECT] Starting: region=${region}, city=${city}, industry=${industry}`)

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

    // ===== STEP 2: Search for businesses =====
    // Try searchBusinesses (uses z-ai SDK or LLM fallback)
    const allSearchResults: Array<any> = []

    for (const cityObj of citiesToSearch) {
      const queries = buildSearchQuery(region || 'USA', cityObj.city, industry)

      for (const query of queries.slice(0, 2)) {
        try {
          const results = await searchBusinesses(query, 10, region, cityObj.city, industry)
          console.log(`[PROSPECT] Search "${query}" returned ${results.length} results`)

          for (const result of results) {
            // Use _city/_state/_country from LLM results if available, otherwise use cityObj
            allSearchResults.push({
              ...result,
              searchCity: result._city || cityObj.city,
              searchState: result._state || cityObj.state,
              searchCountry: result._country || cityObj.country,
            })
          }
        } catch (error) {
          console.error(`[PROSPECT] Search failed for "${query}":`, error)
        }
      }
    }

    if (allSearchResults.length === 0) {
      return NextResponse.json({
        leads: [],
        total: 0,
        message: 'No businesses found. Try a specific city and industry for better results.',
      })
    }

    // ===== STEP 3: Filter and deduplicate =====
    const filteredResults = filterSearchResults(allSearchResults)
    console.log(`[PROSPECT] After filtering: ${filteredResults.length} unique businesses`)

    // ===== STEP 4: Process businesses — FAST version =====
    // Scrape websites for emails, MX verify (skip SMTP to avoid timeout on Render)
    const processedBusinesses: ProcessedBusiness[] = []
    const MAX_BUSINESSES = 8

    for (let i = 0; i < filteredResults.length && processedBusinesses.length < MAX_BUSINESSES; i++) {
      const result = filteredResults[i]

      // Skip directory sites and social media
      if (isDirectoryOrSocial(result.url || '', result.host_name || '')) continue

      const companyName = cleanCompanyName(result.name)
      const website = result.url || ''
      const snippet = result.snippet || ''

      console.log(`[PROSPECT] Processing [${processedBusinesses.length + 1}/${MAX_BUSINESSES}]: ${companyName}`)

      try {
        let emails: Array<{ email: string; source: string; isBusinessDomain: boolean }> = []
        let phones: string[] = []
        let homepageSnippet = ''

        // Scrape website for emails (only if URL exists and is valid)
        if (website && website.startsWith('http')) {
          try {
            const scrapeResult = await scrapeBusinessEmails(website, companyName)
            emails = scrapeResult.emails
            phones = scrapeResult.phones
            homepageSnippet = scrapeResult.homepageTextSnippet
          } catch (err) {
            console.log(`[PROSPECT] Scrape failed for ${website}:`, err instanceof Error ? err.message : 'unknown')
          }
        }

        // Quick MX validation on top 3 emails (NO SMTP — too slow for Render)
        let bestEmail = ''
        let emailVerified = false
        let smtpVerified = false
        let smtpStatus = 'NO_EMAIL'
        let validationConfidence = 0

        if (emails.length > 0) {
          // Sort: business domain first
          const sorted = [...emails].sort((a, b) => {
            if (a.isBusinessDomain && !b.isBusinessDomain) return -1
            if (!a.isBusinessDomain && b.isBusinessDomain) return 1
            return 0
          })

          // MX check top candidate only (fast)
          const candidate = sorted[0]
          try {
            const mxResult = await validateEmail(candidate.email)
            if (mxResult.canSend || mxResult.domainCheck?.canReceiveEmail) {
              bestEmail = candidate.email
              emailVerified = true
              smtpVerified = false // Can't do SMTP on Render (port 25 blocked)
              smtpStatus = 'MX_VALID'
              validationConfidence = mxResult.confidence || 75
            } else {
              // MX check failed — still use it but mark as unverified
              bestEmail = candidate.email
              emailVerified = false
              smtpVerified = false
              smtpStatus = 'MX_FAILED'
              validationConfidence = 30
            }
          } catch {
            // MX check error — use email anyway
            bestEmail = candidate.email
            emailVerified = false
            smtpVerified = false
            smtpStatus = 'MX_ERROR'
            validationConfidence = 25
          }
        }

        // Score
        const scores = heuristicScore(snippet, homepageSnippet)

        processedBusinesses.push({
          companyName,
          website,
          snippet,
          city: result.searchCity || '',
          state: result.searchState || undefined,
          country: result.searchCountry || 'USA',
          industry: scores.industry || industry || guessIndustry(snippet),
          emails,
          phoneNumbers: phones,
          emailVerified,
          smtpVerified,
          smtpStatus,
          validationConfidence,
          websiteScore: scores.websiteScore,
          brandScore: scores.brandScore,
          communicationScore: scores.communicationScore,
          marketingNeed: scores.marketingNeed,
          notes: scores.notes,
          companySize: scores.companySize,
          hasAwards: false,
        })

        const emailLabel = bestEmail ? `${bestEmail} (${smtpStatus})` : 'NO EMAIL'
        console.log(`[PROSPECT] ✓ ${companyName}: email=${emailLabel}`)
      } catch (error) {
        console.error(`[PROSPECT] Error processing ${companyName}:`, error)
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
          // Update existing lead
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
                emailBounced: biz.smtpStatus === 'MX_FAILED',
              }
            })
          } else if (existingContact && bestEmail) {
            await db.contact.update({
              where: { id: existingContact.id },
              data: {
                emailValidated: biz.emailVerified,
                emailBounced: biz.smtpStatus === 'MX_FAILED',
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
            website: biz.website || null,
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

        // Create contact
        if (bestEmail) {
          await db.contact.create({
            data: {
              leadId: lead.id,
              name: guessContactName(biz.companyName),
              title: 'Owner/Manager',
              email: bestEmail,
              emailValidated: biz.emailVerified,
              emailBounced: biz.smtpStatus === 'MX_FAILED',
            }
          })
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
          results: JSON.stringify({ leadIds: savedLeads.map(l => l.id) }),
          completedAt: new Date(),
        }
      })
    } catch {}

    const mxValidCount = processedBusinesses.filter(b => b.emailVerified).length
    const noEmailCount = processedBusinesses.filter(b => !b.emailVerified).length

    console.log(`[PROSPECT] Complete: ${savedLeads.length} leads saved`)

    return NextResponse.json({
      leads: savedLeads,
      total: savedLeads.length,
      verificationSummary: {
        smtpVerified: 0,
        mxOnlyVerified: mxValidCount,
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

function filterSearchResults(results: Array<any>): Array<any> {
  const seen = new Set<string>()
  return results.filter(r => {
    // Deduplicate by name or URL
    const key = (r.name || '').toLowerCase().trim() + '|' + (r.url || '').toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).filter(r => !isDirectoryOrSocial(r.url || '', r.host_name || ''))
}

function isDirectoryOrSocial(url: string, hostName: string): boolean {
  const blocked = [
    'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
    'yelp.com', 'tripadvisor.com', 'yellowpages.com', 'whitepages.com',
    'google.com/maps', 'maps.google', 'goo.gl', 'bit.ly', 'tinyurl.com',
    'wikipedia.org', 'reddit.com', 'pinterest.com', 'tiktok.com',
    'youtube.com', 'angi.com', 'homeadvisor.com', 'thumbtack.com',
    'bbb.org', 'manta.com', 'hotfrog.com', 'foursquare.com',
    'zomato.com', 'opentable.com', 'grubhub.com', 'doordash.com',
    'ubereats.com', 'groupon.com', 'craigslist.org', 'indeed.com',
    'ziprecruiter.com', 'glassdoor.com', 'monster.com', 'zillow.com',
    'realtor.com', 'amazon.com', 'ebay.com', 'etsy.com', 'walmart.com',
    'webmd.com', 'healthgrades.com', 'zocdoc.com', 'semrush.com',
    'clutch.co', 'hubbiz.com', 'enigma.com',
  ]
  const lower = (url + ' ' + hostName).toLowerCase()
  return blocked.some(p => lower.includes(p))
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
  for (const [ind, keywords] of Object.entries(industryMap)) {
    if (keywords.some(k => lower.includes(k))) return ind
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

  let websiteScore = 6
  if (text.includes('copyright 201') || text.includes('copyright 2020') || text.includes('copyright 2021')) websiteScore = 3
  if (text.includes('under construction') || text.includes('coming soon')) websiteScore = 2
  if (text.includes('wordpress') && text.includes('theme')) websiteScore = 4
  if (text.length < 200) websiteScore = 3

  let brandScore = 5
  if (text.includes('welcome to') && text.includes('website')) brandScore = 3
  if (text.includes('lorem ipsum')) brandScore = 1
  if (text.includes('award') || text.includes('certified')) brandScore = 7

  let communicationScore = 5
  if (!text.includes('@') && !text.includes('contact')) communicationScore = 3
  if (text.includes('call us') || text.includes('phone')) communicationScore = 6
  if (text.includes('schedule') || text.includes('appointment') || text.includes('book')) communicationScore = 7

  const marketingNeed = (websiteScore <= 4 || brandScore <= 4) ? 'HIGH'
    : (websiteScore <= 6 || brandScore <= 6) ? 'MEDIUM' : 'LOW'

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
