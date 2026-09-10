# WeeFly Concierge — Sprint 3.1 · Interface copy

| | |
|---|---|
| **Scope** | Replacing customer-facing text. **Nothing else.** |
| **Date** | 10 September 2026 |
| **Screens** | 14 existing (screens 1–8, 10–14) |
| **Source** | Client deck `CHATBOT_SPRINT_4.pptx` + state screenshots |
| **Depends on** | `T-08`, the `/pc` half (no dictionary today) |

## What this sprint is

Replace strings and create the matching translation keys. No change to flow, steps, validation, state, colour, layout or behaviour. If an item requires creating, moving or removing an element, **it is not in this sprint** — see Annex A.

Two reasons these come together:

1. Screens 1–3 live in `/pc`, where the text is still written in English inside the code and **has no dictionary**. Rewriting the copy and creating the keys is the same pass through the same files. Done separately, it is done twice.
2. `T-08` is only half closed for exactly that reason.

## Rules across all screens

1. **Sentence case.** Nothing in all caps, not titles and not buttons. If these screens carry `text-transform: uppercase` in the CSS, remove it — this is the one CSS exception in this sprint, because otherwise the new text still renders in capitals.
2. **The customer's name as they typed it.** `Shutsha`, not `SHUTSHA`. No `toUpperCase()` on the name.
3. **Two false friends go**, and they appear on several screens: `treatment` (from the Portuguese *tratamento*) and `proposition` (from *proposta*). Neither means this in English. → `review` / `option`.
4. **Interpolation, not concatenation.** Every value as `{name}`, `{ref}`, `{phone}`, `{email}`, `{count}`, `{time}`. Never split a sentence into two strings with the value in between — it breaks in FR and in any language added later.
5. **A placeholder never repeats its label** or the question above it.
6. **Three dictionaries in step.** PT is canonical. EN below. **FR needs a native pass before it ships** — do not approximate it; this text carries prices and consent wording. The build check that fails when one dictionary falls behind must cover the new keys too.

## Key convention

- `pc.*` — public request form, before a case exists (screens 1–3)
- `cx.*` — customer link screens, `/pc/{token}` (screens 4–14)

The names below are a proposal; what matters is that they are stable, because the emails will reuse these same keys in a later sprint.

## Screen map

| Screen | View | Deck slide |
|---|---|---|
| 1 | Trip form | 3 |
| 2 | Contacts | 4 |
| 3 | Confirm request | 5 |
| 4 | Request received | 6 · image 1 |
| 5 | Offers ready | 7 |
| 6 | Option cards | 8, 9 |
| 7 | Chosen option | 10 |
| 8 | Passengers | 11 |
| 10 | Payment page | 14 |
| 11 | Payment processing | 15 · image 2 |
| 12 | Payment confirmed | 16 |
| 13 | Issuing | 17 |
| 14 | Tickets issued | 18 |

Screens 9 and 15 in the design do not exist in code. Their strings are in Annex B.

---

# Screen 1 · Trip form

`/pc`

| Key | Current (in code) | PT | EN |
|---|---|---|---|
| `pc.steps.1` | `1. Trip` | `1. Viagem` | `1. Trip` |
| `pc.steps.2` | `2. Contact` | `2. Contactos` | `2. Contact` |
| `pc.steps.3` | `3. Request sent` | `3. Confirmar` | `3. Confirm` |
| `pc.trip.title` | `FIND THE BEST FARE FOR YOUR FLIGHT` | `Encontra o melhor preço para o teu voo` | `Find the best price for your flight` |
| `pc.trip.type.round` | `Round trip` | `Ida e volta` | `Round trip` |
| `pc.trip.type.oneway` | `One way` | `Só ida` | `One way` |
| `pc.trip.type.multi` | `Multi-city` | `Multi-destino` | `Multi-city` |
| `pc.trip.pax` | `1` | `{count} passageiro` / `{count} passageiros` | `{count} passenger` / `{count} passengers` |
| `pc.trip.cabin.economy` | `Economy` | `Económica` | `Economy` |
| `pc.trip.cabin.business` | `Business` | `Executiva` | `Business` |
| `pc.trip.bags.none` | `No checked bag` | `Sem bagagem de porão` | `No checked bag` |
| `pc.trip.from.label` | `From` | `De` | `From` |
| `pc.trip.from.placeholder` | `Where from?` | `De onde partes?` | `Where are you leaving from?` |
| `pc.trip.to.label` | `To` | `Para` | `To` |
| `pc.trip.to.placeholder` | `Where to?` | `Para onde vais?` | `Where are you going?` |
| `pc.trip.departure` | `DEPARTURE` | `Partida` | `Departure` |
| `pc.trip.return` | `RETURN` | `Regresso` | `Return` |
| `pc.trip.submit` | `Continue` | `Continuar` | `Continue` |

`pc.trip.pax` needs plural forms. If the i18n library has no plural rules configured, configure them — it beats shipping `1 passenger(s)`.

# Screen 2 · Contacts

`/pc`

| Key | Current | PT | EN |
|---|---|---|---|
| `pc.contact.title` | `ENTER YOUR CONTACTS` | `Como te contactamos` | `How we reach you` |
| `pc.contact.name.label` | `Full name` | `Nome completo` | `Full name` |
| `pc.contact.name.hint` | — | `Como no passaporte` | `As in the passport` |
| `pc.contact.phone.label` | `Phone · ideally your WhatsApp number` | `Telefone (WhatsApp)` | `Phone (WhatsApp)` |
| `pc.contact.phone.hint` | `We use this number to send your options and to talk to you. We will save it as +2389592388.` | `Enviamos as opções para este número. Guardamos como {phone}.` | `We send your options to this number. We'll save it as {phone}.` |
| `pc.contact.email.label` | `Email` | `Email` | `Email` |
| `pc.contact.consent` | `I authorise WeeFly to contact me and to process my data for the purposes of this travel request, under the privacy policy.` | `Autorizo a WeeFly a contactar-me e a tratar os meus dados para este pedido, segundo a política de privacidade.` | `I authorise WeeFly to contact me and to process my data for this request, under the privacy policy.` |
| `pc.contact.submit` | `Review my request` | `Rever pedido` | `Review request` |

**Remove from the screen:** `We record the date, time and device of this authorisation.`

The date, time and device record **stays exactly as it is** in the backend. It simply stops being written to the customer. It is the longest line on the screen and it reads as surveillance. The key can be deleted or left orphaned; it is not reused.

`pc.contact.name.hint` answers the client's "AS IN PASSPORT" note and saves work on screen 8 — if the name arrives correctly here, it arrives correctly at the passport step.

# Screen 3 · Confirm request

`/pc`. Structure unchanged: this is the request preview.

| Key | Current | PT | EN |
|---|---|---|---|
| `pc.review.title` | `CHECK YOUR REQUEST` | `Confirma o teu pedido` | `Confirm your request` |
| `pc.review.row.type` | `Trip type` | `Tipo de viagem` | `Trip type` |
| `pc.review.row.route` | `Route` | `Rota` | `Route` |
| `pc.review.row.dates` | `Dates` | `Datas` | `Dates` |
| `pc.review.row.pax` | `Passengers` | `Passageiros` | `Passengers` |
| `pc.review.row.cabin` | `Cabin` | `Classe` | `Cabin` |
| `pc.review.row.bags` | `Checked bags` | `Bagagem de porão` | `Checked bags` |
| `pc.review.bags.none` | `None requested` | `Não` | `None` |
| `pc.review.row.name` | `Name` | `Nome` | `Name` |
| `pc.review.row.phone` | `Phone` | `Telefone` | `Phone` |
| `pc.review.row.email` | `Email` | `Email` | `Email` |
| `pc.review.change` | `Change` | `Editar` | `Edit` |
| `pc.review.special.label` | `Anything we should know? · optional, but it helps` | `Algo que devamos saber? (opcional)` | `Anything we should know? (optional)` |
| `pc.review.special.placeholder` | `ANY SPECIAL REQUEST?` | `Ex.: viajo com a minha mãe em cadeira de rodas; prefiro não chegar de noite.` | `E.g. I'm travelling with my mother, who uses a wheelchair; I'd rather not arrive at night.` |
| `pc.review.submit` | `Confirm and send request` | `Enviar pedido` | `Send request` |

The placeholder is what makes this field arrive filled in rather than empty. It is the field the v3.0 plan identifies as the most valuable in sprint 4.

The nine `Change` links stay nine. Reducing them to two is structure — Annex A.

# Screen 4 · Request received

`/pc/{token}`

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.received.title` | `HI SHUTSHA, YOUR REQUEST IS CURRENTLY IN TREATMENT` | `Olá {name}, já temos o teu pedido` | `Hi {name}, we have your request` |
| `cx.received.subtitle` | `You will receive the best offers shortly` | `Estamos a procurar as melhores opções. Avisamos-te por WhatsApp e email quando estiverem prontas.` | `We're looking for the best options. We'll let you know on WhatsApp and email when they're ready.` |
| `cx.header.ref` | `REQUEST` | `Pedido` | `Request` |
| `cx.received.card.title` | `YOUR REQUEST` | `O teu pedido` | `Your request` |
| `cx.received.row.type` | `Trip type` | `Tipo de viagem` | `Trip type` |
| `cx.received.row.departure` | `Departure` | `Partida` | `Departure` |
| `cx.received.row.return` | `Return` | `Regresso` | `Return` |
| `cx.received.row.pax` | `Passengers` | `Passageiros` | `Passengers` |
| `cx.received.row.cabin` | `Cabin` | `Classe` | `Cabin` |
| `cx.received.row.baggage` | `Baggage` | `Bagagem` | `Baggage` |
| `cx.status.label` | — | `Estado` | `Status` |
| `cx.status.in_review` | `See Treatment Request Status – In Progress` | `Em análise` | `Under review` |

The green element stays the green element that is there today. Only the text changes. Turning it into an amber chip is Annex A.

# Screen 5 · Offers ready

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.offers.ready.title` | `DEAR SHUTSHA` + `2 OFFERS ARE READY FOR YOU` | `Olá {name}, temos {count} opções para ti` | `Hi {name}, we have {count} options for you` |
| `cx.offers.ready.cta` | `SEE OFFERS` | `Ver opções` | `See options` |

Today the title is split across two strings inside a `YOUR REQUEST` box. Merge into one key with `{count}` and plural forms — without touching the box.

# Screen 6 · Option cards

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.offer.badge.best` | `BEST OPTION` | `Recomendada` | `Recommended` |
| `cx.offer.badge.cheapest` | `CHEAPEST` | `Mais barata` | `Cheapest` |
| `cx.offer.badge.guaranteed` | `PRICE GUARANTEED` | `Preço garantido` | `Price guaranteed` |
| `cx.offer.badge.reconfirm` | `SUBJECT TO RECONFIRMATION` | `Preço a reconfirmar` | `Price to reconfirm` |
| `cx.offer.validity` | `The first option has a guaranteed price until 15:59. After that we have to reconfirm the amount with the airline.` | `Preço garantido até às {time}. Depois disso temos de reconfirmar o valor com a companhia.` | `Price guaranteed until {time}. After that we have to reconfirm the amount with the airline.` |
| `cx.offer.fare_breakdown` | `Fare 986.00 € + Taxes 30.00 €` | `Tarifa {fare} + taxas {taxes}` | `Fare {fare} + taxes {taxes}` |
| `cx.offer.pax_summary` | `2 adults · 1 child` | `{adults} adultos · {children} criança` | `{adults} adults · {children} child` |
| `cx.offer.total_label` | `total to pay` | `total a pagar` | `total to pay` |
| `cx.offer.outbound` | `OUTBOUND` | `Ida` | `Outbound` |
| `cx.offer.return` | `RETURN` | `Regresso` | `Return` |
| `cx.offer.stops.one` | `1 stop in Lisbon` | `1 escala em {city}` | `1 stop in {city}` |
| `cx.offer.stops.direct` | `Direct` | `Voo directo` | `Direct flight` |
| `cx.offer.bag.cabin` | `Cabin bag 1 × 8 kg` | `Bagagem de mão {count} × {weight}` | `Cabin bag {count} × {weight}` |
| `cx.offer.bag.personal` | `Personal item 1 · small backpack` | `Item pessoal {count} · mochila pequena` | `Personal item {count} · small backpack` |
| `cx.offer.bag.checked` | `Checked bag 1 × 23 kg per person` | `Bagagem de porão {count} × {weight} por pessoa` | `Checked bag {count} × {weight} per person` |
| `cx.offer.fare.nonref` | `Non-refundable · changes carry a fee` | `Não reembolsável · alterações com custo` | `Non-refundable · changes carry a fee` |
| `cx.offer.fare.ref` | `Refundable with fee · changes allowed` | `Reembolsável com custo · alterações permitidas` | `Refundable with fee · changes allowed` |
| `cx.offer.team_note` | `Note from the team:` | `Nota da equipa:` | `Note from the team:` |
| `cx.offer.cta` | `Choose this option` | `Escolher esta opção` | `Choose this option` |
| `cx.offer.foot.guaranteed` | `You only pay after confirming your choice.` | `Só pagas depois de confirmares.` | `You only pay after confirming.` |
| `cx.offer.foot.reconfirm` | `We reconfirm the amount with the airline before issuing.` | `Reconfirmamos o valor com a companhia antes de emitir.` | `We reconfirm the amount with the airline before issuing.` |

**`{fare}` and `{taxes}` arrive already formatted.** Number formatting is Q7 in the plan and the client has not answered it — do not change it in this sprint. Just make sure the value comes in as a variable rather than being written into the sentence, so the decision can later be applied in one place.

A note from the design, to be verified in code: the validity text says "the first option", which only holds if that card is first in the list. The new sentence is position-neutral and works anywhere.

# Screen 7 · Chosen option

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.chosen.label` | `CHOSEN OPTION` | `Opção escolhida` | `Chosen option` |
| `cx.chosen.total` | `TOTAL TO PAY` | `Total a pagar` | `Total to pay` |
| `cx.chosen.change` | `Change option` | `Trocar de opção` | `Change option` |
| `cx.chosen.deadline` | `Complete Booking Process` | `Termina a reserva até às {time}` | `Complete your booking by {time}` |

The countdown stays: here it is a real deadline, and it is what `T-11` and `T-13` already do. Only the label changes, and it now says what the number is for — `T-13` fixed the fact that the customer was shown a number they had no way to recognise.

# Screen 8 · Passengers

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.pax.title` | `Who is travelling?` | `Quem viaja?` | `Who is travelling?` |
| `cx.pax.adult` | `Adult 1` | `Adulto {n}` | `Adult {n}` |
| `cx.pax.child` | `Child 1` | `Criança {n}` | `Child {n}` |
| `cx.pax.lead` | `Lead passenger · receives all messages` | `Passageiro principal · recebe as comunicações` | `Lead passenger · receives all messages` |
| `cx.pax.title_field` | `Title` | `Tratamento` | `Title` |
| `cx.pax.given` | `Given names` | `Nomes próprios` | `Given names` |
| `cx.pax.given.hint` | `All of them, in passport order` | `Todos, na ordem do passaporte` | `All of them, in passport order` |
| `cx.pax.surnames` | `Surnames` | `Apelidos` | `Surnames` |
| `cx.pax.placeholder.passport` | `As in the passport` | `Como no passaporte` | `As in the passport` |
| `cx.pax.dob` | `Date of birth` | `Data de nascimento` | `Date of birth` |
| `cx.pax.sex` | `Sex` | `Sexo` | `Sex` |
| `cx.pax.nationality` | `Nationality` | `Nacionalidade` | `Nationality` |
| `cx.pax.passport_no` | `Passport number` | `Número do passaporte` | `Passport number` |
| `cx.pax.valid_until` | `Valid until` | `Válido até` | `Valid until` |
| `cx.pax.valid_until.hint` | `6 months beyond the return date` | `Deve ser válido 6 meses após o regresso` | `Must be valid 6 months beyond the return date` |
| `cx.pax.issuing` | `Issuing country` | `País emissor` | `Issuing country` |
| `cx.pax.select` | `Select` | `Selecionar` | `Select` |
| `cx.pax.submit` | `CONTINUE` | `Continuar` | `Continue` |

"Fill with my details" **does not go in**: it depends on a saved customer, which does not exist. Annex A.

# Screen 10 · Payment page

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.pay.link.title` | `Open this Payment Link To Pay` | `Abrir o link para pagar` | `Open the link to pay` |

The copy-the-reference block **does not go in** — new element with a button. Annex A.

# Screen 11 · Payment processing

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.pay.processing.title` | `HI SHUTSHA, YOUR PAYMENT IS CURRENTLY IN TREATMENT` | `Olá {name}, estamos a confirmar o teu pagamento` | `Hi {name}, we're confirming your payment` |
| `cx.pay.processing.subtitle` | `Please wait` | `Assim que estiver confirmado, avisamos-te por WhatsApp e email. Não precisas de ficar nesta página.` | `As soon as it's confirmed we'll let you know on WhatsApp and email. You don't need to stay on this page.` |

`Please wait` is the worst line in the product: it pins the customer to a screen while confirmation is manual. The replacement is text only and it releases them.

# Screen 12 · Payment confirmed

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.pay.done.title` | `Payment completed` | `Pagamento confirmado` | `Payment confirmed` |

The line `We'll now issue your tickets` would be a new element. Annex A.

# Screen 13 · Issuing

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.issuing.title` | `HI SHUTSHA, YOUR TICKETS WILL BE ISSUED SHORTLY` | `Olá {name}, estamos a emitir os teus bilhetes` | `Hi {name}, we're issuing your tickets` |
| `cx.issuing.subtitle` | `Please wait` | `Recebes tudo por email.` | `You'll get everything by email.` |

# Screen 14 · Tickets issued

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.issued.title` | `Tickets issued. Have a great trip!` | `Bilhetes emitidos. Boa viagem!` | `Tickets issued. Have a great trip!` |
| `cx.issued.subtitle` | `We also sent them to {email}. Keep your reference for anything related to this trip.` | `Enviámos também para {email}. Guarda a referência para qualquer assunto desta viagem.` | `We've also sent them to {email}. Keep your reference for anything about this trip.` |
| `cx.issued.ref.airline` | `BOOKING REFERENCE` | `Referência da companhia` | `Airline reference` |
| `cx.issued.ref.weefly` | `WEEFLY REFERENCE` | `Referência WeeFly` | `WeeFly reference` |
| `cx.issued.download` | `Download all tickets` | `Descarregar bilhetes` | `Download tickets` |
| `cx.issued.download.hint` | `One PDF with the ticket.` | `Um PDF com todos os bilhetes.` | `One PDF with all the tickets.` |
| `cx.issued.guide` | `How to read your ticket · 1 page` | `Como ler o teu bilhete · 1 página` | `How to read your ticket · 1 page` |
| `cx.issued.before.title` | `BEFORE YOU TRAVEL` | `Antes de viajar` | `Before you travel` |
| `cx.issued.before.checkin` | `Online check-in opens` | `Check-in online abre` | `Online check-in opens` |
| `cx.issued.before.airport` | `At the airport` | `No aeroporto` | `At the airport` |
| `cx.issued.before.baggage` | `Baggage included` | `Bagagem incluída` | `Baggage included` |
| `cx.issued.before.docs` | `Documents` | `Documentos` | `Documents` |
| `cx.issued.before.docs.value` | `Passport valid 6 months beyond the return` | `Passaporte válido 6 meses após o regresso` | `Passport valid 6 months beyond the return` |
| `cx.issued.pdf.note` | `The ticket PDF includes a guide with everything to sort out before you travel, in time order.` | `O PDF inclui um guia com tudo a resolver antes de viajar, por ordem de tempo.` | `The PDF includes a guide with everything to sort out before you travel, in time order.` |

The `New request` and `My tickets` buttons, and the install prompt, **do not go in**. Annex A.

# Shared elements

| Key | Current | PT | EN |
|---|---|---|---|
| `cx.whatsapp.cta` | `Chat with us` | `Falar connosco` | `Chat with us` |
| `cx.brand.concierge` | `Concierge` | `Concierge` | `Concierge` |

---

# Annex A · Out of this sprint, and why

Recorded so none of it is lost. None of these is text.

| Item | Screen | Why it waits |
|---|---|---|
| Active step in the stepper, and removing the stepper from screen 4 | 1–4 | Navigation behaviour |
| Nine `Change` links reduced to two `Edit` per block | 3 | Screen structure |
| State as an amber chip instead of a green button | 4 | New element, CSS |
| Elapsed time and "we usually reply within the hour" | 4, 11 | New element with time logic |
| Colour rule: navy for text, Ember Red for buttons only | all | CSS. Large and cross-cutting; deserves its own pass |
| Copy-the-reference block on the payment note | 10 | New element plus a copy button. **Highest-value item for tomorrow's meeting** — it fixes reconciliation |
| Line `We'll now issue your tickets` | 12 | New element |
| `New request` + `My tickets` buttons | 14 | Functionality. Depends on the closed loop |
| Install-on-your-phone prompt | 14 | New element, and behaviour differs by device |
| `Fill with my details` | 8 | Depends on a saved customer |
| Six new languages (ES, ZH, NL, IT, DE, HI) | all | Translation cost, not development. One at a time, driven by real demand |
| Email copy, including the proposal email | — | Separate template: `T-14` and `T-16` |

# Annex B · Strings for screens that do not exist yet

Written down now so we do not come back here. **Building these screens is not in this sprint.**

**Screen 9 · Waiting for the payment link**

- `Hi {name}, we're preparing your payment`
- `We'll send the link on WhatsApp to {phone} and by email. Usually within 30 minutes.`
- `Request sent {elapsed} ago`
- `Talk to the team`

**Screen 15 · Expired**

- `Hi {name}, this offer has expired`
- `Prices change through the day. Send a new request and we'll come back with updated options.`
- `New request`

# Annex C · Two open decisions

**1 · Form of address in Portuguese.** Everything above is written with `tu`. It is closer and works well in Cabo Verde. For the European diaspora on a premium service, `você` reads as more formal. It changes almost every PT line — decide before translating, not after. English is unaffected.

**2 · Q7 from the v3.0 plan.** Do amounts follow the language (`986,00 €`) or the currency (`986.00 €`)? Nothing changes in this sprint; we only make sure the value enters as a pre-formatted variable, so the decision can be applied in one place.

---

# Definition of done

- [ ] Keys created in all three dictionaries; the build check passes
- [ ] FR reviewed by a native speaker, not approximated
- [ ] `/pc` no longer has English text inside the code — closes `T-08`
- [ ] No `text-transform: uppercase` on screens 1–14
- [ ] No `toUpperCase()` applied to the customer's name
- [ ] No sentence assembled by concatenation with values in the middle
- [ ] Full flow walked end to end in PT and EN with no missing string

*WeeFly Africa · Concierge · Sprint 3.1 · Interface copy · 10 September 2026*
