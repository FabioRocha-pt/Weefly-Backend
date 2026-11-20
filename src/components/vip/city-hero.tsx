"use client"

/**
 * IMG-01 · a imagem da cidade, por trás da saudação.
 *
 *   · ao abrir, a da cidade de partida; sem cidade escolhida, a da cidade da
 *     empresa (`fallbackCode` — a Praia na WeeFly Global);
 *   · quando o destino é escolhido, passa para a do destino, com uma
 *     transição suave (as duas camadas cruzam-se);
 *   · uma cidade sem imagem mostra um fundo nas cores da marca com o nome da
 *     cidade — nunca um espaço vazio. É também o que se vê enquanto a
 *     resposta não chega, e numa base sem a biblioteca (migração 0044);
 *   · o que vai por cima (`children`: a saudação, os títulos) fica sempre
 *     legível: há uma camada escura em degradé entre a imagem e o texto;
 *   · a imagem pequena primeiro (o borrão de 32 px vem na própria resposta, a
 *     de 800 px a seguir); a grande só depois, e só num ecrã que a aproveite.
 *     Nada disto atrasa o formulário: a imagem é decoração carregada depois.
 *
 * `code` é um código de aeroporto ou de cidade — CDG e ORY dão Paris, quem
 * resolve é `/api/city-image/[code]`.
 *
 * As cores vêm das variáveis da marca do `/pc` (`--ember`, `--ember-dk`,
 * `--navy`), que o `PcBrandProvider` troca pelas da empresa.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

export interface CityHeroInfo {
  code: string
  city: string | null
  alt: string | null
  small: string | null
  large: string | null
  placeholder: string | null
}

const CODE = /^[A-Z]{3}$/
const FADE_MS = 600

/* Uma resposta por código e por visita: voltar de Lisboa para Paris não
   pergunta outra vez. */
const known = new Map<string, Promise<CityHeroInfo | null>>()

function lookup(code: string): Promise<CityHeroInfo | null> {
  let pending = known.get(code)
  if (!pending) {
    pending = fetch(`/api/city-image/${code}`)
      .then((r) => (r.ok ? (r.json() as Promise<CityHeroInfo>) : null))
      .catch(() => null)
    known.set(code, pending)
    /* Uma falha de rede não fica guardada para sempre. */
    void pending.then((info) => {
      if (!info) known.delete(code)
    })
  }
  return pending
}

const clean = (code: string | null | undefined): string | null => {
  const value = (code ?? "").trim().toUpperCase()
  return CODE.test(value) ? value : null
}

const CSS = `
.cityhero{position:relative;overflow:hidden;width:100%;max-width:100%;min-height:176px;aspect-ratio:16/9;max-height:264px;border-radius:var(--r,14px);color:#fff;isolation:isolate;
  background:linear-gradient(135deg,var(--ember,#EE5128) 0%,var(--ember-dk,#CE3F19) 46%,var(--navy,#1E2532) 100%)}
.cityhero-layer{position:absolute;inset:0;opacity:0;transition:opacity ${FADE_MS}ms ease;background-size:cover;background-position:center}
.cityhero-layer.on{opacity:1}
.cityhero-brand{background:linear-gradient(135deg,var(--ember,#EE5128) 0%,var(--ember-dk,#CE3F19) 46%,var(--navy,#1E2532) 100%)}
.cityhero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;display:block;opacity:0;transition:opacity 400ms ease}
.cityhero-img.in{opacity:1}
.cityhero-name{position:absolute;top:12px;right:14px;left:14px;text-align:right;font-weight:800;letter-spacing:-.01em;line-height:1.05;font-size:clamp(24px,8.5vw,40px);color:rgba(255,255,255,.34);overflow-wrap:anywhere;pointer-events:none}
.cityhero-shade{position:absolute;inset:0;z-index:1;pointer-events:none;
  background:linear-gradient(180deg,rgba(10,14,22,.10) 0%,rgba(10,14,22,.22) 38%,rgba(10,14,22,.78) 100%)}
.cityhero-body{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:14px 16px 16px;min-width:0;overflow-wrap:anywhere;text-shadow:0 1px 2px rgba(0,0,0,.45)}
.cityhero-body h1,.cityhero-body h2,.cityhero-body p{color:#fff;margin:0}
@media (prefers-reduced-motion:reduce){.cityhero-layer,.cityhero-img{transition:none}}
`

interface Layer {
  key: number
  info: CityHeroInfo | null
}

export function CityHero({
  code,
  fallbackCode = "RAI",
  initial = null,
  children,
  className,
  style,
}: {
  /** Aeroporto ou cidade (IATA). Vazio: usa-se `fallbackCode`. */
  code?: string | null
  /** A cidade da empresa, para quando ainda não há cidade escolhida. */
  fallbackCode?: string | null
  /** A resposta já resolvida no servidor para o primeiro código, se houver. */
  initial?: CityHeroInfo | null
  /** A saudação e os títulos: ficam por cima, sobre o degradé escuro. */
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const wanted = clean(code) ?? clean(fallbackCode)
  const serial = useRef(0)
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: 0, info: initial }])
  const [visible, setVisible] = useState(0)
  const shownFor = useRef<string | null>(initial ? wanted : null)

  useEffect(() => {
    if (!wanted || shownFor.current === wanted) return
    let alive = true
    void lookup(wanted).then((info) => {
      if (!alive) return
      shownFor.current = wanted
      const next: Layer = {
        key: ++serial.current,
        info: info ?? { code: wanted, city: null, alt: null, small: null, large: null, placeholder: null },
      }
      /* A nova entra por cima da anterior; a anterior sai depois da transição. */
      setLayers((current) => [...current.slice(-1), next])
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (alive) setVisible(next.key)
        })
      })
      window.setTimeout(() => {
        if (alive) setLayers((current) => current.filter((l) => l.key >= next.key))
      }, FADE_MS + 80)
    })
    return () => {
      alive = false
    }
  }, [wanted])

  return (
    <section className={`cityhero${className ? ` ${className}` : ""}`} style={style}>
      <style>{CSS}</style>
      {layers.map((layer) => (
        <HeroLayer key={layer.key} info={layer.info} on={layer.key === visible} />
      ))}
      <div className="cityhero-shade" aria-hidden />
      {children != null && <div className="cityhero-body">{children}</div>}
    </section>
  )
}

function HeroLayer({ info, on }: { info: CityHeroInfo | null; on: boolean }) {
  const [src, setSrc] = useState<string | null>(info?.small ?? null)
  const [loaded, setLoaded] = useState(false)
  const img = useRef<HTMLImageElement>(null)

  /* Uma imagem que já estava em cache não dispara `onLoad` depois de hidratar. */
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) setLoaded(true)
  }, [])

  /* A grande só depois de a pequena estar à vista, e só onde faz diferença:
     num telemóvel de 390 px a 2x, os 800 px da pequena chegam. */
  useEffect(() => {
    if (!loaded || !info?.large || src === info.large) return
    const box = img.current?.clientWidth ?? 0
    const needed = box * (window.devicePixelRatio || 1)
    if (needed <= 820) return
    const big = new Image()
    big.onload = () => setSrc(info.large)
    big.src = info.large
    return () => {
      big.onload = null
    }
  }, [loaded, info, src])

  if (!info?.small || !src) {
    return (
      <div className={`cityhero-layer cityhero-brand${on ? " on" : ""}`}>
        {info?.city && <div className="cityhero-name">{info.city}</div>}
      </div>
    )
  }

  return (
    <div
      className={`cityhero-layer${on ? " on" : ""}`}
      style={info.placeholder ? { backgroundImage: `url("${info.placeholder}")` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        className={`cityhero-img${loaded ? " in" : ""}`}
        src={src}
        alt={info.alt || info.city || ""}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setSrc(null)}
      />
    </div>
  )
}
