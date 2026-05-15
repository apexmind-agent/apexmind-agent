import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ leads: [], total: 0, page: 1, limit: 20, _setupRequired: true })
    }

    const { searchParams } = new URL(request.url)
    const region = searchParams.get('region')
    const status = searchParams.get('status')
    const industry = searchParams.get('industry')
    const marketingNeed = searchParams.get('marketingNeed')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}
    if (region) where.region = region
    if (status) where.status = status
    if (industry) where.industry = industry
    if (marketingNeed) where.marketingNeed = marketingNeed
    if (search) {
      where.OR = [
        { companyName: { contains: search } },
        { city: { contains: search } },
        { website: { contains: search } },
        { industry: { contains: search } },
      ]
    }

    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        include: {
          contacts: true,
          emails: { take: 1, orderBy: { createdAt: 'desc' } },
          _count: { select: { followUps: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.lead.count({ where })
    ])

    return NextResponse.json({ leads, total, page, limit })
  } catch (error) {
    console.error('Leads fetch error:', error)
    return NextResponse.json({ leads: [], total: 0, page: 1, limit: 20 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'Database not configured. Add DATABASE_URL environment variable.' }, { status: 503 })
    }

    const body = await request.json()
    const lead = await db.lead.create({
      data: {
        companyName: body.companyName,
        address: body.address || null,
        city: body.city,
        state: body.state || null,
        country: body.country || 'USA',
        website: body.website || null,
        industry: body.industry || null,
        companySize: body.companySize || null,
        websiteScore: body.websiteScore || null,
        brandScore: body.brandScore || null,
        communicationScore: body.communicationScore || null,
        marketingNeed: body.marketingNeed || 'MEDIUM',
        hasAwards: body.hasAwards || false,
        awardDetails: body.awardDetails || null,
        notes: body.notes || null,
        status: body.status || 'NEW',
        region: body.region || 'USA',
      },
      include: { contacts: true }
    })

    return NextResponse.json({ lead })
  } catch (error) {
    console.error('Lead creation error:', error)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
