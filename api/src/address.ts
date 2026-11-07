import { HTTPException } from "hono/http-exception";

// Address ids and lookup. Standard: docs/PROFILE.md -> "Address id".
// Id = <kommunenummer>-<adressekode>-<nummer><bokstav>, e.g. "0301-10223-22" or "0301-13729-64A".
// All four parts come straight from a Geonorge adresser/v1/sok result.

const API = "https://ws.geonorge.no/adresser/v1/sok";
const ID_RE = /^(\d{4})-(\d{1,6})-(\d{1,5})([A-Za-z]?)$/;

export interface Address {
  id: string;
  text: string;
  postcode: string;
  place: string;
  municipality: string;
  municipalityNumber: string;
  gnr?: number;
  bnr?: number;
  lng: number;
  lat: number;
}

const cache = new Map<string, Address>();

/** Look up an address id at Geonorge. Throws 400 (bad id), 404 (no such address) or 503 (Geonorge down). */
export async function lookupAddress(rawId: string): Promise<Address> {
  const m = ID_RE.exec(rawId);
  if (!m) {
    throw new HTTPException(400, {
      message: `Bad address id '${rawId}'. Expected <kommunenummer>-<adressekode>-<nummer><bokstav>, e.g. 0301-10223-22`,
    });
  }
  const [, kommunenummer, adressekode, nummer, bokstav] = m;
  const id = `${kommunenummer}-${Number(adressekode)}-${Number(nummer)}${bokstav.toUpperCase()}`;
  const hit = cache.get(id);
  if (hit) return hit;

  const url = `${API}?kommunenummer=${kommunenummer}&adressekode=${adressekode}&nummer=${nummer}&utkoordsys=4326&treffPerSide=50`;
  let body: any;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "GeoMap-hackathon" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    body = await res.json();
  } catch (err) {
    throw new HTTPException(503, { message: `Geonorge address search is not responding: ${(err as Error).message}` });
  }

  // Without a letter Geonorge also returns 64A, 64B...: match the letter exactly.
  const a = (body.adresser ?? []).find((x: any) => (x.bokstav ?? "").toUpperCase() === bokstav.toUpperCase());
  if (!a) throw new HTTPException(404, { message: `No address with id '${id}'` });

  const address: Address = {
    id,
    text: a.adressetekst,
    postcode: a.postnummer,
    place: a.poststed,
    municipality: a.kommunenavn,
    municipalityNumber: a.kommunenummer,
    ...(a.gardsnummer != null && { gnr: a.gardsnummer }),
    ...(a.bruksnummer != null && { bnr: a.bruksnummer }),
    lng: a.representasjonspunkt.lon,
    lat: a.representasjonspunkt.lat,
  };
  cache.set(id, address);
  return address;
}
