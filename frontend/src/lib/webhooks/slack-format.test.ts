import { describe, expect, test } from "vitest";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks/events";
import { transformForSlack } from "@/lib/webhooks/slack-format";
import type { WebhookPayload } from "@/lib/webhooks/types";

const payload = (event: WebhookEvent, data: Record<string, unknown>): WebhookPayload => ({
  id: "wh_test",
  event,
  org_id: "org_test",
  occurred_at: "2026-05-19T00:00:00.000Z",
  data,
});

describe("transformForSlack", () => {
  test("every catalog event renders a non-empty text", () => {
    for (const event of WEBHOOK_EVENTS) {
      const body = transformForSlack(event, payload(event, {}));
      expect(typeof body.text).toBe("string");
      expect(body.text.length).toBeGreaterThan(0);
    }
  });

  test("deal.won with value=48000 formats $48,000 (no decimals)", () => {
    const body = transformForSlack(
      "deal.won",
      payload("deal.won", { deal: { name: "Acme Annual", value: 48000 } }),
    );
    expect(body.text).toContain("$48,000");
    expect(body.text).toContain("Acme Annual");
    expect(body.text).not.toContain("$48,000.00");
  });

  test("unknown event falls back to the Phase 01 stub shape", () => {
    const unknown = "not.a.real.event" as WebhookEvent;
    const body = transformForSlack(unknown, payload(unknown, {}));
    expect(body).toEqual({ text: "Crema event: not.a.real.event" });
    expect(body.blocks).toBeUndefined();
  });
});
