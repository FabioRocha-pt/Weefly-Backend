"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Eye, EyeOff, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { newPasswordSchema, getPasswordStrength, type NewPasswordFormData } from "@/lib/validations"

export function NewPasswordForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [password, setPassword] = useState("")

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
    passwordStrength.label === "Fraca" ? 2 : passwordStrength.label === "Boa" ? 3 : 4
  const strengthBarColor =
    passwordStrength.label === "Fraca" ? "bg-red-500" : "bg-green-500"

  const onSubmit = (data: NewPasswordFormData) => {
    console.log("New password set:", data)
    // Handle new password submission
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
          Nova password
        </h1>

        {/* Description */}
        <p className="text-slate-600 text-center mb-8 max-w-sm mx-auto">
          Defina a nova password da conta nome@empresa.cv
        </p>

        {/* Form */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">Nova password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Palavra passe"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  form.setValue("password", e.target.value)
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

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
                Força: <span className="font-medium text-slate-700">{passwordStrength.label.toLowerCase()}</span>
                {passwordStrength.score < 5 && " · use um símbolo para ficar excelente"}
              </p>
            </div>
          )}

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirmar palavra passe"
                {...form.register("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.formState.errors.confirmPassword && (
              <p className="text-sm text-red-500">{form.formState.errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "A guardar..." : "Guardar e entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
