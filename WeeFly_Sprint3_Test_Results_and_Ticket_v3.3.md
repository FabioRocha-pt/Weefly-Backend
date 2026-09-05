# WeeFly Concierge — Sprint 3 test results and ticket improvements

| | |
|---|---|
| **Version** | 3.3 |
| **Date** | September 2026 |
| **Raised by** | Ivandro Ribeiro, product and design |
| **Source** | Testing of the Sprint 3 delivery, 5 September |
| **Part A** | 21 corrections found in testing |
| **Part B** | 12 improvements to the final ticket PDF |
| **Sprint length** | 1 week · 1 developer |

Use the IDs in branches and commits: `fix/T-08-language-not-applied`, `feat/TK-03-baggage-per-segment`.

---

# Part A · Corrections from testing

## Group A1 · Blocking

### `T-01` · A case can still be quoted without being claimed
**Complexity** Low · **Reopened from `C-01`**

The option to quote without claiming is still available. Remove it entirely — not just disable it.

**Acceptance criteria**
- No path reaches the proposal composer on an unclaimed case
- The only action offered is **Claim and quote**
- Attempting it by direct URL returns an error, not the form
- Claiming records agent, timestamp, and how long the case waited

### `T-02` · Changing the chosen option leaves the customer stuck
**Complexity** Medium

On the payment screen, clicking **Change option** returns to the offers but **the customer can no longer select any of them.** The flow dead-ends.

**Check first:** the case state moved past `option chosen` and the selection action is gated on the earlier state · the offers were locked when payment started and never unlocked on going back.

**Acceptance criteria**
- Returning to the offers restores the ability to choose
- Choosing a different option updates the case and the total
- The previously chosen option is shown as such, and can be re-selected
- Going back does not lose passenger data already entered
- The state change is logged

### `T-03` · Backoffice does not react to customer actions
**Complexity** Medium · **Reopened from `C-14`, `C-32`**

The backoffice shows no notification when the customer changes state, does not refresh on its own, and gives no signal that something new arrived. A manual reload is required to see new data.

**Acceptance criteria**
- Every customer-side action appears in the backoffice within 5 seconds, without a reload
- The notification bell count updates live
- Queues, counters and the case screen update live
- A visible signal marks new arrivals, dismissible per agent
- **Nothing the agent is typing is lost or overwritten by an update**

### `T-04` · Issuance has no fields for the return flight
**Complexity** Medium

The issuance screen only allows entering the outbound. A return ticket cannot be issued — the cycle cannot close on a round trip.

**Acceptance criteria**
- One block per flight, matching the flights in the chosen proposal
- Round trip produces at least two blocks; multi-city produces one per leg
- Per flight: airline, flight number, aircraft, cabin, departure, arrival, terminals, fare basis, NVB, NVA, coupon number
- Per passenger per flight: seat and baggage
- The issue button stays disabled until every flight is complete

---

## Group A2 · Seller and ownership

### `T-05` · Seller on link creation must be the logged-in user
**Complexity** Low

When creating a link, the seller should be **automatically the user who is logged in**. Remove the seller dropdown from the link builder.

**Acceptance criteria**
- The `agent` parameter is filled from the active session, never chosen
- No seller dropdown in the link builder
- The generated link carries that agent
- Full seller selection returns with `RBAC` in the next sprint

### `T-06` · Seller on the proposal must be the logged-in user
**Complexity** Low

When creating a proposal the seller shown must be the active user. Today it shows something else.

**Acceptance criteria**
- The proposal records the user who created it, from the session
- Displayed, not editable
- A list of other users becomes selectable only when `RBAC` exists

---

## Group A3 · Data and content

### `T-07` · Arrival date is not part of the request — remove its label
**Complexity** Low

The request does not carry an arrival date, but the label is shown. A label with no data reads as missing information.

**Acceptance criteria**
- The arrival label is removed from the request summary
- Nothing else shifts position when it goes

### `T-08` · Language is not applied
**Complexity** Medium

The customer chose Portuguese, the notification arrived, and the link opened **entirely in English**. The language selector on those screens does nothing.

**Acceptance criteria**
- The case's `lang` drives every screen the customer sees
- The same `lang` drives emails and WhatsApp templates
- The selector in the header actually switches language and persists for the session
- No screen mixes languages
- All strings come from the translation file, none hard-coded

### `T-09` · Customer's special request must reach the proposal tab
**Complexity** Low

The special request the customer wrote is not visible where the agent creates the proposal — which is exactly where it is needed.

**Acceptance criteria**
- The special request is shown in the Proposals tab, in the left column beside the request summary
- Shown in full, not truncated
- Visually distinct as the customer's own words
- Empty state says so, rather than showing a blank box

### `T-10` · Baggage conditions attached per flight
**Complexity** Medium · **Reopened from `C-29`**

Fare conditions differ per flight. A customer may deliberately fly out with more baggage and back with less to reduce cost. One value for the whole trip cannot express that.

**Acceptance criteria**
- One baggage and fare-conditions block per flight, in the proposal and at issuance
- Each block: cabin bag, personal item, checked baggage, as pieces × weight
- Counters `−` `0` `+`, not free text
- The customer sees the allowance per flight
- The ticket reflects the same per-flight structure, see `TK-03`

### `T-11` · Payment deadline set automatically
**Complexity** Low

The payment deadline must be **the date and time the payment link was sent, plus one hour**, set automatically when the payment request is received. Today it is empty.

**Acceptance criteria**
- Filled automatically at the moment the payment instructions are sent
- Base timestamp is the send time, not the proposal time
- Editable by the agent if needed, with the change logged
- The customer sees the same deadline and a countdown derived from it

### `T-21` · Filter for closed cases
**Complexity** Low

**Acceptance criteria**
- New filter **Closed cases** in the filter row
- Closed cases leave the working queues and appear only under this filter
- Searchable by reference, name, phone and route

---

## Group A4 · Layout and interaction

### `T-12` · Timer overflows its container on the payment screen
**Complexity** Low

The countdown is taller than the white area beneath it and overlaps.

**Acceptance criteria**
- No overflow at any viewport from 360 px to 1920 px
- The block resizes with its content

### `T-13` · Timer always visible, and reordered
**Complexity** Low

New order in the block: **timer**, then the title, then the note.

**Acceptance criteria**
- Timer stays visible while scrolling the payment screen
- Order is timer → title → note
- The timer keeps counting; it is not a static value

---

## Group A5 · Emails and customer screens

A single fix applies to all templates:

### `T-14` · Ticket code in the orange band, top right
**Complexity** Low · **Applies to every email and every customer screen**

**Acceptance criteria**
- Reference shown in the orange band at the top right of every template and every customer screen
- Same position and same treatment everywhere
- In monospace, selectable, copyable

### `T-15` · First email: correct WeeFly logo
**Complexity** Low — the logo at the top is wrong. Use the brand file.

### `T-16` · Second email: logo, date, and the date-change note
**Complexity** Low

**Acceptance criteria**
- Logo added
- **Date shown, not only the time** — today only a time appears, which is unusable
- If the agent changed the dates, the justification they wrote appears in the email
- Reference in the orange band, `T-14`

### `T-17` · Payment email must carry the payment link
**Complexity** Medium

At this point the customer has chosen a method and the team has generated the link. **That link must be in the email** — otherwise the customer cannot pay.

**Acceptance criteria**
- The payment link generated by the agent is included in the email
- Method named, amount and deadline shown
- Fails to send, with a visible error, if the link is missing — better than sending an email the customer cannot act on

### `T-18` · Payment screen: message to WeeFly, proof upload, WhatsApp
**Complexity** Medium

**Acceptance criteria**
- A free-text field where the customer can write something to WeeFly
- Proof upload: JPG, PNG, PDF up to 8 MB
- WhatsApp button opening a chat with the reference already written
- Both the message and the proof arrive on the case and notify the agent

### `T-19` · Passport screen: logo and clickable phone
**Complexity** Low

**Acceptance criteria**
- WeeFly logo present
- The phone number is a link that opens WhatsApp
- Reference in the orange band, `T-14`

### `T-20` · Payment confirmation email: white logo and ticket link
**Complexity** Low

**Acceptance criteria**
- White logo version on the dark header
- Link to the ticket included
- Reference in the orange band, `T-14`

---

## What the `×5` and `×22` mean — and what they reveal

They are **repetition counters**. The notification list groups identical events and shows how many times each fired. `O cliente escolheu uma opção ×6` means that event was emitted six times.

Grouping is a good behaviour. **What the numbers reveal is not.**

`O prazo de pagamento expirou ×22` means the expiry event fired twenty-two times for one case. A deadline expires **once**. Almost certainly a scheduled job re-emitting the event on every run instead of marking it as already emitted.

If those notifications also went out by email or WhatsApp, the customer received twenty-two identical messages.

### `T-22` · Events emitted repeatedly
**Complexity** Medium · **Raised from the evidence, not reported**

**Acceptance criteria**
- Each state-change event is emitted **once** per case
- One-time events carry an `emitted` flag checked before firing
- Scheduled jobs are idempotent: running twice produces one notification
- A repetition counter in the interface is fine; a repetition in delivery is not
- Verify no customer received duplicate emails or WhatsApp messages from this

---

# Part B · Final ticket PDF improvements

Two reference documents informed these: the **Trip.com e-itinerary** and the **WeeFly booking voucher**. Both do things the current template does not.

## What the references do well

| Source | What it does | Why it matters |
|---|---|---|
| Trip.com | Baggage stated **per segment and per passenger**, with exact dimensions | A traveller with a connection on two carriers has two different allowances |
| Trip.com | `Baggage checked through` marked on transfers | Answers the most common question at a connection |
| Trip.com | Separates booking number, e-ticket number and **airline booking reference** | They are three different codes and travellers confuse them |
| WeeFly voucher | Black masthead with the reference large in orange | Findable in one second on a phone |
| WeeFly voucher | Status band: `Booking Confirmed & Ticketed` | The state is legible without reading anything |
| WeeFly voucher | Per-segment strip: cabin class, cabin baggage, checked baggage, airline PNR, segment status | Everything a counter agent asks, in one row |
| WeeFly voucher | Passenger table with type badge and **date of birth** | Date of birth is what proves the passenger type |

## Improvements

### `TK-01` · Masthead with the reference in the orange band
**Complexity** Low

**Acceptance criteria**
- Dark masthead with the WeeFly logo in white
- **Reference large, in orange, top right**, in monospace
- Below it: issue date and payment state
- Same position as in every email and customer screen, `T-14`

### `TK-02` · Status band under the masthead
**Complexity** Low

**Acceptance criteria**
- Full-width orange band with the state: `Booking confirmed and ticketed`
- Right side carries the trip type: `One way` · `Round trip` · `Multi-city`
- The band reflects the real case state, never hard-coded

### `TK-03` · Baggage per segment and per passenger
**Complexity** Medium · **Depends on `T-10`**

The current template shows one allowance for the whole trip. It has to become per flight.

**Acceptance criteria**
- One baggage block per flight, per passenger
- Three lines: personal item, cabin bag, checked baggage — pieces, weight and **maximum dimensions**
- `No free baggage allowance` stated explicitly when there is none, never left blank
- Matches exactly what was in the proposal

### `TK-04` · Baggage checked through on connections
**Complexity** Low

**Acceptance criteria**
- Each connection states airport, connection time and whether baggage is checked through
- States whether the terminal changes
- A connection under 60 minutes is flagged

### `TK-05` · Three codes, clearly separated
**Complexity** Low

Travellers confuse them, and each is used in a different place.

| Code | Used for |
|---|---|
| **WeeFly reference** | Talking to WeeFly |
| **Airline booking reference / PNR** | Check-in and the airline |
| **E-ticket number** | Individual per passenger, used at the counter |

**Acceptance criteria**
- The three appear with distinct labels
- The airline PNR appears **per segment** when carriers differ
- The e-ticket number appears per passenger in the passenger table

### `TK-06` · Per-segment information strip
**Complexity** Low

A row under each flight, borrowed from the voucher: **cabin class · cabin baggage · checked baggage · airline PNR · segment status**.

**Acceptance criteria**
- Present under every flight
- `Segment status` shows `Confirmed` from the coupon state
- Legible in black and white

### `TK-07` · Date of birth in the passenger table
**Complexity** Low

**Acceptance criteria**
- Passenger table carries: tag `P1` `P2` `P3`, name, type badge, e-ticket number, **date of birth**, document
- Date of birth is what proves the passenger type; without it `CHD` is unverifiable

### `TK-08` · Airline logo per flight
**Complexity** Low · **Depends on `C-26`**

**Acceptance criteria**
- Logo shown beside the airline name on each flight
- Operating and marketing carrier distinguished when they differ
- Falls back to the IATA code label when a logo is missing

### `TK-09` · Aircraft type per flight
**Complexity** Low — present in both references, absent in ours. Passengers who care, care a lot.

### `TK-10` · Total duration per direction
**Complexity** Low

**Acceptance criteria**
- Each direction states its total duration including connections
- Shown as `Total duration 5h 40m, non-stop` or with the number of stops

### `TK-11` · Reference in a scannable code
**Complexity** Low

**Acceptance criteria**
- 2D code carrying PNR, e-ticket number, passenger name and WeeFly reference
- Readable from a printed page by a normal phone
- Placed near the contacts block

### `TK-12` · Print resilience
**Complexity** Low

**Acceptance criteria**
- Fully legible printed in black and white
- No information carried by colour alone
- Fonts embedded so it opens identically anywhere
- Page 1 works in isolation: it is the page taken to the airport

---

# Execution order

| Order | Items | Reason |
|---|---|---|
| 1 | `T-17` `T-11` `T-22` | The customer cannot pay without the link, has no deadline, and may be receiving duplicate messages |
| 2 | `T-04` `T-02` `T-01` | The cycle cannot close: no return flight, dead-end on changing option, quoting without claiming |
| 3 | `T-08` `T-03` | Language ignored and no live reaction — both affect every screen |
| 4 | `T-09` `T-10` `T-05` `T-06` `T-07` | Proposal correctness |
| 5 | `T-14` `T-15` `T-16` `T-19` `T-20` `T-18` | Emails and customer screens |
| 6 | `T-12` `T-13` `T-21` | Layout and filters |
| 7 | `TK-01` to `TK-12` | Ticket improvements, once issuance handles the return flight |

`TK-03` depends on `T-10`: the ticket cannot show baggage per segment until the proposal captures it that way.

---

# Still open

| # | Question |
|---|---|
| `Q3` | Who takes a request with no seller attached, and does the person who claims it earn the commission? |
| `Q4` | Retention for conversations, documents and the activity log |
| `Q7` | Number formatting: follows language or currency? |
| — | Confirm whether the duplicate events in `T-22` reached customers by email or WhatsApp |

---

# Two things that must not be lost

**The passenger tags `P1` `P2` `P3`.** Generated from the request, shown at payment, printed on the ticket and repeated inside every flight. They are what removes the ambiguity of which ticket belongs to whom.

**The distinction between a guaranteed and an indicative price.** `guaranteed` only when the fare is genuinely held in Amadeus with an option time. Everything else is `subject to reconfirmation`. Never show a countdown next to a price that is not held.
