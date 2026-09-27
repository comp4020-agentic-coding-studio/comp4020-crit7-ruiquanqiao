import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, inject, it } from "vitest";

// The core flow, driven over HTTP against the built server: start a plan, put
// courses in semesters, and the page judges each placement against the
// handbook's rules. Assertions read the page's own data-* contract (which
// course, ok or warn, which kind of warning), not its wording.
const baseUrl = inject("baseUrl");

const post = (path: string, fields: Record<string, string>) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    // Astro refuses form POSTs without a same-origin Origin (CSRF protection)
    headers: { origin: baseUrl },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });

async function planPage(path: string) {
  const doc = new JSDOM(await (await fetch(new URL(path, baseUrl))).text()).window.document;
  const item = (code: string) => doc.querySelector<HTMLElement>(`.plan-item[data-course="${code}"]`);
  return {
    item,
    termOf: (code: string) => item(code)?.closest<HTMLElement>("[data-term]")?.dataset.term,
    warnings: (code: string) => [...(item(code)?.querySelectorAll<HTMLElement>("[data-warning]") ?? [])].map((w) => w.dataset.warning),
  };
}

describe("planner", () => {
  let plan: string;
  const place = (course: string, term: string) => post(`${plan}/items`.replace("/plan/", "/api/plans/"), { course, term });

  beforeAll(async () => {
    const res = await post("/api/plans", { start: "2026-S1" });
    expect(res.status).toBe(303);
    plan = res.headers.get("location") ?? "";
    expect(plan).toMatch(/^\/plan\/[\w-]+$/);
  });

  it("keeps a placed course across a fresh page load", async () => {
    expect((await place("COMP7710", "2026-S1")).status).toBe(303);
    const page = await planPage(plan);
    expect(page.termOf("COMP7710")).toBe("2026-S1");
    expect(page.item("COMP7710")?.dataset.status).toBe("ok");
  });

  it("warns when a course is placed in a semester it doesn't run", async () => {
    await place("COMP6390", "2026-S1"); // Semester 2 only
    expect((await planPage(plan)).warnings("COMP6390")).toContain("offering");
  });

  it("warns when a prerequisite comes later, and clears once it comes first", async () => {
    await place("COMP8350", "2026-S2"); // needs COMP6390 or COMP6720, completed
    await place("COMP6390", "2026-S2");
    expect((await planPage(plan)).warnings("COMP8350")).toContain("requisites");

    await place("COMP8350", "2027-S2");
    const page = await planPage(plan);
    expect(page.warnings("COMP8350")).not.toContain("requisites");
  });

  it("accepts a same-semester prerequisite where the handbook allows it", async () => {
    // COMP6120 needs COMP6442 "completed or currently studying"; COMP6442 needs
    // COMP7710 plus MATH6005 or COMP6260
    await place("MATH6005", "2026-S1");
    await place("COMP6442", "2026-S2");
    await place("COMP6120", "2026-S2");
    expect((await planPage(plan)).item("COMP6120")?.dataset.status).toBe("ok");
  });

  it("warns about incompatible courses in the same plan", async () => {
    await place("COMP8260", "2027-S1");
    await place("COMP8280", "2027-S1");
    expect((await planPage(plan)).warnings("COMP8280")).toContain("incompatible");
  });

  it("moves a course rather than duplicating it, and removes it", async () => {
    await place("COMP7710", "2026-S2");
    expect((await planPage(plan)).termOf("COMP7710")).toBe("2026-S2");
    await post(plan.replace("/plan/", "/api/plans/") + "/items", { course: "COMP7710", remove: "1" });
    expect((await planPage(plan)).item("COMP7710")).toBeNull();
  });

  it("keeps the example plan read-only, and clear of problems", async () => {
    const res = await post("/api/plans/example/items", { course: "COMP6240", term: "2026-S1" });
    expect(res.status).toBe(403);
    const doc = new JSDOM(await (await fetch(new URL("/plan/example", baseUrl))).text()).window.document;
    expect(doc.querySelectorAll('.plan-item[data-status="warn"]')).toHaveLength(0);
    expect(doc.querySelectorAll(".plan-item").length).toBeGreaterThan(10);
  });

  it("copies the example into a plan that can be edited", async () => {
    const res = await post("/api/plans", { copy: "example" });
    const copy = res.headers.get("location") ?? "";
    expect(copy).not.toBe("/plan/example");
    expect((await planPage(copy)).termOf("COMP8600")).toBe("2027-S1");
  });
});
