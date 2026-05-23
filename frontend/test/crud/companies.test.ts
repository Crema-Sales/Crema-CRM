import { describe, it, expect, beforeEach } from "vitest";
import { createTestWorld, type TestWorld } from "../harness";
import {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
} from "@/lib/crm.functions";

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
});

describe("companies CRUD", () => {
  it("creates a company and lists it", async () => {
    world.loginNewOrg();
    const { id } = (await world.run(() =>
      createCompany({ data: { name: "Acme Coffee" } }),
    )) as { id: string };
    expect(id).toBeTruthy();

    const rows = (await world.run(() => listCompanies())) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].name).toBe("Acme Coffee");
  });

  it("reads a company back by id", async () => {
    world.loginNewOrg();
    const { id } = (await world.run(() =>
      createCompany({ data: { name: "Beanery", industry: "Food & Bev" } }),
    )) as { id: string };

    const detail = (await world.run(() => getCompany({ data: { id } }))) as any;
    expect(detail.company.id).toBe(id);
    expect(detail.company.industry).toBe("Food & Bev");
    expect(detail.contacts).toEqual([]);
    expect(detail.deals).toEqual([]);
  });

  it("updates a company", async () => {
    world.loginNewOrg();
    const { id } = (await world.run(() =>
      createCompany({ data: { name: "Old Co" } }),
    )) as { id: string };

    await world.run(() =>
      updateCompany({ data: { id, name: "New Co", employee_count: 42 } }),
    );

    const detail = (await world.run(() => getCompany({ data: { id } }))) as any;
    expect(detail.company.name).toBe("New Co");
    expect(detail.company.employee_count).toBe(42);
  });

  it("stamps org_id on create", async () => {
    const org = world.loginNewOrg();
    const { id } = (await world.run(() =>
      createCompany({ data: { name: "Scoped Co" } }),
    )) as { id: string };

    const row = world.d1.raw
      .prepare("SELECT org_id FROM companies WHERE id = ?")
      .get(id) as { org_id: string | null };
    expect(row.org_id).toBe(org.orgId);
  });

  it("isolates companies across orgs", async () => {
    world.loginNewOrg({ label: "org-a" });
    await world.run(() => createCompany({ data: { name: "A-Side Co" } }));

    world.loginNewOrg({ label: "org-b" });
    const rowsB = (await world.run(() => listCompanies())) as any[];
    expect(rowsB).toHaveLength(0);
  });
});
