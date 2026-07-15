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

export function PasswordResetRequestForm() {
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
            Email enviado
          </h1>
          <p className="text-slate-600 mb-8 max-w-sm">
            Enviámos um link de recuperação para o seu email. Clique no link para definir uma nova password.
          </p>
          <Link href="/login">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao login
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
          Recuperar password
        </h1>

        {/* Description */}
        <p className="text-slate-600 text-center mb-8 max-w-sm mx-auto">
          Indique o email da sua conta. Enviamos-lhe um link para definir uma nova password.
        </p>

        {/* Form */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="o-seu@email.com"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "A enviar..." : "Enviar link de recuperação"}
          </Button>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-slate-600 hover:text-orange-600 flex items-center justify-center space-x-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao login</span>
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
