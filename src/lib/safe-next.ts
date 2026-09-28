/**
 * PRO-01 · para onde voltar depois do login.
 *
 * Quem abre um link directo do back-office sem sessão vai para o login e, depois
 * de entrar, volta ao sítio onde queria ir. O destino vem do URL, por isso só se
 * aceitam caminhos locais: `/admin/price-checker/abc?tab=pay` sim,
 * `https://outro.site` e `//outro.site` não — seriam um redireccionamento aberto
 * com a cara da WeeFly.
 *
 * Sem dependências de servidor: usado no middleware (edge), nas actions e no
 * callback.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null
  }
  /* As páginas de autenticação não são destino: voltar ao login depois do
     login é um ciclo. */
  const path = value.split(/[?#]/)[0]
  if (["/login", "/registro", "/confirmar-email", "/link-invalido"].includes(path)) {
    return null
  }
  return value
}
