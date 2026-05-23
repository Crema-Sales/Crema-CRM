import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DIST = resolve(ROOT, "dist");
const WATCH = process.argv.includes("--watch");

async function copyStatic() {
  await cp(resolve(ROOT, "manifest.json"), resolve(DIST, "manifest.json"));
  if (existsSync(resolve(ROOT, "icons"))) {
    await cp(resolve(ROOT, "icons"), resolve(DIST, "icons"), { recursive: true });
  }
  // Popup is an extension page — its markup/styles are static; popup.js is
  // bundled by esbuild below.
  for (const f of ["popup.html", "popup.css"]) {
    const src = resolve(ROOT, "src/popup", f);
    if (existsSync(src)) await cp(src, resolve(DIST, f));
  }
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const shared = {
    bundle: true,
    target: "es2022",
    platform: "browser",
    outdir: DIST,
    sourcemap: true,
    logLevel: "info",
    define: { "process.env.NODE_ENV": JSON.stringify(WATCH ? "development" : "production") },
  } as const;

  // background + popup load as ES modules (manifest `type: module` / a
  // `<script type=module>` tag respectively).
  const moduleCtx = await esbuild.context({
    ...shared,
    entryPoints: [
      { in: resolve(ROOT, "src/background/index.ts"), out: "background" },
      { in: resolve(ROOT, "src/popup/popup.ts"), out: "popup" },
    ],
    format: "esm",
  });

  // content scripts are classic scripts — bundle as an IIFE so nothing leaks
  // to the page and no module syntax reaches the classic-script loader.
  const contentCtx = await esbuild.context({
    ...shared,
    entryPoints: [{ in: resolve(ROOT, "src/content/index.ts"), out: "content" }],
    format: "iife",
  });

  await Promise.all([moduleCtx.rebuild(), contentCtx.rebuild()]);
  await copyStatic();

  if (WATCH) {
    await Promise.all([moduleCtx.watch(), contentCtx.watch()]);
    console.log("[build] watching for changes…");
    // Re-copy static assets on rebuilds via a simple poller.
    setInterval(copyStatic, 1500);
  } else {
    await Promise.all([moduleCtx.dispose(), contentCtx.dispose()]);
    console.log("[build] done →", DIST);
  }
}

main().catch((err) => {
  console.error("[build] failed:", err);
  process.exit(1);
});
