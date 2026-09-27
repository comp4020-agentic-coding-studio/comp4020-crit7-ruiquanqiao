# Process overview

## What I built

Prereq: the ANU Programs and Courses handbook with its prerequisites, offerings
and incompatibilities turned from paragraphs into relations, and a semester
planner that checks every placement against them. `README.md` has the argument
for its shape.

## How I got here

My first idea was to merge the three places enrolment happens: ANUHub to
enrol, Timetable for class times, P&C for course details. I dropped it before
writing code. Merging three systems is mostly glue, and what had cost me real
time planning my own degree was narrower: P&C states a course's prerequisites
and leaves all the reasoning to you. That was the slice worth building.

**The parser is allowed to say no.**
[`f2cdc9d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/f2cdc9d)
The obvious move was a parser, or a model, that turns every requisite sentence
into a tree. But some sentences have two readings, and a tree built from the
wrong one tells a student they can enrol when they can't. So AND and OR mixed
without brackets comes back "ambiguous" with a reason, and I read those by
hand, each with a sentence of justification. Checking every parsed tree against
its source, not only the tested ones, found a silent misparse: STAT7039 came
out as "STAT7055" because an abbreviation split the sentence and the half
holding the condition was dropped. It became a rule rather than a special case,
a requirement sentence that yields nothing is ambiguous, and the counts moved
from 42/16/10 to 41 parsed, 17 hand-read, 10 with no requirement. A test now
fails if a re-scrape produces an ambiguous course nobody has read. Writing the
readings also exposed a contradiction in P&C itself: COMP8830, taken
literally, cannot be met by a Master of Computing student. I kept it literal
and flagged it.

**The snapshot was counted, not assumed.**
[`10a85d4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/10a85d4)
P&C's search for "COMP" returns 92 postgraduate courses, but 31 are other
subjects that only mention COMP in their text. The real figure is 61, plus 7
postgraduate courses the requisites point to. The scrape runs once, by hand,
and is committed, so neither the build nor the server depends on P&C being up.

**The tree lives in the database.**
[`f61da82`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/f61da82)
Each requisite is stored as rows, and the planner reads trees back out of the
database rather than reusing the parse, so it judges by what is stored. That
makes "which courses does this unlock?" a single query, which is the question
P&C can't answer. No check blocks a placement: the rules are a snapshot of
prose, and the student may hold a permission code.

**Checked the way CI and a marker will meet it.**
[`f61da82`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/f61da82),
[`5f4a159`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-RuiquanQiao/commit/5f4a159)
I walked the flow in a browser: COMP6120 in Semester 1 warned twice (Semester
2 only; needs COMP6442) and cleared once COMP7710 and MATH6005 came first. A
spec test crawls the running app the way CI's post-deploy link check will: 135
pages, no dead links. Loading every route in a 390px frame found the plan page
739px wide, a `<select>` sizing itself to its longest option; it now measures
386 of 386. After deploying I replayed CI's probes against the live URL: the
event stream answers, a same-origin POST passes, and a cross-site one gets 403.
