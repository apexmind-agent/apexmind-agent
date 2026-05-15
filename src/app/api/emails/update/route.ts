import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json()
    const { id, status, subject, body: emailBody } = body

    if (!id) {
      return NextResponse.json({ error: 'Email ID is required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status
    if (subject !== undefined) updateData.subject = subject
    if (emailBody !== undefined) updateData.body = emailBody
    if (status === 'SENT') updateData.sentAt = new Date()

    const email = await db.email.update({
      where: { id },
      data: updateData,
      include: { lead: { select: { companyName: true } }, contact: { select: { name: true, email: true } } }
    })

    return NextResponse.json({ email })
  } catch (error) {
    console.error('Email update error:', error)
    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ emails: [], _setupRequired: true })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (type) where.type = type

    const emails = await db.email.findMany({
      where,
      include: {
        lead: { select: { companyName: true, city: true, region: true } },
        contact: { select: { name: true, title: true, email: true } },
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ emails })
  } catch (error) {
    console.error('Emails fetch error:', error)
    return NextResponse.json({ emails: [] })
  }
}
