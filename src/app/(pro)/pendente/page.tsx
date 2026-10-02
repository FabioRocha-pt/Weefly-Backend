import { redirect } from "next/navigation"
import { Clock, XCircle } from "lucide-react"

import { signOut } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { ContactTeam } from "@/components/pro/contact-team"
import { getI18n } from "@/i18n/server"
import { getProAccount } from "@/lib/pro-account"

/**
 * PRO-09 · a conta existe mas ainda não foi validada pelo Dominik, ou foi
 * recusada, e aqui lê-se o motivo.
 *
 * OCT-05 · a conta pendente entra e fica aqui: não vê módulo nenhum, e pode
 * escrever à equipa WeeFly. O email de contacto é `common.supportEmail`.
 */
export default async function PendentePage() {
  const { t } = getI18n()
  const account = await getProAccount()
  if (!account) redirect("/login")
  if (account.status === "approved") redirect("/modulo")

  /* ADM-02 · uma conta suspensa lê-se como recusada: não entra, e diz porquê
     sem dizer quem. */
  const suspended = account.status === "suspended"
  const rejected = account.status === "rejected" || suspended

  return (
    <div className="max-w-lg mx-auto rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <div
        className={
          rejected
            ? "w-14 h-14 mx-auto rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-5"
            : "w-14 h-14 mx-auto rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-5"
        }
      >
        {rejected ? <XCircle className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
      </div>
      <h1 className="text-2xl font-bold text-slate-900">
        {suspended
          ? t("pro.suspendedTitle")
          : rejected
            ? t("pro.rejectedTitle")
            : t("pro.pendingTitle")}
      </h1>
      <p className="text-slate-500 mt-2">
        {suspended
          ? t("pro.suspendedBody")
          : rejected
            ? t("pro.rejectedBody")
            : t("pro.pendingBody", { email: account.email })}
      </p>
      {rejected && !suspended && account.rejectionReason && (
        <blockquote className="mt-5 rounded-xl bg-slate-50 border border-slate-200 p-4 text-left text-sm text-slate-700 whitespace-pre-wrap">
          {account.rejectionReason}
        </blockquote>
      )}
      {!suspended && <ContactTeam supportEmail={t("common.supportEmail")} />}
      <form action={signOut} className="mt-6">
        <Button type="submit" variant="outline">
          {t("nav.signOut")}
        </Button>
      </form>
    </div>
  )
}
