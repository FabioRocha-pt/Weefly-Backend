/**
 * WeeFly · VIP-01 · o endereço novo de um cliente VIP: `/pc/<nome>-<código>`.
 *
 * "O código é curto, gerado pelo sistema, único, e não muda. Distingue-se dos
 * códigos dos pedidos, que têm 32 caracteres."
 *
 *   · o **código** (`vip_clients.code`, 0043) é o que identifica o cliente:
 *     oito caracteres minúsculos, sem letras que se confundem;
 *   · o **nome** é a parte que se lê (`joao-silva`), tirada do nome do
 *     cliente. Não identifica nada: quando o nome é corrigido, o link antigo
 *     continua a abrir, porque só o código é lido.
 *
 * `/pc/<token>` continua a ser o pedido de um cliente. Os dois vivem no mesmo
 * caminho e distinguem-se pela forma: um token de pedido tem 32 caracteres de
 * base64url (maiúsculas, `_`); o endereço de um VIP é todo em minúsculas e
 * acaba em `-<código>`. Quem decide de vez é a base de dados
 * (`resolveVipHandle`).
 *
 * Sem imports de servidor: o back-office monta o link no browser.
 */

/** O código: 6 a 16 caracteres, minúsculas e algarismos (a base gera 8). */
export const VIP_CODE = /^[a-z0-9]{6,16}$/

/** A forma de um endereço de VIP: palavras em minúsculas, e o código no fim. */
const VIP_HANDLE = /^(?:[a-z0-9]+-)*[a-z0-9]{6,16}$/

/** "João da Silva" → "joao-da-silva". Vazio quando o nome não tem letras latinas. */
export function vipSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
}

/** `<nome>-<código>`; só o código quando o nome não dá palavra nenhuma. */
export function vipHandle(vip: { name: string; code: string }): string {
  const slug = vipSlug(vip.name)
  return slug ? `${slug}-${vip.code}` : vip.code
}

/** O caminho da app do cliente. */
export function vipPath(vip: { name: string; code: string }): string {
  return `/pc/${vipHandle(vip)}`
}

/**
 * O código dentro de um endereço, ou `null` se o endereço não tem a forma de
 * um VIP (e é, portanto, o token de um pedido ou lixo).
 */
export function vipCodeOfHandle(handle: string): string | null {
  if (!handle || handle.length > 90 || !VIP_HANDLE.test(handle)) return null
  const code = handle.slice(handle.lastIndexOf("-") + 1)
  return VIP_CODE.test(code) ? code : null
}

/** O primeiro nome, para a saudação ("Olá, João"). */
export function vipFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ""
}

// ── os dados mascarados (VIP-01 · APP-04) ────────────────────────────────────

/** `+238 991 23 47` → `+238 ••• •• 47`. */
export function maskPhone(phone: string | null | undefined): string {
  const raw = (phone ?? "").replace(/[^\d+]/g, "")
  if (!raw) return ""
  const digits = raw.replace(/\D/g, "")
  if (digits.length < 5) return "•••"
  const dial = raw.startsWith("+") ? `+${digits.slice(0, Math.min(3, digits.length - 4))}` : ""
  return `${dial ? `${dial} ` : ""}••• •• ${digits.slice(-2)}`
}

/** `joao.silva@gmail.com` → `jo•••@gmail.com`. */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim()
  const at = value.lastIndexOf("@")
  if (at < 1) return value ? "•••" : ""
  return `${value.slice(0, Math.min(2, at))}•••${value.slice(at)}`
}

/** `PA1234123` → `•••••• 123`. */
export function maskPassport(number: string | null | undefined): string {
  const value = (number ?? "").trim()
  if (!value) return ""
  return `•••••• ${value.slice(-3)}`
}

// ── a cidade da empresa (IMG-01) ─────────────────────────────────────────────

/**
 * "Sem cidade escolhida, a da cidade da empresa: a Praia na WeeFly Global."
 * O aeroporto principal do país de cada empresa (os 20 países dos parceiros);
 * um país fora da lista fica com a Praia.
 */
const HOME_CITY: Record<string, string> = {
  CV: "RAI", AO: "LAD", CM: "DLA", CI: "ABJ", GH: "ACC", GN: "CKY", GW: "OXB",
  ML: "BKO", MA: "CMN", MZ: "MPM", NG: "LOS", KE: "NBO", CD: "FIH", SN: "DSS",
  SL: "FNA", ST: "TMS", TG: "LFW", TN: "TUN", ZM: "LUN", ZA: "JNB",
}

export function vipHomeCity(country: string | null | undefined): string {
  return HOME_CITY[(country ?? "").toUpperCase()] ?? "RAI"
}
