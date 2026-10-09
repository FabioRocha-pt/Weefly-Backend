import { requirePartnerChannel } from "@/lib/channel-gate"

/**
 * B2G-21 · o menu Público só existe com o canal Público (B2C) ligado: 404 em
 * `/agente/publico` com ele desligado. O link público do `/pc` continua a
 * abrir na mesma (decisão do bloco 1: não se fecha o B2C de ninguém).
 */
export default async function PublicoLayout({ children }: { children: React.ReactNode }) {
  await requirePartnerChannel("B2C")
  return <>{children}</>
}
