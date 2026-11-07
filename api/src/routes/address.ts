import { Hono } from "hono";
import { buildProfile } from "../profile.ts";
import { buildReport } from "../report.ts";
import { buildSummary } from "../summary.ts";

// GET /api/address/:id/profile -> the address profile (docs/PROFILE.md). Id format: docs/PROFILE.md -> "Address id".
// GET /api/address/:id/summary -> AI summary + the fact sentences behind it (PLAN.md -> "AI summary").
// GET /api/address/:id/report.pdf -> Omnium Rapport as a PDF (docs/REPORT.md). The one non-JSON response.
//     ?download=1 makes the browser save it instead of opening it. Errors are still JSON.
export default new Hono()
  .get("/:id/profile", async (c) => c.json(await buildProfile(c.req.param("id"))))
  .get("/:id/summary", async (c) => c.json(await buildSummary(c.req.param("id"))))
  .get("/:id/report.pdf", async (c) => {
    const { pdf, addressId } = await buildReport(c.req.param("id"));
    const disposition = c.req.query("download") ? "attachment" : "inline";
    return c.body(pdf as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="omnium-rapport-${addressId}.pdf"`,
    });
  });
