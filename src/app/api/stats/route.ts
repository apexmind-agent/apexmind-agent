import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const [
      totalLeads,
      emailsSent,
      followUpsPending,
      leadsInterested,
      leadsByRegion,
      leadsByStatus,
      recentLeads,
      recentEmails,
    ] = await Promise.all([
      db.lead.count(),
      db.email.count({ where: { status: 'SENT' } }),
      db.followUp.count({ where: { status: 'PENDING' } }),
      db.lead.count({ where: { status: 'INTERESTED' } }),
      db.lead.groupBy({ by: ['region'], _count: { region: true } }),
      db.lead.groupBy({ by: ['status'], _count: { status: true } }),
      db.lead.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { _count: { select: { contacts: true, emails: true } } } }),
      db.email.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { lead: { select: { companyName: true } }, contact: { select: { name: true } } } }),
    ])

    const conversionRate = totalLeads > 0 ? ((leadsInterested / totalLeads) * 100).toFixed(1) : '0'

    return NextResponse.json({
      totalLeads,
      emailsSent,
      followUpsPending,
      conversionRate: parseFloat(conversionRate),
      leadsByRegion: leadsByRegion.map(r => ({ region: r.region, count: r._count.region })),
      leadsByStatus: leadsByStatus.map(s => ({ status: s.status, count: s._count.status })),
      recentLeads,
      recentEmails,
    })
  } catch (error) {
    console.error('Stats fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
