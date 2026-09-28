import { requireModule } from "@/lib/pro-account"

/** PRO-02 · o módulo Admin é só da conta master. */
export default async function AdminModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule("admin")
  return <>{children}</>
}
