"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/utils/supabase/server"

export type CompanyActionState = { error: string | null }

const VALID_TYPES = ["rental", "housing", "tourism"] as const

function field(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Insert a new company owned by the current user, then send them to the
 * company dashboard. RLS ensures owner_id must equal auth.uid().
 */
export async function createCompany(
  formData: FormData
): Promise<CompanyActionState> {
  const type = field(formData, "type")
  const legalName = field(formData, "legalName")
  const commercialName = field(formData, "commercialName")

  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return { error: "Selecione um tipo de empresa válido." }
  }
  if (!legalName || !commercialName) {
    return { error: "O nome legal e o nome comercial são obrigatórios." }
  }

  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Sessão expirada. Inicie sessão novamente." }
    }

    const { error } = await supabase.from("companies").insert({
      user_id: user.id,
      type,
      legal_name: legalName,
      commercial_name: commercialName,
      nif: field(formData, "nif"),
      country: field(formData, "country"),
      city: field(formData, "city"),
      address: field(formData, "address"),
      email: field(formData, "email"),
      phone: field(formData, "phone"),
      bank_name: field(formData, "bankName"),
      iban: field(formData, "iban"),
    })

    if (error) return { error: error.message }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Erro inesperado ao criar empresa.",
    }
  }

  revalidatePath("/", "layout")
  redirect("/empresa/dashboard")
}
