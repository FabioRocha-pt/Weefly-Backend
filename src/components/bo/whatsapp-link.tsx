/**
 * FB-05 · o contacto por WhatsApp, em qualquer ecrã de um caso.
 *
 * Estava escrito à mão na barra da ficha do caso e em mais lado nenhum — quem
 * estivesse a compor uma proposta e precisasse de perguntar uma coisa ao cliente
 * tinha de voltar atrás para chegar ao botão. O pedido é que o contacto exista
 * em todos os ecrãs do caso, e um botão repetido em dois sítios é uma mensagem
 * que se escreve de duas maneiras.
 *
 * A mensagem abre sempre com o primeiro nome e a referência do caso. É a
 * referência que faz o cliente saber de que viagem se trata quando tem dois
 * pedidos abertos, e é ela que permite reencontrar a conversa mais tarde.
 *
 * Sem número, o link abre o WhatsApp com o texto já escrito e deixa escolher o
 * contacto: um caso pode chegar sem telefone, e nesse caso é melhor abrir com a
 * mensagem pronta do que não abrir nada.
 */

export function boWhatsappHref({
  phone,
  name,
  reference,
}: {
  phone: string | null | undefined
  name: string | null | undefined
  reference: string
}): string {
  const firstName = (name ?? "").trim().split(/\s+/)[0]
  const greeting = firstName && firstName !== "—" ? `Olá ${firstName}, ` : "Olá, "
  const text = encodeURIComponent(`${greeting}sobre o pedido ${reference}:`)
  const digits = (phone ?? "").replace(/\D/g, "")
  return `https://wa.me/${digits}?text=${text}`
}

export function BoWhatsappLink({
  phone,
  name,
  reference,
  className = "btn btn-sm",
}: {
  phone: string | null | undefined
  name: string | null | undefined
  reference: string
  className?: string
}) {
  return (
    <a
      className={className}
      href={boWhatsappHref({ phone, name, reference })}
      target="_blank"
      rel="noreferrer"
    >
      WhatsApp
    </a>
  )
}
