"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { loginSchema, type LoginFormData } from "@/lib/validations"
import { AuthCard } from "@/components/auth/auth-card"
import { resendSignupEmail, signIn } from "@/actions/auth"
import { useT } from "@/i18n/provider"
import { translateMessage } from "@/i18n/translate"

export function LoginForm({ next }: { next?: string | null }) {
  const t = useT()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  /* OCT-02 · o email por confirmar mostra "Reenviar confirmação". */
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const [resendNote, setResendNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [resending, startResend] = useTransition()
  /* Fica ligado depois do sucesso: a action redirecciona, e o botão não pode
     voltar a "Entrar" enquanto a página seguinte carrega (nem enviar outra vez). */
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  })

  const rememberMe = form.watch("rememberMe")

  // On valid input, hand off to the server action, which signs in and (on
  // success) redirects back to `next` (PRO-01) or to the module chooser.
  // Only errors return here.
  const onSubmit = async (data: LoginFormData) => {
    if (submitting) return
    setSubmitting(true)
    setServerError(null)
    setUnconfirmedEmail(null)
    setResendNote(null)

    const formData = new FormData()
    formData.set("email", data.email)
    formData.set("password", data.password)
    if (next) formData.set("next", next)

    try {
      const result = await signIn(formData)
      if (result?.error) {
        setServerError(result.error)
        if (result.unconfirmed) setUnconfirmedEmail(data.email)
        setSubmitting(false)
      }
    } catch (err) {
      /* OCT-02 · a action rebentou (rede, servidor, versão nova publicada a
         meio). Antes o botão voltava ao normal sem dizer nada. */
      console.error("[login] signIn falhou", err)
      setServerError("errors.signInUnexpected")
      setSubmitting(false)
    }
  }

  const resend = () => {
    if (!unconfirmedEmail) return
    const fd = new FormData()
    fd.set("email", unconfirmedEmail)
    startResend(async () => {
      try {
        const r = await resendSignupEmail(fd)
        setResendNote({ ok: r.ok, text: r.message ?? "" })
      } catch {
        setResendNote({ ok: false, text: t("auth.emailSendFailed") })
      }
    })
  }

  return (
    <AuthCard title={t("auth.loginTitle")} description={t("auth.loginSubtitle")}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t("auth.emailPlaceholder")}
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p className="text-sm text-red-500">
              {t(form.formState.errors.email.message ?? "")}
            </p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={t("auth.passwordDots")}
              {...form.register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-3 flex items-center text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              {showPassword ? t("auth.hide") : t("auth.show")}
            </button>
          </div>
          {form.formState.errors.password && (
            <p className="text-sm text-red-500">
              {t(form.formState.errors.password.message ?? "")}
            </p>
          )}
        </div>

        {/* Remember + forgot */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => form.setValue("rememberMe", checked === true)}
            />
            <Label htmlFor="rememberMe" className="text-sm font-normal cursor-pointer">
              {t("auth.remember")}
            </Label>
          </div>
          <Link
            href="/recuperar-password"
            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            {t("auth.forgot")}
          </Link>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <span>{translateMessage(t, serverError)}</span>
              {unconfirmedEmail && (
                <button
                  type="button"
                  onClick={resend}
                  disabled={resending}
                  className="flex items-center gap-1.5 font-medium text-orange-700 hover:text-orange-800 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5${resending ? " animate-spin" : ""}`} />
                  {t("auth.resendConfirmation")}
                </button>
              )}
              {resendNote?.text && (
                <p role="status" className={resendNote.ok ? "text-green-700" : "text-red-600"}>
                  {resendNote.text}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={submitting} aria-busy={submitting}>
          {submitting ? t("auth.loginSubmitting") : t("auth.signIn")}
        </Button>
      </form>

      {/* Footer */}
      <div className="mt-6 text-center">
        <p className="text-sm text-slate-600">
          {t("auth.noAccount")}{" "}
          <Link href="/registro" className="text-orange-600 hover:text-orange-700 font-medium">
            {t("auth.createAccount")}
          </Link>
        </p>
      </div>
    </AuthCard>
  )
}
