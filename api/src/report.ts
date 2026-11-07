// Omnium Rapport: an in-depth PDF about one address. Spec: docs/REPORT.md.
// Built only from the address profile and summary (no data of its own), plus hazard zones for the map.
// The one API response that is not JSON (AGENTS.md -> "API conventions").
import { readFileSync } from "node:fs";
import { DATA_POINTS, type Severity } from "./datapoints.ts";
import { query } from "./db.ts";
import { htmlToPdf } from "./pdf.ts";
import { buildProfile, type MissingDataPoint, type PresentDataPoint, type Profile } from "./profile.ts";
import type { Rating } from "./rating.ts";
import { buildSummary, type Summary } from "./summary.ts";

// Colours: copied from web/src/style.css (the web tokens can't reach a PDF). Keep in step with that file.
const C = {
  ink: "#15233a", muted: "#5b6676", line: "#e7e0da", paper: "#fcf7f5", navy: "#1a3d57", teal: "#0c5e68",
  orange: "#ec7f33", good: "#41aa79", warn: "#e0a43a", bad: "#d4553a", unknown: "#9aa3ad",
};

const LOGO = `data:image/png;base64,${readFileSync(new URL("../../web/public/logo-mark.png", import.meta.url)).toString("base64")}`;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());

// ---------- Words and colours for scores (same thresholds as the web app) ----------

const scoreColour = (s: number) => (s >= 60 ? C.good : s >= 40 ? C.warn : C.bad);
const scoreWord = (s: number) => (s >= 80 ? "Svært god" : s >= 60 ? "God" : s >= 40 ? "Middels" : "Svak");
/** docs/PROFILE.md: a capped score is never called "God"; the cap reason replaces the word. */
const ratingWord = (r: Rating) =>
  r.status === "ok" ? (r.cappedBy?.length ? r.cappedBy[0].text : scoreWord(r.score!)) : r.status === "informational" ? "Kun fakta" : "Kan ikke vurderes";
const SEVERITY: Record<Severity, { word: string; colour: string }> = {
  high: { word: "Høy", colour: C.bad }, medium: { word: "Middels", colour: C.warn }, low: { word: "Lav", colour: C.unknown },
};
const EFFECT = { good: C.good, bad: C.bad, neutral: C.unknown };
const MISSING: Record<MissingDataPoint["reason"], string> = {
  notLoaded: "Ikke lastet inn ennå", noCoverage: "Kilden dekker ikke denne adressen", sourceUnavailable: "Kilden svarer ikke nå",
  outsideArea: "Utenfor Oslo og Akershus",
};

// ---------- Static maps: Kartverket tiles laid out in HTML, hazard zones drawn as SVG on top ----------

const TILE = 256;
interface Frame { z: number; left: number; top: number; w: number; h: number }

function frame(lng: number, lat: number, z: number, w: number, h: number): Frame {
  const n = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * n;
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { z, left: x - w / 2, top: y - h / 2, w, h };
}

/** Screen pixel inside the frame for a lng/lat. */
function px(f: Frame, lng: number, lat: number): [number, number] {
  const n = TILE * 2 ** f.z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * n - f.left, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n - f.top];
}

function bbox(f: Frame): [number, number, number, number] {
  const n = TILE * 2 ** f.z;
  const lng = (x: number) => (x / n) * 360 - 180;
  const lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lng(f.left), lat(f.top + f.h), lng(f.left + f.w), lat(f.top)];
}

function tiles(f: Frame, layer: string): string {
  const out: string[] = [];
  for (let tx = Math.floor(f.left / TILE); tx * TILE < f.left + f.w; tx++) {
    for (let ty = Math.floor(f.top / TILE); ty * TILE < f.top + f.h; ty++) {
      const url = `https://cache.kartverket.no/v1/wmts/1.0.0/${layer}/default/webmercator/${f.z}/${ty}/${tx}.png`;
      out.push(`<img src="${url}" style="left:${(tx * TILE - f.left).toFixed(1)}px;top:${(ty * TILE - f.top).toFixed(1)}px" alt="">`);
    }
  }
  return out.join("");
}

const PIN = `<svg class="pin" viewBox="0 0 24 34" width="26" height="37"><path d="M12 33C12 33 1 19.5 1 12a11 11 0 0 1 22 0c0 7.5-11 21-11 21z" fill="${C.orange}" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="4.2" fill="#fff"/></svg>`;

function map(f: Frame, layer: string, lng: number, lat: number, overlay = ""): string {
  const [x, y] = px(f, lng, lat);
  return `<div class="map ${layer}" style="width:${f.w}px;height:${f.h}px">
    <div class="tiles">${tiles(f, layer)}</div>
    <svg class="overlay" width="${f.w}" height="${f.h}">${overlay}</svg>
    <div class="pin-at" style="left:${x}px;top:${y}px">${PIN}</div>
    <div class="map-credit">© Kartverket${overlay ? ", NVE" : ""}</div>
  </div>`;
}

const HAZARD_COLOURS: Record<string, string> = {
  quickClay: C.bad, flood200: "#2f7fb5", rockfall: "#8a5a3c", debrisFlow: C.warn, avalanche: "#6a5acd", stormSurge: C.teal,
};

interface Zone { id: string; label: string; colour: string; path: string }

/** Hazard zones inside the map frame, as SVG paths. A layer that fails is left out of the map (and logged). */
async function hazardZones(f: Frame): Promise<Zone[]> {
  const [minLng, minLat, maxLng, maxLat] = bbox(f);
  const tolerance = (maxLng - minLng) / f.w; // about one pixel
  const loaded = new Set((await query<{ t: string }>("SELECT table_name AS t FROM duckdb_tables()")).map((r) => r.t));
  const zones: Zone[] = [];
  for (const dp of DATA_POINTS.filter((d) => HAZARD_COLOURS[d.id] && d.find.kind === "within" && loaded.has(d.table))) {
    try {
      const env = "ST_MakeEnvelope($1, $2, $3, $4)";
      const rows = await query<{ g: string }>(
        `SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Intersection(ST_MakeValid(geom), ${env}), $5)) AS g
         FROM ${dp.table} WHERE ST_Intersects(geom, ${env})${dp.find.where ? ` AND (${dp.find.where})` : ""} LIMIT 300`,
        [minLng, minLat, maxLng, maxLat, tolerance],
      );
      const path = rows.map((r) => geoPath(JSON.parse(r.g), f)).join(" ").trim();
      if (path) zones.push({ id: dp.id, label: dp.label, colour: HAZARD_COLOURS[dp.id], path });
    } catch (err) {
      console.error(`report: hazard zones for ${dp.id} failed:`, (err as Error).message);
    }
  }
  return zones;
}

function geoPath(g: any, f: Frame): string {
  const ring = (r: number[][]) => r.map(([lng, lat], i) => `${i ? "L" : "M"}${px(f, lng, lat).map((v) => v.toFixed(1)).join(" ")}`).join("") + "Z";
  if (g.type === "Polygon") return g.coordinates.map(ring).join("");
  if (g.type === "MultiPolygon") return g.coordinates.flatMap((p: number[][][]) => p.map(ring)).join("");
  if (g.type === "GeometryCollection") return g.geometries.map((x: any) => geoPath(x, f)).join("");
  return ""; // lines and points left over from clipping
}

// ---------- Charts (inline SVG / HTML, no library) ----------

/** 0-100 bar with the score as the fill; neutral (no score) shows a dash. */
function bar(score: number | undefined, height = 8): string {
  if (score == null) return `<div class="bar empty" style="height:${height}px"></div>`;
  return `<div class="bar" style="height:${height}px"><div style="width:${Math.max(score, 1.5)}%;background:${scoreColour(score)}"></div></div>`;
}

/** The big score scale on the cover: 0-100 with the three bands and a marker. */
function scale(score: number): string {
  return `<div class="scale">
    <div class="bands"><span style="flex:40;background:${C.bad}"></span><span style="flex:20;background:${C.warn}"></span><span style="flex:40;background:${C.good}"></span></div>
    <div class="marker" style="left:${score}%"></div>
    <div class="ticks"><span>0</span><span style="left:40%">40</span><span style="left:60%">60</span><span style="left:80%">80</span><span style="right:0">100</span></div>
  </div>`;
}

function scoreBadge(r: Rating): string {
  if (r.status === "ok") return `<span class="badge" style="border-color:${scoreColour(r.score!)}"><b>${r.score}</b><small>/100</small></span>`;
  return `<span class="badge muted">${esc(ratingWord(r))}</span>`;
}

// ---------- Questions to ask (docs/REPORT.md -> "Spørsmål"). Written by hand, never by the AI. ----------

const QUESTIONS: Record<string, { warn?: string[]; notMapped?: string[] }> = {
  quickClay: {
    warn: ["Er det gjort en geoteknisk vurdering av tomten, og hva sier den om områdestabilitet?", "Har kommunen stilt krav om sikringstiltak for byggesaker i området?"],
    notMapped: ["NVE har ikke kartlagt kvikkleire her. Finnes det grunnundersøkelser for tomten eller nabotomtene?"],
  },
  flood200: {
    warn: ["Har det vært vann i kjeller eller på tomten ved flom eller kraftig regn?", "Er boligen flomsikret, og hva dekker forsikringen ved flomskade?"],
    notMapped: ["NVE har ikke kartlagt flomfare her. Har det vært vann i kjelleren ved kraftig regn eller snøsmelting?"],
  },
  rockfall: { warn: ["Er det gjort en vurdering av skredfare for tomten (TEK17 § 7-3)?", "Finnes det sikring mot steinsprang, for eksempel nett eller voll?"] },
  debrisFlow: { warn: ["Er det gjort en vurdering av skredfare for tomten (TEK17 § 7-3)?", "Hvordan ledes overvann og bekker forbi huset ved store nedbørsmengder?"] },
  avalanche: { warn: ["Er det gjort en vurdering av snøskredfare for tomten (TEK17 § 7-3)?"] },
  stormSurge: { warn: ["Hvor høyt over havet ligger laveste etasje, og har det vært vann inn ved stormflo?"] },
  radon: { warn: ["Er det målt radon i boligen? Når, og hva var resultatet i Bq/m³?", "Har boligen radonsperre, radonbrønn eller annet tiltak mot radon?"] },
  soilType: { warn: ["Har bygningen setningsskader, sprekker i mur eller skjeve dører og vinduer?", "Hvordan er huset fundamentert, for eksempel på peler til fjell?"] },
  pollutedGround: { warn: ["Hva slags forurensning er registrert i nærheten, og er grunnen på tomten undersøkt?"] },
  roadNoise: { warn: ["Hvilke rom vender mot veien, og har vinduene støydempende glass?", "Finnes det støyskjerm, og er det planer om mer trafikk på veien?"] },
  roadNoiseStrategic: { warn: ["Hvilke rom vender mot veien, og har vinduene støydempende glass?", "Finnes det støyskjerm, og er det planer om mer trafikk på veien?"] },
  aircraftNoise: { warn: ["Hvor ofte går flytrafikken over boligen, og har vinduene støydempende glass?"] },
};

function questions(p: Profile): { topic: string; finding: string; items: string[] }[] {
  const out: { topic: string; finding: string; items: string[] }[] = [];
  const seen = new Set<string>();
  for (const c of p.categories) {
    for (const d of c.dataPoints) {
      const q = QUESTIONS[d.id];
      const items = d.value === "ikkeKartlagt" ? q?.notMapped : d.warning ? (q?.warn ?? [`Spør selger eller megler om dette: ${d.warning.text.toLowerCase()}.`]) : undefined;
      const fresh = items?.filter((i) => !seen.has(i));
      if (!fresh?.length) continue;
      fresh.forEach((i) => seen.add(i));
      out.push({ topic: d.label, finding: d.warning?.text ?? d.display, items: fresh });
    }
    for (const m of c.missing.filter((m) => m.importance === "critical")) {
      out.push({ topic: m.label, finding: "Vi fant ikke data", items: [`Vi kunne ikke sjekke ${m.label.toLowerCase()}. Spør selger eller kommunen hva som er kjent.`] });
    }
  }
  return out;
}

// ---------- The document ----------

const KM = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo" });

function render(p: Profile, s: Summary, zones: Zone[]): string {
  const a = p.address;
  const sourceOf = new Map(p.sources.map((x) => [x.id, x]));
  const r = p.rating;
  const ok = r.status === "ok";
  const date = DATE.format(new Date());
  const place = `${a.postcode} ${titleCase(a.place)}`;
  const kommune = `${titleCase(a.municipality)} kommune`;
  const matrikkel = a.gnr != null && a.bnr != null ? `Gnr. ${a.gnr} / Bnr. ${a.bnr}` : "";
  const capped = ok && r.cappedBy?.length;

  const coverMap = frame(a.lng, a.lat, 16, 672, 280);
  const hazardMap = frame(a.lng, a.lat, 15, 672, 400);
  const overlay = zones.map((z) => `<path d="${z.path}" fill="${z.colour}" fill-opacity="0.32" stroke="${z.colour}" stroke-width="1.2" fill-rule="evenodd"/>`).join("");

  const present = p.categories.reduce((n, c) => n + c.dataPoints.length, 0);
  const expected = present + p.categories.reduce((n, c) => n + c.missing.length, 0);
  const totalWeight = p.categories.reduce((n, c) => n + c.weight, 0);
  const qs = questions(p);
  const allMissing = p.categories.flatMap((c) => c.missing.map((m) => ({ ...m, category: c.name })));

  const warningRow = (w: Profile["warnings"][number]) => {
    const sev = SEVERITY[w.severity];
    const cat = p.categories.find((c) => c.id === w.categoryId)?.name ?? "";
    return `<li><span class="sev" style="background:${sev.colour}">${sev.word}</span><span class="w-text">${esc(w.text)}</span><span class="w-cat">${esc(cat)}</span></li>`;
  };

  const pointRow = (d: PresentDataPoint) => {
    const src = sourceOf.get(d.source);
    return `<div class="dp">
      <div class="dp-head">
        <span class="dot" style="background:${EFFECT[d.effect]}"></span>
        <span class="dp-label">${esc(d.label)}</span>
        <span class="dp-value">${esc(d.display)}</span>
        <span class="dp-score">${d.score != null ? `${bar(d.score, 6)}<b>${d.score}</b>` : `<span class="na">Ikke vurdert</span>`}</span>
      </div>
      ${d.warning ? `<p class="dp-warn" style="border-color:${SEVERITY[d.warning.severity].colour}">${esc(d.warning.text)}</p>` : ""}
      ${d.explanation ? `<p class="dp-expl">${esc(d.explanation)}</p>` : ""}
      <p class="dp-src">Kilde: ${esc(src ? `${src.name}, ${src.owner}` : d.source)}</p>
    </div>`;
  };

  const missingRow = (m: MissingDataPoint) => {
    const src = sourceOf.get(m.source);
    return `<div class="dp missing"><div class="dp-head">
      <span class="dot hollow"></span><span class="dp-label">${esc(m.label)}</span>
      <span class="dp-value">Ikke tilgjengelig · ${MISSING[m.reason]}</span><span class="dp-score"></span></div>
      <p class="dp-src">Kilde: ${esc(src ? `${src.name}, ${src.owner}` : m.source)}</p></div>`;
  };

  const summaryHtml = s.aiGenerated
    ? `<p class="summary">${esc(s.text)}</p><p class="note">AI-generert av ${esc(s.model ?? "Claude")} kun fra faktasetningene i denne rapporten. Kontroller alltid mot datapunktene og kildene.</p>`
    : `<ul class="facts">${s.facts.slice(0, 8).map((f) => `<li>${esc(f.text)}</li>`).join("")}</ul><p class="note">Faktasetninger fra datakildene.</p>`;

  return `<!doctype html><html lang="nb"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=block" rel="stylesheet">
<style>${CSS}</style></head><body>

<!-- ============ 1. Cover ============ -->
<section class="cover">
  <header class="masthead">
    <div class="brand"><img class="logo" src="${LOGO}" alt=""><span>Omnium</span></div>
    <div class="meta"><b>Eiendomsrapport</b><br>${esc(date)}<br><span class="mono">${esc(a.id)}</span></div>
  </header>
  <div class="rule"></div>
  <p class="kicker">Alt offentlig tilgjengelig om eiendommen</p>
  <h1>${esc(a.text)}</h1>
  <p class="sub">${esc(place)} · ${esc(kommune)}${matrikkel ? ` · ${matrikkel}` : ""}</p>
  ${map(coverMap, "topo", a.lng, a.lat)}

  <div class="verdict">
    <div class="big">
      <p class="label">Samlet vurdering</p>
      ${ok ? `<p class="num">${r.score}<small>/100</small></p>` : `<p class="num na">–</p>`}
      <p class="word" style="color:${ok ? scoreColour(r.score!) : C.muted}">${esc(ratingWord(r))}</p>
      ${ok ? scale(r.score!) : `<p class="reason">${esc(r.reason ?? "")}</p>`}
    </div>
    <div class="facts-col">
      ${r.weakestCategory ? `<p><span class="label">Svakeste kategori</span><br><b>${esc(r.weakestCategory.name)}</b> ${r.weakestCategory.score}/100</p>` : ""}
      <p><span class="label">Datagrunnlag</span><br><b>${r.coverage.present} av ${r.coverage.expected}</b> datapunkter funnet</p>
      ${capped ? `<p><span class="label">Begrenset av</span><br>${r.cappedBy!.map((c) => esc(c.text)).join("<br>")}</p>` : ""}
    </div>
  </div>

  ${p.warnings.length ? `<h3 class="mini">Viktigste funn</h3><ul class="warnings">${p.warnings.slice(0, 3).map(warningRow).join("")}</ul>` : `<p class="note">Ingen alvorlige funn i dataene vi har.</p>`}
  <p class="disclaimer">Rapporten samler offentlige data om stedet. Den er ikke en tilstandsrapport, en takst eller en garanti for at en risiko ikke finnes. Data vi ikke har, er oppgitt som manglende.</p>
</section>

<!-- ============ 2. Overview ============ -->
<section class="page">
  <p class="kicker">Del 1</p><h2>Oversikt</h2>
  <h3>Sammendrag</h3>
  ${summaryHtml}

  <h3>Kategorier</h3>
  <table class="cats">
    <thead><tr><th>Kategori</th><th class="r">Vekt</th><th class="barcol">Poeng</th><th class="r">Resultat</th></tr></thead>
    <tbody>${p.categories.map((c) => `<tr>
      <td><b>${esc(c.name)}</b>${c.rating.cappedBy?.length ? `<br><small class="capnote">Begrenset: ${esc(c.rating.cappedBy[0].text)}</small>` : ""}</td>
      <td class="r muted">${c.rating.status === "ok" ? `${Math.round((c.weight / totalWeight) * 100)} %` : "–"}</td>
      <td class="barcol">${c.rating.status === "ok" ? bar(c.rating.score, 10) : `<span class="na">${esc(ratingWord(c.rating))}</span>`}</td>
      <td class="r">${c.rating.status === "ok" ? `<b class="score" style="color:${scoreColour(c.rating.score!)}">${c.rating.score}</b>` : "–"}</td>
    </tr>`).join("")}</tbody>
  </table>

  <h3>Perspektiver</h3>
  <p class="lead">Samme data, vektet for fire ulike behov.</p>
  <div class="persp">${p.perspectives.map((x) => {
    const pr = x.rating;
    const pulls = pr.factors.filter((f) => f.score < 60).slice(0, 3);
    return `<div class="pcard">
      <div class="phead"><span class="pname">${esc(x.name)}</span>${pr.status === "ok" ? `<span class="pscore" style="color:${scoreColour(pr.score!)}">${pr.score}</span>` : `<span class="na">${esc(ratingWord(pr))}</span>`}</div>
      <p class="pq">${esc(x.question)}</p>
      ${pr.status === "ok" ? bar(pr.score, 8) : ""}
      <p class="pull">${pulls.length ? `Trekker ned: ${pulls.map((f) => `${esc(f.label)} (${f.score})`).join(", ")}` : "Ingen datapunkter trekker tydelig ned."}</p>
    </div>`;
  }).join("")}</div>

</section>

<!-- ============ 3. Hazards ============ -->
<section class="page">
  <p class="kicker">Del 2</p><h2>Funn og faresoner</h2>
  <p class="lead">Kartet viser NVEs fare- og aktsomhetssoner rundt eiendommen (ca. ${KM.format((hazardMap.w * 156543 * Math.cos((a.lat * Math.PI) / 180)) / 2 ** hazardMap.z / 1000)} km bredt).</p>
  ${map(hazardMap, "topograatone", a.lng, a.lat, overlay)}
  <p class="legend">${zones.length ? zones.map((z) => `<i style="background:${z.colour};opacity:.6"></i>${esc(z.label)}`).join(" ") : "Ingen fare- eller aktsomhetssoner i kartutsnittet."} <span class="pin-legend">${PIN}</span>Eiendommen</p>

  <h3>Alle funn</h3>
  ${p.warnings.length ? `<ul class="warnings">${p.warnings.map(warningRow).join("")}</ul>` : `<p class="note">Ingen funn som gir advarsel.</p>`}
  <p class="note">Et funn kommer alltid fra et datapunkt med kilde, aldri fra AI. Alvorlige funn begrenser poengsummen, slik at én stor risiko ikke kan veies opp av gode forhold ellers.</p>
</section>

<!-- ============ 4. Categories ============ -->
<section class="page">
  <p class="kicker">Del 3</p><h2>Detaljer per kategori</h2>
  ${p.categories.map((c) => `<div class="cat">
    <div class="cat-head"><h3>${esc(c.name)}</h3>${scoreBadge(c.rating)}</div>
    <p class="cat-sub">${c.rating.status === "ok" ? esc(ratingWord(c.rating)) : esc(c.rating.reason ?? "")} · ${c.dataPoints.length} av ${c.dataPoints.length + c.missing.length} datapunkter</p>
    ${c.dataPoints.map(pointRow).join("")}${c.missing.map(missingRow).join("")}
  </div>`).join("")}
</section>

<!-- ============ 5. Questions ============ -->
<section class="page">
  <p class="kicker">Del 4</p><h2>Spørsmål å stille</h2>
  <p class="lead">Før visning eller bud: spørsmål til selger, megler eller kommunen, ut fra funnene i rapporten.</p>
  ${qs.length ? qs.map((q) => `<div class="qgroup"><p class="qtopic"><b>${esc(q.topic)}</b> · ${esc(q.finding)}</p><ul class="checks">${q.items.map((i) => `<li><span class="box"></span>${esc(i)}</li>`).join("")}</ul></div>`).join("")
    : `<p class="note">Ingen funn i dataene som gir egne spørsmål.</p>`}
  <div class="qgroup"><p class="qtopic"><b>Alltid lurt</b></p><ul class="checks">
    <li><span class="box"></span>Be om tilstandsrapport og les hva den sier om fukt, drenering og grunnmur.</li>
    <li><span class="box"></span>Spør kommunen om reguleringsplaner og byggesaker for nabolaget.</li>
  </ul></div>
</section>

<!-- ============ 6. About ============ -->
<section class="page">
  <p class="kicker">Del 5</p><h2>Om rapporten</h2>
  <h3>Slik regner vi</h3>
  <p>Hver kategori får 0–100 poeng ut fra datapunktene vi har. Samlet vurdering er et vektet snitt av kategoriene som kan vurderes. Alvorlige funn setter et tak: poengsummen skaleres inn under taket (poeng × tak / 100), slik at én alvorlig risiko aldri kan veies opp av gode forhold ellers. Data vi mangler, teller aldri som godt.</p>
  <p>Poengsummen sier hva offentlige data vi har, forteller om stedet. Den er ikke en sikkerhetsvurdering, et prissignal eller et løfte om at en risiko ikke finnes.</p>

  <h3>Datagrunnlag</h3>
  <p class="lead">${present} av ${expected} datapunkter funnet. Hver rute er ett datapunkt; tomme ruter mangler.</p>
  <div class="coverage">${p.categories.map((c) => `<div class="covrow"><span>${esc(c.name)}</span><span class="cells">${
    c.dataPoints.map((d) => `<i style="background:${EFFECT[d.effect]}"></i>`).join("") + c.missing.map(() => `<i class="hollow"></i>`).join("")
  }</span><span class="muted">${c.dataPoints.length}/${c.dataPoints.length + c.missing.length}</span></div>`).join("")}</div>
  <p class="legend"><i style="background:${C.good}"></i>Positivt <i style="background:${C.bad}"></i>Negativt <i style="background:${C.unknown}"></i>Nøytralt / fakta <i class="hollow"></i>Mangler</p>

  ${allMissing.length ? `<h3>Manglende data</h3><table class="plain"><thead><tr><th>Datapunkt</th><th>Kategori</th><th>Hvorfor</th></tr></thead><tbody>${
    allMissing.map((m) => `<tr><td>${esc(m.label)}${m.importance === "critical" ? " <small class=\"crit\">kritisk</small>" : ""}</td><td>${esc(m.category)}</td><td>${MISSING[m.reason]}</td></tr>`).join("")
  }</tbody></table>` : ""}

  <h3>Kilder og lisenser</h3>
  <table class="plain sources"><thead><tr><th>Kilde</th><th>Eier</th><th>Lisens</th><th>Lenke</th></tr></thead><tbody>${
    p.sources.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.owner)}</td><td>${esc(x.licence)}</td><td class="url"><a href="${esc(x.url)}">${esc(x.url.replace(/^https?:\/\//, ""))}</a></td></tr>`).join("")
  }</tbody></table>
  <p class="note">Kartgrunnlag © Kartverket. Laget av Omnium ${esc(date)} fra adresseprofil versjon ${p.version}. Data kan ha endret seg etter denne datoen.</p>
</section>
</body></html>`;
}

const CSS = `
@page { size: A4; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 9.5pt/1.5 "IBM Plex Sans", "Segoe UI", sans-serif; color: ${C.ink}; font-variant-numeric: tabular-nums; }
h1, h2, h3, .num, .summary, .pscore, .badge b, .score { font-family: "Source Serif 4", Georgia, serif; }
h1 { font-size: 30pt; line-height: 1.1; margin: 2mm 0 1mm; font-weight: 700; }
h2 { font-size: 22pt; margin: 0 0 4mm; font-weight: 700; border-bottom: 2.5px solid ${C.ink}; padding-bottom: 2mm; }
h3 { font-size: 13pt; margin: 7mm 0 2.5mm; font-weight: 600; border-top: 1px solid ${C.ink}; padding-top: 2mm; }
h3.mini { font-size: 11pt; margin-top: 5mm; }
p { margin: 0 0 2mm; }
.page { break-before: page; }
/* Nothing may hang below a section's last element: even 1 px spilled over a forced page break makes an empty page. */
.page > :last-child, .page > :last-child > :last-child { margin-bottom: 0 !important; padding-bottom: 0 !important; }
h2 + h3 { border-top: 0; padding-top: 0; margin-top: 3mm; } /* no double rule under a section title */
.kicker { text-transform: uppercase; letter-spacing: .14em; font-size: 7.5pt; font-weight: 600; color: ${C.teal}; margin: 0 0 1mm; }
.lead { color: ${C.muted}; margin-bottom: 3mm; }
.note { color: ${C.muted}; font-size: 8pt; margin-top: 2mm; }
.muted { color: ${C.muted}; }
.na { color: ${C.muted}; font-size: 8.5pt; font-style: italic; }
.label { text-transform: uppercase; letter-spacing: .1em; font-size: 7pt; font-weight: 600; color: ${C.muted}; }
.mono { font-family: Consolas, monospace; font-size: 8pt; }
.r { text-align: right; }

/* cover */
.masthead { display: flex; justify-content: space-between; align-items: flex-end; }
.brand { display: flex; align-items: center; gap: 3mm; }
.brand span { font: 700 22pt/1 "Source Serif 4", Georgia, serif; letter-spacing: -.01em; }
.logo { height: 13mm; clip-path: circle(47.5% at 50% 50%); } /* cuts the off-white rim of logo-mark.png */
.meta { text-align: right; font-size: 8pt; color: ${C.muted}; line-height: 1.5; }
.meta b { color: ${C.ink}; text-transform: uppercase; letter-spacing: .12em; }
.rule { border-top: 3px solid ${C.ink}; margin: 3mm 0 6mm; }
.sub { color: ${C.muted}; font-size: 10.5pt; margin-bottom: 5mm; }
.verdict { display: grid; grid-template-columns: 1.35fr 1fr; gap: 8mm; margin-top: 6mm; border-top: 2.5px solid ${C.ink}; padding-top: 4mm; }
.num { font-size: 54pt; font-weight: 700; line-height: 1; margin: 1mm 0; }
.num small { font-size: 16pt; color: ${C.muted}; font-weight: 400; margin-left: 1mm; }
.word { font-size: 12pt; font-weight: 600; margin-bottom: 3mm; }
.facts-col p { border-top: 1px solid ${C.line}; padding-top: 2mm; margin-bottom: 3mm; }
.facts-col p:first-child { border-top: 0; padding-top: 0; }
.scale { position: relative; height: 9mm; }
.bands { display: flex; height: 2.2mm; gap: 1px; }
.marker { position: absolute; top: -1.4mm; width: 3px; height: 5mm; background: ${C.ink}; transform: translateX(-50%); }
.ticks { position: relative; font-size: 6.5pt; color: ${C.muted}; margin-top: 1mm; height: 3mm; }
.ticks span { position: absolute; transform: translateX(-50%); }
.ticks span:first-child { transform: none; } .ticks span:last-child { transform: none; }
.disclaimer { margin-top: 6mm; font-size: 7.5pt; color: ${C.muted}; border-top: 1px solid ${C.line}; padding-top: 2mm; }

/* maps */
.map { position: relative; overflow: hidden; background: #f7efe3; border: 1px solid ${C.ink}; }
.map .tiles img { position: absolute; width: ${TILE}px; height: ${TILE}px; }
.map.topo .tiles { filter: saturate(.75) contrast(.92) brightness(1.03); }
.map.topograatone .tiles { opacity: .85; }
.overlay { position: absolute; inset: 0; }
.pin-at { position: absolute; transform: translate(-50%, -100%); }
.pin-at .pin { display: block; }
.map-credit { position: absolute; right: 0; bottom: 0; background: rgba(255,255,255,.85); font-size: 6.5pt; padding: .5mm 1.5mm; color: ${C.muted}; }

/* warnings */
.warnings { list-style: none; padding: 0; margin: 0; }
.warnings li { display: grid; grid-template-columns: 17mm 1fr auto; gap: 3mm; align-items: baseline; padding: 1.8mm 0; border-bottom: 1px solid ${C.line}; }
.sev { color: #fff; font-size: 7pt; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; text-align: center; padding: .4mm 0; border-radius: 1px; }
.w-text { font-weight: 500; }
.w-cat { color: ${C.muted}; font-size: 8pt; }

/* summary */
.summary { font-size: 11pt; line-height: 1.55; }
.facts { padding-left: 5mm; margin: 0; } .facts li { margin-bottom: 1mm; }

/* bars and tables */
.bar { background: ${C.line}; width: 100%; border-radius: 1px; overflow: hidden; }
.bar > div { height: 100%; }
.bar.empty { background: repeating-linear-gradient(90deg, ${C.line} 0 3px, transparent 3px 6px); }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; color: ${C.muted}; font-weight: 600; padding: 1mm 0; border-bottom: 1px solid ${C.ink}; }
td { padding: 1.6mm 0; border-bottom: 1px solid ${C.line}; vertical-align: middle; }
.cats td:first-child { width: 38%; } .cats .barcol { width: 40%; padding: 0 5mm; } .cats .score { font-size: 14pt; }
.capnote { color: ${C.bad}; }
.plain td { font-size: 8.5pt; padding: 1.4mm 2mm 1.4mm 0; }
.sources .url { font-size: 7pt; word-break: break-all; }
.sources .url a { color: ${C.teal}; text-decoration: none; }
.crit { color: ${C.bad}; font-weight: 600; }

/* perspectives */
.persp { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; }
.pcard { border-top: 2px solid ${C.ink}; padding-top: 2mm; }
.phead { display: flex; justify-content: space-between; align-items: baseline; }
.pname { font-weight: 600; font-size: 11pt; }
.pscore { font-size: 18pt; font-weight: 700; }
.pcard .pname { font-size: 10pt; }
.pq { color: ${C.muted}; font-size: 8pt; margin-bottom: 2mm; }
.pull { font-size: 7.5pt; margin-top: 2mm; color: ${C.muted}; line-height: 1.4; }

/* coverage */
.covrow { display: grid; grid-template-columns: 45mm 1fr 12mm; align-items: center; padding: 1.2mm 0; border-bottom: 1px solid ${C.line}; }
.cells { display: flex; gap: 1.2mm; }
.cells i, .legend i { display: inline-block; width: 3.2mm; height: 3.2mm; border-radius: 1px; }
i.hollow { border: 1px solid ${C.unknown}; background: transparent !important; }
.legend { font-size: 8pt; color: ${C.muted}; margin-top: 2mm; display: flex; flex-wrap: wrap; align-items: center; gap: 1.5mm 2mm; }
.legend i { vertical-align: middle; margin-left: 2mm; }
.pin-legend svg { width: 9px; height: 13px; vertical-align: middle; margin-left: 2mm; }

/* categories */
.cat { margin-bottom: 5mm; }
.cat-head { display: flex; justify-content: space-between; align-items: center; border-top: 2.5px solid ${C.ink}; margin-top: 6mm; padding-top: 2mm; break-after: avoid; }
.cat-head h3 { border: 0; margin: 0; padding: 0; font-size: 15pt; }
.cat-sub { color: ${C.muted}; font-size: 8.5pt; break-after: avoid; }
.badge { border: 2px solid; padding: .5mm 2.5mm; font-size: 9pt; }
.badge b { font-size: 14pt; } .badge small { color: ${C.muted}; }
.badge.muted { border-color: ${C.line}; color: ${C.muted}; font-style: italic; }
.dp { padding: 2.2mm 0; border-bottom: 1px solid ${C.line}; break-inside: avoid; }
.dp-head { display: grid; grid-template-columns: 4mm 44mm 1fr 30mm; gap: 2mm; align-items: baseline; }
.dot { width: 2.6mm; height: 2.6mm; border-radius: 50%; display: inline-block; }
.dot.hollow { border: 1px solid ${C.unknown}; }
.dp-label { font-weight: 600; }
.dp-score { display: flex; align-items: center; gap: 2mm; justify-content: flex-end; }
.dp-score .bar { width: 18mm; }
.dp-score b { width: 6mm; text-align: right; }
.dp-warn { margin: 1.2mm 0 0 6mm; padding-left: 2mm; border-left: 2.5px solid; font-weight: 500; font-size: 8.5pt; }
.dp-expl { margin: 1.2mm 0 0 6mm; color: ${C.muted}; font-size: 8pt; line-height: 1.45; }
.dp-src { margin: .8mm 0 0 6mm; color: ${C.muted}; font-size: 7pt; }
.missing .dp-label, .missing .dp-value { color: ${C.unknown}; }

/* questions */
.qgroup { margin-bottom: 4mm; break-inside: avoid; }
.qtopic { border-bottom: 1px solid ${C.ink}; padding-bottom: 1mm; margin-bottom: 1.5mm; }
.checks { list-style: none; padding: 0; margin: 0; }
.checks li { display: grid; grid-template-columns: 6mm 1fr; padding: 1.4mm 0; border-bottom: 1px dotted ${C.line}; }
.box { width: 3.4mm; height: 3.4mm; border: 1.2px solid ${C.ink}; margin-top: .6mm; }
`;

const HEADER = (address: string) => `<div style="width:100%;font:7pt 'Segoe UI',sans-serif;color:${C.muted};padding:0 16mm;display:flex;justify-content:space-between;letter-spacing:.06em">
  <span><b style="color:${C.ink}">OMNIUM</b> · EIENDOMSRAPPORT</span><span>${esc(address)}</span></div>`;
const FOOTER = `<div style="width:100%;font:7pt 'Segoe UI',sans-serif;color:${C.muted};padding:0 16mm;display:flex;justify-content:space-between">
  <span>Offentlige data. Ikke en tilstandsrapport eller takst.</span><span>Side <span class="pageNumber"></span> av <span class="totalPages"></span></span></div>`;

async function reportHtml(id: string) {
  const [profile, summary] = await Promise.all([buildProfile(id), buildSummary(id)]);
  const a = profile.address;
  const zones = await hazardZones(frame(a.lng, a.lat, 15, 672, 400));
  return { html: render(profile, summary, zones), addressId: a.id, title: `${a.text}, ${a.postcode} ${titleCase(a.place)}` };
}

/** The report as a PDF. Throws the same 400/404/503 errors as the profile. */
export async function buildReport(id: string): Promise<{ pdf: Uint8Array; addressId: string }> {
  const { html, addressId, title } = await reportHtml(id);
  const pdf = await htmlToPdf(html, { header: HEADER(title), footer: FOOTER });
  return { pdf, addressId };
}

// Printed by the visitor's own browser instead of our Chromium (hosts with too little memory, docs/REPORT.md).
// On screen: the A4 pages on grey with a print button. In print: page margins, the toolbar hidden.
const PAGE_CSS = `
@page { margin: 20mm 16mm 18mm; }
@media screen {
  html { background: #e9e6df; }
  body { max-width: 210mm; margin: 0 auto; padding: 16mm; background: #fff; }
  .print-bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 3mm; align-items: center; justify-content: space-between;
    max-width: 210mm; margin: 0 auto; padding: 3mm 16mm; background: ${C.ink}; color: #fff; font: 10pt "IBM Plex Sans", sans-serif; }
  .print-bar button { font: inherit; font-weight: 600; padding: 1.5mm 4mm; border: 0; border-radius: 4px; background: #fff; color: ${C.ink}; cursor: pointer; }
}
@media print { .print-bar { display: none; } }`;

/** The report as a printable HTML page; the browser's print dialog saves it as PDF. `print` opens the dialog on load. */
export async function buildReportPage(id: string, print: boolean): Promise<string> {
  const { html, title } = await reportHtml(id);
  const bar = `<div class="print-bar"><span>Omnium-rapport · ${esc(title)}</span><button type="button" onclick="print()">Lagre som PDF / skriv ut</button></div>`;
  // Wait for map tiles (load) and web fonts before the dialog, or the PDF prints half-empty.
  const script = print ? `<script>addEventListener("load", () => document.fonts.ready.then(() => setTimeout(print, 300)));</script>` : "";
  return html
    .replace("</head>", `<title>Omnium-rapport · ${esc(title)}</title><style>${PAGE_CSS}</style>${script}</head>`)
    .replace("<body>", `<body>${bar}`);
}
