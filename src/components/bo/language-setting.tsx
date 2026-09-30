"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { setBoLocale } from "@/actions/settings"
import { useI18n } from "@/i18n/provider"
import { translateMessage } from "@/i18n/translate"

/**
 * I18N-01 · o seletor de língua do back-office, nas Definições.
 *
 * Só as duas línguas do back-office. A língua em que o cliente recebe emails,
 * WhatsApp, o link e o bilhete é a do caso, e não se escolhe aqui.
 */
export function BoLanguageSetting({ className }: { className?: string }) {
  const { locale, t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const choose = (next: "pt" | "en") => {
    if (next === locale) return
    start(async () => {
      setError(null)
      const result = await setBoLocale(next)
      if (!result.ok) setError(translateMessage(t, result.error))
      else router.refresh()
    })
  }

  return (
    <div className={className}>
      <p style={{ fontWeight: 700 }}>{t("bo.shell.language.title")}</p>
      <p style={{ opacity: 0.75, fontSize: 13, margin: "4px 0 10px" }}>{t("bo.shell.language.body")}</p>
      <div style={{ display: "flex", gap: 8 }} role="radiogroup" aria-label={t("bo.shell.language.title")}>
        {(["pt", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={locale === l}
            disabled={pending}
            onClick={() => choose(l)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid currentColor",
              fontWeight: locale === l ? 700 : 500,
              opacity: locale === l ? 1 : 0.6,
              background: "transparent",
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {t(`bo.shell.language.${l}`)}
          </button>
        ))}
      </div>
      {error && <p style={{ color: "#B42318", fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  )
}
