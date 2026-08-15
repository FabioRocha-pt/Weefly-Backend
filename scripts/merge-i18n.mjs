#!/usr/bin/env node
/**
 * Aplica um patch aos três dicionários de uma vez.
 *
 *   node scripts/merge-i18n.mjs patch.json
 *
 * O patch tem a forma { pt: {...}, en: {...}, fr: {...} } e é fundido em
 * profundidade, para que acrescentar uma chave a `admin` não apague as
 * restantes. Existe porque editar três ficheiros à mão, em paralelo, é
 * exatamente como as traduções se desalinham.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const DICT_DIR = "src/i18n/dictionaries"

const merge = (base, patch) => {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      base[k] = merge(base[k] ?? {}, v)
    } else {
      base[k] = v
    }
  }
  return base
}

const patchFile = process.argv[2]
if (!patchFile) {
  console.error("uso: node scripts/merge-i18n.mjs <patch.json>")
  process.exit(1)
}

const patch = JSON.parse(readFileSync(patchFile, "utf8"))

for (const [locale, entries] of Object.entries(patch)) {
  const path = join(DICT_DIR, `${locale}.json`)
  const dict = JSON.parse(readFileSync(path, "utf8"))
  merge(dict, entries)
  writeFileSync(path, `${JSON.stringify(dict, null, 2)}\n`, "utf8")
  console.log(`${locale}.json actualizado`)
}
