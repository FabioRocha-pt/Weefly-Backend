"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { endIntervention, startIntervention } from "@/actions/admin-intervention"
import { useT } from "@/i18n/provider"

/**
 * ADM-04 · o botão que tira o Admin WeeFly da leitura: pede o motivo, regista,
 * e abre o caso no Concierge durante quatro horas.
 */
export function InterveneForm({ caseId }: { caseId: string }) {
  const t = useT()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50"
      >
        {t("bo.adminCases.intervene.button")}
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 space-y-3">
      <p className="text-sm text-slate-700">{t("bo.adminCases.intervene.explain")}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder={t("bo.adminCases.intervene.reasonPlaceholder")}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await startIntervention({ caseId, reason })
              if (!r.ok) return setError(r.error)
              router.push(`/admin/price-checker/${caseId}`)
            })
          }
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {t("bo.adminCases.intervene.confirm")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600">
          {t("bo.adminCases.intervene.cancel")}
        </button>
      </div>
    </div>
  )
}

/** Por cima da ficha do caso, enquanto a intervenção durar. */
export function InterventionBanner({ caseId, reason, expiresAt }: { caseId: string; reason: string; expiresAt: string }) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  const until = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(expiresAt))

  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        border: "1px solid #FDBA74",
        background: "#FFF7ED",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 14,
      }}
    >
      <span>
        <b>{t("bo.adminCases.banner.title", { until })}</b> · {reason}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await endIntervention(caseId)
            router.push(`/gestao/casos/c/${caseId}`)
          })
        }
        style={{ border: "1px solid #FB923C", background: "#fff", borderRadius: 8, padding: "6px 12px", fontWeight: 600 }}
      >
        {t("bo.adminCases.banner.end")}
      </button>
    </div>
  )
}
