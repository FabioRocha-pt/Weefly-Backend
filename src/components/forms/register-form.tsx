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
import { COUNTRIES, PHONE_PREFIXES } from "@/types"
import { signUp } from "@/actions/auth"

export function RegisterForm() {
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
    formData.set("country", data.country)
    formData.set("phone", data.phone ? `${phonePrefix} ${data.phone}` : "")

    const result = await signUp(formData)
    if (result?.error) {
      setServerError(result.error)
    }
  }

  return (
    <AuthCard
      title="Registo"
      description="Para fornecedores de serviços e agentes."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* First + last name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nome</Label>
            <Input
              id="firstName"
              placeholder="O seu nome"
              {...form.register("firstName")}
            />
            {form.formState.errors.firstName && (
              <p className="text-sm text-red-500">{form.formState.errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Apelido</Label>
            <Input
              id="lastName"
              placeholder="O seu apelido"
              {...form.register("lastName")}
            />
            {form.formState.errors.lastName && (
              <p className="text-sm text-red-500">{form.formState.errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="nome@empresa.cv"
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
          )}
        </div>

        {/* Country + phone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="country">País</Label>
            <select
              id="country"
              className="flex h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
              {...form.register("country")}
            >
              {COUNTRIES.map((country) => (
                <option key={country.value} value={country.value}>
                  {country.label}
                </option>
              ))}
            </select>
            {form.formState.errors.country && (
              <p className="text-sm text-red-500">{form.formState.errors.country.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <div className="flex">
              <select
                aria-label="Indicativo do país"
                value={phonePrefix}
                onChange={(e) => setPhonePrefix(e.target.value)}
                className="w-24 h-11 rounded-l-lg border border-r-0 border-slate-300 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {PHONE_PREFIXES.map((prefix) => (
                  <option key={prefix.value} value={prefix.value}>
                    {prefix.value}
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
                  placeholder="999 99 99"
                  className="pl-10 rounded-l-none"
                  {...form.register("phone")}
                />
              </div>
            </div>
            {form.formState.errors.phone && (
              <p className="text-sm text-red-500">{form.formState.errors.phone.message}</p>
            )}
          </div>
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Mínimo 8 caracteres"
              {...form.register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700"
              aria-label={showPassword ? "Ocultar password" : "Mostrar password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-500">Use pelo menos 8 caracteres, com um número.</p>
          {form.formState.errors.password && (
            <p className="text-sm text-red-500">{form.formState.errors.password.message}</p>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Repita a password"
              {...form.register("confirmPassword")}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700"
              aria-label={showConfirmPassword ? "Ocultar password" : "Mostrar password"}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {form.formState.errors.confirmPassword && (
            <p className="text-sm text-red-500">{form.formState.errors.confirmPassword.message}</p>
          )}
        </div>

        {/* Server error */}
        {serverError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "A processar..." : "Criar conta"}
        </Button>

        <p className="text-xs text-slate-500 text-center">
          Ao criar conta aceita os{" "}
          <span className="text-orange-600 font-medium">Termos</span> e a{" "}
          <span className="text-orange-600 font-medium">Política de Privacidade</span>.
        </p>
      </form>
    </AuthCard>
  )
}
