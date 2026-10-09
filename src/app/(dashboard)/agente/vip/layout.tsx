import { requirePartnerChannel } from "@/lib/channel-gate"

/**
 * B2G-21 · B2G-22 · sem o canal VIP ligado, nada daqui existe: 404 em todas
 * as páginas de `/agente/vip`, e não só a entrada escondida no menu.
 */
export default async function VipLayout({ children }: { children: React.ReactNode }) {
  await requirePartnerChannel("VIP")
  return <>{children}</>
}
