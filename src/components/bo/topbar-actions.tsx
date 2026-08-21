"use client"

/**
 * WeeFly back-office — o construtor de link de atendimento (B7).
 *
 * O link é permanente e reutilizável: o caso só nasce quando o cliente submete o
 * formulário. É por isso que aqui não se cria nada — escolhem-se parâmetros e
 * copia-se um endereço.
 */

import { useEffect, useMemo, useState } from "react"

import { CURRENCIES } from "@/lib/pc/catalog"
import { COUNTRIES, COUNTRY_BY_ISO, countryName, flagOf } from "@/lib/countries"

interface Market {
  name: string
  /** ISO-3166 alpha-2 — é o país que vai no link, não o indicativo. */
  country: string
  currency: string
  lang: string
}

/*
 * Os mercados onde a WeeFly vende. Cada um traz o indicativo, a moeda e a língua
 * que fazem sentido nele — é isso que faz o cliente abrir o link com tudo certo
 * sem ter de escolher nada.
 */
const MARKETS: Market[] = [
  { name: "Cabo Verde", country: "CV", currency: "CVE", lang: "pt" },
  { name: "Portugal", country: "PT", currency: "EUR", lang: "pt" },
  { name: "França", country: "FR", currency: "EUR", lang: "fr" },
  { name: "Estados Unidos", country: "US", currency: "USD", lang: "en" },
  { name: "Países Baixos", country: "NL", currency: "EUR", lang: "en" },
]

/* Os cinco atalhos acima são os mercados onde a WeeFly vende; o seletor de país
   tem os 247, porque um cliente da diáspora pode estar em qualquer um deles e o
   país é o que decide o indicativo e os métodos de pagamento que ele vê. */
const COUNTRY_OPTIONS = [...COUNTRIES].sort((a, b) =>
  countryName(a.iso, "pt").localeCompare(countryName(b.iso, "pt"), "pt")
)

const AGENTS = [
  { slug: "nelida", name: "Nélida Fortes" },
  { slug: "jair", name: "Jair Semedo" },
  { slug: "carla", name: "Carla Évora" },
]

const LANGS = [
  { value: "pt", label: "Português" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
]

export function BoTopbarActions() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="bell" title="Avisos" type="button">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <path
            d="M9 2.5a4.2 4.2 0 00-4.2 4.2c0 3.3-1.3 4.6-1.3 4.6h11c0-.1-1.3-1.3-1.3-4.6A4.2 4.2 0 009 2.5zM7.4 13.8a1.7 1.7 0 003.2 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button className="btn btn-primary btn-sm" type="button" onClick={() => setOpen(true)}>
        Criar link
      </button>
      <LinkDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function LinkDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [agent, setAgent] = useState(AGENTS[0].slug)
  const [market, setMarket] = useState(MARKETS[2].name)
  const [lang, setLang] = useState("fr")
  const [currency, setCurrency] = useState("EUR")
  const [country, setCountry] = useState("FR")
  const [origin, setOrigin] = useState("")

  /* O endereço tem de ser o real, não "weefly.africa" em duro: em pré-produção o
     link copiado tem de abrir a pré-produção. */
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  function applyMarket(name: string) {
    setMarket(name)
    const found = MARKETS.find((m) => m.name === name)
    if (!found) return
    setCountry(found.country)
    setCurrency(found.currency)
    setLang(found.lang)
  }

  const url = useMemo(() => {
    const params = new URLSearchParams()
    params.set("lang", lang)
    params.set("currency", currency)
    params.set("country", country)
    if (agent) params.set("agent", agent)
    return `${origin || "https://weefly.africa"}/pc?${params.toString()}`
  }, [origin, lang, currency, country, agent])

  const bare = `${origin || "https://weefly.africa"}/pc`

  const agentName = AGENTS.find((a) => a.slug === agent)?.name ?? ""

  const message = useMemo(() => {
    const greeting =
      lang === "pt"
        ? "Olá! Sou"
        : lang === "fr"
          ? "Bonjour ! Je suis"
          : "Hello! I'm"
    const body =
      lang === "pt"
        ? `${greeting} ${agentName}, da WeeFly. Para eu procurar as melhores tarifas para a sua viagem, preencha aqui os detalhes — leva menos de um minuto e não compromete nada:`
        : lang === "fr"
          ? `${greeting} ${agentName}, de WeeFly. Pour que je puisse chercher les meilleurs tarifs pour votre voyage, remplissez les détails ici — moins d'une minute, sans engagement :`
          : `${greeting} ${agentName} from WeeFly. So I can search the best fares for your trip, fill in the details here — under a minute, no commitment:`
    const closing =
      lang === "pt"
        ? "Respondo por aqui com as opções."
        : lang === "fr"
          ? "Je vous réponds ici avec les options."
          : "I'll reply here with the options."
    return `${body}\n\n${url}\n\n${closing}`
  }, [lang, agentName, url])

  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} />
      <aside className={`drawer${open ? " on" : ""}`} aria-label="Construtor de link">
        <header className="drawer-h">
          <div>
            <h3>Link de atendimento</h3>
            <p>
              O link é permanente e reutilizável. O caso só nasce quando o cliente
              submete o formulário.
            </p>
          </div>
          <button className="btn btn-sm btn-icon" type="button" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="drawer-b">
          <section className="sec">
            <div className="sec-h">
              <h4>Parâmetros</h4>
              <span className="rule" />
            </div>
            <div className="fgrid">
              <div className="f s6">
                <label>Vendedor</label>
                <select value={agent} onChange={(e) => setAgent(e.target.value)}>
                  {AGENTS.map((a) => (
                    <option key={a.slug} value={a.slug}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f s6">
                <label>Mercado</label>
                <select value={market} onChange={(e) => applyMarket(e.target.value)}>
                  {MARKETS.map((m) => (
                    <option key={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="f s4">
                <label>Idioma</label>
                <select value={lang} onChange={(e) => setLang(e.target.value)}>
                  {LANGS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f s4">
                <label>Moeda</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="f s4">
                <label>País do cliente</label>
                <select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {flagOf(c.iso)} {countryName(c.iso, "pt")} · {c.dial}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="note" style={{ marginTop: 11 }}>
              O idioma, a moeda e o país são definidos aqui e o cliente já abre o
              link com tudo certo — o indicativo do telefone vem do país
              ({COUNTRY_BY_ISO[country]?.dial ?? "—"}). Pode trocar, mas por
              omissão vê o que faz sentido no mercado dele.
            </p>

            {/*
              BO-02 · aqui não se cria nem se mostra nenhum link de pagamento.
              Esta é a porta de entrada do cliente, e nesta altura não existe
              caso, nem opção escolhida, nem valor. O link de pagamento nasce
              sozinho, um passo depois de os passaportes estarem completos.
            */}
            <p className="note" style={{ marginTop: 9 }}>
              Não há aqui nenhum valor a cobrar: o link de pagamento é gerado
              automaticamente depois de o cliente escolher uma opção e preencher
              os dados de todos os passageiros. Até aí não há montante nem
              passageiro a quem o cobrar.
            </p>
          </section>

          <section className="sec">
            <div className="sec-h">
              <h4>Link gerado</h4>
              <span className="rule" />
            </div>
            <div className="linkbox">
              <span className="lb-k">Endereço</span>
              <div className="lb-v">
                <code>{url}</code>
                <Copy value={url} />
              </div>
            </div>

            <div className="linkbox">
              <span className="lb-k">Mensagem pronta a colar</span>
              <div className="f" style={{ marginTop: 8 }}>
                <textarea style={{ minHeight: 120 }} readOnly value={message} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Copy value={message} label="Copiar mensagem" style={{ flex: 1 }} />
                <button
                  className="btn btn-sm"
                  style={{ flex: 1 }}
                  type="button"
                  onClick={() =>
                    window.open(
                      `https://wa.me/?text=${encodeURIComponent(message)}`,
                      "_blank",
                      "noopener"
                    )
                  }
                >
                  Abrir no WhatsApp
                </button>
              </div>
            </div>

            <div className="linkbox">
              <span className="lb-k">Só o link</span>
              <div className="lb-v">
                <code>{bare}</code>
                <Copy value={bare} />
              </div>
              <p className="hint" style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
                Sem parâmetros. O cliente escolhe idioma e moeda, e o caso entra sem
                vendedor atribuído.
              </p>
            </div>
          </section>
        </div>

        <footer className="drawer-f">
          <button className="btn" type="button" onClick={onClose}>
            Fechar
          </button>
        </footer>
      </aside>
    </>
  )
}

function Copy({
  value,
  label = "Copiar",
  style,
}: {
  value: string
  label?: string
  style?: React.CSSProperties
}) {
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 1400)
    return () => clearTimeout(timer)
  }, [done])

  return (
    <button
      className="btn btn-sm"
      type="button"
      style={style}
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {})
        setDone(true)
      }}
    >
      {done ? "Copiado" : label}
    </button>
  )
}
