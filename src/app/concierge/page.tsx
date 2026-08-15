import { TravelRequestForm } from "@/components/forms/travel-request-form"
import { getI18n } from "@/i18n/server"

export default function ConciergePage() {
  const { t } = getI18n()

  return (
    <div className="w-full">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
          {t("conciergePage.title")}
        </h1>
        <p className="mt-3 text-slate-500">{t("conciergePage.subtitle")}</p>
      </div>

      <TravelRequestForm />
    </div>
  )
}
