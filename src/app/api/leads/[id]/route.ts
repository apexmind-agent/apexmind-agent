import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { createdAt: 'desc' } },
        emails: { include: { contact: true }, orderBy: { createdAt: 'desc' } },
        followUps: { orderBy: { scheduledDate: 'asc' } },
      }
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    return NextResponse.json({ lead })
  } catch (error) {
    console.error('Lead fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const lead = await db.lead.update({
      where: { id },
      data: {
        companyName: body.companyName,
        address: body.address,
        city: body.city,
        state: body.state,
        country: body.country,
        website: body.website,
        industry: body.industry,
        companySize: body.companySize,
        websiteScore: body.websiteScore,
        brandScore: body.brandScore,
        communicationScore: body.communicationScore,
        marketingNeed: body.marketingNeed,
        hasAwards: body.hasAwards,
        awardDetails: body.awardDetails,
        notes: body.notes,
        status: body.status,
        region: body.region,
      },
      include: { contacts: true }
    })

    return NextResponse.json({ lead })
  } catch (error) {
    console.error('Lead update error:', error)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await db.lead.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Lead delete error:', error)
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
