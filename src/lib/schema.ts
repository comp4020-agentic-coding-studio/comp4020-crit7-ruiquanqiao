import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, int, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

// --- the catalog: rebuilt from data/ on every boot -------------------------

export const courses = sqliteTable("courses", {
  code: text().primaryKey(),
  name: text().notNull(),
  units: int().notNull(),
  subject: text().notNull(),
  level: int().notNull(),
  career: text().notNull(),
  description: text().notNull().default(""),
  requisiteText: text("requisite_text").notNull().default(""),
  // parsed: read by the parser; hand-checked: a person's reading from
  // data/requisite-overrides.json; none: no requirement to meet
  requisiteSource: text("requisite_source", { enum: ["parsed", "hand-checked", "none"] }).notNull(),
  requisiteReading: text("requisite_reading"),
  // the prose also asks for something no rule here can check (a permission
  // code, a GPA, "or equivalent")
  caveat: int({ mode: "boolean" }).notNull().default(false),
  excludedPrograms: text("excluded_programs").notNull().default(""),
  // referenced by a requisite but not in the snapshot: undergraduate, another
  // subject, or retired from the handbook
  stub: int({ mode: "boolean" }).notNull().default(false),
});

export const offerings = sqliteTable(
  "offerings",
  {
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
    session: text({ enum: ["S1", "S2", "Summer", "Autumn", "Winter", "Spring"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.courseCode, t.session] })],
);

// A course's requisite is a tree stored as rows: all/any nodes hold children,
// leaves name a course, a program or a unit count. Keeping it relational is
// what makes "which courses does this one unlock?" a single query.
export const requisiteNodes = sqliteTable("requisite_nodes", {
  id: int().primaryKey({ autoIncrement: true }),
  courseCode: text("course_code")
    .notNull()
    .references(() => courses.code),
  parentId: int("parent_id").references((): AnySQLiteColumn => requisiteNodes.id),
  position: int().notNull(),
  kind: text({ enum: ["all", "any", "course", "program", "units"] }).notNull(),
  ref: text(),
  concurrent: int({ mode: "boolean" }).notNull().default(false),
  units: int(),
  level: int(),
});

export const incompatibilities = sqliteTable(
  "incompatibilities",
  {
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
    otherCode: text("other_code")
      .notNull()
      .references(() => courses.code),
  },
  (t) => [primaryKey({ columns: [t.courseCode, t.otherCode] })],
);

// --- student state: lives on the volume, never touched by a reseed ---------

export const plans = sqliteTable("plans", {
  id: text().primaryKey(),
  program: text().notNull().default("MCOMP"),
  startTerm: text("start_term").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const planItems = sqliteTable(
  "plan_items",
  {
    id: int().primaryKey({ autoIncrement: true }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
    term: text().notNull(),
  },
  (t) => [unique().on(t.planId, t.courseCode)],
);

export type Course = typeof courses.$inferSelect;
export type RequisiteNode = typeof requisiteNodes.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
