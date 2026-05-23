import { describe, it, expect, beforeEach } from "vitest";
import { createTestWorld, type TestWorld } from "../harness";
import {
  listDeals,
  getDeal,
  createDeal,
  updateDeal,
  updateDealStage,
} from "@/lib/crm.functions";

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
});

describe("deals CRUD", () => {
  it("creates a deal and lists it", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createDeal({ data: { name: "Acme Q3 Roast", value: 12000 } }),
    )) as any;
    expect(created.id).toBeTruthy();
    expect(created.stage).toBe("discovery");

    const rows = (await world.run(() => listDeals())) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Acme Q3 Roast");
    expect(rows[0].value).toBe(12000);
  });

  it("reads a deal back by id", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createDeal({ data: { name: "Readable Deal", value: 500 } }),
    )) as any;

    const detail = (await world.run(() => getDeal({ data: { id: created.id } }))) as any;
    expect(detail.deal.id).toBe(created.id);
    expect(detail.deal.name).toBe("Readable Deal");
    expect(detail.activities).toEqual([]);
  });

  it("updates a deal's fields", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createDeal({ data: { name: "Old Deal", value: 100 } }),
    )) as any;

    await world.run(() =>
      updateDeal({ data: { id: created.id, name: "Bigger Deal", value: 99999 } }),
    );

    const detail = (await world.run(() => getDeal({ data: { id: created.id } }))) as any;
    expect(detail.deal.name).toBe("Bigger Deal");
    expect(detail.deal.value).toBe(99999);
  });

  it("advances a deal stage and stamps closed_at on win", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createDeal({ data: { name: "Winnable", value: 1000 } }),
    )) as any;

    await world.run(() => updateDealStage({ data: { id: created.id, stage: "won" } }));

    const detail = (await world.run(() => getDeal({ data: { id: created.id } }))) as any;
    expect(detail.deal.stage).toBe("won");
    expect(detail.deal.closed_at).toBeTruthy();
  });

  it("stamps org_id on create", async () => {
    const org = world.loginNewOrg();
    const created = (await world.run(() =>
      createDeal({ data: { name: "Scoped Deal", value: 1 } }),
    )) as any;

    const row = world.d1.raw
      .prepare("SELECT org_id FROM deals WHERE id = ?")
      .get(created.id) as { org_id: string | null };
    expect(row.org_id).toBe(org.orgId);
  });

  it("isolates deals across orgs", async () => {
    world.loginNewOrg({ label: "org-a" });
    await world.run(() => createDeal({ data: { name: "A-Side Deal", value: 1 } }));

    world.loginNewOrg({ label: "org-b" });
    const rowsB = (await world.run(() => listDeals())) as any[];
    expect(rowsB).toHaveLength(0);
  });
});
