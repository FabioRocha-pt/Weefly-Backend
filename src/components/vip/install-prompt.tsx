"use client"

/**
 * APP-05 · o convite para instalar a app no telemóvel.
 *
 * "O convite para instalar aparece **uma vez**, depois do primeiro pedido, e
 * não volta se for recusado."
 *
 *   · "depois do primeiro pedido" · o formulário deixa um sinal em
 *     `sessionStorage` ao enviar, e a app passa para Minhas passagens — é aí
 *     que este convite aparece, por cima do pedido novo;
 *   · "uma vez" · assim que é mostrado fica marcado em `localStorage`, por
 *     cliente. Recusado, ignorado ou aceite, não volta;
 *   · só quando instalar é possível: no Android e no desktop depende de o
 *     browser ter oferecido o `beforeinstallprompt`; no iPhone são os três
 *     passos do Safari. Com a app já instalada, nada.
 *
 * O link pessoal fica guardado na app instalada: o manifesto tem-no como
 * `start_url` (ver `app/pc/[token]/manifest.webmanifest`).
 */

import { useEffect, useState } from "react"

import { useT } from "@/i18n/provider"

const REQUESTED = "weefly.vip.requested"
const seenKey = (code: string) => `weefly.vip.install.${code}`

type Platform = "ios" | "prompt"

export function VipInstallPrompt({ code, appName }: { code: string; appName: string }) {
  const t = useT()
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [deferred, setDeferred] = useState<any>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    let eligible = false
    try {
      eligible =
        window.sessionStorage.getItem(REQUESTED) === "1" && window.localStorage.getItem(seenKey(code)) === null
    } catch {
      /* sem storage não há como garantir "uma vez": não se convida */
    }
    if (!eligible) return

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return

    /* Mostrado uma vez: fica marcado no momento em que aparece. */
    const show = (next: Platform) => {
      setPlatform(next)
      try {
        window.localStorage.setItem(seenKey(code), new Date().toISOString())
        window.sessionStorage.removeItem(REQUESTED)
      } catch {
        /* já foi lido acima; se agora falhar, o convite fica só nesta visita */
      }
    }

    const ua = navigator.userAgent
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    if (isIos) {
      show("ios")
      return
    }

    /* A oferta do browser é guardada pela barra da app (`VipTabBar`), que
       está montada desde o primeiro ecrã: quando o cliente chega aqui, ela já
       passou. Se ainda não veio, espera-se por ela. */
    const offered = () => (window as unknown as { __weeflyInstall?: Event }).__weeflyInstall ?? null
    const take = () => {
      const event = offered()
      if (!event) return
      setDeferred(event)
      show("prompt")
    }
    take()
    window.addEventListener("weefly:installable", take)
    return () => window.removeEventListener("weefly:installable", take)
  }, [code])

  if (installed) {
    return (
      <div className="install">
        <div className="installed">✓ {t("vipApp.install.done", { name: appName })}</div>
      </div>
    )
  }
  if (!platform) return null

  return (
    <div className="install" role="region" aria-label={t("vipApp.install.title", { name: appName })}>
      <div className="ih">
        <div>
          <h3>{t("vipApp.install.title", { name: appName })}</h3>
          <p>{t("vipApp.install.body")}</p>
        </div>
      </div>

      {platform === "ios" ? (
        <div className="tut">
          <div className="tutrow">
            <span className="n">1</span>
            <span className="t">{t("pc.install.step1", { b: t("pc.install.step1b") })}</span>
          </div>
          <div className="tutrow">
            <span className="n">2</span>
            <span className="t">{t("pc.install.step2", { b: t("pc.install.step2b") })}</span>
          </div>
          <div className="tutrow">
            <span className="n">3</span>
            <span className="t">{t("pc.install.step3", { b: t("pc.install.step3b") })}</span>
          </div>
        </div>
      ) : null}

      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" type="button" onClick={() => setPlatform(null)}>
          {t("vipApp.install.notNow")}
        </button>
        {platform === "prompt" && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={async () => {
              if (!deferred) return
              deferred.prompt()
              const choice = await deferred.userChoice
              setDeferred(null)
              setPlatform(null)
              if (choice?.outcome === "accepted") setInstalled(true)
            }}
          >
            {t("vipApp.install.install")}
          </button>
        )}
      </div>
    </div>
  )
}
