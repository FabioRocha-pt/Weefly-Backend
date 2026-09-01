# WeeFly Concierge — Sprint 2 (revised) · Development Backlog

**Close the commercial cycle: from request to the ticket in the customer's hand.**

| | |
|---|---|
| **Version** | 3.1 |
| **Date** | August 2026 |
| **Raised by** | Ivandro Ribeiro, product and design |
| **Source** | Live testing of the Sprint 1 delivery |
| **Sprint length** | 1 week · 1 developer |
| **Items** | 26 requirements |
| **Day-2 milestone** | Email notifications live and verifiable |
| **Supersedes** | The original Sprint 2, which was about data quality and moves to Sprints 3 and 4 |

---

## Why this sprint changed

The original Sprint 2 was about data quality — live updates, airport search, dial codes. Useful, but it does not close a sale.

After testing Sprint 1 the gap is clear: **the cycle does not reach the end.** A request comes in, a proposal can be created, but the customer is never told, the payment proof cannot be opened, and there is no issued ticket at the other end.

This sprint has one job: **request → proposal → choice → payment → issued ticket, with the PDF in the customer's link.** Everything that does not serve that goal moved out.

---

## Day-2 milestone · Email notifications live

Notifications are the spine of the flow. Without them the customer does not know a proposal exists, and the team does not know a request arrived. They ship first.

| ID | Item |
|---|---|
| `NT-01` | Customer receives an email when they submit a request |
| `NT-02` | WeeFly receives a new-request alert — general email **and** WhatsApp |
| `NT-03` | Customer is notified when the proposal is published, **carrying link 2** |
| `NT-06` | Sending infrastructure and delivery logging |

**"Live and functional" means all of the following, not just that the code calls a send function:**

- Sending domain authenticated: `SPF`, `DKIM`, `DMARC` configured and passing
- A real transactional provider with a verified sender address, not the web server's default mailer
- Mail lands in the inbox, tested against Gmail, Outlook and at least one corporate domain
- Every send is recorded on the case with its delivery state: `queued` · `sent` · `delivered` · `bounced`
- Failures are retried, and a permanent failure raises a visible flag on the case
- Templates in both languages, chosen by the case's `lang`

Without delivery logging the mail goes out and nobody knows whether it arrived. That is the difference between a notification and a hope.

---

# `NT` · Notifications

### `NT-01` · Request submitted, to the customer
**Complexity** Low

**Acceptance criteria**
- Sent within seconds of submission
- Contains the reference, a summary of the request, and the expected response time
- In the language of the case
- Recorded on the case with delivery state

### `NT-02` · New request, to WeeFly
**Complexity** Medium

**Acceptance criteria**
- Goes to the general WeeFly address **and** to WhatsApp
- Contains reference, customer name, route, dates, passengers and the entry channel
- If the request arrived with no seller attached, the alert says so explicitly
- WhatsApp delivery failure does not block the email

### `NT-03` · Proposal published, to the customer
**Complexity** Medium

**Acceptance criteria**
- Sent the moment the agent publishes, on email and WhatsApp
- **Carries link 2**, the case's unique address
- States how long the offer is valid, derived from the send timestamp
- Recorded on the case

#### On link 2 — this is an architecture decision, not just a message

**Link 1** is universal and identical for everyone. **Link 2** goes in the proposal email and is **unique per case** — it is what grants access to the proposal, the passport forms and the ticket.

So link 2 follows the rule already recorded as `LNK-08`: **an opaque, non-guessable address**, `weefly.africa/c/8f3a2c91d47b6e05`. Never the customer's name, never the reference, never a sequential id in the URL.

**Acceptance criteria for the link itself**
- Minimum 128 bits of entropy
- No name, tier, reference or sequential identifier in the path
- Works on any device without login
- An admin can revoke and regenerate it, keeping the case and its history

### `NT-04` · Every step and every revision, to the customer
**Complexity** Medium

**Acceptance criteria**
- One notification per state change: proposal published, choice registered, payment instructions sent, payment confirmed, ticket issued
- A revision — `R2` and onward — notifies with what changed
- No duplicate notification for the same event
- Airline schedule changes are **not** automatic: they are relayed manually by the agent, see `NT-07`

### `NT-05` · Ticket state change, to the agent
**Complexity** Low

**Acceptance criteria**
- The agent who owns the case is notified on every customer-side action: option chosen, passports submitted, proof uploaded, request cancelled
- Notification appears in the backoffice and by email
- Does not fire for the agent's own actions

### `NT-06` · Infrastructure and delivery logging
**Complexity** Medium — see the day-2 criteria above.

### `NT-07` · Notify customer, manual action
**Complexity** Low

Airlines tell WeeFly about schedule changes and cancellations by email or through the GDS. **A person decides what to pass on and how to word it.** The system does not invent these.

**Acceptance criteria**
- A **Notify customer** action available on any case from the proposal stage onward
- The agent writes the message and picks the channels
- Sent on email and WhatsApp, recorded in the case history with author and timestamp
- Appears in the customer's link as an alert on their trip

---

# `FE` · Customer side

### `FE-05` · Summary screen before submitting
**Complexity** Low

The customer reviews and confirms before the request goes anywhere. This is the screen previously specified as `VIP-07`, brought forward and serving both link types.

**Acceptance criteria**
- Shows route, dates, trip type, passengers, cabin and baggage
- Any line can be corrected without losing the rest of the form
- Includes a **special requests** free-text field
- Special requests appear in the backoffice in the **left column of the case, below the request summary**
- The request is only created after explicit confirmation

> The special requests field is where *"don't arrive at night"*, *"travelling with my mother who needs a wheelchair"* and *"I must be in Lisbon before 2 pm"* go. No structured form captures that, and it is what makes the quote right first time.

### `FE-06` · Request summary above the tracker
**Complexity** Low

**Acceptance criteria**
- On the status screen, the request summary comes first, the progress tracker after it
- Applies to every state of the status screen

> The reasoning: a returning customer wants to confirm *"is this the trip I asked for?"* before *"where is it in the process?"*.

### `FE-07` · Ticket in the link: PDF and digital
**Complexity** Medium

**Acceptance criteria**
- A **Download ticket** button producing the PDF
- The same content rendered on screen, readable without downloading
- Per-passenger PDFs available individually as well as the combined file
- The *"How to read your ticket"* guide alongside, `EM-04`
- Available permanently in the customer's link, not only in the email

---

# `BO` · Backoffice

### `BO-04r` · Revision: dates suggested, not locked
**Complexity** Low · **Replaces the Sprint 1 behaviour**

Dates arrive pre-filled from the request and are **editable**. If the agent changes them, a **justification is required before moving to the next step**.

**Acceptance criteria**
- Dates are editable, not read-only
- Changing a date opens a mandatory justification field
- The step cannot be completed while the justification is empty
- The change creates a revision and notifies the customer, `NT-04`
- The original requested dates stay visible in the case history
- Origin and destination remain read-only: a different route is a different request

### `BO-08` · Persistent case header and live bar
**Complexity** Medium

Today, entering the proposal composer makes the case header and the live bar disappear. They must stay.

**Acceptance criteria**
- The live bar and the case header stay visible in every case screen, including the proposal composer
- The active tab indicator moves to the correct tab instead of the header being removed
- Reference, state, market, seller and submission time are always on screen
- No horizontal scroll is introduced on a 1280 px viewport

### `BO-09` · Rename to *Create proposal*
**Complexity** Low — `Compor propostas` becomes `Criar proposta` / `Create proposal`, from the translation file.

### `BO-10` · Airport autocomplete in the backoffice
**Complexity** Low · **Reuses the existing dataset**

The dataset already exists — it powers the country list on the customer side. Reuse it, do not build a second one.

**Acceptance criteria**
- Airport fields in the proposal and in the ticket builder use autocomplete
- Typing narrows the options as you type
- Matches on IATA code, city name and country name
- Displays as `RAK — Marraquexe`
- The field only accepts a selected entry, never free text
- Same dataset as the customer side, single source

### `BO-11` · Errors listed and highlighted
**Complexity** Low

**Acceptance criteria**
- A list of missing or invalid fields at the top of the form, each item clicking through to its field
- Each field visually highlighted
- The list updates as fields are corrected
- Applies to the proposal form, the passenger form and the issuance form

### `BO-12` · Dates pre-filled when creating a proposal
**Complexity** Low

**Acceptance criteria**
- Departure and return come pre-filled from the request
- Marked as coming from the customer, distinguishable from values the agent typed
- Editable, subject to `BO-04r`

### `BO-13` · Simplified price
**Complexity** Medium

The proposal carries **price per passenger** plus **WeeFly service**. No separate airport tax line.

```
Total = (price per passenger × number of passengers) + WeeFly service
```

| Field | Behaviour |
|---|---|
| Price per passenger | Typed by the agent. **The final airline price, taxes already included** |
| WeeFly service | **Per booking, not per passenger.** Pre-filled at `€20`, editable |
| Total | Calculated, not typed |

**Acceptance criteria**
- No airport tax field anywhere in the proposal form
- WeeFly service pre-filled at 20 in the case currency, editable by the agent
- Service applied **once per booking**, regardless of passenger count
- Total calculated automatically and never editable directly
- **The customer sees two lines and the total**: `Price 566 € + WeeFly service 20 € = 586 €`
- A proposal cannot be published with an empty or zero price per passenger

> The two visible lines exist so the customer never has to ask why the total is 586 and not 566.

### `BO-14` · Seller list from system users
**Complexity** Low

**Acceptance criteria**
- The seller dropdown reads from the users that exist in the system, never a hard-coded list
- For now it contains a single entry: **Dominik**
- Adding a user makes them appear without a deployment
- Full role and permission management is Sprint 3, `RBAC`

### `BO-15` · Flight options frozen at the payment stage
**Complexity** Low

**Acceptance criteria**
- Once the case reaches the payment stage, the chosen flight cannot be edited
- Changing it requires going back a step explicitly, which creates a revision and notifies the customer
- The frozen state is visible, not just enforced

---

# `EM` · Issuance and final ticket

### `EM-01` · Issuance screen
**Complexity** Medium

**Acceptance criteria**
- Fields: PNR, ticket number per passenger, seats per passenger per flight, fare basis, NVB, NVA, issuing airline, consolidator, real cost
- Ticket numbers: 3-digit airline prefix plus 10 digits, **unique per passenger**, duplicates rejected
- Airline logo shown when the carrier is selected, `PC-12`
- The issue button stays disabled until PNR, all ticket numbers, fare basis, NVB and NVA are filled
- Errors listed and highlighted per `BO-11`

### `EM-02` · Ticket PDF generation
**Complexity** Medium

Implements the **already approved template**, `T5`. This is not a new design.

**Acceptance criteria**
- Three pages: itinerary and passengers · baggage, check-in and trip preparation · services, contacts and legal notices
- Passenger tags `P1 P2 P3` on the passenger table **and repeated inside every flight**, with ticket number, seat and baggage per passenger
- **No monetary values on any page**
- 2D code carrying PNR, ticket number, name and reference
- Fonts embedded, opens identically on any machine
- File name `WF-TKT-{PNR}-{REFERENCE}.pdf`
- Legible printed in black and white

### `EM-03` · Delivery
**Complexity** Medium

**Acceptance criteria**
- PDF attached to the issuance email
- Same PDF permanently downloadable from the customer's link
- Digital version rendered on screen in the link
- Re-sendable from the backoffice **without regenerating**, keeping the same document number
- Issuance notifies the customer on email and WhatsApp, `NT-04`

### `EM-04` · *How to read your ticket* guide
**Complexity** Low — the one-page guide already designed, delivered alongside the ticket PDF.

---

# `X` · Fixes

### `X-01` · Payment proof cannot be opened
**Complexity** Low · **Blocking**

The proof uploaded by the customer cannot be opened in the backoffice. That blocks payment validation, which blocks issuance — it breaks the cycle this sprint exists to close.

**Check first:** the stored path differs from the served path · missing or wrong `Content-Type` on the response · the file is stored outside the web root with no route to serve it · permissions on the upload directory · the filename contains characters that break the URL.

**Acceptance criteria**
- The proof opens in a new tab from the case
- Works for JPG, PNG and PDF
- Files are served through an authenticated route, never a public directory
- The original filename is preserved for display
- Upload failures are reported to the customer at the moment they happen

---

# Dependencies and sequence

| Order | Item | Reason |
|---|---|---|
| 1 | `NT-06` then `NT-01` `NT-02` `NT-03` | Day-2 milestone. Everything else notifies through this |
| 2 | `X-01` | Blocks payment validation, blocks issuance |
| 3 | `BO-13` `BO-12` `BO-04r` `BO-10` `BO-11` | The proposal has to be correct before it can be sent |
| 4 | `FE-05` `FE-06` | Customer side of the same flow |
| 5 | `EM-01` `EM-02` `EM-03` `EM-04` | The end of the cycle |
| 6 | `BO-08` `BO-09` `BO-14` `BO-15` `NT-04` `NT-05` `NT-07` `FE-07` | Complete the loop |

`EM-02` depends on `BO-13`: the ticket carries no values, but the case must have a confirmed total before issuance is allowed.

---

# Moved out of this sprint

| Goes to | Item |
|---|---|
| Sprint 3 | `RBAC` and permission management |
| Sprint 3 | User profile screen |
| Sprint 3 | `BO-03` live updating · `BO-05` background refresh without flicker |
| Sprint 3 | `FE-01` advanced airport search: city grouping, accent tolerance, sub-200 ms |
| Sprint 3 | `NAV` `LIVE` `HDR` `DASH` backoffice structure |
| Sprint 3 | `NEW-01` `PC-05` internal chat |
| Sprint 4 | `FE-02` multi-city · `FE-03` dial codes |
| Sprint 4 | `PC-13` `PC-16` finalised tickets and archive |
| Sprint 4 | `PC-17` paste to fill ticket fields |
| Sprint 4 | All `LNK` and `VIP` items |

---

# Decisions confirmed for this sprint

| # | Decision |
|---|---|
| `Q1` | Internal chat runs **alongside** WhatsApp. WhatsApp stays the customer's channel; the case notes are the record. WhatsApp Business API is a later phase, not a dependency |
| `Q2` | **Any agent** can propose new dates. No permission gate; the guards are the mandatory justification, the revision, the notification and the log |
| `Q5` | Automatic notifications cover state changes only. **Airline schedule changes are relayed manually** by an agent, `NT-07` |
| — | Airport dataset already exists and is reused, `BO-10` |
| — | Customer sees price and WeeFly service as **two separate lines** |
| — | WeeFly service is **per booking**, pre-filled at 20, editable |

# Still open

| # | Question | Blocks |
|---|---|---|
| `Q3` | Who takes a request with no seller attached — open queue, rotation, or by market? And does the person who claims it earn the commission? | Queue model. Open queue ships by default |
| `Q4` | Retention periods for conversations, documents and the activity log | Sprint 3 architecture |
| `Q6` | Booking thresholds for Diamond and Platinum | Sprint 4 |
| `Q7` | Number formatting: follows language or currency? | Front-end formatting |
| `Q8` | What else belongs to Concierge besides the Price Checker? | Menu structure, Sprint 3 |

---

# Two things that must not be lost

**The passenger tags `P1 P2 P3`.** Generated from the request, shown at payment, printed on the ticket, repeated inside every flight. They are what removes the ambiguity of which ticket belongs to whom.

**The distinction between a guaranteed and an indicative price.** `guaranteed` only when the fare is genuinely held in Amadeus with an option time. Everything else is `subject to reconfirmation`. Never show a countdown next to a price that is not held.
