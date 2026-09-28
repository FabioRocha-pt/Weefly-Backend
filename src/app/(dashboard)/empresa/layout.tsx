import { requireModule } from "@/lib/pro-account"

/**
 * PRO-03 · o módulo Fornecedor está bloqueado nesta versão. As páginas que
 * estão cá dentro ficam no código para quando abrir, mas o endereço directo
 * não as mostra: `requireModule` devolve à escolha de módulo.
 */
export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  await requireModule("supplier")
  return <>{children}</>
}
