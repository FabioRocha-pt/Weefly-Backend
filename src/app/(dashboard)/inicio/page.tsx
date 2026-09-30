import { redirect } from "next/navigation"

/**
 * PRO-02 · a entrada do WeeFly Pro passou a ser a escolha de módulo. O
 * `/inicio` era a casa do Fornecedor, que está bloqueado (PRO-03); fica como
 * endereço, porque há links e marcadores que apontam para ele.
 */
export default function InicioPage() {
  redirect("/entrar")
}
