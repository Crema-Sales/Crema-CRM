import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout-only parent so the /$id child can render. The list view lives in
// `companies.index.tsx`. Mirrors the `marketing.tsx` + `marketing.index.tsx`
// split already used in this repo.
export const Route = createFileRoute("/_authenticated/companies")({
  component: () => <Outlet />,
});
