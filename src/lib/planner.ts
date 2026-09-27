import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { type CatalogCourse, getCourse, HANDBOOK_YEAR } from "./catalog";
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

export function isTerm(value: string): boolean {
  return /^20\d\d-S[12]$/.test(value);
}

// --- judging one placement ---------------------------------------------------

type Context = {
  done: Set<string>; // finished in an earlier term
  now: Set<string>; // taken in the same term
  program: string;
};

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
      for (const code of ctx.done) {
        const course = getCourse(code);
        if (course && course.subject === req.subject && course.level >= req.level) total += course.units;
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
      return `enrolment in ${PROGRAMS[req.program] ?? req.program}`;
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

// "Needs A or B first", plus which of those may share the semester.
export function needsMessage(req: Req, ctx: Context): string {
  const alongside = [...new Set(unmetConcurrent(req, ctx))];
  const tail = alongside.length ? ` (${alongside.join(" or ")} can also be taken alongside it)` : "";
  return `Needs ${missing(req, ctx)} first${tail}.`;
}

function unmetConcurrent(req: Req, ctx: Context): string[] {
  if (meets(req, ctx)) return [];
  if (req.kind === "all" || req.kind === "any") return req.of.flatMap((r) => unmetConcurrent(r, ctx));
  return req.kind === "course" && req.concurrent ? [req.code] : [];
}

export type Warning = {
  kind: "requisites" | "offering" | "incompatible" | "program";
  message: string;
};

export type JudgedItem = PlanItem & { course: CatalogCourse; warnings: Warning[] };

function contextAt(items: PlanItem[], term: string, program: string): Context {
  return {
    done: new Set(items.filter((i) => i.term < term).map((i) => i.courseCode)),
    now: new Set(items.filter((i) => i.term === term).map((i) => i.courseCode)),
    program,
  };
}

// Every check warns and none blocks: the rules come from a snapshot of prose,
// and a student with a permission code or a credit knows things this doesn't.
export function judge(course: CatalogCourse, term: string, items: PlanItem[], program: string): Warning[] {
  const warnings: Warning[] = [];
  const session = termSession(term);
  if (course.sessions.length === 0) {
    warnings.push({ kind: "offering", message: `Not offered at all in ${HANDBOOK_YEAR}.` });
  } else if (!course.sessions.includes(session)) {
    warnings.push({
      kind: "offering",
      message: `Only offered in ${course.sessions.join(" and ")}, not ${session}.`,
    });
  }
  const ctx = contextAt(items, term, program);
  if (course.tree && !meets(course.tree, ctx)) {
    warnings.push({ kind: "requisites", message: needsMessage(course.tree, ctx) });
  }
  if (course.excludedPrograms.split(",").includes(program)) {
    warnings.push({
      kind: "program",
      message: `Closed to students in the ${PROGRAMS[program] ?? program}.`,
    });
  }
  const clashes = items.filter((i) => i.courseCode !== course.code && course.incompatible.includes(i.courseCode));
  if (clashes.length > 0) {
    warnings.push({
      kind: "incompatible",
      message: `Incompatible with ${clashes.map((i) => i.courseCode).join(", ")}, also in this plan.`,
    });
  }
  return warnings;
}

// The first term, from the plan's start, where a course is offered and its
// requisites are met by what the plan has already scheduled.
export function earliestTerm(course: CatalogCourse, plan: Plan, items: PlanItem[]): string | null {
  const others = items.filter((i) => i.courseCode !== course.code);
  for (const term of termsFrom(plan.startTerm, 6)) {
    const ok = judge(course, term, others, plan.program).every((w) => w.kind === "incompatible");
    if (ok) return term;
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
    return course ? [{ ...item, course, warnings: judge(course, item.term, items, plan.program) }] : [];
  });
}

// Adding a course that is already in the plan moves it to the new term.
export function placeCourse(planId: string, courseCode: string, term: string): void {
  db.insert(planItems)
    .values({ planId, courseCode, term })
    .onConflictDoUpdate({ target: [planItems.planId, planItems.courseCode], set: { term } })
    .run();
}

export function removeCourse(planId: string, courseCode: string): void {
  db.delete(planItems)
    .where(and(eq(planItems.planId, planId), eq(planItems.courseCode, courseCode)))
    .run();
}

export function copyPlan(source: Plan): Plan {
  const copy = createPlan(source.startTerm, source.program);
  for (const item of getItems(source.id)) placeCourse(copy.id, item.courseCode, item.term);
  return copy;
}

// A read-only example anyone can open or copy: a full MCOMP path from Semester
// 1 2026 that clears every check. Rewritten at boot so it can't drift.
export const EXAMPLE_ID = "example";
const EXAMPLE: Record<string, string[]> = {
  "2026-S1": ["COMP7710", "MATH6005", "COMP8280"],
  "2026-S2": ["COMP6442", "COMP6120", "COMP6670", "COMP6390"],
  "2027-S1": ["COMP8600", "COMP6242", "COMP6528", "COMP8715"],
  "2027-S2": ["COMP8020", "COMP6466", "COMP6261", "COMP6464"],
};

db.transaction((tx) => {
  tx.delete(plans).where(eq(plans.id, EXAMPLE_ID)).run();
  tx.insert(plans).values({ id: EXAMPLE_ID, program: "MCOMP", startTerm: "2026-S1" }).run();
  for (const [term, codes] of Object.entries(EXAMPLE)) {
    for (const courseCode of codes) tx.insert(planItems).values({ planId: EXAMPLE_ID, courseCode, term }).run();
  }
});
