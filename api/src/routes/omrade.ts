import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { compareWithArea } from "../area.ts";
import { buildProfile } from "../profile.ts";

// GET /api/omrade/:id -> how one address compares with the other street addresses in its grunnkrets and kommune.
// Response: { addressId, score, computedAt, grunnkrets?, kommune? } with each area
//   { id, name, addresses, medianScore, percentile, histogram }. When the address itself has no score: score null + reason,
//   and areas without percentile. Rules (percentile, minimum size, histogram bins): api/src/area.ts.
export default new Hono().get("/:id", async (c) => {
  const result = await compareWithArea(await buildProfile(c.req.param("id")));
  if (!result) throw new HTTPException(503, { message: "Area scores are not built yet. Run: npm run scores" });
  return c.json(result);
});
