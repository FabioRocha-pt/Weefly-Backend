import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="min-h-screen auth-bg flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-orange-600">404</p>
        <h1 className="text-2xl font-bold text-slate-900 mt-4">Página não encontrada</h1>
        <p className="text-slate-500 mt-2 mb-6">
          A página que procura não existe ou foi movida.
        </p>
        <Link href="/inicio">
          <Button>Voltar ao início</Button>
        </Link>
      </div>
    </div>
  )
}
