import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatReq, parseRequisite, readReq } from "../src/lib/requisites";

// The parser against P&C's real prose. The contract: clear sentences become
// trees, and a sentence with two readings is refused rather than guessed.
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as {
  courses: { code: string; requisiteText: string }[];
};
const overrides = JSON.parse(readFileSync("data/requisite-overrides.json", "utf8")) as Record<
  string,
  { tree: string; reading: string }
>;
const text = (code: string) => {
  const course = catalog.courses.find((c) => c.code === code);
  if (!course) throw new Error(`${code} is not in the snapshot`);
  return course.requisiteText;
};

describe("requisite parser", () => {
  it("reads a plain alternative, with same-semester study allowed", () => {
    const parsed = parseRequisite(text("COMP6120"));
    expect(parsed.status).toBe("parsed");
    expect(formatReq(parsed.tree as never)).toBe("any(COMP6442*, COMP2100*)");
    expect(parsed.incompatible).toEqual(["COMP2120"]);
  });

  it("reads bracketed groups joined by AND", () => {
    const parsed = parseRequisite(text("COMP6242"));
    expect(formatReq(parsed.tree as never)).toBe(
      "all(any(COMP3670, COMP6670, COMP8410), any(COMP1110, COMP6710, COMP7710, COMP1730, COMP6730))",
    );
  });

  it('treats ";" as the strongest separator', () => {
    expect(formatReq(parseRequisite(text("COMP8410")).tree as never)).toBe(
      "all(any(COMP7240, COMP6240, COMP2400), any(COMP6730, COMP7230, COMP6710))",
    );
  });

  it("expands the COMP6240/2400 shorthand into alternatives", () => {
    const tree = parseRequisite(text("COMP8300")).tree;
    expect(formatReq(tree as never)).toContain("COMP6310, COMP2310");
  });

  it("refuses AND and OR mixed without brackets", () => {
    const parsed = parseRequisite(text("COMP8600"));
    expect(parsed.status).toBe("ambiguous");
    expect(parsed.tree).toBeNull();
    expect(parsed.reason).toMatch(/mixed/);
  });

  it("refuses a requirement sentence it can't read, rather than dropping it", () => {
    expect(parseRequisite(text("STAT7039")).status).toBe("ambiguous");
  });

  it("separates exclusions from requirements", () => {
    const parsed = parseRequisite(text("COMP6710"));
    expect(parsed.status).toBe("none");
    expect(parsed.excludedPrograms).toEqual(["VCOMP"]);
    expect(parsed.incompatible).toEqual(expect.arrayContaining(["COMP7710", "COMP1110"]));
  });

  it("flags conditions it cannot check, such as permission codes", () => {
    expect(parseRequisite(text("COMP8020")).caveat).toBe(true);
    expect(parseRequisite(text("COMP6120")).caveat).toBe(false);
  });
});

// The sensor that makes "don't guess" hold after a re-scrape: every course the
// parser refuses must have a person's reading, and a reading must not linger
// once the parser can read the course itself.
describe("requisite overrides", () => {
  const statuses = new Map(catalog.courses.map((c) => [c.code, parseRequisite(c.requisiteText).status]));

  it("covers every ambiguous course", () => {
    const unresolved = [...statuses].filter(([code, s]) => s === "ambiguous" && !overrides[code]).map(([c]) => c);
    expect(unresolved).toEqual([]);
  });

  it("only overrides courses the parser refuses", () => {
    const stale = Object.keys(overrides).filter((code) => statuses.get(code) !== "ambiguous");
    expect(stale).toEqual([]);
  });

  it("are all well-formed and give a reason", () => {
    for (const [code, { tree, reading }] of Object.entries(overrides)) {
      expect(() => readReq(tree), code).not.toThrow();
      expect(formatReq(readReq(tree)), code).toBe(tree);
      expect(reading.length, code).toBeGreaterThan(20);
    }
  });
});
