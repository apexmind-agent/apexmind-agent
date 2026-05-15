/**
 * ApexMind Email Validator — MX-based validation
 * Extracted from /api/emails/validate for reuse in prospecting
 */

import dns from 'dns'

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

export interface MxCheckResult {
  hasMx: boolean
  mxRecords: string[]
  canReceiveEmail: boolean
}

export interface EmailValidationResult {
  isValid: boolean
  confidence: number
  canSend: boolean
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  reason: string
  domainCheck: MxCheckResult
}

const FREE_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'protonmail.com', 'mail.com', 'zoho.com', 'yandex.com',
]

const DISPOSABLE_DOMAINS = [
  'guerrillamail.com', 'mailinator.com', 'tempmail.com', 'throwaway.email',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'dispostable.com',
]

export async function checkDomainMx(domain: string): Promise<MxCheckResult> {
  try {
    const mxRecords = await resolveMx(domain)
    if (mxRecords.length === 0) {
      return { hasMx: false, mxRecords: [], canReceiveEmail: false }
    }
    const mxHosts = mxRecords.map(r => r.exchange)
    return { hasMx: true, mxRecords: mxHosts, canReceiveEmail: true }
  } catch {
    try {
      const nsRecords = await resolveNs(domain)
      if (nsRecords.length === 0) {
        return { hasMx: false, mxRecords: [], canReceiveEmail: false }
      }
      return { hasMx: false, mxRecords: [], canReceiveEmail: false }
    } catch {
      return { hasMx: false, mxRecords: [], canReceiveEmail: false }
    }
  }
}

export async function validateEmail(email: string): Promise<EmailValidationResult> {
  const domain = email.split('@')[1]?.toLowerCase()
  const localPart = email.split('@')[0]?.toLowerCase()

  if (!domain || !localPart) {
    return {
      isValid: false,
      confidence: 0,
      canSend: false,
      riskLevel: 'CRITICAL',
      reason: 'Invalid email format',
      domainCheck: { hasMx: false, mxRecords: [], canReceiveEmail: false },
    }
  }

  const hasValidFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const isDisposable = DISPOSABLE_DOMAINS.includes(domain)
  const mxCheck = await checkDomainMx(domain)

  let confidence = 0
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'HIGH'
  const reasons: string[] = []

  if (hasValidFormat) {
    confidence += 10
    reasons.push('Valid email format')
  } else {
    reasons.push('Invalid email format')
    riskLevel = 'CRITICAL'
  }

  if (mxCheck.canReceiveEmail) {
    confidence += 40
    reasons.push(`Domain has MX records (${mxCheck.mxRecords[0]})`)
    riskLevel = 'MEDIUM'
  } else {
    reasons.push('Domain has NO MX records')
    riskLevel = 'CRITICAL'
  }

  const isFreeProvider = FREE_PROVIDERS.includes(domain)
  if (isFreeProvider) {
    confidence += 5
    reasons.push('Free email provider')
    if (riskLevel === 'MEDIUM') riskLevel = 'HIGH'
  } else if (mxCheck.canReceiveEmail) {
    confidence += 15
    reasons.push('Custom business domain')
    if (riskLevel === 'MEDIUM') riskLevel = 'LOW'
  }

  const hasBusinessPattern = /^(info|contact|hello|hi|admin|office|support|sales|marketing|manager|owner|[a-z]+\.[a-z]+|[a-z]+_[a-z]+)$/i.test(localPart)
  if (hasBusinessPattern) {
    confidence += 10
    reasons.push('Business email pattern')
  }

  const hasSpamPattern = /(test|example|asdf|qwerty|xxx|spam|fake|nobody)/i.test(email)
  if (hasSpamPattern) {
    confidence -= 30
    reasons.push('Suspicious pattern')
    riskLevel = 'CRITICAL'
  }

  if (isDisposable) {
    confidence = 0
    reasons.push('Disposable email domain')
    riskLevel = 'CRITICAL'
  }

  confidence = Math.max(0, Math.min(100, confidence))
  const isValid = confidence >= 60 && mxCheck.canReceiveEmail
  const canSend = isValid || (mxCheck.canReceiveEmail && confidence >= 40)

  if (!mxCheck.canReceiveEmail) {
    return {
      isValid: false,
      confidence,
      canSend: false,
      riskLevel: 'CRITICAL',
      reason: reasons.join('. '),
      domainCheck: mxCheck,
    }
  }

  return {
    isValid,
    confidence,
    canSend,
    riskLevel,
    reason: reasons.join('. '),
    domainCheck: mxCheck,
  }
}
