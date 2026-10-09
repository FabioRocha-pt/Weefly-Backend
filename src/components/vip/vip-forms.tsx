"use client"

/**
 * WeeFly · B2G v2 · B2G-22 · as peças do menu VIP (e o campo de copiar que o
 * menu Público também usa).
 *
 * Cada peça chama uma acção de `actions/vip` e mostra a frase que ela devolve,
 * já na língua do agente. Quem pode escrever decide-o o servidor.
 */

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
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
  const { t } = useI18n()
  const { pending, run, note } = useAction()
  const [v, setV] = useState<VipFormValues>({ name: "", phone: "", email: "", level: "", ...initial })
  const set = <K extends keyof VipFormValues>(k: K, value: VipFormValues[K]) => setV((c) => ({ ...c, [k]: value }))

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
        <label className="text-sm space-y-1">
          <span className="text-slate-600">{t("bo.vip.form.phone")}</span>
          <input
            className={field}
            value={v.phone}
            onChange={(e) => set("phone", e.target.value)}
            maxLength={40}
            placeholder="+238 991 23 45"
            inputMode="tel"
          />
        </label>
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
        <Button
          disabled={pending}
          onClick={() =>
            run(
              () => (id ? updateVipClient(id, v) : createVipClient(v)),
              () => {
                if (!id) setV({ name: "", phone: "", email: "", level: "" })
                onDone?.()
              }
            )
          }
        >
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
