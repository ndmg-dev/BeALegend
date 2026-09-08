import { z } from 'zod';
import { request } from './client';

/**
 * Vínculo de parceiro e o resumo compartilhado. Não passa por Dexie/outbox:
 * é interação em tempo real entre duas contas, não dado offline de uma —
 * a lista de vínculos e o resumo do parceiro pedem rede.
 */

const partnerLinkSchema = z.object({
  id: z.string(),
  status: z.enum(['pendente', 'aceito', 'recusado']),
  direcao: z.enum(['enviado', 'recebido']),
  partner_email: z.string(),
  criado_em: z.string(),
  respondido_em: z.string().nullable(),
});
export type PartnerLink = z.infer<typeof partnerLinkSchema>;

const partnerSummarySchema = z.object({
  inicio: z.string(),
  fim: z.string(),
  treinos_concluidos: z.number(),
  refeicoes_registradas: z.number(),
  aderencia_percentual: z.number(),
  habitos_concluidos: z.number(),
  habitos_previstos: z.number(),
});
export type PartnerSummary = z.infer<typeof partnerSummarySchema>;

export function listPartnerLinks(): Promise<PartnerLink[]> {
  return request('/partners', { schema: z.array(partnerLinkSchema) });
}

export function invitePartner(email: string): Promise<PartnerLink> {
  return request('/partners/invite', {
    method: 'POST', body: { email }, schema: partnerLinkSchema,
  });
}

export function acceptPartnerLink(id: string): Promise<PartnerLink> {
  return request(`/partners/${id}/accept`, { method: 'POST', schema: partnerLinkSchema });
}

export function declinePartnerLink(id: string): Promise<PartnerLink> {
  return request(`/partners/${id}/decline`, { method: 'POST', schema: partnerLinkSchema });
}

export function revokePartnerLink(id: string): Promise<void> {
  return request(`/partners/${id}`, { method: 'DELETE' });
}

export function partnerSummary(id: string): Promise<PartnerSummary> {
  return request(`/partners/${id}/summary`, { schema: partnerSummarySchema });
}
