/**
 * WeeFly · MIG-02 / TEN-04 · de que parceiro é um caso, para os links dele.
 *
 * Os links de um parceiro saem do endereço do parceiro. Quem os gera (emails,
 * publicação da proposta, bilhete) tem o caso e não o parceiro; esta leitura
 * faz a ponte. O endereço em si é de `lib/site-url`.
 *
 * SÓ SERVIDOR.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { caseClientUrl, type LinkPartner } from "@/lib/site-url"

export async function casePartner(caseId: string): Promise<LinkPartner | null> {
  const admin = createAdminClient()
  if (!admin) return null

  const { data, error } = await admin
    .from("booking_cases")
    .select("partner:partners(slug, is_operator)")
    .eq("id", caseId)
    .maybeSingle()

  if (error || !data) return null
  const raw = (data as { partner: unknown }).partner
  const partner = (Array.isArray(raw) ? raw[0] : raw) as
    | { slug: string; is_operator: boolean }
    | null
  return partner ? { slug: partner.slug, isOperator: partner.is_operator } : null
}

/** O `/pc/{token}` do caso, no endereço do parceiro dele. */
export async function caseClientLink(caseId: string, token: string): Promise<string> {
  return caseClientUrl(token, await casePartner(caseId))
}
