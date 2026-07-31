# TutorClock

A trust-first time tracker for private tutors. Run a timer during a lesson,
then send the parent a session summary they can trust — because the log shows
everything, including your honest corrections.

**Status: Step 3 of 7 — lesson history and manual entry.**

---

## Running it

There is no build step and nothing to install. But the app should be served
over `http://`, not opened as a file, because the offline/installable part
(the service worker) only works on a real address.

From this folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

To try it on your phone, make sure the phone is on the same Wi-Fi, find your
computer's local IP address, and visit `http://<that-ip>:8000`.

## Checking that data really survives

This is the whole point of Step 1, so it is worth testing properly:

1. Add two or three students with different names, rates and colours.
2. **Fully quit the browser** — not just the tab. Reopen it and go back to
   the address. Your students should still be listed.
3. Harder test: stop the `python3 -m http.server` process, start it again,
   and reload. Still there. This proves the data lives on your device and
   has nothing to do with the server.

Data is stored under the key `tutorclock.v1` in your browser's localStorage.
Note that it is per-browser and per-device — clearing your browsing data
will clear it too. Real backup/export arrives with the summary step.

## What works now

- Add a student: name, hourly rate in ETB, and a colour for their initial
- Archive a student to hide them from the main list without deleting anything
- **Tap a student to start their lesson.** The chevron opens their history;
  editing the name or rate lives in there behind the pencil
- **Start / pause / resume / stop a live timer**
- A running session is pinned to the top of the dashboard so it can't be forgotten
- Pauses are excluded from billable time and recorded in the session
- **The timer survives the app closing, the phone locking, or a crash**
- **Per-student lesson history**: every lesson with its length, day, note and
  amount, plus totals for lessons, time and earnings
- **Add a lesson that already happened**, for the ones you forgot to clock —
  saved as `manual` and badged as such
- Everything persists to the device and survives a restart
- Installs to a phone home screen and opens offline

Not built yet, in build-plan order: the edit/trust trail (Step 4) and the
summary export (Step 5). Lessons can be added but not yet corrected — because
a correction has to *append* to the record rather than overwrite it, which is
exactly what Step 4 builds.

### Live vs manual

Every lesson carries a badge, and the two can never be confused:

- **LIVE** (green) — the timer actually ran for this lesson.
- **MANUAL** (grey) — it was typed in afterwards.

That distinction is trust rule R1 and it is stored, not just displayed. A
parent looking at a summary can see which lessons were clocked in real time
and which were entered from memory. Hiding that would defeat the point of
the whole app.

### How the crash-safe timer works

This is the most important piece of engineering in the app, and it is worth
understanding.

A naive timer keeps a counter and adds one every second. That breaks the
moment the app is not running — lock your phone for twenty minutes and you
lose twenty minutes.

This timer never counts. Starting a session writes down **the time it
started**, and nothing else. Whenever the clock needs drawing, the app works
out:

```
billable = now − startedAt − (time spent paused)
```

Because that is a subtraction against the device's real clock, it does not
matter whether the app was open, backgrounded, or killed outright in between.
Come back two hours later and the answer is simply correct. Pauses are stored
the same way, as pairs of timestamps rather than as a stopwatch.

The 250ms interval in `app.js` only decides how often the screen is
repainted. It is not where the time comes from, and if it never ran at all
the totals would still be right.

## How it is put together

```
index.html              the page shell
css/tutorclock.css      design system, harvested from the old app's CSS
js/store.js             the ONLY file that touches localStorage
js/app.js               screens and interaction
manifest.webmanifest    makes it installable
service-worker.js       makes it work offline
icons/                  app icons
reference/              the old Next.js app and the prototypes — not built,
                        kept only for reference
```

### Choices worth knowing

**No framework, no build step.** Plain HTML, CSS and JavaScript. Nothing to
install to run it, nothing to break, and the whole app can be read top to
bottom. The prototype was written in React, but it was a design sketch for
the *flow* — the flow is what was carried over, not the framework.

**Tailwind was stripped.** The harvested CSS opened with
`@import "tailwindcss"`, but nothing in that file actually used Tailwind —
every rule was hand-written. Dropping the import removed an entire build
step and changed nothing visually.

**localStorage, behind a wall.** Only `js/store.js` touches storage. Every
screen asks it for data. If this ever outgrows localStorage, that one file
gets rewritten and the screens do not change.

**Phone-first CSS.** The harvested stylesheet was a desktop sidebar dashboard
that shrank down. This one inverts that: the base styles are the phone
styles, and a single media query widens the column on a desktop. The sidebar,
the multi-column grids, the chart, the login page and the payment list were
all dropped.

## The rules this app is built on

From Section 5 of the build plan. They are what make this more than a
stopwatch, and they are not negotiable as the app grows:

1. Every session records how it was created: `live` (timer run) or `manual`
   (typed in afterwards). These never become indistinguishable.
2. Editing never overwrites silently. Every edit appends a record — old
   value, new value, timestamp, optional reason. Nothing is erased.
3. Pauses are part of the record. Billable time = elapsed − paused.
4. The parent-facing summary shows edited and manual sessions honestly.
5. The timer survives the app closing, the phone locking, or a crash —
   elapsed time is computed from a stored start timestamp, never from a
   counter that only ticks while the app is open.

Student details are the one thing that *is* a plain overwrite, and that is
deliberate: a name or an hourly rate is just a current fact about a person.
The append-only trail applies to sessions, which are the record a parent is
asked to trust.
