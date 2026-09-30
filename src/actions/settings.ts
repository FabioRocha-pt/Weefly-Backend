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
