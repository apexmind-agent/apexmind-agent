'use client'

import { create } from 'zustand'
import { useEffect } from 'react'

export type Language = 'pt-BR' | 'en'

const translations: Record<string, { 'pt-BR': string; 'en': string }> = {
  // Sidebar
  'sidebar.dashboard': { 'pt-BR': 'Painel', 'en': 'Dashboard' },
  'sidebar.prospecting': { 'pt-BR': 'Prospecção', 'en': 'Prospecting' },
  'sidebar.leads': { 'pt-BR': 'Banco de Leads', 'en': 'Leads Database' },
  'sidebar.emails': { 'pt-BR': 'Gerador de E-mails', 'en': 'Email Generator' },
  'sidebar.followups': { 'pt-BR': 'Follow-ups', 'en': 'Follow-ups' },
  'sidebar.sent': { 'pt-BR': 'E-mails Enviados', 'en': 'Sent Emails' },
  'sidebar.aiAgent': { 'pt-BR': 'Agente de Prospecção IA', 'en': 'AI Prospecting Agent' },
  'sidebar.language': { 'pt-BR': 'Idioma', 'en': 'Language' },

  // Page header
  'header.aiPowered': { 'pt-BR': 'Powered por IA', 'en': 'AI Powered' },

  // Dashboard
  'dashboard.totalLeads': { 'pt-BR': 'Total de Leads', 'en': 'Total Leads' },
  'dashboard.emailsSent': { 'pt-BR': 'E-mails Enviados', 'en': 'Emails Sent' },
  'dashboard.followupsPending': { 'pt-BR': 'Follow-ups Pendentes', 'en': 'Follow-ups Pending' },
  'dashboard.conversionRate': { 'pt-BR': 'Taxa de Conversão', 'en': 'Conversion Rate' },
  'dashboard.acrossRegions': { 'pt-BR': 'Em todas as regiões', 'en': 'Across all regions' },
  'dashboard.coldOutreach': { 'pt-BR': 'Campanhas de outreach', 'en': 'Cold outreach campaigns' },
  'dashboard.scheduledWeek': { 'pt-BR': 'Agendados esta semana', 'en': 'Scheduled this week' },
  'dashboard.leadsToInterested': { 'pt-BR': 'Leads → Interessados', 'en': 'Leads → Interested' },
  'dashboard.leadsByRegion': { 'pt-BR': 'Leads por Região', 'en': 'Leads by Region' },
  'dashboard.leadsByStatus': { 'pt-BR': 'Leads por Status', 'en': 'Leads by Status' },
  'dashboard.noDataProspecting': { 'pt-BR': 'Sem dados ainda. Comece a prospectar!', 'en': 'No data yet. Start prospecting!' },
  'dashboard.recentLeads': { 'pt-BR': 'Leads Recentes', 'en': 'Recent Leads' },
  'dashboard.recentEmails': { 'pt-BR': 'E-mails Recentes', 'en': 'Recent Emails' },
  'dashboard.noLeads': { 'pt-BR': 'Nenhum lead ainda', 'en': 'No leads yet' },
  'dashboard.noEmails': { 'pt-BR': 'Nenhum e-mail ainda', 'en': 'No emails yet' },
  'dashboard.contacts': { 'pt-BR': 'contatos', 'en': 'contacts' },

  // Prospecting
  'prospecting.aiSearch': { 'pt-BR': 'Busca de Prospecção IA', 'en': 'AI Prospecting Search' },
  'prospecting.region': { 'pt-BR': 'Região', 'en': 'Region' },
  'prospecting.industry': { 'pt-BR': 'Indústria', 'en': 'Industry' },
  'prospecting.city': { 'pt-BR': 'Cidade', 'en': 'City' },
  'prospecting.startProspecting': { 'pt-BR': 'Iniciar Prospecção', 'en': 'Start Prospecting' },
  'prospecting.prospecting': { 'pt-BR': 'Prospectando...', 'en': 'Prospecting...' },
  'prospecting.foundLeads': { 'pt-BR': 'Leads Encontrados', 'en': 'Found Leads' },
  'prospecting.deepResearch': { 'pt-BR': 'Pesquisa Profunda', 'en': 'Deep Research' },
  'prospecting.generateEmail': { 'pt-BR': 'Gerar E-mail', 'en': 'Generate Email' },
  'prospecting.hasAwards': { 'pt-BR': 'Tem Prêmios', 'en': 'Has Awards' },
  'prospecting.startSearch': { 'pt-BR': 'Inicie sua Busca', 'en': 'Start Your Search' },
  'prospecting.startSearchDesc': { 'pt-BR': 'Encontre empresas em cidades pequenas que precisam de melhor publicidade. A IA escolhe cidades dinamicamente, cobrindo TODO o país.', 'en': 'Find businesses in small cities that need better advertising. AI dynamically picks cities covering the ENTIRE country.' },
  'prospecting.selectIndustry': { 'pt-BR': 'Selecionar indústria', 'en': 'Select industry' },
  'prospecting.cityPlaceholderDynamic': { 'pt-BR': 'Ex: Council Bluffs, Minot... ou vazio = IA escolhe', 'en': 'e.g. Council Bluffs, Minot... or empty = AI picks' },
  'prospecting.cityHint': { 'pt-BR': 'Deixe vazio e a IA escolhe 8 cidades pequenas em 8 estados diferentes', 'en': 'Leave empty and AI picks 8 small cities in 8 different states' },
  'prospecting.primaryFocus': { 'pt-BR': 'Foco Principal - TODO os EUA', 'en': 'Primary Focus - ALL of USA' },
  'prospecting.secondaryFocus': { 'pt-BR': 'Foco Secundário - TODO o país', 'en': 'Secondary Focus - ALL country' },
  'prospecting.aiPicksCities': { 'pt-BR': 'IA escolhe cidades pequenas dinamicamente', 'en': 'AI dynamically picks small cities' },
  'prospecting.newSearch': { 'pt-BR': 'Nova Busca', 'en': 'New Search' },
  'prospecting.web': { 'pt-BR': 'Web', 'en': 'Web' },
  'prospecting.brand': { 'pt-BR': 'Marca', 'en': 'Brand' },
  'prospecting.comm': { 'pt-BR': 'Comun', 'en': 'Comm' },
  'prospecting.noContacts': { 'pt-BR': 'Nenhum contato. Execute pesquisa profunda primeiro.', 'en': 'No contacts. Run deep research first.' },
  'prospecting.optional': { 'pt-BR': 'opcional', 'en': 'optional' },
  'prospecting.researchCompleted': { 'pt-BR': 'Pesquisa profunda concluída', 'en': 'Deep research completed' },
  'prospecting.researchFailed': { 'pt-BR': 'Pesquisa falhou.', 'en': 'Research failed.' },
  'prospecting.foundNewLeads': { 'pt-BR': 'novos leads encontrados!', 'en': 'new leads found!' },
  'prospecting.prospectingFailed': { 'pt-BR': 'Prospecção falhou.', 'en': 'Prospecting failed.' },
  'prospecting.emailGenerated': { 'pt-BR': 'E-mail gerado!', 'en': 'Email generated!' },
  'prospecting.emailsVerified': { 'pt-BR': 'e-mails verificados', 'en': 'emails verified' },
  'prospecting.noResults': { 'pt-BR': 'Nenhum resultado encontrado. Tente outros critérios.', 'en': 'No results found. Try different criteria.' },
  'prospecting.startSearchDescReal': { 'pt-BR': 'Busca REAL na web — encontra empresas reais com e-mails reais. Sem dados inventados, sem bounce.', 'en': 'REAL web search — finds real businesses with real emails. No fabricated data, no bounces.' },

  // Leads Database
  'leads.database': { 'pt-BR': 'Banco de Leads', 'en': 'Leads Database' },
  'leads.addLead': { 'pt-BR': 'Adicionar Lead', 'en': 'Add Lead' },
  'leads.searchLeads': { 'pt-BR': 'Buscar leads...', 'en': 'Search leads...' },
  'leads.allStatuses': { 'pt-BR': 'Todos os Status', 'en': 'All Statuses' },
  'leads.allRegions': { 'pt-BR': 'Todas as Regiões', 'en': 'All Regions' },
  'leads.company': { 'pt-BR': 'Empresa', 'en': 'Company' },
  'leads.location': { 'pt-BR': 'Localização', 'en': 'Location' },
  'leads.industry': { 'pt-BR': 'Indústria', 'en': 'Industry' },
  'leads.scores': { 'pt-BR': 'Pontuações', 'en': 'Scores' },
  'leads.status': { 'pt-BR': 'Status', 'en': 'Status' },
  'leads.actions': { 'pt-BR': 'Ações', 'en': 'Actions' },
  'leads.view': { 'pt-BR': 'Ver', 'en': 'View' },
  'leads.noLeads': { 'pt-BR': 'Nenhum lead encontrado', 'en': 'No leads found' },
  'leads.startOrAdd': { 'pt-BR': 'Comece a prospectar ou adicione um lead', 'en': 'Start prospecting or add a lead' },
  'leads.previous': { 'pt-BR': 'Anterior', 'en': 'Previous' },
  'leads.next': { 'pt-BR': 'Próximo', 'en': 'Next' },
  'leads.page': { 'pt-BR': 'Página', 'en': 'Page' },
  'leads.of': { 'pt-BR': 'de', 'en': 'of' },
  'leads.total': { 'pt-BR': 'total', 'en': 'total' },
  'leads.addNewLead': { 'pt-BR': 'Adicionar Novo Lead', 'en': 'Add New Lead' },
  'leads.companyName': { 'pt-BR': 'Nome da Empresa', 'en': 'Company Name' },
  'leads.city': { 'pt-BR': 'Cidade', 'en': 'City' },
  'leads.state': { 'pt-BR': 'Estado', 'en': 'State' },
  'leads.country': { 'pt-BR': 'País', 'en': 'Country' },
  'leads.website': { 'pt-BR': 'Site', 'en': 'Website' },
  'leads.companySize': { 'pt-BR': 'Tamanho da Empresa', 'en': 'Company Size' },
  'leads.region': { 'pt-BR': 'Região', 'en': 'Region' },
  'leads.notes': { 'pt-BR': 'Observações', 'en': 'Notes' },
  'leads.cancel': { 'pt-BR': 'Cancelar', 'en': 'Cancel' },
  'leads.createLead': { 'pt-BR': 'Criar Lead', 'en': 'Create Lead' },
  'leads.leadCreated': { 'pt-BR': 'Lead criado com sucesso', 'en': 'Lead created successfully' },
  'leads.leadFailed': { 'pt-BR': 'Falha ao criar lead', 'en': 'Failed to create lead' },

  // Email Generator
  'emails.generator': { 'pt-BR': 'Gerador de E-mails', 'en': 'Email Generator' },
  'emails.selectLead': { 'pt-BR': 'Selecionar Empresa', 'en': 'Select Company' },
  'emails.selectContact': { 'pt-BR': 'Selecionar Responsável', 'en': 'Select Contact Person' },
  'emails.generateEmail': { 'pt-BR': 'Gerar E-mail', 'en': 'Generate Email' },
  'emails.generating': { 'pt-BR': 'Gerando...', 'en': 'Generating...' },
  'emails.emailPreview': { 'pt-BR': 'Pré-visualização do E-mail', 'en': 'Email Preview' },
  'emails.subject': { 'pt-BR': 'Assunto', 'en': 'Subject' },
  'emails.body': { 'pt-BR': 'Corpo', 'en': 'Body' },
  'emails.regenerate': { 'pt-BR': 'Regenerar', 'en': 'Regenerate' },
  'emails.validateEmail': { 'pt-BR': 'Validar E-mail', 'en': 'Validate Email' },
  'emails.saveDraft': { 'pt-BR': 'Salvar Rascunho', 'en': 'Save Draft' },
  'emails.markAsSent': { 'pt-BR': 'Marcar como Enviado', 'en': 'Mark as Sent' },
  'emails.draft': { 'pt-BR': 'Rascunho', 'en': 'Draft' },
  'emails.generateYourEmail': { 'pt-BR': 'Gere seu E-mail', 'en': 'Generate Your Email' },
  'emails.generateDesc': { 'pt-BR': 'Selecione empresa e responsável, depois clique em Gerar E-mail.', 'en': 'Select company and contact, then click Generate Email.' },
  'emails.chooseLead': { 'pt-BR': 'Escolha uma empresa...', 'en': 'Choose a company...' },
  'emails.chooseContact': { 'pt-BR': 'Escolha um responsável...', 'en': 'Choose a contact person...' },
  'emails.selectLeadFirst': { 'pt-BR': 'Selecione uma empresa primeiro', 'en': 'Select a company first' },
  'emails.selectLeadContact': { 'pt-BR': 'Selecione empresa e responsável primeiro', 'en': 'Select company and contact first' },
  'emails.generatedSuccess': { 'pt-BR': 'E-mail gerado com sucesso!', 'en': 'Email generated successfully!' },
  'emails.generationFailed': { 'pt-BR': 'Falha ao gerar e-mail.', 'en': 'Failed to generate email.' },
  'emails.savedDraft': { 'pt-BR': 'E-mail salvo como rascunho!', 'en': 'Email saved as draft!' },
  'emails.markedSent': { 'pt-BR': 'E-mail marcado como enviado!', 'en': 'Email marked as sent!' },
  'emails.saveFailed': { 'pt-BR': 'Falha ao salvar e-mail', 'en': 'Failed to save email' },
  'emails.valid': { 'pt-BR': 'E-mail parece válido', 'en': 'Email appears valid' },
  'emails.mayNotBeValid': { 'pt-BR': 'E-mail pode não ser válido', 'en': 'Email may not be valid' },
  'emails.confidence': { 'pt-BR': 'confiança', 'en': 'confidence' },
  'emails.validationFailed': { 'pt-BR': 'Validação de e-mail falhou', 'en': 'Email validation failed' },
  'emails.noContactsYet': { 'pt-BR': 'Nenhum contato. Execute Pesquisa Profunda primeiro.', 'en': 'No contacts. Run Deep Research first.' },
  'emails.clear': { 'pt-BR': 'Limpar', 'en': 'Clear' },
  'emails.editEmail': { 'pt-BR': 'Editar E-mail', 'en': 'Edit Email' },
  'emails.cancelEdit': { 'pt-BR': 'Cancelar', 'en': 'Cancel' },
  'emails.saveChanges': { 'pt-BR': 'Salvar Alterações', 'en': 'Save Changes' },
  'emails.subjectPlaceholder': { 'pt-BR': 'Digite o assunto do e-mail...', 'en': 'Type the email subject...' },
  'emails.bodyPlaceholder': { 'pt-BR': 'Digite o corpo do e-mail aqui...', 'en': 'Type the email body here...' },

  // Follow-ups
  'followups.title': { 'pt-BR': 'Follow-ups', 'en': 'Follow-ups' },
  'followups.schedule': { 'pt-BR': 'Agendar', 'en': 'Schedule' },
  'followups.allStatuses': { 'pt-BR': 'Todos os Status', 'en': 'All Statuses' },
  'followups.pending': { 'pt-BR': 'Pendente', 'en': 'Pending' },
  'followups.sent': { 'pt-BR': 'Enviado', 'en': 'Sent' },
  'followups.skipped': { 'pt-BR': 'Pulado', 'en': 'Skipped' },
  'followups.overdue': { 'pt-BR': 'Atrasado', 'en': 'Overdue' },
  'followups.done': { 'pt-BR': 'Feito', 'en': 'Done' },
  'followups.skip': { 'pt-BR': 'Pular', 'en': 'Skip' },
  'followups.reschedule': { 'pt-BR': 'Reagendar', 'en': 'Reschedule' },
  'followups.scheduled': { 'pt-BR': 'Agendado:', 'en': 'Scheduled:' },
  'followups.noFollowups': { 'pt-BR': 'Nenhum Follow-up', 'en': 'No Follow-ups' },
  'followups.noFollowupsDesc': { 'pt-BR': 'Agende follow-ups para acompanhar seu outreach.', 'en': 'Schedule follow-ups to track outreach.' },
  'followups.scheduleFollowup': { 'pt-BR': 'Agendar Follow-up', 'en': 'Schedule Follow-up' },
  'followups.selectLead': { 'pt-BR': 'Selecionar Lead', 'en': 'Select Lead' },
  'followups.scheduledDate': { 'pt-BR': 'Data Agendada', 'en': 'Scheduled Date' },
  'followups.notes': { 'pt-BR': 'Observações', 'en': 'Notes' },
  'followups.notesPlaceholder': { 'pt-BR': 'Adicione observações...', 'en': 'Add notes...' },
  'followups.cancel': { 'pt-BR': 'Cancelar', 'en': 'Cancel' },
  'followups.3days': { 'pt-BR': '3 dias', 'en': '3 days' },
  'followups.1week': { 'pt-BR': '1 semana', 'en': '1 week' },
  'followups.2weeks': { 'pt-BR': '2 semanas', 'en': '2 weeks' },
  'followups.scheduledSuccess': { 'pt-BR': 'Follow-up agendado!', 'en': 'Follow-up scheduled!' },
  'followups.scheduleFailed': { 'pt-BR': 'Falha ao agendar follow-up', 'en': 'Failed to schedule follow-up' },
  'followups.updated': { 'pt-BR': 'Follow-up atualizado', 'en': 'Follow-up updated' },
  'followups.updateFailed': { 'pt-BR': 'Falha ao atualizar follow-up', 'en': 'Failed to update follow-up' },
  'followups.chooseLead': { 'pt-BR': 'Escolha um lead...', 'en': 'Choose a lead...' },
  'followups.noNotes': { 'pt-BR': 'Sem observações', 'en': 'No notes' },

  // Sent Emails
  'sent.title': { 'pt-BR': 'E-mails Enviados', 'en': 'Sent Emails' },
  'sent.noEmailsYet': { 'pt-BR': 'Nenhum E-mail Ainda', 'en': 'No Emails Yet' },
  'sent.noEmailsDesc': { 'pt-BR': 'Gere e-mails na aba Gerador de E-mails.', 'en': 'Generate emails from the Email Generator tab.' },
  'sent.company': { 'pt-BR': 'Empresa', 'en': 'Company' },
  'sent.contact': { 'pt-BR': 'Contato', 'en': 'Contact' },
  'sent.subject': { 'pt-BR': 'Assunto', 'en': 'Subject' },
  'sent.type': { 'pt-BR': 'Tipo', 'en': 'Type' },
  'sent.status': { 'pt-BR': 'Status', 'en': 'Status' },
  'sent.date': { 'pt-BR': 'Data', 'en': 'Date' },
  'sent.actions': { 'pt-BR': 'Ações', 'en': 'Actions' },
  'sent.view': { 'pt-BR': 'Ver', 'en': 'View' },
  'sent.to': { 'pt-BR': 'Para:', 'en': 'To:' },
  'sent.created': { 'pt-BR': 'Criado:', 'en': 'Created:' },
  'sent.sentOn': { 'pt-BR': 'Enviado:', 'en': 'Sent:' },
  'sent.allTypes': { 'pt-BR': 'Todos os Tipos', 'en': 'All Types' },
  'sent.initial': { 'pt-BR': 'Inicial', 'en': 'Initial' },
  'sent.followup': { 'pt-BR': 'Follow-up', 'en': 'Follow-up' },
  'sent.allStatuses': { 'pt-BR': 'Todos os Status', 'en': 'All Statuses' },
  'sent.emailDetails': { 'pt-BR': 'Detalhes do E-mail', 'en': 'Email Details' },

  // Lead Detail Dialog
  'detail.location': { 'pt-BR': 'Localização', 'en': 'Location' },
  'detail.website': { 'pt-BR': 'Site', 'en': 'Website' },
  'detail.industry': { 'pt-BR': 'Indústria', 'en': 'Industry' },
  'detail.companySize': { 'pt-BR': 'Tamanho da Empresa', 'en': 'Company Size' },
  'detail.employees': { 'pt-BR': 'funcionários', 'en': 'employees' },
  'detail.webScore': { 'pt-BR': 'Site:', 'en': 'Website:' },
  'detail.brandScore': { 'pt-BR': 'Marca:', 'en': 'Brand:' },
  'detail.commScore': { 'pt-BR': 'Comun:', 'en': 'Comm:' },
  'detail.awards': { 'pt-BR': 'Prêmios:', 'en': 'Awards:' },
  'detail.yes': { 'pt-BR': 'Sim', 'en': 'Yes' },
  'detail.no': { 'pt-BR': 'Não', 'en': 'No' },
  'detail.notes': { 'pt-BR': 'Observações', 'en': 'Notes' },
  'detail.contacts': { 'pt-BR': 'Contatos', 'en': 'Contacts' },
  'detail.emails': { 'pt-BR': 'E-mails', 'en': 'Emails' },
  'detail.followups': { 'pt-BR': 'Follow-ups', 'en': 'Follow-ups' },
  'detail.noContacts': { 'pt-BR': 'Nenhum contato ainda.', 'en': 'No contacts yet.' },
  'detail.noEmails': { 'pt-BR': 'Nenhum e-mail ainda.', 'en': 'No emails yet.' },
  'detail.noFollowups': { 'pt-BR': 'Nenhum follow-up agendado.', 'en': 'No follow-ups scheduled.' },
  'detail.delete': { 'pt-BR': 'Excluir', 'en': 'Delete' },
  'detail.validated': { 'pt-BR': 'Validado', 'en': 'Validated' },
  'detail.leadDeleted': { 'pt-BR': 'Lead excluído com sucesso', 'en': 'Lead deleted successfully' },
  'detail.deleteFailed': { 'pt-BR': 'Falha ao excluir lead', 'en': 'Failed to delete lead' },
  'detail.statusUpdated': { 'pt-BR': 'Status atualizado', 'en': 'Status updated' },
  'detail.noNotes': { 'pt-BR': 'Sem observações', 'en': 'No notes' },

  // Region names
  'region.USA': { 'pt-BR': 'Estados Unidos', 'en': 'United States' },
  'region.UK': { 'pt-BR': 'Reino Unido', 'en': 'United Kingdom' },
  'region.CANADA': { 'pt-BR': 'Canadá', 'en': 'Canada' },
  'region.AUSTRALIA': { 'pt-BR': 'Austrália', 'en': 'Australia' },
}

// ===== STORE: sempre inicia pt-BR (server = client = pt-BR) =====

interface LanguageState {
  language: Language
  setLanguage: (lang: Language) => void
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: 'pt-BR',
  setLanguage: (lang: Language) => {
    try {
      localStorage.setItem('apexmind-language', lang)
    } catch {
      // localStorage not available
    }
    set({ language: lang })
  },
}))

// ===== HOOK: sincroniza localStorage via useEffect (depois da hydration) =====

export function useT() {
  const { language, setLanguage } = useLanguageStore()

  useEffect(() => {
    try {
      const stored = localStorage.getItem('apexmind-language')
      if (stored === 'en' || stored === 'pt-BR') {
        if (stored !== language) {
          setLanguage(stored)
        }
      }
    } catch {
      // ignore
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const t = (key: string): string => {
    const entry = translations[key]
    if (!entry) return key
    return entry[language] || entry['en'] || key
  }

  return { t, language }
}
