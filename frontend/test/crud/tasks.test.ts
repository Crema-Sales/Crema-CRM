import { describe, it, expect, beforeEach } from "vitest";
import { createTestWorld, type TestWorld } from "../harness";
import {
  listContacts,
  getContact,
  upsertContact,
  listTasks,
  createContactTask,
  toggleTask,
  deleteTask,
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

describe("tasks CRUD", () => {
  it("creates a task against a contact and reads it on the contact", async () => {
    world.loginNewOrg();
    const contactId = await createContact("Task Owner");

    const { id } = (await world.run(() =>
      createContactTask({ data: { contact_id: contactId, title: "Send proposal" } }),
    )) as { id: string };
    expect(id).toBeTruthy();

    const detail = (await world.run(() => getContact({ data: { id: contactId } }))) as any;
    const titles = detail.tasks.map((t: any) => t.title);
    expect(titles).toContain("Send proposal");
  });

  it("toggles a task complete", async () => {
    world.loginNewOrg();
    const contactId = await createContact("Toggle Owner");
    const { id } = (await world.run(() =>
      createContactTask({ data: { contact_id: contactId, title: "Call back" } }),
    )) as { id: string };

    await world.run(() => toggleTask({ data: { id, completed: true } }));

    const row = world.d1.raw
      .prepare("SELECT completed FROM tasks WHERE id = ?")
      .get(id) as { completed: number };
    expect(row.completed).toBe(1);
  });

  it("deletes a task", async () => {
    world.loginNewOrg();
    const contactId = await createContact("Delete Owner");
    const { id } = (await world.run(() =>
      createContactTask({ data: { contact_id: contactId, title: "Obsolete task" } }),
    )) as { id: string };

    await world.run(() => deleteTask({ data: { id } }));

    const row = world.d1.raw.prepare("SELECT id FROM tasks WHERE id = ?").get(id);
    expect(row).toBeUndefined();
  });

  it("lists tasks for the current owner", async () => {
    world.loginNewOrg();
    const contactId = await createContact("List Owner");
    await world.run(() =>
      createContactTask({ data: { contact_id: contactId, title: "Listed task" } }),
    );

    const tasks = (await world.run(() => listTasks())) as any[];
    expect(tasks.some((t) => t.title === "Listed task")).toBe(true);
  });
});
