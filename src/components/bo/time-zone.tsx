"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { setBoTimeZone } from "@/actions/settings"
import { BO_TIME_ZONES, isTimeZone, timeZoneLabel } from "@/lib/bo-timezone"
import { useI18n } from "@/i18n/provider"
import { LOCALE_TAGS } from "@/i18n/config"
import { translateMessage } from "@/i18n/translate"

/**
 * E8 · a primeira visita de uma conta sem fuso: o browser diz em que fuso
 * está, e fica guardado na conta. A partir daí as horas do back-office são as
 * dessa pessoa, em todos os ecrãs e em todos os dispositivos — e só mudam se
 * ela as mudar nas Definições.
 *
 * Não desenha nada. Só corre quando a conta ainda não tem fuso (`needed`).
 */
export function BoTimeZoneSync({ needed }: { needed: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!needed) return
    let zone = ""
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      /* sem fuso do browser fica o de Cabo Verde */
    }
    if (!isTimeZone(zone)) return
    let alive = true
    void setBoTimeZone(zone, { auto: true }).then((result) => {
      if (alive && result.ok) router.refresh()
    })
    return () => {
      alive = false
    }
  }, [needed, router])
  return null
}

/**
 * E8 · o fuso das horas, nas Definições, ao lado da língua. "Todas as horas no
 * mesmo fuso, o da conta de quem está a ver."
 */
export function BoTimeZoneSetting({ className }: { className?: string }) {
  const { locale, t, timeZone } = useI18n()
  const tag = LOCALE_TAGS[locale]
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  /* O fuso do browser, para o oferecer mesmo que não esteja na lista. Lido
     depois de montar: no servidor não há browser. */
  const [browserZone, setBrowserZone] = useState<string | null>(null)
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (isTimeZone(zone)) setBrowserZone(zone)
    } catch {
      /* fica a lista */
    }
  }, [])

  const zones = Array.from(new Set([timeZone, ...(browserZone ? [browserZone] : []), ...BO_TIME_ZONES]))

  const choose = (next: string) => {
    if (next === timeZone) return
    start(async () => {
      setError(null)
      const result = await setBoTimeZone(next)
      if (!result.ok) setError(translateMessage(t, result.error))
      else router.refresh()
    })
  }

  return (
    <div className={className}>
      <p style={{ fontWeight: 700 }}>{t("bo.shell.timeZone.title")}</p>
      <p style={{ opacity: 0.75, fontSize: 13, margin: "4px 0 10px" }}>{t("bo.shell.timeZone.body")}</p>
      <select
        value={timeZone}
        disabled={pending}
        aria-label={t("bo.shell.timeZone.title")}
        onChange={(event) => choose(event.target.value)}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid currentColor",
          background: "transparent",
          color: "inherit",
          maxWidth: "100%",
        }}
      >
        {zones.map((zone) => (
          <option key={zone} value={zone} style={{ color: "#0f172a" }}>
            {timeZoneLabel(zone, tag)}
            {zone === browserZone ? ` · ${t("bo.shell.timeZone.thisDevice")}` : ""}
          </option>
        ))}
      </select>
      {error && <p style={{ color: "#B42318", fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  )
}

/**
 * E8 · "O fuso aparece indicado onde houver dúvida." Uma linha pequena:
 * "Horas de Cabo Verde (GMT-1)".
 */
export function BoTimeZoneNote({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const { locale, t, timeZone } = useI18n()
  return (
    <span className={className} style={style}>
      {t("bo.shell.timeZone.note", { zone: timeZoneLabel(timeZone, LOCALE_TAGS[locale]) })}
    </span>
  )
}
