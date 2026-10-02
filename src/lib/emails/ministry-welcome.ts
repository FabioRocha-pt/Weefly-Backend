/**
 * WeeFly · MVP 2 · MIN-05 · o email de boas-vindas do ministério.
 *
 * "Enviado quando o ministério é criado e sempre que o link é regenerado. Com
 * a marca da Alô e powered by WeeFly. Leva o link e instruções completas: o que
 * é, como guardar no ecrã inicial, o que faz cada aba, como pedir ajuda.
 * Instruções de instalação por plataforma."
 *
 * Em português: é para uma secretária de um ministério de Cabo Verde, e a
 * aplicação do ministério fala português.
 *
 * SÓ SERVIDOR.
 */

import { Resend } from "resend"

import { createAdminClient } from "@/utils/supabase/admin"
import { senderAddress } from "@/lib/notifications"
import { clientBrandForPartner } from "@/lib/brand"
import { partnerSiteUrl } from "@/lib/site-url"
import { escapeHtml, masthead, BORDER, INK, MUTED } from "@/lib/emails/shared"

export function ministryLink(
  partner: { slug: string; is_operator: boolean },
  org: { slug: string; link_token: string }
): string {
  const base = partnerSiteUrl({ slug: partner.slug, isOperator: partner.is_operator })
  return base ? `${base}/ministerios/${org.slug}/${org.link_token}` : ""
}

export async function sendMinistryWelcome(
  orgId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, reason: "sem service role" }
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: "RESEND_API_KEY por configurar" }

  const { data } = await admin
    .from("organisations")
    .select("id, slug, name, link_token, secretary_name, secretary_email, partner:partners(id, slug, is_operator)")
    .eq("id", orgId)
    .maybeSingle()
  const row = data as {
    id: string
    slug: string
    name: string
    link_token: string | null
    secretary_name: string | null
    secretary_email: string | null
    partner: { id: string; slug: string; is_operator: boolean } | { id: string; slug: string; is_operator: boolean }[]
  } | null
  if (!row) return { ok: false, reason: "ministério não encontrado" }
  if (!row.secretary_email) return { ok: false, reason: "sem email da secretária" }
  if (!row.link_token) return { ok: false, reason: "sem link" }

  const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner
  const link = ministryLink(partner, { slug: row.slug, link_token: row.link_token })
  if (!link) return { ok: false, reason: "NEXT_PUBLIC_SITE_URL por configurar" }

  const brand = await clientBrandForPartner(partner.id)
  const brandName = brand.name
  const hello = row.secretary_name ? `Olá, ${row.secretary_name}.` : "Olá."
  const wa = brand.whatsapp ? `+${brand.whatsapp.replace(/\D/g, "")}` : null

  const steps: [string, string][] = [
    ["O que é", `A aplicação de viagens do ${row.name}, com a ${brandName}. Pede viagens, escolhe ofertas, dá os dados dos passageiros e vê as passagens emitidas.`],
    ["Novo pedido", "A aba que abre primeiro: datas, destino, passageiros e percurso."],
    ["Minhas passagens", "A viagem activa em cima e, por baixo, o arquivo das passagens emitidas, usadas e expiradas do ministério."],
    ["Android", "Abra o link no Chrome, toque em ⋮ e depois em «Instalar aplicação» (ou «Adicionar ao ecrã principal»)."],
    ["iPhone", "Abra o link no Safari, toque em Partilhar (□↑), escolha «Adicionar ao ecrã principal» e confirme em «Adicionar»."],
    ["Computador", "No Chrome ou no Edge, clique no ícone de instalar na barra de endereço, ou guarde o link nos favoritos."],
    ["Ajuda", wa ? `Toque no botão de WhatsApp dentro da aplicação, ou escreva para ${wa}. Se perder o acesso, peça um link novo por aí.` : `Fale com a ${brandName}. Se perder o acesso, peça um link novo.`],
  ]

  const subject = `${row.name} · a sua aplicação de viagens`
  const partnerBrand = brand.kind === "partner" ? brand : null
  const html = `<!DOCTYPE html><html lang="pt-PT"><head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F7F9;font-family:'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
      ${partnerBrand ? masthead(null, { background: partnerBrand.colorPrimary ?? undefined, brand: partnerBrand }) : masthead(null)}
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;">${escapeHtml(hello)}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MUTED};">Este é o link da aplicação de viagens do <b>${escapeHtml(row.name)}</b>. É pessoal: não o partilhe. Um link novo substitui este, e este deixa de funcionar.</p>
        <p style="margin:0 0 24px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:${partnerBrand?.colorPrimary ?? "#EE5128"};color:#ffffff;font-size:15px;font-weight:700;padding:13px 26px;border-radius:999px;text-decoration:none;">Abrir a aplicação</a></p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${steps
            .map(
              ([k, v]) =>
                `<tr><td style="padding:9px 0;border-top:1px solid ${BORDER};vertical-align:top;width:34%;font-size:13px;font-weight:700;">${escapeHtml(k)}</td><td style="padding:9px 0;border-top:1px solid ${BORDER};font-size:14px;line-height:1.55;color:${MUTED};">${escapeHtml(v)}</td></tr>`
            )
            .join("")}
        </table>
        <p style="margin:20px 0 0;font-size:12px;color:#98A1AE;word-break:break-all;">${escapeHtml(link)}</p>
      </td></tr>
      <tr><td style="padding:0 32px 28px;font-size:12px;color:#98A1AE;">${escapeHtml(partnerBrand?.footerText ?? brandName)}${partnerBrand?.poweredByWeefly ? " · Powered by WeeFly" : ""}</td></tr>
    </table>
  </td></tr></table>
</body></html>`

  const text = [
    hello,
    "",
    `Este é o link da aplicação de viagens do ${row.name}: ${link}`,
    "É pessoal: não o partilhe. Um link novo substitui este.",
    "",
    ...steps.map(([k, v]) => `${k}: ${v}`),
  ].join("\n")

  const from =
    partnerBrand?.senderEmail
      ? `${(partnerBrand.senderName ?? partnerBrand.name).replace(/[<>"]/g, "")} <${partnerBrand.senderEmail}>`
      : senderAddress()

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from,
    to: [row.secretary_email],
    subject,
    html,
    text,
    ...(partnerBrand?.replyTo ? { replyTo: [partnerBrand.replyTo] } : {}),
  })
  if (error) return { ok: false, reason: error.message ?? "falhou" }
  return { ok: true }
}
