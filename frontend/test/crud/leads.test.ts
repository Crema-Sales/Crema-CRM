import { describe, it, expect, beforeEach } from "vitest";
import { createTestWorld, type TestWorld, type SeededOrg } from "../harness";
import { listLeads, scoreLead } from "@/lib/crm.functions";

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
});

// There is no createLead server fn (leads are born from seedDemo / ingest),
// so the test seeds a contact + lead row directly, then exercises the
// read/list/score server fns the UI actually calls.
function seedLead(org: SeededOrg, fullName: string, score = 0): string {
  const contactId = crypto.randomUUID();
  const leadId = crypto.randomUUID();
  world.d1.raw
    .prepare(
      `INSERT INTO contacts (id, full_name, owner_id, org_id, relationship_stage)
       VALUES (?, ?, ?, ?, 'lead')`,
    )
    .run(contactId, fullName, org.userId, org.orgId);
  world.d1.raw
    .prepare(
      `INSERT INTO leads (id, contact_id, status, score, owner_id, org_id)
       VALUES (?, ?, 'new', ?, ?, ?)`,
    )
    .run(leadId, contactId, score, org.userId, org.orgId);
  return leadId;
}

describe("leads read/list/score", () => {
  it("lists leads for the org, highest score first", async () => {
    const org = world.loginNewOrg();
    seedLead(org, "Low Score Lead", 10);
    seedLead(org, "High Score Lead", 90);

    const rows = (await world.run(() => listLeads())) as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].score).toBe(90);
    expect(rows[0].contact.full_name).toBe("High Score Lead");
  });

  it("scores a lead and persists the new score", async () => {
    const org = world.loginNewOrg();
    const leadId = seedLead(org, "Scoreable Lead", 0);

    const result = (await world.run(() => scoreLead({ data: { id: leadId } }))) as any;
    expect(typeof result.score).toBe("number");

    const row = world.d1.raw
      .prepare("SELECT score, ai_reasoning FROM leads WHERE id = ?")
      .get(leadId) as { score: number; ai_reasoning: string | null };
    expect(row.score).toBe(result.score);
    expect(row.ai_reasoning).toBeTruthy();
  });

  it("isolates leads across orgs", async () => {
    const orgA = world.seedOrg({ label: "org-a" });
    seedLead(orgA, "A-Side Lead", 50);

    world.loginNewOrg({ label: "org-b" });
    const rowsB = (await world.run(() => listLeads())) as any[];
    expect(rowsB).toHaveLength(0);
  });
});
