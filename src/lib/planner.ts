import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { type CatalogCourse, getCourse, LATEST_YEAR, type Resolved, resolve, type Version } from "./catalog";
import { db } from "./db";
import { PROGRAMS, type Req } from "./requisites";
import { type Plan, type PlanItem, planItems, plans } from "./schema";

// --- terms -------------------------------------------------------------------

export const TERMS_SHOWN = 4;

export function termsFrom(start: string, count = TERMS_SHOWN): string[] {
  let [year, session] = [Number(start.slice(0, 4)), start.slice(5)];
  const terms: string[] = [];
  for (let i = 0; i < count; i++) {
    terms.push(`${year}-${session}`);
    if (session === "S1") session = "S2";
    else [year, session] = [year + 1, "S1"];
  }
  return terms;
}

export function termLabel(term: string): string {
  return `${term.slice(5) === "S1" ? "Semester 1" : "Semester 2"} ${term.slice(0, 4)}`;
}

export function termSession(term: string): "S1" | "S2" {
  return term.slice(5) === "S1" ? "S1" : "S2";
}

export const termYear = (term: string) => Number(term.slice(0, 4));

// The semesters a plan shows: at least four from its start, through its last
// placement, and one empty semester after, so a part-time or longer plan can
// always grow.
export function planTerms(startTerm: string, items: PlanItem[]): string[] {
  const first = items.reduce((min, i) => (i.term < min ? i.term : min), startTerm);
  const last = items.reduce((max, i) => (i.term > max ? i.term : max), termsFrom(startTerm, TERMS_SHOWN).at(-1) as string);
  const terms = [first];
  while ((terms.at(-1) as string) < last) terms.push(termsFrom(terms.at(-1) as string, 2)[1]);
  const extra = items.some((i) => i.term === last) ? termsFrom(last, 2)[1] : null;
  return extra ? [...terms, extra] : terms;
}

export function isTerm(value: string): boolean {
  return /^20\d\d-S[12]$/.test(value);
}

// Semester 1 runs late February to June, Semester 2 late July to November.
// Enrolment for a semester has closed once it starts, so the first term still
// open for planning is the one after whichever is running.
export function nextOpenTerm(today = new Date()): string {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  return month <= 1 ? `${year}-S1` : month <= 6 ? `${year}-S2` : `${year + 1}-S1`;
}

export function termStatus(term: string, today = new Date()): "past" | "current" | "future" {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const current = month >= 2 && month <= 6 ? `${year}-S1` : month >= 7 && month <= 11 ? `${year}-S2` : null;
  if (term === current) return "current";
  return term < nextOpenTerm(today) ? "past" : "future";
}

// --- judging one placement ---------------------------------------------------

type Context = {
  done: Map<string, number>; // code → year finished, earlier terms only
  now: Set<string>; // taken in the same term
  program: string;
};

export function unitsIn(code: string, year: number): number {
  const course = getCourse(code);
  return (course && resolve(course, year).version?.units) || 6;
}

export function meets(req: Req, ctx: Context): boolean {
  switch (req.kind) {
    case "all":
      return req.of.every((r) => meets(r, ctx));
    case "any":
      return req.of.some((r) => meets(r, ctx));
    case "course":
      return ctx.done.has(req.code) || (req.concurrent && ctx.now.has(req.code));
    case "program":
      return req.program === ctx.program || req.program === "PG";
    case "units": {
      let total = 0;
      for (const [code, year] of ctx.done) {
        const course = getCourse(code);
        if (course && course.subject === req.subject && course.level >= req.level) total += unitsIn(code, year);
      }
      return total >= req.units;
    }
  }
}

export function describeLeaf(req: Req): string {
  switch (req.kind) {
    case "course":
      return req.concurrent ? `${req.code} (earlier or same semester)` : req.code;
    case "program":
      return `enrolment in the ${PROGRAMS[req.program] ?? req.program}`;
    case "units":
      return `${req.units} units of ${req.level > 1000 ? `${req.level}-level ` : ""}${req.subject} courses`;
    default:
      return "";
  }
}

// What's missing, in words: only the unmet branches of an all, every option of
// an unmet any.
export function missing(req: Req, ctx: Context, nested = false): string {
  if (req.kind === "all") {
    const parts = req.of.filter((r) => !meets(r, ctx)).map((r) => missing(r, ctx, true));
    const text = parts.join(" and ");
    return nested && parts.length > 1 ? `(${text})` : text;
  }
  if (req.kind === "any") {
    const text = req.of.map((r) => missing(r, ctx, true)).join(" or ");
    return nested ? `(${text})` : text;
  }
  return req.kind === "course" ? req.code : describeLeaf(req);
}

function unmetConcurrent(req: Req, ctx: Context): string[] {
  if (meets(req, ctx)) return [];
  if (req.kind === "all" || req.kind === "any") return req.of.flatMap((r) => unmetConcurrent(r, ctx));
  return req.kind === "course" && req.concurrent ? [req.code] : [];
}

// "Needs A or B first", plus which of those may share the semester.
export function needsMessage(req: Req, ctx: Context): string {
  const alongside = [...new Set(unmetConcurrent(req, ctx))];
  const tail = alongside.length ? ` (${alongside.join(" or ")} can also be taken alongside it)` : "";
  return `Needs ${missing(req, ctx)} first${tail}.`;
}

export type Warning = {
  kind: "handbook" | "requisites" | "offering" | "incompatible" | "program" | "repeat";
  message: string;
};

export type JudgedItem = PlanItem & {
  course: CatalogCourse;
  resolved: Resolved;
  units: number;
  warnings: Warning[];
};

export function contextAt(items: PlanItem[], term: string, program: string): Context {
  return {
    done: new Map(items.filter((i) => i.term < term).map((i) => [i.courseCode, termYear(i.term)])),
    now: new Set(items.filter((i) => i.term === term).map((i) => i.courseCode)),
    program,
  };
}

// Every check reads the handbook of the year the course is taken, and every
// check warns; none blocks. The rules come from snapshots of prose, and a
// student with a permission code or a credit knows things this doesn't.
export function judge(course: CatalogCourse, term: string, items: PlanItem[], program: string): Warning[] {
  const { version, year } = resolve(course, termYear(term));
  if (!version) return [{ kind: "handbook", message: `Not in the ${year} handbook.` }];
  return [...judgeVersion(version, year, course.code, term, items, program), ...judgeRepeats(version, course.code, term, items)];
}

// A course is normally counted once, so a second placement is flagged (it may
// be a retake). COMP8715 is the exception the handbook spells out: it must be
// taken twice, in consecutive semesters.
function judgeRepeats(version: Version, code: string, term: string, items: PlanItem[]): Warning[] {
  const terms = items.filter((i) => i.courseCode === code).map((i) => i.term).sort();
  if (version.takenTwice) {
    const next = termsFrom(term, 2)[1];
    const previous = terms.filter((t) => t < term).at(-1);
    const paired = terms.includes(next) || (previous !== undefined && termsFrom(previous, 2)[1] === term);
    if (terms.length === 1) return [{ kind: "repeat", message: `Taken twice, in consecutive semesters: add it to ${termLabel(next)} too.` }];
    if (!paired) return [{ kind: "repeat", message: "Its two semesters must be consecutive." }];
    if (terms.length > 2) return [{ kind: "repeat", message: `Planned ${terms.length} times; it is taken twice.` }];
    return [];
  }
  const others = terms.filter((t) => t !== term);
  return others.length
    ? [{ kind: "repeat", message: `Also planned for ${others.map(termLabel).join(", ")}; it counts only once.` }]
    : [];
}

function judgeVersion(version: Version, year: number, code: string, term: string, items: PlanItem[], program: string) {
  const warnings: Warning[] = [];
  const session = termSession(term);
  if (version.sessions.length === 0) {
    warnings.push({ kind: "offering", message: `Not offered in ${year}.` });
  } else if (!version.sessions.includes(session)) {
    warnings.push({ kind: "offering", message: `Offered only in ${version.sessions.join(" and ")} in ${year}, not ${session}.` });
  }
  const ctx = contextAt(items, term, program);
  if (version.tree && !meets(version.tree, ctx)) {
    warnings.push({ kind: "requisites", message: needsMessage(version.tree, ctx) });
  }
  if (version.excludedPrograms.split(",").includes(program)) {
    warnings.push({ kind: "program", message: `Closed to students in the ${PROGRAMS[program] ?? program}.` });
  }
  const clashes = items.filter((i) => i.courseCode !== code && version.incompatible.includes(i.courseCode));
  if (clashes.length > 0) {
    warnings.push({
      kind: "incompatible",
      message: `Incompatible with ${clashes.map((i) => i.courseCode).join(", ")}, also in this plan.`,
    });
  }
  return warnings;
}

// The first term still open for enrolment, from the plan's start, where a
// course runs and its requisites are met by what the plan already schedules.
export function earliestTerm(course: CatalogCourse, plan: Plan, items: PlanItem[]): string | null {
  const others = items.filter((i) => i.courseCode !== course.code);
  const open = nextOpenTerm();
  for (const term of termsFrom(plan.startTerm > open ? plan.startTerm : open, 6)) {
    if (judge(course, term, others, plan.program).every((w) => w.kind === "incompatible")) return term;
  }
  return null;
}

// --- plans ---------------------------------------------------------------------

export function createPlan(startTerm: string, program = "MCOMP"): Plan {
  const id = randomBytes(6).toString("base64url");
  return db.insert(plans).values({ id, program, startTerm }).returning().get();
}

export function getPlan(id: string): Plan | undefined {
  return db.select().from(plans).where(eq(plans.id, id)).get();
}

export function getItems(planId: string): PlanItem[] {
  return db.select().from(planItems).where(eq(planItems.planId, planId)).orderBy(planItems.term, planItems.courseCode).all();
}

export function judgedItems(plan: Plan): JudgedItem[] {
  const items = getItems(plan.id);
  return items.flatMap((item) => {
    const course = getCourse(item.courseCode);
    if (!course) return [];
    const resolved = resolve(course, termYear(item.term));
    return [
      {
        ...item,
        course,
        resolved,
        units: resolved.version?.units ?? unitsIn(item.courseCode, LATEST_YEAR),
        warnings: judge(course, item.term, items, plan.program),
      },
    ];
  });
}

// A course appears at most once per semester; adding it again elsewhere is a
// second placement, which the planner then judges.
export function placeCourse(planId: string, courseCode: string, term: string): void {
  db.insert(planItems).values({ planId, courseCode, term }).onConflictDoNothing().run();
}

export function moveItem(planId: string, itemId: number, term: string): void {
  const item = db
    .select()
    .from(planItems)
    .where(and(eq(planItems.planId, planId), eq(planItems.id, itemId)))
    .get();
  if (!item || item.term === term) return;
  db.transaction((tx) => {
    // moving onto the same course in the target semester merges the two
    const clash = tx
      .select()
      .from(planItems)
      .where(and(eq(planItems.planId, planId), eq(planItems.courseCode, item.courseCode), eq(planItems.term, term)))
      .get();
    if (clash) tx.delete(planItems).where(eq(planItems.id, item.id)).run();
    else tx.update(planItems).set({ term }).where(eq(planItems.id, item.id)).run();
  });
}

export function removeItem(planId: string, itemId: number): void {
  db.delete(planItems)
    .where(and(eq(planItems.planId, planId), eq(planItems.id, itemId)))
    .run();
}

export function setSpecialisation(planId: string, specialisation: string | null): void {
  db.update(plans).set({ specialisation }).where(eq(plans.id, planId)).run();
}

export function copyPlan(source: Plan): Plan {
  const copy = createPlan(source.startTerm, source.program);
  setSpecialisation(copy.id, source.specialisation);
  for (const item of getItems(source.id)) placeCourse(copy.id, item.courseCode, item.term);
  return { ...copy, specialisation: source.specialisation };
}

// A read-only example anyone can open or copy: a full Master of Computing
// from Semester 1 2026 that clears every check, specialisation included.
// Rewritten at boot so it can't drift.
export const EXAMPLE_ID = "example";
const EXAMPLE_SPECIALISATION = "MCHL-SPEC";
const EXAMPLE: Record<string, string[]> = {
  "2026-S1": ["COMP7710", "MATH6005", "COMP8280"],
  "2026-S2": ["COMP6442", "COMP6120", "COMP6670", "COMP6390"],
  "2027-S1": ["COMP8600", "COMP6528", "COMP8715", "COMP8650"],
  "2027-S2": ["COMP8020", "COMP6261", "COMP8715", "COMP6466"],
};

db.transaction((tx) => {
  tx.delete(plans).where(eq(plans.id, EXAMPLE_ID)).run();
  tx.insert(plans)
    .values({ id: EXAMPLE_ID, program: "MCOMP", startTerm: "2026-S1", specialisation: EXAMPLE_SPECIALISATION })
    .run();
  for (const [term, codes] of Object.entries(EXAMPLE)) {
    for (const courseCode of codes) tx.insert(planItems).values({ planId: EXAMPLE_ID, courseCode, term }).run();
  }
});
