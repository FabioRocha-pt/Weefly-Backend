export type User = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  country?: string
  emailConfirmed: boolean
  createdAt: Date
}

export type Company = {
  id: string
  userId: string
  type: "rental" | "housing" | "tourism"
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
  isActive: boolean
  createdAt: Date
}

export type CompanyType = {
  id: "rental" | "housing" | "tourism"
  name: string
  description: string
  icon: string
  color: string
  tags: string[]
}

export type Request = {
  id: string
  clientName: string
  clientEmail: string
  service: string
  status: "novo" | "proposta" | "confirmada" | "rejeitada"
  date: string
  amount?: number
  commission?: number
}

export type DashboardStats = {
  newRequests: number
  clients: number
  wallet: number
  monthlyCommission: number
}

export const COUNTRIES = [
  { value: "CV", label: "Cabo Verde" },
  { value: "PT", label: "Portugal" },
  { value: "BR", label: "Brasil" },
  { value: "AO", label: "Angola" },
  { value: "MZ", label: "Moçambique" },
  { value: "ST", label: "São Tomé e Príncipe" },
  { value: "GW", label: "Guiné-Bissau" },
]

export const PHONE_PREFIXES = [
  { value: "+238", label: "+238 (Cabo Verde)" },
  { value: "+351", label: "+351 (Portugal)" },
  { value: "+55", label: "+55 (Brasil)" },
  { value: "+244", label: "+244 (Angola)" },
  { value: "+258", label: "+258 (Moçambique)" },
  { value: "+239", label: "+239 (São Tomé)" },
  { value: "+245", label: "+245 (Guiné-Bissau)" },
]
