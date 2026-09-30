/**
 * MIN-03 · o telefone e o email de cada passageiro, só para apoio operacional.
 *
 * Numa leitura à parte, e tolerante: se a 0029 ainda não estiver aplicada, a
 * coluna não existe e a leitura principal dos passageiros continuaria a
 * falhar inteira — com o ecrã dos passaportes vazio. Assim só faltam os
 * contactos.
 *
 * SÓ SERVIDOR.
 */

import type { createAdminClient } from "@/utils/supabase/admin"
import type { CasePassenger } from "@/lib/case-status"

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

export async function withPassengerContacts<T extends CasePassenger>(
  admin: Admin,
  caseId: string,
  passengers: T[]
): Promise<T[]> {
  if (passengers.length === 0) return passengers
  const { data, error } = await admin.from("case_passengers").select("id, phone, email").eq("case_id", caseId)
  if (error || !data) return passengers
  const byId = new Map((data as { id: string; phone: string | null; email: string | null }[]).map((r) => [r.id, r]))
  return passengers.map((p) => {
    const c = byId.get(p.id)
    return c ? { ...p, phone: c.phone, email: c.email } : p
  })
}
