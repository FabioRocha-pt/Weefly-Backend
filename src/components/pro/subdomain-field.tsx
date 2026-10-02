"use client"

/**
 * WeeFly · OCT-12 · o campo do subdomínio, com "disponível" ou "ocupado"
 * enquanto se escreve.
 *
 * A forma e os reservados verificam-se aqui, sem pedido; o "ocupado" pergunta
 * ao servidor (`checkSubdomain`) 400 ms depois da última tecla. A resposta é
 * um aviso: quem decide é o índice único ao gravar.
 */

import { useEffect, useState } from "react"
import { Check, Loader2, X } from "lucide-react"

import { checkSubdomain, type SubdomainCheck } from "@/actions/subdomain"
import { partnerHostPreview } from "@/lib/site-url"
import { subdomainProblem } from "@/lib/subdomain"
import { useT } from "@/i18n/provider"

export function SubdomainField({
  value,
  onChange,
  onStateChange,
  className,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  /** Para o ecrã poder impedir gravar com um nome ocupado. */
  onStateChange?: (state: SubdomainCheck | "checking") => void
  className?: string
  disabled?: boolean
}) {
  const t = useT()
  const [state, setState] = useState<SubdomainCheck | "checking">("unknown")

  useEffect(() => {
    if (disabled) return
    const local = subdomainProblem(value)
    if (local) {
      setState(local)
      onStateChange?.(local)
      return
    }
    setState("checking")
    onStateChange?.("checking")
    let alive = true
    const id = setTimeout(async () => {
      try {
        const r = await checkSubdomain(value)
        if (!alive) return
        setState(r)
        onStateChange?.(r)
      } catch {
        if (!alive) return
        setState("unknown")
        onStateChange?.("unknown")
      }
    }, 400)
    return () => {
      alive = false
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, disabled])

  const tone =
    state === "available"
      ? "text-emerald-700"
      : state === "checking" || state === "unknown"
        ? "text-slate-500"
        : "text-red-600"

  return (
    <>
      <input
        className={`${className ?? ""} font-mono`}
        value={value}
        disabled={disabled}
        maxLength={30}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
      />
      <span className="block text-xs text-slate-500">
        {partnerHostPreview(value) ?? t("bo.pro.common.slugPending", { slug: value || "…" })}
      </span>
      {!disabled && value && (
        <span role="status" className={`flex items-center gap-1 text-xs font-medium ${tone}`}>
          {state === "checking" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : state === "available" ? (
            <Check className="h-3.5 w-3.5" />
          ) : state === "unknown" ? null : (
            <X className="h-3.5 w-3.5" />
          )}
          {t(`bo.pro.common.subdomain.${state}`)}
        </span>
      )}
    </>
  )
}
