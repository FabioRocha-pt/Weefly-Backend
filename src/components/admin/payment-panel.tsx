"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  checkPaymentState,
  confirmPaymentReceived,
  generatePaymentLink,
} from "@/actions/payments"
import { formatAmount, type CasePayment } from "@/lib/case-status"
import { useT } from "@/i18n/provider"

/**
 * O painel de pagamento da ficha do caso.
 *
 * Mostra o que é verdade em cada um dos dois mundos: com a WeePay ligada há
 * botões para gerar o link e sondar o estado; sem ela, há o valor, a declaração
 * do cliente e o botão de confirmar à mão. O botão de confirmar existe sempre —
 * mesmo com gateway, há sempre quem transfira por fora.
 */
export function PaymentPanel({
  caseId,
  payment,
  weepayConfigured,
  declaredAt,
  lastCheckedAt,
  failureReason,
}: {
  caseId: string
  payment: CasePayment
  weepayConfigured: boolean
  declaredAt: string | null
  lastCheckedAt: string | null
  failureReason: string | null
}) {
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const settled = payment.status === "COMPLETED"

  function run(action: () => Promise<{ error: string | null; notice?: string }>) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else {
        setNotice(result.notice ?? null)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-2xl font-bold text-adm-txt">
          {formatAmount(payment.amount, payment.currency)}
        </p>
        {payment.description && (
          <p className="mt-1 text-[13px] text-adm-muted">{payment.description}</p>
        )}
        <p className="mt-2 text-[11.5px] font-semibold text-adm-txt-2">
          {t("admin.payStatus", { status: t("paymentStatus." + payment.status) })}
          {lastCheckedAt && (
            <span className="font-normal text-adm-muted">
              {t("admin.payCheckedAt", { when: when(lastCheckedAt) })}
            </span>
          )}
        </p>
        {payment.paid_at && (
          <p className="text-[11.5px] text-adm-ok">
            {t("admin.payPaidAt", { when: when(payment.paid_at) })}
          </p>
        )}
        {payment.weepay_transaction_id && (
          <p className="mt-1 truncate font-mono text-[11px] text-adm-muted">
            {payment.weepay_transaction_id}
          </p>
        )}
      </div>

      {declaredAt && !settled && (
        <div className="rounded-lg bg-adm-warn/10 p-3 text-[12px] leading-relaxed text-adm-warn">
          {t("admin.payClientDeclared", { when: when(declaredAt) })}
        </div>
      )}

      {failureReason && !settled && (
        <div className="flex items-start gap-2 rounded-lg bg-adm-ember/10 p-3 text-[12px] leading-relaxed text-adm-ember">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{failureReason}</span>
        </div>
      )}

      {payment.payment_url && !settled && (
        <a
          href={payment.payment_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-adm-line bg-adm-panel-2 px-4 py-2.5 text-[13px] font-semibold text-adm-txt-2 transition-colors hover:bg-adm-raise hover:text-adm-txt"
        >
          {t("admin.payOpenGateway")}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      {!weepayConfigured && !settled && (
        <p className="rounded-lg bg-adm-warn/10 p-3 text-[11.5px] leading-relaxed text-adm-warn">
          {t("admin.payNotConfigured")}
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-adm-ember/10 p-3 text-[12px] leading-relaxed text-adm-ember">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-adm-ok/10 p-3 text-[12px] leading-relaxed text-adm-ok">
          {notice}
        </p>
      )}

      {!settled && (
        <div className="space-y-2">
          {weepayConfigured && !payment.weepay_transaction_id && (
            <Button
              onClick={() => run(() => generatePaymentLink(caseId))}
              pending={pending}
              icon={<CreditCard className="h-4 w-4" />}
              primary
            >
              {t("admin.payGenerateLink")}
            </Button>
          )}

          {weepayConfigured && payment.weepay_transaction_id && (
            <Button
              onClick={() => run(() => checkPaymentState(caseId))}
              pending={pending}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              {t("admin.payCheckStatus")}
            </Button>
          )}

          <Button
            onClick={() => run(() => confirmPaymentReceived(caseId, payment.id))}
            pending={pending}
            icon={<Check className="h-4 w-4" />}
            primary={!weepayConfigured}
          >
            {t("admin.payMarkPaid")}
          </Button>
        </div>
      )}
    </div>
  )
}

function Button({
  onClick,
  pending,
  icon,
  primary,
  children,
}: {
  onClick: () => void
  pending: boolean
  icon: React.ReactNode
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-60",
        primary
          ? "bg-adm-ember text-white hover:bg-adm-ember-dark"
          : "border border-adm-line bg-adm-raise text-adm-txt-2 hover:text-adm-txt"
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Atlantic/Cape_Verde",
  }).format(new Date(iso))
}
