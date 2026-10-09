"use client"

/**
 * WeeFly back-office — o construtor de link de atendimento (B7).
 *
 * O link é permanente e reutilizável: o caso só nasce quando o cliente submete o
 * formulário. É por isso que aqui não se cria nada — escolhem-se parâmetros e
 * copia-se um endereço.
 *
 * B2G-03 · três opções, uma por canal, e só as dos canais ligados na empresa:
 *   Público    · o link do price checker da empresa (o de sempre);
 *   VIP        · escolhe-se o cliente VIP e copia-se o link pessoal dele;
 *   Ministério · escolhe-se o ministério e a secretária, e copia-se o link
 *                pessoal dela. As secretárias chegam no bloco 3: até lá a
 *                opção aparece desactivada. Quando chegarem, basta passar
 *                `ministries` (ver `LinkMinistry`) — o componente não muda.
 */

import { useEffect, useMemo, useState } from "react"

import { CURRENCIES } from "@/lib/pc/catalog"
import { useLinkBase } from "@/components/bo/link-base"
import { COUNTRIES, COUNTRY_BY_ISO, countryName, flagOf } from "@/lib/countries"
import { useI18n, useT } from "@/i18n/provider"
import { LOCALE_TAGS } from "@/i18n/config"
import { hasChannel, type PartnerChannel } from "@/lib/channels"

/** B2G-03 · um cliente VIP no construtor: o link é `${origem}${path}`. */
export interface LinkVipClient {
  id: string
  name: string
  level: string | null
  /** `/vip/<token>` */
  path: string
}

/**
 * B2G-03 · um ministério no construtor, com as secretárias dele. É o bloco 3
 * que o preenche (cada secretária tem o seu link pessoal); até lá, não vem.
 */
export interface LinkMinistry {
  id: string
  name: string
  secretaries: { id: string; name: string; /** `/ministerios/<org>/<token>` */ path: string }[]
}

type LinkKind = "publico" | "vip" | "ministerio"

const KIND_CHANNEL: Record<LinkKind, PartnerChannel> = { publico: "B2C", vip: "VIP", ministerio: "B2G" }

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

/**
 * T-05 · o vendedor de um link é sempre quem está autenticado.
 *
 * O que estava aqui era uma lista de três nomes escrita no código — Nélida,
 * Jair, Carla — e o construtor deixava escolher qualquer um deles. Duas coisas
 * erradas ao mesmo tempo: os nomes não vinham de conta nenhuma (um link "de"
 * uma pessoa que podia nem existir no sistema), e quem estivesse a criar o link
 * podia atribuí-lo a outra pessoa sem que isso ficasse registado em lado
 * nenhum — o que num negócio à comissão não é um detalhe.
 *
 * O critério é explícito: "o parâmetro `agent` é preenchido a partir da sessão
 * activa, nunca escolhido" e "sem seletor de vendedor no construtor de links".
 * A escolha completa volta com o `RBAC`, no sprint seguinte.
 *
 * O `slug` sai do email e não de um campo novo: é o que já vai no endereço
 * (`?agent=`) e o que a fila mostra na coluna de origem.
 */
function agentSlug(email: string): string {
  return (email.split("@")[0] ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

const LANGS = [
  { value: "pt", label: "Português" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
]

export function BoTopbarActions({
  viewer,
  channels,
  vipClients = [],
  ministries,
}: {
  /** T-05 · quem está autenticado. O link sai em nome desta pessoa. */
  viewer: { label: string; email: string; company?: string | null }
  /** B2G-03 · os canais ligados da empresa da sessão. */
  channels: readonly PartnerChannel[]
  /** B2G-03 · os VIP activos da empresa (só com o canal VIP). */
  vipClients?: LinkVipClient[]
  /** B2G-03 · os ministérios e as secretárias — bloco 3. */
  ministries?: LinkMinistry[]
}) {
  const t = useT()
  const [open, setOpen] = useState(false)

  /*
   * C-14 · a campainha saiu daqui.
   *
   * Estava neste ficheiro e era um botão sem `onClick`, sem contador e sem
   * lista. Foi para `notification-bell.tsx`, e mudou de sítio no layout por uma
   * razão que não é de arrumação: o contador tem de vir do servidor a cada
   * render, e este componente é de cliente — não tinha por onde o receber sem
   * inventar uma segunda leitura no browser.
   */
  return (
    <>
      <button className="btn btn-primary btn-sm" type="button" onClick={() => setOpen(true)}>
        {t("bo.shell.link.create")}
      </button>
      <LinkDrawer
        open={open}
        onClose={() => setOpen(false)}
        viewer={viewer}
        channels={channels}
        vipClients={vipClients}
        ministries={ministries}
      />
    </>
  )
}

export function LinkDrawer({
  open,
  onClose,
  viewer,
  channels,
  vipClients = [],
  ministries,
}: {
  open: boolean
  onClose: () => void
  viewer: { label: string; email: string; company?: string | null }
  channels: readonly PartnerChannel[]
  vipClients?: LinkVipClient[]
  ministries?: LinkMinistry[]
}) {
  /* T-05 · não é estado: vem da sessão e não muda enquanto a gaveta está
     aberta. Um `useState` aqui era a porta por onde a escolha voltaria. */
  const agent = agentSlug(viewer.email)
  const agentName = viewer.label
  const { t, locale } = useI18n()
  const tag = LOCALE_TAGS[locale]
  /* I18N-01 · os nomes dos países na língua do agente, e por isso ordenados nela. */
  const countryOptions = useMemo(
    () =>
      tag === "pt-PT"
        ? COUNTRY_OPTIONS
        : [...COUNTRIES].sort((a, b) =>
            countryName(a.iso, tag).localeCompare(countryName(b.iso, tag), tag)
          ),
    [tag]
  )

  /* B2G-03 · só as opções dos canais ligados, pela ordem dos menus. */
  const kinds = (["publico", "vip", "ministerio"] as LinkKind[]).filter((k) => hasChannel(channels, KIND_CHANNEL[k]))
  const [kind, setKind] = useState<LinkKind | null>(kinds[0] ?? null)
  const active: LinkKind | null = kind && kinds.includes(kind) ? kind : (kinds[0] ?? null)
  /* Bloco 3 · sem ministérios com secretárias, a opção fica desactivada. */
  const ministriesReady = Boolean(ministries?.some((m) => m.secretaries.length > 0))

  const [vipId, setVipId] = useState<string>("")
  const vip = vipClients.find((v) => v.id === vipId) ?? null
  const [ministryId, setMinistryId] = useState<string>("")
  const ministry = ministries?.find((m) => m.id === ministryId) ?? null
  const [secretaryId, setSecretaryId] = useState<string>("")
  const secretary = ministry?.secretaries.find((s) => s.id === secretaryId) ?? null

  const [market, setMarket] = useState(MARKETS[2].name)
  const [lang, setLang] = useState("fr")
  const [currency, setCurrency] = useState("EUR")
  const [country, setCountry] = useState("FR")

  /* MIG-02 · o endereço vem da configuração (e do parceiro da sessão), nunca
     do endereço em que o back-office foi aberto: aberto pelo endereço antigo,
     o link copiado apontava para o endereço antigo. */
  const origin = useLinkBase()

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
    /* PRO-06 · a empresa de quem cria o link. O servidor só a aceita se
       houver um vendedor activo dela com este `agent` (ver `lib/pc/intake`). */
    if (viewer.company) params.set("company", viewer.company)
    return `${origin}/pc?${params.toString()}`
  }, [origin, lang, currency, country, agent, viewer.company])

  const bare = `${origin}/pc`

  /* B2G-03 · o link pessoal (VIP ou secretária): sem parâmetros — quem o abre
     já é conhecido, e a empresa vem do token, não do endereço. */
  const personalUrl =
    active === "vip" && vip ? `${origin}${vip.path}` : active === "ministerio" && secretary ? `${origin}${secretary.path}` : ""
  const personalName = active === "vip" ? vip?.name ?? "" : secretary?.name ?? ""
  const personalMessage = useMemo(() => {
    if (!personalUrl) return ""
    const body =
      lang === "pt"
        ? `Olá ${personalName}! Este é o seu link pessoal para nos pedir viagens. Guarde-o: serve sempre, e é só seu.`
        : lang === "fr"
          ? `Bonjour ${personalName} ! Voici votre lien personnel pour nous demander vos voyages. Gardez-le : il sert toujours, et il n'est qu'à vous.`
          : `Hello ${personalName}! This is your personal link to request trips from us. Keep it: it always works, and it is yours only.`
    return `${body}\n\n${personalUrl}`
  }, [lang, personalName, personalUrl])

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
        ? "Respondo por aqui com as ofertas."
        : lang === "fr"
          ? "Je vous réponds ici avec les offres."
          : "I'll reply here with the offers."
    return `${body}\n\n${url}\n\n${closing}`
  }, [lang, agentName, url])

  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} />
      <aside className={`drawer${open ? " on" : ""}`} aria-label={t("bo.shell.link.drawerLabel")}>
        <header className="drawer-h">
          <div>
            <h3>{t("bo.shell.link.title")}</h3>
            <p>
              {t("bo.shell.link.intro")}
            </p>
          </div>
          <button className="btn btn-sm btn-icon" type="button" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="drawer-b">
          {/* B2G-03 · o canal do link: só os ligados na empresa. */}
          <section className="sec">
            <div className="sec-h">
              <h4>{t("bo.linkChannels.kind")}</h4>
              <span className="rule" />
            </div>
            {kinds.length === 0 ? (
              <p className="note">{t("bo.linkChannels.noChannels")}</p>
            ) : (
              <div className="qtabs" role="radiogroup" aria-label={t("bo.linkChannels.kind")} style={{ marginBottom: 0 }}>
                {kinds.map((k) => {
                  const disabled = k === "ministerio" && !ministriesReady
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      className="qtab"
                      aria-checked={active === k}
                      aria-pressed={active === k}
                      aria-disabled={disabled || undefined}
                      disabled={disabled}
                      title={disabled ? t("bo.linkChannels.ministerioSoon") : undefined}
                      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                      onClick={() => setKind(k)}
                    >
                      {t(`bo.linkChannels.${k}`)}
                    </button>
                  )
                })}
              </div>
            )}
            {kinds.includes("ministerio") && !ministriesReady && (
              <p className="note" style={{ marginTop: 9 }}>
                {t("bo.linkChannels.ministerioSoon")}
              </p>
            )}
          </section>

          {active === "vip" && (
            <section className="sec">
              <div className="sec-h">
                <h4>{t("bo.linkChannels.vip")}</h4>
                <span className="rule" />
              </div>
              {vipClients.length === 0 ? (
                <p className="note">{t("bo.linkChannels.noVip")}</p>
              ) : (
                <div className="fgrid">
                  <div className="f s8">
                    <label>{t("bo.linkChannels.pickVip")}</label>
                    <select value={vipId} onChange={(e) => setVipId(e.target.value)}>
                      <option value="">—</option>
                      {vipClients.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                          {v.level ? ` · ${v.level}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="f s4">
                    <label>{t("bo.shell.link.language")}</label>
                    <select value={lang} onChange={(e) => setLang(e.target.value)}>
                      {LANGS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <p className="note" style={{ marginTop: 11 }}>
                {t("bo.linkChannels.vipNote")}
              </p>
            </section>
          )}

          {active === "ministerio" && ministriesReady && (
            <section className="sec">
              <div className="sec-h">
                <h4>{t("bo.linkChannels.ministerio")}</h4>
                <span className="rule" />
              </div>
              <div className="fgrid">
                <div className="f s6">
                  <label>{t("bo.linkChannels.pickMinistry")}</label>
                  <select
                    value={ministryId}
                    onChange={(e) => {
                      setMinistryId(e.target.value)
                      setSecretaryId("")
                    }}
                  >
                    <option value="">—</option>
                    {(ministries ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="f s6">
                  <label>{t("bo.linkChannels.pickSecretary")}</label>
                  <select value={secretaryId} onChange={(e) => setSecretaryId(e.target.value)} disabled={!ministry}>
                    <option value="">—</option>
                    {(ministry?.secretaries ?? []).map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          )}

          {(active === "vip" || active === "ministerio") && personalUrl && (
            <section className="sec">
              <div className="sec-h">
                <h4>{t("bo.shell.link.generated")}</h4>
                <span className="rule" />
              </div>
              <div className="linkbox">
                <span className="lb-k">{t("bo.shell.link.address")}</span>
                <div className="lb-v">
                  <code>{personalUrl}</code>
                  <Copy value={personalUrl} />
                </div>
              </div>
              <div className="linkbox">
                <span className="lb-k">{t("bo.shell.link.message")}</span>
                <div className="f" style={{ marginTop: 8 }}>
                  <textarea style={{ minHeight: 110 }} readOnly value={personalMessage} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <Copy value={personalMessage} label={t("bo.shell.link.copyMessage")} style={{ flex: 1 }} />
                  <button
                    className="btn btn-sm"
                    style={{ flex: 1 }}
                    type="button"
                    onClick={() =>
                      window.open(`https://wa.me/?text=${encodeURIComponent(personalMessage)}`, "_blank", "noopener")
                    }
                  >
                    {t("bo.shell.link.openWhatsapp")}
                  </button>
                </div>
              </div>
            </section>
          )}

          {active === "publico" && (
          <>
          <section className="sec">
            <div className="sec-h">
              <h4>{t("bo.shell.link.params")}</h4>
              <span className="rule" />
            </div>
            <div className="fgrid">
              {/* T-05 · mostrado, não escolhido. O campo continua à vista
                  porque quem cria o link tem de ver em nome de quem ele sai —
                  o que sai é a leitura, não a decisão. */}
              <div className="f s6">
                <label>{t("bo.shell.link.seller")}</label>
                <input value={agentName} disabled />
                <span className="hint">
                  {t("bo.shell.link.yourAccount")} · <span className="mono">{agent}</span>
                </span>
              </div>
              <div className="f s6">
                <label>{t("bo.shell.link.market")}</label>
                <select value={market} onChange={(e) => applyMarket(e.target.value)}>
                  {MARKETS.map((m) => (
                    <option key={m.name} value={m.name}>
                      {tag === "pt-PT" ? m.name : countryName(m.country, tag)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f s4">
                <label>{t("bo.shell.link.language")}</label>
                <select value={lang} onChange={(e) => setLang(e.target.value)}>
                  {LANGS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f s4">
                <label>{t("bo.shell.link.currency")}</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="f s4">
                <label>{t("bo.shell.link.clientCountry")}</label>
                <select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {countryOptions.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {flagOf(c.iso)} {countryName(c.iso, tag)} · {c.dial}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="note" style={{ marginTop: 11 }}>
              {t("bo.shell.link.paramsNote", { dial: COUNTRY_BY_ISO[country]?.dial ?? "—" })}
            </p>

            {/*
              BO-02 · aqui não se cria nem se mostra nenhum link de pagamento.
              Esta é a porta de entrada do cliente, e nesta altura não existe
              caso, nem opção escolhida, nem valor. O link de pagamento nasce
              sozinho, um passo depois de os passaportes estarem completos.
            */}
            <p className="note" style={{ marginTop: 9 }}>
              {t("bo.shell.link.noAmountNote")}
            </p>
          </section>

          <section className="sec">
            <div className="sec-h">
              <h4>{t("bo.shell.link.generated")}</h4>
              <span className="rule" />
            </div>
            <div className="linkbox">
              <span className="lb-k">{t("bo.shell.link.address")}</span>
              <div className="lb-v">
                <code>{url}</code>
                <Copy value={url} />
              </div>
            </div>

            <div className="linkbox">
              <span className="lb-k">{t("bo.shell.link.message")}</span>
              <div className="f" style={{ marginTop: 8 }}>
                <textarea style={{ minHeight: 120 }} readOnly value={message} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Copy value={message} label={t("bo.shell.link.copyMessage")} style={{ flex: 1 }} />
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
                  {t("bo.shell.link.openWhatsapp")}
                </button>
              </div>
            </div>

            <div className="linkbox">
              <span className="lb-k">{t("bo.shell.link.bareOnly")}</span>
              <div className="lb-v">
                <code>{bare}</code>
                <Copy value={bare} />
              </div>
              <p className="hint" style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
                {t("bo.shell.link.bareNote")}
              </p>
            </div>
          </section>
          </>
          )}
        </div>

        <footer className="drawer-f">
          <button className="btn" type="button" onClick={onClose}>
            {t("bo.shell.link.close")}
          </button>
        </footer>
      </aside>
    </>
  )
}

function Copy({
  value,
  label,
  style,
}: {
  value: string
  label?: string
  style?: React.CSSProperties
}) {
  const t = useT()
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
      {done ? t("bo.shell.link.copied") : (label ?? t("bo.shell.link.copy"))}
    </button>
  )
}
