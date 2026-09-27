import type { APIRoute } from "astro";
import { copyPlan, createPlan, getPlan, isTerm } from "../../lib/planner";

// Start a plan, empty or copied from another, and remember it in a cookie so
// "My plan" finds it again. The plan's address is the real key: it can be
// bookmarked or shared, and works on any device.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const copyFrom = getPlan(String(form.get("copy") ?? ""));
  const start = String(form.get("start") ?? "");
  if (!copyFrom && !isTerm(start)) return new Response("Pick a starting semester.", { status: 400 });

  const plan = copyFrom ? copyPlan(copyFrom) : createPlan(start);
  cookies.set("plan", plan.id, { path: "/", maxAge: 60 * 60 * 24 * 365 * 3, sameSite: "lax", httpOnly: true });
  return redirect(`/plan/${plan.id}`, 303);
};
