/**
 * O tamanho de um ficheiro como uma pessoa o lê.
 *
 * Num ficheiro próprio porque é usado dos dois lados: o servidor escreve-o no
 * registo do caso e o back-office mostra-o na lista de comprovativos. Estava em
 * `lib/pc/payment.ts`, que é só-servidor — importá-lo de um Client Component
 * arrastaria o cliente de administração do Supabase para o browser.
 */
export function humanSize(bytes: number): string {
  return bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
