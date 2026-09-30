import { redirect } from "next/navigation"

import { getProAccount, homeFor } from "@/lib/pro-account"

/**
 * TEN-06 · para onde vai quem acabou de entrar: o Concierge por defeito,
 * quando a conta o tem. É o destino do login e do `/inicio`; um link directo
 * (PRO-01) continua a voltar para onde ia.
 */
export default async function EntrarPage() {
  const account = await getProAccount()
  if (!account) redirect("/login")
  redirect(homeFor(account))
}
