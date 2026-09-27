import type { APIRoute } from "astro";
import { bus } from "../../lib/events";

// A server-sent-events stream of plan changes: every tab open on a plan hears
// when another tab (or another device) changes it, and re-renders. SSE is
// one-directional (server → browser) and plain HTTP, which is all this needs.
export const GET: APIRoute = () => {
  let onChange: (change: { plan: string }) => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<string>({
    start(controller) {
      // an opening comment so the client (and the post-deploy CI probe) sees
      // bytes immediately, and a periodic one so proxies don't drop the
      // connection as idle
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onChange = (change) => {
        controller.enqueue(`data: ${JSON.stringify(change)}\n\n`);
      };
      bus.on("plan", onChange);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("plan", onChange);
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
