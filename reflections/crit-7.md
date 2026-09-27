# Crit 7 — Prereq

## What was the breakthrough that moved the work forward?

Deciding that the parser was allowed to refuse, and then being wrong anyway.

I started out treating the requisite text as a translation problem: every
sentence in, a tree out. COMP8600 broke that. "COMP6670 or COMP3670 OR (...)
and (...) and (...)" has two honest readings, and any code that picks one is
deciding on the university's behalf. Once "ambiguous" was a legitimate answer,
the parser only had to be right about what it claimed, and the unclear
sentences went to a person with the reason attached.

Then it produced a finding I was proud of: COMP8830, as written, could never be
met by a Master of Computing student. I put it in the README. It was wrong, and
I knew it was wrong the moment I thought about my own enrolment: I took
COMP8260 in my first semester, when it was the compulsory course. The rule
wasn't contradictory, it was a year behind, and the 2027 handbook fixes it. My
model held one year where the real system has two.

## What did this work change about who I want to be as a software developer?

I want to build systems that say "I don't know" out loud, and I want to check
their confident answers against something I actually know.

An agent, like a parser, will always produce something plausible. A confident
wrong answer about whether you can enrol costs a student a semester, and it
looks exactly like a right one. The work that mattered this week was choosing
where the system must stop and hand over, and making those stops visible. But
the COMP8830 mistake got past every one of those stops, because it wasn't a
misread sentence. The model itself was too small. No test caught it. My own
transcript did.

So the database became the design. Once courses had versions and rules had
years, a student can plan against the rules that will actually apply to them.
That is the system I will use for my own final semester.
