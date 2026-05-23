import { describe, it, expect, beforeEach } from "vitest";
import { createTestWorld, type TestWorld } from "../harness";
import {
  listContacts,
  getContact,
  upsertContact,
  listActivities,
  logActivity,
} from "@/lib/crm.functions";

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
});

async function createContact(full_name: string): Promise<string> {
  await world.run(() => upsertContact({ data: { full_name } }));
  const rows = (await world.run(() => listContacts())) as any[];
  return rows.find((c) => c.full_name === full_name).id;
}

describe("activities CRUD", () => {
  it("logs an activity against a contact and reads it on the timeline", async () => {
    world.loginNewOrg();
    const contactId = await createContact("Activity Contact");

    await world.run(() =>
      logActivity({
        data: { type: "call", subject: "Intro call", contact_id: contactId },
      }),
    );

    const detail = (await world.run(() => getContact({ data: { id: contactId } }))) as any;
    const subjects = detail.activities.map((a: any) => a.subject);
    expect(subjects).toContain("Intro call");
  });

  it("lists activities for the org", async () => {
    world.loginNewOrg();
    const contactId = await createContact("Listed Activity Contact");
    await world.run(() =>
      logActivity({
        data: { type: "note", subject: "A note", contact_id: contactId },
      }),
    );

    const rows = (await world.run(() => listActivities())) as any[];
    expect(rows.some((a) => a.subject === "A note")).toBe(true);
  });

  it("a 'meeting' activity advances the contact to customer stage", async () => {
    world.loginNewOrg();
    const contactId = await createContact("Meeting Contact");

    await world.run(() =>
      logActivity({
        data: { type: "meeting", subject: "Closing meeting", contact_id: contactId },
      }),
    );

    const detail = (await world.run(() => getContact({ data: { id: contactId } }))) as any;
    expect(detail.contact.relationship_stage).toBe("customer");
  });
});
