# WeeFly Concierge — Development Backlog v3.0

Sprint plan and requirement specification for the Price Checker and the Concierge backoffice.

| | |
|---|---|
| **Version** | 3.0 |
| **Date** | August 2026 |
| **Raised by** | Ivandro Ribeiro, product and design |
| **Sprint length** | 1 week |
| **Team** | 1 developer |
| **Total** | 68 requirements across 4 sprints |
| **Related docs** | `Change Request Log v2.2` · `D1 Electronic Ticket Design Rationale` · front-end handoff package `weefly-price-checker-v2` |

---

## How to use this document

Every requirement has an **ID**. Use it in branch names, commits and pull requests: `fix/FE-04-selectors`, `feat/PC-B-reduced-composer`.

**Acceptance criteria are the definition of done.** If they are not all met, the item stays open. Where a criterion says "verified in the backoffice", it means the end-to-end path must be checked, not just the form.

Complexity is **development complexity**, not time: `Low` is a contained change, `Medium` touches several layers, `High` needs a design decision or new infrastructure.

Sprints are ordered by **value delivered**, not by module. Sprint 1 makes the operation faster and able to take money. Sprint 2 stops errors and losses. Sprint 3 makes the backoffice navigable. Sprint 4 opens the premium channel.

---

# Sprint 1 · Respond faster and get paid

**Goal:** cut the time between a customer request and a payable offer, and make sure the money can actually be collected.

## Day-2 milestone · VMP

By the end of day 2 the following must work end to end, because it is what lets the operation run and invoice:

| ID | Item | Why it is in the VMP |
|---|---|---|
| `FE-04` | Selectors on the request form | Every request submitted while broken carries wrong trip data |
| `BO-07` | Date validation | Prevents impossible itineraries reaching the customer |
| `BO-02` | Payment link at the correct step | Without it, money moves against a stale price |
| `PC-10` | Five payment methods | This is how the money arrives |
| `PC-B` | Reduced proposal composer | Halves the time to produce a quote |
| `FB-01` | Data reuse from the request | Removes the retyping that causes most delay |
| `FB-04` | Price validity timestamp | Makes the 1-hour promise verifiable |

Everything else in Sprint 1 lands across days 3 to 5.

---

### `FE-04` · Selectors on the request form stopped working
**Type** Bug · **Priority** P0 · **Complexity** Low · **Regression**

The three selectors at the top of the request card — trip type, passenger count, cabin — do not open. They worked in a previous build.

The form still submits, always with the defaults. A family of four travelling one way in business arrives as one adult, round trip, economy. The request is not blocked, it is silently wrong.

**Check first:** a JavaScript error earlier in the file preventing listeners from binding · the outside-click handler firing on the same click that opens the panel because propagation is not stopped · listeners bound before the elements exist · changed markup or class names breaking the script's selectors.

**Acceptance criteria**
- All three selectors open, apply the choice and close
- Only one panel open at a time; outside click and `Escape` close it
- `Cancel` in the passenger panel restores the values held when it opened
- Infants on lap can never exceed the number of adults
- The submitted request carries the selected values, verified in the backoffice
- Console is clean on page load

---

### `BO-07` · Date validation
**Type** Bug · **Priority** P0 · **Complexity** Low

Validate at three levels: within a flight, between flights, and against the customer's requested dates. Client side for speed, **server side for correctness**.

**Acceptance criteria**
- Arrival must be after departure on every flight
- Each flight starts on or after the previous one arrives
- Overnight arrivals are accepted and shown as `+1`, not rejected
- Connection under 45 minutes warns, does not block
- An offer cannot be published while any date rule is broken

---

### `BO-02` · Payment link generated at the correct step
**Type** Bug · **Priority** P0 · **Complexity** Medium

Remove the payment link from the create-link screen entirely. It is generated **after the customer has chosen an option and all passenger passport data is complete** — that is the only moment when both the amount and the payer are known.

**Acceptance criteria**
- No payment field or link anywhere on the create-link screen
- Generation blocked while any passenger record is incomplete
- The link carries the exact confirmed total and the case reference
- The link expires and can only be used once

---

### `PC-10` · Payment methods
**Type** New · **Priority** P0 · **Complexity** Medium

The customer selects a **method**, not a link. The agent then generates the link for that method. Five methods, available in every market:

`Vinti4 / SISP` · `Stripe` · `Revolut` · `Instapay` · `PayPal`

**Acceptance criteria**
- All five appear for every customer, regardless of country
- The chosen method arrives in the backoffice attached to the case
- The agent generates the link from the case, never before
- The method chosen is recorded in the case log

---

### `PC-B` · Reduced proposal composer
**Type** Improvement · **Priority** P0 · **Complexity** Medium

The current composer becomes the **ticket builder**, used at issuance. The proposal keeps only what a customer needs to decide:

| Field | Notes |
|---|---|
| From → To | Pre-filled from the request, `FB-01` |
| Travel dates | Pre-filled from the request |
| Departure and arrival times | `PC-06a`. Pre-filled, editable, flagged until confirmed |
| Flight time | |
| Stops: where and how long | |
| Baggage | Counters, `FB-03` |
| Non-refundable | |
| Price and taxes | `PC-06b`. This is what the customer pays |
| Proposal name | Editable |
| Tags | `cheapest` · `fastest` · `recommended` |
| Airline logo and name | `PC-12`, replaces the current free-text field |

**Acceptance criteria**
- The proposal form contains only the fields above
- The full ticket builder is still reachable at the issuance stage
- Pre-filled times are marked **to confirm** and the publish action requires the agent to acknowledge them
- A proposal cannot be published without price and taxes

> The **to confirm** flag on times exists because pre-filling saves time but risks publishing a departure time that does not exist. One click to acknowledge, not a form to refill.

---

### `FB-01` · Reuse of data already provided
**Type** Improvement · **Priority** P0 · **Complexity** Medium

Everything the customer entered appears already filled in the backoffice: route, dates, passengers, name, contact. The goal is to cut response time.

**Acceptance criteria**
- Route, dates, passenger counts, cabin, baggage and name pre-fill the proposal
- The customer's name appears automatically on the request when they are already in the process
- No field is ever typed twice across the flow
- Pre-filled values are visually distinguishable from values the agent typed

---

### `FB-04` · Price validity with timestamp
**Type** Improvement · **Priority** P1 · **Complexity** Low

Validity is **1 hour counted from the moment the financial proposal is sent**, not from the end of the search.

**Acceptance criteria**
- The proposal records the date and time it was sent
- The countdown shown to the customer derives from that timestamp
- On expiry the offer moves to expired and the customer sees the expired screen
- The wording distinguishes a WeeFly commercial hold from an airline-guaranteed fare: `guaranteed` requires a real Amadeus option time

---

### `BO-04` · Route and dates locked from the request
**Type** Bug · **Priority** P0 · **Complexity** Medium · **Depends on** `NEW-01` for the full flow

Origin, destination and dates arrive pre-filled and **read-only**. A different route is a different request. Dates change only through an explicit action with a mandatory reason.

**Acceptance criteria**
- Origin and destination read-only for every backoffice role
- Changing a date requires **Propose new dates** with a mandatory reason
- The change creates revision `R2` and notifies the customer on all channels
- The original request stays visible and unaltered in the case history

> Ships in Sprint 1 with the reason field. The conversation thread that justifies the change arrives with `NEW-01` in Sprint 3.

---

### `PC-06a` · Departure and arrival times in the proposal
**Type** Improvement · **Complexity** Low

Pre-filled with what the customer chose, editable by the backoffice. See the note under `PC-B`.

### `PC-06b` · Price and taxes in the proposal
**Type** Improvement · **Complexity** Low

Total plus the breakdown `fare + taxes`. It is the amount the customer will pay.

### `FB-03` · Baggage counters
**Type** Improvement · **Complexity** Low

Replace the text field with `−` `0` `+` counters, in the backoffice and in the customer form.

### `VIP-10` · Baggage selector on the request form
**Type** New · **Complexity** Low

New selector on step 1: `Baggage 0` · `1 checked` · `2 checked`. Enters the field contract and pre-fills the proposal.

### `FB-05` · WhatsApp contact everywhere
**Type** Improvement · **Complexity** Low

From the moment a proposal exists, every screen of a case in the backoffice offers contact with the customer on WhatsApp, opening with the case reference already written.

### `FB-02` · Rename to ticket issuance
**Type** Improvement · **Complexity** Low

What is currently called *quote request* becomes **ticket issuance** at the final stage.

### `BO-06` · Button label
**Type** Improvement · **Complexity** Low

`Add outbound flight` becomes `Add flight`, from the translation file, in all languages.

### `BO-01` · User menu on the avatar
**Type** Improvement · **Complexity** Low

Dropdown with **User profile**, **Settings** and **Log out**. Settings lives here, not as a top-level menu.

**Acceptance criteria**
- Opens on click, closes on outside click and `Escape`
- Log out ends the session server side
- Keyboard reachable, `aria-expanded` on the trigger

---

# Sprint 2 · Stop errors and losses

**Goal:** remove the causes of wrong data, lost requests and abandoned cases.

### `BO-03` · Real-time update
**Type** Improvement · **Priority** P1 · **Complexity** Medium

The queue updates **on the event**, not on a timer. Server-sent events or websockets, polling only as fallback.

**Acceptance criteria**
- A new request appears in under 5 seconds without reloading
- Counters and queue tabs update at the same time
- A dismissible signal marks a new arrival, per agent
- **Nothing the agent is typing is lost or overwritten by an update**

---

### `BO-05` · Background refresh without flicker
**Type** Bug · **Priority** P1 · **Complexity** Medium

Only changed values are written to the DOM. The panel is never re-rendered whole. The only visible signal is the autosave toast, at most one every 10 minutes.

**Acceptance criteria**
- No flicker, focus loss or scroll jump during a background update
- A field being edited is never overwritten
- Autosave shows a discreet toast, throttled to 10 minutes
- On autosave failure the agent is told and the draft is kept locally

---

### `FE-01` · Countries, cities and airports database
**Type** Improvement · **Priority** P1 · **Complexity** Medium

Complete dataset with IATA codes, served by a search endpoint. Stored locally and versioned, never fetched live from a third party at request time.

**Acceptance criteria**
- Results in under 200 ms for a three-letter query
- Accent-insensitive and case-insensitive: `sao vicente` finds `São Vicente`
- Multi-airport cities group correctly: Paris → CDG, ORY, BVA
- **The form only accepts a selected entry, never free text**
- The same endpoint serves the customer form, the backoffice and the future WhatsApp bot

### `FB-06` · Country list in the backoffice
**Complexity** Low — same dataset as `FE-01`, applied to backoffice fields.

### `FE-02` · Multi-city legs
**Type** Bug · **Priority** P1 · **Complexity** Low

Starts with two flights, allows adding up to four.

**Acceptance criteria**
- Minimum 2, maximum 4 flights
- Any flight beyond the first two can be removed
- The destination of one flight pre-fills the origin of the next, editable
- Chronological validation between flights
- The backoffice displays every flight of a multi-city request

### `FE-03` · International dial codes
**Type** Improvement · **Complexity** Low

Complete list with country name, searchable, defaulting to the `cc` link parameter then the browser locale. Stored in **E.164**.

---

### `PC-12` · Airline logos
**Type** Improvement · **Complexity** Low

Own collection, keyed by IATA code, shown in the proposal composer, in the customer's option cards and at issuance.

**Acceptance criteria**
- Logo files named by lowercase IATA code: `vr.png`, `tp.png`
- PNG or SVG, transparent background, horizontal, minimum height 80 px
- **Missing logo falls back to a code label, never an empty space**
- New airlines can be added without a deployment

Collection to build, in order of usefulness: `VR` `TP` `AT` `SN` `AF` `KL` `IB` `LH` · `DL` `UA` `AA` `BA` `LX` `SK` `FR` `U2` `VY` `TK` `EK` `QR` · `HC` `ET` `DT` `KQ` `AW` `G3` `AD` `LA` `MS` `AH` `TU`

---

### `PC-13` · Finalised tickets filter
**Type** New · **Complexity** Medium

New filter in the filter row, with sub-filters `complete` · `cancelled` · `expired` · `archived`, and the actions to formally close an issuance process.

### `PC-16` · Archive
**Type** New · **Complexity** Medium

Archive is **both a state and a place**. An `Archive` button on any case; archived cases leave the normal lists and live in the Archive.

**Acceptance criteria**
- Archive button available on any case, with reason
- Archived cases disappear from working queues
- The Archive is searchable by reference, name, phone and route
- Archiving is reversible by an admin and logged

---

### `PC-17` · Paste to fill the ticket fields
**Type** New · **Complexity** High · **Can be deferred**

Three levels, best first:

1. **Fetch by PNR from Amadeus.** Structured, zero transcription errors. Best path, does not depend on parsing text
2. **Paste the GDS return.** Fixed, predictable format. A good parser gets almost everything
3. **Paste the airline confirmation email.** Reliability drops: every airline formats differently and changes templates without notice

**The rule that makes this safe, at any level:** the result is **never saved directly**. It fills the fields, marks each as *extracted* or *uncertain*, and the agent confirms before issuing. A parser that is 95% right and saves without review produces a wrong ticket every twenty — and a wrong ticket costs a full reissue.

**Acceptance criteria**
- Extraction never writes to the case without agent confirmation
- Each extracted field is marked with its confidence
- Fields that could not be extracted stay empty and required
- PNR lookup, when available, takes precedence over text parsing

---

# Sprint 3 · Make the backoffice navigable

**Goal:** the agent always knows where they are, what they can do there, and what is happening across the platform.

## Top bar · `NAV`

| ID | Requirement | Complexity |
|---|---|---|
| `NAV-01` | Left: **WeeFly logo + Concierge** label, replacing `Admin` | Low |
| `NAV-02` | Menus: **Dashboard** · **Price Checker** · **My space** · **Employees**. Active menu visually marked, page title repeats the same name | Medium |
| `NAV-03` | Right: **notifications** and **user menu**. Settings inside the user menu | Low |
| `NAV-05` | `Create link` moves out of the top bar to the fixed bottom bar, always bottom right | Low |
| `NAV-04` | Every backoffice user has their own account. **Any open session is visible to the admin**: name, current space, start time | Medium |

> `Payments` and `Emissions` disappear from the top bar. Recommendation: they become **queues inside Price Checker**, not top-level menus, so whoever reconciles money keeps a working queue.

## Live bar · `LIVE`

Present in **every backoffice space**, directly under the top bar. Three clickable indicators.

| ID | Indicator | Opens | Complexity |
|---|---|---|---|
| `LIVE-01` | **LIVE**, green — keep as is | Panel of what is happening now | Low |
| `LIVE-02` | **Active sessions**, ember, with count | List of users online and where they are | Medium |
| `LIVE-03` | **Ticket states** | **Live change log** with author, time and case | High |

**Acceptance criteria for `LIVE-03`**
- Every state change appears in the log within seconds
- Each entry carries author, timestamp, case reference and what changed
- Searchable and filterable by author, case and type
- Retention to be decided — see open questions

## Page header · `HDR`

Fixed pattern for every space, in this order:

| ID | Requirement | Complexity |
|---|---|---|
| `HDR-01` | Back icon + name of the current menu, breadcrumbs underneath | Low |
| `HDR-02` | Context note: what can be done in this space. **Same visual treatment everywhere** | Low |
| `HDR-03` | The note closes with `✕`, but the `✕` only appears after **20 sessions** in that space. Can be disabled entirely in Settings | Medium |
| `HDR-04` | Back goes **one level up in the breadcrumbs**, like a mobile app. Never browser history | Low |

> Recommendation on `HDR-03`: count sessions **per space** and lower the threshold to **5**. Someone who uses Price Checker daily and Dashboard rarely would otherwise be stuck with the Dashboard note for months.

## Dashboard · `DASH`

| ID | Requirement | Complexity |
|---|---|---|
| `DASH-01` | Complete metrics for everything happening on the platform, covering the Concierge and all its services | High |
| `DASH-02` | Period filters: **today · week · month · year** plus a custom range | Medium |
| `DASH-03` | Three zones: **what is blocked now** at the top, **volume for the period** in the middle, **trend** at the bottom | Medium |

> `DASH-03` exists so that whoever opens it in the morning knows where to act in the first three seconds. Complete metrics with filters easily becomes a screen nobody reads.

## Case ownership and workspace

| ID | Requirement | Complexity |
|---|---|---|
| `PC-02` | The full flow is visible, so the agent always knows the phase and what is missing | Medium |
| `PC-03` | Claiming a request moves it to the agent's **My space**, while staying workable from the Price Checker menu where they found it | Medium |
| `PC-04` | English and Portuguese in the backoffice, selector **hidden in Settings** — it is set once | Low |

## Internal chat · `NEW-01` and `PC-05`
**Type** New · **Priority** P1 · **Complexity** High · **Needs a scope decision before estimating**

Two contexts, **one messaging infrastructure**. Building two separate modules means maintaining two.

| Context | Between | Purpose |
|---|---|---|
| `NEW-01` | Agent ↔ customer | Justify date changes, ask questions, keep a record |
| `PC-05` | Agent ↔ agent, **bound to the case** | The manager assigns cases and the team discusses work. Not open chat |

**Acceptance criteria**
- Messages are immutable for customer and agent
- An administrator can hide a message; the hiding is logged, the content preserved
- Every message notifies the other side on their preferred channel
- The thread lives in the case and survives a change of agent
- A date-change proposal made in chat links to the request that generated it

## Link preview · `PC-14` and `PC-15`
**Complexity** Medium

Open Graph meta tags rendered **server side**, per URL. Title, description and a `1200 × 630 px` image.

| ID | Requirement |
|---|---|
| `PC-14` | Universal link shows the WeeFly logo and the product title |
| `PC-15` | Response link shows contextual title: *"Proposal for your trip Praia → Lisbon"* |

**Three warnings**
- **WhatsApp caches aggressively.** Once a URL is read, the preview freezes. If the title changes with the case state, each revision must produce a slightly different URL
- **The preview appears on the lock screen.** A contextual title reveals the destination to anyone looking at the phone. Make it configurable: contextual by default, generic when the agent marks the case as sensitive
- **Server-side rendering is required.** WhatsApp does not execute JavaScript; a single-page app returns nothing

---

# Sprint 4 · Premium customer and private link

**Goal:** open the channel for known customers, where the experience is faster because nothing is asked twice.

## Two link types · `LNK`

| ID | Requirement | Complexity |
|---|---|---|
| `LNK-01` | **Open link** stays as it is. The customer only becomes known if they fill in their details. Registration turns the universal link into a private one | Medium |
| `LNK-02` | Registration asks once: full name as in passport, WhatsApp number, email, and `Business` or `Individual` | Low |
| `LNK-03` | Registration confirmed by **email and WhatsApp** | Low |
| `LNK-04` | Welcome screen with the benefits and a button leading to step 1 | Low |
| `LNK-05` | The agent customises **image, title and message** of the link | Medium |
| `LNK-06` | Image at a fixed `1200 × 630 px` | Low |
| `LNK-07` | Title editable, with a context-aware suggestion | Low |

### `LNK-08` · The private URL must not be guessable
**Priority P0 for this sprint** · **Complexity** Low

The mock URL `weefly.duckdns.org/p/Jonathan/gold` cannot go to production.

**It is guessable.** Anyone types `/p/Maria/gold` and tries to open someone else's account. **It leaks data in the address bar** — name and account tier visible to anyone looking at the screen, and stored in history and in any URL shortener the link passes through.

Use an opaque token: `weefly.africa/p/8f3a2c91d47b6e05`. The friendly name goes in the **preview title**, which is where the customer sees it.

**Acceptance criteria**
- The private URL contains no name, tier or sequential identifier
- Minimum 128 bits of entropy
- An admin can **revoke and regenerate** the address, keeping the account and history

## Private flow · `VIP`

| ID | Requirement | Complexity |
|---|---|---|
| `VIP-01` | **The contact step disappears.** The customer goes straight to the travel form | Low |
| `VIP-02` | Option **I am booking for someone else**, revealing the other passenger's fields | Low |
| `VIP-03` | Greeting by name | Low |
| `VIP-04` | Headline changes: *Where are we flying to?* first time, *Where are we flying next?* afterwards | Low |
| `VIP-05` | Account tier badge in the header | Low |
| `VIP-18` | Tiers **Gold → Diamond → Platinum**. Gold is the entry tier, granted at registration. Thresholds to be defined | Low |
| `VIP-20` | `Business` / `Individual` is segmentation only. No behavioural or invoicing change for now | Low |
| `VIP-21` | **The private link never expires.** It works as the customer's own app: request new trips, consult previous ones | Low |
| `VIP-21a` | An admin can revoke and regenerate the address, keeping account and history | Low |
| `VIP-22` | **Only an admin creates a VIP customer** | Low |
| `VIP-23` | If a VIP opens the universal link, a discreet banner offers the personal link: *"Jonathan, you have a WeeFly Concierge account. Open your personal link?"* with **Open** and **Continue here**. Never an automatic redirect | Medium |

> `VIP-01` is the largest practical advantage of the private link and what actually makes it feel premium — not the gold, but not having to repeat yourself.

> `VIP-23` must never redirect automatically: it would alarm someone who is booking for another person.

### `VIP-06` · Place-based background image
**Complexity** Medium

Origin city when the customer fills in the departure, destination once the route is chosen. Without a city, **clean background, no image**.

The first says *we know you*. The second says *we are already taking you there*. Two different emotional moments, both worth using.

**Acceptance criteria**
- Curated library of 20 to 30 cities on WeeFly routes, consistent visual treatment
- Neutral fallback for cities outside the library, never an empty frame
- **The image must not compete with the form**: image confined to the top area, or veiled, with the form on a solid card
- Images licensed and stored locally

### `VIP-07` to `VIP-09` · Review before submitting
**Complexity** Low

| ID | Requirement |
|---|---|
| `VIP-07` | Review screen before submitting: the customer sees the summary and confirms |
| `VIP-08` | **Notes and special requests** field on that screen |
| `VIP-09` | Those notes appear in the backoffice in the **left column of the case, below the request summary** |

> `VIP-08` is the most undervalued item in this backlog. It is where *"don't arrive at night"*, *"travelling with my mother who needs a wheelchair"*, *"I must be in Lisbon before 2 pm"* go. No structured form captures this, and it is exactly what makes a concierge worth more than a booking site.

### `VIP-11` and `VIP-12` · Valid tickets shortcut
**Complexity** Low

| ID | Requirement |
|---|---|
| `VIP-11` | Shortcut to valid tickets on the final screen |
| `VIP-12` | The shortcut is **permanently available** in the private link header, with the number of active trips |

> Someone who just bought wants to see what they bought. `VIP-12` is also the reason a customer returns to the link when they are not buying anything.

### `VIP-13` · Auto-close of the pre-travel screen
**Complexity** Low — closes itself after a period and returns to step 1.

### `VIP-16` · Install flow unchanged
**Complexity** Low — Android, iOS and desktop exactly as specified in the handoff package.

## Notifications · `VIP-14` and `VIP-15`
**Complexity** Medium

| ID | Requirement |
|---|---|
| `VIP-14` | Email at every important step, to the customer, to the system and to the backoffice user |
| `VIP-15` | With WhatsApp active, the same notices also go by WhatsApp |

## VIP management · `VIP-17`
**Complexity** Medium

New backoffice menu: **VIP customers**. List, account tier, trip history, value generated, each customer's private link, and the ability to generate or revoke it.

---

# Deferred

Registered, not scoped, not estimated.

| ID | Item | Note |
|---|---|---|
| `DEF-01` | Share and gaming system with rewards | To be worked separately |
| `DEF-02` | Additional services: accommodation and car | Already designed in the ticket document |
| `DEF-03` | *Make the wait fun* — the waiting screen | Concept stage |
| `DEF-04` | Commissions: referral link, affiliate promo code, agent booking for others | Needs a commercial model first |
| `DEF-05` | **Wallet and rewards balance** | See below |

### On `DEF-05`

A balance in dollars on a screen is a promise. From the moment the customer sees it, they expect to spend it. If it can be redeemed against a future purchase it is not gamification, it is a **financial liability** with accounting consequences.

Decision taken: **it appears on no screen in this phase.** Better to show nothing than to show it and walk it back.

---

# Open questions

| # | Question | Blocks |
|---|---|---|
| `Q1` | Does the internal chat replace WhatsApp or run alongside it? | `NEW-01` scope |
| `Q2` | Who may propose new dates — any agent, or a supervisor only? | `BO-04` permissions |
| `Q3` | How long are chat messages, uploads and the live log kept? | `LIVE-03`, `NEW-01` architecture |
| `Q4` | Does the customer get notified of every backoffice change, or only the important ones? | `VIP-14` |
| `Q5` | Who takes a request that arrives with no seller attached — open queue, rotation, or by market? | Queue model |
| `Q6` | Should number formatting follow the language or the currency? | Front-end formatting |
| `Q7` | What else belongs to **Concierge** besides the Price Checker? | Menu structure |
| `Q8` | Thresholds for Gold, Diamond and Platinum | `VIP-18` |

---

# Two things that must not be lost

**The passenger tags `P1 P2 P3`.** Generated from the request, shown at payment, printed on the ticket. They are what removes the ambiguity of which ticket belongs to whom. Same tag, same order, everywhere.

**The distinction between a guaranteed and an indicative price.** `guaranteed` may only be set when the fare is actually held in Amadeus with an option time. Everything else is `subject to reconfirmation`. Never show a countdown next to a price that is not held.
