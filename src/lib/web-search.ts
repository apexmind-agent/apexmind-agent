/**
 * ApexMind Real Web Search & Scraping
 *
 * Uses z-ai-web-dev-sdk for web search (local dev)
 * and direct fetch for page scraping.
 *
 * NO AI FABRICATION — all data comes from real web sources.
 */

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

// ===== Z-AI WEB SEARCH (local dev) =====

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

// ===== DIRECT FETCH (fallback) =====

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

export async function searchBusinesses(query: string, num: number = 10): Promise<WebSearchResult[]> {
  // Try z-ai SDK (local dev)
  const zaiResults = await zaiWebSearch(query, num)
  if (zaiResults.length > 0) {
    console.log(`[WEB-SEARCH] z-ai found ${zaiResults.length} results for "${query}"`)
    return zaiResults
  }

  // NO AI FABRICATION FALLBACK — return empty
  console.log(`[WEB-SEARCH] No results found for "${query}"`)
  return []
}

// ===== PAGE READING (memory-optimized) =====

async function readPageAndExtract(
  url: string,
  companyDomain?: string,
  source: ExtractedEmail['source'] = 'homepage'
): Promise<{ emails: ExtractedEmail[]; phones: string[]; textSnippet: string }> {
  // Try z-ai page_reader first (with timeout)
  let pageResult = await zaiReadPage(url)

  // Fallback to direct fetch (with timeout)
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

  // Extract data IMMEDIATELY and discard HTML
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

const CONTACT_PAGE_PATTERNS = [
  '/contact', '/contact-us', '/about', '/about-us',
  '/reach-us', '/get-in-touch', '/connect',
]

export async function scrapeBusinessEmails(
  websiteUrl: string,
  companyName: string
): Promise<{ emails: ExtractedEmail[]; phones: string[]; homepageTextSnippet: string }> {
  const allEmails: ExtractedEmail[] = []
  const allPhones: string[] = []
  let homepageTextSnippet = ''

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

  // Step 2: If no emails on homepage, try contact page only (speed)
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

  // Step 3: No email search fallback (too slow)

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
    // Specific city + industry
    queries.push(`${industry} in ${city} ${regionName}`)
    queries.push(`${industry} business ${city} contact website`)
    queries.push(`${industry} ${city} ${regionName} small business`)
    queries.push(`${industry} near ${city} ${regionName}`)
  } else if (city) {
    // Specific city, no industry
    queries.push(`small businesses in ${city} ${regionName} contact website`)
    queries.push(`local services ${city} ${regionName}`)
    queries.push(`${city} ${regionName} business directory contact`)
    queries.push(`restaurants clinics shops ${city} ${regionName}`)
  } else if (industry) {
    // Industry, no specific city
    queries.push(`${industry} small town ${regionName} contact website`)
    queries.push(`${industry} small business ${regionName} email`)
  } else {
    // No filters
    queries.push(`small businesses small town ${regionName} website contact`)
    queries.push(`local services small city ${regionName} business`)
  }

  return queries
}
