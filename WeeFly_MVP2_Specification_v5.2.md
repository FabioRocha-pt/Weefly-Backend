# WeeFly — MVP 2 · The partner platform, built on MVP 1

**Build specification. Everything in this document ships together.**

| | |
|---|---|
| **Version** | 5.2 |
| **Date** | September 2026 |
| **Raised by** | Ivandro Ribeiro, product and design |
| **Supersedes** | v5.1, and the MVP definition in `WeeFly_Sprint4_and_MVP_v4.0` |
| **Launch** | MVP 1 this week · MVP 2 the week after |
| **Stack** | Next.js 14 · Supabase · Resend · PM2 · NGINX on EC2 |
| **Target** | `concierge.weefly.africa` · Elastic IP `52.30.78.0` |
| **Work packages** | 5 blocks, 48 items |

---

## What this adds, in one sentence

**WeeFly keeps selling tickets, and adds a second business on the same platform: hosting partners who sell to their own markets.**

This is an upgrade, not a pivot. **MVP 1 stays on the platform and launches first.** MVP 2 is built on top of it. Nothing that exists is replaced; the concierge that sells to travellers keeps working exactly as designed.

Alô is the first partner to run on the platform — B2G, under its own brand.

| | Status |
|---|---|
| **MVP 1** · WeeFly's own concierge, B2C and B2G | Launches this week |
| **MVP 2** · the partner layer, starting with Alô | The week after |

The order is also technically right: **MVP 1's corrections are the foundation MVP 2 stands on.** Both run on the same engine.

---

## Three layers

| Layer | Who uses it | What it does |
|---|---|---|
| **WeeFly Admin** | WeeFly · Dominik, finance, operations | Creates and controls partners, holds all data, tracks revenue |
| **Partner backoffice** | Alô | Manages ministries, quotes, issues tickets. **Intended to be fully autonomous** |
| **Ministry front** | The ministry secretary | Requests trips, chooses offers, supplies passengers, sees their tickets |

WeeFly can intervene in Alô's backoffice when needed, but the goal is that they never need it.

## Where the money moves

**Outside the platform.** Payment happens directly between the ministry and Alô. WeeFly does not touch that transaction. The platform records it, releases issuance against it, and deducts it from the ministry's budget.

**On partner sales, WeeFly's revenue is not the ticket.** It is a fee for every account created, plus a percentage per issuance still being agreed with Alô. On its own concierge, WeeFly keeps selling tickets as before. See `ADM-07` and Decisions.

---

## The account model — two menus

This is the base everything else is built on. Read it before Block A.

### Every account has two menus

| Menu | What it is | Default |
|---|---|---|
| **Menu 1 · Supply products** | The account is a supplier. It inserts products and guarantees their availability | Available on registration, after Admin approval and audit |
| **Menu 2 · Sell products** | The account is a seller | **Closed** until the Admin opens it |

A company can register as supplier only, and later — once an agreement exists — also sell. **One account, both menus, the history never splits.** Do not model supplier and seller as separate account types.

### Supplier availability — three options per product

| Option | Who can sell it |
|---|---|
| **Only me** | The supplier itself, under a prior agreement with the Admin |
| **Authorised sellers** | A list the supplier or Admin chooses |
| **Open** | Any seller the Admin has approved |

The supplier only guarantees availability. Products are unlimited in number.

> The middle option exists because the Concierge needs it. Offering it to every supplier costs nothing extra.

### Two ways to sell, inside Menu 2

| Mode | Brand | Example |
|---|---|---|
| **Official WeeFly reseller** | WeeFly | Anyone selling tickets B2C through the WeeFly system |
| **White label** | The seller's own | Alô |

**The two must be distinct in the data from day one.** They change the logo, the email sender, the domain and — almost certainly — the commission. Treating them as the same thing gives the reseller an unbranded front, or gives the white label the WeeFly brand.

A white-label seller chooses what the customer link shows:

- **Their own front**, with a discreet *Powered by WeeFly* at the bottom
- **The standard WeeFly screen**, unchanged

### B2B is a licence, not a channel

| Term | What it is |
|---|---|
| **B2C** · **B2G** | Who you sell to. Configured per account in the Admin |
| **B2B** | The licence WeeFly grants a partner to sell under their own brand. **Granted only by WeeFly, after an agreement made outside the platform** |

Do not model B2B as a customer channel alongside B2C and B2G.

### The Concierge is a product WeeFly supplies

Flights are a product like any other, with one difference: **WeeFly is the supplier**, and availability is set to *authorised sellers*. It is the core business.

| Authorised to sell the Concierge | Channels |
|---|---|
| WeeFly | B2C and B2G |
| Alô | B2G |

The source is the airlines, through the GDS and the consolidator. **There is no WeeFly inventory to hold and no calendar to block** — do not put flights in the shared calendar.

### Scope right now: flights only

Cars, houses, experiences and food stay **listed and not built** until the Alô delivery is complete. The model above already supports them — that is the point of building it this way — but no product other than the Concierge is developed in this release.

### Amadeus, for the record

WeeFly has an active Amadeus contract, already working on `weefly.africa`. It connects to the backoffice **after this MVP**, and later directly to the customer. Not in scope now — recorded so the data model does not rule it out.

---

## The correction that cannot be skipped

Skipping MVP 1 does not mean skipping the Sprint 4 corrections. **Alô runs on the same engine.**

| Correction | Why Alô needs it |
|---|---|
| `T-04` · issuance has no return-flight fields | Ministry trips are round trips. Without this, no ministry ticket can be issued |
| `T-02` · dead end on changing offer | Same screen, same customer flow |
| `T-22` · duplicated events | A ministry secretary receiving 22 identical messages is worse than a retail customer receiving them |
| `T-08` · language ignored | Already closed in Sprint 3.1 for screens 1–14 |
| `T-03` · backoffice does not react live | Alô's team has the same problem |
| `T-11` · payment deadline not automatic | The deadline is what guarantees the fare against the ministry's funds |
| `T-01` · quoting an unclaimed case | Alô will have several agents |

These are the foundation of MVP 2, not a leftover from MVP 1.

---

# Block A · Tenancy foundation

The layer everything else sits on.

### `TEN-01` · Three-level model
**Complexity** High

```
Partner   (WeeFly Concierge · Alô)
  └─ Organisation   (Ministry of Health · Ministry of Education)
       └─ Case      (what exists today)
```

Every case gains `partner_id` and `organisation_id`. Every existing case is backfilled to the WeeFly partner.

**Acceptance criteria**
- Both fields are non-null on every case, existing and new
- A case can never be created without a partner
- Organisation is optional: WeeFly's own retail cases have none

### `TEN-02` · Brand configuration, two levels
**Complexity** Medium

Partner-level: logo, primary colour, dark colour, sender name, sender address, reply-to, footer, `powered_by_weefly` toggle.

Organisation-level: **ministry name and ministry logo only.** A ministry does not get its own colour scheme — it gets its crest on Alô's design.

**Acceptance criteria**
- No colour hard-coded anywhere; all read from tokens populated at render
- Ministry logo appears in the front header beside Alô's
- Falls back cleanly when a ministry has no logo

### `TEN-03` · Query isolation
**Complexity** High · **Not optional**

**Acceptance criteria**
- Every query filtered by the partner of the authenticated user
- Supabase row-level security enforces it at the database, not only in application code
- Opening another partner's case by direct URL returns not-found, not forbidden
- Exports, search and reports respect the same boundary
- One explicit test per partner proves it

> Row-level security is the right tool here. Filtering only in the application means one forgotten `where` clause exposes a partner's cases to another.

### `TEN-04` · Addressing
**Complexity** Medium

**One subdomain per partner, path per ministry.**

```
alo.weefly.africa/m/saude/...
alo.weefly.africa/m/educacao/...
```

Not a subdomain per ministry: that would mean a DNS record and a certificate for each one. Same effect, zero operational cost.

**Acceptance criteria**
- Wildcard certificate on `*.weefly.africa`
- The subdomain resolves the partner; the path resolves the ministry
- An unknown partner or ministry returns a branded not-found, never a stack trace

### `TEN-05` · Powered by WeeFly
**Complexity** Low

Displayed in the footer of the partner backoffice, the admin backoffice and the ministry front. Toggle per partner, default on.

### `TEN-06` · Access model — **scope reduced, and it matters where**
**Complexity** Medium · **Revised**

There are two things inside what we were calling `RBAC`, and only one of them ships now.

| Part | Decision | Why |
|---|---|---|
| **The management screens** — create users, assign profiles, edit permissions | **Out of this release** | In this phase only Dominik administers. Accounts are created by hand in Supabase |
| **The data model** — every user belongs to a partner, every query filters by it | **Ships now** | Alô's staff will log in. The moment a second account exists that is not WeeFly's, isolation has to already be there |

**What must be in the code from the first day, even with one user:**

- `partner_id` on the user and on the case, never null, never inferred
- Row-level security active in Supabase from the start, not added later
- **No code path anywhere assumes "the partner is WeeFly"**
- The current user's partner comes from the session, never from a parameter

**Acceptance criteria**
- Login lands on Concierge by default
- Modules the account does not have show as locked with `Brevemente`, and are unreachable by direct URL
- A user created by hand in Supabase with a different `partner_id` sees only that partner's cases — tested explicitly
- Adding the management screens later requires no change to any query

> The reason to keep the model and drop the screens: adding an admin screen later is a new page. Adding isolation later means revisiting every query in the system, and that is where leaks are born. **This is the difference between postponing and owing.**

# Block B · WeeFly Admin backoffice

The master panel. Reuses the existing backoffice and expands it.

### `ADM-01` · Partner registration
**Complexity** Medium

Creating Alô requires this, so the minimal version ships now.

Fields: commercial name, legal name, NIF, country, address, contact person, email, phone, brand configuration, contract start date, status.

**Acceptance criteria**
- Only a WeeFly Admin can create a partner
- Creating a partner creates its first admin account and sends the invitation
- A partner can be suspended without being deleted; suspension blocks login and freezes their links

### `ADM-02` · User and permission management
**Complexity** High · **Deferred — see `TEN-06`**

Not in this release. Accounts are created by hand in Supabase while only Dominik administers. The criteria below describe the screen when it arrives; the data model it needs already exists from day one.

**Acceptance criteria**
- Create, edit, suspend and delete accounts
- Assign profile and modules
- A user belongs to exactly one partner
- WeeFly staff accounts belong to the WeeFly partner and carry a cross-partner flag
- Every permission change is logged with author and timestamp

### `ADM-03` · Consolidated analytics
**Complexity** Medium

The panel Dominik asked for, before an automated engine exists.

**Acceptance criteria**
- Total tickets issued, by partner and by ministry
- Unit cost and aggregate cost
- Issuance dates and timeline
- Who issued each ticket
- Filters: today, week, month, year, custom range
- Export to CSV

> This was previously out of the MVP as "metrics do not sell tickets". That judgement was about operational metrics. **This is how WeeFly knows what it is owed by a partner** — it is commercial control, and it is in.

### `ADM-04` · All partner data, admin only
**Complexity** Medium

**Acceptance criteria**
- WeeFly Admin can view every partner's cases, ministries and tickets
- Organised by partner, then by ministry
- Read-only by default; intervening requires an explicit action that is logged
- Not visible to partner accounts, ever

### `ADM-05` · Locked future modules
**Complexity** Low

Agent, suppliers, experiences, vehicles, accommodation — present in the navigation, locked, marked `Brevemente`.

### `ADM-06` · Alert recipients
**Complexity** Low

Per partner and per ministry: who receives budget alerts, at WeeFly and at the partner.

### `ADM-07` · Revenue model
**Complexity** Medium · **Blocked on a decision**

Two components, neither yet defined:

| Component | Question |
|---|---|
| **Percentage per issuance** | What percentage, of what base — ticket cost, or the amount charged to the ministry? |
| **Platform fee** | Monthly or annual? What amount? Does it vary by partner size? |

**Acceptance criteria once decided**
- Configurable per partner, not hard-coded
- Calculated at issuance and stored on the case, so changing the rate later does not rewrite history
- Visible in `ADM-03` per partner and per period
- Included in the CSV export

> The account fee matters more than it looks: **it makes WeeFly's revenue independent of the partner's success.** Revenue starts the day a partner is onboarded, not the day they first sell. Whether it is charged once or monthly is `D7`.

---

# Block C · Partner backoffice · Alô

### `PAR-01` · Opens on Concierge
**Complexity** Low — default landing module, other modules locked per `TEN-06`.

### `PAR-02` · Ministry management
**Complexity** Medium

List of active ministries. Per ministry: name, **ministry logo**, secretary name, secretary contacts, unique link, order history, budget balance.

**Acceptance criteria**
- Alô creates and manages ministries without WeeFly
- The link is generated on creation and can be regenerated
- History persists across secretary changes, per `PAR-04`

### `PAR-03` · Ministry budget ledger
**Complexity** High · **The core of the B2G model**

This is how public money works in Cabo Verde, and it replaces an approval workflow entirely.

| Mechanism | How |
|---|---|
| **Bolsa** | The ministry pre-funds an amount, held and available for travel |
| **Carta conforto** | The ministry issues a comfort letter; Alô presents it at the bank and the funds are made available |

The available amount is entered into the system. **Every validated issuance deducts from it.**

**Acceptance criteria**
- Balance per ministry, with a full movement history
- Each movement: date, amount, type (credit or debit), case reference, who recorded it
- Issuing deducts automatically, at the moment of issuance
- Manual credit when the ministry tops up, recorded with the document reference
- A ticket cannot be issued if the balance does not cover it — hard block, with a clear message
- Balance visible to Alô and to WeeFly Admin, never to the ministry secretary unless explicitly enabled

> **Why this removes the need for an approval step.** In a normal public body, someone authorises spending before it is committed. Here the authorisation already happened — it is the funding. The money is in place before the first request is made, which is also **why the fare can be guaranteed**: when the secretary accepts an offer within the deadline, the funds are already available and Alô can issue immediately.

### `PAR-04` · Secretary changes
**Complexity** Low

When a secretary leaves, Alô **creates a new account** rather than editing the old one, so the record of who did what survives.

**Acceptance criteria**
- The outgoing account is deactivated, not deleted
- History stays attached to the ministry, not to the person
- The new account inherits the ministry and its full history
- The link is regenerated and sent to the new secretary
- The old link stops working immediately

### `PAR-05` · Budget alerts
**Complexity** Medium

**Acceptance criteria**
- Configurable threshold per ministry, as an amount or a percentage
- Crossing it triggers an alert **by email, then by WhatsApp**
- Recipients: the responsible person at Alô and at WeeFly, per `ADM-06`
- Repeated at defined intervals while the balance stays below threshold, without becoming noise — maximum one per day
- Alerts are recorded on the ministry, not only sent

### `PAR-06` · Quote and offer
**Complexity** Low · **Reuses what exists**

Price research, offer composition, link 2 to the ministry. The engine is the one already built. Nothing new except which partner it belongs to.

### `PAR-07` · External payment confirmation
**Complexity** Medium

Payment happens between the ministry and Alô, outside the platform. The platform records it and releases issuance.

**Acceptance criteria**
- A **Confirm external payment** action on the case
- Records amount, date, method, reference and who confirmed it
- Supporting document optional, not required — the budget ledger is the real control
- Confirming releases issuance and deducts from the ministry balance
- Reversible by a partner admin, with the reversal logged and the balance restored

### `PAR-08` · Financial tracking
**Complexity** Medium

**Acceptance criteria**
- Per ticket: cost, amount charged, WeeFly commission, issuance date, who issued
- Per ministry: total issued, total consumed, balance
- Export to CSV
- Matches `ADM-03` exactly — same numbers, different scope

---

# Block D · Ministry front · the link as an app

### `MIN-01` · Application shell with bottom navigation — **shared by both link types**
**Complexity** Medium · **Revised**

This is not the Price Checker with a different logo. It is an application shell, and it is **the entry point of every personalised link** — the ministry link and the private customer link alike.

| | Ministry link | Private customer link |
|---|---|---|
| Main tab | New request | New request |
| Second tab | My trips | My trips |
| Requester data | Known, from the ministry | Known, from registration |
| Passenger data | The secretary enters it | The customer enters it, or reuses it |
| Branding | Alô + ministry crest | WeeFly, or the partner |

**The only real difference** is that the private link asks for the customer's own details once, on the first visit, and never again. After that the two behave identically.

One component, two configurations. It replaces `VIP-11` and `VIP-12` from the previous document, which described the same thing for the retail side.

| Tab | Content |
|---|---|
| **New request** | Default active. Step one of the Price Checker: dates, destination, passengers, routing |
| **My trips** | Active trip at the top, then a vertical archive of issued, used and expired tickets for that ministry |

**Acceptance criteria**
- Fixed bottom bar, always visible
- `New request` is the default state on opening
- `My trips` shows the active trip prominently, archive below
- Archive scrolls, filtered to that ministry's link only

> The shell already exists in design as the private VIP link — permanent link, shortcut to valid tickets. That work carries over.

### `MIN-02` · Ministry branding in the header
**Complexity** Low — Alô's brand plus the ministry crest.

### `MIN-03` · Passenger data entered by the secretary
**Complexity** Medium

The secretary is the ministry's contact and enters everything, for every traveller.

Per passenger: given names, surnames, date of birth, sex, nationality, passport number, expiry, issuing country, **and now phone and email**.

**Acceptance criteria**
- Contact fields are new in the field contract
- Marked as *for operational support only*, with a short explanation of why they are asked
- Passport expiry warning if it does not cover six months beyond return
- Passenger records are reusable: typing a name that matches a previous traveller offers to reuse their data

> The contacts exist so that Alô's concierge team can reach the traveller directly during a disruption, and so the traveller can reach the team. That is the whole justification, and it should be written on the screen.

### `MIN-04` · WhatsApp, for support only
**Complexity** Low

A floating button that reaches **Alô**, not WeeFly.

**Acceptance criteria**
- Number comes from the partner configuration
- Opens with the ministry name and reference pre-written
- Present on every screen of the link
- Its stated purpose includes requesting a replacement link if access is lost

### `MIN-05` · Onboarding email
**Complexity** Low

The first email carries the link and complete access instructions: what it is, how to save it to the home screen, what each tab does, and how to get help.

**Acceptance criteria**
- Sent when the ministry is created and whenever the link is regenerated
- Carries Alô's branding and `powered by WeeFly`
- Includes the install instructions per platform, as already specified

### `MIN-06` · Install as an app
**Complexity** Low — the existing PWA specification, unchanged. Android one tap, iOS three steps, desktop shortcut.

### `MIN-07` · Offer acceptance guarantees the fare
**Complexity** Low

**Acceptance criteria**
- The offer states its deadline, and the countdown derives from the send timestamp
- Accepting within the deadline moves the case straight to issuance, because the funds are already available
- If the balance does not cover it, the secretary sees a clear message and Alô is alerted

---

# Block E · Passenger records and retention

### `DAT-01` · Reusable passenger records
**Complexity** Medium

**Acceptance criteria**
- Passenger records belong to the ministry, not to the case
- Reusable on a new request, with the data pre-filled and confirmable
- Editable, with a history of changes

### `DAT-02` · Passport expiry reminders
**Complexity** Low

**Acceptance criteria**
- Alert when a stored passport is within six months of expiry
- Sent to the ministry secretary, so the ministry can act
- Also flagged in Alô's backoffice

### `DAT-03` · Retention and legal basis
**Complexity** Low to build, **blocked on a legal answer**

Storing passport data and personal contacts of state employees, held by a private company, needs a legal basis and a retention period.

**Acceptance criteria once decided**
- Retention period configurable and enforced
- Automatic anonymisation when it expires: passport numbers wiped, names retained for accounting
- An explicit consent text on the screen where the secretary enters the data
- Export and erasure on request

> The intention behind keeping this data is sound — reissue, renewal reminders, faster repeat bookings. **The intention is not the legal basis.** This needs an answer before launch, not after.

---

# Migration and domains

### `MIG-01` · Permanent redirect from the old domain
**Complexity** Low · **Do before switching off the old machine**

Every link already sent points to `weefly.duckdns.org`. Customers will click proposal links from WhatsApp after the move, and private links are defined as **never expiring**.

**Acceptance criteria**
- The old domain stays live, serving only a `301` permanent redirect
- The path and query string are preserved: `weefly.duckdns.org/pc/8IdIXN…` opens `concierge.weefly.africa/pc/8IdIXN…`
- Kept running for **at least six months**
- Tested with a real link from an existing case before the old machine goes down

### `MIG-02` · No hard-coded domains
**Complexity** Low

**Acceptance criteria**
- Every generated link reads its base URL from configuration
- Partner links resolve from the partner's own subdomain, per `TEN-04`
- Changing domain again later requires no code change

---

# Sequence

Not sprints. This is the order that keeps the system working at every step.

| Order | Block | Why here |
|---|---|---|
| 0 | **AWS migration** and `MIG-01` `MIG-02` | Everything below deploys to the new server. Set the redirect before the old one goes down |
| 1 | Sprint 4 corrections | Shared engine. Alô cannot issue a round trip until `T-04` is done |
| 2 | `TEN-01` `TEN-03` | The tenancy model and its isolation. Every later query depends on the shape |
| 3 | `TEN-06` `ADM-01` `ADM-02` | Accounts, modules and the ability to create Alô at all |
| 4 | `TEN-02` `TEN-04` `TEN-05` `I18N-01` | Branding, addressing, and the backoffice in two languages — both touch every screen, so do them in the same pass |
| 5 | `PAR-01` `PAR-02` `PAR-03` `PAR-04` `PAR-05` | Alô's backoffice and the budget ledger |
| 6 | `MIN-01` to `MIN-07` | The ministry front |
| 7 | `PAR-06` `PAR-07` `PAR-08` | Fulfilment and financial tracking |
| 8 | `ADM-03` `ADM-04` `ADM-06` `ADM-07` | WeeFly's control panel |
| 9 | `DAT-01` `DAT-02` `DAT-03` | Passenger records |

---

# What is reused, and what is new

This is the honest split, and it is the answer to "what will this cost".

| Reused, no rework | New build |
|---|---|
| The whole request flow, screens 1–14 | Tenancy model and isolation |
| Three language dictionaries, 1540 keys | Module-level permissions |
| The offer composer | Partner registration |
| Passport collection | Ministry management |
| Payment method selection and proof | **Budget ledger** |
| The issuance screen, once `T-04` lands | Application shell with bottom navigation |
| The ticket PDF | Admin analytics |
| The notification engine | Passenger records |
| The state machine `E1`–`E5` | Revenue calculation |
| The PWA install flow | |

**Roughly two thirds of the product is already built.** What is new is the layer that turns one company's tool into a platform several companies run on.

---

# Decisions

## Answered by Dominik, 20 September

| # | Question | Answer |
|---|---|---|
| `D2` | Platform fee? | **A fee for every account created**, covering development and infrastructure |
| `D3` | Who carries infrastructure cost? | Recovered through the account fee |
| `D4` | Does the retail concierge still launch? | **Yes, it is the priority.** MVP 1 this week, MVP 2 the week after |
| `D5` | Cancellations, refunds, no-shows? | **The airline's own rules** for the fare chosen, passed through to the client |
| `D6` | Who reviews the Dutch? | Dominik — eight corrections received and applied |

## Still open

| # | Question | Blocks |
|---|---|---|
| `D1` | Commission percentage per issuance, and of what base. **Being agreed directly with Alô** | `ADM-07` |
| `D7` | Is the account fee charged once on creation, or monthly? | `ADM-07` |
| `D8` | Does the commission differ between an official reseller and a white label? | `ADM-07` |
| `D9` | When a traveller does not fly, what happens to money already drawn from a ministry's budget? Contract with Alô, reflected in the software | `PAR-03` |
| `O1` | Who at Alô receives budget alerts? | `ADM-06` |
| `O2` | Should the ministry see its own balance, or only Alô? | `PAR-03` |
| `L1` | Legal basis for storing passport data and contacts of state employees | `DAT-03` |
| `L2` | Retention period | `DAT-03` |
| `L3` | Must the data be hosted in Cabo Verde? The server is in AWS Ireland | Infrastructure |

---

# Languages and copy

### Four languages on the public terminal

**Portuguese · English · French · Dutch.** Three already exist with 1540 keys each, kept aligned by `npm run i18n:check`. **Dutch is new and has none** — the full dictionary has to be built.

| Language | Source of truth |
|---|---|
| Portuguese | `WeeFly_Concierge_Sprint_3_1_UI_Copy.md`, register `você` |
| English | Same document |
| French | **The client's deck, `TEXT_CHATBOT_-_FRENCH.pptx`** — supersedes our earlier French on every screen it covers |
| Dutch | **`WeeFly_Copy_Four_Languages_v2.1.pdf`**, with Dominik's eight corrections |

### Three rules on the client's corrections

**Render in sentence case.** The client wrote his corrections in capitals for emphasis — his document is headed *"TEXT CORRECTION [IN CAPITAL LETTERS]"*. The no-capitals rule from Sprint 3.1 still stands: `AANVRAAGSTATUS – WORDT VERWERKT` renders as `Aanvraagstatus – wordt verwerkt`.

**One Dutch line is pending.** `Geen ruimbagage` was corrected to `Ingecheckt bagage`, which changes it from the field's *value* ("no checked bag") to its *label* ("checked baggage"). Awaiting confirmation. Until then, use the correction as the label and keep a separate value for none selected.

**`option` becomes `offer` everywhere**, in all four languages and in the backoffice: `Oferta` · `Offer` · `Offre` · `Aanbieding`.

### Changes from the client, applied in all four languages

- **A Close action** on the offers screen, ending the request and returning to the start
- **Previous steps collapse** into single lines with a `View` action
- **Issuance promised within a maximum of one hour**, not thirty minutes, and never described as automatic: *Votre billet émis dès que votre paiement sera validé*

### Backoffice in two languages · `I18N-01`
**Complexity** Medium

The backoffice is available in **Portuguese and English**. Two languages, not four — French and Dutch are for the public terminal only.

| | Public terminal · `/pc` | Backoffice · `/admin` |
|---|---|---|
| **Languages** | PT · EN · FR · NL | **PT · EN** |
| **Who chooses** | The case `lang`, from the link | The user, in Settings |
| **Default** | From the link parameter | **Portuguese** |
| **Dictionary** | The existing public one | **A separate backoffice dictionary** |

**Acceptance criteria**
- Every backoffice string comes from a dictionary, none hard-coded — same discipline as Sprint 3.1 on `/pc`
- Language selector in **Settings, inside the user menu**. It is set once, so it is not on the main screen
- The choice is stored on the user and persists across sessions and devices
- Default is Portuguese for every account
- A build check keeps PT and EN aligned, as `npm run i18n:check` already does for the public dictionaries
- Dates and numbers follow the chosen language

**The rule that must not be broken:**

> **The backoffice language only changes what the agent sees. It never changes what the customer receives.**

An agent working in Portuguese who issues a ticket for a French customer sends that customer **French** — in the emails, the WhatsApp messages, the link and the ticket PDF. Everything customer-facing follows the **case** language, never the agent's.

Where this applies in the code: the helpers from Sprint 3.1 that take an optional translator — passenger counts, baggage, cabin, dates — must receive the **case** translator when building anything for the customer, and the **agent** translator only when rendering the backoffice screen. Mixing the two is the most likely bug in this item.

**Also check:**
- The ticket PDF currently carries bilingual labels. It must follow the case language across all four
- Internal notes and the activity log stay in whatever language the agent typed; they are not translated
- System-generated log entries — *case claimed*, *payment confirmed* — are stored as event codes and rendered in the reader's language, not stored as text

### Payment methods: four

**Stripe · InstaPay · Vinti4 · Revolut.** PayPal is removed from every screen and every language.

---

---

# Annex A · Interface copy in four languages

The customer-facing copy for screens 1 to 14 of the public terminal, as approved. **This is the source for the Dutch dictionary**, and the reference for the three existing ones.

Lines marked **✎** were corrected by Dominik on 20 September.

### How to read it

- **Render in sentence case.** The corrections arrived in capitals for emphasis; nothing on screen is in capitals
- **`{name}` · `{time}` · `{n}`** are placeholders. Keep each sentence as **one key** with the placeholders inside — the `Sentence` component from Sprint 3.1 — so word order can differ between languages
- **French** on screens 4–14 comes from the client's deck and must not be re-translated
- **Dutch** is new throughout. These ~56 lines are the visible copy; **the full dictionary is ~1540 keys** and covers errors, plurals, dates and emails not shown here
- **Pending:** the Dutch baggage line — `Ingecheckt bagage` is a field *label*. Keep a separate value for "none selected" until the client confirms

### Screen 1 · The trip form

| Element | Português | English | Français | Nederlands |
|---|---|---|---|---|
| Steps | 1. Viagem · 2. Contactos · 3. Confirmação | 1. Trip · 2. Contacts · 3. Confirm | 1. Voyage · 2. Contacts · 3. Confirmation | 1. Reis · 2. Contact · 3. Bevestiging |
| Title | Encontre o melhor preço para o seu voo | Find the best price for your flight | Trouvez le meilleur tarif pour votre vol | Vind het beste tarief voor uw vlucht |
| Trip type | Ida e volta · Só ida · Multi-destino | Round trip · One way · Multi-city | Aller-retour · Aller simple · Multi-destinations | Heen en terug · Enkele reis · Meerdere bestemmingen |
| Passengers | {n} passageiro · {n} passageiros | {n} passenger · {n} passengers | {n} passager · {n} passagers | {n} passagier · {n} passagiers |
| Cabin | Económica · Executiva | Economy · Business | Économique · Affaires | Economy · Business |
| Baggage ✎ | Sem bagagem de porão | No checked bag | Sans bagage en soute | Ingecheckt bagage |
| From · To | De · Para | From · To | De · Vers | Van · Naar |
| Placeholders | De onde parte? · Para onde vai? | Where are you leaving from? · Where are you going? | D'où partez-vous ? · Où allez-vous ? | Waar vertrekt u vandaan? · Waar gaat u naartoe? |
| Dates | Partida · Regresso | Departure · Return | Départ · Retour | Vertrek · Terugreis |
| Button | Continuar | Continue | Continuer | Doorgaan |

### Screen 2 · Contacts

| Element | Português | English | Français | Nederlands |
|---|---|---|---|---|
| Title ✎ | Como o contactamos | How do we reach you? | Comment vous contacter | Hoe wij u bereiken |
| Channels | Recebe as ofertas por WhatsApp · Recebe as ofertas por email | You'll receive your offers on WhatsApp · by email | Vous recevrez vos offres sur WhatsApp · par e-mail | U ontvangt uw aanbiedingen via WhatsApp · per e-mail |
| Name | Nome completo · Como no passaporte | Full name · As in the passport | Nom complet · Comme sur le passeport | Volledige naam · Zoals in uw paspoort |
| Phone | Telefone (WhatsApp) | Phone (WhatsApp) | Téléphone (WhatsApp) | Telefoon (WhatsApp) |
| Phone hint | Enviamos as ofertas para este número. Guardamos como {telefone}. | We send your offers to this number. We'll save it as {phone}. | Nous envoyons les offres à ce numéro. Nous l'enregistrons comme {téléphone}. | Wij sturen de aanbiedingen naar dit nummer. Wij slaan het op als {telefoon}. |
| Email | Email | Email | E-mail | E-mailadres |
| Consent | Autorizo a WeeFly a contactar-me e a tratar os meus dados para este pedido, segundo a política de privacidade. | I authorise WeeFly to contact me and to process my data for this request, under the privacy policy. | J'autorise WeeFly à me contacter et à traiter mes données pour cette demande, conformément à la politique de confidentialité. | Ik geef WeeFly toestemming om contact met mij op te nemen en mijn gegevens te verwerken voor deze aanvraag, volgens het privacybeleid. |
| Button | Rever pedido | Review request | Vérifier ma demande | Aanvraag controleren |

### Screen 3 · Confirm the request

| Element | Português | English | Français | Nederlands |
|---|---|---|---|---|
| Title | Confirme o seu pedido | Confirm your request | Confirmez votre demande | Bevestig uw aanvraag |
| Lead | Verifique os seus dados e confirme | Check your information and confirm | Vérifiez vos informations et confirmez | Controleer uw gegevens en bevestig |
| Rows | Tipo de viagem · Rota · Datas · Passageiros · Classe · Bagagem de porão · Nome · Telefone · Email | Trip type · Route · Dates · Passengers · Cabin · Checked bags · Name · Phone · Email | Type de voyage · Itinéraire · Dates · Passagers · Classe · Bagages en soute · Nom · Téléphone · E-mail | Type reis · Route · Data · Passagiers · Klasse · Ruimbagage · Naam · Telefoon · E-mail |
| Edit link | Editar | Edit | Modifier | Wijzigen |
| Special request | Algo que devamos saber? (opcional) | Anything we should know? (optional) | Quelque chose à nous signaler ? (facultatif) | Iets wat wij moeten weten? (optioneel) |
| Its example | Ex.: viajo com a minha mãe em cadeira de rodas; prefiro não chegar de noite. | E.g. I'm travelling with my mother, who uses a wheelchair; I'd rather not arrive at night. | Ex. : je voyage avec ma mère en fauteuil roulant ; je préfère ne pas arriver la nuit. | Bijv.: ik reis met mijn moeder in een rolstoel; ik kom liever niet 's nachts aan. |
| Button | Enviar pedido | Send request | Envoyer la demande | Aanvraag versturen |

### Error messages

| Element | Português | English | Français | Nederlands |
|---|---|---|---|---|
| No origin | Indique a cidade de partida | Enter your departure city | Indiquez votre ville de départ | Geef uw vertrekplaats op |
| No destination | Indique o destino | Enter your destination | Indiquez votre destination | Geef uw bestemming op |
| Same city twice ✎ | A partida e o destino têm de ser diferentes | Departure and destination must be different | Le départ et la destination doivent être différents | Vertrekplaats en bestemming moeten verschillend zijn |
| No dates | Escolha as datas da viagem | Choose your travel dates | Choisissez vos dates de voyage | Kies uw reisdata |
| Return before departure ✎ | O regresso tem de ser depois da partida | The return must be after the departure | Le retour doit être après le départ | De terugreis moet na vertrek plaatsvinden. |
| Name too short | Indique o nome e o apelido | Enter your first and last name | Indiquez votre nom et votre prénom | Geef uw voor- en achternaam op |
| Invalid phone | Indique um número válido | Enter a valid number | Indiquez un numéro valide | Geef een geldig telefoonnummer op |
| Invalid email | Indique um email válido | Enter a valid email address | Indiquez une adresse e-mail valide | Geef een geldig e-mailadres op |
| Consent not ticked | Precisamos desta autorização para continuar | We need this authorisation to continue | Nous avons besoin de cette autorisation pour continuer | Wij hebben deze toestemming nodig om verder te gaan |

### Screens 4 to 14 · the link

| Element | Português | English | Français | Nederlands |
|---|---|---|---|---|
| Request received | Obrigado pelo seu pedido, {nome} | Thank you for your request, {name} | Merci pour votre demande, {nom} | Bedankt voor uw aanvraag, {naam} |
| Being processed | O seu pedido está em tratamento | Your request is being processed | Votre demande est en traitement | Uw aanvraag wordt behandeld |
| Team will send | A nossa equipa enviará as melhores ofertas o mais rapidamente possível | Our team will send you the best offers as soon as possible | Notre équipe vous enverra les meilleures offres dans les plus brefs délais | Ons team stuurt u zo snel mogelijk de beste aanbiedingen |
| Request status ✎ | Estado do pedido · Em tratamento | Request status · In progress | Statut de la demande · En cours de traitement | Aanvraagstatus – wordt verwerkt |
| Offers sent | Ofertas enviadas · Por WhatsApp, email e neste link | Offers sent · On WhatsApp, by email and on this link | Offres envoyées · Sur WhatsApp, par e-mail et sur ce lien | Aanbiedingen verzonden · Via WhatsApp, per e-mail en via deze link |
| Offer validity | Esta oferta é válida até às {hora} | This offer is valid until {time} | Cette offre est valable jusqu'à {heure} | Deze aanbieding is geldig tot {tijd} |
| Choose offer | Escolho esta oferta | I choose this offer | Je choisis cette offre | Ik kies deze aanbieding |
| Team comment | Comentário da equipa | Comment from the team | Commentaire de l'équipe | Opmerking van het team |
| Close request | Fechar pedido | Close request | Fermer la demande | Aanvraag sluiten |
| Passengers | Dados dos passageiros e pagamento | Passenger details and payment | Info passager et paiement | Passagiersgegevens en betaling |
| As in passport | Introduza os dados tal como aparecem no passaporte | Enter your details exactly as they appear on your passport | Entrez vos informations telles qu'elles apparaissent sur votre passeport | Voer uw gegevens in zoals ze op uw paspoort staan |
| Pay in time | Pague dentro deste prazo para manter o preço | Pay within this window to keep the price | Payez dans ce délai pour conserver le prix | Betaal binnen deze termijn om de prijs te behouden |
| Payment methods | Escolha o método de pagamento. Aceitamos todo o tipo de pagamento em qualquer parte do mundo. | Choose your payment method. We accept all types of payment worldwide. | Choisissez votre méthode de paiement. Nous acceptons tout type de paiement dans le monde. | Kies uw betaalmethode. Wij accepteren alle betaalmethoden wereldwijd. |
| Confirm and pay | Confirmar e pagar | Confirm and pay | Confirmer et payer | Bevestigen en betalen |
| Verifying payment | Caro {nome}, estamos a confirmar o seu pagamento | Dear {name}, we are verifying your payment | Cher {nom}, nous vérifions votre paiement | Beste {naam}, wij controleren uw betaling |
| Once accepted | Assim que for aceite, recebe uma confirmação por WhatsApp e email | As soon as it is accepted you will receive a confirmation on WhatsApp and by email | Dès qu'il sera accepté, vous recevrez une confirmation sur WhatsApp et par email | Zodra deze is geaccepteerd, ontvangt u een bevestiging via WhatsApp en per e-mail |
| Status names ✎ | Verificação do pagamento · Emissão dos bilhetes | Payment verification · Ticket issuance | Vérification de paiement · Émission des billets | Betalingsverificatie – uitgifte van vliegtickets |
| Issuance ✎ | O seu bilhete será emitido assim que o pagamento for validado | Your ticket will be issued as soon as your payment is validated | Votre billet émis dès que votre paiement sera validé | Uw vliegticket wordt uitgegeven zodra uw betaling is gevalideerd |
| Issuance time ✎ | Em menos de 1 hora | Within a maximum of 1 hour | En moins d'une heure | Binnen maximaal 1 uur |
| Summary lines | O seu pedido · O que nos enviou · Ver | Your request · What you sent us · View | Votre demande · Ce que vous nous avez envoyé · Voir | Uw aanvraag · Wat u ons heeft gestuurd · Bekijken |
| Ticket PDF | O PDF do bilhete contém instruções e um guia com tudo o que precisa de tratar antes de viajar | The ticket PDF contains instructions and a guide with everything to sort out before you travel | Le PDF du billet contient des instructions et un guide avec tout ce qu'il faut régler avant de partir | De PDF van het ticket bevat instructies en een gids met alles wat u vóór vertrek moet regelen |
| Download | Descarregar bilhetes | Download tickets | Télécharger les billets | Tickets downloaden |

### Not in this annex

Email and WhatsApp templates, the expired and cancelled screens, and the before-you-travel block on the ticket. They reuse these strings and are the next piece of copy to produce, in all four languages.

---

# Two things that must not be lost

**The passenger tags `P1` `P2` `P3`.** Generated from the request, shown at payment, printed on the ticket and repeated inside every flight.

**The distinction between a guaranteed and an indicative price.** In the B2G model the fare is guaranteed for a different reason — the funds are already available — but the rule stays: never show a countdown next to a price that is not actually held.
