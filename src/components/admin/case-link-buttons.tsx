"use client"

import { useState } from "react"
import { Check, Copy, Lock } from "lucide-react"

import { cn } from "@/lib/utils"
import { LINK_STAGE_PATHS, type CaseLinkRow } from "@/lib/case-status"

const STAGE_LABELS: Record<number, string> = {
  1: "1 link",
  2: "2 link",
  3: "Pay link",
}

const STAGE_TITLES: Record<number, string> = {
  1: "Pedido de viagem",
  2: "Proposta e passageiros",
  3: "Pagamento",
}

/**
 * Os três chips de link do caso.
 *
 * O 1 e o 3 são copiáveis desde que o caso existe. O 2 não: desde a migração
 * 0005 ele só passa a existir quando o vendedor publica a proposta, e mostrá-lo
 * copiável antes disso seria oferecer um endereço que responde "ainda não
 * disponível" a quem o receber. Verde quer dizer que o cliente já submeteu
 * aquela etapa.
 */
export function CaseLinkButtons({
  token,
  links,
}: {
  token: string
  links: CaseLinkRow[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {[1, 2, 3].map((stage) => {
        const link = links.find((l) => l.stage === stage)
        return (
          <StageChip
            key={stage}
            token={token}
            stage={stage}
            submitted={link?.status === "submetido"}
            locked={link?.status === "bloqueado"}
          />
        )
      })}
    </div>
  )
}

function StageChip({
  token,
  stage,
  submitted,
  locked,
}: {
  token: string
  stage: number
  submitted: boolean
  locked: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const url = `${window.location.origin}/p/${token}${LINK_STAGE_PATHS[stage]}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  if (locked) {
    return (
      <span
        title={`${STAGE_TITLES[stage]} — ainda não gerado. Publique a proposta no separador Ofertas.`}
        className="inline-flex cursor-default items-center gap-1 rounded-md border border-dashed border-adm-line px-2 py-1.5 text-[11.5px] font-semibold text-adm-muted"
      >
        <Lock className="h-3 w-3" />
        {STAGE_LABELS[stage]}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copiar link — ${STAGE_TITLES[stage]}${submitted ? " (já preenchido)" : ""}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11.5px] font-semibold transition-colors",
        submitted
          ? "bg-adm-ok/15 text-adm-ok hover:bg-adm-ok/25"
          : "bg-adm-raise text-adm-txt-2 hover:bg-adm-ember hover:text-white"
      )}
    >
      {copied || submitted ? (
        <Check className="h-3 w-3" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? "Copiado" : STAGE_LABELS[stage]}
    </button>
  )
}
