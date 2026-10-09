"use client"

/**
 * WeeFly · B2G v2 · B2G-23 · pedir um ministério (empresa) e decidir (master).
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
import { approveMinistryRequest, rejectMinistryRequest, requestMinistry, type MinistryRequestResult } from "@/actions/ministry-requests"
import { slugify } from "@/components/b2g/b2g-forms"
import type { OrganisationRequest } from "@/lib/b2g"

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"

function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const run = (action: () => Promise<MinistryRequestResult>, after?: () => void) =>
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

/** O brasão nunca aparece sozinho: leva sempre o nome (B2G-24). */
export function CrestName({ name, crestUrl, logoUrl }: { name: string; crestUrl: string | null; logoUrl?: string | null }) {
  const src = crestUrl ?? logoUrl ?? null
  return (
    <span className="inline-flex items-center gap-2">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-7 w-7 object-contain" />
      )}
      <span>{name}</span>
    </span>
  )
}

/** B2G-23 · a empresa pede: nome, logótipo horizontal e brasão. */
export function RequestMinistryForm() {
  const { t } = useI18n()
  const { pending, run, note } = useRun()
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        {t("bo.ministryRequests.new")}
      </Button>
    )
  }
  return (
    <form
      className="w-full rounded-2xl border border-orange-200 bg-orange-50/40 p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        const form = e.currentTarget
        run(() => requestMinistry(data), () => {
          form.reset()
          setOpen(false)
        })
      }}
    >
      <p className="text-sm text-slate-600">{t("bo.ministryRequests.explain")}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-sm space-y-1">
          <span className="text-slate-600">{t("bo.ministryRequests.name")}</span>
          <input className={field} name="name" required minLength={2} maxLength={160} />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-slate-600">{t("bo.ministryRequests.logo")}</span>
          <input className={field} name="logo" type="file" accept="image/png,image/jpeg" required />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-slate-600">{t("bo.ministryRequests.crest")}</span>
          <input className={field} name="crest" type="file" accept="image/png,image/jpeg" />
        </label>
      </div>
      <p className="text-xs text-slate-500">{t("bo.ministryRequests.fileRules")}</p>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending}>
          {t("bo.ministryRequests.submit")}
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={() => setOpen(false)}>
          {t("bo.b2g.form.cancel")}
        </Button>
      </div>
      {note}
    </form>
  )
}

/** Os pedidos da empresa e o estado de cada um (o aviso da decisão). */
export function OwnRequestList({ requests }: { requests: OrganisationRequest[] }) {
  const { t } = useI18n()
  if (requests.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t("bo.ministryRequests.ownTitle")}</h2>
      <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 text-sm">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <CrestName name={r.name} crestUrl={r.crestUrl} logoUrl={r.logoUrl} />
            <span
              className={
                r.status === "pending"
                  ? "text-amber-700"
                  : r.status === "approved"
                    ? "text-emerald-700"
                    : "text-red-700"
              }
            >
              {t(`bo.ministryRequests.status.${r.status}`)}
              {r.status === "rejected" && r.reason ? ` · ${r.reason}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** B2G-23 · o master decide: aprovar (com o endereço editável) ou recusar com motivo. */
export function PendingRequestRow({ request }: { request: OrganisationRequest }) {
  const { t } = useI18n()
  const { pending, run, note } = useRun()
  const [name, setName] = useState(request.name)
  const [slug, setSlug] = useState(slugify(request.name))
  const [reason, setReason] = useState("")
  return (
    <li className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        {request.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={request.logoUrl} alt={request.name} className="h-10 w-auto" />
        )}
        <div>
          <CrestName name={request.name} crestUrl={request.crestUrl} />
          <p className="text-xs text-slate-500">
            {request.partnerName ?? "—"} · {request.requestedByEmail}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} aria-label={t("bo.ministryRequests.name")} />
        <label className="text-sm">
          <input className={`${field} font-mono`} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-label={t("bo.b2g.form.slug")} />
          <span className="text-xs text-slate-500">/ministerios/{slug || "…"}</span>
        </label>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            if (window.confirm(t("bo.ministryRequests.approveConfirm", { name, partner: request.partnerName ?? "" })))
              run(() => approveMinistryRequest({ requestId: request.id, name, slug }))
          }}
        >
          {t("bo.ministryRequests.approve")}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          className={`${field} md:col-span-2`}
          value={reason}
          placeholder={t("bo.ministryRequests.reason")}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => rejectMinistryRequest({ requestId: request.id, reason }))}>
          {t("bo.ministryRequests.reject")}
        </Button>
      </div>
      {note}
    </li>
  )
}
