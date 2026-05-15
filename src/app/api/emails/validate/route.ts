import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import dns from 'dns'

export const maxDuration = 30

// Promisify DNS resolve
const resolveMx = (domain: string): Promise<dns.MxRecord[]> => {
  return new Promise((resolve, reject) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err) reject(err)
      else resolve(addresses || [])
    })
  })
}

const resolveNs = (domain: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    dns.resolveNs(domain, (err, addresses) => {
      if (err) reject(err)
      else resolve(addresses || [])
    })
  })
}

// Check if domain has valid MX records (can receive email)
async function checkDomainMx(domain: string): Promise<{ hasMx: boolean; mxRecords: string[]; canReceiveEmail: boolean }> {
  try {
    const mxRecords = await resolveMx(domain)
    if (mxRecords.length === 0) {
      return { hasMx: false, mxRecords: [], canReceiveEmail: false }
    }
    const mxHosts = mxRecords.map(r => r.exchange)
    return { hasMx: true, mxRecords: mxHosts, canReceiveEmail: true }
  } catch {
    // No MX records - try checking NS records as fallback
    try {
      const nsRecords = await resolveNs(domain)
      if (nsRecords.length === 0) {
        return { hasMx: false, mxRecords: [], canReceiveEmail: false }
      }
      // Domain exists but has no MX records - might not accept email
      return { hasMx: false, mxRecords: [], canReceiveEmail: false }
    } catch {
      // Domain doesn't exist at all
      return { hasMx: false, mxRecords: [], canReceiveEmail: false }
    }
  }
}

// Check common disposable/free domains
const FREE_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'protonmail.com', 'mail.com', 'zoho.com', 'yandex.com',
]

const DISPOSABLE_DOMAINS = [
  'guerrillamail.com', 'mailinator.com', 'tempmail.com', 'throwaway.email',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'dispostable.com',
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, contactId } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const domain = email.split('@')[1]?.toLowerCase()
    const localPart = email.split('@')[0]?.toLowerCase()

    if (!domain || !localPart) {
      return NextResponse.json({
        isValid: false,
        confidence: 0,
        canSend: false,
        reason: 'Invalid email format',
        riskLevel: 'HIGH'
      })
    }

    // Step 1: Format validation
    const hasValidFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    // Step 2: Disposable domain check
    const isDisposable = DISPOSABLE_DOMAINS.includes(domain)

    // Step 3: REAL DNS/MX validation
    const mxCheck = await checkDomainMx(domain)

    // Step 4: Scoring
    let confidence = 0
    let isValid = false
    let canSend = false
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'HIGH'
    const reasons: string[] = []

    // Format check
    if (hasValidFormat) {
      confidence += 10
      reasons.push('Valid email format')
    } else {
      reasons.push('Invalid email format')
      riskLevel = 'CRITICAL'
    }

    // MX Record check — THE MOST IMPORTANT
    if (mxCheck.canReceiveEmail) {
      confidence += 40
      canSend = true
      reasons.push(`Domain has MX records (${mxCheck.mxRecords[0]}) — can receive email`)
      riskLevel = 'MEDIUM' // Still need more checks
    } else if (mxCheck.hasMx) {
      confidence += 20
      reasons.push('Domain has MX but verification inconclusive')
      riskLevel = 'HIGH'
    } else {
      confidence += 0
      canSend = false
      reasons.push('⚠️ Domain has NO MX records — will BOUNCE')
      riskLevel = 'CRITICAL'
    }

    // Business vs personal
    const isFreeProvider = FREE_PROVIDERS.includes(domain)
    if (isFreeProvider) {
      confidence += 5
      reasons.push('Free email provider (personal, not business)')
      riskLevel = 'HIGH' // Business emails should use custom domains
    } else if (mxCheck.canReceiveEmail) {
      confidence += 15
      reasons.push('Custom business domain')
      if (riskLevel === 'MEDIUM') riskLevel = 'LOW'
    }

    // Pattern checks
    const hasBusinessPattern = /^(info|contact|hello|hi|admin|office|support|sales|marketing|manager|owner|[a-z]+\.[a-z]+|[a-z]+_[a-z]+)$/i.test(localPart)
    if (hasBusinessPattern) {
      confidence += 10
      reasons.push('Looks like a business email pattern')
    }

    // Spam patterns
    const hasSpamPattern = /(test|example|asdf|qwerty|xxx|spam|fake|nobody)/i.test(email)
    if (hasSpamPattern) {
      confidence -= 30
      reasons.push('Contains suspicious pattern')
      riskLevel = 'CRITICAL'
    }

    if (isDisposable) {
      confidence = 0
      reasons.push('Disposable email domain')
      riskLevel = 'CRITICAL'
      canSend = false
    }

    // Final assessment
    confidence = Math.max(0, Math.min(100, confidence))
    isValid = confidence >= 60 && mxCheck.canReceiveEmail
    canSend = isValid || (mxCheck.canReceiveEmail && confidence >= 40)

    // If domain can't receive email, can't send
    if (!mxCheck.canReceiveEmail) {
      canSend = false
      isValid = false
    }

    // Update contact
    if (contactId) {
      try {
        await db.contact.update({
          where: { id: contactId },
          data: {
            emailValidated: isValid,
            emailBounced: !mxCheck.canReceiveEmail,
          }
        })
      } catch {
        // Contact might not exist
      }
    }

    return NextResponse.json({
      isValid,
      confidence,
      canSend,
      riskLevel,
      reason: reasons.join('. '),
      domainCheck: {
        hasMx: mxCheck.hasMx,
        canReceiveEmail: mxCheck.canReceiveEmail,
        mxRecords: mxCheck.mxRecords,
      }
    })
  } catch (error) {
    console.error('Email validation error:', error)
    return NextResponse.json({
      isValid: false,
      confidence: 0,
      canSend: false,
      riskLevel: 'CRITICAL',
      reason: 'Validation failed — treat as unsafe to send'
    })
  }
}
