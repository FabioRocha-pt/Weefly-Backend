import { cache } from "react"

import { createClient } from "@/utils/supabase/server"

export type CompanyType = "rental" | "housing" | "tourism"

export type Company = {
  id: string
  type: CompanyType
  legalName: string
  commercialName: string
  nif: string
  country: string
  city: string
  address: string
  email: string
  phone: string
  bankName: string
  iban: string
}

/** Human labels for each company type. */
export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  rental: "Aluguer de carros",
  housing: "Aluguer de casas",
  tourism: "Excursões & experiências",
}

type CompanyRow = {
  id: string
  type: CompanyType
  legal_name: string | null
  commercial_name: string | null
  nif: string | null
  country: string | null
  city: string | null
  address: string | null
  email: string | null
  phone: string | null
  bank_name: string | null
  iban: string | null
}

function mapRow(row: CompanyRow): Company {
  return {
    id: row.id,
    type: row.type,
    legalName: row.legal_name ?? "",
    commercialName: row.commercial_name ?? "",
    nif: row.nif ?? "",
    country: row.country ?? "",
    city: row.city ?? "",
    address: row.address ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    bankName: row.bank_name ?? "",
    iban: row.iban ?? "",
  }
}

/** All companies owned by the current user (oldest first). */
export const getCompanies = cache(async (): Promise<Company[]> => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, type, legal_name, commercial_name, nif, country, city, address, email, phone, bank_name, iban"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  if (error || !data) return []
  return (data as CompanyRow[]).map(mapRow)
})

/** The "active" company — for now, the first one the user created. */
export const getActiveCompany = cache(async (): Promise<Company | null> => {
  const companies = await getCompanies()
  return companies[0] ?? null
})
