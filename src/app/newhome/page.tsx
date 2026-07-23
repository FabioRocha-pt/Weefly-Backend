import Link from "next/link"
import { Plane, ShieldCheck, Clock } from "lucide-react"

import { WeeFlyLogo } from "@/components/weefly-logo"
import { ChatWidget } from "@/components/concierge/chat-widget"

const EMBER = "#FF4747"

export default function NewHomePage() {
  return (
    <div className="relative">
      {/* Soft ember glow behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(255,71,71,0.10) 0%, rgba(255,71,71,0) 70%)",
        }}
      />

      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <WeeFlyLogo className="h-7 w-auto text-[#FF4747]" />
          <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold tracking-wide text-white">
            CONCIERGE
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-500 sm:flex">
          <a href="#como-funciona" className="transition-colors hover:text-slate-900">
            Como funciona
          </a>
          <Link
            href="/concierge"
            className="rounded-xl px-4 py-2 text-white transition-transform hover:brightness-95 active:scale-[0.98]"
            style={{ backgroundColor: EMBER }}
          >
            Pedido assistido
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <section className="mx-auto max-w-3xl pt-8 text-center sm:pt-14">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: "#FFECEC", color: EMBER }}
          >
            <Plane className="h-3.5 w-3.5" />
            O seu Concierge de viagens com IA
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            Os seus voos,
            <br />
            <span style={{ color: EMBER }}>numa simples conversa.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base text-slate-500 sm:text-lg">
            Escreva para onde quer ir, como falaria com um amigo. O WeeFly
            Concierge encontra as melhores tarifas e opções — sem formulários,
            sem complicações.
          </p>
        </section>

        {/* Chat */}
        <section className="mx-auto mt-10 max-w-3xl">
          <ChatWidget />
        </section>

        {/* Trust bullets */}
        <section
          id="como-funciona"
          className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3"
        >
          <Feature
            icon={Plane}
            title="Linguagem natural"
            description="Diga a origem, o destino e as datas à sua maneira. Nós tratamos do resto."
          />
          <Feature
            icon={Clock}
            title="Resultados em segundos"
            description="Comparamos tarifas em tempo real e mostramos a mais barata e a melhor opção."
          />
          <Feature
            icon={ShieldCheck}
            title="Acompanhamento humano"
            description="A nossa equipa de Concierge confirma e finaliza cada reserva por si."
          />
        </section>
      </main>
    </div>
  )
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Plane
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 text-center shadow-sm">
      <div
        className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: "#FFECEC" }}
      >
        <Icon className="h-5 w-5" style={{ color: EMBER }} />
      </div>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500">{description}</p>
    </div>
  )
}
