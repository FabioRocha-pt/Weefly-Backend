import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function LinkInvalidoPage() {
  return (
    <div className="w-full max-w-md">
      <Card className="border-0 shadow-lg">
        <CardContent className="flex flex-col items-center justify-center text-center py-12 px-8">
          {/* Error icon */}
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-red-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-slate-900 mb-3">
            Este link já não é válido
          </h1>

          {/* Description */}
          <p className="text-slate-600 mb-8 max-w-sm">
            O link de ativação expirou ou já foi utilizado. Peça um novo — enviamos de imediato para nome@empresa.cv
          </p>

          {/* Send new link button */}
          <Button className="bg-orange-600 hover:bg-orange-700 mb-6">
            Enviar novo link
          </Button>

          {/* Help text */}
          <p className="text-sm text-slate-500">
            Precisa de ajuda?{" "}
            <Link href="/ajuda" className="text-orange-600 hover:text-orange-700 font-medium">
              Fale com a equipa WeeFly
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
