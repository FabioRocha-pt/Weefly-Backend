"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { updateMinistryTraveller, type TravellerFormInput } from "@/actions/travellers"
import { NATIONALITIES } from "@/lib/pc/catalog"
import { useT } from "@/i18n/provider"

/** DAT-01 · a ficha, editável. Cada gravação fica no histórico por baixo. */
export function TravellerForm({ initial }: { initial: TravellerFormInput }) {
  const t = useT()
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const set = (k: keyof TravellerFormInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false)
    setV((cur) => ({ ...cur, [k]: e.target.value }))
  }

  const input = "rounded-lg border border-slate-300 px-3 py-2 text-sm w-full"
  const field = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      {el}
    </label>
  )
  const countries = (k: "nationality" | "issuingCountry") => (
    <select value={v[k]} onChange={set(k)} className={input}>
      <option value="">—</option>
      {NATIONALITIES.map((n) => (
        <option key={n}>{n}</option>
      ))}
    </select>
  )

  return (
    <form
      className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError(null)
          const r = await updateMinistryTraveller(v)
          if (!r.ok) return setError(r.error)
          setSaved(true)
          router.refresh()
        })
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {field(
          t("bo.travellers.fields.title"),
          <select value={v.title} onChange={set("title")} className={input}>
            <option value="">—</option>
            <option value="mr">Mr</option>
            <option value="mrs">Mrs</option>
            <option value="ms">Ms</option>
          </select>
        )}
        {field(t("bo.travellers.fields.firstName"), <input value={v.firstName} onChange={set("firstName")} className={input} />)}
        {field(t("bo.travellers.fields.lastName"), <input value={v.lastName} onChange={set("lastName")} className={input} />)}
        {field(t("bo.travellers.fields.birthDate"), <input type="date" value={v.birthDate} onChange={set("birthDate")} className={input} />)}
        {field(
          t("bo.travellers.fields.gender"),
          <select value={v.gender} onChange={set("gender")} className={input}>
            <option value="">—</option>
            <option value="f">{t("bo.caseView.pax.female")}</option>
            <option value="m">{t("bo.caseView.pax.male")}</option>
          </select>
        )}
        {field(t("bo.travellers.fields.nationality"), countries("nationality"))}
        {field(
          t("bo.travellers.fields.passportNumber"),
          <input value={v.passportNumber} onChange={set("passportNumber")} className={`${input} font-mono`} />
        )}
        {field(
          t("bo.travellers.fields.passportExpiry"),
          <input type="date" value={v.passportExpiry} onChange={set("passportExpiry")} className={input} />
        )}
        {field(t("bo.travellers.fields.issuingCountry"), countries("issuingCountry"))}
        {field(t("bo.travellers.fields.phone"), <input type="tel" value={v.phone} onChange={set("phone")} className={input} />)}
        {field(t("bo.travellers.fields.email"), <input type="email" value={v.email} onChange={set("email")} className={input} />)}
      </div>
      <p className="text-xs text-slate-500">{t("bo.travellers.contactNote")}</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? t("bo.travellers.saving") : t("bo.travellers.save")}
        </button>
        {saved && <span className="text-sm text-emerald-700">{t("bo.travellers.saved")}</span>}
      </div>
    </form>
  )
}
