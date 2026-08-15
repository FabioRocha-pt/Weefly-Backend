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

/*
 * As listas de opções guardam a chave de tradução, não a etiqueta.
 *
 * São constantes de módulo, avaliadas uma vez quando o ficheiro é carregado —
 * muito antes de sabermos em que idioma a página vai ser desenhada. Quem
 * desenha a lista chama `t(option.labelKey)` no momento certo.
 */

export const COUNTRIES: { value: string; labelKey: string }[] = [
  { value: "CV", labelKey: "countries.CV" },
  { value: "PT", labelKey: "countries.PT" },
  { value: "BR", labelKey: "countries.BR" },
  { value: "AO", labelKey: "countries.AO" },
  { value: "MZ", labelKey: "countries.MZ" },
  { value: "ST", labelKey: "countries.ST" },
  { value: "GW", labelKey: "countries.GW" },
]

// --- Concierge · Travel Request options -------------------------------------

export type TripType = "round_trip" | "one_way" | "multi_city"
export type CabinClass = "economy" | "business" | "first"
export type PassengerTitle = "mr" | "ms"

export const TRIP_TYPES: { value: TripType; labelKey: string }[] = [
  { value: "round_trip", labelKey: "tripTypes.round_trip" },
  { value: "one_way", labelKey: "tripTypes.one_way" },
  { value: "multi_city", labelKey: "tripTypes.multi_city" },
]

export const CABIN_CLASSES: { value: CabinClass; labelKey: string }[] = [
  { value: "economy", labelKey: "cabins.economy" },
  { value: "business", labelKey: "cabins.business" },
  { value: "first", labelKey: "cabins.first" },
]

export const PASSENGER_TITLES: { value: PassengerTitle; labelKey: string }[] = [
  { value: "mr", labelKey: "titles.mr" },
  { value: "ms", labelKey: "titles.ms" },
]

/*
 * O indicativo traz o país para que a etiqueta possa ser montada na língua da
 * pessoa — "+239 (São Tomé)" em português, "+239 (Sao Tome)" em inglês.
 */
export const PHONE_PREFIXES: { value: string; country: string }[] = [
  { value: "+238", country: "CV" },
  { value: "+351", country: "PT" },
  { value: "+55", country: "BR" },
  { value: "+244", country: "AO" },
  { value: "+258", country: "MZ" },
  { value: "+239", country: "ST" },
  { value: "+245", country: "GW" },
]
