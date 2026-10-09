/**
 * WeeFly · SEO-04 · do ícone de uma empresa, o conjunto inteiro.
 *
 * "A partir do ícone, o sistema gera sozinho: favicon.ico (16/32/48), PNG
 * 16/32, apple-touch-icon 180 (fundo branco ou cor da empresa), ícones 192 e
 * 512, ícone maskable (símbolo dentro de 60% do centro)."
 *
 * Os mesmos nomes e tamanhos dos ficheiros da WeeFly em `public/brand/weefly/`,
 * para que `api/brand/[file]` sirva uma pasta ou a outra sem saber de qual.
 *
 * O `.ico` leva os três PNG dentro (o formato aceita-o desde o Windows Vista, e
 * todos os browsers o lêem): não é preciso converter para BMP.
 *
 * SÓ SERVIDOR.
 */

import sharp from "sharp"

export interface GeneratedIcon {
  name: string
  contentType: string
  body: Buffer
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

function hexToRgb(hex: string | null | undefined): { r: number; g: number; b: number; alpha: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim())
  if (!m) return { r: 255, g: 255, b: 255, alpha: 1 }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 }
}

/** O ícone num quadrado de `size`, com o símbolo a ocupar `fill` do lado. */
async function square(
  source: Buffer,
  size: number,
  fill: number,
  background: { r: number; g: number; b: number; alpha: number }
): Promise<Buffer> {
  const inner = Math.max(1, Math.round(size * fill))
  const symbol = await sharp(source, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: symbol, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Um `.ico` com PNG dentro: cabeçalho, uma entrada por imagem, as imagens. */
export function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries: Buffer[] = []
  let offset = 6 + 16 * images.length
  for (const { size, png } of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

/** O ícone tem o tamanho mínimo pedido (512 × 512), ou é vetor. */
export async function checkIconSource(source: Buffer, isSvg: boolean): Promise<"ok" | "small" | "unreadable"> {
  try {
    const meta = await sharp(source).metadata()
    if (isSvg) return "ok"
    if (!meta.width || !meta.height) return "unreadable"
    return Math.min(meta.width, meta.height) >= 512 ? "ok" : "small"
  } catch {
    return "unreadable"
  }
}

export async function generateIconSet(source: Buffer, brandColor: string | null): Promise<GeneratedIcon[]> {
  const png = (name: string, body: Buffer): GeneratedIcon => ({ name, contentType: "image/png", body })
  const solid = hexToRgb(brandColor)

  const [p16, p32, p48, apple, i192, i512, maskable] = await Promise.all([
    square(source, 16, 1, TRANSPARENT),
    square(source, 32, 1, TRANSPARENT),
    square(source, 48, 1, TRANSPARENT),
    /* No iPhone o fundo transparente fica preto: cor da empresa, ou branco. */
    square(source, 180, 0.8, solid),
    square(source, 192, 0.9, TRANSPARENT),
    square(source, 512, 0.9, TRANSPARENT),
    /* Android corta o ícone em círculo: o símbolo fica nos 60% do centro. */
    square(source, 512, 0.6, solid),
  ])

  return [
    { name: "favicon.ico", contentType: "image/x-icon", body: buildIco([{ size: 16, png: p16 }, { size: 32, png: p32 }, { size: 48, png: p48 }]) },
    png("favicon-16x16.png", p16),
    png("favicon-32x32.png", p32),
    png("favicon-48x48.png", p48),
    png("apple-touch-icon.png", apple),
    png("icon-192.png", i192),
    png("icon-512.png", i512),
    png("icon-512-maskable.png", maskable),
  ]
}

/**
 * B2G-08 · B2G-24 · o ícone da aplicação do ministério, a partir do brasão
 * (quadrado, fundo transparente). O brasão sozinho só aqui: em listas e
 * seletores leva sempre o nome.
 */
export type CrestIconFile = "icon-192.png" | "icon-512.png" | "icon-512-maskable.png" | "apple-touch-icon.png" | "favicon-32x32.png"

export async function crestIcon(source: Buffer, file: CrestIconFile): Promise<Buffer> {
  const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
  switch (file) {
    case "icon-192.png":
      return square(source, 192, 0.9, TRANSPARENT)
    case "icon-512.png":
      return square(source, 512, 0.9, TRANSPARENT)
    case "icon-512-maskable.png":
      return square(source, 512, 0.6, WHITE)
    case "apple-touch-icon.png":
      return square(source, 180, 0.8, WHITE)
    case "favicon-32x32.png":
      return square(source, 32, 1, TRANSPARENT)
  }
}

/** SEO-04 · a imagem de partilha: 1200 × 630, JPG, até 1 MB. */
export async function checkShareImage(source: Buffer): Promise<"ok" | "size" | "unreadable"> {
  try {
    const meta = await sharp(source).metadata()
    if (!meta.width || !meta.height) return "unreadable"
    return meta.width === 1200 && meta.height === 630 ? "ok" : "size"
  } catch {
    return "unreadable"
  }
}
