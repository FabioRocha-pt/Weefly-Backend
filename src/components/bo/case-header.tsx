"use client"

/**
 * BO-08 · o cabeçalho do caso, que deixa de desaparecer.
 *
 * Entrar no compositor de propostas fazia o cabeçalho e as abas sumirem: o
 * ecrã passava a ser uma migalha de pão e três colunas de formulário, e quem lá
 * estava perdia de vista a referência, o estado, o mercado, o vendedor e a hora
 * de submissão — precisamente o que é preciso ter à frente enquanto se escreve
 * um preço.
 *
 * A causa era estrutural e não visual: o cabeçalho vivia dentro de
 * `case-view.tsx`, um componente de cliente com as abas em `useState`, e o
 * compositor é outra rota. Sair da ficha era sair do componente que desenhava o
 * cabeçalho.
 *
 * Este ficheiro é o cabeçalho sozinho, e sabe funcionar dos dois lados:
 *
 *   · na ficha do caso recebe `onSelect` e as abas são botões — trocar de aba
 *     continua a ser instantâneo, sem ida ao servidor;
 *   · no compositor não recebe `onSelect` e as abas são links para a ficha. O
 *     indicador vai para "Propostas", que é onde a pessoa está — em vez de o
 *     cabeçalho não existir.
 *
 * Traz também o que o backlog pendurou no cabeçalho por ser preciso em todo o
 * lado: o vendedor (BO-14), o botão de avisar o cliente (NT-07) e a bandeira de
 * uma entrega que falhou (NT-06).
 */

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import type { BoCaseDetail } from "@/lib/pc/bo-queue"
import { BO_STATE_CLASS, BO_STATE_LABEL } from "@/lib/pc/bo-queue"
import { elapsedSince } from "@/lib/case-status"
import { boClearNotifyFlag, boNotifyClient, boSetSeller } from "@/actions/bo-price-checker"
import { BoWhatsappLink } from "@/components/bo/whatsapp-link"
import { countryName, flagOf } from "@/lib/countries"

export type BoTabId =
  | "t-pedido"
  | "t-propostas"
  | "t-pax"
  | "t-pag"
  | "t-emi"
  | "t-com"
  | "t-log"

export const BO_TABS: { id: BoTabId; label: string }[] = [
  { id: "t-pedido", label: "Pedido" },
  { id: "t-propostas", label: "Propostas" },
  { id: "t-pax", label: "Passageiros" },
  { id: "t-pag", label: "Pagamento" },
  { id: "t-emi", label: "Emissão" },
  { id: "t-com", label: "Comunicações" },
  { id: "t-log", label: "Registo" },
]

export interface BoSellerOption {
  email: string
  label: string
}

const dt = (iso: string | null | undefined, withTime = true): string => {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Atlantic/Cape_Verde",
  })
}

/** O mercado do caso, escrito como uma pessoa o lê. */
export const marketName = (iso: string) =>
  iso ? `${flagOf(iso)} ${countryName(iso, "pt")}` : "—"

export function BoCaseHeader({
  detail,
  sellers,
  active,
  counts,
  onSelect,
}: {
  detail: BoCaseDetail
  /** BO-14 · lida de `bo_allowlist`, nunca escrita no código. */
  sellers: BoSellerOption[]
  active: BoTabId
  counts: Partial<Record<BoTabId, number>>
  /**
   * Presente só na ficha do caso, onde trocar de aba é estado local.
   *
   * Sem ela as abas viram links — é assim que o compositor, que é outra rota,
   * mostra o mesmo cabeçalho sem ter de saber o que é uma aba.
   */
  onSelect?: (tab: BoTabId) => void
}) {
  const router = useRouter()
  const row = detail.row
  const [pending, startTransition] = useTransition()
  const [seller, setSeller] = useState(detail.seller.email ?? "")
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [byEmail, setByEmail] = useState(true)
  const [byWhatsapp, setByWhatsapp] = useState(true)

  /* NT-07 · "disponível em qualquer caso a partir da fase de proposta". Antes
     disso não há nada sobre que avisar: o cliente ainda está à espera da
     primeira resposta, e essa tem um email próprio. */
  const canNotify = row.state !== "novo" && row.state !== "cancelado"

  function assign(email: string) {
    setSeller(email)
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await boSetSeller({ caseId: row.caseId, email })
      if (result.ok) {
        setNotice(result.notice ?? null)
        router.refresh()
      } else {
        setError(result.error)
        setSeller(detail.seller.email ?? "")
      }
    })
  }

  function sendNotice() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await boNotifyClient({
        caseId: row.caseId,
        message,
        email: byEmail,
        whatsapp: byWhatsapp,
      })
      if (result.ok) {
        setNotice(result.notice ?? null)
        setMessage("")
        setNoticeOpen(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <section className="casebar">
      <div className="case-top">
        <div>
          <p className="crumb">
            <Link href="/admin/price-checker">Price Checker</Link> ·{" "}
            <Link href="/admin/price-checker?tab=tudo">Casos</Link>
          </p>
          <h2 className="case">
            {row.clientName} <span className="token mono">{row.reference}</span>{" "}
            <span className={`state ${BO_STATE_CLASS[row.state]}`}>
              <span className={`dot ${row.waiting === "bad" ? "bad" : row.waiting}`} />
              {BO_STATE_LABEL[row.state]}
            </span>
          </h2>
          <div className="case-meta">
            <div className="cm">
              <span className="cm-k">Entrada</span>
              {detail.trip.intake === "price_checker" ? "Link" : detail.trip.intake} ·{" "}
              <span className="mono">
                {row.agentSlug ? `agent=${row.agentSlug}` : "sem agente"}
              </span>
            </div>
            <div className="cm">
              <span className="cm-k">Mercado e moeda</span>
              {marketName(row.market)} · <span className="mono">{row.currency}</span> ·{" "}
              <span className="mono">lang={row.locale}</span>
            </div>
            {/* BO-14 · o seletor lê da lista de acessos do sistema. Está no
                cabeçalho e não numa aba porque a pergunta "de quem é este
                caso?" faz-se em todos os ecrãs dele. */}
            <div className="cm">
              <span className="cm-k">Vendedor</span>
              <select
                value={seller}
                disabled={pending}
                onChange={(event) => assign(event.target.value)}
                style={{
                  background: "var(--raise)",
                  border: "1px solid var(--line)",
                  borderRadius: 7,
                  color: "var(--txt)",
                  font: "inherit",
                  padding: "2px 6px",
                }}
              >
                <option value="">sem vendedor</option>
                {sellers.map((option) => (
                  <option key={option.email} value={option.email}>
                    {option.label}
                  </option>
                ))}
                {/* Um vendedor que já não está na lista continua a aparecer:
                    apagar-lhe o nome do caso seria reescrever o histórico. */}
                {seller && !sellers.some((s) => s.email === seller) && (
                  <option value={seller}>{detail.seller.label ?? seller}</option>
                )}
              </select>
            </div>
            <div className="cm">
              <span className="cm-k">Submetido</span>
              {dt(row.submittedAt)} ·{" "}
              <span style={{ color: "var(--warn)" }}>
                há {elapsedSince(row.submittedAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="case-actions">
          <Link className="btn btn-sm" href={`/pc/${row.token}`} target="_blank">
            Ver como cliente
          </Link>
          <BoWhatsappLink
            phone={row.clientPhone}
            name={row.clientName}
            reference={row.reference}
          />
          {canNotify && (
            <button
              className="btn btn-sm btn-primary"
              type="button"
              onClick={() => setNoticeOpen((open) => !open)}
            >
              Avisar cliente
            </button>
          )}
        </div>
      </div>

      {/*
        NT-06 · a falha de entrega, à vista de quem abre o caso.

        Uma linha no log não serve: quem abre um caso não vai ao log procurar se
        o último email chegou. Aparece aqui, e só se apaga quando alguém disser
        que tratou do assunto.
      */}
      {detail.notifyAlert.at && (
        <div
          className="note bad"
          style={{ margin: "12px 0 0", display: "flex", gap: 10, alignItems: "center" }}
        >
          <span style={{ flex: 1 }}>
            <b>Um aviso ao cliente não foi entregue</b> em {dt(detail.notifyAlert.at)}
            {detail.notifyAlert.reason ? ` — ${detail.notifyAlert.reason}` : ""}. Fale
            com ele por outro canal antes de contar com o email.
          </span>
          <button
            className="btn btn-sm"
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await boClearNotifyFlag(row.caseId)
                router.refresh()
              })
            }
          >
            Já tratei
          </button>
        </div>
      )}

      {/* NT-07 · o texto é escrito por uma pessoa. O sistema não inventa avisos
          de mudanças de horário — ver a decisão Q5 do backlog. */}
      {noticeOpen && (
        <div className="panel" style={{ margin: "12px 0 0" }}>
          <div className="panel-b">
            <div className="f s12">
              <label>Mensagem para o cliente · vai como está</label>
              <textarea
                style={{ minHeight: 72 }}
                placeholder="A TAP mudou o voo TP1553 de 06/09 das 14:20 para as 17:05. A ligação em Lisboa mantém-se com 2h10 de escala. Não é preciso fazer nada — se preferir outra data, diga-nos."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <span className="hint">
                Fica no registo com o seu nome e a hora, e aparece como alerta no
                link do cliente.
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
              <label className="chk" style={{ display: "flex", gap: 7 }}>
                <input
                  type="checkbox"
                  checked={byEmail}
                  onChange={(event) => setByEmail(event.target.checked)}
                />
                Email
              </label>
              <label className="chk" style={{ display: "flex", gap: 7 }}>
                <input
                  type="checkbox"
                  checked={byWhatsapp}
                  onChange={(event) => setByWhatsapp(event.target.checked)}
                />
                WhatsApp
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                className="btn btn-sm btn-primary"
                type="button"
                disabled={pending || message.trim().length < 10 || (!byEmail && !byWhatsapp)}
                onClick={sendNotice}
              >
                {pending ? "A enviar…" : "Enviar e registar"}
              </button>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setNoticeOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="note ok" style={{ margin: "12px 0 0" }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="note bad" style={{ margin: "12px 0 0" }}>
          {error}
        </div>
      )}

      <div className="tabs" role="tablist">
        {BO_TABS.map((entry) => {
          const count = counts[entry.id]
          const body = (
            <>
              {entry.label}
              {count ? <span className="n">{count}</span> : null}
            </>
          )

          /*
           * BO-08 · "o indicador da aba activa move-se para a aba certa em vez
           * de o cabeçalho ser removido". No compositor a aba certa é
           * "Propostas", e é para lá que ele aponta.
           */
          return onSelect ? (
            <button
              key={entry.id}
              className="tab"
              role="tab"
              type="button"
              aria-selected={active === entry.id}
              onClick={() => onSelect(entry.id)}
            >
              {body}
            </button>
          ) : (
            <Link
              key={entry.id}
              className="tab"
              role="tab"
              aria-selected={active === entry.id}
              href={`/admin/price-checker/${row.caseId}?aba=${entry.id}`}
            >
              {body}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
