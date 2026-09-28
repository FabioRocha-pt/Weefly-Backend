import Link from "next/link"
import { Mail } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { SignupEmailActions } from "@/components/auth/signup-email-actions"
import { getI18n } from "@/i18n/server"
import { readPendingSignup } from "@/lib/signup-cookie"

/**
 * PRO-07 · "Enviámos um email para nome@exemplo.com", com reenviar e corrigir.
 *
 * O endereço vem do cookie assinado do registo (ver `lib/signup-cookie.ts`),
 * nunca do URL. Sem cookie — link aberto noutro browser, ou passadas 24 h — o
 * ecrã cai no texto genérico e pede o email para reenviar.
 */
export default function ConfirmarEmailPage() {
  const { t } = getI18n()
  const pending = readPendingSignup()

  return (
    <div className="w-full max-w-md">
      <Card className="border-0 shadow-lg">
        <CardContent className="flex flex-col items-center justify-center text-center py-12 px-8">
          <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-6">
            <Mail className="w-10 h-10 text-orange-600" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-3">
            {t("auth.confirmEmailTitle")}
          </h1>

          <p className="text-slate-600 mb-8 max-w-sm">
            {pending ? (
              <>
                {t("auth.confirmEmailSentTo")}{" "}
                <b className="text-slate-900 break-all">{pending.email}</b>.{" "}
                {t("auth.confirmEmailClick")}
              </>
            ) : (
              t("auth.confirmEmailBody")
            )}
          </p>

          <SignupEmailActions email={pending?.email ?? null} askEmail={!pending} />

          <p className="text-sm text-slate-500 max-w-xs">
            {t("auth.confirmEmailHelp")}{" "}
            <Link href="/login" className="text-orange-600 hover:text-orange-700 font-medium">
              {t("auth.confirmEmailBackToLogin")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
