"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircle, Eye, EyeOff, Phone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { registerSchema, type RegisterFormData } from "@/lib/validations"
import { AuthCard } from "@/components/auth/auth-card"
import { COUNTRIES, DEFAULT_COUNTRY, countryName } from "@/lib/countries"
import { LOCALE_TAGS } from "@/i18n/config"
import { signUp } from "@/actions/auth"
import { useI18n, useT } from "@/i18n/provider"
import { translateMessage } from "@/i18n/translate"

export function RegisterForm() {
  const t = useT()
  const { locale } = useI18n()
  /* OCT-26 · todos os países e indicativos (a mesma lista do price checker),
     por nome na língua de quem se regista, com Cabo Verde primeiro. */
  const tag = LOCALE_TAGS[locale]
  const countryOptions = COUNTRIES.map((c) => ({ iso: c.iso, name: countryName(c.iso, tag) })).sort((a, b) =>
    a.iso === DEFAULT_COUNTRY ? -1 : b.iso === DEFAULT_COUNTRY ? 1 : a.name.localeCompare(b.name, tag)
  )
  const cvDial = COUNTRIES.find((c) => c.iso === DEFAULT_COUNTRY)?.dial ?? "+238"
  const dialOptions = [cvDial, ...Array.from(new Set(COUNTRIES.map((c) => c.dial)))
    .filter((d) => d !== cvDial)
    .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")))]
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [phonePrefix, setPhonePrefix] = useState("+238")
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      company: "",
      country: "CV",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  })

  // RHF validates client-side; on success we hand a FormData to the server
  // action, which calls supabase.auth.signUp() and (on success) redirects to
  // /confirmar-email. Only failures return here.
  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null)

    const formData = new FormData()
    formData.set("email", data.email)
    formData.set("password", data.password)
    formData.set("firstName", data.firstName)
    formData.set("lastName", data.lastName)
    formData.set("company", data.company)
    formData.set("country", data.country)
    formData.set("phone", data.phone ? `${phonePrefix} ${data.phone}` : "")

    const result = await signUp(formData)
    if (result?.error) {
      setServerError(result.error)
    }
  }

  return (
    <AuthCard
      title={t("auth.registerTitle")}
      description={t("auth.registerSubtitle")}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* First + last name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">{t("auth.firstName")}</Label>
            <Input
              id="firstName"
              placeholder={t("auth.firstNamePlaceholder")}
              {...form.register("firstName")}
            />
            {form.formState.errors.firstName && (
              <p className="text-sm text-red-500">
                {t(form.formState.errors.firstName.message ?? "")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">{t("auth.lastName")}</Label>
            <Input
              id="lastName"
              placeholder={t("auth.lastNamePlaceholder")}
              {...form.register("lastName")}
            />
            {form.formState.errors.lastName && (
              <p className="text-sm text-red-500">
                {t(form.formState.errors.lastName.message ?? "")}
              </p>
            )}
          </div>
        </div>

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

        {/* PRO-09 · Company */}
        <div className="space-y-2">
          <Label htmlFor="company">{t("auth.company")}</Label>
          <Input
            id="company"
            autoComplete="organization"
            placeholder={t("auth.companyPlaceholder")}
            {...form.register("company")}
          />
          {form.formState.errors.company && (
            <p className="text-sm text-red-500">
              {t(form.formState.errors.company.message ?? "")}
            </p>
          )}
        </div>

        {/* Country + phone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="country">{t("auth.country")}</Label>
            <select
              id="country"
              className="flex h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
              {...form.register("country")}
            >
              {countryOptions.map((country) => (
                <option key={country.iso} value={country.iso}>
                  {country.name}
                </option>
              ))}
            </select>
            {form.formState.errors.country && (
              <p className="text-sm text-red-500">
                {t(form.formState.errors.country.message ?? "")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t("auth.phone")}</Label>
            <div className="flex">
              <select
                aria-label={t("auth.phonePrefix")}
                value={phonePrefix}
                onChange={(e) => setPhonePrefix(e.target.value)}
                className="w-24 h-11 rounded-l-lg border border-r-0 border-slate-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {dialOptions.map((dial) => (
                  <option key={dial} value={dial}>
                    {dial}
                  </option>
                ))}
              </select>
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Phone className="h-4 w-4 text-slate-400" />
                </div>
                <Input
                  id="phone"
                  type="tel"
                  placeholder={t("auth.phonePlaceholder")}
                  className="pl-10 rounded-l-none"
                  {...form.register("phone")}
                />
              </div>
            </div>
            {form.formState.errors.phone && (
              <p className="text-sm text-red-500">
                {t(form.formState.errors.phone.message ?? "")}
              </p>
            )}
          </div>
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={t("auth.passwordPlaceholder")}
              {...form.register("password")}
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
          <p className="text-xs text-slate-500">{t("auth.passwordHint")}</p>
          {form.formState.errors.password && (
            <p className="text-sm text-red-500">
              {t(form.formState.errors.password.message ?? "")}
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder={t("auth.confirmPlaceholder")}
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

        {/* Server error */}
        {serverError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{translateMessage(t, serverError)}</span>
          </div>
        )}

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? t("auth.registerSubmitting")
            : t("auth.createAccount")}
        </Button>

        <p className="text-xs text-slate-500 text-center">
          {t("auth.termsPrefix")}{" "}
          <span className="text-orange-600 font-medium">{t("auth.terms")}</span>{" "}
          {t("auth.termsAnd")}{" "}
          <span className="text-orange-600 font-medium">{t("auth.privacy")}</span>.
        </p>
      </form>
    </AuthCard>
  )
}
