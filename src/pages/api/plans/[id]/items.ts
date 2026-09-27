import type { APIRoute } from "astro";
import { getCourse } from "../../../../lib/catalog";
import { bus } from "../../../../lib/events";
import { EXAMPLE_ID, getPlan, isTerm, placeCourse, removeCourse } from "../../../../lib/planner";

// Add, move or remove one course. Plain form POSTs with a 303 back to the page
// they came from, so the planner works with no client-side JavaScript. Nothing
// here refuses a placement the rules object to: the page shows the warning and
// the student decides.
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const plan = getPlan(params.id ?? "");
  if (!plan) return new Response("No such plan.", { status: 404 });
  if (plan.id === EXAMPLE_ID) return new Response("The example plan is read-only; copy it first.", { status: 403 });

  const form = await request.formData();
  const course = getCourse(String(form.get("course") ?? ""));
  if (!course || course.stub) return new Response("No such course.", { status: 400 });

  if (form.get("remove")) {
    removeCourse(plan.id, course.code);
  } else {
    const term = String(form.get("term") ?? "");
    if (!isTerm(term)) return new Response("No such semester.", { status: 400 });
    placeCourse(plan.id, course.code, term);
  }
  bus.emit("plan", { plan: plan.id });

  // only ever back to a page on this site
  const back = String(form.get("back") ?? "");
  return redirect(/^\/[a-z]/.test(back) ? back : `/plan/${plan.id}`, 303);
};
