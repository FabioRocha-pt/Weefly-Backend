"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { approveProAccount, rejectProAccount, resendAccountConfirmation } from "@/actions/pro"
import { type SubdomainCheck } from "@/actions/subdomain"
import { SubdomainField } from "@/components/pro/subdomain-field"
import { toSubdomain } from "@/lib/subdomain"
import { useT } from "@/i18n/provider"

/**
 * PRO-09 · uma conta pendente: aprovar (empresa, tipo, módulo, menus) ou
 * recusar com motivo. As duas pedem confirmação.
 *
 * OCT-08 · o "Email confirmado" vem de `auth.users.email_confirmed_at`; por
 * confirmar, há "Reenviar confirmação".
 * OCT-10 · recusar abre uma janela com a nota obrigatória, que segue por email.
 * OCT-12 · o subdomínio diz se está livre enquanto se escreve.
 */

type Menu = "flights" | "cars" | "houses" | "experiences" | "food"

/* A etiqueta de cada menu vem de `pro.menu.<id>`. */
const MENUS: Menu[] = ["flights", "cars", "houses", "experiences", "food"]

interface PartnerOption {
  id: string
  name: string
  isOperator: boolean
  sellMode: "reseller" | "white_label" | null
  sellEnabled: boolean
  agentMenus: Menu[]
}

interface Props {
  account: {
    userId: string
    email: string
    name: string
    phone: string | null
    country: string | null
    companyHint: string | null
    emailConfirmed: boolean
    createdLabel: string
  }
  partners: PartnerOption[]
}

export function AccountReview({ account, partners }: Props) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [partnerChoice, setPartnerChoice] = useState<"new" | "existing">("new")
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "")
  const [companyName, setCompanyName] = useState(account.companyHint ?? "")
  const [slug, setSlug] = useState(toSubdomain(account.companyHint ?? ""))
  const [slugTouched, setSlugTouched] = useState(false)
  const [sellMode, setSellMode] = useState<"reseller" | "white_label">("reseller")
  const [customerFront, setCustomerFront] = useState<"own" | "weefly">("weefly")
  const [agentEnabled, setAgentEnabled] = useState(true)
  const [menus, setMenus] = useState<Menu[]>(["flights"])
  const [reason, setReason] = useState("")
  const [slugState, setSlugState] = useState<SubdomainCheck | "checking">("unknown")

  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === partnerId) ?? null,
    [partners, partnerId]
  )
  /* Juntar alguém à WeeFly Global não muda a WeeFly Global (ver a acção). */
  const operatorLocked = partnerChoice === "existing" && Boolean(selectedPartner?.isOperator)

  const pickPartner = (id: string) => {
    setPartnerId(id)
    const p = partners.find((x) => x.id === id)
    if (p) {
      setSellMode(p.sellMode ?? "reseller")
      setAgentEnabled(p.sellEnabled)
      setMenus(p.agentMenus.length ? p.agentMenus : ["flights"])
    }
  }

  const toggleMenu = (id: Menu) =>
    setMenus((current) => (current.includes(id) ? current.filter((m) => m !== id) : [...current, id]))

  const resend = () =>
    start(async () => {
      setMessage(null)
      const result = await resendAccountConfirmation(account.userId)
      setMessage(result.ok ? { ok: true, text: result.notice ?? "" } : { ok: false, text: result.error })
    })

  /* OCT-12 · com um nome ocupado (ou ainda por verificar) não se aprova. */
  const slugBlocked =
    partnerChoice === "new" && slugState !== "available" && slugState !== "unknown"

  const approve = () => {
    if (slugBlocked) {
      setMessage({ ok: false, text: t(`bo.pro.common.subdomain.${slugState}`) })
      return
    }
    const target =
      partnerChoice === "new"
        ? companyName || t("bo.pro.review.newCompanyFallback")
        : selectedPartner?.name ?? t("bo.pro.review.companyFallback")
    if (!window.confirm(t("bo.pro.review.approveConfirm", { email: account.email, target }))) return
    start(async () => {
      setMessage(null)
      const result = await approveProAccount({
        userId: account.userId,
        partnerChoice,
        partnerId: partnerChoice === "existing" ? partnerId : undefined,
        companyName: partnerChoice === "new" ? companyName : undefined,
        slug: partnerChoice === "new" ? slug : undefined,
        sellMode,
        customerFront,
        agentEnabled,
        menus,
      })
      setMessage(result.ok ? { ok: true, text: result.notice ?? t("bo.pro.review.approvedNotice") } : { ok: false, text: result.error })
      if (result.ok) router.refresh()
    })
  }

  const reject = () => {
    if (reason.trim().length < 3) {
      setMessage({ ok: false, text: t("bo.pro.review.reasonRequired") })
      return
    }
    if (!window.confirm(t("bo.pro.review.rejectConfirm", { name: account.name, email: account.email }))) return
    start(async () => {
      setMessage(null)
      const result = await rejectProAccount({ userId: account.userId, reason })
      setMessage(result.ok ? { ok: true, text: result.notice ?? t("bo.pro.review.rejectedNotice") } : { ok: false, text: result.error })
      if (result.ok) {
        setMode("idle")
        router.refresh()
      }
    })
  }

  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{account.name}</p>
          <p className="text-sm text-slate-600">{account.email}</p>
          <p className="text-sm text-slate-500">
            {[account.companyHint, account.phone, account.country].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>{t("bo.pro.review.registeredOn", { date: account.createdLabel })}</p>
          <p className={account.emailConfirmed ? "text-emerald-700" : "text-amber-700"}>
            {account.emailConfirmed ? t("bo.pro.review.emailConfirmed") : t("bo.pro.review.emailUnconfirmed")}
          </p>
          {!account.emailConfirmed && (
            <button
              type="button"
              onClick={resend}
              disabled={pending}
              className="mt-1 font-medium text-orange-600 hover:text-orange-700 disabled:opacity-60"
            >
              {t("bo.pro.review.resendConfirmation")}
            </button>
          )}
        </div>
      </header>

      {mode === "idle" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setMode("approve")}>
            {t("bo.pro.review.approve")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("reject")}>
            {t("bo.pro.review.reject")}
          </Button>
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-4 rounded-xl bg-slate-50 p-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-900">{t("bo.pro.review.company")}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={partnerChoice === "new"} onChange={() => setPartnerChoice("new")} />
              {t("bo.pro.review.newCompany")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={partnerChoice === "existing"}
                onChange={() => {
                  setPartnerChoice("existing")
                  pickPartner(partnerId)
                }}
              />
              {t("bo.pro.review.joinExisting")}
            </label>

            {partnerChoice === "new" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <label className="text-sm space-y-1">
                  <span className="text-slate-600">{t("bo.pro.common.commercialName")}</span>
                  <input
                    className={field}
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value)
                      if (!slugTouched) setSlug(toSubdomain(e.target.value))
                    }}
                  />
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-slate-600">{t("bo.pro.common.slugLabel")}</span>
                  <SubdomainField
                    className={field}
                    value={slug}
                    onStateChange={setSlugState}
                    onChange={(value) => {
                      setSlugTouched(true)
                      setSlug(value)
                    }}
                  />
                </label>
              </div>
            ) : (
              <select className={field} value={partnerId} onChange={(e) => pickPartner(e.target.value)}>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isOperator ? t("bo.pro.common.operatorSuffix") : ""}
                  </option>
                ))}
              </select>
            )}
          </fieldset>

          {operatorLocked ? (
            <p className="text-sm text-slate-600">
              {t("bo.pro.review.operatorLocked", { name: selectedPartner?.name ?? "" })}
            </p>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-slate-900">{t("bo.pro.review.companyType")}</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={sellMode === "reseller"} onChange={() => setSellMode("reseller")} />
                  {t("bo.pro.review.typeReseller")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={sellMode === "white_label"} onChange={() => setSellMode("white_label")} />
                  {t("bo.pro.review.typeWhiteLabel")}
                </label>
                {sellMode === "white_label" && (
                  <select
                    className={field}
                    value={customerFront}
                    onChange={(e) => setCustomerFront(e.target.value as "own" | "weefly")}
                  >
                    <option value="own">{t("bo.pro.review.frontOwn")}</option>
                    <option value="weefly">{t("bo.pro.review.frontWeefly")}</option>
                  </select>
                )}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-slate-900">{t("bo.pro.review.modules")}</legend>
                <label className="flex items-center gap-2 text-sm text-slate-400">
                  <input type="checkbox" disabled checked={false} readOnly />
                  {t("bo.pro.review.supplierSoon")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={agentEnabled} onChange={(e) => setAgentEnabled(e.target.checked)} />
                  {t("bo.pro.review.agent")}
                </label>
              </fieldset>

              {agentEnabled && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold text-slate-900">{t("bo.pro.common.agentMenus")}</legend>
                  <div className="flex flex-wrap gap-3">
                    {MENUS.map((m) => (
                      <label key={m} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={menus.includes(m)} onChange={() => toggleMenu(m)} />
                        {t(`pro.menu.${m}`)}
                        {m !== "flights" && <span className="text-xs text-slate-400">{t("bo.pro.common.soonTag")}</span>}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={approve} disabled={pending || slugBlocked}>
              {t("bo.pro.review.confirmApproval")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("idle")} disabled={pending}>
              {t("bo.pro.common.cancel")}
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`reject-${account.userId}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setMode("idle")
          }}
        >
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <h3 id={`reject-${account.userId}`} className="font-semibold text-slate-900">
              {t("bo.pro.review.rejectTitle", { name: account.name })}
            </h3>
            <label className="text-sm space-y-1 block">
              <span className="font-medium text-slate-700">{t("bo.pro.review.rejectReason")}</span>
              <textarea
                autoFocus
                className={`${field} min-h-[110px]`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("bo.pro.review.rejectReasonPlaceholder")}
              />
            </label>
            {message && !message.ok && (
              <p className="text-sm text-red-600" role="status">
                {message.text}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setMode("idle")} disabled={pending}>
                {t("bo.pro.common.cancel")}
              </Button>
              <Button size="sm" variant="destructive" onClick={reject} disabled={pending || reason.trim().length < 3}>
                {t("bo.pro.review.confirmRejection")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="status">
          {message.text}
        </p>
      )}
    </article>
  )
}
