import { Hono } from "hono";
import { buildProfile } from "../profile.ts";
import { buildReport, buildReportPage } from "../report.ts";
import { buildSummary } from "../summary.ts";

// GET /api/address/:id/profile -> the address profile (docs/PROFILE.md). Id format: docs/PROFILE.md -> "Address id".
// GET /api/address/:id/summary -> AI summary + the fact sentences behind it (PLAN.md -> "AI summary").
// GET /api/address/:id/report.pdf -> Omnium Rapport as a PDF (docs/REPORT.md). The one non-JSON response.
//     ?download=1 makes the browser save it instead of opening it. Errors are still JSON.
//     With REPORT_PRINT=browser (small hosts) it redirects to report.html?print instead.
// GET /api/address/:id/report.html -> the same report as a page the visitor's browser prints to PDF (?print opens the dialog).
export default new Hono()
  .get("/:id/profile", async (c) => c.json(await buildProfile(c.req.param("id"))))
  .get("/:id/summary", async (c) => c.json(await buildSummary(c.req.param("id"))))
  .get("/:id/report.html", async (c) => c.html(await buildReportPage(c.req.param("id"), c.req.query("print") !== undefined)))
  .get("/:id/report.pdf", async (c) => {
    // Small hosts can't run Chromium next to the database: send the visitor to the page their own browser prints.
    if (process.env.REPORT_PRINT === "browser") return c.redirect(`report.html?print`, 302);
    const { pdf, addressId } = await buildReport(c.req.param("id"));
    const disposition = c.req.query("download") ? "attachment" : "inline";
    return c.body(pdf as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="omnium-rapport-${addressId}.pdf"`,
    });
  });
