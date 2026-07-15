import { RegisterForm } from "@/components/forms/register-form"

export default function RegisterPage() {
  return (
    <div className="w-full max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        {/* Left side - Information */}
        <div className="hidden lg:block pt-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-6">
            Crie sua conta e comece hoje
          </h1>
          <p className="text-slate-600 text-lg mb-8">
            Uma única conta serve para fornecedores de serviços e agentes. Os dados das empresas são adicionados no passo seguinte.
          </p>

          {/* Steps */}
          <div className="space-y-6">
            {/* Step 1 - Active */}
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 rounded-full bg-orange-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">1</span>
              </div>
              <div>
                <h3 className="text-orange-600 font-semibold text-lg">Registro pessoal</h3>
                <p className="text-slate-600 text-sm">
                  Preencha os seus dados pessoais para criar a sua conta.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">2</span>
              </div>
              <div>
                <h3 className="text-blue-600 font-semibold text-lg">Confirmar o email</h3>
                <p className="text-slate-600 text-sm">
                  Receba um link de ativação no seu email.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">3</span>
              </div>
              <div>
                <h3 className="text-green-600 font-semibold text-lg">Crie suas empresas</h3>
                <p className="text-slate-600 text-sm">
                  Adicione as empresas que pretende gerir na plataforma.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Form */}
        <div>
          <RegisterForm />
        </div>
      </div>
    </div>
  )
}
