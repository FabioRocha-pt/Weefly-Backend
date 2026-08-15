import { Mail, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getI18n } from "@/i18n/server"

export default function ConfirmarEmailPage() {
  const { t } = getI18n()

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
            {t("auth.confirmEmailTitle")}
          </h1>

          {/* Description */}
          <p className="text-slate-600 mb-8 max-w-sm">
            {t("auth.confirmEmailBody")}
          </p>

          {/* Resend button */}
          <Button variant="outline" className="mb-6">
            <RefreshCw className="w-4 h-4 mr-2" />
            {t("auth.confirmEmailResend")}
          </Button>

          {/* Help text */}
          <p className="text-sm text-slate-500 max-w-xs">
            {t("auth.confirmEmailHelp")}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
