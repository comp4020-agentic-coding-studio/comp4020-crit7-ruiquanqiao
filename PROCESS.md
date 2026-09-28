# Process overview

## What I built

Prereq: every course in the ANU Programs and Courses handbooks for 2024 to 2027, with
prerequisites, offerings, incompatibilities and degree rules turned from
paragraphs into relations, and a semester planner that checks every placement
by the right year's rules. `README.md` has the argument for its shape.

## How I got here

My first idea was to merge the three places enrolment happens: ANUHub to
enrol, Timetable for class times, P&C for course details. I dropped it before
writing code. Merging three systems is mostly glue, and what had cost me real
time planning my own degree was narrower: P&C states a course's prerequisites
and leaves all the reasoning to you.

**The parser is allowed to say no.**
[`f2cdc9d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/f2cdc9d)
The obvious move was a parser, or a model, that turns every requisite sentence
into a tree. But some sentences have two readings, and a tree built from the
wrong one tells a student they can enrol when they can't. So AND and OR mixed
without brackets comes back "ambiguous", and a person reads it, with a reason.
Checking every parsed tree against its source, not only the tested ones, found
silent misparses three times: STAT7039 lost half a sentence to an abbreviation,
and later
[`f62a43b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/f62a43b)
COMP6340 read an instruction to contact Student Services as a condition, and
INFS8004 dropped an unknown program and kept the dangling "or". Each became a
general rule, not a special case, and diffing all four years' trees before and
after the last one showed exactly one change. A test fails if any year's
ambiguous wording has no reading.

**One year was the wrong model, and I knew because I had lived it.**
[`f62a43b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/f62a43b)
The first version held only the 2026 handbook, and it told me COMP8830 could
never be met by a Master of Computing student: its wording names COMP8260,
while the 2026 program makes COMP8280 compulsory. I had taken COMP8260 in my
first semester, when it was the compulsory course. The 2027 wording adds
COMP8280. It was a rule a year behind a course change, and the error was mine:
rules apply by two different years, the year a course is taken and the year a
degree starts, and the model had one. Now every course has a version per year,
program and specialisation rules are rows per year, and each hand reading is
bound to the exact wording it reads, so a changed sentence waits for a person.
Four years side by side also showed that COMP6250 and COMP8260, compulsory for
my cohort, stop running in 2026, and that the 2027 handbook names a Machine
Learning specialisation it never publishes.

**Checked the way CI and a marker will meet it, and sensors where it failed.**
[`5f4a159`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/5f4a159),
[`18d3ccd`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/18d3ccd)
A spec test crawls the running app the way CI's post-deploy link check will:
436 pages, no dead links. Loading every route in a 390px frame found the plan
page 739px wide, a `<select>` sizing itself to its longest option; it measures
386 of 386 now. The year model then went red on the runner with every test
green locally: axe over the course list took 5.7s against a 5s limit, because
the new per-year history had taken the page to 1664 nodes. Rather than raise
the timeout, the cards carry that history as one line (752 nodes) and a test
holds the page under 800, so growth fails here first.
