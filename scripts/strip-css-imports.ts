// TypeScript keeps side-effect imports in declarations, but the CSS they point
// to is bundled into one file, so they wouldn't resolve in other projects.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TYPES_DIR = "dist/types";
const CSS_IMPORT = /^import "[^"]+\.css";\n/gm;

for (const file of readdirSync(TYPES_DIR, { recursive: true })) {
  if (typeof file !== "string" || !file.endsWith(".d.ts")) {
    continue;
  }
  const path = join(TYPES_DIR, file);
  const contents = readFileSync(path, "utf8");
  writeFileSync(path, contents.replace(CSS_IMPORT, ""));
}
