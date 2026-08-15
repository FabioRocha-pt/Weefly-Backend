import { redirect } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { getActiveCompany } from "@/lib/companies"
import { getI18n } from "@/i18n/server"

export default async function DefinicoesPage() {
  const { t } = getI18n()
  const company = await getActiveCompany()
  if (!company) redirect("/criar-empresa")

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("nav.companySettings")}</h1>
        <p className="text-slate-500 mt-1">{t("dashboard.settingsSubtitle")}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("onboarding.legalName")}</Label>
            <Input defaultValue={company.legalName} />
          </div>
          <div className="space-y-2">
            <Label>{t("onboarding.commercialName")}</Label>
            <Input defaultValue={company.commercialName} />
          </div>
          <div className="space-y-2">
            <Label>{t("onboarding.nif")}</Label>
            <Input defaultValue={company.nif} />
          </div>
          <div className="space-y-2">
            <Label>{t("onboarding.phone")}</Label>
            <Input defaultValue={company.phone} />
          </div>
          <div className="space-y-2">
            <Label>{t("auth.email")}</Label>
            <Input type="email" defaultValue={company.email} />
          </div>
          <div className="space-y-2">
            <Label>{t("onboarding.city")}</Label>
            <Input defaultValue={company.city} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{t("onboarding.address")}</Label>
            <Input defaultValue={company.address} />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-900 mb-4">
            {t("onboarding.bankSection")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("onboarding.bank")}</Label>
              <Input defaultValue={company.bankName} />
            </div>
            <div className="space-y-2">
              <Label>{t("onboarding.iban")}</Label>
              <Input defaultValue={company.iban} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline">{t("common.cancel")}</Button>
          <Button>{t("dashboard.saveChanges")}</Button>
        </div>
      </div>
    </div>
  )
}
