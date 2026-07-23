import { TravelRequestForm } from "@/components/forms/travel-request-form"

export default function ConciergePage() {
  return (
    <div className="w-full">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
          Peça a sua viagem
        </h1>
        <p className="mt-3 text-slate-500">
          Diga-nos para onde quer voar e a nossa equipa de Concierge trata do
          resto — com as melhores opções e tarifas, feitas à sua medida.
        </p>
      </div>

      <TravelRequestForm />
    </div>
  )
}
