"use client"

/**
 * BO-01 · o menu da conta, no avatar do topbar.
 *
 * Antes o nome no canto era texto: não abria nada e não havia forma visível de
 * sair da sessão — numa máquina partilhada, que é o caso de um balcão, sair é a
 * primeira coisa que tem de estar à mão.
 *
 * O que fecha o menu: um clique fora, o Escape, e escolher uma entrada. O foco
 * volta ao botão quando o Escape o fecha, porque quem navega por teclado ficava
 * de outra forma no fim da página.
 *
 * A saída é um `form` que chama a server action: termina a sessão do lado do
 * servidor (o cookie é apagado ali) e não apenas no browser. Um logout que só
 * limpa o estado local deixa a sessão de pé — quem voltasse atrás no histórico
 * continuava dentro.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

import { signOut } from "@/actions/auth"

export function BoUserMenu({
  label,
  email,
  initials,
  role,
}: {
  label: string
  email: string
  initials: string
  role: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      trigger.current?.focus()
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="who-menu" ref={box}>
      <button
        ref={trigger}
        type="button"
        className="who"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar">{initials}</span>
        <span className="who-name">{label}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4 6.5l4 3.5 4-3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="who-pop" role="menu">
          <div className="who-head">
            <b>{label}</b>
            <span className="mono">{email}</span>
            {/*
              C-20 · "não há referência a Pro nem a Admin na interface."

              Isto dizia "Administrador" ou "Gestor" — dois perfis a aparecer num
              serviço que só tem um. A `role` continua na base de dados e
              continua a decidir o que se pode fazer (reabrir um caso fechado é
              de administrador, ver `boReopenCase`); o que sai é a etiqueta, que
              anunciava uma estrutura de perfis que este serviço ainda não tem.

              "A estrutura permite acrescentar perfis mais tarde sem retrabalho"
              — e permite, porque nada disto mexe na coluna.
            */}
            <span className="who-role">WeeFly Concierge</span>
          </div>

          <Link className="who-item" role="menuitem" href="/inicio" onClick={() => setOpen(false)}>
            Perfil da conta
          </Link>

          {/*
            Os três lugares reservados que estavam aqui — avisos, idioma e
            desempenho — passaram a viver dentro das Definições. Eram três
            entradas desativadas num menu de cinco: quem o abria via mais coisas
            que não fazem nada do que coisas que fazem.
          */}
          <Link
            className="who-item"
            role="menuitem"
            href="/admin/price-checker/definicoes"
            onClick={() => setOpen(false)}
          >
            Definições
          </Link>

          <form action={signOut}>
            <button className="who-item danger" type="submit" role="menuitem">
              Terminar sessão
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
