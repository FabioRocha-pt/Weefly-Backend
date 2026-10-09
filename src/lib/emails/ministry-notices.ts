/**
 * WeeFly · B2G v2 · B2G-15 · B2G-18 · decisão 8 · os avisos às secretárias.
 *
 * "A secretária recebe aviso" (as ofertas chegaram) e "os bilhetes aparecem
 * em Os meus pedidos, e a secretária recebe aviso" (emitido). Vão a **todas as
 * secretárias activas do ministério** (decisão 8, D-4), cada uma com o **seu**
 * link pessoal para o pedido — o link pede o PIN dela. Nada de PIN, de preços
 * nem de dados de passageiros no email.
 *
 * Com a marca e o remetente da empresa do caso (num white label, a secretária
 * não recebe nada da WeeFly — D-2), como o email de boas-vindas.
 *
 * Secretárias sem email (ou com o endereço `.invalid` do intake) não recebem:
 * veem o pedido em "Os meus pedidos". Best-effort: um email que falha nunca
 * desfaz a publicação nem a emissão.
 *
 * SÓ SERVIDOR.
 */

import { Resend } from "resend"

import { createAdminClient } from "@/utils/supabase/admin"
import { senderAddress } from "@/lib/notifications"
import { clientBrandForPartner } from "@/lib/brand"
import { partnerSiteUrl } from "@/lib/site-url"
import { escapeHtml, masthead, BORDER, INK, MUTED } from "@/lib/emails/shared"

export type SecretaryNoticeKind = "offers_ready" | "tickets_issued"

export async function sendSecretariesNotice(
  caseId: string,
  kind: SecretaryNoticeKind
): Promise<{ sent: number; skipped: number }> {
  const out = { sent: 0, skipped: 0 }
  const admin = createAdminClient()
  if (!admin) return out

  const { data } = await admin
    .from("booking_cases")
    .select(
      "id, organisation_id, pnr, organisation:organisations(id, slug, name, partner:partners(id, slug, is_operator)), trip_request:trip_requests(reference, origin, destination)"
    )
    .eq("id", caseId)
    .maybeSingle()
  const row = data as Record<string, any> | null
  if (!row?.organisation_id) return out
  const org = Array.isArray(row.organisation) ? row.organisation[0] : row.organisation
  const partner = org ? (Array.isArray(org.partner) ? org.partner[0] : org.partner) : null
  const trip = Array.isArray(row.trip_request) ? row.trip_request[0] : row.trip_request
  if (!org || !partner) return out

  const { data: secs } = await admin
    .from("ministry_secretaries")
    .select("id, name, email, link_token")
    .eq("organisation_id", org.id)
    .eq("active", true)
  const secretaries = ((secs ?? []) as { id: string; name: string; email: string | null; link_token: string }[]).filter(
    (s) => s.email && !/\.invalid$/i.test(s.email.trim())
  )
  out.skipped = ((secs ?? []) as unknown[]).length - secretaries.length
  if (!secretaries.length) return out
  if (!process.env.RESEND_API_KEY) {
    console.warn("[ministério] RESEND_API_KEY por configurar: aviso %s não saiu (%s)", kind, caseId)
    return out
  }

  const base = partnerSiteUrl({ slug: partner.slug, isOperator: partner.is_operator })
  const brand = await clientBrandForPartner(partner.id)
  const partnerBrand = brand.kind === "partner" ? brand : null
  const route = trip?.origin && trip?.destination ? `${trip.origin} → ${trip.destination}` : ""
  const ref = trip?.reference ? ` · ${trip.reference}` : ""

  const subject =
    kind === "offers_ready" ? `${org.name} · ofertas prontas${ref}` : `${org.name} · passagens emitidas${ref}`
  const line =
    kind === "offers_ready"
      ? `As ofertas para o pedido ${route} já estão no espaço do ${org.name}. Pode vê-las, imprimi-las e escolher uma.`
      : `As passagens do pedido ${route} foram emitidas${row.pnr ? ` (PNR ${row.pnr})` : ""}. Os bilhetes estão em «Os meus pedidos».`
  const button = kind === "offers_ready" ? "Ver as ofertas" : "Ver os bilhetes"

  const from = partnerBrand?.senderEmail
    ? `${(partnerBrand.senderName ?? partnerBrand.name).replace(/[<>"]/g, "")} <${partnerBrand.senderEmail}>`
    : senderAddress()
  const resend = new Resend(process.env.RESEND_API_KEY)

  for (const sec of secretaries) {
    const link = base ? `${base}/ministerios/${org.slug}/${sec.link_token}/pedidos/${row.id}` : ""
    const hello = `Olá, ${sec.name}.`
    const html = `<!DOCTYPE html><html lang="pt-PT"><head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F7F9;font-family:'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
      ${partnerBrand ? masthead(null, { background: partnerBrand.colorPrimary ?? undefined, brand: partnerBrand }) : masthead(null)}
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;">${escapeHtml(hello)}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(line)}</p>
        ${
          link
            ? `<p style="margin:0 0 20px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:${partnerBrand?.colorPrimary ?? "#EE5128"};color:#ffffff;font-size:15px;font-weight:700;padding:13px 26px;border-radius:999px;text-decoration:none;">${escapeHtml(button)}</a></p>
               <p style="margin:0;font-size:13px;color:${MUTED};">O link é pessoal e pede o seu PIN.</p>`
            : ""
        }
      </td></tr>
      <tr><td style="padding:0 32px 28px;font-size:12px;color:#98A1AE;">${escapeHtml(partnerBrand?.footerText ?? brand.name)}${partnerBrand?.poweredByWeefly ? " · Powered by WeeFly" : ""}</td></tr>
    </table>
  </td></tr></table>
</body></html>`
    const text = [hello, "", line, link, link ? "O link é pessoal e pede o seu PIN." : ""].filter(Boolean).join("\n")

    try {
      const { error } = await resend.emails.send({
        from,
        to: [sec.email!.trim()],
        subject,
        html,
        text,
        ...(partnerBrand?.replyTo ? { replyTo: [partnerBrand.replyTo] } : {}),
      })
      if (error) console.error("[ministério] aviso %s a %s falhou:", kind, sec.id, error.message)
      else out.sent++
    } catch (err) {
      console.error("[ministério] aviso %s falhou:", kind, err)
    }
  }
  return out
}
