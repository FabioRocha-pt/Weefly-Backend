import Link from "next/link"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function EmailConfirmadoPage() {
  return (
    <div className="w-full max-w-md">
      <Card className="border-0 shadow-lg">
        <CardContent className="flex flex-col items-center justify-center text-center py-12 px-8">
          {/* Success icon */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center border-4 border-green-200">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            {/* Decorative outer ring */}
            <div className="absolute -inset-4 rounded-full border-2 border-green-600 opacity-20 animate-pulse" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-slate-900 mb-3">
            Email confirmado
          </h1>

          {/* Description */}
          <p className="text-slate-600 mb-8 max-w-sm">
            A sua conta está ativa. O próximo passo é entrar e criar a sua primeira empresa — de fornecedor, de agente, ou ambas.
          </p>

          {/* Continue button */}
          <Link href="/login">
            <Button className="bg-orange-600 hover:bg-orange-700">
              Continuar para o WeeFlyPro
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
