/**
 * WeeFly · SEO-04 · B2G-08 · ler um ficheiro de marca: os nossos
 * (`/brand/...`, em `public/`) do disco, e qualquer outro (o bucket `brand`)
 * por HTTP. Nulo quando não existe ou não se lê.
 *
 * SÓ SERVIDOR.
 */

import { readFile } from "fs/promises"
import path from "path"

import { siteUrl } from "@/lib/site-url"

const PUBLIC_DIR = path.join(process.cwd(), "public")

export async function loadBrandAsset(url: string): Promise<Buffer | null> {
  const own = siteUrl()
  const local = url.startsWith("/") ? url : own && url.startsWith(`${own}/brand/`) ? url.slice(own.length) : null
  if (local) {
    const clean = path.normalize(local.split("?")[0]).replace(/^([/\\])+/, "")
    if (!clean.startsWith(`brand${path.sep}`) && !clean.startsWith("brand/")) return null
    try {
      return await readFile(path.join(PUBLIC_DIR, clean))
    } catch {
      return null
    }
  }
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}
