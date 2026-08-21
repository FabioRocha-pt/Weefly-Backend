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
            <span className="who-role">{role === "admin" ? "Administrador" : "Gestor"}</span>
          </div>

          <Link className="who-item" role="menuitem" href="/inicio" onClick={() => setOpen(false)}>
            Perfil da conta
          </Link>

          {/*
            Os três lugares reservados que o pedido pede para deixar espaço:
            preferências de avisos, idioma e o desempenho do próprio vendedor.
            Ficam visíveis e desativados em vez de escondidos — é o que evita
            que alguém os peça outra vez por não saber que estão a caminho.
          */}
          <button className="who-item" type="button" role="menuitem" disabled>
            Preferências de avisos
            <span className="soon">em breve</span>
          </button>
          <button className="who-item" type="button" role="menuitem" disabled>
            Idioma do back-office
            <span className="soon">em breve</span>
          </button>
          <button className="who-item" type="button" role="menuitem" disabled>
            O meu desempenho
            <span className="soon">em breve</span>
          </button>

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
