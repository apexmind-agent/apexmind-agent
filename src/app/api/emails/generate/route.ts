import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateEmail } from '@/lib/ai'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json()
    const { leadId, contactId } = body

    if (!leadId || !contactId) {
      return NextResponse.json({ error: 'leadId and contactId are required' }, { status: 400 })
    }

    const lead = await db.lead.findUnique({
      where: { id: leadId },
      include: { contacts: true, emails: true }
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const contact = lead.contacts.find(c => c.id === contactId)
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const followUpCount = lead.emails.filter(e => e.status === 'SENT').length

    let aiResult = ''
    try {
      aiResult = await generateEmail(
        lead.companyName,
        lead.city,
        lead.country,
        contact.name,
        contact.title,
        lead.industry,
        lead.website,
        lead.websiteScore,
        lead.brandScore,
        lead.hasAwards,
        lead.awardDetails,
        followUpCount > 0
      )
    } catch (aiError) {
      console.error('AI generation failed, using fallback:', aiError)
    }

    let emailContent = { subject: '', body: '' }

    if (aiResult) {
      try {
        emailContent = JSON.parse(aiResult)
      } catch {
        try {
          const codeBlockMatch = aiResult.match(/```(?:json)?\s*([\s\S]*?)```/)
          if (codeBlockMatch) {
            emailContent = JSON.parse(codeBlockMatch[1].trim())
          }
        } catch {
          try {
            const jsonMatch = aiResult.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/)
            if (jsonMatch) {
              emailContent = JSON.parse(jsonMatch[0])
            }
          } catch {
            const subjectMatch = aiResult.match(/"subject"\s*:\s*"([^"]+)"/)
            const bodyMatch = aiResult.match(/"body"\s*:\s*"([^"]+(?:\\.[^"]*)*)"/s)
            if (subjectMatch) emailContent.subject = subjectMatch[1]
            if (bodyMatch) emailContent.body = bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
          }
        }
      }
    }

    if (!emailContent.subject || !emailContent.body) {
      const industryLabel = lead.industry || 'business'
      emailContent.subject = followUpCount > 0
        ? `Following Up — Elevating ${lead.companyName}'s Marketing`
        : `Partnership Opportunity for ${lead.companyName}`
      emailContent.body = followUpCount > 0
        ? `Hi ${contact.name},\n\nI wanted to follow up on my previous message about helping ${lead.companyName} stand out in ${lead.city}. I understand you're busy, but I believe our approach at ApexMind could make a real difference for your ${industryLabel} business.\n\nWe specialize in creating bold, memorable advertising that cuts through the noise — the kind of marketing people actually notice and remember.\n\nWould you be open to a quick 10-minute call this week?\n\nBest regards,\nApexMind Advertising Agency`
        : `Hi ${contact.name},\n\nI came across ${lead.companyName} in ${lead.city} and was impressed by what you do in the ${industryLabel} space. However, I noticed an opportunity to help your brand stand out even more.\n\nAt ApexMind, we bring back the golden era of advertising — campaigns with personality, soul, and stopping power. In a world of generic marketing, we create bold, recognizable brands that people remember.\n\nI'd love to show you what we could do for ${lead.companyName}. Would you be open to a brief conversation?\n\nBest regards,\nApexMind Advertising Agency`
    }

    emailContent.body = emailContent.body
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .trim()

    const email = await db.email.create({
      data: {
        leadId,
        contactId,
        subject: emailContent.subject || 'Partnership Opportunity',
        body: emailContent.body || '',
        type: followUpCount > 0 ? 'FOLLOW_UP' : 'INITIAL',
        status: 'DRAFT',
        followUpSequence: followUpCount,
      }
    })

    return NextResponse.json({ email })
  } catch (error) {
    console.error('Email generation error:', error)
    const message = error instanceof Error ? error.message : 'Email generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
