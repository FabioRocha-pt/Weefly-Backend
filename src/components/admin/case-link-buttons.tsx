"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"
import { LINK_STAGE_PATHS, type CaseLinkRow } from "@/lib/case-status"

const STAGE_LABELS: Record<number, string> = {
  1: "1 link",
  2: "2 link",
  3: "Pay link",
}

const STAGE_TITLES: Record<number, string> = {
  1: "Pedido de viagem",
  2: "Dados dos passageiros",
  3: "Pagamento",
}

/**
 * The three per-case link chips from the back-office wireframe.
 *
 * All three are copyable from the moment the case exists (see migration 0004):
 * with no automatic email, a stage the client cannot reach is just a dead end.
 * A chip turns green once the client has submitted that stage — the one piece
 * of state worth showing at a glance in the list.
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
      {[1, 2, 3].map((stage) => (
        <StageChip
          key={stage}
          token={token}
          stage={stage}
          submitted={
            links.find((l) => l.stage === stage)?.status === "submetido"
          }
        />
      ))}
    </div>
  )
}

function StageChip({
  token,
  stage,
  submitted,
}: {
  token: string
  stage: number
  submitted: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const url = `${window.location.origin}/p/${token}${LINK_STAGE_PATHS[stage]}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
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
