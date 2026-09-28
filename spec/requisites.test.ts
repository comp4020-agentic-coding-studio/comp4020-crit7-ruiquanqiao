import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatReq, parseRequisite, readReq } from "../src/lib/requisites";

// The parser against P&C's real prose, across every handbook year held. The
// contract: clear sentences become trees, and a sentence with two readings is
// refused rather than guessed.
type Handbook = {
  year: number;
  program: {
    code: string;
    requirementText: string;
    specialisations: { code: string; requirementText: string; missing?: boolean }[];
  };
  courses: { code: string; career: string; requisiteText: string }[];
};
const handbooks = readdirSync("data/handbook").map(
  (file) => JSON.parse(readFileSync(`data/handbook/${file}`, "utf8")) as Handbook,
);
const readings = JSON.parse(readFileSync("data/requisite-readings.json", "utf8")) as Record<
  string,
  { text: string; tree: string; reading: string }[]
>;
const ruleReadings = JSON.parse(readFileSync("data/rule-readings.json", "utf8")) as Record<
  string,
  { text: string; rules: { kind: string; units: number; courses?: string[]; exclude?: string[] }[] }[]
>;
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

const text = (code: string, year: number) => {
  const course = handbooks.find((h) => h.year === year)?.courses.find((c) => c.code === code);
  if (!course) throw new Error(`${code} is not in the ${year} snapshot`);
  return course.requisiteText;
};
const tree = (code: string, year: number) => {
  const parsed = parseRequisite(text(code, year));
  return parsed.tree ? formatReq(parsed.tree) : null;
};

describe("requisite parser", () => {
  it("holds a snapshot for every handbook year a plan can touch", () => {
    expect(handbooks.map((h) => h.year).sort()).toEqual([2024, 2025, 2026, 2027]);
  });

  it("reads a plain alternative, with same-semester study allowed", () => {
    const parsed = parseRequisite(text("COMP6120", 2026));
    expect(parsed.status).toBe("parsed");
    expect(tree("COMP6120", 2026)).toBe("any(COMP6442*, COMP2100*)");
    expect(parsed.incompatible).toEqual(["COMP2120"]);
  });

  it("reads bracketed groups joined by AND", () => {
    expect(tree("COMP6242", 2026)).toBe(
      "all(any(COMP3670, COMP6670, COMP8410), any(COMP1110, COMP6710, COMP7710, COMP1730, COMP6730))",
    );
  });

  it('treats ";" as the strongest separator', () => {
    expect(tree("COMP8410", 2026)).toBe("all(any(COMP7240, COMP6240, COMP2400), any(COMP6730, COMP7230, COMP6710))");
  });

  it("expands the COMP6240/2400 shorthand, and a slash between whole codes", () => {
    expect(tree("COMP8300", 2025)).toContain("COMP6310, COMP2310");
    expect(tree("COMP8670", 2024)).toBe("any(COMP2620, COMP6262, MATH3343, MATH6203)");
  });

  it("refuses AND and OR mixed without brackets", () => {
    const parsed = parseRequisite(text("COMP8600", 2026));
    expect(parsed.status).toBe("ambiguous");
    expect(parsed.tree).toBeNull();
    expect(parsed.reason).toMatch(/mixed/);
  });

  it("refuses a requirement sentence it can't read, rather than dropping it", () => {
    expect(parseRequisite(text("STAT7039", 2026)).status).toBe("ambiguous");
  });

  it("refuses an operator with nothing before it, and reads the program once it knows it", () => {
    // INFS8004 once parsed as "INFS7004" alone, its program silently dropped
    expect(tree("INFS8004", 2027)).toBe("any(@MMGNT, INFS7004)");
    expect(parseRequisite("To enrol you must be enrolled in the Master of Nothing or have completed COMP6710.").status).toBe(
      "ambiguous",
    );
  });

  it("does not read a procedure as a condition", () => {
    // COMP6340 once parsed as "enrolled in the Master of Cyber Security" from
    // "Students enrolled in ... must contact Student Services"
    expect(tree("COMP6340", 2024)).toBeNull();
    expect(parseRequisite(text("COMP6340", 2024)).caveat).toBe(true);
  });

  it("separates exclusions from requirements", () => {
    const parsed = parseRequisite(text("COMP6710", 2026));
    expect(parsed.status).toBe("none");
    expect(parsed.excludedPrograms).toEqual(["VCOMP"]);
    expect(parsed.incompatible).toEqual(expect.arrayContaining(["COMP7710", "COMP1110"]));
  });

  it("flags conditions it cannot check, such as permission codes", () => {
    expect(parseRequisite(text("COMP8020", 2026)).caveat).toBe(true);
    expect(parseRequisite(text("COMP6120", 2026)).caveat).toBe(false);
  });
});

// The sensors that keep "don't guess" true after a re-scrape. A reading
// belongs to the exact wording it reads: a changed sentence in a new year has
// no reading until a person gives it one, and a reading nobody's wording uses
// any more has to go.
describe("requisite readings", () => {
  const wordings = handbooks.flatMap((h) =>
    h.courses.map((c) => ({ code: c.code, year: h.year, text: c.requisiteText, status: parseRequisite(c.requisiteText).status })),
  );

  // The whole handbook is held, thousands of courses in every subject; a
  // person reads the ambiguous wordings a Master of Computing plan leans on:
  // every postgraduate COMP course and every course a program or
  // specialisation rule names. The rest show as "unread", claiming nothing.
  const relied = new Set<string>([
    ...handbooks.flatMap((h) => h.courses.filter((c) => c.code.startsWith("COMP") && c.career === "Postgraduate").map((c) => c.code)),
    ...Object.values(ruleReadings).flatMap((list) => list.flatMap((r) => r.rules.flatMap((rule) => rule.courses ?? []))),
  ]);

  it("cover every ambiguous wording a Master of Computing plan relies on, in every year", () => {
    const unread = wordings
      .filter((w) => relied.has(w.code) && w.status === "ambiguous" && !readings[w.code]?.some((r) => same(r.text, w.text)))
      .map((w) => `${w.code} ${w.year}`);
    expect(unread).toEqual([]);
  });

  it("hold the whole handbook, not only computing", () => {
    for (const h of handbooks) expect(h.courses.length, String(h.year)).toBeGreaterThan(2500);
  });

  it("each read a wording that exists and that the parser refuses", () => {
    const stale = Object.entries(readings).flatMap(([code, list]) =>
      list
        .filter((r) => !wordings.some((w) => w.code === code && same(w.text, r.text) && w.status === "ambiguous"))
        .map((r) => `${code}: ${r.text.slice(0, 50)}`),
    );
    expect(stale).toEqual([]);
  });

  it("are well-formed and give a reason", () => {
    for (const [code, list] of Object.entries(readings)) {
      for (const { tree: source, reading } of list) {
        expect(() => readReq(source), code).not.toThrow();
        expect(formatReq(readReq(source)), code).toBe(source);
        expect(reading.length, code).toBeGreaterThan(20);
      }
    }
  });
});

describe("program and specialisation rules", () => {
  const sets = handbooks.flatMap((h) =>
    [h.program, ...h.program.specialisations].map((s) => ({ ...s, year: h.year, missing: "missing" in s && s.missing })),
  );

  it("encode every published wording in every year", () => {
    const unencoded = sets
      .filter((s) => !s.missing && !ruleReadings[s.code]?.some((r) => same(r.text, s.requirementText)))
      .map((s) => `${s.code} ${s.year}`);
    expect(unencoded).toEqual([]);
  });

  it("each encode a wording that exists", () => {
    const stale = Object.entries(ruleReadings).flatMap(([code, list]) =>
      list.filter((r) => !sets.some((s) => s.code === code && same(s.requirementText, r.text))).map(() => code),
    );
    expect(stale).toEqual([]);
  });

  it("keep the 2027 Machine Learning specialisation as named but unpublished", () => {
    const ml = sets.find((s) => s.code === "MCHL-SPEC" && s.year === 2027);
    expect(ml?.missing).toBe(true);
  });

  it("name only real course codes", () => {
    for (const [code, list] of Object.entries(ruleReadings)) {
      for (const { rules } of list) {
        for (const rule of rules) {
          for (const c of [...(rule.courses ?? []), ...(rule.exclude ?? [])]) expect(c, code).toMatch(/^[A-Z]{4}\d{4}$/);
        }
      }
    }
  });
});
