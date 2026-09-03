"use client"

/**
 * C-01 · não se cota um caso que não tem dono.
 *
 * Era possível compor uma proposta inteira num caso sem responsável, e dois
 * agentes podiam trabalhar o mesmo caso sem saber um do outro — cada um a
 * escrever preços que o outro ia sobrepor, e o cliente a receber a proposta de
 * quem gravasse por último.
 *
 * A correcção não é um aviso: é a porta. O compositor não abre sem dono, e o
 * que aparece no lugar dele é a acção que resolve o problema — **Reclamar e
 * cotar**, um clique que atribui o caso e abre o compositor no mesmo gesto.
 *
 * Deliberadamente não é automático. Abrir um caso não é trabalhá-lo: quem passa
 * os olhos numa fila abre seis casos para decidir qual pega, e atribuir-lhe os
 * seis por os ter aberto encheria a fila de donos que não são donos de nada.
 */

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { boClaimCase } from "@/actions/bo-price-checker"

export function BoClaimGate({
  caseId,
  clientName,
  waiting,
}: {
  caseId: string
  clientName: string
  /** Há quanto tempo o pedido entrou, já formatado. */
  waiting: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function claim() {
    setError(null)
    startTransition(async () => {
      const result = await boClaimCase(caseId)
      if (result.ok) {
        /* Sem navegação nenhuma: a página é a mesma e passa a ter dono, pelo que
           o compositor aparece onde estava este painel. */
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="mx-auto max-w-[620px] rounded-xl border border-adm-line bg-adm-panel p-7">
      <h2 className="mb-2 text-[15px] font-extrabold text-adm-txt">
        Este caso ainda não tem dono
      </h2>
      <p className="mb-1 text-[13px] leading-relaxed text-adm-txt-2">
        O pedido de <b className="text-adm-txt">{clientName}</b> está na fila há{" "}
        <b className="text-adm-txt">{waiting}</b> e ninguém o reclamou.
      </p>
      <p className="mb-5 text-[12.5px] leading-relaxed text-adm-muted">
        Uma proposta escrita num caso sem responsável pode ser sobreposta por
        outro agente a trabalhar o mesmo pedido, sem que nenhum dos dois saiba.
        Reclame o caso e o compositor abre — fica registado que é seu, com a
        hora, e o caso sai de <span className="font-mono">novos sem dono</span>.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-adm-ember/40 bg-adm-ember/[.12] p-3 text-[12.5px] text-adm-txt-2">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={claim}
        disabled={pending}
        className="rounded-lg border border-adm-ember/60 bg-adm-ember/[.16] px-4 py-2.5 text-[13px] font-bold text-adm-txt transition-colors hover:bg-adm-ember/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "A reclamar…" : "Reclamar e cotar"}
      </button>
    </div>
  )
}
