export function OnboardingSteps({ currentStep = 1 }: { currentStep?: 1 | 2 | 3 }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-orange-600 font-semibold text-lg mb-2">1. Registro pessoal</h3>
        <p className="text-slate-600 text-sm">Preencha seus dados pessoais para criar a sua conta.</p>
      </div>

      <div className="space-y-2">
        <div
          className={`flex items-center space-x-3 transition-colors ${
            currentStep >= 2 ? "text-blue-600" : "text-slate-400"
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
              currentStep >= 2 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-400"
            }`}
          >
            2
          </div>
          <span className="font-medium">Confirmar o email</span>
        </div>
        <p className="text-slate-500 text-sm ml-9">Receba um link para ativar a sua conta.</p>
      </div>

      <div className="space-y-2">
        <div
          className={`flex items-center space-x-3 transition-colors ${
            currentStep >= 3 ? "text-green-600" : "text-slate-400"
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
              currentStep >= 3 ? "bg-green-600 text-white" : "bg-slate-200 text-slate-400"
            }`}
          >
            3
          </div>
          <span className="font-medium">Crie suas empresas</span>
        </div>
        <p className="text-slate-500 text-sm ml-9">Adicione as empresas que pretende gerir na plataforma.</p>
      </div>
    </div>
  )
}
