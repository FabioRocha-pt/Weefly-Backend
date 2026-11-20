"use client"

/**
 * Admin · IMG-01 · as imagens das cidades. Carregar, substituir e desativar,
 * sem deploy. Uma cidade sem imagem (ou desativada) mostra na app o fundo da
 * marca com o nome dela — nunca um espaço vazio.
 */

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { saveCityImage, setCityImageActive, type CityImageResult } from "@/actions/city-images"
import { useI18n } from "@/i18n/provider"
import { LOCALE_TAGS } from "@/i18n/config"

export interface CityImageRowView {
  code: string
  cityName: string
  airports: string[]
  alt: string | null
  small: string | null
  hasImage: boolean
  active: boolean
  updatedAt: string | null
  changedByEmail: string | null
}

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100"

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

type Filter = "all" | "missing" | "inactive"
const FILTERS: Filter[] = ["all", "missing", "inactive"]

type Form = {
  isNew: boolean
  code: string
  cityName: string
  airports: string
  alt: string
  active: boolean
  removeImage: boolean
  current: string | null
}

const emptyForm: Form = {
  isNew: true,
  code: "",
  cityName: "",
  airports: "",
  alt: "",
  active: true,
  removeImage: false,
  current: null,
}

/** A miniatura, ou o que a app mostra sem imagem: a cor e o nome. */
function Thumb({ src, name }: { src: string | null; name: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} loading="lazy" className="h-[60px] w-20 rounded-md object-cover" />
  ) : (
    <span className="grid h-[60px] w-20 place-items-center rounded-md bg-gradient-to-br from-orange-600 to-slate-800 px-1 text-center text-[10px] font-bold leading-tight text-white">
      {name}
    </span>
  )
}

export function CityImagesAdmin({ cities }: { cities: CityImageRowView[] }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const fileRef = useRef<HTMLInputElement>(null)

  const date = useMemo(
    () => new Intl.DateTimeFormat(LOCALE_TAGS[locale], { dateStyle: "medium", timeZone: "Atlantic/Cape_Verde" }),
    [locale]
  )

  const shown = useMemo(() => {
    const q = fold(query.trim())
    return cities.filter((c) => {
      if (filter === "missing" && c.hasImage) return false
      if (filter === "inactive" && c.active) return false
      if (!q) return true
      return (
        c.code.toLowerCase().startsWith(q) ||
        fold(c.cityName).includes(q) ||
        c.airports.some((a) => a.toLowerCase().startsWith(q))
      )
    })
  }, [cities, query, filter])

  const missing = cities.filter((c) => !c.hasImage).length

  const run = (action: () => Promise<CityImageResult>, after?: () => void) =>
    start(async () => {
      setMessage(null)
      const result = await action()
      setMessage(
        result.ok ? (result.notice ? { ok: true, text: result.notice } : null) : { ok: false, text: result.error ?? "" }
      )
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
    fd.set("code", form.code)
    fd.set("cityName", form.cityName)
    fd.set("airports", form.airports)
    fd.set("alt", form.alt)
    fd.set("active", form.active ? "1" : "0")
    fd.set("removeImage", form.removeImage ? "1" : "0")
    const file = fileRef.current?.files?.[0]
    if (file) fd.set("image", file)
    run(
      () => saveCityImage(fd),
      () => setForm(null)
    )
  }

  const imageShown = form ? (preview ?? (form.removeImage ? null : form.current)) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${field} max-w-xs`}
          placeholder={t("bo.cityImages.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${
                filter === f
                  ? "border-orange-600 bg-orange-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t(`bo.cityImages.filter.${f}`)}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">{t("bo.cityImages.count", { n: cities.length, missing })}</span>
        <Button size="sm" className="ml-auto" onClick={() => open(emptyForm)} disabled={pending}>
          {t("bo.cityImages.new")}
        </Button>
      </div>

      {form && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">
            {form.isNew ? t("bo.cityImages.new") : t("bo.cityImages.editTitle", { city: form.cityName || form.code })}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="space-y-1 text-sm text-slate-600">
              <span>{t("bo.cityImages.fields.code")}</span>
              <input
                className={`${field} font-mono uppercase`}
                maxLength={3}
                placeholder="PAR"
                value={form.code}
                disabled={!form.isNew}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
              />
              <span className="block text-xs text-slate-400">{t("bo.cityImages.fields.codeHint")}</span>
            </label>
            <label className="space-y-1 text-sm text-slate-600 md:col-span-3">
              <span>{t("bo.cityImages.fields.name")}</span>
              <input
                className={field}
                placeholder="Paris"
                value={form.cityName}
                onChange={(e) => setForm({ ...form, cityName: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-600 md:col-span-2">
              <span>{t("bo.cityImages.fields.airports")}</span>
              <input
                className={`${field} font-mono uppercase`}
                placeholder="CDG, ORY"
                value={form.airports}
                onChange={(e) => setForm({ ...form, airports: e.target.value.toUpperCase() })}
              />
              <span className="block text-xs text-slate-400">{t("bo.cityImages.fields.airportsHint")}</span>
            </label>
            <label className="space-y-1 text-sm text-slate-600 md:col-span-2">
              <span>{t("bo.cityImages.fields.alt")}</span>
              <input
                className={field}
                maxLength={160}
                placeholder={form.cityName}
                value={form.alt}
                onChange={(e) => setForm({ ...form, alt: e.target.value })}
              />
              <span className="block text-xs text-slate-400">{t("bo.cityImages.fields.altHint")}</span>
            </label>
          </div>

          <div className="flex flex-wrap items-start gap-4">
            {imageShown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageShown} alt="" className="h-[150px] w-[200px] rounded-lg object-cover" />
            ) : (
              <span className="grid h-[150px] w-[200px] place-items-center rounded-lg bg-gradient-to-br from-orange-600 to-slate-800 px-3 text-center text-lg font-bold text-white">
                {form.cityName || form.code || "—"}
              </span>
            )}
            <div className="space-y-2">
              <label className="space-y-1 text-sm text-slate-600">
                <span className="block">{t("bo.cityImages.fields.image")}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    setPreview(file ? URL.createObjectURL(file) : null)
                    if (file) setForm({ ...form, removeImage: false })
                  }}
                />
                <span className="block max-w-md text-xs text-slate-400">{t("bo.cityImages.fields.imageHint")}</span>
              </label>
              {form.current && !preview && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.removeImage}
                    onChange={(e) => setForm({ ...form, removeImage: e.target.checked })}
                  />
                  {t("bo.cityImages.fields.removeImage")}
                </label>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            {t("bo.cityImages.fields.active")}
          </label>

          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending ? t("bo.cityImages.saving") : t("bo.cityImages.save")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setForm(null)} disabled={pending}>
              {t("bo.cityImages.cancel")}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>
          {message.text}
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("bo.cityImages.cols.image")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.cityImages.cols.city")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.cityImages.cols.airports")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.cityImages.cols.state")}</th>
              <th className="px-4 py-3 font-semibold">{t("bo.cityImages.cols.changed")}</th>
              <th className="px-4 py-3 font-semibold text-right">{t("bo.cityImages.cols.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((c) => (
              <tr key={c.code} className={c.active ? "" : "bg-slate-50 text-slate-500"}>
                <td className="px-4 py-2">
                  <Thumb src={c.small} name={c.cityName} />
                </td>
                <td className="px-4 py-2">
                  <span className="mr-2 font-mono text-xs font-bold text-slate-500">{c.code}</span>
                  <span className="font-medium text-slate-900">{c.cityName}</span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{c.airports.join(" · ") || "—"}</td>
                <td className="px-4 py-2">
                  {!c.active
                    ? t("bo.cityImages.state.inactive")
                    : c.hasImage
                      ? t("bo.cityImages.state.live")
                      : t("bo.cityImages.state.missing")}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {c.changedByEmail && c.updatedAt ? (
                    <>
                      {date.format(new Date(c.updatedAt))}
                      <div className="truncate max-w-[14rem]">{c.changedByEmail}</div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      open({
                        isNew: false,
                        code: c.code,
                        cityName: c.cityName,
                        airports: c.airports.join(", "),
                        alt: c.alt ?? "",
                        active: c.active,
                        removeImage: false,
                        current: c.small,
                      })
                    }
                  >
                    {c.hasImage ? t("bo.cityImages.replace") : t("bo.cityImages.upload")}
                  </Button>{" "}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => setCityImageActive(c.code, !c.active))}
                  >
                    {c.active ? t("bo.cityImages.deactivate") : t("bo.cityImages.activate")}
                  </Button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  {t("bo.cityImages.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
