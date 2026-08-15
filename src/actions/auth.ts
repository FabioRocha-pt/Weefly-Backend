"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"

import { createClient } from "@/utils/supabase/server"
import { getI18n } from "@/i18n/server"

/**
 * Returned to the form on failure. On success the action redirects instead.
 *
 * A frase já vem traduzida: a action corre dentro do pedido e por isso alcança
 * o cookie do idioma. As que vêm do Supabase passam tal e qual — em inglês,
 * porque é a única língua em que ele as escreve.
 */
export type AuthActionState = { error: string | null }

/** Read a trimmed string field from FormData. */
function field(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Create an account.
 *
 * Reads the register form fields and forwards the personal metadata into
 * `options.data`, which the `handle_new_user` trigger copies into `profiles`.
 * Field names match the register form (firstName/lastName); they are mapped to
 * the snake_case metadata keys the profiles table expects.
 */
export async function signUp(formData: FormData): Promise<AuthActionState> {
  const { t } = getI18n()
  const email = field(formData, "email")
  const password = field(formData, "password")
  const firstName = field(formData, "firstName")
  const lastName = field(formData, "lastName")
  const country = field(formData, "country")
  const phone = field(formData, "phone")

  if (!email || !password) {
    return { error: t("errors.emailPasswordRequired") }
  }

  const origin =
    headers().get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? ""

  try {
    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // The confirmation email links here so we can exchange the code for a
        // session (see app/auth/callback/route.ts).
        emailRedirectTo: `${origin}/auth/callback`,
        data: {
          first_name: firstName,
          last_name: lastName,
          country,
          phone,
        },
      },
    })

    if (error) return { error: error.message }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : t("errors.signUpUnexpected"),
    }
  }

  revalidatePath("/", "layout")
  redirect("/confirmar-email")
}

/** Sign in with email + password. */
export async function signIn(formData: FormData): Promise<AuthActionState> {
  const { t } = getI18n()
  const email = field(formData, "email")
  const password = field(formData, "password")

  if (!email || !password) {
    return { error: t("errors.fillEmailPassword") }
  }

  try {
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) return { error: error.message }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : t("errors.signInUnexpected"),
    }
  }

  revalidatePath("/", "layout")
  redirect("/inicio")
}

/** Destroy the session and return to the login screen. */
export async function signOut(): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.auth.signOut()
  } catch {
    // Even if sign-out fails server-side, send the user to /login.
  }

  revalidatePath("/", "layout")
  redirect("/login")
}
