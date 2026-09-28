# Harness: Prereq

The rules I hold the agent to in this repo. The brief and spec are on the
course site (crit 7, "Build the ANU system you wish existed"); `README.md` says
what the app is and why it is shaped this way.

## Years

- **Two kinds of year, never one.** A course is judged by the handbook of the
  year it is taken; a degree by the handbook of the year the student started.
  Nothing may assume a single handbook. This rule exists because the first
  version held only 2026 and called COMP8830 impossible for Master of
  Computing students; its 2026 wording was a year behind a course change, and
  the 2027 wording fixes it.
- **Before calling a rule contradictory, read the same rule in the other
  years.** A rule that looks wrong in one year is usually mid-transition.
- Past the latest handbook, the latest is assumed and the page says so. Inside
  the range, a course missing from that year's handbook is a warning.

## The data rules

- **Never guess a requisite.** When P&C's prose has two readings, the parser
  returns `ambiguous` and a person writes the reading into
  `data/requisite-readings.json`, with a sentence saying why. A reading is
  bound to the exact wording it reads, not to a course code. Do not make the
  parser cleverer to get a course out of that file unless the new rule is
  general and every existing parsed tree still matches its source text.
- **Anything the parser drops must make the result ambiguous, never smaller.**
  Three silent misparses taught this, each now a rule: STAT7039 lost the half
  of a sentence an abbreviation split off (a requirement sentence that yields
  nothing is ambiguous); COMP6340 read a "must contact Student Services"
  instruction as a condition (a procedure is not a requirement); INFS8004 lost
  an unknown program and kept the dangling "or" (an operator with nothing
  before it is ambiguous).
- **Check every parsed tree against its source text after any parser change**,
  not only the ones a test names: `pnpm readings --all`, diffed before and
  after.
- **Program and specialisation rules are hand-encoded per wording** in
  `data/rule-readings.json`. A specialisation the program names but the
  handbook doesn't publish (Machine Learning in 2027) is kept as unpublished,
  never filled in from another year.
- **The network is touched in one place.** `pnpm scrape` writes
  `data/handbook/<year>.json`; the build and the server read only those
  files. `pnpm readings` then lists every wording that needs a person. Never
  add a live fetch from P&C to a page or to the build.

## The product rules

- **Warn, never block.** No check may stop a student placing a course, in any
  semester, or twice. The rules are a snapshot of prose; the student may hold
  a permission code, or be retaking a course.
- **Say what isn't checked.** Caveats (GPA, permission codes, "equivalent"),
  unencoded program rules, and the snapshot date stay visible on the page.
- **Every internal link must resolve.** Codes a requisite mentions but the
  snapshot lacks become stub rows with their own page. CI runs linkinator over
  the live site after deploy, and `spec/catalog.test.ts` crawls the same way
  locally first.
- **Add every new kind of page to `spec/routes.ts`**, or the accessibility
  invariants stop covering it.

## The schema

- Change `src/lib/schema.ts`, then `pnpm db:generate`, and commit the
  migration with it. Never edit the database on the volume.
- drizzle-kit asks interactively when a change both drops and creates a table
  (it wants to know if it's a rename), and fails without a TTY. Split such a
  change into two migrations: additions first, then the drop.
- The handbook tables are rebuilt from `data/` at every boot; `plans` and
  `plan_items` are student state and nothing but the planner writes to them.
- A placement is addressed by its id, not its course code: a course can be in
  a plan twice (COMP8715 must be).

## Checks

- `pnpm check` is typecheck, build, then every `spec/*.test.ts` against the
  built server. It must be green before a commit.
- Assert the page's `data-*` contract (`data-course`, `data-status`,
  `data-warning`, `data-source`), not its wording, so the copy can change.
- Before claiming a layout works on a phone, measure `scrollWidth` at 390px on
  every route. A `<select>` sizes to its longest option and once pushed the
  plan page to 739px.

## Machine and deploy

- Git Bash on Windows. Node 24 and pnpm are in `E:\ANU\COMP8020\.tools`, and
  `flyctl` in `.tools\flyctl`; export both onto `PATH` in every shell.
- The Fly app name is lowercase: `comp4020-crit7-ruiquanqiao`, although the
  repo name has capitals. Deploy by hand while the repo is private:
  `FLY_API_TOKEN` from `mise.local.toml`, then
  `flyctl deploy --remote-only --ha=false -a comp4020-crit7-ruiquanqiao`.
- CI's post-deploy steps probe `/api/events` for SSE bytes and POST to `/`
  expecting a same-origin POST to pass and a cross-site one to get 403. Keep
  the events endpoint and never prerender `/`.

## Writing

- Commit messages are the process record: say what was tried and discarded,
  and put the measured numbers in. Count before writing a number.
- Everything in this repo is written in English, in my voice.
