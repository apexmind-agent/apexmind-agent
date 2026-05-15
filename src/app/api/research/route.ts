import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { researchCompany } from '@/lib/ai'
import { scrapeBusinessEmails } from '@/lib/web-search'
import { validateEmail } from '@/lib/email-validator'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { leadId } = body

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 })
    }

    // Get lead from database
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      include: { contacts: true }
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    let websiteContent: string | null = null

    // Step 1: If website exists, scrape it for real data
    if (lead.website) {
      try {
        const { emails, phones, homepageHtml } = await scrapeBusinessEmails(lead.website, lead.companyName)
        websiteContent = homepageHtml
          ?.replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 1500) || null

        // Save any new emails found
        for (const emailData of emails) {
          try {
            const existing = await db.contact.findFirst({
              where: { leadId, email: emailData.email }
            })
            if (!existing) {
              // Validate the email
              let isValid = false
              try {
                const validation = await validateEmail(emailData.email)
                isValid = validation.isValid
              } catch {}

              await db.contact.create({
                data: {
                  leadId,
                  name: emailData.isBusinessDomain ? 'Business Contact' : 'Contact',
                  title: emailData.source === 'homepage' ? 'Main Contact' : `Found on ${emailData.source}`,
                  email: emailData.email,
                  emailValidated: isValid,
                  emailBounced: false,
                }
              })
            }
          } catch {
            // Skip contact creation errors
          }
        }

        // Update lead with phone numbers if found
        if (phones.length > 0) {
          try {
            await db.lead.update({
              where: { id: leadId },
              data: {
                notes: lead.notes
                  ? `${lead.notes}\n\nPhone: ${phones[0]}`
                  : `Phone: ${phones[0]}`,
              }
            })
          } catch {}
        }
      } catch (error) {
        console.error('Website scraping failed:', error)
      }
    }

    // Step 2: Use AI for analysis (with real website content if available)
    const aiResult = await researchCompany(
      lead.companyName,
      lead.city,
      lead.country,
      lead.website,
      lead.industry,
      websiteContent
    )

    let analysis: any = {}
    try {
      const jsonMatch = aiResult.match(/\{[\s\S]*\}/)
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch {
      try {
        analysis = JSON.parse(aiResult)
      } catch {
        analysis = {}
      }
    }

    // Update lead in database
    const updateData: Record<string, unknown> = {}
    if (analysis.websiteScore !== undefined) updateData.websiteScore = analysis.websiteScore
    if (analysis.brandScore !== undefined) updateData.brandScore = analysis.brandScore
    if (analysis.communicationScore !== undefined) updateData.communicationScore = analysis.communicationScore
    if (analysis.marketingNeed) updateData.marketingNeed = analysis.marketingNeed
    if (analysis.hasAwards !== undefined) {
      updateData.hasAwards = analysis.hasAwards
      updateData.awardDetails = analysis.awardDetails || null
    }
    if (analysis.notes && !updateData.notes) updateData.notes = analysis.notes
    if (analysis.industry) updateData.industry = analysis.industry
    if (analysis.companySize) updateData.companySize = analysis.companySize

    if (Object.keys(updateData).length > 0) {
      await db.lead.update({
        where: { id: leadId },
        data: updateData
      })
    }

    // Create contact from AI analysis only if name is provided and no email (AI no longer invents emails)
    if (analysis.contactName && !analysis.contactEmail) {
      try {
        const existing = await db.contact.findFirst({
          where: { leadId, name: analysis.contactName }
        })
        if (!existing) {
          await db.contact.create({
            data: {
              leadId,
              name: analysis.contactName,
              title: analysis.contactTitle || 'Executive',
              email: '', // Will be filled from web scraping
            }
          })
        }
      } catch {
        // Skip contact creation errors
      }
    }

    // Re-fetch lead with updated data
    const updatedLead = await db.lead.findUnique({
      where: { id: leadId },
      include: { contacts: true, emails: true, followUps: true }
    })

    return NextResponse.json({ lead: updatedLead, analysis })
  } catch (error) {
    console.error('Research error:', error)
    const message = error instanceof Error ? error.message : 'Research failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
