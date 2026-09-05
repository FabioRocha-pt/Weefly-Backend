# WeeFly Concierge — what was fixed from the Sprint 3 test report

| | |
|---|---|
| **Answers** | `WeeFly_Sprint3_Test_Results_and_Ticket_v3.3.md` (v3.3, 5 September) |
| **Date** | 5 September 2026 |
| **Part A** | 18 of 22 done · 3 partly done · 1 not started |
| **Part B** | `TK-01` to `TK-12` not started — unblocked now that `T-04` is in |
| **Database** | Checked against production. Everything this sprint needs is applied. |

The order of work is the one in your document. Everything below type-checks and the three dictionaries are aligned, but **none of it has been tested against a real case** — that is what this hand-off is for.

---

# Part A · item by item

| | Item | Status | Note |
|---|---|---|---|
| `T-01` | Quote without claiming | **Done** | The composer was already gated by a screen; every *write* behind it was not. The lock moved to the one door all writes pass through. |
| `T-02` | Change option dead-ends | **Done** | Two separate faults, neither of them a permission. See below. |
| `T-03` | Backoffice does not react | **Done** | Realtime was saying "connected" and delivering nothing. There is now a 4-second heartbeat that runs regardless. |
| `T-04` | No fields for the return flight | **Done** | One block per flight. Round trip gives two, multi-city one per leg. |
| `T-05` | Seller on link creation | **Done** | The dropdown had three names written into the code. It is gone. |
| `T-06` | Seller on the proposal | **Done** | Shown, not editable. Written from the session when the case is claimed. |
| `T-07` | Arrival date label | **Not started** | I could not find it. **I need the screen from you** — see the questions at the end. |
| `T-08` | Language not applied | **Done ¹** | The whole `/pc/{token}` link is translated and the selector works. The public request form at `/pc` is not yet. |
| `T-09` | Special request in the proposal tab | **Done** | It was in the case file and missing from the composer — the one screen where someone writes prices. |
| `T-10` | Baggage per flight | **Partly** | Database and the issuance screen are done. The **proposal composer** still asks for one number for the whole trip. |
| `T-11` | Payment deadline set automatically | **Done** | Send time + 1 hour, filled at the moment the instructions go out. |
| `T-12` | Timer overflows | **Done** | It was inside a 32×32 icon box. It has its own block now. |
| `T-13` | Timer always visible, reordered | **Done** | Timer → title → note, and it sticks to the top while you scroll. |
| `T-14` | Reference in the orange band | **Done** | Every customer screen and every email, including the proposal email, which had its own template and its own band. |
| `T-15` | First email: correct logo | **Done ²** | Real brand file, exported from the same source the app draws. |
| `T-16` | Second email: logo, date, note | **Done** | Logo and flight **dates** added. The date-change justification was already in that email. |
| `T-17` | Payment email must carry the link | **Done** | And it now refuses to send without one. |
| `T-18` | Message, proof, WhatsApp | **Done** | The message lands on the case and notifies the agent. |
| `T-19` | Passport screen: logo, clickable phone | **Done** | The phone opens WhatsApp. |
| `T-20` | Confirmation email: white logo, ticket link | **Partly** | White logo done. The ticket link is not — at that moment the ticket does not exist yet, so I need to know which link you mean. |
| `T-21` | Filter for closed cases | **Done** | Closed cases also leave the "Everything" tab, which was filling up with dead work. |
| `T-22` | Events emitted repeatedly | **Done** | The database now refuses the second copy, so two simultaneous cron passes cannot both slip through. |

¹ See "What is not done" below. ² See the note about Gmail at the end.

---

# The six worth testing first

### `T-17` + `T-11` · the payment email

Open a case at the payment stage, put a Stripe link in **Payment method**, press **Save and send**.

What should happen: the customer receives an email with **the link as a button**, the method by name, the amount, our reference, and a deadline that is the moment you pressed the button plus one hour. The deadline field fills itself — you no longer have to remember it. If you edit it by hand, that change is logged with your name.

If the email fails, you now get a **red error**, not a green note. The old message started with "Instructions saved", which read like success while the customer sat there with no way to pay.

The email that used to go out when the passports were submitted is gone. It said "pay" and linked to a screen that was still waiting for us — because at that moment the link genuinely did not exist yet.

### `T-02` · changing the chosen option

From the payment screen, press **Change option**, pick the other one.

Two things were broken and neither was a permission. The address stays `?view=p5`, which forces the options list — so the click saved the choice and the page came back identical, which reads as "the button does nothing". And the **amount to pay did not follow the new option**, which is the one that costs money rather than patience.

Now: the choice is saved, the page leaves the list, the amount updates, the option you are on is marked, and — this is new — **if a payment link had already been sent for the old amount it is voided**, with a line in the log saying why. Otherwise the customer pays the old price from an email you cannot recall.

### `T-04` · issuing a return flight

Issuance now has one block per flight, in the order of the itinerary the customer chose. Per flight: aircraft, cabin and class, terminals, the airline's own locator, coupon number, fare basis, NVB, NVA. Aircraft, class and terminals come pre-filled from the proposal — they were already written there.

Per passenger per flight: seat, checked bags and weight, side by side.

On a connection there is a checkbox for whether the baggage goes through to the final destination — the question people actually ask at a transfer desk, and one the ticket has to answer (`TK-04`).

**The button stays off until every flight is complete**, and it names the flight that is missing something: `TP 1234 PRA→LIS: missing NVA`, not "something is missing".

### `T-08` · the language

Open a case whose customer chose Portuguese. The link opens in Portuguese. Press the language button in the header: the page changes language and **the emails from then on follow it too** — the choice is written on the customer's record, not only in the browser.

What was wrong was not the dictionary. The customer screens had no dictionary at all: the text was written into the code in English, so there was nothing for the selector to switch. It is now 1428 keys across the three languages, with a check that fails the build if one of them falls behind.

### `T-03` · the backoffice reacting

Have someone open a case link and choose an option. The queue and the bell should move within about four seconds, without touching anything.

The live connection existed and reported itself as connected while delivering nothing — which from inside the code looks like everything is fine. There is now a small heartbeat that runs whatever the connection says, asks "has anything changed", and only redraws when the answer is yes. **Anything you are typing is still protected**: the refresh waits for you to leave the field.

### `T-16` + `T-14` · the proposal email

This email is built by a template of its own, which is why the shared header never reached it. Three things changed: the real logo replaces the hand-written word, the reference moved into the orange band where it is in every other email, and **the flights show the day, not only the time**.

That last one is the one to look at. It read `08:40 RAI → 14:15 BOS`. On a proposal with two options on different dates — half of them — four loose times do not tell anyone which day they are flying, and this is the email people choose from. It now reads `sat, 12 Sep · 08:40 RAI → 14:15 BOS`, with the arrival day written too when the flight lands on another day.

The date-change justification you asked for was already in that email; that one was in place.

### `T-12` + `T-13` · the timer

The countdown was inside a box built for a 32-pixel icon, which is why it spilled over the text below it. It is now its own block, in the order you asked — timer, title, note — and it stays at the top of the screen while the customer scrolls down to pay, which is exactly when it used to disappear.

It also counts the **deadline from the email** now, not our internal link expiry. The customer was being shown a number they had no way to recognise.

---

# What is not done, and why

### `T-07` · the arrival label — **I need your screen**

I went through the request summary in the case file, the composer brief, the customer's summary and the dates panel. None of them has an arrival label. The only "arrival" text in the whole system is a **flight's** arrival time, which is legitimate and I did not want to delete it on a guess.

Send me the screenshot, or tell me which screen and which panel, and it is a five-minute change.

### `T-10` · baggage per flight — half of it

The database holds it per flight now, and the **issuance** screen captures it that way. What is still missing is the **composer**: when you write the proposal, baggage is still one number for the whole trip. That is the half the customer sees, and the half `TK-03` depends on.

It is the next thing I would do.

### `T-20` · the ticket link on the confirmation email

The white logo is done. The link is not, and I want to check what it should point at: at the moment the payment is confirmed the ticket does not exist yet — it is issued afterwards. If you mean the customer's own link (where the ticket appears when it is ready), say so and it goes in.

### `T-08` · the public request form

`/pc` — the form someone fills in before there is a case — is still English in the code. The language selector on it works (it reloads the page in the chosen language), but the labels do not change yet. Everything **after** the request exists is translated.

### Part B · the ticket PDF

`TK-01` to `TK-12` are not started. Your own execution order puts them last, after issuance handles the return flight — which it now does, so they are unblocked. `TK-03` still waits on the composer half of `T-10`.

---

# Three things I need

**1 · The `T-07` screen.** As above.

**2 · A PNG of the logo.** The brand mark is exported as SVG from the same source the app draws, so the logo in the emails is now the real one — but **Gmail and Outlook do not render SVG inside an email**. They will show the word "WeeFly" in the brand's weight and colour instead, which is better than a broken square but is not the logo.

Drop a PNG at `public/brand/weefly-logo-white.png` — around 240 px wide, transparent background — and the emails start using it on their own. No code change, no deploy needed beyond the file.

**3 · Nothing — this one is already answered.** I checked the database directly rather than ask you. Everything this sprint writes to is in place, including `0019`, which someone applied while I was working.

One migration is missing and it does not matter today: `0017`, which creates an `airlines` table for `C-26`. No code reads it yet — the composer and the issuance screen still use the static catalogue in `src/lib/airlines-catalog.ts`. Paste it into the Supabase SQL editor whenever the airline logos get wired to the database.

There is now a script for this, because a missing column is invisible until someone needs it:

```
node scripts/check-migrations.mjs
```

Worth knowing how that check failed first: my initial version reported **everything** as applied, including migrations that plainly were not. It asked the API in a mode where a query against a table that does not exist comes back as success. I only noticed because it claimed `0019` was applied at a moment when I knew I had never run it. The script now tests itself against a table and a column it invents, and refuses to print anything if it finds them.

---

# One thing that changed that you did not ask for

While fixing `T-01` I found that the lock on quoting an unclaimed case was on the **screen** only. Publishing was checked; creating the proposal, adding an offer, writing the itinerary, the price, duplicating, reordering, deleting and saving the ticket fields were not. Any of those could be called without the case ever having an owner.

The check now sits on the single path every one of those writes goes through, rather than being repeated eight times and forgotten on the ninth. An administrator still passes — someone has to be able to touch a case that is stuck with a colleague on holiday.

I mention it because it changes behaviour you may notice while testing: if you open a case that belongs to someone else and try to edit the proposal, you will now be told so.

---

# Two numbers from the report, answered

**`×22` on "payment deadline expired".** Confirmed as a real defect, not only a display one. The bell was already collapsing repeats when it drew them, which fixed the screen and left the rows being written. One-time events now carry a key the database enforces, so the second copy is refused at the point where two simultaneous jobs can see each other. The rows that already exist do not disappear — they are history — but no new ones will be created.

**`×6` on "customer chose an option".** That was the customer pressing the same card more than once — going back, refreshing, confirming again. Choosing a *different* option is still news and still writes a line; choosing the same one again does not, and no longer sends a second email either.

**Did any customer receive duplicate emails from this?** The delivery log has a duplicate key on it and has had since Sprint 2, so the emails were most likely already being refused. I have not queried the production log to confirm — that is a read I would rather do with you watching, since it means opening the customer notification history.
