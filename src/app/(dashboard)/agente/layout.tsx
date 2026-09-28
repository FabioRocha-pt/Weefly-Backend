import { requireModule } from "@/lib/pro-account"

/** PRO-02 · o módulo Agente só abre para uma empresa que vende. */
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  await requireModule("agent")
  return <>{children}</>
}
