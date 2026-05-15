import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (status) where.status = status

    const followUps = await db.followUp.findMany({
      where,
      include: {
        lead: { select: { companyName: true, city: true, region: true } },
      },
      orderBy: { scheduledDate: 'asc' }
    })

    return NextResponse.json({ followUps })
  } catch (error) {
    console.error('Follow-ups fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch follow-ups' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const followUp = await db.followUp.create({
      data: {
        leadId: body.leadId,
        emailId: body.emailId || null,
        scheduledDate: new Date(body.scheduledDate),
        status: body.status || 'PENDING',
        notes: body.notes || null,
      },
      include: { lead: { select: { companyName: true } } }
    })

    return NextResponse.json({ followUp })
  } catch (error) {
    console.error('Follow-up creation error:', error)
    return NextResponse.json({ error: 'Failed to create follow-up' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'Follow-up ID is required' }, { status: 400 })
    }

    const followUp = await db.followUp.update({
      where: { id },
      data: {
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
        status: data.status,
        notes: data.notes,
      },
      include: { lead: { select: { companyName: true } } }
    })

    return NextResponse.json({ followUp })
  } catch (error) {
    console.error('Follow-up update error:', error)
    return NextResponse.json({ error: 'Failed to update follow-up' }, { status: 500 })
  }
}
