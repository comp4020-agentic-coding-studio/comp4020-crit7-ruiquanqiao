import type { APIRoute } from "astro";
import { ruleSetFor } from "../../../../lib/catalog";
import { bus } from "../../../../lib/events";
import { EXAMPLE_ID, getPlan, setSpecialisation, termYear } from "../../../../lib/planner";

// Choose the plan's specialisation, from those its program offers in the
// student's starting year.
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const plan = getPlan(params.id ?? "");
  if (!plan) return new Response("No such plan.", { status: 404 });
  if (plan.id === EXAMPLE_ID) return new Response("The example plan is read-only; copy it first.", { status: 403 });

  const code = String((await request.formData()).get("specialisation") ?? "");
  const { set } = ruleSetFor(plan.program, termYear(plan.startTerm));
  if (code && !set?.specialisations.some((s) => s.code === code && s.offered)) {
    return new Response("That specialisation isn't offered in this plan's handbook year.", { status: 400 });
  }
  setSpecialisation(plan.id, code || null);
  bus.emit("plan", { plan: plan.id });
  return redirect(`/plan/${plan.id}`, 303);
};
