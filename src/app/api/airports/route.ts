import { NextResponse } from "next/server"

import {
  AIRPORTS_SOURCE,
  AIRPORTS_VERSION,
  airportByIata,
  popularAirports,
  searchAirports,
} from "@/lib/airports"

export const runtime = "nodejs"

/**
 * GET /api/airports?q=sao%20vicente
 *
 * O único sítio por onde se pesquisa um aeroporto. O formulário do cliente, o
 * back-office e — quando existir — o bot do WhatsApp fazem a mesma pergunta a
 * esta rota, em vez de cada um levar a sua cópia da lista: uma lista duplicada
 * é uma lista que diverge, e uma lista no browser são 480 KB para escrever três
 * letras.
 *
 * `?iata=LIS,CDG` resolve códigos que já foram escolhidos — é o que devolve o
 * nome da cidade a um formulário que voltou de um rascunho e só guardou os
 * códigos.
 *
 * Público de propósito: são dados públicos, e é o formulário público que os
 * consome. Sem sessão, sem escrita, e com cache no browser e nas margens,
 * porque a resposta a "lis" é a mesma amanhã.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = (url.searchParams.get("q") ?? "").slice(0, 60)
  const codes = (url.searchParams.get("iata") ?? "").slice(0, 200)
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 8, 1),
    25
  )

  const results = codes
    ? codes
        .split(",")
        .map((code) => airportByIata(code))
        .filter(Boolean)
    : q.trim()
      ? searchAirports(q, limit)
      : popularAirports().slice(0, limit)

  return NextResponse.json(
    {
      version: AIRPORTS_VERSION,
      source: AIRPORTS_SOURCE,
      query: q,
      results,
    },
    {
      headers: {
        /* Um dia no browser, uma semana nas margens: o catálogo só muda quando
           alguém corre o gerador e faz deploy. */
        "cache-control": "public, max-age=86400, s-maxage=604800",
      },
    }
  )
}
