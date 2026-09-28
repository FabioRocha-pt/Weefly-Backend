"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getI18n } from "@/i18n/server"
import {
  clearPendingSignup,
  readPendingSignup,
  setPendingSignup,
} from "@/lib/signup-cookie"
import { safeNextPath } from "@/lib/safe-next"

/**
 * Returned to the form on failure. On success the action redirects instead.
 *
 * A frase já vem traduzida: a action corre dentro do pedido e por isso alcança
 * o cookie do idioma. As que vêm do Supabase passam tal e qual — em inglês,
 * porque é a única língua em que ele as escreve.
 */
export type AuthActionState = { error: string | null }

/**
 * PRO-08 · o erro do Supabase, dito na língua de quem se regista.
 *
 * O `error.message` passava tal e qual, em inglês. Os três casos que importam
 * têm código: limite de envios, email já registado, e o envio que falhou do
 * lado do servidor de email (o sintoma de SMTP mal configurado).
 */
function authEmailError(
  error: { code?: string; status?: number; message: string },
  t: (key: string) => string
): string {
  const code = error.code ?? ""
  if (code === "over_email_send_rate_limit" || error.status === 429) {
    return t("auth.emailRateLimited")
  }
  if (code === "user_already_exists" || code === "email_exists") {
    return t("auth.emailTaken")
  }
  if (/sending (confirmation|magic link)? ?email/i.test(error.message)) {
    return t("auth.emailSendFailed")
  }
  return error.message
}

/** Onde o link do email aterra. O `origin` do pedido primeiro, para que o
    link abra no mesmo domínio em que a pessoa se registou. */
function callbackUrl(): string {
  const origin =
    headers().get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? ""
  return `${origin}/auth/callback`
}

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
  const company = field(formData, "company")
  const country = field(formData, "country")
  const phone = field(formData, "phone")

  if (!email || !password) {
    return { error: t("errors.emailPasswordRequired") }
  }

  try {
    const supabase = createClient()

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // The confirmation email links here so we can exchange the code for a
        // session (see app/auth/callback/route.ts).
        emailRedirectTo: callbackUrl(),
        data: {
          first_name: firstName,
          last_name: lastName,
          // PRO-09 · lido pelo trigger da 0022 para o ecrã de aprovação.
          company,
          country,
          phone,
          // PRO-09 · a língua em que a conta recebe a decisão.
          locale: getI18n().locale,
        },
      },
    })

    if (error) return { error: authEmailError(error, t) }

    /* Com a confirmação ligada, o Supabase responde "sucesso" a um email que já
       tem conta — para não revelar quem está registado — mas devolve um
       utilizador sem identidades e não envia nada. Dizer "enviámos" aqui era
       mentir a quem se esqueceu que já tinha conta. */
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return { error: t("auth.emailTaken") }
    }

    if (data.user) setPendingSignup({ userId: data.user.id, email })
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : t("errors.signUpUnexpected"),
    }
  }

  revalidatePath("/", "layout")
  redirect("/confirmar-email")
}

export type ResendState = { ok: boolean; message: string | null }

/**
 * PRO-07 / PRO-08 · reenviar o email de confirmação.
 *
 * Sem `email` no formulário usa o do registo (cookie assinado); o ecrã de link
 * inválido não tem cookie e pede-o. O `auth.resend` é a mesma chamada pública
 * que o cliente do Supabase já permite — isto não abre nada que não estivesse
 * aberto.
 */
export async function resendSignupEmail(formData: FormData): Promise<ResendState> {
  const { t } = getI18n()
  const email = field(formData, "email") || readPendingSignup()?.email || ""
  if (!email) return { ok: false, message: t("auth.resendNeedsEmail") }

  try {
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: callbackUrl() },
    })
    if (error) return { ok: false, message: authEmailError(error, t) }
  } catch {
    return { ok: false, message: t("auth.emailSendFailed") }
  }

  return { ok: true, message: t("auth.resendDone").replace("{email}", email) }
}

/**
 * PRO-07 · corrigir o email de um registo que ainda não foi confirmado.
 *
 * Só a conta do cookie assinado, e só enquanto não estiver confirmada: trocar
 * o email de uma conta activa é outra coisa (e pede a password). Depois de
 * trocar, reenvia para o endereço novo.
 */
export async function changeSignupEmail(formData: FormData): Promise<ResendState> {
  const { t } = getI18n()
  const pending = readPendingSignup()
  const email = field(formData, "email").toLowerCase()

  if (!pending) return { ok: false, message: t("auth.changeEmailExpired") }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: t("auth.changeEmailInvalid") }
  }

  const admin = createAdminClient()
  if (!admin) return { ok: false, message: t("errors.unexpected") }

  const { data: found } = await admin.auth.admin.getUserById(pending.userId)
  if (!found?.user || found.user.email_confirmed_at) {
    clearPendingSignup()
    return { ok: false, message: t("auth.changeEmailExpired") }
  }

  const { error } = await admin.auth.admin.updateUserById(pending.userId, {
    email,
  })
  if (error) return { ok: false, message: authEmailError(error, t) }

  setPendingSignup({ userId: pending.userId, email })

  const supabase = createClient()
  const sent = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl() },
  })
  if (sent.error) return { ok: false, message: authEmailError(sent.error, t) }

  revalidatePath("/confirmar-email")
  return { ok: true, message: t("auth.resendDone").replace("{email}", email) }
}

/** Sign in with email + password. */
export async function signIn(formData: FormData): Promise<AuthActionState> {
  const { t } = getI18n()
  const email = field(formData, "email")
  const password = field(formData, "password")
  /* PRO-01 · de onde veio, se veio de um link directo. */
  const next = safeNextPath(field(formData, "next"))

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
  redirect(next ?? "/modulo")
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

/**
 * Recuperar a password: envia o link de recuperação.
 *
 * O formulário só escrevia na consola — o teste manual de recuperação falhava
 * sem erro nenhum. Responde sempre "enviado" quando o Supabase aceita, mesmo
 * para um email sem conta: dizer o contrário revelava quem está registado.
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<AuthActionState> {
  const { t } = getI18n()
  const email = field(formData, "email")
  if (!email) return { error: t("auth.resendNeedsEmail") }

  try {
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${callbackUrl()}?next=/nova-password`,
    })
    if (error) return { error: authEmailError(error, t) }
  } catch {
    return { error: t("auth.emailSendFailed") }
  }
  return { error: null }
}

/**
 * Definir a password nova. Corre com a sessão que o link de recuperação abriu
 * (ver `auth/callback`), e também serve a quem já está dentro (PRO-13).
 */
export async function updatePassword(formData: FormData): Promise<AuthActionState> {
  const { t } = getI18n()
  const password = field(formData, "password")
  if (password.length < 8) return { error: t("validation.passwordMin") }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: t("errors.sessionExpiredSignIn") }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  revalidatePath("/", "layout")
  return { error: null }
}
