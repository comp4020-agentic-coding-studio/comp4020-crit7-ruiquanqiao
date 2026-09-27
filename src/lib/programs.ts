import { type LoadedRuleSet, ruleSetFor } from "./catalog";
import { type JudgedItem, termYear } from "./planner";
import type { Plan } from "./schema";

// A degree's requirements are judged by the handbook of the year the student
// started, whatever year each course is taken in. The rules are rows (see
// rule_sets and rules in schema.ts), hand-encoded from each year's wording in
// data/rule-readings.json; this walks them in order and allocates placements
// so that none counts twice.

export type Row = {
  label: string;
  have: number;
  need: number;
  met: boolean;
  kind: string;
  detail?: string;
  children?: Row[];
};

export type Progress = {
  year: number;
  assumed: boolean;
  set: LoadedRuleSet | null;
  specialisation: LoadedRuleSet | null;
  rows: Row[];
  sourceUrl: string;
};

type Item = Pick<JudgedItem, "id" | "courseCode" | "units" | "course">;
type RuleRow = LoadedRuleSet["rules"][number];

const sum = (items: Item[]) => items.reduce((n, i) => n + i.units, 0);

// Take placements in order until `units` is reached; the rest stay free.
function take(candidates: Item[], units: number): Item[] {
  const taken: Item[] = [];
  for (const item of candidates) {
    if (sum(taken) >= units) break;
    taken.push(item);
  }
  return taken;
}

function evaluate(set: LoadedRuleSet, items: Item[], used: Set<number>, spec: LoadedRuleSet | null): Row[] {
  const free = () => items.filter((i) => !used.has(i.id));
  const inList = (list: string[]) => (i: Item) => list.includes(i.courseCode);
  const listed = new Set(spec?.rules.filter((r) => r.kind !== "further").flatMap((r) => r.courses) ?? []);
  const inSubjects = (subjects: string[]) => (i: Item) =>
    subjects.includes(i.course.subject) || (subjects.includes("SPEC") && listed.has(i.courseCode));
  // for "further", the rule's course list is what may NOT count
  const fitsFurther = (rule: RuleRow) => (i: Item) =>
    inSubjects(rule.subjects?.split(",") ?? [])(i) && i.course.level >= (rule.level ?? 0) && !rule.courses.includes(i.courseCode);
  // what can count towards the chosen specialisation: its lists, plus
  // anything its own "further" rules accept ("any 8000-level COMP course")
  const inSpec = (i: Item) => listed.has(i.courseCode) || (spec?.rules.some((r) => r.kind === "further" && fitsFurther(r)(i)) ?? false);
  const claim = (taken: Item[]) => {
    for (const i of taken) used.add(i.id);
  };
  const rows: Row[] = [];

  for (const rule of set.rules) {
    const base = { kind: rule.kind, label: rule.label, need: rule.units };
    switch (rule.kind) {
      case "compulsory": {
        const planned = free().filter(inList(rule.courses));
        const absent = rule.courses.filter((code) => !items.some((i) => i.courseCode === code));
        claim(planned);
        rows.push({ ...base, have: sum(planned), met: absent.length === 0, detail: absent.length ? `Missing ${absent.join(", ")}` : undefined });
        break;
      }
      case "min_from": {
        const taken = take(free().filter(inList(rule.courses)), rule.units);
        claim(taken);
        rows.push({ ...base, have: sum(taken), met: sum(taken) >= rule.units });
        break;
      }
      case "max_from": {
        const planned = free().filter(inList(rule.courses));
        claim(planned);
        const have = sum(planned);
        rows.push({
          ...base,
          have,
          met: have <= rule.units,
          detail: have > rule.units ? `${have - rule.units} units over the limit won't count` : undefined,
        });
        break;
      }
      case "min_level": {
        const subjects = rule.subjects?.split(",") ?? [];
        const pool = rule.courses.length ? items.filter(inList(rule.courses)) : items.filter(inSubjects(subjects));
        const have = sum(pool.filter((i) => i.course.level >= (rule.level ?? 0)));
        rows.push({ ...base, have, met: have >= rule.units });
        break;
      }
      case "specialisation": {
        if (!spec) {
          rows.push({ ...base, have: 0, met: false, detail: "Choose one above" });
          break;
        }
        // The specialisation sees only what the degree's earlier rules left,
        // 8000-level first so its own level minimum is met where it can be.
        const available = free()
          .filter(inSpec)
          .sort((a, b) => b.course.level - a.course.level);
        const specUsed = new Set(used);
        const children = evaluate(spec, available, specUsed, null);
        const claimed = available.filter((i) => specUsed.has(i.id));
        const counted = take([...claimed, ...available.filter((i) => !specUsed.has(i.id))], rule.units);
        claim(counted);
        const have = sum(counted);
        rows.push({
          ...base,
          label: `${rule.label}: ${spec.name}`,
          have,
          met: spec.encoded && have >= rule.units && children.every((c) => c.met),
          detail: spec.encoded ? undefined : "The handbook publishes no rules for it this year",
          children,
        });
        break;
      }
      case "further": {
        const taken = take(free().filter(fitsFurther(rule)), rule.units);
        claim(taken);
        rows.push({ ...base, have: sum(taken), met: sum(taken) >= rule.units });
        break;
      }
      case "electives": {
        const taken = take(free(), rule.units);
        claim(taken);
        rows.push({ ...base, have: sum(taken), met: sum(taken) >= rule.units });
        break;
      }
      case "total": {
        const have = sum(rule.courses.length ? items.filter(inList(rule.courses)) : items);
        rows.push({ ...base, have, met: have >= rule.units });
        break;
      }
    }
  }
  return rows;
}

export function progress(plan: Plan, judged: JudgedItem[]): Progress {
  // A repeated course counts once, unless the handbook says it is taken twice.
  const seen = new Set<string>();
  const items = judged.filter((i) => {
    if (i.resolved.version?.takenTwice) return true;
    if (seen.has(i.courseCode)) return false;
    seen.add(i.courseCode);
    return true;
  });
  const { set, year, assumed } = ruleSetFor(plan.program, termYear(plan.startTerm));
  const spec = set?.specialisations.find((s) => s.code === plan.specialisation) ?? null;
  return {
    year,
    assumed,
    set,
    specialisation: spec,
    rows: set ? evaluate(set, items, new Set(), spec) : [],
    sourceUrl: `https://programsandcourses.anu.edu.au/${year}/program/7706XMCOMP`,
  };
}
