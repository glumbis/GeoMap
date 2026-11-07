// npm run ingest            -> run every ingest script (rebuild the whole database)
// npm run ingest kommuner   -> run data/scripts/kommuner.ts only
// Stop the API first: DuckDB allows only one process to write the file.
import { readdirSync } from "node:fs";

const dir = new URL("./", import.meta.url);
const skip = new Set(["run.ts", "lib.ts"]);
// Scripts other scripts depend on run first (e.g. most scripts clip to the `kommuner` table).
const first = ["kommuner"];
const all = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && !skip.has(f))
  .map((f) => f.replace(/\.ts$/, ""))
  .sort((a, b) => Number(first.includes(b)) - Number(first.includes(a)) || a.localeCompare(b));
const names = process.argv.slice(2);
const todo = names.length ? names : all;

for (const name of todo) {
  if (!all.includes(name)) throw new Error(`No script data/scripts/${name}.ts. Have: ${all.join(", ")}`);
  console.log(`== ${name}`);
  await import(new URL(`${name}.ts`, dir).href);
}
