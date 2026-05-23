import { signRepJwt } from "./auth";
import type { Env } from "./index";
import * as db from "./db";

/**
 * `cron.ts` — scheduled handlers. Wired into the default export of
 * `index.ts` as `{ fetch, scheduled }` so Wrangler can invoke them.
 *
 * Currently one fan-out: at 13:00 UTC daily, wake every active rep's
 * `RepAgent` DO and ask it to regenerate its "Morning Cup" summary into
 * DO storage. The `/v1/me/summary/today` route reads from that same DO
 * storage, so the dashboard sees the freshly generated text on the rep's
 * next page load.
 *
 * Per `AGENTS-WORKERS.md` "Cron triggers": cron triggers DO NOT fire in
 * `wrangler dev`. Use the `GET /__cron/daily` dev-only debug route from
 * `index.ts` to exercise this codepath locally.
 */

export type DailyResult = {
  ran: number;
  succeeded: string[];
  failed: { repId: string; error: string }[];
};

export async function runDailySummaryFanOut(env: Env): Promise<DailyResult> {
  const reps = await db.listActiveReps(env);
  const succeeded: string[] = [];
  const failed: { repId: string; error: string }[] = [];

  // Sequential rather than Promise.all so one rep's failure doesn't pollute
  // the others' logs with unrelated rejections. The fan-out is small and the
  // LLM call dominates wall-time, not the loop overhead.
  for (const rep of reps) {
    try {
      // Mint a service-issued JWT for this rep so the DO's runDailySummary
      // can call back into the same `/v1/*` API the chat copilot uses. The
      // cron has no inbound rep authentication of its own, so we forge one
      // per rep using the configured signing key. Phase 07+ will replace
      // seed.reps with a real `sales_reps` table query.
      const jwt = await signRepJwt(env, rep.id, rep.email);
      const id = env.AGENT.idFromName(rep.id);
      const stub = env.AGENT.get(id);
      const res = await stub.fetch("http://internal/cron/daily", {
        method: "POST",
        headers: { "x-rep-jwt": jwt },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        failed.push({ repId: rep.id, error: `status ${res.status}: ${body.slice(0, 200)}` });
        continue;
      }
      succeeded.push(rep.id);
    } catch (err) {
      failed.push({
        repId: rep.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ran: reps.length, succeeded, failed };
}

export async function scheduled(
  _controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  ctx.waitUntil(
    runDailySummaryFanOut(env).then((r) => {
      console.log(
        `[cron daily-summary] ran=${r.ran} ok=${r.succeeded.length} failed=${r.failed.length}`,
      );
      if (r.failed.length > 0) {
        console.log(`[cron daily-summary] failures=${JSON.stringify(r.failed)}`);
      }
    }),
  );
}
