"use client"

/**
 * APP-03 · a app do cliente não fica parada no que mostrou ao abrir.
 *
 * As ofertas chegam quando a equipa as envia, e o cliente pode ter a app
 * aberta nessa altura — instalada no telemóvel, é o normal. Isto volta a pedir
 * a página quando a app regressa ao primeiro plano e, enquanto está à vista,
 * de meio em meio minuto. Como no back-office (`QueueLive`), espera se a
 * pessoa estiver a escrever num campo: um refresh a meio de um passaporte
 * seria pior do que um estado com trinta segundos.
 */

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const EVERY_MS = 30_000

export function VipLiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null
      return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))
    }
    const refresh = () => {
      if (document.hidden || typing()) return
      router.refresh()
    }
    const interval = setInterval(refresh, EVERY_MS)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [router])

  return null
}
