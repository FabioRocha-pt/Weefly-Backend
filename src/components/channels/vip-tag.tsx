import Link from "next/link"

/**
 * FILA-01 · E6 · a etiqueta VIP.
 *
 * "Os pedidos VIP não mudam de lugar na fila: levam uma marca, para a equipa
 * perceber logo que é um cliente VIP." A etiqueta tem o nome do cliente e abre
 * a ficha dele. A mesma em todo o lado: na fila do Concierge, nas filas dos
 * menus, no concierge do master e na ficha do caso.
 *
 * Sem estado e sem dicionário ("VIP" é o nome do canal, igual nas três
 * línguas): serve a componentes de servidor e de cliente.
 */

/** A ficha do cliente VIP, para quem a pode abrir. */
export function vipClientHref(input: {
  vipClientId: string | null
  vipName?: string | null
  /** A fila do master: a ficha de um VIP é da empresa dele, e o master vê a
      lista de todas (`/gestao/vip`), filtrada pela empresa e pelo nome. */
  master?: boolean
  partnerId?: string | null
}): string | null {
  if (!input.vipClientId) return null
  if (input.master) {
    const params = new URLSearchParams()
    if (input.partnerId) params.set("parceiro", input.partnerId)
    if (input.vipName) params.set("q", input.vipName)
    const qs = params.toString()
    return qs ? `/gestao/vip?${qs}` : "/gestao/vip"
  }
  return `/agente/vip/${input.vipClientId}`
}

export function VipTag({
  name,
  href,
  title,
}: {
  name?: string | null
  href?: string | null
  title?: string
}) {
  const style = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    padding: "2px 9px 2px 3px",
    borderRadius: 999,
    fontSize: 12,
    lineHeight: "18px",
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap",
    background: "#fef3c7",
    color: "#78350f",
    border: "1px solid #f59e0b",
  } as const
  const body = (
    <>
      <span
        style={{
          padding: "0 6px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.06em",
          background: "#b45309",
          color: "#fff",
        }}
      >
        VIP
      </span>
      {name && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>}
    </>
  )
  return href ? (
    <Link href={href} style={style} title={title}>
      {body}
    </Link>
  ) : (
    <span style={style} title={title}>
      {body}
    </span>
  )
}
