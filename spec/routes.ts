// The routes the invariants run against. When you add a page, add its route
// here, or the invariants stop covering it. One of each kind of page: a course
// with a parsed tree, one with a hand-checked reading, one whose wording
// changed over the years, a stub, and a plan.
export const ROUTES = [
  "/",
  "/readme/",
  "/course/COMP6120",
  "/course/COMP8600?year=2026",
  "/course/COMP8830",
  "/course/COMP1110",
  "/plan/example",
];
