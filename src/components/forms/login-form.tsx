"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertCircle, Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { loginSchema, type LoginFormData } from "@/lib/validations"
import { AuthCard } from "@/components/auth/auth-card"
import { signIn } from "@/actions/auth"

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

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
  // success) redirects to /inicio. Only errors return here.
  const onSubmit = async (data: LoginFormData) => {
    setServerError(null)

    const formData = new FormData()
    formData.set("email", data.email)
    formData.set("password", data.password)

    const result = await signIn(formData)
    if (result?.error) {
      setServerError(result.error)
    }
  }

  return (
    <AuthCard title="Entrar" description="Bem-vindo de volta ao WeeFlyPro.">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

        {/* Password */}
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••"
              {...form.register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-3 flex items-center text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {form.formState.errors.password && (
            <p className="text-sm text-red-500">{form.formState.errors.password.message}</p>
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
              Manter sessão iniciada
            </Label>
          </div>
          <Link
            href="/recuperar-password"
            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            Esqueci-me da password
          </Link>
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
          {form.formState.isSubmitting ? "A entrar..." : "Entrar"}
        </Button>
      </form>

      {/* Footer */}
      <div className="mt-6 text-center">
        <p className="text-sm text-slate-600">
          Ainda não tem conta?{" "}
          <Link href="/registro" className="text-orange-600 hover:text-orange-700 font-medium">
            Criar conta
          </Link>
        </p>
      </div>
    </AuthCard>
  )
}
