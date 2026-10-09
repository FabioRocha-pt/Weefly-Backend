"use client"

/**
 * B2G-13 · B2G-14 · reclamar a partir de uma fila do terminal de vendas ou do
 * concierge do master. A decisão é da base de dados (`claim_case`): quem
 * perde a corrida vê quem ganhou.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { boClaimCase } from "@/actions/bo-price-checker"
import { useT } from "@/i18n/provider"

export function ClaimButton({ caseId }: { caseId: string }) {
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await boClaimCase(caseId)
            if (!result.ok) setError(result.error)
            router.refresh()
          })
        }}
        className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
      >
        {pending ? t("bo.claim.claiming") : t("bo.claim.claim")}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
