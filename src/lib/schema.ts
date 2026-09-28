import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, int, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
//
// Two kinds of year run through it. A course is judged by the handbook of the
// year it is taken; a degree by the handbook of the year the student started.
// So the handbook is kept per year, and nothing here assumes one.

// --- the handbook: rebuilt from data/ on every boot --------------------------

// A course's identity. Everything that can change from year to year lives in
// course_versions.
export const courses = sqliteTable("courses", {
  code: text().primaryKey(),
  name: text().notNull(),
  subject: text().notNull(),
  level: int().notNull(),
  // referenced by a rule but in no handbook year this site holds:
  // undergraduate, another subject, or retired
  stub: int({ mode: "boolean" }).notNull().default(false),
});

export const courseVersions = sqliteTable(
  "course_versions",
  {
    code: text()
      .notNull()
      .references(() => courses.code),
    year: int().notNull(),
    name: text().notNull(),
    units: int().notNull(),
    career: text().notNull(),
    description: text().notNull().default(""),
    requisiteText: text("requisite_text").notNull().default(""),
    // parsed: read by the parser; hand-checked: a person's reading of this
    // exact wording (data/requisite-readings.json); none: nothing to meet
    requisiteSource: text("requisite_source", { enum: ["parsed", "hand-checked", "none"] }).notNull(),
    requisiteReading: text("requisite_reading"),
    // the wording also asks for something no rule here can check
    caveat: int({ mode: "boolean" }).notNull().default(false),
    excludedPrograms: text("excluded_programs").notNull().default(""),
    // "an annual course (6+6) that must be completed twice, in consecutive
    // semesters" (COMP8715): read from the description at seed
    takenTwice: int("taken_twice", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.code, t.year] })],
);

export const courseOfferings = sqliteTable(
  "course_offerings",
  {
    code: text().notNull(),
    year: int().notNull(),
    session: text({ enum: ["S1", "S2", "Summer", "Autumn", "Winter", "Spring"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.code, t.year, t.session] })],
);

// A version's requisite is a tree stored as rows: all/any nodes hold
// children, leaves name a course, a program or a unit count. Keeping it
// relational is what makes "which courses does this one unlock?" a query.
export const courseRequisiteNodes = sqliteTable("course_requisite_nodes", {
  id: int().primaryKey({ autoIncrement: true }),
  code: text().notNull(),
  year: int().notNull(),
  parentId: int("parent_id").references((): AnySQLiteColumn => courseRequisiteNodes.id),
  position: int().notNull(),
  kind: text({ enum: ["all", "any", "course", "program", "units"] }).notNull(),
  ref: text(),
  concurrent: int({ mode: "boolean" }).notNull().default(false),
  units: int(),
  level: int(),
});

export const courseIncompatibilities = sqliteTable(
  "course_incompatibilities",
  {
    code: text().notNull(),
    year: int().notNull(),
    otherCode: text("other_code")
      .notNull()
      .references(() => courses.code),
  },
  (t) => [primaryKey({ columns: [t.code, t.year, t.otherCode] })],
);

// A degree's or a specialisation's requirements for one handbook year, as
// rules over lists of courses. A specialisation's rule set hangs off its
// program's.
export const ruleSets = sqliteTable(
  "rule_sets",
  {
    id: int().primaryKey({ autoIncrement: true }),
    kind: text({ enum: ["program", "specialisation"] }).notNull(),
    code: text().notNull(),
    year: int().notNull(),
    name: text().notNull(),
    parentId: int("parent_id").references((): AnySQLiteColumn => ruleSets.id),
    requirementText: text("requirement_text").notNull(),
    // false when the wording has no hand-encoded reading yet
    encoded: int({ mode: "boolean" }).notNull(),
    // why the rules read the wording the way they do, where it isn't plain
    reading: text(),
    // named by the program's own requirements (a specialisation page can be
    // linked from the program without being one of its options)
    offered: int({ mode: "boolean" }).notNull().default(true),
  },
  (t) => [unique().on(t.kind, t.code, t.year)],
);

export const rules = sqliteTable("rules", {
  id: int().primaryKey({ autoIncrement: true }),
  ruleSetId: int("rule_set_id")
    .notNull()
    .references(() => ruleSets.id),
  position: int().notNull(),
  // compulsory: every listed course. min_from / max_from: at least / at most
  // `units` from the list. min_level: `units` at `level` or above (from the
  // list if it has one, else from `subjects`). specialisation: one chosen
  // specialisation's rules. further: `units` more from `subjects`, beyond what
  // earlier rules used, never the courses listed against it. electives:
  // `units` of anything left. total: the whole degree or specialisation.
  kind: text({
    enum: ["compulsory", "min_from", "max_from", "min_level", "specialisation", "further", "electives", "total"],
  }).notNull(),
  label: text().notNull(),
  units: int().notNull(),
  level: int(),
  subjects: text(),
});

export const ruleCourses = sqliteTable(
  "rule_courses",
  {
    ruleId: int("rule_id")
      .notNull()
      .references(() => rules.id),
    code: text()
      .notNull()
      .references(() => courses.code),
  },
  (t) => [primaryKey({ columns: [t.ruleId, t.code] })],
);

// --- student state: lives on the volume, never touched by a reseed ---------

export const plans = sqliteTable("plans", {
  id: text().primaryKey(),
  program: text().notNull().default("MCOMP"),
  startTerm: text("start_term").notNull(),
  specialisation: text(),
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
  // once per semester: a course can appear twice in a plan, as COMP8715 must
  // and as a retake would
  (t) => [unique().on(t.planId, t.courseCode, t.term)],
);

export type Course = typeof courses.$inferSelect;
export type CourseVersion = typeof courseVersions.$inferSelect;
export type RequisiteNode = typeof courseRequisiteNodes.$inferSelect;
export type RuleSet = typeof ruleSets.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
