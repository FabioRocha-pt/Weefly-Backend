import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getI18n } from "@/i18n/server"

export default function NotFound() {
  const { t } = getI18n()

  return (
    <div className="min-h-screen auth-bg flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-orange-600">404</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-4">
          {t("notFound.title")}
        </h1>
        <p className="text-slate-500 mt-2 mb-6">{t("notFound.body")}</p>
        <Link href="/inicio">
          <Button>{t("notFound.cta")}</Button>
        </Link>
      </div>
    </div>
  )
}
