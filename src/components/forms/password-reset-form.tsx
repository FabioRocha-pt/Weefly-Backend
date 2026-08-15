"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Key, ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { passwordResetSchema, type PasswordResetFormData } from "@/lib/validations"
import { useT } from "@/i18n/provider"

export function PasswordResetRequestForm() {
  const t = useT()
  const [isSubmitted, setIsSubmitted] = useState(false)

  const form = useForm<PasswordResetFormData>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      email: "",
    },
  })

  const onSubmit = (data: PasswordResetFormData) => {
    console.log("Password reset request:", data)
    // Handle password reset request
    setIsSubmitted(true)
  }

  if (isSubmitted) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="flex flex-col items-center justify-center text-center py-12 px-8">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <Key className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">
            {t("auth.resetSentTitle")}
          </h1>
          <p className="text-slate-600 mb-8 max-w-sm">{t("auth.resetSentBody")}</p>
          <Link href="/login">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("auth.backToLogin")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="py-12 px-8">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
            <Key className="w-10 h-10 text-orange-600" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-900 text-center mb-3">
          {t("auth.resetTitle")}
        </h1>

        {/* Description */}
        <p className="text-slate-600 text-center mb-8 max-w-sm mx-auto">
          {t("auth.resetBody")}
        </p>

        {/* Form */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("auth.resetEmailPlaceholder")}
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-500">
                {t(form.formState.errors.email.message ?? "")}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? t("auth.resetSubmitting")
              : t("auth.resetSubmit")}
          </Button>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-slate-600 hover:text-orange-600 flex items-center justify-center space-x-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t("auth.backToLogin")}</span>
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
