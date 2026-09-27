# The spec

Every deliverable's spec — what the markers consider when they judge whether
your work matches what was required — is published on the course website, and
this repo's name tells you which one applies: the course API maps repo prefixes
to deliverables, and the `start` course skill walks your agent through pulling
the right one. The brief poses the problem; the spec is the fixed contract. Read
both on the site before you plan or build.

The checks in this directory come in three kinds:

## Invariants (shipped, always on)

`invariants.test.ts` asserts things that are true of any good web app, however
you build it and whatever the week's brief asks: a navigation landmark, exactly
one top-level heading, a document language, a real title, a mobile viewport, alt
text on images — plus an automated **accessibility floor**: axe-core's rule set,
run on each page's served HTML. They run against the **running** app —
`global-setup.ts` boots the built server (`dist/server/entry.mjs`, the same
artefact production runs) with a throwaway database — so they check what
actually ships. Keep them green; don't delete them.

Two things to know about how they see your app:

- **They only visit the routes in `routes.ts`.** A server-rendered app has no
  `dist/*.html` files to walk, so the covered routes are an explicit list. When
  you add a page, add its route — otherwise the invariants silently stop
  covering it.
- **The axe pass runs without a browser** (in jsdom), which keeps CI fast and
  dependency-light but means rules needing real rendering — colour contrast,
  element overlap — are disabled. It's a floor, not a clean bill of health.

## The README (shipped, always on)

`readme.test.ts` holds one promise of the deployed app: `/readme/` serves the
whole of `README.md`, your account of what the app is and what good looks like
here. It renders the markdown to text and asks whether the served page contains
all of it, so styling and navigation around it pass and a trimmed copy fails.

## Prereq's own checks

The starter's guestbook test went with the guestbook. These replace it, and
each holds a promise the app makes:

- `requisites.test.ts` pins the parser to real handbook sentences from every
  year held: clear ones become the expected tree, a sentence with two readings
  (COMP8600) is refused rather than guessed, and each past silent misparse
  (STAT7039, COMP6340, INFS8004) has its own case. It also holds the rules that
  keep that honest after a re-scrape: every refused wording in every year has a
  person's reading in `data/requisite-readings.json`, every program and
  specialisation wording has encoded rules in `data/rule-readings.json`, and
  no reading outlives the wording it reads.
- `planner.test.ts` drives the core flow over HTTP: a placed course survives a
  fresh load (the crit 7 spec's "create something, and it's still there"), and
  a placement gets a warning for the wrong semester, for a prerequisite that
  comes later, and for an incompatible course, but never a refusal. It holds
  the year rules too: a course is judged by the handbook of the year it is
  taken (COMP8830 in 2026 against 2027), a degree by the year it started (2025
  and 2026 compulsory courses differ), an unpublished year falls back to the
  latest with a note, and COMP8715 is expected twice in consecutive semesters.
  The example plan stays read-only and clear of problems.
- `catalog.test.ts` checks requisites render as linked structure, a course's
  wording history across years, the reverse "what it leads to" list, and crawls
  every internal link the way CI's post-deploy link check will, so a dead link
  fails here first.

They assert the pages' `data-*` attributes (`data-course`, `data-status`,
`data-warning`, `data-source`) rather than their wording.

What no test can hold, and the crit judges: whether each hand-written reading
is the right one, and whether the pages are clear to a student choosing
courses.

A green suite here is backpressure, not a mark: your tutor verifies what you
deployed against the published spec at the crit, and keeping your own tests
green is how you arrive with no surprises.
