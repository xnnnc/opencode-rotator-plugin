import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const emittedTui = resolve(root, "dist/tui.js");

if (!existsSync(emittedTui)) {
  throw new Error(`Missing compiled TUI entry: ${emittedTui}`);
}
