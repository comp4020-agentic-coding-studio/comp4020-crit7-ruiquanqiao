import { and, eq } from "drizzle-orm";
import readingsData from "../../data/requisite-readings.json";
import ruleReadingsData from "../../data/rule-readings.json";
import { db } from "./db";
import { codesInReq, type ParsedRequisite, parseRequisite, type Req, readReq } from "./requisites";
import {
  type Course,
  type CourseVersion,
  courseIncompatibilities,
  courseOfferings,
  courseRequisiteNodes,
  courses,
  courseVersions,
  type RequisiteNode,
  type Rule,
  ruleCourses,
  type RuleSet,
  ruleSets,
  rules,
} from "./schema";

// --- the snapshot files -------------------------------------------------------

type ScrapedCourse = {
  code: string;
  name: string;
  units: number;
  career: string;
  sessions: string[];
  description: string;
  requisiteText: string;
};
type ScrapedRuleSet = { code: string; name: string; requirementText: string; courses?: string[]; missing?: boolean };
type Handbook = {
  year: number;
  scrapedAt: string;
  program: ScrapedRuleSet & { specialisations: (ScrapedRuleSet & { courses: string[] })[] };
  courses: ScrapedCourse[];
};

const handbooks: Handbook[] = Object.values(
  import.meta.glob<Handbook>("../../data/handbook/*.json", { eager: true, import: "default" }),
).sort((a, b) => a.year - b.year);

export const HANDBOOK_YEARS = handbooks.map((h) => h.year);
export const FIRST_YEAR = HANDBOOK_YEARS[0];
export const LATEST_YEAR = HANDBOOK_YEARS[HANDBOOK_YEARS.length - 1];
export const SCRAPED_AT = handbooks[handbooks.length - 1].scrapedAt;

type Reading = { text: string; tree: string; reading: string };
const readings: Record<string, Reading[]> = readingsData;

export type RuleReading = {
  text: string;
  reading?: string;
  rules: {
    kind: Rule["kind"];
    label: string;
    units: number;
    level?: number;
    subjects?: string[];
    courses?: string[];
    // for "further": courses that may not count towards it
    exclude?: string[];
  }[];
};
const ruleReadings: Record<string, RuleReading[]> = ruleReadingsData as Record<string, RuleReading[]>;

// Wording is compared with its whitespace collapsed; a reading belongs to the
// exact words it reads, so a changed sentence in a new year has no reading
// until a person gives it one.
export const sameText = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

export function readingFor(code: string, text: string): Reading | undefined {
  return readings[code]?.find((r) => sameText(r.text, text));
}

export function ruleReadingFor(code: string, text: string): RuleReading | undefined {
  return ruleReadings[code]?.find((r) => sameText(r.text, text));
}

// --- seeding --------------------------------------------------------------------

type Judged = ParsedRequisite & { source: CourseVersion["requisiteSource"]; reading: string | null };

function judgeText(code: string, text: string): Judged {
  const result = parseRequisite(text);
  const reading = readingFor(code, text);
  if (result.status === "ambiguous") {
    // spec/requisites.test.ts keeps an unread ambiguity from shipping; if one
    // ever does, the course shows its wording and no verdict, not a guess
    return reading
      ? { ...result, tree: readReq(reading.tree), source: "hand-checked", reading: reading.reading }
      : { ...result, tree: null, source: "none", reading: null };
  }
  return { ...result, source: result.tree ? "parsed" : "none", reading: null };
}

// Rebuild the handbook tables from data/ on every boot, in one transaction.
// Courses are upserted rather than replaced so plan rows pointing at them
// survive; everything derived is cleared and rewritten. Plans are never touched.
function seed(): void {
  const judged = new Map<string, Judged>();
  const referenced = new Set<string>();
  const latestName = new Map<string, string>();

  for (const handbook of handbooks) {
    for (const course of handbook.courses) {
      const result = judgeText(course.code, course.requisiteText);
      judged.set(`${course.code}@${handbook.year}`, result);
      latestName.set(course.code, course.name);
      for (const code of [...(result.tree ? codesInReq(result.tree) : []), ...result.incompatible]) referenced.add(code);
    }
    const sets = [handbook.program, ...handbook.program.specialisations];
    for (const set of sets) {
      for (const rule of ruleReadingFor(set.code, set.requirementText)?.rules ?? []) {
        for (const code of [...(rule.courses ?? []), ...(rule.exclude ?? [])]) referenced.add(code);
      }
    }
    for (const spec of handbook.program.specialisations) for (const code of spec.courses) referenced.add(code);
  }

  db.transaction((tx) => {
    tx.delete(ruleCourses).run();
    tx.delete(rules).run();
    tx.update(ruleSets).set({ parentId: null }).run();
    tx.delete(ruleSets).run();
    tx.delete(courseRequisiteNodes).run();
    tx.delete(courseIncompatibilities).run();
    tx.delete(courseOfferings).run();
    tx.delete(courseVersions).run();

    const identity = (code: string, stub: boolean) => ({
      code,
      name: latestName.get(code) ?? code,
      subject: code.slice(0, 4),
      level: Number(code[4]) * 1000,
      stub,
    });
    for (const code of latestName.keys()) {
      const row = identity(code, false);
      tx.insert(courses).values(row).onConflictDoUpdate({ target: courses.code, set: row }).run();
    }
    for (const code of referenced) {
      if (latestName.has(code)) continue;
      const row = identity(code, true);
      tx.insert(courses).values(row).onConflictDoUpdate({ target: courses.code, set: row }).run();
    }

    for (const handbook of handbooks) {
      const year = handbook.year;
      for (const course of handbook.courses) {
        const result = judged.get(`${course.code}@${year}`) as Judged;
        tx.insert(courseVersions)
          .values({
            code: course.code,
            year,
            name: course.name,
            units: course.units,
            career: course.career,
            description: course.description,
            requisiteText: course.requisiteText,
            requisiteSource: result.source,
            requisiteReading: result.reading,
            caveat: result.caveat,
            excludedPrograms: result.excludedPrograms.join(","),
            takenTwice: /completed twice,? in consecutive semesters/i.test(course.description),
          })
          .run();
        for (const session of course.sessions as (typeof courseOfferings.$inferInsert)["session"][]) {
          tx.insert(courseOfferings).values({ code: course.code, year, session }).run();
        }
        for (const other of result.incompatible) {
          tx.insert(courseIncompatibilities).values({ code: course.code, year, otherCode: other }).onConflictDoNothing().run();
        }
        const insertNode = (req: Req, parentId: number | null, position: number): void => {
          const { id } = tx
            .insert(courseRequisiteNodes)
            .values({
              code: course.code,
              year,
              parentId,
              position,
              kind: req.kind,
              ref:
                req.kind === "course" ? req.code : req.kind === "program" ? req.program : req.kind === "units" ? req.subject : null,
              concurrent: req.kind === "course" && req.concurrent,
              units: req.kind === "units" ? req.units : null,
              level: req.kind === "units" ? req.level : null,
            })
            .returning({ id: courseRequisiteNodes.id })
            .get();
          if (req.kind === "all" || req.kind === "any") req.of.forEach((child, i) => insertNode(child, id, i));
        };
        if (result.tree) insertNode(result.tree, null, 0);
      }

      const programText = handbook.program.requirementText;
      const insertSet = (set: ScrapedRuleSet, kind: RuleSet["kind"], parentId: number | null): number => {
        const reading = set.missing ? undefined : ruleReadingFor(set.code, set.requirementText);
        const { id } = tx
          .insert(ruleSets)
          .values({
            kind,
            code: set.code,
            year,
            name: set.name,
            parentId,
            requirementText: set.requirementText,
            encoded: !!reading,
            reading: reading?.reading ?? null,
            offered: kind === "program" || programText.includes(set.name.replace(/-/g, " ")),
          })
          .returning({ id: ruleSets.id })
          .get();
        (reading?.rules ?? []).forEach((rule, position) => {
          const { id: ruleId } = tx
            .insert(rules)
            .values({
              ruleSetId: id,
              position,
              kind: rule.kind,
              label: rule.label,
              units: rule.units,
              level: rule.level ?? null,
              subjects: rule.subjects?.join(",") ?? null,
            })
            .returning({ id: rules.id })
            .get();
          const list = rule.kind === "further" ? (rule.exclude ?? []) : (rule.courses ?? []);
          for (const code of list) tx.insert(ruleCourses).values({ ruleId, code }).onConflictDoNothing().run();
        });
        return id;
      };
      const programId = insertSet(handbook.program, "program", null);
      for (const spec of handbook.program.specialisations) insertSet(spec, "specialisation", programId);
    }
  });
}

// --- reading it back ---------------------------------------------------------------

export type Version = CourseVersion & { sessions: string[]; tree: Req | null; incompatible: string[] };
export type CatalogCourse = Course & { versions: Map<number, Version> };

// Trees are read back out of the database, not reused from the parse, so what
// the planner judges by is what is stored.
function buildTree(rows: RequisiteNode[]): Req | null {
  const children = new Map<number | null, RequisiteNode[]>();
  for (const row of rows) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
  const build = (row: RequisiteNode): Req => {
    switch (row.kind) {
      case "all":
      case "any":
        return { kind: row.kind, of: (children.get(row.id) ?? []).sort((a, b) => a.position - b.position).map(build) };
      case "course":
        return { kind: "course", code: row.ref ?? "", concurrent: row.concurrent };
      case "program":
        return { kind: "program", program: row.ref ?? "" };
      case "units":
        return { kind: "units", units: row.units ?? 0, level: row.level ?? 0, subject: row.ref ?? "" };
    }
  };
  const root = children.get(null)?.[0];
  return root ? build(root) : null;
}

function load(): Map<string, CatalogCourse> {
  const key = (code: string, year: number) => `${code}@${year}`;
  const group = <T,>(rows: T[], keyOf: (row: T) => string) => {
    const map = new Map<string, T[]>();
    for (const row of rows) map.set(keyOf(row), [...(map.get(keyOf(row)) ?? []), row]);
    return map;
  };
  const nodes = group(db.select().from(courseRequisiteNodes).all(), (r) => key(r.code, r.year));
  const sessions = group(db.select().from(courseOfferings).all(), (r) => key(r.code, r.year));
  const incompatible = group(db.select().from(courseIncompatibilities).all(), (r) => key(r.code, r.year));
  const versions = group(db.select().from(courseVersions).all(), (r) => r.code);

  const map = new Map<string, CatalogCourse>();
  for (const course of db.select().from(courses).orderBy(courses.code).all()) {
    const byYear = new Map<number, Version>();
    for (const v of versions.get(course.code) ?? []) {
      const k = key(v.code, v.year);
      byYear.set(v.year, {
        ...v,
        sessions: (sessions.get(k) ?? []).map((s) => s.session),
        tree: buildTree(nodes.get(k) ?? []),
        incompatible: (incompatible.get(k) ?? []).map((i) => i.otherCode),
      });
    }
    map.set(course.code, { ...course, versions: byYear });
  }
  return map;
}

seed();
// The handbook only changes at boot, so it is read once and kept.
const catalog = load();

export function allCourses(): CatalogCourse[] {
  return [...catalog.values()];
}

// Courses with a version in the given handbook year.
export function coursesIn(year: number): CatalogCourse[] {
  return allCourses().filter((c) => c.versions.has(year));
}

export function getCourse(code: string): CatalogCourse | undefined {
  return catalog.get(code);
}

// Which version of a course applies in a calendar year. Past the latest
// handbook, the latest is assumed to carry on; before the first, the first is
// used. Inside the range, a course missing from that year's handbook has no
// version, and the planner says so.
export type Resolved = { version: Version | null; year: number; assumed: boolean };

export function handbookYearFor(year: number): number {
  return Math.min(Math.max(year, FIRST_YEAR), LATEST_YEAR);
}

export function resolve(course: CatalogCourse, year: number): Resolved {
  const handbookYear = handbookYearFor(year);
  return { version: course.versions.get(handbookYear) ?? null, year: handbookYear, assumed: handbookYear !== year };
}

export function latestVersion(course: CatalogCourse): Version | null {
  const years = [...course.versions.keys()].sort((a, b) => b - a);
  return years.length ? (course.versions.get(years[0]) ?? null) : null;
}

// The reverse edge P&C can't show: every course whose requisite, in that
// handbook year, names this one.
export function unlocks(code: string, year: number): CatalogCourse[] {
  const rows = db
    .selectDistinct({ code: courseRequisiteNodes.code })
    .from(courseRequisiteNodes)
    .where(and(eq(courseRequisiteNodes.kind, "course"), eq(courseRequisiteNodes.ref, code), eq(courseRequisiteNodes.year, year)))
    .orderBy(courseRequisiteNodes.code)
    .all();
  return rows.map((row) => catalog.get(row.code)).filter((c): c is CatalogCourse => c !== undefined);
}

export type LoadedRuleSet = RuleSet & {
  rules: (Rule & { courses: string[] })[];
  specialisations: LoadedRuleSet[];
};

export function ruleSetFor(program: string, year: number): { set: LoadedRuleSet | null; year: number; assumed: boolean } {
  const handbookYear = handbookYearFor(year);
  const all = db.select().from(ruleSets).where(eq(ruleSets.year, handbookYear)).all();
  const program_ = all.find((s) => s.kind === "program" && s.code === program);
  const withRules = (set: RuleSet): LoadedRuleSet => {
    const own = db.select().from(rules).where(eq(rules.ruleSetId, set.id)).orderBy(rules.position).all();
    return {
      ...set,
      rules: own.map((rule) => ({
        ...rule,
        courses: db
          .select({ code: ruleCourses.code })
          .from(ruleCourses)
          .where(eq(ruleCourses.ruleId, rule.id))
          .all()
          .map((r) => r.code),
      })),
      specialisations: all.filter((s) => s.parentId === set.id).map(withRules),
    };
  };
  return { set: program_ ? withRules(program_) : null, year: handbookYear, assumed: handbookYear !== year };
}
