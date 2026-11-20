/**
 * WeeFly · E8 · o fuso da conta, do lado do servidor. Ver `lib/bo-timezone`.
 *
 * SÓ SERVIDOR.
 */

import { cache } from "react"

import { createClient } from "@/utils/supabase/server"
import { BO_DEFAULT_TIME_ZONE, isTimeZone } from "@/lib/bo-timezone"

/** O fuso guardado na conta, ou nulo se a pessoa ainda não tem nenhum. */
export const getStoredBoTimeZone = cache(async (): Promise<string | null> => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const stored = (user?.user_metadata as Record<string, unknown> | undefined)?.bo_timezone
  return isTimeZone(stored) ? stored : null
})

/** O fuso em que esta pessoa lê as horas do back-office. */
export async function getBoTimeZone(): Promise<string> {
  return (await getStoredBoTimeZone()) ?? BO_DEFAULT_TIME_ZONE
}
