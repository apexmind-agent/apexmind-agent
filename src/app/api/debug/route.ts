import { NextResponse } from 'next/server'
import { ensureEnvVars } from '@/lib/env'

export async function GET() {
  ensureEnvVars()

  const key = process.env.OPENROUTER_API_KEY || ''
  const results: any = {
    keyLength: key.length,
    keyPrefix: key.substring(0, 10),
    keySuffix: key.substring(key.length - 5),
  }

  // Test 1: Auth check
  try {
    const authRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { 'Authorization': `Bearer ${key}` }
    })
    results.authStatus = authRes.status
    const authData = await authRes.json()
    results.authData = authData
  } catch (err: any) {
    results.authError = err.message
  }

  // Test 2: Simple completion with minimal headers
  try {
    const chatRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 5,
      }),
    })
    results.chatStatus = chatRes.status
    const chatData = await chatRes.json()
    results.chatData = chatData
  } catch (err: any) {
    results.chatError = err.message
  }

  return NextResponse.json(results, { status: 200 })
}
