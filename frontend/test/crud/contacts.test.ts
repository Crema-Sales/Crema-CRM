import { describe, it, expect, beforeEach } from "vitest";
import { createTestWorld, type TestWorld } from "../harness";
import {
  listContacts,
  getContact,
  upsertContact,
  deleteContact,
} from "@/lib/crm.functions";

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
});

/** Create a contact and return its id (upsertContact returns only {ok}). */
async function createContact(full_name: string, email?: string): Promise<string> {
  await world.run(() => upsertContact({ data: { full_name, email } }));
  const rows = await world.run(() => listContacts());
  const match = (rows as any[]).find((c) => c.full_name === full_name);
  if (!match) throw new Error(`contact ${full_name} not found after create`);
  return match.id;
}

describe("contacts CRUD", () => {
  it("creates a contact and lists it", async () => {
    world.loginNewOrg();
    await world.run(() => upsertContact({ data: { full_name: "Raja Amini" } }));

    const rows = (await world.run(() => listContacts())) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe("Raja Amini");
    expect(rows[0].relationship_stage).toBe("lead");
  });

  it("reads a contact back by id", async () => {
    world.loginNewOrg();
    const id = await createContact("Jane Smith", "jane@acme.com");

    const detail = (await world.run(() => getContact({ data: { id } }))) as any;
    expect(detail.contact.id).toBe(id);
    expect(detail.contact.full_name).toBe("Jane Smith");
    expect(detail.contact.email).toBe("jane@acme.com");
  });

  it("updates a contact", async () => {
    world.loginNewOrg();
    const id = await createContact("Old Name");

    await world.run(() =>
      upsertContact({ data: { id, full_name: "New Name", title: "VP Sales" } }),
    );

    const detail = (await world.run(() => getContact({ data: { id } }))) as any;
    expect(detail.contact.full_name).toBe("New Name");
    expect(detail.contact.title).toBe("VP Sales");
  });

  it("soft-deletes a contact (drops out of list)", async () => {
    world.loginNewOrg();
    const id = await createContact("Doomed Contact");

    await world.run(() => deleteContact({ data: { id } }));

    const rows = (await world.run(() => listContacts())) as any[];
    expect(rows).toHaveLength(0);
  });

  it("stamps org_id so the creator can see their own contact (regression: org_id bug)", async () => {
    const org = world.loginNewOrg({ label: "acme" });
    await world.run(() => upsertContact({ data: { full_name: "Org Scoped" } }));

    const row = world.d1.raw
      .prepare("SELECT org_id FROM contacts WHERE full_name = ?")
      .get("Org Scoped") as { org_id: string | null };
    expect(row.org_id).toBe(org.orgId);
  });

  it("isolates contacts across orgs (org B cannot see org A's contact)", async () => {
    world.loginNewOrg({ label: "org-a" });
    await world.run(() => upsertContact({ data: { full_name: "A-Side Contact" } }));

    world.loginNewOrg({ label: "org-b" });
    const rowsB = (await world.run(() => listContacts())) as any[];
    expect(rowsB).toHaveLength(0);
  });
});
