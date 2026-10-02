/**
 * WeeFly · DOM-01 · existe uma empresa com este subdomínio?
 *
 * Para o middleware: `nada.weefly.africa` tem de dar a página "não encontrado"
 * com a marca WeeFly, e não um erro técnico nem o price checker da WeeFly. O
 * middleware corre no edge, sem o cliente do Supabase, por isso pergunta à API
 * REST com a service role (só o `id`, nada sai daqui). A resposta fica um
 * minuto em memória: o subdomínio de uma empresa não muda de minuto a minuto.
 *
 * Na dúvida (sem configuração, a API em baixo) responde que existe: o resto da
 * aplicação já trata uma empresa desconhecida como "não encontrado".
 *
 * Sem imports de servidor.
 */

const TTL_MS = 60_000
const cache = new Map<string, { exists: boolean; at: number }>()

export async function partnerExists(slug: string): Promise<boolean> {
  const hit = cache.get(slug)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.exists

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  if (!url || !key) return true

  try {
    const res = await fetch(
      `${url}/rest/v1/partners?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    )
    if (!res.ok) return true
    const rows = (await res.json()) as unknown[]
    const exists = Array.isArray(rows) && rows.length > 0
    cache.set(slug, { exists, at: Date.now() })
    return exists
  } catch {
    return true
  }
}
