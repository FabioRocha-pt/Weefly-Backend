import { getI18n } from "@/i18n/server"

export function OnboardingSteps({ currentStep = 1 }: { currentStep?: 1 | 2 | 3 }) {
  const { t } = getI18n()

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-orange-600 font-semibold text-lg mb-2">
          1. {t("auth.step1Title")}
        </h3>
        <p className="text-slate-600 text-sm">{t("auth.step1Body")}</p>
      </div>

      <div className="space-y-2">
        <div
          className={`flex items-center space-x-3 transition-colors ${
            currentStep >= 2 ? "text-blue-600" : "text-slate-400"
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
              currentStep >= 2 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-400"
            }`}
          >
            2
          </div>
          <span className="font-medium">{t("auth.step2Title")}</span>
        </div>
        <p className="text-slate-500 text-sm ml-9">{t("auth.step2BodyShort")}</p>
      </div>

      <div className="space-y-2">
        <div
          className={`flex items-center space-x-3 transition-colors ${
            currentStep >= 3 ? "text-green-600" : "text-slate-400"
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
              currentStep >= 3 ? "bg-green-600 text-white" : "bg-slate-200 text-slate-400"
            }`}
          >
            3
          </div>
          <span className="font-medium">{t("auth.step3Title")}</span>
        </div>
        <p className="text-slate-500 text-sm ml-9">{t("auth.step3Body")}</p>
      </div>
    </div>
  )
}
