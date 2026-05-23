import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Vitest config is intentionally separate from vite.config.ts so we skip the
// Cloudflare / TanStack-Start plugins, which assume a worker / SSR environment
// that vitest doesn't provide.
export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // better-sqlite3 is a native addon — the forks pool loads it cleanly.
    pool: "forks",
  },
});
