import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

copyFileSync(resolve(root, "src/tui.tsx"), resolve(root, "dist/tui.tsx"));
