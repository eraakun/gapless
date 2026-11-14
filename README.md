<p align="center"><img src="public/gapless-logo-lockup.png" alt="Gapless logo: a family holding up a school calendar" width="420"></p>

# Gapless

**Every day your kids have no school and both parents work, covered for the least money and the fewest vacation days.**

Live demo: `https://YOUR-DEPLOY-URL` · No sign-up. Click **Try with Realistic US Example**.

US public schools close far more often than parents get time off: teacher workdays, staff development days, holidays, winter and spring break, then summer. Working parents patch the gaps with vacation days, grandparents, camps, drop-in programs and sitters, usually in a group chat and a spreadsheet, a few weeks at a time. Gapless treats it as what it is: an optimization problem. It finds every gap in the year and assigns the cheapest combination of coverage. It respects:
- each parent's schedule and vacation balance, with a reserve held for sick days;
- how many days Grandma can do;
- which camps take which ages;
- which paid options take sick kids or run in summer.

---

## What it does

| | Free | Family ($39 per school year or $5.99/mo) |
|---|---|---|
| Finds every no-school weekday and who is already home | ✓ | ✓ |
| Optimized coverage plan | Next 60 days on the calendar | Whole school year and summer |
| Savings vs. "the usual way" | ✓ | ✓ |
| Sick kid / snow day: one tap re-plans around it | ✓ | ✓ |
| Camps to book, registration deadlines, "mark booked" | ✓ | ✓ |
| Step-by-step setup (district → kids → parents → help), with preset 2026–27 calendars for NYC, LAUSD, Chicago, Miami-Dade, Houston, Fairfax | ✓ | ✓ |
| To-do reminders: request vacation, confirm family, book sitters, register for camps; each with a due date; one-click calendar alerts (.ics) | ✓ | ✓ |
| What-if scenarios: Grandma can't help, keep vacation for a trip, prices +20%, skip camps, a sick week; each fully re-planned | ✓ | ✓ |
| One-page printable plan (PDF) for the fridge or the other parent | | ✓ |
| Import the district calendar (.ics) or paste dates; early-release days come in too | ✓ | ✓ |
| Kids at different schools: each kid follows their own school's calendar | ✓ | ✓ |
| "Why?" on every day: the reason for each choice, with the alternative's price | ✓ | ✓ |
| Dependent Care FSA: estimated tax savings on sitters and day camps ($7,500/yr limit, 2026) | ✓ | ✓ |
| Early-release days: a pickup reminder for each | ✓ | ✓ |
| Backup: save the plan to a file and restore it anywhere | ✓ | ✓ |
| Ready-to-send messages for every to-do: vacation request email, texts to Grandma, the sitter or the co-parent; one tap opens Mail or Messages | ✓ | ✓ |
| Plan B for every day: the next-best option if a helper or sitter cancels | ✓ | ✓ |
| Guided tour over the example (replay with 🧭 Tour) | ✓ | ✓ |
| **After school, every school day:** who picks up between dismissal and the end of the workday (a parent who's off, Grandma, work from home, leaving early, drop-in after-care, a sitter paid by the hour, a monthly after-care plan, a carpool swap with neighbors), with the usual week, cost per month and savings. Kids who walk home or have practice that afternoon drop out; early-release days add hours | ✓ | ✓ |
| **Ask Gapless:** plain-English commands and questions ("Leo is sick tomorrow", "Grandma can't help in December", "What if…?"). Keyword rules, runs in the browser; every change is shown and applied only on confirm | ✓ | ✓ |
| Two homes: custody schedule (2-2-3, 2-2-5-5, week on/off, every other weekend), holidays by year, summer weeks | ✓ | ✓ |
| Each parent's view: when you next have the kids, handoffs, midweek visits, % of time | ✓ | ✓ |
| Right of first refusal: the other parent is used before a sitter, and the extra days are shown | ✓ | ✓ |
| Day-change requests: nothing moves until the other parent approves; timestamped log | ✓ | ✓ |
| Childcare and camp costs split by your percentage | ✓ | ✓ |
| Partner link: the same plan on your co-parent's phone, no accounts | | ✓ |
| Calendar export for Google, Apple, Outlook (.ics) | | ✓ |

The **Demo Unlock Pro** switch in the header turns on every paid feature for judges.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # 65 tests: engine + data (Node test runner via tsx)
npm run build     # type-check + production build into dist/
```

Node 20+. Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages). No environment variables, API keys or servers.

## How the planner works

All logic is in `src/engine/`, pure TypeScript with no React or browser APIs, and unit-tested.

**1. Finding the gaps** (`gaps.ts`). Every weekday from today to the end of summer where a child has no school (district closures, summer, or a surprise day) is a *care need*. If any parent isn't working that day (their days off, or their employer's holidays), it's covered for free. The rest are *gap days*.

**2. Covering gap days with a min-cost flow** (`flow.ts`, `planner.ts`). Given which camp weeks are booked, the remaining days are assigned with a minimum-cost flow:

```
source ─▶ each parent's PTO ──────────────┐
source ─▶ each parent's sick-day reserve ─┤ (surprise days only)
source ─▶ each parent's work-from-home ───┤ (only if every kid left is OK at home)
source ─▶ Grandma (≤ 12 days, Tue/Wed) ───┴─▶ day ─▶ sink
```

Paying by the day is every day's default: the cheapest option that day, priced per child or per family, filtered by whether it takes sick kids and whether it's open in summer.
- An arc *resource → day* costs *(resource cost − that day's paid cost)*. Flow only goes where a resource saves money, and every capacity (vacation balances, Grandma's limit) is respected exactly.
- A vacation day costs what the family says one is worth ("a vacation day is worth $150 to us"). So the plan spends PTO only where it beats paying.
- PTO arcs are unit arcs with slowly rising cost, which splits leave fairly between parents.
- The solver is successive shortest paths with SPFA. It stops as soon as another augmenting path would add cost.

**3. Choosing camp weeks by local search** (`planner.ts`). Camps are billed per child per week, so they're decided around the flow:
- Try booking or dropping each (camp, child, week).
- Also try each (camp, week) for all eligible kids at once, because a camp only frees a parent if every kid is covered.
- Keep any change that lowers the total, and repeat until nothing improves.
- Weeks marked as booked are never dropped.

The example family's full year solves in about 60 ms.

**4. Honest comparison** (`typicalPlan`). "The usual way" works like this:
1. Book the cheapest camp for every week one runs.
2. Spend vacation days first-come-first-served, alternating parents and holding nothing back.
3. Use family help.
4. Pay for the rest.

The test suite checks the optimizer never does worse than this, from any start date in the school year.

**5. Real-world rules the model respects:**
- Camps and drop-in programs don't take sick kids, and camps don't open for surprise closures. A sitter or Grandma might (it's a checkbox).
- Some programs run only on school-year closure days, not all summer.
- The sick-day reserve can only be spent on surprise days.
- A day nobody can cover is flagged in red, never hidden.

**6. Calendars in and out.** `icsImport.ts` reads the .ics file most districts publish:
- all-day multi-day events expand;
- DTEND is treated as exclusive, per RFC 5545;
- "early release" and "half day" events are ignored.

`icsExport.ts` writes one all-day event per gap day, plus camp registration reminders.

**7. Partner link with no backend** (`share.ts`). The plan is JSON, deflate-compressed with the browser's CompressionStream and base64url-encoded into the URL fragment (`#plan=…`). Fragments aren't sent to servers. Opening the link loads the plan and clears the URL.

## Project structure

```
src/
  engine/
    types.ts        Family plan, coverage plan types
    dates.ts        UTC day arithmetic (no time-zone or DST bugs)
    gaps.ts         No-school days, who is home, gap days
    flow.ts         Min-cost flow (SPFA successive shortest paths)
    planner.ts      Optimizer (flow + camp local search) and "usual way" baseline
    icsImport.ts    District calendar import, pasted date lists
    icsExport.ts    Coverage calendar export
    share.ts        Compressed partner links
    sanitize.ts     Makes form input, saved data and shared links safe
    custody.ts      Two homes: custody patterns, holidays, approved day changes, cost split
    tasks.ts        To-do reminders with due dates, and their .ics export
    scenarios.ts    "What if" variants of the plan, re-run through the optimizer
    explain.ts      "Why?" for each day, in the family's own numbers
    fsa.ts          Dependent Care FSA tax-savings estimate
    messages.ts     Ready-to-send email and text drafts for each to-do
    afterSchool.ts  Every-school-day pickups: cheapest available cover per afternoon
    assistant.ts    "Ask Gapless": plain-English commands and questions → confirmed plan changes or engine answers
    engine.test.ts  33 tests
  data/
    example.ts      Realistic examples: a Fairfax, VA family on FCPS 2026-27, and the same family in two homes
    districts.ts    Preset 2026-27 calendars: NYC, LAUSD, Chicago, Miami-Dade, Houston, Fairfax
    quickStart.ts   Turns the step-by-step setup into a full plan
    data.test.ts    25 tests
  state/storage.ts  localStorage persistence
  components/       React UI (Tailwind CSS): wizard, summary, to-do, what-if, two homes, print report
  App.tsx
public/
  gapless-logo.svg          The mark (vector, any size)
  gapless-logo-lockup.png   Mark + wordmark for slides
```

## The example family

- **Dana:** ICU nurse, works Mon–Wed. 9 vacation days, 2 held for sick days.
- **Marcus:** federal analyst, Mon–Fri with federal holidays off, teleworks Mon and Fri. 12 days, 2 held.
- **Ava (10)** is fine at home while a parent teleworks; **Leo (6)** is not.
- **Grandma Linda:** Tue/Wed, up to 12 days.

A second example, **"two homes"**, shows the same family after a divorce: a 2-2-5-5 schedule, right of first refusal, alternating holidays, week-on/week-off summers, a 60/40 cost split and one pending day-change request.

School closures are the Fairfax County Public Schools 2026–27 student holidays as compiled by publicschoolscalendar.com. **Verify them against fcps.edu/calendars.** Prices for camps, drop-in days and the sitter are illustrative, chosen within published national ranges, not quotes. The next school year's start (Aug 23, 2027) is an assumption.

## Brand

The logo started as a team sketch: a family (Mom, two kids, Dad) holding up a wall calendar. Their hands double as the calendar's rings, and the diagonal days they cover light up in sun yellow. In the large version those days spell **F-A-M**. Small sizes drop the letters so the mark still reads at 16 px.

- Colors: grape `#5a32f0` (actions), deep grape `#351a94` (ink), sun `#ffc83d` (covered days), mint and coral for good and urgent.
- Type: Fredoka for headings, Nunito for text.

## Privacy

No backend. The plan and the Pro flag live in localStorage under `gapless:v1`. Nothing leaves the browser unless you create a partner link, and that link carries the data only in its URL fragment.

## Limitations

- Two homes: the custody schedule works in whole days, not hours or overnights. The holiday rule covers Thanksgiving and winter break only. The request log is stored in the browser and the share link, so it isn't tamper-proof the way a court-recognized co-parenting app's records are.
- Early-release days get a pickup reminder and a longer, pricier afternoon in the after-school plan; the no-school optimizer itself still plans in whole days.
- The FSA number is an estimate at one tax rate the family enters. It isn't tax advice, and it doesn't model the Child and Dependent Care Tax Credit.
- Preset calendars cover 6 large districts; others come in by .ics or pasted dates.
- "Ask Gapless" understands phrases through keyword rules, not a language model, so unusual wording gets "I didn't catch that" plus examples. A hosted model could replace the parser behind the same confirm-before-apply flow; it would need a server-side API key and consent to send plan data.
- After school counts family and work-from-home afternoons at half their full-day cost. An activity either runs until work ends (no pickup) or has an end time, and cover starts then; it assumes the activity starts right at dismissal. Monthly plans are decided per month and carpools per week, each against the day-by-day plan; that is exact for one option at a time, not a joint optimum across several monthly plans and carpools.
- The default dismissal is 3:00 pm and work ends at 5:30 pm. US schools vary (elementary often around 3, many high schools earlier), so both times are editable, and the assistant takes "School ends at 2:45".
- Camp weeks are chosen by a heuristic. It works well in practice and is never worse than the baseline, but it isn't proven optimal. Given the camp weeks, the day-by-day assignment is exactly optimal.
- Pro is a client-side flag in this build. Production would verify a checkout receipt (e.g., Stripe Checkout plus a small serverless endpoint). Planning stays in the browser.

## License

MIT
