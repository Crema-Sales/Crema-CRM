import { describe, it, expect, beforeEach } from "vitest";
import { createTestWorld, type TestWorld } from "../harness";
import {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  addTicketComment,
} from "@/lib/crm.functions";

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
});

describe("tickets CRUD", () => {
  it("creates a ticket and lists it", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createTicket({ data: { subject: "Grinder jammed", priority: "high" } }),
    )) as any;
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("open");

    const rows = (await world.run(() => listTickets())) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe("Grinder jammed");
  });

  it("reads a ticket back by id", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createTicket({ data: { subject: "Readable ticket" } }),
    )) as any;

    const detail = (await world.run(() => getTicket({ data: { id: created.id } }))) as any;
    expect(detail.ticket.id).toBe(created.id);
    expect(detail.ticket.subject).toBe("Readable ticket");
    expect(detail.comments).toEqual([]);
  });

  it("updates a ticket status", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createTicket({ data: { subject: "Resolve me" } }),
    )) as any;

    await world.run(() => updateTicket({ data: { id: created.id, status: "resolved" } }));

    const detail = (await world.run(() => getTicket({ data: { id: created.id } }))) as any;
    expect(detail.ticket.status).toBe("resolved");
    expect(detail.ticket.resolved_at).toBeTruthy();
  });

  it("adds a comment to a ticket", async () => {
    world.loginNewOrg();
    const created = (await world.run(() =>
      createTicket({ data: { subject: "Commentable ticket" } }),
    )) as any;

    await world.run(() =>
      addTicketComment({ data: { ticket_id: created.id, body: "Looking into it" } }),
    );

    const detail = (await world.run(() => getTicket({ data: { id: created.id } }))) as any;
    expect(detail.comments).toHaveLength(1);
    expect(detail.comments[0].body).toBe("Looking into it");
  });

  it("stamps org_id on create", async () => {
    const org = world.loginNewOrg();
    const created = (await world.run(() =>
      createTicket({ data: { subject: "Scoped ticket" } }),
    )) as any;

    const row = world.d1.raw
      .prepare("SELECT org_id FROM tickets WHERE id = ?")
      .get(created.id) as { org_id: string | null };
    expect(row.org_id).toBe(org.orgId);
  });

  it("isolates tickets across orgs", async () => {
    world.loginNewOrg({ label: "org-a" });
    await world.run(() => createTicket({ data: { subject: "A-Side ticket" } }));

    world.loginNewOrg({ label: "org-b" });
    const rowsB = (await world.run(() => listTickets())) as any[];
    expect(rowsB).toHaveLength(0);
  });
});
