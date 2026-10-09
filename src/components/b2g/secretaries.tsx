"use client"

/**
 * WeeFly · B2G v2 · B2G-06 · as secretárias de um ministério, no back-office.
 *
 * Criar (link pessoal + PIN), gerar um PIN novo, desactivar/reactivar,
 * copiar o link, reenviar o email (só o link). O PIN chega na resposta da
 * acção e é mostrado **uma vez**, aqui, com um botão de copiar: não fica em
 * lado nenhum — fechar a caixa apaga-o do estado do componente.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/provider"
import { LOCALE_TAGS } from "@/i18n/config"
import {
  createSecretary,
  regenerateSecretaryPin,
  resendSecretaryWelcome,
  setSecretaryActive,
  type SecretaryResult,
} from "@/actions/secretaries"
import type { MinistrySecretary } from "@/lib/b2g"

const field =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? t("bo.secretaries.copied") : label}
    </Button>
  )
}

/** O PIN, uma vez. */
function PinReveal({ name, pin, link, onClose }: { name: string; pin: string; link?: string; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div role="alertdialog" className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-emerald-900">{t("bo.secretaries.pin.title", { name })}</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-lg bg-white px-4 py-2 font-mono text-2xl tracking-[0.3em] text-slate-900">{pin}</code>
        <CopyButton value={pin} label={t("bo.secretaries.pin.copy")} />
      </div>
      {link && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-white px-2 py-1 text-xs break-all">{link}</code>
          <CopyButton value={link} label={t("bo.secretaries.copyLink")} />
        </div>
      )}
      <p className="text-xs text-emerald-900">{t("bo.secretaries.pin.once")}</p>
      <Button size="sm" onClick={onClose}>
        {t("bo.secretaries.pin.done")}
      </Button>
    </div>
  )
}

export function SecretaryManager({
  orgId,
  secretaries,
  siteBase,
  viewer,
  canManage,
}: {
  orgId: string
  secretaries: MinistrySecretary[]
  /** A origem do endereço da empresa (para o link completo). */
  siteBase: string
  viewer: { email: string; isManager: boolean; crossPartner: boolean }
  canManage: boolean
}) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [reveal, setReveal] = useState<{ name: string; pin: string; link?: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", phone: "", sendWelcome: true })
  const dt = new Intl.DateTimeFormat(LOCALE_TAGS[locale === "en" ? "en" : "pt"], { dateStyle: "short", timeStyle: "short" })

  const run = (action: () => Promise<SecretaryResult>, name: string, after?: () => void) =>
    start(async () => {
      setMessage(null)
      const result = await action()
      if (!result.ok) {
        setMessage({ ok: false, text: result.error })
        return
      }
      if (result.pin) setReveal({ name, pin: result.pin, link: result.link })
      setMessage(result.notice ? { ok: true, text: result.notice } : null)
      after?.()
      router.refresh()
    })

  const canRegenerate = (s: MinistrySecretary) =>
    viewer.crossPartner || viewer.isManager || s.createdByEmail.toLowerCase() === viewer.email.toLowerCase()

  return (
    <div className="space-y-4">
      {reveal && <PinReveal {...reveal} onClose={() => setReveal(null)} />}

      {secretaries.length === 0 ? (
        <p className="text-sm text-slate-500">{t("bo.secretaries.empty")}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {secretaries.map((s) => {
            const link = `${siteBase}${s.path}`
            return (
              <li key={s.id} className={`p-4 space-y-2 ${s.active ? "" : "bg-slate-50 text-slate-500"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {s.name}
                      {!s.active && <span className="ml-2 text-xs font-normal">· {t("bo.secretaries.inactive")}</span>}
                      {s.lockedUntil && (
                        <span className="ml-2 text-xs font-semibold text-red-700">
                          · {t("bo.secretaries.locked", { until: dt.format(new Date(s.lockedUntil)) })}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{[s.email, s.phone].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <p className="text-xs text-slate-500 text-right">
                    {s.hasPin
                      ? t("bo.secretaries.pinBy", { email: s.pinSetByEmail ?? "—", when: s.pinSetAt ? dt.format(new Date(s.pinSetAt)) : "—" })
                      : t("bo.secretaries.noPin")}
                    <br />
                    {s.lastAccessAt ? t("bo.secretaries.lastAccess", { when: dt.format(new Date(s.lastAccessAt)) }) : t("bo.secretaries.neverAccessed")}
                    <br />
                    {t("bo.secretaries.createdBy", { email: s.createdByEmail })}
                  </p>
                </div>
                {s.active && (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-slate-100 px-2 py-1 text-xs break-all">{link}</code>
                    <CopyButton value={link} label={t("bo.secretaries.copyLink")} />
                  </div>
                )}
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    {s.active && canRegenerate(s) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(t("bo.secretaries.regenerateConfirm", { name: s.name })))
                            run(() => regenerateSecretaryPin(s.id), s.name)
                        }}
                      >
                        {s.hasPin ? t("bo.secretaries.regenerate") : t("bo.secretaries.generate")}
                      </Button>
                    )}
                    {s.active && s.email && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resendSecretaryWelcome(s.id), s.name)}>
                        {t("bo.secretaries.sendLink")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        if (s.active ? window.confirm(t("bo.secretaries.deactivateConfirm", { name: s.name })) : true)
                          run(() => setSecretaryActive(s.id, !s.active), s.name)
                      }}
                    >
                      {s.active ? t("bo.secretaries.deactivate") : t("bo.secretaries.reactivate")}
                    </Button>
                  </div>
                )}
                {!s.active && s.deactivatedAt && (
                  <p className="text-xs">
                    {t("bo.secretaries.deactivatedBy", { email: s.deactivatedByEmail ?? "—", when: dt.format(new Date(s.deactivatedAt)) })}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canManage &&
        (creating ? (
          <div className="space-y-3 rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">{t("bo.secretaries.explain")}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className={field} placeholder={t("bo.secretaries.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={field} type="email" placeholder={t("bo.secretaries.email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className={field} placeholder={t("bo.secretaries.phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.sendWelcome} onChange={(e) => setForm({ ...form, sendWelcome: e.target.checked })} />
              {t("bo.secretaries.sendWelcome")}
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => createSecretary(orgId, form), form.name, () => {
                    setForm({ name: "", email: "", phone: "", sendWelcome: true })
                    setCreating(false)
                  })
                }
              >
                {t("bo.secretaries.create")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreating(false)}>
                {t("bo.b2g.form.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={() => setCreating(true)}>
            {t("bo.secretaries.new")}
          </Button>
        ))}

      {message && (
        <p className={message.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"} role="status">
          {message.text}
        </p>
      )}
    </div>
  )
}
