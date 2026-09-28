import { requireModule } from "@/lib/pro-account"

/** PRO-03 · criar uma empresa fornecedora é do módulo Fornecedor, bloqueado. */
export default async function CreateCompanyLayout({ children }: { children: React.ReactNode }) {
  await requireModule("supplier")
  return <>{children}</>
}
