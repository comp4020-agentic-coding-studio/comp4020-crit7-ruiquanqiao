import type { JudgedItem } from "./planner";

// The Master of Computing's requirements, hand-encoded from its P&C page
// (programsandcourses.anu.edu.au/2026/program/7706XMCOMP), which states them
// only as prose. What isn't checked here is listed as such, not left out.

export type Requirement = {
  label: string;
  have: number;
  need: number;
  met: boolean;
  detail?: string;
};

const COMPULSORY = ["COMP6120", "COMP6442", "COMP7710", "COMP8280"];
const FOUNDATIONAL = ["MATH6005", "COMP6260"];
const PROJECT = ["COMP8715", "COMP8830"];

export const MCOMP_SOURCE = "https://programsandcourses.anu.edu.au/2026/program/7706XMCOMP";

export const MCOMP_UNCHECKED = [
  "the 24-unit specialisation (Artificial Intelligence, Machine Learning, Software Development, ...)",
  "18 units of further 6000–8000-level COMP or ENGN courses and 6 units of ANU electives, beyond the unit total",
  "COMP8715 being taken twice in consecutive semesters",
];

export function mcompProgress(items: JudgedItem[]): Requirement[] {
  const units = (filter: (item: JudgedItem) => boolean) =>
    items.filter(filter).reduce((sum, item) => sum + item.course.units, 0);
  const has = new Set(items.map((i) => i.courseCode));
  const compulsoryMissing = COMPULSORY.filter((code) => !has.has(code));

  const total = units(() => true);
  const compulsory = units((i) => COMPULSORY.includes(i.courseCode));
  const foundational = units((i) => FOUNDATIONAL.includes(i.courseCode));
  const project = units((i) => PROJECT.includes(i.courseCode));
  const advanced = units((i) => i.course.subject === "COMP" && i.course.level === 8000);

  return [
    { label: "Total units", have: total, need: 96, met: total >= 96 },
    {
      label: "Compulsory courses",
      have: compulsory,
      need: 30,
      met: compulsoryMissing.length === 0,
      detail: compulsoryMissing.length ? `Missing ${compulsoryMissing.join(", ")}` : undefined,
    },
    {
      label: "Foundational (MATH6005 or COMP6260)",
      have: foundational,
      need: 6,
      met: foundational >= 6,
    },
    {
      label: "8000-level COMP",
      have: advanced,
      need: 24,
      met: advanced >= 24,
    },
    {
      label: "Project courses, at most",
      have: project,
      need: 12,
      met: project <= 12,
      detail: project > 12 ? "Only 12 units of COMP8715 and COMP8830 count" : undefined,
    },
  ];
}
