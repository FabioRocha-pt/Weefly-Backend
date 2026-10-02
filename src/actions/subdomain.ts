"use server"

/**
 * WeeFly · OCT-12 · o subdomínio está livre?
 *
 * Responde enquanto se escreve, no ecrã de aprovação de contas e no de
 * parceiros. É só um aviso: quem decide é o índice único de `partners.slug`
 * no momento de gravar, por isso dois Admin a aprovar ao mesmo tempo não
 * ficam com o mesmo nome.
 */

import { createAdminClient } from "@/utils/supabase/admin"
import { boIdentity } from "@/lib/bo-access"
import { getProAccount } from "@/lib/pro-account"
import { subdomainProblem } from "@/lib/subdomain"

export type SubdomainCheck = "available" | "taken" | "reserved" | "shape" | "unknown"

async function mayCheck(): Promise<boolean> {
  const account = await getProAccount()
  if (account && !account.legacy && account.isMaster) return true
  const identity = await boIdentity()
  return Boolean(identity?.profile?.crossPartner && identity.profile.manageUsers === "all")
}

export async function checkSubdomain(value: string): Promise<SubdomainCheck> {
  const slug = String(value ?? "").trim().toLowerCase()
  const problem = subdomainProblem(slug)
  if (problem) return problem
  if (!(await mayCheck())) return "unknown"

  const admin = createAdminClient()
  if (!admin) return "unknown"
  const { data, error } = await admin.from("partners").select("id").eq("slug", slug).maybeSingle()
  if (error) return "unknown"
  return data ? "taken" : "available"
}
