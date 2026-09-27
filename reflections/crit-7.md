# Crit 7 — Prereq

## What was the breakthrough that moved the work forward?

Deciding that the parser was allowed to refuse.

I started out treating the requisite text as a translation problem: every
sentence in, a tree out. COMP8600 broke that. "COMP6670 or COMP3670 OR (...)
and (...) and (...)" has two honest readings, and any code that picks one is
making a decision on the university's behalf. Once "ambiguous" was a legitimate
answer, the work changed shape. The parser only had to be right about what it
claimed, and seventeen courses went to a person with the reason attached. The
same step found things I wasn't looking for: a misparse that had looked like a
success, and a rule in COMP8830 that no Master of Computing student can
satisfy as written. Prose hides contradictions that structure can't.

## What did this work change about who I want to be as a software developer?

I want to build systems that say "I don't know" out loud.

Everything that makes this course's tools productive also makes them fluent:
an agent, like a parser, will always produce something plausible. A confident
wrong answer about whether you can enrol costs a student a semester, and it
looks exactly like a right one. The useful work this week was not the parsing.
It was choosing where the system has to stop and hand over, then making those
stops visible: a mark on every hand-read rule, the original wording one click
away, a list of what isn't checked, and a test that fails when a new ambiguity
arrives with nobody to read it.

It is also the first time the database was the design rather than storage.
Once the rules were rows, the question P&C can't answer, what a course leads
to, came out as a single query.
