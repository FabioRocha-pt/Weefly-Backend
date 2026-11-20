"use server"

/**
 * WeeFly · I18N-01 · as Definições do utilizador.
 *
 * A língua do back-office fica na conta, e não num cookie: "mantém-se entre
 * sessões e dispositivos". Só muda o que esta pessoa vê.
 */

import { revalidatePath } from "next/cache"

import { createClient } from "@/utils/supabase/server"
import { isBoLocale } from "@/i18n/bo"
import { isTimeZone } from "@/lib/bo-timezone"

export async function setBoLocale(locale: string): Promise<{ ok: boolean; error?: string }> {
  if (!isBoLocale(locale)) return { ok: false, error: "bo.shell.language.invalid" }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "bo.shell.language.noSession" }

  const { error } = await supabase.auth.updateUser({ data: { bo_locale: locale } })
  if (error) return { ok: false, error: error.message }

  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * E8 · o fuso das horas do back-office, na conta (`bo_timezone`), como a
 * língua. `auto` é a primeira visita: o browser diz em que fuso está e fica
 * guardado — mas nunca por cima de uma escolha que a pessoa já fez.
 */
export async function setBoTimeZone(
  timeZone: string,
  options: { auto?: boolean } = {}
): Promise<{ ok: boolean; error?: string }> {
  if (!isTimeZone(timeZone)) return { ok: false, error: "bo.shell.timeZone.invalid" }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "bo.shell.language.noSession" }

  const stored = (user.user_metadata as Record<string, unknown> | undefined)?.bo_timezone
  if (options.auto && isTimeZone(stored)) return { ok: true }
  if (stored === timeZone) return { ok: true }

  const { error } = await supabase.auth.updateUser({ data: { bo_timezone: timeZone } })
  if (error) return { ok: false, error: error.message }

  revalidatePath("/", "layout")
  return { ok: true }
}
