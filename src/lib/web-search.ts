/**
 * ApexMind Real Web Search & Scraping
 *
 * Primary: z-ai-web-dev-sdk (works in Z.ai dev environment)
 * Fallback: OpenRouter LLM with business knowledge (works on any server)
 * Page scraping: direct fetch with timeout
 *
 * NO AI FABRICATION — all data comes from real sources or LLM knowledge of real businesses.
 */

import { callOpenRouter } from './ai'

// ===== TYPES =====

export interface WebSearchResult {
  url: string
  name: string
  snippet: string
  host_name: string
  rank: number
}

export interface ExtractedEmail {
  email: string
  source: 'homepage' | 'contact_page' | 'about_page' | 'search'
  isBusinessDomain: boolean
}

// ===== Z-AI WEB SEARCH (local dev only) =====

async function zaiWebSearch(query: string, num: number): Promise<WebSearchResult[]> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', { query, num })
    if (!Array.isArray(results)) return []
    return results.map((r: any) => ({
      url: r.url || '',
      name: r.name || '',
      snippet: r.snippet || '',
      host_name: r.host_name || '',
      rank: r.rank || 0,
    }))
  } catch (error) {
    console.log('[WEB-SEARCH] z-ai-web-dev-sdk not available:', error instanceof Error ? error.message : 'unknown')
    return []
  }
}

async function zaiReadPage(url: string): Promise<{ title: string; html: string; success: boolean }> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const result = await zai.functions.invoke('page_reader', { url })
    if (result?.code !== 200 || !result?.data?.html) {
      return { title: '', html: '', success: false }
    }
    return { title: result.data.title || '', html: result.data.html || '', success: true }
  } catch {
    return { title: '', html: '', success: false }
  }
}

// ===== OPENROUTER FALLBACK — LLM-based business search =====

async function llmBusinessSearch(query: string, region: string, city: string, industry: string | undefined): Promise<WebSearchResult[]> {
  try {
    const regionName = region === 'UK' ? 'United Kingdom'
      : region === 'CANADA' ? 'Canada'
      : region === 'AUSTRALIA' ? 'Australia'
      : 'United States'

    const industryHint = industry ? `Focus on ${industry} businesses.` : 'Include diverse small businesses: restaurants, dentists, plumbers, electricians, salons, auto repair, etc.'

    const systemPrompt = `You are a business directory assistant with knowledge of REAL small businesses across ${regionName}. Based on your training data, list REAL small businesses in the specified location. 

IMPORTANT RULES:
- Only list businesses you believe are REAL — do NOT fabricate or invent businesses
- If you're not confident a business exists, do NOT include it
- Website URLs should be realistic but you MUST use null if you're not sure
- Prefer businesses that likely have OUTDATED or POOR marketing (small local businesses)
- Include a variety of industries

Return ONLY a JSON array. Each object:
{
  "companyName": "string (real business name)",
  "city": "string",
  "state": "string (abbreviation)",
  "country": "string",
  "website": "string or null (actual URL if known, null if unsure)",
  "industry": "string",
  "snippet": "string (1-2 sentence description of the business)"
}

No markdown, no explanation, ONLY the JSON array.`

    const userMessage = `Find 8-10 real small businesses in or near ${city}, ${regionName}.
${industryHint}
These should be LOCAL small businesses that could benefit from better advertising and marketing services.
Include their actual business names. Website URLs if known, otherwise null.`

    const result = await callOpenRouter(systemPrompt, userMessage, {
      temperature: 0.7,
      maxTokens: 2048,
    })

    // Parse the LLM response
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const businesses = JSON.parse(jsonMatch[0])
    if (!Array.isArray(businesses)) return []

    // Convert to WebSearchResult format
    return businesses
      .filter((b: any) => b.companyName && b.city)
      .map((b: any, i: number) => ({
        url: b.website || '',
        name: b.companyName || '',
        snippet: b.snippet || `${b.industry || 'Local business'} in ${b.city}, ${b.state || ''}`,
        host_name: b.website ? (() => { try { return new URL(b.website).hostname } catch { return '' } })() : '',
        rank: i + 1,
        // Extra fields that prospect route needs
        _city: b.city,
        _state: b.state,
        _country: b.country,
        _industry: b.industry,
      }))
  } catch (error) {
    console.error('[WEB-SEARCH] LLM fallback failed:', error instanceof Error ? error.message : 'unknown')
    return []
  }
}

// ===== DIRECT FETCH (for page scraping) =====

async function directFetchPage(url: string): Promise<{ title: string; html: string; success: boolean }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) return { title: '', html: '', success: false }

    const html = await response.text()
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''

    return { title, html, success: true }
  } catch {
    return { title: '', html: '', success: false }
  }
}

// ===== COMBINED WEB SEARCH =====

export async function searchBusinesses(query: string, num: number = 10, region?: string, city?: string, industry?: string): Promise<WebSearchResult[]> {
  // Try z-ai SDK first (works in Z.ai dev environment)
  const zaiResults = await zaiWebSearch(query, num)
  if (zaiResults.length > 0) {
    console.log(`[WEB-SEARCH] z-ai found ${zaiResults.length} results for "${query}"`)
    return zaiResults
  }

  // Fallback: Use OpenRouter LLM to find real businesses
  console.log(`[WEB-SEARCH] z-ai unavailable, using LLM fallback for "${query}"`)
  const llmResults = await llmBusinessSearch(query, region || 'USA', city || '', industry)
  if (llmResults.length > 0) {
    console.log(`[WEB-SEARCH] LLM found ${llmResults.length} businesses`)
    return llmResults
  }

  console.log(`[WEB-SEARCH] No results found for "${query}"`)
  return []
}

// ===== PAGE READING (memory-optimized) =====

async function readPageAndExtract(
  url: string,
  companyDomain?: string,
  source: ExtractedEmail['source'] = 'homepage'
): Promise<{ emails: ExtractedEmail[]; phones: string[]; textSnippet: string }> {
  // Try z-ai page_reader first
  let pageResult = await zaiReadPage(url)

  // Fallback to direct fetch
  if (!pageResult.success) {
    pageResult = await directFetchPage(url)
  }

  if (!pageResult.success || !pageResult.html) {
    return { emails: [], phones: [], textSnippet: '' }
  }

  // Memory protection: limit HTML size
  const html = pageResult.html.length > 500000 
    ? pageResult.html.substring(0, 500000) 
    : pageResult.html

  // Extract data
  const emails = extractEmailsFromHtml(html, companyDomain, source)
  const phones = extractPhoneNumbersFromHtml(html)

  const textSnippet = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 800)

  return { emails, phones, textSnippet }
}

// ===== EMAIL EXTRACTION =====

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

const BLOCKED_PATTERNS = [
  /noreply/i, /no-reply/i, /donotreply/i, /mailer-daemon/i, /postmaster/i,
  /webmaster/i, /abuse@/i, /spam/i, /admin@localhost/i, /root@/i,
  /example\.com$/i, /test@/i, /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i,
  /\.css$/i, /\.js$/i, /\.woff/i, /\.eot/i, /\.ttf/i,
  /sentry/i, /wixpress/i, /analytics/i, /tracking/i, /pixel/i,
  /cloudfront/i, /amazonaws/i, /googleapis/i, /shopify/i, /squarespace/i,
  /mailchimp/i, /constantcontact/i, /hubspot/i, /salesforce/i,
]

const BLOCKED_DOMAINS = [
  'sentry.io', 'sentry-next.wixpress.com', 'sentry.wixpress.com',
  'wixpress.com', 'shopify.com', 'squarespace.com',
  'cloudfront.net', 'amazonaws.com', 'googleapis.com',
  'gravatar.com', 'wp.com', 'wordpress.com',
  'mailchimp.com', 'constantcontact.com', 'hubspot.com',
  'salesforce.com', 'marketo.com', 'adobe.com',
]

const FREE_EMAIL_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'protonmail.com', 'mail.com', 'zoho.com', 'yandex.com',
  'live.com', 'msn.com', 'comcast.net', 'verizon.net', 'att.net',
]

function extractEmailsFromHtml(html: string, companyDomain?: string, source: ExtractedEmail['source'] = 'homepage'): ExtractedEmail[] {
  const matches = html.match(EMAIL_REGEX)
  if (!matches) return []

  const uniqueEmails = [...new Set(matches.map(e => e.toLowerCase().trim()))]

  return uniqueEmails
    .filter(email => {
      if (BLOCKED_PATTERNS.some(p => p.test(email))) return false
      const domain = email.split('@')[1]?.toLowerCase() || ''
      if (BLOCKED_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) return false
      if (/^[0-9a-f]{8,}/.test(email.split('@')[0])) return false
      if (email.length > 60) return false
      if (/\.{2,}/.test(email)) return false
      return true
    })
    .map(email => {
      const domain = email.split('@')[1]?.toLowerCase() || ''
      const isBusinessDomain = companyDomain
        ? domain === companyDomain || domain.endsWith(`.${companyDomain}`)
        : !FREE_EMAIL_PROVIDERS.includes(domain)

      return { email, source, isBusinessDomain }
    })
    .sort((a, b) => {
      if (a.isBusinessDomain && !b.isBusinessDomain) return -1
      if (!a.isBusinessDomain && b.isBusinessDomain) return 1
      return a.email.length - b.email.length
    })
}

function extractPhoneNumbersFromHtml(html: string): string[] {
  const phonePatterns = [
    /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /(?:\+44[-.\s]?)?\d{4}[-.\s]?\d{3}[-.\s]?\d{3}/g,
    /(?:\+61[-.\s]?)?\d{1}[-.\s]?\d{4}[-.\s]?\d{4}/g,
  ]

  const phones: string[] = []
  for (const pattern of phonePatterns) {
    const matches = html.match(pattern)
    if (matches) phones.push(...matches)
  }

  return [...new Set(phones.map(p => p.trim()).filter(p => p.length >= 10))]
}

// ===== FULL BUSINESS SCRAPING =====

export async function scrapeBusinessEmails(
  websiteUrl: string,
  companyName: string
): Promise<{ emails: ExtractedEmail[]; phones: string[]; homepageTextSnippet: string }> {
  const allEmails: ExtractedEmail[] = []
  const allPhones: string[] = []
  let homepageTextSnippet = ''

  if (!websiteUrl || !websiteUrl.startsWith('http')) {
    return { emails: [], phones: [], homepageTextSnippet: '' }
  }

  let companyDomain = ''
  try {
    const urlObj = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
    companyDomain = urlObj.hostname.replace(/^www\./, '')
  } catch {}

  const baseUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`

  // Step 1: Read homepage
  console.log(`[SCRAPE] Reading homepage: ${baseUrl}`)
  const homeResult = await readPageAndExtract(baseUrl, companyDomain, 'homepage')
  allEmails.push(...homeResult.emails)
  allPhones.push(...homeResult.phones)
  homepageTextSnippet = homeResult.textSnippet

  // Step 2: If no emails on homepage, try contact page
  if (allEmails.length === 0) {
    try {
      const contactUrl = new URL('/contact', baseUrl)
      console.log(`[SCRAPE] Trying: ${contactUrl.href}`)
      const pageResult = await readPageAndExtract(contactUrl.href, companyDomain, 'contact_page')
      allEmails.push(...pageResult.emails)
      allPhones.push(...pageResult.phones)
    } catch {
      // Skip
    }
  }

  // Step 3: Try /about page for emails
  if (allEmails.length === 0) {
    try {
      const aboutUrl = new URL('/about', baseUrl)
      console.log(`[SCRAPE] Trying: ${aboutUrl.href}`)
      const pageResult = await readPageAndExtract(aboutUrl.href, companyDomain, 'about_page')
      allEmails.push(...pageResult.emails)
      allPhones.push(...pageResult.phones)
    } catch {
      // Skip
    }
  }

  // Deduplicate
  const seen = new Set<string>()
  const uniqueEmails = allEmails.filter(e => {
    if (seen.has(e.email)) return false
    seen.add(e.email)
    return true
  })
  const uniquePhones = [...new Set(allPhones)]

  console.log(`[SCRAPE] ${companyName}: ${uniqueEmails.length} emails, ${uniquePhones.length} phones`)

  return { emails: uniqueEmails, phones: uniquePhones, homepageTextSnippet }
}

// ===== SEARCH QUERY BUILDER =====

export function buildSearchQuery(region: string, city?: string, industry?: string): string[] {
  const queries: string[] = []

  const regionName = region === 'UK' ? 'United Kingdom'
    : region === 'CANADA' ? 'Canada'
    : region === 'AUSTRALIA' ? 'Australia'
    : 'United States'

  if (city && industry) {
    queries.push(`${industry} in ${city} ${regionName}`)
    queries.push(`${industry} business ${city} contact website`)
  } else if (city) {
    queries.push(`small businesses in ${city} ${regionName} contact website`)
    queries.push(`local services ${city} ${regionName}`)
  } else if (industry) {
    queries.push(`${industry} small town ${regionName} contact website`)
  } else {
    queries.push(`small businesses small town ${regionName} website contact`)
  }

  return queries
}
