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

**It knows which year's rules apply.** Rules change from year to year, and
they apply by two different years. A course is judged by the handbook of the
year you take it; your degree by the handbook of the year you started. Prereq
holds the 2024 to 2027 handbooks and applies each rule by the right one. A
2025 starter is held to the 2025 compulsory courses, not 2026's. A course
placed in 2027 is judged by its 2027 wording. A course placed in a year whose
handbook isn't published yet is judged by the latest one, and the plan says
so. Every course page shows its offerings in each year and every change to
its requisite wording.

**It is honest about what it read.** The requisite text on P&C is written by
people for people, and some of it has two readings: "COMP6670 or COMP3670 OR
(...) and (...) and (...)" can be grouped either way. A tool that picks one
silently will one day tell a student they can enrol when they can't. So the
parser refuses anything ambiguous instead of guessing, and a person reads it.
Each reading is tied to the exact wording it reads, with the reason written
down, and a changed sentence in a new year has no reading until someone gives
it one. Across the four years, 38 wordings are hand-read and the rest are read
automatically or have no requirement. Every course page says which applies and
keeps the handbook's wording one click away.

**It warns and never blocks.** The rules come from snapshots of prose, and a
student holding a permission code or credit for earlier study knows things this
site doesn't. You can place any course in any semester, twice if you are
retaking it; the plan tells you what is wrong and leaves the call to you.

**It shows what it doesn't check.** Some requisites ask for a GPA, a permission
code or "equivalent" study. Those are marked as caveats rather than implied to
pass.

**It answers the question P&C can't.** Because each prerequisite is stored as a
tree of rows rather than a sentence, every course page can list the courses it
leads to. That reverse direction is what you need when deciding what to take
first, and the handbook has no way to show it.

Keeping four years side by side showed things no single year does. COMP6250
and COMP8260, compulsory for students who started in 2025, are not offered from
2026. The 2027 handbook still names Machine Learning among the Master of
Computing's specialisations but publishes no page for it, while its Artificial
Intelligence specialisation now carries the machine-learning courses. Prereq
records the named-but-unpublished specialisation as exactly that.

## What is checked, and what is judgement

The automated checks hold the parts that can be stated exactly: the parser's
reading of real handbook sentences in every year, the rule that every refused
wording has a person's reading and every program and specialisation wording its
encoded rules, a plan that survives a reload, the right year's rules applied to
each placement and to the degree, COMP8715 taken twice in consecutive
semesters, and a crawl of every internal link. Whether each hand-written
reading is the right one, and whether the pages are clear to a student at the
point of choosing, are judgement calls; the readings are published beside the
rules so anyone can dispute them.

## What I chose not to build

No accounts: a plan lives at its own address, which you can bookmark or share.
Only the Master of Computing's rules are encoded, because they are the ones I
could check against my own degree. Class times and the timetable are out of
scope. The handbooks are read once and committed as snapshots (dated on every
list page), so the site keeps working when P&C is slow or changes its markup;
`pnpm scrape` refreshes them and `pnpm readings` lists whatever wording then
needs a person.
