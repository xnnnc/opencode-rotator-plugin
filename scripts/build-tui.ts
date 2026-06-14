import solidPlugin from "@opentui/solid/bun-plugin";

const result = await Bun.build({
  entrypoints: ["src/tui.tsx"],
  outdir: "dist",
  target: "node",
  format: "esm",
  sourcemap: "external",
  plugins: [solidPlugin],
  external: ["@opentui/*", "solid-js"],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log.message);
  }
  process.exit(1);
}
