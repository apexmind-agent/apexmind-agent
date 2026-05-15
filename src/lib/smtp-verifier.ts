/**
 * ApexMind SMTP Email Verifier
 *
 * Performs REAL SMTP verification by connecting to the mail server
 * and checking if the mailbox actually exists (RCPT TO check).
 *
 * IMPORTANT: SMTP verification requires outbound port 25 access.
 * - On local machines: Port 25 is typically OPEN → SMTP verification works
 * - On cloud/Vercel: Port 25 is typically BLOCKED → Falls back to MX validation
 *
 * Verification levels:
 * - SMTP VALID:   Server confirmed mailbox exists (250 response) → ~99% reliable
 * - SMTP INVALID: Server confirmed mailbox does NOT exist (550 response) → won't bounce
 * - MX ONLY:      Domain has valid MX records but SMTP unreachable → ~85% reliable
 * - UNREACHABLE:  No MX records or DNS failed → likely invalid
 */

import * as net from 'net'
import dns from 'dns'

// ===== TYPES =====

export type SmtpVerificationStatus =
  | 'VALID'        // Mailbox exists (SMTP confirmed)
  | 'INVALID'      // Mailbox does not exist (SMTP confirmed)
  | 'CATCH_ALL'    // Domain accepts all addresses
  | 'MX_ONLY'      // MX records valid but SMTP unreachable (port 25 blocked)
  | 'UNREACHABLE'  // No MX records or DNS failed
  | 'TIMEOUT'      // Connection timed out
  | 'UNKNOWN'      // Ambiguous result

export interface SmtpVerificationResult {
  email: string
  status: SmtpVerificationStatus
  canSend: boolean
  confidence: number         // 0-100
  reason: string
  mxHost: string
  smtpResponse: string
  duration: number
  verificationMethod: 'SMTP' | 'MX_DNS' | 'FORMAT_ONLY'
}

// ===== MX RECORD LOOKUP =====

async function resolveMx(domain: string): Promise<Array<{ priority: number; exchange: string }>> {
  return new Promise((resolve, reject) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err) reject(err)
      else resolve(addresses || [])
    })
  })
}

// ===== CHECK IF PORT 25 IS REACHABLE =====

async function isPort25Reachable(host: string, timeoutMs: number = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)

    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })

    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })

    socket.connect(25, host)
  })
}

// ===== SMTP CONVERSATION HELPERS =====

function readFromSocket(socket: net.Socket, timeoutMs: number = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Read timeout'))
    }, timeoutMs)

    const onData = (chunk: Buffer) => {
      data += chunk.toString()
      const lines = data.split('\r\n')
      const lastLine = lines[lines.length - 2]
      if (lastLine && /^\d{3}\s/.test(lastLine)) {
        clearTimeout(timer)
        socket.removeListener('data', onData)
        resolve(data.trim())
      }
    }

    socket.on('data', onData)
    socket.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function sendCommand(socket: net.Socket, command: string, timeoutMs: number = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    const timer = setTimeout(() => {
      reject(new Error(`Command timeout: ${command.substring(0, 30)}`))
    }, timeoutMs)

    const onData = (chunk: Buffer) => {
      data += chunk.toString()
      const lines = data.split('\r\n')
      const lastLine = lines[lines.length - 2]
      if (lastLine && /^\d{3}\s/.test(lastLine)) {
        clearTimeout(timer)
        socket.removeListener('data', onData)
        resolve(data.trim())
      }
    }

    socket.on('data', onData)
    socket.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    socket.write(command + '\r\n')
  })
}

// ===== ENHANCED MX-BASED VALIDATION (fallback when SMTP unavailable) =====

const FREE_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'protonmail.com', 'mail.com', 'zoho.com', 'yandex.com',
  'live.com', 'msn.com',
]

const DISPOSABLE_DOMAINS = [
  'guerrillamail.com', 'mailinator.com', 'tempmail.com', 'throwaway.email',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'dispostable.com',
]

const BUSINESS_EMAIL_PATTERNS = [
  /^(info|contact|hello|hi|office|support|sales|marketing|manager|owner|admin|billing|service|help|inquiry|enquiries)/i,
  /^[a-z]+\.[a-z]+$/,   // firstname.lastname pattern
  /^[a-z]+_[a-z]+$/,     // firstname_lastname pattern
]

function enhancedMxValidation(email: string, mxRecords: Array<{ priority: number; exchange: string }>): {
  canSend: boolean
  confidence: number
  reason: string
} {
  const domain = email.split('@')[1]?.toLowerCase() || ''
  const localPart = email.split('@')[0]?.toLowerCase() || ''

  const reasons: string[] = []
  let confidence = 0

  // Valid format
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    confidence += 10
    reasons.push('Valid email format')
  }

  // Has MX records
  if (mxRecords.length > 0) {
    confidence += 35
    reasons.push(`Domain has MX records (${mxRecords[0].exchange})`)
  } else {
    return { canSend: false, confidence: 0, reason: 'No MX records — domain cannot receive email' }
  }

  // Business domain (not free provider)
  if (!FREE_PROVIDERS.includes(domain)) {
    confidence += 15
    reasons.push('Business/custom domain')
  } else {
    confidence += 5
    reasons.push('Free email provider')
  }

  // Business email pattern
  if (BUSINESS_EMAIL_PATTERNS.some(p => p.test(localPart))) {
    confidence += 15
    reasons.push('Common business email pattern')
  }

  // Disposable domain check
  if (DISPOSABLE_DOMAINS.includes(domain)) {
    return { canSend: false, confidence: 0, reason: 'Disposable email domain' }
  }

  // Suspicious patterns
  if (/(test|example|asdf|qwerty|xxx|spam|fake|nobody)/i.test(email)) {
    confidence -= 30
    reasons.push('Suspicious pattern detected')
  }

  // Google/Microsoft hosted domains are more reliable
  const mxHost = mxRecords[0].exchange.toLowerCase()
  if (mxHost.includes('google') || mxHost.includes('googlemail')) {
    confidence += 10
    reasons.push('Google Workspace hosted')
  } else if (mxHost.includes('outlook') || mxHost.includes('microsoft') || mxHost.includes('office365')) {
    confidence += 10
    reasons.push('Microsoft 365 hosted')
  }

  confidence = Math.max(0, Math.min(100, confidence))
  const canSend = confidence >= 40 && mxRecords.length > 0

  return { canSend, confidence, reason: reasons.join('. ') }
}

// ===== MAIN VERIFICATION FUNCTION =====

/**
 * Verify if an email address actually exists.
 *
 * Strategy:
 * 1. Try SMTP verification (RCPT TO check) — requires port 25
 * 2. If port 25 blocked (cloud environments), fall back to enhanced MX validation
 *
 * @param email - The email address to verify
 * @param fromDomain - Domain for HELO/MAIL FROM (default: apexmind.com)
 * @param timeoutMs - Overall timeout (default: 15000ms)
 */
export async function verifyEmailSmtp(
  email: string,
  fromDomain: string = 'apexmind.com',
  timeoutMs: number = 15000
): Promise<SmtpVerificationResult> {
  const startTime = Date.now()
  const domain = email.split('@')[1]?.toLowerCase()

  if (!domain) {
    return {
      email,
      status: 'INVALID',
      canSend: false,
      confidence: 0,
      reason: 'Invalid email format — no domain',
      mxHost: '',
      smtpResponse: '',
      duration: Date.now() - startTime,
      verificationMethod: 'FORMAT_ONLY',
    }
  }

  // Step 1: Look up MX records
  let mxRecords: Array<{ priority: number; exchange: string }>
  try {
    mxRecords = await resolveMx(domain)
    if (mxRecords.length === 0) {
      return {
        email,
        status: 'UNREACHABLE',
        canSend: false,
        confidence: 5,
        reason: 'Domain has no MX records — cannot receive email',
        mxHost: '',
        smtpResponse: '',
        duration: Date.now() - startTime,
        verificationMethod: 'MX_DNS',
      }
    }
  } catch {
    return {
      email,
      status: 'UNREACHABLE',
      canSend: false,
      confidence: 5,
      reason: 'DNS lookup failed — domain may not exist',
      mxHost: '',
      smtpResponse: '',
      duration: Date.now() - startTime,
      verificationMethod: 'MX_DNS',
    }
  }

  mxRecords.sort((a, b) => a.priority - b.priority)
  const mxHost = mxRecords[0].exchange

  // Step 2: Try SMTP verification (requires port 25)
  const portReachable = await isPort25Reachable(mxHost, 5000)

  if (!portReachable) {
    // Port 25 blocked — fall back to enhanced MX validation
    const mxResult = enhancedMxValidation(email, mxRecords)
    return {
      email,
      status: mxResult.canSend ? 'MX_ONLY' : 'UNREACHABLE',
      canSend: mxResult.canSend,
      confidence: mxResult.confidence,
      reason: `[Port 25 blocked — SMTP unavailable] ${mxResult.reason}`,
      mxHost,
      smtpResponse: '',
      duration: Date.now() - startTime,
      verificationMethod: 'MX_DNS',
    }
  }

  // Step 3: Perform full SMTP verification
  let socket: net.Socket | null = null

  try {
    socket = new net.Socket()
    socket.setTimeout(timeoutMs)

    // Connect
    await new Promise<void>((resolve, reject) => {
      socket!.connect(25, mxHost, () => resolve())
      socket!.once('error', reject)
      const timer = setTimeout(() => {
        socket!.destroy()
        reject(new Error('Connection timeout'))
      }, timeoutMs)
      socket!.once('connect', () => clearTimeout(timer))
      socket!.once('timeout', () => {
        clearTimeout(timer)
        socket!.destroy()
        reject(new Error('Connection timeout'))
      })
    })

    // Read greeting
    const greeting = await readFromSocket(socket, 10000)
    if (!greeting.startsWith('220')) {
      // Fall back to MX validation
      const mxResult = enhancedMxValidation(email, mxRecords)
      return {
        email,
        status: 'MX_ONLY',
        canSend: mxResult.canSend,
        confidence: mxResult.confidence,
        reason: `SMTP greeting unexpected: ${greeting.substring(0, 100)}`,
        mxHost,
        smtpResponse: greeting,
        duration: Date.now() - startTime,
        verificationMethod: 'MX_DNS',
      }
    }

    // HELO
    const heloResponse = await sendCommand(socket, `HELO ${fromDomain}`, 10000)
    if (!heloResponse.startsWith('250')) {
      const mxResult = enhancedMxValidation(email, mxRecords)
      return {
        email,
        status: 'MX_ONLY',
        canSend: mxResult.canSend,
        confidence: mxResult.confidence,
        reason: `HELO rejected: ${heloResponse.substring(0, 100)}`,
        mxHost,
        smtpResponse: heloResponse,
        duration: Date.now() - startTime,
        verificationMethod: 'MX_DNS',
      }
    }

    // MAIL FROM
    const mailFromResponse = await sendCommand(socket, `MAIL FROM:<verify@${fromDomain}>`, 10000)
    if (!mailFromResponse.startsWith('250')) {
      const mxResult = enhancedMxValidation(email, mxRecords)
      return {
        email,
        status: 'MX_ONLY',
        canSend: mxResult.canSend,
        confidence: mxResult.confidence,
        reason: `MAIL FROM rejected: ${mailFromResponse.substring(0, 100)}`,
        mxHost,
        smtpResponse: mailFromResponse,
        duration: Date.now() - startTime,
        verificationMethod: 'MX_DNS',
      }
    }

    // RCPT TO — the key check
    const rcptToResponse = await sendCommand(socket, `RCPT TO:<${email}>`, 10000)

    // QUIT
    try { await sendCommand(socket, 'QUIT', 5000) } catch {}
    socket.destroy()
    socket = null

    // Analyze response
    const rcptCode = rcptToResponse.substring(0, 3)

    if (rcptCode === '250' || rcptCode === '251') {
      return {
        email,
        status: 'VALID',
        canSend: true,
        confidence: 95,
        reason: `Mailbox confirmed by SMTP server (${rcptCode})`,
        mxHost,
        smtpResponse: rcptToResponse,
        duration: Date.now() - startTime,
        verificationMethod: 'SMTP',
      }
    }

    if (rcptCode === '550' || rcptCode === '551' || rcptCode === '553') {
      return {
        email,
        status: 'INVALID',
        canSend: false,
        confidence: 95,
        reason: `Mailbox does NOT exist (${rcptCode}: ${rcptToResponse.substring(0, 150)})`,
        mxHost,
        smtpResponse: rcptToResponse,
        duration: Date.now() - startTime,
        verificationMethod: 'SMTP',
      }
    }

    if (rcptCode === '450' || rcptCode === '451' || rcptCode === '452') {
      return {
        email,
        status: 'UNKNOWN',
        canSend: true,
        confidence: 50,
        reason: `Server returned temporary error (${rcptCode}) — mailbox may exist: ${rcptToResponse.substring(0, 100)}`,
        mxHost,
        smtpResponse: rcptToResponse,
        duration: Date.now() - startTime,
        verificationMethod: 'SMTP',
      }
    }

    return {
      email,
      status: 'UNKNOWN',
      canSend: true,
      confidence: 40,
      reason: `Unexpected SMTP response (${rcptCode}): ${rcptToResponse.substring(0, 100)}`,
      mxHost,
      smtpResponse: rcptToResponse,
      duration: Date.now() - startTime,
      verificationMethod: 'SMTP',
    }

  } catch (error) {
    if (socket) { try { socket.destroy() } catch {} }

    const errorMsg = error instanceof Error ? error.message : 'Unknown error'

    // If SMTP failed, fall back to enhanced MX validation
    const mxResult = enhancedMxValidation(email, mxRecords)
    return {
      email,
      status: mxResult.canSend ? 'MX_ONLY' : 'UNREACHABLE',
      canSend: mxResult.canSend,
      confidence: mxResult.confidence,
      reason: `[SMTP failed: ${errorMsg}] ${mxResult.reason}`,
      mxHost,
      smtpResponse: '',
      duration: Date.now() - startTime,
      verificationMethod: 'MX_DNS',
    }
  }
}

/**
 * Batch verify multiple emails with concurrency control.
 */
export async function batchVerifyEmails(
  emails: string[],
  concurrency: number = 3,
  fromDomain: string = 'apexmind.com'
): Promise<SmtpVerificationResult[]> {
  const results: SmtpVerificationResult[] = []
  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(email => verifyEmailSmtp(email, fromDomain))
    )
    results.push(...batchResults)
  }
  return results
}
