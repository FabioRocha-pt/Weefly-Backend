"use client"

/**
 * WeeFly · B2G v2 · B2G-22 · as peças do menu VIP (e o campo de copiar que o
 * menu Público também usa).
 *
 * Cada peça chama uma acção de `actions/vip` e mostra a frase que ela devolve,
 * já na língua do agente. Quem pode escrever decide-o o servidor.
 */

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
import { LOCALE_TAGS } from "@/i18n/config"
import { COUNTRIES, COUNTRY_BY_ISO, DEFAULT_COUNTRY, countryName, flagOf, splitPhone, toE164 } from "@/lib/countries"
import { createVipClient, setVipActive, updateVipClient, type VipResult } from "@/actions/vip"

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100"

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const run = (action: () => Promise<VipResult>, after?: (result: VipResult) => void) =>
    start(async () => {
      setMessage(null)
      const result = await action()
      setMessage(result.ok ? { ok: true, text: result.notice ?? "✓" } : { ok: false, text: result.error })
      if (result.ok) {
        after?.(result)
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

export interface VipFormValues {
  name: string
  phone: string
  email: string
  level: string
}

export function VipForm({
  id,
  initial,
  onDone,
}: {
  /** Com `id`, edita; sem, cria. */
  id?: string
  initial?: Partial<VipFormValues>
  onDone?: () => void
}) {
  const { t, locale } = useI18n()
  const tag = LOCALE_TAGS[locale]
  const { pending, run, note } = useAction()
  const [v, setV] = useState<VipFormValues>({ name: "", phone: "", email: "", level: "", ...initial })
  const set = <K extends keyof VipFormValues>(k: K, value: VipFormValues[K]) => setV((c) => ({ ...c, [k]: value }))

  /*
   * E7 · o telefone deixou de ser texto livre: o país e o indicativo
   * escolhem-se da lista (a mesma do registo, `lib/countries`), escreve-se o
   * número nacional, e o que se guarda é o internacional (E.164). Um número
   * já gravado ("+238 9800700") volta a abrir com o país dele no seletor.
   */
  const [phone, setPhone] = useState(() => splitPhone(initial?.phone))
  const [phoneError, setPhoneError] = useState(false)
  const countryOptions = useMemo(
    () =>
      COUNTRIES.map((c) => ({ iso: c.iso, dial: c.dial, name: countryName(c.iso, tag) })).sort((a, b) =>
        a.iso === DEFAULT_COUNTRY ? -1 : b.iso === DEFAULT_COUNTRY ? 1 : a.name.localeCompare(b.name, tag)
      ),
    [tag]
  )
  const dial = COUNTRY_BY_ISO[phone.iso]?.dial ?? "+238"

  const submit = () => {
    const national = phone.national.trim()
    const e164 = national ? toE164(dial, national) : ""
    if (e164 === null) {
      setPhoneError(true)
      return
    }
    setPhoneError(false)
    const values = { ...v, phone: e164 }
    run(
      () => (id ? updateVipClient(id, values) : createVipClient(values)),
      () => {
        if (!id) {
          setV({ name: "", phone: "", email: "", level: "" })
          setPhone({ iso: DEFAULT_COUNTRY, national: "" })
        }
        onDone?.()
      }
    )
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span className="text-slate-600">{t("bo.vip.form.name")}</span>
          <input className={field} value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={160} />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-slate-600">{t("bo.vip.form.level")}</span>
          <input
            className={field}
            value={v.level}
            onChange={(e) => set("level", e.target.value)}
            maxLength={60}
            placeholder={t("bo.vip.form.levelHint")}
          />
        </label>
        <div className="text-sm space-y-1">
          <label className="text-slate-600" htmlFor={`vip-phone-${id ?? "new"}`}>
            {t("bo.vip.form.phone")}
          </label>
          <div className="flex gap-2">
            <select
              className={`${field} w-[46%] min-w-0`}
              aria-label={t("bo.vip.form.phoneCountry")}
              value={phone.iso}
              onChange={(e) => {
                setPhone((c) => ({ ...c, iso: e.target.value }))
                setPhoneError(false)
              }}
            >
              {countryOptions.map((c) => (
                <option key={c.iso} value={c.iso}>
                  {flagOf(c.iso)} {c.name} ({c.dial})
                </option>
              ))}
            </select>
            <input
              id={`vip-phone-${id ?? "new"}`}
              className={`${field} flex-1 min-w-0`}
              value={phone.national}
              onChange={(e) => {
                setPhone((c) => ({ ...c, national: e.target.value }))
                setPhoneError(false)
              }}
              maxLength={24}
              placeholder="991 23 45"
              inputMode="tel"
              autoComplete="tel-national"
              aria-invalid={phoneError}
            />
          </div>
          {phoneError ? (
            <p className="text-xs text-red-600">{t("bo.vip.errors.phoneInvalid")}</p>
          ) : (
            <p className="text-xs text-slate-500">
              {t("bo.vip.form.phoneHint", { number: toE164(dial, phone.national) ?? `${dial} …` })}
            </p>
          )}
        </div>
        <label className="text-sm space-y-1">
          <span className="text-slate-600">{t("bo.vip.form.email")}</span>
          <input
            className={field}
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
            type="email"
            maxLength={200}
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">{t("bo.vip.form.linkNote")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} onClick={submit}>
          {id ? t("bo.vip.form.save") : t("bo.vip.form.create")}
        </Button>
        {onDone && (
          <Button variant="outline" disabled={pending} onClick={onDone}>
            {t("bo.vip.form.cancel")}
          </Button>
        )}
        {note}
      </div>
    </div>
  )
}

/** O botão "Novo VIP" que abre o formulário. */
export function NewVipClient() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (!open) return <Button onClick={() => setOpen(true)}>{t("bo.vip.list.new")}</Button>
  return (
    <div className="w-full">
      <VipForm onDone={() => setOpen(false)} />
    </div>
  )
}

/** Editar um VIP (na ficha dele). */
export function EditVipClient({ id, initial }: { id: string; initial: VipFormValues }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("bo.vip.detail.edit")}
      </Button>
    )
  return <VipForm id={id} initial={initial} onDone={() => setOpen(false)} />
}

/** Desactivar (o link deixa de abrir; o histórico fica) ou reactivar. */
export function VipActiveToggle({ id, active, compact }: { id: string; active: boolean; compact?: boolean }) {
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (active && !window.confirm(t("bo.vip.detail.deactivateConfirm"))) return
          run(() => setVipActive(id, !active))
        }}
      >
        {active ? t("bo.vip.detail.deactivate") : t("bo.vip.detail.reactivate")}
      </Button>
      {!compact && note}
    </span>
  )
}

/** Um endereço com o botão de copiar. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 1400)
    return () => clearTimeout(timer)
  }, [done])
  return (
    <div className="space-y-1">
      {label && <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>}
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {value}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => {})
            setDone(true)
          }}
        >
          {done ? t("bo.vip.copied") : t("bo.vip.copy")}
        </Button>
      </div>
    </div>
  )
}
