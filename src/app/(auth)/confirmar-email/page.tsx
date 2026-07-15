import Link from "next/link"
import { Mail, Send, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function ConfirmarEmailPage() {
  return (
    <div className="w-full max-w-md">
      <Card className="border-0 shadow-lg">
        <CardContent className="flex flex-col items-center justify-center text-center py-12 px-8">
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-6">
            <Mail className="w-10 h-10 text-orange-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-slate-900 mb-3">
            Verifique o seu email
          </h1>

          {/* Description */}
          <p className="text-slate-600 mb-8 max-w-sm">
            Enviámos um link de ativação para o seu email. Clique no link para ativar a sua conta WeeFlyPro.
          </p>

          {/* Resend button */}
          <Button variant="outline" className="mb-6">
            <RefreshCw className="w-4 h-4 mr-2" />
            Reenviar email
          </Button>

          {/* Help text */}
          <p className="text-sm text-slate-500 max-w-xs">
            Não recebeu o email? Verifique a pasta de spam ou clique em reenviar.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
