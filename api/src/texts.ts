// Info texts per data point, read from docs/TEXTS.md (Even owns the texts; this only reads them).
// Takes the "**Forklaring:**" line under each "### `<id>`" heading. The "Når ..." lines are not used yet.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEXTS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/TEXTS.md");

function load(): Map<string, string> {
  const out = new Map<string, string>();
  let md: string;
  try {
    md = readFileSync(TEXTS_PATH, "utf8");
  } catch {
    console.error(`texts: cannot read ${TEXTS_PATH}, data points get no info text`);
    return out;
  }
  let id: string | undefined;
  for (const line of md.split(/\r?\n/)) {
    const heading = /^###\s+`([^`]+)`/.exec(line);
    if (heading) {
      id = heading[1];
      continue;
    }
    const text = /^\*\*Forklaring:\*\*\s*(.+)$/.exec(line);
    if (id && text && !out.has(id)) out.set(id, text[1].trim());
  }
  return out;
}

/** Main info text for a data point id, read once at startup. Restart the API after editing docs/TEXTS.md. */
export const INFO_TEXTS = load();
