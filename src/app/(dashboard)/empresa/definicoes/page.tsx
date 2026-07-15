import { redirect } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { getActiveCompany } from "@/lib/companies"

export default async function DefinicoesPage() {
  const company = await getActiveCompany()
  if (!company) redirect("/criar-empresa")

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Definições da empresa</h1>
        <p className="text-slate-500 mt-1">Dados fiscais, contactos e informação bancária.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nome legal</Label>
            <Input defaultValue={company.legalName} />
          </div>
          <div className="space-y-2">
            <Label>Nome comercial</Label>
            <Input defaultValue={company.commercialName} />
          </div>
          <div className="space-y-2">
            <Label>NIF</Label>
            <Input defaultValue={company.nif} />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input defaultValue={company.phone} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" defaultValue={company.email} />
          </div>
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input defaultValue={company.city} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Morada</Label>
            <Input defaultValue={company.address} />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-900 mb-4">Dados bancários</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Banco</Label>
              <Input defaultValue={company.bankName} />
            </div>
            <div className="space-y-2">
              <Label>IBAN</Label>
              <Input defaultValue={company.iban} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline">Cancelar</Button>
          <Button>Guardar alterações</Button>
        </div>
      </div>
    </div>
  )
}
