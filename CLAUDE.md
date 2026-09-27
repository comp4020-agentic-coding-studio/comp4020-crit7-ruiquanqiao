# Harness: Prereq

The rules I hold the agent to in this repo. The brief and spec are on the
course site (crit 7, "Build the ANU system you wish existed"); `README.md` says
what the app is and why it is shaped this way.

## The data rules

- **Never guess a requisite.** When P&C's prose has two readings, the parser
  returns `ambiguous` and a person writes the reading into
  `data/requisite-overrides.json`, with a sentence saying why. Do not make the
  parser cleverer to get a course out of that file unless the new rule is
  general and every existing parsed tree still matches its source text.
- **A requirement sentence that yields nothing is ambiguous, not empty.** This
  rule exists because STAT7039 once parsed as "STAT7055" alone: an
  abbreviation split the sentence and the half holding the real condition was
  silently dropped.
- **Check every parsed tree against its source text after any parser change**,
  not only the ones a test names. Print them with `formatReq` and read them.
- **Keep a rule literal even when it looks wrong.** COMP8830 as written cannot
  be met by an MCOMP student; it is flagged in its reading, not corrected.
- **The network is touched in one place.** `pnpm scrape` writes
  `data/catalog.json`; the build and the server read only that file. Never add
  a live fetch from P&C to a page or to the build.

## The product rules

- **Warn, never block.** No check may stop a student placing a course. The
  rules are a snapshot of prose; the student may hold a permission code.
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
- The catalog tables are rebuilt from `data/` at every boot; `plans` and
  `plan_items` are student state and nothing but the planner writes to them.

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
