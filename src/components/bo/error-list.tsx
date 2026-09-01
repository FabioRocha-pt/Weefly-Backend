"use client"

/**
 * BO-11 · os erros listados no topo, e cada um a levar ao seu campo.
 *
 * O que havia era a mensagem de erro no sítio onde a gravação falhava — no fim
 * do formulário, ou dentro do painel de publicação — e um formulário com trinta
 * campos em três colunas não se lê à procura do que falta. Quem publicava
 * descia, subia, e desistia de perceber qual dos campos era.
 *
 * Três regras, e são as do pedido:
 *
 *   · a lista está **em cima**, antes do formulário;
 *   · cada item **leva ao campo** — foco e deslocação até ele;
 *   · a lista **actualiza-se à medida que os campos são corrigidos**, porque é
 *     derivada do estado e não de uma tentativa de gravação. Um erro que
 *     desaparece enquanto se escreve é a confirmação de que foi resolvido.
 *
 * O destaque visual do próprio campo vive em `field-error.ts` — `aria-invalid`
 * no elemento, e o CSS a desenhá-lo. Está separado porque a lista e o destaque
 * são usados em sítios diferentes: a emissão tem campos com erro e a lista, o
 * compositor tem a lista e secções inteiras a apontar.
 */

import { AlertTriangle } from "lucide-react"

export interface BoFieldError {
  /** O `id` do elemento no DOM. É por ele que o item da lista o encontra. */
  target: string
  /** A frase que descreve o que falta, na língua de quem lê. */
  label: string
}

/**
 * Leva ao campo: desloca, foca e pisca.
 *
 * O `focus` sozinho não chega em campos que estão dentro de um `fieldset`
 * desactivado ou fora do ecrã, e o `scrollIntoView` sozinho deixa a pessoa a
 * olhar para o sítio certo sem o cursor lá. Os dois, e um realce de dois
 * segundos para o olho encontrar o campo entre os vizinhos iguais.
 */
export function focusField(target: string): void {
  const element = document.getElementById(target)
  if (!element) return

  element.scrollIntoView({ behavior: "smooth", block: "center" })
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    element.focus({ preventScroll: true })
  }

  element.classList.add("bo-flash")
  window.setTimeout(() => element.classList.remove("bo-flash"), 1600)
}

export function BoErrorList({
  title,
  errors,
  tone = "block",
}: {
  title: string
  errors: BoFieldError[]
  /** `block` impede avançar; `warn` é para verificar antes de seguir. */
  tone?: "block" | "warn"
}) {
  if (errors.length === 0) return null

  return (
    <div
      role="alert"
      className={
        tone === "block"
          ? "rounded-xl border border-adm-ember/40 bg-adm-ember/10 p-3.5"
          : "rounded-xl border border-adm-warn/40 bg-adm-warn/[.12] p-3.5"
      }
    >
      <div
        className={`mb-2 flex items-center gap-2 text-[12.5px] font-bold ${
          tone === "block" ? "text-adm-ember" : "text-[#F0C983]"
        }`}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {title}
      </div>
      <ul className="space-y-1">
        {errors.map((error) => (
          <li key={`${error.target}:${error.label}`}>
            <button
              type="button"
              onClick={() => focusField(error.target)}
              className={`text-left text-[12.5px] leading-relaxed underline decoration-dotted underline-offset-2 ${
                tone === "block"
                  ? "text-adm-ember hover:text-adm-txt"
                  : "text-[#F0C983] hover:text-adm-txt"
              }`}
            >
              {error.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
