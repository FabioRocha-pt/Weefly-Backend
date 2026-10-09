"use server"

/**
 * WeeFly · B2G v2 · B2G-07 · "Sem PIN não há pedido": entrar e sair do espaço
 * do ministério.
 *
 * O ecrã do PIN chama `enterMinistryPin`. As respostas de erro são as mesmas
 * para um link desconhecido e para um PIN errado, e gastam o mesmo tempo (o
 * scrypt corre sempre): daqui não se descobre que links existem. A única
 * mensagem diferente é a do bloqueio — e essa só aparece a quem já tem um
 * link verdadeiro (o ecrã do PIN só abre com ele).
 *
 * O PIN nunca é registado: nem em log, nem no `access_audit`.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { resolveMinistry } from "@/lib/ministry"
import {
  SECRETARY_COOKIE,
  clearSecretaryCookie,
  hashSessionToken,
  mintSessionToken,
  pinAttemptAllowed,
  setSecretaryCookie,
  verifyPin,
} from "@/lib/secretary-auth"
import { cookies } from "next/headers"
import { getTranslator } from "@/i18n/server"

export type PinResult = { ok: true } | { ok: false; error: string; locked?: boolean }

const SLUG = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export async function enterMinistryPin(orgSlug: string, linkToken: string, pin: string): Promise<PinResult> {
  const t = getTranslator("pt")
  const wrong: PinResult = { ok: false, error: t("ministry.pin.wrong") }
  const cleanPin = String(pin ?? "").replace(/\s+/g, "")

  if (!pinAttemptAllowed()) return { ok: false, error: t("ministry.pin.tooMany") }
  if (!/^\d{6}$/.test(cleanPin)) return { ok: false, error: t("ministry.pin.shape") }

  const admin = createAdminClient()
  if (!admin) return { ok: false, error: t("ministry.pin.unavailable") }

  const lookup = SLUG.test(orgSlug) ? await resolveMinistry(orgSlug, linkToken) : null
  if (!lookup?.ok) {
    await verifyPin(cleanPin, null)
    return wrong
  }
  const { secretary, org, partner } = lookup.ministry

  const { data: secret } = await admin
    .from("ministry_secretary_secrets")
    .select("pin_hash, pin_version, locked_until")
    .eq("secretary_id", secretary.id)
    .maybeSingle()
  const s = secret as { pin_hash: string | null; pin_version: number; locked_until: string | null } | null

  if (s?.locked_until && new Date(s.locked_until).getTime() > Date.now()) {
    return { ok: false, error: t("ministry.pin.locked"), locked: true }
  }

  const good = await verifyPin(cleanPin, s?.pin_hash ?? null)
  if (!good) {
    const { data: fail } = await admin.rpc("secretary_pin_failure", { p_secretary: secretary.id })
    const state = (Array.isArray(fail) ? fail[0] : fail) as { locked: boolean } | null
    if (state?.locked) {
      /* B2G-07 · o bloqueio fica registado (sem o PIN, claro). */
      await admin.from("access_audit").insert({
        actor_user_id: null,
        actor_email: `secretária:${secretary.email ?? secretary.id}`,
        action: "secretary_pin_locked",
        partner_id: partner.id,
        target: secretary.id,
        after: { organisation_id: org.id, minutes: 15 },
      })
      return { ok: false, error: t("ministry.pin.locked"), locked: true }
    }
    return wrong
  }

  await admin.rpc("secretary_pin_success", { p_secretary: secretary.id })

  const token = mintSessionToken()
  const now = new Date()
  const { error } = await admin.from("ministry_secretary_sessions").insert({
    token_hash: hashSessionToken(token),
    secretary_id: secretary.id,
    pin_version: s!.pin_version,
    expires_at: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
  })
  if (error) {
    console.error("[secretária] sessão não aberta:", error.code)
    return { ok: false, error: t("ministry.pin.unavailable") }
  }

  /* Arrumação: as sessões mortas desta secretária saem. */
  await admin
    .from("ministry_secretary_sessions")
    .delete()
    .eq("secretary_id", secretary.id)
    .lt("expires_at", now.toISOString())
  await admin.from("ministry_secretaries").update({ last_access_at: now.toISOString() }).eq("id", secretary.id)

  setSecretaryCookie(org.slug, org.token, token)
  return { ok: true }
}

/** Terminar a sessão neste dispositivo. */
export async function leaveMinistry(orgSlug: string, linkToken: string): Promise<{ ok: true }> {
  const token = cookies().get(SECRETARY_COOKIE)?.value
  const admin = createAdminClient()
  if (token && admin) {
    await admin.from("ministry_secretary_sessions").delete().eq("token_hash", hashSessionToken(token))
  }
  if (SLUG.test(orgSlug) && /^[A-Za-z0-9_-]{32,64}$/.test(linkToken)) clearSecretaryCookie(orgSlug, linkToken)
  return { ok: true }
}
