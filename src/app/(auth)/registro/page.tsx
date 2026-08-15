import { RegisterForm } from "@/components/forms/register-form"
import { getI18n } from "@/i18n/server"

/* Os três passos do lado esquerdo: cor, número e as duas frases de cada um. */
const STEPS = [
  { n: 1, ring: "bg-orange-600", text: "text-orange-600", key: "step1" },
  { n: 2, ring: "bg-blue-600", text: "text-blue-600", key: "step2" },
  { n: 3, ring: "bg-green-600", text: "text-green-600", key: "step3" },
]

export default function RegisterPage() {
  const { t } = getI18n()

  return (
    <div className="w-full max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        {/* Left side - Information */}
        <div className="hidden lg:block pt-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-6">
            {t("auth.asideTitle")}
          </h1>
          <p className="text-slate-600 text-lg mb-8">{t("auth.asideSubtitle")}</p>

          {/* Steps */}
          <div className="space-y-6">
            {STEPS.map((step) => (
              <div key={step.n} className="flex items-start space-x-4">
                <div
                  className={`w-10 h-10 rounded-full ${step.ring} flex items-center justify-center flex-shrink-0`}
                >
                  <span className="text-white font-bold">{step.n}</span>
                </div>
                <div>
                  <h3 className={`${step.text} font-semibold text-lg`}>
                    {t(`auth.${step.key}Title`)}
                  </h3>
                  <p className="text-slate-600 text-sm">{t(`auth.${step.key}Body`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right side - Form */}
        <div>
          <RegisterForm />
        </div>
      </div>
    </div>
  )
}
