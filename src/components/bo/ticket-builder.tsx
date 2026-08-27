"use client"

/**
 * PC-B · o construtor de bilhete, na emissão.
 *
 * É a outra metade do compositor. A proposta que o cliente leu tem só o que ele
 * precisava para decidir — rota, horas, escalas, bagagem, preço. Tudo o que
 * serve para *emitir* e não para escolher vive aqui: o nome da tarifa, o
 * equipamento, a classe de reserva, os terminais, e a letra pequena das
 * políticas.
 *
 * Está no separador da Emissão porque é aí que é preciso, e não antes. Quem
 * compõe uma proposta às nove da manhã não sabe em que terminal o voo vai
 * parar, e obrigá-lo a escrever isso para poder enviar um preço era o que
 * fazia do compositor um formulário de trinta campos.
 *
 * O que se escreve aqui **não** muda o que o cliente já leu. A action que
 * grava (`saveTicketDetails`) só aceita estes campos, e só na opção escolhida.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { saveTicketDetails } from "@/actions/proposals"
import type { Offer } from "@/lib/proposal-math"
import { legsOf, timeOf } from "@/lib/proposal-math"
import { Field, Input, Section, inputClass } from "@/components/bo/composer-bits"

interface SegmentRow {
  id: string
  label: string
  equipment: string
  booking_class: string
  terminal_from: string
  terminal_to: string
}

export function BoTicketBuilder({
  caseId,
  offer,
  issued,
}: {
  caseId: string
  /** A opção escolhida. Sem escolha não há bilhete a construir. */
  offer: Offer | null
  /** Já emitido: os campos passam a leitura, porque mudá-los é uma reemissão. */
  issued: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fareName, setFareName] = useState(offer?.fare_name ?? "")
  const [changePolicy, setChangePolicy] = useState(offer?.change_policy ?? "")
  const [refundPolicy, setRefundPolicy] = useState(offer?.refund_policy ?? "")
  const [seatPolicy, setSeatPolicy] = useState(offer?.seat_policy ?? "")
  const [documents, setDocuments] = useState(offer?.documents ?? "")
  const [segments, setSegments] = useState<SegmentRow[]>(() =>
    rowsOf(offer)
  )

  if (!offer) {
    return (
      <section className="panel">
        <div className="panel-h">
          <h3>Construtor de bilhete</h3>
        </div>
        <div className="panel-b">
          <p className="note">
            O cliente ainda não escolheu uma opção. Os detalhes de emissão
            pertencem à opção escolhida, e por isso só aparecem depois dela.
          </p>
        </div>
      </section>
    )
  }

  const patch = (id: string, changes: Partial<SegmentRow>) =>
    setSegments((current) =>
      current.map((row) => (row.id === id ? { ...row, ...changes } : row))
    )

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveTicketDetails(caseId, offer!.id, {
        fare_name: fareName,
        change_policy: changePolicy,
        refund_policy: refundPolicy,
        seat_policy: seatPolicy,
        documents,
        segments: segments.map((s) => ({
          id: s.id,
          equipment: s.equipment,
          booking_class: s.booking_class,
          terminal_from: s.terminal_from,
          terminal_to: s.terminal_to,
        })),
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <h3>Construtor de bilhete</h3>
        {saved && !pending && (
          <span
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-adm-ok"
            style={{ marginLeft: "auto" }}
          >
            <Check className="h-3 w-3" /> gravado
          </span>
        )}
      </div>
      <div className="panel-b">
        <p className="note" style={{ marginBottom: 14 }}>
          O que está aqui não muda a proposta que o cliente leu — nem o preço,
          nem as horas, nem a rota. São os campos que o bilhete precisa e a
          proposta não precisava.
        </p>

        <fieldset disabled={issued || pending} className="space-y-5">
          <Section title="Tarifa">
            <div className="grid grid-cols-12 gap-2.5">
              <Field label="Nome da tarifa" span={4}>
                <Input
                  value={fareName}
                  onChange={setFareName}
                  placeholder="Economy Smart"
                />
              </Field>
              <Field label="Alterações" span={4}>
                <Input
                  value={changePolicy}
                  onChange={setChangePolicy}
                  placeholder="Alteração com taxa de 60 €"
                />
              </Field>
              <Field
                label="Reembolso"
                span={4}
                hint="A letra pequena. Se é reembolsável ou não, decide-se na proposta."
              >
                <Input
                  value={refundPolicy}
                  onChange={setRefundPolicy}
                  placeholder="Reembolso até 24 h antes, com taxa"
                />
              </Field>
              <Field label="Lugares" span={4}>
                <Input
                  value={seatPolicy}
                  onChange={setSeatPolicy}
                  placeholder="Marcação de lugar incluída"
                />
              </Field>
              <Field label="Documentos" span={8}>
                <Input
                  value={documents}
                  onChange={setDocuments}
                  placeholder="Passaporte válido 6 meses além do regresso"
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Trechos"
            aside={`${segments.length} ${segments.length === 1 ? "trecho" : "trechos"}`}
          >
            {segments.length === 0 ? (
              <p className="note">
                Esta opção não tem trechos guardados. Sem eles não há terminais
                nem classe de reserva a preencher.
              </p>
            ) : (
              segments.map((row) => (
                <div
                  key={row.id}
                  className="mb-2.5 rounded-[10px] border border-adm-line bg-adm-panel-2 p-3"
                >
                  <div className="mb-2.5 text-xs font-bold text-adm-txt-2">
                    {row.label}
                  </div>
                  <div className="grid grid-cols-12 gap-2.5">
                    <Field label="Equipamento" span={6}>
                      <Input
                        value={row.equipment}
                        onChange={(v) => patch(row.id, { equipment: v })}
                        placeholder="Airbus A320neo"
                      />
                    </Field>
                    <Field label="Classe de reserva" span={2}>
                      <Input
                        mono
                        maxLength={2}
                        value={row.booking_class}
                        onChange={(v) =>
                          patch(row.id, { booking_class: v.toUpperCase() })
                        }
                        placeholder="T"
                      />
                    </Field>
                    <Field label="Terminal de partida" span={2}>
                      <Input
                        value={row.terminal_from}
                        onChange={(v) => patch(row.id, { terminal_from: v })}
                        placeholder="1"
                      />
                    </Field>
                    <Field label="Terminal de chegada" span={2}>
                      <Input
                        value={row.terminal_to}
                        onChange={(v) => patch(row.id, { terminal_to: v })}
                        placeholder="2"
                      />
                    </Field>
                  </div>
                </div>
              ))
            )}
          </Section>
        </fieldset>

        {error && (
          <p
            className="note bad"
            style={{ marginTop: 12 }}
          >
            {error}
          </p>
        )}

        {issued ? (
          <p className="note" style={{ marginTop: 12 }}>
            O caso já está emitido. Mudar estes campos agora não muda o bilhete
            que a companhia emitiu — isso é uma reemissão, e passa por ela.
          </p>
        ) : (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className={cn("btn btn-primary")}
            style={{ marginTop: 14 }}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar detalhes do bilhete
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * Os trechos, com um rótulo que uma pessoa reconhece.
 *
 * O id vem da base e é por ele que a gravação encontra a linha — nada aqui
 * apaga nem reinsere trechos de uma proposta publicada.
 */
function rowsOf(offer: Offer | null): SegmentRow[] {
  if (!offer) return []
  const { ida, volta } = legsOf(offer)
  const label = (s: (typeof ida)[number], leg: string) =>
    `${leg} · ${s.origin ?? "—"} ${timeOf(s.depart_at)} → ${s.destination ?? "—"} ${timeOf(s.arrive_at)}`

  return [
    ...ida.map((s) => ({ s, leg: "Ida" })),
    ...volta.map((s) => ({ s, leg: "Volta" })),
  ].map(({ s, leg }) => ({
    id: s.id,
    label: label(s, leg),
    equipment: s.equipment ?? "",
    booking_class: s.booking_class ?? "",
    terminal_from: s.terminal_from ?? "",
    terminal_to: s.terminal_to ?? "",
  }))
}
