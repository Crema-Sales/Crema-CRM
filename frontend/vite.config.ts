import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // When run-local.sh is launched with --prod, USE_REMOTE_BINDINGS=1
      // flips every D1 binding to remote=true so the local dev server
      // reads/writes the production D1 (f89d74c8-…). Without the flag,
      // bindings stay local — the default and safe path.
      config: (cfg) => {
        if (process.env.USE_REMOTE_BINDINGS === "1") {
          for (const b of cfg.d1_databases ?? []) {
            (b as { remote?: boolean }).remote = true;
          }
        }
      },
    }),
  ],
});
