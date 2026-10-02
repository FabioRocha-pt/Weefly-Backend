"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircle, Eye, EyeOff, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { newPasswordSchema, getPasswordStrength, type NewPasswordFormData } from "@/lib/validations"
import { useT } from "@/i18n/provider"
import { translateMessage } from "@/i18n/translate"
import { updatePassword } from "@/actions/auth"

export function NewPasswordForm({ email }: { email: string | null }) {
  const t = useT()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [password, setPassword] = useState("")
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const form = useForm<NewPasswordFormData>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  })

  const passwordStrength = getPasswordStrength(password)
  // Map the 0–5 score onto 4 segmented bars + a colour for the filled ones.
  const strengthBars =
    passwordStrength.level === "weak" ? 2 : passwordStrength.level === "good" ? 3 : 4
  const strengthBarColor =
    passwordStrength.level === "weak" ? "bg-red-500" : "bg-green-500"

  /* OCT-04 · o formulário só escrevia na consola: a password nunca mudava.
     Corre com a sessão que o link de recuperação abriu (`auth/callback`). */
  const onSubmit = async (data: NewPasswordFormData) => {
    setServerError(null)
    const fd = new FormData()
    fd.set("password", data.password)
    try {
      const result = await updatePassword(fd)
      if (result.error) {
        setServerError(result.error)
        return
      }
      setDone(true)
      window.location.assign("/modulo")
    } catch (err) {
      console.error("[nova-password] falhou", err)
      setServerError("errors.unexpected")
    }
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="py-12 px-8">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
            <Lock className="w-10 h-10 text-orange-600" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-900 text-center mb-3">
          {t("auth.newPasswordTitle")}
        </h1>

        {/* Description */}
        <p className="text-slate-600 text-center mb-8 max-w-sm mx-auto">
          {email ? t("auth.newPasswordFor", { email }) : t("auth.newPasswordNoSession")}
        </p>

        {/* Form */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.newPasswordLabel")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t("auth.newPasswordPlaceholder")}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  form.setValue("password", e.target.value, { shouldValidate: form.formState.isSubmitted })
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700"
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {form.formState.errors.password && (
            <p className="text-sm text-red-500">
              {t(form.formState.errors.password.message ?? "")}
            </p>
          )}

          {/* Password strength indicator — 4 segmented bars */}
          {password && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((i) => {
                  const filled = i < strengthBars
                  return (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-colors ${
                        filled ? strengthBarColor : "bg-slate-200"
                      }`}
                    />
                  )
                })}
              </div>
              <p className="text-xs text-slate-500">
                {t("auth.strength", {
                  level: t(`passwordStrength.${passwordStrength.level}`).toLowerCase(),
                })}
                {passwordStrength.score < 5 && ` · ${t("auth.strengthHint")}`}
              </p>
            </div>
          )}

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder={t("auth.newPasswordConfirmPlaceholder")}
                {...form.register("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700"
                aria-label={
                  showConfirmPassword ? t("auth.hidePassword") : t("auth.showPassword")
                }
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.formState.errors.confirmPassword && (
              <p className="text-sm text-red-500">
                {t(form.formState.errors.confirmPassword.message ?? "")}
              </p>
            )}
          </div>

          {serverError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{translateMessage(t, serverError)}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || done}>
            {form.formState.isSubmitting || done
              ? t("auth.newPasswordSubmitting")
              : t("auth.newPasswordSubmit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
