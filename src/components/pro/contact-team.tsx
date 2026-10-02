"use client"

/**
 * OCT-05 · da conta que espera aprovação para a equipa WeeFly: uma mensagem
 * curta, ou o email de contacto para quem preferir escrever do seu correio.
 */

import { useState, useTransition } from "react"
import { Mail, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { contactTeam } from "@/actions/pro"
import { useT } from "@/i18n/provider"

export function ContactTeam({ supportEmail }: { supportEmail: string }) {
  const t = useT()
  const [message, setMessage] = useState("")
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()

  const send = () => {
    const fd = new FormData()
    fd.set("message", message)
    start(async () => {
      try {
        const r = await contactTeam(fd)
        setNote(r.ok ? { ok: true, text: r.notice ?? "" } : { ok: false, text: r.error })
        if (r.ok) {
          setSent(true)
          setMessage("")
        }
      } catch {
        setNote({ ok: false, text: t("pro.contactFailed") })
      }
    })
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
      <p className="text-sm font-semibold text-slate-900">{t("pro.contactTitle")}</p>
      <p className="text-sm text-slate-500 mt-1">{t("pro.contactBody")}</p>

      {!sent && (
        <>
          <textarea
            className="mt-3 w-full min-h-[90px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            value={message}
            maxLength={2000}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("pro.contactPlaceholder")}
            aria-label={t("pro.contactTitle")}
          />
          <Button
            type="button"
            size="sm"
            className="mt-2 bg-orange-600 hover:bg-orange-700"
            disabled={pending || message.trim().length < 5}
            onClick={send}
          >
            <Send className="w-4 h-4 mr-2" />
            {pending ? t("pro.contactSending") : t("pro.contactSend")}
          </Button>
        </>
      )}

      {note?.text && (
        <p role="status" className={`mt-2 text-sm ${note.ok ? "text-green-700" : "text-red-600"}`}>
          {note.text}
        </p>
      )}

      <p className="mt-3 text-sm text-slate-500 flex items-center gap-1.5">
        <Mail className="w-4 h-4" />
        {t("pro.contactOrEmail")}{" "}
        <a href={`mailto:${supportEmail}`} className="font-medium text-orange-600 hover:text-orange-700">
          {supportEmail}
        </a>
      </p>
    </div>
  )
}
