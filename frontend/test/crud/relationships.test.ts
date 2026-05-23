import { describe, it, expect, beforeEach } from "vitest";
import { createTestWorld, type TestWorld } from "../harness";
import {
  listRelationshipRecords,
  getRelationshipRecord,
  createRelationshipRecord,
  advanceRelationshipStatus,
  archiveRelationshipRecord,
} from "@/lib/crm.functions";

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
});

describe("relationship records CRUD", () => {
  it("creates a relationship and lists it", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createRelationshipRecord({ data: { name: "Acme Account", status: "new" } }),
    )) as any;
    expect(created.id).toBeTruthy();

    const rows = (await world.run(() => listRelationshipRecords())) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Acme Account");
  });

  it("reads a relationship back by id", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createRelationshipRecord({ data: { name: "Readable Rel", status: "new" } }),
    )) as any;

    const detail = (await world.run(() =>
      getRelationshipRecord({ data: { id: created.id } }),
    )) as any;
    expect(detail.id).toBe(created.id);
    expect(detail.name).toBe("Readable Rel");
    expect(detail.contacts).toEqual([]);
    expect(detail.companies).toEqual([]);
  });

  it("advances a relationship status", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createRelationshipRecord({ data: { name: "Advancing Rel", status: "new" } }),
    )) as any;

    const result = (await world.run(() =>
      advanceRelationshipStatus({ data: { id: created.id, to_status: "discovery" } }),
    )) as any;
    expect(result.from).toBe("new");
    expect(result.to).toBe("discovery");

    const detail = (await world.run(() =>
      getRelationshipRecord({ data: { id: created.id } }),
    )) as any;
    expect(detail.status).toBe("discovery");
  });

  it("archives a relationship (drops out of list)", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createRelationshipRecord({ data: { name: "Doomed Rel", status: "new" } }),
    )) as any;

    await world.run(() => archiveRelationshipRecord({ data: { id: created.id } }));

    const rows = (await world.run(() => listRelationshipRecords())) as any[];
    expect(rows).toHaveLength(0);
  });

  it("isolates relationships across owners", async () => {
    world.loginNewOrg({ label: "rep-a", role: "rep" });
    await world.run(() =>
      createRelationshipRecord({ data: { name: "A-Side Rel", status: "new" } }),
    );

    world.loginNewOrg({ label: "rep-b", role: "rep" });
    const rowsB = (await world.run(() => listRelationshipRecords())) as any[];
    expect(rowsB).toHaveLength(0);
  });
});
