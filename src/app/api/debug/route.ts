import { NextResponse } from 'next/server'
import { ensureEnvVars } from '@/lib/env'

export async function GET() {
  ensureEnvVars()

  const hasDb = !!process.env.DATABASE_URL
  const hasAi = !!process.env.OPENROUTER_API_KEY
  const keyPrefix = process.env.OPENROUTER_API_KEY?.substring(0, 10) || 'NONE'

  let openRouterStatus = 'not_tested'
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 5,
      }),
    })
    if (response.ok) {
      const data = await response.json()
      openRouterStatus = `OK - ${data.choices?.[0]?.message?.content || 'no content'}`
    } else {
      const err = await response.text()
      openRouterStatus = `HTTP ${response.status} - ${err.substring(0, 200)}`
    }
  } catch (err: any) {
    openRouterStatus = `Error: ${err.message}`
  }

  return NextResponse.json({
    env: { hasDb, hasAi, keyPrefix },
    openRouter: openRouterStatus,
    nodeEnv: process.env.NODE_ENV,
  })
}
