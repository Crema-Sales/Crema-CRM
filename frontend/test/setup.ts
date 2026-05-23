// Global vitest setup for CRUD server-fn tests.
//
// Two module mocks, applied to every test file:
//
//  1. `createServerFn` — the real builder needs the TanStack Start runtime
//     (AsyncLocalStorage "Start context") which vitest has no host for. The
//     mock keeps the same `.middleware().inputValidator().handler()` chain but
//     produces a plain callable: it runs the zod inputValidator (so validation
//     is still exercised) and injects the harness auth context, then calls the
//     handler directly. Middleware objects are ignored — auth is covered by
//     injecting context, and is not the unit under test here.
//
//  2. enrichment kick-offs — stubbed to no-ops so creating a contact/company
//     never fires a background network fetch (keeps tests deterministic).
import { vi } from "vitest";

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  const { getAuthContext } = await import("./harness");

  function createServerFn() {
    let validator: ((d: unknown) => unknown) | null = null;
    const builder: Record<string, unknown> = {
      middleware() {
        return builder;
      },
      inputValidator(fn: (d: unknown) => unknown) {
        validator = fn;
        return builder;
      },
      handler(handlerFn: (args: { context: unknown; data: unknown }) => unknown) {
        return async (input?: { data?: unknown }) => {
          const data = validator ? validator(input?.data) : input?.data;
          return handlerFn({ context: getAuthContext(), data });
        };
      },
    };
    return builder;
  }

  return { ...actual, createServerFn };
});

vi.mock("@/lib/enrichment.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/enrichment.server")>();
  return {
    ...actual,
    kickOffCompanyEnrichment: () => {},
    kickOffContactEnrichment: () => {},
    refreshCompanyEnrichment: () => {},
    refreshContactEnrichment: () => {},
  };
});
