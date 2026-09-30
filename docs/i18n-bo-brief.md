# I18N-01 · como passar o back-office para o dicionário (PT · EN)

Regras para quem extrai os textos. Uma área por pessoa; cada área tem o seu
ficheiro de dicionário e não toca nos ficheiros das outras.

## O objectivo

"Todos os textos do backoffice vêm de um dicionário, nenhum escrito no código."
O agente escolhe PT ou EN nas Definições; por omissão, PT.

## A regra que não se quebra

**A língua do back-office só muda o que o agente vê. Nunca o que o cliente
recebe.** Emails, WhatsApp, o link `/pc` e o PDF do bilhete usam a língua do
caso (`localeForClient(lead.locale)` / o tradutor do caso). Se um texto vai
para o cliente — por exemplo a mensagem de WhatsApp que o construtor de links
prepara na língua do link, ou o corpo de um email — **não o mexas**. Na dúvida,
deixa e escreve no relatório.

## Onde ficam as frases

- `src/i18n/bo/parts/<area>.pt.json` e `<area>.en.json`, sempre debaixo de
  `{ "bo": { "<area>": { ... } } }`. As chaves ficam `bo.<area>.<grupo>.<nome>`.
- PT é o texto que já está no código, **palavra por palavra** (acentos e
  pontuação incluídos). EN é uma tradução natural, do mesmo registo.
- Marcadores: `{nome}` (ex.: `"Esteve {tempo} sem dono"` → `t("bo.x.y", { tempo })`).
- Plurais: `chave_one` / `chave_other`, e passa-se `count`.
- As chaves `admin.*` que o compositor já usa (no dicionário público) ficam onde
  estão — já têm EN.

## Como usar

- Componente de cliente: `const t = useT()` (`@/i18n/provider`). O provider já
  está nos layouts do back-office e do WeeFly Pro.
- Server Component / página: `const { t, locale } = await getBoI18n()`
  (`@/i18n/bo-server`). **Não** usar `getI18n()` em ecrãs do back-office: esse é
  o do site público (cookie).
- Server action que devolve uma frase ao ecrã: traduzir no servidor com
  `getBoI18n()` e devolver a frase já traduzida.
- Datas e números na língua do agente: `LOCALE_TAGS[locale]` (`@/i18n/config`)
  no `Intl.DateTimeFormat` / `toLocaleString`, em vez de `"pt-PT"` fixo.
  No cliente, `const { locale } = useI18n()`.
- Mapas de etiquetas em `src/lib` (ex.: `BO_STATE_LABEL`, `CLOSED_REASON_LABEL_PT`,
  `METHOD_LABEL_PT`): **não os apagues** (são usados por emails e registos). No
  ecrã, troca `MAPA[código]` por `t(\`bo.<area>.<grupo>.${código}\`)` e põe as
  entradas no teu dicionário.
- Acontecimentos do caso (`case_events`): o título guardado está em português.
  Mostrar com `translateOr(t, \`bo.events.${kind}\`, título)` (`@/i18n/translate`).

## O que não fazer

- Não mudar comportamento, estrutura, nomes de props nem estilos. Só texto.
- Não tocar em ficheiros fora da tua lista.
- Não fazer commits.
- Comentários no código ficam como estão (em português).

## No fim

1. `npm run -s i18n:check` — tem de passar (PT e EN com as mesmas chaves, e
   nenhuma chave usada que não exista).
2. `npx tsc --noEmit -p .` — sem erros **nos teus ficheiros** (outros agentes
   estão a trabalhar ao mesmo tempo; ignora erros de ficheiros que não são teus).
3. Relatório curto: ficheiros tocados, nº de chaves, e qualquer texto que
   deixaste de propósito (e porquê).
