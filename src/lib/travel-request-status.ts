/**
 * WeeFly back-office — travel request constants and row types.
 *
 * Deliberately free of any server-only import (no next/headers, no Supabase
 * client) so Client Components can pull in the labels and the status workflow
 * without dragging the server client into the browser bundle. Data access lives
 * in `travel-requests.ts`, which is server-only.
 */

export const REQUEST_STATUSES = [
  "novo",
  "em_tratamento",
  "proposta_enviada",
  "fechado",
  "perdido",
] as const

export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/*
 * As etiquetas destes estados não vivem aqui: estão em `requestStatus.*` nos
 * dicionários, e quem desenha um estado faz `t("requestStatus." + status)`. O
 * mesmo vale para o tipo de viagem, a classe e o canal — `tripTypes.*`,
 * `cabins.*` e `channels.*`.
 */

/**
 * Tailwind classes per status — shared by the list badge and the detail header.
 * Back-office palette (see `adm` in tailwind.config.js), because every screen
 * these appear on is dark.
 */
export const STATUS_STYLES: Record<RequestStatus, string> = {
  novo: "bg-adm-ember/15 text-adm-ember border-adm-ember/30",
  em_tratamento: "bg-adm-warn/15 text-adm-warn border-adm-warn/30",
  proposta_enviada: "bg-adm-warn/15 text-adm-warn border-adm-warn/30",
  fechado: "bg-adm-ok/15 text-adm-ok border-adm-ok/30",
  perdido: "bg-adm-raise text-adm-muted border-adm-line",
}

export interface RequestLead {
  id: string
  title: string | null
  full_name: string
  email: string
  phone_prefix: string | null
  phone: string | null
  source_channel: string
}

export interface TravelRequestRow {
  id: string
  reference: string
  status: RequestStatus
  trip_type: string
  origin: string
  destination: string
  depart_date: string
  return_date: string | null
  adults: number
  children: number
  infants: number
  cabin_class: string
  email_sent: boolean
  team_notified: boolean
  created_at: string
  lead: RequestLead | null
}

export interface RequestNote {
  id: string
  body: string
  author_email: string | null
  created_at: string
}

export type RequestStats = Record<RequestStatus | "total", number>
