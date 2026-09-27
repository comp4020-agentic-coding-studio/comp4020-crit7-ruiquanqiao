# Prereq

Programs and Courses is where ANU keeps the rules for every course: what you
need first, which semester it runs, what it can't be counted alongside, and
what your degree requires. It keeps all of them as paragraphs. When I planned
my own Master of Computing I had to do the rest by hand: work out an order,
notice that a course only runs in Semester 2, trace a prerequisite back through
two more courses, and keep a list of compulsory courses in my head. Prereq is
the version I wanted. It holds the same rules as data, so you can put courses
into semesters and it tells you, placement by placement, what won't work and
why.

## What good looks like here

**It is honest about what it read.** The requisite text on P&C is written by
people for people, and some of it has two readings: "COMP6670 or COMP3670 OR
(...) and (...) and (...)" can be grouped either way. A tool that picks one
silently will one day tell a student they can enrol when they can't. So the
parser refuses anything ambiguous instead of guessing, and a person reads it: 41
courses were read automatically, 17 were refused and read by hand, each with a
written reason, and 10 have no requirement. Every course page says which of
those it is and keeps the handbook's original wording one click away.

**It warns and never blocks.** The rules come from a snapshot of prose, and a
student holding a permission code or credit for earlier study knows things this
site doesn't. You can place any course anywhere; the plan tells you what is
wrong with it and leaves the call to you.

**It shows what it doesn't check.** Some requisites ask for a GPA, a permission
code or "equivalent" study, and the degree panel doesn't check specialisations.
Both say so on the page rather than implying a clean bill of health.

**It answers the question P&C can't.** Because each prerequisite is stored as a
tree of rows rather than a sentence, every course page can list the courses it
leads to. That reverse direction is exactly what you need when deciding what to
take first, and the handbook has no way to show it.

Transforming the prose into structure also surfaced a contradiction the prose
hides: taken literally, COMP8830 requires Master of Computing students to have
COMP8260, but the program's compulsory course is COMP8280, which P&C lists as
incompatible with COMP8260. Prereq shows the rule as written and flags it,
rather than quietly correcting the handbook.

## What is checked, and what is judgement

The automated checks hold the parts that can be stated exactly: the parser's
reading of real handbook sentences, the rule that every refused course has a
person's reading, a plan that survives a reload, a warning for a course placed
in a semester it doesn't run, for a prerequisite placed after the course that
needs it, and for incompatible courses, plus a crawl of every internal link.
Whether each hand-written reading is the right one, and whether the pages are
clear to a student at the point of choosing, are judgement calls; the readings
are published beside the rules so anyone can dispute them.

## What I chose not to build

No accounts: a plan lives at its own address, which you can bookmark or share.
Only the Master of Computing's rules are encoded, because they are the ones I
could check against my own degree. Class times and the timetable are out of
scope. The handbook is read once and committed as a snapshot (dated on every
list page), so the site keeps working when P&C is slow or changes its markup;
offerings are from 2026 and assumed to repeat each year.
