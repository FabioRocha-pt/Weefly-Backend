import { requirePartnerChannel } from "@/lib/channel-gate"

/**
 * B2G-02 · sem o canal Ministérios ligado, nada daqui existe: 404 em todas as
 * páginas de `/agente/ministerios`, e não só a entrada escondida no menu.
 */
export default async function MinisteriosLayout({ children }: { children: React.ReactNode }) {
  await requirePartnerChannel("B2G")
  return <>{children}</>
}
