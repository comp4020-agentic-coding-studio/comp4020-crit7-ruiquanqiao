import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, inject, it } from "vitest";

// The core flow, driven over HTTP against the built server: start a plan, put
// courses in semesters, and the page judges each placement. Assertions read
// the page's own data-* contract (which course, ok or warn, which kind of
// warning), not its wording.
const baseUrl = inject("baseUrl");

const post = (path: string, fields: Record<string, string>) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    // Astro refuses form POSTs without a same-origin Origin (CSRF protection)
    headers: { origin: baseUrl },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });

async function startPlan(start: string): Promise<string> {
  const res = await post("/api/plans", { start });
  expect(res.status).toBe(303);
  const location = res.headers.get("location") ?? "";
  expect(location).toMatch(/^\/plan\/[\w-]+$/);
  return location;
}

async function planPage(path: string) {
  const doc = new JSDOM(await (await fetch(new URL(path, baseUrl))).text()).window.document;
  const all = (code: string) => [...doc.querySelectorAll<HTMLElement>(`.plan-item[data-course="${code}"]`)];
  const item = (code: string) => all(code)[0] ?? null;
  return {
    doc,
    all,
    item,
    termOf: (code: string) => item(code)?.closest<HTMLElement>("[data-term]")?.dataset.term,
    warnings: (code: string) =>
      all(code).flatMap((el) => [...el.querySelectorAll<HTMLElement>("[data-warning]")].map((w) => w.dataset.warning)),
    progress: (kind: string) => doc.querySelector<HTMLElement>(`.progress-rows li[data-kind="${kind}"][data-depth="0"]`),
  };
}

const itemsPath = (plan: string) => plan.replace("/plan/", "/api/plans/") + "/items";

describe("planner", () => {
  let plan: string;
  const place = (course: string, term: string) => post(itemsPath(plan), { course, term });

  beforeAll(async () => {
    plan = await startPlan("2026-S1");
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
    const page = await planPage(plan);
    const moveOut = page.item("COMP6390")?.dataset.item ?? "";
    await post(itemsPath(plan), { item: moveOut, term: "2026-S2" });
    expect((await planPage(plan)).warnings("COMP8350")).toContain("requisites");

    const later = (await planPage(plan)).item("COMP8350")?.dataset.item ?? "";
    await post(itemsPath(plan), { item: later, term: "2027-S2" });
    expect((await planPage(plan)).warnings("COMP8350")).not.toContain("requisites");
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

  it("moves one placement by its id, and removes it", async () => {
    const id = (await planPage(plan)).item("COMP7710")?.dataset.item ?? "";
    await post(itemsPath(plan), { item: id, term: "2027-S1" });
    const moved = await planPage(plan);
    expect(moved.all("COMP7710")).toHaveLength(1);
    expect(moved.termOf("COMP7710")).toBe("2027-S1");
    await post(itemsPath(plan), { item: id, remove: "1" });
    expect((await planPage(plan)).item("COMP7710")).toBeNull();
  });

  it("flags a second placement of an ordinary course, which counts once", async () => {
    await place("COMP6261", "2026-S2");
    await place("COMP6261", "2027-S2");
    expect((await planPage(plan)).warnings("COMP6261")).toContain("repeat");
  });
});

describe("years", () => {
  it("judges a course by the handbook of the year it is taken", async () => {
    // COMP8830 names COMP8260 in 2026 and adds COMP8280 in 2027
    const plan = await startPlan("2026-S1");
    const place = (course: string, term: string) => post(itemsPath(plan), { course, term });
    for (const [course, term] of [
      ["COMP7710", "2026-S1"],
      ["MATH6005", "2026-S1"],
      ["COMP8280", "2026-S1"],
      ["COMP6442", "2026-S2"],
      ["COMP8830", "2026-S2"],
    ]) {
      await place(course, term);
    }
    expect((await planPage(plan)).warnings("COMP8830")).toContain("requisites");

    const id = (await planPage(plan)).item("COMP8830")?.dataset.item ?? "";
    await post(itemsPath(plan), { item: id, term: "2027-S1" });
    expect((await planPage(plan)).warnings("COMP8830")).not.toContain("requisites");
  });

  it("warns when a course is missing from that year's handbook", async () => {
    const plan = await startPlan("2025-S2");
    await post(itemsPath(plan), { course: "COMP8280", term: "2025-S2" }); // first appears in 2026
    expect((await planPage(plan)).warnings("COMP8280")).toContain("handbook");
  });

  it("judges the degree by the handbook of the year the student started", async () => {
    const early = await planPage(await startPlan("2025-S2"));
    const late = await planPage(await startPlan("2026-S1"));
    expect(early.progress("compulsory")?.textContent).toMatch(/COMP6250.*COMP8260/);
    expect(late.progress("compulsory")?.textContent).toMatch(/COMP6120.*COMP8280/);
  });

  it("uses the latest handbook, and says so, past the last one published", async () => {
    const plan = await startPlan("2026-S1");
    await post(itemsPath(plan), { course: "COMP6390", term: "2028-S2" });
    const page = await planPage(plan);
    expect(page.termOf("COMP6390")).toBe("2028-S2");
    expect(page.item("COMP6390")?.textContent).toMatch(/2027 handbook/);
  });

  it("expects COMP8715 twice, in consecutive semesters, and counts both", async () => {
    const plan = await startPlan("2026-S1");
    await post(itemsPath(plan), { course: "COMP8715", term: "2027-S1" });
    expect((await planPage(plan)).warnings("COMP8715")).toContain("repeat");
    await post(itemsPath(plan), { course: "COMP8715", term: "2027-S2" });
    const page = await planPage(plan);
    expect(page.all("COMP8715")).toHaveLength(2);
    expect(page.warnings("COMP8715")).not.toContain("repeat");
    expect(page.progress("max_from")?.querySelector(".progress-count")?.textContent).toBe("12/12");
  });

  it("offers the specialisations of the starting year, and judges the chosen one", async () => {
    const plan = await startPlan("2025-S2");
    const before = await planPage(plan);
    const options = [...before.doc.querySelectorAll("#specialisation option")].map((o) => o.getAttribute("value"));
    expect(options).toContain("MCHL-SPEC");
    expect(options).not.toContain("SOFT-SPEC"); // first offered in 2026
    await post(plan.replace("/plan/", "/api/plans/") + "/specialisation", { specialisation: "MCHL-SPEC" });
    expect((await planPage(plan)).progress("specialisation")?.textContent).toMatch(/Machine Learning/);
  });
});

describe("the example plan", () => {
  it("is read-only and clear of problems", async () => {
    const res = await post("/api/plans/example/items", { course: "COMP6240", term: "2026-S1" });
    expect(res.status).toBe(403);
    const page = await planPage("/plan/example");
    expect(page.doc.querySelectorAll('.plan-item[data-status="warn"]')).toHaveLength(0);
    expect(page.doc.querySelectorAll('.progress-rows li[data-met="no"]')).toHaveLength(0);
  });

  it("copies into a plan that can be edited", async () => {
    const res = await post("/api/plans", { copy: "example" });
    const copy = res.headers.get("location") ?? "";
    expect(copy).not.toBe("/plan/example");
    expect((await planPage(copy)).termOf("COMP8600")).toBe("2027-S1");
  });
});
