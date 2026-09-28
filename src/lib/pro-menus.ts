/**
 * WeeFly Pro · para onde leva cada menu do Agente (PRO-04).
 *
 * Sem imports de servidor: é lido pelo menu lateral, que é um componente de
 * cliente, e pelas páginas do servidor.
 */

export type AgentMenuId = "flights" | "cars" | "houses" | "experiences" | "food"

/** Passagens é o Concierge: abre o Price Checker, tal como funciona hoje. */
export const AGENT_MENU_HREF: Record<AgentMenuId, string> = {
  flights: "/admin/price-checker",
  cars: "/agente/carros",
  houses: "/agente/casas",
  experiences: "/agente/experiencias",
  food: "/agente/comida",
}
