// Shared helper for Statens vegvesen's NVDB API Les v4 (NLOD, keyless; needs an X-Client header). Owner: Even.
// Not an ingest script: it only exports a helper, so `npm run ingest` running it does nothing.
import { type Bbox } from "./lib.ts";

const API = "https://nvdbapiles.atlas.vegvesen.no/vegobjekter/api/v4/vegobjekter";
const headers = { "User-Agent": "GeoMap-hackathon", "X-Client": "GeoMap-hackathon", Accept: "application/json" };

export interface NvdbObject {
  id: number;
  /** Property name -> value (NVDB "egenskaper"). */
  props: Record<string, unknown>;
  /** WKT in EPSG:4326 with lng, lat order (NVDB returns lat, lng; flipped here). Z values dropped. */
  wkt: string;
}

/** lat lng [z] -> lng lat, for every coordinate in a WKT string. */
const flipWkt = (wkt: string) =>
  wkt.replace(/ Z /, " ").replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)(?: -?\d+(?:\.\d+)?)?/g, "$2 $1");

/** One page, retrying up to 5 times on 5xx and network errors (NVDB sometimes drops a connection). */
async function fetchPage(url: string, type: number): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return await res.json();
      if (res.status < 500 || attempt >= 5) throw new Error(`NVDB ${type}: ${res.status} ${await res.text()}`);
    } catch (e) {
      if (attempt >= 5 || String(e).includes(`NVDB ${type}:`)) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

/** Every object of one NVDB type inside bbox (lng, lat), paging 1000 at a time. `filter` is NVDB's `egenskap` filter. */
export async function nvdbObjects(type: number, bbox: Bbox, filter?: string): Promise<NvdbObject[]> {
  const params = new URLSearchParams({ kartutsnitt: bbox.join(","), srid: "4326", inkluder: "egenskaper,geometri", antall: "1000" });
  if (filter) params.set("egenskap", filter);
  let url: string | undefined = `${API}/${type}?${params}`;
  const out: NvdbObject[] = [];
  while (url) {
    const page: any = await fetchPage(url, type);
    for (const o of page.objekter) {
      if (!o.geometri?.wkt) continue;
      out.push({ id: o.id, props: Object.fromEntries((o.egenskaper ?? []).map((e: any) => [e.navn, e.verdi])), wkt: flipWkt(o.geometri.wkt) });
    }
    url = page.metadata.returnert > 0 ? page.metadata.neste?.href : undefined;
    process.stdout.write(`\r  NVDB ${type}: ${out.length}`);
  }
  process.stdout.write("\n");
  return out;
}
