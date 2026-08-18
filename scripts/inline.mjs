#!/usr/bin/env node
/**
 * Inlines public/*.js into src/ui.ts so the deployed Worker needs no static
 * assets. Run before `wrangler deploy`:
 *
 *   node scripts/inline.mjs
 *
 * Each constant (CLIENT_JS) is generated from its matching public/*.js file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const read = (f) => readFileSync(join(root, "public", f), "utf-8");

// Escape backticks and ${} so the JS stays valid inside a template literal.
const escape = (s) =>
  s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const sources = {
  CLIENT_JS: read("app.js"),
};

let out = readFileSync(join(root, "src", "ui.ts"), "utf-8");
for (const [name, src] of Object.entries(sources)) {
  const START = `export const ${name} = \``;
  const startIdx = out.indexOf(START);
  if (startIdx === -1) {
    console.error(`ERROR: could not find \`${START}\` in src/ui.ts`);
    process.exit(1);
  }
  const afterOpen = startIdx + START.length;
  let endIdx = -1;
  for (let i = afterOpen; i < out.length - 1; i++) {
    if (out[i] === "`" && out[i - 1] !== "\\" && out[i + 1] === ";") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    console.error(`ERROR: could not find the closing backtick of ${name} in src/ui.ts`);
    process.exit(1);
  }
  out = out.slice(0, afterOpen) + escape(src) + out.slice(endIdx);
  console.log(`Inlined ${src.length} bytes into ${name}`);
}

writeFileSync(join(root, "src", "ui.ts"), out, "utf-8");
console.log("Done. src/ui.ts updated.");
