import { eq, sql } from "drizzle-orm";
import catalogData from "../../data/catalog.json";
import overridesData from "../../data/requisite-overrides.json";
import { db } from "./db";
import { codesInReq, type ParsedRequisite, parseRequisite, type Req, readReq } from "./requisites";
import { type Course, courses, incompatibilities, offerings, type RequisiteNode, requisiteNodes } from "./schema";

type Session = (typeof offerings.$inferInsert)["session"];

export type CatalogCourse = Course & {
  sessions: Session[];
  tree: Req | null;
  incompatible: string[];
};

export const SCRAPED_AT: string = catalogData.scrapedAt;
export const HANDBOOK_YEAR: number = catalogData.year;
const overrides: Record<string, { tree: string; reading: string }> = overridesData;

// Rebuild the catalog tables from data/ on every boot, in one transaction.
// Courses are upserted rather than replaced so plan_items rows pointing at them
// survive; the derived tables (offerings, requisite trees, incompatibilities)
// are cleared and rewritten. Student plans are never touched.
function seed(): void {
  const parsed = new Map<string, ParsedRequisite & { tree: Req | null; source: Course["requisiteSource"] }>();
  for (const course of catalogData.courses) {
    const result = parseRequisite(course.requisiteText);
    const override = overrides[course.code];
    if (override) {
      parsed.set(course.code, { ...result, tree: readReq(override.tree), source: "hand-checked" });
    } else if (result.status === "ambiguous") {
      // spec/requisites.test.ts keeps this from shipping; if it ever does, the
      // course shows its prose and no verdict rather than a guessed one
      parsed.set(course.code, { ...result, tree: null, source: "none" });
    } else {
      parsed.set(course.code, { ...result, source: result.tree ? "parsed" : "none" });
    }
  }

  const known = new Set(catalogData.courses.map((c) => c.code));
  const referenced = new Set<string>();
  for (const result of parsed.values()) {
    for (const code of [...(result.tree ? codesInReq(result.tree) : []), ...result.incompatible]) referenced.add(code);
  }
  const stubs = [...referenced].filter((code) => !known.has(code)).sort();

  db.transaction((tx) => {
    tx.delete(requisiteNodes).run();
    tx.delete(offerings).run();
    tx.delete(incompatibilities).run();

    const rows: (typeof courses.$inferInsert)[] = [
      ...catalogData.courses.map((course) => {
        const result = parsed.get(course.code);
        return {
          code: course.code,
          name: course.name,
          units: course.units,
          subject: course.code.slice(0, 4),
          level: Number(course.code[4]) * 1000,
          career: course.career,
          description: course.description,
          requisiteText: course.requisiteText,
          requisiteSource: result?.source ?? "none",
          requisiteReading: overrides[course.code]?.reading ?? null,
          caveat: result?.caveat ?? false,
          excludedPrograms: result?.excludedPrograms.join(",") ?? "",
          stub: false,
        };
      }),
      ...stubs.map((code) => ({
        code,
        name: code,
        units: 6,
        subject: code.slice(0, 4),
        level: Number(code[4]) * 1000,
        career: Number(code[4]) < 5 ? "Undergraduate" : "Postgraduate",
        requisiteSource: "none" as const,
        stub: true,
      })),
    ];
    for (const row of rows) {
      tx.insert(courses)
        .values(row)
        .onConflictDoUpdate({ target: courses.code, set: { ...row, code: undefined } })
        .run();
    }

    for (const course of catalogData.courses) {
      for (const session of course.sessions as Session[]) {
        tx.insert(offerings).values({ courseCode: course.code, session }).run();
      }
      const result = parsed.get(course.code);
      if (!result) continue;
      for (const other of result.incompatible) {
        tx.insert(incompatibilities).values({ courseCode: course.code, otherCode: other }).onConflictDoNothing().run();
        tx.insert(incompatibilities).values({ courseCode: other, otherCode: course.code }).onConflictDoNothing().run();
      }
      const insertNode = (req: Req, parentId: number | null, position: number): void => {
        const { id } = tx
          .insert(requisiteNodes)
          .values({
            courseCode: course.code,
            parentId,
            position,
            kind: req.kind,
            ref: req.kind === "course" ? req.code : req.kind === "program" ? req.program : req.kind === "units" ? req.subject : null,
            concurrent: req.kind === "course" && req.concurrent,
            units: req.kind === "units" ? req.units : null,
            level: req.kind === "units" ? req.level : null,
          })
          .returning({ id: requisiteNodes.id })
          .get();
        if (req.kind === "all" || req.kind === "any") req.of.forEach((child, i) => insertNode(child, id, i));
      };
      if (result.tree) insertNode(result.tree, null, 0);
    }
  });
}

// Trees are read back out of requisite_nodes, not reused from the parse, so
// what the planner judges by is what the database holds.
function buildTree(rows: RequisiteNode[]): Req | null {
  const children = new Map<number | null, RequisiteNode[]>();
  for (const row of rows) {
    const list = children.get(row.parentId) ?? [];
    list.push(row);
    children.set(row.parentId, list);
  }
  const build = (row: RequisiteNode): Req => {
    switch (row.kind) {
      case "all":
      case "any":
        return {
          kind: row.kind,
          of: (children.get(row.id) ?? []).sort((a, b) => a.position - b.position).map(build),
        };
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
  const nodesByCourse = new Map<string, RequisiteNode[]>();
  for (const row of db.select().from(requisiteNodes).all()) {
    const list = nodesByCourse.get(row.courseCode) ?? [];
    list.push(row);
    nodesByCourse.set(row.courseCode, list);
  }
  const sessionsByCourse = new Map<string, Session[]>();
  for (const row of db.select().from(offerings).all()) {
    sessionsByCourse.set(row.courseCode, [...(sessionsByCourse.get(row.courseCode) ?? []), row.session]);
  }
  const incompatibleByCourse = new Map<string, string[]>();
  for (const row of db.select().from(incompatibilities).all()) {
    incompatibleByCourse.set(row.courseCode, [...(incompatibleByCourse.get(row.courseCode) ?? []), row.otherCode]);
  }
  const map = new Map<string, CatalogCourse>();
  for (const course of db.select().from(courses).orderBy(courses.code).all()) {
    map.set(course.code, {
      ...course,
      sessions: sessionsByCourse.get(course.code) ?? [],
      tree: buildTree(nodesByCourse.get(course.code) ?? []),
      incompatible: incompatibleByCourse.get(course.code) ?? [],
    });
  }
  return map;
}

seed();
// The catalog only changes at boot, so it is read once and kept.
const catalog = load();

export function allCourses(): CatalogCourse[] {
  return [...catalog.values()];
}

export function listedCourses(): CatalogCourse[] {
  return allCourses().filter((c) => !c.stub);
}

export function getCourse(code: string): CatalogCourse | undefined {
  return catalog.get(code);
}

// The reverse edge P&C can't show: every course whose requisite tree names
// this one.
export function unlocks(code: string): CatalogCourse[] {
  const rows = db
    .selectDistinct({ code: requisiteNodes.courseCode })
    .from(requisiteNodes)
    .where(sql`${requisiteNodes.kind} = 'course' and ${eq(requisiteNodes.ref, code)}`)
    .orderBy(requisiteNodes.courseCode)
    .all();
  return rows.map((row) => catalog.get(row.code)).filter((c): c is CatalogCourse => c !== undefined);
}
