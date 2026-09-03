# WeeFly Concierge — Sprint 3 · Corrections Backlog

**Fix what testing found. No new features.**

| | |
|---|---|
| **Version** | 3.2 |
| **Date** | September 2026 |
| **Raised by** | Ivandro Ribeiro, product and design |
| **Source** | Live testing of the platform, notes of 3 September |
| **Sprint length** | 1 week · 1 developer |
| **Items** | 35 corrections |
| **Rule** | Anything new was moved to Sprint 4. This sprint only fixes |

---

## How to use this document

Every correction has an **ID**. Use it in branches and commits: `fix/C-24-date-change-blocked`.

**Acceptance criteria are the definition of done.** Where a correction has a diagnosed cause, it is written down — those were found in the test evidence, not guessed.

The eight items in Group A **break the commercial cycle**. Nothing else matters until they are closed.

---

# Group A · Blocking the commercial cycle

These eight stop a sale from completing. They come first, in this order.

### `C-03a` · Email `from` field is invalid — nothing is being sent
**Complexity** Low · **Cause identified**

Every notification in the test came back as `devolvido`. The provider error is explicit:

```
validation_error: Invalid `from` field. The email address needs to follow
the `email@example.com` or `Name <email@example.com>` format
```

The `from` field is being sent as `info@weefly.africa, info@weefly.cv` — **two addresses separated by a comma.** No provider accepts that. A message has one sender.

**Fix:** one address in `from`. If both mailboxes need to receive replies, put them in `to` or `reply-to`.

**Acceptance criteria**
- `from` carries a single address, in the format `WeeFly Concierge <info@weefly.africa>`
- A test send to Gmail, Outlook and one corporate domain lands in the inbox
- Sending domain authenticated: `SPF`, `DKIM`, `DMARC` configured and passing
- Every send is recorded on the case with delivery state: `queued` · `sent` · `delivered` · `bounced`
- A permanent failure raises a visible flag on the case

### `C-03b` · WhatsApp has no keys configured
**Complexity** Low · **Cause identified**

The log says `WhatsApp sem chaves configuradas — o aviso saiu só por email`. This is a credential, not code.

**Acceptance criteria**
- WhatsApp Business credentials configured and stored as environment secrets, never in the repository
- A test message is delivered to a real number
- WhatsApp failure never blocks the email: the two channels are independent
- Each channel is logged separately with its own delivery state

### `C-01` · A case can be quoted without being claimed
**Complexity** Low

It is currently possible to compose a proposal on a case that has no owner. Two agents can work the same case without knowing.

**Acceptance criteria**
- The proposal composer is unavailable while the case has no owner
- The action offered instead is **Claim and quote**
- Claiming records the agent, the timestamp and how long the case waited unclaimed
- Only the owner, or an admin, can publish a proposal

### `C-02` · Payment proof cannot be opened
**Complexity** Low · **Blocking issuance**

The proof uploaded by the customer cannot be opened in the backoffice. That stops payment validation, which stops issuance.

**Check first:** stored path differs from served path · missing or wrong `Content-Type` · file stored outside the web root with no route to serve it · permissions on the upload directory · filename contains characters that break the URL.

**Acceptance criteria**
- The proof opens in a new tab from the case
- Works for JPG, PNG and PDF
- Served through an authenticated route, never a public directory
- Original filename preserved for display
- Upload failures are reported to the customer when they happen

### `C-24` · Changed dates block the flow
**Complexity** Medium · **Loses better sales**

If the agent finds a better fare on the next day, they cannot propose it. The warning fields get filled in and the system still refuses to move forward. There is no dedicated place to confirm the change was deliberate.

**This is the worst item in the list.** It means a cheaper or better option cannot be offered because of a validation.

**Fix:** changing a date opens a dedicated justification block with an explicit button — **Confirm date change** — and the case proceeds. The justification is logged, the revision is created, the customer is notified. It does not block.

**Acceptance criteria**
- Changing a departure or return date opens a justification field
- An explicit **Confirm date change** action unblocks the step
- The case moves forward with the new dates
- Justification, author and timestamp recorded in the case log
- The customer is notified of the change and of the reason
- The original requested dates stay visible in the history, unaltered
- Origin and destination remain non-editable: a different route is a different request

### `C-04` · A case cannot be closed after issuance
**Complexity** Low

After the ticket is issued there is no way to conclude the case and move to the next one.

**Acceptance criteria**
- A **Close case** action available once the ticket is issued
- The closed case leaves the working queues
- Closing records author and timestamp
- Reversible by an admin, and the reversal is logged

### `C-05` · Link state is wrong
**Complexity** Low

The customer's link is closed and the system reports it as open.

**Acceptance criteria**
- The link state shown in the backoffice matches reality
- The state is derived from the actual case state, never stored separately and left to drift
- Last-opened timestamp reflects real customer access

### `C-33` · Payment tab must reflect the method the customer chose
**Complexity** Medium

The customer no longer pays inside the link. They **choose a method**, that choice reaches the backoffice, and the agent supplies the link or the details. **Payment happens outside the platform; validation happens inside it.**

The Payment tab must show the form for the method that was actually chosen:

| Method chosen | What the tab shows the agent |
|---|---|
| Stripe | Field to paste the Stripe payment link |
| Vinti4 / 24 | Field for the SISP reference or link |
| Revolut | Field for the Revolut link |
| Instapay | Field for the reference |
| PayPal | Field for the PayPal link |

**Acceptance criteria**
- The chosen method is visible at the top of the Payment tab
- Only the fields for that method are shown
- Every method has: amount to charge, deadline, and a send-to-customer action
- The message sent to the customer is pre-written and editable, per `C-25`
- The system does not generate the links; it stores what the agent supplies
- Below that, the proof validation area: amount received, date, bank reference, validated by
- **No bank transfer option** — removed from this phase

---

# Group B · Wrong or incomplete data

### `C-06` · Dates of birth in the future are accepted
**Complexity** Low

**Acceptance criteria**
- Date of birth cannot be in the future
- Cannot be more than 120 years ago
- Passenger type is derived from the date of birth **at the date of travel**, not at the date of booking
- An alert fires if a child turns 12 between booking and departure
- Validated in the browser and again on the server

### `C-07` · Country and airport autocomplete in the backoffice
**Complexity** Low · **Dataset already exists**

The dataset already powers the country list on the customer side. Reuse it — do not build a second one.

**Acceptance criteria**
- Airport fields in the proposal and the ticket builder use autocomplete
- Typing narrows the options
- Matches on IATA code, city name and country name
- Displays as `RAK — Marraquexe`
- The field only accepts a selected entry, never free text
- Same dataset as the customer side, single source

### `C-08` · Simplified price on the proposal
**Complexity** Medium

```
Total = (price per passenger × number of passengers) + WeeFly service
```

| Field | Behaviour |
|---|---|
| Price per passenger | Typed by the agent. **Final airline price, taxes already included** |
| WeeFly service | **Per booking, not per passenger.** Pre-filled at `20`, editable |
| Total | Calculated, never typed |

**Acceptance criteria**
- No airport tax field anywhere in the proposal
- Service pre-filled at 20 in the case currency, editable
- Service applied once per booking regardless of passenger count
- Total calculated automatically
- The customer sees two lines and the total: `Price 420 € + WeeFly service 30 € = 450 €`
- A proposal cannot be published with an empty or zero price

### `C-09` · Dates pre-filled from the request
**Complexity** Low

**Acceptance criteria**
- Departure and return pre-filled when creating a proposal
- Marked as coming from the customer, per `C-28`
- Editable, subject to `C-24`

### `C-10` · More airlines in the list
**Complexity** Low

Priority order:

`VR` `TP` `AT` `SN` `AF` `KL` `IB` `LH` · `DL` `UA` `AA` `BA` `LX` `SK` `FR` `U2` `VY` `TK` `EK` `QR` · `HC` `ET` `DT` `KQ` `AW` `G3` `AD` `LA` `MS` `AH` `TU`

**Acceptance criteria**
- Airlines stored as data, addable without a deployment
- Each carries IATA code, commercial name and logo file
- Logo files named by lowercase IATA code: `vr.png`, `tp.png`
- PNG or SVG, transparent background, horizontal, minimum height 80 px
- **Missing logo falls back to a code label, never an empty space**

### `C-12` · Cost and margin
**Complexity** Low

**Acceptance criteria**
- `Consolidator cost` field on the proposal, internal only
- Margin calculated and shown next to it, in value and percentage
- Turns red when margin is zero or negative
- **Never visible to the customer, in any screen or document**

### `C-26` · Airline and logo carried to the final ticket
**Complexity** Low

**Acceptance criteria**
- The airline chosen in the proposal appears in the issuance screen without being re-selected
- The logo appears in the digital ticket and in the PDF
- Operating and marketing carrier shown separately when they differ

### `C-27` · Remove flight number from the proposal
**Complexity** Low

Not needed for the customer to decide. **Stays in the issuance screen and on the ticket.**

### `C-29` · Baggage separated per flight
**Complexity** Medium

Allowances differ between airlines and between legs. One value for the whole trip is wrong.

**Acceptance criteria**
- One baggage block per flight in the proposal
- Each block: cabin bag, personal item, checked bags, as pieces × kg
- Counters `−` `0` `+`, not free text
- The customer sees the allowance per flight, not a single trip-wide value
- The ticket reflects the same per-flight structure

---

# Group C · Interface and usability

### `C-13` · Remove top menus with no action
**Complexity** Low

`Price Checker`, `Pagamentos` and `Emissões` in the top bar do nothing. A button that does nothing teaches the user not to trust the interface.

**Acceptance criteria**
- Only the platform icon and menus that have a function remain
- No dead links or buttons anywhere in the top bar
- The full menu structure is Sprint 4 — this sprint only removes what is broken

### `C-14` · Notifications working and listed
**Complexity** Medium

**Acceptance criteria**
- The bell shows a real count of unread notifications
- Clicking it opens the list of all notifications, newest first
- Each entry: what happened, which case, when, and who caused it
- Clicking an entry opens the case
- Read and unread states persist per user
- The count updates without a page reload

### `C-15` · Step and field-change notifications in Communications
**Complexity** Medium

**Acceptance criteria**
- Every state change appears in the Communications tab as an entry
- Field changes appear as `field updated`, with the old and new value
- Each entry carries author and timestamp
- Customer-side actions are distinguishable from backoffice actions

### `C-31` · Notes exchanged between customer and backoffice in Communications
**Complexity** Medium

The Communications tab shows notifications sent. It must also show the **conversation** — the notes exchanged between the customer and the team.

**Acceptance criteria**
- Notes appear in the same tab, in chronological order with the notifications
- Author identified: customer or which agent
- Messages are immutable for customer and agent
- An admin can hide a message; the hiding is logged, the content preserved
- Internal notes stay clearly separated from what the customer can see

### `C-32` · Alert when the customer moves to the next step
**Complexity** Low

**Acceptance criteria**
- Every customer-side advance generates an alert: option chosen, passports submitted, payment method chosen, proof uploaded, request cancelled
- Listed in the Communications tab and in the notification bell
- The case owner is notified; a case with no owner alerts the general queue

### `C-16` · Auto-save still interrupts typing
**Complexity** Medium

The auto-save refreshes too quickly and stops the agent from writing when they pause to think.

**Acceptance criteria**
- Saving happens in the background with **no perceptible repaint**
- A field being edited is never overwritten or cleared
- Focus and cursor position are never lost
- Only changed values are written to the DOM; the panel is never re-rendered whole
- The only visible signal is a discreet toast, at most one every 10 minutes
- On failure the agent is told and the draft is kept locally

### `C-17` · Errors listed and highlighted
**Complexity** Low

**Acceptance criteria**
- A list of missing or invalid fields at the top of the form
- Each item in the list clicks through to its field
- Each field visually highlighted
- The list updates as fields are corrected
- Applies to the proposal form, the passenger form and the issuance form

### `C-18` · Rename to *Create proposal*
**Complexity** Low — `Compor proposta` becomes `Criar proposta` / `Create proposal`, from the translation file.

### `C-19` · Overlapping numbers in the time field
**Complexity** Low

**Acceptance criteria**
- No overlap at any viewport from 360 px to 1920 px
- Times remain legible with an overnight `+1` marker present

### `C-20` · Only the WeeFly Concierge profile
**Complexity** Low

For this service, only **WeeFly Concierge**. Pro and Admin come when those services exist.

**Acceptance criteria**
- Only WeeFly Concierge appears as a profile
- No reference to Pro or Admin in the interface
- The structure allows adding profiles later without rework

### `C-21` · Only the user Dominik
**Complexity** Low

**Acceptance criteria**
- The seller dropdown reads from the users that exist in the system, never a hard-coded list
- For now it contains a single entry: **Dominik**
- Adding a user makes them appear without a deployment
- Role and permission management is Sprint 4

### `C-22` · Correct language
**Complexity** Low

Follow the wording used in Dominik's presentation.

**Acceptance criteria**
- No mixing of languages within one screen
- All copy comes from the translation file, never hard-coded
- Interface language follows the case's `lang`

### `C-23` · The "3 news items" with no explanation
**Complexity** Low · **Needs clarification before development**

A `3` counter appears with no explanation of where the items come from. Likely the badge on the `Comunicações` and `Registo` tabs.

**Acceptance criteria**
- Any counter badge is clickable and opens what it is counting
- Each item shows origin, author and timestamp
- The counter clears when the items are seen

> Confirm with Ivandro which screen this appears on before starting. If it is the tab badge, the criteria above are sufficient.

### `C-25` · Pre-written message for WhatsApp and email
**Complexity** Low

Today the WhatsApp button returns only a bare URL, or `Olá ivandro, sobre o pedido WF-2609-0056:`. The agent has to write everything by hand.

The message must arrive complete and ready to paste:

```
Caro Ivandro,

As nossas propostas para a sua viagem Praia → Lisboa já estão disponíveis.

Pode consultá-las e escolher a que preferir neste link:
weefly.africa/c/8f3a2c91d47b6e05

Depois de escolher, preencha os dados dos passaportes no mesmo link e
enviamos-lhe as instruções de pagamento.

WeeFly Concierge
```

**Acceptance criteria**
- Templates per phase: proposal sent, awaiting payment, ticket issued
- Variables filled automatically: name, route, reference, link
- Editable before sending
- Same content available for WhatsApp and email
- One-click copy, and a WhatsApp link that opens with the message already written
- Templates in the case language

### `C-28` · Pre-filled fields marked in yellow
**Complexity** Low

**Acceptance criteria**
- Fields carrying values from the customer show a yellow marker or yellow field background
- A yellow exclamation icon with a tooltip explaining the value came from the customer
- The marker clears when the agent confirms or edits the field
- Times pre-filled from the request require acknowledgement before publishing

### `C-30` · Remove revision R2 for now
**Complexity** Low

Opening a revision unlocks editing and hides the prices from the customer while it is open. Clicking it leaves the agent in an intermediate state with no clear way back.

The concept is right, the implementation traps the user.

**Acceptance criteria**
- The **New revision** button is removed from the case
- The revision numbering stays in the data model, unchanged
- Published proposals stay locked as they are today
- Returns in Sprint 5 with a cancel action and a clear explanation of the state

---

# Execution order

| Order | Items | Why |
|---|---|---|
| 1 | `C-03a` `C-03b` | Nothing is being delivered. One is a malformed field, the other a missing credential. Both small |
| 2 | `C-02` `C-05` `C-01` `C-04` | Unblock validation, issuance and closing the case |
| 3 | `C-24` `C-33` | The two that stop a sale from completing |
| 4 | `C-08` `C-09` `C-28` `C-07` `C-17` `C-29` | The proposal has to be correct before it goes out |
| 5 | `C-06` `C-10` `C-12` `C-26` `C-27` | Remaining data corrections |
| 6 | `C-14` `C-15` `C-31` `C-32` | Notifications and case history |
| 7 | `C-16` `C-13` `C-18` `C-19` `C-20` `C-21` `C-22` `C-23` `C-25` `C-30` | Interface |

---

# Moved to Sprint 4 — new features, not corrections

| Item |
|---|
| Reservation code search field on the universal link |
| `RBAC` roles and user management |
| Who is online among backoffice users |
| Internal chat between colleagues |
| Final states: complete, cancelled, expired, archived |
| Link SEO preview on WhatsApp with the logo |
| Back-to-dashboard button |
| English and Portuguese toggle in the backoffice |
| Copy-paste to fill the ticket fields |
| User profile screen |
| Full backoffice menu structure, live bar, dashboard |
| Revision R2, returning with a cancel action — Sprint 5 |

---

# Decisions confirmed

| Decision |
|---|
| Only **WeeFly Concierge** as a profile in this service |
| **No bank transfer.** Payment methods: Stripe · Vinti4/24 · Revolut · Instapay · PayPal |
| Payment happens **outside** the platform, validation **inside** it |
| Airport dataset already exists and is reused |
| WeeFly service fee is **per booking**, pre-filled at 20, editable, shown as its own line |
| **Any agent** may propose new dates, with mandatory justification |
| Airline schedule changes are relayed **manually** by an agent |
| Internal chat runs **alongside** WhatsApp |

# Still open

| # | Question |
|---|---|
| `Q3` | Who takes a request with no seller attached, and does the person who claims it earn the commission? Open queue ships by default |
| `Q4` | Retention periods for conversations, documents and the activity log |
| `Q6` | Booking thresholds for Diamond and Platinum |
| `Q7` | Number formatting: follows language or currency? |
| `C-23` | Which screen shows the unexplained `3` counter |

---

# Two things that must not be lost

**The passenger tags `P1 P2 P3`.** Generated from the request, shown at payment, printed on the ticket, repeated inside every flight. They are what removes the ambiguity of which ticket belongs to whom.

**The distinction between a guaranteed and an indicative price.** `guaranteed` only when the fare is genuinely held in Amadeus with an option time. Everything else is `subject to reconfirmation`. Never show a countdown next to a price that is not held.
