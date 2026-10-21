"use client"

/**
 * Admin · as companhias aéreas. Acrescentar uma, trocar o nome ou o logótipo,
 * desactivar — sem deploy. O que se grava aqui aparece no seletor da proposta,
 * do bilhete e da emissão, e no bilhete em PDF.
 */

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { saveAirline, setAirlineActive, type AirlineResult } from "@/actions/airlines"
import { useT } from "@/i18n/provider"

export interface AirlineRowView {
  iata: string
  name: string
  priority: number
  active: boolean
  ticketPrefix: string | null
  logoUrl: string | null
  shownLogo: string | null
}

const PRIORITIES = [1, 2, 3, 9] as const

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100"

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function Logo({ src, code }: { src: string | null; code: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-7 w-20 object-contain" />
  ) : (
    <span className="grid h-7 w-20 place-items-center rounded-md border border-slate-200 bg-slate-50 font-mono text-xs font-bold text-slate-500">
      {code}
    </span>
  )
}

type Form = {
  isNew: boolean
  iata: string
  name: string
  priority: number
  ticketPrefix: string
  active: boolean
  removeLogo: boolean
  current: string | null
}

const emptyForm: Form = {
  isNew: true,
  iata: "",
  name: "",
  priority: 9,
  ticketPrefix: "",
  active: true,
  removeLogo: false,
  current: null,
}

export function AirlinesAdmin({ airlines }: { airlines: AirlineRowView[] }) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => {
    const q = fold(query.trim())
    return q ? airlines.filter((a) => a.iata.toLowerCase().startsWith(q) || fold(a.name).includes(q)) : airlines
  }, [airlines, query])

  const run = (action: () => Promise<AirlineResult>, after?: () => void) =>
    start(async () => {
      setMessage(null)
      const result = await action()
      setMessage(result.ok ? (result.notice ? { ok: true, text: result.notice } : null) : { ok: false, text: result.error ?? "" })
      if (result.ok) {
        after?.()
        router.refresh()
      }
    })

  const open = (next: Form) => {
    setForm(next)
    setPreview(null)
    setMessage(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const submit = () => {
    if (!form) return
    const fd = new FormData()
    fd.set("isNew", form.isNew ? "1" : "0")
    fd.set("iata", form.iata)
    fd.set("name", form.name)
    fd.set("priority", String(form.priority))
    fd.set("ticketPrefix", form.ticketPrefix)
    fd.set("active", form.active ? "1" : "0")
    fd.set("removeLogo", form.removeLogo ? "1" : "0")
    const file = fileRef.current?.files?.[0]
    if (file) fd.set("logo", file)
    run(() => saveAirline(fd), () => setForm(null))
  }

  const logoShown = form ? (preview ?? (form.removeLogo ? null : form.current)) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${field} max-w-xs`}
          placeholder={t("bo.airlines.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="text-sm text-slate-500">{t("bo.airlines.count", { n: airlines.length })}</span>
        <Button size="sm" className="ml-auto" onClick={() => open(emptyForm)} disabled={pending}>
          {t("bo.airlines.new")}
        </Button>
      </div>

      {form && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">
            {form.isNew ? t("bo.airlines.new") : t("bo.airlines.editTitle", { code: form.iata })}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="space-y-1 text-sm text-slate-600">
              <span>{t("bo.airlines.fields.iata")}</span>
              <input
                className={`${field} font-mono uppercase`}
                maxLength={2}
                placeholder="TP"
                value={form.iata}
                disabled={!form.isNew}
                onChange={(e) => setForm({ ...form, iata: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-600 md:col-span-3">
              <span>{t("bo.airlines.fields.name")}</span>
              <input
                className={field}
                placeholder="TAP Air Portugal"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-600 md:col-span-2">
              <span>{t("bo.airlines.fields.priority")}</span>
              <select
                className={field}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`bo.airlines.priority.${p}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-600 md:col-span-2">
              <span>{t("bo.airlines.fields.ticketPrefix")}</span>
              <input
                className={`${field} font-mono`}
                maxLength={3}
                inputMode="numeric"
                placeholder="047"
                value={form.ticketPrefix}
                onChange={(e) => setForm({ ...form, ticketPrefix: e.target.value.replace(/\D/g, "") })}
              />
              <span className="block text-xs text-slate-400">{t("bo.airlines.fields.ticketPrefixHint")}</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Logo src={logoShown} code={form.iata || "—"} />
            <label className="space-y-1 text-sm text-slate-600">
              <span className="block">{t("bo.airlines.fields.logo")}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/png"
                className="text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  setPreview(file ? URL.createObjectURL(file) : null)
                  if (file) setForm({ ...form, removeLogo: false })
                }}
              />
              <span className="block text-xs text-slate-400">{t("bo.airlines.fields.logoHint")}</span>
            </label>
            {form.current && !preview && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.removeLogo}
                  onChange={(e) => setForm({ ...form, removeLogo: e.target.checked })}
                />
                {t("bo.airlines.fields.removeLogo")}
              </label>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            {t("bo.airlines.fields.active")}
          </label>

          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={pending}>
              {t("bo.airlines.save")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setForm(null)} disabled={pending}>
              {t("bo.b2g.form.cancel")}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("bo.airlines.cols.logo")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.airlines.cols.airline")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.airlines.cols.priority")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.airlines.cols.prefix")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.airlines.cols.state")}</th>
              <th className="px-4 py-3 font-semibold text-right">{t("bo.airlines.cols.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((a) => (
              <tr key={a.iata} className={a.active ? "" : "bg-slate-50 text-slate-500"}>
                <td className="px-4 py-2">
                  <Logo src={a.shownLogo} code={a.iata} />
                </td>
                <td className="px-4 py-2">
                  <span className="mr-2 font-mono text-xs font-bold text-slate-500">{a.iata}</span>
                  <span className="font-medium text-slate-900">{a.name}</span>
                </td>
                <td className="px-4 py-2 text-slate-600">{t(`bo.airlines.priority.${PRIORITIES.includes(a.priority as 1) ? a.priority : 9}`)}</td>
                <td className="px-4 py-2 font-mono text-slate-600">{a.ticketPrefix ?? "—"}</td>
                <td className="px-4 py-2">{a.active ? t("bo.airlines.state.active") : t("bo.airlines.state.inactive")}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      open({
                        isNew: false,
                        iata: a.iata,
                        name: a.name,
                        priority: a.priority,
                        ticketPrefix: a.ticketPrefix ?? "",
                        active: a.active,
                        removeLogo: false,
                        current: a.logoUrl,
                      })
                    }
                  >
                    {t("bo.airlines.edit")}
                  </Button>{" "}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => setAirlineActive(a.iata, !a.active))}
                  >
                    {a.active ? t("bo.airlines.deactivate") : t("bo.airlines.activate")}
                  </Button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  {t("bo.airlines.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
