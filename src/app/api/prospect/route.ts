import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { callOpenRouter } from '@/lib/ai'
import { scrapeBusinessEmails } from '@/lib/web-search'
import { validateEmail } from '@/lib/email-validator'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { region, city, industry } = body

    console.log(`[PROSPECT] Starting: region=${region}, city=${city}, industry=${industry}`)

    const regionName = region === 'UK' ? 'United Kingdom'
      : region === 'CANADA' ? 'Canada'
      : region === 'AUSTRALIA' ? 'Australia'
      : 'United States'

    const cityName = city || 'small towns'
    const industryHint = industry ? `Focus on ${industry} businesses.` : 'Include diverse small businesses: restaurants, dentists, plumbers, electricians, salons, auto repair, etc.'

    // ===== STEP 1: Use LLM to find real businesses =====
    console.log(`[PROSPECT] Using LLM to find businesses in ${cityName}, ${regionName}`)

    const systemPrompt = `You are a business directory assistant with knowledge of REAL small businesses across ${regionName}. 

IMPORTANT RULES:
- Only list businesses you believe are REAL — do NOT fabricate or invent businesses
- If you're not confident a business exists, do NOT include it
- Website URLs should be realistic but use null if you're not sure
- Prefer businesses that likely have OUTDATED or POOR marketing (small local businesses)
- Include a variety of industries
- Focus on businesses that could benefit from better advertising services

Return ONLY a JSON array. Each object:
{
  "companyName": "string (real business name)",
  "city": "string",
  "state": "string (abbreviation)",
  "country": "string",
  "website": "string or null (actual URL if known, null if unsure)",
  "industry": "string",
  "snippet": "string (1-2 sentence description)"
}

No markdown, no explanation, ONLY the JSON array.`

    const userMessage = `Find 8-10 real small businesses in or near ${cityName}, ${regionName}.
${industryHint}
These should be LOCAL small businesses that could benefit from better advertising and marketing services.
Include their actual business names. Website URLs if known, otherwise null.`

    let businesses: any[] = []
    try {
      const result = await callOpenRouter(systemPrompt, userMessage, {
        temperature: 0.7,
        maxTokens: 2048,
      })
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        businesses = JSON.parse(jsonMatch[0])
      }
    } catch (err) {
      console.error('[PROSPECT] LLM search failed:', err)
    }

    console.log(`[PROSPECT] LLM returned ${businesses.length} businesses`)

    if (businesses.length === 0) {
      return NextResponse.json({
        leads: [],
        total: 0,
        message: 'No businesses found. Try a specific city and industry for better results.',
      })
    }

    // ===== STEP 2: Process each business =====
    const savedLeads = []
    const MAX = 8
    let mxVerified = 0
    let noEmail = 0

    for (let i = 0; i < businesses.length && savedLeads.length < MAX; i++) {
      const biz = businesses[i]
      if (!biz.companyName || !biz.city) continue

      const companyName = String(biz.companyName).trim()
      const bizCity = String(biz.city).trim()
      const bizState = biz.state ? String(biz.state).trim() : null
      const bizCountry = biz.country || region || 'USA'
      const website = biz.website && biz.website.startsWith('http') ? String(biz.website).trim() : null
      const bizIndustry = biz.industry || industry || null
      const snippet = biz.snippet || ''

      console.log(`[PROSPECT] Processing [${savedLeads.length + 1}/${MAX}]: ${companyName}`)

      // Scrape website for emails
      let emails: Array<{ email: string; source: string; isBusinessDomain: boolean }> = []
      let phones: string[] = []
      let homepageSnippet = ''

      if (website) {
        try {
          const scrapeResult = await scrapeBusinessEmails(website, companyName)
          emails = scrapeResult.emails
          phones = scrapeResult.phones
          homepageSnippet = scrapeResult.homepageTextSnippet
        } catch (err) {
          console.log(`[PROSPECT] Scrape failed for ${website}:`, err instanceof Error ? err.message : 'unknown')
        }
      }

      // Find best email with MX check
      let bestEmail = ''
      let emailVerified = false
      let smtpStatus = 'NO_EMAIL'
      let validationConfidence = 0

      if (emails.length > 0) {
        // Sort: business domain first
        const sorted = [...emails].sort((a, b) => {
          if (a.isBusinessDomain && !b.isBusinessDomain) return -1
          if (!a.isBusinessDomain && b.isBusinessDomain) return 1
          return 0
        })

        const candidate = sorted[0]
        try {
          const mxResult = await validateEmail(candidate.email)
          if (mxResult.canSend || mxResult.domainCheck?.canReceiveEmail) {
            bestEmail = candidate.email
            emailVerified = true
            smtpStatus = 'MX_VALID'
            validationConfidence = mxResult.confidence || 75
            mxVerified++
          } else {
            bestEmail = candidate.email
            emailVerified = false
            smtpStatus = 'MX_FAILED'
            validationConfidence = 30
          }
        } catch {
          bestEmail = candidate.email
          emailVerified = false
          smtpStatus = 'MX_ERROR'
          validationConfidence = 25
        }
      } else {
        noEmail++
      }

      // Score
      const scores = heuristicScore(snippet, homepageSnippet)

      // Save to database
      try {
        // Check if exists
        const existing = await db.lead.findFirst({
          where: { companyName, city: bizCity }
        })

        if (existing) {
          // Update with new info
          if (bestEmail) {
            const existingContact = await db.contact.findFirst({
              where: { leadId: existing.id, email: bestEmail }
            })
            if (!existingContact) {
              await db.contact.create({
                data: {
                  leadId: existing.id,
                  name: 'Owner/Manager',
                  title: 'Owner/Manager',
                  email: bestEmail,
                  emailValidated: emailVerified,
                  emailBounced: smtpStatus === 'MX_FAILED',
                }
              })
            }
          }
          await db.lead.update({
            where: { id: existing.id },
            data: {
              websiteScore: scores.websiteScore,
              brandScore: scores.brandScore,
              communicationScore: scores.communicationScore,
              marketingNeed: scores.marketingNeed as any,
              notes: scores.notes || existing.notes,
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
            companyName,
            address: null,
            city: bizCity,
            state: bizState,
            country: bizCountry,
            website,
            industry: bizIndustry || scores.industry,
            companySize: scores.companySize,
            websiteScore: scores.websiteScore,
            brandScore: scores.brandScore,
            communicationScore: scores.communicationScore,
            marketingNeed: scores.marketingNeed as any,
            hasAwards: false,
            awardDetails: null,
            notes: scores.notes,
            region: region || 'USA',
            status: 'NEW',
          }
        })

        if (bestEmail) {
          await db.contact.create({
            data: {
              leadId: lead.id,
              name: 'Owner/Manager',
              title: 'Owner/Manager',
              email: bestEmail,
              emailValidated: emailVerified,
              emailBounced: smtpStatus === 'MX_FAILED',
            }
          })
        }

        const fullLead = await db.lead.findUnique({
          where: { id: lead.id },
          include: { contacts: true }
        })
        savedLeads.push(fullLead || lead)
      } catch (saveErr) {
        console.error('[PROSPECT] Save error:', saveErr)
      }
    }

    console.log(`[PROSPECT] Complete: ${savedLeads.length} leads saved (MX: ${mxVerified}, No email: ${noEmail})`)

    return NextResponse.json({
      leads: savedLeads,
      total: savedLeads.length,
      verificationSummary: {
        smtpVerified: 0,
        mxOnlyVerified: mxVerified,
        noVerifiedEmail: noEmail,
        totalProcessed: savedLeads.length,
      },
      searchInfo: {
        citiesSearched: [cityName],
        totalResults: businesses.length,
        filteredResults: businesses.length,
        processedResults: savedLeads.length,
      }
    })
  } catch (error) {
    console.error('Prospecting error:', error)
    const message = error instanceof Error ? error.message : 'Prospecting failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ===== HELPER =====
function heuristicScore(snippet: string, homepageSnippet: string) {
  const text = (snippet + ' ' + homepageSnippet).toLowerCase()
  let websiteScore = 6
  if (text.includes('copyright 201') || text.includes('copyright 2020')) websiteScore = 3
  if (text.includes('under construction')) websiteScore = 2
  if (text.length < 200) websiteScore = 3
  let brandScore = 5
  if (text.includes('welcome to') && text.includes('website')) brandScore = 3
  if (text.includes('award') || text.includes('certified')) brandScore = 7
  let communicationScore = 5
  if (!text.includes('@') && !text.includes('contact')) communicationScore = 3
  if (text.includes('call us') || text.includes('phone')) communicationScore = 6
  if (text.includes('schedule') || text.includes('appointment')) communicationScore = 7
  const marketingNeed = (websiteScore <= 4 || brandScore <= 4) ? 'HIGH'
    : (websiteScore <= 6 || brandScore <= 6) ? 'MEDIUM' : 'LOW'

  const industry = guessIndustry(snippet)
  return {
    websiteScore, brandScore, communicationScore, marketingNeed, industry,
    companySize: '1-10',
    notes: marketingNeed === 'HIGH'
      ? 'Significant room for marketing improvement — strong prospect for ApexMind.'
      : 'Moderate marketing potential — could benefit from professional advertising.',
  }
}

function guessIndustry(snippet: string): string {
  const lower = snippet.toLowerCase()
  const map: Record<string, string[]> = {
    'Dental': ['dental', 'dentist', 'orthodontist'],
    'Legal Services': ['law firm', 'attorney', 'lawyer'],
    'Restaurant & Food Service': ['restaurant', 'cafe', 'bakery', 'diner', 'pizza', 'bbq'],
    'Healthcare & Medical': ['medical', 'clinic', 'physician', 'chiropractic'],
    'Home Services': ['plumbing', 'electrician', 'hvac', 'roofing', 'landscaping'],
    'Automotive': ['auto', 'car', 'mechanic', 'tire'],
    'Real Estate': ['real estate', 'realtor', 'property'],
    'Fitness & Wellness': ['gym', 'fitness', 'yoga', 'spa', 'salon'],
    'Construction': ['construction', 'building', 'contractor'],
    'Retail & E-commerce': ['store', 'shop', 'retail', 'boutique'],
    'Financial Services': ['bank', 'insurance', 'accounting'],
    'Pet Services': ['vet', 'pet', 'grooming'],
    'Funeral Services': ['funeral', 'cemetery', 'cremation'],
  }
  for (const [ind, keywords] of Object.entries(map)) {
    if (keywords.some(k => lower.includes(k))) return ind
  }
  return 'Professional Services'
}
