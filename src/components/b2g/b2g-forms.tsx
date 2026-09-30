"use client"

/**
 * WeeFly · MVP 2 · B2G · os formulários dos ministérios e da bolsa.
 *
 * Um ficheiro para as peças que o backoffice do parceiro (PAR-02 a PAR-05) e
 * o espaço B2G do Admin (ADM-08) partilham. Cada peça chama uma acção de
 * `actions/b2g` e mostra a frase que ela devolve — já na língua do agente.
 * Quem pode escrever decide-o o servidor; `canManage` só esconde botões que
 * seriam recusados.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
import {
  adjustBudget,
  changeSecretary,
  confirmExternalPayment,
  creditBudget,
  removeAlertRecipient,
  reverseExternalPayment,
  rotateOrganisationLink,
  saveAlertRecipient,
  saveOrganisation,
  setAlertThreshold,
  type B2gResult,
} from "@/actions/b2g"

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100"

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const run = (action: () => Promise<B2gResult>, after?: () => void) =>
    start(async () => {
      setMessage(null)
      const result = await action()
      setMessage(result.ok ? { ok: true, text: result.notice ?? "✓" } : { ok: false, text: result.error })
      if (result.ok) {
        after?.()
        router.refresh()
      }
    })
  const note = message ? (
    <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="status">
      {message.text}
    </p>
  ) : null
  return { pending, run, note }
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-slate-600">{children}</span>
}

// ── PAR-02 · o ministério ────────────────────────────────────────────────────

export interface OrgFormValues {
  id?: string
  name: string
  slug: string
  logoUrl: string
  secretaryName: string
  secretaryEmail: string
  secretaryPhone: string
  alertThresholdAmount: string
  alertThresholdPercent: string
  secretarySeesBalance: boolean
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^minist[eé]rio (da|do|das|dos|de) /, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
}

export function OrganisationForm({
  initial,
  onDone,
}: {
  initial?: Partial<OrgFormValues>
  onDone?: () => void
}) {
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  const editing = Boolean(initial?.id)
  const [v, setV] = useState<OrgFormValues>({
    name: "",
    slug: "",
    logoUrl: "",
    secretaryName: "",
    secretaryEmail: "",
    secretaryPhone: "",
    alertThresholdAmount: "",
    alertThresholdPercent: "",
    secretarySeesBalance: false,
    ...initial,
  })
  const [slugTouched, setSlugTouched] = useState(editing)
  const set = <K extends keyof OrgFormValues>(k: K, value: OrgFormValues[K]) => setV((c) => ({ ...c, [k]: value }))

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.form.name")}</Label>
          <input
            className={field}
            value={v.name}
            onChange={(e) => {
              const name = e.target.value
              setV((c) => ({ ...c, name, slug: slugTouched ? c.slug : slugify(name) }))
            }}
          />
        </label>
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.form.slug")}</Label>
          <input
            className={`${field} font-mono`}
            value={v.slug}
            onChange={(e) => {
              setSlugTouched(true)
              set("slug", e.target.value.toLowerCase())
            }}
          />
          <span className="text-xs text-slate-500">/m/{v.slug || "…"}/…</span>
        </label>
        <label className="text-sm space-y-1 md:col-span-2">
          <Label>{t("bo.b2g.form.logo")}</Label>
          <input className={field} value={v.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" />
        </label>
        {!editing && (
          <>
            <label className="text-sm space-y-1">
              <Label>{t("bo.b2g.form.secretaryName")}</Label>
              <input className={field} value={v.secretaryName} onChange={(e) => set("secretaryName", e.target.value)} />
            </label>
            <label className="text-sm space-y-1">
              <Label>{t("bo.b2g.form.secretaryEmail")}</Label>
              <input className={field} type="email" value={v.secretaryEmail} onChange={(e) => set("secretaryEmail", e.target.value)} />
            </label>
            <label className="text-sm space-y-1">
              <Label>{t("bo.b2g.form.secretaryPhone")}</Label>
              <input className={field} value={v.secretaryPhone} onChange={(e) => set("secretaryPhone", e.target.value)} />
            </label>
          </>
        )}
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.form.thresholdAmount")}</Label>
          <input className={field} inputMode="decimal" value={v.alertThresholdAmount} onChange={(e) => set("alertThresholdAmount", e.target.value)} />
        </label>
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.form.thresholdPercent")}</Label>
          <input className={field} inputMode="decimal" value={v.alertThresholdPercent} onChange={(e) => set("alertThresholdPercent", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={v.secretarySeesBalance} onChange={(e) => set("secretarySeesBalance", e.target.checked)} />
          {t("bo.b2g.form.secretarySeesBalance")}
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => saveOrganisation(v), onDone)}>
          {editing ? t("bo.b2g.form.save") : t("bo.b2g.form.create")}
        </Button>
        {onDone && (
          <Button size="sm" variant="outline" disabled={pending} onClick={onDone}>
            {t("bo.b2g.form.cancel")}
          </Button>
        )}
      </div>
      {note}
    </div>
  )
}

/** Abre o formulário de um ministério novo. */
export function NewOrganisation() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return open ? (
    <OrganisationForm onDone={() => setOpen(false)} />
  ) : (
    <Button size="sm" onClick={() => setOpen(true)}>
      {t("bo.b2g.list.new")}
    </Button>
  )
}

export function EditOrganisation({ initial }: { initial: OrgFormValues }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return open ? (
    <OrganisationForm initial={initial} onDone={() => setOpen(false)} />
  ) : (
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
      {t("bo.b2g.detail.edit")}
    </Button>
  )
}

// ── o link ───────────────────────────────────────────────────────────────────

export function OrgLink({ orgId, link, canManage }: { orgId: string; link: string; canManage: boolean }) {
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-slate-100 px-2 py-1 text-xs break-all">{link || t("bo.b2g.detail.noLink")}</code>
        {link && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(link)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? t("bo.b2g.detail.copied") : t("bo.b2g.detail.copy")}
          </Button>
        )}
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t("bo.b2g.detail.rotateConfirm"))) run(() => rotateOrganisationLink(orgId))
            }}
          >
            {t("bo.b2g.detail.rotate")}
          </Button>
        )}
      </div>
      {note}
    </div>
  )
}

// ── PAR-04 · a secretária ────────────────────────────────────────────────────

export function ChangeSecretary({ orgId }: { orgId: string }) {
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ name: "", email: "", phone: "" })
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("bo.b2g.secretary.change")}
      </Button>
    )
  }
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-600">{t("bo.b2g.secretary.explain")}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input className={field} placeholder={t("bo.b2g.form.secretaryName")} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <input className={field} type="email" placeholder={t("bo.b2g.form.secretaryEmail")} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <input className={field} placeholder={t("bo.b2g.form.secretaryPhone")} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("bo.b2g.secretary.confirm"))) run(() => changeSecretary({ orgId, ...v }), () => setOpen(false))
          }}
        >
          {t("bo.b2g.secretary.submit")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          {t("bo.b2g.form.cancel")}
        </Button>
      </div>
      {note}
    </div>
  )
}

// ── PAR-03 · a bolsa ─────────────────────────────────────────────────────────

export function CreditForm({ orgId, currency }: { orgId: string; currency: string }) {
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  const [v, setV] = useState({ amount: "", documentRef: "", reason: "" })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.budget.amount", { currency })}</Label>
          <input className={field} inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        </label>
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.budget.documentRef")}</Label>
          <input className={field} value={v.documentRef} onChange={(e) => setV({ ...v, documentRef: e.target.value })} />
        </label>
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.budget.reason")}</Label>
          <input className={field} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
        </label>
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          if (window.confirm(t("bo.b2g.budget.creditConfirm", { amount: `${v.amount} ${currency}` })))
            run(() => creditBudget({ orgId, ...v }), () => setV({ amount: "", documentRef: "", reason: "" }))
        }}
      >
        {t("bo.b2g.budget.credit")}
      </Button>
      {note}
    </div>
  )
}

export function ThresholdForm({
  orgId,
  amount,
  percent,
}: {
  orgId: string
  amount: string
  percent: string
}) {
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  const [v, setV] = useState({ amount, percent })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.form.thresholdAmount")}</Label>
          <input className={field} inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
        </label>
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.form.thresholdPercent")}</Label>
          <input className={field} inputMode="decimal" value={v.percent} onChange={(e) => setV({ ...v, percent: e.target.value })} />
        </label>
      </div>
      <p className="text-xs text-slate-500">{t("bo.b2g.budget.thresholdHint")}</p>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setAlertThreshold({ orgId, ...v }))}>
        {t("bo.b2g.form.save")}
      </Button>
      {note}
    </div>
  )
}

/** ADM-08 · corrigir um saldo: pede confirmação e motivo, e fica registado. */
export function AdjustForm({ orgId, currency }: { orgId: string; currency: string }) {
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ amount: "", reason: "" })
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("bo.b2g.adjust.open")}
      </Button>
    )
  }
  return (
    <div className="space-y-3 rounded-xl bg-amber-50 p-4">
      <p className="text-sm text-amber-800">{t("bo.b2g.adjust.explain")}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.adjust.amount", { currency })}</Label>
          <input className={field} value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="-5000" />
        </label>
        <label className="text-sm space-y-1">
          <Label>{t("bo.b2g.adjust.reason")}</Label>
          <input className={field} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("bo.b2g.adjust.confirm", { amount: `${v.amount} ${currency}` })))
              run(() => adjustBudget({ orgId, ...v }), () => setOpen(false))
          }}
        >
          {t("bo.b2g.adjust.submit")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          {t("bo.b2g.form.cancel")}
        </Button>
      </div>
      {note}
    </div>
  )
}

// ── ADM-06 · destinatários ───────────────────────────────────────────────────

export interface RecipientView {
  id: string
  organisationId: string | null
  side: "partner" | "weefly"
  name: string | null
  email: string | null
  whatsapp: string | null
  active: boolean
}

export function RecipientsEditor({
  partnerId,
  recipients,
  organisations,
  sides,
}: {
  partnerId: string
  recipients: RecipientView[]
  organisations: { id: string; name: string }[]
  /** Os lados que esta conta gere: o parceiro só o seu, a WeeFly os dois. */
  sides: ("partner" | "weefly")[]
}) {
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  const [v, setV] = useState({ side: sides[0], organisationId: "", name: "", email: "", whatsapp: "" })
  const orgName = new Map(organisations.map((o) => [o.id, o.name]))
  const active = recipients.filter((r) => r.active)

  return (
    <div className="space-y-3">
      {active.length === 0 ? (
        <p className="text-sm text-slate-500">{t("bo.b2g.recipients.none")}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {active.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <span>
                <b>{r.name ?? r.email ?? r.whatsapp}</b>
                <span className="text-slate-500">
                  {" · "}
                  {t(`bo.b2g.recipients.side.${r.side}`)}
                  {" · "}
                  {r.organisationId ? orgName.get(r.organisationId) ?? "—" : t("bo.b2g.recipients.allMinistries")}
                  {r.email ? ` · ${r.email}` : ""}
                  {r.whatsapp ? ` · ${r.whatsapp}` : ""}
                </span>
              </span>
              {sides.includes(r.side) && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => removeAlertRecipient(r.id))}>
                  {t("bo.b2g.recipients.remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        {sides.length > 1 ? (
          <select className={field} value={v.side} onChange={(e) => setV({ ...v, side: e.target.value as "partner" | "weefly" })}>
            {sides.map((s) => (
              <option key={s} value={s}>
                {t(`bo.b2g.recipients.side.${s}`)}
              </option>
            ))}
          </select>
        ) : null}
        <select className={field} value={v.organisationId} onChange={(e) => setV({ ...v, organisationId: e.target.value })}>
          <option value="">{t("bo.b2g.recipients.allMinistries")}</option>
          {organisations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <input className={field} placeholder={t("bo.b2g.recipients.name")} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <input className={field} type="email" placeholder="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <input className={field} placeholder="WhatsApp" value={v.whatsapp} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} />
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(
            () => saveAlertRecipient({ partnerId, ...v, organisationId: v.organisationId || null }),
            () => setV({ ...v, name: "", email: "", whatsapp: "" })
          )
        }
      >
        {t("bo.b2g.recipients.add")}
      </Button>
      {note}
    </div>
  )
}

// ── PAR-07 · o pagamento externo, na ficha do caso ───────────────────────────

export interface ExternalPaymentView {
  id: string
  amount: string
  paidOn: string
  method: string
  reference: string | null
  confirmedByEmail: string
  confirmedAt: string
  reversedAt: string | null
  reversedByEmail: string | null
  reversalReason: string | null
}

export function ExternalPaymentPanel({
  caseId,
  orgName,
  balance,
  currency,
  suggestedAmount,
  payments,
  canReverse,
}: {
  caseId: string
  orgName: string
  balance: string
  currency: string
  suggestedAmount: string
  payments: ExternalPaymentView[]
  canReverse: boolean
}) {
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  const today = new Date().toISOString().slice(0, 10)
  const [v, setV] = useState({ amount: suggestedAmount, paidOn: today, method: "transfer", reference: "" })
  const [reason, setReason] = useState("")
  const live = payments.find((p) => !p.reversedAt)

  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">
        <h3>{t("bo.b2g.external.title")}</h3>
        <span className="note">
          {orgName} · {t("bo.b2g.external.balance")}: <b>{balance}</b>
        </span>
      </div>
      <div className="panel-b space-y-3">
        {live ? (
          <div className="space-y-2">
            <p>
              {t("bo.b2g.external.confirmedLine", {
                amount: live.amount,
                date: live.paidOn,
                method: t(`bo.b2g.external.method.${live.method}`),
                by: live.confirmedByEmail,
              })}
              {live.reference ? ` · ${live.reference}` : ""}
            </p>
            {canReverse && (
              <div className="flex flex-wrap gap-2 items-center">
                <input className={field} style={{ maxWidth: 360 }} placeholder={t("bo.b2g.external.reversalReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(t("bo.b2g.external.reverseConfirm"))) run(() => reverseExternalPayment({ caseId, reason }))
                  }}
                >
                  {t("bo.b2g.external.reverse")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="note">{t("bo.b2g.external.explain")}</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <label className="text-sm space-y-1">
                <Label>{t("bo.b2g.budget.amount", { currency })}</Label>
                <input className={field} inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
              </label>
              <label className="text-sm space-y-1">
                <Label>{t("bo.b2g.external.paidOn")}</Label>
                <input className={field} type="date" value={v.paidOn} onChange={(e) => setV({ ...v, paidOn: e.target.value })} />
              </label>
              <label className="text-sm space-y-1">
                <Label>{t("bo.b2g.external.methodLabel")}</Label>
                <select className={field} value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}>
                  {["transfer", "deposit", "cheque", "comfort_letter", "other"].map((m) => (
                    <option key={m} value={m}>
                      {t(`bo.b2g.external.method.${m}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <Label>{t("bo.b2g.external.reference")}</Label>
                <input className={field} value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
              </label>
            </div>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t("bo.b2g.external.confirmConfirm", { amount: `${v.amount} ${currency}` })))
                  run(() => confirmExternalPayment({ caseId, ...v, method: v.method as "transfer" }))
              }}
            >
              {t("bo.b2g.external.confirm")}
            </Button>
          </div>
        )}
        {payments.filter((p) => p.reversedAt).length > 0 && (
          <ul className="text-xs text-slate-500 space-y-1">
            {payments
              .filter((p) => p.reversedAt)
              .map((p) => (
                <li key={p.id}>
                  {t("bo.b2g.external.reversedLine", {
                    amount: p.amount,
                    by: p.reversedByEmail ?? "—",
                    reason: p.reversalReason ?? "—",
                  })}
                </li>
              ))}
          </ul>
        )}
        {note}
      </div>
    </section>
  )
}
