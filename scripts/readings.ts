// What still needs a person after a scrape: every requisite wording the parser
// refuses and no reading covers, and every program or specialisation wording
// with no encoded rules. Run `pnpm readings`; pass --all to also print every
// parsed tree, which is how a parser change gets checked against its sources.
import { readdirSync, readFileSync } from "node:fs";
import { formatReq, parseRequisite } from "../src/lib/requisites.ts";

type Handbook = {
  year: number;
  program: { code: string; requirementText: string; specialisations: { code: string; name: string; requirementText: string; courses: string[]; missing?: boolean }[] };
  courses: { code: string; requisiteText: string }[];
};

const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
const readings = JSON.parse(readFileSync("data/requisite-readings.json", "utf8")) as Record<string, { text: string }[]>;
const ruleReadings = JSON.parse(readFileSync("data/rule-readings.json", "utf8")) as Record<string, { text: string }[]>;
const handbooks = readdirSync("data/handbook")
  .map((f) => JSON.parse(readFileSync(`data/handbook/${f}`, "utf8")) as Handbook)
  .sort((a, b) => a.year - b.year);
const all = process.argv.includes("--all");

const unread = new Map<string, { code: string; years: number[]; reason: string }>();
const counts: Record<string, number> = {};
for (const h of handbooks) {
  for (const c of h.courses) {
    const parsed = parseRequisite(c.requisiteText);
    const read = readings[c.code]?.some((r) => same(r.text, c.requisiteText));
    const status = parsed.status === "ambiguous" ? (read ? "hand-checked" : "UNREAD") : parsed.status;
    counts[`${h.year} ${status}`] = (counts[`${h.year} ${status}`] ?? 0) + 1;
    if (status === "UNREAD") {
      const key = `${c.code}|${c.requisiteText}`;
      const entry = unread.get(key) ?? { code: c.code, years: [], reason: parsed.reason ?? "" };
      entry.years.push(h.year);
      unread.set(key, entry);
    }
    if (all && parsed.tree) console.log(`${h.year} ${c.code} ${formatReq(parsed.tree)}\n    ${c.requisiteText}`);
  }
}
console.log(counts);
for (const [key, { code, years, reason }] of unread) {
  console.log(`\nUNREAD ${code} (${years.join(", ")}): ${reason}\n  ${key.split("|")[1]}`);
}

for (const h of handbooks) {
  for (const set of [h.program, ...h.program.specialisations]) {
    if ("missing" in set && set.missing) continue;
    if (!ruleReadings[set.code]?.some((r) => same(r.text, set.requirementText))) {
      console.log(`\nUNENCODED ${set.code} ${h.year}:\n  ${set.requirementText}${"courses" in set ? `\n  courses: ${set.courses.join(" ")}` : ""}`);
    }
  }
}
