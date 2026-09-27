import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// The catalog as a visitor meets it: requisites shown as structure rather than
// prose, the reverse edge P&C doesn't have, and no dead internal links (CI runs
// linkinator across the live site after every deploy, so a dead link there
// fails the deploy; this finds it first).
const baseUrl = inject("baseUrl");

const page = async (path: string) => {
  const res = await fetch(new URL(path, baseUrl));
  return { status: res.status, doc: new JSDOM(await res.text()).window.document };
};

describe("catalog", () => {
  it("lists every postgraduate course in the snapshot", async () => {
    const { doc } = await page("/");
    expect(doc.querySelectorAll(".course-card").length).toBeGreaterThanOrEqual(60);
  });

  it("filters by semester", async () => {
    const { doc } = await page("/?session=S1");
    const chips = [...doc.querySelectorAll(".course-card")].map((card) => card.querySelector(".chip-S1"));
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every(Boolean)).toBe(true);
  });

  it("shows a requisite as a tree of linked courses", async () => {
    const { doc } = await page("/course/COMP6120");
    const tree = doc.querySelector(".req-tree");
    expect(tree?.querySelector(".req-any")).toBeTruthy();
    expect(tree?.querySelector('a[href="/course/COMP6442"]')).toBeTruthy();
    expect(doc.querySelector("[data-source]")?.getAttribute("data-source")).toBe("parsed");
  });

  it("marks a hand-checked reading and gives the reason", async () => {
    const { doc } = await page("/course/COMP8600");
    expect(doc.querySelector("[data-source]")?.getAttribute("data-source")).toBe("hand-checked");
    expect(doc.querySelector(".reading")?.textContent).toMatch(/COMP8880/);
  });

  it("shows which courses a course unlocks", async () => {
    const { doc } = await page("/course/COMP6442");
    const unlocked = [...doc.querySelectorAll(".unlocks a")].map((a) => a.getAttribute("href"));
    expect(unlocked).toContain("/course/COMP6120");
  });

  it("answers 404 for a course that doesn't exist", async () => {
    expect((await page("/course/COMP0000")).status).toBe(404);
  });

  it("has no dead internal links", async () => {
    const seen = new Set<string>();
    const queue = ["/", "/plan/example", "/readme/"];
    const dead: string[] = [];
    while (queue.length > 0) {
      const path = queue.shift() as string;
      if (seen.has(path)) continue;
      seen.add(path);
      const { status, doc } = await page(path);
      if (status !== 200) {
        dead.push(`${path} (${status})`);
        continue;
      }
      for (const a of doc.querySelectorAll("a[href^='/']")) {
        const href = (a.getAttribute("href") ?? "").split("#")[0];
        if (href && !seen.has(href)) queue.push(href);
      }
    }
    expect(dead).toEqual([]);
    expect(seen.size).toBeGreaterThan(100);
  }, 60_000);
});
