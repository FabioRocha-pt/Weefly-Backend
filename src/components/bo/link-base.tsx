"use client"

import { createContext, useContext } from "react"

import { siteUrl } from "@/lib/site-url"

/**
 * MIG-02 · o endereço base dos links que o back-office copia.
 *
 * Era `window.location.origin`: um agente que abrisse o back-office pelo
 * endereço antigo copiava links para o endereço antigo. Vem do servidor, que o
 * lê da configuração e do parceiro da sessão (`partnerSiteUrl`).
 */
const LinkBaseContext = createContext<string>("")

export function LinkBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <LinkBaseContext.Provider value={base}>{children}</LinkBaseContext.Provider>
}

export function useLinkBase(): string {
  return useContext(LinkBaseContext) || siteUrl()
}
