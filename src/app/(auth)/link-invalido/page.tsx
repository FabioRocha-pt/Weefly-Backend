import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getI18n } from "@/i18n/server"

export default function LinkInvalidoPage() {
  const { t } = getI18n()

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
            {t("auth.invalidTitle")}
          </h1>

          {/* Description */}
          <p className="text-slate-600 mb-8 max-w-sm">{t("auth.invalidBody")}</p>

          {/* Send new link button */}
          <Button className="bg-orange-600 hover:bg-orange-700 mb-6">
            {t("auth.invalidCta")}
          </Button>

          {/* Help text */}
          <p className="text-sm text-slate-500">
            {t("auth.invalidHelpPrefix")}{" "}
            <Link href="/ajuda" className="text-orange-600 hover:text-orange-700 font-medium">
              {t("auth.invalidHelpLink")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
